import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppState } from '../store';
import type { JournalEntry } from '../types';
import { labelMois, formatDateFR, compareMois, moisCourant, moisExercice } from './dates';
import { r2 } from './money';
import { syntheseExercice, immoInfos, tableauTVA, tableauTreso, moisTresorerie } from './calc';
import { exporterFichiers, importerFichiers, listFiles, type FichierSerialise } from './files';
import { creerZip, nomSur, type FichierZip } from './zip';
import { pageLectureSeule } from './partage';
import { ordreAffichage, valeursDe } from './previsionnel';

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

export function blobExcel(state: AppState, exercice: string): Blob {
  const wb = XLSX.utils.book_new();
  const { entries, referentiels, previsionnels, chronologie, finances } = state;

  // Journal complet
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(journalRows(entries)), 'Journal');

  // Synthèse charges par mois × catégorie
  const syn = syntheseExercice(entries, exercice, referentiels);
  const cats = referentiels.categoriesDepenses.filter(c => syn.charges.has(c));
  const synRows = syn.moisList.map(m => {
    const row: Record<string, string | number> = { 'Mois': labelMois(m) };
    for (const c of cats) row[c] = r2(syn.charges.get(c)?.get(m) ?? 0);
    row['Total HT'] = r2(syn.totalChargesParMois.get(m) ?? 0);
    row['Immo HT'] = r2(syn.immoParMois.get(m) ?? 0);
    row['Total TTC'] = r2(syn.totalTTCParMois.get(m) ?? 0);
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(synRows), `Synthèse ${exercice}`);

  // Produits
  const prodRows = syn.moisList
    .filter(m => (syn.totalProduitsParMois.get(m) ?? 0) !== 0)
    .map(m => {
      const row: Record<string, string | number> = { 'Mois': labelMois(m) };
      for (const [cat, byMois] of syn.produits) row[cat] = r2(byMois.get(m) ?? 0);
      row['Total HT'] = r2(syn.totalProduitsParMois.get(m) ?? 0);
      row['Total TTC'] = r2(syn.totalProduitsTTCParMois.get(m) ?? 0);
      return row;
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prodRows), 'Produits');

  // Immobilisations
  const immoRows = immoInfos(entries, referentiels).map(i => ({
    'Date': i.entry.date,
    'Fournisseur': i.entry.fournisseur,
    'Description': i.entry.description,
    'Catégorie': i.entry.categorie,
    'TTC': r2(i.entry.ttc), 'TVA': r2(i.entry.tva), 'HT': r2(i.entry.ht),
    'Durée (ans)': i.duree,
    'Dotation /an': i.dotationAn, 'Dotation /mois': i.dotationMois,
    'VNC à ce jour': i.vnc(today()),
    'Fin amortissement': i.fin,
    'Compta': i.entry.compta ?? '', 'Facture': i.entry.facture ?? '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(immoRows), 'Immobilisations');

  // Trésorerie
  const moisList = moisTresorerie(entries, finances, moisCourant());
  const tresoRows = tableauTreso(entries, finances, moisList).map(t => ({
    'Mois': labelMois(t.mois),
    'Solde initial': t.soldeInitial,
    'Encaissements': t.encaissements,
    'Décaissements': -t.decaissements,
    'Solde mensuel': t.soldeMensuel,
    'Solde cumulé': t.soldeCumule,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tresoRows), 'Trésorerie');

  // TVA
  const tvaRows = tableauTVA(entries, moisExercice(exercice)).map(x => ({
    'Mois': labelMois(x.mois),
    'CA TTC': x.caTTC, 'CA HT': x.caHT, 'TVA collectée': x.tvaCollectee,
    'Dépenses TTC': x.depTTC, 'Dépenses HT': x.depHT, 'TVA déductible': x.tvaDeductible,
    'Solde (collectée-déductible)': x.solde, 'Cumul': x.cumul,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tvaRows), 'TVA');

  // Prévisionnel : mêmes catégories et mêmes mois que la synthèse
  for (const [ex, brutes] of Object.entries(previsionnels ?? {})) {
    const mois = moisExercice(ex);
    const lignes = ordreAffichage(brutes, referentiels);
    const rows = lignes.map(l => {
      const row: Record<string, string | number> = {
        'Bloc': l.section, 'Ligne': l.categorie, 'Unité': l.unite ?? '€',
      };
      const vals = valeursDe(l, lignes);
      mois.forEach((m, i) => { row[labelMois(m)] = vals[i] ?? ''; });
      row['Total'] = r2(vals.reduce<number>((s, v) => s + (v ?? 0), 0));
      return row;
    });
    if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `Prév ${ex}`);
  }

  // Chronologie
  const chronoRows = chronologie.map(c => ({
    'Projet': c.projet, 'Action': c.action, 'Début': c.debut, 'Fin': c.fin, 'Détail': c.detail ?? '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chronoRows), 'Chronologie');

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
  const { entries, referentiels, finances } = state;
  const doc = new jsPDF({ orientation: 'landscape' });
  const syn = syntheseExercice(entries, exercice, referentiels);

  doc.setFontSize(18);
  doc.text(`Big Budi Games — Rapport comptable ${exercice}`, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Généré le ${formatDateFR(today())} par BBG Compta`, 14, 22);
  doc.setTextColor(0);

  const totCharges = r2([...syn.totalChargesParMois.values()].reduce((s, v) => s + v, 0));
  const totJeux = r2([...syn.totalJeuxParMois.values()].reduce((s, v) => s + v, 0));
  const totImmo = r2([...syn.immoParMois.values()].reduce((s, v) => s + v, 0));
  const totProd = r2([...syn.totalProduitsParMois.values()].reduce((s, v) => s + v, 0));

  autoTable(doc, {
    startY: 28,
    head: [['Produits HT', 'Charges HT', 'Dépenses Jeux HT', 'Immobilisations HT', 'Résultat simplifié (produits − charges − jeux)']],
    body: [[eurosPDF(totProd), eurosPDF(totCharges), eurosPDF(totJeux), eurosPDF(totImmo), eurosPDF(r2(totProd - totCharges - totJeux))]],
    styles: { halign: 'right', fontSize: 10 },
    headStyles: { fillColor: [40, 40, 40] },
  });

  // Synthèse par mois
  const cats = referentiels.categoriesDepenses.filter(c => syn.charges.has(c));
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
    head: [['Mois', ...cats.map(c => c.length > 18 ? c.slice(0, 17) + '…' : c), 'Total HT', 'TTC']],
    body: syn.moisList
      .filter(m => (syn.totalTTCParMois.get(m) ?? 0) !== 0)
      .map(m => [
        labelMois(m),
        ...cats.map(c => {
          const v = syn.charges.get(c)?.get(m) ?? 0;
          return v ? eurosPDF(r2(v)) : '·';
        }),
        eurosPDF(r2(syn.totalChargesParMois.get(m) ?? 0)),
        eurosPDF(r2(syn.totalTTCParMois.get(m) ?? 0)),
      ]),
    styles: { fontSize: 6.5, halign: 'right' },
    headStyles: { fillColor: [40, 40, 40], fontSize: 6 },
    columnStyles: { 0: { halign: 'left' } },
  });

  // Journal détaillé
  doc.addPage();
  doc.setFontSize(14);
  doc.text(`Journal détaillé — exercice ${exercice}`, 14, 14);
  const moisSet = new Set(moisExercice(exercice));
  const duJournal = entries
    .filter(e => moisSet.has(e.mois))
    .sort((a, b) => compareMois(a.mois, b.mois) || a.date.localeCompare(b.date));
  autoTable(doc, {
    startY: 20,
    head: [['Mois', 'Date', 'Fournisseur', 'Description', 'Catégorie', 'TTC', 'TVA', 'HT', 'Paiement', 'Type']],
    body: duJournal.map(e => [
      labelMois(e.mois), formatDateFR(e.date), e.fournisseur, e.description, e.categorie,
      eurosPDF(e.ttc), eurosPDF(e.tva), eurosPDF(e.ht), e.paiement, e.type,
    ]),
    styles: { fontSize: 7 },
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  });

  // TVA + Trésorerie
  doc.addPage();
  doc.setFontSize(14);
  doc.text('TVA et trésorerie', 14, 14);
  autoTable(doc, {
    startY: 20,
    head: [['Mois', 'CA TTC', 'TVA collectée', 'Dépenses TTC', 'TVA déductible', 'Solde', 'Cumul']],
    body: tableauTVA(entries, moisExercice(exercice)).map(x => [
      labelMois(x.mois), eurosPDF(x.caTTC), eurosPDF(x.tvaCollectee),
      eurosPDF(x.depTTC), eurosPDF(x.tvaDeductible), eurosPDF(x.solde), eurosPDF(x.cumul),
    ]),
    styles: { fontSize: 8, halign: 'right' },
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 0: { halign: 'left' } },
  });
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
    head: [['Mois', 'Solde initial', 'Encaissements', 'Décaissements', 'Solde mensuel', 'Solde cumulé']],
    body: tableauTreso(entries, finances, moisTresorerie(entries, finances, moisCourant())).map(t => [
      labelMois(t.mois), eurosPDF(t.soldeInitial), eurosPDF(t.encaissements),
      eurosPDF(-t.decaissements), eurosPDF(t.soldeMensuel), eurosPDF(t.soldeCumule),
    ]),
    styles: { fontSize: 8, halign: 'right' },
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 0: { halign: 'left' } },
  });

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
    version: 2,
    exportedAt: new Date().toISOString(),
    entries: state.entries,
    finances: state.finances,
    referentiels: state.referentiels,
    budgets: state.budgets,
    previsionnels: state.previsionnels,
    chronologie: state.chronologie,
    tresoPrev: state.tresoPrev,
    journalFormats: state.journalFormats,
    colWidths: state.colWidths,
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
      'Classeur complet : journal, synthèse, produits, immobilisations,',
      'trésorerie, TVA, prévisionnel et chronologie.',
      'S\'importe dans Google Sheets par Fichier > Importer.',
    ]],
    [`BBG_Rapport_${exercice}.pdf`, [
      'Rapport imprimable : synthèse par catégorie, journal détaillé,',
      'TVA et trésorerie.',
    ]],
    ['BBG_Journal.csv', [
      'Toutes les écritures (séparateur « ; », virgule décimale),',
      'pour l\'expert-comptable.',
    ]],
    [`BBG_Compta_${exercice}_lecture_seule.html`, [
      'Copie consultable en lecture seule : synthèse, compte de résultat,',
      'TVA, journal, immobilisations et contrôles. Un double-clic suffit,',
      'rien à installer, rien de modifiable.',
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
      ...(data.journalFormats ? { journalFormats: data.journalFormats } : {}),
      ...(data.colWidths ? { colWidths: data.colWidths } : {}),
    },
    nbFichiers,
  };
}
