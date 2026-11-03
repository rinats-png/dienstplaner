/* ==========================================================================
   REVIEW WP-11 (Agent F) — F1, F2, F3 und der Füllstand aus WP-10

   Jeder Fall ist auf dem Stand vor der Korrektur (eb60838) rot.

   Aufruf: npx vitest run pruefungen/review-wp11.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { schutzBefunde, schutzEinsatz } from "../src/regelwerk.js";
import { heuteBerlin, tagePlus } from "../server/lib/zeiterfassung.mjs";

const HEUTE = heuteBerlin();
const tag = (n) => tagePlus(HEUTE, n);
const wochentag = (ab, gesucht) => { for (let n = ab; n < ab + 8; n++) { const t = tag(n); if (new Date(`${t}T12:00:00Z`).getUTCDay() === gesucht) return t; } return null; };
const MITTWOCH = wochentag(3, 3);
const kopie = (x) => JSON.parse(JSON.stringify(x));
const person = (id, rolle, einheit, extra = {}) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  geburtstag: "1980-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }], ...extra });
const SITZ = { SV: { rolle: "subplaner", person: "s1", betrieb: 0 }, PL: { rolle: "planer", person: "p1", betrieb: 0 },
  LT: { rolle: "leitung", person: "l1", betrieb: 0 }, MA: { rolle: "mitarbeiter", person: "m0", betrieb: 0 } };
const schreiben = (g, r, aendern) => {
  const s = kopie(bestandFuerRolle(g, SITZ[r]));
  aendern(s.mandanten[0]);
  return zusammenfuehren(g, s, SITZ[r]);
};

/* ------------------------------------------------------------------------
   F1 — Abwesenheitsarten für die Schichtverantwortung
   ------------------------------------------------------------------------ */
describe("F1: die Schichtverantwortung sieht nur die Arten von vor #6", () => {
  const NEU = ["mutterschutz", "pflegezeit", "familienpflegezeit", "elternzeit", "arbeitsverhinderung", "berufsschule",
    "ehrenamt", "personalvertretung", "atzfreistellung"];
  const g = () => ({ version: 1, stand: 1, mandanten: [{ id: "m1", einheiten: [{ id: "e1" }], dienstarten: [],
    personen: [person("s1", "subplaner", "e1"), person("a1", "mitarbeiter", "e1"), person("m0", "mitarbeiter", "e1")],
    abwesenheiten: [...NEU, "urlaub", "krank", "schulung", "frei", "sonst", "ausgleich"]
      .map((art, i) => ({ id: `ab${i}`, personId: "a1", art, von: tag(i + 1), bis: tag(i + 1) })),
    selbstplanung: [{ id: "sp", monat: tag(3).slice(0, 7), status: "offen", eintraege: [
      { personId: "a1", datum: tag(3), dienstId: "F", hinweise: ["abwesend (Mutterschutz, Beschäftigungsverbot)", "dieser Dienst ist bereits gedeckt"] }] }] }] });
  it("neue Arten nur als „abwesend“, die bisherigen im Klartext", () => {
    const a = bestandFuerRolle(g(), SITZ.SV).mandanten[0].abwesenheiten;
    const art = (i) => a.find((x) => x.id === `ab${i}`).art;
    NEU.forEach((x, i) => expect(art(i), x).toBe("abwesend"));
    expect(["urlaub", "krank", "schulung", "frei", "sonst", "ausgleich"].map((_, i) => art(NEU.length + i)))
      .toEqual(["urlaub", "krank", "schulung", "frei", "sonst", "ausgleich"]);
    for (const x of NEU) expect(JSON.stringify(a)).not.toContain(x);
  });
  it("auch in Hinweisen der Selbstplanung keine Art", () => {
    const e = bestandFuerRolle(g(), SITZ.SV).mandanten[0].selbstplanung[0].eintraege[0];
    expect(e.hinweise).toEqual(["abwesend", "dieser Dienst ist bereits gedeckt"]);
  });
  it("ein unveränderter Rundweg der SV ändert die gespeicherte Art nicht", () => {
    const vorher = g();
    const e = schreiben(vorher, "SV", () => {});
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    expect(e.mandanten[0].abwesenheiten).toEqual(vorher.mandanten[0].abwesenheiten);
    expect(e.mandanten[0].selbstplanung).toEqual(vorher.mandanten[0].selbstplanung);
  });
  it("der Kommentar in abwesenheitsarten.js verweist auf die tatsächliche Stelle", () => {
    const s = readFileSync(path.join(process.cwd(), "src/abwesenheitsarten.js"), "utf8");
    expect(s).not.toContain("abwesenheitSaeubern");
    expect(s).toContain("ABWESENHEITSARTEN_SV");
  });
});

/* ------------------------------------------------------------------------
   F2 — Server-Durchsetzung nicht umgehbar
   ------------------------------------------------------------------------ */
describe("F2: der Server lässt sich nicht über Dienstarten, Zeiten oder Schichtfolge umgehen", () => {
  /* Schichtfolge: 7 Tage, nur Frühdienst; Einheit e1. mu ist im Mutterschutz. */
  const g = () => ({ version: 1, stand: 1, mandanten: [{ id: "m1", einheiten: [{ id: "e1", versatzTage: 0 }],
    dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }, { id: "S", name: "Spät", start: "12:00", ende: "19:00" }],
    zyklus: { tage: ["F", "F", "F", "F", "F", "-", "-"] }, anker: "2026-01-05",
    qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
    personen: [person("mu", "mitarbeiter", "e1", { mutterschutz: true }), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
    abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [], bestaetigungen: [] }] });
  it("(a) neue Dienstart im selben Speichervorgang + Einteilung → abgewiesen", () => {
    const e = schreiben(g(), "PL", (m) => {
      m.dienstarten.push({ id: "N2", name: "Nacht 2", start: "22:00", ende: "06:00" });
      m.abweichungen[`mu|${MITTWOCH}`] = "N2";
    });
    expect(e.verweigert).toMatch(/nicht möglich/);
  });
  it("(a') unbekannte Dienstart → abgewiesen (fail-closed)", () => {
    expect(schreiben(g(), "PL", (m) => { m.abweichungen[`mu|${MITTWOCH}`] = "GIBTSNICHT"; }).verweigert).toMatch(/nicht bekannt/);
  });
  it("(b) Zeiten einer Dienstart, in der eine geschützte Person eingeteilt ist, auf 22–06 → abgewiesen", () => {
    const e = schreiben(g(), "LT", (m) => { const f = m.dienstarten.find((d) => d.id === "F"); f.start = "22:00"; f.ende = "06:00"; });
    expect(e.verweigert).toMatch(/nicht möglich/);
  });
  it("(c) Schichtfolge oder Zugehörigkeit so geändert, dass die Person nachts eingeteilt ist → abgewiesen", () => {
    const zyklus = schreiben(g(), "PL", (m) => {
      m.dienstarten.push({ id: "N", name: "Nacht", start: "22:00", ende: "06:00" });
      m.zyklus = { tage: ["N", "N", "N", "N", "N", "-", "-"] };
    });
    expect(zyklus.verweigert).toMatch(/nicht möglich/);
    /* Zugehörigkeit: In e1 hat mu nachts schon Dienst (Altbestand, Folge F×5, N×2).
       Ein Wechsel nach e2 (Versatz 2 Tage) legt Nächte auf Tage, die vorher Frühdienst
       waren — das ist neu und wird abgewiesen. */
    const g2 = g();
    g2.mandanten[0].einheiten.push({ id: "e2", versatzTage: 2 });
    g2.mandanten[0].dienstarten.push({ id: "N", name: "Nacht", start: "22:00", ende: "06:00" });
    g2.mandanten[0].zyklus = { tage: ["F", "F", "F", "F", "F", "N", "N"] };
    const zug = schreiben(g2, "PL", (m) => {
      m.personen.find((p) => p.id === "mu").zugehoerigkeit.push({ ab: tag(1), einheitId: "e2" });
    });
    expect(zug.verweigert).toMatch(/nicht möglich/);
    /* Versatz der eigenen Einheit verschieben: ebenso. */
    const versatz = schreiben(g2, "PL", (m) => { m.einheiten.find((x) => x.id === "e1").versatzTage = 3; });
    expect(versatz.verweigert).toMatch(/nicht möglich/);
    const anker = schreiben(g(), "PL", (m) => {
      m.dienstarten.push({ id: "N", name: "Nacht", start: "22:00", ende: "06:00" });
      m.zyklus = { tage: ["F", "F", "F", "F", "F", "N", "N"] };            // Wochenende nachts
    });
    expect(anker.verweigert).toMatch(/nicht möglich/);
  });
  it("Altbestand blockiert nicht: ein schon bestehender Befund verhindert keine andere Änderung", () => {
    const alt = g();
    alt.mandanten[0].dienstarten.push({ id: "N", name: "Nacht", start: "22:00", ende: "06:00" });
    alt.mandanten[0].abweichungen[`mu|${tag(10)}`] = "N";                    // Altbestand
    const e = schreiben(alt, "PL", (m) => { m.dienstarten.find((d) => d.id === "S").ende = "18:00"; });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
  });
  it("zulässige Strukturänderungen gehen durch", () => {
    const e = schreiben(g(), "PL", (m) => { m.dienstarten.find((d) => d.id === "F").ende = "13:30"; });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
  });
});

/* ------------------------------------------------------------------------
   F3 — gesetzliches Fenster 20–6 Uhr
   ------------------------------------------------------------------------ */
describe("F3: Nachtruhe 20–6 Uhr, jede Überschneidung", () => {
  const jugend = { geburtstag: tagePlus(HEUTE, -15 * 366) };                 // 15 Jahre (Nachprüfung WP-11: ab 16 gilt 23–6 Uhr)
  const mutter = { mutterschutz: true, geburtstag: "1990-01-01" };
  const spaet = { id: "S", start: "14:00", ende: "22:00", pause: 30 };
  const frueh = { id: "F", start: "06:00", ende: "14:00", pause: 30 };
  const bis2030 = { id: "X", start: "12:00", ende: "20:30", pause: 30 };
  it("Spätdienst 14–22 für eine Fünfzehnjährige: Rechtsverstoß, sperrt", () => {
    expect(schutzBefunde(jugend, spaet, MITTWOCH).map((b) => b.regel)).toContain("JArbSchG § 14");
    expect(schutzEinsatz(jugend, spaet, MITTWOCH).some((b) => b.sperrt)).toBe(true);
  });
  it("Mutterschutz: Dienst bis 20:30 Uhr ist erfasst; Frühdienst 6–14 nicht", () => {
    expect(schutzBefunde(mutter, bis2030, MITTWOCH).map((b) => b.regel)).toContain("MuSchG § 5");
    expect(schutzBefunde(mutter, frueh, MITTWOCH)).toEqual([]);
    expect(schutzBefunde(jugend, frueh, MITTWOCH).filter((b) => b.regel === "JArbSchG § 14")).toEqual([]);
  });
  it("die bekannten Ausnahmen stehen im Regelregister", async () => {
    const { REGELN } = await import("../src/regelregister.js");
    expect(REGELN.find((r) => r.id === "JARBSCHG-14").pruefhinweis).toMatch(/§ 14 Abs\. 2/);
    expect(REGELN.find((r) => r.id === "MUSCHG-05").pruefhinweis).toMatch(/§ 5 Abs\. 2/);
  });
});

/* ------------------------------------------------------------------------
   WP-10: Füllstand des Bestätigungsprotokolls
   ------------------------------------------------------------------------ */
describe("Füllstand: ab 80 % sieht die Leitung eine Warnung", () => {
  it("protokollFuellstand", async () => {
    const { protokollFuellstand } = await import("../server/lib/bestaetigungen.mjs");
    expect(protokollFuellstand(3999).warnung).toBe(false);
    expect(protokollFuellstand(4000)).toMatchObject({ warnung: true, voll: false });
    expect(protokollFuellstand(4000).text).toContain("80 %");
    expect(protokollFuellstand(5000)).toMatchObject({ warnung: true, voll: true });
  });
  it("beim Überschreiten bekommt die Leitung einmal eine Mitteilung vom Server", () => {
    const ein = (id) => ({ id, personId: "a1", datum: MITTWOCH, dienstId: "F", aktion: "einsprung", stufe: "achtung",
      gelesen: true, befunde: [{ regel: "verfuegbarkeit", stufe: "achtung" }], durchId: "x", zeit: "2000-01-01" });
    const g = { version: 1, stand: 1, mandanten: [{ id: "m1", einheiten: [{ id: "e1" }],
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00" }], qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
      personen: [person("a1", "mitarbeiter", "e1"), person("p1", "planer", "ALLE"), person("l1", "leitung", "ALLE")],
      abweichungen: {}, nachrichten: [], anfragen: [], abwesenheiten: [],
      bestaetigungen: Array.from({ length: 3999 }, (_, i) => ein(`alt${i}`)) }] };
    const e = schreiben(g, "PL", (m) => { m.bestaetigungen.unshift(ein("neu")); });
    expect(e && !e.verweigert, e && e.verweigert).toBe(true);
    const n = e.mandanten[0].nachrichten.filter((x) => /^n-protokoll80-/.test(x.id));
    expect(n.map((x) => x.personId)).toEqual(["l1"]);
    const zweimal = schreiben(e, "PL", (m) => { m.bestaetigungen.unshift(ein("noch")); });
    expect(zweimal.mandanten[0].nachrichten.filter((x) => /^n-protokoll80-/.test(x.id))).toHaveLength(1);
  });
  it("die Prüfansicht zeigt Planung und Leitung den Füllstand", () => {
    const app = readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
    expect(app).toContain("const f = protokollFuellstand((m.bestaetigungen || []).length);");
  });
});
