/* ==========================================================================
   WP-48.6 — REFERENZ „ALT“ FÜR DEN DIFFERENZIALTEST

   Wörtliche Kopie der Prüfungen vor WP-48.6 (integration/release-v4 @ 32951445):
   server/lib/stempelintegritaet.mjs (stempelWiderspruch, stempelSichern samt
   Hilfen) und scherben.mjs monatVon. Nur der Kopf (Importe, Konstanten) ist
   ergänzt. pruefungen/wp48-6-kette.test.js vergleicht damit die neuen,
   segmentproportionalen Fassungen. Nicht ändern — sonst vergleicht der Test
   nicht mehr mit dem bisherigen Weg.
   ========================================================================== */
import { stichtage, aufbewahrungFehler, STANDORT_FELDER } from "../../server/lib/aufbewahrung.mjs";

const KENNZEICHEN = new Set(["markierungen", "konfliktGrund"]);
const KORREKTUREN = "korrekturen";
const ANTRAEGE = "antraege";
const antragFest = (x) => (objekt(x) ? { id: x.id, von: x.von, gestellt: x.gestellt, vorschlag: x.vorschlag, grund: x.grund } : x);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const tagVon = (k) => { const t = String(k).split("|")[1] || ""; return TAG.test(t) ? t : null; };
export const tagVonAlt = tagVon;

/** scherben.mjs monatVon vor WP-48.6. */
export function monatVonAlt(schluessel) {
  const teil = String(schluessel).split("|")[1] || "";
  return /^\d{4}-\d{2}/.test(teil) ? teil.slice(0, 7) : null;
}

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

  /* WP-15 (Review 6): Der Teil `selbstauskunft` einer Ist-Erfassung ist ein Antrag mit Vier-Augen-Freigabe.
     Er entsteht nur über /api/zeit-bestaetigen, sein Status ändert sich nur über /api/selbstauskunft-entscheiden;
     über das Speichern lässt sich weder ein Antrag anlegen, noch Status/Entscheidung setzen, noch ein offener
     Antrag zu Ist machen (bestaetigt) oder der Antrag-Teil entfernen. Eine ältere Kopie mit Status „offen“ ist
     kein Verstoß (der Serverstand bleibt). */
  if ("erfassung" in neuM && objekt(neuM.erfassung)) {
    const saFest = (x) => (objekt(x) ? { id: x.id, von: x.von, gestellt: x.gestellt, vorschlag: x.vorschlag, grund: x.grund,
      wieGeplant: x.wieGeplant, abweichung: x.abweichung } : null);
    const SA_NEIN = "Selbstauskünfte (Anträge auf Ist-Zeit) entstehen nur über die Zeitbestätigung und werden nur über die Freigabe entschieden — nicht über das Speichern.";
    for (const [k, e] of Object.entries(neuM.erfassung)) {
      const a = altE[k];
      const asa = objekt(a) ? a.selbstauskunft : undefined, esa = objekt(e) ? e.selbstauskunft : undefined;
      if (esa === undefined && asa === undefined) continue;
      if (esa !== undefined) {
        if (!objekt(esa) || !objekt(asa) || !gleich(saFest(esa), saFest(asa))) return nein(SA_NEIN, k);
        if (esa.status !== asa.status && esa.status !== "offen") return nein(SA_NEIN, k);
        if (esa.status !== "offen" && !gleich(esa.entschieden, asa.entschieden)) return nein(SA_NEIN, k);
        if (esa.status === "offen" && esa.entschieden !== null && esa.entschieden !== undefined) return nein(SA_NEIN, k);
        if (esa.status !== "genehmigt" && objekt(e) && e.bestaetigt === true) return nein(SA_NEIN, k);
      } else if (objekt(asa) && !(objekt(e) ? false : (abgelaufen(k) || verfallen(k))) && o.vollSicht && weggelassenErkennbar(k)) {
        return nein(SA_NEIN, k);
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
