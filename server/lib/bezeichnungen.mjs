/* ==========================================================================
   Gemeinsame Erkennung von Bezeichnungen (rein, ohne Abhängigkeiten): Normalisierung und Abwesenheitsbezeichnungen.
   Genutzt von der Altplan-Vorschau (intelligence/funktionen/altplan.mjs) und der Schichtmodell-Vorschau des Imports
   (schichtvorschau.mjs), damit beide dieselbe Regel anwenden: Abwesenheit jeder Art (auch Gesundheit) wird nie als Art
   übernommen und nie ausgegeben.
   ========================================================================== */

export const norm = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ß/g, "ss")
  .replace(/[.,;:()]/g, " ").replace(/\s+/g, " ").trim();
/* Abwesenheit jeder Art (auch Gesundheit): nie als Art übernommen, nie ausgegeben. */
const ABW_WORTE = new Set(["krank", "kr", "k", "au", "gk", "kk", "uk", "u", "ue", "abw", "fb", "reha", "kur", "ku", "kh", "op", "bv", "mu", "ez", "sv", "krk", "krnk", "aub",
  "bsch", "kind", "muschu", "psych", "kvk", "ak"]);
const ABW_TEILE = /krank|krk|krnk|attest|arbeitsunf|urlaub|schwanger|mutterschutz|muschu|diagnos|abwesen|elternzeit|arzt|grippe|chemo|covid|corona|fieber|erk[a-z]*ltet|burnout|burn out|psych|klinik|krankenhaus|quarant|unfall|therap|op-|operation|infekt|migrane|depress|verletz|schmerz/;
/* Abwesenheit jeder Art (auch Gesundheit), auch mit Bindestrich/Schrägstrich verbunden: nie als Art übernommen, nie ausgegeben. */
export const abwesend = (k) => ABW_TEILE.test(k) || k.split(/[ /+_-]+/).some((t) => ABW_WORTE.has(t));
