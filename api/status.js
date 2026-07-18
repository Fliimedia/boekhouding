// Status-endpoint. Geeft per kanaal (bank, gmail, drive) de verbinding en
// tellingen terug voor de status-indicator in de app.
// GET /api/status

import { createClient } from '@supabase/supabase-js';

async function googleToken() {
  if (!process.env.GOOGLE_REFRESH_TOKEN || !process.env.GOOGLE_CLIENT_ID) return { ok: false, reden: 'niet geconfigureerd' };
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
    return res.ok ? { ok: true } : { ok: false, reden: j.error || res.status };
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

  const g = await googleToken();
  const gmail = { ok: g.ok && !!process.env.GOOGLE_REFRESH_TOKEN, reden: g.ok ? null : g.reden };
  const drive = { ok: g.ok && !!process.env.DRIVE_FOLDER_ID, reden: g.ok ? (process.env.DRIVE_FOLDER_ID ? null : 'DRIVE_FOLDER_ID ontbreekt') : g.reden };

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
