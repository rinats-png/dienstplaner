/* ==========================================================================
   PILOT-TAGESBERICHT — werkzeug/pilot-tagesbericht.mjs

   Prüft: JSON- und CSV-Einlesen, Zählung je Priorität, Stopp-Hinweise,
   keine erfundenen Schwellen oder Ziele, Abbruch bei Personendaten-Mustern
   (ohne den Wert zu nennen), Verwerfen unbekannter Felder, Aufrufprüfung,
   kein Netz- und Umgebungszugriff im Quelltext.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseFehlerliste, personenFunde, parseKennzahlen, auswerten, bericht, lauf, bewerteKennzahl, csvZeilen, EingabeFehler,
} from "../werkzeug/pilot-tagesbericht.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKRIPT = path.join(REPO, "werkzeug/pilot-tagesbericht.mjs");

const LISTE = [
  { id: "F-1", titel: "Stempel nach Sync doppelt", prioritaet: "P1", status: "offen", szenario: "PS-P-07", geoeffnet: "2026-12-12T08:00:00Z", reaktion: "2026-12-12T08:30:00Z" },
  { id: "F-2", titel: "Beschriftung abgeschnitten", prioritaet: "P3", status: "behoben", geoeffnet: "2026-12-11", behoben: "2026-12-12" },
  { id: "F-3", titel: "Rolle sieht fremden Bereich", prioritaet: "P0", status: "in-arbeit", geoeffnet: "2026-12-12T09:00:00Z" },
  { id: "F-4", titel: "Export falsche Summe", prioritaet: "P2", status: "verifiziert", geoeffnet: "2026-12-11T10:00:00Z", behoben: "2026-12-12T07:00:00Z" },
];
const csvVon = (liste, t = ";") => {
  const k = ["id", "titel", "prioritaet", "status", "szenario", "geoeffnet", "reaktion", "behoben"];
  return [k.join(t), ...liste.map((f) => k.map((x) => `"${(f[x] ?? "").replace(/"/g, '""')}"`).join(t))].join("\n");
};
const dateien = (m) => (p) => { if (!(p in m)) throw new Error("fehlt"); return m[p]; };

describe("Einlesen", () => {
  it("JSON als Array und als Objekt mit fehler", () => {
    expect(parseFehlerliste(JSON.stringify(LISTE), "json")).toHaveLength(4);
    expect(parseFehlerliste(JSON.stringify({ fehler: LISTE }), "json")).toHaveLength(4);
  });
  it("CSV mit Semikolon und mit Komma, Anführungszeichen und Zeilenumbruch im Feld", () => {
    const schwer = [{ id: "F-9", titel: 'Text mit "Zitat"; und\nZeilenumbruch', prioritaet: "p2", status: "OFFEN" }];
    for (const t of [";", ","]) {
      const r = parseFehlerliste(csvVon(schwer, t), "csv");
      expect(r[0].titel).toBe('Text mit "Zitat"; und\nZeilenumbruch');
      expect(r[0].prioritaet).toBe("P2");
      expect(r[0].status).toBe("offen");
    }
    expect(csvZeilen("a;b\r\n1;2\r\n", ";")).toEqual([["a", "b"], ["1", "2"]]);
    expect(csvZeilen(String.fromCharCode(0xfeff) + "a;b\n1;2", ";")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseFehlerliste(String.fromCharCode(0xfeff) + "id;prioritaet\nF-1;P1", "csv")[0].id).toBe("F-1");
  });
  it("gleiche Ergebnisse aus JSON und CSV", () => {
    expect(parseFehlerliste(csvVon(LISTE), "csv").map((f) => f.id + f.prioritaet + f.status))
      .toEqual(parseFehlerliste(JSON.stringify(LISTE), "json").map((f) => f.id + f.prioritaet + f.status));
  });
  it("unbekannte Felder werden verworfen (kein Durchreichen von Namen o. ä.)", () => {
    const r = parseFehlerliste(JSON.stringify([{ id: "F-1", prioritaet: "P1", melder: "Erika Beispiel", notiz: "x" }]), "json");
    expect(Object.keys(r[0]).sort()).toEqual(["id", "prioritaet", "status"]);
  });
  it("ungültige Eingaben: Priorität, Status, doppelte ID, Datum, Format", () => {
    const e = (x, f = "json") => () => parseFehlerliste(typeof x === "string" ? x : JSON.stringify(x), f);
    expect(e([{ id: "a", prioritaet: "P9" }])).toThrow(/prioritaet/);
    expect(e([{ id: "a", prioritaet: "P1", status: "kaputt" }])).toThrow(/status/);
    expect(e([{ id: "a", prioritaet: "P1" }, { id: "a", prioritaet: "P2" }])).toThrow(/doppelte/);
    expect(e([{ id: "a", prioritaet: "P1", geoeffnet: "gestern" }])).toThrow(/ISO/);
    expect(e("{kaputt")).toThrow(/JSON/);
    expect(e("x", "txt")).toThrow(/Endung/);
  });
});

describe("Personendaten-Schutz", () => {
  const mit = (titel) => parseFehlerliste(JSON.stringify([{ id: "F-7", titel, prioritaet: "P2" }]), "json");
  it("erkennt Mail, IP, Link, Telefonnummer; nennt Fehler-ID und Feld, nie den Wert", () => {
    for (const [titel, art] of [["Mail an erika@example.org gesendet", "Mailadresse"], ["Server 10.1.2.3 antwortet nicht", "IP-Adresse"],
      ["siehe https://beispiel.invalid/x", "Weblink"], ["Rückruf unter 0151 2345678", "Telefonnummer"], ["Rückruf unter +49 30 1234567", "Telefonnummer"]]) {
      const f = personenFunde(mit(titel));
      expect(f, titel).toEqual([{ id: "F-7", feld: "titel", art }]);
    }
  });
  it("normale Fehlertexte, Szenario-IDs und Daten lösen nichts aus", () => {
    expect(personenFunde(parseFehlerliste(JSON.stringify(LISTE), "json"))).toEqual([]);
    expect(personenFunde(mit("PS-P-07 2026-12-21 01.12.2026 zeigt Summe 1234 statt 1243"))).toEqual([]);
  });
  it("lauf bricht mit Exit-Code 3 ab und gibt den Wert nicht aus", () => {
    const wert = "erika.beispiel@example.org";
    const l = () => lauf(["--fehler", "f.json"], dateien({ "f.json": JSON.stringify([{ id: "F-7", titel: wert, prioritaet: "P2" }]) }));
    expect(l).toThrow(EingabeFehler);
    try { l(); } catch (e) { expect(e.code).toBe(3); expect(e.message).toContain("F-7/titel"); expect(e.message).not.toContain(wert); }
  });
});

describe("Auswertung", () => {
  const fehler = parseFehlerliste(JSON.stringify(LISTE), "json");
  it("zählt je Priorität, neu und behoben am Tag", () => {
    const e = auswerten(fehler, {}, { datum: "2026-12-12" });
    expect(e.zeilen.P0).toMatchObject({ gesamt: 1, offen: 1, neuHeute: 1, behobenHeute: 0 });
    expect(e.zeilen.P1).toMatchObject({ gesamt: 1, offen: 1 });
    expect(e.zeilen.P2).toMatchObject({ gesamt: 1, offen: 0, behobenHeute: 1 });
    expect(e.zeilen.P3).toMatchObject({ gesamt: 1, offen: 0, behobenHeute: 1, neuHeute: 0 });
  });
  it("offene P0 und kritischer Zustand ergeben Stopp-Hinweise; sonst keine", () => {
    expect(auswerten(fehler, {}).stopp[0]).toMatch(/F-3/);
    const ok = auswerten(fehler.filter((f) => f.prioritaet !== "P0"), { monitoring: { gesund: "ok" } });
    expect(ok.stopp).toEqual([]);
    expect(auswerten([], { monitoring: { gesund: "kritisch" } }).stopp[0]).toMatch(/kritisch/);
  });
  it("Ziele nur aus der Eingabe: Reaktion/Behebung überschritten, ohne Reaktion überfällig", () => {
    const e = auswerten(fehler, { ziele: { P0: { reaktion_h: 1, behebung_h: 24 }, P1: { reaktion_h: 1 }, P2: { behebung_h: 20 } } }, { jetzt: "2026-12-12T20:00:00Z" });
    expect(e.zeilen.P0.ohneReaktion).toEqual(["F-3"]);
    expect(e.zeilen.P0.ueberBehebung).toEqual([]);
    expect(e.zeilen.P1.ueberReaktion).toEqual([]);
    expect(e.zeilen.P2.ueberBehebung).toEqual(["F-4"]);
    const spaet = auswerten(fehler, { ziele: { P0: { behebung_h: 24 } } }, { jetzt: "2026-12-13T10:00:01Z" });
    expect(spaet.zeilen.P0.ueberBehebung).toEqual(["F-3"]);
  });
  it("keine erfundenen Schwellen: ohne Schwelle keine Bewertung, mit Schwelle nach Richtung", () => {
    expect(bewerteKennzahl({ id: "P1", wert: 12 }).urteil).toMatch(/nicht festgelegt/);
    expect(bewerteKennzahl({ id: "P1", wert: 12, schwelle: 15 }).urteil).toMatch(/Richtung fehlt/);
    expect(bewerteKennzahl({ id: "P1", wert: 12, schwelle: 15, richtung: "sinkt" }).urteil).toBe("Schwelle erreicht");
    expect(bewerteKennzahl({ id: "P1", wert: 16, schwelle: 15, richtung: "sinkt" }).urteil).toBe("Schwelle verfehlt");
    expect(bewerteKennzahl({ id: "S3", wert: 0.9, schwelle: 0.8, richtung: "steigt" }).urteil).toBe("Schwelle erreicht");
    expect(bewerteKennzahl({ id: "P1" }).urteil).toBe("ohne Wert");
  });
  it("Kennzahl-Datei wird geprüft", () => {
    expect(() => parseKennzahlen('{"szenarien":{"XX":"bestanden"}}')).toThrow(/Muster/);
    expect(() => parseKennzahlen('{"szenarien":{"PS-P-01":"super"}}')).toThrow(/Stand/);
    expect(() => parseKennzahlen('{"kennzahlen":[{"id":"P1","wert":"viel"}]}')).toThrow(/Zahl/);
    expect(() => parseKennzahlen('{"monitoring":{"gesund":"gruen"}}')).toThrow(/gesund/);
    expect(() => parseKennzahlen('{"ziele":{"P7":{}}}')).toThrow(/Priorität/);
  });
});

describe("Bericht und Aufruf", () => {
  const kz = JSON.stringify({
    kennzahlen: [{ id: "P1", name: "Zeit Ausfallersatz", wert: 12, einheit: "min", basis: 20 }],
    szenarien: { "PS-P-01": "bestanden", "PS-P-02": "abweichend", "PS-P-03": "nicht-ausfuehrbar" },
    monitoring: { gesund: "warnung", sicherung_alter_h: 5, fehler_5xx_15min: 0 },
  });
  const text = lauf(["--fehler", "f.json", "--kennzahlen", "k.json", "--tag", "3", "--datum", "2026-12-12", "--pilot", "A", "--form", "intern"],
    dateien({ "f.json": JSON.stringify(LISTE), "k.json": kz }));
  it("enthält Kopf, Stopp-Prüfung, Fehlerlage, Szenarien, Monitoring, Kennzahlen", () => {
    for (const t of ["Pilottag: 3 von 14", "interner Pilot, synthetische Daten", "ACHTUNG: Offene P0: F-3", "| P0 | 1 | 1 | 1 | 0 |",
      "abweichend: PS-P-02", "nicht-ausfuehrbar: PS-P-03", "/gesund: warnung", "nicht festgelegt", "Keine Ziele in der Kennzahl-Datei"])
      expect(text, t).toContain(t);
  });
  it("gibt keine Titel oder Freitexte der Fehlerliste aus (nur IDs)", () => {
    expect(text).not.toContain("Rolle sieht fremden Bereich");
    expect(text).not.toContain("Stempel nach Sync doppelt");
  });
  it("ohne Kennzahl-Datei läuft der Bericht ebenfalls", () => {
    const t = lauf(["--fehler", "f.csv"], dateien({ "f.csv": csvVon(LISTE) }));
    expect(t).toContain("Keine Kennzahlen übergeben");
    expect(t).toContain("nicht angegeben");
  });
  it("falsche Aufrufe", () => {
    const l = (a, m = {}) => () => lauf(a, dateien({ "f.json": "[]", ...m }));
    expect(l([])).toThrow(/--fehler/);
    expect(l(["--fehler", "f.json", "--tag", "15"])).toThrow(/--tag/);
    expect(l(["--fehler", "f.json", "--pilot", "C"])).toThrow(/--pilot/);
    expect(l(["--fehler", "f.json", "--datum", "heute"])).toThrow(/--datum/);
    expect(l(["--fehler", "f.json", "--url", "x"])).toThrow(/Unbekannter/);
    expect(l(["--fehler", "fehlt.json"])).toThrow(/nicht lesbar/);
    expect(l(["--fehler", "f.txt"], { "f.txt": "" })).toThrow(/Endung/);
  });
  it("Kommandozeile: Exit 0 mit Bericht, Exit 2 bei falschem Aufruf", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const d = mkdtempSync(path.join(tmpdir(), "centric-pilottb-"));
    try {
      writeFileSync(path.join(d, "f.json"), JSON.stringify(LISTE));
      const ok = spawnSync(process.execPath, [SKRIPT, "--fehler", path.join(d, "f.json"), "--tag", "2"], { encoding: "utf8" });
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain("# Pilot-Tagesbericht");
      const schlecht = spawnSync(process.execPath, [SKRIPT], { encoding: "utf8" });
      expect(schlecht.status).toBe(2);
      writeFileSync(path.join(d, "p.json"), JSON.stringify([{ id: "F-1", titel: "a@b.de", prioritaet: "P1" }]));
      const pd = spawnSync(process.execPath, [SKRIPT, "--fehler", path.join(d, "p.json")], { encoding: "utf8" });
      expect(pd.status).toBe(3);
      expect(pd.stdout).toBe("");
      expect(pd.stderr).not.toContain("a@b.de");
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  it("Quelltext: kein Netz, keine Umgebungsvariablen, kein Kindprozess", () => {
    const q = readFileSync(SKRIPT, "utf8").split("\n").filter((z) => !/^\s*(\/\*|\*|\/\/)/.test(z)).join("\n");
    expect(q).not.toMatch(/\bfetch\s*\(|node:(http|https|net|dgram|dns|child_process)|process\.env|XMLHttpRequest|WebSocket/);
  });
});
