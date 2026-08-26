import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Paperclip, FileCheck2, X, Bold, Italic, AlignLeft, AlignCenter, AlignRight, RotateCcw, Palette } from 'lucide-react';
import type { ColFormat } from '../../store';
import { euros, r2, parseMontant } from '../../utils/money';
import { MOIS_NOMS } from '../../utils/dates';
import { saveFile, openFile, deleteFile } from '../../utils/files';

/** Style CSS d'une colonne à partir de sa mise en forme enregistrée. */
export function colStyle(f?: ColFormat): CSSProperties {
  return {
    fontWeight: f?.bold ? 700 : undefined,
    fontStyle: f?.italic ? 'italic' : undefined,
    color: f?.color || undefined,
    textAlign: f?.align,
  };
}

// ----- Date : affichage « 26 août », sélecteur au clic --------------------

/** « 2026-08-26 » -> « 26 août » (année ajoutée si différente de l'an courant). */
export function labelDateCourt(iso: string, anneeRef?: number): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '—';
  const [y, m, d] = iso.split('-').map(Number);
  const base = `${d} ${MOIS_NOMS[m - 1]}`;
  return anneeRef != null && y !== anneeRef ? `${base} ${String(y).slice(2)}` : base;
}

export function DateCell({ value, anneeRef, onCommit, style }: {
  value: string; anneeRef?: number; onCommit: (v: string) => void; style?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      try { (ref.current as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* picker indisponible */ }
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref} type="date" value={value} style={style}
        onChange={ev => ev.target.value && onCommit(ev.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === 'Escape') setEditing(false); }}
      />
    );
  }
  return (
    <button
      type="button"
      className="w-full text-left px-1 py-[3px] rounded border border-transparent hover:border-[#c9c0e4] hover:bg-white"
      style={style}
      title={value}
      onClick={() => setEditing(true)}
    >
      {labelDateCourt(value, anneeRef)}
    </button>
  );
}

// ----- Montant : « 11,11 € » au repos, chiffre brut en édition ------------

export function MoneyCell({ value, onCommit, disabled, style }: {
  value: number; onCommit: (v: number | null) => void; disabled?: boolean; style?: CSSProperties;
}) {
  const [text, setText] = useState<string | null>(null);
  const enEdition = text !== null;
  return (
    <input
      className="num" inputMode="decimal" disabled={disabled}
      style={style}
      value={enEdition ? text : euros(value)}
      onFocus={ev => {
        setText(String(r2(value)).replace('.', ','));
        const el = ev.target;
        setTimeout(() => el.select(), 0);
      }}
      onChange={ev => setText(ev.target.value)}
      onBlur={() => {
        if (text !== null) { onCommit(text.trim() === '' ? 0 : parseMontant(text)); setText(null); }
      }}
      onKeyDown={ev => {
        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
        if (ev.key === 'Escape') { setText(null); (ev.target as HTMLInputElement).blur(); }
      }}
    />
  );
}

// ----- Fournisseur : complétion automatique -------------------------------

/**
 * Saisie avec complétion : taper « G » propose « Gamefound », la fin proposée
 * étant sélectionnée. → , Entrée ou Tab acceptent ; Retour arrière refuse.
 */
export function AutoCompleteCell({ value, options, onCommit, style, placeholder }: {
  value: string; options: string[]; onCommit: (v: string) => void;
  style?: CSSProperties; placeholder?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const derniereTouche = useRef<string>('');

  function completer(saisie: string) {
    if (!saisie) return null;
    const bas = saisie.toLowerCase();
    return options.find(o => o.toLowerCase().startsWith(bas) && o.length > saisie.length) ?? null;
  }

  return (
    <input
      ref={ref}
      value={text ?? value}
      style={style}
      placeholder={placeholder}
      autoComplete="off"
      onKeyDown={ev => {
        derniereTouche.current = ev.key;
        const el = ev.currentTarget;
        const aUneSuggestion = el.selectionStart !== el.selectionEnd;
        if (aUneSuggestion && (ev.key === 'ArrowRight' || ev.key === 'Enter' || ev.key === 'Tab')) {
          // Accepte la proposition : curseur en fin de champ.
          el.setSelectionRange(el.value.length, el.value.length);
          if (ev.key === 'ArrowRight') ev.preventDefault();
        }
        if (ev.key === 'Enter') el.blur();
        if (ev.key === 'Escape') { setText(null); el.blur(); }
      }}
      onChange={ev => {
        const saisie = ev.target.value;
        const efface = derniereTouche.current === 'Backspace' || derniereTouche.current === 'Delete';
        const suggestion = efface ? null : completer(saisie);
        if (suggestion) {
          setText(suggestion);
          requestAnimationFrame(() => ref.current?.setSelectionRange(saisie.length, suggestion.length));
        } else {
          setText(saisie);
        }
      }}
      onBlur={() => { if (text !== null) { onCommit(text.trim()); setText(null); } }}
    />
  );
}

// ----- Justificatif : nom + fichier joint ---------------------------------

export function FactureCell({ nom, fileId, onNom, onFileId, style }: {
  nom: string; fileId?: string;
  onNom: (v: string) => void; onFileId: (id: string | undefined, nom?: string) => void;
  style?: CSSProperties;
}) {
  const [text, setText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function attacher(file: File) {
    const stored = await saveFile(file);
    onFileId(stored.id, file.name);
  }

  return (
    <div className="flex items-center gap-0.5">
      <input
        className="min-w-0 flex-1"
        style={style}
        value={text ?? nom}
        title={nom}
        onChange={ev => setText(ev.target.value)}
        onBlur={() => { if (text !== null) { onNom(text); setText(null); } }}
        onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
      />
      <input
        ref={inputRef} type="file" className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,image/*,application/pdf"
        onChange={ev => { const f = ev.target.files?.[0]; if (f) attacher(f); ev.target.value = ''; }}
      />
      {fileId ? (
        <span className="flex items-center shrink-0">
          <button
            type="button" title="Ouvrir le justificatif"
            style={{ color: 'var(--bbg-green-dark)' }}
            onClick={async ev => {
              ev.stopPropagation();
              const ok = await openFile(fileId);
              if (!ok) alert('Fichier introuvable : il a peut-être été supprimé du navigateur.');
            }}
          >
            <FileCheck2 size={14} />
          </button>
          <button
            type="button" title="Détacher le fichier"
            style={{ color: '#c9c0e4' }}
            onClick={async ev => {
              ev.stopPropagation();
              if (confirm('Détacher (et supprimer) ce justificatif ?')) {
                await deleteFile(fileId);
                onFileId(undefined);
              }
            }}
          >
            <X size={12} />
          </button>
        </span>
      ) : (
        <button
          type="button" title="Joindre une facture (PDF ou image)"
          className="shrink-0" style={{ color: '#a99ad6' }}
          onClick={ev => { ev.stopPropagation(); inputRef.current?.click(); }}
        >
          <Paperclip size={13} />
        </button>
      )}
    </div>
  );
}

// ----- Menu de mise en forme d'une colonne --------------------------------

const COULEURS: { nom: string; hex: string }[] = [
  { nom: 'Par défaut', hex: '' },
  { nom: 'Violet', hex: '#674ea7' },
  { nom: 'Vert', hex: '#38761d' },
  { nom: 'Orange', hex: '#b45f06' },
  { nom: 'Rouge', hex: '#b7332e' },
  { nom: 'Gris', hex: '#6f6690' },
  { nom: 'Noir', hex: '#111111' },
];

export function ColFormatMenu({ col, format, onChange, onReset }: {
  col: string; format?: ColFormat;
  onChange: (patch: ColFormat) => void; onReset: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    function clic(ev: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setOuvert(false);
    }
    document.addEventListener('mousedown', clic);
    return () => document.removeEventListener('mousedown', clic);
  }, [ouvert]);

  const btn = (actif: boolean | undefined) => ({
    padding: '3px 6px', borderRadius: 4,
    background: actif ? 'var(--bbg-purple-light)' : 'transparent',
    color: actif ? 'var(--bbg-purple-darker)' : '#5c5280',
  });

  return (
    <span className="relative inline-flex" ref={boxRef}>
      <button
        type="button"
        title={`Mise en forme de la colonne « ${col} »`}
        className="opacity-50 hover:opacity-100 px-0.5"
        onClick={ev => { ev.stopPropagation(); setOuvert(o => !o); }}
      >
        <Palette size={12} />
      </button>
      {ouvert && (
        <div
          className="absolute right-0 top-6 z-50 bg-white rounded-md shadow-lg border p-2 text-sm font-normal"
          style={{ borderColor: 'var(--bbg-border)', color: '#3f3268', width: 210 }}
          onClick={ev => ev.stopPropagation()}
        >
          <div className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: '#9a92b5' }}>
            Colonne « {col} »
          </div>
          <div className="flex items-center gap-1 mb-2">
            <button type="button" style={btn(format?.bold)} title="Gras"
              onClick={() => onChange({ bold: !format?.bold })}><Bold size={14} /></button>
            <button type="button" style={btn(format?.italic)} title="Italique"
              onClick={() => onChange({ italic: !format?.italic })}><Italic size={14} /></button>
            <span className="w-px h-5 mx-1" style={{ background: 'var(--bbg-border-soft)' }} />
            <button type="button" style={btn(format?.align === 'left')} title="Aligné à gauche"
              onClick={() => onChange({ align: 'left' })}><AlignLeft size={14} /></button>
            <button type="button" style={btn(format?.align === 'center')} title="Centré"
              onClick={() => onChange({ align: 'center' })}><AlignCenter size={14} /></button>
            <button type="button" style={btn(format?.align === 'right')} title="Aligné à droite"
              onClick={() => onChange({ align: 'right' })}><AlignRight size={14} /></button>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {COULEURS.map(c => (
              <button
                key={c.nom} type="button" title={c.nom}
                className="w-6 h-6 rounded border flex items-center justify-center text-[10px]"
                style={{
                  borderColor: (format?.color ?? '') === c.hex ? 'var(--bbg-purple-dark)' : 'var(--bbg-border-soft)',
                  backgroundColor: c.hex || '#fff',
                  color: c.hex ? '#fff' : '#9a92b5',
                  borderWidth: (format?.color ?? '') === c.hex ? 2 : 1,
                }}
                onClick={() => onChange({ color: c.hex })}
              >
                {c.hex ? '' : 'A'}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="w-full inline-flex items-center justify-center gap-1 py-1 rounded hover:bg-[#f4f1fb] text-xs"
            style={{ color: '#6f6690' }}
            onClick={() => { onReset(); setOuvert(false); }}
          >
            <RotateCcw size={12} /> Réinitialiser
          </button>
        </div>
      )}
    </span>
  );
}
