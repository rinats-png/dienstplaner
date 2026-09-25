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
let A;
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
  /* Der echte Account-Speicher — kein Nachbau: Die Löschung muss die
     Schlüssel treffen, die accounts.mjs wirklich schreibt. */
  A = await import("../server/lib/accounts.mjs");
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
    /* Solange der Raum einen Zugangscode hat, muss einer von ihnen die
       Selbststart-Merkmale tragen. Ein Raum ohne jeden Code fällt unter die
       dritte Bestätigung (eigener Abschnitt weiter unten). */
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [kontoVon("t-probe", { selbstAngelegt: false })] })).toEqual([]);
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [kontoVon("t-probe", { laeuftAb: null })] })).toEqual([]);
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [kontoVon("t-probe", { laeuftAb: "x" })] })).toEqual([]);
    expect(zuLoeschendeTestraeume(k, spaet, { konten: [kontoVon("t-probe")] })).toEqual(["t-probe"]);
    /* Die serverseitige Löschmarke ersetzt die Merkmale — für den Wiederanlauf
       einer abgebrochenen Löschung, bei der die Konten schon weg sind. Geprüft
       mit einem Code ohne Merkmale, damit allein die Marke den Unterschied
       macht. */
    const ohneMerkmale = [kontoVon("t-probe", { selbstAngelegt: false })];
    expect(zuLoeschendeTestraeume(k, spaet, { konten: ohneMerkmale, begonnen: ["t-probe"] })).toEqual(["t-probe"]);
    expect(zuLoeschendeTestraeume(k, spaet, { konten: ohneMerkmale, begonnen: ["t-anderer"] })).toEqual([]);
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

/* ==========================================================================
   PERSÖNLICHE KONTEN UND DIE RAUMLÖSCHUNG

   Ein Raum verschwindet — und mit ihm jede Berechtigung in ihm. Der Mensch
   dahinter bleibt: Sein Account gehört keinem Betrieb, und er kann in einem
   anderen weiterarbeiten. Geprüft wird beides, gegen den echten Löschpfad
   und den echten Account-Speicher.
   ========================================================================== */

/** Alle accountbezogenen Schlüssel eines Raums — zum Nachsehen. */
async function raumKonten(raum) {
  const aus = [];
  const { blobs } = await store.list({ prefix: "mitglied:" });
  for (const b of blobs) {
    const teile = b.key.split(":");
    if (teile.length === 3 && teile[2] === raum) aus.push(b.key);
  }
  for (const p of [`raummitglied:${raum}:`, `push:${raum}:`]) {
    const { blobs: bs } = await store.list({ prefix: p });
    for (const b of bs) aus.push(b.key);
  }
  return aus.sort();
}

const mitgliedAnlegen = async (accountId, raum, felder = {}) => {
  const e = await A.mitgliedschaftAnlegen(store, { accountId, raum, betrieb: 0,
    mandantId: "m1", rolle: "mitarbeiter", status: "aktiv", ...felder });
  expect(e.ok, `${raum}: ${e.grund}`).toBe(true);
  return e.mitgliedschaft;
};

const kontoAnlegen = async (email) => {
  const e = await A.accountAnlegen(store, { email });
  expect(e.ok, `${email}: ${e.grund}`).toBe(true);
  return e.account;
};

describe("Raumlöschung mit persönlichen Konten", () => {
  it("nimmt Mitgliedschaft und Raumindex mit, den Account aber nicht", async () => {
    const R = "t-loesch-eins";
    await raumAnlegen(R, kernVon());
    const a = await kontoAnlegen("eins@example.org");
    await mitgliedAnlegen(a.id, R, { rolle: "leitung", person: "p17" });
    expect(await raumKonten(R)).toEqual([
      `mitglied:${a.id}:${R}`, `raummitglied:${R}:${a.id}`]);

    const e = await raumLoeschen(store, sitzungen, R);
    expect(e.vollstaendig).toBe(true);
    expect(e.fehler).toEqual([]);
    expect(await raumKonten(R)).toEqual([]);
    expect(await A.mitgliedschaftLesen(store, a.id, R)).toBe(null);

    /* Der Mensch bleibt — mit Kennung, Zeiger und Adresse. */
    expect(await A.accountLesenPerId(store, a.id)).not.toBe(null);
    expect((await A.accountLesenPerMail(store, "eins@example.org")).id).toBe(a.id);
    expect(await store.get(A.kontoIdSchluessel(a.id), { type: "json" })).toBeTruthy();
    expect(await store.get(A.accountSchluessel("eins@example.org"), { type: "json" }))
      .toBeTruthy();
  });

  it("lässt die Mitgliedschaft desselben Accounts im anderen Raum unberührt", async () => {
    const X = "t-loesch-x";
    const Y = "t-bleibt-y";
    await raumAnlegen(X, kernVon());
    await raumAnlegen(Y, kernVon());
    const a = await kontoAnlegen("beide@example.org");
    await mitgliedAnlegen(a.id, X, { rolle: "leitung", person: "p17" });
    const inY = await mitgliedAnlegen(a.id, Y, { rolle: "mitarbeiter", person: "p83" });
    const vorher = JSON.stringify(inY);

    await raumLoeschen(store, sitzungen, X);

    expect(await A.mitgliedschaftLesen(store, a.id, X)).toBe(null);
    expect(JSON.stringify(await A.mitgliedschaftLesen(store, a.id, Y))).toBe(vorher);
    expect(await raumKonten(Y)).toEqual([
      `mitglied:${a.id}:${Y}`, `raummitglied:${Y}:${a.id}`]);
    expect((await A.mitgliedschaftenDesAccounts(store, a.id)).map((m) => m.raum)).toEqual([Y]);
    await raumLoeschen(store, sitzungen, Y);
  });

  it("nimmt alle Mitglieder des Raums mit und lässt fremde Räume stehen", async () => {
    const X = "t-mehrere-x";
    const Z = "t-fremder-z";
    await raumAnlegen(X, kernVon());
    await raumAnlegen(Z, kernVon());
    const a = await kontoAnlegen("mehr-a@example.org");
    const b = await kontoAnlegen("mehr-b@example.org");
    const c = await kontoAnlegen("mehr-c@example.org");
    await mitgliedAnlegen(a.id, X, { rolle: "leitung" });
    await mitgliedAnlegen(a.id, Z, { rolle: "planer" });
    await mitgliedAnlegen(b.id, X, { rolle: "mitarbeiter" });
    await mitgliedAnlegen(c.id, Z, { rolle: "mitarbeiter" });

    await raumLoeschen(store, sitzungen, X);

    expect(await raumKonten(X)).toEqual([]);
    expect(await A.mitgliedschaftenDesRaums(store, X)).toEqual([]);
    /* Raum Z ist vollständig unberührt: beide Mitglieder, beide Indizes. */
    expect(new Set((await A.mitgliedschaftenDesRaums(store, Z)).map((m) => m.accountId)))
      .toEqual(new Set([a.id, c.id]));
    for (const konto of [a, b, c]) {
      expect(await A.accountLesenPerId(store, konto.id), konto.id).not.toBe(null);
    }
    await raumLoeschen(store, sitzungen, Z);
  });

  it("nimmt auch eine entzogene Mitgliedschaft mit — der Grabstein gehört zum Raum", async () => {
    const R = "t-grabstein-r";
    await raumAnlegen(R, kernVon());
    const a = await kontoAnlegen("grab@example.org");
    await mitgliedAnlegen(a.id, R, { rolle: "leitung" });
    expect((await A.mitgliedschaftEntziehen(store, a.id, R)).ok).toBe(true);
    /* Solange der Raum steht, bleibt der Beleg. */
    expect((await A.mitgliedschaftLesen(store, a.id, R)).status).toBe("entzogen");

    await raumLoeschen(store, sitzungen, R);
    expect(await raumKonten(R)).toEqual([]);
    expect(await A.mitgliedschaftLesen(store, a.id, R)).toBe(null);
    expect(await A.accountLesenPerId(store, a.id)).not.toBe(null);
  });

  it("entfernt einen verwaisten Raumindex ohne Mitgliedschaft", async () => {
    const R = "t-verwaist-idx";
    await raumAnlegen(R, kernVon());
    await store.setJSON(`raummitglied:${R}:a_verwaist`,
      { accountId: "a_verwaist", raum: R });
    expect(await raumKonten(R)).toEqual([`raummitglied:${R}:a_verwaist`]);

    const e = await raumLoeschen(store, sitzungen, R);
    expect(e.vollstaendig).toBe(true);
    expect(await raumKonten(R)).toEqual([]);
  });

  it("entfernt eine verwaiste Mitgliedschaft ohne Raumindex", async () => {
    const R = "t-verwaist-mit";
    await raumAnlegen(R, kernVon());
    const a = await kontoAnlegen("verwaist@example.org");
    await mitgliedAnlegen(a.id, R, { rolle: "planer" });
    /* Der Index geht verloren — die Löschung darf sich nicht darauf stützen. */
    await store.delete(`raummitglied:${R}:${a.id}`);
    expect(await raumKonten(R)).toEqual([`mitglied:${a.id}:${R}`]);

    const e = await raumLoeschen(store, sitzungen, R);
    expect(e.vollstaendig).toBe(true);
    expect(await raumKonten(R)).toEqual([]);
    expect(await A.accountLesenPerId(store, a.id)).not.toBe(null);
  });

  it("räumt die Push-Anmeldungen des Raums ab und nur die", async () => {
    const X = "t-push-x";
    const Y = "t-push-y";
    await raumAnlegen(X, kernVon());
    await raumAnlegen(Y, kernVon());
    for (const [raum, person] of [[X, "p17"], [X, "p83"], [Y, "p17"]]) {
      await store.setJSON(`push:${raum}:${person}`,
        { endpoint: `https://push.example/${raum}-${person}`, keys: {} });
    }
    /* Ein Raum, dessen Name mit demselben Anfang beginnt, darf nicht mitgehen. */
    await store.setJSON(`push:${X}x:p1`, { endpoint: "https://push.example/fremd" });

    await raumLoeschen(store, sitzungen, X);

    expect(await store.get(`push:${X}:p17`, { type: "json" }).catch(() => null)).toBe(null);
    expect(await store.get(`push:${X}:p83`, { type: "json" }).catch(() => null)).toBe(null);
    expect(await store.get(`push:${Y}:p17`, { type: "json" })).toBeTruthy();
    expect(await store.get(`push:${X}x:p1`, { type: "json" })).toBeTruthy();
    await store.delete(`push:${X}x:p1`);
    await raumLoeschen(store, sitzungen, Y);
    expect(await store.get(`push:${Y}:p17`, { type: "json" }).catch(() => null)).toBe(null);
  });

  it("trifft mit konto: niemals die Kennungszeiger persönlicher Accounts", async () => {
    const R = "t-namensraum-r";
    await raumAnlegen(R, kernVon());
    const a = await kontoAnlegen("namensraum@example.org");
    await mitgliedAnlegen(a.id, R);
    const idKey = A.kontoIdSchluessel(a.id);
    const accKey = A.accountSchluessel("namensraum@example.org");
    /* Beide beginnen mit „konto"/„account" — aber nicht mit „konto:". */
    expect(idKey.startsWith("konto:")).toBe(false);
    expect(accKey.startsWith("konto:")).toBe(false);

    const e = await raumLoeschen(store, sitzungen, R);
    expect(e.vollstaendig).toBe(true);
    /* Der Zugangscode des Raums ist weg, der Kennungszeiger steht. */
    expect(await store.get(`konto:h-${R}`, { type: "json" }).catch(() => null)).toBe(null);
    expect(await store.get(idKey, { type: "json" })).toBeTruthy();
    expect(await store.get(accKey, { type: "json" })).toBeTruthy();
    expect((await store.list({ prefix: "kontoId:" })).blobs.length).toBeGreaterThan(0);
  });

  it("löscht beim zweiten Mal nichts Fremdes mehr", async () => {
    const X = "t-zweimal-x";
    const Y = "t-zweimal-y";
    await raumAnlegen(X, kernVon());
    await raumAnlegen(Y, kernVon());
    const a = await kontoAnlegen("zweimal@example.org");
    await mitgliedAnlegen(a.id, X);
    await mitgliedAnlegen(a.id, Y, { rolle: "leitung" });
    await raumLoeschen(store, sitzungen, X);

    const zweite = await raumLoeschen(store, sitzungen, X);
    expect(zweite.vollstaendig).toBe(true);
    expect(zweite.fehler).toEqual([]);
    /* Nichts vom anderen Raum, nichts vom Account. */
    expect(await A.accountLesenPerId(store, a.id)).not.toBe(null);
    expect((await A.mitgliedschaftLesen(store, a.id, Y)).rolle).toBe("leitung");
    expect(await raumKonten(Y)).toEqual([
      `mitglied:${a.id}:${Y}`, `raummitglied:${Y}:${a.id}`]);
    await raumLoeschen(store, sitzungen, Y);
  });

  it("meldet einen Fehler, wenn eine Mitgliedschaft nicht gelöscht werden kann", async () => {
    const R = "t-klemmt-mit";
    await raumAnlegen(R, kernVon());
    const a = await kontoAnlegen("klemmt@example.org");
    await mitgliedAnlegen(a.id, R);
    const klemme = `mitglied:${a.id}:${R}`;
    const stur = new Proxy(store, { get(ziel, name) {
      if (name !== "delete") return Reflect.get(ziel, name);
      return (key) => (key === klemme
        ? Promise.reject(new Error("Zugriff verweigert"))
        : ziel.delete(key));
    } });

    const e = await raumLoeschen(stur, sitzungen, R);
    expect(e.vollstaendig).toBe(false);
    expect(e.fehler.some((f) => f.schluessel === klemme)).toBe(true);
    /* Der Kern bleibt stehen: Der nächste Lauf findet den Raum wieder. */
    expect(await store.get(`kern:${R}`, { type: "json" })).toBeTruthy();
    /* Und der Account ist trotzdem unangetastet. */
    expect(await A.accountLesenPerId(store, a.id)).not.toBe(null);
    await store.delete(klemme);
    await raumLoeschen(store, sitzungen, R);
  });

  it("bindet die Löschung an die genaue Schreibweise des Raumnamens", async () => {
    /* Die Dateiablage unterscheidet auf Linux Groß- und Kleinschreibung, auf
       Windows und macOS nicht (Befund aus Phase 2.3). Dieser Test hält beide
       Plattformen fest, statt eine zu bevorzugen — und prüft auf beiden, was
       wirklich zählt: dass nach der Löschung niemand mehr eine Berechtigung
       für diesen Raum hat und kein anderer Raum mitgegangen ist. */
    const KLEIN = "t-schreibweise-a";
    const GROSS = "t-Schreibweise-A";
    const satz = (raum) => ({ accountId: "a_probe", raum, betrieb: 0,
      mandantId: "m1", rolle: "leitung", status: "aktiv" });
    await store.setJSON(`mitglied:a_probe:${KLEIN}`, satz(KLEIN));
    await store.setJSON(`mitglied:a_probe:${GROSS}`, satz(GROSS));
    const gelesen = await store.get(`mitglied:a_probe:${KLEIN}`, { type: "json" });
    const trennt = !!gelesen && gelesen.raum === KLEIN;

    await raumLoeschen(store, sitzungen, KLEIN);

    /* Keine Berechtigung mehr für den gelöschten Raum — das ist auf beiden
       Plattformen die Zusage. Auf einer Ablage ohne
       Schreibweisenunterscheidung bleibt der Schlüssel der anderen
       Schreibweise liegen; er verleiht nichts, weil der Datensatz den Raum
       nennt, zu dem er gehört (mitgliedschaftLesen in accounts.mjs). */
    expect(await A.mitgliedschaftLesen(store, "a_probe", KLEIN)).toBe(null);
    if (trennt) {
      /* Linux: zwei Schlüssel, zwei Räume. Der eine ist weg, der andere steht. */
      expect(await store.get(`mitglied:a_probe:${KLEIN}`, { type: "json" })
        .catch(() => null)).toBe(null);
      expect((await A.mitgliedschaftLesen(store, "a_probe", GROSS)).raum).toBe(GROSS);
      await store.delete(`mitglied:a_probe:${GROSS}`);
    } else {
      /* Windows/macOS: Beide Schreibweisen sind dieselbe Datei, und sie
         gehört dem Raum, der zuletzt geschrieben wurde. Beim Löschen von
         „t-schreibweise-a" bleibt sie deshalb zu Recht stehen — sie ist die
         Mitgliedschaft von „t-Schreibweise-A". Eine Kanonisierung der
         Raumnamen gehört in die Endpoint-Ebene, nicht hierher. */
      expect((await store.get(`mitglied:a_probe:${KLEIN}`, { type: "json" })).raum)
        .toBe(GROSS);
      await store.delete(`mitglied:a_probe:${GROSS}`);
    }
  });
});

/* ==========================================================================
   EIN TESTRAUM OHNE ZUGANGSCODE

   Bisher war ein Raum nur Kandidat, wenn eines seiner Zugangskonten die
   Selbststart-Merkmale trug. Nach der Umstellung auf persönliche Konten gibt
   es diese Codes nicht mehr — und derselbe Fall entsteht schon heute, wenn
   der Betreiber die Codes eines abgelaufenen Raums von Hand löscht: Der Raum
   blieb für immer liegen.

   Geprüft wird die dritte Bestätigung an ihren Grenzen: Sie greift nur, wenn
   der Raum gar keinen Code mehr hat, und sie hebt keine der anderen
   Bedingungen auf.
   ========================================================================== */

describe("Testraumerkennung ohne Zugangscode", () => {
  const eintrag = (raum, extra) => ({ raum, kern: kernVon(extra) });
  const spaet = ablaufMs + 400 * TAG;

  it("erkennt einen abgelaufenen Testraum, der keinen Code mehr hat", () => {
    expect(zuLoeschendeTestraeume([eintrag("t-ohne-code")], spaet, { konten: [] }))
      .toEqual(["t-ohne-code"]);
    /* Codes anderer Räume ändern daran nichts. */
    expect(zuLoeschendeTestraeume([eintrag("t-ohne-code")], spaet,
      { konten: [kontoVon("t-anderer")] })).toEqual(["t-ohne-code"]);
  });

  it("bleibt streng, solange der Raum noch irgendeinen Code hat", () => {
    const k = [eintrag("t-mit-code")];
    /* Ein Code ohne Selbststart-Merkmale: dann zählt der Kern nicht. Das ist
       die alte, strengere Regel — unverändert. */
    expect(zuLoeschendeTestraeume(k, spaet,
      { konten: [kontoVon("t-mit-code", { selbstAngelegt: false })] })).toEqual([]);
    expect(zuLoeschendeTestraeume(k, spaet,
      { konten: [kontoVon("t-mit-code", { laeuftAb: null })] })).toEqual([]);
    /* Mit Merkmalen: Kandidat, wie bisher. */
    expect(zuLoeschendeTestraeume(k, spaet,
      { konten: [kontoVon("t-mit-code")] })).toEqual(["t-mit-code"]);
  });

  it("wartet, wenn sich ein Zugangscode nicht lesen ließ", () => {
    /* „Nicht lesbar" darf nie zu „ist nicht da" werden: Sonst hebt ein
       einziger Lesefehler die Bestätigung auf. */
    expect(zuLoeschendeTestraeume([eintrag("t-unlesbar")], spaet,
      { konten: [], kontenUnvollstaendig: true })).toEqual([]);
    /* Die anderen beiden Bestätigungen wirken weiter. */
    expect(zuLoeschendeTestraeume([eintrag("t-unlesbar")], spaet,
      { konten: [kontoVon("t-unlesbar")], kontenUnvollstaendig: true }))
      .toEqual(["t-unlesbar"]);
    expect(zuLoeschendeTestraeume([eintrag("t-unlesbar")], spaet,
      { konten: [], begonnen: ["t-unlesbar"], kontenUnvollstaendig: true }))
      .toEqual(["t-unlesbar"]);
  });

  it("hebt ohne Code keine der Kernbedingungen auf", () => {
    const o = { konten: [] };
    /* Produktivraum: Status aktiv — niemals, ob mit Codes oder ohne. */
    expect(zuLoeschendeTestraeume([eintrag("t-kunde-ohne-code", { status: "aktiv" })],
      spaet, o)).toEqual([]);
    /* Kein t--Präfix. */
    expect(zuLoeschendeTestraeume([eintrag("kunde-nordwacht-2")], spaet, o)).toEqual([]);
    /* Demoraum. */
    expect(zuLoeschendeTestraeume([eintrag("demo-schau-2")], spaet, o)).toEqual([]);
    /* Nicht selbst angelegt. */
    expect(zuLoeschendeTestraeume([eintrag("t-fremd-2", { selbstAngelegt: false })],
      spaet, o)).toEqual([]);
    /* Kein oder unbrauchbares Ablaufdatum — fail closed. */
    expect(zuLoeschendeTestraeume([eintrag("t-kein-ablauf-2", { laeuftAb: null })],
      spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([eintrag("t-krumm-2", { laeuftAb: "irgendwann" })],
      spaet, o)).toEqual([]);
    /* Kein Kern, kein Betrieb darin. */
    expect(zuLoeschendeTestraeume([{ raum: "t-leer-2", kern: null }], spaet, o)).toEqual([]);
    expect(zuLoeschendeTestraeume([{ raum: "t-ohne-mandant-2", kern: { mandanten: [] } }],
      spaet, o)).toEqual([]);
  });

  it("ändert keine Frist: Tag 89 nein, Tag 90 ja — auch ohne Code", () => {
    const k = [eintrag("t-frist-ohne-code")];
    expect(zuLoeschendeTestraeume(k, ablaufMs + 89 * TAG, { konten: [] })).toEqual([]);
    expect(zuLoeschendeTestraeume(k, ablaufMs + 90 * TAG, { konten: [] }))
      .toEqual(["t-frist-ohne-code"]);
    /* Und vor Ablauf der Testzeit erst gar nicht. */
    expect(zuLoeschendeTestraeume(k, ablaufMs - TAG, { konten: [] })).toEqual([]);
  });

  it("löscht im echten Lauf einen abgelaufenen Testraum ohne Code samt Mitgliedschaften",
    async () => {
      const R = "t-lauf-ohne-code";
      /* Derselbe Raum wie sonst, nur ohne Zugangscode — so sieht ein Raum
         nach der Umstellung auf persönliche Konten aus. */
      await raumAnlegen(R, kernVon());
      await store.delete(`konto:h-${R}`);
      const a = await kontoAnlegen("lauf@example.org");
      await mitgliedAnlegen(a.id, R, { rolle: "leitung", person: "p17" });
      await store.setJSON(`push:${R}:p17`, { endpoint: "https://push.example/x" });

      const v = await testbetriebeAufraeumen(store, sitzungen,
        { jetzt: ablaufMs + 100 * TAG });

      expect(v.geloescht).toContain(R);
      expect(v.fehler.filter((f) => f.raum === R)).toEqual([]);
      expect(await raumSchluessel(R)).toEqual([]);
      expect(await raumKonten(R)).toEqual([]);
      /* Der Mensch bleibt. */
      expect(await A.accountLesenPerId(store, a.id)).not.toBe(null);
    });

  it("lässt einen Produktivraum ohne Code auch im echten Lauf stehen", async () => {
    const R = "t-produktiv-ohne-code";
    await raumAnlegen(R, kernVon({ status: "aktiv" }));
    await store.delete(`konto:h-${R}`);
    const a = await kontoAnlegen("produktiv@example.org");
    await mitgliedAnlegen(a.id, R, { rolle: "leitung" });

    const v = await testbetriebeAufraeumen(store, sitzungen,
      { jetzt: ablaufMs + 400 * TAG });

    expect(v.geloescht).not.toContain(R);
    expect(await store.get(`kern:${R}`, { type: "json" })).toBeTruthy();
    expect((await A.mitgliedschaftLesen(store, a.id, R)).rolle).toBe("leitung");
    await raumLoeschen(store, sitzungen, R);
  });
});
