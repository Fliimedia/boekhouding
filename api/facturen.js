// Lees-endpoint voor facturen. GET /api/facturen of /api/facturen?type=holding
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  let entityIds = null;
  if (req.query?.type && req.query.type !== 'geconsolideerd') {
    const { data: ents } = await supabase.from('entiteiten').select('id').eq('type', req.query.type);
    entityIds = (ents || []).map((e) => e.id);
  }

  let q = supabase
    .from('facturen')
    .select('id, entity_id, richting, tegenpartij, factuurdatum, bron_datum, totaal, status, bron, bestandsnaam, bronbestand_url')
    .order('bron_datum', { ascending: false, nullsFirst: false })
    .limit(200);
  if (entityIds) q = q.in('entity_id', entityIds);

  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, reden: error.message });

  // Tijdelijke links naar de bronbestanden plus gekoppelde transactie.
  const ids = data.map((f) => f.id);
  const koppMap = {};
  if (ids.length) {
    const { data: kopp } = await supabase
      .from('koppelingen').select('factuur_id, transactie_id, bevestigd').in('factuur_id', ids);
    for (const k of kopp || []) koppMap[k.factuur_id] = { transactie_id: k.transactie_id, bevestigd: k.bevestigd };
  }
  const facturen = [];
  for (const f of data) {
    let link = null;
    if (f.bronbestand_url) {
      const { data: sign } = await supabase.storage.from('facturen').createSignedUrl(f.bronbestand_url, 3600);
      link = sign?.signedUrl || null;
    }
    facturen.push({ ...f, link, koppeling: koppMap[f.id] || null });
  }

  return res.status(200).json({ ok: true, facturen });
}
