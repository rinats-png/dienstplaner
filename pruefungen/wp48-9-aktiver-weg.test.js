/* ==========================================================================
   WP-48.9 (aktiver Weg, ohne Schalter) — Datenintegrität des vollen Speicherns

   Gilt für das, was im Release-Kandidaten AKTIV läuft, auch wenn alle WP-48-Schalter
   aus sind (CENTRIC_TEILSPEICHERUNG, _ABSCHLUSS_SEGMENTWEISE, _OHNE_SPERRE nicht
   gesetzt): neue Ablage (Kern + Monatsscherben), Voll-PUT mit zusammenfuehren
   (rechte.mjs) und Kette (kette.mjs, Abkürzungen an).

   Geprüft wird über den echten Handler mit Dateiablage:
   1. Fehlerfall = Abweisen statt Teilzustand: Jede Absage des Voll-PUT lässt die
      Platte (Kern, Scherben, Zeiger, Journal) unverändert — auch wenn die
      Übermittlung neben dem Verbotenen eine erlaubte Änderung enthält.
   2. Mandantengrenze: Ein Voll-PUT ändert nie die Daten eines zweiten Betriebs im
      Raum (ändern, Weglassen), für jede schreibende Rolle.
   3. Weglassen löscht nichts (Stempel, Ist-Zeiten, Abschluss).
   4. Die Schalter sind aus: Teilweg und Löschlauf antworten 404.

   Aufruf: npx vitest run pruefungen/wp48-9-aktiver-weg.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, G, Z, sitzungAnlegen, HEUTE, tag;
const kopie = (x) => JSON.parse(JSON.stringify(x));

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.49.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  PL: { rolle: "planer", person: "p1" },
  KU: { rolle: "kunde", person: null },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "m0" },
};

const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }],
  telefon: "0", email: `${id}@example.org` });

function betrieb(id, name) {
  const p = (n) => tag(n);
  const plan = {}; const ist = {}; const stempel = {};
  for (const pid of ["m0", "a1"]) {
    for (const n of [-40, -3, 2, 20]) plan[`${pid}|${p(n)}`] = n % 2 ? "F" : "N";
    for (const n of [-40, -3]) {
      ist[`${pid}|${p(n)}`] = { start: "06:00", ende: "14:05", bestaetigt: true, grund: "" };
      stempel[`${pid}|${p(n)}`] = { start: "05:58", ende: "14:05", quelle: "app" };
    }
  }
  const abgeschlossen = p(-40).slice(0, 7);
  return { id, name, branche: "pflege", bundesland: "BE", einheitLabel: "Wohnbereich", status: "aktiv", stichtag: null,
    laeuftAb: null, pakete: [], matrix: null, einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
      { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    zyklus: ["F", "F", "N", "N", "-", "-"], anker: "2026-01-05", zyklusLaenge: 6, gruppen: [], versatzTageVon: {},
    zuschlaege: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, rollennamen: {}, version: 9, stand: 1,
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("s1", "subplaner", "e1"),
      person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: plan, monatsabschluss: { [abgeschlossen]: { abgeschlossen: true, am: "2026-01-02T08:00:00.000Z", wer: "l1",
      verlauf: [{ id: "v1", art: "abschluss", am: "2026-01-02T08:00:00.000Z", wer: "l1", grund: "" }] } },
    istEingefroren: { [`m0|${p(-40)}`]: { d: "F", std: 7.5, e: 1 } }, planstaende: {}, freigaben: {},
    erfassung: ist, einstempeln: stempel, notizen: {}, tagesnotizen: {}, protokoll: [], abwesenheiten: [],
    anfragen: [], nachrichten: [], tarif: "basis", seit: "2026-01-01", bis: null, kontakt: "k@example.org" };
}

let raumNr = 0;
async function neuerRaum() {
  const raum = `wp48-9-${++raumNr}`;
  const b = { version: 9, stand: 1, mandanten: [betrieb("m1", "Haus"), betrieb("m2", "Fremdhaus")] };
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(b)), { durch: "Pruefung" });
  const token = {};
  for (const [k, r] of Object.entries(ROLLEN)) {
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}

/** Alles, was zum Bestand des Raums auf der Platte liegt (Kern, Scherben, Zeiger, Journal), mit Metadaten. */
async function platte(raum) {
  const s = laden();
  const aus = {};
  for (const vorsatz of ["stand:", "scherbe:", "kern:", "journal:", "bestand:"]) {
    const { blobs } = await s.list({ prefix: vorsatz });
    for (const b of blobs) {
      if (!b.key.includes(raum)) continue;
      const r = await s.getWithMetadata(b.key, { type: "json" });
      aus[b.key] = JSON.stringify([r && r.data, r && r.metadata]);
    }
  }
  return aus;
}

const holen = async (token) => { const g = await anfrage("/api/bestand", { token }); expect(g.status).toBe(200); return g; };
const put = (token, bestand, etag) => anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand, etag, durch: "Pruefung" } });
const eigener = (b) => b.mandanten.find((m) => m.id === "m1");

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp48-9-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  for (const k of ["CENTRIC_TEILSPEICHERUNG", "CENTRIC_ABSCHLUSS_SEGMENTWEISE", "CENTRIC_ABSCHLUSS_OHNE_SPERRE", "CENTRIC_KETTE_AUS"]) delete process.env[k];
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  G = await import("../server/lib/gestalt.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  Z = await import("../server/lib/zeiterfassung.mjs");
  HEUTE = Z.heuteBerlin();
  tag = (n) => Z.tagePlus(HEUTE, n);
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("WP-48.9 aktiver Weg: Fehlerfall = Abweisen, Platte unverändert", { timeout: 120000 }, () => {
  it("Vorbedingung: die Platte ist lesbar und nicht leer", async () => {
    const { raum } = await neuerRaum();
    expect(Object.keys(await platte(raum)).length).toBeGreaterThan(1);
  });

  const FAELLE = {
    "ohne ETag auf vorhandenem Bestand": { status: 409, aendern: () => {}, etag: () => undefined },
    "Stempel verändert (neben erlaubter Planänderung)": { status: 403, codes: ["STEMPEL_UNVERAENDERLICH"], rollen: ["LT", "PL", "KU"],
      aendern: (m) => { m.einstempeln[`m0|${tag(-3)}`].start = "01:00"; } },
    "Stempel gelöscht": { status: 403, codes: ["STEMPEL_UNVERAENDERLICH"], rollen: ["LT", "PL", "KU"],
      aendern: (m) => { m.einstempeln[`m0|${tag(-3)}`] = null; } },
    "Ist-Zeit im abgeschlossenen Monat geändert": { status: 403, codes: ["STEMPEL_UNVERAENDERLICH", "MONAT_ABGESCHLOSSEN"], rollen: ["LT", "PL", "KU"],
      aendern: (m) => { m.erfassung[`m0|${tag(-40)}`].ende = "22:00"; } },
    "eingefrorenes Ist im abgeschlossenen Monat geändert": { status: 403, codes: ["MONAT_ABGESCHLOSSEN"], rollen: ["LT", "PL", "KU"],
      aendern: (m) => { m.istEingefroren[`m0|${tag(-40)}`].std = 1; } },
    "neue Ist-Zeit im abgeschlossenen Monat angelegt": { status: 403, codes: ["STEMPEL_UNVERAENDERLICH", "MONAT_ABGESCHLOSSEN"], rollen: ["LT", "PL", "KU"],
      aendern: (m) => { m.erfassung[`a1|${tag(-39)}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "" }; } },
    "doppelte Betriebskennung": { status: 422, rollen: ["LT", "PL", "KU"],
      aendern: (m, b) => { b.mandanten.push(kopie(b.mandanten[0])); } },
  };
  for (const [name, f] of Object.entries(FAELLE)) {
    for (const k of f.rollen || ["LT"]) {
      it(`${name} (${k}) → ${f.status}, nichts geschrieben`, async () => {
        const { raum, token } = await neuerRaum();
        const g = await holen(token[k]);
        const b = kopie(g.bestand);
        /* Eine erlaubte Änderung daneben: Sie darf bei der Absage nicht „halb" stehen bleiben. */
        eigener(b).abweichungen[`a1|${tag(20)}`] = "N";
        eigener(b).abweichungen[`a1|${tag(2)}`] = "F";
        f.aendern(eigener(b), b);
        const vorher = await platte(raum);
        const p = await put(token[k], b, f.etag ? f.etag(g) : g.etag);
        expect(p.status, JSON.stringify(p).slice(0, 300)).toBe(f.status);
        if (f.codes) expect(f.codes).toContain(p.code);
        expect(await platte(raum)).toEqual(vorher);
      });
    }
  }

  it("veralteter ETag, dieselbe Zelle anders geändert → 409, nichts überschrieben", async () => {
    const { raum, token } = await neuerRaum();
    const g = await holen(token.LT);
    const jetzt = await B.bestandLesenStreng(laden(), raum);
    const fremd = kopie(jetzt.bestand);
    fremd.mandanten[0].abweichungen[`a1|${tag(3)}`] = "F";
    expect((await B.bestandSchreiben(laden(), raum, fremd, { erwarteterStand: jetzt.stand, durch: "Fremd" })).ok).toBe(true);
    const b = kopie(g.bestand); eigener(b).abweichungen[`a1|${tag(3)}`] = "N";
    const vorher = await platte(raum);
    const p = await put(token.LT, b, g.etag);
    expect(p.status).toBe(409);
    expect(await platte(raum)).toEqual(vorher);
    expect((await B.bestandLesenStreng(laden(), raum)).bestand.mandanten[0].abweichungen[`a1|${tag(3)}`]).toBe("F");
  });
});

describe("WP-48.9 aktiver Weg: Mandantengrenze und Weglassen", { timeout: 120000 }, () => {
  for (const k of ["LT", "PL", "KU"]) {
    it(`${k}: Änderung am fremden Betrieb und Weglassen des fremden Betriebs ändern ihn nicht`, async () => {
      const { raum, token } = await neuerRaum();
      const g = await holen(token[k]);
      const vorher = (await B.bestandLesenStreng(laden(), raum)).bestand.mandanten.find((m) => m.id === "m2");
      const b = kopie(g.bestand);
      eigener(b).abweichungen[`a1|${tag(20)}`] = "F";
      const fremd = b.mandanten.find((m) => m.id === "m2");
      if (fremd) { fremd.name = "Gekapert"; fremd.abweichungen[`a1|${tag(20)}`] = "F"; fremd.personen.pop(); fremd.einstempeln = {}; }
      const p = await put(token[k], b, g.etag);
      expect([200, 403, 422], JSON.stringify(p).slice(0, 200)).toContain(p.status);
      const nach = (await B.bestandLesenStreng(laden(), raum)).bestand;
      expect(nach.mandanten.find((m) => m.id === "m2")).toEqual(vorher);
      if (p.status === 200) expect(nach.mandanten.find((m) => m.id === "m1").abweichungen[`a1|${tag(20)}`]).toBe("F");

      /* Zweiter Versuch: den fremden Betrieb ganz weglassen. */
      const g2 = await holen(token[k]);
      const b2 = kopie(g2.bestand); b2.mandanten = b2.mandanten.filter((m) => m.id === "m1");
      eigener(b2).abweichungen[`a1|${tag(2)}`] = "N";
      await put(token[k], b2, g2.etag);
      const nach2 = (await B.bestandLesenStreng(laden(), raum)).bestand;
      expect(nach2.mandanten.find((m) => m.id === "m2")).toEqual(vorher);
    });
  }

  for (const k of ["LT", "PL", "KU"]) {
    it(`${k}: Weglassen von einstempeln, erfassung, Abschluss und eingefrorenem Ist löscht nichts`, async () => {
      const { raum, token } = await neuerRaum();
      const g = await holen(token[k]);
      const vorher = eigener((await B.bestandLesenStreng(laden(), raum)).bestand);
      const b = kopie(g.bestand);
      delete eigener(b).einstempeln; delete eigener(b).erfassung; delete eigener(b).monatsabschluss; delete eigener(b).istEingefroren;
      eigener(b).abweichungen[`a1|${tag(20)}`] = "F";
      const p = await put(token[k], b, g.etag);
      expect([200, 403, 422], JSON.stringify(p).slice(0, 200)).toContain(p.status);
      const nach = eigener((await B.bestandLesenStreng(laden(), raum)).bestand);
      for (const f of ["einstempeln", "erfassung", "monatsabschluss", "istEingefroren"]) expect(nach[f], f).toEqual(vorher[f]);
    });
  }
});

describe("WP-48.9 aktiver Weg: Schalter aus (Vorgabe)", { timeout: 120000 }, () => {
  it("Teilweg und Löschlauf: 404, Platte unverändert", async () => {
    const { raum, token } = await neuerRaum();
    await holen(token.LT);
    const vorher = await platte(raum);
    expect((await anfrage("/api/bestand/teile", { methode: "POST", token: token.LT, rumpf: { epoche: "x" } })).status).toBe(404);
    expect((await anfrage("/api/loeschlauf", { methode: "POST", token: token.LT, rumpf: { vorschau: true } })).status).toBe(404);
    expect(await platte(raum)).toEqual(vorher);
  });
});
