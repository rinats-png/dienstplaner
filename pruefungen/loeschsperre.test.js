/* ==========================================================================
   LÖSCHEN UND ANLEGEN UNTER DER RAUMSPERRE (WP-02, Auflagen aus dem Review)

   2  Der Löschlauf für abgelaufene Testbetriebe (aufraeumen.mjs) löschte
      ohne Raumsperre. Lief gerade ein Schreiber, legte er nach dem Löschen
      wieder Standvermerke ab — Waisen ohne Kern, die kein späterer Lauf
      mehr findet.
   3  Die Provisionierung prüfte „Raum frei?" und legte an, ohne Sperre:
      Zwei gleichzeitige Anlagen derselben Kennung meldeten beide Erfolg,
      die zweite überschrieb die erste. Der Rückbau (zurueckrollen) löschte
      ungesperrt wie der Löschlauf.
   9  Der Sammelblob „konten" gehört allen Räumen. Zwei gleichzeitige
      Löschungen lasen beide den alten Blob, und die zweite schrieb die
      Codes der ersten zurück.

   Gleichzeitigkeit wird hier erzwungen, nicht erhofft: Der Schreiber
   bekommt eine Ablage, die vor dem Standvermerk anhält, bis die Löschung
   gelaufen ist (oder nach einer Frist, falls die Sperre die Löschung gar
   nicht erst hereinlässt).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let wurzel, store, sitzungen, B, aufraeumen, P, L;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-loeschsperre-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  const { getStore } = await import("../server/lib/ablage.mjs");
  store = getStore({ name: "centric", consistency: "strong" });
  sitzungen = getStore({ name: "centric-sitzungen", consistency: "strong" });
  B = await import("../server/lib/bestand.mjs");
  aufraeumen = await import("../server/lib/aufraeumen.mjs");
  P = await import("../server/lib/provisionierung.mjs");
  L = await import("../server/lib/raumloeschung.mjs");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ein abgelaufener, selbst angelegter Testbetrieb ohne Zugangscodes. */
const testbetrieb = (raum, monat = "2026-01") => ({ version: 9, mandanten: [{ id: raum, name: raum,
  selbstAngelegt: true, status: "test", laeuftAb: "2026-01-01T00:00:00.000Z",
  einheiten: [], dienstarten: [], personen: [],
  abweichungen: { [`p1|${monat}-05`]: "F" }, abwesenheiten: [], erfassung: {}, einstempeln: {} }] });

/**
 * Eine Ablage, die vor dem Schreiben eines Standvermerks des Raums anhält:
 * meldet `drin`, wartet dann auf `weiter` (höchstens `frist` ms).
 */
function bremsendeAblage(raum, frist = 600) {
  let drin, weiter;
  const signale = { drin: new Promise((r) => { drin = r; }), weiter: () => weiter && weiter() };
  const freigabe = new Promise((r) => { weiter = r; });
  let einmal = false;
  const ablage = { ...store,
    setJSON: async (k, v, o) => {
      if (!einmal && k.startsWith(`stand:${raum}:`) && k !== `stand:${raum}:aktuell`) {
        einmal = true;
        drin();
        await Promise.race([freigabe, warte(frist)]);
      }
      return store.setJSON(k, v, o);
    } };
  return { ablage, signale };
}

/** Alles, was zu einem Raum im Store „centric" liegt. */
async function reste(raum) {
  const aus = [];
  for (const p of [`kern:${raum}`, `scherbe:${raum}:`, `stand:${raum}:`]) {
    const { blobs } = await store.list({ prefix: p });
    aus.push(...blobs.map((b) => b.key).filter((k) => k === `kern:${raum}` || k.startsWith(p)));
  }
  return aus;
}

describe("2 — Löschlauf parallel zu einem Schreiber", () => {
  it("hinterlässt keine Waisen", async () => {
    const RAUM = "t-loeschlauf";
    await B.bestandSchreiben(store, RAUM, testbetrieb(RAUM), { durch: "Pruefung" });
    const g = await B.bestandLesen(store, RAUM);
    const neu = JSON.parse(JSON.stringify(g.bestand));
    neu.mandanten[0].abweichungen["p1|2026-02-05"] = "F";

    const { ablage, signale } = bremsendeAblage(RAUM);
    const schreiben = B.bestandSchreiben(ablage, RAUM, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    await signale.drin;
    const lauf = aufraeumen.testbetriebeAufraeumen(store, sitzungen, { jetzt: new Date("2027-06-01T00:00:00Z") })
      .then((v) => { signale.weiter(); return v; });
    const [, vermerk] = await Promise.all([schreiben.catch((e) => e), lauf]);

    expect(vermerk.geloescht).toContain(RAUM);
    expect(await reste(RAUM), "Waisen nach dem Löschlauf").toEqual([]);
  });
});

describe("3 — Provisionierung unter der Raumsperre", () => {
  it("zwei gleichzeitige Anlagen derselben Kennung: genau eine gelingt, die andere „belegt“", async () => {
    const raum = "t-doppelt";
    const [a, b] = await Promise.all([
      P.testbetriebAnlegen(store, { name: "Erster", branche: "sonstige", raum }),
      P.testbetriebAnlegen(store, { name: "Zweiter", branche: "sonstige", raum }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const verlierer = a.ok ? b : a;
    expect(verlierer.grund).toBe("belegt");
    const gewinnerName = a.ok ? "Erster" : "Zweiter";
    expect((await B.bestandLesen(store, raum)).bestand.mandanten[0].name).toBe(gewinnerName);
  });

  it("Rückbau parallel zu einem Schreiber hinterlässt keine Waisen", async () => {
    const RAUM = "t-rueckbau";
    await B.bestandSchreiben(store, RAUM, testbetrieb(RAUM), { durch: "Pruefung" });
    const g = await B.bestandLesen(store, RAUM);
    const neu = JSON.parse(JSON.stringify(g.bestand));
    neu.mandanten[0].abweichungen["p1|2026-03-05"] = "F";

    const { ablage, signale } = bremsendeAblage(RAUM);
    const schreiben = B.bestandSchreiben(ablage, RAUM, neu, { erwarteterStand: g.stand, durch: "Pruefung" });
    await signale.drin;
    const rueckbau = P.zurueckrollen(store, sitzungen, "a-gibt-es-nicht", RAUM)
      .then((v) => { signale.weiter(); return v; });
    await Promise.all([schreiben.catch((e) => e), rueckbau]);

    expect(await reste(RAUM), "Waisen nach dem Rückbau").toEqual([]);
  });
});

describe("9 — Sammelblob „konten“ bei gleichzeitigen Löschungen", () => {
  it("zwei Räume gleichzeitig gelöscht: die Codes beider sind weg, fremde bleiben", async () => {
    await store.setJSON("konten", {
      c1: { bestand: "t-sammel-a", name: "A" }, c2: { bestand: "t-sammel-b", name: "B" },
      c3: { bestand: "fremd", name: "C" } });
    /* Jede Löschung liest den Blob und wartet dann kurz — ohne Sperre lesen
       damit beide den alten Stand, bevor einer zurückschreibt. */
    const langsam = { ...store,
      get: async (k, o) => {
        const v = await store.get(k, o);
        if (k === "konten") await warte(150);
        return v;
      } };
    await Promise.all([
      L.raumLoeschen(langsam, sitzungen, "t-sammel-a"),
      L.raumLoeschen(langsam, sitzungen, "t-sammel-b"),
    ]);
    expect(Object.keys(await store.get("konten", { type: "json" })).sort()).toEqual(["c3"]);
  });
});

describe("WP-45/2 — Anmeldung während der Raumlöschung", () => {
  it("kontoVereinzeln legt kein Einzelkonto für einen gerade gelöschten Raum an", async () => {
    const { kontoVereinzeln } = await import("../server/lib/konten.mjs");
    await store.setJSON("konten", { x1: { bestand: "t-anmeldung", name: "X" }, x2: { bestand: "fremd", name: "Y" } });
    /* Die Löschung hält an, sobald sie den Sammelblob liest — genau dann
       meldet sich jemand mit dem Code x1 an. */
    let lesend;
    const angehalten = new Promise((r) => { lesend = r; });
    let einmal = false;
    const langsam = { ...store,
      get: async (k, o) => {
        if (k === "konten" && !einmal) {
          einmal = true;
          lesend();
          await warte(150);
        }
        return store.get(k, o);
      } };
    const loeschen = L.raumLoeschen(langsam, sitzungen, "t-anmeldung");
    await angehalten;
    /* Aus dem Prüfablauf selbst, nicht aus der Löschung heraus — eine
       eigene Anfrage, die die Sperren der Löschung nicht hält. */
    const anmeldung = kontoVereinzeln(store, "x1");
    await Promise.all([loeschen, anmeldung]);
    expect(await store.get("konto:x1", { type: "json" }), "Code zeigt auf gelöschten Raum").toBeNull();
    expect(Object.keys(await store.get("konten", { type: "json" }))).toEqual(["x2"]);
  });
});
