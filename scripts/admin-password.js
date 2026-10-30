// Change le mot de passe d'un compte admin.
//   node scripts/admin-password.js "NouveauMotDePasse"                 -> compte admin@wenam.ma (ou ADMIN_EMAIL)
//   node scripts/admin-password.js "NouveauMotDePasse" autre@email.com
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

(async () => {
  const [password, emailArg] = process.argv.slice(2);
  if (!password || password.length < 10) {
    console.log('Usage : node scripts/admin-password.js "MotDePasse" [email]  (10 caracteres minimum)');
    process.exit(1);
  }
  const email = (emailArg || process.env.ADMIN_EMAIL || 'admin@wenam.ma').toLowerCase();
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email }).select('+password');
  if (!user) { console.log(`Aucun compte ${email}`); process.exit(1); }
  user.password = password;
  await user.save();
  console.log(`Mot de passe mis a jour pour ${email} (role : ${user.role})`);
  await mongoose.disconnect();
})().catch((e) => { console.error('ERREUR :', e.message); process.exit(1); });
