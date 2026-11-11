/* ==========================================================================
   ROUTEN-INVENTAR — Pflicht-Sondenprüfung (interne Sicherheitsprüfung 2026-11)

   Bis hierher gab es keine Prüfung, die sagt: „Jeder Weg, den der Server
   annimmt, steht in der Rechtematrix und wird von mindestens einer Prüfung
   aufgerufen.“ rechtematrix-zeilen.test.js bindet die Datenklassen (§1) an
   den Code, sitzungsinventar.test.js das Lesen der Sitzung — ein neues
   `if (pfad === "x")` in daten.mjs oder ein neuer `config.path` lief aber
   ohne Zeile und ohne Sonde durch.

   Diese Prüfung liest die Wege aus dem Quelltext (config.path der
   Funktionen und die Wege, die server.mjs selbst beantwortet, z. B.
   /gesund; jeder Vergleich mit `pfad` in jeder Form: `pfad === "…"`,
   `'…' !== pfad`, `switch (pfad) { case "…": }`, `[…].includes(pfad)`,
   die PFADE-Listen und `pfad.startsWith("…")` — nach Entfernen der
   Kommentare, Review S4) und verlangt für JEDEN:
     1. einen Eintrag in INVENTAR unten (neuer Weg ohne Eintrag → rot),
     2. eine Zeile in RECHTEMATRIX.md (Weg in Backticks, auch als
        Platzhalter `…/*`) — oder eine ausdrücklich begründete Lücke,
     3. mindestens eine Datei unter pruefungen/, die den Weg aufruft,
        und die im Inventar genannten Sonden-Dateien müssen ihn enthalten.
   Ein Eintrag im Inventar, den es im Code nicht mehr gibt, ist ebenfalls rot.
   Sonden zählen nur außerhalb von Kommentaren. Zur Laufzeit: Ein unbekannter
   Unterweg jeder Präfix-Funktion antwortet 404 (auch mit gültiger Sitzung)
   — der Rückfall bleibt „gibt es nicht“, nie eine stille Antwort.

   Bekannte Lücken stehen in LUECKEN mit Grund; ihre Zahl ist festgeschrieben,
   damit eine neue Lücke eine bewusste Änderung dieser Datei braucht.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUNKTIONEN = path.join(WURZEL, "server", "funktionen");

/** Weg → Sonden-Dateien (unter pruefungen/), die ihn aufrufen, auch mit
 *  einer Rolle, die es nicht darf, wo das sinnvoll ist. */
export const INVENTAR = {
  "/api/zugaenge": ["pentest.mjs", "sicherheit-intern.test.js"],
  "/api/raum-loeschen": ["pentest.mjs"],
  "/api/zugaenge-uebersicht": ["rechte.mjs", "server.test.js", "si-p5-sonden.test.js"],
  "/api/zugang-sperren": ["rechte.mjs", "sitzungsbindung.test.js"],
  "/api/einladung": ["einladungen.test.js"],            // WP-18: Leitung stellt aus; Planung, Beschäftigte, Demo 403
  "/api/einladung/annehmen": ["einladungen.test.js"],   // WP-18: ohne Sitzung, einmalig
  "/api/einladung/liste": ["einladungen.test.js"],      // WP-18 (B2): nur Metadaten, nie das Token
  "/api/einladung/widerrufen": ["einladungen.test.js"], // WP-18 (B2): sperrt dauerhaft, Einlösen danach 410
  "/einladung": ["einladungen-oberflaeche.test.js"],    // WP-18 (B4): Einlöseseite, Referrer-Policy no-referrer
  "/api/bestand-anlegen": ["rechte.mjs"],
  "/api/demos": ["demozugang.mjs"],
  "/api/demo": ["demozugang.mjs", "rollen-eintritt.test.js"],
  "/api/anmelden": ["betreiber-zweifaktor.test.js", "bremse-lokal.test.js"],
  "/api/abmelden": ["pentest.mjs", "rollen-failclosed.test.js"],
  "/api/bestand": ["abnahme-409.test.js", "pentest.mjs"],   // rechtematrix.test.js nannte den Weg nur im Kommentar (S4)
  "/api/br-auswertung": ["br-auswertung.test.js"],
  "/api/stempeln": ["datenintegritaet.test.js", "bremse-wp47.test.js"],   // stempel-datenschutz: nur Kommentar (S4)
  "/api/stempel-korrektur": ["korrekturworkflow.test.js", "rollen-failclosed.test.js"],
  "/api/korrektur-antrag": ["rollen-failclosed.test.js", "si-p5-sonden.test.js"],
  "/api/korrektur-entscheiden": ["rollen-failclosed.test.js"],
  "/api/krankmeldung": ["rb2-krankmeldung.test.js"],                // RB-2: melden, vorläufig (SV), endgültig (Planung/Leitung)
  "/api/selbstauskunft-entscheiden": ["rollen-failclosed.test.js", "selbstauskunft.test.js"],   // WP-15
  "/api/monatsabschluss": ["rollen-failclosed.test.js"],   // WP-16: abschliessen staff.edit, wiederoeffnen/lohnexport org.edit; Matrixzeile §2
  "/api/zeit-bestaetigen": ["rollen-failclosed.test.js", "zeiterfassung.test.js"],   // stempel-datenschutz: nur Kommentar (S4)
  "/api/auskunft": ["dsgvo-server.test.js"],
  "/api/vollausgabe": ["pentest.mjs", "rollen-failclosed.test.js"],
  "/api/sicherungsschluessel": ["verwaltungswege.test.js", "sicherung.mjs", "si-p5-sonden.test.js"],
  "/api/sicherung": ["rollen-failclosed.test.js", "wiederherstellen-ui.test.js", "si-p5-sonden.test.js"],
  "/api/sicherungen": ["rollen-failclosed.test.js", "wiederherstellen-ui.test.js", "si-p5-sonden.test.js"],
  "/api/wiederherstellen": ["wiederherstellen-ui.test.js", "mandanten-session.test.js"],
  "/api/account/anmelden": ["anmeldung-http.test.js"],
  "/api/account/sitzung": ["anmeldung-http.test.js"],
  "/api/account/abmelden": ["anmeldung-http.test.js"],
  "/api/account/mitgliedschaften": ["betriebsauswahl.test.js"],
  "/api/account/betrieb": ["betriebsauswahl.test.js"],
  "/api/registrierung": ["registrierung-http.test.js", "si-p5-sonden.test.js"],
  "/api/registrierung/verifizieren": ["registrierung-http.test.js", "si-p5-sonden.test.js"],
  "/api/registrierung/passwort": ["passwort-http.test.js", "si-p5-sonden.test.js"],
  "/einrichten": ["server.test.js"],
  "/einrichten/verwalter": ["zweifaktor.test.js"],
  "/einrichten/umgebung": ["zweifaktor.test.js"],
  "/einrichten/uebersicht": ["zweifaktor.test.js"],
  "/einrichten/bindung": ["altcodes.test.js"],
  "/einrichten/zweifaktor": ["zweifaktor.test.js"],
  "/kalender/einrichten": ["kalender-rechte.test.js"],
  "/kalender/daten": ["kalender-rechte.test.js"],
  "/kalender/loeschen": ["kalender-rechte.test.js"],
  "/kalender/feed": ["kalender-feed-live.test.js"],
  "/zustellung/senden": ["zustellung-rechte.test.js"],
  "/zustellung/anmelden": ["zustellung-rechte.test.js", "sicherheit-intern.test.js"],
  "/zustellung/abmelden": ["zustellung-rechte.test.js"],
  "/zustellung/schluessel": ["server.test.js"],
  "/zustellung/status": ["mail-push-handler.test.js", "zustellung-rechte.mjs"],   // WP-30, eigener Zustellstatus
  "/lage": ["rechte.mjs", "server.test.js", "si-p5-sonden.test.js"],
  "/starten": ["starten.test.js", "si-p5-sonden.test.js"],
  "/starten/neu": ["starten.test.js", "si-p5-sonden.test.js"],
  "/gesund": ["prozesssperre.test.js"],
  "/api/import/upload": ["import-endpunkt.test.js", "import-sonden.test.js", "import-rumpfgrenze.test.js"],   // IMP-3: Leitung, Planung; Kunde, Betreiber 403; Rumpf bis 10 MB
  "/api/import/analyse": ["import-sonden.test.js", "import-rumpfgrenze.test.js"],       // IMP-3: fremder Vorgang 404; Rumpf bis 2 MB
  "/api/import/vorschau": ["import-sonden.test.js", "import-rumpfgrenze.test.js"],      // IMP-3: wie analyse
  "/api/import/uebernahme": ["import-sonden.test.js", "import-rumpfgrenze.test.js"],    // IMP-3: wie analyse, plus Bestätigungscode
  "/api/import/verwerfen": ["import-sonden.test.js", "import-rumpfgrenze.test.js"],     // IMP-3: wie analyse
};

/** Wege ohne eigene Zeile in RECHTEMATRIX.md — bewusst, mit Grund. */
export const LUECKEN = {};   // SI-P5: alle Wege haben eine Matrixzeile in §2
const LUECKEN_ANZAHL = 0;

/* ---------------------------------------------------------------- Quelltext */
/* Review S4: Kommentare werden vor jeder Suche entfernt (im Code UND in den
   Sonden — ein Weg nur im Kommentar ist weder Route noch Sonde). Ein kleiner
   Leser statt eines Musters, damit "/api/*" in einer Zeichenkette oder ein
   regulärer Ausdruck nicht als Kommentaranfang gilt. Zeichenketten bleiben
   unverändert stehen. */
export function ohneKommentare(t) {
  let aus = "", i = 0, letztes = "";
  const regexDavor = /[(,=:[!&|?{};+\-*%<>~^]|^$/;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (c === "/" && n === "/") { while (i < t.length && t[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { const j = t.indexOf("*/", i + 2); i = j < 0 ? t.length : j + 2; aus += " "; continue; }
    if (c === "\"" || c === "'" || c === "`") {
      let j = i + 1;
      while (j < t.length && t[j] !== c) { if (t[j] === "\\") j++; j++; }
      aus += t.slice(i, j + 1); i = j + 1; letztes = c; continue;
    }
    if (c === "/" && (regexDavor.test(letztes) || /\b(return|typeof|case|in|of)\s*$/.test(aus.slice(-12)))) {
      let j = i + 1, klasse = false;
      while (j < t.length && t[j] !== "\n") {
        if (t[j] === "\\") { j += 2; continue; }
        if (t[j] === "[") klasse = true; else if (t[j] === "]") klasse = false;
        else if (t[j] === "/" && !klasse) break;
        j++;
      }
      aus += t.slice(i, j + 1); i = j + 1; letztes = "/"; continue;
    }
    aus += c; if (!/\s/.test(c)) letztes = c; i++;
  }
  return aus;
}

const Q = String.raw`(["'\x60])([^"'\x60\n]*)\1`;
/** Alle Vergleichsformen mit `pfad`: pfad === "x", "x" === pfad (je ! / einfache
 *  oder doppelte Gleichheit, jede Anführung), pfad.startsWith("x"),
 *  switch (pfad) { case "x": }, [..].includes(pfad) und …PFADE = [..].
 *  Erwartet Text ohne Kommentare.
 *  @param {string} text @returns {Set<string>} */
export function pfadVergleiche(text) {
  const teile = new Set();
  for (const m of text.matchAll(new RegExp(String.raw`\bpfad\s*[!=]==?\s*` + Q, "g"))) teile.add(m[2]);
  for (const m of text.matchAll(new RegExp(Q + String.raw`\s*[!=]==?\s*pfad\b`, "g"))) teile.add(m[2]);
  for (const m of text.matchAll(new RegExp(String.raw`\bpfad\.startsWith\(\s*` + Q, "g"))) teile.add(m[2].replace(/\/$/, ""));
  for (const m of text.matchAll(/\bswitch\s*\(\s*pfad\s*\)\s*\{/g)) {
    let tiefe = 1, j = m.index + m[0].length;
    while (j < text.length && tiefe > 0) { if (text[j] === "{") tiefe++; else if (text[j] === "}") tiefe--; j++; }
    for (const c of text.slice(m.index, j).matchAll(new RegExp(String.raw`\bcase\s+` + Q + String.raw`\s*:`, "g"))) teile.add(c[2]);
  }
  const listen = [...text.matchAll(/\[([^[\]]*)\]\s*\.includes\(\s*pfad\s*\)/g), ...text.matchAll(/[A-Z_]*PFADE\s*=\s*\[([\s\S]*?)\]/g)];
  for (const m of listen) for (const n of m[1].matchAll(new RegExp(Q, "g"))) teile.add(n[2]);
  return teile;
}

/** Wege aus dem Text einer Funktionsdatei (config.path + Vergleiche). */
export function wegeAusFunktion(roh) {
  const wege = new Set();
  const text = ohneKommentare(roh);
  const cfg = (text.match(/export const config = \{[\s\S]*?\};/) || [""])[0];
  const muster = [...cfg.matchAll(new RegExp(Q, "g"))].map((m) => m[2]).filter((p) => p.startsWith("/"));
  const praefixe = muster.filter((p) => p.endsWith("/*")).map((p) => p.slice(0, -1));
  for (const p of muster) if (!p.endsWith("/*")) wege.add(p);
  const teile = pfadVergleiche(text);
  for (const t of teile) {
    if (t === "") continue;                                   // Wurzel des Präfixes, steht als config.path
    if (t.startsWith("/")) { wege.add(t); continue; }        // absolute Pfade (anmeldung, registrierung)
    for (const p of praefixe) wege.add(p + t);
  }
  /* Nur Präfix ohne Unterwege (z. B. /starten/*): der Präfix selbst ist ein Weg. */
  if (praefixe.length && !teile.size) for (const p of praefixe) wege.add(p.replace(/\/$/, ""));
  return wege;
}

async function wegeAusQuelltext() {
  const wege = new Set();
  for (const datei of (await readdir(FUNKTIONEN)).filter((d) => d.endsWith(".mjs")))
    for (const w of wegeAusFunktion(await readFile(path.join(FUNKTIONEN, datei), "utf8"))) wege.add(w);
  /* Wege, die server.mjs selbst beantwortet (/gesund) — nur absolute Pfade. */
  const server = ohneKommentare(await readFile(path.join(WURZEL, "server.mjs"), "utf8"));
  for (const t of pfadVergleiche(server)) if (t.startsWith("/")) wege.add(t);
  return wege;
}

function matrixHat(matrix, weg) {
  const spannen = [...matrix.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  return spannen.some((s) => s.split(/[\s,]+/).some((wort) => {
    const w = wort.replace(/^(GET|PUT|POST|DELETE)\s*/, "");
    if (w === weg) return true;
    if (w.endsWith("/*")) return weg.startsWith(w.slice(0, -1)) || weg === w.slice(0, -2);
    if (w.startsWith(weg + "/<") || w.startsWith(weg + "?")) return true;   // /kalender/feed/<geheim>.ics
    return false;
  }));
}

describe("Routen-Inventar: jeder Weg hat Matrixzeile und Sonde", () => {
  let wege, matrix, sonden;
  beforeAll(async () => {
    wege = await wegeAusQuelltext();
    matrix = await readFile(path.join(WURZEL, "RECHTEMATRIX.md"), "utf8");
    const pdir = path.join(WURZEL, "pruefungen");
    sonden = {};
    for (const f of (await readdir(pdir)).filter((d) => /\.m?js$/.test(d) && d !== "routen-inventar.test.js"))
      sonden[f] = ohneKommentare(await readFile(path.join(pdir, f), "utf8"));   // ein Kommentar ist keine Sonde
  });

  it("der Quelltext liefert eine plausible Zahl an Wegen", () => {
    expect(wege.size).toBeGreaterThanOrEqual(40);
  });

  it("jeder Weg im Code steht im Inventar (neuer Weg → Eintrag, Matrixzeile, Sonde)", () => {
    const fehlt = [...wege].filter((w) => !(w in INVENTAR));
    expect(fehlt, "Wege ohne Inventareintrag").toEqual([]);
  });

  it("jeder Inventareintrag gibt es im Code noch", () => {
    const veraltet = Object.keys(INVENTAR).filter((w) => !wege.has(w));
    expect(veraltet, "Inventar enthält Wege, die es nicht mehr gibt").toEqual([]);
  });

  it("jeder Weg hat eine Zeile in RECHTEMATRIX.md oder eine begründete Lücke", () => {
    const ohne = Object.keys(INVENTAR).filter((w) => !matrixHat(matrix, w) && !LUECKEN[w]);
    expect(ohne, "Wege ohne Matrixzeile").toEqual([]);
    const ueberholt = Object.keys(LUECKEN).filter((w) => matrixHat(matrix, w));
    expect(ueberholt, "Lücke geschlossen — aus LUECKEN streichen").toEqual([]);
    expect(Object.keys(LUECKEN).length).toBe(LUECKEN_ANZAHL);
  });

  it("jede genannte Sonde existiert und ruft den Weg auf", () => {
    const fehler = [];
    for (const [weg, dateien] of Object.entries(INVENTAR)) {
      expect(dateien.length, weg).toBeGreaterThan(0);
      const re = new RegExp(weg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])");
      for (const d of dateien) if (!sonden[d] || !re.test(sonden[d])) fehler.push(`${weg} → ${d}`);
    }
    expect(fehler, "Sonde fehlt oder ruft den Weg nicht auf").toEqual([]);
  });
});

/* Review S4: Die Erkennung selbst — jede Vergleichsform zählt, Kommentare nie. */
describe("Routen-Inventar: die Erkennung ist nicht umgehbar", () => {
  const funktion = (rumpf) => `${rumpf}\nexport const config = { path: ["/probe/*"] };\n`;
  it("alle Vergleichsformen und Anführungen werden erkannt", () => {
    const w = wegeAusFunktion(funktion(`
      if (pfad === "a") {}
      if (pfad == 'b') {}
      if ("c" === pfad) {}
      if ('d' !== pfad) {}
      if (\`e\` === pfad) {}
      switch (pfad) { case "f": break; case 'g': { break; } default: }
      if (["h", 'i'].includes(pfad)) {}
      const OFFENE_PFADE = ["j"];
      if (pfad.startsWith('k/')) {}
    `));
    for (const t of "abcdefghijk") expect(w.has(`/probe/${t}`), t).toBe(true);
  });
  it("Wege nur im Kommentar sind keine Wege, Zeichenketten mit /* oder // bleiben", () => {
    const w = wegeAusFunktion(funktion(`
      // if (pfad === "kommentar1") {}
      /* if (pfad === "kommentar2") {} */
      const muster = /^\\/probe\\/?/;   // regulärer Ausdruck mit Schrägstrichen
      const s = "x/*y"; if (pfad === "echt") {}
      const u = "http://beispiel/"; if ('zwei' === pfad) {} /* */
    `));
    expect(w.has("/probe/kommentar1")).toBe(false);
    expect(w.has("/probe/kommentar2")).toBe(false);
    expect(w.has("/probe/echt")).toBe(true);
    expect(w.has("/probe/zwei")).toBe(true);
  });
  it("ohneKommentare: ein Weg in einem Kommentar einer Sonde zählt nicht", () => {
    expect(ohneKommentare(`// fetch("/api/geheim")\n/* "/api/auch" */ fetch("/api/echt")`)).not.toMatch(/geheim|auch/);
    expect(ohneKommentare(`const a = "/api/*"; fetch("/api/echt") // x`)).toMatch(/"\/api\/\*"; fetch\("\/api\/echt"\)/);
  });
  it("server.mjs: /gesund wird erkannt", async () => {
    expect((await wegeAusQuelltext()).has("/gesund")).toBe(true);
  });
});

/* Laufzeit: Unbekannte Unterwege jeder Präfix-Funktion antworten mit gültiger
   Sitzung 404 (ohne Sitzung 401 oder 404), für GET und POST. */
describe("Routen-Inventar zur Laufzeit: unbekannte Wege → 404", () => {
  const WIRT = "127.0.0.1:3000";
  let wurzel, token;
  const frage = async (handler, pfad, methode, t) => {
    const kopf = { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json", "x-forwarded-for": "10.9.9.8" };
    if (t) kopf.authorization = `Bearer ${t}`;
    const a = await handler(new Request(`http://${WIRT}${pfad}`,
      { method: methode, headers: kopf, ...(methode === "GET" ? {} : { body: "{}" }) }), {});
    return a.status;
  };
  beforeAll(async () => {
    wurzel = await mkdtemp(path.join(tmpdir(), "centric-routen-inventar-"));
    process.env.CENTRIC_DATEN = wurzel;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    const { getStore } = await import("../server/lib/ablage.mjs");
    const laden = () => getStore({ name: "centric", consistency: "strong" });
    const daten = (await import("../server/funktionen/daten.mjs")).default;
    const { kontoSchreiben } = await import("../server/lib/konten.mjs");
    const { ablageSchluessel } = await import("../server/lib/codes.mjs");
    const B = await import("../server/lib/bestand.mjs");
    await B.bestandSchreiben(laden(), "ri", { version: 9, mandanten: [{ id: "m-a", name: "A", einheiten: [{ id: "e1" }],
      personen: [{ id: "l1", vorname: "V", nachname: "N", rolle: "leitung", bereich: "ALLE",
        zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] }], nachrichten: [], notrufe: [], anfragen: [] }] }, { durch: "Pruefung" });
    await kontoSchreiben(laden(), ablageSchluessel("RIRI-LLLL-0001"), { name: "leitung l1", bestand: "ri", rolle: "leitung",
      person: "l1", betrieb: 0, mandantId: "m-a", angelegt: "2026-01-01T00:00:00.000Z" });
    const a = await daten(new Request(`http://${WIRT}/api/anmelden`, { method: "POST",
      headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json", "x-forwarded-for": "10.9.9.8" },
      body: JSON.stringify({ zugangscode: "RIRI-LLLL-0001" }) }), {});
    token = (await a.json()).token;
    expect(token).toBeTruthy();
  }, 120000);
  afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });

  it("jede Präfix-Funktion: GET/POST auf einen unbekannten Unterweg → 404 (ohne Sitzung 401/404)", async () => {
    const abweichend = [];
    for (const datei of (await readdir(FUNKTIONEN)).filter((d) => d.endsWith(".mjs")).sort()) {
      const modul = await import(pathToFileURL(path.join(FUNKTIONEN, datei)).href);
      const praefixe = [].concat(modul.config.path).filter((p) => p.endsWith("/*")).map((p) => p.slice(0, -1));
      for (const p of praefixe)
        for (const methode of ["GET", "POST"])
          for (const t of [null, token]) {
            const status = await frage(modul.default, `${p}gibt-es-nicht-zz9`, methode, t);
            /* Ohne Sitzung darf die Anmeldung zuerst greifen (401 verrät nicht, welche
               Wege es gibt); mit gültiger Sitzung muss es 404 sein. */
            if (t ? status !== 404 : ![401, 404].includes(status)) abweichend.push(`${methode} ${p}gibt-es-nicht-zz9 ${t ? "mit" : "ohne"} Sitzung → ${status}`);
          }
    }
    expect(abweichend).toEqual([]);
  }, 120000);
});
