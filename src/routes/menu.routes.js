const express = require('express');
const router = express.Router();
const menu = require('../controllers/menu.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

router.get('/', menu.getAll);
router.get('/:id', menu.getOne);
router.post('/', verifyToken, isAdmin, menu.create);
router.put('/:id', verifyToken, isAdmin, menu.update);
router.delete('/:id', verifyToken, isAdmin, menu.remove);
router.patch('/:id/availability', verifyToken, isAdmin, menu.toggleAvailability);

module.exports = router;
