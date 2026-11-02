/* ==========================================================================
   STAGING-PROBEN — die drei festen Gate-Proben gegen einen frischen Server

   Die Proben in werkzeug/ (staging-smoke, staging-geo, staging-aufraeumen)
   sprechen fest http://127.0.0.1:3000 an. Dieser Lauf startet dafür einen
   frischen Server auf genau diesem Port mit leerer Wegwerf-Ablage und prüft:

     1. Smoke und Geo bestehen (Exit 0)
     2. ein zweiter Smoke-Lauf ohne Aufräumen bricht wegen Altlasten ab
        (Exit 3) und legt nichts an
     3. die Aufräumprobe besteht, danach ist von ppg-gate-a/-b/-geo nichts
        mehr in der Ablage — und zwei fremde Kontrollräume („fremd-kontrolle“
        und das namensähnliche „ppg-gate-ab“) sind byte-gleich
     4. ein zweites Aufräumen ist folgenlos (Exit 0)
     5. liegt unter einem Gate-Namen etwas, das nicht wie Gate-Daten aussieht,
        verweigert die Aufräumprobe (Exit 3) und löscht nichts

   Aufruf: node pruefungen/staging-proben.mjs   (Port 3000 muss frei sein)
   ========================================================================== */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASIS = "http://127.0.0.1:3000";
const ADMIN = "staging-proben-geheim";
const GATE = ["ppg-gate-a", "ppg-gate-b", "ppg-gate-geo"];
const FREMD = ["fremd-kontrolle", "ppg-gate-ab"];

const ergebnisse = [];
const pruef = (name, ok, detail = "") => {
  ergebnisse.push({ name, ok: !!ok });
  console.log(`${ok ? "  BESTANDEN     " : "  FEHLGESCHLAGEN"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

if (await fetch(`${BASIS}/gesund`).then(() => true).catch(() => false)) {
  console.error("Port 3000 ist belegt — die Proben brauchen genau diesen Port.");
  process.exit(2);
}

const daten = await mkdtemp(path.join(tmpdir(), "centric-staging-proben-daten-"));
const statik = await mkdtemp(path.join(tmpdir(), "centric-staging-proben-statik-"));
await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Proben</title>");
const env = { ...process.env, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN };
for (const v of ["CENTRIC_PROBE_BASIS", "STAGING_PROBE_BASIS", "PROBE_BASIS", "PROBE_URL", "NODE_USE_ENV_PROXY"]) delete env[v];
/* Wie im Container: CENTRIC_BASIS gesetzt (Link-Adresse des Servers) — die Proben lesen sie nicht. */
env.CENTRIC_BASIS = "https://staging.example.invalid";

let serverLog = "";
const server = spawn(process.execPath, ["server.mjs"], { cwd: WURZEL,
  env: { ...env, PORT: "3000", CENTRIC_STATIK: statik, CENTRIC_PFEFFER: "staging-proben-pfeffer", NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

/** Eine Probe laufen lassen; Ausgabe durchreichen, Status zurück. */
function probe(datei, argumente = [], mehrEnv = {}) {
  return new Promise((erfuellt) => {
    let aus = "";
    const k = spawn(process.execPath, [path.join("werkzeug", datei), ...argumente],
      { cwd: WURZEL, env: { ...env, ...mehrEnv }, stdio: ["ignore", "pipe", "pipe"] });
    k.stdout.on("data", (d) => { aus += d; process.stdout.write(d); });
    k.stderr.on("data", (d) => { aus += d; process.stderr.write(d); });
    k.on("exit", (code) => erfuellt({ code, aus }));
  });
}

/** Alle Einträge der Ablage: Store, Schlüssel, Inhalt. */
async function ablage() {
  const alle = [];
  for (const store of await readdir(daten, { withFileTypes: true })) {
    if (!store.isDirectory()) continue;
    for (const f of await readdir(path.join(daten, store.name)).catch(() => [])) {
      if (!f.endsWith(".json")) continue;
      const roh = await readFile(path.join(daten, store.name, f), "utf8").catch(() => "");
      alle.push({ store: store.name, schluessel: decodeURIComponent(f.slice(0, -5)), roh });
    }
  }
  return alle;
}
const gehoertZu = (e, raum) => {
  const teile = e.schluessel.split(":");
  if (teile.slice(1).includes(raum)) return true;
  try { const j = JSON.parse(e.roh); const w = j && (j.wert ?? j.daten ?? j); return !!w && typeof w === "object" && w.bestand === raum; }
  catch { return false; }
};
const gehoertZuRoh = (e, raum) => gehoertZu(e, raum) || e.roh.includes(`"bestand":"${raum}"`) || e.roh.includes(`"bestand": "${raum}"`);
async function abdruck(raeume) {
  const h = {};
  for (const e of await ablage()) if (raeume.some((r) => gehoertZuRoh(e, r)))
    h[`${e.store}/${e.schluessel}`] = createHash("sha256").update(e.roh).digest("hex");
  return h;
}
/* Protokoll und Bremsvermerke dürfen Raumnamen tragen (Text), alles andere nicht. */
const NUR_VERMERK = (e) => /^(v|sperre|stufe|spur|protokoll|lauf|vermerk|zaehler|fenster):/.test(e.schluessel)
  || /protokoll|spur|takt/.test(e.store);

async function einrichten(raum, name, mandant) {
  const e = await fetch(`${BASIS}/einrichten`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ verwaltung: ADMIN, name, bestand: raum, rolle: "betreiber", person: null, betrieb: 0 }) }).then((a) => a.json());
  const t = await fetch(`${BASIS}/api/anmelden`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ zugangscode: e.zugangscode }) }).then((a) => a.json());
  const a = await fetch(`${BASIS}/api/bestand-anlegen`, { method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${t.token}` },
    body: JSON.stringify({ inhalt: { version: 9, stand: 1, session: null, mandanten: [{ ...mandant,
      einheiten: [{ id: "e1", name: "WB" }], personen: [], abweichungen: {}, anfragen: [], nachrichten: [] }] } }) });
  return a.status;
}

let status = 1;
try {
  let bereit = false;
  for (let i = 0; i < 100 && !bereit; i++) {
    bereit = await fetch(`${BASIS}/gesund`).then((a) => a.ok).catch(() => false);
    if (!bereit) await new Promise((w) => setTimeout(w, 100));
  }
  if (!bereit) throw new Error(`Server kam nicht hoch:\n${serverLog}`);

  pruef("Kontrollraum fremd-kontrolle angelegt", await einrichten("fremd-kontrolle", "Kontrolle", { id: "fremd-m", name: "Fremder Betrieb" }) === 200);
  pruef("namensähnlicher Kontrollraum ppg-gate-ab angelegt (nicht in der Gate-Liste)",
    await einrichten("ppg-gate-ab", "PPG-GATE ähnlich", { id: "ppg-gate-ab-m", name: "PPG-GATE ähnlich" }) === 200);
  const vorher = await abdruck(FREMD);
  pruef("Kontrollräume im Abdruck erfasst", Object.keys(vorher).length >= 4, `${Object.keys(vorher).length} Einträge`);

  console.log("\n— Ziel unterschieben (Argument, Umgebung) —");
  const zielArg = [];
  for (const datei of ["staging-smoke.mjs", "staging-geo.mjs", "staging-aufraeumen.mjs"])
    zielArg.push((await probe(datei, ["http://192.0.2.1:3000"])).code);
  const zielEnv = [];
  for (const datei of ["staging-smoke.mjs", "staging-geo.mjs"])
    zielEnv.push((await probe(datei, [], { CENTRIC_PROBE_BASIS: "http://192.0.2.1:3000" })).code);
  const nachVersuch = (await ablage()).filter((e) => !NUR_VERMERK(e) && GATE.some((r) => gehoertZuRoh(e, r))).length;
  pruef("Argument oder Ziel-Variable: Abbruch (Exit 2), nichts angelegt",
    [...zielArg, ...zielEnv].every((c) => c === 2) && nachVersuch === 0, `${zielArg.join(",")} / ${zielEnv.join(",")} · ${nachVersuch}`);

  console.log("\n— staging-smoke.mjs —");
  const s = await probe("staging-smoke.mjs");
  pruef("Smoke: Exit 0", s.code === 0, `Exit ${s.code}`);
  pruef("Smoke: Zusammenfassung „STAGING-SMOKE: n/n bestanden“", /STAGING-SMOKE: (\d+)\/\1 bestanden/.test(s.aus));

  console.log("\n— staging-geo.mjs —");
  const g = await probe("staging-geo.mjs");
  pruef("Geo: Exit 0", g.code === 0, `Exit ${g.code}`);
  pruef("Geo: Zusammenfassung „STAGING-GEO: n/n bestanden“", /STAGING-GEO: (\d+)\/\1 bestanden/.test(g.aus));

  const gateVorher = (await ablage()).filter((e) => !NUR_VERMERK(e) && gehoertZuRoh(e, "ppg-gate-a")).length;
  console.log("\n— staging-smoke.mjs erneut, ohne Aufräumen —");
  const s2 = await probe("staging-smoke.mjs");
  const gateNachher = (await ablage()).filter((e) => !NUR_VERMERK(e) && gehoertZuRoh(e, "ppg-gate-a")).length;
  pruef("zweiter Smoke-Lauf mit Altlasten: Exit 3, nichts angelegt", s2.code === 3 && gateVorher === gateNachher,
    `Exit ${s2.code}, ${gateVorher} → ${gateNachher}`);

  console.log("\n— staging-aufraeumen.mjs —");
  const c = await probe("staging-aufraeumen.mjs");
  pruef("Aufräumen: Exit 0", c.code === 0, `Exit ${c.code}`);
  pruef("Aufräumen: Zusammenfassung „STAGING-AUFRAEUMEN: n/n bestanden“", /STAGING-AUFRAEUMEN: (\d+)\/\1 bestanden/.test(c.aus));
  const rest = (await ablage()).filter((e) => !NUR_VERMERK(e) && GATE.some((r) => gehoertZuRoh(e, r)));
  pruef("Nachweis in der Ablage: keine Einträge von ppg-gate-a/-b/-geo mehr (Räume, Zugänge, Feeds, Sitzungen)",
    rest.length === 0, rest.map((e) => `${e.store}/${e.schluessel}`).slice(0, 10).join(", "));
  const nachher = await abdruck(FREMD);
  pruef("Kontrollräume byte-gleich (auch das namensähnliche ppg-gate-ab)", JSON.stringify(vorher) === JSON.stringify(nachher));

  console.log("\n— staging-aufraeumen.mjs erneut —");
  const c2 = await probe("staging-aufraeumen.mjs");
  pruef("zweites Aufräumen: Exit 0, nichts zu tun", c2.code === 0, `Exit ${c2.code}`);

  pruef("fremder Inhalt unter dem Gate-Namen ppg-gate-b angelegt",
    await einrichten("ppg-gate-b", "Echter Kunde", { id: "echt-m", name: "Echter Betrieb" }) === 200);
  const fremdVorher = await abdruck(["ppg-gate-b"]);
  console.log("\n— staging-aufraeumen.mjs mit fremdem Inhalt unter ppg-gate-b —");
  const c3 = await probe("staging-aufraeumen.mjs");
  const fremdNachher = await abdruck(["ppg-gate-b"]);
  pruef("Aufräumen verweigert (Exit 3) und löscht nichts", c3.code === 3
    && Object.keys(fremdVorher).length > 0 && JSON.stringify(fremdVorher) === JSON.stringify(fremdNachher), `Exit ${c3.code}`);

  const bestanden = ergebnisse.filter((x) => x.ok).length;
  console.log(`\nSTAGING-PROBEN (Lauf gegen frischen Server): ${bestanden}/${ergebnisse.length} bestanden`);
  status = bestanden === ergebnisse.length ? 0 : 1;
  if (status !== 0) console.error(`Serverprotokoll:\n${serverLog.slice(-8000)}`);
} catch (e) {
  console.error(e && e.stack || e);
  console.error(`Serverprotokoll:\n${serverLog.slice(-8000)}`);
} finally {
  await new Promise((erfuellt) => {
    if (server.exitCode !== null) return erfuellt();
    const notfall = setTimeout(() => server.kill("SIGKILL"), 3000);
    server.once("exit", () => { clearTimeout(notfall); erfuellt(); });
    server.kill("SIGTERM");
  });
  await rm(daten, { recursive: true, force: true });
  await rm(statik, { recursive: true, force: true });
}
process.exit(status);
