/* ==========================================================================
   REGISTERWACHE DER FÜNF ÄLTEREN BRANCHENMODULE (WP-19 B1)

   Posten, Bereichsplan, geteilter Dienst, Anlagen und Maschinenqualifikation
   bekamen vor WP-19.0 ihre Formprüfung direkt in server/lib/rechte.mjs
   (postenZusammen, bereichsplanZusammen, geteilterdienstZusammen,
   anlagenZusammen, maschinenqualZusammen). Diese Prüfungen fragten die
   Registry nicht: Leitung, Planung und Kundenrolle (im Bereichsplan auch die
   Schichtverantwortung) speicherten Moduldaten auch bei Status „geplant“
   (Befund B1, docs/acc45/WP-19-MODULABNAHME.md).

   Jetzt gilt für sie dieselbe Regel wie für die Module aus WP-19.2 ff.
   (modul-wege.mjs, `weg`): Eine Änderung an den Daten eines Moduls braucht ein
   wirkendes Modul (modulAktiv: gebucht, eingeschaltet, nicht „geplant“,
   Abhängigkeiten aktiv). Sonst weist der Schreibweg die ganze Übermittlung ab
   (403, derselbe Text wie bei den neueren Modulen). Einzige Ausnahme: der vom
   Ausnahmeweg (moduldatenZusammen) geprüfte Antrag nach Art. 16/17 DSGVO für
   genau dieses Modul — Löschung wie bei den neueren Modulen, dazu die
   Berichtigung, für die Posten und Bereichsplan ein Wertschema haben
   (berichtigungsWerte; geprüft wird sie dort, nur bei ausgeschaltetem Modul,
   nur die benannten Einträge, nur org.edit). Berichtigung ist ein Recht der
   betroffenen Person, keine neue Moduldatenerfassung.
   Unbekannter, fehlender oder unsinniger Status, fehlendes Modul in der
   Registry: geschlossen (fail-closed). Wirken kann nur „vorlaeufig“ oder
   „freigegeben“ — modulAktiv selbst prüft nur „nicht geplant“; deshalb fragt
   die Wache den Status hier zusätzlich ab (Modul und Abhängigkeiten).

   Aufgerufen wird die Wache an der einen Stelle, an der alle Modulschreibwege
   hängen (modulSchreibwegeAnwenden, modulschreibwege.mjs) — also für Planung,
   Leitung, Kundenrolle und Schichtverantwortung, für den vollen PUT und den
   Teilweg (POST /api/bestand/teile läuft durch denselben zusammenfuehren).
   Die Formprüfungen bleiben in rechte.mjs; hier wird nur gefragt, ob das
   Modul wirkt.

   Was als „Daten des Moduls“ gilt (nur diese Teile; der Kern bleibt frei):
     posten           Betriebsfelder objekte und postenPlan
     bereichsplan     Betriebsfeld bereichsPlan und die Bereiche je Einheit
                      (einheiten[].bereiche) der übermittelten Einheiten
     geteilterdienst  der zweite Abschnitt (zweiterAbschnitt) der übermittelten
                      Dienstarten; `null` ist kein zweiter Abschnitt
     anlagen          Betriebsmittel der Art „anlage“ (anlegen, ändern, löschen,
                      Art wechseln)
     maschinenqual    Kompetenzen mit `befaehigtePerson` oder mit Bezug auf eine
                      Anlage (Betriebsmittel der Art „anlage“)
   Leer (fehlend, null, [] oder {}) gilt als gleich: Eine Oberfläche, die ein
   leeres Feld mitschickt, ändert nichts. Eine gelöschte Dienstart oder Einheit
   ist eine Kernänderung und bleibt erlaubt.

   Bestehende Daten (aus früherer Test- oder Staging-Nutzung) bleiben, wie sie
   sind, und lesbar: keine Löschung, keine Umstellung. Geschlossen ist nur das
   Ändern — auch das Entfernen — über die Schreibwege. Ein neu angelegter
   Betrieb (Betreiber, Erstbefüllung) bringt keine mit (altmoduldatenVerwerfen).
   Wiederherstellen (/api/wiederherstellen) spielt nur Sicherungen zurück, die
   der Server selbst aus dem gespeicherten Stand gemacht hat (Marke, kein
   Hochladen): Es entsteht nichts, was nicht schon gespeichert war. Dafür gilt
   wie bei den neueren Modulen moduldatenBeiWiederherstellung (Nur-Lesen G3,
   Löschvermerke des Ausnahmewegs) — keine Sonderregel für die fünf Module.

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { BRANCHENMODULE, modulAktiv, modulVon } from "./branchenmodule.mjs";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => istObjekt(o) && Object.prototype.hasOwnProperty.call(o, k);
const liste = (w) => (Array.isArray(w) ? w.filter(istObjekt) : []);
const leer = (w) => w === undefined || w === null || (Array.isArray(w) ? !w.length : istObjekt(w) ? !Object.keys(w).length : false);
const norm = (w) => (leer(w) ? null : w);
const gleich = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const ANLAGE = "anlage";
const istAnlage = (bm) => istObjekt(bm) && bm.art === ANLAGE;
const zweiter = (da) => (istObjekt(da) && da.zweiterAbschnitt ? da.zweiterAbschnitt : null);
const nachId = (w) => new Map(liste(w).map((x) => [String(x.id), x]));
const anlagenIds = (...ms) => new Set(ms.flatMap((m) => liste(m && m.betriebsmittel).filter(istAnlage).map((x) => String(x.id))));
/** Gehört die Kompetenz zur Maschinenqualifikation (befähigte Person oder Bezug auf eine Anlage)? */
const maschinenKompetenz = (k, anlagen) => istObjekt(k) && (k.befaehigtePerson !== undefined || anlagen.has(String(k.betriebsmittelId)));

/**
 * Je Modul: `geaendert(altM, neuM)` — berührt die Übermittlung Daten des Moduls?
 * `verwerfen(m)` — ein Betrieb ohne Daten des Moduls (neu angelegter Betrieb).
 * @typedef {{ modul: string, geaendert: (altM: any, neuM: any) => boolean, verwerfen: (m: any) => void }} Altmodul
 */

/** Ein Betriebsfeld als Ganzes (posten, bereichsplan). */
const feldweise = (felder) => ({
  geaendert: (altM, neuM) => felder.some((f) => !gleich(altM && altM[f], neuM && neuM[f])),
  verwerfen: (m) => { for (const f of felder) delete m[f]; },
});
/** Ersetzt die Liste `feld` nur, wenn sich etwas ändert (sonst bleibt dieselbe Liste). */
const ersetzen = (m, feld, neu) => { if (Array.isArray(m[feld]) && (neu.length !== m[feld].length || neu.some((x, i) => x !== m[feld][i]))) m[feld] = neu; };

/** @type {readonly Altmodul[]} */
export const ALTMODULE = Object.freeze([
  Object.freeze({ modul: "posten", ...feldweise(["objekte", "postenPlan"]) }),
  Object.freeze({ modul: "bereichsplan",
    geaendert: (altM, neuM) => {
      if (feldweise(["bereichsPlan"]).geaendert(altM, neuM)) return true;
      const vorher = nachId(altM && altM.einheiten);
      return liste(neuM && neuM.einheiten).some((e) => !gleich((vorher.get(String(e.id)) || {}).bereiche, e.bereiche));
    },
    verwerfen: (m) => {
      feldweise(["bereichsPlan"]).verwerfen(m);
      if (Array.isArray(m.einheiten))
        ersetzen(m, "einheiten", m.einheiten.map((e) => { if (!hat(e, "bereiche")) return e; const { bereiche: _weg, ...ohne } = e; void _weg; return ohne; }));
    } }),
  Object.freeze({ modul: "geteilterdienst",
    geaendert: (altM, neuM) => {
      const vorher = nachId(altM && altM.dienstarten);
      return liste(neuM && neuM.dienstarten).some((da) => !gleich(zweiter(vorher.get(String(da.id))), zweiter(da)));
    },
    verwerfen: (m) => {
      if (Array.isArray(m.dienstarten)) ersetzen(m, "dienstarten", m.dienstarten.map((da) => (zweiter(da) ? { ...da, zweiterAbschnitt: null } : da)));
    } }),
  Object.freeze({ modul: "anlagen",
    geaendert: (altM, neuM) => {
      const a = liste(altM && altM.betriebsmittel).filter(istAnlage), n = liste(neuM && neuM.betriebsmittel).filter(istAnlage);
      const va = nachId(a), vn = nachId(n);
      /* Anlegen, Ändern, Löschen einer Anlage — und ein Wechsel der Art zur Anlage hin oder von ihr weg. */
      return a.length !== n.length || [...new Set([...va.keys(), ...vn.keys()])].some((id) => !gleich(va.get(id), vn.get(id)));
    },
    verwerfen: (m) => { if (Array.isArray(m.betriebsmittel)) ersetzen(m, "betriebsmittel", m.betriebsmittel.filter((x) => !istAnlage(x))); } }),
  Object.freeze({ modul: "maschinenqual",
    geaendert: (altM, neuM) => {
      const anlagen = anlagenIds(altM, neuM);
      const va = nachId(altM && altM.kompetenzen), vn = nachId(neuM && neuM.kompetenzen);
      const ids = new Set([...va, ...vn].filter(([, k]) => maschinenKompetenz(k, anlagen)).map(([id]) => id));
      return [...ids].some((id) => !gleich(va.get(id), vn.get(id)));
    },
    verwerfen: (m) => {
      const anlagen = anlagenIds(m);
      if (Array.isArray(m.kompetenzen)) ersetzen(m, "kompetenzen", m.kompetenzen.filter((k) => !maschinenKompetenz(k, anlagen)));
    } }),
]);

/** Wirken kann ein Modul nur mit bekanntem Status jenseits von „geplant“ — auch jede Abhängigkeit (fail-closed). */
const WIRKSAM = Object.freeze(["vorlaeufig", "freigegeben"]);
function statusWirksam(id, register, besucht = new Set()) {
  if (besucht.has(id)) return true;                      // Ring: modulAktiv entscheidet (falsch)
  const mod = modulVon(id, register);
  if (!mod || !WIRKSAM.includes(mod.status)) return false;
  besucht.add(id);
  return (Array.isArray(mod.abhaengigVon) ? mod.abhaengigVon : []).every((x) => statusWirksam(x, register, besucht));
}

/** Der Text der Abweisung — derselbe wie bei den neueren Modulen (modul-wege.mjs). */
export const nichtWirkend = (modul) => `Branchenmodul ${modul} wirkt in diesem Betrieb nicht (nicht gebucht, aus, in Vorbereitung oder ohne `
  + "Mitbestimmungsbestätigung) — seine Daten sind nicht änderbar.";

/**
 * Die Wache im Schreibweg: Berührt die Übermittlung Daten eines der fünf älteren Module, das nicht wirkt, → Grund.
 * Wie bei den neueren Modulen zählen Schalter aus der (vom Server geprüften) Übermittlung und Pakete aus dem
 * gespeicherten Betrieb. Ausnahme nur der geprüfte Ausnahmeweg (Art. 16/17) für genau dieses Modul.
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter Betrieb (nach den Prüfungen der Rolle)
 * @param {{ liste?: readonly any[], ausnahme?: any }} [ktx]
 * @returns {{ grund: string } | null}
 */
export function altmodulWache(altM, neuM, { liste: register = BRANCHENMODULE, ausnahme } = {}) {
  if (!istObjekt(neuM)) return null;
  const stand = { ...neuM, pakete: istObjekt(altM) ? altM.pakete : undefined };
  for (const a of ALTMODULE) {
    if (!a.geaendert(istObjekt(altM) ? altM : {}, neuM)) continue;
    const ausnahmeweg = istObjekt(ausnahme) && ausnahme.modul === a.modul && (ausnahme.art === "loeschung" || ausnahme.art === "berichtigung");
    if (!ausnahmeweg && !(statusWirksam(a.modul, register) && modulAktiv(stand, a.modul, register))) return { grund: nichtWirkend(a.modul) };
  }
  return null;
}

/**
 * Neu angelegter Betrieb (Betreiber, Erstbefüllung): ohne Daten der fünf Module — sie entstehen nur über den
 * Schreibweg bei wirkendem Modul. Liefert eine Kopie (flach), ohne Bedarf dasselbe Objekt.
 * @param {any} m
 */
export function altmoduldatenVerwerfen(m) {
  if (!istObjekt(m)) return m;
  const aus = { ...m };
  /* Rückwärts: Die Maschinenkompetenzen erkennt man an den Anlagen — die fallen erst danach weg. */
  for (const a of [...ALTMODULE].reverse()) a.verwerfen(aus);
  return Object.keys(aus).every((k) => aus[k] === m[k]) && Object.keys(m).every((k) => hat(aus, k)) ? m : aus;
}
