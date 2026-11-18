import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CardData, CollectionEntry } from '../games/types';
import type { Deck } from '../games/mtg/deckgen';

interface Schema extends DBSchema {
  cards: { key: string; value: CardData };
  collection: { key: string; value: CollectionEntry; indexes: { byCard: string } };
  decks: { key: string; value: Deck };
  meta: { key: string; value: any };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
export function db() {
  if (!dbp)
    dbp = openDB<Schema>('cardkeeper', 1, {
      upgrade(d) {
        d.createObjectStore('cards', { keyPath: 'id' });
        const c = d.createObjectStore('collection', { keyPath: 'key' });
        c.createIndex('byCard', 'cardId');
        d.createObjectStore('decks', { keyPath: 'id' });
        d.createObjectStore('meta');
      },
    });
  return dbp;
}

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function putCards(cards: CardData[]) {
  const tx = (await db()).transaction('cards', 'readwrite');
  await Promise.all(cards.map((c) => tx.store.put(c)));
  await tx.done;
}
export const getAllCards = async () => (await db()).getAll('cards');
export const getAllEntries = async () => (await db()).getAll('collection');
export const putEntry = async (e: CollectionEntry) => (await db()).put('collection', e);
export const deleteEntry = async (key: string) => (await db()).delete('collection', key);
export const getDecks = async () => (await db()).getAll('decks');
export const putDeck = async (d: Deck) => (await db()).put('decks', d);
export const deleteDeck = async (id: string) => (await db()).delete('decks', id);
export const getMeta = async <T,>(k: string, def: T): Promise<T> => ((await (await db()).get('meta', k)) ?? def) as T;
export const setMeta = async (k: string, v: any) => (await db()).put('meta', v, k);

/** Add a card to the collection, merging with an identical entry (same printing, finish, owners). */
export async function addToCollection(card: CardData, qty: number, finish: CollectionEntry['finish'], owners: string[]) {
  await putCards([card]);
  const all = await (await db()).getAllFromIndex('collection', 'byCard', card.id);
  const key = [...owners].sort().join('|');
  const same = all.find((e) => e.finish === finish && [...e.owners].sort().join('|') === key);
  if (same) {
    same.qty += qty;
    await putEntry(same);
    return same;
  }
  const e: CollectionEntry = { key: uid(), game: card.game, cardId: card.id, qty, finish, owners, addedAt: Date.now() };
  await putEntry(e);
  return e;
}

export interface Backup {
  app: 'cardkeeper';
  version: 1;
  exportedAt: string;
  groups: string[];
  cards: CardData[];
  collection: CollectionEntry[];
  decks: Deck[];
  pricesUpdatedAt?: number;
}

export async function exportAll(): Promise<Backup> {
  return {
    app: 'cardkeeper',
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: await getMeta('groups', [] as string[]),
    cards: await getAllCards(),
    collection: await getAllEntries(),
    decks: await getDecks(),
    pricesUpdatedAt: await getMeta('pricesUpdatedAt', undefined),
  };
}

/** Import merges by default: entries with the same key are overwritten, others kept. */
export async function importAll(b: Backup, mode: 'merge' | 'replace') {
  if (b.app !== 'cardkeeper') throw new Error('Not a CardKeeper backup file');
  const d = await db();
  if (mode === 'replace') {
    await d.clear('collection');
    await d.clear('decks');
  }
  await putCards(b.cards ?? []);
  const tx = d.transaction(['collection', 'decks'], 'readwrite');
  for (const e of b.collection ?? []) tx.objectStore('collection').put(e);
  for (const k of b.decks ?? []) tx.objectStore('decks').put(k);
  await tx.done;
  const groups = new Set([...(mode === 'merge' ? await getMeta('groups', [] as string[]) : []), ...(b.groups ?? [])]);
  await setMeta('groups', [...groups]);
  if (b.pricesUpdatedAt) await setMeta('pricesUpdatedAt', b.pricesUpdatedAt);
}
