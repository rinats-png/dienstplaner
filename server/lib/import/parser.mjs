/* ==========================================================================
   IMP-2 — Import-Parser, öffentliche Schnittstelle (Vertrag:
   docs/acc45/IMPORT-VERTRAG.md)

   parseDatei({ buffer, name, grenzen }) → Promise<
       { ok: true, format, blaetter: [{ name, zeilen }], hinweise: [] }
     | { ok: false, code, nachricht } >

   Die Verarbeitung läuft in einem eigenen Worker-Thread mit Zeitlimit und
   Speicherbegrenzung. Wird das Limit überschritten, wird der Thread beendet;
   der Hauptprozess bleibt ansprechbar. Es gibt nie ein Teil-Ergebnis.
   Dieses Modul öffnet keine Netzverbindung und schreibt keine Dateien.
   ========================================================================== */
import { Worker } from "node:worker_threads";
import { STANDARD_GRENZEN } from "./parser-kern.mjs";

export { STANDARD_GRENZEN };

const MB = 1024 * 1024;
const fehler = (code, nachricht) => ({ ok: false, code, nachricht });

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

/* Globale Grenze gleichzeitiger Parser-Worker (Auflage 3, IMP-3-Review). Jeder Worker darf bis 768 MB Arbeitsspeicher
   und mehrere Sekunden Rechenzeit belegen; unbegrenzt viele Uploads könnten den Server so lahmlegen. Überzählige
   Aufrufe warten nicht (das würde Anfragen und Dateipuffer im Speicher aufstauen), sondern werden sofort mit
   ZU_VIEL_GLEICHZEITIG abgewiesen — der Endpunkt antwortet 503 und die Person versucht es gleich noch einmal. */
export const PARSER_GLEICHZEITIG_MAX = 2;
let aktiv = 0;
export const _parserAktiv = () => aktiv;

export function parseDatei({ buffer, name, grenzen } = {}) {
  if (!buffer || !(buffer instanceof Uint8Array)) {
    return Promise.resolve(fehler("EINGABE_UNGUELTIG", "Es wurde keine Datei übergeben."));
  }
  const g = grenzenZusammen(grenzen);
  if (buffer.length === 0) return Promise.resolve(fehler("LEER", "Die Datei ist leer."));
  if (buffer.length > g.dateiBytes) {
    return Promise.resolve(fehler("DATEI_ZU_GROSS", `Die Datei ist zu groß (erlaubt sind höchstens ${Math.round(g.dateiBytes / MB)} MB).`));
  }
  if (aktiv >= PARSER_GLEICHZEITIG_MAX)
    return Promise.resolve(fehler("ZU_VIEL_GLEICHZEITIG", "Gerade werden zu viele Dateien gleichzeitig gelesen. Bitte in einigen Sekunden noch einmal versuchen."));
  aktiv += 1;
  return new Promise((resolve) => {
    let fertig = false;
    let worker;
    const ende = (ergebnis) => {
      if (fertig) return;
      fertig = true;
      aktiv -= 1;
      clearTimeout(timer);
      if (worker) worker.terminate().catch(() => {});
      resolve(ergebnis);
    };
    const timer = setTimeout(() => ende(fehler("ZEITLIMIT",
      "Die Verarbeitung der Datei hat zu lange gedauert und wurde abgebrochen. Bitte eine kleinere oder einfachere Datei verwenden.")), g.zeitMs);
    try {
      worker = new Worker(new URL("./parser-worker.mjs", import.meta.url), {
        workerData: { buffer: new Uint8Array(buffer), name: String(name ?? ""), grenzen: g },
        resourceLimits: { maxOldGenerationSizeMb: 768, maxYoungGenerationSizeMb: 64 },
        stdout: true, stderr: true,
      });
    } catch {
      return ende(fehler("VERARBEITUNG_FEHLGESCHLAGEN", "Die Datei konnte nicht verarbeitet werden."));
    }
    worker.once("message", (m) => ende(m && typeof m === "object" ? m : fehler("VERARBEITUNG_FEHLGESCHLAGEN", "Die Datei konnte nicht verarbeitet werden.")));
    worker.once("error", (e) => ende(e && e.code === "ERR_WORKER_OUT_OF_MEMORY"
      ? fehler("SPEICHERLIMIT", "Die Datei benötigt zu viel Arbeitsspeicher und wurde abgebrochen.")
      : fehler("VERARBEITUNG_FEHLGESCHLAGEN", "Die Datei konnte nicht verarbeitet werden.")));
    worker.once("exit", () => ende(fehler("VERARBEITUNG_FEHLGESCHLAGEN", "Die Datei konnte nicht verarbeitet werden.")));
  });
}
