import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: offline support + auto-update. Each deploy stamps sw.js with
// a new build id; the new worker activates immediately (skipWaiting), and we
// reload into the new version (right away if the app is in the background,
// otherwise after the user taps "Update").
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        if (document.visibilityState === 'hidden') {
          reloading = true;
          location.reload();
        } else showUpdateBanner(() => {
          reloading = true;
          location.reload();
        });
      });
      const check = () => reg.update().catch(() => undefined);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, 30 * 60 * 1000);
    } catch {
      /* ignore */
    }
  });
}

function showUpdateBanner(onReload: () => void) {
  if (document.getElementById('ck-update')) return;
  const b = document.createElement('button');
  b.id = 'ck-update';
  b.className = 'update-banner';
  b.textContent = '✨ New version of CardKeeper — tap to update';
  b.onclick = onReload;
  document.body.appendChild(b);
}
