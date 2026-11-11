/* ==========================================================================
   INTEGRATIONSABNAHME KETTE A + KETTE B (WP-12) — über die Schnittstelle

   Die Rundreisen von Kette A (kette-a-rundreise, nachpruefung-wp11) und die
   Zeilenprüfung von Kette B (rechtematrix-zeilen) prüfen die Bibliotheken
   rechte.mjs/sicht.mjs direkt. Diese Abnahme schickt dieselben Fälle durch
   die Serverfunktion (daten.mjs: Sitzung, Rolle, Bremse, Raumsperre,
   Zusammenführen, Gestalt) und durch die echte Ablage (Kern und
   Monatsscherben, bestand.mjs) — mit EINEM Bestand, der die Felder beider
   Ketten zugleich trägt:

     Kette A   bestaetigungen, selbstplanung[].eintraege[].hinweise,
               beschaeftigungsmodell, stundenGrenzeMonat,
               mutterschutzEinwilligungen, einstellungen.jugendschutz,
               Schutzprüfung (MuSchG, JArbSchG) beim Speichern
     Kette B   Positivkataloge je Rolle (Kontakt, Bank, Lohn, Schutzmerkmal),
               Einsatzregeln statt Rohmerkmal für die Schichtverantwortung

   Geprüft wird:
     1  GET je Rolle = Bibliothekssicht auf den gespeicherten Stand
        (Transport und Ablage verlieren oder ergänzen nichts)
     2  Lesen je Rolle × Feld an Stichproben der Rechtematrix
     3  Rundreise je schreibender Rolle: GET → PUT unverändert → gespeichert
        ist wertgleich (Felder beider Ketten, Kern und Scherben)
     4  Kette A beim Speichern über HTTP: Bestätigung mit Wer/Zeit vom Server,
        sperrende Befunde 403, Einwilligung und Jugendschutz-Schalter
     5  Rollen ohne Schreibrecht und Fremdbereiche

   Aufruf: npx vitest run pruefungen/abnahme-a-b.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
let RAUM = "abnahme-ab-0", raumNr = 0, sitzungAnlegen;
let wurzel, laden, daten, B, rechte, personenAngleichen, Z;
const kopie = (x) => JSON.parse(JSON.stringify(x));
/* Viele Anfragen gegen die Dateiablage — unter Windows langsam. */
const LANG = { timeout: 120000 };

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.12.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

let tag, MITTWOCH;
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });

/** Ein Bestand mit den Feldern beider Ketten. b1 (Bereich e2) trägt die Marker von Kette B.
    Die Personen tragen bewusst kein `qualifikationen` (Altbestand): GET gleicht
    das an (personenAngleichen). Befund WP-12: Vor der Korrektur in daten.mjs
    führte PUT gegen den nicht angeglichenen Stand zusammen, und das
    unveränderte Zurückschreiben der Schichtverantwortung endete mit 403. */
function bestand() {
  const geboren15 = (() => { const d = new Date(`${MITTWOCH}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - 15); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })();
  const eintrag = (id, personId, extra = {}) => ({ id, personId, datum: tag(3), dienstId: "F", aktion: "einsprung",
    stufe: "achtung", gelesen: true, befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung" }], grundArt: null, grund: "",
    ohneGrund: true, durch: "Planung P", durchId: "p1", rolle: "planer", zeit: "2026-01-01T00:00:00.000Z", regelstand: "2026.10",
    behoben: null, ...extra });
  return { version: 9, mandanten: [{
    id: "m1", name: "Abnahmehaus", status: "aktiv",
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
      { id: "B", name: "bis 22", start: "14:00", ende: "22:00", pause: 30 },
      { id: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [
      person("m0", "mitarbeiter", "e1", { beschaeftigungsmodell: "minijob", stundenGrenzeMonat: 43 }),
      person("mu", "mitarbeiter", "e1", { mutterschutz: true, geburtstag: "1990-01-01" }),
      person("j15", "mitarbeiter", "e1", { geburtstag: geboren15 }),
      person("b1", "mitarbeiter", "e2", { telefon: "MK-TELEFON", anschrift: "MK-ANSCHRIFT", iban: "MK-IBAN", lohn: "MK-LOHN",
        beschaeftigungsmodell: "teilzeit", stundenGrenzeMonat: 80 }),
      person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"),
      person("l1", "leitung", "ALLE"), person("l2", "leitung", "ALLE")],
    abweichungen: { [`b1|${tag(4)}`]: "F", [`m0|${tag(4)}`]: "F" },
    abwesenheiten: [{ id: "abw-b1", personId: "b1", art: "krank", von: tag(8), bis: tag(9), notiz: "MK-NOTIZ" }],
    erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [],
    bestaetigungen: [eintrag("alt-m0", "m0"), eintrag("alt-b1", "b1", { grundArt: "sonstiges", grund: "MK-GRUND", ohneGrund: false })],
    selbstplanung: [{ id: "sp1", monat: tag(3).slice(0, 7), status: "offen",
      eintraege: [{ personId: "m0", datum: tag(3), dienstId: "F", hinweise: ["MK-HINWEIS"] }] }],
  }] };
}

const ROLLEN = {
  MA: { rolle: "mitarbeiter", person: "m0" }, MU: { rolle: "mitarbeiter", person: "mu" },
  BR: { rolle: "betriebsrat", person: "r1" }, SV: { rolle: "subplaner", person: "s1", einheit: "e1" },
  PL: { rolle: "planer", person: "p1" }, LT: { rolle: "leitung", person: "l1" },
};
const SITZ = {}, TOKEN = {};

async function gespeichert() { return (await B.bestandLesen(laden(), RAUM)).bestand; }
const m = (b) => b.mandanten[0];
const p = (b, id) => m(b).personen.find((x) => x.id === id);

/** Je Prüfung ein frischer Raum mit eigenen Sitzungen — keine Prüfung erbt Zustand. */
async function neuerRaum() {
  RAUM = `abnahme-ab-${++raumNr}`;
  await B.bestandSchreiben(laden(), RAUM, bestand(), { durch: "Abnahme" });
  for (const [k, r] of Object.entries(ROLLEN)) {
    SITZ[k] = { bestand: RAUM, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0, mandantId: "m1",
      einheit: r.einheit || null };
    TOKEN[k] = (await sitzungAnlegen(SITZ[k], 2 * 3600 * 1000)).token;
  }
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-abnahme-ab-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  rechte = await import("../server/lib/rechte.mjs");
  ({ personenAngleichen } = await import("../server/lib/gestalt.mjs"));
  Z = await import("../server/lib/zeiterfassung.mjs");
  const HEUTE = Z.heuteBerlin();
  tag = (n) => Z.tagePlus(HEUTE, n);
  for (let n = 10; n < 18; n++) if (new Date(`${tag(n)}T12:00:00Z`).getUTCDay() === 3) { MITTWOCH = tag(n); break; }
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

const lesen = (k) => anfrage("/api/bestand", { token: TOKEN[k] });
async function schreiben(k, aendern = () => {}) {
  const g = await lesen(k);
  expect(g.status, `${k} GET`).toBe(200);
  const b = kopie(g.bestand);
  aendern(m(b));
  return anfrage("/api/bestand", { methode: "PUT", token: TOKEN[k], rumpf: { bestand: b, etag: g.etag } });
}

/* ------------------------------------------------------------------------ */
describe("1 GET je Rolle entspricht der Bibliothekssicht auf den gespeicherten Stand", LANG, () => {
  beforeAll(neuerRaum);
  for (const k of Object.keys(ROLLEN)) {
    it(k, async () => {
      const g = await lesen(k);
      expect(g.status).toBe(200);
      const roh = personenAngleichen(await gespeichert());
      /* Die Antwort von GET ist die Bibliothekssicht plus die beim Lesen abgeleitete Markierung „Besetzung
         klärungsbedürftig“ (RB-5, rechte.bestandFuerAntwort / server/lib/klaerung.mjs) — genau dieselbe Funktion. */
      expect(g.bestand).toEqual(kopie(rechte.bestandFuerAntwort(roh, SITZ[k])));
      /* Ohne das abgeleitete Feld ist sie wertgleich zur Bibliothekssicht: Transport und Ablage ergänzen nichts. */
      const { klaerung, ...ohneKlaerung } = g.bestand.mandanten[0];
      expect({ ...g.bestand, mandanten: [ohneKlaerung] }).toEqual(kopie(rechte.bestandFuerRolle(roh, SITZ[k])));
      /* Ohne offene Krankmeldung: leer für Planung, Leitung und Schichtverantwortung; für jede andere Rolle kein Feld. */
      expect((roh.mandanten[0].krankmeldungen || []).filter((f) => f && ["eingegangen", "vorlaeufig_bestaetigt"].includes(f.status))).toEqual([]);
      if (["planer", "leitung", "subplaner"].includes(SITZ[k].rolle)) expect(klaerung, k).toEqual([]);
      else expect(g.bestand.mandanten[0], k).not.toHaveProperty("klaerung");
    });
  }
});

/* ------------------------------------------------------------------------ */
describe("2 Lesen je Rolle × Feld (Stichproben der Rechtematrix, beide Ketten)", LANG, () => {
  beforeAll(neuerRaum);
  const text = async (k) => JSON.stringify((await lesen(k)).bestand);

  it("Bank und Lohn: keine Rolle über GET; Anschrift und Telefon fremder Personen nur Planung und Leitung", async () => {
    for (const k of Object.keys(ROLLEN)) for (const mk of ["MK-IBAN", "MK-LOHN"]) expect(await text(k), `${k} ${mk}`).not.toContain(mk);
    for (const k of ["PL", "LT"]) for (const mk of ["MK-ANSCHRIFT", "MK-TELEFON"]) expect(await text(k), `${k} ${mk}`).toContain(mk);
    for (const k of ["MA", "MU", "BR", "SV"]) for (const mk of ["MK-ANSCHRIFT", "MK-TELEFON"]) expect(await text(k), `${k} ${mk}`).not.toContain(mk);
  });
  it("Mutterschutz: Planung und Leitung roh; Schichtverantwortung nur neutrale Einsatzregel; sonst nichts", async () => {
    for (const k of ["PL", "LT"]) expect(p((await lesen(k)).bestand, "mu").mutterschutz, k).toBe(true);
    const sv = (await lesen("SV")).bestand;
    expect(p(sv, "mu")).not.toHaveProperty("mutterschutz");
    expect((p(sv, "mu").planungsregeln || []).map((r) => r.regel)).toContain("nachtNichtZulaessig");
    expect(JSON.stringify(sv)).not.toMatch(/MuSchG|Mutterschutz/);
    for (const k of ["MA", "MU", "BR"]) expect(await text(k), k).not.toMatch(/"mutterschutz"/);
  });
  it("Bestätigungsprotokoll: Planung/Leitung vollständig, Schichtverantwortung eigener Bereich, Betriebsrat nur Zählwerte, Beschäftigte nichts", async () => {
    for (const k of ["PL", "LT"]) expect(m((await lesen(k)).bestand).bestaetigungen.map((e) => e.id).sort(), k).toEqual(["alt-b1", "alt-m0"]);
    expect(m((await lesen("SV")).bestand).bestaetigungen.map((e) => e.id)).toEqual(["alt-m0"]);
    const br = await text("BR");
    expect(br).not.toContain("MK-GRUND");
    expect(br).not.toMatch(/alt-m0|alt-b1/);
    for (const k of ["MA", "MU"]) expect(m((await lesen(k)).bestand).bestaetigungen || [], k).toEqual([]);
  });
  it("beschaeftigungsmodell und stundenGrenzeMonat: eigene Person ja, fremde nur Planung und Leitung", async () => {
    expect(p((await lesen("MA")).bestand, "m0")).toMatchObject({ beschaeftigungsmodell: "minijob", stundenGrenzeMonat: 43 });
    for (const k of ["PL", "LT"]) expect(p((await lesen(k)).bestand, "b1"), k).toMatchObject({ beschaeftigungsmodell: "teilzeit", stundenGrenzeMonat: 80 });
    for (const k of ["MA", "MU", "BR", "SV"]) {
      const b1 = p((await lesen(k)).bestand, "b1") || {};
      expect(b1.beschaeftigungsmodell, k).toBeUndefined();
      expect(b1.stundenGrenzeMonat, k).toBeUndefined();
    }
  });
  it("Selbstplanung: Hinweise nur für die eigene Person und die Planung", async () => {
    expect(await text("MA")).toContain("MK-HINWEIS");
    expect(await text("PL")).toContain("MK-HINWEIS");
    expect(await text("MU")).not.toContain("MK-HINWEIS");
  });
  it("Krankheitsnotiz einer fremden Person: weder Beschäftigte noch Betriebsrat", async () => {
    for (const k of ["MA", "MU", "BR"]) expect(await text(k), k).not.toContain("MK-NOTIZ");
  });
});

/* ------------------------------------------------------------------------ */
describe("3 Rundreise je schreibender Rolle über HTTP und Ablage", LANG, () => {
  /* Was beide Ketten tragen; Stand, Protokoll und Zeitstempel des Schreibens ausgenommen. */
  const kernfelder = (b) => {
    const x = m(b);
    return kopie({ personen: x.personen, bestaetigungen: x.bestaetigungen, selbstplanung: x.selbstplanung,
      abweichungen: x.abweichungen, abwesenheiten: x.abwesenheiten, einstellungen: x.einstellungen,
      dienstarten: x.dienstarten, einheiten: x.einheiten });
  };
  for (const k of ["PL", "LT", "SV", "MA", "MU"]) {
    it(`${k}: unverändert zurück — gespeichert wertgleich`, async () => {
      await neuerRaum();
      const vorher = kernfelder(personenAngleichen(await gespeichert()));
      const r = await schreiben(k);
      expect(r.status, JSON.stringify(r).slice(0, 300)).toBe(200);
      expect(kernfelder(personenAngleichen(await gespeichert()))).toEqual(vorher);
    });
  }
  it("BR: Schreiben abgewiesen (403), gespeichert unverändert", async () => {
    await neuerRaum();
    const vorher = kopie(await gespeichert());
    const r = await schreiben("BR");
    expect(r.status).toBe(403);
    expect(kernfelder(await gespeichert())).toEqual(kernfelder(vorher));
  });
});

/* ------------------------------------------------------------------------ */
describe("4 Kette A beim Speichern über HTTP", LANG, () => {
  it("Planung bestätigt eine Warnung: gespeichert, Wer und Zeit vom Server, beim Lesen wieder da", async () => {
    await neuerRaum();
    const neu = { id: "neu-1", personId: "b1", datum: tag(3), dienstId: "F", aktion: "einsprung", stufe: "achtung",
      gelesen: true, befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung" }], grundArt: null, grund: "", ohneGrund: true,
      durch: "Gefälscht", durchId: "x", rolle: "x", zeit: "2000-01-01", regelstand: "2026.10", behoben: null };
    const r = await schreiben("PL", (x) => { x.bestaetigungen.unshift(neu); });
    expect(r.status, JSON.stringify(r).slice(0, 300)).toBe(200);
    const e = m(await gespeichert()).bestaetigungen.find((b) => b.id === "neu-1");
    expect(e).toMatchObject({ durchId: "p1", rolle: "planer", durch: "V Np1" });
    expect(e.zeit).not.toBe("2000-01-01");
    expect(m((await lesen("LT")).bestand).bestaetigungen.map((b) => b.id)).toContain("neu-1");
  });
  it("ein Rechtsverstoß lässt sich nicht bestätigen: 403, nichts gespeichert", async () => {
    await neuerRaum();
    const vorher = m(await gespeichert()).bestaetigungen;
    const r = await schreiben("LT", (x) => { x.bestaetigungen.unshift({ ...x.bestaetigungen[0], id: "recht-1",
      stufe: "recht", befunde: [{ regel: "ruhezeitGesetz", stufe: "recht" }] }); });
    expect(r.status).toBe(403);
    expect(r.text).toMatch(/sperrender Befund/);
    expect(m(await gespeichert()).bestaetigungen).toEqual(vorher);
  });
  it("Schichtverantwortung: Bestätigung für eine Person außerhalb des Bereichs abgewiesen", async () => {
    await neuerRaum();
    const r = await schreiben("SV", (x) => { x.bestaetigungen.unshift({ id: "sv-fremd", personId: "b1", datum: tag(3), dienstId: "F",
      aktion: "einsprung", stufe: "achtung", gelesen: true, befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung" }],
      grundArt: null, grund: "", ohneGrund: true, regelstand: "2026.10", behoben: null }); });
    expect(r.status).toBe(403);
    expect(m(await gespeichert()).bestaetigungen.map((b) => b.id)).not.toContain("sv-fremd");
  });
  it("Mutterschutz: Dienst bis 22 Uhr ohne Einwilligung 403; Planung erfasst Einwilligung, dann 200; Nacht bleibt 403", async () => {
    await neuerRaum();
    const ohne = await schreiben("PL", (x) => { x.abweichungen[`mu|${MITTWOCH}`] = "B"; });
    expect(ohne.status).toBe(403);
    expect(m(await gespeichert()).abweichungen[`mu|${MITTWOCH}`]).toBeUndefined();
    const einw = await schreiben("PL", (x) => { x.personen.find((y) => y.id === "mu").mutterschutzEinwilligungen =
      [{ art: "nacht", ab: tag(0), bis: tag(200), genehmigung: true }]; });
    expect(einw.status, JSON.stringify(einw).slice(0, 300)).toBe(200);
    expect(p(await gespeichert(), "mu").mutterschutzEinwilligungen).toEqual([expect.objectContaining({ art: "nacht", geaendertVon: "p1" })]);
    const mit = await schreiben("PL", (x) => { x.abweichungen[`mu|${MITTWOCH}`] = "B"; });
    expect(mit.status, JSON.stringify(mit).slice(0, 300)).toBe(200);
    expect(m(await gespeichert()).abweichungen[`mu|${MITTWOCH}`]).toBe("B");
    const nacht = await schreiben("PL", (x) => { x.abweichungen[`mu|${tag(1) === MITTWOCH ? tag(2) : MITTWOCH}`] = "N"; });
    expect(nacht.status).toBe(403);
    /* Die eigene Person sieht ihre Einwilligung, die Schichtverantwortung nicht. */
    expect(p((await lesen("MU")).bestand, "mu").mutterschutzEinwilligungen).toHaveLength(1);
    expect(JSON.stringify((await lesen("SV")).bestand)).not.toMatch(/mutterschutzEinwilligungen/);
    expect(JSON.stringify((await lesen("MA")).bestand)).not.toMatch(/mutterschutzEinwilligungen/);
  });
  it("Jugendschutz: 15-Jährige im Spätdienst bis 22 Uhr 403; Schalter setzt die Planung, nicht die Schichtverantwortung", async () => {
    await neuerRaum();
    const r = await schreiben("PL", (x) => { x.abweichungen[`j15|${MITTWOCH}`] = "B"; });
    expect(r.status).toBe(403);
    const s = await schreiben("PL", (x) => { x.einstellungen.jugendschutz = { mehrschichtig: true }; });
    expect(s.status, JSON.stringify(s).slice(0, 300)).toBe(200);
    expect(m(await gespeichert()).einstellungen.jugendschutz).toMatchObject({ mehrschichtig: true, geaendertVon: "p1" });
    const sv = await schreiben("SV", (x) => { if (x.einstellungen) x.einstellungen.jugendschutz = { mehrschichtig: false }; });
    expect([200, 403]).toContain(sv.status);
    expect(m(await gespeichert()).einstellungen.jugendschutz.mehrschichtig).toBe(true);
    /* Auch mit dem Schalter bleibt die 15-Jährige nach 20 Uhr gesperrt. */
    expect((await schreiben("PL", (x) => { x.abweichungen[`j15|${MITTWOCH}`] = "B"; })).status).toBe(403);
  });
});

/* ------------------------------------------------------------------------ */
describe("5 Verborgenes und Fremdes bleibt beim Schreiben unberührt", LANG, () => {
  it("Schichtverantwortung: Bank, Lohn, Mutterschutz und Bestätigungen anderer Bereiche bleiben", async () => {
    await neuerRaum();
    const r = await schreiben("SV", (x) => {
      const mu = x.personen.find((y) => y.id === "mu");
      if (mu) { mu.mutterschutz = false; mu.planungsregeln = []; }
      x.bestaetigungen = [];
    });
    expect([200, 403]).toContain(r.status);
    const g = await gespeichert();
    expect(p(g, "mu").mutterschutz).toBe(true);
    expect(p(g, "b1")).toMatchObject({ iban: "MK-IBAN", lohn: "MK-LOHN" });
    expect(m(g).bestaetigungen.map((b) => b.id).sort()).toEqual(["alt-b1", "alt-m0"]);
  });
  it("Beschäftigte: Modell und Monatsgrenze der eigenen Person nicht änderbar, fremde Planung nicht", async () => {
    await neuerRaum();
    const r = await schreiben("MA", (x) => {
      const ich = x.personen.find((y) => y.id === "m0");
      ich.beschaeftigungsmodell = "vollzeit"; ich.stundenGrenzeMonat = 999;
      x.abweichungen[`b1|${tag(4)}`] = "N";
    });
    expect([200, 403]).toContain(r.status);
    const g = await gespeichert();
    expect(p(g, "m0")).toMatchObject({ beschaeftigungsmodell: "minijob", stundenGrenzeMonat: 43 });
    expect(m(g).abweichungen[`b1|${tag(4)}`]).toBe("F");
  });
});
