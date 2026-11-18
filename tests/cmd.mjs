import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })).newPage();
page.on('console', (m) => console.log('console', m.type(), m.text()));
page.on('requestfailed', (r) => console.log('reqfail', r.url(), r.failure()?.errorText));
await page.goto('http://localhost:4173/?tab=decks');
await page.getByRole('button', { name: /Build a new deck/ }).click();
await page.getByRole('button', { name: 'Commander 100' }).click();
await page.getByRole('button', { name: /Tokens/ }).click();
await page.getByRole('button', { name: 'G', exact: true }).click();
await page.getByRole('button', { name: '🧠 Expert' }).click();
await page.getByRole('button', { name: 'Any cards' }).click();
await page.screenshot({ path: '/tmp/cmd1.png', fullPage: true });
const t0 = Date.now();
await page.getByTestId('build-btn').click();
try { await page.getByTestId('deck-name').waitFor({ timeout: 90000 }); console.log('OK', Date.now() - t0, await page.getByTestId('deck-name').textContent()); }
catch { console.log('timeout; error box:', await page.locator('.error').allTextContents()); await page.screenshot({ path: '/tmp/cmd2.png', fullPage: true }); }
await browser.close();
