/* ==========================================================================
   PAKETLOGIK — die Entscheidungen rund um Pakete, rein und prüfbar (G9, Review F3)

   Vorher standen Preis, Rechnungsposition, Zubuchen und Pilot als Quelltext in
   App.jsx und waren nur per Regex gesichert. Hier steht die Logik als reine,
   exportierte Funktionen; App.jsx und die Prüfanzeige (pruefung.jsx) rufen sie
   nur auf. Die Zustände selbst kommen aus server/lib/paketstand.mjs, die
   Rechenwege aus stufen.js (unverändert).

   Betreiberentscheidung (maßgeblich):
     - Ein Paket ist erst ab Zustand 5 regulär buchbar und abrechenbar.
     - Im Pilot darf der Betreiber auch Pakete unter Zustand 5 zubuchen
       („freigeschaltet, nicht berechnet"): das Paket steht in m.pakete, wird
       nie berechnet und erzeugt keine Rechnungsposition.
     - `kannMerkmal` schaltet NUTZBARE Merkmale eines gebuchten Pakets frei,
       geplante nie.
   ========================================================================== */
import { PAKETE, paketkosten } from "./stufen.js";
import { BRANCHENMODULE } from "../server/lib/branchenmodule.mjs";
import { PAKET_FREIGABEN, ZUSTIMMUNG_INTERVALL, merkmalNutzbar, paketBuchbar, pilotAktiv, paketZubuchenErlaubt,
  abrechnungsGrund } from "../server/lib/paketstand.mjs";

const heuteTag = () => new Date().toISOString().slice(0, 10);

/**
 * Ist ein Merkmal für diesen Betrieb freigeschaltet? Das Paket muss gebucht sein UND das
 * Merkmal nutzbar (nicht in der Registry oder Modul abgenommen). Ein geplantes Merkmal ist nie
 * freigeschaltet, auch nicht bei gebuchtem Paket.
 */
export function kannMerkmal(m, merkmal, liste = BRANCHENMODULE) {
  const aktiv = ["kern", ...((m && m.pakete) || [])];
  return merkmalNutzbar(merkmal, liste)
    && PAKETE.filter((p) => aktiv.includes(p.id)).some((p) => p.merkmale.includes(merkmal));
}

/**
 * Paketkosten eines Betriebs — der EINE Weg jeder Abrechnung. Berechnet wird nur bei Zustand 5,
 * ohne Pilot UND mit Abrechnungsgrund (Zustimmung des Kunden oder dokumentierte vertragliche
 * Grundlage), dessen Datum VOR dem Stichtag (Beginn des berechneten Zeitraums) liegt.
 * Ohne Grund: nicht berechnet (`ohneGrund` nennt diese Pakete: Hinweis „Zustimmung erforderlich").
 *
 * @param stichtag Beginn des berechneten Zeitraums (JJJJ-MM-TT), Vorgabe: heute
 */
export function mandantPaketkosten(m, paketeFrei = 0, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN, stichtag = heuteTag()) {
  const pilot = pilotAktiv(m);
  const k = paketkosten((m && m.pakete) || [], paketeFrei || 0, liste, freigaben, pilot,
    (id) => abrechnungsGrund(m, id, stichtag) !== null);
  const ohneGrund = pilot ? [] : k.nichtBerechnet.filter((p) => paketBuchbar(p.id, liste, freigaben));
  return { ...k, ohneGrund };
}

/** Summe der berechneten Paketaufpreise eines Betriebs (Betreiberkonsole, „Monatlicher Aufpreis"). */
export const paketAufpreisSumme = (m, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN, stichtag = heuteTag()) =>
  PAKETE.filter((p) => !pilotAktiv(m) && ((m && m.pakete) || []).includes(p.id) && paketBuchbar(p.id, liste, freigaben)
    && abrechnungsGrund(m, p.id, stichtag) !== null)
    .reduce((a, p) => a + (p.aufpreis || 0), 0);

/**
 * Zustimmungseintrag des Kunden zu einem Paket: Paket, Preis, wiederkehrende Kosten (Intervall),
 * Datum, Bestätiger. Nur für ein buchbares (Zustand 5), gebuchtes Paket.
 * @returns { ok: true, eintrag } oder { ok: false, grund }
 */
export function zustimmungErfassen(m, paketId, tag, von, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  const p = PAKETE.find((x) => x.id === paketId && !x.pflicht);
  if (!p) return { ok: false, grund: "Unbekanntes Paket." };
  if (!paketBuchbar(paketId, liste, freigaben)) return { ok: false, grund: "Dieses Paket ist noch nicht buchbar." };
  if (!((m && m.pakete) || []).includes(paketId)) return { ok: false, grund: "Das Paket ist nicht gebucht." };
  if (typeof von !== "string" || !von.trim()) return { ok: false, grund: "Es fehlt, wer zugestimmt hat." };
  return { ok: true, eintrag: { paket: paketId, datum: tag, preis: p.aufpreis, intervall: ZUSTIMMUNG_INTERVALL, von: von.trim() } };
}

/**
 * Die Rechnungspositionen für Branchenpakete. Ein nicht berechnetes Paket (Zustand < 5 oder Pilot)
 * erzeugt KEINE Position; ein in der Stufe enthaltenes steht mit null.
 *
 * @param p   { pakete, paketeFrei, paketeNichtBerechnet, anteil } — wie `preis()` es liefert
 * @param eur Formatierer für Beträge
 */
export function paketPositionen(p, eur = (x) => x) {
  const out = [];
  for (const pk of p.pakete || []) {
    const frei = (p.paketeFrei || []).some((x) => x.id === pk.id);
    if ((p.paketeNichtBerechnet || []).some((x) => x.id === pk.id)) continue;
    out.push({
      text: `Branchenpaket ${pk.name}${frei ? " (in der Stufe enthalten)" : ""}`,
      menge: "", einzel: eur(frei ? 0 : pk.aufpreis),
      betrag: eur(frei ? 0 : Math.round(pk.aufpreis * p.anteil * 100) / 100) });
  }
  return out;
}

/**
 * Paket zu- oder abschalten (Betreiberkonsole). Abschalten geht immer. Zubuchen nur ab Zustand 5
 * oder in einem Betrieb mit aktivem Pilot; die Kernplattform und unbekannte Pakete nie.
 * @returns { ok: true, pakete } oder { ok: false, grund }
 */
export function paketSchalten(m, paketId, an, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  const alt = (m && m.pakete) || [];
  if (!an) return { ok: true, pakete: alt.filter((p) => p !== paketId) };
  if (!paketZubuchenErlaubt(paketId, pilotAktiv(m), liste, freigaben))
    return { ok: false, grund: "Dieses Paket ist in Vorbereitung und nicht buchbar. "
      + "Zubuchen ist nur im Pilotbetrieb möglich (dann ohne Berechnung)." };
  return { ok: true, pakete: [...new Set([...alt, paketId])] };
}

/**
 * Pilot setzen oder beenden: die neue `preisgestaltung` des Betriebs (nur Betreiber, Protokoll im
 * Aufrufer). Setzen verlangt einen Grund; ohne Grund bleibt alles, wie es war (null).
 */
export function pilotSetzen(m, an, tag, grund) {
  const alt = { ...((m && m.preisgestaltung) || {}) };
  if (an) {
    if (typeof grund !== "string" || !grund.trim()) return null;
    alt.pilot = { seit: tag, von: "Betreiber", grund: grund.trim() };
  } else delete alt.pilot;
  return alt;
}
