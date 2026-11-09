/* ==========================================================================
   IMP-2 — Kern des Import-Parsers (synchron, läuft im Worker-Thread).
   Vertrag: docs/acc45/IMPORT-VERTRAG.md

   - Format wird über den Inhalt erkannt (Magic Bytes, ZIP-Verzeichnis,
     [Content_Types].xml, CFB-Verzeichnis) und zwar so, wie SheetJS es täte,
     nicht über die Dateiendung. Die Endung erzeugt höchstens einen Hinweis.
   - Unterstützt: xlsx (auch xlsm, Makros werden nie gelesen), xls (CFB/BIFF),
     CSV/TSV. ODS, xlsb, Vorlagen, Add-ins, Numbers und andere Pakete:
     NICHT_UNTERSTUETZT (Review 8725dc5, E1/E3).
   - ZIP-Container (xlsx): Verzeichnis lesen, Summe der erklärten
     unkomprimierten Größen und Kompressionsverhältnis prüfen, dann jeden
     Eintrag mit hartem Ausgabelimit probeweise entpacken (lügende Header),
     Kodierung und Blatt-XML prüfen, erst danach übernimmt SheetJS.
   - CFB (xls): Kopf, Sektorketten und Stromgrößen werden vor SheetJS geprüft (E2).
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
  /* Review 1da3ceb H2: Höchstlänge je Zelle wie in Excel; die Gesamtmenge Text ist durch entpacktBytes begrenzt. */
  zellZeichen: 32767,
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
  csv: ["csv", "tsv", "txt", "tab"],
  tsv: ["csv", "tsv", "txt", "tab"],
};
const UNTERSTUETZT = "Unterstützt werden Excel (.xlsx, .xls) sowie CSV und TSV (Text).";
/* Review 8725dc5, E1: ODS wird derzeit nicht unterstützt (die Prüfung von ODS-Paketen ist nicht zuverlässig genug). */
const ODS_NICHT = "OpenDocument-Tabellen (ODS) werden derzeit nicht unterstützt; bitte als XLSX oder CSV speichern.";
const XLSB_NICHT = "Das Binärformat .xlsb wird nicht unterstützt. Bitte in Excel als .xlsx speichern. ";
/* Review 8725dc5, E5: Excel erlaubt höchstens 31 Zeichen je Blattname. */
const BLATTNAME_MAX = 31;

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

/* Review 1da3ceb M2: Eintragsnamen so normalisieren, wie SheetJS sie ablegt und sucht
   (cfb_add: "Root Entry/" + Name mit "//" → "/"; safegetzipfile: ohne Groß-/Kleinschreibung,
   "\" gleich "/"). Führendes "/" entfällt, Folgen von "/" werden zu einem. Steuerzeichen
   U+0000–U+0006 (von CFB.find ersetzt bzw. entfernt) und "\" machen Namen mehrdeutig → BESCHAEDIGT.
   Die Bytes 0x00–0x06 und 0x5C kommen in UTF-8 nie als Folgebyte vor; die Prüfung je Byte ist genau. */
function normiereName(nameBytes) {
  for (const b of nameBytes) {
    if (b <= 0x06 || b === 0x5c) throw kaputt("unzulässiges Zeichen im Eintragsnamen");
  }
  const n = nameBytes.toString("latin1").replace(/\/{2,}/g, "/").replace(/^\//, "");
  if (n === "") throw kaputt("Eintrag ohne Namen");
  return Buffer.from(n, "latin1");
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
    const normBytes = normiereName(nameBytes);
    const name = normBytes.toString("utf8");
    /* SheetJS sucht Bestandteile auch ohne Beachtung der Groß-/Kleinschreibung. */
    const schluessel = normBytes.toString("latin1").toLowerCase();
    if (gesehen.has(schluessel)) throw kaputt("doppelter Eintragsname");
    gesehen.add(schluessel);
    summe += erklaert;
    if (summe > g.entpacktBytes) throw zipAbbruchEntpackt(g);
    eintraege.push({ name, nameBytes, normBytes, flags, methode, crc, komprimiert, erklaert, lokal });
    p += 46 + nl + el + kl;
  }
  if (p !== ende) throw kaputt("Archivverzeichnis enthält mehr Daten als Einträge");
  if (summe > MB && summe / Math.max(1, L) > g.kompressionsverhaeltnis) {
    throw abbruch("KOMPRESSION_VERDAECHTIG", "Die Datei ist ungewöhnlich stark komprimiert (Verdacht auf eine präparierte Archivdatei) und wird aus Sicherheitsgründen nicht verarbeitet.");
  }
  return { eintraege, cdVersatz };
}

/* ---------------------- Blatt-XML streng vorprüfen (xlsx) -----------------
   Review 1da3ceb M1: Die Vorzählung folgt genau dem Lesepfad von SheetJS
   (parse_ws_xml / parse_ws_xml_data / parsexmltag in vendor/sheetjs/xlsx.mjs)
   und weist jede Abweichung ab, statt sie anders zu deuten als SheetJS:
   - sheetData wie str_match_xml_ns: erstes <…sheetData…> bis zum ersten </…sheetData>;
   - Zeilenblöcke: Trennung an </…row>; das „Zeilenelement“ ist (wie bei SheetJS) das
     Element vor dem ersten nicht selbstschließenden „>“ des Blocks; es muss row heißen;
   - Attribute wie parsexmltag (Namensraum-Präfix entfällt, „_…“ entfällt, Groß-/Klein-
     schreibung zählt doppelt): jedes Attribut höchstens einmal;
   - row r: nur Ziffern (mit oder ohne Anführungszeichen), mindestens 1;
   - c r: nur [A-Z]+ gefolgt von Ziffern, Zeile mindestens 1, Spalte höchstens XFD.
   Entitäten (z. B. &#53;) dekodiert SheetJS in Attributen nicht; sie sind damit keine Ziffern.
   Review 8725dc5, E7 (Spalten-Fallback): SheetJS bestimmt die Spalte einer Zelle mit dem
   ungebundenen Muster r="…" über den GANZEN Zelltext (also auch aus xr="…" oder aus einem
   Kindelement) und nimmt sie für Zellen ohne r-Attribut. Einfachster sicherer Weg: abweisen.
   Hat die Zelle ein r-Attribut, muss der erste Treffer des Musters genau dieser Wert sein;
   ohne r-Attribut darf es keinen Treffer geben, und die fortlaufende Spalte bleibt ≤ XFD. */
const ATTR_RE = /\s([^"\s?>/]+)\s*=\s*((?:")([^"]*)(?:")|(?:')([^']*)(?:')|([^'">\s]+))/g; /* = attregexg */
const ZEILENENDE_RE = /<\/(?:\w+:)?row>/;
const ZELLE_RE = /<(?:\w+:)?c[ />]/;
const ZELL_R_RE = /r=["']([^"']*)["']/; /* = rregex in parse_ws_xml_data */
const SPALTEN_MAX = 16384; /* XFD */
const SHEETDATA_AUF = /<(?:\w+:)?sheetData\b[^<>]*>/g;
const SHEETDATA_ZU = /<\/(?:\w+:)?sheetData>/g;
const blattFehler = (detail) => kaputt(`Tabellenblatt: ${detail}`);

/** Schlüssel, unter dem parsexmltag ein Attribut ablegt (klein geschrieben). */
function attributSchluessel(q) {
  const j = q.indexOf(":");
  let k;
  if (j < 0) k = q.indexOf("_") > 0 ? q.slice(0, q.indexOf("_")) : q;
  else k = (j === 5 && q.slice(0, 5) === "xmlns" ? "xmlns" : "") + q.slice(j + 1);
  return k.toLowerCase();
}

/** Attribute eines Start-Tags wie parsexmltag; doppelte Schlüssel → BESCHAEDIGT. */
function attribute(tag) {
  const aus = new Map();
  /* parsexmltag liest Attribute nur, wenn der Tag ein Leerzeichen, LF oder CR enthält */
  if (!/[ \n\r]/.test(tag)) return aus;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(tag))) {
    const cc = m[0].slice(1);
    let c = cc.indexOf("=");
    const q = cc.slice(0, c).trim();
    while (cc.charCodeAt(c + 1) === 32) ++c;
    const quot = cc.charCodeAt(c + 1) === 34 || cc.charCodeAt(c + 1) === 39 ? 1 : 0;
    const k = attributSchluessel(q);
    if (aus.has(k)) throw blattFehler("doppeltes Attribut");
    aus.set(k, cc.slice(c + 1 + quot, cc.length - quot));
  }
  return aus;
}

/** Zeile und Spalte (1-basiert) aus einem c-r-Wert („B12“); ungültig → BESCHAEDIGT. */
function zellPosition(r) {
  const m = /^([A-Z]+)([0-9]+)$/.exec(r);
  if (!m) throw blattFehler("ungültiger Zellbezug");
  let spalte = 0;
  for (const ch of m[1]) { spalte = spalte * 26 + (ch.charCodeAt(0) - 64); if (spalte > SPALTEN_MAX) throw blattFehler("Spalte außerhalb von XFD"); }
  const zeile = parseInt(m[2], 10);
  if (!(zeile >= 1)) throw blattFehler("ungültiger Zellbezug");
  return { zeile, spalte };
}

/* Review 8725dc5, E4/E6: XML-Bestandteile müssen UTF-8 sein, so wie SheetJS sie erwartet.
   SheetJS (cc2str) dekodiert einen Teil als UTF-16, wenn er mit FF FE beginnt oder an Stelle 1–2
   FE FF trägt; sonst liest es die Bytes und dekodiert Texte später als UTF-8. Jede BOM außer der
   UTF-8-BOM, ungültiges UTF-8 und eine XML-Deklaration mit anderer Kodierung → BESCHAEDIGT. */
const UTF8_STRENG = new TextDecoder("utf-8", { fatal: true });
function hatUtf16Bom(b) {
  return (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff) || (b[1] === 0xfe && b[2] === 0xff);
}
function pruefeUtf8Xml(b) {
  try { UTF8_STRENG.decode(b); } catch { throw kaputt("Bestandteil nicht UTF-8-kodiert"); }
  const kopf = b.subarray(0, 256).toString("latin1").replace(/^\xef\xbb\xbf/, "");
  const dekl = /^\s*<\?xml\b[^>]*?\bencoding\s*=\s*["']([^"']*)["']/i.exec(kopf);
  if (dekl && !/^utf-?8$/i.test(dekl[1].trim())) throw kaputt("Bestandteil nicht UTF-8-kodiert");
}
const istXmlArtig = (b) => /^(?:\xef\xbb\xbf)?\s*</.test(b.subarray(0, 64).toString("latin1"));

/** Text eines (geprüften, UTF-8-kodierten) XML-Bestandteils so, wie SheetJS ihn liest: die Bytes. */
const xmlText = (b) => b.toString("latin1");

/**
 * Prüft das sheetData eines Blatt-XML streng und liefert die höchste Zeilenposition
 * (Zeilen- und Zellbezüge). Kein sheetData → 0.
 */
export function pruefeBlattXml(xml) {
  SHEETDATA_AUF.lastIndex = 0;
  const auf = SHEETDATA_AUF.exec(xml);
  if (!auf) return 0;
  SHEETDATA_ZU.lastIndex = SHEETDATA_AUF.lastIndex;
  const zu = SHEETDATA_ZU.exec(xml);
  if (!zu) return 0;
  const daten = xml.slice(SHEETDATA_AUF.lastIndex, zu.index);
  let tagr = 0, max = 0;
  for (const block of daten.split(ZEILENENDE_RE)) {
    const x = block.trim();
    const xlen = x.length;
    if (xlen === 0) continue;
    let rstarti = 0, ri = 0;
    for (ri = 0; ri < xlen; ++ri) {
      const ch = x[ri];
      if (ch === ">") { if (x[ri - 1] !== "/") { ++ri; break; } } else if (ch === "<") rstarti = ri;
    }
    const kopf = x.slice(rstarti, ri);
    if (!/^<(?:[^\s<>/:]+:)?row(?=[\s/>]|$)/.test(kopf)) throw blattFehler("unerwartetes Element statt einer Zeile");
    const za = attribute(kopf);
    if (za.has("r")) {
      const v = za.get("r");
      if (!/^[0-9]+$/.test(v) || !(parseInt(v, 10) >= 1)) throw blattFehler("ungültige Zeilennummer");
      tagr = parseInt(v, 10);
    } else tagr += 1;
    if (tagr > max) max = tagr;
    /* Zellen wie parse_ws_xml_data: Teilung an <c…, führende Elementblöcke entfallen */
    let zellen = x.slice(ri).split(ZELLE_RE);
    let rs = 0;
    for (; rs < zellen.length; ++rs) if (zellen[rs].trim().charAt(0) !== "<") break;
    zellen = zellen.slice(rs);
    let tagc = -1;
    for (const roh of zellen) {
      let z = roh.trim();
      if (z.length === 0) continue;
      const muster = ZELL_R_RE.exec(z);
      z = "<c " + (z.slice(0, 1) === "<" ? ">" : "") + z;
      const ende = z.indexOf(">");
      const ca = attribute(ende < 0 ? z : z.slice(0, ende + 1));
      if (ca.has("r")) {
        const pos = zellPosition(ca.get("r"));
        if (!muster || muster[1] !== ca.get("r")) throw blattFehler("mehrdeutiger Zellbezug");
        if (pos.zeile > max) max = pos.zeile;
        tagc = pos.spalte - 1;
      } else {
        if (muster) throw blattFehler("fremder Spaltenbezug in einer Zelle ohne Zellbezug");
        if (++tagc >= SPALTEN_MAX) throw blattFehler("Spalte außerhalb von XFD");
      }
    }
  }
  return max;
}

/** Prüft und entpackt jeden Eintrag selbst; Ist-Größe, CRC, Gesamtbudget, Kodierung, Blatt-XML;
    liefert die geprüften Inhalte. Einträge mit Endung .bin gehen nicht in das saubere Archiv (E3/E4). */
function pruefeEintraege(buf, verzeichnis, g) {
  const { eintraege, cdVersatz } = verzeichnis;
  const inhalte = new Map();
  const teile = [];
  const ausgelassen = [];
  let entpackt = 0;
  let zeilenMax = 0;
  let inhaltsFehler = null, ctFehler = null;
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
    /* SheetJS sucht Bestandteile ohne Beachtung der Groß-/Kleinschreibung (safegetzipfile). */
    const klein = e.name.toLowerCase();
    if (klein === "mimetype") inhalte.set("mimetype", aus.toString("utf8"));
    /* Review 8725dc5, E3/E4: Teile mit Endung .bin liest SheetJS binär (parse_ws_bin, parse_sst_bin, …).
       Sie werden nicht geprüft und erreichen SheetJS nie (vbaProject.bin, printerSettings*.bin und
       eingebettete Objekte braucht das Lesen der Tabellendaten nicht). */
    if (klein.endsWith(".bin")) { ausgelassen.push(e.name); continue; }
    /* Inhaltsprüfungen (Kodierung, Blatt-XML): der erste Befund wird gemerkt und erst nach der
       Formatbestimmung gemeldet, damit z. B. eine ODS-Datei immer NICHT_UNTERSTUETZT ergibt. */
    if (!inhaltsFehler) {
      try {
        /* E4/E6: jede Kodierung außer UTF-8 → BESCHAEDIGT, bevor SheetJS den Teil sieht. */
        if (hatUtf16Bom(aus)) throw kaputt("Bestandteil nicht UTF-8-kodiert");
        /* Befund 2 / Review 1da3ceb M1 / Review 8725dc5 E4: JEDER Teil mit sheetData-Inhalt wird als Blatt
           geprüft, unabhängig von seiner Endung (SheetJS liest Blätter über die Beziehungen der Mappe). */
        const hatBlatt = aus.includes("sheetData", 0, "latin1");
        if (hatBlatt || istXmlArtig(aus)) pruefeUtf8Xml(aus);
        if (hatBlatt) {
          const z = pruefeBlattXml(xmlText(aus));
          if (z > zeilenMax) zeilenMax = z;
        }
      } catch (x) {
        if (!(x instanceof Abbruch)) throw x;
        inhaltsFehler = x;
      }
    }
    if (klein === "[content_types].xml") {
      inhalte.set("[Content_Types].xml", aus.toString("utf8"));
      /* Das Inhaltsverzeichnis wird zur Formatbestimmung gelesen; seine Kodierung zählt dafür sofort. */
      if (hatUtf16Bom(aus)) ctFehler = kaputt("Bestandteil nicht UTF-8-kodiert");
      else try { pruefeUtf8Xml(aus); } catch (x) { ctFehler = x; }
    }
    teile.push({ nameBytes: e.normBytes, daten: aus, crc: e.crc });
  }
  return { inhalte, teile, entpackt, zeilenMax, ausgelassen, inhaltsFehler, ctFehler };
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
 * Strikte ZIP-Prüfung (läuft vor SheetJS). Wirft Abbruch bei jedem Widerspruch im Archivaufbau.
 * Liefert { namen, klein, inhalte, sauber, entpackt, zeilenMax, ausgelassen, inhaltsFehler };
 * `sauber` ist das einzige Archiv, das an SheetJS weitergegeben wird (ohne .bin-Teile).
 * `inhaltsFehler` ist der erste Befund der Inhaltsprüfung (Kodierung, Blatt-XML); erkenne()
 * meldet ihn nach der Formatbestimmung.
 */
export function pruefeZip(buf, grenzen) {
  const g = { ...STANDARD_GRENZEN, ...(grenzen || {}) };
  const verzeichnis = liesZipVerzeichnis(buf, g);
  const geprueft = pruefeEintraege(buf, verzeichnis, g);
  const namen = verzeichnis.eintraege.map((e) => e.name);
  const sauber = baueSauberesZip(geprueft.teile);
  geprueft.teile = null; /* entpackte Einzelpuffer freigeben, nur das neue Archiv bleibt */
  return {
    namen, klein: new Set(namen.map((n) => n.toLowerCase())), inhalte: geprueft.inhalte, sauber,
    entpackt: geprueft.entpackt, zeilenMax: geprueft.zeilenMax, ausgelassen: geprueft.ausgelassen,
    inhaltsFehler: geprueft.inhaltsFehler, ctFehler: geprueft.ctFehler,
  };
}

/* ------------------- Paketprüfung xlsx ([Content_Types].xml) --------------
   Review 8725dc5, E3/E4: Das Format wird bestimmt wie in SheetJS parse_zip:
   META-INF/manifest.xml oder objectdata.xml → ODS-Leser; Index/Document.iwa → Numbers;
   ohne [Content_Types].xml → kein OOXML (Numbers 08/09, verschachteltes Index.zip, …).
   Danach liest SheetJS die Arbeitsmappe aus dem ERSTEN Override mit Arbeitsmappen-Inhaltstyp
   (parse_ct) und behandelt sie als xlsb, wenn ihr Pfad auf „bin“ endet. Strikt zugelassen ist
   hier genau ein solcher Override mit dem xlsx-Typ (oder dem Makro-Typ, siehe unten). */
const TAG_RE = /<[/?]?[a-zA-Z0-9:_-]+(?:\s+[^"\s?<>/]+\s*=\s*(?:"[^"]*"|'[^']*'|[^'"<>\s=]+))*\s*[/?]?>/mg; /* = tagregex1 */
const XMLNS_CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const MAPPEN_TYPEN = {
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": "xlsx",
  "application/vnd.ms-excel.sheet.macroEnabled.main+xml": "xlsm",
  "application/vnd.ms-excel.sheet.binary.macroEnabled.main": "xlsb",
  "application/vnd.ms-excel.addin.macroEnabled.main+xml": "xlam",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": "xltx",
}; /* = alle Arbeitsmappen-Typen in ct2type */

/** Attribute eines Tags genau wie SheetJS parsexmltag (letzter Wert gewinnt, Schlüssel auch klein). */
function xmlTag(tag) {
  const z = Object.create(null);
  let eq = 0;
  for (; eq !== tag.length; ++eq) { const c = tag.charCodeAt(eq); if (c === 32 || c === 10 || c === 13) break; }
  z[0] = tag.slice(0, eq);
  if (eq === tag.length) return z;
  for (const m of tag.match(ATTR_RE) || []) {
    const cc = m.slice(1);
    let c = cc.indexOf("=");
    let q = cc.slice(0, c).trim();
    while (cc.charCodeAt(c + 1) === 32) ++c;
    const quot = cc.charCodeAt(c + 1) === 34 || cc.charCodeAt(c + 1) === 39 ? 1 : 0;
    const v = cc.slice(c + 1 + quot, cc.length - quot);
    const j = q.indexOf(":");
    if (j < 0) {
      if (q.indexOf("_") > 0) q = q.slice(0, q.indexOf("_"));
      z[q] = v; z[q.toLowerCase()] = v;
    } else {
      const k = (j === 5 && q.slice(0, 5) === "xmlns" ? "xmlns" : "") + q.slice(j + 1);
      if (z[k] && q.slice(j - 3, j) === "ext") continue;
      z[k] = v; z[k.toLowerCase()] = v;
    }
  }
  return z;
}

/** Liest [Content_Types].xml wie parse_ct; liefert { xmlns, mappen: [{ pfad, art }] }. */
function liesInhaltstypen(text) {
  let xmlns;
  const mappen = [];
  for (const tag of text.match(TAG_RE) || []) {
    try { attribute(tag); } catch { throw kaputt("Inhaltsverzeichnis des Pakets mit doppeltem Attribut"); }
    const y = xmlTag(tag);
    const art = y[0].replace(/<\w*:/, "<");
    if (art === "<Types") xmlns = y["xmlns" + (y[0].match(/<(\w+):/) || ["", ""])[1]];
    else if (art === "<Override" && Object.prototype.hasOwnProperty.call(MAPPEN_TYPEN, y.ContentType)) {
      mappen.push({ pfad: String(y.PartName ?? ""), art: MAPPEN_TYPEN[y.ContentType] });
    }
  }
  return { xmlns, mappen };
}

/** Bestimmt das Format eines geprüften ZIP-Pakets wie SheetJS und prüft das Paket strikt (E1, E3, E4). */
function erkennePaket(p) {
  const hat = (n) => p.klein.has(n.toLowerCase());
  const mime = p.inhalte.get("mimetype");
  if (mime !== undefined && mime.trim() !== "application/vnd.oasis.opendocument.spreadsheet") {
    throw abbruch("NICHT_UNTERSTUETZT", "Dies ist ein OpenDocument-Dokument, aber keine Tabelle. " + UNTERSTUETZT);
  }
  if (mime !== undefined || hat("META-INF/manifest.xml") || hat("objectdata.xml")) throw abbruch("NICHT_UNTERSTUETZT", ODS_NICHT);
  if (hat("Index/Document.iwa")) throw abbruch("NICHT_UNTERSTUETZT", "Apple-Numbers-Dateien werden nicht unterstützt. " + UNTERSTUETZT);
  const keineTabelle = () => abbruch("NICHT_UNTERSTUETZT", "Der Inhalt der Datei ist keine unterstützte Tabelle (z. B. ein Textdokument oder eine Präsentation). " + UNTERSTUETZT);
  const ct = p.inhalte.get("[Content_Types].xml");
  if (ct === undefined) throw keineTabelle();
  if (p.ctFehler) throw p.ctFehler;
  const { xmlns, mappen } = liesInhaltstypen(ct);
  if (mappen.length === 0) throw keineTabelle();
  if (mappen.length > 1) throw kaputt("mehrere Arbeitsmappen im Paket");
  const { pfad, art } = mappen[0];
  if (art === "xlsb") throw abbruch("NICHT_UNTERSTUETZT", XLSB_NICHT + UNTERSTUETZT);
  if (art === "xlam" || art === "xltx") {
    throw abbruch("NICHT_UNTERSTUETZT", "Excel-Vorlagen und Add-ins werden nicht unterstützt. Bitte als normale Arbeitsmappe (.xlsx) speichern. " + UNTERSTUETZT);
  }
  if (xmlns !== XMLNS_CT) throw kaputt("Inhaltsverzeichnis des Pakets");
  const datei = pfad.replace(/^\//, "");
  if (datei.slice(-3).toLowerCase() === "bin") throw abbruch("NICHT_UNTERSTUETZT", XLSB_NICHT + UNTERSTUETZT);
  if (!hat(datei)) throw kaputt("Arbeitsmappe fehlt");
  /* Makro-Arbeitsmappe (xlsm): gelesen werden nur die Tabellendaten; Makros nie (bookVBA: false,
     vbaProject.bin erreicht SheetJS nicht), Hinweis MAKROS_VERWORFEN. */
  return { format: "xlsx", makroTyp: art === "xlsm" };
}

/* --------------------------- CFB-Prüfung (xls) ----------------------------
   Review 8725dc5, E2: XLS bleibt unterstützt, aber nur mit plausibler CFB-Struktur. Geprüft
   wird vor SheetJS (Aufbau wie CFB.parse in vendor/sheetjs/xlsx.mjs):
   - Kopf: Signatur, Version 3/4 mit Sektorgröße 512/4096, Mini-Sektor 64, reservierte Bytes 0,
     Grenze für Mini-Ströme 4096, Zählerfelder im Bereich der Datei;
   - Sektorketten (Verzeichnis, Mini-FAT, Mini-Strom, jeder Strom ab 4096 Byte) laufen nur über
     vorhandene Sektoren, ohne Zyklus (SheetJS get_sector_list folgt einer Kette ohne Zykluserkennung)
     und ohne Sektoren, die schon zu einer anderen Kette gehören;
   - jede erklärte Stromgröße passt in ihre Kette; die Summe aller Stromgrößen liegt innerhalb
     von entpacktBytes (Größenbudget vor dem Lesen);
   - es gibt einen Tabellenstrom „Workbook“ oder „Book“; sonst NICHT_UNTERSTUETZT. */
const CFB_ENDE = -2;
function pruefeCfb(buf, g) {
  const L = buf.length;
  if (L < 512) throw kaputt("Dateikopf unvollständig");
  const major = buf.readUInt16LE(0x1a), shift = buf.readUInt16LE(0x1e);
  if (!((major === 3 && shift === 9) || (major === 4 && shift === 12))) throw kaputt("Sektorgröße");
  if (buf.readUInt16LE(0x20) !== 6) throw kaputt("Mini-Sektorgröße");
  for (let i = 0x22; i < 0x28; i++) if (buf[i] !== 0) throw kaputt("Dateikopf");
  const ssz = 1 << shift;
  if (L < 2 * ssz) throw kaputt("Dateikopf unvollständig");
  if (major === 3 && buf.readInt32LE(0x28) !== 0) throw kaputt("Dateikopf");
  if (buf.readUInt32LE(0x38) !== 4096) throw kaputt("Dateikopf");
  const nsec = Math.ceil(L / ssz) - 1; /* wie sectorify; der letzte Sektor darf kürzer sein */
  const anzahlFat = buf.readInt32LE(0x2c), dirStart = buf.readInt32LE(0x30);
  const miniStart = buf.readInt32LE(0x3c), anzahlMini = buf.readInt32LE(0x40);
  const difatStart = buf.readInt32LE(0x44), anzahlDifat = buf.readInt32LE(0x48);
  const imBereich = (s) => Number.isInteger(s) && s >= 0 && s < nsec;
  if (anzahlFat < 1 || anzahlFat > nsec || anzahlDifat < 0 || anzahlDifat > nsec || anzahlMini < 0 || anzahlMini > nsec) throw kaputt("Dateikopf");
  if (!imBereich(dirStart)) throw kaputt("Verzeichnis außerhalb der Datei");
  if (anzahlMini > 0 && miniStart !== CFB_ENDE && !imBereich(miniStart)) throw kaputt("Verzeichnis außerhalb der Datei");
  const lies = (sektor, versatz) => {
    const o = (sektor + 1) * ssz + versatz;
    return o + 4 <= L ? buf.readInt32LE(o) : null;
  };
  /* FAT-Sektoren: Kopf (bis zum ersten negativen Wert) und DIFAT-Kette wie sleuth_fat */
  const fat = [];
  for (let j = 0; j < 109; j++) { const q = buf.readInt32LE(0x4c + 4 * j); if (q < 0) break; fat.push(q); }
  const difatGesehen = new Set();
  for (let idx = difatStart, rest = anzahlDifat; idx !== CFB_ENDE && idx !== -1;) {
    if (!imBereich(idx) || difatGesehen.has(idx)) throw kaputt("Sektorliste fehlerhaft");
    difatGesehen.add(idx);
    for (let i = 0; i < (ssz >>> 2) - 1; i++) { const q = lies(idx, i * 4); if (q === null || q === CFB_ENDE) break; fat.push(q); }
    if (rest < 1) break;
    rest -= 1;
    idx = lies(idx, ssz - 4);
    if (idx === null) break;
  }
  if (fat.length === 0 || !imBereich(fat[0])) throw kaputt("Sektorliste fehlerhaft");
  const belegt = new Set();
  /** Folgt einer Sektorkette wie get_sector_list, aber mit Zyklus-, Bereichs- und Doppelprüfung. */
  const kette = (start) => {
    let n = 0;
    for (let j = start; j >= 0;) {
      if (!imBereich(j)) throw kaputt("Sektorverweis außerhalb der Datei");
      if (belegt.has(j)) throw kaputt("zyklische oder doppelt genutzte Sektorkette");
      belegt.add(j); n++;
      const addr = fat[Math.floor((j * 4) / ssz)];
      if (!imBereich(addr)) break;
      const naechster = lies(addr, (j * 4) & (ssz - 1));
      if (naechster === null) break;
      j = naechster;
    }
    return n;
  };
  const dirSektoren = kette(dirStart);
  if (anzahlMini > 0 && miniStart !== CFB_ENDE) kette(miniStart);
  const namen = [];
  let summe = 0;
  for (let i = 0, s = dirStart; i < dirSektoren; i++) {
    const basis = (s + 1) * ssz;
    for (let k = 0; k < ssz; k += 128) {
      const p = basis + k;
      if (p + 128 > L) break;
      const typ = buf[p + 66], start = buf.readInt32LE(p + 116), groesse = buf.readInt32LE(p + 120);
      const nl = Math.min(buf.readUInt16LE(p + 64), 64);
      if (i === 0 && k === 0 && typ !== 5) throw kaputt("Stammeintrag fehlt");
      if (groesse < 0 && start < 0) continue;
      if (typ === 5) {
        if (anzahlMini > 0 && start !== CFB_ENDE && groesse > 0) {
          const n = kette(start);
          if (n * ssz < groesse) throw kaputt("Stromgröße passt nicht zur Sektorkette");
        }
        continue;
      }
      if (groesse >= 4096) {
        const n = kette(start);
        if (n * ssz < groesse) throw kaputt("Stromgröße passt nicht zur Sektorkette");
      }
      if (groesse > 0) {
        summe += groesse;
        if (summe > g.entpacktBytes) throw zipAbbruchEntpackt(g);
      }
      if (typ === 2) namen.push(buf.toString("utf16le", p, p + nl).replace(/\0+$/, "").toLowerCase());
    }
    const addr = fat[Math.floor((s * 4) / ssz)];
    s = imBereich(addr) ? lies(addr, (s * 4) & (ssz - 1)) : -1;
  }
  return namen;
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
    const p = pruefeZip(buf, g);
    const { format, makroTyp } = erkennePaket(p);
    if (p.inhaltsFehler) throw p.inhaltsFehler;
    return { format, namen: p.namen, inhalte: p.inhalte, sauber: p.sauber, zeilenMax: p.zeilenMax, makroTyp, ausgelassen: p.ausgelassen };
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(OLE)) {
    if (buf.includes(U16("EncryptedPackage")) || buf.includes(U16("EncryptionInfo"))) {
      throw abbruch("PASSWORTGESCHUETZT", "Die Datei ist passwortgeschützt (verschlüsselt). Bitte ohne Passwort speichern und erneut hochladen.");
    }
    const stroeme = pruefeCfb(buf, g);
    if (!stroeme.includes("workbook") && !stroeme.includes("book")) {
      throw abbruch("NICHT_UNTERSTUETZT", "Der Inhalt der Datei ist keine Excel-Tabelle (z. B. ein Textdokument oder eine Präsentation). " + UNTERSTUETZT);
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

/* Review 1da3ceb H2: Ein Text aus sharedStrings ist im Worker EIN String, auf den beliebig
   viele Zellen verweisen. postMessage kopiert ihn je Zelle einzeln in den Hauptthread
   (1,1-MB-Datei, 1.000 Verweise: rund 1,4 GB). Deshalb wird vor der Rückgabe aus dem Worker
   die Textmenge des Ergebnisses gezählt: jede Zelle höchstens zellZeichen (32.767 wie Excel),
   alle Texte zusammen (Zellen, Datums-/Fehlertexte, Blattnamen) höchstens entpacktBytes Zeichen.
   Überschreitung → TEXT_ZU_GROSS ohne Teilergebnis.
   Review 8725dc5, E5: Hinweistexte (nachricht, blatt) zählen mit. */
function pruefeTextmenge(blaetter, hinweise, g) {
  const max = g.zellZeichen;
  const budget = g.entpacktBytes;
  let summe = 0;
  const zaehle = (s, istZelle) => {
    if (istZelle && s.length > max) {
      throw abbruch("TEXT_ZU_GROSS", `Eine Zelle enthält mehr als ${max.toLocaleString("de-DE")} Zeichen. Die Datei wird aus Sicherheitsgründen nicht verarbeitet.`);
    }
    summe += s.length;
    if (summe > budget) {
      throw abbruch("TEXT_ZU_GROSS", `Die Datei enthält insgesamt zu viel Text (mehr als ${budget.toLocaleString("de-DE")} Zeichen). Sie wird aus Sicherheitsgründen nicht verarbeitet.`);
    }
  };
  for (const b of blaetter) {
    zaehle(String(b.name), false);
    for (const zeile of b.zeilen) {
      for (const c of zeile) {
        if (typeof c === "string") zaehle(c, true);
        else if (c && typeof c === "object" && typeof c.text === "string") zaehle(c.text, true);
      }
    }
  }
  for (const h of hinweise) {
    zaehle(String(h.nachricht), false);
    if (typeof h.blatt === "string") zaehle(h.blatt, false);
  }
}

/** Review 8725dc5: bookType nach dem Lesen muss zum erkannten Format passen (SheetJS setzt bei xls keinen). */
export function buchtypPasst(format, bookType) {
  if (format === "xlsx") return bookType === "xlsx";
  if (format === "xls") return bookType === undefined;
  return false;
}

/* Review PR #123, Befund 3: Excel-Seriennummern im 1904-System liegen 1462 Tage
   unter denen des 1900-Systems. Umgerechnet wird genau einmal, und nur bei
   numerischen Zellen mit Datumsformat; gewöhnliche Zahlen und Text bleiben roh. */
const VERSATZ_1904 = 1462;

/* Review 1da3ceb H1: Der Parser ist die EINZIGE Stelle, die 1904 auf 1900 umrechnet.
   Verschoben werden nur Zahlen mit einem Format, das einen Datumsteil enthält (Tag, Jahr,
   Ära oder Monat). Reine Zeit- und Dauerformate (hh:mm, [h]:mm, mm:ss, AM/PM) bleiben
   unverändert: ihr Wert ist ein Tagesbruchteil bzw. eine Dauer und hängt nicht vom
   Datumssystem ab. Zerlegung des Formats wie SSF fmt_is_date (Anführungszeichen, \, _, *,
   [..], General, Zahlenblöcke werden übersprungen); „m“ ist Monat, wenn es mindestens
   dreimal steht oder das Format weder Stunden noch Sekunden kennt. */
export function hatDatumsteil(fmt) {
  const f = String(fmt);
  let zeit = false, monat = false;
  for (let i = 0; i < f.length;) {
    const c = f[i];
    const k = c.toLowerCase();
    if (c === '"') { const e = f.indexOf('"', i + 1); i = e < 0 ? f.length : e + 1; continue; }
    if (c === "\\" || c === "_" || c === "*") { i += 2; continue; }
    if (c === "[") {
      const e = f.indexOf("]", i);
      if (/^(h+|m+|s+)$/i.test(f.slice(i + 1, e < 0 ? f.length : e))) zeit = true;
      i = e < 0 ? f.length : e + 1; continue;
    }
    if (f.slice(i, i + 7).toLowerCase() === "general") { i += 7; continue; }
    if (f.slice(i, i + 5).toUpperCase() === "AM/PM") { zeit = true; i += 5; continue; }
    if (f.slice(i, i + 3).toUpperCase() === "A/P") { zeit = true; i += 3; continue; }
    if (f.slice(i, i + 5) === "上午/下午") { zeit = true; i += 5; continue; }
    if (c === "0" || c === "#" || c === ".") {
      i++;
      while (i < f.length && "0#?.,E+-%".includes(f[i])) i++;
      continue;
    }
    if (k === "d" || k === "y" || k === "e" || k === "g") return true;
    if (k === "b") return true; /* buddhistisches Jahr (b, b1, b2) */
    if (k === "h" || k === "s") { zeit = true; i++; continue; }
    if (k === "m") {
      let j = i;
      while (j < f.length && f[j].toLowerCase() === "m") j++;
      if (j - i >= 3) return true;
      monat = true; i = j; continue;
    }
    i++;
  }
  return monat && !zeit;
}

function zelle(c, versatz) {
  if (!c || c.t === "z") return null;
  switch (c.t) {
    case "n": {
      if (typeof c.v !== "number" || !Number.isFinite(c.v)) return { typ: "fehler", text: String(c.w ?? c.v) };
      if (c.z && typeof c.z === "string" && XLSX.SSF.is_date(c.z)) {
        return { typ: "datum", roh: hatDatumsteil(c.z) ? c.v + versatz : c.v, text: String(c.w ?? "") };
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
    let datumssystem, datumssystemQuelle;

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
        if (erk.makroTyp || erk.namen.some((n) => /(^|\/)vbaProject\.bin$/i.test(n) || /^(Scripts|Basic)\//.test(n)) ||
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
          /* Review 1da3ceb M1: kein sheetRows (SheetJS übersprang Zeilen jenseits davon still);
             es reichen die strenge Vorzählung und die Prüfung der gelesenen Zeilen. */
          sheetRows: 0,
          WTF: false,
        });
        erk.sauber = null;
      } catch (x) {
        if (/password|encrypt/i.test(String(x && x.message))) {
          throw abbruch("PASSWORTGESCHUETZT", "Die Datei ist passwortgeschützt. Bitte ohne Passwort speichern und erneut hochladen.");
        }
        throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt oder entspricht nicht dem erwarteten Format und kann nicht gelesen werden.");
      }
      /* Review 8725dc5: SheetJS muss im erkannten Format gelesen haben (z. B. nicht xlsb oder ods). */
      if (!wb || !buchtypPasst(format, wb.bookType)) {
        throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt oder entspricht nicht dem erwarteten Format und kann nicht gelesen werden.");
      }
      const namen = wb.SheetNames;
      if (!Array.isArray(namen) || namen.length === 0) throw abbruch("BESCHAEDIGT", "Die Datei enthält keine lesbaren Tabellenblätter.");
      if (namen.length > g.blaetter) throw abbruch("ZU_VIELE_BLAETTER", `Die Datei hat zu viele Tabellenblätter (erlaubt sind höchstens ${g.blaetter} Blätter).`);
      /* Review 8725dc5, E5: Blattnamen höchstens 31 Zeichen (Excel-Regel), geprüft bevor ein Name in
         einen Hinweis oder Fehlertext gelangt; die Meldung nennt den Namen nicht. */
      if (namen.some((bn) => typeof bn !== "string" || bn.length > BLATTNAME_MAX)) {
        throw abbruch("BESCHAEDIGT", `Die Datei ist beschädigt: ein Tabellenblatt hat einen ungültigen Namen (mehr als ${BLATTNAME_MAX} Zeichen).`);
      }
      /* Review 8725dc5, E3/E4: ein Blatt, das SheetJS nicht lesen konnte, wird nicht still leer geliefert.
         Verwies es auf einen ausgelassenen .bin-Teil, ist es ein binäres Blatt (xlsb). */
      if (format === "xlsx" && namen.some((bn) => !wb.Sheets[bn])) {
        if (erk.ausgelassen && erk.ausgelassen.length) throw abbruch("NICHT_UNTERSTUETZT", XLSB_NICHT + UNTERSTUETZT);
        throw abbruch("BESCHAEDIGT", "Die Datei ist beschädigt: ein Tabellenblatt kann nicht gelesen werden.");
      }
      const sheetInfos = (wb.Workbook && wb.Workbook.Sheets) || [];
      const d1904 = wb.Workbook && wb.Workbook.WBProps ? wb.Workbook.WBProps.date1904 : false;
      const ist1904 = d1904 === true || d1904 === 1 || /^(1|true)$/i.test(String(d1904 ?? "").trim());
      /* Review 1da3ceb H1: datumssystem beschreibt das ERGEBNIS (immer 1900, nach Umrechnung);
         die Herkunft steht in datumssystemQuelle. Folgeschritte rechnen nichts mehr um. */
      datumssystem = "1900";
      if (ist1904) {
        datumssystemQuelle = "1904";
        hinweise.push(hinweis("DATUMSSYSTEM_1904", "Die Datei verwendet das Datumssystem 1904. Datumswerte wurden auf das übliche Datumssystem 1900 umgerechnet (normalisiert).", { datumssystemQuelle: "1904" }));
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
        blaetter.push({ name: bn, roh });
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
      const zeige = ext.length > 10 ? `${ext.slice(0, 10)}…` : ext;
      hinweise.unshift(hinweis("ENDUNG_ABWEICHEND", `Die Dateiendung „.${zeige}“ passt nicht zum Inhalt; die Datei wurde als ${format.toUpperCase()} gelesen.`));
    }
    /* Review 1da3ceb H2 / 8725dc5 E5: Textmenge einschließlich aller Hinweise, als letzter Schritt. */
    pruefeTextmenge(aus, hinweise, g);
    if (!datumssystem) return { ok: true, format, blaetter: aus, hinweise };
    return datumssystemQuelle
      ? { ok: true, format, datumssystem, datumssystemQuelle, blaetter: aus, hinweise }
      : { ok: true, format, datumssystem, blaetter: aus, hinweise };
  } catch (x) {
    if (x instanceof Abbruch) return fehler(x.code, x.message);
    return fehler("BESCHAEDIGT", "Die Datei konnte nicht gelesen werden.");
  }
}
