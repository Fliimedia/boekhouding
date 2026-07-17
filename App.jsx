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
  },
};

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

function App() {
  const [entiteit, setEntiteit] = useState('geconsolideerd');
  const [tab, setTab] = useState('overzicht');

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

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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

      <section style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 14 }}>
        {t.leeg}
      </section>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
