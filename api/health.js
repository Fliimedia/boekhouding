// Server-side health check. Test de databaseverbinding en telt de kern-tabellen.
// De Supabase keys staan alleen hier (server-side), nooit in de client.
// Vereiste env vars op Vercel: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    return res.status(500).json({
      ok: false,
      reden: 'SUPABASE_URL of SUPABASE_SERVICE_KEY ontbreekt in de omgeving',
    });
  }

  try {
    const supabase = createClient(url, key);
    const tabellen = ['entiteiten', 'facturen', 'transacties', 'koppelingen'];
    const tellingen = {};

    for (const tabel of tabellen) {
      const { count, error } = await supabase
        .from(tabel)
        .select('*', { count: 'exact', head: true });
      if (error) {
        return res.status(500).json({ ok: false, tabel, reden: error.message });
      }
      tellingen[tabel] = count ?? 0;
    }

    return res.status(200).json({ ok: true, verbonden: true, tellingen });
  } catch (err) {
    return res.status(500).json({ ok: false, reden: String(err) });
  }
}
