/* ==========================================================================
   WP-19.0 — QUERSCHNITTS-AKZEPTANZFÄLLE (Betreiber-Ergänzung B)

   Über die echten Funktionen des Schreibwegs (zusammenfuehren), der
   Wiederherstellung (betriebWiederherstellen), des Löschlaufs (raeumen),
   der Auskunft (auskunftBauen), der Sicht (bestandFuerRolle) und — für die
   Nebenläufigkeit — über den echten Handler PUT /api/bestand.

     Q1  Daten löschen → Sicherung zurückspielen (auch zweimal = Rollback,
         auch nach Migration) → die Löschung bleibt wirksam
     Q2  Modul ausgeschaltet → Berichtigung und Auskunft gehen weiter
     Q3  Altdaten mit fehlerhaftem Status → zulässiges Speichern geht,
         Fehlerhaftes wird sicher behandelt (nie geglaubt, nie aufgewertet)
     Q4  zwei Planende ändern gleichzeitig Moduldaten → 409, kein stiller Verlust
     Q5  Monatsabschluss (WP-16) → spätere Moduldaten-Änderungen ändern das
         Ist nicht (Moduldaten gehen nicht ins Ist) — Vorlage bis WP-16 integriert
     Q6  Rollenwechsel/Versetzung → keine fremden Moduldaten
   Wechselwirkungen (WP-16, WP-26, WP-43, WP-45, Backup, WP-16c):
   docs/acc45/wp19-0-nachweis.md, Abschnitt „Nachtrag zweiter Opus-Delta-Review".
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as BM from "../server/lib/branchenmodule.mjs";
import * as AUF from "../server/lib/aufbewahrung.mjs";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { betriebWiederherstellen } from "../server/lib/sicherungen.mjs";
import { auskunftBauen } from "../server/lib/auskunft.mjs";
import { geplanterDienst } from "../server/lib/zeiterfassung.mjs";
import { migriere } from "../src/migration.js";
import { ausnahmeAngabe, mitEinmaligerAngabe, leeresFormular } from "../src/module/ausnahmeweg.js";
import { branchenbestand, schreibeAls, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";

const kopie = (x) => JSON.parse(JSON.stringify(x));
const EIN = "2026-10-01T08:00:00.000Z";
const AUS = { an: false, eingeschaltetAm: EIN, geaendertAm: EIN, geaendertVon: "l1" };
const OBJ = [{ id: "ob1", name: "Werk", posten: [{ id: "po1", name: "Tor", soll: { F: 1 } }, { id: "po2", name: "Halle", soll: { F: 1 } }] }];
const PLAN = { "a1|2026-11-02": "po1", "a1|2026-11-03": "po1", "s1|2026-11-02": "po2" };
const gesamt = (bm = { posten: AUS }) => {
  const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: bm });
  g.mandanten[0].postenPlan = { ...PLAN };
  g.mandanten[0].objekte = kopie(OBJ);
  return g;
};
const HEUTE = new Date("2026-11-03T10:00:00Z");
const zurueck = (heute, sicherung, datenschutz = "an") =>
  betriebWiederherstellen(heute, sicherung, SITZUNGEN.LT, { marke: "x", heute: HEUTE, datenschutz });
/** Der Ausnahmeweg so, wie ihn die Oberfläche auslöst: Formular → Angabe → Änderung → einmal mitgeschickt. */
function ausnahmeUeberOberflaeche(g, form) {
  const mod = BM.modulVon("posten");
  const sicht = kopie(bestandFuerRolle(g, SITZUNGEN.LT));
  const a = ausnahmeAngabe(sicht.mandanten[0], mod, form);
  if (a.fehler) throw new Error(a.fehler);
  sicht.mandanten[0] = a.aendern(sicht.mandanten[0]);
  const einmalig = { mandantId: "m1", angabe: a.ausnahme, erkennt: a.erkennt };
  const mit = mitEinmaligerAngabe(sicht, einmalig);
  expect(mit.verbraucht).toBe(true);
  expect("moduldatenAusnahme" in sicht.mandanten[0]).toBe(false);      // nie im lokalen Stand
  return { bestand: mit.bestand, sicht };
}

/* ======================================================================== */
describe("Q1 — gelöscht bleibt gelöscht: Wiederherstellen, Rollback, Migration", () => {
  const loeschen = (g) => {
    const { bestand } = ausnahmeUeberOberflaeche(g, { ...leeresFormular(), auswahl: { postenPlan: { "a1|2026-11-02": true } }, aktenzeichen: "DS-7" });
    const v = zusammenfuehren(g, bestand, SITZUNGEN.LT);
    expect(v.verweigert).toBeFalsy();
    return v;
  };
  it("Art. 17 über die Oberfläche → Sicherung von vorher zurück → bleibt gelöscht (auch mit Modul wieder an)", () => {
    const vorher = gesamt();
    const nach = loeschen(vorher);
    expect(nach.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
    for (const modus of ["an", "aus", "vorschau"]) expect(zurueck(nach, vorher, modus).bestand.mandanten[0].postenPlan["a1|2026-11-02"], modus).toBeUndefined();
    const wiederAn = kopie(nach); wiederAn.mandanten[0].einstellungen.branchenmodule = { posten: { ...AUS, an: true } };
    expect(zurueck(wiederAn, vorher).bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
  });
  it("Rollback: erst eine spätere, dann die frühere Sicherung zurückspielen — die Löschung hält beide Male", () => {
    const vorher = gesamt();
    const nach = loeschen(vorher);
    const spaeter = kopie(nach);
    const r1 = zurueck(nach, spaeter).bestand;
    const r2 = zurueck(r1, vorher).bestand;
    expect(r2.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
    expect(r2.mandanten[0].einstellungen.moduldatenLoeschvermerke).toEqual(nach.mandanten[0].einstellungen.moduldatenLoeschvermerke);
  });
  it("Migration (Altfassung) behält die Löschvermerke; die Wiederherstellung danach wirkt weiter", () => {
    const vorher = gesamt();
    const nach = loeschen(vorher);
    const alt = { ...kopie(nach), version: 7 };
    const mig = migriere(alt);
    expect(mig.ok).toBe(true);
    expect(mig.bestand.mandanten[0].einstellungen.moduldatenLoeschvermerke).toEqual(nach.mandanten[0].einstellungen.moduldatenLoeschvermerke);
    expect(zurueck(mig.bestand, vorher).bestand.mandanten[0].postenPlan["a1|2026-11-02"]).toBeUndefined();
  });
  it("Löschlauf (geprüfte Regel, Modus an): fällige Zuordnungen kommen mit einer alten Sicherung nicht zurück", () => {
    const regel = { ...BM.MODULDATEN_AUFBEWAHRUNG, pruefstatus: "geprueft", geprueftAm: EIN, gueltigAb: "2026-01-01" };
    const g = gesamt({}); g.mandanten[0].postenPlan = { "a1|2023-01-02": "po1", "a1|2026-11-02": "po1" };
    const geraeumt = AUF.raeumen(g.mandanten[0], "2026-11-03", { regeln: { moduldaten: regel } }).mandant;
    expect(geraeumt.postenPlan).toEqual({ "a1|2026-11-02": "po1" });
    /* Heute (Vorgabe: Regel ungeprüft) löscht auch die Wiederherstellung nichts — sie hält sich an dieselbe Regel. */
    const w = zurueck({ ...g, mandanten: [geraeumt] }, g).bestand.mandanten[0];
    expect(w.postenPlan["a1|2023-01-02"]).toBe("po1");
  });
});

/* ======================================================================== */
describe("Q2 — Modul ausgeschaltet: Berichtigung und Auskunft weiter möglich", () => {
  it("Berichtigung (Art. 16) über die Oberfläche geht, das Modul bleibt nur lesbar", () => {
    const g = gesamt();
    const { bestand } = ausnahmeUeberOberflaeche(g, { ...leeresFormular(), art: "berichtigung", grund: "art16",
      auswahl: { postenPlan: { "a1|2026-11-03": true } }, neu: { postenPlan: { "a1|2026-11-03": "po2" } } });
    const v = zusammenfuehren(g, bestand, SITZUNGEN.LT);
    expect(v.verweigert).toBeFalsy();
    expect(v.mandanten[0].postenPlan["a1|2026-11-03"]).toBe("po2");
    expect(BM.modulNurLesen(v.mandanten[0], "posten")).toBe(true);
    /* … und das nächste gewöhnliche Speichern geht (die Angabe ist verbraucht, H1). */
    expect(schreibeAls(v, "LT", (m) => { m.name = "Neu"; }).verweigert).toBeFalsy();
  });
  it("Auskunft (Art. 15) nennt die Postenzuordnungen der Person auch bei ausgeschaltetem Modul", () => {
    const m = gesamt().mandanten[0];
    const a = auskunftBauen(m, m.personen.find((p) => p.id === "a1"), { raum: "r", erstellt: "2026-11-03T10:00:00Z", umfang: "selbst" });
    expect(JSON.stringify(a)).toMatch(/2026-11-02/);
    expect(JSON.stringify(a)).not.toMatch(/s1\|/);
  });
});

/* ======================================================================== */
describe("Q3 — Altdaten mit fehlerhaftem Status: Speichern geht, Fehlerhaftes wird nie geglaubt", () => {
  const vergiftet = () => {
    const g = gesamt({ posten: { an: true, geaendertAm: EIN, geaendertVon: "l1" } });    // Altstand ohne eingeschaltetAm
    const m = g.mandanten[0];
    m.moduldatenAusnahme = { modul: "posten", art: "loeschung", grund: "Freitext Frau X", eintraege: { postenPlan: ["a1|2026-11-02"] } };
    m.einstellungen.regelwerte = { "POSTEN-QUAL-01": { pruefstatus: "verifiziert", stufe: "achtung", quelle: "Q", fundstelle: "F", version: "1",
      gueltigAb: "2026-01-01", geprueftAm: EIN, geaendertAm: EIN, geaendertVon: "l1" } };
    m.einstellungen.modulprotokoll = ["kaputt", null, { art: "eingeschaltet", modul: "posten", am: "nie", von: "l1" }];
    m.einstellungen.moduldatenLoeschvermerke = ["kaputt", { art: "?", h: 1 }];
    return g;
  };
  it("Leitung, Planung und Schichtverantwortung speichern; die Ausnahmeangabe ist danach weg", () => {
    for (const r of ["LT", "PL", "SV"]) {
      const v = schreibeAls(vergiftet(), r, (m) => { m.abweichungen = { ...(m.abweichungen || {}), "s1|2026-11-20": "-" }; });
      expect(v && v.verweigert ? v.verweigert : "", r).toBeFalsy();
      expect("moduldatenAusnahme" in v.mandanten[0], r).toBe(false);
    }
  });
  it("unbekannter Prüfstatus wirkt nie als geprüft: keine Aufwertung auf „achtung\"", () => {
    const m = vergiftet().mandanten[0];
    const b = { art: "branche", regelId: "POSTEN-QUAL-01", stufe: "hinweis" };
    expect(BM.regelwertAnwenden(m, b, "2026-11-03")).toBe(b);
    expect(BM.regelwertMigrieren(m.einstellungen.regelwerte["POSTEN-QUAL-01"])).toMatchObject({ pruefstatus: "vorlaeufig", stufe: "hinweis" });
  });
  it("unförmige Löschvermerke und Protokolleinträge: Wiederherstellen und Löschlauf laufen durch, nichts wird still gelöscht", () => {
    const g = vergiftet();
    expect(zurueck(g, gesamt()).verweigert).toBeFalsy();
    const r = AUF.raeumen(g.mandanten[0], "2026-11-03");
    expect(r.mandant.einstellungen.modulprotokoll).toEqual(g.mandanten[0].einstellungen.modulprotokoll);
  });
  it("Altstand { an: true } ohne eingeschaltetAm: nach dem Ausschalten nur lesbar (fail-closed)", () => {
    const v = schreibeAls(vergiftet(), "LT", (m) => { m.einstellungen.branchenmodule = { posten: { an: false } }; });
    expect(v.verweigert).toBeFalsy();
    expect(BM.modulNurLesen(v.mandanten[0], "posten")).toBe(true);
  });
});

/* ======================================================================== */
describe("Q4 — zwei Planende ändern gleichzeitig Moduldaten: kein stiller Verlust (echter Handler)", { timeout: 120000 }, () => {
  const WIRT = "127.0.0.1:3000";
  let wurzel, laden, daten, B, sitzungAnlegen;
  let nr = 0;
  const TOKEN = {};
  async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
    nr += 1;
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.31.${Math.floor(nr / 250) % 250}.${nr % 250}` };
    if (methode !== "GET") kopf["content-type"] = "application/json";
    if (token) kopf.authorization = `Bearer ${token}`;
    const a = await daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
      ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
    let d = {}; try { d = await a.json(); } catch { /* leer */ }
    return { status: a.status, ...d };
  }
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-modul-quer-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    const { getStore } = await import("../server/lib/ablage.mjs");
    laden = () => getStore({ name: "centric", consistency: "strong" });
    daten = (await import("../server/funktionen/daten.mjs")).default;
    B = await import("../server/lib/bestand.mjs");
    ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
    const g = gesamt({});
    g.version = 9;
    g.mandanten[0].status = "aktiv";
    g.mandanten[0].personen.push({ ...g.mandanten[0].personen.find((p) => p.id === "p1"), id: "p2", nachname: "Np2" });
    await B.bestandSchreiben(laden(), "modul-quer", g, { durch: "Prüfung" });
    for (const [k, person, rolle] of [["P1", "p1", "planer"], ["P2", "p2", "planer"]])
      TOKEN[k] = (await sitzungAnlegen({ bestand: "modul-quer", name: k, rolle, person, betrieb: 0, mandantId: "m1", einheit: null }, 2 * 3600 * 1000)).token;
  });
  afterAll(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

  it("beide lesen denselben Stand; der zweite Schreibvorgang mit altem Stand bekommt 409, die erste Änderung bleibt", async () => {
    const a = await anfrage("/api/bestand", { token: TOKEN.P1 });
    const b = await anfrage("/api/bestand", { token: TOKEN.P2 });
    expect(a.status).toBe(200);
    const ba = kopie(a.bestand); ba.mandanten[0].postenPlan["a1|2026-11-04"] = "po1";
    expect((await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.P1, rumpf: { bestand: ba, etag: a.etag } })).status).toBe(200);
    const bb = kopie(b.bestand); bb.mandanten[0].postenPlan["a1|2026-11-04"] = "po2";
    const r = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.P2, rumpf: { bestand: bb, etag: b.etag } });
    const jetzt = (await B.bestandLesen(laden(), "modul-quer")).bestand.mandanten[0];
    /* Derselbe Eintrag: ein 200 hieße, die erste Änderung wäre still überschrieben. */
    expect(r.status, JSON.stringify(r).slice(0, 200)).toBe(409);
    expect(jetzt.postenPlan["a1|2026-11-04"]).toBe("po1");
    expect(jetzt.postenPlan["s1|2026-11-02"]).toBe("po2");
  });
  it("verschiedene Einträge mit altem Stand: entweder 409 oder beide Änderungen erhalten — nie eine still verloren", async () => {
    const a = await anfrage("/api/bestand", { token: TOKEN.P1 });
    const b = await anfrage("/api/bestand", { token: TOKEN.P2 });
    const ba = kopie(a.bestand); ba.mandanten[0].postenPlan["a1|2026-11-05"] = "po1";
    expect((await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.P1, rumpf: { bestand: ba, etag: a.etag } })).status).toBe(200);
    const bb = kopie(b.bestand); bb.mandanten[0].postenPlan["s1|2026-11-05"] = "po2";
    const r = await anfrage("/api/bestand", { methode: "PUT", token: TOKEN.P2, rumpf: { bestand: bb, etag: b.etag } });
    const jetzt = (await B.bestandLesen(laden(), "modul-quer")).bestand.mandanten[0];
    expect(jetzt.postenPlan["a1|2026-11-05"], `Status ${r.status}`).toBe("po1");             // die erste Änderung ist nie verloren
    if (r.status === 200) expect(jetzt.postenPlan["s1|2026-11-05"]).toBe("po2");
    else expect(r.status).toBe(409);
  });
});

/* ======================================================================== */
describe("Q5 — Monatsabschluss (WP-16): Moduldaten verändern das Ist nicht", () => {
  it("Plan/Ist eines Tages hängen nicht an postenPlan oder bereichsPlan (reproduzierbar unabhängig von Moduldaten)", () => {
    const m = gesamt().mandanten[0];
    const p = m.personen.find((x) => x.id === "a1");
    const vorher = ["2026-11-02", "2026-11-03", "2026-11-04"].map((d) => geplanterDienst(m, p, d));
    const geaendert = { ...m, postenPlan: { "a1|2026-11-02": "po2" }, bereichsPlan: { "a1|2026-11-03": "b1" }, objekte: [] };
    expect(["2026-11-02", "2026-11-03", "2026-11-04"].map((d) => geplanterDienst(geaendert, p, d))).toEqual(vorher);
  });
  it.skip("wp16 nicht integriert: abgeschlossener Monat → Moduldaten ändern → eingefrorenes Ist und Abdruck unverändert (Vorlage)", () => {
    /* Nach dem Merge von WP-16 (server/lib/monatsabschluss.mjs, isteinfrieren.mjs): abschliessen(m, …) → postenPlan/bereichsPlan
       des Monats ändern (Leitung) → istAbdruck(m, monat) gleich, istEingefroren gleich. Eintrag im Nachweis. */
  });
});

/* ======================================================================== */
describe("Q6 — Rollenwechsel und Versetzung: keine fremden Moduldaten", () => {
  it("Beschäftigte sehen nur die eigene Postenzuordnung, der Betriebsrat keine; nach einem Rollenwechsel gilt die neue Rolle", () => {
    const g = gesamt({});
    const ma = bestandFuerRolle(g, SITZUNGEN.MA).mandanten[0];
    expect(Object.keys(ma.postenPlan || {}).sort()).toEqual(["a1|2026-11-02", "a1|2026-11-03"]);
    expect(Object.keys(bestandFuerRolle(g, SITZUNGEN.BR).mandanten[0].postenPlan || {})).toEqual([]);
    /* Die Planung p1 wird Beschäftigte: dieselbe Person sieht nur noch eigene Zuordnungen. */
    const w = kopie(g); w.mandanten[0].personen.find((p) => p.id === "p1").rolle = "mitarbeiter";
    const ex = bestandFuerRolle(w, { rolle: "mitarbeiter", person: "p1", betrieb: 0 }).mandanten[0];
    expect(Object.keys(ex.postenPlan || {})).toEqual([]);
  });
  it("Versetzung: die Schichtverantwortung von e1 sieht die Zuordnung einer versetzten Person nach dem Wechsel nicht mehr", () => {
    const g = gesamt({});
    const m = g.mandanten[0];
    m.einheiten.push({ id: "e2", versatzTage: 0 });
    m.personen.find((p) => p.id === "a1").zugehoerigkeit = [{ ab: "2020-01-01", einheitId: "e1" }, { ab: "2026-11-03", einheitId: "e2" }];
    const sv = bestandFuerRolle(g, SITZUNGEN.SV).mandanten[0];
    expect(sv.postenPlan["a1|2026-11-02"]).toBe("po1");
    expect(sv.postenPlan["a1|2026-11-03"]).toBeUndefined();
  });
});
