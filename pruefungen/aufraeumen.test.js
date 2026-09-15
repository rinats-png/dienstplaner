/* ==========================================================================
   AUFRÄUMEN — abgelaufene Testbetriebe werden gelöscht, sonst nichts

   Ein Testbetrieb läuft dreißig Tage, wird neunzig Tage aufbewahrt und
   danach automatisch gelöscht. Geprüft wird die Kandidatenwahl an ihren
   Grenzen (Tag 89 nein, Tag 90 ja), der Lauf gegen eine echte Dateiablage
   mit allen Schlüsselarten, die Idempotenz und der Fehlerfall: Bleibt
   etwas liegen, bleibt der Kern stehen, der Vermerk nennt den Grund, und
   der nächste Lauf räumt nach.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let getStore, zuLoeschendeTestraeume, testbetriebeAufraeumen, letzterLauf, raumLoeschen, zusammenfuehren;
let wurzel, store, sitzungen;

const TAG = 86400000;
const ABLAUF = "2026-06-01T12:00:00.000Z";
const ablaufMs = new Date(ABLAUF).getTime();

const kernVon = (extra = {}) => ({ version: 5, mandanten: [{ id: "m1", name: "Probe",
  status: "test", selbstAngelegt: true, laeuftAb: ABLAUF, personen: [], ...extra }] });
/* Das Konto, wie /starten es schreibt — die serverseitige Bestätigung. */
const kontoVon = (raum, extra = {}) => ({ bestand: raum, rolle: "leitung",
  selbstAngelegt: true, laeuftAb: ABLAUF, ...extra });

/** Legt einen Raum mit jeder Schlüsselart an, die zu ihm gehört. */
async function raumAnlegen(raum, kern, konto) {
  await store.setJSON(`kern:${raum}`, kern);
  await store.setJSON(`bestand:${raum}`, kern);
  await store.setJSON(`scherbe:${raum}:m1::2026-05`, { m1: {} });
  await store.setJSON(`stand:${raum}:1`, { abdruecke: {} });
  await store.setJSON(`stand:${raum}:aktuell`, { nr: 1 });
  await store.setJSON(`sicherung:${raum}:2026-05-01-00-00-00`, kern);
  await store.setJSON(`konto:h-${raum}`, konto || kontoVon(raum));
  await sitzungen.setJSON(`t:s-${raum}`, { bestand: raum, rolle: "leitung", bis: Date.now() + TAG });
  await sitzungen.setJSON(`sk:k-${raum}`, { bestand: raum, rolle: "leitung", nurSicherung: true, bis: Date.now() + TAG });
  await store.setJSON(`feed:f-${raum}`, { bestand: raum, personId: "p1" });
  await store.setJSON(`feeddaten:f-${raum}`, { termine: [] });
  const liste = (await store.get("selbststarts", { type: "json" })) || [];
  liste.unshift({ raum, name: "Probe", angelegt: ABLAUF, laeuftAb: ABLAUF });
  await store.setJSON("selbststarts", liste);
}

/** Alle Schlüssel, die einen Raum betreffen — zum Nachsehen, ob er weg ist. */
async function raumSchluessel(raum) {
  const aus = [];
  for (const p of ["kern:", "bestand:", "scherbe:", "stand:", "sicherung:", "konto:", "feed:", "feeddaten:"]) {
    const { blobs } = await store.list({ prefix: p });
    for (const b of blobs) {
      if (b.key.includes(raum)) aus.push(b.key);
      else if (p === "konto:" || p === "feed:") {
        const v = await store.get(b.key, { type: "json" }).catch(() => null);
        if (v && v.bestand === raum) aus.push(b.key);
      }
    }
  }
  for (const p of ["t:", "sk:"]) {
    const { blobs } = await sitzungen.list({ prefix: p });
    for (const b of blobs) {
      const v = await sitzungen.get(b.key, { type: "json" }).catch(() => null);
      if (v && v.bestand === raum) aus.push(`sitzung ${b.key}`);
    }
  }
  const liste = (await store.get("selbststarts", { type: "json" })) || [];
  if (liste.some((x) => x.raum === raum)) aus.push("selbststarts");
  return aus;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-aufraeumen-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  ({ zuLoeschendeTestraeume, testbetriebeAufraeumen, letzterLauf } = await import("../server/lib/aufraeumen.mjs"));
  ({ raumLoeschen } = await import("../server/lib/raumloeschung.mjs"));
  ({ zusammenfuehren } = await import("../server/lib/rechte.mjs"));
  store = getStore({ name: "centric", consistency: "strong" });
  sitzungen = getStore({ name: "centric-sitzungen", consistency: "strong" });
});

afterAll(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

describe("Kandidatenwahl", () => {
  const eintrag = (raum, extra) => ({ raum, kern: kernVon(extra) });
  /* Zu jedem Raum ein passendes Konto — die serverseitige Bestätigung. */
  const mit = (raeume) => ({ konten: raeume.map((r) => kontoVon(r)) });
  const alle = ["t-probe", "t-ohne-ablauf", "t-kaputt", "t-aktiv", "t-fremd", "t-unmarkiert",
    "kunde-nordwacht", "demo-schau", "t-leer", "t-ohne-mandant"];

  it("löscht ab genau neunzig Tagen nach Ablauf, keinen Tag früher", () => {
    const k = [eintrag("t-probe")];
    expect(zuLoeschendeTestraeume(k, ablaufMs + 89 * TAG, mit(alle))).toEqual([]);
    expect(zuLoeschendeTestraeume(k, ablaufMs + 90 * TAG - 1, mit(alle))).toEqual([]);
    expect(zuLoeschendeTestraeume(k, ablaufMs + 90 * TAG, mit(alle))).toEqual(["t-probe"]);
    expect(zuLoeschendeTestraeume(k, ablaufMs + 91 * TAG, mit(alle))).toEqual(["t-probe"]);
  });

  it("nimmt die Aufbewahrung als Parameter", () => {
    const k = [eintrag("t-probe")];
    expect(zuLoeschendeTestraeume(k, ablaufMs + 10 * TAG, { aufbewahrungTage: 10, ...mit(alle) })).toEqual(["t-probe"]);
    expect(zuLoeschendeTestraeume(k, ablaufMs + 9 * TAG, { aufbewahrungTage: 10, ...mit(alle) })).toEqual([]);
  });

  it("verschont alles, was im Kern nicht eindeutig ein abgelaufener Testbetrieb ist", () => {
    const spaet = ablaufMs + 400 * TAG;
    const o = mit(alle);
    expect(zuLoeschendeTestraeume([eintrag("t-ohne-ablauf", { laeuftAb: null })], spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([eintrag("t-kaputt", { laeuftAb: "irgendwann" })], spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([eintrag("t-aktiv", { status: "aktiv" })], spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([eintrag("t-fremd", { selbstAngelegt: false })], spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([eintrag("t-unmarkiert", { selbstAngelegt: undefined })], spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([eintrag("kunde-nordwacht")], spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([eintrag("demo-schau")], spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([{ raum: "t-leer", kern: null }], spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([{ raum: "t-ohne-mandant", kern: { mandanten: [] } }], spaet, o)).toEqual([]);
  });

  it("verlangt die serverseitige Bestätigung aus den Konten", () => {
    const spaet = ablaufMs + 400 * TAG;
    const k = [eintrag("t-probe")];
    expect(zuLoeschendeTestraeume(k, spaet)).toEqual([]);                               // gar keine Konten
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [kontoVon("t-anderer")] })).toEqual([]);
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [kontoVon("t-probe", { selbstAngelegt: false })] })).toEqual([]);
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [kontoVon("t-probe", { laeuftAb: null })] })).toEqual([]);
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [kontoVon("t-probe", { laeuftAb: "x" })] })).toEqual([]);
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [kontoVon("t-probe")] })).toEqual(["t-probe"]);
    /* Nur die serverseitige Löschmarke ersetzt die Konten — für den Wiederanlauf. */
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [], begonnen: ["t-probe"] })).toEqual(["t-probe"]);
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [], begonnen: ["t-anderer"] })).toEqual([]);
    /* Die Marke hebt die Kernbedingungen nicht auf. */
    expect(zuLoeschendeTestraeume([eintrag("t-probe", { status: "aktiv" })], spaet, { begonnen: ["t-probe"] })).toEqual([]);
  });

  it("zählt ab dem spätesten Ablaufdatum aus Kern und Konten", () => {
    const k = [eintrag("t-probe")];
    const spaeter = new Date(ablaufMs + 30 * TAG).toISOString();
    const o = { konten: [kontoVon("t-probe", { laeuftAb: spaeter })] };
    expect(zuLoeschendeTestraeume(k, ablaufMs + 100 * TAG, o)).toEqual([]);
    expect(zuLoeschendeTestraeume(k, ablaufMs + 120 * TAG, o)).toEqual(["t-probe"]);
  });

  it("findet den selbst angelegten Betrieb auch hinter einem eingeschleusten", () => {
    const spaet = ablaufMs + 400 * TAG;
    const kern = { mandanten: [{ id: "fremd", name: "Fremd" }, kernVon().mandanten[0]] };
    expect(zuLoeschendeTestraeume([{ raum: "t-probe", kern }], spaet, mit(["t-probe"]))).toEqual(["t-probe"]);
  });
});

describe("Löschlauf", () => {
  const WEG = "t-abgelaufen-aaaaa";
  const BLEIBT = "t-frisch-bbbbb";
  const KUNDE = "nordwacht";
  const jetzt = ablaufMs + 100 * TAG;

  it("löscht genau den abgelaufenen Testbetrieb, mit allen Schlüsselarten", async () => {
    await raumAnlegen(WEG, kernVon());
    await raumAnlegen(BLEIBT, kernVon({ laeuftAb: new Date(ablaufMs + 50 * TAG).toISOString() }));
    await raumAnlegen(KUNDE, kernVon({ status: "aktiv", selbstAngelegt: false, laeuftAb: null }));
    expect(await raumSchluessel(WEG)).toHaveLength(12);

    const v = await testbetriebeAufraeumen(store, sitzungen, { jetzt });
    expect(v.uebersprungen).toBe(false);
    expect(v.geprueft).toBe(2);           // nur kern:t-*, der Kundenraum wird gar nicht angesehen
    expect(v.geloescht).toEqual([WEG]);
    expect(v.fehler).toEqual([]);

    expect(await raumSchluessel(WEG)).toEqual([]);
    expect(await raumSchluessel(BLEIBT)).toHaveLength(12);
    expect(await raumSchluessel(KUNDE)).toHaveLength(12);

    const vermerk = await letzterLauf(store);
    expect(vermerk.geloescht).toEqual([WEG]);
    expect(vermerk.geprueft).toBe(2);
    expect(vermerk.zeit).toBe(new Date(jetzt).toISOString());
    expect(JSON.stringify(vermerk)).not.toMatch(/h-t-|s-t-|@/);   // keine Konten, Sitzungen, Adressen
    /* Sperre ist wieder frei. */
    expect(await store.get("aufraeumen:sperre", { type: "json" })).toBeNull();
  });

  it("tut beim zweiten Lauf nichts und meldet keinen Fehler", async () => {
    const v = await testbetriebeAufraeumen(store, sitzungen, { jetzt });
    expect(v.geloescht).toEqual([]);
    expect(v.fehler).toEqual([]);
    expect(v.geprueft).toBe(1);
    expect(await raumSchluessel(BLEIBT)).toHaveLength(12);
    expect(await raumSchluessel(KUNDE)).toHaveLength(12);
  });

  it("lässt den Raum stehen und erkennbar, wenn ein Bestandteil nicht gelöscht werden kann", async () => {
    const KAPUTT = "t-kaputt-ccccc";
    await raumAnlegen(KAPUTT, kernVon());
    /* Ein Store, der genau einen Schlüssel nicht loslässt. */
    const stur = new Proxy(store, { get(ziel, name) {
      if (name === "delete") return async (key) => {
        if (key === `konto:h-${KAPUTT}`) throw new Error("Platte klemmt");
        return ziel.delete(key);
      };
      return ziel[name];
    } });

    const v1 = await testbetriebeAufraeumen(stur, sitzungen, { jetzt });
    expect(v1.geloescht).toEqual([]);
    expect(v1.fehler).toHaveLength(1);
    expect(v1.fehler[0].raum).toBe(KAPUTT);
    expect(v1.fehler[0].grund).toContain("Platte klemmt");
    expect(v1.fehler[0].grund).toContain(`konto:h-${KAPUTT}`);
    /* Der Marker steht noch, das klemmende Konto auch. */
    expect(await store.get(`kern:${KAPUTT}`, { type: "json" })).not.toBeNull();
    expect(await store.get(`konto:h-${KAPUTT}`, { type: "json" })).not.toBeNull();
    expect((await letzterLauf(store)).fehler[0].raum).toBe(KAPUTT);
    expect(await store.get("aufraeumen:sperre", { type: "json" })).toBeNull();

    /* Nächster Lauf ohne die Störung: alles weg. */
    const v2 = await testbetriebeAufraeumen(store, sitzungen, { jetzt });
    expect(v2.geloescht).toEqual([KAPUTT]);
    expect(v2.fehler).toEqual([]);
    expect(await raumSchluessel(KAPUTT)).toEqual([]);
  });

  it("überspringt, solange eine frische Sperre steht, und ignoriert eine verwaiste", async () => {
    await store.setJSON("aufraeumen:sperre", { seit: jetzt - 10 * 60 * 1000 });
    const v = await testbetriebeAufraeumen(store, sitzungen, { jetzt });
    expect(v.uebersprungen).toBe(true);
    await store.setJSON("aufraeumen:sperre", { seit: jetzt - 2 * 60 * 60 * 1000 });
    const v2 = await testbetriebeAufraeumen(store, sitzungen, { jetzt });
    expect(v2.uebersprungen).toBe(false);
    expect(await store.get("aufraeumen:sperre", { type: "json" })).toBeNull();
  });

  it("wirft nicht, wenn die Ablage beim Auflisten versagt", async () => {
    const blind = new Proxy(store, { get(ziel, name) {
      if (name === "list") return async () => { throw new Error("kein Verzeichnis"); };
      return ziel[name];
    } });
    const v = await testbetriebeAufraeumen(blind, sitzungen, { jetzt });
    expect(v.fehler).toHaveLength(1);
    expect(v.fehler[0].grund).toContain("kein Verzeichnis");
    expect(v.geloescht).toEqual([]);
  });
});

describe("Manipulationsschutz", () => {
  const jetzt = ablaufMs + 100 * TAG;
  const sitzungLeitung = { rolle: "leitung", bestand: "t-x", person: null };

  it("löscht trotz manipuliertem Kern, solange die Konten die Selbststart-Merkmale tragen", async () => {
    const OHNE = "t-manip-ohne-ablauf";
    const FALSCH = "t-manip-selbst-false";
    const FREMD = "t-manip-fremd-vorn";
    await raumAnlegen(OHNE, kernVon({ laeuftAb: undefined }));
    await raumAnlegen(FALSCH, kernVon({ selbstAngelegt: false }));
    await raumAnlegen(FREMD, { version: 5, mandanten: [{ id: "eingeschleust", name: "Fremd", personen: [] },
      kernVon().mandanten[0]] });
    const v = await testbetriebeAufraeumen(store, sitzungen, { jetzt });
    expect(v.geloescht).toEqual(expect.arrayContaining([FREMD]));
    expect(await raumSchluessel(FREMD)).toEqual([]);
    /* Ohne gültige Kernfelder wird nicht gelöscht — die Konten allein reichen
       nicht; beide Quellen müssen übereinstimmen. Diese beiden Räume sind
       nur erreichbar, wenn der Schreibschutz in rechte.mjs versagt: */
    expect(v.geloescht).not.toContain(OHNE);
    expect(v.geloescht).not.toContain(FALSCH);
    for (const r of [OHNE, FALSCH]) await raumLoeschen(store, sitzungen, r);
  });

  it("lässt laeuftAb und selbstAngelegt beim Schreiben der Leitung nicht verändern", () => {
    const gespeichert = kernVon();
    const versuch = { ...gespeichert, mandanten: [{ ...gespeichert.mandanten[0],
      laeuftAb: undefined, selbstAngelegt: false, status: "aktiv" }] };
    delete versuch.mandanten[0].laeuftAb;
    const aus = zusammenfuehren(gespeichert, versuch, sitzungLeitung);
    expect(aus.mandanten[0].laeuftAb).toBe(ABLAUF);
    expect(aus.mandanten[0].selbstAngelegt).toBe(true);
    expect(aus.mandanten[0].status).toBe("test");
    /* Und ein Betrieb, den es gespeichert nicht gibt, kommt ohne Vertragsfelder an;
       der gespeicherte bleibt mitsamt seinen Merkmalen erhalten. */
    const eingeschleust = { ...gespeichert, mandanten: [{ id: "neu", name: "Neu", status: "aktiv",
      selbstAngelegt: true, laeuftAb: "2099-01-01T00:00:00.000Z", personen: [] }] };
    const aus2 = zusammenfuehren(gespeichert, eingeschleust, sitzungLeitung);
    const neu = aus2.mandanten.find((m) => m.id === "neu");
    expect(neu.status).toBeUndefined();
    expect(neu.selbstAngelegt).toBeUndefined();
    expect(neu.laeuftAb).toBeUndefined();
    const echt = aus2.mandanten.find((m) => m.id === "m1");
    expect(echt).toMatchObject({ status: "test", selbstAngelegt: true, laeuftAb: ABLAUF });
  });
});

describe("Löschsicherheit", () => {
  const jetzt = ablaufMs + 100 * TAG;

  it("lässt den Kern stehen, wenn bestand: nicht gelöscht werden kann", async () => {
    const R = "t-bestand-klemmt";
    await raumAnlegen(R, kernVon());
    const stur = new Proxy(store, { get(ziel, name) {
      if (name === "delete") return async (key) => {
        if (key === `bestand:${R}`) throw new Error("bestand klemmt");
        return ziel.delete(key);
      };
      return ziel[name];
    } });
    const v1 = await testbetriebeAufraeumen(stur, sitzungen, { jetzt });
    expect(v1.geloescht).toEqual([]);
    expect(v1.fehler.map((f) => f.raum)).toContain(R);
    expect(v1.fehler.find((f) => f.raum === R).grund).toContain("bestand klemmt");
    expect(await store.get(`kern:${R}`, { type: "json" })).not.toBeNull();
    expect(await store.get(`bestand:${R}`, { type: "json" })).not.toBeNull();
    /* Die Konten sind schon weg — die Löschmarke des Servers trägt den Wiederanlauf. */
    expect(await store.get(`konto:h-${R}`, { type: "json" })).toBeNull();
    expect(await store.get(`loeschung:${R}`, { type: "json" })).not.toBeNull();
    /* Beim nächsten Lauf ist er noch auffindbar und wird fertig gelöscht. */
    const v2 = await testbetriebeAufraeumen(store, sitzungen, { jetzt });
    expect(v2.geloescht).toEqual([R]);
    expect(await raumSchluessel(R)).toEqual([]);
    expect(await store.get(`loeschung:${R}`, { type: "json" })).toBeNull();
  });

  it("meldet einen beschädigten Kern als Fehler und macht mit den anderen weiter", async () => {
    const KAPUTT = "t-kaputter-kern";
    const GUT = "t-guter-raum";
    await raumAnlegen(GUT, kernVon());
    await store.setJSON(`konto:h-${KAPUTT}`, kontoVon(KAPUTT));
    /* Ein Umschlag, den die Ablage nicht versteht. */
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(wurzel, "centric", `kern%3A${KAPUTT}.json`), "{ dies ist kein umschlag", "utf8");

    const v = await testbetriebeAufraeumen(store, sitzungen, { jetzt });
    expect(v.geloescht).toEqual([GUT]);
    expect(v.geprueft).toBe(3);   // GUT, KAPUTT und der noch aufzubewahrende t-frisch von oben
    const f = v.fehler.find((x) => x.raum === KAPUTT);
    expect(f).toBeDefined();
    expect(f.grund).toContain("Kern nicht lesbar");
    expect(f.grund).not.toContain("dies ist kein umschlag");   // kein Rohinhalt im Vermerk
    expect((await letzterLauf(store)).fehler.some((x) => x.raum === KAPUTT)).toBe(true);
    /* Nichts vom beschädigten Raum wurde angerührt. */
    expect(await store.get(`konto:h-${KAPUTT}`, { type: "json" })).not.toBeNull();
    const { readFile, rm: entfernen } = await import("node:fs/promises");
    expect(await readFile(path.join(wurzel, "centric", `kern%3A${KAPUTT}.json`), "utf8")).toContain("kein umschlag");
    await entfernen(path.join(wurzel, "centric", `kern%3A${KAPUTT}.json`));
    await store.delete(`konto:h-${KAPUTT}`);
  });
});

describe("raumLoeschen", () => {
  it("ist auf einem nicht vorhandenen Raum folgenlos", async () => {
    const e = await raumLoeschen(store, sitzungen, "t-gibt-es-nicht");
    expect(e.vollstaendig).toBe(true);
    expect(e.fehler).toEqual([]);
  });

  it("räumt den Sammelblob mit auf und löscht den Kern zuletzt", async () => {
    const R = "t-sammel-ddddd";
    await raumAnlegen(R, kernVon());
    await store.setJSON("konten", { "alt-hash": { bestand: R, rolle: "planer" }, "fremd": { bestand: "x" } });
    const e = await raumLoeschen(store, sitzungen, R);
    expect(e.vollstaendig).toBe(true);
    expect(await raumSchluessel(R)).toEqual([]);
    expect(await store.get("konten", { type: "json" })).toEqual({ fremd: { bestand: "x" } });
  });
});
