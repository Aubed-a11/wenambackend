const jwt = require('jsonwebtoken');
const User = require('../models/User');
const TicketOrder = require('../models/TicketOrder');
const Ticket = require('../models/Ticket');
const TicketWaitlist = require('../models/TicketWaitlist');
const svc = require('../services/miawezon.service');
const ycp = require('../services/youcanpay');
const { qrDataUrl, ticketsPdf, ticketFields, parseScanned } = require('../services/ticketDocs');
const fs = require('fs');
const { sendTicketsEmail, sendTransferInstructions, sendProofReceived, sendAdminProofNotice } = require('../services/ticketMail');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s, max = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Identifie un admin connecte sur une route publique (sans bloquer les visiteurs)
async function optionalUser(req) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return null;
    const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    return user?.isActive ? user : null;
  } catch {
    return null;
  }
}

function emitSale(order) {
  try {
    const { getIO } = require('../config/socket');
    getIO().to('admins').emit('miawezon:sale', { orderNumber: order.orderNumber, total: order.total, quantity: order.quantity, buyer: order.buyer?.name });
  } catch { /* socket non initialise */ }
}

async function orderPayload(order, { withQr = true } = {}) {
  const tickets = order.status === 'paid' || order.status === 'cancelled'
    ? await Ticket.find({ order: order._id }).sort({ _id: 1 })
    : [];
  const ev = tickets.length ? await svc.getEvent() : null;
  const list = await Promise.all(tickets.map(async (t) => ({
    _id: t._id,
    number: t.number,
    holderName: t.holderName,
    categoryCode: t.categoryCode,
    categoryName: t.categoryName,
    status: t.status,
    checkedInAt: t.checkedInAt,
    qr: withQr && t.status !== 'cancelled' ? await qrDataUrl(t) : null,
    // Valeurs imprimees sur le modele (identiques au PDF)
    fields: ticketFields({ ticket: t, order, event: ev }),
  })));
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    buyer: order.buyer,
    lang: order.lang,
    items: order.items,
    quantity: order.quantity,
    total: order.total,
    currency: order.currency,
    expiresAt: order.expiresAt,
    createdAt: order.createdAt,
    paidAt: order.payment?.paidAt || null,
    proofUploadedAt: order.proof?.uploadedAt || null,
    rejectionReason: order.status === 'rejected' ? order.rejectionReason || '' : '',
    tickets: list,
  };
}

async function loadOrderWithToken(req) {
  const token = req.body?.token || req.query?.t || req.query?.token;
  let order = null;
  try {
    order = await TicketOrder.findById(req.params.id).select('+accessToken');
  } catch { /* id invalide */ }
  if (!order || !svc.tokenMatches(order, token)) {
    const err = new Error('Commande introuvable');
    err.statusCode = 404;
    throw err;
  }
  return { order, token };
}

// Mode de paiement expose au front
function paymentConfig(ev) {
  if ((ev.paymentMode || 'transfer') === 'transfer') {
    const accounts = (ev.bankAccounts || []).filter((b) => b && (b.rib || b.iban));
    return { provider: 'transfer', ready: accounts.length > 0, mock: false };
  }
  return ycp.publicConfig();
}

// Finalise une commande apres verification du paiement (utilise par confirm, webhook et admin)
async function finalizePayment(order, transactionId, { token } = {}) {
  if (order.status === 'paid') return { order, already: true };
  if (!['pending', 'expired', 'failed'].includes(order.status)) {
    throw Object.assign(new Error('Cette commande ne peut plus être payée'), { statusCode: 409, code: 'ORDER_CLOSED' });
  }

  const usedBy = await TicketOrder.findOne({ 'payment.transactionId': transactionId, _id: { $ne: order._id } }).select('_id');
  if (usedBy) throw Object.assign(new Error('Transaction déjà utilisée'), { statusCode: 409, code: 'TX_USED' });

  const result = await ycp.verifyTransaction(transactionId, order);
  if (result.status !== 'SUCCESS') {
    throw Object.assign(new Error('Paiement non validé par YouCan Pay'), { statusCode: 402, code: 'PAYMENT_FAILED', providerStatus: result.status });
  }
  if (result.orderId && result.orderId !== String(order._id)) {
    throw Object.assign(new Error('Cette transaction concerne une autre commande'), { statusCode: 402, code: 'PAYMENT_FAILED' });
  }
  if (Number(result.amount) < order.total) {
    await TicketOrder.updateOne({ _id: order._id }, { 'payment.transactionId': transactionId, 'payment.amount': result.amount, 'payment.raw': result.raw, status: 'refund_needed' });
    throw Object.assign(new Error('Montant payé insuffisant'), { statusCode: 402, code: 'AMOUNT_MISMATCH' });
  }

  // Paiement arrive apres expiration : on essaie de reprendre les places
  if (!order.seatsHeld) {
    const blocked = await svc.holdSeats(order.items);
    if (blocked) {
      await TicketOrder.updateOne({ _id: order._id }, {
        status: 'refund_needed',
        'payment.transactionId': transactionId,
        'payment.amount': result.amount,
        'payment.method': result.method,
        'payment.paidAt': new Date(),
        'payment.raw': result.raw,
      });
      throw Object.assign(new Error('Paiement reçu mais les places ne sont plus disponibles. Nous allons vous rembourser.'), { statusCode: 409, code: 'SOLD_OUT_AFTER_PAYMENT' });
    }
  }

  return markPaid(order, {
    'payment.transactionId': transactionId,
    'payment.amount': result.amount,
    'payment.method': result.method,
    'payment.raw': result.raw,
  }, { token, from: ['pending', 'expired', 'failed'] });
}

// Passe la commande en "payee", emet les billets et les envoie par e-mail
async function markPaid(order, fields, { token, from }) {
  const updated = await svc.transitionOrder(
    { _id: order._id, status: { $in: from } },
    { status: 'paid', seatsHeld: true, 'payment.paidAt': new Date(), ...fields }
  );

  if (!updated) {
    // Une autre requete a deja finalise la commande
    if (!order.seatsHeld) await svc.releaseSeats(order.items);
    const fresh = await TicketOrder.findById(order._id).select('+accessToken');
    return { order: fresh, already: true };
  }

  updated.accessToken = token || (await TicketOrder.findById(order._id).select('+accessToken'))?.accessToken;
  const tickets = await svc.issueTickets(updated);
  const ev = await svc.getEvent();
  emitSale(updated);

  sendTicketsEmail({ order: updated, tickets, event: ev, token: updated.accessToken })
    .then((sent) => sent && TicketOrder.updateOne({ _id: updated._id }, { emailSentAt: new Date() }))
    .catch((e) => console.error('MIAWEZON email:', e.message));

  return { order: updated, already: false };
}

// Validation d'un virement par l'admin (apres verification du reçu)
async function approveTransfer(order, adminId) {
  if (order.status === 'paid') return { order, already: true };
  if (!['awaiting_validation', 'pending'].includes(order.status)) {
    throw Object.assign(new Error('Cette commande ne peut plus être validée'), { statusCode: 409, code: 'ORDER_CLOSED' });
  }
  if (!order.seatsHeld) {
    const blocked = await svc.holdSeats(order.items);
    if (blocked) throw Object.assign(new Error('Plus assez de places pour valider cette commande'), { statusCode: 409, code: 'SOLD_OUT' });
  }
  return markPaid(order, {
    'payment.provider': 'transfer',
    'payment.method': 'Virement bancaire',
    'payment.amount': order.total,
    validatedAt: new Date(),
    validatedBy: adminId,
  }, { from: ['awaiting_validation', 'pending'] });
}

// ═══ PUBLIC ═════════════════════════════════════════════════════════════════

exports.getEvent = async (req, res, next) => {
  try {
    await svc.releaseExpired();
    const ev = await svc.getEvent();
    const user = await optionalUser(req);
    const isAdmin = user?.role === 'admin';
    if (!ev.published && !isAdmin) {
      return res.json({ event: { published: false }, categories: [], serverTime: new Date() });
    }
    const cats = await svc.getCategories(ev._id, { activeOnly: true });
    res.json({
      event: svc.publicEvent(ev),
      categories: cats.map(svc.publicCategory),
      serverTime: new Date(),
      payment: paymentConfig(ev),
      preview: !ev.published && isAdmin,
    });
  } catch (err) { next(err); }
};

exports.joinWaitlist = async (req, res, next) => {
  try {
    const email = clean(req.body.email, 160).toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Adresse e-mail invalide', code: 'INVALID_EMAIL' });
    const ev = await svc.getEvent();
    await TicketWaitlist.updateOne(
      { event: ev._id, email },
      { $setOnInsert: { event: ev._id, email, name: clean(req.body.name, 80), lang: req.body.lang === 'en' ? 'en' : 'fr' } },
      { upsert: true }
    );
    res.json({ message: 'Inscription enregistrée' });
  } catch (err) { next(err); }
};

exports.createOrder = async (req, res, next) => {
  try {
    await svc.releaseExpired();
    const ev = await svc.getEvent();
    const user = await optionalUser(req);
    if (!ev.published && user?.role !== 'admin') return res.status(404).json({ message: 'Billetterie indisponible', code: 'NOT_PUBLISHED' });
    if (svc.salesState(ev) !== 'open') return res.status(403).json({ message: 'La billetterie n\'est pas ouverte', code: 'SALES_CLOSED' });
    if (!paymentConfig(ev).ready) return res.status(503).json({ message: 'Le paiement n\'est pas encore configuré', code: 'PAYMENT_NOT_READY' });

    const buyer = {
      name: clean(req.body.buyer?.name, 80),
      phone: clean(req.body.buyer?.phone, 30),
      email: clean(req.body.buyer?.email, 160).toLowerCase(),
    };
    if (buyer.name.length < 2) return res.status(400).json({ message: 'Nom requis', code: 'INVALID_NAME' });
    if (!/^\+?[0-9 ()-]{8,20}$/.test(buyer.phone)) return res.status(400).json({ message: 'Téléphone invalide', code: 'INVALID_PHONE' });
    if (!EMAIL_RE.test(buyer.email)) return res.status(400).json({ message: 'Adresse e-mail invalide', code: 'INVALID_EMAIL' });

    const cats = await svc.getCategories(ev._id, { activeOnly: true });
    const byId = new Map(cats.map((c) => [String(c._id), c]));
    const merged = new Map();
    for (const it of Array.isArray(req.body.items) ? req.body.items : []) {
      const c = byId.get(String(it.category));
      const q = parseInt(it.quantity, 10);
      if (!c || !Number.isFinite(q) || q < 1) continue;
      merged.set(String(c._id), (merged.get(String(c._id)) || 0) + q);
    }
    const items = [...merged.entries()].map(([id, quantity]) => {
      const c = byId.get(id);
      return { category: c._id, code: c.code, name: c.name, unitPrice: c.price, quantity };
    });
    const quantity = items.reduce((s, i) => s + i.quantity, 0);
    if (quantity === 0) return res.status(400).json({ message: 'Choisissez au moins un billet', code: 'EMPTY' });
    if (quantity > ev.maxTicketsPerOrder) return res.status(400).json({ message: `Maximum ${ev.maxTicketsPerOrder} billets par commande`, code: 'TOO_MANY' });

    const rawHolders = Array.isArray(req.body.holders) ? req.body.holders : [];
    const holders = Array.from({ length: quantity }, (_, i) => clean(rawHolders[i], 80) || buyer.name);

    const order = await svc.createOrder({ ev, items, buyer, holders, lang: req.body.lang === 'en' ? 'en' : 'fr', userId: user?._id });
    if ((ev.paymentMode || 'transfer') === 'transfer') {
      sendTransferInstructions({ order, event: ev, token: order.accessToken }).catch((e) => console.error('MIAWEZON email:', e.message));
    }
    res.status(201).json({
      order: await orderPayload(order),
      token: order.accessToken,
      payment: paymentConfig(ev),
    });
  } catch (err) {
    if (err.code === 'SOLD_OUT') return res.status(409).json({ message: err.message, code: 'SOLD_OUT', category: err.category });
    next(err);
  }
};

exports.getOrder = async (req, res, next) => {
  try {
    const { order } = await loadOrderWithToken(req);
    if (order.status === 'pending' && order.expiresAt < new Date()) {
      await svc.releaseExpired();
      return res.json({ order: await orderPayload(await TicketOrder.findById(order._id)) });
    }
    res.json({ order: await orderPayload(order) });
  } catch (err) { next(err); }
};

exports.confirmOrder = async (req, res, next) => {
  try {
    const { order, token } = await loadOrderWithToken(req);
    const transactionId = clean(req.body.transactionId, 120);
    if (!transactionId) return res.status(400).json({ message: 'Identifiant de transaction manquant', code: 'NO_TX' });
    const { order: paid } = await finalizePayment(order, transactionId, { token });
    res.json({ order: await orderPayload(paid) });
  } catch (err) {
    if (typeof err.code === 'string') return res.status(err.statusCode || 400).json({ message: err.message, code: err.code });
    next(err);
  }
};

exports.cancelPending = async (req, res, next) => {
  try {
    const { order } = await loadOrderWithToken(req);
    const o = await svc.transitionOrder({ _id: order._id, status: 'pending', seatsHeld: true }, { status: 'cancelled', seatsHeld: false });
    if (o) await svc.releaseSeats(o.items);
    res.json({ message: 'Commande annulée' });
  } catch (err) { next(err); }
};

exports.downloadPdf = async (req, res, next) => {
  try {
    const { order } = await loadOrderWithToken(req);
    if (order.status !== 'paid') return res.status(409).json({ message: 'Billets non disponibles', code: 'NOT_PAID' });
    const tickets = await Ticket.find({ order: order._id, status: { $ne: 'cancelled' } }).sort({ _id: 1 });
    const ev = await svc.getEvent();
    const pdf = await ticketsPdf({ order, tickets, event: ev });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="Billets-MIAWEZON-${order.orderNumber}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
};

// Lance le paiement YouCan Pay : renvoie l'URL de la page de paiement securisee.
// Au retour, le client revient sur /miawezon/reserver avec ?ycp=success ou ?ycp=error.
exports.startPayment = async (req, res, next) => {
  try {
    const { order, token } = await loadOrderWithToken(req);
    if (order.status === 'paid') return res.json({ paid: true });
    if (order.status !== 'pending' || order.expiresAt < new Date()) {
      return res.status(409).json({ message: 'Le délai de paiement est dépassé', code: 'ORDER_CLOSED' });
    }
    const cfg = ycp.publicConfig();
    if (cfg.mock) return res.json({ mock: true });
    const front = (process.env.FRONTEND_URL || 'https://www.wenamfood.com').replace(/\/$/, '');
    const back = (r) => `${front}/miawezon/reserver?order=${order._id}&t=${token}&ycp=${r}`;
    const { tokenId, paymentUrl } = await ycp.createPayment({
      order,
      ip: req.ip,
      successUrl: back('success'),
      errorUrl: back('error'),
      lang: req.body?.lang === 'en' ? 'en' : 'fr',
    });
    await TicketOrder.updateOne({ _id: order._id }, { 'payment.provider': 'youcanpay', 'payment.tokenId': tokenId });
    res.json({ paymentUrl });
  } catch (err) {
    if (typeof err.code === 'string') return res.status(err.statusCode || 400).json({ message: err.message, code: err.code });
    next(err);
  }
};

// Webhook YouCan Pay (paiement confirme meme si le client ferme la page).
// Dans le tableau de bord YouCan Pay : URL = https://api.wenamfood.com/api/miawezon/webhook/youcanpay
// La signature (X-Youcanpay-Signature) est verifiee avec la cle privee ; la transaction est
// ensuite revalidee aupres de l'API avant d'emettre les billets.
exports.youcanpayWebhook = async (req, res) => {
  try {
    if (!ycp.validWebhook(req.rawBody, req.headers['x-youcanpay-signature'])) {
      return res.status(401).json({ message: 'Signature invalide' });
    }
    const b = req.body || {};
    const p = b.payload || b.data || b;
    const tx = p.transaction || b.transaction || p;
    const transactionId = clean(tx?.id || p?.transaction_id || b.transaction_id, 120);
    const orderRef = clean(tx?.order_id || p?.order_id || p?.metadata?.orderId, 60);
    if (!transactionId) return res.json({ ok: true });

    let order = await TicketOrder.findOne({ 'payment.transactionId': transactionId }).select('+accessToken');
    if (!order && /^[a-f0-9]{24}$/i.test(orderRef)) order = await TicketOrder.findById(orderRef).select('+accessToken');
    if (order && order.status !== 'paid') {
      await finalizePayment(order, transactionId).catch((e) => console.error('MIAWEZON webhook:', e.message));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('MIAWEZON webhook:', err.message);
    res.json({ ok: true });
  }
};

// Le client envoie son reçu de virement (PDF ou image)
exports.submitProof = async (req, res, next) => {
  const removeUpload = () => { if (req.file?.path) fs.unlink(req.file.path, () => {}); };
  try {
    const { order } = await loadOrderWithToken(req);
    if (!req.file) return res.status(400).json({ message: 'Ajoutez votre reçu de virement (PDF ou image)', code: 'NO_FILE' });
    if (String(req.body.confirm) !== 'true') { removeUpload(); return res.status(400).json({ message: 'Confirmez avoir effectué le virement', code: 'NOT_CONFIRMED' }); }
    if (!['pending', 'awaiting_validation'].includes(order.status) || (order.status === 'pending' && order.expiresAt < new Date())) {
      removeUpload();
      return res.status(409).json({ message: 'Le délai pour envoyer le reçu est dépassé', code: 'ORDER_CLOSED' });
    }
    const previous = await TicketOrder.findById(order._id).select('+proof.file');
    const proof = {
      file: req.file.filename,
      originalName: String(req.file.originalname || 'recu').slice(0, 120),
      mime: req.file.mimetype,
      size: req.file.size,
      reference: clean(req.body.reference, 80),
      uploadedAt: new Date(),
    };
    const updated = await svc.transitionOrder(
      { _id: order._id, status: { $in: ['pending', 'awaiting_validation'] } },
      { status: 'awaiting_validation', proof }
    );
    if (!updated) { removeUpload(); return res.status(409).json({ message: 'La commande a changé, rechargez la page', code: 'ORDER_CLOSED' }); }
    if (previous?.proof?.file && previous.proof.file !== proof.file) fs.unlink(PROOF_PATH(previous.proof.file), () => {});

    // Notification du tableau de bord en temps reel
    try {
      const { getIO } = require('../config/socket');
      // Pas de donnees personnelles dans l'evenement (la salle admins n'est pas authentifiee)
      getIO().to('admins').emit('miawezon:proof', { _id: updated._id, orderNumber: updated.orderNumber, total: updated.total });
    } catch { /* socket non initialise */ }

    const ev = await svc.getEvent();
    sendProofReceived({ order: updated, event: ev }).catch((e) => console.error('MIAWEZON email:', e.message));
    sendAdminProofNotice({ order: updated, proofPath: PROOF_PATH(proof.file), proofName: proof.originalName, proofMime: proof.mime })
      .catch((e) => console.error('MIAWEZON email admin:', e.message));

    res.json({ order: await orderPayload(updated) });
  } catch (err) {
    removeUpload();
    next(err);
  }
};

const PROOF_DIR = require('path').join(__dirname, '../../private/miawezon-proofs');
const PROOF_PATH = (name) => require('path').join(PROOF_DIR, require('path').basename(name));
exports.PROOF_DIR = PROOF_DIR;
exports.PROOF_PATH = PROOF_PATH;
exports.approveTransfer = approveTransfer;
exports.finalizePayment = finalizePayment;
exports.orderPayload = orderPayload;

// Page publique d'un billet (ouverte en scannant son QR code avec n'importe quel telephone).
// Le code est secret et non devinable ; on n'expose ni e-mail ni telephone.
exports.verifyTicket = async (req, res, next) => {
  try {
    const code = parseScanned(req.params.code);
    if (!/^[A-Z0-9]{6,32}$/.test(code)) return res.status(404).json({ message: 'Billet introuvable', code: 'NOT_FOUND' });
    const ticket = await Ticket.findOne({ code });
    if (!ticket) return res.status(404).json({ message: 'Billet introuvable', code: 'NOT_FOUND' });
    const order = await TicketOrder.findById(ticket.order).select('orderNumber lang items status');
    const ev = await svc.getEvent();
    res.json({
      ticket: {
        number: ticket.number,
        holderName: ticket.holderName,
        categoryCode: ticket.categoryCode,
        categoryName: ticket.categoryName,
        status: ticket.status,
        checkedInAt: ticket.checkedInAt || null,
        fields: order ? ticketFields({ ticket, order, event: ev }) : {},
      },
      event: svc.publicEvent(ev),
    });
  } catch (err) { next(err); }
};
