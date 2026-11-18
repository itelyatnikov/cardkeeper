import { useState } from 'react';
import { useStore } from '../lib/store';
import { db, exportAll, importAll, getAllEntries, putEntry, type Backup } from '../lib/db';
import { games } from '../games';

export function Settings() {
  const { groups, setGroups, reload, toast, rows } = useStore();
  const [newG, setNewG] = useState('');

  async function addGroup() {
    const g = newG.trim();
    if (!g || groups.includes(g)) return;
    await setGroups([...groups, g]);
    setNewG('');
  }
  async function renameGroup(old: string) {
    const n = prompt(`Rename “${old}” to:`, old)?.trim();
    if (!n || n === old) return;
    await setGroups(groups.map((g) => (g === old ? n : g)));
    for (const e of await getAllEntries()) if (e.owners.includes(old)) await putEntry({ ...e, owners: e.owners.map((o) => (o === old ? n : o)) });
    await reload();
  }
  async function removeGroup(g: string) {
    if (!confirm(`Delete group “${g}”? Cards stay in the collection, just without this owner.`)) return;
    await setGroups(groups.filter((x) => x !== g));
    for (const e of await getAllEntries()) if (e.owners.includes(g)) await putEntry({ ...e, owners: e.owners.filter((o) => o !== g) });
    await reload();
  }

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
        <ul className="group-list">
          {groups.map((g) => (
            <li key={g}>
              <span className="grow">
                {g} <small className="muted">({rows.filter((r) => r.entry.owners.includes(g)).reduce((a, r) => a + r.entry.qty, 0)} cards)</small>
              </span>
              <button className="btn small" onClick={() => renameGroup(g)}>
                Rename
              </button>
              <button className="btn small danger" onClick={() => removeGroup(g)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
        <div className="row gap">
          <input className="grow" value={newG} onChange={(e) => setNewG(e.target.value)} placeholder="New group (e.g. Trade binder)" onKeyDown={(e) => e.key === 'Enter' && addGroup()} />
          <button className="btn primary" onClick={addGroup}>
            Add
          </button>
        </div>
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
