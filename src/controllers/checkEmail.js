const dns = require('dns').promises;

const DISPOSABLE_DOMAINS = [
  'yopmail.com','tempmail.com','guerrillamail.com','mailinator.com',
  'throwam.com','trashmail.com','sharklasers.com','maildrop.cc',
  'fakeinbox.com','getnada.com','discard.email','spam4.me',
  'binkmail.com','clrmail.com','dispostable.com','mailnull.com',
];

exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ valid: false, disposable: false });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) return res.json({ valid: false, disposable: false });
    const domain = email.split('@')[1].toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(domain)) return res.json({ valid: true, disposable: true });
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) return res.json({ valid: false, disposable: false });
    } catch {
      return res.json({ valid: false, disposable: false });
    }
    return res.json({ valid: true, disposable: false });
  } catch {
    return res.json({ valid: true, disposable: false });
  }
};
