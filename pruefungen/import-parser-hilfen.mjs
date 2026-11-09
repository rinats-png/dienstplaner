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

/** Inhalt des Stroms „Workbook“ einer von SheetJS geschriebenen XLS (BIFF-Daten). */
export function workbookStrom(xls) {
  return Buffer.from(XLSX.CFB.find(XLSX.CFB.read(xls, { type: "buffer" }), "/Workbook").content);
}

/* ---- Review 561dd32: Werkzeuge zum gezielten Umbau von CFB-Prüfdateien (nur Tests) ---- */

/** FAT-Ort (Byteversatz) des Eintrags für Sektor s (nur FAT-Sektoren aus dem Kopf). */
export function cfbFatOrt(buf, s) {
  const ssz = 1 << buf.readUInt16LE(0x1e);
  return (buf.readInt32LE(0x4c + 4 * Math.floor((s * 4) / ssz)) + 1) * ssz + ((s * 4) % ssz);
}

/** Alle Verzeichniseinträge in Dateireihenfolge (Verzeichniskette über die FAT):
    [{ idx, ort, name, namenslaenge, typ, L, R, C, start, groesse }] */
export function cfbEintraege(buf) {
  const ssz = 1 << buf.readUInt16LE(0x1e);
  const aus = [];
  const gesehen = new Set();
  for (let s = buf.readInt32LE(0x30); s >= 0 && !gesehen.has(s); s = buf.readInt32LE(cfbFatOrt(buf, s))) {
    gesehen.add(s);
    for (let k = 0; k < ssz; k += 128) {
      const ort = (s + 1) * ssz + k;
      const nl = buf.readUInt16LE(ort + 64);
      aus.push({
        idx: aus.length, ort, namenslaenge: nl,
        name: buf.toString("utf16le", ort, ort + Math.min(nl, 64)).replace(/\0+$/, ""),
        typ: buf[ort + 66], L: buf.readInt32LE(ort + 68), R: buf.readInt32LE(ort + 72), C: buf.readInt32LE(ort + 76),
        start: buf.readInt32LE(ort + 116), groesse: buf.readInt32LE(ort + 120),
      });
    }
  }
  return aus;
}

/** Setzt Felder eines Verzeichniseintrags (Index wie cfbEintraege) direkt in buf. */
export function cfbSetze(buf, idx, felder) {
  const e = cfbEintraege(buf)[idx];
  if (!e) throw new Error(`Verzeichniseintrag ${idx} fehlt`);
  const o = e.ort;
  if (felder.name !== undefined) {
    buf.fill(0, o, o + 64);
    Buffer.from(felder.name + "\0", "utf16le").copy(buf, o);
    buf.writeUInt16LE((felder.name.length + 1) * 2, o + 64);
  }
  if (felder.namenslaenge !== undefined) buf.writeUInt16LE(felder.namenslaenge, o + 64);
  if (felder.typ !== undefined) buf[o + 66] = felder.typ;
  if (felder.L !== undefined) buf.writeInt32LE(felder.L, o + 68);
  if (felder.R !== undefined) buf.writeInt32LE(felder.R, o + 72);
  if (felder.C !== undefined) buf.writeInt32LE(felder.C, o + 76);
  if (felder.start !== undefined) buf.writeInt32LE(felder.start, o + 116);
  if (felder.groesse !== undefined) buf.writeInt32LE(felder.groesse, o + 120);
  return buf;
}

/** Index des ersten Eintrags mit genau diesem Namen (oder -1). */
export const cfbIndex = (buf, name) => cfbEintraege(buf).findIndex((e) => e.name === name);

/** Gültige XLS-Struktur mit echtem Workbook-Strom und zusätzlichen Strömen X, Y (Einträge 5–7 unbenutzt). */
export function cfbMitFreienEintraegen() {
  return cfbDatei([
    { pfad: "/Workbook", daten: workbookStrom(mappe({ S: [["a", "b"], [1, 2]] }, "xls")) },
    { pfad: "/X", daten: Buffer.alloc(8, 1) },
    { pfad: "/Y", daten: Buffer.alloc(8, 1) },
  ]);
}

/** WK3-Daten (Lotus/Quattro Pro), die SheetJS als Tabelle liest: Kopfsatz, zwei Beschriftungszellen, Ende. */
export const WK3 = Buffer.from([0, 0, 2, 0, 0, 0x10, 0x0f, 0, 7, 0, 0x27, 0, 0, 0, 0, 0x61, 0, 0x0f, 0, 7, 0, 0x27, 0, 0, 1, 0, 0x62, 0, 0x01, 0, 0, 0]);

/** PoCs des Sicherheitsreviews 561dd32 (alle synthetisch, zur Laufzeit erzeugt). */
export const poc561 = {
  /** K1a: zwei UNBENUTZTE, von der Wurzel nicht erreichbare Einträge, deren Zeiger die Warteschlange von build_full_paths endlos wachsen lassen. */
  k1Warteschlange() { const b = cfbMitFreienEintraegen(); cfbSetze(b, 5, { R: 6 }); cfbSetze(b, 6, { L: 1, R: 5 }); return b; },
  /** K1b: unbenutzte Einträge, deren Kind-Zeiger eine Schleife der dad-Kette bilden (Pfadtext wächst endlos). */
  k1DadSchleife() { const b = cfbMitFreienEintraegen(); cfbSetze(b, 5, { C: 1 }); cfbSetze(b, 6, { R: 1, C: 5 }); return b; },
  /** K1c: Zeiger eines unbenutzten Eintrags außerhalb der Einträge. */
  k1ZeigerAusserhalb() { const b = cfbMitFreienEintraegen(); cfbSetze(b, 5, { L: 99 }); return b; },
  /** H2a: Workbook mit Kelvin-Zeichen (U+212A); klein geschrieben „workbook“, groß geschrieben nicht „WORKBOOK“. */
  h2Kelvin() {
    return cfbDatei([{ pfad: "/WorKbook", daten: workbookStrom(mappe({ S: [["a"], [1]] }, "xls")) }, { pfad: "/PerfectOffice_MAIN", daten: WK3 }]);
  },
  /** H2b: Namenslänge 128 Byte: SheetJS liest den Namen über 128 Byte (mit Typ, Zeigern, …), die Vorprüfung nur 64. */
  h2Namenslaenge() {
    const b = cfbDatei([{ pfad: "/Workbook", daten: workbookStrom(mappe({ S: [["a"], [1]] }, "xls")) }, { pfad: "/PerfectOffice_MAIN", daten: WK3 }]);
    return cfbSetze(b, cfbIndex(b, "Workbook"), { namenslaenge: 128 });
  },
  /** H2c: Workbook mit Größe > 0, aber Start -2 (ENDOFCHAIN): SheetJS liefert keinen Inhalt. */
  h2OhneInhalt() {
    const b = cfbDatei([{ pfad: "/Workbook", daten: workbookStrom(mappe({ S: [["a"], [1]] }, "xls")) }, { pfad: "/PerfectOffice_MAIN", daten: WK3 }]);
    return cfbSetze(b, cfbIndex(b, "Workbook"), { start: -2 });
  },
  /** H2d: doppelter Name: erster „Workbook“ ohne Inhalt (Größe 0, Start -2), zweiter (vorher „Workbook2“) mit Inhalt. */
  h2Doppelt() {
    const b = cfbDatei([
      { pfad: "/Workbook", daten: Buffer.alloc(0) },
      { pfad: "/Workbook2", daten: workbookStrom(mappe({ S: [["a"], [1]] }, "xls")) },
      { pfad: "/PerfectOffice_MAIN", daten: WK3 },
    ]);
    cfbSetze(b, cfbIndex(b, "Workbook"), { start: -2 });
    return cfbSetze(b, cfbIndex(b, "Workbook2"), { name: "Workbook" });
  },
};

/** K2-PoC (Review 561dd32): gültige XLS mit einem Füllstrom „Pad“ aus `sektoren` Sektoren. Der Füllstrom wird
    aus dem Verzeichnis genommen (Größe 0) und seine Sektoren absteigend verkettet (FAT[s] = s - 1, erster frei).
    SheetJS make_sector_list baut daraus Ketten der Längen 1, 2, …, n (quadratisch viele Sektorkopien). */
export function cfbAbsteigendeFreieSektoren(sektoren = 2735) {
  const buf = cfbDatei([
    { pfad: "/Workbook", daten: workbookStrom(mappe({ S: [["a", "b"], [1, 2]] }, "xls")) },
    { pfad: "/Pad", daten: Buffer.alloc(sektoren * 512, 1) },
  ]);
  const i = cfbIndex(buf, "Pad");
  const start = cfbEintraege(buf)[i].start;
  const kette = [];
  for (let s = start; s >= 0; s = buf.readInt32LE(cfbFatOrt(buf, s))) kette.push(s);
  cfbSetze(buf, i, { groesse: 0 });
  buf.writeInt32LE(-1, cfbFatOrt(buf, kette[0]));
  for (let k = 1; k < kette.length; k++) buf.writeInt32LE(kette[k - 1], cfbFatOrt(buf, kette[k]));
  return buf;
}

/** CFB-Container (OLE2) aus [{ pfad: "/Sub/Workbook", daten: Buffer }] (Wurzelname "R"), nur für Prüfdateien. */
export function cfbDatei(eintraege) {
  const c = XLSX.CFB.utils.cfb_new({ root: "R" });
  for (const e of eintraege) XLSX.CFB.utils.cfb_add(c, e.pfad, e.daten);
  return Buffer.from(XLSX.CFB.write(c, { type: "buffer" }));
}
