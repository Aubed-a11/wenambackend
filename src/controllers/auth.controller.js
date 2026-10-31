const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { verifyCode } = require('../utils/emailVerification');

const sendResetEmail = async (to, code) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"Wenam" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject: 'Reinitialisation de votre mot de passe - Wenam',
    html: `
      <div style="font-family:Lato,Arial,sans-serif;max-width:480px;margin:auto;background:#FAF3E8;border-radius:16px;overflow:hidden">
        <div style="background:#946420;padding:28px 32px;text-align:center">
          <p style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#fff;margin:0">Wenam</p>
          <p style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:rgba(255,255,255,0.8);margin:4px 0 0">Cuisine africaine facon Benin</p>
        </div>
        <div style="padding:36px 32px;text-align:center">
          <p style="font-size:16px;color:#1A0F00;margin:0 0 8px">Voici votre code de reinitialisation :</p>
          <div style="display:inline-block;background:#fff;border:2px solid #D4B896;border-radius:14px;padding:18px 36px;margin:16px 0">
            <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:#946420">${code}</span>
          </div>
          <p style="font-size:13px;color:#8B6B3D;margin:16px 0 0">Ce code expire dans <strong>1 heure</strong>.</p>
          <p style="font-size:13px;color:#8B6B3D;margin:8px 0 0">Si vous n avez pas fait cette demande, ignorez cet email.</p>
        </div>
      </div>
    `,
  });
};

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );
  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );
  return { accessToken, refreshToken };
};

const setRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const safeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  phone: user.phone,
  address: user.address,
});

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, verificationCode } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nom, email et mot de passe requis' });
    }
    if (!verificationCode) {
      return res.status(400).json({ message: 'Code de verification requis' });
    }
    const valid = verifyCode(email, verificationCode);
    if (!valid) {
      return res.status(400).json({ message: 'Code de verification invalide ou expire' });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Cet email est deja utilise' });
    const user = await User.create({ name, email, password, phone });
    const { accessToken, refreshToken } = generateTokens(user._id);
    await User.findByIdAndUpdate(user._id, { refreshToken });
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ accessToken, user: safeUser(user) });
  } catch (err) { next(err); }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'Compte desactive, contactez le support' });
    }
    const { accessToken, refreshToken } = generateTokens(user._id);
    await User.findByIdAndUpdate(user._id, { refreshToken });
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: safeUser(user) });
  } catch (err) { next(err); }
};

// POST /api/auth/admin/login
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }
    const user = await User.findOne({ email: email.toLowerCase(), role: 'admin' }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Acces non autorise : identifiants incorrects ou role insuffisant' });
    }
    const { accessToken, refreshToken } = generateTokens(user._id);
    await User.findByIdAndUpdate(user._id, { refreshToken });
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: safeUser(user) });
  } catch (err) { next(err); }
};

// POST /api/auth/refresh
exports.refresh = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'Refresh token manquant' });
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ message: 'Refresh token invalide ou expire' });
    }
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: 'Session invalide, reconnectez-vous' });
    }
    const { accessToken, refreshToken } = generateTokens(user._id);
    await User.findByIdAndUpdate(user._id, { refreshToken });
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken });
  } catch (err) { next(err); }
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
      } catch {}
    }
  } catch {}
  res.clearCookie('refreshToken');
  res.json({ message: 'Deconnexion reussie' });
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({ user: safeUser(req.user) });
};

// PUT /api/auth/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, address } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, address },
      { new: true, runValidators: true }
    );
    res.json({ user: safeUser(user) });
  } catch (err) { next(err); }
};

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requis' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ message: 'Si cet email existe, un code vous a ete envoye.' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashed = crypto.createHash('sha256').update(code).digest('hex');
    user.resetPasswordToken = hashed;
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });
    try {
      await sendResetEmail(user.email, code);
    } catch (emailErr) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return next(new Error('Erreur envoi email, reessayez plus tard'));
    }
    res.json({ message: 'Si cet email existe, un code vous a ete envoye.' });
  } catch (err) { next(err); }
};

// POST /api/auth/reset-password
exports.resetPassword = async (req, res, next) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ message: 'Email, code et nouveau mot de passe requis' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caracteres' });
    }
    const hashed = crypto.createHash('sha256').update(code.trim()).digest('hex');
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashed,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+resetPasswordToken +resetPasswordExpire');
    if (!user) return res.status(400).json({ message: 'Code invalide ou expire' });
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    res.json({ message: 'Mot de passe reinitialise avec succes' });
  } catch (err) { next(err); }
};
