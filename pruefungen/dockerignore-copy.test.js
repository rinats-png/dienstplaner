// Jede COPY-Quelle des Dockerfile muss im Bau-Kontext liegen: Die
// .dockerignore darf sie nicht ausschliessen (Regeln wie Docker: letzte
// passende Zeile gewinnt, "!" gibt frei, "name/*" schliesst den Inhalt aus).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

function teilMuster(t) {
  return t
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
}

function regeln(text) {
  return text
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter((z) => z && !z.startsWith("#"))
    .map((z) => {
      const frei = z.startsWith("!");
      const muster = (frei ? z.slice(1) : z).replace(/^\/+/, "").replace(/\/+$/, "");
      const re = new RegExp("^" + muster.split("/").map(teilMuster).join("/") + "(/.*)?$");
      return { frei, re };
    });
}

function ausgeschlossen(pfad, text) {
  let aus = false;
  for (const r of regeln(text)) if (r.re.test(pfad)) aus = !r.frei;
  return aus;
}

function copyQuellen(dockerfile) {
  const quellen = [];
  const zeilen = dockerfile.replace(/\\\r?\n/g, " ").split(/\r?\n/);
  for (const z of zeilen) {
    const m = /^\s*COPY\s+(.*)$/i.exec(z);
    if (!m) continue;
    const teile = m[1].trim().split(/\s+/);
    if (teile.some((t) => t.startsWith("--from="))) continue; // aus anderer Stufe
    const args = teile.filter((t) => !t.startsWith("--"));
    quellen.push(...args.slice(0, -1));
  }
  return quellen;
}

describe("Dockerfile COPY gegen .dockerignore", () => {
  const ignore = readFileSync(".dockerignore", "utf8");
  const quellen = copyQuellen(readFileSync("Dockerfile", "utf8"));

  it("findet COPY-Quellen", () => {
    expect(quellen).toContain("werkzeug/betreiber-2fa-zuruecksetzen.mjs");
    expect(quellen.length).toBeGreaterThan(8);
  });

  for (const q of quellen.filter((x) => x !== ".")) {
    it(`${q} ist im Bau-Kontext`, () => {
      const pfad = q.replace(/^\.\//, "").replace(/\/+$/, "");
      expect(existsSync(pfad), `${pfad} fehlt im Repository`).toBe(true);
      expect(ausgeschlossen(pfad, ignore), `${pfad} steht durch .dockerignore nicht im Bau-Kontext`).toBe(false);
    });
  }

  it("Regelprobe: rote und gruene Faelle", () => {
    const t = "werkzeug/*\n!werkzeug/a.mjs\n";
    expect(ausgeschlossen("werkzeug/a.mjs", t)).toBe(false);
    expect(ausgeschlossen("werkzeug/b.mjs", t)).toBe(true);
    expect(ausgeschlossen("server/x.mjs", t)).toBe(false);
  });

  it("kunde-abloesen.mjs bleibt ausserhalb (nicht im Bild, nur gemeldet)", () => {
    expect(ausgeschlossen("werkzeug/kunde-abloesen.mjs", ignore)).toBe(true);
  });
});
