import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:4173/'); await p.getByTestId('tab-scan').click(); await p.waitForTimeout(2000);
await p.screenshot({ path: '/tmp/chk.png' });
console.log(await p.locator('main').innerText());
await b.close();
