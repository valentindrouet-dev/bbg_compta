/**
 * Ce qui dit, en permanence, si le travail est bien enregistré.
 *
 * Une saisie qu'on croit enregistrée et qui ne l'est pas, c'est le pire des
 * défauts : on ne s'en aperçoit qu'au rechargement, quand il est trop tard.
 * D'où un état visible en bas de la barre latérale, et un bandeau franc quand
 * quelque chose empêche d'écrire.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CloudOff, Copy } from 'lucide-react';
import {
  etatSauvegarde, surEtatSauvegarde, surveillerLesOnglets, type EtatSauvegarde,
} from '../../utils/coffre';

function useEtatCoffre(): EtatSauvegarde {
  const [e, setE] = useState<EtatSauvegarde>(etatSauvegarde);
  useEffect(() => {
    const arret = surveillerLesOnglets();
    const desabo = surEtatSauvegarde(() => setE(etatSauvegarde()));
    // Rafraîchit l'heure affichée sans dépendre d'un changement de données.
    const t = setInterval(() => setE(etatSauvegarde()), 30_000);
    return () => { arret(); desabo(); clearInterval(t); };
  }, []);
  return e;
}

/** Le petit témoin de la barre latérale. */
export function TemoinSauvegarde() {
  const e = useEtatCoffre();
  if (e.statut === 'ok') {
    const h = new Date(e.le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return (
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#a99fd0' }}
        title="Tes modifications sont écrites dans ce navigateur, et un instantané horodaté est déposé à côté.">
        <Check size={12} /> Enregistré à {h}
      </div>
    );
  }
  if (e.statut === 'jamais') {
    return <div className="text-[11px]" style={{ color: '#a99fd0' }}>Prêt</div>;
  }
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: '#ffb4ae' }}>
      <AlertTriangle size={12} /> Non enregistré
    </div>
  );
}

/** Le bandeau plein écran quand l'enregistrement est empêché. */
export function BandeauCoffre() {
  const e = useEtatCoffre();
  if (e.statut === 'ok' || e.statut === 'jamais') return null;

  const commun = 'fixed top-0 left-0 right-0 z-[100] px-4 py-2.5 text-sm flex items-center gap-3 justify-center';
  if (e.statut === 'double-onglet') {
    return (
      <div className={commun} style={{ backgroundColor: '#b45f06', color: '#fff' }}>
        <Copy size={16} className="shrink-0" />
        <span>
          <b>BBG Compta est ouvert dans un autre onglet</b> et c'est lui qui enregistre.
          Cet onglet a cessé d'écrire pour ne pas écraser son travail — ferme-le, ou recharge
          cette page pour reprendre la main.
        </span>
        <button className="px-2.5 py-1 rounded font-bold shrink-0"
          style={{ backgroundColor: '#fff', color: '#b45f06' }}
          onClick={() => window.location.reload()}>
          Recharger
        </button>
      </div>
    );
  }
  return (
    <div className={commun} style={{ backgroundColor: '#b7332e', color: '#fff' }}>
      <CloudOff size={16} className="shrink-0" />
      <span>
        <b>Tes dernières modifications ne sont pas enregistrées.</b>{' '}
        {'message' in e ? e.message : ''}
      </span>
    </div>
  );
}
