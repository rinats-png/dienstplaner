/* ==========================================================================
   PAKETSTAND — was ein Branchenpaket heute tatsächlich nutzbar macht (G9)

   Entscheidung G9 (WP19-PRODUKTENTSCHEIDUNGEN): Was nicht nutzbar ist, wird
   weder als verfügbare Leistung beworben noch verkauft. Ein Paket verkauft
   Merkmale. Ein Merkmal ist nutzbar, wenn

     - es zu keinem Branchenmodul der Registry gehört (bestehende Funktion,
       G10: bleibt unverändert), oder
     - sein Modul die Registry verlassen hat: Status „vorlaeufig" oder
       „freigegeben" UND eine Abnahme { datum, nachweis } laut Statusvertrag
       `pruefeModulStatus` (WP-19.13).

   Ein Paket ohne ein einziges nutzbares Merkmal (heute: Industrie) wird weder
   berechnet noch neu zugebucht, noch zur Buchung angeboten. Ein bereits
   gebuchtes Paket bleibt im Bestand unverändert (nichts wird gelöscht).

   Rein, ohne Ablage. Die Merkmalslisten der Pakete stehen hier und nur hier;
   src/stufen.js liest sie von hier (keine zweite Liste, die driftet).
   ========================================================================== */
import { BRANCHENMODULE, pruefeModulStatus } from "./branchenmodule.mjs";

export const PAKET_MERKMALE = Object.freeze({
  kern: Object.freeze(["plan", "antraege", "zeiten", "konten", "qualifikationen", "export", "sperreGesetz"]),
  sicherheit: Object.freeze(["posten", "wachbuch", "sperreEigen", "geofence", "objektbericht"]),
  pflege: Object.freeze(["fachkraftquote", "uebergabe", "bereichsplan", "pflegequal"]),
  klinik: Object.freeze(["bereitschaftsdienst", "geteilterdienst", "funktionsdienst", "rotation", "uebergabe", "fachkraftquote"]),
  industrie: Object.freeze(["anlagen", "maschinenqual", "kontimodelle"]),
});

/** Ist das Registry-Modul abgenommen (nicht „geplant", Abnahmenachweis stimmig)? */
const modulNutzbar = (x) => x.status !== "geplant" && pruefeModulStatus([x]).length === 0;

/** Ist ein Merkmal heute nutzbar? Merkmale außerhalb der Registry: ja (G10). */
export function merkmalNutzbar(merkmal, liste = BRANCHENMODULE) {
  const ms = liste.filter((x) => x.merkmal === merkmal);
  return ms.length === 0 || ms.some(modulNutzbar);
}

/** Die Merkmale eines Pakets, die noch nicht nutzbar sind. */
export function merkmaleInVorbereitung(paketId, liste = BRANCHENMODULE) {
  return (PAKET_MERKMALE[paketId] || []).filter((m) => !merkmalNutzbar(m, liste));
}

/** Hat das Paket mindestens ein nutzbares Merkmal? Die Kernplattform immer. */
export function paketNutzbar(paketId, liste = BRANCHENMODULE) {
  if (paketId === "kern") return true;
  const mm = PAKET_MERKMALE[paketId] || [];
  return mm.some((m) => merkmalNutzbar(m, liste));
}

/**
 * Das Paket, das ein Selbststart für die Branche NEU zubucht — oder null, wenn
 * es keine nutzbare Funktion hat. Bestehende Buchungen fasst das nicht an.
 */
export function paketFuerNeubuchung(paketId, liste = BRANCHENMODULE) {
  return paketId && paketNutzbar(paketId, liste) ? paketId : null;
}
