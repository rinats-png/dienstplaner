// Prüft die reinen Rechenfunktionen von werkzeug/durchsatz.mjs mit eingespielten Daten (kein Netz, kein gh, kein git).
import { describe, it, expect } from "vitest";
import {
  median, statistik, titelKlasse, referenzen, prKennzahlen, proTag, parallelOffenProTag, mergeAbstaende, pearson,
  fensterVergleich, ausfuehrbar, ssotUebergaenge, tageszaehlung, konfliktProxy, ereignisZeile, ereignisseParsen,
  reviewDauern, paketKennung, reviewJePaket, auswerten, markdown, dokument, MARKE_BEGIN, MARKE_ENDE,
} from "../werkzeug/durchsatz.mjs";

const MIN = 60000, H = 3600000, T = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const T0 = Date.parse("2026-11-10T08:00:00Z");

function pr(nr, extra = {}) {
  const erstellt = extra.erstellt ?? T0;
  const lauf = (sha, ende, konz = "success", ereignis = "pull_request", start = erstellt) => ({
    name: "Prüfung", event: ereignis, sha, conclusion: konz, status: "completed", created: iso(start), started: iso(start + 5000), updated: iso(ende),
  });
  return {
    number: nr, title: extra.title ?? `WP-${nr}: Funktion`, body: extra.body ?? "", base: extra.base ?? "integration/release-v4", head: `b/${nr}`,
    createdAt: iso(erstellt), mergedAt: extra.mergedAt === undefined ? iso(erstellt + 3 * H) : extra.mergedAt,
    closedAt: iso(erstellt + 3 * H), state: "MERGED", additions: 10, deletions: 5, changedFiles: 3, headSha: "h" + nr,
    commits: extra.commits ?? [{ sha: "a", date: iso(erstellt - MIN) }, { sha: "h" + nr, date: iso(erstellt + 60 * MIN) }],
    runs: extra.runs ?? [lauf("a", erstellt + 10 * MIN, "failure"), lauf("h" + nr, erstellt + 30 * MIN)],
  };
}

describe("Grundstatistik", () => {
  it("Median gerade/ungerade/leer", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([null, NaN, 5])).toBe(5);
  });
  it("Statistik liefert n, Median, Bereich", () => {
    expect(statistik([1, 2, 3, 4, 10])).toEqual({ n: 5, median: 3, min: 1, max: 10, p90: 10 });
    expect(statistik([]).n).toBe(0);
  });
  it("Pearson: gleichläufig = 1, konstant = nicht messbar, zu wenig = nicht messbar", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });
});

describe("Titelklassen", () => {
  it.each([
    ["SSOT: Stand 2026-11-12", "ssot"],
    ["SSOT-Werkzeug: Abgleich", "test-infra"],
    ["QS-5: Zufallsfenster", "test-infra"],
    ["Test: Flake", "test-infra"],
    ["CI: Cache", "test-infra"],
    ["Doku: Betrieb", "docs"],
    ["Abnahme V4 Strang B", "docs"],
    ["Fix: Konflikt", "fix"],
    ["Security: Pfad", "fix"],
    ["Merge release in integration", "merge"],
    ["Review: Nachholen", "review"],
    ["WP-21: Geräte", "feature"],
    ["IMP-6 Mehrfachmodelle", "feature"],
  ])("%s -> %s", (t, k) => expect(titelKlasse(t)).toBe(k));
});

describe("Verweise (Nachbesserungsfix-Proxy)", () => {
  it("findet #N, ignoriert die eigene Nummer und Doppelte", () => {
    expect(referenzen("Fix zu #12 und #12, siehe #99", 99)).toEqual([12]);
    expect(referenzen("kein Verweis", 1)).toEqual([]);
    expect(referenzen("Zeile\n#7: Anker", 1)).toEqual([7]);
  });
});

describe("prKennzahlen", () => {
  it("Durchlaufzeit, CI-Dauer auf dem Kopf, Fehlschläge, Nachbesserungen", () => {
    const k = prKennzahlen(pr(1));
    expect(k.leadMs).toBe(3 * H);
    expect(k.ciDauerMs).toBe(30 * MIN);
    expect(k.ciFehlschlaege).toBe(1);
    expect(k.ciKoepfe).toBe(2);
    expect(k.commitsNachAnlage).toBe(1);
    expect(k.klasse).toBe("feature");
    expect(k.ciQueueMs).toBe(5000);
    expect(k.zeilen).toBe(15);
  });
  it("kein grüner Lauf auf dem Kopf -> CI-Dauer nicht messbar", () => {
    const k = prKennzahlen(pr(2, { runs: [{ name: "Prüfung", event: "pull_request", sha: "h2", conclusion: "failure", status: "completed", created: iso(T0), started: iso(T0), updated: iso(T0 + MIN) }] }));
    expect(k.ciDauerMs).toBeNull();
  });
  it("nicht gemergt -> keine Durchlaufzeit; Push-Ereignisse zählen nicht", () => {
    const k = prKennzahlen(pr(3, { mergedAt: null, runs: [{ name: "Prüfung", event: "push", sha: "h3", conclusion: "failure", status: "completed", created: iso(T0), started: iso(T0), updated: iso(T0) }] }));
    expect(k.gemergt).toBe(false);
    expect(k.leadMs).toBeNull();
    expect(k.ciFehlschlaege).toBe(0);
  });
  it("Fix mit Verweis auf frühere PR", () => {
    const k = prKennzahlen(pr(5, { title: "Fix: Nachbesserung zu #3" }));
    expect(k.klasse).toBe("fix");
    expect(k.verweise).toEqual([3]);
  });
  it("fehlende Listen brechen nicht", () => {
    const k = prKennzahlen({ number: 9, title: "x", base: "b", createdAt: iso(T0), mergedAt: null, closedAt: null });
    expect(k.commits).toBe(0);
    expect(k.ciDauerMs).toBeNull();
  });
});

describe("Tageszählung und Parallelität", () => {
  const ks = [pr(1, { erstellt: T0 }), pr(2, { erstellt: T0 + 2 * H }), pr(3, { erstellt: T0 + T, mergedAt: iso(T0 + T + 2 * H) })].map(prKennzahlen);
  it("proTag zählt Merges je UTC-Tag", () => {
    expect([...proTag(ks).entries()]).toEqual([["2026-11-10", 2], ["2026-11-11", 1]]);
  });
  it("parallelOffenProTag", () => {
    const m = parallelOffenProTag(ks, T0, T0 + T);
    expect(m.get("2026-11-10")).toBe(2);
    expect(m.get("2026-11-11")).toBe(1);
  });
  it("Merge-Abstände", () => {
    expect(mergeAbstaende(ks).length).toBe(2);
  });
});

describe("Fensterverglich 7 gegen 7 Tage", () => {
  const jetzt = Date.parse("2026-11-14T00:00:00Z");
  it("zu wenig Daten -> ausreichend false", () => {
    const ks = [prKennzahlen(pr(1, { erstellt: jetzt - 2 * T }))];
    const f = fensterVergleich(ks, jetzt);
    expect(f.ausreichend).toBe(false);
    expect(f.aktuell.n).toBe(1);
    expect(f.davor.n).toBe(0);
  });
  it("genug Daten in beiden Fenstern", () => {
    const ks = [];
    for (let i = 0; i < 6; i++) ks.push(prKennzahlen(pr(10 + i, { erstellt: jetzt - (1 + i) * T + 0 })));
    for (let i = 0; i < 6; i++) ks.push(prKennzahlen(pr(30 + i, { erstellt: jetzt - (8 + i) * T })));
    const f = fensterVergleich(ks, jetzt);
    expect(f.ausreichend).toBe(true);
    expect(f.aktuell.n).toBe(6);
    expect(f.davor.n).toBe(6);
    expect(f.aktuell.medianLeadH).toBeCloseTo(3, 6);
  });
});

describe("ausfuehrbar (Definition)", () => {
  const wp = { pakete: [
    { id: "A", status: "INTEGRATED", abhaengigkeiten: [], pr: [] },
    { id: "B", status: "READY", abhaengigkeiten: ["A"], pr: [], titel: "frei" },
    { id: "C", status: "READY", abhaengigkeiten: ["B"], pr: [], titel: "Vorgänger offen" },
    { id: "D", status: "IN_PROGRESS", abhaengigkeiten: [], pr: ["#50"], titel: "offener PR" },
    { id: "E", status: "BLOCKED", abhaengigkeiten: ["A"], pr: [], notiz: "wartet auf Betreiberentscheidung", titel: "Betreiber" },
    { id: "F", status: "BLOCKED", abhaengigkeiten: [], pr: ["#7"], titel: "alter gemergter PR" },
    { id: "G", status: "REVIEW", abhaengigkeiten: [], pr: [], titel: "Review" },
    { id: "H", status: "READY", abhaengigkeiten: ["FEHLT"], pr: [], titel: "unbekannter Vorgänger" },
  ] };
  const r = ausfuehrbar(wp, [50]);
  it("nur Pakete ohne offene Vorgänger, ohne offenen PR, ohne Betreiberblockade", () => {
    expect(r.ausfuehrbar.map((p) => p.id)).toEqual(["B", "F"]);
    expect(r.mitOffenemPr).toBe(1);
    expect(r.betreiberBlockiert.map((p) => p.id)).toEqual(["E"]);
  });
});

describe("SSOT-Übergänge", () => {
  const v = (zeit, pakete) => ({ zeit, commit: "c" + zeit, pakete });
  it("zählt erstmaliges INTEGRATED und lokalGetestet, nicht mehrfach", () => {
    const u = ssotUebergaenge([
      v(1, { A: { status: "READY", lokalGetestet: false }, B: { status: "READY", lokalGetestet: false } }),
      v(2, { A: { status: "INTEGRATED", lokalGetestet: true }, B: { status: "READY", lokalGetestet: true } }),
      v(3, { A: { status: "READY", lokalGetestet: true }, B: { status: "DONE", lokalGetestet: true } }),
      v(4, { A: { status: "INTEGRATED", lokalGetestet: true }, B: { status: "DONE", lokalGetestet: true } }),
    ]);
    expect(u.integriert.map((e) => e.id)).toEqual(["A", "B"]);
    expect(u.lokalGetestet.map((e) => e.id)).toEqual(["A", "B"]);
    expect(tageszaehlung(u.integriert).size).toBe(1);
  });
  it("erste Version ist nur Ausgangslage", () => {
    expect(ssotUebergaenge([v(1, { A: { status: "INTEGRATED", lokalGetestet: true } })]).integriert).toEqual([]);
  });
});

describe("Konfliktproxy", () => {
  it("erkennt Kettenvereinigung und Auflösungs-Merges", () => {
    const r = konfliktProxy([
      { betreff: "package.json: Kette vereinigt", rumpf: "" },
      { betreff: "Merge branch 'x' – Konflikt aufgelöst", rumpf: "" },
      { betreff: "normal", rumpf: "benutzt werkzeug/package-kette-vereinigen.cjs" },
      { betreff: "Merge branch 'y'", rumpf: "" },
    ]);
    expect(r.kette.length).toBe(2);
    expect(r.mergeAufloesung.length).toBe(1);
  });
});

describe("Review-Befund-Proxy", () => {
  it("Paketkennung am Zeilenanfang", () => {
    expect(paketKennung("SI-P6 Review (Opus): B1")).toBe("SI-P6");
    expect(paketKennung("WP-19.0 Nachtrag vierter Opus-Delta-Review")).toBe("WP-19.0");
    expect(paketKennung("WP-I13/I15: Review-Befunde")).toBe("WP-I13");
    expect(paketKennung("Merge etwas")).toBeNull();
  });
  it("zählt Review-Commits je Paket, absteigend", () => {
    const r = konfliktProxy([{ betreff: "SI-P6 Review: a" }, { betreff: "SI-P6 Befund b" }, { betreff: "IMP-2 Nachreview" }, { betreff: "keine Treffer" }]);
    expect(r.reviewBefund.length).toBe(3);
    expect(reviewJePaket(r.reviewBefund)).toEqual([["SI-P6", 2], ["IMP-2", 1]]);
  });
});

describe("Ereignisdatei", () => {
  const jetzt = Date.parse("2026-11-13T10:00:00Z");
  it("schreibt genau eine JSON-Zeile", () => {
    const z = JSON.parse(ereignisZeile({ pr: 12, art: "review-start", notiz: " Opus   unabhängig ", jetzt }));
    expect(z).toEqual({ ts: "2026-11-13T10:00:00.000Z", pr: 12, art: "review-start", notiz: "Opus unabhängig" });
  });
  it("lehnt falsche Art, falsche PR-Nummer, E-Mail und zu lange Notiz ab", () => {
    expect(() => ereignisZeile({ pr: 12, art: "x" })).toThrow();
    expect(() => ereignisZeile({ pr: "a", art: "review-ende" })).toThrow();
    expect(() => ereignisZeile({ pr: 1, art: "review-ende", notiz: "a@b.de" })).toThrow(/E-Mail/);
    expect(() => ereignisZeile({ pr: 1, art: "review-ende", notiz: "x".repeat(201) })).toThrow();
  });
  it("Parsen zählt fehlerhafte Zeilen und berechnet Review-Dauern", () => {
    const text = [
      JSON.stringify({ ts: "2026-11-13T10:00:00Z", pr: 5, art: "review-start" }),
      JSON.stringify({ ts: "2026-11-13T12:00:00Z", pr: 5, art: "review-ende" }),
      JSON.stringify({ ts: "2026-11-13T12:30:00Z", pr: 5, art: "korrekturrunde" }),
      JSON.stringify({ ts: "2026-11-13T13:00:00Z", pr: 5, art: "fehler-nachtraeglich" }),
      "kaputt", JSON.stringify({ ts: "x", pr: 1, art: "review-start" }), "",
    ].join("\n");
    const p = ereignisseParsen(text);
    expect(p.fehlerhaft).toBe(2);
    expect(p.ereignisse.length).toBe(4);
    const r = reviewDauern(p.ereignisse);
    expect(r.dauern).toEqual([2 * H]);
    expect(r.korrekturrunden).toBe(1);
    expect(r.nachtraeglich).toBe(1);
  });
});

describe("auswerten und Ausgabe", () => {
  const jetzt = Date.parse("2026-11-13T12:00:00Z");
  const prs = [pr(1, { erstellt: Date.parse("2026-11-10T08:00:00Z") }), pr(2, { erstellt: Date.parse("2026-11-12T08:00:00Z"), title: "SSOT: Stand" }),
    pr(3, { erstellt: Date.parse("2026-11-12T09:00:00Z"), title: "Fix: zu #1" }), pr(4, { base: "main" })];
  const a = auswerten({ prs, jetzt, ssot: { pakete: [] }, offenePr: [], konflikt: { kette: [], mergeAufloesung: [], konfliktWort: [] }, ereignisse: { ereignisse: [], fehlerhaft: 0 }, ssotUeber: { integriert: [], lokalGetestet: [] }, commit: "abc" });
  it("filtert nach Ziel-Zweig und zählt Klassen", () => {
    expect(a.gesamt.imBasis).toBe(3);
    expect(a.seitSeit.n).toBe(3);
    expect(a.seitSeit.klassen.ssot).toBe(1);
    expect(a.seitSeit.nachbesserungsfix).toBe(1);
  });
  it("Markdown nennt „nicht messbar“ für Review und „nicht ausreichend Daten“", () => {
    const m = markdown(a);
    expect(m).toContain("nicht messbar");
    expect(m).toContain("nicht ausreichend Daten");
    expect(m).toContain("abc");
    expect(m).toContain("Commits sind nicht die Kennzahl");
  });
  it("Dokument trägt AUTO-Marken", () => {
    const d = dokument(a);
    expect(d).toContain(MARKE_BEGIN);
    expect(d).toContain(MARKE_ENDE);
  });
});
