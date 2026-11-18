// Parse-endpoint. Leest opgeslagen factuur-PDFs en vult de velden.
// Deterministisch eerst; Claude alleen als terugval wanneer het totaal ontbreekt.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY (optioneel)
// Aanroep: POST /api/parse  of  GET /api/parse?run=1&n=20

import { createClient } from '@supabase/supabase-js';
import { pdfTekst, parseFacturen, claudeVelden } from '../lib/parse.js';

export const maxDuration = 300;

export default async function handler(req, res) {
  const getRun = req.method === 'GET' && req.query?.run === '1';
  if (req.method !== 'POST' && !getRun) return res.status(405).json({ ok: false, reden: 'Gebruik POST of GET met run=1' });
  const start = Date.now();
  const n = Math.min(Math.max(parseInt(req.query?.n, 10) || 15, 1), 200);
  const url = process.env.SUPABASE_URL, serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  // Onverwerkte facturen met een bronbestand, nog niet eerder geprobeerd.
  const { data: facturen, error } = await supabase
    .from('facturen')
    .select('id, entity_id, richting, bronbestand_url')
    .is('totaal', null)
    .is('parse_bron', null)
    .not('bronbestand_url', 'is', null)
    .like('bronbestand_url', '%.pdf')
    .eq('verwijderd', false)
    .order('id')
    .limit(n);
  if (error) return res.status(500).json({ ok: false, reden: error.message });

  // Holding herkennen aan de geadresseerde: holdinggegevens zonder Flii op de factuur.
  const { data: ents } = await supabase.from('entiteiten').select('id, type');
  const holdingId = (ents || []).find((e) => e.type === 'holding')?.id || null;
  const isHolding = (t) => /NL\s?862\s?521\s?075\s?B01|Sten Bossong B\.?\s?V/i.test(t) && !/flii/i.test(t);

  let verwerkt = 0, viaAi = 0, review = 0, geenFactuur = 0;
  const fouten = [];
  let duplicaat = 0, naarHolding = 0;
  for (const f of facturen) {
    if (Date.now() - start > 270000) break;
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from('facturen').download(f.bronbestand_url);
      if (dlErr) { fouten.push(`download ${f.id}: ${dlErr.message}`); continue; }
      const buffer = Buffer.from(await blob.arrayBuffer());
      const text = await pdfTekst(buffer);

      let velden = null, bron = 'regex', conf = 0, financieel = false;
      if (text && text.trim().length > 20) {
        const r = parseFacturen(text);
        financieel = r.financieel;
        if (r.velden.totaal != null) { velden = r.velden; conf = r.confidence; }
      }
      if (!velden) {
        const ai = await claudeVelden(text);
        if (ai && ai.totaal != null) { velden = ai; bron = 'ai'; conf = 0.7; viaAi += 1; financieel = true; }
      }

      // Geen factuur: geen bedrag en geen factuur-kenmerken. Naar de prullenbak.
      if (!velden && !financieel) {
        await supabase.from('facturen').update({ parse_bron: 'geen_factuur', parse_confidence: 0, verwijderd: true }).eq('id', f.id);
        geenFactuur += 1;
        continue;
      }
      // Wel een factuur maar niet uitleesbaar: ter controle laten staan.
      if (!velden) {
        await supabase.from('facturen').update({ parse_bron: 'review', parse_confidence: 0 }).eq('id', f.id);
        review += 1;
        continue;
      }

      // Dubbele factuur: zelfde nummer en totaal bestaat al (niet verwijderd).
      if (velden.factuurnummer && velden.totaal != null) {
        const { data: dub } = await supabase.from('facturen').select('id')
          .eq('factuurnummer', velden.factuurnummer).eq('totaal', velden.totaal)
          .eq('verwijderd', false).neq('id', f.id).limit(1);
        if (dub && dub.length) {
          await supabase.from('facturen').update({ parse_bron: 'duplicaat', parse_confidence: 0, verwijderd: true,
            factuurnummer: velden.factuurnummer, totaal: velden.totaal }).eq('id', f.id);
          duplicaat += 1;
          continue;
        }
      }

      const naarH = holdingId && f.richting === 'inkoop' && f.entity_id !== holdingId && isHolding(text);
      if (naarH) naarHolding += 1;
      await supabase.from('facturen').update({
        ...(naarH ? { entity_id: holdingId } : {}),
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

  return res.status(200).json({ ok: fouten.length === 0, bekeken: facturen.length, verwerkt, viaAi, review, geenFactuur, duplicaat, naarHolding, duur_ms: Date.now() - start, fouten });
}
