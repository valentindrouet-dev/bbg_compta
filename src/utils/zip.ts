/**
 * Écriture d'archives ZIP, sans dépendance externe.
 *
 * Sert à l'export « tout en un » (Excel + PDF + CSV + JSON dans un seul
 * fichier) et au téléchargement groupé des justificatifs. Les données sont
 * compressées avec `CompressionStream('deflate-raw')` quand le navigateur le
 * propose, et simplement stockées sinon : dans les deux cas l'archive est
 * lisible par le Finder, l'Explorateur, Google Drive et 7-Zip.
 */

export interface FichierZip {
  /** Chemin dans l'archive : « Factures/edit.pdf » crée le dossier. */
  nom: string;
  data: Blob | Uint8Array | string;
}

// Table CRC-32 (polynôme 0xEDB88320), calculée une fois pour toutes.
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE_CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS attendu par le ZIP. */
function dateDOS(d: Date): { heure: number; date: number } {
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

async function enOctets(data: Blob | Uint8Array | string): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(await data.arrayBuffer());
}

/** Compression deflate brute ; renvoie null si le navigateur ne sait pas faire. */
async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  const Cs = (globalThis as { CompressionStream?: new (f: string) => TransformStream }).CompressionStream;
  if (!Cs) return null;
  try {
    const flux = new Blob([data]).stream().pipeThrough(new Cs('deflate-raw'));
    const buf = await new Response(flux as ReadableStream).arrayBuffer();
    const out = new Uint8Array(buf);
    // Une compression qui gonfle le fichier (déjà compressé, comme un PNG)
    // ne sert à rien : on le stocke tel quel.
    return out.length < data.length ? out : null;
  } catch {
    return null;
  }
}

/** Petit tampon d'écriture little-endian. */
class Tampon {
  private morceaux: Uint8Array[] = [];
  taille = 0;
  pousser(u: Uint8Array) { this.morceaux.push(u); this.taille += u.length; }
  u16(v: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); this.pousser(b); }
  u32(v: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this.pousser(b); }
  parts(): Uint8Array[] { return this.morceaux; }
}

/**
 * Construit l'archive. Les noms sont encodés en UTF-8 (drapeau 0x0800) pour
 * que « Synthèse.xlsx » garde ses accents sur toutes les plateformes.
 */
export async function creerZip(fichiers: FichierZip[], quand = new Date()): Promise<Blob> {
  const { heure, date } = dateDOS(quand);
  const local = new Tampon();
  const central = new Tampon();
  let offset = 0;
  let nb = 0;

  for (const f of fichiers) {
    const brut = await enOctets(f.data);
    const compresse = await deflate(brut);
    const corps = compresse ?? brut;
    const methode = compresse ? 8 : 0;
    const nom = new TextEncoder().encode(f.nom);
    const crc = crc32(brut);

    // En-tête local
    local.u32(0x04034b50);
    local.u16(20); local.u16(0x0800); local.u16(methode);
    local.u16(heure); local.u16(date);
    local.u32(crc); local.u32(corps.length); local.u32(brut.length);
    local.u16(nom.length); local.u16(0);
    local.pousser(nom);
    local.pousser(corps);

    // Entrée du répertoire central
    central.u32(0x02014b50);
    central.u16(20); central.u16(20); central.u16(0x0800); central.u16(methode);
    central.u16(heure); central.u16(date);
    central.u32(crc); central.u32(corps.length); central.u32(brut.length);
    central.u16(nom.length); central.u16(0); central.u16(0);
    central.u16(0); central.u16(0); central.u32(0);
    central.u32(offset);
    central.pousser(nom);

    offset += 30 + nom.length + corps.length;
    nb++;
  }

  const fin = new Tampon();
  fin.u32(0x06054b50);
  fin.u16(0); fin.u16(0);
  fin.u16(nb); fin.u16(nb);
  fin.u32(central.taille); fin.u32(offset);
  fin.u16(0);

  return new Blob([...local.parts(), ...central.parts(), ...fin.parts()],
    { type: 'application/zip' });
}

/** Nettoie un nom pour qu'il passe sur tous les systèmes de fichiers. */
export function nomSur(nom: string): string {
  return nom.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'fichier';
}
