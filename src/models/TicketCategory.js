const mongoose = require('mongoose');

// Categorie de billet (ZINLI, AGBADJA).
// `reserved` compte les places bloquees : commandes payees + commandes en
// attente de paiement non expirees. Il est modifie uniquement par $inc atomique.
const ticketCategorySchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketEvent', required: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true },
  label: { fr: { type: String, default: '' }, en: { type: String, default: '' } },
  price: { type: Number, required: true, min: 0 },
  capacity: { type: Number, required: true, min: 0 },
  reserved: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { timestamps: true });

ticketCategorySchema.index({ event: 1, code: 1 }, { unique: true });

ticketCategorySchema.virtual('available').get(function () {
  return Math.max(0, this.capacity - this.reserved);
});

module.exports = mongoose.model('TicketCategory', ticketCategorySchema);
