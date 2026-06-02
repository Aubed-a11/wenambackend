const { Review } = require('../models/Review');
const Order = require('../models/Order');
const User = require('../models/User');
const MenuItem = require('../models/MenuItem');

// ---- REVIEW CONTROLLER ----
exports.review = {
  getPublic: async (req, res, next) => {
    try {
      const reviews = await Review.find({ isApproved: true }).populate('user', 'name avatar').sort({ createdAt: -1 }).limit(20);
      res.json({ reviews });
    } catch (err) { next(err); }
  },
  getAll: async (req, res, next) => {
    try {
      const { approved } = req.query;
      const query = approved !== undefined ? { isApproved: approved === 'true' } : {};
      const reviews = await Review.find(query).populate('user', 'name avatar email').sort({ createdAt: -1 });
      res.json({ reviews });
    } catch (err) { next(err); }
  },
  create: async (req, res, next) => {
    try {
      const { rating, comment, orderId } = req.body;
      const review = await Review.create({ user: req.user._id, order: orderId, rating, comment });
      res.status(201).json({ review });
    } catch (err) { next(err); }
  },
  approve: async (req, res, next) => {
    try {
      const review = await Review.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
      res.json({ review });
    } catch (err) { next(err); }
  },
  respond: async (req, res, next) => {
    try {
      const review = await Review.findByIdAndUpdate(req.params.id, { adminResponse: req.body.response }, { new: true });
      res.json({ review });
    } catch (err) { next(err); }
  },
  remove: async (req, res, next) => {
    try {
      await Review.findByIdAndDelete(req.params.id);
      res.json({ message: 'Avis supprimé' });
    } catch (err) { next(err); }
  },
};

// ---- ANALYTICS CONTROLLER ----
exports.analytics = {
  summary: async (req, res, next) => {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [totalSales, newOrders, onlineProducts, newReviews] = await Promise.all([
        Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
        Order.countDocuments({ createdAt: { $gte: weekAgo } }),
        MenuItem.countDocuments({ isAvailable: true }),
        Review.countDocuments({ createdAt: { $gte: weekAgo } }),
      ]);
      res.json({
        totalSales: totalSales[0]?.total || 0,
        newOrders,
        onlineProducts,
        newReviews,
      });
    } catch (err) { next(err); }
  },
  weeklySales: async (req, res, next) => {
    try {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const start = new Date(); start.setDate(start.getDate() - i); start.setHours(0,0,0,0);
        const end = new Date(start); end.setHours(23,59,59,999);
        const result = await Order.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end }, paymentStatus: 'paid' } },
          { $group: { _id: null, total: { $sum: '$total' } } },
        ]);
        days.push({ date: start.toISOString().split('T')[0], total: result[0]?.total || 0 });
      }
      res.json({ data: days });
    } catch (err) { next(err); }
  },
  users: async (req, res, next) => {
    try {
      const users = await User.find({ role: 'client' }).sort({ createdAt: -1 });
      res.json({ users });
    } catch (err) { next(err); }
  },
  toggleUser: async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      user.isActive = !user.isActive;
      await user.save();
      res.json({ user });
    } catch (err) { next(err); }
  },
};
