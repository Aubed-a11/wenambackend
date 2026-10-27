const nodemailer = require('nodemailer');
const { ticketsPdf, fmtPrice, eventDateText, labelOr, T } = require('./ticketDocs');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

const frontUrl = () => (process.env.FRONTEND_URL || 'https://www.wenamfood.com').replace(/\/$/, '');

const ticketsLink = (order, token) => `${frontUrl()}/miawezon/billets/${order._id}?t=${token}`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const M = {
  fr: {
    subject: (n) => `Vos billets MIAWÉZON - ${n}`,
    hello: 'Bonjour',
    thanks: 'Votre réservation pour MIAWÉZON est confirmée. Vos billets sont joints à ce courriel au format PDF.',
    summary: 'Récapitulatif',
    total: 'Total payé',
    see: 'Voir mes billets en ligne',
    keep: 'Présentez le QR code de chaque billet à l\'entrée. Chaque billet est nominatif et valable pour une seule entrée.',
    team: 'Merci de votre confiance,<br>L\'équipe Wênam',
    waitSubject: 'La billetterie MIAWÉZON est ouverte',
    waitBody: 'La billetterie de MIAWÉZON vient d\'ouvrir. Les places sont limitées, réservez la vôtre dès maintenant.',
    waitCta: 'Réserver mes billets',
  },
  en: {
    subject: (n) => `Your MIAWÉZON tickets - ${n}`,
    hello: 'Hello',
    thanks: 'Your MIAWÉZON booking is confirmed. Your tickets are attached to this email as a PDF.',
    summary: 'Summary',
    total: 'Total paid',
    see: 'View my tickets online',
    keep: 'Show the QR code of each ticket at the entrance. Each ticket is personal and valid for one entry only.',
    team: 'Thank you,<br>The Wênam team',
    waitSubject: 'MIAWÉZON ticketing is open',
    waitBody: 'MIAWÉZON ticketing has just opened. Seats are limited, book yours now.',
    waitCta: 'Book my tickets',
  },
};

function layout(inner) {
  return `
  <div style="font-family:Lato,Arial,sans-serif;max-width:560px;margin:0 auto;background:#FAF3E8;border-radius:16px;overflow:hidden;color:#1A0F00">
    <div style="background:#1E120A;padding:28px 32px;text-align:center;border-bottom:4px solid #D9A441">
      <p style="font-family:Georgia,serif;font-size:30px;font-weight:700;color:#D9A441;margin:0;letter-spacing:1px">MIAWÉZON</p>
      <p style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:#F3E3C3;margin:6px 0 0">Wênam</p>
    </div>
    <div style="padding:32px">${inner}</div>
    <div style="background:#3B2314;padding:14px 32px;text-align:center">
      <a href="${frontUrl()}" style="color:#F3E3C3;font-size:12px;text-decoration:none">wenamfood.com</a>
    </div>
  </div>`;
}

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
    <p style="font-size:16px;margin:0 0 12px">${m.hello} <strong>${esc(order.buyer.name)}</strong>,</p>
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
  `);

  await tr.sendMail({
    from: `"Wênam" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
    to: order.buyer.email,
    subject: m.subject(order.orderNumber),
    html,
    attachments: [{ filename: `Billets-MIAWEZON-${order.orderNumber}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  return true;
}

async function sendWaitlistEmail({ entry }) {
  const tr = getTransporter();
  if (!tr) return false;
  const m = M[entry.lang === 'en' ? 'en' : 'fr'];
  const html = layout(`
    <p style="font-size:16px;margin:0 0 12px">${m.hello}${entry.name ? ` <strong>${esc(entry.name)}</strong>` : ''},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px">${m.waitBody}</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${frontUrl()}/miawezon#billetterie" style="display:inline-block;background:#C4531A;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700">${m.waitCta}</a>
    </p>
    <p style="font-size:14px;margin:0">${m.team}</p>
  `);
  await tr.sendMail({
    from: `"Wênam" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
    to: entry.email,
    subject: m.waitSubject,
    html,
  });
  return true;
}

module.exports = { sendTicketsEmail, sendWaitlistEmail, ticketsLink };
