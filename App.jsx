import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// i18n: Nederlands als default, Engels bij Engelse browsertaal.
const teksten = {
  nl: {
    titel: 'Boekhouding overzicht',
    geconsolideerd: 'Geconsolideerd',
    tabs: {
      overzicht: 'Overzicht',
      facturen: 'Facturen',
      transacties: 'Transacties',
      btw: 'BTW',
      agenda: 'Agenda',
    },
    leeg: 'Nog geen gegevens. Deze view wordt in een volgende fase gevuld.',
    verbindingBezig: 'Verbinding controleren...',
    verbindingOk: 'Database verbonden',
    verbindingFout: 'Geen verbinding',
    sync: 'Bank synchroniseren',
    syncBezig: 'Bezig met synchroniseren...',
    transactieLeeg: 'Nog geen transacties. Klik op Bank synchroniseren.',
    kolomDatum: 'Datum',
    kolomTegenpartij: 'Tegenpartij',
    kolomOmschrijving: 'Omschrijving',
    kolomBedrag: 'Bedrag',
  },
  en: {
    titel: 'Bookkeeping overview',
    geconsolideerd: 'Consolidated',
    tabs: {
      overzicht: 'Overview',
      facturen: 'Invoices',
      transacties: 'Transactions',
      btw: 'VAT',
      agenda: 'Agenda',
    },
    leeg: 'No data yet. This view is populated in a later phase.',
    verbindingBezig: 'Checking connection...',
    verbindingOk: 'Database connected',
    verbindingFout: 'No connection',
    sync: 'Sync bank',
    syncBezig: 'Syncing...',
    transactieLeeg: 'No transactions yet. Click Sync bank.',
    kolomDatum: 'Date',
    kolomTegenpartij: 'Counterparty',
    kolomOmschrijving: 'Description',
    kolomBedrag: 'Amount',
  },
};

function formatBedrag(n) {
  return new Intl.NumberFormat(taal === 'en' ? 'en-US' : 'nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(n || 0));
}

const taal = (navigator.language || 'nl').toLowerCase().startsWith('en') ? 'en' : 'nl';
const t = teksten[taal];

function StatusBalk() {
  const [status, setStatus] = useState('bezig');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        setStatus(data.ok ? 'ok' : 'fout');
        setDetail(data);
      })
      .catch(() => setStatus('fout'));
  }, []);

  const kleur = status === 'ok' ? '#1f9d55' : status === 'fout' ? '#c0392b' : '#888';
  const label =
    status === 'ok' ? t.verbindingOk : status === 'fout' ? t.verbindingFout : t.verbindingBezig;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ width: 8, height: 8, borderRadius: 8, background: kleur, display: 'inline-block' }} />
      <span style={{ color: '#555' }}>{label}</span>
    </div>
  );
}

function Transacties({ entiteit }) {
  const [rijen, setRijen] = useState([]);
  const [bezig, setBezig] = useState(true);

  const laden = () => {
    setBezig(true);
    fetch(`/api/transacties?type=${entiteit}`)
      .then((r) => r.json())
      .then((d) => setRijen(d.transacties || []))
      .catch(() => setRijen([]))
      .finally(() => setBezig(false));
  };

  useEffect(() => { laden(); }, [entiteit]);

  if (bezig) return <div style={{ color: '#999', padding: 24 }}>...</div>;
  if (rijen.length === 0) {
    return <div style={{ color: '#999', padding: 24, textAlign: 'center' }}>{t.transactieLeeg}</div>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', color: '#888', borderBottom: '1px solid #eee' }}>
          <th style={{ padding: '8px 6px' }}>{t.kolomDatum}</th>
          <th style={{ padding: '8px 6px' }}>{t.kolomTegenpartij}</th>
          <th style={{ padding: '8px 6px' }}>{t.kolomOmschrijving}</th>
          <th style={{ padding: '8px 6px', textAlign: 'right' }}>{t.kolomBedrag}</th>
        </tr>
      </thead>
      <tbody>
        {rijen.map((r) => (
          <tr key={r.id} style={{ borderBottom: '1px solid #f4f4f4' }}>
            <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{r.datum}</td>
            <td style={{ padding: '8px 6px' }}>{r.tegenpartij || ''}</td>
            <td style={{ padding: '8px 6px', color: '#666' }}>{r.omschrijving || ''}</td>
            <td style={{ padding: '8px 6px', textAlign: 'right', color: Number(r.bedrag) < 0 ? '#c0392b' : '#1f9d55', whiteSpace: 'nowrap' }}>
              {formatBedrag(r.bedrag)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function App() {
  const [entiteit, setEntiteit] = useState('geconsolideerd');
  const [tab, setTab] = useState('overzicht');
  const [syncBezig, setSyncBezig] = useState(false);
  const [syncNonce, setSyncNonce] = useState(0);

  const synchroniseer = () => {
    setSyncBezig(true);
    const q = entiteit === 'geconsolideerd' ? '' : `?type=${entiteit}`;
    fetch(`/api/bunq-sync${q}`, { method: 'POST' })
      .then((r) => r.json())
      .catch(() => null)
      .finally(() => { setSyncBezig(false); setSyncNonce((n) => n + 1); });
  };

  const entiteiten = [
    { id: 'geconsolideerd', naam: t.geconsolideerd },
    { id: 'holding', naam: 'Holding' },
    { id: 'werkmaatschappij', naam: 'Werkmaatschappij' },
  ];

  const tabKeys = ['overzicht', 'facturen', 'transacties', 'btw', 'agenda'];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: '#1a1a1a', maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{t.titel}</h1>
        <StatusBalk />
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {entiteiten.map((e) => (
          <button
            key={e.id}
            onClick={() => setEntiteit(e.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #ddd',
              background: entiteit === e.id ? '#1a1a1a' : '#fff',
              color: entiteit === e.id ? '#fff' : '#1a1a1a',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {e.naam}
          </button>
        ))}
        <button
          onClick={synchroniseer}
          disabled={syncBezig}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #1a1a1a',
            background: '#fff',
            color: '#1a1a1a',
            cursor: syncBezig ? 'wait' : 'pointer',
            fontSize: 13,
          }}
        >
          {syncBezig ? t.syncBezig : t.sync}
        </button>
      </div>

      <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid #eee', marginBottom: 20 }}>
        {tabKeys.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '8px 12px',
              border: 'none',
              borderBottom: tab === k ? '2px solid #1a1a1a' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: tab === k ? 600 : 400,
            }}
          >
            {t.tabs[k]}
          </button>
        ))}
      </nav>

      <section style={{ minHeight: 240 }}>
        {tab === 'transacties' ? (
          <Transacties key={`${entiteit}-${syncNonce}`} entiteit={entiteit} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, color: '#999', fontSize: 14 }}>
            {t.leeg}
          </div>
        )}
      </section>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
