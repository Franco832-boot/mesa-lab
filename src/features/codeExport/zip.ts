export interface ZipTextFile { path: string; source: string }
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 255] ?? 0);
  return (crc ^ 0xffffffff) >>> 0;
}
export const reservedFileName = (name: string) => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
/** A bounded, deterministic ZIP STORE writer (UTF-8, CRC32, no ZIP64/encryption).
 * Only relative regular-file paths are allowed. DOS timestamps use 1980-01-01.
 * Format reference: PKWARE APPNOTE 4.3.7, 4.3.12 and 4.3.16. */
export function textZip(files: readonly ZipTextFile[]): Uint8Array<ArrayBuffer> {
  if (!files.length || files.length > 64) throw new Error('zip-limit');
  const seen = new Set<string>();
  let size = 22;
  const entries = files.map(file => {
    if (file.path.length > 256 || file.path.split('/').some(part => !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(part) || part.endsWith('.') || reservedFileName(part))) throw new Error('zip-path');
    const identity = file.path.toLowerCase();
    if (seen.has(identity)) throw new Error('zip-duplicate');
    seen.add(identity);
    if (file.source.length > 1_000_000) throw new Error('zip-limit');
    const name = encoder.encode(file.path), data = encoder.encode(file.source);
    size += 30 + 46 + name.length * 2 + data.length;
    if (size > 4_000_000) throw new Error('zip-limit');
    return { name, data, crc: crc32(data), offset: 0 };
  });
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  const word = (offset: number, value: number) => view.setUint16(offset, value, true);
  const dword = (offset: number, value: number) => view.setUint32(offset, value, true);
  let cursor = 0;
  for (const entry of entries) {
    entry.offset = cursor;
    dword(cursor, 0x04034b50); word(cursor + 4, 20); word(cursor + 6, 0x0800);
    word(cursor + 12, 0x0021); dword(cursor + 14, entry.crc);
    dword(cursor + 18, entry.data.length); dword(cursor + 22, entry.data.length); word(cursor + 26, entry.name.length);
    bytes.set(entry.name, cursor + 30); bytes.set(entry.data, cursor + 30 + entry.name.length);
    cursor += 30 + entry.name.length + entry.data.length;
  }
  const directory = cursor;
  for (const entry of entries) {
    dword(cursor, 0x02014b50); word(cursor + 4, 20); word(cursor + 6, 20); word(cursor + 8, 0x0800);
    word(cursor + 14, 0x0021); dword(cursor + 16, entry.crc);
    dword(cursor + 20, entry.data.length); dword(cursor + 24, entry.data.length); word(cursor + 28, entry.name.length);
    dword(cursor + 42, entry.offset); bytes.set(entry.name, cursor + 46);
    cursor += 46 + entry.name.length;
  }
  dword(cursor, 0x06054b50); word(cursor + 8, entries.length); word(cursor + 10, entries.length);
  dword(cursor + 12, cursor - directory); dword(cursor + 16, directory);
  return bytes;
}
