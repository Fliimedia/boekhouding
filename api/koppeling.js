// Koppeling-endpoint. Bevestig of verwijder de koppeling van een transactie.
// Aanroep: POST /api/koppeling  body { transactie_id, actie: 'bevestig' | 'verwijder' }

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reden: 'Gebruik POST' });
  const url = process.env.SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  const { transactie_id, actie } = req.body || {};
  if (!transactie_id || !actie) return res.status(400).json({ ok: false, reden: 'transactie_id en actie vereist' });

  const { data: kopp } = await supabase
    .from('koppelingen').select('factuur_id').eq('transactie_id', transactie_id);
  const facIds = (kopp || []).map((k) => k.factuur_id);

  if (actie === 'bevestig') {
    await supabase.from('koppelingen').update({ bevestigd: true }).eq('transactie_id', transactie_id);
    if (facIds.length) await supabase.from('facturen').update({ status: 'betaald' }).in('id', facIds);
    return res.status(200).json({ ok: true });
  }
  if (actie === 'verwijder') {
    await supabase.from('koppelingen').delete().eq('transactie_id', transactie_id);
    if (facIds.length) await supabase.from('facturen').update({ status: 'open' }).in('id', facIds);
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ ok: false, reden: 'Onbekende actie' });
}
