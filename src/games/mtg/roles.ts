import type { CardData } from '../types';

export type Role = 'commander' | 'land' | 'ramp' | 'draw' | 'removal' | 'wipe' | 'counter' | 'threat' | 'synergy';

export const ROLE_LABEL: Record<Role, string> = {
  commander: 'Commander',
  land: 'Lands',
  ramp: 'Ramp',
  draw: 'Card draw',
  removal: 'Removal',
  wipe: 'Board wipes',
  counter: 'Counterspells',
  threat: 'Threats',
  synergy: 'Synergy',
};

const front = (c: CardData) => c.typeLine.split('//')[0];
export const isLand = (c: CardData) => /\bLand\b/.test(front(c));
export const isCreature = (c: CardData) => /\bCreature\b/.test(front(c));
export const isBasic = (c: CardData) => /\bBasic\b/.test(c.typeLine) && isLand(c);
export const isLegendary = (c: CardData) => /\bLegendary\b/.test(front(c));
const t = (c: CardData) => c.oracleText.toLowerCase();

export function roleTags(c: CardData): Set<Role> {
  const r = new Set<Role>();
  if (isLand(c)) {
    r.add('land');
    return r;
  }
  const o = t(c);
  if (/destroy all|exile all (creatures|nonland|other)|deals? \d+ damage to each (creature|other creature)|all (other )?creatures get -\d|return all (nonland|creatures)/.test(o)) r.add('wipe');
  if (/counter target (spell|noncreature|creature spell|instant|activated)/.test(o)) r.add('counter');
  if (
    !r.has('wipe') &&
    /(destroy|exile) (another )?target (creature|permanent|nonland|artifact|enchantment|planeswalker|attacking|tapped|creature or planeswalker)|deals? (\d+|x|damage equal to [^.]+) (damage )?to (any target|target creature|target attacking|target player or planeswalker|target creature or planeswalker|each opponent)|target creature (an opponent controls )?gets -\d|-x\/-x|fights? (target|up to one target)|(return|put) target (creature|nonland permanent)[^.]* (to its owner's hand|on (the )?(top|bottom) of)|target (creature|player)[^.]*sacrifices?|each opponent sacrifices/.test(o)
  )
    r.add('removal');
  if (/draws? (a|an additional|two|three|four|x|that many|cards equal)[^.]*cards?|investigate|look at the top [^.]+ put [^.]+ into your hand|exile the top [^.]+ you may play/.test(o)) r.add('draw');
  if (
    !isCreature(c) || c.cmc <= 3
      ? /\{t\}: add|add (one|two|three) mana|add \{[wubrgc]\}|search your library for (a|up to (two|three)) (basic )?land|(basic )?land cards?[^.]*onto the battlefield|create (a|two) treasure|you may play an additional land/.test(o)
      : false
  )
    r.add('ramp');
  if (isCreature(c) || /\bPlaneswalker\b/.test(front(c))) r.add('threat');
  if (r.size === 0) r.add('synergy');
  return r;
}

export type Archetype =
  | 'aggro'
  | 'midrange'
  | 'control'
  | 'tribal'
  | 'tokens'
  | 'ramp'
  | 'spellslinger'
  | 'counters'
  | 'lifegain'
  | 'reanimator';

export const ARCHETYPES: { id: Archetype; label: string; blurb: string }[] = [
  { id: 'aggro', label: 'Aggro', blurb: 'Fast creatures, attack early' },
  { id: 'midrange', label: 'Midrange', blurb: 'Strong creatures + removal' },
  { id: 'control', label: 'Control', blurb: 'Stop everything, win late' },
  { id: 'tribal', label: 'Tribal', blurb: 'One creature type (Elves, Goblins…)' },
  { id: 'tokens', label: 'Tokens', blurb: 'Make an army of tokens' },
  { id: 'ramp', label: 'Ramp', blurb: 'Extra mana, huge spells' },
  { id: 'spellslinger', label: 'Spellslinger', blurb: 'Instants & sorceries matter' },
  { id: 'counters', label: '+1/+1 Counters', blurb: 'Grow your creatures' },
  { id: 'lifegain', label: 'Lifegain', blurb: 'Gain life, get rewarded' },
  { id: 'reanimator', label: 'Graveyard', blurb: 'Bring things back from the dead' },
];

/** 0..1 how well a card fits an archetype (plus tribe for tribal). */
export function synergy(c: CardData, a: Archetype, tribe?: string): number {
  const o = t(c);
  const tl = c.typeLine.toLowerCase();
  const kw = c.keywords.map((k) => k.toLowerCase());
  const pow = Number(c.power ?? NaN);
  const cre = isCreature(c);
  let s = 0;
  switch (a) {
    case 'aggro':
      if (cre && c.cmc <= 3) s += 0.5;
      if (cre && !isNaN(pow) && pow >= c.cmc) s += 0.2;
      if (kw.some((k) => ['haste', 'first strike', 'double strike', 'menace', 'trample', 'prowess'].includes(k))) s += 0.2;
      if (/deals? \d+ damage to (any target|each opponent|target player)/.test(o) && c.cmc <= 2) s += 0.4;
      if (/creatures you control get \+/.test(o)) s += 0.3;
      if (c.cmc >= 5) s -= 0.6;
      break;
    case 'midrange':
      if (cre && c.cmc >= 2 && c.cmc <= 5) s += 0.4;
      if (cre && !isNaN(pow) && pow >= c.cmc - 1) s += 0.2;
      if (/when [^.]* enters/.test(o)) s += 0.2;
      if (/\bPlaneswalker\b/.test(c.typeLine)) s += 0.3;
      break;
    case 'control':
      if (!cre && /instant|sorcery/.test(tl)) s += 0.3;
      if (cre && c.cmc >= 4) s += 0.2;
      if (/\bPlaneswalker\b/.test(c.typeLine)) s += 0.4;
      if (cre && c.cmc <= 2) s -= 0.3;
      break;
    case 'tribal':
      if (tribe) {
        const tr = tribe.toLowerCase().replace(/s$/, '');
        if (tl.includes(tr)) s += 0.8;
        if (o.includes(tr)) s += 0.5;
      }
      if (/changeling/.test(o)) s += 0.3;
      break;
    case 'tokens':
      if (/create[^.]*token/.test(o)) s += 0.7;
      if (/tokens? you control|populate|creatures you control get \+|whenever (a|another) (creature|token) (you control )?enters/.test(o)) s += 0.5;
      break;
    case 'ramp':
      if (cre && c.cmc >= 6) s += 0.6;
      if (/add \{|search your library for [^.]*land|additional land/.test(o)) s += 0.5;
      if (/landfall|whenever a land enters/.test(o)) s += 0.4;
      break;
    case 'spellslinger':
      if (/\b(instant|sorcery)\b/.test(tl)) s += 0.4;
      if (/whenever you cast (an|a) (instant|sorcery|noncreature)|instant or sorcery|copy target (instant|sorcery)|magecraft/.test(o)) s += 0.7;
      if (kw.includes('prowess')) s += 0.4;
      break;
    case 'counters':
      if (/\+1\/\+1 counter/.test(o)) s += 0.7;
      if (/proliferate|counter on each|double the number of/.test(o)) s += 0.4;
      break;
    case 'lifegain':
      if (/you gain (\d+|x|that much) life|gain \d+ life/.test(o) || kw.includes('lifelink')) s += 0.6;
      if (/whenever you gain life/.test(o)) s += 0.7;
      break;
    case 'reanimator':
      if (/from (a|your|any) graveyard (on)?to the battlefield|return target creature card from (a|your) graveyard/.test(o)) s += 0.8;
      if (/\bmill\b|surveil|discard (a|two) cards?|put the top [^.]* into your graveyard|cards? in your graveyard/.test(o)) s += 0.4;
      if (cre && c.cmc >= 6) s += 0.2;
      break;
  }
  return Math.max(0, Math.min(1, s));
}

/** Rough "how complicated is this card to play" 0 (simple) .. 1 (complex). */
export function complexity(c: CardData): number {
  const o = c.oracleText;
  let s = Math.min(1, o.length / 450);
  if (c.cmc === 0 && /X/.test(c.manaCost)) s += 0.2;
  if (/\/\//.test(c.typeLine)) s += 0.2;
  if (/storm|cascade|delve|convoke|split second|phase|mutate|companion|foretell|adventure|day|night/i.test(o)) s += 0.15;
  if (/counter target/i.test(o)) s += 0.1; // reactive play is harder for beginners
  return Math.min(1, s);
}
