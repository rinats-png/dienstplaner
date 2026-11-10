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
    personen: [person("l1", "leitung"), person("l2", "leitung"), person("l3", "leitung"), person("l4", "leitung"),
      person("a1", "mitarbeiter")],
    abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [],
  }] }, { durch: "OPT-1" });
}

const neuerCode = (personId, o = {}) => E.ersteinrichtungscodeAnlegen(laden(), {
  raum: RAUM, mandantId: "m1", betrieb: 0, person: personId, name: "Haus", jetzt: () => jetzt,
  kontoId: `konto-${personId}-${nr}`, ...o });

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
  it("OPT-1-F Blocker 4: scheitert die Aktivierung (Faktor nicht aktiv), wird der Verbrauch zurückgenommen — der Code brennt nicht", async () => {
    const e = await neuerCode("l4");
    const schl = CODES.neuHash(e.code);
    const vorher = await K.kontoLesenStreng(laden(), schl);
    const r = await E.ersteinrichtungEinloesen(laden(), [schl], async () => ({ fehler: "code" }));
    expect(r.ok).toBe(false);
    expect(r.zurueckgenommen).toBe(true);
    const ein = await K.kontoLesenStreng(laden(), schl);
    /* Der Eintrag ist genau der von vorher: offen, ohne Verbrauch, ohne Pflichtvermerk. */
    expect(ein).toEqual(vorher);
    expect(ein.ersteinrichtungVerbraucht).toBeUndefined();
    expect(ein.faktorPflicht).toBeUndefined();
    expect(E.ersteinrichtungGueltig(ein, e.code, jetzt)).toBe(true);
    /* Ein zweiter Versuch ist möglich und kann gelingen. */
    const r2 = await E.ersteinrichtungEinloesen(laden(), [schl], async () => ({ ok: true }));
    expect(r2.ok).toBe(true);
    const nach = await K.kontoLesenStreng(laden(), schl);
    expect(nach.ersteinrichtungVerbraucht).toMatchObject({ grund: "eingerichtet" });
    expect(E.ersteinrichtungGueltig(nach, e.code, jetzt)).toBe(false);
  });

  it("OPT-1-F Blocker 4: bleibt der Code verbraucht, wenn der Faktor doch aktiv ist, unklar ist oder das Zurücknehmen scheitert", async () => {
    /* Aktivierung wirft, Faktor aber aktiv: verbraucht (das Konto hat den Faktor, der Weg ist die Kontoanmeldung). */
    const e1 = await neuerCode("l4");
    const s1 = CODES.neuHash(e1.code);
    const r1 = await E.ersteinrichtungEinloesen(laden(), [s1], async () => { throw new Error("nach dem Schreiben"); },
      { istAktiv: async () => true });
    expect(r1).toMatchObject({ ok: false });
    expect(r1.zurueckgenommen).toBeUndefined();
    expect((await K.kontoLesenStreng(laden(), s1)).ersteinrichtungVerbraucht).toBeTruthy();

    /* Aktivierung wirft, Zustand nicht bestimmbar: verbraucht (fail-closed). */
    const e2 = await neuerCode("l4");
    const s2 = CODES.neuHash(e2.code);
    const r2 = await E.ersteinrichtungEinloesen(laden(), [s2], async () => { throw new Error("x"); },
      { istAktiv: async () => { throw new Error("nicht lesbar"); } });
    expect(r2.ok).toBe(false);
    expect(r2.zurueckgenommen).toBeUndefined();
    expect((await K.kontoLesenStreng(laden(), s2)).ersteinrichtungVerbraucht).toBeTruthy();

    /* Ohne Zustandsprüfung zählt eine Ausnahme als unklar: verbraucht. */
    const e3 = await neuerCode("l4");
    const s3 = CODES.neuHash(e3.code);
    const r3 = await E.ersteinrichtungEinloesen(laden(), [s3], async () => { throw new Error("x"); });
    expect(r3.zurueckgenommen).toBeUndefined();
    expect((await K.kontoLesenStreng(laden(), s3)).ersteinrichtungVerbraucht).toBeTruthy();

    /* Das Zurücknehmen selbst scheitert: verbraucht, nicht offen. */
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
    const r4 = await E.ersteinrichtungEinloesen(kaputt, [s4], async () => ({ fehler: "x" }), { istAktiv: async () => false });
    expect(r4.ok).toBe(false);
    expect(r4.zurueckgenommen).toBeUndefined();
    const ein4 = await K.kontoLesenStreng(laden(), s4);
    expect(ein4.ersteinrichtungVerbraucht).toBeTruthy();
    expect(E.ersteinrichtungGueltig(ein4, e4.code, jetzt)).toBe(false);
  });

  it("OPT-1-F: Fehlversuche bleiben nach einem Zurücknehmen gezählt (kein Zähler-Reset)", async () => {
    const e = await neuerCode("l4");
    const schl = CODES.neuHash(e.code);
    await E.ersteinrichtungFehlversuch(laden(), [schl]);
    await E.ersteinrichtungFehlversuch(laden(), [schl]);
    const r = await E.ersteinrichtungEinloesen(laden(), [schl], async () => ({ fehler: "code" }));
    expect(r.zurueckgenommen).toBe(true);
    const ein = await K.kontoLesenStreng(laden(), schl);
    expect(ein.ersteinrichtung.fehlversuche).toBe(2);
  });

  it("OPT-1-F: ein Ersteinrichtungscode ohne Kontobindung ist ungültig und lässt sich nicht anlegen", async () => {
    const o = await E.ersteinrichtungscodeAnlegen(laden(), { raum: RAUM, mandantId: "m1", betrieb: 0, person: "l4",
      jetzt: () => jetzt });
    expect(o).toMatchObject({ ok: false, grund: "konto" });
    const e = await neuerCode("l4");
    const eintrag = await K.kontoLesenStreng(laden(), CODES.neuHash(e.code));
    expect(E.ersteinrichtungGueltig(eintrag, e.code, jetzt)).toBe(true);
    const ohne = { ...eintrag }; delete ohne.kontoId;
    expect(E.ersteinrichtungGueltig(ohne, e.code, jetzt)).toBe(false);
    expect(E.ersteinrichtungGueltig({ ...eintrag, kontoId: "" }, e.code, jetzt)).toBe(false);
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

  it("richtet den Faktor genau einmal ein; danach ist der Code verbraucht und wird wie unbekannt abgelehnt (H1)", async () => {
    uhr(T0 + 2 * STUNDE);
    const e = await neuerCode("l3");
    const s = laden();
    const schl = CODES.neuHash(e.code);
    const unbekannt = await anmelden({ zugangscode: `${e.code.slice(0, -4)}XXXX` });
    expect(unbekannt.status, unbekannt.roh).toBe(401);

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

    /* Verbraucht: Vermerk weg, Faktor dauerhaft Pflicht; der Prüfwert bleibt für den Nachweis. */
    const nach = await K.kontoLesenStreng(s, schl);
    expect(nach.ersteinrichtung).toBeUndefined();
    expect(nach.faktorPflicht).toBe(true);
    expect(nach.zweiterFaktor).toBe(true);
    expect(nach.ersteinrichtungVerbraucht).toMatchObject({ grund: "eingerichtet" });
    expect(typeof nach.ersteinrichtungVerbraucht.pruefwert).toBe("string");
    expect(E.ersteinrichtungGueltig(nach, e.code, jetzt)).toBe(false);

    /* H1 (Review): Einmalig heißt, der Code ist mit der Einrichtung verbraucht. Jeder weitere Gebrauch — zweite
       Einrichtung, Code allein, Code mit Faktor, auch nach der Frist, Abschalten — ist dieselbe Ablehnung wie für einen
       unbekannten Code. Vorher galt derselbe Code mit Faktor dauerhaft als Leitungscode (falsche Erwartung 200). */
    const versuche = [
      ["zweite Einrichtung", { zugangscode: e.code, zweifaktorAktion: "beginnen" }],
      ["Code allein", { zugangscode: e.code }],
      ["Code mit Faktor", { zugangscode: e.code, zweifaktor: totp(b.geheimnis) }],
    ];
    for (const [was, rumpf] of versuche) {
      const r = await anmelden(rumpf);
      expect(r.status, `${was}: ${r.roh}`).toBe(401);
      expect(r.fehler, was).toBe(unbekannt.fehler);
      expect(r.token, was).toBeUndefined();
      expect(r.geheimnis, was).toBeUndefined();
      weiter();
    }

    /* Auch nach der Frist: der zweite Gebrauch wird abgelehnt (vorher: spaet → 200). */
    uhr(new Date(e.bis).getTime() + 24 * STUNDE);
    const spaet = await anmelden({ zugangscode: e.code, zweifaktor: totp(b.geheimnis) });
    expect(spaet.status, spaet.roh).toBe(401);
    expect(spaet.fehler).toBe(unbekannt.fehler);
    expect(spaet.token).toBeUndefined();
    weiter();

    /* Keine dauerhafte Umgehung: auch Abschalten über das Netz ist abgelehnt. */
    const ab = await anmelden({ zugangscode: e.code, zweifaktorAktion: "abschalten", zweifaktor: totp(b.geheimnis) });
    expect(ab.status, ab.roh).toBe(401);
    expect(ab.aktiv).toBeUndefined();
    weiter();
    const danach = await anmelden({ zugangscode: e.code });
    expect(danach.status, danach.roh).toBe(401);
    expect(danach.token).toBeUndefined();
  }, LIMIT);

  it("M1: fünf falsche Werte aus der App sperren den Code endgültig, auch nach Neustart; danach auch der richtige Wert abgelehnt", async () => {
    uhr(T0 + 5 * STUNDE);
    const e = await neuerCode("l2");
    const s = laden();
    const schl = CODES.neuHash(e.code);
    const unbekannt = await anmelden({ zugangscode: `${e.code.slice(0, -4)}XXXX` });
    const b = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
    expect(b.status, b.roh).toBe(200);
    const falsch = totp(b.geheimnis) === "000000" ? "111111" : "000000";
    for (let i = 0; i < E.ERSTEINRICHTUNG_FEHLVERSUCHE; i += 1) {
      const f = await anmelden({ zugangscode: e.code, zweifaktorAktion: "bestaetigen", zweifaktor: falsch });
      expect(f.status, `Versuch ${i + 1}: ${f.roh}`).toBe(401);
      expect(f.aktiv).toBeUndefined();
    }
    expect(E.ERSTEINRICHTUNG_FEHLVERSUCHE).toBe(5);
    const ein = await K.kontoLesenStreng(s, schl);
    expect(ein.ersteinrichtung).toBeUndefined();
    expect(ein.ersteinrichtungVerbraucht).toMatchObject({ grund: "fehlversuche" });

    /* Neustart der Prozessinstanz: alle Module und Zähler im Arbeitsspeicher neu. Die Sperre liegt in der Ablage. */
    vi.resetModules();
    const schutz = await import("../server/lib/schutz.mjs");
    schutz.GRENZEN.anmelden = { ...schutz.GRENZEN.anmelden, versuche: 100000 };
    schutz.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
    schutz.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
    daten = (await import("../server/funktionen/daten.mjs")).default;

    const richtig = await anmelden({ zugangscode: e.code, zweifaktorAktion: "bestaetigen", zweifaktor: totp(b.geheimnis) });
    expect(richtig.status, richtig.roh).toBe(401);
    expect(richtig.fehler).toBe(unbekannt.fehler);
    expect(richtig.wiederherstellung).toBeUndefined();
    const neu = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
    expect(neu.status, neu.roh).toBe(401);
    expect(neu.geheimnis).toBeUndefined();
    const ZF = await import("../server/lib/zweifaktor.mjs");
    const BZ = await import("../server/lib/betreiber-zweifaktor.mjs");
    expect((await ZF.zweifaktorStand(s, BZ.rollenZweifaktorId(schl))).aktiv).toBe(false);
  }, LIMIT);

  it("parallele Einlösung desselben Codes: genau eine gelingt", async () => {
    uhr(T0 + 6 * STUNDE);
    const e = await neuerCode("l3");
    const b = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
    expect(b.status, b.roh).toBe(200);
    const wert = totp(b.geheimnis);
    const [x, y] = await Promise.all([
      anmelden({ zugangscode: e.code, zweifaktorAktion: "bestaetigen", zweifaktor: wert }),
      anmelden({ zugangscode: e.code, zweifaktorAktion: "bestaetigen", zweifaktor: wert }),
    ]);
    expect([x.status, y.status].sort(), `${x.roh} | ${y.roh}`).toEqual([200, 401]);
    expect([x, y].filter((r) => Array.isArray(r.wiederherstellung)).length).toBe(1);
    const ein = await K.kontoLesenStreng(laden(), CODES.neuHash(e.code));
    expect(ein.ersteinrichtungVerbraucht).toMatchObject({ grund: "eingerichtet" });
    weiter();
  }, LIMIT);

  it("abgelaufen (Server-Uhr): auch mit richtigem Wert abgelehnt, keine Einrichtung", async () => {
    const e = await neuerCode("l4");
    const bis = new Date(e.bis).getTime();
    uhr(bis - 10 * 60000);
    const b = await anmelden({ zugangscode: e.code, zweifaktorAktion: "beginnen" });
    expect(b.status, b.roh).toBe(200);
    uhr(bis + 1);
    const r = await anmelden({ zugangscode: e.code, zweifaktorAktion: "bestaetigen", zweifaktor: totp(b.geheimnis) });
    expect(r.status, r.roh).toBe(401);
    expect(r.wiederherstellung).toBeUndefined();
    const ZF = await import("../server/lib/zweifaktor.mjs");
    const BZ = await import("../server/lib/betreiber-zweifaktor.mjs");
    expect((await ZF.zweifaktorStand(laden(), BZ.rollenZweifaktorId(CODES.neuHash(e.code)))).aktiv).toBe(false);
    uhr(T0 + 7 * STUNDE);
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
    expect(f.aktiv).toBe(true);
    weiter();
    /* H1: Danach ist der Code verbraucht — auch mit Faktor keine Sitzung (vorher: 200 als Leitung). */
    const mit = await anmelden({ zugangscode: e.ersteinrichtung.code, zweifaktor: totp(b.geheimnis) });
    expect(mit.status, mit.roh).toBe(401);
    expect(mit.token).toBeUndefined();
    const nach = await K.kontoLesenStreng(s, CODES.neuHash(e.ersteinrichtung.code));
    expect(nach).toMatchObject({ person: e.person, ersteinrichtungVerbraucht: { grund: "eingerichtet" } });
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
