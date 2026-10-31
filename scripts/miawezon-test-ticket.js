// Billets de test MIAWEZON envoyes par e-mail (commande payee fictive).
//   node scripts/miawezon-test-ticket.js email1@x.com email2@x.com   -> envoie 1 ZINLI + 1 AGBADJA a chaque adresse
//   options : --name "Prenom NOM" (nom sur le billet)  --cat ZINLI ou --cat AGBADJA (une seule categorie)
//   node scripts/miawezon-test-ticket.js --clean                       -> supprime les commandes de test et libere les places
require('dotenv').config();
const mongoose = require('mongoose');
const svc = require('../src/services/miawezon.service');
const { sendTicketsEmail } = require('../src/services/ticketMail');
const TicketOrder = require('../src/models/TicketOrder');
const Ticket = require('../src/models/Ticket');

const TEST_PHONE = 'TEST-MIAWEZON';

async function clean() {
  const orders = await TicketOrder.find({ 'buyer.phone': TEST_PHONE });
  for (const o of orders) {
    await Ticket.deleteMany({ order: o._id });
    if (o.seatsHeld) await svc.releaseSeats(o.items);
    await TicketOrder.deleteOne({ _id: o._id });
    console.log('Supprimee :', o.orderNumber, o.buyer.email);
  }
  console.log(`${orders.length} commande(s) de test supprimee(s)`);
}

async function send(email, { name: fullName, cat } = {}) {
  const ev = await svc.getEvent();
  const cats = (await svc.getCategories(ev._id)).filter((c) => !cat || c.code === cat);
  if (!cats.length) throw new Error(`Categorie inconnue : ${cat}`);
  const items = cats.map((c) => ({ category: c._id, code: c.code, name: c.name, unitPrice: c.price, quantity: 1 }));
  const name = fullName || `Test ${email.split('@')[0]}`;
  const order = await svc.createOrder({
    ev, items, lang: 'fr',
    buyer: { name, phone: TEST_PHONE, email },
    holders: items.map(() => name),
  });
  const token = order.accessToken;
  const paid = await svc.transitionOrder(
    { _id: order._id, status: 'pending' },
    { status: 'paid', seatsHeld: true, 'payment.provider': 'transfer', 'payment.method': 'Test', 'payment.amount': order.total, 'payment.paidAt': new Date(), validatedAt: new Date() }
  );
  const tickets = await svc.issueTickets(paid);
  const sent = await sendTicketsEmail({ order: paid, tickets, event: ev, token });
  if (sent) await TicketOrder.updateOne({ _id: paid._id }, { emailSentAt: new Date() });
  console.log(sent ? 'Envoye' : 'NON ENVOYE (SMTP non configure)', ':', email, paid.orderNumber, tickets.map((t) => t.number).join(', '));
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const argv = process.argv.slice(2);
  const opts = {}; const emails = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name') opts.name = String(argv[++i] || '').trim();
    else if (argv[i] === '--cat') opts.cat = String(argv[++i] || '').trim().toUpperCase();
    else emails.push(argv[i]);
  }
  if (emails[0] === '--clean') await clean();
  else if (!emails.length) console.log('Usage : node scripts/miawezon-test-ticket.js email1 [email2 ...] [--name "Prenom NOM"] [--cat ZINLI|AGBADJA] | --clean');
  else for (const e of emails) await send(e.trim().toLowerCase(), opts);
  await mongoose.disconnect();
})().catch((e) => { console.error('ERREUR :', e.message); process.exit(1); });
