/* ==========================================================================
   DOCKER-KONTEXT — was das Dockerfile kopiert, muss im Bau-Kontext liegen

   Anlass (CI-Stabilisierung): Das Dockerfile kopiert zwei Betreiber-
   Werkzeuge aus werkzeug/ (WP-32d), .dockerignore schließt werkzeug/* aus
   und gab sie nicht frei. Der Bau scheiterte mit „… not found" in der
   Lieferkette und in Betrieb Sicherung; auslieferung.test.js prüfte nur,
   WAS kopiert wird, nicht ob der Kontext es durchlässt.

   Geprüft wird ohne Docker:
   - jede Quelle eines COPY (ohne --from) im Dockerfile existiert,
   - und liegt nach den Regeln der .dockerignore im Bau-Kontext.

   Die Auswertung der .dockerignore folgt Docker (moby/patternmatcher):
   Regeln von oben nach unten, die letzte zutreffende gilt, „!" gibt wieder
   frei, ein Treffer auf ein übergeordnetes Verzeichnis schließt auch alles
   darunter aus. Unterstützt sind genau die Muster, die diese Datei braucht
   (Pfade, * und ? innerhalb eines Pfadteils, ** über Pfadteile); alles
   andere (z. B. [...]-Klassen) lässt den Test scheitern statt still
   falsch zu werten.

   Aufruf: npx vitest run pruefungen/docker-kontext.test.js
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const lies = (f) => readFileSync(path.join(WURZEL, f), "utf8").replace(/\r\n/g, "\n");

/** Ein Muster der .dockerignore als regulärer Ausdruck über den ganzen Pfad. */
function musterZuRegex(muster) {
  if (/[[\]\\{}()+^$|]/.test(muster)) throw new Error(`.dockerignore: Muster „${muster}" wird von diesem Test nicht unterstützt.`);
  let re = "";
  for (let i = 0; i < muster.length; i++) {
    const c = muster[i];
    if (c === "*" && muster[i + 1] === "*") {
      i += 1;
      if (muster[i + 1] === "/") { i += 1; re += "(?:.*/)?"; } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === ".") re += "\\.";
    else re += c;
  }
  return new RegExp(`^${re}$`);
}

/** @returns {(pfad: string) => boolean} true = ausgeschlossen (nicht im Bau-Kontext) */
export function dockerignoreMatcher(text) {
  const regeln = [];
  for (const roh of text.split("\n")) {
    let z = roh.trim();
    if (!z || z.startsWith("#")) continue;
    let frei = false;
    if (z.startsWith("!")) { frei = true; z = z.slice(1).trim(); }
    z = path.posix.normalize(z).replace(/^\/+/, "").replace(/\/+$/, "");
    if (!z || z === ".") continue;
    regeln.push({ frei, re: musterZuRegex(z) });
  }
  return (pfad) => {
    const teile = path.posix.normalize(pfad).split("/");
    const kandidaten = teile.map((_, i) => teile.slice(0, i + 1).join("/"));   // Pfad und alle Eltern
    let ausgeschlossen = false;
    for (const r of regeln) if (kandidaten.some((k) => r.re.test(k))) ausgeschlossen = !r.frei;
    return ausgeschlossen;
  };
}

/** Quellen aller COPY-Zeilen ohne --from, ohne Ziel; „.“ (ganzer Kontext) bleibt außen vor. */
export function copyQuellen(dockerfile) {
  /* Fortsetzungszeilen (…\) zu einer Anweisung verbinden, die Nummer der ersten Zeile behalten. */
  const anweisungen = [];
  let offen = null;
  dockerfile.split("\n").forEach((z, i) => {
    const fortsetzung = /\\\s*$/.test(z);
    const teil = z.replace(/\\\s*$/, " ");
    if (offen) { offen.text += teil; if (!fortsetzung) { anweisungen.push(offen); offen = null; } }
    else if (fortsetzung) offen = { zeile: i + 1, text: teil };
    else anweisungen.push({ zeile: i + 1, text: teil });
  });
  if (offen) anweisungen.push(offen);
  const aus = [];
  anweisungen.forEach(({ zeile: nr, text: roh }) => {
    const m = /^\s*COPY\s+(.+)$/i.exec(roh);
    if (!m) return;
    const teile = m[1].split(/\s+/).filter(Boolean);
    if (teile.some((t) => /^--from=/i.test(t))) return;
    const ohneFlags = teile.filter((t) => !t.startsWith("--"));
    for (const q of ohneFlags.slice(0, -1)) if (q !== "." && q !== "./") aus.push({ zeile: nr, quelle: q.replace(/^\.\//, "").replace(/\/+$/, "") });
  });
  return aus;
}

describe("Docker-Kontext: Auswertung der .dockerignore (Selbsttest des Prüfers)", () => {
  const ausgeschlossen = dockerignoreMatcher([
    "# Kommentar", "", ".git", "node_modules", "werkzeug/*", "!werkzeug/frei.mjs", "pruefungen",
    ".env", ".env.*", "!.env.example", "**/*.tmp", "Dockerfile",
  ].join("\n"));
  it("Muster mit * gelten für den Pfadteil, ! gibt wieder frei, die letzte Regel gewinnt", () => {
    expect(ausgeschlossen("werkzeug/zu.mjs")).toBe(true);
    expect(ausgeschlossen("werkzeug/frei.mjs")).toBe(false);
    expect(ausgeschlossen("werkzeug")).toBe(false);
    expect(ausgeschlossen(".env.production")).toBe(true);
    expect(ausgeschlossen(".env.example")).toBe(false);
    expect(ausgeschlossen("server/lib/x.mjs")).toBe(false);
  });
  it("ein ausgeschlossenes Verzeichnis nimmt alles darunter mit", () => {
    expect(ausgeschlossen("pruefungen/a/b.test.js")).toBe(true);
    expect(ausgeschlossen("node_modules/x/index.js")).toBe(true);
    expect(ausgeschlossen("werkzeug/unter/x.mjs")).toBe(true);
  });
  it("** und Kommentare", () => {
    expect(ausgeschlossen("a/b/c.tmp")).toBe(true);
    expect(ausgeschlossen("c.tmp")).toBe(true);
    expect(ausgeschlossen("c.txt")).toBe(false);
  });
  it("nicht unterstützte Muster lassen den Prüfer scheitern statt falsch zu werten", () => {
    expect(() => dockerignoreMatcher("werkzeug/[ab].mjs")).toThrow(/nicht unterstützt/);
  });
});

describe("Docker-Kontext: COPY-Quellen des Dockerfiles", () => {
  it("der Prüfer liest die COPY-Zeilen (Kontrolle gegen leeren Treffer)", () => {
    const q = copyQuellen(lies("Dockerfile")).map((x) => x.quelle);
    expect(q).toContain("server");
    expect(q).toContain("server.mjs");
    expect(q).toContain("werkzeug/betreiber-faktor-vorlauf.mjs");
    expect(q).not.toContain("/app/dist");        // --from=bauen
  });

  it("jede Quelle existiert im Repository", () => {
    for (const { zeile, quelle } of copyQuellen(lies("Dockerfile")))
      expect(existsSync(path.join(WURZEL, quelle)), `Dockerfile:${zeile} kopiert „${quelle}", die es nicht gibt`).toBe(true);
  });

  it("jede Quelle liegt im Bau-Kontext (nicht von .dockerignore ausgeschlossen)", () => {
    const aus = dockerignoreMatcher(lies(".dockerignore"));
    const fehlend = copyQuellen(lies("Dockerfile")).filter(({ quelle }) => aus(quelle))
      .map(({ zeile, quelle }) => `Dockerfile:${zeile} „${quelle}"`);
    expect(fehlend, "von .dockerignore ausgeschlossen, aber im Dockerfile kopiert — braucht eine !-Zeile").toEqual([]);
  });

  it("Gegenprobe: mit der .dockerignore vor der Korrektur wären genau die zwei Betreiber-Werkzeuge ausgeschlossen", () => {
    const vorher = [
      ".git", ".github", "node_modules", "dist", "marketing", "werkzeug/*",
      "!werkzeug/ablage-sicherung.mjs", "!werkzeug/ablage-pruefen.mjs", "!werkzeug/journal-pruefen.mjs",
      "!werkzeug/staging-smoke.mjs", "!werkzeug/staging-geo.mjs", "!werkzeug/staging-aufraeumen.mjs",
      "!werkzeug/sw-fassung.mjs", "pruefungen", "deploy", ".env", ".env.*", "!.env.example", "Dockerfile", ".dockerignore",
    ].join("\n");
    const aus = dockerignoreMatcher(vorher);
    const fehlend = copyQuellen(lies("Dockerfile")).filter(({ quelle }) => aus(quelle)).map((x) => x.quelle);
    expect(fehlend.sort()).toEqual(["werkzeug/betreiber-2fa-zuruecksetzen.mjs", "werkzeug/betreiber-faktor-vorlauf.mjs"]);
  });
});
