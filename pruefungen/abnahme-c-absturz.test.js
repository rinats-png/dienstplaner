/* ==========================================================================
   ABNAHME V4 STRANG C (Bereiche 12 und 13) — harter Abbruch, Wiederanlauf,
   Sicherung → Schaden → Wiederherstellung byteweise

   Echter Server (node server.mjs als Kindprozess) auf einer Wegwerf-Ablage,
   nur synthetische Daten. Bisher war „Abbruch mitten im Schreiben" nur im
   selben Prozess nachgestellt (atomar.test.js, lesefehler.test.js: eine
   Ablage, die vor der n-ten Teilschreibung wirft). Hier wird der echte
   Prozess hart beendet (SIGKILL; unter Windows TerminateProcess):

     1  Absturz mitten im Schreiben, mehrfach: Ein Schreiber ändert in jeder
        Runde Kern (Name „Stand n") und drei Monatsscherben (alle „F" oder
        alle „S" je nach n) zugleich. Nach jedem harten Abbruch startet ein
        neuer Server auf derselben Ablage: Er übernimmt die verwaiste
        Prozesssperre, /gesund ist ok, dieselbe Sitzung gilt weiter, der
        gelesene Stand ist in sich stimmig (kein Mischstand), keine bestätigte
        Schreibung (200) ging verloren, werkzeug/ablage-pruefen.mjs findet
        nichts, und der nächste Schreibvorgang gelingt.
     2  Abgebrochene Anfrage (Rumpf halb gesendet, Verbindung gekappt): nichts
        geschrieben, Server lebt, Stand unverändert.
     3  Sichere Wiederholung: Derselbe PUT noch einmal (Antwort „verloren")
        ändert nichts doppelt — 409 mit aktuellem Stand oder 200 ohne Wirkung.
     4  Sichern → Ablage beschädigen → Server antwortet 503 (nicht 500, nicht
        „leer"), die kaputte Datei bleibt liegen → beschädigte Sicherung wird
        abgelehnt und fasst das Ziel nicht an → Wiederherstellung in ein
        leeres Ziel und mit --ersetzen über die kaputte Ablage: jede gesicherte
        Datei byteweise gleich; flüchtige Sitzungen fehlen bewusst (alte
        Sitzung 401); der Server startet darauf und liefert den Stand.
     5  Sauberes Beenden (SIGTERM): laufende Anfrage wird zu Ende beantwortet,
        Exit 0, Sperre freigegeben. Nur wo SIGTERM als Signal ankommt (Linux,
        CI); unter Windows beendet kill() hart — dort übersprungen.

   Aufruf: npx vitest run pruefungen/abnahme-c-absturz.test.js --testTimeout=120000
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { connect } from "node:net";
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverStarten, freierPort } from "./hilfen/port.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PFEFFER = "pfeffer-nur-zum-pruefen-abnahme-c-absturz-0123";
const RAUM = "abnahme-c-absturz";
let B, sitzungAnlegen, Z, gehoertInSicherung, statik;
let daten, token;
const MONATE = [];
const aufraeumen = [];

const person = (id, rolle, einheit) => ({ id, vorname: `V${id}`, nachname: `N${id}`, rolle, bereich: einheit, status: "aktiv",
  email: "", funktion: "Fachkraft", eintritt: "2020-01-01", wochenstunden: 38.5, urlaubsanspruch: 30, qualifikationen: [],
  zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] });

const mitAblage = async (wurzel, f) => {
  const vorher = process.env.CENTRIC_DATEN;
  process.env.CENTRIC_DATEN = wurzel;
  try { return await f((await import("../server/lib/ablage.mjs")).getStore({ name: "centric", consistency: "strong" })); }
  finally { if (vorher === undefined) delete process.env.CENTRIC_DATEN; else process.env.CENTRIC_DATEN = vorher; }
};

const umgebung = (d) => ({ CENTRIC_STATIK: statik, CENTRIC_DATEN: d, CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: PFEFFER,
  NODE_ENV: "production", CENTRIC_AUFRAEUMEN: "aus", CENTRIC_ZUSTELL_TAKT: "aus", CENTRIC_UEBERWACHUNG: "aus",
  CENTRIC_ZUSTAND: `${d}-zustand`, CENTRIC_VERTRAUTE_PROXYS: undefined, CENTRIC_ADMIN: undefined,
  CENTRIC_TEILSPEICHERUNG: undefined, CENTRIC_IMPORT_AKTIV: undefined, CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT: undefined });
const starten = (d) => serverStarten({ cwd: WURZEL, env: umgebung(d), wartenMs: 30_000 });
const hartBeenden = async (s) => {
  if (s.kind.exitCode === null && s.kind.signalCode === null) {
    const ende = new Promise((r) => s.kind.once("exit", r));
    s.kind.kill("SIGKILL");
    await ende;
  }
};

const kopf = (s, extra = {}) => ({ origin: s.basis, authorization: `Bearer ${token}`, ...extra });
async function lesen(s) {
  const a = await fetch(`${s.basis}/api/bestand`, { headers: kopf(s) });
  const d = await a.json().catch(() => ({}));
  return { status: a.status, ...d };
}
async function schreiben(s, b, etag) {
  const a = await fetch(`${s.basis}/api/bestand`, { method: "PUT", headers: kopf(s, { "content-type": "application/json" }),
    body: JSON.stringify({ bestand: b, etag }) });
  const d = await a.json().catch(() => ({}));
  return { status: a.status, ...d };
}
const tagSchluessel = () => MONATE.map((m) => `a1|${m}10`);
/** Stand n: Kern „Stand n", alle drei Monate denselben Dienst. */
function stand(b, n) {
  const x = JSON.parse(JSON.stringify(b));
  const m = x.mandanten[0];
  m.name = `Stand ${n}`;
  for (const k of tagSchluessel()) m.abweichungen[k] = n % 2 ? "F" : "S";
  return x;
}
/** Stimmig = Name „Stand n" und alle drei Monate passend zu n. Liefert n oder wirft. */
function stimmig(b) {
  const m = b.mandanten[0];
  const t = /^Stand (\d+)$/.exec(m.name);
  if (!t) { expect(m.name).toBe("Haus C"); for (const k of tagSchluessel()) expect(m.abweichungen[k], k).toBeUndefined(); return 0; }
  const n = Number(t[1]);
  for (const k of tagSchluessel()) expect(m.abweichungen[k], `${k} zu „Stand ${n}"`).toBe(n % 2 ? "F" : "S");
  return n;
}

async function dateienMitHash(wurzel) {
  const aus = {};
  for (const store of await readdir(wurzel).catch(() => [])) {
    if (store.startsWith(".")) continue;
    const ort = path.join(wurzel, store);
    if (!(await stat(ort)).isDirectory()) continue;
    for (const datei of await readdir(ort)) {
      if (!datei.endsWith(".json")) continue;
      const rel = `${store}/${datei}`;
      aus[rel] = createHash("sha256").update(await readFile(path.join(ort, datei))).digest("hex");
    }
  }
  return aus;
}
const werkzeug = (skript, args, env = {}) => {
  const r = spawnSync(process.execPath, [path.join("werkzeug", skript), ...args], { cwd: WURZEL, encoding: "utf8",
    env: { ...process.env, CENTRIC_PFEFFER: PFEFFER, CENTRIC_ABLAGE: "dateien", ...env }, timeout: 120_000 });
  return { code: r.status, aus: `${r.stdout}\n${r.stderr}` };
};

beforeAll(async () => {
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  B = await import("../server/lib/bestand.mjs");
  Z = await import("../server/lib/zeiterfassung.mjs");
  ({ sitzungAnlegen } = await import("../server/lib/sitzungen.mjs"));
  ({ gehoertInSicherung } = await import("../werkzeug/ablage-sicherung.mjs"));
  for (const plus of [45, 80, 115]) MONATE.push(Z.tagePlus(Z.heuteBerlin(), plus).slice(0, 8));
  expect(new Set(MONATE).size).toBe(3);
  statik = await mkdtemp(path.join(tmpdir(), "centric-abnahme-c-absturz-statik-"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>C</title>");
  daten = await mkdtemp(path.join(tmpdir(), "centric-abnahme-c-absturz-"));
  aufraeumen.push(statik, daten, `${daten}-zustand`);
  await mitAblage(daten, async (store) => {
    const m1 = { id: "m1", name: "Haus C", status: "aktiv", einheiten: [{ id: "e1", name: "WB 1", versatz: 0 }], standorte: [],
      zyklus: { wochen: 1, tage: ["-", "-", "-", "-", "-", "-", "-"] },
      dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "S", name: "Spät", start: "14:00", ende: "22:00", pause: 30 }],
      qualifikationen: [], einstellungen: { ruhezeit: 11, maxFolge: 6 },
      personen: [person("l1", "leitung", "ALLE"), person("a1", "mitarbeiter", "e1")],
      abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] };
    await B.bestandSchreiben(store, RAUM, { version: 9, mandanten: [m1] }, { durch: "Abnahme C" });
    process.env.CENTRIC_DATEN = daten;
    token = (await sitzungAnlegen({ bestand: RAUM, name: "Leitung", rolle: "leitung", person: "l1", betrieb: 0, mandantId: "m1", einheit: null }, 6 * 3600_000)).token;
  });
}, 60_000);
afterAll(async () => { for (const d of aufraeumen) await rm(d, { recursive: true, force: true }).catch(() => {}); });

describe("1–3 — harter Abbruch mitten im Schreiben, Wiederanlauf, Abbruch der Anfrage, Wiederholung", { timeout: 600_000 }, () => {
  let bestaetigt = 0;

  for (let runde = 1; runde <= 4; runde++) {
    it(`Runde ${runde}: SIGKILL während laufender Schreibvorgänge → Neustart übernimmt, Stand stimmig, nichts Bestätigtes verloren`, async () => {
      const s = await starten(daten);
      if (runde > 1) expect(s.log(), "verwaiste Sperre des getöteten Prozesses übernommen").toMatch(/veraltete Sperre eines beendeten Prozesses übernommen/);
      expect(await (await fetch(`${s.basis}/gesund`)).json()).toEqual({ status: "ok" });
      let g = await lesen(s);
      expect(g.status, "dieselbe Sitzung gilt nach dem Neustart").toBe(200);
      const n0 = stimmig(g.bestand);
      expect(n0, "keine bestätigte Schreibung verloren").toBeGreaterThanOrEqual(bestaetigt);

      /* Schreiber: so schnell wie möglich, bis der Prozess weg ist. */
      let laeuft = true, n = n0, geschrieben = 0;
      const abgewiesen = [];
      const schreiber = (async () => {
        while (laeuft) {
          try {
            const neu = stand(g.bestand, n + 1);
            const a = await schreiben(s, neu, g.etag);
            if (a.status === 200) { n += 1; bestaetigt = n; geschrieben += 1; g = { bestand: neu, etag: a.etag }; if (!a.etag) g = await lesen(s); }
            else { abgewiesen.push(`${a.status} ${a.fehler || ""}`); g = await lesen(s); }
          } catch (e) { abgewiesen.push(`Ausnahme ${e && e.message}`); break; }
        }
      })();
      /* Erst wenn einige Schreibvorgänge bestätigt sind, dann nach einer je Runde anderen Zeit mitten hinein. */
      const t0 = Date.now();
      while (geschrieben < 3 && Date.now() - t0 < 30_000 && abgewiesen.length < 50) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setTimeout(r, 37 * runde));
      const vorAbbruch = Date.now() - t0;
      await hartBeenden(s);
      laeuft = false;
      await schreiber;
      expect(geschrieben, `es wurde tatsächlich unter Last geschrieben; abgewiesen: ${[...new Set(abgewiesen)].join(" | ")} (${vorAbbruch} ms)`).toBeGreaterThan(0);
      /* Abgewiesen werden darf nur durch den Abbruch selbst (fetch failed), nie durch den Server. */
      expect(abgewiesen.filter((x) => !/^Ausnahme/.test(x)), "keine Absage des Servers").toEqual([]);

      /* Werkzeug: keine unlesbare oder fehlende Datei. Es belegt die Ablage wie der Server (übernimmt also selbst
         die verwaiste Sperre und gibt sie danach frei); der Server danach startet deshalb ohne Übernahme. */
      expect((await readdir(daten)).includes(".prozess"), "nach SIGKILL bleibt die Sperre liegen").toBe(true);
      const p = werkzeug("ablage-pruefen.mjs", ["--daten", daten, RAUM]);
      expect(p.code, p.aus).toBe(0);

      const s2 = await starten(daten);
      try {
        const nach = await lesen(s2);
        expect(nach.status).toBe(200);
        const k = stimmig(nach.bestand);
        expect(k, `bestätigt ${bestaetigt}, gelesen ${k}`).toBeGreaterThanOrEqual(bestaetigt);
        expect(k - bestaetigt, "höchstens die eine unbestätigte Schreibung zusätzlich").toBeLessThanOrEqual(1);
        bestaetigt = k;
        const weiter = await schreiben(s2, stand(nach.bestand, k + 1), nach.etag);
        expect(weiter.status, "der nächste Schreibvorgang gelingt").toBe(200);
        bestaetigt = k + 1;
      } finally { await hartBeenden(s2); }
    });
  }

  it("abgebrochene Anfrage (halber Rumpf, Verbindung gekappt): nichts geschrieben, Server lebt", async () => {
    const s = await starten(daten);
    try {
      const vorher = await lesen(s);
      const rumpf = JSON.stringify({ bestand: stand(vorher.bestand, stimmig(vorher.bestand) + 1), etag: vorher.etag });
      const port = Number(new URL(s.basis).port);
      await new Promise((erfuellt) => {
        const sock = connect(port, "127.0.0.1", () => {
          sock.write(`PUT /api/bestand HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${s.basis}\r\nAuthorization: Bearer ${token}\r\n`
            + `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(rumpf)}\r\n\r\n${rumpf.slice(0, Math.floor(rumpf.length / 2))}`);
          setTimeout(() => { sock.destroy(); erfuellt(); }, 200);
        });
        sock.on("error", () => erfuellt());
      });
      await new Promise((r) => setTimeout(r, 300));
      expect((await fetch(`${s.basis}/gesund`)).status).toBe(200);
      const nach = await lesen(s);
      expect(nach.etag, "Stand unverändert").toBe(vorher.etag);
      expect(nach.bestand).toEqual(vorher.bestand);
    } finally { await hartBeenden(s); }
  });

  it("sichere Wiederholung: derselbe PUT noch einmal (Antwort ging verloren) wirkt nicht doppelt", async () => {
    const s = await starten(daten);
    try {
      const vorher = await lesen(s);
      const n = stimmig(vorher.bestand);
      const neu = stand(vorher.bestand, n + 1);
      expect((await schreiben(s, neu, vorher.etag)).status).toBe(200);
      const nachErstem = await lesen(s);
      const nochmal = await schreiben(s, neu, vorher.etag);
      expect([200, 409], JSON.stringify(nochmal).slice(0, 200)).toContain(nochmal.status);
      const nachZweitem = await lesen(s);
      expect(stimmig(nachZweitem.bestand)).toBe(n + 1);
      expect(nachZweitem.bestand).toEqual(nachErstem.bestand);
    } finally { await hartBeenden(s); }
  });
});

describe("4 — Sicherung → Schaden → Wiederherstellung byteweise", { timeout: 600_000 }, () => {
  let sicherung, original;
  const sicherungen = () => path.join(daten + "-sicherungen");

  beforeAll(async () => {
    aufraeumen.push(sicherungen());
    await mkdir(sicherungen(), { recursive: true });
    const r = werkzeug("ablage-sicherung.mjs", ["sichern", "--quelle", daten, "--ziel", sicherungen(), "--ruhe", "200"]);
    expect(r.code, r.aus).toBe(0);
    sicherung = path.join(sicherungen(), (await readdir(sicherungen())).find((d) => d.startsWith("centric-sicherung-")));
    original = Object.fromEntries(Object.entries(await dateienMitHash(daten)).filter(([p]) => gehoertInSicherung(p)));
    expect(Object.keys(original).length).toBeGreaterThanOrEqual(3);
    expect(werkzeug("ablage-sicherung.mjs", ["pruefen", "--sicherung", sicherung]).code).toBe(0);
  }, 180_000);

  it("Ablage beschädigt: Server antwortet 503 (nicht 500, kein leerer Stand), die kaputte Datei bleibt liegen", async () => {
    const kern = Object.keys(original).find((p) => p.startsWith("centric/") && decodeURIComponent(p).includes(RAUM) && /\d{4}-\d{2}/.test(decodeURIComponent(p)));
    expect(kern, Object.keys(original).join("\n")).toBeTruthy();
    const datei = path.join(daten, ...kern.split("/"));
    await writeFile(datei, "{ kaputt");
    const s = await starten(daten);
    try {
      const g = await lesen(s);
      expect(g.status).toBe(503);
      const p = await schreiben(s, { version: 9, mandanten: [] }, "x");
      expect([409, 503]).toContain(p.status);
      expect(await readFile(datei, "utf8"), "kaputte Datei unverändert, nicht gelöscht").toBe("{ kaputt");
    } finally { await hartBeenden(s); }
    const pr = werkzeug("ablage-pruefen.mjs", ["--daten", daten, RAUM]);
    expect(pr.code, "ablage-pruefen meldet den Schaden").not.toBe(0);
  });

  it("beschädigte Sicherung: pruefen ≠ 0, wiederherstellen verweigert, Ziel unberührt", async () => {
    const kaputt = path.join(sicherungen(), "kopie-kaputt");
    const cp = spawnSync(process.execPath, ["-e", `require("node:fs").cpSync(${JSON.stringify(sicherung)}, ${JSON.stringify(kaputt)}, { recursive: true })`]);
    expect(cp.status).toBe(0);
    const eine = Object.keys(original)[0];
    await writeFile(path.join(kaputt, "daten", ...eine.split("/")), "verfälscht");
    expect(werkzeug("ablage-sicherung.mjs", ["pruefen", "--sicherung", kaputt]).code).not.toBe(0);
    const ziel = await mkdtemp(path.join(tmpdir(), "centric-abnahme-c-ziel-kaputt-"));
    aufraeumen.push(ziel);
    const r = werkzeug("ablage-sicherung.mjs", ["wiederherstellen", "--sicherung", kaputt, "--ziel", ziel, "--ohne-serverpruefung"]);
    expect(r.code, r.aus).not.toBe(0);
    expect(await readdir(ziel), "Ziel unberührt").toEqual([]);
  });

  it("anderer Pfeffer: Wiederherstellung verweigert", async () => {
    const ziel = await mkdtemp(path.join(tmpdir(), "centric-abnahme-c-ziel-pfeffer-"));
    aufraeumen.push(ziel);
    const r = werkzeug("ablage-sicherung.mjs", ["wiederherstellen", "--sicherung", sicherung, "--ziel", ziel, "--ohne-serverpruefung"],
      { CENTRIC_PFEFFER: "ein-ganz-anderer-pfeffer-0000000000000" });
    expect(r.code).not.toBe(0);
    expect(r.aus).toMatch(/PFEFFER/);
    expect(await readdir(ziel)).toEqual([]);
  });

  it("in ein leeres Ziel: jede gesicherte Datei byteweise gleich, flüchtige Sitzungen fehlen, Server startet und liefert den Stand", async () => {
    const ziel = path.join(await mkdtemp(path.join(tmpdir(), "centric-abnahme-c-ziel-")), "data");
    aufraeumen.push(path.dirname(ziel), `${ziel}-zustand`);
    const leer = await freierPort();
    const r = werkzeug("ablage-sicherung.mjs", ["wiederherstellen", "--sicherung", sicherung, "--ziel", ziel, "--server-url", `http://127.0.0.1:${leer}/gesund`]);
    expect(r.code, r.aus).toBe(0);
    const jetzt = await dateienMitHash(ziel);
    expect(jetzt, "byteweise gleich, nichts mehr, nichts weniger").toEqual(original);
    expect(Object.keys(jetzt).some((p) => p.startsWith("centric-accountsitzungen/") || p.startsWith("centric-takt/"))).toBe(false);

    const s = await starten(ziel);
    try {
      expect((await lesen(s)).status, "flüchtige Sitzung bewusst nicht zurückgespielt → neu anmelden").toBe(401);
      const b = await mitAblage(ziel, (store) => B.bestandLesen(store, RAUM));
      expect(stimmig(b.bestand)).toBeGreaterThan(0);
    } finally { await hartBeenden(s); }
  });

  it("mit --ersetzen über die beschädigte Ablage: byteweise wie gesichert, alter Inhalt beiseitegelegt statt gelöscht", async () => {
    const leer = await freierPort();
    const r = werkzeug("ablage-sicherung.mjs", ["wiederherstellen", "--sicherung", sicherung, "--ziel", daten, "--ersetzen",
      "--server-url", `http://127.0.0.1:${leer}/gesund`]);
    expect(r.code, r.aus).toBe(0);
    const beiseite = /Alter Inhalt liegt in (.+?) —/.exec(r.aus);
    expect(beiseite, r.aus).toBeTruthy();
    aufraeumen.push(beiseite[1].trim());
    const jetzt = Object.fromEntries(Object.entries(await dateienMitHash(daten)).filter(([p]) => gehoertInSicherung(p)));
    expect(jetzt).toEqual(original);
    const pr = werkzeug("ablage-pruefen.mjs", ["--daten", daten, RAUM]);
    expect(pr.code, pr.aus).toBe(0);
  });
});

describe("5 — sauberes Beenden mit SIGTERM", { timeout: 120_000 }, () => {
  it.skipIf(process.platform === "win32")("laufende Anfrage wird beantwortet, Exit 0, Sperre frei", async () => {
    const d = await mkdtemp(path.join(tmpdir(), "centric-abnahme-c-sigterm-"));
    aufraeumen.push(d, `${d}-zustand`);
    const s = await starten(d);
    /* Das Ergebnis der Anfrage wird sofort festgehalten (Fehlerbehandler hängt von Anfang an dran), damit eine
       abgebrochene Verbindung nie als unbehandelte Ablehnung endet. Erwartung für eine Anfrage, die beim Beenden
       unterwegs ist: entweder eine echte HTTP-Antwort (200 bereit oder 503 beim Herunterfahren) oder ein sauberer
       Verbindungsabbruch (ECONNRESET/UND_ERR_SOCKET/ECONNREFUSED, falls die Verbindung noch nicht stand). Alles andere
       (anderer Status, anderer Fehler, Hängen) lässt den Test scheitern. */
    const anfrage = fetch(`${s.basis}/gesund`, { signal: AbortSignal.timeout(30_000) }).then(
      (a) => ({ art: "antwort", status: a.status }),
      (f) => ({ art: "abbruch", code: (f && f.cause && f.cause.code) || (f && f.code) || null, name: f && f.name }),
    );
    const ende = new Promise((r) => s.kind.once("exit", (code, sig) => r({ code, sig })));
    s.kind.kill("SIGTERM");
    const e = await ende;
    const ergebnis = await anfrage;
    if (ergebnis.art === "antwort") {
      expect([200, 503], `Anfrage beim Beenden: HTTP ${ergebnis.status}`).toContain(ergebnis.status);
    } else {
      expect(["ECONNRESET", "UND_ERR_SOCKET", "ECONNREFUSED"], `Anfrage beim Beenden weder beantwortet noch sauber abgebrochen: ${JSON.stringify(ergebnis)}`).toContain(ergebnis.code);
    }
    expect(e).toEqual({ code: 0, sig: null });
    expect(s.log()).toMatch(/SIGTERM: Server wird beendet/);
    expect(await readdir(d)).not.toContain(".prozess");
  });
});
