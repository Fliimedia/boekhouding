import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, FileText, ArrowLeftRight, Percent, Calendar,
  TrendingUp, TrendingDown, Wallet, Landmark, Link as LinkIcon, Unlink,
  Clock, Banknote, ChevronDown, RefreshCw,
} from 'lucide-react';

// i18n: Nederlands default, Engels bij Engelse browsertaal.
const T = {
  nl: {
    titel: 'Boekhouding',
    geconsolideerd: 'Geconsolideerd', holding: 'Holding', werk: 'Werkmaatschappij',
    sync: 'Synchroniseren', syncBezig: 'Bezig...',
    verbindingOk: 'Verbonden', verbindingFout: 'Geen verbinding', verbindingBezig: 'Controleren...',
    tabs: { overzicht: 'Overzicht', facturen: 'Facturen', transacties: 'Transacties', btw: 'BTW', agenda: 'Agenda' },
    inkomend: 'Inkomend', uitgaand: 'Uitgaand', saldo: 'Saldo', btwKwartaal: 'BTW dit kwartaal',
    openstaand: 'Openstaand', verkoop: 'Verkoopfacturen', inkoop: 'Inkoopfacturen',
    dezeMaand: 'Deze maand', gekoppeld: 'Gekoppeld', ongekoppeld: 'Ongekoppeld', aantal: 'Transacties',
    teBetalen: 'Te betalen', tarief21: 'Hoog tarief 21%', tarief9: 'Laag tarief 9%',
    betaalmomenten: 'Betaalmomenten', deadlines: 'Deadlines', lonen: 'Lonen',
    cashflow: 'Cashflow per maand', factuurTabel: 'Alle facturen', txTabel: 'Alle transacties',
    btwKwartaalTabel: 'BTW per kwartaal', agendaTabel: 'Tijdlijn',
    kDatum: 'Datum', kTegenpartij: 'Tegenpartij', kOmschrijving: 'Omschrijving', kBedrag: 'Bedrag',
    kBron: 'Bron', bekijk: 'Openen', ongekoppeldTag: 'ongekoppeld',
    sweepKnop: 'Historische import uit Gmail', sweepBezig: 'Bezig met importeren...',
    voorgesteld: 'Voorgestelde factuur', geenFactuur: 'Geen factuur gekoppeld',
    bevestigen: 'Bevestigen', ontkoppelen: 'Ontkoppelen', anderBestand: 'Ander bestand',
    koppelBestand: 'Bestand koppelen', bedragKlopt: 'bedrag komt overeen', bedragWijkt: 'bedrag wijkt af',
    bevestigdTag: 'bevestigd', bezigTag: 'Bezig...', bunqReset: 'Bunq opnieuw koppelen',
    leegTx: 'Nog geen transacties. Klik op Synchroniseren.',
    leegFac: 'Nog geen facturen. Voeg er een toe of koppel je e-mail en Drive.',
    leegBtw: 'BTW verschijnt zodra er facturen zijn.',
    leegAgenda: 'Nog geen geplande momenten.',
  },
  en: {
    titel: 'Bookkeeping',
    geconsolideerd: 'Consolidated', holding: 'Holding', werk: 'Operating company',
    sync: 'Sync', syncBezig: 'Working...',
    verbindingOk: 'Connected', verbindingFout: 'No connection', verbindingBezig: 'Checking...',
    tabs: { overzicht: 'Overview', facturen: 'Invoices', transacties: 'Transactions', btw: 'VAT', agenda: 'Agenda' },
    inkomend: 'Incoming', uitgaand: 'Outgoing', saldo: 'Balance', btwKwartaal: 'VAT this quarter',
    openstaand: 'Outstanding', verkoop: 'Sales invoices', inkoop: 'Purchase invoices',
    dezeMaand: 'This month', gekoppeld: 'Matched', ongekoppeld: 'Unmatched', aantal: 'Transactions',
    teBetalen: 'Payable', tarief21: 'High rate 21%', tarief9: 'Low rate 9%',
    betaalmomenten: 'Payments', deadlines: 'Deadlines', lonen: 'Payroll',
    cashflow: 'Cashflow per month', factuurTabel: 'All invoices', txTabel: 'All transactions',
    btwKwartaalTabel: 'VAT per quarter', agendaTabel: 'Timeline',
    kDatum: 'Date', kTegenpartij: 'Counterparty', kOmschrijving: 'Description', kBedrag: 'Amount',
    kBron: 'Source', bekijk: 'Open', ongekoppeldTag: 'unmatched',
    sweepKnop: 'Historic import from Gmail', sweepBezig: 'Importing...',
    voorgesteld: 'Suggested invoice', geenFactuur: 'No invoice linked',
    bevestigen: 'Confirm', ontkoppelen: 'Unlink', anderBestand: 'Other file',
    koppelBestand: 'Link file', bedragKlopt: 'amount matches', bedragWijkt: 'amount differs',
    bevestigdTag: 'confirmed', bezigTag: 'Working...', bunqReset: 'Reconnect Bunq',
    leegTx: 'No transactions yet. Click Sync.',
    leegFac: 'No invoices yet. Add one or connect your email and Drive.',
    leegBtw: 'VAT appears once invoices exist.',
    leegAgenda: 'Nothing scheduled yet.',
  },
};
const taal = (navigator.language || 'nl').toLowerCase().startsWith('en') ? 'en' : 'nl';
const t = T[taal];

const eur = (n) => new Intl.NumberFormat(taal === 'en' ? 'en-US' : 'nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
const maandKort = (ym) => {
  const [y, m] = ym.split('-');
  const namen = taal === 'en'
    ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    : ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  return namen[Number(m) - 1] || ym;
};

// Hero illustraties per tab. Altijd laadbaar, afgestemd op de huisstijl.
function HeroArt({ soort }) {
  const grad = (
    <defs>
      <linearGradient id={`g-${soort}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#163A2E" />
        <stop offset="1" stopColor="#0C231C" />
      </linearGradient>
    </defs>
  );
  const A = '#B4823C', F = 'rgba(255,255,255,0.12)', L = 'rgba(255,255,255,0.28)';
  const shapes = {
    overzicht: (
      <g>
        <rect x="60" y="120" width="30" height="70" rx="5" fill={F} />
        <rect x="105" y="90" width="30" height="100" rx="5" fill={L} />
        <rect x="150" y="60" width="30" height="130" rx="5" fill={A} />
        <circle cx="245" cy="80" r="34" fill="none" stroke={A} strokeWidth="8" />
        <path d="M245 80 L245 52 A28 28 0 0 1 270 92 Z" fill={A} opacity="0.5" />
      </g>
    ),
    facturen: (
      <g>
        <rect x="90" y="46" width="150" height="150" rx="10" fill="#FCFAF4" opacity="0.95" />
        <rect x="110" y="70" width="80" height="9" rx="4" fill="#163A2E" />
        <rect x="110" y="92" width="110" height="7" rx="3" fill="rgba(22,58,46,0.35)" />
        <rect x="110" y="108" width="110" height="7" rx="3" fill="rgba(22,58,46,0.35)" />
        <rect x="110" y="124" width="70" height="7" rx="3" fill="rgba(22,58,46,0.35)" />
        <rect x="110" y="156" width="100" height="12" rx="4" fill={A} />
      </g>
    ),
    transacties: (
      <g>
        <rect x="80" y="70" width="170" height="104" rx="14" fill={L} />
        <rect x="80" y="96" width="170" height="16" fill="rgba(0,0,0,0.25)" />
        <rect x="98" y="140" width="60" height="10" rx="5" fill={A} />
        <path d="M150 40 h60 M195 26 l18 14 -18 14" fill="none" stroke={A} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M180 210 h-60 M135 196 l-18 14 18 14" fill="none" stroke={F} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
    btw: (
      <g>
        <circle cx="165" cy="118" r="66" fill="none" stroke={L} strokeWidth="10" />
        <circle cx="140" cy="93" r="13" fill={A} />
        <circle cx="190" cy="143" r="13" fill={A} />
        <path d="M198 78 L132 158" stroke="#FCFAF4" strokeWidth="9" strokeLinecap="round" />
      </g>
    ),
    agenda: (
      <g>
        <rect x="86" y="60" width="158" height="132" rx="12" fill="#FCFAF4" opacity="0.95" />
        <rect x="86" y="60" width="158" height="30" rx="12" fill={A} />
        <rect x="118" y="46" width="10" height="26" rx="5" fill="#0C231C" />
        <rect x="202" y="46" width="10" height="26" rx="5" fill="#0C231C" />
        <g fill="rgba(22,58,46,0.4)">
          <rect x="104" y="104" width="20" height="16" rx="3" /><rect x="136" y="104" width="20" height="16" rx="3" />
          <rect x="168" y="104" width="20" height="16" rx="3" /><rect x="200" y="104" width="20" height="16" rx="3" />
          <rect x="104" y="132" width="20" height="16" rx="3" /><rect x="136" y="132" width="20" height="16" rx="3" fill="#B4823C" />
          <rect x="168" y="132" width="20" height="16" rx="3" /><rect x="200" y="132" width="20" height="16" rx="3" />
        </g>
      </g>
    ),
  };
  return (
    <svg className="hero-art" viewBox="0 0 330 240" preserveAspectRatio="xMidYMid slice">
      {grad}
      <rect width="330" height="240" fill={`url(#g-${soort})`} />
      {shapes[soort]}
    </svg>
  );
}

function Hero({ soort, eyebrow, big }) {
  return (
    <div className="card hero">
      <HeroArt soort={soort} />
      <div className="hero-copy">
        <div className="eyebrow">{eyebrow}</div>
        <div className="big mono">{big}</div>
      </div>
    </div>
  );
}

function Metric({ id, icon, label, value, tint }) {
  return (
    <div className="card span2" id={id}>
      <div className="metric-icon" style={tint ? { background: tint.bg, color: tint.fg } : undefined}>{icon}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-value mono" style={tint ? { color: tint.fg } : undefined}>{value}</div>
    </div>
  );
}

function Fold({ id, titel, children, openDefault }) {
  const [open, setOpen] = useState(!!openDefault);
  return (
    <div className={`fold${open ? ' open' : ''}`} id={id}>
      <div className="fold-head" onClick={() => setOpen((o) => !o)}>
        <span>{titel}</span>
        <ChevronDown className="chev" size={18} />
      </div>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
}

function CashflowChart({ maanden }) {
  if (!maanden.length) return <div className="empty">{t.leegTx}</div>;
  const max = Math.max(1, ...maanden.map((m) => Math.max(m.in, m.uit)));
  const H = 150, bw = 14, gap = 10, groep = bw * 2 + 6, stap = groep + gap;
  const W = maanden.length * stap + 20;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 28}`} style={{ display: 'block' }}>
      {maanden.map((m, i) => {
        const x = 14 + i * stap;
        const hi = (m.in / max) * H, hu = (m.uit / max) * H;
        return (
          <g key={m.ym}>
            <rect x={x} y={H - hi} width={bw} height={hi} rx="3" fill="#2E7D5B" />
            <rect x={x + bw + 6} y={H - hu} width={bw} height={hu} rx="3" fill="#B4462E" />
            <text x={x + bw} y={H + 20} textAnchor="middle" fontSize="11" fill="#5E6B64" fontFamily="IBM Plex Mono">{maandKort(m.ym)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TxTabel({ rows }) {
  if (!rows.length) return <div className="empty">{t.leegTx}</div>;
  return (
    <table className="tx">
      <thead>
        <tr><th>{t.kDatum}</th><th>{t.kTegenpartij}</th><th>{t.kOmschrijving}</th><th style={{ textAlign: 'right' }}>{t.kBedrag}</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="mono" style={{ whiteSpace: 'nowrap' }}>{r.datum}</td>
            <td>{r.tegenpartij || ''}</td>
            <td style={{ color: '#5E6B64' }}>{r.omschrijving || ''}</td>
            <td className={`mono ${Number(r.bedrag) < 0 ? 'amt-neg' : 'amt-pos'}`} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{eur(r.bedrag)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useTransacties(entiteit, nonce) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let leeft = true;
    fetch(`/api/transacties?type=${entiteit}`)
      .then((r) => r.json())
      .then((d) => { if (leeft) setRows(d.transacties || []); })
      .catch(() => { if (leeft) setRows([]); });
    return () => { leeft = false; };
  }, [entiteit, nonce]);
  return rows;
}

function useFacturen(entiteit, nonce) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let leeft = true;
    fetch(`/api/facturen?type=${entiteit}`)
      .then((r) => r.json())
      .then((d) => { if (leeft) setRows(d.facturen || []); })
      .catch(() => { if (leeft) setRows([]); });
    return () => { leeft = false; };
  }, [entiteit, nonce]);
  return rows;
}

function FacturenTabel({ rows }) {
  if (!rows.length) return <div className="empty">{t.leegFac}</div>;
  return (
    <table className="tx">
      <thead>
        <tr><th>{t.kDatum}</th><th>{t.kTegenpartij}</th><th>{t.kBron}</th><th style={{ textAlign: 'right' }}>{t.kBedrag}</th></tr>
      </thead>
      <tbody>
        {rows.map((f) => (
          <tr key={f.id}>
            <td className="mono" style={{ whiteSpace: 'nowrap' }}>{f.bron_datum || f.factuurdatum || ''}</td>
            <td>
              {f.link ? <a href={f.link} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>{f.tegenpartij || f.bestandsnaam || t.bekijk}</a> : (f.tegenpartij || f.bestandsnaam || '')}
              {f.totaal == null && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)' }}>{t.ongekoppeldTag}</span>}
            </td>
            <td style={{ color: '#5E6B64', textTransform: 'capitalize' }}>{f.bron || ''}</td>
            <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap', color: f.totaal == null ? '#9aa39d' : undefined }}>
              {f.totaal == null ? '·' : eur(f.totaal)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function afgeleid(rows) {
  let inn = 0, uit = 0;
  const perMaand = {};
  const nu = new Date();
  const dezeYm = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}`;
  let dezeMaand = 0;
  for (const r of rows) {
    const b = Number(r.bedrag) || 0;
    if (b >= 0) inn += b; else uit += -b;
    const ym = (r.datum || '').slice(0, 7);
    if (!perMaand[ym]) perMaand[ym] = { ym, in: 0, uit: 0 };
    if (b >= 0) perMaand[ym].in += b; else perMaand[ym].uit += -b;
    if (ym === dezeYm) dezeMaand += 1;
  }
  const maanden = Object.values(perMaand).sort((a, b) => a.ym.localeCompare(b.ym)).slice(-6);
  return { inn, uit, net: inn - uit, count: rows.length, dezeMaand, maanden };
}

function Overzicht({ rows }) {
  const d = afgeleid(rows);
  return (
    <>
      <div className="bento">
        <Hero soort="overzicht" eyebrow={t.saldo} big={eur(d.net)} />
        <Metric id="ov-in" icon={<TrendingUp size={20} />} label={t.inkomend} value={eur(d.inn)} tint={{ bg: 'rgba(46,125,91,0.12)', fg: '#2E7D5B' }} />
        <Metric id="ov-uit" icon={<TrendingDown size={20} />} label={t.uitgaand} value={eur(d.uit)} tint={{ bg: 'rgba(180,70,46,0.12)', fg: '#B4462E' }} />
        <Metric id="ov-btw" icon={<Percent size={20} />} label={t.btwKwartaal} value={eur(0)} />
        <Metric id="ov-wallet" icon={<Wallet size={20} />} label={t.aantal} value={d.count} />
      </div>
      <div className="folds">
        <Fold id="ov-cashflow" titel={t.cashflow} openDefault><CashflowChart maanden={d.maanden} /></Fold>
        <Fold id="ov-recent" titel={t.txTabel}><TxTabel rows={rows.slice(0, 12)} /></Fold>
      </div>
    </>
  );
}

function Facturen({ entiteit, nonce }) {
  const [lokaal, setLokaal] = useState(0);
  const [sweepBezig, setSweepBezig] = useState(false);
  const [sweepN, setSweepN] = useState(0);
  const [sweepMsg, setSweepMsg] = useState(null);
  const rows = useFacturen(entiteit, `${nonce}-${lokaal}`);
  const open = rows.filter((f) => f.status === 'open').length;
  const inkoop = rows.filter((f) => f.richting === 'inkoop').length;
  const verkoop = rows.filter((f) => f.richting === 'verkoop').length;

  const sweep = async () => {
    setSweepBezig(true); setSweepN(0); setSweepMsg(null);
    let meer = true, veilig = 0, totaal = 0, laatste = null;
    while (meer && veilig < 80) {
      const r = await postJson('/api/ingest?mode=sweep', {});
      laatste = r;
      if (!r || !r.ok) { meer = false; break; }
      totaal += r.nieuw || 0;
      setSweepN(totaal);
      meer = !!r.meer;
      veilig += 1;
      setLokaal((n) => n + 1);
    }
    setSweepBezig(false); setLokaal((n) => n + 1);
    if (!laatste) setSweepMsg({ ok: false, text: 'Geen antwoord van de server.' });
    else if (!laatste.ok) setSweepMsg({ ok: false, text: (laatste.fouten && laatste.fouten.length ? laatste.fouten.join('  |  ') : laatste.reden) || 'Onbekende fout' });
    else setSweepMsg({ ok: true, text: `Klaar: ${totaal} nieuw` });
  };

  return (
    <>
      <div className="bento">
        <Hero soort="facturen" eyebrow={t.tabs.facturen} big={rows.length} />
        <Metric id="fa-open" icon={<FileText size={20} />} label={t.openstaand} value={open} />
        <Metric id="fa-verkoop" icon={<TrendingUp size={20} />} label={t.verkoop} value={verkoop} />
        <Metric id="fa-inkoop" icon={<TrendingDown size={20} />} label={t.inkoop} value={inkoop} />
        <Metric id="fa-tot" icon={<Banknote size={20} />} label={t.tabs.facturen} value={rows.length} />
      </div>
      <div className="folds">
        <Fold id="fa-tabel" titel={t.factuurTabel} openDefault><FacturenTabel rows={rows} /></Fold>
      </div>
      <button className="ghost" onClick={sweep} disabled={sweepBezig}>
        {sweepBezig ? `${t.sweepBezig} ${sweepN}` : t.sweepKnop}
      </button>
      {sweepMsg && <div className={`syncmsg${sweepMsg.ok ? '' : ' err'}`} style={{ marginTop: 10 }}>{sweepMsg.text}</div>}
    </>
  );
}

async function postJson(url, body) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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

function TransactieRij({ tx, reload }) {
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const fileRef = useRef(null);
  const k = tx.koppeling;
  const bedrag = Number(tx.bedrag);
  const match = k?.factuur?.totaal != null && Math.abs(k.factuur.totaal - Math.abs(bedrag)) < 0.02;

  const doe = (p) => { setBezig(true); Promise.resolve(p).finally(() => { setBezig(false); reload(); }); };
  const bevestig = () => doe(postJson('/api/koppeling', { transactie_id: tx.id, actie: 'bevestig' }));
  const ontkoppel = () => doe(postJson('/api/koppeling', { transactie_id: tx.id, actie: 'verwijder' }));
  const kies = (e) => { e.stopPropagation(); fileRef.current?.click(); };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBezig(true);
    const data = await fileToBase64(file);
    await postJson('/api/factuur-upload', { transactie_id: tx.id, bestandsnaam: file.name, data_base64: data });
    setBezig(false); reload();
  };

  const stip = k ? (k.bevestigd ? '#2E7D5B' : '#B4823C') : 'transparent';

  return (
    <div className={`txitem${open ? ' open' : ''}`}>
      <div className="txhead" onClick={() => setOpen((o) => !o)}>
        <span className="txdot" style={{ background: stip }} />
        <span className="mono txdate">{tx.datum}</span>
        <span className="txname">{tx.tegenpartij || ''}</span>
        <span className={`mono ${bedrag < 0 ? 'amt-neg' : 'amt-pos'}`}>{eur(bedrag)}</span>
        <ChevronDown className="chev" size={16} />
      </div>
      {open && (
        <div className="txbody">
          {tx.omschrijving && <div className="txmeta">{tx.omschrijving}</div>}
          <div className="txfac-label">{t.voorgesteld}</div>
          {k && k.factuur ? (
            <div className="txfac-row">
              {k.factuur.link
                ? <a href={k.factuur.link} target="_blank" rel="noreferrer">{k.factuur.bestandsnaam || k.factuur.tegenpartij || t.bekijk}</a>
                : <span>{k.factuur.bestandsnaam || k.factuur.tegenpartij || ''}</span>}
              <span className="mono">{k.factuur.totaal != null ? eur(k.factuur.totaal) : '·'}</span>
              {k.factuur.totaal != null && (
                <span className={match ? 'match-ok' : 'match-warn'}>{match ? t.bedragKlopt : t.bedragWijkt}</span>
              )}
              {k.bevestigd
                ? <span className="chip">{t.bevestigdTag}</span>
                : <button className="mini" onClick={bevestig} disabled={bezig}>{t.bevestigen}</button>}
            </div>
          ) : <div className="txfac-empty">{t.geenFactuur}</div>}
          <div className="txfac-actions">
            <button className="ghost small" onClick={kies} disabled={bezig}>+ {t.anderBestand}</button>
            {k && <button className="ghost small" onClick={ontkoppel} disabled={bezig}>{t.ontkoppelen}</button>}
            {bezig && <span className="txbezig">{t.bezigTag}</span>}
            <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={upload} />
          </div>
        </div>
      )}
    </div>
  );
}

function TransactieLijst({ rows, reload }) {
  if (!rows.length) return <div className="empty">{t.leegTx}</div>;
  return <div className="txlist">{rows.map((r) => <TransactieRij key={r.id} tx={r} reload={reload} />)}</div>;
}

function Transacties({ rows, reload }) {
  const d = afgeleid(rows);
  const gekoppeld = rows.filter((r) => r.koppeling && r.koppeling.bevestigd).length;
  const [resetBezig, setResetBezig] = useState(false);
  const bunqReset = async () => {
    setResetBezig(true);
    await postJson('/api/bunq-sync?reset=1', {});
    setResetBezig(false); reload();
  };
  return (
    <>
      <div className="bento">
        <Hero soort="transacties" eyebrow={t.tabs.transacties} big={d.count} />
        <Metric id="tx-maand" icon={<Calendar size={20} />} label={t.dezeMaand} value={d.dezeMaand} />
        <Metric id="tx-gekoppeld" icon={<LinkIcon size={20} />} label={t.gekoppeld} value={gekoppeld} />
        <Metric id="tx-ongekoppeld" icon={<Unlink size={20} />} label={t.ongekoppeld} value={d.count - gekoppeld} />
        <Metric id="tx-in" icon={<TrendingUp size={20} />} label={t.inkomend} value={eur(d.inn)} tint={{ bg: 'rgba(46,125,91,0.12)', fg: '#2E7D5B' }} />
      </div>
      <div className="folds">
        <Fold id="tx-tabel" titel={t.txTabel} openDefault><TransactieLijst rows={rows} reload={reload} /></Fold>
      </div>
      <button className="ghost" onClick={bunqReset} disabled={resetBezig}>
        {resetBezig ? t.bezigTag : t.bunqReset}
      </button>
    </>
  );
}

function Btw({ entiteit, nonce }) {
  const rows = useFacturen(entiteit, nonce);
  const nu = new Date();
  const qStart = new Date(nu.getFullYear(), Math.floor(nu.getMonth() / 3) * 3, 1);
  const qEind = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1);
  const inKwartaal = (f) => {
    const d = new Date(f.factuurdatum || f.bron_datum || 0);
    return d >= qStart && d < qEind;
  };
  const kwart = rows.filter((f) => f.totaal != null && inKwartaal(f));
  const som = (pred) => kwart.filter(pred).reduce((a, f) => a + Number(f.btw_bedrag || 0), 0);
  const verkoopBtw = som((f) => f.richting === 'verkoop');
  const inkoopBtw = som((f) => f.richting === 'inkoop');
  const teBetalen = verkoopBtw - inkoopBtw;

  return (
    <>
      <div className="bento">
        <Hero soort="btw" eyebrow={t.tabs.btw} big={eur(teBetalen)} />
        <Metric id="btw-tebetalen" icon={<Landmark size={20} />} label={t.teBetalen} value={eur(teBetalen)} />
        <Metric id="btw-tarief" icon={<Percent size={20} />} label={t.tarief21} value={eur(som((f) => f.btw_tarief === '21'))} />
        <Metric id="btw-laag" icon={<Percent size={20} />} label={t.tarief9} value={eur(som((f) => f.btw_tarief === '9'))} />
      </div>
      <div className="folds">
        <Fold id="btw-kwartaal" titel={t.btwKwartaalTabel} openDefault>
          {kwart.length === 0 ? <div className="empty">{t.leegBtw}</div> : <FacturenTabel rows={kwart} />}
        </Fold>
      </div>
    </>
  );
}

function Agenda() {
  return (
    <>
      <div className="bento">
        <Hero soort="agenda" eyebrow={t.tabs.agenda} big="0" />
        <Metric id="ag-betaal" icon={<Clock size={20} />} label={t.betaalmomenten} value={0} />
        <Metric id="ag-deadline" icon={<Calendar size={20} />} label={t.deadlines} value={0} />
        <Metric id="ag-loon" icon={<Banknote size={20} />} label={t.lonen} value={0} />
      </div>
      <div className="folds">
        <Fold id="ag-tabel" titel={t.agendaTabel}><div className="empty">{t.leegAgenda}</div></Fold>
      </div>
    </>
  );
}

const NAV = [
  { id: 'overzicht', icon: LayoutDashboard, sub: [
    { label: T.nl.saldo, anchor: 'ov-recent' }, { label: T.nl.inkomend, anchor: 'ov-in' },
    { label: T.nl.btwKwartaal, anchor: 'ov-btw' }, { label: T.nl.cashflow, anchor: 'ov-cashflow' } ] },
  { id: 'facturen', icon: FileText, sub: [
    { label: T.nl.openstaand, anchor: 'fa-open' }, { label: T.nl.verkoop, anchor: 'fa-verkoop' },
    { label: T.nl.inkoop, anchor: 'fa-inkoop' }, { label: T.nl.factuurTabel, anchor: 'fa-tabel' } ] },
  { id: 'transacties', icon: ArrowLeftRight, sub: [
    { label: T.nl.dezeMaand, anchor: 'tx-maand' }, { label: T.nl.gekoppeld, anchor: 'tx-gekoppeld' },
    { label: T.nl.txTabel, anchor: 'tx-tabel' } ] },
  { id: 'btw', icon: Percent, sub: [
    { label: T.nl.teBetalen, anchor: 'btw-tebetalen' }, { label: T.nl.tarief21, anchor: 'btw-tarief' },
    { label: T.nl.btwKwartaalTabel, anchor: 'btw-kwartaal' } ] },
  { id: 'agenda', icon: Calendar, sub: [
    { label: T.nl.betaalmomenten, anchor: 'ag-betaal' }, { label: T.nl.deadlines, anchor: 'ag-deadline' },
    { label: T.nl.lonen, anchor: 'ag-loon' } ] },
];

function StatusDot() {
  const [status, setStatus] = useState('bezig');
  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then((d) => setStatus(d.ok ? 'ok' : 'fout')).catch(() => setStatus('fout'));
  }, []);
  const kleur = status === 'ok' ? '#2E7D5B' : status === 'fout' ? '#B4462E' : '#9aa39d';
  const label = status === 'ok' ? t.verbindingOk : status === 'fout' ? t.verbindingFout : t.verbindingBezig;
  return <span className="status"><span className="dot" style={{ background: kleur }} />{label}</span>;
}

function App() {
  const [tab, setTab] = useState('overzicht');
  const [entiteit, setEntiteit] = useState('geconsolideerd');
  const [nonce, setNonce] = useState(0);
  const [syncBezig, setSyncBezig] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const rows = useTransacties(entiteit, nonce);

  const ga = useCallback((tabId, anchorId) => { setTab(tabId); setAnchor(anchorId || null); }, []);

  useEffect(() => {
    if (!anchor) return;
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setAnchor(null);
  }, [tab, anchor, rows]);

  const sync = async () => {
    setSyncBezig(true); setSyncMsg(null);
    const q = entiteit === 'geconsolideerd' ? '' : `?type=${entiteit}`;
    try {
      const r = await fetch(`/api/bunq-sync${q}`, { method: 'POST' });
      const raw = await r.text();
      let j = null;
      try { j = JSON.parse(raw); } catch { /* geen json */ }
      if (j && j.ok) {
        const nieuw = (j.resultaten || []).reduce((a, x) => a + (x.verwerkt || 0), 0);
        const rek = (j.resultaten || []).reduce((a, x) => a + (x.rekeningen || 0), 0);
        setSyncMsg({ ok: true, text: `Bank: ${nieuw} nieuw, ${rek} rekeningen` });
      } else {
        const reden = (j?.resultaten || []).filter((x) => !x.ok).map((x) => `${x.entiteit}: ${x.reden}`).join('  |  ')
          || j?.reden || (raw ? raw.slice(0, 300) : `status ${r.status}`);
        setSyncMsg({ ok: false, text: reden });
      }
    } catch (e) {
      setSyncMsg({ ok: false, text: String(e.message || e) });
    }
    await Promise.allSettled([fetch('/api/ingest', { method: 'POST' })]);
    await fetch('/api/parse', { method: 'POST' }).catch(() => {});
    await fetch('/api/match', { method: 'POST' }).catch(() => {});
    setSyncBezig(false); setNonce((n) => n + 1);
  };

  const startRef = useRef(false);
  useEffect(() => {
    if (startRef.current) return;
    startRef.current = true;
    sync();
  }, []);

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
              <Icon size={21} />
              <div className="flyout">
                <h4>{t.tabs[item.id]}</h4>
                {item.sub.map((s) => (
                  <button key={s.anchor} onClick={(e) => { e.stopPropagation(); ga(item.id, s.anchor); }}>{s.label}</button>
                ))}
              </div>
            </button>
          );
        })}
      </nav>

      <main className="main">
        <div className="topbar">
          <div className="seg">
            {entKeuze.map((e) => (
              <button key={e.id} className={entiteit === e.id ? 'on' : ''} onClick={() => setEntiteit(e.id)}>{e.naam}</button>
            ))}
          </div>
          <div className="pagetitle">{t.tabs[tab]}</div>
          <div className="syncwrap">
            <button className="sync" onClick={sync} disabled={syncBezig}>
              <RefreshCw size={15} className={syncBezig ? 'spin' : ''} />
              {t.tabs.transacties}
            </button>
            <StatusDot />
          </div>
        </div>
        {syncMsg && <div className={`syncmsg${syncMsg.ok ? '' : ' err'}`}>{syncMsg.text}</div>}

        {tab === 'overzicht' && <Overzicht rows={rows} />}
        {tab === 'facturen' && <Facturen entiteit={entiteit} nonce={nonce} />}
        {tab === 'transacties' && <Transacties rows={rows} reload={() => setNonce((n) => n + 1)} />}
        {tab === 'btw' && <Btw entiteit={entiteit} nonce={nonce} />}
        {tab === 'agenda' && <Agenda />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
