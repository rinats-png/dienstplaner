/* ==========================================================================
   IMP-6 PLANWIRKUNG — TEILROLLEN: VOM SERVER GERECHNETER DIENST (Vorbedingung 1 vor AN)

   docs/acc45/IMP-6-MEHRFACHMODELLE.md, „Vorbedingungen vor AN“ 1 und „Bewusst nicht gebaut“ 1.
   Beschäftigte, Schichtverantwortung und Betriebsrat sehen höchstens die eigene Zuordnung (Q4). Bei AN
   rechneten ihre Oberflächen für Personen mit eigenem Modell still das Betriebsmodell (gegen Q5), und
   die Schichtverantwortung löschte eine Abweichung, die sie für „Plan“ hielt — der Server galt dann still
   den Modelldienst (Datenintegrität beim Schreiben).

   Geprüft (Schalter CENTRIC_SCHICHTMODELL_WIRKUNG nur in dieser Prüfung gesetzt, danach wieder aus):
   G. Sicht: GET /api/bestand liefert den Teilrollen bei AN `schichtfolgeServer` — nur den gerechneten
      Dienst der Personen ihrer Sicht im Sichtfenster, nie Modelle, Modellnamen oder Zuordnungen anderer.
      Volle Rollen bekommen ihn nicht (sie rechnen selbst). AUS: keine Angabe, Antwort sonst gleich.
   W. Schreibweg (Voll-PUT und Teilweg): Der Server vergleicht Änderungen der Teilrollen an Abweichungen
      mit dem Modelldienst, nicht mit der Annahme des Clients. Ohne Kennzeichen „server“ (Client rechnete
      mit der Betriebsfolge) wird eine gelöschte Abweichung an einem Tag, an dem Modell und Betriebsfolge
      verschieden sind, zum ausdrücklichen Dienst der Betriebsfolge (was der Client als Plan sah). Eine
      Abweichung gleich dem Modelldienst entfällt. Volle Rollen und AUS: unverändert.
   C. Client: fachpruefung.mjs liest den Dienst des Servers (planDienst, schichtfolgeAm) nur, wenn
      speicher.js ihn aus der Antwort gesetzt hat; außerhalb des Fensters für Personen mit eigenem Modell
      kein Dienst (offen, nie still das Betriebsmodell); setzeAbweichung löscht dort nicht. PUT/Teilweg
      tragen das Kennzeichen nur mit gesetztem Dienst des Servers.
   L. Bibliothek allein: Rollenfilter, Schalter und Umfang auch ohne die Vorstufe in daten.mjs.
   S. Wächter: nur speicher.js setzt den Dienst des Servers; Vorgabe AUS unverändert; beide Stufen in daten.mjs.

   Aufruf: npx vitest run pruefungen/imp6-teilrollen.test.js --maxWorkers=1 --testTimeout=60000
   ========================================================================== */
// zeit-ok: Das Sichtfenster des Servers hängt am heutigen Tag (heuteBerlin); alle Tage werden relativ dazu gerechnet.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { heuteBerlin } from "../server/lib/zeiterfassung.mjs";
import { between } from "../server/lib/regelwerk.mjs";

const WIRT = "127.0.0.1:3000";
const kopie = (x) => JSON.parse(JSON.stringify(x));
const quelle = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const plus = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const HEUTE = heuteBerlin();
const VON = plus(HEUTE, -60), BIS = plus(HEUTE, 90);
const FENSTER = between(VON, BIS) + 1;

let wurzel, laden, daten, B, G, sitzungAnlegen, FP, W;

/* Betrieb: Folge F F - F F - - ab 05.01.2026 (Einheit e1 ohne Versatz). Modell „tag“ (F F -) für a1 ab 01.07.2026,
   t1 dasselbe Modell in Teilzeit (20 von 40 Stunden), c1 ausdrücklich nur das Betriebsmodell (unbefristet). */
const ZYKLUS = ["F", "F", "-", "F", "F", "-", "-"];
const MODELL_TAGE = ["F", "F", "-"];
const MARKE = "MODELLNAME-GEHEIM-0815";
const betriebsfolge = (d) => ZYKLUS[((between("2026-01-05", d) % 7) + 7) % 7];
const modellFolge = (d) => MODELL_TAGE[((between("2026-07-01", d) % 3) + 3) % 3];
const STEMPEL = { geaendertAm: "2026-06-01T10:00:00.000Z", geaendertVon: "l1", version: 1 };
const ZU_A1 = () => [{ id: "a1-alt", modellId: "betrieb", gueltigAb: null, gueltigBis: "2026-06-30", ...STEMPEL },
  { id: "a1-tag", modellId: "tag", gueltigAb: "2026-07-01", gueltigBis: null, versatz: 0, ...STEMPEL }];
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", geburtstag: "1980-01-01", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }],
  telefon: "0", email: `${id}@example.org`, personalnummer: `PN-${id}`, eintritt: "2020-01-01", wochenstunden: 40, ...extra });

/** Ein Tag nach heute (im Fenster), an dem das Modell Früh und die Betriebsfolge frei hat. */
const TAG_F_FREI = (() => { for (let i = 3; i < 60; i++) { const d = plus(HEUTE, i); if (modellFolge(d) === "F" && betriebsfolge(d) === "-") return d; } return null; })();
/** Ein Tag nach heute (im Fenster), an dem das Modell frei und die Betriebsfolge Früh hat. */
const TAG_FREI_F = (() => { for (let i = 3; i < 60; i++) { const d = plus(HEUTE, i); if (modellFolge(d) === "-" && betriebsfolge(d) === "F") return d; } return null; })();

function bestand({ abweichungen = {} } = {}) {
  const einheiten = [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }];
  const betrieb = (id) => ({
    id, name: "Haus", branche: "pflege", bundesland: "BE", einheitLabel: "Wohnbereich", status: "aktiv", stichtag: null, laeuftAb: null, pakete: [], matrix: null,
    einheiten: kopie(einheiten), dienstarten: [{ id: "F", kurz: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", kurz: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    zyklus: { wochen: 1, tage: [...ZYKLUS], vorlage: null }, anker: "2026-01-05",
    zuschlaege: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, rollennamen: {}, briefing: [], aufgaben: [], qualifikationen: [],
    genehmigungsstufen: [], tarifwerk: null, version: 9, stand: 1,
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1", { schichtmodellZuordnungen: ZU_A1() }),
      person("t1", "mitarbeiter", "e1", { wochenstunden: 20, teilzeit: { aktiv: true }, schichtmodellZuordnungen: [{ ...ZU_A1()[1], id: "t1-tag", gueltigAb: "2026-07-01" }] }),
      person("c1", "mitarbeiter", "e1", { schichtmodellZuordnungen: [{ id: "c1-b", modellId: "betrieb", gueltigAb: null, gueltigBis: null, ...STEMPEL }] }),
      person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: kopie(abweichungen), planstaende: {}, freigaben: {},
    unterschreitungen: [], belegung: {}, therapie: {}, aushang: [], monatsabschluss: {},
    istEingefroren: {}, standorte: [], abwesenheiten: [], krankmeldungen: [], anfragen: [], wuensche: [], einspruenge: [], ausschreibungen: [],
    selbstplanung: [], nachrichten: [], notrufe: [], erfassung: {}, einstempeln: {}, fahrzeiten: {}, checks: {}, ansichten: {},
    kompetenzen: [], einarbeitung: [], aenderungen: [], bestaetigungen: [], dienstbuch: [], uebergaben: [], protokoll: [],
    notizen: {}, tagesnotizen: {}, tarif: "pro", seit: "2026-01-01", preisgestaltung: {}, kontakt: "k@example.org",
    schichtmodelle: [{ id: "tag", name: MARKE, tage: [...MODELL_TAGE], ...STEMPEL }],
  });
  return { version: 9, stand: 1, mandanten: [betrieb("m1")] };
}

const ROLLEN = {
  LT: { rolle: "leitung", person: "l1" }, KU: { rolle: "kunde", person: null }, PL: { rolle: "planer", person: "p1" },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" }, MA: { rolle: "mitarbeiter", person: "m0" },
  MA_EIGEN: { rolle: "mitarbeiter", person: "a1" }, BR: { rolle: "betriebsrat", person: "r1" },
};
const VOLLE = ["LT", "KU", "PL"], TEIL = ["SV", "MA", "MA_EIGEN", "BR"];

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token, kopf: extra = {} } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.79.${Math.floor(nr / 250) % 250}.${nr % 250}`, ...extra };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
let raumNr = 0;
async function neuerRaum(rollen, opt) {
  const raum = `imp6-tr-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(bestand(opt))), { durch: "Pruefung" });
  const token = {};
  for (const k of rollen) {
    const r = ROLLEN[k];
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}
const gespeichertAb = async (raum) => (await B.bestandLesenStreng(laden(), raum)).bestand.mandanten[0].abweichungen;
const umgebung = (w) => { if (w === undefined) delete process.env.CENTRIC_SCHICHTMODELL_WIRKUNG; else process.env.CENTRIC_SCHICHTMODELL_WIRKUNG = w; };

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-imp6-tr-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  delete process.env.CENTRIC_SCHICHTMODELL_WIRKUNG;
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  G = await import("../server/lib/gestalt.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  FP = await import("../server/lib/fachpruefung.mjs");
  W = await import("../server/lib/schichtmodell-wirkung.mjs");
}, 240000);
afterEach(() => {
  umgebung(undefined);
  if (W) W.schichtmodellWirkungVerbinden();                  // Quelle wieder an die (gelöschte) Umgebung: AUS
  if (FP && FP.schichtfolgeServerSetzen) FP.schichtfolgeServerSetzen(null);
});
afterAll(async () => {
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

it("Voraussetzung der Prüfung: Tage mit Modell ≠ Betriebsfolge liegen im Fenster", () => {
  expect(TAG_F_FREI).toBeTruthy();
  expect(TAG_FREI_F).toBeTruthy();
});

/* ======================================================================== */
describe("G. Sicht: GET /api/bestand liefert den Teilrollen den gerechneten Dienst (nie Modelle anderer)", () => {
  it("G1 AN: Teilrollen bekommen schichtfolgeServer im Sichtfenster; volle Rollen nicht", async () => {
    const { token } = await neuerRaum([...VOLLE, ...TEIL]);
    umgebung("true");
    for (const k of VOLLE) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      expect(g.status, k).toBe(200);
      expect(g.schichtfolgeServer, k).toBeUndefined();
      expect(g.schichtmodellWirkung, k).toBe(true);
    }
    for (const k of TEIL) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      expect(g.status, k).toBe(200);
      expect(g.schichtmodellWirkung, k).toBeUndefined();
      const f = g.schichtfolgeServer;
      expect(f, k).toBeTruthy();
      expect([f.von, f.bis], k).toEqual([VON, BIS]);
      /* nur Personen mit eigener Zuordnung (nicht m0 ohne Feld, nicht c1 mit unbefristetem Betriebsmodell) */
      expect(Object.keys(f.personen).sort(), k).toEqual(["a1", "t1"]);
      expect(f.personen.a1, k).toHaveLength(FENSTER);
      /* Jeder Tag im Fenster liegt nach dem 01.07.2026: Modell F F - (gleich roh und Plan, ohne Teilzeit) */
      for (let i = 0; i < FENSTER; i++) expect(f.personen.a1[i], `${k} ${plus(VON, i)}`).toBe(modellFolge(plus(VON, i)));
      /* Teilzeit: an Tagen, an denen die Quote den Dienst wegnimmt, [roh, plan] */
      const t = f.personen.t1;
      expect(t, k).toHaveLength(FENSTER);
      expect(t.some((v) => Array.isArray(v) && v[0] === "F" && v[1] === "-"), k).toBe(true);
      expect(t.every((v, i) => (Array.isArray(v) ? v[0] === modellFolge(plus(VON, i)) : v === modellFolge(plus(VON, i)))), k).toBe(true);
    }
  });

  it("G2 Datenschutz: Teilrollen erhalten weder Modelle noch Zuordnungen anderer (Q4), der Betriebsrat auch die eigene nicht", async () => {
    const { token } = await neuerRaum(TEIL);
    umgebung("true");
    for (const k of ["SV", "MA", "BR"]) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      const text = JSON.stringify(g);
      expect(text.includes(MARKE), k).toBe(false);
      for (const id of ["a1-tag", "a1-alt", "t1-tag", "c1-b", "\"tag\""]) expect(text.includes(id), `${k} ${id}`).toBe(false);
      expect(text.includes("schichtmodellZuordnungen"), k).toBe(false);
    }
    /* Beschäftigte an der eigenen Person: eigene Zuordnung und eigenes Modell wie bisher (Q4) — nichts darüber hinaus */
    const eigen = await anfrage("/api/bestand", { token: token.MA_EIGEN });
    expect(JSON.stringify(eigen).includes("t1-tag")).toBe(false);
  });

  it("G3 Umfang: nur Personen, die die Sicht der Rolle enthält", async () => {
    const { token } = await neuerRaum(TEIL);
    umgebung("true");
    for (const k of TEIL) {
      const g = await anfrage("/api/bestand", { token: token[k] });
      const ids = new Set(g.bestand.mandanten[0].personen.map((p) => String(p.id)));
      for (const pid of Object.keys(g.schichtfolgeServer.personen)) expect(ids.has(pid), `${k} ${pid}`).toBe(true);
    }
  });

  it("G4 AUS (Vorgabe) und jeder andere Wert: keine Angabe, die Antwort ist sonst gleich", async () => {
    const { token } = await neuerRaum([...VOLLE, ...TEIL]);
    for (const w of [undefined, "TRUE", "1", " true"]) {
      umgebung(w);
      for (const k of [...VOLLE, ...TEIL]) expect((await anfrage("/api/bestand", { token: token[k] })).schichtfolgeServer, `${w} ${k}`).toBeUndefined();
    }
    for (const k of TEIL) {
      umgebung(undefined);
      const aus = await anfrage("/api/bestand", { token: token[k] });
      umgebung("true");
      const an = await anfrage("/api/bestand", { token: token[k] });
      delete an.schichtfolgeServer;
      expect(an, k).toEqual(aus);
    }
  });
});

/* ======================================================================== */
describe("W. Schreibweg: der Server vergleicht mit dem Modelldienst, nicht mit der Annahme des Clients", () => {
  const BASIS = { "x-centric-schichtfolge": "server" };
  async function putAls(token, k, aendern, kopf = {}) {
    const g = await anfrage("/api/bestand", { token: token[k] });
    expect(g.status, `${k}: Lesen`).toBe(200);
    const rumpf = { bestand: kopie(g.bestand), etag: g.etag, durch: "Pruefung" };
    aendern(rumpf.bestand.mandanten[0]);
    return anfrage("/api/bestand", { methode: "PUT", token: token[k], rumpf, kopf });
  }
  const loesche = (key) => (m) => { delete m.abweichungen[key]; };
  const setze = (key, v) => (m) => { m.abweichungen[key] = v; };

  it("W1 AN, Schichtverantwortung ohne Kennzeichen (Client mit Betriebsfolge): gelöschte Abweichung → Dienst der Betriebsfolge ausdrücklich", async () => {
    const key = `a1|${TAG_F_FREI}`;
    const { raum, token } = await neuerRaum(["SV"], { abweichungen: { [key]: "N" } });
    umgebung("true");
    const a = await putAls(token, "SV", loesche(key));
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    /* Der Client sah die Betriebsfolge („-“) als Plan; ohne Server-Entscheidung gölte still der Modelldienst F. */
    expect((await gespeichertAb(raum))[key]).toBe("-");
  });

  it("W2 AN, Schichtverantwortung mit Kennzeichen „server“: die Löschung bleibt (Plan = Modelldienst)", async () => {
    const key = `a1|${TAG_F_FREI}`;
    const { raum, token } = await neuerRaum(["SV"], { abweichungen: { [key]: "N" } });
    umgebung("true");
    const a = await putAls(token, "SV", loesche(key), BASIS);
    expect(a.status, JSON.stringify(a).slice(0, 300)).toBe(200);
    expect(key in (await gespeichertAb(raum))).toBe(false);
  });

  it("W3 AN: eine Abweichung gleich dem Modelldienst entfällt (mit und ohne Kennzeichen); eine andere bleibt", async () => {
    for (const kopf of [{}, BASIS]) {
      const key = `a1|${TAG_FREI_F}`;
      const { raum, token } = await neuerRaum(["SV"]);
      umgebung("true");
      expect((await putAls(token, "SV", setze(key, "-"), kopf)).status).toBe(200);     // Modell frei: keine Abweichung
      expect(key in (await gespeichertAb(raum)), JSON.stringify(kopf)).toBe(false);
      const key2 = `a1|${TAG_F_FREI}`;
      expect((await putAls(token, "SV", setze(key2, "-"), kopf)).status).toBe(200);    // Modell F: „-“ ist eine Abweichung
      expect((await gespeichertAb(raum))[key2], JSON.stringify(kopf)).toBe("-");
    }
  });

  it("W4 Gleiche Folge an dem Tag (kein Widerspruch) und Person ohne eigenes Modell: Löschung bleibt wie bisher", async () => {
    const tagGleich = (() => { for (let i = 3; i < 60; i++) { const d = plus(HEUTE, i); if (modellFolge(d) === betriebsfolge(d)) return d; } return null; })();
    const k1 = `a1|${tagGleich}`, k2 = `m0|${TAG_F_FREI}`;
    const { raum, token } = await neuerRaum(["SV"], { abweichungen: { [k1]: "N", [k2]: "N" } });
    umgebung("true");
    expect((await putAls(token, "SV", (m) => { delete m.abweichungen[k1]; delete m.abweichungen[k2]; })).status).toBe(200);
    const ab = await gespeichertAb(raum);
    expect(k1 in ab).toBe(false);
    expect(k2 in ab).toBe(false);
  });

  it("W5 Rollenfilter: volle Rollen (Planung, Leitung) — Löschung und Modelldienst-Abweichung unverändert wie bisher", async () => {
    for (const k of ["PL", "LT"]) {
      const key = `a1|${TAG_F_FREI}`, key2 = `a1|${TAG_FREI_F}`;
      const { raum, token } = await neuerRaum([k], { abweichungen: { [key]: "N" } });
      umgebung("true");
      expect((await putAls(token, k, (m) => { delete m.abweichungen[key]; m.abweichungen[key2] = "-"; })).status, k).toBe(200);
      const ab = await gespeichertAb(raum);
      expect(key in ab, k).toBe(false);
      expect(ab[key2], k).toBe("-");
    }
  });

  it("W6 Schalterprüfung: AUS (Vorgabe) — Schichtverantwortung schreibt wörtlich wie bisher", async () => {
    for (const w of [undefined, "TRUE"]) {
      const key = `a1|${TAG_F_FREI}`, key2 = `a1|${TAG_FREI_F}`;
      const { raum, token } = await neuerRaum(["SV"], { abweichungen: { [key]: "N" } });
      umgebung(w);
      expect((await putAls(token, "SV", (m) => { delete m.abweichungen[key]; m.abweichungen[key2] = "-"; })).status, String(w)).toBe(200);
      const ab = await gespeichertAb(raum);
      expect(key in ab, String(w)).toBe(false);
      expect(ab[key2], String(w)).toBe("-");
    }
  });

  it("W7 Teilweg (POST /api/bestand/teile): dieselbe Entscheidung wie der Voll-PUT", async () => {
    for (const [kopf, erwartet] of [[{}, "-"], [BASIS, undefined]]) {
      const key = `a1|${TAG_F_FREI}`;
      const { raum, token } = await neuerRaum(["SV"], { abweichungen: { [key]: "N" } });
      umgebung("true");
      const g = await anfrage("/api/bestand", { token: token.SV });
      expect(g.teile, "Teilweg angeboten").toBeTruthy();
      const t = await anfrage("/api/bestand/teile", { methode: "POST", token: token.SV, kopf,
        rumpf: { format: g.teile.format, epoche: g.teile.epoche, durch: "Pruefung", zellen: [{ feld: "abweichungen", k: key, alt: "N", neu: null }] } });
      expect(t.status, JSON.stringify(t).slice(0, 300)).toBe(200);
      expect((await gespeichertAb(raum))[key], JSON.stringify(kopf)).toBe(erwartet);
    }
  });
});

/* ======================================================================== */
describe("C. Client: Dienst des Servers in planDienst/schichtfolgeAm, Aktionen, Kennzeichen", () => {
  const ALT = "ALT";
  const folge = (personen, von = "2027-11-01", bis = "2027-11-10") => ({ von, bis, personen });
  const p = (id, extra = {}) => ({ id, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }], eintritt: "2020-01-01", ...extra });
  const m = () => ({ id: "b1", dienstarten: [{ id: "F" }, { id: "S" }], zyklus: { tage: ["F", "S", "-"] }, anker: "2027-01-01",
    einheiten: [{ id: "e1", versatzTage: 0 }], personen: [p("x"), p("y")], abweichungen: {}, aenderungen: [], freigaben: {} });

  it("C1 ohne gesetzten Dienst des Servers (AUS): wörtlich der bisherige Ausdruck", () => {
    const b = m();
    for (const d of ["2027-11-01", "2027-11-05", "2028-01-01"]) {
      expect(FP.schichtfolgeAm(b, b.personen[0], d, () => ALT)).toBe(ALT);
      expect(FP.planDienst(b, b.personen[0], d)).toBe(FP.einheitDienst(b, "e1", d));
    }
    expect(FP.schichtfolgeServerAktiv()).toBe(false);
  });

  it("C2 gesetzt: Tag mit Angabe → Dienst des Servers (roh/Plan getrennt); null → bisheriger Ausdruck; außerhalb des Fensters → offen", () => {
    const b = m();
    const reihe = ["F", null, "-", ["F", "-"], null, null, null, null, null, null];
    FP.schichtfolgeServerSetzen(folge({ x: reihe }));
    expect(FP.schichtfolgeServerAktiv()).toBe(true);
    const x = b.personen[0], y = b.personen[1];
    expect(FP.schichtfolgeAm(b, x, "2027-11-01", () => ALT)).toBe("F");
    expect(FP.planDienst(b, x, "2027-11-01")).toBe("F");
    expect(FP.schichtfolgeAm(b, x, "2027-11-02", () => ALT)).toBe(ALT);
    expect(FP.planDienst(b, x, "2027-11-02")).toBe(FP.einheitDienst(b, "e1", "2027-11-02"));
    expect(FP.schichtfolgeAm(b, x, "2027-11-03", () => ALT)).toBe(null);
    expect(FP.planDienst(b, x, "2027-11-03")).toBe(null);
    expect(FP.schichtfolgeAm(b, x, "2027-11-04", () => ALT)).toBe("F");
    expect(FP.planDienst(b, x, "2027-11-04")).toBe(null);
    /* außerhalb des Fensters: für eine Person mit eigenem Modell kein Dienst (nie still das Betriebsmodell) */
    for (const d of ["2027-10-31", "2027-11-11", "2028-03-01"]) {
      expect(FP.schichtfolgeAm(b, x, d, () => ALT), d).toBe(null);
      expect(FP.planDienst(b, x, d), d).toBe(null);
      expect(FP.schichtfolgeOffen(x, d), d).toBe(true);
    }
    expect(FP.schichtfolgeOffen(x, "2027-11-01")).toBe(false);
    /* Person ohne Angabe: immer der bisherige Ausdruck */
    for (const d of ["2027-10-31", "2027-11-01", "2028-03-01"]) {
      expect(FP.schichtfolgeAm(b, y, d, () => ALT), d).toBe(ALT);
      expect(FP.schichtfolgeOffen(y, d), d).toBe(false);
    }
  });

  it("C3 ungültige Angaben werden nicht übernommen (fail-closed: keine Angabe, kein Kennzeichen)", () => {
    for (const w of [undefined, null, 1, "x", [], {}, { von: "2027-11-01", bis: "2027-11-02" }, { von: "2027-11-02", bis: "2027-11-01", personen: {} },
      { von: "x", bis: "2027-11-01", personen: {} }, folge({ x: ["F"] }), folge({ x: Array(10).fill(1) }), folge({ x: Array(10).fill(["F"]) }),
      folge({ x: Array(10).fill({}) }), folge({ x: "F" })]) {
      FP.schichtfolgeServerSetzen(w);
      expect(FP.schichtfolgeServerAktiv(), JSON.stringify(w)).toBe(false);
    }
    FP.schichtfolgeServerSetzen(folge({ x: Array(10).fill(null) }));
    expect(FP.schichtfolgeServerAktiv()).toBe(true);
  });

  it("C4 eingeschaltete eigene Rechnung (volle Rollen) hat Vorrang: der Dienst des Servers wirkt dann nicht", () => {
    const b = m();
    FP.schichtfolgeServerSetzen(folge({ x: ["N", null, null, null, null, null, null, null, null, null] }));
    FP.schichtmodellWirkungSetzen(true);
    try {
      expect(FP.schichtfolgeAm(b, b.personen[0], "2027-11-01", () => ALT)).toBe(ALT);   // Betriebsmodell implizit: AN = AUS
      expect(FP.schichtfolgeOffen(b.personen[0], "2027-11-20")).toBe(false);
    } finally { FP.schichtmodellWirkungSetzen(false); }
  });

  it("C5 setzeAbweichung: Plan = Dienst des Servers; außerhalb des Fensters wird nie gelöscht (offen)", async () => {
    const { aktionenPlan } = await import("../src/app/aktionen/plan.js");
    const mit = (b) => {
      const st = { m: b };
      const k = new Proxy({ mUpd: (fn) => { st.m = fn(st.m); }, melde: () => {},
        sitz: { person: { id: "l1", vorname: "L", nachname: "L", rolle: "leitung", bereich: "ALLE" } }, ref: { current: null } },
      { get: (z, key) => (key in z ? z[key] : () => {}) });
      return { akt: aktionenPlan(k), st };
    };
    FP.schichtfolgeServerSetzen(folge({ x: ["-", null, null, null, null, null, null, null, null, null] }));
    /* 01.11.: Folge der Einheit wäre „F“ oder „S“, der Server sagt frei — „frei“ ist keine Abweichung */
    const a = mit(m());
    a.akt.setzeAbweichung("x", "2027-11-01", "-");
    expect(a.st.m.abweichungen).toEqual({});
    const folgeEinheit = FP.einheitDienst(m(), "e1", "2027-11-01");
    a.akt.setzeAbweichung("x", "2027-11-01", folgeEinheit);
    expect(a.st.m.abweichungen).toEqual({ "x|2027-11-01": folgeEinheit });
    /* außerhalb des Fensters (offen): ausdrücklich speichern, auch „frei“ — der Server entscheidet gegen den Modelldienst */
    const o = mit(m());
    o.akt.setzeAbweichung("x", "2027-12-01", "-");
    expect(o.st.m.abweichungen).toEqual({ "x|2027-12-01": "-" });
    /* Person ohne Angabe: wie bisher */
    const y = mit(m());
    y.akt.setzeAbweichung("y", "2027-12-01", FP.einheitDienst(m(), "e1", "2027-12-01") || "-");
    expect(y.st.m.abweichungen).toEqual({});
  });

  describe("C6 speicher.js: setzt den Dienst des Servers allein aus der Antwort; Kennzeichen nur dann", () => {
    const speicherAttrappe = (vorab = {}) => { const s = new Map(Object.entries(vorab)); return { getItem: (k) => (s.has(k) ? s.get(k) : null),
      setItem: (k, v) => s.set(k, String(v)), removeItem: (k) => s.delete(k), clear: () => s.clear() }; };
    afterAll(() => { vi.unstubAllGlobals(); });
    async function gelesen(zusatz) {
      vi.resetModules();
      const anfragen = [];
      vi.stubGlobal("sessionStorage", speicherAttrappe({ "centric:token": "t-pruefung" }));
      vi.stubGlobal("localStorage", speicherAttrappe());
      vi.stubGlobal("fetch", async (url, opt = {}) => {
        anfragen.push({ url: String(url), methode: opt.method || "GET", kopf: { ...(opt.headers || {}) } });
        return new Response(JSON.stringify({ bestand: { version: 9, mandanten: [m()] }, etag: "1", rolle: "subplaner",
          person: "s1", betrieb: 0, name: "S", schreiben: "einheit", ...zusatz }), { status: 200, headers: { "content-type": "application/json" } });
      });
      const SP = await import("../src/speicher.js");
      const FP2 = await import("../server/lib/fachpruefung.mjs");
      FP2.schichtfolgeServerSetzen(zusatz.schichtfolgeServer ? null : folge({ x: Array(10).fill(null) }));   // Gegenteil vorbelegen
      await SP.lies();
      const aktiv = FP2.schichtfolgeServerAktiv();
      return { aktiv, SP, FP2, anfragen };
    }
    it("mit Angabe → gesetzt; ohne Angabe → nicht gesetzt", async () => {
      const a = await gelesen({ schichtfolgeServer: folge({ x: Array(10).fill(null) }) });
      expect(a.aktiv).toBe(true);
      a.FP2.schichtfolgeServerSetzen(null);
      expect((await gelesen({})).aktiv).toBe(false);
    });
    it("Kennzeichen x-centric-schichtfolge: nur mit gesetztem Dienst des Servers (Quelltext: PUT und Teilweg)", () => {
      const q = quelle("../src/speicher.js");
      expect(q).toMatch(/schichtfolgeServerSetzen\(daten\.schichtfolgeServer\)/);
      const kennzeichen = q.match(/x-centric-schichtfolge/g) || [];
      expect(kennzeichen).toHaveLength(1);
      expect(q).toMatch(/schichtfolgeServerAktiv\(\) \? \{ "x-centric-schichtfolge": "server" \} : \{\}/);
      /* PUT /api/bestand und POST /api/bestand/teile tragen den Kopf */
      const put = q.slice(q.indexOf("const antwort = await ruf(\"bestand\", { method: \"PUT\""), q.indexOf("const antwort = await ruf(\"bestand\", { method: \"PUT\"") + 400);
      expect(put).toMatch(/schichtfolgeKopf\(\)/);
      const teile = q.slice(q.indexOf("ruf(\"bestand/teile\""), q.indexOf("ruf(\"bestand/teile\"") + 300);
      expect(teile).toMatch(/schichtfolgeKopf\(\)/);
    });
  });
});

/* ======================================================================== */
describe("L. Bibliothek schichtfolge-teilrollen.mjs: Rollenfilter, Schalter, Umfang (ohne die Vorstufe in daten.mjs)", () => {
  /* daten.mjs prüft Schalter und Rolle schon vor dem Aufruf; die Bibliothek hält beides selbst (zweite Stufe, fail-closed).
     Ohne diese Prüfungen überlebten Mutanten der Bibliothek, solange daten.mjs sie verdeckt (Mutationslauf R1, S1, S2, P1). */
  /* C6 setzt die Module zurück (vi.resetModules): Bibliothek und Planrechnung deshalb hier gemeinsam frisch laden, damit
     der Schalter genau die Instanz trifft, die die Bibliothek liest. */
  let T, FPL;
  beforeAll(async () => {
    vi.resetModules();
    T = await import("../server/lib/schichtfolge-teilrollen.mjs");
    FPL = await import("../server/lib/fachpruefung.mjs");
  }, 240000);
  afterEach(() => { if (FPL) FPL.schichtmodellWirkungSetzen(false); });
  const roh = () => bestand().mandanten[0];
  const rumpfMit = (r, ab) => ({ mandanten: [{ ...kopie(r), abweichungen: ab }] });

  it("L1 vollsichtSchichtmodelle: nur Planung, Leitung, Kundenrolle", () => {
    for (const r of ["planer", "leitung", "kunde"]) expect(T.vollsichtSchichtmodelle(r), r).toBe(true);
    for (const r of ["subplaner", "mitarbeiter", "betriebsrat", "betreiber", "gibtsnicht", undefined]) expect(T.vollsichtSchichtmodelle(r), String(r)).toBe(false);
  });

  it("L2 abweichungenTeilrollen: AN + Teilrolle entscheidet; volle Rolle und AUS geben denselben Rumpf zurück", () => {
    const key = `a1|${TAG_F_FREI}`, key2 = `a1|${TAG_FREI_F}`;
    const r = roh();
    const sicht = { ...r, abweichungen: { [key]: "N" } };
    FPL.schichtmodellWirkungSetzen(true);
    for (const rolle of ["subplaner", "mitarbeiter", "betriebsrat"]) {
      const e = T.abweichungenTeilrollen(rumpfMit(r, { [key2]: "-" }), { roh: r, sicht, rolle, basisServer: false });
      expect(e.mandanten[0].abweichungen, rolle).toEqual({ [key]: "-" });           // Löschung → Betriebsfolge; key2 = Modell → entfällt
      const s = T.abweichungenTeilrollen(rumpfMit(r, { [key2]: "-" }), { roh: r, sicht, rolle, basisServer: true });
      expect(s.mandanten[0].abweichungen, rolle).toEqual({});                       // mit Kennzeichen: Löschung bleibt
    }
    for (const rolle of ["planer", "leitung", "kunde"]) {
      const b = rumpfMit(r, { [key2]: "-" });
      expect(T.abweichungenTeilrollen(b, { roh: r, sicht, rolle, basisServer: false }), rolle).toBe(b);
    }
    FPL.schichtmodellWirkungSetzen(false);
    const b = rumpfMit(r, { [key2]: "-" });
    expect(T.abweichungenTeilrollen(b, { roh: r, sicht, rolle: "subplaner", basisServer: false })).toBe(b);
  });

  it("L3 schichtfolgeFuerSicht: AUS null; nur Personen, die die Sicht enthält", () => {
    const r = roh();
    FPL.schichtmodellWirkungSetzen(false);
    expect(T.schichtfolgeFuerSicht(r, r, HEUTE)).toBe(null);
    FPL.schichtmodellWirkungSetzen(true);
    expect(Object.keys(T.schichtfolgeFuerSicht(r, r, HEUTE).personen).sort()).toEqual(["a1", "t1"]);
    const ohneA1 = { ...r, personen: r.personen.filter((p) => p.id !== "a1") };
    expect(Object.keys(T.schichtfolgeFuerSicht(r, ohneA1, HEUTE).personen)).toEqual(["t1"]);
    expect(T.schichtfolgeFuerSicht(r, { ...r, personen: [] }, HEUTE).personen).toEqual({});
  });
});

/* ======================================================================== */
describe("S. Wächter", () => {
  it("S1 nur fachpruefung.mjs (Definition) und speicher.js (Antwort des Servers) nennen schichtfolgeServerSetzen im Produktcode", () => {
    const wurzelP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const dateien = (rel) => readdirSync(path.join(wurzelP, rel)).flatMap((n) => {
      const r = `${rel}/${n}`;
      return statSync(path.join(wurzelP, r)).isDirectory() ? dateien(r) : /\.(mjs|js|jsx)$/.test(n) ? [r] : [];
    });
    const treffer = [...dateien("server"), ...dateien("src")].filter((r) => /schichtfolgeServerSetzen/.test(readFileSync(path.join(wurzelP, r), "utf8")));
    expect(treffer.sort()).toEqual(["server/lib/fachpruefung.mjs", "src/speicher.js"]);
  });
  it("S2 Vorgabe bleibt AUS: .env.example nur auskommentiert, kein Workflow setzt den Schalter", () => {
    const env = quelle("../.env.example");
    expect(env).not.toMatch(/^CENTRIC_SCHICHTMODELL_WIRKUNG=/m);
    for (const w of ["pruefung.yml", "deploy.yml", "betrieb-deploy.yml"]) {
      let q = ""; try { q = quelle(`../.github/workflows/${w}`); } catch { continue; }
      expect(q, w).not.toMatch(/CENTRIC_SCHICHTMODELL_WIRKUNG/);
    }
  });
  it("S3 Server: GET-Angabe und Schreibentscheidung hängen am Schalter und an der Rolle (eine Stelle je Regel)", () => {
    const d = quelle("../server/funktionen/daten.mjs");
    expect(d).toMatch(/schichtfolgeFuerSicht\(/);
    expect(d).toMatch(/abweichungenTeilrollen\(/);
    const t = quelle("../server/lib/schichtfolge-teilrollen.mjs");
    expect(t).toMatch(/schichtmodellWirkungAktiv\(\)/);
    expect(t).toMatch(/export function vollsichtSchichtmodelle/);
    /* Erste Stufe in daten.mjs: Schalter UND Rolle vor jeder Rechnung (die Bibliothek prüft beides noch einmal, L2/L3).
       Beide Stufen sind redundant; Verhaltensprüfungen allein töten den Wegfall EINER Stufe nicht (Mutationslauf S3, S4). */
    expect(d).toContain("if (!schichtmodellWirkungAn() || vollsichtSchichtmodelle(s.rolle) || s.rolle === \"betreiber\" || s.nurSicherung) return {};");
    expect(d).toContain("if (jetzt && jetzt.bestand && schichtmodellWirkungAn() && !vollsichtSchichtmodelle(s.rolle)) {");
    expect(d.match(/abweichungenTeilrollen\(/g)).toHaveLength(1);
    expect(d.match(/schichtfolgeFuerSicht\(/g)).toHaveLength(1);
  });
});
