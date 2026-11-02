/* ==========================================================================
   REVIEW WP-10 — Befunde K1, H1, M1, N1 als Prüfung

   Jeder Fall ist auf dem Stand vor der Korrektur (619beec) rot. Geprüft wird
   über die Antwort des Servers (bestandFuerRolle, zusammenfuehren) und, wo
   die Oberfläche nichts exportiert, über ihren Quelltext.

   Aufruf: npx vitest run pruefungen/review-wp10.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const kopie = (x) => JSON.parse(JSON.stringify(x));
const APP = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8").replace(/\r\n/g, "\n");
const funktionAb = (kopf) => { const a = APP.indexOf(kopf); expect(a, kopf).toBeGreaterThan(0); return APP.slice(a, APP.indexOf("\n}\n", a)); };
const aktion = (kopf) => { const a = APP.indexOf(kopf); expect(a, kopf).toBeGreaterThan(0); return APP.slice(a, APP.indexOf("\n      }, \"", a)); };

const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit,
  status: "aktiv", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const SITZ = {
  MA: { rolle: "mitarbeiter", person: "m0", betrieb: 0 }, BR: { rolle: "betriebsrat", person: "r1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "s1", betrieb: 0 }, PL: { rolle: "planer", person: "p1", betrieb: 0 },
  LT: { rolle: "leitung", person: "l1", betrieb: 0 },
};
const GEHEIM = ["MuSchG", "Mutterschutz", "Krank", "schwanger", "KOPF-GEHEIM"];

const bestand = (extra = {}) => ({
  version: 9, stand: 1,
  mandanten: [{
    id: "m1", name: "Haus", einheiten: [{ id: "e1" }, { id: "e2" }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "N", name: "Nacht", start: "22:00", ende: "06:00" }],
    qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("m0", "mitarbeiter", "e1"), person("a1", "mitarbeiter", "e1"), person("b1", "mitarbeiter", "e2"),
      person("r1", "betriebsrat", "ALLE"), person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"),
      person("l1", "leitung", "ALLE"), person("l2", "leitung", "ALLE")],
    abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [],
    selbstplanung: [{ id: "sp1", monat: tag(3).slice(0, 7), status: "uebernommen", uebernommen: 1, verworfen: 3,
      kopfFeld: "KOPF-GEHEIM",
      eintraege: [{ personId: "m0", datum: tag(3), dienstId: "F" }],
      nichtUebernommen: [
        { personId: "b1", datum: tag(3), dienstId: "N", grund: "MuSchG § 5: Nachtarbeit zwischen 20 und 6 Uhr …" },
        { personId: "a1", datum: tag(3), dienstId: "N", grund: "abwesend (Krank)" },
        { personId: "m0", datum: tag(3), dienstId: "N", grund: "schwanger laut Attest", hinweise: ["MuSchG"] }] }],
    ...extra,
  }],
});
const sicht = (r, g = bestand()) => bestandFuerRolle(g, SITZ[r]).mandanten[0];

/* ------------------------------------------------------------------------
   K1 — „nicht übernommen" der Selbstplanung (Art. 9 DSGVO)
   ------------------------------------------------------------------------ */
describe("K1: Rundenkopf der Selbstplanung", () => {
  it("Beschäftigte sehen nur die eigenen nicht übernommenen Einträge, ohne Grundtext, ohne fremde Kopffelder", () => {
    const r = sicht("MA").selbstplanung[0];
    expect(r.nichtUebernommen).toEqual([{ personId: "m0", datum: tag(3), dienstId: "N", grund: "befund" }]);
    for (const g of GEHEIM) expect(JSON.stringify(sicht("MA").selbstplanung), g).not.toContain(g);
  });
  it("die Schichtverantwortung nur eigenen Bereich am Tag, ohne Grundtext", () => {
    const r = sicht("SV").selbstplanung[0];
    expect(r.nichtUebernommen.map((e) => e.personId)).toEqual(["a1", "m0"]);
    for (const e of r.nichtUebernommen) expect(e.grund).toBe("befund");
    for (const g of GEHEIM) expect(JSON.stringify(sicht("SV").selbstplanung), g).not.toContain(g);
  });
  it("der Betriebsrat bekommt die Selbstplanung nicht", () => {
    expect(sicht("BR").selbstplanung || []).toEqual([]);
  });
  it("die Oberfläche speichert den Grund als Kennung, nie den Befundtext", () => {
    const u = aktion("rundeUebernehmen: (id, best) => mUpd((m0) => {");
    expect(u).not.toMatch(/grund: (sperre|ernst\[0\])\.text/);
    expect(u).not.toMatch(/nicht\.push\(\{ \.\.\.e,/);
    expect(u).toContain("grundKennung(");
  });
  it("der Server nimmt neue Einträge nur als Kennung an", () => {
    const g = bestand();
    const s = kopie(bestandFuerRolle(g, SITZ.PL));
    s.mandanten[0].selbstplanung[0].nichtUebernommen = [
      { personId: "b1", datum: tag(4), dienstId: "N", grund: "MuSchG § 5", text: "schwanger", hinweise: ["Krank"] },
      { personId: "a1", datum: tag(4), dienstId: "N", grund: "schutz" }];
    const e = zusammenfuehren(g, s, SITZ.PL);
    expect(e.mandanten[0].selbstplanung[0].nichtUebernommen).toEqual([
      { personId: "b1", datum: tag(4), dienstId: "N", grund: "befund" },
      { personId: "a1", datum: tag(4), dienstId: "N", grund: "schutz" }]);
  });
  it("Beschäftigte und Schichtverantwortung ändern „nicht übernommen“ nicht", () => {
    for (const r of ["MA", "SV"]) {
      const g = bestand();
      const s = kopie(bestandFuerRolle(g, SITZ[r]));
      s.mandanten[0].selbstplanung[0].nichtUebernommen = [{ personId: "b1", datum: tag(4), dienstId: "N", grund: "schutz" }];
      const e = zusammenfuehren(g, s, SITZ[r]);
      /* Der Rundenkopf kommt für beide aus dem gespeicherten Stand (selbstplanungZusammen). */
      expect(e && !e.verweigert, `${r}: ${e && e.verweigert}`).toBe(true);
      expect(e.mandanten[0].selbstplanung[0].nichtUebernommen, r).toEqual(g.mandanten[0].selbstplanung[0].nichtUebernommen);
    }
  });
});

/* ------------------------------------------------------------------------
   H1 — bis zur Fachentscheidung die strenge Kette-B-Variante
   ------------------------------------------------------------------------ */
describe("H1: was sperrt, steht an einer Stelle und ist streng", () => {
  it("SPERR_REGELN: Einschränkungen, Bestand, gesetzliche Qualifikation, Einweisung, Ruhezeit < 11 h sperren", async () => {
    const W = await import("../src/warnstufen.js");
    expect(W.SPERR_REGELN, "die zentrale Tabelle fehlt").toBeTruthy();
    for (const k of ["bestand", "schutz", "keineNacht", "keinAlleindienst", "maxDiensteWoche",
      "qualifikationGesetzlich", "kompetenz", "ruhezeitGesetz"]) expect(W.SPERR_REGELN[k], k).toBe(true);
    for (const k of ["qualifikationBetrieblich", "ruhezeitBetrieb", "verfuegbarkeit", "teilzeit", "folge", "abwesend"])
      expect(W.SPERR_REGELN[k], k).toBe(false);
    expect(W.sperrtArt("unbekannt"), "unbekannte Art sperrt").toBe(true);
    expect(Object.isFrozen(W.SPERR_REGELN)).toBe(true);
  });
  it("jeder Befund in hindernisBefunde trägt seinen Schlüssel, sperrt kommt nur aus der Tabelle", () => {
    const h = funktionAb("function hindernisBefunde(m, p, d, da) {");
    expect(h).toContain("sperrt: sperrtArt(");
    expect(h.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/sperrt: true/);
    for (const k of ["\"bestand\", \"bestand\"", "\"keineNacht\"", "\"maxDiensteWoche\"", "\"keinAlleindienst\"",
      "\"qualifikationGesetzlich\"", "\"kompetenz\", \"kompetenz\"", "\"ruhezeitGesetz\""])
      expect(h, k).toContain(k);
    /* WP-11: harte Schutzbefunde aus der einen Schutzprüfung heißen „schutz“. */
    expect(h).toMatch(/b\.sperrt \? "schutz"/);
    /* Einschränkungen: Stufe aus derselben Tabelle wie die Planprüfung
       (EINSCHRAENKUNG_BEWERTUNG aus sperrtArt) — streng: Rechtsverstoß. */
    expect(h).toContain("einschraenkung(\"keineNacht\", \"keine Nachtdienste zugelassen\")");
    expect(h).toContain("einschraenkung(\"maxDiensteWoche\"");
    expect(APP).toMatch(/const EINSCHRAENKUNG_BEWERTUNG = Object\.fromEntries\(\["keineNacht", "keinAlleindienst", "maxDiensteWoche"\]\s*\.map\(\(k\) => \[k, sperrtArt\(k\) \? \{ stufe: "recht", schwere: "danger" \}/);
  });
  it("Bewerbung und Selbstplanung sind bei einem sperrenden Befund nicht möglich", () => {
    const bew = funktionAb("function darfSichBewerben(m, personId, a) {");
    expect(bew).toMatch(/const sperre = bef\.find\(\(b\) => b\.sperrt\);\s*if \(sperre\) return \{ darf: false/);
    const selbst = funktionAb("function darfSelbstEintragen(m, runde, personId, datum, dienstId) {");
    expect(selbst).toMatch(/const sperre = bef\.find\(\(b\) => b\.sperrt\);\s*if \(sperre\) return \{ darf: false/);
    expect(selbst).toContain("sperrtArt(\"ruhezeitGesetz\")");
  });
  it("Zuschlag, Übernahme, Einsprung und Tausch prüfen die Sperre selbst", () => {
    for (const k of ["vergibSchicht: (asId, personId, best) => mUpd((m0) => {", "setzeEinsprung: (pid, d, dienstId, best) => mUpd((m0) => {",
      "tauschZuteilen: (id, interessentId, best) => mUpd((m0) => {"])
      expect(aktion(k), k).toMatch(/schutzSperre\(/);
    expect(aktion("rundeUebernehmen: (id, best) => mUpd((m0) => {")).toContain("bef.find((b) => b.sperrt)");
    expect(APP).toContain("const schutzSperre = (m, p, d, da) => (p && da && hindernisBefunde(m, p, d, da).find((b) => b.sperrt)) || null;");
  });
});

/* ------------------------------------------------------------------------
   M1, N1 — Bestätigungsprotokoll ohne Freitext, Betriebsrat nur Monat
   ------------------------------------------------------------------------ */
describe("M1/N1: Befunde nur als Katalogkennung, Betriebsrat ohne Tag und Dienst, Grenzen", () => {
  const neu = (id, extra = {}) => ({ id, personId: "b1", datum: tag(3), dienstId: "F", aktion: "einsprung", stufe: "achtung",
    gelesen: true, befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung" }], grundArt: null, ...extra });
  const speichern = (g, rolle, liste) => {
    const s = kopie(bestandFuerRolle(g, SITZ[rolle]));
    s.mandanten[0].bestaetigungen = [...liste, ...(s.mandanten[0].bestaetigungen || [])];
    return zusammenfuehren(g, s, SITZ[rolle]);
  };
  it("ein Befund mit Freitext wird abgewiesen, gespeichert wird nur Kennung und Stufe", () => {
    const frei = speichern(bestand(), "PL", [neu("x1", { befunde: [{ stufe: "achtung", text: "Frau N b1 ist schwanger", quelle: "MuSchG" }] })]);
    expect(frei.verweigert).toBeTruthy();
    const e = speichern(bestand(), "PL", [neu("x2", { befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung", text: "Frau N b1 ist schwanger" }] })]);
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    expect(e.mandanten[0].bestaetigungen[0].befunde).toEqual([{ regel: "ruhezeitBetrieb", stufe: "achtung" }]);
    expect(JSON.stringify(e.mandanten[0].bestaetigungen)).not.toContain("schwanger");
  });
  it("ein sperrender Befund lässt sich nicht bestätigen (Server)", () => {
    for (const regel of ["schutz", "keineNacht", "maxDiensteWoche", "keinAlleindienst", "qualifikationGesetzlich",
      "kompetenz", "ruhezeitGesetz", "bestand"]) {
      const e = speichern(bestand(), "PL", [neu("x3", { stufe: "recht", befunde: [{ regel, stufe: "recht" }] })]);
      expect(e.verweigert, regel).toMatch(/sperrender Befund/);
    }
  });
  it("der Betriebsrat sieht nur Zählwerte je Monat, Regel und Stufe, unter 3 als „<3“ (Nachprüfung M1-Rest)", () => {
    const e = speichern(bestand(), "PL", [neu("x4"), neu("x5", { personId: "a1" }), neu("x6", { personId: "m0" }),
      neu("x7", { befunde: [{ regel: "abwesend", stufe: "achtung" }] })]);
    const br = bestandFuerRolle(e, SITZ.BR).mandanten[0].bestaetigungen;
    expect(br).toEqual([
      { monat: tag(3).slice(0, 7), regel: "abwesend", stufe: "achtung", anzahl: "<3" },
      { monat: tag(3).slice(0, 7), regel: "ruhezeitBetrieb", stufe: "achtung", anzahl: 3 }]);
    for (const x of br) expect(Object.keys(x).sort()).toEqual(["anzahl", "monat", "regel", "stufe"]);
  });
  it("die Stufe bestimmt der Katalog, nicht der Client (Nachprüfung N3)", () => {
    const e = speichern(bestand(), "PL", [neu("x8", { stufe: "recht", befunde: [{ regel: "ruhezeitBetrieb", stufe: "recht" }] })]);
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    expect(e.mandanten[0].bestaetigungen[0]).toMatchObject({ stufe: "achtung", befunde: [{ regel: "ruhezeitBetrieb", stufe: "achtung" }] });
    expect(speichern(bestand(), "PL", [neu("x9", { stufe: "hinweis" })]).mandanten[0].bestaetigungen[0].stufe).toBe("achtung");
  });
  it("höchstens 50 neue Einträge je Speichern", () => {
    const viele = Array.from({ length: 51 }, (_, i) => neu(`v${i}`));
    expect(speichern(bestand(), "PL", viele).verweigert).toMatch(/höchstens 50/);
    expect(speichern(bestand(), "PL", viele.slice(0, 50)).verweigert).toBeUndefined();
  });
  it("Fluten verdrängt nichts: an der Gesamtgrenze werden neue abgewiesen, alte bleiben (Nachprüfung B1)", () => {
    const g = bestand({ bestaetigungen: Array.from({ length: 5000 }, (_, i) => ({ ...neu(`alt${i}`), durch: "P", rolle: "planer" })) });
    for (const r of ["PL", "SV"]) {
      const e = speichern(g, r, [neu("ganzneu", { personId: "a1" })]);
      expect(e.verweigert, r).toMatch(/Grenze von 5000/);
    }
    const zurueck = speichern(g, "PL", []);
    expect(zurueck.mandanten[0].bestaetigungen).toHaveLength(5000);
    expect(zurueck.mandanten[0].bestaetigungen.map((b) => b.id)).toContain("alt4999");
  });
  it("Bremse: höchstens 200 Bestätigungen je Person und Tag", () => {
    let g = bestand();
    for (let runde = 0; runde < 4; runde++) {
      const e = speichern(g, "PL", Array.from({ length: 50 }, (_, i) => neu(`r${runde}-${i}`)));
      expect(e && !e.verweigert, `Runde ${runde}: ${e && e.verweigert}`).toBe(true);
      g = e;
    }
    expect(speichern(g, "PL", [neu("zuviel")]).verweigert).toMatch(/je Person und Tag/);
    expect(g.mandanten[0].bestaetigungen).toHaveLength(200);
  });
  it("die Mitteilung an die Leitung baut der Server aus dem Katalog, nicht aus Client-Text", () => {
    const quelle = readFileSync(path.join(process.cwd(), "server/lib/bestaetigungen.mjs"), "utf8");
    expect(quelle).toContain("befundText(");
    expect(quelle).not.toMatch(/b\.befunde\[0\]\.text/);
  });
});
