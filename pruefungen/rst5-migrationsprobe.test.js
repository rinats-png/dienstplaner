/* ==========================================================================
   RST-5: Migrationsprobe W-1…W-9 am exakten Digest — Regeln, Nachweis, Gate-Skript, Workflow-Patch (ohne Docker)

   (A) bewerten(): jede Regel W-1…W-9 und jede Zusatzprobe (Fixture, Start, Kennungen, Gegenprobe, Abgleich) besteht
       auf einem vollständigen guten Lauf und kippt einzeln auf „fehlgeschlagen“ bzw. „nicht bewertbar“; gesamt ist nie
       „bestanden“, solange etwas nicht bewertbar ist (fail-closed).
   (B) nachweisBauen(): Gate nur mit exaktem Digest (sha256:<64 hex>, ≠ Altbild) bewertbar; lokal ohne Digest.
       „Gate grün auf Fixture-Digest“: Kommandozeile `bewerten` mit Fixture-Digest ⇒ Exit 0, digest gebunden.
   (C) deploy/sicherung/ci/migrationsprobe-staging.sh: Syntax, Herkunft des Codes (274bfa0-Bild schreibt, Digest-Bild
       prüft/startet), ohne Netz, Einhängungen aus dem Checkout nur lesend, kein CENTRIC_BASIS, keine Abschaltung von
       Lösch-/Datenschutzlauf, Schleifen begrenzt, Nachweis im Gate-Modus.
   (D) Workflow-Patch docs/acc45/workflow-patches/rst-5/ (auf die GATE-EW3-Vollfassung): passt, = Vollfassung, nur
       Zusätze, Rechte/Auslöser/Aktivierung unverändert; der Nachweisschritt bindet migrationsprobe an DIGEST.
   Docker läuft hier nicht; der Docker-Teil läuft erst im Runner nach Übernahme beider Patches (siehe README).
   Lokaler Lauf mit Server: pruefungen/rst5-migrationsprobe-lauf.test.js.
   ========================================================================== */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as MP from "../deploy/sicherung/ci/migrationsprobe-staging.mjs";
import { planBauen } from "../werkzeug/synthetischer-altbestand.mjs";

const yaml = createRequire(import.meta.url)("js-yaml");
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lf = (/** @type {string} */ s) => s.replace(/\r\n/g, "\n");
const lesen = (/** @type {string} */ rel) => lf(readFileSync(path.join(WURZEL, rel), "utf8"));
const SKRIPT_REL = "deploy/sicherung/ci/migrationsprobe-staging.sh";
const HILFE_REL = "deploy/sicherung/ci/migrationsprobe-staging.mjs";
const EW3_VOLL = "docs/acc45/workflow-patches/gate-ew3/staging-gate.gepatcht.yml.txt";
const PATCH_REL = "docs/acc45/workflow-patches/rst-5/staging-gate.patch";
const VOLL_REL = "docs/acc45/workflow-patches/rst-5/staging-gate.gepatcht.yml.txt";
const WF_REL = ".github/workflows/staging-gate.yml";
const D = `sha256:${"d".repeat(64)}`, ALT = "sha256:0b1929273a79d6c010c9a0303b0d624a8e61e3555df77c08773bd573dd3e452f";

const tmpOrdner = [];
afterAll(() => { for (const d of tmpOrdner) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(path.join(os.tmpdir(), "rst5-mp-")); tmpOrdner.push(d); return d; };

/* Ein vollständiger guter Lauf (Zeilen wie server.mjs, Probe wie deploy/migrationsprobe-lokal.mjs). */
const LOG_GUT = [
  "Herkunft: X-Forwarded-For wird von 3 vertrauten Einträgen angenommen.",
  "Schreibhalt: Kanal bereit (höchstens 30000 ms je Halt)",
  "Widerrufbuch: 0 Einträge, 0 aus der Ablage eingesammelt, 0 in der Ablage nachgezogen, 3 Marken, 3 Regime-Marken angelegt",
  "Konto-Widerrufbuch: 1 gesperrte Konten, 0 entzogene Beziehungen, 1 aus der Ablage eingesammelt, 0 in der Ablage nachgezogen, 0 Läufe angehoben",
  "Funktionen: bestand /api/bestand",
  "CENTRIC läuft auf Port 3000, Daten: /scratchpad/daten-mig-gate",
  "Sicherungsschlüssel: Zustandsverzeichnis nutzbar",
  "Löschlauf: 0 Testräume geprüft, 0 gelöscht, 0 Fehler",
  "Datenschutzlauf (vorschau): 6 Räume, 0 Betriebe bereinigt, 0 fällig (Vorschau), 0 Sicherungen entfernt, 0 Sicherungen fällig (Vorschau), 0 Sicherungen älter als 90 Tage (0 davon behalten), 0 alte Kalender-Termine entfernt (0 fällig), 0 Fehler",
].join("\n");
const PROBE_GUT = [
  "Räume (kern:): 5 · Altform bestand:: 1",
  "BESTANDEN       alt-pflege: lesbar über die API (200), 1 Betrieb(e) [20P/3A/4E] HTTP 200",
  "BESTANDEN       alt-pflege: unveränderter Schreibzyklus geschrieben (PUT 200), Inhalt gleich PUT 200: geschrieben, Inhalt gleich",
  "BESTANDEN       alt-sicherheit [Betrieb 1/2]: unveränderter Schreibzyklus geschrieben (PUT 200), Inhalt gleich",
  "BESTANDEN       alt-sicherheit [Betrieb 2/2]: unveränderter Schreibzyklus geschrieben (PUT 200), Inhalt gleich",
  "BESTANDEN       alt-bestandsform: unveränderter Schreibzyklus geschrieben (PUT 200), Inhalt gleich",
  "",
  "MIGRATIONSPROBE: 5/5",
].join("\n");
const gut = () => ({
  startLog: LOG_GUT, prozess: "ja\n", schreibhalt: "ja\n", buchZugang: "412\n", buchKonto: "377\n",
  abgleich: '{"gleich":45,"abweichend":0,"fehlend":0,"nachStart":0,"ausgelassen":0,"ok":true}\n', abgleichExit: "0\n",
  probe: PROBE_GUT, probeExit: "0\n", kennungenExit: "0\n", gegenprobeExit: "1\n", fixtureBaum: `${MP.FIXTURE_BAUM}\n`,
});
const finde = (/** @type {any} */ e, /** @type {string} */ id) => [...e.w, ...e.zusatz].find((x) => x.id === id);

describe("(A) bewerten: W-1…W-9 und Zusatzproben", () => {
  it("guter Lauf: alles bestanden, in fester Reihenfolge, gesamt bestanden", () => {
    const e = MP.bewerten(gut());
    expect(e.w.map((x) => x.id)).toEqual([...MP.W_IDS]);
    expect(e.zusatz.map((x) => x.id).sort()).toEqual([...MP.ZUSATZ_IDS].sort());
    for (const x of [...e.w, ...e.zusatz]) expect(x.ergebnis, `${x.id}: ${x.grund}`).toBe(MP.OK);
    expect(MP.gesamt([...e.w, ...e.zusatz])).toBe(MP.OK);
  });

  /** [Name, Eingriff, Kennung, Erwartung] */
  const faelle = [
    ["Fixture weicht ab", (r) => { r.fixtureBaum = "0".repeat(64); }, "fixture", MP.FEHL],
    ["Fixture-Prüfsumme fehlt", (r) => { r.fixtureBaum = null; }, "fixture", MP.NB],
    ["Startprotokoll mit WARNUNG", (r) => { r.startLog += "\nWARNUNG Sicherungsschlüssel: x"; }, "start", MP.FEHL],
    ["Startprotokoll fehlt", (r) => { r.startLog = null; }, "start", MP.NB],
    ["Server nicht gestartet", (r) => { r.startLog = r.startLog.replace(/CENTRIC läuft auf Port.*\n/, ""); }, "start", MP.FEHL],
    ["Kennungen Exit 1", (r) => { r.kennungenExit = "1"; }, "kennungen", MP.FEHL],
    ["Kennungen ohne Ergebnis", (r) => { r.kennungenExit = null; }, "kennungen", MP.NB],
    ["Gegenprobe Exit 0 (Zahl-Kennung nicht erkannt)", (r) => { r.gegenprobeExit = "0"; }, "gegenprobe", MP.FEHL],
    ["Gegenprobe Exit 3 (Isolation)", (r) => { r.gegenprobeExit = "3"; }, "gegenprobe", MP.FEHL],
    ["Abgleich: abweichende Datei", (r) => { r.abgleich = '{"gleich":44,"abweichend":1,"fehlend":0,"nachStart":0,"ausgelassen":0,"ok":false}'; r.abgleichExit = "1"; }, "abgleich", MP.FEHL],
    ["Abgleich: Exit 0, aber fehlend > 0", (r) => { r.abgleich = '{"gleich":44,"abweichend":0,"fehlend":1,"nachStart":0,"ausgelassen":0,"ok":true}'; }, "abgleich", MP.FEHL],
    ["Abgleich: nichts gleich (leere Sicherung)", (r) => { r.abgleich = '{"gleich":0,"abweichend":0,"fehlend":0,"nachStart":0,"ausgelassen":0,"ok":true}'; }, "abgleich", MP.FEHL],
    ["Abgleich fehlt", (r) => { r.abgleich = null; }, "abgleich", MP.NB],
    ["W-1 keine Sperrdatei", (r) => { r.prozess = "nein"; }, "W-1", MP.FEHL],
    ["W-1 nicht erhoben", (r) => { r.prozess = null; }, "W-1", MP.NB],
    ["W-2 Kanal fehlt im Protokoll", (r) => { r.startLog = r.startLog.replace(/^Schreibhalt: Kanal bereit.*$/m, "Schreibhalt: kein Kanal — x"); }, "W-2", MP.FEHL],
    ["W-2 Ordner fehlt", (r) => { r.schreibhalt = "nein"; }, "W-2", MP.FEHL],
    ["W-3 mit Fehler", (r) => { r.startLog += "\nBetreibersitzungen ohne zweiten Faktor: 1 beendet, 1 Fehler"; }, "W-3", MP.FEHL],
    ["W-3 nicht prüfbar", (r) => { r.startLog += "\nBetreibersitzungen ohne zweiten Faktor ließen sich nicht prüfen: x"; }, "W-3", MP.FEHL],
    ["W-4 Buch leer", (r) => { r.buchZugang = "0"; }, "W-4", MP.FEHL],
    ["W-4 Widerrufbuch nicht gestartet", (r) => { r.startLog = r.startLog.replace(/^Widerrufbuch: .*$/m, ""); }, "W-4", MP.FEHL],
    ["W-4 Buch nicht erhoben", (r) => { r.buchZugang = null; }, "W-4", MP.NB],
    ["W-5 Konto-Buch leer", (r) => { r.buchKonto = "0"; }, "W-5", MP.FEHL],
    ["W-5 nicht gestartet", (r) => { r.startLog = r.startLog.replace(/^Konto-Widerrufbuch: .*$/m, ""); }, "W-5", MP.FEHL],
    /* Review #594 B-1: echte Zeilen aus server/lib/schluesselepoche.mjs (:195, :198, :225, :259) und server.mjs (:576). */
    ["W-6 Ablage passt nicht zur Epoche", (r) => { r.startLog += "\nSicherungsschlüssel: Ablage passt nicht zur Schlüsselepoche — neue Epoche, alle früheren Schlüssel ungültig."; }, "W-6", MP.FEHL],
    ["W-6 neue Epoche (erstmals)", (r) => { r.startLog += "\nSicherungsschlüssel: neue Epoche (erstmals). Alle früheren Schlüssel sind ungültig."; }, "W-6", MP.FEHL],
    ["W-6 frühere Schlüssel widerrufen", (r) => { r.startLog += "\nSicherungsschlüssel: 2 frühere Schlüssel widerrufen, 0 Fehler."; }, "W-6", MP.FEHL],
    ["W-6 Aufräumen misslungen", (r) => { r.startLog += "\nSicherungsschlüssel: Aufräumen nach neuer Epoche misslungen: x"; }, "W-6", MP.FEHL],
    ["W-6 Epoche nicht prüfbar", (r) => { r.startLog += "\nSicherungsschlüssel: Schlüsselepoche nicht prüfbar, Schlüssel gelten nicht: x"; }, "W-6", MP.FEHL],
    ["W-6 nicht im Protokoll", (r) => { r.startLog = r.startLog.replace(/^Sicherungsschlüssel: Zustandsverzeichnis nutzbar$/m, ""); }, "W-6", MP.NB],
    ["W-7 abgeschaltet", (r) => { r.startLog = r.startLog.replace(/^Löschlauf: .*$/m, "Löschlauf: abgeschaltet (CENTRIC_AUFRAEUMEN=aus)"); }, "W-7", MP.NB],
    ["W-7 nicht abgewartet", (r) => { r.startLog = r.startLog.replace(/^Löschlauf: .*$/m, ""); }, "W-7", MP.NB],
    ["W-7 mit Fehler", (r) => { r.startLog = r.startLog.replace(/^Löschlauf: .*$/m, "Löschlauf: 0 Testräume geprüft, 0 gelöscht, 2 Fehler"); }, "W-7", MP.FEHL],
    /* Review #594 B-2: die Fixture hat keine Testräume ⇒ jede geprüfte oder gelöschte Zahl > 0 ist ein Befund. */
    ["W-7 löscht aus dem Altbestand", (r) => { r.startLog = r.startLog.replace(/^Löschlauf: .*$/m, "Löschlauf: 6 Testräume geprüft, 6 gelöscht, 0 Fehler"); }, "W-7", MP.FEHL],
    ["W-7 hält Altbestand für Testräume", (r) => { r.startLog = r.startLog.replace(/^Löschlauf: .*$/m, "Löschlauf: 1 Testräume geprüft, 0 gelöscht, 0 Fehler"); }, "W-7", MP.FEHL],
    ["W-8 Modus an (V-6)", (r) => { r.startLog = r.startLog.replace("Datenschutzlauf (vorschau)", "Datenschutzlauf (an)"); }, "W-8", MP.FEHL],
    ["W-8 nicht im Protokoll", (r) => { r.startLog = r.startLog.replace(/^Datenschutzlauf .*$/m, ""); }, "W-8", MP.NB],
    ["W-8 mit Fehler", (r) => { r.startLog = r.startLog.replace(/0 Fehler$/m, "x").replace(/, 0 Fehler$/m, ", 1 Fehler"); }, "W-8", MP.FEHL],
    ["W-9 ein Raum fehlgeschlagen", (r) => { r.probe = r.probe.replace("MIGRATIONSPROBE: 5/5", "FEHLGESCHLAGEN  alt-gross: x\nMIGRATIONSPROBE: 5/6"); r.probeExit = "1"; }, "W-9", MP.FEHL],
    ["W-9 Exit 1 trotz 5/5", (r) => { r.probeExit = "1"; }, "W-9", MP.FEHL],
    ["W-9 keine Räume", (r) => { r.probe = "MIGRATIONSPROBE: 0/0"; r.probeExit = "1"; }, "W-9", MP.FEHL],
    ["W-9 Altform nicht geprüft", (r) => { r.probe = r.probe.replace(/^BESTANDEN\s+alt-bestandsform.*$/m, ""); }, "W-9", MP.FEHL],
    ["W-9 zweiter Betrieb nicht geprüft", (r) => { r.probe = r.probe.replace(/^BESTANDEN\s+alt-sicherheit \[Betrieb 2\/2\].*$/m, ""); }, "W-9", MP.FEHL],
    ["W-9 ohne Ergebnis", (r) => { r.probeExit = null; }, "W-9", MP.NB],
  ];
  it.each(faelle)("%s ⇒ %s %s", (_name, eingriff, id, erwartet) => {
    const r = gut();
    /** @type {any} */ (eingriff)(r);
    const e = MP.bewerten(r);
    expect(finde(e, id).ergebnis, finde(e, id).grund).toBe(erwartet);
    expect(MP.gesamt([...e.w, ...e.zusatz])).not.toBe(MP.OK);
  });

  it("Servertexte: jeder Erkennungstext der Regeln steht wörtlich in der Quelldatei (Review #594 B-1)", () => {
    expect(MP.SERVERTEXTE.length).toBeGreaterThan(20);
    for (const [datei, text] of MP.SERVERTEXTE) expect(lesen(datei).includes(text), `${datei}: ${text}`).toBe(true);
  });

  it("gesamt: nicht bewertbar ist nie bestanden; leer ist nicht bewertbar; fehlgeschlagen schlägt nicht bewertbar", () => {
    expect(MP.gesamt([{ ergebnis: MP.OK }, { ergebnis: MP.NB }])).toBe(MP.NB);
    expect(MP.gesamt([{ ergebnis: MP.NB }, { ergebnis: MP.FEHL }])).toBe(MP.FEHL);
    expect(MP.gesamt([])).toBe(MP.NB);
    expect(MP.gesamt([{ ergebnis: "ok" }])).toBe(MP.NB);
  });

  it("Gründe sind gekürzt (≤ 200 Zeichen, einzeilig) — öffentliche Logs", () => {
    const r = gut(); r.kennungenExit = "7"; r.startLog += `\nWARNUNG ${"x".repeat(5000)}\nzweite`;
    for (const x of [...MP.bewerten(r).w, ...MP.bewerten(r).zusatz]) { expect(x.grund.length).toBeLessThanOrEqual(200); expect(x.grund).not.toMatch(/\n/); }
  });
});

describe("(B) Nachweis und Bindung an den exakten Digest", () => {
  const { w, zusatz } = MP.bewerten(gut());
  it("Gate mit exaktem Digest: bestanden, digest/altDigest gebunden, Fixture festgehalten", () => {
    const n = MP.nachweisBauen({ modus: "gate", digest: D, altDigest: ALT, w, zusatz });
    expect(n).toMatchObject({ art: "migrationsprobe-staging", digest: D, altDigest: ALT, bindung: "digest", ergebnis: MP.OK });
    expect(n.fixture).toEqual({ saat: MP.FIXTURE.saat, groesse: MP.FIXTURE.groesse, tage: MP.FIXTURE.tage, baum: MP.FIXTURE_BAUM });
  });
  it.each([
    ["ohne Digest", null, ALT], ["Tag statt Digest", "ghcr.io/x/y:latest", ALT], ["kurzer Digest", "sha256:0861adee", ALT],
    ["Großbuchstaben", `sha256:${"D".repeat(64)}`, ALT], ["ohne Altbild", D, null], ["Digest = Altbild", ALT, ALT],
  ])("Gate %s ⇒ nicht bewertbar, kein Digest im Nachweis", (_n, digest, altDigest) => {
    const n = MP.nachweisBauen({ modus: "gate", digest, altDigest, w, zusatz });
    expect(n.ergebnis).toBe(MP.NB);
    expect(n.digest).toBeNull();
  });
  it("lokal: bestanden möglich, aber art lokal und ohne Digest (ersetzt den Gate-Lauf nicht)", () => {
    const n = MP.nachweisBauen({ modus: "lokal", digest: D, altDigest: ALT, w, zusatz });
    expect(n).toMatchObject({ art: "migrationsprobe-lokal", digest: null, altDigest: null, ergebnis: MP.OK });
    expect(n.bindung).toMatch(/kein Digest/);
  });
  it("unbekannter Modus oder unvollständige Regeln ⇒ nicht bewertbar", () => {
    expect(MP.nachweisBauen({ modus: "", digest: D, altDigest: ALT, w, zusatz }).ergebnis).toBe(MP.NB);
    expect(MP.nachweisBauen({ modus: "gate", digest: D, altDigest: ALT, w: w.slice(0, 8), zusatz }).ergebnis).toBe(MP.NB);
    expect(MP.nachweisBauen({ modus: "gate", digest: D, altDigest: ALT, w, zusatz: zusatz.slice(1) }).ergebnis).toBe(MP.NB);
  });

  /** Rohdaten-Ordner schreiben und die Kommandozeile wie im Runner aufrufen. */
  const cli = (/** @type {Record<string, any>} */ roh, /** @type {Record<string, string>} */ env) => {
    const d = tmp(); const ordner = path.join(d, "roh"); mkdirSync(ordner);
    for (const [k, datei] of Object.entries(MP.ROHDATEN)) if (roh[k] != null) writeFileSync(path.join(ordner, datei), roh[k]);
    const aus = path.join(d, "migrationsprobe.json");
    const r = spawnSync(process.execPath, [path.join(WURZEL, HILFE_REL), "bewerten", ordner, aus], { encoding: "utf8", timeout: 60000,
      env: { ...process.env, ...env } });
    return { code: r.status, stdout: r.stdout, n: existsSync(aus) ? JSON.parse(readFileSync(aus, "utf8")) : null, aus };
  };
  it("Gate grün auf Fixture-Digest: `bewerten` Exit 0, Nachweis an DIGEST gebunden, Bericht je Regel eine Zeile", () => {
    const r = cli(gut(), { MP_MODUS: "gate", DIGEST: D, ALT_DIGEST: ALT });
    expect(r.code, r.stdout).toBe(0);
    expect(r.n).toMatchObject({ digest: D, ergebnis: MP.OK });
    expect(r.stdout.trim().split("\n")).toHaveLength(MP.W_IDS.length + MP.ZUSATZ_IDS.length + 1);
  });
  it("Gate ohne DIGEST oder mit fehlender Rohdatei: Exit 1 (nicht bewertbar ist kein Erfolg)", () => {
    expect(cli(gut(), { MP_MODUS: "gate", DIGEST: "", ALT_DIGEST: ALT }).code).toBe(1);
    const ohne = gut(); ohne.probe = null;
    const r = cli(ohne, { MP_MODUS: "gate", DIGEST: D, ALT_DIGEST: ALT });
    expect(r.code).toBe(1);
    expect(r.n.ergebnis).toBe(MP.NB);
  });
  it("plan: gleicher Plan wie planBauen(FIXTURE); Gegenprobe nur mit Zahl-Kennung", () => {
    const p = spawnSync(process.execPath, [path.join(WURZEL, HILFE_REL), "plan"], { encoding: "utf8", timeout: 60000 });
    expect(p.status).toBe(0);
    expect(JSON.parse(p.stdout)).toEqual(planBauen(MP.FIXTURE));
    expect(MP.FIXTURE.zahlkennung).toBe(false);
    expect(MP.GEGENPROBE).toEqual({ ...MP.FIXTURE, zahlkennung: true });
    expect(MP.FIXTURE_BAUM).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("(C) Gate-Skript migrationsprobe-staging.sh", () => {
  const sh = lesen(SKRIPT_REL);
  const code = sh.split("\n").filter((z) => !/^\s*#/.test(z)).join("\n");
  /** Docker-Aufrufe mit Fortsetzungszeilen zusammengefügt. */
  const aufrufe = code.replace(/\\\n\s*/g, " ").split("\n").filter((z) => /docker run /.test(z));
  it("Bash-Syntax", () => {
    const r = spawnSync("bash", ["-n", path.join(WURZEL, SKRIPT_REL)], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
  });
  it("nur Digest-Bilder; BILD ≠ ALT_BILD; strikter Modus", () => {
    expect(code).toMatch(/set -Eeuo pipefail/);
    expect(code).toMatch(/@sha256:\[0-9a-f\]\{64\}\$/);
    expect(code).toMatch(/\[\[ "\$BILD" != "\$ALT_BILD" \]\]/);
    expect(code).not.toMatch(/set -x/);
  });
  it("Herkunft: 274bfa0-Bild schreibt die Fixture mit /app; Digest-Bild prüft Kennungen, sichert, gleicht ab und läuft als Server", () => {
    const schreiber = aufrufe.filter((z) => /schreiber\.mjs/.test(z));
    expect(schreiber).toHaveLength(1);
    expect(schreiber[0]).toMatch(/"\$ALT_BILD" \/ci\/schreiber\.mjs \/app \/ausgabe/);
    for (const muster of [/betriebskennungen-pruefen\.mjs/, /ablage-sicherung\.mjs sichern/, /deploy-abgleich\.mjs/]) {
      const z = aufrufe.filter((a) => muster.test(a));
      expect(z.length, String(muster)).toBe(1);
      expect(z[0]).toMatch(/"\$BILD"/);
      expect(z[0]).not.toMatch(/ALT_BILD/);
    }
    const server = aufrufe.filter((z) => /docker run -d /.test(z));
    expect(server).toHaveLength(1);
    expect(server[0]).toMatch(/"\$BILD" >\/dev\/null$/);
  });
  it("Härtung: Einmal-Container ohne Netz, Server nur auf 127.0.0.1; alle gehärtet; Checkout-Dateien nur lesend", () => {
    expect(code).toMatch(/HART=\(--read-only --tmpfs \/tmp --cap-drop ALL --security-opt no-new-privileges:true --user "\$NUTZER"\)/);
    for (const z of aufrufe) {
      expect(z, z).toMatch(/"\$\{HART\[@\]\}"/);
      if (/docker run -d /.test(z)) expect(z).toMatch(/-p "127\.0\.0\.1:\$PORT:3000"/);
      else expect(z, z).toMatch(/--network none/);
      for (const m of z.matchAll(/-v "\$WURZEL\/[^"]+"/g)) expect(m[0], m[0]).toMatch(/:ro"$/);
    }
    expect(aufrufe.find((z) => /deploy-abgleich/.test(z))).toMatch(/-v "\$DATEN:\/daten:ro"/);
  });
  it("Produktionsnah und isoliert: kein CENTRIC_BASIS, Lösch-/Datenschutzlauf nicht abgeschaltet, Zustellung aus, Isolationspfad", () => {
    expect(code).not.toMatch(/CENTRIC_BASIS/);
    expect(code).not.toMatch(/CENTRIC_AUFRAEUMEN|CENTRIC_DATENSCHUTZLAUF/);
    expect(code).toMatch(/CENTRIC_ZUSTELL_TAKT=aus/);
    expect(code).toMatch(/CENTRIC_DATEN=\/scratchpad\/daten-mig-gate/);
    expect(code).toMatch(/Zustandsverzeichnis vor dem ersten Start nicht leer/);
  });
  it("jeder Docker-Aufruf und jedes curl mit Frist (Review #594 C-1); kein mkdir -m mit -p (SC2174)", () => {
    const zeilen = code.split("\n");
    const docker = zeilen.filter((x) => /docker (run|exec|logs|stop)\b/.test(x));
    expect(docker.length).toBeGreaterThanOrEqual(9);
    for (const z of docker) expect(z, z).toMatch(/timeout \d+ docker /);
    for (const z of zeilen.filter((x) => /curl /.test(x))) expect(z, z).toMatch(/--max-time \d+/);
    expect(code).not.toMatch(/mkdir -m \d+ -p|mkdir -p -m/);
  });
  it("Schleifen und Wartezeiten begrenzt; Probe mit Frist", () => {
    for (const m of code.matchAll(/for _ in \$\(seq 1 "?\$(\w+)"?\)/g)) expect(code).toMatch(new RegExp(`^${m[1]}=\\d{1,3}$`, "m"));
    expect(code).not.toMatch(/while true|until /);
    expect(code).toMatch(/timeout 300 docker exec/);
  });
  it("Bewertung im Gate-Modus mit DIGEST aus BILD; Abbruch bei nicht bestanden; Ausgabe begrenzt", () => {
    expect(code).toMatch(/MP_MODUS=gate DIGEST="\$\{BILD##\*@\}" ALT_DIGEST="\$\{ALT_BILD##\*@\}" node "\$HILFE" bewerten/);
    expect(code).toMatch(/fehl "Migrationsprobe W-1…W-9 am Digest-Bild nicht bestanden/);
    for (const m of code.matchAll(/tail -n (\d+)/g)) expect(Number(m[1])).toBeLessThanOrEqual(40);
    expect(code).not.toMatch(/cat "\$ROH\/start\.log"|echo "\$PFEFFER"|echo "\$ADMIN"/);
    expect(code).toMatch(/::add-mask::\$ADMIN/);
  });
});

describe("(D) Workflow-Patch rst-5 (Vorschlag; .github/workflows bleibt unverändert)", () => {
  const git = (/** @type {string} */ cwd, /** @type {string[]} */ a) => spawnSync("git", ["-c", "core.autocrlf=false", ...a], { cwd, encoding: "utf8" });
  const basis = lesen(EW3_VOLL), voll = lesen(VOLL_REL), patch = lesen(PATCH_REL);
  it("passt auf die GATE-EW3-Vollfassung (git apply in Wegwerf-Repository) und ergibt genau die Vollfassung", () => {
    const d = tmp();
    expect(git(d, ["init", "-q"]).status).toBe(0);
    mkdirSync(path.join(d, ".github", "workflows"), { recursive: true });
    writeFileSync(path.join(d, WF_REL), basis); writeFileSync(path.join(d, "p.patch"), patch);
    const c = git(d, ["apply", "--check", "p.patch"]); expect(c.status, c.stderr).toBe(0);
    expect(git(d, ["apply", "p.patch"]).status).toBe(0);
    expect(lf(readFileSync(path.join(d, WF_REL), "utf8"))).toBe(voll);
  });
  it("nur Zusätze; Rechte, Auslöser, Aktivierung, Secrets und uses: unverändert", () => {
    const koerper = patch.split("\n").filter((z) => !/^(---|\+\+\+) /.test(z));
    expect(koerper.filter((z) => z.startsWith("-"))).toEqual([]);
    const a = yaml.load(basis), b = yaml.load(voll);
    expect(b.on).toEqual(a.on);
    expect(b.permissions).toEqual(a.permissions);
    expect(b.jobs.gate.permissions).toEqual(a.jobs.gate.permissions);
    expect(b.jobs.gate.if).toBe(a.jobs.gate.if);
    expect(b.jobs.gate.timeout_minutes ?? b.jobs.gate["timeout-minutes"]).toBe(a.jobs.gate["timeout-minutes"]);
    expect(Object.keys(b.jobs)).toEqual(Object.keys(a.jobs));
    const muster = (/** @type {string} */ t, /** @type {RegExp} */ re) => (t.match(re) || []).sort();
    expect(muster(voll, /secrets\.\w+/g)).toEqual(muster(basis, /secrets\.\w+/g));
    expect(muster(voll, /uses: \S+/g)).toEqual(muster(basis, /uses: \S+/g));
    expect(voll).not.toMatch(/STAGING_GATE_AKTIV\s*[:=]\s*["']?true/);
  });
  it("Schritt Migrationsprobe: nach S1–S3, vor dem Nachweis, mit Frist, ruft nur das Gate-Skript", () => {
    const schritte = yaml.load(voll).jobs.gate.steps.map((/** @type {any} */ s) => s.name || s.uses || "");
    const i = schritte.findIndex((/** @type {string} */ n) => /^Migrationsprobe W-1…W-9/.test(n));
    expect(i).toBeGreaterThan(schritte.findIndex((/** @type {string} */ n) => /^Widerrufbuch S1–S3/.test(n)));
    expect(i).toBeLessThan(schritte.findIndex((/** @type {string} */ n) => /^Nachweis zusammenstellen/.test(n)));
    const s = yaml.load(voll).jobs.gate.steps[i];
    expect(s["timeout-minutes"]).toBeGreaterThan(0);
    expect(s.run).toMatch(/MP_NACHWEIS="\$RUNNER_TEMP\/migrationsprobe\.json" bash deploy\/sicherung\/ci\/migrationsprobe-staging\.sh/);
    expect(s.if).toBeUndefined();   // läuft nicht bei vorherigem Fehler weiter, wird nie übersprungen
  });

  /** Nachweisschritt der Vollfassung ausführen (wie im Runner). */
  const nachweis = (/** @type {any} */ mp, /** @type {string} */ digest = D) => {
    const schritt = yaml.load(voll).jobs.gate.steps.find((/** @type {any} */ s) => /^Nachweis zusammenstellen/.test(s.name || ""));
    const d = tmp(); mkdirSync(path.join(d, "arbeit", "deploy", "sicherung", "ci"), { recursive: true }); mkdirSync(path.join(d, "runner"));
    writeFileSync(path.join(d, "arbeit", "deploy", "sicherung", "ci", "widerrufbuch-ende-zu-ende.sh"), "#!/bin/sh\n");
    if (mp !== undefined) writeFileSync(path.join(d, "runner", "migrationsprobe.json"), typeof mp === "string" ? mp : JSON.stringify(mp));
    const r = spawnSync("bash", ["-c", schritt.run], { cwd: path.join(d, "arbeit"), encoding: "utf8", timeout: 60000,
      env: { ...process.env, RUNNER_TEMP: path.join(d, "runner"), DIGEST: digest, REVISION: "a".repeat(40), BAUM: "6".repeat(40),
        GITHUB_SHA: "3".repeat(40), LAUF: "4242-1", ERGEBNIS: "success", ALT_DIGEST: ALT } });
    expect(r.status, r.stderr).toBe(0);
    return JSON.parse(readFileSync(path.join(d, "arbeit", "staging-nachweis", "staging-nachweis.json"), "utf8"));
  };
  const { w, zusatz } = MP.bewerten(gut());
  const mpGut = MP.nachweisBauen({ modus: "gate", digest: D, altDigest: ALT, w, zusatz });
  it("Nachweis trägt migrationsprobe am selben Digest; EW3-Felder bleiben", () => {
    const n = nachweis(mpGut);
    expect(n.migrationsprobe).toEqual(mpGut);
    expect(n.digest).toBe(D);
    expect(n.widerrufbuch.art).toBe("widerrufbuch-staging-funktionstest");
  });
  it.each([
    ["fehlt", undefined, D], ["unlesbar", "{kaputt", D], ["anderer Digest", mpGut, `sha256:${"e".repeat(64)}`],
    ["lokaler Nachweis", MP.nachweisBauen({ modus: "lokal", w, zusatz }), D],
    ["anderes Altbild (C-2)", { ...mpGut, altDigest: `sha256:${"f".repeat(64)}` }, D],
    ["unbekanntes Ergebnis (C-2)", { ...mpGut, ergebnis: "ok" }, D],
  ])("migrationsprobe %s ⇒ nicht bewertbar, kein Digest", (_n, mp, digest) => {
    const n = nachweis(mp, digest);
    expect(n.migrationsprobe).toMatchObject({ ergebnis: "nicht bewertbar", digest: null });
  });
  it("die echte Workflow-Datei ist nicht geändert (Patch nur als Vorschlag)", () => {
    expect(lesen(WF_REL)).not.toMatch(/migrationsprobe/);
  });
});
