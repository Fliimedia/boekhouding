import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, FileText, ArrowLeftRight, Percent, Banknote, Briefcase,
  TrendingUp, TrendingDown, Wallet, Landmark, Unlink, Upload, Download,
  ChevronDown, RefreshCw, CircleDollarSign, CheckCircle2, XCircle,
  Trash2, RotateCcw, Mail,
} from 'lucide-react';

const T = {
  nl: {
    geconsolideerd: 'Geconsolideerd', holding: 'Holding', werk: 'Werkmaatschappij',
    tabs: { overzicht: 'Overzicht', facturen: 'Facturen', transacties: 'Transacties', btw: 'BTW', lonen: 'Lonen', projecten: 'Projecten' },
    balans: 'Balans', ongekoppeldFac: 'Ongekoppelde facturen', openBtw: 'Openstaande BTW',
    inkomsten: 'Inkomsten', uitgaven: 'Uitgaven', overig: 'Overig',
    ongekoppeld: 'Ongekoppeld', openstaand: 'Openstaand', upload: 'Factuur uploaden',
    kBestand: 'Bestand', kDatum: 'Datum', kNaam: 'Naam', kBedrag: 'Bedrag', kBtw: 'BTW', kKoppel: 'Koppeling', kDownload: 'Download',
    kStatus: 'Status', kKwartaal: 'Kwartaal', kPersoon: 'Persoon', kSalaris: 'Salaris', kLoonbelasting: 'Loonheffing', kBetaald: 'Betaald',
    kProject: 'Project', kPerMaand: 'Per maand', kEinde: 'Einde',
    aangiftesOpen: 'Openstaande aangiftes', bedragOpen: 'Bedrag openstaand',
    betaald: 'betaald', open: 'open', actief: 'actief', beeindigd: 'beeindigd',
    lonenTitel: 'Maandelijkse lonen', abosTitel: 'Subscriptions & services',
    projActief: 'Actieve projecten', projMaand: 'Verwacht per maand',
    leegTx: 'Nog geen transacties.', leegFac: 'Nog geen facturen.', leegBtw: 'Nog geen BTW-gegevens.', leegAbo: 'Nog geen terugkerende diensten herkend.',
    statusTitel: 'Verbindingen', bank: 'Bank', verversen: 'Verversen', transactiesLbl: 'transacties', facturenLbl: 'facturen',
    verbonden: 'Verbonden', nietVerbonden: 'Niet verbonden', bezig: 'Bezig...',
    volledigeScan: 'Volledige mailbox scannen', prullenbak: 'Prullenbak', herstel: 'Herstellen', verwijder: 'Verwijderen', scanKlaar: 'Scan klaar',
  },
  en: {
    geconsolideerd: 'Consolidated', holding: 'Holding', werk: 'Operating company',
    tabs: { overzicht: 'Overview', facturen: 'Invoices', transacties: 'Transactions', btw: 'VAT', lonen: 'Payroll', projecten: 'Projects' },
    balans: 'Balance', ongekoppeldFac: 'Unlinked invoices', openBtw: 'Open VAT',
    inkomsten: 'Income', uitgaven: 'Expenses', overig: 'Other',
    ongekoppeld: 'Unlinked', openstaand: 'Outstanding', upload: 'Upload invoice',
    kBestand: 'File', kDatum: 'Date', kNaam: 'Name', kBedrag: 'Amount', kBtw: 'VAT', kKoppel: 'Link', kDownload: 'Download',
    kStatus: 'Status', kKwartaal: 'Quarter', kPersoon: 'Person', kSalaris: 'Salary', kLoonbelasting: 'Payroll tax', kBetaald: 'Paid',
    kProject: 'Project', kPerMaand: 'Monthly', kEinde: 'Ended',
    aangiftesOpen: 'Open returns', bedragOpen: 'Amount open',
    betaald: 'paid', open: 'open', actief: 'active', beeindigd: 'ended',
    lonenTitel: 'Monthly payroll', abosTitel: 'Subscriptions & services',
    projActief: 'Active projects', projMaand: 'Expected monthly',
    leegTx: 'No transactions yet.', leegFac: 'No invoices yet.', leegBtw: 'No VAT data yet.', leegAbo: 'No recurring services detected yet.',
    statusTitel: 'Connections', bank: 'Bank', verversen: 'Refresh', transactiesLbl: 'transactions', facturenLbl: 'invoices',
    verbonden: 'Connected', nietVerbonden: 'Not connected', bezig: 'Working...',
    volledigeScan: 'Scan full mailbox', prullenbak: 'Trash', herstel: 'Restore', verwijder: 'Delete', scanKlaar: 'Scan done',
  },
};
const taal = (navigator.language || 'nl').toLowerCase().startsWith('en') ? 'en' : 'nl';
const t = T[taal];

const eur = (n) => new Intl.NumberFormat(taal === 'en' ? 'en-US' : 'nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
const MAANDEN = taal === 'en'
  ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  : ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

async function getJson(url) { try { const r = await fetch(url); return await r.json(); } catch { return null; } }
async function postJson(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    return await r.json();
  } catch { return null; }
}
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Vaste configuratie.
const LONEN = [
  { naam: 'Sten', salaris: 4494, loonbelasting: 1429 },
  { naam: 'Nada', salaris: 900, loonbelasting: 0 },
  { naam: 'Mayte', salaris: 150, loonbelasting: 0 },
];
const PROJECTEN = [
  { naam: 'Stichting De Buurt', bedrag: 450, actief: true },
  { naam: 'Plant-E', bedrag: 150, actief: true },
  { naam: 'FC Klap', bedrag: 2000, actief: true },
  { naam: 'KvK', bedrag: 10000, actief: false, einde: '2026-04' },
  { naam: 'Padel2025', bedrag: 450, actief: false, einde: '2026-01' },
];

function Metric({ id, icon, label, value, tint }) {
  return (
    <div className="card metric" id={id}>
      <div className="metric-icon" style={tint ? { background: tint.bg, color: tint.fg } : undefined}>{icon}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-value mono" style={tint ? { color: tint.fg } : undefined}>{value}</div>
    </div>
  );
}

function Fold({ id, titel, children, openDefault, extra }) {
  const [open, setOpen] = useState(!!openDefault);
  return (
    <div className={`fold${open ? ' open' : ''}`} id={id}>
      <div className="fold-head" onClick={() => setOpen((o) => !o)}>
        <span>{titel}</span>
        <span className="fold-extra" onClick={(e) => e.stopPropagation()}>{extra}</span>
        <ChevronDown className="chev" size={18} />
      </div>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
}

// Donut van top 4 bronnen plus overig.
const DONUT_KLEUREN = ['#B4823C', '#2E7D5B', '#3A6B8A', '#7A5C8E', '#9aa39d'];
function Donut({ titel, data }) {
  const totaal = data.reduce((a, d) => a + d.value, 0);
  if (!totaal) return null;
  let hoek = -90;
  const segs = data.map((d, i) => {
    const frac = d.value / totaal;
    const start = hoek, sweep = frac * 360;
    hoek += sweep;
    const grote = sweep > 180 ? 1 : 0;
    const r = 44, cx = 60, cy = 60;
    const rad = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
    const [x1, y1] = rad(start), [x2, y2] = rad(start + sweep - 0.5);
    return { d: `M ${x1} ${y1} A ${r} ${r} 0 ${grote} 1 ${x2} ${y2}`, kleur: DONUT_KLEUREN[i % DONUT_KLEUREN.length], label: d.label, value: d.value };
  });
  return (
    <div className="donutwrap">
      <div className="donut-title">{titel}</div>
      <svg viewBox="0 0 120 120" width="120" height="120">
        {segs.map((s, i) => <path key={i} d={s.d} fill="none" stroke={s.kleur} strokeWidth="14" strokeLinecap="butt" />)}
        <text x="60" y="64" textAnchor="middle" fontSize="12" fill="#16241F" fontFamily="IBM Plex Mono">{eur(totaal)}</text>
      </svg>
      <div className="legend">
        {segs.map((s, i) => (
          <div key={i} className="legend-row">
            <span className="legend-dot" style={{ background: s.kleur }} />
            <span className="legend-label">{s.label}</span>
            <span className="mono legend-val">{eur(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function topBronnen(rows, richting) {
  const per = {};
  for (const r of rows) {
    const b = Number(r.bedrag) || 0;
    if (richting === 'in' && b <= 0) continue;
    if (richting === 'uit' && b >= 0) continue;
    const naam = r.tegenpartij || '?';
    per[naam] = (per[naam] || 0) + Math.abs(b);
  }
  const sorted = Object.entries(per).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 4).map(([label, value]) => ({ label, value }));
  const rest = sorted.slice(4).reduce((a, [, v]) => a + v, 0);
  if (rest > 0) top.push({ label: t.overig, value: rest });
  return top;
}

// Status indicator met dropdown.
function StatusHub({ onRefresh }) {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState(null);
  const [bezig, setBezig] = useState(null);
  const [scanBezig, setScanBezig] = useState(false);
  const [scanN, setScanN] = useState(0);
  const laad = useCallback(async () => setSt(await getJson('/api/status')), []);
  useEffect(() => { laad(); }, [laad]);

  const kanalen = st ? [st.bank?.ok, st.gmail?.ok, st.drive?.ok] : [];
  const aantalOk = kanalen.filter(Boolean).length;
  const kleur = !st ? '#9aa39d' : aantalOk === 3 ? '#2E7D5B' : aantalOk >= 1 ? '#C98A2E' : '#B4462E';

  const ververs = async (kanaal) => {
    setBezig(kanaal);
    if (kanaal === 'bank') await postJson('/api/bunq-sync?maand=1');
    else if (kanaal === 'gmail') await postJson('/api/ingest?mode=maand');
    else await postJson('/api/ingest');
    await postJson('/api/parse'); await postJson('/api/match');
    setBezig(null); laad(); onRefresh();
  };

  const volledigeScan = async () => {
    setScanBezig(true); setScanN(0);
    // Bank volledig (heel het jaar) plus de hele mailbox.
    await postJson('/api/bunq-sync');
    let meer = true, veilig = 0, totaal = 0;
    while (meer && veilig < 120) {
      const r = await postJson('/api/ingest?mode=sweep');
      if (!r || !r.ok) break;
      totaal += r.nieuw || 0; setScanN(totaal);
      meer = !!r.meer; veilig += 1;
    }
    // Parsen tot alles bekeken is (gaat door ook als een enkel bestand faalt).
    let p = 0;
    while (p < 120) { const r = await postJson('/api/parse'); if (!r || (r.bekeken || 0) === 0) break; p += 1; }
    await postJson('/api/match');
    setScanBezig(false); laad(); onRefresh();
  };

  const Rij = ({ naam, ok, detail, kanaal }) => (
    <div className="st-row">
      {ok ? <CheckCircle2 size={15} color="#2E7D5B" /> : <XCircle size={15} color="#B4462E" />}
      <div className="st-info">
        <div className="st-naam">{naam}</div>
        <div className="st-detail">{detail || (ok ? t.verbonden : t.nietVerbonden)}</div>
      </div>
      <button className="mini ghost2" onClick={() => ververs(kanaal)} disabled={!!bezig}>
        <RefreshCw size={12} className={bezig === kanaal ? 'spin' : ''} /> {t.verversen}
      </button>
    </div>
  );

  return (
    <div className="statushub">
      <button className="st-indicator" onClick={() => { setOpen((o) => !o); if (!open) laad(); }} aria-label={t.statusTitel}>
        <span className="dot" style={{ background: kleur }} />
      </button>
      {open && st && (
        <div className="st-card">
          <div className="st-titel">{t.statusTitel}</div>
          <Rij naam={t.bank} ok={!!st.bank?.ok} kanaal="bank"
            detail={st.bank?.ok ? `${(st.bank.rekeningen || []).map((r) => r.iban).join(', ')} (${st.bank.transacties} ${t.transactiesLbl})` : null} />
          <Rij naam="Gmail" ok={!!st.gmail?.ok} kanaal="gmail"
            detail={st.gmail?.ok ? `${st.gmail.facturen} ${t.facturenLbl}` : st.gmail?.reden} />
          <Rij naam="Drive" ok={!!st.drive?.ok} kanaal="drive" detail={st.drive?.reden} />
          <button className="scanbtn" onClick={volledigeScan} disabled={scanBezig}>
            <Mail size={13} className={scanBezig ? 'spin' : ''} /> {scanBezig ? `${t.bezig} ${scanN}` : t.volledigeScan}
          </button>
        </div>
      )}
    </div>
  );
}

// Data hooks.
function useTransacties(entiteit, nonce) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let leeft = true;
    getJson(`/api/transacties?type=${entiteit}`).then((d) => { if (leeft) setRows(d?.transacties || []); });
    return () => { leeft = false; };
  }, [entiteit, nonce]);
  return rows;
}
function useFacturen(entiteit, nonce) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let leeft = true;
    getJson(`/api/facturen?type=${entiteit}`).then((d) => { if (leeft) setRows(d?.facturen || []); });
    return () => { leeft = false; };
  }, [entiteit, nonce]);
  return rows;
}

function btwPerKwartaal(txs, facs) {
  // BTW op basis van gekoppelde transacties: transactiebedrag plus btw-gegevens uit de factuur.
  const facById = {}; for (const f of facs) facById[f.id] = f;
  const per = {};
  for (const tx of txs) {
    const fId = tx.koppeling?.factuur?.id;
    const f = fId ? facById[fId] : null;
    if (!f || f.btw_bedrag == null) continue;
    const d = new Date(tx.datum);
    const kw = `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`;
    if (!per[kw]) per[kw] = { kw, verkoop: 0, inkoop: 0 };
    if (Number(tx.bedrag) >= 0) per[kw].verkoop += Number(f.btw_bedrag);
    else per[kw].inkoop += Number(f.btw_bedrag);
  }
  // Betaald als er een Belastingdienst-afschrijving in of na het kwartaal is.
  const belasting = txs.filter((x) => /belastingdienst/i.test(x.tegenpartij || '') && Number(x.bedrag) < 0);
  return Object.values(per).sort((a, b) => a.kw.localeCompare(b.kw)).map((k) => {
    const saldo = k.verkoop - k.inkoop;
    const betaald = belasting.some((b) => Math.abs(Math.abs(Number(b.bedrag)) - saldo) < Math.max(1, saldo * 0.02));
    return { ...k, saldo, betaald };
  });
}

function Overzicht({ txs, facs }) {
  const balans = txs.reduce((a, r) => a + Number(r.bedrag || 0), 0);
  const ongekoppeld = facs.filter((f) => !f.koppeling).length;
  const kwartalen = btwPerKwartaal(txs, facs);
  const openBtw = kwartalen.filter((k) => !k.betaald && k.saldo > 0).reduce((a, k) => a + k.saldo, 0);
  return (
    <>
      <div className="bento">
        <Metric id="ov-balans" icon={<Wallet size={20} />} label={t.balans} value={eur(balans)} />
        <Metric id="ov-onge" icon={<Unlink size={20} />} label={t.ongekoppeldFac} value={ongekoppeld} />
        <Metric id="ov-btw" icon={<Landmark size={20} />} label={t.openBtw} value={eur(openBtw)} />
      </div>
      <div className="card donuts" id="ov-donuts">
        <Donut titel={t.inkomsten} data={topBronnen(txs, 'in')} />
        <Donut titel={t.uitgaven} data={topBronnen(txs, 'uit')} />
      </div>
    </>
  );
}

function FacturenTab({ entiteit, nonce, reload, gaNaarTx }) {
  const facs = useFacturen(entiteit, nonce);
  const [trash, setTrash] = useState([]);
  const [bezig, setBezig] = useState(false);
  const fileRef = useRef(null);
  const ongekoppeld = facs.filter((f) => !f.koppeling);
  const openstaand = facs.filter((f) => f.status === 'open');
  const [filter, setFilter] = useState('ongekoppeld');
  const lijst = filter === 'ongekoppeld' ? ongekoppeld : filter === 'open' ? openstaand : facs;

  useEffect(() => {
    let leeft = true;
    getJson(`/api/facturen?type=${entiteit}&prullenbak=1`).then((d) => { if (leeft) setTrash(d?.facturen || []); });
    return () => { leeft = false; };
  }, [entiteit, nonce]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBezig(true);
    const data = await fileToBase64(file);
    await postJson('/api/factuur-upload', { bestandsnaam: file.name, data_base64: data });
    await postJson('/api/match');
    setBezig(false); reload();
  };
  const doeActie = async (id, actie) => { await postJson('/api/factuur-actie', { factuur_id: id, actie }); reload(); };

  return (
    <>
      <div className="bento">
        <button className={`card metric klik${filter === 'ongekoppeld' ? ' sel' : ''}`} onClick={() => setFilter('ongekoppeld')}>
          <div className="metric-icon"><Unlink size={20} /></div>
          <div className="metric-label">{t.ongekoppeld}</div>
          <div className="metric-value mono">{ongekoppeld.length}</div>
        </button>
        <button className={`card metric klik${filter === 'open' ? ' sel' : ''}`} onClick={() => setFilter('open')}>
          <div className="metric-icon"><FileText size={20} /></div>
          <div className="metric-label">{t.openstaand}</div>
          <div className="metric-value mono">{openstaand.length}</div>
        </button>
        <button className="card metric klik" onClick={() => fileRef.current?.click()} disabled={bezig}>
          <div className="metric-icon"><Upload size={20} /></div>
          <div className="metric-label">{t.upload}</div>
          <div className="metric-value">{bezig ? t.bezig : '+'}</div>
          <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={upload} />
        </button>
      </div>
      <div className="card tabelcard" id="fa-tabel">
        {lijst.length === 0 ? <div className="empty">{t.leegFac}</div> : (
          <table className="tx compact">
            <thead>
              <tr><th>{t.kBestand}</th><th>{t.kDatum}</th><th>{t.kNaam}</th><th className="r">{t.kBedrag}</th><th className="c">{t.kKoppel}</th><th className="c">{t.kDownload}</th><th className="c"></th></tr>
            </thead>
            <tbody>
              {lijst.map((f) => (
                <tr key={f.id}>
                  <td className="ell">{f.bestandsnaam || '·'}</td>
                  <td className="mono nw">{f.factuurdatum || f.bron_datum || ''}</td>
                  <td className="ell">{f.tegenpartij || ''}</td>
                  <td className="mono r nw">{f.totaal != null ? eur(f.totaal) : '·'}</td>
                  <td className="c">
                    {f.koppeling
                      ? <button className="icobtn ok" onClick={() => gaNaarTx(f.koppeling.transactie_id)} title="Transactie"><CircleDollarSign size={16} /></button>
                      : <span className="icobtn dim"><CircleDollarSign size={16} /></span>}
                  </td>
                  <td className="c">{f.link ? <a className="icobtn" href={f.link} target="_blank" rel="noreferrer"><Download size={16} /></a> : '·'}</td>
                  <td className="c"><button className="icobtn fout" onClick={() => doeActie(f.id, 'verwijder')} title={t.verwijder}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Fold id="fa-prullenbak" titel={`${t.prullenbak} (${trash.length})`}>
        {trash.length === 0 ? <div className="empty">-</div> : (
          <table className="tx compact">
            <tbody>
              {trash.map((f) => (
                <tr key={f.id}>
                  <td className="ell">{f.bestandsnaam || '·'}</td>
                  <td className="mono nw">{f.factuurdatum || f.bron_datum || ''}</td>
                  <td className="ell">{f.tegenpartij || ''}</td>
                  <td className="mono r nw">{f.totaal != null ? eur(f.totaal) : '·'}</td>
                  <td className="c"><button className="icobtn" onClick={() => doeActie(f.id, 'herstel')} title={t.herstel}><RotateCcw size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Fold>
    </>
  );
}

function TransactiesTab({ txs, focusId }) {
  const inn = txs.filter((r) => Number(r.bedrag) > 0).reduce((a, r) => a + Number(r.bedrag), 0);
  const uit = txs.filter((r) => Number(r.bedrag) < 0).reduce((a, r) => a + Math.abs(Number(r.bedrag)), 0);
  const refs = useRef({});
  useEffect(() => {
    if (focusId && refs.current[focusId]) refs.current[focusId].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, txs]);
  return (
    <div className="card tabelcard">
      <div className="tx-samenvatting">
        <span className="mono in">{eur(inn)}</span>
        <span className="mono uitv">{eur(uit)}</span>
      </div>
      {txs.length === 0 ? <div className="empty">{t.leegTx}</div> : (
        <table className="tx compact">
          <thead>
            <tr><th>{t.kDatum}</th><th>{t.kNaam}</th><th className="r">{t.kBedrag}</th><th className="c">{t.kBtw}</th><th className="c">{t.kKoppel}</th><th className="c">{t.kDownload}</th></tr>
          </thead>
          <tbody>
            {txs.map((r) => {
              const f = r.koppeling?.factuur;
              return (
                <tr key={r.id} ref={(el) => { refs.current[r.id] = el; }} className={focusId === r.id ? 'focus' : ''}>
                  <td className="mono nw">{r.datum}</td>
                  <td className="ell">{r.tegenpartij || ''}</td>
                  <td className={`mono r nw ${Number(r.bedrag) < 0 ? 'amt-neg' : 'amt-pos'}`}>{eur(r.bedrag)}</td>
                  <td className="c mono">{f?.btw_tarief ? (f.btw_tarief === 'verlegd' ? 'v' : `${f.btw_tarief}%`) : '·'}</td>
                  <td className="c"><span className={`icobtn ${r.koppeling ? 'ok' : 'fout'}`}><CircleDollarSign size={16} /></span></td>
                  <td className="c">{f?.link ? <a className="icobtn" href={f.link} target="_blank" rel="noreferrer"><Download size={16} /></a> : '·'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BtwTab({ txs, facs }) {
  const kwartalen = btwPerKwartaal(txs, facs);
  const open = kwartalen.filter((k) => !k.betaald && k.saldo > 0);
  const openBedrag = open.reduce((a, k) => a + k.saldo, 0);
  return (
    <>
      <div className="bento">
        <Metric id="btw-open" icon={<Landmark size={20} />} label={t.aangiftesOpen} value={open.length} />
        <Metric id="btw-bedrag" icon={<Percent size={20} />} label={t.bedragOpen} value={eur(openBedrag)} />
      </div>
      <div className="card tabelcard">
        {kwartalen.length === 0 ? <div className="empty">{t.leegBtw}</div> : (
          <table className="tx compact">
            <thead><tr><th>{t.kKwartaal}</th><th className="r">{t.inkomsten}</th><th className="r">{t.uitgaven}</th><th className="r">{t.kBedrag}</th><th className="c">{t.kStatus}</th></tr></thead>
            <tbody>
              {kwartalen.map((k) => (
                <tr key={k.kw}>
                  <td className="mono nw">{k.kw}</td>
                  <td className="mono r">{eur(k.verkoop)}</td>
                  <td className="mono r">{eur(k.inkoop)}</td>
                  <td className="mono r">{eur(k.saldo)}</td>
                  <td className="c"><span className={`chip ${k.betaald ? 'groen' : 'amber'}`}>{k.betaald ? t.betaald : t.open}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function LonenTab({ txs, reload }) {
  const nu = new Date();
  const maanden = [];
  for (let m = 0; m <= nu.getMonth(); m++) maanden.push(m);

  const betaaldCheck = (naam, bedrag, maand) => {
    return txs.some((r) => {
      const d = new Date(r.datum);
      if (d.getFullYear() !== nu.getFullYear() || d.getMonth() !== maand) return false;
      const b = Math.abs(Number(r.bedrag));
      if (Number(r.bedrag) >= 0) return false;
      const naamOk = (r.tegenpartij || '').toLowerCase().includes(naam.toLowerCase());
      return naamOk && Math.abs(b - bedrag) <= bedrag * 0.1;
    });
  };

  // Terugkerende diensten: zelfde tegenpartij in 2 of meer maanden, uitgaand,
  // exclusief belastingen, lonen en rekening courant.
  const abos = useMemo(() => {
    const uitsluiten = /belastingdienst|salaris|loon|rekening.?courant/i;
    const namen = LONEN.map((l) => l.naam.toLowerCase());
    const per = {};
    for (const r of txs) {
      if (Number(r.bedrag) >= 0) continue;
      const naam = (r.tegenpartij || '').trim();
      if (!naam || uitsluiten.test(naam) || uitsluiten.test(r.omschrijving || '')) continue;
      if (namen.some((n) => naam.toLowerCase().includes(n))) continue;
      const ym = (r.datum || '').slice(0, 7);
      if (!per[naam]) per[naam] = { naam, maanden: new Set(), totaal: 0, n: 0 };
      per[naam].maanden.add(ym); per[naam].totaal += Math.abs(Number(r.bedrag)); per[naam].n += 1;
    }
    return Object.values(per).filter((p) => p.maanden.size >= 2)
      .map((p) => ({ naam: p.naam, perMaand: p.totaal / p.maanden.size, maanden: p.maanden.size }))
      .sort((a, b) => b.perMaand - a.perMaand).slice(0, 12);
  }, [txs]);

  return (
    <>
      <div className="card tabelcard">
        <div className="tabel-top">
          <span className="tabel-titel">{t.lonenTitel}</span>
          <button className="mini ghost2" onClick={reload}><RefreshCw size={12} /> {t.verversen}</button>
        </div>
        <table className="tx compact">
          <thead><tr><th>{t.kDatum}</th><th>{t.kPersoon}</th><th className="r">{t.kSalaris}</th><th className="r">{t.kLoonbelasting}</th><th className="c">{t.kBetaald}</th></tr></thead>
          <tbody>
            {maanden.flatMap((m) => LONEN.map((l) => {
              const betaald = betaaldCheck(l.naam, l.salaris, m);
              return (
                <tr key={`${m}-${l.naam}`}>
                  <td className="mono nw">29 {MAANDEN[m]}</td>
                  <td>{l.naam}</td>
                  <td className="mono r">{eur(l.salaris)}</td>
                  <td className="mono r">{l.loonbelasting ? eur(l.loonbelasting) : '·'}</td>
                  <td className="c">{betaald ? <CheckCircle2 size={15} color="#2E7D5B" /> : <XCircle size={15} color="#B4462E" />}</td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      <div className="card tabelcard">
        <div className="tabel-top"><span className="tabel-titel">{t.abosTitel}</span></div>
        {abos.length === 0 ? <div className="empty">{t.leegAbo}</div> : (
          <table className="tx compact">
            <thead><tr><th>{t.kNaam}</th><th className="r">{t.kPerMaand}</th></tr></thead>
            <tbody>
              {abos.map((a) => (
                <tr key={a.naam}><td className="ell">{a.naam}</td><td className="mono r">{eur(a.perMaand)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function ProjectenTab() {
  const actief = PROJECTEN.filter((p) => p.actief);
  const perMaand = actief.reduce((a, p) => a + p.bedrag, 0);
  return (
    <>
      <div className="bento">
        <Metric id="pr-actief" icon={<Briefcase size={20} />} label={t.projActief} value={actief.length} />
        <Metric id="pr-maand" icon={<TrendingUp size={20} />} label={t.projMaand} value={eur(perMaand)} tint={{ bg: 'rgba(46,125,91,0.12)', fg: '#2E7D5B' }} />
      </div>
      <div className="card tabelcard">
        <table className="tx compact">
          <thead><tr><th>{t.kProject}</th><th className="r">{t.kPerMaand}</th><th className="c">{t.kStatus}</th><th>{t.kEinde}</th></tr></thead>
          <tbody>
            {PROJECTEN.map((p) => (
              <tr key={p.naam}>
                <td>{p.naam}</td>
                <td className="mono r">{eur(p.bedrag)}</td>
                <td className="c"><span className={`chip ${p.actief ? 'groen' : 'grijs'}`}>{p.actief ? t.actief : t.beeindigd}</span></td>
                <td className="mono nw">{p.einde || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const NAV = [
  { id: 'overzicht', icon: LayoutDashboard, sub: [{ label: T.nl.balans, anchor: 'ov-balans' }, { label: 'BTW', anchor: 'ov-btw' }, { label: T.nl.inkomsten, anchor: 'ov-donuts' }] },
  { id: 'facturen', icon: FileText, sub: [{ label: T.nl.ongekoppeld, anchor: 'fa-tabel' }, { label: T.nl.upload, anchor: 'fa-tabel' }] },
  { id: 'transacties', icon: ArrowLeftRight, sub: [] },
  { id: 'btw', icon: Percent, sub: [{ label: T.nl.aangiftesOpen, anchor: 'btw-open' }] },
  { id: 'lonen', icon: Banknote, sub: [] },
  { id: 'projecten', icon: Briefcase, sub: [{ label: T.nl.projActief, anchor: 'pr-actief' }] },
];

function App() {
  const [tab, setTab] = useState('overzicht');
  const [entiteit, setEntiteit] = useState('geconsolideerd');
  const [nonce, setNonce] = useState(0);
  const [syncBezig, setSyncBezig] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [focusTx, setFocusTx] = useState(null);
  const txs = useTransacties(entiteit, nonce);
  const facs = useFacturen(entiteit, nonce);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const sync = useCallback(async () => {
    setSyncBezig(true); setSyncMsg(null);
    const r = await postJson('/api/bunq-sync?maand=1');
    if (r && !r.ok) {
      const reden = (r.resultaten || []).filter((x) => !x.ok).map((x) => `${x.entiteit}: ${x.reden}`).join(' | ') || r.reden;
      setSyncMsg({ ok: false, text: reden || 'Bank sync fout' });
    } else if (r && r.ok) {
      const rek = (r.resultaten || []).reduce((a, x) => a + (x.rekeningen || 0), 0);
      const nw = (r.resultaten || []).reduce((a, x) => a + (x.verwerkt || 0), 0);
      setSyncMsg({ ok: true, text: `Bank: ${nw} verwerkt, ${rek} rekeningen` });
    }
    await postJson('/api/ingest?mode=maand');
    await postJson('/api/parse');
    await postJson('/api/match');
    setSyncBezig(false); setNonce((n) => n + 1);
  }, []);

  const startRef = useRef(false);
  useEffect(() => {
    if (startRef.current) return;
    startRef.current = true;
    sync();
  }, [sync]);

  const gaNaarTx = (id) => { setFocusTx(id); setTab('transacties'); };

  const entKeuze = [
    { id: 'geconsolideerd', naam: t.geconsolideerd },
    { id: 'holding', naam: t.holding },
    { id: 'werkmaatschappij', naam: t.werk },
  ];

  return (
    <div className="app">
      <nav className="rail">
        <div className="brand">B</div>
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={`rail-item${tab === item.id ? ' active' : ''}`} onClick={() => setTab(item.id)} aria-label={t.tabs[item.id]}>
              <Icon size={20} />
              {item.sub.length > 0 && (
                <div className="flyout">
                  <h4>{t.tabs[item.id]}</h4>
                  {item.sub.map((s, i) => (
                    <button key={i} onClick={(e) => { e.stopPropagation(); setTab(item.id); setTimeout(() => document.getElementById(s.anchor)?.scrollIntoView({ behavior: 'smooth' }), 60); }}>{s.label}</button>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      <main className="main">
        <div className="topbar">
          <div className="pagetitle">{t.tabs[tab]}</div>
          <div className="seg">
            {entKeuze.map((e) => (
              <button key={e.id} className={entiteit === e.id ? 'on' : ''} onClick={() => setEntiteit(e.id)}>{e.naam}</button>
            ))}
          </div>
          <div className="topacties">
            <button className="sync" onClick={sync} disabled={syncBezig}>
              <RefreshCw size={14} className={syncBezig ? 'spin' : ''} />
            </button>
            <StatusHub onRefresh={reload} />
          </div>
        </div>
        {syncMsg && <div className={`syncmsg${syncMsg.ok ? '' : ' err'}`}>{syncMsg.text}</div>}

        {tab === 'overzicht' && <Overzicht txs={txs} facs={facs} />}
        {tab === 'facturen' && <FacturenTab entiteit={entiteit} nonce={nonce} reload={reload} gaNaarTx={gaNaarTx} />}
        {tab === 'transacties' && <TransactiesTab txs={txs} focusId={focusTx} />}
        {tab === 'btw' && <BtwTab txs={txs} facs={facs} />}
        {tab === 'lonen' && <LonenTab txs={txs} reload={reload} />}
        {tab === 'projecten' && <ProjectenTab />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
