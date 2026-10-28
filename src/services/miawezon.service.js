const crypto = require('crypto');
const TicketEvent = require('../models/TicketEvent');
const TicketCategory = require('../models/TicketCategory');
const TicketOrder = require('../models/TicketOrder');
const Ticket = require('../models/Ticket');

const SLUG = 'miawezon';
const HOLD_MINUTES = Number(process.env.MIAWEZON_HOLD_MINUTES || 20);

const DEFAULT_CATEGORIES = [
  { code: 'ZINLI', name: 'ZINLI', label: { fr: 'Billet Basique', en: 'Basic ticket' }, price: 350, capacity: 50, order: 1 },
  { code: 'AGBADJA', name: 'AGBADJA', label: { fr: 'Billet VIP', en: 'VIP ticket' }, price: 500, capacity: 20, order: 2 },
];

// Menu par defaut (modifiable ensuite dans l'admin)
const d = (fr, en, dfr = '', den = '', tiers = ['ZINLI', 'AGBADJA']) => ({ name: { fr, en }, desc: { fr: dfr, en: den }, tiers });
const DEFAULT_MENU = [
  { key: 'entrees', items: [
    d('Samoussa au bœuf', 'Beef samosa', 'Croustillant et savoureux', 'Crispy and tasty'),
    d('Accras de morue', 'Cod fritters', 'Recette traditionnelle', 'Traditional recipe'),
    d('Salade exotique', 'Exotic salad', 'Fraîche et colorée', 'Fresh and colourful'),
    d('Brochettes de gambas', 'Prawn skewers', 'Marinées aux épices douces', 'Marinated in mild spices', ['AGBADJA']),
  ] },
  { key: 'plats', items: [
    d('Poulet braisé', 'Grilled chicken', 'À la sauce épicée', 'With spicy sauce'),
    d('Poisson braisé', 'Grilled fish', 'Aux épices douces', 'With mild spices'),
    d('Riz gras', 'Jollof rice', 'Saveurs authentiques', 'Authentic flavours'),
    d('Agneau mijoté', 'Slow-cooked lamb', 'Sauce arachide', 'Peanut sauce', ['AGBADJA']),
  ] },
  { key: 'desserts', items: [
    d('Tarte à la mangue', 'Mango tart', 'Fruitée et gourmande', 'Fruity and indulgent'),
    d('Beignets sucrés', 'Sweet doughnuts', 'Douceur africaine', 'African sweetness'),
    d('Banane plantain', 'Plantain', 'Caramélisée', 'Caramelised'),
  ] },
  { key: 'boissons', items: [
    d('Jus de bissap', 'Hibiscus juice', 'Naturel', 'Natural'),
    d('Jus de gingembre', 'Ginger juice', 'Rafraîchissant', 'Refreshing'),
    d('Eau minérale', 'Mineral water', 'Fraîche et pure', 'Fresh and pure'),
    d('Cocktail de fruits', 'Fruit cocktail', 'Sans alcool', 'Alcohol free', ['AGBADJA']),
  ] },
];
const MENU_SECTIONS = ['entrees', 'plats', 'desserts', 'boissons'];

// ─── Evenement ───────────────────────────────────────────────────────────────

async function getEvent() {
  let ev = await TicketEvent.findOne({ slug: SLUG });
  if (!ev) {
    try {
      ev = await TicketEvent.create({ slug: SLUG });
    } catch (err) {
      if (err.code !== 11000) throw err;
      ev = await TicketEvent.findOne({ slug: SLUG });
    }
  }
  if (!ev.menu || ev.menu.length === 0) {
    ev = await TicketEvent.findByIdAndUpdate(ev._id, { menu: DEFAULT_MENU }, { new: true });
  }
  const count = await TicketCategory.countDocuments({ event: ev._id });
  if (count === 0) {
    await TicketCategory.insertMany(DEFAULT_CATEGORIES.map((c) => ({ ...c, event: ev._id })), { ordered: false }).catch(() => {});
  }
  return ev;
}

function salesState(ev, now = new Date()) {
  if (ev.salesMode === 'closed') return 'closed';
  if (ev.salesMode === 'open') return 'open';
  if (ev.salesOpenAt && now < ev.salesOpenAt) return 'upcoming';
  if (ev.salesCloseAt && now > ev.salesCloseAt) return 'closed';
  return 'open';
}

function publicEvent(ev) {
  const state = salesState(ev);
  return {
    name: ev.name,
    published: ev.published,
    phase1At: ev.phase1At,
    salesOpenAt: ev.salesOpenAt,
    salesCloseAt: ev.salesCloseAt,
    salesMode: ev.salesMode,
    salesState: state,
    phase: state === 'upcoming' ? 1 : 2,
    eventDate: ev.eventDate,
    eventDateLabel: ev.eventDateLabel,
    eventTimeLabel: ev.eventTimeLabel,
    venue: ev.venue,
    venueAddress: ev.venueAddress,
    menuFinal: ev.menuFinal,
    menu: (ev.menu || []).map((s) => ({ key: s.key, items: (s.items || []).map((i) => ({ name: i.name, desc: i.desc, tiers: i.tiers })) })),
    maxTicketsPerOrder: ev.maxTicketsPerOrder,
    paymentMode: ev.paymentMode || 'transfer',
    bankAccounts: (ev.bankAccounts || []).filter((b) => b && (b.rib || b.iban)).map((b) => ({ bank: b.bank, holder: b.holder, rib: b.rib, iban: b.iban, swift: b.swift })),
    proofDeadlineHours: ev.proofDeadlineHours || 24,
    validationHours: ev.validationHours || 24,
    contactEmail: ev.contactEmail,
    contactPhone: ev.contactPhone,
  };
}

async function getCategories(eventId, { activeOnly = false } = {}) {
  const q = { event: eventId };
  if (activeOnly) q.active = true;
  return TicketCategory.find(q).sort({ order: 1, price: 1 });
}

function publicCategory(c) {
  const available = Math.max(0, c.capacity - c.reserved);
  return {
    _id: c._id,
    code: c.code,
    name: c.name,
    label: c.label,
    price: c.price,
    capacity: c.capacity,
    available,
    soldOut: available === 0,
    active: c.active,
  };
}

// ─── Places ──────────────────────────────────────────────────────────────────

async function releaseSeats(items) {
  for (const it of items) {
    await TicketCategory.updateOne(
      { _id: it.category, reserved: { $gte: it.quantity } },
      { $inc: { reserved: -it.quantity } }
    );
  }
}

// Bloque les places de facon atomique. Retourne null si tout est bloque,
// sinon le code de la categorie qui n'a plus assez de places.
async function holdSeats(items) {
  const done = [];
  for (const it of items) {
    // Mise a jour conditionnelle : ne passe que si la capacite n'a pas change
    // et qu'il reste assez de places. On reessaie si la capacite vient d'etre modifiee.
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      const cat = await TicketCategory.findById(it.category).select('capacity reserved active');
      if (!cat || !cat.active || cat.reserved + it.quantity > cat.capacity) break;
      const r = await TicketCategory.updateOne(
        { _id: it.category, active: true, capacity: cat.capacity, reserved: { $lte: cat.capacity - it.quantity } },
        { $inc: { reserved: it.quantity } }
      );
      ok = r.modifiedCount === 1;
      if (ok) {
        // Garde-fou : ne jamais depasser la capacite
        const after = await TicketCategory.findById(it.category).select('capacity reserved');
        if (after.reserved > after.capacity) {
          await TicketCategory.updateOne({ _id: it.category }, { $inc: { reserved: -it.quantity } });
          ok = false;
          break;
        }
      }
    }
    if (!ok) {
      await releaseSeats(done);
      return it.code || 'UNKNOWN';
    }
    done.push(it);
  }
  return null;
}

// Changement d'etat conditionnel d'une commande (atomique).
// Retourne la commande mise a jour, ou null si le filtre ne correspond plus.
async function transitionOrder(filter, update) {
  const r = await TicketOrder.updateOne(filter, update);
  return r.modifiedCount === 1 ? TicketOrder.findById(filter._id) : null;
}

// Libere les places des commandes en attente dont le delai est depasse
async function releaseExpired() {
  const expired = await TicketOrder.find({ status: 'pending', expiresAt: { $lt: new Date() } }).select('_id').limit(200);
  for (const { _id } of expired) {
    const o = await transitionOrder({ _id, status: 'pending', seatsHeld: true }, { status: 'expired', seatsHeld: false });
    if (o) await releaseSeats(o.items);
  }
  return expired.length;
}

let sweeper = null;
function startSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => releaseExpired().catch((e) => console.error('MIAWEZON sweeper:', e.message)), 60 * 1000);
  sweeper.unref?.();
}

// ─── Commandes ───────────────────────────────────────────────────────────────

const newToken = () => crypto.randomBytes(24).toString('hex');

function tokenMatches(order, token) {
  if (!token || !order.accessToken) return false;
  const a = Buffer.from(String(order.accessToken));
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function nextOrderNumber(ev) {
  const year = (ev.eventDate || ev.salesOpenAt || new Date()).getFullYear();
  const prefix = `MZW-${year}-`;
  const last = await TicketOrder.findOne({ orderNumber: new RegExp(`^${prefix}`) }).sort({ createdAt: -1, _id: -1 }).select('orderNumber');
  let n = last ? parseInt(last.orderNumber.slice(prefix.length), 10) || 0 : 0;
  return () => `${prefix}${String(++n).padStart(4, '0')}`;
}

// Delai de paiement : quelques minutes en ligne, ou le delai d'envoi du reçu pour un virement
const holdMs = (ev) => (ev.paymentMode === 'youcanpay' ? HOLD_MINUTES * 60 * 1000 : (ev.proofDeadlineHours || 24) * 3600 * 1000);

async function createOrder({ ev, items, buyer, holders, lang, userId }) {
  const blocked = await holdSeats(items);
  if (blocked) {
    throw Object.assign(new Error('Plus assez de places disponibles'), { statusCode: 409, code: 'SOLD_OUT', category: blocked });
  }
  const quantity = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const gen = await nextOrderNumber(ev);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const accessToken = newToken();
      const order = await TicketOrder.create({
        event: ev._id,
        orderNumber: gen(),
        accessToken,
        buyer,
        holders,
        lang,
        items,
        quantity,
        total,
        expiresAt: new Date(Date.now() + holdMs(ev)),
        user: userId || null,
      });
      order.accessToken = accessToken;
      return order;
    } catch (err) {
      if (err.code !== 11000 || attempt === 4) {
        await releaseSeats(items);
        throw err;
      }
    }
  }
  return null;
}

const ticketCode = () => crypto.randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, 'X');

// Prefixe du numero de billet par categorie (ZN-000123, AG-000045)
const NUMBER_PREFIX = { ZINLI: 'ZN', AGBADJA: 'AG' };
const numberPrefix = (code) => NUMBER_PREFIX[code] || String(code || 'MZ').slice(0, 2).toUpperCase();

// Emet les billets d'une commande payee (idempotent)
async function issueTickets(order) {
  const existing = await Ticket.countDocuments({ order: order._id });
  if (existing > 0) return Ticket.find({ order: order._id }).sort({ _id: 1 });

  for (let attempt = 0; attempt < 6; attempt++) {
    // Prochain numero libre par categorie
    const next = {};
    for (const it of order.items) {
      if (next[it.code] != null) continue;
      const prefix = numberPrefix(it.code);
      const last = await Ticket.findOne({ event: order.event, number: new RegExp(`^${prefix}-\\d+$`) }).sort({ number: -1 }).select('number');
      next[it.code] = last ? parseInt(last.number.split('-')[1], 10) + 1 + attempt : 1 + attempt;
    }

    const docs = [];
    let idx = 0;
    for (const it of order.items) {
      for (let k = 0; k < it.quantity; k++) {
        const holder = (order.holders?.[idx] || '').trim() || order.buyer.name;
        idx += 1;
        docs.push({
          event: order.event,
          order: order._id,
          category: it.category,
          categoryCode: it.code,
          categoryName: it.name,
          number: `${numberPrefix(it.code)}-${String(next[it.code]++).padStart(6, '0')}`,
          code: ticketCode(),
          holderName: holder,
        });
      }
    }
    try {
      await Ticket.insertMany(docs, { ordered: true });
      break;
    } catch (err) {
      // Numero pris par une emission concurrente : on retire ce lot et on recommence
      await Ticket.deleteMany({ order: order._id });
      if (err.code !== 11000 || attempt === 5) throw err;
    }
  }
  return Ticket.find({ order: order._id }).sort({ _id: 1 });
}

async function cancelOrderTickets(orderId) {
  await Ticket.updateMany({ order: orderId, status: 'valid' }, { status: 'cancelled' });
}

module.exports = {
  SLUG,
  MENU_SECTIONS,
  HOLD_MINUTES,
  getEvent,
  salesState,
  publicEvent,
  getCategories,
  publicCategory,
  holdSeats,
  releaseSeats,
  releaseExpired,
  transitionOrder,
  startSweeper,
  createOrder,
  tokenMatches,
  issueTickets,
  cancelOrderTickets,
};
