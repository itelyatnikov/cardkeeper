// v1.2 checks: lands section, favorites (+persist, +migration), single-select owners, sort buttons (+persist).
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:4173/';
const shots = 'screenshots';
const log = (...a) => console.log('[v12]', ...a);
let fails = 0;
const check = (c, m) => { log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', (e) => log('pageerror', e.message));
await page.goto(BASE + '?tab=scan');

const ownerChip = (n) => page.locator('.card-box').first().getByRole('button', { name: n, exact: true });
const pressed = async () => {
  const out = [];
  for (const n of ['Ari', 'Max', 'Zion']) if ((await ownerChip(n).getAttribute('aria-pressed')) === 'true') out.push(n);
  return out;
};
await ownerChip('Max').click();
await ownerChip('Ari').click();
check(JSON.stringify(await pressed()) === '["Ari"]', `scan owner chips single-select: ${await pressed()}`);

async function add(name, owner) {
  await ownerChip(owner).click();
  await page.getByPlaceholder('Type a card name…').fill(name);
  await page.locator('.suggest button', { hasText: new RegExp(`^${name}$`) }).first().click();
  await page.getByTestId('match').waitFor();
  await page.getByTestId('add-btn').click();
  await page.getByTestId('match').waitFor({ state: 'detached' });
}
for (const [n, o] of [['Sheoldred, the Apocalypse', 'Ari'], ['Llanowar Elves', 'Ari'], ['Counterspell', 'Max'], ['Sacred Foundry', 'Ari'], ['Command Tower', 'Max'], ['Forest', 'Ari'], ['Lightning Bolt', 'Max']]) await add(n, o);
await page.screenshot({ path: `${shots}/21-owner-single-select.png` });

await page.getByTestId('tab-collection').click();
await page.getByLabel('Toggle view').click(); // list view for readable names
const names = async (sec) => (await page.getByTestId(`section-${sec}`).locator('li b').allTextContents()).map((t) => t.replace(/^\d+× /, ''));
const spells = await names('Spells'), lands = await names('Lands');
check(lands.length === 3 && ['Sacred Foundry', 'Command Tower', 'Forest'].every((l) => lands.includes(l)) && !spells.some((x) => lands.includes(x)), `lands section separate: Lands=[${lands}]`);
check(spells[0] === 'Sheoldred, the Apocalypse', `default sort = rarity, mythic first: [${spells}]`);
check((await page.getByTestId('sort-buttons').locator('[aria-pressed=true]').textContent()).includes('Rarity'), 'Rarity button active by default');

// favorite a common -> pinned first
await page.getByTestId('section-Spells').locator('li', { hasText: 'Llanowar Elves' }).getByTestId('fav-star').click();
await page.waitForTimeout(300);
check((await names('Spells'))[0] === 'Llanowar Elves', `favorite pinned first: [${await names('Spells')}]`);
// price sort
await page.getByTestId('sort-buttons').getByRole('button', { name: /Price/ }).click();
const ps = await names('Spells');
check(ps[0] === 'Llanowar Elves' && ps[1] === 'Sheoldred, the Apocalypse', `price sort keeps favorite pinned, then priciest: [${ps}]`);
// Favorites sort
await page.getByTestId('sort-buttons').getByRole('button', { name: /Favorites/ }).click();
check((await names('Spells'))[0] === 'Llanowar Elves', 'favorites sort: favorite first');
await page.getByTestId('sort-buttons').getByRole('button', { name: /Price/ }).click();
// owner filter single-select
await page.locator('.chips.scroll-x').getByRole('button', { name: 'Ari', exact: true }).click();
await page.locator('.chips.scroll-x').getByRole('button', { name: 'Max', exact: true }).click();
const on = await page.locator('.chips.scroll-x .chip.on').allTextContents();
check(JSON.stringify(on) === '["Max"]', `collection owner filter single-select: ${on}`);
check((await page.getByTestId('coll-summary').textContent()).startsWith('3 cards'), `Max filter shows Max cards: ${await page.getByTestId('coll-summary').textContent()}`);
await page.locator('.chips.scroll-x').getByRole('button', { name: 'Everyone' }).click();
await page.getByLabel('Toggle view').click(); // back to grid
// favorite a land too, for the screenshot
await page.getByTestId('section-Lands').locator('.grid-card', { has: page.getByAltText('Sacred Foundry') }).getByTestId('fav-star').click();
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
await page.waitForTimeout(2700);
await page.screenshot({ path: `${shots}/20-collection-sort-fav-lands.png`, fullPage: true });

// persistence across reload
await page.reload();
await page.getByTestId('tab-collection').click();
check((await page.getByTestId('sort-buttons').locator('[aria-pressed=true]').textContent()).includes('Price'), 'sort choice remembered after reload');
const favs = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('cardkeeper'); r.onsuccess = () => { const q = r.result.transaction('collection').objectStore('collection').getAll(); q.onsuccess = () => { res(q.result.map((e) => e.favorite)); r.result.close(); }; }; }));
check(favs.filter(Boolean).length === 2 && favs.every((f) => typeof f === 'boolean'), `favorites persisted in IndexedDB: ${favs}`);
// card detail star
await page.locator('.grid-card').first().locator('.tile').click();
check(await page.locator('.sheet').getByTestId('fav-star').isVisible(), 'star in card detail');
await page.getByLabel('Close').first().click();

// migration v2 -> v3: entries without favorite get favorite=false
await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('cardkeeper'); r.onsuccess = () => { const tx = r.result.transaction(['collection', 'meta'], 'readwrite'); const c = tx.objectStore('collection'); const q = c.getAll(); q.onsuccess = () => { for (const e of q.result) { delete e.favorite; c.put(e); } tx.objectStore('meta').put(2, 'schemaVersion'); }; tx.oncomplete = () => { r.result.close(); res(); }; }; }));
await page.reload();
await page.getByTestId('tab-collection').waitFor();
await page.waitForTimeout(500);
const mig = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('cardkeeper'); r.onsuccess = () => { const q = r.result.transaction('collection').objectStore('collection').getAll(); q.onsuccess = () => { res(q.result.map((e) => e.favorite)); r.result.close(); }; }; }));
check(mig.every((f) => f === false), `migration sets favorite=false: ${mig}`);
await page.goto(BASE + '?tab=settings');
log('version:', await page.getByTestId('app-version').textContent());
await browser.close();
log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
