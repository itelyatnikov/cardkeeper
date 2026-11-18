// Generates decks for several configs and validates size, copy limits,
// color identity, and format legality against fresh Scryfall data.
import { generateDeck, validateDeck, deckStats, exportDeck, type DeckOptions } from '../src/games/mtg/deckgen.ts';
import { collectionByName, search } from '../src/games/mtg/scryfall.ts';
import { unitUsd } from '../src/lib/price.ts';

const base = { difficulty: 'expert', pool: 'any', ownerGroup: '__all__' } as const;
const configs: DeckOptions[] = [
  { ...base, format: 'standard', archetype: 'aggro', colors: ['R', 'W'] },
  { ...base, format: 'pioneer', archetype: 'control', colors: ['U', 'B'] },
  { ...base, format: 'modern', archetype: 'tokens', colors: ['W'], difficulty: 'beginner' },
  { ...base, format: 'casual', archetype: 'tribal', tribe: 'Elf', colors: ['G', 'B'], difficulty: 'intermediate' },
  { ...base, format: 'commander', archetype: 'tribal', tribe: 'Vampire', colors: [], commanderName: 'Edgar Markov', difficulty: 'beginner' },
  { ...base, format: 'commander', archetype: 'spellslinger', colors: ['U', 'R'] },
];
let fail = 0;
for (const cfg of configs) {
  const t0 = Date.now();
  const d = await generateDeck(cfg, []);
  const names = [...new Set([...(d.commander ? [d.commander.name] : []), ...d.cards.map((c) => c.name)])];
  const fresh = await collectionByName(names);
  const legal = new Map(fresh.map((c) => [c.name, c]));
  const issues = validateDeck(d, legal);
  const st = deckStats(d);
  console.log(`${issues.length ? 'FAIL' : 'PASS'} ${cfg.format}/${cfg.archetype}/${cfg.difficulty}: "${d.name}" ${st.total} cards, lands ${st.roles.land}, avgMv ${st.avgMv.toFixed(2)}, $${st.fullCost.toFixed(0)}, ${Date.now() - t0}ms`, issues.slice(0, 5));
  if (issues.length) fail++;
}

// Owned-only + owned+missing with a small fake collection (pull 40 red/green commons as "owned").
const pool = await search('legal:pioneer id<=rg -t:land r:common', { order: 'edhrec' });
const owned = pool.slice(0, 80).map((card) => ({ card, qty: 4 }));
const od = await generateDeck({ ...base, pool: 'owned', format: 'pioneer', archetype: 'midrange', colors: ['R', 'G'], difficulty: 'beginner' }, owned);
const ost = deckStats(od);
const notOwned = od.cards.filter((c) => c.role !== 'land' && c.owned < c.qty);
console.log(`${notOwned.length || validateDeck(od).length ? 'FAIL' : 'PASS'} owned-only: "${od.name}" ${ost.total} cards, own ${ost.ownedCopies}/${ost.total}, missing $${ost.missingCost.toFixed(2)}`);
const md = await generateDeck({ ...base, pool: 'owned+missing', format: 'pioneer', archetype: 'midrange', colors: ['R', 'G'] }, owned);
const mst = deckStats(md);
console.log(`PASS owned+missing: own ${mst.ownedCopies}/${mst.total}, missing ${mst.missing.length} names est. $${mst.missingCost.toFixed(2)}`);
console.log('--- Arena export sample ---\n' + exportDeck(md, 'arena').split('\n').slice(0, 6).join('\n'));

// price logic
const sheo = (await collectionByName(['Sheoldred, the Apocalypse']))[0];
console.log('Sheoldred prices', sheo.prices.usd, sheo.prices.usd_foil, '-> nonfoil', unitUsd(sheo, 'nonfoil'), 'foil', unitUsd(sheo, 'foil'), 'etched(fallback)', unitUsd(sheo, 'etched'));
process.exit(fail ? 1 : 0);
