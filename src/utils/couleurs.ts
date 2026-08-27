/**
 * Dérivation des couleurs d'un bloc à partir d'une seule teinte.
 *
 * Le principe : tu choisis une teinte majeure (le vert des produits, l'orange
 * des charges…) et tout le bloc se recolore autour — en-tête soutenu, bandes de
 * groupe plus claires, lignes alternées blanc / très clair, ligne de total plus
 * dense, texte foncé de la même famille. Une seule couleur à choisir, et
 * l'ensemble reste lisible.
 */

export interface Teinte {
  /** En-tête de tableau, pastille du bloc. */
  base: string;
  /** Bandeau de groupe, survol de ligne. */
  clair: string;
  /** Alternance des lignes (l'autre ligne sur deux reste blanche). */
  tresClair: string;
  /** Ligne de total : plus dense que l'en-tête. */
  total: string;
  /** Texte sur fond pastel, et bordures marquées. */
  fonce: string;
  /** Bordures des cellules d'en-tête. */
  bord: string;
}

interface HSL { h: number; s: number; l: number }

function versHSL(hex: string): HSL {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x8e7cc3;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
    : max === g ? (b - r) / d + 2
      : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function versHex({ h, s, l }: HSL): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const oct = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${oct(r)}${oct(g)}${oct(b)}`;
}

const borne = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

/** Les six nuances d'un bloc, calculées depuis sa teinte majeure. */
export function teinte(hex: string): Teinte {
  const { h, s, l } = versHSL(hex);
  // Une teinte trop pâle ne ferait pas un en-tête lisible : on la densifie.
  const base = { h, s, l: borne(Math.min(l, 0.86), 0.62, 0.86) };
  return {
    base: versHex(base),
    clair: versHex({ h, s: s * 0.9, l: 0.915 }),
    tresClair: versHex({ h, s: s * 0.8, l: 0.968 }),
    total: versHex({ h, s: borne(s * 1.05, 0, 0.9), l: 0.79 }),
    fonce: versHex({ h, s: borne(s * 1.25, 0.18, 0.7), l: s < 0.08 ? 0.3 : 0.26 }),
    bord: versHex({ h, s, l: 0.63 }),
  };
}

/** Teintes proposées par le bouton de recoloration — la palette des tableurs BBG. */
export const TEINTES_MAJEURES: { nom: string; hex: string }[] = [
  { nom: 'Vert', hex: '#b7e1cd' },
  { nom: 'Turquoise', hex: '#a2c4c9' },
  { nom: 'Bleu', hex: '#9fc5e8' },
  { nom: 'Violet', hex: '#b4a7d6' },
  { nom: 'Rose', hex: '#d5a6bd' },
  { nom: 'Corail', hex: '#ea9999' },
  { nom: 'Orange', hex: '#f9cb9c' },
  { nom: 'Jaune', hex: '#ffe599' },
  { nom: 'Gris', hex: '#cfd3de' },
];

/** Variables CSS à poser sur un tableau pour qu'il prenne les couleurs du bloc. */
export function variablesTeinte(t: Teinte): Record<string, string> {
  return {
    '--bloc': t.base,
    '--bloc-clair': t.clair,
    '--bloc-tres-clair': t.tresClair,
    '--bloc-total': t.total,
    '--bloc-fonce': t.fonce,
    '--bloc-bord': t.bord,
  };
}
