/* ==========================================================================
   RST-5: Migrationsprobe W-1…W-9 auf dem synthetischen 274bfa0-Bestand — Regeln, Fixture, Nachweis

   Gemeinsamer Kern für zwei Läufe mit derselben Fixture:
     - Staging-Gate (nur Runner): deploy/sicherung/ci/migrationsprobe-staging.sh — Bestand geschrieben von der
       Anwendungsschicht des 274bfa0-Bilds (ALT_BILD), Kandidat = gezogenes Digest-Bild (BILD).
     - lokal: werkzeug/migrationsprobe-synthetisch.mjs — Bestand per `git archive` aus 274bfa0 (K4-P3), Kandidat =
       dieser Quellstand. Kein Digest; der Nachweis sagt das ausdrücklich (art „lokal“).
   Beide schreiben die Fixture mit demselben Plan (FIXTURE) und vergleichen die Baum-Prüfsumme mit FIXTURE_BAUM: Weicht
   sie ab, ist es nicht dieselbe Fixture ⇒ fehlgeschlagen.

   Bewertung (fail-closed): Jede Regel W-1…W-9 und jede Zusatzprobe endet „bestanden“, „fehlgeschlagen“ oder „nicht
   bewertbar“. Gesamt „bestanden“ nur, wenn ALLES bestanden ist; „nicht bewertbar“ ist nie „bestanden“. Der Gate-Nachweis
   verlangt einen exakten Digest (sha256:<64 hex>); ohne ihn ist das Ergebnis „nicht bewertbar“.

   Ausgaben: nur Zählwerte, Regelkennungen und gekürzte Gründe (≤ 200 Zeichen). Keine Codes, Passwörter, Namen oder
   Adressen — die Actions-Logs und das Artefakt sind öffentlich. Die Fixture ist rein synthetisch (K4-P3).

   Kommandozeile (vom Gate-Skript und vom lokalen Lauf):
     node migrationsprobe-staging.mjs plan [--gegenprobe]        Plan der Fixture als JSON (stdin des Schreibers)
     node migrationsprobe-staging.mjs ablage <ablage> [--gegenprobe]   Selbsttest K4-P3 + Baum-Prüfsumme (stdout)
     node migrationsprobe-staging.mjs bewerten <ordner> <ausgabe.json>
         liest die Rohdaten aus <ordner> (siehe ROHDATEN), schreibt den Nachweis, Exit 0 nur bei „bestanden“.
         Umgebung: MP_MODUS=gate|lokal, DIGEST, ALT_DIGEST (nur gate).
   Tests: pruefungen/rst5-migrationsprobe.test.js.
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planBauen, pruefeAblage, baumHash } from "../../../werkzeug/synthetischer-altbestand.mjs";

/** Fixture des Gates und des lokalen Laufs: klein (schwacher Rechner, ein Runner-Lauf), ohne Zahl-Kennung. */
export const FIXTURE = Object.freeze({ saat: 20261125, groesse: 20, tage: 7, zahlkennung: false });
/** Gegenprobe: dieselbe Fixture MIT Zahl-Kennung — die Kennungsprobe am Digest muss sie abweisen. */
export const GEGENPROBE = Object.freeze({ ...FIXTURE, zahlkennung: true });
/** Baum-Prüfsumme der Fixture, ermittelt lokal mit `erzeugen` (274bfa0 per git archive, 2026-11-27, zweimal gleich:
    45 Dateien, 160160 Bytes). Das Gate vergleicht die von ALT_BILD geschriebene Fixture dagegen; der lokale Lauf auch. */
export const FIXTURE_BAUM = "876c77d96a690036fda85ee8f3abfeda5bc11b059e0910478ee8ff67916a3d1b";

export const W_IDS = Object.freeze(["W-1", "W-2", "W-3", "W-4", "W-5", "W-6", "W-7", "W-8", "W-9"]);
export const ZUSATZ_IDS = Object.freeze(["fixture", "start", "kennungen", "gegenprobe", "abgleich"]);
export const OK = "bestanden", FEHL = "fehlgeschlagen", NB = "nicht bewertbar";
const DIGEST_MUSTER = /^sha256:[0-9a-f]{64}$/;
const MAX_GRUND = 200;

/** Rohdaten im Ordner des Laufs (alle optional; fehlend ⇒ betroffene Regel „nicht bewertbar“). */
export const ROHDATEN = Object.freeze({
  startLog: "start.log",            // vollständiges Protokoll des Kandidaten (bis nach Lösch- und Datenschutzlauf)
  prozess: "prozess",               // „ja“/„nein“: <daten>/.prozess während des Laufs vorhanden
  schreibhalt: "schreibhalt",       // „ja“/„nein“: <zustand>/schreibhalt/ vorhanden
  buchZugang: "buch-zugang",        // Bytes von <zustand>/zugang-widerrufe.json
  buchKonto: "buch-konto",          // Bytes von <zustand>/konto-widerrufe.json
  abgleich: "abgleich.json",        // stdout von deploy/deploy-abgleich.mjs
  abgleichExit: "abgleich.exit",
  probe: "probe.log",               // Ausgabe von deploy/migrationsprobe-lokal.mjs
  probeExit: "probe.exit",
  kennungenExit: "kennungen.exit",  // deploy/betriebskennungen-pruefen.mjs auf der Fixture (Erwartung 0)
  gegenprobeExit: "gegenprobe.exit", // dieselbe Probe auf der Gegenprobe (Erwartung 1)
  fixtureBaum: "fixture-baum",
});

const kurz = (/** @type {unknown} */ s) => String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, MAX_GRUND);
const r = (/** @type {string} */ id, /** @type {string} */ ergebnis, /** @type {unknown} */ grund) => ({ id, ergebnis, grund: kurz(grund) });
/** Ganze Zahl aus einer Rohdatei („0“, „1“ …) oder null. @param {unknown} s */
export const zahl = (s) => (typeof s === "string" && /^\s*\d{1,6}\s*$/.test(s) ? Number(s.trim()) : null);
const zeile = (/** @type {string} */ log, /** @type {RegExp} */ re) => (log.match(re) || null);

/**
 * Bewertet W-1…W-9 und die Zusatzproben aus den Rohdaten eines Laufs. Rein, ohne Dateisystem.
 * @param {{ startLog?: string|null, prozess?: string|null, schreibhalt?: string|null, buchZugang?: string|null,
 *   buchKonto?: string|null, abgleich?: string|null, abgleichExit?: string|null, probe?: string|null,
 *   probeExit?: string|null, kennungenExit?: string|null, gegenprobeExit?: string|null, fixtureBaum?: string|null }} roh
 * @param {{ erwarteterBaum?: string }} [o]
 * @returns {{ w: Array<{id: string, ergebnis: string, grund: string}>, zusatz: Array<{id: string, ergebnis: string, grund: string}> }}
 */
export function bewerten(roh, { erwarteterBaum = FIXTURE_BAUM } = {}) {
  const log = typeof roh.startLog === "string" ? roh.startLog.replace(/\r\n/g, "\n") : null;
  /* Rohdateien enden mit Zeilenumbruch (echo im Gate-Skript); alles außer genau „ja“/„nein“ ist nicht erhoben. */
  const ja = (/** @type {unknown} */ x) => { const s = typeof x === "string" ? x.trim() : null; return s === "ja" ? true : s === "nein" ? false : null; };
  /** @type {Array<{id: string, ergebnis: string, grund: string}>} */ const zusatz = [];

  /* Fixture: dieselbe wie lokal (Baum-Prüfsumme). */
  const baum = typeof roh.fixtureBaum === "string" ? roh.fixtureBaum.trim() : "";
  if (!/^[0-9a-f]{64}$/.test(erwarteterBaum)) zusatz.push(r("fixture", NB, "erwartete Baum-Prüfsumme nicht festgelegt"));
  else if (!/^[0-9a-f]{64}$/.test(baum)) zusatz.push(r("fixture", NB, "Baum-Prüfsumme der Fixture fehlt"));
  else zusatz.push(baum === erwarteterBaum ? r("fixture", OK, `Baum ${baum.slice(0, 12)}… = lokale Fixture`)
    : r("fixture", FEHL, `Baum ${baum.slice(0, 12)}… ≠ erwartet ${erwarteterBaum.slice(0, 12)}…`));

  /* Start: Protokoll vorhanden, Server lief, kein WARNUNG, keine Startverweigerung. */
  let startOk = false;
  if (log === null || !log.trim()) zusatz.push(r("start", NB, "Startprotokoll fehlt"));
  else if (!/läuft auf Port \d+/.test(log)) zusatz.push(r("start", FEHL, "Server meldet keinen Start"));
  else if (/WARNUNG/.test(log)) zusatz.push(r("start", FEHL, `Startprotokoll enthält WARNUNG (${(log.match(/WARNUNG/g) || []).length}×)`));
  else if (/Start verweigert/.test(log)) zusatz.push(r("start", FEHL, "Start verweigert"));
  else { startOk = true; zusatz.push(r("start", OK, "gestartet, kein WARNUNG")); }

  /* Betriebskennungen am Kandidatencode: Fixture 0, Gegenprobe (Zahl-Kennung) 1. */
  const ke = zahl(roh.kennungenExit ?? null), ge = zahl(roh.gegenprobeExit ?? null);
  zusatz.push(ke === null ? r("kennungen", NB, "kein Ergebnis") : ke === 0 ? r("kennungen", OK, "alle Betriebskennungen Zeichenketten")
    : r("kennungen", FEHL, `Exit ${ke}`));
  zusatz.push(ge === null ? r("gegenprobe", NB, "kein Ergebnis") : ge === 1 ? r("gegenprobe", OK, "Zahl-Kennung erkannt (Exit 1)")
    : r("gegenprobe", FEHL, `Exit ${ge} statt 1 — die Kennungsprobe erkennt die Zahl-Kennung nicht`));

  /* Abgleich gegen S0: nichts, was vor dem Start da war, ohne Grund verändert oder verschwunden. */
  const ae = zahl(roh.abgleichExit ?? null);
  /** @type {any} */ let ab = null;
  try { ab = roh.abgleich ? JSON.parse(String(roh.abgleich).trim().split("\n").pop() || "") : null; } catch { ab = null; }
  if (ae === null || !ab || typeof ab !== "object") zusatz.push(r("abgleich", NB, "kein Abgleich"));
  else if (ae !== 0 || ab.ok !== true || ab.abweichend !== 0 || ab.fehlend !== 0 || !(ab.gleich > 0))
    zusatz.push(r("abgleich", FEHL, `Exit ${ae}, gleich ${ab.gleich}, abweichend ${ab.abweichend}, fehlend ${ab.fehlend}`));
  else zusatz.push(r("abgleich", OK, `gleich ${ab.gleich}, nach dem Start ${ab.nachStart}, ausgelassen ${ab.ausgelassen}`));

  /** @type {Array<{id: string, ergebnis: string, grund: string}>} */ const w = [];
  const ohneLog = (/** @type {string} */ id) => r(id, NB, "Startprotokoll fehlt");

  // W-1 Ablagesperre
  const p = ja(roh.prozess ?? null);
  w.push(p === null ? r("W-1", NB, "Sperrdatei nicht erhoben") : p && startOk ? r("W-1", OK, "Ablagesperre .prozess gesetzt")
    : r("W-1", FEHL, p ? "Start nicht in Ordnung" : "keine Sperrdatei .prozess während des Laufs"));

  // W-2 Schreibhalt-Kanal
  const sh = ja(roh.schreibhalt ?? null);
  if (log === null) w.push(ohneLog("W-2"));
  else if (sh === null) w.push(r("W-2", NB, "Ordner schreibhalt/ nicht erhoben"));
  else w.push(sh && /^Schreibhalt: Kanal bereit/m.test(log) ? r("W-2", OK, "Kanal bereit, Ordner angelegt")
    : r("W-2", FEHL, sh ? "Protokoll meldet keinen Kanal" : "Ordner schreibhalt/ fehlt"));

  // W-3 Betreibersitzungen ohne zweiten Faktor (vor W-4 im Startblock; ohne Fehlermeldung und mit W-4-Zeile gelaufen)
  if (log === null) w.push(ohneLog("W-3"));
  else if (/Betreibersitzungen ohne zweiten Faktor ließen sich nicht prüfen/.test(log)) w.push(r("W-3", FEHL, "nicht prüfbar"));
  else {
    const z = zeile(log, /^Betreibersitzungen ohne zweiten Faktor: (\d+) beendet, (\d+) Fehler/m);
    if (z && Number(z[2]) > 0) w.push(r("W-3", FEHL, `${z[2]} Fehler`));
    else if (!/^Widerrufbuch: /m.test(log)) w.push(r("W-3", NB, "Startblock nicht bis zum Widerrufbuch gelaufen"));
    else w.push(r("W-3", OK, z ? `${z[1]} beendet, 0 Fehler` : "0 beendet (Altbestand ohne Betreibersitzungen), kein Fehler"));
  }

  // W-4 Widerrufbuch der Zugangscodes
  const bz = zahl(roh.buchZugang ?? null), bk = zahl(roh.buchKonto ?? null);
  if (log === null) w.push(ohneLog("W-4"));
  else {
    const z = zeile(log, /^Widerrufbuch: (\d+) Einträge, (\d+) aus der Ablage eingesammelt, (\d+) in der Ablage nachgezogen/m);
    if (!z) w.push(r("W-4", FEHL, "Widerrufbuch nicht gestartet"));
    else if (bz === null) w.push(r("W-4", NB, "Buch nicht erhoben"));
    else w.push(bz > 0 ? r("W-4", OK, `Buch angelegt (${z[1]} Einträge, ${z[2]} eingesammelt, ${z[3]} nachgezogen)`)
      : r("W-4", FEHL, "Buch zugang-widerrufe.json leer oder fehlt"));
  }

  // W-5 Konto-Widerrufbuch
  if (log === null) w.push(ohneLog("W-5"));
  else {
    const z = zeile(log, /^Konto-Widerrufbuch: (\d+) gesperrte Konten, (\d+) entzogene Beziehungen, (\d+) aus der Ablage eingesammelt, (\d+) in der Ablage nachgezogen/m);
    if (!z) w.push(r("W-5", FEHL, "Konto-Widerrufbuch nicht gestartet"));
    else if (/WARNUNG Konto-Widerrufbuch/.test(log)) w.push(r("W-5", FEHL, "WARNUNG Konto-Widerrufbuch"));
    else if (bk === null) w.push(r("W-5", NB, "Buch nicht erhoben"));
    else w.push(bk > 0 ? r("W-5", OK, `Buch angelegt (${z[1]} Konten, ${z[3]} eingesammelt, ${z[4]} nachgezogen)`)
      : r("W-5", FEHL, "Buch konto-widerrufe.json leer oder fehlt"));
  }

  // W-6 Schlüsselepoche: bei Daten aus 274bfa0 weder Epoche noch Bindung ⇒ nichts erneuert
  if (log === null) w.push(ohneLog("W-6"));
  else if (/WARNUNG Sicherungsschlüssel|Schlüsselepoche nicht prüfbar/.test(log)) w.push(r("W-6", FEHL, "Zustandsverzeichnis oder Epoche nicht prüfbar"));
  else if (/Schlüsselepoche erneuert/.test(log)) w.push(r("W-6", FEHL, "Epoche erneuert, obwohl der Altbestand keine kennt"));
  else w.push(/^Sicherungsschlüssel: Zustandsverzeichnis nutzbar/m.test(log) ? r("W-6", OK, "nichts erneuert, Zustandsverzeichnis nutzbar")
    : r("W-6", NB, "Prüfung des Zustandsverzeichnisses nicht im Protokoll"));

  // W-7 Löschlauf (60 s nach dem Start; Vorgabe an)
  if (log === null) w.push(ohneLog("W-7"));
  else if (/^Löschlauf: abgeschaltet/m.test(log)) w.push(r("W-7", NB, "Löschlauf abgeschaltet (CENTRIC_AUFRAEUMEN=aus)"));
  else if (/Löschlauf fehlgeschlagen/.test(log)) w.push(r("W-7", FEHL, "Löschlauf fehlgeschlagen"));
  else {
    const z = zeile(log, /^Löschlauf: (\d+) Testräume geprüft, (\d+) gelöscht, (\d+) Fehler/m);
    w.push(!z ? r("W-7", NB, "Löschlauf nicht im Protokoll (nicht abgewartet)")
      : Number(z[3]) === 0 ? r("W-7", OK, `${z[1]} geprüft, ${z[2]} gelöscht, 0 Fehler`) : r("W-7", FEHL, `${z[3]} Fehler`));
  }

  // W-8 Datenschutzlauf: Vorschau (Vorgabe), nie „an“ ohne Entscheidung (V-6)
  if (log === null) w.push(ohneLog("W-8"));
  else if (/Datenschutzlauf fehlgeschlagen/.test(log)) w.push(r("W-8", FEHL, "Datenschutzlauf fehlgeschlagen"));
  else {
    const z = zeile(log, /^Datenschutzlauf \((aus|vorschau|an)\): .* (\d+) Fehler$/m);
    if (!z) w.push(r("W-8", NB, /^Datenschutzlauf: abgeschaltet/m.test(log) ? "Datenschutzlauf abgeschaltet" : "Datenschutzlauf nicht im Protokoll"));
    else if (z[1] !== "vorschau") w.push(r("W-8", FEHL, `Modus ${z[1]} statt vorschau (V-6)`));
    else w.push(Number(z[2]) === 0 ? r("W-8", OK, "Vorschau, Vermerk geschrieben, 0 Fehler") : r("W-8", FEHL, `${z[2]} Fehler`));
  }

  // W-9 Speicherkern: alte Vermerke lesen, mit neuen Vermerken schreiben (Migrationsprobe je Raum und Betrieb)
  const pe = zahl(roh.probeExit ?? null);
  const pl = typeof roh.probe === "string" ? roh.probe.replace(/\r\n/g, "\n") : null;
  if (pe === null || pl === null) w.push(r("W-9", NB, "Migrationsprobe ohne Ergebnis"));
  else {
    const z = zeile(pl, /^MIGRATIONSPROBE: (\d+)\/(\d+)$/m);
    const altform = /^BESTANDEN\s+alt-bestandsform: unveränderter Schreibzyklus/m.test(pl);
    const zweiBetriebe = /^BESTANDEN\s+alt-sicherheit \[Betrieb 2\/2\]: unveränderter Schreibzyklus/m.test(pl);
    const fehl = (pl.match(/^FEHLGESCHLAGEN /gm) || []).length;
    if (!z) w.push(r("W-9", NB, "Migrationsprobe ohne Zusammenfassung"));
    else if (pe !== 0 || fehl > 0 || Number(z[2]) === 0 || z[1] !== z[2]) w.push(r("W-9", FEHL, `Exit ${pe}, ${z[1]}/${z[2]} bestanden`));
    else if (!altform || !zweiBetriebe) w.push(r("W-9", FEHL, "Altform-Raum oder zweiter Betrieb nicht geprüft"));
    else w.push(r("W-9", OK, `${z[1]}/${z[2]} Lese-/Schreibzyklen gleich, Altform und Mehrbetrieb geprüft`));
  }
  return { w, zusatz };
}

/** Gesamtergebnis: bestanden nur, wenn jede Prüfung bestanden ist; sonst fehlgeschlagen vor nicht bewertbar. */
export function gesamt(/** @type {Array<{ergebnis: string}>} */ alle) {
  if (!Array.isArray(alle) || alle.length === 0) return NB;
  if (alle.some((x) => x.ergebnis === FEHL)) return FEHL;
  return alle.every((x) => x.ergebnis === OK) ? OK : NB;
}

/**
 * Nachweis (ohne Personendaten). Gate: nur mit exaktem Digest bewertbar; lokal: art „lokal“, digest null.
 * @param {{ modus: string, digest?: string|null, altDigest?: string|null, w: any[], zusatz: any[] }} a
 */
export function nachweisBauen({ modus, digest = null, altDigest = null, w, zusatz }) {
  const vollstaendig = Array.isArray(w) && W_IDS.every((id, i) => w[i] && w[i].id === id)
    && Array.isArray(zusatz) && ZUSATZ_IDS.every((id) => zusatz.some((z) => z && z.id === id));
  let ergebnis = vollstaendig ? gesamt([...w, ...zusatz]) : NB;
  /** @type {string|null} */ let bindung;
  if (modus === "gate") {
    const ok = typeof digest === "string" && DIGEST_MUSTER.test(digest) && typeof altDigest === "string" && DIGEST_MUSTER.test(altDigest)
      && digest !== altDigest;
    bindung = ok ? "digest" : null;
    if (!ok && ergebnis === OK) ergebnis = NB;
  } else if (modus === "lokal") { bindung = "lokal (Quellstand, kein Digest)"; digest = null; altDigest = null; }
  else { bindung = null; ergebnis = NB; }
  return {
    art: modus === "gate" ? "migrationsprobe-staging" : "migrationsprobe-lokal",
    digest: modus === "gate" && bindung ? digest : null,
    altDigest: modus === "gate" && bindung ? altDigest : null,
    bindung,
    fixture: { saat: FIXTURE.saat, groesse: FIXTURE.groesse, tage: FIXTURE.tage, baum: FIXTURE_BAUM },
    w: Array.isArray(w) ? w : [], zusatz: Array.isArray(zusatz) ? zusatz : [],
    ergebnis,
  };
}

/** Rohdaten aus einem Ordner lesen (fehlende Datei ⇒ null; je Datei höchstens 2 MB). @param {string} ordner */
export function rohLesen(ordner) {
  /** @type {Record<string, string|null>} */ const o = {};
  for (const [k, datei] of Object.entries(ROHDATEN)) {
    const p = path.join(ordner, datei);
    try { o[k] = existsSync(p) ? readFileSync(p, "utf8").slice(0, 2 * 1024 * 1024) : null; } catch { o[k] = null; }
  }
  return o;
}

/** Kurzbericht für das (öffentliche) Protokoll: eine Zeile je Prüfung. */
export function bericht(/** @type {any} */ n) {
  const zeichen = (/** @type {string} */ e) => (e === OK ? "✔" : e === FEHL ? "✘" : "?");
  return [...n.w, ...n.zusatz].map((x) => `${zeichen(x.ergebnis)} ${x.id} ${x.ergebnis}: ${x.grund}`)
    .concat(`MIGRATIONSPROBE-NACHWEIS (${n.art}, Bindung ${n.bindung ?? "keine"}): ${n.ergebnis}`).join("\n");
}

/** @param {string[]} argv @param {Record<string, string|undefined>} [env] */
export function main(argv, env = process.env) {
  const [befehl, a, b] = argv;
  const gegen = argv.includes("--gegenprobe");
  if (befehl === "plan") { process.stdout.write(JSON.stringify(planBauen(gegen ? GEGENPROBE : FIXTURE))); return 0; }
  if (befehl === "ablage" && a && !a.startsWith("--")) {
    const befunde = pruefeAblage(path.resolve(a), { zahlkennung: gegen });
    if (befunde.length) { console.error(`Selbsttest: ${befunde.length} Befund(e): ${kurz(befunde.slice(0, 3).join("; "))}`); return 1; }
    process.stdout.write(`${baumHash(path.resolve(a))}\n`);
    return 0;
  }
  if (befehl === "bewerten" && a && b) {
    const { w, zusatz } = bewerten(rohLesen(path.resolve(a)));
    const n = nachweisBauen({ modus: String(env.MP_MODUS || ""), digest: env.DIGEST || null, altDigest: env.ALT_DIGEST || null, w, zusatz });
    writeFileSync(path.resolve(b), JSON.stringify(n, null, 2) + "\n");
    console.log(bericht(n));
    return n.ergebnis === OK ? 0 : 1;
  }
  console.error("Aufruf: plan [--gegenprobe] | ablage <ablage> [--gegenprobe] | bewerten <ordner> <ausgabe.json>");
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
