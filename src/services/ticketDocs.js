const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

const LOGO = path.join(__dirname, '../assets/miawezon-logo.png');

const C = {
  dark: '#1E120A',
  brown: '#3B2314',
  gold: '#D9A441',
  orange: '#C4531A',
  cream: '#FAF3E8',
  text: '#1A0F00',
  muted: '#8B6B3D',
  line: '#E4D3B5',
};

const qrPayload = (ticket) => `MIAWEZON:${ticket.code}`;

const qrDataUrl = (ticket) =>
  QRCode.toDataURL(qrPayload(ticket), { errorCorrectionLevel: 'M', margin: 1, width: 360, color: { dark: '#1A0F00', light: '#FFFFFF' } });

const qrBuffer = (ticket) =>
  QRCode.toBuffer(qrPayload(ticket), { errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: '#1A0F00', light: '#FFFFFF' } });

const fmtPrice = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA`;

function labelOr(obj, lang, fallback) {
  const v = obj?.[lang] || obj?.fr;
  return v && v.trim() ? v : fallback;
}

const T = {
  fr: {
    tagline: 'Le buffet qui célèbre nos saveurs',
    ticket: 'Billet n°',
    holder: 'Nom',
    category: 'Catégorie',
    date: 'Date',
    venue: 'Lieu',
    time: 'Heure',
    tbc: 'À confirmer',
    order: 'Commande',
    price: 'Prix',
    footer: 'Billet nominatif, valable pour une seule entrée. Présentez le QR code à l\'accueil.',
  },
  en: {
    tagline: 'The buffet that celebrates our flavours',
    ticket: 'Ticket no.',
    holder: 'Name',
    category: 'Category',
    date: 'Date',
    venue: 'Venue',
    time: 'Time',
    tbc: 'To be confirmed',
    order: 'Order',
    price: 'Price',
    footer: 'Personal ticket, valid for one entry only. Show the QR code at the entrance.',
  },
};

function eventDateText(ev, lang, t) {
  const label = labelOr(ev.eventDateLabel, lang, '');
  if (label) return label;
  if (ev.eventDate) {
    return new Date(ev.eventDate).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  return t.tbc;
}

/**
 * Genere un PDF (une page par billet) et retourne un Buffer.
 */
async function ticketsPdf({ order, tickets, event }) {
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const t = T[lang];
  const W = 420;
  const H = 620;
  const doc = new PDFDocument({ size: [W, H], margin: 0, info: { Title: `MIAWEZON ${order.orderNumber}`, Author: 'Wenam' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const hasLogo = fs.existsSync(LOGO);
  const unitPrice = Object.fromEntries(order.items.map((i) => [String(i.category), i.unitPrice]));

  for (let i = 0; i < tickets.length; i++) {
    const tk = tickets[i];
    if (i > 0) doc.addPage({ size: [W, H], margin: 0 });

    // Fond
    doc.rect(0, 0, W, H).fill(C.cream);

    // En-tete sombre
    doc.rect(0, 0, W, 150).fill(C.dark);
    doc.rect(0, 150, W, 4).fill(C.gold);
    if (hasLogo) {
      try { doc.image(LOGO, 28, 30, { fit: [86, 86] }); } catch { /* image illisible */ }
    }
    const tx = hasLogo ? 128 : 28;
    doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(30).text('MIAWÉZON', tx, 50, { width: W - tx - 24 });
    doc.fillColor('#F3E3C3').font('Helvetica').fontSize(11).text(t.tagline, tx, 88, { width: W - tx - 24 });

    // Numero
    doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(t.ticket.toUpperCase(), 28, 178);
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(15).text(tk.number, 28, 191);

    // Champs
    const rows = [
      [t.holder, tk.holderName],
      [t.category, `${tk.categoryName}${tk.categoryCode === 'AGBADJA' ? ' (VIP)' : ''}`],
      [t.price, fmtPrice(unitPrice[String(tk.category)])],
      [t.date, eventDateText(event, lang, t)],
      [t.venue, labelOr(event.venue, lang, t.tbc)],
      [t.time, labelOr(event.eventTimeLabel, lang, t.tbc)],
    ];
    let y = 230;
    for (const [k, v] of rows) {
      doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(k.toUpperCase(), 28, y);
      doc.fillColor(C.text).font('Helvetica-Bold').fontSize(12).text(String(v), 28, y + 12, { width: 190 });
      y += 40;
    }

    // QR
    const qr = await qrBuffer(tk);
    doc.roundedRect(226, 222, 168, 168, 10).fill('#FFFFFF');
    doc.image(qr, 234, 230, { width: 152, height: 152 });
    doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(`${t.order} ${order.orderNumber}`, 226, 398, { width: 168, align: 'center' });

    // Ligne de decoupe
    doc.moveTo(28, 486).lineTo(W - 28, 486).dash(4, { space: 4 }).strokeColor(C.line).stroke().undash();

    doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(t.footer, 28, 500, { width: W - 56, align: 'center' });

    // Pied
    doc.rect(0, H - 50, W, 50).fill(C.brown);
    doc.fillColor(C.gold).font('Helvetica-Bold').fontSize(12).text('Wênam', 28, H - 32);
    doc.fillColor('#F3E3C3').font('Helvetica').fontSize(9).text('wenamfood.com', W - 160, H - 30, { width: 132, align: 'right' });
  }

  doc.end();
  return done;
}

module.exports = { qrPayload, qrDataUrl, qrBuffer, ticketsPdf, fmtPrice, eventDateText, labelOr, T };
