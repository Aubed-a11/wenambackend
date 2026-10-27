// Verification des transactions KKiaPay cote serveur.
// Meme appel que le SDK officiel @kkiapay-org/nodejs-sdk (POST /api/v1/transactions/status),
// ecrit avec fetch pour eviter une dependance supplementaire.
//
// Variables d'environnement :
//   KKIAPAY_PUBLIC_KEY   cle publique (aussi utilisee par le widget dans le front)
//   KKIAPAY_PRIVATE_KEY  cle privee
//   KKIAPAY_SECRET       cle secrete
//   KKIAPAY_SANDBOX      true pour l'environnement de test
//   KKIAPAY_MOCK         true pour simuler les paiements en local (refuse en production)

const SANDBOX_URL = 'https://api-sandbox.kkiapay.me';
const LIVE_URL = 'https://api.kkiapay.me';

const isSandbox = () => String(process.env.KKIAPAY_SANDBOX).toLowerCase() === 'true';

const isMock = () =>
  String(process.env.KKIAPAY_MOCK).toLowerCase() === 'true' && process.env.NODE_ENV !== 'production';

const isConfigured = () =>
  Boolean(process.env.KKIAPAY_PUBLIC_KEY && process.env.KKIAPAY_PRIVATE_KEY && process.env.KKIAPAY_SECRET);

const publicConfig = () => ({
  provider: 'kkiapay',
  publicKey: process.env.KKIAPAY_PUBLIC_KEY || '',
  sandbox: isSandbox(),
  mock: isMock(),
  ready: isMock() || isConfigured(),
});

/**
 * Retourne { status, amount, method, raw }.
 * status vaut 'SUCCESS' si la transaction est payee.
 */
async function verifyTransaction(transactionId, expectedAmount) {
  if (!transactionId || typeof transactionId !== 'string') {
    throw Object.assign(new Error('Identifiant de transaction manquant'), { statusCode: 400 });
  }

  if (transactionId.startsWith('MOCK-')) {
    if (!isMock()) throw Object.assign(new Error('Paiement simule refuse'), { statusCode: 400 });
    return { status: 'SUCCESS', amount: expectedAmount, method: 'MOCK', raw: { mock: true, transactionId } };
  }

  if (!isConfigured()) {
    throw Object.assign(new Error('KKiaPay n\'est pas configure sur le serveur'), { statusCode: 503 });
  }

  const res = await fetch(`${isSandbox() ? SANDBOX_URL : LIVE_URL}/api/v1/transactions/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.KKIAPAY_PUBLIC_KEY,
      'x-private-key': process.env.KKIAPAY_PRIVATE_KEY,
      'x-secret-key': process.env.KKIAPAY_SECRET,
    },
    body: JSON.stringify({ transactionId }),
  });

  let data = {};
  try { data = await res.json(); } catch { /* reponse vide */ }

  if (!res.ok) {
    const reason = data?.reason || data?.message || 'Transaction introuvable';
    return { status: 'NOT_FOUND', amount: 0, method: '', raw: data, reason };
  }

  return {
    status: String(data.status || '').toUpperCase(),
    amount: Number(data.amount || 0),
    method: data.source_common_name || data.source || '',
    raw: data,
  };
}

module.exports = { verifyTransaction, publicConfig, isMock, isConfigured };
