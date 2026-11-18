import { useEffect, useRef, useState } from 'react';
import type { CardData, Finish } from '../games/types';
import { useStore } from '../lib/store';
import { addToCollection, deleteEntry, getAllEntries, putEntry } from '../lib/db';
import { loadImage, readCardTitle, warmUpOcr } from '../lib/ocr';
import { resolveCandidates } from '../lib/match';
import { mtgAdapter } from '../games/mtg/adapter';
import { Chips, NameSearch, Sheet, Stepper } from './ui';
import { EditGroupsButton } from './Groups';
import { RatingBadge } from './Rating';
import { fmtUsd, unitUsd } from '../lib/price';
import { bandOf, CARD_ASPECT, cssRectToVideo, fitCardRect } from '../lib/cameraGeometry';

type Recent = { key: string; name: string; qty: number; img: string };

export function Scan() {
  const { groups, reload, toast } = useStore();
  const [owners, setOwners] = useState<string[]>(groups.slice(0, 1));
  const [finish, setFinish] = useState<Finish>('nonfoil');
  const [qty, setQty] = useState(1);
  const [match, setMatch] = useState<CardData | null>(null);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [ocrLines, setOcrLines] = useState<string[]>([]);
  const [crop, setCrop] = useState<string | undefined>();
  const [camera, setCamera] = useState(false);
  const [prints, setPrints] = useState<CardData[] | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!owners.length && groups.length) setOwners([groups[0]]);
  }, [groups]); // eslint-disable-line

  async function recognize(img: HTMLImageElement | HTMLCanvasElement, framed: boolean) {
    setBusy(true);
    setMatch(null);
    setOcrLines([]);
    try {
      setStatus('Reading the card name…');
      let r = await readCardTitle(img, framed);
      let best = r.candidates.length ? await resolveCandidates(r.candidates, r.raw) : null;
      if (!best && framed) {
        // Maybe the card doesn't fill the picture: search the whole image.
        setStatus('Looking harder…');
        const r2 = await readCardTitle(img, false);
        const b2 = r2.candidates.length ? await resolveCandidates(r2.candidates, r.raw + '\n' + r2.raw) : null;
        r = { ...r2, candidates: [...new Set([...r.candidates, ...r2.candidates])] };
        best = b2;
      }
      setCrop(r.debugCrop);
      setOcrLines(r.candidates);
      if (best) {
        setMatch(best.card);
        setFinish('nonfoil');
        setStatus(`Found it! (read “${best.line}”)`);
      } else if (!r.candidates.length) setStatus("Couldn't read any text. Try again closer, with less glare — or type the name below.");
      else setStatus('Not sure which card that is. Tap a guess below or type the name.');
    } catch (e: any) {
      setStatus(`Something went wrong: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    const img = await loadImage(f);
    const ratio = img.height / img.width;
    await recognize(img, ratio > 1.3 && ratio < 1.5);
  }

  async function pickName(name: string) {
    setBusy(true);
    setStatus('Looking up…');
    const c = await mtgAdapter.findByName(name).catch(() => null);
    setBusy(false);
    if (c) {
      setMatch(c);
      setFinish('nonfoil');
      setStatus('');
    } else setStatus(`No card found for “${name}”`);
  }

  async function add() {
    if (!match) return;
    const e = await addToCollection(match, qty, finish, owners);
    setRecent((r) => [{ key: e.key, name: match.name, qty, img: match.imageSmall }, ...r].slice(0, 20));
    await reload();
    toast(`Added ${qty}× ${match.name}${owners.length ? ` to ${owners.join(' + ')}` : ''}`);
    setMatch(null);
    setQty(1);
    setStatus('Ready for the next card!');
    setCrop(undefined);
    setOcrLines([]);
  }

  async function undo(r: Recent) {
    const e = (await getAllEntries()).find((x) => x.key === r.key);
    if (e) {
      e.qty -= r.qty;
      if (e.qty <= 0) await deleteEntry(e.key);
      else await putEntry(e);
    }
    setRecent((x) => x.filter((y) => y !== r));
    await reload();
  }

  return (
    <div className="page">
      <h1>Scan cards</h1>
      <section className="card-box">
        <label className="lbl">Whose cards?</label>
        <div className="chips">
          <Chips options={groups.map((g) => ({ id: g, label: g }))} value={owners} onChange={setOwners} multi />
          <EditGroupsButton />
        </div>
        <div className="row gap">
          <Chips<Finish>
            options={[
              { id: 'nonfoil', label: 'Normal' },
              { id: 'foil', label: '✨ Foil' },
              { id: 'etched', label: 'Etched' },
            ]}
            value={[finish]}
            onChange={(v) => setFinish(v[0])}
          />
        </div>
      </section>

      <div className="big-actions">
        <button
          className="btn primary big"
          onClick={() => {
            warmUpOcr();
            setCamera(true);
          }}
          disabled={busy}
        >
          📷 Scan with camera
        </button>
        <button className="btn big" onClick={() => fileRef.current?.click()} disabled={busy}>
          🖼️ Photo / upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          data-testid="file-input"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {status && <p className={`status ${busy ? 'busy' : ''}`}>{busy && <span className="spinner" />} {status}</p>}
      {crop && !match && <img src={crop} className="ocr-crop" alt="What the scanner read" />}
      {!match && ocrLines.length > 0 && (
        <div className="chips">
          {ocrLines.map((l) => (
            <button key={l} className="chip" onClick={() => pickName(l)}>
              {l}?
            </button>
          ))}
        </div>
      )}

      {match && (
        <section className="match card-box" data-testid="match">
          <img src={match.image} alt={match.name} className="match-img" />
          <div className="match-info">
            <h2>{match.name}</h2>
            <p className="muted">
              {match.setName} ({match.set.toUpperCase()}) #{match.collectorNumber} · {match.rarity}
            </p>
            <RatingBadge card={match} />
            <p className="price-line">
              {fmtUsd(unitUsd(match, finish))} {finish !== 'nonfoil' ? finish : ''} each
            </p>
            <div className="row gap wrap">
              <Stepper value={qty} onChange={setQty} />
              <button className="btn primary" onClick={add} data-testid="add-btn">
                ✅ Add {qty}
              </button>
            </div>
            <div className="row gap wrap">
              <button className="btn small" onClick={async () => setPrints(await mtgAdapter.printings(match))}>
                Different set / art
              </button>
              <button className="btn small ghost" onClick={() => setMatch(null)}>
                ✕ Not it
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="card-box">
        <label className="lbl">Or add by name</label>
        <NameSearch onPick={pickName} />
      </section>

      {recent.length > 0 && (
        <section>
          <h3>Added this session ({recent.reduce((a, r) => a + r.qty, 0)})</h3>
          <ul className="recent">
            {recent.map((r) => (
              <li key={r.key + r.qty + r.name}>
                <img src={r.img} alt="" />
                <span>
                  {r.qty}× {r.name}
                </span>
                <button className="btn small ghost" onClick={() => undo(r)}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="tips">
        <summary>Scanning tips</summary>
        <ul>
          <li>Fill the frame with the card, title at the top.</li>
          <li>Good light, no glare on the name. Tilt slightly if shiny/foil.</li>
          <li>Hold steady for a second before tapping the shutter.</li>
          <li>If it guesses wrong, tap “Not it” and type the name.</li>
        </ul>
      </details>

      {camera && (
        <CameraView
          onClose={() => setCamera(false)}
          onCapture={(c) => {
            setCamera(false);
            recognize(c, true);
          }}
        />
      )}
      <Sheet open={!!prints} onClose={() => setPrints(null)} title="Pick the printing">
        <div className="grid">
          {prints?.map((p) => (
            <button
              key={p.id}
              className="grid-card"
              onClick={() => {
                setMatch(p);
                setPrints(null);
              }}
            >
              <img src={p.imageSmall} alt={p.name} loading="lazy" />
              <span className="cap">
                {p.set.toUpperCase()} #{p.collectorNumber}
                <br />
                {fmtUsd(unitUsd(p, finish))}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function CameraView({ onClose, onCapture }: { onClose: () => void; onCapture: (c: HTMLCanvasElement) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setReady(true);
      } catch (e: any) {
        setErr(
          e?.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access in your browser settings, or use “Photo / upload”.'
            : `Camera not available (${e?.message ?? e}). Use “Photo / upload” instead.`,
        );
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Track the on-screen box (rotation, browser bars, resize).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const upd = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Card guide in CSS px of the full-screen video box; the same rect is mapped
  // to video pixels for the crop (object-fit: cover math in cameraGeometry).
  const guide = fitCardRect(box.w, box.h, { top: 56, bottom: 150, side: 22 });
  const band = bandOf(guide);

  useEffect(() => {
    const v = videoRef.current;
    if (ready && v?.videoWidth) (window as any).__ckGuideVideoRect = cssRectToVideo(guide, box.w, box.h, v.videoWidth, v.videoHeight);
  });

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const r = cssRectToVideo(guide, box.w, box.h, v.videoWidth, v.videoHeight);
    const c = document.createElement('canvas');
    // keep the card's true aspect; upscale small crops a little for OCR
    const outW = Math.round(Math.max(r.w, 720));
    c.width = outW;
    c.height = Math.round(outW / CARD_ASPECT);
    c.getContext('2d')!.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    onCapture(c);
  }

  return (
    <div className="camera" ref={boxRef} data-testid="camera">
      <video ref={videoRef} playsInline muted autoPlay />
      {err ? (
        <p className="cam-err">{err}</p>
      ) : (
        <>
          <div className="cam-guide" data-testid="cam-guide" style={{ left: guide.x, top: guide.y, width: guide.w, height: guide.h }} />
          <div className="cam-title-zone" data-testid="cam-band" style={{ left: band.x, top: band.y, width: band.w, height: band.h }}>
          </div>
          <p className="cam-hint" style={{ top: Math.max(8, guide.y - 44) }}>
            Fit the card in the outline · name in the yellow box
          </p>
        </>
      )}
      <div className="cam-bar">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="shutter" onClick={capture} disabled={!ready} aria-label="Take picture" data-testid="shutter" />
        <span style={{ width: 80 }} />
      </div>
    </div>
  );
}
