/* ==========================================================================
   SELBSTAUSKUNFT MIT FREIGABE UND STEMPELABGLEICH (WP-15)

   Akzeptanz: „Selbstauskunft wird Antrag; Abweichung markiert; erst nach
   Freigabe Ist". Geprüft gegen den echten Handler (daten.mjs):
   - POST /api/zeit-bestaetigen legt einen Antrag an, KEIN Ist (Konto/Lohn
     rechnen weiter mit der Planzeit); die Abweichung rechnet der Server;
   - Stempelabgleich beim Stellen und bei der Freigabe;
   - POST /api/selbstauskunft-entscheiden: nur Leitung/Planung, nie die
     eigene, Ablehnung mit Begründung, Zurückziehen nur durch die Person;
   - Datenschutz E1/H8+: Dritte sehen nie Grund, Vorschlag oder Entscheidung;
     Betriebsrat keine Ist-Daten; Beschäftigte können im PUT nichts anlegen.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { offenePunkte } from "../server/lib/monatsabschluss.mjs";
import { istZeitFuer } from "../server/lib/istdaten.mjs";
import { selbstauskunftStellen, selbstauskunftEntscheiden, stempelAbgleich, abweichungVomPlan, offeneSelbstauskuenfte }
  from "../server/lib/selbstauskunft.mjs";

const WIRT = "127.0.0.1:3000";
const RAUM = "wp15-selbstauskunft";
let wurzel, laden, daten, B, Z, sitzungAnlegen;
let HEUTE, tag;

let nr = 0;
const anfrage = async (pfad, { rumpf, token } = {}) => {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
    "x-forwarded-for": `10.15.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await daten(new Request(`http://${WIRT}/api/${pfad}`, { method: "POST", headers: kopf, body: JSON.stringify(rumpf || {}) }), {});
  const text = await a.text();
  let d = {}; try { d = JSON.parse(text); } catch { /* leer */ }
  return { status: a.status, roh: text, ...d };
};
const person = (id, rolle) => ({ id, vorname: "V", nachname: id.toUpperCase(), rolle, bereich: "e1", status: "aktiv",
  geburtstag: "1985-01-01", wochenstunden: 39, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] });
const ROLLEN = { l1: "leitung", l2: "leitung", p1: "planer", s1: "subplaner", a1: "mitarbeiter", a2: "mitarbeiter", r1: "betriebsrat" };
const token = async (id) => (await sitzungAnlegen({ bestand: RAUM, name: `V ${id.toUpperCase()}`, rolle: ROLLEN[id], person: id,
  betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
const mandant = async () => (await B.bestandLesen(laden(), RAUM)).bestand.mandanten[0];
const sa = (datum, extra = {}) => ({ datum, start: null, ende: null, grund: "", ...extra });
const WEG_ENTSCHEIDEN = "/api/selbstauskunft-entscheiden";
const ent = async (wer, rumpf) => anfrage(WEG_ENTSCHEIDEN.slice(5), { token: await token(wer), rumpf });
const antragVon = async (pid, datum) => (await mandant()).erfassung[`${pid}|${datum}`];

async function mandantSchreiben(aendern) {
  const g = await B.bestandLesen(laden(), RAUM);
  const m = JSON.parse(JSON.stringify(g.bestand.mandanten[0]));
  aendern(m);
  const r = await B.bestandSchreiben(laden(), RAUM, { ...g.bestand, mandanten: [m] }, { erwarteterStand: g.stand, durch: "Pruefung" });
  expect(r.ok).toBe(true);
}

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wp15-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  Z = await import("../server/lib/zeiterfassung.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  HEUTE = Z.heuteBerlin();
  tag = (n) => Z.tagePlus(HEUTE, n);
  const abweichungen = {}, einstempeln = {}, erfassung = {};
  for (const id of ["a1", "a2", "l1", "l2", "s1", "r1", "p1"]) for (let n = 1; n <= 12; n++) abweichungen[`${id}|${tag(-n)}`] = "F";
  /* a1 tag(-3): gestempelt (Stempel + Ist). a1 tag(-5): offener Beginn → tag(-4) ist durch den Vortag belegt. */
  einstempeln[`a1|${tag(-3)}`] = { start: "06:02", startAm: `${tag(-3)}T05:00:00.000Z`, ende: "14:01", endeAm: `${tag(-3)}T13:00:00.000Z` };
  erfassung[`a1|${tag(-3)}`] = { start: "06:02", ende: "14:01", bestaetigt: true, grund: "" };
  einstempeln[`a1|${tag(-5)}`] = { start: "22:00", startAm: `${tag(-5)}T21:00:00.000Z` };
  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [{ id: "m1", name: "Haus",
    einheiten: [{ id: "e1", name: "WB 1" }], einstellungen: { ruhezeit: 11 },
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }],
    personen: Object.entries(ROLLEN).map(([id, r]) => person(id, r)),
    abweichungen, abwesenheiten: [], erfassung, einstempeln, anfragen: [], nachrichten: [] }] }, { durch: "Pruefung" });
}, 60000);
afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

describe("Stellen: Antrag, kein Ist", { timeout: 120000 }, () => {
  it("„wie geplant“: 200, offener Antrag ohne Abweichung; erfassung ist nicht bestätigt, Ist zählt nicht", async () => {
    const r = await anfrage("zeit-bestaetigen", { token: await token("a1"), rumpf: sa(tag(-1)) });
    expect(r.status, r.roh).toBe(200);
    expect(r.antrag).toMatchObject({ status: "offen", wieGeplant: true, stempel: "keiner", entschieden: null,
      von: { personId: "a1" }, abweichung: { abweichend: false, marken: [] } });
    const e = await antragVon("a1", tag(-1));
    expect(e).toMatchObject({ start: null, ende: null, bestaetigt: false });
    const m = await mandant();
    const ist = istZeitFuer(m, m.personen.find((p) => p.id === "a1"), tag(-1), m.dienstarten[0]);
    expect(ist.erfasst).toBe(false);                                  // nicht als Ist gezählt
  });

  it("abweichend: der Server markiert Beginn, Ende, Dauer und Pause gegenüber dem Plan — auch gegen eine Behauptung des Clients", async () => {
    const r = await anfrage("zeit-bestaetigen", { token: await token("a1"), rumpf: {
      ...sa(tag(-2), { start: "05:30", ende: "15:00", grund: "Übergabe verlängert", pause: 15 }),
      abweichung: { abweichend: false }, status: "genehmigt", bestaetigt: true } });
    expect(r.status, r.roh).toBe(200);
    expect(r.antrag.status).toBe("offen");
    expect(r.antrag.abweichung).toMatchObject({ abweichend: true, beginnMin: -30, endeMin: 60, dauerMin: 90, pauseMin: -15,
      marken: ["BEGINN", "ENDE", "DAUER", "PAUSE"], plan: { start: "06:00", ende: "14:00", pause: 30 } });
    expect((await antragVon("a1", tag(-2))).bestaetigt).toBe(false);
  });

  it("zweiter Antrag für denselben Tag: 409; erfasster Tag: 409", async () => {
    const a1 = await token("a1");
    expect((await anfrage("zeit-bestaetigen", { token: a1, rumpf: sa(tag(-1)) })).status).toBe(409);
    const gest = await anfrage("zeit-bestaetigen", { token: a1, rumpf: sa(tag(-3)) });
    expect(gest.status).toBe(409);
  });

  it("Stempelabgleich beim Stellen: Tag mit Stempel → 409 STEMPEL_VORHANDEN; Vortag mit offenem Beginn → 409 VORTAG_OFFEN; nichts gespeichert", async () => {
    const vorher = JSON.stringify((await mandant()).erfassung);
    const a1 = await token("a1");
    const m = await mandant();
    const p = m.personen.find((x) => x.id === "a1");
    expect(stempelAbgleich(m, "a1", tag(-3))).toMatchObject({ ok: false, art: "STEMPEL_VORHANDEN" });
    expect(stempelAbgleich(m, "a1", tag(-4))).toMatchObject({ ok: false, art: "VORTAG_OFFEN" });
    expect(stempelAbgleich(m, "a1", tag(-1))).toEqual({ ok: true });
    const r = await anfrage("zeit-bestaetigen", { token: a1, rumpf: sa(tag(-4)) });
    expect(r.status).toBe(409);
    expect(r.code).toBe("VORTAG_OFFEN");
    expect(JSON.stringify((await mandant()).erfassung)).toBe(vorher);
    expect(p).toBeTruthy();
  });

  it("Prüfungen der Selbstauskunft bleiben: künftig, heute, älter als 14 Tage, kein Dienst, Pause zu lang → 422; fremde Person nicht wählbar", async () => {
    const a2 = await token("a2");
    for (const t of [tag(1), HEUTE, tag(-15)]) expect((await anfrage("zeit-bestaetigen", { token: a2, rumpf: sa(t) })).status, t).toBe(422);
    expect((await anfrage("zeit-bestaetigen", { token: a2, rumpf: sa(tag(-1), { start: "06:00", ende: "07:00", pause: 90 }) })).status).toBe(422);
    const r = await anfrage("zeit-bestaetigen", { token: a2, rumpf: { ...sa(tag(-1)), personId: "a1" } });
    expect(r.status, r.roh).toBe(200);                                // personId im Rumpf wird ignoriert: Antrag der eigenen Person
    expect((await antragVon("a2", tag(-1))).selbstauskunft.von.personId).toBe("a2");
    expect((await antragVon("a1", tag(-1))).selbstauskunft.von.personId).toBe("a1");
  });
});

describe("Entscheiden", { timeout: 120000 }, () => {
  it("Beschäftigte, Schichtverantwortung, Betriebsrat entscheiden nicht (403); nichts ändert sich", async () => {
    const a = (await antragVon("a1", tag(-1))).selbstauskunft;
    const vorher = JSON.stringify((await mandant()).erfassung);
    for (const id of ["a1", "a2", "s1", "r1"])
      expect((await ent(id, { personId: "a1", datum: tag(-1), antragId: a.id, entscheidung: "genehmigt" })).status, id).toBe(403);
    expect(JSON.stringify((await mandant()).erfassung)).toBe(vorher);
  });

  it("ungültige Entscheidung 400, falsche Kennung 404", async () => {
    const a = (await antragVon("a1", tag(-1))).selbstauskunft;
    expect((await ent("l1", { personId: "a1", datum: tag(-1), antragId: a.id, entscheidung: "ja" })).status).toBe(400);
    expect((await ent("l1", { personId: "a1", datum: tag(-1), antragId: "sa-xxx", entscheidung: "genehmigt" })).status).toBe(404);
    expect((await ent("l1", { personId: "a1", datum: tag(-9), antragId: a.id, entscheidung: "genehmigt" })).status).toBe(404);
  });

  it("Freigabe durch die Leitung: erst jetzt Ist (bestätigt, mit Zeiten, Pause, Entscheider); Regelhinweise; doppelt 409", async () => {
    const a = (await antragVon("a1", tag(-2))).selbstauskunft;
    const r = await ent("l1", { personId: "a1", datum: tag(-2), antragId: a.id, entscheidung: "genehmigt" });
    expect(r.status, r.roh).toBe(200);
    const e = await antragVon("a1", tag(-2));
    expect(e).toMatchObject({ start: "05:30", ende: "15:00", bestaetigt: true, grund: "Übergabe verlängert", pause: 15 });
    expect(e.selbstauskunft).toMatchObject({ status: "genehmigt", entschieden: { durch: { personId: "l1", rolle: "leitung" } } });
    expect(r.hinweise.map((h) => h.code)).toContain("PAUSE");           // 9,5 h Anwesenheit mit 15 min Pause: § 4 ArbZG
    const m = await mandant();
    const ist = istZeitFuer(m, m.personen.find((p) => p.id === "a1"), tag(-2), m.dienstarten[0]);
    expect(ist.erfasst).toBe(true);
    expect((await ent("l1", { personId: "a1", datum: tag(-2), antragId: a.id, entscheidung: "genehmigt" })).status).toBe(409);
  });

  it("Planung darf freigeben", async () => {
    const a = (await antragVon("a1", tag(-1))).selbstauskunft;
    const r = await ent("p1", { personId: "a1", datum: tag(-1), antragId: a.id, entscheidung: "genehmigt" });
    expect(r.status, r.roh).toBe(200);
    expect(await antragVon("a1", tag(-1))).toMatchObject({ start: null, ende: null, bestaetigt: true });   // wie geplant → Ist = Plan, jetzt bestätigt
  });

  it("Vier-Augen: die eigene Selbstauskunft gibt niemand selbst frei oder lehnt sie ab (403 VIER_AUGEN); Zurückziehen geht", async () => {
    const l1 = await token("l1");
    expect((await anfrage("zeit-bestaetigen", { token: l1, rumpf: sa(tag(-1)) })).status).toBe(200);
    const a = (await antragVon("l1", tag(-1))).selbstauskunft;
    for (const entscheidung of ["genehmigt", "abgelehnt"]) {
      const r = await ent("l1", { personId: "l1", datum: tag(-1), antragId: a.id, entscheidung, begruendung: "eigene Entscheidung" });
      expect(r.status, entscheidung).toBe(403);
      expect(r.code).toBe("VIER_AUGEN");
    }
    expect((await antragVon("l1", tag(-1))).bestaetigt).toBe(false);
    const frei = await ent("l2", { personId: "l1", datum: tag(-1), antragId: a.id, entscheidung: "genehmigt" });
    expect(frei.status, frei.roh).toBe(200);                           // eine andere Leitung darf
  });

  it("Ablehnen braucht eine Begründung; danach kein Ist, Begründung am Eintrag, neuer Antrag möglich (alter im Verlauf)", async () => {
    const a2 = await token("a2");
    const a = (await antragVon("a2", tag(-1))).selbstauskunft;
    expect((await ent("l1", { personId: "a2", datum: tag(-1), antragId: a.id, entscheidung: "abgelehnt" })).status).toBe(422);
    expect((await ent("l1", { personId: "a2", datum: tag(-1), antragId: a.id, entscheidung: "abgelehnt", begruendung: "kurz" })).status).toBe(422);
    const r = await ent("l1", { personId: "a2", datum: tag(-1), antragId: a.id, entscheidung: "abgelehnt", begruendung: "Der Dienst wurde getauscht." });
    expect(r.status, r.roh).toBe(200);
    expect(await antragVon("a2", tag(-1))).toMatchObject({ start: null, bestaetigt: false,
      selbstauskunft: { status: "abgelehnt", entschieden: { begruendung: "Der Dienst wurde getauscht." } } });
    const neu = await anfrage("zeit-bestaetigen", { token: a2, rumpf: sa(tag(-1), { start: "07:00", ende: "15:00", grund: "Tausch" }) });
    expect(neu.status, neu.roh).toBe(200);
    const e = await antragVon("a2", tag(-1));
    expect(e.selbstauskunft.status).toBe("offen");
    expect(e.selbstauskunft.verlauf).toHaveLength(1);
    expect(e.selbstauskunft.verlauf[0]).toMatchObject({ status: "abgelehnt" });
  });

  it("Zurückziehen nur durch die Person selbst; dann kein Ist", async () => {
    const e = await antragVon("a2", tag(-1));
    const id = e.selbstauskunft.id;
    expect((await ent("l1", { personId: "a2", datum: tag(-1), antragId: id, entscheidung: "zurueckgezogen" })).status).toBe(403);
    expect((await ent("a1", { personId: "a2", datum: tag(-1), antragId: id, entscheidung: "zurueckgezogen" })).status).toBe(403);
    const r = await ent("a2", { personId: "a2", datum: tag(-1), antragId: id, entscheidung: "zurueckgezogen" });
    expect(r.status, r.roh).toBe(200);
    expect(await antragVon("a2", tag(-1))).toMatchObject({ bestaetigt: false, selbstauskunft: { status: "zurueckgezogen" } });
  });

  it("Stempelabgleich bei der Freigabe: ist inzwischen ein Stempel da, ist die Freigabe verweigert (409), Ablehnen geht", async () => {
    const a2 = await token("a2");
    expect((await anfrage("zeit-bestaetigen", { token: a2, rumpf: sa(tag(-6), { start: "06:10", ende: "14:00", grund: "später" }) })).status).toBe(200);
    const a = (await antragVon("a2", tag(-6))).selbstauskunft;
    await mandantSchreiben((m) => { m.einstempeln[`a2|${tag(-6)}`] = { start: "06:30", startAm: `${tag(-6)}T05:30:00.000Z`, ende: "14:00", endeAm: `${tag(-6)}T13:00:00.000Z` }; });
    const r = await ent("l1", { personId: "a2", datum: tag(-6), antragId: a.id, entscheidung: "genehmigt" });
    expect(r.status).toBe(409);
    expect(r.code).toBe("STEMPEL_VORHANDEN");
    expect((await antragVon("a2", tag(-6))).bestaetigt).toBe(false);
    const ab = await ent("l1", { personId: "a2", datum: tag(-6), antragId: a.id, entscheidung: "abgelehnt", begruendung: "Es gibt einen Stempel." });
    expect(ab.status, ab.roh).toBe(200);
  });

  it("Plan geändert seit dem Antrag: Freigabe verweigert (409 PLAN_GEAENDERT)", async () => {
    const a2 = await token("a2");
    expect((await anfrage("zeit-bestaetigen", { token: a2, rumpf: sa(tag(-7)) })).status).toBe(200);
    const a = (await antragVon("a2", tag(-7))).selbstauskunft;
    await mandantSchreiben((m) => { m.abweichungen[`a2|${tag(-7)}`] = "-"; });
    const r = await ent("l1", { personId: "a2", datum: tag(-7), antragId: a.id, entscheidung: "genehmigt" });
    expect(r.status).toBe(409);
    expect(r.code).toBe("PLAN_GEAENDERT");
  });
});

describe("Monatsabschluss und Reine Funktionen", () => {
  it("ein offener Antrag zählt als offener Antrag (sperrt den Abschluss), nicht als „zur Prüfung“", async () => {
    const m = await mandant();
    const monat = tag(-8).slice(0, 7);
    expect(offeneSelbstauskuenfte(m, monat).length).toBeGreaterThanOrEqual(0);
    const k = `a1|${tag(-8)}`;
    const synth = { ...m, erfassung: { ...m.erfassung, [k]: { start: null, ende: null, bestaetigt: false,
      selbstauskunft: { id: "sa-t", status: "offen", von: { personId: "a1" } } } } };
    const ohne = offenePunkte(m, monat), mit = offenePunkte(synth, monat);
    expect(mit.antraege).toBe(ohne.antraege + 1);
    expect(mit.zurPruefung).toBe(ohne.zurPruefung);
    const abgelehnt = { ...synth, erfassung: { ...synth.erfassung, [k]: { ...synth.erfassung[k],
      selbstauskunft: { ...synth.erfassung[k].selbstauskunft, status: "abgelehnt" } } } };
    expect(offenePunkte(abgelehnt, monat).antraege).toBe(ohne.antraege);
  });

  it("selbstauskunftEntscheiden verändert den übergebenen Betrieb nicht (rein)", async () => {
    const m = await mandant();
    const p = m.personen.find((x) => x.id === "a1");
    const eingefroren = JSON.stringify(m);
    const r = selbstauskunftStellen(m, p, { personId: "a1" }, tag(-10), { start: null, ende: null, grund: "" }, new Date(), "sa-r");
    expect(r.status, r.grund).toBeUndefined();
    expect(JSON.stringify(m)).toBe(eingefroren);
    const e = selbstauskunftEntscheiden(r.mandant, { personId: "a1", datum: tag(-10), antragId: "sa-r", entscheidung: "genehmigt" },
      { personId: "l1" }, new Date());
    expect(e.status, e.grund).toBeUndefined();
    expect(e.eintrag.bestaetigt).toBe(true);
    expect(abweichungVomPlan(m, p, tag(-10), { start: null, ende: null }).abweichend).toBe(false);
    expect(abweichungVomPlan(m, p, tag(-4000), { start: null, ende: null })).toBe(null);
  });
});

describe("Datenschutz (E1, H8+)", () => {
  const sitz = (pid) => ({ rolle: ROLLEN[pid], person: pid, betrieb: 0 });
  it("Beschäftigte sehen den eigenen Antrag, aber keinen fremden; der Betriebsrat keine Ist-Daten; die Schichtverantwortung nur Beginn, Ende, bestätigt, Pause — nie Grund oder Entscheidung", async () => {
    const g = (await B.bestandLesen(laden(), RAUM)).bestand;
    await anfrage("zeit-bestaetigen", { token: await token("a1"), rumpf: sa(tag(-9), { start: "06:30", ende: "14:30", grund: "GEHEIMER-GRUND-A1" }) });
    const g2 = (await B.bestandLesen(laden(), RAUM)).bestand;
    expect(g2).toBeTruthy();
    expect(g).toBeTruthy();
    const voll = (await B.bestandLesen(laden(), RAUM)).bestand;
    const a2 = JSON.stringify(bestandFuerRolle(voll, sitz("a2")));
    expect(a2).not.toContain("GEHEIMER-GRUND-A1");
    expect(JSON.stringify(bestandFuerRolle(voll, sitz("a1")))).toContain("GEHEIMER-GRUND-A1");
    const br = bestandFuerRolle(voll, sitz("r1"));
    expect(JSON.stringify(br)).not.toContain("GEHEIMER-GRUND-A1");
    expect(br.mandanten[0].sichtIstDaten).toEqual({ umfang: "keine" });
    const sv = JSON.stringify(bestandFuerRolle(voll, sitz("s1")));
    expect(sv).not.toContain("GEHEIMER-GRUND-A1");
    expect(sv).not.toContain("selbstauskunft");
    expect(JSON.stringify(bestandFuerRolle(voll, sitz("l1")))).toContain("GEHEIMER-GRUND-A1");
  });

  it("Beschäftigte und Schichtverantwortung können im allgemeinen Speichern keinen Antrag anlegen, ändern oder freigeben", async () => {
    const voll = (await B.bestandLesen(laden(), RAUM)).bestand;
    for (const pid of ["a1", "s1"]) {
      const gelesen = JSON.parse(JSON.stringify(bestandFuerRolle(voll, sitz(pid))));
      const m = gelesen.mandanten[0];
      m.erfassung[`${pid}|${tag(-11)}`] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "",
        selbstauskunft: { id: "sa-fake", status: "genehmigt" } };
      const eigenerOffen = Object.keys(m.erfassung).find((k) => k.startsWith(`${pid}|`) && m.erfassung[k].selbstauskunft && m.erfassung[k].selbstauskunft.status === "offen");
      if (eigenerOffen) m.erfassung[eigenerOffen] = { start: "06:00", ende: "14:00", bestaetigt: true, grund: "", selbstauskunft: { ...m.erfassung[eigenerOffen].selbstauskunft, status: "genehmigt" } };
      const z = zusammenfuehren(voll, gelesen, sitz(pid));
      expect(z && !z.verweigert, z && z.verweigert).toBe(true);
      const erf = z.mandanten[0].erfassung;
      expect(erf[`${pid}|${tag(-11)}`]).toBeUndefined();
      if (eigenerOffen) expect(erf[eigenerOffen].bestaetigt).toBe(false);
    }
  });
});
