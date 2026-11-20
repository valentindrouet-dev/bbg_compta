import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, Check, FileText, Lock } from 'lucide-react';
import { useStore } from '../../store';
import { PageHeader } from '../ui';
import { donneesBilan, PROJET, type LigneBilan, type Verdict } from '../../utils/bilan';
import { euros } from '../../utils/money';
import { openFile } from '../../utils/files';
import { toast } from '../../utils/toast';
import { useEtatVue } from '../../utils/etatVue';

/** « 1 234,56 » : dans le tableau, l'unité est portée par l'en-tête. */
const nombre = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n2 = (x: number | null) => x == null ? '—' : nombre.format(x);

/**
 * Le bilan du premier exercice, prêt pour le rendez-vous avec l'expert-comptable :
 * le projet Exponens rapproché en direct des données de l'app, les réponses
 * déjà trouvées et les questions à poser. Rien ici ne modifie les données ;
 * seules les cases cochées sont retenues, comme un réglage d'affichage.
 */
export function BilanPage() {
  const entries = useStore(s => s.entries);
  const finances = useStore(s => s.finances);
  const placements = useStore(s => s.placements);
  const referentiels = useStore(s => s.referentiels);
  const tresoManuel = useStore(s => s.tresoManuel);
  const documentsSociete = useStore(s => s.documentsSociete);
  const d = useMemo(
    () => donneesBilan({ entries, finances, placements, referentiels, tresoManuel, documentsSociete }),
    [entries, finances, placements, referentiels, tresoManuel, documentsSociete],
  );
  const [coches, setCoches] = useEtatVue<string[]>('bilan.coches', [], v => Array.isArray(v));

  const ecartInfo = d.groupes.flatMap(g => g.lignes).find(l => l.id === 'informatique')?.ecart ?? 0;
  const fraisDev = PROJET.fraisDev.reduce((s, f) => s + f.montant, 0);

  const questions: { id: string; texte: ReactNode }[] = [
    { id: 'dev', texte: <>Frais de dév. <b>{n2(fraisDev)} €</b> (app {n2(d.fraisDevApp)}) : contenu ? amortis quand ?</> },
    { id: 'ca', texte: <>CA <b>{n2(PROJET.ca)} €</b> : notes de frais ARTFX incluses ?</> },
    ...(Math.abs(d.tvaRemboursEnghien) > 0.02 ? [{
      id: 'tva-rembours',
      texte: <>Enghien en 467 sans TVA : j'aligne l'app (<b>{n2(d.tvaRemboursEnghien)} €</b> de TVA) ?</>,
    }] : []),
    { id: 'credit-tva', texte: <>Crédit de TVA <b>{n2(PROJET.creditTVA)} €</b> : remboursement ou report ?</> },
    { id: 'urssaf', texte: <>URSSAF <b>{n2(PROJET.urssafARecevoir)} €</b> à recevoir, <b>{n2(PROJET.urssafAPayer)} €</b> à payer : quoi ?</> },
    { id: 'fnp', texte: <>Factures non parvenues <b>{n2(PROJET.fnp)} €</b> : lesquelles ?</> },
    { id: 'precompte', texte: <>Précompte droits d'auteur <b>{n2(PROJET.precompteDA)} €</b> : qui paie, quand ?</> },
    ...(Math.abs(ecartInfo) > 0.02 ? [{
      id: 'info',
      texte: <>Informatique <b>{ecartInfo > 0 ? '−' : '+'}{n2(Math.abs(ecartInfo))} €</b> chez Exponens : l'Amazon du 06/01 ?</>,
    }] : []),
    { id: 'cca', texte: <>CCA : conventions réglementées à l'AG ? IFU ? rythme annuel ?</> },
    { id: 'cc-val', texte: <>CC Valentin <b>{n2(PROJET.ccValentin)} €</b>, BNP <b>{n2(PROJET.bnp)} €</b> : détail ? e-facture BNP ?</> },
    { id: 'suite', texte: <>Suite : liasse, AG, greffe — qui fait quoi ? honoraires ?</> },
  ];
  const faites = questions.filter(q => coches.includes(q.id)).length;
  const basculer = (id: string) =>
    setCoches(prec => prec.includes(id) ? prec.filter(x => x !== id) : [...prec, id]);

  async function ouvrir(fileId: string) {
    if (!(await openFile(fileId))) toast('Fichier introuvable sur cet ordinateur', 'info');
  }

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Bilan 2025-26"
        subtitle="Projet Exponens du 17/11/2026, rapproché en direct de ton journal"
        aCoteDuTitre={
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ backgroundColor: 'var(--bbg-lavender-2)', color: 'var(--bbg-purple-dark)' }}
            title="Cette page lit les données ; elle n'en modifie aucune"
          >
            <Lock size={11} /> Lecture seule
          </span>
        }
        actions={d.pieces.map(p => (
          <button
            key={p.libelle}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm border bg-white text-[#3f3268] hover:bg-[#f4f1fb] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--bbg-border)' }}
            disabled={!p.fileId}
            title={p.fileId ? p.aide : `${p.aide} — pas encore dans l'app (page Documents)`}
            onClick={() => p.fileId && void ouvrir(p.fileId)}
          >
            <FileText size={14} /> {p.libelle}
          </button>
        ))}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
        <Chiffre label="Résultat" valeur={PROJET.resultat} sous="pas d'IS · perte reportable" ton="bad" />
        <Chiffre label="Chiffre d'affaires" valeur={PROJET.ca} sous="prestations HT (706)" />
        <Chiffre label="Capitaux propres" valeur={PROJET.capitauxPropres} sous="> ½ capital : rien à faire" ton="good" />
        <Chiffre label="Disponibilités" valeur={PROJET.disponibilites} sous="Qonto, BNP, CAT, intérêts" />
        <Chiffre label="Total bilan" valeur={PROJET.totalBilan} sous="actif = passif" />
      </div>

      <div className="grid grid-cols-1 min-[1400px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 items-start">
        <div className="space-y-3">
          <Bloc titre="Exponens ↔ BBG Compta" droite={<Legende />}>
            <table className="sheet text-[13px] leading-tight table-fixed">
              <colgroup>
                <col style={{ width: 166 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 80 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Poste</th>
                  <th>Compte</th>
                  <th className="num">Exponens €</th>
                  <th className="num">App €</th>
                  <th className="num">Écart</th>
                  <th>Constat</th>
                </tr>
              </thead>
              {d.groupes.map(g => (
                <tbody key={g.titre}>
                  <tr>
                    <td colSpan={6} className="!bg-[var(--bbg-purple-light)] text-[11px] uppercase tracking-wide font-semibold"
                      style={{ color: 'var(--bbg-purple-darker)' }}>
                      {g.titre}
                    </td>
                  </tr>
                  {g.lignes.map(l => <LigneTableau key={l.id} l={l} />)}
                </tbody>
              ))}
            </table>
          </Bloc>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-[11px] uppercase tracking-wide font-semibold mr-1" style={{ color: '#6f6690' }}>Ensuite</span>
            {[
              ['Liasse', 'fin déc. 2026'],
              ['IS', '0 € au 15/01/2027'],
              ['AG', 'avant le 31/03/2027'],
              ['Greffe', '1 mois après l\'AG'],
            ].map(([quoi, quand]) => (
              <span key={quoi} className="px-2 py-0.5 rounded-md border bg-white whitespace-nowrap" style={{ borderColor: 'var(--bbg-border-soft)' }}>
                <b className="text-[#3f3268]">{quoi}</b> <span className="text-[#6f6690]">· {quand}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Bloc titre="Réponses prêtes">
            <ul className="space-y-2 text-[13px] text-[#3f3268]">
              <Reponse titre="467100 ne s'équilibre pas">
                Manque l'<b>Airbnb du 21/05/2026 : 467,80 €</b>. Avec lui : {n2(PROJET.fraisEnghien)} − {n2(PROJET.remboursEnghien)}
                {' '}= <b>{n2(PROJET.fraisEnghien - PROJET.remboursEnghien)} €</b> restent à BBG.
                {d.airbnb?.factureFileId && (
                  <button className="ml-1 underline text-[var(--bbg-purple-dark)]"
                    onClick={() => void ouvrir(d.airbnb!.factureFileId!)}>justificatif</button>
                )}
              </Reponse>
              <Reponse titre={`Intérêts du CCA : ${euros(PROJET.interetsCCA)}`}>
                Convention signée, <b>2 %/an</b> capitalisés : 100 000 × 2 % × 371/360
                = <b>{n2(PROJET.interetsCCA)} €</b>, déductibles.
              </Reponse>
              <Reponse titre={`Cotisations : ${euros(PROJET.cotisations)} (app ${euros(d.cotisations.app)})`}>
                {n2(d.cotisations.app)} − {n2(d.cotisations.per)} PER − {n2(d.cotisations.tropPercu)} trop-perçu
                − {n2(PROJET.urssafARecevoir)} à recevoir + {n2(PROJET.urssafAPayer)} à payer = <b>{n2(d.cotisations.net)} €</b>
                {Math.abs(d.cotisations.net - PROJET.cotisations) <= 0.02 && (
                  <Check size={13} className="inline ml-1 text-[var(--bbg-green-dark)]" />
                )}
              </Reponse>
            </ul>
          </Bloc>

          <Bloc
            titre="Questions à poser"
            droite={
              <span className="flex items-center gap-2 text-xs text-[#6f6690]">
                {faites}/{questions.length}
                {faites > 0 && (
                  <button className="underline hover:text-[#3f3268]" onClick={() => setCoches([])}>décocher</button>
                )}
              </span>
            }
          >
            <ol className="space-y-1 text-[13px]">
              {questions.map((q, i) => {
                const fait = coches.includes(q.id);
                return (
                  <li key={q.id}>
                    <label className={`flex items-start gap-2 cursor-pointer ${fait ? 'text-[#9a92b5] line-through' : 'text-[#3f3268]'}`}>
                      <input type="checkbox" className="mt-[3px] accent-[#674ea7]" checked={fait} onChange={() => basculer(q.id)} />
                      <span><span className="text-[#9a92b5] tabular-nums">{i + 1}.</span> {q.texte}</span>
                    </label>
                  </li>
                );
              })}
            </ol>
          </Bloc>

        </div>
      </div>
    </div>
  );
}

function Chiffre({ label, valeur, sous, ton }: {
  label: string; valeur: number; sous: string; ton?: 'good' | 'bad';
}) {
  const couleur = ton === 'good' ? 'var(--bbg-green-dark)' : ton === 'bad' ? '#b7332e' : 'var(--bbg-purple-darker)';
  const rail = ton === 'good' ? 'var(--bbg-green)' : ton === 'bad' ? '#e8a9a5' : 'var(--bbg-purple)';
  return (
    <div className="bg-white rounded-lg shadow-sm border px-3 py-2"
      style={{ borderColor: 'var(--bbg-border-soft)', borderLeft: `4px solid ${rail}` }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: '#6f6690' }}>{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight" style={{ color: couleur }}>{euros(valeur)}</div>
      <div className="text-[11px]" style={{ color: '#8d85a6' }}>{sous}</div>
    </div>
  );
}

function Bloc({ titre, droite, children }: { titre: string; droite?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border" style={{ borderColor: 'var(--bbg-border-soft)' }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b rounded-t-lg"
        style={{ backgroundColor: 'var(--bbg-lavender)', borderColor: 'var(--bbg-border-soft)' }}>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--bbg-purple-darker)' }}>{titre}</h2>
        {droite}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Reponse({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <li className="pl-2.5 border-l-[3px]" style={{ borderColor: 'var(--bbg-green)' }}>
      <div className="font-semibold">{titre}</div>
      <div className="text-[#5c5280]">{children}</div>
    </li>
  );
}

const STYLE_VERDICT: Record<Verdict, { couleur: string; icone: ReactNode; titre: string }> = {
  ok: { couleur: 'var(--bbg-green-dark)', icone: <Check size={14} />, titre: 'Identique' },
  explique: { couleur: 'var(--bbg-purple-dark)', icone: <span className="font-bold leading-none">≈</span>, titre: 'Écart expliqué' },
  ecart: { couleur: 'var(--bbg-orange-dark)', icone: <AlertTriangle size={13} />, titre: 'Écart à poser' },
};

function Legende() {
  return (
    <span className="flex items-center gap-3 text-[11px] text-[#6f6690]">
      {(Object.keys(STYLE_VERDICT) as Verdict[]).map(v => (
        <span key={v} className="inline-flex items-center gap-1" style={{ color: STYLE_VERDICT[v].couleur }}>
          {STYLE_VERDICT[v].icone}<span className="text-[#6f6690]">{STYLE_VERDICT[v].titre.toLowerCase()}</span>
        </span>
      ))}
    </span>
  );
}

function LigneTableau({ l }: { l: LigneBilan }) {
  const v = STYLE_VERDICT[l.verdict];
  const ecart = l.ecart == null ? '—'
    : Math.abs(l.ecart) <= 0.02 ? '' : `${l.ecart > 0 ? '+' : ''}${n2(l.ecart)}`;
  return (
    <tr>
      <td className="truncate" title={l.poste}>{l.poste}</td>
      <td className="text-[#8d85a6] tabular-nums">{l.compte}</td>
      <td className="text-right tabular-nums">{n2(l.exponens)}</td>
      <td className="text-right tabular-nums">{n2(l.app)}</td>
      <td className="text-right tabular-nums font-semibold" style={{ color: l.verdict === 'ok' ? undefined : v.couleur }}>{ecart}</td>
      <td title={[v.titre, l.note, l.detail].filter(Boolean).join(' — ')}>
        <div className="flex items-center gap-1.5 min-w-0" style={{ color: v.couleur }}>
          <span className="shrink-0 inline-flex">{v.icone}</span>
          {l.note && <span className="text-[12px] text-[#6f6690] truncate">{l.note}</span>}
        </div>
      </td>
    </tr>
  );
}
