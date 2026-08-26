import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../../store';
import { formatDateFR, labelMois } from '../../utils/dates';
import { euros, r2 } from '../../utils/money';
import { PageHeader, Card, StatCard, useSort, sortBy, ThSort } from '../ui';

interface LigneFournisseur {
  nom: string;
  nb: number;
  ttc: number;
  ht: number;
  tva: number;
  premiere: string;
  derniere: string;
  categorie: string;
  paiement: string;
  sens: 'dépense' | 'produit' | 'mixte';
}

export function FournisseursPage() {
  const entries = useStore(s => s.entries);
  const [search, setSearch] = useState('');
  const { sort, toggle } = useSort({ key: 'ttc', dir: 'desc' });

  const lignes = useMemo<LigneFournisseur[]>(() => {
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
      f.nb++; f.ttc += e.ttc; f.ht += e.ht; f.tva += e.tva;
      f.dates.push(e.date);
      f.cats.set(e.categorie, (f.cats.get(e.categorie) ?? 0) + e.ttc);
      if (e.paiement) f.paies.set(e.paiement, (f.paies.get(e.paiement) ?? 0) + 1);
      if (e.type === 'produit') f.produits++; else f.depenses++;
    }
    const dominant = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    return [...par.values()].map(f => {
      const dates = f.dates.sort();
      return {
        nom: f.nom, nb: f.nb, ttc: r2(f.ttc), ht: r2(f.ht), tva: r2(f.tva),
        premiere: dates[0] ?? '', derniere: dates[dates.length - 1] ?? '',
        categorie: dominant(f.cats), paiement: dominant(f.paies),
        sens: f.produits && f.depenses ? 'mixte' : f.produits ? 'produit' : 'dépense',
      };
    });
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
  const plusGros = [...lignes].sort((a, b) => b.ttc - a.ttc)[0];
  const plusFrequent = [...lignes].sort((a, b) => b.nb - a.nb)[0];

  return (
    <div className="p-4 w-full">
      <PageHeader
        title="Fournisseurs"
        subtitle="Tous les fournisseurs saisis dans le journal — la saisie s'auto-complète à partir de cette liste"
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
        <StatCard label="Total dépensé (TTC)" value={euros(totalTTC)} tone="accent" />
        <StatCard label="Plus gros poste" value={plusGros?.nom ?? '—'}
          sub={plusGros ? `${euros(plusGros.ttc)} sur ${plusGros.nb} écriture${plusGros.nb > 1 ? 's' : ''}` : undefined} />
        <StatCard label="Le plus fréquent" value={plusFrequent?.nom ?? '—'}
          sub={plusFrequent ? `${plusFrequent.nb} écritures` : undefined} />
      </div>

      <Card title={`${rows.length} fournisseur${rows.length > 1 ? 's' : ''}`}>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="sheet text-sm">
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
              {rows.map(l => (
                <tr key={l.nom}>
                  <td className="font-medium" style={{ color: 'var(--bbg-purple-darker)' }}>{l.nom}</td>
                  <td className="text-right tabular-nums">{l.nb}</td>
                  <td className="text-right tabular-nums font-semibold">{euros(l.ttc)}</td>
                  <td className="text-right tabular-nums">{euros(l.ht)}</td>
                  <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>{euros(l.tva)}</td>
                  <td className="text-right tabular-nums" style={{ color: '#6f6690' }}>{euros(r2(l.ttc / l.nb))}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
