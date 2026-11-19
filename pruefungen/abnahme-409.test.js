/* ==========================================================================
   ABNAHME 409-PFAD (WP-12, Befund B-2) — nach einem Konflikt unverändert zurück

   PUT /api/bestand antwortet bei einem echten Konflikt (derselbe Monat wurde
   inzwischen von jemand anderem geändert) mit 409 und liefert den aktuellen
   Stand in der Sicht der Rolle samt neuer Stand-Nummer, damit die Oberfläche
   ihn übernehmen und die eigene Änderung erneut anbringen kann.

   Geprüft wird, was die Oberfläche dann tut: die Antwort des 409 unverändert
   mit der neuen Stand-Nummer zurückschicken. Das muss für jede schreibende
   Rolle 200 ergeben — auch wenn der Altbestand Personen ohne
   `qualifikationen` trägt (GET gleicht an; ohne gleiche Form im 409 galt das
   Zurückschicken als Änderung fremder Personen, und die Schichtverantwortung
   bekam 403).

   Aufruf: npx vitest run pruefungen/abnahme-409.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, sitzungAnlegen, Z;
let raumNr = 0, RAUM = "";
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.13.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });   // bewusst ohne qualifikationen

const ROLLEN = {
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  PL: { rolle: "planer", person: "p1" },
  LT: { rolle: "leitung", person: "l1" },
  MA: { rolle: "mitarbeiter", person: "m0" },
};
const TOKEN = {};
let TAG1, TAG2;

const bestand = () => ({ version: 9, mandanten: [{
  id: "m1", name: "Haus", status: "aktiv", einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 },
  personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
    person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
}] });

async function neuerRaum() {
  RAUM = `abnahme-409-${++raumNr}`;
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Abnahme" });
  for (const [k, r] of Object.entries(ROLLEN)) {
    TOKEN[k] = (await sitzungAnlegen({ bestand: RAUM, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
  }
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-abnahme-409-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  Z = await import("../server/lib/zeiterfassung.mjs");
  /* Zwei Tage im selben, noch nicht begonnenen Monat — eine Monatsscherbe, also ein echter Konflikt. */
  const monat = Z.tagePlus(Z.heuteBerlin(), 45).slice(0, 8);
  TAG1 = `${monat}10`; TAG2 = `${monat}11`;
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("409 und unverändert zurück", { timeout: 120000 }, () => {
  for (const k of ["SV", "PL", "LT"]) {
    it(`${k}: Konflikt im selben Monat → 409 mit Stand; die Antwort unverändert zurück → 200, nichts verloren`, async () => {
      await neuerRaum();
      /* Beide lesen denselben Stand … */
      const meins = await anfrage("/api/bestand", { token: TOKEN[k] });
      const fremd = await anfrage("/api/bestand", { token: TOKEN[k === "PL" ? "LT" : "PL"] });
      expect(meins.status).toBe(200);
      /* … die andere Rolle speichert zuerst (in e1, also im Bereich der Schichtverantwortung) … */
      const f = kopie(fremd.bestand);
      f.mandanten[0].abweichungen[`m0|${TAG2}`] = "F";
      expect((await anfrage("/api/bestand", { methode: "PUT", token: TOKEN[k === "PL" ? "LT" : "PL"],
        rumpf: { bestand: f, etag: fremd.etag } })).status).toBe(200);
      /* … und meine Änderung am selben Monat mit dem alten Stand läuft in den Konflikt. */
      const m = kopie(meins.bestand);
      m.mandanten[0].abweichungen[`a1|${TAG1}`] = "F";
      const konflikt = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN[k], rumpf: { bestand: m, etag: meins.etag } });
      expect(konflikt.status, JSON.stringify(konflikt).slice(0, 300)).toBe(409);
      expect(konflikt.bestand, "der 409 liefert den aktuellen Stand der Rolle").toBeTruthy();
      expect(konflikt.etag).not.toBe(meins.etag);
      /* Dieselbe Form wie GET: Personen mit qualifikationen-Liste. */
      const nachGet = await anfrage("/api/bestand", { token: TOKEN[k] });
      expect(konflikt.bestand, "409-Stand = GET-Stand").toEqual(nachGet.bestand);
      /* Die Oberfläche schickt den Stand unverändert mit der neuen Nummer zurück. */
      const zurueck = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN[k],
        rumpf: { bestand: konflikt.bestand, etag: konflikt.etag } });
      expect(zurueck.status, `${k}: ${JSON.stringify(zurueck).slice(0, 300)}`).toBe(200);
      /* Nichts verloren: die fremde Änderung steht noch. */
      const jetzt = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
      expect(jetzt.abweichungen[`m0|${TAG2}`]).toBe("F");
      expect(jetzt.abweichungen[`a1|${TAG1}`]).toBeUndefined();
    });
  }
  it("Schichtverantwortung: veralteter Stand, fremder Bereich hat inzwischen geplant — nichts geht verloren (Befund B-4)", async () => {
    /* Die Schichtverantwortung sieht den Plan anderer Bereiche (lesend). Hat dort jemand inzwischen
       geplant, fehlt der Eintrag in ihrem veralteten Stand und sieht für die Zusammenführung wie ein
       Löschen aus. Sicher ist das (nichts wird überschrieben); die Antwort ist heute 403 „gehört nicht
       zu deinem Bereich“ statt 409 „neu laden“. Geprüft wird nur das Sichere; der Statuscode steht im
       Nachweis als Befund B-4. */
    await neuerRaum();
    const meins = await anfrage("/api/bestand", { token: TOKEN.SV });
    const fremd = await anfrage("/api/bestand", { token: TOKEN.PL });
    const f = kopie(fremd.bestand);
    f.mandanten[0].abweichungen[`b1|${TAG2}`] = "F";
    expect((await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.PL, rumpf: { bestand: f, etag: fremd.etag } })).status).toBe(200);
    const m = kopie(meins.bestand);
    m.mandanten[0].abweichungen[`a1|${TAG1}`] = "F";
    const r = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.SV, rumpf: { bestand: m, etag: meins.etag } });
    expect([403, 409], JSON.stringify(r).slice(0, 200)).toContain(r.status);
    const jetzt = (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
    expect(jetzt.abweichungen[`b1|${TAG2}`]).toBe("F");
    expect(jetzt.abweichungen[`a1|${TAG1}`]).toBeUndefined();
    /* Nach Neuladen klappt es. */
    const neu = await anfrage("/api/bestand", { token: TOKEN.SV });
    const n2 = kopie(neu.bestand);
    n2.mandanten[0].abweichungen[`a1|${TAG1}`] = "F";
    expect((await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.SV, rumpf: { bestand: n2, etag: neu.etag } })).status).toBe(200);
  });
  it("MA: Schreiben bleibt abgewiesen (403), kein Konfliktpfad", async () => {
    await neuerRaum();
    const g = await anfrage("/api/bestand", { token: TOKEN.MA });
    const r = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.MA, rumpf: { bestand: kopie(g.bestand), etag: g.etag } });
    expect([200, 403]).toContain(r.status);
  });
});
