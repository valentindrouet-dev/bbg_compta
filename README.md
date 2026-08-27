# 🧾 BBG Compta

Site de comptabilité et de prévisionnel de **Big Budi Games** — le remplaçant des deux
tableurs Google Sheets (🧾 *2025-26 Journal Comptable* et 🎯 *2025-30 Budget prévisionnel*),
avec les mêmes onglets et la même organisation, mais des calculs justes par construction :
tous les totaux, la TVA, les amortissements, la trésorerie et les comparaisons réel/prévu
sont recalculés en direct à partir des écritures.

## Onglets

**Journal comptable**
- **Journal du mois** — saisie des dépenses, dépenses jeux et produits, mois par mois
  (TVA automatique par taux 20 / 10 / 5,5 / 0 % ou saisie manuelle, HT calculé,
  catégories, plan comptable, mots clés, factures, alerte si la date sort du mois)
- **Le mois en trois chiffres** — en haut du journal : dépenses (charges,
  immobilisations et jeux), recettes, solde ; TTC en gros, HT rappelé dessous
- **Synthèse totale** — la même lecture, mais **une colonne par exercice** au
  lieu d'une par mois : catégories, blocs, ventilation par jeu, compte de
  résultat et cumul sur les cinq ans. Le bouton **Prévisionnels** complète les
  exercices sans écriture avec ce qui est budgété, **en gris et en italique** :
  la trajectoire complète se lit d'un coup, sans jamais confondre le réalisé et
  le prévu
- **Synthèse annuelle** — les blocs dans l'ordre de lecture : **Produits, Charges,
  Personnel, Jeux** (un sous-bloc par jeu, toutes ses catégories listées),
  **Immobilisations**, puis le **compte de résultat** (EBE → REX → RC → IS → RN,
  barème PME), la **TVA**, un **récapitulatif** d'une page et des **contrôles
  comptables** automatiques. Chaque bloc porte son gros total en en-tête, et un
  bouton bascule entre vue **détaillée** et vue **simplifiée** (totaux seuls).
  Sous chaque total HT, le **même bloc en TTC** — pas le total général : c'est
  bien le pendant taxes comprises de la ligne du dessus. Le total de *toutes*
  les dépenses TTC, lui, est au récapitulatif, sous « Sorti du compte ».
  Le bouton **Prévisionnel** remplit les **mois pas encore atteints** avec ce qui
  est budgété — leur en-tête prend un `·p`, les montants s'affichent **en gris et
  en italique** — et les **ajoute aux calculs** : totaux, TTC, compte de résultat
  et résultat net tiennent alors compte de la fin d'exercice prévue. La date du
  jour, affichée sous « BBG Compta », décide de la frontière ; elle se remet à
  jour toute seule à minuit.
- **Immobilisations** — durées, dotations, VNC et fin d'amortissement calculées
- **Trésorerie** — chaque montant rattaché à sa source : **encaissements** et
  **décaissements du journal** (retrouvables ligne à ligne), **mouvements
  financiers** (capital, apport et remboursement de compte courant d'associé,
  placements, intérêts — qui ne sont dans aucun journal), et un **ajustement**
  saisi à la main quand un paiement tombe un autre mois. Une colonne **relevé
  bancaire** permet de pointer : l'écart s'affiche. Rembourser un compte courant sort de la trésorerie sans
  être une charge — c'est une dette qu'on éteint, elle ne touche pas le résultat
- **TVA** — collectée / déductible / solde par mois, calculée écriture par écriture ;
  rouge = dû à l'État, vert = crédit de TVA en ta faveur
- **Jeux** — bilan comptable par jeu, comparaison au prévisionnel, lien vers la
  fiche du jeu dans le Production Calculator
- **Fournisseurs** — totaux signés, nombre de transactions, historique
- **Factures** — tous les justificatifs déposés, groupés par mois comptable,
  en liste ou en vignettes, avec rattachement des pièces orphelines et
  téléchargement groupé (.zip)
- **Remboursements Val** — dépenses avancées sur carte personnelle

**Prévisionnel 2025-30**
- **Prévisionnel** — mêmes blocs, même ordre, mêmes catégories et mêmes couleurs
  que la synthèse annuelle, avec Prévu / Réel / Écart par ligne, un compte de
  résultat prévisionnel identique, les mêmes boutons **HT / TTC** et
  **détaillée / simplifiée**, et des alarmes quand une ligne ne correspond
  à rien dans la synthèse. En vue TTC, chaque ligne porte son **taux de TVA**,
  repris du journal par défaut et modifiable ; les montants restent stockés
  en HT, et un montant tapé en TTC est reconverti. Un **onglet par exercice**
  en tête de page, comme les mois du journal. Les exercices 2026-27 à 2029-30 ont la **grille
  complète, cases vides**, prête à remplir (bouton *Compléter la grille* pour
  rattraper une catégorie ajoutée depuis).
- **Lignes calculées (heures × taux)** — une ligne porte les **heures faites
  dans le mois**, la suivante encaisse **taux horaire × heures du mois
  précédent**. Le taux se règle **en HT ou en TTC** (l'autre suit), et le
  décalage d'encaissement se choisit (mois même, mois suivant, +2, +3). C'est
  ainsi que les *workshops* sont calculés : payés au début du mois suivant.
- **Vue 5 ans** — les cinq exercices côte à côte : prévu, réel, compte de
  résultat et trajectoire
- **Réel vs Prévu** — le réalisé vient du journal, sans IMPORTRANGE
- **Trésorerie prévisionnelle vs réalisée** — par exercice
- **Chronologie** — frise 2025-30 des projets, **modifiable à la souris** :
  glisse une barre pour décaler l'étape, attrape son bord pour l'allonger.
  Les bandes **s'aimantent** au 1er du mois ou au 1er / 16 (réglable, ou au jour
  près). **Clique** une barre pour la sélectionner, **Maj / Cmd** pour en
  ajouter : glisser l'une déplace tout le lot, et la barre du bas les renomme ou
  les supprime ensemble. **Double-clic** sur un libellé propose de renommer
  toutes les étapes qui portent le même nom. Chaque **projet** se renomme, se
  monte, se descend et se supprime depuis son bandeau ; `Nouveau projet` en
  crée un. La **couleur** d'un projet se choisit sur sa pastille et **suit son
  nom**, pas son rang ; quand le projet est un jeu du catalogue, c'est la
  couleur du jeu qui commande, et la repeindre ici l'écrit dans sa fiche.
  Le **zoom** (`−` / `+`, de 18 à 130 px par mois) agrandit la frise : même une
  étape de quelques jours devient assez large pour être attrapée, et le niveau
  choisi est retrouvé au retour sur la page. La fenêtre de la frise est **calée
  sur des années pleines** : déplacer ou renommer une bande ne fait plus bouger
  les autres d'un pixel. Un **trait rouge** marque le jour en cours

**Outils**
- **Exports** — les cinq exports d'un coup dans une archive `.zip`
  (Excel, PDF, CSV, HTML, JSON + un « Lisez-moi », et si tu veux un dossier
  `Factures/` rangé par mois), ou chacun séparément. **Tout ce qui est à
  l'écran est dans les exports** :
  - **Classeur Excel** (`.xlsx`, importable dans Google Sheets) — 17 feuilles :
    journal (colonne Jeu comprise), synthèse bloc par bloc en HT **et** en TTC,
    compte de résultat (EBE, REX, IS, résultat net), dépenses par jeu,
    immobilisations, trésorerie **avec les corrections manuelles et le relevé
    bancaire**, mouvements financiers (capital, CCA, placements), TVA,
    prévisionnel de chacun des cinq exercices (jeu, taux de TVA et formule
    en clair), chronologie dans son ordre et avec ses couleurs, référentiel
    des catégories (groupe, nature charge/immobilisation, durée), catalogue
    des jeux et vue d'ensemble sur cinq ans
  - **Rapport PDF** — compte de résultat, synthèse mensuelle, journal détaillé,
    immobilisations et dépenses par jeu, TVA, trésorerie, mouvements financiers
    et prévisionnel de l'exercice
  - **CSV du journal** (format français), **sauvegarde JSON intégrale**
    (elle emporte aussi les corrections de trésorerie et les couleurs des blocs)
  - **Copie HTML en lecture seule** à envoyer à l'expert-comptable — un seul
    fichier, rien de modifiable, aucune connexion : synthèse, résultat, TVA,
    journal, immobilisations, trésorerie, dépenses par jeu, chronologie
    et contrôles comptables
- **Paramètres** — catégories, moyens de paiement, plan comptable,
  sauvegarde / restauration / réinitialisation

## Gestes utiles

- **L'en-tête reste en haut** : le titre, les bascules HT/TTC et
  détaillée/simplifiée, et les **onglets** (mois du journal, exercices ailleurs)
  restent visibles quand on descend dans un long tableau.
- **Une couleur par jeu, choisie une fois** : dans l'onglet **Jeux**, la
  pastille de chaque jeu ouvre la palette pastel (ou un sélecteur libre). Cette
  couleur est reprise **partout** : bandeaux de la synthèse annuelle et de la
  synthèse totale, du prévisionnel, pastille de la colonne « Jeu » du journal,
  barres et bandeaux de la chronologie. Elle suit le jeu quand on le renomme,
  et « auto » revient à la teinte déduite de son nom — **jamais la même que
  celle d'un autre jeu** : deux jeux dont les noms tombaient sur la même
  teinte sont départagés automatiquement.
- **Rien ne se remet en place tout seul** : le tri d'un tableau (colonne et
  sens) est retrouvé en revenant sur la page, comme les onglets et les bascules.
- **Un poste de jeu se budgète jeu par jeu** : dans le prévisionnel, taper une
  catégorie du bloc Jeux fait apparaître un bouton `🎮 × 3` qui crée **une ligne
  par jeu**, chacune sous son bandeau. Sur une ligne existante, un petit
  sélecteur jaune dit à quel jeu elle se rattache — il devient rouge quand elle
  n'en a pas. Changer la **nature** de la catégorie (onglet Catégories) déplace
  aussitôt ses lignes entre charges et immobilisations.
- **Un onglet par exercice** partout où plusieurs exercices se lisent : synthèse
  annuelle, TVA, réel vs prévu, exports, tableau de bord — avec le nombre
  d'écritures en pastille.

- **On revient là où on était** : le mois ouvert dans le journal, l'exercice du
  prévisionnel, les bascules HT/TTC et détaillée/simplifiée, et même la page
  affichée sont retrouvés quand on revient — y compris après avoir fermé
  l'onglet. C'est enregistré à part des données comptables : ni **Cmd+Z** ni une
  restauration de sauvegarde n'y touchent.

- **Glisser-déposer une facture** : lâche un PDF ou une photo **sur une ligne du
  journal** pour l'y attacher ; lâche-en plusieurs sur la **zone en bas d'un
  tableau** pour créer une ligne par fichier (le nom du fichier sert de libellé,
  et le fournisseur est reconnu s'il est déjà connu).
- **Réorganiser les lignes** : dans la synthèse annuelle **et le prévisionnel**,
  attrape une ligne par
  sa **poignée** (à gauche du nom, elle apparaît au survol) et remonte-la ou
  descends-la. Un trait montre où elle va tomber. Ça marche aussi sur les
  **bandeaux de groupe** et sur les **bandeaux de jeu** — tout le bloc suit.
  Une catégorie lâchée sous un autre bandeau **change de groupe**. Le nouvel
  ordre vaut partout : prévisionnel, listes déroulantes du journal, exports.
  Un seul **Cmd+Z** annule un déplacement. Dans le prévisionnel, la corbeille
  supprime une ligne et le champ « Ajouter une ligne… » en crée une.
- **Remboursements et notes de frais** : ils ne créent pas de chiffre
  d'affaires, ils rendent une dépense déjà passée. Ils sont donc rangés dans les
  **charges, en négatif** — ils viennent en réduction des charges du mois, et
  leur TVA en moins de la TVA déductible. Le résultat est identique, le CA
  redevient juste.
- **Nature d'une catégorie** : dans l'onglet **Catégories**, la colonne
  **Nature** décide si une catégorie part **tout en charges**, **tout à l'actif**
  (avec sa durée d'amortissement), ou **au cas par cas** — auquel cas c'est la
  colonne « Type » du journal qui tranche, ligne par ligne. C'est ce réglage qui
  pilote le bloc où le poste apparaît, partout dans l'app.
- **Ligne en pourcentage** : l'icône `%` au survol d'une ligne du prévisionnel la
  fait se calculer sur **tout ce qui la précède dans son bloc** — c'est ainsi que
  marche « Imprévus (10 %) », et le taux se change dans la ligne.
- **Coût d'une rémunération** : sur une ligne du bloc Personnel, l'icône
  calculatrice ouvre le calcul TNS. On saisit ce qu'on veut toucher par mois, on
  lit les cotisations poste par poste et le total à budgéter, et un bouton étale
  le montant sur tous les mois.
- **Postes de jeu** : il n'y a plus de bloc « Dépenses Jeux ». Le
  **développement graphique** et les **illustrations** sont des coûts de
  développement portés à l'actif (amortis sur 5 ans) : ils sont dans les
  **Immobilisations**, sous un bandeau par jeu. Le **prototypage**, la
  **communication jeux** et les **avances droit d'auteur** sont des charges de
  l'exercice : ils sont dans les **Charges**, également sous un bandeau par jeu,
  à la suite des postes généraux. La synthèse et le prévisionnel suivent la
  même organisation ; l'onglet **Jeux** garde la vue complète par jeu.
- **Immobiliser un poste de jeu** : dans le bloc Jeux de la synthèse, le lien
  **immobiliser** au survol d'une ligne porte tout le poste à l'actif sur
  l'exercice (amorti sur 5 ans) ; **repasser en charges** fait l'inverse.
  Un développement porté à l'actif quitte le total des charges jeux et
  n'entre dans le résultat que par sa dotation.
- **Recolorer un bloc** : la palette dans l'en-tête d'un bloc. Une teinte majeure
  suffit — en-tête, bandes de groupe, lignes alternées blanc / très clair et ligne
  de total s'en déduisent, et la même teinte s'applique au journal, à la synthèse
  et au prévisionnel.
- **Redimensionner une colonne** : attrape le **bord droit de son en-tête** et
  tire. La largeur est enregistrée et retrouvée à la prochaine ouverture ;
  un **double-clic** au même endroit rend au tableau ses largeurs automatiques
  (Paramètres → Affichage des tableaux pour tout réinitialiser).
- **Aller à une ligne signalée** : dans les *contrôles comptables* de la synthèse,
  clique une écriture listée — le journal s'ouvre sur son mois (ou la page
  Immobilisations), déroule jusqu'à elle et la fait clignoter.
- **Sélectionner plusieurs cellules** : dans le prévisionnel, clique-glisse sur
  les cases pour en sélectionner un rectangle, puis **Suppr** pour toutes les
  vider (une seule étape d'annulation). **Échap** annule la sélection.
- **Mise en forme d'une colonne** : la palette qui apparaît au survol de
  l'en-tête (gras, italique, alignement, couleur).
- **Déplacer une étape de la chronologie** : glisse sa barre sur la frise (la
  durée ne bouge pas), ou attrape son **bord gauche / droit** pour changer la
  date de début ou de fin. Les dates s'affichent en bas pendant le glissé, et
  un seul **Cmd+Z** défait le déplacement.
- **Cmd+Z / Ctrl+Z** annule, **Cmd+Maj+Z / Ctrl+Y** rétablit.

## Données

Les données des deux tableurs ont été importées le 26/08/2026 (418 écritures,
budgets 2025-26 → 2029-30, chronologie). Elles vivent dans le `localStorage` du
navigateur — penser à faire des **sauvegardes régulières** (Paramètres → Sauvegarde).

Lors de l'import, plusieurs anomalies des tableurs ont été détectées et corrigées
(totaux sur plages incomplètes, `#REF!`, valeur fantôme dans un récap…) :
voir [`RAPPORT_ANOMALIES.md`](./RAPPORT_ANOMALIES.md).

Les fonctions de calcul de coûts de production restent dans le
[Production Calculator](https://valentindrouet-dev.github.io/boardgame_prod_calculator/).
Chaque jeu de l'onglet **Jeux** peut porter un lien direct vers sa fiche là-bas ;
un partage de données entre les deux sites reste à faire.

## Développement

```bash
npm install
npm run dev       # serveur de dev
npm run build     # tsc + vite build → docs/
```

Stack : React 18 + TypeScript + Vite + Tailwind CSS 4 + Zustand (persistance
localStorage) + Recharts (graphiques) + SheetJS / jsPDF (exports). Les
justificatifs sont stockés dans IndexedDB et l'archive `.zip` est écrite
sans dépendance (`src/utils/zip.ts`, compression `deflate-raw` native).

## Déploiement (GitHub Pages)

Le build est commité dans `docs/`. Pour publier :
**Settings → Pages → Deploy from a branch → choisir la branche, et surtout le
dossier `/docs`** (⚠️ pas `/ (root)` : la racine contient l'`index.html` source,
qui donnerait une page d'erreur). Le site est servi sur
`https://valentindrouet-dev.github.io/bbg_compta/` et se redéploie
automatiquement à chaque push sur la branche configurée.
