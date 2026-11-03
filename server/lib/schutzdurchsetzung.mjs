/* ==========================================================================
   SCHUTZ AUF DEM SERVER DURCHSETZEN (WP-11, Nachprüfung WP-10 B2, Review F2)

   Bis WP-11 setzte nur die Oberfläche durch, dass harte Schutzregeln eine
   Einteilung sperren (Warndialog, Bewerbung, Selbstplanung, Zuschlag,
   Übernahme, Einsprung, Tausch). Wer `abweichungen` direkt über die API
   schrieb, kam vorbei.

   Der Server prüft mit derselben Schutzprüfung wie die Oberfläche
   (schutzEinsatz, server/lib/schutzpruefung.mjs) auf den gespeicherten
   Rohdaten der Person — für die Schichtverantwortung gleichwertig zu ihren
   Einsatzregeln (pruefungen/schutzmerkmale-sicht.test.js). Sperrend ist,
   was schutzEinsatz als sperrt kennzeichnet, und „nicht im Bestand".

   Zwei Wege führen zu einer Einteilung, beide werden geprüft:
   1. Ausdrücklich: eine neue oder geänderte Einteilung in `abweichungen`.
      Die Dienstart kommt aus dem NEUEN Stand (eine im selben Speichervorgang
      angelegte Dienstart zählt mit ihren Zeiten). Eine Dienstart, die es dort
      nicht gibt, sperrt (fail-closed); „-" heißt frei.
   2. Mittelbar (Review F2): Ändert die Übermittlung Dienstzeiten, die
      Schichtfolge (zyklus, anker), Einheiten (Versatz) oder Personen
      (neu angelegt — Review U1 —, Zugehörigkeit, Springer, Schichtdienst, Ein- und
      Austritt, Status), wird für jede geschützte
      Person der Dienst der nächsten SCHUTZ_HORIZONT_TAGE Tage vorher und
      nachher berechnet (Abweichung, sonst Schichtfolge der Einheit am Tag).
      Entsteht dabei ein sperrender Befund, den es vorher nicht gab, wird
      abgewiesen. Altbestand — ein Befund, der schon vorher bestand — blockiert
      nicht.

   0. Vorab (Nachprüfung WP-11, N1): Eine Dienstart, die noch verwendet wird
      (Schichtfolge oder Einteilung ab heute), lässt sich nicht löschen — für
      alle Personen gleich, die Meldung nennt Person und Tag, kein Merkmal.

   Laufzeit (N1): Schichtfolge je Einheit einmal je Aufruf, Abweichungen der
   geschützten Personen in einem Durchlauf, gerechnet wird nur, wo sich Dienst,
   Dienstart, Person oder Einstellungen geändert haben. Gemessen: 2000
   Personen, 300 geschützt, 20 000 Abweichungen, Schichtfolge geändert — rund
   130 ms warm (pruefungen/nachpruefung-wp11.test.js); rechte.mjs gibt die
   Laufzeit jeder Nachrechnung ohne Personenbezug aus.

   Grenzen (dokumentiert in RECHTEMATRIX ²¹, SICHERHEIT.md und
   docs/REGELWERK-REGISTRY.md, Anhang H):
   - Die Rechnung für den mittelbaren Weg ist vereinfacht: Teilzeit und
     Posten bleiben außer Acht (beide Seiten gleich gerechnet; eine Teilzeit-
     kraft kann daher abgewiesen werden, obwohl sie an dem Tag frei wäre —
     im Zweifel streng). Abwesenheiten zählen nicht als frei.
   - Nur im Horizont; spätere Tage prüft die Planprüfung der Oberfläche.
   - Ruhezeit unter 11 Stunden, Einschränkungen an der Person, gesetzliche
     Qualifikationen und Einweisungen setzt weiterhin nur die Oberfläche durch.

   Rein: keine Ablage.
   ========================================================================== */
import { schutzEinsatz, alterAm, addDays, tagUTC } from "./schutzpruefung.mjs";
import { BEFUND_KATALOG } from "./bestaetigungen.mjs";

/** Wie weit der Server mittelbare Änderungen voraus nachrechnet (Tage ab heute). */
export const SCHUTZ_HORIZONT_TAGE = 120;

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (w) => (Array.isArray(w) ? w : []).filter(istObjekt);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* Tagesnummern zwischengespeichert: Dieselben gut 120 Tage werden je Person
   und Stand nachgeschlagen (Nachprüfung WP-11, N1). */
const TAGNR = new Map();
const tagNr = (s) => { let n = TAGNR.get(s); if (n === undefined) { n = Math.round(tagUTC(s) / 86400000); if (TAGNR.size > 5000) TAGNR.clear(); TAGNR.set(s, n); } return n; };
const zwischen = (a, b) => tagNr(b) - tagNr(a);

/** „Nicht im Bestand" — dieselbe Regel wie imDienst in der Oberfläche. */
export function nichtImBestand(p, d) {
  if (p.eintritt && d < p.eintritt) return true;
  if (p.austritt && d > p.austritt) return true;
  return p.status === "gesperrt";
}

/**
 * Die sperrenden Befunde einer Einteilung — Katalogkennung und neutraler
 * Text (ohne Merkmal, ohne Gesetz: Die Meldung kann an die Schicht-
 * verantwortung gehen).
 * @returns {{regel: string, text: string}[]}
 */
export function sperrendeBefunde(person, dienstart, datum, einst) {
  const aus = [];
  if (BEFUND_KATALOG.bestand.sperrt && nichtImBestand(person, datum))
    aus.push({ regel: "bestand", text: BEFUND_KATALOG.bestand.text });
  if (BEFUND_KATALOG.schutz.sperrt && schutzEinsatz(person, dienstart, datum, einst).some((b) => b.sperrt))
    aus.push({ regel: "schutz", text: BEFUND_KATALOG.schutz.text });
  return aus;
}

/* Einheiten je Betrieb einmal als Map (Nachprüfung WP-11, N1: Laufzeit). */
const EINHEITEN = new WeakMap();
function einheitenVon(m) {
  const quelle = Array.isArray(m.einheiten) ? m.einheiten : null;
  if (!quelle) return new Map();
  let x = EINHEITEN.get(quelle);
  if (!x) { x = new Map(liste(quelle).map((e) => [String(e.id), e])); EINHEITEN.set(quelle, x); }
  return x;
}

/* --- Die Schichtfolge, wie die Oberfläche sie rechnet (einheitDienst,
       einheitAm in src/App.jsx), ohne Teilzeit und Posten. --- */
function einheitAm(p, d) {
  let t = null;
  if (!Array.isArray(p.zugehoerigkeit)) return null;
  for (const z of p.zugehoerigkeit) if (istObjekt(z) && z.ab <= d) t = z;
  return t ? t.einheitId : null;
}
function versatzTage(e) {
  return e.versatzTage !== undefined && e.versatzTage !== null ? e.versatzTage : (e.versatz || 0) * 7;
}
function rotationsDienst(m, eid, d) {
  const e = einheitenVon(m).get(String(eid));
  if (!e || e.pool) return null;
  const tage = m.zyklus && Array.isArray(m.zyklus.tage) ? m.zyklus.tage : null;
  if (!tage || !tage.length || typeof m.anker !== "string" || !TAG.test(m.anker)) return null;
  const len = tage.length;
  const i = (((zwischen(m.anker, d) + versatzTage(e)) % len) + len) % len;
  const id = tage[i];
  return id && id !== "-" ? id : null;
}
/** Der Dienst einer Person an einem Tag: Abweichung, sonst Schichtfolge. */
export function dienstAm(m, p, d, folge = rotationsDienst, abwTage = undefined) {
  const ab = abwTage !== undefined ? (abwTage ? abwTage.get(d) : undefined)
    : istObjekt(m.abweichungen) ? m.abweichungen[`${p.id}|${d}`] : undefined;
  if (ab !== undefined) return ab === "-" || ab === "" || ab === null ? null : ab;
  if (p.springer || p.imSchichtdienst === false) return null;
  const eid = einheitAm(p, d);
  return eid ? folge(m, eid, d) : null;
}
/** Die Abweichungen der gesuchten Personen, je Person nach Tag — ein Durchlauf
    statt eines Schlüssels je Person und Tag (N1). Schlüssel: „Person|JJJJ-MM-TT". */
function abweichungenJePerson(abw, ids) {
  const x = new Map();
  for (const k in abw) {
    const n = k.length - 11;
    if (n <= 0 || k.charCodeAt(n) !== 124) continue;                     // „|"
    const pid = k.slice(0, n);
    if (!ids.has(pid)) continue;
    let tage = x.get(pid);
    if (!tage) { tage = new Map(); x.set(pid, tage); }
    tage.set(k.slice(n + 1), abw[k]);
  }
  return x;
}
/** Die Schichtfolge je Einheit und Tag einmal je Aufruf rechnen (N1) — sie
    hängt nicht an der Person. */
function folgeImHorizont(m, horizont) {
  const proEinheit = new Map();
  const index = new Map(horizont.map((d, i) => [d, i]));
  return (_m, eid, d) => {
    const i = index.get(d);
    if (i === undefined) return rotationsDienst(m, eid, d);
    let a = proEinheit.get(eid);
    if (!a) { a = horizont.map((t) => rotationsDienst(m, eid, t)); proEinheit.set(eid, a); }
    return a[i];
  };
}

const dienstartenVon = (m) => new Map(liste(m && m.dienstarten).map((d) => [String(d.id), d]));
const hatZeiten = (da) => !!da && typeof da.start === "string" && typeof da.ende === "string";

/** Wer eine harte Schutzregel haben kann — nur für sie lohnt die Nachrechnung. */
function geschuetzt(p, heute) {
  if (p.mutterschutz) return true;
  const a = alterAm(p.geburtstag || p.geburtsdatum, heute);
  return a !== null && a < 19;                                            // im Horizont noch minderjährig möglich
}

/** Hat die Übermittlung etwas geändert, das Einteilungen mittelbar verschiebt? */
function planStrukturGeaendert(altM, neuM) {
  for (const f of ["dienstarten", "zyklus", "anker", "einheiten"])
    if (Object.prototype.hasOwnProperty.call(neuM, f) && !gleich(altM[f], neuM[f])) return true;
  const alt = new Map(liste(altM.personen).map((p) => [String(p.id), p]));
  for (const p of liste(neuM.personen)) {
    const a = alt.get(String(p.id));
    /* Review U1: Eine neu angelegte Person bekommt ihre Dienste aus der
       Schichtfolge ihrer Einheit — das ist eine Einteilung wie jede andere. */
    if (!a) return true;
    /* Review M2: auch Schutzmerkmale und Einwilligungen — wer sie ändert,
       ändert, ob bestehende Einteilungen zulässig sind. */
    for (const f of ["zugehoerigkeit", "springer", "imSchichtdienst", "eintritt", "austritt", "status",
      "mutterschutz", "mutterschutzEinwilligungen", "geburtstag", "geburtsdatum"]) if (!gleich(a[f], p[f])) return true;
  }
  return false;
}

/**
 * Die zuletzt gemessene Laufzeit von abweichungenSchutzPruefen (Nachprüfung
 * WP-11, N1) — rechte.mjs protokolliert sie, wenn nachgerechnet wurde.
 * Ohne Personenbezug: nur Millisekunden und Mengen.
 * @type {null | { ms: number, mittelbar: boolean, personen: number, geprueft: number }}
 */
export let letzteLaufzeit = null;

/** Name einer Person für eine Meldung — ohne jedes Merkmal. */
const nameVon = (p) => (p ? [p.vorname, p.nachname].filter(Boolean).join(" ") || String(p.id) : "unbekannt");

/**
 * Prüft die neuen oder geänderten Einteilungen einer Übermittlung —
 * ausdrücklich und mittelbar (siehe oben).
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter, schon zusammengeführter Betrieb
 * @param {string} [heute] JJJJ-MM-TT, für Prüfungen
 * @returns {null | string} der Grund der Absage oder null
 */
export function abweichungenSchutzPruefen(altM, neuM, heute = new Date().toISOString().slice(0, 10)) {
  const t0 = performance.now();
  const zaehler = { mittelbar: false, personen: 0, geprueft: 0 };
  try {
    return pruefen(altM, neuM, heute, zaehler);
  } finally {
    letzteLaufzeit = { ms: Math.round((performance.now() - t0) * 10) / 10, ...zaehler };
  }
}

function pruefen(altM, neuM, heute, zaehler) {
  if (!istObjekt(neuM)) return null;
  const hat = (o, f) => !!o && Object.prototype.hasOwnProperty.call(o, f);
  const altAbw = istObjekt(altM && altM.abweichungen) ? altM.abweichungen : {};
  const neuAbw = istObjekt(neuM.abweichungen) ? neuM.abweichungen : altAbw;
  const personenNeu = new Map(liste(neuM.personen || (altM && altM.personen)).map((p) => [String(p.id), p]));
  const personenAlt = new Map(liste(altM && altM.personen).map((p) => [String(p.id), p]));
  const daNeu = dienstartenVon(hat(neuM, "dienstarten") ? neuM : altM);
  const daAlt = dienstartenVon(altM);
  const einstNeu = hat(neuM, "einstellungen") ? neuM.einstellungen : altM && altM.einstellungen;
  const einstAlt = altM && altM.einstellungen;
  const absage = (tag, text) => `Einteilung am ${tag} nicht möglich: ${text}. Sperrende Regeln lassen sich nicht bestätigen.`;

  /* 0. Eine Dienstart löschen, die noch verwendet wird (Nachprüfung WP-11,
        N1): für alle Personen gleich abgewiesen, mit Person und Tag — ohne
        Merkmal. Vorher kam nur bei geschützten Personen „nicht bekannt",
        bei allen anderen ging das Löschen durch. Verwendet heißt: in der
        Schichtfolge oder als Einteilung ab heute; vergangene Einteilungen
        bleiben, wie sie sind. */
  if (altM && hat(neuM, "dienstarten")) {
    const weg = new Set([...daAlt.keys()].filter((id) => !daNeu.has(id)));
    if (weg.size) {
      const name = (id) => { const d = daAlt.get(String(id)); return (d && d.name) || String(id); };
      const zyklus = hat(neuM, "zyklus") ? neuM.zyklus : altM.zyklus;
      const inFolge = zyklus && Array.isArray(zyklus.tage) ? zyklus.tage.find((t) => weg.has(String(t))) : undefined;
      if (inFolge !== undefined)
        return `Die Dienstart „${name(inFolge)}" wird noch verwendet (Schichtfolge). Erst die Schichtfolge ändern, dann löschen.`;
      let erster = null;
      for (const [k, wert] of Object.entries(neuAbw)) {
        if (!weg.has(String(wert))) continue;
        const [pid, tag] = String(k).split("|");
        if (!TAG.test(tag || "") || tag < heute) continue;
        if (!erster || tag < erster.tag) erster = { pid, tag, wert };
      }
      if (erster) {
        const p = personenNeu.get(String(erster.pid)) || personenAlt.get(String(erster.pid));
        return `Die Dienstart „${name(erster.wert)}" wird noch verwendet (${nameVon(p)}, ${erster.tag}). Erst umplanen, dann löschen.`;
      }
    }
  }

  /* 1. Ausdrücklich gesetzte Einteilungen */
  if (neuAbw !== altAbw) for (const k in neuAbw) {                         // ohne Zwischenliste (N1)
    if (!Object.prototype.hasOwnProperty.call(neuAbw, k)) continue;
    const wert = neuAbw[k];
    if (altAbw[k] === wert) continue;                                       // unverändert
    if (wert === "-" || wert === "" || wert === null || wert === undefined) continue;   // frei
    const [pid, tag] = String(k).split("|");
    const p = personenNeu.get(String(pid)) || personenAlt.get(String(pid));
    if (!p || !TAG.test(tag || "")) continue;                               // darüber urteilen die Rollenprüfungen
    const da = daNeu.get(String(wert));
    if (!da) return absage(tag, "Die Dienstart ist nicht bekannt");        // fail-closed
    if (!hatZeiten(da)) continue;                                           // Posten ohne eigene Zeiten
    zaehler.geprueft++;
    const sperre = sperrendeBefunde(p, da, tag, einstNeu);
    if (sperre.length) return absage(tag, sperre[0].text);
  }

  /* 2. Mittelbar: Dienstzeiten, Schichtfolge, Einheiten, Zugehörigkeit.
        Gerechnet wird nur, wo sich etwas geändert haben kann (N1): gleicher
        Dienst, gleiche Dienstart, gleiche Person und gleiche Einstellungen
        ergeben denselben Befund wie vorher — Altbestand, kein neuer. */
  if (!altM || !planStrukturGeaendert(altM, neuM)) return null;
  zaehler.mittelbar = true;
  const mAlt = { ...altM, abweichungen: altAbw };
  const mNeu = { ...altM, ...neuM, abweichungen: neuAbw };
  const einstGleich = gleich(einstAlt, einstNeu);
  const daGleich = new Map();
  const dienstartGleich = (id) => {
    if (!daGleich.has(id)) daGleich.set(id, gleich(daAlt.get(id), daNeu.get(id)));
    return daGleich.get(id);
  };
  const horizont = Array.from({ length: SCHUTZ_HORIZONT_TAGE + 1 }, (_, i) => addDays(heute, i));   // einmal je Aufruf
  const folgeNeu = folgeImHorizont(mNeu, horizont), folgeAlt = folgeImHorizont(mAlt, horizont);
  const geschuetzte = [...personenNeu.values()].filter((p) => geschuetzt(p, heute));
  const ids = new Set(geschuetzte.map((p) => String(p.id)));
  const mitAbwNeu = abweichungenJePerson(neuAbw, ids), mitAbwAlt = neuAbw === altAbw ? mitAbwNeu : abweichungenJePerson(altAbw, ids);
  for (const p of geschuetzte) {
    zaehler.personen++;
    const pAlt = personenAlt.get(String(p.id));                          // neu angelegt: kein Altbestand (U1)
    const personGleich = !!pAlt && (pAlt === p || gleich(pAlt, p));
    const abwNeu = mitAbwNeu.get(String(p.id)) || null, abwAlt = mitAbwAlt.get(String(p.id)) || null;
    for (const d of horizont) {
      const idNeu = dienstAm(mNeu, p, d, folgeNeu, abwNeu);
      if (!idNeu || nichtImBestand(p, d)) continue;                         // außerhalb des Beschäftigungsverhältnisses: kein Dienst aus der Schichtfolge
      const idAlt = pAlt ? dienstAm(mAlt, pAlt, d, folgeAlt, abwAlt) : null;
      if (personGleich && einstGleich && String(idAlt) === String(idNeu) && dienstartGleich(String(idNeu))) continue;
      const da = daNeu.get(String(idNeu));
      if (!da) return absage(d, "Die Dienstart ist nicht bekannt");
      if (!hatZeiten(da)) continue;
      zaehler.geprueft++;
      const neu = sperrendeBefunde(p, da, d, einstNeu);
      if (!neu.length) continue;
      const daA = idAlt ? daAlt.get(String(idAlt)) : null;
      /* Außerhalb des Beschäftigungsverhältnisses gab es die Einteilung vorher nicht wirklich (U1, Wiedereintritt). */
      const vorher = daA && hatZeiten(daA) && !nichtImBestand(pAlt, d) ? sperrendeBefunde(pAlt, daA, d, einstAlt) : [];
      /* Altbestand je Regel: „nicht im Bestand" vorher deckt keinen Schutzbefund nachher (U1, Wiedereintritt). */
      const neuerBefund = neu.find((b) => !vorher.some((v) => v.regel === b.regel));
      if (!neuerBefund) continue;                                           // Altbestand
      /* Dieselbe Einteilung wie vorher, nur die Person hat sich geändert (Review M2): klar sagen, dass erst umzuplanen ist. */
      if (pAlt && !personGleich && String(idAlt) === String(idNeu))
        return `Bestehende Einteilung am ${d} widerspricht der Änderung an der Person: ${neuerBefund.text}. Bitte erst umplanen, dann ändern.`;
      return absage(d, `${neuerBefund.text} (durch geänderte Dienstzeiten, Schichtfolge, Zugehörigkeit oder Person)`);
    }
  }
  return null;
}
