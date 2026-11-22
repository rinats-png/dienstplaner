/* Reine Regeln der Migrationsprobe (deploy/migrationsprobe-lokal.mjs). Ohne Netz, ohne Server.
   Eigenes Modul, damit das Probe-Skript keinen Direktaufruf-Wächter braucht (Review #471 B1: der Wächter
   verglich den echten Pfad mit dem getippten und lief über einen Link stumm mit Exit 0). */
import fs from "node:fs"; import path from "node:path";

/** Echter Pfad: existierender Anfang über realpath (Links aufgelöst), Rest unverändert angehängt. */
function echterPfad(abs) {
  let kopf = abs; const rest = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(kopf), ...rest); } catch { /* weiter nach oben */ }
    const oben = path.dirname(kopf);
    if (oben === kopf) return null;
    rest.unshift(path.basename(kopf)); kopf = oben;
  }
}

/** Isolation (Review #471 A1, fail-closed): Ablage liegt segmentgenau unter …/scratchpad/daten-mig[-…]/…
    - keine `..`-Segmente in der Angabe, kein UNC-/Netzpfad (\\srv\… bzw. //srv/…), kein CENTRIC_BASIS;
    - geprüft wird das echte Ziel (realpath des existierenden Teils), nicht nur die Schreibweise. */
export function isolationGeprueft(daten, env = process.env) {
  if (typeof daten !== "string" || !daten.trim() || env.CENTRIC_BASIS) return false;
  if (/^[\\/]{2}/.test(daten)) return false;
  const roh = daten.split(/[\\/]+/);
  if (roh.includes("..")) return false;
  const echt = echterPfad(path.resolve(daten));
  if (!echt || /^[\\/]{2}/.test(echt)) return false;
  const seg = echt.split(/[\\/]+/);
  for (let i = 0; i + 1 < seg.length; i++) {
    if (seg[i] === "scratchpad" && /^daten-mig(-[A-Za-z0-9._]+)*$/.test(seg[i + 1])) return true;
  }
  return false;
}

/** JSON-Wert mit sortierten Objektschlüsseln (Listen bleiben in ihrer Reihenfolge). */
const kanonisch = (x) => Array.isArray(x) ? x.map(kanonisch)
  : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, kanonisch(x[k])])) : x;

/** Inhaltsgleich: beide Seiten sind Objekte/Listen mit gleichen Werten; nur die Schlüsselreihenfolge in Objekten
    darf abweichen. Fehlender oder skalarer Inhalt ist nie gleich (Review #471 H2). */
export function inhaltGleich(a, b) {
  if (!a || typeof a !== "object" || !b || typeof b !== "object") return false;
  return JSON.stringify(kanonisch(a)) === JSON.stringify(kanonisch(b));
}

/** Schreibzyklus (Review #471 A2): nur PUT 200 mit gleichem Inhalt besteht. 409 heißt „nicht geschrieben“
    (ETag-Konflikt oder verlangte Bestätigung) und ist FEHLGESCHLAGEN. */
export function schreibErgebnis(status, gleich) {
  if (status === 409) return { bestanden: false, text: `PUT ${status}: nicht geschrieben (Kandidat lehnt ab)` };
  if (status !== 200) return { bestanden: false, text: `PUT ${status}: Schreiben fehlgeschlagen` };
  return { bestanden: !!gleich, text: `PUT ${status}: geschrieben, Inhalt ${gleich ? "gleich" : "UNGLEICH"}` };
}

/** Exit-Code: 0 nur, wenn mindestens eine Prüfung lief und alle bestanden; sonst 1 (keine Räume = nichts belegt). */
export function gesamtExit(ok, n) {
  return n > 0 && ok === n ? 0 : 1;
}
