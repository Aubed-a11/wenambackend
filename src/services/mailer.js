const nodemailer = require('nodemailer');

// Envoi des courriels du site Wênam (code de verification, mot de passe oublie)
// depuis contact@wenamfood.com, avec la meme boite que MIAWEZON.
// Reglages, du plus prioritaire au moins prioritaire :
//   MAIL_SMTP_HOST / _PORT / _SECURE / _USER / _PASS
//   MIAWEZON_SMTP_* (boite contact@wenamfood.com deja configuree)
//   SMTP_* (ancienne configuration)
// Expediteur : MAIL_FROM_EMAIL, sinon MIAWEZON_FROM_EMAIL, sinon contact@wenamfood.com
let cached = null;

function prefix() {
  if (process.env.MAIL_SMTP_HOST && process.env.MAIL_SMTP_USER) return 'MAIL_SMTP_';
  if (process.env.MIAWEZON_SMTP_HOST && process.env.MIAWEZON_SMTP_USER) return 'MIAWEZON_SMTP_';
  return 'SMTP_';
}

function transporter() {
  if (cached) return cached;
  const p = prefix();
  const port = Number(process.env[`${p}PORT`]) || 587;
  cached = nodemailer.createTransport({
    host: process.env[`${p}HOST`],
    port,
    secure: process.env[`${p}SECURE`] ? process.env[`${p}SECURE`] === 'true' : port === 465,
    auth: { user: process.env[`${p}USER`], pass: process.env[`${p}PASS`] },
  });
  return cached;
}

const fromEmail = () => process.env.MAIL_FROM_EMAIL || process.env.MIAWEZON_FROM_EMAIL || 'contact@wenamfood.com';

// Envoie un courriel au nom de Wênam
async function sendSiteMail({ to, subject, html, text }) {
  return transporter().sendMail({
    from: `"Wênam" <${fromEmail()}>`,
    replyTo: fromEmail(),
    to,
    subject,
    html,
    text,
  });
}

module.exports = { sendSiteMail, fromEmail };
