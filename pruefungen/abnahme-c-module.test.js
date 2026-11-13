/* ==========================================================================
   ABNAHME V4 STRANG C (Bereich 15) — Branchenmodule (WP-19) bleiben
   „geplant": kein Modul lässt sich über den echten Schreibweg einschalten
   oder wirksam machen, für keine Rolle, mit keinem manipulierten Rumpf

   Bisher: modulaktiv-allowlist.test.js (Registry, Allowlist) und
   modul-rechte-wp19.test.js (Schreibweg über rechte.mjs/zusammenfuehren).
   Hier dagegen der echte HTTP-Handler PUT /api/bestand (server/funktionen/
   daten.mjs) mit echten Sitzungen für Leitung, Kundenrolle, Planung,
   Schichtverantwortung, Beschäftigte und Betriebsrat. Je Rolle und je
   Manipulation:

     M1  alle zwölf Module { an: true } samt Mitbestimmungsbestätigung
     M2  wie M1, dazu alle Pakete gebucht und „status: freigegeben" im Eintrag
     M3  die Datenfelder aller Module (Posten, Wachbuch, Bereichsplan, …)
     M4  Schreibweisen und Prototyp-Namen (__proto__, constructor, „POSTEN",
         „posten ") als Modulkennung, als roher JSON-Text
     M5  vom Server verwaltete Felder (modulprotokoll, Löschvermerke)

   Danach gilt im GESPEICHERTEN Stand: kein Modul wirkt (modulAktiv false,
   Zustand „in-vorbereitung"), kein Schalter steht auf an, kein Modulfeld ist
   angekommen, die Pakete sind unverändert, das Modulprotokoll ist leer.
   Zusätzlich: ein Stand, in dem ein Schalter schon „an" steht (etwa nach dem
   Zurückspielen einer manipulierten Sicherung), macht kein Modul wirksam,
   und Moduldaten lassen sich trotzdem nicht schreiben.

   Nur synthetische Daten. Aufruf:
     npx vitest run pruefungen/abnahme-c-module.test.js --testTimeout=120000
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const PAKETE_ALLE = ["sicherheit", "pflege", "klinik", "industrie"];
const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" }, KD: { rolle: "kunde", person: "k1" }, PL: { rolle: "planer", person: "p1" },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" }, MA: { rolle: "mitarbeiter", person: "a1" }, BR: { rolle: "betriebsrat", person: "b1" },
};
let wurzel, laden, daten, B, BM, sitzungAnlegen;
let raumNr = 0, nr = 0;
const kopie = (x) => JSON.parse(JSON.stringify(x));
const tagPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const TAG = tagPlus(5);

const person = (id, rolle) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: rolle === "mitarbeiter" || rolle === "subplaner" ? "e1" : "ALLE",
  status: "aktiv", geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const grundbestand = (einstellungenExtra = {}) => ({ version: 9, mandanten: [{ id: "m1", name: "Testbetrieb", status: "aktiv", branche: "sonstiges",
  pakete: [], einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }], dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
  qualifikationen: [{ id: "pfk", name: "Pflegefachkraft", fachkraft: true }], einstellungen: { ruhezeit: 11, maxFolge: 6, ...einstellungenExtra },
  personen: [person("l1", "leitung"), person("k1", "kunde"), person("p1", "planer"), person("s1", "subplaner"), person("a1", "mitarbeiter"), person("b1", "betriebsrat")],
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] }] });

/* Datenfelder aller Module mit gültig aussehenden Werten. */
const MODULDATEN = {
  objekte: [{ id: "o1", name: "Objekt Nord", standortId: null, posten: [{ id: "po1", name: "Pforte", soll: { F: 1 }, qualifikationen: [] }] }],
  postenPlan: { [`a1|${TAG}`]: "po1" },
  wachbuch: [{ id: "w1", datum: TAG, uhrzeit: "08:15", objektId: "o1", art: "vorkommnis", text: "Probe", einheitId: "e1" }],
  bereichsPlan: { [`a1|${TAG}`]: "e1" },
  pflegeNiveaus: [{ id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: ["pfk"] }],
  bereitschaftStufen: [{ id: "B", name: "Stufe B", art: "bereitschaft", faktor: 0.25, quelle: "Tarif X § 12" }],
  bereitschaft: { [`a1|${TAG}`]: { stufe: "B", beginn: "16:00", ende: "08:00" } },
  funktionsbereiche: [{ id: "op", name: "OP", soll: { F: 1 }, qualifikationen: [] }],
  funktionsPlan: { [`a1|${TAG}`]: "op" },
  rotationen: { [`r1|${TAG}`]: { id: "r1", personId: "a1", art: "einsatz", einheitId: "e1", von: TAG, bis: tagPlus(10) } },
};

async function anfrage(token, { methode = "GET", rumpf, roh } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.77.${Math.floor(nr / 250) % 250}.${nr % 250}`, authorization: `Bearer ${token}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  const a = await daten(new Request(`http://${WIRT}/api/bestand`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: roh !== undefined ? roh : JSON.stringify(rumpf) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

async function neuerRaum(einstellungenExtra) {
  const raum = `abnahme-c-module-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, grundbestand(einstellungenExtra), { durch: "Abnahme C" });
  const t = {};
  for (const [k, r] of Object.entries(ROLLEN))
    t[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600_000)).token;
  return { raum, t };
}
const gespeichert = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];

/** Kein Modul wirkt, nichts Modulbezogenes ist angekommen. */
function nichtsWirkt(m, vorher, wo) {
  for (const x of BM.BRANCHENMODULE) {
    expect(BM.modulAktiv(m, x.id), `${wo}: ${x.id} wirkt`).toBe(false);
    expect(BM.modulZustand(m, x.id), `${wo}: ${x.id} Zustand`).toBe("in-vorbereitung");
  }
  const schalter = (m.einstellungen && m.einstellungen.branchenmodule) || {};
  expect(Object.entries(schalter).filter(([, v]) => v && v.an === true).map(([k]) => k), `${wo}: Schalter an`).toEqual(
    Object.entries((vorher.einstellungen && vorher.einstellungen.branchenmodule) || {}).filter(([, v]) => v && v.an === true).map(([k]) => k));
  expect(Object.prototype.hasOwnProperty.call(schalter, "__proto__") || Object.getPrototypeOf(schalter) !== Object.prototype, `${wo}: Prototyp`).toBe(false);
  expect(({}).an, `${wo}: Object.prototype verschmutzt`).toBeUndefined();
  for (const f of Object.keys(MODULDATEN)) expect(m[f], `${wo}: Modulfeld ${f}`).toEqual(vorher[f]);
  expect(m.pakete, `${wo}: Pakete`).toEqual(vorher.pakete);
  expect((m.einstellungen && m.einstellungen.modulprotokoll) || [], `${wo}: Modulprotokoll`).toEqual((vorher.einstellungen && vorher.einstellungen.modulprotokoll) || []);
  expect((m.einstellungen && m.einstellungen.moduldatenLoeschvermerke) || [], `${wo}: Löschvermerke`).toEqual((vorher.einstellungen && vorher.einstellungen.moduldatenLoeschvermerke) || []);
}

const alleAn = () => Object.fromEntries(BM.BRANCHENMODULE.map((x) => [x.id, { an: true, parameter: {},
  mitbestimmung: { bestaetigt: true, grundlage: "Betriebsvereinbarung 1/2026", bestaetigtAm: new Date().toISOString() } }]));

const MANIPULATIONEN = {
  "M1 alle Module an (mit Bestätigung)": (m) => { m.einstellungen = { ...(m.einstellungen || {}), branchenmodule: alleAn() }; },
  "M2 dazu alle Pakete und status freigegeben": (m) => {
    m.pakete = [...PAKETE_ALLE];
    m.einstellungen = { ...(m.einstellungen || {}), branchenmodule: Object.fromEntries(Object.entries(alleAn()).map(([k, v]) => [k, { ...v, status: "freigegeben", eingeschaltetAm: "2026-01-01T00:00:00.000Z" }])) };
  },
  "M3 Datenfelder aller Module": (m) => { Object.assign(m, kopie(MODULDATEN)); },
  "M3b Datenfelder und Schalter zugleich": (m) => { Object.assign(m, kopie(MODULDATEN)); m.einstellungen = { ...(m.einstellungen || {}), branchenmodule: alleAn() }; },
  "M5 Serverfelder (Protokoll, Löschvermerke)": (m) => {
    m.einstellungen = { ...(m.einstellungen || {}), modulprotokoll: [{ zeit: "2026-01-01T00:00:00.000Z", modul: "posten", an: true, wer: "l1" }],
      moduldatenLoeschvermerke: [{ modul: "wachbuch", zeit: "2026-01-01T00:00:00.000Z" }] };
  },
};

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-abnahme-c-module-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  BM = await import("../server/lib/branchenmodule.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("Registry: alle zwölf Module „geplant“ (Voraussetzung dieser Abnahme)", () => {
  it("zwölf Module, jedes „geplant“, keines wirksam", () => {
    expect(BM.BRANCHENMODULE).toHaveLength(12);
    for (const x of BM.BRANCHENMODULE) {
      expect(x.status, x.id).toBe("geplant");
      expect(BM.statusWirksam(x.status), x.id).toBe(false);
    }
  });
});

describe("Echter Schreibweg PUT /api/bestand: kein Modul wird wirksam — jede Rolle, jede Manipulation", { timeout: 300_000 }, () => {
  for (const [name, aendern] of Object.entries(MANIPULATIONEN)) {
    it(name, async () => {
      for (const k of Object.keys(ROLLEN)) {
        const { raum, t } = await neuerRaum();
        const vorher = kopie(await gespeichert(raum));
        const g = await anfrage(t[k]);
        expect(g.status, `${k} GET`).toBe(200);
        const b = kopie(g.bestand);
        aendern(b.mandanten[0]);
        const a = await anfrage(t[k], { methode: "PUT", rumpf: { bestand: b, etag: g.etag } });
        expect(a.status, `${k} ${name}: kein Serverfehler`).toBeLessThan(500);
        /* M5: diese Felder setzt der Server still auf den gespeicherten Stand zurück (branchenmoduleZusammen, „zurueck“) —
           200 ist dort richtig; maßgeblich ist der gespeicherte Stand (nichtsWirkt). */
        if ((k === "LT" || k === "KD") && !name.startsWith("M5")) expect(a.status, `${k} ${name}: Einschalten/Moduldaten abgewiesen — ${a.fehler}`).not.toBe(200);
        nichtsWirkt(await gespeichert(raum), vorher, `${k} ${name} (HTTP ${a.status})`);
      }
    });
  }

  it("M4 Schreibweisen und Prototyp-Namen als Modulkennung (roher JSON-Text)", async () => {
    for (const k of Object.keys(ROLLEN)) {
      for (const kennung of ["__proto__", "constructor", "prototype", "POSTEN", "posten ", " wachbuch", "Wachbuch", "toString", "hasOwnProperty"]) {
        const { raum, t } = await neuerRaum();
        const vorher = kopie(await gespeichert(raum));
        const g = await anfrage(t[k]);
        const b = kopie(g.bestand);
        b.mandanten[0].einstellungen = { ...(b.mandanten[0].einstellungen || {}), branchenmodule: { PLATZHALTER: 1 } };
        const roh = JSON.stringify({ bestand: b, etag: g.etag }).replace('"PLATZHALTER":1', `${JSON.stringify(kennung)}:{"an":true,"status":"freigegeben"}`);
        expect(roh).toContain(JSON.stringify(kennung));
        const a = await anfrage(t[k], { methode: "PUT", roh });
        expect(a.status, `${k} ${kennung}`).toBeLessThan(500);
        if (k === "LT") expect(a.status, `${k} ${kennung}: unbekanntes Modul abgewiesen`).not.toBe(200);
        nichtsWirkt(await gespeichert(raum), vorher, `${k} ${kennung} (HTTP ${a.status})`);
      }
    }
  });
});

describe("Gespeicherter Schalter „an“ (z. B. aus einer manipulierten Sicherung) macht nichts wirksam", { timeout: 120_000 }, () => {
  it("alle Schalter an und alle Pakete gebucht im Speicher: kein Modul wirkt, Moduldaten bleiben unschreibbar", async () => {
    const { raum, t } = await neuerRaum({ branchenmodule: Object.fromEntries(BM.BRANCHENMODULE.map((x) => [x.id, { an: true, eingeschaltetAm: "2026-01-01T00:00:00.000Z" }])) });
    const roh = await B.bestandLesen(laden(), raum);
    roh.bestand.mandanten[0].pakete = [...PAKETE_ALLE];
    await B.bestandSchreiben(laden(), raum, roh.bestand, { erwarteterStand: roh.stand, durch: "Abnahme C" });
    const m = await gespeichert(raum);
    for (const x of BM.BRANCHENMODULE) {
      expect(BM.modulAktiv(m, x.id), x.id).toBe(false);
      expect(BM.modulZustand(m, x.id), x.id).toBe("in-vorbereitung");
    }
    for (const k of ["LT", "KD", "PL"]) {
      const vorher = kopie(await gespeichert(raum));
      const g = await anfrage(t[k]);
      const b = kopie(g.bestand);
      Object.assign(b.mandanten[0], kopie(MODULDATEN));
      const a = await anfrage(t[k], { methode: "PUT", rumpf: { bestand: b, etag: g.etag } });
      expect(a.status, `${k}: ${a.fehler}`).not.toBe(200);
      const nach = await gespeichert(raum);
      for (const f of Object.keys(MODULDATEN)) expect(nach[f], `${k} ${f}`).toEqual(vorher[f]);
    }
  });
});
