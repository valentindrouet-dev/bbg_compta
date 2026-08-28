/**
 * Le Wiki : de quoi se souvenir de tout.
 *
 * La comptabilité française a son vocabulaire, et chaque notion se paie d'une
 * conséquence concrète — une charge diminue le résultat, une immobilisation ne
 * le fait que par sa dotation, la TVA ne le touche jamais. Cette page range
 * tout ce que l'app calcule, avec la formule exacte et l'endroit où ça se
 * saisit, pour qu'aucun chiffre ne reste une boîte noire.
 */
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Page } from '../../App';
import { PageHeader, Card, Btn } from '../ui';
import { useEtatVue } from '../../utils/etatVue';

interface Entree {
  /** Le terme, tel qu'on le cherche. */
  mot: string;
  /** Les autres façons de le dire — elles servent à la recherche. */
  aussi?: string[];
  /** En une phrase. */
  court: string;
  /** L'explication, en français simple. */
  detail: string;
  /** La formule exacte, telle que l'app la calcule. */
  formule?: string;
  /** Où ça se saisit ou se lit dans l'app. */
  ou?: { texte: string; page?: Page };
  /** Le piège classique. */
  attention?: string;
}

interface Chapitre {
  cle: string;
  titre: string;
  intro: string;
  entrees: Entree[];
}

const CHAPITRES: Chapitre[] = [
  {
    cle: 'bases',
    titre: 'Les bases',
    intro: 'Le vocabulaire de tous les jours, celui qui revient dans chaque tableau.',
    entrees: [
      {
        mot: 'HT — hors taxes',
        aussi: ['hors taxe'],
        court: 'Le montant sans la TVA. C’est la base de tous les résultats.',
        detail: 'Le prix réel de ce que tu achètes ou vends, une fois la TVA mise de côté. '
          + 'Le compte de résultat, la marge, l’EBE : tout se raisonne en HT, parce que la TVA '
          + 'n’est pas à toi — tu la collectes pour l’État, ou tu te la fais rembourser.',
        formule: 'HT = TTC − TVA',
        ou: { texte: 'Bouton HT / TTC en haut des pages de chiffres' },
      },
      {
        mot: 'TTC — toutes taxes comprises',
        court: 'Ce qui sort vraiment du compte en banque.',
        detail: 'Le montant que tu paies ou que tu encaisses réellement, TVA incluse. '
          + 'C’est la seule vue qui compte pour la trésorerie : ta banque ne connaît pas le HT.',
        formule: 'TTC = HT + TVA',
        ou: { texte: 'Trésorerie', page: 'treso' },
      },
      {
        mot: 'TVA — taxe sur la valeur ajoutée',
        court: 'Ni un produit ni une charge : de l’argent qui transite.',
        detail: 'Tu collectes de la TVA sur tes ventes, tu en paies sur tes achats, et tu reverses '
          + 'la différence à l’État. Elle ne passe jamais par le compte de résultat : elle '
          + 'transite par des comptes de bilan (les comptes 445). Quand la déductible dépasse la '
          + 'collectée, l’État te doit de l’argent : c’est un crédit de TVA.',
        formule: 'Solde = TVA collectée (ventes) − TVA déductible (achats)',
        ou: { texte: 'TVA', page: 'tva' },
        attention: 'Une charge sans justificatif n’est pas déductible et sa TVA n’est pas '
          + 'récupérable. Les contrôles comptables de la synthèse annuelle les signalent.',
      },
      {
        mot: 'Exercice comptable',
        court: 'L’année de la société : du 1er octobre au 30 septembre.',
        detail: 'Chez Big Budi Games l’exercice ne suit pas l’année civile. Le premier, '
          + '2025-26, compte 14 mois : la pré-immatriculation (mai → août 2025), septembre 2025, '
          + 'puis les douze mois d’octobre 2025 à septembre 2026.',
        ou: { texte: 'Onglets d’exercice en haut de chaque page' },
      },
      {
        mot: 'Écriture',
        aussi: ['ligne', 'saisie'],
        court: 'Une ligne du journal : une dépense, un investissement ou une recette.',
        detail: 'Chaque écriture porte une date, un fournisseur, une catégorie, un montant TTC, '
          + 'sa TVA, et le mois comptable auquel elle se rattache. C’est la brique de tout le '
          + 'reste : synthèse, résultat, TVA, trésorerie sont recalculés écriture par écriture.',
        ou: { texte: 'Journal du mois', page: 'journal' },
        attention: 'Le mois comptable peut différer de la date : une facture de septembre payée en '
          + 'octobre se rattache au mois où elle appartient. C’est lui qui commande les totaux.',
      },
    ],
  },
  {
    cle: 'resultat',
    titre: 'Le compte de résultat',
    intro: 'L’enchaînement qui va du chiffre d’affaires au bénéfice, étage par étage.',
    entrees: [
      {
        mot: 'Produits d’exploitation',
        aussi: ['chiffre d’affaires', 'CA', 'recettes'],
        court: 'Ce que l’activité rapporte, hors taxes.',
        detail: 'Ventes, prestations, subventions. Chez toi : les workshops ARTFX et les ventes de '
          + 'jeux. Un remboursement ou une note de frais ne sont pas des produits : ce sont des '
          + 'charges en moins, sinon le chiffre d’affaires serait gonflé artificiellement.',
        ou: { texte: 'Synthèse annuelle → bloc Produits', page: 'synthese' },
      },
      {
        mot: 'Charges d’exploitation',
        court: 'Ce que l’activité coûte, hors investissements.',
        detail: 'Charges externes (logiciels, déplacements, comptable…), personnel et rémunérations, '
          + 'dépenses de jeux passées en charges. Les <b>investissements n’en font pas '
          + 'partie</b> : ils s’inscrivent à l’actif et ne pèsent que par leur dotation.',
        formule: 'Charges externes − charges financières + personnel',
        ou: { texte: 'Synthèse annuelle → bloc Charges', page: 'synthese' },
      },
      {
        mot: 'EBE — excédent brut d’exploitation',
        court: 'Ce que l’activité dégage avant amortissements et frais financiers.',
        detail: 'Le premier vrai indicateur de rentabilité : il dit si le métier gagne de '
          + 'l’argent, indépendamment de la façon dont il est financé et de l’usure du '
          + 'matériel.',
        formule: 'EBE = produits d’exploitation − charges d’exploitation',
        ou: { texte: 'Synthèse annuelle → Compte de résultat', page: 'synthese' },
      },
      {
        mot: 'REX — résultat d’exploitation',
        court: 'L’EBE une fois retranchées les dotations aux amortissements.',
        detail: 'Il tient compte de l’usure des immobilisations, étalée sur leur durée de vie.',
        formule: 'REX = EBE − dotations aux amortissements',
      },
      {
        mot: 'RC — résultat courant avant impôt',
        court: 'Le REX corrigé des produits et charges financiers.',
        detail: 'On y ajoute les intérêts perçus sur les placements et on retranche les frais '
          + 'financiers (agios, frais bancaires).',
        formule: 'RC = REX + produits financiers − charges financières',
      },
      {
        mot: 'IS — impôt sur les sociétés',
        court: 'L’impôt sur le bénéfice, au barème PME.',
        detail: 'Une société qui perd de l’argent ne paie pas d’IS. Au-dessus de zéro, le '
          + 'taux réduit PME de 15 % s’applique jusqu’à 42 500 € de bénéfice, puis 25 % '
          + 'au-delà.',
        formule: 'IS = 15 % jusqu’à 42 500 € · 25 % sur ce qui dépasse',
      },
      {
        mot: 'RN — résultat net',
        aussi: ['bénéfice', 'perte'],
        court: 'Ce qui reste vraiment, une fois tout payé.',
        detail: 'Le dernier étage. C’est lui qui vient grossir — ou entamer — les capitaux '
          + 'propres de la société à la clôture.',
        formule: 'RN = RC − IS',
      },
    ],
  },
  {
    cle: 'immos',
    titre: 'Immobilisations et amortissements',
    intro: 'Ce qui sert plusieurs années ne pèse pas d’un coup sur le résultat.',
    entrees: [
      {
        mot: 'Immobilisation',
        aussi: ['immo', 'investissement'],
        court: 'Un bien durable, porté à l’actif au lieu d’être passé en charges.',
        detail: 'Un ordinateur, du mobilier, des travaux, le développement graphique d’un jeu : '
          + 'ils servent plusieurs années. Les passer en charges plomberait l’année de '
          + 'l’achat et rendrait les suivantes trop belles. Ils entrent donc à l’actif du '
          + 'bilan, et seule leur <b>dotation</b> atteint le résultat.',
        ou: { texte: 'Immobilisations (lecture seule) — la saisie se fait au journal', page: 'immos' },
        attention: 'C’est la <b>catégorie</b> qui décide, dans l’onglet Catégories : elle '
          + 'peut être marquée « Immobilisation », « Charge », ou laissée « au cas par cas ». Ce '
          + 'réglage vaut partout — journal, synthèse et prévisionnel.',
      },
      {
        mot: 'Amortissement',
        court: 'Étaler le coût d’un bien sur sa durée d’usage.',
        detail: 'L’app applique l’amortissement <b>linéaire</b> : le même montant chaque '
          + 'mois, à partir de la date d’acquisition, au prorata des jours du premier mois '
          + '(le <i>prorata temporis</i>). Un bien acheté le 20 ne s’amortit ce mois-là que '
          + 'pour les jours restants.',
        formule: 'Dotation mensuelle = HT ÷ (durée en années × 12)',
      },
      {
        mot: 'Dotation aux amortissements',
        court: 'La part du bien qui pèse sur le résultat cette année.',
        detail: 'C’est la seule façon dont un investissement touche le compte de résultat. Il '
          + 'ne sort pas de la trésorerie : l’argent, lui, est parti le jour de l’achat.',
        ou: { texte: 'Immobilisations', page: 'immos' },
      },
      {
        mot: 'VNC — valeur nette comptable',
        court: 'Ce qui reste à amortir : la valeur du bien au bilan aujourd’hui.',
        formule: 'VNC = HT − amortissements déjà passés',
        detail: 'À la fin de la durée, la VNC vaut zéro : le bien est entièrement amorti, même '
          + 's’il sert encore.',
      },
      {
        mot: 'Durée d’amortissement',
        court: 'Sur combien d’années le bien est étalé.',
        detail: 'Elle dépend du bien : autour de 3 ans pour de l’informatique, 5 ans pour du '
          + 'mobilier ou un développement, 10 ans et plus pour des travaux. Dans le prévisionnel, '
          + 'chaque ligne d’investissement porte la sienne (3 / 5 / 10 ans, ou libre).',
        ou: { texte: 'Prévisionnel → Immobilisations', page: 'budgets' },
      },
    ],
  },
  {
    cle: 'stock',
    titre: 'Le stock',
    intro: 'Un tirage se paie d’un coup et s’écoule sur des années : le stock remet chaque '
      + 'coût en face de la vente qui lui correspond.',
    entrees: [
      {
        mot: 'Stock',
        court: 'Les exemplaires fabriqués mais pas encore vendus. C’est un actif.',
        detail: 'Sans stock en comptabilité, un tirage payé en janvier plomberait l’exercice, '
          + 'et les ventes des années suivantes paraîtraient toutes en marge — faux dans les deux '
          + 'sens. Les invendus restent à l’actif, valorisés au coût de revient.',
        formule: 'Stock fin = stock début + fabriqués − vendus',
        ou: { texte: 'Stocks (réel) · Prévisionnel → Stock (budget)', page: 'stocks' },
      },
      {
        mot: 'Coût de revient unitaire',
        aussi: ['prix de revient'],
        court: 'Ce que coûte un exemplaire, fabrication et transport compris.',
        detail: 'Il ne se calcule pas ici : il vient du <b>Production Calculator</b>, qui tient les '
          + 'devis usine. On le recopie une fois par tirage. C’est lui qui valorise le stock et '
          + 'le coût des ventes.',
      },
      {
        mot: 'Coût des exemplaires vendus',
        aussi: ['COGS', 'coût des ventes'],
        court: 'La seule part du tirage qui pèse sur le résultat.',
        formule: 'Coût des ventes = exemplaires vendus × coût de revient unitaire',
        detail: 'Le reste du tirage dort à l’actif, en stock, jusqu’à ce qu’il se '
          + 'vende.',
      },
      {
        mot: 'Variation de stock',
        court: 'La correction qui neutralise le coût des exemplaires encore en carton.',
        detail: 'Le tirage payé à l’usine est une charge du mois où tu le règles. La variation '
          + 'de stock la reprend pour la part non vendue. Au bout du compte, seul le coût de ce qui '
          + 'est vendu reste en charges.',
        formule: 'Variation = (stock fin − stock début) × coût de revient',
      },
      {
        mot: 'Marge sur ventes',
        court: 'L’effet net du stock sur le résultat.',
        formule: 'Marge = ventes − coût des exemplaires vendus − droits dus',
        detail: 'Vérification utile : coût des tirages − variation de stock = coût des ventes. Si '
          + 'les deux ne tombent pas d’accord, un chiffre est faux.',
      },
      {
        mot: 'Droits d’auteur',
        aussi: ['redevances', 'royalties'],
        court: 'Un pourcentage des ventes reversé à l’auteur ou à l’illustratrice.',
        formule: 'Droits = taux × assiette × exemplaires vendus',
        detail: 'Deux assiettes possibles, et le contrat tranche. Le **% du PPHT** applique le taux '
          + 'au prix public hors taxes, le même quel que soit le canal : un jeu à 40 € PPHT avec 8 % '
          + 'de droits coûte 3,20 € par exemplaire, qu’il parte chez un distributeur ou en boutique. '
          + 'Le **% du prix encaissé** applique le taux à ce que tu reçois vraiment : la pondération '
          + 'entre distributeur, boutique et éditeur se fait alors toute seule, puisqu’on part du '
          + 'chiffre d’affaires du mois. Plusieurs ayants droit peuvent coexister sur un même jeu — '
          + 'chacun a son taux, son assiette et son avance.',
        ou: { texte: 'Prévisionnel → Stock', page: 'budgets' },
        attention: 'Les droits se retranchent de la marge : ce ne sont pas des ventes en moins, '
          + 'mais une charge de plus.',
      },
      {
        mot: 'Avance sur droits',
        aussi: ['à-valoir', 'avance récupérable'],
        court: 'Une somme versée d’avance, que les premiers droits remboursent.',
        formule: 'Droits dus = max(0, droits cumulés − avance)',
        detail: 'Verser 1 000 € à la signature n’est pas un cadeau : c’est une avance sur les droits '
          + 'à venir. Tant que les droits acquis n’ont pas rattrapé ces 1 000 €, il n’y a rien de plus '
          + 'à payer — l’argent est déjà sorti, et le repasser en charge le compterait deux fois. '
          + 'Passé ce seuil, chaque vente coûte réellement ses droits et la marge s’en ressent. '
          + 'Le tableau montre entre parenthèses ce que l’avance absorbe chaque mois, pour qu’on voie '
          + 'venir la bascule. Le compteur ne se remet pas à zéro d’un exercice à l’autre : une avance '
          + 'soldée l’an dernier reste soldée.',
        ou: { texte: 'Prévisionnel → Stock', page: 'budgets' },
        attention: 'L’avance elle-même se saisit au journal, le mois où tu la verses '
          + '(catégorie « Avances Droit d’Auteur »). Ici, elle ne sert que de seuil.',
      },
      {
        mot: 'Tirage',
        aussi: ['impression', 'réimpression', 'série'],
        court: 'Une fabrication : ses exemplaires, son coût, son stock.',
        detail: 'Un jeu qui se vend bien se réimprime, et le second tirage n’a ni le même coût de '
          + 'revient ni forcément les mêmes prix. Chacun a donc son tableau, suivi pour son compte : '
          + 'son stock, ses canaux, ses droits. Le **% de ventes** se rapporte au tirage complet — '
          + 'stock d’ouverture plus tout ce qui est sorti d’usine — et non au stock restant, si bien '
          + 'que 20 % veulent dire la même chose chaque année. La colonne Total affiche le **cumul de '
          + 'tous les exercices** : au-delà de 100 %, on prévoit de vendre plus d’exemplaires qu’il '
          + 'n’en a été imprimé, et l’app le signale en rouge.',
        ou: { texte: 'Prévisionnel → Stock', page: 'budgets' },
        attention: 'Les pourcentages de deux tirages ne s’additionnent pas : 100 % d’un tirage, '
          + 'ce sont ses exemplaires à lui.',
      },
      {
        mot: 'TVA à l’importation',
        aussi: ['autoliquidation', 'fabrication en Chine', 'dédouanement'],
        court: 'La TVA d’un tirage venu de Chine ne sort pas du compte.',
        detail: 'L’usine chinoise facture hors taxes : rien à payer sur sa facture. La TVA due à '
          + 'l’importation est **autoliquidée** depuis 2022 — déclarée et déduite sur la même CA3 — '
          + 'donc sans sortie de caisse pour une société entièrement taxable. Le montant en euros du '
          + 'tirage est ainsi le même en HT et en TTC, et c’est pour cela que la **TVA tirage** vaut '
          + '0 % par défaut. Une fabrication française mettrait 20. Le **transport international** '
          + 'suit la même logique. En revanche, le **dédouanement**, la **livraison** locale et la '
          + '**manutention** sont des prestations françaises à 20 % : elles se saisissent comme des '
          + 'charges ordinaires, avec leur taux.',
        ou: { texte: 'Prévisionnel → Stock, champ « TVA tirage »', page: 'budgets' },
        attention: 'Les **droits de douane** ne sont pas de la TVA : ils ne se récupèrent pas et '
          + 'entrent dans le coût de revient de l’exemplaire.',
      },
      {
        mot: 'PPHT',
        aussi: ['prix public HT', 'prix public conseillé'],
        court: 'Le prix en boutique, hors TVA.',
        detail: 'Ce n’est pas un prix auquel tu vends — chaque canal a le sien — mais c’est souvent '
          + 'l’assiette contractuelle des droits d’auteur, et un repère commode à garder à côté du '
          + 'coût de revient. Il se saisit en haut du tableau de stock de chaque jeu.',
        ou: { texte: 'Prévisionnel → Stock', page: 'budgets' },
      },
      {
        mot: 'Canal de vente',
        aussi: ['distributeur', 'boutique', 'éditeur'],
        court: 'Un même jeu ne part pas au même prix selon à qui il est vendu.',
        detail: 'Chaque canal a sa <b>part du tirage</b> — 60 % distributeur, 10 % boutique, 30 % '
          + 'éditeur par exemple — et <b>son prix</b>. Une seule ligne « % de ventes » pilote le '
          + 'mois : 10 % de ventes sur 3 000 exemplaires font 300 boîtes, réparties d’elles-mêmes '
          + 'en 180 / 30 / 90.',
        ou: { texte: 'Prévisionnel → Stock', page: 'budgets' },
      },
      {
        mot: 'Coût moyen pondéré',
        aussi: ['CMP'],
        court: 'La méthode qui valorise les sorties de stock réelles.',
        detail: 'Chaque entrée met à jour un coût moyen ; les sorties sont valorisées à ce coût. '
          + 'C’est la méthode admise et la plus simple à justifier devant un comptable.',
        formule: 'Coût moyen = valeur totale des entrées ÷ quantité totale entrée',
      },
    ],
  },
  {
    cle: 'treso',
    titre: 'Trésorerie et financement',
    intro: 'L’argent qui bouge vraiment — il ne suit pas le résultat.',
    entrees: [
      {
        mot: 'Trésorerie',
        court: 'Ce qu’il y a sur le compte, TTC.',
        detail: 'Elle ne se déduit pas du résultat : un investissement sort en totalité alors '
          + 'qu’il ne pèse au résultat que par sa dotation ; une dotation pèse au résultat sans '
          + 'rien sortir. Le solde affiché est celui de la fin du <b>mois en cours</b>, pas de la '
          + 'dernière ligne du tableau — un mouvement planifié en octobre ne doit pas amputer ce que '
          + 'tu as aujourd’hui.',
        ou: { texte: 'Trésorerie', page: 'treso' },
      },
      {
        mot: 'Capital social',
        court: 'L’argent apporté par l’associé, définitivement. C’est du capital propre.',
        detail: 'Ce n’est pas un produit : il ne passe pas par le résultat. Il entre en '
          + 'trésorerie et grossit les capitaux propres au bilan.',
        ou: { texte: 'Trésorerie → mouvements financiers', page: 'treso' },
      },
      {
        mot: 'CCA — compte courant d’associé',
        court: 'De l’argent prêté à la société par l’associé. C’est une dette.',
        detail: 'Il entre en trésorerie mais reste dû : la société te le rendra. Ce n’est donc '
          + 'ni un produit à l’apport, ni une charge au remboursement — juste une dette '
          + 'qu’on éteint.',
        ou: { texte: 'Trésorerie → mouvements financiers', page: 'treso' },
      },
      {
        mot: 'Placement',
        aussi: ['compte à terme'],
        court: 'De l’argent déplacé, pas dépensé.',
        detail: 'Un virement vers un compte à terme sort de la trésorerie disponible mais reste à '
          + 'toi : c’est un transfert d’actif. Seuls les intérêts qu’il rapporte sont '
          + 'un produit (financier).',
      },
      {
        mot: 'Charges financières',
        court: 'Agios, frais bancaires, intérêts payés.',
        detail: 'Elles ne sont pas des charges d’exploitation : elles sont retranchées plus '
          + 'bas, au niveau du résultat courant, pour ne pas fausser l’EBE.',
      },
      {
        mot: 'TNS — travailleur non salarié',
        court: 'Le statut du dirigeant qui n’est pas salarié de sa société.',
        detail: 'Les cotisations ne sont pas un pourcentage fixe : maladie et allocations '
          + 'familiales sont progressives, la retraite est plafonnée au PASS, la CSG-CRDS porte sur '
          + 'une base élargie. Le calculateur du prévisionnel donne le coût total à budgéter pour un '
          + 'net voulu.',
        ou: { texte: 'Prévisionnel → Charges', page: 'budgets' },
      },
    ],
  },
  {
    cle: 'prev',
    titre: 'Le prévisionnel',
    intro: 'Ce qui est budgété, et comment il se raccorde au réel.',
    entrees: [
      {
        mot: 'Prévisionnel',
        court: 'Le budget, bloc par bloc et mois par mois, sur cinq exercices.',
        detail: 'Il reprend exactement les catégories, les groupes et l’ordre de la synthèse : '
          + 'renommer une catégorie dans l’onglet Catégories se répercute des deux côtés. Cinq '
          + 'onglets : Charges, Produits, Immobilisations, Stock et Total.',
        ou: { texte: 'Prévisionnel', page: 'budgets' },
      },
      {
        mot: 'Imprévus',
        court: 'Un pourcentage de ce qui précède dans le bloc.',
        detail: 'La ligne se calcule sur la somme des lignes situées <b>au-dessus d’elle</b> '
          + 'dans le même bloc — ce qui lui évite de se calculer sur elle-même. Le pourcentage se '
          + 'règle sur la ligne.',
      },
      {
        mot: 'Ligne calculée (heures × taux)',
        court: 'Une quantité multipliée par un taux, éventuellement décalée dans le temps.',
        detail: 'C’est ainsi que les workshops sont budgétés : les heures sont faites un mois, '
          + 'la facture est encaissée le mois suivant. Le taux se saisit en HT ou en TTC, et le '
          + 'décalage se choisit (même mois, +1, +2, +3).',
      },
      {
        mot: 'Réel vs prévu',
        court: 'Le budget confronté aux écritures, ligne à ligne.',
        detail: 'Le réel vient du journal, jamais d’une recopie. Un écart n’est pas une '
          + 'erreur : c’est une information.',
        ou: { texte: 'Réel vs Prévu', page: 'reelprevu' },
      },
      {
        mot: 'Trésorerie prévisionnelle',
        court: 'Le réel jusqu’au mois en cours, le budget ensuite.',
        detail: 'Sur l’exercice en cours, ce qui est encaissé et payé est connu : le budget '
          + 'n’a plus rien à en dire. Chaque colonne indique combien de mois viennent du '
          + 'journal.',
        ou: { texte: 'Trésorerie prév.', page: 'tresoprev' },
      },
    ],
  },
  {
    cle: 'lecture',
    titre: 'Lire les tableaux',
    intro: 'Les réglages d’affichage et ce qu’ils changent.',
    entrees: [
      {
        mot: 'Vue détaillée / simplifiée',
        court: 'Toutes les lignes, ou les totaux seuls.',
        detail: 'Le réglage vaut sur toutes les pages de chiffres et se retrouve au rechargement.',
      },
      {
        mot: 'Sous-totaux',
        court: 'Le sous-total de chaque groupe de catégories et de chaque jeu.',
        detail: 'Sur un tableau qui compte beaucoup de groupes, ils doublent le nombre de lignes. '
          + 'Les masquer ne laisse que le total du bloc.',
      },
      {
        mot: 'Groupe de catégories',
        court: 'Un intertitre qui rassemble plusieurs catégories.',
        detail: '« Workshops », « Ventes de jeux », « Personnel » : le groupe se règle catégorie par '
          + 'catégorie et sert partout — journal, synthèse, prévisionnel.',
        ou: { texte: 'Catégories', page: 'categories' },
      },
      {
        mot: 'Contrôles comptables',
        court: 'Les vérifications automatiques passées sur le journal.',
        detail: 'Cohérence HT + TVA = TTC, taux de TVA hors barème, dates hors de leur mois '
          + 'comptable, plans d’amortissement bouclés, pièces justificatives manquantes, '
          + 'montants nuls. Chaque ligne signalée est cliquable et mène à l’écriture en cause.',
        ou: { texte: 'Synthèse annuelle → bas de page', page: 'synthese' },
      },
      {
        mot: 'Instantané automatique',
        aussi: ['sauvegarde'],
        court: 'Une copie horodatée de tout, prise après chaque salve de modifications.',
        detail: 'Elle vit dans le navigateur, à côté du stockage principal. Les 30 derniers sont '
          + 'gardés, plus un par jour sur un mois. Une <b>sauvegarde téléchargée</b> reste la seule '
          + 'copie hors de cette machine.',
        ou: { texte: 'Paramètres', page: 'settings' },
      },
    ],
  },
];

const TOUS = CHAPITRES.flatMap(c => c.entrees.map(e => ({ ...e, chapitre: c })));

const sansAccent = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function correspond(e: Entree, q: string): boolean {
  if (!q) return true;
  const cible = sansAccent(
    [e.mot, e.court, e.detail, e.formule ?? '', ...(e.aussi ?? [])].join(' '));
  return sansAccent(q).split(/\s+/).filter(Boolean).every(mot => cible.includes(mot));
}

export function WikiPage({ onAllerA }: { onAllerA?: (page: Page) => void }) {
  const [recherche, setRecherche] = useState('');
  const [chapitre, setChapitre] = useEtatVue('wiki.chapitre', 'tous');

  const resultats = useMemo(() => {
    const base = recherche ? TOUS.filter(e => correspond(e, recherche))
      : chapitre === 'tous' ? TOUS
        : TOUS.filter(e => e.chapitre.cle === chapitre);
    return CHAPITRES
      .map(c => ({ c, entrees: base.filter(e => e.chapitre.cle === c.cle) }))
      .filter(x => x.entrees.length > 0);
  }, [recherche, chapitre]);

  const nb = resultats.reduce((s, x) => s + x.entrees.length, 0);

  return (
    <div className="p-4 w-full max-w-[1100px]">
      <PageHeader
        title="Wiki"
        subtitle="Tous les mots, toutes les notions, toutes les formules — avec l'endroit où ça se saisit"
        actions={
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: '#9a92b5' }} />
            <input
              className="border rounded-md pl-8 pr-8 py-1.5 text-sm w-72 bg-white"
              style={{ borderColor: 'var(--bbg-border)' }}
              placeholder="Chercher un mot, une notion…"
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
            />
            {recherche && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: '#9a92b5' }} title="Effacer"
                onClick={() => setRecherche('')}>
                <X size={14} />
              </button>
            )}
          </div>
        }
        tabs={
          <div className="flex flex-wrap gap-1.5">
            {[{ cle: 'tous', titre: 'Tout' }, ...CHAPITRES].map(c => {
              const actif = !recherche && chapitre === c.cle;
              return (
                <button
                  key={c.cle}
                  onClick={() => { setChapitre(c.cle); setRecherche(''); }}
                  className="px-3 py-1.5 text-sm rounded-full border transition-colors"
                  style={actif
                    ? { backgroundColor: 'var(--bbg-purple-dark)', borderColor: 'var(--bbg-purple-dark)', color: '#fff', fontWeight: 700 }
                    : { backgroundColor: '#fff', borderColor: 'var(--bbg-border)', color: '#5c5280' }}
                >
                  {c.titre}
                </button>
              );
            })}
          </div>
        }
      />

      {recherche && (
        <p className="text-sm mb-3" style={{ color: '#6f6690' }}>
          {nb} entrée{nb > 1 ? 's' : ''} pour « {recherche} »
          {nb === 0 && ' — essaie un autre mot, ou parcours les chapitres.'}
        </p>
      )}

      <div className="space-y-5">
        {resultats.map(({ c, entrees }) => (
          <Card key={c.cle} title={c.titre}>
            <p className="text-sm mb-3" style={{ color: '#6f6690' }}>{c.intro}</p>
            <div className="space-y-3">
              {entrees.map(e => (
                <div key={e.mot} className="rounded-lg border p-3"
                  style={{ borderColor: 'var(--bbg-border-soft)', backgroundColor: '#fdfcff' }}>
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <b style={{ color: 'var(--bbg-purple-darker)', fontSize: 15 }}>{e.mot}</b>
                    <span className="text-sm" style={{ color: '#5c5280' }}>{e.court}</span>
                  </div>
                  <p className="text-sm mt-1.5" style={{ color: '#3f3268', lineHeight: 1.55 }}
                    dangerouslySetInnerHTML={{ __html: e.detail }} />
                  {e.formule && (
                    <div className="mt-2 px-3 py-1.5 rounded-md text-sm inline-block"
                      style={{
                        backgroundColor: 'var(--bbg-lavender)',
                        color: 'var(--bbg-purple-darker)',
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                      }}>
                      {e.formule}
                    </div>
                  )}
                  {e.attention && (
                    <p className="text-xs mt-2 px-3 py-1.5 rounded-md"
                      style={{ backgroundColor: '#fdf3e7', color: 'var(--bbg-orange-dark)' }}
                      dangerouslySetInnerHTML={{ __html: `⚠ ${e.attention}` }} />
                  )}
                  {e.ou && (
                    <div className="text-xs mt-2" style={{ color: '#9a92b5' }}>
                      Où : {e.ou.page && onAllerA ? (
                        <button className="underline" style={{ color: 'var(--bbg-purple-dark)' }}
                          onClick={() => onAllerA(e.ou!.page!)}>
                          {e.ou.texte}
                        </button>
                      ) : e.ou.texte}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {nb === 0 && !recherche && (
        <Card title="Rien à afficher">
          <Btn onClick={() => setChapitre('tous')}>Revenir à tout le wiki</Btn>
        </Card>
      )}

      <p className="text-xs mt-4" style={{ color: '#9a92b5' }}>
        Ce wiki décrit ce que l'app calcule réellement — les formules sont celles du code.
        Il ne remplace pas ton expert-comptable pour les cas particuliers.
      </p>
    </div>
  );
}
