const { verifyCode } = require('../utils/emailVerification');

exports.verifyEmailCode = (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ message: 'Email et code requis' });
  const valid = verifyCode(email, code);
  if (!valid) return res.status(400).json({ message: 'Code incorrect ou expiré' });
  res.json({ message: 'Email vérifié', verified: true });
};
