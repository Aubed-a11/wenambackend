const mongoose = require('mongoose');

// Personnes qui ont clique sur "Me prevenir" avant l'ouverture de la billetterie
const waitlistSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketEvent', required: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  name: { type: String, default: '', trim: true },
  lang: { type: String, enum: ['fr', 'en'], default: 'fr' },
  notifiedAt: Date,
}, { timestamps: true });

waitlistSchema.index({ event: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('TicketWaitlist', waitlistSchema);
