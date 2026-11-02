/* ==========================================================================
   FACHPRÜFUNG AUF DEM SERVER DURCHSETZEN (WP-11 B2/F2, Nachprüfung WP-11, WP-22)

   Der Server prüft jede Übermittlung, die Einteilungen ändern kann, mit
   derselben Prüfung wie die Oberfläche (einteilungsBefunde,
   server/lib/fachpruefung.mjs; darin die eine Schutzprüfung schutzEinsatz)
   — auf den gespeicherten Rohdaten. Für die Schichtverantwortung, die nur
   Einsatzregeln sieht, ist das gleichwertig (schutzmerkmale-sicht).

   0. Vorab (Nachprüfung WP-11, N1): Eine Dienstart, die noch verwendet wird
      (Schichtfolge oder Einteilung ab heute), lässt sich nicht löschen — für
      alle Personen gleich, die Meldung nennt Person und Tag, kein Merkmal.
   Zwei Wege führen zu einer Einteilung, beide werden geprüft:
   1. Ausdrücklich: eine neue oder geänderte Einteilung in `abweichungen`.
      Die Dienstart kommt aus dem NEUEN Stand; eine unbekannte sperrt
      (fail-closed); „-" heißt frei.
   2. Mittelbar: Ändert die Übermittlung Dienstarten, Schichtfolge (zyklus,
      anker), Einheiten (Versatz) oder Personen (Zugehörigkeit, Springer,
      Schichtdienst, Teilzeit, Eintritt, Austritt, Status), rechnet der Server
      für jede Person die nächsten SCHUTZ_HORIZONT_TAGE Tage vorher und
      nachher nach — nur dort, wo sich für die Einteilung etwas geändert haben
      kann (Dienst, Dienstart, Nachbartage, Woche, Person, Betriebsvorgaben).

   Gezählt werden nur NEUE Befunde: Was es an derselben Einteilung (Person,
   Tag) vorher schon gab, blockiert nicht (Altbestand). Dazu die
   Mindestbesetzung: Fällt ein Dienst an einem Tag durch diese Übermittlung
   unter die Vorgabe (und unter den bisherigen Stand), ist das ein Befund an
   der Einteilung, die wegfiel.

   Die Stufe und ob ein Befund sperrt, steht im Befundkatalog
   (BEFUND_KATALOG). Ein neuer sperrender Befund weist ab (403). Ein neuer
   warnender verlangt eine Bestätigung im selben Speichervorgang — einen neuen
   Eintrag im Bestätigungsprotokoll zu Person und Tag, der die Regel nennt;
   fehlt er, antwortet der Server 409 mit der Befundliste (neutrale Texte
   aus dem Katalog, nie Merkmal oder Gesetz eines Schutzes).

   Laufzeit (N1, WP-22): Planrechnung je Betrieb mit Verzeichnissen (Abweichungen
   und Abwesenheiten je Person, Schichtfolge je Einheit und Tag), Datumsrechnung
   ohne Zeitzone. rechte.mjs gibt die Laufzeit jeder Nachrechnung ohne
   Personenbezug aus; Messwerte in docs/acc45/wp22-nachweis.md.

   Grenzen (dokumentiert in RECHTEMATRIX ²¹, SICHERHEIT.md und
   docs/REGELWERK-REGISTRY.md, Anhang H; Nachweis docs/acc45/wp22-nachweis.md):
   - Posten (aus einem Gruppendienst besetzt) rechnet nur die Oberfläche;
     die Mindestbesetzung ohne Feiertagsanhebung.
   - Höchstarbeitszeit nur je Dienst (über zehn Stunden), nicht der
     Durchschnitt über sechs Monate.
   - Mittelbar nur im Horizont; spätere Tage prüft die Planprüfung.

   Rein: keine Ablage.
   ========================================================================== */
import { schutzEinsatz, addDays, tagUTC } from "./schutzpruefung.mjs";
import { BEFUND_KATALOG, sperrtBefund, befundText } from "./bestaetigungen.mjs";
import { einteilungsBefunde, imDienst, mindestOhneFeiertag, einheitAm, einheitDienst, teilzeitDienst,
  landFuerEinheit } from "./fachpruefung.mjs";

/** Wie weit der Server mittelbare Änderungen voraus nachrechnet (Tage ab heute). */
export const SCHUTZ_HORIZONT_TAGE = 120;

/** Was der Server je Einteilung durchsetzt (Schlüssel im Befundkatalog). Dazu
    schutzWeich (Nachprüfung WP-11): etwa ein Einsatz 20–23 Uhr ab 16 Jahren
    ohne Einstellung „mehrschichtig" — Achtung, bestätigungspflichtig. */
export const SERVER_REGELN = Object.freeze(["bestand", "schutz", "schutzWeich", "keineNacht", "keinAlleindienst", "maxDiensteWoche",
  "qualifikationGesetzlich", "qualifikationBetrieblich", "kompetenz", "ruhezeitGesetz", "ruhezeitBetrieb",
  "tagesgrenze", "untergrenze"]);

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (w) => (Array.isArray(w) ? w : []).filter(istObjekt);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const frei = (w) => w === "-" || w === "" || w === null || w === undefined;
const hat = (o, f) => !!o && Object.prototype.hasOwnProperty.call(o, f);

/** Der Text eines Befunds in der 409-Antwort: aus dem Katalog; für die
    Schutzprüfung immer derselbe neutrale (keine Fundstelle, kein Merkmal). */
const neutralerText = (regel) => (/^schutz/.test(regel) ? BEFUND_KATALOG.schutz.text : befundText(regel));

/** „Nicht im Bestand" — dieselbe Regel wie imDienst in der Oberfläche. */
export function nichtImBestand(p, d) { return !imDienst(p, d); }

/**
 * Die sperrenden Befunde aus der Schutzprüfung und dem Beschäftigungs-
 * verhältnis — für eine Bestätigung, die das Protokoll prüft (rechte.mjs).
 * @param {any} person
 * @param {any} dienstart
 * @param {string} datum
 * @param {any} [einst] Einstellungen des Betriebs (jugendschutz.mehrschichtig)
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

/** Hat die Übermittlung etwas geändert, das Einteilungen mittelbar verschiebt? */
function planStrukturGeaendert(altM, neuM) {
  for (const f of ["dienstarten", "zyklus", "anker", "einheiten"])
    if (hat(neuM, f) && !gleich(altM[f], neuM[f])) return true;
  const alt = new Map(liste(altM.personen).map((p) => [String(p.id), p]));
  for (const p of liste(neuM.personen)) {
    const a = alt.get(String(p.id));
    if (!a) continue;
    for (const f of ["zugehoerigkeit", "springer", "imSchichtdienst", "teilzeit", "wochenstunden", "eintritt", "austritt", "status"])
      if (!gleich(a[f], p[f])) return true;
  }
  return false;
}

/* Tagesnummern ohne Zeitzone, zwischengespeichert (N1). */
const TAGNR = new Map();
const tagNr = (s) => { let n = TAGNR.get(s); if (n === undefined) { n = Math.round(tagUTC(s) / 86400000); if (TAGNR.size > 5000) TAGNR.clear(); TAGNR.set(s, n); } return n; };

/**
 * Planrechnung eines Betriebsstands mit Verzeichnissen: Dienst je Person und
 * Tag (Abweichung, sonst Schichtfolge der Einheit mit Teilzeit; Abwesenheit
 * und außerhalb des Beschäftigungsverhältnisses frei — wie dienstAm in
 * fachpruefung.mjs), Besetzung je Tag. Ein Durchlauf über Abweichungen und
 * Abwesenheiten statt eines Schlüssels je Person und Tag (N1).
 */
function planrechner(m, personen) {
  const abw = new Map();                                                     // pid → Map(tag → wert)
  const quelle = istObjekt(m.abweichungen) ? m.abweichungen : {};
  for (const k in quelle) {
    const n = k.length - 11;
    if (n <= 0 || k.charCodeAt(n) !== 124) continue;                       // „|"
    const pid = k.slice(0, n);
    let tage = abw.get(pid);
    if (!tage) { tage = new Map(); abw.set(pid, tage); }
    tage.set(k.slice(n + 1), quelle[k]);
  }
  const fehlt = new Map();                                                   // pid → [{von, bis}]
  for (const a of liste(m.abwesenheiten)) {
    const pid = String(a.personId);
    if (!fehlt.has(pid)) fehlt.set(pid, []);
    fehlt.get(pid).push(a);
  }
  const folge = new Map();                                                   // eid → Map(tag → Dienst der Schichtfolge)
  const folgeAm = (eid, d) => {
    let je = folge.get(eid);
    if (!je) { je = new Map(); folge.set(eid, je); }
    let v = je.get(d);
    if (v === undefined) { v = einheitDienst(m, eid, d); je.set(d, v); }
    return v;
  };
  const dienste = new Map();                                                 // pid → Map(tag → id|null)
  const am = (p, d) => {
    const pid = String(p.id);
    let je = dienste.get(pid);
    if (!je) { je = new Map(); dienste.set(pid, je); }
    let v = je.get(d);
    if (v !== undefined) return v;
    v = null;
    if (imDienst(p, d)) {
      const t = abw.get(pid);
      const ab = t ? t.get(d) : undefined;
      let basis;
      if (ab !== undefined) basis = frei(ab) ? null : ab;
      else {
        const eid = einheitAm(p, d);
        basis = eid && !p.springer && p.imSchichtdienst !== false ? teilzeitDienst(m, p, d, folgeAm(eid, d)) : null;
      }
      const ab2 = basis ? fehlt.get(pid) : undefined;
      if (basis && !(ab2 && ab2.some((a) => a.von <= d && a.bis >= d))) v = basis;
    }
    je.set(d, v);
    return v;
  };
  const besetzung = new Map();
  const tag = (d) => {
    if (!besetzung.has(d)) {
      const je = new Map();
      for (const p of personen) { const id = am(p, d); if (id) { if (!je.has(String(id))) je.set(String(id), []); je.get(String(id)).push(p); } }
      besetzung.set(d, je);
    }
    return besetzung.get(d);
  };
  const alleinOhnePartner = (p, d, daId) => !(tag(d).get(String(daId)) || [])
    .some((x) => String(x.id) !== String(p.id) && !(x.einschraenkungen && x.einschraenkungen.keinAlleindienst));
  return { am, tag, alleinOhnePartner };
}

/**
 * Die zuletzt gemessene Laufzeit der Prüfung (Nachprüfung WP-11, N1) —
 * rechte.mjs protokolliert sie, wenn nachgerechnet wurde. Ohne Personenbezug.
 * @type {null | { ms: number, mittelbar: boolean, personen: number, geprueft: number }}
 */
export let letzteLaufzeit = null;

/** Name einer Person für eine Meldung — ohne jedes Merkmal. */
const nameVon = (p) => (p ? [p.vorname, p.nachname].filter(Boolean).join(" ") || String(p.id) : "unbekannt");

/**
 * Prüft eine Übermittlung — ausdrücklich und mittelbar (siehe oben).
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter, schon zusammengeführter Betrieb
 * @param {string} [heute] JJJJ-MM-TT
 * @returns {null | { sperre?: string, warnungen?: { personId: any, datum: string, dienstId: any, befunde: { regel: string, stufe: string, text: string }[] }[] }}
 */
export function fachpruefungUebermittlung(altM, neuM, heute = new Date().toISOString().slice(0, 10)) {
  const t0 = performance.now();
  const zaehler = { mittelbar: false, personen: 0, geprueft: 0 };
  try {
    return pruefen(altM, neuM, heute, zaehler);
  } finally {
    letzteLaufzeit = { ms: Math.round((performance.now() - t0) * 10) / 10, ...zaehler };
  }
}

/**
 * @param {any} altM
 * @param {any} neuM
 * @param {string} heute
 * @param {{ mittelbar: boolean, personen: number, geprueft: number }} zaehler
 * @returns {null | { sperre?: string, warnungen?: any[] }}
 */
function pruefen(altM, neuM, heute, zaehler) {
  if (!istObjekt(neuM)) return null;
  const altAbw = istObjekt(altM && altM.abweichungen) ? altM.abweichungen : {};
  const neuAbw = istObjekt(neuM.abweichungen) ? neuM.abweichungen : altAbw;
  const mAlt = { ...(altM || {}), abweichungen: altAbw };
  const mNeu = { ...(altM || {}), ...neuM, abweichungen: neuAbw };
  const personenAlt = liste(mAlt.personen), personenNeu = liste(mNeu.personen);
  const altNach = new Map(personenAlt.map((p) => [String(p.id), p]));
  const neuNach = new Map(personenNeu.map((p) => [String(p.id), p]));
  const daNeu = new Map(liste(mNeu.dienstarten).map((d) => [String(d.id), d]));
  const daAlt = new Map(liste(mAlt.dienstarten).map((d) => [String(d.id), d]));
  const hatZeiten = (da) => !!da && typeof da.start === "string" && typeof da.ende === "string";

  /* 0. Eine noch verwendete Dienstart löschen (N1) — für alle Personen gleich. */
  if (altM && hat(neuM, "dienstarten")) {
    const weg = new Set([...daAlt.keys()].filter((id) => !daNeu.has(id)));
    if (weg.size) {
      const name = (id) => { const d = daAlt.get(String(id)); return (d && d.name) || String(id); };
      const zyklus = mNeu.zyklus;
      const inFolge = zyklus && Array.isArray(zyklus.tage) ? zyklus.tage.find((t) => weg.has(String(t))) : undefined;
      if (inFolge !== undefined)
        return { sperre: `Die Dienstart „${name(inFolge)}" wird noch verwendet (Schichtfolge). Erst die Schichtfolge ändern, dann löschen.` };
      let erster = null;
      for (const k in neuAbw) {
        if (!hat(neuAbw, k) || !weg.has(String(neuAbw[k]))) continue;
        const [pid, tag] = String(k).split("|");
        if (!TAG.test(tag || "") || tag < heute) continue;
        if (!erster || tag < erster.tag) erster = { pid, tag, wert: neuAbw[k] };
      }
      if (erster)
        return { sperre: `Die Dienstart „${name(erster.wert)}" wird noch verwendet (${nameVon(neuNach.get(String(erster.pid)) || altNach.get(String(erster.pid)))}, ${erster.tag}). Erst umplanen, dann löschen.` };
    }
  }

  const rA = planrechner(mAlt, personenAlt), rN = planrechner(mNeu, personenNeu);
  const kA = { dienstAm: rA.am, alleinOhnePartner: rA.alleinOhnePartner, heute };
  const kN = { dienstAm: rN.am, alleinOhnePartner: rN.alleinOhnePartner, heute };

  /* Welche Einteilungen sind zu prüfen? */
  const zellen = new Map();                                                  // "pid|tag" → ausdrücklicher Wert oder undefined
  if (neuAbw !== altAbw) for (const k in neuAbw) {                           // ohne Zwischenliste (N1)
    if (!hat(neuAbw, k)) continue;
    const wert = neuAbw[k];
    if (altAbw[k] === wert) continue;
    const [pid, tag] = String(k).split("|");
    if (!TAG.test(tag || "") || !neuNach.has(String(pid))) continue;       // darüber urteilen die Rollenprüfungen
    if (!frei(wert) && !daNeu.has(String(wert)))
      return { sperre: `Einteilung am ${tag} nicht möglich: Die Dienstart ist nicht bekannt.` };   // fail-closed
    zellen.set(`${pid}|${tag}`, wert);
  }
  const struktur = [];                                                       // [Person, Tag] — mittelbar zu prüfen
  const strukturell = !!altM && planStrukturGeaendert(mAlt, neuM);
  zaehler.mittelbar = strukturell;
  if (strukturell) {
    /* Nur Einteilungen, an denen sich etwas geändert haben kann: eigener
       Dienst oder Dienstart, Dienste zwei Tage davor und danach (Ruhezeit),
       die Kalenderwoche (Höchstzahl), die Person selbst, das Bundesland der
       Einheit; „kein Alleindienst" immer. Ändern sich Vorgaben des Betriebs
       (Qualifikationen, Kompetenzen, Einstellungen, Standorte), wird alles
       gerechnet. */
    const vorgabenGleich = ["qualifikationen", "kompetenzen", "betriebsmittel", "einstellungen", "standorte", "bundesland"]
      .every((f) => !hat(neuM, f) || gleich(mAlt[f], neuM[f]));
    const daGleich = new Map();
    const dienstartGleich = (id) => {
      if (id === null) return true;
      const k = String(id);
      if (!daGleich.has(k)) daGleich.set(k, gleich(daAlt.get(k), daNeu.get(k)));
      return daGleich.get(k);
    };
    const horizont = Array.from({ length: SCHUTZ_HORIZONT_TAGE + 1 }, (_, i) => addDays(heute, i));
    const umfeld = Array.from({ length: SCHUTZ_HORIZONT_TAGE + 15 }, (_, i) => addDays(heute, i - 7));   // Woche und ±2 Tage
    for (const p of personenNeu) {
      zaehler.personen++;
      const pA = altNach.get(String(p.id));
      const personGleich = !!pA && (pA === p || gleich(pA, p));
      const allein = !!(p.einschraenkungen && p.einschraenkungen.keinAlleindienst);
      /* je Tag des Umfelds: derselbe Dienst mit derselben Dienstart? */
      const gleichAm = personGleich && vorgabenGleich && !allein
        ? umfeld.map((d) => { const n = rN.am(p, d), a = rA.am(pA, d); return String(n) === String(a) && dienstartGleich(n); })
        : null;
      for (let i = 0; i < horizont.length; i++) {
        const d = horizont[i];
        if (zellen.size && zellen.has(`${p.id}|${d}`)) continue;
        if (gleichAm) {
          const j = i + 7;
          const wt = (tagNr(d) + 3) % 7;                                     // Montag = 0 (der 1.1.1970 war ein Donnerstag)
          let ruhig = gleichAm[j - 2] && gleichAm[j - 1] && gleichAm[j] && gleichAm[j + 1] && gleichAm[j + 2];
          for (let w = j - wt; ruhig && w <= j - wt + 6; w++) ruhig = gleichAm[w];
          if (ruhig && landFuerEinheit(mAlt, einheitAm(pA, d)) === landFuerEinheit(mNeu, einheitAm(p, d))) continue;
        }
        if (!rN.am(p, d)) continue;                                          // kein Dienst: nichts zu prüfen
        struktur.push([p, d]);
      }
    }
  }
  if (!zellen.size && !struktur.length) return null;

  /* Tage mit ausdrücklichen Änderungen: dort auch die Kolleginnen mit
     „kein Alleindienst" — ihnen kann der Partner weggenommen worden sein. */
  if (!strukturell) {
    const allein = personenNeu.filter((p) => p.einschraenkungen && p.einschraenkungen.keinAlleindienst);
    if (allein.length)
      for (const k of [...zellen.keys()]) {
        const tag = k.slice(k.lastIndexOf("|") + 1);
        for (const p of allein) if (!zellen.has(`${p.id}|${tag}`)) zellen.set(`${p.id}|${tag}`, undefined);
      }
  }

  const funde = new Map();                                                   // "pid|tag" → { personId, datum, dienstId, befunde }
  const dazu = (pid, datum, dienstId, b) => {
    const k = `${pid}|${datum}`;
    if (!funde.has(k)) funde.set(k, { personId: neuNach.get(String(pid)) ? neuNach.get(String(pid)).id : pid, datum, dienstId, befunde: [] });
    const f = funde.get(k);
    if (!f.befunde.some((x) => x.regel === b.regel)) f.befunde.push(b);
  };

  /** Eine Einteilung prüfen; zurück kommt eine Absage oder null. */
  const zelle = (p, d, ausdruecklich) => {
    const id = ausdruecklich !== undefined ? (frei(ausdruecklich) ? null : ausdruecklich) : rN.am(p, d);
    if (!id) return null;
    const da = daNeu.get(String(id));
    if (!da) return { sperre: `Einteilung am ${d} nicht möglich: Die Dienstart ist nicht bekannt.` };
    if (!hatZeiten(da)) return null;
    zaehler.geprueft++;
    const neu = einteilungsBefunde(mNeu, p, da, d, kN).filter((b) => SERVER_REGELN.includes(b.regel));
    if (!neu.length) return null;
    const pid = String(p.id);
    const pA = altNach.get(pid);
    const idA = pA ? rA.am(pA, d) : null;
    const daA = idA ? daAlt.get(String(idA)) : null;
    const vorher = new Set(pA && daA && hatZeiten(daA) ? einteilungsBefunde(mAlt, pA, daA, d, kA).map((b) => b.regel) : []);
    for (const b of neu) if (!vorher.has(b.regel)) dazu(pid, d, id, { regel: b.regel, stufe: BEFUND_KATALOG[b.regel].stufe, text: neutralerText(b.regel) });
    return null;
  };
  for (const [k, ausdruecklich] of zellen) {
    const i = k.lastIndexOf("|");
    const p = neuNach.get(k.slice(0, i));
    if (!p) continue;
    const r = zelle(p, k.slice(i + 1), ausdruecklich);
    if (r) return r;
  }
  for (const [p, d] of struktur) {
    const r = zelle(p, d, undefined);
    if (r) return r;
  }

  /* Mindestbesetzung: Fällt ein Dienst durch diese Übermittlung unter die
     Vorgabe, ist das ein Befund an der Einteilung, die wegfiel. Nur, wenn
     eine Dienstart überhaupt eine Vorgabe hat. Bei einer strukturellen
     Änderung alle Tage im Horizont (auch dort, wo jemand wegfiel). */
  const mitVorgabe = [...daNeu.values(), ...daAlt.values()].some((da) => istObjekt(da.mindest));
  const tage = !mitVorgabe ? new Set()
    : strukturell ? new Set(Array.from({ length: SCHUTZ_HORIZONT_TAGE + 1 }, (_, i) => addDays(heute, i)))
      : new Set([...zellen.keys()].map((k) => k.slice(k.lastIndexOf("|") + 1)));
  for (const d of tage) {
    const alt = rA.tag(d), neu = rN.tag(d);
    for (const [id, vorher] of alt) {
      const da = daNeu.get(String(id)) || daAlt.get(String(id));
      const soll = mindestOhneFeiertag(da, d);
      const jetzt = (neu.get(String(id)) || []).length;
      if (!soll || jetzt >= soll || jetzt >= vorher.length) continue;
      const weg = vorher.filter((p) => !(neu.get(String(id)) || []).some((x) => String(x.id) === String(p.id)));
      for (const p of weg) dazu(p.id, d, id, { regel: "untergrenze", stufe: BEFUND_KATALOG.untergrenze.stufe, text: befundText("untergrenze") });
    }
  }
  if (!funde.size) return null;

  /* Sperrend: abweisen. */
  for (const f of funde.values()) {
    const s = f.befunde.find((b) => sperrtBefund(b.regel));
    if (s) return { sperre: `Einteilung am ${f.datum} nicht möglich: ${s.text}. Sperrende Regeln lassen sich nicht bestätigen.` };
  }
  /* Warnend: nur mit Bestätigung im selben Speichervorgang. */
  const altIds = new Set(liste(altM && altM.bestaetigungen).map((b) => String(b.id)));
  const neueBest = liste(neuM.bestaetigungen).filter((b) => !altIds.has(String(b.id)));
  const bestaetigt = (pid, d, regel) => neueBest.some((b) => String(b.personId) === String(pid) && b.datum === d
    && liste(b.befunde).some((x) => x.regel === regel));
  const offen = [];
  for (const f of funde.values()) {
    const fehlt = f.befunde.filter((b) => !bestaetigt(f.personId, f.datum, b.regel));
    if (fehlt.length) offen.push({ ...f, befunde: fehlt });
  }
  return offen.length ? { warnungen: offen.slice(0, 200) } : null;
}

/** Kompatibel zu WP-11: nur der Grund einer Absage (sperrend), sonst null. */
export function abweichungenSchutzPruefen(altM, neuM, heute) {
  const r = fachpruefungUebermittlung(altM, neuM, heute);
  return r && r.sperre ? r.sperre : null;
}
