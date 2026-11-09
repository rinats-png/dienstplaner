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
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
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

/* Review d6c92e0, Befund 1 (hoch): Die Doppelungs-Absage (409 PERSONALNUMMER_DOPPELT) brachte den AKTUELLEN Stand
   als ETag mit, aber keinen Bestand — und der Client übernahm ihn. Ein veralteter Client A korrigierte danach die
   Nummer, speicherte mit dem geschenkten ETag (200) und überschrieb die zwischenzeitliche Änderung von B.
   Erwartet: A läuft in den gewöhnlichen Konflikt, B's Änderung bleibt. R1: echter Client (src/speicher.js) gegen
   den echten Handler (fetch wird auf daten() umgeleitet); R2/R3: Handler allein. */
const speicherAttrappe = (vorab = {}) => { const m = new Map(Object.entries(vorab)); return { getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
const clientMit = async (token) => {
  vi.resetModules();
  vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": token }));
  vi.stubGlobal("localStorage", speicherAttrappe());
  const puts = [];
  vi.stubGlobal("fetch", async (url, opt = {}) => {
    nr += 1;
    const kopf = { ...(opt.headers || {}), host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.48.${Math.floor(nr / 250)}.${nr % 250}` };
    if ((opt.method || "GET") === "PUT") puts.push(JSON.parse(opt.body));
    return daten(new Request(`http://${WIRT}${url}`, { method: opt.method || "GET", headers: kopf,
      ...(opt.body ? { body: opt.body } : {}) }), {});
  });
  const SP = await import("../src/speicher.js");
  return { SP, puts };
};

describe("Review d6c92e0 Befund 1: die Doppelungs-Absage verschenkt keinen neueren ETag", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("R1 veralteter Client A: Doppelung -> Absage, Nummer korrigiert -> Konflikt; B's Änderung bleibt (Client + Handler)", async () => {
    const TB = await sitzung("PNR-LEIT-0002");
    const { SP, puts } = await clientMit(T);
    const a = await SP.lies();                                      // A liest Stand n
    const etagA = (await lesen(T)).etag;
    /* B speichert dazwischen (Stand n+1): em.vorname = "VonB". */
    const gB = await lesen(TB);
    const bB = kopie(gB.bestand);
    eigener(bB).personen.find((p) => p.id === "em").vorname = "VonB";
    const wB = await anfrage("/api/bestand", { methode: "PUT", token: TB, rumpf: { bestand: bB, etag: gB.etag } });
    expect(wB.status, wB.roh).toBe(200);
    /* A schickt eine doppelte Nummer (auf seinem veralteten Stand). */
    const bA = kopie(a.bestand);
    eigener(bA).personen.push(person("neu6", "mitarbeiter", "P-100"));
    const fehler1 = [], konflikt1 = [];
    await SP.schreib(bA, { sofort: true, onFehler: (l) => fehler1.push(l), onKonflikt: (d) => konflikt1.push(d) });
    expect(konflikt1).toEqual([]);
    expect(fehler1).toHaveLength(1);
    expect(fehler1[0].fehler && fehler1[0].fehler.code).toBe("PERSONALNUMMER_DOPPELT");
    expect(puts[0].etag).toBe(etagA);
    /* A korrigiert die Nummer und speichert erneut. */
    const bA2 = kopie(bA);
    eigener(bA2).personen.find((p) => p.id === "neu6").personalnummer = "P-600";
    const fehler2 = [], konflikt2 = [], gespeichert2 = [];
    await SP.schreib(bA2, { sofort: true, onFehler: (l) => fehler2.push(l), onKonflikt: (d) => konflikt2.push(d),
      onGespeichert: (x) => gespeichert2.push(x) });
    expect(puts[1].etag, "der ETag des Clients bleibt der erwartete Stand").toBe(etagA);
    expect(gespeichert2).toEqual([]);
    expect(konflikt2).toHaveLength(1);
    expect(konflikt2[0].text).toBe("Jemand anderes hat inzwischen die Stammdaten geändert.");
    const s = eigener(await gespeichert());
    expect(s.personen.find((p) => p.id === "em").vorname).toBe("VonB");
    expect(s.personen.some((p) => p.id === "neu6")).toBe(false);
  });

  it("R2 Handler: Doppelungs-Absage auf veraltetem ETag nennt den geschickten ETag, nicht den aktuellen Stand", async () => {
    const g = await lesen(T);
    const alt = String(Number(g.etag) - 1);
    const b = kopie(g.bestand);
    eigener(b).personen.push(person("neu7", "mitarbeiter", "P-100"));
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: b, etag: alt } });
    expect(w.status, w.roh).toBe(409);
    expect(w.code).toBe("PERSONALNUMMER_DOPPELT");
    expect(String(w.etag)).toBe(alt);
    expect(w.bestand).toBeUndefined();
  });

  it("R3 Handler: korrigierte Nummer auf veraltetem ETag -> gewöhnlicher Konflikt (Stammdaten), nichts überschrieben", async () => {
    const g = await lesen(T);
    const alt = String(Number(g.etag) - 1);
    const b = kopie(g.bestand);
    eigener(b).personen.find((p) => p.id === "em").vorname = "VonA";
    eigener(b).personen.push(person("neu8", "mitarbeiter", "P-800"));
    const w = await anfrage("/api/bestand", { methode: "PUT", token: T, rumpf: { bestand: b, etag: alt } });
    expect(w.status, w.roh).toBe(409);
    expect(w.code).toBeUndefined();
    expect(w.text).toBe("Jemand anderes hat inzwischen die Stammdaten geändert.");
    expect(w.etag).toBe(g.etag);
    const s = eigener(await gespeichert());
    expect(s.personen.find((p) => p.id === "em").vorname).toBe(eigener(g.bestand).personen.find((p) => p.id === "em").vorname);
    expect(s.personen.some((p) => p.id === "neu8")).toBe(false);
  });
});
