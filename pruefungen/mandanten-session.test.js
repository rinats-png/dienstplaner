/* ==========================================================================
   SESSION AM BETRIEB IST KEIN BESTANDSFELD (Commit D1c)

   mandanten[].session hatte keinen Schreiber und keinen Zweck. Die
   Oberfläche las daraus nur irrtümlich die eigene Person (bewirbDich,
   ziehBewerbungZurueck; vgl. 33e1cc1). Der Server nahm von Planung und
   Leitung aber jeden Inhalt an und gab ihn allen Rollen des Betriebs
   zurück — Beschäftigten und Betriebsrat eingeschlossen, auch in der
   Vollausgabe. Mit einer fremden personId darin liefen Bewerbungen der
   Beschäftigten still ins Leere.

   Invariante: nie ausgeliefert (jede Rolle, Vollausgabe, 409), beim
   Schreiben verworfen ohne Ablehnung der übrigen Änderung, Altinhalt beim
   nächsten Schreiben entfernt — auch im Drei-Wege-Abgleich und bei der
   Wiederherstellung aus einer Sicherung.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { vollausgabeBetrieb, betriebsSicherung } from "../server/lib/sicherungen.mjs";

const SESSION = () => ({ marker: "DARF-NICHT-ZUM-MITARBEITER", email: "secret@example.test", token: "abc",
  unbekannt: { foo: "MK-MSESSION-TIEF" }, personId: "am2" });
const MARKER = ["DARF-NICHT-ZUM-MITARBEITER", "secret@example.test", "MK-MSESSION-TIEF"];
const funde = (x) => MARKER.filter((m) => (typeof x === "string" ? x : JSON.stringify(x ?? null)).includes(m));
const hatFeld = (b) => !!b && Array.isArray(b.mandanten) && b.mandanten.some((m) => m && "session" in m);

const person = (id, rolle, einheit = "e1") => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });
const betrieb = (id, p, mitSession) => ({
  id, name: `Betrieb ${id}`, status: "aktiv", tarif: "pro", einheiten: [{ id: "e1", name: "WB" }, { id: "e2", name: "WB2" }], standorte: [],
  dienstarten: [{ id: "F", name: "Früh" }],
  personen: [person(`${p}l`, "leitung", "ALLE"), person(`${p}p`, "planer", "ALLE"), person(`${p}s`, "subplaner"),
    person(`${p}m`, "mitarbeiter"), person(`${p}m2`, "mitarbeiter"), person(`${p}r`, "betriebsrat", "ALLE")],
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
  ...(mitSession ? { session: SESSION() } : {}),
});
const roh = (mitSession = true) => ({ version: 9, stand: 1, session: null,
  mandanten: [betrieb("m-a", "a", mitSession), betrieb("m-b", "b", mitSession)] });

const SITZ = {
  betreiber: { rolle: "betreiber", person: null, betrieb: 0 },
  leitung: { rolle: "leitung", person: "al", betrieb: 0, mandantId: "m-a" },
  planer: { rolle: "planer", person: "ap", betrieb: 0, mandantId: "m-a" },
  kunde: { rolle: "kunde", person: "al", betrieb: 0, mandantId: "m-a" },
  subplaner: { rolle: "subplaner", person: "as", betrieb: 0, mandantId: "m-a" },
  mitarbeiter: { rolle: "mitarbeiter", person: "am", betrieb: 0, mandantId: "m-a" },
  betriebsrat: { rolle: "betriebsrat", person: "ar", betrieb: 0, mandantId: "m-a" },
  gast: { rolle: "gast", person: "am", betrieb: 0, mandantId: "m-a" },
  irgendwas: { rolle: "irgendwas", person: "am", betrieb: 0, mandantId: "m-a" },
};

describe("Lesen", () => {
  for (const [name, s] of Object.entries(SITZ)) {
    it(`${name}: kein mandanten[].session, kein Marker`, () => {
      const aus = bestandFuerRolle(roh(), s);
      if (!aus) return; /* gar keine Sicht ist ebenso neutral */
      expect(hatFeld(aus)).toBe(false);
      expect(funde(aus)).toEqual([]);
    });
  }
  it("Vollausgabe (Leitung, Sicherungsschlüssel): kein session am Betrieb", () => {
    for (const s of [SITZ.leitung, { rolle: "leitung", nurSicherung: true, mandantId: "m-a" }]) {
      const v = vollausgabeBetrieb(roh(), s);
      expect(v.betrieb).toBeTruthy();
      expect("session" in v.betrieb).toBe(false);
      expect(funde(v)).toEqual([]);
    }
  });
  it("eine neue Sicherung trägt das Feld nicht weiter", () => {
    const g = roh();
    const sich = betriebsSicherung(g, { betrieb: g.mandanten[0], index: 0 });
    expect("session" in sich.mandant).toBe(false);
    expect(funde(sich)).toEqual([]);
  });
});

describe("Schreiben: zusammenfuehren", () => {
  const gelesen = (s, g) => JSON.parse(JSON.stringify(bestandFuerRolle(g, s)));
  const eigenerBetrieb = (b) => b.mandanten.find((m) => m.id === "m-a");
  for (const name of ["leitung", "planer", "kunde"]) {
    it(`${name}: Marker mitgeschickt — zulässige Änderung bleibt, Marker weg`, () => {
      const g = roh(false);
      const b = gelesen(SITZ[name], g);
      eigenerBetrieb(b).session = SESSION();
      eigenerBetrieb(b).abweichungen = { "am|2026-11-03": "F" };
      const e = zusammenfuehren(g, b, SITZ[name]);
      expect(e && e.verweigert, JSON.stringify(e && e.verweigert)).toBeFalsy();
      expect(eigenerBetrieb(e).abweichungen["am|2026-11-03"]).toBe("F");
      expect(hatFeld(e)).toBe(false);
      expect(funde(e)).toEqual([]);
    });
  }
  it("Schichtverantwortung: Marker mitgeschickt — keine Ablehnung, Änderung im eigenen Bereich bleibt", () => {
    const g = roh(false);
    const b = gelesen(SITZ.subplaner, g);
    eigenerBetrieb(b).session = SESSION();
    eigenerBetrieb(b).abweichungen = { ...eigenerBetrieb(b).abweichungen, "am|2026-11-04": "F" };
    const e = zusammenfuehren(g, b, SITZ.subplaner);
    expect(e && e.verweigert, JSON.stringify(e && e.verweigert)).toBeFalsy();
    expect(eigenerBetrieb(e).abweichungen["am|2026-11-04"]).toBe("F");
    expect(hatFeld(e)).toBe(false);
  });
  it("Schichtverantwortung bei gespeichertem Altinhalt: keine Ablehnung (Altinhalt ist keine Änderung)", () => {
    const g = roh(true);
    const b = gelesen(SITZ.subplaner, g);
    eigenerBetrieb(b).abweichungen = { ...eigenerBetrieb(b).abweichungen, "am|2026-11-05": "F" };
    const e = zusammenfuehren(g, b, SITZ.subplaner);
    expect(e && e.verweigert, JSON.stringify(e && e.verweigert)).toBeFalsy();
    expect(hatFeld(e)).toBe(false);
  });
  it("Mitarbeiter: Marker mitgeschickt — keine Ablehnung, Altinhalt bereinigt", () => {
    for (const mit of [false, true]) {
      const g = roh(mit);
      const b = gelesen(SITZ.mitarbeiter, g);
      eigenerBetrieb(b).session = SESSION();
      const e = zusammenfuehren(g, b, SITZ.mitarbeiter);
      expect(e && e.verweigert, JSON.stringify(e && e.verweigert)).toBeFalsy();
      expect(hatFeld(e)).toBe(false);
      expect(funde(e)).toEqual([]);
    }
  });
  it("jede Form wird verworfen (Zeichenkette, Liste, Zahl)", () => {
    for (const v of ["DARF-NICHT-ZUM-MITARBEITER", ["x"], 42]) {
      const g = roh(false);
      const b = gelesen(SITZ.leitung, g);
      eigenerBetrieb(b).session = v;
      const e = zusammenfuehren(g, b, SITZ.leitung);
      expect(e.verweigert).toBeFalsy();
      expect(hatFeld(e)).toBe(false);
    }
  });
  it("Betrieb B bleibt beim Schreiben von A ohne Altinhalt", () => {
    const g = roh(true);
    const e = zusammenfuehren(g, gelesen(SITZ.leitung, g), SITZ.leitung);
    expect(hatFeld(e)).toBe(false);
  });
});

describe("Oberfläche", () => {
  it("bewirbDich und ziehBewerbungZurueck lesen die Person nur aus der Sitzung", async () => {
    const quelle = (await readFile(path.join(__dirname, "..", "src", "App.jsx"), "utf8")).replace(/\r\n/g, "\n");
    expect(quelle).not.toMatch(/\bm\.session\b/);
    for (const name of ["bewirbDich", "ziehBewerbungZurueck"]) {
      const ab = quelle.indexOf(`      ${name}: `);
      expect(ab, name).toBeGreaterThan(0);
      const stueck = quelle.slice(ab, quelle.indexOf("}, \"", ab));
      expect(stueck).toContain("const pid = sitz.person.id;");
      expect(stueck).not.toContain("session");
    }
  });
});

/* ---------- über die echten Handler und die echte Ablage ---------- */

const WIRT = "127.0.0.1:3000";
const RAUM = "msess";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, S;
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.11.${Math.floor(nr / 250)}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const lies = (t) => anfrage("/api/bestand", { methode: "GET", token: t });
const schreib = (t, bestand, etag) => anfrage("/api/bestand", { methode: "PUT", token: t, rumpf: { bestand, etag, durch: "Test" } });
const gespeichert = async () => (await B.bestandLesen(laden(), RAUM)).bestand;
const kernRoh = async () => JSON.stringify((await laden().getWithMetadata(S.kernSchluessel(RAUM), { type: "json" })).data);
/** Altbestand: session direkt an beide Betriebe im gespeicherten Kern, Stand bleibt. */
async function altbestand() {
  const k = await laden().getWithMetadata(S.kernSchluessel(RAUM), { type: "json" });
  await laden().setJSON(S.kernSchluessel(RAUM), { ...k.data, mandanten: k.data.mandanten.map((m) => ({ ...m, session: SESSION() })) },
    { metadata: k.metadata });
  expect(hatFeld(await gespeichert())).toBe(true);
}

const T = {};
async function sitzung(code, rolle, person, betriebNr, mandantId) {
  await kontoSchreiben(laden(), ablageSchluessel(code), { name: `${rolle} ${person}`, bestand: RAUM, rolle, person,
    betrieb: betriebNr, ...(mandantId ? { mandantId } : {}), angelegt: "2026-01-01T00:00:00.000Z" });
  const a = await anfrage("/api/anmelden", { rumpf: { zugangscode: code } });
  expect(a.token, a.roh).toBeTruthy();
  return a.token;
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-mandanten-session-"));
  process.env.CENTRIC_DATEN = wurzel;
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
  S = await import("../server/lib/scherben.mjs");
  await B.bestandSchreiben(laden(), RAUM, roh(true), { durch: "Pruefung" });
  T.al = await sitzung("MSE1-AAAA-0001", "leitung", "al", 0, "m-a");
  T.ap = await sitzung("MSE2-AAAA-0002", "planer", "ap", 0, "m-a");
  T.as = await sitzung("MSE3-AAAA-0003", "subplaner", "as", 0, "m-a");
  T.am = await sitzung("MSE4-AAAA-0004", "mitarbeiter", "am", 0, "m-a");
  T.ar = await sitzung("MSE5-AAAA-0005", "betriebsrat", "ar", 0, "m-a");
  T.bl = await sitzung("MSE6-BBBB-0006", "leitung", "bl", 1, "m-b");
  T.bm = await sitzung("MSE7-BBBB-0007", "mitarbeiter", "bm", 1, "m-b");
  T.bt = await sitzung("MSE8-BTRB-0008", "betreiber", null, 0, null);
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("über den Handler", () => {
  it("schon das Anlegen speichert kein session am Betrieb", async () => {
    expect(hatFeld(await gespeichert())).toBe(false);
  });
  it("Leitung und Planung schicken den Marker mit einer zulässigen Änderung: 200, Änderung da, Marker nirgends", async () => {
    for (const [t, tag] of [[T.al, "2026-11-03"], [T.ap, "2026-11-06"]]) {
      const r = await lies(t);
      const b = JSON.parse(JSON.stringify(r.bestand));
      b.mandanten[0].session = SESSION();
      b.mandanten[0].abweichungen = { ...b.mandanten[0].abweichungen, [`am|${tag}`]: "F" };
      const w = await schreib(t, b, r.etag);
      expect(w.status, w.roh).toBe(200);
      expect((await gespeichert()).mandanten[0].abweichungen[`am|${tag}`]).toBe("F");
    }
    expect(funde(await kernRoh())).toEqual([]);
    for (const [name, t] of Object.entries(T)) {
      const x = await lies(t);
      expect(x.status, name).toBe(200);
      expect(hatFeld(x.bestand), name).toBe(false);
      expect(funde(x.roh), name).toEqual([]);
    }
  });
  it("Schichtverantwortung und Beschäftigte mit Marker: nicht abgewiesen", async () => {
    for (const t of [T.as, T.am]) {
      const r = await lies(t);
      const b = JSON.parse(JSON.stringify(r.bestand));
      b.mandanten[0].session = SESSION();
      const w = await schreib(t, b, r.etag);
      expect(w.status, w.roh).toBe(200);
    }
    expect(hatFeld(await gespeichert())).toBe(false);
  });
  it("Altbestand: keiner Rolle ausgeliefert, auch nicht in der Vollausgabe", async () => {
    await altbestand();
    for (const [name, t] of Object.entries(T)) {
      const x = await lies(t);
      expect(x.status, name).toBe(200);
      expect(hatFeld(x.bestand), name).toBe(false);
      expect(funde(x.roh), name).toEqual([]);
    }
    const v = await anfrage("/api/vollausgabe", { methode: "GET", token: T.al });
    expect(v.status, v.roh).toBe(200);
    expect(funde(v.roh)).toEqual([]);
  });
  it("409-Antwort: ohne session am Betrieb", async () => {
    const r1 = await lies(T.al);
    const b2 = JSON.parse(JSON.stringify(r1.bestand));
    b2.mandanten[0].dienstarten = [...b2.mandanten[0].dienstarten, { id: "S", name: "Spät" }];
    expect((await schreib(T.ap, b2, r1.etag)).status).toBe(200);
    await altbestand();
    const b1 = JSON.parse(JSON.stringify(r1.bestand));
    b1.mandanten[0].dienstarten = [...b1.mandanten[0].dienstarten, { id: "N", name: "Nacht" }];
    const w = await schreib(T.al, b1, r1.etag);
    expect(w.status, w.roh).toBe(409);
    expect(w.bestand).toBeTruthy();
    expect(hatFeld(w.bestand)).toBe(false);
    expect(funde(w.roh)).toEqual([]);
  });
  it("Drei-Wege-Abgleich: übernommener Kern verliert den Altinhalt", async () => {
    const r1 = await lies(T.al);
    const b2 = JSON.parse(JSON.stringify(r1.bestand));
    b2.mandanten[0].dienstarten = [...b2.mandanten[0].dienstarten, { id: "Z", name: "Zwischen" }];
    expect((await schreib(T.ap, b2, r1.etag)).status).toBe(200);
    await altbestand();
    const b1 = JSON.parse(JSON.stringify(r1.bestand));
    b1.mandanten[0].abweichungen = { ...b1.mandanten[0].abweichungen, "am|2026-12-07": "F" };
    const w = await schreib(T.al, b1, r1.etag);
    expect(w.status, w.roh).toBe(200);
    const g = await gespeichert();
    expect(hatFeld(g)).toBe(false);
    expect(funde(await kernRoh())).toEqual([]);
    expect(g.mandanten[0].abweichungen["am|2026-12-07"]).toBe("F");
    expect(g.mandanten[0].dienstarten.some((d) => d.id === "Z")).toBe(true);
  });
  it("regulärer Schreibvorgang (Stand aktuell): Altinhalt danach entfernt — in beiden Betrieben", async () => {
    await altbestand();
    const r = await lies(T.am);
    const w = await schreib(T.am, JSON.parse(JSON.stringify(r.bestand)), r.etag);
    expect(w.status, w.roh).toBe(200);
    expect(hatFeld(await gespeichert())).toBe(false);
    expect(funde(await kernRoh())).toEqual([]);
  });
  it("Wiederherstellung aus einer Sicherung mit Altinhalt bringt ihn nicht zurück", async () => {
    await altbestand();
    /* eine raumweite Sicherung wie die automatische — roh, mit Altinhalt */
    const marke = "2026-10-01-08-00-00";
    await laden().setJSON(`sicherung:${RAUM}:${marke}`, await gespeichert(),
      { metadata: { zeit: "2026-10-01T08:00:00.000Z", durch: "Test", automatisch: "ja" } });
    const r0 = await lies(T.am);
    expect((await schreib(T.am, JSON.parse(JSON.stringify(r0.bestand)), r0.etag)).status).toBe(200);
    expect(hatFeld(await gespeichert())).toBe(false);
    const r = await lies(T.al);
    const w = await anfrage("/api/wiederherstellen", { token: T.al, rumpf: { marke, etag: r.etag } });
    expect(w.status, w.roh).toBe(200);
    expect(hatFeld(await gespeichert())).toBe(false);
    expect(funde(await kernRoh())).toEqual([]);
  });
});
