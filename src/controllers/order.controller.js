const Order = require('../models/Order');
const Settings = require('../models/Settings');
const { getIO } = require('../config/socket');

exports.create = async (req, res, next) => {
  try {
    const { items, deliveryAddress, paymentMethod, notes, promoCode } = req.body;

    // Apply active promo if any
    const promoDoc = await Settings.findOne({ key: 'promo' });
    const promo = promoDoc?.value;
    let discount = 0;
    if (promo?.active && promo?.percent) {
      discount = 0; // Apply on frontend if needed, for now no auto-discount
    }

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const deliveryFee = 15;
    const total = subtotal + deliveryFee - discount;
    const estimatedDelivery = new Date(Date.now() + 50 * 60 * 1000);

    const order = await Order.create({
      user: req.user._id,
      items,
      subtotal,
      deliveryFee,
      discount,
      total,
      deliveryAddress,
      paymentMethod,
      notes,
      estimatedDelivery,
      statusHistory: [{ status: 'pending', note: 'Commande reçue' }],
    });

    const populated = await Order.findById(order._id).populate('user', 'name email phone');

    // Notify all admins via socket
    try {
      getIO().to('admins').emit('order:new', { order: populated });
    } catch {}

    res.status(201).json({ order: populated });
  } catch (err) { next(err); }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Commande non trouvée' });
    if (req.user.role !== 'admin' && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    res.json({ order });
  } catch (err) { next(err); }
};

exports.getAll = async (req, res, next) => {
  try {
    const { status, paymentStatus, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find(query).populate('user', 'name email phone').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Order.countDocuments(query),
    ]);
    res.json({ orders, total, page: Number(page) });
  } catch (err) { next(err); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id).populate('user', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Commande non trouvée' });

    order.status = status;
    order.statusHistory.push({ status, note: note || '' });
    if (status === 'delivered') order.paymentStatus = 'paid';
    await order.save();

    // Notify the specific client via their socket room
    try {
      getIO().to(`user_${order.user._id.toString()}`).emit('order:status_updated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status,
        estimatedDelivery: order.estimatedDelivery,
      });
    } catch {}

    res.json({ order });
  } catch (err) { next(err); }
};
