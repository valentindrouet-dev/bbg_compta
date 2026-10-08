import { Fragment, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { useStore } from '../../store';
import type { JournalEntry } from '../../types';
import { formatDateFR, labelMois } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { PageHeader, Card, StatCard, useSort, sortBy, ThSort } from '../ui';

interface LigneFournisseur {
  /** Le nom en minuscules : c'est lui qui regroupe les écritures. */
  cle: string;
  nom: string;
  nb: number;
  /** Signé : négatif pour les dépenses, positif pour les produits. */
  ttc: number;
  ht: number;
  tva: number;
  premiere: string;
  derniere: string;
  categorie: string;
  paiement: string;
  sens: 'dépense' | 'produit' | 'mixte';
}

/** « −1 234,00 € » pour une sortie, « +1 234,00 € » pour une entrée. */
function signe(v: number): string {
  if (!v) return '·';
  return (v > 0 ? '+' : '−') + euros(Math.abs(v));
}
function teinte(v: number): string {
  return v > 0 ? 'var(--bbg-green-dark)' : v < 0 ? '#b7332e' : '#6f6690';
}

export function FournisseursPage() {
  const entries = useStore(s => s.entries);
  const [search, setSearch] = useState('');
  /** Les fournisseurs dépliés : un clic sur la ligne montre leurs écritures. */
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const basculer = (cle: string) => setOuverts(prev => {
    const suivant = new Set(prev);
    if (suivant.has(cle)) suivant.delete(cle); else suivant.add(cle);
    return suivant;
  });
  const { sort, toggle } = useSort({ key: 'ttc', dir: 'asc' }, 'fournisseurs');

  const { lignes, ecrituresDe } = useMemo(() => {
    const ecrituresDe = new Map<string, JournalEntry[]>();
    const par = new Map<string, {
      nom: string; nb: number; ttc: number; ht: number; tva: number;
      dates: string[]; cats: Map<string, number>; paies: Map<string, number>;
      depenses: number; produits: number;
    }>();
    for (const e of entries) {
      const nom = e.fournisseur.trim();
      if (!nom) continue;
      const cle = nom.toLowerCase();
      if (!par.has(cle)) {
        par.set(cle, { nom, nb: 0, ttc: 0, ht: 0, tva: 0, dates: [], cats: new Map(), paies: new Map(), depenses: 0, produits: 0 });
      }
      const f = par.get(cle)!;
      if (!ecrituresDe.has(cle)) ecrituresDe.set(cle, []);
      ecrituresDe.get(cle)!.push(e);
      // Un produit entre en caisse (+), une dépense en sort (−).
      const signe = e.type === 'produit' ? 1 : -1;
      f.nb++; f.ttc += signe * e.ttc; f.ht += signe * e.ht; f.tva += signe * e.tva;
      f.dates.push(e.date);
      f.cats.set(e.categorie, (f.cats.get(e.categorie) ?? 0) + e.ttc);  // pondération en valeur absolue
      if (e.paiement) f.paies.set(e.paiement, (f.paies.get(e.paiement) ?? 0) + 1);
      if (e.type === 'produit') f.produits++; else f.depenses++;
    }
    const dominant = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    // Les écritures dépliées se lisent dans l'ordre du temps, toutes ensemble.
    for (const liste of ecrituresDe.values()) liste.sort((a, b) => a.date.localeCompare(b.date));
    const lignes: LigneFournisseur[] = [...par.entries()].map(([cle, f]) => {
      const dates = f.dates.sort();
      return {
        cle, nom: f.nom, nb: f.nb, ttc: r2(f.ttc), ht: r2(f.ht), tva: r2(f.tva),
        premiere: dates[0] ?? '', derniere: dates[dates.length - 1] ?? '',
        categorie: dominant(f.cats), paiement: dominant(f.paies),
        sens: f.produits && f.depenses ? 'mixte' : f.produits ? 'produit' : 'dépense',
      };
    });
    return { lignes, ecrituresDe };
  }, [entries]);

  const filtrees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? lignes.filter(l => l.nom.toLowerCase().includes(q) || l.categorie.toLowerCase().includes(q)) : lignes;
  }, [lignes, search]);

  const rows = sortBy(filtrees, sort, {
    nom: l => l.nom,
    nb: l => l.nb,
    ttc: l => l.ttc,
    ht: l => l.ht,
    tva: l => l.tva,
    premiere: l => l.premiere,
    derniere: l => l.derniere,
    categorie: l => l.categorie,
    paiement: l => l.paiement,
    sens: l => l.sens,
  });

  const totalTTC = r2(lignes.filter(l => l.sens !== 'produit').reduce((s, l) => s + l.ttc, 0));
  const plusGros = [...lignes].sort((a, b) => Math.abs(b.ttc) - Math.abs(a.ttc))[0];
  const plusFrequent = [...lignes].sort((a, b) => b.nb - a.nb)[0];

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Fournisseurs"
        subtitle="Montants signés : − pour les dépenses, + pour les produits. La saisie du journal s'auto-complète à partir de cette liste."
        actions={
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5" style={{ color: '#9a92b5' }} />
            <input
              className="pl-7 pr-2 py-1.5 border rounded-md text-sm w-56 bg-white"
              style={{ borderColor: 'var(--bbg-border)' }}
              placeholder="Rechercher un fournisseur…"
              value={search}
              onChange={ev => setSearch(ev.target.value)}
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Fournisseurs différents" value={String(lignes.length)} />
        <StatCard label="Total dépensé (TTC)" value={euros(totalTTC)} tone="bad" />
        <StatCard label="Plus gros poste" value={plusGros?.nom ?? '—'}
          sub={plusGros ? `${signe(plusGros.ttc)} sur ${plusGros.nb} écriture${plusGros.nb > 1 ? 's' : ''}` : undefined} />
        <StatCard label="Le plus fréquent" value={plusFrequent?.nom ?? '—'}
          sub={plusFrequent ? `${plusFrequent.nb} écritures` : undefined} />
      </div>

      <Card title={`${rows.length} fournisseur${rows.length > 1 ? 's' : ''}`}>
        <div className="overflow-x-auto -mx-4 px-4">
          <table data-table="fournisseurs" className="sheet text-sm">
            <thead>
              <tr>
                <ThSort label="Fournisseur" k="nom" sort={sort} onToggle={toggle} />
                <ThSort label="Écritures" k="nb" sort={sort} onToggle={toggle} className="num" />
                <ThSort label="Total TTC" k="ttc" sort={sort} onToggle={toggle} className="num" />
                <ThSort label="Total HT" k="ht" sort={sort} onToggle={toggle} className="num" />
                <ThSort label="TVA" k="tva" sort={sort} onToggle={toggle} className="num" />
                <ThSort label="Moyenne / écriture" k="ttc" sort={sort} onToggle={toggle} className="num" />
                <ThSort label="Catégorie principale" k="categorie" sort={sort} onToggle={toggle} />
                <ThSort label="Paiement" k="paiement" sort={sort} onToggle={toggle} />
                <ThSort label="Sens" k="sens" sort={sort} onToggle={toggle} />
                <ThSort label="Première" k="premiere" sort={sort} onToggle={toggle} />
                <ThSort label="Dernière" k="derniere" sort={sort} onToggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {rows.map(l => {
                const ouvert = ouverts.has(l.cle);
                return (
                <Fragment key={l.cle}>
                <tr
                  className="cursor-pointer"
                  title={ouvert ? 'Cliquer pour replier' : 'Cliquer pour voir ses écritures'}
                  onClick={() => basculer(l.cle)}
                >
                  <td className="font-medium" style={{ color: 'var(--bbg-purple-darker)' }}>
                    <button
                      type="button" aria-expanded={ouvert}
                      className="inline-flex items-center gap-1 text-left"
                      onClick={ev => { ev.stopPropagation(); basculer(l.cle); }}
                    >
                      <ChevronRight size={13} className="shrink-0 transition-transform"
                        style={{ transform: ouvert ? 'rotate(90deg)' : undefined, color: '#9a92b5' }} />
                      {l.nom}
                    </button>
                  </td>
                  <td className="text-right tabular-nums">{l.nb}</td>
                  <td className="text-right tabular-nums font-semibold" style={{ color: teinte(l.ttc) }}>{signe(l.ttc)}</td>
                  <td className="text-right tabular-nums" style={{ color: teinte(l.ht) }}>{signe(l.ht)}</td>
                  <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>{signe(l.tva)}</td>
                  <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>{signe(r2(l.ttc / l.nb))}</td>
                  <td>
                    <span className="text-xs rounded-full px-2 py-0.5"
                      style={{ backgroundColor: 'var(--bbg-green-light)', color: '#3f3268' }}>
                      {l.categorie}
                    </span>
                  </td>
                  <td style={{ color: '#5c5280' }}>{l.paiement}</td>
                  <td>
                    <span className="text-xs rounded-full px-2 py-0.5" style={{
                      backgroundColor: l.sens === 'produit' ? 'var(--bbg-green)' : l.sens === 'mixte' ? 'var(--bbg-yellow-light)' : 'var(--bbg-orange-light)',
                      color: '#3f3268',
                    }}>
                      {l.sens}
                    </span>
                  </td>
                  <td style={{ color: '#6f6690' }}>{formatDateFR(l.premiere)}</td>
                  <td style={{ color: '#6f6690' }}>
                    {formatDateFR(l.derniere)}
                    <span className="ml-1 text-xs" style={{ color: '#9a92b5' }}>
                      ({labelMois(l.derniere < '2025-09-01' ? 'pre-immat' : l.derniere.slice(0, 7))})
                    </span>
                  </td>
                </tr>
                {ouvert && (
                  <tr>
                    <td colSpan={11} className="!p-0" style={{ backgroundColor: 'var(--bbg-lavender)' }}>
                      <EcrituresFournisseur ecritures={ecrituresDe.get(l.cle) ?? []} />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/**
 * Les écritures d'un fournisseur, dépliées sous sa ligne : toutes ensemble,
 * dans l'ordre du temps, sans découpage par mois. Mêmes signes que le
 * tableau du dessus : − pour une dépense, + pour un produit.
 */
function EcrituresFournisseur({ ecritures }: { ecritures: JournalEntry[] }) {
  const sens = (e: JournalEntry) => (e.type === 'produit' ? 1 : -1);
  return (
    <div className="pl-6 pr-2 py-2">
      <table className="w-full text-xs border-collapse">
        <tbody>
          <tr className="font-semibold" style={{ color: '#6f6690' }}>
            <td className="w-24">Date</td>
            <td>Description</td>
            <td>Catégorie</td>
            <td>Paiement</td>
            <td className="text-right w-28">TTC</td>
            <td className="text-right w-28">HT</td>
            <td className="text-right w-24">TVA</td>
          </tr>
          {ecritures.map(e => (
            <tr key={e.id}>
              <td className="tabular-nums whitespace-nowrap" style={{ color: '#6f6690' }}>{formatDateFR(e.date)}</td>
              <td style={{ color: 'var(--bbg-purple-darker)' }}>{e.description || '—'}</td>
              <td style={{ color: '#5c5280' }}>{e.categorie}</td>
              <td style={{ color: '#5c5280' }}>{e.paiement}</td>
              <td className="text-right tabular-nums font-semibold" style={{ color: teinte(sens(e) * e.ttc) }}>
                {signe(r2(sens(e) * e.ttc))}
              </td>
              <td className="text-right tabular-nums" style={{ color: teinte(sens(e) * e.ht) }}>
                {signe(r2(sens(e) * e.ht))}
              </td>
              <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>{signe(r2(sens(e) * e.tva))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
