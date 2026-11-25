/* RST-3: REVIEW-NACHWEIS je Merge und G2-Sammelbelegliste (Fixtures, synthetisch). */
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { zeileErzeugen, sammellisteErzeugen, sammellistePruefen, KOPF, main } from "../werkzeug/review-nachweis.mjs";
import { reviewNachweiseLesen, g2Review } from "../werkzeug/release-pruefung.mjs";

const BERICHT = "Review zu #901: keine Befunde, Urteil MERGE-OK.";
const tabelle = (...z) => `# Fixture\n\n${KOPF}${z.join("\n")}\n`;

describe("Zeile in Positivform, nur mit Bericht", () => {
  it("erzeugt eine von G2 lesbare Zeile mit Berichtshash", () => {
    const z = zeileErzeugen({ pr: "#901", modell: "Opus", urteil: "MERGE-OK", berichtText: BERICHT });
    expect(z).toMatch(/^\| #901 \| Opus \| MERGE-OK \| [0-9a-f]{64} \| gemergt \|$/);
    expect(reviewNachweiseLesen([{ datei: "REVIEW-NACHWEIS-2026-12-01.md", text: tabelle(z) }]).has(901)).toBe(true);
  });
  it("kein Beleg ohne Bericht, mit falschem PR, ohne Positivform", () => {
    const e = (o) => () => zeileErzeugen({ pr: "#901", modell: "Opus", urteil: "MERGE-OK", berichtText: BERICHT, ...o });
    expect(e({ berichtText: "" })).toThrow(/ohne Reviewbericht/);
    expect(e({ berichtText: undefined })).toThrow(/ohne Reviewbericht/);
    expect(e({ pr: "#902" })).toThrow(/nennt #902 nicht/);
    expect(e({ pr: "#90" })).toThrow(/nennt #90 nicht/);
    expect(e({ urteil: "MIT AUFLAGEN" })).toThrow(/Positivform/);
    expect(e({ urteil: "MERGE-OK unter Vorbehalt" })).toThrow(/Positivform/);
    expect(e({ pr: "abc" })).toThrow(/ungültig/);
    expect(e({ modell: " " })).toThrow(/Modell/);
  });
});

describe("G2 erkennt neue Zeilen (Fixture), Gate unverändert", () => {
  const alt = { datei: "REVIEW-NACHWEIS-2026-12-01.md", text: tabelle(zeileErzeugen({ pr: "#901", modell: "Opus", urteil: "MERGE-OK", berichtText: BERICHT })) };
  const neu = { datei: "REVIEW-NACHWEIS-2026-12-02.md", text: tabelle(zeileErzeugen({ pr: "#902", modell: "Sonnet", urteil: "MERGEBAR", berichtText: "Review zu #902: Urteil MERGEBAR." })) };
  const g2 = (texte) => g2Review({ prs: [901, 902], commitsOhnePr: [], anzahlCommits: 2, dokBelege: reviewNachweiseLesen(texte) });
  it("vorher offen, nach der neuen Zeile belegt", () => {
    expect(g2([alt]).manuell).toEqual(["#902"]);
    const nachher = g2([alt, neu]);
    expect(nachher.manuell).toEqual([]);
    expect(nachher.belege.join(" ")).toContain("#902");
  });
});

describe("Sammelbelegliste mit Hash", () => {
  const texte = [{ datei: "REVIEW-NACHWEIS-2026-12-01.md", text: tabelle(zeileErzeugen({ pr: "#901", modell: "Opus", urteil: "MERGE-OK", berichtText: BERICHT })) }];
  it("führt Belege und ohne-Beleg-PRs, Hash prüfbar, Manipulation erkannt", () => {
    const t = sammellisteErzeugen(["#902", "#901"], texte, "2026-12-03");
    expect(t).toMatch(/mit Beleg: 1, ohne Beleg: 1/);
    expect(t).toMatch(/\| #902 \| ohne Beleg \|/);
    expect(sammellistePruefen(t)).toEqual({ ok: true, anzahl: 2 });
    expect(sammellistePruefen(t.replace("| #902 | ohne Beleg |", "| #902 | MERGE-OK |")).ok).toBe(false);
    expect(sammellistePruefen(t.replace(/SHA-256: [0-9a-f]{64}/, "")).ok).toBe(false);
    expect(sammellistePruefen("nichts").ok).toBe(false);
  });
  it("G2 liest die Sammelliste nicht als Beleg (kein Doppelzählen)", () => {
    const t = sammellisteErzeugen(["#901"], texte, "2026-12-03");
    expect(reviewNachweiseLesen([{ datei: "REVIEW-NACHWEIS-2026-12-09.md", text: t }]).size).toBe(0);
  });
  it("ungültiger PR-Verweis bricht ab", () => {
    expect(() => sammellisteErzeugen(["901"], texte, "x")).toThrow(/ungültig/);
  });
});

describe("Kommandozeile (echter Weg)", () => {
  it("zeile ohne Bericht abgelehnt, mit Bericht angehängt; Sammelliste nicht überschreibbar", () => {
    const d = mkdtempSync(join(tmpdir(), "rn-"));
    try {
      mkdirSync(join(d, "docs", "acc45"), { recursive: true });
      const log = () => {};
      const z = (extra) => main(["zeile", "--pr", "#901", "--modell", "Opus", "--urteil", "MERGE-OK", ...extra], d, log);
      expect(z([])).toBe(1);
      expect(z(["--bericht", join(d, "fehlt.md")])).toBe(1);
      writeFileSync(join(d, "b.md"), BERICHT);
      const datei = join(d, "docs", "acc45", "REVIEW-NACHWEIS-2026-12-05.md");
      expect(z(["--bericht", join(d, "b.md"), "--datei", datei])).toBe(0);
      expect(z(["--bericht", join(d, "b.md"), "--datei", join(d, "x.md")])).toBe(1);
      expect(readFileSync(datei, "utf8")).toContain("| #901 | Opus | MERGE-OK |");
      const aus = join(d, "sammel.md");
      expect(main(["sammelliste", "--prs", "#901,#902", "--ausgabe", aus], d, log)).toBe(0);
      expect(readFileSync(aus, "utf8")).toMatch(/\| #901 \| .*MERGE-OK/);
      expect(main(["pruefen", aus], d, log)).toBe(0);
      expect(main(["sammelliste", "--prs", "#901", "--ausgabe", aus], d, log)).toBe(1);
      expect(main(["sammelliste"], d, log)).toBe(2);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
