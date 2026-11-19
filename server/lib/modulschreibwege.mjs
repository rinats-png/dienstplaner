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
        "berichtigung" | "loeschung", grund: "art16" | "art17" | "art18",
        aktenzeichen?, eintraege: { feld: [Schlüssel oder Kennung, …] } }`.
        Der Grund ist eine Kategorie (zweiter Opus-Review M4: kein Freitext,
        der eine Person nennen könnte); das Aktenzeichen ist optional, nur
        Buchstaben, Ziffern und Bindestrich mit mindestens einer Ziffer, höchstens
        20 Zeichen — keine Namen. Durch geht genau das Benannte: bei „loeschung"
        fehlen genau diese Einträge, bei „berichtigung" ändern sich genau diese
        (nichts kommt dazu); jede weitere Abweichung → 403. Listenfelder nur mit
        Objekten mit eindeutiger id (N4). Protokolliert wird im Modulprotokoll
        (Art, Modul, Feld, Anzahl, Grund, Aktenzeichen, Wann/Wer — keine
        Schlüssel, kein Person|Tag) und im Betriebsprotokoll ohne Personenbezug
        (modulProtokollZeilen). Dazu ein Löschvermerk je Datensatz
        (einstellungen.moduldatenLoeschvermerke: gehashte Kennung, kein
        Klartext; mit Serverschlüssel aus CENTRIC_PFEFFER geschlüsselt, sonst nur
        pseudonym), den das Wiederherstellen beachtet — nur für Sicherungen, die vor
        dem Vermerk entstanden (sicherungen.mjs, M3; dritter Review F1/F3/F4).
        Berichtigung nur über das Wertschema des Moduls (`berichtigungsWerte`, F6).
        Die Angabe selbst wird nie gespeichert und wirkt NUR aus der
        Übermittlung, die rechte.mjs vor der Rückfüllung merkt — ein
        gespeichertes Feld gleichen Namens wird verworfen, nie geglaubt (H1).
     2. Die Schreibwege der Module (Form, Wann/Wer) — in der Reihenfolge der
        Liste. Jeder Eintrag: { modul, felder, zusammen(altM, neuM, ktx) →
        { mandant } | { grund } }. Ein Modul prüft nur seine `felder`; ein
        Grund wird zur Abweisung (403).

   Die fünf Module, die vor WP-19.0 eine eigene Zeile in rechte.mjs bekamen
   (anlagen, maschinenqual, geteilterdienst, posten, bereichsplan), behalten
   dort ihre Formprüfung. Ob das Modul wirkt, fragt für sie seit WP-19 B1 die
   Registerwache (modul-altwege.mjs) hier, nach dem Nur-Lesen und vor den
   Schreibwegen der neueren Module — dieselbe Regel (modulAktiv, 403).

   Rein: keine Ablage, keine Uhr. Einzige Umgebung: CENTRIC_PFEFFER als Schlüssel der
   Löschvermerke (wie codes.mjs/zweifaktor.mjs; ohne ihn ungeschlüsselt, F4).
   ========================================================================== */
import { createHash, createHmac, hkdfSync } from "node:crypto";
import { MODULWEGE_WP19 } from "./modul-wege.mjs";
import { altmodulWache } from "./modul-altwege.mjs";
import { BRANCHENMODULE, modulVon, modulNurLesen, AUSNAHME_GRUENDE, AUSNAHME_GRUND_ARTEN, AKTENZEICHEN_MUSTER } from "./branchenmodule.mjs";

export { AUSNAHME_GRUENDE, AUSNAHME_GRUND_ARTEN, AKTENZEICHEN_MUSTER };

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => istObjekt(o) && Object.prototype.hasOwnProperty.call(o, k);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @typedef {{ sitzung?: any, rolle?: string, umfang?: string, darfOrgEdit?: boolean, ausnahme?: any, liste?: readonly any[] }} SchreibKontext
 * @typedef {{ modul: string, felder: readonly string[],
 *   zusammen: (altM: any, neuM: any, ktx: SchreibKontext) => ({ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }) }} ModulSchreibweg
 */

/**
 * Die Schreibwege der Module, die nach WP-19.0 dazukommen. Eintragen in
 * WP-19.1 ff. — mit eigener Prüfung in pruefungen/modul-<id>.test.js.
 * @type {readonly ModulSchreibweg[]}
 */
export const MODUL_SCHREIBWEGE = Object.freeze([...MODULWEGE_WP19]);

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

/** Die Einträge eines Datenfelds als Map Schlüssel → Wert: Objekt nach Schlüssel, Liste nach `id`. */
function eintraegeVon(w) {
  if (Array.isArray(w)) return new Map(w.filter(istObjekt).map((x) => [String(x.id), x]));
  if (istObjekt(w)) return new Map(Object.entries(w));
  return new Map();
}

/** N4: Ein Datenfeld ist für den Ausnahmeweg eindeutig adressierbar — Objekt (Schlüssel) oder Liste von Objekten mit eindeutiger id. */
function eindeutigAdressierbar(w) {
  if (w === undefined || istObjekt(w)) return true;
  if (!Array.isArray(w)) return false;
  const ids = new Set();
  for (const x of w) {
    if (!istObjekt(x)) return false;
    const ok = (typeof x.id === "string" && x.id !== "") || (typeof x.id === "number" && Number.isFinite(x.id));
    if (!ok || ids.has(String(x.id))) return false;
    ids.add(String(x.id));
  }
  return true;
}

/**
 * Der Schlüssel der Löschvermerke (dritter Review F4): aus dem bestehenden Servergeheimnis
 * CENTRIC_PFEFFER abgeleitet (HKDF, eigener Zweck — wie zweifaktor.mjs), nie im Bestand.
 * Ohne Pfeffer null: Der Vermerk ist dann nur pseudonym (Durchprobieren Person × Tag findet
 * den Schlüssel) — dokumentiert; der Pfeffer ist in Produktion Pflicht (BEREITSTELLUNG).
 * @returns {Buffer | null}
 */
export function loeschvermerkSchluessel() {
  const p = process.env.CENTRIC_PFEFFER;
  if (!p) return null;
  return Buffer.from(hkdfSync("sha256", Buffer.from(p), Buffer.from("centric-loeschvermerk"), Buffer.from("loeschvermerk-v1"), 32));
}

/**
 * Löschvermerk eines Datensatzes (M3/A4, dritter Review F3/F4): aus Betrieb, Feld und Schlüssel —
 * für Löschung und Berichtigung gleich (die Art steht im Vermerk), ohne Wert. Mit Serverschlüssel
 * HMAC-SHA256 mit Präfix „k1:", sonst SHA-256 (pseudonym). Kein Klartext.
 * @param {any} mandantId @param {string} feld @param {string} schluessel
 * @param {Buffer | null} [geheim] Schlüssel; Vorgabe aus CENTRIC_PFEFFER, null = ungeschlüsselt
 */
export function loeschvermerkHash(mandantId, feld, schluessel, geheim = loeschvermerkSchluessel()) {
  if (geheim) return `k1:${schluesselKennung(geheim)}:${loeschvermerkHashOhneKennung(mandantId, feld, schluessel, geheim).slice(3)}`;
  return loeschvermerkHashOhneKennung(mandantId, feld, schluessel, null);
}

/**
 * Kennung des Vermerkschlüssels (vierter Review N-3): 8 Hexzeichen eines HMAC über einen festen Text mit dem
 * abgeleiteten Schlüssel — verrät den Schlüssel nicht (nicht umkehrbar), zeigt aber, dass er ein anderer ist.
 * @param {Buffer} geheim
 */
const schluesselKennung = (geheim) => createHmac("sha256", geheim).update("centric-loeschvermerk-kennung").digest("hex").slice(0, 8);

/**
 * Die Form vor der Schlüsselkennung (`k1:<hash>`) — für alte Vermerke lesbar (Rückwärtskompatibilität).
 * @param {any} mandantId @param {string} feld @param {string} schluessel @param {Buffer | null} geheim
 */
export function loeschvermerkHashOhneKennung(mandantId, feld, schluessel, geheim = loeschvermerkSchluessel()) {
  const text = [String(mandantId), String(feld), String(schluessel)].join("\u0000");
  if (geheim) return "k1:" + createHmac("sha256", geheim).update(text).digest("hex").slice(0, 32);
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/** Zeitpunkt in Millisekunden oder null (unbekannt/unlesbar). */
const zeitMs = (w) => { if (typeof w !== "string" || !w) return null; const t = Date.parse(w); return Number.isNaN(t) ? null : t; };

/**
 * Wendet die Löschvermerke auf einen Betrieb an (Wiederherstellen, sicherungen.mjs):
 * gelöschte Datensätze fallen weg, berichtigte werden durch den jetzigen Wert ersetzt
 * (fehlt er jetzt, fällt der Datensatz weg).
 *
 * Dritter Review F1/F3: Ein Vermerk wirkt nur auf eine Sicherung, die vor ihm (oder zugleich)
 * entstand — eine spätere Sicherung enthält unter demselben Schlüssel womöglich eine legitime
 * Neuplanung bei wieder eingeschaltetem Modul. Ist die Sicherungszeit unbekannt oder unlesbar,
 * wirkt jeder Vermerk (Datenschutz vor Verfügbarkeit); ebenso ein Vermerk ohne lesbares `am`.
 * Mehrere Vermerke desselben Schlüssels: Es genügt einer, der wirkt (also der späteste).
 * F4: Ein geschlüsselter Vermerk („k1:") ohne Serverschlüssel ist nicht prüfbar → `unpruefbar`
 * (der Aufrufer weist das Wiederherstellen ab).
 * @param {any} m Betrieb (aus der Sicherung)
 * @param {any} jetzt gespeicherter Betrieb (Vermerke und jetzige Werte)
 * @param {readonly any[]} [liste]
 * @param {{ sicherungsZeit?: (string | null) }} [o]
 * @returns {{ mandant: any, entfernt: number, berichtigt: number, unpruefbar: number }}
 */
export function loeschvermerkeAnwenden(m, jetzt, liste = BRANCHENMODULE, { sicherungsZeit = null } = {}) {
  const e = istObjekt(jetzt) && istObjekt(jetzt.einstellungen) ? jetzt.einstellungen : {};
  const vermerke = Array.isArray(e.moduldatenLoeschvermerke) ? e.moduldatenLoeschvermerke.filter(istObjekt) : [];
  if (!istObjekt(m) || !vermerke.length) return { mandant: m, entfernt: 0, berichtigt: 0, unpruefbar: 0 };
  const geheim = loeschvermerkSchluessel();
  const ab = zeitMs(sicherungsZeit);
  /* Wirkt ein Vermerk auf diese Sicherung? Unbekannte Zeiten: ja. */
  const wirkt = (v) => { const am = zeitMs(v.am); return ab === null || am === null || ab <= am; };
  const geschluesselt = (v) => typeof v.h === "string" && v.h.startsWith("k1:");
  /* Vierter Review N-3: Ein Vermerk mit Schlüsselkennung (`k1:<kennung>:…`) ist nur mit demselben Schlüssel
     prüfbar — ein geänderter Pfeffer wirkt wie ein fehlender (Abweisung), nicht still wirkungslos. Alte
     Vermerke ohne Kennung (`k1:<hash>`) bleiben mit dem Schlüssel lesbar. */
  const kennungVon = (v) => { const t = /^k1:([0-9a-f]{8}):[0-9a-f]{32}$/.exec(String(v.h)); return t ? t[1] : null; };
  const aktuelleKennung = geheim ? schluesselKennung(geheim) : null;
  const unpruefbar = vermerke.filter((v) => geschluesselt(v) && wirkt(v)
    && (!geheim || (kennungVon(v) !== null && kennungVon(v) !== aktuelleKennung))).length;
  const loesch = new Set(vermerke.filter((v) => v.art === "loeschung" && wirkt(v)).map((v) => v.h));
  const bericht = new Set(vermerke.filter((v) => v.art === "berichtigung" && wirkt(v)).map((v) => v.h));
  if (!loesch.size && !bericht.size) return { mandant: m, entfernt: 0, berichtigt: 0, unpruefbar };
  const id = jetzt.id;
  let aus = m, entfernt = 0, berichtigt = 0;
  for (const feld of new Set(liste.flatMap((x) => (x && Array.isArray(x.datenfelder) ? x.datenfelder : [])))) {
    const w = m[feld];
    if (!istObjekt(w) && !Array.isArray(w)) continue;
    const jetzige = eintraegeVon(jetzt[feld]);
    /** @returns {{ weg: boolean, ersatz?: any }} */
    const urteil = (k) => {
      /* Ungeschlüsselte Altvermerke (vor dem Pfeffer) und geschlüsselte gleichermaßen. */
      const hs = [loeschvermerkHash(id, feld, k, null),
        ...(geheim ? [loeschvermerkHash(id, feld, k, geheim), loeschvermerkHashOhneKennung(id, feld, k, geheim)] : [])];
      if (hs.some((h) => loesch.has(h))) return { weg: true };
      if (hs.some((h) => bericht.has(h))) return jetzige.has(k) ? { weg: false, ersatz: jetzige.get(k) } : { weg: true };
      return { weg: false };
    };
    let neu;
    if (Array.isArray(w)) {
      neu = [];
      for (const x of w) {
        if (!istObjekt(x)) { neu.push(x); continue; }
        const u = urteil(String(x.id));
        if (u.weg) { entfernt++; continue; }
        if (hat(u, "ersatz")) { berichtigt++; neu.push(u.ersatz); } else neu.push(x);
      }
    } else {
      neu = {};
      for (const [k, v] of Object.entries(w)) {
        const u = urteil(k);
        if (u.weg) { entfernt++; continue; }
        if (hat(u, "ersatz")) { berichtigt++; neu[k] = u.ersatz; } else neu[k] = v;
      }
    }
    if (!gleich(neu, w)) aus = { ...aus, [feld]: neu };
  }
  return { mandant: aus, entfernt, berichtigt, unpruefbar };
}

/**
 * Wiederherstellen (sicherungen.mjs, zweiter Opus-Review M3 / A4): ändert `zurueck` (den Betrieb aus
 * der Sicherung) an Ort und Stelle —
 *   - Datenfelder eines Moduls, das heute nur lesbar ist, kommen aus dem jetzigen Stand `alt`
 *     (kein Umweg am Nur-Lesen vorbei, ohne Ausnahmeweg und Protokoll);
 *   - Löschvermerke des Ausnahmewegs wirken auf die Sicherung (Gelöschtes kommt nicht zurück,
 *     Berichtigtes nicht in der alten Fassung) — auch wenn das Modul inzwischen wieder an ist,
 *     aber nur, wenn die Sicherung vor dem Vermerk entstand (dritter Review F1);
 *   - eine Ausnahmeangabe ist nie Teil des Betriebs (H1).
 * @param {any} alt gespeicherter Betrieb (heute)
 * @param {any} zurueck Betrieb aus der Sicherung (wird geändert)
 * @param {readonly any[]} [liste]
 * @param {{ sicherungsZeit?: (string | null) }} [o] Erzeugungszeit der Sicherung (ISO); unbekannt: null
 * @returns {{ entfernt: number, berichtigt: number, unpruefbar: number }}
 */
export function moduldatenBeiWiederherstellung(alt, zurueck, liste = BRANCHENMODULE, { sicherungsZeit = null } = {}) {
  if (!istObjekt(alt) || !istObjekt(zurueck)) return { entfernt: 0, berichtigt: 0, unpruefbar: 0 };
  for (const mod of liste) {
    if (!mod || !Array.isArray(mod.datenfelder) || !mod.datenfelder.length || !modulNurLesen(alt, mod.id, liste)) continue;
    for (const feld of mod.datenfelder) {
      if (hat(alt, feld)) zurueck[feld] = alt[feld]; else delete zurueck[feld];
    }
  }
  const lv = loeschvermerkeAnwenden(zurueck, alt, liste, { sicherungsZeit });
  Object.assign(zurueck, lv.mandant);                         // ändert nur Datenfelder
  delete zurueck.moduldatenAusnahme;
  return { entfernt: lv.entfernt, berichtigt: lv.berichtigt, unpruefbar: lv.unpruefbar };
}

/** Prüft die Form der Ausnahmeangabe; Grund oder null. */
function ausnahmeFormFehler(a, liste) {
  const form = "Ausnahmeweg Art. 16/17 DSGVO: erwartet wird { modul, art: \"berichtigung\" oder \"loeschung\", grund: \"art16\" | \"art17\" | \"art18\", "
    + "aktenzeichen (optional), eintraege: { feld: [ … ] } }.";
  if (!istObjekt(a) || Object.keys(a).some((k) => !["modul", "art", "grund", "aktenzeichen", "eintraege"].includes(k))) return form;
  const mod = modulVon(a.modul, liste);
  if (!mod) return form;
  if (!AUSNAHME_ARTEN.includes(a.art)) return form;
  if (typeof a.grund !== "string" || !a.grund.trim()) return "Ausnahmeweg Art. 16/17 DSGVO: Der Grund (Art. 16, 17 oder 18 DSGVO) ist Pflicht.";
  if (!hat(AUSNAHME_GRUND_ARTEN, a.grund))
    return "Ausnahmeweg Art. 16/17 DSGVO: Grund nur als Kategorie „art16\", „art17\" oder „art18\" — kein Freitext (keine Namen).";
  if (!AUSNAHME_GRUND_ARTEN[a.grund].includes(a.art)) return `Ausnahmeweg Art. 16/17 DSGVO: ${AUSNAHME_GRUENDE[a.grund]} passt nicht zur Art „${a.art}".`;
  if (hat(a, "aktenzeichen") && a.aktenzeichen !== null && a.aktenzeichen !== ""
    && (typeof a.aktenzeichen !== "string" || !AKTENZEICHEN_MUSTER.test(a.aktenzeichen)))
    return "Ausnahmeweg Art. 16/17 DSGVO: Aktenzeichen nur als Ziffernfolge, ggf. mit 2 bis 5 Großbuchstaben vorweg (z. B. DS-2026-014), höchstens 20 Zeichen — keine Namen.";
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
 *   ausnahme: die Angabe, die der Schreibweg vor der Rückfüllung aus der Übermittlung gemerkt hat
 *   (rechte.mjs) — die einzige Quelle. `neuM.moduldatenAusnahme` (etwa ein gespeichertes Feld, das die
 *   Rückfüllung wieder eingesetzt hat) zählt nie und wird entfernt (zweiter Opus-Review H1).
 * @returns {{ mandant: any, grund?: undefined } | { grund: string, mandant?: undefined }}
 */
export function moduldatenZusammen(altM, neuM, liste = BRANCHENMODULE, { darfOrgEdit = false, sitzung = null, jetzt, ...ktx } = {}) {
  if (!istObjekt(neuM)) return { mandant: neuM };
  let aus = neuM;
  if (hat(neuM, "moduldatenAusnahme")) { aus = { ...neuM }; delete aus.moduldatenAusnahme; }
  if (!istObjekt(altM)) return { mandant: aus };
  /* Die Ausnahmeangabe ist nie Teil des gespeicherten Betriebs — nur aus dem Kontext. */
  const ausnahme = ktx.ausnahme;
  const stand = { ...altM, einstellungen: istObjekt(neuM.einstellungen) ? neuM.einstellungen : altM.einstellungen };
  let benutzt = false;
  /** @type {any[]} */
  const ereignisse = [];
  /** @type {any[]} */
  const vermerke = [];
  for (const mod of liste) {
    if (!mod || !Array.isArray(mod.datenfelder) || !mod.datenfelder.length) continue;
    /* Auch ein eingeschaltetes Modul mit Ausnahmeweg-Oberfläche lässt sich über denselben geprüften Weg löschen
       (nur Löschung, nie Änderung, nur Leitung mit Grund; Art. 17 DSGVO). */
    const loeschwegAktiv = mod.ausnahmeUi === true && istObjekt(ausnahme) && ausnahme.modul === mod.id && ausnahme.art === "loeschung";
    if (!modulNurLesen(stand, mod.id, liste) && !loeschwegAktiv) continue;
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
      if (!eindeutigAdressierbar(altM[feld]) || !eindeutigAdressierbar(aus[feld]))
        return { grund: `Ausnahmeweg Art. 16/17 DSGVO: ${feld} braucht Datensätze als Objekte mit eindeutiger id.` };
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
      /* Dritter Review F6: berichtigt wird nur auf einen Wert, den das Wertschema des Moduls zulässt
         (geprüft gegen den gespeicherten Betrieb). Ohne Wertschema für das Feld: nur Löschung (fail-closed). */
      if (ausnahme.art === "berichtigung") {
        const pruefer = istObjekt(mod.berichtigungsWerte) ? mod.berichtigungsWerte[feld] : undefined;
        if (typeof pruefer !== "function")
          return { grund: `Ausnahmeweg Art. 16/17 DSGVO: ${feld} hat kein Wertschema für die Berichtigung — nur Löschung möglich.` };
        for (const k of benannt) {
          let ok = false;
          try { ok = pruefer(nachher.get(k), altM) === true; } catch { ok = false; }
          if (!ok) return { grund: `Ausnahmeweg Art. 16/17 DSGVO: Der berichtigte Wert in ${feld} ist für ${mod.name} nicht zulässig.` };
        }
      }
      benutzt = true;
      ereignisse.push({ art: `moduldaten-${ausnahme.art}`, modul: mod.id, feld, anzahl: benannt.size });
      for (const k of benannt) vermerke.push({ modul: mod.id, feld, art: ausnahme.art, h: loeschvermerkHash(altM.id, feld, k) });
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
    const az = typeof ausnahme.aktenzeichen === "string" && ausnahme.aktenzeichen ? { aktenzeichen: ausnahme.aktenzeichen } : {};
    /* Löschvermerke: aus dem gespeicherten Stand (nie vom Client) plus die neuen. */
    const altE = istObjekt(altM.einstellungen) ? altM.einstellungen : {};
    const altV = Array.isArray(altE.moduldatenLoeschvermerke) ? altE.moduldatenLoeschvermerke : [];
    aus = { ...aus, einstellungen: { ...e, modulprotokoll: [...bisher,
      ...ereignisse.map((x) => ({ ...x, grund: ausnahme.grund, ...az, am, von }))],
      moduldatenLoeschvermerke: [...altV, ...vermerke.map((v) => ({ ...v, am }))] } };
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
  const lesen = moduldatenZusammen(altM, neuM, liste, { darfOrgEdit: ktx.darfOrgEdit === true, sitzung: ktx.sitzung, ausnahme: ktx.ausnahme });
  if (lesen.grund) return lesen;
  let aus = lesen.mandant;
  /* WP-19 B1: die fünf älteren Module — Änderung nur bei wirkendem Modul (wie `weg` in modul-wege.mjs). */
  const wache = altmodulWache(altM, aus, { liste, ausnahme: ktx.ausnahme });
  if (wache) return wache;
  for (const w of wege) {
    const r = w.zusammen(altM, aus, { ...ktx, liste });
    if (!r || r.grund) return { grund: (r && r.grund) || `Branchenmodul ${w.modul}: Schreibweg ohne Ergebnis.` };
    aus = r.mandant;
  }
  return { mandant: aus };
}
