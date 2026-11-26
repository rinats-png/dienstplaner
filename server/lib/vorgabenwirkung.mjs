/* ==========================================================================
   INTERNE VORGABEN — Wirkung im Plan (WP-I5, Block K des Intelligence-Plans)

   Eine aktive Vorgabe (server/lib/vorgaben.mjs) wirkt, wenn die Einteilung
   einer Person in einen Dienst geprüft wird: hindernisBefunde (einsatz.mjs)
   hängt die Befunde hier an — und damit gelten sie in der Ersatzsuche, im
   Planungsassistenten (planeMonat), in der Selbstplanung (Übernahme) und im
   Warndialog, ohne dass diese drei Stellen eine zweite Prüflogik bekommen.

   Frage je Vorgabe: Verletzt DIESE Einteilung die Vorgabe? Gerechnet wird der
   Plan der Person im Umfeld des Tages zweimal, ohne und mit der Einteilung;
   ein Befund entsteht nur, wenn die Einteilung die Verletzung herbeiführt oder
   vergrößert. Eine schon bestehende Verletzung an anderer Stelle wird der
   Einteilung nicht angelastet.

   Befundart (BEFUND_KATALOG): Muss → „vorgabeMuss" (Achtung, braucht Bestätigung,
   sperrt NIE — wie ein betriebliches Regelwerk), Soll → „vorgabeSoll" (Hinweis).
   Wunsch erzeugt keinen Befund (wird erst vom Planer-Kern, WP-I7, berücksichtigt).
   Kann etwas nicht geprüft werden (Rechenbudget, Fehler, zu viele aktive
   Vorgaben), steht einmal der Hinweis „vorgabeOffen" — nie stilles Weglassen.

   Welche Vorgaben im Plan wirken, sagt vorgabePlanwirkung (eine Stelle, auch
   für die Verwaltung): Muster-, Block- und Zählregel mit kleinem Zeitraum;
   Geltung Betrieb, Einheit, einzelne Personen. Alles andere rechnet nur der
   Testlauf, und die Verwaltung sagt das.

   Schutz vor Rechenlast (Review #561): Obergrenzen und kumuliertes Budget
   (VORGABEN_WIRKUNG_GRENZE in vorgaben.mjs), je Anfrage ein Budget, gezählt in
   Tagesabfragen; das Budget ist deterministisch (keine Uhr), der Planer-Kern
   braucht gleiche Eingabe → gleiches Ergebnis. Rein: keine Ablage, keine Uhr.

   Zählregeln über 62 Tage (WP-I7, Betreiberentscheidung I5-4): Mit den
   vorberechneten Aggregaten des Planer-Kerns (engine/planeraggregate.mjs)
   rechnen Kalenderjahr und rollierende Zeiträume bis 372 Tage — mit derselben
   Fensterentscheidung wie der kurze Weg (eine Stelle: fensterBewerten). Die
   Aggregate sind AUS (PLANER_AGGREGATE_AN) und ruhen, solange Intelligence
   pausiert ist (WP-I16); dann bleibt es beim Hinweis „nicht vollständig
   geprüft“ (in der Automatik bei Muss: nicht einteilen).
   ========================================================================== */
import { pruefeRegel } from "./regelbaukasten-erweitert.mjs";
import { zeitraum } from "./regelbaukasten.mjs";
import { addDays, dow } from "./regelwerk.mjs";
import { vorgabeAlsRegel, aktiveVorgaben, vorgabeRegelId, VORGABEN_WIRKUNG_GRENZE } from "./vorgaben.mjs";
import { kiPauseAktiv } from "./ki-steuerung.mjs";
import { PLANER_AGGREGATE_AN, AGGREGAT_GRENZE, neuerAggregatSpeicher, aggregatZaehler, aggregateFortschreiben, tagNr, tagAus } from "./engine/planeraggregate.mjs";

/** Befundarten für BEFUND_KATALOG: höchstens Achtung, sperren nie. */
export const VORGABEN_BEFUNDART = Object.freeze({
  vorgabeMuss: Object.freeze({ text: "Interne Vorgabe des Betriebs (Muss)", quelle: "Interne Vorgabe", stufe: "achtung", sperrt: false, vorgabe: true }),
  vorgabeSoll: Object.freeze({ text: "Interne Vorgabe des Betriebs (Soll)", quelle: "Interne Vorgabe", stufe: "hinweis", sperrt: false, vorgabe: true }),
  vorgabeOffen: Object.freeze({ text: "Interne Vorgaben nicht vollständig geprüft", quelle: "Interne Vorgabe", stufe: "hinweis", sperrt: false, vorgabe: true }),
});

/** Regelarten, die im Plan wirken. */
export const VORGABEN_PLANARTEN = Object.freeze(["musterregel", "blockregel", "zaehlregel"]);

const GRUNDLAGE = { hausregel: "Hausregel", betriebsvereinbarung: "Betriebsvereinbarung", tarif: "Tarifvertrag" };
const NUR_TEST = "Diese Regelart rechnet nur im Testlauf; im Plan wirkt sie noch nicht.";

/** Tage des Zeitraums, den die Zählregel für einen Stichtag auswertet (höchstens 62 zulässig, sonst null). */
function zaehlFenster(fenster) {
  if (!fenster || typeof fenster !== "object") return null;
  const n = Number(fenster.laenge);
  if (fenster.art === "kalendermonat") return 31;
  if (fenster.art === "rollierend" && Number.isInteger(n) && n >= 1) {
    const tage = fenster.einheit === "tage" ? n : fenster.einheit === "wochen" ? 7 * n : fenster.einheit === "monate" ? 31 * n : Infinity;
    return tage <= VORGABEN_WIRKUNG_GRENZE.fensterTage ? tage : null;
  }
  return null;
}

/** Stichtage einer Zählregel über der Grenze des kurzen Wegs, die die Aggregate rechnen (Kalenderjahr: 1; rollierend: Tage, 7 je Woche,
    31 je Monat wie zaehlFenster); null, wenn nicht gültig beschrieben oder über AGGREGAT_GRENZE. */
function langFenster(fenster) {
  if (!fenster || typeof fenster !== "object") return null;
  if (fenster.art === "kalenderjahr") return 1;
  const n = Number(fenster.laenge);
  if (fenster.art !== "rollierend" || !Number.isInteger(n) || n < 1) return null;
  const tage = fenster.einheit === "tage" ? n : fenster.einheit === "wochen" ? 7 * n : fenster.einheit === "monate" ? 31 * n : Infinity;
  return tage <= AGGREGAT_GRENZE.fensterTage ? tage : null;
}

/**
 * Wirkt diese Vorgabe im Plan? Eine Stelle für Rechnung und Verwaltung.
 * `opt.aggregate`: Aggregate des Planer-Kerns verfügbar (Vorgabe: der Schalter PLANER_AGGREGATE_AN); `opt.pause`: Intelligence pausiert.
 * @param {any} v
 * @param {{ aggregate?: boolean, pause?: boolean }} [opt]
 * @returns {{ wirkt: boolean, grund: string | null }}
 */
export function vorgabePlanwirkung(v, opt = {}) {
  if (!v || typeof v !== "object") return { wirkt: false, grund: NUR_TEST };
  if (!VORGABEN_PLANARTEN.includes(v.regelart)) return { wirkt: false, grund: NUR_TEST };
  const p = v.parameter || {};
  const G = VORGABEN_WIRKUNG_GRENZE;
  if (v.regelart === "zaehlregel" && zaehlFenster(p.fenster) === null) {
    const aggregate = (opt.aggregate === undefined ? PLANER_AGGREGATE_AN : opt.aggregate === true) && opt.pause !== true;
    if (aggregate && langFenster(p.fenster) !== null) return { wirkt: true, grund: null };
    if (aggregate) return { wirkt: false, grund: `Zeiträume über ${AGGREGAT_GRENZE.fensterTage} Tage rechnen nur im Testlauf; im Plan wirkt diese Regel nicht.` };
    return { wirkt: false, grund: `Zeiträume über ${G.fensterTage} Tage rechnen nur im Testlauf; im Plan wirkt diese Regel noch nicht${opt.pause === true ? " (Intelligence pausiert)" : ""}.` };
  }
  if (v.regelart === "musterregel") {
    const halb = p.art === "hoechstensFolge" ? Number(p.max) + (Number(p.danachFrei) || 0) + 1 : Number(p.abstandTage === undefined ? 1 : p.abstandTage);
    if (!Number.isInteger(halb) || halb < 1 || 2 * halb + 1 > G.fensterTage)
      return { wirkt: false, grund: `Muster über mehr als ${G.fensterTage} Tage rechnen nur im Testlauf; im Plan wirkt diese Regel noch nicht.` };
  }
  return { wirkt: true, grund: null };
}

/**
 * Ein neues Rechenbudget für EINEN äußeren Einstieg (Tagesabfragen; deterministisch). Es wird vom Einstieg angelegt und durch
 * ersatzKandidaten → ersatzVorschlaege → hindernisBefunde → vorgabenBefunde weitergereicht; wer eines bekommt, legt kein zweites an.
 * `cache` (Plan je Betriebsstand) und `vorbereitet` (Dienstart-Abbildung, Regeln, Reihenfolge je Vorgabenliste) gehören dazu:
 * einmal je Einstieg gerechnet, nicht je Aufruf und Person.
 */
export function neuesVorgabenBudget(aufwand = VORGABEN_WIRKUNG_GRENZE.aufwand, opt = {}) {
  /* Aggregate des Planer-Kerns (WP-I7): nur mit dem Schalter oder ausdrücklich je Einstieg (Prüfungen, Planer-Einstieg); sonst null. */
  const aggregat = PLANER_AGGREGATE_AN || (opt && opt.aggregate === true) ? neuerAggregatSpeicher() : null;
  return { rest: aufwand, cache: new WeakMap(), vorbereitet: new WeakMap(), ausgeschoepft: false, aggregat };
}

/**
 * Der Planer hat aus `altM` den Stand `neuM` gemacht, indem er genau diese Einteilungen gesetzt hat ([{ personId, tag }]): die Aggregate
 * des Budgets wandern mit, die Monatsblöcke der geänderten Tage werden neu gelesen (aggregateFortschreiben prüft, dass sich sonst nichts
 * geändert hat). Ohne Aggregate: nichts.
 * @param {ReturnType<typeof neuesVorgabenBudget> | null | undefined} budget @param {any} altM @param {any} neuM
 * @param {{ personId: any, tag: string }[]} aenderungen
 */
export function vorgabenPlanFortschreiben(budget, altM, neuM, aenderungen) {
  return !!(budget && budget.aggregat) && aggregateFortschreiben(budget.aggregat, altM, neuM, aenderungen);
}

/** Wird geworfen, wenn das Budget für die Arbeit der Aggregate nicht reicht (nur innerhalb von vorgabenBefunde). */
const AUFGEBRAUCHT = Object.freeze({ aufgebraucht: true });

const kleinText = (s) => String(s === undefined || s === null ? "" : s).trim().toLowerCase();

/** Schreibweise einer Dienstart in der Vorgabe (Kürzel, Kennung oder Name) → Kennung der Dienstart; Unbekanntes bleibt, wie es ist. */
function klassenAbbildung(m) {
  const abb = new Map();
  for (const da of Array.isArray(m.dienstarten) ? m.dienstarten : []) {
    if (!da || typeof da !== "object") continue;
    for (const s of [da.name, da.kurz, da.id]) if (s !== undefined && s !== null && s !== "" && !abb.has(kleinText(s))) abb.set(kleinText(s), String(da.id));
    abb.set(kleinText(da.id), String(da.id));
  }
  return (s) => (abb.has(kleinText(s)) ? abb.get(kleinText(s)) : String(s));
}

/** Parameter mit Dienstart-Schreibweisen in Kennungen (Kopie, die Vorgabe bleibt unverändert). */
function parameterKanonisch(v, kl) {
  const p = JSON.parse(JSON.stringify(v.parameter || {}));
  const liste = (a) => (Array.isArray(a) ? a.map(kl) : a);
  if (v.regelart === "musterregel") { p.von = liste(p.von); p.dann = liste(p.dann); p.klassen = liste(p.klassen); }
  if (v.regelart === "blockregel" && p.gruppen && typeof p.gruppen === "object") p.gruppen = Object.fromEntries(Object.entries(p.gruppen).map(([k, g]) => [kl(k), g]));
  return p;
}

/**
 * Gilt die Vorgabe für diese Person an diesem Tag? „ja“, „nein“ oder „offen“ (nicht zu entscheiden: nie still „gilt nicht“).
 * Geltung „Qualifikationsgruppe“: Die Gruppe sind die vorhandenen, strukturierten Qualifikationen der Person (kein eigenes Datenmodell,
 * kein Freitext der Funktion). Ein Gruppenname wird als Kennung, Kürzel oder Name einer Qualifikation des Betriebs gelesen; hat die Person
 * die Qualifikation nicht, gilt die Vorgabe für sie nicht; ist ein Gruppenname im Betrieb unbekannt und die Person nicht in einer bekannten
 * Gruppe, ist es „offen“.
 */
function giltFuer(v, p, d, einheitAm, vb) {
  if (v.gueltigAb && d < v.gueltigAb) return "nein";
  if (v.gueltigBis && d > v.gueltigBis) return "nein";
  const a = v.ausnahmen || {};
  if (Array.isArray(a.personen) && a.personen.map(String).includes(String(p.id))) return "nein";
  if (Array.isArray(a.zeitraeume) && a.zeitraeume.some((z) => z && d >= z.von && d <= z.bis)) return "nein";
  const g = v.geltung || {};
  const ja = (b) => (b ? "ja" : "nein");
  if (g.art === "betrieb") return "ja";
  if (g.art === "personen") return ja(Array.isArray(g.personen) && g.personen.map(String).includes(String(p.id)));
  if (g.art === "einheit") return ja(typeof einheitAm === "function" && Array.isArray(g.einheiten) && g.einheiten.map(String).includes(String(einheitAm(p, d))));
  if (g.art === "gruppe") {
    const namen = Array.isArray(g.gruppen) ? g.gruppen : [];
    const eigene = new Set((Array.isArray(p.qualifikationen) ? p.qualifikationen : []).map(String));
    let unbekannt = namen.length === 0;
    for (const n of namen) {
      const q = vb ? vb.qualFuer(n) : undefined;
      if (q === undefined) unbekannt = true;
      else if (eigene.has(q)) return "ja";
    }
    return unbekannt ? "offen" : "nein";
  }
  return "nein";
}

/** Tagesklasse einer Person im Plan der Vorgabe: Kennung des Dienstes, „frei“ — oder undefined (unbekannt), wenn die Person abwesend ist:
    Abwesenheit gilt nie als erfüllte Ruhezeit oder Freizeit, der Tag bleibt ohne Klasse. */
export function tagesklasse(dienstId, abwesend) {
  if (abwesend) return undefined;
  return dienstId === null || dienstId === undefined || dienstId === "" ? "frei" : String(dienstId);
}

/** Abwesenheitsarten, die aus der Belastungs- und Verteilungszählung herausgenommen werden (Entscheidung 26.11.: Urlaub und Krankheit). */
export const VORGABEN_ZAEHLUNG_OHNE = Object.freeze(["urlaub", "krank"]);

/** Teilzeitquote einer Person aus den vorhandenen Angaben (Wochenstunden zur Soll-Wochenarbeitszeit des Betriebs, wie die Planrechnung):
    1 ohne aktive Teilzeit; null, wenn die Quote nicht bestimmbar ist (nie raten); keine Rundung. */
export function teilzeitQuote(m, p) {
  const tz = p && p.teilzeit;
  if (!tz || !tz.aktiv) return 1;
  const soll = Number(m && m.einstellungen && m.einstellungen.sollWochenstunden) || 40;
  const w = Number(p.wochenstunden);
  if (!Number.isFinite(w) || w <= 0 || !(soll > 0)) return null;
  return Math.min(1, w / soll);
}

/** Zahl ohne Gleitkomma-Rauschen (6 Stellen), keine fachliche Rundung. */
const sauber = (x) => Math.round(x * 1e6) / 1e6;

/**
 * Entscheidung für EIN Fenster einer Zählregel — eine Stelle für den kurzen Weg und die Aggregate.
 * null: kein Befund aus diesem Fenster; "unklar": nicht ganzzahlige Grenze, Zählwert weniger als 1 daneben (offen, nie still gerundet);
 * sonst die wirksame Grenze, gegen die der Regelbaukasten den Befund bestätigt.
 * @returns {null | "unklar" | { eff: number, ganz: boolean }}
 */
function fensterBewerten(nMit, nOhne, tage, ohneTage, grenze0, tzFaktor, hoechstens) {
  let eff = grenze0 * tzFaktor;
  if (!hoechstens && ohneTage && tage) eff = eff * ((tage - ohneTage) / tage);
  eff = eff === grenze0 ? grenze0 : sauber(eff);
  const verletzt = (n) => (hoechstens ? n > eff : n < eff);
  if (!verletzt(nMit)) return null;
  const last = (n) => (hoechstens ? n : -n);
  if (verletzt(nOhne) && last(nMit) <= last(nOhne)) return null;
  const ganz = Number.isInteger(eff);
  if (!ganz && Math.abs(nMit - eff) < 1) return "unklar";
  return { eff, ganz };
}

/** Fenster [von, bis] der Auswertung um den Tag d. */
function fensterUm(v, d) {
  const p = v.parameter || {};
  if (v.regelart === "blockregel") { const mo = addDays(d, -dow(d)); return { von: mo, bis: addDays(mo, 6) }; }
  if (v.regelart === "zaehlregel") {
    /* Rollierend: Jedes Fenster, das den Tag d enthält, endet an einem Stichtag von d bis d+n−1 — alle werden ausgewertet,
       der Plan wird von d−(n−1) bis d+(n−1) gebraucht. Kalendermonat: das eine Fenster des Tages. */
    const n = p.fenster && p.fenster.art === "rollierend" ? zaehlFenster(p.fenster) : null;
    return n ? { von: addDays(d, -(n - 1)), bis: addDays(d, n - 1) } : zeitraum(p.fenster, d);
  }
  const halb = p.art === "hoechstensFolge" ? Number(p.max) + (Number(p.danachFrei) || 0) + 1 : Number(p.abstandTage === undefined ? 1 : p.abstandTage);
  return { von: addDays(d, -halb), bis: addDays(d, halb) };
}

/** Wie schwer die Verletzung wiegt (größer = schlimmer): Summe der Verstoßlängen in Tagen (ein Verstoß ohne Länge zählt 1), bei Zählregeln
    die Anzahl (bei „mindestens“ umgekehrt). Länge statt Zahl: Eine Einteilung, die zwei zu lange Folgen zu einer noch längeren verbindet,
    senkt die Zahl der Verstöße, vergrößert aber die Verletzung. */
const mass = (e) => {
  const f = e.fakten || {};
  if (Array.isArray(f.verstoesse)) return f.verstoesse.reduce((summe, x) => summe + (x && Number.isFinite(x.laenge) && x.laenge > 0 ? x.laenge : 1), 0);
  return Number.isFinite(f.anzahl) ? (f.richtung === "mindestens" ? -f.anzahl : f.anzahl) : 0;
};




/** Ist die Vorgabe gültig beschrieben, aber über der Zeitraumgrenze (und rechnet deshalb im Plan nicht)? Ungültige Zeiträume/Muster gehören nicht hierher. */
function ueberlangGueltig(v) {
  const p = v.parameter || {};
  if (v.regelart === "zaehlregel") {
    const f = p.fenster;
    if (!f || typeof f !== "object") return false;
    if (f.art === "kalenderjahr") return true;
    const n = Number(f.laenge);
    return f.art === "rollierend" && Number.isInteger(n) && n >= 1 && ["tage", "wochen", "monate"].includes(f.einheit);
  }
  if (v.regelart === "musterregel") {
    const halb = p.art === "hoechstensFolge" ? Number(p.max) + (Number(p.danachFrei) || 0) + 1 : Number(p.abstandTage === undefined ? 1 : p.abstandTage);
    return Number.isInteger(halb) && halb >= 1;
  }
  return false;
}

/**
 * Einmal je Einstieg (Budget) und Vorgabenliste: Dienstart-Abbildung, Qualifikationsnamen, wirkende Vorgaben in stabiler Reihenfolge
 * (Priorität, Kennung) und die daraus gebauten Regeln. Gilt nur, solange Vorgabenliste und Dienstarten/Qualifikationen dieselben Objekte sind.
 * `ueberlang`: aktive Plan-Vorgaben (Muster, Block, Zählregel), die gültig beschrieben sind, im Plan aber nicht gerechnet werden (Zeitraum über
 * der Grenze): nie still „bestanden“.
 */
function vorbereiten(m, budget) {
  const gefunden = budget.vorbereitet.get(m.vorgaben);
  if (gefunden && gefunden.dienstarten === m.dienstarten && gefunden.qualifikationen === m.qualifikationen && gefunden.einstellungen === m.einstellungen) return gefunden;
  /* Aggregate (WP-I7): nur mit Speicher im Budget und nicht, solange Intelligence pausiert ist (WP-I16; unlesbarer Stand = Pause). */
  const pause = !!budget.aggregat && kiPauseAktiv(m.einstellungen);
  const wo = { aggregate: !!budget.aggregat && !pause, pause };
  const aktiv = aktiveVorgaben(m.vorgaben).filter((v) => v.staerke !== "wunsch");
  const sortiert = (l) => l.sort((a, b) => (a.prioritaet - b.prioritaet) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const wirkend = sortiert(aktiv.filter((v) => vorgabePlanwirkung(v, wo).wirkt));
  const ueberlang = sortiert(aktiv.filter((v) => VORGABEN_PLANARTEN.includes(v.regelart) && !vorgabePlanwirkung(v, wo).wirkt && ueberlangGueltig(v)));
  const kl = klassenAbbildung(m);
  /* Qualifikationsgruppe: Kennung, Kürzel oder Name einer Qualifikation des Betriebs → Kennung. */
  const qual = new Map();
  for (const q of Array.isArray(m.qualifikationen) ? m.qualifikationen : []) {
    if (!q || typeof q !== "object" || q.id === undefined || q.id === null) continue;
    for (const x of [q.name, q.kurz, q.id]) if (x !== undefined && x !== null && x !== "" && !qual.has(kleinText(x))) qual.set(kleinText(x), String(q.id));
    qual.set(kleinText(q.id), String(q.id));
  }
  const regeln = new Map();
  const vb = { dienstarten: m.dienstarten, qualifikationen: m.qualifikationen, einstellungen: m.einstellungen, wirkend, ueberlang, kl, aggregate: wo.aggregate, pause,
    qualFuer: (n) => qual.get(kleinText(n)),
    regelFuer(v) {
      if (!regeln.has(v)) regeln.set(v, vorgabeAlsRegel({ ...v, gueltigAb: null, gueltigBis: null, parameter: parameterKanonisch(v, kl) }, { wirkend: true }));
      return regeln.get(v);
    } };
  budget.vorbereitet.set(m.vorgaben, vb);
  return vb;
}

const TAG_MS = 86400000;

/**
 * Die Befunde aktiver interner Vorgaben für die Einteilung von Person p in Dienstart da am Tag d.
 * `k.automatisch`: Die Einteilung geschieht ohne Mensch (Planungsassistent). Dann gilt fail-closed: Konnte eine Muss-Vorgabe nicht geprüft werden
 * (Budget, Fehler, Obergrenze, unbekannte Qualifikationsgruppe, Zeitraum über der Grenze, nicht ganzzahlige Teilzeit-Grenze, fehlende
 * Teilzeitquote), ist „vorgabeOffen“ eine Achtung (die Person ist nicht „möglich“); im Warndialog bleibt es ein Hinweis, den der Mensch bewertet.
 * `k.abwesendAm(p, tag)`: Kennung der Abwesenheitsart oder null. Abwesende Tage sind im Plan der Vorgabe ohne Klasse (unbekannt, nie „frei“);
 * Urlaub und Krankheit werden aus Zählregeln herausgenommen (Zähler und Vergleichsgrundlage zugleich).
 * Teilzeit anteilig (Zählregel): Grenzen werden NUR bei ausdrücklich anteilig geltender Vorgabe (`ausnahmen.teilzeitAnteilig === true`) mit der
 * Teilzeitquote skaliert — ohne Angabe oder bei „nein“ nie (eine Betriebsvorgabe wird nicht ungefragt gelockert). Eine Mindestzahl freier Tage
 * wird nie nach unten skaliert. Keine Rundung: Liegt der Zählwert weniger als 1 neben einer nicht ganzzahligen Grenze, ist das Ergebnis offen
 * („anteilig, nicht ganzzahlig“).
 * Rechenaufwand: Zählregeln rechnen mit Präfixsummen (linear in Fensterlänge und Stichtagen); das Budget zählt diesen Aufwand.
 * @param {any} m Betrieb
 * @param {any} p Person
 * @param {string} d Tag JJJJ-MM-TT
 * @param {any} da Dienstart
 * @param {{ dienstAm: (p: any, d: string) => any, einheitAm?: (p: any, d: string) => any, abwesendAm?: (p: any, d: string) => any, budget?: ReturnType<typeof neuesVorgabenBudget>, automatisch?: boolean }} k
 * @returns {{ regel: string, stufe: string, text: string, quelle: string, art: string, regelId: string | null }[]}
 */
export function vorgabenBefunde(m, p, d, da, k) {
  if (!m || !Array.isArray(m.vorgaben) || !p || !da || typeof k.dienstAm !== "function") return [];
  const G = VORGABEN_WIRKUNG_GRENZE;
  const budget = k.budget || neuesVorgabenBudget();
  const vb = vorbereiten(m, budget);
  if (!vb.wirkend.length && !vb.ueberlang.length) return [];
  const kl = vb.kl;
  const aus = /** @type {{ regel: string, stufe: string, text: string, quelle: string, art: string, regelId: string | null }[]} */ ([]);
  let offen = false, offenMuss = false;
  const gruende = new Set();
  /** Diese Vorgaben bleiben ungeprüft: offen; „Muss“ nur, wenn eine davon hier gelten würde (oder nicht zu entscheiden ist). */
  const ungeprueft = (liste, grund) => {
    offen = true;
    if (grund) gruende.add(grund);
    if (offenMuss) return;
    try { offenMuss = liste.some((x) => x.staerke === "muss" && giltFuer(x, p, d, k.einheitAm, vb) !== "nein"); } catch { offenMuss = true; }
  };
  for (const v of vb.ueberlang) {
    if (giltFuer(v, p, d, k.einheitAm, vb) === "nein") continue;
    const ueberAggregat = vb.aggregate && v.regelart === "zaehlregel";
    ungeprueft([v], ueberAggregat ? `Zeitraum über ${AGGREGAT_GRENZE.fensterTage} Tage`
      : `Zeitraum über ${G.fensterTage} Tage (${vb.pause ? "Aggregate des Planers angehalten: Intelligence pausiert" : "rechnet erst mit den Aggregaten des Planers"})`);
  }
  const pruef = vb.wirkend.slice(0, G.aktive);
  if (vb.wirkend.length > G.aktive) ungeprueft(vb.wirkend.slice(G.aktive), `mehr als ${G.aktive} aktive Vorgaben`);
  let plan = budget.cache.get(m);
  if (!plan) { plan = new Map(); budget.cache.set(m, plan); }
  const tag = (t) => {
    const key = `${p.id}|${t}`;
    let e = plan.get(key);
    if (!e) {
      const abw = typeof k.abwesendAm === "function" ? k.abwesendAm(p, t) : null;
      e = { dienst: k.dienstAm(p, t), abw: abw === undefined || abw === "" ? null : abw };
      plan.set(key, e);
    }
    return e;
  };
  /* Tage relativ zu d (Versatz in Tagen), einmal je Aufruf aufgebaut und von allen Vorgaben geteilt: kein Datum-Rechnen je Vorgabe und Tag. */
  const bezug = Date.parse(d);
  const eint = new Map();
  const eintO = (o) => {
    let e = eint.get(o);
    if (!e) { const t = o === 0 ? d : addDays(d, o); const x = tag(t); e = { t, dienst: x.dienst, abw: x.abw }; eint.set(o, e); }
    return e;
  };
  const versatz = (t) => Math.round((Date.parse(t) - bezug) / TAG_MS);
  for (let i = 0; i < pruef.length; i++) {
    const v = pruef[i];
    if (budget.ausgeschoepft) { ungeprueft(pruef.slice(i), "Rechenbudget aufgebraucht"); break; }
    const geltung = giltFuer(v, p, d, k.einheitAm, vb);
    if (geltung === "nein") continue;
    if (geltung === "offen") { ungeprueft([v], "Qualifikationsgruppe im Betrieb unbekannt"); continue; }
    try {
      const zaehl = v.regelart === "zaehlregel";
      const par = v.parameter || {};
      const ereignis = zaehl ? kl(par.ereignis) : null;
      /* Teilzeit anteilig (nur Zählregel; Schutzvorschriften bleiben unberührt, sie laufen nicht über Vorgaben): nur bei ausdrücklichem „ja“;
         eine Mindestzahl freier Tage wird nie nach unten skaliert. */
      let tzFaktor = 1;
      if (zaehl && (v.ausnahmen || {}).teilzeitAnteilig === true && !(par.richtung === "mindestens" && kleinText(ereignis) === "frei")) {
        const q = teilzeitQuote(m, p);
        if (q === null) { ungeprueft([v], "Teilzeitquote nicht bestimmbar"); continue; }
        tzFaktor = q;
      }
      /* Zählregel über der Grenze des kurzen Wegs: nur erreichbar mit Aggregaten (vorbereiten sortiert sie sonst als „ueberlang“ aus). */
      const lang = zaehl && zaehlFenster(par.fenster) === null;
      const fenster = lang ? { von: d, bis: d } : fensterUm(v, d);
      const rollierend = zaehl && (par.fenster || {}).art === "rollierend";
      const ns = rollierend ? (lang ? langFenster(par.fenster) : zaehlFenster(par.fenster)) : 1;
      const vonO = versatz(fenster.von), bisO = versatz(fenster.bis), L = bisO - vonO + 1;
      /* Kosten = tatsächliche Arbeit: Plantage zweimal (mit/ohne) plus ein Schritt je Stichtag (Präfixsummen). Die Aggregate melden ihre
         Arbeit selbst an, Schritt für Schritt, bevor sie geschieht. */
      const kosten = lang ? 0 : 2 * L + 2 * (ns - 1);
      if (budget.rest < kosten) { budget.ausgeschoepft = true; ungeprueft(pruef.slice(i), "Rechenbudget aufgebraucht"); break; }
      budget.rest -= kosten;
      const basis = vb.regelFuer(v);
      const grenze0 = Number(par.grenze);
      const regelMit = (eff) => (zaehl && eff !== grenze0 ? { ...basis, parameter: { ...basis.parameter, grenze: eff } } : basis);
      const hinweisZu = (r, ohneTage) => `${r.eff !== grenze0 ? ` — anteilig: Grenze ${r.eff}${r.ganz ? "" : ", nicht ganzzahlig"}` : ""}${ohneTage ? " — ohne Urlaub und Krankheit" : ""}`;
      let treffer = null, hinweis = "", unklar = false;

      if (lang) {
        /* WP-I7 (I5-4): Aggregate je Person und Monat (engine/planeraggregate.mjs). Gezählt wird der vorhandene Plan; der Tag d wird wie im
           kurzen Weg ersetzt: „ohne“ = frei, „mit“ = der Dienst; Urlaub/Krankheit am Tag d wird nicht herausgenommen. */
        const nimm = (n) => { if (budget.rest < n) throw AUFGEBRAUCHT; budget.rest -= n; };
        const lies = (t) => {
          const ab = typeof k.abwesendAm === "function" ? k.abwesendAm(p, t) : null;
          const abw = ab === undefined || ab === "" ? null : ab;
          return { klasse: tagesklasse(k.dienstAm(p, t), abw !== null), abw: abw !== null && VORGABEN_ZAEHLUNG_OHNE.includes(String(abw)) ? 1 : 0 };
        };
        const z = aggregatZaehler(budget.aggregat, m, p.id, lies, nimm);
        const f = par.fenster, hoechstens = par.richtung === "hoechstens";
        const s0 = tagNr(d), kD = z.klasse(s0), aD = z.abw(s0), kMit = tagesklasse(da.id, false);
        /* Feste Fensterlänge (Tage, Wochen): das nächste Fenster entsteht aus dem vorigen mit zwei Tagen (hinten dazu, vorne weg). */
        const fest = rollierend && (f.einheit === "tage" || f.einheit === "wochen") ? (f.einheit === "tage" ? Number(f.laenge) : 7 * Number(f.laenge)) : 0;
        let anzahl = 0, abwesend = 0;
        for (let so = 0; so < ns; so++) {
          let wv, wb;
          if (fest) {
            wv = s0 + so - fest + 1; wb = s0 + so;
            if (so === 0) { anzahl = z.zaehle(ereignis, wv, wb); if (!hoechstens) abwesend = z.zaehleAbw(wv, wb); }
            else {
              nimm(hoechstens ? 2 : 4);
              anzahl += (z.klasse(wb) === ereignis ? 1 : 0) - (z.klasse(wv - 1) === ereignis ? 1 : 0);
              if (!hoechstens) abwesend += z.abw(wb) - z.abw(wv - 1);
            }
          } else {
            const zr = zeitraum(f, so === 0 ? d : addDays(d, so));
            wv = tagNr(zr.von); wb = tagNr(zr.bis);
            anzahl = z.zaehle(ereignis, wv, wb);
            if (!hoechstens) abwesend = z.zaehleAbw(wv, wb);
          }
          const drin = wv <= s0 && s0 <= wb;
          const ohneD = drin && kD === ereignis ? anzahl - 1 : anzahl;
          const nOhne = ohneD + (drin && ereignis === "frei" ? 1 : 0);
          const nMit = ohneD + (drin && kMit === ereignis ? 1 : 0);
          const ohneTage = hoechstens ? 0 : abwesend - (drin ? aD : 0);
          const r = fensterBewerten(nMit, nOhne, wb - wv + 1, ohneTage, grenze0, tzFaktor, hoechstens);
          if (r === null) continue;
          if (r === "unklar") { unklar = true; continue; }   // keine stille Rundung: offen
          nimm(wb - wv + 1);
          const ereignisse = [];
          for (let t = wv; t <= wb; t++) if ((t === s0 ? kMit : z.klasse(t)) === ereignis) ereignisse.push(tagAus(t));
          const e = pruefeRegel(regelMit(r.eff), { ereignisse, stichtag: so === 0 ? d : addDays(d, so) });
          if (e.status !== "verletzt") continue;
          treffer = e;
          hinweis = hinweisZu(r, ohneTage);
          break;
        }
      } else if (zaehl) {
        /* Präfixsummen über das Fenster: Ereignisse mit/ohne die Einteilung und Urlaubs-/Krankheitstage. */
        const pm = new Int32Array(L + 1), po = new Int32Array(L + 1), pa = new Int32Array(L + 1);
        for (let j = 0; j < L; j++) {
          const o = vonO + j;
          let ohne, abwZ = 0;
          if (o === 0) ohne = "frei";
          else { const e = eintO(o); ohne = tagesklasse(e.dienst, e.abw !== null); if (e.abw !== null && VORGABEN_ZAEHLUNG_OHNE.includes(String(e.abw))) abwZ = 1; }
          const mit = o === 0 ? tagesklasse(da.id, false) : ohne;
          po[j + 1] = po[j] + (ohne === ereignis ? 1 : 0);
          pm[j + 1] = pm[j] + (mit === ereignis ? 1 : 0);
          pa[j + 1] = pa[j] + abwZ;
        }
        const hoechstens = par.richtung === "hoechstens";
        const f = par.fenster || {};
        const festLaenge = rollierend && (f.einheit === "tage" || f.einheit === "wochen") ? (f.einheit === "tage" ? Number(f.laenge) : 7 * Number(f.laenge)) : 0;
        for (let so = 0; so < ns; so++) {
          let wv, wb;
          if (festLaenge) { wv = so - festLaenge + 1; wb = so; }
          else { const z = zeitraum(f, so === 0 ? d : addDays(d, so)); wv = versatz(z.von); wb = versatz(z.bis); }
          if (wv < vonO || wb > bisO || wb < wv) throw new Error("Fenster außerhalb des gelesenen Plans");
          const a = wv - vonO, b = wb - vonO + 1;
          const nMit = pm[b] - pm[a], nOhne = po[b] - po[a];
          const tage = wb - wv + 1;
          const ohneTage = hoechstens ? 0 : pa[b] - pa[a];
          const r = fensterBewerten(nMit, nOhne, tage, ohneTage, grenze0, tzFaktor, hoechstens);
          if (r === null) continue;
          if (r === "unklar") { unklar = true; continue; }   // keine stille Rundung: offen
          /* Text und Bestätigung der Verletzung kommen vom Regelbaukasten (eine Prüflogik); nur der Kandidat wird dort gerechnet. */
          const ereignisse = [];
          for (let j = 0; j < L; j++) if (pm[j + 1] > pm[j]) ereignisse.push(vonO + j === 0 ? d : eintO(vonO + j).t);
          const e = pruefeRegel(regelMit(r.eff), { ereignisse, stichtag: so === 0 ? d : addDays(d, so) });
          if (e.status !== "verletzt") continue;
          treffer = e;
          hinweis = hinweisZu(r, ohneTage);
          break;
        }
      } else {
        const tageMit = {}, tageOhne = {};
        for (let o = vonO; o <= bisO; o++) {
          let ohne, t;
          if (o === 0) { ohne = "frei"; t = d; }
          else { const e = eintO(o); t = e.t; ohne = tagesklasse(e.dienst, e.abw !== null); }
          const mit = o === 0 ? tagesklasse(da.id, false) : ohne;
          /* Blockregel: Ein Tag ohne Dienst ist im Plan noch offen, nicht „frei“ (er kann später gefüllt werden) — erst zwei verschiedene
             Dienste im Block verletzen. Die übrigen Regeln brauchen den freien Tag (Pause nach einem Block). */
          const offenTag = v.regelart === "blockregel";
          if (ohne !== undefined && !(offenTag && ohne === "frei")) tageOhne[t] = ohne;
          if (mit !== undefined && !(offenTag && mit === "frei")) tageMit[t] = mit;
        }
        const rechne = (tage) => pruefeRegel(basis, { tage, von: fenster.von, bis: fenster.bis, stichtag: d });
        const mitE = rechne(tageMit);
        if (mitE.status === "verletzt") {
          const ohneE = rechne(tageOhne);
          if (!(ohneE.status === "verletzt" && mass(mitE) <= mass(ohneE))) treffer = mitE;
        }
      }
      if (!treffer) { if (unklar) ungeprueft([v], "anteilig, nicht ganzzahlig"); continue; }
      const muss = v.staerke === "muss";
      aus.push({ regel: muss ? "vorgabeMuss" : "vorgabeSoll", stufe: muss ? "achtung" : "hinweis",
        text: `Interne Vorgabe „${String(v.name).slice(0, 80)}“: ${String(treffer.text).replace(`${v.name}: `, "")}${hinweis}`,
        quelle: `Interne Vorgabe (${GRUNDLAGE[(v.grundlage || {}).art] || "Hausregel"})`, art: "vorgabe", regelId: vorgabeRegelId(v) });
    } catch (fehler) {
      /* Aggregate: Budget reicht nicht (vor der Arbeit gemeldet, kein halber Block) → wie im kurzen Weg: diese und alle weiteren offen. */
      if (fehler === AUFGEBRAUCHT) { budget.ausgeschoepft = true; ungeprueft(pruef.slice(i), "Rechenbudget aufgebraucht"); break; }
      ungeprueft([v], "Rechenfehler"); offenMuss = offenMuss || v.staerke === "muss";
    }
  }
  if (offen) {
    const hart = k.automatisch === true && offenMuss;
    const grund = gruende.size ? ` Grund: ${[...gruende].join("; ")}.` : "";
    aus.push({ regel: "vorgabeOffen", stufe: hart ? "achtung" : "hinweis",
      text: (hart ? "Interne Vorgaben konnten hier nicht vollständig geprüft werden (Muss-Vorgabe offen); der Planungsassistent teilt hier nicht automatisch ein."
        : "Interne Vorgaben konnten hier nicht vollständig geprüft werden (Rechengrenze oder Fehler). Die Einteilung ist nicht vollständig geprüft; bitte selbst gegen die Vorgaben prüfen.") + grund,
      quelle: "Interne Vorgabe", art: "vorgabe", regelId: null });
  }
  return aus;
}
