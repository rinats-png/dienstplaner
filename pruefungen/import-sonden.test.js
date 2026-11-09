/* ==========================================================================
   IMP-3 — Negativ-Sonden für die fünf Wege von /api/import (Routen-Inventar,
   RECHTEMATRIX.md §2). Schreibt den Ist-Zustand fest, verbessert nichts:

     /api/import/upload, /api/import/analyse, /api/import/vorschau,
     /api/import/uebernahme, /api/import/verwerfen

   - ohne Sitzung 401
   - Kundenrolle (alte Rückfallrolle, ohne Person) und Betreiber → 403, nichts
     wird geparst, kein Vorgang entsteht, der Bestand bleibt unverändert
   - fremder Vorgang (anderer Betrieb im selben Raum) → 404 ohne Auskunft
   - fremde Herkunft (Origin) → 403 vor jeder Arbeit
   Die Rumpfgrenze je Weg steht in import-rumpfgrenze.test.js.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const RAUM = "imp3-sonden";
let wurzel, laden, imp, B, V, sitzungAnlegen;
const tokens = {};
let nr = 0;

const kopf = (token, extra = {}) => {
  nr += 1;
  return { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.77.${Math.floor(nr / 250) % 250}.${nr % 250}`,
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
};
const csv = Buffer.from("Personalnummer;Nachname;Vorname\n7001;Sonde;Sabine\n", "utf8");

/** Ruft einen der fünf Wege auf; `herkunft: false` schickt eine fremde Origin. */
async function aufruf(weg, { token, vorgang, herkunft = true } = {}) {
  const url = `http://${WIRT}${weg}`;
  const h = kopf(token, { "content-type": weg === UPLOAD ? "application/octet-stream" : "application/json" });
  if (!herkunft) h.origin = "https://fremd.example";
  const a = await imp(new Request(url, { method: "POST", headers: h,
    body: weg === UPLOAD ? csv : JSON.stringify({ vorgang: vorgang || "x", bestaetigung: "x" }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const UPLOAD = "/api/import/upload";
const WEGE = [UPLOAD, "/api/import/analyse", "/api/import/vorschau", "/api/import/uebernahme", "/api/import/verwerfen"];

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-imp3-sonden-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  imp = (await import("../server/funktionen/import.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  V = await import("../server/lib/import/vorgaenge.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  const person = (id, rolle) => ({ id, vorname: id, nachname: "P", rolle, bereich: "ALLE", status: "aktiv", email: "",
    funktion: "Fachkraft", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30, qualifikationen: [],
    zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "ALLE" }] });
  const betrieb = (id, personen) => ({ id, name: `Haus ${id}`, status: "aktiv", einheiten: [{ id: `${id}-e1`, name: "WB 1", versatz: 0 }],
    standorte: [], zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] }, dienstarten: [], qualifikationen: [],
    einstellungen: { ruhezeit: 11, maxFolge: 6 }, personen, abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {},
    anfragen: [], nachrichten: [], bestaetigungen: [] });
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [betrieb("m1", [person("l1", "leitung")]),
    betrieb("m2", [person("l2", "leitung")])] }, { durch: "Prüfung" });
  const sitz = async (k, rolle, p, betriebIdx, mandantId) => {
    tokens[k] = (await sitzungAnlegen({ bestand: RAUM, name: k, rolle, person: p, betrieb: betriebIdx, mandantId }, 600000)).token;
  };
  await sitz("leitung", "leitung", "l1", 0, "m1");
  await sitz("fremd", "leitung", "l2", 1, "m2");
  await sitz("kunde", "kunde", null, 0, "m1");
  tokens.betreiber = (await sitzungAnlegen({ bestand: RAUM, name: "Betreiber", rolle: "betreiber", person: null, betrieb: 0 }, 600000)).token;
}, 120000);

afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("IMP-3 Sonden: /api/import (alle fünf Wege)", () => {
  it("ohne Sitzung 401, kein Vorgang", async () => {
    for (const weg of WEGE) expect((await aufruf(weg)).status, weg).toBe(401);
    expect(V._anzahl()).toBe(0);
  });

  it("Kundenrolle und Betreiber → 403 KEINE_BERECHTIGUNG; nichts geparst, kein Vorgang, Bestand unverändert", async () => {
    const vorher = (await B.bestandLesen(laden(), RAUM)).stand;
    for (const k of ["kunde", "betreiber"]) {
      for (const weg of WEGE) {
        const r = await aufruf(weg, { token: tokens[k] });
        expect(r.status, `${k} ${weg}`).toBe(403);
        expect(r.code, `${k} ${weg}`).toBe("KEINE_BERECHTIGUNG");
        expect(r.vorgang, `${k} ${weg}`).toBeUndefined();
      }
    }
    expect(V._anzahl()).toBe(0);
    expect((await B.bestandLesen(laden(), RAUM)).stand).toBe(vorher);
  });

  it("fremder Vorgang (anderer Betrieb, gleicher Raum): analyse, vorschau, uebernahme, verwerfen → 404 NICHT_GEFUNDEN", async () => {
    const up = await aufruf(UPLOAD, { token: tokens.leitung });
    expect(up.status).toBe(201);
    for (const weg of WEGE.slice(1)) {
      const r = await aufruf(weg, { token: tokens.fremd, vorgang: up.vorgang });
      expect(r.status, weg).toBe(404);
      expect(r.code, weg).toBe("NICHT_GEFUNDEN");
    }
    /* Der Vorgang des Eigentümers ist unberührt: verwerfen durch den Fremden hat ihn nicht gelöscht. */
    expect((await aufruf("/api/import/analyse", { token: tokens.leitung, vorgang: up.vorgang })).status).toBe(200);
    expect((await aufruf("/api/import/verwerfen", { token: tokens.leitung, vorgang: up.vorgang })).status).toBe(200);
  });

  it("fremde Herkunft → 403, auch mit gültiger Sitzung; kein Vorgang entsteht", async () => {
    V._zuruecksetzen();
    for (const weg of WEGE) expect((await aufruf(weg, { token: tokens.leitung, herkunft: false })).status, weg).toBe(403);
    expect(V._anzahl()).toBe(0);
  });
});
