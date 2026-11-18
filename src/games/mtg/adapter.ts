import type { GameAdapter } from '../types';
import * as sf from './scryfall';

export const mtgAdapter: GameAdapter = {
  id: 'mtg',
  name: 'Magic: The Gathering',
  available: true,
  async findByName(name) {
    const clean = name.trim();
    if (!clean) return null;
    const hit = await sf.named(clean);
    if (hit) return hit;
    const ac = await sf.autocomplete(clean);
    return ac.length ? sf.named(ac[0], true) : null;
  },
  autocomplete: sf.autocomplete,
  printings: (card) => sf.printings(card.oracleId),
  refreshPrices: sf.collection,
};
