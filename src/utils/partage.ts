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
  compteResultat, dotationsParMois, immoInfos, produitsFinanciersParMois, syntheseExercice,
} from './calc';
import { controlesComptables } from './controles';
import { compareMois, formatDateFR, labelMois } from './dates';
import { euros, r2 } from './money';

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
  const { entries, referentiels: refs, finances } = state;
  const syn = syntheseExercice(entries, exercice, refs, 'ht');
  const immos = immoInfos(entries);
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
    { cle: 'jeux', titre: 'Dépenses Jeux — ventilation, déjà comprise dans les charges',
      lignes: lignesDe(syn.jeux, refs.categoriesJeux), totaux: syn.totalJeuxParMois },
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
      <div class="defile"><table>
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
    <div class="defile"><table>
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
    <div class="defile"><table>
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
    <td class="n">${ech(euros(e.ttc))}</td><td class="n">${ech(euros(e.tva))}</td>
    <td class="n fort">${ech(euros(e.ht))}</td>
    <td>${ech(e.type)}</td><td>${ech(e.compta ?? '')}</td><td>${ech(e.facture ?? '')}</td>
  </tr>`;
  const journal = `<section class="bloc simple">
    <h3>Journal détaillé <span class="total">${duJournal.length} écritures</span></h3>
    <div class="defile"><table class="journal">
      <thead><tr>
        <th>Mois</th><th>Date</th><th>Fournisseur</th><th>Description</th><th>Catégorie</th>
        <th class="n">TTC</th><th class="n">TVA</th><th class="n">HT</th>
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

  // ----- Contrôles -----
  const listeControles = `<section class="bloc simple">
    <h3>Contrôles comptables</h3>
    <ul class="controles">${controles.map(c => `<li class="${c.niveau}">
      <b>${ech(c.titre)}</b> — ${ech(c.constat)}
      ${c.explication ? `<div class="note">${ech(c.explication)}</div>` : ''}
    </li>`).join('')}</ul>
  </section>`;

  const rn = resultat.find(l => l.cle === 'rn')!.total;
  const resume = `<section class="resume">
    ${[
      ['Produits', somme(syn.totalProduitsParMois), 'produits'],
      ['Charges', somme(syn.totalChargesParMois), 'charges'],
      ['Personnel', somme(syn.totalPersonnelParMois), 'personnel'],
      ['dont dépenses jeux (dans les charges)', -somme(syn.totalJeuxParMois), 'jeux'],
      ['Investissements', somme(syn.immoParMois), 'immos'],
      ['Dotations', somme(dotations), 'immos'],
      ['Résultat net', rn, 'resultat'],
    ].map(([label, v, cle]) => `<div class="carte" style="border-left-color:${teintes[cle as BlocCle].base}">
      <div class="lab">${ech(label)}</div>
      <div class="val ${typeof v === 'number' && v < 0 ? 'neg' : ''}">${ech(euros(v as number))}</div>
    </div>`).join('')}
  </section>`;

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Big Budi Games — comptabilité ${ech(exercice)} (lecture seule)</title>
<style>
  :root { --violet:#674ea7; --violet-fonce:#3f3268; --bord:#c9c0e4; --bord-doux:#ddd6ef; --lavande:#f4f1fb; }
  * { box-sizing: border-box; }
  body { margin:0; padding:0 0 48px; font-family: system-ui,-apple-system,sans-serif; background:#f6f4fc; color:#2f2a3f; }
  header { background:var(--violet-fonce); color:#fff; padding:18px 24px; }
  header h1 { margin:0; font-size:22px; }
  header .sous { opacity:.8; font-size:13px; margin-top:4px; }
  .lecture { display:inline-block; margin-top:8px; background:#ffe599; color:#3f3268; font-size:12px;
    font-weight:700; padding:3px 10px; border-radius:999px; }
  nav { position:sticky; top:0; z-index:5; background:#fff; border-bottom:1px solid var(--bord);
    padding:8px 24px; display:flex; gap:6px; flex-wrap:wrap; }
  nav button { border:1px solid var(--bord); background:#fff; color:#5c5280; border-radius:6px;
    padding:6px 12px; font-size:13px; cursor:pointer; font-family:inherit; }
  nav button.actif { background:var(--violet); border-color:var(--violet); color:#fff; font-weight:700; }
  main { padding:20px 24px; max-width:1900px; margin:0 auto; }
  .onglet { display:none; }
  .onglet.actif { display:block; }
  .bloc { background:#fff; border:1px solid var(--bord-doux); border-radius:10px; margin-bottom:20px; overflow:hidden; }
  .bloc h3 { margin:0; padding:10px 16px; background:var(--lavande); border-bottom:1px solid var(--bord-doux);
    font-size:15px; color:var(--violet-fonce); display:flex; justify-content:space-between; align-items:center; }
  .bloc h3 .total { font-size:17px; font-weight:800; background:var(--ct,#e9e3f7); color:var(--cf,var(--violet-fonce));
    border:1px solid var(--cb,var(--bord)); border-radius:6px; padding:2px 10px; }
  .defile { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:12px; }
  th { background:var(--c,var(--violet)); color:var(--cf,#fff); text-align:left; font-weight:600;
    border:1px solid var(--cb,var(--violet)); padding:5px 7px; white-space:nowrap; }
  td { border:1px solid var(--bord-doux); padding:3px 7px; }
  tbody tr:nth-child(even) td { background:var(--ctc,#faf9fd); }
  tr.agregat td { background:var(--cl,#efeafa) !important; font-weight:700; }
  tfoot td { background:var(--ct,#e9e3f7); color:var(--cf,var(--violet-fonce)); font-weight:800;
    border-top:3px solid var(--cb,var(--violet)); padding:6px 7px; font-size:13px; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  td.grand { font-size:15px; }
  td.fort { font-weight:600; }
  .vide { color:#c1bad6; }
  th.lib { min-width:230px; }
  .journal td { white-space:nowrap; }
  .note { margin:8px 16px 12px; font-size:11.5px; color:#8d85a6; line-height:1.5; }
  .resume { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin-bottom:20px; }
  .carte { background:#fff; border:1px solid var(--bord-doux); border-left:4px solid var(--violet);
    border-radius:8px; padding:10px 14px; }
  .carte .lab { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#6f6690; }
  .carte .val { font-size:19px; font-weight:800; color:var(--violet-fonce); font-variant-numeric:tabular-nums; }
  .carte .val.neg { color:#8f2b26; }
  ul.controles { list-style:none; margin:0; padding:12px 16px; }
  ul.controles li { padding:5px 0 5px 22px; position:relative; font-size:13px; border-bottom:1px solid #f0edf8; }
  ul.controles li:last-child { border-bottom:0; }
  ul.controles li::before { position:absolute; left:0; top:5px; font-weight:700; }
  ul.controles li.ok::before { content:'✓'; color:#38761d; }
  ul.controles li.attention::before { content:'!'; color:#b45f06; }
  ul.controles li.erreur::before { content:'✕'; color:#b7332e; }
  ul.controles li.info::before { content:'i'; color:#6f6690; }
  footer { padding:16px 24px; font-size:11.5px; color:#8d85a6; }
  @media print {
    nav, footer { display:none; }
    .onglet { display:block !important; page-break-before:always; }
    body { background:#fff; }
  }
</style>
</head><body>
<header>
  <h1>Big Budi Games — comptabilité ${ech(exercice)}</h1>
  <div class="sous">Exercice du 1<sup>er</sup> octobre au 30 septembre · document généré le ${ech(formatDateFR(aujourdhui))} par BBG Compta</div>
  <div class="lecture">Copie en lecture seule — aucune modification possible</div>
</header>
<nav>
  <button class="actif" data-o="synthese">Synthèse</button>
  <button data-o="resultat">Résultat &amp; TVA</button>
  <button data-o="journal">Journal</button>
  <button data-o="immos">Immobilisations</button>
  <button data-o="controles">Contrôles</button>
</nav>
<main>
  <div class="onglet actif" id="synthese">${resume}${blocs.map(tableauBloc).join('')}</div>
  <div class="onglet" id="resultat">${tableauResultat}${tableauTVA}</div>
  <div class="onglet" id="journal">${journal}</div>
  <div class="onglet" id="immos">${tableauImmos}</div>
  <div class="onglet" id="controles">${listeControles}</div>
</main>
<footer>
  Tous les totaux sont recalculés écriture par écriture depuis le journal : aucun n'est saisi à la main.
  Ce fichier ne contient aucun lien vers l'extérieur et n'envoie rien sur Internet.
</footer>
<script>
  document.querySelectorAll('nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('nav button').forEach(function (x) { x.classList.remove('actif'); });
      document.querySelectorAll('.onglet').forEach(function (x) { x.classList.remove('actif'); });
      b.classList.add('actif');
      document.getElementById(b.dataset.o).classList.add('actif');
      window.scrollTo(0, 0);
    });
  });
</script>
</body></html>`;
}
