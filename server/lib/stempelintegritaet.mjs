/* ==========================================================================
   STEMPEL-INTEGRITÄT (WP-06)

   Ein Stempel ist ein Beleg. Er entsteht nur über /api/stempeln, und was
   dort einmal gespeichert ist — Beginn, Ende, Zeitpunkte, Ort, Geo-Urteil —
   ändert danach niemand mehr: keine Rolle, kein Schreibweg. Einzige Ausnahme
   ist die Löschpflicht: Die Standort-Ergebnisse (Ort, Geo-Urteil; STANDORT_FELDER)
   nimmt der Datenschutzlauf nach gruendeMonate heraus (WP-20) — die Zeiten bleiben.
   Eine davor geladene Kopie, die sie noch trägt, wird nicht abgewiesen, und die
   Felder werden nie zurückgeschrieben (A1). Eine Korrektur
   ist ein eigenes Ereignis { vorher, nachher, wer, wann, grund }, das an den
   Stempel angehängt wird (einstempeln[k].korrekturen); das Original bleibt.

   Ablage: einstempeln["personId|JJJJ-MM-TT"] =
     { start, startAm, ortStart, …, ende, endeAm, …,        Original (unveränderlich)
       markierungen, konfliktGrund,                        Kennzeichen des Servers
       korrekturen: [ { id, vorher, nachher, wer, wann, grund } ] }   nur anhängen

   Die Korrekturen liegen im Stempel selbst. Damit gelten für sie dieselben
   Sichtregeln wie für die Stempel (lib/sicht.mjs: einstempeln NUR_EIGENE für
   Beschäftigte, Schichtverantwortung und Betriebsrat — H8+, WP-43): Wer einen
   Stempel nicht sehen darf, sieht auch seine Korrekturen nicht. Dieselbe
   Monatsscherbe, dieselbe Aufbewahrungsfrist.

   Die Ist-Zeit (erfassung[k]) leitet der Server ab: beim Ausstempeln aus dem
   Original, nach einer Korrektur aus deren `nachher`. Konto, Lohn und Export
   rechnen weiter mit erfassung — dadurch sehen alle Rollen, die Ist-Daten
   bekommen, dieselbe Zahl, ohne das Korrekturereignis selbst zu bekommen.

   Prüfung beim allgemeinen Speichern (PUT /api/bestand), für jede Rolle:
   Weil Originale nie wechseln, kann eine ehrliche Kopie nur hinter dem
   gespeicherten Stand zurückliegen (Felder oder Einträge fehlen), ihm aber
   nie widersprechen. Abgewiesen (403) wird deshalb jeder Widerspruch:
     - ein Originalfeld mit anderem Wert, auf null gesetzt oder neu erfunden,
     - ein Stempel, den es gespeichert nicht gibt (nur /api/stempeln legt an),
     - ein Stempel ausdrücklich auf null gesetzt (Löschen),
     - Korrekturen, die nicht genau ein Anfang der gespeicherten sind,
     - Kennzeichen, die der Server nicht gesetzt hat,
     - eine Ist-Zeit eines gestempelten Tages, die keinem Stand entspricht,
       den der Server je hatte (Korrektur am Ereignis vorbei).
     - bei Leitung, Planung und Probierraum (sie sehen alle Stempel): ein
       weggelassener Stempel, ein weggelassenes Feld, weggelassene
       Korrekturen oder Kennzeichen — sofern der Monat seit dem Stand der
       Übermittlung unverändert ist (lib/bestand.mjs, unveraenderteScherben).
   Sonst ist ein fehlender Eintrag kein Widerspruch (veraltete oder nach
   Rolle gefilterte Kopie): Gespeichert bleibt der gespeicherte Stand —
   direkt (unveränderter Monat) oder über den Drei-Wege-Abgleich. Ausnahme: Ein Löschlauf der Leitung entfernt Stempel, deren
   Tag die Aufbewahrungsfrist (mindestens 24 Monate, § 16 Abs. 2 ArbZG)
   überschritten hat — die Löschpflicht geht vor (Art. 5 Abs. 1 lit. e DSGVO).
   ========================================================================== */

/** Kennzeichen, die nur der Server setzt; eine Kopie darf weniger tragen. */
const KENNZEICHEN = new Set(["markierungen", "konfliktGrund"]);
const KORREKTUREN = "korrekturen";
/** Korrekturanträge (WP-14) liegen am Stempel; geschrieben werden sie nur von den Antrags-Wegen des Servers. */
const ANTRAEGE = "antraege";
const antragFest = (x) => (objekt(x) ? { id: x.id, von: x.von, gestellt: x.gestellt, vorschlag: x.vorschlag, grund: x.grund } : x);

import { stichtage, aufbewahrungFehler, STANDORT_FELDER } from "./aufbewahrung.mjs";
import { geplanterDienst } from "./zeiterfassung.mjs";
import { regelHinweise, pauseZuLang } from "./zeitregeln.mjs";

/** Ein Grund sagt, warum — „ok" oder „Test" ist keiner (WP-06, B4). */
export const KORREKTUR_GRUND_MIN = 10;
export const KORREKTUR_GRUND_MAX = 500;
/** Obergrenze je Stempel und für alle Gründe zusammen: Sie schützt den Speicher, sie soll
    die nächste echte Korrektur nicht blockieren — deshalb hoch, und ab KORREKTUR_HINWEIS_AB
    meldet die Antwort der Leitung, dass dieser Stempel auffällig oft korrigiert wurde. */
export const KORREKTUREN_MAX = 200;
export const KORREKTUREN_GRUENDE_MAX = 20000;
export const KORREKTUR_HINWEIS_AB = 20;
/** Text der abgeleiteten Ist-Zeit nach einer Korrektur — ohne Grund, ohne Namen (sichtbar auch für die SV). */
export const KORRIGIERT_TEXT = "Korrektur der Stempelzeit";

const UHR = /^([01]\d|2[0-3]):[0-5]\d$/;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const tagVon = (k) => { const t = String(k).split("|")[1] || ""; return TAG.test(t) ? t : null; };

/** Tage vor diesem Stichtag sind abgelaufen und dürfen der Löschpflicht weichen.
    Dieselbe Rechnung wie der Datenschutzlauf (lib/aufbewahrung.mjs, stichtage):
    Frist des Betriebs, nie kürzer als 24 Monate (§ 16 Abs. 2 ArbZG). Eine
    ungültige Fristangabe löscht nie (fail-closed): dann gibt es keinen Stichtag. */
export function loeschStichtag(m, heute) {
  if (aufbewahrungFehler(m && m.aufbewahrung)) return null;
  return stichtage(m || {}, heute).plan;
}

/** Tage vor diesem Stichtag haben ihre Standort-Ergebnisse an den Datenschutzlauf verloren (WP-20,
    Review A1): gruendeMonate, nicht die Plandatenfrist. Ungültige Fristangabe: keiner (fail-closed). */
export function standortStichtag(m, heute) {
  if (!heute || aufbewahrungFehler(m && m.aufbewahrung)) return null;
  return stichtage(m || {}, heute).standort;
}

/** Ist-Zeit-Stände, die der Server für diesen Tag je hatte (ehrliche Kopien). */
const tupel = (e) => (objekt(e) ? JSON.stringify([e.start || null, e.ende || null, !!e.bestaetigt]) : null);
function bekannteIstStaende(gespeichertE, stempel) {
  const s = new Set();
  if (objekt(gespeichertE)) s.add(tupel(gespeichertE));
  for (const k of (stempel && Array.isArray(stempel[KORREKTUREN]) ? stempel[KORREKTUREN] : [])) {
    if (k && objekt(k.vorher)) s.add(tupel(k.vorher));
    if (k && objekt(k.nachher)) s.add(tupel({ ...k.nachher, bestaetigt: true }));
  }
  return s;
}

/**
 * Widerspricht die Übermittlung eines Betriebs seinen gespeicherten Stempeln?
 * @param {object|null} altM  gespeicherter Betrieb (null: neu angelegt)
 * @param {object} neuM       übermittelter Betrieb, wie gesendet
 * @param {{loeschlauf?: boolean, heute?: string, vollSicht?: boolean, unveraendert?: Set<string>}} [o]  loeschlauf: Rolle darf
 *   abgelaufene Stempel löschen (Leitung/Planung); heute: Berliner Tag
 * @returns {null | {grund: string, schluessel: string|null}}
 */
export function stempelWiderspruch(altM, neuM, o = {}) {
  if (!objekt(neuM)) return null;
  const altS = altM && objekt(altM.einstempeln) ? altM.einstempeln : {};
  const altE = altM && objekt(altM.erfassung) ? altM.erfassung : {};
  const stich = o.loeschlauf && o.heute && altM ? loeschStichtag(altM, o.heute) : null;
  const abgelaufen = (k) => !!stich && !!tagVon(k) && tagVon(k) < stich;
  /* Ein Stempel jenseits der Aufbewahrungsfrist, den der Datenschutzlauf schon
     gelöscht hat, steht in einer Kopie, die vor dem Lauf geladen wurde (WP-06, B1).
     Das ist kein erfundener Stempel: Er wird ignoriert, nicht abgewiesen — und
     nicht wieder gespeichert (stempelSichern). Rolle und Löschlauf spielen
     dabei keine Rolle; die Frist entscheidet. */
  const frist = o.heute && altM ? loeschStichtag(altM, o.heute) : null;
  const verfallen = (k) => !!frist && !!tagVon(k) && tagVon(k) < frist;
  /* Standort-Ergebnisse alter Tage hat der Datenschutzlauf gelöscht (WP-20, A1): Eine davor geladene Kopie
     trägt sie noch. Das ist kein Widerspruch zum Beleg — ignoriert, nicht abgewiesen, und nicht zurückgeschrieben. */
  const sStich = o.heute && altM ? standortStichtag(altM, o.heute) : null;
  const standortVerfallen = (k, f) => !!sStich && !!tagVon(k) && tagVon(k) < sStich && STANDORT_FELDER.includes(f);
  const nein = (grund, schluessel = null) => ({ grund, schluessel });
  /* Ist der Monat dieses Schlüssels seit dem Stand der Übermittlung
     unverändert (lib/bestand.mjs, unveraenderteScherben)? */
  const weggelassenErkennbar = (k) => !!(o.unveraendert && altM && tagVon(k)
    && o.unveraendert.has(`${altM.id}::${tagVon(k).slice(0, 7)}`));

  if ("einstempeln" in neuM && neuM.einstempeln !== undefined) {
    const n = neuM.einstempeln;
    if (!objekt(n)) {
      if (Object.keys(altS).length) return nein("einstempeln: Stempel lassen sich nicht ersetzen oder löschen.");
    } else {
      for (const [k, e] of Object.entries(n)) {
        const a = altS[k];
        if (a === undefined) {
          if (e === null || e === undefined) continue;          // nichts da, nichts gelöscht
          if (verfallen(k)) continue;                           // vom Datenschutzlauf gelöscht (B1)
          return nein("Stempel entstehen nur über die Stempeluhr — ein neuer Stempel über das Speichern wird abgewiesen.", k);
        }
        if (!objekt(e)) {
          if (abgelaufen(k)) continue;                          // Löschlauf (Aufbewahrungsfrist)
          return nein("Ein Stempel ist ein Beleg und lässt sich nicht löschen.", k);
        }
        for (const [f, v] of Object.entries(e)) {
          if (f === KORREKTUREN) {
            const ak = Array.isArray(a[KORREKTUREN]) ? a[KORREKTUREN] : [];
            if (!Array.isArray(v) || v.length > ak.length || (o.vollSicht && weggelassenErkennbar(k) && v.length !== ak.length) || v.some((x, i) => !gleich(x, ak[i])))
              return nein("Korrekturen eines Stempels entstehen nur als Ereignis über die Stempelkorrektur.", k);
            continue;
          }
          if (f === ANTRAEGE) {
            /* Nur der unveränderliche Teil zählt: Status und Entscheidung setzt der Server
               (eine ältere Kopie trägt noch „offen“). Anträge entstehen nur über /api/korrektur-antrag. */
            const aa = Array.isArray(a[ANTRAEGE]) ? a[ANTRAEGE] : [];
            if (!Array.isArray(v) || v.length > aa.length || (o.vollSicht && weggelassenErkennbar(k) && v.length !== aa.length)
                || v.some((x, i) => !gleich(antragFest(x), antragFest(aa[i]))))
              return nein("Korrekturanträge entstehen nur über den Korrekturantrag, nicht über das Speichern.", k);
            continue;
          }
          if (f === "markierungen") {
            const am = Array.isArray(a.markierungen) ? a.markierungen : [];
            if (!Array.isArray(v) || v.some((x) => !am.includes(x))
              || (o.vollSicht && weggelassenErkennbar(k) && !gleich(v, am)))
              return nein("Kennzeichen eines Stempels setzt nur der Server.", k);
            continue;
          }
          if (KENNZEICHEN.has(f)) {
            if (!gleich(v, a[f])) return nein("Kennzeichen eines Stempels setzt nur der Server.", k);
            continue;
          }
          if (!(f in a) && standortVerfallen(k, f)) continue;     // vom Datenschutzlauf gelöscht (A1)
          if (!(f in a) || !gleich(v, a[f]))
            return nein("Ein gestempelter Wert lässt sich nicht ändern. Korrekturen werden als eigenes Ereignis angehängt — das Original bleibt.", k);
        }
        /* Weggelassene Originalfelder: Ein Feld, das gespeichert ist, kann
           einer Kopie nur fehlen, wenn sie älter ist — nicht bei einem Eintrag
           aus einem Monat, den sie unverändert kennt. */
        if (o.vollSicht && weggelassenErkennbar(k)) {
          for (const f of Object.keys(a)) {
            if (!(f in e)) return nein("Ein gestempelter Wert lässt sich nicht löschen. Korrekturen werden als eigenes Ereignis angehängt — das Original bleibt.", k);
          }
        }
      }
      /* Weggelassene Stempel: Wer alle Stempel sieht (Leitung, Planung) und
         den Monat unverändert kennt, hat einen fehlenden Stempel gelöscht. */
      if (o.vollSicht) {
        for (const k of Object.keys(altS)) {
          if (k in n || abgelaufen(k) || !weggelassenErkennbar(k)) continue;
          return nein("Ein Stempel ist ein Beleg und lässt sich nicht löschen.", k);
        }
      }
    }
  }

  /* Ist-Zeit eines gestempelten Tages: nur über die Stempelkorrektur. */
  if ("erfassung" in neuM && objekt(neuM.erfassung)) {
    for (const [k, e] of Object.entries(neuM.erfassung)) {
      const stempel = altS[k];
      if (!objekt(stempel)) continue;                           // kein Stempel: gewöhnliche Erfassung
      const a = altE[k];
      if (gleich(e, a)) continue;
      if (!objekt(e)) {
        if (a === undefined && (e === null || e === undefined)) continue;
        if (abgelaufen(k)) continue;
        return nein("Die Ist-Zeit eines gestempelten Tages lässt sich nicht löschen.", k);
      }
      if (a !== undefined && !(o.vollSicht && weggelassenErkennbar(k)) && bekannteIstStaende(a, stempel).has(tupel(e))) continue;   // veraltete Kopie
      return nein("Die Ist-Zeit eines gestempelten Tages ändert nur eine Stempelkorrektur (mit Grund) — das Original bleibt.", k);
    }
    if (o.vollSicht) {
      for (const k of Object.keys(altE)) {
        if (!objekt(altS[k]) || k in neuM.erfassung || abgelaufen(k) || !weggelassenErkennbar(k)) continue;
        return nein("Die Ist-Zeit eines gestempelten Tages lässt sich nicht löschen.", k);
      }
    }
  } else if ("erfassung" in neuM && neuM.erfassung !== undefined && !objekt(neuM.erfassung)) {
    if (Object.keys(altE).some((k) => objekt(altS[k]))) return nein("erfassung: gestempelte Ist-Zeiten lassen sich nicht ersetzen.");
  }
  return null;
}

/**
 * Was gespeichert wird: Stempel und die Ist-Zeiten gestempelter Tage aus dem
 * gespeicherten Stand — gleich, was die Übermittlung enthielt. Ein Löschlauf
 * (loeschlauf) darf Einträge abgelaufener Tage entfernen, die er weggelassen
 * oder auf null gesetzt hat.
 * @param {{loeschlauf?: boolean, heute?: string, vollSicht?: boolean, unveraendert?: Set<string>}} [o]
 * @returns {{mandant: object, geloescht: number, verworfen: number}}  verworfen: Einträge jenseits der Frist,
 *   die nicht mehr gespeichert sind und aus einer älteren Kopie nicht zurückkommen (B1) — Stempel und Ist-Zeiten
 */
export function stempelSichern(altM, gesendetM, zielM, o = {}) {
  if (!objekt(zielM)) return { mandant: zielM, geloescht: 0, verworfen: 0 };
  const altS = altM && objekt(altM.einstempeln) ? altM.einstempeln : {};
  const altE = altM && objekt(altM.erfassung) ? altM.erfassung : {};
  if (!altM) {
    /* Neu angelegter Betrieb: Er hat noch keine Stempel. */
    return { mandant: { ...zielM, einstempeln: {} }, geloescht: 0, verworfen: 0 };
  }
  const stich = o.loeschlauf && o.heute ? loeschStichtag(altM, o.heute) : null;
  const gs = gesendetM && objekt(gesendetM.einstempeln) ? gesendetM.einstempeln : null;
  const ge = gesendetM && objekt(gesendetM.erfassung) ? gesendetM.erfassung : null;
  const weg = (sammlung, k) => !!stich && !!sammlung && tagVon(k) && tagVon(k) < stich
    && (!(k in sammlung) || !objekt(sammlung[k]));
  /* Monate, die seit dem Stand der Übermittlung unverändert sind (oder ohne
     Abgleich geschrieben werden): Dort gilt der gespeicherte Stempel. In
     den übrigen bleibt die (geprüfte, ehrliche) Kopie stehen — dort
     entscheidet der Drei-Wege-Abgleich in lib/bestand.mjs: unverändert
     zurückgeschickt behält er den gespeicherten Monat, verändert ist es ein
     Konflikt (409). Ein Ersetzen auch dort machte jede veraltete Kopie zum
     Konflikt. */
  const sicher = (k) => !o.unveraendert || !tagVon(k)
    || o.unveraendert.has(`${altM.id}::${tagVon(k).slice(0, 7)}`);
  const zielS = objekt(zielM.einstempeln) ? zielM.einstempeln : {};
  const einstempeln = {};
  let geloescht = 0;
  for (const [k, v] of Object.entries(altS)) {
    if (weg(gs, k)) { geloescht++; continue; }
    if (sicher(k)) einstempeln[k] = v;
    else if (k in zielS) einstempeln[k] = zielS[k];
  }
  /* Gelöschte Standort-Ergebnisse alter Tage bleiben gelöscht (A1, Datenschutz): Auch eine Kopie aus einem
     veränderten Monat bringt sie nicht zurück. Was gespeichert noch da ist, bleibt bis zum nächsten Lauf. */
  const sStich = o.heute ? standortStichtag(altM, o.heute) : null;
  if (sStich) {
    for (const [k, v] of Object.entries(einstempeln)) {
      if (!objekt(v) || !tagVon(k) || tagVon(k) >= sStich) continue;
      const a = altS[k];
      if (!STANDORT_FELDER.some((f) => f in v && !(objekt(a) && f in a))) continue;
      const rest = { ...v };
      for (const f of STANDORT_FELDER) if (!(objekt(a) && f in a)) delete rest[f];
      einstempeln[k] = rest;
    }
  }
  const erfassung = objekt(zielM.erfassung) ? { ...zielM.erfassung } : {};
  /* Was der Datenschutzlauf gelöscht hat (jenseits der Frist, gespeichert nicht
     mehr vorhanden), schreibt eine ältere Kopie nicht zurück (B1) — weder den
     Stempel (oben: es werden nur gespeicherte übernommen) noch seine Ist-Zeit. */
  const frist = o.heute ? loeschStichtag(altM, o.heute) : null;
  let verworfen = 0;
  if (frist) {
    /* Verworfen wird unabhängig vom Modus des Datenschutzlaufs: Der Eintrag ist
       gespeichert nicht (mehr) da — gelöscht vom Lauf (Modus „an“) oder von der
       Leitung (Löschlauf in der Oberfläche) —, und die Kopie ist älter. Die
       Antwort sagt es der Leitung (hinweis in PUT /api/bestand). */
    for (const k of Object.keys(erfassung)) {
      if (tagVon(k) && tagVon(k) < frist && !(k in altE) && !(k in altS)) { delete erfassung[k]; verworfen++; }
    }
    for (const k of Object.keys(gs || {})) {
      if (tagVon(k) && tagVon(k) < frist && !(k in altS)) verworfen++;
    }
  }
  for (const k of Object.keys(altS)) {
    if (weg(ge, k)) { delete erfassung[k]; continue; }
    if (!sicher(k)) continue;
    if (k in altE) erfassung[k] = altE[k]; else delete erfassung[k];
  }
  return { mandant: { ...zielM, einstempeln, erfassung }, geloescht, verworfen };
}

/** M4 (WP-14b): Beginn gleich Ende ist als Uhrzeit zweideutig — 0 oder 24 Stunden. Die Stundenrechnung liest
    24 h; eine Korrektur oder ein Antrag mit gleicher Uhrzeit wird deshalb abgewiesen. Einzige Ausnahme: An dem
    Tag ist ein 24-Stunden-Dienst geplant (Dienstart mit Beginn = Ende) — die ausdrückliche Kennung ist der Plan. */
export const BEGINN_GLEICH_ENDE = "Beginn und Ende sind dieselbe Uhrzeit — das wäre eine Dauer von 0 oder 24 Stunden. "
  + "Bitte die tatsächlichen Zeiten angeben; 24 Stunden gehen nur an einem Tag mit geplantem 24-Stunden-Dienst.";

/**
 * Ist an diesem Tag ein 24-Stunden-Dienst geplant (Dienstart mit Beginn = Ende)? Nur dann darf eine
 * Korrektur bzw. ein Antrag Beginn = Ende nennen (M4).
 * @returns {boolean}
 */
export function geplant24Stunden(m, personId, datum) {
  const pd = geplanterDienst(m, ((m && m.personen) || []).find((p) => p && String(p.id) === String(personId)), datum);
  const da = pd ? ((m && m.dienstarten) || []).find((d) => d && String(d.id) === String(pd)) : null;
  return !!da && UHR.test(String(da.start)) && da.start === da.ende;
}

/**
 * Die Pause, mit der eine Korrektur rechnet: die genannte, sonst die zuletzt erfasste, sonst die der
 * geplanten Dienstart, sonst 0. Dieselbe Regel für Antrag und Genehmigung (WP-14b, N1).
 * @param {any} m
 * @param {string|number} personId
 * @param {string} datum
 * @param {number} [genannt]  die im Antrag bzw. in der Korrektur genannte Pause
 * @returns {number}
 */
export function pauseFuerKorrektur(m, personId, datum, genannt) {
  if (genannt !== undefined) return genannt;
  const alt = ((m && m.erfassung) || {})[`${personId}|${datum}`];
  if (objekt(alt) && alt.pause !== undefined) return alt.pause;
  const planDienst = geplanterDienst(m, ((m && m.personen) || []).find((p) => p && String(p.id) === String(personId)), datum);
  const dienstart = planDienst ? ((m && m.dienstarten) || []).find((d) => d && String(d.id) === String(planDienst)) : null;
  return (dienstart && Number(dienstart.pause)) || 0;
}

/**
 * F3 (WP-14b): Ein ZEITUMSTELLUNG-Prüffall lässt sich nicht mit denselben Uhrzeiten bestätigen — gilt für
 * Direktkorrektur, Genehmigung und schon für den Antrag (sonst bliebe er hängen).
 * @param {any} alt  aktuelle Erfassung des Tages
 * @returns {{status: number, grund: string} | null}
 */
export function zeitumstellungSperre(alt, start, ende) {
  if (objekt(alt) && alt.bestaetigt !== true && typeof alt.grund === "string" && alt.grund.startsWith("ZEITUMSTELLUNG")
      && alt.start === start && alt.ende === ende)
    return { status: 422, grund: "In der Nacht der Zeitumstellung ergeben diese Uhrzeiten eine andere Dauer als gestempelt. "
      + "Bitte Beginn und Ende so eintragen, dass sie die tatsächliche Arbeitszeit ergeben." };
  return null;
}

/**
 * Eine Korrektur prüfen und als Ereignis anhängen.
 * @param {object} m  gespeicherter Betrieb
 * @param {{personId: string, datum: string, start: string, ende: string, grund: string, pause?: number}} k
 * @param {{personId: string|null, name: string|null, rolle: string}} wer
 * @param {Date} jetzt
 * @param {string} id
 * @param {{antrag?: {id: string, vonPersonId: (string|number|null)}}} [opt]  antrag: die Korrektur geht auf diesen Antrag zurück (WP-14)
 * @returns {{status: number, grund: string} | {mandant: object, eintrag: object, erfassung: object, ereignis: object, hinweis: (string|null), hinweise: Array<{code: string, text: string}>}}
 */
export function korrekturAnhaengen(m, k, wer, jetzt, id, opt = {}) {
  const { personId, datum, start, ende } = k || {};
  const pauseRoh = k && k.pause;
  const pauseGegeben = pauseRoh !== undefined && pauseRoh !== null && String(pauseRoh) !== "";
  const pause = pauseGegeben ? Number(pauseRoh) : undefined;
  if (pauseGegeben && !(Number.isInteger(pause) && pause >= 0 && pause <= 180))
    return { status: 422, grund: "Die Pause in Minuten angeben (0 bis 180)." };
  const grund = typeof (k && k.grund) === "string" ? k.grund.trim() : "";
  if (typeof personId !== "string" && typeof personId !== "number") return { status: 400, grund: "Person fehlt." };
  if (!TAG.test(String(datum || ""))) return { status: 400, grund: "Tag fehlt oder ist ungültig (JJJJ-MM-TT)." };
  if (!UHR.test(String(start || "")) || !UHR.test(String(ende || "")))
    return { status: 422, grund: "Beginn und Ende als Uhrzeit (HH:MM) angeben." };
  if (start === ende && !geplant24Stunden(m, personId, datum)) return { status: 422, grund: BEGINN_GLEICH_ENDE };
  if (grund.length < KORREKTUR_GRUND_MIN || grund.length > KORREKTUR_GRUND_MAX)
    return { status: 422, grund: `Eine Korrektur braucht einen Grund (${KORREKTUR_GRUND_MIN}–${KORREKTUR_GRUND_MAX} Zeichen).` };
  if (!(m.personen || []).some((p) => p && String(p.id) === String(personId)))
    return { status: 404, grund: "Person nicht gefunden." };
  const schluessel = `${personId}|${datum}`;
  const stempel = (m.einstempeln || {})[schluessel];
  if (!objekt(stempel))
    return { status: 404, grund: "An diesem Tag gibt es keinen Stempel. Eine Zeit ohne Stempel trägt die Leitung in der Zeiterfassung ein." };
  const bisher = Array.isArray(stempel[KORREKTUREN]) ? stempel[KORREKTUREN] : [];
  if (bisher.length >= KORREKTUREN_MAX
      || bisher.reduce((a, x) => a + String((x && x.grund) || "").length, 0) + grund.length > KORREKTUREN_GRUENDE_MAX)
    return { status: 409, grund: "Dieser Stempel ist so oft korrigiert worden, dass der Server keine weitere Korrektur mehr annimmt. "
      + "Bitte den Fall mit der Betriebsleitung klären." };
  const alt = (m.erfassung || {})[schluessel];
  /* Ein gestempelter Dienst ohne geplanten Dienst an diesem Tag (WP-13) trägt die Marke `ungeplant`.
     Altbestand (vor WP-13 als bestätigt angelegt, C5) bekommt sie mit der Prüfung durch die Leitung:
     Dann zählt der Tag — mit Prüfung und Ereignis, nicht still. */
  const planDienst = geplanterDienst(m, (m.personen || []).find((p) => p && String(p.id) === String(personId)), datum);
  const ohnePlan = !planDienst && Array.isArray(stempel.markierungen) && stempel.markierungen.includes("UNGEPLANTER_DIENST");
  const altbestandUngeplant = ohnePlan && objekt(alt) && alt.bestaetigt === true && alt.ungeplant !== true;
  const gleichePause = !pauseGegeben || (objekt(alt) && alt.pause === pause);
  if (objekt(alt) && alt.bestaetigt && alt.start === start && alt.ende === ende && gleichePause && !altbestandUngeplant)
    return { status: 409, grund: "Diese Zeit ist schon so bestätigt — nichts zu korrigieren." };
  /* WP-14b (M2): Ein Stempel aus der Herbstnacht, dessen Uhrzeiten nicht zur gemessenen Dauer passen, lässt
     sich nicht „wie gestempelt" bestätigen — dieselben Uhrzeiten ergäben wieder die falsche Dauer. */
  const umstellung = zeitumstellungSperre(alt, start, ende);
  if (umstellung) return umstellung;

  /** @type {any} */
  const ereignis = {
    id,
    vorher: objekt(alt) ? { start: alt.start || null, ende: alt.ende || null, bestaetigt: !!alt.bestaetigt,
      ...(alt.pause !== undefined ? { pause: alt.pause } : {}) } : null,
    nachher: { start, ende, ...(pauseGegeben ? { pause } : {}) },
    wer: { personId: wer && wer.personId !== undefined ? wer.personId : null,
      name: (wer && wer.name) || null, rolle: (wer && wer.rolle) || null },
    wann: jetzt.toISOString(),
    grund,
    ...(opt.antrag ? { antrag: opt.antrag } : {}),
    /* N2 (WP-14b): Die handelnde Person korrigiert bzw. genehmigt die eigene Zeit. Nur ein Kennzeichen —
       ob das ohne zweite Person zulässig ist (Vier-Augen), ist eine offene Entscheidung; das Recht bleibt. */
    ...(wer && wer.personId !== undefined && wer.personId !== null && String(wer.personId) === String(personId) ? { selbstfreigabe: true } : {}),
  };
  /* Die gültige Pause: die genannte, sonst die zuletzt erfasste, sonst die der geplanten Dienstart. */
  const gueltigePause = pauseFuerKorrektur(m, personId, datum, pauseGegeben ? pause : undefined);
  /* Auflage C1: auch die übernommene Pause (zuletzt erfasste oder der Dienstart) muss kleiner sein als die neue
     Anwesenheit — gemessen an der wirklichen Dauer des Tages (Zeitumstellung, WP-14b M2). */
  if (pauseZuLang(start, ende, gueltigePause, datum))
    return { status: 422, grund: `Die Pause (${gueltigePause} min) muss kürzer sein als die Anwesenheit von ${start} bis ${ende} Uhr.` };
  const hinweise = regelHinweise(m, personId, datum, { start, ende, pause: gueltigePause });
  if (hinweise.length) ereignis.hinweise = hinweise;
  const eintrag = { ...stempel, [KORREKTUREN]: [...bisher, ereignis] };
  /* Die Marke eines ungeplanten Dienstes (WP-13) bleibt: Mit ihr zählt der
     Tag nach der Bestätigung in Konto und Lohnausgabe. Ein Tag ohne Plan mit
     UNGEPLANTER_DIENST bekommt sie mit jeder Prüfung durch die Leitung —
     auch wenn die vorige Ist-Zeit sie nicht trug (DAUER_NULL, frühere
     Korrektur ohne Marke; WP-14b, M3): Sonst zählte der Tag nie. */
  const erfassung = { start, ende, bestaetigt: true, grund: KORRIGIERT_TEXT, korrigiert: true,
    ...(pauseGegeben ? { pause } : (objekt(alt) && alt.pause !== undefined ? { pause: alt.pause } : {})),
    ...((objekt(alt) && alt.ungeplant === true) || ohnePlan ? { ungeplant: true } : {}) };
  /* Auffällig oft korrigiert: Die Leitung bekommt es in der Antwort gesagt. */
  const hinweis = bisher.length + 1 >= KORREKTUR_HINWEIS_AB
    ? `Dieser Stempel wurde jetzt ${bisher.length + 1}-mal korrigiert — bitte prüfen, ob etwas nicht stimmt.` : null;
  return { ereignis, eintrag, erfassung, hinweis, hinweise, mandant: { ...m,
    einstempeln: { ...(m.einstempeln || {}), [schluessel]: eintrag },
    erfassung: { ...(m.erfassung || {}), [schluessel]: erfassung } } };
}

/**
 * Wiederherstellen aus einer Sicherung: Stempel gehen dabei nicht verloren
 * und kommen nicht verändert zurück. Was heute gespeichert ist, bleibt (samt
 * Korrekturen und abgeleiteter Ist-Zeit); Stempel, die nur die Sicherung hat,
 * kommen zurück (ein Löschlauf liegt nach der Regel in sicherungen.mjs nicht
 * dazwischen).
 * @returns {{mandant: object, behalten: number}}
 */
export function stempelBeiWiederherstellung(jetztM, ausSicherungM) {
  const jetztS = jetztM && objekt(jetztM.einstempeln) ? jetztM.einstempeln : {};
  const jetztE = jetztM && objekt(jetztM.erfassung) ? jetztM.erfassung : {};
  const sichS = objekt(ausSicherungM.einstempeln) ? ausSicherungM.einstempeln : {};
  const erfassung = objekt(ausSicherungM.erfassung) ? { ...ausSicherungM.erfassung } : {};
  let behalten = 0;
  for (const k of Object.keys(jetztS)) {
    if (!gleich(jetztS[k], sichS[k])) behalten++;
    if (k in jetztE) erfassung[k] = jetztE[k]; else delete erfassung[k];
  }
  return { mandant: { ...ausSicherungM, einstempeln: { ...sichS, ...jetztS }, erfassung }, behalten };
}
