/**
 * Les documents rangés dans la fiche d'un jeu : contrats signés, devis… Les
 * fichiers partagent la base des factures du journal ; ce module dit lesquels
 * appartiennent à un jeu, pour qu'ils ne passent pas pour des factures.
 */
import type { DocumentJeu, JeuMeta, TypeDocumentJeu } from '../types';

export const TYPES_DOCUMENT_JEU: { value: TypeDocumentJeu; label: string }[] = [
  { value: 'contrat', label: 'Contrat signé' },
  { value: 'devis', label: 'Devis' },
  { value: 'autre', label: 'Autre' },
];

export const LIBELLE_TYPE_DOCUMENT: Record<TypeDocumentJeu, string> = {
  contrat: 'Contrat signé',
  devis: 'Devis',
  autre: 'Autre',
};

const RANG_TYPE: Record<TypeDocumentJeu, number> = { contrat: 0, devis: 1, autre: 2 };

/**
 * Le type deviné depuis le nom du fichier déposé : « Contrat_illus_signé.pdf »
 * est un contrat, « Devis Panda 2026.pdf » un devis. Se corrige d'un clic.
 */
export function typeDepuisNom(nom: string): TypeDocumentJeu {
  const bas = nom.toLowerCase();
  if (/contrat|contract|convention|accord/.test(bas)) return 'contrat';
  if (/devis|quote|quotation|estimate|estimation|proforma|pro-forma/.test(bas)) return 'devis';
  return 'autre';
}

/** Les documents d'un jeu : contrats, puis devis, puis le reste, du plus ancien au plus récent. */
export function documentsDuJeu(meta: JeuMeta | undefined): DocumentJeu[] {
  return [...(meta?.documents ?? [])].sort((a, b) =>
    RANG_TYPE[a.type] - RANG_TYPE[b.type] || a.ajouteLe.localeCompare(b.ajouteLe));
}

/**
 * Le nom du document dans l'archive : son type puis son libellé, sans
 * redire le type quand le libellé le dit déjà (« Devis Panda 2026 », pas
 * « Devis - Devis Panda 2026 »).
 */
export function nomDeRangement(doc: DocumentJeu): string {
  const libelle = doc.libelle.trim() || doc.nom.replace(/\.[a-z0-9]+$/i, '');
  const mot = doc.type === 'autre' ? '' : doc.type;
  if (!mot || libelle.toLowerCase().includes(mot)) return libelle;
  return `${LIBELLE_TYPE_DOCUMENT[doc.type]} - ${libelle}`;
}

/** Chaque fichier rangé dans une fiche de jeu, avec son jeu et son document. */
export function fichiersDesJeux(
  jeuxMeta: Record<string, JeuMeta> | undefined,
): Map<string, { jeu: string; doc: DocumentJeu }> {
  const m = new Map<string, { jeu: string; doc: DocumentJeu }>();
  for (const [jeu, meta] of Object.entries(jeuxMeta ?? {})) {
    for (const doc of meta.documents ?? []) m.set(doc.fileId, { jeu, doc });
  }
  return m;
}
