import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './lib/store';
import { Scan } from './components/Scan';
import { Collection } from './components/Collection';
import { Decks } from './components/Decks';
import { Value } from './components/Value';
import { Settings } from './components/Settings';

type Tab = 'collection' | 'scan' | 'decks' | 'value' | 'settings';
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'collection', icon: '🗂️', label: 'Cards' },
  { id: 'scan', icon: '📷', label: 'Scan' },
  { id: 'decks', icon: '🃏', label: 'Decks' },
  { id: 'value', icon: '💰', label: 'Value' },
  { id: 'settings', icon: '⚙️', label: 'More' },
];

function Shell() {
  const initial = (new URLSearchParams(location.search).get('tab') as Tab) || 'collection';
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initial) ? initial : 'collection');
  const { ready, toastMsg } = useStore();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  if (!ready) return <div className="loading">Loading…</div>;
  return (
    <>
      <main>
        {tab === 'collection' && <Collection />}
        {tab === 'scan' && <Scan />}
        {tab === 'decks' && <Decks />}
        {tab === 'value' && <Value />}
        {tab === 'settings' && <Settings />}
      </main>
      {toastMsg && <div className="toast">{toastMsg}</div>}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
            <span className="ti">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
