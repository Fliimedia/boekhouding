// Lees-endpoint voor facturen. GET /api/facturen of /api/facturen?type=holding
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
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

  // Tijdelijke links naar de bronbestanden.
  const facturen = [];
  for (const f of data) {
    let link = null;
    if (f.bronbestand_url) {
      const { data: sign } = await supabase.storage.from('facturen').createSignedUrl(f.bronbestand_url, 3600);
      link = sign?.signedUrl || null;
    }
    facturen.push({ ...f, link });
  }

  return res.status(200).json({ ok: true, facturen });
}
