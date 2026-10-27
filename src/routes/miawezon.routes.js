const express = require('express');
const rateLimit = require('express-rate-limit');
const pub = require('../controllers/miawezon.controller');
const admin = require('../controllers/miawezonAdmin.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

const orderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const waitlistLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// ── Public ──
router.get('/event', pub.getEvent);
router.post('/waitlist', waitlistLimiter, pub.joinWaitlist);
router.post('/orders', orderLimiter, pub.createOrder);
router.get('/orders/:id', pub.getOrder);
router.post('/orders/:id/confirm', orderLimiter, pub.confirmOrder);
router.post('/orders/:id/cancel', pub.cancelPending);
router.get('/orders/:id/tickets.pdf', pub.downloadPdf);
router.post('/webhook/kkiapay', pub.kkiapayWebhook);

// ── Admin ──
const a = [verifyToken, isAdmin];
router.get('/admin/config', a, admin.getConfig);
router.put('/admin/event', a, admin.updateEvent);
router.put('/admin/categories/:id', a, admin.updateCategory);
router.get('/admin/stats', a, admin.getStats);
router.get('/admin/orders', a, admin.listOrders);
router.get('/admin/orders.csv', a, admin.exportOrders);
router.get('/admin/orders/:id', a, admin.getOrder);
router.post('/admin/orders/:id/resend', a, admin.resendEmail);
router.get('/admin/orders/:id/link', a, admin.ticketsLink);
router.post('/admin/orders/:id/verify', a, admin.verifyPayment);
router.post('/admin/orders/:id/cancel', a, admin.cancelOrder);
router.get('/admin/waitlist', a, admin.listWaitlist);
router.post('/admin/waitlist/notify', a, admin.notifyWaitlist);
router.get('/admin/checkin', a, admin.checkinStats);
router.post('/admin/checkin', a, admin.checkin);

module.exports = router;
