// Courriels automatiques MIAWEZON (verifies toutes les 5 minutes) :
//  1. rappel au client quelques heures avant l'expiration de sa reservation (reçu non envoye)
//  2. avis au client quand sa reservation expire (places remises en vente)
//  3. rappel a l'equipe pour les reçus en attente de validation depuis trop longtemps
//  4. rappel a tous les acheteurs la veille de l'evenement
// Chaque courriel n'est envoye qu'une fois par commande (marqueur pose avant l'envoi).
const TicketOrder = require('../models/TicketOrder');
const svc = require('./miawezon.service');
const mail = require('./ticketMail');

const HOUR = 3600 * 1000;
// Commandes de virement (y compris celles creees avant l'ajout du champ provider)
const TRANSFER = { $or: [{ 'payment.provider': 'transfer' }, { 'payment.tokenId': { $exists: false } }] };

// Pose le marqueur puis envoie ; en cas d'echec d'envoi, le marqueur est retire pour reessayer plus tard
async function once(order, field, sendFn) {
  const r = await TicketOrder.updateOne({ _id: order._id, [field]: { $exists: false } }, { $set: { [field]: new Date() } });
  if (r.modifiedCount !== 1) return false;
  try {
    const sent = await sendFn();
    if (sent === false) await TicketOrder.updateOne({ _id: order._id }, { $unset: { [field]: 1 } });
    return sent !== false;
  } catch (e) {
    await TicketOrder.updateOne({ _id: order._id }, { $unset: { [field]: 1 } });
    console.error(`MIAWEZON rappel ${field}:`, e.message);
    return false;
  }
}

async function holdReminders(ev, now) {
  if (ev.paymentMode === 'youcanpay') return 0;
  const deadline = (ev.proofDeadlineHours || 24) * HOUR;
  // Rappel quand il reste environ un quart du delai (6 h pour 24 h, au moins 1 h)
  const before = Math.max(HOUR, Math.min(6 * HOUR, deadline / 4));
  const orders = await TicketOrder.find({
    status: 'pending',
    reminderSentAt: { $exists: false },
    expiresAt: { $gt: new Date(now.getTime() + 15 * 60 * 1000), $lte: new Date(now.getTime() + before) },
    createdAt: { $lte: new Date(now.getTime() - HOUR) },
    ...TRANSFER,
  }).select('+accessToken').limit(100);
  let n = 0;
  for (const o of orders) if (await once(o, 'reminderSentAt', () => mail.sendHoldReminder({ order: o, event: ev, token: o.accessToken }))) n += 1;
  return n;
}

async function expiredNotices(ev, now) {
  const orders = await TicketOrder.find({
    status: 'expired',
    expiredNoticeAt: { $exists: false },
    'proof.uploadedAt': { $exists: false },
    // seulement les expirations recentes (pas de rattrapage des anciennes commandes)
    expiresAt: { $gte: new Date(now.getTime() - 48 * HOUR) },
    createdAt: { $lte: new Date(now.getTime() - HOUR) },
    ...TRANSFER,
  }).limit(100);
  let n = 0;
  for (const o of orders) if (await once(o, 'expiredNoticeAt', () => mail.sendExpiredNotice({ order: o }))) n += 1;
  return n;
}

async function adminDigest(ev, now) {
  const hours = ev.validationHours || 24;
  const orders = await TicketOrder.find({
    status: 'awaiting_validation',
    adminRemindedAt: { $exists: false },
    'proof.uploadedAt': { $lte: new Date(now.getTime() - hours * HOUR) },
  }).sort({ 'proof.uploadedAt': 1 }).limit(50);
  if (!orders.length) return 0;
  const ids = orders.map((o) => o._id);
  await TicketOrder.updateMany({ _id: { $in: ids }, adminRemindedAt: { $exists: false } }, { $set: { adminRemindedAt: now } });
  try {
    const sent = await mail.sendAdminPendingDigest({ orders, hours });
    if (sent === false) await TicketOrder.updateMany({ _id: { $in: ids } }, { $unset: { adminRemindedAt: 1 } });
  } catch (e) {
    await TicketOrder.updateMany({ _id: { $in: ids } }, { $unset: { adminRemindedAt: 1 } });
    console.error('MIAWEZON rappel admin:', e.message);
  }
  return orders.length;
}

async function eveReminders(ev, now) {
  if (!ev.eventDate) return 0;
  const start = ev.eventDate.getTime();
  // Fenetre : les 24 heures qui precedent le debut de l'evenement
  if (now.getTime() < start - 24 * HOUR || now.getTime() >= start) return 0;
  const orders = await TicketOrder.find({ status: 'paid', eveReminderSentAt: { $exists: false } }).select('+accessToken').limit(200);
  let n = 0;
  for (const o of orders) if (await once(o, 'eveReminderSentAt', () => mail.sendEveReminder({ order: o, event: ev, token: o.accessToken }))) n += 1;
  return n;
}

async function runReminders(now = new Date()) {
  const ev = await svc.getEvent();
  const out = {
    hold: await holdReminders(ev, now),
    expired: await expiredNotices(ev, now),
    admin: await adminDigest(ev, now),
    eve: await eveReminders(ev, now),
  };
  if (out.hold || out.expired || out.admin || out.eve) console.log('MIAWEZON rappels envoyes :', JSON.stringify(out));
  return out;
}

let timer = null;
function startReminders(everyMs = 5 * 60 * 1000) {
  if (timer) return;
  const tick = () => runReminders().catch((e) => console.error('MIAWEZON rappels:', e.message));
  setTimeout(tick, 30 * 1000).unref?.();
  timer = setInterval(tick, everyMs);
  timer.unref?.();
}

module.exports = { runReminders, startReminders };
