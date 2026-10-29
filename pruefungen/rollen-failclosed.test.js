/* ==========================================================================
   UNBEKANNTE ROLLEN: FAIL-CLOSED (Commit D1d)

   Bis D1d fiel bestandFuerRolle für eine Rolle ohne eigene Sicht auf eine
   Kopie des Bestands mit dem eigenen Betrieb im Rohzustand durch — alle
   Personalakten, Notizen, Kalendergeheimnisse. Erreichbar war das über
   /einrichten, das jede Rollenbezeichnung annahm.

   Jetzt: bekannte Rolle — ausdrückliche Sicht, unverändert. Unbekannte
   Rolle — kein Bestand; jeder Endpunkt außer Abmelden antwortet 403.
   /einrichten nimmt nur Rollen an, die es gibt.

   Wie bisher gilt für ein Konto mit gebundener Person die Rolle dieser
   Person im Betrieb (wirksameRolle). Ein Altkonto „gast" für eine
   beschäftigte Person sieht damit genau, was diese Person sieht — eine
   ausdrückliche Sicht, keine Rohkopie.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren, rolleBekannt, BEKANNTE_ROLLEN } from "../server/lib/rechte.mjs";

const MARKER = ["MK-ROH-IBAN", "MK-ROH-NOTIZ", "MK-ROH-KALENDER", "MK-ROH-UNBEKANNT"];
const funde = (x) => MARKER.filter((m) => (typeof x === "string" ? x : JSON.stringify(x ?? null)).includes(m));
const person = (id, rolle, einheit = "e1", extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const bestand = () => ({ version: 9, stand: 1, session: null, mandanten: [{
  id: "m-a", name: "A", status: "aktiv", tarif: "pro", einheiten: [{ id: "e1" }], standorte: [], dienstarten: [{ id: "F", name: "F" }],
  personen: [person("al", "leitung", "ALLE"), person("ap", "planer", "ALLE"), person("as", "subplaner"),
    person("am", "mitarbeiter", "e1", { iban: "MK-ROH-IBAN", kalenderGeheim: "MK-ROH-KALENDER" }), person("ar", "betriebsrat", "ALLE")],
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], dienstbuch: [],
  abwesenheiten: [{ id: "ab", personId: "am", art: "krank", von: "2026-12-01", bis: "2026-12-01", notiz: "MK-ROH-NOTIZ" }],
  unbekanntImBetrieb: "MK-ROH-UNBEKANNT" }] });

const UNBEKANNT = ["gast", "irgendwas", "", "Leitung", "LEITUNG", " leitung", "toString", "__proto__", "constructor", 0, false, {}, []];
const sitz = (rolle) => ({ rolle, person: "am", betrieb: 0, mandantId: "m-a" });

describe("rolleBekannt", () => {
  it("genau die Rangliste und kunde; ohne Rolle gilt kunde", () => {
    expect([...BEKANNTE_ROLLEN].sort()).toEqual(["betreiber", "betriebsrat", "kunde", "leitung", "mitarbeiter", "planer", "subplaner"]);
    for (const r of BEKANNTE_ROLLEN) expect(rolleBekannt(r), r).toBe(true);
    expect(rolleBekannt(undefined)).toBe(true);
    expect(rolleBekannt(null)).toBe(true);
    for (const r of UNBEKANNT) expect(rolleBekannt(r), JSON.stringify(r)).toBe(false);
  });
});

describe("bestandFuerRolle", () => {
  it("bekannte Rollen: weiterhin eine Sicht mit dem eigenen Betrieb", () => {
    for (const r of [...BEKANNTE_ROLLEN, undefined]) {
      const aus = bestandFuerRolle(bestand(), { ...sitz(r), ...(r === "betreiber" ? { person: null, mandantId: undefined } : {}) });
      expect(aus, String(r)).toBeTruthy();
      expect(Array.isArray(aus.mandanten) && aus.mandanten.length, String(r)).toBe(1);
    }
  });
  it("unbekannte Rollen: kein Bestand, kein Rückfall auf die Rohkopie", () => {
    for (const r of UNBEKANNT) {
      const aus = bestandFuerRolle(bestand(), sitz(r));
      expect(aus, JSON.stringify(r)).toBeNull();
      expect(funde(aus)).toEqual([]);
    }
  });
  it("Gegenstück: die Rohdaten liegen im Fixture wirklich (Leitung sieht die Notiz)", () => {
    expect(funde(bestandFuerRolle(bestand(), sitz("leitung")))).toContain("MK-ROH-NOTIZ");
  });
  it("unbekannte Rollen schreiben nicht", () => {
    for (const r of UNBEKANNT) expect(zusammenfuehren(bestand(), bestand(), sitz(r)), JSON.stringify(r)).toBeNull();
  });
});

/* ---------- über die echten Handler ---------- */

const WIRT = "127.0.0.1:3000";
const RAUM = "rollen";
const ADMIN = "rollen-verwaltung-0123456789";
let wurzel, laden, daten, einrichten, kontoSchreiben, alleKonten, ablageSchluessel, B;
let nr = 0;
const anfrage = async (handler, pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.12.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await handler(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
async function sitzung(code, rolle, person) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `Test ${String(rolle)}`, bestand: RAUM, rolle, person,
    betrieb: 0, mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage(daten, "/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, a.roh).toBeTruthy();
  return a.token;
}

const T = {};
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-rollen-failclosed-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_ADMIN = ADMIN;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  einrichten = (await import("../server/funktionen/einrichten.mjs")).default;
  ({ kontoSchreiben, alleKonten } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
  /* Altkonten mit erfundener Rolle — so, wie /einrichten sie bis D1d anlegte. */
  T.gast = await sitzung("ROL1-GAST-0001", "gast", null);
  T.irgendwas = await sitzung("ROL2-IRGW-0002", "irgendwas", null);
  T.gross = await sitzung("ROL3-GROS-0003", "Leitung", "gibt-es-nicht");
  T.gastMitPerson = await sitzung("ROL6-GAPE-0006", "gast", "am");
  T.leitung = await sitzung("ROL4-LEIT-0004", "leitung", "al");
  T.mitarbeiter = await sitzung("ROL5-MITA-0005", "mitarbeiter", "am");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Sitzung mit unbekannter Rolle", () => {
  for (const name of ["gast", "irgendwas", "gross"]) {
    it(`${name}: GET 403 ohne Bestand, PUT, Vollausgabe, Sicherung, Stempeln 403 — Abmelden geht`, async () => {
      const g = await anfrage(daten, "/api/bestand", { methode: "GET", token: T[name] });
      expect(g.status, g.roh).toBe(403);
      expect(g.bestand).toBeUndefined();
      expect(funde(g.roh)).toEqual([]);
      expect(g.roh).not.toContain("Val");
      const l = await anfrage(daten, "/api/bestand", { methode: "GET", token: T.leitung });
      for (const [pfad, methode, rumpf] of [["/api/bestand", "PUT", { bestand: l.bestand, etag: l.etag }],
        ["/api/vollausgabe", "GET"], ["/api/sicherung", "POST", {}], ["/api/sicherungen", "GET"],
        ["/api/stempeln", "POST", { art: "start" }], ["/api/zeit-bestaetigen", "POST", {}]]) {
        const x = await anfrage(daten, pfad, { methode, token: T[name], rumpf });
        expect(x.status, `${methode} ${pfad} ${x.roh}`).toBe(403);
        expect(funde(x.roh)).toEqual([]);
      }
      expect((await anfrage(daten, "/api/abmelden", { token: T[name] })).status).toBe(200);
      expect((await anfrage(daten, "/api/bestand", { methode: "GET", token: T[name] })).status).toBe(401);
    });
  }
  it("unbekannte Kontorolle mit gebundener Person: die Sicht dieser Person, nicht mehr", async () => {
    const g = await anfrage(daten, "/api/bestand", { methode: "GET", token: T.gastMitPerson });
    const m = await anfrage(daten, "/api/bestand", { methode: "GET", token: T.mitarbeiter });
    expect(g.status).toBe(200);
    expect(g.rolle).toBe("mitarbeiter");
    expect(JSON.stringify(g.bestand)).toBe(JSON.stringify(m.bestand));
    expect(funde(g.roh)).not.toContain("MK-ROH-UNBEKANNT");
    expect(funde(g.roh)).not.toContain("MK-ROH-IBAN");
  });
  it("bekannte Rollen unverändert: GET 200 mit Sicht", async () => {
    const l = await anfrage(daten, "/api/bestand", { methode: "GET", token: T.leitung });
    expect(l.status).toBe(200);
    expect(funde(l.roh)).toContain("MK-ROH-NOTIZ");
    const m = await anfrage(daten, "/api/bestand", { methode: "GET", token: T.mitarbeiter });
    expect(m.status).toBe(200);
    expect(m.bestand.mandanten).toHaveLength(1);
  });
});

describe("/einrichten", () => {
  const anlegen = (rolle, extra = {}) => anfrage(einrichten, "/einrichten", { rumpf: { verwaltung: ADMIN, name: `Neu ${String(rolle)}`,
    bestand: RAUM, betrieb: 0, person: "am", ...(rolle === undefined ? {} : { rolle }), ...extra } });
  it("unbekannte Rolle: 400, kein Konto angelegt", async () => {
    const vorher = Object.keys(await alleKonten(laden())).length;
    for (const r of ["gast", "irgendwas", "Leitung", "", "toString", 5, { x: 1 }]) {
      const a = await anlegen(r);
      expect(a.status, `${JSON.stringify(r)} ${a.roh}`).toBe(400);
      expect(a.zugangscode).toBeUndefined();
    }
    expect(Object.keys(await alleKonten(laden())).length).toBe(vorher);
  });
  it("bekannte Rolle und fehlende Angabe (kunde): angelegt wie bisher", async () => {
    for (const r of ["mitarbeiter", "leitung", "betriebsrat", undefined]) {
      const a = await anlegen(r, r === "mitarbeiter" ? {} : { person: r === "leitung" ? "al" : "ar" });
      expect(a.status, `${String(r)} ${a.roh}`).toBe(200);
      expect(a.zugangscode).toBeTruthy();
    }
  });
});
