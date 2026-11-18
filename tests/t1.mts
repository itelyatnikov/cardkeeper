import { generateDeck, validateDeck, deckStats, type DeckOptions } from '../src/games/mtg/deckgen.ts';
const cfg = JSON.parse(process.argv[2]) as DeckOptions;
const d = await generateDeck({ difficulty: 'expert', pool: 'any', ownerGroup: '__all__', ...cfg }, []);
const st = deckStats(d);
console.log(d.name, '| total', st.total, '| issues', validateDeck(d), '| cmd', d.commander?.name);
console.log(d.cards.map((c) => `${c.qty} ${c.name} [${c.role}]`).join('; '));
console.log('curve', st.curve.join(','), 'roles', JSON.stringify(st.roles), 'cost $' + st.fullCost.toFixed(2), 'avgMv', st.avgMv.toFixed(2));
