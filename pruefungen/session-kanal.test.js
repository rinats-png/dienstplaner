/* ==========================================================================
   SESSION IST KEIN BESTANDSFELD (Commit D1b)

   Bis D1b nahm PUT /api/bestand ganz oben ein beliebiges Objekt `session`
   an (BESTAND_FELDER), speicherte es und gab es allen Rollen außer dem
   Betreiber zurück — auch den Rollen eines anderen Betriebs im selben Raum.
   Ein Kanal zwischen Mandanten, der zudem Altbestände mit echter
   Personenkennung ausliefern konnte.

   Invariante:
   - Lesen: session === null, für jede Rolle, auch bei gespeichertem Altinhalt.
   - Schreiben: ein mitgeschickter Inhalt wird verworfen — die sonst
     zulässige Änderung geht trotzdem durch.
   - Altbestand: nie ausgeliefert, beim nächsten Speichern zu null.
   - 409: dieselbe Sicht.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";

const SESSION = { marker: "DARF-NICHT-ZU-B", personId: "p-secret", email: "secret@example.test", token: "secret-token",
  unbekannt: { tief: "MK-SESSION-TIEF" } };
const MARKER = ["DARF-NICHT-ZU-B", "p-secret", "secret@example.test", "secret-token", "MK-SESSION-TIEF"];
const funde = (x) => MARKER.filter((m) => JSON.stringify(x ?? null).includes(m));

const person = (id, rolle, einheit = "e1", extra = {}) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const betrieb = (id, praefix) => ({
  id, name: `Betrieb ${id}`, status: "aktiv", tarif: "pro", einheiten: [{ id: "e1", name: "WB" }], standorte: [],
  dienstarten: [{ id: "F", name: "Früh" }],
  personen: [person(`${praefix}l`, "leitung", "ALLE"), person(`${praefix}p`, "planer", "ALLE"), person(`${praefix}s`, "subplaner"),
    person(`${praefix}m`, "mitarbeiter"), person(`${praefix}r`, "betriebsrat", "ALLE")],
  abweichungen: {}, anfragen: [], notrufe: [], nachrichten: [], abwesenheiten: [],
});
const roh = () => ({ version: 9, stand: 1, session: JSON.parse(JSON.stringify(SESSION)),
  mandanten: [betrieb("m-a", "a"), betrieb("m-b", "b")] });

const SITZ = {
  mitarbeiter: { rolle: "mitarbeiter", person: "am", betrieb: 0, mandantId: "m-a" },
  betriebsrat: { rolle: "betriebsrat", person: "ar", betrieb: 0, mandantId: "m-a" },
  subplaner: { rolle: "subplaner", person: "as", betrieb: 0, mandantId: "m-a" },
  planer: { rolle: "planer", person: "ap", betrieb: 0, mandantId: "m-a" },
  leitung: { rolle: "leitung", person: "al", betrieb: 0, mandantId: "m-a" },
  betreiber: { rolle: "betreiber", person: null, betrieb: 0 },
  kunde: { rolle: "kunde", person: "al", betrieb: 0, mandantId: "m-a" },
  unbekannt: { rolle: "gast", person: "am", betrieb: 0, mandantId: "m-a" },
};

describe("Lesen: bestandFuerRolle", () => {
  for (const [name, s] of Object.entries(SITZ)) {
    it(`${name}: session null, kein Inhalt eines Altbestands`, () => {
      const aus = bestandFuerRolle(roh(), s);
      if (aus === null || aus === undefined) return; /* gar keine Sicht ist ebenso neutral */
      expect(aus.session).toBeNull();
      expect(funde(aus)).toEqual([]);
    });
  }
  it("auch wenn session keine Objektform hat (Zeichenkette, Liste, Zahl)", () => {
    for (const sx of ["DARF-NICHT-ZU-B", ["secret-token"], 42])
      for (const s of Object.values(SITZ)) {
        const aus = bestandFuerRolle({ ...roh(), session: sx }, s);
        if (aus) { expect(aus.session).toBeNull(); expect(funde(aus)).toEqual([]); }
      }
  });
});

describe("Schreiben: zusammenfuehren", () => {
  const gelesen = (s, g) => JSON.parse(JSON.stringify(bestandFuerRolle(g, s)));
  for (const name of ["leitung", "planer", "kunde", "subplaner", "mitarbeiter", "betreiber"]) {
    it(`${name}: mitgeschickte session wird verworfen, gespeicherte bereinigt — ohne Ablehnung`, () => {
      const g = roh();
      const b = gelesen(SITZ[name], g);
      b.session = JSON.parse(JSON.stringify(SESSION));
      const e = zusammenfuehren(g, b, SITZ[name]);
      expect(e && e.verweigert, JSON.stringify(e && e.verweigert)).toBeFalsy();
      expect(e.session).toBeNull();
      expect(funde(e)).toEqual([]);
    });
  }
  it("Leitung: die zulässige Änderung geht mit, session nicht", () => {
    const g = { ...roh(), session: null };
    const b = gelesen(SITZ.leitung, g);
    b.session = JSON.parse(JSON.stringify(SESSION));
    b.mandanten[0].abweichungen = { "am|2026-11-03": "F" };
    const e = zusammenfuehren(g, b, SITZ.leitung);
    expect(e.verweigert).toBeFalsy();
    expect(e.mandanten.find((m) => m.id === "m-a").abweichungen["am|2026-11-03"]).toBe("F");
    expect(e.session).toBeNull();
  });
});

/* ---------- über die echten Handler und die echte Ablage ---------- */

const WIRT = "127.0.0.1:3000";
const RAUM = "sess";
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, S;
let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.9.${Math.floor(nr / 250)}.${nr % 250}` };
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
/** Der Kern, wie er in der Ablage liegt — ohne Umweg über eine Sicht. */
const kernRoh = async () => JSON.stringify((await laden().getWithMetadata(S.kernSchluessel(RAUM), { type: "json" })).data);
/** Einen Altbestand herstellen: session direkt in den gespeicherten Kern, Stand bleibt. */
async function altbestand() {
  const k = await laden().getWithMetadata(S.kernSchluessel(RAUM), { type: "json" });
  await laden().setJSON(S.kernSchluessel(RAUM), { ...k.data, session: JSON.parse(JSON.stringify(SESSION)) }, { metadata: k.metadata });
  expect(funde(await gespeichert()).length).toBeGreaterThan(0);
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
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-session-kanal-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of ["schreiben", "lesen", "anmelden"]) if (schutz.GRENZEN[art]) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  S = await import("../server/lib/scherben.mjs");
  await B.bestandSchreiben(laden(), RAUM, roh(), { durch: "Pruefung" });
  T.al = await sitzung("SES1-AAAA-0001", "leitung", "al", 0, "m-a");
  T.ap = await sitzung("SES2-AAAA-0002", "planer", "ap", 0, "m-a");
  T.as = await sitzung("SES3-AAAA-0003", "subplaner", "as", 0, "m-a");
  T.am = await sitzung("SES4-AAAA-0004", "mitarbeiter", "am", 0, "m-a");
  T.ar = await sitzung("SES5-AAAA-0005", "betriebsrat", "ar", 0, "m-a");
  T.bl = await sitzung("SES6-BBBB-0006", "leitung", "bl", 1, "m-b");
  T.bm = await sitzung("SES7-BBBB-0007", "mitarbeiter", "bm", 1, "m-b");
  T.bt = await sitzung("SES8-BTRB-0008", "betreiber", null, 0, null);
});
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

describe("bestandSchreiben: jeder Schreibweg", () => {
  it("schon das erste Schreiben (Anlegen) speichert session als null", async () => {
    expect((await gespeichert()).session).toBeNull();
    expect(funde(await kernRoh())).toEqual([]);
  });
});

describe("Mandantentrennung", () => {
  it("Betrieb A schreibt session mit Marker plus eine zulässige Änderung: 200, Änderung da, Marker nirgends", async () => {
    const r = await lies(T.al);
    const b = JSON.parse(JSON.stringify(r.bestand));
    b.session = JSON.parse(JSON.stringify(SESSION));
    b.mandanten[0].abweichungen = { ...b.mandanten[0].abweichungen, "am|2026-11-03": "F" };
    const w = await schreib(T.al, b, r.etag);
    expect(w.status, w.roh).toBe(200);
    expect((await gespeichert()).mandanten.find((m) => m.id === "m-a").abweichungen["am|2026-11-03"]).toBe("F");

    const a = await lies(T.al);
    expect(a.bestand.session).toBeNull();
    expect(funde(a.roh)).toEqual([]);
    for (const t of [T.bl, T.bm, T.bt]) {
      const x = await lies(t);
      expect(x.status).toBe(200);
      expect(x.bestand.session).toBeNull();
      expect(funde(x.roh)).toEqual([]);
    }
    expect((await gespeichert()).session).toBeNull();
    expect(funde(await kernRoh())).toEqual([]);
  });
});

describe("Altbestand mit gespeicherter session", () => {
  it("jede Rolle bekommt nur session: null", async () => {
    await altbestand();
    for (const [name, t] of Object.entries(T)) {
      const x = await lies(t);
      expect(x.status, name).toBe(200);
      expect(x.bestand.session, name).toBeNull();
      expect(funde(x.roh), name).toEqual([]);
    }
  });
  it("409-Antwort: dieselbe neutrale Sicht", async () => {
    const r1 = await lies(T.al);
    /* jemand anderes ändert den Kern … */
    const b2 = JSON.parse(JSON.stringify(r1.bestand));
    b2.mandanten[0].dienstarten = [...b2.mandanten[0].dienstarten, { id: "S", name: "Spät" }];
    expect((await schreib(T.ap, b2, r1.etag)).status).toBe(200);
    await altbestand();
    /* … und die Leitung schreibt mit dem alten Stand ebenfalls in den Kern */
    const b1 = JSON.parse(JSON.stringify(r1.bestand));
    b1.session = JSON.parse(JSON.stringify(SESSION));
    b1.mandanten[0].dienstarten = [...b1.mandanten[0].dienstarten, { id: "N", name: "Nacht" }];
    const w = await schreib(T.al, b1, r1.etag);
    expect(w.status, w.roh).toBe(409);
    expect(w.bestand).toBeTruthy();
    expect(w.bestand.session).toBeNull();
    expect(funde(w.roh)).toEqual([]);
    expect(funde(await kernRoh()).length).toBeGreaterThan(0); /* nichts geschrieben */
  });
  it("Drei-Wege-Abgleich ohne eigenen Kernanteil: der übernommene Kern verliert den Altinhalt", async () => {
    const r1 = await lies(T.al);
    const b2 = JSON.parse(JSON.stringify(r1.bestand));
    b2.mandanten[0].dienstarten = [...b2.mandanten[0].dienstarten, { id: "Z", name: "Zwischen" }];
    expect((await schreib(T.ap, b2, r1.etag)).status).toBe(200);
    await altbestand();
    const b1 = JSON.parse(JSON.stringify(r1.bestand));
    b1.mandanten[0].abweichungen = { ...b1.mandanten[0].abweichungen, "am|2026-12-07": "F" };
    const w = await schreib(T.al, b1, r1.etag);
    if (w.status === 409) {
      /* Erkennt der Abgleich doch einen Kernanteil, gilt die 409-Sicht. */
      expect(w.bestand.session).toBeNull(); expect(funde(w.roh)).toEqual([]);
      return;
    }
    expect(w.status, w.roh).toBe(200);
    const g = await gespeichert();
    expect(g.session).toBeNull();
    expect(funde(await kernRoh())).toEqual([]);
    expect(g.mandanten[0].abweichungen["am|2026-12-07"]).toBe("F");
    expect(g.mandanten[0].dienstarten.some((d) => d.id === "Z")).toBe(true);
  });
  it("regulärer Schreibvorgang (Stand aktuell): gespeicherte session danach null", async () => {
    await altbestand();
    const r = await lies(T.am);
    const b = JSON.parse(JSON.stringify(r.bestand));
    const w = await schreib(T.am, b, r.etag);
    expect(w.status, w.roh).toBe(200);
    expect((await gespeichert()).session).toBeNull();
    expect(funde(await kernRoh())).toEqual([]);
  });
});
