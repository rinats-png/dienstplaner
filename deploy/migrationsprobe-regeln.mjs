/* Reine Regeln der Migrationsprobe (deploy/migrationsprobe-lokal.mjs). Ohne Netz, ohne Server.
   Eigenes Modul, damit das Probe-Skript keinen Direktaufruf-Wächter braucht (Review #471 B1: der Wächter
   verglich den echten Pfad mit dem getippten und lief über einen Link stumm mit Exit 0). */
import fs from "node:fs"; import path from "node:path";

/** Echter Pfad: existierender Anfang über realpath (Links aufgelöst), Rest unverändert angehängt.
    Delta-Review #471 H1: Existiert ein Teil des Rests doch (lstat), konnte realpath ihn nicht auflösen — ein toter
    Link (Ziel fehlt) oder eine Schleife. Sein Ziel ist unbekannt, also null (fail-closed). */
function echterPfad(abs) {
  let kopf = abs; const rest = [];
  for (;;) {
    let echt = null;
    try { echt = fs.realpathSync.native(kopf); } catch { /* weiter nach oben */ }
    if (echt !== null) {
      let p = echt;
      for (const teil of rest) {
        p = path.join(p, teil);
        if (fs.lstatSync(p, { throwIfNoEntry: false })) return null;
      }
      return path.join(echt, ...rest);
    }
    const oben = path.dirname(kopf);
    if (oben === kopf) return null;
    rest.unshift(path.basename(kopf)); kopf = oben;
  }
}

/** Isolation (Review #471 A1, fail-closed): Ablage liegt segmentgenau unter …/scratchpad/daten-mig[-…]/…
    - keine `..`-Segmente in der Angabe, kein UNC-/Netzpfad (\\srv\… bzw. //srv/…), kein CENTRIC_BASIS;
    - geprüft wird das echte Ziel (realpath des existierenden Teils), nicht nur die Schreibweise;
    - Delta-Review #471 A1: Trenner je Plattform. Unter Windows (`sep` = „\“) gelten „\“ und „/“. Unter POSIX
      (`sep` = „/“) ist „\“ ein gewöhnliches Zeichen im Namen; eine Angabe mit „\“ wird dort abgewiesen
      (`C:\…\scratchpad\daten-mig` wäre unter Linux EIN Ordnername im aktuellen Verzeichnis).
    `sep` nur für Tests; Vorgabe ist die echte Plattform. */
export function isolationGeprueft(daten, env = process.env, sep = path.sep) {
  if (typeof daten !== "string" || !daten.trim() || env.CENTRIC_BASIS) return false;
  const posix = sep === "/";
  if (posix && daten.includes("\\")) return false;
  const trenner = posix ? /\/+/ : /[\\/]+/;
  const unc = posix ? /^\/\// : /^[\\/]{2}/;
  if (unc.test(daten)) return false;
  const roh = daten.split(trenner);
  if (roh.includes("..")) return false;
  const echt = echterPfad(path.resolve(daten));
  if (!echt || unc.test(echt)) return false;
  const seg = echt.split(trenner);
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

/** Frist je HTTP-Aufruf in ms (Delta-Review #471 H6): CENTRIC_PROBE_FRIST_MS, ganze Zahl 1…600000; sonst 30000. */
export function fristAus(env = process.env) {
  const s = String(env.CENTRIC_PROBE_FRIST_MS ?? "");
  const n = /^\d{1,6}$/.test(s) ? Number(s) : 0;
  return n >= 1 && n <= 600000 ? n : 30000;
}

/** Port des Kandidaten auf 127.0.0.1 (der Rechner bleibt fest): CENTRIC_PROBE_PORT, 1…65535; sonst 3012. */
export function portAus(env = process.env) {
  const s = String(env.CENTRIC_PROBE_PORT ?? "");
  const n = /^\d{1,5}$/.test(s) ? Number(s) : 0;
  return n >= 1 && n <= 65535 ? n : 3012;
}

/** HTTP mit Frist (Delta-Review #471 H6): die Frist umfasst Antwortkopf UND Rumpf. Bei Ablauf wirft der Aufruf
    „Zeitüberschreitung nach … ms: METHODE /pfad“; die Probe wertet das als FEHLGESCHLAGEN, statt zu hängen.
    @returns {Promise<{s: number, x: string}>} */
export async function holenMitFrist(url, init = {}, ms = 30000) {
  const was = `${init.method || "GET"} ${new URL(url).pathname}`;
  try {
    const a = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
    return { s: a.status, x: await a.text() };
  } catch (e) {
    const name = e && /** @type {any} */ (e).name;
    if (name === "TimeoutError" || name === "AbortError") throw new Error(`Zeitüberschreitung nach ${ms} ms: ${was}`);
    throw new Error(`Verbindung fehlgeschlagen: ${was} (${String(e && /** @type {any} */ (e).cause?.code || e)})`);
  }
}

/** K4-P4: Eine Sitzung sieht nur ihren eigenen Betrieb (Mandantentrennung). Gelesen ist ein Betrieb, wenn die Antwort
    genau ihn enthält — nicht mehr, nicht weniger, nicht einen anderen. */
export function betriebGelesen(bestand, id) {
  const m = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten : [];
  return typeof id === "string" && id !== "" && m.length === 1 && !!m[0] && m[0].id === id;
}

/** Exit-Code: 0 nur, wenn mindestens eine Prüfung lief und alle bestanden; sonst 1 (keine Räume = nichts belegt). */
export function gesamtExit(ok, n) {
  return n > 0 && ok === n ? 0 : 1;
}
