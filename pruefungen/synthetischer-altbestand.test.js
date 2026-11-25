/* ==========================================================================
   K4-P3: Synthetischer Altbestand-Generator (274bfa0-artige Ablage) — Tests (L3: Migration/Backup/Restore)

   Prüft: feste Saat und feste Uhr (gleiche Eingabe, gleiche Bytes), Schutz des Ausgabepfads (nur absolut, kein „..“,
   nie im Repo, nur neu oder leer, kein Link), Größengrenzen, die Gestalt der Ablage (Selbsttest findet jede Verletzung),
   die Randfälle, und dass der heutige Code die Ablage lesen kann. Nur synthetische Daten.
   Aufruf: npx vitest run pruefungen/synthetischer-altbestand.test.js --maxWorkers=1 --testTimeout=180000
   Voraussetzung: der Produktionsstand 274bfa0 ist als Objekt vorhanden (sonst holt der Erzeuger ihn mit git fetch).
   ========================================================================== */
// zeit-ok: echte Kindprozesse; Zeitstempel hier nur als Datenwerte.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync,
  unlinkSync, rmdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  REF_PRODUKTION, GRENZEN, planBauen, saatPruefen, ausgabePruefen, uncPfad, erzeugen, baumHash, pruefeAblage,
} from "../werkzeug/synthetischer-altbestand.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(WURZEL, "werkzeug", "synthetischer-altbestand.mjs");
const KLEIN = { groesse: 24, tage: 14 };   // klein halten: ein Prozess mit Scrypt und ein paar hundert Schreibvorgänge

let T;                 // Wegwerfwurzel
let A, B, C, ZK;       // A, B: gleiche Saat; C: andere Saat; ZK: ohne Zahlkennung
let ergA, ergB, ergC, ergZK;

/** 8.3-Kurzname eines vorhandenen Pfads (nur Windows), sonst null. */
const kurzname = (/** @type {string} */ p) => {
  if (process.platform !== "win32") return null;
  const r = spawnSync("cmd.exe", ["/d", "/s", "/c", `"for %I in ("${p}") do @echo %~sI"`], { encoding: "utf8", windowsVerbatimArguments: true });
  const o = String(r.stdout || "").trim();
  return o && o.includes("~") && o.toLowerCase() !== p.toLowerCase() ? o : null;
};
const befunde = (/** @type {string} */ d, o = {}) => pruefeAblage(d, o);
const kopie = (/** @type {string} */ name) => { const z = path.join(T, name); cpSync(A, z, { recursive: true }); return z; };
const dateien = (/** @type {string} */ d) => readdirSync(path.join(d, "centric"));
const lesenUmschlag = (/** @type {string} */ d, /** @type {string} */ datei) => JSON.parse(readFileSync(path.join(d, "centric", datei), "utf8"));
const nameVon = (/** @type {string} */ key) => encodeURIComponent(key).replace(/[!'()*.~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()) + ".json";

beforeAll(async () => {
  T = mkdtempSync(path.join(tmpdir(), "k4p3-test-"));
  A = path.join(T, "a"); B = path.join(T, "b"); C = path.join(T, "c"); ZK = path.join(T, "zk");
  ergA = await erzeugen({ ausgabe: A, saat: 4711, ...KLEIN });
  ergB = await erzeugen({ ausgabe: B, saat: 4711, ...KLEIN });
  ergC = await erzeugen({ ausgabe: C, saat: 4712, ...KLEIN });
  ergZK = await erzeugen({ ausgabe: ZK, saat: 4711, ...KLEIN, zahlkennung: false });
}, 600000);

afterAll(() => {
  if (!T) return;
  for (const d of [A, B, C, ZK]) if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  rmSync(T, { recursive: true, force: true });
});

describe("Plan: Saat und Grenzen", () => {
  it("gleiche Eingabe gibt gleichen Plan, andere Saat einen anderen", () => {
    const a = planBauen({ saat: 7, ...KLEIN });
    expect(JSON.stringify(planBauen({ saat: 7, ...KLEIN }))).toBe(JSON.stringify(a));
    expect(JSON.stringify(planBauen({ saat: 8, ...KLEIN }))).not.toBe(JSON.stringify(a));
  });
  it("Saat: nur ganze Zahl von 1 bis 2147483647", () => {
    for (const s of [0, -1, 1.5, NaN, Infinity, 2 ** 31, "7", null, "", {}]) expect(() => saatPruefen(s), String(s)).toThrow();
    expect(saatPruefen(1)).toBe(1);
    expect(saatPruefen(2147483647)).toBe(2147483647);
  });
  it("Größe, Tage und Räume sind begrenzt", () => {
    expect(() => planBauen({ groesse: GRENZEN.maxGroesse + 1, tage: 14 })).toThrow(/Größe/);
    expect(() => planBauen({ groesse: GRENZEN.minGroesse - 1, tage: 14 })).toThrow(/Größe/);
    expect(() => planBauen({ groesse: 24, tage: GRENZEN.maxTage + 1 })).toThrow(/Tage/);
    expect(() => planBauen({ groesse: 24, tage: 0 })).toThrow(/Tage/);
    expect(() => planBauen({ groesse: 24.5, tage: 14 })).toThrow();
  });
  it("Plan enthält keine echten Namen, Adressen oder langen Ziffernfolgen", () => {
    const text = JSON.stringify(planBauen({ saat: 7, groesse: 40, tage: 28 }));
    const mails = text.match(/[\w.+-]+@[\w.-]+/g) || [];
    expect(mails.length).toBeGreaterThan(0);
    for (const m of mails) expect(m.endsWith("@example.invalid"), m).toBe(true);
    expect(text).not.toMatch(/\d{7,}/);
    expect(text).not.toMatch(/https?:\/\//);
  });
  it("kein Zufall ohne feste Saat im Erzeuger", () => {
    const q = readFileSync(CLI, "utf8");
    expect(q).not.toMatch(/Math\.random|randomBytes|randomUUID|randomInt|Date\.now\(|new Date\(\)/);
  });
});

describe("Ausgabepfad: Schutz", () => {
  it("relativ, leer oder mit NUL abgewiesen", () => {
    for (const p of ["", "daten", "./daten", "..\\daten", "a\0b", undefined, null, 5]) {
      expect(ausgabePruefen(/** @type {any} */ (p)).ok, String(p)).toBe(false);
    }
  });
  it("Pfad-Traversal (..) abgewiesen, auch wenn er zum selben Ziel führen würde", () => {
    const r = ausgabePruefen(`${T}/x/../neu`);
    expect(r.ok).toBe(false);
    expect(r.grund).toMatch(/\.\./);
    expect(ausgabePruefen(`${T}/sub/../../neu`).ok).toBe(false);
    expect(ausgabePruefen(`${T}\\sub\\..\\neu`).ok).toBe(false);
  });
  it("UNC-Pfad, Laufwerkswurzel und Wurzel abgewiesen", () => {
    expect(ausgabePruefen("\\\\server\\freigabe\\neu").ok).toBe(false);
    expect(ausgabePruefen("//server/freigabe/neu").ok).toBe(false);
    expect(ausgabePruefen(path.parse(T).root).ok).toBe(false);
  });
  it("nie im Repo", () => {
    expect(ausgabePruefen(path.join(WURZEL, "daten-neu")).ok).toBe(false);
    expect(ausgabePruefen(WURZEL).ok).toBe(false);
    expect(ausgabePruefen(path.join(WURZEL, "server")).ok).toBe(false);
  });
  it("vorhandener Ordner mit Inhalt abgewiesen — nichts wird überschrieben", () => {
    const d = path.join(T, "belegt");
    mkdirSync(d);
    writeFileSync(path.join(d, "wichtig.txt"), "bleibt");
    expect(ausgabePruefen(d).ok).toBe(false);
    expect(ausgabePruefen(d).grund).toMatch(/leer|neu/);
    expect(readFileSync(path.join(d, "wichtig.txt"), "utf8")).toBe("bleibt");
  });
  it("Datei als Ausgabe und fehlender Elternordner abgewiesen", () => {
    const f = path.join(T, "datei.txt");
    writeFileSync(f, "x");
    expect(ausgabePruefen(f).ok).toBe(false);
    expect(ausgabePruefen(path.join(T, "gibt-es-nicht", "neu")).ok).toBe(false);
  });
  it("Verweis (Link/Junction) als Ausgabe abgewiesen", () => {
    const ziel = path.join(T, "linkziel");
    const link = path.join(T, "linkname");
    mkdirSync(ziel);
    try { symlinkSync(ziel, link, "junction"); } catch { return; }   // ohne Rechte kein Link möglich: nichts zu prüfen
    try {
      expect(ausgabePruefen(link).ok).toBe(false);
      expect(ausgabePruefen(link).grund).toMatch(/Verweis|Link/);
    } finally { try { unlinkSync(link); } catch { rmdirSync(link); } }
    expect(existsSync(ziel)).toBe(true);
  });
  it("laufende Ablage (CENTRIC_DATEN) wird nie Ziel", () => {
    const d = path.join(T, "laufend");
    mkdirSync(d);
    expect(ausgabePruefen(d, { env: { CENTRIC_DATEN: d } }).ok).toBe(false);
  });
  it("neu oder leer ist erlaubt", () => {
    const leer = path.join(T, "leer");
    mkdirSync(leer);
    expect(ausgabePruefen(leer).ok).toBe(true);
    expect(ausgabePruefen(path.join(T, "ganz-neu")).ok).toBe(true);
  });
  it("erzeugen() überschreibt keinen belegten Ordner und legt nichts an", async () => {
    const d = path.join(T, "belegt2");
    mkdirSync(d);
    writeFileSync(path.join(d, "x.json"), "{}");
    await expect(erzeugen({ ausgabe: d, saat: 1, ...KLEIN })).rejects.toThrow(/leer|neu/);
    expect(readdirSync(d)).toEqual(["x.json"]);
  });
  it("Altstand-Verweis nur als volle 40-stellige Kennung (keine Optionen, keine Namen)", async () => {
    for (const ref of ["HEAD", "main", "--output=x", "274bfa0", "274bfa0baca5681f383eea334aab69875f31d5c", "G".repeat(40)]) {
      await expect(erzeugen({ ausgabe: path.join(T, "ref-x"), saat: 1, ...KLEIN, ref }), ref).rejects.toThrow(/Kennung/);
    }
    expect(existsSync(path.join(T, "ref-x"))).toBe(false);
  });
  it("erzeugen() führt den Selbsttest aus: bei Befund Fehler, Ausgabe entfernt", async () => {
    const d = path.join(T, "selbsttest-bei-erzeugung");
    await expect(erzeugen({ ausgabe: d, saat: 1, ...KLEIN, nachSchreiben: (z) => writeFileSync(path.join(z, "notiz.txt"), "x") }))
      .rejects.toThrow(/Selbsttest/);
    expect(existsSync(d)).toBe(false);
  }, 300000);
  for (const [name, aendern] of /** @type {[string, (z: string) => void][]} */ ([
    ["Mail in Metadaten", (z) => { const p = path.join(z, "centric", nameVon("kern:alt-leer")); const u = JSON.parse(readFileSync(p, "utf8")); u.metadata.durch = "x@example.com"; writeFileSync(p, JSON.stringify(u)); }],
    ["Telefonnummer im Zugangscode", (z) => { for (const n of readdirSync(path.join(z, "centric")).filter((x) => x.startsWith("konto%3A"))) { const p = path.join(z, "centric", n); const u = JSON.parse(readFileSync(p, "utf8")); u.daten.name = "Tel 000 0000 000"; writeFileSync(p, JSON.stringify(u)); } }],
    ["Echtname in einer Person", (z) => { const p = path.join(z, "centric", nameVon("kern:alt-pflege")); const u = JSON.parse(readFileSync(p, "utf8")); u.daten.mandanten[0].personen[0].nachname = "Zufallsname"; writeFileSync(p, JSON.stringify(u)); }],
  ])) {
    it(`eingeschleustes Echt-Merkmal (${name}) gibt Fehler beim Erzeugen, Ausgabe entfernt`, async () => {
      const d = path.join(T, `merkmal-${name.replace(/\W+/g, "-")}`);
      await expect(erzeugen({ ausgabe: d, saat: 1, ...KLEIN, nachSchreiben: aendern })).rejects.toThrow(/Selbsttest/);
      expect(existsSync(d)).toBe(false);
    }, 300000);
  }
  it("Größenbegrenzung: zu große Ausgabe bricht ab und räumt auf", async () => {
    const d = path.join(T, "gross");
    await expect(erzeugen({ ausgabe: d, saat: 1, ...KLEIN, maxBytes: 20000 })).rejects.toThrow(/Größe|Bytes/);
    expect(!existsSync(d) || readdirSync(d).length === 0).toBe(true);
  }, 300000);
});

describe("Ausgabepfad: Kurznamen, Verweise, laufende Ablage, UNC", () => {
  it("UNC-Regel (ohne Dateisystem): Freigabe- und Gerätepfade ja, gewöhnliche nein", () => {
    for (const p of ["\\\\srv\\frei\\x", "//srv/frei/x", "\\\\?\\C:\\x", "\\\\.\\pipe"]) expect(uncPfad(p), p).toBe(true);
    for (const p of ["C:\\x", "/x", "/x/y", "x", ""]) expect(uncPfad(p), p).toBe(false);
  });
  it("8.3-Kurzname des Repos umgeht die Repo-Sperre nicht", (ctx) => {
    const k = kurzname(WURZEL);
    if (!k) { console.warn("ÜBERSPRUNGEN: keine 8.3-Kurznamen für das Repo verfügbar (nicht Windows oder auf dem Datenträger abgeschaltet)"); ctx.skip(); return; }
    const r = ausgabePruefen(`${k}\\k4p3-im-repo-test`);
    expect(r.ok).toBe(false);
    expect(r.grund).toMatch(/Repo/);
  });
  it("8.3-Kurzname der laufenden Ablage (CENTRIC_DATEN) wird erkannt, in beide Richtungen", (ctx) => {
    const lang = path.join(T, "lang-ordner-fuer-kurznamen");
    mkdirSync(lang);
    const k = kurzname(lang);
    if (!k) { console.warn("ÜBERSPRUNGEN: keine 8.3-Kurznamen verfügbar"); ctx.skip(); return; }
    expect(ausgabePruefen(path.join(lang, "unter"), { env: { CENTRIC_DATEN: k } }).ok).toBe(false);
    expect(ausgabePruefen(`${k}\\unter`, { env: { CENTRIC_DATEN: lang } }).ok).toBe(false);
  });
  it("vorhandener leerer Ordner in Kurzform gegen laufende Ablage in Langform", (ctx) => {
    const lang = path.join(T, "leerer-ordner-fuer-kurznamen");
    mkdirSync(lang);
    const k = kurzname(lang);
    if (!k) { console.warn("ÜBERSPRUNGEN: keine 8.3-Kurznamen verfügbar"); ctx.skip(); return; }
    expect(ausgabePruefen(k, { env: { CENTRIC_DATEN: lang } }).ok).toBe(false);
  });
  it("Ziel innerhalb der laufenden Ablage und Ziel über der laufenden Ablage abgewiesen", () => {
    const d = path.join(T, "laufend2");
    mkdirSync(d);
    expect(ausgabePruefen(path.join(d, "neu"), { env: { CENTRIC_DATEN: d } }).ok).toBe(false);          // Ziel in der Ablage
    expect(ausgabePruefen(d, { env: { CENTRIC_DATEN: path.join(d, "ablage") } }).ok).toBe(false);       // Ziel über der Ablage
    expect(ausgabePruefen(path.join(T, "ganz-woanders"), { env: { CENTRIC_DATEN: d } }).ok).toBe(true);
  });
  it("Verweis (Junction) im Großelternpfad zum Repo wird erkannt", (ctx) => {
    const link = path.join(T, "repo-link");
    try { symlinkSync(WURZEL, link, "junction"); } catch { console.warn("ÜBERSPRUNGEN: kein Link möglich"); ctx.skip(); return; }
    try {
      const r = ausgabePruefen(path.join(link, "server", "k4p3-neu"));
      expect(r.ok).toBe(false);
      expect(r.grund).toMatch(/Repo/);
    } finally { try { unlinkSync(link); } catch { rmdirSync(link); } }
  });
  it("Elternordner ist ein Verweis: Meldung nennt den Verweis", (ctx) => {
    const ziel = path.join(T, "linkziel2"), link = path.join(T, "elternlink");
    mkdirSync(ziel);
    try { symlinkSync(ziel, link, "junction"); } catch { console.warn("ÜBERSPRUNGEN: kein Link möglich"); ctx.skip(); return; }
    try { expect(ausgabePruefen(path.join(link, "neu")).grund).toMatch(/Verweis/); }
    finally { try { unlinkSync(link); } catch { rmdirSync(link); } }
  });
});

describe("Erzeugte Ablage: Gestalt und Randfälle", () => {
  it("Selbsttest: keine Befunde", () => {
    expect(befunde(A)).toEqual([]);
    expect(befunde(B)).toEqual([]);
    expect(befunde(C)).toEqual([]);
    expect(befunde(ZK, { zahlkennung: false })).toEqual([]);
  });
  it("gleiche Saat gibt gleiche Bytes, andere Saat andere", () => {
    expect(ergA.baumHash).toBe(ergB.baumHash);
    expect(baumHash(A)).toBe(baumHash(B));
    expect(ergC.baumHash).not.toBe(ergA.baumHash);
    expect(ergZK.baumHash).not.toBe(ergA.baumHash);
  });
  it("mehrere Räume, Personen, Krank-Abwesenheiten, Stempel, Konten und Codes", () => {
    const z = ergA.zahlen;
    expect(z.raeume).toBeGreaterThanOrEqual(6);
    expect(z.betriebe).toBeGreaterThanOrEqual(7);
    expect(z.personen).toBeGreaterThan(40);
    expect(z.abwesenheiten).toBeGreaterThan(3);
    expect(z.stempel).toBeGreaterThan(10);
    expect(z.konten).toBeGreaterThanOrEqual(4);
    expect(z.codes).toBeGreaterThanOrEqual(5);
    expect(z.altformRaeume).toBe(1);
    expect(z.rechnungen).toBeGreaterThanOrEqual(2);
  });
  it("Altform: ein Raum nur unter bestand:, ohne kern:", () => {
    const d = dateien(A).map((n) => decodeURIComponent(n.slice(0, -5)));
    expect(d.filter((k) => k.startsWith("bestand:"))).toEqual(["bestand:alt-bestandsform"]);
    expect(d).not.toContain("kern:alt-bestandsform");
    expect(d.filter((k) => k.startsWith("kern:")).length).toBeGreaterThanOrEqual(5);
  });
  it("Zahl-Kennung: ein Betrieb mit Zahl als Kennung; ohne Option keine", () => {
    const kern = lesenUmschlag(A, nameVon("kern:alt-sicherheit")).daten;
    expect(kern.mandanten.map((m) => typeof m.id).sort()).toEqual(["number", "string"]);
    for (const n of dateien(ZK).filter((x) => x.startsWith("kern%3A"))) {
      for (const m of lesenUmschlag(ZK, n).daten.mandanten) expect(typeof m.id).toBe("string");
    }
  });
  it("leerer Betrieb, leere Listen, großer Raum", () => {
    const leer = lesenUmschlag(A, nameVon("kern:alt-leer")).daten.mandanten[0];
    expect(leer.personen).toEqual([]);
    expect(leer.abwesenheiten).toEqual([]);
    expect(leer.abweichungen).toEqual({});
    const gross = lesenUmschlag(A, nameVon("kern:alt-gross")).daten.mandanten[0];
    expect(gross.personen.length).toBe(KLEIN.groesse);
  });
  it("Altform-Rechnungen ohne nummer und positionen; alte Rolle kunde als Zugang", () => {
    const b = lesenUmschlag(A, nameVon("kern:alt-betreiber")).daten;
    expect(b.rechnungen.length).toBeGreaterThanOrEqual(2);
    for (const x of b.rechnungen) { expect(x).not.toHaveProperty("nummer"); expect(x).not.toHaveProperty("positionen"); expect(x).toHaveProperty("nr"); }
    const rollen = dateien(A).filter((n) => n.startsWith("konto%3A")).map((n) => lesenUmschlag(A, n).daten.rolle);
    expect(rollen).toContain("kunde");
    expect(rollen).toContain("leitung");
  });
  it("Konten nur mit @example.invalid; eines gesperrt, eines nur eingeladen", () => {
    const k = dateien(A).filter((n) => n.startsWith("account%3A")).map((n) => lesenUmschlag(A, n).daten);
    expect(k.length).toBeGreaterThanOrEqual(4);
    for (const x of k) expect(String(x.email).endsWith("@example.invalid"), x.email).toBe(true);
    expect(k.map((x) => x.status)).toEqual(expect.arrayContaining(["aktiv", "gesperrt", "eingeladen"]));
  });
  it("der heutige Code liest die Ablage (Kern und Altform), ohne etwas zu verändern", async () => {
    const vorher = baumHash(A);
    const alt = process.env.CENTRIC_DATEN;
    process.env.CENTRIC_DATEN = A;
    try {
      const { getStore } = await import(pathToFileURL(path.join(WURZEL, "server", "lib", "ablage.mjs")).href);
      const { bestandLesen } = await import(pathToFileURL(path.join(WURZEL, "server", "lib", "bestand.mjs")).href);
      const s = getStore({ name: "centric", consistency: "strong" });
      const kern = await bestandLesen(s, "alt-pflege");
      const altform = await bestandLesen(s, "alt-bestandsform");
      expect(kern.bestand.mandanten[0].personen.length).toBeGreaterThan(5);
      expect(Object.keys(kern.bestand.mandanten[0].abweichungen).length).toBeGreaterThan(20);
      expect(altform.unzerlegt).toBe(true);
      expect(altform.bestand.mandanten.length).toBeGreaterThanOrEqual(1);
    } finally { if (alt === undefined) delete process.env.CENTRIC_DATEN; else process.env.CENTRIC_DATEN = alt; }
    expect(baumHash(A)).toBe(vorher);
  });
});

describe("Selbsttest: jede Verletzung der Gestalt wird gefunden", () => {
  const einzel = (/** @type {string} */ name, /** @type {(d: string) => void} */ aendern, /** @type {RegExp} */ erwartet, o = {}) => {
    it(name, () => {
      const d = kopie(`m-${name.replace(/\W+/g, "-").slice(0, 30)}`);
      try {
        aendern(d);
        const b = befunde(d, o);
        expect(b.length, name).toBeGreaterThan(0);
        expect(b.join("\n")).toMatch(erwartet);
      } finally { rmSync(d, { recursive: true, force: true }); }
    });
  };
  const umschlagAendern = (/** @type {string} */ d, /** @type {string} */ key, /** @type {(u: any) => void} */ f) => {
    const p = path.join(d, "centric", nameVon(key));
    const u = JSON.parse(readFileSync(p, "utf8"));
    f(u);
    writeFileSync(p, JSON.stringify(u));
  };
  einzel("Zwischendatei (.tmp) liegt herum", (d) => writeFileSync(path.join(d, "centric", "x.json.1.ab.tmp"), "{}"), /tmp|Zwischen/);
  einzel("fremdes Verzeichnis neben centric", (d) => mkdirSync(path.join(d, "fremd")), /unerwartet/);
  einzel("lose Datei in der Wurzel", (d) => writeFileSync(path.join(d, "notiz.txt"), "x"), /unerwartet/);
  einzel("Umschlag ohne etag", (d) => umschlagAendern(d, "kern:alt-leer", (u) => { delete u.etag; }), /etag|Umschlag/);
  einzel("falsche Fassung", (d) => umschlagAendern(d, "kern:alt-leer", (u) => { u.fassung = 2; }), /fassung/);
  einzel("kaputtes JSON", (d) => writeFileSync(path.join(d, "centric", nameVon("kern:alt-leer")), "{ kaputt"), /JSON/);
  einzel("Kern ohne Standzeiger", (d) => unlinkSync(path.join(d, "centric", nameVon("stand:alt-pflege:aktuell"))), /Standzeiger|stand/);
  einzel("Scherbe ohne Betrieb im Kern", (d) => writeFileSync(path.join(d, "centric", nameVon("scherbe:alt-pflege:gibt-es-nicht:2026-09")),
    JSON.stringify({ fassung: 1, etag: "x", typ: "json", metadata: {}, daten: { mandantId: "gibt-es-nicht", monat: "2026-09", felder: {} } })), /Scherbe/);
  einzel("echte Mailadresse im Bestand", (d) => umschlagAendern(d, "kern:alt-pflege", (u) => { u.daten.mandanten[0].kontakt = "max.mustermann@example.com"; }), /Mail|Adresse/);
  einzel("lange Ziffernfolge (Telefon/IBAN-artig) im Bestand", (d) => umschlagAendern(d, "kern:alt-pflege",
    (u) => { u.daten.mandanten[0].anschrift = "Tel 000000000"; }), /Ziffern/);
  einzel("Betriebsname nicht als synthetisch gekennzeichnet", (d) => umschlagAendern(d, "kern:alt-pflege", (u) => { u.daten.mandanten[0].name = "Haus Sonnenschein"; }), /synthetisch|Kennzeichnung/);
  einzel("Altform-Raum fehlt", (d) => unlinkSync(path.join(d, "centric", nameVon("bestand:alt-bestandsform"))), /Altform/);
  einzel("Zahl-Kennung fehlt", (d) => umschlagAendern(d, "kern:alt-sicherheit", (u) => { for (const m of u.daten.mandanten) m.id = String(m.id); }), /Zahl-Kennung/);
  einzel("Altform-Rechnung hat nummer (Schemaform)", (d) => umschlagAendern(d, "kern:alt-betreiber", (u) => { u.daten.rechnungen[0].nummer = "R-1"; }), /Altform|Rechnung/);
  einzel("keine Krank-Abwesenheit", (d) => { for (const n of ["kern:alt-pflege", "kern:alt-sicherheit", "kern:alt-gross", "kern:alt-betreiber", "bestand:alt-bestandsform"]) umschlagAendern(d, n, (u) => { for (const m of u.daten.mandanten) m.abwesenheiten = m.abwesenheiten.filter((a) => a.art !== "krank"); }); }, /krank/);
  einzel("keine Stempel mehr", (d) => { umschlagAendern(d, "bestand:alt-bestandsform", (u) => { for (const m of u.daten.mandanten) m.einstempeln = {}; }); for (const n of dateien(d).filter((x) => x.startsWith("scherbe%3A"))) {
    const p = path.join(d, "centric", n); const u = JSON.parse(readFileSync(p, "utf8")); u.daten.felder.einstempeln = {}; writeFileSync(p, JSON.stringify(u)); } }, /Stempel/);
  einzel("Rolle kunde fehlt", (d) => { for (const n of dateien(d).filter((x) => x.startsWith("konto%3A"))) {
    const p = path.join(d, "centric", n); const u = JSON.parse(readFileSync(p, "utf8")); if (u.daten.rolle === "kunde") u.daten.rolle = "planer"; writeFileSync(p, JSON.stringify(u)); } }, /kunde/);
  einzel("Datei unterschreitet Zahl: kein leerer Betrieb", (d) => umschlagAendern(d, "kern:alt-leer", (u) => { u.daten.mandanten[0].personen = [{ id: "p1" }]; }), /leer/);
  einzel("Mail in den Umschlag-Metadaten", (d) => umschlagAendern(d, "kern:alt-pflege", (u) => { u.metadata.durch = "x@example.com"; }), /Mail|Adresse/);
  einzel("Mail als Objektschlüssel", (d) => umschlagAendern(d, "kern:alt-pflege", (u) => { u.daten.mandanten[0].notizen = { "x@example.com": 1 }; }), /Mail|Adresse/);
  einzel("Domain nur example.com statt example.invalid", (d) => umschlagAendern(d, "kern:alt-pflege", (u) => { u.daten.mandanten[0].kontakt = "x@example.com"; }), /Mail|Adresse/);
  einzel("Telefonnummer im Namen eines Zugangscodes", (d) => { for (const n of dateien(d).filter((x) => x.startsWith("konto%3A"))) {
    const p = path.join(d, "centric", n); const u = JSON.parse(readFileSync(p, "utf8")); u.daten.name = "Tel 000000000"; writeFileSync(p, JSON.stringify(u)); } }, /Ziffern|Telefon/);
  einzel("Telefonnummer mit Leerzeichen und Trennern", (d) => umschlagAendern(d, "kern:alt-pflege", (u) => { u.daten.mandanten[0].anschrift = "+00 000 0000 0000"; }), /Ziffern|Telefon/);
  einzel("Telefonnummer mit Bindestrichen", (d) => umschlagAendern(d, "kern:alt-pflege", (u) => { u.daten.mandanten[0].anschrift = "000-0000-0000"; }), /Ziffern|Telefon/);
  einzel("Vorname nicht aus der Positivliste", (d) => umschlagAendern(d, "kern:alt-pflege", (u) => { u.daten.mandanten[0].personen[0].vorname = "Zufall"; }), /Positivliste/);
  einzel("Personenname nicht aus der Positivliste", (d) => umschlagAendern(d, "kern:alt-pflege", (u) => { u.daten.mandanten[0].personen[0].nachname = "Zufallsname"; }), /Positivliste/);
  einzel("kein Konto im Zustand gesperrt oder eingeladen", (d) => { for (const n of dateien(d).filter((x) => x.startsWith("account%3A"))) {
    const p = path.join(d, "centric", n); const u = JSON.parse(readFileSync(p, "utf8")); u.daten.status = "aktiv"; writeFileSync(p, JSON.stringify(u)); } }, /gesperrt|eingeladen/);
  einzel("Ablage-Wurzel fehlt", (d) => rmSync(d, { recursive: true, force: true }), /Wurzel|nicht vorhanden|Verzeichnis/);
});

describe("Kommandozeile: Ausgangswerte", () => {
  const lauf = (/** @type {string[]} */ args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: T, timeout: 120000,
    env: { ...process.env, TZ: "UTC" } });
  it("ohne Angaben: Exit 2, nichts geschrieben", () => {
    expect(lauf([]).status).toBe(2);
    expect(lauf(["erzeugen"]).status).toBe(2);
  });
  it("relativer oder ungültiger Pfad: Exit 3, nichts angelegt", () => {
    const r = lauf(["erzeugen", "relativ-neu", "--ja"]);
    expect(r.status).toBe(3);
    expect(existsSync(path.join(T, "relativ-neu"))).toBe(false);
  });
  it("ohne --ja wird nichts geschrieben (Exit 2)", () => {
    const d = path.join(T, "ohne-ja");
    expect(lauf(["erzeugen", d]).status).toBe(2);
    expect(existsSync(d)).toBe(false);
  });
  it("unbekannte Option, doppelte Option, ungültige Saat: Exit 2", () => {
    const d = path.join(T, "opt");
    expect(lauf(["erzeugen", d, "--ja", "--unbekannt"]).status).toBe(2);
    expect(lauf(["erzeugen", d, "--ja", "--saat", "abc"]).status).toBe(2);
    expect(lauf(["erzeugen", d, "--ja", "--saat", "0"]).status).toBe(2);
    expect(lauf(["erzeugen", d, "--ja", "--groesse", "99999"]).status).toBe(2);
    expect(existsSync(d)).toBe(false);
  });
  it("pruefen auf eine gültige Ablage: Exit 0; auf eine leere: Exit 1", () => {
    expect(lauf(["pruefen", A]).status).toBe(0);
    const leer = path.join(T, "leer-cli");
    mkdirSync(leer);
    expect(lauf(["pruefen", leer]).status).toBe(1);
  });
  it("erzeugen mit --ja: Exit 0, Kurzbericht ohne Klartextwerte, Selbsttest bestanden", () => {
    const d = path.join(T, "cli-ok");
    try {
      const r = lauf(["erzeugen", d, "--ja", "--saat", "4711", "--groesse", String(KLEIN.groesse), "--tage", String(KLEIN.tage)]);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/SYNTHETISCHER ALTBESTAND/);
      expect(r.stdout).toMatch(/Selbsttest: bestanden/);
      expect(r.stdout).not.toMatch(/@/);
      expect(baumHash(d)).toBe(ergA.baumHash);
    } finally { rmSync(d, { recursive: true, force: true }); }
  }, 300000);
  it("Quelle 274bfa0 ist festgeschrieben", () => {
    expect(REF_PRODUKTION).toBe("274bfa0baca5681f383eea334aab69875f31d5c1");
    expect(readFileSync(CLI, "utf8")).toContain(REF_PRODUKTION);
    expect(statSync(CLI).isFile()).toBe(true);
    expect(readlinkSync).toBeTypeOf("function");
  });
});
