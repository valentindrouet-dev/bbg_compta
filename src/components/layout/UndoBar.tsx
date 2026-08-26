import { Undo2, Redo2 } from 'lucide-react';
import { useStore } from '../../store';

/**
 * Boutons d'annulation flottants — doublent les raccourcis Cmd+Z / Ctrl+Z.
 * Ils n'apparaissent que lorsqu'il y a quelque chose à annuler.
 */
export function UndoBar() {
  const undoDepth = useStore(s => s.undoDepth);
  const redoDepth = useStore(s => s.redoDepth);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);

  if (!undoDepth && !redoDepth) return null;

  const btn = (actif: boolean) => ({
    padding: '6px 9px',
    color: actif ? 'var(--bbg-purple-darker)' : '#c4bcdd',
    cursor: actif ? 'pointer' : 'default',
  });

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex items-center rounded-lg shadow-md border bg-white text-sm"
      style={{ borderColor: 'var(--bbg-border)' }}
    >
      <button
        type="button" style={btn(undoDepth > 0)} disabled={!undoDepth} onClick={undo}
        title={`Annuler la dernière action (${undoDepth} disponible${undoDepth > 1 ? 's' : ''}) — Cmd/Ctrl + Z`}
        className="inline-flex items-center gap-1 rounded-l-lg hover:bg-[#f4f1fb] disabled:hover:bg-transparent"
      >
        <Undo2 size={15} /> Annuler
        {undoDepth > 0 && (
          <span className="text-[10px] px-1.5 rounded-full"
            style={{ backgroundColor: 'var(--bbg-purple-light)' }}>{undoDepth}</span>
        )}
      </button>
      <span className="w-px h-5" style={{ background: 'var(--bbg-border-soft)' }} />
      <button
        type="button" style={btn(redoDepth > 0)} disabled={!redoDepth} onClick={redo}
        title="Rétablir — Cmd/Ctrl + Maj + Z"
        className="inline-flex items-center gap-1 rounded-r-lg hover:bg-[#f4f1fb] disabled:hover:bg-transparent"
      >
        <Redo2 size={15} />
      </button>
    </div>
  );
}
