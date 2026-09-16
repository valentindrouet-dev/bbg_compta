import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable, { type UserOptions, type HAlignType as Halign } from 'jspdf-autotable';
import type { AppState } from '../store';
import type { JournalEntry, PrevLigne, Referentiels } from '../types';
import {
  labelMois, labelMoisLong, formatDateFR, compareMois, moisCourant, moisExercice,
  exerciceDuMois, EXERCICES,
} from './dates';
import { r2 } from './money';
import {
  syntheseExercice, immoInfos, tableauTVA, tableauTreso, moisTresorerie,
  resultatDeSynthese, bilanJeux, sectionsDuMois, sumTTH, sumParCategorie, sumParMotCle,
  dotationsParMois, type BaseMontant, type SyntheseExercice,
} from './calc';
import { exporterFichiers, importerFichiers, listFiles, type FichierSerialise } from './files';
import { creerZip, nomSur, type FichierZip } from './zip';
import { pageLectureSeule } from './partage';
import { ordreAffichage, valeursDe, SECTIONS } from './previsionnel';
import { natureCategorie, dureeCategorie, teinteBloc, type BlocCle } from './blocs';
import { couleurJeu } from './jeux';
import { APP_VERSION } from '../version';
import { positionsStock, stocksExercice } from './stock';

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ Excel ---

function journalRows(entries: JournalEntry[]) {
  return [...entries]
    .sort((a, b) => compareMois(a.mois, b.mois) || a.date.localeCompare(b.date))
    .map(e => ({
      'Mois': labelMois(e.mois),
      'Date': e.date,
      'Fournisseur': e.fournisseur,
      'Description': e.description,
      'Catégorie': e.categorie,
      'Jeu': e.jeu ?? '',
      'TTC': r2(e.ttc),
      'TVA': r2(e.tva),
      'HT': r2(e.ht),
      'Paiement': e.paiement,
      'Type': e.type,
      'Compta': e.compta ?? '',
      'Mots clés': e.motsCles ?? '',
      'Facture': e.facture ?? '',
      'Durée immo (ans)': e.type === 'immo' ? (e.immoDureeAns ?? 5) : '',
    }));
}

/** Une ligne « mois -> valeur » pour une feuille : le mois en tête, puis le total. */
function moisRow(
  mois: string[], libelle: Record<string, string | number>,
  valeur: (m: string) => number,
): Record<string, string | number> {
  const row = { ...libelle };
  let total = 0;
  for (const m of mois) { const v = r2(valeur(m)); row[labelMois(m)] = v; total += v; }
  row['Total'] = r2(total);
  return row;
}

/** Décrit la formule d'une ligne de prévisionnel en clair, pour le tableur. */
function formuleLisible(l: PrevLigne, lignes: PrevLigne[]): string {
  if (!l.formule) return '';
  if (l.formule.type === 'pourcentage-bloc') return `${l.formule.taux} % du bloc au-dessus`;
  const f = l.formule;
  const source = lignes.find(x => x.id === f.sourceId)?.categorie ?? '?';
  const dec = f.decalage ? ` du mois -${f.decalage}` : '';
  return `${source}${dec} × ${r2(f.tauxHT)} € HT`;
}

export function blobExcel(state: AppState, exercice: string): Blob {
  const wb = XLSX.utils.book_new();
  const {
    entries, referentiels, previsionnels, chronologie, finances, tresoManuel,
  } = state;
  const refs: Referentiels = referentiels;
  const feuille = (nom: string, rows: Record<string, string | number>[]) => {
    if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), nom);
  };

  // Journal complet
  feuille('Journal', journalRows(entries));

  // Synthèse : un bloc après l'autre, comme à l'écran, HT et TTC.
  const syn = syntheseExercice(entries, exercice, refs);
  const mois = syn.moisList;
  const bloc = (
    titre: string, data: Map<string, Map<string, number>>, ordre: string[],
  ) => ordre.filter(c => data.has(c)).concat([...data.keys()].filter(c => !ordre.includes(c)))
    .map(c => moisRow(mois, { 'Bloc': titre, 'Ligne': c }, m => data.get(c)?.get(m) ?? 0));

  const synRows: Record<string, string | number>[] = [
    ...bloc('Produits', syn.produits, refs.categoriesProduits),
    moisRow(mois, { 'Bloc': 'Produits', 'Ligne': 'TOTAL PRODUITS HT' }, m => syn.totalProduitsParMois.get(m) ?? 0),
    moisRow(mois, { 'Bloc': 'Produits', 'Ligne': 'TOTAL PRODUITS TTC' }, m => syn.totalProduitsTTCParMois.get(m) ?? 0),
    ...bloc('Charges', syn.charges, refs.categoriesDepenses),
    moisRow(mois, { 'Bloc': 'Charges', 'Ligne': 'TOTAL CHARGES HT' }, m => syn.totalChargesParMois.get(m) ?? 0),
    moisRow(mois, { 'Bloc': 'Charges', 'Ligne': 'TOTAL CHARGES TTC' }, m => syn.totalChargesTTCParMois.get(m) ?? 0),
    moisRow(mois, { 'Bloc': 'Charges', 'Ligne': 'dont charges financières' }, m => syn.chargesFinancieresParMois.get(m) ?? 0),
    ...bloc('Personnel', syn.personnel, refs.categoriesDepenses),
    moisRow(mois, { 'Bloc': 'Personnel', 'Ligne': 'TOTAL PERSONNEL HT' }, m => syn.totalPersonnelParMois.get(m) ?? 0),
    moisRow(mois, { 'Bloc': 'Personnel', 'Ligne': 'TOTAL PERSONNEL TTC' }, m => syn.totalPersonnelTTCParMois.get(m) ?? 0),
    ...bloc('Immobilisations', syn.immos, []),
    moisRow(mois, { 'Bloc': 'Immobilisations', 'Ligne': 'TOTAL IMMOBILISATIONS HT' }, m => syn.immoParMois.get(m) ?? 0),
    moisRow(mois, { 'Bloc': 'Immobilisations', 'Ligne': 'TOTAL IMMOBILISATIONS TTC' }, m => syn.immoTTCParMois.get(m) ?? 0),
    moisRow(mois, { 'Bloc': 'Total', 'Ligne': 'TOTAL DÉPENSES TTC' }, m => syn.totalTTCParMois.get(m) ?? 0),
  ];
  feuille(`Synthèse ${exercice}`, synRows);

  // Compte de résultat — le même calcul qu'à l'écran (EBE, REX, IS, résultat net).
  feuille(`Résultat ${exercice}`, resultatDeSynthese(syn, entries, finances, refs).map(l => {
    const row: Record<string, string | number> = { 'Ligne': l.label, 'Niveau': l.niveau };
    for (const m of mois) row[labelMois(m)] = l.parMois ? r2(l.parMois.get(m) ?? 0) : '';
    row['Total'] = l.total;
    return row;
  }));

  // Dépenses ventilées par jeu : la part à l'actif et celle passée en charges.
  feuille('Par jeu', bilanJeux(entries, refs.categoriesJeux).map(b => ({
    'Jeu': b.jeu,
    'Couleur': couleurJeu(b.jeu, refs),
    'Écritures': b.nb,
    'Charges HT': b.charges,
    'Immobilisé HT': b.immo,
    'Total HT': b.ht,
    'TVA': b.tva,
    'TTC': b.ttc,
    'Première': b.premiere,
    'Dernière': b.derniere,
    'Lien Production Calculator': refs.jeuxMeta?.[b.jeu]?.lienProd ?? '',
    'Note': refs.jeuxMeta?.[b.jeu]?.note ?? '',
  })));

  // Immobilisations
  feuille('Immobilisations', immoInfos(entries, refs).map(i => ({
    'Date': i.entry.date,
    'Fournisseur': i.entry.fournisseur,
    'Description': i.entry.description,
    'Catégorie': i.entry.categorie,
    'Jeu': i.entry.jeu ?? '',
    'TTC': r2(i.entry.ttc), 'TVA': r2(i.entry.tva), 'HT': r2(i.entry.ht),
    'Durée (ans)': i.duree,
    'Dotation /an': i.dotationAn, 'Dotation /mois': i.dotationMois,
    'VNC à ce jour': i.vnc(today()),
    'Fin amortissement': i.fin,
    'Compta': i.entry.compta ?? '', 'Facture': i.entry.facture ?? '',
  })));

  // Trésorerie — avec les corrections saisies à la main et le relevé bancaire.
  const moisList = moisTresorerie(entries, finances, moisCourant());
  feuille('Trésorerie', tableauTreso(entries, finances, moisList, tresoManuel ?? {}).map(t => ({
    'Mois': labelMois(t.mois),
    'Solde initial': t.soldeInitial,
    'Encaissements journal': t.encJournal,
    'Décaissements journal': -t.decJournal,
    'Mouvements financiers': t.financier,
    'Correction manuelle': t.ajustement,
    'Solde mensuel': t.soldeMensuel,
    'Solde cumulé': t.soldeCumule,
    'Solde réel (banque)': t.soldeReel ?? '',
    'Écart': t.ecart ?? '',
    'Note': tresoManuel?.[t.mois]?.note ?? '',
  })));

  // Mouvements financiers : capital, compte courant d'associé, placements.
  feuille('Mouvements financiers', [...finances]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(f => ({ 'Date': f.date, 'Libellé': f.label, 'Type': f.type, 'Montant': r2(f.montant) })));

  // Les mêmes, mais seulement prévus : ils ne comptent que dans la trésorerie
  // prévisionnelle, sur les mois pas encore écoulés.
  feuille('Mouvements financiers prévus', [...(state.mouvementsPrev ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(f => ({ 'Date': f.date, 'Libellé': f.label, 'Type': f.type, 'Montant': r2(f.montant) })));

  // TVA
  feuille('TVA', tableauTVA(entries, moisExercice(exercice)).map(x => ({
    'Mois': labelMois(x.mois),
    'CA TTC': x.caTTC, 'CA HT': x.caHT, 'TVA collectée': x.tvaCollectee,
    'Dépenses TTC': x.depTTC, 'Dépenses HT': x.depHT, 'TVA déductible': x.tvaDeductible,
    'Solde (collectée-déductible)': x.solde, 'Cumul': x.cumul,
  })));

  // Prévisionnel : mêmes catégories, mêmes mois et mêmes blocs que la synthèse.
  const titreBloc = Object.fromEntries(SECTIONS.map(x => [x.cle, x.titre]));
  for (const [ex, brutes] of Object.entries(previsionnels ?? {})) {
    const moisEx = moisExercice(ex);
    const lignes = ordreAffichage(brutes, refs);
    const rows = lignes.map(l => {
      const vals = valeursDe(l, lignes);
      const row: Record<string, string | number> = {
        'Bloc': titreBloc[l.section] ?? l.section,
        'Ligne': l.categorie,
        'Jeu': l.jeu ?? '',
        'Unité': l.unite ?? '€ HT',
        'TVA %': l.unite ? '' : (l.tauxTVA ?? ''),
        'Formule': formuleLisible(l, lignes),
      };
      moisEx.forEach((m, i) => { row[labelMois(m)] = vals[i] ?? ''; });
      row['Total'] = r2(vals.reduce<number>((s, v) => s + (v ?? 0), 0));
      row['Note'] = l.note ?? '';
      return row;
    });
    feuille(`Prév ${ex}`, rows);
  }

  // Chronologie — dans l'ordre des projets choisi à l'écran, avec leur couleur.
  const ordreProjets = refs.chronoProjets ?? [];
  const rang = (p: string) => {
    const i = ordreProjets.indexOf(p);
    return i < 0 ? ordreProjets.length : i;
  };
  feuille('Chronologie', [...chronologie]
    .sort((a, b) => rang(a.projet) - rang(b.projet) || a.debut.localeCompare(b.debut))
    .map(c => ({
      'Projet': c.projet,
      'Couleur': refs.chronoCouleurs?.[c.projet] ?? couleurJeu(c.projet, refs),
      'Action': c.action,
      'Début': c.debut,
      'Fin': c.fin,
      'Détail': c.detail ?? '',
    })));

  // Référentiel des catégories : c'est lui qui décide charge ou immobilisation.
  const nomsNature: Record<string, string> = {
    immo: 'Immobilisation', charge: 'Charge', auto: 'Au cas par cas',
  };
  feuille('Catégories', [
    ...refs.categoriesProduits.map(c => ({ c, type: 'Produit' })),
    ...refs.categoriesDepenses.map(c => ({ c, type: 'Dépense' })),
    ...refs.categoriesJeux.map(c => ({ c, type: 'Jeux' })),
  ].map(({ c, type }) => {
    const nature = natureCategorie(c, refs);
    return {
      'Catégorie': c,
      'Type': type,
      'Groupe': refs.categoriesMeta?.[c]?.groupe ?? '',
      'Nature': nomsNature[nature],
      // La durée ne veut rien dire pour une catégorie qui n'est pas à l'actif.
      'Durée amortissement (ans)': nature === 'immo' ? dureeCategorie(c, refs) : '',
      'Couleur': refs.categoriesMeta?.[c]?.couleur ?? '',
    };
  }));

  // Catalogue des jeux, avec la couleur qui les suit dans toute l'app.
  feuille('Jeux', (refs.jeux ?? []).map(j => ({
    'Jeu': j,
    'Couleur': couleurJeu(j, refs),
    'Lien Production Calculator': refs.jeuxMeta?.[j]?.lienProd ?? '',
    'Note': refs.jeuxMeta?.[j]?.note ?? '',
  })));

  // Stock prévu : une ligne par jeu et par exercice, avec ce qui en découle.
  const lignesStockPrev: Record<string, string | number>[] = [];
  for (const ex of Object.keys(previsionnels ?? {}).sort()) {
    for (const s of stocksExercice(state.stocks ?? [], ex, refs.jeux ?? [])) {
      const parCanal: Record<string, string | number> = {};
      for (const c of s.ligne.canaux ?? []) {
        const t = s.total.parCanal.get(c.id);
        parCanal[`${c.nom} — part du tirage %`] = c.mode === 'repartition' ? (c.repartition ?? 0) : '';
        parCanal[`${c.nom} — prix HT`] = c.prix;
        parCanal[`${c.nom} — exemplaires`] = t?.quantite ?? 0;
        parCanal[`${c.nom} — ventes HT`] = t?.ca ?? 0;
      }
      lignesStockPrev.push({
        'Exercice': ex,
        'Jeu': s.ligne.jeu,
        'Tirage': s.ligne.tirage ?? '1er tirage',
        'Coût de revient unitaire HT': s.ligne.coutUnitaire,
        'Prix public HT (PPHT)': s.ligne.ppht ?? 0,
        'TVA ventes %': s.ligne.tauxTVA ?? 20,
        'TVA tirage %': s.ligne.tauxTVAFabrication ?? 0,
        'Stock ouverture': s.total.stockDebut,
        'Fabriqués': s.total.fabrique,
        'Rythme de ventes cumulé %': r2((s.ligne.ventesPourcent ?? [])
          .reduce<number>((x, v) => x + (v ?? 0), 0)),
        ...parCanal,
        'Vendus (tous canaux)': s.total.vendue,
        'Stock clôture': s.total.stockFin,
        'Tirages payés HT': s.total.coutFabrication,
        'Ventes HT': s.total.ca,
        'Ventes TTC': s.total.caTTC,
        'Coût des ventes': s.total.cogs,
        ...Object.fromEntries((s.ligne.droits ?? []).flatMap(d => {
          const t = s.total.parDroit.get(d.id);
          return [
            [`Droits ${d.nom} — taux %`, d.taux],
            [`Droits ${d.nom} — assiette`, d.base === 'ppht' ? 'PPHT' : 'prix encaissé'],
            [`Droits ${d.nom} — avance`, d.avance],
            [`Droits ${d.nom} — acquis`, t?.brut ?? 0],
            [`Droits ${d.nom} — dus`, t?.du ?? 0],
            [`Droits ${d.nom} — reste avance`, t?.resteAvance ?? 0],
          ];
        })),
        'Droits dus (total)': s.total.droitsDus,
        'Variation de stock': s.total.variationStock,
        'Marge': s.total.marge,
        'Valeur du stock': s.total.valeurStock,
      });
    }
  }
  feuille('Stock prévu', lignesStockPrev);

  // Stock réel : la position de chaque jeu, puis le détail des mouvements.
  feuille('Stock réel', positionsStock(state.mouvementsStock ?? [], refs.jeux ?? []).map(p => ({
    'Jeu': p.jeu,
    'Entrés': p.entrees, 'Sortis': p.sorties, 'En stock': p.stock,
    'Coût moyen pondéré': p.coutMoyen, 'Valeur du stock': p.valeur,
    'Ventes HT': p.ca, 'Coût des ventes': p.cogs, 'Marge': p.marge,
  })));
  feuille('Mouvements de stock', [...(state.mouvementsStock ?? [])]
    .sort((a, b) => compareMois(a.mois, b.mois) || a.date.localeCompare(b.date))
    .map(m => ({
      'Date': m.date, 'Mois': labelMois(m.mois), 'Jeu': m.jeu, 'Type': m.type,
      'Canal': m.canal ?? '',
      'Quantité': m.quantite, 'Prix unitaire HT': m.unitaire,
      'Montant HT': r2(m.quantite * m.unitaire), 'Note': m.note ?? '',
    })));

  // Vue d'ensemble : une ligne par exercice, réel puis prévu.
  const exercices = Object.keys(previsionnels ?? {}).sort();
  feuille('Synthèse totale', exercices.map(ex => {
    const s = syntheseExercice(entries, ex, refs);
    const r = resultatDeSynthese(s, entries, finances, refs);
    const val = (cle: string) => r.find(l => l.cle === cle)?.total ?? 0;
    const ordonnees = ordreAffichage(previsionnels?.[ex] ?? [], refs);
    const prevu = (section: string) =>
      r2(ordonnees.filter(l => l.section === section && !l.unite)
        .reduce((t, l) => t + valeursDe(l, ordonnees)
          .reduce<number>((x, v) => x + (v ?? 0), 0), 0));
    return {
      'Exercice': ex,
      'Produits réels HT': val('produits'),
      'Charges réelles HT': val('charges'),
      'EBE': val('ebe'),
      'Dotations': val('dotations'),
      'Résultat courant': val('rc'),
      'Impôt sociétés': val('is'),
      'RÉSULTAT NET': val('rn'),
      'Produits prévus HT': prevu('produits'),
      'Charges prévues HT': prevu('charges'),
      'Personnel prévu HT': prevu('personnel'),
      'Immos prévues HT': prevu('immos'),
    };
  }));

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function exportExcel(state: AppState, exercice: string) {
  download(`BBG_Compta_${today()}.xlsx`, blobExcel(state, exercice));
}

// -------------------------------------------------------------------- CSV ---

/** CSV « à la française » : séparateur ; virgule décimale, BOM UTF-8. */
export function blobCSV(entries: JournalEntry[]): Blob | null {
  const rows = journalRows(entries);
  if (!rows.length) return null;
  const headers = Object.keys(rows[0]);
  const fmt = (v: string | number) => {
    if (typeof v === 'number') return String(v).replace('.', ',');
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(';'), ...rows.map(r => headers.map(h => fmt(r[h as keyof typeof r] as string | number)).join(';'))].join('\r\n');
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
}

export function exportCSV(entries: JournalEntry[]) {
  const blob = blobCSV(entries);
  if (blob) download(`BBG_Journal_${today()}.csv`, blob);
}

// -------------------------------------------------------------------- PDF ---

/**
 * Les polices standard d'un PDF n'écrivent que du WinAnsi. Un seul caractère
 * en dehors de ce jeu et jsPDF bascule *toute* la chaîne en UTF-16 : la
 * cellule sort alors en charabia. Le piège est invisible — `toLocaleString`
 * sépare les milliers par une espace fine insécable (U+202F), donc tout
 * montant à quatre chiffres était illégible. On ramène donc chaque texte dans
 * le jeu disponible avant de l'écrire.
 */
const REMPLACEMENTS_PDF: [RegExp, string][] = [
  [/[\u00a0\u202f\u2007\u2009\u2060]/g, ' '],   // espaces insécables et fines
  [/[\u2010\u2011\u2012\u2212]/g, '-'],         // tirets et signe moins
  [/[\u25b8\u25b6\u2023\u27a4]/g, '\u00bb'],      // puces triangulaires
  [/[\u2713\u2714]/g, 'oui'],
];
/** Les 27 caractères WinAnsi hors Latin-1 (plage 0x80-0x9F) — ils passent tels quels. */
const WINANSI_EXTRA = '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d'
  + '\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';

export function texteWinAnsi(v: string): string {
  let out = v;
  for (const [re, to] of REMPLACEMENTS_PDF) out = out.replace(re, to);
  // Ce qui reste hors jeu (emoji d'une catégorie, symbole exotique) disparaît :
  // mieux vaut un libellé amputé qu'une ligne entière illisible.
  // Les espaces sont laissés tels quels : l'indentation des sous-lignes
  // d'un jeu et de ses postes est la structure du tableau, pas du bruit.
  return [...out]
    .map(c => (c.codePointAt(0)! < 0x100 || WINANSI_EXTRA.includes(c) ? c : ''))
    .join('');
}

/**
 * Toutes les tables du fichier passent par ici : le texte de chaque cellule est
 * assaini juste avant le rendu, et les réglages propres à la table sont
 * appliqués ensuite.
 */
function autoT(doc: jsPDF, options: UserOptions) {
  const suite = options.didParseCell;
  autoTable(doc, {
    ...options,
    didParseCell: (d) => {
      d.cell.text = d.cell.text.map(texteWinAnsi);
      // L'alignement d'une colonne vaut aussi pour son en-tête : « Poste » collé
      // à droite au-dessus de libellés à gauche, ça se lit de travers.
      const col = (options.columnStyles as Record<number, { halign?: Halign }> | undefined)
        ?.[d.column.index];
      if (d.section === 'head' && col?.halign && d.cell.colSpan === 1) {
        d.cell.styles.halign = col.halign;
      }
      suite?.(d);
    },
  });
}

/** Écrit une ligne de texte libre, assainie elle aussi. */
function texte(doc: jsPDF, v: string, x: number, y: number, options?: { align?: 'right' }) {
  doc.text(texteWinAnsi(v), x, y, options);
}

const eurosPDF = (v: number) =>
  v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function documentPDF(state: AppState, exercice: string): jsPDF {
  const { entries, referentiels: refs, finances, tresoManuel, previsionnels } = state;

  const doc = new jsPDF({ orientation: 'landscape' });
  const syn = syntheseExercice(entries, exercice, refs);
  const mois = syn.moisList;
  const finY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const titre = (t: string) => { doc.setFontSize(14); texte(doc, t, 14, 14); };
  const NOIR: [number, number, number] = [40, 40, 40];

  doc.setFontSize(18);
  texte(doc, `Big Budi Games — Rapport comptable ${exercice}`, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  texte(doc, `Généré le ${formatDateFR(today())} par BBG Compta`, 14, 22);
  doc.setTextColor(0);

  // Compte de résultat : le vrai, celui de l'écran — EBE, REX, IS, résultat net.
  const resultat = resultatDeSynthese(syn, entries, finances, refs);
  autoT(doc, {
    startY: 28,
    head: [['Compte de résultat', 'Montant']],
    body: resultat.map(l => [l.label, eurosPDF(l.total)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: NOIR },
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
    didParseCell: (d) => {
      const l = resultat[d.row.index];
      if (d.section === 'body' && l && l.niveau !== 'detail') d.cell.styles.fontStyle = 'bold';
    },
  });

  // Synthèse par mois, bloc par bloc
  const cats = refs.categoriesDepenses.filter(c => syn.charges.has(c));
  autoT(doc, {
    startY: finY() + 8,
    head: [['Mois', ...cats.map(c => c.length > 18 ? c.slice(0, 17) + '…' : c),
      'Charges HT', 'Personnel HT', 'Immos HT', 'Produits HT', 'Total dépenses TTC']],
    body: mois
      .filter(m => (syn.totalTTCParMois.get(m) ?? 0) !== 0 || (syn.totalProduitsParMois.get(m) ?? 0) !== 0)
      .map(m => [
        labelMois(m),
        ...cats.map(c => {
          const v = syn.charges.get(c)?.get(m) ?? 0;
          return v ? eurosPDF(r2(v)) : '·';
        }),
        eurosPDF(r2(syn.totalChargesParMois.get(m) ?? 0)),
        eurosPDF(r2(syn.totalPersonnelParMois.get(m) ?? 0)),
        eurosPDF(r2(syn.immoParMois.get(m) ?? 0)),
        eurosPDF(r2(syn.totalProduitsParMois.get(m) ?? 0)),
        eurosPDF(r2(syn.totalTTCParMois.get(m) ?? 0)),
      ]),
    styles: { fontSize: 6.5, halign: 'right' },
    headStyles: { fillColor: NOIR, fontSize: 6 },
    columnStyles: { 0: { halign: 'left' } },
  });

  // Journal détaillé
  doc.addPage();
  titre(`Journal détaillé — exercice ${exercice}`);
  const moisSet = new Set(moisExercice(exercice));
  const duJournal = entries
    .filter(e => moisSet.has(e.mois))
    .sort((a, b) => compareMois(a.mois, b.mois) || a.date.localeCompare(b.date));
  autoT(doc, {
    startY: 20,
    head: [['Mois', 'Date', 'Fournisseur', 'Description', 'Catégorie', 'Jeu', 'TTC', 'TVA', 'HT', 'Paiement', 'Type']],
    body: duJournal.map(e => [
      labelMois(e.mois), formatDateFR(e.date), e.fournisseur, e.description, e.categorie,
      e.jeu ?? '', eurosPDF(e.ttc), eurosPDF(e.tva), eurosPDF(e.ht), e.paiement, e.type,
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: NOIR },
    columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  });

  // Immobilisations et dépenses par jeu
  doc.addPage();
  titre('Immobilisations et dépenses par jeu');
  autoT(doc, {
    startY: 20,
    head: [['Date', 'Description', 'Catégorie', 'Jeu', 'HT', 'Durée', 'Dotation /an', 'VNC ce jour', 'Fin']],
    body: immoInfos(entries, refs).map(i => [
      formatDateFR(i.entry.date), i.entry.description, i.entry.categorie, i.entry.jeu ?? '',
      eurosPDF(i.entry.ht), `${i.duree} ans`, eurosPDF(i.dotationAn),
      eurosPDF(i.vnc(today())), formatDateFR(i.fin),
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: NOIR },
    columnStyles: { 4: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  });
  autoT(doc, {
    startY: finY() + 8,
    head: [['Jeu', 'Écritures', 'Charges HT', 'Immobilisé HT', 'Total HT', 'TVA', 'TTC']],
    body: bilanJeux(entries, refs.categoriesJeux).map(b => [
      b.jeu, String(b.nb), eurosPDF(b.charges), eurosPDF(b.immo),
      eurosPDF(b.ht), eurosPDF(b.tva), eurosPDF(b.ttc),
    ]),
    styles: { fontSize: 8, halign: 'right' },
    headStyles: { fillColor: NOIR },
    columnStyles: { 0: { halign: 'left' } },
  });

  // TVA + Trésorerie
  doc.addPage();
  titre('TVA et trésorerie');
  autoT(doc, {
    startY: 20,
    head: [['Mois', 'CA TTC', 'TVA collectée', 'Dépenses TTC', 'TVA déductible', 'Solde', 'Cumul']],
    body: tableauTVA(entries, moisExercice(exercice)).map(x => [
      labelMois(x.mois), eurosPDF(x.caTTC), eurosPDF(x.tvaCollectee),
      eurosPDF(x.depTTC), eurosPDF(x.tvaDeductible), eurosPDF(x.solde), eurosPDF(x.cumul),
    ]),
    styles: { fontSize: 8, halign: 'right' },
    headStyles: { fillColor: NOIR },
    columnStyles: { 0: { halign: 'left' } },
  });
  autoT(doc, {
    startY: finY() + 8,
    head: [['Mois', 'Solde initial', 'Encaissements', 'Décaissements', 'Financier',
      'Correction', 'Solde mensuel', 'Solde cumulé', 'Banque', 'Écart']],
    body: tableauTreso(entries, finances, moisTresorerie(entries, finances, moisCourant()),
      tresoManuel ?? {}).map(t => [
      labelMois(t.mois), eurosPDF(t.soldeInitial), eurosPDF(t.encJournal),
      eurosPDF(-t.decJournal), eurosPDF(t.financier), eurosPDF(t.ajustement),
      eurosPDF(t.soldeMensuel), eurosPDF(t.soldeCumule),
      t.soldeReel == null ? '·' : eurosPDF(t.soldeReel),
      t.ecart == null ? '·' : eurosPDF(t.ecart),
    ]),
    styles: { fontSize: 7, halign: 'right' },
    headStyles: { fillColor: NOIR, fontSize: 6.5 },
    columnStyles: { 0: { halign: 'left' } },
  });

  // Mouvements financiers : capital, compte courant d'associé, placements.
  if (finances.length) {
    autoT(doc, {
      startY: finY() + 8,
      head: [['Date', 'Mouvement financier', 'Type', 'Montant']],
      body: [...finances].sort((a, b) => a.date.localeCompare(b.date))
        .map(f => [formatDateFR(f.date), f.label, f.type, eurosPDF(r2(f.montant))]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: NOIR },
      columnStyles: { 3: { halign: 'right' } },
    });
  }

  // Stock : la position réelle, puis ce qui est prévu sur l'exercice.
  const positions = positionsStock(state.mouvementsStock ?? [], refs.jeux ?? []);
  const stockPrevu = stocksExercice(state.stocks ?? [], exercice, refs.jeux ?? []);
  if (positions.length || stockPrevu.length) {
    doc.addPage();
    titre(`Stocks — exercice ${exercice}`);
    if (positions.length) {
      autoT(doc, {
        startY: 20,
        head: [['Jeu', 'Entrés', 'Sortis', 'En stock', 'Coût moyen', 'Valeur',
          'Ventes HT', 'Coût des ventes', 'Marge']],
        body: positions.map(p => [
          p.jeu, String(p.entrees), String(p.sorties), String(p.stock),
          eurosPDF(p.coutMoyen), eurosPDF(p.valeur),
          eurosPDF(p.ca), eurosPDF(p.cogs), eurosPDF(p.marge),
        ]),
        styles: { fontSize: 8, halign: 'right' },
        headStyles: { fillColor: NOIR },
        columnStyles: { 0: { halign: 'left' } },
      });
    }
    if (stockPrevu.length) {
      autoT(doc, {
        startY: (positions.length ? finY() + 8 : 20),
        head: [['Jeu (prévu)', 'Coût rev.', 'Canaux (prix × exemplaires)', 'Fabriqués', 'Vendus',
          'Stock clôture', 'Tirages HT', 'Ventes HT', 'Variation stock', 'Marge']],
        body: stockPrevu.map(x => [
          x.ligne.jeu, eurosPDF(x.ligne.coutUnitaire),
          (x.ligne.canaux ?? []).filter(c => (x.total.parCanal.get(c.id)?.quantite ?? 0) > 0)
            .map(c => `${c.nom}${c.mode === 'repartition' ? ` ${c.repartition ?? 0} %` : ''}`
              + ` ${eurosPDF(c.prix)} × ${x.total.parCanal.get(c.id)!.quantite}`)
            .join('\n') || '—',
          String(x.total.fabrique), String(x.total.vendue), String(x.total.stockFin),
          eurosPDF(x.total.coutFabrication), eurosPDF(x.total.ca),
          eurosPDF(x.total.variationStock), eurosPDF(x.total.marge),
        ]),
        styles: { fontSize: 8, halign: 'right' },
        headStyles: { fillColor: NOIR },
        columnStyles: { 0: { halign: 'left' } },
      });
    }
  }

  // Prévisionnel de l'exercice
  const lignesPrev = ordreAffichage(previsionnels?.[exercice] ?? [], refs);
  if (lignesPrev.length) {
    doc.addPage();
    titre(`Prévisionnel ${exercice}`);
    const moisEx = moisExercice(exercice);
    autoT(doc, {
      startY: 20,
      head: [['Bloc', 'Ligne', 'Jeu', ...moisEx.map(m => labelMois(m)), 'Total']],
      body: lignesPrev.map(l => {
        const vals = valeursDe(l, lignesPrev);
        return [
          l.section, l.categorie, l.jeu ?? '',
          ...vals.map(v => v == null ? '·' : (l.unite ? String(r2(v)) : eurosPDF(r2(v)))),
          eurosPDF(r2(vals.reduce<number>((s, v) => s + (v ?? 0), 0))),
        ];
      }),
      styles: { fontSize: 6, halign: 'right' },
      headStyles: { fillColor: NOIR, fontSize: 5.5 },
      columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' }, 2: { halign: 'left' } },
    });
  }

  return doc;
}

export function blobPDF(state: AppState, exercice: string): Blob {
  return documentPDF(state, exercice).output('blob');
}

export function exportPDF(state: AppState, exercice: string) {
  documentPDF(state, exercice).save(`BBG_Rapport_${exercice}_${today()}.pdf`);
}

// ------------------------------------------- PDF : un mois, une synthèse ---

/** Un « #rrggbb » en triplet jsPDF. Les PDF reprennent la palette de l'écran. */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** En-tête commun aux PDF de trace : titre, sous-titre, date. Rend le Y libre. */
function enTetePDF(doc: jsPDF, titre: string, sousTitre: string): number {
  doc.setFontSize(17);
  doc.setTextColor(0);
  texte(doc, titre, 14, 15);
  doc.setFontSize(10);
  doc.setTextColor(120);
  texte(doc, sousTitre, 14, 21);
  texte(doc, `Édité le ${formatDateFR(today())} par BBG Compta v${APP_VERSION}`, 14, 26);
  doc.setTextColor(0);
  return 31;
}

/** Pied de page : la mention à gauche, la pagination à droite. */
function paginer(doc: jsPDF, mention: string) {
  const total = doc.getNumberOfPages();
  const { width, height } = doc.internal.pageSize;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(150);
    texte(doc, mention, 14, height - 6);
    texte(doc, `${i} / ${total}`, width - 14, height - 6, { align: 'right' });
  }
  doc.setTextColor(0);
}

const finYDe = (doc: jsPDF) =>
  (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/**
 * Colonnes des tableaux du Journal du mois, dans l'ordre de l'écran. La
 * colonne « Jeu » n'existe que pour le tableau des dépenses jeux.
 */
const COLS_JOURNAL = ['Date', 'Fournisseur', 'Description', 'Catégorie',
  'TTC', 'TVA', 'HT', 'Paiement', 'Compte', 'Mots clés', 'Facture'];

/**
 * Le Journal du mois en PDF : les quatre tableaux de l'écran, ligne à ligne,
 * chacun avec son total — de quoi garder la trace d'un mois clos, ou la
 * transmettre au comptable sans lui envoyer tout l'exercice.
 */
function documentPDFMois(state: AppState, mois: string): jsPDF {
  const { entries, referentiels: refs, blocCouleurs } = state;
  const doc = new jsPDF({ orientation: 'landscape' });
  const sections = sectionsDuMois(entries, mois, refs);
  const teinte = (cle: BlocCle) => teinteBloc(cle, blocCouleurs ?? {});

  let y = enTetePDF(doc, `Journal comptable — ${labelMoisLong(mois)}`,
    `Big Budi Games · exercice ${exerciceDuMois(mois)} · écritures réelles du journal`);

  // Le mois en quatre chiffres, avant le détail : ce qui est sorti, ce qui est
  // rentré, ce qu'il en reste — le même résumé que les tuiles de l'écran.
  const depenses = sumTTH([...sections.charges, ...sections.immos]);
  const jeux = sumTTH(sections.jeux);
  const produits = sumTTH(sections.produits);
  const sortiesTTC = r2(depenses.ttc + jeux.ttc);
  const sortiesHT = r2(depenses.ht + jeux.ht);
  const nb = sections.charges.length + sections.immos.length
    + sections.jeux.length + sections.produits.length;
  autoT(doc, {
    startY: y,
    head: [['Résumé du mois', 'TTC', 'HT', 'Lignes']],
    body: [
      ['Dépenses (charges, immobilisations et jeux)', eurosPDF(sortiesTTC), eurosPDF(sortiesHT),
        String(sections.charges.length + sections.immos.length + sections.jeux.length)],
      ['dont dépenses jeux', eurosPDF(jeux.ttc), eurosPDF(jeux.ht), String(sections.jeux.length)],
      ['Recettes', eurosPDF(produits.ttc), eurosPDF(produits.ht), String(sections.produits.length)],
      ['Solde du mois', eurosPDF(r2(produits.ttc - sortiesTTC)), eurosPDF(r2(produits.ht - sortiesHT)),
        String(nb)],
    ],
    styles: { fontSize: 9, halign: 'right' },
    headStyles: { fillColor: rgb(teinte('resultat').base), textColor: 20 },
    columnStyles: { 0: { halign: 'left', cellWidth: 110 } },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      if (d.row.index === 1) { d.cell.styles.textColor = 120; d.cell.styles.fontSize = 8; }
      if (d.row.index === 3) d.cell.styles.fontStyle = 'bold';
    },
  });
  y = finYDe(doc) + 7;

  /**
   * Un tableau de section. Le titre voyage dans l'en-tête plutôt qu'en texte
   * libre : sur une coupure de page il repart avec le tableau, au lieu de
   * rester tout seul en bas de la page précédente.
   */
  function tableauSection(titre: string, rows: JournalEntry[], cle: BlocCle, avecJeu: boolean) {
    const t = teinte(cle);
    const cols = avecJeu
      ? [...COLS_JOURNAL.slice(0, 4), 'Jeu', ...COLS_JOURNAL.slice(4)]
      : COLS_JOURNAL;
    const tot = sumTTH(rows);
    const iTTC = avecJeu ? 5 : 4;
    const vide = Array(cols.length).fill('');
    const pied = [...vide];
    pied[0] = `Total — ${rows.length} ligne${rows.length > 1 ? 's' : ''}`;
    pied[iTTC] = eurosPDF(tot.ttc);
    pied[iTTC + 1] = eurosPDF(tot.tva);
    pied[iTTC + 2] = eurosPDF(tot.ht);
    autoT(doc, {
      startY: y,
      head: [
        [{ content: titre, colSpan: cols.length,
          styles: { halign: 'left' as const, fillColor: rgb(t.total), textColor: rgb(t.fonce),
            fontSize: 11, cellPadding: 2 } }],
        cols,
      ],
      body: rows.length
        ? [...rows].sort((a, b) => a.date.localeCompare(b.date)).map(e => {
          const base = [formatDateFR(e.date), e.fournisseur, e.description, e.categorie];
          const fin = [eurosPDF(e.ttc), eurosPDF(e.tva), eurosPDF(e.ht), e.paiement,
            e.compta ?? '', e.motsCles ?? '', e.facture ?? ''];
          return avecJeu ? [...base, e.jeu ?? '', ...fin] : [...base, ...fin];
        })
        : [[{ content: 'Aucune écriture sur ce mois.', colSpan: cols.length,
          styles: { halign: 'center' as const, textColor: 140, fontStyle: 'italic' as const } }]],
      foot: rows.length ? [pied] : undefined,
      showFoot: 'lastPage',
      styles: { fontSize: 7.5, cellPadding: 1.4, overflow: 'linebreak' },
      headStyles: { fillColor: rgb(t.base), textColor: rgb(t.fonce), fontSize: 7.5 },
      footStyles: { fillColor: rgb(t.total), textColor: rgb(t.fonce), fontStyle: 'bold' },
      alternateRowStyles: { fillColor: rgb(t.tresClair) },
      columnStyles: {
        [iTTC]: { halign: 'right', cellWidth: 20 },
        [iTTC + 1]: { halign: 'right', cellWidth: 18 },
        [iTTC + 2]: { halign: 'right', cellWidth: 20 },
        0: { cellWidth: 18 },
      },
    });
    y = finYDe(doc) + 6;
  }

  tableauSection('Charges', sections.charges, 'charges', false);
  tableauSection("Immobilisations (portées à l'actif, amorties)", sections.immos, 'immos', false);
  tableauSection('Dépenses Jeux (développement & droits)', sections.jeux, 'jeux', true);
  tableauSection('Produits (revenus)', sections.produits, 'produits', false);

  // Le même mois vu par catégorie : le contrôle rapide avant de clore.
  const recap = (
    titre: string, groupes: Map<string, number>, cle: BlocCle, entete = '% du bloc',
  ) => {

    if (!groupes.size) return;
    const t = teinte(cle);
    // Un en-tête seul en bas de page, son tableau à la page suivante : on
    // préfère changer de page tout de suite.
    if (y > 170) { doc.addPage(); y = 16; }
    const tot = r2([...groupes.values()].reduce((s, x) => s + x, 0));
    const part = (v: number) => tot
      ? `${r2(v / tot * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1 })} %` : '·';
    autoT(doc, {
      startY: y,
      head: [[titre, 'HT', entete]],
      body: [...groupes.entries()]
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .map(([nom, v]) => [nom, eurosPDF(r2(v)), part(v)]),
      foot: [['TOTAL', eurosPDF(tot), tot ? '100,0 %' : '·']],
      showFoot: 'lastPage',
      styles: { fontSize: 8, halign: 'right' },
      headStyles: { fillColor: rgb(t.base), textColor: rgb(t.fonce) },
      footStyles: { fillColor: rgb(t.total), textColor: rgb(t.fonce), fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'left', cellWidth: 80 }, 1: { cellWidth: 26 }, 2: { cellWidth: 22 } },
      margin: { left: 14 },
      tableWidth: 128,
    });
    y = finYDe(doc) + 6;
  };
  const toutes = [...sections.charges, ...sections.immos, ...sections.jeux,
    ...sections.produits];
  if (toutes.length) {
    const depenses = [...sections.charges, ...sections.immos, ...sections.jeux];
    doc.addPage();
    y = enTetePDF(doc, `Récapitulatif — ${labelMoisLong(mois)}`,
      'Par catégorie puis par mot clé, montants HT, le mois seul');
    recap('Dépenses par catégorie', sumParCategorie(depenses), 'charges');
    recap('Produits par catégorie', sumParCategorie(sections.produits), 'produits');
    // Les mots clés rattachent une écriture à un événement (un salon, un
    // festival) : ce décompte-là répond à « combien m'a coûté Cannes ». Il ne
    // couvre que les lignes qui en portent un, d'où son pourcentage à part.
    recap('Dépenses par mot clé (lignes sans mot clé exclues)',
      sumParMotCle(depenses), 'personnel', '%');
    recap('Produits par mot clé (lignes sans mot clé exclues)',
      sumParMotCle(sections.produits), 'personnel', '%');
  }

  paginer(doc, `Big Budi Games — journal de ${labelMoisLong(mois)}`);
  return doc;
}

export function blobPDFMois(state: AppState, mois: string): Blob {
  return documentPDFMois(state, mois).output('blob');
}

export function exportPDFMois(state: AppState, mois: string) {
  documentPDFMois(state, mois).save(`BBG_Journal_${mois}_${today()}.pdf`);
}

// ----------------------------------------------------- PDF : les synthèses -

/**
 * Découpe un bloc de la synthèse en deux lectures : le fonctionnement de la
 * structure, puis les jeux — le même partage qu'à l'écran depuis la v1.28.
 */
function vuesDeBloc(
  cats: string[], data: Map<string, Map<string, number>>,
  parJeu: Map<string, Map<string, Map<string, number>>> | undefined,
  jeuxCatalogue: string[],
) {
  const bruts = [...(parJeu?.keys() ?? [])];
  const jeux = [
    ...jeuxCatalogue.filter(j => bruts.includes(j)),
    ...bruts.filter(j => !jeuxCatalogue.includes(j)),
  ];
  return { cats, jeux, data };
}

/**
 * La synthèse annuelle en PDF : compte de résultat, puis chaque bloc mois par
 * mois — fonctionnement d'un côté, jeux de l'autre —, les immobilisations et
 * la TVA. Ce que montre l'écran, figé sur le papier.
 */
function documentPDFSynthese(state: AppState, exercice: string, base: BaseMontant): jsPDF {
  const { entries, referentiels: refs, finances, blocCouleurs } = state;
  const doc = new jsPDF({ orientation: 'landscape' });
  const teinte = (cle: BlocCle) => teinteBloc(cle, blocCouleurs ?? {});
  const unite = base === 'ttc' ? 'TTC' : 'HT';
  const syn = syntheseExercice(entries, exercice, refs, base);
  const mois = syn.moisList;
  const immos = immoInfos(entries, refs);
  const catalogue = refs.jeux ?? [];

  /** Le total annuel d'une carte « mois -> montant ». */
  const total = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));

  let y = enTetePDF(doc, `Synthèse annuelle — exercice ${exercice}`,
    `Big Budi Games · montants ${unite} · écritures réelles du journal`);

  // Compte de résultat : toujours en HT, quoi qu'affiche le bouton de l'écran.
  const synHT = base === 'ht' ? syn : syntheseExercice(entries, exercice, refs, 'ht');
  const resultat = resultatDeSynthese(synHT, entries, finances, refs);
  const tR = teinte('resultat');
  autoT(doc, {
    startY: y,
    head: [
      [{ content: `Compte de résultat ${exercice} (HT)`, colSpan: mois.length + 2,
        styles: { halign: 'left' as const, fillColor: rgb(tR.total), textColor: rgb(tR.fonce),
          fontSize: 11, cellPadding: 2 } }],
      ['Poste', ...mois.map(m => labelMois(m)), 'Total'],
    ],
    body: resultat.map(l => [
      l.label,
      ...mois.map(m => l.parMois ? eurosPDF(l.parMois.get(m) ?? 0) : '·'),
      eurosPDF(l.total),
    ]),
    styles: { fontSize: 6.2, halign: 'right', cellPadding: 1.2 },
    headStyles: { fillColor: rgb(tR.base), textColor: rgb(tR.fonce), fontSize: 6 },
    columnStyles: { 0: { halign: 'left', cellWidth: 52 } },
    didParseCell: (d) => {
      const l = resultat[d.row.index];
      if (d.section === 'body' && l && l.niveau !== 'detail') d.cell.styles.fontStyle = 'bold';
    },
  });
  y = finYDe(doc) + 6;

  /**
   * Un bloc de la synthèse : un tableau catégories × mois, avec son total.
   * `totalAffiche` permet d'imposer le total de droite quand il ne doit pas
   * être la somme des colonnes — c'est le cas du fonctionnement, qui se lit
   * « bloc moins jeux », exactement comme la carte de l'écran.
   */
  function tableauBloc(
    titre: string, cle: BlocCle, lignes: { label: string; parMois: Map<string, number> }[],
    totaux: Map<string, number>, totalAffiche?: number, colonne = 'Catégorie',
  ) {
    if (!lignes.length) return;
    const t = teinte(cle);
    // Un tableau qui déborde repart avec son en-tête coloré sur la page
    // suivante : on ne saute de page que s'il ne reste vraiment rien.
    if (y > 170) { doc.addPage(); y = 16; }
    autoT(doc, {
      startY: y,
      head: [
        [{ content: titre, colSpan: mois.length + 2,
          styles: { halign: 'left' as const, fillColor: rgb(t.total), textColor: rgb(t.fonce),
            fontSize: 10.5, cellPadding: 2 } }],
        [colonne, ...mois.map(m => labelMois(m)), 'Total'],
      ],
      body: lignes.map(l => [
        l.label,
        ...mois.map(m => { const v = r2(l.parMois.get(m) ?? 0); return v ? eurosPDF(v) : '·'; }),
        eurosPDF(total(l.parMois)),
      ]),
      foot: [['TOTAL',
        ...mois.map(m => eurosPDF(r2(totaux.get(m) ?? 0))),
        eurosPDF(totalAffiche ?? total(totaux))]],
      showFoot: 'lastPage',
      styles: { fontSize: 6.2, halign: 'right', cellPadding: 1.2 },
      headStyles: { fillColor: rgb(t.base), textColor: rgb(t.fonce), fontSize: 6 },
      footStyles: { fillColor: rgb(t.total), textColor: rgb(t.fonce), fontStyle: 'bold', fontSize: 6.2 },
      alternateRowStyles: { fillColor: rgb(t.tresClair) },
      columnStyles: { 0: { halign: 'left', cellWidth: 52 } },
    });
    y = finYDe(doc) + 6;
  }

  /** Ce qu'un jeu pèse mois par mois, tous ses postes confondus. */
  const cumulJeux = (parJeu: Map<string, Map<string, Map<string, number>>>, jeu: string) => {
    const out = new Map<string, number>();
    for (const m of mois) {
      out.set(m, r2([...(parJeu.get(jeu)?.values() ?? [])]
        .reduce((s, pm) => s + (pm.get(m) ?? 0), 0)));
    }
    return out;
  };
  const catsDe = (source: Map<string, Map<string, number>>, ref: string[], exclues: Set<string>) =>
    ref.filter(c => source.has(c) && !exclues.has(c))
      .concat([...source.keys()].filter(c => !ref.includes(c) && !exclues.has(c)));

  /** Un bloc complet : le fonctionnement, puis la carte des jeux s'il y en a. */
  function bloc(
    titre: string, cle: BlocCle, data: Map<string, Map<string, number>>, ref: string[],
    totaux: Map<string, number>,
    parJeu?: Map<string, Map<string, Map<string, number>>>,
    titreJeux?: string,
  ) {
    const catsJeux = new Set([...(parJeu?.values() ?? [])].flatMap(m => [...m.keys()]));
    const v = vuesDeBloc(catsDe(data, ref, catsJeux), data, parJeu, catalogue);
    // Le total du fonctionnement est ce qui reste du bloc une fois les jeux
    // retirés, comme à l'écran — pas la somme des lignes listées : une catégorie
    // peut porter à la fois des dépenses de jeu et de structure. Ainsi les deux
    // sous-totaux font exactement celui du bloc, au centime.
    // Un seul arrondi par mois, tous jeux et tous postes confondus : c'est le
    // chemin de calcul de la carte à l'écran, et deux arrondis en cascade
    // feraient diverger l'écran et le papier d'un centime.
    const totJeux = new Map(mois.map(m =>
      [m, r2([...(parJeu?.values() ?? [])].reduce((x, postes) =>
        x + [...postes.values()].reduce((y, pm) => y + (pm.get(m) ?? 0), 0), 0))]));
    const totFonctionnement = new Map(mois.map(m =>
      [m, r2((totaux.get(m) ?? 0) - (totJeux.get(m) ?? 0))]));
    const grandTotal = total(totaux);
    const totalJeux = total(totJeux);
    tableauBloc(`${titre} (${unite})`, cle,
      v.cats.map(c => ({ label: c, parMois: data.get(c) ?? new Map() })),
      v.jeux.length ? totFonctionnement : totaux,
      v.jeux.length ? r2(grandTotal - totalJeux) : grandTotal);
    if (!parJeu || !v.jeux.length) return;
    // Les jeux dans leur propre tableau : même bloc comptable, lecture séparée.
    const lignes = v.jeux.flatMap(j => [
      { label: `» ${j}`, parMois: cumulJeux(parJeu, j) },
      ...[...(parJeu.get(j)?.entries() ?? [])].map(([c, pm]) => ({ label: `    ${c}`, parMois: pm })),
    ]);
    tableauBloc(`${titreJeux ?? `${titre} — jeux`} (${unite})`, 'jeux', lignes,
      totJeux, totalJeux, 'Jeu / poste');
  }

  bloc('Produits par catégorie', 'produits', syn.produits, refs.categoriesProduits,
    syn.totalProduitsParMois);
  bloc('Charges par catégorie', 'charges', syn.charges, refs.categoriesDepenses,
    syn.totalChargesParMois, syn.jeuxParJeuEtCategorie);
  bloc('Personnel & rémunérations', 'personnel', syn.personnel, refs.categoriesDepenses,
    syn.totalPersonnelParMois);
  bloc('Immobilisations — investissements', 'immos', syn.immos, refs.categoriesDepenses,
    syn.immoParMois, syn.immosParJeuEtCategorie, 'Immobilisations — jeux');

  // Dotations : l'usure de l'exercice, qui seule pèse sur le résultat.
  const dotations = dotationsParMois(immos, mois);
  tableauBloc('Dotations aux amortissements (HT)', 'immos',
    [{ label: "Dotation de l'exercice", parMois: dotations }], dotations);

  // TVA
  doc.addPage();
  y = enTetePDF(doc, `TVA — exercice ${exercice}`,
    'Collectée sur les produits, déductible sur les dépenses, mois par mois');
  const tT = teinte('tva');
  autoT(doc, {
    startY: y,
    head: [['Mois', 'CA TTC', 'TVA collectée', 'Dépenses TTC', 'TVA déductible',
      'Solde du mois', 'Cumul']],
    body: tableauTVA(entries, mois).map(x => [
      labelMois(x.mois), eurosPDF(x.caTTC), eurosPDF(x.tvaCollectee),
      eurosPDF(x.depTTC), eurosPDF(x.tvaDeductible), eurosPDF(x.solde), eurosPDF(x.cumul),
    ]),
    styles: { fontSize: 8, halign: 'right' },
    headStyles: { fillColor: rgb(tT.base), textColor: rgb(tT.fonce) },
    alternateRowStyles: { fillColor: rgb(tT.tresClair) },
    columnStyles: { 0: { halign: 'left' } },
  });
  y = finYDe(doc) + 8;

  // Récapitulatif : les masses, puis la cascade jusqu'au résultat net.
  const de = (cle: string) => resultat.find(l => l.cle === cle)?.total ?? 0;
  autoT(doc, {
    startY: y,
    head: [[`Récapitulatif de l'exercice ${exercice} (${unite})`, 'Montant']],
    body: [
      ['PRODUITS', eurosPDF(total(syn.totalProduitsParMois))],
      ['CHARGES', eurosPDF(-total(syn.totalChargesParMois))],
      ['PERSONNEL', eurosPDF(-total(syn.totalPersonnelParMois))],
      ['dont dépenses jeux (comprises dans les charges)', eurosPDF(total(syn.totalJeuxParMois))],
      ['dont charges financières (reprises plus bas)', eurosPDF(total(syn.chargesFinancieresParMois))],
      ["EXCÉDENT BRUT D'EXPLOITATION", eurosPDF(de('ebe'))],
      ['Dotations aux amortissements', eurosPDF(-de('dotations'))],
      ["RÉSULTAT D'EXPLOITATION", eurosPDF(de('rex'))],
      ['Produits financiers', eurosPDF(de('pf'))],
      ['Charges financières', eurosPDF(-de('cf'))],
      ['RÉSULTAT COURANT AVANT IMPÔT', eurosPDF(de('rc'))],
      ['Impôt sur les sociétés', eurosPDF(-de('is'))],
      ['RÉSULTAT NET', eurosPDF(de('rn'))],
      ["Investi sur l'exercice (immobilisations)", eurosPDF(total(syn.immoParMois))],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: rgb(tR.base), textColor: rgb(tR.fonce) },
    columnStyles: { 0: { cellWidth: 110 }, 1: { halign: 'right', cellWidth: 36 } },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const label = String(d.row.raw ? (d.row.raw as string[])[0] : '');
      if (label.startsWith('dont')) { d.cell.styles.textColor = 120; d.cell.styles.fontSize = 8; }
      else if (label === label.toUpperCase()) d.cell.styles.fontStyle = 'bold';
    },
  });

  paginer(doc, `Big Budi Games — synthèse ${exercice} (${unite})`);
  return doc;
}

export function blobPDFSynthese(state: AppState, exercice: string, base: BaseMontant = 'ht'): Blob {
  return documentPDFSynthese(state, exercice, base).output('blob');
}

export function exportPDFSynthese(state: AppState, exercice: string, base: BaseMontant = 'ht') {
  documentPDFSynthese(state, exercice, base)
    .save(`BBG_Synthese_${exercice}_${today()}.pdf`);
}

/**
 * La synthèse totale en PDF : la même lecture, mais une colonne par exercice.
 * Les cinq exercices tiennent dans une page en largeur — la trajectoire se lit
 * d'un coup.
 */
function documentPDFSyntheseTotale(state: AppState, base: BaseMontant): jsPDF {
  const { entries, referentiels: refs, finances, blocCouleurs } = state;
  const doc = new jsPDF({ orientation: 'landscape' });
  const teinte = (cle: BlocCle) => teinteBloc(cle, blocCouleurs ?? {});
  const unite = base === 'ttc' ? 'TTC' : 'HT';
  const exercices = [...EXERCICES];
  const syns = exercices.map(ex => ({ ex, syn: syntheseExercice(entries, ex, refs, base) }));
  const immos = immoInfos(entries, refs);
  const catalogue = refs.jeux ?? [];

  let y = enTetePDF(doc, 'Synthèse totale 2025-30',
    `Big Budi Games · montants ${unite} · une colonne par exercice · écritures réelles`);

  const total = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));
  /** Le cumul d'une carte « exercice -> montant » sur les cinq exercices. */
  const cumul = (m: Map<string, number>) =>
    r2(exercices.reduce((s, ex) => s + (m.get(ex) ?? 0), 0));
  /** Pivote « catégorie -> mois » en « catégorie -> exercice ». */
  const pivot = (lire: (s: SyntheseExercice) => Map<string, Map<string, number>>) => {
    const out = new Map<string, Map<string, number>>();
    for (const { ex, syn } of syns) {
      for (const [cat, parMois] of lire(syn)) {
        if (!out.has(cat)) out.set(cat, new Map());
        out.get(cat)!.set(ex, total(parMois));
      }
    }
    return out;
  };
  const pivotTotal = (lire: (s: SyntheseExercice) => Map<string, number>) =>
    new Map(syns.map(({ ex, syn }) => [ex, total(lire(syn))]));
  const pivotJeux = (
    lire: (s: SyntheseExercice) => Map<string, Map<string, Map<string, number>>>,
  ) => {
    const out = new Map<string, Map<string, Map<string, number>>>();
    for (const { ex, syn } of syns) {
      for (const [jeu, parCat] of lire(syn)) {
        if (!out.has(jeu)) out.set(jeu, new Map());
        for (const [cat, parMois] of parCat) {
          if (!out.get(jeu)!.has(cat)) out.get(jeu)!.set(cat, new Map());
          out.get(jeu)!.get(cat)!.set(ex, total(parMois));
        }
      }
    }
    return out;
  };

  /** Compte de résultat par exercice — toujours en HT. */
  const resultats = new Map(exercices.map(ex => {
    const ht = base === 'ht'
      ? syns.find(x => x.ex === ex)!.syn
      : syntheseExercice(entries, ex, refs, 'ht');
    return [ex, resultatDeSynthese(ht, entries, finances, refs)];
  }));
  const lignesResultat = resultats.get(exercices[0]) ?? [];
  const tR = teinte('resultat');
  autoT(doc, {
    startY: y,
    head: [
      [{ content: 'Compte de résultat par exercice (HT)', colSpan: exercices.length + 2,
        styles: { halign: 'left' as const, fillColor: rgb(tR.total), textColor: rgb(tR.fonce),
          fontSize: 11, cellPadding: 2 } }],
      ['Poste', ...exercices, 'Cumul'],
    ],
    body: lignesResultat.map((l, i) => {
      const vals = exercices.map(ex => resultats.get(ex)![i]?.total ?? 0);
      return [l.label, ...vals.map(v => eurosPDF(r2(v))),
        eurosPDF(r2(vals.reduce((s, v) => s + v, 0)))];
    }),
    styles: { fontSize: 8, halign: 'right' },
    headStyles: { fillColor: rgb(tR.base), textColor: rgb(tR.fonce) },
    columnStyles: { 0: { halign: 'left', cellWidth: 70 } },
    didParseCell: (d) => {
      const l = lignesResultat[d.row.index];
      if (d.section === 'body' && l && l.niveau !== 'detail') d.cell.styles.fontStyle = 'bold';
    },
  });
  y = finYDe(doc) + 6;

  function tableauBloc(
    titre: string, cle: BlocCle, lignes: { label: string; parEx: Map<string, number> }[],
    totaux: Map<string, number>, totalAffiche?: number, colonne = 'Catégorie',
  ) {
    if (!lignes.length) return;
    const t = teinte(cle);
    // Un tableau qui déborde repart avec son en-tête coloré sur la page
    // suivante : on ne saute de page que s'il ne reste vraiment rien.
    if (y > 170) { doc.addPage(); y = 16; }
    autoT(doc, {
      startY: y,
      head: [
        [{ content: titre, colSpan: exercices.length + 2,
          styles: { halign: 'left' as const, fillColor: rgb(t.total), textColor: rgb(t.fonce),
            fontSize: 10.5, cellPadding: 2 } }],
        [colonne, ...exercices, 'Cumul'],
      ],
      body: lignes.map(l => [
        l.label,
        ...exercices.map(ex => { const v = r2(l.parEx.get(ex) ?? 0); return v ? eurosPDF(v) : '·'; }),
        eurosPDF(cumul(l.parEx)),
      ]),
      foot: [['TOTAL', ...exercices.map(ex => eurosPDF(r2(totaux.get(ex) ?? 0))),
        eurosPDF(totalAffiche ?? cumul(totaux))]],
      showFoot: 'lastPage',
      styles: { fontSize: 8, halign: 'right' },
      headStyles: { fillColor: rgb(t.base), textColor: rgb(t.fonce) },
      footStyles: { fillColor: rgb(t.total), textColor: rgb(t.fonce), fontStyle: 'bold' },
      alternateRowStyles: { fillColor: rgb(t.tresClair) },
      columnStyles: { 0: { halign: 'left', cellWidth: 70 } },
    });
    y = finYDe(doc) + 6;
  }

  function bloc(
    titre: string, cle: BlocCle, data: Map<string, Map<string, number>>, ref: string[],
    totaux: Map<string, number>,
    parJeu?: Map<string, Map<string, Map<string, number>>>,
    titreJeux?: string,
  ) {
    const catsJeux = new Set([...(parJeu?.values() ?? [])].flatMap(m => [...m.keys()]));
    const cats = ref.filter(c => data.has(c) && !catsJeux.has(c))
      .concat([...data.keys()].filter(c => !ref.includes(c) && !catsJeux.has(c)));
    const bruts = [...(parJeu?.keys() ?? [])];
    const jeux = [...catalogue.filter(j => bruts.includes(j)),
      ...bruts.filter(j => !catalogue.includes(j))];
    const parJeuEx = (j: string) => new Map(exercices.map(ex =>
      [ex, r2([...(parJeu?.get(j)?.values() ?? [])].reduce((s, m) => s + (m.get(ex) ?? 0), 0))]));
    // Même règle qu'à l'écran : fonctionnement = bloc − jeux, arrondi une fois.
    const totJeux = new Map(exercices.map(ex =>
      [ex, r2([...(parJeu?.values() ?? [])].reduce((x, postes) =>
        x + [...postes.values()].reduce((y, m) => y + (m.get(ex) ?? 0), 0), 0))]));
    const totFonctionnement = new Map(exercices.map(ex =>
      [ex, r2((totaux.get(ex) ?? 0) - (totJeux.get(ex) ?? 0))]));
    const grandTotal = cumul(totaux);
    const totalJeux = cumul(totJeux);
    tableauBloc(`${titre} (${unite})`, cle,
      cats.map(c => ({ label: c, parEx: data.get(c) ?? new Map() })),
      jeux.length ? totFonctionnement : totaux,
      jeux.length ? r2(grandTotal - totalJeux) : grandTotal);
    if (!parJeu || !jeux.length) return;
    const lignes = jeux.flatMap(j => [
      { label: `» ${j}`, parEx: parJeuEx(j) },
      ...[...(parJeu.get(j)?.entries() ?? [])].map(([c, m]) => ({ label: `    ${c}`, parEx: m })),
    ]);
    tableauBloc(`${titreJeux ?? `${titre} — jeux`} (${unite})`, 'jeux', lignes,
      totJeux, totalJeux, 'Jeu / poste');
  }

  bloc('Produits par catégorie', 'produits', pivot(s => s.produits), refs.categoriesProduits,
    pivotTotal(s => s.totalProduitsParMois));
  bloc('Charges par catégorie', 'charges', pivot(s => s.charges), refs.categoriesDepenses,
    pivotTotal(s => s.totalChargesParMois), pivotJeux(s => s.jeuxParJeuEtCategorie));
  bloc('Personnel & rémunérations', 'personnel', pivot(s => s.personnel), refs.categoriesDepenses,
    pivotTotal(s => s.totalPersonnelParMois));
  bloc('Immobilisations — investissements', 'immos', pivot(s => s.immos), refs.categoriesDepenses,
    pivotTotal(s => s.immoParMois), pivotJeux(s => s.immosParJeuEtCategorie),
    'Immobilisations — jeux');

  // Dotations, exercice par exercice.
  const dotations = new Map(exercices.map(ex =>
    [ex, total(dotationsParMois(immos, moisExercice(ex)))]));
  tableauBloc('Dotations aux amortissements (HT)', 'immos',
    [{ label: "Dotation de l'exercice", parEx: dotations }], dotations);

  paginer(doc, `Big Budi Games — synthèse totale 2025-30 (${unite})`);
  return doc;
}

export function blobPDFSyntheseTotale(state: AppState, base: BaseMontant = 'ht'): Blob {
  return documentPDFSyntheseTotale(state, base).output('blob');
}

export function exportPDFSyntheseTotale(state: AppState, base: BaseMontant = 'ht') {
  documentPDFSyntheseTotale(state, base).save(`BBG_Synthese_totale_${today()}.pdf`);
}

// ---------------------------------------------------------------- Sauvegarde -

export async function blobBackup(state: AppState, avecFichiers = true): Promise<Blob> {
  // Les justificatifs vivent dans IndexedDB : on les embarque en base64 pour
  // que la sauvegarde soit vraiment complète (et restaurable sur une autre machine).
  const fichiers = avecFichiers ? await exporterFichiers() : [];
  const data = {
    format: 'bbg-compta-backup',
    // v5 : les mouvements financiers seulement prévus rejoignent la sauvegarde.
    // v4 y avait fait entrer le stock — prévisionnel et mouvements réels — et
    // v3 les corrections manuelles de trésorerie et les couleurs des blocs,
    // qu'une restauration perdait.
    version: 5,
    exportedAt: new Date().toISOString(),
    entries: state.entries,
    finances: state.finances,
    mouvementsPrev: state.mouvementsPrev,
    referentiels: state.referentiels,
    budgets: state.budgets,
    previsionnels: state.previsionnels,
    chronologie: state.chronologie,
    tresoPrev: state.tresoPrev,
    tresoManuel: state.tresoManuel,
    stocks: state.stocks,
    mouvementsStock: state.mouvementsStock,
    journalFormats: state.journalFormats,
    colWidths: state.colWidths,
    blocCouleurs: state.blocCouleurs,
    fichiers,
  };
  return new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
}

export async function exportBackup(state: AppState, avecFichiers = true) {
  download(`BBG_Compta_sauvegarde_${today()}.json`, await blobBackup(state, avecFichiers));
}

// --------------------------------------------- Version partageable (HTML) --

/** Le fichier à envoyer au comptable : tout est dedans, rien n'est modifiable. */
export function blobPartage(state: AppState, exercice: string): Blob {
  return new Blob([pageLectureSeule(state, exercice)], { type: 'text/html;charset=utf-8' });
}

export function exportPartage(state: AppState, exercice: string): { nom: string; taille: number } {
  const blob = blobPartage(state, exercice);
  const nom = `BBG_Compta_${exercice}_lecture_seule.html`;
  download(nom, blob);
  return { nom, taille: blob.size };
}

// ------------------------------------------------------- Export groupé ZIP --

export interface ResultatZip { nom: string; taille: number; fichiers: string[] }

/**
 * Les quatre exports d'un coup, dans une seule archive : le classeur Excel,
 * le rapport PDF, le CSV du journal et la sauvegarde JSON complète.
 * Un fichier « Lisez-moi.txt » rappelle à quoi sert chaque pièce.
 */
export async function exportTout(state: AppState, exercice: string,
  options: { avecFactures?: boolean } = {}): Promise<ResultatZip> {
  const jour = today();
  const pieces: FichierZip[] = [
    { nom: `BBG_Compta_${exercice}.xlsx`, data: blobExcel(state, exercice) },
    { nom: `BBG_Rapport_${exercice}.pdf`, data: blobPDF(state, exercice) },
  ];
  const csv = blobCSV(state.entries);
  if (csv) pieces.push({ nom: 'BBG_Journal.csv', data: csv });
  pieces.push({
    nom: `BBG_Compta_${exercice}_lecture_seule.html`,
    data: blobPartage(state, exercice),
  });
  // La sauvegarde embarque déjà les justificatifs en base64 : inutile de les
  // dupliquer en fichiers séparés quand le dossier Factures est demandé.
  pieces.push({
    nom: 'BBG_Compta_sauvegarde.json',
    data: await blobBackup(state, !options.avecFactures),
  });

  let nbFactures = 0;
  if (options.avecFactures) {
    for (const f of await fichiersFactures(state.entries)) { pieces.push(f); nbFactures++; }
  }

  pieces.push({ nom: 'Lisez-moi.txt', data: lisezMoi(exercice, jour, nbFactures) });

  const zip = await creerZip(pieces);
  const nom = `BBG_Compta_${exercice}_${jour}.zip`;
  download(nom, zip);
  return { nom, taille: zip.size, fichiers: pieces.map(p => p.nom) };
}

function lisezMoi(exercice: string, jour: string, nbFactures: number): string {
  const pieces: [string, string[]][] = [
    [`BBG_Compta_${exercice}.xlsx`, [
      'Classeur complet : journal, synthèse par bloc (HT et TTC),',
      'compte de résultat, dépenses par jeu, immobilisations, trésorerie',
      'et mouvements financiers, TVA, prévisionnel de chaque exercice,',
      'stock prévu et stock réel avec ses mouvements, chronologie,',
      'catégories, jeux et vue d\'ensemble sur cinq ans.',
      'S\'importe dans Google Sheets par Fichier > Importer.',
    ]],
    [`BBG_Rapport_${exercice}.pdf`, [
      'Rapport imprimable : compte de résultat, synthèse par catégorie,',
      'journal détaillé, immobilisations et dépenses par jeu, TVA,',
      'trésorerie, mouvements financiers, stocks et prévisionnel.',
    ]],
    ['BBG_Journal.csv', [
      'Toutes les écritures (séparateur « ; », virgule décimale),',
      'pour l\'expert-comptable.',
    ]],
    [`BBG_Compta_${exercice}_lecture_seule.html`, [
      'Copie consultable en lecture seule : synthèse, compte de résultat,',
      'TVA, journal, immobilisations, trésorerie, dépenses par jeu,',
      'chronologie et contrôles. Un double-clic suffit, rien à installer,',
      'rien de modifiable.',
    ]],
    ['BBG_Compta_sauvegarde.json', [
      'Sauvegarde restaurable dans BBG Compta',
      '(Paramètres > Restaurer une sauvegarde).',
    ]],
  ];
  if (nbFactures) {
    pieces.push(['Factures/', [`${nbFactures} justificatif(s), rangés par mois comptable.`]]);
  }
  const largeur = Math.max(...pieces.map(p => p[0].length)) + 3;
  const bloc = pieces.flatMap(([nom, lignes]) => lignes.map((l, i) =>
    (i === 0 ? nom.padEnd(largeur) : ' '.repeat(largeur)) + l));

  return [
    `Big Budi Games — export comptable du ${formatDateFR(jour)}`,
    `Exercice ${exercice} (1er octobre → 30 septembre)`,
    '',
    ...bloc,
    '',
    'Tous les totaux sont recalculés écriture par écriture : aucun n\'est saisi à la main.',
  ].join('\n');
}

/** Les justificatifs stockés, rangés « Factures/<mois>/<fournisseur> — <libellé>.pdf ». */
export async function fichiersFactures(entries: JournalEntry[]): Promise<FichierZip[]> {
  const stockes = await listFiles();
  const parId = new Map(entries.filter(e => e.factureFileId).map(e => [e.factureFileId!, e]));
  const utilises = new Set<string>();
  return stockes.map(f => {
    const e = parId.get(f.id);
    const ext = (f.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
    const base = e
      ? nomSur([e.fournisseur, e.description].filter(Boolean).join(' - ')) || nomSur(f.name)
      : nomSur(f.name.replace(/\.[a-z0-9]+$/i, ''));
    const dossier = e ? `Factures/${nomSur(labelMois(e.mois))}` : 'Factures/Non rattachees';
    // Deux factures du même fournisseur le même mois : on suffixe pour ne pas
    // écraser l'une par l'autre dans l'archive.
    let nom = `${dossier}/${base}${ext}`;
    let n = 2;
    while (utilises.has(nom.toLowerCase())) nom = `${dossier}/${base} (${n++})${ext}`;
    utilises.add(nom.toLowerCase());
    return { nom, data: f.blob };
  });
}

/** Toutes les factures dans une archive, pour la page Factures. */
export async function exportFactures(entries: JournalEntry[]): Promise<ResultatZip> {
  const pieces = await fichiersFactures(entries);
  const zip = await creerZip(pieces);
  const nom = `BBG_Factures_${today()}.zip`;
  download(nom, zip);
  return { nom, taille: zip.size, fichiers: pieces.map(p => p.nom) };
}

export async function importBackup(file: File): Promise<{
  data: Parameters<AppState['restoreAll']>[0]; nbFichiers: number;
}> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data.format !== 'bbg-compta-backup') throw new Error('Ce fichier n\'est pas une sauvegarde BBG Compta.');
  const fichiers: FichierSerialise[] = data.fichiers ?? [];
  const nbFichiers = fichiers.length ? await importerFichiers(fichiers) : 0;
  return {
    data: {
      entries: data.entries ?? [],
      finances: data.finances ?? [],
      referentiels: data.referentiels,
      budgets: data.budgets,
      previsionnels: data.previsionnels,
      chronologie: data.chronologie ?? [],
      tresoPrev: data.tresoPrev ?? [],
      // Absents des sauvegardes plus anciennes : on ne remplace alors rien.
      ...(data.mouvementsPrev ? { mouvementsPrev: data.mouvementsPrev } : {}),
      ...(data.tresoManuel ? { tresoManuel: data.tresoManuel } : {}),
      ...(data.stocks ? { stocks: data.stocks } : {}),
      ...(data.mouvementsStock ? { mouvementsStock: data.mouvementsStock } : {}),
      ...(data.journalFormats ? { journalFormats: data.journalFormats } : {}),
      ...(data.colWidths ? { colWidths: data.colWidths } : {}),
      ...(data.blocCouleurs ? { blocCouleurs: data.blocCouleurs } : {}),
    },
    nbFichiers,
  };
}
