// WEBSITE-W1: Die Quelle der oeffentlichen Website (website/) baut ohne Netz,
// deterministisch und byte-gleich zur Pruefsummenliste website/DIST-SHA256.
// Gebaut wird nur in Temp-Verzeichnisse (CENTRIC_OUT), nie in den Repo-Baum.
// Ohne Python 3 laufen die Bauproben lokal als skip (Hinweis: WEBSITE_PYTHON); in der CI
// (Umgebungsvariable CI gesetzt) ist fehlendes Python ein Fehler, kein stilles Ueberspringen
// (e2e/website.mjs, bauModus). Die Dateiproben laufen immer.
import { describe, it, expect } from "vitest";
import { pythonFinden, bauModus, PYTHON_FEHLT_TEXT, klartext } from "../e2e/website.mjs";
import { spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, relative, sep } from "node:path";

const WURZEL = resolve(import.meta.dirname, "..");
const WEB = join(WURZEL, "website");
const LISTE = join(WEB, "DIST-SHA256");

const PY = pythonFinden();
const MODUS = bauModus(PY);
/* lauf: normal; fehler (kein Python in der CI): jede Bauprobe schlägt mit klarem Text fehl; skip: lokal übersprungen. */
const bauprobe = MODUS === "lauf" ? it
  : MODUS === "fehler" ? (name) => it(name, () => { throw new Error(PYTHON_FEHLT_TEXT); })
    : it.skip;

function dateien(wurzel) {
  const aus = [];
  const geh = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) geh(p);
      else aus.push(p);
    }
  };
  geh(wurzel);
  return aus.map((p) => relative(wurzel, p).split(sep).join("/")).sort();
}
function sha(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}
function summen(wurzel) {
  return Object.fromEntries(dateien(wurzel).map((f) => [f, sha(join(wurzel, f))]));
}
function liste() {
  const m = {};
  for (const z of readFileSync(LISTE, "utf8").split("\n").filter(Boolean)) {
    const t = /^([0-9a-f]{64}) {2}(\S.*)$/.exec(z);
    if (!t) throw new Error(`Zeile in DIST-SHA256 ist falsch: ${z}`);
    m[t[2]] = t[1];
  }
  return m;
}
function bauen(quelle, ziel) {
  const env = { ...process.env, CENTRIC_OUT: ziel, PYTHONDONTWRITEBYTECODE: "1" };
  delete env.CENTRIC_APP;
  delete env.CENTRIC_WEBSITE;
  const r = spawnSync(PY, ["-B", "-I", join(quelle, "build.py")], { env, cwd: tmpdir(), encoding: "utf8" });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
}
function abzug() {
  // Dateiname, Groesse und Aenderungszeit unter website/ plus die Namen im Repo-Wurzelordner.
  const web = dateien(WEB).map((f) => {
    const s = statSync(join(WEB, f));
    return `${f}|${s.size}|${s.mtimeMs}`;
  });
  return { web, wurzel: readdirSync(WURZEL).sort() };
}
function tmp(pre) {
  return mkdtempSync(join(tmpdir(), pre));
}

describe("website-quelle: Dateien", () => {
  it("website/ ist da und enthaelt Generator, Schriften, Drei.js und Pruefsummenliste", () => {
    for (const f of ["build.py", "README.md", "README-QUELLE.md", "DIST-SHA256", "assets/vendor/three.min.js", "assets/fonts/Jura-Light.ttf"]) {
      expect(existsSync(join(WEB, f)), f).toBe(true);
    }
  });

  it("kein Bauergebnis und keine Datei ueber 5 MB in website/", () => {
    const alle = dateien(WEB);
    expect(alle.filter((f) => f.startsWith("dist/") || f.includes("__pycache__"))).toEqual([]);
    for (const f of alle) expect(statSync(join(WEB, f)).size, f).toBeLessThan(5 * 1024 * 1024);
  });

  it("DIST-SHA256 ist gueltig: 32 Dateien, sortiert, LF, keine Pfade nach draussen", () => {
    const roh = readFileSync(LISTE, "utf8");
    expect(roh.includes("\r")).toBe(false);
    const m = liste();
    const namen = Object.keys(m);
    expect(namen.length).toBe(32);
    expect(namen).toEqual([...namen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    for (const n of namen) expect(n.startsWith("/") || n.includes("..")).toBe(false);
  });

  it("build.py importiert nur Standardmodule ohne Netzzugriff", () => {
    const q = readFileSync(join(WEB, "build.py"), "utf8");
    const module = [...q.matchAll(/^\s*(?:import|from)\s+([A-Za-z0-9_., ]+?)(?:\s+import\b.*)?$/gm)]
      .flatMap((t) => t[1].split(",").map((s) => s.trim().split(".")[0]));
    const erlaubt = new Set(["base64", "datetime", "json", "math", "os", "re", "shutil", "sys"]);
    expect(module.filter((x) => !erlaubt.has(x))).toEqual([]);
    expect(/urllib|socket|http\.client|requests|subprocess/.test(q)).toBe(false);
  });
});

describe("website-quelle: Bau", () => {
  bauprobe("baut zweimal gleich und byte-gleich zur Liste, ohne in den Repo-Baum zu schreiben", () => {
    const vorher = abzug();
    const a = tmp("web-a-");
    const b = tmp("web-b-");
    try {
      bauen(WEB, a);
      bauen(WEB, b);
      const sa = summen(a);
      expect(summen(b)).toEqual(sa);
      expect(sa).toEqual(liste());
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
    expect(abzug()).toEqual(vorher);
    expect(existsSync(join(WEB, "dist"))).toBe(false);
    expect(existsSync(join(WEB, "__pycache__"))).toBe(false);
  });

  bauprobe("Mutation: geaenderte Quelle (build.py oder Asset) wird von der Liste erkannt", () => {
    const q = tmp("web-q-");
    const o1 = tmp("web-o1-");
    const o2 = tmp("web-o2-");
    try {
      cpSync(WEB, q, { recursive: true });
      const bp = join(q, "build.py");
      const roh = readFileSync(bp, "utf8");
      const neu = roh.replace("Dienstplanung für rotierende Schichtbetriebe", "Dienstplanung für rotierende Schichtbetriebe!");
      expect(neu).not.toBe(roh);
      writeFileSync(bp, neu);
      bauen(q, o1);
      const s1 = summen(o1);
      const l = liste();
      expect(Object.keys(s1).filter((f) => s1[f] !== l[f]).length).toBeGreaterThan(0);

      writeFileSync(bp, roh);
      const lic = join(q, "assets", "vendor", "three.LICENSE.txt");
      writeFileSync(lic, `${readFileSync(lic, "utf8")}x`);
      bauen(q, o2);
      const s2 = summen(o2);
      expect(s2["assets/vendor/three.LICENSE.txt"]).not.toBe(l["assets/vendor/three.LICENSE.txt"]);
    } finally {
      for (const d of [q, o1, o2]) rmSync(d, { recursive: true, force: true });
    }
  });
});

/* ---------------------------------------------------------------------------------------------------------------------
   WEBSITE-W4 (Betreiberentscheidung 2026-11-24, P2-39 Option A; Modul-Audit L-1, Prüfpunkt P14):
   Kein Preis, kein Schalter und keine „enthalten“-Aussage für ein Branchenpaket unter Zustand 5. Die Tabelle PAKET_ZUSTAND in
   website/build.py ist die eine Quelle; ein Paket ohne Eintrag ist fail-closed „In Vorbereitung“. Der Zustand 5 ist heute für
   kein Paket erreicht (server/lib/paketstand.mjs, PAKET_FREIGABEN leer); der Gegenversuch mit Zustand 5 beweist, dass die
   Prüfung rot werden kann.
   --------------------------------------------------------------------------------------------------------------------- */
const VORB = /in vorbereitung/i;
const htmlSeiten = (wurzel) => Object.fromEntries(dateien(wurzel).filter((f) => f.endsWith(".html"))
  .map((f) => [f, readFileSync(join(wurzel, f), "utf8")]));
/** Alle Preis- und Schalterspuren eines Pakets (Name, Id) in den gebauten Seiten. */
function paketSpuren(wurzel, { id, name }) {
  const gefunden = [];
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const kurz = n.split(" und ")[0];
  for (const [f, html] of Object.entries(htmlSeiten(wurzel))) {
    if (new RegExp(`${n} \\+ ?\\d+ €`).test(klartext(html))) gefunden.push(`${f}: Preis neben „${name}“`);
    if (new RegExp(`<li><b>${kurz}</b><span>[^<]*</span><em>\\+\\d+ €</em>`).test(html)) gefunden.push(`${f}: Preis im Band`);
    if (html.includes(`value="${id}"`)) gefunden.push(`${f}: Schalter ${id}`);
  }
  return gefunden;
}
function bauenMitQuelle(aenderung) {
  const q = tmp("web-w4q-");
  const o = tmp("web-w4o-");
  try {
    cpSync(WEB, q, { recursive: true });
    const bp = join(q, "build.py");
    const roh = readFileSync(bp, "utf8");
    const neu = aenderung(roh);
    if (neu !== roh) writeFileSync(bp, neu);
    bauen(q, o);
    return { seiten: htmlSeiten(o), wurzel: o, aufraeumen: () => rmSync(o, { recursive: true, force: true }) };
  } catch (e) {
    rmSync(o, { recursive: true, force: true });
    throw e;
  } finally {
    rmSync(q, { recursive: true, force: true });
  }
}

describe("website-quelle W4: Pakete unter Zustand 5 ohne Preis und Schalter, fail-closed", () => {
  it("PAKET_ZUSTAND in build.py = paketZustand der Anwendung (keine zweite Liste, die driftet)", async () => {
    const { paketZustand } = await import("../server/lib/paketstand.mjs");
    const { PAKETE_ROH } = await import("../server/lib/paketliste.mjs");
    const q = readFileSync(join(WEB, "build.py"), "utf8");
    const block = /PAKET_ZUSTAND = \{([^}]*)\}/.exec(q);
    expect(block, "PAKET_ZUSTAND fehlt in build.py").not.toBeNull();
    const web = Object.fromEntries([...block[1].matchAll(/"(\w+)":\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
    const app = Object.fromEntries(PAKETE_ROH.filter((p) => !p.pflicht).map((p) => [p.id, paketZustand(p.id)]));
    expect(web).toEqual(app);
    for (const z of Object.values(app)) expect(z, "heute ist kein Paket buchbar").toBeLessThan(5);
  });

  it("jedes Paket der Quelle steht in PAKET_ZUSTAND; der rohe Zielpreis wird nur in paket_preis() gelesen", () => {
    const q = readFileSync(join(WEB, "build.py"), "utf8");
    const ids = [...q.matchAll(/dict\(id="(\w+)", name="[^"]+", zielpreis=\d+/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    const block = /PAKET_ZUSTAND = \{([^}]*)\}/.exec(q)[1];
    for (const id of ids) expect(block, id).toContain(`"${id}"`);
    expect(q.includes('["aufpreis"]'), "kein Zugriff auf den rohen Preis").toBe(false);
    const fremd = q.split("\n").filter((z) => /zielpreis/.test(z) && !/^\s*#/.test(z) && !/^\s*dict\(id="\w+", name="[^"]+", zielpreis=\d+/.test(z)
      && !/return p\["zielpreis"\] if paket_buchbar\(p\) else None/.test(z) && !/^\s*"""/.test(z));
    expect(fremd, "zielpreis nur in PAKETE und paket_preis()").toEqual([]);
  });

  /* Sentinel: eindeutige Zielpreise, unabhängig von Schreibweise, Namen und Markup. Zustand 1: keine Ziffernfolge in irgendeiner dist-Datei
     (HTML samt Attributen, JS, XML, Text). Zustand 5 für Sicherheitsdienst: die Folge steht auf Startseite (Band und Karte), Branchen
     und Preise (Karte und Rechner-Schalter); die Prüfung kann also rot werden. */
  const SENTINEL = { sicherheit: "97301", pflege: "97302", klinik: "97303", industrie: "97304", neumodul: "97349" };
  const sentinelQuelle = (roh) => {
    let q = roh.replace("\nROLLEN = [", '\nPAKETE.append(dict(id="neumodul", name="Neues Modul", zielpreis=49, band="x", kurz="Kurz", punkte=["P"]))\n\nROLLEN = [');
    for (const [id, s] of Object.entries(SENTINEL)) q = q.replace(new RegExp(`(id="${id}", name="[^"]+", zielpreis=)\\d+`), `$1${s}`);
    return q;
  };
  const rohDateien = (wurzel) => dateien(wurzel).map((f) => [f, readFileSync(join(wurzel, f), "latin1")]).filter(([f]) => !/\.(ttf|woff2?)$/.test(f));
  const treffer = (wurzel, zahl) => rohDateien(wurzel).filter(([, t]) => t.includes(zahl)).map(([f]) => f);

  bauprobe("Sentinel: Zustand 1 für alle Pakete, kein Zielpreis in irgendeiner dist-Datei (Text, Attribut, Skript)", () => {
    const r = bauenMitQuelle(sentinelQuelle);
    try {
      for (const [id, s] of Object.entries(SENTINEL)) expect(treffer(r.wurzel, s), `${id} (${s})`).toEqual([]);
    } finally {
      r.aufraeumen();
    }
  });

  bauprobe("Sentinel-Gegenprobe: Zustand 5 für Sicherheitsdienst zeigt den Zielpreis an allen Ausgabestellen, andere Pakete nicht", () => {
    const r = bauenMitQuelle((roh) => sentinelQuelle(roh).replace('"sicherheit": 1,', '"sicherheit": 5,'));
    try {
      const n = (f) => (r.seiten[f].match(/97301/g) || []).length;
      expect(n("index.html"), "Startseite: Band und Karte").toBeGreaterThanOrEqual(2);
      expect(n("branchen.html"), "Branchen: Eyebrow").toBeGreaterThanOrEqual(1);
      expect(n("preise.html"), "Preise: Karte, Schalter-Anzeige und data-preis").toBeGreaterThanOrEqual(3);
      for (const id of ["pflege", "klinik", "industrie", "neumodul"]) expect(treffer(r.wurzel, SENTINEL[id]), id).toEqual([]);
    } finally {
      r.aufraeumen();
    }
  });

  bauprobe("P14: dist ohne Preis oder Schalter für Pakete unter Zustand 5, mit „In Vorbereitung“, ohne „enthalten“", async () => {
    const { paketZustand } = await import("../server/lib/paketstand.mjs");
    const { PAKETE_ROH } = await import("../server/lib/paketliste.mjs");
    const a = tmp("web-w4-");
    try {
      bauen(WEB, a);
      const seiten = htmlSeiten(a);
      /* Namen so, wie die Website sie druckt (nicht die App-Namen "Pflege und Rettungsdienst" usw.). */
      const WEBNAMEN = { sicherheit: "Sicherheitsdienst", pflege: "Pflege", klinik: "Klinik", industrie: "Industrie und Anlagen" };
      for (const p of PAKETE_ROH.filter((x) => !x.pflicht && paketZustand(x.id) < 5)) {
        expect(paketSpuren(a, { id: p.id, name: WEBNAMEN[p.id] }), `${p.id}: Preis oder Schalter`).toEqual([]);
      }
      for (const [f, html] of Object.entries(seiten)) {
        expect(html.includes("data-preis"), `${f}: data-preis`).toBe(false);
        expect(html.includes('name="paket"'), `${f}: Paketschalter`).toBe(false);
        expect(/Zwei Branchenpakete enthalten/.test(html), `${f}: „Zwei Branchenpakete enthalten“`).toBe(false);
        expect(/Branchenpakete ab \d+ €/.test(html), `${f}: „Branchenpakete ab N €“`).toBe(false);
        expect(/Branchenpaket · \+/.test(html), `${f}: „Branchenpaket · + N €“`).toBe(false);
        expect(/fünf Pakete|<strong>5<\/strong><span>Branchenpakete/.test(html), `${f}: „5 Branchenpakete“`).toBe(false);
      }
      for (const f of ["index.html", "branchen.html", "preise.html"]) expect(VORB.test(klartext(seiten[f])), `${f}: In Vorbereitung`).toBe(true);
      expect(klartext(seiten["preise.html"])).toContain("Branchenpakete: In Vorbereitung – noch nicht buchbar");
    } finally {
      rmSync(a, { recursive: true, force: true });
    }
  });

  bauprobe("fail-closed: ein neues Paket ohne Eintrag und ungültige Zustandswerte (9, „5“, 5.0) bleiben ohne Preis und Schalter", () => {
    const r = bauenMitQuelle((roh) => {
      let q = roh.replace("\nROLLEN = [", '\nPAKETE.append(dict(id="neumodul", name="Neues Modul", zielpreis=49, band="x", kurz="Kurz", punkte=["P"]))\n\nROLLEN = [');
      q = q.replace('"sicherheit": 1,', '"sicherheit": 9,').replace('"pflege": 1,', '"pflege": "5",').replace('"industrie": 1,', '"industrie": 5.0,');
      expect(q).not.toBe(roh);
      return q;
    });
    try {
      expect(Object.values(r.seiten).some((h) => h.includes("Neues Modul")), "das neue Modul wird gezeigt (Karten)").toBe(true);
      for (const p of [{ id: "neumodul", name: "Neues Modul" }, { id: "sicherheit", name: "Sicherheitsdienst" }, { id: "pflege", name: "Pflege" },
        { id: "industrie", name: "Industrie und Anlagen" }, { id: "klinik", name: "Klinik" }]) {
        expect(paketSpuren(r.wurzel, p), p.id).toEqual([]);
      }
      for (const [f, h] of Object.entries(r.seiten)) expect(h.includes("data-preis") || h.includes('name="paket"'), f).toBe(false);
      expect(klartext(r.seiten["preise.html"])).toContain("Branchenpakete: In Vorbereitung – noch nicht buchbar");
    } finally {
      r.aufraeumen();
    }
  });

  bauprobe("Gegenprobe: Zustand 5 für ein Paket zeigt Preis, Schalter und die Enterprise-Aussage (die Prüfung kann also rot werden)", () => {
    const r = bauenMitQuelle((roh) => {
      const q = roh.replace('"sicherheit": 1,', '"sicherheit": 5,');
      expect(q).not.toBe(roh);
      return q;
    });
    try {
      expect(paketSpuren(r.wurzel, { id: "sicherheit", name: "Sicherheitsdienst" }).length).toBeGreaterThan(0);
      expect(r.seiten["preise.html"]).toContain('value="sicherheit" data-preis="79"');
      expect(klartext(r.seiten["preise.html"])).toContain("Zwei Branchenpakete enthalten");
      for (const p of [{ id: "pflege", name: "Pflege" }, { id: "klinik", name: "Klinik" }, { id: "industrie", name: "Industrie und Anlagen" }]) {
        expect(paketSpuren(r.wurzel, p), p.id).toEqual([]);
      }
    } finally {
      r.aufraeumen();
    }
  });
});
