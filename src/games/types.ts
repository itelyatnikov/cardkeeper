// Pluggable card-game layer. MTG is implemented; Pokemon can be added later
// by implementing GameAdapter and registering it in games/index.ts.
export type GameId = 'mtg' | 'pokemon';

export type Finish = 'nonfoil' | 'foil' | 'etched';

export interface Prices {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  eur_foil?: string | null;
  tix?: string | null;
}

/** Normalized, cached card printing (game-agnostic shape, MTG-rich fields optional). */
export interface CardData {
  id: string; // printing id (Scryfall id for MTG)
  game: GameId;
  oracleId: string;
  name: string;
  set: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  typeLine: string;
  manaCost: string;
  cmc: number;
  colors: string[];
  colorIdentity: string[];
  oracleText: string;
  keywords: string[];
  power?: string;
  toughness?: string;
  image: string; // normal size
  imageSmall: string;
  imageArt?: string;
  legalities: Record<string, string>;
  prices: Prices;
  finishes: string[];
  edhrecRank?: number;
  producedMana?: string[];
  scryfallUri?: string;
  fetchedAt: number;
}

export interface CollectionEntry {
  key: string;
  game: GameId;
  cardId: string;
  qty: number;
  finish: Finish;
  owners: string[]; // group tags e.g. ["Ari"]
  addedAt: number;
}

export interface GameAdapter {
  id: GameId;
  name: string;
  available: boolean;
  /** Resolve OCR'd text / typed name to a card printing. */
  findByName(name: string): Promise<CardData | null>;
  autocomplete(q: string): Promise<string[]>;
  printings(card: CardData): Promise<CardData[]>;
  refreshPrices(ids: string[], onProgress?: (done: number, total: number) => void): Promise<CardData[]>;
}
