/* ==========================================================================
   PLANER-OBERFLÄCHE, Stufe 1 (WP-I7 Teil 6, Betreiberentscheidung 27.11.: Bedienbarkeit vor weiteren Server-Teilen)

   Reine Teile für die Ansichten src/ansichten/planer-steuerung.jsx (Schalter und Betriebsmodus des Planers) und
   src/ansichten/anheftungen.jsx (Anheften und Lösen einzelner Einteilungen). Keine Uhr, kein Netz, keine Ablage.

   Grundsätze:
   - Rechte: dieselben Tabellen wie der Server (KI_RECHTE, darfAnheften), nicht rohe Rollenstrings an der Oberfläche; die
     Rolle ist die des Zugangs (so entscheidet der Server), sonst die der Person. Entschieden wird allein am Server.
   - Ehrlich: Gezeigt wird der WIRKSAME Zustand (planerModusWirksam, dieselbe Funktion wie der Server). Solange der Planer global nicht
     freigegeben ist (PLANER_AN, bleibt AUS), steht dort „AUS“ — nie ein Schalter als wirksam. Die Voraussetzungen des Betriebs
     werden einzeln genannt (Pause, Hauptschalter, Frage nach der Vertretung, Schalter des Planers, Planungsreife).
   - Fail closed: unlesbarer Stand = AUS und Warnung; was nicht geprüft werden kann, gilt als nicht erfüllt.
   ========================================================================== */
import { PLANER_AN, planerModusWirksam } from "../../server/lib/engine/planer.mjs";
import { verteilungAufwand, verteilungVorbereiten, verteilungBewerten, nachtZaehlen, VERTEILUNG_HINWEIS } from "../../server/lib/engine/verteilung.mjs";
import { aktiveVorgaben, VORGABEN_WIRKUNG_GRENZE } from "../../server/lib/vorgaben.mjs";
import { kiSteuerungLesen, kiSteuerungUnlesbar, kiPauseAktiv, kiPlanerEntscheidung, KI_RECHTE, KI_PLANER_MODI } from "../../server/lib/ki-steuerung.mjs";
import { darfAnheften } from "../../server/lib/anheften.mjs";
import { ANGEHEFTET_FELD, anheftungenLesen, anheftungSchluesselOk } from "../../server/lib/engine/anheften.mjs";
import { personTag } from "../../server/lib/engine/plan.mjs";
import { pad, dim_ } from "../regelwerk.js";

export const PLANER_TEXTE = Object.freeze({
  titel: "Planer: Schalter und Betriebsmodus",
  wirksam: "Wirksam jetzt",
  globalAus: "Der Planer ist global nicht freigegeben (AUS). Schalter und Modus dieses Betriebs sind nur vorgemerkt und wirken erst nach der Freigabe.",
  wirksamAusGrund: "Der Planer ist im Betrieb derzeit aus, weil Voraussetzungen fehlen (siehe unten).",
  schalter: "Planer für diesen Betrieb",
  schalterAn: "vorgemerkt: an",
  schalterAus: "vorgemerkt: aus",
  schalterUnlesbar: "Der gespeicherte Schalter des Planers ist nicht lesbar. Es gilt AUS, bis die Leitung ihn neu setzt.",
  modus: "Betriebsmodus",
  modusUnlesbar: "Der gespeicherte Betriebsmodus ist nicht lesbar. Es gilt AUS, bis die Leitung ihn neu wählt.",
  modusNichtGewaehlt: "noch nicht gewählt (nach der Freigabe gilt „Auf Knopfdruck“)",
  steuerungUnlesbar: "Die Intelligence-Steuerung dieses Betriebs ist nicht lesbar. Der Planer bleibt AUS.",
  nurLesen: "Nur lesen: Ändern kann die Leitung.",
  demoLesen: "In der Demo lässt sich der Planer nicht ändern.",
  voraussetzungen: "Voraussetzungen im Betrieb",
  voraussetzungenHinweis: "Der Planer läuft nur, wenn alles erfüllt ist. Die Planungsreife gilt für den genannten Monat.",
  eingeschraenkt: "eingeschränkt: Planungsreife fehlt",
  eingeschraenktHinweis: "Der Planer ist im Betrieb wirksam, aber für diesen Monat entsteht kein Vorschlag, solange die Planungsreife fehlt.",
  vorgemerkt: "vorgemerkt",
  ok: "erfüllt",
  fehlt: "fehlt",
  speichern: "Wird gespeichert …",
});

/** Anzeigename je Modus (Wert des Servers → Text). */
export const MODUS_TEXT = Object.freeze({
  aus: { name: "AUS", hinweis: "Der Planer erstellt keine Vorschläge." },
  knopfdruck: { name: "Auf Knopfdruck", hinweis: "Ein Vorschlag entsteht nur, wenn die Planung ihn ausdrücklich anfordert." },
  automatisch: { name: "Automatisch", hinweis: "Der Planer darf Vorschläge ohne Knopfdruck erstellen. Bitte nur bewusst wählen." },
});

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const TEXT = { leitung: "Leitung", planer: "Planung" };

/** Die Rolle, nach der der Server entscheidet: die des Zugangs, sonst die der Person. @param {any} sitz */
export function sitzRolle(sitz) {
  if (!sitz) return null;
  if (typeof sitz.zugangRolle === "string" && sitz.zugangRolle) return sitz.zugangRolle;
  return sitz.person && typeof sitz.person.rolle === "string" ? sitz.person.rolle : null;
}

/** Bezeichnung der Rolle für die Angabe „durch“ beim Speichern. */
export const sitzRolleText = (sitz) => TEXT[sitzRolle(sitz)] || "Leitung";

/**
 * Was die Oberfläche anbietet (Anzeige; der Server entscheidet).
 * @param {any} sitz @param {{ demo?: boolean }} [o]
 * @returns {{ sehen: boolean, steuern: boolean, anheften: boolean }}
 */
export function planerRechte(sitz, o = {}) {
  const rolle = sitzRolle(sitz);
  const demo = !!(o && o.demo) || !!(sitz && sitz.demo === true);
  const kiRecht = (r) => !!rolle && Object.hasOwn(KI_RECHTE, rolle) && KI_RECHTE[rolle].includes(r);
  return {
    sehen: (rolle === "leitung" || rolle === "planer") && !!sitz && !!sitz.mandant,
    steuern: !demo && kiRecht("planerModus") && kiRecht("planerSchalter"),
    anheften: !demo && !!rolle && darfAnheften({ rolle, demo }),
  };
}

/**
 * Zustand des Planers für die Anzeige.
 * @param {any} einstellungen Einstellungen des Betriebs
 * @param {{ freigegeben?: boolean, reife?: any, monatText?: string }} [o]
 *   freigegeben: globale Freigabe (Vorgabe PLANER_AN; Prüfungen setzen sie ausdrücklich); reife: Ergebnis von planungsreife für den Monat
 */
export function planerZustand(einstellungen, o = {}) {
  const freigegeben = o.freigegeben === undefined ? PLANER_AN === true : o.freigegeben === true;
  let steuerungUnlesbar = false, s = null;
  try { steuerungUnlesbar = kiSteuerungUnlesbar(einstellungen); s = steuerungUnlesbar ? null : kiSteuerungLesen(einstellungen); } catch { steuerungUnlesbar = true; s = null; }
  const sicher = (fn, sonst) => { try { return fn(); } catch { return sonst; } };
  const wirksam = sicher(() => planerModusWirksam(einstellungen, freigegeben), "aus");
  const pause = steuerungUnlesbar ? true : sicher(() => kiPauseAktiv(einstellungen), true);
  const frage = s && s.betriebsratFrage ? s.betriebsratFrage.antwort : null;
  const pauseAufgehoben = !!s && ((!!s.leitungPause && s.leitungPause.aktiv === false) || (!!s.pause && s.pause.aktiv === false));

  /** @type {{ id: string, ok: boolean, text: string }[]} */
  const zeilen = [];
  zeilen.push({ id: "global", ok: freigegeben, text: freigegeben ? "Planer vom Betreiber freigegeben" : "Planer global nicht freigegeben (AUS)" });
  zeilen.push({ id: "pause", ok: !pause, text: !pause ? "keine Pause der Intelligence-Funktionen"
    : steuerungUnlesbar ? "Steuerung nicht lesbar, gilt als Pause" : "Intelligence ist pausiert (Betriebsrat oder Leitung)" });
  zeilen.push({ id: "hauptschalter", ok: !!s && !!s.betrieb && s.betrieb.an === true,
    text: s && s.betrieb && s.betrieb.an === true ? "Intelligence für diesen Betrieb: an" : "Intelligence für diesen Betrieb: aus" });
  zeilen.push({ id: "frage", ok: frage === "nein" || (frage === "ja" && pauseAufgehoben),
    text: frage === null ? "Frage nach Betriebsrat, Personalrat oder Mitarbeitervertretung: noch nicht beantwortet"
      : frage === "nein" ? "Frage nach Betriebsrat, Personalrat oder Mitarbeitervertretung: beantwortet (nein)"
        : pauseAufgehoben ? "Frage nach Betriebsrat, Personalrat oder Mitarbeitervertretung: beantwortet (ja), Pause aufgehoben"
          : "Frage nach Betriebsrat, Personalrat oder Mitarbeitervertretung: „ja“, die Leitung muss die Pause erst aufheben" });
  const schalterOk = !!s && !s.planerSchalterUngueltig && !!s.planerSchalter && s.planerSchalter.an === true;
  zeilen.push({ id: "schalter", ok: schalterOk, text: schalterOk ? "Schalter des Planers: an"
    : s && s.planerSchalterUngueltig ? "Schalter des Planers: nicht lesbar, gilt als aus" : "Schalter des Planers: aus" });
  const gespeichert = s && s.planerModus && !s.planerModusUngueltig && KI_PLANER_MODI.includes(s.planerModus.modus) ? s.planerModus.modus : null;
  const modusUnlesbar = !!s && s.planerModusUngueltig === true;
  zeilen.push({ id: "modus", ok: !modusUnlesbar && gespeichert !== "aus",
    text: modusUnlesbar ? "Betriebsmodus: nicht lesbar, gilt als AUS" : gespeichert === "aus" ? "Betriebsmodus: AUS gewählt"
      : `Betriebsmodus: ${gespeichert ? MODUS_TEXT[gespeichert].name : "noch nicht gewählt (Vorgabe: Auf Knopfdruck)"}` });
  const reife = o.reife && typeof o.reife === "object" ? o.reife : null;
  const fehlt = reife && Array.isArray(reife.luecken) ? reife.luecken.filter((l) => l && !l.hinweis && typeof l.text === "string").map((l) => l.text) : [];
  const monat = typeof o.monatText === "string" && o.monatText ? o.monatText : "diesen Monat";
  zeilen.push({ id: "reife", ok: !!reife && reife.bereit === true,
    text: !reife ? `Planungsreife für ${monat}: nicht prüfbar, gilt als nicht erfüllt`
      : reife.bereit === true ? `Planungsreife für ${monat}: erfüllt`
        : `Planungsreife für ${monat}: nicht erfüllt${fehlt.length ? ` – ${fehlt.slice(0, 4).join(" ")}${fehlt.length > 4 ? ` (und ${fehlt.length - 4} weitere Hinweise)` : ""}` : ""}` });
  /* Nie „erfüllt“ zeigen, wenn der Server die betrieblichen Voraussetzungen anders sieht: die eigene Auflistung ist nur die Erklärung. */
  const entscheidung = sicher(() => kiPlanerEntscheidung(einstellungen), "KI_EINGABE");
  const betrieblich = zeilen.filter((z) => z.id !== "global" && z.id !== "reife" && z.id !== "modus");
  if (entscheidung !== "OK" && betrieblich.every((z) => z.ok)) {
    zeilen.splice(zeilen.length - 1, 0, { id: "weitere", ok: false, text: "Eine weitere Voraussetzung im Betrieb ist nicht erfüllt" });
  }
  const wirksamNach = KI_PLANER_MODI.includes(wirksam) ? wirksam : "aus";
  return {
    freigegeben, wirksam: wirksamNach,
    steuerungUnlesbar, modusUnlesbar, schalterUnlesbar: !!s && s.planerSchalterUngueltig === true,
    schalterAn: schalterOk, modusGespeichert: gespeichert,
    voraussetzungen: zeilen,
    /* Nur wenn der Server den Planer wirksam sieht UND jede Zeile erfüllt ist (Planungsreife gilt für den Monat). */
    /* Der Server sieht den Planer wirksam, aber die Planungsreife des Monats fehlt: eingeschränkt (kein Vorschlag für diesen Monat). */
    reifeFehlt: wirksamNach !== "aus" && !zeilen.find((z) => z.id === "reife").ok,
    alleErfuellt: zeilen.every((z) => z.ok) && entscheidung === "OK" && wirksamNach !== "aus",
    fehlendeGruende: zeilen.filter((z) => !z.ok).map((z) => z.text),
  };
}

/* ------------------------------------------------------------------ Anheften */

/**
 * Welcher Wert würde angeheftet? Die Einteilung der Person an diesem Tag, so wie der Plan sie zeigt: der Eintrag in `abweichungen`,
 * sonst der Dienst aus Schichtfolge/Posten (oder „-“ = frei). Abwesenheit ohne eigenen Eintrag: nicht anheftbar (sonst entstünde ein
 * Dienst, den die Abwesenheit gerade ausblendet). Rein; wirft nie.
 * @param {any} m Betrieb @param {string} personId @param {string} tag JJJJ-MM-TT
 * @returns {{ ok: true, wert: string, schluessel: string } | { ok: false, grund: string }}
 */
export function einteilungZumAnheften(m, personId, tag) {
  try {
    const schluessel = `${personId}|${tag}`;
    if (!anheftungSchluesselOk(schluessel)) return { ok: false, grund: "Bitte Person und Tag wählen." };
    const p = (m && Array.isArray(m.personen) ? m.personen : []).find((x) => x && String(x.id) === String(personId));
    if (!p) return { ok: false, grund: "Die Person gehört nicht zum Betrieb." };
    const abw = m.abweichungen && typeof m.abweichungen === "object" ? m.abweichungen : {};
    if (Object.prototype.hasOwnProperty.call(abw, schluessel)) {
      const w = abw[schluessel];
      return { ok: true, wert: w === null || w === "" ? "-" : String(w), schluessel };
    }
    const t = personTag(m, p, tag);
    if (t.quelle === "extern") return { ok: false, grund: "An diesem Tag ist die Person nicht im Dienst des Betriebs." };
    if (t.abwesenheit) return { ok: false, grund: "An diesem Tag ist die Person abwesend. Anheften ist dann nicht möglich." };
    return { ok: true, wert: t.dienstId ? String(t.dienstId) : "-", schluessel };
  } catch {
    return { ok: false, grund: "Die Einteilung ließ sich nicht prüfen." };
  }
}

/** Die Karte im Betrieb, wie gespeichert (Kopie); unlesbar: null. @param {any} m */
function karteKopie(m) {
  const l = anheftungenLesen(m);
  if (!l.ok) return null;
  const k = m && m[ANGEHEFTET_FELD];
  return istObjekt(k) ? { ...k } : {};
}

/**
 * Der Betrieb mit einer neu angehefteten Einteilung: der Wert in `abweichungen` (der Server leitet keinen Dienst her) und der Eintrag
 * in der Karte (ohne Stempel: den setzt der Server). Ein früherer Vermerk „aufgehoben“ wird durch den neuen Eintrag ersetzt.
 * @param {any} m @param {string} schluessel @param {string} wert
 * @returns {any | null} null bei unlesbarer Karte (dann wird nichts geschrieben)
 */
export function mitAnheftung(m, schluessel, wert) {
  const k = karteKopie(m);
  if (!k || !anheftungSchluesselOk(schluessel) || typeof wert !== "string" || !wert) return null;
  return { ...m, abweichungen: { ...(istObjekt(m.abweichungen) ? m.abweichungen : {}), [schluessel]: wert }, [ANGEHEFTET_FELD]: { ...k, [schluessel]: { aktiv: true } } };
}

/** Der Betrieb ohne die Anheftung dieser Einteilung (Lösen). Die Einteilung selbst bleibt. @returns {any | null} null bei unlesbarer Karte */
export function ohneAnheftung(m, schluessel) {
  const k = karteKopie(m);
  if (!k || !anheftungSchluesselOk(schluessel)) return null;
  delete k[schluessel];
  return { ...m, [ANGEHEFTET_FELD]: k };
}

/**
 * Hat der Server die Anheftung wirklich so übernommen? Geprüft am zurückgelesenen Betrieb; fehlt er oder weicht etwas ab: nein.
 * @param {"anheften" | "loesen"} art @param {string} schluessel @param {string | undefined} wert @param {any} serverM
 */
export function anheftungBestaetigt(art, schluessel, wert, serverM) {
  if (!istObjekt(serverM)) return false;
  const l = anheftungenLesen(serverM);
  if (!l.ok) return false;
  if (art === "anheften") {
    const abw = istObjekt(serverM.abweichungen) ? serverM.abweichungen : {};
    return l.aktiv.has(schluessel) && Object.prototype.hasOwnProperty.call(abw, schluessel) && String(abw[schluessel]) === String(wert);
  }
  /* Lösen: Der Serverstand muss die Karte tragen (Leitung und Planung bekommen sie; fehlt sie in der Sicht, ist das keine Bestätigung). */
  return Object.prototype.hasOwnProperty.call(serverM, ANGEHEFTET_FELD) && istObjekt(serverM[ANGEHEFTET_FELD]) && !l.aktiv.has(schluessel);
}

/** Die Tage eines Monats (JJJJ-MM-TT) für die Auswahl; ungültiger Monat: leer. @param {string} ym JJJJ-MM */
export function tageImMonat(ym) {
  const [y, mo] = String(ym).split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || mo < 1 || mo > 12) return [];
  return Array.from({ length: dim_(y, mo - 1) }, (_, i) => `${ym}-${pad(i + 1)}`);
}

/* ------------------------------------------------------------------ Verteilung (Stufe 2, nur lesen) */

/**
 * Zahl als deutscher Text für die Verteilungsanzeige: Dezimalkomma, höchstens zwei Nachkommastellen, ohne überflüssige Nullen
 * („1,5“, „6“). Rein rechnerisch (kein Intl, keine ICU-Daten), daher in jeder Umgebung gleich. Kein Wert wird auf „0“ gerundet,
 * der es nicht ist; kein Zahlenwert: „–“. Wirft nie.
 * @param {unknown} v
 */
export function zahlDe(v) {
  const x = typeof v === "number" ? v : (v === null || v === undefined || v === "" ? NaN : Number(v));
  if (!Number.isFinite(x)) return "–";
  const a = Math.abs(x), r = Math.round(a * 100) / 100;
  if (r === 0) return a === 0 ? "0" : (x < 0 ? "über −0,01" : "unter 0,01");
  return `${x < 0 ? "−" : ""}${r.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",")}`;
}

/** Texte zu den Gründen je Vorgabe (Wert `grund` des Servers; keine Zahl und keine Person im Text). Eine Quelle für die Ansicht und die Prüfung. */
export const VERTEILUNG_VORGABE_GRUND = Object.freeze({
  wunsch: "Eine Vorgabe mit der Stärke Wunsch wird nicht bewertet.",
  aufwand: "Der Rechenaufwand für diesen Monat war zu groß; die Vorgabe wurde nicht bewertet.",
  zu_viele_vorgaben: "Es gibt mehr aktive Vorgaben, als zugleich bewertet werden; diese wurde nicht bewertet.",
  groesse_nicht_bewertet: "Diese Größe wird noch nicht bewertet (bewertet werden nur Nachtdienste je Person und Kalendermonat).",
  nicht_auswertbar: "Die Parameter der Vorgabe sind nicht auswertbar.",
  keine_nachtdienstart: "Der Betrieb hat keine Nachtdienstart; es gibt nichts zu vergleichen.",
  weniger_als_zwei: "Weniger als zwei vergleichbare Personen; es gibt nichts zu vergleichen.",
  geltung_teilweise: VERTEILUNG_HINWEIS.geltung_teilweise,
  personen_nicht_bewertbar: "Verteilung nicht bewertbar: Der Wert einzelner Personen ist unbekannt (siehe „Nicht bewertbar“ bei den Personen).",
});
/** Texte zu den Gründen je Person (Kennungen aus VERTEILUNG_GRUENDE; ohne Merkmal der Person, nur was für den Plan zählt). */
export const VERTEILUNG_PERSON_GRUND = Object.freeze({
  geltung_teilweise: "Die Vorgabe gilt nur an einem Teil des Monats.",
  geltung_offen: "An einzelnen Tagen ist nicht entscheidbar, ob die Vorgabe gilt.",
  eintritt_austritt: "Eintritt oder Austritt im Monat; der Wert ist nicht vergleichbar.",
  nacht_teilweise_moeglich: "Nachtdienst ist nur an einem Teil des Monats möglich.",
  abwesenheit: "Abwesenheit anderer Art als Urlaub oder Krankheit im Monat.",
  teilzeitquote_offen: "Die Teilzeitquote lässt sich nicht bestimmen (Teilzeit wird bei dieser Vorgabe anteilig umgerechnet).",
  kein_nachtdienst_moeglich: "Nachtdienst ist im ganzen Monat nicht möglich; nicht in der Vergleichsgruppe.",
  nicht_im_schichtdienst: "Nicht im Schichtdienst; nicht in der Vergleichsgruppe.",
  ganzer_monat_abwesend: "Ganzer Monat Urlaub oder Krankheit; nicht in der Vergleichsgruppe.",
});
const GRUND_UNBEKANNT = "Grund nicht bewertbar";
const grundVorgabeText = (g) => (typeof g === "string" && Object.hasOwn(VERTEILUNG_VORGABE_GRUND, g) ? VERTEILUNG_VORGABE_GRUND[g] : GRUND_UNBEKANNT);
const grundPersonText = (g) => (typeof g === "string" && Object.hasOwn(VERTEILUNG_PERSON_GRUND, g) ? VERTEILUNG_PERSON_GRUND[g] : GRUND_UNBEKANNT);

export const VERTEILUNG_ZUSTAND = Object.freeze({ erfuellt: "erfüllt", nicht_erfuellt: "nicht erfüllt", nicht_bewertbar: "nicht bewertbar" });
const STAERKE_TEXT = Object.freeze({ muss: "Muss", soll: "Soll", wunsch: "Wunsch" });

/** Gibt es im Betrieb eine aktive Verteilungsvorgabe? (billig; ohne sie zeigt die Ansicht nichts) @param {any} m */
export function hatVerteilungsvorgabe(m) {
  try { return aktiveVorgaben(m && m.vorgaben).some((v) => v.regelart === "verteilungsregel"); } catch { return false; }
}

/**
 * Verteilungsergebnis des Plans eines Monats, wie er jetzt ist (Bestand, Schichtfolge, Angeheftetes; kein Planervorschlag). Dieselbe
 * Rechnung wie der Planer (server/lib/engine/verteilung.mjs), nur gelesen: nichts wird geschrieben oder eingeteilt. Wirft nie; was nicht
 * gerechnet werden kann, ist „nicht bewertbar“ (nie „erfüllt“).
 * @param {any} m Betrieb @param {string} ym JJJJ-MM
 * @returns {{ ok: true, keine: boolean, bewertung: any } | { ok: false }}
 */
export function verteilungErgebnis(m, ym) {
  try {
    const tage = tageImMonat(ym);
    if (!tage.length || !m || typeof m !== "object") return { ok: false };
    const vt = verteilungVorbereiten(m, tage, verteilungAufwand(m, tage) <= VORGABEN_WIRKUNG_GRENZE.aufwand);
    if (!vt) return { ok: true, keine: true, bewertung: null };
    return { ok: true, keine: false, bewertung: verteilungBewerten(vt, nachtZaehlen(m, vt)) };
  } catch { return { ok: false }; }
}

/**
 * Anzeigeform eines Verteilungsergebnisses (aus verteilungErgebnis oder dem Feld `verteilung` eines Planvorschlags): je Vorgabe genau
 * einer der Zustände erfüllt / nicht erfüllt / nicht bewertbar. „Erfüllt“ nur bei Status erfuellt des Regelbaukastens; „nicht erfüllt“ nur,
 * wenn alle Werte bekannt sind; alles andere (offen, nicht bewertet, nicht anwendbar, unbekannter Status) ist nicht bewertbar.
 * @param {any} bewertung @param {any} m Betrieb (Namen, Vorgabenamen, Teilzeitregel)
 */
export function verteilungAnzeige(bewertung, m) {
  const regeln = bewertung && Array.isArray(bewertung.regeln) ? bewertung.regeln : [];
  const personen = m && Array.isArray(m.personen) ? m.personen : [];
  const vorgaben = m && Array.isArray(m.vorgaben) ? m.vorgaben : [];
  const name = (pid) => { const p = personen.find((x) => x && String(x.id) === String(pid)); return p ? (`${p.vorname || ""} ${p.nachname || ""}`.trim() || "Person") : "Person"; };
  const sortiert = (l) => l.map((x) => ({ ...x, name: name(x.personId) })).sort((a, b) => a.name.localeCompare(b.name, "de") || (a.personId < b.personId ? -1 : 1));
  const liste = regeln.filter(istObjekt).map((r) => {
    const v = vorgaben.find((x) => x && String(x.id) === String(r.vorgabeId));
    const zustand = r.status === "erfuellt" ? "erfuellt" : r.status === "verletzt" && !r.grund ? "nicht_erfuellt" : "nicht_bewertbar";
    return {
      vorgabeId: String(r.vorgabeId), name: v && typeof v.name === "string" && v.name ? v.name : "Verteilungsvorgabe",
      staerke: STAERKE_TEXT[r.staerke] || "", maxAbweichung: r.maxAbweichung, zustand, zustandText: VERTEILUNG_ZUSTAND[zustand],
      grund: zustand === "nicht_bewertbar" ? grundVorgabeText(r.grund) : null,
      teilzeitAnteilig: !!v && istObjekt(v.ausnahmen) && v.ausnahmen.teilzeitAnteilig === true,
      spannweite: typeof r.spannweite === "number" ? r.spannweite : null, ueberschreitung: typeof r.ueberschreitung === "number" ? r.ueberschreitung : null,
      personen: sortiert(Array.isArray(r.personen) ? r.personen : []),
      nichtBewertbar: sortiert(Array.isArray(r.nichtBewertbar) ? r.nichtBewertbar : []).map((x) => ({ ...x, grundText: grundPersonText(x.grund) })),
      ausserhalb: sortiert(Array.isArray(r.ausserhalb) ? r.ausserhalb : []).map((x) => ({ ...x, grundText: grundPersonText(x.grund) })),
    };
  });
  const zaehl = (z) => liste.filter((x) => x.zustand === z).length;
  return { regeln: liste, erfuellt: zaehl("erfuellt"), nichtErfuellt: zaehl("nicht_erfuellt"), nichtBewertbar: zaehl("nicht_bewertbar"),
    /* Insgesamt nur dann „bewertet“, wenn der Server es so sieht (kein Rang ohne vollständig Bewertbares). */
    gesamtBewertet: !!bewertung && bewertung.bewertet === true };
}

/* ------------------------------------------------------------------ Planvorschlag übernehmen (WP-I7 Stufe 3) */

/**
 * Text je Kennung des Servers (server/lib/planer-aktion.mjs STATUS). Eine Quelle für die Aktionen, die Ansicht und die Prüfung:
 * Servertexte und Rohkennungen erscheinen nie in der Oberfläche. Jeder Text sagt, ob etwas verändert wurde; „unklar“ nennt den
 * Weg („erst neu laden, nie blind wiederholen“).
 */
export const VORSCHLAG_FEHLER = Object.freeze({
  "anfrage-ungueltig": "Die Anfrage war nicht gültig. Es wurde nichts verändert. Bitte die Seite neu laden und noch einmal versuchen.",
  "monat-ungueltig": "Der Monat ist ungültig. Es wurde nichts verändert.",
  "auswahl-ungueltig": "Die Auswahl passt nicht zum Vorschlag. Es wurde nichts verändert. Bitte einen neuen Vorschlag erstellen.",
  "auswahl-nicht-im-vorschlag": "Die Auswahl passt nicht zum Vorschlag. Es wurde nichts verändert. Bitte einen neuen Vorschlag erstellen.",
  "auswahl-leer": "Bitte mindestens eine Einteilung auswählen.",
  "auswahl-doppelt": "Die Auswahl enthält eine Einteilung mehrfach. Es wurde nichts verändert. Bitte einen neuen Vorschlag erstellen.",
  "auswahl-zu-gross": "Die Auswahl ist zu groß. Es wurde nichts verändert. Bitte weniger Einteilungen auf einmal auswählen.",
  "vorschlag-zu-gross": "Der Vorschlag ist zu groß, um ihn zu übernehmen. Es wurde nichts verändert. Bitte den Monat in kleineren Schritten planen.",
  "keine-berechtigung": "Dafür fehlt die Berechtigung. Vorschläge übernehmen und zurücknehmen dürfen nur Leitung und Planung.",
  "vorschlag-unbekannt": "Dieser Vorschlag ist nicht mehr vorhanden, zum Beispiel nach einem Neustart des Servers. Es wurde nichts übernommen. Bitte einen neuen Vorschlag erstellen.",
  "rueckgaengig-unbekannt": "Zu dieser Übernahme gibt es nichts mehr zurückzunehmen: Sie ist schon zurückgenommen oder die Frist ist vorbei. Die Liste wird neu geladen.",
  "betrieb-unbekannt": "Der Betrieb wurde nicht gefunden. Es wurde nichts verändert. Bitte neu anmelden.",
  "vorschlag-abgelaufen": "Der Vorschlag ist abgelaufen (er gilt höchstens 24 Stunden). Es wurde nichts übernommen. Bitte einen neuen Vorschlag erstellen.",
  "rueckgaengig-abgelaufen": "Die Frist zum Zurücknehmen ist abgelaufen. Die Einteilungen bleiben, wie sie sind; Änderungen bitte von Hand vornehmen.",
  "eintrag-abgelehnt": "Mindestens eine ausgewählte Einteilung ist so nicht mehr möglich. Es wurde nichts übernommen. Die Gründe stehen bei den Einteilungen; bitte abwählen oder einen neuen Vorschlag erstellen.",
  "nachpruefung-nicht-bestanden": "Die Prüfung der ganzen Auswahl hat einen Verstoß ergeben (Regeln, Besetzung oder Vorgaben). Es wurde nichts übernommen. Bitte die Auswahl verkleinern oder einen neuen Vorschlag erstellen.",
  "nicht-planungsreif": "Dieser Monat ist noch nicht planungsreif; es entsteht kein Vorschlag. Was fehlt, steht unten.",
  "vorschlag-ungueltig": "Der Planer konnte keinen gültigen Vorschlag erstellen. Es wurde nichts verändert.",
  "vorschlag-ohne-basis": "Der Vorschlag ist unvollständig und kann nicht übernommen werden. Es wurde nichts verändert. Bitte einen neuen Vorschlag erstellen.",
  "rueckgaengig-ungueltig": "Die gespeicherten Daten dieser Übernahme sind nicht lesbar; eine Rücknahme ist nicht möglich. Änderungen bitte von Hand vornehmen.",
  "betrieb-ungueltig": "Der Stand des Betriebs ist für diese Aktion nicht lesbar oder nicht zulässig. Es wurde nichts verändert.",
  "bestand-grenze": "Der Betrieb würde dadurch die zulässige Größe überschreiten. Es wurde nichts verändert.",
  "zu-viele-vorschlaege": "Es liegen zu viele Vorschläge vor. Es wurde nichts verändert. Bitte später noch einmal versuchen.",
  "pruefung-fehlgeschlagen": "Die Prüfung ist fehlgeschlagen. Es wurde nichts verändert. Bitte später noch einmal versuchen.",
  "anwendung-fehlgeschlagen": "Die Übernahme ließ sich nicht berechnen. Es wurde nichts verändert.",
  "schreiben-unklar": "Ob die Änderung gespeichert wurde, ist unklar. Bitte nicht erneut absenden: zuerst den Plan neu laden und prüfen, ob die Einteilungen schon eingetragen sind.",
  "schreiben-fehlgeschlagen": "Das Speichern ist gerade nicht möglich. Es wurde nichts verändert. Bitte gleich noch einmal versuchen.",
  "planer-nicht-freigegeben": "Der Planer ist nicht freigegeben. Es entsteht kein Vorschlag und nichts wird übernommen. Eine frühere Übernahme lässt sich weiter zurücknehmen.",
  "planer-pausiert": "Die Intelligence-Funktionen sind pausiert (Betriebsrat oder Leitung). Es entsteht kein Vorschlag und nichts wird übernommen.",
  "planer-im-betrieb-aus": "Der Planer ist in diesem Betrieb aus, oder eine Voraussetzung fehlt (siehe „Voraussetzungen im Betrieb“ in den Einstellungen). Es wurde nichts verändert.",
  "vergangen": "Dieser Zeitraum liegt in der Vergangenheit. Rückwirkend wird nichts geändert.",
  "monat-abgeschlossen": "Der Monat ist abgeschlossen. Darin wird nichts mehr geändert.",
  "bereits-uebernommen": "Dieser Vorschlag ist schon übernommen. Bitte den Plan neu laden.",
  "uebernahme-laeuft": "Dieser Vorschlag wird gerade übernommen. Bitte kurz warten und den Plan neu laden; nicht erneut absenden.",
  "seit-vorschlag-geaendert": "Der Plan oder die Regeln haben sich seit dem Vorschlag geändert. Der Vorschlag ist verbraucht, es wurde nichts übernommen. Bitte einen neuen Vorschlag erstellen.",
  "konflikt": "Der Betrieb wurde gleichzeitig geändert. Es wurde nichts übernommen. Der Plan wird neu geladen; bitte die Auswahl danach erneut prüfen.",
  "protokoll-voll": "Das Protokoll des Moduls ist voll. Es wurde nichts übernommen. Bitte die Leitung informieren.",
  "bereits-rueckgaengig": "Diese Übernahme ist schon zurückgenommen. Es gibt nichts mehr zu tun.",
  "seit-uebernahme-geaendert": "Seit der Übernahme wurden die Einteilungen verändert. Eine Rücknahme würde diese Änderungen überschreiben; sie ist deshalb nicht möglich. Bitte von Hand ändern.",
  "bestaetigung-fehlt": "Es fehlt die ausdrückliche Bestätigung. Es wurde nichts verändert.",
  "anheftungen-unlesbar": "Die Anheftungen des Betriebs sind nicht lesbar. Aus Vorsicht wird nichts verändert, bis die Leitung sie neu gesetzt hat.",
  "zeit-ungueltig": "Die Zeitangabe des Servers war nicht verwertbar. Es wurde nichts verändert.",
});
/** Texte nach Statuscode, wenn der Server keine bekannte Kennung nennt (nie ein Servertext). */
const VORSCHLAG_STATUS_TEXT = Object.freeze({
  401: "Die Anmeldung ist abgelaufen. Bitte neu anmelden. Es wurde nichts verändert.",
  403: VORSCHLAG_FEHLER["keine-berechtigung"],
  413: "Die Anfrage ist zu groß. Es wurde nichts verändert.",
  429: "Zu viele Anfragen in kurzer Zeit. Es wurde nichts verändert. Bitte etwa eine Minute warten und dann noch einmal versuchen.",
});
const VORSCHLAG_STANDARD = "Der Server hat die Anfrage nicht ausgeführt. Es wurde nichts verändert. Bitte den Plan neu laden und noch einmal versuchen.";
/** Nach diesen Kennungen ist der Stand neu zu lesen (der Server hat sich bewegt oder es ist unklar, ob). */
export const VORSCHLAG_NEU_LADEN = Object.freeze(["schreiben-unklar", "konflikt", "seit-vorschlag-geaendert", "bereits-uebernommen", "uebernahme-laeuft",
  "seit-uebernahme-geaendert", "bereits-rueckgaengig", "monat-abgeschlossen"]);
/** Nach diesen Kennungen taugt der gehaltene Vorschlag nicht mehr (nie blind wiederholen; ein neuer muss gerechnet werden). */
export const VORSCHLAG_VERBRAUCHT = Object.freeze(["vorschlag-unbekannt", "vorschlag-abgelaufen", "seit-vorschlag-geaendert", "bereits-uebernommen",
  "uebernahme-laeuft", "schreiben-unklar", "vorschlag-ohne-basis", "auswahl-ungueltig", "auswahl-nicht-im-vorschlag", "auswahl-doppelt", "vergangen", "monat-abgeschlossen"]);

/**
 * Die Absage des Servers als Anzeige: Text aus der Kennungstabelle (nie der Servertext), ob neu zu laden ist, ob der Vorschlag verbraucht
 * ist und ob unklar ist, ob gespeichert wurde. `schreibend`: die ausdrückliche Bestätigung — bei einer Antwort ohne bekannte Kennung
 * (Gateway, Absturz, keine Antwort) ist dort unklar, ob geschrieben wurde: wie `schreiben-unklar` behandeln, nie blind wiederholen.
 * @param {number} status HTTP-Status (0 = keine Antwort) @param {any} daten Antwort des Servers @param {{ schreibend?: boolean }} [o]
 * @returns {{ code: string | null, text: string, unklar: boolean, neuLaden: boolean, verbraucht: boolean }}
 */
export function planerWegFehler(status, daten, o = {}) {
  const roh = istObjekt(daten) && typeof daten.code === "string" ? daten.code : null;
  const code = roh && Object.hasOwn(VORSCHLAG_FEHLER, roh) ? roh : null;
  const ohneAntwort = !Number.isInteger(status) || status === 0 || status >= 500;
  if (code === null && o && o.schreibend === true && ohneAntwort)
    return { code: "schreiben-unklar", text: VORSCHLAG_FEHLER["schreiben-unklar"], unklar: true, neuLaden: true, verbraucht: true };
  const text = code ? VORSCHLAG_FEHLER[code] : (Object.hasOwn(VORSCHLAG_STATUS_TEXT, status) ? VORSCHLAG_STATUS_TEXT[status] : VORSCHLAG_STANDARD);
  return { code, text, unklar: code === "schreiben-unklar", neuLaden: !!code && VORSCHLAG_NEU_LADEN.includes(code), verbraucht: !!code && VORSCHLAG_VERBRAUCHT.includes(code) };
}

/** Grund, warum eine einzelne Einteilung nicht übernommen werden kann (Wert `grund` je Eintrag des Servers; ohne Person, ohne Tag). */
export const VORSCHLAG_ABLEHNUNG = Object.freeze({
  vergangen: "liegt in der Vergangenheit",
  "dienst-unbekannt": "der Dienst gibt es nicht mehr",
  "person-unbekannt": "die Person gehört nicht mehr zum Betrieb",
  "nicht-im-dienst": "die Person ist an diesem Tag nicht im Dienst des Betriebs",
  abwesend: "die Person ist an diesem Tag abwesend",
  angeheftet: "die Einteilung ist angeheftet, der Planer ändert sie nicht",
  "schluessel-belegt": "die Person ist an diesem Tag inzwischen anders eingeteilt",
  "keine-luecke": "die Lücke besteht nicht mehr",
  regel: "verstößt gegen mindestens eine harte Regel",
});
const ABLEHNUNG_UNBEKANNT = "nicht möglich (Grund nicht bewertbar)";

const NAME_PERSON = (m, pid) => {
  const p = (m && Array.isArray(m.personen) ? m.personen : []).find((x) => x && String(x.id) === String(pid));
  return p ? (`${p.vorname || ""} ${p.nachname || ""}`.trim() || "Person") : "Person (nicht im Bestand)";
};
const NAME_DIENST = (m, did) => {
  const d = (m && Array.isArray(m.dienstarten) ? m.dienstarten : []).find((x) => x && String(x.id) === String(did));
  return d && typeof d.name === "string" && d.name ? d.name : "Dienst";
};

/**
 * Die Einträge eines Vorschlags für die Anzeige: Namen NUR hier, aus dem eigenen Bestand (die Antwort des Servers trägt nur Kennungen).
 * Sortiert nach Tag, dann Name. Rein; wirft nie; unbrauchbare Einträge fehlen.
 * @param {any} m Betrieb @param {any} eintraege `eintraege` der Antwort
 * @returns {{ index: number, personName: string, datum: string, dienstName: string }[]}
 */
export function vorschlagZeilen(m, eintraege) {
  const TAG = /^\d{4}-\d{2}-\d{2}$/;
  return (Array.isArray(eintraege) ? eintraege : [])
    .filter((e) => istObjekt(e) && Number.isInteger(e.index) && e.index >= 0 && typeof e.datum === "string" && TAG.test(e.datum))
    .map((e) => ({ index: e.index, personName: NAME_PERSON(m, e.personId), datum: e.datum, dienstName: NAME_DIENST(m, e.dienstId) }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.personName.localeCompare(b.personName, "de") || a.index - b.index);
}

/**
 * Die abgelehnten Einteilungen einer Prüfung: der Server nennt den Index in der gesendeten Auswahl; `gesendet` ist die Liste der
 * Vorschlags-Indizes in genau dieser Reihenfolge. Ergebnis: Vorschlags-Index und Text (nie die Rohkennung des Grundes).
 * @param {any} abgelehnt @param {number[]} gesendet @returns {{ index: number, text: string }[]}
 */
export function ablehnungen(abgelehnt, gesendet) {
  return (Array.isArray(abgelehnt) ? abgelehnt : []).filter((a) => istObjekt(a) && Number.isInteger(a.index) && a.index >= 0 && a.index < gesendet.length)
    .map((a) => ({ index: gesendet[a.index], text: typeof a.grund === "string" && Object.hasOwn(VORSCHLAG_ABLEHNUNG, a.grund) ? VORSCHLAG_ABLEHNUNG[a.grund] : ABLEHNUNG_UNBEKANNT }));
}

/**
 * Unterbesetzung nach einer Rücknahme (`unterbesetzt` des Servers). `null` oder Unlesbares heißt „nicht bewertbar“ — nie „keine Lücke“;
 * nur eine gültige leere Liste heißt „keine“.
 * @param {any} u @param {any} m Betrieb (Dienstnamen)
 * @returns {{ zustand: "nicht_bewertbar" | "keine" | "luecken", zeilen: { datum: string, dienstName: string, fehlt: number, qualFehlt: boolean }[] }}
 */
export function unterbesetztAnzeige(u, m) {
  const TAG = /^\d{4}-\d{2}-\d{2}$/;
  if (!Array.isArray(u)) return { zustand: "nicht_bewertbar", zeilen: [] };
  const zeilen = [];
  for (const x of u) {
    if (!istObjekt(x) || typeof x.datum !== "string" || !TAG.test(x.datum) || !Number.isInteger(x.fehlt) || x.fehlt < 0 || typeof x.qualFehlt !== "boolean")
      return { zustand: "nicht_bewertbar", zeilen: [] };
    zeilen.push({ datum: x.datum, dienstName: NAME_DIENST(m, x.dienstId), fehlt: x.fehlt, qualFehlt: x.qualFehlt });
  }
  return zeilen.length ? { zustand: "luecken", zeilen } : { zustand: "keine", zeilen: [] };
}

/**
 * Darf der Knopf „Vorschlag erstellen“ wirken? Sonst der Grund als Text (null = ja). Dieselbe Entscheidung wie im Zustand des Planers
 * (planerZustand: globale Freigabe, wirksamer Modus); entschieden wird am Server. Die Rücknahme hängt nicht daran (C-4).
 * @param {{ freigegeben: boolean, wirksam: string }} z Ergebnis von planerZustand
 * @returns {string | null}
 */
export function vorschlagErstellenGrund(z) {
  if (!z || z.freigegeben !== true) return "Der Planer ist nicht freigegeben. Ein Vorschlag lässt sich erst erstellen, wenn der Betreiber den Planer freigegeben hat.";
  if (z.wirksam === "aus") return "Der Planer ist in diesem Betrieb derzeit aus (siehe „Voraussetzungen im Betrieb“ in den Einstellungen).";
  return null;
}
