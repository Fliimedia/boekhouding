// Google client voor serverless gebruik. Alleen-lezen op Gmail en Drive.
// Werkt met een refresh token dat eenmalig wordt aangemaakt.
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google token faalde: ${json.error_description || json.error || res.status}`);
  return json.access_token;
}

async function gapi(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  return res.json();
}

function header(headers, naam) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === naam.toLowerCase());
  return h ? h.value : '';
}

// Haal naam uit een From header als "Naam <mail@x.nl>".
function afzenderNaam(from) {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>/);
  if (m) return m[1].trim();
  const mail = from.match(/<?([^<>\s]+@[^<>\s]+)>?/);
  return mail ? mail[1].split('@')[1] : from;
}

// Verzamelt PDF-bijlagen uit Gmail. Met een label voor de dagelijkse sync,
// of met een vrije query voor een brede eenmalige sweep. Geeft
// {bron, bron_id, bestandsnaam, tegenpartij, datum, bytes}.
export async function gmailFacturen({ label, query, maxMails = 25, sindsDagen = 120 }) {
  const token = await accessToken();
  let q;
  if (query) q = query;
  else if (label) q = `label:${label} has:attachment filename:pdf newer_than:${sindsDagen}d`;
  else q = `has:attachment filename:pdf newer_than:${sindsDagen}d`;

  // Paginate tot maxMails berichten verzameld zijn.
  const berichten = [];
  let pageToken = '';
  while (berichten.length < maxMails) {
    const rest = Math.min(100, maxMails - berichten.length);
    const u = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${rest}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const lijst = await gapi(token, u);
    (lijst.messages || []).forEach((m) => berichten.push(m));
    if (!lijst.nextPageToken) break;
    pageToken = lijst.nextPageToken;
  }

  const resultaten = [];
  for (const m of berichten) {
    const bericht = await gapi(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`);
    const heads = bericht.payload?.headers || [];
    const tegenpartij = afzenderNaam(header(heads, 'From'));
    const datum = new Date(Number(bericht.internalDate || Date.now())).toISOString().slice(0, 10);
    const parts = [];
    const loop = (p) => { if (!p) return; if (p.parts) p.parts.forEach(loop); if (p.filename && p.mimeType === 'application/pdf') parts.push(p); };
    loop(bericht.payload);
    for (const p of parts) {
      const att = await gapi(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}/attachments/${p.body.attachmentId}`);
      resultaten.push({
        bron: 'gmail',
        bron_id: `gmail:${m.id}:${p.body.attachmentId}`,
        bestandsnaam: p.filename,
        tegenpartij,
        datum,
        bytes: Buffer.from(att.data, 'base64url'),
      });
    }
  }
  return resultaten;
}

// Verzamelt PDF-bestanden uit een Drive-map. Geeft dezelfde vorm terug.
export async function driveFacturen({ folderId, maxBestanden = 50 }) {
  const token = await accessToken();
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType='application/pdf' and trashed=false`);
  const lijst = await gapi(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&pageSize=${maxBestanden}`
  );
  const resultaten = [];
  for (const f of lijst.files || []) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    resultaten.push({
      bron: 'drive',
      bron_id: `drive:${f.id}`,
      bestandsnaam: f.name,
      tegenpartij: (f.name || '').replace(/\.pdf$/i, ''),
      datum: (f.createdTime || '').slice(0, 10),
      bytes: buf,
    });
  }
  return resultaten;
}
