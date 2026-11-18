import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto('http://localhost:4173/?tab=scan');
for (const f of process.argv.slice(2)) {
  await page.getByTestId('file-input').setInputFiles(f);
  await page.locator('.status:not(.busy)').waitFor({ timeout: 120000 });
  console.log(f, '|', await page.locator('.status').textContent(), '| chips:', await page.locator('.chips button.chip').allTextContents());
  await page.screenshot({ path: '/tmp/ocrdbg.png', fullPage: true });
}
await browser.close();
