/**
 * Version partageable, en lecture seule, à destination de l'expert-comptable.
 *
 * Le résultat est **un seul fichier HTML autonome** : les données sont dedans,
 * il n'y a rien à installer, rien à connecter, et rien n'est modifiable. On
 * l'ouvre d'un double-clic, on le met sur un Drive pour lui donner une adresse
 * partageable, on l'imprime en PDF. Aucune donnée ne part sur un serveur.
 */
import type { AppState } from '../store';
import type { JournalEntry } from '../types';
import { BLOCS, teinteBloc, type BlocCle } from './blocs';
import {
  bilanJeux, compteResultat, dotationsParMois, immoInfos, moisTresorerie,
  produitsFinanciersParMois, syntheseExercice, tableauTreso,
} from './calc';
import { controlesComptables } from './controles';
import { compareMois, formatDateFR, labelMois, moisCourant } from './dates';
import { euros, r2 } from './money';
import { couleurJeu, encreSur } from './jeux';
import { positionsStock, stocksExercice } from './stock';

const ech = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const num = (v: number) => v ? `<td class="n">${ech(euros(r2(v)))}</td>` : '<td class="n vide">·</td>';

interface Bloc {
  cle: BlocCle;
  titre: string;
  lignes: { label: string; parMois: Map<string, number>; sousLigne?: boolean }[];
  totaux: Map<string, number>;
}

/** Le HTML complet, prêt à être enregistré. */
export function pageLectureSeule(state: AppState, exercice: string): string {
  const { entries, referentiels: refs, finances, tresoManuel, chronologie } = state;
  const syn = syntheseExercice(entries, exercice, refs, 'ht');
  const immos = immoInfos(entries, refs);
  const mois = syn.moisList;
  const dotations = dotationsParMois(immos, mois);
  const resultat = compteResultat({
    moisList: mois,
    produits: syn.totalProduitsParMois,
    charges: syn.totalChargesParMois,
    personnel: syn.totalPersonnelParMois,
    jeux: new Map<string, number>(),   // déjà comprises dans les charges
    dotations,
    produitsFinanciers: produitsFinanciersParMois(finances, mois),
    chargesFinancieres: syn.chargesFinancieresParMois,
  });
  const controles = controlesComptables(entries, exercice, refs);

  const somme = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0));
  const lignesDe = (data: Map<string, Map<string, number>>, ordre: string[]) =>
    ordre.filter(c => data.has(c)).concat([...data.keys()].filter(c => !ordre.includes(c)))
      .map(label => ({ label, parMois: data.get(label)! }));

  const blocs: Bloc[] = [
    { cle: 'produits', titre: 'Produits', lignes: lignesDe(syn.produits, refs.categoriesProduits), totaux: syn.totalProduitsParMois },
    { cle: 'charges', titre: 'Charges', lignes: lignesDe(syn.charges, refs.categoriesDepenses), totaux: syn.totalChargesParMois },
    { cle: 'personnel', titre: 'Personnel & rémunérations', lignes: lignesDe(syn.personnel, refs.categoriesDepenses), totaux: syn.totalPersonnelParMois },
    { cle: 'immos', titre: 'Immobilisations — investissements', lignes: lignesDe(syn.immos, []), totaux: syn.immoParMois },
  ];

  const teintes = Object.fromEntries(BLOCS.map(b =>
    [b.cle, teinteBloc(b.cle, state.blocCouleurs)]));

  const enteteMois = mois.map(m => `<th class="n">${ech(labelMois(m))}</th>`).join('');

  const tableauBloc = (b: Bloc) => {
    const t = teintes[b.cle];
    const lignes = b.lignes.map(l => `<tr>
      <td>${ech(l.label)}</td>
      ${mois.map(m => num(l.parMois.get(m) ?? 0)).join('')}
      <td class="n fort">${ech(euros(somme(l.parMois)))}</td>
    </tr>`).join('');
    return `<section class="bloc" style="--c:${t.base};--cl:${t.clair};--ctc:${t.tresClair};--ct:${t.total};--cf:${t.fonce};--cb:${t.bord}">
      <h3>${ech(b.titre)} <span class="total">${ech(euros(somme(b.totaux)))}</span></h3>
      <div class="defile"><table class="fige">
        <thead><tr><th class="lib">Catégorie</th>${enteteMois}<th class="n">Total</th></tr></thead>
        <tbody>${lignes || `<tr><td colspan="${mois.length + 2}" class="vide">Aucune écriture</td></tr>`}</tbody>
        <tfoot><tr>
          <td>TOTAL ${ech(b.titre.toUpperCase())}</td>
          ${mois.map(m => num(b.totaux.get(m) ?? 0)).join('')}
          <td class="n grand">${ech(euros(somme(b.totaux)))}</td>
        </tr></tfoot>
      </table></div>
    </section>`;
  };

  const tResultat = teintes.resultat;
  const tableauResultat = `<section class="bloc" style="--c:${tResultat.base};--cl:${tResultat.clair};--ctc:${tResultat.tresClair};--ct:${tResultat.total};--cf:${tResultat.fonce};--cb:${tResultat.bord}">
    <h3>Compte de résultat <span class="total">${ech(euros(resultat.find(l => l.cle === 'rn')!.total))}</span></h3>
    <div class="defile"><table class="fige">
      <thead><tr><th class="lib">Solde intermédiaire de gestion</th>${enteteMois}<th class="n">Exercice</th></tr></thead>
      <tbody>${resultat.filter(l => l.cle !== 'rn').map(l => `<tr class="${l.niveau === 'agregat' ? 'agregat' : ''}">
        <td>${ech(l.label)}</td>
        ${mois.map(m => l.parMois ? num(l.parMois.get(m) ?? 0) : '<td class="n vide">—</td>').join('')}
        <td class="n fort">${ech(euros(l.total))}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr>
        <td>RÉSULTAT NET DE L'EXERCICE</td>
        ${mois.map(() => '<td></td>').join('')}
        <td class="n grand">${ech(euros(resultat.find(l => l.cle === 'rn')!.total))}</td>
      </tr></tfoot>
    </table></div>
    <p class="note">EBE = produits − charges d'exploitation (hors frais financiers, hors dotations) ·
      REX = EBE − dotations · RC = REX + produits financiers − charges financières ·
      RN = RC − impôt sur les sociétés (barème PME : 15 % jusqu'à 42 500 €, 25 % au-delà).
      Les immobilisations n'entrent pas en charges : seules leurs dotations comptent.
      La TVA ne transite pas par le résultat.</p>
  </section>`;

  const tTVA = teintes.tva;
  const soldeTVA = r2(somme(syn.tvaCollecteeParMois) - somme(syn.tvaDeductibleParMois));
  const tableauTVA = `<section class="bloc" style="--c:${tTVA.base};--cl:${tTVA.clair};--ctc:${tTVA.tresClair};--ct:${tTVA.total};--cf:${tTVA.fonce};--cb:${tTVA.bord}">
    <h3>TVA <span class="total">${ech(euros(Math.abs(soldeTVA)))} ${soldeTVA > 0 ? 'à reverser' : 'de crédit'}</span></h3>
    <div class="defile"><table class="fige">
      <thead><tr><th class="lib">TVA</th>${enteteMois}<th class="n">Exercice</th></tr></thead>
      <tbody>
        <tr><td>Dépenses HT soumises à TVA</td>${mois.map(m => num(syn.baseTVADepensesParMois.get(m) ?? 0)).join('')}<td class="n fort">${ech(euros(somme(syn.baseTVADepensesParMois)))}</td></tr>
        <tr><td>TVA déductible</td>${mois.map(m => num(syn.tvaDeductibleParMois.get(m) ?? 0)).join('')}<td class="n fort">${ech(euros(somme(syn.tvaDeductibleParMois)))}</td></tr>
        <tr><td>Produits HT soumis à TVA</td>${mois.map(m => num(syn.baseTVAProduitsParMois.get(m) ?? 0)).join('')}<td class="n fort">${ech(euros(somme(syn.baseTVAProduitsParMois)))}</td></tr>
        <tr><td>TVA collectée</td>${mois.map(m => num(syn.tvaCollecteeParMois.get(m) ?? 0)).join('')}<td class="n fort">${ech(euros(somme(syn.tvaCollecteeParMois)))}</td></tr>
      </tbody>
      <tfoot><tr>
        <td>${soldeTVA > 0 ? 'TVA À REVERSER' : 'CRÉDIT DE TVA'}</td>
        ${mois.map(m => num(r2((syn.tvaCollecteeParMois.get(m) ?? 0) - (syn.tvaDeductibleParMois.get(m) ?? 0)))).join('')}
        <td class="n grand">${ech(euros(soldeTVA))}</td>
      </tr></tfoot>
    </table></div>
  </section>`;

  // ----- Journal détaillé -----
  const moisSet = new Set(mois);
  const duJournal = entries.filter(e => moisSet.has(e.mois))
    .sort((a, b) => compareMois(a.mois, b.mois) || a.date.localeCompare(b.date));
  const ligneJournal = (e: JournalEntry) => `<tr>
    <td>${ech(labelMois(e.mois))}</td><td>${ech(formatDateFR(e.date))}</td>
    <td>${ech(e.fournisseur)}</td><td>${ech(e.description)}</td><td>${ech(e.categorie)}</td>
    <td>${e.jeu ? `<span class="pastille" style="background:${ech(couleurJeu(e.jeu, refs))};color:${ech(encreSur(couleurJeu(e.jeu, refs)))}">${ech(e.jeu)}</span>` : ''}</td>
    <td class="n">${ech(euros(e.ttc))}</td><td class="n">${ech(euros(e.tva))}</td>
    <td class="n fort">${ech(euros(e.ht))}</td>
    <td>${ech(e.type)}</td><td>${ech(e.compta ?? '')}</td><td>${ech(e.facture ?? '')}</td>
  </tr>`;
  const journal = `<section class="bloc simple">
    <h3>Journal détaillé <span class="total">${duJournal.length} écritures</span></h3>
    <div class="defile"><table class="journal">
      <thead><tr>
        <th>Mois</th><th>Date</th><th>Fournisseur</th><th>Description</th><th>Catégorie</th>
        <th>Jeu</th><th class="n">TTC</th><th class="n">TVA</th><th class="n">HT</th>
        <th>Type</th><th>Compte</th><th>Pièce</th>
      </tr></thead>
      <tbody>${duJournal.map(ligneJournal).join('')}</tbody>
    </table></div>
  </section>`;

  // ----- Immobilisations -----
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const tableauImmos = `<section class="bloc simple">
    <h3>Immobilisations <span class="total">${ech(euros(r2(immos.reduce((s, i) => s + i.entry.ht, 0))))}</span></h3>
    <div class="defile"><table class="journal">
      <thead><tr>
        <th>Date</th><th>Fournisseur</th><th>Description</th><th>Catégorie</th>
        <th class="n">HT</th><th class="n">Durée</th><th class="n">Dotation /an</th>
        <th class="n">Dotation /mois</th><th class="n">VNC</th><th>Fin</th>
      </tr></thead>
      <tbody>${immos.map(i => `<tr>
        <td>${ech(formatDateFR(i.entry.date))}</td><td>${ech(i.entry.fournisseur)}</td>
        <td>${ech(i.entry.description)}</td><td>${ech(i.entry.categorie)}</td>
        <td class="n fort">${ech(euros(i.entry.ht))}</td><td class="n">${i.duree} ans</td>
        <td class="n">${ech(euros(i.dotationAn))}</td><td class="n">${ech(euros(i.dotationMois))}</td>
        <td class="n">${ech(euros(i.vnc(aujourdhui)))}</td><td>${ech(formatDateFR(i.fin))}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="note">Amortissement linéaire, prorata temporis à partir de la date d'acquisition.
      VNC au ${ech(formatDateFR(aujourdhui))}.</p>
  </section>`;

  // ----- Trésorerie et mouvements financiers -----
  const lignesTreso = tableauTreso(
    entries, finances, moisTresorerie(entries, finances, moisCourant()), tresoManuel ?? {});
  const tableauTresorerie = `<section class="bloc simple">
    <h3>Trésorerie <span class="total">${ech(euros(lignesTreso.length ? lignesTreso[lignesTreso.length - 1].soldeCumule : 0))}</span></h3>
    <div class="defile"><table class="journal">
      <thead><tr>
        <th>Mois</th><th class="n">Solde initial</th><th class="n">Encaissements</th>
        <th class="n">Décaissements</th><th class="n">Financier</th><th class="n">Correction</th>
        <th class="n">Solde mensuel</th><th class="n">Solde cumulé</th>
        <th class="n">Relevé banque</th><th class="n">Écart</th><th>Note</th>
      </tr></thead>
      <tbody>${lignesTreso.map(t => `<tr>
        <td>${ech(labelMois(t.mois))}</td>
        <td class="n">${ech(euros(t.soldeInitial))}</td>
        <td class="n">${ech(euros(t.encJournal))}</td>
        <td class="n">${ech(euros(-t.decJournal))}</td>
        <td class="n">${t.financier ? ech(euros(t.financier)) : '·'}</td>
        <td class="n">${t.ajustement ? ech(euros(t.ajustement)) : '·'}</td>
        <td class="n">${ech(euros(t.soldeMensuel))}</td>
        <td class="n fort">${ech(euros(t.soldeCumule))}</td>
        <td class="n">${t.soldeReel == null ? '·' : ech(euros(t.soldeReel))}</td>
        <td class="n ${t.ecart && Math.abs(t.ecart) > 0.5 ? 'neg' : ''}">${t.ecart == null ? '·' : ech(euros(t.ecart))}</td>
        <td>${ech(tresoManuel?.[t.mois]?.note ?? '')}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="note">Le calcul suppose chaque écriture encaissée ou payée dans son mois comptable.
      La colonne « Correction » rattrape les décalages réels ; « Relevé banque » est le solde constaté,
      en regard, et n'entre pas dans le calcul.</p>
  </section>`;

  const tableauFinances = finances.length ? `<section class="bloc simple">
    <h3>Mouvements financiers <span class="total">${ech(euros(r2(finances.reduce((t, f) => t + f.montant, 0))))}</span></h3>
    <div class="defile"><table class="journal">
      <thead><tr><th>Date</th><th>Libellé</th><th>Type</th><th class="n">Montant</th></tr></thead>
      <tbody>${[...finances].sort((a, b) => a.date.localeCompare(b.date)).map(f => `<tr>
        <td>${ech(formatDateFR(f.date))}</td><td>${ech(f.label)}</td><td>${ech(f.type)}</td>
        <td class="n fort ${f.montant < 0 ? 'neg' : ''}">${ech(euros(r2(f.montant)))}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="note">Capital, compte courant d'associé et placements ne sont ni des produits ni des charges :
      ils ne touchent que la trésorerie et le bilan.</p>
  </section>` : '';

  // ----- Dépenses par jeu et chronologie -----
  const parJeu = bilanJeux(entries, refs.categoriesJeux);
  const tableauParJeu = parJeu.length ? `<section class="bloc simple">
    <h3>Dépenses par jeu <span class="total">${ech(euros(r2(parJeu.reduce((t, b) => t + b.ht, 0))))}</span></h3>
    <div class="defile"><table class="journal">
      <thead><tr>
        <th>Jeu</th><th class="n">Écritures</th><th class="n">Charges HT</th>
        <th class="n">Immobilisé HT</th><th class="n">Total HT</th><th class="n">TVA</th>
        <th class="n">TTC</th><th>Première</th><th>Dernière</th>
      </tr></thead>
      <tbody>${parJeu.map(b => `<tr>
        <td><span class="pastille" style="background:${ech(couleurJeu(b.jeu, refs))};color:${ech(encreSur(couleurJeu(b.jeu, refs)))}">${ech(b.jeu)}</span></td>
        <td class="n">${b.nb}</td><td class="n">${ech(euros(b.charges))}</td>
        <td class="n">${ech(euros(b.immo))}</td><td class="n fort">${ech(euros(b.ht))}</td>
        <td class="n">${ech(euros(b.tva))}</td><td class="n">${ech(euros(b.ttc))}</td>
        <td>${ech(formatDateFR(b.premiere))}</td><td>${ech(formatDateFR(b.derniere))}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="note">« Immobilisé » est porté à l'actif et ne pèse au résultat que par sa dotation ;
      « Charges » pèse en totalité sur l'exercice.</p>
  </section>` : '';

  const ordreProjets = refs.chronoProjets ?? [];
  const rangProjet = (p: string) => {
    const i = ordreProjets.indexOf(p);
    return i < 0 ? ordreProjets.length : i;
  };
  const tableauChrono = chronologie.length ? `<section class="bloc simple">
    <h3>Chronologie <span class="total">${chronologie.length} étapes</span></h3>
    <div class="defile"><table class="journal">
      <thead><tr><th>Projet</th><th>Étape</th><th>Début</th><th>Fin</th><th>Détail</th></tr></thead>
      <tbody>${[...chronologie]
        .sort((a, b) => rangProjet(a.projet) - rangProjet(b.projet) || a.debut.localeCompare(b.debut))
        .map(c => {
          const fond = refs.chronoCouleurs?.[c.projet] ?? couleurJeu(c.projet, refs);
          return `<tr>
            <td><span class="pastille" style="background:${ech(fond)};color:${ech(encreSur(fond))}">${ech(c.projet)}</span></td>
            <td>${ech(c.action)}</td><td>${ech(formatDateFR(c.debut))}</td>
            <td>${ech(formatDateFR(c.fin))}</td><td>${ech(c.detail ?? '')}</td>
          </tr>`;
        }).join('')}</tbody>
    </table></div>
  </section>` : '';

  // ----- Stocks -----
  const positions = positionsStock(state.mouvementsStock ?? [], refs.jeux ?? []);
  const prevuStock = stocksExercice(state.stocks ?? [], exercice, refs.jeux ?? []);
  const tableauStocks = (positions.length || prevuStock.length) ? `
    ${positions.length ? `<section class="bloc simple">
      <h3>Stocks réels <span class="total">${ech(euros(r2(positions.reduce((s, p) => s + p.valeur, 0))))}</span></h3>
      <div class="defile"><table class="journal">
        <thead><tr>
          <th>Jeu</th><th class="n">Entrés</th><th class="n">Sortis</th><th class="n">En stock</th>
          <th class="n">Coût moyen</th><th class="n">Valeur</th><th class="n">Ventes HT</th>
          <th class="n">Coût des ventes</th><th class="n">Marge</th>
        </tr></thead>
        <tbody>${positions.map(p => `<tr>
          <td><span class="pastille" style="background:${ech(couleurJeu(p.jeu, refs))};color:${ech(encreSur(couleurJeu(p.jeu, refs)))}">${ech(p.jeu)}</span></td>
          <td class="n">${p.entrees || '·'}</td><td class="n">${p.sorties || '·'}</td>
          <td class="n fort">${p.stock}</td>
          <td class="n">${p.coutMoyen ? ech(euros(p.coutMoyen)) : '·'}</td>
          <td class="n fort">${ech(euros(p.valeur))}</td>
          <td class="n">${p.ca ? ech(euros(p.ca)) : '·'}</td>
          <td class="n">${p.cogs ? ech(euros(p.cogs)) : '·'}</td>
          <td class="n ${p.marge < 0 ? 'neg' : 'pos'}">${p.marge ? ech(euros(p.marge)) : '·'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="note">Les sorties sont valorisées au <b>coût moyen pondéré</b> des entrées. La valeur du
        stock figure à l'actif : elle ne pèse au résultat qu'une fois les exemplaires vendus.</p>
    </section>` : ''}
    ${prevuStock.length ? `<section class="bloc simple">
      <h3>Stock prévu — exercice ${ech(exercice)}
        <span class="total">${ech(euros(r2(prevuStock.reduce((s, x) => s + x.total.marge, 0))))} de marge</span></h3>
      <div class="defile"><table class="journal">
        <thead><tr>
          <th>Jeu</th><th class="n">Coût de revient</th><th>Canaux de vente</th>
          <th class="n">Fabriqués</th><th class="n">Vendus</th><th class="n">Stock clôture</th>
          <th class="n">Tirages HT</th><th class="n">Ventes HT</th>
          <th class="n">Variation de stock</th><th class="n">Marge</th>
        </tr></thead>
        <tbody>${prevuStock.map(x => `<tr>
          <td><span class="pastille" style="background:${ech(couleurJeu(x.ligne.jeu, refs))};color:${ech(encreSur(couleurJeu(x.ligne.jeu, refs)))}">${ech(x.ligne.jeu)}</span></td>
          <td class="n">${ech(euros(x.ligne.coutUnitaire))}</td>
          <td>${(x.ligne.canaux ?? []).filter(c => (x.total.parCanal.get(c.id)?.quantite ?? 0) > 0)
            .map(c => `${ech(c.nom)} ${ech(euros(c.prix))} × ${x.total.parCanal.get(c.id)!.quantite}`)
            .join('<br>') || '<span class="vide">·</span>'}</td>
          <td class="n">${x.total.fabrique || '·'}</td><td class="n">${x.total.vendue || '·'}</td>
          <td class="n fort">${x.total.stockFin}</td>
          <td class="n">${ech(euros(x.total.coutFabrication))}</td>
          <td class="n">${ech(euros(x.total.ca))}</td>
          <td class="n ${x.total.variationStock < 0 ? 'neg' : 'pos'}">${ech(euros(x.total.variationStock))}</td>
          <td class="n ${x.total.marge < 0 ? 'neg' : 'pos'}">${ech(euros(x.total.marge))}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="note">Le tirage payé à l'usine est une charge du mois où il est réglé ; la
        <b>variation de stock</b> la neutralise pour les exemplaires encore en carton. Au bout du
        compte, seul le coût des exemplaires vendus pèse sur le résultat.</p>
    </section>` : ''}` : `<section class="bloc simple">
      <h3>Stocks</h3>
      <p class="note">Aucun mouvement de stock enregistré sur cet exercice.</p>
    </section>`;

  // ----- Contrôles -----
  const listeControles = `<section class="bloc simple">
    <h3>Contrôles comptables</h3>
    <ul class="controles">${controles.map(c => `<li class="${c.niveau}">
      <b>${ech(c.titre)}</b> — ${ech(c.constat)}
      ${c.explication ? `<div class="note">${ech(c.explication)}</div>` : ''}
    </li>`).join('')}</ul>
  </section>`;

  const rn = resultat.find(l => l.cle === 'rn')!.total;
  const cartes: [string, number, BlocCle, string][] = [
    ['Produits', somme(syn.totalProduitsParMois), 'produits', 'ventes, prestations et subventions, HT'],
    ['Charges', somme(syn.totalChargesParMois), 'charges', "charges externes de l'exercice, HT"],
    ['Personnel', somme(syn.totalPersonnelParMois), 'personnel', 'cotisations et rémunérations'],
    ['dont dépenses jeux', -somme(syn.totalJeuxParMois), 'jeux', 'déjà comprises dans les charges'],
    ['Investissements', somme(syn.immoParMois), 'immos', "portés à l'actif, non en charges"],
    ['Dotations', somme(dotations), 'immos', 'amortissement linéaire, prorata temporis'],
    ['Sorti du compte (TTC)', somme(syn.totalTTCParMois), 'tva', 'toutes dépenses taxes comprises'],
    ['Résultat net', rn, 'resultat', 'après dotations et impôt sur les sociétés'],
  ];
  const resume = `<section class="resume">
    ${cartes.map(([label, v, cle, sub]) => `<div class="carte" style="border-left-color:${teintes[cle].base}">
      <div class="lab">${ech(label)}</div>
      <div class="val ${v < 0 ? 'neg' : ''}">${ech(euros(v))}</div>
      <div class="sub">${ech(sub)}</div>
    </div>`).join('')}
  </section>`;

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Big Budi Games — comptabilité ${ech(exercice)} (lecture seule)</title>
<style>
  :root {
    --bbg-purple:#8e7cc3; --bbg-purple-dark:#674ea7; --bbg-purple-darker:#3f3268;
    --bbg-purple-light:#d9d2e9; --bbg-lavender:#f4f1fb; --bbg-lavender-2:#e9e3f7;
    --bord:#c9c0e4; --bord-doux:#ddd6ef; --fond:#f6f4fc;
    --vert:#38761d; --rouge:#8f2b26; --orange:#b45f06;
    --barre:232px;
  }
  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; }
  body {
    margin:0; background:var(--fond); color:#2f2a3f; line-height:1.45;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    display:flex; min-height:100vh;
  }

  /* ---- Barre latérale, comme dans l'app ---- */
  .barre {
    width:var(--barre); flex:0 0 var(--barre); background:var(--bbg-purple-darker); color:#fff;
    padding:16px 12px; position:sticky; top:0; height:100vh; overflow-y:auto;
  }
  .barre .marque { font-size:19px; font-weight:800; letter-spacing:-.01em; }
  .barre .sous { font-size:11px; opacity:.65; margin-top:2px; }
  .barre .lecture {
    display:inline-block; margin-top:10px; background:#ffe599; color:var(--bbg-purple-darker);
    font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px;
  }
  .barre .section {
    font-size:10px; text-transform:uppercase; letter-spacing:.08em; opacity:.5;
    margin:18px 0 6px 8px;
  }
  .barre button {
    display:block; width:100%; text-align:left; border:0; background:transparent; color:#e7e2f4;
    font:inherit; font-size:13px; padding:7px 10px; border-radius:7px; cursor:pointer;
  }
  .barre button:hover { background:rgba(255,255,255,.09); }
  .barre button.actif { background:var(--bbg-purple); color:#fff; font-weight:700; }

  /* ---- Zone principale ---- */
  .zone { flex:1; min-width:0; }
  header {
    position:sticky; top:0; z-index:6; background:var(--fond);
    padding:16px 24px 10px; box-shadow:0 1px 0 var(--bord-doux);
  }
  header h1 { margin:0; font-size:22px; font-weight:800; color:var(--bbg-purple-darker); }
  header .sous { font-size:13px; color:#6f6690; margin-top:2px; }
  main { padding:18px 24px 48px; max-width:1900px; }
  .onglet { display:none; }
  .onglet.actif { display:block; }

  /* ---- Cartes de chiffres ---- */
  .resume { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin-bottom:18px; }
  .carte {
    background:#fff; border:1px solid var(--bord-doux); border-left:4px solid var(--bbg-purple);
    border-radius:10px; padding:10px 14px;
  }
  .carte .lab { font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:#6f6690; }
  .carte .val { font-size:20px; font-weight:800; color:var(--bbg-purple-darker); font-variant-numeric:tabular-nums; }
  .carte .val.neg { color:var(--rouge); }
  .carte .sub { font-size:11px; color:#9a92b5; margin-top:1px; }

  /* ---- Blocs ---- */
  .bloc {
    background:#fff; border:1px solid var(--bord-doux); border-radius:12px;
    margin-bottom:20px; overflow:hidden;
  }
  .bloc h3 {
    margin:0; padding:10px 16px; background:var(--cl,var(--bbg-lavender));
    border-bottom:1px solid var(--cb,var(--bord-doux));
    font-size:15px; font-weight:700; color:var(--cf,var(--bbg-purple-darker));
    display:flex; justify-content:space-between; align-items:center; gap:12px;
  }
  .bloc h3 .total {
    font-size:17px; font-weight:800; background:var(--ct,var(--bbg-lavender-2));
    color:var(--cf,var(--bbg-purple-darker)); border:1px solid var(--cb,var(--bord));
    border-radius:8px; padding:2px 12px; white-space:nowrap; font-variant-numeric:tabular-nums;
  }
  .bloc.simple h3 { background:var(--bbg-lavender); color:var(--bbg-purple-darker); }
  .defile { overflow:auto; max-height:78vh; }

  /* ---- Tableaux ---- */
  table { border-collapse:separate; border-spacing:0; width:100%; font-size:12px; }
  th {
    position:sticky; top:0; z-index:2;
    background:var(--c,var(--bbg-purple)); color:var(--cf,#fff); text-align:left; font-weight:600;
    border-bottom:1px solid var(--cb,var(--bbg-purple)); padding:6px 8px; white-space:nowrap;
  }
  .bloc.simple th { background:var(--bbg-purple); color:#fff; }
  td { border-bottom:1px solid #f0edf8; padding:4px 8px; }
  tbody tr:nth-child(even) td { background:var(--ctc,#faf9fd); }
  tbody tr:hover td { background:var(--cl,var(--bbg-lavender)); }
  tr.agregat td { background:var(--cl,#efeafa) !important; font-weight:700; }
  tfoot td {
    position:sticky; bottom:0;
    background:var(--ct,var(--bbg-lavender-2)); color:var(--cf,var(--bbg-purple-darker));
    font-weight:800; border-top:2px solid var(--cb,var(--bbg-purple)); padding:7px 8px; font-size:12.5px;
  }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  /* La catégorie à gauche et le total à droite restent visibles quand on
     balaie les mois : ce sont les deux colonnes qu'on ne veut jamais perdre. */
  .fige th:first-child, .fige td:first-child { position:sticky; left:0; z-index:3; background:#fff; }
  .fige tbody tr:nth-child(even) td:first-child { background:#faf9fd; }
  .fige th:last-child, .fige td:last-child { position:sticky; right:0; z-index:3; }
  .fige tbody td:last-child { background:var(--ct,var(--bbg-lavender-2)); }
  .fige thead th:first-child, .fige thead th:last-child { z-index:4; }
  .fige tfoot td:first-child, .fige tfoot td:last-child { z-index:4; }
  .fige tr.agregat td:first-child { background:var(--cl,#efeafa); }
  td.grand { font-size:14.5px; }
  td.fort { font-weight:600; }
  td.pos { color:var(--vert); font-weight:700; }
  td.neg { color:var(--rouge); font-weight:700; }
  .vide { color:#c1bad6; }
  th.lib { min-width:230px; }
  .journal td { white-space:nowrap; }
  .pastille { display:inline-block; padding:1px 9px; border-radius:999px; font-size:11px; font-weight:700; }
  .note { margin:9px 16px 13px; font-size:11.5px; color:#8d85a6; line-height:1.55; }
  .note b { color:#6f6690; }

  /* ---- Contrôles ---- */
  ul.controles { list-style:none; margin:0; padding:12px 16px; }
  ul.controles li { padding:6px 0 6px 24px; position:relative; font-size:13px; border-bottom:1px solid #f0edf8; }
  ul.controles li:last-child { border-bottom:0; }
  ul.controles li::before { position:absolute; left:0; top:6px; font-weight:800; }
  ul.controles li.ok::before { content:'✓'; color:var(--vert); }
  ul.controles li.attention::before { content:'!'; color:var(--orange); }
  ul.controles li.erreur::before { content:'✕'; color:var(--rouge); }
  ul.controles li.info::before { content:'i'; color:#6f6690; }
  footer { padding:14px 24px 28px; font-size:11.5px; color:#8d85a6; }

  @media (max-width:900px) {
    body { display:block; }
    .barre { width:auto; height:auto; position:static; display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
    .barre .section { display:none; }
    .barre button { width:auto; }
  }
  @media print {
    body { display:block; background:#fff; }
    .barre, footer { display:none; }
    header { position:static; }
    .onglet { display:block !important; page-break-before:always; }
    .defile { max-height:none; overflow:visible; }
    th, tfoot td { position:static; }
  }
</style>
</head><body>
<aside class="barre">
  <div class="marque">BBG Compta</div>
  <div class="sous">Big Budi Games · exercice ${ech(exercice)}</div>
  <div class="lecture">Lecture seule</div>
  <div class="section">Journal comptable</div>
  <button class="actif" data-o="synthese">Synthèse annuelle</button>
  <button data-o="resultat">Résultat &amp; TVA</button>
  <button data-o="journal">Journal du mois</button>
  <button data-o="immos">Immobilisations</button>
  <button data-o="stocks">Stocks</button>
  <button data-o="tresorerie">Trésorerie</button>
  <button data-o="jeux">Jeux</button>
  <div class="section">Prévisionnel</div>
  <button data-o="chrono">Chronologie</button>
  <div class="section">Contrôle</div>
  <button data-o="controles">Contrôles comptables</button>
</aside>
<div class="zone">
  <header>
    <h1 id="titre">Synthèse annuelle</h1>
    <div class="sous">
      Exercice ${ech(exercice)}, du 1<sup>er</sup> octobre au 30 septembre ·
      document généré le ${ech(formatDateFR(aujourdhui))} par BBG Compta ·
      ${duJournal.length} écritures
    </div>
  </header>
  <main>
    <div class="onglet actif" id="synthese">${resume}${blocs.map(tableauBloc).join('')}</div>
    <div class="onglet" id="resultat">${tableauResultat}${tableauTVA}</div>
    <div class="onglet" id="journal">${journal}</div>
    <div class="onglet" id="immos">${tableauImmos}</div>
    <div class="onglet" id="stocks">${tableauStocks}</div>
    <div class="onglet" id="tresorerie">${tableauTresorerie}${tableauFinances}</div>
    <div class="onglet" id="jeux">${tableauParJeu}</div>
    <div class="onglet" id="chrono">${tableauChrono}</div>
    <div class="onglet" id="controles">${listeControles}</div>
  </main>
  <footer>
    Tous les totaux sont recalculés écriture par écriture depuis le journal : aucun n'est saisi à la main.
    Ce fichier ne contient aucun lien vers l'extérieur et n'envoie rien sur Internet.
  </footer>
</div>
<script>
  document.querySelectorAll('.barre button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.barre button').forEach(function (x) { x.classList.remove('actif'); });
      document.querySelectorAll('.onglet').forEach(function (x) { x.classList.remove('actif'); });
      b.classList.add('actif');
      document.getElementById(b.dataset.o).classList.add('actif');
      document.getElementById('titre').textContent = b.textContent;
      window.scrollTo(0, 0);
    });
  });
</script>
</body></html>`;
}
