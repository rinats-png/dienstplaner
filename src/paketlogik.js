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
import { kannMerkmal } from "../server/lib/paketliste.mjs";
import { PAKET_FREIGABEN, ZUSTIMMUNG_INTERVALL, TEXT_GRENZE, merkmalNutzbar, paketBuchbar, pilotAktiv, pilotImZeitraum,
  paketZubuchenErlaubt, abrechnungsGrund, paketTag, folgemonatsanfang } from "../server/lib/paketstand.mjs";

export { paketTag, folgemonatsanfang };

/** Erster Tag des Monats zu einem Tag JJJJ-MM-TT — der Anzeige- und Abrechnungsstichtag (Review N4). */
export const monatsanfang = (tag) => `${String(tag).slice(0, 7)}-01`;

/** Die gebuchten Pakete — nur eine echte Liste zählt (Review N3: keine Zeichenkette, kein Objekt). */
const gebucht = (m) => (m && Array.isArray(m.pakete) ? m.pakete : []);
/** Der aktuelle Aufpreis eines Pakets (Zielpreis aus stufen.js). */
const aufpreisVon = (id) => (PAKETE.find((p) => p.id === id) || {}).aufpreis;
const text = (x) => typeof x === "string" && x.trim() !== "" && x.trim().length <= TEXT_GRENZE;

/* kannMerkmal steht seit WP-I12b in server/lib/paketliste.mjs (gemeinsame Quelle mit dem Rechenkern). */
export { kannMerkmal };

/**
 * Paketkosten eines Betriebs — der EINE Weg jeder Abrechnung. Berechnet wird nur bei Zustand 5,
 * ohne Pilot im berechneten Monat UND mit Abrechnungsgrund (Zustimmung des Kunden oder je Paket
 * dokumentierte vertragliche Grundlage) zum AKTUELLEN Preis, dessen Datum VOR dem Stichtag (Beginn
 * des berechneten Zeitraums) liegt. Ohne Grund: nicht berechnet (`ohneGrund` nennt diese Pakete:
 * Hinweis „Zustimmung erforderlich"). `pilot`: ein Pilotzeitraum berührt den berechneten Monat.
 *
 * @param stichtag Beginn des berechneten Zeitraums (JJJJ-MM-TT), Vorgabe: Anfang des laufenden Monats
 */
export function mandantPaketkosten(m, paketeFrei = 0, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN,
  stichtag = monatsanfang(paketTag())) {
  const pilot = pilotImZeitraum(m, stichtag);
  const k = paketkosten(gebucht(m), paketeFrei || 0, liste, freigaben, pilot,
    (id) => abrechnungsGrund(m, id, stichtag, aufpreisVon(id)) !== null);
  const ohneGrund = pilot ? [] : k.nichtBerechnet.filter((p) => paketBuchbar(p.id, liste, freigaben));
  return { ...k, ohneGrund, pilot };
}

/** Summe der berechneten Paketaufpreise eines Betriebs (Betreiberkonsole, „Monatlicher Aufpreis"), ohne Freiplätze. */
export const paketAufpreisSumme = (m, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN, stichtag = monatsanfang(paketTag())) =>
  mandantPaketkosten(m, 0, liste, freigaben, stichtag).summe;

/**
 * Zustimmungseintrag des Kunden zu einem Paket: Paket, Preis, wiederkehrende Kosten (Intervall),
 * Datum, Bestätiger. Nur für ein buchbares (Zustand 5), gebuchtes Paket.
 * @returns { ok: true, eintrag } oder { ok: false, grund }
 */
export function zustimmungErfassen(m, paketId, tag, von, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  const p = PAKETE.find((x) => x.id === paketId && !x.pflicht);
  if (!p) return { ok: false, grund: "Unbekanntes Paket." };
  if (!paketBuchbar(paketId, liste, freigaben)) return { ok: false, grund: "Dieses Paket ist noch nicht buchbar." };
  if (!gebucht(m).includes(paketId)) return { ok: false, grund: "Das Paket ist nicht gebucht." };
  if (!text(von)) return { ok: false, grund: `Es fehlt, wer zugestimmt hat (höchstens ${TEXT_GRENZE} Zeichen).` };
  return { ok: true, eintrag: { paket: paketId, datum: tag, preis: p.aufpreis, intervall: ZUSTIMMUNG_INTERVALL, von: von.trim() } };
}

/**
 * Vertragliche Grundlage JE PAKET (Review M2): Paket, aktueller Preis, Intervall, Datum, Betreiber,
 * Verweis/Notiz (Pflicht). Nur für ein buchbares (Zustand 5), gebuchtes Paket.
 * @returns { ok: true, eintrag } oder { ok: false, grund }
 */
export function grundlageErfassen(m, paketId, tag, notiz, von, liste = BRANCHENMODULE, freigaben = PAKET_FREIGABEN) {
  const r = zustimmungErfassen(m, paketId, tag, von, liste, freigaben);
  if (!r.ok) return r;
  if (!text(notiz)) return { ok: false, grund: `Ohne Verweis keine Grundlage (höchstens ${TEXT_GRENZE} Zeichen).` };
  return { ok: true, eintrag: { ...r.eintrag, notiz: notiz.trim() } };
}

/**
 * Abschalten entzieht den Abrechnungsgrund des Pakets (Review M1): Zustimmung und Grundlage dieses
 * Pakets fallen weg; wer es wieder zubucht, braucht einen neuen Grund. Andere Pakete bleiben.
 */
export function grundEntziehen(m, paketId) {
  const ohne = (x) => (Array.isArray(x) ? x : []).filter((e) => !(e && e.paket === paketId));
  return { paketZustimmungen: ohne(m && m.paketZustimmungen), paketGrundlage: ohne(m && m.paketGrundlage) };
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
  const alt = gebucht(m);
  if (!an) return { ok: true, pakete: alt.filter((p) => p !== paketId) };
  if (!paketZubuchenErlaubt(paketId, pilotAktiv(m), liste, freigaben))
    return { ok: false, grund: "Dieses Paket ist in Vorbereitung und nicht buchbar. "
      + "Zubuchen ist nur im Pilotbetrieb möglich (dann ohne Berechnung)." };
  return { ok: true, pakete: [...new Set([...alt, paketId])] };
}

/**
 * Pilot setzen oder beenden: die neue `preisgestaltung` des Betriebs (nur Betreiber, Protokoll im
 * Aufrufer). Setzen verlangt einen Grund; ohne Grund bleibt alles, wie es war (null). Ein laufender
 * Pilot bleibt unverändert. Beenden schreibt den Zeitraum { seit, bis, von, grund } in
 * `pilotHistorie` (Review M5) — die Abrechnung prüft den Rechnungsmonat gegen alle Zeiträume.
 */
export function pilotSetzen(m, an, tag, grund) {
  const alt = { ...((m && m.preisgestaltung) || {}) };
  if (an) {
    if (!text(grund)) return null;
    if (pilotAktiv(m)) return alt;
    alt.pilot = { seit: tag, von: "Betreiber", grund: grund.trim() };
  } else {
    if (pilotAktiv(m)) {
      const p = alt.pilot;
      alt.pilotHistorie = [...(Array.isArray(alt.pilotHistorie) ? alt.pilotHistorie : []),
        { seit: p.seit, bis: tag, von: p.von, grund: p.grund }];
    }
    delete alt.pilot;
  }
  return alt;
}

/**
 * Review N-A: Nach einem erfolgreichen Speichern übernimmt die Betreiberkonsole die Vertragsfelder der
 * Pakete (pakete, paketZustimmungen, paketGrundlage, preisgestaltung inkl. Pilot und Historie) aus der
 * Serverantwort. Der Server setzt Datum, Pilot-Beginn und -Ende; der Client behält sonst keinen
 * Serverstand. Ändert sich nichts, kommt dasselbe Objekt zurück (kein Neuschreiben); andere Felder
 * bleiben unberührt, ein unbekannter Betrieb wird übergangen.
 */
export function vertragsstandUebernehmen(db, stand) {
  if (!db || !Array.isArray(db.mandanten) || !Array.isArray(stand)) return db;
  let geaendert = false;
  const mandanten = db.mandanten.map((m) => {
    const s = m && stand.find((x) => x && x.id === m.id);
    if (!s) return m;
    const neu = { ...m };
    /* Fehlend und leer gelten als gleich (kein Schreiben ohne Grund). */
    const norm = (f, v) => (v === undefined ? (f === "preisgestaltung" ? {} : []) : v);
    for (const f of ["pakete", "paketZustimmungen", "paketGrundlage", "preisgestaltung"])
      if (Object.hasOwn(s, f) && JSON.stringify(norm(f, s[f])) !== JSON.stringify(norm(f, m[f]))) { neu[f] = s[f]; geaendert = true; }
    return geaendert && Object.keys(neu).some((f) => neu[f] !== m[f]) ? neu : m;
  });
  return geaendert ? { ...db, mandanten } : db;
}
