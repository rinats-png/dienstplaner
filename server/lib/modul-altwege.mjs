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
   genau dieses Modul und nur für dessen Datenfelder (bereichsPlan, objekte,
   postenPlan; Bereiche an Einheiten und alles Übrige bleiben geschlossen,
   ein gemischter Antrag wird ganz abgewiesen) — Löschung wie bei den neueren Modulen, dazu die
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

/** Zwei Listen enthalten dieselben Einträge (als Multimenge, Reihenfolge egal) — jeder Eintrag zählt, auch bei doppelter Kennung. */
const mengeGleich = (a, b) => {
  const s = (w) => w.map((x) => JSON.stringify(x)).sort();
  const x = s(a), y = s(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
/** Kennungen, die in der Liste mehrfach vorkommen. */
const doppelte = (w) => {
  const n = new Map();
  for (const x of liste(w)) n.set(String(x.id), (n.get(String(x.id)) || 0) + 1);
  return new Set([...n].filter(([, z]) => z > 1).map(([id]) => id));
};
/** Neu doppelte Kennungen in der Übermittlung (gespeichert nicht schon so): nie eine zulässige Änderung eines geschlossenen Moduls. */
const neuDoppelt = (alt, neu) => { const vorher = doppelte(alt); return [...doppelte(neu)].some((id) => !vorher.has(id)); };

/**
 * Je Modul zwei Fragen an die Übermittlung (WP-19 B1, Nachreview F1/F2):
 * `datenteil(altM, neuM)` — ändern sich die Datenfelder des Moduls aus der Registry (`datenfelder`)? Nur diesen Teil deckt
 *   der geprüfte Ausnahmeweg (moduldatenZusammen prüft genau diese Felder);
 * `restteil(altM, neuM)` — ändert sich Modulinhalt außerhalb davon (Bereiche an Einheiten, zweiter Abschnitt, Anlagen,
 *   Maschinenkompetenzen)? Das deckt keine Ausnahme. Jeder übermittelte Eintrag zählt, neu doppelte Kennungen sind eine Änderung.
 * `verwerfen(m)` — ein Betrieb ohne Daten des Moduls (neu angelegter Betrieb).
 * @typedef {{ modul: string, datenteil: (altM: any, neuM: any) => boolean, restteil: (altM: any, neuM: any) => boolean, verwerfen: (m: any) => void }} Altmodul
 */

/** Ein Betriebsfeld als Ganzes (posten, bereichsplan). */
const feldweise = (felder) => ({
  geaendert: (altM, neuM) => felder.some((f) => !gleich(altM && altM[f], neuM && neuM[f])),
  verwerfen: (m) => { for (const f of felder) delete m[f]; },
});
const nie = () => false;
/** Ersetzt die Liste `feld` nur, wenn sich etwas ändert (sonst bleibt dieselbe Liste). */
const ersetzen = (m, feld, neu) => { if (Array.isArray(m[feld]) && (neu.length !== m[feld].length || neu.some((x, i) => x !== m[feld][i]))) m[feld] = neu; };

/** @type {readonly Altmodul[]} */
export const ALTMODULE = Object.freeze([
  Object.freeze({ modul: "posten", datenteil: feldweise(["objekte", "postenPlan"]).geaendert, restteil: nie,
    verwerfen: feldweise(["objekte", "postenPlan"]).verwerfen }),
  Object.freeze({ modul: "bereichsplan",
    datenteil: feldweise(["bereichsPlan"]).geaendert,
    /* Bereiche an den Einheiten: jede übermittelte Einheit gegen die gespeicherte gleicher Kennung. */
    restteil: (altM, neuM) => {
      const vorher = nachId(altM && altM.einheiten);
      return neuDoppelt(altM && altM.einheiten, neuM && neuM.einheiten)
        || liste(neuM && neuM.einheiten).some((e) => !gleich((vorher.get(String(e.id)) || {}).bereiche, e.bereiche));
    },
    verwerfen: (m) => {
      feldweise(["bereichsPlan"]).verwerfen(m);
      if (Array.isArray(m.einheiten))
        ersetzen(m, "einheiten", m.einheiten.map((e) => { if (!hat(e, "bereiche")) return e; const { bereiche: _weg, ...ohne } = e; void _weg; return ohne; }));
    } }),
  Object.freeze({ modul: "geteilterdienst", datenteil: nie,
    restteil: (altM, neuM) => {
      const vorher = nachId(altM && altM.dienstarten);
      return neuDoppelt(altM && altM.dienstarten, neuM && neuM.dienstarten)
        || liste(neuM && neuM.dienstarten).some((da) => !gleich(zweiter(vorher.get(String(da.id))), zweiter(da)));
    },
    verwerfen: (m) => {
      if (Array.isArray(m.dienstarten)) ersetzen(m, "dienstarten", m.dienstarten.map((da) => (zweiter(da) ? { ...da, zweiterAbschnitt: null } : da)));
    } }),
  Object.freeze({ modul: "anlagen", datenteil: nie,
    /* Anlegen, Ändern, Löschen einer Anlage, ein Wechsel der Art (zur Anlage hin oder von ihr weg) und neu doppelte Kennungen. */
    restteil: (altM, neuM) => neuDoppelt(altM && altM.betriebsmittel, neuM && neuM.betriebsmittel)
      || !mengeGleich(liste(altM && altM.betriebsmittel).filter(istAnlage), liste(neuM && neuM.betriebsmittel).filter(istAnlage)),
    verwerfen: (m) => { if (Array.isArray(m.betriebsmittel)) ersetzen(m, "betriebsmittel", m.betriebsmittel.filter((x) => !istAnlage(x))); } }),
  Object.freeze({ modul: "maschinenqual", datenteil: nie,
    restteil: (altM, neuM) => {
      const anlagen = anlagenIds(altM, neuM);
      const a = liste(altM && altM.kompetenzen), n = liste(neuM && neuM.kompetenzen);
      /* Kennungen, unter denen gespeichert oder übermittelt eine Maschinenkompetenz steht: alle Einträge dieser Kennungen vergleichen. */
      const ids = new Set([...a, ...n].filter((k) => maschinenKompetenz(k, anlagen)).map((k) => String(k.id)));
      const nur = (w) => w.filter((k) => ids.has(String(k.id)));
      return neuDoppelt(a, n) || !mengeGleich(nur(a), nur(n));
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
 * gespeicherten Betrieb. Ausnahme nur der geprüfte Ausnahmeweg (Art. 16/17) für genau dieses Modul und nur für dessen Datenfelder.
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter Betrieb (nach den Prüfungen der Rolle)
 * @param {{ liste?: readonly any[], ausnahme?: any }} [ktx]
 * @returns {{ grund: string } | null}
 */
export function altmodulWache(altM, neuM, { liste: register = BRANCHENMODULE, ausnahme } = {}) {
  if (!istObjekt(neuM)) return null;
  const stand = { ...neuM, pakete: istObjekt(altM) ? altM.pakete : undefined };
  for (const a of ALTMODULE) {
    const alt = istObjekt(altM) ? altM : {};
    /* Der geprüfte Ausnahmeweg (Art. 16/17) deckt nur die Datenfelder des Moduls; alles übrige Modulinhalt bleibt geschlossen —
       ein gemischter Antrag (Ausnahme plus neuer Inhalt) wird als Ganzes abgewiesen. */
    const ausnahmeweg = istObjekt(ausnahme) && ausnahme.modul === a.modul && (ausnahme.art === "loeschung" || ausnahme.art === "berichtigung");
    const geaendert = a.restteil(alt, neuM) || (!ausnahmeweg && a.datenteil(alt, neuM));
    if (!geaendert) continue;
    if (!(statusWirksam(a.modul, register) && modulAktiv(stand, a.modul, register))) return { grund: nichtWirkend(a.modul) };
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
