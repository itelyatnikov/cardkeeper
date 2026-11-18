import { useStore } from '../lib/store';
import { db, exportAll, importAll, type Backup } from '../lib/db';
import { GroupsManager } from './Groups';
import { games } from '../games';

export function Settings() {
  const { reload, toast } = useStore();

  async function doExport() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `cardkeeper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'CardKeeper backup' });
        return;
      } catch {
        /* fall back to download */
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }

  async function doImport(f: File | undefined, mode: 'merge' | 'replace') {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as Backup;
      await importAll(data, mode);
      await reload();
      toast(`Imported ${data.collection?.length ?? 0} entries`);
    } catch (e: any) {
      toast(`Import failed: ${e.message}`);
    }
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      <section className="card-box">
        <h3>Owners / groups</h3>
        <GroupsManager />
      </section>

      <section className="card-box">
        <h3>Backup & share</h3>
        <p className="muted">Your cards are stored only on this device. Export a backup file to keep it safe or to move cards to another phone.</p>
        <div className="row gap wrap">
          <button className="btn primary" onClick={doExport}>
            ⬇️ Export backup
          </button>
          <label className="btn">
            ⬆️ Import (merge)
            <input type="file" accept="application/json,.json" hidden onChange={(e) => doImport(e.target.files?.[0], 'merge')} />
          </label>
          <label className="btn ghost">
            Import (replace)
            <input type="file" accept="application/json,.json" hidden onChange={(e) => confirm('Replace ALL cards and decks on this device?') && doImport(e.target.files?.[0], 'replace')} />
          </label>
        </div>
      </section>

      <section className="card-box">
        <h3>Games</h3>
        {Object.values(games).map((g) => (
          <p key={g.id}>
            {g.available ? '✅' : '⏳'} {g.name}
          </p>
        ))}
      </section>

      <section className="card-box">
        <h3>About</h3>
        <p className="small" data-testid="app-version">
          CardKeeper v{__APP_VERSION__} <span className="muted">(build {__APP_BUILD__})</span>
        </p>
        <p className="muted small">
          Card data, images and prices © Scryfall / Wizards of the Coast. This app is unofficial fan content. Card recognition runs on your phone (Tesseract OCR).
        </p>
        <button
          className="btn small danger"
          onClick={async () => {
            if (!confirm('Erase ALL cards, decks and settings on this device?')) return;
            const d = await db();
            await Promise.all(['cards', 'collection', 'decks', 'meta'].map((s) => d.clear(s as any)));
            await reload();
          }}
        >
          Erase all data
        </button>
      </section>
    </div>
  );
}
