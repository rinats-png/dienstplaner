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
export function paketFuerNeubuchung(paketId, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  return paketId && paketBuchbar(paketId, liste, freigaben) ? paketId : null;
}

/* ==========================================================================
   PAKETZUSTÄNDE (Betreiberentscheidung G9, 2026-11-03)

   Fünf getrennte Zustände je Paket; nur Zustand 5 darf als verfügbar
   beworben, gewählt, gebucht und regulär berechnet werden. Die Zielpreise
   bleiben (PAKETE[].aufpreis), sie gelten erst ab Zustand 5.

     1 geplant                    mindestens ein Modul des Pakets ist „geplant"
     2 technisch implementiert    kein Modul „geplant", aber der Statusvertrag
                                  (pruefeModulStatus, Abnahme WP-19.13) fehlt
     3 getestet und abgenommen    alle Module mit gültigem Abnahmenachweis
     4 für Kunden freigegeben     + Betreiberfreigabe stufe „kunden"
     5 buchbar und abrechenbar    + Betreiberfreigabe stufe „buchbar"

   Der Zustand wird nur hier aus Registry und Betreiberfreigabe abgeleitet.
   Kein Client und keine Rolle eines Betriebs (Beschäftigte, Leitung,
   Planung) schickt oder setzt ihn: Er steht im Code (PAKET_FREIGABEN, mit
   Datum, Person und Nachweis je Eintrag, geprüft durch Test und Review) und
   läuft nicht über die Daten eines Betriebs. Standard heute für alle vier
   Pakete: keine Freigabe.
   ========================================================================== */
export const PAKET_ZUSTAENDE = Object.freeze({
  1: "geplant", 2: "technisch implementiert", 3: "getestet und abgenommen",
  4: "für Kunden freigegeben", 5: "buchbar und abrechenbar",
});

/**
 * Betreiberfreigaben je Paket: { [paketId]: { stufe: "kunden"|"buchbar", datum, von, nachweis } }.
 * Heute leer: kein Paket ist freigegeben.
 */
export const PAKET_FREIGABEN = Object.freeze({});

const TAGFORM = /^\d{4}-\d{2}-\d{2}$/;
const freigabeGueltig = (f) => !!f && typeof f === "object" && (f.stufe === "kunden" || f.stufe === "buchbar")
  && typeof f.datum === "string" && TAGFORM.test(f.datum)
  && typeof f.von === "string" && f.von.trim() !== ""
  && typeof f.nachweis === "string" && f.nachweis.trim() !== "";

/** Der Zustand 1–5 eines Pakets. Die Kernplattform ist immer 5. */
export function paketZustand(paketId, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  if (paketId === "kern") return 5;
  const mods = liste.filter((x) => Array.isArray(x.pakete) && x.pakete.includes(paketId));
  if (!mods.length || mods.some((x) => x.status === "geplant")) return 1;
  if (mods.some((x) => pruefeModulStatus([x]).length > 0)) return 2;
  const f = freigaben && freigaben[paketId];
  if (!freigabeGueltig(f)) return 3;
  return f.stufe === "buchbar" ? 5 : 4;
}

/** Nur Zustand 5: wählbar, buchbar, beworben, berechnet. */
export const paketBuchbar = (paketId, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) =>
  paketZustand(paketId, liste, freigaben) === 5;

/** Meldungen zu Betreiberfreigaben: unbekanntes Paket, Form, Freigabe über dem Registry-Zustand. */
export function pruefePaketFreigaben(freigaben = PAKET_FREIGABEN, liste = BRANCHENMODULE) {
  const m = [];
  for (const [id, f] of Object.entries(freigaben || {})) {
    if (!PAKET_MERKMALE[id] || id === "kern") { m.push(`${id}: unbekanntes Paket`); continue; }
    if (!freigabeGueltig(f)) { m.push(`${id}: Freigabe nur mit stufe, datum, von, nachweis`); continue; }
    if (paketZustand(id, liste, {}) < 3) m.push(`${id}: Freigabe über dem Registry-Zustand (Module nicht abgenommen)`);
  }
  return m;
}

/** Ist der Betrieb im kostenlosen Pilot? (Betreiber setzt: preisgestaltung.pilot = { seit, von }.) */
export const pilotAktiv = (m) => {
  const p = m && m.preisgestaltung && m.preisgestaltung.pilot;
  return !!p && typeof p === "object" && typeof p.seit === "string" && TAGFORM.test(p.seit)
    && typeof p.von === "string" && p.von.trim() !== "";
};

/** Anzeige: „In Vorbereitung (Zustand)“ bzw. Pilot mit nutzbaren und nicht nutzbaren Funktionen. */
export function paketAnzeige(paketId, { pilot = false, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN } = {}) {
  const z = paketZustand(paketId, liste, freigaben);
  if (z === 5 && !pilot) return "";
  const offen = merkmaleInVorbereitung(paketId, liste);
  if (pilot) {
    const nutzbar = (PAKET_MERKMALE[paketId] || []).filter((x) => !offen.includes(x));
    const namen = offen.map((x) => (liste.find((y) => y.merkmal === x) || { name: x }).name);
    return `Pilot – eingeschränkter Umfang: nutzbar: ${nutzbar.join(", ") || "nichts"}; in Vorbereitung: ${namen.join(", ") || "nichts"}.`;
  }
  return `In Vorbereitung (Zustand ${z}: ${PAKET_ZUSTAENDE[z]}).`;
}
