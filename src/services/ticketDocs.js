const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

// Modeles de billets fournis par la cliente (zones a remplir deja videes).
// Les positions des champs sont dans tickets/layout.json (copie identique dans le front).
const ASSETS = path.join(__dirname, '../assets');
const TPL_DIR = path.join(ASSETS, 'tickets');
const LAYOUT = JSON.parse(fs.readFileSync(path.join(TPL_DIR, 'layout.json'), 'utf8'));
const LOGO = path.join(ASSETS, 'wenam-logo.png');
const FONTS = {
  600: path.join(ASSETS, 'fonts/montserrat-latin-600-normal.woff'),
  700: path.join(ASSETS, 'fonts/montserrat-latin-700-normal.woff'),
  800: path.join(ASSETS, 'fonts/montserrat-latin-800-normal.woff'),
};

const qrPayload = (ticket) => `MIAWEZON:${ticket.code}`;

// QR code fond transparent, pour se poser sur le talon dore des modeles
const QR_OPTS = { errorCorrectionLevel: 'M', margin: 0, color: { dark: '#1A0F00', light: '#00000000' } };
const qrDataUrl = (ticket) => QRCode.toDataURL(qrPayload(ticket), { ...QR_OPTS, width: 360 });
const qrBuffer = (ticket) => QRCode.toBuffer(qrPayload(ticket), { ...QR_OPTS, width: 480 });

const fmtPrice = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} DH`;

function labelOr(obj, lang, fallback) {
  const v = obj?.[lang] || obj?.fr;
  return v && v.trim() ? v : fallback;
}

const T = {
  fr: { date: 'Date', venue: 'Lieu', time: 'Heure', tbc: 'À confirmer', order: 'Commande' },
  en: { date: 'Date', venue: 'Venue', time: 'Time', tbc: 'To be confirmed', order: 'Order' },
};

function eventDateText(ev, lang, t) {
  const label = labelOr(ev.eventDateLabel, lang, '');
  if (label) return label;
  if (ev.eventDate) {
    return new Date(ev.eventDate).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Casablanca' });
  }
  return t.tbc;
}

// Date courte pour le billet : "15 mai 2027 · 19h00"
function ticketDateText(ev, lang, t) {
  const label = labelOr(ev.eventDateLabel, lang, '');
  const time = labelOr(ev.eventTimeLabel, lang, '');
  let date = label;
  if (!date && ev.eventDate) {
    date = new Date(ev.eventDate).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Casablanca' });
  }
  if (!date) return t.tbc;
  return time ? `${date} · ${time}` : date;
}

const layoutFor = (code) => LAYOUT[code] || LAYOUT.ZINLI;

// Contenu des champs d'un billet (partage avec la page web via orderPayload)
function ticketFields({ ticket, order, event }) {
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const t = T[lang];
  const unit = order.items.find((i) => String(i.category) === String(ticket.category))?.unitPrice;
  return {
    price: fmtPrice(unit),
    stubPrice: fmtPrice(unit),
    date: ticketDateText(event, lang, t),
    venue: labelOr(event.venue, lang, t.tbc),
    number: ticket.number,
    holder: ticket.holderName,
    purchase: order.orderNumber,
  };
}

// Ecrit un texte dans un champ : reduit la taille si besoin, puis tronque
function drawField(doc, f, text, s) {
  const font = `mz-${f.weight || 700}`;
  const spacing = (f.spacing || 0) * s;
  const maxW = f.w * s;
  let size = f.size * s;
  const min = Math.max(6, size * 0.55);
  doc.font(font).fontSize(size);
  let str = String(text || '');
  while (doc.widthOfString(str, { characterSpacing: spacing }) > maxW && size > min) {
    size -= 0.25;
    doc.fontSize(size);
  }
  while (doc.widthOfString(str, { characterSpacing: spacing }) > maxW && str.length > 2) {
    str = `${str.slice(0, -2).trimEnd()}…`;
  }
  const w = doc.widthOfString(str, { characterSpacing: spacing });
  let x = f.x * s;
  if (f.align === 'center') x += (maxW - w) / 2;
  if (f.align === 'right') x += maxW - w;
  const y = f.cy * s;
  if (f.gradient) {
    const g = doc.linearGradient(0, y - size / 2, 0, y + size / 2);
    g.stop(0, f.gradient[0]).stop(1, f.gradient[1]);
    doc.fillColor(g);
  } else {
    doc.fillColor(f.color || '#1A0F00');
  }
  doc.text(str, x, y, { lineBreak: false, baseline: 'middle', characterSpacing: spacing });
}

// Largeur d'un billet imprime : 26 cm
const PAGE_W = 737;

/**
 * Genere un PDF (un billet par page) a partir des modeles et retourne un Buffer.
 */
async function ticketsPdf({ order, tickets, event }) {
  const first = layoutFor(tickets[0]?.categoryCode);
  const s0 = PAGE_W / first.width;
  const doc = new PDFDocument({ size: [PAGE_W, first.height * s0], margin: 0, autoFirstPage: false, info: { Title: `MIAWEZON ${order.orderNumber}`, Author: 'Wenam' } });
  for (const [w, file] of Object.entries(FONTS)) doc.registerFont(`mz-${w}`, file);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const hasLogo = fs.existsSync(LOGO);

  for (const tk of tickets) {
    const L = layoutFor(tk.categoryCode);
    const s = PAGE_W / L.width;
    doc.addPage({ size: [PAGE_W, L.height * s], margin: 0 });
    doc.image(path.join(TPL_DIR, L.image), 0, 0, { width: PAGE_W, height: L.height * s });

    const values = ticketFields({ ticket: tk, order, event });
    for (const [key, f] of Object.entries(L.fields)) drawField(doc, f, values[key], s);

    const qr = await qrBuffer(tk);
    doc.image(qr, L.qr.x * s, L.qr.y * s, { width: L.qr.size * s, height: L.qr.size * s });
    if (hasLogo) {
      const g = L.logo;
      // Logo dore sur un badge sombre pour rester lisible sur le talon dore
      if (g.bg) doc.roundedRect(g.x * s, g.y * s, g.w * s, g.h * s, (g.radius || 0) * s).fill(g.bg);
      const pad = (g.pad || 0) * s;
      try {
        doc.image(LOGO, g.x * s + pad, g.y * s + pad, { fit: [g.w * s - 2 * pad, g.h * s - 2 * pad], align: 'center', valign: 'center' });
      } catch { /* image illisible */ }
    }
    if (tk.status === 'cancelled') {
      doc.save().rotate(-12, { origin: [PAGE_W / 2, (L.height * s) / 2] });
      doc.font('mz-800').fontSize(48).fillColor('#B91C1C').fillOpacity(0.6).text('ANNULÉ', 0, (L.height * s) / 2 - 24, { width: PAGE_W, align: 'center' });
      doc.restore().fillOpacity(1);
    }
  }

  doc.end();
  return done;
}

module.exports = { qrPayload, qrDataUrl, qrBuffer, ticketsPdf, ticketFields, fmtPrice, eventDateText, ticketDateText, labelOr, T };
