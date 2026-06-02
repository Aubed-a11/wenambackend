const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  isApproved: { type: Boolean, default: false },
  adminResponse: { type: String, default: '' },
}, { timestamps: true });

const gallerySchema = new mongoose.Schema({
  title: { type: String, required: true },
  image: { type: String, required: true },
  category: { type: String, enum: ['entrees', 'plats_principaux', 'desserts', 'boissons', 'ambiance'], default: 'ambiance' },
  isFeatured: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = {
  Review: mongoose.model('Review', reviewSchema),
  GalleryItem: mongoose.model('GalleryItem', gallerySchema),
};
