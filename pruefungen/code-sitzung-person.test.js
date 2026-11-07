/* ==========================================================================
   SI-P2 — Eine Code-Sitzung überlebt das Entfernen ihrer Person nicht

   Befund P2 (interne Sicherheitsprüfung 2026-11, docs/acc45/SICHERHEIT-INTERN-2026-11.md):
   Ist die Person aus dem Betrieb gelöscht, fällt `wirksameRolle` auf die Rolle des
   Codes zurück, und Codes laufen nicht ab. Die Sitzung lebte weiter (bis zu zwölf
   Stunden, und der Code danach für immer), während der Kalenderfeed derselben Person
   korrekt widerrufen wird.

   Jetzt gilt für eine Code-Sitzung, die an eine Person gebunden ist, dieselbe Regel
   wie für den Feed (lib/personengueltig.mjs): Die Person steht genau einmal im Betrieb,
   ist nicht anonymisiert, nicht deaktiviert und nicht ausgetreten (der Austrittstag
   zählt noch). Sonst ist die Sitzung widerrufen und wird beendet. Zusätzlich gilt ein
   gesperrter Zugangscode auch dann nicht, wenn seine Sitzung die Sperre überlebt hat.

   Gearbeitet wird wie im Betrieb (hilfen/szenario.mjs): eine Sitzung aus einem Code,
   Anfragen mit `authorization: Bearer …`. „Widerrufen" heißt: 401, wie bei jeder
   abgelaufenen Sitzung, und die Sitzungsdatei ist weg.

   Aufruf: npx vitest run pruefungen/code-sitzung-person.test.js
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { aufbauen, tSchluessel } from "./hilfen/szenario.mjs";

const LIMIT = 60000;
let Z;
let AS;

beforeAll(async () => {
  Z = await aufbauen("codeperson");
  AS = await import("../server/lib/arbeitssitzung.mjs");
}, LIMIT);
afterAll(async () => { await Z.abbauen(); });
beforeEach(async () => { await Z.taktLeeren(); });

const heute = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const tag = (versatz) => new Date(Date.parse(`${heute()}T12:00:00Z`) + versatz * 86400000).toISOString().slice(0, 10);

/** Raum mit einem Betrieb; eine Code-Sitzung für Person p_2 (Mitarbeiter) oder p_1 (Leitung). */
async function codeSitzung({ person = "p_2", rolle = "mitarbeiter", mitBetriebskennung = false } = {}) {
  const raum = Z.raum("cp");
  await Z.betriebAnlegen(raum);
  const konto = await Z.zugangskonto(raum, { rolle, person });
  const s = mitBetriebskennung
    ? await Z.S.sitzungAnlegen({ bestand: raum, rolle, person, betrieb: 0, mandantId: "m1", konto, name: "Code" })
    : await Z.S.sitzungAnlegen({ bestand: raum, rolle, person, betrieb: 0, konto, name: "Code" });
  return { raum, konto, token: s.token };
}
const lesen = (token) => Z.bearer(Z.daten, "/api/bestand", token);
const sitzungDa = async (token) => !!(await Z.ablageArbeit().get(tSchluessel(token), { type: "json" }).catch(() => null));

/** Den Bestand ändern (Person entfernen, anonymisieren …). */
async function bestandAendern(raum, aendern) {
  const g = await Z.B.bestandLesen(Z.laden(), raum);
  const neu = JSON.parse(JSON.stringify(g.bestand));
  aendern(neu);
  const e = await Z.B.bestandSchreiben(Z.laden(), raum, neu, { durch: "Pruefung" });
  expect(e.ok, JSON.stringify(e)).toBe(true);
}
const person = (n, id) => n.mandanten[0].personen.find((p) => p.id === id);

describe.each([
  ["mit Betriebskennung (mandantId)", true],
  ["ohne Betriebskennung (älterer Code, über den Index)", false],
])("SI-P2: Code-Sitzung %s", (_name, mitBetriebskennung) => {
  it("Grundfall: die Sitzung einer vorhandenen Person gilt", async () => {
    const c = await codeSitzung({ mitBetriebskennung });
    expect((await lesen(c.token)).status).toBe(200);
    expect(await sitzungDa(c.token)).toBe(true);
  }, LIMIT);

  const URSACHEN = [
    ["Person aus dem Betrieb entfernt", (n) => { n.mandanten[0].personen = n.mandanten[0].personen.filter((p) => p.id !== "p_2"); }],
    ["Person anonymisiert", (n) => { person(n, "p_2").anonym = true; }],
    ["Person deaktiviert (Status gesperrt)", (n) => { person(n, "p_2").status = "gesperrt"; }],
    ["Person deaktiviert (Status inaktiv)", (n) => { person(n, "p_2").status = "inaktiv"; }],
    ["Person ausgetreten (gestern)", (n) => { person(n, "p_2").austritt = tag(-1); }],
    ["Person doppelt eingetragen (mehrdeutig)", (n) => { n.mandanten[0].personen.push({ ...person(n, "p_2") }); }],
  ];
  it.each(URSACHEN)("widerruft die Sitzung: %s", async (_u, aendern) => {
    const c = await codeSitzung({ mitBetriebskennung });
    expect((await lesen(c.token)).status, "vorher").toBe(200);
    await bestandAendern(c.raum, aendern);
    expect((await lesen(c.token)).status).toBe(401);
    expect(await sitzungDa(c.token), "Sitzungsdatei beendet").toBe(false);
  }, LIMIT);

  it("der Austrittstag zählt noch, ein künftiger Austritt stört nicht", async () => {
    for (const versatz of [0, 5]) {
      const c = await codeSitzung({ mitBetriebskennung });
      await bestandAendern(c.raum, (n) => { person(n, "p_2").austritt = tag(versatz); });
      expect((await lesen(c.token)).status, `Austritt ${versatz} Tage`).toBe(200);
    }
  }, LIMIT);

  it("die Rückkehr der Person macht die beendete Sitzung nicht wieder gültig", async () => {
    const c = await codeSitzung({ mitBetriebskennung });
    let alt;
    await bestandAendern(c.raum, (n) => { alt = JSON.parse(JSON.stringify(person(n, "p_2"))); n.mandanten[0].personen = n.mandanten[0].personen.filter((p) => p.id !== "p_2"); });
    expect((await lesen(c.token)).status).toBe(401);
    await bestandAendern(c.raum, (n) => { n.mandanten[0].personen.push(alt); });
    expect((await lesen(c.token)).status).toBe(401);
  }, LIMIT);

  it("auch die Leitung mit Person ist betroffen (sie behielt sonst die Rolle des Codes)", async () => {
    const c = await codeSitzung({ person: "p_1", rolle: "leitung", mitBetriebskennung });
    expect((await lesen(c.token)).status, "vorher").toBe(200);
    await bestandAendern(c.raum, (n) => { n.mandanten[0].personen = n.mandanten[0].personen.filter((p) => p.id !== "p_1"); });
    expect((await lesen(c.token)).status).toBe(401);
  }, LIMIT);
});

describe("SI-P2: was unberührt bleibt", () => {
  it("ein Code ohne Person (etwa die Leitung eines Hauses, Betreiber) bleibt gültig, auch wenn Personen wechseln", async () => {
    const c = await codeSitzung({ person: null, rolle: "leitung" });
    await bestandAendern(c.raum, (n) => { n.mandanten[0].personen = []; });
    expect((await lesen(c.token)).status).toBe(200);
  }, LIMIT);

  it("eine Person mit mehreren Betrieben im Raum: nur der eigene Betrieb zählt", async () => {
    const raum = Z.raum("cp-zwei");
    const e = await Z.B.bestandSchreiben(Z.laden(), raum, { version: 5, mandanten: [
      { id: "m1", name: "Eins", einheiten: [{ id: "e1", name: "WB" }], personen: [{ id: "p_9", vorname: "Anna", nachname: "Alt", rolle: "mitarbeiter" }] },
      { id: "m2", name: "Zwei", einheiten: [{ id: "e2", name: "WB" }], personen: [{ id: "p_9", vorname: "Anna", nachname: "Alt", rolle: "mitarbeiter" }] }] }, { durch: "Pruefung" });
    expect(e.ok, JSON.stringify(e)).toBe(true);
    const konto = await Z.zugangskonto(raum, { rolle: "mitarbeiter", person: "p_9" });
    const s = await Z.S.sitzungAnlegen({ bestand: raum, rolle: "mitarbeiter", person: "p_9", betrieb: 1, mandantId: "m2", konto, name: "Code Zwei" });
    expect((await lesen(s.token)).status, "vorher").toBe(200);
    // Die Person verlässt den ANDEREN Betrieb: unberührt.
    await bestandAendern(raum, (n) => { n.mandanten[0].personen = []; });
    expect((await lesen(s.token)).status).toBe(200);
    // Sie verlässt den eigenen: widerrufen.
    await bestandAendern(raum, (n) => { n.mandanten[1].personen = []; });
    expect((await lesen(s.token)).status).toBe(401);
  }, LIMIT);

  it("Sitzungen aus einem Konto sind von dieser Änderung nicht berührt (eigene Anker)", async () => {
    const b = await Z.arbeitsbereich("cp-konto");
    expect((await lesen(b.token)).status).toBe(200);
  }, LIMIT);
});

describe("SI-P2: gesperrter Zugangscode", () => {
  const sperren = async (konto) => {
    const k = await Z.K.kontoLesen(Z.laden(), konto);
    await Z.K.kontoSchreiben(Z.laden(), konto, { ...k, gesperrt: true, gesperrtAm: new Date().toISOString() });
  };

  it("eine Sitzung, die die Sperre überlebt hat (Beenden gescheitert), gilt trotzdem nicht", async () => {
    const c = await codeSitzung({});
    expect((await lesen(c.token)).status, "vorher").toBe(200);
    await sperren(c.konto);
    expect((await lesen(c.token)).status).toBe(401);
    expect(await sitzungDa(c.token)).toBe(false);
  }, LIMIT);

  it("gilt auch für Codes ohne Person und für Betreiber-Sitzungen mit Zugangsdatensatz", async () => {
    const c = await codeSitzung({ person: null, rolle: "leitung" });
    await sperren(c.konto);
    expect((await lesen(c.token)).status).toBe(401);
  }, LIMIT);

  it("ein Zugang, den es nicht mehr gibt, ändert nichts (nur ausdrücklich gesperrt zählt)", async () => {
    const c = await codeSitzung({ person: null, rolle: "leitung" });
    await Z.laden().delete(`konto:${c.konto}`);
    expect((await lesen(c.token)).status).toBe(200);
  }, LIMIT);

  it("ein Lesefehler am Zugang ist keine Absage: die Sitzung bleibt bestehen, wird aber nicht durchgelassen", async () => {
    const c = await codeSitzung({});
    const wirft = new Proxy(Z.laden(), { get(ziel, name) {
      const w = ziel[name];
      if (typeof w !== "function") return w;
      return (...a) => (String(name) === "get" && String(a[0]).startsWith("konto:")
        ? Promise.reject(Object.assign(new Error("EIO: gestört"), { code: "EIO" })) : w.apply(ziel, a));
    } });
    const s = await Z.S.sitzungLesen(new Request("http://x/", { headers: { authorization: `Bearer ${c.token}` } }));
    const e = await AS.arbeitssitzungPruefen(wirft, s, { merkmal: c.token });
    expect(e.ok).toBe(false);
    expect(await sitzungDa(c.token), "nicht beendet").toBe(true);
    expect((await lesen(c.token)).status, "ohne Störung wieder gültig").toBe(200);
  }, LIMIT);
});

describe("SI-P2: der Kalenderfeed und die Sitzung folgen derselben Regel", () => {
  it("dieselben Fälle, die den Feed widerrufen, beenden die Sitzung (gemeinsame Funktion)", async () => {
    const K = await import("../server/funktionen/kalender.mjs");
    const bestand = (aendern) => { const b = { mandanten: [{ id: "m1", name: "Haus", personen: [{ id: "p_2", rolle: "mitarbeiter" }] }] }; aendern(b); return b; };
    const faelle = [
      ["ok", () => {}, true],
      ["anonym", (b) => { b.mandanten[0].personen[0].anonym = true; }, false],
      ["gesperrt", (b) => { b.mandanten[0].personen[0].status = "gesperrt"; }, false],
      ["ausgetreten", (b) => { b.mandanten[0].personen[0].austritt = tag(-1); }, false],
      ["weg", (b) => { b.mandanten[0].personen = []; }, false],
    ];
    for (const [name, aendern, gilt] of faelle) {
      const b = bestand(aendern);
      expect(K.feedPersonGilt(b, { mandantId: "m1", personId: "p_2" }), `Feed: ${name}`).toBe(gilt);
      expect(AS.sitzungPersonGilt(b, { mandantId: "m1", betrieb: 0, person: "p_2" }), `Sitzung: ${name}`).toBe(gilt);
    }
  }, LIMIT);
});
