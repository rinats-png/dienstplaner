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
