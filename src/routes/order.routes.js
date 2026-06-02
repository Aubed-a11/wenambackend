const express = require('express');
const router = express.Router();
const order = require('../controllers/order.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

router.post('/', verifyToken, order.create);
router.get('/my', verifyToken, order.getMyOrders);
router.get('/', verifyToken, isAdmin, order.getAll);
router.get('/:id', verifyToken, order.getOne);
router.put('/:id/status', verifyToken, isAdmin, order.updateStatus);

module.exports = router;
