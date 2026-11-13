/* ==========================================================================
   ERKENNUNG GESTRANDETER BETRIEBE — Prüfung des nur lesenden Skripts

   Nur synthetische Daten: Jede Ablage entsteht in einem Wegwerfordner unter
   dem Temp-Verzeichnis mit den Schreibern der Anwendung (getStore,
   bestandSchreiben, kontoSchreiben); Sicherungen entstehen mit dem eigenen
   Werkzeug werkzeug/ablage-sicherung.mjs (sichern, wiederherstellen). Keine
   echte Ablage, kein Netz.

   Geprüft wird:
   - jede Klasse M1 (auch M1-t, M1-k), M2 (mit/ohne anderen Zugang), M3, M4,
     M5, M6 und „unklar“, mehrere Betriebe in einem Raum, Altformate
     (unzerlegter Bestand, Sammelblob „konten“, Bindung über die Position);
   - leere Ablage, beschädigte Ablage und Sicherung (klarer Fehler, Ausgang 1);
   - Ablehnung einer benutzten Ablage (frische Prozesssperre), einer Ablage
     ohne --kopie, der Ablage aus CENTRIC_DATEN, einer Ausgabe in der Eingabe;
   - Eingabe bytegleich vorher/nachher, nichts im Temp- und Arbeitsordner
     des Laufs, Ausgabedatei nur dort, wo verlangt;
   - die Ausgabe enthält keine Namen, E-Mail-Adressen, Codes, Prüfsummen,
     Raum- oder Betriebskennungen der Testdaten.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile, utimes, stat } from "node:fs/promises";
import { existsSync, symlinkSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKRIPT = path.join(WURZEL, "werkzeug", "erkennung-gestrandete-betriebe.mjs");
const PFEFFER = "pfeffer-nur-fuer-die-erkennungspruefung-0123456789";
const JETZT = "2026-11-13T10:00:00.000Z";
const LAUFSCHLUESSEL = "a1".repeat(32);

let basis, L, G, E;
let zaehler = 0;
/** Alles, was nie in einer Ausgabe stehen darf. */
const GEHEIM = new Set();

const ordner = async (was) => { const d = path.join(basis, `${was}-${++zaehler}`); await mkdir(d, { recursive: true }); return d; };
const merken = (...w) => { for (const x of w) if (x !== null && x !== undefined && String(x).length >= 4) GEHEIM.add(String(x)); return w[0]; };

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "centric-erkennung-"));
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  process.env.CENTRIC_DATEN = path.join(basis, "unbenutzt");
  L = {
    ...(await import("../server/lib/ablage.mjs")),
    ...(await import("../server/lib/bestand.mjs")),
    ...(await import("../server/lib/konten.mjs")),
    ...(await import("../server/lib/codes.mjs")),
  };
  G = await import("../werkzeug/ablage-sicherung.mjs");
  E = await import("../werkzeug/erkennung-gestrandete-betriebe.mjs");
});
afterAll(async () => { await rm(basis, { recursive: true, force: true }); });

/* ---------------------------------------------------------------------------
   Synthetische Bausteine (Namen, Adressen und Codes sind erfunden und werden gemerkt)
   --------------------------------------------------------------------------- */

const person = (id, rolle, extra = {}) => {
  const vor = merken(`Vorname${id}Testfall`); const nach = merken(`Nachname${id}Erfunden`);
  merken(id, `${vor.toLowerCase()}.${nach.toLowerCase()}@beispiel.invalid`);
  return { id, vorname: vor, nachname: nach, email: `${vor.toLowerCase()}.${nach.toLowerCase()}@beispiel.invalid`,
    rolle, status: "aktiv", austritt: null, personalnummer: merken(`PN-${id}-4711`), ...extra };
};
const betrieb = (id, personen = [], extra = {}) => {
  merken(id, `Pflegeheim Sonnenschein ${id}`, `kontakt-${id}@beispiel.invalid`);
  return { id, name: `Pflegeheim Sonnenschein ${id}`, kontakt: `kontakt-${id}@beispiel.invalid`,
    anschrift: merken(`Musterweg ${zaehler + 12} in Testhausen`), einheiten: [{ id: "e1", name: "Station Erfunden" }], personen, ...extra };
};

/** Legt eine Ablage an: { raum: { mandanten, schreibvorgaenge?, alt? } }, Zugänge, Mitgliedschaften, Sonstiges. */
async function ablageBauen({ raeume = {}, zugaenge = [], sammelblob = null, mitglieder = [], sonstiges = {} } = {}) {
  const dir = await ordner("ablage");
  process.env.CENTRIC_DATEN = dir;
  const store = L.getStore({ name: "centric", consistency: "strong" });
  for (const [raum, r] of Object.entries(raeume)) {
    merken(raum);
    if (r.alt) { await store.setJSON(`bestand:${raum}`, { mandanten: r.mandanten }, { metadata: { zeit: JETZT } }); continue; }
    let stand = null;
    for (let i = 0; i < (r.schreibvorgaenge || 1); i++) {
      const erg = await L.bestandSchreiben(store, raum, { mandanten: r.mandanten, ...(i ? { fassungDerPruefung: i } : {}) },
        { erwarteterStand: stand, durch: "Prüfung" });
      expect(erg.ok).toBe(true);
      stand = erg.stand;
    }
  }
  /** @type {Record<string, string>} */ const schluessel = {};
  for (const z of zugaenge) {
    const code = merken(`TCODE${String(++zaehler).padStart(4, "0")}GEHEIM${z.rolle || "x"}`);
    const k = merken(L.ablageSchluessel(code));
    schluessel[z.name || code] = k;
    const { name, ...rest } = z;
    if (name) merken(name);
    await L.kontoSchreiben(store, k, { name: name || `Zugang ${zaehler}`, angelegt: "2026-03-05T08:00:00.000Z", ...rest });
  }
  if (sammelblob) {
    const blob = {};
    for (const z of sammelblob) {
      const code = merken(`TALT${String(++zaehler).padStart(4, "0")}GEHEIM`);
      blob[merken(L.ablageSchluessel(code))] = z;
    }
    await store.setJSON("konten", blob);
  }
  for (const m of mitglieder) {
    merken(m.accountId);
    await store.setJSON(`mitglied:${m.accountId}:${m.raum}`, m);
    await store.setJSON(`raummitglied:${m.raum}:${m.accountId}`, { accountId: m.accountId, raum: m.raum });
  }
  for (const [k, v] of Object.entries(sonstiges)) await store.setJSON(k, v);
  process.env.CENTRIC_DATEN = path.join(basis, "unbenutzt");
  return { dir, schluessel };
}

async function sicherungZiehen(quelle) {
  const ziel = await ordner("sicherungen");
  const r = await G.sichern({ quelle, ziel, ruhe: 0, pause: 0 });
  return r.pfad;
}

/** Alle Dateien mit Inhalt-Hash — für „bytegleich vorher/nachher“. */
async function inhaltsAbdruck(wurzel) {
  const aus = {};
  const gehen = async (d, rel) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { aus[r + "/"] = "d"; await gehen(p, r); }
      else aus[r] = createHash("sha256").update(await readFile(p)).digest("hex");
    }
  };
  await gehen(wurzel, "");
  return aus;
}

/** Startet das Skript als eigenen Prozess mit eigenem, leerem Temp- und Arbeitsordner. */
async function lauf(args, { env = {}, nodeArgs = [] } = {}) {
  const tmp = await ordner("lauf-tmp");
  const cwd = await ordner("lauf-cwd");
  const umgebung = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp, ERKENNUNG_LAUFSCHLUESSEL: LAUFSCHLUESSEL, ...env };
  delete umgebung.CENTRIC_DATEN;
  for (const [k, v] of Object.entries(env)) if (v === null) delete umgebung[k];
  if (env.CENTRIC_DATEN) umgebung.CENTRIC_DATEN = env.CENTRIC_DATEN;
  const r = spawnSync(process.execPath, [...nodeArgs, SKRIPT, "--jetzt", JETZT, ...args], { cwd, env: umgebung, encoding: "utf8", timeout: 60000 });
  const roh = r.stderr || "";
  /* Der Hinweis zum gesetzten Laufschlüssel erscheint bei jedem Lauf dieser Prüfung (der Schlüssel ist fest) und wird hier abgetrennt. */
  return { code: r.status, aus: r.stdout || "", fehler: roh.replace(/^HINWEIS: ERKENNUNG_LAUFSCHLUESSEL[^\n]*\n/m, ""), fehlerRoh: roh, tmp, cwd };
}
const json = (r) => JSON.parse(r.aus);
const finde = (erg, klasse, unterklasse) => erg.betriebe.filter((b) => b.klasse === klasse && (unterklasse === undefined || b.unterklasse === unterklasse));

function ohneGeheimnisse(text) {
  const funde = [...GEHEIM].filter((g) => text.includes(g));
  expect(funde, "Ausgabe enthält Testgeheimnisse").toEqual([]);
  expect(text).not.toMatch(/@beispiel\.invalid/);
  expect(text).not.toMatch(/[0-9a-f]{40,}/);          // keine Prüfsummen / Ablageschlüssel
}

/* ---------------------------------------------------------------------------
   Die Hauptablage: alle Klassen außer „unklar“, mehrere Betriebe je Raum
   --------------------------------------------------------------------------- */

describe("Klassen M1 … M6 in einer Sicherung", () => {
  let quelle, sicherung, r, erg;

  beforeAll(async () => {
    const L1 = person("p_l100001", "leitung");
    const L2 = person("p_l200002", "leitung");
    const L2b = person("p_l200003", "leitung");
    const L3 = person("p_l300004", "leitung", { status: "inaktiv" });
    const PL3 = person("p_pl00005", "planung");
    const L4 = person("p_l400006", "leitung", { austritt: "2026-01-31" });
    const L5 = person("p_l500007", "leitung");
    const L5m = person("p_l500008", "leitung");
    const LM = person("p_lm00009", "leitung");
    const LD = person("p_ld00010", "leitung");
    const leitungsCode = (raum, mandantId, extra = {}) => ({ bestand: raum, rolle: "leitung", person: null, betrieb: 0,
      mandantId, demo: false, ...extra });
    ({ dir: quelle } = await ablageBauen({
      raeume: {
        "haus-m1-erika": { mandanten: [betrieb("m-haus-m1-erika")] },
        "haus-m1-vermerk": { mandanten: [betrieb("m-haus-m1-vermerk")] },
        "t-selbst-abc123": { mandanten: [betrieb("m-t-selbst-abc123", [], { selbstAngelegt: true })] },
        "haus-m1-kunde": { mandanten: [betrieb("m-haus-m1-kunde")], schreibvorgaenge: 2 },
        "haus-m2-ohne": { mandanten: [betrieb("m-haus-m2-ohne", [L1])] },
        "haus-m2-mit": { mandanten: [betrieb("m-haus-m2-mit", [L2, L2b])] },
        "haus-m3": { mandanten: [betrieb("m-haus-m3", [L3, PL3])] },
        "haus-m4": { mandanten: [betrieb("m-haus-m4", [L4])] },
        "haus-m5": { mandanten: [betrieb("m-haus-m5", [L5])] },
        "haus-m5-konto": { mandanten: [betrieb("m-haus-m5-konto", [L5m])] },
        "haus-mehrfach": { mandanten: [betrieb("m-mehrfach-a", [LM]), betrieb("m-mehrfach-b")] },
        "demo-schau-test": { mandanten: [betrieb("m-demo-nordwacht", [LD])] },
        "ppg-gate-xyz": { mandanten: [betrieb("m-ppg-gate-xyz")] },
        "haus-geloescht": { mandanten: [betrieb("m-haus-geloescht")] },
      },
      zugaenge: [
        leitungsCode("haus-m1-erika", "m-haus-m1-erika", { name: "Leitung Erika Testfall" }),
        leitungsCode("haus-m1-vermerk", "m-haus-m1-vermerk", { erstleitung: { mandantId: "m-haus-m1-vermerk", angelegt: JETZT } }),
        leitungsCode("t-selbst-abc123", "m-t-selbst-abc123", { selbstAngelegt: true }),
        leitungsCode("haus-m1-kunde", "m-haus-m1-kunde"),
        leitungsCode("haus-m2-ohne", "m-haus-m2-ohne"),
        leitungsCode("haus-m2-mit", "m-haus-m2-mit"),
        leitungsCode("haus-m2-mit", "m-haus-m2-mit", { person: L2b.id }),
        leitungsCode("haus-m3", "m-haus-m3"),
        { bestand: "haus-m3", rolle: "planung", person: PL3.id, betrieb: 0, mandantId: "m-haus-m3" },
        leitungsCode("haus-m4", "m-haus-m4", { person: L4.id }),
        leitungsCode("haus-m5", "m-haus-m5", { person: L5.id }),
        leitungsCode("haus-m5", "m-haus-m5", { gesperrt: true }),                        // gesperrt → kein Z0
        leitungsCode("haus-m5", "m-haus-m5", { laeuftAb: "2026-10-01T00:00:00.000Z" }),   // abgelaufen → kein Z0
        leitungsCode("haus-m5", "m-haus-m5", { erstleitungVerbraucht: { am: JETZT, grund: "belegt", mandantId: "m-haus-m5" } }), // M7
        leitungsCode("haus-mehrfach", "m-mehrfach-a", { person: LM.id }),
        leitungsCode("haus-mehrfach", "m-mehrfach-b", { betrieb: 1 }),
        { bestand: "demo-schau-test", rolle: "leitung", person: null, betrieb: 0, mandantId: "m-demo-nordwacht", demo: true },
        leitungsCode("ppg-gate-xyz", "m-ppg-gate-xyz"),
        leitungsCode("haus-geloescht", "m-haus-geloescht"),
        { bestand: "betreiber", rolle: "betreiber", person: null, name: "Betreiber Konsole" },
      ],
      mitglieder: [{ accountId: "acc-erfunden-0001", raum: "haus-m5-konto", betrieb: 0, mandantId: "m-haus-m5-konto",
        person: L5m.id, rolle: "leitung", status: "aktiv", generation: 1 }],
      sonstiges: { "loeschung:haus-geloescht": { raum: "haus-geloescht", seit: 1 } },
    }));
    /* Kette ersetztDurch mit gesperrtem Glied (wie arbeitssitzung.mjs) → kein Z0 in haus-m5. */
    process.env.CENTRIC_DATEN = quelle;
    const store = L.getStore({ name: "centric", consistency: "strong" });
    const a = merken(L.ablageSchluessel("TKETTEAGEHEIM01")); const b = merken(L.ablageSchluessel("TKETTEBGEHEIM02"));
    await L.kontoSchreiben(store, a, leitungsCode("haus-m5", "m-haus-m5", { ersetztDurch: b }));
    await L.kontoSchreiben(store, b, leitungsCode("haus-m5", "m-haus-m5", { gesperrt: true }));
    process.env.CENTRIC_DATEN = path.join(basis, "unbenutzt");

    sicherung = await sicherungZiehen(quelle);
    r = await lauf(["--sicherung", sicherung, "--json"]);
    erg = json(r);
  });

  it("Ausgang 2 (betroffen gefunden), Format und Summen", () => {
    expect(r.fehler).toBe("");
    expect(r.code).toBe(2);
    expect(erg.format).toBe("erkennung-gestrandete-betriebe/1");
    expect(erg.eingabe).toBe("sicherung");
    expect(erg.kennungen).toBe("pseudonym");
    expect(erg.summen).toEqual({ M1: 4, M2: 2, M3: 1, M4: 1, M5: 4, M6: 1, unklar: 0 });
    expect(erg.ausgeschlossen).toEqual({ "ppg-gate": 1, loeschung: 1, demo: 0 });
    expect(erg.zaehler.m7Belegt).toBe(1);
  });

  it("M1, M1-t, M1-k und ein Erstanmeldecode ist kein M1", () => {
    expect(finde(erg, "M1", null)).toHaveLength(2);   // haus-m1-erika, mehrfach-b
    expect(finde(erg, "M1", "M1-t")).toHaveLength(1);
    expect(finde(erg, "M1", "M1-k")).toHaveLength(1);
    expect(finde(erg, "M1", "M1-k")[0].kundenSchreibspur).toBe("ja");
    const offen = finde(erg, "M5", "erstanmeldecode-offen");
    expect(offen).toHaveLength(1);
    expect(offen[0].codes.erstleitungOffen).toBe(1);
    expect(offen[0].ausgesperrtDurchEd1Ed2).toBe(false);
    for (const b of finde(erg, "M1")) {
      expect(b.codes.ohnePerson).toBe(1);
      expect(b.juengsterZ0Monat).toBe("2026-03");
      expect(b.ausgesperrtDurchEd1Ed2).toBe(true);
    }
  });

  it("M2 mit und ohne anderen Zugang, M3, M4", () => {
    const ohne = finde(erg, "M2", "M2-ohne-anderen-zugang");
    const mit = finde(erg, "M2", "M2-mit-anderem-zugang");
    expect(ohne).toHaveLength(1); expect(mit).toHaveLength(1);
    expect(ohne[0].ausgesperrtDurchEd1Ed2).toBe(true);
    expect(mit[0].ausgesperrtDurchEd1Ed2).toBe(false);
    expect(mit[0].codes.personengebunden).toBe(1);
    const m3 = finde(erg, "M3")[0];
    expect(m3.anzahlAktiveLeitung).toBe(0);
    expect(m3.leitungspersonenNichtAktiv.inaktiv).toBe(1);
    expect(m3.ausgesperrtDurchEd1Ed2).toBe(true);
    const m4 = finde(erg, "M4")[0];
    expect(m4.leitungspersonenNichtAktiv.ausgetreten).toBe(1);
    expect(m4.codes.personengebundenOhneAktiveLeitung).toBe(1);
    expect(m4.ausgesperrtDurchEd1Ed2).toBe(false);   // schon heute ohne Zugang
    expect(m4.leitungszugangHeute).toBe(false);
  });

  it("M5: gesperrte, abgelaufene, verkettet gesperrte und belegte Codes zählen nicht als Code ohne Person", () => {
    const m5 = finde(erg, "M5", null);
    expect(m5).toHaveLength(3);   // haus-m5, haus-m5-konto, mehrfach-a
    const mitGesperrten = m5.find((b) => b.codes.gesperrtOderAbgelaufen > 0);
    expect(mitGesperrten.codes).toMatchObject({ personengebunden: 1, ohnePerson: 0, gesperrtOderAbgelaufen: 4, belegt: 1 });
    expect(m5.some((b) => b.mitgliedschaften.aktivMitAktiverLeitung === 1)).toBe(true);
    for (const b of m5) expect(b.ausgesperrtDurchEd1Ed2).toBe(false);
  });

  it("M6: Demozugang Leitung ohne Person; Aussperrsumme stimmt", () => {
    expect(finde(erg, "M6")[0].codes.demoOhnePerson).toBe(1);
    expect(erg.aussperrungEd1Ed2.betriebe).toBe(6);
    expect(erg.aussperrungEd1Ed2.jeKlasse).toEqual({ M1: 4, M2: 1, M3: 1 });
  });

  it("mehrere Betriebe in einem Raum: Position und Kennung getrennt", () => {
    const mehr = erg.betriebe.filter((b) => b.raumPseudonym === erg.betriebe.find((x) => x.klasse === "M1" && x.betriebIndex === 1)?.raumPseudonym);
    expect(mehr.map((b) => [b.betriebIndex, b.klasse]).sort()).toEqual([[0, "M5"], [1, "M1"]]);
    expect(new Set(mehr.map((b) => b.betriebKennung)).size).toBe(2);
  });

  it("Pseudonyme sind mit demselben Laufschlüssel stabil, ohne ihn zufällig", async () => {
    const zweit = json(await lauf(["--sicherung", sicherung, "--json"]));
    expect(zweit.betriebe.map((b) => b.betriebKennung)).toEqual(erg.betriebe.map((b) => b.betriebKennung));
    const zufall = json(await lauf(["--sicherung", sicherung, "--json"], { env: { ERKENNUNG_LAUFSCHLUESSEL: null } }));
    expect(zufall.summen).toEqual(erg.summen);
    expect(zufall.betriebe[0].betriebKennung).not.toBe(erg.betriebe[0].betriebKennung);
    /* Auf ausdrücklichen Wunsch die gespeicherte Betriebskennung statt des Pseudonyms (Doku: Vorsicht). */
    const klar = json(await lauf(["--sicherung", sicherung, "--json", "--gespeicherte-kennungen"]));
    expect(klar.kennungen).toBe("gespeichert");
    expect(klar.betriebe.map((b) => b.betriebKennung)).toContain("m-haus-m1-erika");
  });

  it("Ausgabe (Markdown und JSON) ohne Personendaten, Namen, Codes, Prüfsummen, Raum- und Betriebskennungen", async () => {
    ohneGeheimnisse(r.aus);
    const md = await lauf(["--sicherung", sicherung]);
    expect(md.code).toBe(2);
    expect(md.aus).toMatch(/^# Erkennung gestrandeter Betriebe/);
    expect(md.aus).toContain("| M1 | 4 |");
    ohneGeheimnisse(md.aus);
    ohneGeheimnisse(md.fehler);
    expect(md.aus).not.toContain(sicherung);
    expect(md.aus).not.toContain(basis);
  });

  it("Eingabe bleibt bytegleich, nichts in Temp- oder Arbeitsordner des Laufs", async () => {
    const vorherS = await inhaltsAbdruck(sicherung);
    const vorherQ = await inhaltsAbdruck(quelle);
    const x = await lauf(["--sicherung", sicherung, "--json"]);
    expect(x.code).toBe(2);
    expect(await inhaltsAbdruck(sicherung)).toEqual(vorherS);
    expect(await readdir(x.tmp)).toEqual([]);
    expect(await readdir(x.cwd)).toEqual([]);
    const y = await lauf(["--daten", quelle, "--kopie", "--json"]);
    expect(y.code).toBe(2);
    expect(json(y).summen).toEqual(erg.summen);
    expect(await inhaltsAbdruck(quelle)).toEqual(vorherQ);
    expect(await readdir(y.tmp)).toEqual([]);
    expect(await readdir(y.cwd)).toEqual([]);
  });

  it("--ausgabe schreibt nur dorthin (neu), nie in die Eingabe, nie über eine vorhandene Datei", async () => {
    const zielOrdner = await ordner("ausgabe");
    const datei = path.join(zielOrdner, "ergebnis.json");
    const x = await lauf(["--sicherung", sicherung, "--json", "--ausgabe", datei]);
    expect(x.code).toBe(2);
    expect(x.aus).toBe("");
    ohneGeheimnisse(await readFile(datei, "utf8"));
    expect(JSON.parse(await readFile(datei, "utf8")).summen.M1).toBe(4);
    const nochmal = await lauf(["--sicherung", sicherung, "--ausgabe", datei]);
    expect(nochmal.code).toBe(3);
    const vorher = await inhaltsAbdruck(sicherung);
    const drin = await lauf(["--sicherung", sicherung, "--ausgabe", path.join(sicherung, "ergebnis.md")]);
    expect(drin.code).toBe(3);
    expect(drin.fehler).toMatch(/nicht in der Eingabe/);
    expect(await inhaltsAbdruck(sicherung)).toEqual(vorher);
  });
});

/* ---------------------------------------------------------------------------
   unklar, Altformate, leer, beschädigt
   --------------------------------------------------------------------------- */

describe("unklar (fail-closed) und Altformate", () => {
  it("unklar: Zugang ohne Kennung bei mehreren Betrieben, Person als Zahl, doppelte Kennung, Zugang ohne Rolle → Ausgang 1", async () => {
    const LX = person("p_lx00011", "leitung");
    const { dir } = await ablageBauen({
      raeume: {
        "haus-unklar-index": { mandanten: [betrieb("m-unklar-a", [LX]), betrieb("m-unklar-b")] },
        "haus-unklar-zahl": { mandanten: [betrieb("m-unklar-zahl", [person("p_lz00012", "leitung")])] },
        "haus-unklar-doppelt": { mandanten: [betrieb("m-unklar-doppelt"), betrieb("m-unklar-doppelt")] },
        "haus-unklar-rolle": { mandanten: [betrieb("m-unklar-rolle", [person("p_lr00013", "leitung")])] },
      },
      zugaenge: [
        { bestand: "haus-unklar-index", rolle: "leitung", person: null, betrieb: 1 },
        { bestand: "haus-unklar-index", rolle: "leitung", person: LX.id, betrieb: 0, mandantId: "m-unklar-a" },
        { bestand: "haus-unklar-zahl", rolle: "leitung", person: 0, betrieb: 0, mandantId: "m-unklar-zahl" },
        { bestand: "haus-unklar-rolle", person: null, betrieb: 0, mandantId: "m-unklar-rolle" },
      ],
    });
    const r = await lauf(["--sicherung", await sicherungZiehen(dir), "--json"]);
    expect(r.code).toBe(1);
    const e = json(r);
    const gruende = e.betriebe.flatMap((b) => b.unklarGruende);
    expect(gruende).toEqual(expect.arrayContaining(["zugang-ohne-kennung-bei-mehreren-betrieben", "person-als-zahlindex",
      "kennung-doppelt", "zugang-ohne-rolle"]));
    expect(e.summen.unklar).toBeGreaterThanOrEqual(5);
    ohneGeheimnisse(r.aus);
  });

  it("Altformate: unzerlegter Bestand (bestand:<raum>) und Sammelblob „konten“ mit Bindung über die Position", async () => {
    const { dir } = await ablageBauen({
      raeume: {
        "haus-alt-leer": { alt: true, mandanten: [betrieb("m-alt-leer")] },
        "haus-alt-voll": { alt: true, mandanten: [betrieb("m-alt-voll", [person("p_la00014", "leitung", { anonym: true })])] },
      },
      sammelblob: [
        { bestand: "haus-alt-leer", rolle: "leitung", person: null, betrieb: 0, name: "Altleitung Musterhaus" },
        { bestand: "haus-alt-voll", rolle: "leitung", person: null, betrieb: 0 },
      ],
    });
    const r = await lauf(["--sicherung", await sicherungZiehen(dir), "--json"]);
    expect(r.code).toBe(2);
    const e = json(r);
    expect(e.summen).toMatchObject({ M1: 1, M3: 1, unklar: 0 });
    const m1 = finde(e, "M1")[0];
    expect(m1.unterklasse).toBe("M1-k");                  // unzerlegt: Schreibspur unbekannt → vorsichtig
    expect(m1.kundenSchreibspur).toBe("unbekannt");
    expect(finde(e, "M3")[0].leitungspersonenNichtAktiv.anonym).toBe(1);
    ohneGeheimnisse(r.aus);
  });

  it("leere Ablage und leere Sicherung: Ausgang 0, keine Betriebe", async () => {
    const leer = await ordner("leer");
    const r = await lauf(["--daten", leer, "--kopie", "--json"]);
    expect(r.code).toBe(0);
    expect(json(r).betriebe).toEqual([]);
    expect(json(r).zaehler.raeume).toBe(0);
    const { dir } = await ablageBauen({ zugaenge: [{ bestand: "betreiber", rolle: "betreiber", person: null }] });
    const s = await lauf(["--sicherung", await sicherungZiehen(dir)]);
    expect(s.code).toBe(0);
    expect(s.aus).toContain("| unklar | 0 |");
  });

  it("beschädigte Ablage: klarer Fehler, Ausgang 1, ohne Raumnamen oder Schlüssel in der Meldung", async () => {
    const { dir } = await ablageBauen({ raeume: { "haus-kaputt-geheim": { mandanten: [betrieb("m-haus-kaputt-geheim")] } } });
    const datei = path.join(dir, "centric", L.dateiname("kern:haus-kaputt-geheim"));
    await writeFile(datei, "{ das ist kein Umschlag");
    const r = await lauf(["--daten", dir, "--kopie"]);
    expect(r.code).toBe(1);
    expect(r.aus).toBe("");
    expect(r.fehler).toMatch(/^FEHLER: Lesefehler: Bestand eines Raums nicht lesbar/);
    ohneGeheimnisse(r.fehler);

    const kaputtKonto = await ablageBauen({ zugaenge: [{ bestand: "x-raum", rolle: "leitung", person: null }] });
    const kontoDatei = (await readdir(path.join(kaputtKonto.dir, "centric"))).find((n) => n.startsWith("konto"));
    await writeFile(path.join(kaputtKonto.dir, "centric", kontoDatei), JSON.stringify({ fassung: 99 }));
    const k = await lauf(["--daten", kaputtKonto.dir, "--kopie"]);
    expect(k.code).toBe(1);
    expect(k.fehler).toMatch(/Zugänge .* nicht lesbar/);
    ohneGeheimnisse(k.fehler);
  });

  it("beschädigte Sicherung (Datei nach dem Sichern verändert): Ausgang 1, nur Zahl der Befunde", async () => {
    const { dir } = await ablageBauen({ raeume: { "haus-sicherung-kaputt": { mandanten: [betrieb("m-sicherung-kaputt")] } } });
    const s = await sicherungZiehen(dir);
    const d = path.join(s, "daten", "centric", L.dateiname("kern:haus-sicherung-kaputt"));
    await writeFile(d, (await readFile(d, "utf8")).replace("Sonnenschein", "Mondschein"));
    const r = await lauf(["--sicherung", s]);
    expect(r.code).toBe(1);
    expect(r.fehler).toMatch(/Sicherung ist ungültig \(\d+ Befund/);
    ohneGeheimnisse(r.fehler);
  });
});

/* ---------------------------------------------------------------------------
   Ablehnung einer benutzten oder lebenden Ablage
   --------------------------------------------------------------------------- */

describe("nie auf einer benutzten Ablage", () => {
  let dir;
  beforeAll(async () => {
    ({ dir } = await ablageBauen({ raeume: { "haus-live": { mandanten: [betrieb("m-haus-live")] } },
      zugaenge: [{ bestand: "haus-live", rolle: "leitung", person: null, betrieb: 0, mandantId: "m-haus-live" }] }));
  });

  it("ohne --kopie abgelehnt (Ausgang 3), auch --sicherung auf eine Ablage", async () => {
    const r = await lauf(["--daten", dir]);
    expect(r.code).toBe(3);
    expect(r.fehler).toMatch(/--kopie/);
    expect((await lauf(["--sicherung", dir])).code).toBe(3);
    expect((await lauf([])).code).toBe(3);
    expect((await lauf(["--daten", dir, "--kopie", "--unbekannt"])).code).toBe(3);
  });

  it("die Ablage aus CENTRIC_DATEN wird nie gelesen", async () => {
    const r = await lauf(["--daten", dir, "--kopie"], { env: { CENTRIC_DATEN: dir } });
    expect(r.code).toBe(3);
    expect(r.fehler).toMatch(/CENTRIC_DATEN/);
  });

  it("frische Prozesssperre (laufender Server): abgelehnt, auch mit --kopie; nichts angefasst", async () => {
    const sperre = path.join(dir, ".prozess");
    /* zeit-ok: Das Skript läuft als Kindprozess und prüft die Sperre gegen die echte Uhr (Änderungszeit der Datei, nicht gegen --jetzt); Fake-Timer wirken dort nicht. "start" ist nur ein Datenwert, die frisch geschriebene Datei ist Sekunden alt (Grenze 45 s). */
    await writeFile(sperre, JSON.stringify({ pid: process.pid, start: new Date().toISOString(), rechner: hostname() }));
    const vorher = await inhaltsAbdruck(dir);
    const r = await lauf(["--daten", dir, "--kopie"]);
    expect(r.code).toBe(3);
    expect(r.fehler).toMatch(/in Benutzung/);
    expect(await inhaltsAbdruck(dir)).toEqual(vorher);
    /* Veraltet, aber keine wiederhergestellte Kopie: ebenfalls abgelehnt. */
    /* zeit-ok: Alter relativ zur echten Uhr des Kindprozesses (siehe oben); 10 min liegen weit über der Grenze von 45 s, das Ergebnis hängt nicht vom Laufzeitpunkt ab. */
    const alt = new Date(Date.now() - 10 * 60 * 1000);
    await writeFile(sperre, JSON.stringify({ pid: 999999, start: alt.toISOString(), rechner: "anderer-rechner" }));
    await utimes(sperre, alt, alt);
    const v = await lauf(["--daten", dir, "--kopie"]);
    expect(v.code).toBe(3);
    expect(v.fehler).toMatch(/keine wiederhergestellte Kopie/);
    /* Grenze der Frische (45 s) mit Abstand: 20 s alt gilt als frisch (auch mit totem Halter), 90 s alt als veraltet. */
    /* zeit-ok: Alter relativ zur echten Uhr des Kindprozesses; beide Werte liegen mindestens 25 s von der Grenze, Laufzeitschwankungen ändern das Ergebnis nicht. */
    const knapp = new Date(Date.now() - 20 * 1000);
    await utimes(sperre, knapp, knapp);
    const f = await lauf(["--daten", dir, "--kopie"]);
    expect(f.code).toBe(3);
    expect(f.fehler).toMatch(/in Benutzung/);
    const spaet = new Date(Date.now() - 90 * 1000);
    await utimes(sperre, spaet, spaet);
    const g = await lauf(["--daten", dir, "--kopie"]);
    expect(g.code).toBe(3);
    expect(g.fehler).toMatch(/keine wiederhergestellte Kopie/);
    await rm(sperre);
  });

  it("wiederhergestellte Kopie einer Sicherung wird mit --kopie gelesen, auch mit veralteter Sperre", async () => {
    const s = await sicherungZiehen(dir);
    const ziel = await ordner("wiederhergestellt");
    await G.wiederherstellen({ sicherung: s, ziel, serverPruefen: false });
    expect((await stat(path.join(ziel, G.WIEDERHERSTELL_VERMERK))).isFile()).toBe(true);
    /* zeit-ok: Alter relativ zur echten Uhr des Kindprozesses (siehe oben); 10 min liegen weit über 45 s. */
    const alt = new Date(Date.now() - 10 * 60 * 1000);
    const sperre = path.join(ziel, ".prozess");
    await writeFile(sperre, JSON.stringify({ pid: 999999, start: alt.toISOString(), rechner: "anderer-rechner" }));
    await utimes(sperre, alt, alt);
    const vorher = await inhaltsAbdruck(ziel);
    const r = await lauf(["--daten", ziel, "--kopie", "--json"]);
    expect(r.code).toBe(2);
    expect(json(r).eingabe).toBe("kopie");
    expect(json(r).summen.M1).toBe(1);
    expect(await inhaltsAbdruck(ziel)).toEqual(vorher);
  });
});

/* ---------------------------------------------------------------------------
   Bausteine
   --------------------------------------------------------------------------- */

describe("Bausteine", () => {
  it("die lesende Ablage verweigert jeden Schreibaufruf", async () => {
    const a = E.lesendeAblage(await ordner("nur-lesen"));
    for (const f of ["set", "setJSON", "setJSONWennNeu", "delete"])
      await expect(Promise.resolve().then(() => a[f]("x", "y"))).rejects.toThrow(/nur lesend/);
    expect(await a.get("fehlt")).toBe(null);
    expect((await a.list({})).blobs).toEqual([]);
  });

  it("aufFuenf und zugangNutzbar", () => {
    expect([0, 1, 5, 6, 11].map(E.aufFuenf)).toEqual([0, 5, 5, 10, 15]);
    const jetzt = Date.parse(JETZT);
    const k = { a: { ersetztDurch: "b" }, b: { ersetztDurch: "a" }, c: { laeuftAb: "2027-01-01" }, d: { ersetztDurch: "fehlt" } };
    expect(E.zugangNutzbar("a", k, jetzt)).toBe(true);     // Zyklus wird beendet
    expect(E.zugangNutzbar("c", k, jetzt)).toBe(true);
    expect(E.zugangNutzbar("d", k, jetzt)).toBe(false);    // Glied fehlt → wie gesperrt
  });
});

/* ---------------------------------------------------------------------------
   Ausgabe über Junction/Symlink, Windows-Schreibweise, Änderung während des Laufs, Warnungen, Abgleich mit #281
   --------------------------------------------------------------------------- */

/** Legt eine Verbindung (Windows: Junction, sonst Symlink auf einen Ordner) an; false, wenn das hier nicht möglich ist. */
function verbinden(ziel, link) {
  try { symlinkSync(ziel, link, "junction"); return true; } catch { return false; }
}
function trennen(link) {
  try { rmdirSync(link); } catch { try { unlinkSync(link); } catch { /* schon weg */ } }
}
const KANN_VERBINDEN = (() => {
  const d = path.join(tmpdir(), `centric-erk-junction-probe-${process.pid}`);
  const ok = verbinden(tmpdir(), d);
  if (ok) trennen(d);
  else console.warn("Junction/Symlink lässt sich hier nicht anlegen — Prüfungen über Verbindungen werden übersprungen.");
  return ok;
})();

describe("Ausgabe und Eingabe: echte Pfade und Windows-Schreibweise", () => {
  let sicherung, dir;
  beforeAll(async () => {
    ({ dir } = await ablageBauen({ raeume: { "haus-pfad": { mandanten: [betrieb("m-haus-pfad")] } },
      zugaenge: [{ bestand: "haus-pfad", rolle: "leitung", person: null, betrieb: 0, mandantId: "m-haus-pfad" }] }));
    sicherung = await sicherungZiehen(dir);
  });

  it.skipIf(!KANN_VERBINDEN)("--ausgabe über eine Junction/einen Symlink in die Eingabe wird abgelehnt, Eingabe unverändert", async () => {
    const linkOrdner = await ordner("verbindungen");
    const link = path.join(linkOrdner, "zur-eingabe");
    expect(verbinden(sicherung, link)).toBe(true);
    try {
      const vorher = await inhaltsAbdruck(sicherung);
      // Ordner der Ausgabe ist die Verbindung (textlich außerhalb der Eingabe, echt innerhalb)
      for (const ziel of [path.join(link, "ergebnis.md"), path.join(link, "daten", "ergebnis.md"), path.join(link, "neu", "unter", "ergebnis.md")]) {
        const r = await lauf(["--sicherung", sicherung, "--ausgabe", ziel]);
        expect(r.code, r.fehler).toBe(3);
        expect(r.fehler).toMatch(/nicht in der Eingabe/);
        expect(r.aus).toBe("");
      }
      // auch die Eingabe selbst über die Verbindung benannt, Ausgabe textlich daneben
      const r2 = await lauf(["--sicherung", link, "--ausgabe", path.join(sicherung, "ergebnis2.md")]);
      expect(r2.code).toBe(3);
      expect(await inhaltsAbdruck(sicherung)).toEqual(vorher);
      // Gegenprobe: eine Ausgabe wirklich außerhalb funktioniert weiter
      const aussen = path.join(await ordner("ausgabe-aussen"), "ok.md");
      expect((await lauf(["--sicherung", sicherung, "--ausgabe", aussen])).code).toBe(2);
      expect(await readFile(aussen, "utf8")).toMatch(/Erkennung gestrandeter Betriebe/);
    } finally { trennen(link); }
  });

  it.skipIf(!KANN_VERBINDEN)("eine Verbindung auf die Ablage aus CENTRIC_DATEN wird als Live-Ablage erkannt", async () => {
    const linkOrdner = await ordner("verbindungen-live");
    const link = path.join(linkOrdner, "live");
    expect(verbinden(dir, link)).toBe(true);
    try {
      const r = await lauf(["--daten", dir, "--kopie"], { env: { CENTRIC_DATEN: link } });
      expect(r.code).toBe(3);
      expect(r.fehler).toMatch(/CENTRIC_DATEN/);
    } finally { trennen(link); }
  });

  it.skipIf(process.platform !== "win32")("Windows: CENTRIC_DATEN in anderer Groß-/Kleinschreibung ist dieselbe Ablage", async () => {
    const r = await lauf(["--daten", dir, "--kopie"], { env: { CENTRIC_DATEN: dir.toUpperCase() } });
    expect(r.code).toBe(3);
    expect(r.fehler).toMatch(/CENTRIC_DATEN/);
    const r2 = await lauf(["--daten", dir.toLowerCase(), "--kopie"], { env: { CENTRIC_DATEN: dir.toUpperCase() } });
    expect(r2.code).toBe(3);
  });

  it.skipIf(process.platform !== "win32")("Windows: Ausgabe in der Eingabe in anderer Schreibweise wird abgelehnt", async () => {
    const r = await lauf(["--sicherung", sicherung, "--ausgabe", path.join(sicherung.toUpperCase(), "ergebnis.md")]);
    expect(r.code).toBe(3);
    expect(r.fehler).toMatch(/nicht in der Eingabe/);
  });
});

describe("Eingabe verändert sich während des Laufs (Abdruck vorher/nachher)", () => {
  const VORLADEN = pathToFileURL(path.join(WURZEL, "pruefungen", "erkennung-eingabe-aendern.preload.mjs")).href;
  let dir;
  beforeAll(async () => {
    ({ dir } = await ablageBauen({ raeume: { "haus-wandel": { mandanten: [betrieb("m-haus-wandel")] } },
      zugaenge: [{ bestand: "haus-wandel", rolle: "leitung", person: null, betrieb: 0, mandantId: "m-haus-wandel" }] }));
  });

  /* Vorlademodul im Kindprozess (node --import): umhüllt fs.promises.readdir und legt beim n-ten Lesen der Eingabewurzel
     eine Datei in der Eingabe an. Der erste Lesevorgang der Wurzel ist der erste Abdruck, der zweite der zweite Abdruck. */
  const mitAenderung = (eingabe, ab) => ({ nodeArgs: ["--import", VORLADEN],
    env: { TEST_EINGABE_WURZEL: eingabe, TEST_AENDERN_AB: String(ab) } });

  it("eine Datei, die zwischen erstem und zweitem Abdruck entsteht, verwirft das Ergebnis (Ausgang 1, klare Meldung)", async () => {
    const sicherung = await sicherungZiehen(dir);
    const r = await lauf(["--sicherung", sicherung, "--json"], mitAenderung(sicherung, 2));
    expect(existsSync(path.join(sicherung, "nachtraeglich.txt")), "Die Änderung des Vorlademoduls hat nicht stattgefunden").toBe(true);
    expect(r.code).toBe(1);
    expect(r.fehler).toMatch(/Die Eingabe hat sich während des Laufs verändert/);
    expect(r.aus).toBe("");
  });

  it("auch mit --ausgabe wird dann nichts geschrieben", async () => {
    const sicherung = await sicherungZiehen(dir);
    const datei = path.join(await ordner("ausgabe-wandel"), "ergebnis.json");
    const r = await lauf(["--sicherung", sicherung, "--json", "--ausgabe", datei], mitAenderung(sicherung, 2));
    expect(r.code).toBe(1);
    expect(existsSync(datei)).toBe(false);
  });

  it("Gegenprobe: ohne Änderung läuft derselbe Aufbau mit Vorlademodul normal durch", async () => {
    const sicherung = await sicherungZiehen(dir);
    const r = await lauf(["--sicherung", sicherung, "--json"], mitAenderung(sicherung, 0));
    expect(existsSync(path.join(sicherung, "nachtraeglich.txt"))).toBe(false);
    expect(r.code).toBe(2);
    expect(json(r).summen.M1).toBe(1);
  });
});

describe("Warnungen bei --gespeicherte-kennungen und festem Laufschlüssel", () => {
  let sicherung;
  beforeAll(async () => {
    const { dir } = await ablageBauen({ raeume: { "haus-warn": { mandanten: [betrieb("m-haus-warn")] } },
      zugaenge: [{ bestand: "haus-warn", rolle: "leitung", person: null, betrieb: 0, mandantId: "m-haus-warn" }] });
    sicherung = await sicherungZiehen(dir);
  });

  it("--gespeicherte-kennungen: deutsche WARNUNG auf stderr, nicht auf stdout", async () => {
    const r = await lauf(["--sicherung", sicherung, "--gespeicherte-kennungen"], { env: { ERKENNUNG_LAUFSCHLUESSEL: null } });
    expect(r.fehlerRoh).toMatch(/^WARNUNG: --gespeicherte-kennungen gibt die gespeicherte Betriebskennung aus\./m);
    expect(r.fehlerRoh).toMatch(/nicht einchecken, nicht weitergeben/);
    expect(r.aus).not.toMatch(/WARNUNG/);
  });

  it("ohne die Option keine WARNUNG; mit festem Laufschlüssel ein HINWEIS, ohne ihn keiner", async () => {
    const ohne = await lauf(["--sicherung", sicherung], { env: { ERKENNUNG_LAUFSCHLUESSEL: null } });
    expect(ohne.fehlerRoh).toBe("");
    const fest = await lauf(["--sicherung", sicherung]);
    expect(fest.fehlerRoh).toMatch(/^HINWEIS: ERKENNUNG_LAUFSCHLUESSEL ist gesetzt .* verknüpfbar/m);
    expect(fest.fehlerRoh).not.toMatch(/WARNUNG/);
    expect(fest.fehlerRoh).not.toContain(LAUFSCHLUESSEL);
  });
});

/* Abgleich der nachgebildeten Prädikate mit PR #281 (server/lib/erstleitung.mjs). Die Datei liegt auf release-v4 noch
   nicht; solange sie fehlt, wird übersprungen (Titel nennt den Grund). Danach: Kopie im Skript durch Import ersetzen. */
const ERSTLEITUNG = path.join(WURZEL, "server", "lib", "erstleitung.mjs");
describe("Abgleich mit den Prädikaten aus PR #281", () => {
  const vorhanden = existsSync(ERSTLEITUNG);
  /* Mit Ausstellungszeit: Seit PR #281 (e8b9b93d) ist ein Vermerk ohne lesbare Zeit abgelaufen (fail-closed). */
  const basis0 = () => ({ rolle: "leitung", person: null, mandantId: "m1", bestand: "r1",
    erstleitung: { mandantId: "m1", angelegt: new Date().toISOString() } });
  const FAELLE = [
    ["null", null], ["undefiniert", undefined], ["Text", "x"], ["Zahl", 3], ["Liste", []], ["leeres Objekt", {}],
    ["gültig offen", basis0()],
    ["abgelaufen (angelegt vor 15 Tagen)", { ...basis0(), erstleitung: { mandantId: "m1", angelegt: new Date(Date.now() - 15 * 864e5).toISOString() } }],
    ["abgelaufen (bis vorbei)", { ...basis0(), erstleitung: { mandantId: "m1", angelegt: new Date().toISOString(), bis: new Date(Date.now() - 1000).toISOString() } }],
    ["ohne Zeit", { ...basis0(), erstleitung: { mandantId: "m1" } }],
    ["Vermerk fehlt", { ...basis0(), erstleitung: undefined }],
    ["Vermerk Liste", { ...basis0(), erstleitung: [] }],
    ["Vermerk Text", { ...basis0(), erstleitung: "x" }],
    ["verbraucht", { ...basis0(), erstleitungVerbraucht: { grund: "belegt" } }],
    ["verbraucht, ohne offenen Vermerk", { ...basis0(), erstleitung: undefined, erstleitungVerbraucht: { grund: "belegt" } }],
    ["verbraucht, nicht Objekt", { ...basis0(), erstleitung: undefined, erstleitungVerbraucht: "ja" }],
    ["Rolle Planung", { ...basis0(), rolle: "planung" }],
    ["Rolle fehlt", { ...basis0(), rolle: undefined }],
    ["Demo", { ...basis0(), demo: true }],
    ["Demo falsch", { ...basis0(), demo: false }],
    ["gesperrt", { ...basis0(), gesperrt: true }],
    ["gesperrt als Text", { ...basis0(), gesperrt: "2026-01-01" }],
    ["Betrieb weicht ab", { ...basis0(), mandantId: "m2" }],
    ["Betrieb im Vermerk leer", { ...basis0(), erstleitung: { mandantId: "" } }],
    ["Betrieb im Vermerk fehlt", { ...basis0(), erstleitung: {} }],
    ["Betrieb im Vermerk Zahl", { ...basis0(), erstleitung: { mandantId: 1 }, mandantId: 1 }],
    ["Betrieb am Zugang fehlt", { ...basis0(), mandantId: undefined }],
    ["Bestand leer", { ...basis0(), bestand: "" }],
    ["Bestand fehlt", { ...basis0(), bestand: undefined }],
    ["Bestand Zahl", { ...basis0(), bestand: 7 }],
    ["mit Person", { ...basis0(), person: "p_abc1234" }],
    ["Person leer", { ...basis0(), person: "" }],
    ["Person undefiniert", { ...basis0(), person: undefined }],
  ];

  it.skipIf(!vorhanden)("erstleitungOffen und erstleitungsZugang verhalten sich wie in server/lib/erstleitung.mjs", async () => {
    const echt = await import("../server/lib/erstleitung.mjs");
    expect(typeof echt.erstleitungOffen, "erstleitungOffen fehlt in server/lib/erstleitung.mjs").toBe("function");
    expect(typeof echt.erstleitungsZugang, "erstleitungsZugang fehlt in server/lib/erstleitung.mjs").toBe("function");
    for (const [name, eintrag] of FAELLE) {
      expect(E.erstleitungOffen(eintrag), `erstleitungOffen: ${name}`).toBe(!!echt.erstleitungOffen(eintrag));
      expect(E.erstleitungsZugang(eintrag), `erstleitungsZugang: ${name}`).toBe(!!echt.erstleitungsZugang(eintrag));
    }
  });

  it.skipIf(vorhanden)("ÜBERSPRUNGEN, solange server/lib/erstleitung.mjs fehlt (PR #281 noch nicht auf release-v4): Abgleich nachholen", () => {
    expect(vorhanden).toBe(false);
  });

  it("die Tabelle selbst ist nicht trivial (sowohl offene als auch nicht offene Fälle)", () => {
    const offen = FAELLE.filter(([, e]) => E.erstleitungOffen(e)).length;
    expect(offen).toBeGreaterThan(0);
    expect(offen).toBeLessThan(FAELLE.length);
    expect(FAELLE.filter(([, e]) => E.erstleitungsZugang(e)).length).toBeGreaterThan(3);
  });
});
