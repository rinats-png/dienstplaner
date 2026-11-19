/* ==========================================================================
   IMP-2 — Import-Parser, öffentliche Schnittstelle (Vertrag:
   docs/acc45/IMPORT-VERTRAG.md)

   parseDatei({ buffer, name, grenzen }) → Promise<
       { ok: true, format, blaetter: [{ name, zeilen }], hinweise: [] }
     | { ok: false, code, nachricht } >

   Review 561dd32, H1 (Entscheidung E-A): Die Verarbeitung läuft in einem eigenen
   Kindprozess (parser-prozess.mjs, Kindskript parser-worker.mjs), nicht mehr in
   einem Worker-Thread des Servers. Grenzen: Wandzeit zeitMs (Standard 20 s),
   danach Kill und ZEITLIMIT; Heap 256 MB; auf Linux zusätzlich Adressraum-Limit
   (ulimit -v). Der Server-Prozess überlebt jeden Absturz des Kindes. Es gibt nie
   ein Teil-Ergebnis. Dieses Modul öffnet keine Netzverbindung und schreibt keine Dateien.
   ========================================================================== */
import { STANDARD_GRENZEN } from "./parser-kern.mjs";
import { fuehreKindAus } from "./parser-prozess.mjs";

export { STANDARD_GRENZEN };

const MB = 1024 * 1024;
const KIND_SKRIPT = new URL("./parser-worker.mjs", import.meta.url);
const fehler = (code, nachricht) => ({ ok: false, code, nachricht });
const FEHLGESCHLAGEN = () => fehler("VERARBEITUNG_FEHLGESCHLAGEN", "Die Datei konnte nicht verarbeitet werden.");

function grenzenZusammen(g) {
  const aus = { ...STANDARD_GRENZEN };
  if (g && typeof g === "object") {
    for (const k of Object.keys(STANDARD_GRENZEN)) {
      const v = g[k];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) aus[k] = v;
    }
  }
  return aus;
}

/** Nur die Form des Vertrags wird durchgelassen; Fehlerergebnisse ohne jedes Zusatzfeld (kein Teil-Ergebnis). */
function pruefeErgebnis(w) {
  if (!w || typeof w !== "object" || Array.isArray(w)) return FEHLGESCHLAGEN();
  if (w.ok === false) {
    return typeof w.code === "string" && typeof w.nachricht === "string" ? fehler(w.code, w.nachricht) : FEHLGESCHLAGEN();
  }
  if (w.ok === true && typeof w.format === "string" && Array.isArray(w.blaetter) && Array.isArray(w.hinweise)) return w;
  return FEHLGESCHLAGEN();
}

/**
 * @param {{ buffer?: Uint8Array, name?: string, grenzen?: object }} [eingabe]
 * @param {{ skript?: URL|string, ausgabeMax?: number, beiStart?: (pid: number) => void }} [intern]
 *   nur für Prüfungen (Testdouble des Kindskripts, kleinere Ergebnisgrenze, Prozessnummer); der Server übergibt nichts.
 */
/* Globale Grenze gleichzeitiger Parser-Kindprozesse (IMP-3-Auflage 3). Überzählige Aufrufe warten nicht, sondern werden
   sofort mit ZU_VIEL_GLEICHZEITIG abgewiesen (Endpunkt antwortet 503). Der Kindprozess bleibt (IMP-2, Befund H1). */
export const PARSER_GLEICHZEITIG_MAX = 2;
let aktiv = 0;
export const _parserAktiv = () => aktiv;

export async function parseDatei(eingabe = {}, intern = {}) {
  if (aktiv >= PARSER_GLEICHZEITIG_MAX) {
    return fehler("ZU_VIEL_GLEICHZEITIG", "Gerade werden zu viele Dateien gleichzeitig gelesen. Bitte in einigen Sekunden noch einmal versuchen.");
  }
  aktiv += 1;
  try { return await parseDateiKind(eingabe, intern); } finally { aktiv -= 1; }
}

async function parseDateiKind({ buffer, name, grenzen } = {}, intern = {}) {
  if (!buffer || !(buffer instanceof Uint8Array)) return fehler("EINGABE_UNGUELTIG", "Es wurde keine Datei übergeben.");
  const g = grenzenZusammen(grenzen);
  if (buffer.length === 0) return fehler("LEER", "Die Datei ist leer.");
  if (buffer.length > g.dateiBytes) {
    return fehler("DATEI_ZU_GROSS", `Die Datei ist zu groß (erlaubt sind höchstens ${Math.round(g.dateiBytes / MB)} MB).`);
  }
  const lauf = await fuehreKindAus({
    skript: intern.skript ?? KIND_SKRIPT,
    kopf: { name: String(name ?? ""), grenzen: g },
    daten: buffer,
    zeitMs: g.zeitMs,
    ausgabeMax: intern.ausgabeMax,
    beiStart: intern.beiStart,
  });
  switch (lauf.art) {
    case "ergebnis": return pruefeErgebnis(lauf.wert);
    case "zeitlimit": return fehler("ZEITLIMIT", "Die Verarbeitung der Datei hat zu lange gedauert und wurde abgebrochen. Bitte eine kleinere oder einfachere Datei verwenden.");
    case "speicher": return fehler("SPEICHERLIMIT", "Die Datei benötigt zu viel Arbeitsspeicher und wurde abgebrochen.");
    case "ausgabe": return fehler("TEXT_ZU_GROSS", "Das Ergebnis der Datei ist zu groß (zu viel Text). Sie wird aus Sicherheitsgründen nicht verarbeitet.");
    default: return FEHLGESCHLAGEN();
  }
}
