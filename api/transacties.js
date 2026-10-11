// Lees-endpoint voor transacties. GET /api/transacties of /api/transacties?type=holding
// Optioneel: van=YYYY-MM-DD, tot=YYYY-MM-DD, limit (max 1000), offset.
import { createClient } from '@supabase/supabase-js';

const isDatum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) {
    return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  }
  const supabase = createClient(url, serviceKey);

  let entityIds = null;
  if (req.query?.type && req.query.type !== 'geconsolideerd') {
    const { data: ents } = await supabase.from('entiteiten').select('id').eq('type', req.query.type);
    entityIds = (ents || []).map((e) => e.id);
  }

  const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 200, 1), 1000);
  const offset = Math.max(parseInt(req.query?.offset, 10) || 0, 0);

  let q = supabase
    .from('transacties')
    .select('id, entity_id, datum, bedrag, tegenpartij, omschrijving, iban_tegenpartij, rekening_iban')
    .order('datum', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (entityIds) q = q.in('entity_id', entityIds);
  if (isDatum(req.query?.van)) q = q.gte('datum', req.query.van);
  if (isDatum(req.query?.tot)) q = q.lte('datum', req.query.tot);

  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, reden: error.message });

  // Voorgestelde of gekoppelde factuur per transactie.
  const ids = data.map((r) => r.id);
  const koppMap = {};
  if (ids.length) {
    const kopp = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: deel } = await supabase
        .from('koppelingen').select('transactie_id, factuur_id, confidence, bevestigd').in('transactie_id', ids.slice(i, i + 200));
      kopp.push(...(deel || []));
    }
    const facIds = [...new Set((kopp || []).map((k) => k.factuur_id))];
    const facById = {};
    if (facIds.length) {
      const { data: facs } = await supabase
        .from('facturen').select('id, tegenpartij, totaal, bestandsnaam, bronbestand_url').in('id', facIds);
      for (const f of facs || []) {
        let link = null;
        if (f.bronbestand_url) {
          const { data: sign } = await supabase.storage.from('facturen').createSignedUrl(f.bronbestand_url, 3600);
          link = sign?.signedUrl || null;
        }
        facById[f.id] = { id: f.id, tegenpartij: f.tegenpartij, totaal: f.totaal, bestandsnaam: f.bestandsnaam, link };
      }
    }
    for (const k of kopp || []) {
      koppMap[k.transactie_id] = { confidence: k.confidence, bevestigd: k.bevestigd, factuur: facById[k.factuur_id] || null };
    }
  }
  const transacties = data.map((r) => ({ ...r, gekoppeld: !!koppMap[r.id], koppeling: koppMap[r.id] || null }));
  return res.status(200).json({ ok: true, transacties });
}
