const express = require('express');
const router = express.Router();
const { review } = require('../controllers/analytics.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

router.get('/', review.getPublic);
router.get('/admin', verifyToken, isAdmin, review.getAll);
router.post('/', verifyToken, review.create);
router.patch('/:id/approve', verifyToken, isAdmin, review.approve);
router.put('/:id/respond', verifyToken, isAdmin, review.respond);
router.delete('/:id', verifyToken, isAdmin, review.remove);

module.exports = router;
