import { useState } from 'react';
import { useStore } from '../lib/store';
import { deleteGroup, renameGroup, type DeleteGroupMode } from '../lib/db';
import { Sheet } from './ui';

/** Add / rename / delete owner groups (categories). */
export function GroupsManager() {
  const { groups, setGroups, rows, reload, toast } = useStore();
  const [newG, setNewG] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const count = (g: string) => rows.filter((r) => r.entry.owners.includes(g)).reduce((a, r) => a + r.entry.qty, 0);

  async function add() {
    const g = newG.trim();
    if (!g) return;
    if (groups.some((x) => x.toLowerCase() === g.toLowerCase())) return toast(`“${g}” already exists`);
    await setGroups([...groups, g]);
    setNewG('');
    toast(`Added ${g}`);
  }
  async function saveRename(old: string) {
    const n = editVal.trim();
    setEditing(null);
    if (!n || n === old) return;
    try {
      await renameGroup(old, n);
      await reload();
      toast(`Renamed ${old} → ${n}`);
    } catch (e: any) {
      toast(e.message);
    }
  }

  return (
    <div className="groups-mgr">
      <ul className="group-list" data-testid="group-list">
        {groups.map((g) => (
          <li key={g}>
            {editing === g ? (
              <>
                <input
                  className="grow"
                  value={editVal}
                  autoFocus
                  onChange={(e) => setEditVal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveRename(g)}
                  aria-label={`New name for ${g}`}
                />
                <button className="btn small primary" onClick={() => saveRename(g)}>
                  Save
                </button>
                <button className="btn small ghost" onClick={() => setEditing(null)}>
                  ✕
                </button>
              </>
            ) : (
              <>
                <span className="grow">
                  <b>{g}</b> <small className="muted">{count(g)} {count(g) === 1 ? 'card' : 'cards'}</small>
                </span>
                <button
                  className="btn small"
                  onClick={() => {
                    setEditing(g);
                    setEditVal(g);
                  }}
                >
                  ✏️ Rename
                </button>
                <button className="btn small danger" onClick={() => setDeleting(g)} aria-label={`Delete ${g}`}>
                  🗑️
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="row gap">
        <input className="grow" value={newG} onChange={(e) => setNewG(e.target.value)} placeholder="New group (e.g. Trade binder)" onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary" onClick={add}>
          ＋ Add
        </button>
      </div>
      {deleting && (
        <DeleteGroupSheet
          name={deleting}
          others={groups.filter((g) => g !== deleting)}
          tagged={count(deleting)}
          onClose={() => setDeleting(null)}
          onConfirm={async (mode) => {
            await deleteGroup(deleting, mode);
            await reload();
            toast(`Deleted ${deleting}`);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function DeleteGroupSheet({
  name,
  others,
  tagged,
  onClose,
  onConfirm,
}: {
  name: string;
  others: string[];
  tagged: number;
  onClose: () => void;
  onConfirm: (m: DeleteGroupMode) => void;
}) {
  const [kind, setKind] = useState<DeleteGroupMode['kind']>(others.length ? 'move' : 'untag');
  const [to, setTo] = useState(others[0] ?? '');
  return (
    <Sheet open onClose={onClose} title={`Delete “${name}”?`}>
      <p>{tagged ? `${tagged} cards are tagged ${name}. What should happen to them?` : `No cards are tagged ${name}.`}</p>
      {tagged > 0 && (
        <div className="radio-list">
          {others.length > 0 && (
            <label>
              <input type="radio" checked={kind === 'move'} onChange={() => setKind('move')} /> Move them to{' '}
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                {others.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <input type="radio" checked={kind === 'untag'} onChange={() => setKind('untag')} /> Keep the cards, just remove the “{name}” tag
          </label>
          <label>
            <input type="radio" checked={kind === 'delete-cards'} onChange={() => setKind('delete-cards')} /> Delete cards that only belong to {name}
          </label>
        </div>
      )}
      <div className="row gap" style={{ marginTop: 16 }}>
        <button className="btn danger" data-testid="confirm-delete-group" onClick={() => onConfirm(kind === 'move' ? { kind, to } : { kind } as DeleteGroupMode)}>
          Delete group
        </button>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

/** Small "edit groups" button that opens the manager in a sheet. */
export function EditGroupsButton({ label = '✏️ Edit' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="chip ghost-chip" onClick={() => setOpen(true)} data-testid="edit-groups">
        {label}
      </button>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Owner groups">
          <GroupsManager />
        </Sheet>
      )}
    </>
  );
}
