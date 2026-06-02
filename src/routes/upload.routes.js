const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('../middleware/auth.middleware');
const { uploadImage } = require('../controllers/upload.controller');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif|bmp|heic|heif/;
  const ok = allowed.test(path.extname(file.originalname).toLowerCase()) || file.mimetype.startsWith('image/');
  ok ? cb(null, true) : cb(new Error('Type de fichier non supporté'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 15 * 1024 * 1024 } });

const router = express.Router();

router.post('/', verifyToken, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Image trop lourde (max 15MB)' });
      }
      return res.status(400).json({ message: err.message || 'Erreur upload' });
    }
    next();
  });
}, uploadImage);

module.exports = router;
