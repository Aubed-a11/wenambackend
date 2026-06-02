const express = require('express');
const router = express.Router();
const { GalleryItem } = require('../models/Review');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

router.get('/', async (req, res) => {
  const items = await GalleryItem.find().sort({ createdAt: -1 });
  res.json({ items });
});
router.post('/', verifyToken, isAdmin, async (req, res) => {
  const item = await GalleryItem.create(req.body);
  res.status(201).json({ item });
});
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  await GalleryItem.findByIdAndDelete(req.params.id);
  res.json({ message: 'Supprimé' });
});

module.exports = router;
