/**
 * Contrôles comptables automatiques.
 *
 * Ce que vérifierait un expert-comptable en ouvrant le dossier : cohérence
 * arithmétique des écritures, rattachement des dates au bon exercice, plan
 * d'amortissement bouclé, nature réelle des produits, position de TVA. Chaque
 * contrôle sait dire s'il passe, ce qu'il a trouvé, et — quand c'est
 * mécanique — comment le corriger en un clic.
 */
import type { JournalEntry, Referentiels } from '../types';
import { immoInfos, fractionDuMois, type ImmoInfo } from './calc';
import { moisExercice, PRE_IMMAT, labelMois } from './dates';
import { r2, euros } from './money';

export type NiveauControle = 'ok' | 'attention' | 'erreur' | 'info';

/** Page à ouvrir quand on clique une écriture signalée. */
export type PageControle = 'journal' | 'immos';

export interface Controle {
  cle: string;
  titre: string;
  niveau: NiveauControle;
  /** Où se corrige ce point : le journal du mois, ou les immobilisations. */
  page: PageControle;
  /** Ce que le contrôle a trouvé, en une phrase. */
  constat: string;
  /** Ce que ça veut dire, et quoi en faire. */
  explication?: string;
  /** Écritures concernées, pour les lister. */
  ecritures?: JournalEntry[];
  /** Correction mécanique proposée. */
  correction?: { libelle: string; action: 'caler-dates' };
}

/** Taux de TVA admis en France, pour vérifier la cohérence d'une écriture. */
const TAUX = [0, 2.1, 5.5, 10, 20];

/** L'écart entre la TVA saisie et celle qu'imposerait le taux le plus proche. */
function ecartTVA(e: JournalEntry): number {
  const base = e.ttc - e.tva;
  if (base <= 0) return 0;
  return Math.min(...TAUX.map(t => Math.abs(e.tva - base * t / 100)));
}

export function controlesComptables(
  entries: JournalEntry[], exercice: string, refs: Referentiels,
): Controle[] {
  const moisList = moisExercice(exercice);
  const moisSet = new Set(moisList);
  const duJournal = entries.filter(e => moisSet.has(e.mois));
  const immos = immoInfos(entries);
  const out: Controle[] = [];

  // 1. HT + TVA = TTC, écriture par écriture
  const desequilibrees = duJournal.filter(e => Math.abs(e.ht + e.tva - e.ttc) > 0.011);
  out.push({
    cle: 'equilibre',
    titre: 'Cohérence HT + TVA = TTC',
    page: 'journal',
    niveau: desequilibrees.length ? 'erreur' : 'ok',
    constat: desequilibrees.length
      ? `${desequilibrees.length} écriture(s) où le HT et la TVA ne redonnent pas le TTC.`
      : `Les ${duJournal.length} écritures de l'exercice sont équilibrées au centime.`,
    explication: desequilibrees.length
      ? 'Un montant a été corrigé sans recalculer les deux autres. Rouvre la ligne et ressaisis le TTC : la TVA et le HT se recalculent.'
      : undefined,
    ecritures: desequilibrees,
  });

  // 2. Taux de TVA plausibles
  const tauxDouteux = duJournal.filter(e => ecartTVA(e) > 0.05 && e.ttc >= 5);
  out.push({
    cle: 'taux-tva',
    titre: 'Taux de TVA appliqués',
    page: 'journal',
    niveau: tauxDouteux.length ? 'attention' : 'ok',
    constat: tauxDouteux.length
      ? `${tauxDouteux.length} écriture(s) dont la TVA ne correspond à aucun taux français (20 / 10 / 5,5 / 2,1 / 0 %) à 5 centimes près.`
      : 'Toutes les TVA correspondent à un taux légal.',
    explication: tauxDouteux.length
      ? 'Souvent un ticket qui mélange deux taux (repas à 10 % + boisson à 20 %) : c\'est légitime, la TVA saisie fait foi. Vérifie quand même qu\'elle vient bien du ticket.'
      : undefined,
    ecritures: tauxDouteux,
  });

  // 3. Rattachement des dates au mois comptable
  const horsMois = duJournal.filter(e => e.mois !== PRE_IMMAT && e.date.slice(0, 7) !== e.mois);
  out.push({
    cle: 'dates',
    titre: 'Rattachement des dates au mois comptable',
    page: 'journal',
    niveau: horsMois.length ? 'erreur' : 'ok',
    constat: horsMois.length
      ? `${horsMois.length} écriture(s) portent une date en dehors de leur mois comptable.`
      : 'Chaque écriture est datée dans son mois comptable.',
    explication: horsMois.length
      ? 'Presque toujours une faute de frappe sur l\'année. Tant qu\'elle est là, la pièce est classée dans un mois et datée d\'un autre : le contrôle fiscal le voit tout de suite.'
      : undefined,
    ecritures: horsMois,
    correction: horsMois.length ? { libelle: 'Caler la date sur le mois comptable', action: 'caler-dates' } : undefined,
  });

  // 4. Plan d'amortissement : le cumul doit tomber juste sur la valeur du bien
  const ecarts = immos.map(i => {
    const total = totalDotations(i);
    return { i, ecart: r2(total - i.entry.ht) };
  }).filter(x => Math.abs(x.ecart) > 0.02);
  out.push({
    cle: 'amortissements',
    titre: 'Plans d\'amortissement bouclés',
    page: 'immos',
    niveau: ecarts.length ? 'erreur' : 'ok',
    constat: ecarts.length
      ? `${ecarts.length} bien(s) dont le cumul des dotations ne retombe pas sur la valeur d'origine.`
      : `Les ${immos.length} biens s'amortissent exactement à leur valeur HT, prorata temporis compris.`,
    ecritures: ecarts.map(x => x.i.entry),
  });

  // 5. Petites immobilisations : la tolérance des 500 € HT
  const petites = immos.filter(i => i.entry.ht < 500 && moisSet.has(i.entry.mois));
  if (petites.length) {
    const somme = r2(petites.reduce((s, i) => s + i.entry.ht, 0));
    out.push({
      cle: 'petites-immos',
      titre: 'Immobilisations de moins de 500 € HT',
      page: 'immos',
      niveau: 'info',
      constat: `${petites.length} bien(s) sous 500 € HT, ${euros(somme)} au total, sont immobilisés.`,
      explication: 'L\'administration tolère de passer directement en charges le petit matériel de moins de 500 € HT. '
        + 'Les garder en immobilisations est parfaitement valable — c\'est même plus fidèle quand ils font partie d\'un ensemble '
        + '(des matériaux de travaux, par exemple). À valider avec ton comptable au moment du bilan.',
      ecritures: petites.map(i => i.entry),
    });
  }

  // 6. Nature des produits : un remboursement n'est pas du chiffre d'affaires
  const remboursements = duJournal.filter(e =>
    e.type === 'produit' && /rembours|trop.per|note de frais|notes de frais/i.test(`${e.categorie} ${e.description}`));
  if (remboursements.length) {
    const somme = r2(remboursements.reduce((s, e) => s + e.ht, 0));
    const tva = r2(remboursements.reduce((s, e) => s + e.tva, 0));
    out.push({
      cle: 'produits-remboursements',
      titre: 'Remboursements comptés en produits',
      page: 'journal',
      niveau: 'attention',
      constat: `${remboursements.length} écriture(s) de remboursement, ${euros(somme)} HT, figurent dans les produits.`,
      explication: 'Un remboursement de trop-perçu ou une avance rendue n\'est pas du chiffre d\'affaires : '
        + 'comptablement, il vient en diminution de la charge d\'origine (ou en compte courant d\'associé). '
        + 'Le résultat net est le même — la charge et le produit s\'annulent — mais le chiffre d\'affaires est majoré d\'autant, '
        + `et ${euros(tva)} de TVA sont comptés en collectée au lieu de venir réduire la déductible. `
        + 'Une refacturation de frais à un client (ARTFX) est, elle, un vrai produit.',
      ecritures: remboursements,
    });
  }

  // 7. Immobilisations acquises avant l'immatriculation
  const avantImmat = immos.filter(i => i.entry.mois === PRE_IMMAT);
  if (avantImmat.length && moisSet.has(PRE_IMMAT)) {
    const somme = r2(avantImmat.reduce((s, i) => s + i.entry.ht, 0));
    out.push({
      cle: 'pre-immat',
      titre: 'Biens acquis avant l\'immatriculation',
      page: 'immos',
      niveau: 'info',
      constat: `${avantImmat.length} bien(s), ${euros(somme)} HT, sont datés d'avant la création de la société.`,
      explication: 'Ces dépenses doivent avoir été reprises par la société après son immatriculation '
        + '(acte de reprise annexé aux statuts, ou décision de l\'assemblée). Leur amortissement commence à la date d\'achat, '
        + 'ce qui est la bonne convention une fois la reprise actée. À confirmer avec ton comptable.',
      ecritures: avantImmat.map(i => i.entry),
    });
  }

  // 8. Écritures sans justificatif attaché
  const sansPiece = duJournal.filter(e => !e.factureFileId && !e.facture?.trim());
  out.push({
    cle: 'justificatifs',
    titre: 'Pièces justificatives',
    page: 'journal',
    niveau: sansPiece.length ? 'attention' : 'ok',
    constat: sansPiece.length
      ? `${sansPiece.length} écriture(s) sur ${duJournal.length} n'ont ni fichier joint ni référence de pièce.`
      : 'Chaque écriture porte une pièce.',
    explication: sansPiece.length
      ? 'Une charge sans justificatif n\'est pas déductible et sa TVA n\'est pas récupérable. Glisse les PDF sur les lignes du journal.'
      : undefined,
    ecritures: sansPiece.slice(0, 40),
  });

  // 9. Catégories hors référentiel
  const connues = new Set([...refs.categoriesDepenses, ...refs.categoriesJeux, ...refs.categoriesProduits]);
  const orphelines = duJournal.filter(e => !connues.has(e.categorie));
  if (orphelines.length) {
    out.push({
      cle: 'categories',
      titre: 'Catégories hors référentiel',
      page: 'journal',
      niveau: 'attention',
      constat: `${orphelines.length} écriture(s) portent une catégorie qui n'existe plus.`,
      explication: 'Elles échappent aux blocs de la synthèse. Recatégorise-les, ou recrée la catégorie dans l\'onglet Catégories.',
      ecritures: orphelines,
    });
  }

  // 10. Montants nuls ou négatifs
  const suspects = duJournal.filter(e => e.ttc <= 0);
  if (suspects.length) {
    out.push({
      cle: 'montants',
      titre: 'Montants nuls ou négatifs',
      page: 'journal',
      niveau: 'attention',
      constat: `${suspects.length} écriture(s) à 0 € ou en négatif.`,
      explication: 'Une ligne vide oubliée, ou un avoir saisi en négatif. Un avoir se saisit plutôt comme un produit, ou en diminution de la charge.',
      ecritures: suspects,
    });
  }

  return out;
}

/** Cumul des dotations d'un bien sur toute la durée du plan. */
function totalDotations(i: ImmoInfo): number {
  const [y, m] = i.entry.date.split('-').map(Number);
  let total = 0;
  for (let rang = 0; rang <= i.duree * 12; rang++) {
    const mm = m + rang;
    const mois = `${y + Math.floor((mm - 1) / 12)}-${String(((mm - 1) % 12) + 1).padStart(2, '0')}`;
    total += i.entry.ht / (i.duree * 12) * fractionDuMois(i, mois);
  }
  return r2(total);
}

/** Corrige la date d'une écriture pour qu'elle tombe dans son mois comptable. */
export function dateCalee(e: JournalEntry): string {
  if (e.mois === PRE_IMMAT) return e.date;
  const jour = e.date.slice(8, 10) || '01';
  const dernier = new Date(Number(e.mois.slice(0, 4)), Number(e.mois.slice(5, 7)), 0).getDate();
  const j = Math.min(Number(jour) || 1, dernier);
  return `${e.mois}-${String(j).padStart(2, '0')}`;
}

/** Résumé d'un contrôle pour l'affichage compact. */
export function libelleEcriture(e: JournalEntry): string {
  return `${labelMois(e.mois)} · ${e.date} · ${e.fournisseur || '—'} · ${e.description || '—'} · ${euros(e.ttc)}`;
}
