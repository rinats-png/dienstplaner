/* IMP-8: Erzeuger für die synthetischen Binär-Testdateien der Testmatrix (docs/acc45/IMP-8-TESTMATRIX.md).
   Alle Inhalte sind erfunden (Testperson NN, Personalnummern TP-nnnn, E-Mail nur @example.invalid) und entstehen
   zur Testlaufzeit; im Repo liegen keine Binärdateien. Statische Textdateien (CSV/TSV) liegen neben diesem Modul. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mappe, zip, zipEintraege, cfbDatei } from "../import-parser-hilfen.mjs";

export const fixture = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)));
const B = (s) => Buffer.from(s, "utf8");

export const KOPF_XLSX = ["Personalnummer", "Nachname", "Vorname", "Einheit", "Eintritt", "Wochenstunden"];
/** Zwei Testpersonen mit echter Datumszelle (lokale Mitternacht, wie in import-parser.test.js) und Zahlen. */
export const personalZeilen = () => [KOPF_XLSX,
  ["TP-8001", "Testperson 81", "Fiktiv", "Wohnbereich 1", new Date(2026, 1, 1), 38.5],
  ["TP-8002", "Testperson 82", "Fiktiv", "Wohnbereich 1", new Date(2026, 2, 15), 20]];
export const xlsxGueltig = () => mappe({ Personal: personalZeilen() }, "xlsx", { cellDates: true });
export const xlsGueltig = () => mappe({ Personal: personalZeilen() }, "xls", { cellDates: true });
export const xlsx1904 = () => mappe({ Personal: personalZeilen() }, "xlsx", { cellDates: true }, { date1904: true });

export const csvMitBom = () => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fixture("f01-gueltig.csv")]);
export const csv1252 = () => Buffer.from(
  "Personalnummer;Nachname;Vorname;Einheit\nTP-8101;Müller-Testperson;Fiktiv;Wohnbereich 1\n", "latin1");
export const csvUtf16 = () => Buffer.from("﻿Personalnummer;Nachname;Vorname;Einheit\nTP-8102;Testperson 92;Fiktiv;Wohnbereich 1\n", "utf16le");

/** XLSX mit Textzellen, die wie Formeln beginnen (=, +, -, @) sowie einer echten Formelzelle mit gespeichertem Wert. */
export function xlsxFormelzellen() {
  const eintraege = zipEintraege(mappe({ Personal: [["Personalnummer", "Nachname", "Vorname", "Funktion", "Einheit"],
    ["TP-4101", "=1+1", "Fiktiv", "+SUMME(A1:A9)", "Wohnbereich 1"],
    ["TP-4102", "-Testperson 92", "Fiktiv", "@SUMME(1)", "Wohnbereich 1"],
    ["TP-4103", "Testperson 93", "Fiktiv", "x", "Wohnbereich 1"]] }));
  const blatt = eintraege.find((e) => e.name === "xl/worksheets/sheet1.xml");
  blatt.daten = B(blatt.daten.toString("utf8").replace(/<c r="D4"[^>]*>.*?<\/c>/,
    '<c r="D4"><f>HYPERLINK("https://example.invalid/x","y")</f><v>42</v></c>'));
  return zip(eintraege.map((e) => ({ ...e, methode: "deflate" })));
}

export const leer = () => Buffer.alloc(0);
export const nurLeerraum = () => B(" \n\t \r\n  \n");
export const nurKopf = () => B("Personalnummer;Nachname;Vorname;Einheit\n");

export const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
export const exe = () => Buffer.concat([B("MZ"), Buffer.alloc(200, 1)]);
export const zufall = () => Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 37) % 256));

export const csvZeilen = (n) => {
  const z = ["Personalnummer;Nachname;Vorname;Einheit"];
  for (let i = 0; i < n; i++) z.push(`TP-${100000 + i};Testperson ${i};Fiktiv;Wohnbereich 1`);
  return B(z.join("\n"));
};
export const csvSpalten = (n) => {
  const k = Array.from({ length: n }, (_, i) => `Spalte${i}`).join(";");
  return B(`${k}\n${k}\n`);
};
export const csvZelle = (n) => B(`Personalnummer;Nachname;Vorname;Einheit\nTP-8201;${"x".repeat(n)};Fiktiv;Wohnbereich 1\n`);

/** ZIP-Bomben (alle klein im Speicher, riesig erklärt bzw. entpackt). */
const huelle = (daten, extra = {}) => zip([
  { name: "[Content_Types].xml", daten: B("<Types/>"), methode: "deflate" },
  { name: "xl/worksheets/sheet1.xml", daten, methode: "deflate", ...extra }]);
export const bombeErklaertGross = () => huelle(Buffer.alloc(101 * 1024 * 1024));
export const bombeVerhaeltnis = () => huelle(Buffer.alloc(50 * 1024 * 1024));
export const bombeLuegenderKopf = () => huelle(Buffer.alloc(30 * 1024 * 1024), { erklaert: 1000 });
export const bombeVieleEintraege = () => zip([{ name: "[Content_Types].xml", daten: B("<Types/>") },
  ...Array.from({ length: 30 }, (_, i) => ({ name: `xl/x${i}.xml`, daten: B("<a/>") }))]);

/** Nicht unterstützte Formate. */
export const ods = () => mappe({ S: [["a"], [1]] }, "ods");
export const xlsb = () => zip([{ name: "[Content_Types].xml", daten: B("<x/>") }, { name: "xl/workbook.bin", daten: B("x") }]);
export function xlsm() {
  const eintraege = zipEintraege(mappe({ S: [["a"], [1]] }));
  eintraege.push({ name: "xl/vbaProject.bin", daten: B("KEIN-ECHTES-MAKRO") });
  const ct = eintraege.find((e) => e.name === "[Content_Types].xml");
  ct.daten = B(ct.daten.toString("utf8").replace("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    "application/vnd.ms-excel.sheet.macroEnabled.main+xml"));
  return zip(eintraege.map((e) => ({ ...e, methode: "deflate" })));
}
export const verschluesselt = () => cfbDatei([{ pfad: "/EncryptionInfo", daten: Buffer.alloc(8, 1) }, { pfad: "/EncryptedPackage", daten: Buffer.alloc(8, 2) }]);
