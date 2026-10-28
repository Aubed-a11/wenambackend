// Paiement YouCan Pay (cartes bancaires, CashPlus), en dirhams.
// Memes appels que le SDK ycp-sdk-ts : POST /api/tokenize, GET /api/transactions/:id,
// et signature des webhooks en HMAC-SHA256 (cle privee) dans l'en-tete X-Youcanpay-Signature.
//
// Variables d'environnement :
//   YCP_PRIVATE_KEY  cle privee (Tableau de bord YouCan Pay > Parametres > Cles API)
//   YCP_PUBLIC_KEY   cle publique (optionnelle, non utilisee pour la page de paiement hebergee)
//   YCP_SANDBOX      true pour l'environnement de test
//   YCP_MOCK         true pour simuler les paiements en local (refuse en production)

const crypto = require('crypto');

const BASE = 'https://youcanpay.com';

const isSandbox = () => String(process.env.YCP_SANDBOX).toLowerCase() === 'true';
const isMock = () => String(process.env.YCP_MOCK).toLowerCase() === 'true' && process.env.NODE_ENV !== 'production';
const isConfigured = () => Boolean(process.env.YCP_PRIVATE_KEY);
const prefix = () => (isSandbox() ? '/sandbox' : '');

const apiUrl = (path) => `${BASE}${prefix()}/api/${path.replace(/^\//, '')}`;
const paymentFormUrl = (tokenId) => `${BASE}${prefix()}/payment-form/${tokenId}`;

const publicConfig = () => ({
  provider: 'youcanpay',
  sandbox: isSandbox(),
  mock: isMock(),
  ready: isMock() || isConfigured(),
});

const err = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

const cleanIp = (ip) => String(ip || '').replace(/^::ffff:/, '') || '127.0.0.1';

/**
 * Cree un jeton de paiement et renvoie l'URL de la page de paiement YouCan Pay.
 * Le montant est envoye en centimes (350 DH = 35000).
 */
async function createPayment({ order, ip, successUrl, errorUrl, lang }) {
  if (!isConfigured()) throw err('YouCan Pay n\'est pas configuré sur le serveur', 503, 'PAYMENT_NOT_READY');
  const body = {
    pri_key: process.env.YCP_PRIVATE_KEY,
    order_id: String(order._id),
    amount: Math.round(order.total * 100),
    currency: 'MAD',
    customer_ip: cleanIp(ip),
    success_url: successUrl,
    error_url: errorUrl,
    customer: { name: order.buyer.name, phone: order.buyer.phone, email: order.buyer.email, country_code: 'MA' },
    metadata: { orderNumber: order.orderNumber },
  };
  const res = await fetch(apiUrl('tokenize'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* reponse vide */ }
  const tokenId = data?.token?.id;
  if (!res.ok || !tokenId) {
    console.error('YouCan Pay tokenize:', res.status, JSON.stringify(data).slice(0, 300));
    throw err('Impossible de créer le paiement YouCan Pay', 502, 'PAYMENT_INIT_FAILED');
  }
  const l = ['fr', 'en', 'ar'].includes(lang) ? lang : 'fr';
  return { tokenId, paymentUrl: `${paymentFormUrl(tokenId)}?lang=${l}` };
}

// Statut "paye" : YouCan Pay renvoie un statut numerique (1 = paye)
const isPaidStatus = (s) => s === 1 || s === '1' || String(s).toLowerCase() === 'paid' || String(s).toLowerCase() === 'success';

/**
 * Verifie une transaction aupres de YouCan Pay.
 * Retourne { status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND', amount (en DH), method, orderId, raw }.
 */
async function verifyTransaction(transactionId, order) {
  if (!transactionId || typeof transactionId !== 'string') throw err('Identifiant de transaction manquant', 400, 'NO_TX');

  if (transactionId.startsWith('MOCK-')) {
    if (!isMock()) throw err('Paiement simulé refusé', 400, 'PAYMENT_FAILED');
    return { status: 'SUCCESS', amount: order.total, method: 'MOCK', orderId: String(order._id), raw: { mock: true, transactionId } };
  }
  if (!isConfigured()) throw err('YouCan Pay n\'est pas configuré sur le serveur', 503, 'PAYMENT_NOT_READY');

  const url = new URL(apiUrl(`transactions/${encodeURIComponent(transactionId)}`));
  url.searchParams.set('pri_key', process.env.YCP_PRIVATE_KEY);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  let data = {};
  try { data = await res.json(); } catch { /* reponse vide */ }
  if (!res.ok) return { status: 'NOT_FOUND', amount: 0, method: '', orderId: '', raw: data };

  const tx = data.transaction || data;
  const currency = String(tx.currency || 'MAD').toUpperCase();
  return {
    status: isPaidStatus(tx.status) && currency === 'MAD' ? 'SUCCESS' : 'FAILED',
    amount: parseInt(tx.amount, 10) / 100,
    method: tx.payment_method?.name || tx.gateway || 'YouCan Pay',
    orderId: tx.order_id != null ? String(tx.order_id) : '',
    raw: tx,
  };
}

/** Verifie la signature d'un webhook (corps brut de la requete). */
function validWebhook(rawBody, signature) {
  if (!isConfigured() || !signature || !rawBody) return false;
  const expected = crypto.createHmac('sha256', process.env.YCP_PRIVATE_KEY).update(rawBody).digest('hex');
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { publicConfig, isConfigured, isMock, createPayment, verifyTransaction, validWebhook };
