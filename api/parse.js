// Parse-endpoint. Leest opgeslagen factuur-PDFs en vult de velden.
// Deterministisch eerst; Claude alleen als terugval wanneer het totaal ontbreekt.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY (optioneel)
// Aanroep: POST /api/parse

import { createClient } from '@supabase/supabase-js';
import { pdfTekst, parseFacturen, claudeVelden } from '../lib/parse.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reden: 'Gebruik POST' });
  const url = process.env.SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  // Onverwerkte facturen met een bronbestand.
  const { data: facturen, error } = await supabase
    .from('facturen')
    .select('id, bronbestand_url')
    .is('totaal', null)
    .not('bronbestand_url', 'is', null)
    .limit(15);
  if (error) return res.status(500).json({ ok: false, reden: error.message });

  let verwerkt = 0, viaAi = 0, review = 0;
  const fouten = [];
  for (const f of facturen) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from('facturen').download(f.bronbestand_url);
      if (dlErr) { fouten.push(`download ${f.id}: ${dlErr.message}`); continue; }
      const buffer = Buffer.from(await blob.arrayBuffer());
      const text = await pdfTekst(buffer);

      let velden = null, bron = 'regex', conf = 0;
      if (text && text.trim().length > 20) {
        const r = parseFacturen(text);
        if (r.velden.totaal != null) { velden = r.velden; conf = r.confidence; }
      }
      if (!velden) {
        const ai = await claudeVelden(text);
        if (ai && ai.totaal != null) { velden = ai; bron = 'ai'; conf = 0.7; viaAi += 1; }
      }
      if (!velden) {
        await supabase.from('facturen').update({ parse_bron: 'review', parse_confidence: 0 }).eq('id', f.id);
        review += 1;
        continue;
      }

      await supabase.from('facturen').update({
        factuurnummer: velden.factuurnummer ?? null,
        factuurdatum: velden.factuurdatum ?? null,
        bedrag_excl: velden.bedrag_excl ?? null,
        btw_bedrag: velden.btw_bedrag ?? null,
        btw_tarief: velden.btw_tarief ?? null,
        totaal: velden.totaal ?? null,
        parse_bron: bron,
        parse_confidence: conf,
      }).eq('id', f.id);
      verwerkt += 1;
    } catch (e) { fouten.push(`factuur ${f.id}: ${e.message}`); }
  }

  return res.status(200).json({ ok: fouten.length === 0, verwerkt, viaAi, review, fouten });
}
