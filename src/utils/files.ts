/**
 * Stockage des justificatifs (PDF, images) dans IndexedDB.
 *
 * Pourquoi pas le localStorage : il est limité à ~5 Mo et ne stocke que du
 * texte. IndexedDB accepte les fichiers binaires et offre plusieurs centaines
 * de Mo — de quoi garder toutes les factures d'un exercice.
 */

const DB_NAME = 'bbg-compta-fichiers';
const STORE = 'factures';

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
  blob: Blob;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

export function uidFichier(): string {
  return 'f-' + crypto.randomUUID();
}

// Les fichiers ne vivent pas dans le store Zustand : on prévient nous-mêmes
// les écrans qui les affichent (page Factures, paramètres) quand ça bouge.
const abonnes = new Set<() => void>();

export function surChangementFichiers(cb: () => void): () => void {
  abonnes.add(cb);
  return () => { abonnes.delete(cb); };
}
function prevenir() { for (const cb of [...abonnes]) cb(); }

/** Types acceptés comme justificatif. */
export function estJustificatif(file: File): boolean {
  return /^(image\/|application\/pdf)/.test(file.type)
    || /\.(pdf|png|jpe?g|webp|heic|gif|avif)$/i.test(file.name);
}

/** Enregistre un fichier et renvoie son identifiant. */
export async function saveFile(file: File): Promise<StoredFile> {
  const entry: StoredFile = {
    id: uidFichier(),
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    addedAt: new Date().toISOString(),
    blob: file,
  };
  await tx('readwrite', s => s.put(entry));
  prevenir();
  return entry;
}

export async function getFile(id: string): Promise<StoredFile | null> {
  const res = await tx<StoredFile | undefined>('readonly', s => s.get(id));
  return res ?? null;
}

export async function deleteFile(id: string): Promise<void> {
  await tx('readwrite', s => s.delete(id));
  prevenir();
}

export async function listFiles(): Promise<StoredFile[]> {
  const res = await tx<StoredFile[]>('readonly', s => s.getAll());
  return res ?? [];
}

/** Ouvre le justificatif dans un nouvel onglet. */
export async function openFile(id: string): Promise<boolean> {
  const f = await getFile(id);
  if (!f) return false;
  const url = URL.createObjectURL(f.blob);
  window.open(url, '_blank', 'noopener');
  // Laisse le temps au navigateur d'ouvrir l'onglet avant de libérer l'URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** Somme des tailles stockées, pour l'affichage dans les paramètres. */
export async function tailleTotale(): Promise<{ nb: number; octets: number }> {
  const all = await listFiles();
  return { nb: all.length, octets: all.reduce((s, f) => s + f.size, 0) };
}

export function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

// ----- Sauvegarde / restauration (base64) --------------------------------

function blobEnBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export interface FichierSerialise {
  id: string; name: string; type: string; size: number; addedAt: string; data: string;
}

export async function exporterFichiers(): Promise<FichierSerialise[]> {
  const all = await listFiles();
  return Promise.all(all.map(async f => ({
    id: f.id, name: f.name, type: f.type, size: f.size, addedAt: f.addedAt,
    data: await blobEnBase64(f.blob),
  })));
}

export async function importerFichiers(files: FichierSerialise[]): Promise<number> {
  let n = 0;
  for (const f of files) {
    const bin = atob(f.data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const entry: StoredFile = {
      id: f.id, name: f.name, type: f.type, size: f.size, addedAt: f.addedAt,
      blob: new Blob([arr], { type: f.type }),
    };
    await tx('readwrite', s => s.put(entry));
    n++;
  }
  prevenir();
  return n;
}

/** Télécharge un justificatif sous son nom d'origine. */
export async function downloadFile(id: string, nom?: string): Promise<boolean> {
  const f = await getFile(id);
  if (!f) return false;
  const url = URL.createObjectURL(f.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom || f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
