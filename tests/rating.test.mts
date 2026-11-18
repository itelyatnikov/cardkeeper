import { collectionByName } from '../src/games/mtg/scryfall.ts';
import { rateCard } from '../src/games/mtg/rating.ts';
const names = ['Lightning Bolt', 'Sol Ring', 'Llanowar Elves', 'Counterspell', 'Sheoldred, the Apocalypse', 'Wrath of God', 'Grizzly Bears', 'Hill Giant', 'Demonic Tutor', 'Rhystic Study', 'Wall of Wood', 'Island', 'Sacred Foundry', 'Guul Draz Overseer', 'Colossal Dreadmaw', 'Divination', 'Serra Angel', 'Storm Crow'];
const cards = await collectionByName(names);
for (const c of cards) { const r = rateCard(c); console.log(`${String(r.score).padStart(2)} ${r.grade} ${r.label.padEnd(10)} ${c.name.padEnd(28)} ${r.reason} | C: ${r.commander} | 60: ${r.constructed}`); }
