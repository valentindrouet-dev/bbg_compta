/**
 * La couleur d'un jeu, une fois pour toutes.
 *
 * Elle se choisit dans l'onglet Jeux et sert partout : bandeau de la synthèse,
 * du prévisionnel, pastille du journal, barre de la chronologie. Un jeu sans
 * couleur choisie en reçoit une, tirée de son NOM et non de son rang — ajouter
 * un jeu ne repeint donc pas les autres.
 */
import type { Referentiels } from '../types';

/** Palette pastel de l'app, celle des tableurs. */
export const COULEURS_JEUX = [
  '#b7e1cd', '#f9cb9c', '#b4a7d6', '#9fc5e8', '#ffe599', '#d5a6bd',
  '#a2c4c9', '#e6b8af', '#d9ead3', '#cfe2f3', '#fce5cd', '#ead1dc',
];

/** Rang de départ dans la palette, tiré du nom du jeu. */
function rangDuNom(jeu: string): number {
  let h = 0;
  for (const car of jeu) h = (h * 31 + car.charCodeAt(0)) >>> 0;
  return h % COULEURS_JEUX.length;
}

/** Couleur par défaut d'un jeu, stable et tirée de son nom. */
export function couleurParDefautJeu(jeu: string): string {
  return COULEURS_JEUX[rangDuNom(jeu)];
}

/**
 * Les couleurs du catalogue, résolues d'un coup pour qu'aucune ne soit prise
 * deux fois : deux jeux de la même couleur seraient indiscernables dans la
 * synthèse comme dans la chronologie. Les couleurs choisies à la main sont
 * servies les premières et jamais déplacées ; les autres partent de la teinte
 * que leur nom leur vaut et prennent la première encore libre. Comme l'ordre
 * suit le catalogue, ajouter un jeu à la fin ne repeint pas ceux d'avant.
 */
const resolues = new WeakMap<Referentiels, Map<string, string>>();

function paletteDuCatalogue(refs: Referentiels): Map<string, string> {
  const deja = resolues.get(refs);
  if (deja) return deja;
  const out = new Map<string, string>();
  const prises = new Set<string>();
  const jeux = refs.jeux ?? [];
  for (const j of jeux) {
    const c = refs.jeuxMeta?.[j]?.couleur;
    if (c) { out.set(j, c); prises.add(c.toLowerCase()); }
  }
  for (const j of jeux) {
    if (out.has(j)) continue;
    const depart = rangDuNom(j);
    let choix = COULEURS_JEUX[depart];
    for (let i = 0; i < COULEURS_JEUX.length; i++) {
      const c = COULEURS_JEUX[(depart + i) % COULEURS_JEUX.length];
      if (!prises.has(c.toLowerCase())) { choix = c; break; }
    }
    prises.add(choix.toLowerCase());
    out.set(j, choix);
  }
  resolues.set(refs, out);
  return out;
}

/** La couleur du jeu : la sienne, sinon celle que le catalogue lui réserve. */
export function couleurJeu(jeu: string, refs: Referentiels): string {
  return refs.jeuxMeta?.[jeu]?.couleur
    || paletteDuCatalogue(refs).get(jeu)
    || couleurParDefautJeu(jeu);
}

/**
 * Une teinte plus sombre de la même couleur, pour écrire dessus.
 * Les pastels sont clairs : le texte a besoin d'être franchement plus foncé.
 */
export function encreSur(couleur: string): string {
  const hex = couleur.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) || 0);
  const sombre = (v: number) => Math.round(v * 0.42);
  return `rgb(${sombre(r)}, ${sombre(g)}, ${sombre(b)})`;
}

/**
 * Le fond très clair de la même couleur, pour une ligne sous un bandeau.
 * On mélange la pastel avec du blanc.
 */
export function voileSur(couleur: string, force = 0.35): string {
  const hex = couleur.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) || 0);
  const clair = (v: number) => Math.round(255 - (255 - v) * force);
  return `rgb(${clair(r)}, ${clair(g)}, ${clair(b)})`;
}
