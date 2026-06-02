const MenuItem = require('../models/MenuItem');

exports.getAll = async (req, res, next) => {
  try {
    const { category, featured, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (category) query.category = category;
    if (featured === 'true') query.featured = true;
    if (search) query.name = { $regex: search, $options: 'i' };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      MenuItem.find(query).sort({ featured: -1, createdAt: -1 }).skip(skip).limit(Number(limit)),
      MenuItem.countDocuments(query),
    ]);
    res.json({ items, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Plat non trouvé' });
    res.json({ item });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const item = await MenuItem.create(req.body);
    res.status(201).json({ item });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: 'Plat non trouvé' });
    res.json({ item });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await MenuItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'Plat supprimé' });
  } catch (err) { next(err); }
};

exports.toggleAvailability = async (req, res, next) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Plat non trouvé' });
    item.isAvailable = !item.isAvailable;
    await item.save();
    res.json({ item });
  } catch (err) { next(err); }
};
