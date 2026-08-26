# Rapport d'anomalies détectées dans les tableurs

_Généré lors de l'import du 26/08/2026 — 418 écritures importées._

## Dates hors mois comptable (2)

- 2025-12 L23 Apple « iCloud + » : date 2026-12-31 hors du mois comptable 2025-12
- 2026-02 L20 AirBNB « Logement Cannes 2/2 » : date 2025-02-09 hors du mois comptable 2026-02

## Incohérences HT + TVA ≠ TTC (1)

- 2026-01 L18 Amazon « Papeterie » : HT 7.61 + TVA 0.0 = 7.61 ≠ TTC 7.69

## Immobilisations (1)

- Durée manquante pour immo « Direction Artistique Février » (2026-04-09) : 5 ans par défaut

## Écarts entre totaux recalculés et totaux affichés (6)

- fev 26 : TTC charges recalculé 3512.76 ≠ colonne « Total TTC » de l'export 3335.18 (écart -177.58 — la formule du tableur somme une plage incomplète)
- juin 26 : total charges HT recalculé 1475.17 ≠ export 1501.42 (écart +26.25)
- aout 26 : TTC charges recalculé 1075.09 ≠ colonne « Total TTC » de l'export 1275.91 (écart +200.82 — la formule du tableur somme une plage incomplète)
- juin 26 (récap par catégorie) : Déplacements: feuille 697.58 vs recalc 671.33
- Total produits global : la feuille export_produit n'additionne pas la colonne « remboursement » (2672.20 € HT absents du Total HT global du tableur)
- Immobilisations TTC recalculé 17067.10 ≠ Immo & Dot 16227.10

## Chronologie (1)

- Dates L14 « EDIT - Tirage 1 / Sortie » : date de fin invalide « 30/02/27 »

