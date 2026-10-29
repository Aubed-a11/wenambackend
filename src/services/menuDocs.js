const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { fmtPrice, ticketDateText, labelOr, T } = require('./ticketDocs');

// Cartes menu generees a partir des modeles fournis (src/assets/menus/*.jpg).
// Les zones (cadre central, bande du bas) sont dans menus/layout.json, copie identique dans le front.
const ASSETS = path.join(__dirname, '../assets');
const DIR = path.join(ASSETS, 'menus');
const LAYOUT = JSON.parse(fs.readFileSync(path.join(DIR, 'layout.json'), 'utf8'));
const LOGOS = {
  dark: path.join(ASSETS, 'miawezon-logo-dark.png'),
  gold: path.join(ASSETS, 'miawezon-logo-gold.png'),
};
const LOGO_RATIO = 900 / 222;
const FONTS = {
  'pf-600': 'playfair-display-latin-600-normal.woff',
  'pf-700': 'playfair-display-latin-700-normal.woff',
  'pf-i400': 'playfair-display-latin-400-italic.woff',
  'ds-700': 'dancing-script-latin-700-normal.woff',
  'mz-600': 'montserrat-latin-600-normal.woff',
  'mz-700': 'montserrat-latin-700-normal.woff',
};

const TIERS = ['ZINLI', 'AGBADJA'];
const SECTIONS = ['entrees', 'plats', 'desserts', 'boissons'];

const M = {
  fr: {
    menu: 'Menu', perPerson: 'par personne', exclusive: (t) => `Exclusif ${t}`, slogan: 'Le goût du partage !',
    sections: { entrees: 'Entrées', plats: 'Plats', desserts: 'Desserts', boissons: 'Boissons' },
  },
  en: {
    menu: 'Menu', perPerson: 'per person', exclusive: (t) => `${t} only`, slogan: 'A taste of sharing!',
    sections: { entrees: 'Starters', plats: 'Mains', desserts: 'Desserts', boissons: 'Drinks' },
  },
};

// Tailles de base (pixels du modele 1024 px de large), reduites ou agrandies pour remplir le cadre
const S = {
  logo: 84, gLogo: 16,
  label: 15, labelSp: 6, gLabel: 6,
  tier: 74, tierSp: 3, gTier: 8,
  cat: 16, gCat: 20,
  divider: 12, gDivider: 30,
  colGap: 44, rowGap: 34,
  secTitle: 30, gSecTitle: 6, rule: 2, ruleW: 40, gRule: 16,
  name: 21, gName: 2, desc: 15, gDesc: 6, badge: 10, badgeSp: 1.2, badgePadX: 9, badgePadY: 4, gItem: 16,
};

const layoutFor = (tier) => LAYOUT[tier] || LAYOUT.ZINLI;

// Plats d'un menu : seulement ceux de la formule, avec la mention "exclusif" pour ceux absents des autres
function menuFor(menu, tier) {
  // Copie simple (le menu peut etre un document Mongoose)
  const plain = JSON.parse(JSON.stringify(menu || []));
  return SECTIONS.map((key) => plain.find((s) => s.key === key) || { key, items: [] })
    .map((s) => ({
      key: s.key,
      items: (s.items || [])
        .filter((i) => (i.tiers || []).includes(tier))
        .map((i) => ({ ...i, exclusive: TIERS.some((x) => !(i.tiers || []).includes(x)) })),
    }))
    .filter((s) => s.items.length);
}

const pick = (obj, lang) => (obj?.[lang] || obj?.fr || '').trim();

function rows(sections) {
  const out = [];
  for (let i = 0; i < sections.length; i += 2) out.push(sections.slice(i, i + 2));
  return out;
}

// Mesure (et dessine si draw = true) le contenu du cadre a l'echelle s.
// Toutes les valeurs sont en pixels du modele, k convertit en points PDF.
function content(doc, { tier, cat, sections, lang, th, logo }, s, k, ox, oy, cw, draw) {
  const m = M[lang];
  let y = 0;
  const px = (v) => v * k;
  const text = (str, font, size, color, { x = 0, w = cw, sp = 0, align = 'center' } = {}) => {
    doc.font(font).fontSize(px(size * s));
    const opts = { width: px(w), align, characterSpacing: px(sp * s), lineGap: 0 };
    const h = doc.heightOfString(str, opts) / k;
    if (draw) doc.fillColor(color).text(str, px(ox + x), px(oy + y), opts);
    return h;
  };

  // Logo
  const lh = S.logo * s;
  if (draw && logo) doc.image(logo, px(ox + (cw - lh * LOGO_RATIO) / 2), px(oy + y), { height: px(lh) });
  y += lh + S.gLogo * s;

  y += text(m.menu.toUpperCase(), 'mz-700', S.label, th.muted, { sp: S.labelSp }) + S.gLabel * s;
  y += text(tier, 'pf-700', S.tier, th.title, { sp: S.tierSp }) + S.gTier * s;
  if (cat) {
    const line = `${pick(cat.label, lang) || cat.name}  ·  ${fmtPrice(cat.price)} ${m.perPerson}`;
    y += text(line, 'mz-600', S.cat, th.text) + S.gCat * s;
  }

  // Separateur : deux filets et un losange
  const dh = S.divider * s;
  if (draw) {
    const cx = ox + cw / 2;
    const cy = oy + y + dh / 2;
    const half = 70 * s;
    const d = 5 * s;
    doc.save().lineWidth(px(1.2 * s)).strokeColor(th.rule)
      .moveTo(px(cx - half - 12 * s), px(cy)).lineTo(px(cx - 12 * s), px(cy)).stroke()
      .moveTo(px(cx + 12 * s), px(cy)).lineTo(px(cx + half + 12 * s), px(cy)).stroke();
    doc.polygon([px(cx), px(cy - d)], [px(cx + d), px(cy)], [px(cx), px(cy + d)], [px(cx - d), px(cy)]).fill(th.rule);
    doc.restore();
  }
  y += dh + S.gDivider * s;

  // Sections en deux colonnes, ligne par ligne
  const colGap = S.colGap * s;
  const colW = (cw - colGap) / 2;
  const list = rows(sections);
  list.forEach((row, ri) => {
    const heights = row.map((sec, ci) => {
      const full = row.length === 1;
      const w = full ? Math.min(cw, colW * 1.3) : colW;
      const x0 = full ? (cw - w) / 2 : ci * (colW + colGap);
      const top = y;
      let h = 0;
      const t = (str, font, size, color, opts = {}) => {
        const saved = y;
        y = top + h;
        const r = text(str, font, size, color, { x: x0, w, ...opts });
        y = saved;
        return r;
      };
      h += t(m.sections[sec.key] || sec.key, 'pf-700', S.secTitle, th.accent) + S.gSecTitle * s;
      if (draw) doc.rect(px(ox + x0 + (w - S.ruleW * s) / 2), px(oy + top + h), px(S.ruleW * s), px(S.rule * s)).fill(th.rule);
      h += S.rule * s + S.gRule * s;
      sec.items.forEach((it, ii) => {
        h += t(pick(it.name, lang), 'pf-600', S.name, th.text);
        const desc = pick(it.desc, lang);
        if (desc) h += S.gName * s + t(desc, 'pf-i400', S.desc, th.muted);
        if (it.exclusive) {
          h += S.gDesc * s;
          const label = m.exclusive(tier).toUpperCase();
          doc.font('mz-700').fontSize(px(S.badge * s));
          const tw = doc.widthOfString(label, { characterSpacing: px(S.badgeSp * s) }) / k;
          const bh = S.badge * s * 1.25 + S.badgePadY * s * 2;
          const bw = tw + S.badgePadX * s * 2;
          if (draw) {
            const bx = x0 + (w - bw) / 2;
            doc.roundedRect(px(ox + bx), px(oy + top + h), px(bw), px(bh), px(bh / 2)).fill(th.badgeBg);
            doc.fillColor(th.badgeText).text(label, px(ox + bx + S.badgePadX * s), px(oy + top + h + S.badgePadY * s + S.badge * s * 0.08), { width: px(tw + 2), characterSpacing: px(S.badgeSp * s), lineBreak: false });
          }
          h += bh;
        }
        if (ii < sec.items.length - 1) h += S.gItem * s;
      });
      return h;
    });
    y += Math.max(...heights) + (ri < list.length - 1 ? S.rowGap * s : 0);
  });
  return y;
}

function footer(doc, { event, lang, th }, L, k) {
  const m = M[lang];
  const t = T[lang];
  const f = L.footer;
  const px = (v) => v * k;
  const date = ticketDateText(event, lang, t);
  const venue = labelOr(event.venue, lang, t.tbc);
  const info = `${date}  ·  ${venue}`.toUpperCase();
  doc.font('ds-700').fontSize(px(36));
  const h1 = doc.heightOfString(m.slogan, { width: px(f.w), align: 'center' }) / k;
  doc.font('mz-700').fontSize(px(14));
  const h2 = doc.heightOfString(info, { width: px(f.w), align: 'center', characterSpacing: px(1.5) }) / k;
  const gap = 8;
  let y = f.y + (f.h - (h1 + gap + h2)) / 2;
  doc.font('ds-700').fontSize(px(36)).fillColor(th.accent).text(m.slogan, px(f.x), px(y), { width: px(f.w), align: 'center' });
  y += h1 + gap;
  doc.font('mz-700').fontSize(px(14)).fillColor(th.muted).text(info, px(f.x), px(y), { width: px(f.w), align: 'center', characterSpacing: px(1.5) });
}

/**
 * PDF de la carte menu d'une formule (une page au format du modele, largeur A4).
 */
async function menuPdf({ tier, event, category, lang = 'fr' }) {
  const code = TIERS.includes(tier) ? tier : 'ZINLI';
  const L = layoutFor(code);
  const PAGE_W = 595.28;
  const k = PAGE_W / L.width;
  const doc = new PDFDocument({ size: [PAGE_W, L.height * k], margin: 0, autoFirstPage: false, info: { Title: `Menu MIAWEZON ${code}` } });
  for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(ASSETS, 'fonts', file));
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.addPage({ size: [PAGE_W, L.height * k], margin: 0 });
  doc.image(path.join(DIR, L.image), 0, 0, { width: PAGE_W, height: L.height * k });

  const lg = lang === 'en' ? 'en' : 'fr';
  const ctx = {
    tier: code, cat: category, lang: lg, th: L.theme,
    sections: menuFor(event.menu, code),
    logo: fs.existsSync(LOGOS[L.logo]) ? LOGOS[L.logo] : null,
  };
  const p = L.panel;
  const cw = p.w - 2 * p.padX;
  const avail = p.h - 2 * p.padY;

  // Plus grande echelle qui tient dans le cadre
  let s = 1.15;
  while (s > 0.5 && content(doc, ctx, s, k, 0, 0, cw, false) > avail) s -= 0.02;
  const h = content(doc, ctx, s, k, 0, 0, cw, false);
  content(doc, ctx, s, k, p.x + p.padX, p.y + p.padY + Math.max(0, (avail - h) / 2), cw, true);
  footer(doc, { event, lang: lg, th: L.theme }, L, k);

  doc.end();
  return done;
}

module.exports = { menuPdf, menuFor, MENU_TIERS: TIERS };
