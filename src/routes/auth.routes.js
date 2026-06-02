const { sendVerificationCode } = require('../controllers/sendVerificationCode');
const { verifyEmailCode } = require('../controllers/verifyEmailCode');
const { checkEmail } = require('../controllers/checkEmail');
const express = require('express');
const router = express.Router();
const auth = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.post('/register', auth.register);
router.post('/login', auth.login);
router.post('/admin/login', auth.adminLogin);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.get('/me', verifyToken, auth.getMe);
router.put('/profile', verifyToken, auth.updateProfile);
router.post('/forgot-password', auth.forgotPassword);
router.post('/reset-password', auth.resetPassword);

router.post('/check-email', checkEmail);
router.post('/send-verification', sendVerificationCode);
router.post('/send-verification-code', sendVerificationCode);
router.post('/verify-email-code', verifyEmailCode);

module.exports = router;
