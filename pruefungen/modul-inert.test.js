/* ==========================================================================
   PRÜFSATZ „MODUL-INERT“ — die zwölf Branchenmodule (WP-19) sind „geplant“ und
   bleiben es wirksam: kein Einschalten, kein Schreiben, keine Regelwerte, keine
   Befunde, keine Oberfläche, keine Buchbarkeit über einen Nebenweg.

   Betreiberentscheidung 24.11.: v4-r1/r2 dürfen ohne aktivierbare Zusatzmodule
   erscheinen, WENN die Module serverseitig wirksam abgeschaltet sind. Dieser
   Satz belegt das und sichert es dauerhaft ab (Audit 2026-11-24, P1–P13, P15).

   Die Matrix entsteht aus BRANCHENMODULE und ALTMODULE: ein neues Modul ist
   automatisch erfasst. Alles über die echten Handler (PUT /api/bestand,
   POST /api/bestand/teile, POST /api/bestand-anlegen, /api/import/*,
   /api/wiederherstellen, GET /api/bestand, GET /api/vollausgabe), echte
   Sitzungen für Leitung, Kundenrolle, Planung, Schichtverantwortung,
   Beschäftigte, Betriebsrat und Betreiber. Je Fall zwei Ausgangsstände:
     „frisch“  Betrieb ohne jedes Modulfeld, alle Pakete gebucht
     „daten“   Worst Case: alle Schalter „an“, alle Pakete gebucht, Daten aller
               Module und ein Altregelwert gespeichert (etwa aus einer
               manipulierten Sicherung)

   Nicht Teil dieses Satzes (eigene Pakete, im PR benannt):
     L-1 Website-Bau (P14), L-3 Erkennungslauf, L-4 Rechnungsprüfung (unten nur
     als it.todo und als dokumentierter Ist-Zustand), L-5 Pilotregel.

   Nur synthetische Daten, feste Tage (keine Uhr im Test). Aufruf:
     npm run pruefung:modulaktiv (enthält diesen Satz)
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRANCHENMODULE, modulAktiv, modulZustand, statusWirksam, MODULEINSTELLUNGEN_FELDER } from "../server/lib/branchenmodule.mjs";
import { ALTMODULE } from "../server/lib/modul-altwege.mjs";
import { MODUL_SCHREIBWEGE, pruefeModulSchreibwege } from "../server/lib/modulschreibwege.mjs";
import { branchenBefunde } from "../server/lib/branchenbefunde.mjs";
import { einteilungsBefunde } from "../server/lib/fachpruefung.mjs";
import { postenBefunde } from "../server/lib/modul-posten.mjs";
import { bereichsplanBefunde } from "../server/lib/modul-bereichsplan.mjs";
import { bereitschaftHoechstBefunde } from "../server/lib/modul-bereitschaftsdienst.mjs";
import { funktionsBefunde } from "../server/lib/modul-funktionsdienst.mjs";
import { geteilterdienstBefunde } from "../server/lib/modul-geteilterdienst.mjs";
import { anlagenBefunde } from "../server/lib/modul-anlagen.mjs";
import { maschinenqualBefunde } from "../server/lib/modul-maschinenqual.mjs";
import { rotationBefunde } from "../server/lib/modul-rotation.mjs";
import { oberflaechenFuer, EINHAENGEORTE } from "../src/module/index.js";
import { DEMO_KENNUNGEN } from "../server/lib/erstbefuellung.mjs";

const WIRT = "127.0.0.1:3000";
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAKETE_ALLE = ["sicherheit", "pflege", "klinik", "industrie"];
const TAG = "2026-12-07";
const TAG2 = "2026-12-08";
const EIN = "2026-01-01T00:00:00.000Z";
const kopie = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const hat = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const leer = (w) => w === undefined || w === null || (Array.isArray(w) && !w.length) || (typeof w === "object" && !Array.isArray(w) && !Object.keys(w).length);
const ALLE_FELDER = [...new Set(BRANCHENMODULE.flatMap((x) => x.datenfelder))];

/* --------------------------------------------------------------- Rollen */
const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" },
  KD: { rolle: "kunde", person: "k1" },
  PL: { rolle: "planer", person: "p1" },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  MA: { rolle: "mitarbeiter", person: "a1" },
  BR: { rolle: "betriebsrat", person: "b1" },
  BT: { rolle: "betreiber", person: null },
};
const ROLLEN_NAMEN = Object.keys(ROLLEN);
/** Rollen mit org.edit: ihr Versuch muss ausdrücklich abgewiesen werden (nicht nur still verworfen). */
const MIT_ORGEDIT = ["LT", "KD"];
/** Rollen, die bis zur Modulwache durchdringen und dort 403 bekommen. */
const MIT_SCHREIBRECHT = ["LT", "KD", "PL"];

/* --------------------------------------------------------------- Stände */
const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv", geburtstag: "1980-01-01",
  qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit === "ALLE" ? "e1" : einheit }] });

/** Daten aller zwölf Module mit gültig aussehenden Werten (Datenfelder der Registry). */
const PROBE = {
  objekte: () => [{ id: "o1", name: "Objekt Nord", standortId: null, posten: [{ id: "po1", name: "Pforte", soll: { F: 1 }, qualifikationen: [] }] }],
  postenPlan: () => ({ [`a1|${TAG}`]: "po1" }),
  wachbuch: () => [{ id: "w1", datum: TAG, uhrzeit: "08:15", objektId: "o1", art: "vorkommnis", text: "Probe", einheitId: "e1" }],
  bereichsPlan: () => ({ [`a1|${TAG}`]: "b1" }),
  pflegeNiveaus: () => [{ id: "n-fk", name: "Fachkraft", gruppe: "fachkraft", versorgung: null, qualifikationen: ["pfk"] }],
  bereitschaftStufen: () => [{ id: "B", name: "Stufe B", art: "bereitschaft", faktor: 0.25, quelle: "Tarif X § 12" }],
  bereitschaft: () => ({ [`a1|${TAG}`]: { stufe: "B", beginn: "16:00", ende: "08:00" } }),
  funktionsbereiche: () => [{ id: "op", name: "OP", soll: { F: 1 }, qualifikationen: [] }],
  funktionsPlan: () => ({ [`a1|${TAG}`]: "op" }),
  rotationen: () => ({ [`r1|${TAG}`]: { id: "r1", personId: "a1", art: "einsatz", einheitId: "e1", von: TAG, bis: TAG2 } }),
};
/** Ein neues Datenfeld ohne eigene Sonde bekommt diese allgemeine (es soll trotzdem abgewiesen werden). */
const SONDE_ALLGEMEIN = () => ({ [`a1|${TAG}`]: "x1" });

/** Aus dem Wert (oder der Sonde) etwas anderes machen — gleichgültig, wie das Feld gefüllt ist. */
function anders(m, f) {
  const cur = m[f];
  if (cur === undefined || cur === null || leer(cur)) return kopie((PROBE[f] || SONDE_ALLGEMEIN)());
  if (Array.isArray(cur)) {
    const letzt = cur[cur.length - 1];
    return [...cur, letzt && typeof letzt === "object" ? { ...letzt, id: "zz9" } : "zz9"];
  }
  if (typeof cur === "object") return { ...cur, [`a2|${TAG2}`]: Object.values(cur)[0] ?? "x" };
  return "zz9";
}

/** Altdaten der fünf älteren Module (außerhalb der Registry-Datenfelder) — wie in modul-b1-schreibweg.test.js. */
const ALT_TEILE = () => ({
  bereiche: [{ id: "b1", name: "Bereich Alt", soll: { F: 1 } }, { id: "b2", name: "Bereich Zwei", soll: { F: 1 } }],
  geteilt: { id: "GA", name: "Geteilt Alt", start: "06:00", ende: "10:00", zweiterAbschnitt: { start: "15:00", ende: "19:00" }, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } },
  anlage: { id: "bm1", art: "anlage", name: "Presse Alt", personId: null, mindestBesetzung: { F: 1 },
    laufzeit: { wochentage: [true, true, true, true, true, false, false], ausnahmen: [] } },
  kompetenz: { id: "k-alt", name: "Bedienung Presse Alt", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 12, befaehigtePerson: false,
    stufe: "", freigabeStelle: "", grundlage: "", pflichtFuer: [], zugedacht: [] },
});

/** @param {{ daten: boolean, pakete?: string[] }} o */
function grundbestand({ daten, pakete = PAKETE_ALLE }) {
  const alt = ALT_TEILE();
  /** @type {any} */
  const m = { id: "m1", name: "Testbetrieb", status: "aktiv", branche: "sonstiges", pakete: [...pakete],
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }],
    qualifikationen: [{ id: "pfk", name: "Pflegefachkraft", fachkraft: true }],
    zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05",
    einstellungen: { ruhezeit: 11, maxFolge: 6 },
    betriebsmittel: [{ id: "bm2", art: "schluessel", name: "Tor", personId: null }],
    personen: [person("l1", "leitung", "ALLE"), person("k1", "kunde", "ALLE"), person("p1", "planer", "ALLE"), person("s1", "subplaner", "e1"),
      person("a1", "mitarbeiter", "e1"), person("a2", "mitarbeiter", "e1"), person("b1", "betriebsrat", "ALLE")],
    abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] };
  if (daten) {
    for (const f of ALLE_FELDER) m[f] = kopie((PROBE[f] || SONDE_ALLGEMEIN)());
    m.einheiten[0].bereiche = alt.bereiche;
    m.dienstarten.push(alt.geteilt);
    m.betriebsmittel.push(alt.anlage);
    m.kompetenzen = [alt.kompetenz];
    m.einstellungen.branchenmodule = Object.fromEntries(BRANCHENMODULE.map((x) => [x.id, { an: true, eingeschaltetAm: EIN,
      ...(Object.keys(x.parameter).length ? { parameter: Object.fromEntries(Object.entries(x.parameter).map(([k, s]) => [k, s.min ?? 1])) } : {}) }]));
    m.einstellungen.regelwerte = { "POSTEN-QUAL-01": { stufe: "hinweis", pruefstatus: "vorlaeufig", quelle: "Altwert", geaendertAm: EIN, geaendertVon: "x" } };
  }
  return { version: 9, stand: 1, mandanten: [m] };
}

/** Die Modulteile eines gespeicherten Betriebs: Registry-Datenfelder, Altteile, Einstellungen, Pakete. */
function modulSicht(m) {
  const e = (m && m.einstellungen) || {};
  return {
    felder: Object.fromEntries(ALLE_FELDER.map((f) => [f, m[f] === undefined ? null : m[f]])),
    bereiche: (m.einheiten || []).map((x) => [x.id, x.bereiche || null]),
    zweiter: (m.dienstarten || []).map((d) => [d.id, d.zweiterAbschnitt || null]),
    anlagen: (m.betriebsmittel || []).filter((x) => x && x.art === "anlage"),
    kompetenzen: (m.kompetenzen || []).filter((k) => k && (k.betriebsmittelId === "bm1" || k.befaehigtePerson !== undefined)),
    einstellungen: Object.fromEntries(MODULEINSTELLUNGEN_FELDER.map((f) => [f, e[f] === undefined ? null : e[f]])),
    pakete: m.pakete || [],
  };
}
/** Ohne jede Moduldaten und Moduleinstellungen (frischer oder neu angelegter Betrieb). */
function keineModuldaten(m, wo) {
  for (const f of ALLE_FELDER) expect(leer(m[f]), `${wo}: Datenfeld ${f}`).toBe(true);
  expect((m.einheiten || []).filter((x) => x.bereiche), `${wo}: Bereiche`).toEqual([]);
  expect((m.dienstarten || []).filter((d) => d.zweiterAbschnitt), `${wo}: zweiter Abschnitt`).toEqual([]);
  expect((m.betriebsmittel || []).filter((x) => x && x.art === "anlage"), `${wo}: Anlagen`).toEqual([]);
  expect((m.kompetenzen || []).filter((k) => k && (k.betriebsmittelId === "bm1" || k.befaehigtePerson !== undefined)), `${wo}: Maschinenkompetenzen`).toEqual([]);
  const e = m.einstellungen || {};
  for (const f of MODULEINSTELLUNGEN_FELDER) expect(leer(e[f]), `${wo}: Einstellung ${f}`).toBe(true);
}
function nichtsWirkt(m, wo) {
  for (const x of BRANCHENMODULE) {
    expect(modulAktiv(m, x.id), `${wo}: ${x.id} wirkt`).toBe(false);
    expect(modulZustand(m, x.id), `${wo}: ${x.id} Zustand`).toBe("in-vorbereitung");
  }
}

/* --------------------------------------------------------------- Server */
let wurzel, laden, daten, imp, B, sitzungAnlegen, kontoSchreiben, ablageSchluessel;
let nr = 0;
let raumNr = 0;

async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.88.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
async function importSchritt(token, weg, rumpf, { roh, kopfExtra } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.89.${Math.floor(nr / 250) % 250}.${nr % 250}`,
    authorization: `Bearer ${token}`, ...(kopfExtra || {}) };
  if (!roh) kopf["content-type"] = "application/json";
  const a = await imp(new Request(`http://${WIRT}/api/import/${weg}`, { method: "POST", headers: kopf, body: roh || JSON.stringify(rumpf) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

/** Ein Raum mit Stand und Sitzungen für alle Rollen. */
async function neuerRaum(o) {
  const name = `modul-inert-${++raumNr}`;
  await B.bestandSchreiben(laden(), name, grundbestand(o), { durch: "Pruefung" });
  const t = {};
  for (const [k, r] of Object.entries(ROLLEN))
    t[k] = (await sitzungAnlegen({ bestand: name, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
  return { name, t };
}
const gespeichertM = async (name) => (await B.bestandLesenStreng(laden(), name)).bestand.mandanten[0];

/** PUT /api/bestand: GET, den Betrieb m1 verändern, schicken. */
async function putAendern(token, fn) {
  const g = await anfrage("/api/bestand", { token });
  const b = kopie(g.bestand || { mandanten: [{ id: "m1" }] });
  const m = b.mandanten.find((x) => x && x.id === "m1") || b.mandanten[0];
  fn(m, b);
  return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-modul-inert-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  /* Die beiden Server-Schalter ein: P5 (Teilweg) und P8 (Import) prüfen die eingeschalteten Wege. */
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  process.env.CENTRIC_IMPORT_AKTIV = "true";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  imp = (await import("../server/funktionen/import.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
}, 120000);
afterAll(async () => {
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  delete process.env.CENTRIC_IMPORT_AKTIV;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

/* ======================================================================== */
describe("Voraussetzung: die Registry — zwölf Module, jedes „geplant“, keines wirksam", () => {
  it("zwölf Module (Pflichtumfang WP-19), jedes „geplant“, kein Status wirksam", () => {
    expect(BRANCHENMODULE).toHaveLength(12);
    for (const x of BRANCHENMODULE) {
      expect(x.status, x.id).toBe("geplant");
      expect(statusWirksam(x.status), x.id).toBe(false);
    }
  });
  it("jedes Altmodul ist ein Registry-Modul", () => {
    for (const a of ALTMODULE) expect(BRANCHENMODULE.some((x) => x.id === a.modul), a.modul).toBe(true);
  });
});

/* ======================================================================== */
/* Manipulationen für P1/P5: Datenfelder der Registry und Teile der Altmodule. */
const ALT_AENDERUNG = {
  posten: [],                                                                  // objekte/postenPlan: Registry-Datenfelder (oben)
  bereichsplan: [["Bereiche an der Einheit", (m) => { m.einheiten = [...(m.einheiten || [])]; m.einheiten[1] = { ...m.einheiten[1], bereiche: [{ id: "b9", name: "Bereich Neu", soll: { F: 1 } }] }; }]],
  geteilterdienst: [["zweiter Abschnitt", (m) => { m.dienstarten = [...(m.dienstarten || []), { id: "GN", name: "Geteilt Neu", start: "07:00", ende: "11:00",
    zweiterAbschnitt: { start: "16:00", ende: "20:00" }, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }]; }]],
  anlagen: [["Anlage", (m) => { m.betriebsmittel = [...(m.betriebsmittel || []), { id: "bm9", art: "anlage", name: "Presse Neu", personId: null, mindestBesetzung: { F: 2 },
    laufzeit: { wochentage: [true, true, true, true, true, false, false], ausnahmen: [] } }]; }]],
  maschinenqual: [["Maschinenkompetenz", (m) => { m.kompetenzen = [...(m.kompetenzen || []), { id: "k-neu", name: "Befähigt Presse", art: "geraet", betriebsmittelId: "bm1",
    wiederholungMonate: 12, befaehigtePerson: true, stufe: "", freigabeStelle: "", grundlage: "", pflichtFuer: [], zugedacht: [] }]; }]],
};
const ALT_ENTFERNEN = {
  bereichsplan: [["Bereiche entfernen", (m) => { m.einheiten = (m.einheiten || []).map((e) => { const { bereiche: _b, ...o } = e; void _b; return o; }); }]],
  geteilterdienst: [["zweiten Abschnitt entfernen", (m) => { m.dienstarten = (m.dienstarten || []).map((d) => (d.id === "GA" ? { ...d, zweiterAbschnitt: null } : d)); }]],
  anlagen: [["Anlage entfernen", (m) => { m.betriebsmittel = (m.betriebsmittel || []).filter((x) => x.id !== "bm1"); }]],
  maschinenqual: [["Maschinenkompetenz entfernen", (m) => { m.kompetenzen = (m.kompetenzen || []).filter((k) => k.id !== "k-alt"); }]],
};

/** Alle Schreibversuche auf Moduldaten: je Registry-Datenfeld ändern/entfernen, je Altmodul seine Teile. */
function datenManipulationen() {
  const l = [];
  for (const x of BRANCHENMODULE) for (const f of x.datenfelder) {
    l.push({ name: `${x.id}.${f} ändern`, modul: x.id, feld: f, fn: (m) => { m[f] = anders(m, f); } });
    l.push({ name: `${x.id}.${f} entfernen`, modul: x.id, feld: f, nurMitDaten: true, fn: (m) => { delete m[f]; } });
  }
  for (const a of ALTMODULE) {
    const aen = ALT_AENDERUNG[a.modul], ent = ALT_ENTFERNEN[a.modul];
    if (!aen) { l.push({ name: `${a.modul}: Altmodul ohne Sonde in diesem Satz`, modul: a.modul, fehlt: true }); continue; }
    for (const [n, fn] of aen) l.push({ name: `${a.modul}: ${n} ändern`, modul: a.modul, fn });
    for (const [n, fn] of ent || []) l.push({ name: `${a.modul}: ${n}`, modul: a.modul, nurMitDaten: true, fn });
  }
  return l;
}

/* Aufwand: Ein Schreibversuch kostet über den echten Handler rund eine halbe Sekunde. Darum je Rolle ein eigener Fall
   (unter dem Zeitlimit), und die teuersten Matrizen nur für die Rollen, die das Recht haben könnten (Leitung, Kunde, Planung)
   plus je einen Stellvertreter ohne Recht (Beschäftigte) und den Betreiber; die Rollen Schichtverantwortung und Betriebsrat
   laufen in P1/P2 voll mit. */
const ROLLEN_VOLL = ROLLEN_NAMEN;
const ROLLEN_KURZ = ["LT", "KD", "PL", "MA", "BT"];

describe("P1 — PUT /api/bestand: Moduldaten aller Module bleiben unveränderlich", { timeout: 300000 }, () => {
  const man = datenManipulationen();
  it("jedes Altmodul hat in diesem Satz eine Sonde (neues Altmodul → Sonde ergänzen)", () => {
    expect(man.filter((x) => x.fehlt).map((x) => x.name)).toEqual([]);
  });
  for (const [variante, rollen] of [["frisch", ["LT", "MA"]], ["daten", ROLLEN_VOLL]]) for (const k of rollen) {
    it(`Ausgangsstand „${variante}“, Rolle ${k}: alle Änderungen (${man.length}) — gespeicherter Stand gleich${MIT_SCHREIBRECHT.includes(k) ? ", jedes Mal 403" : ""}`, async () => {
      const { name, t } = await neuerRaum({ daten: variante === "daten" });
      const vorher = modulSicht(await gespeichertM(name));
      for (const x of man) {
        if (x.fehlt || (x.nurMitDaten && (variante !== "daten" || k !== "LT"))) continue;
        const r = await putAendern(t[k], x.fn);
        const wo = `${variante} ${x.name} ${k} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 100)}`;
        expect(r.status, wo).toBeLessThan(500);
        if (MIT_SCHREIBRECHT.includes(k)) expect(r.status, wo).toBe(403);
        expect(modulSicht(await gespeichertM(name)), wo).toEqual(vorher);
      }
    });
  }
});

/* ======================================================================== */
describe("P2 — PUT: Schalter, Status und eingeschaltetAm lassen kein Modul wirken", { timeout: 300000 }, () => {
  const bestaetigung = () => ({ bestaetigt: true, grundlage: "Betriebsvereinbarung 1/2026" });
  /** Wert je Variante; im Stand „daten“ stehen die Schalter schon auf an — dort wird ein anderer Wert geschickt (Parameter leer). */
  const VARIANTEN = {
    "an mit Bestätigung": () => ({ an: true, mitbestimmung: bestaetigung() }),
    "an mit eingeschaltetAm": () => ({ an: true, eingeschaltetAm: "2026-02-02T00:00:00.000Z", mitbestimmung: bestaetigung() }),
    "an mit status freigegeben": () => ({ an: true, status: "freigegeben", mitbestimmung: bestaetigung() }),
    "an mit status vorlaeufig": () => ({ an: true, status: "vorlaeufig", eingeschaltetAm: EIN }),
  };
  const schalterSetzen = (ids, w) => (m) => {
    m.einstellungen = { ...(m.einstellungen || {}), branchenmodule: { ...((m.einstellungen && m.einstellungen.branchenmodule) || {}),
      ...Object.fromEntries(ids.map((id) => [id, { ...w(), parameter: {} }])) } };
    m.pakete = [...PAKETE_ALLE];
  };
  for (const variante of ["frisch", "daten"]) for (const k of ROLLEN_VOLL) {
    it(`Ausgangsstand „${variante}“, Rolle ${k}: alle Module zugleich × ${Object.keys(VARIANTEN).length} Varianten — nie wirksam, nichts gespeichert${MIT_ORGEDIT.includes(k) ? " (Leitung/Kunde: 403)" : ""}`, async () => {
      const { name, t } = await neuerRaum({ daten: variante === "daten" });
      const vorher = modulSicht(await gespeichertM(name));
      for (const [vn, w] of Object.entries(VARIANTEN)) {
        const r = await putAendern(t[k], schalterSetzen(BRANCHENMODULE.map((x) => x.id), w));
        const wo = `${variante} alle ${vn} ${k} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 100)}`;
        expect(r.status, wo).toBeLessThan(500);
        if (variante === "frisch" && MIT_ORGEDIT.includes(k)) expect(r.status, wo).toBe(403);
        const nach = await gespeichertM(name);
        expect(modulSicht(nach), wo).toEqual(vorher);
        nichtsWirkt(nach, wo);
      }
    });
  }
  it("Leitung: jedes Modul einzeln (Bestätigung, eingeschaltetAm, Status) auf dem frischen Stand — 403, nie wirksam", async () => {
    const { name, t } = await neuerRaum({ daten: false });
    const vorher = modulSicht(await gespeichertM(name));
    for (const x of BRANCHENMODULE) for (const [vn, w] of Object.entries(VARIANTEN)) {
      const r = await putAendern(t.LT, schalterSetzen([x.id], w));
      const wo = `${x.id} ${vn} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 100)}`;
      expect(r.status, wo).toBe(403);
      const nach = await gespeichertM(name);
      expect(modulSicht(nach), wo).toEqual(vorher);
      nichtsWirkt(nach, wo);
    }
  });
});

/* ======================================================================== */
describe("P3/P4 — Regelwerte und Parameter zu Regeln und Modulen, die nicht wirken (Lücke L-2)", { timeout: 300000 }, () => {
  const REGELN = BRANCHENMODULE.flatMap((x) => x.regelIds.map((id) => [x.id, id]));
  const WERT_ACHTUNG = () => ({ wert: 1, stufe: "achtung", pruefstatus: "geprueft", quelle: "Quelle X", fundstelle: "§ 1", version: "2026", gueltigAb: "2026-01-01" });
  const WERT_HINWEIS = () => ({ wert: 1, stufe: "hinweis", pruefstatus: "vorlaeufig", quelle: "Quelle X" });
  const rw = (id, w) => (m) => { m.einstellungen = { ...(m.einstellungen || {}), regelwerte: { ...((m.einstellungen && m.einstellungen.regelwerte) || {}), [id]: w } }; };
  const rwAlle = (w) => (m) => { m.einstellungen = { ...(m.einstellungen || {}), regelwerte: { ...((m.einstellungen && m.einstellungen.regelwerte) || {}), ...Object.fromEntries(REGELN.map(([, id]) => [id, w()])) } }; };

  it("die Registry führt Regeln (sonst prüft P3 nichts)", () => { expect(REGELN.length).toBeGreaterThan(0); });

  for (const variante of ["frisch", "daten"]) {
    for (const k of MIT_ORGEDIT) it(`P3 Ausgangsstand „${variante}“, Rolle ${k}: jede Regel jedes Moduls, geprüft/achtung und hinweis/vorläufig — 403, Stand und Protokoll gleich`, async () => {
      const { name, t } = await neuerRaum({ daten: variante === "daten" });
      const vorher = modulSicht(await gespeichertM(name));
      for (const [modul, id] of REGELN) for (const [wn, w] of [["achtung/geprüft", WERT_ACHTUNG], ["hinweis/vorläufig", WERT_HINWEIS]]) {
        const r = await putAendern(t[k], rw(id, w()));
        const wo = `${variante} ${modul}/${id} ${wn} ${k} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 100)}`;
        expect(r.status, wo).toBe(403);
        expect(modulSicht(await gespeichertM(name)), wo).toEqual(vorher);
      }
    });
    for (const k of ROLLEN_VOLL.filter((x) => !MIT_ORGEDIT.includes(x))) it(`P3 Ausgangsstand „${variante}“, Rolle ${k}: alle Regelwerte zugleich — nichts gespeichert`, async () => {
      const { name, t } = await neuerRaum({ daten: variante === "daten" });
      const vorher = modulSicht(await gespeichertM(name));
      for (const w of [WERT_ACHTUNG, WERT_HINWEIS]) {
        const r = await putAendern(t[k], rwAlle(w));
        expect(r.status, `${variante} ${k}`).toBeLessThan(500);
        expect(modulSicht(await gespeichertM(name)), `${variante} ${k} → ${r.status}`).toEqual(vorher);
      }
    });
  }

  it("P3 alle Regelwerte zugleich (Leitung): 403 und Protokoll gleich — kein Teil geht durch", async () => {
    const { name, t } = await neuerRaum({ daten: false });
    const vorher = modulSicht(await gespeichertM(name));
    const r = await putAendern(t.LT, rwAlle(WERT_ACHTUNG));
    expect(r.status).toBe(403);
    const nach = await gespeichertM(name);
    expect(modulSicht(nach)).toEqual(vorher);
    expect((nach.einstellungen && nach.einstellungen.modulprotokoll) || []).toEqual([]);
  });

  it("P3 eine unbekannte Regel bleibt abgewiesen (403, unverändert)", async () => {
    const { name, t } = await neuerRaum({ daten: false });
    const vorher = modulSicht(await gespeichertM(name));
    const r = await putAendern(t.LT, rw("GIBT-ES-NICHT-01", WERT_HINWEIS()));
    expect(r.status).toBe(403);
    expect(modulSicht(await gespeichertM(name))).toEqual(vorher);
  });

  it("P3 Entfernen (null) eines Altwerts geht weiter: 200, Wert weg, Protokolleintrag „regelwert-entfernt“", async () => {
    for (const k of MIT_ORGEDIT) {
      const { name, t } = await neuerRaum({ daten: true });
      const r = await putAendern(t[k], rw("POSTEN-QUAL-01", null));
      expect(r.status, `${k} ${r.text || r.fehler}`).toBe(200);
      const nach = await gespeichertM(name);
      expect(hat(nach.einstellungen.regelwerte || {}, "POSTEN-QUAL-01"), k).toBe(false);
      expect((nach.einstellungen.modulprotokoll || []).some((e) => e.art === "regelwert-entfernt" && e.regelId === "POSTEN-QUAL-01"), k).toBe(true);
    }
  });

  it("P3 ein unverändert zurückgeschickter Altwert sperrt das Speichern nicht (200, Wann/Wer bleiben)", async () => {
    const { name, t } = await neuerRaum({ daten: true });
    const vorher = (await gespeichertM(name)).einstellungen.regelwerte;
    const r = await putAendern(t.LT, (m) => { m.abweichungen = { ...(m.abweichungen || {}), [`a1|${TAG}`]: "F" }; });
    expect(r.status, String(r.text || r.fehler)).toBe(200);
    expect((await gespeichertM(name)).einstellungen.regelwerte).toEqual(vorher);
  });

  /* P4: Parameter */
  const MIT_PARAMETER = BRANCHENMODULE.filter((x) => Object.keys(x.parameter).length);
  it("die Registry führt Module mit Parametern (sonst prüft P4 nichts)", () => { expect(MIT_PARAMETER.length).toBeGreaterThan(0); });
  const parameterAnders = (x) => Object.fromEntries(Object.entries(x.parameter).map(([k, s]) => [k, s.max]));

  for (const k of ROLLEN_KURZ) it(`P4 Rolle ${k}: Parameter am gespeicherten Eintrag (an und aus) ändern — Stand gleich${MIT_ORGEDIT.includes(k) ? ", 403" : ""}`, async () => {
    const { name, t } = await neuerRaum({ daten: true });
    const vorher = modulSicht(await gespeichertM(name));
    for (const x of (MIT_ORGEDIT.includes(k) ? MIT_PARAMETER : MIT_PARAMETER.slice(0, 1))) for (const an of [true, false]) {
      const r = await putAendern(t[k], (m) => {
        m.einstellungen = { ...(m.einstellungen || {}), branchenmodule: { ...((m.einstellungen || {}).branchenmodule || {}), [x.id]: { an, eingeschaltetAm: EIN, parameter: parameterAnders(x) } } };
      });
      const wo = `${x.id} an=${an} ${k} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 100)}`;
      expect(r.status, wo).toBeLessThan(500);
      if (MIT_ORGEDIT.includes(k)) expect(r.status, wo).toBe(403);
      expect(modulSicht(await gespeichertM(name)), wo).toEqual(vorher);
    }
  });

  it("P4 Parameter an einem Eintrag { an: false } (Altstand): 403, Stand gleich", async () => {
    const stand = grundbestand({ daten: false });
    stand.mandanten[0].einstellungen.branchenmodule = Object.fromEntries(MIT_PARAMETER.map((x) => [x.id, { an: false, eingeschaltetAm: EIN,
      parameter: Object.fromEntries(Object.entries(x.parameter).map(([k, s]) => [k, s.min ?? 1])) }]));
    const name = `modul-inert-aus-${++raumNr}`;
    await B.bestandSchreiben(laden(), name, stand, { durch: "Pruefung" });
    const token = (await sitzungAnlegen({ bestand: name, name: "V l1", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
    const vorher = modulSicht(await gespeichertM(name));
    for (const x of MIT_PARAMETER) {
      const r = await putAendern(token, (m) => {
        m.einstellungen = { ...(m.einstellungen || {}), branchenmodule: { ...((m.einstellungen || {}).branchenmodule || {}), [x.id]: { an: false, parameter: parameterAnders(x) } } };
      });
      expect(r.status, `${x.id} ${r.text || r.fehler}`).toBe(403);
      expect(modulSicht(await gespeichertM(name)), x.id).toEqual(vorher);
    }
  });

  it("P4 Ausschalten ohne Parameteränderung und unverändert Zurückgeschicktes bleiben möglich", async () => {
    const { name, t } = await neuerRaum({ daten: true });
    const r1 = await putAendern(t.LT, () => { /* nichts ändern: der Betrieb kommt so zurück, wie er gespeichert ist */ });
    expect(r1.status, String(r1.text || r1.fehler)).toBe(200);
    const r2 = await putAendern(t.LT, (m) => {
      m.einstellungen = { ...(m.einstellungen || {}), branchenmodule: { ...((m.einstellungen || {}).branchenmodule || {}), posten: { an: false } } };
    });
    expect(r2.status, String(r2.text || r2.fehler)).toBe(200);
    expect((await gespeichertM(name)).einstellungen.branchenmodule.posten.an).toBe(false);
  });
});

/* ======================================================================== */
describe("P5 — POST /api/bestand/teile (Teilweg an): Moduldaten bleiben unveränderlich", { timeout: 300000 }, () => {
  const FELDER = [...ALLE_FELDER, "einheiten", "dienstarten", "betriebsmittel", "kompetenzen"];
  const kernWert = (f, grund) => {
    if (ALLE_FELDER.includes(f)) return anders({ [f]: grund }, f);
    if (f === "einheiten") return (grund || []).map((e) => ({ ...e, bereiche: [{ id: "b9", name: "Neu", soll: { F: 1 } }] }));
    if (f === "dienstarten") return [...(grund || []), { id: "GN", name: "Geteilt Neu", start: "07:00", ende: "11:00", zweiterAbschnitt: { start: "16:00", ende: "20:00" }, mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 } }];
    if (f === "betriebsmittel") return [...(grund || []), { id: "bm9", art: "anlage", name: "Presse Neu", personId: null, mindestBesetzung: { F: 2 }, laufzeit: { wochentage: [true, true, true, true, true, false, false], ausnahmen: [] } }];
    return [...(grund || []), { id: "k-neu", name: "Neu", art: "geraet", betriebsmittelId: "bm1", wiederholungMonate: 12, befaehigtePerson: true, stufe: "", freigabeStelle: "", grundlage: "", pflichtFuer: [], zugedacht: [] }];
  };
  for (const [variante, rollen] of [["frisch", ["LT", "MA"]], ["daten", ROLLEN_KURZ]]) for (const k of rollen) {
    it(`Ausgangsstand „${variante}“, Rolle ${k}: Registry-Datenfelder und Altteile als Kernsegmente — gespeicherter Stand gleich`, async () => {
      const { name, t } = await neuerRaum({ daten: variante === "daten" });
      const vorher = modulSicht(await gespeichertM(name));
      const g = await anfrage("/api/bestand", { token: t[k] });
      const m = g.bestand && g.bestand.mandanten ? g.bestand.mandanten.find((x) => x && x.id === "m1") : null;
      const versionen = (g.teile && g.teile.versionen) || {};
      for (const f of FELDER) {
        const r = await anfrage("/api/bestand/teile", { methode: "POST", token: t[k],
          rumpf: { format: 1, epoche: g.teile ? g.teile.epoche : "x", durch: "Pruefung", kern: { [f]: { basis: versionen[`kern:${f}`] ?? null, wert: kernWert(f, m ? m[f] : undefined) } } } });
        const wo = `${variante} Kern ${f} ${k} → ${r.status} ${String(r.text || r.fehler || "").slice(0, 100)}`;
        expect(r.status, wo).toBeLessThan(500);
        if (MIT_ORGEDIT.includes(k)) expect(r.status, wo).not.toBe(200);
        expect(modulSicht(await gespeichertM(name)), wo).toEqual(vorher);
      }
    });
  }
  it("Teilweg: Schalter an im Kern (einstellungen) wirkt nicht", async () => {
    const { name, t } = await neuerRaum({ daten: false });
    const vorher = modulSicht(await gespeichertM(name));
    for (const k of ROLLEN_KURZ) {
      const g = await anfrage("/api/bestand", { token: t[k] });
      const m = g.bestand && g.bestand.mandanten ? g.bestand.mandanten.find((x) => x && x.id === "m1") : null;
      const versionen = (g.teile && g.teile.versionen) || {};
      const einst = { ...((m && m.einstellungen) || {}), branchenmodule: Object.fromEntries(BRANCHENMODULE.map((x) => [x.id, { an: true, eingeschaltetAm: EIN }])) };
      const r = await anfrage("/api/bestand/teile", { methode: "POST", token: t[k],
        rumpf: { format: 1, epoche: g.teile ? g.teile.epoche : "x", durch: "Pruefung", kern: { einstellungen: { basis: versionen["kern:einstellungen"] ?? null, wert: einst } } } });
      expect(r.status, `${k}`).toBeLessThan(500);
      const nach = await gespeichertM(name);
      expect(modulSicht(nach), k).toEqual(vorher);
      nichtsWirkt(nach, k);
    }
  });
});

/* ======================================================================== */
describe("P6/P7 — Betreiber: neu angelegter oder bestehender Betrieb bekommt keine Modulfunktion", { timeout: 300000 }, () => {
  let betreiberToken;
  beforeAll(async () => {
    const code = "MODIN-AAAA-0001";
    await kontoSchreiben(laden(), ablageSchluessel(code), { name: "betr", bestand: "modul-inert-betreiber", rolle: "betreiber", person: null, betrieb: 0, angelegt: EIN });
    const a = await anfrage("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } });
    betreiberToken = a.token;
    expect(betreiberToken).toBeTruthy();
  });
  const mitModulen = (id) => {
    const m = grundbestand({ daten: true }).mandanten[0];
    m.id = id; m.name = id; m.pakete = [...PAKETE_ALLE];
    return m;
  };
  const inhalt = (ids) => ({ version: 9, stand: 1, session: null, mandanten: ids.map(mitModulen) });
  const roh = async (raum) => (await B.bestandLesen(laden(), raum)).bestand;

  it("P6 bestand-anlegen mit eigenem Inhalt: Moduldaten, Schalter, Regelwerte und Protokoll verworfen", async () => {
    const r = await anfrage("/api/bestand-anlegen", { methode: "POST", token: betreiberToken, rumpf: { bestand: "inert-eigen", inhalt: inhalt(["m-a", "m-b"]) } });
    expect(r.status, JSON.stringify(r).slice(0, 200)).toBe(200);
    for (const m of (await roh("inert-eigen")).mandanten) { keineModuldaten(m, m.id); nichtsWirkt(m, m.id); }
  });
  it("P6 bestand-anlegen als Demo: dasselbe für alle Demo-Betriebe", async () => {
    const r = await anfrage("/api/bestand-anlegen", { methode: "POST", token: betreiberToken, rumpf: { bestand: "inert-demo", vorlage: "demo", inhalt: inhalt(DEMO_KENNUNGEN) } });
    expect(r.status, JSON.stringify(r).slice(0, 200)).toBe(200);
    const b = await roh("inert-demo");
    expect(b.mandanten.map((m) => m.id)).toEqual(DEMO_KENNUNGEN);
    for (const m of b.mandanten) { keineModuldaten(m, m.id); nichtsWirkt(m, m.id); }
  });
  it("P6 bestand-anlegen leer und test: vom Server gebaut, ein mitgeschickter Inhalt zählt nicht", async () => {
    for (const vorlage of ["leer", "test"]) {
      const r = await anfrage("/api/bestand-anlegen", { methode: "POST", token: betreiberToken, rumpf: { bestand: `inert-${vorlage}`, vorlage, inhalt: inhalt(["m-x"]) } });
      expect(r.status, `${vorlage} ${JSON.stringify(r).slice(0, 200)}`).toBe(200);
      for (const m of (await roh(`inert-${vorlage}`)).mandanten) { keineModuldaten(m, `${vorlage} ${m.id}`); nichtsWirkt(m, `${vorlage} ${m.id}`); }
    }
  });

  /** Betreiber-Sitzung in einem Raum mit gespeichertem Stand (wie die Rolle BT oben). */
  async function betreiberRaum(o) {
    const { name, t } = await neuerRaum(o);
    return { name, token: t.BT };
  }
  it("P7 Betreiber-PUT, neuer Betrieb mit Moduldaten, Schaltern und Paketen: ohne Moduldaten, ohne Schalter, nichts wirkt", async () => {
    const { name, token } = await betreiberRaum({ daten: false, pakete: [] });
    const r = await putAendern(token, (m, b) => { b.mandanten = [...b.mandanten, mitModulen("m9")]; void m; });
    expect(r.status, String(r.text || r.fehler)).toBe(200);
    const neu = (await roh(name)).mandanten.find((x) => x.id === "m9");
    expect(neu, "neuer Betrieb angelegt").toBeTruthy();
    keineModuldaten(neu, "m9");
    nichtsWirkt(neu, "m9");
  });
  it("P7 Betreiber-PUT, bestehender Betrieb: Modulfelder, Schalter, Regelwerte und Paket „sicherheit“ ohne Pilot — nichts übernommen", async () => {
    const { name, token } = await betreiberRaum({ daten: false, pakete: [] });
    const vorher = modulSicht(await gespeichertM(name));
    const r = await putAendern(token, (m) => {
      Object.assign(m, mitModulen("m1"), { id: "m1" });
      m.pakete = [...PAKETE_ALLE];
    });
    expect(r.status, String(r.text || r.fehler)).toBeLessThan(500);
    const nach = await gespeichertM(name);
    expect(modulSicht(nach)).toEqual(vorher);
    expect(nach.pakete).toEqual([]);
    nichtsWirkt(nach, "bestehend");
  });
  it("P7 IST-ZUSTAND (Lücke L-4, kein Fix in diesem PR): `rechnungen` des Betreibers werden ungeprüft gespeichert — sie buchen aber kein Paket und schalten kein Modul", async () => {
    const { name, token } = await betreiberRaum({ daten: false, pakete: [] });
    const vorher = modulSicht(await gespeichertM(name));
    const rechnung = { id: "R-1", mandantId: "m1", monat: "2026-11", positionen: [{ art: "paket", text: "Branchenpaket Sicherheitsdienst", betrag: 79 }] };
    const r = await putAendern(token, (m, b) => { b.rechnungen = [rechnung]; void m; });
    expect(r.status, String(r.text || r.fehler)).toBeLessThan(500);
    const nach = await B.bestandLesen(laden(), name);
    /* Dokumentierter Ist-Zustand: ungeprüft gespeichert. Wird L-4 behoben, schlägt diese Zeile an — dann ersetzt der Fix-Test sie. */
    expect(nach.bestand.rechnungen, "IST L-4: ungeprüft gespeichert").toEqual([rechnung]);
    const m = nach.bestand.mandanten[0];
    expect(modulSicht(m)).toEqual(vorher);
    expect(m.pakete).toEqual([]);
    nichtsWirkt(m, "Rechnung");
  });
  it.todo("L-4 (offen, eigenes Paket): Betreiber-PUT mit Paketposition in `rechnungen` bei Paketzustand < 5 wird vom Server abgewiesen oder entfernt");
});

/* ======================================================================== */
describe("P8 — Import mit eingeschaltetem Import-Schalter: keine Moduldaten, kein Schalter", { timeout: 300000 }, () => {
  const KOPF = ["Personalnummer", "Nachname", "Vorname", "E-Mail", "Einheit", "Eintritt", "Wochenstunden"];
  const csv = (zeilen) => Buffer.from(zeilen.map((z) => z.join(";")).join("\n"), "utf8");
  const DATEI = () => csv([KOPF, ["3001", "Neumann", "Lena", "lena.neumann@example.test", "WB 1", "01.02.2026", "30"],
    ["3002", "Kranz", "Paul", "", "WB 1", "", "40"]]);
  async function importieren(token) {
    const up = await importSchritt(token, "upload?art=personal", null, { roh: DATEI(),
      kopfExtra: { "content-type": "application/octet-stream", "x-dateiname": encodeURIComponent("personal-test.csv") } });
    expect(up.status, JSON.stringify(up)).toBe(201);
    const an = await importSchritt(token, "analyse", { vorgang: up.vorgang });
    expect(an.status, JSON.stringify(an).slice(0, 300)).toBe(200);
    const vs = await importSchritt(token, "vorschau", { vorgang: up.vorgang });
    expect(vs.status, JSON.stringify(vs).slice(0, 300)).toBe(200);
    return importSchritt(token, "uebernahme", { vorgang: up.vorgang, bestaetigung: vs.bestaetigung });
  }
  for (const variante of ["frisch", "daten"]) {
    it(`Ausgangsstand „${variante}“: eine Personalübernahme (Leitung) ändert die Modulteile nicht; es entsteht kein Modul-Datenfeld, kein Schalter`, async () => {
      const { name, t } = await neuerRaum({ daten: variante === "daten" });
      const vorher = modulSicht(await gespeichertM(name));
      const ue = await importieren(t.LT);
      expect(ue.status, JSON.stringify(ue).slice(0, 300)).toBe(200);
      const nach = await gespeichertM(name);
      expect((nach.personen || []).some((p) => p.nachname === "Neumann"), "die Personen sind übernommen").toBe(true);
      expect(modulSicht(nach)).toEqual(vorher);
      nichtsWirkt(nach, `Import ${variante}`);
      if (variante === "frisch") keineModuldaten(nach, "Import frisch");
    });
  }
});

/* ======================================================================== */
describe("P9 — Wiederherstellen: eine Sicherung mit Schaltern „an“ macht kein Modul wirksam", { timeout: 300000 }, () => {
  it("Sicherung des Stands „daten“ (alle Schalter an, alle Pakete): nach dem Zurückspielen wirkt kein Modul, Zustand „in-vorbereitung“", async () => {
    const { name, t } = await neuerRaum({ daten: true });
    const s = await anfrage("/api/sicherung", { methode: "POST", token: t.LT, rumpf: {} });
    expect(s.status, JSON.stringify(s).slice(0, 200)).toBe(200);
    /* Zwischendurch den Betrieb ändern, damit das Zurückspielen etwas tut. */
    const z = await putAendern(t.LT, (m) => { m.abweichungen = { ...(m.abweichungen || {}), [`a1|${TAG}`]: "F" }; });
    expect(z.status, String(z.text || z.fehler)).toBe(200);
    const g = await anfrage("/api/bestand", { token: t.LT });
    const w = await anfrage("/api/wiederherstellen", { methode: "POST", token: t.LT, rumpf: { marke: s.marke, etag: g.etag } });
    expect(w.status, JSON.stringify(w).slice(0, 300)).toBe(200);
    const nach = await gespeichertM(name);
    expect(hat(nach.abweichungen || {}, `a1|${TAG}`), "zurückgespielt").toBe(false);
    nichtsWirkt(nach, "Wiederherstellen");
    /* Auch danach ist Schreiben an Moduldaten gesperrt. */
    const r = await putAendern(t.LT, (m) => { m.wachbuch = anders(m, "wachbuch"); });
    expect(r.status, String(r.text || r.fehler)).toBe(403);
  });
});

/* ======================================================================== */
describe("P10 — Lesewege eines frischen Betriebs liefern keine Modulfelder (GET /api/bestand, GET /api/vollausgabe)", { timeout: 300000 }, () => {
  it("GET /api/bestand: für jede Rolle ohne Modul-Datenfelder und ohne Moduleinstellungen", async () => {
    const { t } = await neuerRaum({ daten: false });
    for (const k of ROLLEN_NAMEN) {
      const g = await anfrage("/api/bestand", { token: t[k] });
      expect(g.status, k).toBe(200);
      for (const m of g.bestand.mandanten) { keineModuldaten(m, `${k} ${m.id}`); nichtsWirkt(m, `${k} ${m.id}`); }
    }
  });
  it("GET /api/vollausgabe (Leitung): ohne Modul-Datenfelder und ohne Moduleinstellungen", async () => {
    const { t } = await neuerRaum({ daten: false });
    const v = await anfrage("/api/vollausgabe", { token: t.LT });
    expect(v.status).toBe(200);
    expect(v.bestand.mandanten.length).toBeGreaterThan(0);
    for (const m of v.bestand.mandanten) { keineModuldaten(m, `vollausgabe ${m.id}`); nichtsWirkt(m, `vollausgabe ${m.id}`); }
  });
});

/* ======================================================================== */
describe("P11/P12 — Befunde und Oberflächen eines Betriebs mit allen Daten und allen Schaltern: nichts", () => {
  const m = grundbestand({ daten: true }).mandanten[0];
  const personen = m.personen.filter((p) => p.rolle === "mitarbeiter");
  const da = m.dienstarten[0];
  const ctx = { auswerten: () => ({ zustand: "verletzt", stufe: "hinweis", text: "x" }), qualGueltig: () => false, heute: TAG, einheitAm: () => "e1", stand: () => null, dienstAm: () => da };
  it("Voraussetzung: der Betrieb hat Daten, Schalter und Pakete, aber kein Modul wirkt", () => {
    expect(m.postenPlan).toBeTruthy();
    expect(Object.keys(m.einstellungen.branchenmodule)).toHaveLength(12);
    nichtsWirkt(m, "Stand");
  });
  it("P11 branchenBefunde: leer", () => {
    expect(branchenBefunde(m, da, TAG, { personenImDienst: () => personen, person: personen[0], dienstAm: () => da, qualGueltig: () => false, einheitAm: () => "e1", heute: TAG })).toEqual([]);
  });
  it("P11 fachpruefung/einteilungsBefunde mit Branchenandock: keine Befunde der Art „branche“", () => {
    const b = einteilungsBefunde(m, personen[0], da, TAG, { branchen: { personenImDienst: () => personen }, dienstAm: () => da, heute: TAG });
    expect(b.filter((x) => x.art === "branche")).toEqual([]);
  });
  it("P11 jede einzelne Modul-Befundfunktion: leer", () => {
    expect(postenBefunde(m, da, TAG, personen[0], personen, ctx)).toEqual([]);
    expect(bereichsplanBefunde(m, da, TAG, personen[0], personen, ctx)).toEqual([]);
    expect(bereitschaftHoechstBefunde(m, {})).toEqual([]);
    expect(funktionsBefunde(m, da, TAG, personen[0], personen, ctx)).toEqual([]);
    expect(geteilterdienstBefunde(m, da, TAG, { person: personen[0], dienstAm: ctx.dienstAm, auswerten: ctx.auswerten })).toEqual([]);
    expect(anlagenBefunde(m, TAG, da.id, personen.map((p) => ({ id: p.id, merkmale: [] })), { auswerten: ctx.auswerten })).toEqual([]);
    expect(maschinenqualBefunde(m, TAG, da.id, personen, ctx)).toEqual([]);
    expect(rotationBefunde(m, {})).toEqual([]);
  });
  it("P12 oberflaechenFuer: für jeden Einhängeort und für unbekannte Orte leer, auch mit allen Rechten", () => {
    for (const o of [...EINHAENGEORTE, "unbekannt", "", "__proto__"])
      expect(oberflaechenFuer(m, o, { darf: () => true }), o).toEqual([]);
    expect(EINHAENGEORTE.length).toBeGreaterThan(0);
  });
});

/* ======================================================================== */
describe("P13 — statisch: keine Nebentür", () => {
  const lesen = (rel) => readFile(path.join(WURZEL, rel), "utf8");
  async function dateien(dir, endung) {
    const aus = [];
    for (const e of await readdir(path.join(WURZEL, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) aus.push(...(await dateien(rel, endung)));
      else if (endung.test(e.name)) aus.push(rel);
    }
    return aus;
  }

  it("kein HTTP-Aufrufer (server/funktionen) übergibt ein eigenes Modulregister (`liste`, `module`) an die Modulfunktionen", async () => {
    const NAMEN = ["zusammenfuehren", "branchenmoduleZusammen", "moduldatenZusammen", "modulSchreibwegeAnwenden", "altmodulWache", "modulAktiv",
      "modulNurLesen", "modulZustand", "branchenBefunde", "einteilungsBefunde", "moduleinstellungenVerwerfen", "altmoduldatenVerwerfen"];
    const treffer = [];
    let aufrufe = 0;
    for (const rel of await dateien("server/funktionen", /\.mjs$/)) {
      const text = await lesen(rel);
      for (const n of NAMEN) for (const mm of text.matchAll(new RegExp(`\\b${n}\\(`, "g"))) {
        aufrufe += 1;
        /* Der Aufruf bis zur schließenden Klammer (Klammern gezählt, Zeichenketten nicht beachtet — genügt für diese Aufrufe). */
        let tiefe = 1, i = mm.index + mm[0].length;
        while (i < text.length && tiefe > 0) { const c = text[i]; if (c === "(") tiefe += 1; else if (c === ")") tiefe -= 1; i += 1; }
        const aufruf = text.slice(mm.index, i);
        if (/\bliste\s*[:,}]|\bmodule\s*[:,}]|\bliste\)/.test(aufruf)) treffer.push(`${rel}: ${aufruf.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
    expect(aufrufe, "der Wächter sieht Aufrufe (sonst prüft er nichts)").toBeGreaterThan(0);
    expect(treffer).toEqual([]);
  });

  it("kein Umgebungsschalter für Module, Branchen oder Pakete (Server, Client, Deployment, .env.example)", async () => {
    const treffer = [];
    const MUSTER = /process\.env\.[A-Z0-9_]*(MODUL|BRANCHE|PAKET)[A-Z0-9_]*|import\.meta\.env\.[A-Z0-9_]*(MODUL|BRANCHE|PAKET)[A-Z0-9_]*|^\s*[A-Z0-9_]*(MODUL|BRANCHE|PAKET)[A-Z0-9_]*\s*=/m;
    const kandidaten = [...(await dateien("server", /\.mjs$/)), ...(await dateien("src", /\.(js|jsx|mjs)$/)), ...(await dateien("deploy", /\.(yml|yaml|env|sh|mjs|txt|conf|json)$/)), ".env.example"];
    for (const rel of kandidaten) {
      let text;
      try { text = await lesen(rel); } catch { continue; }
      if (MUSTER.test(text)) treffer.push(rel);
    }
    expect(kandidaten.length).toBeGreaterThan(50);
    expect(treffer).toEqual([]);
  });

  it("jede exportierte `*Befunde`-Funktion in server/lib/modul-*.mjs ruft modulAktiv", async () => {
    const ohne = [];
    let gefunden = 0;
    for (const rel of await dateien("server/lib", /^modul-.*\.mjs$/)) {
      const text = await lesen(rel);
      for (const mm of text.matchAll(/export function (\w*Befunde)\(/g)) {
        gefunden += 1;
        const ab = text.slice(mm.index);
        const ende = ab.search(/\n}\n/);
        const rumpf = ende < 0 ? ab : ab.slice(0, ende);
        if (!/\bmodulAktiv\(/.test(rumpf)) ohne.push(`${rel}: ${mm[1]}`);
      }
    }
    expect(gefunden, "Befundfunktionen gefunden").toBeGreaterThanOrEqual(8);
    expect(ohne).toEqual([]);
  });

  it("jedes Datenfeld der Registry hat einen Schreibweg (MODUL_SCHREIBWEGE oder Altmodul-Wache); die Wegeliste ist vertragstreu", () => {
    expect(pruefeModulSchreibwege()).toEqual([]);
    const ohne = [];
    for (const x of BRANCHENMODULE) for (const f of x.datenfelder) {
      const neu = MODUL_SCHREIBWEGE.some((w) => w.modul === x.id && w.felder.includes(f));
      const alt = ALTMODULE.some((a) => a.modul === x.id);
      if (!neu && !alt) ohne.push(`${x.id}.${f}`);
    }
    expect(ohne).toEqual([]);
  });
});

/* ======================================================================== */
describe("P15 — SSOT: WP-19.1 bis WP-19.12 gelten nicht als fertig, solange das Modul „geplant“ ist", () => {
  it("jedes Paket WP-19.n (n = 1…12, in der Reihenfolge der Registry) ist nicht INTEGRATED/DONE, solange sein Modul „geplant“ ist", async () => {
    const j = JSON.parse(await readFile(path.join(WURZEL, "docs/acc45/work-packages.json"), "utf8"));
    const wp = new Map(j.pakete.map((p) => [p.id, p]));
    const fertig = new Set(["INTEGRATED", "DONE"]);
    const falsch = [];
    BRANCHENMODULE.forEach((x, i) => {
      const p = wp.get(`WP-19.${i + 1}`);
      if (!p) { falsch.push(`WP-19.${i + 1} fehlt`); return; }
      if (x.status === "geplant" && fertig.has(p.status)) falsch.push(`${p.id} (${x.id}): ${p.status}`);
    });
    expect(falsch).toEqual([]);
  });
});
