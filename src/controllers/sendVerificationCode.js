const { generateCode } = require('../utils/emailVerification');
const nodemailer = require('nodemailer');

const ALLOWED_DOMAINS = [
  // Google
  'gmail.com', 'googlemail.com',
  // Microsoft
  'outlook.com', 'hotmail.com', 'hotmail.fr', 'hotmail.be', 'hotmail.ca',
  'live.com', 'live.fr', 'live.be', 'live.ca', 'msn.com', 'passport.com',
  // Yahoo
  'yahoo.com', 'yahoo.fr', 'yahoo.be', 'yahoo.ca', 'yahoo.co.uk',
  'ymail.com',
  // Apple
  'icloud.com', 'me.com', 'mac.com',
  // ProtonMail
  'protonmail.com', 'protonmail.ch', 'proton.me', 'pm.me',
  // France
  'orange.fr', 'wanadoo.fr', 'free.fr', 'laposte.net', 'sfr.fr',
  'neuf.fr', 'bbox.fr', 'numericable.fr', 'club-internet.fr',
  'cegetel.net', 'aliceadsl.fr', 'voila.fr',
  // Belgique / Suisse
  'skynet.be', 'telenet.be', 'proximus.be', 'bluewin.ch',
  // Afrique
  'yahoo.co.in', 'rocketmail.com',
  // Autres majeurs
  'aol.com', 'aim.com',
  'gmx.com', 'gmx.fr', 'gmx.net', 'gmx.de',
  'web.de', 't-online.de',
  'zoho.com', 'fastmail.com', 'tutanota.com',
  'yandex.com', 'yandex.ru', 'mail.ru', 'inbox.ru',
];

const DISPOSABLE_DOMAINS = [
  'yopmail.com', 'tempmail.com', 'guerrillamail.com', 'mailinator.com',
  'throwam.com', 'trashmail.com', 'sharklasers.com', 'maildrop.cc',
  'fakeinbox.com', 'getnada.com', 'discard.email', 'spam4.me',
  'binkmail.com', 'clrmail.com', 'dispostable.com', 'mailnull.com',
];

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

exports.sendVerificationCode = async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requis' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Adresse email invalide' });
    }

    const domain = email.split('@')[1].toLowerCase();

    if (DISPOSABLE_DOMAINS.includes(domain)) {
      return res.status(400).json({ message: 'Les adresses email temporaires ne sont pas acceptees' });
    }

    if (!ALLOWED_DOMAINS.includes(domain)) {
      return res.status(400).json({ message: "Veuillez utiliser une adresse email d'un fournisseur reconnu (Gmail, Outlook, Yahoo...)" });
    }

    const code = generateCode(email);
    await transporter.sendMail({
      from: `"Wênam" <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: 'Votre code de confirmation Wênam',
      html: `
        <div style="font-family:Lato,Arial,sans-serif;max-width:480px;margin:0 auto;background:#FAF3E8;border-radius:16px;overflow:hidden;">
          <div style="background:#946420;padding:28px 32px;text-align:center;">
            <img src="https://www.wenamfood.com/images/wenam-logo.png" alt="Wênam"
              width="80" height="80"
              style="display:block;margin:0 auto 12px;object-fit:contain;border-radius:12px;background:#fff;padding:6px;" />
            <p style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#fff;margin:0;">Wênam</p>
            <p style="font-family:Georgia,serif;font-size:13px;font-style:italic;color:rgba(255,255,255,0.85);margin:4px 0 0;">Cuisine africaine façon Bénin</p>
          </div>
          <div style="padding:36px 32px;text-align:center;">
            <p style="font-size:16px;color:#1A0F00;margin:0 0 6px;">Bonjour <strong>${name || ''}</strong>,</p>
            <p style="font-size:15px;color:#1A0F00;margin:0 0 24px;">Voici votre code de confirmation :</p>
            <div style="display:inline-block;background:#fff;border:2px solid #D4B896;border-radius:14px;padding:18px 36px;margin:0 0 24px;">
              <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:#946420;">${code}</span>
            </div>
            <p style="font-size:13px;color:#8B6B3D;margin:0;">Ce code expire dans <strong>15 minutes</strong>.</p>
            <p style="font-size:13px;color:#8B6B3D;margin:10px 0 0;">Si vous n&apos;avez pas demandé ce code, ignorez cet email.</p>
          </div>
        </div>
      `,
    });

    res.json({ message: 'Code envoye' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur lors de l'envoi du code" });
  }
};
