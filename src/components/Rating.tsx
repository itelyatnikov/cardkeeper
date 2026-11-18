import type { CardData } from '../games/types';
import { rateCard } from '../games/mtg/rating';

const cache = new Map<string, ReturnType<typeof rateCard>>();
export function ratingOf(c: CardData) {
  const k = c.id + (c.edhrecRank ?? '');
  let r = cache.get(k);
  if (!r) cache.set(k, (r = rateCard(c)));
  return r;
}

export function RatingBadge({ card, compact }: { card: CardData; compact?: boolean }) {
  const r = ratingOf(card);
  if (compact)
    return (
      <span className={`rating-pill g-${r.grade}`} title={`${r.label}: ${r.reason}`}>
        {r.score}/10
      </span>
    );
  return (
    <div className={`rating g-${r.grade}`} data-testid="rating">
      <div className="rating-head">
        <span className="rating-score">
          {r.score}
          <small>/10</small>
        </span>
        <span>
          <b>
            Deck rating: {r.label}
          </b>
          <br />
          <span className="rating-reason">{r.reason}</span>
        </span>
      </div>
      <details>
        <summary>Why? · Commander vs 60-card</summary>
        <ul className="rating-factors">
          {r.factors.map((f) => (
            <li key={f.text}>
              <span className={f.pts >= 0 ? 'plus' : 'minus'}>{f.pts >= 0 ? `+${f.pts.toFixed(1)}` : f.pts.toFixed(1)}</span> {f.text}
            </li>
          ))}
        </ul>
        <p>
          👑 <b>Commander:</b> {r.commander}
          <br />
          ⚔️ <b>60-card:</b> {r.constructed}
        </p>
      </details>
    </div>
  );
}
