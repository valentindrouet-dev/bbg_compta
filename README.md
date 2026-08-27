# 🧾 BBG Compta

Site de comptabilité et de prévisionnel de **Big Budi Games** — le remplaçant des deux
tableurs Google Sheets (🧾 *2025-26 Journal Comptable* et 🎯 *2025-30 Budget prévisionnel*),
avec les mêmes onglets et la même organisation, mais des calculs justes par construction :
tous les totaux, la TVA, les amortissements, la trésorerie et les comparaisons réel/prévu
sont recalculés en direct à partir des écritures.

## Onglets

**Journal comptable**
- **Journal du mois** — **quatre tableaux** : **Charges**, **Immobilisations**
  (portées à l'actif et amorties), **Dépenses Jeux** et **Produits**. Les charges
  et les immobilisations ne pèsent pas de la même façon — l'une sort du résultat
  en une fois, l'autre ne le touche que par sa dotation — les voir mélangées,
  c'est se tromper de bloc. Une ligne créée dans le tableau des immobilisations
  en est une d'office. Saisie mois par mois
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
- **Immobilisations** — **en lecture seule** : c'est un compte rendu de ce qui est
  saisi au Journal du mois, qui fait foi. Durées, dotations, VNC et fin
  d'amortissement calculées ; un clic sur une ligne l'ouvre dans son mois, là où
  elle se corrige. Corriger un montant à deux endroits, c'est se donner deux
  chances de se tromper
- **Stocks** — les **exemplaires**, pas les euros : un tirage entre, une vente
  sort, une casse aussi, un inventaire corrige. Chaque vente porte son **canal**
  (distributeur, boutique, éditeur). La position de chaque jeu s'en déduit —
  entrés, sortis, stock, **valeur au coût moyen pondéré**, ventes, coût des
  ventes et marge — avec un tableau **Ventes par canal** qui compare le prix
  moyen constaté à celui budgété, et la comparaison au stock prévu. La valeur du
  stock figure **à l'actif** : elle ne pèse au résultat qu'une fois les
  exemplaires vendus
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
- **Prévisionnel** — la page se lit maintenant en **cinq onglets**, au-dessus des
  onglets d'exercice :
  - **Charges** — charges externes, personnel et rémunérations
  - **Produits** — les workshops d'un côté, les **ventes de jeux** de l'autre,
    **une ligne par jeu et par canal**. Ces dernières ne se saisissent pas :
    elles sont le produit des exemplaires vendus par le prix de leur canal, dans
    l'onglet Stock
  - **Immobilisations** — ce qui s'inscrit à l'actif et s'amortit. Chaque ligne
    porte sa **durée d'amortissement** (3, 5, 10 ans ou libre) : c'est elle qui
    étale la dotation, et un ordinateur ne s'amortit pas comme des travaux. Ces
    montants **ne passent pas au compte de résultat** — seules leurs dotations
    le font ; ils sortent en revanche de la trésorerie en totalité, le mois où
    ils sont engagés
  - **Stock** — jeu par jeu, et une seule ligne pilote tout :
    1. **Fabriqués** — ce qui sort d'usine, mois par mois
    2. **% de ventes** — quelle part du tirage part ce mois-là
    3. une ligne par canal — **Distributeur**, **Boutique**, **Éditeur** — chacun
       avec sa **part du tirage** (60 / 10 / 30 par exemple) et **son prix**

    10 % de ventes sur un tirage de 3 000 exemplaires donnent 300 boîtes, que les
    parts répartissent d'elles-mêmes : 180 chez le distributeur, 30 en boutique,
    90 chez l'éditeur — chacune à son prix. Un avertissement s'affiche si les
    parts ne totalisent pas 100 %. Un canal peut sortir de ce pilotage : **`#`**
    pour taper des exemplaires, **`%`** pour un pourcentage qui lui est propre,
    calculé sur le tirage ou sur le stock disponible. Les trois canaux se
    renomment et d'autres s'ajoutent. Tout le reste suit : stock restant, coût
    des tirages, ventes par canal et au total, **coût des exemplaires vendus**, **variation de
    stock** et **marge**. Le tirage payé à l'usine est une charge du mois où il
    est réglé ; la variation de stock la neutralise pour les exemplaires encore
    en carton, si bien que **seul le coût de ce qui est vendu pèse sur le
    résultat**. Un badge prévient si le stock passe sous zéro. Le coût de revient
    unitaire se recopie depuis le Production Calculator — c'est lui qui tient les
    devis usine. Un jeu qui a du stock **continue d'un exercice à l'autre** :
    en ouvrant l'onglet de l'année suivante, sa ligne est reprise avec son coût
    de revient et ses canaux, et le stock de clôture devient l'ouverture
  - **Total** — tout le prévisionnel de l'exercice d'un seul tenant et
    **non modifiable** : chaque bloc, le stock, puis le compte de résultat.
    Même mise en forme **et même palette** que les onglets de saisie : le tableau
    des produits y est vert comme dans Produits, celui des charges orange comme
    dans Charges — les postes généraux d'abord, puis un **bandeau par jeu** avec
    ses lignes et ses ventes
- Dans les onglets de saisie : mêmes blocs, même ordre, mêmes catégories et mêmes couleurs
  que la synthèse annuelle, avec Prévu / Réel / Écart par ligne, les mêmes boutons **HT / TTC** et
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
  résultat et trajectoire. Le prévu y compte le stock, comme l'onglet Total :
  les deux pages lisent le même calcul
- **Réel vs Prévu** — le réalisé vient du journal, sans IMPORTRANGE
- **Trésorerie prévisionnelle vs réalisée** — par exercice, et **le réel prime**.
  Sur l'exercice en cours, les mois déjà passés viennent du journal — ce qui est
  encaissé et payé est connu, le budget n'a plus rien à en dire — et seuls les
  mois à venir sont budgétés ; l'en-tête de chaque colonne dit lesquels
  (« 13/14 mois réels », « prévu », « réalisé »). Le prévisionnel n'est
  plus recopié à la main : chaque ligne à venir est la somme d'un bloc du prévisionnel,
  **convertie en TTC ligne à ligne** (chacune garde son taux ; cotisations et
  rémunérations n'en portent pas). Les **ventes de jeux** et les **tirages
  d'usine** viennent de l'onglet Stock. Capital, compte courant d'associé et
  placements restent des mouvements financiers. La saisie d'origine du tableur
  est conservée en dessous, repliée, pour mémoire
- **Chronologie** — frise 2025-30 des projets. Elle s'ouvre **verrouillée** :
  on la lit, on la zoome, mais rien n'y bouge — ni glissement, ni renommage, ni
  suppression, ni emoji. Un clic sur `🔒 Verrouillée` la rend modifiable, et le
  réglage est retrouvé au retour sur la page. Déverrouillée, elle est
  **modifiable à la souris** :
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
  les autres d'un pixel. Un **trait rouge** marque le jour en cours.
  Un **emoji** se pose sur n'importe quelle étape (🏭 tirage, 🚀 sortie,
  🎪 salon…) : il s'affiche sur la bande et dans le libellé, pour repérer d'un
  coup d'œil ce qui compte. La frise a son **propre cadre de défilement** :
  l'en-tête des mois et des années **reste en haut** pendant qu'on descend dans
  les projets. Au-dessus des mois, une bande donne les **bornes des exercices
  comptables** (1er octobre → 30 septembre), avec un trait à chaque ouverture :
  on voit tout de suite dans quel exercice tombe une étape ou un paiement

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
    des jeux, **stock prévu**, **stock réel** et ses mouvements, et vue
    d'ensemble sur cinq ans (20 feuilles)
  - **Rapport PDF** — compte de résultat, synthèse mensuelle, journal détaillé,
    immobilisations et dépenses par jeu, TVA, trésorerie, mouvements financiers,
    stocks et prévisionnel de l'exercice
  - **CSV du journal** (format français), **sauvegarde JSON intégrale**
    (elle emporte aussi les corrections de trésorerie, les couleurs des blocs
    et tout le stock)
  - **Copie HTML en lecture seule** à envoyer à l'expert-comptable — un seul
    fichier, rien de modifiable, aucune connexion. Elle a **la tête de l'app** :
    même barre latérale violette, mêmes cartes de chiffres, mêmes couleurs de
    blocs, en-têtes de colonnes figés et **colonnes Catégorie et Total gelées**
    quand on balaie les mois. Neuf sections : synthèse, résultat & TVA, journal,
    immobilisations, stocks, trésorerie, jeux, chronologie et contrôles
    comptables. Elle s'imprime en PDF d'un `Cmd + P`
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
navigateur.

### Ce qui protège une saisie

Une modification qu'on croit enregistrée et qui ne l'est pas est le pire des
défauts : on ne s'en aperçoit qu'au rechargement. Quatre garde-fous :

- **Un témoin permanent** en bas de la barre latérale : « Enregistré à 16:43 ».
  S'il passe au rouge, c'est que le navigateur refuse d'écrire, et un bandeau
  l'explique en haut de l'écran.
- **Des instantanés automatiques** dans IndexedDB, à côté du stockage principal :
  l'état complet est recopié quelques secondes après chaque salve de
  modifications, et aussi quand on quitte l'onglet. Les **30 derniers** sont
  gardés, plus **un par jour sur un mois**. On y revient d'un clic dans
  Paramètres → *Instantanés automatiques*, et le retour est lui-même annulable
  puisque l'état courant est mis de côté avant.
- **Un garde contre les doubles onglets** : si BBG Compta est ouvert deux fois,
  seul l'onglet qui a écrit en dernier continue d'enregistrer ; l'autre s'arrête
  et affiche un bandeau, au lieu d'écraser silencieusement le travail du premier.
- **Cmd+Z n'annule jamais pendant qu'on écrit dans un champ** : là, il défait la
  frappe, pas une modification de données. Sans cette garde, corriger une faute
  de frappe annulait un renommage ou un déplacement — et en insistant, tout un
  après-midi de réglages.

Une **sauvegarde téléchargée** (Paramètres → Sauvegarde) reste la seule copie
hors de cette machine : c'est elle qu'il faut faire régulièrement.

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
