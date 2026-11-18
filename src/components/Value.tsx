import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { fmtUsd } from '../lib/price';

export function Value() {
  const { rows, groups, pricesUpdatedAt, refreshPrices, toast } = useStore();
  const [progress, setProgress] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = rows.reduce((a, r) => a + r.value, 0);
    const copies = rows.reduce((a, r) => a + r.entry.qty, 0);
    const unpriced = rows.filter((r) => r.unit == null).length;
    const byGroup = [...groups, '(no owner)'].map((g) => {
      const rs = rows.filter((r) => (g === '(no owner)' ? r.entry.owners.length === 0 : r.entry.owners.includes(g)));
      return { g, value: rs.reduce((a, r) => a + r.value, 0), copies: rs.reduce((a, r) => a + r.entry.qty, 0) };
    }).filter((x) => x.copies > 0 || x.g !== '(no owner)');
    const top = [...rows].sort((a, b) => (b.unit ?? 0) - (a.unit ?? 0)).slice(0, 10);
    const shared = rows.filter((r) => r.entry.owners.length > 1).reduce((a, r) => a + r.value, 0);
    return { total, copies, unpriced, byGroup, top, shared };
  }, [rows, groups]);
  const maxG = Math.max(1, ...stats.byGroup.map((x) => x.value));

  async function refresh() {
    setProgress('Starting…');
    try {
      const n = await refreshPrices((d, t) => setProgress(`Updating ${d}/${t} cards…`));
      toast(`Updated prices for ${n} cards`);
    } catch (e: any) {
      toast(`Price refresh failed: ${e.message}`);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="page">
      <h1>Collection value</h1>
      <section className="hero-total card-box" data-testid="total-value">
        <small>Total value</small>
        <b>{fmtUsd(stats.total)}</b>
        <span className="muted">
          {rows.length} cards · {stats.copies} copies{stats.unpriced ? ` · ${stats.unpriced} without a price` : ''}
        </span>
      </section>

      <section className="card-box">
        <h3>By owner</h3>
        {stats.byGroup.map((x) => (
          <div key={x.g} className="bar-row">
            <span className="bar-label">{x.g}</span>
            <span className="bar">
              <span style={{ width: `${(x.value / maxG) * 100}%` }} />
            </span>
            <span className="bar-val">
              {fmtUsd(x.value)}
              <small className="muted"> · {x.copies}</small>
            </span>
          </div>
        ))}
        {stats.shared > 0 && <p className="muted small">Cards tagged with several owners count toward each of them ({fmtUsd(stats.shared)} shared).</p>}
      </section>

      <section className="card-box">
        <h3>Most valuable</h3>
        <ol className="top-list">
          {stats.top.map((r) => (
            <li key={r.entry.key}>
              <img src={r.card.imageSmall} alt="" loading="lazy" />
              <span className="grow">
                {r.card.name}
                {r.entry.finish !== 'nonfoil' && ' ✨'}
                <br />
                <small className="muted">
                  {r.card.set.toUpperCase()} · {r.entry.owners.join(', ') || 'no owner'} · ×{r.entry.qty}
                </small>
              </span>
              <b>{fmtUsd(r.unit)}</b>
            </li>
          ))}
        </ol>
        {!stats.top.length && <p className="muted">Add cards to see values.</p>}
      </section>

      <section className="card-box">
        <p className="muted">
          Prices: Scryfall (TCGplayer market USD; foil price used for foil cards).
          <br />
          Last updated: <b>{pricesUpdatedAt ? new Date(pricesUpdatedAt).toLocaleString() : 'when each card was added'}</b>
        </p>
        <button className="btn primary" onClick={refresh} disabled={!!progress || !rows.length}>
          {progress ?? '🔄 Refresh prices'}
        </button>
      </section>
    </div>
  );
}
