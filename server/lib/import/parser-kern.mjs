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

/* ----------------------------- ZIP-Verzeichnis ---------------------------- */
function liesZipVerzeichnis(buf, g) {
  const min = Math.max(0, buf.length - 22 - 65535);
  let ende = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { ende = i; break; }
  }
  if (ende < 0) throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt oder unvollständig (Archivende nicht gefunden) und kann nicht gelesen werden.");
  const anzahl = buf.readUInt16LE(ende + 10);
  const cdGroesse = buf.readUInt32LE(ende + 12);
  const cdVersatz = buf.readUInt32LE(ende + 16);
  if (anzahl === 0xffff || cdGroesse === 0xffffffff || cdVersatz === 0xffffffff) {
    throw abbruch("NICHT_UNTERSTUETZT", "Diese Archivvariante (ZIP64) wird nicht unterstützt. " + UNTERSTUETZT);
  }
  if (anzahl > g.archivEintraege) {
    throw abbruch("ENTPACKT_ZU_GROSS", `Die Datei enthält ungewöhnlich viele Bestandteile (mehr als ${g.archivEintraege}). Sie wird aus Sicherheitsgründen nicht verarbeitet.`);
  }
  if (cdVersatz + cdGroesse > buf.length) {
    throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt oder unvollständig (Archivverzeichnis außerhalb der Datei) und kann nicht gelesen werden.");
  }
  const eintraege = [];
  let p = cdVersatz;
  let summe = 0;
  for (let i = 0; i < anzahl; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt (Archivverzeichnis fehlerhaft) und kann nicht gelesen werden.");
    }
    const flags = buf.readUInt16LE(p + 8);
    const methode = buf.readUInt16LE(p + 10);
    const komprimiert = buf.readUInt32LE(p + 20);
    const erklaert = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), kl = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    if (p + 46 + nl + el + kl > buf.length) {
      throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt (Archivverzeichnis abgeschnitten) und kann nicht gelesen werden.");
    }
    const name = buf.toString("utf8", p + 46, p + 46 + nl);
    summe += erklaert;
    eintraege.push({ name, flags, methode, komprimiert, erklaert, lokal });
    p += 46 + nl + el + kl;
  }
  if (summe > g.entpacktBytes) {
    throw abbruch("ENTPACKT_ZU_GROSS", `Die Datei würde entpackt größer als ${Math.round(g.entpacktBytes / MB)} MB. Sie wird aus Sicherheitsgründen nicht verarbeitet.`);
  }
  if (summe > MB && summe / Math.max(1, buf.length) > g.kompressionsverhaeltnis) {
    throw abbruch("KOMPRESSION_VERDAECHTIG", "Die Datei ist ungewöhnlich stark komprimiert (Verdacht auf eine präparierte Archivdatei) und wird aus Sicherheitsgründen nicht verarbeitet.");
  }
  return { eintraege, summe };
}

/** Prüft jeden Eintrag: Verschlüsselung, lokaler Kopf = Verzeichnis, Entpacken mit hartem Limit. */
function pruefeEintraege(buf, eintraege) {
  const inhalte = new Map();
  for (const e of eintraege) {
    if (e.flags & 1) throw abbruch("PASSWORTGESCHUETZT", "Die Datei ist passwortgeschützt. Bitte ohne Passwort speichern und erneut hochladen.");
    const lh = e.lokal;
    if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) {
      throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt (Archiveintrag fehlerhaft) und kann nicht gelesen werden.");
    }
    const lflags = buf.readUInt16LE(lh + 6);
    const lnl = buf.readUInt16LE(lh + 26), lel = buf.readUInt16LE(lh + 28);
    const lname = buf.toString("utf8", lh + 30, lh + 30 + lnl);
    if (lname !== e.name) throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt (widersprüchliche Archivangaben) und kann nicht gelesen werden.");
    if (!(lflags & 8)) {
      const lk = buf.readUInt32LE(lh + 18), lu = buf.readUInt32LE(lh + 22);
      if (lk !== e.komprimiert || lu !== e.erklaert) {
        throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt (widersprüchliche Größenangaben) und kann nicht gelesen werden.");
      }
    }
    const start = lh + 30 + lnl + lel;
    if (start + e.komprimiert > buf.length) throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt oder unvollständig und kann nicht gelesen werden.");
    const roh = buf.subarray(start, start + e.komprimiert);
    let aus;
    if (e.methode === 0) {
      if (e.komprimiert !== e.erklaert) throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt (Größenangaben) und kann nicht gelesen werden.");
      aus = roh;
    } else if (e.methode === 8) {
      try {
        aus = zlib.inflateRawSync(roh, { maxOutputLength: Math.max(1, e.erklaert) });
      } catch (x) {
        if (x && x.code === "ERR_BUFFER_TOO_LARGE") {
          throw abbruch("ENTPACKT_ZU_GROSS", "Die Größenangaben in der Datei stimmen nicht mit dem Inhalt überein (Verdacht auf eine präparierte Archivdatei). Sie wird nicht verarbeitet.");
        }
        throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt (Archivinhalt nicht entpackbar) und kann nicht gelesen werden.");
      }
      if (aus.length !== e.erklaert) throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt (Größenangaben) und kann nicht gelesen werden.");
    } else {
      throw abbruch("NICHT_UNTERSTUETZT", "Die Datei verwendet eine nicht unterstützte Komprimierung. " + UNTERSTUETZT);
    }
    if (e.name === "mimetype" || e.name === "[Content_Types].xml") inhalte.set(e.name, aus.toString("utf8"));
  }
  return inhalte;
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
    const { eintraege } = liesZipVerzeichnis(buf, g);
    const inhalte = pruefeEintraege(buf, eintraege);
    const namen = eintraege.map((e) => e.name);
    const mime = inhalte.get("mimetype");
    if (mime !== undefined) {
      if (mime.trim() === "application/vnd.oasis.opendocument.spreadsheet") return { format: "ods", namen, inhalte };
      throw abbruch("NICHT_UNTERSTUETZT", "Dies ist ein OpenDocument-Dokument, aber keine Tabelle. " + UNTERSTUETZT);
    }
    if (namen.includes("xl/workbook.bin")) {
      throw abbruch("NICHT_UNTERSTUETZT", "Das Binärformat .xlsb wird nicht unterstützt. Bitte in Excel als .xlsx speichern. " + UNTERSTUETZT);
    }
    if (namen.includes("xl/workbook.xml")) return { format: "xlsx", namen, inhalte };
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

function zelle(c) {
  if (!c || c.t === "z") return null;
  switch (c.t) {
    case "n": {
      if (typeof c.v !== "number" || !Number.isFinite(c.v)) return { typ: "fehler", text: String(c.w ?? c.v) };
      if (c.z && typeof c.z === "string" && XLSX.SSF.is_date(c.z)) {
        return { typ: "datum", roh: c.v, text: String(c.w ?? "") };
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
    let blaetter = [];
    let gesamtZellen = 0;

    if (format === "text") {
      const text = dekodiere(buf, hinweise);
      const trenner = waehleTrenner(text, ext);
      format = trenner === "\t" ? "tsv" : "csv";
      const roh = leseCsv(text, trenner, g).map((z) => z.map((s) => (s === "" ? null : s)));
      blaetter.push({ name: "Tabelle1", roh });
    } else {
      if (erk.namen.length) {
        if (erk.namen.some((n) => /(^|\/)vbaProject\.bin$/i.test(n) || /^(Scripts|Basic)\//.test(n)) ||
            /macroEnabled/i.test(erk.inhalte.get("[Content_Types].xml") || "")) {
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
        wb = XLSX.read(buf, {
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
          sheetRows: g.zeilen + 1 + 10000,
          WTF: false,
        });
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
      namen.forEach((bn, idx) => {
        const ws = wb.Sheets[bn];
        if (sheetInfos[idx] && sheetInfos[idx].Hidden) {
          hinweise.push(hinweis("AUSGEBLENDETES_BLATT", `Blatt „${bn}“ ist in der Datei ausgeblendet.`, { blatt: bn }));
        }
        if (ws && ws["!fullref"]) {
          const voll = XLSX.utils.decode_range(ws["!fullref"]);
          if (voll.e.r + 1 > g.zeilen + 1 + 10000) {
            throw abbruch("ZU_VIELE_ZEILEN", `Blatt „${bn}“ hat zu viele Zeilen (erlaubt sind höchstens ${g.zeilen} Zeilen je Tabelle, zusätzlich zur Kopfzeile).`);
          }
        }
        const daten = (ws && ws["!data"]) || [];
        const roh = [];
        for (let r = 0; r < daten.length; r++) {
          const zr = daten[r];
          const zeile = [];
          if (zr) for (let c = 0; c < zr.length; c++) zeile.push(zelle(zr[c]));
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
    return { ok: true, format, blaetter: aus, hinweise };
  } catch (x) {
    if (x instanceof Abbruch) return fehler(x.code, x.message);
    return fehler("BESCHAEDIGT", "Die Datei konnte nicht gelesen werden.");
  }
}
