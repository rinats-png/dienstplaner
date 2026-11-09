/* ==========================================================================
   IMP-2 — Kern des Import-Parsers (synchron, läuft im Worker-Thread).
   Vertrag: docs/acc45/IMPORT-VERTRAG.md

   - Format wird über den Inhalt erkannt (Magic Bytes, ZIP-Verzeichnis), nicht
     über die Dateiendung. Die Endung erzeugt höchstens einen Hinweis.
   - ZIP-Container (xlsx/ods): Verzeichnis lesen, Summe der erklärten
     unkomprimierten Größen und Kompressionsverhältnis prüfen, dann jeden
     Eintrag mit hartem Ausgabelimit probeweise entpacken (lügende Header),
     erst danach übernimmt SheetJS.
   - SheetJS wird nur zum LESEN benutzt. Keine Formelberechnung, keine externen
     Verweise, keine Makros, keine Dokumenteigenschaften, kein Schreiben.
   - CSV/TSV liest ein eigener Leser: alle Werte bleiben Text.
   - Keine Interpretation von Werten (Datum, Zahl, Spaltenbedeutung) hier.
   ========================================================================== */
import zlib from "node:zlib";
import * as XLSX from "../../../vendor/sheetjs/xlsx.mjs";

export const STANDARD_GRENZEN = Object.freeze({
  dateiBytes: 10 * 1024 * 1024,
  entpacktBytes: 100 * 1024 * 1024,
  zeilen: 20000,
  spalten: 200,
  blaetter: 20,
  zellen: 4000000,
  archivEintraege: 1000,
  kompressionsverhaeltnis: 100,
  zeitMs: 20000,
});

const MB = 1024 * 1024;
const fehler = (code, nachricht) => ({ ok: false, code, nachricht });
const hinweis = (code, nachricht, extra = {}) => ({ code, nachricht, ...extra });

class Abbruch extends Error {
  constructor(code, nachricht) { super(nachricht); this.code = code; }
}
const abbruch = (code, nachricht) => new Abbruch(code, nachricht);

const ENDUNGEN = {
  xlsx: ["xlsx", "xlsm"],
  xls: ["xls"],
  ods: ["ods"],
  csv: ["csv", "tsv", "txt", "tab"],
  tsv: ["csv", "tsv", "txt", "tab"],
};
const UNTERSTUETZT = "Unterstützt werden Excel (.xlsx, .xls), OpenDocument-Tabellen (.ods) sowie CSV und TSV (Text).";

/** Dateiendung klein, ohne Pfad. */
function endung(name) {
  const n = String(name || "").split(/[\\/]/).pop();
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(i + 1).toLowerCase() : "";
}

/* ------------------------------- ZIP-Prüfung ------------------------------
   Review PR #123, Befund 1: Das Archiv wird hier vollständig selbst gelesen
   (EOCD, Zentralverzeichnis, lokale Köpfe), jeder Eintrag selbst entpackt und
   geprüft (Größe, CRC, Gesamtbudget). SheetJS bekommt danach ausschließlich ein
   NEU aufgebautes Archiv aus den geprüften Einträgen (unkomprimiert, ohne
   Extrafelder, ohne Kommentar). Widersprüchliche Metadaten des Originals können
   SheetJS damit nicht mehr erreichen.                                         */
const SIG_EOCD = 0x06054b50, SIG_CD = 0x02014b50, SIG_LOKAL = 0x04034b50, SIG_ZIP64_LOC = 0x07064b50;
const EOCD_BYTES = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const kaputt = (detail) => abbruch("BESCHAEDIGT", `Die Datei ist beschädigt oder widersprüchlich aufgebaut (${detail}) und kann nicht gelesen werden.`);
const zip64 = () => abbruch("NICHT_UNTERSTUETZT", "Diese Archivvariante (ZIP64) wird nicht unterstützt. " + UNTERSTUETZT);

/** Extrafelder wie SheetJS (parse_extra_field) durchlaufen; ZIP64 (0x0001) und Überläufe abweisen. */
function pruefeExtrafeld(buf, von, laenge) {
  let p = von;
  const ende = von + laenge;
  while (p <= ende - 4) {
    const typ = buf.readUInt16LE(p), sz = buf.readUInt16LE(p + 2);
    if (typ === 0x0001) throw zip64();
    if (p + 4 + sz > ende) throw kaputt("Zusatzfeld überläuft");
    p += 4 + sz;
  }
  if (p !== ende) throw kaputt("Zusatzfeld unvollständig");
}

function zipAbbruchEntpackt(g) {
  return abbruch("ENTPACKT_ZU_GROSS", `Die Datei würde entpackt größer als ${Math.round(g.entpacktBytes / MB)} MB. Sie wird aus Sicherheitsgründen nicht verarbeitet.`);
}

/** Liest EOCD und Zentralverzeichnis streng. */
function liesZipVerzeichnis(buf, g) {
  const L = buf.length;
  if (L < 22) throw kaputt("Archivende fehlt");
  /* SheetJS sucht die LETZTE EOCD-Signatur der Datei; dieselbe Stelle wird hier verwendet. */
  const ende = buf.lastIndexOf(EOCD_BYTES);
  if (ende < 0 || ende + 22 > L) throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt oder unvollständig (Archivende nicht gefunden) und kann nicht gelesen werden.");
  const kommentar = buf.readUInt16LE(ende + 20);
  if (ende + 22 + kommentar !== L) throw kaputt("Archivende nicht exakt am Dateiende");
  const diskNr = buf.readUInt16LE(ende + 4), diskCd = buf.readUInt16LE(ende + 6);
  const aufDisk = buf.readUInt16LE(ende + 8), gesamt = buf.readUInt16LE(ende + 10);
  const cdGroesse = buf.readUInt32LE(ende + 12), cdVersatz = buf.readUInt32LE(ende + 16);
  if (aufDisk === 0xffff || gesamt === 0xffff || cdGroesse === 0xffffffff || cdVersatz === 0xffffffff) throw zip64();
  if (ende >= 20 && buf.readUInt32LE(ende - 20) === SIG_ZIP64_LOC) throw zip64();
  if (diskNr !== 0 || diskCd !== 0) throw abbruch("NICHT_UNTERSTUETZT", "Mehrteilige Archive werden nicht unterstützt. " + UNTERSTUETZT);
  if (aufDisk !== gesamt) throw kaputt("Eintragszahl im Archivende widersprüchlich");
  if (gesamt > g.archivEintraege) {
    throw abbruch("ENTPACKT_ZU_GROSS", `Die Datei enthält ungewöhnlich viele Bestandteile (mehr als ${g.archivEintraege}). Sie wird aus Sicherheitsgründen nicht verarbeitet.`);
  }
  if (gesamt === 0) throw kaputt("Archiv ohne Einträge");
  if (cdVersatz + cdGroesse !== ende) throw kaputt("Archivverzeichnis endet nicht am Archivende");
  /* Keine zweite EOCD-Signatur im Verzeichnis, im Archivende-Block oder im Kommentar. */
  if (buf.indexOf(EOCD_BYTES, cdVersatz) !== ende) throw kaputt("mehrfaches Archivende");

  const eintraege = [];
  const gesehen = new Set();
  let p = cdVersatz;
  let summe = 0;
  for (let i = 0; i < gesamt; i++) {
    if (p + 46 > ende || buf.readUInt32LE(p) !== SIG_CD) throw kaputt("Archivverzeichnis fehlerhaft");
    const flags = buf.readUInt16LE(p + 8);
    const methode = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const komprimiert = buf.readUInt32LE(p + 20);
    const erklaert = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), kl = buf.readUInt16LE(p + 32);
    const diskStart = buf.readUInt16LE(p + 34);
    const lokal = buf.readUInt32LE(p + 42);
    if (p + 46 + nl + el + kl > ende) throw kaputt("Archivverzeichnis abgeschnitten");
    if (komprimiert === 0xffffffff || erklaert === 0xffffffff || lokal === 0xffffffff) throw zip64();
    if (diskStart !== 0) throw abbruch("NICHT_UNTERSTUETZT", "Mehrteilige Archive werden nicht unterstützt. " + UNTERSTUETZT);
    pruefeExtrafeld(buf, p + 46 + nl, el);
    const nameBytes = Buffer.from(buf.subarray(p + 46, p + 46 + nl));
    if (nl === 0) throw kaputt("Eintrag ohne Namen");
    const name = nameBytes.toString("utf8");
    /* SheetJS sucht Bestandteile auch ohne Beachtung der Groß-/Kleinschreibung. */
    const schluessel = nameBytes.toString("latin1").toLowerCase();
    if (gesehen.has(schluessel)) throw kaputt("doppelter Eintragsname");
    gesehen.add(schluessel);
    summe += erklaert;
    if (summe > g.entpacktBytes) throw zipAbbruchEntpackt(g);
    eintraege.push({ name, nameBytes, flags, methode, crc, komprimiert, erklaert, lokal });
    p += 46 + nl + el + kl;
  }
  if (p !== ende) throw kaputt("Archivverzeichnis enthält mehr Daten als Einträge");
  if (summe > MB && summe / Math.max(1, L) > g.kompressionsverhaeltnis) {
    throw abbruch("KOMPRESSION_VERDAECHTIG", "Die Datei ist ungewöhnlich stark komprimiert (Verdacht auf eine präparierte Archivdatei) und wird aus Sicherheitsgründen nicht verarbeitet.");
  }
  return { eintraege, cdVersatz };
}

/** Größte Zeilenposition eines xlsx-Blatts, wie SheetJS sie zählt (r-Attribut oder Vorgänger + 1). */
function hoechsteZeile(xml) {
  const re = /<(?:[A-Za-z_][\w.-]*:)?row\b([^>]*)>/g;
  const reR = /(?:^|\s)(?:[\w.-]+:)?r\s*=\s*["']\s*([^"']*)["']/;
  let m, r = 0, max = 0;
  while ((m = re.exec(xml))) {
    const a = reR.exec(m[1]);
    const n = a ? parseInt(a[1], 10) : NaN;
    r = Number.isFinite(n) ? n : r + 1;
    if (r > max) max = r;
  }
  return max;
}

/** Prüft und entpackt jeden Eintrag selbst; Ist-Größe, CRC, Gesamtbudget; liefert die geprüften Inhalte. */
function pruefeEintraege(buf, verzeichnis, g) {
  const { eintraege, cdVersatz } = verzeichnis;
  const inhalte = new Map();
  const teile = [];
  let entpackt = 0;
  let zeilenMax = 0;
  for (const e of eintraege) {
    if (e.flags & 0x2041) throw abbruch("PASSWORTGESCHUETZT", "Die Datei ist passwortgeschützt. Bitte ohne Passwort speichern und erneut hochladen.");
    const lh = e.lokal;
    if (lh + 30 > cdVersatz || buf.readUInt32LE(lh) !== SIG_LOKAL) throw kaputt("Archiveintrag fehlerhaft");
    const lflags = buf.readUInt16LE(lh + 6);
    const lmethode = buf.readUInt16LE(lh + 8);
    const lcrc = buf.readUInt32LE(lh + 14);
    const lk = buf.readUInt32LE(lh + 18), lu = buf.readUInt32LE(lh + 22);
    const lnl = buf.readUInt16LE(lh + 26), lel = buf.readUInt16LE(lh + 28);
    if (lh + 30 + lnl + lel > cdVersatz) throw kaputt("Archiveintrag abgeschnitten");
    if (!buf.subarray(lh + 30, lh + 30 + lnl).equals(e.nameBytes)) throw kaputt("widersprüchliche Archivangaben");
    if (lflags !== e.flags) throw kaputt("widersprüchliche Eintragsmerkmale");
    if (lmethode !== e.methode) throw kaputt("widersprüchliche Komprimierungsangaben");
    pruefeExtrafeld(buf, lh + 30 + lnl, lel);
    const nachgestellt = (lflags & 8) && lk === 0 && lu === 0;
    if (!nachgestellt && (lk !== e.komprimiert || lu !== e.erklaert)) throw kaputt("widersprüchliche Größenangaben");
    if (!nachgestellt && lcrc !== e.crc) throw kaputt("widersprüchliche Prüfsumme");
    const start = lh + 30 + lnl + lel;
    if (start + e.komprimiert > cdVersatz) throw kaputt("Archivinhalt außerhalb des Datenbereichs");
    const roh = buf.subarray(start, start + e.komprimiert);
    let aus;
    if (e.methode === 0) {
      if (e.komprimiert !== e.erklaert) throw kaputt("Größenangaben");
      aus = Buffer.from(roh);
    } else if (e.methode === 8) {
      /* hartes Limit: nie mehr als erklärt UND nie mehr als das verbleibende Gesamtbudget */
      const rest = g.entpacktBytes - entpackt;
      if (e.erklaert > rest) throw zipAbbruchEntpackt(g);
      try {
        aus = zlib.inflateRawSync(roh, { maxOutputLength: Math.max(1, e.erklaert) });
      } catch (x) {
        if (x && x.code === "ERR_BUFFER_TOO_LARGE") {
          throw abbruch("ENTPACKT_ZU_GROSS", "Die Größenangaben in der Datei stimmen nicht mit dem Inhalt überein (Verdacht auf eine präparierte Archivdatei). Sie wird nicht verarbeitet.");
        }
        throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt (Archivinhalt nicht entpackbar) und kann nicht gelesen werden.");
      }
      if (aus.length !== e.erklaert) throw kaputt("Größenangaben");
    } else {
      throw abbruch("NICHT_UNTERSTUETZT", "Die Datei verwendet eine nicht unterstützte Komprimierung. " + UNTERSTUETZT);
    }
    entpackt += aus.length;
    if (entpackt > g.entpacktBytes) throw zipAbbruchEntpackt(g);
    if (zlib.crc32(aus) !== e.crc) throw kaputt("Prüfsumme stimmt nicht");
    if (e.name === "mimetype" || e.name === "[Content_Types].xml") inhalte.set(e.name, aus.toString("utf8"));
    /* Befund 2: Zeilenpositionen der Blätter selbst bestimmen (unabhängig von <dimension>). */
    if (/\.xml$/i.test(e.name) && aus.includes("sheetData")) {
      const z = hoechsteZeile(aus.toString("latin1"));
      if (z > zeilenMax) zeilenMax = z;
    }
    teile.push({ nameBytes: e.nameBytes, daten: aus, crc: e.crc });
  }
  return { inhalte, teile, entpackt, zeilenMax };
}

/** Baut aus geprüften Einträgen ein neues, minimales Archiv (unkomprimiert). */
function baueSauberesZip(teile) {
  const stuecke = [];
  const zentral = [];
  let versatz = 0;
  for (const t of teile) {
    const n = t.nameBytes, d = t.daten;
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(SIG_LOKAL, 0); lokal.writeUInt16LE(20, 4);
    lokal.writeUInt32LE(t.crc, 14); lokal.writeUInt32LE(d.length, 18); lokal.writeUInt32LE(d.length, 22);
    lokal.writeUInt16LE(n.length, 26);
    stuecke.push(lokal, n, d);
    const z = Buffer.alloc(46);
    z.writeUInt32LE(SIG_CD, 0); z.writeUInt16LE(20, 4); z.writeUInt16LE(20, 6);
    z.writeUInt32LE(t.crc, 16); z.writeUInt32LE(d.length, 20); z.writeUInt32LE(d.length, 24);
    z.writeUInt16LE(n.length, 28); z.writeUInt32LE(versatz, 42);
    zentral.push(z, n);
    versatz += 30 + n.length + d.length;
  }
  const zb = Buffer.concat(zentral);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(SIG_EOCD, 0);
  ende.writeUInt16LE(teile.length, 8); ende.writeUInt16LE(teile.length, 10);
  ende.writeUInt32LE(zb.length, 12); ende.writeUInt32LE(versatz, 16);
  return Buffer.concat([...stuecke, zb, ende]);
}

/**
 * Strikte ZIP-Prüfung (läuft vor SheetJS). Wirft Abbruch bei jedem Widerspruch.
 * Liefert { namen, inhalte, sauber, entpackt, zeilenMax }; `sauber` ist das einzige
 * Archiv, das an SheetJS weitergegeben wird.
 */
export function pruefeZip(buf, grenzen) {
  const g = { ...STANDARD_GRENZEN, ...(grenzen || {}) };
  const verzeichnis = liesZipVerzeichnis(buf, g);
  const geprueft = pruefeEintraege(buf, verzeichnis, g);
  const namen = verzeichnis.eintraege.map((e) => e.name);
  const sauber = baueSauberesZip(geprueft.teile);
  geprueft.teile = null; /* entpackte Einzelpuffer freigeben, nur das neue Archiv bleibt */
  return { namen, inhalte: geprueft.inhalte, sauber, entpackt: geprueft.entpackt, zeilenMax: geprueft.zeilenMax };
}

/* ------------------------------ Formaterkennung --------------------------- */
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const U16 = (s) => Buffer.from(s, "utf16le");

function istText(buf) {
  const n = Math.min(buf.length, 8192);
  let steuer = 0;
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) steuer++;
  }
  return steuer / n < 0.01;
}

function erkenne(buf, g) {
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
    const { namen, inhalte, sauber, zeilenMax } = pruefeZip(buf, g);
    const mime = inhalte.get("mimetype");
    if (mime !== undefined) {
      if (mime.trim() === "application/vnd.oasis.opendocument.spreadsheet") return { format: "ods", namen, inhalte, sauber, zeilenMax: 0 };
      throw abbruch("NICHT_UNTERSTUETZT", "Dies ist ein OpenDocument-Dokument, aber keine Tabelle. " + UNTERSTUETZT);
    }
    if (namen.includes("xl/workbook.bin")) {
      throw abbruch("NICHT_UNTERSTUETZT", "Das Binärformat .xlsb wird nicht unterstützt. Bitte in Excel als .xlsx speichern. " + UNTERSTUETZT);
    }
    if (namen.includes("xl/workbook.xml")) return { format: "xlsx", namen, inhalte, sauber, zeilenMax };
    throw abbruch("NICHT_UNTERSTUETZT", "Der Inhalt der Datei ist keine unterstützte Tabelle (z. B. ein Textdokument oder eine Präsentation). " + UNTERSTUETZT);
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(OLE)) {
    if (buf.includes(U16("EncryptedPackage")) || buf.includes(U16("EncryptionInfo"))) {
      throw abbruch("PASSWORTGESCHUETZT", "Die Datei ist passwortgeschützt (verschlüsselt). Bitte ohne Passwort speichern und erneut hochladen.");
    }
    const hatTabelle = buf.includes(U16("Workbook")) || buf.includes(U16("Book"));
    if (!hatTabelle && (buf.includes(U16("WordDocument")) || buf.includes(U16("PowerPoint Document")))) {
      throw abbruch("NICHT_UNTERSTUETZT", "Der Inhalt der Datei ist keine Tabelle (z. B. ein Textdokument oder eine Präsentation). " + UNTERSTUETZT);
    }
    return { format: "xls", namen: [], inhalte: new Map() };
  }
  const kopf = buf.subarray(0, 16);
  const ascii = kopf.toString("latin1");
  if (ascii.startsWith("%PDF") || ascii.startsWith("\x89PNG") || ascii.startsWith("GIF8") || ascii.startsWith("MZ") ||
      ascii.startsWith("Rar!") || ascii.startsWith("7z\xbc\xaf") || ascii.startsWith("{\\rtf") ||
      (kopf[0] === 0xff && kopf[1] === 0xd8) || (kopf[0] === 0x1f && kopf[1] === 0x8b) ||
      (kopf[0] === 0x50 && kopf[1] === 0x4b)) {
    throw abbruch("UNBEKANNTES_FORMAT", "Dieses Dateiformat wird nicht unterstützt. " + UNTERSTUETZT);
  }
  if (!istText(buf)) {
    throw abbruch("UNBEKANNTES_FORMAT", "Das Dateiformat ist nicht erkennbar oder wird nicht unterstützt (bei Textdateien bitte als UTF-8 speichern). " + UNTERSTUETZT);
  }
  const anfang = buf.subarray(0, 512).toString("latin1").replace(/^\xef\xbb\xbf/, "").trimStart().toLowerCase();
  if (anfang.startsWith("<")) {
    throw abbruch("NICHT_UNTERSTUETZT", "XML- und HTML-Dateien werden nicht unterstützt. " + UNTERSTUETZT);
  }
  return { format: "text", namen: [], inhalte: new Map() };
}

/* ---------------------------------- CSV ---------------------------------- */
function dekodiere(buf, hinweise) {
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    hinweise.push(hinweis("ZEICHENSATZ_ERSATZ", "Die Datei ist nicht UTF-8-kodiert; sie wurde als Windows-1252 gelesen. Bitte Umlaute und Sonderzeichen prüfen."));
    return new TextDecoder("windows-1252").decode(b);
  }
}

function waehleTrenner(text, ext) {
  const probe = text.slice(0, 20000);
  const zaehl = { ";": 0, ",": 0, "\t": 0 };
  let inQ = false, zeilen = 0;
  for (let i = 0; i < probe.length && zeilen < 10; i++) {
    const c = probe[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ) {
      if (c === "\n") zeilen++;
      else if (c in zaehl) zaehl[c]++;
    }
  }
  if (ext === "tsv" && zaehl["\t"] > 0) return "\t";
  let best = ";", max = 0;
  for (const t of ["\t", ";", ","]) if (zaehl[t] > max) { best = t; max = zaehl[t]; }
  return max === 0 ? (ext === "tsv" ? "\t" : ";") : best;
}

function leseCsv(text, trenner, g) {
  const MAX_FELDER = 16384;
  const zeilen = [];
  let zeile = [], feld = "", inQ = false, gequotet = false, nichtLeer = 0;
  const feldEnde = () => {
    zeile.push(gequotet ? feld : feld);
    feld = ""; gequotet = false;
    if (zeile.length > MAX_FELDER) throw abbruch("ZU_VIELE_SPALTEN", `Die Datei hat zu viele Spalten (erlaubt sind höchstens ${g.spalten} Spalten).`);
  };
  const zeilenEnde = () => {
    feldEnde();
    if (zeile.some((z) => z.trim() !== "")) {
      nichtLeer++;
      if (nichtLeer > g.zeilen + 1) throw abbruch("ZU_VIELE_ZEILEN", `Die Datei hat zu viele Zeilen (erlaubt sind höchstens ${g.zeilen} Zeilen je Tabelle, zusätzlich zur Kopfzeile).`);
    }
    zeilen.push(zeile); zeile = [];
  };
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++; } else inQ = false;
      } else feld += c;
    } else if (c === '"' && feld === "" && !gequotet) { inQ = true; gequotet = true; }
    else if (c === trenner) feldEnde();
    else if (c === "\n") zeilenEnde();
    else if (c === "\r") { if (text[i + 1] === "\n") i++; zeilenEnde(); }
    else feld += c;
  }
  if (inQ) throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt: ein Anführungszeichen wird nicht geschlossen.");
  if (feld !== "" || zeile.length > 0 || gequotet) zeilenEnde();
  return zeilen;
}

/* ------------------------------ Blattaufbereitung ------------------------- */
const leer = (z) => z === null || z === undefined || (typeof z === "string" && z.trim() === "");

/** Entfernt leere Zeilen/Spalten, prüft Zeilen- und Spaltenlimit, liefert { zeilen, hinweise }. */
function bereinige(name, roh, g) {
  const hinweise = [];
  const behalten = roh.filter((z) => z.some((c) => !leer(c)));
  const leereZeilen = roh.length - behalten.length;
  if (behalten.length === 0) {
    hinweise.push(hinweis("LEERES_BLATT", `Blatt „${name}“ enthält keine Daten.`, { blatt: name }));
    return { zeilen: [], hinweise };
  }
  if (behalten.length - 1 > g.zeilen) {
    throw abbruch("ZU_VIELE_ZEILEN", `Blatt „${name}“ hat zu viele Zeilen (erlaubt sind höchstens ${g.zeilen} Zeilen je Tabelle, zusätzlich zur Kopfzeile).`);
  }
  let breite = 0;
  for (const z of behalten) if (z.length > breite) breite = z.length;
  const benutzt = new Array(breite).fill(false);
  for (const z of behalten) for (let c = 0; c < z.length; c++) if (!leer(z[c])) benutzt[c] = true;
  const spalten = [];
  for (let c = 0; c < breite; c++) if (benutzt[c]) spalten.push(c);
  if (spalten.length > g.spalten) {
    throw abbruch("ZU_VIELE_SPALTEN", `Blatt „${name}“ hat zu viele Spalten (erlaubt sind höchstens ${g.spalten} Spalten).`);
  }
  const zeilen = behalten.map((z) => spalten.map((c) => (leer(z[c]) && typeof z[c] !== "string" ? null : (z[c] === undefined ? null : z[c]))));
  if (leereZeilen > 0) hinweise.push(hinweis("LEERE_ZEILEN_ENTFERNT", `Blatt „${name}“: ${leereZeilen} leere Zeile(n) entfernt.`, { blatt: name, anzahl: leereZeilen }));
  const leereSpalten = breite - spalten.length;
  if (leereSpalten > 0) hinweise.push(hinweis("LEERE_SPALTEN_ENTFERNT", `Blatt „${name}“: ${leereSpalten} leere Spalte(n) entfernt.`, { blatt: name, anzahl: leereSpalten }));
  return { zeilen, hinweise };
}

/* Review PR #123, Befund 3: Excel-Seriennummern im 1904-System liegen 1462 Tage
   unter denen des 1900-Systems. Umgerechnet wird genau einmal, und nur bei
   numerischen Zellen mit Datumsformat; gewöhnliche Zahlen und Text bleiben roh. */
const VERSATZ_1904 = 1462;

function zelle(c, versatz) {
  if (!c || c.t === "z") return null;
  switch (c.t) {
    case "n": {
      if (typeof c.v !== "number" || !Number.isFinite(c.v)) return { typ: "fehler", text: String(c.w ?? c.v) };
      if (c.z && typeof c.z === "string" && XLSX.SSF.is_date(c.z)) {
        return { typ: "datum", roh: c.v + versatz, text: String(c.w ?? "") };
      }
      return c.v;
    }
    case "s": return c.v === "" ? null : String(c.v);
    case "b": return !!c.v;
    case "e": return { typ: "fehler", text: String(c.w ?? "#WERT!") };
    case "d": return { typ: "datum", roh: null, text: String(c.w ?? (c.v instanceof Date ? c.v.toISOString() : c.v)) };
    default: return c.v === undefined ? null : String(c.v);
  }
}

/* --------------------------------- Haupt ---------------------------------- */
export function parseKern({ buffer, name, grenzen }) {
  const g = { ...STANDARD_GRENZEN, ...(grenzen || {}) };
  const buf = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.length);
  const hinweise = [];
  try {
    if (buf.length === 0) return fehler("LEER", "Die Datei ist leer.");
    if (buf.length > g.dateiBytes) {
      return fehler("DATEI_ZU_GROSS", `Die Datei ist zu groß (erlaubt sind höchstens ${Math.round(g.dateiBytes / MB)} MB).`);
    }
    const erk = erkenne(buf, g);
    const ext = endung(name);
    let format = erk.format;
    const blaetter = [];
    let gesamtZellen = 0;
    let datumssystem;

    if (format === "text") {
      const text = dekodiere(buf, hinweise);
      const trenner = waehleTrenner(text, ext);
      format = trenner === "\t" ? "tsv" : "csv";
      const roh = leseCsv(text, trenner, g).map((z) => z.map((s) => (s === "" ? null : s)));
      blaetter.push({ name: "Tabelle1", roh });
    } else {
      /* Lesegrenze für Zeilenpositionen (Kopfzeile + Datenzeilen + Toleranz für leere Zeilen).
         Review PR #123, Befund 2: Überschreitung ist immer ZU_VIELE_ZEILEN, nie ein Teilergebnis. */
      const lesegrenze = g.zeilen + 1 + 10000;
      const zuViele = (bn) => abbruch("ZU_VIELE_ZEILEN", `${bn ? `Blatt „${bn}“` : "Ein Tabellenblatt"} hat zu viele Zeilen (erlaubt sind höchstens ${g.zeilen} Zeilen je Tabelle, zusätzlich zur Kopfzeile).`);
      if (format === "xlsx" && erk.zeilenMax > lesegrenze) throw zuViele();
      if (erk.namen.length) {
        /* Review PR #123, Befund 4: nur echte Makro-Bestandteile zählen, nicht der
           SheetJS-Standardeintrag Default Extension="bin" (…binary.macroEnabled.main). */
        if (erk.namen.some((n) => /(^|\/)vbaProject\.bin$/i.test(n) || /^(Scripts|Basic)\//.test(n)) ||
            /ContentType\s*=\s*["']application\/vnd\.ms-office\.vbaProject["']/i.test(erk.inhalte.get("[Content_Types].xml") || "")) {
          hinweise.push(hinweis("MAKROS_VERWORFEN", "Die Datei enthält Makros. Sie wurden nicht ausgeführt und nicht übernommen; nur die Tabellendaten wurden gelesen."));
        }
        if (erk.namen.some((n) => /^xl\/externalLinks\//.test(n))) {
          hinweise.push(hinweis("EXTERNE_VERWEISE_IGNORIERT", "Die Datei verweist auf andere Dateien. Diese Verweise wurden nicht aufgelöst; es gelten nur die in der Datei gespeicherten Werte."));
        }
        if (erk.namen.some((n) => /^xl\/(embeddings|activeX)\//.test(n))) {
          hinweise.push(hinweis("EINGEBETTETE_OBJEKTE_IGNORIERT", "Die Datei enthält eingebettete Objekte. Sie wurden nicht geöffnet."));
        }
        if (format === "xlsx") {
          const n = erk.namen.filter((x) => /^xl\/worksheets\/[^/]+\.xml$/.test(x)).length;
          if (n > g.blaetter) throw abbruch("ZU_VIELE_BLAETTER", `Die Datei hat zu viele Tabellenblätter (erlaubt sind höchstens ${g.blaetter} Blätter).`);
        }
      } else if (buf.includes(U16("_VBA_PROJECT"))) {
        hinweise.push(hinweis("MAKROS_VERWORFEN", "Die Datei enthält Makros. Sie wurden nicht ausgeführt und nicht übernommen; nur die Tabellendaten wurden gelesen."));
      }
      let wb;
      try {
        /* ZIP-Formate: SheetJS liest nur das neu aufgebaute, geprüfte Archiv (Befund 1).
           XLS hat keine Lesegrenze: die Dateigröße begrenzt die Zellzahl, und ohne
           sheetRows wird nichts still abgeschnitten (Befund 2). */
        wb = XLSX.read(erk.sauber || buf, {
          type: "buffer",
          dense: true,
          cellFormula: false,
          cellHTML: false,
          cellNF: true,
          cellText: true,
          cellDates: false,
          cellStyles: false,
          bookVBA: false,
          bookProps: false,
          bookFiles: false,
          bookDeps: false,
          bookSheets: false,
          sheetStubs: false,
          sheetRows: format === "xls" ? 0 : lesegrenze + 1,
          WTF: false,
        });
        erk.sauber = null;
      } catch (x) {
        if (/password|encrypt/i.test(String(x && x.message))) {
          throw abbruch("PASSWORTGESCHUETZT", "Die Datei ist passwortgeschützt. Bitte ohne Passwort speichern und erneut hochladen.");
        }
        throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt oder entspricht nicht dem erwarteten Format und kann nicht gelesen werden.");
      }
      const namen = wb && wb.SheetNames;
      if (!Array.isArray(namen) || namen.length === 0) throw abbruch("BESCHAEDIGT", "Die Datei enthält keine lesbaren Tabellenblätter.");
      if (namen.length > g.blaetter) throw abbruch("ZU_VIELE_BLAETTER", `Die Datei hat zu viele Tabellenblätter (erlaubt sind höchstens ${g.blaetter} Blätter).`);
      const sheetInfos = (wb.Workbook && wb.Workbook.Sheets) || [];
      const d1904 = wb.Workbook && wb.Workbook.WBProps ? wb.Workbook.WBProps.date1904 : false;
      const ist1904 = d1904 === true || d1904 === 1 || /^(1|true)$/i.test(String(d1904 ?? "").trim());
      datumssystem = ist1904 ? "1904" : "1900";
      if (ist1904) {
        hinweise.push(hinweis("DATUMSSYSTEM_1904", "Die Datei verwendet das Datumssystem 1904. Datumswerte wurden auf das übliche Datumssystem 1900 umgerechnet (normalisiert).", { datumssystem: "1904" }));
      }
      const versatz = ist1904 ? VERSATZ_1904 : 0;
      namen.forEach((bn, idx) => {
        const ws = wb.Sheets[bn];
        if (sheetInfos[idx] && sheetInfos[idx].Hidden) {
          hinweise.push(hinweis("AUSGEBLENDETES_BLATT", `Blatt „${bn}“ ist in der Datei ausgeblendet.`, { blatt: bn }));
        }
        if (ws && ws["!fullref"]) {
          const voll = XLSX.utils.decode_range(ws["!fullref"]);
          if (voll.e.r + 1 > lesegrenze) throw zuViele(bn);
        }
        const daten = (ws && ws["!data"]) || [];
        /* Gelesene Zeilenpositionen jenseits der Lesegrenze: Überschreitung, kein Teilergebnis. */
        if (daten.length > lesegrenze) throw zuViele(bn);
        const roh = [];
        for (let r = 0; r < daten.length; r++) {
          const zr = daten[r];
          const zeile = [];
          if (zr) for (let c = 0; c < zr.length; c++) zeile.push(zelle(zr[c], versatz));
          roh.push(zeile);
        }
        /* SheetJS entschlüsselt XML-Zeichen in ODS-Blattnamen nicht (z. B. &amp;); hier nachgeholt. */
        const anzeige = format === "ods"
          ? bn.replace(/&(lt|gt|quot|apos|amp);/g, (_, e) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[e])
          : bn;
        blaetter.push({ name: anzeige, roh });
      });
    }

    if (blaetter.length > g.blaetter) throw abbruch("ZU_VIELE_BLAETTER", `Die Datei hat zu viele Tabellenblätter (erlaubt sind höchstens ${g.blaetter} Blätter).`);

    const aus = [];
    for (const b of blaetter) {
      const { zeilen, hinweise: h } = bereinige(b.name, b.roh, g);
      hinweise.push(...h);
      gesamtZellen += zeilen.length * (zeilen[0] ? zeilen[0].length : 0);
      if (gesamtZellen > g.zellen) throw abbruch("ZU_VIELE_ZELLEN", `Die Datei enthält zu viele Zellen (erlaubt sind höchstens ${g.zellen.toLocaleString("de-DE")} Zellen insgesamt).`);
      aus.push({ name: b.name, zeilen });
    }
    if (aus.every((b) => b.zeilen.length === 0)) return fehler("LEER", "Die Datei enthält keine Daten.");

    if (ext && !ENDUNGEN[format].includes(ext)) {
      hinweise.unshift(hinweis("ENDUNG_ABWEICHEND", `Die Dateiendung „.${ext}“ passt nicht zum Inhalt; die Datei wurde als ${format.toUpperCase()} gelesen.`));
    }
    return datumssystem ? { ok: true, format, datumssystem, blaetter: aus, hinweise } : { ok: true, format, blaetter: aus, hinweise };
  } catch (x) {
    if (x instanceof Abbruch) return fehler(x.code, x.message);
    return fehler("BESCHAEDIGT", "Die Datei konnte nicht gelesen werden.");
  }
}
