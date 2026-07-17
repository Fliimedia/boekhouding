// Ingest-endpoint. Haalt PDF-facturen uit Gmail (label) en Drive (map),
// bewaart het bronbestand in storage (bewaarplicht) en maakt per stuk een
// ongekoppelde inkoopfactuur aan. Velden worden in Fase 3 uitgelezen.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY,
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
//   GMAIL_LABEL (optioneel), DRIVE_FOLDER_ID (optioneel)
//
// Aanroep: POST /api/ingest

import { createClient } from '@supabase/supabase-js';
import { gmailFacturen, driveFacturen, gmailSweepPagina } from '../lib/google.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reden: 'Gebruik POST' });

  const url = process.env.SUPABASE_URL;
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  // Doel-entiteit voor inkomende facturen: werkmaatschappij, anders de eerste.
  const { data: ents } = await supabase.from('entiteiten').select('id, type').order('id');
  if (!ents || ents.length === 0) return res.status(500).json({ ok: false, reden: 'Geen entiteiten. Draai schema-bunq.sql.' });
  const doel = ents.find((e) => e.type === 'werkmaatschappij') || ents[0];

  // Verzamel bronnen die geconfigureerd zijn.
  let items = [];
  const fouten = [];
  const sweep = req.query?.mode === 'sweep';
  let pageToken = null;
  let sweepNext = null;
  if (sweep) {
    const { data: st } = await supabase.from('app_state').select('waarde').eq('sleutel', 'gmail_sweep_page').maybeSingle();
    pageToken = st?.waarde || null;
  }
  try {
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      if (sweep) {
        const q = process.env.GMAIL_SWEEP_QUERY
          || 'has:attachment filename:pdf newer_than:1095d (factuur OR invoice OR rekening OR receipt OR bon)';
        const { items: g, nextPageToken } = await gmailSweepPagina({ query: q, pageToken, maxMails: 30 });
        for (const x of g) items.push(x);
        sweepNext = nextPageToken;
      } else if (process.env.GMAIL_LABEL) {
        items = items.concat(await gmailFacturen({ label: process.env.GMAIL_LABEL }));
      }
    }
  } catch (e) { fouten.push(`gmail: ${e.message}`); }
  try {
    // Drive bij gewone sync altijd, bij sweep alleen op de eerste pagina.
    if (process.env.DRIVE_FOLDER_ID && process.env.GOOGLE_REFRESH_TOKEN && (!sweep || !pageToken)) {
      items = items.concat(await driveFacturen({ folderId: process.env.DRIVE_FOLDER_ID }));
    }
  } catch (e) { fouten.push(`drive: ${e.message}`); }
  try {
    if (process.env.DRIVE_FOLDER_ID && process.env.GOOGLE_REFRESH_TOKEN) {
      items = items.concat(await driveFacturen({ folderId: process.env.DRIVE_FOLDER_ID }));
    }
  } catch (e) { fouten.push(`drive: ${e.message}`); }

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return res.status(400).json({ ok: false, reden: 'GOOGLE_REFRESH_TOKEN ontbreekt. Autoriseer Google eenmalig.' });
  }

  let nieuw = 0, overgeslagen = 0;
  for (const it of items) {
    // Dedupe op bron en bron_id.
    const { data: bestaat } = await supabase
      .from('facturen').select('id').eq('bron', it.bron).eq('bron_id', it.bron_id).maybeSingle();
    if (bestaat) { overgeslagen += 1; continue; }

    // Bronbestand bewaren.
    const pad = `${doel.id}/${it.bron_id.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('facturen').upload(pad, it.bytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) { fouten.push(`opslag ${it.bestandsnaam}: ${upErr.message}`); continue; }

    // Ongekoppelde inkoopfactuur aanmaken (bedragen volgen in Fase 3).
    const { error: insErr } = await supabase.from('facturen').insert({
      entity_id: doel.id,
      richting: 'inkoop',
      tegenpartij: it.tegenpartij,
      status: 'open',
      bron: it.bron,
      bron_id: it.bron_id,
      bron_datum: it.datum || null,
      bestandsnaam: it.bestandsnaam,
      bronbestand_url: pad,
    });
    if (insErr) { fouten.push(`factuur ${it.bestandsnaam}: ${insErr.message}`); continue; }
    nieuw += 1;
  }

  // Sweep-cursor bijwerken zodat de volgende run verder gaat.
  let meer = false;
  if (sweep) {
    if (sweepNext) {
      const { error: curErr } = await supabase.from('app_state')
        .upsert({ sleutel: 'gmail_sweep_page', waarde: sweepNext, updated_at: new Date().toISOString() });
      if (curErr) fouten.push(`cursor: ${curErr.message}`); else meer = true;
    } else {
      await supabase.from('app_state').delete().eq('sleutel', 'gmail_sweep_page');
    }
  }

  return res.status(200).json({ ok: fouten.length === 0, gevonden: items.length, nieuw, overgeslagen, meer, fouten });
}
