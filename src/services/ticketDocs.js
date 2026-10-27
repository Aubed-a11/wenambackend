const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

const ASSETS = path.join(__dirname, '../assets');
const LOGO = path.join(ASSETS, 'miawezon-logo.png');
// Image du volet gauche par categorie (optionnelle)
const SIDE_IMAGE = {
  ZINLI: path.join(ASSETS, 'billet-zinli.jpg'),
  AGBADJA: path.join(ASSETS, 'billet-agbadja.jpg'),
};
// Categories imprimees en style sombre (VIP)
const DARK = ['AGBADJA'];

// Palettes des billets, tirees de la charte Wenam (identiques au site)
const THEMES = {
  standard: {
    left: '#8B3A0F', leftText: '#FAF3E8', leftMuted: '#EAD3BE',
    body: '#FAF3E8', stub: '#F5ECD7', perf: '#D4B896',
    title: '#8B3A0F', text: '#1A0F00', muted: '#8B6B3D', icon: '#C4531A',
    badgeBg: '#8B3A0F', badgeText: '#FAF3E8', priceBg: '#8B3A0F', priceText: '#FAF3E8',
  },
  vip: {
    left: '#1A0F00', leftText: '#FAF3E8', leftMuted: '#D4B896',
    body: '#1A0F00', stub: '#2B1A0C', perf: '#6E5638',
    title: '#E8763A', text: '#FAF3E8', muted: '#D4B896', icon: '#E8763A',
    badgeBg: '#E8763A', badgeText: '#1A0F00', priceBg: '#E8763A', priceText: '#1A0F00',
  },
};

const qrPayload = (ticket) => `MIAWEZON:${ticket.code}`;

const qrDataUrl = (ticket) =>
  QRCode.toDataURL(qrPayload(ticket), { errorCorrectionLevel: 'M', margin: 1, width: 360, color: { dark: '#1A0F00', light: '#FFFFFF' } });

const qrBuffer = (ticket) =>
  QRCode.toBuffer(qrPayload(ticket), { errorCorrectionLevel: 'M', margin: 1, width: 480, color: { dark: '#1A0F00', light: '#FFFFFF' } });

const fmtPrice = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} MAD`;

function labelOr(obj, lang, fallback) {
  const v = obj?.[lang] || obj?.fr;
  return v && v.trim() ? v : fallback;
}

const T = {
  fr: {
    tagline: 'Le buffet qui célèbre nos saveurs',
    subtitle: 'BUFFET & ÉVÉNEMENT',
    slogan: 'Le goût du partage !',
    ticketWord: 'BILLET',
    ticket: 'N° billet',
    holder: 'Nom',
    category: 'Catégorie',
    date: 'Date',
    venue: 'Lieu',
    time: 'Heure',
    tbc: 'À confirmer',
    order: 'Commande',
    price: 'Prix',
    access: { ZINLI: 'ACCÈS STANDARD', AGBADJA: 'ACCÈS VIP' },
    scan: 'Scannez ce QR code à l\'entrée',
    thanks: 'Merci pour votre confiance !',
    thanksText: 'Votre présence contribue à faire de cet événement un moment unique et inoubliable.',
    conditionsTitle: 'CONDITIONS D\'UTILISATION',
    conditions: [
      'Présentez votre billet (QR code) à l\'entrée.',
      'Ce billet est personnel et non transférable.',
      'En cas de perte, aucun remplacement ne sera effectué.',
      'L\'accès à l\'espace VIP est réservé aux détenteurs du billet AGBADJA.',
    ],
    contact: 'CONTACT',
    footer: 'Billet nominatif, valable pour une seule entrée. Présentez le QR code à l\'accueil.',
  },
  en: {
    tagline: 'The buffet that celebrates our flavours',
    subtitle: 'BUFFET & EVENT',
    slogan: 'A taste of sharing!',
    ticketWord: 'TICKET',
    ticket: 'Ticket no.',
    holder: 'Name',
    category: 'Category',
    date: 'Date',
    venue: 'Venue',
    time: 'Time',
    tbc: 'To be confirmed',
    order: 'Order',
    price: 'Price',
    access: { ZINLI: 'STANDARD ACCESS', AGBADJA: 'VIP ACCESS' },
    scan: 'Scan this QR code at the entrance',
    thanks: 'Thank you for your trust!',
    thanksText: 'Your presence helps make this event a unique and unforgettable moment.',
    conditionsTitle: 'TERMS OF USE',
    conditions: [
      'Show your ticket (QR code) at the entrance.',
      'This ticket is personal and non-transferable.',
      'Lost tickets will not be replaced.',
      'The VIP area is reserved for AGBADJA ticket holders.',
    ],
    contact: 'CONTACT',
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

// Format d'un billet imprimable (paysage, environ 25 x 10 cm)
const W = 720;
const H = 280;
const M = 12;              // marge autour du billet
const TW = W - 2 * M;      // largeur du billet
const TH = H - 2 * M;      // hauteur du billet
const LEFT_W = 200;        // volet gauche
const STUB_W = 168;        // talon avec le QR code
const PERF_X = M + TW - STUB_W;

function drawShell(doc, th, logo) {
  doc.rect(0, 0, W, H).fill('#FFFFFF');
  // Corps du billet
  doc.save();
  doc.roundedRect(M, M, TW, TH, 14).clip();
  doc.rect(M, M, TW, TH).fill(th.body);
  doc.rect(PERF_X, M, STUB_W, TH).fill(th.stub);
  doc.rect(M, M, LEFT_W, TH).fill(th.left);
  if (logo) logo();
  doc.restore();
  // Perforation et encoches
  doc.moveTo(PERF_X, M + 14).lineTo(PERF_X, M + TH - 14).dash(4, { space: 4 }).lineWidth(1.2).strokeColor(th.perf).stroke().undash();
  doc.circle(PERF_X, M, 11).fill('#FFFFFF');
  doc.circle(PERF_X, M + TH, 11).fill('#FFFFFF');
}

function drawLeft(doc, th, t, code) {
  const x = M;
  const img = SIDE_IMAGE[code];
  if (img && fs.existsSync(img)) {
    try { doc.image(img, x, M + TH - 92, { width: LEFT_W, height: 92, cover: [LEFT_W, 92] }); } catch { /* image illisible */ }
  }
  if (fs.existsSync(LOGO)) {
    try { doc.image(LOGO, x + LEFT_W / 2 - 26, M + 18, { fit: [52, 52] }); } catch { /* image illisible */ }
  }
  doc.fillColor(th.leftText).font('Helvetica-Bold').fontSize(20).text('MIAWÉZON', x, M + 78, { width: LEFT_W, align: 'center' });
  doc.fillColor(th.leftMuted).font('Helvetica').fontSize(7.5).text(t.subtitle, x, M + 102, { width: LEFT_W, align: 'center', characterSpacing: 1.5 });
  doc.fillColor(th.leftText).font('Helvetica-BoldOblique').fontSize(13).text(t.slogan, x, M + 124, { width: LEFT_W, align: 'center' });
}

/**
 * Genere un PDF (une page par billet, plus un verso) et retourne un Buffer.
 */
async function ticketsPdf({ order, tickets, event }) {
  const lang = order.lang === 'en' ? 'en' : 'fr';
  const t = T[lang];
  const doc = new PDFDocument({ size: [W, H], margin: 0, info: { Title: `MIAWEZON ${order.orderNumber}`, Author: 'Wenam' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const unitPrice = Object.fromEntries(order.items.map((i) => [String(i.category), i.unitPrice]));
  const dateText = eventDateText(event, lang, t);
  const timeText = labelOr(event.eventTimeLabel, lang, '');
  const venueText = labelOr(event.venue, lang, t.tbc);

  for (let i = 0; i < tickets.length; i++) {
    const tk = tickets[i];
    if (i > 0) doc.addPage({ size: [W, H], margin: 0 });
    const th = DARK.includes(tk.categoryCode) ? THEMES.vip : THEMES.standard;

    drawShell(doc, th, () => drawLeft(doc, th, t, tk.categoryCode));

    // Corps
    const bx = M + LEFT_W + 22;
    const bw = PERF_X - bx - 18;
    doc.fillColor(th.muted).font('Helvetica-Bold').fontSize(9).text(t.ticketWord, bx, M + 22, { characterSpacing: 2 });
    doc.fillColor(th.title).font('Helvetica-Bold').fontSize(30).text(tk.categoryName, bx, M + 34, { width: bw - 110 });

    // Badge d'acces
    const badge = t.access[tk.categoryCode] || t.ticketWord;
    doc.font('Helvetica-Bold').fontSize(8);
    const bwid = doc.widthOfString(badge) + 22;
    doc.roundedRect(bx + bw - bwid, M + 24, bwid, 18, 9).fill(th.badgeBg);
    doc.fillColor(th.badgeText).text(badge, bx + bw - bwid, M + 29.5, { width: bwid, align: 'center', characterSpacing: 0.5 });

    // Lignes d'information
    const rows = [
      [t.date, timeText ? `${dateText} · ${timeText}` : dateText],
      [t.venue, venueText],
      [t.holder, tk.holderName],
      [t.ticket, tk.number],
    ];
    let y = M + 82;
    for (const [k, v] of rows) {
      doc.circle(bx + 3, y + 5, 2.5).fill(th.icon);
      doc.fillColor(th.muted).font('Helvetica').fontSize(8.5).text(`${k} :`, bx + 12, y, { continued: true });
      doc.fillColor(th.text).font('Helvetica-Bold').fontSize(10).text(` ${v}`, { width: bw - 12 });
      y += 22;
    }

    // Prix
    const price = fmtPrice(unitPrice[String(tk.category)]);
    doc.font('Helvetica-Bold').fontSize(14);
    const pw = doc.widthOfString(price) + 28;
    doc.roundedRect(bx, M + TH - 46, pw, 28, 7).fill(th.priceBg);
    doc.fillColor(th.priceText).text(price, bx, M + TH - 38, { width: pw, align: 'center' });

    // Talon : QR code
    const qr = await qrBuffer(tk);
    const qs = 116;
    const qx = PERF_X + (STUB_W - qs) / 2;
    doc.roundedRect(qx - 6, M + 30, qs + 12, qs + 12, 8).fill('#FFFFFF');
    doc.image(qr, qx, M + 36, { width: qs, height: qs });
    doc.fillColor(th.text).font('Helvetica-Bold').fontSize(11).text(tk.number, PERF_X, M + 168, { width: STUB_W, align: 'center' });
    doc.fillColor(th.muted).font('Helvetica').fontSize(8).text(t.scan, PERF_X + 18, M + 188, { width: STUB_W - 36, align: 'center' });
    doc.fillColor(th.muted).font('Helvetica').fontSize(7).text(`${t.order} ${order.orderNumber}`, PERF_X, M + TH - 22, { width: STUB_W, align: 'center' });
  }

  // Verso (commun a tous les billets)
  doc.addPage({ size: [W, H], margin: 0 });
  const th = THEMES.standard;
  doc.rect(0, 0, W, H).fill('#FFFFFF');
  doc.save();
  doc.roundedRect(M, M, TW, TH, 14).clip();
  doc.rect(M, M, TW, TH).fill(th.body);
  doc.rect(M, M, LEFT_W, TH).fill(th.left);
  doc.restore();
  if (fs.existsSync(LOGO)) {
    try { doc.image(LOGO, M + LEFT_W / 2 - 24, M + 22, { fit: [48, 48] }); } catch { /* image illisible */ }
  }
  doc.fillColor(th.leftText).font('Helvetica-Bold').fontSize(18).text('MIAWÉZON', M, M + 78, { width: LEFT_W, align: 'center' });
  doc.fillColor(th.leftText).font('Helvetica-BoldOblique').fontSize(12).text(t.thanks, M + 16, M + 112, { width: LEFT_W - 32, align: 'center' });
  doc.fillColor(th.leftMuted).font('Helvetica').fontSize(8.5).text(t.thanksText, M + 18, M + 140, { width: LEFT_W - 36, align: 'center' });

  const cx = M + LEFT_W + 26;
  const cw = TW - LEFT_W - 52;
  doc.fillColor(th.title).font('Helvetica-Bold').fontSize(10).text(t.conditionsTitle, cx, M + 26, { characterSpacing: 1 });
  let cy = M + 50;
  for (const c of t.conditions) {
    doc.circle(cx + 3, cy + 5, 2.5).fill(th.icon);
    doc.fillColor(th.text).font('Helvetica').fontSize(10).text(c, cx + 14, cy, { width: cw - 14 });
    cy = doc.y + 8;
  }
  const contact = [event.contactPhone, event.contactEmail].filter(Boolean).join('   ·   ');
  if (contact) {
    doc.fillColor(th.title).font('Helvetica-Bold').fontSize(10).text(t.contact, cx, cy + 8, { characterSpacing: 1 });
    doc.fillColor(th.text).font('Helvetica').fontSize(10).text(contact, cx, doc.y + 4, { width: cw });
  }
  doc.fillColor(th.title).font('Helvetica-BoldOblique').fontSize(13).text(t.slogan, cx, M + TH - 34, { width: cw, align: 'right' });

  doc.end();
  return done;
}

module.exports = { qrPayload, qrDataUrl, qrBuffer, ticketsPdf, fmtPrice, eventDateText, labelOr, T };
