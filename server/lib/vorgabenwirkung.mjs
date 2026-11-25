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
   ========================================================================== */
import { pruefeRegel } from "./regelbaukasten-erweitert.mjs";
import { zeitraum } from "./regelbaukasten.mjs";
import { addDays, dow } from "./regelwerk.mjs";
import { vorgabeAlsRegel, aktiveVorgaben, vorgabeRegelId, VORGABEN_WIRKUNG_GRENZE } from "./vorgaben.mjs";

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

/**
 * Wirkt diese Vorgabe im Plan? Eine Stelle für Rechnung und Verwaltung.
 * @param {any} v
 * @returns {{ wirkt: boolean, grund: string | null }}
 */
export function vorgabePlanwirkung(v) {
  if (!v || typeof v !== "object") return { wirkt: false, grund: NUR_TEST };
  if (!VORGABEN_PLANARTEN.includes(v.regelart)) return { wirkt: false, grund: NUR_TEST };
  const p = v.parameter || {};
  const G = VORGABEN_WIRKUNG_GRENZE;
  if (v.regelart === "zaehlregel" && zaehlFenster(p.fenster) === null)
    return { wirkt: false, grund: `Zeiträume über ${G.fensterTage} Tage rechnen nur im Testlauf; im Plan wirkt diese Regel noch nicht.` };
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
export function neuesVorgabenBudget(aufwand = VORGABEN_WIRKUNG_GRENZE.aufwand) {
  return { rest: aufwand, cache: new WeakMap(), vorbereitet: new WeakMap(), ausgeschoepft: false };
}

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



/**
 * Einmal je Einstieg (Budget) und Vorgabenliste: Dienstart-Abbildung, Qualifikationsnamen, wirkende Vorgaben in stabiler Reihenfolge
 * (Priorität, Kennung) und die daraus gebauten Regeln. Gilt nur, solange Vorgabenliste und Dienstarten/Qualifikationen dieselben Objekte sind.
 * `ueberlang`: aktive Plan-Vorgaben (Muster, Block, Zählregel), die im Plan nicht gerechnet werden (Zeitraum über der Grenze): nie still „bestanden“.
 */
function vorbereiten(m, budget) {
  const gefunden = budget.vorbereitet.get(m.vorgaben);
  if (gefunden && gefunden.dienstarten === m.dienstarten && gefunden.qualifikationen === m.qualifikationen) return gefunden;
  const aktiv = aktiveVorgaben(m.vorgaben).filter((v) => v.staerke !== "wunsch");
  const sortiert = (l) => l.sort((a, b) => (a.prioritaet - b.prioritaet) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const wirkend = sortiert(aktiv.filter((v) => vorgabePlanwirkung(v).wirkt));
  const ueberlang = sortiert(aktiv.filter((v) => VORGABEN_PLANARTEN.includes(v.regelart) && !vorgabePlanwirkung(v).wirkt));
  const kl = klassenAbbildung(m);
  /* Qualifikationsgruppe: Kennung, Kürzel oder Name einer Qualifikation des Betriebs → Kennung. */
  const qual = new Map();
  for (const q of Array.isArray(m.qualifikationen) ? m.qualifikationen : []) {
    if (!q || typeof q !== "object" || q.id === undefined || q.id === null) continue;
    for (const x of [q.name, q.kurz, q.id]) if (x !== undefined && x !== null && x !== "" && !qual.has(kleinText(x))) qual.set(kleinText(x), String(q.id));
    qual.set(kleinText(q.id), String(q.id));
  }
  const regeln = new Map();
  const vb = { dienstarten: m.dienstarten, qualifikationen: m.qualifikationen, wirkend, ueberlang, kl,
    qualFuer: (n) => qual.get(kleinText(n)),
    regelFuer(v) {
      if (!regeln.has(v)) regeln.set(v, vorgabeAlsRegel({ ...v, gueltigAb: null, gueltigBis: null, parameter: parameterKanonisch(v, kl) }, { wirkend: true }));
      return regeln.get(v);
    } };
  budget.vorbereitet.set(m.vorgaben, vb);
  return vb;
}

/**
 * Die Befunde aktiver interner Vorgaben für die Einteilung von Person p in Dienstart da am Tag d.
 * `k.automatisch`: Die Einteilung geschieht ohne Mensch (Planungsassistent). Dann gilt fail-closed: Konnte eine Muss-Vorgabe nicht geprüft werden
 * (Budget, Fehler, Obergrenze, unbekannte Qualifikationsgruppe, Zeitraum über der Grenze, nicht ganzzahlige Teilzeit-Grenze, fehlende
 * Teilzeitquote), ist „vorgabeOffen“ eine Achtung (die Person ist nicht „möglich“); im Warndialog bleibt es ein Hinweis, den der Mensch bewertet.
 * `k.abwesendAm(p, tag)`: Kennung der Abwesenheitsart oder null. Abwesende Tage sind im Plan der Vorgabe ohne Klasse (unbekannt, nie „frei“);
 * Urlaub und Krankheit werden aus Zählregeln herausgenommen (Zähler und Vergleichsgrundlage zugleich).
 * Teilzeit anteilig (Zählregel): Untergrenzen („mindestens“) werden mit der Teilzeitquote skaliert, solange die Vorgabe es nicht ausschließt
 * (`ausnahmen.teilzeitAnteilig === false`); Obergrenzen („höchstens“) nur, wenn die Vorgabe ausdrücklich anteilig gilt (`=== true`). Keine Rundung:
 * Liegt der Zählwert weniger als 1 neben einer nicht ganzzahligen Grenze, ist das Ergebnis offen („anteilig, nicht ganzzahlig“).
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
  for (const v of vb.ueberlang) if (giltFuer(v, p, d, k.einheitAm, vb) !== "nein") ungeprueft([v], `Zeitraum über ${G.fensterTage} Tage (rechnet erst mit den Aggregaten des Planers)`);
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
  for (let i = 0; i < pruef.length; i++) {
    const v = pruef[i];
    if (budget.ausgeschoepft) { ungeprueft(pruef.slice(i), "Rechenbudget aufgebraucht"); break; }
    const geltung = giltFuer(v, p, d, k.einheitAm, vb);
    if (geltung === "nein") continue;
    if (geltung === "offen") { ungeprueft([v], "Qualifikationsgruppe im Betrieb unbekannt"); continue; }
    try {
      const zaehl = v.regelart === "zaehlregel";
      const par = v.parameter || {};
      /* Teilzeit anteilig (nur Zählregel; Schutzvorschriften bleiben unberührt, sie laufen nicht über Vorgaben). */
      let tzFaktor = 1;
      if (zaehl) {
        const flag = (v.ausnahmen || {}).teilzeitAnteilig;
        if (par.richtung === "mindestens" ? flag !== false : flag === true) {
          const q = teilzeitQuote(m, p);
          if (q === null) { ungeprueft([v], "Teilzeitquote nicht bestimmbar"); continue; }
          tzFaktor = q;
        }
      }
      const fenster = fensterUm(v, d);
      const rollierend = zaehl && (par.fenster || {}).art === "rollierend";
      const stichtage = [];
      for (let s = d, n = rollierend ? zaehlFenster(par.fenster) : 1; stichtage.length < n; s = addDays(s, 1)) stichtage.push(s);
      const kosten = 2 * (1 + Math.round((Date.parse(fenster.bis) - Date.parse(fenster.von)) / 86400000)) + 2 * (stichtage.length - 1);
      if (budget.rest < kosten) { budget.ausgeschoepft = true; ungeprueft(pruef.slice(i), "Rechenbudget aufgebraucht"); break; }
      budget.rest -= kosten;
      const tageMit = {}, tageOhne = {};
      const ereignis = zaehl ? kl(par.ereignis) : null;
      const ereignisseMit = [], ereignisseOhne = [];
      const ohneZaehlung = new Set();   // Urlaub/Krankheit: aus Zähler und Vergleichsgrundlage genommen
      for (let t = fenster.von; t <= fenster.bis; t = addDays(t, 1)) {
        let ohne;
        if (t === d) ohne = "frei";
        else {
          const e = tag(t);
          ohne = tagesklasse(e.dienst, e.abw !== null);
          if (e.abw !== null && VORGABEN_ZAEHLUNG_OHNE.includes(String(e.abw))) ohneZaehlung.add(t);
        }
        const mit = t === d ? tagesklasse(da.id, false) : ohne;
        /* Blockregel: Ein Tag ohne Dienst ist im Plan noch offen, nicht „frei“ (er kann später gefüllt werden) — erst zwei verschiedene
           Dienste im Block verletzen. Die übrigen Regeln brauchen den freien Tag (Pause nach einem Block). */
        const offenTag = v.regelart === "blockregel";
        if (ohne !== undefined && !(offenTag && ohne === "frei")) tageOhne[t] = ohne;
        if (mit !== undefined && !(offenTag && mit === "frei")) tageMit[t] = mit;
        if (ereignis !== null) { if (ohne === ereignis) ereignisseOhne.push(t); if (mit === ereignis) ereignisseMit.push(t); }
      }
      const basis = vb.regelFuer(v);
      const grenze0 = Number(par.grenze);
      /* Grenze dieses Stichtags: anteilig zur Teilzeit, bei „mindestens“ zusätzlich nur für die anwesenden Tage des Fensters. */
      const grenzeAm = (st) => {
        if (!zaehl) return { eff: grenze0, ohneTage: 0 };
        let eff = grenze0 * tzFaktor, ohneTage = 0;
        if (par.richtung === "mindestens") {
          const z = zeitraum(par.fenster, st);
          let tage = 0;
          for (let t = z.von; t <= z.bis; t = addDays(t, 1)) { tage++; if (ohneZaehlung.has(t)) ohneTage++; }
          if (ohneTage && tage) eff = eff * ((tage - ohneTage) / tage);
        }
        return { eff: eff === grenze0 ? grenze0 : sauber(eff), ohneTage };
      };
      const rechne = (tage, ereignisse, stichtag, eff) => pruefeRegel(zaehl && eff !== grenze0
        ? { ...basis, parameter: { ...basis.parameter, grenze: eff } } : basis, zaehl
        ? { ereignisse, stichtag } : { tage, von: fenster.von, bis: fenster.bis, stichtag });
      /* Zählregel: Jedes Fenster, das die Einteilung enthält, wird ausgewertet (Stichtage d … d+n−1), nicht nur das am Tag endende. */
      let treffer = null, hinweis = "", unklar = false;
      for (const st of stichtage) {
        const { eff, ohneTage } = grenzeAm(st);
        const mitE = rechne(tageMit, ereignisseMit, st, eff);
        if (mitE.status !== "verletzt") continue;
        const ohneE = rechne(tageOhne, ereignisseOhne, st, eff);
        if (ohneE.status === "verletzt" && mass(mitE) <= mass(ohneE)) continue;
        const ganz = Number.isInteger(eff);
        if (zaehl && !ganz && Math.abs(Number((mitE.fakten || {}).anzahl) - eff) < 1) { unklar = true; continue; }   // keine stille Rundung: offen
        treffer = mitE;
        hinweis = zaehl ? `${eff !== grenze0 ? ` — anteilig: Grenze ${eff}${ganz ? "" : ", nicht ganzzahlig"}` : ""}${ohneTage ? " — ohne Urlaub und Krankheit" : ""}` : "";
        break;
      }
      if (!treffer) { if (unklar) ungeprueft([v], "anteilig, nicht ganzzahlig"); continue; }
      const muss = v.staerke === "muss";
      aus.push({ regel: muss ? "vorgabeMuss" : "vorgabeSoll", stufe: muss ? "achtung" : "hinweis",
        text: `Interne Vorgabe „${String(v.name).slice(0, 80)}“: ${String(treffer.text).replace(`${v.name}: `, "")}${hinweis}`,
        quelle: `Interne Vorgabe (${GRUNDLAGE[(v.grundlage || {}).art] || "Hausregel"})`, art: "vorgabe", regelId: vorgabeRegelId(v) });
    } catch { ungeprueft([v], "Rechenfehler"); offenMuss = offenMuss || v.staerke === "muss"; }
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
