/* Hilfen für die Import-Parser-Prüfung: erzeugt ausschließlich synthetische Testdateien
   zur Testlaufzeit. Das Schreiben nutzt SheetJS nur in der Prüfung, nie im Parser. */
import zlib from "node:zlib";
import * as XLSX from "../vendor/sheetjs/xlsx.mjs";

/** Arbeitsmappe aus { Blattname: [[...], ...] } als Buffer im Format bookType.
    schreib: zusätzliche Schreiboptionen (z. B. { bookSST: true } für eine sharedStrings-Tabelle). */
export function mappe(blaetter, bookType = "xlsx", optionen = {}, wbProps = null, schreib = {}) {
  const wb = XLSX.utils.book_new();
  for (const [name, zeilen] of Object.entries(blaetter)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(zeilen, optionen), name);
  }
  if (wbProps) wb.Workbook = { ...(wb.Workbook || {}), WBProps: { ...wbProps } };
  return Buffer.from(XLSX.write(wb, { ...schreib, type: "buffer", bookType }));
}

/** Minimaler ZIP-Schreiber. eintraege: [{ name, daten: Buffer, methode?: "store"|"deflate", erklaert?: number,
    crc?: number, extra?: Buffer (lokal und zentral), methodeLokal?: "store"|"deflate" }] */
export function zip(eintraege) {
  const teile = [];
  const zentral = [];
  let versatz = 0;
  for (const e of eintraege) {
    const name = Buffer.from(e.name, "utf8");
    const roh = Buffer.from(e.daten);
    const deflate = e.methode === "deflate";
    const kompr = deflate ? zlib.deflateRawSync(roh) : roh;
    const crc = e.crc ?? zlib.crc32(roh);
    const erklaert = e.erklaert ?? roh.length;
    const extra = e.extra ? Buffer.from(e.extra) : Buffer.alloc(0);
    const mLokal = e.methodeLokal ? (e.methodeLokal === "deflate" ? 8 : 0) : (deflate ? 8 : 0);
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0); lokal.writeUInt16LE(20, 4); lokal.writeUInt16LE(0, 6);
    lokal.writeUInt16LE(mLokal, 8); lokal.writeUInt32LE(0, 10);
    lokal.writeUInt32LE(crc, 14); lokal.writeUInt32LE(kompr.length, 18); lokal.writeUInt32LE(erklaert, 22);
    lokal.writeUInt16LE(name.length, 26); lokal.writeUInt16LE(extra.length, 28);
    teile.push(lokal, name, extra, kompr);
    const z = Buffer.alloc(46);
    z.writeUInt32LE(0x02014b50, 0); z.writeUInt16LE(20, 4); z.writeUInt16LE(20, 6); z.writeUInt16LE(0, 8);
    z.writeUInt16LE(deflate ? 8 : 0, 10); z.writeUInt32LE(0, 12);
    z.writeUInt32LE(crc, 16); z.writeUInt32LE(kompr.length, 20); z.writeUInt32LE(erklaert, 24);
    z.writeUInt16LE(name.length, 28); z.writeUInt16LE(extra.length, 30); z.writeUInt32LE(versatz, 42);
    zentral.push(z, name, extra);
    versatz += lokal.length + name.length + extra.length + kompr.length;
  }
  const zb = Buffer.concat(zentral);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0); ende.writeUInt16LE(eintraege.length, 8); ende.writeUInt16LE(eintraege.length, 10);
  ende.writeUInt32LE(zb.length, 12); ende.writeUInt32LE(versatz, 16);
  return Buffer.concat([...teile, zb, ende]);
}

/** Alle Einträge eines (mit SheetJS erzeugten) ZIP lesen, um sie umzubauen. */
export function zipEintraege(buf) {
  const ende = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(ende + 10);
  let p = buf.readUInt32LE(ende + 16);
  const aus = [];
  for (let i = 0; i < n; i++) {
    const methode = buf.readUInt16LE(p + 10), kompr = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), kl = buf.readUInt16LE(p + 32);
    const lh = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nl);
    const lnl = buf.readUInt16LE(lh + 26), lel = buf.readUInt16LE(lh + 28);
    const roh = buf.subarray(lh + 30 + lnl + lel, lh + 30 + lnl + lel + kompr);
    aus.push({ name, daten: methode === 8 ? zlib.inflateRawSync(roh) : Buffer.from(roh) });
    p += 46 + nl + el + kl;
  }
  return aus;
}
