/* Prüfkette und CI im Gleichlauf — siehe werkzeug/pruefkette-abgleich.mjs. */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abgleichen, ketteLesen, serverlaufLesen, ciLesen, repoLesen }
  from "../werkzeug/pruefkette-abgleich.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const basis = () => ({
  scripts: {
    pruefung: "npm run lint && npm run pruefung:a && npm run pruefung:serverlauf",
    lint: "eslint .",
    build: "vite build",
    "pruefung:a": "vitest run a.test.js",
    "pruefung:serverlauf": "node pruefungen/serverlauf.mjs rechte && node pruefungen/serverlauf.mjs geo",
    "pruefung:rechte": "node pruefungen/rechte.mjs",
    "pruefung:geo-http": "node pruefungen/geo.mjs",
  },
  workflow: [
    "steps:",
    "  # npm run pruefung:auskommentiert zählt nicht",
    "  - run: npm run lint",
    "  - run: npm run pruefung:a",
    "  - run: npm run build",
    "  - run: npm run pruefung:rechte",
    "  - run: npm run pruefung:geo-http",
  ].join("\n"),
});

describe("Lesen", () => {
  it("liest die Kette, die serverlauf-Glieder und die CI-Aufrufe", () => {
    const b = basis();
    expect(ketteLesen(b.scripts.pruefung)).toEqual(["lint", "pruefung:a", "pruefung:serverlauf"]);
    expect(serverlaufLesen(b.scripts["pruefung:serverlauf"])).toEqual(["rechte", "geo"]);
    expect([...ciLesen(b.workflow)].sort())
      .toEqual(["build", "lint", "pruefung:a", "pruefung:geo-http", "pruefung:rechte"]);
  });
});

describe("Abgleich", () => {
  it("meldet nichts, wenn beide Listen dasselbe prüfen (auch über serverlauf)", () => {
    expect(abgleichen(basis())).toEqual([]);
  });

  it("meldet eine Suite, die nur in der CI läuft", () => {
    const b = basis();
    b.scripts["pruefung:neu"] = "vitest run neu.test.js";
    b.workflow += "\n  - run: npm run pruefung:neu";
    const f = abgleichen(b);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatch(/pruefung:neu.*läuft in der CI, fehlt aber in der Kette/);
  });

  it("meldet eine Suite, die nur in der Kette steht", () => {
    const b = basis();
    b.scripts["pruefung:lokal"] = "vitest run lokal.test.js";
    b.scripts.pruefung += " && npm run pruefung:lokal";
    expect(abgleichen(b)).toEqual([expect.stringMatching(/pruefung:lokal.*nicht in der CI/)]);
  });

  it("meldet ein serverlauf-Glied ohne CI-Schritt", () => {
    const b = basis();
    b.workflow = b.workflow.replace("  - run: npm run pruefung:geo-http", "");
    const f = abgleichen(b);
    expect(f.some((x) => /serverlauf „geo“/.test(x))).toBe(true);
  });

  it("meldet eine HTTP-Suite der CI, die serverlauf nicht abdeckt", () => {
    const b = basis();
    b.scripts["pruefung:extra-http"] = "node pruefungen/extra.mjs";
    b.workflow += "\n  - run: npm run pruefung:extra-http";
    expect(abgleichen(b)).toEqual([expect.stringMatching(/pruefung:extra-http.*fehlt aber in der Kette/)]);
  });

  it("meldet verwaiste Skripte und Aufrufe ins Leere", () => {
    const b = basis();
    b.scripts["pruefung:vergessen"] = "vitest run vergessen.test.js";
    b.workflow += "\n  - run: npm run pruefung:gibtsnicht";
    const f = abgleichen(b);
    expect(f.some((x) => /pruefung:vergessen.*weder in der Kette noch in der CI/.test(x))).toBe(true);
    expect(f.some((x) => /CI ruft „pruefung:gibtsnicht“/.test(x))).toBe(true);
  });

  it("meldet Kettenglieder, die kein npm run sind", () => {
    const b = basis();
    b.scripts.pruefung += " && node irgendwas.mjs";
    expect(abgleichen(b)).toEqual([expect.stringMatching(/kein „npm run“/)]);
  });

  it("Kommentarzeilen im Workflow zählen nicht als CI-Schritt", () => {
    const b = basis();
    b.scripts["pruefung:auskommentiert"] = "vitest run x.test.js";
    b.scripts.pruefung += " && npm run pruefung:auskommentiert";
    expect(abgleichen(b)).toEqual([expect.stringMatching(/pruefung:auskommentiert.*nicht in der CI/)]);
  });
});

describe("Dieses Repo", () => {
  it("package.json-Kette und .github/workflows/pruefung.yml laufen im Gleichlauf", () => {
    expect(abgleichen(repoLesen(WURZEL))).toEqual([]);
  });
});
