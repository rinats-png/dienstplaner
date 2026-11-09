/* ==========================================================================
   IMP-2 — Import-Parser (docs/acc45/IMPORT-VERTRAG.md)
   Alle Testdateien sind synthetisch und entstehen zur Testlaufzeit.
   Kein Netzzugriff. SheetJS wird hier nur zum Erzeugen von Testdateien
   geschrieben, der Parser selbst liest nur.
   ========================================================================== */
import { describe, it, expect, vi } from "vitest";
import zlib from "node:zlib";
import { parseDatei, STANDARD_GRENZEN } from "../server/lib/import/parser.mjs";
import * as kern from "../server/lib/import/parser-kern.mjs";
import { mappe, zip, zipEintraege, cfbDatei, workbookStrom } from "./import-parser-hilfen.mjs";
import { poc561, cfbAbsteigendeFreieSektoren, cfbEintraege, cfbSetze, cfbIndex, cfbFatOrt } from "./import-parser-hilfen.mjs";

/* Review PR #123, Befund 5: explizites Zeitlimit je Test (Schwellen in den Tests bleiben unverändert). */
vi.setConfig({ testTimeout: 60000 });

const B = (s) => Buffer.from(s, "utf8");
const hat = (r, code) => (r.hinweise || []).some((h) => h.code === code);

describe("IMP-2 Vertrag: Form des Ergebnisses", () => {
  it("liefert { ok:true, format, blaetter:[{name,zeilen}], hinweise:[] }", async () => {
    const r = await parseDatei({ buffer: B("a;b\n1;2\n"), name: "x.csv" });
    expect(r.ok).toBe(true);
    expect(r.format).toBe("csv");
    expect(Array.isArray(r.blaetter)).toBe(true);
    expect(Array.isArray(r.hinweise)).toBe(true);
    expect(Object.keys(r).sort()).toEqual(["blaetter", "format", "hinweise", "ok"]);
  });
  it("Standardgrenzen laut Vertrag", () => {
    expect(STANDARD_GRENZEN).toMatchObject({
      dateiBytes: 10 * 1024 * 1024, entpacktBytes: 100 * 1024 * 1024,
      zeilen: 20000, spalten: 200, blaetter: 20,
    });
    expect(Object.isFrozen(STANDARD_GRENZEN)).toBe(true);
  });
  it("ungültige Eingabe: deutsche Meldung, kein Absturz", async () => {
    for (const e of [undefined, {}, { buffer: "text" }, { buffer: Buffer.alloc(0), name: "a.csv" }]) {
      const r = await parseDatei(e);
      expect(r.ok).toBe(false);
      expect(typeof r.code).toBe("string");
      expect(r.nachricht).toMatch(/[a-zäöü]{4,}/i);
    }
  });
});

describe("IMP-2 gültige Formate", () => {
  const inhalt = {
    Personal: [["Name", "Std", "Eintritt"], ["Anna", 38.5, "01.02.2020"], ["Bert", 20, "15.03.2021"]],
    "Stellen & Dienste": [["Kürzel", "Bezeichnung"], ["F", "Frühdienst"], ["S", "Spätdienst"]],
  };
  /* Review 8725dc5, E1: ODS wird nicht mehr unterstützt; die ODS-Ausprägung dieses Tests entfällt
     (Ersatz: „Review 8725dc5 E1: …“ prüft dieselbe Mappe als NICHT_UNTERSTUETZT). */
  for (const fmt of ["xlsx", "xls"]) {
    it(`${fmt}: mehrere Blätter mit Namen, Zahlen als Zahl, Text als Text`, async () => {
      const r = await parseDatei({ buffer: mappe(inhalt, fmt), name: `daten.${fmt}` });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(r.format).toBe(fmt);
      expect(r.blaetter.map((b) => b.name)).toEqual(["Personal", "Stellen & Dienste"]);
      expect(r.blaetter[0].zeilen[0]).toEqual(["Name", "Std", "Eintritt"]);
      expect(r.blaetter[0].zeilen[1]).toEqual(["Anna", 38.5, "01.02.2020"]);
      expect(r.blaetter[1].zeilen[2]).toEqual(["S", "Spätdienst"]);
    });
  }

  it("CSV mit Semikolon (Excel-Deutsch), Anführungszeichen, Zeilenumbruch in Zelle, BOM", async () => {
    const csv = "﻿Name;Notiz;Zahl\r\n\"Meier; Anna\";\"Zeile1\nZeile2\";\"1,5\"\r\nBert;\"sagt \"\"hi\"\"\";2\r\n";
    const r = await parseDatei({ buffer: B(csv), name: "p.csv" });
    expect(r.ok).toBe(true);
    expect(r.format).toBe("csv");
    expect(r.blaetter).toHaveLength(1);
    expect(r.blaetter[0].zeilen).toEqual([
      ["Name", "Notiz", "Zahl"],
      ["Meier; Anna", "Zeile1\nZeile2", "1,5"],
      ["Bert", 'sagt "hi"', "2"],
    ]);
  });
  it("CSV mit Komma", async () => {
    const r = await parseDatei({ buffer: B("a,b,c\n1,2,3\n4,5,6\n"), name: "p.csv" });
    expect(r.ok).toBe(true);
    expect(r.blaetter[0].zeilen).toEqual([["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]]);
  });
  it("CSV: Werte bleiben Text (keine Interpretation, führende Nullen bleiben)", async () => {
    const r = await parseDatei({ buffer: B("plz;datum\n01067;31.02.2024\n"), name: "p.csv" });
    expect(r.blaetter[0].zeilen[1]).toEqual(["01067", "31.02.2024"]);
  });
  it("TSV", async () => {
    const r = await parseDatei({ buffer: B("a\tb\tc\n1\t2\t3\n"), name: "p.tsv" });
    expect(r.ok).toBe(true);
    expect(r.format).toBe("tsv");
    expect(r.blaetter[0].zeilen).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("CSV in Windows-1252 (kein gültiges UTF-8): Umlaute erhalten, Hinweis", async () => {
    const r = await parseDatei({ buffer: Buffer.from("Größe;Straße\nä;ö\n", "latin1"), name: "p.csv" });
    expect(r.ok).toBe(true);
    expect(r.blaetter[0].zeilen[0]).toEqual(["Größe", "Straße"]);
    expect(hat(r, "ZEICHENSATZ_ERSATZ")).toBe(true);
  });
  it("ungewöhnliche Spaltennamen bleiben unverändert (kein Trimmen, keine Umbenennung)", async () => {
    const namen = ["Größe (m²)", "  Leer  ", "日本語", "a;b", "Name", "Name", "x".repeat(300)];
    const r = await parseDatei({ buffer: mappe({ S: [namen, namen.map((_, i) => i)] }), name: "u.xlsx" });
    expect(r.ok).toBe(true);
    expect(r.blaetter[0].zeilen[0]).toEqual(namen);
    const c = await parseDatei({ buffer: B('"Größe (m²)";" Leer ";"__proto__";"constructor"\n1;2;3;4\n'), name: "u.csv" });
    expect(c.blaetter[0].zeilen[0]).toEqual(["Größe (m²)", " Leer ", "__proto__", "constructor"]);
  });
  it("Blattname __proto__ führt nicht zu Prototype-Pollution", async () => {
    const eintraege = zipEintraege(mappe({ Proto: [["a"], ["b"]] }));
    const wbx = eintraege.find((e) => e.name === "xl/workbook.xml");
    wbx.daten = B(wbx.daten.toString("utf8").replace('name="Proto"', 'name="__proto__"'));
    const r = await parseDatei({ buffer: zip(eintraege.map((e) => ({ ...e, methode: "deflate" }))), name: "u.xlsx" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.blaetter[0].name).toBe("__proto__");
    expect(r.blaetter[0].zeilen).toEqual([["a"], ["b"]]);
    expect({}.a).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "a")).toBe(false);
  });
});

describe("IMP-2 Datum, Fehler, Wahrheitswerte als Rohwerte", () => {
  it("Datum als Zahl + formatierter Text; Text-Datum bleibt Text (auch ungültig)", async () => {
    const d = new Date(2024, 0, 15); /* lokale Mitternacht: SheetJS schreibt lokal, Seriennummer 45306 */
    const buf = mappe({ S: [["Datum", "Text", "Ungültig"], [d, "15.01.2024", "31.02.2024"]] }, "xlsx", { cellDates: true });
    const r = await parseDatei({ buffer: buf, name: "d.xlsx" });
    expect(r.ok).toBe(true);
    const z = r.blaetter[0].zeilen[1];
    expect(z[0]).toMatchObject({ typ: "datum", roh: 45306 });
    expect(typeof z[0].text).toBe("string");
    expect(z[0].text.length).toBeGreaterThan(0);
    expect(z[1]).toBe("15.01.2024");
    expect(z[2]).toBe("31.02.2024");
  });
  it("Datum in XLS und ODS ebenfalls als Rohzahl plus Text", async () => {
    const d = new Date(Date.UTC(2024, 0, 15));
    for (const fmt of ["xls"]) { /* Review 8725dc5, E1: "ods" entfällt */
      const buf = mappe({ S: [["Datum"], [d]] }, fmt, { cellDates: true });
      const r = await parseDatei({ buffer: buf, name: `d.${fmt}` });
      expect(r.ok, fmt).toBe(true);
      expect(r.blaetter[0].zeilen[1][0], fmt).toMatchObject({ typ: "datum" });
      expect(typeof r.blaetter[0].zeilen[1][0].roh, fmt).toBe("number");
      expect(typeof r.blaetter[0].zeilen[1][0].text, fmt).toBe("string");
    }
  });
  it("Wahrheitswerte bleiben boolean, Zahlen bleiben Zahlen", async () => {
    const r = await parseDatei({ buffer: mappe({ S: [["a", "b", "c"], [true, 0, -1.25]] }), name: "b.xlsx" });
    expect(r.blaetter[0].zeilen[1]).toEqual([true, 0, -1.25]);
  });
  it("Formel: nur gespeicherter Wert, Formeltext wird nicht geliefert und nichts berechnet", async () => {
    const eintraege = zipEintraege(mappe({ S: [["x"], [1]] }));
    const blatt = eintraege.find((e) => e.name === "xl/worksheets/sheet1.xml");
    const neu = blatt.daten.toString("utf8").replace(/<c r="A2"[^>]*>.*?<\/c>/,
      '<c r="A2"><f>HYPERLINK("http://example.invalid/x","y")</f><v>42</v></c>');
    blatt.daten = B(neu);
    const r = await parseDatei({ buffer: zip(eintraege.map((e) => ({ ...e, methode: "deflate" }))), name: "f.xlsx" });
    expect(r.ok).toBe(true);
    expect(r.blaetter[0].zeilen[1]).toEqual([42]);
    expect(JSON.stringify(r)).not.toContain("HYPERLINK");
  });
});

describe("IMP-2 leere Zeilen und Spalten", () => {
  it("entfernt leere Zeilen/Spalten und meldet es nachvollziehbar", async () => {
    const r = await parseDatei({
      buffer: mappe({ S: [["a", null, "b"], [null, null, null], [1, null, 2], [null, null, null], [3, null, 4]] }),
      name: "l.xlsx",
    });
    expect(r.ok).toBe(true);
    expect(r.blaetter[0].zeilen).toEqual([["a", "b"], [1, 2], [3, 4]]);
    const hz = r.hinweise.find((h) => h.code === "LEERE_ZEILEN_ENTFERNT");
    const hs = r.hinweise.find((h) => h.code === "LEERE_SPALTEN_ENTFERNT");
    expect(hz).toMatchObject({ blatt: "S", anzahl: 2 });
    expect(hs).toMatchObject({ blatt: "S", anzahl: 1 });
    expect(hz.nachricht).toMatch(/Zeile/);
    expect(hs.nachricht).toMatch(/Spalte/);
  });
  it("CSV: leere Zeilen, leere Spalten und Zeilen mit nur Leerzeichen", async () => {
    const r = await parseDatei({ buffer: B("a;;b\n\n1;;2\n;;\n"), name: "l.csv" });
    expect(r.blaetter[0].zeilen).toEqual([["a", "b"], ["1", "2"]]);
    expect(hat(r, "LEERE_ZEILEN_ENTFERNT")).toBe(true);
    expect(hat(r, "LEERE_SPALTEN_ENTFERNT")).toBe(true);
  });
  it("vollständig leeres Blatt wird mit Hinweis geliefert, leere Datei ist ein Fehler", async () => {
    const r = await parseDatei({ buffer: mappe({ Leer: [[null]], Voll: [["a"], [1]] }), name: "l.xlsx" });
    expect(r.ok).toBe(true);
    expect(r.blaetter.find((b) => b.name === "Leer").zeilen).toEqual([]);
    expect(hat(r, "LEERES_BLATT")).toBe(true);
    const e = await parseDatei({ buffer: B("\n\n;;\n"), name: "l.csv" });
    expect(e.ok).toBe(false);
    expect(e.code).toBe("LEER");
  });
});

describe("IMP-2 Formatprüfung über Inhalt", () => {
  it("XLSX mit Endung .csv wird als XLSX gelesen, mit Hinweis", async () => {
    const r = await parseDatei({ buffer: mappe({ S: [["a"], [1]] }), name: "falsch.csv" });
    expect(r.ok).toBe(true);
    expect(r.format).toBe("xlsx");
    expect(hat(r, "ENDUNG_ABWEICHEND")).toBe(true);
  });
  it("CSV-Text mit Endung .xlsx wird als CSV gelesen, mit Hinweis", async () => {
    const r = await parseDatei({ buffer: B("a;b\n1;2\n"), name: "falsch.xlsx" });
    expect(r.ok).toBe(true);
    expect(r.format).toBe("csv");
    expect(hat(r, "ENDUNG_ABWEICHEND")).toBe(true);
  });
  it("XLS mit Endung .xlsx und ODS mit Endung .xls", async () => {
    const a = await parseDatei({ buffer: mappe({ S: [["a"], [1]] }, "xls"), name: "x.xlsx" });
    expect(a.ok && a.format).toBe("xls");
    const b = await parseDatei({ buffer: mappe({ S: [["a"], [1]] }, "ods"), name: "x.xls" });
    /* Review 8725dc5, E1: ODS wird nach Inhalt erkannt und abgewiesen (vorher: gelesen als "ods") */
    expect(b).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
  });
  it("Endung passt: kein Abweichungshinweis", async () => {
    const r = await parseDatei({ buffer: mappe({ S: [["a"], [1]] }), name: "ok.XLSX" });
    expect(hat(r, "ENDUNG_ABWEICHEND")).toBe(false);
  });
  it("nicht unterstützt: PDF, PNG, EXE, DOCX, XLSB, Binärmüll mit .xlsx-Endung", async () => {
    const docx = zip([{ name: "[Content_Types].xml", daten: B("<x/>") }, { name: "word/document.xml", daten: B("<d/>") }]);
    const xlsb = zip([{ name: "[Content_Types].xml", daten: B("<x/>") }, { name: "xl/workbook.bin", daten: B("x") }]);
    const faelle = {
      pdf: B("%PDF-1.7\n1 0 obj\n"),
      png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
      exe: Buffer.concat([B("MZ"), Buffer.alloc(200, 1)]),
      docx, xlsb,
      muell: Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 37) % 256)),
    };
    for (const [n, buffer] of Object.entries(faelle)) {
      const r = await parseDatei({ buffer, name: `x.xlsx` });
      expect(r.ok, n).toBe(false);
      expect(["UNBEKANNTES_FORMAT", "NICHT_UNTERSTUETZT"], n).toContain(r.code);
      expect(r.nachricht, n).toMatch(/xlsx|ods|csv/i);
    }
    expect((await parseDatei({ buffer: xlsb, name: "x.xlsb" })).code).toBe("NICHT_UNTERSTUETZT");
  });
  it("beschädigte Dateien: Meldung statt Absturz, kein Teilergebnis", async () => {
    const x = mappe({ S: [["a"], [1]] }, "xlsx");
    const abgeschnitten = x.subarray(0, Math.floor(x.length / 2));
    const kaputtXls = Buffer.concat([mappe({ S: [["a"], [1]] }, "xls").subarray(0, 600)]);
    const nurMagic = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100, 7)]);
    for (const [n, buffer] of Object.entries({ abgeschnitten, kaputtXls, nurMagic, ole })) {
      const r = await parseDatei({ buffer, name: "k.xlsx" });
      expect(r.ok, n).toBe(false);
      expect(r.code, n).toBe("BESCHAEDIGT");
      expect(r.blaetter, n).toBeUndefined();
      expect(r.nachricht, n).toMatch(/beschädigt|lesbar/i);
    }
  });
  it("passwortgeschützte (verschlüsselte) Datei: eigene Meldung", async () => {
    /* OLE2-Container mit Verzeichniseintrag "EncryptedPackage" wie bei Excel-Verschlüsselung */
    const ole = Buffer.alloc(1536);
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(ole);
    Buffer.from("EncryptedPackage", "utf16le").copy(ole, 700);
    const r = await parseDatei({ buffer: ole, name: "p.xlsx" });
    expect(r.ok).toBe(false);
    expect(["PASSWORTGESCHUETZT", "BESCHAEDIGT"]).toContain(r.code);
  });
});

describe("IMP-2 Grenzen", () => {
  it("Dateigröße: Standard 10 MB, ohne Teil-Ergebnis", async () => {
    const gross = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
    const r = await parseDatei({ buffer: gross, name: "g.csv" });
    expect(r).toMatchObject({ ok: false, code: "DATEI_ZU_GROSS" });
    expect(r.nachricht).toMatch(/10 MB/);
    expect(r.blaetter).toBeUndefined();
  });
  it("Zeilen: genau am Limit ok, eins darüber abgelehnt (je Blatt, ohne Kopfzeile)", async () => {
    const g = { zeilen: 5 };
    const ok = await parseDatei({ buffer: mappe({ S: [["h"], [1], [2], [3], [4], [5]] }), name: "z.xlsx", grenzen: g });
    expect(ok.ok).toBe(true);
    const zu = await parseDatei({ buffer: mappe({ S: [["h"], [1], [2], [3], [4], [5], [6]] }), name: "z.xlsx", grenzen: g });
    expect(zu).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
    expect(zu.nachricht).toMatch(/5 Zeilen/);
    expect(zu.blaetter).toBeUndefined();
    const csv = await parseDatei({ buffer: B("h\n1\n2\n3\n4\n5\n6\n"), name: "z.csv", grenzen: g });
    expect(csv).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
  });
  it("Zeilen: Standardgrenze 20.000 greift bei CSV", async () => {
    const zeilen = ["h"]; for (let i = 0; i < 20001; i++) zeilen.push(String(i));
    const r = await parseDatei({ buffer: B(zeilen.join("\n")), name: "z.csv" });
    expect(r).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
    const ok = await parseDatei({ buffer: B(zeilen.slice(0, 20000).join("\n")), name: "z.csv" });
    expect(ok.ok).toBe(true);
    expect(ok.blaetter[0].zeilen).toHaveLength(20000);
  });
  it("Spalten: am Limit ok, darüber abgelehnt (xlsx und csv)", async () => {
    const zeile = (n) => Array.from({ length: n }, (_, i) => `c${i}`);
    const ok = await parseDatei({ buffer: mappe({ S: [zeile(4)] }), name: "s.xlsx", grenzen: { spalten: 4 } });
    expect(ok.ok).toBe(true);
    const zu = await parseDatei({ buffer: mappe({ S: [zeile(5)] }), name: "s.xlsx", grenzen: { spalten: 4 } });
    expect(zu).toMatchObject({ ok: false, code: "ZU_VIELE_SPALTEN" });
    expect(zu.nachricht).toMatch(/4 Spalten/);
    const csv = await parseDatei({ buffer: B(zeile(5).join(";")), name: "s.csv", grenzen: { spalten: 4 } });
    expect(csv).toMatchObject({ ok: false, code: "ZU_VIELE_SPALTEN" });
    const std = await parseDatei({ buffer: B(zeile(201).join(";")), name: "s.csv" });
    expect(std).toMatchObject({ ok: false, code: "ZU_VIELE_SPALTEN" });
  });
  it("Blätter: am Limit ok, darüber abgelehnt (Standard 20)", async () => {
    const mit = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`B${i + 1}`, [["a"], [i]]]));
    const ok = await parseDatei({ buffer: mappe(mit(20)), name: "b.xlsx" });
    expect(ok.ok).toBe(true);
    expect(ok.blaetter).toHaveLength(20);
    const zu = await parseDatei({ buffer: mappe(mit(21)), name: "b.xlsx" });
    expect(zu).toMatchObject({ ok: false, code: "ZU_VIELE_BLAETTER" });
    expect(zu.nachricht).toMatch(/20 Blätter/);
  });
  it("Gesamtzellen begrenzt den Speicher bei vielen Blättern", async () => {
    const r = await parseDatei({ buffer: mappe({ A: [["a", "b"], [1, 2], [3, 4]], B: [["a", "b"], [1, 2], [3, 4]] }), name: "z.xlsx", grenzen: { zellen: 8 } });
    expect(r).toMatchObject({ ok: false, code: "ZU_VIELE_ZELLEN" });
  });
});

describe("IMP-2 ZIP-Bombe und Sicherheit", () => {
  it("erklärte entpackte Größe über 100 MB: abgelehnt, bevor entpackt wird", async () => {
    const nuller = Buffer.alloc(101 * 1024 * 1024);
    const bombe = zip([
      { name: "[Content_Types].xml", daten: B("<Types/>"), methode: "deflate" },
      { name: "xl/workbook.xml", daten: B("<workbook/>"), methode: "deflate" },
      { name: "xl/worksheets/sheet1.xml", daten: nuller, methode: "deflate" },
    ]);
    expect(bombe.length).toBeLessThan(1024 * 1024); /* klein im Repo/Speicher: Erzeugung zur Laufzeit */
    const t0 = Date.now();
    const r = await parseDatei({ buffer: bombe, name: "bombe.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "ENTPACKT_ZU_GROSS" });
    expect(r.nachricht).toMatch(/100 MB/);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it("Kompressionsverhältnis zu hoch (unter 100 MB, aber verdächtig): abgelehnt", async () => {
    const bombe = zip([
      { name: "[Content_Types].xml", daten: B("<Types/>"), methode: "deflate" },
      { name: "xl/worksheets/sheet1.xml", daten: Buffer.alloc(50 * 1024 * 1024), methode: "deflate" },
    ]);
    const r = await parseDatei({ buffer: bombe, name: "bombe.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "KOMPRESSION_VERDAECHTIG" });
  });
  it("lügender Header (klein erklärt, tatsächlich riesig): beim Entpacken gekappt, abgelehnt", async () => {
    const bombe = zip([
      { name: "[Content_Types].xml", daten: B("<Types/>"), methode: "deflate" },
      { name: "xl/worksheets/sheet1.xml", daten: Buffer.alloc(30 * 1024 * 1024), methode: "deflate", erklaert: 1000 },
    ]);
    const r = await parseDatei({ buffer: bombe, name: "luege.xlsx", grenzen: { entpacktBytes: 5 * 1024 * 1024 } });
    expect(r.ok).toBe(false);
    expect(["ENTPACKT_ZU_GROSS", "BESCHAEDIGT", "KOMPRESSION_VERDAECHTIG"]).toContain(r.code);
  });
  it("zu viele Archiv-Einträge: abgelehnt", async () => {
    const e = Array.from({ length: 30 }, (_, i) => ({ name: `xl/x${i}.xml`, daten: B("<a/>") }));
    e.unshift({ name: "[Content_Types].xml", daten: B("<Types/>") });
    const r = await parseDatei({ buffer: zip(e), name: "v.xlsx", grenzen: { archivEintraege: 10 } });
    expect(r).toMatchObject({ ok: false, code: "ENTPACKT_ZU_GROSS" });
  });
  it("Zeitlimit: Verarbeitung wird abgebrochen, Prozess bleibt frei", async () => {
    const t0 = Date.now();
    const r = await parseDatei({ buffer: mappe({ S: [["a"], [1]] }), name: "t.xlsx", grenzen: { zeitMs: 1 } });
    expect(r).toMatchObject({ ok: false, code: "ZEITLIMIT" });
    expect(r.nachricht).toMatch(/zu lange|Zeit/i);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("Ereignisschleife bleibt während des Parsens ansprechbar (eigener Thread)", async () => {
    const zeilen = [["h1", "h2", "h3"]]; for (let i = 0; i < 15000; i++) zeilen.push([i, `t${i}`, i * 2]);
    const buf = mappe({ S: zeilen });
    let ticks = 0; const iv = setInterval(() => { ticks++; }, 1);
    const r = await parseDatei({ buffer: buf, name: "g.xlsx" });
    clearInterval(iv);
    expect(r.ok).toBe(true);
    expect(ticks).toBeGreaterThan(0);
  });
  it("Makro-Datei (xlsm mit vbaProject.bin): abgewiesen (NICHT_UNTERSTUETZT), keine Daten, Makro nicht ausgeführt", async () => {
    const eintraege = zipEintraege(mappe({ S: [["a"], [1]] }));
    eintraege.push({ name: "xl/vbaProject.bin", daten: B("MAKROCODE-NICHT-AUSFUEHREN") });
    const ct = eintraege.find((e) => e.name === "[Content_Types].xml");
    /* Review 8725dc5, E3/E4: Testeingabe berichtigt. Vorher entstand durch Ersetzen von „sheet.main+xml“ der
       Phantasietyp „…spreadsheetml.sheet.macroEnabled.main+xml“ (kein Arbeitsmappentyp; jetzt NICHT_UNTERSTUETZT).
       Der echte xlsm-Typ ist application/vnd.ms-excel.sheet.macroEnabled.main+xml. Assertions unverändert. */
    ct.daten = B(ct.daten.toString("utf8").replace("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml", "application/vnd.ms-excel.sheet.macroEnabled.main+xml"));
    const buf = zip(eintraege.map((e) => ({ ...e, methode: "deflate" })));
    const r = await parseDatei({ buffer: buf, name: "m.xlsm" });
    /* imp-2-fix4, E4-Entscheidung: Makro-Typ (xlsm) wird abgewiesen; Erwartung ersetzt (vorher ok:true, Daten, Hinweis). */
    expect(r, JSON.stringify(r)).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    expect(r.blaetter).toBeUndefined();
    expect(JSON.stringify(r)).toMatch(/Makro/);
    expect(JSON.stringify(r)).not.toContain("MAKROCODE");
  });
  it("Makro-Datei als .xlsx getarnt wird genauso erkannt; XLS mit VBA-Projekt ebenfalls", async () => {
    const eintraege = zipEintraege(mappe({ S: [["a"], [1]] }));
    eintraege.push({ name: "xl/vbaProject.bin", daten: B("x") });
    const r = await parseDatei({ buffer: zip(eintraege.map((e) => ({ ...e, methode: "deflate" }))), name: "tarn.xlsx" });
    expect(hat(r, "MAKROS_VERWORFEN")).toBe(true);
    const xls = mappe({ S: [["a"], [1]] }, "xls");
    const mitVba = Buffer.concat([xls, Buffer.from("_VBA_PROJECT", "utf16le")]);
    const r2 = await parseDatei({ buffer: mitVba, name: "m.xls" });
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
    expect(hat(r2, "MAKROS_VERWORFEN")).toBe(true);
  });
  it("externe Verweise (externalLinks) werden nicht aufgelöst, Hinweis", async () => {
    const eintraege = zipEintraege(mappe({ S: [["a"], [1]] }));
    eintraege.push({ name: "xl/externalLinks/externalLink1.xml", daten: B('<externalLink target="http://example.invalid/x.xlsx"/>') });
    const r = await parseDatei({ buffer: zip(eintraege.map((e) => ({ ...e, methode: "deflate" }))), name: "e.xlsx" });
    expect(r.ok).toBe(true);
    expect(hat(r, "EXTERNE_VERWEISE_IGNORIERT")).toBe(true);
    expect(JSON.stringify(r)).not.toContain("example.invalid");
  });
  it("Parser öffnet keine Netzwerkverbindung und schreibt keine Dateien (Quelltextprüfung)", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const f of ["parser.mjs", "parser-kern.mjs", "parser-worker.mjs"]) {
      const q = await readFile(new URL(`../server/lib/import/${f}`, import.meta.url), "utf8");
      expect(q, f).not.toMatch(/node:(http|https|net|dns|tls|child_process)|\bfetch\s*\(|XMLHttpRequest/);
      expect(q, f).not.toMatch(/XLSX\.(write|writeFile|writeXLSX|set_fs)|writeFile|createWriteStream/);
      expect(q, f).not.toMatch(/\beval\s*\(|new Function/);
    }
  });
});

/* ==========================================================================
   Befunde aus dem Review von PR #123 (IMP-2). Jede Prüfung war vor der
   Korrektur rot (Nachweis: docs/acc45/IMP-2-NACHWEIS.md).
   ========================================================================== */
const EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const eocdPos = (b) => b.lastIndexOf(EOCD);
/** Synthetische xlsx-Einträge (deflate), optional mit Zusatzeinträgen. */
const xlsxEintraege = (zusatz = []) => [...zipEintraege(mappe({ S: [["a"], [1]] })), ...zusatz].map((e) => ({ methode: "deflate", ...e }));
/** Blatt-XML einer synthetischen xlsx umbauen und neu packen. */
function mitBlatt(buf, fn) {
  const eintraege = zipEintraege(buf);
  const blatt = eintraege.find((e) => e.name === "xl/worksheets/sheet1.xml");
  blatt.daten = B(fn(blatt.daten.toString("utf8")));
  return zip(eintraege.map((e) => ({ ...e, methode: "deflate" })));
}

describe("Review PR #123 Befund 1: strikte ZIP-Prüfung vor SheetJS", () => {
  it("B1-PoC: Eintragszahl Offset 8 ungleich Offset 10 wird abgewiesen, bevor SheetJS läuft", async () => {
    const z = zip(xlsxEintraege([{ name: "docProps/versteckt.bin", daten: B("VERSTECKT") }]));
    const e = eocdPos(z);
    const n = z.readUInt16LE(e + 10);
    z.writeUInt16LE(n - 1, e + 10); /* Gesamtzahl verschweigt den letzten Eintrag, Disk-Zahl (Offset 8) nicht */
    expect(typeof kern.pruefeZip).toBe("function");
    expect(() => kern.pruefeZip(z, STANDARD_GRENZEN)).toThrow(/Eintragszahl/);
    const r = await parseDatei({ buffer: z, name: "poc.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.nachricht).toMatch(/Eintragszahl/);
    expect(r.blaetter).toBeUndefined();
    /* umgekehrt: Offset 8 kleiner als Offset 10 */
    const z2 = zip(xlsxEintraege([{ name: "docProps/versteckt.bin", daten: B("x") }]));
    z2.writeUInt16LE(z2.readUInt16LE(eocdPos(z2) + 8) - 1, eocdPos(z2) + 8);
    expect((await parseDatei({ buffer: z2, name: "poc.xlsx" })).ok).toBe(false);
  });
  it("B1-PoC: versteckter Eintrag mit 300 MB Entpackgröße führt nicht zu ok:true", async () => {
    const z = zip(xlsxEintraege([{ name: "docProps/bombe.bin", daten: Buffer.alloc(300 * 1024 * 1024) }]));
    expect(z.length).toBeLessThan(2 * 1024 * 1024);
    const e = eocdPos(z);
    z.writeUInt16LE(z.readUInt16LE(e + 10) - 1, e + 10);
    const t0 = Date.now();
    const r = await parseDatei({ buffer: z, name: "bombe.xlsx" });
    expect(r.ok).toBe(false);
    expect(r.blaetter).toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(10000);
  });
  it("B1: EOCD nicht am Dateiende (angehängte Bytes / falsche Kommentarlänge) wird abgewiesen", async () => {
    const z = zip(xlsxEintraege());
    const r = await parseDatei({ buffer: Buffer.concat([z, B("ANHANG")]), name: "a.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    const k = Buffer.from(z); k.writeUInt16LE(5, eocdPos(k) + 20); /* Kommentar angekündigt, fehlt */
    expect((await parseDatei({ buffer: k, name: "a.xlsx" })).ok).toBe(false);
  });
  it("B1: zweite EOCD-Signatur (im Kommentar) wird abgewiesen", async () => {
    const z = zip(xlsxEintraege());
    const e = eocdPos(z);
    const falsch = Buffer.from(z.subarray(e, e + 22));
    const mitKommentar = Buffer.concat([z, falsch]);
    mitKommentar.writeUInt16LE(22, e + 20);
    expect(eocdPos(mitKommentar)).toBeGreaterThan(e);
    const r = await parseDatei({ buffer: mitKommentar, name: "k.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    /* Kommentar enthält eine EOCD-Signatur, die nicht als vollständiger Block taugt */
    const m2 = Buffer.concat([z, EOCD, B("xxxx")]);
    m2.writeUInt16LE(8, e + 20);
    expect((await parseDatei({ buffer: m2, name: "k.xlsx" })).ok).toBe(false);
  });
  it("B1: Zentralverzeichnis endet nicht exakt am EOCD (Lücke) wird abgewiesen", async () => {
    const z = zip(xlsxEintraege());
    const e = eocdPos(z);
    const luecke = Buffer.concat([z.subarray(0, e), Buffer.alloc(8), z.subarray(e)]);
    const r = await parseDatei({ buffer: luecke, name: "l.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
  });
  it("B1: ZIP64-Extrafeld 0x0001 in einem Eintrag wird abgewiesen", async () => {
    const zip64 = Buffer.alloc(20); zip64.writeUInt16LE(0x0001, 0); zip64.writeUInt16LE(16, 2);
    zip64.writeUInt32LE(300 * 1024 * 1024, 4); zip64.writeUInt32LE(10, 12);
    const eintraege = xlsxEintraege();
    eintraege.find((x) => x.name === "xl/worksheets/sheet1.xml").extra = zip64;
    const r = await parseDatei({ buffer: zip(eintraege), name: "z64.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    expect(r.nachricht).toMatch(/ZIP64/);
  });
  it("B1: falsche CRC und abweichende Methode im lokalen Kopf werden abgewiesen", async () => {
    const a = xlsxEintraege();
    a.find((x) => x.name === "xl/workbook.xml").crc = 0x12345678;
    expect(await parseDatei({ buffer: zip(a), name: "c.xlsx" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    const b = xlsxEintraege();
    b.find((x) => x.name === "xl/workbook.xml").methodeLokal = "store";
    expect(await parseDatei({ buffer: zip(b), name: "m.xlsx" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
  });
  it("B1: doppelte Eintragsnamen werden abgewiesen", async () => {
    const a = xlsxEintraege();
    a.push({ ...a.find((x) => x.name === "xl/worksheets/sheet1.xml") });
    expect(await parseDatei({ buffer: zip(a), name: "d.xlsx" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
  });
  it("B1: SheetJS erhält ein neu aufgebautes, sauberes Archiv aus geprüften Einträgen", async () => {
    const roh = zip(xlsxEintraege());
    const p = kern.pruefeZip(roh, STANDARD_GRENZEN);
    expect(Buffer.isBuffer(p.sauber)).toBe(true);
    expect(p.sauber.equals(roh)).toBe(false);
    expect(p.entpackt).toBeGreaterThan(0);
    expect(p.entpackt).toBeLessThanOrEqual(STANDARD_GRENZEN.entpacktBytes);
    /* das saubere Archiv besteht die eigene strenge Prüfung (Einträge unkomprimiert, CRC stimmt) */
    expect(kern.pruefeZip(p.sauber, STANDARD_GRENZEN).namen).toEqual(p.namen);
    const r = await parseDatei({ buffer: roh, name: "s.xlsx" });
    expect(r.ok).toBe(true);
    expect(r.blaetter[0].zeilen).toEqual([["a"], [1]]);
  });
  it("B1: Gesamtbudget entpackter Bytes über alle Einträge bricht ab", () => {
    /* zwei Einträge, je 3 MB echt entpackt; Budget 5 MB: Abbruch beim zweiten Eintrag */
    const drei = Buffer.alloc(3 * 1024 * 1024, 0x61);
    const z = zip(xlsxEintraege([{ name: "docProps/a.bin", daten: drei }, { name: "docProps/b.bin", daten: drei }]));
    expect(() => kern.pruefeZip(z, { ...STANDARD_GRENZEN, entpacktBytes: 5 * 1024 * 1024, kompressionsverhaeltnis: 1e9 }))
      .toThrow(/MB/);
  });
});

describe("Review PR #123 Befund 2: kein stilles Abschneiden über sheetRows", () => {
  const g = { zeilen: 5 }; /* Lesegrenze = 5 + 1 + 10000 = 10006 Zeilenpositionen */
  const fern = (r) => `<row r="${r}"><c r="A${r}"><v>7</v></c></row></sheetData>`;
  const ohneDim = (x) => x.replace(/<dimension[^>]*\/>/, "");
  it("B2: xlsx ohne <dimension> mit Daten jenseits der Lesegrenze → ZU_VIELE_ZEILEN", async () => {
    const buf = mitBlatt(mappe({ S: [["h"], [1], [2]] }), (x) => ohneDim(x).replace("</sheetData>", fern(10010)));
    const r = await parseDatei({ buffer: buf, name: "z.xlsx", grenzen: g });
    expect(r).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
    expect(r.blaetter).toBeUndefined();
  });
  it("B2: xlsx mit gefälschtem ref (<dimension ref=\"A1:A3\">) → ZU_VIELE_ZEILEN", async () => {
    const buf = mitBlatt(mappe({ S: [["h"], [1], [2]] }), (x) => x.replace(/<dimension[^>]*\/>/, '<dimension ref="A1:A3"/>').replace("</sheetData>", fern(10010)));
    const r = await parseDatei({ buffer: buf, name: "z.xlsx", grenzen: g });
    expect(r).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
  });
  it("B2: xlsx Zeilen ohne r-Attribut (implizit fortlaufend) über die Lesegrenze → ZU_VIELE_ZEILEN", async () => {
    const leer = Array.from({ length: 10010 }, () => "<row></row>").join("");
    const buf = mitBlatt(mappe({ S: [["h"], [1]] }), (x) => ohneDim(x).replace("</sheetData>", `${leer}<row><c><v>9</v></c></row></sheetData>`));
    const r = await parseDatei({ buffer: buf, name: "z.xlsx", grenzen: g });
    expect(r).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
  });
  it("B2: Grenze exakt: Daten an Zeilenposition 10006 ok, an 10007 abgelehnt (xlsx)", async () => {
    const ok = await parseDatei({ buffer: mitBlatt(mappe({ S: [["h"], [1]] }), (x) => ohneDim(x).replace("</sheetData>", fern(10006))), name: "z.xlsx", grenzen: g });
    expect(ok.ok, JSON.stringify(ok).slice(0, 300)).toBe(true);
    expect(ok.blaetter[0].zeilen).toEqual([["h"], [1], [7]]);
    const zu = await parseDatei({ buffer: mitBlatt(mappe({ S: [["h"], [1]] }), (x) => ohneDim(x).replace("</sheetData>", fern(10007))), name: "z.xlsx", grenzen: g });
    expect(zu).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
  });
  it("B2: xls und ods mit Daten jenseits der Lesegrenze → ZU_VIELE_ZEILEN (kein Teilergebnis)", async () => {
    const zeilen = [["h"], [1], [2]];
    for (let i = 0; i < 10006; i++) zeilen.push([]);
    zeilen.push([7]);
    for (const fmt of ["xls"]) { /* Review 8725dc5, E1: "ods" entfällt */
      const r = await parseDatei({ buffer: mappe({ S: zeilen }, fmt), name: `z.${fmt}`, grenzen: g });
      expect(r, fmt).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
      expect(r.blaetter, fmt).toBeUndefined();
    }
  });
});

describe("Review PR #123 Befund 3: Datumssystem 1900/1904", () => {
  const geburt = new Date(1985, 2, 17), eintritt = new Date(2020, 1, 1), stichtag = new Date(2024, 0, 15);
  const inhalt = { P: [["Name", "Geburtsdatum", "Eintritt", "Stunden", "PersNr", "Notiz"],
    ["Anna", geburt, eintritt, 38.5, 1234, "01.02.2020"], ["Bert", stichtag, stichtag, 1462, 0, "x"]] };
  for (const fmt of ["xlsx", "xls"]) { /* Review 8725dc5, E1: "ods" entfällt */
    it(`B3: ${fmt}: gleicher Kalendertag in 1900- und 1904-Mappe liefert gleiches Ergebnis`, async () => {
      const a = await parseDatei({ buffer: mappe(inhalt, fmt, { cellDates: true }), name: `p.${fmt}` });
      const b = await parseDatei({ buffer: mappe(inhalt, fmt, { cellDates: true }, { date1904: true }), name: `p.${fmt}` });
      expect(a.ok && b.ok, JSON.stringify([a, b]).slice(0, 400)).toBe(true);
      expect(a.datumssystem).toBe("1900");
      /* Review 1da3ceb H1 (verbindliche Entscheidung): datumssystem beschreibt das Ergebnis (nach
         Umrechnung immer "1900"); die Herkunft steht in datumssystemQuelle. Einzige geänderte Assertion. */
      expect(b.datumssystem).toBe("1900");
      expect(b.datumssystemQuelle).toBe("1904");
      expect(hat(a, "DATUMSSYSTEM_1904")).toBe(false);
      expect(hat(b, "DATUMSSYSTEM_1904")).toBe(true);
      expect(b.blaetter).toEqual(a.blaetter);
      const z = b.blaetter[0].zeilen;
      expect(z[1][1]).toMatchObject({ typ: "datum", roh: 31123 }); /* Geburtsdatum 17.03.1985 im 1900-System */
      expect(z[1][2]).toMatchObject({ typ: "datum", roh: 43862 }); /* Eintritt 01.02.2020 */
      expect(z[2][1]).toMatchObject({ typ: "datum", roh: 45306 }); /* 15.01.2024 */
      /* gewöhnliche Zahlen und Text werden nicht umgerechnet */
      expect(z[1].slice(3)).toEqual([38.5, 1234, "01.02.2020"]);
      expect(z[2].slice(3)).toEqual([1462, 0, "x"]);
    });
  }
  it("B3: 1904-Testmappe speichert tatsächlich den um 1462 Tage kleineren Rohwert", () => {
    const blatt = zipEintraege(mappe(inhalt, "xlsx", { cellDates: true }, { date1904: true }))
      .find((e) => e.name === "xl/worksheets/sheet1.xml").daten.toString("utf8");
    expect(blatt).toContain("<v>43844</v>");
    expect(blatt).not.toContain("<v>45306</v>");
  });
  it("B3: CSV hat kein Datumssystem (Vertragsform unverändert)", async () => {
    const r = await parseDatei({ buffer: B("a;b\n1;2\n"), name: "x.csv" });
    expect(r.datumssystem).toBeUndefined();
  });
});

describe("Review PR #123 Befund 4: Makro-Erkennung ohne Fehlalarm", () => {
  it("B4: normale 1-Blatt-xlsx (SheetJS-Standard-Content-Types) ohne Hinweis MAKROS_VERWORFEN", async () => {
    const buf = mappe({ S: [["a"], [1]] });
    const ct = zipEintraege(buf).find((e) => e.name === "[Content_Types].xml").daten.toString("utf8");
    expect(ct).toMatch(/macroEnabled/); /* Voraussetzung des Befunds: Default Extension="bin" */
    const r = await parseDatei({ buffer: buf, name: "n.xlsx" });
    expect(r.ok).toBe(true);
    expect(hat(r, "MAKROS_VERWORFEN")).toBe(false);
  });
  it("B4: Content-Type application/vnd.ms-office.vbaProject allein genügt für den Hinweis", async () => {
    const eintraege = zipEintraege(mappe({ S: [["a"], [1]] }));
    const ct = eintraege.find((e) => e.name === "[Content_Types].xml");
    ct.daten = B(ct.daten.toString("utf8").replace("</Types>",
      '<Override PartName="/xl/makro.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>'));
    const r = await parseDatei({ buffer: zip(eintraege.map((e) => ({ ...e, methode: "deflate" }))), name: "m.xlsx" });
    expect(r.ok).toBe(true);
    expect(hat(r, "MAKROS_VERWORFEN")).toBe(true);
  });
});

/* ==========================================================================
   Befunde aus dem Review von 1da3ceb (IMP-2-Korrektur). Jede Gruppe enthält
   mindestens einen Test, der vor der Korrektur rot war
   (Nachweis: docs/acc45/IMP-2-NACHWEIS.md, Abschnitt 8).
   ========================================================================== */
/** Einträge einer synthetischen Datei neu packen (ODS: mimetype unkomprimiert). */
const neuPacken = (eintraege) => zip(eintraege.map((e) => ({ ...e, methode: e.name === "mimetype" ? "store" : "deflate" })));
const gleicheTextErsetzung = (buf, name, fn) => {
  const eintraege = zipEintraege(buf);
  const e = eintraege.find((x) => x.name === name);
  e.daten = B(fn(e.daten.toString("utf8")));
  return neuPacken(eintraege);
};

describe("Review 1da3ceb H1: Datum genau an einer Stelle (Parser normiert auf 1900)", () => {
  const tag = new Date(2024, 0, 15), geburt = new Date(1985, 2, 17);
  for (const fmt of ["xlsx", "xls"]) { /* Review 8725dc5, E1: "ods" entfällt (beide Tests dieser Schleife) */
    it(`H1: ${fmt}: gleicher Kalendertag in 1900- und 1904-Mappe liefert gleiche roh-Werte; datumssystem "1900", datumssystemQuelle "1904"`, async () => {
      const inhalt = { P: [["Geburt", "Stichtag", "Zahl"], [geburt, tag, 1462]] };
      const a = await parseDatei({ buffer: mappe(inhalt, fmt, { cellDates: true }), name: `p.${fmt}` });
      const b = await parseDatei({ buffer: mappe(inhalt, fmt, { cellDates: true }, { date1904: true }), name: `p.${fmt}` });
      expect(a.ok && b.ok).toBe(true);
      expect(b.blaetter[0].zeilen[1].map((z) => z && z.roh)).toEqual(a.blaetter[0].zeilen[1].map((z) => z && z.roh));
      expect(b.blaetter[0].zeilen[1][0]).toMatchObject({ typ: "datum", roh: 31123 });
      expect(b.blaetter[0].zeilen[1][1]).toMatchObject({ typ: "datum", roh: 45306 });
      expect(b.blaetter[0].zeilen[1][2]).toBe(1462);
      /* datumssystem beschreibt das Ergebnis, datumssystemQuelle die Datei */
      expect(a.datumssystem).toBe("1900");
      expect(b.datumssystem).toBe("1900");
      expect(a.datumssystemQuelle).toBeUndefined();
      expect(b.datumssystemQuelle).toBe("1904");
    });
    it(`H1: ${fmt}: Zeitwert 06:00 und Dauer [h]:mm werden in der 1904-Mappe nicht verschoben`, async () => {
      const zeit = { t: "n", v: 0.25, z: "hh:mm" };
      const dauer = { t: "n", v: 30.5, z: "[h]:mm" };
      const inhalt = { Z: [["Zeit", "Dauer", "Datum"], [zeit, dauer, tag]] };
      const a = await parseDatei({ buffer: mappe(inhalt, fmt, { cellDates: true }), name: `z.${fmt}` });
      const b = await parseDatei({ buffer: mappe(inhalt, fmt, { cellDates: true }, { date1904: true }), name: `z.${fmt}` });
      expect(a.ok && b.ok).toBe(true);
      const roh = (z) => (z && typeof z === "object" ? z.roh : z);
      expect(roh(a.blaetter[0].zeilen[1][0])).toBe(0.25);
      expect(roh(b.blaetter[0].zeilen[1][0])).toBe(0.25);
      expect(roh(b.blaetter[0].zeilen[1][1])).toBe(roh(a.blaetter[0].zeilen[1][1]));
      expect(roh(b.blaetter[0].zeilen[1][1])).toBe(30.5);
      /* das Datum in derselben Zeile wird dagegen normiert */
      expect(roh(b.blaetter[0].zeilen[1][2])).toBe(45306);
    });
  }
  it("H1: xlsx: Zelle t=\"d\" ohne Datumsformat bleibt unverändert (keine zweite Verschiebung, kein Datumsobjekt)", async () => {
    const mitD = (wbProps) => mitBlatt(mappe({ S: [["h"], [1]] }, "xlsx", {}, wbProps),
      (x) => x.replace("</sheetData>", '<row r="3"><c r="A3" t="d"><v>2024-01-15T00:00:00</v></c></row></sheetData>'));
    const a = await parseDatei({ buffer: mitD(null), name: "d.xlsx" });
    const b = await parseDatei({ buffer: mitD({ date1904: true }), name: "d.xlsx" });
    expect(a.ok && b.ok, JSON.stringify([a, b]).slice(0, 300)).toBe(true);
    /* SheetJS liefert die Zahl im System der Mappe; ohne Datumsformat rechnet der Parser nichts um */
    expect(a.blaetter[0].zeilen[2]).toEqual([45306]);
    expect(b.blaetter[0].zeilen[2]).toEqual([45306 - 1462]);
  });
  it("H1: ods: null-date nach der Tabelle wird abgelehnt (kein um 1462 Tage falsches Datum)", async () => {
    const ods = mappe({ S: [["Datum"], [tag]] }, "ods", { cellDates: true }, { date1904: true });
    const verschoben = gleicheTextErsetzung(ods, "content.xml", (x) => {
      const block = /<table:calculation-settings[\s\S]*?<\/table:calculation-settings>/.exec(x)[0];
      return x.replace(block, "").replace("</office:spreadsheet>", `${block}</office:spreadsheet>`);
    });
    const r = await parseDatei({ buffer: verschoben, name: "n.ods" });
    expect(r.ok).toBe(false);
    expect(["BESCHAEDIGT", "NICHT_UNTERSTUETZT"]).toContain(r.code);
    expect(r.blaetter).toBeUndefined();
    /* Gegenprobe entfällt (Review 8725dc5, E1): vorher wurde die unveränderte 1904-ODS gelesen und normiert
       (roh 45306); jetzt wird auch sie als ODS abgewiesen. */
    const ok = await parseDatei({ buffer: ods, name: "n.ods" });
    expect(ok).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
  });
});

describe("Review 1da3ceb H2: Textmenge im Ergebnis begrenzt (gemeinsam genutzte Texte)", () => {
  /** xlsx mit sharedStrings: alle Zellen verweisen auf denselben Eintrag, der durch `text` ersetzt wird. */
  function mitGeteiltemText(text, verweise, spalten = 50) {
    const zeilen = [["kopf"]];
    for (let i = 0; i < Math.ceil(verweise / spalten); i++) {
      zeilen.push(Array.from({ length: Math.min(spalten, verweise - i * spalten) }, () => "PLATZHALTER"));
    }
    const buf = mappe({ S: zeilen }, "xlsx", {}, null, { bookSST: true });
    return gleicheTextErsetzung(buf, "xl/sharedStrings.xml", (x) => {
      expect(x).toContain(">PLATZHALTER<");
      return x.replace(">PLATZHALTER<", `>${text}<`);
    });
  }
  /** pseudozufälliger Text (schlecht komprimierbar), deterministisch */
  function zufallsText(n) {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let s = 12345; const t = new Array(n);
    for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; t[i] = abc[s >>> 26]; }
    return t.join("");
  }
  it("H2-PoC: 1,2-MB-xlsx mit einem großen sharedStrings-Eintrag und vielen Verweisen wird abgelehnt, bevor postMessage kopiert", async () => {
    const buf = mitGeteiltemText(zufallsText(1500000), 100);
    expect(buf.length).toBeGreaterThan(1024 * 1024);
    expect(buf.length).toBeLessThan(1.5 * 1024 * 1024);
    /* im Kern (Worker-Seite) entsteht bereits das Fehlerergebnis, ohne Blattdaten */
    const k = kern.parseKern({ buffer: buf, name: "t.xlsx" });
    expect(k.ok).toBe(false);
    expect(k.code).toBe("TEXT_ZU_GROSS");
    expect(k.blaetter).toBeUndefined();
    const t0 = Date.now();
    const r = await parseDatei({ buffer: buf, name: "t.xlsx" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("TEXT_ZU_GROSS");
    expect(r.blaetter).toBeUndefined();
    expect(JSON.stringify(r).length).toBeLessThan(2000);
    expect(Date.now() - t0).toBeLessThan(20000);
  });
  it("H2: Summe der Zeichen über alle Zellen über dem Entpack-Budget → TEXT_ZU_GROSS (jede Zelle unter 32.767)", async () => {
    const buf = mitGeteiltemText("x".repeat(30000), 200);
    const g = { entpacktBytes: 5 * 1024 * 1024 }; /* Budget 5.242.880 Zeichen < 200 × 30.000 */
    const r = await parseDatei({ buffer: buf, name: "t.xlsx", grenzen: g });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("TEXT_ZU_GROSS");
    expect(r.blaetter).toBeUndefined();
    /* knapp darunter (170 × 30.000 = 5,1 Mio.) ist es zulässig */
    const ok = await parseDatei({ buffer: mitGeteiltemText("x".repeat(30000), 170), name: "t.xlsx", grenzen: g });
    expect(ok.ok).toBe(true);
  });
  it("H2: Höchstlänge je Zelle 32.767 Zeichen: genau am Limit ok, eins darüber abgelehnt (xlsx und CSV)", async () => {
    const am = await parseDatei({ buffer: mitGeteiltemText("y".repeat(32767), 1), name: "t.xlsx" });
    expect(am.ok).toBe(true);
    expect(am.blaetter[0].zeilen[1][0]).toHaveLength(32767);
    const drueber = await parseDatei({ buffer: mitGeteiltemText("y".repeat(32768), 1), name: "t.xlsx" });
    expect(drueber).toMatchObject({ ok: false, code: "TEXT_ZU_GROSS" });
    expect(drueber.nachricht).toMatch(/32\.767/);
    const csvOk = await parseDatei({ buffer: B(`a;b\n${"z".repeat(32767)};1\n`), name: "t.csv" });
    expect(csvOk.ok).toBe(true);
    const csv = await parseDatei({ buffer: B(`a;b\n${"z".repeat(32768)};1\n`), name: "t.csv" });
    expect(csv).toMatchObject({ ok: false, code: "TEXT_ZU_GROSS" });
  });
});

describe("Review 1da3ceb M1: keine still verlorenen Zeilen (strenge r-Attribute, kein sheetRows bei xlsx)", () => {
  const g = { zeilen: 5 }; /* Lesegrenze = 10006 Zeilenpositionen */
  const anhaengen = (teil) => mitBlatt(mappe({ S: [["h"], [1]] }), (x) => x.replace("</sheetData>", `${teil}</sheetData>`));
  it("M1-PoC: <row r=50000> ohne Anführungszeichen → ZU_VIELE_ZEILEN (nicht still verworfen)", async () => {
    const r = await parseDatei({ buffer: anhaengen("<row r=50000><c r=\"A50000\"><v>7</v></c></row>"), name: "p.xlsx", grenzen: g });
    expect(r).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
    expect(r.blaetter).toBeUndefined();
    const r2 = await parseDatei({ buffer: anhaengen("<row r=50000><c><v>7</v></c></row>"), name: "p.xlsx", grenzen: g });
    expect(r2).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
  });
  it("M1: r ohne Anführungszeichen innerhalb der Grenze ist zulässig und wird gelesen", async () => {
    const r = await parseDatei({ buffer: anhaengen("<row r=3><c r=\"A3\"><v>7</v></c></row><row r='4'><c r='A4'><v>8</v></c></row>"), name: "p.xlsx", grenzen: g });
    expect(r.ok, JSON.stringify(r).slice(0, 300)).toBe(true);
    expect(r.blaetter[0].zeilen).toEqual([["h"], [1], [7], [8]]);
  });
  it("M1-PoC: r=\"4\" mit x:r=\"50000\" (doppeltes Attribut) → BESCHAEDIGT", async () => {
    const r = await parseDatei({ buffer: anhaengen("<row r=\"4\" x:r=\"50000\"><c><v>7</v></c></row>"), name: "p.xlsx", grenzen: g });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.blaetter).toBeUndefined();
  });
  it("M1-PoC: <ext r=\"50000\"> nach der letzten Zeile → BESCHAEDIGT", async () => {
    const r = await parseDatei({ buffer: anhaengen("<ext r=\"50000\"><c><v>7</v></c></ext>"), name: "p.xlsx", grenzen: g });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.blaetter).toBeUndefined();
  });
  it("M1-PoC: r=\"&#53;\" (Entität im r-Wert) → BESCHAEDIGT", async () => {
    const r = await parseDatei({ buffer: anhaengen("<row r=\"&#53;\"><c><v>7</v></c></row>"), name: "p.xlsx", grenzen: g });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.blaetter).toBeUndefined();
  });
  it("M1: ungültige c-r-Werte und doppelte Zellattribute → BESCHAEDIGT", async () => {
    for (const zelle of ['<c r="A&#53;"><v>7</v></c>', '<c r="a3"><v>7</v></c>', '<c r="3A"><v>7</v></c>', '<c r="A0"><v>7</v></c>',
      '<c r="A3" R="A50000"><v>7</v></c>', '<c r="A3" x:r="A50000"><v>7</v></c>', '<c r="A3" s="0" s="1"><v>7</v></c>']) {
      const r = await parseDatei({ buffer: anhaengen(`<row r="3">${zelle}</row>`), name: "p.xlsx", grenzen: g });
      expect(r, zelle).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    }
  });
  it("M1: ohne Ablehnung im Vorfilter greift die Prüfung der tatsächlich gelesenen Zeilen (kein sheetRows)", async () => {
    /* Zelle mit gültigem r weit unten in einer niedrig nummerierten Zeile: SheetJS legt sie an Position 50000 ab */
    const r = await parseDatei({ buffer: anhaengen('<row r="3"><c r="A50000"><v>7</v></c></row>'), name: "p.xlsx", grenzen: g });
    expect(r).toMatchObject({ ok: false, code: "ZU_VIELE_ZEILEN" });
  });
});

describe("Review 1da3ceb M2: Archivnamen wie SheetJS normalisiert", () => {
  const mitZusatz = (name, inhalt) => {
    const e = zipEintraege(mappe({ S: [["a"], [1]] }));
    e.push({ name, daten: B(inhalt ?? e.find((x) => x.name === "xl/worksheets/sheet1.xml").daten.toString("utf8")) });
    return neuPacken(e);
  };
  it("M2-PoC: xl/worksheets/sheet1.xml und /xl/worksheets/sheet1.xml in einer Datei → BESCHAEDIGT", async () => {
    const r = await parseDatei({ buffer: mitZusatz("/xl/worksheets/sheet1.xml"), name: "n.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.blaetter).toBeUndefined();
  });
  it("M2: // wird zu / zusammengefasst (Doppel nach Normalisierung) → BESCHAEDIGT", async () => {
    expect(await parseDatei({ buffer: mitZusatz("xl//worksheets/sheet1.xml"), name: "n.xlsx" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(await parseDatei({ buffer: mitZusatz("/XL/Worksheets/Sheet1.xml"), name: "n.xlsx" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
  });
  it("M2: Steuerzeichen \\u0000–\\u0006 und Backslash im Namen → BESCHAEDIGT", async () => {
    for (const name of ["xl\\worksheets\\sheet2.xml", "xl/worksheets/sheet\u00002.xml", "xl/work\u0001sheets/x.xml", "docProps/a\u0006.xml"]) {
      const r = await parseDatei({ buffer: mitZusatz(name, "<x/>"), name: "n.xlsx" });
      expect(r, JSON.stringify(name)).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    }
  });
  it("M2: Archiv mit führendem / in allen Namen wird wie bei SheetJS gelesen", async () => {
    const e = zipEintraege(mappe({ S: [["a"], [1]] })).map((x) => ({ ...x, name: `/${x.name}` }));
    const r = await parseDatei({ buffer: neuPacken(e), name: "n.xlsx" });
    expect(r.ok, JSON.stringify(r).slice(0, 300)).toBe(true);
    expect(r.format).toBe("xlsx");
    expect(r.blaetter[0].zeilen).toEqual([["a"], [1]]);
  });
});

/* ==========================================================================
   Befunde aus dem Sicherheitsreview von 8725dc5 (PR #123), umgesetzt über die
   Entscheidungen E1–E7 (Nachweis: docs/acc45/IMP-2-NACHWEIS.md, Abschnitt 9).
   Jede Sicherheitsprüfung war vor der Korrektur rot; Absicherungen sind benannt.
   ========================================================================== */
const ODS_MELDUNG = /OpenDocument-Tabellen \(ODS\) werden derzeit nicht unterstützt/;
const CT_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const eintrag = (e, name) => e.find((x) => x.name === name);
const textVon = (e, name) => eintrag(e, name).daten.toString("utf8");
const setze = (e, name, d) => {
  const daten = Buffer.isBuffer(d) ? d : B(d);
  const x = eintrag(e, name);
  if (x) x.daten = daten; else e.push({ name, daten });
};
const umbenennen = (e, alt, neu) => { eintrag(e, alt).name = neu; };
/** Datei umbauen: fn erhält die Eintragsliste und ändert sie. */
function umbau(buf, fn) {
  const e = zipEintraege(buf);
  fn(e);
  return neuPacken(e);
}
function zufall(n) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let s = 987654321; const t = new Array(n);
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; t[i] = abc[s >>> 26]; }
  return t.join("");
}

describe("Review 8725dc5 E1: ODS wird derzeit nicht unterstützt", () => {
  it("E1-PoC: getarnte ODS (xlsx-Teile plus META-INF/manifest.xml und content.xml) → NICHT_UNTERSTUETZT, nicht als ODS gelesen", async () => {
    const odsTeile = zipEintraege(mappe({ S: [["odsgeheim"], [1]] }, "ods")).filter((x) => x.name !== "mimetype");
    const xl = zipEintraege(mappe({ S: [["a"], [1]] }));
    const buf = neuPacken([...xl, ...odsTeile]);
    const r = await parseDatei({ buffer: buf, name: "tarn.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    expect(r.nachricht).toMatch(ODS_MELDUNG);
    expect(JSON.stringify(r)).not.toContain("odsgeheim");
    /* UOC-Variante: objectdata.xml genügt SheetJS ebenfalls für den ODS-Leser */
    const uoc = neuPacken([...xl, { name: "objectdata.xml", daten: eintrag(odsTeile, "content.xml").daten }]);
    expect(await parseDatei({ buffer: uoc, name: "tarn.xlsx" })).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
  });
  it("E1: echte ODS-Datei (auch mit Endung .xlsx oder .xls) → NICHT_UNTERSTUETZT mit verständlicher Meldung", async () => {
    const ods = mappe({ S: [["a"], [1]] }, "ods");
    for (const name of ["d.ods", "d.xlsx", "d.xls"]) {
      const r = await parseDatei({ buffer: ods, name });
      expect(r, name).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
      expect(r.nachricht, name).toMatch(ODS_MELDUNG);
      expect(r.nachricht, name).toMatch(/bitte als XLSX oder CSV speichern/);
      expect(r.blaetter, name).toBeUndefined();
    }
  });
  it("E1-PoC null-date/Unicode: ODS mit null-date (1904, auch mit Unicode-Präfix nach der Tabelle) → NICHT_UNTERSTUETZT", async () => {
    const ods = mappe({ S: [["Datum"], [new Date(2024, 0, 15)]] }, "ods", { cellDates: true }, { date1904: true });
    expect(await parseDatei({ buffer: ods, name: "n.ods" })).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    const unicode = gleicheTextErsetzung(ods, "content.xml", (x) => {
      const block = /<table:calculation-settings[\s\S]*?<\/table:calculation-settings>/.exec(x)[0];
      const umbenannt = block.replace(/table:null-date/g, "täble:null-date").replace(/table:date-value/g, "täble:date-value");
      return x.replace(block, "").replace("</office:spreadsheet>", `${umbenannt}</office:spreadsheet>`);
    });
    const r = await parseDatei({ buffer: unicode, name: "n.ods" });
    expect(r).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    expect(r.blaetter).toBeUndefined();
  });
  it("E1-PoC Tabellen-Alias: ODS mit Tabellen-Element unter anderem Präfix → NICHT_UNTERSTUETZT", async () => {
    const ods = mappe({ S: [["a"], [1]] }, "ods");
    const alias = gleicheTextErsetzung(ods, "content.xml", (x) => x
      .replace(/<table:table /g, '<t:table xmlns:t="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ')
      .replace(/<\/table:table>/g, "</t:table>"));
    const r = await parseDatei({ buffer: alias, name: "a.ods" });
    expect(r).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    expect(r.nachricht).toMatch(ODS_MELDUNG);
  });
});

describe("Review 8725dc5 E3/E4: Format wie SheetJS bestimmen, strikte Paketprüfung xlsx", () => {
  it("E3-PoC: getarnte xlsb (wb.bin in [Content_Types].xml, leere xl/workbook.xml) → NICHT_UNTERSTUETZT", async () => {
    const tarn = umbau(mappe({ S: [["xlsbgeheim"], [1]] }, "xlsb"), (e) => {
      umbenennen(e, "xl/workbook.bin", "xl/wb.bin");
      umbenennen(e, "xl/_rels/workbook.bin.rels", "xl/_rels/wb.bin.rels");
      setze(e, "[Content_Types].xml", textVon(e, "[Content_Types].xml").replace("/xl/workbook.bin", "/xl/wb.bin"));
      setze(e, "_rels/.rels", textVon(e, "_rels/.rels").replace("xl/workbook.bin", "xl/wb.bin"));
      setze(e, "xl/workbook.xml", "");
    });
    const r = await parseDatei({ buffer: tarn, name: "tarn.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    expect(JSON.stringify(r)).not.toContain("xlsbgeheim");
    /* Variante: xlsx-Inhaltstyp, aber Arbeitsmappe mit Endung .bin (SheetJS liest dann binär) */
    const tarn2 = umbau(tarn, (e) => {
      setze(e, "[Content_Types].xml", textVon(e, "[Content_Types].xml")
        .replace('PartName="/xl/wb.bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"', `PartName="/xl/wb.bin" ContentType="${CT_XLSX}"`));
    });
    expect(textVon(zipEintraege(tarn2), "[Content_Types].xml")).toContain(`PartName="/xl/wb.bin" ContentType="${CT_XLSX}"`);
    const r2 = await parseDatei({ buffer: tarn2, name: "tarn.xlsx" });
    expect(r2).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    expect(JSON.stringify(r2)).not.toContain("xlsbgeheim");
  });
  it("E4: Arbeitsmappen-Inhaltstyp: Vorlage, Add-in oder fehlend → NICHT_UNTERSTUETZT; zwei Arbeitsmappen → BESCHAEDIGT", async () => {
    const mitCt = (fn) => umbau(mappe({ S: [["a"], [1]] }), (e) => setze(e, "[Content_Types].xml", fn(textVon(e, "[Content_Types].xml"))));
    const vorlage = mitCt((x) => x.replace(CT_XLSX, "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml"));
    expect(await parseDatei({ buffer: vorlage, name: "v.xltx" })).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    const addin = mitCt((x) => x.replace(CT_XLSX, "application/vnd.ms-excel.addin.macroEnabled.main+xml"));
    expect(await parseDatei({ buffer: addin, name: "v.xlam" })).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    const ohne = mitCt((x) => x.replace(`<Override PartName="/xl/workbook.xml" ContentType="${CT_XLSX}"/>`, ""));
    expect(textVon(zipEintraege(ohne), "[Content_Types].xml")).not.toContain(CT_XLSX);
    expect(await parseDatei({ buffer: ohne, name: "v.xlsx" })).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    const zwei = mitCt((x) => x.replace("</Types>", `<Override PartName="/xl/workbook2.xml" ContentType="${CT_XLSX}"/></Types>`));
    expect(await parseDatei({ buffer: zwei, name: "v.xlsx" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
  });
  it("E4: Makro-Arbeitsmappentyp: Datei wird abgewiesen (NICHT_UNTERSTUETZT), keine Datenübernahme", async () => {
    const xlsm = umbau(mappe({ S: [["a"], [1]] }), (e) => setze(e, "[Content_Types].xml",
      textVon(e, "[Content_Types].xml").replace(CT_XLSX, "application/vnd.ms-excel.sheet.macroEnabled.main+xml")));
    const r = await parseDatei({ buffer: xlsm, name: "m.xlsm" });
    /* imp-2-fix4: Erwartung ersetzt (vorher ok:true, Daten, Hinweis MAKROS_VERWORFEN). */
    expect(r, JSON.stringify(r)).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    expect(r.blaetter).toBeUndefined();
    expect(hat(r, "MAKROS_VERWORFEN")).toBe(false);
  });
  it("xlsm wird nicht gelesen: NICHT_UNTERSTUETZT mit Hinweistext, keine Daten, kein Teilergebnis", async () => {
    const xlsm = umbau(mappe({ S: [["a"], [1]] }), (e) => setze(e, "[Content_Types].xml",
      textVon(e, "[Content_Types].xml").replace(CT_XLSX, "application/vnd.ms-excel.sheet.macroEnabled.main+xml")));
    for (const name of ["m.xlsm", "m.xlsx"]) {
      const r = await parseDatei({ buffer: xlsm, name });
      expect(r, name).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
      expect(r.nachricht ?? r.meldung ?? JSON.stringify(r), name).toContain("Dateien mit Makros (xlsm) werden nicht gelesen. Bitte die Datei als .xlsx speichern (Makros entfernen).");
      expect(r.blaetter, name).toBeUndefined();
      expect(r.hinweise?.some((x) => x.code === "MAKROS_VERWORFEN") ?? false, name).toBe(false);
    }
  });
  it("E4-PoC: Blatt mit Endung .dat (oder ohne Endung) und r=\"&#53;\" wird vorab geprüft → BESCHAEDIGT", async () => {
    for (const ziel of ["sheet1.dat", "blatt"]) {
      const dat = (zusatz) => umbau(mappe({ S: [["h"], [1]] }), (e) => {
        umbenennen(e, "xl/worksheets/sheet1.xml", `xl/worksheets/${ziel}`);
        setze(e, `xl/worksheets/${ziel}`, textVon(e, `xl/worksheets/${ziel}`).replace("</sheetData>", `${zusatz}</sheetData>`));
        setze(e, "xl/_rels/workbook.xml.rels", textVon(e, "xl/_rels/workbook.xml.rels").replace("worksheets/sheet1.xml", `worksheets/${ziel}`));
        setze(e, "[Content_Types].xml", textVon(e, "[Content_Types].xml").replace("/xl/worksheets/sheet1.xml", `/xl/worksheets/${ziel}`));
      });
      const r = await parseDatei({ buffer: dat('<row r="&#53;"><c><v>7</v></c></row>'), name: "d.xlsx" });
      expect(r, ziel).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
      expect(r.blaetter, ziel).toBeUndefined();
      /* Absicherung: dieselbe Datei ohne den Fehler wird gelesen */
      const ok = await parseDatei({ buffer: dat(""), name: "d.xlsx" });
      expect(ok.ok, `${ziel} ${JSON.stringify(ok).slice(0, 300)}`).toBe(true);
      expect(ok.blaetter[0].zeilen, ziel).toEqual([["h"], [1]]);
    }
  });
  it("E3/E4: binäres Blatt (.bin) in einer xlsx wird nicht an SheetJS gegeben → NICHT_UNTERSTUETZT", async () => {
    const binBlatt = eintrag(zipEintraege(mappe({ S: [["bingeheim"], [1]] }, "xlsb")), "xl/worksheets/sheet1.bin").daten;
    const buf = umbau(mappe({ S: [["a"], [1]] }), (e) => {
      setze(e, "xl/worksheets/sheet1.bin", binBlatt);
      setze(e, "xl/_rels/workbook.xml.rels", textVon(e, "xl/_rels/workbook.xml.rels").replace("worksheets/sheet1.xml", "worksheets/sheet1.bin"));
    });
    const r = await parseDatei({ buffer: buf, name: "b.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    expect(JSON.stringify(r)).not.toContain("bingeheim");
  });
  it("E3: Numbers-Paket, verschachteltes Index.zip und ZIP ohne [Content_Types].xml → NICHT_UNTERSTUETZT", async () => {
    const numbers = zip([{ name: "Index/Document.iwa", daten: B("x") }, { name: "[Content_Types].xml", daten: B("<Types/>") }]);
    expect(await parseDatei({ buffer: numbers, name: "n.xlsx" })).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    const verschachtelt = zip([{ name: "Index.zip", daten: mappe({ S: [["a"], [1]] }) }]);
    expect(await parseDatei({ buffer: verschachtelt, name: "n.xlsx" })).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    const ohneCt = umbau(mappe({ S: [["a"], [1]] }), (e) => e.splice(e.indexOf(eintrag(e, "[Content_Types].xml")), 1));
    expect(await parseDatei({ buffer: ohneCt, name: "n.xlsx" })).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
  });
  it("Nach dem Lesen wird bookType mit dem erkannten Format abgeglichen (Abweichung → BESCHAEDIGT)", () => {
    expect(typeof kern.buchtypPasst).toBe("function");
    expect(kern.buchtypPasst("xlsx", "xlsx")).toBe(true);
    expect(kern.buchtypPasst("xlsx", "xlsb")).toBe(false);
    expect(kern.buchtypPasst("xlsx", "ods")).toBe(false);
    expect(kern.buchtypPasst("xlsx", undefined)).toBe(false);
    expect(kern.buchtypPasst("xls", undefined)).toBe(true);
    expect(kern.buchtypPasst("xls", "xlsx")).toBe(false);
  });
});

describe("Review 8725dc5 E6: Kodierung der XML-Teile (UTF-8 wie SheetJS erwartet)", () => {
  const mitBlattBytes = (fn) => umbau(mappe({ S: [["a"], [1]] }), (e) => setze(e, "xl/worksheets/sheet1.xml", fn(textVon(e, "xl/worksheets/sheet1.xml"))));
  it("E6-PoC: UTF-16-Blatt mit BOM (LE und BE) → BESCHAEDIGT", async () => {
    const le = mitBlattBytes((x) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(x.replace('encoding="UTF-8"', 'encoding="UTF-16"'), "utf16le")]));
    const r = await parseDatei({ buffer: le, name: "u.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.blaetter).toBeUndefined();
    const be = mitBlattBytes((x) => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(x, "utf16le").swap16()]));
    expect(await parseDatei({ buffer: be, name: "u.xlsx" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
  });
  it("E6: Blatt in anderer Kodierung (Deklaration ISO-8859-1 oder ungültiges UTF-8) → BESCHAEDIGT; UTF-8 mit BOM bleibt lesbar", async () => {
    const latin = mitBlattBytes((x) => x.replace('encoding="UTF-8"', 'encoding="ISO-8859-1"'));
    expect(await parseDatei({ buffer: latin, name: "l.xlsx" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    const kaputt = mitBlattBytes((x) => Buffer.concat([B(x.replace("</sheetData>", "")), Buffer.from([0xf6]), B("</sheetData>")]));
    expect(await parseDatei({ buffer: kaputt, name: "l.xlsx" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    const bom = mitBlattBytes((x) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), B(x)]));
    const ok = await parseDatei({ buffer: bom, name: "b.xlsx" });
    expect(ok.ok, JSON.stringify(ok).slice(0, 300)).toBe(true);
    expect(ok.blaetter[0].zeilen).toEqual([["a"], [1]]);
  });
  it("E6: [Content_Types].xml und Arbeitsmappe als UTF-16 → BESCHAEDIGT", async () => {
    for (const teil of ["[Content_Types].xml", "xl/workbook.xml"]) {
      const buf = umbau(mappe({ S: [["a"], [1]] }), (e) => setze(e, teil, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(textVon(e, teil), "utf16le")])));
      expect(await parseDatei({ buffer: buf, name: "c.xlsx" }), teil).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    }
  });
});

describe("Review 8725dc5 E5: Blattnamen höchstens 31 Zeichen, Hinweise in der Textmenge", () => {
  const mitName = (name, zeilen = [["a"], [1]]) => umbau(mappe({ S: zeilen }), (e) =>
    setze(e, "xl/workbook.xml", textVon(e, "xl/workbook.xml").replace('name="S"', `name="${name}"`)));
  it("E5-PoC: 8-MB-Blattname → BESCHAEDIGT, Meldung ohne den Namen, kleines Ergebnis", async () => {
    const lang = zufall(8 * 1024 * 1024);
    const buf = mitName(lang);
    expect(buf.length).toBeLessThan(10 * 1024 * 1024);
    const r = await parseDatei({ buffer: buf, name: "n.xlsx" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.nachricht).not.toContain(lang.slice(0, 32));
    expect(JSON.stringify(r).length).toBeLessThan(2000);
  });
  it("E5-PoC: Blattname über 31 Zeichen erscheint nicht in Fehlertexten (z. B. ZU_VIELE_ZEILEN)", async () => {
    const lang = "Langer_Blattname_mit_40_Zeichen_ABCDEFGH";
    expect(lang).toHaveLength(40);
    const r = await parseDatei({ buffer: mitName(lang, [["h"], [1], [2], [3]]), name: "n.xlsx", grenzen: { zeilen: 1 } });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.nachricht).not.toContain(lang);
    expect(r.nachricht).toMatch(/31 Zeichen/);
  });
  it("E5: Blattname mit genau 31 Zeichen ist zulässig, mit 32 nicht", async () => {
    const n31 = "B".repeat(31);
    const ok = await parseDatei({ buffer: mitName(n31), name: "n.xlsx" });
    expect(ok.ok).toBe(true);
    expect(ok.blaetter[0].name).toBe(n31);
    const zu = await parseDatei({ buffer: mitName("B".repeat(32)), name: "n.xlsx" });
    expect(zu).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(zu.nachricht).not.toContain("B".repeat(32));
  });
  it("E5/H2: Hinweistexte zählen zur Textmenge", async () => {
    const g = { entpacktBytes: 1000 };
    const mit = await parseDatei({ buffer: B(`a\n${"x".repeat(980)}\n\n\n`), name: "t.csv", grenzen: g });
    expect(mit).toMatchObject({ ok: false, code: "TEXT_ZU_GROSS" });
    expect(mit.blaetter).toBeUndefined();
    /* Absicherung: ohne die Hinweise passt dieselbe Textmenge */
    const ohne = await parseDatei({ buffer: B(`a\n${"x".repeat(980)}\n`), name: "t.csv", grenzen: g });
    expect(ohne.ok, JSON.stringify(ohne).slice(0, 200)).toBe(true);
  });
});

describe("Review 8725dc5 E7: Spalten-Fallback (Zelle ohne r) begrenzt", () => {
  const g = { zeilen: 5 };
  const anhaengen = (teil) => mitBlatt(mappe({ S: [["h"], [1]] }), (x) => x.replace("</sheetData>", `${teil}</sheetData>`));
  it("E7-PoC: Zelle ohne r mit fremdem Spaltenkürzel (xr=\"…\" oder r= in einem Kindelement) → BESCHAEDIGT", async () => {
    for (const zelle of ['<c xr="XFE"><v>7</v></c>', '<c xr="B"><v>7</v></c>', '<c><v>7</v><x r="ZZ9"/></c>', '<c xr="Q" r="C3"><v>7</v></c>']) {
      const r = await parseDatei({ buffer: anhaengen(`<row r="3">${zelle}</row>`), name: "s.xlsx", grenzen: g });
      expect(r, zelle).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
      expect(r.blaetter, zelle).toBeUndefined();
    }
  });
  it("E7: fortlaufende Spalte ohne r über XFD hinaus → BESCHAEDIGT; innerhalb normal gelesen", async () => {
    const leer = "<c/>".repeat(16384);
    const r = await parseDatei({ buffer: anhaengen(`<row r="3">${leer}<c><v>7</v></c></row>`), name: "s.xlsx", grenzen: g });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    const ok = await parseDatei({ buffer: anhaengen('<row r="3"><c><v>7</v></c><c><v>8</v></c></row>'), name: "s.xlsx", grenzen: g });
    expect(ok.ok, JSON.stringify(ok).slice(0, 300)).toBe(true);
    expect(ok.blaetter[0].zeilen).toEqual([["h", null], [1, null], [7, 8]]);
  });
});

describe("Review 8725dc5 E2: XLS nur mit plausibler CFB-Struktur", () => {
  /** Ort eines FAT-Eintrags (Sektor s) und eines Verzeichniseintrags (Strom) in einer CFB-Datei. */
  const cfb = (buf) => {
    const ssz = 1 << buf.readUInt16LE(0x1e);
    const fatOrt = (s) => (buf.readInt32LE(0x4c + 4 * Math.floor((s * 4) / ssz)) + 1) * ssz + ((s * 4) % ssz);
    const eintragOrt = (name) => {
      const n = Buffer.from(name, "utf16le");
      for (let p = buf.indexOf(n); p >= 0; p = buf.indexOf(n, p + 1)) if ((p - ssz) % 128 === 0 && buf.readUInt8(p + 66) === 2) return p;
      return -1;
    };
    return { ssz, fatOrt, eintragOrt };
  };
  const gross = () => {
    const z = [["Nr", "Text"]]; for (let i = 0; i < 3000; i++) z.push([i, `t${i}`]);
    return mappe({ S: z }, "xls");
  };
  it("E2-PoC: zyklische Sektorkette im Workbook-Strom → BESCHAEDIGT (statt Endlosschleife bis zum Zeitlimit)", async () => {
    const buf = gross();
    const c = cfb(buf);
    const p = c.eintragOrt("Workbook");
    expect(p).toBeGreaterThan(0);
    const s0 = buf.readInt32LE(p + 116);
    expect(buf.readInt32LE(p + 120)).toBeGreaterThanOrEqual(4096);
    const kette = [s0];
    for (let s = buf.readInt32LE(c.fatOrt(s0)); s >= 0; s = buf.readInt32LE(c.fatOrt(s))) kette.push(s);
    expect(kette.length).toBeGreaterThan(3);
    buf.writeInt32LE(kette[1], c.fatOrt(kette[kette.length - 1])); /* letzter Sektor zeigt zurück auf den zweiten */
    buf.writeInt32LE(kette[1], p + 116); /* Strom beginnt mitten in der Kette */
    const t0 = Date.now();
    const r = await parseDatei({ buffer: buf, name: "z.xls", grenzen: { zeitMs: 8000 } });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it("E2-PoC: Stromgröße größer als seine Sektorkette (Größenbudget vor dem Lesen) → BESCHAEDIGT", async () => {
    const buf = gross();
    const p = cfb(buf).eintragOrt("Workbook");
    buf.writeInt32LE(0x7ffffff0, p + 120);
    const r = await parseDatei({ buffer: buf, name: "g.xls" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.blaetter).toBeUndefined();
  });
  it("E2: OLE-Datei ohne Workbook-/Book-Strom → NICHT_UNTERSTUETZT", async () => {
    const buf = mappe({ S: [["a"], [1]] }, "xls");
    const p = cfb(buf).eintragOrt("Workbook");
    expect(p).toBeGreaterThan(0);
    Buffer.from("Workbooq", "utf16le").copy(buf, p);
    const r = await parseDatei({ buffer: buf, name: "o.xls" });
    expect(r).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
  });
  it("E2: falsche Sektorgröße oder Mini-Sektorgröße → BESCHAEDIGT; gültige große XLS wird gelesen (Absicherung)", async () => {
    const a = mappe({ S: [["a"], [1]] }, "xls"); a.writeUInt16LE(10, 0x1e);
    expect(await parseDatei({ buffer: a, name: "a.xls" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    const b = mappe({ S: [["a"], [1]] }, "xls"); b.writeUInt16LE(7, 0x20);
    expect(await parseDatei({ buffer: b, name: "b.xls" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    const ok = await parseDatei({ buffer: gross(), name: "g.xls" });
    expect(ok.ok).toBe(true);
    expect(ok.blaetter[0].zeilen).toHaveLength(3001);
  });
});

describe("Review 8725dc5: 1904-Mappe, Zeitformat mit echtem Datum (dokumentiertes Verhalten)", () => {
  it("Wert v ≥ 1 mit reinem Zeitformat (hh:mm) wird in der 1904-Mappe nicht verschoben; mit Datumsteil schon", async () => {
    const inhalt = { Z: [["Zeit", "DatumZeit"], [{ t: "n", v: 45306.25, z: "hh:mm" }, { t: "n", v: 45306.25, z: "dd.mm.yyyy hh:mm" }]] };
    for (const fmt of ["xlsx", "xls"]) {
      const r = await parseDatei({ buffer: mappe(inhalt, fmt, {}, { date1904: true }), name: `z.${fmt}` });
      expect(r.ok, fmt).toBe(true);
      expect(r.datumssystemQuelle, fmt).toBe("1904");
      expect(r.blaetter[0].zeilen[1][0], fmt).toMatchObject({ typ: "datum", roh: 45306.25 });
      expect(r.blaetter[0].zeilen[1][1], fmt).toMatchObject({ typ: "datum", roh: 45306.25 + 1462 });
    }
  });
});

describe("Review bbf64ca (imp-2-fix5): CFB-Verzeichnisbaum und Strom unter der Wurzel", () => {
  /** Verzeichnissektor 0 einer XLS; Eintrag i liegt bei dir + 128 * i (Zeiger: links +68, rechts +72, Kind +76). */
  const verz = (buf) => {
    const ssz = 1 << buf.readUInt16LE(0x1e);
    const dir = (buf.readInt32LE(0x30) + 1) * ssz;
    return { eintrag: (i) => dir + 128 * i };
  };
  const gross = () => {
    const z = [["Nr", "Text"]]; for (let i = 0; i < 3000; i++) z.push([i, `t${i}`]);
    return mappe({ S: z }, "xls");
  };
  it("A1-PoC: gültige XLS, Baumzeiger der Einträge 2 und 3 zeigen aufeinander → BESCHAEDIGT in unter 2 s (statt Zeitlimit)", async () => {
    const buf = gross();
    const v = verz(buf);
    /* Eintrag 3 war unbenutzt: als Strom anlegen und mit Eintrag 2 (Workbook) zu einem Zyklus verbinden. */
    expect(buf[v.eintrag(2) + 66]).toBe(2);
    expect(buf[v.eintrag(3) + 66]).toBe(0);
    buf.writeUInt16LE(4, v.eintrag(3) + 64); buf.write("x", v.eintrag(3), "utf16le");
    buf[v.eintrag(3) + 66] = 2;
    buf.writeInt32LE(3, v.eintrag(2) + 72); /* 2.rechts → 3 */
    buf.writeInt32LE(2, v.eintrag(3) + 68); /* 3.links → 2 */
    const t0 = Date.now();
    const r = await parseDatei({ buffer: buf, name: "zyklus.xls" });
    const dauer = Date.now() - t0;
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(dauer).toBeLessThan(2000);
  });
  it("A1: Zeiger außerhalb der Einträge, mehrfach erreichbarer Eintrag und Selbstverweis → BESCHAEDIGT", async () => {
    const a = gross(); const va = verz(a);
    a.writeInt32LE(99, va.eintrag(2) + 72);
    expect(await parseDatei({ buffer: a, name: "a.xls" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    const b = gross(); const vb = verz(b);
    b.writeInt32LE(2, vb.eintrag(0) + 68); /* Wurzel.links → 2, 2 ist auch über Kind 1 erreichbar */
    expect(await parseDatei({ buffer: b, name: "b.xls" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    const c = gross(); const vc = verz(c);
    c.writeInt32LE(2, vc.eintrag(2) + 68);
    expect(await parseDatei({ buffer: c, name: "c.xls" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
  });
  it("A1 Gegenprobe: gültige XLS (mit Verzeichnisbaum) wird weiter gelesen", async () => {
    const r = await parseDatei({ buffer: gross(), name: "ok.xls" });
    expect(r.ok).toBe(true);
    expect(r.blaetter[0].zeilen).toHaveLength(3001);
  });
  it("A2-PoC: CFB mit /Sub/Workbook und /PerfectOffice_MAIN (WK3-Daten) → NICHT_UNTERSTUETZT", async () => {
    /* WK3: Kopfsatz (Version 0x1000), zwei Beschriftungszellen, Ende; SheetJS liest das als Tabelle. */
    const wk3 = Buffer.from([0, 0, 2, 0, 0, 0x10, 0x0f, 0, 7, 0, 0x27, 0, 0, 0, 0, 0x61, 0, 0x0f, 0, 7, 0, 0x27, 0, 0, 1, 0, 0x62, 0, 0x01, 0, 0, 0]);
    const buf = cfbDatei([
      { pfad: "/Sub/Workbook", daten: workbookStrom(mappe({ S: [["a"], [1]] }, "xls")) },
      { pfad: "/PerfectOffice_MAIN", daten: wk3 },
    ]);
    const r = await parseDatei({ buffer: buf, name: "q.xls" });
    expect(r).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
  });
  it("A2: Quattro-Pro-/Lotus-Ströme (NativeContent_MAIN, MN0) ohne Workbook/Book unter der Wurzel → NICHT_UNTERSTUETZT", async () => {
    for (const name of ["NativeContent_MAIN", "MN0"]) {
      const r = await parseDatei({ buffer: cfbDatei([{ pfad: "/" + name, daten: Buffer.alloc(64, 1) }]), name: "q.xls" });
      expect(r, name).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
    }
  });
  it("A2: leerer Workbook-Strom (Größe 0) unter der Wurzel zählt nicht → NICHT_UNTERSTUETZT", async () => {
    const buf = cfbDatei([{ pfad: "/Workbook", daten: Buffer.alloc(0) }, { pfad: "/MN0", daten: Buffer.alloc(64, 1) }]);
    expect(await parseDatei({ buffer: buf, name: "q.xls" })).toMatchObject({ ok: false, code: "NICHT_UNTERSTUETZT" });
  });
  it("A2 Gegenprobe: normale XLS mit Workbook unter der Wurzel bleibt ok", async () => {
    const r = await parseDatei({ buffer: mappe({ S: [["a"], [1]] }, "xls"), name: "n.xls" });
    expect(r.ok).toBe(true);
    expect(r.format).toBe("xls");
  });
});

/* ==========================================================================
   Sicherheitsreview 561dd32 (imp-2-fix6): K1, K2, H2a–d, H1.
   Nachweis: docs/acc45/IMP-2-NACHWEIS.md, Abschnitt 11.
   ========================================================================== */
describe("Review 561dd32 (imp-2-fix6): Verzeichnisbaum, Sektorketten, Workbook-Auswahl, Kindprozess", () => {
  const ATTRAPPE = new URL("./hilfen/import-kind-attrappe.mjs", import.meta.url);
  const prozess = () => import("../server/lib/import/parser-prozess.mjs");
  const OK_DATEN = [["a", "b"], [1, 2]];
  /** wartet, bis der Prozess pid nicht mehr existiert (kein Zombie, kein Waisenprozess) */
  const beendet = async (pid) => {
    for (let i = 0; i < 50; i++) {
      try { process.kill(pid, 0); } catch (e) { if (e.code === "ESRCH") return true; }
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };
  /** RSS-Spitze des Server-(Test-)Prozesses während fn, in MB über dem Ausgangswert */
  const rssZuwachs = async (fn) => {
    const vorher = process.memoryUsage().rss;
    let spitze = vorher;
    const iv = setInterval(() => { spitze = Math.max(spitze, process.memoryUsage().rss); }, 20);
    try { return { wert: await fn() }; } finally {
      clearInterval(iv);
      spitze = Math.max(spitze, process.memoryUsage().rss);
      rssZuwachs.letzter = Math.round((spitze - vorher) / 1048576);
    }
  };
  /** XLS mit Workbook und n weiteren Strömen unter der Wurzel sowie einem Unterordner (von SheetJS geschrieben: rechts verkettete Liste). */
  const vieleStroeme = (n) => {
    const e = [{ pfad: "/Workbook", daten: workbookStrom(mappe({ S: OK_DATEN }, "xls")) }];
    for (let i = 0; i < n; i++) e.push({ pfad: `/S${String(i).padStart(3, "0")}`, daten: Buffer.alloc(16, i & 255) });
    for (let i = 0; i < 10; i++) e.push({ pfad: `/Ordner/T${i}`, daten: Buffer.alloc(16, 1) });
    return cfbDatei(e);
  };
  const wurzelKinder = (buf) => { const E = cfbEintraege(buf); const k = []; for (let i = E[0].C; i !== -1; i = E[i].R) k.push(i); return k; };
  /** baut den Geschwisterbaum unter der Wurzel neu: "links-absteigend" (entarteter Baum) oder ausgeglichen über die gegebene Reihenfolge */
  const baumNeu = (buf, kinder, art) => {
    for (const i of kinder) cfbSetze(buf, i, { L: -1, R: -1 });
    if (art === "links-absteigend") {
      const s = [...kinder].sort((a, b) => b - a);
      cfbSetze(buf, 0, { C: s[0] });
      for (let k = 0; k + 1 < s.length; k++) cfbSetze(buf, s[k], { L: s[k + 1] });
    } else {
      const bau = (a) => { if (!a.length) return -1; const m = a.length >> 1; cfbSetze(buf, a[m], { L: bau(a.slice(0, m)), R: bau(a.slice(m + 1)) }); return a[m]; };
      cfbSetze(buf, 0, { C: bau(kinder) });
    }
    return buf;
  };
  const gemischt = (a, saat) => { const b = [...a]; let s = saat; for (let i = b.length - 1; i > 0; i--) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const j = s % (i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  /* ---------------------------------- K1 ---------------------------------- */
  it("K1-PoC a: unbenutzte, nicht erreichbare Einträge lassen die Warteschlange von build_full_paths wachsen → BESCHAEDIGT in unter 2 s", async () => {
    const buf = poc561.k1Warteschlange();
    const t0 = Date.now();
    const r = await parseDatei({ buffer: buf, name: "k1a.xls" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(r.blaetter).toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("K1-PoC b: Kind-Zeiger unbenutzter Einträge bilden eine Schleife der dad-Kette → BESCHAEDIGT in unter 2 s", async () => {
    const t0 = Date.now();
    const r = await parseDatei({ buffer: poc561.k1DadSchleife(), name: "k1b.xls" });
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("K1: Zeiger auf nicht vorhandene Einträge werden bei ALLEN Einträgen geprüft (auch unbenutzte) → BESCHAEDIGT in der Vorprüfung", async () => {
    const buf = poc561.k1ZeigerAusserhalb();
    expect(() => kern.pruefeCfb(buf, STANDARD_GRENZEN)).toThrow(/Verzeichniszeiger/);
    expect(() => kern.pruefeCfb(poc561.k1Warteschlange(), STANDARD_GRENZEN)).toThrow(/Verzeichnisbaum/);
    expect(() => kern.pruefeCfb(poc561.k1DadSchleife(), STANDARD_GRENZEN)).toThrow(/Verzeichnisbaum/);
    expect(await parseDatei({ buffer: buf, name: "k1c.xls" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
  });
  it("K1 Gegenprobe: von SheetJS erzeugte XLS mit vielen Strömen, entarteter (links absteigender) und ausgeglichener Baum in gemischter Reihenfolge werden gelesen", async () => {
    const faelle = {
      sheetjs: vieleStroeme(200),
      "links-absteigend": (() => { const b = vieleStroeme(200); return baumNeu(b, wurzelKinder(b), "links-absteigend"); })(),
      ausgeglichen: (() => { const b = vieleStroeme(200); return baumNeu(b, gemischt(wurzelKinder(b), 7), "ausgeglichen"); })(),
      "ausgeglichen-klein": (() => { const b = vieleStroeme(5); return baumNeu(b, gemischt(wurzelKinder(b), 3), "ausgeglichen"); })(),
    };
    for (const [art, buf] of Object.entries(faelle)) {
      const r = await parseDatei({ buffer: buf, name: `${art}.xls` });
      expect(r.ok, `${art}: ${JSON.stringify(r)}`).toBe(true);
      expect(r.blaetter[0].zeilen, art).toEqual(OK_DATEN);
    }
  });

  /* ---------------------------------- K2 ---------------------------------- */
  it("K2-PoC: absteigend verkettete freie Sektoren (1,4-MB-Datei) → BESCHAEDIGT ohne Speicherwachstum", async () => {
    const buf = cfbAbsteigendeFreieSektoren();
    expect(buf.length).toBeGreaterThan(1.3 * 1024 * 1024);
    expect(buf.length).toBeLessThan(1.5 * 1024 * 1024);
    /* Vorprüfung im Prozess: schnell und ohne nennenswerten Speicher */
    const m0 = process.memoryUsage();
    const t0 = Date.now();
    expect(() => kern.pruefeCfb(buf, STANDARD_GRENZEN)).toThrow(/Sektorketten/);
    const m1 = process.memoryUsage();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(m1.arrayBuffers - m0.arrayBuffers).toBeLessThan(32 * 1024 * 1024);
    /* über die Schnittstelle: Server-Prozess wächst nicht (vorher: ca. 2 GB im Server-Prozess, ok:true nach ca. 10 s) */
    const t1 = Date.now();
    const { wert: r } = await rssZuwachs(() => parseDatei({ buffer: buf, name: "k2.xls" }));
    expect(r).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
    console.log(`[Messung 561dd32] K2 parseDatei: ${Date.now() - t1} ms, RSS-Zuwachs Server-Prozess ${rssZuwachs.letzter} MB`);
    expect(Date.now() - t1).toBeLessThan(3000);
    expect(rssZuwachs.letzter).toBeLessThan(200);
  });
  it("K2 Gegenprobe: gültige XLS mit großem Füllstrom und große XLS (3000 Zeilen) sind nicht betroffen", async () => {
    const pad = cfbDatei([{ pfad: "/Workbook", daten: workbookStrom(mappe({ S: OK_DATEN }, "xls")) }, { pfad: "/Pad", daten: Buffer.alloc(2735 * 512, 1) }]);
    const r = await parseDatei({ buffer: pad, name: "pad.xls" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.blaetter[0].zeilen).toEqual(OK_DATEN);
    const z = [["Nr", "Text"]]; for (let i = 0; i < 3000; i++) z.push([i, `t${i}`]);
    const gross = await parseDatei({ buffer: mappe({ S: z }, "xls"), name: "g.xls" });
    expect(gross.ok).toBe(true);
    expect(gross.blaetter[0].zeilen).toHaveLength(3001);
  });
  it("K2: einzelne rückwärts verkettete Kette in einer sonst gültigen Datei (Freisektoren) bis 4 × Sektorzahl bleibt lesbar", async () => {
    /* 40 freie Sektoren absteigend verkettet: 40·41/2 = 820 Schritte < 4 × Sektorzahl */
    const buf = cfbDatei([{ pfad: "/Workbook", daten: workbookStrom(mappe({ S: OK_DATEN }, "xls")) }, { pfad: "/Pad", daten: Buffer.alloc(400 * 512, 1) }]);
    const i = cfbIndex(buf, "Pad");
    const kette = [];
    for (let s = cfbEintraege(buf)[i].start; s >= 0; s = buf.readInt32LE(cfbFatOrt(buf, s))) kette.push(s);
    cfbSetze(buf, i, { groesse: 0 });
    for (const s of kette) buf.writeInt32LE(-1, cfbFatOrt(buf, s));
    for (let k = 1; k < 40; k++) buf.writeInt32LE(kette[k - 1], cfbFatOrt(buf, kette[k]));
    const r = await parseDatei({ buffer: buf, name: "frei.xls" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  /* --------------------------------- H2a–d -------------------------------- */
  for (const [titel, art] of [
    ["H2a-PoC: Workbook mit Kelvin-Zeichen (U+212A) und PerfectOffice_MAIN", "h2Kelvin"],
    ["H2b-PoC: Workbook mit Namenslänge 128 Byte und PerfectOffice_MAIN", "h2Namenslaenge"],
    ["H2c-PoC: Workbook mit Größe > 0, aber Start -2 (ohne Inhalt) und PerfectOffice_MAIN", "h2OhneInhalt"],
    ["H2d-PoC: doppelter Name Workbook (erster ohne Inhalt, zweiter mit Inhalt) und PerfectOffice_MAIN", "h2Doppelt"],
  ]) {
    it(`${titel} → NICHT_UNTERSTUETZT oder BESCHAEDIGT, nie ok:true mit format xls`, async () => {
      const r = await parseDatei({ buffer: poc561[art](), name: `${art}.xls` });
      expect(r.ok, JSON.stringify(r)).toBe(false);
      expect(["NICHT_UNTERSTUETZT", "BESCHAEDIGT"]).toContain(r.code);
      expect(r.blaetter).toBeUndefined();
    });
  }
  it("H2d: doppelter Tabellenstrom wird als BESCHAEDIGT gemeldet (mehrdeutig)", async () => {
    expect(await parseDatei({ buffer: poc561.h2Doppelt(), name: "d.xls" })).toMatchObject({ ok: false, code: "BESCHAEDIGT" });
  });
  it("H2 Gegenprobe: Strom „Book“ (ältere Schreibweise) und „WORKBOOK“ in Großbuchstaben werden wie von SheetJS gefunden und gelesen", async () => {
    for (const pfad of ["/Book", "/WORKBOOK"]) {
      const r = await parseDatei({ buffer: cfbDatei([{ pfad, daten: workbookStrom(mappe({ S: OK_DATEN }, "xls")) }]), name: "b.xls" });
      expect(r.ok, `${pfad}: ${JSON.stringify(r)}`).toBe(true);
      expect(r.blaetter[0].zeilen).toEqual(OK_DATEN);
    }
  });

  /* ---------------------------------- H1 ---------------------------------- */
  it("H1: der Parser läuft in einem eigenen Kindprozess (andere Prozessnummer), danach kein aktives Kind und kein Restprozess", async () => {
    const { aktiveKinder } = await prozess();
    const pids = [];
    const r = await parseDatei({ buffer: B("a;b\n1;2\n"), name: "x.csv" }, { beiStart: (pid) => pids.push(pid) });
    expect(r.ok).toBe(true);
    expect(pids).toHaveLength(1);
    expect(pids[0]).not.toBe(process.pid);
    expect(await beendet(pids[0])).toBe(true);
    expect(aktiveKinder()).toEqual([]);
    const a = await parseDatei({ buffer: B("x"), name: "pid" }, { skript: ATTRAPPE });
    expect(a.code).toBe("PID");
    expect(Number(a.nachricht)).not.toBe(process.pid);
  });
  it("H1-PoC: Kind stürzt ab (Heap-Überlauf bei 256 MB) → Server antwortet SPEICHERLIMIT, lebt weiter und liest die nächste Datei", async () => {
    const t0 = Date.now();
    const r = await parseDatei({ buffer: B("x"), name: "heap" }, { skript: ATTRAPPE });
    console.log(`[Messung 561dd32] H1 Heap-Überlauf im Kind: Antwort nach ${Date.now() - t0} ms`);
    expect(r).toEqual({ ok: false, code: "SPEICHERLIMIT", nachricht: expect.stringMatching(/Arbeitsspeicher/) });
    const weiter = await parseDatei({ buffer: B("a;b\n1;2\n"), name: "x.csv" });
    expect(weiter.ok).toBe(true);
  });
  it("H1-PoC: nativer Absturz des Kindes (abort) → VERARBEITUNG_FEHLGESCHLAGEN, Server lebt weiter", async () => {
    const r = await parseDatei({ buffer: B("x"), name: "abbruch" }, { skript: ATTRAPPE });
    expect(r).toMatchObject({ ok: false, code: "VERARBEITUNG_FEHLGESCHLAGEN" });
    expect(r.blaetter).toBeUndefined();
    expect((await parseDatei({ buffer: B("a;b\n1;2\n"), name: "x.csv" })).ok).toBe(true);
  });
  it("H1-PoC: SheetJS selbst stürzt im Kind ab (K1b-Datei ohne Vorprüfung gelesen) → Fehlerantwort, Server-Prozess wächst nicht", async () => {
    const t0 = Date.now();
    const { wert: r } = await rssZuwachs(() => parseDatei({ buffer: poc561.k1DadSchleife(), name: "sheetjs" }, { skript: ATTRAPPE }));
    console.log(`[Messung 561dd32] H1 SheetJS-Absturz im Kind: ${r.code} nach ${Date.now() - t0} ms, RSS-Zuwachs Server-Prozess ${rssZuwachs.letzter} MB`);
    expect(r.ok).toBe(false);
    expect(["SPEICHERLIMIT", "ZEITLIMIT"]).toContain(r.code);
    expect(r.blaetter).toBeUndefined();
    expect(rssZuwachs.letzter).toBeLessThan(200);
  });
  it("H1: Zeitlimit beendet das Kind hart (SIGKILL), Antwort ZEITLIMIT ohne Teilergebnis, kein Restprozess", async () => {
    const { aktiveKinder } = await prozess();
    const pids = [];
    const t0 = Date.now();
    const r = await parseDatei({ buffer: B("x"), name: "haengt", grenzen: { zeitMs: 500 } }, { skript: ATTRAPPE, beiStart: (p) => pids.push(p) });
    expect(r).toMatchObject({ ok: false, code: "ZEITLIMIT" });
    expect(r.blaetter).toBeUndefined();
    console.log(`[Messung 561dd32] H1 Zeitlimit 500 ms: Antwort nach ${Date.now() - t0} ms`);
    /* Schwelle mit Reserve für Prozessstart unter Last (Windows); ohne Kill käme nie eine Antwort */
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(await beendet(pids[0])).toBe(true);
    await new Promise((res) => setTimeout(res, 100));
    expect(aktiveKinder()).toEqual([]);
  });
  it("H1: Standard-Zeitlimit 20 s, Heap des Kindes 256 MB; Ergebnisgröße begrenzt, ungültige Ausgabe und Teilergebnisse werden verworfen", async () => {
    const { KIND_HEAP_MB, kindBefehl } = await prozess();
    expect(STANDARD_GRENZEN.zeitMs).toBe(20000);
    expect(KIND_HEAP_MB).toBe(256);
    expect(kindBefehl("k.mjs", 256, 0).argumente).toContain("--max-old-space-size=256");
    const lx = kindBefehl("k.mjs", 256, 1500000);
    expect(lx.programm).toBe("/bin/sh");
    expect(lx.argumente.join(" ")).toMatch(/ulimit -v "\$1"/);
    expect(lx.argumente).toContain("1500000");
    const gross = await parseDatei({ buffer: B("x"), name: "ausgabe" }, { skript: ATTRAPPE, ausgabeMax: 1024 * 1024 });
    expect(gross).toMatchObject({ ok: false, code: "TEXT_ZU_GROSS" });
    expect(await parseDatei({ buffer: B("x"), name: "unsinn" }, { skript: ATTRAPPE })).toMatchObject({ ok: false, code: "VERARBEITUNG_FEHLGESCHLAGEN" });
    const teil = await parseDatei({ buffer: B("x"), name: "teil" }, { skript: ATTRAPPE });
    expect(teil).toEqual({ ok: false, code: "BESCHAEDIGT", nachricht: "Die Datei ist beschädigt." });
    expect(JSON.stringify(teil)).not.toContain("geheim");
  });
  it.runIf(process.platform === "linux")("H1 (nur Linux): Adressraum-Limit greift für Speicher außerhalb des JS-Heaps; gültige Dateien laufen unter dem Limit", async () => {
    const r = await parseDatei({ buffer: B("x"), name: "extern" }, { skript: ATTRAPPE });
    expect(r.ok).toBe(false);
    expect(["SPEICHERLIMIT", "VERARBEITUNG_FEHLGESCHLAGEN"]).toContain(r.code);
    for (const fmt of ["xlsx", "xls"]) {
      const ok = await parseDatei({ buffer: mappe({ S: OK_DATEN }, fmt), name: `ok.${fmt}` });
      expect(ok.ok, fmt).toBe(true);
    }
  });
  it("H1: Quelltext des Prozessmoduls: nur spawn mit festem Programm, kein shell:true, kein exec, kein Netz, keine Dateien", async () => {
    const { readFile } = await import("node:fs/promises");
    const q = await readFile(new URL("../server/lib/import/parser-prozess.mjs", import.meta.url), "utf8");
    expect(q).toMatch(/import \{ spawn \} from "node:child_process"/);
    expect(q).not.toMatch(/\bexec(Sync|File|FileSync)?\s*\(|spawnSync|fork\s*\(|shell:\s*true/);
    expect(q).not.toMatch(/node:(http|https|net|dns|tls|fs)|\bfetch\s*\(|writeFile|createWriteStream/);
    expect(q).toMatch(/spawn\(programm, argumente, \{[^}]*shell: false/);
    /* Nachreview (Befund 6): wie die bestehende Prüfung der übrigen Parser-Dateien kein eval / new Function */
    expect(q).not.toMatch(/\beval\s*\(|new Function/);
  });
  it("H1 Nachreview (Befund 2): CENTRIC_IMPORT_ADRESSRAUM_KB = 0 oder über 4 GB wird gemeldet (Warnung) und nicht still aufgehoben", async () => {
    const { adressraumKb, ADRESSRAUM_KB_STANDARD, ADRESSRAUM_KB_MAX } = await prozess();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(ADRESSRAUM_KB_MAX).toBe(4 * 1024 * 1024);
      expect(adressraumKb("linux", {})).toBe(ADRESSRAUM_KB_STANDARD);
      expect(adressraumKb("linux", { CENTRIC_IMPORT_ADRESSRAUM_KB: "1500000" })).toBe(1500000);
      expect(warn).not.toHaveBeenCalled();
      /* 0 = aus bleibt möglich (bewusste Entscheidung des Betreibers), aber nie still */
      expect(adressraumKb("linux", { CENTRIC_IMPORT_ADRESSRAUM_KB: "0" })).toBe(0);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/CENTRIC_IMPORT_ADRESSRAUM_KB.*ohne Adressraum-Limit/);
      /* unplausibel groß → auf 4 GB geklemmt, mit Warnung */
      expect(adressraumKb("linux", { CENTRIC_IMPORT_ADRESSRAUM_KB: "999999999" })).toBe(ADRESSRAUM_KB_MAX);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(String(warn.mock.calls[1][0])).toMatch(/geklemmt/);
      /* ungültig → Standard, mit Warnung */
      expect(adressraumKb("linux", { CENTRIC_IMPORT_ADRESSRAUM_KB: "viel" })).toBe(ADRESSRAUM_KB_STANDARD);
      expect(warn).toHaveBeenCalledTimes(3);
      /* andere Systeme: ohne Limit (Entwicklung), ohne Warnung je Aufruf */
      expect(adressraumKb("win32", { CENTRIC_IMPORT_ADRESSRAUM_KB: "0" })).toBe(0);
      expect(warn).toHaveBeenCalledTimes(3);
    } finally {
      warn.mockRestore();
    }
  });
});
