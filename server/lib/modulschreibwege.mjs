/* ==========================================================================
   MODULSCHREIBWEGE — Einhängepunkt der Branchenmodule im Schreibweg (WP-19.0)

   Der Schreibweg des Servers (zusammenfuehren, server/lib/rechte.mjs) ruft
   diese Datei an genau einer Stelle — für Planung/Leitung (voll) und
   Schichtverantwortung (einheit), nachdem deren eigene Prüfungen gelaufen
   sind. Neue Module hängen ihren Schreibweg hier ein (MODUL_SCHREIBWEGE)
   statt einer weiteren Zeile in rechte.mjs.

   Zwei Dinge geschehen hier:

     1. Nur-Lesen nach dem Abschalten (Entscheidung G3): Ist ein Modul
        ausgeschaltet oder sein Paket abbestellt (modulNurLesen), sind seine
        Datenfelder (Registry, `datenfelder`) nur lesbar. Ändern oder Löschen
        über den Schreibweg wird abgewiesen; fehlt ein Feld in der
        Übermittlung, füllt der Server es aus dem gespeicherten Stand auf.
        Gelöscht wird über den Löschlauf (aufbewahrung.mjs, WP-26: Zuordnungen
        anonymisierter Personen und Einträge hinter der Plandatenfrist) und
        über den Ausnahmeweg unten — nie durch gewöhnliches Speichern.

        Ausnahmeweg Art. 16/17 DSGVO (Berichtigung, Löschung): Die Leitung
        (org.edit) schickt mit der Änderung `moduldatenAusnahme: { modul, art:
        "berichtigung" | "loeschung", grund, eintraege: { feld: [Schlüssel
        oder Kennung, …] } }`. Durch geht genau das Benannte: bei „loeschung"
        fehlen genau diese Einträge, bei „berichtigung" ändern sich genau diese
        (nichts kommt dazu); jede weitere Abweichung → 403. Protokolliert wird
        im Modulprotokoll (Art, Modul, Feld, Anzahl, Grund, Wann/Wer — keine
        Schlüssel, kein Person|Tag) und im Betriebsprotokoll ohne Personenbezug
        (modulProtokollZeilen). Die Angabe selbst wird nie gespeichert.
     2. Die Schreibwege der Module (Form, Wann/Wer) — in der Reihenfolge der
        Liste. Jeder Eintrag: { modul, felder, zusammen(altM, neuM, ktx) →
        { mandant } | { grund } }. Ein Modul prüft nur seine `felder`; ein
        Grund wird zur Abweisung (403).

   Die fünf Module, die vor WP-19.0 eine eigene Zeile in rechte.mjs bekamen
   (anlagen, maschinenqual, geteilterdienst, posten, bereichsplan), bleiben
   dort; nichts wird umgehängt.

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { BRANCHENMODULE, modulVon, modulNurLesen } from "./branchenmodule.mjs";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => istObjekt(o) && Object.prototype.hasOwnProperty.call(o, k);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @typedef {{ sitzung?: any, rolle?: string, umfang?: string, darfOrgEdit?: boolean, ausnahme?: any }} SchreibKontext
 * @typedef {{ modul: string, felder: string[],
 *   zusammen: (altM: any, neuM: any, ktx: SchreibKontext) => ({ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }) }} ModulSchreibweg
 */

/**
 * Die Schreibwege der Module, die nach WP-19.0 dazukommen. Eintragen in
 * WP-19.1 ff. — mit eigener Prüfung in pruefungen/modul-<id>.test.js.
 * @type {readonly ModulSchreibweg[]}
 */
export const MODUL_SCHREIBWEGE = Object.freeze([]);

/**
 * Vertrag der Liste: bekanntes Modul, nur dessen Datenfelder, eine Funktion.
 * @param {readonly any[]} [wege]
 * @param {readonly any[]} [liste]
 * @returns {string[]}
 */
export function pruefeModulSchreibwege(wege = MODUL_SCHREIBWEGE, liste = BRANCHENMODULE) {
  const m = [];
  for (const w of wege) {
    const mod = w && modulVon(w.modul, liste);
    if (!mod) { m.push(`Schreibweg: Modul „${w && w.modul}" unbekannt`); continue; }
    if (typeof w.zusammen !== "function") m.push(`${mod.id}: zusammen fehlt`);
    if (!Array.isArray(w.felder) || !w.felder.length) m.push(`${mod.id}: felder fehlt`);
    for (const f of w.felder || []) if (!mod.datenfelder.includes(f)) m.push(`${mod.id}: Feld „${f}" steht nicht in den Datenfeldern des Moduls`);
  }
  return m;
}

export const AUSNAHME_ARTEN = Object.freeze(["berichtigung", "loeschung"]);
export const AUSNAHME_GRUND_MAX = 300;

/** Die Einträge eines Datenfelds als Map Schlüssel → Wert: Objekt nach Schlüssel, Liste nach `id`. */
function eintraegeVon(w) {
  if (Array.isArray(w)) return new Map(w.filter(istObjekt).map((x) => [String(x.id), x]));
  if (istObjekt(w)) return new Map(Object.entries(w));
  return new Map();
}

/** Prüft die Form der Ausnahmeangabe; Grund oder null. */
function ausnahmeFormFehler(a, liste) {
  const form = "Ausnahmeweg Art. 16/17 DSGVO: erwartet wird { modul, art: \"berichtigung\" oder \"loeschung\", grund, eintraege: { feld: [ … ] } }.";
  if (!istObjekt(a) || Object.keys(a).some((k) => !["modul", "art", "grund", "eintraege"].includes(k))) return form;
  const mod = modulVon(a.modul, liste);
  if (!mod) return form;
  if (!AUSNAHME_ARTEN.includes(a.art)) return form;
  if (typeof a.grund !== "string" || !a.grund.trim()) return "Ausnahmeweg Art. 16/17 DSGVO: Der Grund (Antrag, Anlass) ist Pflicht.";
  if (a.grund.length > AUSNAHME_GRUND_MAX) return `Ausnahmeweg Art. 16/17 DSGVO: Grund höchstens ${AUSNAHME_GRUND_MAX} Zeichen.`;
  if (!istObjekt(a.eintraege) || !Object.keys(a.eintraege).length) return form;
  for (const [feld, schl] of Object.entries(a.eintraege)) {
    if (!mod.datenfelder.includes(feld)) return `Ausnahmeweg Art. 16/17 DSGVO: „${String(feld).slice(0, 40)}" ist kein Datenfeld von ${mod.name}.`;
    if (!Array.isArray(schl) || !schl.length || schl.some((k) => typeof k !== "string" || !k || k.length > 200) || new Set(schl).size !== schl.length) return form;
  }
  return null;
}

/**
 * Nur-Lesen nach dem Abschalten (G3). Der Schalterstand kommt aus der
 * Übermittlung (nach dem Schreibweg der Moduleinstellungen, also vom Server
 * geprüft), die Pakete aus dem gespeicherten Betrieb (Vertragsfeld). Dazu der
 * Ausnahmeweg nach Art. 16/17 DSGVO (Kopf dieser Datei).
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter Betrieb
 * @param {readonly any[]} [liste]
 * @param {{ darfOrgEdit?: boolean, sitzung?: any, jetzt?: string, ausnahme?: any }} [ktx]
 *   ausnahme: die Angabe, wenn der Schreibweg sie vor der Rückfüllung gemerkt hat (rechte.mjs);
 *   sonst gilt `neuM.moduldatenAusnahme`.
 * @returns {{ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }}
 */
export function moduldatenZusammen(altM, neuM, liste = BRANCHENMODULE, { darfOrgEdit = false, sitzung = null, jetzt, ...ktx } = {}) {
  if (!istObjekt(altM) || !istObjekt(neuM)) return { mandant: neuM };
  /* Die Ausnahmeangabe ist nie Teil des gespeicherten Betriebs. */
  const ausnahme = hat(ktx, "ausnahme") ? ktx.ausnahme : hat(neuM, "moduldatenAusnahme") ? neuM.moduldatenAusnahme : undefined;
  let aus = neuM;
  if (hat(neuM, "moduldatenAusnahme")) { aus = { ...neuM }; delete aus.moduldatenAusnahme; }
  const stand = { ...altM, einstellungen: istObjekt(neuM.einstellungen) ? neuM.einstellungen : altM.einstellungen };
  let benutzt = false;
  /** @type {any[]} */
  const ereignisse = [];
  for (const mod of liste) {
    if (!mod || !Array.isArray(mod.datenfelder) || !mod.datenfelder.length) continue;
    if (!modulNurLesen(stand, mod.id, liste)) continue;
    for (const feld of mod.datenfelder) {
      if (!hat(aus, feld)) {
        if (hat(altM, feld)) aus = { ...aus, [feld]: altM[feld] };
        continue;
      }
      if (gleich(altM[feld], aus[feld])) continue;
      const nurLesen = `Branchenmodul ${mod.name} ist ausgeschaltet; seine Daten (${feld}) sind nur lesbar. `
        + "Berichtigung oder Löschung nach Art. 16/17 DSGVO nur über den Ausnahmeweg der Leitung.";
      if (ausnahme === undefined) return { grund: nurLesen };
      if (!darfOrgEdit) return { grund: "Ausnahmeweg Art. 16/17 DSGVO: nur die Organisationsleitung (org.edit)." };
      const formFehler = ausnahmeFormFehler(ausnahme, liste);
      if (formFehler) return { grund: formFehler };
      if (ausnahme.modul !== mod.id || !hat(ausnahme.eintraege, feld)) return { grund: nurLesen };
      /* Genau das Benannte — nicht mehr, nicht weniger, nichts Neues. */
      const vorher = eintraegeVon(altM[feld]), nachher = eintraegeVon(aus[feld]);
      const benannt = new Set(ausnahme.eintraege[feld]);
      const geaendert = new Set();
      for (const [k, v] of vorher) if (!nachher.has(k) || !gleich(v, nachher.get(k))) geaendert.add(k);
      for (const k of nachher.keys()) if (!vorher.has(k)) return { grund: `${nurLesen} (Ausnahmeweg: nichts Neues)` };
      if (Array.isArray(altM[feld]) !== Array.isArray(aus[feld])) return { grund: nurLesen };
      for (const k of benannt) {
        if (!vorher.has(k) || !geaendert.has(k)) return { grund: `Ausnahmeweg Art. 16/17 DSGVO: Ein benannter Eintrag in ${feld} ist unverändert oder unbekannt.` };
        if (ausnahme.art === "loeschung" ? nachher.has(k) : !nachher.has(k))
          return { grund: `Ausnahmeweg Art. 16/17 DSGVO: ${ausnahme.art === "loeschung" ? "Löschung entfernt" : "Berichtigung ändert"} genau die benannten Einträge in ${feld}.` };
      }
      for (const k of geaendert) if (!benannt.has(k)) return { grund: `${nurLesen} (Ausnahmeweg: nur die benannten Einträge)` };
      benutzt = true;
      ereignisse.push({ art: `moduldaten-${ausnahme.art}`, modul: mod.id, feld, anzahl: benannt.size });
    }
  }
  /* Benannt, aber keine passende Änderung: abgewiesen (die Angabe muss genau das Geänderte beschreiben). */
  if (ausnahme !== undefined && !benutzt) {
    const formFehler = ausnahmeFormFehler(ausnahme, liste);
    return { grund: formFehler || "Ausnahmeweg Art. 16/17 DSGVO: Nur für Daten eines ausgeschalteten Moduls und nur mit der benannten Änderung." };
  }
  if (ereignisse.length) {
    /* Teil eines Antrags müssen alle benannten Felder sein. */
    const felder = new Set(ereignisse.map((x) => x.feld));
    if (Object.keys(ausnahme.eintraege).some((f) => !felder.has(f)))
      return { grund: "Ausnahmeweg Art. 16/17 DSGVO: Ein benanntes Feld ist unverändert." };
    const am = jetzt || new Date().toISOString();
    const von = sitzung && sitzung.person !== undefined ? sitzung.person : null;
    const e = istObjekt(aus.einstellungen) ? aus.einstellungen : {};
    const bisher = Array.isArray(e.modulprotokoll) ? e.modulprotokoll : [];
    aus = { ...aus, einstellungen: { ...e, modulprotokoll: [...bisher,
      ...ereignisse.map((x) => ({ ...x, grund: ausnahme.grund.trim(), am, von }))] } };
  }
  return { mandant: aus };
}

/**
 * Der eine Aufruf aus dem Schreibweg (rechte.mjs): erst Nur-Lesen, dann die
 * Schreibwege der Module.
 * @param {any} altM
 * @param {any} neuM
 * @param {SchreibKontext & { wege?: readonly ModulSchreibweg[], liste?: readonly any[] }} [o]
 * @returns {{ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }}
 */
export function modulSchreibwegeAnwenden(altM, neuM, { wege = MODUL_SCHREIBWEGE, liste = BRANCHENMODULE, ...ktx } = {}) {
  const lesen = moduldatenZusammen(altM, neuM, liste, { darfOrgEdit: ktx.darfOrgEdit === true, sitzung: ktx.sitzung,
    ...(hat(ktx, "ausnahme") ? { ausnahme: ktx.ausnahme } : {}) });
  if (lesen.grund) return lesen;
  let aus = lesen.mandant;
  for (const w of wege) {
    const r = w.zusammen(altM, aus, ktx);
    if (!r || r.grund) return { grund: (r && r.grund) || `Branchenmodul ${w.modul}: Schreibweg ohne Ergebnis.` };
    aus = r.mandant;
  }
  return { mandant: aus };
}
