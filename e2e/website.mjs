/* WEBSITE-W2: Hilfen des Prüfsatzes für die statisch gebaute Website (website/, e2e/website-pruefsatz.spec.mjs).
   Reine Hilfen ohne Playwright, damit pruefungen/website-pruefsatz.test.js sie ohne Browser prüft.
   Gebaut wird nur in einen Temp-Ordner (CENTRIC_OUT), nie in den Repo-Baum; der Server hört nur auf 127.0.0.1. */
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WEBSITE_QUELLE = path.join(WURZEL, "website");

/** Die Specs des Website-Projekts: die Viewport- und Zonenprojekte lassen sie aus (playwright.config.mjs). */
export const WEBSITE_SPEC = /website-pruefsatz\.spec\.mjs$/;

/** Prüfbreiten (px). Die Höhe ist für den Seitenscroll ohne Belang. */
export const WEB_BREITEN = Object.freeze([320, 390, 768, 1280]);
export const WEB_HOEHE = 800;

/** Ausnahmeliste der axe-Befunde (V3-Bestand), eine Datei neben der Spec. */
export const AUSNAHMEN_DATEI = path.join(path.dirname(fileURLToPath(import.meta.url)), "website-axe-ausnahmen.json");

/** Python 3 suchen: WEBSITE_PYTHON zuerst, dann python3, python, py. null, wenn keines lief (unter Windows ist
 *  `python` oft nur der Store-Alias, der nicht läuft). */
export function pythonFinden(umgebung = process.env, kandidaten = ["python3", "python", "py"]) {
  /* WEBSITE_PYTHON_NUR=1: nur WEBSITE_PYTHON zählt (Eigenlauf der Probe „kein Python“ in pruefungen/website-pruefsatz.test.js). */
  const weitere = umgebung.WEBSITE_PYTHON_NUR ? [] : kandidaten;
  for (const k of [umgebung.WEBSITE_PYTHON, ...weitere].filter(Boolean)) {
    const r = spawnSync(k, ["--version"], { encoding: "utf8" });
    if (r.status === 0 && /^Python 3/.test(`${r.stdout}${r.stderr}`)) return k;
  }
  return null;
}

/** Läuft der Rechner als CI? (GitHub Actions setzt CI=true; leer, "0" und "false" zählen nicht.) */
export function istCi(umgebung = process.env) {
  const w = String(umgebung.CI ?? "").trim().toLowerCase();
  return w !== "" && w !== "0" && w !== "false";
}

/** Was tun die Bauproben? "lauf" (Python da), "fehler" (kein Python in der CI: hart rot, kein stilles Überspringen),
 *  "skip" (kein Python, lokal: überspringen mit Hinweis auf WEBSITE_PYTHON). */
export function bauModus(python, umgebung = process.env) {
  if (python) return "lauf";
  return istCi(umgebung) ? "fehler" : "skip";
}
export const PYTHON_FEHLT_TEXT = "Python 3 nicht gefunden: Der Bau der Website kann nicht laufen. In der CI ist das ein Fehler "
  + "(kein stilles Überspringen). Lokal die Umgebungsvariable WEBSITE_PYTHON auf den Interpreter setzen.";

/** Baut website/ in einen frischen Temp-Ordner und gibt ihn zurück. Wirft mit der Ausgabe, wenn der Bau scheitert. */
export function websiteBauen(python, quelle = WEBSITE_QUELLE) {
  const ziel = mkdtempSync(path.join(tmpdir(), "centric-web-pruefsatz-"));
  const env = { ...process.env, CENTRIC_OUT: ziel, PYTHONDONTWRITEBYTECODE: "1" };
  delete env.CENTRIC_APP;
  delete env.CENTRIC_WEBSITE;
  const r = spawnSync(python, ["-B", "-I", path.join(quelle, "build.py")], { env, cwd: tmpdir(), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`Bau der Website schlug fehl:\n${r.stdout}\n${r.stderr}`);
  return ziel;
}

const TYPEN = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8" };

/** Einfacher statischer Server auf 127.0.0.1 (freier Port). Unbekannte Pfade: 404 mit der Seite 404.html. Keine
 *  Caddy-Kopfzeilen (die Site-Datei liegt nicht in diesem Zweig); Prüfsatz und Kopfzeilen sind getrennte Fragen. */
export function websiteServer(wurzel) {
  const server = createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { rel = "/"; }
    if (rel.endsWith("/")) rel += "index.html";
    const datei = path.resolve(wurzel, `.${rel}`);
    const ok = datei.startsWith(path.resolve(wurzel) + path.sep) && existsSync(datei) && statSync(datei).isFile();
    const wahl = ok ? datei : path.join(wurzel, "404.html");
    res.writeHead(ok ? 200 : 404, { "content-type": TYPEN[path.extname(wahl)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(wahl));
  });
  return new Promise((ok) => {
    server.listen(0, "127.0.0.1", () => ok({
      url: `http://127.0.0.1:${server.address().port}`,
      schliessen: () => new Promise((fertig) => server.close(() => fertig())),
    }));
  });
}

/** Alle HTML-Seiten im Wurzelordner der Site (Dateiliste), sortiert. */
export function seitenDateien(wurzel) {
  return readdirSync(wurzel).filter((f) => f.endsWith(".html")).sort();
}
/** Die Seiten aus sitemap.xml (Dateinamen). */
export function sitemapSeiten(wurzel) {
  const xml = readFileSync(path.join(wurzel, "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/^\//, "")).sort();
}

/** Sichtbarer Text einer HTML-Datei, grob: ohne Skripte, Stile und Tags, Leerraum gefaltet. */
export function klartext(html) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** Alle Preise, die die Website nennt, aus preise.html und assets/site.js (Rechner). Reiner Textabgleich, keine Rechnung. */
export function websitePreise(wurzel) {
  const html = readFileSync(path.join(wurzel, "preise.html"), "utf8");
  const text = klartext(html);
  const js = readFileSync(path.join(wurzel, "assets", "site.js"), "utf8");
  const zahl = (re, was) => {
    const m = re.exec(text);
    if (!m) throw new Error(`Preis nicht gefunden: ${was}`);
    return Number(m[1]);
  };
  const stufen = Object.fromEntries([["Basis", "basis"], ["Business", "pro"], ["Enterprise", "enterprise"]]
    .map(([name, id]) => [id, zahl(new RegExp(`${name} (\\d+) € je Monat`), `Stufe ${name}`)]));
  const baender = [...text.matchAll(/(bis 14 Personen kostenlos|(\d+) – (\d+) Personen \+ (\d+) €|über 150 Personen \+ (\d+) €)/g)]
    .map((m) => (m[2] ? { bis: Number(m[3]), zuschlag: Number(m[4]) } : m[5] ? { bis: null, zuschlag: Number(m[5]) } : { bis: 14, zuschlag: 0 }));
  /* Nur Pakete, bei denen die Website einen Preis nennt (WEBSITE-W4: Pakete unter Zustand 5 haben keinen Preis, also keinen Eintrag). */
  const pakete = Object.fromEntries([["sicherheit", "Sicherheitsdienst"], ["pflege", "Pflege"], ["klinik", "Klinik"], ["industrie", "Industrie und Anlagen"]]
    .map(([id, name]) => [id, new RegExp(`${name} \\+ ?(\\d+) €`).exec(text)])
    .filter(([, m]) => m).map(([id, m]) => [id, Number(m[1])]));
  const zusatzPlaner = zahl(/Planer-Zugang kostet (\d+) € im Monat/, "Zusatz-Planer");
  const rechnerStufen = /var STUFEN = (\[[^\n]*\]);/.exec(js);
  const rechnerBaender = /var BAENDER = (\[[^\n]*\]);/.exec(js);
  const rechnerZusatz = /var ZUSATZ_PLANER = (\d+);/.exec(js);
  if (!rechnerStufen || !rechnerBaender || !rechnerZusatz) throw new Error("Rechner-Konstanten in assets/site.js nicht gefunden");
  /* Die Rechner-Konstanten sind ein JS-Literal mit unquotierten Schlüsseln (kein Ausdruck, keine Funktionen). */
  const lit = (s) => JSON.parse(s.replace(/([{,])([A-Za-z]+):/g, '$1"$2":'));
  return {
    stufen, baender, pakete, zusatzPlaner,
    paketeInVorbereitung: /in Vorbereitung/i.test(text),
    testTage: [...text.matchAll(/(\d+) Tage testen/g)].map((m) => Number(m[1])),
    rechner: { stufen: lit(rechnerStufen[1]), baender: lit(rechnerBaender[1]), zusatzPlaner: Number(rechnerZusatz[1]),
      paketPreise: Object.fromEntries([...html.matchAll(/value="(\w+)" data-preis="(\d+)"/g)].map((m) => [m[1], Number(m[2])])) },
  };
}

/** Passt eine Ausnahme auf Seite, Regel, Modus und Viewport? */
export function ausnahmeFuer(liste, { regel, seite, modus, breite }) {
  return liste.find((a) => a.regel === regel && (a.seite === seite || a.seite === "*")
    && (!a.modus || a.modus === modus) && (!a.breiten || a.breiten.includes(breite))) || null;
}
export function ausnahmenLaden(datei = AUSNAHMEN_DATEI) {
  return JSON.parse(readFileSync(datei, "utf8")).ausnahmen;
}
/** Ausnahmen vom Seitenscroll (Reflow), gleiche Datei: je Seite und Breiten mit Obergrenze scrollMax (px). */
export function scrollAusnahmenLaden(datei = AUSNAHMEN_DATEI) {
  return JSON.parse(readFileSync(datei, "utf8")).scrollAusnahmen || [];
}
export function scrollAusnahmeFuer(liste, { seite, breite }) {
  return liste.find((a) => a.seite === seite && a.breiten.includes(breite)) || null;
}
/** Form der Ausnahmeliste: jede Ausnahme mit Regel, Seite, Begründung (V3-Bestand, W5) und Obergrenze der Knoten. */
export function ausnahmenFormFehler(liste, seiten, scrollListe = []) {
  const fehler = [];
  for (const a of scrollListe) {
    const k = JSON.stringify(a);
    if (!seiten.includes(a.seite)) fehler.push(`Scroll-Ausnahme: Seite unbekannt: ${k}`);
    if (!(Array.isArray(a.breiten) && a.breiten.length && a.breiten.every((b) => WEB_BREITEN.includes(b)))) fehler.push(`Scroll-Ausnahme: breiten ungueltig: ${k}`);
    if (!Number.isInteger(a.scrollMax) || a.scrollMax <= Math.max(0, ...(a.breiten || []))) fehler.push(`Scroll-Ausnahme: scrollMax (px) fehlt oder zu klein: ${k}`);
    if (typeof a.grund !== "string" || a.grund.trim().length < 20 || !/V3-Bestand/.test(a.grund) || a.wp !== "W5") fehler.push(`Scroll-Ausnahme: Grund (V3-Bestand) und wp W5 noetig: ${k}`);
  }
  for (const a of liste) {
    const k = JSON.stringify(a);
    if (typeof a.regel !== "string" || !a.regel) fehler.push(`Regel fehlt: ${k}`);
    if (a.seite !== "*" && !seiten.includes(a.seite)) fehler.push(`Seite unbekannt: ${k}`);
    if (typeof a.grund !== "string" || a.grund.trim().length < 20) fehler.push(`Grund fehlt oder zu kurz: ${k}`);
    if (!/V3-Bestand/.test(a.grund || "") || a.wp !== "W5") fehler.push(`Grund muss V3-Bestand nennen und wp W5 tragen: ${k}`);
    if (!Number.isInteger(a.knotenMax) || a.knotenMax < 1) fehler.push(`knotenMax (ganze Zahl >= 1) fehlt: ${k}`);
    if (a.modus && !["hell", "dunkel"].includes(a.modus)) fehler.push(`modus nur hell oder dunkel: ${k}`);
    if (a.breiten && !(Array.isArray(a.breiten) && a.breiten.every((b) => WEB_BREITEN.includes(b)))) fehler.push(`breiten ungueltig: ${k}`);
  }
  return fehler;
}
