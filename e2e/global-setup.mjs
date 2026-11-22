/* WP-33 Teil 3: Server und synthetische Testdaten für die Playwright-Suite.

   Wie die vorhandenen Browserproben (pruefungen/browser/wcag-wp40.mjs, geraete-wp21.mjs):
   - Bau der Oberfläche in ein Wegwerfverzeichnis (oder E2E_DIST = fertiger Bau),
   - server.mjs auf 127.0.0.1 mit frischem Datenordner, Zufalls-Verwalterschlüssel, NODE_ENV=development,
   - Betreiber über /einrichten, Demo-Bestand (erfundene Personen) über die Oberfläche, Zugänge je Rolle über /api/zugaenge.
   Keine echten Daten, keine Staging- oder Produktionsumgebung. Zugangscodes gehen nur über eine Umgebungsvariable an die
   Testprozesse und werden nie ausgegeben. Der Rückgabewert räumt Server und Wegwerfordner wieder ab. */
import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { istLoopback } from "../pruefungen/browser/abnahme-kern.mjs";
import { BASIS, PORT, ROLLEN, ZUSATZ_ZUGAENGE, OEFFNEN_ZUGAENGE, ZUGAENGE_VAR, BETREIBER_VAR, ZUGANG_POOL,
  RAEUME_VAR, RAEUME_HOECHSTENS } from "./umgebung.mjs";
import { ABNAHME_ZEITPUNKT, UHR_VERSATZ_VAR, uhrVersetzen, abnahmeHeute } from "./zeitbasis.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAUM = "e2e-wp33";
const kurz = (x) => String(x && x.message ? x.message : x).split("\n")[0].slice(0, 160);

export default async function globalSetup(config) {
  if (!istLoopback(BASIS)) throw new Error("Ziel ist nicht die eigene Maschine.");
  const weg = [];
  let srv = null;
  const aufraeumen = async () => {
    try { if (srv) srv.kill(); } catch { /* schon weg */ }
    for (const d of weg) await rm(d, { recursive: true, force: true }).catch(() => {});
  };
  try {
    /* Staging-Gate (docs/acc45/STAGING-O2-VORBEREITUNG.md): E2E_EXTERN_ADMIN = Verwalterschlüssel eines bereits laufenden
       Containers auf 127.0.0.1:E2E_PORT (das Bild des Release-Kandidaten, per Digest). Dann weder Bau noch eigener Server;
       alles Übrige (synthetischer Demo-Bestand, Zugänge) bleibt wie beim lokalen Lauf. Ohne die Variable unverändert. */
    const extern = process.env.E2E_EXTERN_ADMIN || "";
    let dist = process.env.E2E_DIST ? path.resolve(process.env.E2E_DIST) : null;
    if (!dist && !extern) {
      dist = await mkdtemp(path.join(tmpdir(), "centric-e2e-bau-")); weg.push(dist);
      execFileSync(process.execPath, [path.join(WURZEL, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", dist, "--emptyOutDir"],
        { cwd: WURZEL, stdio: "ignore" });
    }
    const daten = extern ? "" : await mkdtemp(path.join(tmpdir(), "centric-e2e-daten-")); if (daten) weg.push(daten);
    /* QS-ZEIT: gemeinsame Zeitbasis (e2e/zeitbasis.mjs). Der eigene Testserver, jeder Browser und der Testcode laufen ab
       dem festen Abnahmezeitpunkt; die Testprozesse erben den Versatz über die Umgebung. Fremder Container: echte Uhr. */
    const versatz = extern ? 0 : Date.parse(ABNAHME_ZEITPUNKT) - Date.now();
    process.env[UHR_VERSATZ_VAR] = String(versatz);
    const admin = extern || "e2e-admin-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    if (!extern) srv = spawn(process.execPath, ["--import", pathToFileURL(path.join(WURZEL, "e2e", "uhr-vorlauf.mjs")).href, "server.mjs"],
      { cwd: WURZEL, stdio: "ignore",
      env: { ...process.env, [UHR_VERSATZ_VAR]: String(versatz), PORT: String(PORT), CENTRIC_STATIK: dist, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: admin,
        CENTRIC_PFEFFER: "e2e-pfeffer-" + Math.random().toString(36).slice(2), CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1",
        NODE_ENV: "development", CENTRIC_DEMO: "true", CENTRIC_SELBSTSTART: "true" } });

    let xff = 0;
    /* k = Raum des Arbeiters (siehe unten); je Raum eigene Herkunft, damit die Bremse „einrichten“ (je Herkunft)
       jeden Raum einzeln zählt. */
    const j = async (p, body, token, k = 0) => {
      const a = await fetch(BASIS + p, { method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.${33 + k}.250.${++xff}`, ...(token ? { authorization: "Bearer " + token } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      return { s: a.status, d: await a.json().catch(() => ({})) };
    };
    let da = false;
    for (let i = 0; i < 100 && !da; i++) {
      try { da = (await fetch(BASIS + "/gesund")).ok; } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
    if (!da) throw new Error("lokaler Server startet nicht");

    /* WP-48-GB (Akzeptanz „Suite ohne workers: 1“): JE ARBEITER EIN EIGENER RAUM mit eigenem Demo-Bestand, eigenen
       Zugängen und eigenem Betreiber. Alle Rollen eines Raums schreiben in DENSELBEN Bestand (eine Datei je Raum, ein
       ETag); schließt ein Arbeiter eine Tour oder plant er, während ein zweiter im selben Raum eine Seite offen hat, ist
       das ein echter, zu Recht gemeldeter Konflikt („Gleichzeitig bearbeitet“). Getrennte Räume trennen die Arbeiter
       vollständig; innerhalb eines Arbeiters laufen die Tests nacheinander wie bisher. Raum 0 heißt wie früher. Die
       Codes gehen als ${ZUGAENGE_VAR}_<k> bzw. ${BETREIBER_VAR}_<k> an die Arbeiter; umgebung.mjs wählt je Arbeiter
       (TEST_PARALLEL_INDEX) den eigenen Raum. Der Betreiber je Raum hält auch die Bremse „zugaenge“ (je Betreiberraum)
       getrennt, die die schreibenden Abnahme-Specs beim Anlegen eigener Betriebe beanspruchen. */
    const raeume = Math.max(1, Math.min(RAEUME_HOECHSTENS, Number(config && config.workers) || 1));
    let personenZahl = 0;
    const raumEinrichten = async (nr) => {
      const raum = nr === 0 ? RAUM : `${RAUM}-w${nr}`;
      const j0 = (p, body, token) => j(p, body, token, nr);
      /* Betreiber, Demo-Bestand (erfundene Personen) und je Rolle ein Zugang */
      const e = await j0("/einrichten", { verwaltung: admin, name: "Betreiber", bestand: raum, rolle: "betreiber", person: null, betrieb: 0 });
      if (!e.d.zugangscode) throw new Error("Einrichtung abgelehnt (Status " + e.s + ")");
      const bt = (await j0("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
      if (!bt) throw new Error("Betreiberanmeldung gescheitert");
      const browser = await chromium.launch();
      try {
        const cx = await browser.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: "block",
          extraHTTPHeaders: { "x-forwarded-for": `10.${33 + nr}.251.1` } });
        await cx.addInitScript(uhrVersetzen, versatz);                 // Demo-Bestand entsteht im Browser: derselbe Tag
        const pg = await cx.newPage();
        await pg.goto(BASIS + "/", { waitUntil: "load", timeout: 60000 });
        await pg.locator("input").first().fill(e.d.zugangscode);
        await pg.getByRole("button", { name: /anmelden/i }).first().click();
        await pg.getByRole("button", { name: /Demo-Bestand anlegen/ }).click({ timeout: 30000 });
        await pg.waitForLoadState("networkidle").catch(() => {});
        await cx.close();
      } finally { await browser.close(); }

      let personen = [];
      for (let i = 0; i < 40 && !personen.length; i++) {
        personen = ((((await j0("/api/bestand", null, bt)).d.bestand || {}).mandanten || [])[0] || {}).personen || [];
        if (!personen.length) await new Promise((r) => setTimeout(r, 250));
      }
      const aktiv = (r) => personen.filter((x) => x.rolle === r && x.status !== "inaktiv" && (r !== "mitarbeiter" || x.imSchichtdienst !== false));
      const eintraege = [];
      for (const r of ROLLEN) {
        const p = aktiv(r)[0];
        if (!p) throw new Error(`Demo-Bestand ohne aktive Person der Rolle ${r}`);
        eintraege.push({ rolle: r, personId: p.id, name: "E2E " + r });
      }
      /* Abnahme B, heute-stempeluhr: zwei weitere Beschäftigte, die sonst kein Test anmeldet und nie stempelt (B7 stempelt
         die Person der Rolle „mitarbeiter“ ein UND aus; danach zeigt deren Stempeluhr keinen Knopf mehr). Der Test bringt
         sie selbst in den Stand „noch nicht eingestempelt“ bzw. „eingestempelt“. Später kann der Raum keine Zugänge mehr
         bekommen (Kundenraumschutz), darum hier. */
      const schluessel = eintraege.map((x) => x.rolle);
      for (const [k, p] of ZUSATZ_ZUGAENGE.map((k, i) => [k, aktiv("mitarbeiter")[i + 1]])) {
        if (!p) throw new Error(`Demo-Bestand ohne weitere aktive Beschäftigte für ${k}`);
        eintraege.push({ rolle: "mitarbeiter", personId: p.id, name: "E2E " + k });
        schluessel.push(k);
      }
      /* WP-48-GB: frische Personen ohne Tourzustand nur für e2e/oeffnen-parallel.spec.mjs (umgebung.mjs). */
      for (const [k, r, i] of OEFFNEN_ZUGAENGE) {
        const p = aktiv(r)[i];
        if (!p) throw new Error(`Demo-Bestand ohne weitere aktive Person der Rolle ${r} für ${k}`);
        eintraege.push({ rolle: r, personId: p.id, name: "E2E " + k });
        schluessel.push(k);
      }
      const zz = await j0("/api/zugaenge", { bestand: raum, eintraege }, bt);
      if (!Array.isArray(zz.d.zugaenge) || zz.d.zugaenge.length !== eintraege.length) throw new Error("Zugänge nicht angelegt (Status " + zz.s + ")");
      const codes = {};
      schluessel.forEach((k, i) => { codes[k] = zz.d.zugaenge[i].code; });
      /* Befund CI #423: weitere Codes je Rolle für dieselbe Person (umgebung.mjs ZUGANG_POOL; Lastbremse „anmelden-code“).
         Eigener Aufruf: höchstens 20 Einträge je Aufruf. */
      const pool = [];
      for (const r of ROLLEN) for (let n = 2; n <= ZUGANG_POOL; n++)
        pool.push({ k: `${r}~${n}`, e: { rolle: r, personId: eintraege.find((x) => x.rolle === r && x.name === "E2E " + r).personId, name: `E2E ${r} ${n}` } });
      if (pool.length) {
        const zp = await j0("/api/zugaenge", { bestand: raum, eintraege: pool.map((x) => x.e) }, bt);
        if (!Array.isArray(zp.d.zugaenge) || zp.d.zugaenge.length !== pool.length) throw new Error("Zugangs-Pool nicht angelegt (Status " + zp.s + ")");
        pool.forEach((x, i) => { codes[x.k] = zp.d.zugaenge[i].code; });
      }
      personenZahl = personen.length;
      return { codes, betreiber: e.d.zugangscode };
    };
    for (let k = 0; k < raeume; k++) {
      const r = await raumEinrichten(k);
      process.env[`${ZUGAENGE_VAR}_${k}`] = JSON.stringify(r.codes);
      process.env[`${BETREIBER_VAR}_${k}`] = r.betreiber;
      if (k === 0) { process.env[ZUGAENGE_VAR] = JSON.stringify(r.codes); process.env[BETREIBER_VAR] = r.betreiber; }
    }
    process.env[RAEUME_VAR] = String(raeume);
    console.log(`E2E: Server ${BASIS}, Abnahmetag ${abnahmeHeute()}${extern ? " (echte Uhr, fremder Container)" : ""}, ${raeume} Raum/Räume (je Arbeiter einer) mit Demo-Bestand aus je ${personenZahl} erfundenen Personen, Zugänge für ${ROLLEN.join(", ")}`);
  } catch (x) {
    await aufraeumen();
    throw new Error("E2E-Einrichtung gescheitert: " + kurz(x));
  }
  return aufraeumen;
}
