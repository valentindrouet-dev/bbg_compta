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
- **Synthèse annuelle** — charges par mois × catégorie, dépenses jeux, produits,
  dotations aux amortissements (équivalent des feuilles `export*`)
- **Immobilisations** — durées, dotations, VNC et fin d'amortissement calculées
- **Trésorerie** — encaissements/décaissements TTC, mouvements financiers
  (capital, CCA, placements, intérêts) inclus
- **TVA** — collectée / déductible / solde par mois, calculée écriture par écriture
- **Remboursements Val** — dépenses avancées sur carte personnelle

**Prévisionnel 2025-30**
- **Budgets annuels** — compte de résultat prévisionnel par exercice
  (CA, coûts de dev par jeu, charges externes avec imprévus 10 %, personnel,
  EBE / REX / RC / IS / RN et bloc TVA recalculés)
- **Réel vs Prévu** — le réalisé vient du journal, sans IMPORTRANGE
- **Trésorerie prévisionnelle vs réalisée** — par exercice
- **Chronologie** — frise 2025-30 des projets (dev, tirages, sorties, ventes)

**Outils**
- **Exports** — classeur Excel complet (`.xlsx`, importable dans Google Sheets),
  CSV du journal (format français), rapport PDF, sauvegarde JSON intégrale
- **Paramètres** — catégories, moyens de paiement, plan comptable,
  sauvegarde / restauration / réinitialisation

## Données

Les données des deux tableurs ont été importées le 26/08/2026 (418 écritures,
budgets 2025-26 → 2029-30, chronologie). Elles vivent dans le `localStorage` du
navigateur — penser à faire des **sauvegardes régulières** (Paramètres → Sauvegarde).

Lors de l'import, plusieurs anomalies des tableurs ont été détectées et corrigées
(totaux sur plages incomplètes, `#REF!`, valeur fantôme dans un récap…) :
voir [`RAPPORT_ANOMALIES.md`](./RAPPORT_ANOMALIES.md).

Les fonctions de calcul de coûts de production restent dans le
[Production Calculator](https://valentindrouet-dev.github.io/boardgame_prod_calculator/) —
les deux sites pourront être liés plus tard.

## Développement

```bash
npm install
npm run dev       # serveur de dev
npm run build     # tsc + vite build → docs/
```

Stack : React 18 + TypeScript + Vite + Tailwind CSS 4 + Zustand (persistance
localStorage) + Recharts (graphiques) + SheetJS / jsPDF (exports).

## Déploiement (GitHub Pages)

Le build est commité dans `docs/`. Pour publier :
**Settings → Pages → Deploy from a branch → choisir la branche, et surtout le
dossier `/docs`** (⚠️ pas `/ (root)` : la racine contient l'`index.html` source,
qui donnerait une page d'erreur). Le site est servi sur
`https://valentindrouet-dev.github.io/bbg_compta/` et se redéploie
automatiquement à chaque push sur la branche configurée.
