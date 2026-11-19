/* WP-21-SV: Schichtverantwortung auf dem Smartphone, Uebergabe und Krankmeldung.
   Befund aus der Browsermessung (docs/acc45/WP-21-GERAETEMATRIX.md, Abschnitt 10.2): Fuer die Schichtverantwortung fehlte die Ansicht
   "Uebergabe" in der Navigation (0 von 2) und die Krankmeldung lief in eine Zeitueberschreitung (0 von 2).
   Ursache war ein einziger Fehler und kein Rechtefehler: Hatte die Person gestern einen Nachtdienst ohne Einstempeln und liegt sein
   Ende hoechstens vier Stunden zurueck, liefert stempelVorgang { vortag: true, st: null, nachtEnde: true }. Die Startseite las
   daraus st.start und stuerzte ab ("Cannot read properties of null (reading 'start')"); die Anwendung zeigte die Fehlerseite, also
   weder Navigation noch Leiste unten. Die Navigation selbst war richtig: Die Rechtematrix gibt der Schichtverantwortung Uebergaben
   der eigenen Einheit (plan.edit.unit), und der Server prueft das Recht eigenstaendig.
   Hier belegt: (1) Navigation je Rolle (Uebergabe nur mit Paket und plan.edit.unit, nie fuer Beschaeftigte und Betriebsrat),
   (2) die Startseiten (Rechner, Telefon, Karte, Tagesaufgaben) stuerzen bei offenem Nachtdienst von gestern nicht ab und bieten
   "Dienstende stempeln" statt "Eingestempelt gestern null",
   (3) die Krankmeldung bleibt fuer die Schichtverantwortung erreichbar (Leiste unten mit "Krank", Blatt mit der Hauptaktion).
   Aufruf: npm run pruefung:geraete-sv-uebergabe */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { berlinZeitpunkt } from "../server/lib/zeiterfassung.mjs";
import { bestandFuerRolle } from "../server/lib/rechte.mjs";
import { migriere } from "../src/migration.js";
import { personenAngleichen } from "../server/lib/gestalt.mjs";
import { NAV_KUNDE, ansichtErlaubt } from "../src/app/navigation.js";
import { Krankmeldung } from "../src/ansichten/krankmeldung.jsx";
import { DienstKarte } from "../src/ansichten/dienstkarte.jsx";
import { stempelVorgang } from "../src/stempelvorgang.js";

const HEUTE = "2026-11-04", GESTERN = "2026-11-03";
let A;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  /* 07:00: der Nachtdienst 22:00 bis 06:00 ist seit einer Stunde vorbei, innerhalb der Toleranz von vier Stunden. */
  vi.setSystemTime(new Date(berlinZeitpunkt(HEUTE, "07:00")));
  A = await import("../src/App.jsx");
}, 120000);
afterAll(() => { vi.useRealTimers(); });

const ROLLEN = ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"];
function betrieb({ branche = "pflege", nachtGestern = true, pakete = branche === "pflege" ? ["pflege"] : [] } = {}) {
  const m = A.leererMandant("SV-Pruefung", branche);
  const e = m.einheiten[0].id;
  m.pakete = pakete;   // wie der Wegwerf-Betrieb der Browsermessung: das Paket mit Uebergabe ist gebucht
  m.personen = ROLLEN.map((rolle, i) => ({ ...A.zugangsPerson(rolle, e, i + 1), id: rolle, vorname: "Test", nachname: rolle,
    eintritt: "2020-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: e }] }));
  m.abweichungen = nachtGestern ? Object.fromEntries(ROLLEN.map((r) => [`${r}|${GESTERN}`, "N"])) : {};
  m.einstempeln = {};
  return m;
}
function sitzFuer(m, rolle) {
  const mig = migriere({ version: 5, stand: 1, mandanten: [m] });
  if (!mig.ok) throw new Error(`Migration: ${mig.grund}`);
  const ms = bestandFuerRolle(personenAngleichen(mig.bestand), { rolle, person: rolle, betrieb: 0 }).mandanten[0];
  const person = ms.personen.find((p) => p.id === rolle);
  return { rolle: "kunde", db: { mandanten: [ms], session: { mandantId: ms.id, personId: rolle, rolle } }, mandant: ms, person };
}
const akt = new Proxy({}, { get: () => () => {} });
const html = (el) => renderToStaticMarkup(el);
const ansichten = (sitz) => NAV_KUNDE.filter(([, , recht]) => ansichtErlaubt(sitz, recht)).map(([id]) => id);

describe("WP-21-SV: Navigation je Rolle (Uebergabe)", () => {
  it("Uebergabe steht der Schichtverantwortung, der Planung und der Leitung zu (Rechtematrix: Uebergaben der eigenen Einheit)", () => {
    const m = betrieb();
    for (const rolle of ["subplaner", "planer", "leitung"])
      expect(ansichten(sitzFuer(m, rolle)), rolle).toContain("uebergabe");
  });
  it("Uebergabe bekommen Beschaeftigte und Betriebsrat nicht (Rechtematrix: keine Uebergaben)", () => {
    const m = betrieb();
    for (const rolle of ["mitarbeiter", "betriebsrat"])
      expect(ansichten(sitzFuer(m, rolle)), rolle).not.toContain("uebergabe");
  });
  it("ohne gebuchtes Paket mit Uebergabe gibt es die Ansicht fuer niemanden (Sicherheitsbetrieb ohne Paket)", () => {
    const m = betrieb({ branche: "sicherheit" });
    for (const rolle of ROLLEN) expect(ansichten(sitzFuer(m, rolle)), rolle).not.toContain("uebergabe");
  });
  it("die Navigation der Schichtverantwortung enthaelt weder Monatsplan noch Verwaltung (kein Recht daran, nichts verbreitert)", () => {
    const a = ansichten(sitzFuer(betrieb(), "subplaner"));
    for (const id of ["plan", "betrieb", "dienste", "mitnahme", "datenschutz", "pruef"]) expect(a, id).not.toContain(id);
  });
});

describe("WP-21-SV: Startseite bei offenem Nachtdienst von gestern (Absturz behoben)", () => {
  it("Ausgangslage: gestern Nachtdienst, kein Stempel, Ende noch in der Toleranz: vortag ohne Beginn", () => {
    const s = sitzFuer(betrieb(), "subplaner");
    const v = stempelVorgang(s.mandant, s.person, HEUTE);
    expect(v).toMatchObject({ vortag: true, st: null, nachtEnde: true });
  });
  for (const rolle of ["subplaner", "mitarbeiter"]) {   /* Leitung und Planung stehen nicht im Schichtdienst */
    it(`${rolle}: Tagesaufgaben, Startseite am Rechner und Telefon, Dienstkarte stuerzen nicht ab und bieten das Dienstende`, () => {
      const s = sitzFuer(betrieb(), rolle);
      const aufg = A.tagesaufgaben(s).filter((a) => a.art === "stempel");
      expect(aufg).toHaveLength(1);
      expect(aufg[0]).toMatchObject({ aktion: "Dienstende stempeln" });
      expect(aufg[0].titel).not.toMatch(/null|undefined/);
      const rechner = html(h(A.Tagesstart, { sitz: s, akt, gehZu: () => {}, oeffneTag: () => {} }));
      expect(rechner).toContain("Nachtdienst von gestern ohne Einstempeln");
      const telefon = html(h(A.MHeute, { sitz: s, akt, setTab: () => {}, oeffnen: () => {} }));
      expect(telefon).toContain("Nachtdienst von gestern ohne Einstempeln");
      expect(telefon).toContain("Dienstende stempeln");
      const v = stempelVorgang(s.mandant, s.person, HEUTE);
      const da = s.mandant.dienstarten.find((d) => d.id === "N");
      const karte = html(h(DienstKarte, { sitz: s, akt, vorgang: v, meineDa: da }));
      expect(karte).toContain("Nachtdienst von gestern ohne Einstempeln");
      for (const t of [rechner, telefon, karte]) expect(t).not.toMatch(/Eingestempelt gestern (null|undefined)/);
    });
  }
  it("mit echtem Beginn von gestern bleibt der Text wie zuvor (Regression)", () => {
    const m = betrieb();
    m.einstempeln = { [`subplaner|${GESTERN}`]: { start: "22:05", ende: null, startAm: berlinZeitpunkt(GESTERN, "22:05") } };
    const s = sitzFuer(m, "subplaner");
    const telefon = html(h(A.MHeute, { sitz: s, akt, setTab: () => {}, oeffnen: () => {} }));
    expect(telefon).toContain("Eingestempelt gestern 22:05");
    expect(A.tagesaufgaben(s).find((a) => a.art === "stempel")).toMatchObject({ titel: "Im Dienst seit gestern 22:05", aktion: "Ausstempeln" });
  });
});

describe("WP-21-SV: Krankmeldung der Schichtverantwortung (RB-2)", () => {
  it("Die Leiste unten bietet „Krank“ fuer jede Rolle ausser dem Betreiber (Quelltext der Leiste)", async () => {
    const { readFileSync } = await import("node:fs");
    const q = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
    expect(q).toMatch(/\{!istBetreiber && <button onClick=\{\(\) => akt\.oeffneKrankmeldung\(sitz\.person\.id\)\}>/);
  });
  it("Das Blatt bietet der Schichtverantwortung die Hauptaktion; die Meldung ist vorlaeufig, auch bei offenem Nachtdienst", () => {
    const s = sitzFuer(betrieb(), "subplaner");
    const out = html(h(Krankmeldung, { sitz: s, akt, vorauswahl: "subplaner", onClose: () => {} }));
    expect(out).toContain('role="dialog"');
    expect(out).toContain("Wirksam wird sie mit deren endgültiger Bestätigung");
    expect(out).toMatch(/<button\b(?![^>]*disabled)[^>]*>\s*(?:<[^>]+>)*Krank melden/);
  });
});
