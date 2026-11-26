/* ==========================================================================
   WP-I16 — Betriebssteuerung über den ECHTEN Handler (PUT /api/bestand)

   Die gelesene Sicht jeder Rolle wird mit einer Änderung zurückgeschickt, wie es die Oberfläche tut:
   - Leitung schaltet; Planung, Beschäftigte, Schichtverantwortung nie
   - Betriebsrat SETZT die Pause (Variante A) — und sonst nichts; nur hinter CENTRIC_KI_BR_PAUSE=true (Vorgabe aus: 403)
   - die Leitung hebt die Pause auf (mit dem Stempel der gesehenen Pause), setzt sie nie; Betriebsrat hebt nie auf
   - Rollenvergabe: bei aktiver Pause lassen sich Betriebsrat-Konten nicht ändern (403); Protokoll nennt jede Änderung
   - keine neue Route (nur PUT /api/bestand)
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const RAUM = "wpi16raum";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, nr = 0;
const T = {};
const AN = { prozess: "an" };
const SCHALTER = "CENTRIC_KI_BR_PAUSE";

const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.16.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const lies = (t) => anfrage("/api/bestand", { methode: "GET", token: t });
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const person = (id, rolle) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: "e1", status: "aktiv",
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const ROLLEN = [["l1", "leitung"], ["p1", "planer"], ["s1", "subplaner"], ["a1", "mitarbeiter"], ["r1", "betriebsrat"]];

/** Liest die Sicht der Rolle, ändert den Betrieb darin und schickt sie zurück. */
async function schreibe(id, aendere) {
  const r = await lies(T[id]);
  expect(r.status, `${id} lesen`).toBe(200);
  const b = JSON.parse(JSON.stringify(r.bestand));
  aendere(b.mandanten[0]);
  return anfrage("/api/bestand", { methode: "PUT", token: T[id], rumpf: { bestand: b, etag: r.etag, durch: "Test" } });
}
const ki = (m) => (m.einstellungen || {}).kiSteuerung;
const setze = (k) => (m) => { m.einstellungen = { ...(m.einstellungen || {}), kiSteuerung: k }; };

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wpi16-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env[SCHALTER] = "true";
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m-a", name: "A", status: "aktiv", einstellungen: {},
    einheiten: [{ id: "e1" }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }],
    personen: ROLLEN.map(([id, rolle]) => person(id, rolle)),
    abweichungen: {}, einstempeln: {}, erfassung: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  }] }, { durch: "Pruefung" });
  let c = 0;
  for (const [id, rolle] of ROLLEN) {
    c += 1;
    const code = `WPI${c}-AAAA-${String(c).padStart(4, "0")}`;
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: id, bestand: RAUM, rolle, person: id, betrieb: 0, mandantId: "m-a",
      angelegt: "2026-01-01T00:00:00.000Z" });
    T[id] = (await anfrage("/api/anmelden", { rumpf: { zugangscode: code } })).token;
    expect(T[id], id).toBeTruthy();
  }
}, 120000);
afterAll(async () => { delete process.env[SCHALTER]; await rm(wurzel, { recursive: true, force: true }); });

describe("PUT /api/bestand: Steuerung je Rolle", () => {
  it("Planung, Schichtverantwortung, Beschäftigte, Betriebsrat: Hauptschalter, Funktion und Frage kommen nicht an", async () => {
    for (const id of ["p1", "s1", "a1", "r1"]) {
      for (const absicht of [{ betriebsratFrage: { antwort: "nein" } }, { funktionen: { F3: { an: true } } }, { betrieb: { an: true } }]) {
        await schreibe(id, setze(absicht));
        expect(ki(await gespeichert()), `${id} ${JSON.stringify(absicht)}`).toBeUndefined();
      }
    }
  });
  it("Leitung beantwortet die Frage, schaltet Hauptschalter und F3 ein; Stand und Protokoll stehen in der Ablage", async () => {
    const e = await schreibe("l1", setze({ betrieb: { an: true }, funktionen: { F3: { an: true } }, betriebsratFrage: { antwort: "nein" } }));
    expect(e.status, e.roh).toBe(200);
    const k = ki(await gespeichert());
    expect(k.betrieb.an).toBe(true);
    expect(k.funktionen.F3.an).toBe(true);
    expect(k.protokoll.length).toBe(3);
    const m = await gespeichert();
    const { intelligenceErlaubt } = await import("../server/lib/ki-steuerung.mjs");
    expect(intelligenceErlaubt(m, "F3", "leitung", AN)).toBe(true);
    expect(intelligenceErlaubt(m, "F3", "leitung", {})).toBe(false);
  });
  it("Leitung, Planung und Betriebsrat sehen den Stand (Betriebsrat ohne Personenkennung); Schichtverantwortung und Beschäftigte nicht", async () => {
    expect(ki((await lies(T.l1)).bestand.mandanten[0]).betrieb.an).toBe(true);
    expect(ki((await lies(T.p1)).bestand.mandanten[0]).betrieb.an).toBe(true);
    const br = ki((await lies(T.r1)).bestand.mandanten[0]);
    expect(br.betrieb.an).toBe(true);
    expect(JSON.stringify(br)).not.toMatch(/vonPerson|"l1"/);
    for (const id of ["s1", "a1"]) expect(ki((await lies(T[id])).bestand.mandanten[0]), id).toBeUndefined();
  });
  it("Planung ändert den Stand nicht (der gesendete Wert wird ignoriert)", async () => {
    await schreibe("p1", setze({ funktionen: { F3: { an: false } } }));
    expect(ki(await gespeichert()).funktionen.F3.an).toBe(true);
  });
  it("Betriebsrat: ohne Änderung der Pause bleibt es bei 403 (wie bisher)", async () => {
    const e = await schreibe("r1", (m) => { m.name = "Gekapert"; });
    expect(e.status).toBe(403);
    expect((await gespeichert()).name).toBe("A");
  });
  it("Betriebsrat setzt die Pause: sofort wirksam, nichts sonst ändert sich", async () => {
    const vorher = await gespeichert();
    const e = await schreibe("r1", (m) => { setze({ ...ki(m), pause: { aktiv: true } })(m); m.name = "Gekapert"; });
    expect(e.status, e.roh).toBe(200);
    const nachher = await gespeichert();
    expect(ki(nachher).pause).toMatchObject({ aktiv: true, vonRolle: "betriebsrat", vonPerson: "r1" });
    expect(nachher.name).toBe("A");
    expect({ ...nachher, einstellungen: null }).toEqual({ ...vorher, einstellungen: null });
    const { intelligenceErlaubt } = await import("../server/lib/ki-steuerung.mjs");
    for (const r of ["leitung", "planer", "mitarbeiter"]) expect(intelligenceErlaubt(nachher, "F3", r, AN), r).toBe(false);
  });
  it("Leitung setzt eine EIGENE Pause (leitungPause) auch OHNE den Schalter; Aus/An allein stößt keine an; getrennt von der Pause des Betriebsrats", async () => {
    /* erst ein sauberer Zustand: Pause aus, Leitung hebt auf */
    const g = await gespeichert();
    await schreibe("l1", (m) => setze({ ...ki(m), pause: { aktiv: false, am: ki(g).pause.am, nr: ki(g).pause.nr } })(m));
    expect(ki(await gespeichert()).pause.aktiv).toBe(false);
    await schreibe("l1", (m) => setze({ ...ki(m), betrieb: { an: false } })(m));
    expect(ki(await gespeichert()).leitungPause).toBeUndefined();
    await schreibe("l1", (m) => setze({ ...ki(m), betrieb: { an: true } })(m));
    delete process.env[SCHALTER];
    try {
      /* pause (die des Betriebsrats) setzt die Leitung nie */
      await schreibe("l1", (m) => setze({ ...ki(m), pause: { aktiv: true } })(m));
      expect(ki(await gespeichert()).pause.aktiv).toBe(false);
      const e = await schreibe("l1", (m) => setze({ ...ki(m), leitungPause: { aktiv: true } })(m));
      expect(e.status, e.roh).toBe(200);
      const p = ki(await gespeichert()).leitungPause;
      expect(p).toMatchObject({ aktiv: true, vonRolle: "leitung", vonPerson: "l1" });
      expect(ki(await gespeichert()).pause.aktiv).toBe(false);
      const { intelligenceErlaubt } = await import("../server/lib/ki-steuerung.mjs");
      expect(intelligenceErlaubt(await gespeichert(), "F3", "leitung", AN)).toBe(false);
      /* der Betriebsrat hebt sie auch ohne Schalter nicht auf; die Leitung hebt mit am+nr auf */
      const br = await schreibe("r1", (m) => setze({ ...ki(m), leitungPause: { aktiv: false, am: p.am, nr: p.nr } })(m));
      expect(br.status).toBe(403);
      expect(ki(await gespeichert()).leitungPause.aktiv).toBe(true);
      const auf = await schreibe("l1", (m) => setze({ ...ki(m), leitungPause: { aktiv: false, am: p.am, nr: p.nr } })(m));
      expect(auf.status, auf.roh).toBe(200);
      expect(ki(await gespeichert()).leitungPause.aktiv).toBe(false);
    } finally { process.env[SCHALTER] = "true"; }
  });
  it("Betriebsrat hebt nicht auf: erneut pausiert, dann kein Aufheben durch den Betriebsrat — auch nicht mit gefälschtem Hauptschalter", async () => {
    await schreibe("r1", (m) => setze({ ...ki(m), pause: { aktiv: true } })(m));
    const g = await gespeichert();
    expect(ki(g).pause.aktiv).toBe(true);
    const e = await schreibe("r1", (m) => setze({ ...ki(m), pause: { aktiv: false, am: ki(g).pause.am, nr: ki(g).pause.nr }, betrieb: { an: false } })(m));
    expect(e.status).toBe(403);                                        // keine zulässige Änderung → wie bisher
    const m = await gespeichert();
    expect(ki(m).pause.aktiv).toBe(true);
    expect(ki(m).betrieb.an).toBe(true);
  });
  it("Rollenvergabe bei aktiver Pause: Leitung entzieht dem Betriebsrat die Rolle, legt ein Betriebsrat-Konto an, löscht es — 403, nichts gespeichert", async () => {
    const vorher = (await gespeichert()).personen;
    const faelle = {
      entziehen: (m) => { m.personen.find((p) => p.id === "r1").rolle = "mitarbeiter"; },
      anlegen: (m) => { m.personen.push(person("r2", "betriebsrat")); },
      loeschen: (m) => { m.personen = m.personen.filter((p) => p.id !== "r1"); },
      umwidmen: (m) => { m.personen.find((p) => p.id === "a1").rolle = "betriebsrat"; },
    };
    for (const [n, f] of Object.entries(faelle)) {
      const e = await schreibe("l1", f);
      expect(e.status, n).toBe(403);
      expect((await gespeichert()).personen, n).toEqual(vorher);
    }
    /* andere Personen ändern geht weiter: die normale Dienstplanung bleibt funktionsfähig */
    const ok = await schreibe("l1", (m) => { m.personen.find((p) => p.id === "a1").nachname = "Neu"; });
    expect(ok.status, ok.roh).toBe(200);
    expect((await gespeichert()).personen.find((p) => p.id === "a1").nachname).toBe("Neu");
  });
  it("Leitung hebt die Pause auf — nur mit dem Stempel der gesehenen Pause; Betriebsprotokoll des Betriebs bleibt vollständig", async () => {
    const g = await gespeichert();
    const blind = await schreibe("l1", (m) => setze({ ...ki(m), pause: { aktiv: false } })(m));
    expect(ki(await gespeichert()).pause.aktiv, `blind ${blind.status}`).toBe(true);
    const e = await schreibe("l1", (m) => setze({ ...ki(m), pause: { aktiv: false, am: ki(g).pause.am, nr: ki(g).pause.nr } })(m));
    expect(e.status, e.roh).toBe(200);
    const m = await gespeichert();
    expect(ki(m).pause).toMatchObject({ aktiv: false, vonRolle: "leitung", vonPerson: "l1" });
    const { intelligenceErlaubt } = await import("../server/lib/ki-steuerung.mjs");
    expect(intelligenceErlaubt(m, "F3", "leitung", AN)).toBe(true);
    expect(ki(m).protokoll.map((x) => x.art)).toEqual(["betrieb-an", "frage", "funktion-an", "pause-gesetzt", "pause-aufgehoben", "betrieb-aus", "betrieb-an", "leitungspause-gesetzt", "leitungspause-aufgehoben", "pause-gesetzt", "pause-aufgehoben"]);
    /* ohne Pause lässt sich die Betriebsrat-Rolle wieder ändern; die Änderung steht (nur als Zahl) im Betriebsprotokoll */
    const e2 = await schreibe("l1", (m2) => { m2.personen.push(person("r2", "betriebsrat")); });
    expect(e2.status, e2.roh).toBe(200);
    const { spurLesen } = await import("../server/lib/schutz.mjs");
    const spur = JSON.stringify(await spurLesen(1));
    expect(spur).toContain("betriebsrat-konten +1 -0");
    expect(spur).toContain("pause-gesetzt");
  });
  it("Schalter CENTRIC_KI_BR_PAUSE aus: der Betriebsrat schreibt nirgends (403 wie bisher), die Leitung kann weiter aufheben", async () => {
    delete process.env[SCHALTER];
    try {
      const e = await schreibe("r1", (m) => setze({ ...ki(m), pause: { aktiv: true } })(m));
      expect(e.status).toBe(403);
      expect(ki(await gespeichert()).pause.aktiv).toBe(false);
      for (const w of ["", "1", "TRUE", "yes"]) {
        process.env[SCHALTER] = w;
        const e2 = await schreibe("r1", (m) => setze({ ...ki(m), pause: { aktiv: true } })(m));
        expect(e2.status, w).toBe(403);
      }
    } finally { process.env[SCHALTER] = "true"; }
    /* Frage „ja“ setzt auch ohne den Schalter eine Leitung-Pause (Betreiberentscheidung 2026-11-26, spät), nicht die Pause des
       Betriebsrats (die bleibt, wie sie war); die Leitung hebt sie wieder auf */
    delete process.env[SCHALTER];
    try {
      const vorher = ki(await gespeichert()).pause;
      await schreibe("l1", (m) => setze({ ...ki(m), betriebsratFrage: { antwort: "ja" } })(m));
      const g = await gespeichert();
      expect(ki(g).leitungPause.aktiv).toBe(true);
      expect(ki(g).pause).toEqual(vorher);
      const e = await schreibe("l1", (m) => setze({ ...ki(m), leitungPause: { aktiv: false, am: ki(g).leitungPause.am, nr: ki(g).leitungPause.nr } })(m));
      expect(e.status, e.roh).toBe(200);
      expect(ki(await gespeichert()).leitungPause.aktiv).toBe(false);
      expect(ki(await gespeichert()).pause).toEqual(vorher);
    } finally { process.env[SCHALTER] = "true"; }
  });
  it("keine neue Route: /api/ki-steuerung und /ki/steuerung gibt es nicht", async () => {
    for (const p of ["/api/ki-steuerung", "/ki/steuerung"]) {
      const e = await anfrage(p, { methode: "PUT", token: T.r1, rumpf: { pause: { aktiv: true } } });
      expect([404, 405]).toContain(e.status);
    }
  });
});
