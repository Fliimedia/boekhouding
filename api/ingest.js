// Ingest-endpoint. Haalt PDF-facturen uit Gmail en Drive, bewaart het
// bronbestand in storage (bewaarplicht) en maakt per stuk een ongekoppelde
// factuur aan. Verzonden mail (eigen adres of label SENT) wordt verkoop,
// ontvangen mail inkoop. Velden worden in /api/parse uitgelezen.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY,
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
//   GMAIL_LABEL (optioneel), DRIVE_FOLDER_ID (optioneel)
//
// Aanroep: POST /api/ingest                       (label of standaard)
//          POST /api/ingest?mode=sweep            (brede sweep, gaat verder met cursor)
//          GET  /api/ingest?run=1&mode=sweep&van=2025-01-01&tot=2026-12-31
//          GET  /api/ingest?run=1&mode=sweep&q=<gmail query>&reset=1

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { gmailFacturen, driveFacturen, gmailSweepPagina } from '../lib/google.js';

export const maxDuration = 300;

const isDatum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const gdatum = (s) => s.replace(/-/g, '/');

export default async function handler(req, res) {
  const getRun = req.method === 'GET' && req.query?.run === '1';
  if (req.method !== 'POST' && !getRun) return res.status(405).json({ ok: false, reden: 'Gebruik POST of GET met run=1' });

  const url = process.env.SUPABASE_URL;
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);
  const start = Date.now();

  // Doel-entiteit voor mailfacturen: werkmaatschappij, anders de eerste.
  const { data: ents } = await supabase.from('entiteiten').select('id, type').order('id');
  if (!ents || ents.length === 0) return res.status(500).json({ ok: false, reden: 'Geen entiteiten. Draai schema-bunq.sql.' });
  const doel = ents.find((e) => e.type === 'werkmaatschappij') || ents[0];

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return res.status(400).json({ ok: false, reden: 'GOOGLE_REFRESH_TOKEN ontbreekt. Autoriseer Google eenmalig.' });
  }

  let items = [];
  const fouten = [];
  const sweep = req.query?.mode === 'sweep';
  const maand = req.query?.mode === 'maand';
  const maxMails = Math.min(Math.max(parseInt(req.query?.max, 10) || 20, 1), 50);

  // Sweep-query: vrij op te geven, of opgebouwd uit van/tot. Elke query heeft een eigen cursor.
  let q = null;
  if (sweep) {
    if (req.query?.q) q = String(req.query.q);
    else if (isDatum(req.query?.van)) {
      q = `has:attachment filename:pdf after:${gdatum(req.query.van)}`;
      if (isDatum(req.query?.tot)) q += ` before:${gdatum(req.query.tot)}`;
    } else {
      q = process.env.GMAIL_SWEEP_QUERY || `has:attachment filename:pdf after:${new Date().getFullYear()}/1/1`;
    }
  }
  const cursorSleutel = q ? `gmail_sweep:${crypto.createHash('sha1').update(q).digest('hex').slice(0, 16)}` : null;

  let pageToken = null;
  let sweepNext = null;
  let berichten = 0, schatting = null;
  if (sweep) {
    if (req.query?.reset === '1') await supabase.from('app_state').delete().eq('sleutel', cursorSleutel);
    const { data: st } = await supabase.from('app_state').select('waarde').eq('sleutel', cursorSleutel).maybeSingle();
    pageToken = st?.waarde || null;
    if (pageToken === 'KLAAR') {
      return res.status(200).json({ ok: true, query: q, klaar: true, meer: false, nieuw: 0, reden: 'Deze sweep is al afgerond. Gebruik reset=1 om opnieuw te beginnen.' });
    }
  }

  try {
    if (sweep) {
      const r = await gmailSweepPagina({ query: q, pageToken, maxMails });
      items = r.items; sweepNext = r.nextPageToken; berichten = r.berichten; schatting = r.schatting;
    } else if (maand) {
      const d = new Date(Date.now() - 32 * 86400000);
      const mq = `has:attachment filename:pdf after:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      const r = await gmailSweepPagina({ query: mq, pageToken: null, maxMails: 50 });
      items = r.items;
    } else if (process.env.GMAIL_LABEL) {
      items = items.concat(await gmailFacturen({ label: process.env.GMAIL_LABEL }));
    }
  } catch (e) { fouten.push(`gmail: ${e.message}`); }
  try {
    if (process.env.DRIVE_FOLDER_ID && !sweep) {
      items = items.concat(await driveFacturen({ folderId: process.env.DRIVE_FOLDER_ID }));
    }
  } catch (e) { fouten.push(`drive: ${e.message}`); }

  let nieuw = 0, overgeslagen = 0, verkoop = 0;
  for (const it of items) {
    try {
      // Dedupe 1: zelfde bron-id.
      const { data: bestaat } = await supabase
        .from('facturen').select('id').eq('bron', it.bron).eq('bron_id', it.bron_id).limit(1);
      if (bestaat && bestaat.length) { overgeslagen += 1; continue; }
      // Dedupe 2: zelfde mailbericht en bestandsnaam (oudere ids gebruikten een wisselende attachment-id).
      if (it.bron === 'gmail') {
        const msgId = it.bron_id.split(':')[1];
        const { data: zelfdeMail } = await supabase
          .from('facturen').select('id').like('bron_id', `gmail:${msgId}:%`).eq('bestandsnaam', it.bestandsnaam).limit(1);
        if (zelfdeMail && zelfdeMail.length) { overgeslagen += 1; continue; }
      }
      // Dedupe 3: exact hetzelfde bestand (hash) al opgeslagen, bijvoorbeeld doorgestuurd of in een ander bericht.
      const hash = crypto.createHash('sha256').update(it.bytes).digest('hex').slice(0, 40);
      const pad = `${doel.id}/h_${hash}.pdf`;
      const { data: zelfdeBestand } = await supabase.from('facturen').select('id').eq('bronbestand_url', pad).limit(1);
      if (zelfdeBestand && zelfdeBestand.length) { overgeslagen += 1; continue; }

      const { error: upErr } = await supabase.storage
        .from('facturen').upload(pad, it.bytes, { contentType: 'application/pdf', upsert: true });
      if (upErr) { fouten.push(`opslag ${it.bestandsnaam}: ${upErr.message}`); continue; }

      const richting = it.richting || 'inkoop';
      const { error: insErr } = await supabase.from('facturen').insert({
        entity_id: doel.id,
        richting,
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
      if (richting === 'verkoop') verkoop += 1;
    } catch (e) { fouten.push(`item ${it.bestandsnaam}: ${e.message}`); }
  }

  // Sweep-cursor bijwerken zodat de volgende run verder gaat.
  let meer = false;
  if (sweep) {
    const waarde = sweepNext || 'KLAAR';
    const { error: curErr } = await supabase.from('app_state')
      .upsert({ sleutel: cursorSleutel, waarde, updated_at: new Date().toISOString() });
    if (curErr) fouten.push(`cursor: ${curErr.message}`);
    meer = !!sweepNext;
  }

  return res.status(200).json({
    ok: fouten.length === 0, query: q, berichten, schatting, gevonden: items.length,
    nieuw, verkoop, overgeslagen, meer, duur_ms: Date.now() - start, fouten,
  });
}
