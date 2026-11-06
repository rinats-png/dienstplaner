/* Zahlenformate und Kennungen der Oberfläche (aus src/App.jsx herausgelöst, WP-39; unverändert). */
import { stundenText } from "../istdaten.js";

/* Zahlenformate fallen bei fehlendem Wert auf „–" zurück statt mit einem
   TypeError die ganze Ansicht abzureißen (Browserprobe: „Anliegen" in der
   Mobilansicht). Zahlen als Text werden gewandelt; null/undefined/NaN bleiben leer. */
export const zahlOder = (v, f) => {
  const x = typeof v === "number" ? v : (v === null || v === undefined || v === "" ? NaN : Number(v));
  return Number.isFinite(x) ? f(x) : "–";
};
export const n1 = (v) => zahlOder(v, (x) => x.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
export const n2 = (v) => zahlOder(v, (x) => x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const sgn = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? (v >= 0 ? "+" : "−") + n1(Math.abs(v)) : "–");
/* Ist-Stunden, Stundenkonto und Nachtstunden dürfen aus Datenschutzgründen
   fehlen (E1, src/istdaten.js): null wird „–", nie 0 und nie ein Absturz. */
export const n1Ist = (v) => stundenText(v, n1);
export const sgnIst = (v) => stundenText(v, sgn);
export const eur = (v) => zahlOder(v, (x) => x.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }));
export const eur0 = (v) => zahlOder(v, (x) => x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));
export const zahl = (v) => zahlOder(v, (x) => x.toLocaleString("de-DE"));
export const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
