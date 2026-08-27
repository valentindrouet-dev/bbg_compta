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

/** Couleur par défaut d'un jeu, stable et tirée de son nom. */
export function couleurParDefautJeu(jeu: string): string {
  let h = 0;
  for (const car of jeu) h = (h * 31 + car.charCodeAt(0)) >>> 0;
  return COULEURS_JEUX[h % COULEURS_JEUX.length];
}

/** La couleur du jeu : la sienne, sinon celle que son nom lui vaut. */
export function couleurJeu(jeu: string, refs: Referentiels): string {
  return refs.jeuxMeta?.[jeu]?.couleur || couleurParDefautJeu(jeu);
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
