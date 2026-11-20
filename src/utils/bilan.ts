/**
 * Préparation du bilan du premier exercice (26/08/2025 → 30/09/2026).
 *
 * Les chiffres d'Exponens sont ceux du **projet de comptes** reçu le
 * 17/11/2026 : ils ne vivent pas dans les données de l'app, ce sont des
 * références figées. En face, chaque montant « BBG Compta » est recalculé à
 * chaque affichage depuis le journal, les mouvements financiers et les
 * placements — en lecture seule : rien ici n'écrit dans les données.
 */
import type { DocumentSociete, FinanceEntry, JournalEntry, Placement, Referentiels, TresoManuel } from '../types';
import { CATEGORIES_PERSONNEL_INITIALES, estImmobilisation, estPersonnel } from './blocs';
import { dotationDuMois, immoInfos, moisTresorerie, tableauTreso } from './calc';
import { moisCourant, moisExercice } from './dates';
import { r2 } from './money';
import { echeancePlacement, gainReel, remunerationAttendue } from './placements';
import { normalise } from './previsionnel';

export const EXERCICE_BILAN = '2025-26';
export const CLOTURE = '2026-09-30';

/** Le projet de comptes Exponens au 30/09/2026, poste par poste. */
export const PROJET = {
  recuLe: '2026-11-17',
  resultat: -55.10,
  ca: 22425.12,
  totalBilan: 115531.10,
  capitauxPropres: 9944.90,
  disponibilites: 92291.69,
  qonto: 11325.61,
  bnp: 104.80,
  cat: 79800,
  interetsCourus: 1061.28,
  fraisDev: [
    { jeu: 'EDIT', compte: '203001', montant: 3100 },
    { jeu: 'TORNADICE', compte: '203002', montant: 1216.75 },
    { jeu: 'CAMINO', compte: '203003', montant: 1770.35 },
  ],
  travaux: 10310.95,
  informatique: 2951.40,
  mobilier: 142.49,
  dotations: 1826.12,
  creanceClient: 2725.81,
  capital: 10000,
  cca: 100000,
  interetsCCA: 2061.11,
  ccValentin: 138.35,
  cotisations: 1035,
  creditTVA: 1262,
  urssafARecevoir: 780,
  urssafAPayer: 387,
  fnp: 1680,
  precompteDA: 428.28,
  /** 467100 : frais ARTFX Enghien listés par Exponens, et ce qu'il manque. */
  fraisEnghien: 2023.95,
  remboursEnghien: 1978.57,
} as const;

/**
 * Ce qui a été décidé au rendez-vous avec Exponens le 20/11/2026 : la trace
 * définitive du point sur le projet de comptes.
 */
export const RDV_EXPONENS = {
  date: '2026-11-20',
  decisions: [
    {
      titre: 'Indemnités kilométriques au 01/01/2027',
      detail: 'au lieu des factures d\'essence · relevé des trajets',
    },
    {
      titre: 'Factures Gamefound et Kickstarter',
      detail: 'de vraies factures, plus de captures d\'écran',
    },
    {
      titre: 'Crédit de TVA de 1 262 € reporté',
      detail: 'pas de remboursement demandé',
    },
  ],
  /** Questions tranchées pendant le rendez-vous, et leur réponse. */
  reponses: { 'credit-tva': 'reporté' } as Record<string, string>,
} as const;

/** Taux et base de la convention de compte courant MDR Conseil. */
export const TAUX_CCA = 0.02;
export const BASE_JOURS_CCA = 360;

/** ✓ identique · ≈ écart compris (la note dit pourquoi) · ! écart à poser. */
export type Verdict = 'ok' | 'explique' | 'ecart';

export interface LigneBilan {
  id: string;
  poste: string;
  compte: string;
  exponens: number;
  /** Montant recalculé depuis l'app ; null quand l'app n'a rien d'équivalent. */
  app: number | null;
  ecart: number | null;
  verdict: Verdict;
  note?: string;
  /** Le détail du constat, en info-bulle. */
  detail?: string;
}

export interface GroupeBilan { titre: string; lignes: LigneBilan[] }

/** Une pièce à ouvrir pendant le rendez-vous, retrouvée dans l'app. */
export interface PieceBilan { libelle: string; fileId?: string; aide: string }

export interface DonneesBilan {
  groupes: GroupeBilan[];
  pieces: PieceBilan[];
  /** Ligne Airbnb oubliée du 467100, si elle est au journal. */
  airbnb: JournalEntry | null;
  /** TVA collectée dans l'app sur les remboursements des frais Enghien. */
  tvaRemboursEnghien: number;
  /** Cotisations du journal et ce qu'elles deviennent chez Exponens. */
  cotisations: { app: number; per: number; tropPercu: number; net: number };
  /** Versements en compte courant retenus pour les intérêts. */
  versementsCCA: { date: string; montant: number; jours: number }[];
  fraisDevApp: number;
}

const TOLERANCE = 0.02;

/** Nombre de jours entre deux dates ISO, sans passer par l'heure locale. */
export function joursEntre(debut: string, fin: string): number {
  const t = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(fin) - t(debut)) / 86_400_000);
}

interface OptionsLigne {
  /** Rend la raison d'un écart compris, ou null s'il reste à poser. */
  explique?: (ecart: number) => string | null;
  /** Note affichée quel que soit le constat. */
  note?: string;
  /** Note affichée seulement quand l'écart reste à poser (elle prend le pas). */
  siEcart?: string;
  detail?: string;
}

function ligne(
  id: string, poste: string, compte: string, exponens: number, app: number | null,
  o: OptionsLigne = {},
): LigneBilan {
  const base = { id, poste, compte, exponens, app, detail: o.detail };
  if (app == null) return { ...base, ecart: null, verdict: 'ecart', note: o.siEcart ?? o.note };
  const ecart = r2(app - exponens);
  if (Math.abs(ecart) <= TOLERANCE) return { ...base, ecart, verdict: 'ok', note: o.note };
  const raison = o.explique?.(ecart);
  return raison
    ? { ...base, ecart, verdict: 'explique', note: raison }
    : { ...base, ecart, verdict: 'ecart', note: o.siEcart ?? o.note };
}

const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const somme = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0));
const proche = (a: number, b: number) => Math.abs(a - b) <= 0.01;

export interface EntreesBilan {
  entries: JournalEntry[];
  finances: FinanceEntry[];
  placements: Placement[];
  referentiels: Referentiels;
  tresoManuel: Record<string, TresoManuel>;
  documentsSociete: DocumentSociete[];
}

export function donneesBilan(s: EntreesBilan): DonneesBilan {
  const refs = s.referentiels;
  const moisEx = new Set(moisExercice(EXERCICE_BILAN));
  const duExercice = s.entries.filter(e => moisEx.has(e.mois));
  const jeuxCats = refs.categoriesJeux;

  // ----- Frais de développement, jeu par jeu ------------------------------
  const parJeu = new Map<string, number>();
  for (const e of duExercice) {
    if (e.type === 'produit' || !jeuxCats.includes(e.categorie)) continue;
    const cle = normalise(e.jeu ?? '');
    parJeu.set(cle, (parJeu.get(cle) ?? 0) + e.ht);
  }
  const connus = new Set(PROJET.fraisDev.map(f => normalise(f.jeu)));
  const lignesDev = PROJET.fraisDev.map(f =>
    ligne(`dev-${f.jeu}`, `Frais dév. ${f.jeu}`, f.compte, f.montant, r2(parJeu.get(normalise(f.jeu)) ?? 0)));
  const autresJeux = somme([...parJeu].filter(([k]) => !connus.has(k)).map(([, v]) => v));
  if (Math.abs(autresJeux) > TOLERANCE) {
    lignesDev.push(ligne('dev-autres', 'Frais dév. autres jeux', '203', 0, autresJeux));
  }
  const fraisDevApp = somme([...parJeu.values()]);

  // ----- Immobilisations corporelles --------------------------------------
  const corporelles = s.entries.filter(e =>
    estImmobilisation(e, refs) && !jeuxCats.includes(e.categorie) && e.date <= CLOTURE);
  const parNature = (motif: string) => somme(corporelles
    .filter(e => moisEx.has(e.mois) && normalise(e.categorie).includes(motif)).map(e => e.ht));
  const travaux = parNature('travaux');
  const informatique = parNature('informatique');
  const mobilier = parNature('mobilier');
  const autresImmos = r2(somme(corporelles.filter(e => moisEx.has(e.mois)).map(e => e.ht))
    - travaux - informatique - mobilier);
  const infos = immoInfos(corporelles, refs);
  const dotations = somme(moisExercice(EXERCICE_BILAN).map(m => dotationDuMois(infos, m)));
  const lignesImmos = [
    ligne('travaux', 'Travaux', '2181', PROJET.travaux, travaux),
    ligne('informatique', 'Informatique', '2183', PROJET.informatique, informatique, { siEcart: 'Amazon 06/01 ?' }),
    ligne('mobilier', 'Mobilier', '2184', PROJET.mobilier, mobilier),
  ];
  if (Math.abs(autresImmos) > TOLERANCE) {
    lignesImmos.push(ligne('immos-autres', 'Autres immobilisations', '218', 0, autresImmos));
  }
  lignesImmos.push(ligne('dotations', 'Amortissements', '6811', PROJET.dotations, dotations,
    { siEcart: 'durées, départs ?' }));

  // ----- Créance client et chiffre d'affaires ------------------------------
  const creance = s.entries.find(e =>
    e.type === 'produit' && e.date > CLOTURE && e.date <= '2026-12-31' && proche(e.ttc, PROJET.creanceClient)) ?? null;
  const prestations = somme(duExercice.filter(e => e.type === 'produit'
    && !['remboursement', 'notes de frais'].includes(normalise(e.categorie))).map(e => e.ht));
  const ca = r2(prestations + (creance?.ht ?? 0));

  // ----- Trésorerie au 30/09 -----------------------------------------------
  const lignesTreso = tableauTreso(s.entries, s.finances,
    moisTresorerie(s.entries, s.finances, moisCourant()), s.tresoManuel);
  const sept = lignesTreso.find(l => l.mois === '2026-09');
  const releve = sept?.soldeReel;

  const actifs = s.placements.filter(p =>
    p.debut && p.debut <= CLOTURE && !(p.recupereLe && p.recupereLe <= CLOTURE));
  const placesFinances = s.finances.filter(f => f.type === 'placement' && f.date <= CLOTURE);
  const cat = actifs.length
    ? somme(actifs.map(p => p.montant))
    : placesFinances.length ? r2(-somme(placesFinances.map(f => f.montant))) : null;
  const courus = actifs.length ? somme(actifs.map(p => {
    const gain = gainReel(p) ?? remunerationAttendue(p);
    const fin = p.recupereLe ?? echeancePlacement(p);
    const couru = joursEntre(p.debut, CLOTURE);
    if (fin && fin > p.debut) return gain * couru / joursEntre(p.debut, fin);
    return remunerationAttendue(p) * couru / 365;
  })) : null;

  // ----- Capitaux et compte courant ----------------------------------------
  const avant = (f: FinanceEntry) => f.date <= CLOTURE;
  const capital = somme(s.finances.filter(f => avant(f) && f.type === 'capital').map(f => f.montant));
  const mouvCCA = s.finances
    .filter(f => avant(f) && (f.type === 'cca' || f.type === 'remboursement_cca'))
    .sort((a, b) => a.date.localeCompare(b.date));
  const cca = somme(mouvCCA.map(f => f.montant));
  const versementsCCA = mouvCCA.map(f => ({ date: f.date, montant: f.montant, jours: joursEntre(f.date, CLOTURE) }));
  const interetsCCA = somme(versementsCCA.map(v => v.montant * TAUX_CCA * v.jours / BASE_JOURS_CCA));
  const joursExponens = Math.round(PROJET.interetsCCA / (PROJET.cca * TAUX_CCA) * BASE_JOURS_CCA);
  /** Le versement que suppose le calcul d'Exponens : 371 jours avant la clôture. */
  const dateExponens = new Date(Date.UTC(2026, 8, 30) - joursExponens * 86_400_000).toISOString().slice(0, 10);

  // ----- Cotisations sociales ----------------------------------------------
  const cotisApp = somme(duExercice.filter(e => e.type !== 'produit'
    && (estPersonnel(e.categorie, refs) || CATEGORIES_PERSONNEL_INITIALES.includes(e.categorie))).map(e => e.ttc));
  // Les remboursements et notes de frais sont rangés en charges négatives
  // (ils rendent une dépense) ; une ancienne saisie peut encore être un produit.
  const rendus = duExercice.filter(e => e.type === 'produit'
    || ['remboursement', 'notes de frais'].includes(normalise(e.categorie)));
  const recu = (e: JournalEntry, v: number) => e.type === 'produit' ? v : -v;
  const per = somme(rendus.filter(e => /\bPER\b/.test(e.description)).map(e => recu(e, e.ttc)));
  const tropPercu = somme(rendus.filter(e => normalise(e.fournisseur).includes('urssaf')).map(e => recu(e, e.ttc)));
  const cotisNet = r2(cotisApp - per - tropPercu - PROJET.urssafARecevoir + PROJET.urssafAPayer);

  const tvaRemboursEnghien = somme(rendus
    .filter(e => /rembours/i.test(e.description) && /enghien/i.test(e.description)).map(e => recu(e, e.tva)));

  const groupes: GroupeBilan[] = [
    { titre: 'Actif immobilisé', lignes: [...lignesDev, ...lignesImmos] },
    {
      titre: 'Actif circulant',
      lignes: [
        ligne('creance', 'Créance client (ARTFX)', '411', PROJET.creanceClient, creance?.ttc ?? null, {
          note: creance ? `encaissée le ${jjmm(creance.date)}` : undefined, siEcart: 'pas au journal',
        }),
        ligne('qonto', 'Qonto au 30/09', '512000', PROJET.qonto, sept?.soldeCumule ?? null, {
          explique: () => releve != null && proche(releve, PROJET.qonto) ? 'relevé saisi identique' : null,
          note: releve != null ? `relevé : ${releve.toFixed(2).replace('.', ',')}` : undefined,
          siEcart: releve != null ? undefined : 'à pointer',
        }),
        ligne('cat', 'Compte à terme', '512110', PROJET.cat, cat, { siEcart: 'montant placé ?' }),
        ligne('courus', 'Intérêts courus du CAT', '518800', PROJET.interetsCourus, courus, {
          explique: e => Math.abs(e) <= 10 ? 'prorata au jour près' : null,
          siEcart: courus == null ? 'registre vide' : 'prorata au 30/09',
        }),
      ],
    },
    {
      titre: 'Capitaux et comptes courants',
      lignes: [
        ligne('capital', 'Capital versé', '101300', PROJET.capital, capital),
        ligne('cca', 'CCA MDR Conseil', '451100', PROJET.cca, cca),
        ligne('interets-cca', 'Intérêts du CCA (2 %)', '661500', PROJET.interetsCCA, interetsCCA, {
          note: `${joursExponens} j, base ${BASE_JOURS_CCA}`,
          siEcart: versementsCCA.length === 1 ? `versé le ${jjmm(dateExponens)} ?` : undefined,
          detail: versementsCCA.map(v => `app : ${jjmm(v.date)} (${v.jours} j)`).join(', ')
            + ` · Exponens : ${jjmm(dateExponens)} (${joursExponens} j, base ${BASE_JOURS_CCA})`,
        }),
      ],
    },
    {
      titre: 'Compte de résultat',
      lignes: [
        ligne('ca', 'Chiffre d\'affaires HT', '706', PROJET.ca, ca, {
          note: creance ? '+ facture sept.' : undefined, siEcart: creance ? undefined : 'facture sept. ?',
        }),
        ligne('cotisations', 'Cotisations sociales', '646', PROJET.cotisations, cotisApp, {
          explique: () => proche(cotisNet, PROJET.cotisations) ? 'voir réponses' : null,
        }),
      ],
    },
  ];

  // ----- Pièces à garder sous la main --------------------------------------
  const docs = s.documentsSociete ?? [];
  const trouverDoc = (...motifs: string[]) => docs.find(d => {
    const t = normalise(`${d.libelle} ${d.nom}`);
    return motifs.some(m => t.includes(m));
  });
  const projetDoc = trouverDoc('projet de comptes', 'comptes annuels', 'exercice du 2025-08-26');
  const conventionDoc = docs.find(d => {
    const t = normalise(`${d.libelle} ${d.nom}`);
    return t.includes('convention') && t.includes('courant');
  });
  const airbnb = s.entries.find(e => e.type !== 'produit'
    && normalise(e.fournisseur).includes('airbnb') && proche(e.ttc, 467.80)) ?? null;

  const pieces: PieceBilan[] = [
    { libelle: 'Projet de comptes', fileId: projetDoc?.fileId, aide: 'Le PDF Exponens du 17/11' },
    { libelle: 'Convention CCA', fileId: conventionDoc?.fileId, aide: 'Convention MDR Conseil signée (2 %)' },
    { libelle: 'Airbnb 467,80 €', fileId: airbnb?.factureFileId, aide: 'Justificatif oublié du 467100' },
  ];

  return {
    groupes, pieces, airbnb, tvaRemboursEnghien,
    cotisations: { app: cotisApp, per, tropPercu, net: cotisNet },
    versementsCCA, fraisDevApp,
  };
}
