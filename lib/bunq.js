// Bunq client voor serverless gebruik.
// Doet de volledige handshake (installation, device-server, session-server),
// bewaart de context in Supabase (bunq_context) en hergebruikt of vernieuwt de sessie.
// Vereist een Wildcard API-key (Allow All IP Addresses) omdat Vercel wisselende IP's heeft.
//
// Signing: elke call na de installation wordt ondertekend met de private key.
// De X-Bunq-Client-Signature is de RSA-SHA256 handtekening van de exacte request body
// (leeg bij GET), base64 gecodeerd.

import crypto from 'crypto';

const BASE = process.env.BUNQ_BASE_URL || 'https://api.bunq.com';
const USER_AGENT = 'flii-boekhouding/1.0';

function commonHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'User-Agent': USER_AGENT,
    'X-Bunq-Language': 'nl_NL',
    'X-Bunq-Region': 'nl_NL',
    'X-Bunq-Geolocation': '0 0 0 0 000',
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    ...extra,
  };
}

function sign(bodyString, privateKeyPem) {
  const signer = crypto.createSign('sha256');
  signer.update(bodyString, 'utf8');
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

function generateKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

async function bunqFetch(method, path, { body, authToken, privateKeyPem } = {}) {
  const bodyString = body !== undefined ? JSON.stringify(body) : '';
  const headers = commonHeaders();
  if (authToken) headers['X-Bunq-Client-Authentication'] = authToken;
  if (privateKeyPem) headers['X-Bunq-Client-Signature'] = sign(bodyString, privateKeyPem);

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: method === 'GET' ? undefined : bodyString,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.Error?.[0]?.error_description
      || json?.Error?.[0]?.error_description_translated
      || (json && Object.keys(json).length ? JSON.stringify(json) : text)
      || res.statusText;
    throw new Error(`bunq ${method} ${path} (${res.status}): ${String(msg).slice(0, 300)}`);
  }
  return json.Response || [];
}

// Zoek een sleutel in de Response array van bunq (die is een lijst van objecten met een enkele key).
function pick(response, key) {
  for (const item of response) {
    if (item && item[key]) return item[key];
  }
  return null;
}

// Zoek het gebruikersobject, welke User-variant het ook is (UserPerson, UserCompany, ...).
function pickUser(response) {
  for (const item of response) {
    const key = Object.keys(item || {})[0];
    if (key && key.startsWith('User')) return item[key];
  }
  return null;
}

// Maak of laad de context voor een entiteit. store is een object met load() en save().
export async function ensureContext({ apiKey, ctx, save }) {
  let context = { ...ctx };

  // 1) Keypair genereren indien nog niet aanwezig.
  if (!context.private_key_pem) {
    const { privateKey, publicKey } = generateKeyPair();
    context.private_key_pem = privateKey;
    context.public_key_pem = publicKey;
  }

  // 2) Installation indien nog geen installation token.
  if (!context.installation_token) {
    const resp = await bunqFetch('POST', '/v1/installation', {
      body: { client_public_key: context.public_key_pem },
    });
    context.installation_token = pick(resp, 'Token')?.token || null;
    context.server_public_key = pick(resp, 'ServerPublicKey')?.server_public_key || null;
    if (!context.installation_token) throw new Error('installation token ontbreekt in respons');
    await save(context);
  }

  // 3) Device-server registreren (eenmalig). Vereist een wildcard key in de app.
  if (!context.device_registered) {
    await bunqFetch('POST', '/v1/device-server', {
      body: { description: 'flii-boekhouding', secret: apiKey },
      authToken: context.installation_token,
      privateKeyPem: context.private_key_pem,
    });
    context.device_registered = true;
    await save(context);
  }

  // 4) Sessie aanmaken of vernieuwen indien verlopen.
  const nu = Date.now();
  const verlopen = !context.session_token || !context.session_expires_at ||
    new Date(context.session_expires_at).getTime() < nu + 60000;
  if (verlopen) {
    const resp = await bunqFetch('POST', '/v1/session-server', {
      body: { secret: apiKey },
      authToken: context.installation_token,
      privateKeyPem: context.private_key_pem,
    });
    context.session_token = pick(resp, 'Token')?.token || null;
    const user = pick(resp, 'UserPerson') || pick(resp, 'UserCompany') || pickUser(resp);
    context.session_user_id = user?.id || null;
    const timeout = (user?.session_timeout && Number(user.session_timeout)) || 3600;
    context.session_expires_at = new Date(nu + timeout * 1000).toISOString();
    if (!context.session_token || !context.session_user_id) {
      throw new Error('sessie token of user id ontbreekt in respons');
    }
    await save(context);
  }

  return context;
}

export async function listMonetaryAccounts(context) {
  const resp = await bunqFetch('GET', `/v1/user/${context.session_user_id}/monetary-account`, {
    authToken: context.session_token,
    privateKeyPem: context.private_key_pem,
  });
  const accounts = [];
  for (const item of resp) {
    const key = Object.keys(item)[0];
    const acc = item[key];
    if (acc && acc.status === 'ACTIVE') {
      accounts.push({ id: acc.id, beschrijving: acc.description });
    }
  }
  return accounts;
}

export async function listPayments(context, accountId, count = 200) {
  const resp = await bunqFetch(
    'GET',
    `/v1/user/${context.session_user_id}/monetary-account/${accountId}/payment?count=${count}`,
    { authToken: context.session_token, privateKeyPem: context.private_key_pem }
  );
  return resp.map((item) => item.Payment).filter(Boolean).map((p) => ({
    extern_id: `bunq:${p.id}`,
    datum: (p.created || '').slice(0, 10),
    bedrag: Number(p.amount?.value ?? 0),
    tegenpartij: p.counterparty_alias?.display_name || p.counterparty_alias?.iban || null,
    iban_tegenpartij: p.counterparty_alias?.iban || null,
    omschrijving: p.description || null,
  }));
}
