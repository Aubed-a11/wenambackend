const path = require('path');

exports.uploadImage = (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
};
