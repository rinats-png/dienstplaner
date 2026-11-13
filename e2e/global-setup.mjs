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
import { fileURLToPath } from "node:url";
import { istLoopback } from "../pruefungen/browser/abnahme-kern.mjs";
import { BASIS, PORT, ROLLEN, ZUSATZ_ZUGAENGE, ZUGAENGE_VAR, BETREIBER_VAR } from "./umgebung.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAUM = "e2e-wp33";
const kurz = (x) => String(x && x.message ? x.message : x).split("\n")[0].slice(0, 160);

export default async function globalSetup() {
  if (!istLoopback(BASIS)) throw new Error("Ziel ist nicht die eigene Maschine.");
  const weg = [];
  let srv = null;
  const aufraeumen = async () => {
    try { if (srv) srv.kill(); } catch { /* schon weg */ }
    for (const d of weg) await rm(d, { recursive: true, force: true }).catch(() => {});
  };
  try {
    let dist = process.env.E2E_DIST ? path.resolve(process.env.E2E_DIST) : null;
    if (!dist) {
      dist = await mkdtemp(path.join(tmpdir(), "centric-e2e-bau-")); weg.push(dist);
      execFileSync(process.execPath, [path.join(WURZEL, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", dist, "--emptyOutDir"],
        { cwd: WURZEL, stdio: "ignore" });
    }
    const daten = await mkdtemp(path.join(tmpdir(), "centric-e2e-daten-")); weg.push(daten);
    const admin = "e2e-admin-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    srv = spawn(process.execPath, ["server.mjs"], { cwd: WURZEL, stdio: "ignore",
      env: { ...process.env, PORT: String(PORT), CENTRIC_STATIK: dist, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: admin,
        CENTRIC_PFEFFER: "e2e-pfeffer-" + Math.random().toString(36).slice(2), CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1",
        NODE_ENV: "development", CENTRIC_DEMO: "true", CENTRIC_SELBSTSTART: "true" } });

    let xff = 0;
    const j = async (p, body, token) => {
      const a = await fetch(BASIS + p, { method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.33.250.${++xff}`, ...(token ? { authorization: "Bearer " + token } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      return { s: a.status, d: await a.json().catch(() => ({})) };
    };
    let da = false;
    for (let i = 0; i < 100 && !da; i++) {
      try { da = (await fetch(BASIS + "/gesund")).ok; } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
    if (!da) throw new Error("lokaler Server startet nicht");

    /* Betreiber, Demo-Bestand (erfundene Personen) und je Rolle ein Zugang */
    const e = await j("/einrichten", { verwaltung: admin, name: "Betreiber", bestand: RAUM, rolle: "betreiber", person: null, betrieb: 0 });
    if (!e.d.zugangscode) throw new Error("Einrichtung abgelehnt (Status " + e.s + ")");
    const bt = (await j("/api/anmelden", { zugangscode: e.d.zugangscode })).d.token;
    if (!bt) throw new Error("Betreiberanmeldung gescheitert");
    const browser = await chromium.launch();
    try {
      const cx = await browser.newContext({ viewport: { width: 1280, height: 850 }, serviceWorkers: "block",
        extraHTTPHeaders: { "x-forwarded-for": "10.33.251.1" } });
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
      personen = ((((await j("/api/bestand", null, bt)).d.bestand || {}).mandanten || [])[0] || {}).personen || [];
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
    const zz = await j("/api/zugaenge", { bestand: RAUM, eintraege }, bt);
    if (!Array.isArray(zz.d.zugaenge) || zz.d.zugaenge.length !== eintraege.length) throw new Error("Zugänge nicht angelegt (Status " + zz.s + ")");
    const codes = {};
    schluessel.forEach((k, i) => { codes[k] = zz.d.zugaenge[i].code; });
    process.env[ZUGAENGE_VAR] = JSON.stringify(codes);
    process.env[BETREIBER_VAR] = e.d.zugangscode;
    console.log(`E2E: Server ${BASIS}, Demo-Bestand mit ${personen.length} erfundenen Personen, Zugänge für ${ROLLEN.join(", ")}`);
  } catch (x) {
    await aufraeumen();
    throw new Error("E2E-Einrichtung gescheitert: " + kurz(x));
  }
  return aufraeumen;
}
