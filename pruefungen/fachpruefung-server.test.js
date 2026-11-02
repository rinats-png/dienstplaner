/* ==========================================================================
   WP-22 — FACHPRÜFUNGEN AUF DEM SERVER, DIENSTARTEN NUR MIT org.edit

   Bis WP-22 setzte der Server nur die Schutzprüfung durch; Qualifikation,
   Ruhezeit, Höchstarbeitszeit und Mindestbesetzung prüfte allein die
   Oberfläche. Wer `abweichungen` direkt über die API schrieb, kam vorbei.
   Jetzt prüft der Server mit derselben Fassung (einteilungsBefunde,
   server/lib/fachpruefung.mjs) jede neue oder geänderte Einteilung —
   ausdrücklich und mittelbar (Dienstzeiten, Schichtfolge, Zugehörigkeit):
     sperrend (Katalogspalte `sperrt`)  → abgewiesen
     warnend                            → nur mit Bestätigung im selben
                                          Speichervorgang, sonst 409 mit
                                          Befundliste (neutrale Texte)
   Dienstarten anlegen, ändern und löschen darf nur, wer org.edit hat.

   Jeder Fall ist auf dem Stand vor WP-22 (b16e231) rot.

   Aufruf: npx vitest run pruefungen/fachpruefung-server.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const wochentag = (ab, gesucht) => { for (let n = ab; n < ab + 8; n++) { const t = tag(n); if (new Date(`${t}T12:00:00Z`).getUTCDay() === gesucht) return t; } return null; };
const MITTWOCH = wochentag(3, 3);
const DONNERSTAG = tagePlus(MITTWOCH, 1);
const kopie = (x) => JSON.parse(JSON.stringify(x));
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], qualifikationen: [], ...extra });
const SITZ = { PL: { rolle: "planer", person: "p1", betrieb: 0 }, LT: { rolle: "leitung", person: "l1", betrieb: 0 },
  SV: { rolle: "subplaner", person: "s1", betrieb: 0 } };
/* Ein Betrieb ohne Schichtfolge (alle frei) — Einteilungen nur über abweichungen. */
const g = (extra = {}) => ({ version: 1, stand: 1, mandanten: [{ id: "m1", einheiten: [{ id: "e1", versatzTage: 0 }],
  dienstarten: [
    { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 },
    { id: "S", name: "Spät", start: "14:00", ende: "22:00", pause: 30 },
    { id: "L", name: "Lang", start: "07:00", ende: "19:30", pause: 45 },
    { id: "B", name: "Besetzt", start: "08:00", ende: "16:00", pause: 30, mindest: { mo_do: 2, fr: 2, sa: 2, so: 2 } },
  ],
  zyklus: { tage: ["-", "-", "-", "-", "-", "-", "-"] }, anker: "2026-01-05",
  qualifikationen: [
    { id: "qG", name: "Pflegefachkraft", harteSperre: true, ebene: "bund", grundlage: "PflBG § 4" },
    { id: "qB", name: "Hausschulung", harteSperre: true, ebene: "betrieb", grundlage: "Dienstanweisung" },
  ],
  einstellungen: { ruhezeit: 12, maxFolge: 6 },
  personen: [person("a1", "mitarbeiter", "e1", { qualifikationen: ["qG", "qB"] }), person("a2", "mitarbeiter", "e1", { qualifikationen: ["qG", "qB"] }),
    person("oq", "mitarbeiter", "e1"), person("oB", "mitarbeiter", "e1", { qualifikationen: ["qG"] }),
    person("mu", "mitarbeiter", "e1", { mutterschutz: true, qualifikationen: ["qG", "qB"] }),
    person("s1", "subplaner", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
  abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [], ...extra }] });
const schreiben = (gg, r, aendern) => {
  const s = kopie(bestandFuerRolle(gg, SITZ[r]));
  aendern(s.mandanten[0]);
  return zusammenfuehren(gg, s, SITZ[r]);
};
const angenommen = (e) => expect(e && !e.verweigert, e && e.verweigert).toBe(true);
let nr = 0;
const bestaetigung = (personId, datum, dienstId, befunde, gelesen = false) => ({ id: `b-test-${++nr}`, personId, datum, dienstId,
  aktion: "einteilen", stufe: befunde.some((b) => b.stufe === "recht") ? "recht" : "achtung", befunde, gelesen });

describe("Qualifikation", () => {
  it("gesetzlich verbindliche fehlt: abgewiesen (sperrt)", () => {
    const e = schreiben(g(), "PL", (m) => { m.abweichungen[`oq|${MITTWOCH}`] = "F"; });
    expect(e.verweigert).toMatch(/nicht möglich: gesetzlich verbindliche Qualifikation fehlt/);
  });
  it("betrieblich verbindliche fehlt: 409, mit Bestätigung angenommen", () => {
    const ohne = schreiben(g(), "PL", (m) => { m.abweichungen[`oB|${MITTWOCH}`] = "F"; });
    expect(ohne.status).toBe(409);
    expect(ohne.fachbefunde).toEqual([{ personId: "oB", datum: MITTWOCH, dienstId: "F",
      befunde: [{ regel: "qualifikationBetrieblich", stufe: "achtung", text: "betrieblich verbindliche Qualifikation fehlt" }] }]);
    angenommen(schreiben(g(), "PL", (m) => { m.abweichungen[`oB|${MITTWOCH}`] = "F";
      m.bestaetigungen.push(bestaetigung("oB", MITTWOCH, "F", [{ regel: "qualifikationBetrieblich", stufe: "achtung" }])); }));
  });
  it("eine Bestätigung für eine andere Person oder Regel deckt nichts", () => {
    const e = schreiben(g(), "PL", (m) => { m.abweichungen[`oB|${MITTWOCH}`] = "F";
      m.bestaetigungen.push(bestaetigung("a1", MITTWOCH, "F", [{ regel: "qualifikationBetrieblich", stufe: "achtung" }]));
      m.bestaetigungen.push(bestaetigung("oB", MITTWOCH, "F", [{ regel: "ruhezeitBetrieb", stufe: "achtung" }])); });
    expect(e.status).toBe(409);
  });
});

describe("Ruhezeit", () => {
  it("unter 11 Stunden: abgewiesen", () => {
    const gg = g(); gg.mandanten[0].abweichungen[`a1|${MITTWOCH}`] = "S";            // bis 22 Uhr
    const e = schreiben(gg, "PL", (m) => { m.abweichungen[`a1|${DONNERSTAG}`] = "F"; });   // ab 6 Uhr: 8 Stunden
    expect(e.verweigert).toMatch(/Ruhezeit unter 11 Stunden/);
  });
  it("unter der Vorgabe des Betriebs (12 h), über dem Gesetz: 409, mit Bestätigung angenommen", () => {
    const gg = g(); gg.mandanten[0].abweichungen[`a1|${MITTWOCH}`] = "F";   // bis 14 Uhr
    gg.mandanten[0].dienstarten.push({ id: "N1", name: "Nacht kurz", start: "01:30", ende: "05:30", pause: 0 });
    /* Früh bis 14 Uhr, am Folgetag ab 1:30 Uhr: 11,5 Stunden — unter 12, über 11. */
    const ohne = schreiben(gg, "LT", (m) => { m.abweichungen[`a1|${DONNERSTAG}`] = "N1"; });
    expect(ohne.status).toBe(409);
    expect(ohne.fachbefunde[0].befunde.map((b) => b.regel)).toContain("ruhezeitBetrieb");
    angenommen(schreiben(gg, "LT", (m) => { m.abweichungen[`a1|${DONNERSTAG}`] = "N1";
      m.bestaetigungen.push(bestaetigung("a1", DONNERSTAG, "N1", [{ regel: "ruhezeitBetrieb", stufe: "achtung" }])); }));
  });
});

describe("Höchstarbeitszeit (§ 3 ArbZG, je Dienst)", () => {
  it("Dienst über zehn Stunden: 409 „Rechtsverstoß\"; die Bestätigung braucht „gelesen\"", () => {
    const ohne = schreiben(g(), "PL", (m) => { m.abweichungen[`a1|${MITTWOCH}`] = "L"; });   // 11,75 h
    expect(ohne.status).toBe(409);
    expect(ohne.fachbefunde[0].befunde).toEqual([{ regel: "tagesgrenze", stufe: "recht", text: "Dienst über zehn Stunden" }]);
    const ungelesen = schreiben(g(), "PL", (m) => { m.abweichungen[`a1|${MITTWOCH}`] = "L";
      m.bestaetigungen.push(bestaetigung("a1", MITTWOCH, "L", [{ regel: "tagesgrenze", stufe: "recht" }], false)); });
    expect(ungelesen.verweigert).toMatch(/bestaetigungen/);                // ohne „gelesen" nimmt das Protokoll keinen Rechtsverstoß an
    angenommen(schreiben(g(), "PL", (m) => { m.abweichungen[`a1|${MITTWOCH}`] = "L";
      m.bestaetigungen.push(bestaetigung("a1", MITTWOCH, "L", [{ regel: "tagesgrenze", stufe: "recht" }], true)); }));
  });
});

describe("Mindestbesetzung", () => {
  it("fällt ein Dienst unter die Vorgabe: 409 an der Einteilung, die wegfiel", () => {
    const gg = g(); Object.assign(gg.mandanten[0].abweichungen, { [`a1|${MITTWOCH}`]: "B", [`a2|${MITTWOCH}`]: "B" });
    const e = schreiben(gg, "PL", (m) => { m.abweichungen[`a2|${MITTWOCH}`] = "-"; });
    expect(e.status).toBe(409);
    expect(e.fachbefunde).toEqual([{ personId: "a2", datum: MITTWOCH, dienstId: "B",
      befunde: [{ regel: "untergrenze", stufe: "achtung", text: "Mindestbesetzung unterschritten" }] }]);
    angenommen(schreiben(gg, "PL", (m) => { m.abweichungen[`a2|${MITTWOCH}`] = "-";
      m.bestaetigungen.push(bestaetigung("a2", MITTWOCH, "B", [{ regel: "untergrenze", stufe: "achtung" }])); }));
  });
  it("schon unterbesetzt (Altbestand): eine weitere Einteilung blockiert nichts", () => {
    const gg = g(); gg.mandanten[0].abweichungen[`a1|${MITTWOCH}`] = "B";            // 1 von 2
    angenommen(schreiben(gg, "PL", (m) => { m.abweichungen[`a2|${DONNERSTAG}`] = "F"; }));
  });
});

describe("nur neue Befunde, auch mittelbar", () => {
  it("Altbestand blockiert keine andere Änderung", () => {
    const gg = g(); gg.mandanten[0].abweichungen[`oq|${MITTWOCH}`] = "F";            // fehlende Qualifikation, schon gespeichert
    angenommen(schreiben(gg, "PL", (m) => { m.abweichungen[`a1|${DONNERSTAG}`] = "F"; }));
  });
  it("geänderte Dienstzeit erzeugt eine zu kurze Ruhezeit: abgewiesen", () => {
    const gg = g(); gg.mandanten[0].dienstarten.push({ id: "X", name: "Mittag", start: "12:00", ende: "16:00", pause: 0 });
    Object.assign(gg.mandanten[0].abweichungen, { [`a1|${MITTWOCH}`]: "S", [`a1|${DONNERSTAG}`]: "X" });   // 14 Stunden Ruhe
    const e = schreiben(gg, "LT", (m) => { m.dienstarten.find((d) => d.id === "X").start = "06:00"; });   // jetzt 8 Stunden
    expect(e.verweigert).toMatch(/Ruhezeit unter 11 Stunden/);
  });
  it("geänderte Schichtfolge teilt eine Person ohne Qualifikation ein: abgewiesen", () => {
    const e = schreiben(g(), "PL", (m) => { m.zyklus = { tage: ["F", "F", "F", "F", "F", "-", "-"] }; });
    expect(e.verweigert).toMatch(/gesetzlich verbindliche Qualifikation fehlt/);
  });
  it("unbekannte Dienstart: abgewiesen (fail-closed)", () => {
    expect(schreiben(g(), "PL", (m) => { m.abweichungen[`a1|${MITTWOCH}`] = "GIBTSNICHT"; }).verweigert).toMatch(/nicht bekannt/);
  });
});

describe("Datenschutz: Befundtexte neutral", () => {
  it("ein Schutzbefund nennt in der 409 weder Merkmal noch Gesetz", () => {
    const gg = g(); gg.mandanten[0].personen.push(person("j17", "mitarbeiter", "e1", { geburtstag: tagePlus(MITTWOCH, -17 * 365 - 30), qualifikationen: ["qG", "qB"] }));
    const e = schreiben(gg, "PL", (m) => { m.abweichungen[`j17|${MITTWOCH}`] = "S"; });
    expect(e.status).toBe(409);
    const text = JSON.stringify(e.fachbefunde);
    expect(text).not.toMatch(/JArbSchG|MuSchG|Jugend|Mutter|Schwanger|Alter|Geburt/);
    expect(e.fachbefunde[0].befunde).toEqual([{ regel: "schutzWeich", stufe: "achtung", text: "Schutz- oder Einsatzregel der Person" }]);
  });
  it("die Schichtverantwortung bekommt dieselbe neutrale Liste", () => {
    const e = schreiben(g(), "SV", (m) => { m.abweichungen[`oB|${MITTWOCH}`] = "F"; });
    expect(e.status).toBe(409);
    expect(JSON.stringify(e.fachbefunde)).not.toMatch(/mutterschutz|geburtstag|MuSchG/i);
  });
});

describe("Dienstarten nur mit org.edit", () => {
  const aendern = (m) => { m.dienstarten.find((d) => d.id === "F").start = "06:30"; };
  it("Planung: anlegen, ändern, löschen — abgewiesen", () => {
    expect(schreiben(g(), "PL", aendern).verweigert).toMatch(/org\.edit/);
    expect(schreiben(g(), "PL", (m) => { m.dienstarten.push({ id: "Z", name: "Zusatz", start: "08:00", ende: "12:00" }); }).verweigert).toMatch(/org\.edit/);
    expect(schreiben(g(), "PL", (m) => { m.dienstarten = m.dienstarten.filter((d) => d.id !== "L"); }).verweigert).toMatch(/org\.edit/);
  });
  it("Leitung: erlaubt", () => {
    angenommen(schreiben(g(), "LT", aendern));
  });
  it("Planung: die Checkliste einer Dienstart pflegt sie weiter; ein unveränderter Rundweg geht durch", () => {
    angenommen(schreiben(g(), "PL", (m) => { m.dienstarten.find((d) => d.id === "F").checkliste = [{ id: "c1", text: "Übergabe" }]; }));
    angenommen(schreiben(g(), "PL", () => {}));
  });
  it("Schichtverantwortung: Dienstarten bleiben, wie sie gespeichert sind", () => {
    const e = schreiben(g(), "SV", aendern);
    if (!e.verweigert) expect(e.mandanten[0].dienstarten.find((d) => d.id === "F").start).toBe("06:00");
  });
});
