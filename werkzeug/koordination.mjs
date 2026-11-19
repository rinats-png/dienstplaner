/* ==========================================================================
   KOORDINATION — atomare Schreib-Lease für CENTRIC.

   Es gibt genau einen schreibenden Koordinator. Der Zustand liegt als
   Datei lease.json im Branch `koordination/lease` des Remotes. Jede Änderung
   ist ein neuer Commit auf der bisherigen Spitze und wird OHNE Force gepusht:
   Git lehnt den Push ab, wenn die Spitze inzwischen weitergewandert ist
   (Compare-and-Swap). Zwei gleichzeitige Übernahmen können deshalb nie beide
   gelingen. Der Verlierer liest neu und entscheidet erneut.

   Felder: epoche (zählt je Übernahme hoch), halter, uebernommen_am,
   erneuert_am, gueltig_bis, uebergabe (Begründung/Beleg der Übergabe),
   vorgaenger (Halter vor der Übernahme), freigegeben_am.

   Regeln:
   - Übernahme nur, wenn (a) keine Lease existiert, (b) sie freigegeben ist,
     (c) sie abgelaufen ist, oder (d) der Halter dieselbe Person ist (Erneuerung).
     Bei (a) und (c) ist eine ausdrückliche --uebergabe als Text Pflicht.
   - Eine gültige Lease eines anderen Halters wird NIE überschrieben. Er muss
     zuerst `freigeben` (kontrollierte Rückübergabe) oder ablaufen.
   - Gültigkeit begrenzt (Standard 90 Min, höchstens 240); wer schreibt,
     erneuert regelmäßig. Läuft sie ab, kann ein anderer übernehmen.
   - Zeitabstand 2 Min: Der Halter gilt für sich schon 2 Min vor Ablauf als abgelaufen, Fremde
     übernehmen erst 2 Min nach Ablauf (Schutz gegen Uhrenabweichung zwischen Rechnern).
   - Fencing: `pruefen --epoche` und `push` binden jede Schreibaktion an die Epoche. Der atomare
     Push schreibt Arbeits-Branch und Lease in einem Zug; ein ehemaliger Koordinator scheitert.
   - Unlesbare Lease: fail-closed.
   - Schreibende Arbeit beginnt nur, wenn `pruefen` Exit 0 liefert.

   Aufruf:
     node werkzeug/koordination.mjs status
     node werkzeug/koordination.mjs uebernehmen --halter H --uebergabe "Text" [--minuten 90]
     node werkzeug/koordination.mjs erneuern   --halter H [--minuten 90]
     node werkzeug/koordination.mjs freigeben  --halter H
     node werkzeug/koordination.mjs pruefen    --halter H [--epoche N]  (Exit 0 = darf schreiben)
     node werkzeug/koordination.mjs push --halter H --epoche N --ziel refs/heads/X [--quelle HEAD] [--minuten N]
         Atomarer Push (Arbeits-Branch + Lease). Nur so pushen Koordinatoren; schlägt fehl, wenn die
         Lease sich geändert hat (ehemaliger Koordinator). Nie auf main/master, nie auf die Lease selbst.
     node werkzeug/koordination.mjs leerlauf [--schwelle-min 60] [--ohne-pr] [--json] [--jetzt ISO]
         Nur lesend. AKTIV (Exit 0) / LEERLAUF-VERDACHT (Exit 5) / BLOCKIERT (Exit 6) mit Grund und
         der einzigen sicheren Wiederaufnahme (Übernahme nur bei abgelaufener Lease, nie bei gültiger).
   Umgebung: KOORD_REMOTE (Standard origin) für Prüfungen mit lokalem Remote.
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = "refs/heads/koordination/lease";
const STANDARD_MIN = 90;
const MAX_MIN = 240;
/* Uhrenabweichung: Der Halter hält sich selbst nur bis gueltig_bis minus Abstand für berechtigt,
   Fremde übernehmen erst ab gueltig_bis plus Abstand. Dazwischen liegt eine Sicherheitszone ohne Schreiber. */
const ABSTAND_MS = 120000;

/** Reine Entscheidung, ohne I/O. Gibt { ok, grund, neu } zurück. */
export function entscheide(lease, jetzt, a) {
  const t = jetzt.getTime();
  const min = Math.min(Math.max(Number(a.minuten) || STANDARD_MIN, 1), MAX_MIN);
  const bis0 = lease ? Date.parse(lease.gueltig_bis) : NaN;
  const freigabeKaputt = Boolean(lease) && lease.freigegeben_am != null && !Number.isFinite(Date.parse(lease.freigegeben_am));
  if (lease && (!Number.isFinite(bis0) || typeof lease.halter !== "string" || !Number.isInteger(lease.epoche) || freigabeKaputt)) {
    return { ok: false, grund: "Lease unlesbar oder beschädigt (fail-closed)" };
  }
  /* gueltig = fremde Sicht (noch nicht übernehmbar); eigenGueltig = der Halter darf noch schreiben. */
  const gueltig = Boolean(lease) && !lease.freigegeben_am && bis0 + ABSTAND_MS > t;
  const eigenGueltig = Boolean(lease) && !lease.freigegeben_am && bis0 - ABSTAND_MS > t;
  const bis = new Date(t + min * 60000).toISOString();
  if (!a.halter || !/^[a-z0-9][a-z0-9_-]{1,40}$/.test(a.halter)) return { ok: false, grund: "Halter fehlt oder ungültig (a-z, 0-9, _, -)" };

  if (a.aktion === "freigeben") {
    if (!lease || lease.halter !== a.halter) return { ok: false, grund: "nur der Halter kann freigeben" };
    if (a.epoche === undefined || !Number.isInteger(Number(a.epoche)) || Number(a.epoche) !== lease.epoche) {
      return { ok: false, grund: `freigeben braucht die aktuelle Epoche ${lease.epoche} (ehemaliger Koordinator abgelehnt)` };
    }
    return { ok: true, grund: "freigegeben", neu: { ...lease, freigegeben_am: jetzt.toISOString(), gueltig_bis: jetzt.toISOString() } };
  }
  if (a.aktion === "pruefen") {
    if (!eigenGueltig || lease.halter !== a.halter) {
      return { ok: false, grund: gueltig ? `Lease hält ${lease.halter} bis ${lease.gueltig_bis}` : "keine gültige Lease" };
    }
    if (a.epoche !== undefined && Number(a.epoche) !== lease.epoche) {
      return { ok: false, grund: `Epoche ${a.epoche} ist veraltet (aktuell ${lease.epoche}): ehemaliger Koordinator` };
    }
    return { ok: true, grund: `Lease gültig bis ${lease.gueltig_bis}, Epoche ${lease.epoche}` };
  }
  if (a.aktion === "erneuern") {
    if (!eigenGueltig || lease.halter !== a.halter) return { ok: false, grund: "Erneuern nur mit gültiger eigener Lease; erst übernehmen" };
    if (a.epoche !== undefined && Number(a.epoche) !== lease.epoche) return { ok: false, grund: `Epoche ${a.epoche} ist veraltet (aktuell ${lease.epoche})` };
    return { ok: true, grund: "erneuert", neu: { ...lease, erneuert_am: jetzt.toISOString(), gueltig_bis: bis } };
  }
  if (a.aktion === "uebernehmen") {
    if (eigenGueltig && lease.halter === a.halter) {
      if (a.epoche === undefined) return { ok: false, grund: "eigene Lease läuft: Erneuerung braucht --epoche (Fencing)" };
      return entscheide(lease, jetzt, { ...a, aktion: "erneuern" });
    }
    if (gueltig) return { ok: false, grund: `${lease.halter} hält die Lease bis ${lease.gueltig_bis}; Rückübergabe durch Freigabe nötig` };
    if (!a.uebergabe || a.uebergabe.trim().length < 10) return { ok: false, grund: "ausdrückliche --uebergabe (Begründung/Beleg) fehlt" };
    return { ok: true, grund: "übernommen", neu: {
      epoche: (lease?.epoche || 0) + 1, halter: a.halter, uebernommen_am: jetzt.toISOString(),
      erneuert_am: jetzt.toISOString(), gueltig_bis: bis, uebergabe: a.uebergabe.trim(),
      vorgaenger: lease?.halter || null, freigegeben_am: null,
    } };
  }
  return { ok: false, grund: `unbekannte Aktion ${a.aktion}` };
}

function git(args, eingabe, timeout, env) {
  return execFileSync("git", args, { cwd: WURZEL, encoding: "utf8", input: eingabe, stdio: ["pipe", "pipe", "pipe"], timeout, env: env ? { ...process.env, ...env } : undefined }).trim();
}
const remote = () => process.env.KOORD_REMOTE || "origin";
const gitOpt = (args) => { try { return git(args); } catch { return ""; } };

/** Push über den Wrapper. In einer geschützten Worker-Kopie (werkzeug/dauerlauf-schutz.mjs) ist die pushurl
    gesperrt und ein pre-push-Hook verlangt eine Einmalmarke: Sie wird hier unmittelbar vor dem Push in die
    Git-Verwaltung geschrieben, als CENTRIC_PUSH_MARKE übergeben, vom Hook verbraucht und danach gelöscht.
    Ziel ist KOORD_REMOTE, sonst centric.pushurl (echte Adresse der geschützten Kopie), sonst origin. */
function wrapperPush(refspecs) {
  const ziel = process.env.KOORD_REMOTE || gitOpt(["config", "--get", "centric.pushurl"]) || "origin";
  const helfer = gitOpt(["config", "--get", "centric.credentialhelper"]);
  const marke = randomBytes(16).toString("hex");
  const datei = path.resolve(WURZEL, git(["rev-parse", "--git-path", "centric-push-marke"]));
  writeFileSync(datei, marke);
  try {
    git([...(helfer ? ["-c", "credential.helper=", "-c", `credential.helper=${helfer}`] : []), "push", "--atomic", "--quiet", ziel, ...refspecs], undefined, undefined, { CENTRIC_PUSH_MARKE: marke });
  } finally { rmSync(datei, { force: true }); }
}

/** Eine Lease muss ein Objekt sein; alles andere (null, 0, false, Liste, Text) ist unlesbar (fail-closed). */
function leseLeaseText(text) {
  let wert;
  try { wert = JSON.parse(text); } catch { throw new Error("Lease unlesbar (kein JSON, fail-closed)"); }
  if (wert === null || typeof wert !== "object" || Array.isArray(wert)) throw new Error("Lease unlesbar (kein Objekt, fail-closed)");
  return wert;
}

/** Liest Spitze und Lease als EIN Schnappschuss: Inhalt und Spitze stammen aus demselben Commit.
    Die Lesung läuft über einen eindeutigen, temporären Ref dieses Prozesses, nie über einen geteilten Ref,
    den parallele Prozesse überschreiben könnten. Der zurückgegebene Spitzen-Commit ist genau der,
    dessen Inhalt gelesen wurde; der spätere Push ist gegen ihn ein Compare-and-Swap. null, wenn der Branch fehlt. */
export function lesen() {
  let entfernt;
  try { entfernt = git(["ls-remote", remote(), REF]).split(/\s+/)[0] || null; } catch (e) { throw new Error(`Remote nicht erreichbar: ${e.message.split("\n")[0]}`); }
  if (!entfernt) return { spitze: null, lease: null };
  const tmp = `refs/koordination/tmp/${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    git(["fetch", "--quiet", "--no-tags", remote(), `${REF}:${tmp}`, "--force"]);
    const spitze = git(["rev-parse", "--verify", tmp]);
    return { spitze, lease: leseLeaseText(git(["show", `${spitze}:lease.json`])) };
  } finally {
    try { git(["update-ref", "-d", tmp]); } catch { /* egal: temporärer Ref */ }
  }
}

/** Schreibt als neuer Commit auf die gelesene Spitze; Push ohne Force = atomar. */
export function leaseCommit(spitze, lease, nachricht) {
  const blob = git(["hash-object", "-w", "--stdin"], JSON.stringify(lease, null, 2) + "\n");
  const baum = git(["mktree"], `100644 blob ${blob}\tlease.json\n`);
  const args = ["-c", "user.name=koordination", "-c", "user.email=koordination@centric.invalid", "commit-tree", baum, "-m", nachricht];
  if (spitze) args.push("-p", spitze);
  return git(args);
}

export function schreiben(spitze, lease, nachricht) {
  const commit = leaseCommit(spitze, lease, nachricht);
  git(["push", "--quiet", remote(), `${commit}:${REF}`]); // wirft bei Non-Fast-Forward
  return commit;
}

/** Fencing: Arbeits-Branch UND Lease-Erneuerung in EINEM atomaren Push (--atomic, ohne Force).
    Hat inzwischen jemand die Lease geändert (Übernahme, Freigabe, Erneuerung), lehnt Git den
    gesamten Push ab; der Arbeits-Branch bleibt unverändert. Ein ehemaliger Koordinator kann so
    nichts mehr schreiben, auch wenn er seine Prüfung vor der Übernahme bestanden hatte. */
export const GESPERRTE_ZIELE = /^refs\/heads\/(main|master|integration|koordination|release)(\/|$)/;
export function gepruefterPush({ halter, epoche, quelle, ziel, jetzt = new Date(), ansicht, minuten }) {
  if (!/^refs\/heads\/[\w./-]+$/.test(ziel) || ziel.includes("..") || GESPERRTE_ZIELE.test(ziel) || ziel === REF) {
    throw new Error(`Zielref nicht erlaubt: ${ziel} (Integration, Release, main, Lease sind gesperrt; Arbeit nur über PR)`);
  }
  if (epoche === undefined || epoche === null || !Number.isInteger(Number(epoche)) || String(epoche).trim() === "") {
    throw new Error("push braucht --epoche (Fencing)");
  }
  const { spitze, lease } = ansicht || lesen();
  const e = entscheide(lease, jetzt, { aktion: "erneuern", halter, epoche, minuten });
  if (!e.ok) throw new Error(`Kein Schreibrecht: ${e.grund}`);
  const lc = leaseCommit(spitze, e.neu, `Lease erneuert beim Push: ${halter} Epoche ${e.neu.epoche}`);
  wrapperPush([`${git(["rev-parse", quelle])}:${ziel}`, `${lc}:${REF}`]);
  return lc;
}

/* LEERLAUF — nur lesend. Erkennt unbeabsichtigten Stillstand des Koordinators aus vorhandenen Daten
   (Lease, letzter Integrationsmerge, Aktivität offener PRs) und nennt die einzige sichere Wiederaufnahme.
   Schreibt nichts am Remote (lokal nur ein temporärer Ref, der wieder gelöscht wird). Der vorgeschlagene Befehl
   wird gegen entscheide() geprüft, also nie bei gültiger Lease. Er nennt nie den bisherigen Halter als --halter:
   Wer wiederaufnimmt, braucht eine eigene, bisher nicht verwendete Kennung, sonst unterscheidet das Fencing
   den Wiederaufnehmenden nicht vom eingeschlafenen Halter. */
export const LEERLAUF_EXIT = { AKTIV: 0, "LEERLAUF-VERDACHT": 5, BLOCKIERT: 6 };
const zeit = (s) => (s ? Date.parse(s) : NaN);
const HALTER_MUSTER = /^[a-z0-9][a-z0-9_-]{1,40}$/;
/** Pseudo-Kennung für die Prüfung einer Fremdübernahme; besteht das Halter-Muster und ist nie ein echter Halter. */
const PRUEF_FREMD = "leerlauf-pruefung";

/** Reine Bewertung ohne I/O. lease wie lease.json; integration = { kopf, zeit }; prs = [{ nummer, aktualisiert, ciGruen }] oder null. */
export function bewerteLeerlauf({ lease, jetzt, integration = null, prs = null, schwelleMin = 60, fensterStd = 24 }) {
  const ergebnis = (zustand, grund, wiederaufnahme, extra = {}) => ({ zustand, grund, wiederaufnahme, exit: LEERLAUF_EXIT[zustand], letzteAktivitaet: null, wartendePrs: [], prDaten: prs !== null, ...extra });
  const t = jetzt instanceof Date ? jetzt.getTime() : NaN;
  if (!Number.isFinite(t)) return ergebnis("BLOCKIERT", "ungültige Zeitangabe (--jetzt)", "nichts übernehmen; Aufruf korrigieren");
  if (!Number.isFinite(schwelleMin) || schwelleMin < 1) return ergebnis("BLOCKIERT", "ungültige Schwelle (--schwelle-min muss mindestens 1 sein)", "nichts übernehmen; Aufruf korrigieren");
  const schwelle = schwelleMin * 60000;
  const pruef = entscheide(lease, jetzt, { aktion: "uebernehmen", halter: PRUEF_FREMD, uebergabe: "Pruefung Leerlauf (nur lesend)" });
  if (lease && !pruef.ok && /unlesbar|beschädigt/.test(pruef.grund)) return ergebnis("BLOCKIERT", pruef.grund, "nichts übernehmen; Lease von Hand prüfen (fail-closed)");
  /* Halter landet in Ausgaben und Befehlstexten: nur ein Name nach dem Halter-Muster, sonst fail-closed. */
  if (lease && !HALTER_MUSTER.test(lease.halter)) return ergebnis("BLOCKIERT", "Halter in der Lease ungültig (fail-closed)", "nichts übernehmen; Lease von Hand prüfen");

  /* Letzte belegbare Aktivität: Lease-Übernahme/-Erneuerung, Integrationsmerge, PR-Aktualisierung. */
  const quellen = [
    ["Lease erneuert", zeit(lease?.erneuert_am)], ["Lease übernommen", zeit(lease?.uebernommen_am)],
    ["Integrationskopf", zeit(integration?.zeit)],
    ...(prs || []).map((p) => [`PR #${p.nummer}`, zeit(p.aktualisiert)]),
  ].filter(([, z]) => Number.isFinite(z) && z <= t + ABSTAND_MS);
  const letzte = quellen.reduce((a, b) => (b[1] > a[1] ? b : a), ["keine", -Infinity]);
  const stillMin = Number.isFinite(letzte[1]) ? Math.floor((t - letzte[1]) / 60000) : null;
  const wartend = (prs || []).filter((p) => p.ciGruen && t - zeit(p.aktualisiert) > schwelle && t - zeit(p.aktualisiert) < fensterStd * 3600e3).map((p) => p.nummer);
  const extra = { letzteAktivitaet: Number.isFinite(letzte[1]) ? { quelle: letzte[0], zeit: new Date(letzte[1]).toISOString(), stillMin } : null, wartendePrs: wartend, prDaten: prs !== null };
  const still = stillMin === null || t - letzte[1] > schwelle;
  const uebernahme = () => `node werkzeug/koordination.mjs uebernehmen --halter <eigene-Kennung> --uebergabe "<Grund, Beleg, Kopf>"  (eigene, bisher nicht verwendete Kennung${lease ? `, nicht ${lease.halter}` : ""}; ergibt Epoche ${(lease?.epoche || 0) + 1}; danach status lesen, nur mit dieser Epoche pushen; der alte Halter wird per Fencing abgewiesen)`;

  if (!lease) return ergebnis("LEERLAUF-VERDACHT", "keine Lease vorhanden, kein Koordinator", uebernahme(), extra);
  const bis = zeit(lease.gueltig_bis);
  if (lease.freigegeben_am) {
    return still && wartend.length && pruef.ok
      ? ergebnis("LEERLAUF-VERDACHT", `Lease freigegeben ${lease.freigegeben_am}, aber PRs mit grüner CI warten: #${wartend.join(", #")}`, uebernahme(), extra)
      : ergebnis("AKTIV", `Lease kontrolliert freigegeben ${lease.freigegeben_am} (bewusste Pause)`, "keine Aktion nötig", extra);
  }
  if (t <= bis + ABSTAND_MS && t > bis - ABSTAND_MS) {
    return ergebnis("BLOCKIERT", `Sicherheitszone um den Ablauf ${lease.gueltig_bis}: weder Halter noch Fremde schreiben`, `warten bis ${new Date(bis + ABSTAND_MS).toISOString()}, dann leerlauf erneut aufrufen`, extra);
  }
  if (t <= bis) {
    return still
      ? ergebnis("LEERLAUF-VERDACHT", `Lease ${lease.halter} Epoche ${lease.epoche} gültig bis ${lease.gueltig_bis}, aber seit ${stillMin ?? "?"} Min keine Aktivität`, `NICHT übernehmen (gültige Lease). Nur der Halter ${lease.halter} selbst setzt fort (Epoche ${lease.epoche}); Fremde frühestens ab ${new Date(bis + ABSTAND_MS).toISOString()}`, extra)
      : ergebnis("AKTIV", `Lease ${lease.halter} Epoche ${lease.epoche} gültig bis ${lease.gueltig_bis}, letzte Aktivität vor ${stillMin} Min`, "keine Aktion nötig", extra);
  }
  /* Abgelaufen ohne Freigabe: Stillstand. Übernahme nur, wenn entscheide() sie einem Fremden zuließe, mit eigener Kennung. */
  if (!pruef.ok) return ergebnis("BLOCKIERT", pruef.grund, "nichts übernehmen", extra);
  return ergebnis("LEERLAUF-VERDACHT", `Lease ${lease.halter} Epoche ${lease.epoche} seit ${lease.gueltig_bis} abgelaufen, ohne Freigabe`, uebernahme(), extra);
}

const ZEITLIMIT_MS = 30000; // gh/git in leerlauf dürfen den Lauf nicht unbegrenzt blockieren

/** Commit-Zeit des Integrationskopfs, über einen temporären Ref gelesen (wie lesen()); null, wenn nicht vorhanden. */
function integrationsKopf(zweig = "integration/release-v4") {
  const tmp = `refs/koordination/tmp/int-${process.pid}-${Date.now()}`;
  try {
    if (!git(["ls-remote", remote(), `refs/heads/${zweig}`], undefined, ZEITLIMIT_MS)) return null;
    git(["fetch", "--quiet", "--no-tags", remote(), `refs/heads/${zweig}:${tmp}`, "--force"], undefined, ZEITLIMIT_MS);
    const [kopf, z] = git(["log", "-1", "--format=%h %cI", tmp]).split(" ");
    return { kopf, zeit: z };
  } catch { return null; } finally { try { git(["update-ref", "-d", tmp]); } catch { /* egal */ } }
}

/** Offene PRs über gh (falls verfügbar); null, wenn gh fehlt oder scheitert. */
function offenePrs() {
  try {
    const roh = execFileSync("gh", ["pr", "list", "--state", "open", "--limit", "100", "--json", "number,updatedAt,isDraft,statusCheckRollup"], { cwd: WURZEL, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: ZEITLIMIT_MS });
    return JSON.parse(roh).filter((p) => !p.isDraft).map((p) => {
      const c = (p.statusCheckRollup || []).map((s) => s.conclusion || s.state || "");
      return { nummer: p.number, aktualisiert: p.updatedAt, ciGruen: c.length > 0 && c.every((x) => ["SUCCESS", "SKIPPED", "NEUTRAL", ""].includes(x)) && c.includes("SUCCESS") };
    });
  } catch { return null; }
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }

function haupt() {
  const aktion = process.argv[2];
  let gelesen;
  try { gelesen = lesen(); } catch (err) { console.error(`ABGELEHNT: ${err.message.split("\n")[0]}`); return 4; }
  const { spitze, lease } = gelesen;
  if (aktion === "status") { console.log(JSON.stringify(lease || { halter: null }, null, 2)); return 0; }
  if (aktion === "leerlauf") {
    const jetzt = process.argv.includes("--jetzt") ? new Date(arg("--jetzt") ?? "") : new Date();
    const schwelleMin = process.argv.includes("--schwelle-min") ? Number(arg("--schwelle-min") ?? NaN) : 60;
    const ungueltig = !Number.isFinite(jetzt.getTime()) || !Number.isFinite(schwelleMin) || schwelleMin < 1;
    const b = bewerteLeerlauf({ lease, jetzt, schwelleMin, integration: ungueltig ? null : integrationsKopf(), prs: ungueltig || process.argv.includes("--ohne-pr") ? null : offenePrs() });
    if (process.argv.includes("--json")) console.log(JSON.stringify(b, null, 2));
    else {
      console.log(`${b.zustand}: ${b.grund}`);
      if (b.letzteAktivitaet) console.log(`letzte Aktivität: ${b.letzteAktivitaet.quelle} ${b.letzteAktivitaet.zeit} (vor ${b.letzteAktivitaet.stillMin} Min)`);
      if (b.wartendePrs.length) console.log(`PRs mit grüner CI ohne Aktivität: #${b.wartendePrs.join(", #")}`);
      if (!b.prDaten) console.log("Hinweis: PR-Daten nicht verfügbar (gh fehlt oder --ohne-pr)");
      console.log(`sichere Wiederaufnahme: ${b.wiederaufnahme}`);
      console.log("Nächstes Paket: node werkzeug/naechstes-paket.mjs");
    }
    return b.exit;
  }
  if (["erneuern", "freigeben", "pruefen"].includes(aktion) && arg("--epoche") === undefined) {
    console.error(`ABGELEHNT: ${aktion} braucht --epoche (Fencing)`); return 1;
  }
  if (aktion === "push") {
    try { gepruefterPush({ halter: arg("--halter"), epoche: arg("--epoche"), quelle: arg("--quelle") || "HEAD", ziel: arg("--ziel"), minuten: arg("--minuten") }); }
    catch (err) { console.error(`ABGELEHNT: ${err.message.split("\n")[0]}`); return 3; }
    console.log("OK: Push mit Lease-Fencing"); return 0;
  }
  const e = entscheide(lease, new Date(), { aktion, halter: arg("--halter"), uebergabe: arg("--uebergabe"), minuten: arg("--minuten"), epoche: arg("--epoche") });
  if (!e.ok) { console.error(`ABGELEHNT: ${e.grund}`); return 1; }
  if (e.neu) {
    try { schreiben(spitze, e.neu, `Lease ${aktion}: ${e.neu.halter} Epoche ${e.neu.epoche}`); }
    catch { console.error("ABGELEHNT: Lease wurde gleichzeitig geändert (CAS verloren). Neu lesen und erneut entscheiden."); return 2; }
  }
  console.log(`OK: ${e.grund}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = haupt();
