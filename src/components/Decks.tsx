import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Chips, ManaDot, MANA_COLORS, NameSearch, Sheet } from './ui';
import { ARCHETYPES, ROLE_LABEL, type Archetype, type Role } from '../games/mtg/roles';
import {
  deckStats,
  explain,
  exportDeck,
  generateDeck,
  validateDeck,
  type Deck,
  type DeckCard,
  type DeckOptions,
  type Difficulty,
  type Format,
  type PoolMode,
} from '../games/mtg/deckgen';
import { deleteDeck, getDecks, putCards, putDeck } from '../lib/db';
import { fmtUsd, unitUsd } from '../lib/price';
import { mtgAdapter } from '../games/mtg/adapter';

const ALL = '__all__';

export function Decks() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [open, setOpen] = useState<Deck | null>(null);
  const [building, setBuilding] = useState(false);
  const load = () => getDecks().then((d) => setDecks(d.sort((a, b) => b.updatedAt - a.updatedAt)));
  useEffect(() => {
    load();
  }, []);

  if (open) return <DeckView deck={open} onBack={() => (setOpen(null), load())} onChange={setOpen} />;
  if (building) return <Builder onCancel={() => setBuilding(false)} onBuilt={(d) => (setBuilding(false), setOpen(d))} />;
  return (
    <div className="page">
      <h1>Decks</h1>
      <button className="btn primary big" onClick={() => setBuilding(true)}>
        ✨ Build a new deck
      </button>
      {decks.length === 0 && <p className="muted center">No saved decks yet.</p>}
      <ul className="list">
        {decks.map((d) => {
          const st = deckStats(d);
          return (
            <li key={d.id}>
              <button onClick={() => setOpen(d)}>
                <img src={(d.commander ?? d.cards.find((c) => c.role !== 'land'))?.imageSmall} alt="" />
                <span className="grow">
                  <b>{d.name}</b>
                  <br />
                  <small className="muted">
                    {d.options.format} · {d.options.difficulty} · {st.total} cards · own {st.ownedCopies}/{st.total}
                  </small>
                </span>
                <span>{d.options.colors.map((c) => <ManaDot key={c} c={c} />)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ownedFor(rows: ReturnType<typeof useStore>['rows'], group: string) {
  return rows.filter((r) => group === ALL || r.entry.owners.includes(group)).map((r) => ({ card: r.card, qty: r.entry.qty }));
}

function Builder({ onCancel, onBuilt }: { onCancel: () => void; onBuilt: (d: Deck) => void }) {
  const { rows, groups } = useStore();
  const [o, setO] = useState<DeckOptions>({
    format: 'casual',
    archetype: 'aggro',
    colors: ['R'],
    difficulty: 'beginner',
    pool: 'owned+missing',
    ownerGroup: ALL,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<DeckOptions>) => setO((x) => ({ ...x, ...p }));
  const isCmd = o.format === 'commander';

  async function build() {
    setBusy(true);
    setErr(null);
    try {
      const d = await generateDeck(o, ownedFor(rows, o.ownerGroup));
      onBuilt(d);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="row between">
        <h1>New deck</h1>
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <section className="card-box">
        <label className="lbl">Format</label>
        <Chips<Format>
          options={[
            { id: 'casual', label: 'Casual 60' },
            { id: 'standard', label: 'Standard' },
            { id: 'pioneer', label: 'Pioneer' },
            { id: 'modern', label: 'Modern' },
            { id: 'commander', label: 'Commander 100' },
          ]}
          value={[o.format]}
          onChange={(v) => set({ format: v[0] })}
        />
        <label className="lbl">Strategy</label>
        <div className="arch-grid">
          {ARCHETYPES.map((a) => (
            <button key={a.id} className={`arch ${o.archetype === a.id ? 'on' : ''}`} onClick={() => set({ archetype: a.id as Archetype })}>
              <b>{a.label}</b>
              <small>{a.blurb}</small>
            </button>
          ))}
        </div>
        {o.archetype === 'tribal' && (
          <label className="field">
            Creature type
            <input value={o.tribe ?? ''} onChange={(e) => set({ tribe: e.target.value })} placeholder="Elf, Goblin, Dragon, Zombie…" />
          </label>
        )}
        {isCmd && (
          <>
            <label className="lbl">Commander (optional — leave empty and I’ll suggest one)</label>
            {o.commanderName ? (
              <div className="row gap">
                <b className="grow">👑 {o.commanderName}</b>
                <button className="btn small" onClick={() => set({ commanderName: undefined })}>
                  Change
                </button>
              </div>
            ) : (
              <NameSearch onPick={(n) => set({ commanderName: n })} placeholder="Search a legendary creature…" />
            )}
          </>
        )}
        {!(isCmd && o.commanderName) && (
          <>
            <label className="lbl">Colors</label>
            <Chips multi options={MANA_COLORS.map((m) => ({ id: m.id, label: <ManaDot c={m.id} /> }))} value={o.colors} onChange={(c) => set({ colors: c })} />
          </>
        )}
        <label className="lbl">Difficulty</label>
        <Chips<Difficulty>
          options={[
            { id: 'beginner', label: '🙂 Beginner' },
            { id: 'intermediate', label: '😎 Intermediate' },
            { id: 'expert', label: '🧠 Expert' },
          ]}
          value={[o.difficulty]}
          onChange={(v) => set({ difficulty: v[0] })}
        />
        <label className="lbl">Which cards?</label>
        <Chips<PoolMode>
          options={[
            { id: 'owned', label: 'Only owned' },
            { id: 'owned+missing', label: 'Owned + suggest missing' },
            { id: 'any', label: 'Any cards' },
          ]}
          value={[o.pool]}
          onChange={(v) => set({ pool: v[0] })}
        />
        {o.pool !== 'any' && (
          <>
          <label className="lbl">Whose collection?</label>
          <Chips options={[{ id: ALL, label: 'Everyone’s' }, ...groups.map((g) => ({ id: g, label: `${g}’s` }))]} value={[o.ownerGroup]} onChange={(v) => set({ ownerGroup: v[0] })} />
          </>
        )}
      </section>
      {err && <p className="error">{err}</p>}
      <button className="btn primary big" onClick={build} disabled={busy || (!o.colors.length && !(isCmd && o.commanderName))} data-testid="build-btn">
        {busy ? (
          <>
            <span className="spinner" /> Building… (asking Scryfall)
          </>
        ) : (
          '🪄 Build deck'
        )}
      </button>
    </div>
  );
}

function DeckView({ deck, onBack, onChange }: { deck: Deck; onBack: () => void; onChange: (d: Deck) => void }) {
  const { rows, toast } = useStore();
  const [swap, setSwap] = useState<DeckCard | null>(null);
  const [saved, setSaved] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    getDecks().then((ds) => setSaved(ds.some((d) => d.id === deck.id)));
  }, [deck.id]);

  // Refresh "owned" counts from the current collection.
  const live = useMemo(() => {
    const own = new Map<string, number>();
    for (const r of rows)
      if (deck.options.ownerGroup === ALL || deck.options.pool === 'any' || r.entry.owners.includes(deck.options.ownerGroup))
        own.set(r.card.name, (own.get(r.card.name) ?? 0) + r.entry.qty);
    const fix = (c: DeckCard) => (c.role === 'land' && /^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(c.name) ? c : { ...c, owned: own.get(c.name) ?? 0 });
    return { ...deck, cards: deck.cards.map(fix), commander: deck.commander && fix(deck.commander) };
  }, [deck, rows]);
  const st = deckStats(live);
  const issues = validateDeck(live);
  const maxCurve = Math.max(1, ...st.curve);
  const groups = useMemo(() => {
    const g = new Map<Role, DeckCard[]>();
    for (const c of live.cards) g.set(c.role, [...(g.get(c.role) ?? []), c]);
    const order: Role[] = ['synergy', 'threat', 'ramp', 'draw', 'removal', 'counter', 'wipe', 'land'];
    return order.filter((r) => g.has(r)).map((r) => [r, g.get(r)!] as const);
  }, [live]);

  async function save(d: Deck = deck) {
    const nd = { ...d, updatedAt: Date.now() };
    await putDeck(nd);
    onChange(nd);
    setSaved(true);
    toast('Deck saved');
  }
  async function copy(style: 'arena' | 'mtgo') {
    const text = exportDeck(live, style);
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${style === 'arena' ? 'Arena' : 'MTGO'} list`);
    } catch {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = `${deck.name}.txt`;
      a.click();
    }
  }
  async function doSwap(oldC: DeckCard, newC: DeckCard) {
    const qty = deck.options.format === 'commander' ? 1 : Math.min(oldC.qty, 4);
    const cards = deck.cards.map((c) => (c.name === oldC.name ? { ...newC, qty, role: oldC.role } : c));
    const alternatives = [...deck.alternatives.filter((a) => a.name !== newC.name), { ...oldC, qty: 1 }];
    const nd = { ...deck, cards, alternatives, updatedAt: Date.now() };
    nd.explanation = explain(nd);
    onChange(nd);
    if (saved) await putDeck(nd);
    setSwap(null);
  }
  async function rebuild(commanderName?: string) {
    setRebuilding(true);
    try {
      const d = await generateDeck({ ...deck.options, commanderName: commanderName ?? deck.options.commanderName }, ownedFor(rows, deck.options.ownerGroup));
      onChange(d);
      setSaved(false);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div className="page deck-view">
      <div className="row between">
        <button className="btn ghost" onClick={onBack}>
          ← Decks
        </button>
        <span className="row gap">
          {!saved && (
            <button className="btn primary" onClick={() => save()} data-testid="save-deck">
              💾 Save
            </button>
          )}
          {saved && (
            <button
              className="btn danger small"
              onClick={async () => {
                if (confirm('Delete this deck?')) {
                  await deleteDeck(deck.id);
                  onBack();
                }
              }}
            >
              Delete
            </button>
          )}
        </span>
      </div>
      <h1 data-testid="deck-name">{deck.name}</h1>
      <p className="muted">
        {deck.options.format} · {deck.options.difficulty} · {deck.options.colors.map((c) => <ManaDot key={c} c={c} />)}{' '}
        <b data-testid="deck-total">{st.total} cards</b>
      </p>
      {issues.length > 0 ? (
        <p className="error">⚠️ {issues.slice(0, 3).join('; ')}</p>
      ) : (
        <p className="ok" data-testid="deck-valid">
          ✅ Deck size & copy limits OK{deck.options.format !== 'casual' ? ` · ${deck.options.format}-legal cards` : ''}
        </p>
      )}

      {live.commander && (
        <div className="commander">
          <img src={live.commander.image || live.commander.imageSmall} alt={live.commander.name} />
          <div>
            <small className="muted">Commander</small>
            <b>{live.commander.name}</b>
            {deck.commanderSuggestions && deck.commanderSuggestions.length > 1 && (
              <details>
                <summary>Try another commander</summary>
                <div className="chips">
                  {deck.commanderSuggestions
                    .filter((n) => n !== live.commander!.name)
                    .map((n) => (
                      <button key={n} className="chip" disabled={rebuilding} onClick={() => rebuild(n)}>
                        {n}
                      </button>
                    ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      <section className="stats-row">
        <div className="card-box stat">
          <small>Own</small>
          <b>
            {st.ownedCopies}/{st.total}
          </b>
        </div>
        <div className="card-box stat">
          <small>Missing cost</small>
          <b data-testid="missing-cost">{fmtUsd(st.missingCost)}</b>
        </div>
        <div className="card-box stat">
          <small>Deck value</small>
          <b>{fmtUsd(st.fullCost)}</b>
        </div>
      </section>

      <section className="card-box">
        <h3>Mana curve <small className="muted">avg {st.avgMv.toFixed(2)}</small></h3>
        <div className="curve" data-testid="curve">
          {st.curve.map((n, i) => (
            <div key={i} className="curve-col">
              <span className="curve-n">{n || ''}</span>
              <span className="curve-bar" style={{ height: `${(n / maxCurve) * 100}%` }} />
              <span className="curve-l">{i === 7 ? '7+' : i}</span>
            </div>
          ))}
        </div>
        <div className="roles">
          {Object.entries(st.roles).map(([r, n]) => (
            <span key={r} className="role-pill">
              {ROLE_LABEL[r as Role]} <b>{n}</b>
            </span>
          ))}
        </div>
      </section>

      <section className="card-box explain">
        {deck.explanation.map((e) => (
          <div key={e.title}>
            <h3>{e.title}</h3>
            <p>{e.text}</p>
          </div>
        ))}
      </section>

      <div className="row gap wrap">
        <button className="btn" onClick={() => copy('arena')}>
          📋 Copy for Arena
        </button>
        <button className="btn" onClick={() => copy('mtgo')}>
          📋 Copy for MTGO / text
        </button>
        <button className="btn ghost" onClick={() => rebuild()} disabled={rebuilding}>
          {rebuilding ? 'Rebuilding…' : '🎲 Rebuild'}
        </button>
      </div>

      <p className="muted small">Tap a card to swap it. 🟢 = you own enough, 🟡 = own some, ⚪ = missing.</p>
      {groups.map(([role, cards]) => (
        <section key={role}>
          <h3>
            {ROLE_LABEL[role]} ({cards.reduce((a, c) => a + c.qty, 0)})
          </h3>
          <ul className="deck-list">
            {cards.map((c) => (
              <li key={c.name}>
                <button onClick={() => setSwap(c)}>
                  <span className="own">{c.owned >= c.qty ? '🟢' : c.owned > 0 ? '🟡' : '⚪'}</span>
                  <span className="q">{c.qty}</span>
                  <span className="grow">{c.name}</span>
                  <small className="muted">{fmtUsd(c.priceUsd)}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {st.missing.length > 0 && (
        <section className="card-box">
          <h3>Shopping list ({fmtUsd(st.missingCost)})</h3>
          <ul className="shop">
            {st.missing
              .sort((a, b) => (b.price ?? 0) * b.qty - (a.price ?? 0) * a.qty)
              .map((m) => (
                <li key={m.name}>
                  {m.qty}× {m.name} <small className="muted">{fmtUsd(m.price == null ? null : m.price * m.qty)}</small>
                </li>
              ))}
          </ul>
        </section>
      )}

      {swap && <SwapSheet deck={live} card={swap} onClose={() => setSwap(null)} onSwap={(n) => doSwap(swap, n)} />}
    </div>
  );
}

function SwapSheet({ deck, card, onClose, onSwap }: { deck: Deck; card: DeckCard; onClose: () => void; onSwap: (c: DeckCard) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const alts = useMemo(() => {
    const same = deck.alternatives.filter((a) => a.role === card.role);
    const other = deck.alternatives.filter((a) => a.role !== card.role);
    return [...same, ...other].filter((a) => !deck.cards.some((c) => c.name === a.name)).slice(0, 24);
  }, [deck, card]);
  async function pickName(n: string) {
    setErr(null);
    const c = await mtgAdapter.findByName(n);
    if (!c) return setErr('Card not found');
    const ci = deck.commander?.colorIdentity ?? deck.options.colors;
    if (!c.colorIdentity.every((x) => ci.includes(x))) return setErr(`${c.name} is outside this deck's colors`);
    const f = deck.options.format;
    if (f !== 'casual' && c.legalities[f] !== 'legal') return setErr(`${c.name} isn't legal in ${f}`);
    await putCards([c]);
    onSwap({
      name: c.name, cardId: c.id, qty: 1, role: card.role, cmc: c.cmc, typeLine: c.typeLine, manaCost: c.manaCost, image: c.image,
      imageSmall: c.imageSmall, colorIdentity: c.colorIdentity, priceUsd: unitUsd(c), owned: 0, set: c.set, collectorNumber: c.collectorNumber,
    });
  }
  return (
    <Sheet open onClose={onClose} title={`Swap ${card.name}`}>
      <img src={card.imageSmall || card.image} alt={card.name} className="swap-img" />
      <label className="lbl">Replace with any card</label>
      <NameSearch onPick={pickName} />
      {err && <p className="error">{err}</p>}
      <label className="lbl">Suggestions</label>
      <div className="grid">
        {alts.map((a) => (
          <button key={a.name} className="grid-card" onClick={() => onSwap(a)}>
            <img src={a.imageSmall} alt={a.name} loading="lazy" />
            <span className="cap">
              {ROLE_LABEL[a.role]} · {fmtUsd(a.priceUsd)}
              {a.owned > 0 && ' · owned'}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
