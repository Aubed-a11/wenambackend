const express = require('express');
const router = express.Router();
const { analytics } = require('../controllers/analytics.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');
router.get('/summary', verifyToken, isAdmin, analytics.summary);
router.get('/weekly-sales', verifyToken, isAdmin, analytics.weeklySales);
module.exports = router;
