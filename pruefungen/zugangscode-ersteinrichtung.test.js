/* ==========================================================================
   OPT-1 — SICHERE ERSTEINRICHTUNG FÜR NEU ANGELEGTE BETRIEBE
   (SI-P4 Option 1, Betreiberentscheidung 2026-11-09)

   Ein über ein Konto angelegter Betrieb hatte keinen Zugangscode. Unter
   CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1 war er für seine Leitung damit nicht
   erreichbar (SI-P4-NACHWEIS, Delta-Auflage 2).

   Jetzt kann die Provisionierung einen Ersteinrichtungscode anlegen:
     - einmalig im Klartext im Rückgabewert, nie per E-Mail, gespeichert nur
       als geschlüsselter Hash (Pfeffer Pflicht);
     - befristet (ERSTEINRICHTUNG_STUNDEN), Prüfung zeitkonstant;
     - er taugt nur zum Einrichten des zweiten Faktors — mit ihm allein
       entsteht nie eine Sitzung, weder vorher noch nachher;
     - nach der Einrichtung ist der Faktor für diesen Zugang dauerhaft
       Pflicht (kein Abschalten über das Netz), die Frist entfällt;
     - ungültig, abgelaufen oder verbraucht: dieselbe Antwort wie ein
       unbekannter Code.

   Testcodes entstehen zur Laufzeit; der Pfeffer ist ein Prüfwert.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

const WIRT = "127.0.0.1:3000";
const T0 = Date.UTC(2026, 10, 9, 9, 0, 15);
const STUNDE = 3600000;
const LIMIT = 60000;
const PFEFFER = "pfeffer-nur-zum-pruefen-opt1-0123456789";
const RAUM = "opt1-probe";
const GUT = "Nordwind und Sonne 1846";
const PROFIL = { vorname: "Rina", nachname: "Schmitt", betriebsname: "Pflegedienst Morgenrot" };

let wurzel, getStore, daten, E, K, CODES, B, P, A, R;
/* OPT-1-F: Kontoweg (funktionen/anmeldung.mjs) und Faktor am Konto. KS = konten.mjs (K wird in Prüfungen lokal für ein
   Konto verwendet). */
let kontoHandler, KEKS, KF, KS;

/** Die Anmeldebremsen dieser Prüfungen lockern — gemessen wird die Ersteinrichtung, nicht die Bremse. */
function bremsenLockern(schutz) {
  schutz.GRENZEN.anmelden = { ...schutz.GRENZEN.anmelden, versuche: 100000 };
  schutz.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  schutz.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
  schutz.GRENZEN["anmelden-konto"] = { ...schutz.GRENZEN["anmelden-konto"], versuche: 100000 };
  schutz.WEITERE["anmelden-konto"] = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  schutz.NOTGRENZEN["anmelden-konto"] = { versuche: 100000, fenster: 300, gesamt: 100000 };
}
let nr = 0;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const weiter = () => uhr(jetzt + 30_000);
const laden = () => getStore({ name: "centric", consistency: "strong" });
const sitzungenStore = () => getStore({ name: "centric-sitzungen", consistency: "strong" });

const anmelden = async (rumpf) => {
  nr += 1;
  const a = await daten(new Request(`http://${WIRT}/api/anmelden`, { method: "POST",
    headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
      "x-forwarded-for": `10.61.${Math.floor(nr / 250)}.${nr % 250}` },
    body: JSON.stringify(rumpf) }), {});
  const roh = await a.text();
  let d = {}; try { d = JSON.parse(roh); } catch { /* leer */ }
  return { status: a.status, roh, ...d };
};
const totp = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);

const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });

async function probebestand() {
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{
    id: "m1", name: "Haus", status: "aktiv", einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
    einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("l1", "leitung"), person("l2", "leitung"), person("l3", "leitung"), person("l4", "leitung"),
      person("a1", "mitarbeiter")],
    abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
  }] }, { durch: "OPT-1" });
}

const neuerCode = (personId, o = {}) => E.ersteinrichtungscodeAnlegen(laden(), {
  raum: RAUM, mandantId: "m1", betrieb: 0, person: personId, name: "Haus", jetzt: () => jetzt, ...o });

/** Alles unter konto: als Text — darin darf kein Klartextcode stehen. */
async function kontoText(s) {
  const { blobs } = await s.list({ prefix: "konto:" });
  const teile = [];
  for (const b of blobs) teile.push(b.key, JSON.stringify(await s.get(b.key, { type: "json" })));
  return teile.join("\n");
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-opt1-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
  delete process.env.RESEND_API_KEY;
  ({ getStore } = await import("../server/lib/ablage.mjs"));
  const schutz = await import("../server/lib/schutz.mjs");
  bremsenLockern(schutz);
  daten = (await import("../server/funktionen/daten.mjs")).default;
  const anm = await import("../server/funktionen/anmeldung.mjs");
  kontoHandler = anm.default;
  KEKS = anm.COOKIE;
  KF = await import("../server/lib/kontofaktor.mjs");
  E = await import("../server/lib/zugangscode-ersteinrichtung.mjs");
  K = await import("../server/lib/konten.mjs");
  CODES = await import("../server/lib/codes.mjs");
  B = await import("../server/lib/bestand.mjs");
  P = await import("../server/lib/provisionierung.mjs");
  A = await import("../server/lib/accounts.mjs");
  R = await import("../server/lib/registrierung.mjs");
  KS = K;
  await probebestand();
}, LIMIT);

afterAll(async () => {
  vi.useRealTimers();
  delete process.env.CENTRIC_PFEFFER;
  await rm(wurzel, { recursive: true, force: true });
});

/* ==========================================================================
   ANLEGEN: einmal Klartext, gespeichert nur als Hash, befristet
   ========================================================================== */

describe("OPT-1 Anlegen des Ersteinrichtungscodes", () => {
  it("liefert den Code einmal im Rückgabewert, gespeichert nur als geschlüsselter Hash", async () => {
    const e = await neuerCode("l1");
    expect(e.ok, JSON.stringify(e)).toBe(true);
    expect(typeof e.code).toBe("string");
    expect(e.code).toMatch(/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/);
    expect(new Date(e.bis).getTime()).toBe(T0 + E.ERSTEINRICHTUNG_STUNDEN * STUNDE);
    const s = laden();
    /* Gesucht wird nur über den gepfefferten Schlüssel; der ungepfefferte bleibt leer. */
    const eintrag = await K.kontoLesenStreng(s, CODES.neuHash(e.code));
    expect(eintrag).toBeTruthy();
    expect(await K.kontoLesenStreng(s, CODES.altHash(e.code))).toBeNull();
    expect(eintrag).toMatchObject({ bestand: RAUM, rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1" });
    expect(eintrag.ersteinrichtung && eintrag.ersteinrichtung.bis).toBe(e.bis);
    /* Kein Klartext in der Ablage — weder im Schlüssel noch im Eintrag. */
    const text = await kontoText(s);
    expect(text).not.toContain(e.code);
    expect(text).not.toContain(e.code.replace(/-/g, ""));
  });

  it("erzeugt jedes Mal einen anderen Code", async () => {
    const a = await neuerCode("l2");
    const b = await neuerCode("l2");
    expect(a.ok && b.ok).toBe(true);
    expect(a.code).not.toBe(b.code);
  });

  it("verweigert ohne Pfeffer (fail-closed) und schreibt nichts", async () => {
    const vorher = (await laden().list({ prefix: "konto:" })).blobs.length;
    delete process.env.CENTRIC_PFEFFER;
    try {
      const e = await neuerCode("l1");
      expect(e.ok).toBe(false);
      expect(e.grund).toBe("pfeffer");
      expect(e.code).toBeUndefined();
    } finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
    expect((await laden().list({ prefix: "konto:" })).blobs.length).toBe(vorher);
  });

  it("verweigert ohne Raum, Betrieb oder Person", async () => {
    for (const fehlt of [{ raum: "" }, { mandantId: "" }, { person: "" }]) {
      const e = await neuerCode("l1", fehlt);
      expect(e.ok, JSON.stringify(fehlt)).toBe(false);
      expect(e.code).toBeUndefined();
    }
  });

  it("N1: verweigert, wenn Raum, Betrieb oder Person nicht stimmen oder die Person nicht Leitung ist", async () => {
    const vorher = (await laden().list({ prefix: "konto:" })).blobs.length;
    for (const [was, o] of [
      ["Raum ohne Bestand", { raum: "opt1-gibt-es-nicht" }],
      ["fremde Betriebskennung", { mandantId: "m-fremd" }],
      ["Betrieb ausserhalb", { betrieb: 3 }],
      ["Person unbekannt", { person: "unbekannt-9" }],
      ["Person ist nicht Leitung", { person: "a1" }],
    ]) {
      const e = await neuerCode("l1", o);
      expect(e.ok, was).toBe(false);
      expect(e.code, was).toBeUndefined();
    }
    expect((await laden().list({ prefix: "konto:" })).blobs.length).toBe(vorher);
  });

  it("verschickt nichts: kein Mail- oder Versandweg im Modul", async () => {
    const quelle = await readFile(new URL("../server/lib/zugangscode-ersteinrichtung.mjs", import.meta.url), "utf8");
    for (const muster of [/post(-smtp)?\.mjs/, /versand\.mjs/, /mitteilungen\.mjs/, /\bversand\s*\(/, /\bconsole\s*\./])
      expect(muster.test(quelle), String(muster)).toBe(false);
    /* Vergleich zeitkonstant über den gemeinsamen Baustein. */
    expect(quelle).toMatch(/import\s*\{[^}]*\bgleich\b[^}]*\}\s*from\s*["']\.\/codes\.mjs["']/);
  });
});

/* ==========================================================================
   PRÜFEN: zeitkonstant, befristet, gebunden
   ========================================================================== */

describe("OPT-1 Gültigkeit", () => {
  it("gilt bis kurz vor der Frist, ab der Frist nicht mehr", async () => {
    const e = await neuerCode("l1");
    const eintrag = await K.kontoLesenStreng(laden(), CODES.neuHash(e.code));
    const bis = new Date(e.bis).getTime();
    expect(E.ersteinrichtungGueltig(eintrag, e.code, T0)).toBe(true);
    expect(E.ersteinrichtungGueltig(eintrag, e.code, bis - 1)).toBe(true);
    expect(E.ersteinrichtungGueltig(eintrag, e.code, bis)).toBe(false);
    expect(E.ersteinrichtungGueltig(eintrag, e.code, bis + STUNDE)).toBe(false);
  });

  it("passt nur zum eigenen Code und Raum", async () => {
    const a = await neuerCode("l1");
    const b = await neuerCode("l1");
    const ea = await K.kontoLesenStreng(laden(), CODES.neuHash(a.code));
    expect(E.ersteinrichtungGueltig(ea, b.code, T0)).toBe(false);
    expect(E.ersteinrichtungGueltig({ ...ea, bestand: "anderer-raum" }, a.code, T0)).toBe(false);
    expect(E.ersteinrichtungGueltig({ ...ea, rolle: "mitarbeiter" }, a.code, T0)).toBe(false);
  });

  it("ist bei kaputtem Vermerk oder fehlendem Pfeffer ungültig (fail-closed)", async () => {
    const e = await neuerCode("l1");
    const ein = await K.kontoLesenStreng(laden(), CODES.neuHash(e.code));
    const z = ein.ersteinrichtung;
    for (const kaputt of [{}, { bis: "morgen", pruefwert: z.pruefwert }, { bis: e.bis }, { bis: e.bis, pruefwert: 7 },
      null, "ja", true]) {
      expect(E.ersteinrichtungGueltig({ ...ein, ersteinrichtung: kaputt }, e.code, T0), JSON.stringify(kaputt)).toBe(false);
    }
    delete process.env.CENTRIC_PFEFFER;
    try { expect(E.ersteinrichtungGueltig(ein, e.code, T0)).toBe(false); }
    finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
  });

  it("erkennt einen offenen Ersteinrichtungsvermerk", () => {
    expect(E.ersteinrichtungOffen({ ersteinrichtung: { bis: "x" } })).toBe(true);
    expect(E.ersteinrichtungOffen({ ersteinrichtung: null })).toBe(false);
    expect(E.ersteinrichtungOffen({})).toBe(false);
    expect(E.ersteinrichtungOffen(null)).toBe(false);
  });
});

/* ==========================================================================
   EINLÖSEN: Verbrauch und Einrichtung als Einheit
   ========================================================================== */

describe("OPT-1 Einlösen (Verbrauch vor Einrichtung)", () => {
  it("scheitert die Einrichtung nach dem Verbrauch, bleibt der Code verbraucht und ohne Faktor", async () => {
    const e = await neuerCode("l4");
    const schl = CODES.neuHash(e.code);
    const r = await E.ersteinrichtungEinloesen(laden(), [schl], async () => ({ fehler: "code" }));
    expect(r.ok).toBe(false);
    const ein = await K.kontoLesenStreng(laden(), schl);
    expect(ein.ersteinrichtung).toBeUndefined();
    expect(ein.ersteinrichtungVerbraucht).toBeTruthy();
    expect(ein.zweiterFaktor).toBeUndefined();
    expect(E.ersteinrichtungGueltig(ein, e.code, jetzt)).toBe(false);
    /* Ein zweites Einlösen ruft die Einrichtung nicht mehr auf. */
    let gerufen = false;
    const r2 = await E.ersteinrichtungEinloesen(laden(), [schl], async () => { gerufen = true; return { ok: true }; });
    expect(r2.ok).toBe(false);
    expect(gerufen).toBe(false);
  });

  it("scheitert der Verbrauch, wird nichts eingerichtet", async () => {
    const e = await neuerCode("l4");
    const schl = CODES.neuHash(e.code);
    const echt = laden();
    const kaputt = new Proxy(echt, { get(t, p) {
      if (p === "setJSON" || p === "set") return async () => { throw new Error("Ablage nicht beschreibbar"); };
      const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
    } });
    let gerufen = false;
    const r = await E.ersteinrichtungEinloesen(kaputt, [schl], async () => { gerufen = true; return { ok: true }; });
    expect(r.ok).toBe(false);
    expect(gerufen).toBe(false);
  });

  it("zwei gleichzeitige Einlösungen: genau eine ruft die Einrichtung auf", async () => {
    const e = await neuerCode("l4");
    const schl = CODES.neuHash(e.code);
    let n = 0;
    const einrichten = async () => { n += 1; await new Promise((r) => setTimeout(r, 20)); return { ok: true }; };
    const [a, b] = await Promise.all([E.ersteinrichtungEinloesen(laden(), [schl], einrichten),
      E.ersteinrichtungEinloesen(laden(), [schl], einrichten)]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    expect(n).toBe(1);
  });
});

/* ==========================================================================
   ANMELDEN ÜBER DIE ECHTEN HANDLER

   OPT-1-F, Option A (Betreiberentscheidung): Der Ersteinrichtungscode richtet
   den zweiten Faktor AM KONTO ein, zusammen mit Adresse und Passwort
   (funktionen/anmeldung.mjs, zweifaktorAktion, Feld ersteinrichtungscode).
   Auf dem Zugangscode-Weg (funktionen/daten.mjs) gilt er nie — dort ist er
   wie ein unbekannter Code. Bis b10ab01e richtete er auf dem Zugangscode-Weg
   einen Faktor AM CODE ein (403 „einrichten", dann 200); nach dem Verbrauch
   prüfte diesen Faktor nichts mehr, die Leitung war ausgesperrt (Review #166,
   Blocker 1 und 2). Die Prüfungen dieses Abschnitts prüfen dieselben
   Eigenschaften (einmalig, befristet, kaputt = unbekannt, fünf Fehlversuche
   sperren auch über einen Neustart, gleichzeitig genau einer, ohne Pfeffer
   nichts) jetzt auf dem Kontoweg — und zusätzlich, dass der Code auf dem
   Zugangscode-Weg nie etwas bewirkt.
   ========================================================================== */

/** POST /api/account/anmelden über den echten Handler. */
const konto = async (rumpf) => {
  nr += 1;
  const a = await kontoHandler(new Request(`http://${WIRT}/api/account/anmelden`, { method: "POST",
    headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
      "x-forwarded-for": `10.62.${Math.floor(nr / 250)}.${nr % 250}` },
    body: JSON.stringify(rumpf) }));
  const roh = await a.text();
  let d = {}; try { d = JSON.parse(roh); } catch { /* leer */ }
  return { status: a.status, roh, kopf: a.headers, ...d };
};
const keksAus = (kopf) => {
  const roh = String(kopf.get("set-cookie") || "");
  const i = roh.indexOf(`${KEKS}=`);
  return i < 0 ? "" : roh.slice(i + KEKS.length + 1).split(";")[0];
};

/** Ein fertiges Konto mit Testbetrieb und Ersteinrichtungscode (Betreiberweg, ersteinrichtung: true). */
async function kontoMitCode(was) {
  const s = laden();
  const { konto: k } = await fertigerAccount(s, `opt1f-${was}-${++nr}@example.org`);
  const e = await P.testbetriebFuerAccountAnlegen(s, sitzungenStore(), { accountId: k.id, ersteinrichtung: true,
    jetzt: () => jetzt });
  expect(e.ok, JSON.stringify(e)).toBe(true);
  return { email: k.email, accountId: k.id, raum: e.raum, person: e.person, code: e.ersteinrichtung.code,
    bis: e.ersteinrichtung.bis, schluessel: CODES.neuHash(e.ersteinrichtung.code) };
}

const einrichtung = (K, aktion, o = {}) => konto({ email: K.email, passwort: GUT, zweifaktorAktion: aktion,
  ersteinrichtungscode: K.code, ...o });

describe("OPT-1 Anmeldung mit dem Ersteinrichtungscode", () => {
  it("gibt mit dem Code allein keine Sitzung — auch ohne Pflichtschalter", async () => {
    uhr(T0 + 8 * STUNDE);
    const K = await kontoMitCode("allein");
    /* Zugangscode-Weg: wie unbekannt (vorher 403 „einrichten"), keine Sitzung, kein Stand. */
    const unbekannt = await anmelden({ zugangscode: `${K.code.slice(0, -4)}XXXX` });
    const a = await anmelden({ zugangscode: K.code });
    expect(a.status, a.roh).toBe(401);
    expect(a.fehler).toBe(unbekannt.fehler);
    expect(a.token).toBeUndefined();
    const st = await anmelden({ zugangscode: K.code, zweifaktorAktion: "stand" });
    expect(st.status, st.roh).toBe(401);
    expect(st.aktiv).toBeUndefined();
    expect(st.token).toBeUndefined();
    /* Kontoweg: der Code ohne Passwort ist keine Anmeldung und keine Einrichtung. */
    for (const rumpf of [{ email: K.email, ersteinrichtungscode: K.code }, { email: K.email, passwort: K.code },
      { email: K.email, ersteinrichtungscode: K.code, zweifaktorAktion: "beginnen" }]) {
      const r = await konto(rumpf);
      expect(r.status, r.roh).toBe(401);
      expect(r.geheimnis).toBeUndefined();
      expect(keksAus(r.kopf)).toBe("");
    }
    /* Stand mit Passwort: Auskunft, keine Sitzung, kein Cookie. */
    const stand = await einrichtung(K, "stand");
    expect(stand.status, stand.roh).toBe(200);
    expect(stand.aktiv).toBe(false);
    expect(stand.token).toBeUndefined();
    expect(stand.kopf.get("set-cookie")).toBe(null);
  }, LIMIT);

  it("antwortet nach Ablauf genau wie auf einen unbekannten Code", async () => {
    const K = await kontoMitCode("ablauf");
    const fremd = { ...K, code: `${K.code.slice(0, -4)}XXXX` };
    uhr(new Date(K.bis).getTime() + 1);
    try {
      const ab = await einrichtung(K, "beginnen");
      const un = await einrichtung(fremd, "beginnen");
      expect(ab.status, ab.roh).toBe(403);
      expect(ab.status).toBe(un.status);
      expect(ab.fehler).toBe(un.fehler);
      expect(ab.hinweis).toBe(un.hinweis);
      expect(ab.geheimnis).toBeUndefined();
      expect(ab.token).toBeUndefined();
      const ohne = await anmelden({ zugangscode: K.code });
      expect(ohne.status).toBe(401);
    } finally { uhr(T0 + 9 * STUNDE); }
  }, LIMIT);

  it("ist mit kaputtem Vermerk wie unbekannt", async () => {
    const K = await kontoMitCode("kaputt");
    const s = laden();
    const ein = await KS.kontoLesenStreng(s, K.schluessel);
    await KS.kontoSchreiben(s, K.schluessel, { ...ein, ersteinrichtung: { bis: "kaputt" } });
    const a = await einrichtung(K, "beginnen");
    expect(a.status, a.roh).toBe(403);
    expect(a.geheimnis).toBeUndefined();
    /* Auch ohne Kontobindung oder mit fremder Bindung: nichts. */
    await KS.kontoSchreiben(s, K.schluessel, { ...ein, accountId: undefined });
    expect((await einrichtung(K, "beginnen")).status).toBe(403);
    await KS.kontoSchreiben(s, K.schluessel, { ...ein, accountId: "a_fremdes-konto-123" });
    expect((await einrichtung(K, "beginnen")).status).toBe(403);
  }, LIMIT);

  it("richtet den Faktor genau einmal ein; danach ist der Code verbraucht und wird wie unbekannt abgelehnt (H1); die Leitung meldet sich mit Passwort und Faktor an (Blocker 1)", async () => {
    uhr(T0 + 10 * STUNDE);
    const K = await kontoMitCode("einmal");
    const s = laden();
    const unbekannt = await anmelden({ zugangscode: `${K.code.slice(0, -4)}XXXX` });
    expect(unbekannt.status, unbekannt.roh).toBe(401);

    const b = await einrichtung(K, "beginnen");
    expect(b.status, b.roh).toBe(200);
    expect(typeof b.geheimnis).toBe("string");
    expect(b.token).toBeUndefined();
    /* Eine laufende Einrichtung lässt sich nicht überschreiben. */
    const b2 = await einrichtung(K, "beginnen");
    expect(b2.status, b2.roh).toBe(409);
    expect(b2.geheimnis).toBeUndefined();

    const falsch = await einrichtung(K, "bestaetigen", { zweifaktor: totp(b.geheimnis) === "000000" ? "111111" : "000000" });
    expect(falsch.status, falsch.roh).toBe(401);

    const ok = await einrichtung(K, "bestaetigen", { zweifaktor: totp(b.geheimnis) });
    expect(ok.status, ok.roh).toBe(200);
    expect(ok.aktiv).toBe(true);
    expect(ok.token).toBeUndefined();
    expect(ok.wiederherstellung).toHaveLength(10);
    weiter();

    /* Verbraucht: Vermerk weg, Pflichtvermerk am Code, Prüfwert bleibt für den Nachweis; der Faktor liegt am Konto. */
    const nach = await KS.kontoLesenStreng(s, K.schluessel);
    expect(nach.ersteinrichtung).toBeUndefined();
    expect(nach.faktorPflicht).toBe(true);
    expect(nach.ersteinrichtungVerbraucht).toMatchObject({ grund: "eingerichtet" });
    expect(typeof nach.ersteinrichtungVerbraucht.pruefwert).toBe("string");
    expect(nach.ersteinrichtungVerbraucht.fehlversuche).toBe(1);
    expect(E.ersteinrichtungGueltig(nach, K.code, jetzt)).toBe(false);
    expect((await KF.kontoFaktorStand(s, K.accountId)).aktiv).toBe(true);

    /* H1: Jeder weitere Gebrauch des Codes — Einrichtung über das Konto, Zugangscode allein, mit Faktor, auch nach der
       Frist, Abschalten — ergibt nichts. */
    const versuche = [
      ["zweite Einrichtung (Konto)", () => einrichtung(K, "beginnen")],
      ["Code allein", () => anmelden({ zugangscode: K.code })],
      ["Code mit Faktor", () => anmelden({ zugangscode: K.code, zweifaktor: totp(b.geheimnis) })],
      ["Code als Passwort", () => konto({ email: K.email, passwort: K.code, zweifaktor: totp(b.geheimnis) })],
    ];
    for (const [was, f] of versuche) {
      const r = await f();
      expect([401, 409], `${was}: ${r.roh}`).toContain(r.status);
      expect(r.token, was).toBeUndefined();
      expect(r.geheimnis, was).toBeUndefined();
      expect(keksAus(r.kopf || new Headers())).toBe("");
      weiter();
    }

    /* Blocker 1: Der reguläre Weg hinein — Passwort und Code aus der App — und mit ihm der Betrieb als Leitung. */
    const an = await konto({ email: K.email, passwort: GUT, zweifaktor: totp(b.geheimnis) });
    expect(an.status, an.roh).toBe(200);
    const keks = keksAus(an.kopf);
    expect(keks).toBeTruthy();
    weiter();
    const w = await kontoHandler(new Request(`http://${WIRT}/api/account/betrieb`, { method: "POST",
      headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json", cookie: `${KEKS}=${keks}`,
        "x-forwarded-for": "10.63.0.1" }, body: JSON.stringify({ raum: K.raum }) }));
    const wd = JSON.parse(await w.text());
    expect(w.status, JSON.stringify(wd)).toBe(200);
    expect(wd.rolle).toBe("leitung");

    /* Auch nach der Frist: der zweite Gebrauch wird abgelehnt. */
    uhr(new Date(K.bis).getTime() + 24 * STUNDE);
    const spaet = await anmelden({ zugangscode: K.code, zweifaktor: totp(b.geheimnis) });
    expect(spaet.status, spaet.roh).toBe(401);
    expect(spaet.token).toBeUndefined();
    weiter();
    const ab = await anmelden({ zugangscode: K.code, zweifaktorAktion: "abschalten", zweifaktor: totp(b.geheimnis) });
    expect(ab.status, ab.roh).toBe(401);
    expect(ab.aktiv).toBeUndefined();
    uhr(T0 + 11 * STUNDE);
  }, LIMIT);

  it("M1: fünf falsche Werte aus der App sperren den Code endgültig, auch nach Neustart; danach auch der richtige Wert abgelehnt", async () => {
    uhr(T0 + 12 * STUNDE);
    const K = await kontoMitCode("m1");
    const s = laden();
    const b = await einrichtung(K, "beginnen");
    expect(b.status, b.roh).toBe(200);
    const falsch = totp(b.geheimnis) === "000000" ? "111111" : "000000";
    for (let i = 0; i < E.ERSTEINRICHTUNG_FEHLVERSUCHE; i += 1) {
      const f = await einrichtung(K, "bestaetigen", { zweifaktor: falsch });
      expect(f.status, `Versuch ${i + 1}: ${f.roh}`).toBe(401);
      expect(f.aktiv).toBeUndefined();
    }
    expect(E.ERSTEINRICHTUNG_FEHLVERSUCHE).toBe(5);
    const ein = await KS.kontoLesenStreng(s, K.schluessel);
    expect(ein.ersteinrichtung).toBeUndefined();
    expect(ein.ersteinrichtungVerbraucht).toMatchObject({ grund: "fehlversuche" });

    /* Neustart der Prozessinstanz: alle Module und Zähler im Arbeitsspeicher neu. Die Sperre liegt in der Ablage. */
    vi.resetModules();
    const schutz = await import("../server/lib/schutz.mjs");
    bremsenLockern(schutz);
    daten = (await import("../server/funktionen/daten.mjs")).default;
    kontoHandler = (await import("../server/funktionen/anmeldung.mjs")).default;
    /* Die Bremse des Faktors (fünf je fünf Minuten) ist hier nicht gemeint: abwarten, bis sie frei ist. */
    uhr(jetzt + 16 * 60000);

    const richtig = await einrichtung(K, "bestaetigen", { zweifaktor: totp(b.geheimnis) });
    expect([403, 409], richtig.roh).toContain(richtig.status);
    expect(richtig.wiederherstellung).toBeUndefined();
    const neu = await einrichtung(K, "beginnen");
    expect(neu.status, neu.roh).toBe(403);
    expect(neu.geheimnis).toBeUndefined();
    const KF2 = await import("../server/lib/kontofaktor.mjs");
    expect((await KF2.kontoFaktorStand(s, K.accountId)).aktiv).toBe(false);
    expect((await KF2.kontoFaktorStand(s, K.accountId)).ausstehend).toBe(false);
  }, LIMIT);

  it("parallele Einlösung desselben Codes: genau eine gelingt", async () => {
    uhr(T0 + 13 * STUNDE);
    const K = await kontoMitCode("parallel");
    const b = await einrichtung(K, "beginnen");
    expect(b.status, b.roh).toBe(200);
    const wert = totp(b.geheimnis);
    const [x, y] = await Promise.all([einrichtung(K, "bestaetigen", { zweifaktor: wert }),
      einrichtung(K, "bestaetigen", { zweifaktor: wert })]);
    expect(x.status === 200 || y.status === 200, `${x.roh} | ${y.roh}`).toBe(true);
    expect([x, y].filter((r) => r.status === 200).length).toBe(1);
    expect([x, y].filter((r) => Array.isArray(r.wiederherstellung)).length).toBe(1);
    const ein = await KS.kontoLesenStreng(laden(), K.schluessel);
    expect(ein.ersteinrichtungVerbraucht).toMatchObject({ grund: "eingerichtet" });
    /* Review PR #179: Danach ist der Faktor AKTIV — die unterlegene Bestätigung hat ihn nicht gelöscht. */
    const st = await KF.kontoFaktorStand(laden(), K.accountId);
    expect(st.aktiv, `${x.roh} | ${y.roh}`).toBe(true);
    weiter();
  }, LIMIT);

  it("abgelaufen (Server-Uhr): auch mit richtigem Wert abgelehnt, keine Einrichtung", async () => {
    uhr(T0 + 14 * STUNDE);
    const K = await kontoMitCode("frist");
    const bis = new Date(K.bis).getTime();
    uhr(bis - 10 * 60000);
    const b = await einrichtung(K, "beginnen");
    expect(b.status, b.roh).toBe(200);
    uhr(bis + 1);
    const r = await einrichtung(K, "bestaetigen", { zweifaktor: totp(b.geheimnis) });
    expect(r.status, r.roh).toBe(403);
    expect(r.wiederherstellung).toBeUndefined();
    expect((await KF.kontoFaktorStand(laden(), K.accountId)).aktiv).toBe(false);
    uhr(T0 + 15 * STUNDE);
  }, LIMIT);

  it("verweigert ohne Pfeffer jede Aktion (503), keine Sitzung", async () => {
    uhr(T0 + 16 * STUNDE);
    const K = await kontoMitCode("pfeffer");
    delete process.env.CENTRIC_PFEFFER;
    try {
      const a = await einrichtung(K, "beginnen");
      expect([401, 503]).toContain(a.status);
      expect(a.geheimnis).toBeUndefined();
      expect(a.token).toBeUndefined();
      const z = await anmelden({ zugangscode: K.code, zweifaktorAktion: "beginnen" });
      expect([401, 503]).toContain(z.status);
      expect(z.geheimnis).toBeUndefined();
    } finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
  }, LIMIT);

  it("Blocker 2: unter Pflicht richtet die Leitung den Faktor ein und meldet sich danach an; ohne Faktor kein Betrieb", async () => {
    uhr(T0 + 17 * STUNDE);
    process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT = "1";
    try {
      const K = await kontoMitCode("pflicht");
      /* Vorher: Passwort allein ist eine Identität, aber kein Betrieb als Leitung. */
      const an0 = await konto({ email: K.email, passwort: GUT });
      expect(an0.status, an0.roh).toBe(200);
      const w0 = await kontoHandler(new Request(`http://${WIRT}/api/account/betrieb`, { method: "POST",
        headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
          cookie: `${KEKS}=${keksAus(an0.kopf)}`, "x-forwarded-for": "10.63.1.1" }, body: JSON.stringify({ raum: K.raum }) }));
      expect(w0.status).toBe(403);
      /* Der Zugangscode-Weg öffnet mit dem Code nichts, auch unter Pflicht nicht. */
      expect((await anmelden({ zugangscode: K.code })).status).toBe(401);
      /* Einrichtung mit Adresse, Passwort und Code. */
      const b = await einrichtung(K, "beginnen");
      expect(b.status, b.roh).toBe(200);
      const f = await einrichtung(K, "bestaetigen", { zweifaktor: totp(b.geheimnis) });
      expect(f.status, f.roh).toBe(200);
      /* Die Sitzung von vorher gilt nicht mehr. */
      const alt = await kontoHandler(new Request(`http://${WIRT}/api/account/sitzung`, { method: "GET",
        headers: { host: WIRT, origin: `http://${WIRT}`, cookie: `${KEKS}=${keksAus(an0.kopf)}`,
          "x-forwarded-for": "10.63.1.2" } }));
      expect(alt.status).toBe(401);
      weiter();
      /* Danach: Passwort und Code aus der App → Betrieb als Leitung → die Arbeitssitzung gilt bei Anfragen. */
      const an = await konto({ email: K.email, passwort: GUT, zweifaktor: totp(b.geheimnis) });
      expect(an.status, an.roh).toBe(200);
      const w = await kontoHandler(new Request(`http://${WIRT}/api/account/betrieb`, { method: "POST",
        headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
          cookie: `${KEKS}=${keksAus(an.kopf)}`, "x-forwarded-for": "10.63.1.3" }, body: JSON.stringify({ raum: K.raum }) }));
      const wd = JSON.parse(await w.text());
      expect(w.status, JSON.stringify(wd)).toBe(200);
      expect(wd.rolle).toBe("leitung");
      const best = await daten(new Request(`http://${WIRT}/api/bestand`, { method: "GET",
        headers: { host: WIRT, origin: `http://${WIRT}`, authorization: `Bearer ${wd.token}`,
          "x-forwarded-for": "10.63.1.4" } }), {});
      expect(best.status).toBe(200);
    } finally { delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT; }
  }, LIMIT);
});

/* ==========================================================================
   BLOCKER 4: KEIN STILLES VERBRENNEN
   ========================================================================== */

describe("OPT-1-F Blocker 4: Verbrauch nur zusammen mit der Aktivierung", () => {
  it("scheitert die Aktivierung nachweislich ohne aktiven Faktor, wird der Verbrauch zurückgenommen (samt Fehlversuchen)", async () => {
    const e = await neuerCode("l4");
    const schl = CODES.neuHash(e.code);
    await E.ersteinrichtungFehlversuch(laden(), [schl]);
    const vorher = await KS.kontoLesenStreng(laden(), schl);
    const r = await E.ersteinrichtungEinloesen(laden(), [schl], async () => ({ ok: false, grund: "code" }),
      { istAktiv: async () => false });
    expect(r.ok).toBe(false);
    expect(r.zurueckgenommen).toBe(true);
    const ein = await KS.kontoLesenStreng(laden(), schl);
    expect(ein).toEqual(vorher);
    expect(ein.ersteinrichtung.fehlversuche).toBe(1);
    expect(ein.ersteinrichtungVerbraucht).toBeUndefined();
    expect(E.ersteinrichtungGueltig(ein, e.code, jetzt)).toBe(true);
    /* Ein zweiter Versuch ist möglich. */
    const r2 = await E.ersteinrichtungEinloesen(laden(), [schl], async () => ({ ok: true }), { istAktiv: async () => true });
    expect(r2.ok).toBe(true);
    expect((await KS.kontoLesenStreng(laden(), schl)).ersteinrichtungVerbraucht).toMatchObject({ grund: "eingerichtet" });
  });

  it("bleibt verbraucht, wenn der Faktor doch aktiv ist, der Zustand unklar ist, keine Zustandsfrage gestellt wird oder das Zurücknehmen scheitert", async () => {
    const faelle = [
      ["Faktor aktiv", async () => { throw new Error("nach dem Schreiben"); }, async () => true],
      ["Zustand unlesbar", async () => ({ ok: false }), async () => { throw new Error("nicht lesbar"); }],
      ["ohne Zustandsfrage", async () => ({ ok: false }), undefined],
    ];
    for (const [was, einrichten, istAktiv] of faelle) {
      const e = await neuerCode("l4");
      const schl = CODES.neuHash(e.code);
      const r = await E.ersteinrichtungEinloesen(laden(), [schl], einrichten, { istAktiv });
      expect(r.ok, was).toBe(false);
      expect(r.zurueckgenommen, was).toBeUndefined();
      expect((await KS.kontoLesenStreng(laden(), schl)).ersteinrichtungVerbraucht, was).toBeTruthy();
    }
    const e4 = await neuerCode("l4");
    const s4 = CODES.neuHash(e4.code);
    const echt = laden();
    let schreibt = 0;
    const kaputt = new Proxy(echt, { get(t, p) {
      if (p === "setJSON" || p === "set") return async (...a) => {
        schreibt += 1;
        if (schreibt >= 2) throw new Error("Ablage nicht beschreibbar");   // 1 = Verbrauch, 2 = Zurücknehmen
        return t[p](...a);
      };
      const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
    } });
    const r4 = await E.ersteinrichtungEinloesen(kaputt, [s4], async () => ({ ok: false }), { istAktiv: async () => false });
    expect(r4.ok).toBe(false);
    expect(r4.zurueckgenommen).toBeUndefined();
    const ein4 = await KS.kontoLesenStreng(laden(), s4);
    expect(ein4.ersteinrichtungVerbraucht).toBeTruthy();
    expect(E.ersteinrichtungGueltig(ein4, e4.code, jetzt)).toBe(false);
  });

  it("über den Kontoweg: scheitert die Aktivierung vor dem Schreiben, gilt der Code weiter und die Einrichtung gelingt danach", async () => {
    uhr(T0 + 18 * STUNDE);
    const K = await kontoMitCode("blocker4");
    const s = laden();
    const AN = await import("../server/lib/accountanmeldung.mjs");
    const b = await AN.kontoFaktorAktion(s, { email: K.email, passwort: GUT, aktion: "beginnen",
      ersteinrichtungscode: K.code });
    expect(b.ok, JSON.stringify(b)).toBe(true);
    /* Die Ablage verweigert das Schreiben des aktiven Faktors (vor jeder Aktivierung). */
    const kaputt = new Proxy(s, { get(t, p) {
      if (p === "setJSON") return async (key, wert, ...rest) => {
        if (String(key).startsWith("zweifaktor:") && wert && wert.stand === "aktiv") throw new Error("Ablage nicht beschreibbar");
        return t.setJSON(key, wert, ...rest);
      };
      const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
    } });
    const f = await AN.kontoFaktorAktion(kaputt, { email: K.email, passwort: GUT, aktion: "bestaetigen",
      ersteinrichtungscode: K.code, zweifaktor: totp(b.daten.geheimnis) });
    expect(f.ok).toBe(false);
    expect(JSON.stringify(f)).not.toContain("wiederherstellung");
    expect((await KF.kontoFaktorStand(s, K.accountId)).aktiv).toBe(false);
    /* Nicht verbrannt: Der Code gilt weiter … */
    const ein = await KS.kontoLesenStreng(s, K.schluessel);
    expect(ein.ersteinrichtungVerbraucht).toBeUndefined();
    expect((await E.ersteinrichtungFuerKonto(s, { code: K.code, accountId: K.accountId })).ok).toBe(true);
    /* … und die Einrichtung gelingt mit dem nächsten Wert aus der App. */
    weiter();
    const f2 = await AN.kontoFaktorAktion(s, { email: K.email, passwort: GUT, aktion: "bestaetigen",
      ersteinrichtungscode: K.code, zweifaktor: totp(b.daten.geheimnis) });
    expect(f2.ok, JSON.stringify(f2)).toBe(true);
    expect((await KS.kontoLesenStreng(s, K.schluessel)).ersteinrichtungVerbraucht).toMatchObject({ grund: "eingerichtet" });
  }, LIMIT);
});

/* ==========================================================================
   PROVISIONIERUNG
   ========================================================================== */

function postfach() {
  const briefe = [];
  return { briefe, versand: async (an, betreff, text) => { briefe.push({ an, betreff, text }); return { ok: true, trocken: true }; } };
}
const tokenAus = (text) => { const t = /#token=([A-Za-z0-9_-]+)/.exec(String(text)); return t ? t[1] : null; };

async function fertigerAccount(s, email, pf = postfach()) {
  const start = await R.registrierungStarten(s, { ...PROFIL, email, versand: pf.versand });
  expect(start.ok, `Start: ${start.grund}`).toBe(true);
  const v = await R.emailVerifizieren(s, { token: tokenAus(pf.briefe[pf.briefe.length - 1].text) });
  expect(v.ok, `Bestätigung: ${v.grund}`).toBe(true);
  const p = await R.registrierungPasswortSetzen(s, { accountId: v.accountId, passwort: GUT });
  expect(p.ok, `Passwort: ${p.grund}`).toBe(true);
  return { konto: await A.accountLesenPerId(s, v.accountId), pf };
}

describe("OPT-1 Provisionierung mit Ersteinrichtung", () => {
  it("legt auf Wunsch den Leitungscode an und gibt ihn einmal zurück, ohne Mail", async () => {
    uhr(T0 + 4 * STUNDE);
    const s = laden();
    const { konto, pf } = await fertigerAccount(s, "opt1-a@example.org");
    const briefeVorher = pf.briefe.length;
    const e = await P.testbetriebFuerAccountAnlegen(s, sitzungenStore(), { accountId: konto.id,
      ersteinrichtung: true, jetzt: () => jetzt });
    expect(e.ok, JSON.stringify(e)).toBe(true);
    expect(e.ersteinrichtung && typeof e.ersteinrichtung.code).toBe("string");
    expect(new Date(e.ersteinrichtung.bis).getTime()).toBe(jetzt + E.ERSTEINRICHTUNG_STUNDEN * STUNDE);
    expect(pf.briefe.length).toBe(briefeVorher);
    for (const b of pf.briefe) expect(b.text).not.toContain(e.ersteinrichtung.code);
    const eintrag = await K.kontoLesenStreng(s, CODES.neuHash(e.ersteinrichtung.code));
    expect(eintrag).toMatchObject({ bestand: e.raum, rolle: "leitung", person: e.person,
      mandantId: e.mandantId, betrieb: e.betrieb });
    expect(await kontoText(s)).not.toContain(e.ersteinrichtung.code);

    /* OPT-1-F: an genau dieses Konto gebunden. */
    expect(eintrag.accountId).toBe(konto.id);
    /* Der Code führt über die echten Handler nur in die Einrichtung des Faktors am Konto — auf dem Zugangscode-Weg
       ist er wie unbekannt (bis b10ab01e: 403 „einrichten"). */
    const a = await anmelden({ zugangscode: e.ersteinrichtung.code });
    expect(a.status, a.roh).toBe(401);
    expect(a.token).toBeUndefined();
    const K1 = { email: konto.email, code: e.ersteinrichtung.code };
    const b = await einrichtung(K1, "beginnen");
    expect(b.status, b.roh).toBe(200);
    const f = await einrichtung(K1, "bestaetigen", { zweifaktor: totp(b.geheimnis) });
    expect(f.status, f.roh).toBe(200);
    expect(f.aktiv).toBe(true);
    weiter();
    /* H1: Danach ist der Code verbraucht — auch mit Faktor keine Sitzung über den Code. */
    const mit = await anmelden({ zugangscode: e.ersteinrichtung.code, zweifaktor: totp(b.geheimnis) });
    expect(mit.status, mit.roh).toBe(401);
    expect(mit.token).toBeUndefined();
    const nach = await K.kontoLesenStreng(s, CODES.neuHash(e.ersteinrichtung.code));
    expect(nach).toMatchObject({ person: e.person, ersteinrichtungVerbraucht: { grund: "eingerichtet" } });
    weiter();
  }, LIMIT);

  it("Blocker 3: das Betreiberwerkzeug legt mit --ersteinrichtung den gebundenen Code an, ohne Schalter keinen", async () => {
    const W = await import("../werkzeug/testbetrieb-anlegen.mjs");
    const s = laden();
    const env = { ...process.env };
    /* Ohne --ja oder ohne Adresse: nichts. */
    expect((await W.ausfuehren(["--email", "x@example.org"], env)).ok).toBe(false);
    expect((await W.ausfuehren(["--ja"], env)).ok).toBe(false);
    expect((await W.ausfuehren(["--email", "unbekannt-opt1f@example.org", "--ja"], env)).ok).toBe(false);
    /* Mit Schalter: Code einmal in der Ausgabe, an das Konto gebunden, nirgends im Klartext abgelegt. */
    const { konto: k1 } = await fertigerAccount(s, "opt1-werkzeug-a@example.org");
    const r1 = await W.ausfuehren(["--email", "opt1-werkzeug-a@example.org", "--ersteinrichtung", "--ja"], env);
    expect(r1.ok, r1.text).toBe(true);
    const c = /\n {2}([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})\n/.exec(r1.text);
    expect(c, r1.text).toBeTruthy();
    const ein = await K.kontoLesenStreng(s, CODES.neuHash(c[1]));
    expect(ein).toMatchObject({ accountId: k1.id, rolle: "leitung" });
    expect(await kontoText(s)).not.toContain(c[1]);
    expect((await E.ersteinrichtungFuerKonto(s, { code: c[1], accountId: k1.id })).ok).toBe(true);
    /* Ohne Schalter: bisheriges Verhalten, kein Code, kein Zugang zum Raum. */
    await fertigerAccount(s, "opt1-werkzeug-b@example.org");
    const r2 = await W.ausfuehren(["--email", "opt1-werkzeug-b@example.org", "--ja"], env);
    expect(r2.ok, r2.text).toBe(true);
    expect(r2.text).not.toMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
    const raum = /Raum (\S+?)[ .]/.exec(r2.text)[1];
    const alle = await K.alleKontenStreng(s);
    expect(Object.values(alle).some((x) => x && x.bestand === raum)).toBe(false);
  }, LIMIT);

  it("legt ohne Wunsch keinen Zugangscode an (bisheriges Verhalten)", async () => {
    const s = laden();
    const { konto } = await fertigerAccount(s, "opt1-b@example.org");
    const e = await P.testbetriebFuerAccountAnlegen(s, sitzungenStore(), { accountId: konto.id, jetzt: () => jetzt });
    expect(e.ok, JSON.stringify(e)).toBe(true);
    expect(e.ersteinrichtung).toBeUndefined();
    const alle = await K.alleKontenStreng(s);
    expect(Object.values(alle).some((k) => k && k.bestand === e.raum)).toBe(false);
  }, LIMIT);

  it("bricht ohne Pfeffer ab, räumt den Raum ab und lässt den Anspruch offen", async () => {
    const s = laden();
    const { konto } = await fertigerAccount(s, "opt1-c@example.org");
    delete process.env.CENTRIC_PFEFFER;
    let e;
    try {
      e = await P.testbetriebFuerAccountAnlegen(s, sitzungenStore(), { accountId: konto.id,
        ersteinrichtung: true, jetzt: () => jetzt });
    } finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
    expect(e.ok).toBe(false);
    expect(String(e.grund)).toContain("ersteinrichtung");
    expect(e.ersteinrichtung).toBeUndefined();
    const danach = await A.accountLesenPerId(s, konto.id);
    expect(A.testbetriebOffen(danach).ok).toBe(true);
    expect(danach.testbetriebRaum ?? null).toBeNull();
  }, LIMIT);
});

/* ==========================================================================
   Review PR #179 (Blocker), Zugangscode-Zweig (betreiber-zweifaktor.mjs):
   Ein Fehlversuch, der erst NACH einer gleichzeitigen Einlösung gezählt wird
   (Code schon verbraucht), darf den inzwischen aktiven Faktor nicht löschen.
   Bis 073d9fea: ersteinrichtungFehlversuch → „gesperrt" → zweifaktorAbschalten.
   ========================================================================== */
describe("OPT-1-F Review: Fehlversuch nach gleichzeitiger Einlösung löscht keinen aktiven Faktor", () => {
  it("(d) betreiber-zweifaktor: falscher Wert, dazwischen aktiviert eine andere Anfrage — Faktor bleibt aktiv", async () => {
    uhr(T0 + 20 * STUNDE);
    const BZ = await import("../server/lib/betreiber-zweifaktor.mjs");
    const ZF = await import("../server/lib/zweifaktor.mjs");
    const e = await neuerCode("l3");
    const schl = CODES.neuHash(e.code);
    const id = BZ.rollenZweifaktorId(schl);
    const echt = laden();
    const beg = await ZF.zweifaktorBeginnen(echt, id, "Haus");
    expect(beg.geheimnis).toBeTruthy();
    const richtig = totp(beg.geheimnis);
    const falsch = richtig === "000000" ? "111111" : "000000";
    /* Die Ablage für Anfrage B: Liest B (nach der Vorprüfung) den Zugang für den Fehlversuch, ist A gerade fertig
       geworden — Faktor aktiv, Code verbraucht. */
    let zfGelesen = 0, ausgeloest = false;
    const proxy = new Proxy(echt, { get(t, p) {
      if (p === "get") return async (key, ...rest) => {
        if (key === `zweifaktor:${id}`) zfGelesen += 1;
        if (!ausgeloest && zfGelesen >= 2 && key === `konto:${schl}`) {
          ausgeloest = true;
          const a = await ZF.zweifaktorBestaetigen(echt, id, richtig);
          expect(a.ok).toBe(true);
          const ein = await KS.kontoLesenStreng(echt, schl);
          const { ersteinrichtung, ...rest2 } = ein;
          await KS.kontoSchreiben(echt, schl, { ...rest2, faktorPflicht: true,
            ersteinrichtungVerbraucht: { am: new Date().toISOString(), grund: "eingerichtet", pruefwert: ersteinrichtung.pruefwert } });
        }
        return t.get(key, ...rest);
      };
      const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
    } });
    const r = await BZ.rollenZweifaktor({ store: proxy, k: "test-opt1f-d", rumpf: { zweifaktorAktion: "bestaetigen",
      zweifaktor: falsch }, codeSchluessel: schl, name: "Haus", ersteinrichtung: true, pflichtErzwungen: true });
    expect(ausgeloest).toBe(true);
    expect(r.antwort && r.antwort.status).toBe(401);
    expect((await ZF.zweifaktorStand(echt, id)).aktiv).toBe(true);
    /* Bibliothek: ein Fehlversuch an einem verbrauchten Code meldet „schon verbraucht"; Verwerfen lässt Aktives stehen. */
    const fv = await E.ersteinrichtungFehlversuch(echt, [schl]);
    expect(fv).toMatchObject({ gesperrt: true, schonVerbraucht: true });
    expect(await ZF.zweifaktorEinrichtungVerwerfen(echt, id)).toEqual({ ok: false, grund: "aktiv" });
    expect((await ZF.zweifaktorStand(echt, id)).aktiv).toBe(true);
  }, LIMIT);
});
