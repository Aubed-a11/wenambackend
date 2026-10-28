// Billets de test MIAWEZON envoyes par e-mail (commande payee fictive).
//   node scripts/miawezon-test-ticket.js email1@x.com email2@x.com   -> envoie 1 ZINLI + 1 AGBADJA a chaque adresse
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

async function send(email) {
  const ev = await svc.getEvent();
  const cats = await svc.getCategories(ev._id);
  const items = cats.map((c) => ({ category: c._id, code: c.code, name: c.name, unitPrice: c.price, quantity: 1 }));
  const name = email.split('@')[0];
  const order = await svc.createOrder({
    ev, items, lang: 'fr',
    buyer: { name: `Test ${name}`, phone: TEST_PHONE, email },
    holders: items.map(() => `Test ${name}`),
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
  const args = process.argv.slice(2);
  if (args[0] === '--clean') await clean();
  else if (!args.length) console.log('Usage : node scripts/miawezon-test-ticket.js email1 [email2 ...] | --clean');
  else for (const e of args) await send(e.trim().toLowerCase());
  await mongoose.disconnect();
})().catch((e) => { console.error('ERREUR :', e.message); process.exit(1); });
