// Factuur verwijderen naar prullenbak of herstellen.
// POST /api/factuur-actie  body { factuur_id, actie: 'verwijder' | 'herstel' }
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reden: 'Gebruik POST' });
  const url = process.env.SUPABASE_URL;
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(200).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  const { factuur_id, actie } = req.body || {};
  if (!factuur_id || !actie) return res.status(400).json({ ok: false, reden: 'factuur_id en actie vereist' });

  if (actie === 'verwijder') {
    await supabase.from('koppelingen').delete().eq('factuur_id', factuur_id);
    await supabase.from('facturen').update({ verwijderd: true, status: 'open' }).eq('id', factuur_id);
    return res.status(200).json({ ok: true });
  }
  if (actie === 'herstel') {
    await supabase.from('facturen').update({ verwijderd: false }).eq('id', factuur_id);
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ ok: false, reden: 'Onbekende actie' });
}
