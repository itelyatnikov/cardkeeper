import type { CardData, Finish } from '../games/types';

const num = (s?: string | null) => (s == null || s === '' ? null : Number(s));

/** USD value for one copy in the given finish, falling back sensibly. */
export function unitUsd(card: CardData | undefined, finish: Finish = 'nonfoil'): number | null {
  if (!card) return null;
  const p = card.prices ?? {};
  const order =
    finish === 'etched'
      ? [p.usd_etched, p.usd_foil, p.usd]
      : finish === 'foil'
        ? [p.usd_foil, p.usd_etched, p.usd]
        : [p.usd, p.usd_foil, p.usd_etched];
  for (const v of order) {
    const n = num(v);
    if (n != null && !isNaN(n)) return n;
  }
  return null;
}

/** Secondary info when there's no USD price at all. */
export function fallbackPriceLabel(card: CardData | undefined, finish: Finish = 'nonfoil'): string | null {
  if (!card) return null;
  const p = card.prices ?? {};
  const eur = num(finish === 'nonfoil' ? p.eur : p.eur_foil ?? p.eur);
  if (eur != null) return `€${eur.toFixed(2)}`;
  const tix = num(p.tix);
  if (tix != null) return `${tix.toFixed(2)} tix`;
  return null;
}

export const fmtUsd = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;
