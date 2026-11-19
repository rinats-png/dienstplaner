/* ==========================================================================
   IMP-6 Q4 — BESCHÄFTIGTE SEHEN IHR EIGENES SCHICHTMODELL

   Betreiberentscheidung 2026-11-14, Frage 4 (docs/acc45/IMP-6-MEHRFACHMODELLE.md,
   ENTSCHEIDUNGSLISTE „IMP-6 Q4“): „Beschäftigte sehen ihr eigenes Modell; keine
   neuen Leserechte für den Betriebsrat.“ Umsetzung in server/lib/sicht.mjs
   (eigeneZuordnungen, schichtmodelleEigene). Geprüft über den echten Handler
   (GET/PUT /api/bestand, Teilweg) mit Dateiablage und echten Sitzungen:

   1. Lesematrix Rolle × Feld × Person: Beschäftigte und Schichtverantwortung
      sehen an der EIGENEN Person ihre Zuordnungen ohne Stempel und im Betrieb
      nur die Modelle dieser Zuordnungen ohne Stempel; fremde Personen (eigener
      Bereich, Pool/Springer, versetzt, fremder Bereich) nie; Betriebsrat und
      Betreiber nichts, auch nicht an der eigenen Person; Planung, Leitung,
      Kundenrolle unverändert alles. Zeitlage: vergangene, laufende und künftige
      eigene Zuordnungen (kein Fenster, P2-19).
   2. Schreibweg unverändert und ohne neues Orakel: Beschäftigte wirkungslos,
      Schichtverantwortung: unverändert zurück = gespeicherter Stand (mit
      Stempeln), geändert = 403 wie jedes Leitungsfeld; verborgenes und
      unbekanntes Modell bzw. fremde Person mit und ohne Zuordnung: dieselbe
      Antwort. Ältere Kopie der Schichtverantwortung ohne die neuen Felder:
      403 statt 200, Bestand byte-gleich (Review #372 M1, P2-19 (e)).
   3. Teilweg: die Versionen folgen der Sicht (verborgene Modelle ändern sie nicht).
   4. Differenz alt/neu über Zufallsbestände (bestandFuerRolle, alle Rollen):
      Ohne die neu freigegebenen Teile ist jede Antwort bit-gleich mit der
      Antwort ohne Zuordnungen im Bestand (vor Q4 hing keine Antwort dieser
      Rollen von den Zuordnungen ab). Dazu ein Golden-Hash der Antworten für
      PL, LT, KU, BR, BT, erzeugt mit sicht.mjs vor Q4 (echter Vergleich alt/neu).

   Aufruf: npx vitest run pruefungen/imp6-eigenes-modell.test.js --maxWorkers=1
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { heuteBerlin } from "../server/lib/zeiterfassung.mjs";
import { plusTage } from "../server/lib/schichtzuordnung.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { createHash } from "node:crypto";

/** sha256 der Antworten PL/LT/KU/BR/BT über 40 Zufallsbestände, erzeugt mit sicht.mjs von 87473f12 (Abschnitt 4). */
const GOLDEN_ALT = "29e70a5d184a42e2d08b45f6bea355ae30ff1b3a5e2557cbaf13f48c75e8ce9a";

const WIRT = "127.0.0.1:3000";
let wurzel, laden, daten, B, G, sitzungAnlegen;
const kopie = (x) => JSON.parse(JSON.stringify(x));
const HEUTE = heuteBerlin();
const monat = (n) => `${new Date(Date.UTC(Number(HEUTE.slice(0, 4)), Number(HEUTE.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 10)}`;
const M2 = monat(2);

let nr = 0;
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.79.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

/* Marker: Modellnamen und Stempel tragen je eine eindeutige Kennung. */
const NAME = (id) => `MODELLNAME-${id}-Q4`;
const SVON = (id) => `STEMPEL-${id}-Q4`;
const ZVON = (id) => `ZSTEMPEL-${id}-Q4`;
const STEMPEL_AM = "2026-06-01T10:00:00.000Z";
const MODELL_IDS = ["tag", "zukunft", "nacht", "vers", "pool", "fremd", "brm", "unbenutzt"];
const modell = (id) => ({ id, name: NAME(id), tage: ["F", "N", "-"], geaendertAm: STEMPEL_AM, geaendertVon: SVON(id), version: 4 });
const zu = (id, modellId, gueltigAb, gueltigBis, versatz) => ({ id, modellId, gueltigAb, gueltigBis,
  ...(versatz === undefined ? {} : { versatz }), geaendertAm: STEMPEL_AM, geaendertVon: ZVON(id), version: 3 });
/* a1: vergangen (Betriebsmodell bis Juni), laufend (tag), künftig (zukunft ab M2). */
const Z = {
  a1: () => [zu("a1-alt", "betrieb", null, "2026-06-30"), zu("a1-tag", "tag", "2026-07-01", plusTage(M2, -1), 0),
    zu("a1-zukunft", "zukunft", M2, null, 1)],
  s1: () => [zu("s1-nacht", "nacht", "2026-01-05", null, 2)],
  v1: () => [zu("v1-vers", "vers", "2026-01-05", null, 0)],
  sp1: () => [zu("sp1-pool", "pool", "2026-01-05", null, 0)],
  b1: () => [zu("b1-fremd", "fremd", "2026-01-05", null, 0)],
  r1: () => [zu("r1-brm", "brm", "2026-01-05", null, 0)],
};
const ohneStempel = (l) => l.map(({ geaendertAm: _a, geaendertVon: _v, version: _n, ...rest }) => rest);
const modellOhneStempel = (id) => ({ id, name: NAME(id), tage: ["F", "N", "-"] });

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", qualifikationen: [], zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], telefon: "0", ...extra });
function bestand({ mit = true } = {}) {
  const z = (id) => (mit ? { schichtmodellZuordnungen: Z[id]() } : {});
  const m = {
    id: "m1", name: "Haus", branche: "pflege", bundesland: "BE", einheitLabel: "Wohnbereich", status: "aktiv", pakete: [],
    einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 }, { id: "ep", name: "Pool", pool: true, versatzTage: 0 }],
    dienstarten: [{ id: "F", kurz: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "N", kurz: "N", name: "Nacht", start: "22:00", ende: "06:00", pause: 30 }],
    zyklus: { wochen: 1, tage: ["F", "F", "-", "F", "F", "-", "-"], vorlage: null }, anker: "2026-01-05",
    zuschlaege: [], einstellungen: { ruhezeit: 11, maxFolge: 6 }, rollennamen: {}, qualifikationen: [], version: 9, stand: 1,
    personen: [
      person("a1", "mitarbeiter", "e1", z("a1")), person("m0", "mitarbeiter", "e1"),
      person("s1", "subplaner", "e1", z("s1")),
      /* versetzt: bis vor zehn Tagen im Bereich der Schichtverantwortung (Sichtfenster: „Bereich“). */
      person("v1", "mitarbeiter", "e2", { zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }, { ab: plusTage(HEUTE, -10), einheitId: "e2" }], ...z("v1") }),
      person("sp1", "mitarbeiter", "ep", { springer: true, ...z("sp1") }),
      person("b1", "mitarbeiter", "e2", z("b1")),
      person("r1", "betriebsrat", "ALLE", z("r1")), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: {}, freigaben: {}, monatsabschluss: {}, istEingefroren: {}, abwesenheiten: [], krankmeldungen: [], anfragen: [],
    wuensche: [], einspruenge: [], ausschreibungen: [], selbstplanung: [], nachrichten: [], notrufe: [], erfassung: {}, einstempeln: {},
    fahrzeiten: {}, checks: {}, ansichten: {}, aenderungen: [], bestaetigungen: [], dienstbuch: [], uebergaben: [], protokoll: [],
    notizen: {}, tagesnotizen: {}, tarif: "pro", seit: "2026-01-01", preisgestaltung: {},
    ...(mit ? { schichtmodelle: MODELL_IDS.map(modell) } : {}),
  };
  return { version: 9, stand: 1, mandanten: [m] };
}

const ROLLEN = {
  MA_A1: { rolle: "mitarbeiter", person: "a1" }, MA_M0: { rolle: "mitarbeiter", person: "m0" },
  SV: { rolle: "subplaner", person: "s1", einheit: "e1" }, BR: { rolle: "betriebsrat", person: "r1" },
  PL: { rolle: "planer", person: "p1" }, LT: { rolle: "leitung", person: "l1" }, KU: { rolle: "kunde", person: null },
  BT: { rolle: "betreiber", person: null },
};
let raumNr = 0;
async function neuerRaum({ rollen = Object.keys(ROLLEN), mit = true } = {}) {
  const raum = `imp6-q4-${++raumNr}`;
  await B.bestandSchreiben(laden(), raum, G.personenAngleichen(G.uebergabenAngleichen(bestand({ mit }))), { durch: "Pruefung" });
  const token = {};
  for (const k of rollen) {
    const r = ROLLEN[k];
    token[k] = (await sitzungAnlegen({ bestand: raum, name: `V N${r.person}`, rolle: r.rolle, person: r.person, betrieb: 0,
      mandantId: "m1", einheit: r.einheit || null }, 2 * 3600 * 1000)).token;
  }
  return { raum, token };
}
async function gespeichert(raum) {
  const g = await B.bestandLesenStreng(laden(), raum);
  return g.bestand.mandanten[0];
}
const pers = (m, id) => (m.personen || []).find((p) => p && p.id === id);
const hat = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-imp6-q4-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  process.env.CENTRIC_TEILSPEICHERUNG = "true";
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  G = await import("../server/lib/gestalt.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
});
afterAll(async () => {
  delete process.env.CENTRIC_TEILSPEICHERUNG;
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

/* ------------------------------------------------------------------------ */
describe("1. Lesematrix: Rolle × Feld × Person (GET /api/bestand)", () => {
  let token;
  const lies = async (k) => {
    const g = await anfrage("/api/bestand", { token: token[k] });
    expect(g.status, k).toBe(200);
    return { m: g.bestand.mandanten[0], json: JSON.stringify(g) };
  };
  beforeAll(async () => { ({ token } = await neuerRaum()); });

  /** Eigene Person: Zuordnungen ohne Stempel, nur deren Modelle ohne Stempel, sonst nichts davon. */
  const nurEigenes = (k, ich, modelle) => it(`${k}: nur die eigene Person (${ich}), ohne Stempel; Modelle ${modelle.join(", ")}`, async () => {
    const { m, json } = await lies(k);
    expect(pers(m, ich).schichtmodellZuordnungen, `${k} eigene`).toEqual(ohneStempel(Z[ich]()));
    for (const p of m.personen) if (p.id !== ich) expect(hat(p, "schichtmodellZuordnungen"), `${k} fremd ${p.id}`).toBe(false);
    expect(m.schichtmodelle, `${k} Modelle`).toEqual(modelle.map(modellOhneStempel));
    for (const id of MODELL_IDS) {
      expect(json.includes(SVON(id)), `${k} Modellstempel ${id}`).toBe(false);
      if (!modelle.includes(id)) expect(json.includes(NAME(id)), `${k} fremdes Modell ${id}`).toBe(false);
    }
    for (const id of Object.keys(Z)) for (const x of Z[id]()) {
      expect(json.includes(ZVON(x.id)), `${k} Zuordnungsstempel ${x.id}`).toBe(false);
      if (id !== ich) expect(json.includes(`"${x.id}"`), `${k} fremde Zuordnung ${x.id}`).toBe(false);
    }
    expect(json.includes(STEMPEL_AM), `${k} Zeitstempel`).toBe(false);
  });
  nurEigenes("MA_A1", "a1", ["tag", "zukunft"]);
  nurEigenes("SV", "s1", ["nacht"]);

  for (const k of ["MA_M0", "BR", "BT"]) {
    it(`${k}: nichts — keine Zuordnung (auch nicht an der eigenen Person), kein Modell`, async () => {
      const { m, json } = await lies(k);
      expect(json.includes("schichtmodellZuordnungen"), k).toBe(false);
      for (const id of MODELL_IDS) expect(json.includes(NAME(id)), `${k} ${id}`).toBe(false);
      if (k !== "BT") expect(m.schichtmodelle, k).toEqual([]);
      else expect(hat(m, "schichtmodelle"), k).toBe(false);
    });
  }
  for (const k of ["PL", "LT", "KU"]) {
    it(`${k}: unverändert alles — alle Modelle und Zuordnungen mit Stempeln`, async () => {
      const { m } = await lies(k);
      expect(m.schichtmodelle, k).toEqual(MODELL_IDS.map(modell));
      for (const id of Object.keys(Z)) expect(pers(m, id).schichtmodellZuordnungen, `${k} ${id}`).toEqual(Z[id]());
    });
  }
  it("Altbestand ohne die Felder: keine Rolle bekommt ein Feld (keine Migration in der Antwort)", async () => {
    const alt = await neuerRaum({ mit: false });
    for (const k of Object.keys(ROLLEN)) {
      const g = await anfrage("/api/bestand", { token: alt.token[k] });
      expect(g.status, k).toBe(200);
      const m = g.bestand.mandanten[0];
      expect(JSON.stringify(g).includes("schichtmodellZuordnungen"), k).toBe(false);
      expect(hat(m, "schichtmodelle"), k).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------------ */
describe("2. Schreibweg unverändert, kein neues Orakel", () => {
  const putMit = async (token, k, aendern) => {
    const g = await anfrage("/api/bestand", { token: token[k] });
    const rumpf = { bestand: kopie(g.bestand), etag: g.etag, durch: "Pruefung" };
    aendern(rumpf.bestand.mandanten[0]);
    return anfrage("/api/bestand", { methode: "PUT", token: token[k], rumpf });
  };
  const unveraendert = async (raum, info) => {
    const m = await gespeichert(raum);
    expect(m.schichtmodelle, `${info}: Modelle`).toEqual(MODELL_IDS.map(modell));
    for (const id of Object.keys(Z)) expect(pers(m, id).schichtmodellZuordnungen, `${info}: ${id}`).toEqual(Z[id]());
  };

  it("Beschäftigte: Rundweg und geänderte eigene Zuordnung/Modelle bleiben wirkungslos (Stempel bleiben)", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["MA_A1"] });
    const a = await putMit(token, "MA_A1", () => {});
    expect(a.status).toBe(200);
    await unveraendert(raum, "Rundweg");
    const b = await putMit(token, "MA_A1", (m) => {
      pers(m, "a1").schichtmodellZuordnungen[2].modellId = "tag";
      m.schichtmodelle[0].tage = ["-"];
    });
    expect([200, 403]).toContain(b.status);
    await unveraendert(raum, "geändert");
  });
  it("Schichtverantwortung: unverändert zurück = 200 und gespeicherter Stand mit Stempeln", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["SV"] });
    const a = await putMit(token, "SV", () => {});
    expect(a.status, JSON.stringify(a).slice(0, 200)).toBe(200);
    await unveraendert(raum, "SV Rundweg");
  });
  /* Review #372 M1 (festgeschrieben, P2-19 (e)): Eine ältere Client-Kopie der Schichtverantwortung aus der Zeit VOR
     Teil 2 kennt die neuen Felder nicht — sie lässt die eigene Zuordnung weg bzw. schickt [] oder schichtmodelle: []. Seit
     die eigene Person die Felder sieht, liest die Rückfüllung (rechte.mjs, personenRueckfuellen/listeRueckfuellen:
     „sichtbar, aber nicht mitgeschickt = gelöscht“) das als Löschung: 403 statt 200 (Basis 87473f12: 200), fail-closed,
     Bestand byte-gleich, Neuladen löst es. VOR PRODUKTIVSETZEN TEIL 2: entweder die Rückfüllregel für die SV anpassen
     (P2-19 (e) B) oder Deploy-Hinweis „Clients neu laden“. */
  it("Gegenprobe: aktuelle Kopie der Schichtverantwortung, nur eigenes Telefon geändert = 200, Zuordnungen und Modelle bleiben", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["SV"] });
    const a = await putMit(token, "SV", (m) => { pers(m, "s1").telefon = "0301234"; });
    expect(a.status, JSON.stringify(a).slice(0, 200)).toBe(200);
    await unveraendert(raum, "SV Telefon");
  });
  for (const [fall, aendern, text] of [
    ["eigene Zuordnung fehlt", (m) => { delete pers(m, "s1").schichtmodellZuordnungen; }, "An der eigenen Person ist schichtmodellZuordnungen der Leitung vorbehalten."],
    ["eigene Zuordnung []", (m) => { pers(m, "s1").schichtmodellZuordnungen = []; }, "An der eigenen Person ist schichtmodellZuordnungen der Leitung vorbehalten."],
    ["schichtmodelle []", (m) => { m.schichtmodelle = []; }, "Änderungen an schichtmodelle sind der Leitung vorbehalten."],
    ["beides wie vor Teil 2", (m) => { delete pers(m, "s1").schichtmodellZuordnungen; m.schichtmodelle = []; }, null],
  ]) {
    it(`Schichtverantwortung, ältere Kopie (${fall}) mit geändertem eigenem Telefon: 403, Bestand byte-gleich`, async () => {
      const { raum, token } = await neuerRaum({ rollen: ["SV"] });
      const vorher = JSON.stringify(await gespeichert(raum));
      const a = await putMit(token, "SV", (m) => { pers(m, "s1").telefon = "0301234"; aendern(m); });
      expect(a.status, JSON.stringify(a).slice(0, 200)).toBe(403);
      if (text) expect(a.text).toBe(text);
      else expect(a.text).toMatch(/der Leitung vorbehalten/);
      expect(JSON.stringify(await gespeichert(raum))).toBe(vorher);
    });
  }
  it("Schichtverantwortung: eigene Zuordnung geändert = 403 wie jedes Leitungsfeld, nichts gespeichert", async () => {
    const { raum, token } = await neuerRaum({ rollen: ["SV"] });
    const a = await putMit(token, "SV", (m) => { pers(m, "s1").schichtmodellZuordnungen[0].versatz = 0; });
    expect(a.status).toBe(403);
    expect(String(a.text)).toBe("An der eigenen Person ist schichtmodellZuordnungen der Leitung vorbehalten.");
    await unveraendert(raum, "SV eigene geändert");
  });
  it("Schichtverantwortung: verborgenes Modell geändert und unbekanntes Modell angehängt — dieselbe Antwort", async () => {
    const antwort = [];
    for (const fall of ["verborgen", "unbekannt"]) {
      const { raum, token } = await neuerRaum({ rollen: ["SV"] });
      const a = await putMit(token, "SV", (m) => {
        m.schichtmodelle.push({ ...modellOhneStempel(fall === "verborgen" ? "tag" : "gibtsnicht"), tage: ["F"] });
      });
      antwort.push({ status: a.status, fehler: a.fehler, text: a.text });
      await unveraendert(raum, `SV Modell ${fall}`);
    }
    expect(antwort[0].status).toBe(403);
    expect(antwort[0].text).toMatch(/vorbehalten|ändert die Leitung/);
    expect(antwort[1]).toEqual(antwort[0]);
  });
  it("Schichtverantwortung: Zuordnung an fremder Person mit und ohne gespeicherte Liste — dieselbe Antwort", async () => {
    const antwort = [];
    for (const id of ["a1", "m0"]) {
      const { raum, token } = await neuerRaum({ rollen: ["SV"] });
      const a = await putMit(token, "SV", (m) => { pers(m, id).schichtmodellZuordnungen = [{ id: "x", modellId: "nacht", gueltigAb: M2, gueltigBis: null }]; });
      antwort.push({ status: a.status, fehler: a.fehler, text: a.text });
      await unveraendert(raum, `SV fremde Person ${id}`);
    }
    expect(antwort[0].status).toBe(403);
    expect(antwort[0].text).toMatch(/vorbehalten|ändert die Leitung/);
    expect(antwort[1]).toEqual(antwort[0]);
  });
});

/* ------------------------------------------------------------------------ */
describe("3. Teilweg: Versionen über die Sicht (verborgene Modelle ändern sie nicht)", () => {
  it("Leitung benennt ein verborgenes Modell um: Version der Beschäftigten bleibt; ein eigenes Modell: Version ändert sich", async () => {
    const { token } = await neuerRaum({ rollen: ["MA_A1", "LT"] });
    const version = async () => {
      const g = await anfrage("/api/bestand", { token: token.MA_A1 });
      expect(g.teile, "Teilweg angeboten").toBeTruthy();
      return g.teile.versionen["kern:schichtmodelle"];
    };
    const umbenennen = async (id) => {
      const g = await anfrage("/api/bestand", { token: token.LT });
      const rumpf = { bestand: kopie(g.bestand), etag: g.etag, durch: "Pruefung" };
      rumpf.bestand.mandanten[0].schichtmodelle.find((x) => x.id === id).name = `NEU-${id}`;
      const a = await anfrage("/api/bestand", { methode: "PUT", token: token.LT, rumpf });
      expect(a.status, JSON.stringify(a).slice(0, 200)).toBe(200);
    };
    const v0 = await version();
    expect(typeof v0).toBe("string");
    await umbenennen("unbenutzt");
    expect(await version(), "verborgenes Modell").toBe(v0);
    await umbenennen("zukunft");
    expect(await version(), "eigenes Modell").not.toBe(v0);
  });
});

/* ------------------------------------------------------------------------ */
describe("4. Differenz alt/neu über Zufallsbestände (alle Rollen)", () => {
  /* Fester Zufall (keine Uhr): mulberry32. */
  const zufall = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ROLLEN_ALLE = ["mitarbeiter", "subplaner", "betriebsrat", "planer", "leitung", "kunde", "betreiber"];
  function zufallsBestand(r) {
    const wahl = (l) => l[Math.floor(r() * l.length)];
    const modelle = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => ({ id: `z${i}`, name: `Z${i}`, tage: ["F", "-"],
      ...(r() < 0.7 ? { geaendertAm: STEMPEL_AM, geaendertVon: `w${i}`, version: i + 1 } : {}) }));
    const personen = Array.from({ length: 3 + Math.floor(r() * 6) }, (_, i) => {
      const rolle = wahl(["mitarbeiter", "mitarbeiter", "subplaner", "betriebsrat", "planer", "leitung"]);
      const p = person(`q${i}`, rolle, wahl(["e1", "e2", "ep"]), r() < 0.2 ? { springer: true } : {});
      const x = r();
      if (x < 0.6) p.schichtmodellZuordnungen = Array.from({ length: Math.floor(r() * 4) }, (_, j) =>
        ({ id: `q${i}-${j}`, modellId: r() < 0.2 ? "betrieb" : wahl(modelle).id, gueltigAb: `2026-0${1 + j}-01`, gueltigBis: null,
          ...(r() < 0.5 ? { versatz: 0 } : {}), ...(r() < 0.8 ? { geaendertAm: STEMPEL_AM, geaendertVon: `w${j}`, version: 1 } : {}) }));
      else if (x < 0.65) p.schichtmodellZuordnungen = "kaputt";
      return p;
    });
    const b = bestand({ mit: false });
    Object.assign(b.mandanten[0], { personen, ...(r() < 0.9 ? { schichtmodelle: modelle } : {}) });
    return b;
  }
  const ohneZuordnungen = (b) => {
    const k = kopie(b);
    for (const p of k.mandanten[0].personen) delete p.schichtmodellZuordnungen;
    return k;
  };
  /** Die Antwort ohne die neu freigegebenen Teile: keine Zuordnung an Personen, Modelle für Beschäftigte/SV leer. */
  const ohneNeues = (aus, rolle) => {
    const k = kopie(aus);
    const m = k && Array.isArray(k.mandanten) ? k.mandanten[0] : null;
    if (!m) return k;
    for (const p of m.personen || []) if (p && typeof p === "object") delete p.schichtmodellZuordnungen;
    if (["mitarbeiter", "subplaner"].includes(rolle) && hat(m, "schichtmodelle")) m.schichtmodelle = [];
    return k;
  };
  it("150 Zufallsbestände × 7 Rollen × jede Person: außer den neuen Sichten bit-gleich; neue Sicht genau wie festgelegt", () => {
    const r = zufall(4711);
    let geprueft = 0, eigeneGesehen = 0;
    for (let n = 0; n < 150; n += 1) {
      const b = zufallsBestand(r);
      const m = b.mandanten[0];
      const ohne = ohneZuordnungen(b);
      for (const rolle of ROLLEN_ALLE) {
        const ids = ["betreiber", "kunde"].includes(rolle) ? [null] : m.personen.map((p) => p.id);
        for (const ich of ids) {
          const s = { rolle, person: ich, betrieb: 0, einheit: null };
          const neu = bestandFuerRolle(b, s);
          const info = `#${n} ${rolle} ${ich}`;
          expect(JSON.stringify(ohneNeues(neu, rolle)), info).toBe(JSON.stringify(ohneNeues(bestandFuerRolle(ohne, s), rolle)));
          const v = neu.mandanten[0];
          if (["planer", "leitung", "kunde"].includes(rolle)) {
            for (const p of m.personen) expect(pers(v, p.id).schichtmodellZuordnungen, info).toEqual(p.schichtmodellZuordnungen);
            if (hat(m, "schichtmodelle")) expect(v.schichtmodelle, info).toEqual(m.schichtmodelle);
          } else if (rolle === "mitarbeiter" || rolle === "subplaner") {
            const roh = pers(m, ich);
            const eigene = Array.isArray(roh.schichtmodellZuordnungen) ? ohneStempel(roh.schichtmodellZuordnungen) : undefined;
            for (const p of v.personen) {
              if (p.id === ich) expect(p.schichtmodellZuordnungen, info).toEqual(eigene);
              else expect(hat(p, "schichtmodellZuordnungen"), `${info} fremd ${p.id}`).toBe(false);
            }
            if (eigene && eigene.length) eigeneGesehen += 1;
            const genannt = new Set((eigene || []).map((z) => z.modellId));
            if (hat(m, "schichtmodelle")) expect(v.schichtmodelle, info)
              .toEqual(m.schichtmodelle.filter((x) => genannt.has(x.id)).map((x) => ({ id: x.id, name: x.name, tage: x.tage })));
          } else {
            expect(JSON.stringify(neu).includes("schichtmodellZuordnungen"), info).toBe(false);
            if (rolle === "betriebsrat" && hat(m, "schichtmodelle")) expect(v.schichtmodelle, info).toEqual([]);
          }
          geprueft += 1;
        }
      }
    }
    expect(geprueft).toBeGreaterThan(2000);
    expect(eigeneGesehen, "die neue Sicht kam im Zufall vor").toBeGreaterThan(80);
  }, 240000);
  /* Review #372 N4: echter Vergleich ALT gegen NEU für die Rollen ohne neue Sicht. Der Hash stammt aus dem Lauf mit
     server/lib/sicht.mjs von 87473f12 (vor Q4) über dieselben 40 Zufallsbestände (Seed 815, feste Daten, keine Uhr). */
  it("Golden-Hash alt/neu: PL, LT, KU, BR, BT bit-gleich mit dem Stand vor Q4", () => {
    const r = zufall(815);
    const h = createHash("sha256");
    for (let n = 0; n < 40; n += 1) {
      const b = zufallsBestand(r);
      for (const rolle of ["planer", "leitung", "kunde", "betriebsrat", "betreiber"]) {
        const ids = ["betreiber", "kunde"].includes(rolle) ? [null] : b.mandanten[0].personen.map((p) => p.id);
        for (const ich of ids) h.update(JSON.stringify(bestandFuerRolle(b, { rolle, person: ich, betrieb: 0, einheit: null })));
      }
    }
    expect(h.digest("hex")).toBe(GOLDEN_ALT);
  });
});
