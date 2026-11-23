/* SSOT-Belege: kompakte Zuordnung von Paket-IDs zu Commit-, Test- und Nachweisnamen. */
import { describe, it, expect } from "vitest";
import { kompakt, trifftText } from "../werkzeug/ssot-zuordnung.mjs";
import { anwenden, ssotPrBelege } from "../werkzeug/ssot-belege.mjs";
import { abgleich, argWert } from "../werkzeug/ssot-abgleich.mjs";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("kompakte Paket-ID und Trefferprüfung", () => {
  it("kompakte Form", () => {
    expect(kompakt("WP-I12b")).toBe("wpi12b");
    expect(kompakt("IMP-3")).toBe("imp3");
    expect(kompakt("E-21i")).toBe("e21i");
  });
  it("Commit-Betreffs treffen die ID, nicht ähnliche", () => {
    expect(trifftText("WP-I12", "WP-I12b: Paketliste")).toBe(false);
    expect(trifftText("WP-I12b", "WP-I12b: Paketliste")).toBe(true);
    expect(trifftText("WP-I12", "WP-I12: Decision Engine extrahiert")).toBe(true);
    expect(trifftText("IMP-3", "IMP-30: Sonstiges")).toBe(false);
  });
  it("Dateinamen mit kompakter Form und Trennstrich", () => {
    expect(trifftText("WP-38", "pruefungen/wp38-toter-code.test.js")).toBe(true);
    expect(trifftText("WP-47b", "docs/acc45/WP-47b-NACHWEIS.md")).toBe(true);
    expect(trifftText("WP-47", "docs/acc45/WP-47b-NACHWEIS.md")).toBe(false);
    expect(trifftText("WP-I12", "pruefungen/wp-i12-nachweis.md")).toBe(true);
  });
});

/* Review #483 (Opus) Folgebefund H4: anwenden() übernahm PR-Verweise mit /#\d+/ (auch „#0“, „#012“) und suchte Duplikate
   per String.includes („#12“ galt als enthalten in „#123“). Jetzt: Format genau PR_MUSTER (acc45-backlog.mjs), exakter
   Listenvergleich; ein ungültiger Verweis bricht ab, bevor irgendein Paket geändert wird (main: Rückgabe 1, Rollback). */
describe("ssot-belege anwenden: PR-Verweise nach PR_MUSTER, exakter Duplikatvergleich (Review #483 H4)", () => {
  const ssot = (pr = []) => ({ pakete: [{ id: "WP-1", status: "INTEGRATED", pr, stufen: {} }, { id: "WP-2", status: "DONE", pr: ["#5"], stufen: {} }] });
  const ok = (id, integriert) => ({ id, klasse: "OK", integriert, commits: [], dateien: [] });

  it("„#12“ wird ergänzt, auch wenn „#123“ schon im pr steht (kein Teilstring-Vergleich)", () => {
    const s = ssot(["#123"]);
    expect(anwenden(s, [ok("WP-1", "PR #12")])).toEqual({ belegErgaenzt: 1, statusAufReview: 0 });
    expect(s.pakete[0].pr).toEqual(["#123", "#12"]);
  });

  it("vorhandene und doppelte Verweise werden nicht erneut ergänzt", () => {
    const s = ssot(["#12"]);
    expect(anwenden(s, [ok("WP-1", "PR #12,#13,#13")]).belegErgaenzt).toBe(1);
    expect(s.pakete[0].pr).toEqual(["#12", "#13"]);
    expect(anwenden(s, [ok("WP-1", "PR #12,#13")]).belegErgaenzt).toBe(0);
    expect(anwenden(s, [ok("WP-1", "nein")]).belegErgaenzt).toBe(0);
  });

  it("ungültiger Verweis („#0“, führende Null, Zusatz) → Fehler, keine Datenänderung, auch nicht an früheren Zeilen", () => {
    for (const integriert of ["PR #0", "PR #012", "PR #12a", "PR #12,#0", "PR 12", "PR #", "PR #12, #13"]) {
      const s = ssot(["#1"]);
      const vorher = JSON.stringify(s);
      expect(() => anwenden(s, [ok("WP-2", "PR #6"), ok("WP-1", integriert)]), integriert).toThrow(/ungültige[rn]? PR-Verweis/);
      expect(JSON.stringify(s), integriert).toBe(vorher);
    }
  });

  it("PR_MUSTER kommt aus einer Quelle (acc45-backlog.mjs), keine eigene lockere Regel", () => {
    const text = readFileSync(join(WURZEL, "werkzeug", "ssot-belege.mjs"), "utf8");
    expect(text).toMatch(/import \{[^}]*\bPR_MUSTER\b[^}]*\} from "\.\/acc45-backlog\.mjs"/);
    expect(text).not.toMatch(/#\\d\+/);
  });
});

/* Review #486 (Opus) H-d: die Tests oben prüfen anwenden() (Fehler, keine Datenänderung), aber nicht den Exit-Code von
   main(). Hier läuft die CLI selbst (spawnSync) auf einer Wegwerf-Kopie: eigenes Git-Repository mit den Werkzeugdateien,
   Ref origin/integration/release-v4, SSOT-Kopie und PR-Liste aus Datei (--prs, kein Netz), Sperre im eigenen Temp. */
describe("ssot-belege CLI: ungültiger PR-Verweis → Rückgabe 1, Datei byte-gleich (Review #486 H-d)", () => {
  const WERKZEUGE = ["ssot-belege.mjs", "gh-rest.mjs", "ssot-zuordnung.mjs", "ssot-abgleich.mjs", "acc45-backlog.mjs"];
  const aufbauen = () => {
    const d = mkdtempSync(join(tmpdir(), "ssot-belege-cli-"));
    mkdirSync(join(d, "werkzeug"));
    for (const f of WERKZEUGE) copyFileSync(join(WURZEL, "werkzeug", f), join(d, "werkzeug", f));
    const git = (...a) => execFileSync("git", a, { cwd: d, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git("init", "-q");
    git("config", "user.email", "pruefung@example.org");
    git("config", "user.name", "Pruefung");
    git("config", "commit.gpgsign", "false");
    git("commit", "-q", "--allow-empty", "-m", "start");
    git("update-ref", "refs/remotes/origin/integration/release-v4", "HEAD");
    // absichtlich ungewöhnlich formatiert: byte-gleich heißt Originaltext, nicht neu serialisiert
    const ssotText = '{"pakete":[{"id":"WP-1","titel":"t","strang":"acc45","prio":"P2","status":"INTEGRATED","pr":[],"stufen":{}}]}';
    writeFileSync(join(d, "ssot.json"), ssotText);
    const lauf = (prs, ...extra) => {
      writeFileSync(join(d, "prs.json"), JSON.stringify(prs));
      return spawnSync(process.execPath, [join(d, "werkzeug", "ssot-belege.mjs"), ...extra, "--datei", join(d, "ssot.json"), "--prs", join(d, "prs.json")],
        { cwd: d, encoding: "utf8", env: { ...process.env, TMP: d, TEMP: d, TMPDIR: d }, timeout: 60000 });
    };
    return { d, ssotText, lauf, weg: () => rmSync(d, { recursive: true, force: true }) };
  };

  it("--anwenden mit PR-Nummer 0 oder „12a“ (→ „#0“, „#12a“) → Rückgabe 1, zurückgerollt, SSOT-Datei byte-gleich", () => {
    const u = aufbauen();
    try {
      // Gegenprobe: dieselbe Umgebung ohne --anwenden läuft (Rückgabe 0) — die 1 unten kommt nicht aus dem Aufbau
      const ok = u.lauf([{ number: 0, title: "WP-1: Test", headRefName: "x/wp-1" }]);
      expect(ok.status, ok.stderr).toBe(0);
      expect(ok.stdout).toMatch(/Dry-Run/);
      for (const number of [0, "12a", "012"]) {
        const r = u.lauf([{ number, title: "WP-1: Test", headRefName: "x/wp-1" }], "--anwenden");
        expect(r.status, `${number}: ${r.stdout}${r.stderr}`).toBe(1);
        expect(r.stdout, String(number)).toMatch(/zurückgerollt: ungültiger PR-Verweis/);
        expect(readFileSync(join(u.d, "ssot.json"), "utf8"), String(number)).toBe(u.ssotText);
      }
    } finally { u.weg(); }
  });
});

/* Review #486 (Opus) H-e: ssotPrBelege las p.pr locker mit /\d+/ („12“, „#0“, „#12a“ galten als PR 12/0/12). Jetzt genau
   PR_MUSTER; ein anderer Eintrag löst keinen Abruf aus. Gültige Einträge („#N“) wie vorher. */
describe("ssotPrBelege: SSOT-Feld pr nur nach PR_MUSTER (Review #486 H-e)", () => {
  it("ungültige Einträge → kein Abruf, kein Beleg; gültige „#N“ → Abruf mit N wie vorher", () => {
    const abrufe = [];
    const ansicht = (n) => { abrufe.push(n); return { state: "OPEN" }; };
    expect(ssotPrBelege({ pr: ["12", "#0", "#012", "#12a", " #5", "#5 ", "PR #5", 5, null, ["#5"], "#"] }, ansicht)).toEqual([]);
    expect(abrufe).toEqual([]);
    expect(ssotPrBelege({ pr: ["#5", "#123"] }, ansicht)).toEqual([]);
    expect(abrufe).toEqual(["5", "123"]);
    expect(ssotPrBelege({}, ansicht)).toEqual([]);
  });

  it("Quelltext: keine lockere Zahlensuche mehr in ssot-belege.mjs", () => {
    const text = readFileSync(join(WURZEL, "werkzeug", "ssot-belege.mjs"), "utf8");
    expect(text).not.toMatch(/match\(\/\\d\+\/\)/);
  });
});

/* Review #490 (Opus) Folgepunkte N1/N2.
   N1: abgleich() las p.pr noch locker mit /\d+/ (wie H-e in ssotPrBelege). Jetzt genau PR_MUSTER; ein ungültiger Eintrag
       bricht ab (fail-closed), gültige Daten („#N“) ergeben dasselbe Ergebnis wie vorher.
   N2: Eine Option mit Wert (--prs, --datei) ohne Wert ergab undefined, und das Werkzeug fiel still auf gh (Netz) bzw. auf
       den Standardpfad zurück. Jetzt: klarer Fehler, Rückgabe 2. */
describe("abgleich: SSOT-Feld pr nur nach PR_MUSTER, fail-closed (Review #490 N1)", () => {
  const ssot = (pr) => ({ pakete: [{ id: "WP-1", status: "INTEGRATED", pr, stufen: {} }] });

  it("gültige „#N“: Treffer wie vorher (Nummer im SSOT-Feld zählt bei gemergtem PR)", () => {
    expect(abgleich(ssot(["#5", "#123"]), [{ number: 5, title: "x", headRefName: "y" }])).toEqual([
      { id: "WP-1", status: "INTEGRATED", klasse: "OK", prs: ["#5"] },
    ]);
    expect(abgleich(ssot([]), [])).toEqual([{ id: "WP-1", status: "INTEGRATED", klasse: "BELEG_FEHLT", prs: [] }]);
    expect(abgleich(ssot(["#5"]), [])).toEqual([{ id: "WP-1", status: "INTEGRATED", klasse: "BELEG_FEHLT", prs: [] }]);
    expect(abgleich({ pakete: [{ id: "WP-1", status: "OPEN", stufen: {} }] }, [])).toEqual([{ id: "WP-1", status: "OPEN", klasse: "OK", prs: [] }]);
  });

  it("ungültiger Eintrag → Fehler mit Paket-ID und Eintrag, auch wenn der PR gemergt ist", () => {
    for (const x of ["12", "#0", "#012", "#12a", " #5", "#5 ", "PR #5", "#", 12, 0, null, ["#5"], {}]) {
      const prs = [{ number: 12, title: "x", headRefName: "y" }, { number: 5, title: "x", headRefName: "y" }];
      expect(() => abgleich(ssot(["#5", x]), prs), JSON.stringify(x)).toThrow(/WP-1.*ungültiger PR-Verweis.*#123/s);
    }
  });

  it("pr kein Array → Fehler", () => {
    for (const pr of ["#5", 5, { a: 1 }, true]) expect(() => abgleich(ssot(pr), []), JSON.stringify(pr)).toThrow(/WP-1.*kein Array/s);
  });

  it("Quelltext: keine lockere Zahlensuche mehr in ssot-abgleich.mjs; PR_MUSTER aus acc45-backlog.mjs", () => {
    const text = readFileSync(join(WURZEL, "werkzeug", "ssot-abgleich.mjs"), "utf8");
    expect(text).not.toMatch(/match\(\/\\d\+\/\)/);
    expect(text).toMatch(/import \{[^}]*\bPR_MUSTER\b[^}]*\} from "\.\/acc45-backlog\.mjs"/);
  });
});

describe("argWert: Option mit Wert verlangt einen Wert (Review #490 N2)", () => {
  it("liefert den Wert, undefined bei fehlender Option; Fehler bei fehlendem, leerem oder option-artigem Wert", () => {
    const av = (...a) => ["node", "skript", ...a];
    expect(argWert("--prs", av("--prs", "F"))).toBe("F");
    expect(argWert("--prs", av("--json"))).toBeUndefined();
    for (const a of [["--prs"], ["--prs", ""], ["--prs", "--anwenden"], ["--json", "--prs"]]) {
      expect(() => argWert("--prs", av(...a)), JSON.stringify(a)).toThrow(/--prs verlangt einen Wert/);
    }
  });
});

describe("CLI ssot-abgleich und ssot-belege: Fehler statt stillem Netzfallback, ungültiges pr → Rückgabe 2 (Review #490 N1/N2)", () => {
  const WERKZEUGE = ["ssot-belege.mjs", "gh-rest.mjs", "ssot-zuordnung.mjs", "ssot-abgleich.mjs", "acc45-backlog.mjs"];
  const SSOT = (pr) => `{"pakete":[{"id":"WP-1","titel":"t","strang":"acc45","prio":"P2","status":"INTEGRATED","pr":${pr},"stufen":{}}]}`;
  const aufbauen = (prJson = "[]") => {
    const d = mkdtempSync(join(tmpdir(), "ssot-n12-cli-"));
    mkdirSync(join(d, "werkzeug"));
    for (const f of WERKZEUGE) copyFileSync(join(WURZEL, "werkzeug", f), join(d, "werkzeug", f));
    const git = (...a) => execFileSync("git", a, { cwd: d, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git("init", "-q");
    git("config", "user.email", "pruefung@example.org");
    git("config", "user.name", "Pruefung");
    git("config", "commit.gpgsign", "false");
    git("commit", "-q", "--allow-empty", "-m", "start");
    git("update-ref", "refs/remotes/origin/integration/release-v4", "HEAD");
    const ssotText = SSOT(prJson);
    writeFileSync(join(d, "ssot.json"), ssotText);
    writeFileSync(join(d, "prs.json"), "[]");
    const lauf = (werkzeug, ...args) => spawnSync(process.execPath, [join(d, "werkzeug", werkzeug), ...args],
      { cwd: d, encoding: "utf8", env: { ...process.env, TMP: d, TEMP: d, TMPDIR: d }, timeout: 60000 });
    return { d, ssotText, lauf, weg: () => rmSync(d, { recursive: true, force: true }) };
  };
  const ssotDatei = (u) => readFileSync(join(u.d, "ssot.json"), "utf8");

  it("Gegenprobe: mit beiden Werten laufen beide Werkzeuge (Rückgabe 0)", () => {
    const u = aufbauen();
    try {
      for (const w of ["ssot-abgleich.mjs", "ssot-belege.mjs"]) {
        const r = u.lauf(w, "--datei", join(u.d, "ssot.json"), "--prs", join(u.d, "prs.json"));
        expect(r.status, `${w}: ${r.stdout}${r.stderr}`).toBe(0);
      }
      expect(ssotDatei(u)).toBe(u.ssotText);
    } finally { u.weg(); }
  });

  it("--prs oder --datei ohne Wert (am Ende, leer, oder Option als Wert) → Rückgabe 2, Meldung nennt die Option, SSOT byte-gleich", () => {
    const u = aufbauen();
    try {
      const faelle = [["--prs"], ["--datei"], ["--prs", ""], ["--datei", ""], ["--prs", "--anwenden"], ["--datei", "--json"]];
      for (const w of ["ssot-abgleich.mjs", "ssot-belege.mjs"]) {
        for (const f of faelle) {
          const mit = f[0] === "--prs" ? ["--datei", join(u.d, "ssot.json")] : ["--prs", join(u.d, "prs.json")];
          const r = u.lauf(w, ...mit, ...f);
          expect(r.status, `${w} ${JSON.stringify(f)}: ${r.stdout}${r.stderr}`).toBe(2);
          expect(r.stderr, `${w} ${JSON.stringify(f)}`).toContain(`${f[0]} verlangt einen Wert`);
          expect(ssotDatei(u)).toBe(u.ssotText);
        }
      }
      const r = u.lauf("ssot-belege.mjs", "--anwenden", "--datei", join(u.d, "ssot.json"), "--prs");
      expect(r.status, r.stdout + r.stderr).toBe(2);
      expect(ssotDatei(u)).toBe(u.ssotText);
    } finally { u.weg(); }
  });

  it("ungültiger Eintrag im SSOT-Feld pr → Rückgabe 2, keine Klassenausgabe, SSOT byte-gleich (auch mit --anwenden)", () => {
    // Ein Wegwerf-Repository für alle Fälle (Prozessstart ist teuer); die Varianten je Eintrag deckt der Unit-Test oben ab.
    const u = aufbauen();
    try {
      for (const pr of ['["#0"]', '["#012"]', '["#12a"]', "[12]", '["#5",null]']) {
        const text = SSOT(pr);
        writeFileSync(join(u.d, "ssot.json"), text);
        const cli = [["ssot-abgleich.mjs", "--pruefe"], ["ssot-belege.mjs", "--anwenden"]];
        for (const [w, ...extra] of cli) {
          const r = u.lauf(w, ...extra, "--datei", join(u.d, "ssot.json"), "--prs", join(u.d, "prs.json"));
          expect(r.status, `${pr} ${w} ${extra}: ${r.stdout}${r.stderr}`).toBe(2);
          expect(r.stderr, `${pr} ${w}`).toMatch(/ABGEBROCHEN.*WP-1.*ungültiger PR-Verweis/s);
          expect(r.stdout, `${pr} ${w}`).not.toMatch(/SSOT-(Abgleich|Belege)/);
          expect(ssotDatei(u), pr).toBe(text);
        }
      }
      // ohne --anwenden (Bericht) bricht ssot-belege ebenso ab
      const b = u.lauf("ssot-belege.mjs", "--datei", join(u.d, "ssot.json"), "--prs", join(u.d, "prs.json"));
      expect(b.status, b.stdout + b.stderr).toBe(2);
    } finally { u.weg(); }
  }, 180000);

  it("gültige Daten: Ausgabe von ssot-abgleich unverändert (JSON und Text)", () => {
    const u = aufbauen('["#5"]');
    try {
      writeFileSync(join(u.d, "prs.json"), JSON.stringify([{ number: 5, title: "x", headRefName: "y" }]));
      const args = ["--datei", join(u.d, "ssot.json"), "--prs", join(u.d, "prs.json")];
      const j = u.lauf("ssot-abgleich.mjs", "--json", ...args);
      expect(j.status).toBe(0);
      expect(JSON.parse(j.stdout)).toEqual([{ id: "WP-1", status: "INTEGRATED", klasse: "OK", prs: ["#5"] }]);
      const t = u.lauf("ssot-abgleich.mjs", ...args);
      expect(t.stdout).toBe('SSOT-Abgleich gegen integration/release-v4: {"OK":1}\n');
    } finally { u.weg(); }
  });
});
