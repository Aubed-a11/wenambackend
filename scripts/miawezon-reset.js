// Remise a zero des ventes MIAWEZON (avant l'ouverture reelle).
// Supprime TOUTES les commandes, tous les billets et les reçus de virement,
// et remet les compteurs de places a zero. Garde les reglages, le menu, les prix, les RIB.
//   node scripts/miawezon-reset.js              -> affiche ce qui serait supprime
//   node scripts/miawezon-reset.js --confirm    -> supprime
//   ajouter --waitlist pour vider aussi la liste d'attente
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const TicketOrder = require('../src/models/TicketOrder');
const Ticket = require('../src/models/Ticket');
const TicketCategory = require('../src/models/TicketCategory');
const TicketWaitlist = require('../src/models/TicketWaitlist');

const PROOF_DIR = path.join(__dirname, '../private/miawezon-proofs');

(async () => {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const withWaitlist = args.includes('--waitlist');
  await mongoose.connect(process.env.MONGODB_URI);

  const orders = await TicketOrder.countDocuments();
  const tickets = await Ticket.countDocuments();
  const waitlist = await TicketWaitlist.countDocuments();
  const proofs = fs.existsSync(PROOF_DIR) ? fs.readdirSync(PROOF_DIR).length : 0;
  const cats = await TicketCategory.find().select('code reserved');

  console.log(`Commandes : ${orders}`);
  console.log(`Billets : ${tickets}`);
  console.log(`Reçus de virement : ${proofs}`);
  console.log(`Places comptees : ${cats.map((c) => `${c.code} ${c.reserved}`).join(', ')}`);
  console.log(`Liste d'attente : ${waitlist}${withWaitlist ? ' (sera videe)' : ' (conservee)'}`);

  if (!confirm) {
    console.log('\nRien n\'a ete supprime. Relancez avec --confirm pour tout remettre a zero.');
  } else {
    await Ticket.deleteMany({});
    await TicketOrder.deleteMany({});
    await TicketCategory.updateMany({}, { $set: { reserved: 0 } });
    if (withWaitlist) await TicketWaitlist.deleteMany({});
    if (fs.existsSync(PROOF_DIR)) for (const f of fs.readdirSync(PROOF_DIR)) fs.rmSync(path.join(PROOF_DIR, f), { force: true });
    console.log('\nRemise a zero effectuee : 0 commande, 0 billet, compteurs a 0. Les prochains numeros repartent a MZW-...-0001, ZN-000001, AG-000001.');
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('ERREUR :', e.message); process.exit(1); });
