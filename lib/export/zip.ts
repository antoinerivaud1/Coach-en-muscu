// CM-60 : archive ZIP minimale (méthode « stored », sans compression) pour
// l'export des données. Aucune dépendance : quelques dizaines de Ko de texte
// n'ont pas besoin d'être compressés. Logique pure, testée dans
// tests/unit/accountExport.spec.ts.

export type ZipEntry = { name: string; data: Uint8Array };

let crcTable: Uint32Array | null = null;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

/** CRC-32 (ZIP, PNG) : crc32("123456789") = 0xCBF43926. */
export function crc32(data: Uint8Array): number {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS (champs des en-têtes ZIP). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/**
 * Archive ZIP des fichiers donnés, dans l'ordre. Noms en UTF-8 (drapeau 11),
 * même horodatage pour tous les fichiers : les champs UTC de `at` (le format
 * ZIP n'a pas de fuseau, l'appelant y pose l'heure locale voulue).
 */
export function createZip(entries: readonly ZipEntry[], at: Date = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(at);
  const files = entries.map((e) => ({ name: encoder.encode(e.name), data: e.data, crc: crc32(e.data) }));

  const localSize = files.reduce((n, f) => n + 30 + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((n, f) => n + 46 + f.name.length, 0);
  const out = new Uint8Array(new ArrayBuffer(localSize + centralSize + 22));
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number) => {
    view.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(p, v >>> 0, true);
    p += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, p);
    p += b.length;
  };

  const offsets: number[] = [];
  for (const f of files) {
    offsets.push(p);
    u32(0x04034b50); // en-tête local
    u16(20); // version minimale
    u16(0x0800); // noms en UTF-8
    u16(0); // stored
    u16(time);
    u16(date);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0);
    bytes(f.name);
    bytes(f.data);
  }

  const centralStart = p;
  files.forEach((f, i) => {
    u32(0x02014b50); // répertoire central
    u16(20);
    u16(20);
    u16(0x0800);
    u16(0);
    u16(time);
    u16(date);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0); // extra
    u16(0); // commentaire
    u16(0); // disque
    u16(0); // attributs internes
    u32(0); // attributs externes
    u32(offsets[i]);
    bytes(f.name);
  });

  const centralLength = p - centralStart;
  u32(0x06054b50); // fin du répertoire central
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(centralLength);
  u32(centralStart);
  u16(0);
  return out;
}
