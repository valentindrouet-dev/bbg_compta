/**
 * Ce que coûte la rémunération d'un dirigeant TNS.
 *
 * Un gérant majoritaire n'est pas salarié : il n'y a ni bulletin de paie, ni
 * charges patronales au sens du régime général. Il perçoit une rémunération, et
 * l'entreprise paie par-dessus les cotisations sociales des indépendants —
 * l'une et l'autre étant des charges déductibles. Le coût pour l'entreprise est
 * donc : rémunération versée + cotisations.
 *
 * Le calcul suit le barème des indépendants. Deux points le rendent moins
 * simple qu'un pourcentage :
 *   - plusieurs cotisations sont plafonnées au PASS ou progressives entre deux
 *     bornes (maladie, allocations familiales) ;
 *   - la CSG-CRDS se calcule sur la rémunération PLUS les cotisations
 *     obligatoires, donc sur une assiette qui dépend du reste du calcul.
 *
 * Les taux sont regroupés dans BAREME_TNS pour rester modifiables : ils
 * changent chaque année, et une création d'entreprise bénéficie en plus
 * d'exonérations (ACRE) et de cotisations forfaitaires les deux premières
 * années. Ce calcul donne l'ordre de grandeur à budgéter, pas l'appel de
 * cotisations de l'URSSAF.
 */

export interface BaremeTNS {
  /** Plafond annuel de la sécurité sociale, en euros. */
  pass: number;
  /** Maladie-maternité : 0 % sous 40 % du PASS, puis progressif. */
  maladie: { seuilBas: number; seuilMedian: number; seuilHaut: number; tauxMedian: number; tauxHaut: number };
  indemnitesJournalieres: number;
  retraiteBasePlafonnee: number;
  retraiteBaseDeplafonnee: number;
  retraiteComplementaire: number;
  /** Tranche 2 de la retraite complémentaire, au-delà d'un PASS. */
  retraiteComplementaireT2: number;
  invaliditeDeces: number;
  /** Allocations familiales : 0 % sous 110 % du PASS, 3,10 % au-delà de 140 %. */
  allocationsFamiliales: { seuilBas: number; seuilHaut: number; taux: number };
  csgCrds: number;
  formationProfessionnelle: number;
}

/** Barème 2025 des travailleurs indépendants (hors professions libérales). */
export const BAREME_TNS: BaremeTNS = {
  pass: 47_100,
  maladie: { seuilBas: 0.4, seuilMedian: 0.6, seuilHaut: 1.1, tauxMedian: 4, tauxHaut: 6.5 },
  indemnitesJournalieres: 0.5,
  retraiteBasePlafonnee: 17.75,
  retraiteBaseDeplafonnee: 0.6,
  retraiteComplementaire: 7,
  retraiteComplementaireT2: 8,
  invaliditeDeces: 1.3,
  allocationsFamiliales: { seuilBas: 1.1, seuilHaut: 1.4, taux: 3.1 },
  csgCrds: 9.7,
  formationProfessionnelle: 0.25,
};

export interface CotisationsTNS {
  /** La rémunération versée au dirigeant, sur l'année. */
  remuneration: number;
  postes: { label: string; montant: number }[];
  /** Total des cotisations, CSG-CRDS et formation comprises. */
  cotisations: number;
  /** Ce que l'entreprise doit prévoir : rémunération + cotisations. */
  cout: number;
  /** Cotisations rapportées à la rémunération (0,42 = 42 %). */
  taux: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Interpolation linéaire entre deux bornes, bornée aux extrémités. */
function palier(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
}

/** Les cotisations dues sur une rémunération annuelle donnée. */
export function cotisationsTNS(remuneration: number, b: BaremeTNS = BAREME_TNS): CotisationsTNS {
  const R = Math.max(0, remuneration);
  const ratio = R / b.pass;
  const plafonne = Math.min(R, b.pass);

  const tauxMaladie = ratio <= b.maladie.seuilBas ? 0
    : ratio <= b.maladie.seuilMedian
      ? palier(ratio, b.maladie.seuilBas, b.maladie.seuilMedian, 0, b.maladie.tauxMedian)
      : palier(ratio, b.maladie.seuilMedian, b.maladie.seuilHaut, b.maladie.tauxMedian, b.maladie.tauxHaut);
  const tauxAF = ratio <= b.allocationsFamiliales.seuilBas ? 0
    : palier(ratio, b.allocationsFamiliales.seuilBas, b.allocationsFamiliales.seuilHaut,
      0, b.allocationsFamiliales.taux);

  const obligatoires = [
    { label: 'Maladie-maternité', montant: R * tauxMaladie / 100 },
    { label: 'Indemnités journalières', montant: Math.min(R, 5 * b.pass) * b.indemnitesJournalieres / 100 },
    { label: 'Retraite de base', montant: plafonne * b.retraiteBasePlafonnee / 100 + R * b.retraiteBaseDeplafonnee / 100 },
    {
      label: 'Retraite complémentaire',
      montant: plafonne * b.retraiteComplementaire / 100
        + Math.max(0, Math.min(R, 4 * b.pass) - b.pass) * b.retraiteComplementaireT2 / 100,
    },
    { label: 'Invalidité-décès', montant: plafonne * b.invaliditeDeces / 100 },
    { label: 'Allocations familiales', montant: R * tauxAF / 100 },
  ];
  const sommeObligatoires = obligatoires.reduce((s, p) => s + p.montant, 0);

  // La CSG-CRDS porte sur la rémunération augmentée des cotisations obligatoires.
  const postes = [
    ...obligatoires,
    { label: 'CSG-CRDS', montant: (R + sommeObligatoires) * b.csgCrds / 100 },
    { label: 'Formation professionnelle', montant: b.pass * b.formationProfessionnelle / 100 },
  ].map(p => ({ ...p, montant: r2(p.montant) }));

  const cotisations = r2(postes.reduce((s, p) => s + p.montant, 0));
  return {
    remuneration: r2(R),
    postes,
    cotisations,
    cout: r2(R + cotisations),
    taux: R ? cotisations / R : 0,
  };
}

/**
 * Le chemin inverse : quelle rémunération verser pour que le dirigeant touche
 * ce net-là ? Pour un TNS la rémunération versée EST le net perçu (avant impôt
 * sur le revenu) : les cotisations viennent en plus, à la charge de
 * l'entreprise. La fonction sert donc surtout à répondre à la question posée
 * dans l'autre sens — « pour 2 000 € par mois, je budgète combien ? ».
 */
export function coutPourNet(netAnnuel: number, b: BaremeTNS = BAREME_TNS): CotisationsTNS {
  return cotisationsTNS(netAnnuel, b);
}
