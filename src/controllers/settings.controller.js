const Settings = require('../models/Settings');

exports.get = async (req, res, next) => {
  try {
    const docs = await Settings.find();
    const result = {};
    docs.forEach(d => result[d.key] = d.value);
    // defaults
    if (!result.promo) result.promo = { active: false, percent: 20, label: 'Ce Weekend', description: '' };
    if (!result.hours) result.hours = { open: '09:00', deliveryStop: '20:00' };
    res.json(result);
  } catch (err) { next(err); }
};

exports.set = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    await Settings.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
    res.json({ ok: true });
  } catch (err) { next(err); }
};

exports.getPublicPromo = async (req, res, next) => {
  try {
    const doc = await Settings.findOne({ key: 'promo' });
    const promo = doc?.value || { active: false, percent: 20, label: 'Ce Weekend', description: '' };
    res.json({ promo });
  } catch (err) { next(err); }
};

exports.getOrdersCount = async (req, res, next) => {
  try {
    const doc = await Settings.findOne({ key: 'ordersCount' });
    res.json({ count: doc?.value || 100 });
  } catch (err) { next(err); }
};

exports.incrementOrders = async (req, res, next) => {
  try {
    const doc = await Settings.findOne({ key: 'ordersCount' });
    const current = doc?.value || 100;
    await Settings.findOneAndUpdate(
      { key: 'ordersCount' },
      { value: current + 1 },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
};
