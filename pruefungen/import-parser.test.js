/* ==========================================================================
   IMP-2 — Import-Parser (docs/acc45/IMPORT-VERTRAG.md)
   Alle Testdateien sind synthetisch und entstehen zur Testlaufzeit.
   Kein Netzzugriff. SheetJS wird hier nur zum Erzeugen von Testdateien
   geschrieben, der Parser selbst liest nur.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { parseDatei, STANDARD_GRENZEN } from "../server/lib/import/parser.mjs";
import { mappe, zip, zipEintraege } from "./import-parser-hilfen.mjs";

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
  for (const fmt of ["xlsx", "xls", "ods"]) {
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
    for (const fmt of ["xls", "ods"]) {
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
    expect(b.ok && b.format).toBe("ods");
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
  it("Makro-Datei (xlsm mit vbaProject.bin): Daten gelesen, Makro nicht ausgeführt, Hinweis", async () => {
    const eintraege = zipEintraege(mappe({ S: [["a"], [1]] }));
    eintraege.push({ name: "xl/vbaProject.bin", daten: B("MAKROCODE-NICHT-AUSFUEHREN") });
    const ct = eintraege.find((e) => e.name === "[Content_Types].xml");
    ct.daten = B(ct.daten.toString("utf8").replace("sheet.main+xml", "sheet.macroEnabled.main+xml"));
    const buf = zip(eintraege.map((e) => ({ ...e, methode: "deflate" })));
    const r = await parseDatei({ buffer: buf, name: "m.xlsm" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.blaetter[0].zeilen).toEqual([["a"], [1]]);
    const h = r.hinweise.find((x) => x.code === "MAKROS_VERWORFEN");
    expect(h).toBeTruthy();
    expect(h.nachricht).toMatch(/Makro/);
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
