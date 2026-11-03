/* ==========================================================================
   MONATSABSCHLUSS: DAS IST BLEIBT EINGEFROREN (WP-16, Review H1)

   Befund des unabhängigen Reviews: Ein abgeschlossener Monat ließ sich über
   den Plan weiter ändern. istZeitFuer nimmt die Planzeit (Abweichung,
   Dienstart samt Pause), wo keine bestätigte Erfassung vorliegt oder die
   Selbstauskunft „wie geplant" lautet. Sonden P1/P2 gegen die echte
   Serverfunktion (Oktober abgeschlossen): PUT der Planung setzt F → N (200),
   PUT der Leitung setzt die Pause von N auf 0 (200) → Ist am 29.10. und
   30.10. stieg von 7,5 auf 8,0 h; eine Abwesenheit im Oktober ließ sich
   anlegen (200) und wirkte; die Prüfsumme sah nichts.

   Geprüft wird hier, mit den Rechnungen der Oberfläche (src/App.jsx:
   istStunden, stundenkonto, zuschlagStunden, datevSaetze, ausgleichPruefen)
   auf dem Stand, den /api/bestand ausliefert:
   - Abschluss friert das Ist je Person und Tag ein; Plan-Korrekturen bleiben
     möglich (200), ändern das Ist des abgeschlossenen Monats aber nicht —
     weder für die Leitung noch in der eigenen Sicht der Beschäftigten;
   - Wiederöffnen verwirft den Freeze (protokolliert: wie viele Personentage
     neu gerechnet werden), danach gilt das neue Ist;
   - die Prüfsumme deckt den Freeze;
   - Wiederherstellen aus einer Sicherung behält Abschluss und Freeze von heute;
   - Betriebsrat-Auswertung (WP-27): das Ist abgeschlossener Monate aus dem Freeze;
   - die Planrechnung des Servers (Schichtfolge, Teilzeit, Posten,
     Abwesenheit) ist dieselbe wie personTag der Oberfläche (Demobetriebe).
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { VERSION } from "../src/migration.js";
import { abschliessen, wiederoeffnen, istAbdruck } from "../server/lib/monatsabschluss.mjs";
import { betriebsratAuswertung } from "../server/lib/br-auswertung.mjs";

const WIRT = "127.0.0.1:3000";
const JETZT = "2026-11-05T09:00:00Z";
const OKT = "2026-10";
let wurzel, laden, daten, B, sitzungAnlegen, A;

let nr = 0;
const anfrage = async (pfad, { methode = "POST", rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.17.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const ROLLEN = { l1: "leitung", p1: "planer", a1: "mitarbeiter", a2: "mitarbeiter", a3: "mitarbeiter", r1: "betriebsrat" };
const token = async (id, raum) => (await sitzungAnlegen({ bestand: raum, name: `V ${id.toUpperCase()}`, rolle: ROLLEN[id], person: id,
  betrieb: 0, mandantId: "m1", einheit: null }, 24 * 3600 * 1000)).token;
const mandant = async (raum) => (await B.bestandLesen(laden(), raum)).bestand.mandanten[0];
const holen = async (id, raum) => {
  const g = await anfrage("bestand", { methode: "GET", token: await token(id, raum) });
  expect(g.status, g.roh).toBe(200);
  return g;
};
const speichern = async (id, raum, aendern) => {
  const g = await holen(id, raum);
  const b = JSON.parse(JSON.stringify(g.bestand));
  aendern(b.mandanten[0]);
  return anfrage("bestand", { methode: "PUT", token: await token(id, raum), rumpf: { bestand: b, etag: g.etag } });
};
const abschluss = async (raum, aktion, extra = {}) =>
  anfrage("monatsabschluss", { token: await token("l1", raum), rumpf: { aktion, monat: OKT, ...extra } });

/** Ein Betrieb ohne Schichtfolge: Dienste nur über Abweichungen — damit jede Stunde nachrechenbar ist. */
function betrieb() {
  const m = A.leererMandant("Einfrieren", "pflege");
  const e = m.einheiten[0].id;
  /* Keine Mindestbesetzung: Die Planänderungen der Sonden sollen ohne Rückfrage der Fachprüfung durchgehen. */
  const ohneVorgabe = { mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }, mindestQual: {} };
  const F = { ...m.dienstarten[0], ...ohneVorgabe, id: "F", name: "Früh", kurz: "F", start: "06:00", ende: "14:00", pause: 30 };
  const N = { ...m.dienstarten[0], ...ohneVorgabe, id: "N", name: "Nacht", kurz: "N", start: "22:00", ende: "06:00", pause: 30 };
  m.id = "m1";
  m.dienstarten = [F, N];
  m.personen = Object.keys(ROLLEN).map((id, i) => ({ ...A.zugangsPerson(ROLLEN[id], e, i + 1), id, vorname: "V", nachname: id.toUpperCase(),
    rolle: ROLLEN[id], eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e }], imSchichtdienst: false, wochenstunden: 39 }));
  m.abweichungen = {};
  for (const t of ["20", "21", "27", "28", "29", "30"]) m.abweichungen[`a1|2026-10-${t}`] = "F";
  m.erfassung = {
    "a1|2026-10-27": { start: "06:00", ende: "14:30", bestaetigt: true, grund: "länger geblieben" },       // 8,0 h
    "a1|2026-10-28": { start: null, ende: null, bestaetigt: true, grund: "" },                              // „wie geplant" → Planzeit
  };
  /* Für die Betriebsrat-Auswertung: drei Personen mit bestätigten Zeiten „wie geplant". */
  for (const pid of ["a2", "a3"]) for (const t of ["12", "13"]) {
    m.abweichungen[`${pid}|2026-10-${t}`] = "F";
    m.erfassung[`${pid}|2026-10-${t}`] = { start: null, ende: null, bestaetigt: true, grund: "" };
  }
  for (const t of ["12", "13"]) {
    m.abweichungen[`a1|2026-10-${t}`] = "F";
    m.erfassung[`a1|2026-10-${t}`] = { start: null, ende: null, bestaetigt: true, grund: "" };
  }
  m.einstempeln = {};
  m.abwesenheiten = [];
  m.anfragen = [];
  m.monatsabschluss = {};
  return m;
}
const raumAnlegen = async (raum) => B.bestandSchreiben(laden(), raum, { version: VERSION, mandanten: [betrieb()] }, { durch: "Pruefung" });

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp16-ist-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(JETZT));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(async () => {
  vi.useRealTimers();
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

const person = (m, id) => m.personen.find((p) => p.id === id);
/** Alles, was Konto, Lohnausgabe, DATEV, Zuschläge und Ausgleich für a1 im Oktober rechnen. */
const auswertungA1 = (m) => {
  const p = person(m, "a1");
  return {
    ist: A.istStunden(m, p, OKT),
    konto: A.stundenkonto(m, p, OKT),
    zuschlag: A.zuschlagStunden(m, p, OKT),
    datev: A.datevSaetze(m, OKT).filter((z) => z.nachname === "A1"),
    ausgleich: A.ausgleichPruefen(m, p, "2026-10-31"),
  };
};
/* Die Sonden des Reviews: Plan F → N am 29. und 30.10. (Planung), Pause N auf 0 (Leitung), Urlaub am 20./21.10. (Planung). */
const sonden = async (raum) => {
  const p1 = await speichern("p1", raum, (m) => { m.abweichungen["a1|2026-10-29"] = "N"; m.abweichungen["a1|2026-10-30"] = "N"; });
  expect(p1.status, p1.roh).toBe(200);
  const p2 = await speichern("l1", raum, (m) => { m.dienstarten = m.dienstarten.map((d) => (d.id === "N" ? { ...d, pause: 0 } : d)); });
  expect(p2.status, p2.roh).toBe(200);
  const p3 = await speichern("p1", raum, (m) => {
    m.abwesenheiten = [...m.abwesenheiten, { id: "u-okt", personId: "a1", art: "urlaub", von: "2026-10-20", bis: "2026-10-21", status: "genehmigt" }];
  });
  expect(p3.status, p3.roh).toBe(200);
};

describe("Abgeschlossener Monat: Plan-, Dienstart- und Abwesenheitsänderungen ändern das Ist nicht (Sonden P1/P2)", { timeout: 120000 }, () => {
  const RAUM = "wp16-ist";
  let vorher;
  it("Abschluss friert das Ist je Person und Tag ein — Planzeit, Selbstauskunft „wie geplant“ und Erfassung", async () => {
    await raumAnlegen(RAUM);
    const offen = auswertungA1((await holen("l1", RAUM)).bestand.mandanten[0]);
    expect(offen.ist.geleistet).toBe(7.5 * 7 + 8);                                       // 20., 21., 12., 13., 28., 29., 30. je 7,5 h; 27. 8,0 h
    const r = await abschluss(RAUM, "abschliessen");
    expect(r.status, r.roh).toBe(200);
    const m = (await holen("l1", RAUM)).bestand.mandanten[0];
    expect(m.istEingefroren["a1|2026-10-29"]).toMatchObject({ std: 7.5, da: { id: "F", start: "06:00", ende: "14:00", pause: 30 } });
    expect(m.istEingefroren["a1|2026-10-28"]).toMatchObject({ std: 7.5, e: 1 });
    expect(m.istEingefroren["a1|2026-10-27"]).toMatchObject({ std: 8, e: 1 });
    expect(m.istEingefroren["a1|2026-10-29"].e).toBeUndefined();
    expect(m.istEingefroren["a1|2026-10-01"]).toBeUndefined();                          // kein Dienst, keine Abwesenheit
    vorher = auswertungA1(m);
    expect(vorher).toEqual(offen);                                                       // Einfrieren ändert nichts am Ergebnis
    expect(istAbdruck(await mandant(RAUM), OKT)).toBe((await mandant(RAUM)).monatsabschluss[OKT].abdruck);
  });
  it("Sonden: F → N (Planung), Pause N → 0 (Leitung), Urlaub im Oktober (Planung) — alle 200, das Ist bleibt 7,5 h je Tag", async () => {
    await sonden(RAUM);
    const m = (await holen("l1", RAUM)).bestand.mandanten[0];
    /* Der Plan zeigt die Änderung … */
    expect(A.personTag(m, person(m, "a1"), "2026-10-29").dienstId).toBe("N");
    expect(A.personTag(m, person(m, "a1"), "2026-10-20").abwesenheit).toMatchObject({ art: "urlaub" });
    /* … das Ist des abgeschlossenen Monats nicht: Konto, Lohn, DATEV, Zuschläge, Ausgleich wie zum Abschluss. */
    expect(auswertungA1(m)).toEqual(vorher);
    expect(auswertungA1(m).ist.geleistet).toBe(7.5 * 7 + 8);
    /* Auch die DATEV-Zeilen für Bereitschaft/Ruf: Die Frühdienstart wird nachträglich zur Bereitschaft — im
       abgeschlossenen Monat zählt die Dienstart, wie sie zum Abschluss galt (Mutante H1-11). */
    const bereit = { ...m, dienstarten: m.dienstarten.map((d) => (d.id === "F" ? { ...d, form: "bereitschaft" } : d)) };
    expect(A.datevSaetze(bereit, OKT).filter((z) => z.nachname === "A1")).toEqual(vorher.datev);
    const bereitOffen = { ...bereit, monatsabschluss: {} };
    expect(A.datevSaetze(bereitOffen, OKT).filter((z) => z.nachname === "A1")).not.toEqual(vorher.datev);
    /* Gegenprobe: ohne den Freeze (Monat offen gerechnet) wären es 29./30. je 8,0 h und zwei Urlaubstage. */
    const ohne = { ...m, monatsabschluss: {} };
    expect(A.istStunden(ohne, person(ohne, "a1"), OKT).geleistet).toBe(7.5 * 3 + 8 + 8 + 8);
  });
  it("Selbstauskunft-Anzeige: „Zeiten bestätigen“ bietet keine Tage des abgeschlossenen Monats an (offen: ja)", async () => {
    const m = (await holen("a1", RAUM)).bestand.mandanten[0];
    const p = person(m, "a1");
    expect(A.offeneErfassung(m, p, "2026-11-04")).toEqual([]);
    const offen = { ...m, monatsabschluss: {} };
    expect(A.offeneErfassung(offen, person(offen, "a1"), "2026-11-04")).toEqual(["2026-10-29", "2026-10-30"]);
  });
  it("die eigene Sicht der Beschäftigten (a1): dasselbe eingefrorene Ist, nur eigene Tage; Betriebsrat: kein Freeze", async () => {
    const m = (await holen("a1", RAUM)).bestand.mandanten[0];
    expect(Object.keys(m.istEingefroren).length).toBeGreaterThan(0);
    expect(Object.keys(m.istEingefroren).every((k) => k.startsWith("a1|"))).toBe(true);
    expect(A.istStunden(m, person(m, "a1"), OKT).geleistet).toBe(vorher.ist.geleistet);
    const br = (await holen("r1", RAUM)).bestand.mandanten[0];
    expect(br.istEingefroren === undefined || Object.keys(br.istEingefroren).length === 0).toBe(true);
  });
  it("über das Speichern lässt sich der Freeze nicht ändern: Leitung 403, Schichtverantwortung/Beschäftigte wirkungslos", async () => {
    const r = await speichern("l1", RAUM, (m) => { m.istEingefroren["a1|2026-10-29"] = { ...m.istEingefroren["a1|2026-10-29"], std: 12 }; });
    expect(r.status, r.roh).toBe(403);
    expect(r.code).toBe("MONAT_ABGESCHLOSSEN");
    const weg = await speichern("l1", RAUM, (m) => { delete m.istEingefroren; });
    expect(weg.status, weg.roh).toBe(200);                                               // nicht mitgeschickt: unverändert
    const a = await speichern("a1", RAUM, (m) => { m.istEingefroren["a1|2026-10-29"] = { std: 12 }; });
    expect([200, 403]).toContain(a.status);
    expect((await mandant(RAUM)).istEingefroren["a1|2026-10-29"].std).toBe(7.5);
  });
  it("Wiederöffnen verwirft den Freeze (Verlauf: Prüfsumme gleich, 4 Personentage neu gerechnet) — danach gilt das neue Ist", async () => {
    const r = await abschluss(RAUM, "wiederoeffnen", { grund: "Nachtdienste korrigiert" });
    expect(r.status, r.roh).toBe(200);
    expect(r.ereignis).toMatchObject({ abdruckGleich: true, istNeu: 4 });
    const m = (await holen("l1", RAUM)).bestand.mandanten[0];
    expect(Object.keys(m.istEingefroren || {}).filter((k) => k.includes("|2026-10-"))).toEqual([]);
    const ist = A.istStunden(m, person(m, "a1"), OKT);
    expect(ist.geleistet).toBe(7.5 * 3 + 8 + 8 + 8);
    expect(ist.gutgeschrieben).toBe(0);                                                  // kein Dienst nach Schichtfolge geplant
    const zu = await abschluss(RAUM, "abschliessen");
    expect(zu.status, zu.roh).toBe(200);
    const n = await mandant(RAUM);
    expect(n.istEingefroren["a1|2026-10-29"]).toMatchObject({ std: 8, da: { id: "N", pause: 0 } });
    expect(n.istEingefroren["a1|2026-10-20"]).toMatchObject({ a: ["urlaub"] });
    expect(n.monatsabschluss[OKT].verlauf[2].abdruck).not.toBe(n.monatsabschluss[OKT].verlauf[0].abdruck);
  });
});

describe("Prüfsumme deckt den Freeze", { timeout: 120000 }, () => {
  it("Freeze direkt in der Ablage geändert (am Server vorbei): Wiederöffnen meldet abdruckGleich false", async () => {
    const raum = "wp16-ist-abdruck";
    await raumAnlegen(raum);
    expect((await abschluss(raum, "abschliessen")).status).toBe(200);
    const roh = await B.bestandLesen(laden(), raum);
    roh.bestand.mandanten[0].istEingefroren["a1|2026-10-29"].std = 12;
    await B.bestandSchreiben(laden(), raum, roh.bestand, { durch: "Pruefung" });
    const r = await abschluss(raum, "wiederoeffnen", { grund: "Prüfung der Änderungsanzeige" });
    expect(r.status, r.roh).toBe(200);
    expect(r.ereignis.abdruckGleich).toBe(false);
  });
});

describe("Wiederherstellen: Abschluss und Freeze von heute, nie aus der Sicherung", { timeout: 120000 }, () => {
  it("Sicherung mit altem Freeze; danach wiedergeöffnet, Plan geändert, neu abgeschlossen; Sicherung zurück → Freeze von heute", async () => {
    const raum = "wp16-ist-wieder";
    await raumAnlegen(raum);
    expect((await abschluss(raum, "abschliessen")).status).toBe(200);
    const t = await token("l1", raum);
    const s = await anfrage("sicherung", { token: t, rumpf: {} });
    expect(s.status, s.roh).toBe(200);
    expect((await abschluss(raum, "wiederoeffnen", { grund: "Nachtdienste korrigiert" })).status).toBe(200);
    await sonden(raum);
    expect((await abschluss(raum, "abschliessen")).status).toBe(200);
    const heute = await mandant(raum);
    expect(heute.istEingefroren["a1|2026-10-29"].std).toBe(8);
    const g = await anfrage("bestand", { methode: "GET", token: t });
    const w = await anfrage("wiederherstellen", { token: t, rumpf: { marke: s.marke, etag: g.etag } });
    expect(w.status, w.roh).toBe(200);
    const n = await mandant(raum);
    expect(n.monatsabschluss[OKT].abgeschlossen).toBe(true);
    expect(Object.fromEntries(Object.entries(n.istEingefroren).filter(([k]) => k.includes("|2026-10-"))))
      .toEqual(Object.fromEntries(Object.entries(heute.istEingefroren).filter(([k]) => k.includes("|2026-10-"))));
    expect(istAbdruck(n, OKT)).toBe(n.monatsabschluss[OKT].abdruck);
    /* Und die Oberfläche rechnet mit dem Freeze von heute — auch wenn der Plan jetzt der der Sicherung ist. */
    const m = (await holen("l1", raum)).bestand.mandanten[0];
    expect(A.personTag(m, person(m, "a1"), "2026-10-29").dienstId).toBe("F");
    expect(A.istStunden(m, person(m, "a1"), OKT).geleistet).toBe(7.5 * 3 + 8 + 8 + 8);
  });
});

describe("Betriebsrat-Auswertung (WP-27): das Ist abgeschlossener Monate aus dem Freeze", { timeout: 120000 }, () => {
  it("Pause der Frühdienstart danach auf 0: offener Monat rechnet neu, abgeschlossener Monat nicht", async () => {
    vi.setSystemTime(new Date(JETZT));
    const m0 = betrieb();
    const r = abschliessen(m0, { monat: OKT }, { personId: "l1", name: "L", rolle: "leitung" }, new Date(JETZT), "ma-x", "2026-11-05");
    if ("status" in r) throw new Error(r.grund);
    const heute = "2026-12-20";                                                          // Nachbestätigungsfrist vorbei
    const zeile = (m) => betriebsratAuswertung(m, heute).zeilen.find((z) => z.monat === OKT && z.einheitId === null);
    const vorher = zeile(r.mandant);
    expect(vorher.istStunden).toBe(7.5 * 6 + 8 + 7.5);                                  // a1: 12., 13., 27., 28.; a2, a3: 12., 13.
    const geaendert = { ...r.mandant, dienstarten: r.mandant.dienstarten.map((d) => (d.id === "F" ? { ...d, pause: 0 } : d)) };
    expect(zeile(geaendert).istStunden).toBe(vorher.istStunden);
    const offen = wiederoeffnen(geaendert, { monat: OKT, grund: "Gegenprobe ohne Freeze" }, { personId: "l1" }, new Date(JETZT), "w-x");
    if ("status" in offen) throw new Error(offen.grund);
    expect(zeile(offen.mandant).istStunden).not.toBe(vorher.istStunden);
  });
});

describe("Planrechnung des Servers = personTag der Oberfläche (Demobetriebe mit Schichtfolge, Teilzeit, Posten, Abwesenheit)", { timeout: 120000 }, () => {
  it("je Person und Tag dieselbe Dienstart und Abwesenheit; eingefroren dasselbe Ist wie offen gerechnet", async () => {
    /* Dynamisch: Auf dem Stand vor der Auflage gibt es das Modul nicht — die übrigen Prüfungen dieser Datei laufen dort trotzdem. */
    const { istEinfrieren, planTag } = await import("../server/lib/isteinfrieren.mjs");
    const b = A.demobestand();
    const monat = `${new Date().getFullYear()}-03`;
    let tage = 0, posten = 0;
    for (const m of b.mandanten) {
      for (const p of m.personen) {
        for (let i = 1; i <= 31; i++) {
          const d = `${monat}-${String(i).padStart(2, "0")}`;
          const t = A.personTag(m, p, d), s = planTag(m, p, d);
          if (!s) { expect(t.dienstId, `${m.name} ${p.id} ${d}`).toBeNull(); continue; }
          expect(s.dienstId ?? null, `${m.name} ${p.id} ${d}`).toBe(t.dienstId ?? null);
          expect(s.arten.length > 0, `${m.name} ${p.id} ${d}`).toBe(!!t.abwesenheit);
          tage++;
          if (t.dienstId && m.dienstarten.find((x) => x.id === t.dienstId && x.posten)) posten++;
        }
      }
      const zu = { ...m, monatsabschluss: { [monat]: { abgeschlossen: true } }, istEingefroren: istEinfrieren(m, monat) };
      for (const p of m.personen) {
        expect(A.istStunden(zu, p, monat), `${m.name} ${p.id}`).toEqual(A.istStunden(m, p, monat));
        expect(A.zuschlagStunden(zu, p, monat), `${m.name} ${p.id}`).toEqual(A.zuschlagStunden(m, p, monat));
      }
      expect(A.datevSaetze(zu, monat)).toEqual(A.datevSaetze(m, monat));
    }
    expect(tage).toBeGreaterThan(500);
    expect(posten).toBeGreaterThan(0);                                                   // Posten kommen vor (Nordwacht)
  });
});
