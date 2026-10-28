const { parseScanned } = require('../services/ticketDocs');
const TicketEvent = require('../models/TicketEvent');
const TicketCategory = require('../models/TicketCategory');
const TicketOrder = require('../models/TicketOrder');
const Ticket = require('../models/Ticket');
const TicketWaitlist = require('../models/TicketWaitlist');
const svc = require('../services/miawezon.service');
const ycp = require('../services/youcanpay');
const { sendTicketsEmail, sendWaitlistEmail } = require('../services/ticketMail');
const fs = require('fs');
const { finalizePayment, orderPayload, approveTransfer, PROOF_PATH } = require('./miawezon.controller');
const { sendRejected } = require('../services/ticketMail');

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' }) : '');

// ─── Configuration ───────────────────────────────────────────────────────────

exports.getConfig = async (req, res, next) => {
  try {
    await svc.releaseExpired();
    const ev = await svc.getEvent();
    const cats = await svc.getCategories(ev._id);
    res.json({
      event: { ...svc.publicEvent(ev), _id: ev._id },
      categories: cats.map(svc.publicCategory),
      payment: { ...ycp.publicConfig(), configured: ycp.isConfigured() },
      holdMinutes: svc.HOLD_MINUTES,
    });
  } catch (err) { next(err); }
};

const parseDate = (v) => {
  if (v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const bi = (v) => ({ fr: String(v?.fr ?? '').trim().slice(0, 200), en: String(v?.en ?? '').trim().slice(0, 200) });

exports.updateEvent = async (req, res, next) => {
  try {
    const ev = await svc.getEvent();
    const b = req.body || {};
    const set = {};
    if (typeof b.published === 'boolean') set.published = b.published;
    if (typeof b.menuFinal === 'boolean') set.menuFinal = b.menuFinal;
    if (['auto', 'open', 'closed'].includes(b.salesMode)) set.salesMode = b.salesMode;
    for (const k of ['phase1At', 'salesOpenAt', 'salesCloseAt', 'eventDate']) {
      if (k in b) {
        const d = parseDate(b[k]);
        if (d === undefined) return res.status(400).json({ message: `Date invalide : ${k}` });
        if (k === 'salesOpenAt' && !d) return res.status(400).json({ message: 'La date d\'ouverture est obligatoire' });
        set[k] = d;
      }
    }
    for (const k of ['eventDateLabel', 'eventTimeLabel', 'venue']) if (k in b) set[k] = bi(b[k]);
    for (const k of ['venueAddress', 'contactEmail', 'contactPhone']) if (k in b) set[k] = String(b[k] || '').trim().slice(0, 200);
    if (['transfer', 'youcanpay'].includes(b.paymentMode)) set.paymentMode = b.paymentMode;
    for (const k of ['proofDeadlineHours', 'validationHours']) {
      if (k in b) {
        const n = parseInt(b[k], 10);
        if (!(n >= 1 && n <= 168)) return res.status(400).json({ message: 'Les délais doivent être entre 1 et 168 heures' });
        set[k] = n;
      }
    }
    if (Array.isArray(b.bankAccounts)) {
      const txt = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
      set.bankAccounts = b.bankAccounts.slice(0, 4).map((x) => ({
        bank: txt(x?.bank, 80), holder: txt(x?.holder, 100), rib: txt(x?.rib, 40), iban: txt(x?.iban, 40), swift: txt(x?.swift, 15),
      }));
    }
    if ('maxTicketsPerOrder' in b) {
      const n = parseInt(b.maxTicketsPerOrder, 10);
      if (!(n >= 1 && n <= 50)) return res.status(400).json({ message: 'Maximum par commande entre 1 et 50' });
      set.maxTicketsPerOrder = n;
    }
    const updated = await TicketEvent.findByIdAndUpdate(ev._id, set, { new: true });
    res.json({ event: svc.publicEvent(updated) });
  } catch (err) { next(err); }
};

// Menu du buffet : remplace le menu complet
exports.updateMenu = async (req, res, next) => {
  try {
    const ev = await svc.getEvent();
    const input = Array.isArray(req.body?.menu) ? req.body.menu : null;
    if (!input) return res.status(400).json({ message: 'Menu manquant' });
    const cats = await svc.getCategories(ev._id);
    const codes = cats.map((c) => c.code);
    const txt = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const menu = svc.MENU_SECTIONS.map((key) => {
      const sec = input.find((s) => s && s.key === key) || { items: [] };
      const items = (Array.isArray(sec.items) ? sec.items : []).slice(0, 40).map((i) => ({
        name: { fr: txt(i?.name?.fr, 90), en: txt(i?.name?.en, 90) },
        desc: { fr: txt(i?.desc?.fr, 140), en: txt(i?.desc?.en, 140) },
        tiers: (Array.isArray(i?.tiers) ? i.tiers : []).map(String).filter((c) => codes.includes(c)),
      })).filter((i) => i.name.fr);
      return { key, items };
    });
    for (const s of menu) {
      const empty = s.items.find((i) => i.tiers.length === 0);
      if (empty) return res.status(400).json({ message: `« ${empty.name.fr} » doit être servi dans au moins un menu` });
    }
    const set = { menu };
    if (typeof req.body.menuFinal === 'boolean') set.menuFinal = req.body.menuFinal;
    const updated = await TicketEvent.findByIdAndUpdate(ev._id, set, { new: true });
    res.json({ event: svc.publicEvent(updated) });
  } catch (err) { next(err); }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const c = await TicketCategory.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Catégorie introuvable' });
    const b = req.body || {};
    if ('price' in b) {
      const p = Number(b.price);
      if (!(p >= 10)) return res.status(400).json({ message: 'Prix invalide (minimum 10 DH)' });
      c.price = Math.round(p);
    }
    if ('capacity' in b) {
      const n = parseInt(b.capacity, 10);
      if (!(n >= 0)) return res.status(400).json({ message: 'Nombre de places invalide' });
      if (n < c.reserved) return res.status(400).json({ message: `Impossible : ${c.reserved} places déjà réservées ou vendues` });
      // Mise a jour atomique pour ne pas ecraser une reservation concurrente
      const r = await TicketCategory.updateOne({ _id: c._id, reserved: { $lte: n } }, { capacity: n });
      if (!r.modifiedCount && c.capacity !== n) return res.status(409).json({ message: 'Des places viennent d\'être réservées, réessayez' });
      c.capacity = n;
    }
    if ('label' in b) c.label = bi(b.label);
    if ('name' in b && String(b.name).trim()) c.name = String(b.name).trim().slice(0, 40);
    if (typeof b.active === 'boolean') c.active = b.active;
    await TicketCategory.updateOne({ _id: c._id }, { price: c.price, label: c.label, name: c.name, active: c.active });
    const fresh = await TicketCategory.findById(c._id);
    res.json({ category: svc.publicCategory(fresh) });
  } catch (err) { next(err); }
};

// ─── Statistiques ────────────────────────────────────────────────────────────

exports.getStats = async (req, res, next) => {
  try {
    await svc.releaseExpired();
    const ev = await svc.getEvent();
    const cats = await svc.getCategories(ev._id);

    const [revenueAgg, byStatus, ticketAgg, checkAgg, daily, recent, waitlist] = await Promise.all([
      TicketOrder.aggregate([{ $match: { event: ev._id, status: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' }, orders: { $sum: 1 } } }]),
      TicketOrder.aggregate([{ $match: { event: ev._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Ticket.aggregate([{ $match: { event: ev._id, status: { $ne: 'cancelled' } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
      Ticket.aggregate([{ $match: { event: ev._id, status: 'used' } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
      TicketOrder.find({ event: ev._id, status: 'paid', 'payment.paidAt': { $gte: new Date(Date.now() - 30 * 86400000) } }).select('payment.paidAt total quantity'),
      TicketOrder.find({ event: ev._id, status: { $in: ['paid', 'awaiting_validation', 'refund_needed'] } }).sort({ updatedAt: -1 }).limit(8),
      TicketWaitlist.countDocuments({ event: ev._id }),
    ]);

    const sold = Object.fromEntries(ticketAgg.map((r) => [String(r._id), r.n]));
    const checked = Object.fromEntries(checkAgg.map((r) => [String(r._id), r.n]));
    const categories = cats.map((c) => ({
      ...svc.publicCategory(c),
      sold: sold[String(c._id)] || 0,
      checkedIn: checked[String(c._id)] || 0,
      pending: Math.max(0, c.reserved - (sold[String(c._id)] || 0)),
    }));

    // Serie continue sur 30 jours (fuseau du restaurant)
    const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });
    const map = {};
    for (const o of daily) {
      const k = dayKey(o.payment.paidAt);
      map[k] = map[k] || { revenue: 0, tickets: 0 };
      map[k].revenue += o.total;
      map[k].tickets += o.quantity;
    }
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = dayKey(Date.now() - i * 86400000);
      series.push({ date: d, revenue: map[d]?.revenue || 0, tickets: map[d]?.tickets || 0 });
    }

    res.json({
      revenue: revenueAgg[0]?.total || 0,
      paidOrders: byStatus.find((r) => r._id === 'paid')?.n || revenueAgg[0]?.orders || 0,
      ticketsSold: categories.reduce((s, c) => s + c.sold, 0),
      capacity: categories.reduce((s, c) => s + c.capacity, 0),
      checkedIn: categories.reduce((s, c) => s + c.checkedIn, 0),
      statusCounts: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
      categories,
      series,
      waitlist,
      recent: recent.map((o) => ({ _id: o._id, orderNumber: o.orderNumber, buyer: o.buyer, total: o.total, quantity: o.quantity, status: o.status, paidAt: o.payment?.paidAt, items: o.items })),
      salesState: svc.salesState(ev),
    });
  } catch (err) { next(err); }
};

// ─── Commandes ───────────────────────────────────────────────────────────────

function orderFilter(ev, q) {
  const f = { event: ev._id };
  if (q.status && q.status !== 'all') f.status = q.status;
  else f.status = { $ne: 'cancelled' };
  if (q.status === 'all') delete f.status;
  if (q.search) {
    const re = new RegExp(escRe(String(q.search).trim().slice(0, 60)), 'i');
    f.$or = [{ orderNumber: re }, { 'buyer.name': re }, { 'buyer.email': re }, { 'buyer.phone': re }, { holders: re }];
  }
  return f;
}

exports.listOrders = async (req, res, next) => {
  try {
    const ev = await svc.getEvent();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));
    const f = orderFilter(ev, { status: req.query.status || 'paid', search: req.query.search });
    const [orders, total] = await Promise.all([
      TicketOrder.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      TicketOrder.countDocuments(f),
    ]);
    res.json({
      orders: orders.map((o) => ({
        _id: o._id, orderNumber: o.orderNumber, buyer: o.buyer, items: o.items, quantity: o.quantity, total: o.total,
        status: o.status, createdAt: o.createdAt, paidAt: o.payment?.paidAt, transactionId: o.payment?.transactionId,
        method: o.payment?.method, emailSentAt: o.emailSentAt, expiresAt: o.expiresAt,
        proofUploadedAt: o.proof?.uploadedAt || null,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) { next(err); }
};

exports.getOrder = async (req, res, next) => {
  try {
    const o = await TicketOrder.findById(req.params.id);
    if (!o) return res.status(404).json({ message: 'Commande introuvable' });
    const payload = await orderPayload(o, { withQr: false });
    res.json({ order: {
      ...payload,
      payment: { transactionId: o.payment?.transactionId, method: o.payment?.method, amount: o.payment?.amount, provider: o.payment?.provider },
      emailSentAt: o.emailSentAt,
      holders: o.holders,
      proof: o.proof?.uploadedAt ? { originalName: o.proof.originalName, mime: o.proof.mime, size: o.proof.size, reference: o.proof.reference, uploadedAt: o.proof.uploadedAt } : null,
      validatedAt: o.validatedAt,
      rejectionReason: o.rejectionReason,
    } });
  } catch (err) { next(err); }
};

exports.exportOrders = async (req, res, next) => {
  try {
    const ev = await svc.getEvent();
    const orders = await TicketOrder.find(orderFilter(ev, { status: req.query.status || 'paid', search: req.query.search })).sort({ createdAt: 1 });
    const tickets = await Ticket.find({ order: { $in: orders.map((o) => o._id) } }).sort({ _id: 1 });
    const byOrder = new Map();
    for (const t of tickets) {
      const k = String(t.order);
      if (!byOrder.has(k)) byOrder.set(k, []);
      byOrder.get(k).push(t);
    }
    const rows = [['Commande', 'Statut', 'Date paiement', 'Acheteur', 'Téléphone', 'E-mail', 'Billet', 'Titulaire', 'Catégorie', 'Prix', 'Statut billet', 'Entrée', 'Transaction']];
    for (const o of orders) {
      const ts = byOrder.get(String(o._id)) || [];
      const unit = Object.fromEntries(o.items.map((i) => [String(i.category), i.unitPrice]));
      if (ts.length === 0) {
        rows.push([o.orderNumber, o.status, fmtDate(o.payment?.paidAt), o.buyer.name, o.buyer.phone, o.buyer.email, '', '', o.items.map((i) => `${i.code} x${i.quantity}`).join(' + '), o.total, '', '', o.payment?.transactionId || '']);
      }
      for (const t of ts) {
        rows.push([o.orderNumber, o.status, fmtDate(o.payment?.paidAt), o.buyer.name, o.buyer.phone, o.buyer.email, t.number, t.holderName, t.categoryCode, unit[String(t.category)] || '', t.status, fmtDate(t.checkedInAt), o.payment?.transactionId || '']);
      }
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="miawezon-commandes-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(toCsv(rows));
  } catch (err) { next(err); }
};

exports.resendEmail = async (req, res, next) => {
  try {
    const o = await TicketOrder.findById(req.params.id).select('+accessToken');
    if (!o || o.status !== 'paid') return res.status(409).json({ message: 'Seules les commandes payées peuvent être renvoyées' });
    if (req.body?.email) {
      const email = String(req.body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ message: 'Adresse e-mail invalide' });
      o.buyer.email = email;
      await TicketOrder.updateOne({ _id: o._id }, { 'buyer.email': email });
    }
    const tickets = await Ticket.find({ order: o._id, status: { $ne: 'cancelled' } }).sort({ _id: 1 });
    const ev = await svc.getEvent();
    const sent = await sendTicketsEmail({ order: o, tickets, event: ev, token: o.accessToken });
    if (!sent) return res.status(503).json({ message: 'Le serveur d\'e-mail n\'est pas configuré' });
    await TicketOrder.updateOne({ _id: o._id }, { emailSentAt: new Date() });
    res.json({ message: 'Billets renvoyés' });
  } catch (err) { next(err); }
};

// Lien prive vers les billets (pour l'envoyer par WhatsApp depuis l'admin)
exports.ticketsLink = async (req, res, next) => {
  try {
    const o = await TicketOrder.findById(req.params.id).select('+accessToken');
    if (!o || o.status !== 'paid') return res.status(409).json({ message: 'Commande non payée' });
    const front = (process.env.FRONTEND_URL || 'https://www.wenamfood.com').replace(/\/$/, '');
    res.json({ url: `${front}/miawezon/billets/${o._id}?t=${o.accessToken}`, phone: o.buyer.phone, name: o.buyer.name, orderNumber: o.orderNumber });
  } catch (err) { next(err); }
};

// Verifier manuellement un paiement (client qui a paye mais ferme la page)
exports.verifyPayment = async (req, res, next) => {
  try {
    const o = await TicketOrder.findById(req.params.id).select('+accessToken');
    if (!o) return res.status(404).json({ message: 'Commande introuvable' });
    const tx = String(req.body?.transactionId || o.payment?.transactionId || '').trim();
    if (!tx) return res.status(400).json({ message: 'Identifiant de transaction YouCan Pay requis' });
    const { order } = await finalizePayment(o, tx, { token: o.accessToken });
    res.json({ order: { _id: order._id, status: order.status, orderNumber: order.orderNumber } });
  } catch (err) {
    if (typeof err.code === 'string') return res.status(err.statusCode || 400).json({ message: err.message, code: err.code });
    next(err);
  }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const o = await TicketOrder.findById(req.params.id);
    if (!o) return res.status(404).json({ message: 'Commande introuvable' });
    if (!['paid', 'pending', 'awaiting_validation', 'refund_needed'].includes(o.status)) return res.status(409).json({ message: 'Commande déjà clôturée' });
    const used = await Ticket.countDocuments({ order: o._id, status: 'used' });
    if (used > 0) return res.status(409).json({ message: 'Impossible : au moins un billet a déjà été scanné à l\'entrée' });
    const updated = await svc.transitionOrder({ _id: o._id, status: o.status }, { status: 'cancelled', seatsHeld: false });
    if (!updated) return res.status(409).json({ message: 'La commande a changé, rechargez la page' });
    if (o.seatsHeld) await svc.releaseSeats(o.items);
    await svc.cancelOrderTickets(o._id);
    res.json({ message: o.status === 'pending' ? 'Commande annulée' : 'Commande annulée. Pensez à rembourser le client depuis YouCan Pay.' });
  } catch (err) { next(err); }
};

// ─── Virements : reçus a valider ────────────────────────────────────────────

exports.pendingCount = async (req, res, next) => {
  try {
    const ev = await svc.getEvent();
    const [awaiting, oldest] = await Promise.all([
      TicketOrder.countDocuments({ event: ev._id, status: 'awaiting_validation' }),
      TicketOrder.findOne({ event: ev._id, status: 'awaiting_validation' }).sort({ 'proof.uploadedAt': 1 }).select('proof.uploadedAt'),
    ]);
    res.json({ awaiting, oldestAt: oldest?.proof?.uploadedAt || null });
  } catch (err) { next(err); }
};

exports.getProof = async (req, res, next) => {
  try {
    const o = await TicketOrder.findById(req.params.id).select('+proof.file proof orderNumber');
    if (!o?.proof?.file) return res.status(404).json({ message: 'Aucun reçu pour cette commande' });
    const file = PROOF_PATH(o.proof.file);
    if (!fs.existsSync(file)) return res.status(404).json({ message: 'Fichier introuvable sur le serveur' });
    res.setHeader('Content-Type', o.proof.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="recu-${o.orderNumber}${require('path').extname(o.proof.file)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(file).pipe(res);
  } catch (err) { next(err); }
};

exports.approveOrder = async (req, res, next) => {
  try {
    const o = await TicketOrder.findById(req.params.id).select('+accessToken');
    if (!o) return res.status(404).json({ message: 'Commande introuvable' });
    const { order } = await approveTransfer(o, req.user._id);
    res.json({ message: 'Achat validé : les billets ont été envoyés au client', order: { _id: order._id, status: order.status } });
  } catch (err) {
    if (typeof err.code === 'string') return res.status(err.statusCode || 400).json({ message: err.message, code: err.code });
    next(err);
  }
};

exports.rejectOrder = async (req, res, next) => {
  try {
    const o = await TicketOrder.findById(req.params.id);
    if (!o) return res.status(404).json({ message: 'Commande introuvable' });
    if (!['awaiting_validation', 'pending'].includes(o.status)) return res.status(409).json({ message: 'Cette commande ne peut plus être refusée' });
    const reason = String(req.body?.reason || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const updated = await svc.transitionOrder(
      { _id: o._id, status: o.status },
      { status: 'rejected', seatsHeld: false, rejectionReason: reason, validatedAt: new Date(), validatedBy: req.user._id }
    );
    if (!updated) return res.status(409).json({ message: 'La commande a changé, rechargez la page' });
    if (o.seatsHeld) await svc.releaseSeats(o.items);
    const sent = await sendRejected({ order: updated, reason }).catch(() => false);
    res.json({ message: sent ? 'Achat refusé : le client a été prévenu par e-mail' : 'Achat refusé (e-mail non envoyé)' });
  } catch (err) { next(err); }
};

// ─── Liste d'attente ─────────────────────────────────────────────────────────

exports.listWaitlist = async (req, res, next) => {
  try {
    const ev = await svc.getEvent();
    const entries = await TicketWaitlist.find({ event: ev._id }).sort({ createdAt: -1 });
    if (req.query.format === 'csv') {
      const rows = [['E-mail', 'Nom', 'Langue', 'Inscrit le', 'Prévenu le'], ...entries.map((e) => [e.email, e.name, e.lang, fmtDate(e.createdAt), fmtDate(e.notifiedAt)])];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="miawezon-liste-attente.csv"');
      return res.send(toCsv(rows));
    }
    res.json({ entries, total: entries.length, notified: entries.filter((e) => e.notifiedAt).length });
  } catch (err) { next(err); }
};

exports.notifyWaitlist = async (req, res, next) => {
  try {
    const ev = await svc.getEvent();
    if (svc.salesState(ev) !== 'open') return res.status(409).json({ message: 'La billetterie doit être ouverte avant de prévenir la liste d\'attente' });
    const entries = await TicketWaitlist.find({ event: ev._id, notifiedAt: null }).limit(500);
    let sent = 0;
    for (const entry of entries) {
      try {
        if (await sendWaitlistEmail({ entry })) {
          sent += 1;
          await TicketWaitlist.updateOne({ _id: entry._id }, { notifiedAt: new Date() });
        }
      } catch (e) { console.error('MIAWEZON waitlist:', entry.email, e.message); }
    }
    res.json({ message: `${sent} personne(s) prévenue(s)`, sent, remaining: entries.length - sent });
  } catch (err) { next(err); }
};

// ─── Controle des billets (jour J) ───────────────────────────────────────────

async function checkinCounts(eventId) {
  const [total, used] = await Promise.all([
    Ticket.countDocuments({ event: eventId, status: { $ne: 'cancelled' } }),
    Ticket.countDocuments({ event: eventId, status: 'used' }),
  ]);
  return { total, checkedIn: used };
}

exports.checkinStats = async (req, res, next) => {
  try {
    const ev = await svc.getEvent();
    res.json(await checkinCounts(ev._id));
  } catch (err) { next(err); }
};

exports.checkin = async (req, res, next) => {
  try {
    const ev = await svc.getEvent();
    const raw = parseScanned(req.body?.code);
    if (!raw) return res.status(400).json({ result: 'invalid', message: 'Code vide' });

    const byCode = { event: ev._id, $or: [{ code: raw }, { number: raw }] };
    const dryRun = req.body?.dryRun === true;

    let ticket = null;
    if (!dryRun) {
      ticket = await Ticket.findOneAndUpdate(
        { ...byCode, status: 'valid' },
        { status: 'used', checkedInAt: new Date(), checkedInBy: req.user._id },
        { new: true }
      );
    }
    let result = 'valid';
    if (!ticket) {
      ticket = await Ticket.findOne(byCode);
      if (!ticket) result = 'invalid';
      else if (ticket.status === 'used') result = 'already_used';
      else if (ticket.status === 'cancelled') result = 'cancelled';
      else result = dryRun ? 'valid' : 'invalid';
    }

    const counts = await checkinCounts(ev._id);
    res.json({
      result,
      ticket: ticket ? {
        number: ticket.number,
        holderName: ticket.holderName,
        categoryCode: ticket.categoryCode,
        categoryName: ticket.categoryName,
        checkedInAt: ticket.checkedInAt,
      } : null,
      ...counts,
    });
  } catch (err) { next(err); }
};
