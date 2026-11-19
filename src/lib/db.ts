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
export async function addToCollection(card: CardData, qty: number, finish: CollectionEntry['finish'], owners: string[], favorite = false) {
  await putCards([card]);
  const all = await (await db()).getAllFromIndex('collection', 'byCard', card.id);
  const key = [...owners].sort().join('|');
  const same = all.find((e) => e.finish === finish && [...e.owners].sort().join('|') === key);
  if (same) {
    same.qty += qty;
    if (favorite) same.favorite = true;
    await putEntry(same);
    return same;
  }
  const e: CollectionEntry = { key: uid(), game: card.game, cardId: card.id, qty, finish, owners, favorite, addedAt: Date.now() };
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
  for (const e of b.collection ?? []) tx.objectStore('collection').put({ ...e, favorite: e.favorite ?? false });
  for (const k of b.decks ?? []) tx.objectStore('decks').put(k);
  await tx.done;
  const groups = new Set([...(mode === 'merge' ? await getMeta('groups', [] as string[]) : []), ...(b.groups ?? [])]);
  await setMeta('groups', [...groups]);
  if (b.pricesUpdatedAt) await setMeta('pricesUpdatedAt', b.pricesUpdatedAt);
}

// ---------- owner groups ----------
export const DEFAULT_GROUPS = ['Ari', 'Max', 'Zion'];
const SCHEMA = 3;

/** One-time data migrations for existing installs (runs on every app start, idempotent). */
export async function migrate() {
  const v = await getMeta<number>('schemaVersion', 1);
  let groups = await getMeta<string[] | null>('groups', null);
  if (groups === null) groups = [...DEFAULT_GROUPS]; // fresh install
  if (v < 2 && !groups.includes('Zion')) groups = [...groups, 'Zion']; // v1 -> v2: add Zion
  await setMeta('groups', groups);
  if (v < 3) {
    // v2 -> v3: favorites flag on every collection entry
    const d = await db();
    const tx = d.transaction('collection', 'readwrite');
    for (const e of await tx.store.getAll()) if (e.favorite === undefined) tx.store.put({ ...e, favorite: false });
    await tx.done;
  }
  if (v < SCHEMA) await setMeta('schemaVersion', SCHEMA);
}

export async function renameGroup(oldName: string, newName: string) {
  const groups = await getMeta<string[]>('groups', []);
  if (groups.includes(newName)) throw new Error(`“${newName}” already exists`);
  await setMeta('groups', groups.map((g) => (g === oldName ? newName : g)));
  const d = await db();
  const tx = d.transaction(['collection', 'decks'], 'readwrite');
  for (const e of await tx.objectStore('collection').getAll())
    if (e.owners.includes(oldName)) tx.objectStore('collection').put({ ...e, owners: e.owners.map((o) => (o === oldName ? newName : o)) });
  for (const k of await tx.objectStore('decks').getAll())
    if (k.options.ownerGroup === oldName) tx.objectStore('decks').put({ ...k, options: { ...k.options, ownerGroup: newName } });
  await tx.done;
}

export type DeleteGroupMode = { kind: 'untag' } | { kind: 'move'; to: string } | { kind: 'delete-cards' };

/** Delete a group. untag: cards keep other owners; move: retag to another group; delete-cards: remove cards owned only by this group. */
export async function deleteGroup(name: string, mode: DeleteGroupMode) {
  const groups = await getMeta<string[]>('groups', []);
  await setMeta('groups', groups.filter((g) => g !== name));
  const d = await db();
  const tx = d.transaction(['collection', 'decks'], 'readwrite');
  const store = tx.objectStore('collection');
  for (const e of await store.getAll()) {
    if (!e.owners.includes(name)) continue;
    let owners = e.owners.filter((o) => o !== name);
    if (mode.kind === 'move' && !owners.includes(mode.to)) owners = [...owners, mode.to];
    if (mode.kind === 'delete-cards' && owners.length === 0) store.delete(e.key);
    else store.put({ ...e, owners });
  }
  for (const k of await tx.objectStore('decks').getAll())
    if (k.options.ownerGroup === name)
      tx.objectStore('decks').put({ ...k, options: { ...k.options, ownerGroup: mode.kind === 'move' ? mode.to : '__all__' } });
  await tx.done;
}

export async function toggleFavorite(key: string) {
  const d = await db();
  const e = await d.get('collection', key);
  if (e) await d.put('collection', { ...e, favorite: !e.favorite });
  return !e?.favorite;
}
