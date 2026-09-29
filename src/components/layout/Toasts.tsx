import { CheckCircle2, Info, X } from 'lucide-react';
import { fermerToast, useToasts } from '../../utils/toast';

/**
 * Les confirmations, en pastilles au-dessus de la page — la même forme que les
 * bandeaux de la chronologie. Elles vivent dans le dock du bas : rien dans la
 * page ne bouge quand un message arrive ou s'en va. Un clic les congédie ;
 * sinon elles s'effacent toutes seules au bout de cinq secondes.
 *
 * La zone d'annonce reste en place même vide : un lecteur d'écran n'annonce
 * de façon fiable que ce qui arrive dans une zone qu'il connaît déjà.
 */
export function Toasts() {
  const messages = useToasts();

  return (
    <div className="flex flex-col items-center gap-2" role="status" aria-live="polite">
      {messages.map(m => {
        const ok = m.ton === 'ok';
        const Icone = ok ? CheckCircle2 : Info;
        return (
          <button
            key={m.id}
            type="button"
            title="Masquer ce message"
            onClick={() => fermerToast(m.id)}
            className="toast pointer-events-auto max-w-[34rem] px-4 py-2 rounded-full border shadow-lg
              flex items-center gap-2.5 text-sm text-left"
            style={ok
              ? { backgroundColor: '#e9f3ea', borderColor: '#9cc9a4', color: '#2c5d16' }
              : { backgroundColor: '#fff', borderColor: 'var(--bbg-border)', color: 'var(--bbg-purple-darker)' }}
          >
            <Icone size={15} className="shrink-0" />
            <span className="truncate">{m.texte}</span>
            <X size={13} className="shrink-0 opacity-50" />
          </button>
        );
      })}
    </div>
  );
}
