import { toggleFavorite } from '../lib/db';
import { useStore } from '../lib/store';

/** Star toggle for a collection entry (persists immediately). */
export function FavStar({ entryKey, on, name, inline, label, onChange }: { entryKey: string; on: boolean; name: string; inline?: boolean; label?: boolean; onChange?: (f: boolean) => void }) {
  const { reload } = useStore();
  return (
    <button
      className={`fav-star ${inline ? 'inline' : ''} ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={on ? `Unfavorite ${name}` : `Favorite ${name}`}
      data-testid="fav-star"
      onClick={async (e) => {
        e.stopPropagation();
        const f = await toggleFavorite(entryKey);
        onChange?.(f);
        await reload();
      }}
    >
      {on ? '★' : '☆'}
      {label && <span>{on ? ' Favorite' : ' Add to favorites'}</span>}
    </button>
  );
}
