// Deterministische factuurparser. Leest de tekstlaag van een PDF en haalt met
// Nederlandse patronen de velden eruit. Geen AI, geen OCR.
import { extractText, getDocumentProxy } from 'unpdf';

export async function pdfTekst(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text || '';
}

const MAANDEN = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7,
  augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, mrt: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

function bedrag(s) {
  if (!s) return null;
  let x = String(s).replace(/[^0-9.,-]/g, '');
  if (!x) return null;
  const komma = x.includes(','), punt = x.includes('.');
  if (komma && punt) {
    if (x.lastIndexOf(',') > x.lastIndexOf('.')) x = x.replace(/\./g, '').replace(',', '.');
    else x = x.replace(/,/g, '');
  } else if (komma) {
    x = x.replace(',', '.');
  }
  const n = parseFloat(x);
  return isNaN(n) ? null : n;
}

const AMT = /\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2}|\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}/g;

function laatsteBedrag(regel) {
  const m = regel.match(AMT);
  return m && m.length ? bedrag(m[m.length - 1]) : null;
}

function bedragBij(regels, test, extra = 1) {
  for (let i = 0; i < regels.length; i++) {
    if (!test(regels[i])) continue;
    let b = laatsteBedrag(regels[i]);
    for (let j = 1; j <= extra && b == null && i + j < regels.length; j++) b = laatsteBedrag(regels[i + j]);
    if (b != null) return b;
  }
  return null;
}

function normDatum(str) {
  if (!str) return null;
  let m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})/);
  if (m) {
    let [_, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = str.match(/(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/i);
  if (m) {
    const mo = MAANDEN[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  return null;
}

export function parseFacturen(text) {
  const regels = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const laag = (r) => r.toLowerCase();

  // Totaal: voorkeur voor incl of te betalen, subtotaal en excl uitsluiten.
  const isTotaal = (r) => /totaal|te\s*(betalen|voldoen)/i.test(r) && !/subtotaal|excl/i.test(laag(r));
  let totaal = bedragBij(regels, (r) => /totaal.*(incl|te\s*betalen)|te\s*(betalen|voldoen)/i.test(r) && !/excl/i.test(laag(r)));
  if (totaal == null) totaal = bedragBij(regels, isTotaal);

  // BTW: bedrag en tarief.
  let btw_bedrag = bedragBij(regels, (r) => /\bbtw\b|b\.t\.w|\bvat\b/i.test(r) && !/nummer|nr|id/i.test(laag(r)));
  let btw_tarief = null;
  for (const r of regels) {
    if (/verleg|reverse charge/i.test(r)) { btw_tarief = 'verlegd'; break; }
    if (/\bbtw\b|\bvat\b/i.test(r)) {
      const p = r.match(/(\d{1,2})\s?%/);
      if (p) { const v = p[1]; if (['21', '9', '0'].includes(v)) { btw_tarief = v; break; } }
    }
  }

  // Bedrag exclusief: subtotaal of excl, anders afleiden.
  let bedrag_excl = bedragBij(regels, (r) => /subtotaal|excl\.?\s*btw|netto/i.test(r));
  if (bedrag_excl == null && totaal != null && btw_bedrag != null) bedrag_excl = Math.round((totaal - btw_bedrag) * 100) / 100;
  if (btw_bedrag == null && totaal != null && bedrag_excl != null) btw_bedrag = Math.round((totaal - bedrag_excl) * 100) / 100;

  // Factuurnummer.
  let factuurnummer = null;
  const fm = text.match(/(?:factuurnummer|factuurnr\.?|factuur\s*nr\.?|invoice\s*(?:number|no|nr)\.?)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,})/i);
  if (fm) factuurnummer = fm[1].replace(/[.,;]$/, '');

  // Factuurdatum: voorkeur voor gelabelde datum.
  let factuurdatum = null;
  const dm = text.match(/(?:factuurdatum|datum|invoice\s*date|date)\s*[:]?\s*([0-9]{1,2}[-/.\s][0-9]{1,2}[-/.\s][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\s+[a-z]+\.?\s+[0-9]{4})/i);
  factuurdatum = normDatum(dm ? dm[1] : text.match(/[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}/)?.[0]);

  // Vertrouwen.
  let conf = 0;
  if (totaal != null) conf += 0.4;
  if (btw_bedrag != null || btw_tarief) conf += 0.25;
  if (factuurnummer) conf += 0.15;
  if (factuurdatum) conf += 0.15;
  if (totaal != null && bedrag_excl != null && btw_bedrag != null && Math.abs(bedrag_excl + btw_bedrag - totaal) < 0.02) conf += 0.05;

  // Financieel stuk? Op basis van een bedrag of meerdere factuur-kenmerken.
  const treffers = (text.match(/factuur|invoice|rekening|kassabon|\bbon\b|receipt|btw|\bvat\b|iban|totaal|bedrag|te betalen|subtotaal|ontvangstbewijs|kvk/gi) || []).length;
  const financieel = totaal != null || treffers >= 3;

  return {
    velden: { factuurnummer, factuurdatum, bedrag_excl, btw_bedrag, btw_tarief, totaal },
    confidence: Math.min(1, conf),
    financieel,
  };
}

// Claude-terugval: velden uit tekst halen wanneer de patronen geen totaal vinden.
export async function claudeVelden(text) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !text) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: 'Je haalt factuurvelden uit tekst. Antwoord uitsluitend met JSON, geen uitleg. Sleutels: factuurnummer, factuurdatum (YYYY-MM-DD), bedrag_excl (getal), btw_bedrag (getal), btw_tarief (een van "21","9","0","verlegd"), totaal (getal). Onbekend is null.',
      messages: [{ role: 'user', content: text.slice(0, 6000) }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const tekst = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(tekst.replace(/```json|```/g, '').trim()); } catch { return null; }
}
