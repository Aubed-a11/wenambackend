const express = require('express');
const rateLimit = require('express-rate-limit');
const pub = require('../controllers/miawezon.controller');
const admin = require('../controllers/miawezonAdmin.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const router = express.Router();

// Reçus de virement : stockes hors du dossier public, lisibles seulement par l'admin
fs.mkdirSync(pub.PROOF_DIR, { recursive: true });
const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const proofUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, pub.PROOF_DIR),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '').toLowerCase().match(/^\.(pdf|jpe?g|png|webp|heic|heif)$/) || ['.bin'])[0];
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (PROOF_TYPES.includes(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('Format accepté : PDF, JPG, PNG ou WEBP'), { statusCode: 400 }))),
});
const proofLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });
const withProof = (req, res, next) => proofUpload.single('receipt')(req, res, (err) => {
  if (!err) return next();
  const tooBig = err.code === 'LIMIT_FILE_SIZE';
  res.status(400).json({ message: tooBig ? 'Fichier trop lourd (10 Mo maximum)' : err.message, code: tooBig ? 'FILE_TOO_LARGE' : 'BAD_FILE' });
});

const orderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const waitlistLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// ── Public ──
router.get('/event', pub.getEvent);
router.get('/menu/:tier.pdf', pub.menuPdf);
router.post('/waitlist', waitlistLimiter, pub.joinWaitlist);
router.post('/orders', orderLimiter, pub.createOrder);
router.get('/orders/:id', pub.getOrder);
router.get('/verify/:code', verifyLimiter, pub.verifyTicket);
router.post('/orders/:id/confirm', orderLimiter, pub.confirmOrder);
router.post('/orders/:id/cancel', pub.cancelPending);
router.get('/orders/:id/tickets.pdf', pub.downloadPdf);
router.post('/orders/:id/pay', orderLimiter, pub.startPayment);
router.post('/orders/:id/proof', proofLimiter, withProof, pub.submitProof);
router.post('/webhook/youcanpay', pub.youcanpayWebhook);

// ── Admin ──
const a = [verifyToken, isAdmin];
router.get('/admin/config', a, admin.getConfig);
router.put('/admin/event', a, admin.updateEvent);
router.put('/admin/menu', a, admin.updateMenu);
router.put('/admin/categories/:id', a, admin.updateCategory);
router.get('/admin/stats', a, admin.getStats);
router.get('/admin/orders', a, admin.listOrders);
router.get('/admin/orders.csv', a, admin.exportOrders);
router.get('/admin/orders/:id', a, admin.getOrder);
router.post('/admin/orders/:id/resend', a, admin.resendEmail);
router.get('/admin/orders/:id/link', a, admin.ticketsLink);
router.post('/admin/orders/:id/verify', a, admin.verifyPayment);
router.post('/admin/orders/:id/cancel', a, admin.cancelOrder);
router.get('/admin/orders/:id/proof', a, admin.getProof);
router.post('/admin/orders/:id/approve', a, admin.approveOrder);
router.post('/admin/orders/:id/reject', a, admin.rejectOrder);
router.get('/admin/pending', a, admin.pendingCount);
router.get('/admin/waitlist', a, admin.listWaitlist);
router.post('/admin/waitlist/notify', a, admin.notifyWaitlist);
router.get('/admin/checkin', a, admin.checkinStats);
router.post('/admin/checkin', a, admin.checkin);
router.get('/admin/participants', a, admin.listParticipants);
router.get('/admin/participants.csv', a, admin.exportParticipants);

module.exports = router;
