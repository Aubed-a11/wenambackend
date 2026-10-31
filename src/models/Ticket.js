const mongoose = require('mongoose');

// Un billet nominatif. Le QR code contient le lien <site>/miawezon/billet/<code>.
const ticketSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketEvent', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketOrder', required: true, index: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketCategory', required: true },
  categoryCode: String,
  categoryName: String,
  number: { type: String, unique: true, required: true }, // MZW-2027-0001-1
  code: { type: String, unique: true, required: true },   // secret, encode dans le QR
  holderName: { type: String, required: true },
  status: { type: String, enum: ['valid', 'used', 'cancelled'], default: 'valid', index: true },
  checkedInAt: Date,
  checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Sorties et retours : outAt est rempli quand la personne sort (scan en mode Sortie)
  outAt: { type: Date, default: null },
  exits: { type: Number, default: 0 },
  reentries: { type: Number, default: 0 },
  lastReentryAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);
