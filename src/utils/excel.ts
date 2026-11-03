/**
 * Les exports Excel mis en forme : le Journal du mois et la Synthèse annuelle,
 * tels que l'app les montre — couleurs des blocs, bandeaux, colonnes taillées,
 * montants en vrais nombres (on peut les additionner dans Excel), dates en
 * vraies dates. Rien n'est recalculé ici : le journal lit les mêmes tableaux
 * que l'écran, la synthèse les mêmes cartes que son PDF.
 *
 * La bibliothèque (ExcelJS) ne se charge qu'au clic : elle pèse lourd, et
 * l'app n'en a besoin que pour ces deux boutons.
 */
import type { Borders, Cell, Fill, Font, Row, Worksheet } from 'exceljs';
import type { AppState } from '../store';
import type { JournalEntry } from '../types';
import {
  exerciceDuMois, formatDateFR, labelMois, labelMoisLong, todayISO,
} from './dates';
import { euros, r2, tvaDepuisTTC } from './money';
import {
  sectionsDuMois, sumParCategorie, sumParMotCle, sumTTH, type BaseMontant,
} from './calc';
import { teinteBloc, type BlocCle } from './blocs';
import type { Teinte } from './couleurs';
import { couleurJeu } from './jeux';
import { donneesSynthese } from './export';
import { APP_VERSION } from '../version';

// ----- Palette et formats -------------------------------------------------

/** La palette de l'app (index.css), pour les cases qui ne suivent pas un bloc. */
const C = {
  violetFonce: '#3f3268',
  violet: '#674ea7',
  gris: '#6f6690',
  grisClair: '#9a92b5',
  bord: '#ddd6ef',
  lavande: '#f4f1fb',
  vert: '#38761d', vertClair: '#d9ead3',
  orange: '#b45f06', orangeClair: '#fce5cd',
  jaune: '#7f6000', jauneClair: '#fff2cc',
  bleu: '#1c4587', bleuClair: '#cfe2f3',
  rouge: '#b7332e', rougeClair: '#fde3e1',
};

const POLICE = 'Calibri';
/** Euros, en vrai nombre : Excel l'affiche « 1 234,56 € » en français. */
const EUROS = '#,##0.00\\ "€"';
/** Le même, avec un point médian à la place de zéro — comme la synthèse à l'écran. */
const EUROS_POINT = '#,##0.00\\ "€";-#,##0.00\\ "€";"·"';

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const fond = (hex: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const police = (o: Partial<Font> & { couleur?: string } = {}): Partial<Font> => {
  const { couleur, ...reste } = o;
  return { name: POLICE, size: 10, ...reste, ...(couleur ? { color: { argb: argb(couleur) } } : {}) };
};
const trait = (hex = C.bord, style: 'thin' | 'medium' = 'thin') => ({ style, color: { argb: argb(hex) } });
const cadre = (hex = C.bord): Partial<Borders> =>
  ({ top: trait(hex), bottom: trait(hex), left: trait(hex), right: trait(hex) });

/** La teinte foncée d'une couleur, pour écrire dessus (le même rapport qu'à l'écran). */
function encre(hex: string): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => Math.round((parseInt(h.slice(i, i + 2), 16) || 0) * 0.42));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Une date ISO en vraie date Excel (à minuit UTC : pas de décalage d'un jour). */
function dateExcel(iso: string): Date | string {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : iso;
}

/** Un nom d'onglet acceptable : 31 caractères au plus, sans : \ / ? * [ ]. */
const nomOnglet = (n: string) => n.replace(/[:\\/?*[\]]/g, '-').slice(0, 31);

// ----- Outillage commun ---------------------------------------------------

type ExcelModule = typeof import('exceljs');

async function classeur() {
  const mod = await import('exceljs') as unknown as ExcelModule & { default?: ExcelModule };
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = `BBG Compta v${APP_VERSION}`;
  wb.created = new Date();
  return wb;
}

/** Une feuille sans quadrillage, imprimable à l'italienne sur une page de large. */
function feuille(
  wb: Awaited<ReturnType<typeof classeur>>, nom: string, largeurs: number[], figerColonnes = 0,
): Worksheet {
  const ws = wb.addWorksheet(nomOnglet(nom), {
    views: [{ showGridLines: false, ...(figerColonnes ? { state: 'frozen' as const, xSplit: figerColonnes, ySplit: 0 } : {}) }],
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });
  largeurs.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.headerFooter.oddFooter = '&L&8Big Budi Games — BBG Compta&R&8&P / &N';
  return ws;
}

/**
 * Titre et sous-titre de la feuille, comme l'en-tête d'une page de l'app. Pas
 * de fusion : le texte déborde librement sur les cases vides voisines, et ne
 * se coupe donc jamais, même sur une feuille étroite.
 */
function enTete(ws: Worksheet, titre: string, sousTitre: string): number {
  const t = ws.getCell(1, 1);
  t.value = titre;
  t.font = police({ size: 16, bold: true, couleur: C.violetFonce });
  t.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 26;
  const s = ws.getCell(2, 1);
  s.value = `${sousTitre} · exporté le ${formatDateFR(todayISO())} par BBG Compta v${APP_VERSION}`;
  s.font = police({ size: 9, couleur: C.gris });
  return 4;
}

/** Écrit une valeur et son style dans une case. */
function ecrire(
  cell: Cell, valeur: Cell['value'],
  o: { font?: Partial<Font>; fill?: Fill; numFmt?: string; align?: 'left' | 'center' | 'right'; indent?: number; border?: Partial<Borders>; wrap?: boolean } = {},
) {
  cell.value = valeur;
  cell.font = o.font ?? police();
  if (o.fill) cell.fill = o.fill;
  if (o.numFmt) cell.numFmt = o.numFmt;
  cell.alignment = {
    vertical: 'middle', horizontal: o.align ?? (typeof valeur === 'number' ? 'right' : 'left'),
    ...(o.indent ? { indent: o.indent } : {}), ...(o.wrap ? { wrapText: true } : {}),
  };
  cell.border = o.border ?? cadre();
}

/**
 * Le bandeau d'un tableau : le titre à gauche sur toute la largeur, le total
 * (s'il y en a un) dans la dernière colonne — la carte de l'écran et son total.
 */
function bandeau(ws: Worksheet, ligne: number, nbCols: number, titre: string, t: Teinte, total?: number) {
  const r = ws.getRow(ligne);
  r.height = 22;
  const finTitre = total == null ? nbCols : nbCols - 1;
  ws.mergeCells(ligne, 1, ligne, finTitre);
  ecrire(r.getCell(1), titre, {
    font: police({ size: 12, bold: true, couleur: t.fonce }), fill: fond(t.total), border: {},
  });
  for (let c = 2; c <= finTitre; c++) r.getCell(c).fill = fond(t.total);
  if (total != null) {
    ecrire(r.getCell(nbCols), total, {
      font: police({ size: 12, bold: true, couleur: t.fonce }), fill: fond(t.total), numFmt: EUROS, border: {},
    });
  }
}

/** La ligne d'en-têtes de colonnes, à la teinte du bloc. */
function entetes(
  ws: Worksheet, ligne: number, libelles: string[], t: Teinte, numeriques: Set<number>, hauteur = 18,
) {
  const r = ws.getRow(ligne);
  r.height = hauteur;
  libelles.forEach((l, i) => {
    ecrire(r.getCell(i + 1), l, {
      font: police({ bold: true, couleur: t.fonce }), fill: fond(t.base),
      align: numeriques.has(i + 1) ? 'right' : 'left', wrap: hauteur > 18,
      border: { ...cadre(t.bord), bottom: trait(t.bord, 'medium') },
    });
  });
}

/** Les fichiers produits ici se téléchargent comme les autres exports. */
async function telecharger(wb: Awaited<ReturnType<typeof classeur>>, nom: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ----- Journal du mois ----------------------------------------------------

const TAUX = [20, 10, 5.5, 0];
/** Le taux affiché à l'écran, déduit des montants stockés. */
function tauxAffiche(e: JournalEntry): string {
  const t = TAUX.find(x => Math.abs(tvaDepuisTTC(e.ttc, x) - e.tva) < 0.011);
  return t == null ? 'manuel' : `${String(t).replace('.', ',')} %`;
}

/** Les colonnes du journal, dans l'ordre de l'écran (le jeu en dernier, pour l'alignement). */
const COLONNES_JOURNAL: { titre: string; largeur: number; num?: boolean }[] = [
  { titre: 'Date', largeur: 11 },
  { titre: 'Fournisseur', largeur: 22 },
  { titre: 'Description', largeur: 36 },
  { titre: 'Catégorie', largeur: 25 },
  { titre: 'TTC', largeur: 13, num: true },
  { titre: 'Taux', largeur: 8 },
  { titre: 'TVA', largeur: 11, num: true },
  { titre: 'HT', largeur: 13, num: true },
  { titre: 'Paiement', largeur: 12 },
  { titre: 'Type', largeur: 13 },
  { titre: 'Compta', largeur: 30 },
  { titre: 'Mots clés', largeur: 16 },
  { titre: 'Facture', largeur: 32 },
  { titre: 'Jeu', largeur: 14 },
];
const NB_COLS_JOURNAL = COLONNES_JOURNAL.length - 1;   // sans la colonne Jeu
const NUM_JOURNAL = new Set(COLONNES_JOURNAL.map((c, i) => c.num ? i + 1 : 0).filter(Boolean));

/** L'ordre du journal : le jour, puis l'ordre de saisie (celui de Qonto). */
function chronologique(rows: JournalEntry[], entries: JournalEntry[]): JournalEntry[] {
  const rang = new Map(entries.map((e, i) => [e.id, i]));
  return [...rows].sort((a, b) =>
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (rang.get(a.id) ?? 0) - (rang.get(b.id) ?? 0));
}

/**
 * Le Journal du mois en Excel : les trois tuiles du haut, puis les quatre
 * tableaux de l'écran (charges, immobilisations, jeux, produits) avec leurs
 * totaux, et un onglet de récapitulatif par catégorie et par mot clé.
 */
export async function exportExcelMois(state: AppState, mois: string) {
  const { entries, referentiels: refs, blocCouleurs } = state;
  const teinte = (cle: BlocCle) => teinteBloc(cle, blocCouleurs ?? {});
  const sections = sectionsDuMois(entries, mois, refs);
  const wb = await classeur();
  const ws = feuille(wb, `Journal ${labelMoisLong(mois)}`, COLONNES_JOURNAL.map(c => c.largeur));
  let y = enTete(ws, `Journal du mois — ${labelMoisLong(mois)}`,
    `Big Budi Games · exercice ${exerciceDuMois(mois)} · écritures réelles du journal`);

  // Les trois tuiles : dépenses, recettes, solde — le gros chiffre en TTC.
  const dep = sumTTH([...sections.charges, ...sections.immos]);
  const jeux = sumTTH(sections.jeux);
  const prod = sumTTH(sections.produits);
  const sortiesTTC = r2(dep.ttc + jeux.ttc);
  const sortiesHT = r2(dep.ht + jeux.ht);
  const soldeTTC = r2(prod.ttc - sortiesTTC);
  const soldeHT = r2(prod.ht - sortiesHT);
  const positif = prod.ttc >= sortiesTTC;
  const tuiles: { titre: string; ttc: number; ht: number; fondT: string; encreT: string; de: number; a: number; detail?: string }[] = [
    { titre: 'DÉPENSES', ttc: sortiesTTC, ht: sortiesHT, fondT: C.orangeClair, encreT: C.orange, de: 1, a: 4,
      detail: sections.jeux.length ? `dont jeux ${euros(jeux.ttc)} TTC` : undefined },
    { titre: 'RECETTES', ttc: prod.ttc, ht: prod.ht, fondT: C.vertClair, encreT: C.vert, de: 5, a: 9 },
    { titre: 'SOLDE DU MOIS', ttc: soldeTTC, ht: soldeHT,
      fondT: positif ? C.vertClair : C.rougeClair, encreT: positif ? C.vert : C.rouge, de: 10, a: 13 },
  ];
  for (const t of tuiles) {
    const lignes: [string | number, Partial<Font>, string?][] = [
      [t.titre, police({ size: 9, bold: true, couleur: t.encreT })],
      [t.ttc, police({ size: 15, bold: true, couleur: t.encreT }), `${EUROS}\\ "TTC"`],
      [t.detail ? `${euros(t.ht)} HT · ${t.detail}` : `${euros(t.ht)} HT`, police({ size: 9, couleur: C.gris })],
    ];
    lignes.forEach(([v, f, fmt], i) => {
      ws.mergeCells(y + i, t.de, y + i, t.a);
      const cell = ws.getCell(y + i, t.de);
      ecrire(cell, v, { font: f, fill: fond(t.fondT), numFmt: fmt, align: 'left', border: {} });
      cell.border = {
        left: trait(t.encreT), right: trait(t.encreT),
        ...(i === 0 ? { top: trait(t.encreT) } : {}), ...(i === 2 ? { bottom: trait(t.encreT) } : {}),
      };
    });
  }
  ws.getRow(y + 1).height = 22;
  y += 4;

  /** Un tableau de l'écran : bandeau, en-têtes, lignes, totaux. */
  function section(titre: string, rows: JournalEntry[], cle: BlocCle, kind: 'depenses' | 'jeux' | 'produits') {
    const t = teinte(cle);
    const avecJeu = kind === 'jeux';
    const nbCols = avecJeu ? NB_COLS_JOURNAL + 1 : NB_COLS_JOURNAL;
    const tot = sumTTH(rows);
    bandeau(ws, y, nbCols, `${titre} — ${rows.length} ligne${rows.length > 1 ? 's' : ''}`, t, tot.ht);
    y++;
    entetes(ws, y, COLONNES_JOURNAL.slice(0, nbCols).map(c => c.titre), t, NUM_JOURNAL);
    y++;
    if (!rows.length) {
      ws.mergeCells(y, 1, y, nbCols);
      ecrire(ws.getCell(y, 1), 'Aucune écriture sur ce mois.', {
        font: police({ italic: true, couleur: C.grisClair }), align: 'center',
      });
      y += 2;
      return;
    }
    chronologique(rows, entries).forEach((e, i) => {
      const r = ws.getRow(y);
      const zebre = i % 2 ? fond(t.tresClair) : undefined;
      const couleurCat = refs.categoriesMeta?.[e.categorie]?.couleur;
      const pillCat = couleurCat ?? (kind === 'jeux' ? C.jauneClair : C.vertClair);
      const type = e.type === 'produit' ? '' : e.type === 'immo' ? `immo · ${e.immoDureeAns ?? 5} ans` : 'charges';
      const valeurs: [Cell['value'], Parameters<typeof ecrire>[2]][] = [
        [dateExcel(e.date), { numFmt: 'dd/mm/yyyy', align: 'left' }],
        [e.fournisseur, { font: police({ bold: true, couleur: C.violetFonce }) }],
        [e.description, {}],
        [e.categorie, { fill: fond(pillCat), font: police({ couleur: couleurCat ? encre(couleurCat) : C.violetFonce }) }],
        [e.ttc, { numFmt: EUROS, font: police({ italic: e.ttc < 0 }) }],
        [tauxAffiche(e), { align: 'center' }],
        [e.tva, { numFmt: EUROS, font: police({ italic: true, couleur: C.gris }) }],
        [e.ht, { numFmt: EUROS, font: police({ bold: true, couleur: C.violetFonce }) }],
        [e.paiement, {}],
        [type, type ? {
          align: 'center',
          fill: fond(e.type === 'immo' ? C.bleuClair : C.orangeClair),
          font: police({ bold: e.type === 'immo', couleur: e.type === 'immo' ? C.bleu : C.orange }),
        } : {}],
        [e.compta ?? '', { font: police({ couleur: C.gris }) }],
        [e.motsCles ?? '', { font: police({ couleur: C.bleu }) }],
        [e.facture ?? '', { font: police({ size: 9, couleur: e.factureFileId ? C.vert : C.gris }) }],
        ...(avecJeu ? [[e.jeu ?? '', e.jeu ? {
          fill: fond(couleurJeu(e.jeu, refs)), font: police({ bold: true, couleur: encre(couleurJeu(e.jeu, refs)) }),
        } : {}]] as [Cell['value'], Parameters<typeof ecrire>[2]][] : []),
      ];
      valeurs.forEach(([v, o], c) => ecrire(r.getCell(c + 1), v, { fill: zebre, ...o }));
      y++;
    });
    // Les totaux, comme le pied du tableau de l'écran.
    const r = ws.getRow(y);
    r.height = 20;
    ws.mergeCells(y, 1, y, 4);
    const styleTotal = { font: police({ bold: true, size: 11, couleur: t.fonce }), fill: fond(t.total),
      border: { ...cadre(t.bord), top: trait(t.bord, 'medium') } };
    // Les cases fusionnées avec la première ne reçoivent que le style : y
    // écrire une valeur effacerait le libellé.
    for (let c = 2; c <= nbCols; c++) {
      const cell = r.getCell(c);
      if (c > 4) ecrire(cell, null, styleTotal);
      else { cell.fill = styleTotal.fill; cell.border = styleTotal.border; }
    }
    ecrire(r.getCell(1), 'TOTAUX', { ...styleTotal, align: 'right' });
    ecrire(r.getCell(5), tot.ttc, { ...styleTotal, numFmt: EUROS });
    ecrire(r.getCell(7), tot.tva, { ...styleTotal, numFmt: EUROS });
    ecrire(r.getCell(8), tot.ht, { ...styleTotal, numFmt: EUROS });
    y += 3;
  }

  section('Charges', sections.charges, 'charges', 'depenses');
  section("Immobilisations (portées à l'actif, amorties)", sections.immos, 'immos', 'depenses');
  section('Dépenses Jeux (développement & droits)', sections.jeux, 'jeux', 'jeux');
  section('Produits (revenus)', sections.produits, 'produits', 'produits');

  // Le récapitulatif : les pastilles du bas de l'écran, en tableaux.
  const rec = feuille(wb, 'Récapitulatif', [34, 15, 11]);
  let yr = enTete(rec, `Récapitulatif — ${labelMoisLong(mois)}`,
    'Par catégorie puis par mot clé, montants HT, le mois seul');
  const depenses = [...sections.charges, ...sections.immos, ...sections.jeux];
  const recap = (titre: string, groupes: Map<string, number>, cle: BlocCle, parCategorie: boolean) => {
    if (!groupes.size) return;
    const t = teinte(cle);
    const tot = r2([...groupes.values()].reduce((s, x) => s + x, 0));
    bandeau(rec, yr, 3, titre, t);
    yr++;
    entetes(rec, yr, [parCategorie ? 'Catégorie' : 'Mot clé', 'HT', '%'], t, new Set([2, 3]));
    yr++;
    [...groupes.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).forEach(([nom, v], i) => {
      const r = rec.getRow(yr);
      const zebre = i % 2 ? fond(t.tresClair) : undefined;
      const couleurCat = parCategorie ? refs.categoriesMeta?.[nom]?.couleur : undefined;
      ecrire(r.getCell(1), nom, couleurCat
        ? { fill: fond(couleurCat), font: police({ couleur: encre(couleurCat) }) }
        : { fill: zebre, font: police({ couleur: parCategorie ? C.violetFonce : C.bleu }) });
      ecrire(r.getCell(2), r2(v), { fill: zebre, numFmt: EUROS });
      ecrire(r.getCell(3), tot ? v / tot : null, { fill: zebre, numFmt: '0.0%', font: police({ couleur: C.gris }) });
      yr++;
    });
    const r = rec.getRow(yr);
    const st = { font: police({ bold: true, couleur: t.fonce }), fill: fond(t.total),
      border: { ...cadre(t.bord), top: trait(t.bord, 'medium') } };
    ecrire(r.getCell(1), 'TOTAL', st);
    ecrire(r.getCell(2), tot, { ...st, numFmt: EUROS });
    ecrire(r.getCell(3), tot ? 1 : null, { ...st, numFmt: '0.0%' });
    yr += 3;
  };
  recap('Dépenses par catégorie', sumParCategorie(depenses), 'charges', true);
  recap('Produits par catégorie', sumParCategorie(sections.produits), 'produits', true);
  // Les mots clés rattachent une écriture à un événement (un salon, un
  // festival) : « combien m'a coûté Cannes ». Les lignes sans mot clé n'y sont pas.
  recap('Dépenses par mot clé (lignes sans mot clé exclues)', sumParMotCle(depenses), 'personnel', false);
  recap('Produits par mot clé (lignes sans mot clé exclues)', sumParMotCle(sections.produits), 'personnel', false);
  if (yr === 4) {
    ecrire(rec.getCell(4, 1), 'Aucune écriture sur ce mois.', { font: police({ italic: true, couleur: C.grisClair }), border: {} });
  }

  await telecharger(wb, `BBG_Journal_${mois}_${todayISO()}.xlsx`);
}

// ----- Synthèse annuelle --------------------------------------------------

/**
 * La Synthèse annuelle en Excel : le compte de résultat, chaque bloc mois par
 * mois — groupes de catégories et sous-totaux comme à l'écran, jeux dans leur
 * propre carte —, les dotations, la TVA et le récapitulatif. Les chiffres sont
 * ceux du PDF de la synthèse, calculés par la même fonction.
 */
export async function exportExcelSynthese(state: AppState, exercice: string, base: BaseMontant = 'ht') {
  const { referentiels: refs, blocCouleurs } = state;
  const teinte = (cle: BlocCle) => teinteBloc(cle, blocCouleurs ?? {});
  const d = donneesSynthese(state, exercice, base);
  const { mois, unite } = d;
  const nbCols = mois.length + 2;
  const NUM = new Set(Array.from({ length: mois.length + 1 }, (_, i) => i + 2));
  const wb = await classeur();
  const ws = feuille(wb, `Synthèse ${exercice}`, [40, ...mois.map(() => 12), 14], 1);
  let y = enTete(ws, `Synthèse annuelle — exercice ${exercice}`,
    `Big Budi Games · montants ${unite} · écritures réelles du journal`);
  const total = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));

  /** Une ligne « libellé, mois…, total ». */
  function ligne(
    label: string, parMois: (m: string) => number | null, tot: number,
    o: { font?: Partial<Font>; fill?: Fill; fillLabel?: Fill; fontLabel?: Partial<Font>; indent?: number; border?: Partial<Borders>; signe?: boolean } = {},
  ): Row {
    const r = ws.getRow(y);
    ecrire(r.getCell(1), label, {
      font: o.fontLabel ?? o.font, fill: o.fillLabel ?? o.fill, indent: o.indent, border: o.border,
    });
    const couleurSigne = (v: number | null) => o.signe && v
      ? police({ ...(o.font ?? {}), couleur: v > 0 ? C.vert : C.rouge }) : o.font;
    mois.forEach((m, i) => {
      const v = parMois(m);
      ecrire(r.getCell(i + 2), v == null ? '' : r2(v), {
        font: couleurSigne(v), fill: o.fill, numFmt: EUROS_POINT, align: 'right', border: o.border,
      });
    });
    ecrire(r.getCell(nbCols), tot, {
      font: { ...(couleurSigne(tot) ?? police()), bold: true }, fill: o.fill, numFmt: EUROS, border: o.border,
    });
    y++;
    return r;
  }

  // Le compte de résultat, toujours en HT.
  const tR = teinte('resultat');
  const rn = d.resultat.find(l => l.cle === 'rn')?.total ?? 0;
  bandeau(ws, y, nbCols, `Compte de résultat ${exercice} (HT)`, tR, rn);
  y++;
  entetes(ws, y, ['Poste', ...mois.map(labelMois), 'Total'], tR, NUM);
  y++;
  for (const l of d.resultat) {
    const fort = l.niveau !== 'detail';
    const final = l.niveau === 'final';
    ligne(l.label, m => l.parMois ? (l.parMois.get(m) ?? 0) : null, l.total, {
      font: police({ bold: fort, size: final ? 11 : 10, couleur: final ? tR.fonce : undefined }),
      fill: final ? fond(tR.total) : l.niveau === 'agregat' ? fond(tR.tresClair) : undefined,
      signe: l.signe,
      border: final ? { ...cadre(tR.bord), top: trait(tR.bord, 'medium') } : undefined,
    });
  }
  y += 2;

  // Les cartes de blocs : la même liste que le PDF.
  const meta = refs.categoriesMeta ?? {};
  const groupes = refs.groupes ?? [];
  for (const carte of d.cartes) {
    const t = teinte(carte.cle);
    bandeau(ws, y, nbCols, carte.titre, t, carte.total);
    y++;
    entetes(ws, y, [carte.colonne, ...mois.map(labelMois), 'Total'], t, NUM);
    y++;
    const valeur = (pm: Map<string, number>) => (m: string) => pm.get(m) ?? 0;
    let zebre = 0;
    const ligneCategorie = (label: string, pm: Map<string, number>, categorie?: string, indent?: number) => {
      const couleurCat = categorie ? meta[categorie]?.couleur : undefined;
      const f = zebre++ % 2 ? fond(t.tresClair) : undefined;
      ligne(label, valeur(pm), total(pm), {
        fill: f,
        fillLabel: couleurCat ? fond(couleurCat) : f,
        fontLabel: police({ couleur: couleurCat ? encre(couleurCat) : C.violetFonce }),
        indent,
      });
    };
    if (carte.colonne === 'Jeu / poste') {
      // Un bandeau par jeu, à sa couleur, puis ses postes en retrait.
      for (const l of carte.lignes) {
        if (l.jeu) {
          const cj = couleurJeu(l.jeu, refs);
          ligne(l.jeu, valeur(l.parMois), total(l.parMois), {
            font: police({ bold: true, couleur: encre(cj) }), fill: fond(cj),
          });
          zebre = 0;
        } else {
          ligneCategorie(l.label.trim(), l.parMois, l.categorie, 2);
        }
      }
    } else {
      // Les catégories rangées par groupe, dans l'ordre réglé dans l'app ;
      // un sous-total quand le groupe en compte plusieurs.
      const parGroupe = new Map<string, typeof carte.lignes>();
      for (const l of carte.lignes) {
        const g = l.categorie ? meta[l.categorie]?.groupe ?? '' : '';
        if (!parGroupe.has(g)) parGroupe.set(g, []);
        parGroupe.get(g)!.push(l);
      }
      const ordre = [...groupes.filter(g => parGroupe.has(g)), ...(parGroupe.has('') ? [''] : [])];
      const avecGroupes = ordre.length > 1 || (ordre.length === 1 && ordre[0] !== '');
      for (const g of ordre) {
        const liste = parGroupe.get(g)!;
        if (avecGroupes) {
          const r = ws.getRow(y);
          ws.mergeCells(y, 1, y, nbCols);
          ecrire(r.getCell(1), g || '— sans groupe —', {
            font: police({ bold: true, italic: true, couleur: t.fonce }), fill: fond(t.clair),
            border: { top: trait(t.bord), bottom: trait(t.bord) },
          });
          y++;
          zebre = 0;
        }
        for (const l of liste) ligneCategorie(l.label, l.parMois, l.categorie, avecGroupes ? 1 : undefined);
        if (avecGroupes && liste.length > 1) {
          const sous = (m: string) => r2(liste.reduce((s, l) => s + (l.parMois.get(m) ?? 0), 0));
          ligne(`Sous-total ${g || 'sans groupe'}`, sous, r2(liste.reduce((s, l) => s + total(l.parMois), 0)), {
            font: police({ italic: true, couleur: C.gris }), fill: fond(t.tresClair),
            border: { ...cadre(), top: trait(t.bord) },
          });
        }
      }
    }
    const nomTotal = carte.titre.replace(/\s*\((HT|TTC)\)$/, '')
      .replace(/ par catégorie/, '').replace(/ — investissements/, '');
    ligne(`TOTAL ${nomTotal.toUpperCase()}`, m => carte.totaux.get(m) ?? 0, carte.total, {
      font: police({ bold: true, size: 11, couleur: t.fonce }), fill: fond(t.total),
      border: { ...cadre(t.bord), top: trait(t.bord, 'medium') },
    });
    y += 2;
  }

  // La TVA, mois par mois : rouge = dû à l'État, vert = crédit, comme l'onglet TVA.
  const tT = teinte('tva');
  bandeau(ws, y, 7, `TVA — exercice ${exercice}`, tT);
  y++;
  entetes(ws, y, ['Mois', 'CA TTC', 'TVA collectée', 'Dépenses TTC', 'TVA déductible', 'Solde du mois', 'Cumul'],
    tT, new Set([2, 3, 4, 5, 6, 7]), 30);
  y++;
  d.tva.forEach((x, i) => {
    const r = ws.getRow(y);
    const f = i % 2 ? fond(tT.tresClair) : undefined;
    ecrire(r.getCell(1), labelMois(x.mois), { fill: f, font: police({ couleur: C.violetFonce }) });
    [x.caTTC, x.tvaCollectee, x.depTTC, x.tvaDeductible].forEach((v, j) =>
      ecrire(r.getCell(j + 2), v, { fill: f, numFmt: EUROS_POINT }));
    [x.solde, x.cumul].forEach((v, j) => ecrire(r.getCell(j + 6), v, {
      fill: f, numFmt: EUROS_POINT,
      font: police({ bold: j === 1, couleur: v > 0 ? C.rouge : v < 0 ? C.vert : undefined }),
    }));
    y++;
  });
  y += 2;

  // Le récapitulatif : les masses, puis la cascade jusqu'au résultat net.
  bandeau(ws, y, 2, `Récapitulatif de l'exercice ${exercice} (${unite})`, tR);
  y++;
  entetes(ws, y, ['Poste', 'Montant'], tR, new Set([2]));
  y++;
  for (const [label, v] of d.recap) {
    const r = ws.getRow(y);
    const detail = label.startsWith('dont');
    const fort = !detail && label === label.toUpperCase();
    const net = label === 'RÉSULTAT NET';
    const st = {
      font: police({ bold: fort, size: detail ? 9 : net ? 11 : 10, couleur: detail ? C.gris : net ? tR.fonce : undefined }),
      fill: net ? fond(tR.total) : fort ? fond(tR.tresClair) : undefined,
    };
    ecrire(r.getCell(1), label, { ...st, indent: detail ? 1 : undefined });
    ecrire(r.getCell(2), v, { ...st, numFmt: EUROS });
    y++;
  }

  await telecharger(wb, `BBG_Synthese_${exercice}${base === 'ttc' ? '_TTC' : ''}_${todayISO()}.xlsx`);
}
