import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
await page.goto('http://localhost:4173/');
for (const f of process.argv.slice(2)) {
  const r = await page.evaluate(async (f) => { const x = await window.__ckOcr('./' + f, false); delete x.debugCrop; return x; }, f);
  console.log(f, JSON.stringify(r));
}
await browser.close();
