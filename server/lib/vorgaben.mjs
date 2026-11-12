/* ==========================================================================
   INTERNE VORGABEN — Verwaltung (WP-I4, Block K des Intelligence-Plans)

   Eine interne Vorgabe ist eine betriebliche Regel („Wochenend-Rotation",
   „nach Nachtdienst kein Frühdienst"). Sie steht als Liste `vorgaben` im
   Betrieb und wird von der Leitung (org.edit) angelegt, getestet und
   aktiviert. Gerechnet wird sie vom Regelbaukasten (WP-I3,
   regelbaukasten-erweitert.mjs, acht Arten) — hier steht nur die Verwaltung:

     - das Datenmodell (Plan 5.1: Geltung, Zeitraum, Bezug, Stärke, Priorität,
       Grundlage, Ausnahmen, Status),
     - die Prüfung der Form (Schreibweg des Servers) und die Umsetzung in ein
       Regelobjekt des Baukastens,
     - die Stufengrenzen (E-21: Basis 5, Business 25, Enterprise unbegrenzt,
       gezählt werden aktive Vorgaben),
     - die neutrale Sicht des Betriebsrats (Zahlen und Texte, keine Personen),
     - Beispielfälle für den Testlauf.

   NICHT hier (WP-I5, Vorgaben wirksam machen): Planungsassistent, Ersatzsuche,
   Selbstplanung und die Prüfung gegen den echten Plan. Eine aktive Vorgabe
   ist gespeichert und rechenbar, wirkt aber noch in keiner Planungsfunktion.

   Rein: keine Ablage; einzige Uhr: `jetzt` wird übergeben (Server stempelt).
   ========================================================================== */
import { pruefeRegel, testlauf, REGELARTEN_ALLE } from "./regelbaukasten-erweitert.mjs";

export const VORGABEN_REGELARTEN = REGELARTEN_ALLE;
export const VORGABEN_STAERKEN = Object.freeze(["muss", "soll", "wunsch"]);
export const VORGABEN_STATUS = Object.freeze(["entwurf", "aktiv", "inaktiv"]);
export const VORGABEN_GRUNDLAGEN = Object.freeze(["hausregel", "betriebsvereinbarung", "tarif"]);
export const VORGABEN_BEZUEGE = Object.freeze(["woche", "monat", "quartal", "rotation"]);
export const VORGABEN_GELTUNG = Object.freeze(["betrieb", "einheit", "gruppe", "personen"]);
export const VORGABEN_GRENZEN_FELD = Object.freeze({
  max: 200, name: 80, beschreibung: 500, fundstelle: 120, parameterZeichen: 2000,
  einheiten: 50, gruppen: 20, gruppeLaenge: 40, personen: 300, zeitraeume: 20, idLaenge: 30,
});

/** Aktive Vorgaben je Preisstufe (E-21, Plan 10.2). Unbekannte Stufe: die kleinste (fail closed). */
export const VORGABEN_STUFENGRENZE = Object.freeze({ basis: 5, pro: 25, enterprise: Infinity });
/** @param {any} tarifId @returns {number} */
export function vorgabenGrenze(tarifId) {
  return Object.prototype.hasOwnProperty.call(VORGABEN_STUFENGRENZE, tarifId) ? VORGABEN_STUFENGRENZE[tarifId] : VORGABEN_STUFENGRENZE.basis;
}

const FELDER = ["id", "name", "beschreibung", "regelart", "parameter", "geltung", "gueltigAb", "gueltigBis", "bezug", "staerke",
  "prioritaet", "grundlage", "ausnahmen", "status"];
/** Vom Server gesetzt; was der Client schickt, wird überschrieben. */
export const VORGABEN_SERVERFELDER = Object.freeze(["geaendertAm", "geaendertVon", "aktiviertAm", "aktiviertVon"]);

/* Wortstämme, die in Vorgaben nichts zu suchen haben (Plan 6.3) — wie im Baukasten; dort nicht exportiert. */
const VERBOTEN = /krank|gesund|fehlzeit|leistung|zuverl|verhalten|diagnos|schwanger|behinder|disziplin/i;

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;
const istTag = (s) => {
  if (typeof s !== "string" || !ISO_TAG.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const ID = /^[a-z0-9][a-z0-9-]{0,29}$/;
const textOk = (s, max) => typeof s === "string" && s.length <= max;
const idListe = (l, max) => Array.isArray(l) && l.length <= max && l.every((x) => typeof x === "string" && x.length >= 1 && x.length <= 60)
  && new Set(l).size === l.length;

/** Die Regelkennung im Baukasten — Großbuchstaben, damit sie dem Kennungsformat des Bestätigungsprotokolls entspricht. */
export const vorgabeRegelId = (v) => `VORGABE-${String(v && v.id).toUpperCase()}`;

const GRUNDLAGE_TEXT = { hausregel: "Hausregel", betriebsvereinbarung: "Betriebsvereinbarung", tarif: "Tarifvertrag" };

/**
 * Die Vorgabe als Regelobjekt des Baukastens. Status und Stärke bestimmen die Wirkung:
 * nur „aktiv" wirkt (Prüfstatus verified), Entwurf und inaktiv bleiben „watchlist" (keine Wirkung);
 * Muss deckelt bei „achtung" mit Bestätigung, Soll und Wunsch bei „hinweis" ohne Folge (Plan 5.1).
 * @param {any} v
 * @param {{ wirkend?: boolean }} [o] wirkend: true rechnet auch einen Entwurf (Testlauf)
 */
export function vorgabeAlsRegel(v, { wirkend = false } = {}) {
  const muss = v.staerke === "muss";
  const g = v.grundlage || {};
  return {
    id: vorgabeRegelId(v), typ: v.regelart, bezeichnung: v.name, parameter: v.parameter,
    ebene: "intern", quelle: GRUNDLAGE_TEXT[g.art] || "Hausregel", fundstelle: g.fundstelle || null,
    pruefstatus: wirkend || v.status === "aktiv" ? "verified" : "watchlist",
    hoechsteStufe: muss ? "achtung" : "hinweis", folge: muss ? "bestaetigung" : "keine",
    gueltigAb: v.gueltigAb || null, gueltigBis: v.gueltigBis || null, regelstand: null,
  };
}

/**
 * Prüft die Form einer Vorgabe und, ob der Baukasten ihre Parameter rechnen kann.
 * Gibt die erste Abweisung als Text zurück, sonst null.
 * @param {any} v
 * @returns {string | null}
 */
export function pruefeVorgabe(v) {
  const G = VORGABEN_GRENZEN_FELD;
  if (!istObjekt(v)) return "Vorgabe: erwartet wird ein Datensatz.";
  const wo = `Vorgabe ${String(v.name || v.id || "").slice(0, 30)}`.trim();
  if (Object.keys(v).some((k) => !FELDER.includes(k) && !VORGABEN_SERVERFELDER.includes(k))) return `${wo}: unbekannte Felder.`;
  if (typeof v.id !== "string" || !ID.test(v.id)) return `${wo}: Kennung fehlt oder ist ungültig (Kleinbuchstaben, Ziffern, Bindestrich, höchstens ${G.idLaenge}).`;
  if (typeof v.name !== "string" || !v.name.trim() || v.name.length > G.name) return `${wo}: Name fehlt oder ist zu lang.`;
  if (v.beschreibung !== undefined && !textOk(v.beschreibung, G.beschreibung)) return `${wo}: Beschreibung ist zu lang.`;
  if (VERBOTEN.test(v.name) || VERBOTEN.test(String(v.beschreibung || "")))
    return `${wo}: Vorgaben nennen kein Personenmerkmal wie Gesundheit, Leistung oder Verhalten (Plan 6.3); bitte weglassen.`;
  if (!VORGABEN_REGELARTEN.includes(v.regelart)) return `${wo}: Regelart unbekannt.`;
  if (!istObjekt(v.parameter) || JSON.stringify(v.parameter).length > G.parameterZeichen) return `${wo}: Parameter fehlen oder sind zu lang.`;
  if (VERBOTEN.test(JSON.stringify(v.parameter))) return `${wo}: Parameter nennen ein Personenmerkmal wie Gesundheit, Leistung oder Verhalten (Plan 6.3); bitte weglassen.`;
  if (!VORGABEN_STAERKEN.includes(v.staerke)) return `${wo}: Stärke ist Muss, Soll oder Wunsch.`;
  if (!Number.isInteger(v.prioritaet) || v.prioritaet < 1 || v.prioritaet > 99) return `${wo}: Priorität ist eine ganze Zahl von 1 bis 99.`;
  if (!VORGABEN_BEZUEGE.includes(v.bezug)) return `${wo}: Bezugszeitraum ist Woche, Monat, Quartal oder Schichtrotation.`;
  if (!VORGABEN_STATUS.includes(v.status)) return `${wo}: Status ist Entwurf, aktiv oder inaktiv.`;
  for (const f of ["gueltigAb", "gueltigBis"]) if (v[f] !== undefined && v[f] !== null && v[f] !== "" && !istTag(v[f])) return `${wo}: ${f === "gueltigAb" ? "Gültig ab" : "Gültig bis"} ist kein Datum.`;
  if (v.gueltigAb && v.gueltigBis && v.gueltigAb > v.gueltigBis) return `${wo}: Gültig ab liegt nach gültig bis.`;

  const geltung = v.geltung;
  if (!istObjekt(geltung) || !VORGABEN_GELTUNG.includes(geltung.art)) return `${wo}: Geltung ist Betrieb, Einheit, Personengruppe oder einzelne Personen.`;
  if (Object.keys(geltung).some((k) => !["art", "einheiten", "gruppen", "personen"].includes(k))) return `${wo}: Geltung hat unbekannte Felder.`;
  if (geltung.einheiten !== undefined && !idListe(geltung.einheiten, G.einheiten)) return `${wo}: Einheiten als Liste von Kennungen erwartet.`;
  if (geltung.gruppen !== undefined && !(Array.isArray(geltung.gruppen) && geltung.gruppen.length <= G.gruppen
    && geltung.gruppen.every((x) => typeof x === "string" && x.trim() && x.length <= G.gruppeLaenge && !VERBOTEN.test(x)))) return `${wo}: Personengruppen als kurze Texte ohne Personenmerkmal erwartet.`;
  if (geltung.personen !== undefined && !idListe(geltung.personen, G.personen)) return `${wo}: Personen als Liste von Kennungen erwartet.`;
  const hat = (k) => Array.isArray(geltung[k]) && geltung[k].length > 0;
  if (geltung.art === "einheit" && !hat("einheiten")) return `${wo}: Bei Geltung „Einheit" fehlt die Einheit.`;
  if (geltung.art === "gruppe" && !hat("gruppen")) return `${wo}: Bei Geltung „Personengruppe" fehlt die Gruppe.`;
  if (geltung.art === "personen" && !hat("personen")) return `${wo}: Bei Geltung „einzelne Personen" fehlt die Person.`;

  const g = v.grundlage;
  if (!istObjekt(g) || !VORGABEN_GRUNDLAGEN.includes(g.art)) return `${wo}: Grundlage ist Hausregel, Betriebsvereinbarung oder Tarif.`;
  if (Object.keys(g).some((k) => !["art", "fundstelle"].includes(k))) return `${wo}: Grundlage hat unbekannte Felder.`;
  if (g.fundstelle !== undefined && !textOk(g.fundstelle, G.fundstelle)) return `${wo}: Fundstelle ist zu lang.`;

  if (v.ausnahmen !== undefined) {
    const a = v.ausnahmen;
    if (!istObjekt(a) || Object.keys(a).some((k) => !["personen", "zeitraeume", "teilzeitAnteilig"].includes(k))) return `${wo}: Ausnahmen haben eine unbekannte Form.`;
    if (a.personen !== undefined && !idListe(a.personen, G.personen)) return `${wo}: Ausnahmen: Personen als Liste von Kennungen erwartet.`;
    if (a.teilzeitAnteilig !== undefined && typeof a.teilzeitAnteilig !== "boolean") return `${wo}: Ausnahmen: „Teilzeit anteilig" ist Ja oder Nein.`;
    if (a.zeitraeume !== undefined && !(Array.isArray(a.zeitraeume) && a.zeitraeume.length <= G.zeitraeume
      && a.zeitraeume.every((z) => istObjekt(z) && Object.keys(z).every((k) => ["von", "bis"].includes(k)) && istTag(z.von) && istTag(z.bis) && z.von <= z.bis)))
      return `${wo}: Ausnahmen: Zeiträume als Liste mit Von und Bis erwartet.`;
  }

  /* Der Baukasten ist der Prüfer der Parameter: Er wirft bei unvollständigen Parametern und bei Personenmerkmalen. */
  try { pruefeRegel(vorgabeAlsRegel({ ...v, gueltigAb: null, gueltigBis: null }, { wirkend: true }), {}); }
  catch (e) { return `${wo}: ${String((e && e.message) || e).replace(/^Regelbaukasten:\s*/, "").slice(0, 200)}`; }
  return null;
}

/** Aktive Vorgaben. */
export const aktiveVorgaben = (liste) => (Array.isArray(liste) ? liste : []).filter((v) => istObjekt(v) && v.status === "aktiv");

/**
 * Der Schreibweg: prüft die übermittelte Liste gegen den gespeicherten Stand und setzt Wann/Wer.
 * Was unverändert ist, bleibt unberührt (auch Altbestand wird nicht nachträglich abgewiesen);
 * Neues oder Geändertes wird streng geprüft.
 *
 *   - Ändern, Anlegen, Aktivieren, Löschen: nur die Organisationsleitung (`darfOrgEdit`).
 *   - Höchstens `grenze` aktive Vorgaben; ein Betrieb über der Grenze (Stufenwechsel nach unten)
 *     behält seine aktiven, kann aber keine weitere aktivieren.
 *   - Wann und Wer (geaendertAm/-Von, aktiviertAm/-Von) setzt der Server; Angaben des Clients werden verworfen.
 *
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter Betrieb
 * @param {{ darfOrgEdit: boolean, person: any, tarif?: any, jetzt: string }} ktx
 * @returns {{ grund?: string, mandant?: any }}
 */
export function vorgabenZusammen(altM, neuM, { darfOrgEdit, person, tarif, jetzt }) {
  if (!istObjekt(neuM)) return { mandant: neuM };
  const alt = Array.isArray(altM && altM.vorgaben) ? altM.vorgaben : [];
  const hatNeu = Object.prototype.hasOwnProperty.call(neuM, "vorgaben");
  if (!hatNeu) return alt.length ? { mandant: { ...neuM, vorgaben: alt } } : { mandant: neuM };
  const neu = neuM.vorgaben;
  const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /* Ohne Serverfelder vergleichen: Ein Rundweg ändert nichts, auch wenn die Stempel mitkommen. */
  const ohneStempel = (v) => { if (!istObjekt(v)) return v; const k = { ...v }; for (const f of VORGABEN_SERVERFELDER) delete k[f]; return k; };
  const altMap = new Map(alt.filter(istObjekt).map((v) => [v.id, v]));
  if (!Array.isArray(neu)) return { grund: "Vorgaben: erwartet wird eine Liste." };
  if (gleich(neu.map(ohneStempel), alt.map(ohneStempel))) {
    /* Nichts geändert: der gespeicherte Stand gilt (mitgeschickte Stempel sind wirkungslos). */
    return { mandant: alt.length || (altM && Object.prototype.hasOwnProperty.call(altM, "vorgaben")) ? { ...neuM, vorgaben: alt } : neuM };
  }
  if (!darfOrgEdit) return { grund: "Interne Vorgaben legt die Organisationsleitung an und ändert sie (org.edit)." };
  if (neu.length > VORGABEN_GRENZEN_FELD.max) return { grund: `Vorgaben: höchstens ${VORGABEN_GRENZEN_FELD.max}.` };

  const ids = new Set();
  const aus = [];
  for (const v of neu) {
    const f = pruefeVorgabeKurz(v, altMap);
    if (f) return { grund: f };
    if (ids.has(v.id)) return { grund: `Vorgabe ${String(v.id).slice(0, 30)}: Kennung kommt doppelt vor.` };
    ids.add(v.id);
    const vorher = altMap.get(v.id);
    const k = ohneStempel(v);
    if (vorher && gleich(k, ohneStempel(vorher))) { aus.push(vorher); continue; }
    const st = { ...k, geaendertAm: jetzt, geaendertVon: person === undefined || person === null ? null : String(person) };
    if (v.status === "aktiv" && !(vorher && vorher.status === "aktiv")) { st.aktiviertAm = jetzt; st.aktiviertVon = st.geaendertVon; }
    else if (v.status === "aktiv" && vorher) {
      if (vorher.aktiviertAm) st.aktiviertAm = vorher.aktiviertAm;
      if (vorher.aktiviertVon !== undefined) st.aktiviertVon = vorher.aktiviertVon;
    }
    aus.push(st);
  }
  const grenze = vorgabenGrenze(tarif);
  const aktivNeu = aktiveVorgaben(aus).length;
  if (aktivNeu > grenze && aktivNeu > aktiveVorgaben(alt).length)
    return { grund: `In dieser Preisstufe sind höchstens ${grenze} aktive Vorgaben möglich (derzeit ${aktivNeu}).` };
  return { mandant: { ...neuM, vorgaben: aus } };
}

/** Streng nur, wenn neu oder geändert (Altbestand bleibt stehen). */
function pruefeVorgabeKurz(v, altMap) {
  if (!istObjekt(v)) return "Vorgabe: erwartet wird ein Datensatz.";
  const vorher = altMap.get(v.id);
  const k = { ...v }; for (const f of VORGABEN_SERVERFELDER) delete k[f];
  const kv = vorher ? { ...vorher } : null;
  if (kv) for (const f of VORGABEN_SERVERFELDER) delete kv[f];
  if (kv && JSON.stringify(k) === JSON.stringify(kv)) return null;
  return pruefeVorgabe(k);
}

/**
 * Sicht des Betriebsrats (Plan 5, Block K): Zahlen und Texte der Vorgabe, keine Personen — weder die der Geltung
 * noch die der Ausnahmen (dort nur die Anzahl) noch wer geändert hat.
 * @param {any} liste
 */
export function vorgabenBetriebsrat(liste) {
  return (Array.isArray(liste) ? liste : []).filter(istObjekt).map((v) => {
    const g = istObjekt(v.geltung) ? v.geltung : {};
    const a = istObjekt(v.ausnahmen) ? v.ausnahmen : {};
    const aus = {
      id: v.id, name: v.name, beschreibung: v.beschreibung, regelart: v.regelart, staerke: v.staerke, prioritaet: v.prioritaet,
      bezug: v.bezug, status: v.status, gueltigAb: v.gueltigAb, gueltigBis: v.gueltigBis,
      geltung: { art: g.art === "personen" ? "personen" : g.art, ...(Array.isArray(g.einheiten) ? { einheiten: g.einheiten } : {}),
        ...(Array.isArray(g.gruppen) ? { gruppen: g.gruppen } : {}), ...(Array.isArray(g.personen) ? { anzahlPersonen: g.personen.length } : {}) },
      grundlage: istObjekt(v.grundlage) ? { art: v.grundlage.art, ...(v.grundlage.fundstelle !== undefined ? { fundstelle: v.grundlage.fundstelle } : {}) } : v.grundlage,
      ausnahmen: { anzahlPersonen: Array.isArray(a.personen) ? a.personen.length : 0, anzahlZeitraeume: Array.isArray(a.zeitraeume) ? a.zeitraeume.length : 0,
        teilzeitAnteilig: a.teilzeitAnteilig === true },
    };
    for (const k of Object.keys(aus)) if (aus[k] === undefined) delete aus[k];
    return aus;
  });
}

/* --------------------------------------------------------------------------
   Parameterfelder für die Oberfläche (Auswahlfelder statt freier Eingabe)
   -------------------------------------------------------------------------- */
const T = (pfad, label, typ = "text", extra = {}) => ({ pfad, label, typ, ...extra });
/** Felder je Regelart. typ: text | zahl | liste (Texte, Komma) | zahlenliste (Wochentage 0–6, Komma) | wahl. */
export const PARAMETER_FELDER = Object.freeze({
  zaehlregel: [T("ereignis", "Was wird gezählt"), T("fenster.art", "Zeitraum", "wahl", { optionen: ["kalendermonat", "kalenderjahr", "rollierend"] }),
    T("fenster.laenge", "Länge (nur rollierend)", "zahl", { optional: true }), T("fenster.einheit", "Einheit (nur rollierend)", "wahl", { optionen: ["tage", "wochen", "monate"], optional: true }),
    T("richtung", "Richtung", "wahl", { optionen: ["hoechstens", "mindestens"] }), T("grenze", "Grenze", "zahl")],
  grenzregel: [T("groesse", "Größe"), T("hoechstens", "Höchstens", "zahl", { optional: true }), T("mindestens", "Mindestens", "zahl", { optional: true })],
  besetzungsregel: [T("anforderungen.0.art", "Art", "wahl", { optionen: ["anzahl", "anzahlMit", "quoteMit"] }),
    T("anforderungen.0.merkmal", "Merkmal (Qualifikation)", "text", { optional: true }), T("anforderungen.0.min", "Mindestens", "zahl")],
  paarregel: [T("wenn", "Wenn vorhanden"), T("dann", "dann auch"), T("min", "Mindestens", "zahl", { optional: true })],
  musterregel: [T("art", "Muster", "wahl", { optionen: ["verbotenFolge", "hoechstensFolge"] }),
    T("von", "Nach Dienstart(en)", "liste", { optional: true }), T("dann", "kein(e) Dienstart(en)", "liste", { optional: true }),
    T("klassen", "Dienstart(en) im Block", "liste", { optional: true }), T("max", "Höchstens in Folge", "zahl", { optional: true }),
    T("danachFrei", "Danach frei (Tage)", "zahl", { optional: true })],
  blockregel: [T("wochentage", "Wochentage (0 = Montag … 6 = Sonntag)", "zahlenliste")],
  verteilungsregel: [T("groesse", "Größe"), T("maxAbweichung", "Höchste Abweichung", "zahl")],
  wunschregel: [T("wunsch", "Wunsch", "wahl", { optionen: ["frei", "dienstart", "keineDienstart"] }), T("wochentage", "Wochentage (0 = Montag … 6 = Sonntag)", "zahlenliste"),
    T("klassen", "Dienstart(en)", "liste", { optional: true }), T("prioritaet", "Wichtigkeit (1 bis 5)", "zahl", { optional: true })],
});

const lies = (o, pfad) => pfad.split(".").reduce((x, k) => (x === undefined || x === null ? undefined : x[k]), o);
function setze(o, pfad, wert) {
  const teile = pfad.split(".");
  let x = o;
  teile.forEach((k, i) => {
    if (i === teile.length - 1) { x[k] = wert; return; }
    if (x[k] === undefined) x[k] = /^\d+$/.test(teile[i + 1]) ? [] : {};
    x = x[k];
  });
}

/** Parameter → Formularwerte (alles als Text). */
export function felderAusParametern(regelart, parameter) {
  const aus = {};
  for (const f of PARAMETER_FELDER[regelart] || []) {
    const w = lies(parameter, f.pfad);
    aus[f.pfad] = w === undefined || w === null ? "" : Array.isArray(w) ? w.join(", ") : String(w);
  }
  return aus;
}

/** Formularwerte (Text) → Parameter; leere optionale Felder entfallen. */
export function parameterAusFeldern(regelart, werte) {
  const p = {};
  for (const f of PARAMETER_FELDER[regelart] || []) {
    const roh = String((werte && werte[f.pfad]) ?? "").trim();
    if (roh === "") continue;
    /** @type {any} */
    let w = roh;
    if (f.typ === "zahl") { w = Number(roh.replace(",", ".")); if (!Number.isFinite(w)) continue; }
    else if (f.typ === "liste") w = roh.split(",").map((x) => x.trim()).filter(Boolean);
    else if (f.typ === "zahlenliste") w = roh.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x));
    setze(p, f.pfad, w);
  }
  if (regelart === "blockregel" && p.wochentage === undefined) p.wochentage = [];
  return p;
}

/* --------------------------------------------------------------------------
   TESTLAUF mit Beispielfällen

   Erzeugt aus den Parametern je einen Fall, der die Vorgabe erfüllen, und einen,
   der sie verletzen muss, und lässt den Baukasten rechnen. Das zeigt, dass die
   Vorgabe so rechnet, wie sie gemeint ist — es ist keine Prüfung des echten Plans
   (das ist die Anbindung in WP-I5). Synthetische Daten, keine Personen.
   -------------------------------------------------------------------------- */
const TAG0 = "2026-03-02"; // ein Montag
const addT = (tag, n) => { const d = new Date(`${tag}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Beispielfälle für eine Vorgabe: [{ id, erwartet: "erfuellt" | "verletzt", kontext }] oder null,
 * wenn für diese Regelart oder diese Parameter kein Beispiel erzeugt werden kann.
 * @param {any} v
 */
export function beispielFaelle(v) {
  const p = (v && v.parameter) || {};
  const tage = (start, klassen) => Object.fromEntries(klassen.map((k, i) => [addT(start, i), k]));
  switch (v && v.regelart) {
    case "zaehlregel": {
      const g = Number(p.grenze);
      if (!Number.isInteger(g) || g < 0 || !p.fenster) return null;
      const stich = "2026-03-31";
      const ereig = (n) => Array.from({ length: n }, (_, i) => addT("2026-03-01", i));
      const bis = p.richtung === "hoechstens";
      return [{ id: "1-genau-an-der-grenze", erwartet: "erfuellt", kontext: { ereignisse: ereig(g), stichtag: stich } },
        { id: "2-eins-daneben", erwartet: "verletzt", kontext: { ereignisse: ereig(bis ? g + 1 : Math.max(0, g - 1)), stichtag: stich } }].filter((f) => !(g === 0 && !bis));
    }
    case "grenzregel": {
      const h = p.hoechstens, m = p.mindestens;
      const hat = (x) => typeof x === "number" && Number.isFinite(x);
      if (!hat(h) && !hat(m)) return null;
      const ok = hat(h) ? h : m;
      return [{ id: "1-an-der-grenze", erwartet: "erfuellt", kontext: { wert: ok } },
        { id: "2-ueber-der-grenze", erwartet: "verletzt", kontext: { wert: hat(h) ? h + 1 : m - 1 } }];
    }
    case "verteilungsregel": {
      const a = Number(p.maxAbweichung);
      if (!Number.isFinite(a) || a < 0) return null;
      return [{ id: "1-gleichmaessig", erwartet: "erfuellt", kontext: { werte: { p1: 2, p2: 2 + a } } },
        { id: "2-ungleich", erwartet: "verletzt", kontext: { werte: { p1: 2, p2: 3 + a } } }];
    }
    case "paarregel": {
      if (!p.wenn || !p.dann) return null;
      const min = p.min === undefined ? 1 : Number(p.min);
      const dann = Array.from({ length: min }, (_, i) => ({ id: `d${i}`, merkmale: [p.dann] }));
      return [{ id: "1-mit-partner", erwartet: "erfuellt", kontext: { personen: [{ id: "w", merkmale: [p.wenn] }, ...dann] } },
        { id: "2-allein", erwartet: "verletzt", kontext: { personen: [{ id: "w", merkmale: [p.wenn] }] } }];
    }
    case "besetzungsregel": {
      const a = p.anforderungen && p.anforderungen[0];
      if (!a) return null;
      const mit = (m, n) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, merkmale: [m] }));
      const ohne = (n) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, merkmale: [] }));
      if (a.art === "anzahl" && Number.isInteger(a.min) && a.min >= 1) return [{ id: "1-genug", erwartet: "erfuellt", kontext: { personen: ohne(a.min) } },
        { id: "2-zu-wenige", erwartet: "verletzt", kontext: { personen: ohne(a.min - 1) } }];
      if (a.art === "anzahlMit" && a.merkmal && Number.isInteger(a.min) && a.min >= 1) return [{ id: "1-genug", erwartet: "erfuellt", kontext: { personen: mit(a.merkmal, a.min) } },
        { id: "2-zu-wenige", erwartet: "verletzt", kontext: { personen: [...mit(a.merkmal, a.min - 1), ...ohne(1)] } }];
      return null;
    }
    case "musterregel": {
      if (p.art === "verbotenFolge" && Array.isArray(p.von) && Array.isArray(p.dann) && p.von.length && p.dann.length) {
        const frei = "frei";
        return [{ id: "1-ohne-folge", erwartet: "erfuellt", kontext: { tage: tage(TAG0, [p.von[0], frei]), von: TAG0, bis: addT(TAG0, 1) } },
          { id: "2-mit-folge", erwartet: "verletzt", kontext: { tage: tage(TAG0, [p.von[0], p.dann[0]]), von: TAG0, bis: addT(TAG0, 1) } }];
      }
      if (p.art === "hoechstensFolge" && Array.isArray(p.klassen) && p.klassen.length && Number.isInteger(p.max) && p.max >= 1) {
        const danach = Number.isInteger(p.danachFrei) ? p.danachFrei : 0;
        const k = (n) => Array(n).fill(p.klassen[0]);
        const frei = Array(danach).fill("frei");
        const ok = [...k(p.max), ...frei, "frei"], zuLang = [...k(p.max + 1), ...frei, "frei"];
        return [{ id: "1-im-Rahmen", erwartet: "erfuellt", kontext: { tage: tage(TAG0, ok), von: TAG0, bis: addT(TAG0, ok.length - 1) } },
          { id: "2-zu-lang", erwartet: "verletzt", kontext: { tage: tage(TAG0, zuLang), von: TAG0, bis: addT(TAG0, zuLang.length - 1) } }];
      }
      return null;
    }
    case "blockregel": {
      if (!Array.isArray(p.wochentage) || p.wochentage.length < 2) return null;
      const bis = addT(TAG0, 6);
      const alle = (a, b) => Object.fromEntries(Array.from({ length: 7 }, (_, i) => [addT(TAG0, i), p.wochentage.includes(i) ? (i === p.wochentage[0] ? a : b) : "frei"]));
      return [{ id: "1-gleich", erwartet: "erfuellt", kontext: { tage: alle("F", "F"), von: TAG0, bis } },
        { id: "2-verschieden", erwartet: "verletzt", kontext: { tage: alle("F", "N"), von: TAG0, bis } }];
    }
    case "wunschregel": {
      if (!Array.isArray(p.wochentage) || !p.wochentage.length) return null;
      const bis = addT(TAG0, 6);
      const klassen = Array.isArray(p.klassen) ? p.klassen : [];
      let gut, schlecht;
      if (p.wunsch === "frei") { gut = "frei"; schlecht = "F"; }
      else if (p.wunsch === "dienstart" && klassen.length) { gut = klassen[0]; schlecht = "frei"; }
      else if (p.wunsch === "keineDienstart" && klassen.length) { gut = "frei"; schlecht = klassen[0]; }
      else return null;
      const wochen = (k) => Object.fromEntries(Array.from({ length: 7 }, (_, i) => [addT(TAG0, i), p.wochentage.includes(i) ? k : (k === gut ? schlecht : gut)]));
      return [{ id: "1-erfuellt", erwartet: "erfuellt", kontext: { tage: wochen(gut), von: TAG0, bis } },
        { id: "2-nicht-erfuellt", erwartet: "verletzt", kontext: { tage: wochen(schlecht), von: TAG0, bis } }];
    }
    default: return null;
  }
}

/**
 * Testlauf einer Vorgabe (auch eines Entwurfs) gegen Fälle; ohne Fälle gegen die Beispielfälle.
 * Ein Fehler der Parameter wird zum Ergebnis `fehler`, nie zur Ausnahme.
 * @param {any} v
 * @param {Array<{ id: string, kontext: any, erwartet?: string }>} [faelle]
 */
export function vorgabeTestlauf(v, faelle) {
  const f = pruefeVorgabe(v);
  if (f) return { ok: false, fehler: f, ergebnisse: [] };
  const fall = faelle || beispielFaelle(v);
  if (!fall || !fall.length) return { ok: false, fehler: "Für diese Vorgabe gibt es noch keine Beispielfälle.", ergebnisse: [] };
  const lauf = testlauf(vorgabeAlsRegel({ ...v, gueltigAb: null, gueltigBis: null }, { wirkend: true }), fall);
  const erwartet = new Map(fall.map((x) => [x.id, x.erwartet]));
  const ergebnisse = lauf.ergebnisse.map((e) => ({ ...e, erwartet: erwartet.get(e.id) || null, stimmt: erwartet.get(e.id) ? erwartet.get(e.id) === e.status : null }));
  return { ok: ergebnisse.every((e) => e.stimmt !== false), fehler: null, anzahl: lauf.anzahl, ergebnisse };
}
