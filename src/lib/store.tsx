import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CardData, CollectionEntry } from '../games/types';
import * as db from './db';
import { unitUsd } from './price';
import { collection as sfCollection } from '../games/mtg/scryfall';

export interface Row {
  entry: CollectionEntry;
  card: CardData;
  unit: number | null;
  value: number;
}

interface Store {
  ready: boolean;
  rows: Row[];
  cards: Map<string, CardData>;
  groups: string[];
  pricesUpdatedAt?: number;
  reload: () => Promise<void>;
  setGroups: (g: string[]) => Promise<void>;
  refreshPrices: (onProgress?: (d: number, t: number) => void) => Promise<number>;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<Store>(null as any);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [cards, setCards] = useState<Map<string, CardData>>(new Map());
  const [groups, setGroupsState] = useState<string[]>([]);
  const [pricesUpdatedAt, setPU] = useState<number | undefined>();
  const [toastMsg, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    await db.migrate();
    const [e, c, g, pu] = await Promise.all([
      db.getAllEntries(),
      db.getAllCards(),
      db.getMeta<string[] | null>('groups', null),
      db.getMeta<number | undefined>('pricesUpdatedAt', undefined),
    ]);
    setEntries(e);
    setCards(new Map(c.map((x) => [x.id, x])));
    setGroupsState(g ?? db.DEFAULT_GROUPS);
    setPU(pu);
    setReady(true);
  }, []);

  useEffect(() => {
    reload();
    // Ask the browser to keep our data (helps on iOS/Android storage pressure).
    navigator.storage?.persist?.().catch(() => undefined);
  }, [reload]);

  const rows = useMemo(
    () =>
      entries
        .map((entry) => {
          const card = cards.get(entry.cardId)!;
          const unit = unitUsd(card, entry.finish);
          return { entry, card, unit, value: (unit ?? 0) * entry.qty };
        })
        .filter((r) => r.card),
    [entries, cards],
  );

  const setGroups = useCallback(async (g: string[]) => {
    await db.setMeta('groups', g);
    setGroupsState(g);
  }, []);

  const refreshPrices = useCallback(
    async (onProgress?: (d: number, t: number) => void) => {
      const ids = [...new Set(entries.map((e) => e.cardId))];
      const fresh = await sfCollection(ids, onProgress); // batches of 75, throttled
      await db.putCards(fresh);
      const now = Date.now();
      await db.setMeta('pricesUpdatedAt', now);
      await reload();
      return fresh.length;
    },
    [entries, reload],
  );

  const toast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((cur) => (cur === m ? null : cur)), 2500);
  }, []);

  return (
    <Ctx.Provider value={{ ready, rows, cards, groups, pricesUpdatedAt, reload, setGroups, refreshPrices, toast, toastMsg }}>
      {children}
    </Ctx.Provider>
  );
}
