const express = require('express');
const router = express.Router();
const { analytics } = require('../controllers/analytics.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');
router.get('/', verifyToken, isAdmin, analytics.users);
router.patch('/:id/toggle', verifyToken, isAdmin, analytics.toggleUser);
module.exports = router;
