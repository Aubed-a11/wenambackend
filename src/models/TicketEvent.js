const mongoose = require('mongoose');

// Configuration de l'evenement MIAWEZON (un seul document, slug = 'miawezon').
// Les textes de presentation, le menu du buffet et la galerie restent dans le
// frontend (src/data/miawezon.js). Ici on ne garde que ce qui doit etre
// controle cote serveur : dates, lieu, ouverture des ventes.
const ticketEventSchema = new mongoose.Schema({
  slug: { type: String, unique: true, required: true, default: 'miawezon' },
  name: { type: String, default: 'MIAWÉZON' },

  // Rubrique visible sur le site public (les admins la voient toujours)
  published: { type: Boolean, default: false },

  // Date de mise en ligne de la phase 1 (information)
  phase1At: { type: Date, default: () => new Date('2027-01-29T00:00:00+01:00') },
  // Ouverture de la billetterie (phase 2)
  salesOpenAt: { type: Date, default: () => new Date('2027-04-01T00:00:00+01:00') },
  // Fermeture des ventes (optionnelle)
  salesCloseAt: { type: Date, default: null },
  // auto = selon les dates, open = forcer l'ouverture, closed = forcer la fermeture
  salesMode: { type: String, enum: ['auto', 'open', 'closed'], default: 'auto' },

  // Informations pratiques ("A confirmer" tant que vide)
  eventDate: { type: Date, default: null },
  eventDateLabel: { fr: { type: String, default: '' }, en: { type: String, default: '' } },
  eventTimeLabel: { fr: { type: String, default: '' }, en: { type: String, default: '' } },
  venue: { fr: { type: String, default: '' }, en: { type: String, default: '' } },
  venueAddress: { type: String, default: '' },

  // Le menu definitif du buffet a ete transmis (sinon "Menu bientot disponible")
  menuFinal: { type: Boolean, default: false },

  // Menu du buffet, modifiable dans l'admin.
  // tiers : menus ou le plat est servi (ZINLI, AGBADJA)
  menu: {
    type: [{
      _id: false,
      key: { type: String, required: true },
      items: [{
        _id: false,
        name: { fr: { type: String, default: '' }, en: { type: String, default: '' } },
        desc: { fr: { type: String, default: '' }, en: { type: String, default: '' } },
        tiers: { type: [String], default: ['ZINLI', 'AGBADJA'] },
      }],
    }],
    default: undefined,
  },

  maxTicketsPerOrder: { type: Number, default: 10, min: 1, max: 50 },
  contactEmail: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('TicketEvent', ticketEventSchema);
