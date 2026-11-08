/* ==========================================================================
   STAGING-ABNAHME 3.1-3.4 (WP-S1) — rein lesende Vorprüfung

   Aufruf:
     node werkzeug/staging-abnahme-3.mjs                      nur Abdeckung (offline)
     node werkzeug/staging-abnahme-3.mjs --ziel http://127.0.0.1:3000
                                                              zusätzlich lesende Proben
   Das Ziel ist ein Staging-Zugang über den SSH-Tunnel (nur Loopback erlaubt).

   Was die Probe tut
     A  Abdeckung: Für jeden Prüfpunkt der Testpläne 3.1-3.4 (docs/acc45/
        EXTERNE-ABNAHMEN-UEBERGABE.md, E-1) steht fest, welche Proben und
        Prüfdateien ihn automatisch abdecken. Fehlt eine Datei oder ein
        Abschnitt der Staging-Proben, ist das ein FAIL. Punkte, die nur ein
        Mensch im Browser prüfen kann, werden als MANUELL ausgewiesen.
     B  Lesende Proben (nur mit --ziel): ausschließlich GET, keine
        Anmeldung, keine Zugangscodes, keine Weiterleitungen, kein Schreiben.

   Nicht Teil dieser Probe: alles, was Anmeldung oder Schreiben braucht
   (das bleibt bei staging-smoke/-geo im Wegwerfraum) und alles im Browser.

   Ausgabe: PASS / FAIL / MANUELL je Punkt. Exit 0: kein FAIL · 1: mindestens
   ein FAIL · 2: falscher Aufruf.
   ========================================================================== */

import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SMOKE = "werkzeug/staging-smoke.mjs";
const GEO = "werkzeug/staging-geo.mjs";

/* Abdeckung je Prüfpunkt. `dateien`: Prüfdateien (müssen existieren).
   `abschnitte`: Titelteile in den Staging-Proben (müssen im Quelltext stehen).
   `auto`: Was automatisiert belegt ist. `manuell`: Was nur der Mensch am
   Staging prüfen kann (Betreiber/QA). */
const PUNKTE = [
  { id: "3.1", titel: "Rollen x Geräte: Bedienbarkeit, Querscrollen, Antwortzeit, Konsole, keine fremden Daten",
    dateien: ["pruefungen/oberflaeche-render.test.js", "pruefungen/kontrast.test.js", "pruefungen/rechtematrix.test.js", "pruefungen/sicht.test.js", "pruefungen/pwa.test.js"],
    abschnitte: [[SMOKE, "Rollen"], [SMOKE, "Mandantentrennung"]],
    auto: "keine fremden Daten je Rolle (API), Rollenrechte, Render, Kontrast, PWA-Quelle; live: Antwortzeit, Viewport, Manifest, Service Worker",
    manuell: "Bedienbarkeit je Rolle und Gerät (Desktop, Tablet, Telefon 390 px), Querscrollen, Konsolenfehler, Antwortzeit in der Oberfläche" },
  { id: "3.2", titel: "Zeiterfassung: Stempeln, Nachtdienst, 20-h-Grenze, Integrität (403), Korrektur, Monatsabschluss, ungeplante Dienste",
    dateien: ["pruefungen/stempeln.test.js", "pruefungen/stempel-integritaet.test.js", "pruefungen/korrekturworkflow.test.js", "pruefungen/monatsabschluss.test.js", "pruefungen/ungeplante-dienste.test.js", "pruefungen/zeiterfassung.test.js"],
    abschnitte: [[SMOKE, "Zeiterfassung Start/Ende"], [GEO, "Nachtdienst und Altbestand"]],
    auto: "Start/Ende, zweiter Start 409, Nachtdienst und Altbestand (Staging-Geo), Integrität 403, Korrektur, Monatsabschluss, ungeplante Dienste (Prüfdateien)",
    manuell: "Stempeluhr mit Standortabfrage im Browser, Korrekturantrag und Monatsabschluss in der Oberfläche, Ist/Konto/CSV mit ungeplanten Diensten ansehen" },
  { id: "3.3", titel: "Datenschutz: E1 je Rolle, Entwürfe, Art.-15-Auskunft, Löschlauf, Kalender-Feed-Widerruf, Betriebsrat unter Mindestgruppe",
    dateien: ["pruefungen/stempel-datenschutz.test.js", "pruefungen/entwuerfe.test.js", "pruefungen/dsgvo-server.test.js", "pruefungen/aufbewahrung.test.js", "pruefungen/kalender-feed-autoritaet.test.js", "pruefungen/br-auswertung.test.js"],
    abschnitte: [[SMOKE, "E1-Datenschutz"], [SMOKE, "D1g: Feed-Widerruf"], [GEO, "Datenschutz"]],
    auto: "E1 je Rolle per API, Feed-Widerruf bei Sperre/Reaktivierung, Datenschutz der Geo-Daten; live: ohne Sitzung keine Daten (401), unbekannter Feed 404",
    manuell: "Entwürfe aus Sicht einer Beschäftigten-Anmeldung, Art.-15-Auskunft vollständig (inkl. Stempel), Löschlauf mit Nachweis, Betriebsrat-Aggregation unter der Mindestgruppe (Testbetrieb nötig)" },
  { id: "3.4", titel: "Integration A+B: Rundreise neuer Felder je Rolle, Warnen statt Sperren (Bestätigung, Protokoll, Mitteilung)",
    dateien: ["pruefungen/kette-a-rundreise.test.js", "pruefungen/warnen.test.js", "pruefungen/beschaeftigung.test.js", "pruefungen/abnahme-a-b.test.js", "pruefungen/abnahme-409.test.js"],
    abschnitte: [[SMOKE, "Lesen und erlaubtes Speichern"], [SMOKE, "Wiederherstellung schützt Verborgenes"]],
    auto: "Rundreise und Warnen in der Bibliothek/Schnittstelle (Prüfdateien), Speichern und Wiederherstellen ohne Verlust verborgener Felder (Staging-Smoke)",
    manuell: "Rundreise je Feld (bestaetigungen, beschaeftigungsmodell, stundenGrenzeMonat, hinweise) und je Rolle in der Oberfläche; Verstoß -> Bestätigung -> Protokoll -> Mitteilung an die Leitung" },
];

/* ------------------------------ Ausgabe --------------------------------- */

const zeilen = [];
function melde(status, id, text, detail = "") {
  zeilen.push({ status, id });
  console.log(`  ${status.padEnd(7)} ${id}  ${text}${status === "FAIL" && detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
}

/* ------------------------------- Aufruf --------------------------------- */

function aufruf(argv) {
  const a = argv.slice(2);
  if (a.length === 0) return { ziel: null };
  if (a.length === 2 && a[0] === "--ziel") {
    let u;
    try { u = new URL(a[1]); } catch { return { fehler: "--ziel ist keine gültige Adresse." }; }
    if (u.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
      return { fehler: "--ziel erlaubt nur http auf Loopback (127.0.0.1, localhost, ::1), also den SSH-Tunnel." };
    if (u.username || u.password) return { fehler: "--ziel darf keine Zugangsdaten enthalten." };
    return { ziel: u.origin };
  }
  return { fehler: "Aufruf: [--ziel http://127.0.0.1:<Port>]" };
}
const arg = aufruf(process.argv);
if (arg.fehler) {
  console.error(`STAGING-ABNAHME-3: ABBRUCH — ${arg.fehler}`);
  setTimeout(() => process.exit(2), 50);
  await new Promise(() => {});
}

/* ----------------------------- A: Abdeckung ------------------------------ */

const existiert = (p) => access(path.join(WURZEL, p)).then(() => true, () => false);
const quelle = new Map();
async function text(p) {
  if (!quelle.has(p)) quelle.set(p, await readFile(path.join(WURZEL, p), "utf8").catch(() => ""));
  return quelle.get(p);
}

console.log("STAGING-ABNAHME-3 — A: Abdeckung der Prüfpunkte 3.1-3.4 (offline, lesend)");
for (const p of PUNKTE) {
  console.log(`\n${p.id}  ${p.titel}`);
  const fehlt = [];
  for (const d of p.dateien) if (!(await existiert(d))) fehlt.push(d);
  for (const [datei, teil] of p.abschnitte) if (!(await text(datei)).includes(teil)) fehlt.push(`${datei}: Abschnitt „${teil}“`);
  melde(fehlt.length === 0 ? "PASS" : "FAIL", p.id, `automatisch abgedeckt: ${p.auto}`, `fehlt: ${fehlt.join("; ")}`);
  melde("MANUELL", p.id, `nur am Staging prüfbar: ${p.manuell}`);
}

/* ------------------------- B: lesende Proben (live) ---------------------- */

async function get(pfad, kopf = {}) {
  const t0 = Date.now();
  const r = await fetch(new URL(pfad, arg.ziel), { method: "GET", redirect: "manual", headers: { connection: "close", ...kopf }, signal: AbortSignal.timeout(5000) });
  const body = await r.text();
  return { status: r.status, text: body, ms: Date.now() - t0, kopf: r.headers };
}

if (arg.ziel) {
  console.log("\nSTAGING-ABNAHME-3 — B: lesende Proben gegen das Ziel (nur GET, ohne Anmeldung)");
  const probe = async (id, name, fn) => {
    try { const [ok, detail] = await fn(); melde(ok ? "PASS" : "FAIL", id, name, detail); }
    catch (e) { melde("FAIL", id, name, `Ausnahme: ${e && e.message}`); }
  };
  await probe("3.1", "/gesund: 200, status ok, unter 1 s", async () => {
    const r = await get("/gesund"); let d = {}; try { d = JSON.parse(r.text); } catch { /* bleibt leer */ }
    return [r.status === 200 && d.status === "ok" && r.ms < 1000, `Status ${r.status}, ${r.ms} ms`];
  });
  await probe("3.1", "Startseite: 200, unter 1 s, Viewport für Telefon, Manifest verlinkt", async () => {
    const r = await get("/");
    return [r.status === 200 && r.ms < 1000 && /name="viewport"[^>]*width=device-width/.test(r.text)
      && /rel="manifest"/.test(r.text), `Status ${r.status}, ${r.ms} ms`];
  });
  await probe("3.1", "Manifest: 200, gültiges JSON mit Verknüpfungen", async () => {
    const r = await get("/manifest.webmanifest"); const m = JSON.parse(r.text);
    return [r.status === 200 && Array.isArray(m.shortcuts) && m.shortcuts.length > 0, `Status ${r.status}`];
  });
  await probe("3.1", "Service Worker: 200, no-cache", async () => {
    const r = await get("/sw.js");
    return [r.status === 200 && /no-cache|no-store/.test(r.kopf.get("cache-control") || ""), `Status ${r.status}, cache-control ${r.kopf.get("cache-control")}`];
  });
  await probe("3.3", "ohne Sitzung: /api/bestand 401, keine Daten im Text", async () => {
    const r = await get("/api/bestand");
    return [r.status === 401 && !/"mandanten"|"erfassung"/.test(r.text), `Status ${r.status}`];
  });
  await probe("3.3", "unbekannter Kalender-Verweis: 404 ohne Inhalt", async () => {
    const r = await get("/kalender/feed/ungueltig-abnahme-probe.ics");
    return [r.status === 404 && !r.text.includes("BEGIN:VCALENDAR"), `Status ${r.status}`];
  });
}

/* ------------------------------- Ergebnis -------------------------------- */

const z = (s) => zeilen.filter((x) => x.status === s).length;
console.log(`\nSTAGING-ABNAHME-3: ${z("PASS")} PASS · ${z("FAIL")} FAIL · ${z("MANUELL")} MANUELL (Betreiber/QA am Staging)`);
if (!arg.ziel) console.log("Lesende Live-Proben nicht gelaufen (kein --ziel). Staging-Lauf: OFFEN.");
console.log("Diese Probe ersetzt nicht die Abnahme E-1: PASS heißt nur „Vorprüfung ok“.");
process.exitCode = z("FAIL") === 0 ? 0 : 1;   // kein process.exit: offene Verbindungen schließen sich selbst (Windows/libuv)
