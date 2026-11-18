// Deterministic, explainable "how good is this card in a deck" rating.
// Reuses the deck builder's role detection (roles.ts) and popularity signal.
import type { CardData } from '../types';
import { isBasic, isCreature, isLand, roleTags } from './roles';
import { popularity } from './deckgen';

export interface Rating {
  score: number; // 1..10
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  label: string;
  reason: string; // one line
  factors: { text: string; pts: number }[];
  commander: string;
  constructed: string;
}

const KEYWORDS: Record<string, number> = {
  flying: 0.8, haste: 0.5, deathtouch: 0.7, lifelink: 0.5, trample: 0.4, 'first strike': 0.5, 'double strike': 1.0,
  vigilance: 0.3, menace: 0.4, hexproof: 0.7, indestructible: 0.9, flash: 0.5, ward: 0.5, reach: 0.2, prowess: 0.3,
  shroud: 0.4, protection: 0.4, cascade: 0.8, convoke: 0.3, affinity: 0.4, delve: 0.4, storm: 0.6, annihilator: 0.8,
};

const LABELS: [number, Rating['grade'], string][] = [
  [9, 'S', 'Staple'],
  [7, 'A', 'Strong'],
  [5, 'B', 'Solid'],
  [3, 'C', 'Filler'],
  [0, 'D', 'Weak'],
];

export function rateCard(c: CardData): Rating {
  const f: { text: string; pts: number }[] = [];
  const add = (pts: number, text: string) => pts !== 0 && f.push({ pts, text });
  const o = c.oracleText.toLowerCase();
  const roles = roleTags(c);
  const mv = c.cmc;

  if (isBasic(c)) {
    return {
      score: 5, grade: 'B', label: 'Basic land', reason: 'Every deck needs lands — basics are always playable.', factors: [],
      commander: 'Playable', constructed: 'Playable',
    };
  }

  if (isLand(c)) {
    const prod = (c.producedMana ?? []).filter((m) => m !== 'C');
    if (prod.length >= 2) add(1.5, `taps for ${prod.length} colors`);
    if (/enters (the battlefield )?tapped/.test(o) && !/unless|you may pay/.test(o)) add(-0.8, 'enters tapped');
    else if (prod.length >= 2) add(1, 'can enter untapped');
    if (/search your library for/.test(o)) add(1, 'fixes mana (fetch)');
    if (/draw|create|destroy|deals|scry|surveil|return/.test(o)) add(0.8, 'utility ability');
  } else {
    // Effects (from the same detectors the deck builder uses)
    if (roles.has('wipe')) add(2, 'board wipe');
    if (roles.has('removal')) add(/instant|flash/.test(c.typeLine.toLowerCase() + ' ' + o) ? 2.2 : 1.8, roles.has('wipe') ? 'also removal' : /instant/i.test(c.typeLine) ? 'instant-speed removal' : 'removal');
    if (roles.has('counter')) add(1.4, 'counterspell');
    if (roles.has('draw')) add(1.4, 'card advantage');
    if (roles.has('ramp')) add(1.3, 'mana ramp');
    if (/search your library for (a|an|up to one) (card|creature|instant|sorcery|artifact|enchantment)(?! land)/.test(o)) add(1.6, 'tutor');
    if (/(whenever|at the beginning of)[^.]*(you|your)/.test(o) && /create|draw|deal|gain|put/.test(o)) add(0.6, 'repeatable value');
    if (/when [^.]* enters/.test(o) && (roles.size > 1 || /create|draw|destroy|exile|deals/.test(o))) add(0.5, 'enters-the-battlefield value');

    // Creature stats vs cost
    if (isCreature(c)) {
      const p = Number(c.power), t = Number(c.toughness);
      if (!isNaN(p) && !isNaN(t)) {
        const expected = 2 * Math.max(mv, 0.5) + 1; // vanilla-ish rate: P+T ≈ 2·MV+1
        const diff = (p + t - expected) / 2;
        const pts = Math.max(-1.5, Math.min(1.5, diff * 0.6));
        if (Math.abs(pts) >= 0.3) add(pts, pts > 0 ? `big body for ${mv} mana (${p}/${t})` : `small body for ${mv} mana (${p}/${t})`);
      }
      let kw = 0;
      const names: string[] = [];
      for (const k of c.keywords.map((x) => x.toLowerCase())) if (KEYWORDS[k]) (kw += KEYWORDS[k]), names.push(k);
      if (kw) add(Math.min(2, kw), names.slice(0, 3).join(', '));
      if (/\bdefender\b/.test(o) && !roles.size) add(-1, 'defender');
      if (/can't block/.test(o)) add(-0.3, "can't block");
    } else {
      let kw = 0;
      for (const k of c.keywords.map((x) => x.toLowerCase())) kw += KEYWORDS[k] ?? 0;
      if (kw) add(Math.min(1, kw), 'useful keywords');
    }

    // Mana efficiency
    if (mv <= 1 && (roles.has('removal') || roles.has('ramp') || roles.has('draw') || roles.has('counter'))) add(0.8, `only ${mv} mana`);
    if (mv >= 6 && !isCreature(c) && !roles.has('wipe')) add(-0.6 - (mv - 6) * 0.3, `expensive (${mv} mana)`);
    if (mv >= 7 && isCreature(c)) add(-0.4 - (mv - 7) * 0.3, `expensive (${mv} mana)`);
    if (/at the beginning of your upkeep, sacrifice|you lose the game|skip your/.test(o)) add(-0.8, 'big drawback');
    if (!roles.size && !isCreature(c) && c.oracleText.length < 60 && !/\bPlaneswalker\b/.test(c.typeLine)) add(-0.6, 'minor effect');
    if (/\bPlaneswalker\b/.test(c.typeLine)) add(1.2, 'planeswalker (repeatable value)');
  }

  // Popularity & rarity (weak signals)
  const pop = popularity(c);
  if (c.edhrecRank) add(Math.round((pop * 4 - 1.4) * 10) / 10, c.edhrecRank < 1000 ? `very popular (EDHREC #${c.edhrecRank})` : c.edhrecRank < 8000 ? `often played (EDHREC #${c.edhrecRank})` : `rarely played (EDHREC #${c.edhrecRank})`);
  if (c.rarity === 'mythic') add(0.3, 'mythic');
  else if (c.rarity === 'rare') add(0.2, 'rare');

  const legalAnywhere = ['commander', 'modern', 'pioneer', 'standard', 'legacy', 'vintage'].some((k) => c.legalities?.[k] === 'legal' || c.legalities?.[k] === 'restricted');
  if (!legalAnywhere) add(-3, 'not tournament-legal');

  const raw = f.reduce((a, x) => a + x.pts, 0);
  const score = Math.max(1, Math.min(10, Math.round(4.6 + raw)));
  const [, grade, label] = LABELS.find(([min]) => score >= min)!;

  const pos = f.filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts);
  const neg = f.filter((x) => x.pts < 0).sort((a, b) => a.pts - b.pts);
  const reasonParts = [...pos.slice(0, 2).map((x) => x.text), ...neg.slice(0, 1).map((x) => x.text)];
  const reason = reasonParts.length ? cap(reasonParts.join(' · ')) : 'Plain card without standout effects.';

  // Per-format notes
  const cmdLegal = c.legalities?.commander;
  const commander =
    cmdLegal === 'banned' ? 'Banned in Commander'
      : cmdLegal !== 'legal' ? 'Not legal in Commander'
      : c.edhrecRank && c.edhrecRank < 1500 ? 'Great — a Commander favorite'
      : roles.has('ramp') || roles.has('draw') || roles.has('wipe') ? 'Good — fills a key Commander role'
      : score >= 6 ? 'Good' : 'OK in the right deck';
  const fmts = ['standard', 'pioneer', 'modern'].filter((k) => c.legalities?.[k] === 'legal');
  const constructed =
    !fmts.length && c.legalities?.legacy !== 'legal' ? 'Banned or not legal in 60-card formats (fine casually)'
      : mv <= 3 && (roles.has('removal') || roles.has('counter') || roles.has('draw') || isCreature(c)) && score >= 6
        ? `Efficient for 60-card decks${fmts.length ? ` (legal: ${fmts.join(', ')})` : ''}`
        : mv >= 6 ? 'Usually too slow for 60-card decks'
        : `Fine in 60-card decks${fmts.length ? ` (legal: ${fmts.join(', ')})` : ''}`;

  return { score, grade, label, reason, factors: f, commander, constructed };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
