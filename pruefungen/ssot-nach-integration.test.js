import { describe, it, expect } from "vitest";
import { plan, anwenden, istTeilPr, istDeklariertTeilweise, istExternBetreiber } from "../werkzeug/ssot-nach-integration.mjs";

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
  it("Paket mit Stufe integriert = „teilweise“: auch ohne Teil im Titel nur TEILWEISE, Wert bleibt, PR wird angehängt (WP-ZEIT, PR #337)", () => {
    const zeit = paket("WP-ZEIT", "IN_PROGRESS", { stufen: { integriert: { wert: "teilweise", beleg: "PR #296 gemergt; Paket nicht vollständig" } } });
    const s = { pakete: [zeit] };
    expect(istDeklariertTeilweise(zeit)).toBe(true);
    const a = plan(s, pr(337, "WP-ZEIT-Rest: lokale Berlin-Tagesformeln über die zentrale Zeitbasis"));
    expect(a).toEqual([{ id: "WP-ZEIT", art: "TEILWEISE", von: "IN_PROGRESS", pr: "#337" }]);
    anwenden(s, a, pr(337, "x"));
    expect(zeit.status).toBe("IN_PROGRESS");
    expect(zeit.stufen.integriert.wert).toBe("teilweise");
    expect(zeit.stufen.integriert.beleg).toMatch(/#296.*#337/);
    anwenden(s, a, pr(337, "x"));
    expect(zeit.stufen.integriert.beleg.match(/#337/g)).toHaveLength(1);
  });

  it("Paket ohne Teil-Deklaration und ohne Teil im Titel: weiterhin INTEGRIERT (keine Regression)", () => {
    expect(istDeklariertTeilweise(paket("WP-99", "READY"))).toBe(false);
    expect(istDeklariertTeilweise(paket("WP-98", "IN_PROGRESS", { stufen: { integriert: { wert: false, beleg: null } } }))).toBe(false);
    const s = { pakete: [paket("WP-99", "IN_PROGRESS")] };
    expect(plan(s, pr(400, "WP-99: abgeschlossen"))[0].art).toBe("INTEGRIERT");
  });

  it("als „teilweise“ deklariertes BLOCKED-Paket bleibt BLOCKED (Betreibersperre), PR-Vergleich mit Wortgrenze (#30 ≠ #301)", () => {
    const p = paket("WP-30", "BLOCKED", { stufen: { integriert: { wert: "teilweise", beleg: "PR #301 gemergt; Rest nach E-9" } } });
    const s = { pakete: [p] };
    anwenden(s, plan(s, pr(30, "WP-30 Nachtrag")), pr(30, "x"));
    expect(p.status).toBe("BLOCKED");
    expect(p.stufen.integriert.beleg).toContain("#301 gemergt; Rest nach E-9 (+ PR #30)");
    anwenden(s, plan(s, pr(30, "WP-30 Nachtrag")), pr(30, "x"));
    expect(p.stufen.integriert.beleg.split("(+ PR #30)")).toHaveLength(2);
  });
});

describe("Teil-PR bei vorhandenem Detailbeleg (Befund WP-48) und externe Betreiberpakete", () => {
  const DETAIL = "Detailbeleg: Schritte 1 bis 3 umgesetzt (PR #300), Rest Schritt 4 offen";
  const teilPr = (n) => pr(n, "WP-48 Teil: weiterer Schritt");

  it("Detailbeleg mit Wert false bleibt erhalten, der PR wird nur angehängt", () => {
    const p = paket("WP-48", "IN_PROGRESS", { stufen: { integriert: { wert: false, beleg: DETAIL } } });
    const s = { pakete: [p] };
    anwenden(s, plan(s, teilPr(341)), teilPr(341));
    expect(p.stufen.integriert.wert).toBe(false);
    expect(p.stufen.integriert.beleg).toBe(`${DETAIL} (+ PR #341)`);
    expect(p.stufen.integriert.beleg).not.toMatch(/Koordinator prüft/);
    expect(p.status).toBe("IN_PROGRESS");
  });

  it("mehrere PRs nacheinander: idempotent, keine Dubletten in Beleg und Notiz, ein Notizsatz", () => {
    const p = paket("WP-48", "IN_PROGRESS", { stufen: { integriert: { wert: false, beleg: DETAIL } } });
    const s = { pakete: [p] };
    for (const n of [341, 342, 346, 341, 346]) anwenden(s, plan(s, teilPr(n)), teilPr(n));
    expect(p.stufen.integriert.beleg).toBe(`${DETAIL} (+ PR #341) (+ PR #342) (+ PR #346)`);
    expect(p.pr).toEqual(["#341", "#342", "#346"]);
    expect(p.notiz.match(/Stand \(automatisch\)/g)).toHaveLength(1);
    expect(p.notiz).toContain("Teilumfang nach #341, #342, #346, Status IN_PROGRESS");
  });

  it("alte Mehrfach-Notizsätze werden zu einem Satz zusammengefasst", () => {
    const alt = (n) => ` Stand (automatisch): Teilumfang nach #${n}, Status IN_PROGRESS; Rest offen (Titel nennt nur einen Teil).`;
    const p = paket("WP-48", "IN_PROGRESS", { notiz: `Fachnotiz.${alt(341)}${alt(342)}`, stufen: { integriert: { wert: false, beleg: DETAIL } } });
    const s = { pakete: [p] };
    anwenden(s, plan(s, teilPr(346)), teilPr(346));
    expect(p.notiz.match(/Stand \(automatisch\)/g)).toHaveLength(1);
    expect(p.notiz).toMatch(/^Fachnotiz\. Stand \(automatisch\): Teilumfang nach #341, #342, #346, Status IN_PROGRESS/);
  });

  it("Paket ohne Beleg bekommt den Standardtext, weitere PRs erweitern die Liste statt zu überschreiben", () => {
    const p = paket("WP-48", "READY", { stufen: { integriert: { wert: false, beleg: null } } });
    const s = { pakete: [p] };
    anwenden(s, plan(s, teilPr(341)), teilPr(341));
    expect(p.status).toBe("IN_PROGRESS");
    expect(p.stufen.integriert.beleg).toMatch(/^Teilumfang in PR #341 integriert; der PR-Titel nennt nur einen Teil/);
    anwenden(s, plan(s, teilPr(342)), teilPr(342));
    anwenden(s, plan(s, teilPr(342)), teilPr(342));
    expect(p.stufen.integriert.beleg).toMatch(/^Teilumfang in PR #341, #342 integriert; /);
    expect(p.stufen.integriert.beleg.match(/#342/g)).toHaveLength(1);
    expect(p.stufen.integriert.wert).toBe(false);
  });

  it("Paket ganz ohne Stufe integriert wird nicht zum Fehler", () => {
    const p = paket("WP-48", "READY");
    const s = { pakete: [p] };
    anwenden(s, plan(s, teilPr(341)), teilPr(341));
    expect(p.stufen.integriert.beleg).toMatch(/#341/);
  });

  it("Wortgrenze beim Anhängen: #30 ist nicht #301", () => {
    const p = paket("WP-48", "IN_PROGRESS", { stufen: { integriert: { wert: false, beleg: "Detail, PR #301 gemergt" } } });
    const s = { pakete: [p] };
    anwenden(s, plan(s, pr(30, "WP-48 Teil: x")), pr(30, "x"));
    expect(p.stufen.integriert.beleg).toBe("Detail, PR #301 gemergt (+ PR #30)");
    anwenden(s, plan(s, pr(30, "WP-48 Teil: x")), pr(30, "x"));
    expect(p.stufen.integriert.beleg.split("(+ PR #30)")).toHaveLength(2);
  });

  it("INTEGRIERT-Pfad (vollständiger PR) bleibt unverändert", () => {
    const p = paket("WP-48", "IN_PROGRESS", { stufen: { integriert: { wert: false, beleg: DETAIL } } });
    const s = { pakete: [p] };
    const a = plan(s, pr(350, "WP-48: abgeschlossen"));
    expect(a).toEqual([{ id: "WP-48", art: "INTEGRIERT", von: "IN_PROGRESS", pr: "#350" }]);
    anwenden(s, a, pr(350, "x"));
    expect(p.status).toBe("INTEGRATED");
    expect(p.stufen.integriert).toEqual({ wert: true, beleg: "PR #350 in integration/release-v4" });
    expect(p.notiz).toMatch(/INTEGRATED nach #350/);
  });

  it("BLOCKED bleibt BLOCKED bei als teilweise deklariertem Paket und Detailbeleg", () => {
    const p = paket("WP-48", "BLOCKED", { stufen: { integriert: { wert: "teilweise", beleg: DETAIL } } });
    const s = { pakete: [p] };
    anwenden(s, plan(s, teilPr(341)), teilPr(341));
    expect(p.status).toBe("BLOCKED");
    expect(p.stufen.integriert.wert).toBe("teilweise");
    expect(p.stufen.integriert.beleg).toContain(DETAIL);
  });

  it("externes Betreiberpaket (strang extern, E-9): nur PR angehängt, kein Statuswechsel", () => {
    expect(istExternBetreiber({ id: "E-9", strang: "extern" })).toBe(true);
    expect(istExternBetreiber(paket("WP-48", "READY"))).toBe(false);
    for (const status of ["READY", "BLOCKED"]) {
      const e9 = paket("E-9", status, { strang: "extern", stufen: { integriert: { wert: false, beleg: null } }, notiz: "Betreiber" });
      const s = { pakete: [e9] };
      for (const titel of ["E-9: E-Mail und Push", "E-9 Teil: Nachtrag"]) {
        const a = plan(s, pr(343, titel));
        if (titel.startsWith("E-9:")) {
          expect(a).toEqual([{ id: "E-9", art: "PR_ERGAENZT_EXTERN", pr: "#343" }]);
          anwenden(s, a, pr(343, titel));
        } else {
          expect(a).toEqual([]);
        }
        expect(e9.status).toBe(status);
        expect(e9.pr).toEqual(["#343"]);
        expect(e9.stufen.integriert).toEqual({ wert: false, beleg: null });
        expect(e9.notiz).toBe("Betreiber");
      }
    }
  });
});
