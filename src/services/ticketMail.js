const path = require('path');
const nodemailer = require('nodemailer');
const { ticketsPdf, fmtPrice, eventDateText, labelOr, T } = require('./ticketDocs');

// Courriels MIAWEZON, envoyes depuis contact@wenamfood.com.
//
// Variables d'environnement (toutes optionnelles) :
//   MIAWEZON_FROM_EMAIL   adresse d'expedition (par defaut contact@wenamfood.com)
//   MIAWEZON_FROM_NAME    nom affiche (par defaut MIAWÉZON)
//   MIAWEZON_SMTP_HOST / _PORT / _SECURE / _USER / _PASS
//       serveur SMTP de la boite contact@wenamfood.com. Si absent, le SMTP principal (SMTP_*) est utilise :
//       il doit alors etre autorise a envoyer au nom de contact@wenamfood.com.

const LOGO = path.join(__dirname, '../assets/miawezon-logo-light.png');
const LOGO_CID = 'miawezon-logo';

const fromEmail = () => process.env.MIAWEZON_FROM_EMAIL || 'contact@wenamfood.com';
// Copie cachee des courriels clients : desactivee par defaut.
// MIAWEZON_BCC=adresse pour recevoir une copie de chaque courriel envoye aux clients.
const bccFor = (to) => {
  const v = (process.env.MIAWEZON_BCC || '').trim();
  if (!v || v.toLowerCase() === 'none' || v.toLowerCase() === String(to || '').toLowerCase()) return undefined;
  return v;
};
const fromName = () => process.env.MIAWEZON_FROM_NAME || 'MIAWÉZON';

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const own = Boolean(process.env.MIAWEZON_SMTP_HOST && process.env.MIAWEZON_SMTP_USER);
  const p = own ? 'MIAWEZON_SMTP_' : 'SMTP_';
  if (!process.env[`${p}HOST`] || !process.env[`${p}USER`]) return null;
  transporter = nodemailer.createTransport({
    host: process.env[`${p}HOST`],
    port: Number(process.env[`${p}PORT`]) || 587,
    secure: process.env[`${p}SECURE`] === 'true',
    auth: { user: process.env[`${p}USER`], pass: process.env[`${p}PASS`] },
  });
  return transporter;
}

const frontUrl = () => (process.env.FRONTEND_URL || 'https://www.wenamfood.com').replace(/\/$/, '');

const ticketsLink = (order, token) => `${frontUrl()}/miawezon/billets/${order._id}?t=${token}`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const M = {
  fr: {
    subject: (n) => `Bienvenue à MIAWÉZON : vos billets ${n}`,
    hello: 'Bonjour',
    welcomeTitle: 'Bienvenue à MIAWÉZON !',
    welcome: 'Nous sommes ravis de vous compter parmi nos invités. MIAWÉZON, c\'est le Bénin autour d\'une table : un buffet 100 % béninois, des plats qui se racontent, de la culture et des rencontres. Nous avons hâte de vous accueillir.',
    thanks: 'Votre réservation est confirmée. Vos billets sont joints à ce courriel au format PDF.',
    summary: 'Récapitulatif',
    total: 'Total payé',
    see: 'Voir mes billets en ligne',
    keep: 'Le jour de l\'événement, présentez le QR code de chaque billet à l\'entrée, sur votre téléphone ou imprimé. Chaque billet est nominatif et valable pour une seule entrée.',
    team: 'À très bientôt,<br>L\'équipe MIAWÉZON',
    contact: 'Une question ? Écrivez-nous à',
    waitSubject: 'La billetterie MIAWÉZON est ouverte',
    waitTitle: 'La billetterie est ouverte !',
    waitBody: 'Vous nous aviez demandé de vous prévenir : la billetterie de MIAWÉZON vient d\'ouvrir. Les places sont limitées, réservez la vôtre dès maintenant.',
    waitCta: 'Réserver mes billets',
  },
  en: {
    subject: (n) => `Welcome to MIAWÉZON: your tickets ${n}`,
    hello: 'Hello',
    welcomeTitle: 'Welcome to MIAWÉZON!',
    welcome: 'We are delighted to count you among our guests. MIAWÉZON is Benin around a table: a 100% Beninese buffet, dishes with a story, culture and new encounters. We look forward to welcoming you.',
    thanks: 'Your booking is confirmed. Your tickets are attached to this email as a PDF.',
    summary: 'Summary',
    total: 'Total paid',
    see: 'View my tickets online',
    keep: 'On the day, show the QR code of each ticket at the entrance, on your phone or printed. Each ticket is personal and valid for one entry only.',
    team: 'See you soon,<br>The MIAWÉZON team',
    contact: 'Any question? Write to us at',
    waitSubject: 'MIAWÉZON ticketing is open',
    waitTitle: 'Ticketing is open!',
    waitBody: 'You asked us to let you know: MIAWÉZON ticketing has just opened. Seats are limited, book yours now.',
    waitCta: 'Book my tickets',
  },
};

function layout(inner, m) {
  return `
  <div style="font-family:Lato,Arial,sans-serif;max-width:560px;margin:0 auto;background:#FAF3E8;border-radius:16px;overflow:hidden;color:#1A0F00">
    <div style="background:#1E120A;padding:30px 32px;text-align:center;border-bottom:4px solid #C98A35">
      <img src="cid:${LOGO_CID}" alt="MIAWÉZON" width="260" style="display:block;margin:0 auto;max-width:80%;height:auto;border:0" />
    </div>
    <div style="padding:32px">${inner}</div>
    <div style="background:#1E120A;padding:16px 32px;text-align:center;font-size:12px;color:#E8D3B0">
      ${m.contact} <a href="mailto:${fromEmail()}" style="color:#F8CB74;text-decoration:none">${fromEmail()}</a>
      <br><a href="${frontUrl()}/miawezon" style="color:#E8D3B0;text-decoration:none">${frontUrl().replace(/^https?:\/\//, '')}/miawezon</a>
    </div>
  </div>`;
}

const logoAttachment = () => ({ filename: 'miawezon.png', path: LOGO, cid: LOGO_CID });

async function sendTicketsEmail({ order, tickets, event, token }) {
  const tr = getTransporter();
  if (!tr) {
    console.warn('MIAWEZON: SMTP non configure, courriel non envoye pour', order.orderNumber);
    return false;
  }
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const m = M[lang];
  const t = T[lang];
  const pdf = await ticketsPdf({ order, tickets, event });
  const link = ticketsLink(order, token);

  const lines = order.items.map((i) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #EDE0C4">${esc(i.name)} x ${i.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #EDE0C4;text-align:right">${fmtPrice(i.unitPrice * i.quantity)}</td>
    </tr>`).join('');

  const html = layout(`
    <p style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#8B3A0F;margin:0 0 14px">${m.welcomeTitle}</p>
    <p style="font-size:16px;margin:0 0 12px">${m.hello} <strong>${esc(order.buyer.name)}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${m.welcome}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px">${m.thanks}</p>
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8B6B3D;margin:0 0 6px">${m.summary} · ${esc(order.orderNumber)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${lines}
      <tr><td style="padding:10px 0;font-weight:700">${m.total}</td><td style="padding:10px 0;text-align:right;font-weight:700;color:#C4531A">${fmtPrice(order.total)}</td></tr>
    </table>
    <table style="width:100%;font-size:13px;margin:20px 0;color:#5C3D11">
      <tr><td>${t.date}</td><td style="text-align:right">${esc(eventDateText(event, lang, t))}</td></tr>
      <tr><td>${t.venue}</td><td style="text-align:right">${esc(labelOr(event.venue, lang, t.tbc))}</td></tr>
      <tr><td>${t.time}</td><td style="text-align:right">${esc(labelOr(event.eventTimeLabel, lang, t.tbc))}</td></tr>
    </table>
    <p style="text-align:center;margin:28px 0">
      <a href="${link}" style="display:inline-block;background:#C4531A;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700">${m.see}</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#8B6B3D;margin:0 0 20px">${m.keep}</p>
    <p style="font-size:14px;margin:0">${m.team}</p>
  `, m);

  await tr.sendMail({
    from: `"${fromName()}" <${fromEmail()}>`,
    replyTo: fromEmail(),
    to: order.buyer.email,
    bcc: bccFor(order.buyer.email),
    subject: m.subject(order.orderNumber),
    html,
    attachments: [
      logoAttachment(),
      { filename: `Billets-MIAWEZON-${order.orderNumber}.pdf`, content: pdf, contentType: 'application/pdf' },
    ],
  });
  return true;
}

async function sendWaitlistEmail({ entry }) {
  const tr = getTransporter();
  if (!tr) return false;
  const m = M[entry.lang === 'en' ? 'en' : 'fr'];
  const html = layout(`
    <p style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#8B3A0F;margin:0 0 14px">${m.waitTitle}</p>
    <p style="font-size:16px;margin:0 0 12px">${m.hello}${entry.name ? ` <strong>${esc(entry.name)}</strong>` : ''},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px">${m.waitBody}</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${frontUrl()}/miawezon#billetterie" style="display:inline-block;background:#C4531A;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700">${m.waitCta}</a>
    </p>
    <p style="font-size:14px;margin:0">${m.team}</p>
  `, m);
  await tr.sendMail({
    from: `"${fromName()}" <${fromEmail()}>`,
    replyTo: fromEmail(),
    to: entry.email,
    subject: m.waitSubject,
    html,
    attachments: [logoAttachment()],
  });
  return true;
}


// ─── Paiement par virement ──────────────────────────────────────────────────

const V = {
  fr: {
    instrSubject: (n) => `MIAWÉZON : finalisez votre réservation ${n}`,
    instrTitle: 'Votre réservation est enregistrée',
    instrIntro: 'Merci pour votre réservation ! Pour la finaliser, effectuez un virement du montant exact sur l\'un des comptes ci-dessous, puis envoyez-nous votre reçu depuis le site.',
    amount: 'Montant à virer',
    motive: 'Motif du virement',
    accounts: 'Comptes bancaires',
    bank: 'Banque', holder: 'Titulaire', rib: 'RIB', iban: 'IBAN', swift: 'SWIFT',
    deadline: (d) => `Vos places sont réservées jusqu'au ${d}. Passé ce délai, la réservation est annulée.`,
    upload: 'Envoyer mon reçu de virement',
    noAccount: 'Les coordonnées bancaires vous seront communiquées très vite.',
    ackSubject: (n) => `MIAWÉZON : reçu bien reçu (${n})`,
    ackTitle: 'Nous avons bien reçu votre reçu',
    ack: (h) => `Merci ! Notre équipe vérifie votre virement. Votre achat sera validé sous ${h} heures au plus, et vous recevrez alors vos billets par e-mail.`,
    rejSubject: (n) => `MIAWÉZON : paiement non validé (${n})`,
    rejTitle: 'Votre paiement n\'a pas pu être validé',
    rej: 'Nous n\'avons pas pu valider le virement correspondant à votre réservation. Les places ont été remises en vente.',
    reason: 'Motif',
    rejHelp: 'Si vous pensez qu\'il s\'agit d\'une erreur, répondez simplement à ce courriel avec votre preuve de paiement.',
  },
  en: {
    instrSubject: (n) => `MIAWÉZON: complete your booking ${n}`,
    instrTitle: 'Your booking is registered',
    instrIntro: 'Thank you for your booking! To complete it, make a bank transfer of the exact amount to one of the accounts below, then send us your receipt from the website.',
    amount: 'Amount to transfer',
    motive: 'Transfer reference',
    accounts: 'Bank accounts',
    bank: 'Bank', holder: 'Account holder', rib: 'RIB', iban: 'IBAN', swift: 'SWIFT',
    deadline: (d) => `Your seats are held until ${d}. After that, the booking is cancelled.`,
    upload: 'Send my transfer receipt',
    noAccount: 'Bank details will be shared with you very soon.',
    ackSubject: (n) => `MIAWÉZON: receipt received (${n})`,
    ackTitle: 'We have received your receipt',
    ack: (h) => `Thank you! Our team is checking your transfer. Your purchase will be validated within ${h} hours at most, and you will then receive your tickets by email.`,
    rejSubject: (n) => `MIAWÉZON: payment not validated (${n})`,
    rejTitle: 'Your payment could not be validated',
    rej: 'We could not validate the transfer for your booking. The seats have been released.',
    reason: 'Reason',
    rejHelp: 'If you think this is a mistake, simply reply to this email with your proof of payment.',
  },
};

const fmtDateTime = (d, lang) => new Date(d).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' });
const resumeLink = (order, token) => `${frontUrl()}/miawezon/reserver?order=${order._id}&t=${token}`;

function accountsHtml(accounts, v) {
  if (!accounts.length) return `<p style="font-size:14px;color:#8B6B3D">${v.noAccount}</p>`;
  return accounts.map((b) => `
    <div style="background:#fff;border:1px solid #E4D3B5;border-radius:12px;padding:14px 16px;margin:0 0 10px">
      ${b.bank ? `<p style="margin:0 0 6px;font-weight:700;color:#8B3A0F">${esc(b.bank)}</p>` : ''}
      ${b.holder ? `<p style="margin:0;font-size:13px;color:#5C3D11">${v.holder} : <strong>${esc(b.holder)}</strong></p>` : ''}
      ${b.rib ? `<p style="margin:4px 0 0;font-size:13px;color:#5C3D11">${v.rib} : <strong style="font-family:Consolas,monospace;letter-spacing:1px">${esc(b.rib)}</strong></p>` : ''}
      ${b.iban ? `<p style="margin:4px 0 0;font-size:13px;color:#5C3D11">${v.iban} : <strong style="font-family:Consolas,monospace">${esc(b.iban)}</strong></p>` : ''}
      ${b.swift ? `<p style="margin:4px 0 0;font-size:13px;color:#5C3D11">${v.swift} : <strong>${esc(b.swift)}</strong></p>` : ''}
    </div>`).join('');
}

async function send(to, subject, inner, m, extra = []) {
  const tr = getTransporter();
  if (!tr) { console.warn('MIAWEZON: SMTP non configure, courriel non envoye :', subject); return false; }
  await tr.sendMail({
    from: `"${fromName()}" <${fromEmail()}>`,
    replyTo: fromEmail(),
    to,
    bcc: bccFor(to),
    subject,
    html: layout(inner, m),
    attachments: [logoAttachment(), ...extra],
  });
  return true;
}

// Instructions de virement, envoyees juste apres la reservation
async function sendTransferInstructions({ order, event, token }) {
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const m = M[lang]; const v = V[lang];
  const accounts = (event.bankAccounts || []).filter((b) => b && (b.rib || b.iban));
  const inner = `
    <p style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#8B3A0F;margin:0 0 14px">${v.instrTitle}</p>
    <p style="font-size:16px;margin:0 0 12px">${m.hello} <strong>${esc(order.buyer.name)}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${v.instrIntro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 18px">
      <tr><td style="padding:6px 0;color:#5C3D11">${v.amount}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#C4531A;font-size:18px">${fmtPrice(order.total)}</td></tr>
      <tr><td style="padding:6px 0;color:#5C3D11">${v.motive}</td><td style="padding:6px 0;text-align:right;font-weight:700;font-family:Consolas,monospace">${esc(order.orderNumber)}</td></tr>
    </table>
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8B6B3D;margin:0 0 8px">${v.accounts}</p>
    ${accountsHtml(accounts, v)}
    <p style="font-size:13px;line-height:1.6;color:#8B6B3D;margin:16px 0 0">${v.deadline(fmtDateTime(order.expiresAt, lang))}</p>
    <p style="text-align:center;margin:26px 0">
      <a href="${resumeLink(order, token)}" style="display:inline-block;background:#C4531A;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700">${v.upload}</a>
    </p>
    <p style="font-size:14px;margin:0">${m.team}</p>`;
  return send(order.buyer.email, v.instrSubject(order.orderNumber), inner, m);
}

// Accuse de reception du reçu
async function sendProofReceived({ order, event }) {
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const m = M[lang]; const v = V[lang];
  const inner = `
    <p style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#8B3A0F;margin:0 0 14px">${v.ackTitle}</p>
    <p style="font-size:16px;margin:0 0 12px">${m.hello} <strong>${esc(order.buyer.name)}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${v.ack(event.validationHours || 24)}</p>
    <p style="font-size:13px;color:#8B6B3D;margin:0 0 20px">${v.motive} : <strong>${esc(order.orderNumber)}</strong> · ${fmtPrice(order.total)}</p>
    <p style="font-size:14px;margin:0">${m.team}</p>`;
  return send(order.buyer.email, v.ackSubject(order.orderNumber), inner, m);
}

// Refus du reçu
async function sendRejected({ order, reason }) {
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const m = M[lang]; const v = V[lang];
  const inner = `
    <p style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#8B3A0F;margin:0 0 14px">${v.rejTitle}</p>
    <p style="font-size:16px;margin:0 0 12px">${m.hello} <strong>${esc(order.buyer.name)}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${v.rej}</p>
    ${reason ? `<p style="font-size:14px;line-height:1.6;margin:0 0 14px;background:#fff;border:1px solid #E4D3B5;border-radius:10px;padding:12px 14px"><strong>${v.reason} :</strong> ${esc(reason)}</p>` : ''}
    <p style="font-size:13px;line-height:1.6;color:#8B6B3D;margin:0 0 20px">${v.rejHelp}</p>
    <p style="font-size:14px;margin:0">${m.team}</p>`;
  return send(order.buyer.email, v.rejSubject(order.orderNumber), inner, m);
}

// Alerte a l'equipe : un reçu attend une validation
async function sendAdminProofNotice({ order, proofPath, proofName, proofMime }) {
  const to = process.env.MIAWEZON_ADMIN_EMAIL || fromEmail();
  const m = M.fr;
  const inner = `
    <p style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#8B3A0F;margin:0 0 14px">Nouveau reçu de virement à valider</p>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:4px 0;color:#5C3D11">Commande</td><td style="text-align:right;font-weight:700">${esc(order.orderNumber)}</td></tr>
      <tr><td style="padding:4px 0;color:#5C3D11">Client</td><td style="text-align:right">${esc(order.buyer.name)}</td></tr>
      <tr><td style="padding:4px 0;color:#5C3D11">Téléphone</td><td style="text-align:right">${esc(order.buyer.phone)}</td></tr>
      <tr><td style="padding:4px 0;color:#5C3D11">Billets</td><td style="text-align:right">${order.items.map((i) => `${esc(i.code)} x${i.quantity}`).join(', ')}</td></tr>
      <tr><td style="padding:4px 0;color:#5C3D11">Montant attendu</td><td style="text-align:right;font-weight:700;color:#C4531A">${fmtPrice(order.total)}</td></tr>
    </table>
    <p style="font-size:14px;line-height:1.6;margin:18px 0">Le reçu est joint à ce courriel. Validez ou refusez l'achat depuis le tableau de bord, sous 24 heures.</p>
    <p style="text-align:center;margin:22px 0">
      <a href="${frontUrl()}/admin/miawezon?commande=${order._id}" style="display:inline-block;background:#C4531A;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:700">Ouvrir le tableau de bord</a>
    </p>`;
  const extra = proofPath ? [{ filename: proofName || 'recu', path: proofPath, contentType: proofMime }] : [];
  return send(to, `Reçu à valider : ${order.orderNumber} (${order.buyer.name})`, inner, m, extra);
}

// ─── Rappels automatiques ────────────────────────────────────────────────────

const R = {
  fr: {
    holdSubject: (n) => `MIAWÉZON : votre réservation ${n} expire bientôt`,
    holdTitle: 'Votre réservation expire bientôt',
    hold: (d) => `Nous n'avons pas encore reçu le reçu de votre virement. Vos places restent réservées jusqu'au <strong>${d}</strong>. Passé ce délai, elles seront remises en vente.`,
    holdHelp: 'Déjà fait le virement ? Il suffit d\'ajouter votre reçu (PDF ou photo) en cliquant ci-dessous.',
    holdBtn: 'Envoyer mon reçu',
    expSubject: (n) => `MIAWÉZON : votre réservation ${n} a expiré`,
    expTitle: 'Votre réservation a expiré',
    exp: 'Nous n\'avons pas reçu le reçu de votre virement dans le délai prévu. Vos places ont donc été remises en vente.',
    expHelp: 'Vous avez fait le virement ? Répondez à ce courriel avec votre reçu, nous vérifierons votre situation. Sinon, vous pouvez réserver à nouveau, dans la limite des places disponibles.',
    expBtn: 'Réserver à nouveau',
    eveSubject: 'MIAWÉZON, c\'est demain !',
    eveTitle: 'C\'est demain !',
    eve: 'Nous avons hâte de vous accueillir à MIAWÉZON. Voici le rappel des informations pratiques :',
    eveKeep: 'Pensez à présenter le QR code de chaque billet à l\'entrée, sur votre téléphone ou imprimé.',
    eveBtn: 'Voir mes billets',
  },
  en: {
    holdSubject: (n) => `MIAWÉZON: your booking ${n} expires soon`,
    holdTitle: 'Your booking expires soon',
    hold: (d) => `We have not received your transfer receipt yet. Your seats remain booked until <strong>${d}</strong>. After that, they will be released.`,
    holdHelp: 'Already made the transfer? Just upload your receipt (PDF or photo) using the button below.',
    holdBtn: 'Upload my receipt',
    expSubject: (n) => `MIAWÉZON: your booking ${n} has expired`,
    expTitle: 'Your booking has expired',
    exp: 'We did not receive your transfer receipt in time, so your seats have been released.',
    expHelp: 'Did you make the transfer? Reply to this email with your receipt and we will look into it. Otherwise, you can book again, subject to availability.',
    expBtn: 'Book again',
    eveSubject: 'MIAWÉZON is tomorrow!',
    eveTitle: 'See you tomorrow!',
    eve: 'We look forward to welcoming you to MIAWÉZON. Here is a reminder of the practical details:',
    eveKeep: 'Remember to show the QR code of each ticket at the entrance, on your phone or printed.',
    eveBtn: 'View my tickets',
  },
};

const btn = (href, label) => `<p style="text-align:center;margin:26px 0"><a href="${href}" style="display:inline-block;background:#C4531A;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700">${label}</a></p>`;
const title = (txt) => `<p style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#8B3A0F;margin:0 0 14px">${txt}</p>`;

// Rappel au client : reçu non envoye, reservation bientot expiree
async function sendHoldReminder({ order, event, token }) {
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const m = M[lang]; const v = V[lang]; const r = R[lang];
  const accounts = (event.bankAccounts || []).filter((b) => b && (b.rib || b.iban));
  const inner = `
    ${title(r.holdTitle)}
    <p style="font-size:16px;margin:0 0 12px">${m.hello} <strong>${esc(order.buyer.name)}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${r.hold(fmtDateTime(order.expiresAt, lang))}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 18px">
      <tr><td style="padding:6px 0;color:#5C3D11">${v.amount}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#C4531A;font-size:18px">${fmtPrice(order.total)}</td></tr>
      <tr><td style="padding:6px 0;color:#5C3D11">${v.motive}</td><td style="padding:6px 0;text-align:right;font-weight:700;font-family:Consolas,monospace">${esc(order.orderNumber)}</td></tr>
    </table>
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8B6B3D;margin:0 0 8px">${v.accounts}</p>
    ${accountsHtml(accounts, v)}
    <p style="font-size:14px;line-height:1.6;margin:16px 0 0">${r.holdHelp}</p>
    ${btn(resumeLink(order, token), r.holdBtn)}
    <p style="font-size:14px;margin:0">${m.team}</p>`;
  return send(order.buyer.email, r.holdSubject(order.orderNumber), inner, m);
}

// Reservation expiree : places remises en vente
async function sendExpiredNotice({ order }) {
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const m = M[lang]; const r = R[lang];
  const inner = `
    ${title(r.expTitle)}
    <p style="font-size:16px;margin:0 0 12px">${m.hello} <strong>${esc(order.buyer.name)}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${r.exp}</p>
    <p style="font-size:13px;color:#8B6B3D;margin:0 0 14px">${V[lang].motive} : <strong>${esc(order.orderNumber)}</strong> · ${fmtPrice(order.total)}</p>
    <p style="font-size:14px;line-height:1.6;margin:0">${r.expHelp}</p>
    ${btn(`${frontUrl()}/miawezon#billetterie`, r.expBtn)}
    <p style="font-size:14px;margin:0">${m.team}</p>`;
  return send(order.buyer.email, r.expSubject(order.orderNumber), inner, m);
}

// Rappel la veille de l'evenement
async function sendEveReminder({ order, event, token }) {
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const m = M[lang]; const r = R[lang]; const t = T[lang];
  const tickets = order.items.map((i) => `${esc(i.name)} x ${i.quantity}`).join(', ');
  const inner = `
    ${title(r.eveTitle)}
    <p style="font-size:16px;margin:0 0 12px">${m.hello} <strong>${esc(order.buyer.name)}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${r.eve}</p>
    <table style="width:100%;font-size:14px;margin:0 0 16px;color:#5C3D11;border-collapse:collapse">
      <tr><td style="padding:5px 0">${t.date}</td><td style="text-align:right;font-weight:700">${esc(eventDateText(event, lang, t))}</td></tr>
      <tr><td style="padding:5px 0">${t.time}</td><td style="text-align:right;font-weight:700">${esc(labelOr(event.eventTimeLabel, lang, t.tbc))}</td></tr>
      <tr><td style="padding:5px 0">${t.venue}</td><td style="text-align:right;font-weight:700">${esc(labelOr(event.venue, lang, t.tbc))}</td></tr>
      ${event.venueAddress ? `<tr><td></td><td style="text-align:right;font-size:13px">${esc(event.venueAddress)}</td></tr>` : ''}
      <tr><td style="padding:5px 0">${t.order}</td><td style="text-align:right">${esc(order.orderNumber)} · ${tickets}</td></tr>
    </table>
    <p style="font-size:14px;line-height:1.6;margin:0">${r.eveKeep}</p>
    ${btn(ticketsLink(order, token), r.eveBtn)}
    <p style="font-size:14px;margin:0">${m.team}</p>`;
  return send(order.buyer.email, r.eveSubject, inner, m);
}

// Rappel a l'equipe : reçus en attente de validation depuis trop longtemps
async function sendAdminPendingDigest({ orders, hours }) {
  const to = process.env.MIAWEZON_ADMIN_EMAIL || fromEmail();
  const rows = orders.map((o) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #EDE0C4"><a href="${frontUrl()}/admin/miawezon?commande=${o._id}" style="color:#8B3A0F;font-weight:700;text-decoration:none">${esc(o.orderNumber)}</a></td>
        <td style="padding:6px 0;border-bottom:1px solid #EDE0C4">${esc(o.buyer.name)}</td>
        <td style="padding:6px 0;border-bottom:1px solid #EDE0C4;text-align:right">${fmtPrice(o.total)}</td>
      </tr>`).join('');
  const inner = `
    ${title(orders.length > 1 ? `${orders.length} reçus attendent votre validation` : 'Un reçu attend votre validation')}
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Ces reçus de virement ont été envoyés il y a plus de ${hours} heures. Les clients attendent leurs billets.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    ${btn(`${frontUrl()}/admin/miawezon`, 'Ouvrir le tableau de bord')}`;
  return send(to, orders.length > 1 ? `Rappel : ${orders.length} reçus à valider` : `Rappel : reçu à valider (${orders[0].orderNumber})`, inner, M.fr);
}

module.exports = { sendTicketsEmail, sendWaitlistEmail, ticketsLink, sendTransferInstructions, sendProofReceived, sendRejected, sendAdminProofNotice, sendHoldReminder, sendExpiredNotice, sendEveReminder, sendAdminPendingDigest };
