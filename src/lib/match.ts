import type { CardData } from '../games/types';
import { mtgAdapter } from '../games/mtg/adapter';
import * as sf from '../games/mtg/scryfall';

export function similarity(a: string, b: string) {
  a = a.toLowerCase().replace(/[^a-z]/g, '');
  b = b.toLowerCase().replace(/[^a-z]/g, '');
  if (!a || !b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}

const words = (s: string) => s.toLowerCase().split(/[^a-z']+/).map((w) => w.replace(/'/g, '')).filter(Boolean);

/**
 * How well is a card name supported by the OCR text? Each name word is matched
 * (fuzzily, also against split words like "Sheol dred") in the OCR'd text;
 * evidence is weighted by word length, so "Lightning Bolt" beats "Lightning"
 * when both words were seen.
 */
export function evidence(name: string, ocrText: string) {
  const toks = words(ocrText);
  const pool = new Set(toks);
  for (let i = 0; i + 1 < toks.length; i++) pool.add(toks[i] + toks[i + 1]);
  const nameToks = words(name.split(' // ')[0]);
  let got = 0, total = 0, matched = 0;
  for (const t of nameToks) {
    total += t.length;
    let best = 0;
    for (const p of pool) {
      if (Math.abs(p.length - t.length) > Math.max(2, t.length * 0.4)) continue;
      const s = similarity(t, p);
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (best >= 0.7) {
      got += t.length * best;
      matched++;
    } else if (t.length <= 3) total -= t.length * 0.7; // short words (of, the) are often lost; forgive them
  }
  return { score: got, coverage: total > 0 ? got / total : 0, matched };
}

/** Try OCR lines against Scryfall and pick the name with the best support in the OCR text. */
export async function resolveCandidates(lines: string[], rawText = lines.join('\n')): Promise<{ card: CardData; line: string; score: number } | null> {
  const names = new Map<string, { line: string; card?: CardData }>();
  for (const line of lines.slice(0, 4)) {
    const c = await sf.named(line).catch(() => null);
    if (c) names.set(c.name, { line, card: c });
    if (c && similarity(line, c.name.split(' // ')[0]) >= 0.85 && lines.indexOf(line) === 0) break;
  }
  // Fallback: autocomplete on the most distinctive words of the first lines.
  const topWords = [...new Set(lines.slice(0, 3).flatMap((l) => words(l)))].filter((w) => w.length >= 4).sort((a, b) => b.length - a.length).slice(0, 2);
  for (const w of topWords) for (const n of (await sf.autocomplete(w).catch(() => [])).slice(0, 20)) if (!names.has(n)) names.set(n, { line: w });

  let best: { name: string; line: string; card?: CardData; score: number; coverage: number } | null = null;
  for (const [name, v] of names) {
    const ev = evidence(name, rawText);
    const score = ev.score * (0.5 + ev.coverage);
    if (ev.coverage >= 0.6 && ev.score >= 4 && (!best || score > best.score)) best = { name, ...v, score, coverage: ev.coverage };
  }
  if (!best) return null;
  const card = best.card ?? (await mtgAdapter.findByName(best.name));
  return card ? { card, line: best.line, score: best.coverage } : null;
}
