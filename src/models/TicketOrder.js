const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketCategory', required: true },
  code: String,
  name: String,
  unitPrice: Number,
  quantity: { type: Number, min: 1 },
}, { _id: false });

const ticketOrderSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketEvent', required: true },
  orderNumber: { type: String, unique: true, required: true },
  // Jeton secret qui permet au client de consulter sa commande sans compte
  accessToken: { type: String, required: true, select: false },

  buyer: {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
  },
  lang: { type: String, enum: ['fr', 'en'], default: 'fr' },
  items: [itemSchema],
  // Noms a imprimer sur chaque billet (dans l'ordre des items)
  holders: [{ type: String, trim: true }],
  quantity: { type: Number, required: true },
  total: { type: Number, required: true },
  currency: { type: String, default: 'XOF' },

  // pending  : places bloquees, en attente de paiement
  // paid     : paye, billets emis
  // failed   : paiement refuse
  // expired  : delai de paiement depasse, places liberees
  // cancelled: annule par un admin
  // refund_needed : paye mais plus de place (paiement arrive apres expiration)
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'expired', 'cancelled', 'refund_needed'],
    default: 'pending',
    index: true,
  },
  seatsHeld: { type: Boolean, default: true },
  expiresAt: { type: Date, required: true },

  payment: {
    provider: { type: String, default: 'kkiapay' },
    transactionId: { type: String, default: null },
    method: { type: String, default: '' },
    amount: Number,
    paidAt: Date,
    raw: { type: mongoose.Schema.Types.Mixed, select: false },
  },

  emailSentAt: Date,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

ticketOrderSchema.index({ 'payment.transactionId': 1 }, { unique: true, partialFilterExpression: { 'payment.transactionId': { $type: 'string' } } });
ticketOrderSchema.index({ 'buyer.email': 1 });

module.exports = mongoose.model('TicketOrder', ticketOrderSchema);
