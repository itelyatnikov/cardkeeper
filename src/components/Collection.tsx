import { useMemo, useState } from 'react';
import { useStore, type Row } from '../lib/store';
import { Chips, ManaDot, MANA_COLORS, Sheet, Stepper } from './ui';
import { EditGroupsButton } from './Groups';
import { isLand } from '../games/mtg/roles';
import { FavStar } from './FavStar';
import { RatingBadge, ratingOf } from './Rating';
import { fallbackPriceLabel, fmtUsd, unitUsd } from '../lib/price';
import { addToCollection, deleteEntry, putEntry } from '../lib/db';
import { mtgAdapter } from '../games/mtg/adapter';
import type { CardData, Finish } from '../games/types';

const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle'];
const RARITIES = ['common', 'uncommon', 'rare', 'mythic'];
// mythic > rare > uncommon > common > special/bonus (basic lands are common and fall in with commons)
const RANK: Record<string, number> = { mythic: 4, rare: 3, uncommon: 2, common: 1, special: 0, bonus: 0 };
const SORT_KEY = 'ck.sort';
type SortKey = 'favorites' | 'rarity' | 'value' | 'rating' | 'name' | 'mv' | 'set' | 'added' | 'qty';
const MAIN_SORTS: { id: SortKey; label: string }[] = [
  { id: 'favorites', label: '★ Favorites' },
  { id: 'rarity', label: '💎 Rarity' },
  { id: 'value', label: '$ Price' },
];
const ALL = '__all__';
const NONE = '__none__';

export function Collection() {
  const { rows, groups } = useStore();
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState<string>(ALL);
  const [colors, setColors] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [rarity, setRarity] = useState('');
  const [set, setSet] = useState('');
  const [mv, setMv] = useState('');
  const [minValue, setMinValue] = useState('');
  const [foilOnly, setFoilOnly] = useState(false);
  const [sort, setSortState] = useState<SortKey>(() => (localStorage.getItem(SORT_KEY) as SortKey) || 'rarity');
  const setSort = (k: SortKey) => {
    setSortState(k);
    localStorage.setItem(SORT_KEY, k);
  };
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);

  const sets = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.card.set, r.card.setName));
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      const c = r.card;
      if (owner === NONE ? r.entry.owners.length > 0 : owner !== ALL && !r.entry.owners.includes(owner)) return false;
      if (ql && !c.name.toLowerCase().includes(ql) && !c.typeLine.toLowerCase().includes(ql)) return false;
      if (colors.length) {
        const want = colors.filter((x) => x !== 'C' && x !== 'M');
        if (colors.includes('C') && c.colors.length === 0) {
          /* ok */
        } else if (colors.includes('M') && c.colors.length > 1) {
          /* ok */
        } else if (!(want.length && want.some((x) => c.colors.includes(x)))) return false;
      }
      if (type && !c.typeLine.includes(type)) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (set && c.set !== set) return false;
      if (mv && (mv === '7' ? c.cmc < 7 : Math.floor(c.cmc) !== Number(mv))) return false;
      if (foilOnly && r.entry.finish === 'nonfoil') return false;
      if (minValue && (r.unit ?? 0) < Number(minValue)) return false;
      return true;
    });
    const byRarity = (a: Row, b: Row) => (RANK[b.card.rarity] ?? 0) - (RANK[a.card.rarity] ?? 0) || a.card.name.localeCompare(b.card.name);
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      favorites: byRarity,
      name: (a, b) => a.card.name.localeCompare(b.card.name),
      value: (a, b) => (b.unit ?? -1) - (a.unit ?? -1) || a.card.name.localeCompare(b.card.name),
      mv: (a, b) => a.card.cmc - b.card.cmc || a.card.name.localeCompare(b.card.name),
      rarity: byRarity,
      set: (a, b) => a.card.setName.localeCompare(b.card.setName) || a.card.collectorNumber.localeCompare(b.card.collectorNumber, undefined, { numeric: true }),
      added: (a, b) => b.entry.addedAt - a.entry.addedAt,
      qty: (a, b) => b.entry.qty - a.entry.qty,
      rating: (a, b) => ratingOf(b.card).score - ratingOf(a.card).score || (b.unit ?? 0) - (a.unit ?? 0),
    };
    // Favorites are always pinned to the top; the chosen sort applies within favorites and within the rest.
    const fav = (r: Row) => (r.entry.favorite ? 1 : 0);
    return out.sort((a, b) => fav(b) - fav(a) || cmp[sort](a, b));
  }, [rows, q, owner, colors, type, rarity, set, mv, foilOnly, minValue, sort]);

  const sections: [string, Row[]][] = [
    ['Spells', filtered.filter((r) => !isLand(r.card))],
    ['Lands', filtered.filter((r) => isLand(r.card))],
  ];
  const copies = filtered.reduce((a, r) => a + r.entry.qty, 0);
  const value = filtered.reduce((a, r) => a + r.value, 0);
  const activeFilters = [colors.length, type, rarity, set, mv, foilOnly, minValue].filter(Boolean).length;

  return (
    <div className="page">
      <h1>Collection</h1>
      <div className="chips scroll-x">
        {[{ id: ALL, label: 'Everyone' }, ...groups.map((g) => ({ id: g, label: g })), { id: NONE, label: 'No owner' }].map((o) => (
          <button key={o.id} className={`chip ${owner === o.id ? 'on' : ''}`} onClick={() => setOwner(o.id)}>
            {o.label}
          </button>
        ))}
        <EditGroupsButton />
      </div>
      <div className="row gap">
        <input type="search" placeholder="Search name or type…" value={q} onChange={(e) => setQ(e.target.value)} className="grow" />
        <button className={`btn ${activeFilters ? 'primary' : ''}`} onClick={() => setShowFilters(!showFilters)}>
          Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>
      {showFilters && (
        <section className="card-box filters">
          <label className="lbl">Color</label>
          <Chips
            multi
            options={[...MANA_COLORS.map((m) => ({ id: m.id, label: <ManaDot c={m.id} /> })), { id: 'C', label: 'Colorless' }, { id: 'M', label: 'Multi' }]}
            value={colors}
            onChange={setColors}
          />
          <div className="grid2">
            <label>
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Any</option>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Rarity
              <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
                <option value="">Any</option>
                {RARITIES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Mana value
              <select value={mv} onChange={(e) => setMv(e.target.value)}>
                <option value="">Any</option>
                {['0', '1', '2', '3', '4', '5', '6'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
                <option value="7">7+</option>
              </select>
            </label>
            <label>
              Set
              <select value={set} onChange={(e) => setSet(e.target.value)}>
                <option value="">Any</option>
                {sets.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Min value ($)
              <input type="number" inputMode="decimal" min="0" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="0" />
            </label>
            <label className="check">
              <input type="checkbox" checked={foilOnly} onChange={(e) => setFoilOnly(e.target.checked)} /> Foils only
            </label>
          </div>
          <button
            className="btn small ghost"
            onClick={() => {
              setColors([]);
              setType('');
              setRarity('');
              setSet('');
              setMv('');
              setFoilOnly(false);
              setMinValue('');
            }}
          >
            Clear filters
          </button>
        </section>
      )}
      <div className="row between summary-line">
        <span data-testid="coll-summary">
          <b>{filtered.length}</b> cards · <b>{copies}</b> copies · <b>{fmtUsd(value)}</b>
        </span>
        <span className="row gap">
          <select
            value={MAIN_SORTS.some((m) => m.id === sort) ? '' : sort}
            onChange={(e) => e.target.value && setSort(e.target.value as SortKey)}
            aria-label="More sorts"
            className={MAIN_SORTS.some((m) => m.id === sort) ? '' : 'on-select'}
          >
            <option value="">More…</option>
            <option value="rating">Deck rating</option>
            <option value="name">Name</option>
            <option value="mv">Mana value</option>
            <option value="set">Set</option>
            <option value="added">Newest</option>
            <option value="qty">Quantity</option>
          </select>
          <button className="icon-btn" onClick={() => setView(view === 'grid' ? 'list' : 'grid')} aria-label="Toggle view">
            {view === 'grid' ? '☰' : '▦'}
          </button>
        </span>
      </div>

      <div className="segmented" role="group" aria-label="Sort by" data-testid="sort-buttons">
        {MAIN_SORTS.map((m) => (
          <button key={m.id} className={sort === m.id ? 'on' : ''} aria-pressed={sort === m.id} onClick={() => setSort(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="empty">
          <p>No cards yet!</p>
          <p className="muted">Go to Scan to add your first card 📷</p>
        </div>
      )}

      {sections.map(([title, list]) =>
        list.length === 0 ? null : (
          <section key={title} className="coll-section" data-testid={`section-${title}`}>
            <h2 className="section-head">
              {title === 'Lands' ? '🏔️ Lands' : '✨ Spells & creatures'} <small className="muted">({list.reduce((a, r) => a + r.entry.qty, 0)})</small>
            </h2>
            {view === 'grid' ? (
              <div className="grid">
                {list.map((r) => (
                  <div key={r.entry.key} className={`grid-card ${r.entry.finish !== 'nonfoil' ? 'foil' : ''} ${r.entry.favorite ? 'fav' : ''}`}>
                    <button className="tile" onClick={() => setDetail(r)}>
                      <img src={r.card.imageSmall} alt={r.card.name} loading="lazy" />
                      {r.entry.qty > 1 && <span className="qty">×{r.entry.qty}</span>}
                      <span className="cap">
                        <RatingBadge card={r.card} compact /> {fmtUsd(r.unit)}
                        {r.entry.owners.length > 0 && <small> · {r.entry.owners.join(', ')}</small>}
                      </span>
                    </button>
                    <FavStar entryKey={r.entry.key} on={!!r.entry.favorite} name={r.card.name} />
                  </div>
                ))}
              </div>
            ) : (
              <ul className="list">
                {list.map((r) => (
                  <li key={r.entry.key} className="row">
                    <FavStar entryKey={r.entry.key} on={!!r.entry.favorite} name={r.card.name} inline />
                    <button onClick={() => setDetail(r)}>
                      <img src={r.card.imageSmall} alt="" loading="lazy" />
                      <span className="grow">
                        <b>
                          {r.entry.qty}× {r.card.name}
                        </b>
                        {r.entry.finish !== 'nonfoil' && ' ✨'}
                        <br />
                        <small className="muted">
                          <RatingBadge card={r.card} compact /> {r.card.set.toUpperCase()} · {r.card.rarity} · {r.entry.owners.join(', ') || 'no owner'}
                        </small>
                      </span>
                      <span className="val">
                        {fmtUsd(r.value)}
                        <br />
                        <small className="muted">{fmtUsd(r.unit)} ea</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ),
      )}
      {detail && <CardDetail row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function CardDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  const { groups, reload, toast } = useStore();
  const [entry, setEntry] = useState({ ...row.entry });
  const [card, setCard] = useState<CardData>(row.card);
  const [prints, setPrints] = useState<CardData[] | null>(null);
  const unit = unitUsd(card, entry.finish);

  async function save() {
    if (card.id !== row.card.id) {
      await deleteEntry(entry.key);
      await addToCollection(card, entry.qty, entry.finish, entry.owners, entry.favorite);
    } else await putEntry(entry);
    await reload();
    toast('Saved');
    onClose();
  }
  async function remove() {
    if (!confirm(`Remove ${card.name} from the collection?`)) return;
    await deleteEntry(entry.key);
    await reload();
    onClose();
  }
  const p = card.prices;
  return (
    <Sheet open onClose={onClose} title={card.name}>
      <div className="detail">
        <img src={card.image} alt={card.name} className="detail-img" />
        <p className="muted">
          {card.typeLine} · {card.setName} ({card.set.toUpperCase()}) #{card.collectorNumber} · {card.rarity}
        </p>
        <RatingBadge card={card} />
        <div className="prices">
          <div>
            <small>This copy</small>
            <b>{fmtUsd(unit)}</b>
          </div>
          <div>
            <small>Total ({entry.qty})</small>
            <b>{fmtUsd(unit == null ? null : unit * entry.qty)}</b>
          </div>
          <div>
            <small>Normal / Foil / Etched</small>
            <span>
              {p.usd ? `$${p.usd}` : '—'} / {p.usd_foil ? `$${p.usd_foil}` : '—'} / {p.usd_etched ? `$${p.usd_etched}` : '—'}
            </span>
          </div>
          {unit == null && fallbackPriceLabel(card, entry.finish) && (
            <div>
              <small>Other market</small>
              <span>{fallbackPriceLabel(card, entry.finish)}</span>
            </div>
          )}
        </div>
        <div className="row gap">
          <FavStar entryKey={entry.key} on={!!entry.favorite} name={card.name} inline onChange={(f) => setEntry((e) => ({ ...e, favorite: f }))} label />
        </div>
        <label className="lbl">Owner</label>
        <Chips options={groups.map((g) => ({ id: g, label: g }))} value={entry.owners.slice(0, 1)} onChange={(o) => setEntry({ ...entry, owners: o })} />
        <label className="lbl">Finish</label>
        <Chips<Finish>
          options={[
            { id: 'nonfoil', label: 'Normal' },
            { id: 'foil', label: '✨ Foil' },
            { id: 'etched', label: 'Etched' },
          ]}
          value={[entry.finish]}
          onChange={(v) => setEntry({ ...entry, finish: v[0] })}
        />
        <label className="lbl">Quantity</label>
        <Stepper value={entry.qty} onChange={(n) => setEntry({ ...entry, qty: n })} />
        <div className="row gap wrap" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={save}>
            Save
          </button>
          <button className="btn" onClick={async () => setPrints(await mtgAdapter.printings(card))}>
            Change set/art
          </button>
          {card.scryfallUri && (
            <a className="btn ghost" href={card.scryfallUri} target="_blank" rel="noreferrer">
              Scryfall ↗
            </a>
          )}
          <button className="btn danger" onClick={remove}>
            Remove
          </button>
        </div>
        {card.oracleText && <p className="oracle">{card.oracleText}</p>}
      </div>
      <Sheet open={!!prints} onClose={() => setPrints(null)} title="Pick the printing">
        <div className="grid">
          {prints?.map((pr) => (
            <button
              key={pr.id}
              className="grid-card"
              onClick={() => {
                setCard(pr);
                setPrints(null);
              }}
            >
              <img src={pr.imageSmall} alt={pr.name} loading="lazy" />
              <span className="cap">
                {pr.set.toUpperCase()} · {fmtUsd(unitUsd(pr, entry.finish))}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </Sheet>
  );
}
