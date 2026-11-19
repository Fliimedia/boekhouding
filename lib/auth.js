// Toegangscontrole voor alle API-routes. Eén wachtwoord in env var APP_WACHTWOORD.
// De app stuurt het mee als header x-app-key; scripts mogen ?key= gebruiken.
import crypto from 'crypto';

const h = (s) => crypto.createHash('sha256').update(String(s || '')).digest();

export function sleutelUit(req) {
  const kop = req.headers?.['x-app-key'];
  if (kop) return String(kop);
  if (req.query?.key) return String(req.query.key);
  return '';
}

export function magErin(req, res) {
  const ww = process.env.APP_WACHTWOORD;
  if (!ww) {
    res.status(503).json({ ok: false, reden: 'APP_WACHTWOORD is niet ingesteld' });
    return false;
  }
  const k = sleutelUit(req);
  if (k && crypto.timingSafeEqual(h(k), h(ww))) return true;
  res.status(401).json({ ok: false, reden: 'Niet ingelogd' });
  return false;
}
