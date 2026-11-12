/* Personalimport: Dateiendungen, die der Parser (parser-kern.mjs) wirklich liest und die die Oberfläche anbietet.
   Einzige Quelle für Dateidialog (`accept`) und Hilfetext. Bewusst ohne Abhängigkeiten, damit sie auch von der
   Oberfläche geladen werden kann. NICHT dabei (Parser lehnt ab): ods, xlsm (Makros), xlsb, Vorlagen. */
export const IMPORT_ENDUNGEN_ANGEBOT = Object.freeze(["xlsx", "xls", "csv", "tsv"]);
