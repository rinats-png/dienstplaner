/* ==========================================================================
   Auflage C aus dem Datenreview PR #130 — Personalnummer serverseitig eindeutig

   Bisher prüfte nur die Oberfläche gegen ihren lokalen Stand. Jetzt weist
   PUT /api/bestand eine Personalnummer ab, die eine ANDERE Person desselben
   Betriebs schon trägt (trim, Groß-/Kleinschreibung egal): 409, nichts
   gespeichert. Nur NEUE Doppelungen: Bestehende bleiben unverändert (keine
   automatische Bereinigung), die eigene unveränderte Nummer ist kein Konflikt,
   andere Betriebe zählen nicht.
   Aufruf: npx vitest run pruefungen/bestand-personalnummer.test.js --testTimeout=60000
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000", RAUM = "pnreindeutig", ADMIN = "pnr-verwaltung-0123456789";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.47.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text(); let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const person = (id, rolle, personalnummer) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], ...(personalnummer !== undefined ? { personalnummer } : {}) });
const betrieb = (id, personen) => ({ id, name: id, status: "aktiv", tarif: "pro",
  einheiten: [{ id: "e1" }], standorte: [], dienstarten: [{ id: "F", name: "F" }], personen,
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], dienstbuch: [], abwesenheiten: [] });
/* Betrieb m-e: el (Leitung, P-100), em (P-200), Altbestand-Doppelung d1/d2 (beide „X-7“).
   Betrieb m-f (fremd): pf mit „P-300“. */
const bestand = () => ({ version: 9, stand: 1, session: null, mandanten: [
  betrieb("m-e", [person("el", "leitung", "P-100"), person("em", "mitarbeiter", "P-200"),
    person("d1", "mitarbeiter", "X-7"), person("d2", "mitarbeiter", "x-7 ")]),
  betrieb("m-f", [person("pf", "mitarbeiter", "P-300")]) ] });
const sitzung = async (code) => {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: "Test leitung", bestand: RAUM, rolle: "leitung", person: "el",
    betrieb: 0, mandantId: "m-e", angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage("/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, a.roh).toBeTruthy(); return a.token;
};
const lesen = async (t) => anfrage("/api/bestand", { methode: "GET", token: t });
const eigener = (b) => b.mandanten.find((x) => x.id === "m-e");
const kopie = (x) => JSON.parse(JSON.stringify(x));
const gespeichert = async () => (await B.bestandLesenStreng(laden(), RAUM)).bestand;

let T;
beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-pnr-eindeutig-"));
  Object.assign(process.env, { CENTRIC_DATEN: wurzel, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: "pfeffer-nur-zum-pruefen-0123456789", CENTRIC_ADMIN: ADMIN });
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Pruefung" });
  T = await sitzung("PNR-LEIT-0001");
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("Auflage C: Personalnummer serverseitig eindeutig (PUT /api/bestand)", () => {
  it("C1 zweite Person mit gleicher Nummer (trim, Groß-/Kleinschreibung egal) -> 409, nichts gespeichert", async () => {
    for (const nummer of ["P-200", " p-200 "]) {
      const g = await lesen(T);
      expect(g.status, g.roh).toBe(200);
      const b = kopie(g.bestand);
      eigener(b).personen.push(person("neu1", "mitarbeiter", nummer));
      const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: b, etag: g.etag } });
      expect(w.status, w.roh).toBe(409);
      expect(w.code).toBe("PERSONALNUMMER_DOPPELT");
      expect(w.text).toMatch(/Personalnummer/);
      expect(w.text).toMatch(/nichts geändert/);
      expect(w.etag).toBe(g.etag);                                  // kein Versionskonflikt: ETag bleibt nutzbar
      const s = await gespeichert();
      expect(eigener(s).personen.some((p) => p.id === "neu1")).toBe(false);
      expect((await lesen(T)).etag).toBe(g.etag);
    }
  });
  it("C1b Änderung einer vorhandenen Person auf eine fremde Nummer -> 409, alte Nummer bleibt", async () => {
    const g = await lesen(T);
    const b = kopie(g.bestand);
    eigener(b).personen.find((p) => p.id === "em").personalnummer = "P-100";
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, w.roh).toBe(409);
    expect(w.code).toBe("PERSONALNUMMER_DOPPELT");
    expect(eigener(await gespeichert()).personen.find((p) => p.id === "em").personalnummer).toBe("P-200");
  });
  it("C2 gleiche Person speichert ihre Nummer unverändert (andere Angabe geändert) -> 200", async () => {
    const g = await lesen(T);
    const b = kopie(g.bestand);
    eigener(b).personen.find((p) => p.id === "em").nachname = "Geaendert";
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, w.roh).toBe(200);
    const em = eigener(await gespeichert()).personen.find((p) => p.id === "em");
    expect(em.nachname).toBe("Geaendert");
    expect(em.personalnummer).toBe("P-200");
  });
  it("C3 Nummer eines anderen Betriebs darf im eigenen Betrieb vergeben werden -> 200", async () => {
    const g = await lesen(T);
    const b = kopie(g.bestand);
    eigener(b).personen.push(person("neu3", "mitarbeiter", "P-300"));
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, w.roh).toBe(200);
    const s = await gespeichert();
    expect(eigener(s).personen.find((p) => p.id === "neu3").personalnummer).toBe("P-300");
    expect(s.mandanten.find((x) => x.id === "m-f").personen[0].personalnummer).toBe("P-300");
  });
  it("C4 bestehende Doppelung blockiert das Speichern einer anderen Person nicht und bleibt unverändert", async () => {
    const g = await lesen(T);
    const b = kopie(g.bestand);
    eigener(b).personen.find((p) => p.id === "em").vorname = "Neu";
    eigener(b).personen.push(person("neu4", "mitarbeiter", "P-400"));
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, w.roh).toBe(200);
    const s = eigener(await gespeichert());
    expect(s.personen.find((p) => p.id === "d1").personalnummer).toBe("X-7");
    expect(s.personen.find((p) => p.id === "d2").personalnummer).toBe("x-7 ");
    expect(s.personen.find((p) => p.id === "neu4").personalnummer).toBe("P-400");
  });
  it("C4b eine dritte Person mit der bereits doppelten Nummer ist eine NEUE Doppelung -> 409", async () => {
    const g = await lesen(T);
    const b = kopie(g.bestand);
    eigener(b).personen.push(person("neu5", "mitarbeiter", "X-7"));
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, w.roh).toBe(409);
    expect(w.code).toBe("PERSONALNUMMER_DOPPELT");
  });
  it("C5 Personen ohne Personalnummer (leer/fehlend) sind nie ein Konflikt", async () => {
    const g = await lesen(T);
    const b = kopie(g.bestand);
    eigener(b).personen.push(person("ohne1", "mitarbeiter", ""), person("ohne2", "mitarbeiter", "  "), person("ohne3", "mitarbeiter"));
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: b, etag: g.etag } });
    expect(w.status, w.roh).toBe(200);
  });
});

describe("Auflage C: reine Prüffunktion", () => {
  it("C6 personalnummerKonflikt: nur neue Doppelungen innerhalb eines Betriebs", async () => {
    const { personalnummerKonflikt } = await import("../server/lib/personalnummer.mjs");
    const alt = bestand();
    expect(personalnummerKonflikt(alt, kopie(alt))).toBeNull();
    const neu = kopie(alt); eigener(neu).personen.push(person("n", "mitarbeiter", "p-100"));
    expect(personalnummerKonflikt(alt, neu)).toMatchObject({ mandantId: "m-e", personId: "n" });
    expect(personalnummerKonflikt(null, alt)).toMatchObject({ mandantId: "m-e" });       // Erstanlage mit Doppelung
  });
});
