/* ==========================================================================
   WARNEN STATT SPERREN (E-19)

   Prüft die reinen Regeln aus src/warnstufen.js und die Serverseite:
   Wer darf das Bestätigungsprotokoll schreiben, wer sieht es, und kommen
   die Eintragungen Beschäftigter in der Selbstplanung beim Server an?

   Aufruf: npx vitest run pruefungen/warnen.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { WARNSTUFEN, stufeRang, hoechsteStufe, ruhezeitStufe, RUHEZEIT_GESETZ,
  ABWEICHUNG_GRUENDE, abwesenheitTagAufheben, bestaetigungsEintraege } from "../src/warnstufen.js";
/* Seit WP-10 prüft der Server die Schichtverantwortung Feld für Feld in
   einheitZusammen (Kette B); einheitDarf gibt es nicht mehr. */
import { eigenesZusammen, bestandFuerRolle, einheitZusammen } from "../server/lib/rechte.mjs";

let zaehler = 0;
const neueId = () => `id${++zaehler}`;

describe("Warnstufen", () => {
  it("ordnet Hinweis < Achtung < Rechtsverstoß", () => {
    expect(stufeRang("hinweis")).toBeLessThan(stufeRang("achtung"));
    expect(stufeRang("achtung")).toBeLessThan(stufeRang("recht"));
    expect(Object.keys(WARNSTUFEN)).toEqual(["hinweis", "achtung", "recht"]);
  });

  it("findet die schwerste Stufe, null ohne Befund", () => {
    expect(hoechsteStufe([])).toBe(null);
    expect(hoechsteStufe([{ stufe: "hinweis" }, { stufe: "recht" }, { stufe: "achtung" }])).toBe("recht");
    expect(hoechsteStufe([{ stufe: "hinweis" }])).toBe("hinweis");
  });

  it("Ruhezeit: unter 11 h Rechtsverstoß, darüber bis zur Betriebsgrenze Achtung", () => {
    expect(RUHEZEIT_GESETZ).toBe(11);
    expect(ruhezeitStufe(8, 11)).toBe("recht");
    expect(ruhezeitStufe(11, 11)).toBe(null);
    expect(ruhezeitStufe(11.5, 12)).toBe("achtung");
    expect(ruhezeitStufe(10, 12)).toBe("recht");
    /* Eine Betriebsgrenze unter dem Gesetz (z. B. § 5 Abs. 2 ArbZG, 10 h)
       macht 10,5 h nicht zum Verstoß gegen die eigene Einstellung. */
    expect(ruhezeitStufe(10.5, 10)).toBe(null);
    expect(ruhezeitStufe(9, 10)).toBe("recht");
  });

  it("bietet die Gründe nach §§ 7, 14, 15 ArbZG und Sonstiges", () => {
    const ids = ABWEICHUNG_GRUENDE.map((g) => g.id);
    expect(ids).toEqual(["notfall", "bewilligung", "tarif", "sonstiges"]);
    expect(ABWEICHUNG_GRUENDE.find((g) => g.id === "notfall").label).toContain("§ 14 ArbZG");
  });
});

describe("Abwesenheit für einen Tag aufheben", () => {
  const abw = [
    { id: "a1", personId: "p1", art: "urlaub", von: "2026-11-10", bis: "2026-11-14" },
    { id: "a2", personId: "p2", art: "urlaub", von: "2026-11-12", bis: "2026-11-12" },
  ];

  it("teilt einen Zeitraum und lässt den Rest stehen", () => {
    const r = abwesenheitTagAufheben(abw, "p1", "2026-11-12", neueId);
    expect(r.aufgehoben.id).toBe("a1");
    const p1 = r.abwesenheiten.filter((a) => a.personId === "p1");
    expect(p1).toHaveLength(2);
    expect(p1[0]).toMatchObject({ id: "a1", von: "2026-11-10", bis: "2026-11-11" });
    expect(p1[1]).toMatchObject({ von: "2026-11-13", bis: "2026-11-14", art: "urlaub" });
    expect(p1[1].id).not.toBe("a1");
  });

  it("entfernt einen eintägigen Eintrag ganz und rührt andere Personen nicht an", () => {
    const r = abwesenheitTagAufheben(abw, "p2", "2026-11-12", neueId);
    expect(r.abwesenheiten.filter((a) => a.personId === "p2")).toHaveLength(0);
    expect(r.abwesenheiten.filter((a) => a.personId === "p1")).toEqual([abw[0]]);
  });

  it("am Rand bleibt die Kennung erhalten", () => {
    const r = abwesenheitTagAufheben(abw, "p1", "2026-11-10", neueId);
    expect(r.abwesenheiten.find((a) => a.personId === "p1")).toMatchObject({ id: "a1", von: "2026-11-11", bis: "2026-11-14" });
  });

  it("ohne Treffer bleibt alles gleich", () => {
    const r = abwesenheitTagAufheben(abw, "p1", "2026-12-01", neueId);
    expect(r.aufgehoben).toBe(null);
    expect(r.abwesenheiten).toEqual(abw);
  });
});

describe("Bestätigungsprotokoll", () => {
  const opt = { neueId, zeit: "2026-10-16T08:00:00.000Z", regelstand: "2026.10" };
  const wer = { personId: "s1", name: "Sina Sub", rolle: "subplaner" };

  it("hält nur Einträge mit ernstem Befund fest", () => {
    const best = { gelesen: true, grundArt: null, eintraege: [
      { personId: "p1", datum: "2026-11-12", dienstId: "N", befunde: [{ stufe: "hinweis", text: "Wunsch nicht erfüllt" }] },
      { personId: "p2", datum: "2026-11-12", dienstId: "F", befunde: [
        { stufe: "recht", regel: "ruhezeitGesetz", text: "Ruhezeit 8 h", quelle: "§ 5 ArbZG" },
        { stufe: "hinweis", text: "ersetzt Spätdienst" }] },
    ] };
    const e = bestaetigungsEintraege(best, wer, "einsprung", opt);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ personId: "p2", stufe: "recht", aktion: "einsprung",
      ohneGrund: true, grund: "", gelesen: true, durch: "Sina Sub", rolle: "subplaner",
      regelstand: "2026.10", zeit: opt.zeit });
    /* Nur Kennung und Stufe, kein Text (Review M1). */
    expect(e[0].befunde).toEqual([{ regel: "ruhezeitGesetz", stufe: "recht" }]);
  });

  it("nimmt den freiwilligen Grund mit, wenn einer gewählt ist", () => {
    const best = { gelesen: true, grundArt: "bewilligung", grundText: "  AZ 12/26 ",
      eintraege: [{ personId: "p3", datum: "2026-11-13", dienstId: "N", befunde: [{ stufe: "recht", text: "x" }] }] };
    const [e] = bestaetigungsEintraege(best, wer, "ausschreibung", opt);
    expect(e).toMatchObject({ grundArt: "bewilligung", grund: "AZ 12/26", ohneGrund: false });
  });

  it("ohne Bestätigung entsteht kein Eintrag", () => {
    expect(bestaetigungsEintraege(null, wer, "x", opt)).toEqual([]);
    expect(bestaetigungsEintraege({ eintraege: [] }, wer, "x", opt)).toEqual([]);
  });
});

describe("Server: Rechte rund um Abweichungen und Selbstplanung", () => {
  const person = (id, einheitId, rolle = "mitarbeiter") =>
    ({ id, vorname: id, nachname: id.toUpperCase(), rolle, zugehoerigkeit: [{ ab: "2020-01-01", einheitId }] });
  /* Die Dienstarten gehören zum Betrieb: Der Server nimmt seit Kette B nur
     Einträge mit bekannter Dienstart an (Selbstplanung, Protokoll), und der
     Bereich der Schichtverantwortung muss eine Einheit des Betriebs sein. */
  const mandant = () => ({
    id: "m1",
    personen: [person("s1", "e1", "subplaner"), person("p1", "e1"), person("p2", "e2"), person("l1", "e1", "leitung")],
    dienstarten: [{ id: "F" }, { id: "S" }, { id: "N" }], einheiten: [{ id: "e1" }, { id: "e2" }],
    abweichungen: {}, nachrichten: [], bestaetigungen: [],
    selbstplanung: [{ id: "sp1", monat: "2026-11", status: "offen", eintraege: [
      { personId: "p2", datum: "2026-11-03", dienstId: "F" }] }],
  });
  const eintrag = (personId) => ({ id: `b-${personId}`, personId, datum: "2026-11-12", dienstId: "N", aktion: "einsprung",
    stufe: "achtung", gelesen: true, befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung" }], durch: "S1", durchId: "s1", rolle: "subplaner" });

  it("Schichtverantwortung darf Abweichungen im eigenen Bereich bestätigen", () => {
    const alt = mandant();
    const neu = { ...alt, bestaetigungen: [{ ...eintrag("p1"), durch: "Jemand anderes", durchId: "l1", rolle: "leitung" }] };
    const r = einheitZusammen(alt, neu, { person: "s1", rolle: "subplaner" });
    expect(r.ok).toBe(true);
    /* Wer bestätigt hat, setzt der Server — nicht die Übermittlung. */
    expect(r.mandant.bestaetigungen).toHaveLength(1);
    expect(r.mandant.bestaetigungen[0]).toMatchObject({ personId: "p1", durch: "s1 S1", durchId: "s1", rolle: "subplaner" });
  });

  it("… aber nicht für eine Person aus einem fremden Bereich", () => {
    const alt = mandant();
    const neu = { ...alt, bestaetigungen: [eintrag("p2")] };
    expect(einheitZusammen(alt, neu, { person: "s1", rolle: "subplaner" }).ok).toBe(false);
  });

  it("Beschäftigte sehen das Protokoll nicht", () => {
    const alt = mandant();
    alt.bestaetigungen = [eintrag("p1")];
    const aus = bestandFuerRolle({ mandanten: [alt] }, { rolle: "mitarbeiter", person: "p1", betrieb: 0 });
    /* Kette B liefert weggelassene Listen als leere Liste aus (sicht.mjs, leerFuer). */
    expect(aus.mandanten[0].bestaetigungen || []).toEqual([]);
    expect(JSON.stringify(aus)).not.toContain("ruhezeitBetrieb");
  });

  it("der Betriebsrat sieht es ohne Namen", () => {
    const alt = mandant();
    alt.bestaetigungen = [eintrag("p1")];
    const aus = bestandFuerRolle({ mandanten: [alt] }, { rolle: "betriebsrat", person: null, betrieb: 0 });
    const b = aus.mandanten[0].bestaetigungen[0];
    expect(b.personId).toBe(null);
    expect(b.durchId).toBe(null);
    expect(b.durch).toBe("subplaner");
    expect(b.befunde[0]).toEqual({ regel: "ruhezeitBetrieb", stufe: "achtung" });
    expect(b.datum).toBeUndefined();     // Review M1: nur der Monat
    expect(b.monat).toBe("2026-11");
  });

  it("Selbstplanung: eigene Eintragungen kommen an, fremde bleiben unberührt", () => {
    const alt = mandant();
    const geschickt = { selbstplanung: [{ ...alt.selbstplanung[0], status: "uebernommen", eintraege: [
      { personId: "p1", datum: "2026-11-05", dienstId: "N", hinweise: ["dieser Dienst ist bereits gedeckt"] },
      /* versucht, den fremden Eintrag zu entfernen und einen fremden anzulegen */
      { personId: "p2", datum: "2026-11-09", dienstId: "S" }] }] };
    const aus = eigenesZusammen(alt, geschickt, "p1").selbstplanung[0];
    expect(aus.status).toBe("offen");
    expect(aus.eintraege).toEqual([
      { personId: "p2", datum: "2026-11-03", dienstId: "F" },
      { personId: "p1", datum: "2026-11-05", dienstId: "N", hinweise: ["dieser Dienst ist bereits gedeckt"] }]);
  });

  it("in einer geschlossenen Runde ändert sich nichts mehr", () => {
    const alt = mandant();
    alt.selbstplanung[0].status = "geschlossen";
    const geschickt = { selbstplanung: [{ ...alt.selbstplanung[0], eintraege: [{ personId: "p1", datum: "2026-11-05", dienstId: "N" }] }] };
    expect(eigenesZusammen(alt, geschickt, "p1").selbstplanung).toEqual(alt.selbstplanung);
  });
});

/* Kette B ist maßgeblich (WP-10): Harte Schutzbefunde (einsatzSchutz) und
   der Alleindienst lassen sich im Warndialog nicht wegbestätigen, und jede
   Planungsaktion prüft sie selbst noch einmal. Gelesen wird der Quelltext —
   App.jsx exportiert diese Teile nicht. */
describe("Warnen statt sperren — außer bei harten Schutzbefunden (Kette B)", () => {
  const app = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8").replace(/\r\n/g, "\n");
  const funktion = (kopf) => { const a = app.indexOf(kopf); expect(a, kopf).toBeGreaterThan(0); return app.slice(a, app.indexOf("\n}\n", a)); };
  it("der Warndialog gibt „dennoch“ bei sperrt: true nicht frei", () => {
    const w = funktion("function Warndialog({ sitz, vorgang, onClose }) {");
    expect(w).toContain("const geschuetzt = gewaehlt.filter((e) => e.befunde.some((b) => b.sperrt));");
    expect(w).toMatch(/const kann = [^;]*!geschuetzt\.length[^;]*;/);
  });
  it("Einsprung, Vergabe, Selbstplanung und Tausch prüfen schutzSperre selbst", () => {
    expect(app).toContain("const schutzSperre = (m, p, d, da) => (p && da && hindernisBefunde(m, p, d, da).find((b) => b.sperrt)) || null;");
    for (const aktion of ["setzeEinsprung: (pid, d, dienstId, best) => mUpd((m0) => {", "vergibSchicht: (asId, personId, best) => mUpd((m0) => {",
      "tauschZuteilen: (id, interessentId, best) => mUpd((m0) => {"]) {
      const a = app.indexOf(aktion);
      expect(a, aktion).toBeGreaterThan(0);
      const rumpf = app.slice(a, app.indexOf("bestaetigungVermerken(", a));
      expect(rumpf, aktion).toMatch(/schutzSperre\(/);
    }
    const runde = app.slice(app.indexOf("rundeUebernehmen: (id, best) => mUpd((m0) => {"));
    expect(runde.slice(0, runde.indexOf("bestaetigungVermerken("))).toContain("const sperre = bef.find((b) => b.sperrt);");
  });
  it("die Mitteilung an die Leitung baut die Oberfläche nicht mehr (d.4: der Server)", () => {
    const v = funktion("function bestaetigungVermerken(m, best, wer, aktion) {");
    expect(v).not.toContain("baueMitteilung");
    expect(v).not.toContain("nachrichten");
  });
});
