// Geometry shared by the camera overlay and the OCR crop, so what the user
// sees outlined is exactly what gets read.

/** MTG cards are 63 × 88 mm (portrait). */
export const CARD_ASPECT = 63 / 88; // width / height ≈ 0.716

/**
 * Name bar, as fractions of the card (measured on Scryfall scans of modern
 * frames, with a little slack for hand-held framing). Ends before the mana
 * cost on the right.
 */
export const NAME_BAND = { x: 0.05, y: 0.035, w: 0.72, h: 0.08 } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largest card-shaped rect that fits in the box (CSS px), centered, with margins. */
export function fitCardRect(boxW: number, boxH: number, pad = { top: 24, bottom: 140, side: 20 }): Rect {
  const availW = Math.max(50, boxW - pad.side * 2);
  const availH = Math.max(50, boxH - pad.top - pad.bottom);
  let w = availW;
  let h = w / CARD_ASPECT;
  if (h > availH) {
    h = availH;
    w = h * CARD_ASPECT;
  }
  return { x: (boxW - w) / 2, y: pad.top + (availH - h) / 2, w, h };
}

/**
 * Map a rect in the <video> element's CSS box to source video pixels, for
 * `object-fit: cover` (video scaled to fill, overflow cropped, centered).
 * CSS px vs device pixels doesn't matter: both sides are in CSS px, and
 * videoWidth/videoHeight are already the displayed (rotation-applied) stream size.
 */
export function cssRectToVideo(r: Rect, elW: number, elH: number, videoW: number, videoH: number): Rect {
  const scale = Math.max(elW / videoW, elH / videoH);
  const offX = (elW - videoW * scale) / 2;
  const offY = (elH - videoH * scale) / 2;
  const x = (r.x - offX) / scale;
  const y = (r.y - offY) / scale;
  const w = r.w / scale;
  const h = r.h / scale;
  // clamp to the frame
  const cx = Math.max(0, x), cy = Math.max(0, y);
  return { x: cx, y: cy, w: Math.min(videoW - cx, w - (cx - x)), h: Math.min(videoH - cy, h - (cy - y)) };
}

/** Sub-rect of a card rect (fractions → absolute). */
export const bandOf = (card: Rect, b: { x: number; y: number; w: number; h: number } = NAME_BAND): Rect => ({
  x: card.x + card.w * b.x,
  y: card.y + card.h * b.y,
  w: card.w * b.w,
  h: card.h * b.h,
});
