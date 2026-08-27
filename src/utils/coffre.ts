/**
 * Le coffre : ce qui garantit qu'une saisie ne se perd pas.
 *
 * Les données vivent dans le localStorage du navigateur. C'est rapide et sans
 * serveur, mais c'est fragile : un navigateur peut le vider (Safari purge le
 * stockage d'un site laissé de côté une semaine), un second onglet peut écraser
 * le premier, un quota peut être atteint. Trois protections, ici :
 *
 * 1. **Des instantanés horodatés dans IndexedDB.** À chaque changement, après
 *    un court répit, l'état complet est recopié à côté. On garde les derniers
 *    instantanés et un par jour pendant un mois : même un effacement du
 *    localStorage se rattrape.
 * 2. **Un compteur de révision.** Chaque écriture l'incrémente. Un onglet qui
 *    voit une révision plus récente que la sienne sait qu'un autre onglet a
 *    pris la main, et cesse d'écrire plutôt que d'écraser.
 * 3. **Une écriture qui ne ment pas.** Si le navigateur refuse d'enregistrer,
 *    on le sait et on le dit, au lieu de laisser croire que c'est enregistré.
 */

const DB_NAME = 'bbg-compta-coffre';
const STORE = 'instantanes';
const CLE_REVISION = 'bbg-compta-revision';

/** Nombre d'instantanés récents conservés, en plus d'un par jour. */
const RECENTS = 30;
/** Nombre de jours pour lesquels on garde un instantané quotidien. */
const JOURS = 30;
/** Délai de calme avant d'enregistrer un instantané, en millisecondes. */
const REPIT = 15_000;

export interface Instantane {
  /** Horodatage en millisecondes — c'est la clé. */
  t: number;
  /** Révision de l'état au moment de l'instantané. */
  revision: number;
  /** L'état sérialisé, tel qu'il est dans le localStorage. */
  data: string;
  /** De quoi lire l'instantané sans le décoder entièrement. */
  resume: { ecritures: number; chrono: number; octets: number };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 't' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

// ----- Révision : qui a écrit en dernier ---------------------------------

export function revisionCourante(): number {
  return Number(localStorage.getItem(CLE_REVISION) ?? 0) || 0;
}

export function incrementerRevision(): number {
  const n = revisionCourante() + 1;
  try { localStorage.setItem(CLE_REVISION, String(n)); } catch { /* plein : on continue */ }
  return n;
}

// ----- État de l'enregistrement, observable par l'interface --------------

export type EtatSauvegarde =
  | { statut: 'ok'; le: number }
  | { statut: 'jamais' }
  | { statut: 'plein'; message: string }
  | { statut: 'erreur'; message: string }
  | { statut: 'double-onglet' };

let etat: EtatSauvegarde = { statut: 'jamais' };
const abonnes = new Set<() => void>();

export function etatSauvegarde(): EtatSauvegarde { return etat; }

export function surEtatSauvegarde(cb: () => void): () => void {
  abonnes.add(cb);
  return () => { abonnes.delete(cb); };
}

function poser(e: EtatSauvegarde) {
  etat = e;
  for (const cb of abonnes) cb();
}

// ----- Instantanés --------------------------------------------------------

function resumeDe(data: string): Instantane['resume'] {
  try {
    const d = JSON.parse(data);
    return {
      ecritures: d?.state?.entries?.length ?? 0,
      chrono: d?.state?.chronologie?.length ?? 0,
      octets: data.length,
    };
  } catch {
    return { ecritures: 0, chrono: 0, octets: data.length };
  }
}

export async function listerInstantanes(): Promise<Instantane[]> {
  try {
    const tous = await tx<Instantane[]>('readonly', s => s.getAll() as IDBRequest<Instantane[]>);
    return tous.sort((a, b) => b.t - a.t);
  } catch {
    return [];
  }
}

/** Ne garde que les récents et un par jour sur le dernier mois. */
async function faireLeMenage(): Promise<void> {
  const tous = await listerInstantanes();
  if (tous.length <= RECENTS) return;
  const garder = new Set(tous.slice(0, RECENTS).map(x => x.t));
  const jourVu = new Set<string>();
  const limite = Date.now() - JOURS * 86_400_000;
  for (const x of tous) {
    if (x.t < limite) continue;
    const jour = new Date(x.t).toISOString().slice(0, 10);
    if (!jourVu.has(jour)) { jourVu.add(jour); garder.add(x.t); }
  }
  for (const x of tous) {
    if (!garder.has(x.t)) {
      await tx('readwrite', s => s.delete(x.t)).catch(() => undefined);
    }
  }
}

export async function enregistrerInstantane(data: string, revision: number): Promise<boolean> {
  try {
    const derniers = await listerInstantanes();
    // Inutile de garder deux fois la même chose.
    if (derniers[0]?.data === data) return true;
    await tx('readwrite', s => s.put({
      t: Date.now(), revision, data, resume: resumeDe(data),
    } as Instantane));
    await faireLeMenage();
    return true;
  } catch {
    return false;
  }
}

export async function supprimerInstantane(t: number): Promise<void> {
  await tx('readwrite', s => s.delete(t)).catch(() => undefined);
}

// ----- Le gardien : il surveille les écritures ---------------------------

let minuteur: ReturnType<typeof setTimeout> | null = null;
let revisionVue = 0;
let bloque = false;

/** Un autre onglet a-t-il pris la main ? Alors on n'écrit plus. */
export function ecritureBloquee(): boolean { return bloque; }

/**
 * Le stockage utilisé par le store : c'est lui qui écrit, qui vérifie, et qui
 * déclenche les instantanés. Il remplace `localStorage` tel quel, avec les
 * mêmes trois méthodes.
 */
export const stockageSurveille = {
  getItem(nom: string): string | null {
    const v = localStorage.getItem(nom);
    revisionVue = revisionCourante();
    if (v) poser({ statut: 'ok', le: Date.now() });
    return v;
  },

  setItem(nom: string, valeur: string): void {
    // Un autre onglet a écrit depuis notre dernière lecture : on s'arrête net
    // plutôt que d'effacer son travail.
    const revDisque = revisionCourante();
    if (revDisque > revisionVue) {
      bloque = true;
      poser({ statut: 'double-onglet' });
      return;
    }
    if (bloque) return;
    try {
      localStorage.setItem(nom, valeur);
      revisionVue = incrementerRevision();
      poser({ statut: 'ok', le: Date.now() });
    } catch (e) {
      const err = e as { name?: string };
      const plein = err?.name === 'QuotaExceededError'
        || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
      poser(plein
        ? {
          statut: 'plein',
          message: "Le navigateur refuse d'enregistrer : son espace est plein. "
            + 'Télécharge une sauvegarde tout de suite (Paramètres → Sauvegarde), '
            + 'puis libère de la place.',
        }
        : { statut: 'erreur', message: String((e as Error)?.message ?? e) });
      return;
    }
    // Instantané différé : on ne recopie pas l'état à chaque frappe.
    if (minuteur) clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      minuteur = null;
      void enregistrerInstantane(valeur, revisionVue);
    }, REPIT);
  },

  removeItem(nom: string): void {
    localStorage.removeItem(nom);
  },
};

/**
 * Prend un instantané tout de suite, sans attendre le répit — à appeler quand
 * la page se ferme ou passe en arrière-plan, pour ne pas perdre les dernières
 * minutes.
 */
export function instantaneMaintenant(nom = 'bbg-compta-v1'): void {
  const v = localStorage.getItem(nom);
  if (!v) return;
  if (minuteur) { clearTimeout(minuteur); minuteur = null; }
  void enregistrerInstantane(v, revisionCourante());
}

/**
 * Surveille les écritures des autres onglets. Dès qu'un autre onglet
 * enregistre, celui-ci cesse d'écrire : deux onglets qui se recouvrent, c'est
 * la moitié d'une journée de travail qui disparaît.
 */
export function surveillerLesOnglets(): () => void {
  function onStorage(ev: StorageEvent) {
    if (ev.key !== CLE_REVISION && ev.key !== null) return;
    const rev = revisionCourante();
    if (rev > revisionVue) {
      bloque = true;
      poser({ statut: 'double-onglet' });
    }
  }
  window.addEventListener('storage', onStorage);
  const surSortie = () => instantaneMaintenant();
  window.addEventListener('pagehide', surSortie);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') surSortie();
  });
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pagehide', surSortie);
  };
}

/** Reprend la main après un conflit d'onglets, une fois la page rechargée. */
export function reprendreLaMain(): void {
  bloque = false;
  revisionVue = revisionCourante();
  poser({ statut: 'ok', le: Date.now() });
}
