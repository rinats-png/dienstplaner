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
    personen: [person("l1", "leitung"), person("l2", "leitung"), person("l3", "leitung"), person("l4", "leitung")],
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
  schutz.GRENZEN.anmelden = { ...schutz.GRENZEN.anmelden, versuche: 100000 };
  schutz.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  schutz.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  E = await import("../server/lib/zugangscode-ersteinrichtung.mjs");
  K = await import("../server/lib/konten.mjs");
  CODES = await import("../server/lib/codes.mjs");
  B = await import("../server/lib/bestand.mjs");
  P = await import("../server/lib/provisionierung.mjs");
  A = await import("../server/lib/accounts.mjs");
  R = await import("../server/lib/registrierung.mjs");
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
   ANMELDEN ÜBER DEN ECHTEN HANDLER
   ========================================================================== */

describe("OPT-1 Anmeldung mit dem Ersteinrichtungscode", () => {
  it("gibt mit dem Code allein keine Sitzung — auch ohne Pflichtschalter", async () => {
    const e = await neuerCode("l1");
    const a = await anmelden({ zugangscode: e.code });
    expect(a.status, a.roh).toBe(403);
    expect(a.zweifaktor).toBe("einrichten");
    expect(a.token).toBeUndefined();
    const st = await anmelden({ zugangscode: e.code, zweifaktorAktion: "stand" });
    expect(st.status, st.roh).toBe(200);
    expect(st.aktiv).toBe(false);
    expect(st.token).toBeUndefined();
  }, LIMIT);

  it("antwortet nach Ablauf genau wie auf einen unbekannten Code", async () => {
    const e = await neuerCode("l2");
    const unbekannt = `${e.code.slice(0, -4)}XXXX`;
    uhr(new Date(e.bis).getTime() + 1);
    try {
      const ab = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
      const un = await anmelden({ zugangscode: unbekannt, zweifaktorAktion: "beginnen" });
      expect(ab.status, ab.roh).toBe(401);
      expect(ab.status).toBe(un.status);
      expect(ab.fehler).toBe(un.fehler);
      expect(ab.geheimnis).toBeUndefined();
      expect(ab.token).toBeUndefined();
      const ohne = await anmelden({ zugangscode: e.code });
      expect(ohne.status).toBe(401);
      expect(ohne.fehler).toBe(un.fehler);
    } finally { uhr(T0 + STUNDE); }
  }, LIMIT);

  it("ist mit kaputtem Vermerk wie unbekannt", async () => {
    const e = await neuerCode("l2");
    const s = laden();
    const schl = CODES.neuHash(e.code);
    const ein = await K.kontoLesenStreng(s, schl);
    await K.kontoSchreiben(s, schl, { ...ein, ersteinrichtung: { bis: "kaputt" } });
    const a = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
    expect(a.status, a.roh).toBe(401);
    expect(a.geheimnis).toBeUndefined();
  }, LIMIT);

  it("richtet den Faktor genau einmal ein; danach nur mit Faktor, dauerhaft, ohne Frist", async () => {
    uhr(T0 + 2 * STUNDE);
    const e = await neuerCode("l3");
    const s = laden();
    const schl = CODES.neuHash(e.code);

    const b = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
    expect(b.status, b.roh).toBe(200);
    expect(typeof b.geheimnis).toBe("string");
    expect(b.token).toBeUndefined();
    /* Eine laufende Einrichtung lässt sich mit dem Code allein nicht überschreiben. */
    const b2 = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
    expect(b2.status, b2.roh).toBe(409);
    expect(b2.geheimnis).toBeUndefined();

    const falsch = await anmelden({ zugangscode: e.code, zweifaktorAktion: "bestaetigen",
      zweifaktor: totp(b.geheimnis) === "000000" ? "111111" : "000000" });
    expect(falsch.status, falsch.roh).toBe(401);

    const ok = await anmelden({ zugangscode: e.code, zweifaktorAktion: "bestaetigen", zweifaktor: totp(b.geheimnis) });
    expect(ok.status, ok.roh).toBe(200);
    expect(ok.aktiv).toBe(true);
    expect(ok.token).toBeUndefined();
    weiter();

    /* Verbraucht: Vermerk weg, Faktor dauerhaft Pflicht. */
    const nach = await K.kontoLesenStreng(s, schl);
    expect(nach.ersteinrichtung).toBeUndefined();
    expect(nach.faktorPflicht).toBe(true);
    expect(nach.zweiterFaktor).toBe(true);

    /* Einmalig: keine zweite Einrichtung. */
    const nochmal = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
    expect(nochmal.status, nochmal.roh).toBe(409);
    expect(nochmal.geheimnis).toBeUndefined();

    /* Code allein: keine Sitzung. */
    const ohne = await anmelden({ zugangscode: e.code });
    expect(ohne.status, ohne.roh).toBe(401);
    expect(ohne.zweifaktor).toBe("erforderlich");
    expect(ohne.token).toBeUndefined();

    /* Mit Faktor: Sitzung als Leitung. */
    const mit = await anmelden({ zugangscode: e.code, zweifaktor: totp(b.geheimnis) });
    expect(mit.status, mit.roh).toBe(200);
    expect(typeof mit.token).toBe("string");
    expect(mit.rolle).toBe("leitung");
    expect(mit.zweifaktor).toBe(true);
    weiter();

    /* Die Frist galt nur der Einrichtung. */
    uhr(new Date(e.bis).getTime() + 24 * STUNDE);
    const spaet = await anmelden({ zugangscode: e.code, zweifaktor: totp(b.geheimnis) });
    expect(spaet.status, spaet.roh).toBe(200);
    weiter();

    /* Keine dauerhafte Umgehung: Abschalten über das Netz verweigert, auch mit gültigem Faktor. */
    const ab = await anmelden({ zugangscode: e.code, zweifaktorAktion: "abschalten", zweifaktor: totp(b.geheimnis) });
    expect(ab.status, ab.roh).toBe(409);
    weiter();
    const danach = await anmelden({ zugangscode: e.code });
    expect(danach.status, danach.roh).toBe(401);
    expect(danach.token).toBeUndefined();
  }, LIMIT);

  it("verweigert ohne Pfeffer jede Aktion (503), keine Sitzung", async () => {
    uhr(T0 + 3 * STUNDE);
    const e = await neuerCode("l4");
    /* Ohne Pfeffer ist der gepfefferte Schlüssel nicht auffindbar: wie unbekannt. */
    delete process.env.CENTRIC_PFEFFER;
    try {
      const a = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
      expect([401, 503]).toContain(a.status);
      expect(a.geheimnis).toBeUndefined();
      expect(a.token).toBeUndefined();
    } finally { process.env.CENTRIC_PFEFFER = PFEFFER; }
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

    /* Der Code führt über den echten Handler nur in die Einrichtung. */
    const a = await anmelden({ zugangscode: e.ersteinrichtung.code });
    expect(a.status, a.roh).toBe(403);
    expect(a.zweifaktor).toBe("einrichten");
    const b = await anmelden({ zugangscode: e.ersteinrichtung.code, zweifaktorAktion: "beginnen" });
    expect(b.status, b.roh).toBe(200);
    const f = await anmelden({ zugangscode: e.ersteinrichtung.code, zweifaktorAktion: "bestaetigen",
      zweifaktor: totp(b.geheimnis) });
    expect(f.status, f.roh).toBe(200);
    weiter();
    const mit = await anmelden({ zugangscode: e.ersteinrichtung.code, zweifaktor: totp(b.geheimnis) });
    expect(mit.status, mit.roh).toBe(200);
    expect(mit.rolle).toBe("leitung");
    expect(mit.person).toBe(e.person);
    weiter();
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
