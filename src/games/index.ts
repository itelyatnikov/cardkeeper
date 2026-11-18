import type { GameAdapter, GameId } from './types';
import { mtgAdapter } from './mtg/adapter';

const pokemonStub: GameAdapter = {
  id: 'pokemon',
  name: 'Pokémon TCG (coming soon)',
  available: false,
  findByName: async () => null,
  autocomplete: async () => [],
  printings: async () => [],
  refreshPrices: async () => [],
};

export const games: Record<GameId, GameAdapter> = { mtg: mtgAdapter, pokemon: pokemonStub };
export const getGame = (id: GameId) => games[id];
