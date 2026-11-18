import { createWorker, PSM, type Worker } from 'tesseract.js';

let workerP: Promise<Worker> | null = null;
function getWorker() {
  if (!workerP)
    workerP = (async () => {
      const w = await createWorker('eng');
      await w.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',-.:! ",
      });
      return w;
    })();
  return workerP;
}
/** Start downloading the OCR engine early (it's ~10MB the first time, cached afterwards). */
export const warmUpOcr = () => getWorker().catch(() => undefined);

export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not load image'));
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
  });
}

/** Crop a region (fractions of the image) and preprocess it for OCR. */
function cropCanvas(img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, invert = false) {
  const sx = img.width * x, sy = img.height * y, sw = img.width * w, sh = img.height * h;
  const targetW = 1400;
  const scale = targetW / sw;
  const c = document.createElement('canvas');
  c.width = targetW;
  c.height = Math.max(40, Math.round(sh * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  // grayscale + contrast stretch
  let min = 255, max = 0;
  const g = new Uint8ClampedArray(p.length / 4);
  for (let i = 0; i < g.length; i++) {
    const v = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
    g[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  let sum = 0;
  for (let i = 0; i < g.length; i++) sum += g[i];
  const mean = sum / g.length;
  // Dark title bars (e.g. black frames) -> invert so text is dark on light.
  const shouldInvert = invert || mean < 110;
  for (let i = 0; i < g.length; i++) {
    let v = ((g[i] - min) / range) * 255;
    if (shouldInvert) v = 255 - v;
    p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

export interface OcrResult {
  candidates: string[]; // cleaned lines, best first
  raw: string;
  debugCrop?: string; // data URL of the first crop (to show the user what was read)
}

const clean = (s: string) =>
  s
    .replace(/[^A-Za-z',\-:! ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // drop 1-2 letter junk at the ends (mana symbols read as letters)
    .replace(/^(\S{1,2} )+/, '')
    .replace(/( \S{1,2})+$/, '')
    .trim();

type Region = [number, number, number, number];

async function ocrRegion(img: any, r: Region, psm: PSM) {
  const w = await getWorker();
  await w.setParameters({ tessedit_pageseg_mode: psm });
  const c = cropCanvas(img, ...r);
  const { data } = await w.recognize(c, {}, { text: true, blocks: true });
  return { data, canvas: c };
}

/** Group confident words into visual lines (top to bottom). */
function linesFromBlocks(data: any, minConf: number): { text: string; y: number; h: number; conf: number }[] {
  const words: { text: string; x: number; y: number; h: number; conf: number }[] = [];
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines)
        for (const wd of l.words)
          if (wd.confidence >= minConf && wd.text.replace(/[^A-Za-z]/g, '').length >= 2)
            words.push({ text: wd.text, x: wd.bbox.x0, y: (wd.bbox.y0 + wd.bbox.y1) / 2, h: wd.bbox.y1 - wd.bbox.y0, conf: wd.confidence });
  words.sort((a, b) => a.y - b.y);
  const lines: { ws: typeof words }[] = [];
  for (const wd of words) {
    const ln = lines.find((l) => Math.abs(l.ws[0].y - wd.y) < Math.max(l.ws[0].h, wd.h) * 0.6);
    if (ln) ln.ws.push(wd);
    else lines.push({ ws: [wd] });
  }
  return lines.map((l) => {
    const ws = l.ws.sort((a, b) => a.x - b.x);
    return {
      text: ws.map((w) => w.text).join(' '),
      y: ws[0].y,
      h: Math.max(...ws.map((w) => w.h)),
      conf: ws.reduce((a, w) => a + w.conf, 0) / ws.length,
    };
  });
}

/**
 * Read the card name. `framed` = the image is already cropped to the card
 * (camera guide or a tight photo). Otherwise we look for text lines anywhere
 * in the photo, top to bottom (the title is the first line on a card).
 */
export async function readCardTitle(img: HTMLImageElement | HTMLCanvasElement, framed: boolean): Promise<OcrResult> {
  const out: string[] = [];
  const push = (l: string) => {
    const c = clean(l);
    if (c.replace(/[^A-Za-z]/g, '').length >= 3 && !out.includes(c)) out.push(c);
  };
  let raw = '';
  // 1) Title bar assuming the card fills the image.
  const title = await ocrRegion(img, [0.04, 0.025, 0.74, 0.085], PSM.SINGLE_BLOCK);
  const debugCrop = title.canvas.toDataURL('image/jpeg', 0.7);
  raw += title.data.text + '\n';
  if ((title.data.confidence ?? 0) >= (framed ? 45 : 70)) push(title.data.text);
  if (framed && out.length && (title.data.confidence ?? 0) > 75) return { candidates: out, raw, debugCrop };
  // 2) Upper part of the card/photo, sparse text, confident lines top-down.
  const regions: Region[] = framed ? [[0.0, 0.0, 1.0, 0.2]] : [[0.0, 0.0, 1.0, 0.5], [0.0, 0.0, 1.0, 1.0]];
  for (const r of regions) {
    const { data } = await ocrRegion(img, r, PSM.SPARSE_TEXT);
    raw += data.text + '\n';
    for (const l of linesFromBlocks(data, 55)) push(l.text);
    if (out.length >= 2) break;
  }
  if (!out.length && title.data.text.trim()) push(title.data.text);
  return { candidates: out.slice(0, 6), raw, debugCrop };
}

// Debug/test hook: window.__ckOcr(url, framed)
if (typeof window !== 'undefined')
  (window as any).__ckOcr = async (url: string, framed = false) => readCardTitle(await loadImage(url), framed);
