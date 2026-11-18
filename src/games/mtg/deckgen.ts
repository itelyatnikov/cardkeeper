import type { CardData } from '../types';
import * as sf from './scryfall';
import { unitUsd } from '../../lib/price';
import {
  type Archetype,
  type Role,
  ARCHETYPES,
  complexity,
  isBasic,
  isCreature,
  isLand,
  isLegendary,
  roleTags,
  synergy,
} from './roles';

export type Format = 'standard' | 'pioneer' | 'modern' | 'casual' | 'commander';
export type Difficulty = 'beginner' | 'intermediate' | 'expert';
export type PoolMode = 'owned' | 'owned+missing' | 'any';

export interface DeckOptions {
  format: Format;
  archetype: Archetype;
  colors: string[]; // subset of WUBRG; for commander, derived from the commander if given
  difficulty: Difficulty;
  pool: PoolMode;
  ownerGroup: string; // '__all__' = every owner
  commanderName?: string;
  tribe?: string;
}

export interface DeckCard {
  name: string;
  cardId: string;
  qty: number;
  role: Role;
  cmc: number;
  typeLine: string;
  manaCost: string;
  image: string;
  imageSmall: string;
  colorIdentity: string[];
  priceUsd: number | null;
  set?: string;
  collectorNumber?: string;
  owned: number; // copies owned by the chosen group (by name)
}

export interface Deck {
  id: string;
  game: 'mtg';
  name: string;
  options: DeckOptions;
  commander?: DeckCard;
  cards: DeckCard[]; // excludes commander
  alternatives: DeckCard[];
  explanation: { title: string; text: string }[];
  commanderSuggestions?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface OwnedCard {
  card: CardData;
  qty: number;
}

export interface GenDeps {
  search: typeof sf.search;
  named: typeof sf.named;
}

const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
const BASIC: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest', C: 'Wastes' };
const PAIR: Record<string, string> = {
  WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', WG: 'Selesnya', WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', WR: 'Boros', UG: 'Simic',
  WUB: 'Esper', UBR: 'Grixis', BRG: 'Jund', WRG: 'Naya', WUG: 'Bant', WBG: 'Abzan', WUR: 'Jeskai', UBG: 'Sultai', WBR: 'Mardu', URG: 'Temur',
};
export const sortColors = (cs: string[]) => 'WUBRG'.split('').filter((c) => cs.includes(c));
export function colorName(cs: string[]) {
  const k = sortColors(cs).join('');
  if (!k) return 'Colorless';
  if (k.length === 1) return `Mono-${COLOR_NAMES[k]}`;
  if (k.length === 5) return 'Five-Color';
  return PAIR[k] ?? k;
}

// ---------- archetype tuning ----------
const LANDS_60: Record<Archetype, number> = {
  aggro: 22, midrange: 24, control: 26, tribal: 23, tokens: 23, ramp: 25, spellslinger: 23, counters: 23, lifegain: 23, reanimator: 23,
};
const QUOTA_60: Record<Archetype, Partial<Record<Role, number>>> = {
  aggro: { removal: 6, draw: 2 },
  midrange: { removal: 8, draw: 4 },
  control: { removal: 8, draw: 7, wipe: 3, counter: 6 },
  tribal: { removal: 6, draw: 3 },
  tokens: { removal: 6, draw: 3 },
  ramp: { ramp: 8, removal: 6, draw: 3 },
  spellslinger: { removal: 8, draw: 6, counter: 4 },
  counters: { removal: 6, draw: 3 },
  lifegain: { removal: 6, draw: 3 },
  reanimator: { removal: 6, draw: 4 },
};
const CURVE: Record<string, number[]> = {
  // share of nonland cards at MV 0-1, 2, 3, 4, 5, 6+
  aggro: [0.3, 0.35, 0.22, 0.1, 0.03, 0],
  control: [0.08, 0.27, 0.22, 0.2, 0.13, 0.1],
  ramp: [0.05, 0.27, 0.2, 0.15, 0.13, 0.2],
  midrange: [0.1, 0.27, 0.25, 0.2, 0.12, 0.06],
  default: [0.14, 0.3, 0.25, 0.17, 0.09, 0.05],
};
const CREATURE_ARCH: Archetype[] = ['aggro', 'midrange', 'tribal', 'tokens', 'counters', 'lifegain'];

function cmdQuota(a: Archetype, colors: string[]) {
  const q: Partial<Record<Role, number>> = { ramp: 10, draw: 10, removal: 8, wipe: 3 };
  if (a === 'ramp') q.ramp = 14;
  if (a === 'control') Object.assign(q, { removal: 10, wipe: 5, draw: 11 });
  if (a === 'aggro' || a === 'tokens' || a === 'tribal' || a === 'counters') q.wipe = 1;
  if (colors.includes('U') && (a === 'control' || a === 'spellslinger')) q.counter = 4;
  return q;
}
const cmdLands = (a: Archetype) => (a === 'ramp' || a === 'control' ? 37 : a === 'aggro' ? 35 : 36);

// ---------- helpers ----------
const bucket = (c: CardData) => Math.min(5, Math.max(0, Math.floor(c.cmc) - 1 + (c.cmc < 1 ? 1 : 0)));
const subsetOf = (a: string[], b: string[]) => a.every((x) => b.includes(x));
function legalIn(c: CardData, f: Format) {
  if (f === 'casual') return !/\bUn-|Playtest/.test(c.setName) && c.legalities?.vintage !== 'not_legal' ? true : c.legalities?.vintage === 'legal';
  return c.legalities?.[f] === 'legal';
}
function popularity(c: CardData) {
  if (!c.edhrecRank) return 0.15;
  return Math.max(0, 1 - Math.log10(c.edhrecRank) / Math.log10(40000));
}
function toDeckCard(c: CardData, qty: number, role: Role, owned: number): DeckCard {
  return {
    name: c.name, cardId: c.id, qty, role, cmc: c.cmc, typeLine: c.typeLine, manaCost: c.manaCost,
    image: c.image, imageSmall: c.imageSmall, colorIdentity: c.colorIdentity, priceUsd: unitUsd(c), owned, set: c.set, collectorNumber: c.collectorNumber,
  };
}

function pipShare(cards: CardData[], colors: string[]) {
  const n: Record<string, number> = {};
  colors.forEach((c) => (n[c] = 0));
  for (const c of cards) for (const m of c.manaCost.matchAll(/\{([WUBRG])(?:\/[WUBRGP])?\}/g)) if (m[1] in n) n[m[1]]++;
  const tot = Object.values(n).reduce((a, b) => a + b, 0) || 1;
  colors.forEach((c) => (n[c] = Math.max(n[c], tot * 0.15)));
  const t2 = Object.values(n).reduce((a, b) => a + b, 0);
  colors.forEach((c) => (n[c] /= t2));
  return n;
}

function difficultyAdj(c: CardData, d: Difficulty) {
  const cx = complexity(c);
  if (d === 'beginner') return -cx * 0.9 + (isCreature(c) ? 0.1 : 0) + (c.rarity === 'mythic' ? -0.05 : 0);
  if (d === 'intermediate') return -cx * 0.3;
  return 0.1 * (roleTags(c).has('removal') && /instant|flash/i.test(c.typeLine + c.oracleText) ? 1 : 0);
}

// ---------- candidate pool ----------
async function scryfallCandidates(opts: DeckOptions, colors: string[], deps: GenDeps, commander?: CardData) {
  const ci = colors.length ? colors.join('').toLowerCase() : 'c';
  const legal = opts.format === 'casual' ? 'legal:vintage' : `legal:${opts.format}`;
  const base = `${legal} id<=${ci} game:paper -is:funny`;
  const a = opts.archetype;
  const archQ: Record<Archetype, string> = {
    aggro: 't:creature mv<=3',
    midrange: 't:creature mv>=2 mv<=5',
    control: '(t:planeswalker or (t:creature mv>=4) or t:instant)',
    tribal: opts.tribe ? `(t:${opts.tribe.replace(/s$/i, '')} or o:${opts.tribe.replace(/s$/i, '')} or o:changeling)` : 't:creature',
    tokens: '(o:"create" o:token)',
    ramp: '(t:creature mv>=6 or o:landfall)',
    spellslinger: '(t:instant or t:sorcery or o:"instant or sorcery")',
    counters: 'o:"+1/+1 counter"',
    lifegain: '(o:"gain" o:"life" or keyword:lifelink)',
    reanimator: '(o:"graveyard to the battlefield" or o:mill or o:surveil)',
  };
  const isCmd = opts.format === 'commander';
  const queries: [string, number][] = [
    [`${base} -t:land ${archQ[a]}`, 2],
    [`${base} -t:land otag:removal`, 1],
    [`${base} -t:land otag:card-advantage`, 1],
    [`${base} -t:land`, 1],
  ];
  if (isCmd || a === 'ramp') queries.push([`${base} -t:land otag:ramp`, 1]);
  if (isCmd || a === 'control') queries.push([`${base} otag:board-wipe`, 1]);
  if (colors.includes('U') && (a === 'control' || a === 'spellslinger' || isCmd)) queries.push([`${base} otag:counterspell`, 1]);
  if (commander) {
    const types = commander.typeLine.split('—')[1]?.trim().split(/\s+/) ?? [];
    const ot = commander.oracleText.toLowerCase();
    const tribe = types.find((ty) => ot.includes(ty.toLowerCase()));
    if (tribe) queries.push([`${base} -t:land (t:${tribe} or o:${tribe})`, 1]);
  }
  queries.push([`${legal} id<=${ci} game:paper t:land -t:basic`, 1]);
  const all: CardData[] = [];
  for (const [q, pages] of queries) all.push(...(await deps.search(q, { order: 'edhrec', maxPages: pages })));
  return all;
}

// ---------- main ----------
export async function generateDeck(
  opts: DeckOptions,
  owned: OwnedCard[],
  deps: GenDeps = { search: sf.search, named: sf.named },
): Promise<Deck> {
  const isCmd = opts.format === 'commander';
  let colors = sortColors(opts.colors);
  let commander: CardData | undefined;
  let commanderSuggestions: string[] | undefined;

  // Owned copies by name (sum of all printings/finishes in the chosen group).
  const ownedQty = new Map<string, number>();
  const ownedCard = new Map<string, CardData>();
  for (const o of owned) {
    ownedQty.set(o.card.name, (ownedQty.get(o.card.name) ?? 0) + o.qty);
    if (!ownedCard.has(o.card.name)) ownedCard.set(o.card.name, o.card);
  }

  if (isCmd) {
    if (opts.commanderName) {
      commander = (await deps.named(opts.commanderName)) ?? undefined;
      if (!commander) throw new Error(`Couldn't find commander "${opts.commanderName}"`);
    } else {
      const ci = colors.length ? colors.join('').toLowerCase() : 'c';
      const hint: Partial<Record<Archetype, string>> = {
        tokens: 'o:token', counters: 'o:"+1/+1 counter"', lifegain: 'o:"gain" o:life', spellslinger: '(o:instant o:sorcery)',
        reanimator: 'o:graveyard', ramp: '(o:land or o:mana)', aggro: '(o:attack or o:combat)', tribal: opts.tribe ? `o:${opts.tribe.replace(/s$/i, '')}` : '',
      };
      const ownedCmd = [...ownedCard.values()].filter(
        (c) => isLegendary(c) && isCreature(c) && sortColors(c.colorIdentity).join('') === colors.join('') && c.legalities.commander === 'legal',
      );
      let list = await deps.search(`is:commander legal:commander id=${ci} ${hint[opts.archetype] ?? ''}`, { order: 'edhrec' });
      if (!list.length) list = await deps.search(`is:commander legal:commander id=${ci}`, { order: 'edhrec' });
      if (opts.difficulty === 'beginner') list = [...list].sort((a, b) => complexity(a) - complexity(b) + (popularity(b) - popularity(a)) * 0.5);
      commanderSuggestions = [...ownedCmd.map((c) => c.name), ...list.slice(0, 10).map((c) => c.name)].filter((v, i, s) => s.indexOf(v) === i).slice(0, 10);
      commander = (opts.pool !== 'any' ? ownedCmd.sort((a, b) => synergy(b, opts.archetype, opts.tribe) - synergy(a, opts.archetype, opts.tribe))[0] : undefined) ?? list[0];
      if (!commander) throw new Error('No commander found for those colors. Try different colors or type a commander.');
    }
    colors = sortColors(commander.colorIdentity);
  }
  if (!isCmd && colors.length === 0) throw new Error('Pick at least one color');

  // Build candidate list.
  const pool = new Map<string, CardData>();
  const okColor = (c: CardData) => subsetOf(c.colorIdentity, colors);
  if (opts.pool !== 'owned') {
    for (const c of await scryfallCandidates(opts, colors, deps, commander)) if (!pool.has(c.name)) pool.set(c.name, c);
  }
  for (const [name, c] of ownedCard) pool.set(name, c); // owned printing wins (better image/price match)
  const candidates = [...pool.values()].filter(
    (c) => okColor(c) && legalIn(c, opts.format) && !isBasic(c) && c.name !== commander?.name && !/\bConspiracy\b|Attraction|Contraption/.test(c.typeLine),
  );
  if (opts.pool === 'owned' && candidates.filter((c) => !isLand(c)).length < 10) {
    throw new Error(
      `Only ${candidates.filter((c) => !isLand(c)).length} owned cards fit these colors/format. Add more cards, change colors, or use "owned + suggest missing".`,
    );
  }

  const tribe = opts.tribe;
  const score = (c: CardData) => {
    const syn = synergy(c, opts.archetype, tribe);
    const pop = popularity(c);
    const w = opts.difficulty === 'expert' ? 1.0 : opts.difficulty === 'intermediate' ? 0.7 : 0.4;
    let s = pop * w + syn * 1.1 + difficultyAdj(c, opts.difficulty);
    if (commander) s += synergy(c, opts.archetype, tribe) * 0.2 + sharedWords(c, commander) * 0.15;
    if (opts.pool === 'owned+missing' && ownedQty.has(c.name)) s += 0.6;
    if (!isCmd && c.colorIdentity.length === 0 && !isLand(c)) s -= 0.1; // prefer on-color cards in 60
    if (!isCmd && (opts.format === 'standard' || opts.format === 'pioneer') && c.cmc >= 7) s -= 0.3;
    return s;
  };
  const scored = new Map(candidates.map((c) => [c.name, score(c)]));
  const nonland = candidates.filter((c) => !isLand(c)).sort((a, b) => scored.get(b.name)! - scored.get(a.name)!);

  const deckSize = isCmd ? 99 : 60;
  const landCount = isCmd ? cmdLands(opts.archetype) : LANDS_60[opts.archetype];
  const spellSlots = deckSize - landCount;
  const quota = isCmd ? cmdQuota(opts.archetype, colors) : { ...QUOTA_60[opts.archetype] };
  if (!colors.includes('U')) {
    quota.removal = (quota.removal ?? 0) + Math.ceil((quota.counter ?? 0) / 2);
    quota.draw = (quota.draw ?? 0) + Math.floor((quota.counter ?? 0) / 2);
    delete quota.counter;
  }
  const curve = (CURVE[opts.archetype] ?? CURVE.default).map((x) => x * spellSlots);
  const curveCount = [0, 0, 0, 0, 0, 0];

  const picked = new Map<string, { c: CardData; qty: number; role: Role }>();
  let used = 0;
  const maxCopies = (c: CardData, rank: number) => {
    if (isCmd) return 1;
    let n = rank < 6 ? 4 : rank < 12 ? 3 : 2;
    if (opts.difficulty === 'expert') n = rank < 9 ? 4 : 3;
    if (isLegendary(c)) n = Math.min(n, 2);
    if (roleTags(c).has('wipe')) n = Math.min(n, 2);
    if (c.cmc >= 6) n = Math.min(n, 2);
    if (opts.pool === 'owned') n = Math.min(n, ownedQty.get(c.name) ?? 0);
    return n;
  };
  // Keep multicolor 60-card decks actually using every chosen color.
  const colorPips: Record<string, number> = {};
  const colorBonus = (c: CardData) => {
    if (isCmd || colors.length < 2 || !c.colors.length) return 0;
    const tot = Object.values(colorPips).reduce((a, b) => a + b, 0);
    if (tot < 4) return 0;
    return c.colors.reduce((a, col) => a + Math.max(0, 1 / colors.length - (colorPips[col] ?? 0) / tot), 0) * 1.5;
  };
  const curvePenalty = (c: CardData) => {
    const b = bucket(c);
    return curveCount[b] >= curve[b] + (isCmd ? 2 : 1) ? 0.6 : 0;
  };
  const take = (c: CardData, role: Role, want: number, rank: number) => {
    const q = Math.min(maxCopies(c, rank), want, spellSlots - used);
    if (q <= 0) return 0;
    picked.set(c.name, { c, qty: q, role });
    curveCount[bucket(c)] += q;
    for (const col of c.colors) colorPips[col] = (colorPips[col] ?? 0) + q;
    used += q;
    return q;
  };

  // 1) Fill functional quotas.
  const roleOrder: Role[] = ['ramp', 'removal', 'wipe', 'counter', 'draw'];
  for (const role of roleOrder) {
    let need = quota[role] ?? 0;
    if (!need) continue;
    const list = nonland.filter((c) => !picked.has(c.name) && roleTags(c).has(role));
    let rank = 0;
    while (need > 0 && list.length) {
      list.sort((a, b) => scored.get(b.name)! - curvePenalty(b) + colorBonus(b) - (scored.get(a.name)! - curvePenalty(a) + colorBonus(a)));
      const c = list.shift()!;
      need -= take(c, role, need, rank++);
    }
  }
  // 2) Fill the rest with threats / synergy, guiding creature count and curve.
  const creatureTarget = isCmd ? 0 : CREATURE_ARCH.includes(opts.archetype) ? Math.round(spellSlots * 0.55) : opts.archetype === 'control' ? 5 : Math.round(spellSlots * 0.35);
  const creatures = () => [...picked.values()].filter((p) => isCreature(p.c)).reduce((a, p) => a + p.qty, 0);
  const rest = nonland.filter((c) => !picked.has(c.name));
  let rank = 0;
  while (used < spellSlots && rest.length) {
    const needCre = creatures() < creatureTarget;
    rest.sort((a, b) => {
      const sa = scored.get(a.name)! - curvePenalty(a) + colorBonus(a) + (needCre && isCreature(a) ? 0.35 : 0);
      const sb = scored.get(b.name)! - curvePenalty(b) + colorBonus(b) + (needCre && isCreature(b) ? 0.35 : 0);
      return sb - sa;
    });
    const c = rest.shift()!;
    const role: Role = synergy(c, opts.archetype, tribe) >= 0.5 ? 'synergy' : roleTags(c).has('threat') ? 'threat' : [...roleTags(c)][0];
    take(c, role, spellSlots - used, rank++);
  }
  const shortfall = spellSlots - used;

  // 3) Mana base.
  const spells = [...picked.values()];
  const lands: { c: CardData; qty: number }[] = [];
  let landsLeft = landCount + shortfall; // if the pool ran dry, pad with lands (flagged in explanation)
  if (colors.length >= 2) {
    const maxNonbasic = isCmd
      ? { beginner: 6, intermediate: 11, expert: 16 }[opts.difficulty]
      : { beginner: 4, intermediate: 8, expert: 12 }[opts.difficulty];
    const duals = candidates
      .filter((c) => isLand(c))
      .filter((c) => {
        const prod = c.producedMana ?? [];
        const pm = prod.filter((m) => colors.includes(m));
        // real duals/tri-lands only: produce >=2 of our colors and nothing off-color (skips "any color" lands)
        return pm.length >= 2 && prod.every((m) => colors.includes(m) || m === 'C') && (isCmd || prod.length <= 3) && subsetOf(c.colorIdentity, colors);
      })
      .filter((c) => opts.pool !== 'owned' || ownedQty.has(c.name))
      .filter((c) => opts.difficulty !== 'beginner' || c.oracleText.length < 160)
      .sort((a, b) => scored.get(b.name)! - scored.get(a.name)!);
    let nb = 0;
    if (isCmd) {
      const ct = await deps.named('Command Tower', true).catch(() => null);
      if (ct && (opts.pool !== 'owned' || ownedQty.has(ct.name))) duals.unshift(ct);
    }
    for (const d of duals) {
      if (nb >= maxNonbasic) break;
      if (lands.some((l) => l.c.name === d.name)) continue;
      const q = isCmd ? 1 : Math.min(4, maxNonbasic - nb, opts.pool === 'owned' ? ownedQty.get(d.name) ?? 0 : 4);
      if (q <= 0) continue;
      lands.push({ c: d, qty: q });
      nb += q;
    }
    landsLeft -= nb;
  }
  const share = pipShare(spells.map((s) => s.c), colors.length ? colors : ['C']);
  const basicCols = colors.length ? colors : ['C'];
  const basicN: Record<string, number> = {};
  let assigned = 0;
  basicCols.forEach((col) => {
    basicN[col] = Math.floor(landsLeft * share[col]);
    assigned += basicN[col];
  });
  for (let i = 0; assigned < landsLeft; i++, assigned++) {
    const col = [...basicCols].sort((a, b) => share[b] - share[a])[i % basicCols.length];
    basicN[col]++;
  }
  for (const col of basicCols) {
    if (!basicN[col]) continue;
    const ownedBasic = ownedCard.get(BASIC[col]);
    const c = ownedBasic ?? (await deps.named(BASIC[col], true));
    if (c) lands.push({ c, qty: basicN[col] });
  }

  // 4) Assemble.
  const ownedFor = (n: string) => ownedQty.get(n) ?? 0;
  const cards: DeckCard[] = [
    ...spells.map((p) => toDeckCard(p.c, p.qty, p.role, ownedFor(p.c.name))),
    ...lands.map((l) => toDeckCard(l.c, l.qty, 'land', isBasic(l.c) ? l.qty : ownedFor(l.c.name))),
  ].sort((a, b) => (a.role === 'land' ? 1 : 0) - (b.role === 'land' ? 1 : 0) || a.cmc - b.cmc || a.name.localeCompare(b.name));
  const alternatives = nonland
    .filter((c) => !picked.has(c.name))
    .slice(0, 60)
    .map((c) => toDeckCard(c, 1, [...roleTags(c)][0], ownedFor(c.name)));

  const deck: Deck = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    game: 'mtg',
    name: isCmd
      ? `${commander!.name} — ${ARCHETYPES.find((a) => a.id === opts.archetype)!.label}`
      : `${colorName(colors)} ${opts.archetype === 'tribal' && tribe ? tribe : ARCHETYPES.find((a) => a.id === opts.archetype)!.label}`,
    options: { ...opts, colors },
    commander: commander ? toDeckCard(commander, 1, 'commander', ownedFor(commander.name)) : undefined,
    cards,
    alternatives,
    explanation: [],
    commanderSuggestions,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  deck.explanation = explain(deck, shortfall);
  return deck;
}

function sharedWords(c: CardData, cmd: CardData) {
  const keys = ['token', 'counter', 'graveyard', 'sacrifice', 'artifact', 'enchantment', 'instant', 'sorcery', 'land', 'life', 'attack', 'draw', 'dragon', 'elf', 'goblin', 'zombie', 'vampire', 'angel', 'wizard', 'merfolk', 'dinosaur', 'equipment', 'aura'];
  const a = c.oracleText.toLowerCase() + ' ' + c.typeLine.toLowerCase();
  const b = cmd.oracleText.toLowerCase();
  const hits = keys.filter((k) => b.includes(k) && a.includes(k)).length;
  return Math.min(1, hits / 2);
}

// ---------- analysis / explanation ----------
export function deckStats(deck: Deck) {
  const all = [...(deck.commander ? [deck.commander] : []), ...deck.cards];
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  const roles: Partial<Record<Role, number>> = {};
  let total = 0, ownedCopies = 0, missingCost = 0, fullCost = 0;
  const missing: { name: string; qty: number; price: number | null }[] = [];
  for (const c of all) {
    total += c.qty;
    roles[c.role] = (roles[c.role] ?? 0) + c.qty;
    if (c.role !== 'land') curve[Math.min(7, Math.floor(c.cmc))] += c.qty;
    const have = Math.min(c.owned, c.qty);
    ownedCopies += have;
    const miss = c.qty - have;
    fullCost += (c.priceUsd ?? 0) * c.qty;
    if (miss > 0 && !/^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(c.name)) {
      missing.push({ name: c.name, qty: miss, price: c.priceUsd });
      missingCost += (c.priceUsd ?? 0) * miss;
    }
  }
  const spells = all.filter((c) => c.role !== 'land');
  const avgMv = spells.reduce((a, c) => a + c.cmc * c.qty, 0) / Math.max(1, spells.reduce((a, c) => a + c.qty, 0));
  return { total, curve, roles, ownedCopies, missing, missingCost, fullCost, avgMv };
}

const PLAN: Record<Archetype, string> = {
  aggro: 'Play cheap creatures on turns 1–3 and attack every turn. Use removal to clear blockers and burn to finish. You want to win before turn 6–7, before slower decks set up.',
  midrange: 'Play the best creature you can each turn, trade efficiently, and use removal on their best threats. You are the beatdown against control and the control against aggro.',
  control: 'Survive the early game with removal and counterspells, keep cards in hand, sweep the board when they overcommit, then win with a few big threats or planeswalkers.',
  tribal: 'Flood the board with one creature type; your lords and payoffs make every creature stronger. Protect key lords and attack together.',
  tokens: 'Make lots of small creatures, then use anthems and payoffs to turn the swarm into a lethal attack. Watch out for board wipes — don’t overextend without a reason.',
  ramp: 'Use early turns to grow your mana (land search, mana dorks, rocks), then cast huge threats a few turns ahead of schedule.',
  spellslinger: 'Cast lots of instants and sorceries; your creatures and payoffs trigger every time. Keep mana up on the opponent’s turn when you can.',
  counters: 'Put +1/+1 counters on your creatures every turn so they outgrow the opponent’s. Proliferate and doublers make things snowball.',
  lifegain: 'Gain life constantly; payoffs grow your creatures or drain the opponent whenever you gain life.',
  reanimator: 'Fill your graveyard (mill, surveil, discard), then bring the best creatures back cheaply. Your graveyard is a second hand.',
};

export function explain(deck: Deck, shortfall = 0): { title: string; text: string }[] {
  const o = deck.options;
  const st = deckStats(deck);
  const lands = st.roles.land ?? 0;
  const key = deck.cards
    .filter((c) => c.role === 'synergy' || c.role === 'threat')
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 4)
    .map((c) => c.name);
  const rem = deck.cards.filter((c) => c.role === 'removal' || c.role === 'wipe').slice(0, 3).map((c) => c.name);
  const out = [
    { title: 'Game plan', text: (deck.commander ? `Your commander, ${deck.commander.name}, is always available from the command zone. ` : '') + PLAN[o.archetype] },
    { title: 'Key cards', text: `${key.join(', ')}${rem.length ? `. Answers: ${rem.join(', ')}` : ''}.` },
    {
      title: 'Mana',
      text: `${lands} lands, average mana value ${st.avgMv.toFixed(2)}. ${
        o.format === 'commander'
          ? `Keep a 7-card hand with 3–4 lands and a ramp spell. ${st.roles.ramp ?? 0} ramp pieces help you cast your commander early.`
          : `Keep hands with 2–4 lands (aggro is happy with 2, control wants 3+). Mulligan hands with 0–1 or 6–7 lands.`
      }`,
    },
    {
      title: o.difficulty === 'beginner' ? 'Tips for a new player' : o.difficulty === 'expert' ? 'Expert piloting' : 'How to pilot it',
      text:
        o.difficulty === 'beginner'
          ? 'Play a land every turn. Cast your cheapest creature first. Attack when your creatures are bigger than theirs, and save removal for their biggest threat. Read each card once before the game!'
          : o.difficulty === 'expert'
            ? 'Sequence for information: lead with threats that demand answers, hold instant-speed interaction, and count opponent’s open mana. Track your outs, sandbag removal for real threats, and mulligan aggressively for a functional curve.'
            : 'Plan your next two turns of mana. Trade creatures when it’s good for you, hold removal for creatures that matter, and draw cards when the board is stable.',
    },
  ];
  if (shortfall > 0)
    out.push({ title: '⚠️ Small pool', text: `Not enough matching cards — ${shortfall} extra basic lands were added. Add more cards or allow missing cards for a stronger deck.` });
  if (st.missing.length)
    out.push({
      title: 'Missing cards',
      text: `You own ${st.ownedCopies}/${st.total} cards (basic lands count as owned). ${st.missing.reduce((a, m) => a + m.qty, 0)} cards to get (est. $${st.missingCost.toFixed(2)}).`,
    });
  return out;
}

// ---------- validation & export ----------
export function validateDeck(deck: Deck, legal?: Map<string, CardData>): string[] {
  const issues: string[] = [];
  const isCmd = deck.options.format === 'commander';
  const st = deckStats(deck);
  if (isCmd && st.total !== 100) issues.push(`Commander deck has ${st.total} cards (needs 100)`);
  if (!isCmd && st.total < 60) issues.push(`Deck has ${st.total} cards (needs at least 60)`);
  const basics = /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered .*)$/;
  const counts = new Map<string, number>();
  for (const c of deck.cards) counts.set(c.name, (counts.get(c.name) ?? 0) + c.qty);
  for (const [n, q] of counts) {
    if (basics.test(n)) continue;
    if (isCmd && q > 1) issues.push(`${n}: ${q} copies (singleton format)`);
    if (!isCmd && q > 4) issues.push(`${n}: ${q} copies (max 4)`);
  }
  if (isCmd && deck.commander) {
    const ci = deck.commander.colorIdentity;
    for (const c of deck.cards) if (!subsetOf(c.colorIdentity, ci)) issues.push(`${c.name} is outside the commander's color identity`);
  }
  if (legal && deck.options.format !== 'casual') {
    for (const c of [...deck.cards, ...(deck.commander ? [deck.commander] : [])]) {
      const card = legal.get(c.name);
      if (card && card.legalities[deck.options.format] !== 'legal') issues.push(`${c.name} is not legal in ${deck.options.format}`);
    }
  }
  return issues;
}

export function exportDeck(deck: Deck, style: 'arena' | 'mtgo'): string {
  // Arena resolves cards by name (paper-only set codes would break the import), so keep lines name-only.
  const line = (c: DeckCard) => `${c.qty} ${c.name.split(' // ')[0]}`;
  if (style === 'mtgo') {
    // MTGO / plain text: commander listed first, no section headers.
    return [...(deck.commander ? [line(deck.commander)] : []), ...deck.cards.map((c) => `${c.qty} ${c.name}`)].join('\n');
  }
  const parts: string[] = [];
  if (deck.commander) parts.push('Commander', line(deck.commander), '');
  parts.push('Deck', ...deck.cards.map(line));
  return parts.join('\n');
}
