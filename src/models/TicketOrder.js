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
  currency: { type: String, default: 'MAD' },

  // pending  : places bloquees, en attente de paiement
  // paid     : paye, billets emis
  // failed   : paiement refuse
  // expired  : delai de paiement depasse, places liberees
  // cancelled: annule par un admin
  // refund_needed : paye mais plus de place (paiement arrive apres expiration)
  status: {
    type: String,
    // awaiting_validation : reçu de virement envoye, en attente de validation par l'admin
    // rejected : reçu refuse par l'admin, places liberees
    enum: ['pending', 'awaiting_validation', 'paid', 'rejected', 'failed', 'expired', 'cancelled', 'refund_needed'],
    default: 'pending',
    index: true,
  },
  seatsHeld: { type: Boolean, default: true },
  expiresAt: { type: Date, required: true },

  payment: {
    provider: { type: String, default: 'youcanpay' },
    tokenId: { type: String, default: null },
    transactionId: { type: String, default: null },
    method: { type: String, default: '' },
    amount: Number,
    paidAt: Date,
    raw: { type: mongoose.Schema.Types.Mixed, select: false },
  },

  // Paiement par virement : reçu envoye par le client
  proof: {
    file: { type: String, default: null, select: false },
    originalName: String,
    mime: String,
    size: Number,
    reference: { type: String, default: '' },
    uploadedAt: Date,
  },
  validatedAt: Date,
  validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String, default: '' },

  emailSentAt: Date,
  // Rappels automatiques deja envoyes (un seul de chaque)
  reminderSentAt: Date,
  expiredNoticeAt: Date,
  adminRemindedAt: Date,
  eveReminderSentAt: Date,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

ticketOrderSchema.index({ 'payment.transactionId': 1 }, { unique: true, partialFilterExpression: { 'payment.transactionId': { $type: 'string' } } });
ticketOrderSchema.index({ 'buyer.email': 1 });

module.exports = mongoose.model('TicketOrder', ticketOrderSchema);
