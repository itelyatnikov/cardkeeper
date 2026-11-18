import { fitCardRect, cssRectToVideo, CARD_ASPECT, bandOf } from '../src/lib/cameraGeometry.ts';
const ok = (c: boolean, m: string) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const near = (a: number, b: number, e = 0.5) => Math.abs(a - b) <= e;
// iPhone-ish viewport 390x844, portrait stream 1080x1920
const g = fitCardRect(390, 844);
ok(near(g.w / g.h, CARD_ASPECT, 0.001), `guide aspect ${(g.w / g.h).toFixed(3)}`);
ok(g.x >= 0 && g.x + g.w <= 390 && g.y >= 0 && g.y + g.h <= 844 - 100, `guide fits ${JSON.stringify(g)}`);
const v = cssRectToVideo(g, 390, 844, 1080, 1920);
// cover: scale = max(390/1080, 844/1920) = 0.4396 (height bound); offX = (390-474.75)/2
const s = Math.max(390 / 1080, 844 / 1920), offX = (390 - 1080 * s) / 2;
ok(near(v.x, (g.x - offX) / s) && near(v.w, g.w / s), `portrait map ${JSON.stringify(v)}`);
ok(near(v.w / v.h, CARD_ASPECT, 0.001), 'aspect preserved in video px');
// landscape stream 1920x1080 on portrait screen: heavy side crop
const v2 = cssRectToVideo(g, 390, 844, 1920, 1080);
ok(near(v2.w / v2.h, CARD_ASPECT, 0.01) && v2.x > 600, `landscape map ${JSON.stringify(v2)}`);
// round trip: map back the band
const b = bandOf(v);
ok(b.y > v.y && b.y + b.h < v.y + v.h * 0.2, `band in top of card ${JSON.stringify(b)}`);
