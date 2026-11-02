/* ==========================================================================
   REGELBAUKASTEN

   Die eine Maschine, die neue Regeln rechnet (PLAN-WARNEN-VORGABEN-
   PLANVORSCHLAG, Abschnitt 5.2). Jede Regel wird in eine von wenigen, fest
   geprüften Regelarten übersetzt; nur diese rechnet der Rechenkern, ohne
   Sprachmodell. Eine Regel ist ein Eintrag im Regelregister
   (src/regelregister.js) mit Parametern — kein eigener Code.

   Heute gerechnet:

     zaehlregel        Ereignisse in einem Zeitraum zählen
                       „höchstens 26 Wochen in zwölf Monaten", „mindestens 2
                       freie Wochenenden im Monat"
     grenzregel        ein Wert gegen eine Ober- oder Untergrenze
                       „höchstens 20 Wochenstunden"
     besetzungsregel   Anzahl, Qualifikation, Quote, Verhältnis in einer Schicht
                       „mindestens 40 Prozent Fachpflegekräfte"
     paarregel         A nur zusammen mit B
                       „elektrotechnisch Unterwiesene nur mit Elektrofachkraft"

   Geplant, noch nicht hier: Musterregel, Blockregel, Verteilungsregel,
   Wunschregel. Die Bestandsprüfungen in regelwerk.js und der Planprüfung
   bleiben, wo sie sind; sie werden hier nicht noch einmal gerechnet.

   ---------------------------------------------------------------------------
   Was jede Auswertung zurückgibt

     status     "erfuellt" | "verletzt" | "offen" | "nicht_anwendbar"
     befund     bei „verletzt" und bei „offen"; sonst null
     fakten     was gezählt oder verglichen wurde
     regelId, text

   „offen" heißt: nicht bewertbar, weil Daten fehlen. Das ist ausdrücklich
   keine Grünbewertung — ein Befund auf der Stufe Hinweis sagt es. Dieselbe
   Bedeutung hat `offen` in aufgabeGedeckt() (regelwerk.js).

   „nicht_anwendbar" heißt: Die Regel gilt hier nicht — außerhalb ihrer
   Gültigkeit, oder ihr Prüfstatus lässt sie nicht wirken (watchlist,
   deprecated), oder die Voraussetzung der Regel (Paarregel: niemand mit A)
   liegt nicht vor.

   ---------------------------------------------------------------------------
   Prüfstatus und Stufe

   Ob und wie hoch ein Befund ausfällt, bestimmt begrenzeStufe() im Register,
   nicht die Auswertung. Eine vorläufige Regel (provisional) erzeugt dadurch
   höchstens einen Hinweis — auch dann, wenn ihre Parameter eine Verletzung
   ergeben. Ein watchlist-Eintrag erzeugt gar nichts.

   Bewertung (Stufe) und Folge (was danach geschieht) sind getrennte Felder.
   ========================================================================== */
import { addDays, iso, pISO } from "./regelwerk.js";
import { regel, gilt, begrenzeStufe, wirkung, FOLGEN } from "./regelregister.js";

export const REGELARTEN_GERECHNET = ["zaehlregel", "grenzregel", "besetzungsregel", "paarregel"];

const EPS = 1e-9;

/* --------------------------------------------------------------------------
   Daten und Zeiträume
   -------------------------------------------------------------------------- */
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;
/* Ein Tag, den es nicht gibt (30.02.), ist kein Tag: pISO würde ihn auf den 02.03. weiterrollen. */
const istTag = (s) => typeof s === "string" && ISO_TAG.test(s) && iso(pISO(s)) === s;

/** n Monate vor oder nach einem Tag; ein Tag, den der Zielmonat nicht hat, rückt auf dessen letzten. */
export function addMonate(tag, n) {
  const [y, m, d] = tag.split("-").map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const letzter = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d, letzter));
  return iso(t);
}

/**
 * Der Zeitraum, in dem gezählt wird.
 *
 *   rollierend, tage|wochen|monate  endet am Stichtag und reicht so weit zurück,
 *                                   wie lang er ist. Zwölf Monate bis zum
 *                                   31.03.2026 beginnen am 01.04.2025; bis zum
 *                                   29.02.2024 am 01.03.2023.
 *   kalendermonat                   der ganze Monat des Stichtags, auch seine
 *                                   späteren Tage (Plan!)
 *   kalenderjahr                    das ganze Jahr des Stichtags
 *
 * @returns {{von: string, bis: string}}
 */
export function zeitraum(fenster, stichtag) {
  if (!fenster || !istTag(stichtag)) throw new Error("Zeitraum: Fenster oder Stichtag fehlt.");
  const laenge = Number(fenster.laenge);
  switch (fenster.art) {
    case "rollierend": {
      if (!(laenge >= 1)) throw new Error("Zeitraum: Länge fehlt.");
      if (fenster.einheit === "tage") return { von: addDays(stichtag, -(laenge - 1)), bis: stichtag };
      if (fenster.einheit === "wochen") return { von: addDays(stichtag, -(7 * laenge - 1)), bis: stichtag };
      if (fenster.einheit === "monate") return { von: addDays(addMonate(stichtag, -laenge), 1), bis: stichtag };
      throw new Error(`Zeitraum: Einheit „${fenster.einheit}" unbekannt.`);
    }
    case "kalendermonat": {
      const [y, m] = stichtag.split("-").map(Number);
      const letzter = new Date(y, m, 0).getDate();
      return { von: `${y}-${String(m).padStart(2, "0")}-01`, bis: `${y}-${String(m).padStart(2, "0")}-${String(letzter).padStart(2, "0")}` };
    }
    case "kalenderjahr": {
      const y = stichtag.slice(0, 4);
      return { von: `${y}-01-01`, bis: `${y}-12-31` };
    }
    default:
      throw new Error(`Zeitraum: Art „${fenster.art}" unbekannt.`);
  }
}

/* --------------------------------------------------------------------------
   Befund und Ergebnis
   -------------------------------------------------------------------------- */
const quelleText = (r) => {
  if (!r.quelle) return "Betriebliche Festlegung";
  return r.fundstelle ? `${r.fundstelle} ${r.quelle}` : r.quelle;
};

/** Die Folge, wenn die Regel keine eigene nennt: Hinweis nur anzeigen, sonst bestätigen lassen (E-19). */
const folgeFuer = (r, stufe) => (r.folge && FOLGEN.includes(r.folge) ? r.folge : stufe === "hinweis" ? "keine" : "bestaetigung");

function befund(r, wunschStufe, text, fakten) {
  const stufe = begrenzeStufe(r, wunschStufe);
  if (!stufe) return null;
  return {
    stufe, text, quelle: quelleText(r), art: "regel",
    regelId: r.id, fundstelle: r.fundstelle || null, ebene: r.ebene,
    regelstand: r.regelstand || null, pruefstatus: r.pruefstatus,
    parameter: r.parameter || null, fakten,
    folge: folgeFuer(r, stufe),
  };
}

const erfuellt = (r, text, fakten) => ({ regelId: r.id, status: "erfuellt", befund: null, offen: false, text, fakten });
const nichtAnwendbar = (r, grund, text) => ({ regelId: r ? r.id : null, status: "nicht_anwendbar", befund: null, offen: false, grund, text, fakten: null });
const verletzt = (r, text, fakten) => ({ regelId: r.id, status: "verletzt", befund: befund(r, r.hoechsteStufe || "achtung", text, fakten), offen: false, text, fakten });
/* Eine offene Regel ist nie „grün": Der Befund sagt, was fehlt. Mehr als ein Hinweis ist er nicht. */
const offen = (r, text, fakten) => ({ regelId: r.id, status: "offen", befund: befund(r, "hinweis", `Nicht bewertbar: ${text}`, fakten), offen: true, text, fakten });

/** Gilt die Regel hier? Sonst steht der Grund im Ergebnis. */
function anwendung(r, datum) {
  if (!r) throw new Error("Regelbaukasten: Regel nicht gefunden.");
  if (wirkung(r) === "keine") return nichtAnwendbar(r, r.pruefstatus, `Die Regel wirkt nicht (Prüfstatus ${r.pruefstatus}).`);
  if (!gilt(r, datum)) return nichtAnwendbar(r, "ausserhalb_gueltigkeit", "Die Regel gilt an diesem Tag nicht.");
  return null;
}

const holeRegel = (regelOderId, typ) => {
  const r = typeof regelOderId === "string" ? regel(regelOderId) : regelOderId;
  if (!r) throw new Error(`Regelbaukasten: Regel „${regelOderId}" ist nicht im Register.`);
  /* Was der Bestandscode schon rechnet, rechnet der Baukasten nicht ein zweites Mal. */
  if (r.pruefstatus === "legacy_verified" || r.laufzeit === "bestand") throw new Error(`Regelbaukasten: ${r.id} ist eine Bestandsregel; sie wird vom Bestandscode gerechnet.`);
  if (r.typ !== typ) throw new Error(`Regelbaukasten: ${r.id} ist eine ${r.typ}, keine ${typ}.`);
  return r;
};

/* --------------------------------------------------------------------------
   ZÄHLREGEL

   parameter: { ereignis, fenster, richtung: "hoechstens" | "mindestens", grenze }
   kontext:   { ereignisse: [Tag, …], stichtag }

   Gezählt werden verschiedene Tage: Zwei Ereignisse am selben Tag sind eines.
   Ein Ereignis ist, was der Aufrufer so nennt — ein Diensttag, ein Nachtdienst,
   der Beginn einer Woche mit Überschreitung. Was zählt, entscheidet er, nicht
   die Regel.
   -------------------------------------------------------------------------- */
export function zaehlregel(regelOderId, { ereignisse, stichtag } = {}) {
  const r = holeRegel(regelOderId, "zaehlregel");
  const nein = anwendung(r, stichtag);
  if (nein) return nein;
  const p = r.parameter || {};
  const grenze = Number(p.grenze);
  if (!Number.isFinite(grenze) || !p.fenster || !["hoechstens", "mindestens"].includes(p.richtung))
    throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter.`);
  if (!istTag(stichtag)) return offen(r, "Stichtag fehlt.", null);
  if (!Array.isArray(ereignisse)) return offen(r, "Die Ereignisse sind nicht bekannt.", null);
  if (ereignisse.some((t) => !istTag(t))) return offen(r, "Ein Ereignis hat kein gültiges Datum.", null);

  const z = zeitraum(p.fenster, stichtag);
  const n = new Set(ereignisse.filter((t) => t >= z.von && t <= z.bis)).size;
  const fakten = { anzahl: n, grenze, richtung: p.richtung, von: z.von, bis: z.bis, ereignis: p.ereignis || null };
  const ok = p.richtung === "hoechstens" ? n <= grenze : n >= grenze;
  const was = p.ereignis ? ` (${p.ereignis})` : "";
  const text = `${n} im Zeitraum ${z.von} bis ${z.bis}${was}, ${p.richtung} ${grenze} erlaubt`;
  return ok ? erfuellt(r, text, fakten) : verletzt(r, `${r.bezeichnung}: ${text}`, fakten);
}

/* --------------------------------------------------------------------------
   GRENZREGEL

   parameter: { groesse, hoechstens?, mindestens? }
   kontext:   { wert }

   Die Grenze selbst ist erlaubt: genau 20 Stunden bei „höchstens 20" sind in
   Ordnung.
   -------------------------------------------------------------------------- */
export function grenzregel(regelOderId, { wert, datum } = {}) {
  const r = holeRegel(regelOderId, "grenzregel");
  const nein = anwendung(r, datum);
  if (nein) return nein;
  const p = r.parameter || {};
  const hat = (x) => x !== undefined && x !== null;
  if (!hat(p.hoechstens) && !hat(p.mindestens)) throw new Error(`Regelbaukasten: ${r.id} hat keine Grenze.`);
  if (typeof wert !== "number" || !Number.isFinite(wert)) return offen(r, `Der Wert „${p.groesse || "?"}" ist nicht bekannt.`, null);
  const fakten = { wert, groesse: p.groesse || null, hoechstens: hat(p.hoechstens) ? p.hoechstens : null, mindestens: hat(p.mindestens) ? p.mindestens : null };
  const zuViel = hat(p.hoechstens) && wert > p.hoechstens + EPS;
  const zuWenig = hat(p.mindestens) && wert < p.mindestens - EPS;
  if (!zuViel && !zuWenig) return erfuellt(r, `${p.groesse || "Wert"} ${wert}: innerhalb der Grenze`, fakten);
  return verletzt(r, `${r.bezeichnung}: ${p.groesse || "Wert"} ${wert}, ${zuViel ? `höchstens ${p.hoechstens}` : `mindestens ${p.mindestens}`} erlaubt`, fakten);
}

/* --------------------------------------------------------------------------
   BESETZUNGSREGEL

   parameter.anforderungen — jede muss erfüllt sein:
     { art: "anzahl",     min }                     Personen insgesamt
     { art: "anzahlMit",  merkmal, min }            Personen mit Merkmal (Qualifikation, Funktion)
     { art: "quoteMit",   merkmal, min?, max? }     Anteil mit Merkmal an allen
     { art: "verhaeltnis", zaehler, nenner, min }   mindestens `min` Zähler je Nenner
                                                    (0,333 = eine je drei; nur bei vollständigen Daten)

   kontext: { personen: [{ id?, merkmale: [..] }], datum? }

   Fehlen Daten, ist das Ergebnis „offen", nicht „erfüllt": keine Personenliste,
   keine Merkmale an einer Person, eine Quote ohne Personen. Eine Person ohne
   Angabe kann das Merkmal haben; sie wird deshalb weder gezählt noch
   abgezogen, sondern macht den Fall nur dann offen, wenn er davon abhängt.
   -------------------------------------------------------------------------- */
function pruefeAnforderung(a, personen) {
  const bekannt = personen.filter((p) => Array.isArray(p && p.merkmale));
  const unbekannt = personen.length - bekannt.length;
  const mit = (m) => bekannt.filter((p) => p.merkmale.includes(m)).length;
  const gesamt = personen.length;

  switch (a.art) {
    case "anzahl":
      return gesamt >= a.min ? { ok: true } : { ok: false, text: `${gesamt} von mindestens ${a.min} Personen`, fakten: { gesamt, min: a.min } };
    case "anzahlMit": {
      const k = mit(a.merkmal);
      const fakten = { merkmal: a.merkmal, anzahl: k, unbekannt, min: a.min };
      if (k >= a.min) return { ok: true, fakten };
      if (k + unbekannt < a.min) return { ok: false, text: `${k} von mindestens ${a.min} mit „${a.merkmal}"`, fakten };
      return { offen: true, text: `${unbekannt} Person(en) ohne Angabe zu „${a.merkmal}"`, fakten };
    }
    case "quoteMit": {
      if (gesamt === 0) return { offen: true, text: "keine Personen im Dienst — eine Quote lässt sich nicht berechnen", fakten: { gesamt } };
      const k = mit(a.merkmal), kMax = k + unbekannt;
      const fakten = { merkmal: a.merkmal, anzahl: k, unbekannt, gesamt, quote: k / gesamt, min: a.min ?? null, max: a.max ?? null };
      const hatMin = a.min !== undefined && a.min !== null, hatMax = a.max !== undefined && a.max !== null;
      if (hatMin && kMax / gesamt < a.min - EPS)
        return { ok: false, text: `${k} von ${gesamt} mit „${a.merkmal}" (${Math.round((k / gesamt) * 1000) / 10} %), mindestens ${Math.round(a.min * 1000) / 10} %`, fakten };
      if (hatMax && k / gesamt > a.max + EPS)
        return { ok: false, text: `${k} von ${gesamt} mit „${a.merkmal}" (${Math.round((k / gesamt) * 1000) / 10} %), höchstens ${Math.round(a.max * 1000) / 10} %`, fakten };
      const sicherMin = !hatMin || k / gesamt >= a.min - EPS;
      const sicherMax = !hatMax || kMax / gesamt <= a.max + EPS;
      if (sicherMin && sicherMax) return { ok: true, fakten };
      return { offen: true, text: `${unbekannt} Person(en) ohne Angabe zu „${a.merkmal}"`, fakten };
    }
    case "verhaeltnis": {
      if (unbekannt) return { offen: true, text: `${unbekannt} Person(en) ohne Angabe`, fakten: { unbekannt } };
      const z = mit(a.zaehler), n = mit(a.nenner);
      const noetig = Math.ceil(n * a.min - EPS);
      const fakten = { zaehler: a.zaehler, nenner: a.nenner, anzahlZaehler: z, anzahlNenner: n, min: a.min, noetig };
      return z >= noetig ? { ok: true, fakten } : { ok: false, text: `${z} „${a.zaehler}" bei ${n} „${a.nenner}", nötig ${noetig}`, fakten };
    }
    default:
      throw new Error(`Regelbaukasten: Anforderung „${a.art}" unbekannt.`);
  }
}

export function besetzungsregel(regelOderId, { personen, datum } = {}) {
  const r = holeRegel(regelOderId, "besetzungsregel");
  const nein = anwendung(r, datum);
  if (nein) return nein;
  const anf = r.parameter && r.parameter.anforderungen;
  if (!Array.isArray(anf) || !anf.length) throw new Error(`Regelbaukasten: ${r.id} hat keine Anforderungen.`);
  if (!Array.isArray(personen)) return offen(r, "Die Personen im Dienst sind nicht bekannt.", null);

  const verletzte = [], offene = [], fakten = [];
  for (const a of anf) {
    const e = pruefeAnforderung(a, personen);
    if (e.fakten) fakten.push(e.fakten);
    if (e.ok === false) verletzte.push(e.text);
    else if (e.offen) offene.push(e.text);
  }
  if (verletzte.length) return verletzt(r, `${r.bezeichnung}: ${verletzte.join("; ")}`, fakten);
  if (offene.length) return offen(r, offene.join("; "), fakten);
  return erfuellt(r, `${r.bezeichnung}: erfüllt`, fakten);
}

/* --------------------------------------------------------------------------
   PAARREGEL

   parameter: { wenn, dann, min }     Wer „wenn" hat, braucht mindestens `min`
                                      andere Personen mit „dann" im Dienst.
   kontext:   { personen: [{ id, merkmale: [..] }], datum? }

   Wer beide Merkmale hat, zählt für die anderen als „dann", nie für sich
   selbst. Ist niemand mit „wenn" im Dienst, ist die Regel nicht anwendbar —
   „nur B vorhanden" und „beide fehlen" sind in Ordnung.
   -------------------------------------------------------------------------- */
export function paarregel(regelOderId, { personen, datum } = {}) {
  const r = holeRegel(regelOderId, "paarregel");
  const nein = anwendung(r, datum);
  if (nein) return nein;
  const p = r.parameter || {};
  const min = p.min === undefined ? 1 : Number(p.min);
  if (!p.wenn || !p.dann || !(min >= 1)) throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter.`);
  if (!Array.isArray(personen)) return offen(r, "Die Personen im Dienst sind nicht bekannt.", null);

  const bekannt = (x) => Array.isArray(x && x.merkmale);
  const ohneAngabe = personen.filter((x) => !bekannt(x)).length;
  const mitWenn = personen.filter((x) => bekannt(x) && x.merkmale.includes(p.wenn));
  if (!mitWenn.length) {
    return ohneAngabe
      ? offen(r, `${ohneAngabe} Person(en) ohne Angabe zu „${p.wenn}"`, { ohneAngabe })
      : nichtAnwendbar(r, "voraussetzung_fehlt", `Niemand mit „${p.wenn}" im Dienst.`);
  }
  const fehlend = [];
  let unsicher = false;
  for (const x of mitWenn) {
    const andere = personen.filter((y) => y !== x);
    const k = andere.filter((y) => bekannt(y) && y.merkmale.includes(p.dann)).length;
    const unklar = andere.filter((y) => !bekannt(y)).length;
    if (k >= min) continue;
    if (k + unklar >= min) { unsicher = true; continue; }
    fehlend.push(x.id ?? "?");
  }
  const fakten = { wenn: p.wenn, dann: p.dann, min, personenMitWenn: mitWenn.length, ohneAngabe, ohne: fehlend };
  if (fehlend.length) return verletzt(r, `${r.bezeichnung}: ${fehlend.length} von ${mitWenn.length} ohne „${p.dann}" im Dienst`, fakten);
  if (unsicher) return offen(r, `${ohneAngabe} Person(en) ohne Angabe zu „${p.dann}"`, fakten);
  return erfuellt(r, `${r.bezeichnung}: erfüllt`, fakten);
}

/**
 * Wertet eine Regel nach ihrer Regelart aus.
 * @param {object|string} regelOderId Eintrag aus dem Regelregister oder dessen Kennung
 * @param {object} kontext siehe die jeweilige Regelart
 */
export function pruefeRegel(regelOderId, kontext = {}) {
  const r = typeof regelOderId === "string" ? regel(regelOderId) : regelOderId;
  if (!r) throw new Error(`Regelbaukasten: Regel „${regelOderId}" ist nicht im Register.`);
  if (r.pruefstatus === "legacy_verified" || r.laufzeit === "bestand") throw new Error(`Regelbaukasten: ${r.id} ist eine Bestandsregel; sie wird vom Bestandscode gerechnet.`);
  switch (r.typ) {
    case "zaehlregel": return zaehlregel(r, kontext);
    case "grenzregel": return grenzregel(r, kontext);
    case "besetzungsregel": return besetzungsregel(r, kontext);
    case "paarregel": return paarregel(r, kontext);
    default:
      throw new Error(`Regelbaukasten: Die Regelart „${r.typ}" wird hier noch nicht gerechnet (${r.id}).`);
  }
}
