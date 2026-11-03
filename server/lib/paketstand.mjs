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
 * Selbststart bucht NIE ein Paket still zu (Betreiberentscheidung G9, Review F1): auch ab
 * Zustand 5 bucht der Betreiber bewusst. Die Konstante macht das prüfbar und ist die einzige
 * Stelle, die das ändern würde.
 */
export const SELBSTSTART_BUCHT_PAKET = false;

/**
 * Das Paket, das ein Selbststart für die Branche NEU zubucht — oder null. Heute immer null
 * (SELBSTSTART_BUCHT_PAKET = false); nur wenn jemand die Konstante bewusst umlegt, dann auch
 * nur bei Zustand 5. Bestehende Buchungen fasst das nicht an.
 */
export function paketFuerNeubuchung(paketId, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN,
  bucht = SELBSTSTART_BUCHT_PAKET) {
  return bucht && paketId && paketBuchbar(paketId, liste, freigaben) ? paketId : null;
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

/**
 * Ist der Betrieb im Pilot? Der Betreiber setzt ihn bewusst und je Betrieb:
 * preisgestaltung.pilot = { seit, von, grund } — der Grund ist Pflicht. Kein Standard- und kein
 * Migrationspfad setzt ihn; ein Pilot ohne Grund zählt nicht.
 */
export const pilotAktiv = (m) => {
  const p = m && m.preisgestaltung && m.preisgestaltung.pilot;
  return !!p && typeof p === "object" && typeof p.seit === "string" && TAGFORM.test(p.seit)
    && typeof p.von === "string" && p.von.trim() !== ""
    && typeof p.grund === "string" && p.grund.trim() !== "";
};

/* --------------------------------------------------------------------------
   ABRECHNUNGSGRUND (Betreiberentscheidung 2026-11-03, Punkt 5)

   Ein Paket wird nur berechnet, wenn Zustand 5 UND ein Abrechnungsgrund vorliegt:
     (a) ausdrückliche Zustimmung des Kunden: m.paketZustimmungen[] mit
         { paket, datum, preis, intervall, von } — Paket, Preis, wiederkehrende Kosten
         (Intervall) und Bestätiger stehen im Eintrag; oder
     (b) vom Betreiber dokumentierte vertragliche Grundlage: m.paketGrundlage =
         { datum, von, notiz }. Ob sie rechtlich wirkt, prüft der Betreiber/Jurist
         (rechtliches/agb.md, § 4 Abs. 4 — hier nicht geändert).
   Ohne beides: nicht berechnet, Hinweis „Zustimmung erforderlich“. Keine rückwirkende
   Berechnung: ein Grund gilt erst für Zeiträume, die nach seinem Datum beginnen.
   Beide Felder sind Vertragsfelder (nur der Betreiber schreibt, der Server prüft die Form).
   ------------------------------------------------------------------------ */
export const ZUSTIMMUNG_INTERVALL = "monatlich";
const text = (x) => typeof x === "string" && x.trim() !== "";

/** Ist dieser Zustimmungseintrag vollständig und für das Paket? */
export const zustimmungGueltig = (z, paketId) => !!z && typeof z === "object" && !Array.isArray(z)
  && z.paket === paketId && !!PAKET_MERKMALE[z.paket] && z.paket !== "kern"
  && typeof z.datum === "string" && TAGFORM.test(z.datum)
  && typeof z.preis === "number" && Number.isFinite(z.preis) && z.preis > 0
  && z.intervall === ZUSTIMMUNG_INTERVALL && text(z.von);

/** Ist die vom Betreiber dokumentierte vertragliche Grundlage vollständig? */
export const grundlageGueltig = (g) => !!g && typeof g === "object" && !Array.isArray(g)
  && typeof g.datum === "string" && TAGFORM.test(g.datum) && text(g.von) && text(g.notiz);

/**
 * Warum darf dieses Paket berechnet werden — "zustimmung", "vertrag" oder null? Nur ein Grund,
 * dessen Datum VOR dem Stichtag (Beginn des berechneten Zeitraums) liegt, zählt: keine
 * rückwirkende Berechnung.
 */
export function abrechnungsGrund(m, paketId, stichtag) {
  const vor = (d) => typeof stichtag === "string" && d < stichtag;
  const z = ((m && m.paketZustimmungen) || []).find((x) => zustimmungGueltig(x, paketId) && vor(x.datum));
  if (z) return "zustimmung";
  const g = m && m.paketGrundlage;
  return grundlageGueltig(g) && vor(g.datum) ? "vertrag" : null;
}

/** Serverregel: nur formgültige Zustimmungen bleiben, höchstens eine je Paket (die erste). */
export function zustimmungenBereinigen(liste) {
  const gesehen = new Set();
  return (Array.isArray(liste) ? liste : []).filter((z) => {
    if (!z || !zustimmungGueltig(z, z.paket) || gesehen.has(z.paket)) return false;
    gesehen.add(z.paket); return true;
  }).map((z) => ({ paket: z.paket, datum: z.datum, preis: z.preis, intervall: z.intervall, von: z.von }));
}
/** Serverregel: die Grundlage bleibt nur, wenn sie vollständig ist. */
export const grundlageBereinigen = (g) => (grundlageGueltig(g) ? { datum: g.datum, von: g.von, notiz: g.notiz } : undefined);

/** Anzeige: „In Vorbereitung (Zustand)“ bzw. Pilot mit nutzbaren und nicht nutzbaren Funktionen. */
export function paketAnzeige(paketId, { pilot = false, zustimmungFehlt = false, liste = BRANCHENMODULE,
  freigaben = PAKET_FREIGABEN } = {}) {
  const z = paketZustand(paketId, liste, freigaben);
  if (z === 5 && !pilot) return zustimmungFehlt ? "Zustimmung erforderlich – nicht berechnet." : "";
  const offen = merkmaleInVorbereitung(paketId, liste);
  if (pilot) {
    const nutzbar = (PAKET_MERKMALE[paketId] || []).filter((x) => !offen.includes(x));
    const namen = offen.map((x) => (liste.find((y) => y.merkmal === x) || { name: x }).name);
    return `Pilot – freigeschaltet, nicht berechnet (eingeschränkter Umfang): nutzbar: ${nutzbar.join(", ") || "nichts"}; in Vorbereitung: ${namen.join(", ") || "nichts"}.`;
  }
  return `In Vorbereitung (Zustand ${z}: ${PAKET_ZUSTAENDE[z]}). Berechnung ausgesetzt, bis das Paket freigegeben ist.`;
}

/**
 * Darf der Betreiber dieses Paket zubuchen? Zustand 5 immer; darunter nur in einem Betrieb mit
 * aktivem Pilot („freigeschaltet, nicht berechnet", Review F1). Die Kernplattform und unbekannte
 * Pakete nie. Abschalten ist keine Frage dieser Funktion: es geht immer.
 */
export const paketZubuchenErlaubt = (paketId, pilot, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) =>
  !!PAKET_MERKMALE[paketId] && paketId !== "kern"
  && (paketBuchbar(paketId, liste, freigaben) || !!pilot);

/**
 * Serverregel für den Betreiber-PUT: Die neue Paketliste darf nur Pakete ENTHALTEN, die schon
 * gespeichert waren oder die zubuchbar sind (Zustand 5 oder Pilot). Entfernen ist immer erlaubt.
 * Alles andere fällt auf den gespeicherten Stand zurück. Gibt immer ein Array zurück.
 */
export function paketeNachServerregel(alt, neu, pilot, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  const a = Array.isArray(alt) ? alt : [];
  if (!Array.isArray(neu)) return a;
  return neu.filter((id) => a.includes(id) || paketZubuchenErlaubt(id, pilot, liste, freigaben));
}
