// Status-endpoint. Doet echte testcalls naar Gmail en Drive zodat de
// hub de precieze reden toont (bijvoorbeeld ontbrekende scope of map).
// GET /api/status

import { createClient } from '@supabase/supabase-js';

async function googleAccess() {
  if (!process.env.GOOGLE_REFRESH_TOKEN || !process.env.GOOGLE_CLIENT_ID) {
    return { ok: false, reden: 'niet geconfigureerd' };
  }
  try {
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
    const j = await res.json();
    if (!res.ok) return { ok: false, reden: `${j.error || res.status}: ${j.error_description || ''}` };
    return { ok: true, token: j.access_token };
  } catch (e) { return { ok: false, reden: String(e.message || e) }; }
}

async function testCall(url, token) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return { ok: true };
    const j = await res.json().catch(() => ({}));
    return { ok: false, reden: `${res.status}: ${j.error?.message || j.error || ''}`.slice(0, 160) };
  } catch (e) { return { ok: false, reden: String(e.message || e) }; }
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(200).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  const { data: ents } = await supabase.from('entiteiten').select('id, naam, type, iban');
  const { data: ctx } = await supabase.from('bunq_context').select('entity_id, device_registered');
  const bankOk = (ctx || []).some((c) => c.device_registered) && !!process.env.BUNQ_API_KEY;
  const { count: txCount } = await supabase.from('transacties').select('*', { count: 'exact', head: true });
  const { count: facCount } = await supabase.from('facturen').select('*', { count: 'exact', head: true });

  // Google: token plus echte testcalls.
  const g = await googleAccess();
  let gmail, drive;
  if (!g.ok) {
    gmail = { ok: false, reden: g.reden };
    drive = { ok: false, reden: g.reden };
  } else {
    const gm = await testCall('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1', g.token);
    gmail = { ok: gm.ok, reden: gm.ok ? null : gm.reden };
    if (!process.env.DRIVE_FOLDER_ID) {
      drive = { ok: false, reden: 'DRIVE_FOLDER_ID ontbreekt' };
    } else {
      const q = encodeURIComponent(`'${process.env.DRIVE_FOLDER_ID}' in parents and trashed=false`);
      const dr = await testCall(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1&fields=files(id)`, g.token);
      drive = { ok: dr.ok, reden: dr.ok ? null : dr.reden };
    }
  }

  return res.status(200).json({
    ok: true,
    bank: {
      ok: bankOk,
      rekeningen: (ents || []).filter((e) => e.iban).map((e) => ({ naam: e.naam, iban: e.iban })),
      transacties: txCount || 0,
    },
    gmail: { ...gmail, facturen: facCount || 0 },
    drive,
  });
}
