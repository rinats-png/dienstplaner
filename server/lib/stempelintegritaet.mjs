/* ==========================================================================
   STEMPEL-INTEGRITÄT (WP-06)

   Ein Stempel ist ein Beleg. Er entsteht nur über /api/stempeln, und was
   dort einmal gespeichert ist — Beginn, Ende, Zeitpunkte, Ort, Geo-Urteil —
   ändert danach niemand mehr: keine Rolle, kein Schreibweg. Eine Korrektur
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

export const KORREKTUR_GRUND_MIN = 3;
export const KORREKTUR_GRUND_MAX = 500;
export const KORREKTUREN_MAX = 50;
/** Text der abgeleiteten Ist-Zeit nach einer Korrektur — ohne Grund, ohne Namen (sichtbar auch für die SV). */
export const KORRIGIERT_TEXT = "Korrektur der Stempelzeit";

const UHR = /^([01]\d|2[0-3]):[0-5]\d$/;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const tagVon = (k) => { const t = String(k).split("|")[1] || ""; return TAG.test(t) ? t : null; };

/* Aufbewahrung, konservativ (src/aufbewahrung.js rechnet dasselbe in der
   Oberfläche): nie kürzer als 24 Monate. */
const PLANDATEN_MINDEST = 24;
function minusMonate(isoTag, monate) {
  const [j, m, t] = String(isoTag).slice(0, 10).split("-").map(Number);
  let jahr = j; let monat = m - monate;
  while (monat <= 0) { monat += 12; jahr -= 1; }
  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(Math.min(t, letzter)).padStart(2, "0")}`;
}
/** Tage vor diesem Stichtag sind abgelaufen und dürfen der Löschpflicht weichen. */
export function loeschStichtag(m, heute) {
  const f = Number(m && m.aufbewahrung && m.aufbewahrung.plandatenMonate);
  const monate = Math.max(PLANDATEN_MINDEST, Number.isFinite(f) && f > 0 ? Math.floor(Math.min(f, 600)) : PLANDATEN_MINDEST);
  return minusMonate(heute, monate);
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
 * @returns {{mandant: object, geloescht: number}}
 */
export function stempelSichern(altM, gesendetM, zielM, o = {}) {
  if (!objekt(zielM)) return { mandant: zielM, geloescht: 0 };
  const altS = altM && objekt(altM.einstempeln) ? altM.einstempeln : {};
  const altE = altM && objekt(altM.erfassung) ? altM.erfassung : {};
  if (!altM) {
    /* Neu angelegter Betrieb: Er hat noch keine Stempel. */
    return { mandant: { ...zielM, einstempeln: {} }, geloescht: 0 };
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
  const erfassung = objekt(zielM.erfassung) ? { ...zielM.erfassung } : {};
  for (const k of Object.keys(altS)) {
    if (weg(ge, k)) { delete erfassung[k]; continue; }
    if (!sicher(k)) continue;
    if (k in altE) erfassung[k] = altE[k]; else delete erfassung[k];
  }
  return { mandant: { ...zielM, einstempeln, erfassung }, geloescht };
}

/**
 * Eine Korrektur prüfen und als Ereignis anhängen.
 * @param {object} m  gespeicherter Betrieb
 * @param {{personId: string, datum: string, start: string, ende: string, grund: string}} k
 * @param {{personId: string|null, name: string|null, rolle: string}} wer
 * @param {Date} jetzt
 * @returns {{status: number, grund: string} | {mandant: object, eintrag: object, erfassung: object, ereignis: object}}
 */
export function korrekturAnhaengen(m, k, wer, jetzt, id) {
  const { personId, datum, start, ende } = k || {};
  const grund = typeof (k && k.grund) === "string" ? k.grund.trim() : "";
  if (typeof personId !== "string" && typeof personId !== "number") return { status: 400, grund: "Person fehlt." };
  if (!TAG.test(String(datum || ""))) return { status: 400, grund: "Tag fehlt oder ist ungültig (JJJJ-MM-TT)." };
  if (!UHR.test(String(start || "")) || !UHR.test(String(ende || "")))
    return { status: 422, grund: "Beginn und Ende als Uhrzeit (HH:MM) angeben." };
  if (grund.length < KORREKTUR_GRUND_MIN || grund.length > KORREKTUR_GRUND_MAX)
    return { status: 422, grund: `Eine Korrektur braucht einen Grund (${KORREKTUR_GRUND_MIN}–${KORREKTUR_GRUND_MAX} Zeichen).` };
  if (!(m.personen || []).some((p) => p && String(p.id) === String(personId)))
    return { status: 404, grund: "Person nicht gefunden." };
  const schluessel = `${personId}|${datum}`;
  const stempel = (m.einstempeln || {})[schluessel];
  if (!objekt(stempel))
    return { status: 404, grund: "An diesem Tag gibt es keinen Stempel. Eine Zeit ohne Stempel trägt die Leitung in der Zeiterfassung ein." };
  const bisher = Array.isArray(stempel[KORREKTUREN]) ? stempel[KORREKTUREN] : [];
  if (bisher.length >= KORREKTUREN_MAX)
    return { status: 409, grund: `Mehr als ${KORREKTUREN_MAX} Korrekturen an einem Stempel nimmt der Server nicht an.` };
  const alt = (m.erfassung || {})[schluessel];
  if (objekt(alt) && alt.bestaetigt && alt.start === start && alt.ende === ende)
    return { status: 409, grund: "Diese Zeit ist schon so bestätigt — nichts zu korrigieren." };

  const ereignis = {
    id,
    vorher: objekt(alt) ? { start: alt.start || null, ende: alt.ende || null, bestaetigt: !!alt.bestaetigt } : null,
    nachher: { start, ende },
    wer: { personId: wer && wer.personId !== undefined ? wer.personId : null,
      name: (wer && wer.name) || null, rolle: (wer && wer.rolle) || null },
    wann: jetzt.toISOString(),
    grund,
  };
  const eintrag = { ...stempel, [KORREKTUREN]: [...bisher, ereignis] };
  /* Die Marke eines ungeplanten Dienstes (WP-13) bleibt: Mit ihr zählt der
     Tag nach der Bestätigung in Konto und Lohnausgabe. */
  const erfassung = { start, ende, bestaetigt: true, grund: KORRIGIERT_TEXT, korrigiert: true,
    ...(objekt(alt) && alt.ungeplant === true ? { ungeplant: true } : {}) };
  return { ereignis, eintrag, erfassung, mandant: { ...m,
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
