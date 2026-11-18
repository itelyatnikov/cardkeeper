import type { CardData } from '../types';

const API = 'https://api.scryfall.com';
// Scryfall hard limits: /cards/search, /cards/named, /cards/collection = 2 req/s;
// everything else (autocomplete) = 10 req/s. A 429 locks us out for 30 s, so
// every call goes through one queue that spaces requests per endpoint class.
const HEAVY_GAP_MS = 550;
const LIGHT_GAP_MS = 120;
let lastAny = 0;
let lastHeavy = 0;
let chain: Promise<unknown> = Promise.resolve();
const isHeavy = (url: string) => /\/cards\/(search|named|random|collection)/.test(url);

function headers(json = false): HeadersInit {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (json) h['Content-Type'] = 'application/json';
  // Browsers forbid setting User-Agent; in Node (tests) Scryfall wants one.
  if (typeof window === 'undefined') h['User-Agent'] = 'CardKeeperPWA/0.1 (test harness)';
  return h;
}

/** Serialize all Scryfall calls with the required gaps between them. */
function throttled<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const heavy = isHeavy(url);
    const wait = Math.max(lastAny + LIGHT_GAP_MS, heavy ? lastHeavy + HEAVY_GAP_MS : 0) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAny = Date.now();
    if (heavy) lastHeavy = lastAny;
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

const memo = new Map<string, { t: number; v: any }>();
const MEMO_MS = 6 * 3600 * 1000;

async function request(url: string, init?: RequestInit, attempt = 0): Promise<any> {
  const key = init?.body ? '' : url;
  const hit = key && memo.get(key);
  if (hit && Date.now() - hit.t < MEMO_MS) return hit.v;
  let res: Response;
  try {
    res = await throttled(url, () => fetch(url, { headers: headers(!!init?.body), signal: AbortSignal.timeout(25000), ...init }));
  } catch (e) {
    // Network error (or a 429 without CORS headers): back off and retry.
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 3000 : 31000));
      return request(url, init, attempt + 1);
    }
    throw new Error('Could not reach Scryfall. Check your internet connection and try again.');
  }
  if (res.status === 429 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 31000)); // Scryfall locks out for 30 s
    return request(url, init, attempt + 1);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(body?.details || `Scryfall ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (key) memo.set(key, { t: Date.now(), v: body });
  return body;
}
const getJson = (url: string) => request(url);

export function normalize(c: any): CardData {
  const face = c.card_faces?.[0] ?? {};
  const imgs = c.image_uris ?? face.image_uris ?? {};
  const oracle =
    c.oracle_text ?? (c.card_faces ? c.card_faces.map((f: any) => f.oracle_text ?? '').join('\n//\n') : '');
  return {
    id: c.id,
    game: 'mtg',
    oracleId: c.oracle_id ?? face.oracle_id ?? c.id,
    name: c.name,
    set: c.set,
    setName: c.set_name,
    collectorNumber: c.collector_number,
    rarity: c.rarity,
    typeLine: c.type_line ?? face.type_line ?? '',
    manaCost: c.mana_cost ?? face.mana_cost ?? '',
    cmc: c.cmc ?? 0,
    colors: c.colors ?? face.colors ?? [],
    colorIdentity: c.color_identity ?? [],
    oracleText: oracle,
    keywords: c.keywords ?? [],
    power: c.power ?? face.power,
    toughness: c.toughness ?? face.toughness,
    image: imgs.normal ?? imgs.large ?? '',
    imageSmall: imgs.small ?? imgs.normal ?? '',
    imageArt: imgs.art_crop,
    legalities: c.legalities ?? {},
    prices: c.prices ?? {},
    finishes: c.finishes ?? ['nonfoil'],
    edhrecRank: c.edhrec_rank,
    producedMana: c.produced_mana,
    scryfallUri: c.scryfall_uri,
    fetchedAt: Date.now(),
  };
}

export async function named(name: string, exact = false): Promise<CardData | null> {
  try {
    const c = await getJson(`${API}/cards/named?${exact ? 'exact' : 'fuzzy'}=${encodeURIComponent(name)}`);
    return normalize(c);
  } catch (e: any) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function autocomplete(q: string): Promise<string[]> {
  if (q.trim().length < 2) return [];
  const r = await getJson(`${API}/cards/autocomplete?q=${encodeURIComponent(q)}`);
  return r.data ?? [];
}

export interface SearchOpts {
  order?: string;
  unique?: 'cards' | 'prints' | 'art';
  maxPages?: number;
  dir?: 'auto' | 'asc' | 'desc';
}

export async function search(q: string, opts: SearchOpts = {}): Promise<CardData[]> {
  const params = new URLSearchParams({ q, order: opts.order ?? 'edhrec', unique: opts.unique ?? 'cards' });
  if (opts.dir) params.set('dir', opts.dir);
  let url: string | null = `${API}/cards/search?${params}`;
  const out: CardData[] = [];
  let pages = 0;
  while (url && pages < (opts.maxPages ?? 1)) {
    try {
      const r: any = await getJson(url);
      out.push(...r.data.map(normalize));
      url = r.has_more ? r.next_page : null;
    } catch (e: any) {
      if (e.status === 404) break; // no matches
      throw e;
    }
    pages++;
  }
  return out;
}

export async function printings(oracleId: string): Promise<CardData[]> {
  return search(`oracleid:${oracleId} game:paper`, { unique: 'prints', order: 'released', dir: 'desc', maxPages: 2 });
}

/** Batch lookup by Scryfall id: /cards/collection, max 75 identifiers per request. */
export async function collection(
  ids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<CardData[]> {
  const out: CardData[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const chunk = ids.slice(i, i + 75);
    const r = await request(`${API}/cards/collection`, {
      method: 'POST',
      body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }),
    });
    out.push(...(r.data ?? []).map(normalize));
    onProgress?.(Math.min(i + 75, ids.length), ids.length);
  }
  return out;
}

/** Same as collection() but by card name (used to price/resolve generated decks). */
export async function collectionByName(names: string[]): Promise<CardData[]> {
  const out: CardData[] = [];
  for (let i = 0; i < names.length; i += 75) {
    const chunk = names.slice(i, i + 75);
    const r = await request(`${API}/cards/collection`, {
      method: 'POST',
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
    });
    out.push(...(r.data ?? []).map(normalize));
  }
  return out;
}
