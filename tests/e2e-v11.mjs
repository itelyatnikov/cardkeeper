// v1.1 checks: camera overlay + crop mapping (fake camera stream), rating, groups, migration.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4173/';
const shots = 'screenshots';
const log = (...a) => console.log('[v11]', ...a);
let fails = 0;
const check = (c, m) => { log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const b64 = (f) => 'data:image/jpeg;base64,' + readFileSync(f).toString('base64');

// Fake camera: a canvas stream; once the app publishes the guide rect (in video px),
// the card is drawn exactly inside it on a wood-ish background.
function fakeCam({ w, h, card }) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = new Image(); img.src = card;
  setInterval(() => {
    ctx.fillStyle = '#6b4a2f'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 9) { ctx.fillStyle = y % 18 ? '#7a5636' : '#5e4029'; ctx.fillRect(0, y, w, 4); }
    const r = window.__ckGuideVideoRect;
    if (r && img.complete) ctx.drawImage(img, r.x, r.y, r.w, r.h);
  }, 50);
  navigator.mediaDevices.getUserMedia = async () => c.captureStream(20);
}

async function cameraRun(name, file, cam, expect, shot) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ctx.addInitScript(fakeCam, { ...cam, card: b64(file) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror', e.message));
  await page.goto(BASE + '?tab=scan');
  await page.getByRole('button', { name: /Scan with camera/ }).click();
  await page.waitForFunction(() => !!window.__ckGuideVideoRect);
  await page.waitForTimeout(600);
  const g = await page.getByTestId('cam-guide').boundingBox();
  const band = await page.getByTestId('cam-band').boundingBox();
  check(Math.abs(g.width / g.height - 63 / 88) < 0.01, `${name}: guide aspect ${(g.width / g.height).toFixed(3)} (card 0.716)`);
  check(band.y > g.y && band.y + band.height < g.y + g.height * 0.13 && band.x > g.x && band.x + band.width < g.x + g.width * 0.8,
    `${name}: name band inside top of card (top ${(100 * (band.y - g.y) / g.height).toFixed(1)}%–${(100 * (band.y + band.height - g.y) / g.height).toFixed(1)}%)`);
  if (shot) await page.screenshot({ path: `${shots}/${shot}` });
  await page.getByTestId('shutter').click();
  await page.getByTestId('match').waitFor({ timeout: 120000 });
  const got = await page.getByTestId('match').locator('h2').textContent();
  check(got === expect, `${name}: camera capture recognized "${got}"`);
  const crop = await page.evaluate(() => window.__ckLastCrop);
  writeFileSync(`/tmp/crop-${name}.jpg`, Buffer.from(crop.split(',')[1], 'base64'));
  return { ctx, page };
}

// 1) portrait stream (typical phone) + overlay screenshot
const p1 = await cameraRun('portrait1080x1920', 'tests/images/LightningBolt.jpg', { w: 1080, h: 1920 }, 'Lightning Bolt', '10-scan-overlay.png');
// 2) landscape stream on a portrait screen (object-fit: cover crops the sides)
const p2 = await cameraRun('landscape1920x1080', 'tests/images/SheoldredtheApocalypse.jpg', { w: 1920, h: 1080 }, 'Sheoldred, the Apocalypse');
await p2.ctx.close();

// 3) rating on scan confirmation
const page = p1.page;
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
const rating = await page.getByTestId('rating').innerText();
check(/\d+\s*\/10/.test(rating) && /Deck rating/.test(rating), `rating on scan screen: ${rating.split('\n').slice(0, 3).join(' | ')}`);
await page.screenshot({ path: `${shots}/11-scan-match-rating.png` });

// 4) groups: Zion seeded; rename / add / delete
const chips = await page.locator('.card-box').first().locator('.chip').allTextContents();
check(chips.includes('Zion'), `Zion in owner chips: ${chips.join(', ')}`);
await page.locator('.card-box').first().getByRole('button', { name: 'Zion', exact: true }).click();
await page.getByTestId('add-btn').click();
await page.getByTestId('match').waitFor({ state: 'detached' });
await page.getByTestId('edit-groups').click();
await page.getByPlaceholder('New group (e.g. Trade binder)').fill('Trade binder');
await page.getByRole('button', { name: '＋ Add' }).click();
const zionRow = page.getByTestId('group-list').locator('li', { hasText: 'Zion' });
await zionRow.getByRole('button', { name: /Rename/ }).click();
await page.getByLabel('New name for Zion').fill('Zion R');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(2700);
await page.screenshot({ path: `${shots}/12-groups-manager.png` });
const listTxt = await page.getByTestId('group-list').innerText();
check(/Zion R/.test(listTxt) && /Trade binder/.test(listTxt), 'add + rename shown in list');
// delete Trade binder
await page.getByRole('button', { name: 'Delete Trade binder' }).click();
await page.getByTestId('confirm-delete-group').click();
await page.waitForTimeout(300);
check(!/Trade binder/.test(await page.getByTestId('group-list').innerText()), 'delete group');
await page.getByLabel('Close').first().click();
// renamed tag carried over to the card
await page.getByTestId('tab-collection').click();
await page.locator('.chips.scroll-x').getByRole('button', { name: 'Zion R', exact: true }).click();
check((await page.getByTestId('coll-summary').textContent()).startsWith('1 cards'), 'card tagged Zion followed the rename');
// rename back
await page.getByTestId('edit-groups').click();
await page.getByTestId('group-list').locator('li', { hasText: 'Zion R' }).getByRole('button', { name: /Rename/ }).click();
await page.getByLabel('New name for Zion R').fill('Zion');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(300);
await page.getByLabel('Close').first().click();

// 5) card detail with rating + sort by rating
await page.locator('.chips.scroll-x').getByRole('button', { name: 'Everyone' }).click();
await page.getByLabel('Sort').selectOption('rating');
await page.locator('.grid-card').first().click();
await page.getByTestId('rating').locator('summary').click();
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
await page.waitForTimeout(2700);
await page.locator('.sheet-body').evaluate((el) => (el.scrollTop = el.querySelector('[data-testid=rating]').offsetTop - 260));
await page.screenshot({ path: `${shots}/13-card-detail-rating.png` });
check(await page.getByTestId('rating').isVisible(), 'rating in card detail');
await p1.ctx.close();

// 6) migration: simulate a v1 install (groups Ari/Max, no schemaVersion) -> Zion added
const mctx = await browser.newContext();
const mp = await mctx.newPage();
await mp.goto(BASE);
await mp.getByTestId('tab-collection').waitFor();
await mp.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('cardkeeper');
  r.onsuccess = () => { const tx = r.result.transaction('meta', 'readwrite'); const s = tx.objectStore('meta'); s.put(['Ari', 'Max', 'Trade'], 'groups'); s.delete('schemaVersion'); tx.oncomplete = () => { r.result.close(); res(); }; };
}));
await mp.reload();
await mp.getByTestId('tab-collection').waitFor();
const mchips = await mp.locator('.chips.scroll-x .chip').allTextContents();
check(mchips.includes('Zion') && mchips.includes('Trade'), `migration v1->v2 adds Zion, keeps custom groups: ${mchips.join(', ')}`);
await mp.goto(BASE + '?tab=settings');
log('version shown:', await mp.getByTestId('app-version').textContent());
await mctx.close();

await browser.close();
log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
