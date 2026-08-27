/**
 * Aides au glisser-déposer de justificatifs (PDF, photos de tickets…).
 */
import type { DragEvent } from 'react';
import { estJustificatif } from './files';

/** Vrai si le curseur transporte des fichiers (et pas du texte ou une image web). */
export function transporteDesFichiers(ev: DragEvent): boolean {
  return [...(ev.dataTransfer?.types ?? [])].includes('Files');
}

/** Les fichiers déposés qui peuvent servir de justificatif. */
export function fichiersDeposes(ev: DragEvent): File[] {
  return [...(ev.dataTransfer?.files ?? [])].filter(estJustificatif);
}

/** « FACT_2026-08_Gamefound.pdf » -> « FACT 2026-08 Gamefound ». */
export function libelleDepuisNom(nom: string): string {
  return nom
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Retrouve un fournisseur déjà connu cité dans le nom du fichier. */
export function fournisseurDepuisNom(nom: string, fournisseurs: string[]): string {
  const bas = nom.toLowerCase();
  // Le nom le plus long l'emporte : « Gamefound EU » plutôt que « Gamefound ».
  return [...fournisseurs]
    .sort((a, b) => b.length - a.length)
    .find(f => f.length >= 3 && bas.includes(f.toLowerCase())) ?? '';
}
