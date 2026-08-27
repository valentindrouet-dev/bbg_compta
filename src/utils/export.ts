import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppState } from '../store';
import type { JournalEntry, PrevLigne, Referentiels } from '../types';
import { labelMois, formatDateFR, compareMois, moisCourant, moisExercice } from './dates';
import { r2 } from './money';
import {
  syntheseExercice, immoInfos, tableauTVA, tableauTreso, moisTresorerie,
  resultatDeSynthese, bilanJeux,
} from './calc';
import { exporterFichiers, importerFichiers, listFiles, type FichierSerialise } from './files';
import { creerZip, nomSur, type FichierZip } from './zip';
import { pageLectureSeule } from './partage';
import { ordreAffichage, valeursDe, SECTIONS } from './previsionnel';
import { natureCategorie, dureeCategorie } from './blocs';
import { couleurJeu } from './jeux';
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
        'Coût de revient unitaire HT': s.ligne.coutUnitaire,
        'TVA %': s.ligne.tauxTVA ?? 20,
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

const eurosPDF = (v: number) =>
  v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function documentPDF(state: AppState, exercice: string): jsPDF {
  const { entries, referentiels: refs, finances, tresoManuel, previsionnels } = state;

  const doc = new jsPDF({ orientation: 'landscape' });
  const syn = syntheseExercice(entries, exercice, refs);
  const mois = syn.moisList;
  const finY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const titre = (t: string) => { doc.setFontSize(14); doc.text(t, 14, 14); };
  const NOIR: [number, number, number] = [40, 40, 40];

  doc.setFontSize(18);
  doc.text(`Big Budi Games — Rapport comptable ${exercice}`, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Généré le ${formatDateFR(today())} par BBG Compta`, 14, 22);
  doc.setTextColor(0);

  // Compte de résultat : le vrai, celui de l'écran — EBE, REX, IS, résultat net.
  const resultat = resultatDeSynthese(syn, entries, finances, refs);
  autoTable(doc, {
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
  autoTable(doc, {
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
  autoTable(doc, {
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
  autoTable(doc, {
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
  autoTable(doc, {
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
  autoTable(doc, {
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
  autoTable(doc, {
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
    autoTable(doc, {
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
      autoTable(doc, {
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
      autoTable(doc, {
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
    autoTable(doc, {
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

// ---------------------------------------------------------------- Sauvegarde -

export async function blobBackup(state: AppState, avecFichiers = true): Promise<Blob> {
  // Les justificatifs vivent dans IndexedDB : on les embarque en base64 pour
  // que la sauvegarde soit vraiment complète (et restaurable sur une autre machine).
  const fichiers = avecFichiers ? await exporterFichiers() : [];
  const data = {
    format: 'bbg-compta-backup',
    // v4 : le stock — prévisionnel et mouvements réels — entre dans la
    // sauvegarde. v3 y avait fait entrer les corrections manuelles de
    // trésorerie et les couleurs des blocs, qu'une restauration perdait.
    version: 4,
    exportedAt: new Date().toISOString(),
    entries: state.entries,
    finances: state.finances,
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
      // Absents des sauvegardes v2 : on ne remplace alors rien.
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
