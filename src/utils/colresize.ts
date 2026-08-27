/**
 * Redimensionnement des colonnes, pour tous les tableaux de l'application.
 *
 * Principe : un seul écouteur global surveille les clics près du bord droit
 * d'un en-tête de colonne. Au premier redimensionnement d'un tableau, on
 * mesure toutes ses colonnes et on les fige en pixels ; ensuite on ne fait
 * que déplacer la frontière tirée. Les largeurs sont écrites dans une feuille
 * de style unique (règles `!important`), ce qui les rend insensibles aux
 * re-rendus de React, et enregistrées dans le store — donc conservées d'une
 * session à l'autre.
 *
 * Chaque tableau est identifié par son attribut `data-table`.
 */

const LARGEUR_MIN = 34;
/** Largeur de la zone d'attrapage, en pixels, à droite de l'en-tête. */
const ZONE = 7;
const STYLE_ID = 'bbg-largeurs-colonnes';

export type Largeurs = Record<string, number[]>;

function feuille(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Règles CSS pour une table figée. On vise à la fois `col` et les cellules du
 * premier rang d'en-tête : selon les tableaux, c'est l'un ou l'autre qui
 * porte la largeur, et les deux valeurs sont identiques.
 */
function reglesTable(cle: string, largeurs: number[]): string {
  const sel = `table[data-table="${CSS.escape(cle)}"]`;
  const total = largeurs.reduce((s, w) => s + w, 0);
  const regles = [
    `${sel}{table-layout:fixed!important;width:${total}px!important;min-width:0!important;max-width:none!important}`,
  ];
  largeurs.forEach((w, i) => {
    regles.push(`${sel}>colgroup>col:nth-child(${i + 1}){width:${w}px!important}`);
    regles.push(`${sel}>thead>tr:first-child>th:nth-child(${i + 1}){width:${w}px!important}`);
  });
  return regles.join('\n');
}

/**
 * Une table affichée avec un nombre de colonnes différent de celui enregistré
 * (autre exercice, autre bloc) reprend ses largeurs automatiques : mieux vaut
 * ça qu'un tableau figé de travers.
 */
function largeursApplicables(cle: string, w: number[]): boolean {
  const table = document.querySelector(`table[data-table="${CSS.escape(cle)}"]`);
  const ligne = table?.querySelector('thead > tr:first-child');
  return !ligne || ligne.children.length === w.length;
}

export function appliquerLargeurs(largeurs: Largeurs) {
  feuille().textContent = Object.entries(largeurs)
    .filter(([cle, w]) => w.length && largeursApplicables(cle, w))
    .map(([cle, w]) => reglesTable(cle, w))
    .join('\n');
}

/** Le rang d'en-tête dont les cellules définissent les colonnes. */
function premiereLigne(th: HTMLTableCellElement): HTMLTableRowElement | null {
  const thead = th.closest('thead');
  const ligne = th.parentElement as HTMLTableRowElement | null;
  if (!thead || !ligne || thead.firstElementChild !== ligne) return null;
  return ligne;
}

/** Une cellule est redimensionnable si elle définit une seule colonne. */
function redimensionnable(th: HTMLTableCellElement): boolean {
  return th.colSpan <= 1 && premiereLigne(th) !== null;
}

function largeursMesurees(ligne: HTMLTableRowElement): number[] {
  return [...ligne.children].map(c => Math.round(c.getBoundingClientRect().width));
}

export interface OptionsResize {
  /** Largeurs connues, pour la reprise et la mise à jour en direct. */
  lire: () => Largeurs;
  /** Appelé une fois le glissement terminé. */
  enregistrer: (table: string, largeurs: number[]) => void;
  /** Double-clic sur la poignée : rend ses largeurs automatiques au tableau. */
  reinitialiser: (table: string) => void;
}

/**
 * Installe les écouteurs. Renvoie la fonction de désinstallation.
 */
export function installerResize(opts: OptionsResize): () => void {
  let glisse: {
    cle: string; index: number; departX: number; largeurs: number[];
    bouge: boolean;
  } | null = null;

  function cible(ev: MouseEvent): { th: HTMLTableCellElement; cle: string } | null {
    const el = ev.target as HTMLElement | null;
    if (!el) return null;
    // Un clic sur un bouton (tri, mise en forme) n'est jamais un glissement.
    if (el.closest('button, input, select, a')) return null;
    const th = el.closest('th') as HTMLTableCellElement | null;
    if (!th || !redimensionnable(th)) return null;
    const table = th.closest('table') as HTMLTableElement | null;
    const cle = table?.dataset.table;
    if (!table || !cle) return null;
    const r = th.getBoundingClientRect();
    if (ev.clientX < r.right - ZONE || ev.clientX > r.right + 2) return null;
    return { th, cle };
  }

  function surAppui(ev: MouseEvent) {
    if (ev.button !== 0) return;
    const c = cible(ev);
    if (!c) return;
    const ligne = premiereLigne(c.th)!;
    const connues = opts.lire()[c.cle];
    const largeurs = connues && connues.length === ligne.children.length
      ? [...connues]
      : largeursMesurees(ligne);
    glisse = {
      cle: c.cle,
      index: (c.th as HTMLTableCellElement).cellIndex,
      departX: ev.clientX,
      largeurs,
      bouge: false,
    };
    // Fige immédiatement les autres colonnes : la table ne se réarrange pas
    // sous les doigts pendant qu'on tire une frontière.
    appliquerLargeurs({ ...opts.lire(), [c.cle]: largeurs });
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    ev.preventDefault();
  }

  function surDeplacement(ev: MouseEvent) {
    if (!glisse) return;
    const delta = ev.clientX - glisse.departX;
    if (Math.abs(delta) > 2) glisse.bouge = true;
    const suivantes = [...glisse.largeurs];
    suivantes[glisse.index] = Math.max(LARGEUR_MIN, glisse.largeurs[glisse.index] + delta);
    appliquerLargeurs({ ...opts.lire(), [glisse.cle]: suivantes });
  }

  function surRelachement(ev: MouseEvent) {
    if (!glisse) return;
    const delta = ev.clientX - glisse.departX;
    const suivantes = [...glisse.largeurs];
    suivantes[glisse.index] = Math.max(LARGEUR_MIN, glisse.largeurs[glisse.index] + delta);
    const { cle, bouge } = glisse;
    glisse = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    opts.enregistrer(cle, suivantes);
    // Le clic qui suit le glissement ne doit pas déclencher le tri.
    if (bouge) {
      const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    }
    void ev;
  }

  function surDoubleClic(ev: MouseEvent) {
    const c = cible(ev);
    if (!c) return;
    ev.preventDefault();
    opts.reinitialiser(c.cle);
  }

  window.addEventListener('mousedown', surAppui, true);
  window.addEventListener('mousemove', surDeplacement);
  window.addEventListener('mouseup', surRelachement);
  window.addEventListener('dblclick', surDoubleClic, true);
  return () => {
    window.removeEventListener('mousedown', surAppui, true);
    window.removeEventListener('mousemove', surDeplacement);
    window.removeEventListener('mouseup', surRelachement);
    window.removeEventListener('dblclick', surDoubleClic, true);
  };
}
