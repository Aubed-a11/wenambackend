const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', maxlength: 500 },
  price: { type: Number, required: true, min: 0 },
  category: {
    type: String,
    enum: ['entrees', 'plats_principaux', 'grillades', 'accompagnements', 'desserts', 'boissons', 'autres'],
    required: true
  },
  image: { type: String, default: '' },
  tags: [{ type: String }],
  accompagnements: [{ type: String }],
  isAvailable: { type: Boolean, default: true },
  preparationTime: { type: Number, default: 20 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', menuItemSchema);
