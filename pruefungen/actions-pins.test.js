// SI-P8: Fremde GitHub Actions nur per vollständigem Commit-SHA mit
// Versionskommentar. Prüft die Regel selbst (rote und grüne Proben) und den
// aktuellen Stand aller Workflows im Repository.
import { describe, it, expect } from "vitest";
import { actionsPruefen, kommentareAbgleichen, repositoryPruefen } from "../werkzeug/sicherheit/actions-pins.mjs";

const SHA = "11d5960a326750d5838078e36cf38b85af677262";
const befunde = (zeile) => actionsPruefen(zeile, "t.yml").befunde;

describe("SI-P8 Regel", () => {
  it("weist Tags, Branches, Kurz-SHAs und fehlende Refs ab", () => {
    for (const z of [
      "      - uses: actions/checkout@v4",
      "      - uses: actions/checkout@v4.4.0",
      "      - uses: actions/checkout@main",
      "      - uses: actions/checkout@11d5960",
      `      - uses: actions/checkout@${SHA.toUpperCase()} # v4.4.0`,
      "      - uses: actions/checkout",
      '      - uses: "actions/checkout@v4"',
      "        uses: github/codeql-action/init@v3",
    ]) {
      expect(befunde(z), z).toHaveLength(1);
    }
  });

  it("verlangt einen lesbaren Versionskommentar", () => {
    expect(befunde(`      - uses: actions/checkout@${SHA}`)[0]).toMatch(/Versionskommentar/);
    expect(befunde(`      - uses: actions/checkout@${SHA} # irgendwas`)[0]).toMatch(/Versionskommentar/);
    expect(befunde(`      - uses: actions/checkout@${SHA} # v4.4.0`)).toEqual([]);
    expect(befunde(`      - uses: actions/checkout@${SHA}   #v4.4.0`)).toEqual([]);
    // Nur vollständige Versionen; '#' ohne Leerzeichen gehört in YAML zum Wert.
    expect(befunde(`      - uses: actions/checkout@${SHA} # v4`)[0]).toMatch(/Versionskommentar/);
    expect(befunde(`      - uses: actions/checkout@${SHA}#v4.4.0`)[0]).toMatch(/nicht auf einen vollständigen/);
    expect(befunde(`        uses: 'github/codeql-action/init@${SHA}' # v3.1.0`)).toEqual([]);
  });

  it("erlaubt lokale Actions/Workflows, Container nur mit Digest", () => {
    expect(befunde("    uses: ./.github/workflows/pruefung.yml")).toEqual([]);
    expect(befunde(`      - uses: docker://alpine@sha256:${"a".repeat(64)}`)).toEqual([]);
    expect(befunde("      - uses: docker://alpine:3.20")).toHaveLength(1);
  });

  it("verbietet Ausdrücke in uses:", () => {
    expect(befunde("      - uses: ${{ matrix.action }}")[0]).toMatch(/Ausdruck/);
  });

  it("ignoriert auskommentierte Zeilen und 'uses' in run-Texten", () => {
    expect(befunde("      # - uses: actions/checkout@v4")).toEqual([]);
    expect(befunde('        run: echo "uses: actions/checkout@v4"')).toEqual([]);
  });

  it("fail-closed bei anderen YAML-Schreibweisen (Review-Befund 1)", () => {
    for (const z of [
      "      - { name: x, uses: actions/checkout@v4 }",
      "      - {uses: actions/checkout@v4}",
      '    steps: [{"uses": "actions/checkout@v4"}]',
      '      - "uses": actions/checkout@v4',
      "      - 'uses': actions/checkout@v4",
      `      - { uses: actions/checkout@${SHA} } # v4.4.0`,
      "      - uses: >-\n          actions/checkout@v4",
    ]) {
      expect(befunde(z).length, z).toBeGreaterThan(0);
    }
    // Mehrzeiliges Flow-Mapping: die uses-Zeile selbst wird erkannt.
    expect(befunde("      - {\n          uses: actions/checkout@v4 }").length).toBeGreaterThan(0);
  });

  it("erkennt CR-, CRLF- und LF-Zeilenenden sowie BOM", () => {
    for (const nl of ["\r", "\r\n", "\n"]) {
      const t = `\uFEFFjobs:${nl}  a:${nl}    steps:${nl}      - uses: actions/checkout@v4${nl}`;
      expect(befunde(t), JSON.stringify(nl)).toHaveLength(1);
    }
  });

  it("zählt Text in Block-Skalaren (run: |) nicht, danach wieder", () => {
    const t = [
      "      - run: |",
      "          cat <<EOF",
      "          uses: actions/checkout@v4",
      "          - { uses: x@v1 }",
      "          EOF",
      "",
      "      - name: weiter",
      "        uses: actions/checkout@v4",
    ].join("\n");
    const b = befunde(t);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatch(/^t\.yml:8:/);
  });

  it("findet falsch beschriftete Pins (gleicher SHA, andere Version)", () => {
    const a = actionsPruefen(`- uses: actions/checkout@${SHA} # v4.4.0`, "a.yml").referenzen;
    const b = actionsPruefen(`- uses: actions/checkout@${SHA} # v4.3.1`, "b.yml").referenzen;
    expect(kommentareAbgleichen([...a, ...b])).toHaveLength(1);
    expect(kommentareAbgleichen([...a, ...a])).toEqual([]);
  });
});

describe("SI-P8 Repository", () => {
  it("alle fremden Actions in .github sind per Commit-SHA gepinnt", async () => {
    const { dateien, referenzen, befunde: b } = await repositoryPruefen();
    expect(dateien.length).toBeGreaterThan(0);
    expect(referenzen.some((r) => r.art === "extern")).toBe(true);
    expect(b).toEqual([]);
  });
});
