// Match-endpoint. Koppelt banktransacties aan facturen.
// Score op bedrag (vereist), datum-nabijheid en naamovereenkomst.
// Voorstellen krijgen bevestigd=false; jij bevestigt later in de app.
//
// Aanroep: POST /api/match

import { createClient } from '@supabase/supabase-js';

function normNaam(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function naamScore(a, b) {
  const ta = new Set(normNaam(a).split(' ').filter((w) => w.length > 2));
  const tb = new Set(normNaam(b).split(' ').filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap += 1;
  return overlap / Math.min(ta.size, tb.size);
}
function dagen(a, b) {
  if (!a || !b) return 999;
  return Math.abs((new Date(a) - new Date(b)) / 86400000);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reden: 'Gebruik POST' });
  const url = process.env.SUPABASE_URL, serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);

  // Reeds gekoppelde ids.
  const { data: kopp } = await supabase.from('koppelingen').select('transactie_id, factuur_id');
  const txGebruikt = new Set((kopp || []).map((k) => k.transactie_id));
  const facGebruikt = new Set((kopp || []).map((k) => k.factuur_id));

  // Kandidaten.
  const { data: txs } = await supabase
    .from('transacties').select('id, entity_id, datum, bedrag, tegenpartij').limit(200);
  const { data: facs } = await supabase
    .from('facturen').select('id, entity_id, richting, tegenpartij, factuurdatum, bron_datum, totaal, status')
    .not('totaal', 'is', null).eq('status', 'open').limit(200);

  const openFacs = (facs || []).filter((f) => !facGebruikt.has(f.id));
  let voorstellen = 0;
  const fouten = [];

  for (const tx of txs || []) {
    if (txGebruikt.has(tx.id)) continue;
    const doelBedrag = Math.abs(Number(tx.bedrag));
    let beste = null, besteScore = 0;

    for (const f of openFacs) {
      if (f.entity_id !== tx.entity_id) continue;
      if (facGebruikt.has(f.id)) continue;
      if (Math.abs(Number(f.totaal) - doelBedrag) > 0.02) continue;

      let score = 0.6; // bedrag komt overeen
      const d = dagen(tx.datum, f.factuurdatum || f.bron_datum);
      if (d <= 7) score += 0.25; else if (d <= 30) score += 0.1;
      score += 0.15 * naamScore(tx.tegenpartij, f.tegenpartij);
      // Tekenrichting: inkoop hoort bij een afschrijving, verkoop bij een bijschrijving.
      const teken = Number(tx.bedrag) < 0 ? 'inkoop' : 'verkoop';
      if (f.richting === teken) score += 0.05;

      if (score > besteScore) { besteScore = score; beste = f; }
    }

    if (beste && besteScore >= 0.6) {
      const { error } = await supabase.from('koppelingen').insert({
        transactie_id: tx.id, factuur_id: beste.id,
        confidence: Math.min(1, besteScore), bevestigd: false,
      });
      if (error) { fouten.push(`koppeling tx ${tx.id}: ${error.message}`); continue; }
      txGebruikt.add(tx.id); facGebruikt.add(beste.id);
      voorstellen += 1;
    }
  }

  return res.status(200).json({ ok: fouten.length === 0, voorstellen, fouten });
}
