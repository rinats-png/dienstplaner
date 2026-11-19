#!/usr/bin/env node
/* ==========================================================================
   DAUERLAUF — Supervisor-Prototyp für autonome Weiterentwicklung (NICHT aktiviert)

   Schließt die Lücke zwischen den vorhandenen passiven Werkzeugen (koordination.mjs leerlauf,
   naechstes-paket.mjs) und einem Prozess, der nach Sitzungsende weiterläuft:

     Supervisor (ein Prozess außerhalb jeder Claude-Sitzung)
       Zyklus: Lease lesen -> entscheiden (reiner Kern) -> genau eine Aktion
       Heartbeat: die Lease wird NUR erneuert, solange der Puls jünger als die Lease-Dauer ist.
                  Ein eingefrorener Worker lässt die Lease also nach höchstens einer Lease-Dauer auslaufen
                  (Schreibrecht weg, Worker beendet); spätestens nach haengMin wird er ohnehin beendet.
       Worker: je Arbeitspaket ein frischer, begrenzter `claude -p`-Lauf (eigener Kontext). Er schreibt
               nur über `koordination.mjs push --halter --epoche` (Fencing, atomar mit der Lease).

   Sicherheitsregeln (fail-closed, in dieser Reihenfolge):
     1. Abschalter (Datei AUTONOMIE-AUS oder Umgebung CENTRIC_AUTONOMIE != ja)  -> nichts starten, Lease freigeben.
     2. Lease unlesbar -> STOPP. Fremde gültige Lease -> nur warten (nie übernehmen, nie umgehen).
     3. Übernahme nur über entscheide() (abgelaufen/freigegeben, eigene Kennung, Übergabetext).
     4. Start eines Workers nur nach `pruefen` (Epoche) UND ohne laufenden Auftrag gleichen Schlüssels.
     5. Schreibrecht verloren (Epoche/Zone/Ablauf) -> laufender Worker wird sofort beendet.
     6. Je Paket höchstens `maxVersuche` Läufe ohne nachweisbaren Fortschritt, mit Backoff; danach gesperrt.
     7. Kein freigegebenes Paket (nur READY/IN_PROGRESS, nicht extern/bedingt/BLOCKED) -> Lease freigeben, Leerlauf.

   Aufruf (Standard = nur Plan ausgeben, schreibt nichts):
     node werkzeug/dauerlauf.mjs [--halter H] [--json]
   Scharf (nur auf ausdrückliche Betreiberfreigabe, siehe docs/acc45/AUTONOMIE-ARCHITEKTUR.md §9):
     CENTRIC_AUTONOMIE=ja node werkzeug/dauerlauf.mjs --scharf --halter dauerlauf-<kennung> [--zyklen N]
   ========================================================================== */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, appendFileSync, openSync, unlinkSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entscheide, lesen, schreiben } from "./koordination.mjs";
import { naechste } from "./naechstes-paket.mjs";
import { paketeAus } from "./acc45-backlog.mjs";

const MIN = 60000;
export const STANDARD = Object.freeze({
  leaseMin: 20,          // kurze Lease: nach Prozessende höchstens ~22 Min Stillstand
  erneuernUnterMin: 10,  // erneuern, wenn weniger als 10 Min Restlaufzeit
  haengMin: 20,          // kein Puls seit 20 Min -> Worker gilt als hängend (nicht größer als leaseMin)
  maxVersuche: 3,        // Läufe je Paket ohne Fortschritt
  backoffMin: [5, 15, 45],
  kandidaten: 20,
});

/* ---------- Reiner Kern (ohne I/O) ---------- */

export const leererZustand = (halter) => ({ halter, epoche: null, laufend: null, versuche: {}, gesperrt: [] });
export const auftragsSchluessel = (paketId, kopf) => `${paketId}@${kopf}`;

/** Wählt aus der SSOT die freigegebenen, ausführbaren Pakete (READY/IN_PROGRESS, nicht extern/bedingt/BLOCKED). */
export const kandidatenAus = (pakete, n = STANDARD.kandidaten) => naechste(paketeAus(pakete), n).map((x) => x.id);

const aktion = (name, grund, extra = {}) => ({ aktion: name, grund, ...extra });

/** Genau eine Aktion je Zyklus. Kein I/O, jede Zeit wird übergeben. */
export function planeSchritt({ jetzt, lease, zustand, schalterAus = false, kandidaten = [], cfg = STANDARD }) {
  const t = jetzt.getTime();
  const ich = zustand.halter;
  const probe = entscheide(lease, jetzt, { aktion: "uebernehmen", halter: ich, uebergabe: "Dauerlauf Pruefung (nur lesend)" });
  const unlesbar = Boolean(lease) && !probe.ok && /unlesbar|beschädigt/.test(probe.grund);
  const pulsAlterLaufend = zustand.laufend ? t - Date.parse(zustand.laufend.puls) : 0;
  const schreibrecht = !unlesbar && zustand.epoche !== null && entscheide(lease, jetzt, { aktion: "pruefen", halter: ich, epoche: zustand.epoche }).ok;

  /* Ein laufender Worker wird zuerst beendet: bei verlorenem Schreibrecht, unlesbarer Lease oder Abschalter. */
  if (zustand.laufend && !schreibrecht) return aktion("WORKER_BEENDEN", unlesbar ? "Lease unlesbar (fail-closed)" : "Schreibrecht verloren (Epoche, Zone oder Ablauf)", { versuchZaehlen: !unlesbar && pulsAlterLaufend >= Math.min(cfg.leaseMin, cfg.haengMin) * MIN });
  if (zustand.laufend && schalterAus) return aktion("WORKER_BEENDEN", "Abschalter gesetzt", { versuchZaehlen: false });
  if (unlesbar) return aktion("STOPP_FAILCLOSED", probe.grund);
  /* Abschalter: danach Lease freigeben. */
  if (schalterAus) return aktion(schreibrecht ? "FREIGEBEN" : "STOPP", "Abschalter gesetzt");
  const offenKandidaten = kandidaten.filter((id) => !zustand.gesperrt.includes(id));

  if (!schreibrecht) {
    /* Ohne offene Kandidaten nie übernehmen: sonst würde jeder Zyklus übernehmen und wieder freigeben (Epochen-Rauschen). */
    if (probe.ok && !offenKandidaten.length) return aktion("WARTEN_LEERLAUF", "kein offenes freigegebenes Paket: Lease wird nicht übernommen");
    if (probe.ok) return aktion("UEBERNEHMEN", probe.grund, { uebergabe: `Dauerlauf ${ich}: Lease frei oder abgelaufen, ${offenKandidaten.length} offene Pakete` });
    const bis = Date.parse(lease.gueltig_bis);
    const fremd = lease.halter !== ich;
    if (!lease.freigegeben_am && t <= bis + 120000 && t > bis - 120000) return aktion("WARTEN_SICHERHEITSZONE", `Zone um ${lease.gueltig_bis}: niemand schreibt`);
    return aktion(fremd ? "WARTEN_FREMDE_LEASE" : "WARTEN_SICHERHEITSZONE", probe.grund);
  }

  /* Ab hier: gültiges eigenes Schreibrecht. */
  const bis = Date.parse(lease.gueltig_bis);
  const erneuern = bis - t < cfg.erneuernUnterMin * MIN;
  if (zustand.laufend) {
    const pulsAlter = pulsAlterLaufend;
    if (pulsAlter >= cfg.haengMin * MIN) return aktion("WORKER_BEENDEN", `kein Puls seit ${cfg.haengMin} Min (hängt)`, { versuchZaehlen: true });
    /* Heartbeat nur bei frischem Puls (jünger als die Lease-Dauer): ein eingefrorener Worker lässt die Lease auslaufen. */
    return aktion("WORKER_LAEUFT", "Worker lebt, Heartbeat", { erneuern: erneuern && pulsAlter < cfg.leaseMin * MIN });
  }
  if (!kandidaten.length) return aktion("FREIGEBEN", "kein freigegebenes Paket (Leerlauf, nichts ohne Betreiberfreigabe)", { leerlauf: true });
  const offen = kandidaten.filter((id) => !zustand.gesperrt.includes(id));
  if (!offen.length) return aktion("FREIGEBEN", "alle freigegebenen Pakete nach Fehlversuchen gesperrt: Eskalation an Betreiber", { eskalation: true });
  const bereit = offen.find((id) => !(Date.parse(zustand.versuche[id]?.bis) > t));
  if (!bereit) return aktion("BACKOFF", "alle offenen Pakete im Backoff", { erneuern });
  return aktion("STARTEN", `Paket ${bereit}`, { paketId: bereit, erneuern });
}

/** Verbucht das Ende eines Worker-Laufs. fortschritt = nachweisbar (Kopf/Paketstatus/PR geändert), ciGruen: true|false|null. */
export function verbucheErgebnis(zustand, { exit = 1, fortschritt = false, ciGruen = null } = {}, jetzt, cfg = STANDARD) {
  const id = zustand.laufend?.paketId;
  const z = { ...zustand, laufend: null, versuche: { ...zustand.versuche }, gesperrt: [...zustand.gesperrt] };
  if (!id) return { zustand: z, ereignis: "ohne Auftrag" };
  if (exit === 0 && fortschritt && ciGruen !== false) {
    delete z.versuche[id];
    return { zustand: z, ereignis: `Paket ${id} fortgeschritten` };
  }
  const n = (z.versuche[id]?.n || 0) + 1;
  const wartMin = cfg.backoffMin[Math.min(n - 1, cfg.backoffMin.length - 1)];
  z.versuche[id] = { n, bis: new Date(jetzt.getTime() + wartMin * MIN).toISOString() };
  if (n >= cfg.maxVersuche) { z.gesperrt.push(id); return { zustand: z, ereignis: `Paket ${id} gesperrt nach ${n} Versuchen ohne Fortschritt` }; }
  return { zustand: z, ereignis: `Paket ${id} Versuch ${n} ohne Fortschritt (exit ${exit}, CI ${ciGruen}), Backoff ${wartMin} Min` };
}

/* ---------- Lease-Anbindung (echte Git-Lease; Uhr einspeisbar) ---------- */

/** speicher: { lesen() -> {spitze, lease}, schreiben(spitze, lease, text) wirft bei Verlust des CAS }.
    Standard ist der Git-Branch koordination/lease aus koordination.mjs. */
export const gitSpeicher = () => ({ lesen, schreiben });

export function leaseEffekte({ jetzt = () => new Date(), speicher = gitSpeicher() } = {}) {
  const versuche = (a, f) => {
    const { spitze, lease } = speicher.lesen();
    const e = entscheide(lease, jetzt(), a);
    if (!e.ok) return { ok: false, grund: e.grund };
    try { speicher.schreiben(spitze, e.neu, `Lease ${a.aktion}: ${a.halter}`); } catch { return { ok: false, grund: "CAS verloren" }; }
    return { ok: true, lease: e.neu, ...f?.(e) };
  };
  return {
    lesen: () => speicher.lesen().lease,
    uebernehmen: (halter, uebergabe, minuten) => versuche({ aktion: "uebernehmen", halter, uebergabe, minuten }),
    erneuern: (halter, epoche, minuten) => versuche({ aktion: "erneuern", halter, epoche, minuten }),
    freigeben: (halter, epoche) => versuche({ aktion: "freigeben", halter, epoche }),
    pruefen: (halter, epoche) => entscheide(speicher.lesen().lease, jetzt(), { aktion: "pruefen", halter, epoche }).ok,
  };
}

/* ---------- Ein Zyklus mit Effekten ---------- */

/** eff = { lease, worker: { status(), starten(paketId, halter, epoche), beenden() }, kandidaten(), schalterAus(), jetzt(), protokoll(zeile) }.
    Gibt { zustand, aktion } zurück; der Aufrufer speichert den Zustand (atomar) und wartet. */
export function zyklus(eff, zustand, cfg = STANDARD) {
  const jetzt = eff.jetzt();
  let z = { ...zustand };
  /* Worker-Ende (auch nach Prozessende des Supervisors): Ergebnis verbuchen. */
  if (z.laufend) {
    const s = eff.worker.status(z.laufend);
    if (s.laeuft) z.laufend = { ...z.laufend, puls: s.puls };
    else { const v = verbucheErgebnis(z, s.ergebnis || { exit: 1 }, jetzt, cfg); z = v.zustand; eff.protokoll({ ereignis: v.ereignis }); }
  }
  const lease = eff.lease.lesen();
  const plan = planeSchritt({ jetzt, lease, zustand: z, schalterAus: eff.schalterAus(), kandidaten: eff.kandidaten(), cfg });
  eff.protokoll({ aktion: plan.aktion, grund: plan.grund, halter: z.halter, epoche: z.epoche });
  const L = eff.lease;
  switch (plan.aktion) {
    case "UEBERNEHMEN": {
      const r = L.uebernehmen(z.halter, plan.uebergabe, cfg.leaseMin);
      if (r.ok) z.epoche = r.lease.epoche;
      break;
    }
    case "WORKER_BEENDEN": {
      eff.worker.beenden(z.laufend);
      const v = verbucheErgebnis(z, plan.versuchZaehlen ? { exit: 1 } : { exit: 0, fortschritt: false }, jetzt, cfg);
      z = plan.versuchZaehlen ? v.zustand : { ...z, laufend: null };
      break;
    }
    case "WORKER_LAEUFT": case "BACKOFF":
      if (plan.erneuern) L.erneuern(z.halter, z.epoche, cfg.leaseMin);
      break;
    case "STARTEN": {
      const kopf = eff.kopf();
      const schluessel = auftragsSchluessel(plan.paketId, kopf);
      /* Doppelstart-Schutz und Fencing-Doppelprüfung unmittelbar vor dem Start. */
      if (!L.pruefen(z.halter, z.epoche)) { eff.protokoll({ ereignis: "Start abgebrochen: pruefen negativ" }); break; }
      if (plan.erneuern) L.erneuern(z.halter, z.epoche, cfg.leaseMin);
      const w = eff.worker.starten(plan.paketId, z.halter, z.epoche);
      z.laufend = { paketId: plan.paketId, schluessel, kopf, gestartet: jetzt.toISOString(), puls: jetzt.toISOString(), pid: w?.pid ?? null };
      break;
    }
    case "FREIGEBEN":
      if (z.epoche !== null) { const r = L.freigeben(z.halter, z.epoche); if (r.ok) z.epoche = null; }
      break;
    default: break; // WARTEN_*, STOPP*: nur lesen
  }
  return { zustand: z, aktion: plan.aktion, plan };
}

/* ---------- Worker-Adapter (claude -p), nur im scharfen Lauf ---------- */

/** Befehl für einen frischen, begrenzten Lauf. Bewusst OHNE --dangerously-skip-permissions: Berechtigungen kommen aus
    der Projekt-/Nutzerkonfiguration, nicht vom Supervisor. Modell nach Paketart (Routing bleibt Sache der Projektregeln). */
export function claudeBefehl({ paketId, halter, epoche, modell = "opus", maxRunden = 60, promptDatei }) {
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(paketId)) throw new Error("Paket-ID ungültig");
  if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(halter)) throw new Error("Halter ungültig");
  if (!Number.isInteger(epoche)) throw new Error("Epoche fehlt");
  return {
    datei: "claude",
    args: ["-p", `@${promptDatei}`, "--model", modell, "--max-turns", String(maxRunden), "--output-format", "stream-json", "--verbose"],
    umgebung: { CENTRIC_DAUERLAUF_PAKET: paketId, CENTRIC_KOORD_HALTER: halter, CENTRIC_KOORD_EPOCHE: String(epoche) },
  };
}

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function echteEffekte({ halter, zustandsDatei, logDatei, abschalter }) {
  const jetzt = () => new Date();
  const log = (z) => appendFileSync(logDatei, JSON.stringify({ zeit: jetzt().toISOString(), ...z }) + "\n");
  return {
    jetzt, protokoll: log, lease: leaseEffekte({ jetzt }),
    schalterAus: () => process.env.CENTRIC_AUTONOMIE !== "ja" || existsSync(abschalter),
    kandidaten: () => kandidatenAus(),
    kopf: () => execFileSync("git", ["rev-parse", "--short", "origin/integration/release-v4"], { cwd: WURZEL, encoding: "utf8" }).trim(),
    worker: {
      starten(paketId, h, epoche) {
        const promptDatei = path.join(path.dirname(zustandsDatei), `auftrag-${paketId}.md`);
        writeFileSync(promptDatei, `Arbeitspaket ${paketId} aus docs/acc45/work-packages.json bearbeiten. Regeln aus CLAUDE.md/Betreiberentscheidungen gelten unverändert. Schreiben nur mit: node werkzeug/koordination.mjs push --halter ${h} --epoche ${epoche} --minuten ${STANDARD.leaseMin}. Ergebnis: PR gegen integration/release-v4, kein Merge ohne Review und grüne CI.\n`);
        const b = claudeBefehl({ paketId, halter: h, epoche, promptDatei });
        const out = openSync(path.join(path.dirname(zustandsDatei), `worker-${paketId}.log`), "a");
        const k = spawn(b.datei, b.args, { cwd: WURZEL, env: { ...process.env, ...b.umgebung }, stdio: ["ignore", out, out], detached: true, windowsHide: true });
        k.unref();
        return { pid: k.pid };
      },
      status(laufend) {
        const logd = path.join(path.dirname(zustandsDatei), `worker-${laufend.paketId}.log`);
        let lebt = false; try { process.kill(laufend.pid, 0); lebt = true; } catch { /* beendet */ }
        const puls = existsSync(logd) ? statSync(logd).mtime.toISOString() : laufend.puls;
        return { laeuft: lebt, puls, ergebnis: lebt ? null : { exit: 1, fortschritt: false } };
      },
      beenden(laufend) { try { process.kill(laufend.pid); } catch { /* weg */ } },
    },
  };
}

/** Exklusive Sperrdatei: verhindert zwei Supervisor-Prozesse mit gleichem Halter und gleicher Zustandsdatei. */
export function sperreNehmen(datei, pid = process.pid, lebt = (p) => { try { process.kill(p, 0); return true; } catch (e) { return e?.code === "EPERM"; } }) {
  for (let versuch = 0; versuch < 2; versuch++) {
    try { writeFileSync(datei, String(pid), { flag: "wx" }); return true; }
    catch {
      let roh = null; try { roh = readFileSync(datei, "utf8"); } catch { /* weg */ }
      const alt = /^[0-9]+$/.test(roh ?? "") ? Number(roh) : NaN;
      if (Number.isInteger(alt) && alt > 0 && alt !== pid && lebt(alt)) return false;
      /* Nur löschen, wenn die Sperre seit dem Lesen unverändert ist (verkleinert das Rennen zweier Starter). */
      try { if (readFileSync(datei, "utf8") !== roh) return false; unlinkSync(datei); } catch { return false; }
    }
  }
  return false;
}

const speichereZustand = (datei, z) => { const t = `${datei}.tmp`; writeFileSync(t, JSON.stringify(z, null, 2)); renameSync(t, datei); };

function haupt(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const halter = arg("--halter") || "dauerlauf-probe";
  if (!argv.includes("--scharf")) {
    const lease = leaseEffekte().lesen();
    const plan = planeSchritt({ jetzt: new Date(), lease, zustand: leererZustand(halter), schalterAus: false, kandidaten: kandidatenAus() });
    console.log(argv.includes("--json") ? JSON.stringify(plan, null, 2) : `PLAN (nur Anzeige, nichts geschrieben): ${plan.aktion}: ${plan.grund}`);
    return 0;
  }
  if (process.env.CENTRIC_AUTONOMIE !== "ja") { console.error("ABGELEHNT: scharfer Lauf braucht CENTRIC_AUTONOMIE=ja (Betreiberfreigabe)"); return 1; }
  const dir = process.env.CENTRIC_AUTONOMIE_DIR || path.join(process.env.LOCALAPPDATA || WURZEL, "centric-dauerlauf");
  mkdirSync(dir, { recursive: true });
  const zustandsDatei = path.join(dir, "zustand.json");
  const sperre = path.join(dir, "sperre.lock");
  if (!sperreNehmen(sperre)) { console.error("ABGELEHNT: ein anderer Supervisor-Prozess läuft (Sperrdatei)"); return 1; }
  process.on("exit", () => { try { unlinkSync(sperre); } catch { /* egal */ } });
  const eff = echteEffekte({ halter, zustandsDatei, logDatei: path.join(dir, "protokoll.jsonl"), abschalter: path.join(dir, "AUTONOMIE-AUS") });
  let z = existsSync(zustandsDatei) ? JSON.parse(readFileSync(zustandsDatei, "utf8")) : leererZustand(halter);
  if (z.halter !== halter) { console.error("ABGELEHNT: Zustandsdatei gehört zu anderem Halter"); return 1; }
  const zyklen = Number(arg("--zyklen") || 1);
  for (let i = 0; i < zyklen; i++) { z = zyklus(eff, z).zustand; speichereZustand(zustandsDatei, z); }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = haupt(process.argv.slice(2));
