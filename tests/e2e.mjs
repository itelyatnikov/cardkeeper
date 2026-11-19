// End-to-end check at a phone viewport using system Chrome.
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:4173/';
const shots = 'screenshots';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
const log = (...a) => console.log('[e2e]', ...a);

await page.goto(BASE);
await page.getByTestId('tab-scan').click();

async function scan(file, owner, expect) {
  if (owner) {
    // select only this owner
    for (const g of ['Ari', 'Max']) {
      const chip = page.locator('section').first().getByRole('button', { name: g, exact: true });
      const pressed = (await chip.getAttribute('aria-pressed')) === 'true';
      if ((g === owner) !== pressed) await chip.click();
    }
  }
  const t0 = Date.now();
  await page.getByTestId('file-input').setInputFiles(file);
  const res = await Promise.race([
    page.getByTestId('match').waitFor({ timeout: 120000 }).then(() => 'match'),
    page.locator('.status:not(.busy)').filter({ hasText: /Not sure|Couldn't|wrong/ }).waitFor({ timeout: 120000 }).then(() => 'nomatch'),
  ]);
  const status = await page.locator('.status').textContent();
  if (res !== 'match') {
    log('NO MATCH', file, status);
    return false;
  }
  const name = await page.getByTestId('match').locator('h2').textContent();
  log(`OCR ${file} -> "${name}" (${Date.now() - t0}ms) ${name === expect ? 'OK' : 'MISMATCH'} | ${status}`);
  return name === expect;
}

async function addCard() {
  await page.getByTestId('add-btn').click();
  await page.getByTestId('match').waitFor({ state: 'detached' });
}
const results = {};
results.bolt = await scan('tests/images/LightningBolt.jpg', 'Ari', 'Lightning Bolt');
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
await page.screenshot({ path: `${shots}/02-scan-match.png` });
await addCard();
results.elves = await scan('tests/images/LlanowarElves.jpg', 'Max', 'Llanowar Elves');
await addCard();
results.photoBolt = await scan('tests/images/photo_LightningBolt.jpg', 'Max', 'Lightning Bolt');
if (results.photoBolt) await addCard();
results.photoSheoldred = await scan('tests/images/photo_SheoldredtheApocalypse.jpg', 'Ari', 'Sheoldred, the Apocalypse');
if (results.photoSheoldred) {
  // mark foil + qty 2 for value test
  await page.getByRole('button', { name: '✨ Foil' }).first().click();
  await page.getByRole('button', { name: 'More' }).first().click();
  await addCard();
}
results.counterspell = await scan('tests/images/Counterspell.jpg', 'Ari', 'Counterspell');
await addCard();

// manual add by typing
await page.getByPlaceholder('Type a card name…').fill('Llanowar Elv');
await page.waitForSelector('.suggest button');
await page.locator('.suggest button').first().click();
await page.getByTestId('match').waitFor();
await addCard();
log('manual add OK');

await page.getByTestId('tab-collection').click();
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
await page.waitForTimeout(2600);
log('collection:', await page.getByTestId('coll-summary').textContent());
await page.screenshot({ path: `${shots}/01-collection.png` });
// filter by owner Max
await page.locator('.chips.scroll-x').getByRole('button', { name: 'Max', exact: true }).click();
log('Max filter:', await page.getByTestId('coll-summary').textContent());
await page.locator('.chips.scroll-x').getByRole('button', { name: 'Everyone' }).click();
await page.getByTestId('sort-buttons').getByRole('button', { name: /Price/ }).click();
await page.locator('.grid-card .tile').first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}/03-card-detail.png` });
await page.getByLabel('Close').click();

await page.getByTestId('tab-value').click();
log('value before refresh:', await page.getByTestId('total-value').textContent());
await page.getByRole('button', { name: /Refresh prices/ }).click();
await page.getByText(/Updated prices for/).waitFor({ timeout: 30000 });
log('value after refresh:', await page.getByTestId('total-value').textContent(), '|', await page.locator('text=Last updated').textContent());
await page.waitForTimeout(2600);
await page.screenshot({ path: `${shots}/04-value.png`, fullPage: true });

// Deck builder: casual red aggro owned+missing
await page.getByTestId('tab-decks').click();
await page.getByRole('button', { name: /Build a new deck/ }).click();
await page.screenshot({ path: `${shots}/05-deck-builder.png`, fullPage: true });
await page.getByRole('button', { name: /Aggro/ }).click();
await page.getByTestId('build-btn').click();
await page.getByTestId('deck-name').waitFor({ timeout: 120000 });
log('deck:', await page.getByTestId('deck-name').textContent(), await page.getByTestId('deck-total').textContent(), 'valid:', await page.getByTestId('deck-valid').count(), 'missing $', await page.getByTestId('missing-cost').textContent());
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/06-deck-view.png` });
await page.screenshot({ path: `${shots}/07-deck-view-full.png`, fullPage: true });
// swap a card
await page.locator('.deck-list button').first().click();
await page.locator('.sheet .grid-card').first().click();
log('swap OK, total now', await page.getByTestId('deck-total').textContent());
await page.getByTestId('save-deck').click();
await page.getByRole('button', { name: '← Decks' }).click();
await page.locator('.list li').first().waitFor();
log('saved decks:', await page.locator('.list li').count());

// Commander via UI (suggested commander)
await page.getByRole('button', { name: /Build a new deck/ }).click();
await page.getByRole('button', { name: 'Commander 100' }).click();
await page.getByRole('button', { name: /Tokens/ }).click();
await page.getByRole('button', { name: 'G', exact: true }).click(); // add green to red
await page.getByRole('button', { name: '🧠 Expert' }).click();
await page.getByRole('button', { name: 'Any cards' }).click();
await page.getByTestId('build-btn').click();
await page.getByTestId('deck-name').waitFor({ timeout: 180000 }).catch(async (e) => {
  await page.screenshot({ path: '/tmp/cmd-fail.png', fullPage: true });
  log('cmd build failed; errors:', await page.locator('.error').allTextContents());
  throw e;
});
log('cmd deck:', await page.getByTestId('deck-name').textContent(), await page.getByTestId('deck-total').textContent(), 'valid:', await page.getByTestId('deck-valid').count());
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/08-commander-deck.png` });

log('results', JSON.stringify(results));
log('errors', errors.length ? errors : 'none');
await browser.close();
