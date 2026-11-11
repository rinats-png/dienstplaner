/* ==========================================================================
   ABLÖSUNG DER ROLLE „kunde" (Betreiberentscheidung 2026-11-07)

   Geprüft wird:
   - Rollenvergabe: ohne ausdrückliche Rolle und mit „kunde" entsteht kein Zugang
     (rolleVergebbar; HTTP-Wege stehen in rollen-failclosed.test.js und
     sicherheit-intern.test.js).
   - Der Betreiberzugang bleibt in jedem Fall unberührt (Kern und Werkzeug).
   - Gezielte Umstellung: nur aktive Demozugänge mit Rolle „kunde" → „leitung",
     `demo` bleibt, keine Löschung; übrige „kunde"-/rollenlose Konten nur gemeldet.
   - Die Demo-Funktion läuft mit ausdrücklicher Rolle (Mandantentrennung bleibt
     über die Bindung des Kontos an Raum und Betrieb).
   - „Auftraggeber" (Wachbuch) ist keine Betriebsrolle und von „kunde" getrennt.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rolleVergebbar, ROLLEN_VERGEBBAR, MATRIX, schreibumfang, rolleBekannt, sitzungsRolleBekannt } from "../server/lib/rechte.mjs";
import { auswerten, umstellungPlan, umstellen } from "../server/lib/kunde-abloesung.mjs";
import { WACHBUCH_ZUGRIFF } from "../server/lib/modul-wachbuch.mjs";
import { wachbuchZugriffFuer } from "../src/module/zugriff.js";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const konten = () => ({
  "h-betreiber-00000001": { name: "Betreiber", bestand: "demo-schau", rolle: "betreiber", person: null, betrieb: 0, demo: false, angelegt: "2026-01-01" },
  "h-kundedemo-00000002": { name: "Demo A", bestand: "demo-schau", rolle: "kunde", person: null, betrieb: 0, mandantId: "m-a", demo: true, gruppe: "g", id: "d00000002" },
  "h-kundedemo-00000003": { name: "Demo B", bestand: "demo-schau", rolle: "kunde", person: null, betrieb: 1, mandantId: "m-b", demo: true, id: "d00000003" },
  "h-kundegesp-00000004": { name: "Demo gesperrt", bestand: "demo-schau", rolle: "kunde", demo: true, gesperrt: true },
  "h-kundereal-00000005": { name: "Kein Demo", bestand: "x", rolle: "kunde", demo: false },
  "h-ohnerolle-00000006": { name: "Ohne", bestand: "x", demo: false },
  "h-leitung-000000007": { name: "Leitung", bestand: "demo-schau", rolle: "leitung", person: "l1", betrieb: 2, demo: true, id: "d00000007" },
});

describe("Rollenvergabe ohne Vorgabe", () => {
  it("vergebbar sind genau die Rollen der Rangliste; kunde, fehlende und erfundene Angaben nicht", () => {
    expect([...ROLLEN_VERGEBBAR].sort()).toEqual(["betreiber", "betriebsrat", "leitung", "mitarbeiter", "planer", "subplaner"]);
    for (const r of ROLLEN_VERGEBBAR) expect(rolleVergebbar(r), r).toBe(true);
    for (const r of [undefined, null, "", "kunde", "Kunde", "gast", "__proto__", 0, {}, []]) expect(rolleVergebbar(r), JSON.stringify(r)).toBe(false);
  });
  it("auch rolleBekannt kennt keine Vorgabe mehr; Altbestand „kunde“ wird weiter gelesen (bis zur Umstellung)", () => {
    expect(rolleBekannt(undefined)).toBe(false);
    expect(rolleBekannt(null)).toBe(false);
    expect(rolleBekannt("kunde")).toBe(true);
    expect(sitzungsRolleBekannt("kunde")).toBe(true);
    expect(sitzungsRolleBekannt(undefined)).toBe(false);
  });
  /* RB-3 (Betreiberentscheidung 2026-11-11, bewusste Änderung): Die Altrolle „kunde" erhält auch im Probierraum
     kein plan.publish. Bis auf genau dieses Recht bleibt sie der Leitung gleich — kein weiteres Recht fällt weg,
     keines kommt hinzu (Wege mit hartem leitung-Check: HTTP-Test in sicherheit-intern). */
  it("kunde ist die MATRIX der Leitung ohne plan.publish, mit demselben Schreibumfang", () => {
    expect([...MATRIX.kunde].sort()).toEqual(MATRIX.leitung.filter((r) => r !== "plan.publish").sort());
    expect(MATRIX.kunde).not.toContain("plan.publish");
    expect(MATRIX.leitung).toContain("plan.publish");
    expect(schreibumfang("kunde")).toBe(schreibumfang("leitung"));
  });
});

describe("Auswertung und gezielte Umstellung", () => {
  it("die Auswertung zählt je Rolle und trennt Betreiber, Demo-kunde, übriges kunde und rollenlos — ohne Codes", () => {
    const a = auswerten(konten());
    expect(a.gesamt).toBe(7);
    expect(a.betreiber.map((z) => z.rolle)).toEqual(["betreiber"]);
    expect(a.kundeDemo).toHaveLength(2);
    expect(a.kundeSonst).toHaveLength(2); // gesperrt + ohne Demo
    expect(a.ohneRolle).toHaveLength(1);
    expect(a.proRolle).toMatchObject({ betreiber: 1, kunde: 4, leitung: 1, "(ohne)": 1 });
    const text = JSON.stringify(a);
    expect(text).not.toContain("h-betreiber-00000001"); // nur die letzten acht Zeichen
    expect(a.betreiber[0].kennung).toBe("00000001");
  });
  it("der Plan enthält nur aktive Demozugänge mit kunde und nie den Betreiber", () => {
    const p = umstellungPlan(konten());
    expect(p.map((x) => x.hash).sort()).toEqual(["h-kundedemo-00000002", "h-kundedemo-00000003"]);
    for (const x of p) { expect(x.nachher.rolle).toBe("leitung"); expect(x.nachher.demo).toBe(true); expect(x.nachher.rolleVorher).toBe("kunde"); expect(x.nachher.bestand).toBe(x.vorher.bestand); expect(x.nachher.mandantId).toBe(x.vorher.mandantId); expect(x.nachher.betrieb).toBe(x.vorher.betrieb); }
  });
  it("Kollision: gibt es im Betrieb schon einen aktiven leitung-Demozugang, wird nicht doppelt umgestellt, sondern gemeldet", async () => {
    const k = { ...konten(), "h-dopp-00000009": { name: "Demo A neu", bestand: "demo-schau", rolle: "leitung", betrieb: 0, demo: true } };
    expect(umstellungPlan(k).map((x) => x.hash)).toEqual(["h-kundedemo-00000003"]);
    const { kollisionen } = await import("../server/lib/kunde-abloesung.mjs");
    expect(kollisionen(k).map((z) => z.kennung)).toEqual(["00000002"]);
  });
  it("Trockenlauf schreibt nichts; Ausführen schreibt genau die Demozugänge", async () => {
    const k = konten();
    const geschrieben = [];
    const t = await umstellen(k, { ausfuehren: false, schreiben: async (h) => { geschrieben.push(h); } });
    expect(t).toMatchObject({ ausgefuehrt: false, geplant: 2 });
    expect(geschrieben).toEqual([]);
    const r = await umstellen(k, { ausfuehren: true, schreiben: async (h) => { geschrieben.push(h); } });
    expect(r).toMatchObject({ ausgefuehrt: true, geplant: 2 });
    expect(geschrieben.sort()).toEqual(["h-kundedemo-00000002", "h-kundedemo-00000003"]);
    expect(geschrieben).not.toContain("h-betreiber-00000001");
  });
  it("ein Plan, der ein Betreiberkonto berührte, bricht ab (Absicherung)", async () => {
    const k = { "h-x": { rolle: "kunde", demo: true } };
    // Selbst wenn jemand die Planfunktion verbog: Betreiber gelangen nie in den Plan.
    expect(umstellungPlan({ "h-b": { rolle: "betreiber", demo: true } })).toEqual([]);
    expect((await umstellen(k, { ausfuehren: false })).geplant).toBe(1);
    await expect(umstellen(k, { ausfuehren: true })).rejects.toThrow(/schreiben fehlt/);
  });
});

describe("Werkzeug werkzeug/kunde-abloesen.mjs (echte Ablage, Wegwerfdaten)", () => {
  let daten;
  const lauf = (...arg) => spawnSync(process.execPath, [path.join(WURZEL, "werkzeug", "kunde-abloesen.mjs"), ...arg],
    { env: { ...process.env, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien" }, encoding: "utf8" });
  const lesen = async () => {
    const { getStore } = await import("../server/lib/ablage.mjs");
    const { alleKonten } = await import("../server/lib/konten.mjs");
    return alleKonten(getStore({ name: "centric", consistency: "strong" }));
  };
  beforeAll(async () => {
    daten = await mkdtemp(path.join(tmpdir(), "centric-kunde-"));
    process.env.CENTRIC_DATEN = daten; process.env.CENTRIC_ABLAGE = "dateien";
    const { getStore } = await import("../server/lib/ablage.mjs");
    const { kontoSchreiben } = await import("../server/lib/konten.mjs");
    const store = getStore({ name: "centric", consistency: "strong" });
    for (const [h, k] of Object.entries(konten())) await kontoSchreiben(store, h, k);
  });
  afterAll(async () => { await rm(daten, { recursive: true, force: true }); });

  it("ohne --ausfuehren nur Bericht: nichts ändert sich, Betreiber sichtbar, keine Codes", async () => {
    const vorher = JSON.stringify(await lesen());
    const r = lauf();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Betreiberzugänge \(1\)/);
    expect(r.stdout).toMatch(/Trockenlauf: 2 würden umgestellt/);
    expect(r.stdout).not.toContain("h-betreiber-00000001");
    expect(JSON.stringify(await lesen())).toBe(vorher);
  });
  it("mit --ausfuehren: Demo-kunde → leitung (demo bleibt), Rest und Betreiber unverändert, nichts gelöscht", async () => {
    const vorher = await lesen();
    const r = lauf("--ausfuehren");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/UMGESTELLT: 2/);
    expect(r.stdout).toMatch(/Betreiberzugang unverändert/);
    const nachher = await lesen();
    expect(Object.keys(nachher).sort()).toEqual(Object.keys(vorher).sort());
    expect(nachher["h-betreiber-00000001"]).toEqual(vorher["h-betreiber-00000001"]);
    for (const h of ["h-kundedemo-00000002", "h-kundedemo-00000003"]) {
      expect(nachher[h]).toMatchObject({ rolle: "leitung", demo: true, rolleVorher: "kunde", bestand: vorher[h].bestand, betrieb: vorher[h].betrieb, mandantId: vorher[h].mandantId });
    }
    for (const h of ["h-kundegesp-00000004", "h-kundereal-00000005", "h-ohnerolle-00000006", "h-leitung-000000007"]) expect(nachher[h]).toEqual(vorher[h]);
    // zweiter Lauf: nichts mehr zu tun
    const r2 = lauf("--ausfuehren");
    expect(r2.stdout).toMatch(/UMGESTELLT: 0/);
  });
  it("ohne Datenordner bricht das Werkzeug ab", () => {
    const r = spawnSync(process.execPath, [path.join(WURZEL, "werkzeug", "kunde-abloesen.mjs")], { env: { ...process.env, CENTRIC_DATEN: "" }, encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

describe("Auftraggeber (Wachbuch) ist keine Betriebsrolle", () => {
  it("der externe Auftraggeber heißt Auftraggeber, sieht nichts, und „Kunde“ gibt es dort nicht mehr", () => {
    expect(WACHBUCH_ZUGRIFF.Auftraggeber).toBe("keiner");
    expect(Object.prototype.hasOwnProperty.call(WACHBUCH_ZUGRIFF, "Kunde")).toBe(false);
  });
  it("keine Serverrolle führt auf die Auftraggeber-Stufe; kunde und erfundene Rollen bleiben „keiner“ (fail-closed)", () => {
    for (const r of ["kunde", "Auftraggeber", "auftraggeber", undefined, null, "gast"]) expect(wachbuchZugriffFuer(r), String(r)).toBe("keiner");
    expect(wachbuchZugriffFuer("leitung")).toBe("voll");
    expect(wachbuchZugriffFuer("mitarbeiter")).toBe("eigene");
  });
});
