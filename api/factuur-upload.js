// Upload-endpoint. Koppelt een handmatig gekozen PDF aan een transactie.
// Het bestand wordt bewaard, uitgelezen (bedrag ter controle) en gekoppeld.
//
// Aanroep: POST /api/factuur-upload  body { transactie_id, bestandsnaam, data_base64 }
// Bulk-import (zonder transactie): body ook { bron, bron_id, richting, type, tegenpartij,
//   factuurdatum, totaal, bedrag_excl, btw_bedrag, factuurnummer } - dedupe op bron_id en bestandshash.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { pdfTekst, parseFacturen, claudeVelden } from '../lib/parse.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reden: 'Gebruik POST' });
  const url = process.env.SUPABASE_URL, serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  const { transactie_id, bestandsnaam, data_base64 } = req.body || {};
  const meta = req.body || {};
  if (!data_base64) return res.status(400).json({ ok: false, reden: 'data_base64 vereist' });
  if (meta.bron && meta.bron_id) {
    const { data: al } = await supabase.from('facturen').select('id').eq('bron', meta.bron).eq('bron_id', meta.bron_id).limit(1);
    if (al && al.length) return res.status(200).json({ ok: true, overgeslagen: true, reden: 'bestaat al' });
  }

  let tx = null;
  if (transactie_id) {
    const { data: txRow, error: txErr } = await supabase
      .from('transacties').select('id, entity_id, datum, bedrag, tegenpartij').eq('id', transactie_id).maybeSingle();
    if (txErr || !txRow) return res.status(404).json({ ok: false, reden: 'Transactie niet gevonden' });
    tx = txRow;
  }

  // Doel-entiteit: die van de transactie, anders de werkmaatschappij.
  let entityId = tx?.entity_id;
  if (!entityId) {
    const { data: ents } = await supabase.from('entiteiten').select('id, type').order('id');
    const doelType = meta.type === 'holding' ? 'holding' : 'werkmaatschappij';
    entityId = (ents || []).find((e) => e.type === doelType)?.id || ents?.[0]?.id;
  }

  const buffer = Buffer.from(data_base64, 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 40);
  const pad = transactie_id ? `${entityId}/upload_${transactie_id}_${Date.now()}.pdf` : `${entityId}/h_${hash}.pdf`;
  if (!transactie_id) {
    const { data: zelfde } = await supabase.from('facturen').select('id').eq('bronbestand_url', pad).eq('entity_id', entityId).limit(1);
    if (zelfde && zelfde.length) return res.status(200).json({ ok: true, overgeslagen: true, reden: 'zelfde bestand bestaat al' });
  }
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

  // Opgegeven waarden (bijvoorbeeld uit een Moneybird-export) gaan voor wat uit de PDF komt.
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  if (meta.totaal != null) {
    velden = { ...(velden || {}),
      totaal: num(meta.totaal),
      bedrag_excl: num(meta.bedrag_excl) ?? velden?.bedrag_excl ?? null,
      btw_bedrag: num(meta.btw_bedrag) ?? velden?.btw_bedrag ?? null,
      factuurdatum: meta.factuurdatum || velden?.factuurdatum || null,
      factuurnummer: meta.factuurnummer || velden?.factuurnummer || null,
    };
    bron = 'opgegeven'; conf = 1;
  }
  const richting = tx ? (Number(tx.bedrag) < 0 ? 'inkoop' : 'verkoop') : (meta.richting === 'verkoop' ? 'verkoop' : 'inkoop');
  const bedragKlopt = tx ? (velden?.totaal != null && Math.abs(velden.totaal - Math.abs(Number(tx.bedrag))) < 0.02) : null;

  // Bestaande koppeling voor deze transactie vervangen.
  if (transactie_id) await supabase.from('koppelingen').delete().eq('transactie_id', transactie_id);

  const { data: nieuwFac, error: insErr } = await supabase.from('facturen').insert({
    entity_id: entityId,
    richting,
    tegenpartij: meta.tegenpartij || tx?.tegenpartij || bestandsnaam || null,
    factuurnummer: velden?.factuurnummer ?? null,
    factuurdatum: velden?.factuurdatum ?? null,
    bedrag_excl: velden?.bedrag_excl ?? null,
    btw_bedrag: velden?.btw_bedrag ?? null,
    btw_tarief: velden?.btw_tarief ?? null,
    totaal: velden?.totaal ?? null,
    status: 'open',
    bron: meta.bron || 'upload',
    bron_id: meta.bron_id || `upload:${transactie_id || 'los'}:${Date.now()}`,
    bron_datum: tx?.datum || meta.factuurdatum || new Date().toISOString().slice(0, 10),
    bestandsnaam: bestandsnaam || null,
    bronbestand_url: pad,
    parse_bron: bron,
    parse_confidence: conf,
  }).select('id').maybeSingle();
  if (insErr) return res.status(500).json({ ok: false, reden: `factuur: ${insErr.message}` });

  if (transactie_id) {
    await supabase.from('koppelingen').insert({
      transactie_id, factuur_id: nieuwFac.id, confidence: bedragKlopt ? 1 : 0.5, bevestigd: false,
    });
  }

  return res.status(200).json({
    ok: true, totaal: velden?.totaal ?? null, bedrag: tx ? Number(tx.bedrag) : null, bedragKlopt,
  });
}
