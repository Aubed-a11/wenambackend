// Change l'identifiant (e-mail) du compte admin, et eventuellement son mot de passe.
//   node scripts/admin-email.js contact@wenamfood.com
//   node scripts/admin-email.js contact@wenamfood.com "NouveauMotDePasse"
//   node scripts/admin-email.js contact@wenamfood.com "NouveauMotDePasse" ancien@email.com
// Par defaut, l'ancien compte est admin@wenam.ma (ou le seul compte admin s'il n'y en a qu'un).
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

(async () => {
  const [newEmailArg, password, oldEmailArg] = process.argv.slice(2);
  const newEmail = String(newEmailArg || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    console.log('Usage : node scripts/admin-email.js nouvel@email.com ["NouveauMotDePasse"] [ancien@email.com]');
    process.exit(1);
  }
  if (password && password.length < 10) { console.log('Mot de passe : 10 caracteres minimum'); process.exit(1); }
  await mongoose.connect(process.env.MONGODB_URI);

  let admin = await User.findOne({ email: (oldEmailArg || 'admin@wenam.ma').toLowerCase(), role: 'admin' }).select('+password');
  if (!admin) {
    const admins = await User.find({ role: 'admin' }).select('+password');
    if (admins.length === 1) [admin] = admins;
    else {
      console.log(admins.length ? `Plusieurs comptes admin : ${admins.map((a) => a.email).join(', ')}. Precisez l'ancien e-mail en 3e argument.` : 'Aucun compte admin trouve.');
      process.exit(1);
    }
  }

  const taken = await User.findOne({ email: newEmail, _id: { $ne: admin._id } });
  if (taken) {
    console.log(`L'adresse ${newEmail} est deja utilisee par un autre compte (role : ${taken.role}). Supprimez-le ou changez son e-mail d'abord.`);
    process.exit(1);
  }

  const old = admin.email;
  admin.email = newEmail;
  if (password) admin.password = password;
  admin.refreshToken = undefined; // deconnecte les sessions ouvertes avec l'ancien identifiant
  await admin.save();
  console.log(`Identifiant admin change : ${old} -> ${newEmail}${password ? ' (mot de passe mis a jour)' : ' (mot de passe inchange)'}`);
  await mongoose.disconnect();
})().catch((e) => { console.error('ERREUR :', e.message); process.exit(1); });
