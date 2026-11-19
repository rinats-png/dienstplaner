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
       Worker: je Arbeitspaket ein frischer `claude -p`-Lauf (eigener Kontext) in einer geschützten
               Worker-Arbeitskopie (werkzeug/dauerlauf-schutz.mjs). Er schreibt nur über
               `koordination.mjs push --halter --epoche` (Fencing, atomar mit der Lease, Einmalmarke).
       Prozesse: werkzeug/dauerlauf-prozess.mjs (Pfadauflösung, Prozessbaum, PID-Identität).

   Sicherheitsregeln (fail-closed, in dieser Reihenfolge):
     1. Abschalter/Notaus (Datei AUTONOMIE-AUS oder Umgebung CENTRIC_AUTONOMIE != ja) -> Worker beenden, Lease freigeben.
     2. Lease unlesbar -> STOPP. Fremde gültige Lease -> nur warten (nie übernehmen, nie umgehen).
     3. Übernahme nur über entscheide() (abgelaufen/freigegeben, eigene Kennung, Übergabetext).
     4. Start eines Workers nur nach `pruefen` (Epoche) UND ohne laufenden Auftrag gleichen Schlüssels.
     5. Schreibrecht verloren (Epoche/Zone/Ablauf) -> laufender Worker wird sofort beendet.
     6. Je Paket höchstens `maxVersuche` Läufe ohne nachweisbaren Fortschritt, mit Backoff; danach gesperrt.
        Fortschritt misst der Supervisor selbst (Integrationskopf, SSOT, PR-Zustand), nie die Selbstauskunft.
     7. Harte Nutzungsgrenzen (Starts je Tag/gesamt, Läufe je Paket, Laufzeit je Worker, Wallclock je Tag, UTC):
        Überschreitung -> keine Starts, Eskalation, Lease freigeben. Ohne Limits kein scharfer Start.
     8. Kein freigegebenes Paket (nur READY/IN_PROGRESS, nicht extern/bedingt/BLOCKED) -> Lease freigeben, Leerlauf.

   Aufruf (Standard = nur Plan ausgeben, schreibt nichts):
     node werkzeug/dauerlauf.mjs [--halter H] [--json]
   Worker-Kopie einrichten (nur lokale Git-Konfiguration DIESER Kopie):
     node werkzeug/dauerlauf.mjs --worker-kopie-einrichten <pfad>
   Scharf (nur auf ausdrückliche Betreiberfreigabe, siehe docs/acc45/AUTONOMIE-ARCHITEKTUR.md §9):
     CENTRIC_AUTONOMIE=ja node werkzeug/dauerlauf.mjs --scharf --halter dauerlauf-<kennung> --worker-kopie <pfad>
       --limit-starts-tag N --limit-starts-gesamt N --limit-laeufe-paket N --limit-laufzeit-min N --limit-wall-min-tag N
       [--zyklen N] [--intervall-ms 180000]
   Testmodus (nur mit lokalem Bare-Remote in KOORD_REMOTE): CENTRIC_DAUERLAUF_TESTWORKER=<node-Skript> ersetzt claude,
     CENTRIC_DAUERLAUF_UHRDATEI=<Datei mit ISO-Zeit> ersetzt die Uhr, gh wird nicht benutzt.
   ========================================================================== */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entscheide, lesen, schreiben } from "./koordination.mjs";
import { naechste } from "./naechstes-paket.mjs";
import { paketeAus } from "./acc45-backlog.mjs";
import { prozessAdapter, loeseBefehl, startPlan, optionenPruefen } from "./dauerlauf-prozess.mjs";
import { pruefeWorkerKopie, richteWorkerKopieEin, workerUmgebung } from "./dauerlauf-schutz.mjs";

const MIN = 60000;
export const STANDARD = Object.freeze({
  leaseMin: 20,          // kurze Lease: nach Prozessende höchstens ~22 Min Stillstand
  erneuernUnterMin: 10,  // erneuern, wenn weniger als 10 Min Restlaufzeit
  haengMin: 20,          // kein Puls seit 20 Min -> Worker gilt als hängend (nicht größer als leaseMin)
  maxVersuche: 3,        // Läufe je Paket ohne Fortschritt
  backoffMin: [5, 15, 45],
  kandidaten: 20,
  /* Konservative Nutzungsgrenzen (für Plan und Tests). Im scharfen Lauf ist JEDES Limit Pflichtparameter. */
  limits: Object.freeze({ startsTag: 4, startsGesamt: 20, laeufeJePaket: 3, laufzeitMin: 90, wallMinTag: 240 }),
});
/** Obergrenzen, über die auch ein ausdrücklicher Parameter nicht hinausgehen darf. */
export const LIMIT_MAX = Object.freeze({ startsTag: 24, startsGesamt: 200, laeufeJePaket: 10, laufzeitMin: 240, wallMinTag: 960 });
const LIMIT_ARGS = Object.freeze({ startsTag: "--limit-starts-tag", startsGesamt: "--limit-starts-gesamt", laeufeJePaket: "--limit-laeufe-paket", laufzeitMin: "--limit-laufzeit-min", wallMinTag: "--limit-wall-min-tag" });

/* ---------- Reiner Kern (ohne I/O) ---------- */

export const leererZustand = (halter) => ({ halter, epoche: null, laufend: null, versuche: {}, gesperrt: [], nutzung: null });
export const auftragsSchluessel = (paketId, kopf) => `${paketId}@${kopf}`;

/** Wählt aus der SSOT die freigegebenen, ausführbaren Pakete (READY/IN_PROGRESS, nicht extern/bedingt/BLOCKED). */
export const kandidatenAus = (pakete, n = STANDARD.kandidaten) => naechste(paketeAus(pakete), n).map((x) => x.id);

const aktion = (name, grund, extra = {}) => ({ aktion: name, grund, ...extra });

/* ----- Nutzungsgrenzen ----- */

const utcTag = (t) => new Date(t).toISOString().slice(0, 10);

/** Zähler auf den aktuellen UTC-Tag gebracht (Tageswechsel setzt Tageszähler zurück, Gesamtzähler bleiben). */
export function nutzungAm(nutzung, jetzt) {
  const tag = utcTag(jetzt.getTime());
  const n = nutzung || {};
  const gleich = n.tag === tag;
  return { tag, startsTag: gleich ? n.startsTag || 0 : 0, wallMsTag: gleich ? n.wallMsTag || 0 : 0, startsGesamt: n.startsGesamt || 0, laeufeJePaket: { ...(n.laeufeJePaket || {}) } };
}

/** Zählt einen Startversuch (auch einen gescheiterten). */
export function zaehleStart(nutzung, jetzt, paketId) {
  const n = nutzungAm(nutzung, jetzt);
  return { ...n, startsTag: n.startsTag + 1, startsGesamt: n.startsGesamt + 1, laeufeJePaket: { ...n.laeufeJePaket, [paketId]: (n.laeufeJePaket[paketId] || 0) + 1 } };
}

/** Verbucht die Laufzeit eines beendeten Workers auf den aktuellen UTC-Tag (nur der Anteil ab Tagesbeginn). */
export function zaehleLaufzeit(nutzung, jetzt, laufend) {
  const n = nutzungAm(nutzung, jetzt);
  const beginn = Math.max(Date.parse(laufend?.gestartet), Date.parse(`${n.tag}T00:00:00Z`));
  return Number.isFinite(beginn) ? { ...n, wallMsTag: n.wallMsTag + Math.max(0, jetzt.getTime() - beginn) } : n;
}

/** Erster Grund, warum KEIN neuer Start erlaubt ist (global), sonst null. Ohne Limits immer gesperrt. */
export function startGrenze({ nutzung, jetzt, limits }) {
  if (!limits) return "keine Nutzungsgrenzen gesetzt (ohne Limit kein Start)";
  const n = nutzungAm(nutzung, jetzt);
  if (n.startsGesamt >= limits.startsGesamt) return `Gesamtlimit ${limits.startsGesamt} Worker-Starts erreicht`;
  if (n.startsTag >= limits.startsTag) return `Tageslimit ${limits.startsTag} Worker-Starts (UTC ${n.tag}) erreicht`;
  if (n.wallMsTag >= limits.wallMinTag * MIN) return `Wallclock-Limit ${limits.wallMinTag} Min (UTC ${n.tag}) erreicht`;
  return null;
}

/** Prüft die Limit-Parameter des scharfen Laufs: jedes Limit Pflicht, positive Ganzzahl, höchstens LIMIT_MAX. */
export function limitsAusArgs(argv) {
  const limits = {}; const fehler = [];
  for (const [k, name] of Object.entries(LIMIT_ARGS)) {
    const i = argv.indexOf(name);
    const roh = i >= 0 ? argv[i + 1] : undefined;
    const v = Number(roh);
    if (roh === undefined) fehler.push(`${name} fehlt`);
    else if (!/^[0-9]+$/.test(roh) || !Number.isInteger(v) || v < 1) fehler.push(`${name} muss eine positive Ganzzahl sein`);
    else if (v > LIMIT_MAX[k]) fehler.push(`${name} höchstens ${LIMIT_MAX[k]}`);
    else limits[k] = v;
  }
  return fehler.length ? { ok: false, fehler } : { ok: true, limits };
}

/* ----- Fortschritt: der Supervisor misst selbst ----- */

const RANG = Object.freeze({ BLOCKED: 0, READY: 1, IN_PROGRESS: 2, REVIEW: 3, CI_FAILED: 3, INTEGRATED: 4, VERIFIED: 5, DONE: 6 });

/** Reine Bewertung zweier Messungen eines Pakets. messung = {
      kopf: Integrationskopf (SHA) | null,
      paket: { status, pr: ["#12", …] } | null       (SSOT am Integrationskopf)
      prs: [{ nummer, zustand: OPEN|MERGED|CLOSED, kopf: headSha, ciGruen: true|false|null }] | null (gh; null = unbekannt) }
    Fortschritt nur mit Beleg: neuer offener/gemergter PR, neue Commits auf einem offenen PR, Merge, oder ein SSOT-Schritt
    am geänderten Integrationskopf, der (falls PR-Daten vorliegen) durch einen nicht geschlossenen PR gedeckt ist.
    Scheinfortschritt (wird NICHT gezählt): geschlossener PR, Status rückwärts, SSOT-PR ohne existierenden PR,
    Statussprung ohne PR-Beleg. Ein geänderter Integrationskopf allein ist kein Fortschritt des Pakets. */
export function fortschritt(vorher, nachher) {
  const gruende = []; const schein = []; const hinweise = [];
  if (!vorher || !nachher) return { fortschritt: false, ciGruen: null, gruende, schein: ["Messung fehlt (fail-closed)"], hinweise };
  const prsDa = Array.isArray(nachher.prs);
  const alt = new Map((vorher.prs || []).map((p) => [p.nummer, p]));
  const belege = [];
  for (const p of nachher.prs || []) {
    const a = alt.get(p.nummer);
    if (p.zustand === "CLOSED") { if (a?.zustand !== "CLOSED") schein.push(`PR #${p.nummer} geschlossen ohne Merge`); continue; }
    if (!a) { gruende.push(`neuer PR #${p.nummer} (${p.zustand})`); belege.push(p); continue; }
    if (a.zustand === "OPEN" && p.zustand === "MERGED") { gruende.push(`PR #${p.nummer} gemergt`); belege.push(p); continue; }
    if (p.zustand === "OPEN" && a.kopf && p.kopf && a.kopf !== p.kopf) { gruende.push(`PR #${p.nummer} hat neue Commits`); belege.push(p); }
  }
  const kopfNeu = Boolean(vorher.kopf && nachher.kopf && vorher.kopf !== nachher.kopf);
  const rv = RANG[vorher.paket?.status] ?? -1; const rn = RANG[nachher.paket?.status] ?? -1;
  const prAlt = new Set(vorher.paket?.pr || []);
  const prNeu = (nachher.paket?.pr || []).filter((x) => !prAlt.has(x));
  const lebendePr = new Set((nachher.prs || []).filter((p) => p.zustand !== "CLOSED").map((p) => `#${p.nummer}`));
  for (const x of prNeu) {
    if (prsDa && !lebendePr.has(x)) schein.push(`SSOT nennt ${x}, aber kein offener oder gemergter PR existiert`);
    else if (kopfNeu) gruende.push(`SSOT: ${x} eingetragen`);
  }
  if (rn < rv) schein.push(`Status rückwärts ${vorher.paket?.status} -> ${nachher.paket?.status}`);
  if (rn > rv) {
    const gedeckt = kopfNeu && (!prsDa || lebendePr.size > 0);
    if (gedeckt) gruende.push(`SSOT-Status ${vorher.paket?.status} -> ${nachher.paket?.status}`);
    else schein.push(`Statussprung ${vorher.paket?.status} -> ${nachher.paket?.status} ohne Beleg (Kopf ${kopfNeu ? "neu" : "unverändert"}, PR ${prsDa ? "keiner" : "unbekannt"})`);
  }
  if (kopfNeu && !gruende.length) hinweise.push("Integrationskopf geändert, aber nicht für dieses Paket");
  const offen = belege.filter((p) => p.zustand === "OPEN");
  const ciGruen = offen.some((p) => p.ciGruen === false) ? false : offen.length && offen.every((p) => p.ciGruen === true) ? true : belege.some((p) => p.zustand === "MERGED") && !offen.length ? true : null;
  return { fortschritt: gruende.length > 0, ciGruen, gruende, schein, hinweise };
}

/** PRs eines Pakets aus einer gh-Liste: Paket-ID im Titel oder Branch (exakt, nicht WP-16 in WP-16c) oder in der SSOT-PR-Liste. */
export function prsFuerPaket(liste, paketId, ssotPrs = []) {
  const esc = paketId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, "i");
  const nummern = new Set(ssotPrs.map((x) => Number(String(x).replace(/^#/, ""))));
  return (liste || []).filter((p) => re.test(p.title || "") || re.test(p.headRefName || "") || nummern.has(p.number)).map((p) => {
    const c = (p.statusCheckRollup || []).map((s) => s.conclusion || s.state || "");
    const ciGruen = !c.length ? null : c.some((x) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(x)) ? false : c.every((x) => ["SUCCESS", "SKIPPED", "NEUTRAL"].includes(x)) ? true : null;
    return { nummer: p.number, zustand: p.state, kopf: p.headRefOid || null, ciGruen };
  });
}

/* ----- Entscheidung ----- */

/** Genau eine Aktion je Zyklus. Kein I/O, jede Zeit wird übergeben. */
export function planeSchritt({ jetzt, lease, zustand, schalterAus = false, kandidaten = [], cfg = STANDARD }) {
  const t = jetzt.getTime();
  const ich = zustand.halter;
  const limits = cfg.limits;
  const probe = entscheide(lease, jetzt, { aktion: "uebernehmen", halter: ich, uebergabe: "Dauerlauf Pruefung (nur lesend)" });
  const unlesbar = Boolean(lease) && !probe.ok && /unlesbar|beschädigt/.test(probe.grund);
  const pulsAlterLaufend = zustand.laufend ? t - Date.parse(zustand.laufend.puls) : 0;
  const schreibrecht = !unlesbar && zustand.epoche !== null && entscheide(lease, jetzt, { aktion: "pruefen", halter: ich, epoche: zustand.epoche }).ok;

  /* Ein laufender Worker wird zuerst beendet: bei verlorenem Schreibrecht, unlesbarer Lease, Abschalter oder Limit. */
  if (zustand.laufend && !schreibrecht) return aktion("WORKER_BEENDEN", unlesbar ? "Lease unlesbar (fail-closed)" : "Schreibrecht verloren (Epoche, Zone oder Ablauf)", { versuchZaehlen: !unlesbar && pulsAlterLaufend >= Math.min(cfg.leaseMin, cfg.haengMin) * MIN });
  if (zustand.laufend && schalterAus) return aktion("WORKER_BEENDEN", "Abschalter gesetzt", { versuchZaehlen: false });
  if (zustand.laufend) {
    const laufMs = t - Date.parse(zustand.laufend.gestartet);
    if (!limits || laufMs >= limits.laufzeitMin * MIN) return aktion("WORKER_BEENDEN", `Laufzeitlimit ${limits?.laufzeitMin ?? "?"} Min je Worker überschritten`, { versuchZaehlen: true, eskalation: true });
    const n = zaehleLaufzeit(zustand.nutzung, jetzt, zustand.laufend);
    if (n.wallMsTag >= limits.wallMinTag * MIN) return aktion("WORKER_BEENDEN", `Wallclock-Limit ${limits.wallMinTag} Min je Tag (UTC ${n.tag}) erreicht`, { versuchZaehlen: false, eskalation: true });
  }
  if (unlesbar) return aktion("STOPP_FAILCLOSED", probe.grund);
  /* Abschalter: danach Lease freigeben. */
  if (schalterAus) return aktion(schreibrecht ? "FREIGEBEN" : "STOPP", "Abschalter gesetzt");
  /* Harte Nutzungsgrenze: keine Starts, Lease freigeben, nie (wieder) übernehmen. */
  if (!zustand.laufend) {
    const grenze = startGrenze({ nutzung: zustand.nutzung, jetzt, limits });
    if (grenze) return schreibrecht ? aktion("FREIGEBEN", grenze, { eskalation: true, limit: true }) : aktion("WARTEN_LIMIT", grenze, { limit: true });
  }
  const n = nutzungAm(zustand.nutzung, jetzt);
  const paketFrei = (id) => !zustand.gesperrt.includes(id) && (n.laeufeJePaket[id] || 0) < (limits?.laeufeJePaket ?? 0);
  const offenKandidaten = kandidaten.filter(paketFrei);

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
  if (!offenKandidaten.length) return aktion("FREIGEBEN", "alle freigegebenen Pakete gesperrt oder Läufe je Paket erschöpft: Eskalation an Betreiber", { eskalation: true });
  const bereit = offenKandidaten.find((id) => !(Date.parse(zustand.versuche[id]?.bis) > t));
  if (!bereit) return aktion("BACKOFF", "alle offenen Pakete im Backoff", { erneuern });
  return aktion("STARTEN", `Paket ${bereit}`, { paketId: bereit, erneuern });
}

/** Verbucht das Ende eines Worker-Laufs. fortschritt = vom Supervisor gemessen, ciGruen: true|false|null.
    exit null = unbekannt (etwa nach Neustart des Supervisors); entscheidend ist dann die Messung. */
export function verbucheErgebnis(zustand, { exit = 1, fortschritt = false, ciGruen = null } = {}, jetzt, cfg = STANDARD) {
  const id = zustand.laufend?.paketId;
  const z = { ...zustand, laufend: null, versuche: { ...zustand.versuche }, gesperrt: [...zustand.gesperrt] };
  if (!id) return { zustand: z, ereignis: "ohne Auftrag" };
  if ((exit === 0 || exit === null) && fortschritt && ciGruen !== false) {
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

/** eff = { lease, worker: { status(), starten(paketId, halter, epoche) -> {ok,pid,…}, beenden() }, kandidaten(), schalterAus(),
    jetzt(), protokoll(zeile), kopf(), messen?(paketId), eskalieren?(grund) }.
    Ist eff.messen vorhanden, entscheidet allein die Messung über Fortschritt (Selbstauskunft des Workers wird verworfen).
    Gibt { zustand, aktion } zurück; der Aufrufer speichert den Zustand (atomar) und wartet. */
export function zyklus(eff, zustand, cfg = STANDARD) {
  const jetzt = eff.jetzt();
  let z = { ...zustand };
  const abschliessen = (ergebnis) => {
    const laufend = z.laufend;
    const v = verbucheErgebnis(z, ergebnis, jetzt, cfg);
    z = { ...v.zustand, nutzung: zaehleLaufzeit(z.nutzung, jetzt, laufend) };
    eff.protokoll({ ereignis: v.ereignis });
  };
  /* Worker-Ende (auch nach Prozessende des Supervisors): Ergebnis verbuchen. */
  if (z.laufend) {
    const s = eff.worker.status(z.laufend);
    if (s.laeuft) z.laufend = { ...z.laufend, puls: s.puls ?? z.laufend.puls };
    else {
      let ergebnis = s.ergebnis || { exit: 1 };
      if (eff.messen) {
        const f = fortschritt(z.laufend.messung, eff.messen(z.laufend.paketId));
        eff.protokoll({ messung: f, selbstauskunftVerworfen: s.ergebnis?.fortschritt !== undefined });
        ergebnis = { exit: s.ergebnis?.exit ?? null, fortschritt: f.fortschritt, ciGruen: f.ciGruen };
      }
      abschliessen(ergebnis);
    }
  }
  const lease = eff.lease.lesen();
  const plan = planeSchritt({ jetzt, lease, zustand: z, schalterAus: eff.schalterAus(), kandidaten: eff.kandidaten(), cfg });
  eff.protokoll({ aktion: plan.aktion, grund: plan.grund, halter: z.halter, epoche: z.epoche });
  if (plan.eskalation) eff.eskalieren?.(plan.grund);
  const L = eff.lease;
  switch (plan.aktion) {
    case "UEBERNEHMEN": {
      const r = L.uebernehmen(z.halter, plan.uebergabe, cfg.leaseMin);
      if (r.ok) z.epoche = r.lease.epoche;
      break;
    }
    case "WORKER_BEENDEN": {
      const b = eff.worker.beenden(z.laufend);
      if (b && b.beendet === false) eff.protokoll({ ereignis: `Worker nicht beendet: ${b.grund}` });
      if (plan.versuchZaehlen) abschliessen({ exit: 1 });
      else z = { ...z, laufend: null, nutzung: zaehleLaufzeit(z.nutzung, jetzt, z.laufend) };
      break;
    }
    case "WORKER_LAEUFT": case "BACKOFF":
      if (plan.erneuern) { const r = L.erneuern(z.halter, z.epoche, cfg.leaseMin); if (!r.ok) eff.protokoll({ ereignis: `Erneuern fehlgeschlagen: ${r.grund}` }); }
      break;
    case "STARTEN": {
      const kopf = eff.kopf();
      const schluessel = auftragsSchluessel(plan.paketId, kopf);
      /* Doppelstart-Schutz und Fencing-Doppelprüfung unmittelbar vor dem Start. */
      if (!L.pruefen(z.halter, z.epoche)) { eff.protokoll({ ereignis: "Start abgebrochen: pruefen negativ" }); break; }
      if (plan.erneuern) L.erneuern(z.halter, z.epoche, cfg.leaseMin);
      const messung = eff.messen ? eff.messen(plan.paketId) : null;
      z.nutzung = zaehleStart(z.nutzung, jetzt, plan.paketId); // jeder Startversuch zählt, auch ein gescheiterter
      let w;
      try { w = eff.worker.starten(plan.paketId, z.halter, z.epoche); } catch (e) { w = { ok: false, grund: e.message }; }
      const laufend = { paketId: plan.paketId, schluessel, kopf, gestartet: jetzt.toISOString(), puls: jetzt.toISOString(), pid: w?.pid ?? null, startzeit: w?.startzeit ?? null, merkmal: w?.merkmal ?? null, exitDatei: w?.exitDatei ?? null, messung };
      if (!w || w.ok === false) {
        /* Startfehler: kein Absturz, gezählter Fehlversuch mit Backoff. */
        eff.protokoll({ ereignis: `Start fehlgeschlagen: ${w?.grund ?? "unbekannt"}` });
        z.laufend = laufend;
        abschliessen({ exit: 1 });
        break;
      }
      z.laufend = laufend;
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

/** Befehl für einen frischen Lauf. Bewusst OHNE --dangerously-skip-permissions: Berechtigungen kommen aus der
    Projekt-/Nutzerkonfiguration (Vorschlag: docs/acc45/AUTONOMIE-ALLOWLIST-VORSCHLAG.json), nicht vom Supervisor.
    Der Auftrag kommt über stdin (kein `-p @datei`, keine Annahme über das Einlesen von Dateien). Nur Optionen, die
    `claude --help` (2.1.328) nennt; `--max-turns` steht dort nicht und wird deshalb nur auf ausdrücklichen Wunsch
    gesetzt. Die harte Grenze ist das Laufzeitlimit des Supervisors. */
export function claudeBefehl({ paketId, halter, epoche, modell = "opus", maxRunden = null, maxBudgetUsd = null }) {
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(paketId)) throw new Error("Paket-ID ungültig");
  if (!/^[a-z0-9][a-z0-9_-]{1,40}$/.test(halter)) throw new Error("Halter ungültig");
  if (!Number.isInteger(epoche)) throw new Error("Epoche fehlt");
  if (!/^[a-z0-9.-]{1,40}$/.test(modell)) throw new Error("Modell ungültig");
  const args = ["-p", "--model", modell, "--output-format", "stream-json", "--verbose"];
  if (maxRunden !== null) { if (!Number.isInteger(maxRunden) || maxRunden < 1) throw new Error("maxRunden ungültig"); args.push("--max-turns", String(maxRunden)); }
  if (maxBudgetUsd !== null) { if (!(Number(maxBudgetUsd) > 0)) throw new Error("Budget ungültig"); args.push("--max-budget-usd", String(Number(maxBudgetUsd))); }
  return {
    datei: "claude",
    args,
    umgebung: { CENTRIC_DAUERLAUF_PAKET: paketId, CENTRIC_KOORD_HALTER: halter, CENTRIC_KOORD_EPOCHE: String(epoche) },
  };
}

export const auftragsText = (paketId, halter, epoche) => `Arbeitspaket ${paketId} aus docs/acc45/work-packages.json bearbeiten. Regeln aus CLAUDE.md/Betreiberentscheidungen gelten unverändert. `
  + `Schreiben (Push) nur mit: node werkzeug/koordination.mjs push --halter ${halter} --epoche ${epoche} --minuten ${STANDARD.leaseMin} --ziel refs/heads/<arbeitsbranch>; `
  + "direktes git push ist gesperrt. Ergebnis: PR gegen integration/release-v4, kein Merge ohne Review und grüne CI.\n";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remoteName = () => process.env.KOORD_REMOTE || "origin";

/** Testmodus nur mit lokalem Bare-Remote: KOORD_REMOTE zeigt auf ein vorhandenes Verzeichnis. */
export const istTestmodus = (env = process.env) => Boolean(env.KOORD_REMOTE) && existsSync(env.KOORD_REMOTE) && existsSync(path.join(env.KOORD_REMOTE, "HEAD"));

/** Integrationskopf und SSOT dort, über einen temporären Ref (wie koordination.lesen). null bei Fehler. */
function ssotAmKopf(zweig = "integration/release-v4") {
  const tmp = `refs/dauerlauf/tmp/${process.pid}-${Date.now()}`;
  const git = (a) => execFileSync("git", a, { cwd: WURZEL, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }).trim();
  try {
    git(["fetch", "--quiet", "--no-tags", remoteName(), `refs/heads/${zweig}:${tmp}`, "--force"]);
    const kopf = git(["rev-parse", tmp]);
    let pakete = null;
    try { pakete = JSON.parse(git(["show", `${tmp}:docs/acc45/work-packages.json`])).pakete; } catch { /* SSOT fehlt */ }
    return { kopf, pakete };
  } catch { return null; } finally { try { git(["update-ref", "-d", tmp]); } catch { /* egal */ } }
}

function ghListe() {
  try {
    return JSON.parse(execFileSync("gh", ["pr", "list", "--state", "all", "--limit", "200", "--json", "number,state,headRefOid,headRefName,title,statusCheckRollup"], { cwd: WURZEL, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }));
  } catch { return null; }
}

/** Messung für ein Paket aus Integrationskopf, SSOT und (optional) gh. */
export function messeFortschritt(paketId, { ssot = ssotAmKopf, gh = ghListe } = {}) {
  const s = ssot();
  const p = s?.pakete?.find((x) => x.id === paketId) || null;
  const paket = p ? { status: p.status, pr: Array.isArray(p.pr) ? p.pr : [] } : null;
  const liste = gh ? gh() : null;
  return { kopf: s?.kopf ?? null, paket, prs: liste ? prsFuerPaket(liste, paketId, paket?.pr || []) : null };
}

function echteEffekte({ zustandsDatei, logDatei, abschalter, eskalationsDatei, workerKopie, test }) {
  const dir = path.dirname(zustandsDatei);
  const jetzt = test?.uhrDatei ? () => new Date(readFileSync(test.uhrDatei, "utf8").trim()) : () => new Date();
  const log = (z) => appendFileSync(logDatei, JSON.stringify({ zeit: jetzt().toISOString(), ...z }) + "\n");
  const prozess = prozessAdapter();
  let hilfeGeprueft = null;
  const logVon = (paketId) => path.join(dir, `worker-${paketId}.log`);
  return {
    jetzt, protokoll: log, lease: leaseEffekte({ jetzt }),
    eskalieren: (grund) => appendFileSync(eskalationsDatei, JSON.stringify({ zeit: jetzt().toISOString(), grund }) + "\n"),
    schalterAus: () => process.env.CENTRIC_AUTONOMIE !== "ja" || existsSync(abschalter),
    kandidaten: () => { const s = ssotAmKopf(); return s?.pakete ? kandidatenAus(s.pakete) : []; },
    kopf: () => ssotAmKopf()?.kopf ?? "unbekannt",
    messen: (paketId) => messeFortschritt(paketId, { gh: test ? null : ghListe }),
    worker: {
      starten(paketId, h, epoche) {
        const schutz = pruefeWorkerKopie(workerKopie);
        if (!schutz.ok) return { ok: false, grund: `Worker-Kopie ungeschützt: ${schutz.maengel.join("; ")}` };
        let befehl = claudeBefehl({ paketId, halter: h, epoche });
        if (test?.worker) befehl = { datei: process.execPath, args: [test.worker] };
        else {
          if (hilfeGeprueft === null) {
            const plan = startPlan(loeseBefehl("claude"), ["--help"]);
            let hilfe = "";
            try { hilfe = plan.ok ? execFileSync(plan.datei, plan.args, { encoding: "utf8", timeout: 60000, windowsHide: true, ...plan.optionen }) : ""; } catch { hilfe = ""; }
            hilfeGeprueft = optionenPruefen(hilfe, befehl.args);
          }
          if (!hilfeGeprueft.ok) return { ok: false, grund: `claude kennt Optionen nicht: ${hilfeGeprueft.fehlend.join(", ") || "Hilfe nicht lesbar"}` };
        }
        return prozess.starten({ befehl, cwd: workerKopie, env: workerUmgebung(process.env, { paketId, halter: h, epoche }), eingabe: auftragsText(paketId, h, epoche), logDatei: logVon(paketId) });
      },
      status(laufend) {
        const s = prozess.status(laufend);
        const logd = logVon(laufend.paketId);
        return { ...s, puls: existsSync(logd) ? statSync(logd).mtime.toISOString() : laufend.puls };
      },
      beenden: (laufend) => prozess.beenden(laufend),
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
const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

async function haupt(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const halter = arg("--halter") || "dauerlauf-probe";
  if (argv.includes("--worker-kopie-einrichten")) {
    const r = richteWorkerKopieEin(path.resolve(arg("--worker-kopie-einrichten") || ""));
    console.log(r.ok ? "OK: Worker-Kopie geschützt (nur lokale Konfiguration dieser Kopie)" : `FEHLER: ${r.maengel.join("; ")}`);
    return r.ok ? 0 : 1;
  }
  if (!argv.includes("--scharf")) {
    const lease = leaseEffekte().lesen();
    const plan = planeSchritt({ jetzt: new Date(), lease, zustand: leererZustand(halter), schalterAus: false, kandidaten: kandidatenAus() });
    console.log(argv.includes("--json") ? JSON.stringify(plan, null, 2) : `PLAN (nur Anzeige, nichts geschrieben): ${plan.aktion}: ${plan.grund}`);
    return 0;
  }
  if (process.env.CENTRIC_AUTONOMIE !== "ja") { console.error("ABGELEHNT: scharfer Lauf braucht CENTRIC_AUTONOMIE=ja (Betreiberfreigabe)"); return 1; }
  const l = limitsAusArgs(argv);
  if (!l.ok) { console.error(`ABGELEHNT: ohne vollständige Limits kein Start: ${l.fehler.join("; ")}`); return 1; }
  const test = istTestmodus() ? { worker: process.env.CENTRIC_DAUERLAUF_TESTWORKER || null, uhrDatei: process.env.CENTRIC_DAUERLAUF_UHRDATEI || null } : null;
  if (!test && (process.env.CENTRIC_DAUERLAUF_TESTWORKER || process.env.CENTRIC_DAUERLAUF_UHRDATEI)) { console.error("ABGELEHNT: Testworker/Testuhr nur mit lokalem Bare-Remote (KOORD_REMOTE)"); return 1; }
  const workerKopie = arg("--worker-kopie") ? path.resolve(arg("--worker-kopie")) : null;
  const schutz = pruefeWorkerKopie(workerKopie);
  if (!schutz.ok) { console.error(`ABGELEHNT: Worker-Kopie nicht geschützt: ${schutz.maengel.join("; ")} (einrichten: --worker-kopie-einrichten <pfad>)`); return 1; }
  const intervall = Number(arg("--intervall-ms") || 180000);
  if (!Number.isFinite(intervall) || intervall < (test ? 50 : 60000)) { console.error("ABGELEHNT: --intervall-ms zu klein"); return 1; }
  const dir = process.env.CENTRIC_AUTONOMIE_DIR || path.join(process.env.LOCALAPPDATA || WURZEL, "centric-dauerlauf");
  mkdirSync(dir, { recursive: true });
  const zustandsDatei = path.join(dir, "zustand.json");
  const sperre = path.join(dir, "sperre.lock");
  if (!sperreNehmen(sperre)) { console.error("ABGELEHNT: ein anderer Supervisor-Prozess läuft (Sperrdatei)"); return 1; }
  process.on("exit", () => { try { unlinkSync(sperre); } catch { /* egal */ } });
  const eff = echteEffekte({ zustandsDatei, logDatei: path.join(dir, "protokoll.jsonl"), eskalationsDatei: path.join(dir, "eskalation.jsonl"), abschalter: path.join(dir, "AUTONOMIE-AUS"), workerKopie, test });
  let z = existsSync(zustandsDatei) ? JSON.parse(readFileSync(zustandsDatei, "utf8")) : leererZustand(halter);
  if (z.halter !== halter) { console.error("ABGELEHNT: Zustandsdatei gehört zu anderem Halter"); return 1; }
  const cfg = { ...STANDARD, limits: l.limits };
  const zyklen = Number(arg("--zyklen") || 1);
  for (let i = 0; i < zyklen; i++) {
    try { z = zyklus(eff, z, cfg).zustand; speichereZustand(zustandsDatei, z); }
    catch (e) { eff.protokoll({ aktion: "FEHLER", grund: String(e?.message || e).split("\n")[0] }); } // fail-closed: nichts getan, nächster Zyklus liest neu
    if (i < zyklen - 1) await schlafen(intervall);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) haupt(process.argv.slice(2)).then((c) => { process.exitCode = c; });
