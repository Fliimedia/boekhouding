// Lees-endpoint voor transacties. GET /api/transacties of /api/transacties?type=holding
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  }
  const supabase = createClient(url, serviceKey);

  let entityIds = null;
  if (req.query?.type && req.query.type !== 'geconsolideerd') {
    const { data: ents } = await supabase.from('entiteiten').select('id').eq('type', req.query.type);
    entityIds = (ents || []).map((e) => e.id);
  }

  let q = supabase
    .from('transacties')
    .select('id, entity_id, datum, bedrag, tegenpartij, omschrijving')
    .order('datum', { ascending: false })
    .limit(200);
  if (entityIds) q = q.in('entity_id', entityIds);

  const { data, error } = await q;
  if (error) return res.status(500).json({ ok: false, reden: error.message });

  // Gekoppeld-vlag op basis van bestaande koppelingen.
  const ids = data.map((r) => r.id);
  let gekoppeld = new Set();
  if (ids.length) {
    const { data: kopp } = await supabase.from('koppelingen').select('transactie_id').in('transactie_id', ids);
    gekoppeld = new Set((kopp || []).map((k) => k.transactie_id));
  }
  const transacties = data.map((r) => ({ ...r, gekoppeld: gekoppeld.has(r.id) }));
  return res.status(200).json({ ok: true, transacties });
}
