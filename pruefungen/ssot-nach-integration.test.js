import { describe, it, expect } from "vitest";
import { plan, anwenden, istTeilPr } from "../werkzeug/ssot-nach-integration.mjs";

/* Der Fehler, den diese Prüfung festhält: Ein PR "WP-21 Teil 2: …" setzte WP-21 auf INTEGRATED, obwohl nur ein Teil
   des Pakets integriert war (ebenso OPT-4 und IMP-6). Die Zuordnung über die Paket-ID im Titel bleibt, aber ein Titel,
   der nur einen Teil nennt, führt nie zu INTEGRATED. */
const paket = (id, status, extra = {}) => ({ id, status, stufen: {}, pr: [], notiz: "", ...extra });
const ssot = () => ({ pakete: [paket("WP-21", "BLOCKED"), paket("WP-35", "BLOCKED"), paket("IMP-6", "IN_PROGRESS"), paket("OPT-1", "INTEGRATED", { pr: ["#166"] })] });
const pr = (number, title, headRefName = "x/y") => ({ number, title, headRefName });

describe("istTeilPr", () => {
  it("erkennt Teil N, Teilumfang und Bibliothek im Titel", () => {
    for (const t of [
      "WP-21 Teil 1: Gerätematrix, Messung und erste Korrekturen",
      "WP-21 Teil 2: Bedienabläufe, Querformat",
      "IMP-6: Schichtmodelle importieren (Bibliothek)",
      "OPT-4 Teilumfang: Faktorpflicht",
      "wp-21 teil 3: weiteres",
    ]) expect(istTeilPr(t), t).toBe(true);
  });

  it("lässt vollständige PRs unberührt", () => {
    for (const t of [
      "WP-35 Darstellungsbefunde: kein Querscrollen in Abrechnungsdaten",
      "OPT-1-F Anmeldeweg für Leitungskonten: zweiter Faktor am Konto",
      "IMP-5 und IMP-9: Organisationseinheiten im Import, KI-Schnittstelle ohne Aktivierung",
      "Teilnehmerliste im Export",
      "",
    ]) expect(istTeilPr(t), t).toBe(false);
    expect(istTeilPr(undefined)).toBe(false);
  });
});

describe("istTeilPr: Teil mit Doppelpunkt und Wortformen", () => {
  it("erkennt Titel mit 'Teil:' und 'Teil N' einheitlich", () => {
    for (const t of [
      "WP-33 Teil: Testinfrastruktur für Browserprüfungen",
      "WP-40 Teil: Browser-Abnahme der Kernabläufe",
      "WP-16c Teil: Messung des Korrekturpfads",
      "WP-I24 Teil 1: Einstieg",
      "WP-50 Teil-PR: Grundlage",
      "WP-51 Teilpaket Datenmodell",
      "WP-52 teil - zweiter Schritt",
    ]) expect(istTeilPr(t), t).toBe(true);
  });

  it("erkennt Wörter mit 'teil' im Wortinneren nicht", () => {
    for (const t of ["Urteil der Prüfung", "Anteil der Pflegekräfte", "Teilnehmerliste", "Vorteile im Export", "Mitteilung an Leitung"]) {
      expect(istTeilPr(t), t).toBe(false);
    }
  });
});

describe("plan und anwenden", () => {
  it("Titel mit 'Teil:' ergibt TEILWEISE, nicht INTEGRIERT", () => {
    const s = { pakete: [paket("WP-33", "BLOCKED"), paket("WP-40", "IN_PROGRESS")] };
    expect(plan(s, pr(300, "WP-33 Teil: Testinfrastruktur für Browserprüfungen"))).toEqual([{ id: "WP-33", art: "TEILWEISE", von: "BLOCKED", pr: "#300" }]);
    expect(plan(s, pr(301, "WP-40 Teil: Browser-Abnahme der Kernabläufe"))[0].art).toBe("TEILWEISE");
  });

  it("Teil-PR: TEILWEISE statt INTEGRIERT, Status nie INTEGRATED, Beleg offen", () => {
    const s = ssot();
    const a = plan(s, pr(192, "WP-21 Teil 2: Bedienabläufe, Querformat, Zielgrößen"));
    expect(a).toEqual([{ id: "WP-21", art: "TEILWEISE", von: "BLOCKED", pr: "#192" }]);
    anwenden(s, a, pr(192, "WP-21 Teil 2"));
    const p = s.pakete.find((x) => x.id === "WP-21");
    expect(p.status).toBe("IN_PROGRESS");
    expect(p.pr).toEqual(["#192"]);
    expect(p.stufen.integriert.wert).toBe(false);
    expect(p.stufen.integriert.beleg).toMatch(/#192/);
    expect(p.notiz).toMatch(/Teilumfang nach #192/);
    expect(p.notiz).not.toMatch(/INTEGRATED nach/);
  });

  it("bereits laufendes Paket bleibt IN_PROGRESS und wird nie INTEGRATED", () => {
    const s = ssot();
    anwenden(s, plan(s, pr(185, "IMP-6: Schichtmodelle und Schichtzyklen importieren (Bibliothek)")), pr(185, "x"));
    expect(s.pakete.find((x) => x.id === "IMP-6").status).toBe("IN_PROGRESS");
  });

  it("vollständiger PR: weiterhin INTEGRIERT mit allen vier Stufen belegt", () => {
    const s = ssot();
    const a = plan(s, pr(176, "WP-35 Darstellungsbefunde: kein Querscrollen in Abrechnungsdaten"));
    expect(a).toEqual([{ id: "WP-35", art: "INTEGRIERT", von: "BLOCKED", pr: "#176" }]);
    anwenden(s, a, pr(176, "x"));
    const p = s.pakete.find((x) => x.id === "WP-35");
    expect(p.status).toBe("INTEGRATED");
    for (const k of ["implementiert", "lokalGetestet", "reviewt", "integriert"]) expect(p.stufen[k].wert, k).toBe(true);
    expect(p.notiz).toMatch(/INTEGRATED nach #176/);
  });

  it("bereits erledigtes Paket: nur die PR-Nummer wird ergänzt, auch bei Teil-Titel", () => {
    const s = ssot();
    const a = plan(s, pr(300, "OPT-1 Teil 2: Nachtrag"));
    expect(a).toEqual([{ id: "OPT-1", art: "PR_ERGAENZT", pr: "#300" }]);
    anwenden(s, a, pr(300, "x"));
    const p = s.pakete.find((x) => x.id === "OPT-1");
    expect(p.status).toBe("INTEGRATED");
    expect(p.pr).toEqual(["#166", "#300"]);
  });
});
