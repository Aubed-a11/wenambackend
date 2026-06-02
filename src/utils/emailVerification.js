const codes = new Map();

exports.generateCode = (email) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  codes.set(email.toLowerCase(), { code, expires: Date.now() + 15 * 60 * 1000 });
  return code;
};

exports.verifyCode = (email, code) => {
  const entry = codes.get(email.toLowerCase());
  if (!entry) return false;
  if (Date.now() > entry.expires) { codes.delete(email.toLowerCase()); return false; }
  if (entry.code !== code) return false;
  codes.delete(email.toLowerCase());
  return true;
};
