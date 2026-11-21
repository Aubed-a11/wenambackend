// Regle la date et l'horaire de l'evenement MIAWEZON.
//   node scripts/miawezon-set-date.js                      -> 24 juillet 2027, 15h a 20h
//   node scripts/miawezon-set-date.js 2027-07-24 "15h à 20h"
require('dotenv').config();
const mongoose = require('mongoose');
const TicketEvent = require('../src/models/TicketEvent');

(async () => {
  const dateArg = process.argv[2] || '2027-07-24';
  const timeFr = process.argv[3] || '15h à 20h';
  const timeEn = process.argv[4] || '3 pm to 8 pm';
  // Midi UTC pour eviter tout decalage de jour
  const eventDate = new Date(`${dateArg}T12:00:00+01:00`);
  if (Number.isNaN(eventDate.getTime())) { console.log('Date invalide (format AAAA-MM-JJ)'); process.exit(1); }
  await mongoose.connect(process.env.MONGODB_URI);
  const r = await TicketEvent.updateOne({ slug: 'miawezon' }, { $set: {
    eventDate,
    eventTimeLabel: { fr: timeFr, en: timeEn },
  } });
  console.log(r.matchedCount ? `Date reglee : ${dateArg}, ${timeFr}` : 'Evenement introuvable');
  await mongoose.disconnect();
})().catch((e) => { console.error('ERREUR :', e.message); process.exit(1); });
