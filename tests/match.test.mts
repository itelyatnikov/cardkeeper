import { evidence } from '../src/lib/match.ts';
const raw1 = 'Lightning\nLig\nhtnin\nS Bolt\nLightning Bolt de\nals damage to any target';
for (const n of ['Lightning Bolt', 'Lightning', 'Bolt', 'Lightning Strike']) console.log(n, evidence(n, raw1));
const raw2 = 'te Apocalypse\nSheoldred, t\nSheol\ndred, La: Apocalypse\nDeathtouch\nWhenever you draw a card';
for (const n of ['Sheoldred, the Apocalypse', 'Sheoldred', 'Apocalypse']) console.log(n, evidence(n, raw2));
