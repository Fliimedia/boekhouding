// Upload-endpoint. Koppelt een handmatig gekozen PDF aan een transactie.
// Het bestand wordt bewaard, uitgelezen (bedrag ter controle) en gekoppeld.
//
// Aanroep: POST /api/factuur-upload  body { transactie_id, bestandsnaam, data_base64 }

import { createClient } from '@supabase/supabase-js';
import { pdfTekst, parseFacturen, claudeVelden } from '../lib/parse.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reden: 'Gebruik POST' });
  const url = process.env.SUPABASE_URL, serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  const { transactie_id, bestandsnaam, data_base64 } = req.body || {};
  if (!transactie_id || !data_base64) return res.status(400).json({ ok: false, reden: 'transactie_id en data_base64 vereist' });

  const { data: tx, error: txErr } = await supabase
    .from('transacties').select('id, entity_id, datum, bedrag, tegenpartij').eq('id', transactie_id).maybeSingle();
  if (txErr || !tx) return res.status(404).json({ ok: false, reden: 'Transactie niet gevonden' });

  const buffer = Buffer.from(data_base64, 'base64');
  const pad = `${tx.entity_id}/upload_${transactie_id}_${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from('facturen').upload(pad, buffer, { contentType: 'application/pdf', upsert: true });
  if (upErr) return res.status(500).json({ ok: false, reden: `opslag: ${upErr.message}` });

  // Uitlezen ter controle van het bedrag.
  let velden = null, bron = 'regex', conf = 0;
  try {
    const text = await pdfTekst(buffer);
    if (text && text.trim().length > 20) {
      const r = parseFacturen(text);
      if (r.velden.totaal != null) { velden = r.velden; conf = r.confidence; }
    }
    if (!velden) {
      const ai = await claudeVelden(text);
      if (ai && ai.totaal != null) { velden = ai; bron = 'ai'; conf = 0.7; }
    }
  } catch { /* uitlezen mislukt, factuur wordt zonder bedrag gekoppeld */ }

  const richting = Number(tx.bedrag) < 0 ? 'inkoop' : 'verkoop';
  const bedragKlopt = velden?.totaal != null && Math.abs(velden.totaal - Math.abs(Number(tx.bedrag))) < 0.02;

  // Bestaande koppeling voor deze transactie vervangen.
  await supabase.from('koppelingen').delete().eq('transactie_id', transactie_id);

  const { data: nieuwFac, error: insErr } = await supabase.from('facturen').insert({
    entity_id: tx.entity_id,
    richting,
    tegenpartij: tx.tegenpartij || bestandsnaam || null,
    factuurnummer: velden?.factuurnummer ?? null,
    factuurdatum: velden?.factuurdatum ?? null,
    bedrag_excl: velden?.bedrag_excl ?? null,
    btw_bedrag: velden?.btw_bedrag ?? null,
    btw_tarief: velden?.btw_tarief ?? null,
    totaal: velden?.totaal ?? null,
    status: 'open',
    bron: 'upload',
    bron_id: `upload:${transactie_id}:${Date.now()}`,
    bron_datum: tx.datum,
    bestandsnaam: bestandsnaam || null,
    bronbestand_url: pad,
    parse_bron: bron,
    parse_confidence: conf,
  }).select('id').maybeSingle();
  if (insErr) return res.status(500).json({ ok: false, reden: `factuur: ${insErr.message}` });

  await supabase.from('koppelingen').insert({
    transactie_id, factuur_id: nieuwFac.id, confidence: bedragKlopt ? 1 : 0.5, bevestigd: false,
  });

  return res.status(200).json({
    ok: true, totaal: velden?.totaal ?? null, bedrag: Number(tx.bedrag), bedragKlopt,
  });
}
