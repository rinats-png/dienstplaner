/* ==========================================================================
   RECHENKERN — ZAHLEN- UND DATUMSTEXTE (WP-I12)

   Die Befundtexte der Planprüfung enthalten formatierte Zahlen und Kurzdaten.
   Die Formate stehen hier (aus src/lib/format.js und src/lib/datum.js
   unverändert herausgelöst), damit Client und Rechenkern denselben Text
   erzeugen; beide Dateien reichen sie weiter.
   ========================================================================== */
import { pad, pISO } from "../regelwerk.mjs";

/* Zahlenformate fallen bei fehlendem Wert auf „–" zurück statt mit einem
   TypeError die ganze Ansicht abzureißen (Browserprobe: „Anliegen" in der
   Mobilansicht). Zahlen als Text werden gewandelt; null/undefined/NaN bleiben leer. */
export const zahlOder = (v, f) => {
  const x = typeof v === "number" ? v : (v === null || v === undefined || v === "" ? NaN : Number(v));
  return Number.isFinite(x) ? f(x) : "–";
};
export const n1 = (v) => zahlOder(v, (x) => x.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export const fKurz = (s) => (s ? `${pad(pISO(s).getDate())}.${pad(pISO(s).getMonth() + 1)}.` : "—");

export const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
