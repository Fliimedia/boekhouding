// Match-endpoint. Koppelt banktransacties aan facturen.
// Score op bedrag (vereist), datum-nabijheid en naamovereenkomst.
// Voorstellen krijgen bevestigd=false; jij bevestigt later in de app.
//
// Aanroep: POST /api/match  of  GET /api/match?run=1[&van=2025-01-01]

import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

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

// Haalt alle rijen op in blokken van 1000 (Supabase-limiet per verzoek).
async function alles(maakQuery) {
  const uit = [];
  for (let van = 0; ; van += 1000) {
    const { data, error } = await maakQuery().range(van, van + 999);
    if (error) throw new Error(error.message);
    uit.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return uit;
}

export default async function handler(req, res) {
  const getRun = req.method === 'GET' && req.query?.run === '1';
  if (req.method !== 'POST' && !getRun) return res.status(405).json({ ok: false, reden: 'Gebruik POST of GET met run=1' });
  const url = process.env.SUPABASE_URL, serviceKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_API_KEY || process.env.SUPABASE_KEY);
  if (!url || !serviceKey) return res.status(500).json({ ok: false, reden: 'Supabase env vars ontbreken' });
  const supabase = createClient(url, serviceKey);
  const van = /^\d{4}-\d{2}-\d{2}$/.test(req.query?.van || '') ? req.query.van : '2025-01-01';

  try {
    const kopp = await alles(() => supabase.from('koppelingen').select('transactie_id, factuur_id').order('id'));
    const txGebruikt = new Set(kopp.map((k) => k.transactie_id));
    const facGebruikt = new Set(kopp.map((k) => k.factuur_id));

    const txs = await alles(() => supabase
      .from('transacties').select('id, entity_id, datum, bedrag, tegenpartij').gte('datum', van).order('id'));
    const facs = await alles(() => supabase
      .from('facturen').select('id, entity_id, richting, tegenpartij, factuurdatum, bron_datum, totaal, status')
      .not('totaal', 'is', null).eq('status', 'open').eq('verwijderd', false).order('id'));

    // Index op bedrag in centen voor snelle kandidaten.
    const opBedrag = {};
    for (const f of facs) {
      if (facGebruikt.has(f.id)) continue;
      const c = Math.round(Math.abs(Number(f.totaal)) * 100);
      (opBedrag[c] = opBedrag[c] || []).push(f);
    }

    const nieuw = [];
    for (const tx of txs) {
      if (txGebruikt.has(tx.id)) continue;
      const c = Math.round(Math.abs(Number(tx.bedrag)) * 100);
      const kandidaten = [...(opBedrag[c - 1] || []), ...(opBedrag[c] || []), ...(opBedrag[c + 1] || [])];
      let beste = null, besteScore = 0;
      for (const f of kandidaten) {
        if (facGebruikt.has(f.id)) continue;
        if (f.entity_id !== tx.entity_id) continue;
        const teken = Number(tx.bedrag) < 0 ? 'inkoop' : 'verkoop';
        if (f.richting !== teken) continue;
        let score = 0.6;
        const fd = f.factuurdatum || f.bron_datum;
        const d = dagen(tx.datum, fd);
        // Betaling ligt meestal na de factuurdatum; ruim venster voor late betalingen.
        if (d <= 7) score += 0.25; else if (d <= 45) score += 0.1; else if (d > 120) continue;
        score += 0.15 * naamScore(tx.tegenpartij, f.tegenpartij);
        if (score > besteScore) { besteScore = score; beste = f; }
      }
      if (beste && besteScore >= 0.6) {
        nieuw.push({ transactie_id: tx.id, factuur_id: beste.id, confidence: Math.min(1, besteScore), bevestigd: false });
        txGebruikt.add(tx.id); facGebruikt.add(beste.id);
      }
    }

    const fouten = [];
    for (let i = 0; i < nieuw.length; i += 200) {
      const { error } = await supabase.from('koppelingen').insert(nieuw.slice(i, i + 200));
      if (error) fouten.push(error.message);
    }
    return res.status(200).json({
      ok: fouten.length === 0, transacties: txs.length, facturen_open: facs.length, voorstellen: nieuw.length, fouten,
    });
  } catch (e) {
    return res.status(200).json({ ok: false, reden: String(e.message || e) });
  }
}
