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
      (Zugehörigkeit, Springer, Schichtdienst), wird für jede geschützte
      Person der Dienst der nächsten SCHUTZ_HORIZONT_TAGE Tage vorher und
      nachher berechnet (Abweichung, sonst Schichtfolge der Einheit am Tag).
      Entsteht dabei ein sperrender Befund, den es vorher nicht gab, wird
      abgewiesen. Altbestand — ein Befund, der schon vorher bestand — blockiert
      nicht.

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
import { schutzEinsatz, alterAm, addDays, pISO } from "./schutzpruefung.mjs";
import { BEFUND_KATALOG } from "./bestaetigungen.mjs";

/** Wie weit der Server mittelbare Änderungen voraus nachrechnet (Tage ab heute). */
export const SCHUTZ_HORIZONT_TAGE = 120;

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (w) => (Array.isArray(w) ? w : []).filter(istObjekt);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const zwischen = (a, b) => Math.round((pISO(b).getTime() - pISO(a).getTime()) / 86400000);

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
export function sperrendeBefunde(person, dienstart, datum) {
  const aus = [];
  if (BEFUND_KATALOG.bestand.sperrt && nichtImBestand(person, datum))
    aus.push({ regel: "bestand", text: BEFUND_KATALOG.bestand.text });
  if (BEFUND_KATALOG.schutz.sperrt && schutzEinsatz(person, dienstart, datum).some((b) => b.sperrt))
    aus.push({ regel: "schutz", text: BEFUND_KATALOG.schutz.text });
  return aus;
}

/* --- Die Schichtfolge, wie die Oberfläche sie rechnet (einheitDienst,
       einheitAm in src/App.jsx), ohne Teilzeit und Posten. --- */
function einheitAm(p, d) {
  let t = null;
  for (const z of liste(p.zugehoerigkeit)) if (z.ab <= d) t = z;
  return t ? t.einheitId : null;
}
function versatzTage(e) {
  return e.versatzTage !== undefined && e.versatzTage !== null ? e.versatzTage : (e.versatz || 0) * 7;
}
function rotationsDienst(m, eid, d) {
  const e = liste(m.einheiten).find((x) => String(x.id) === String(eid));
  if (!e || e.pool) return null;
  const tage = m.zyklus && Array.isArray(m.zyklus.tage) ? m.zyklus.tage : null;
  if (!tage || !tage.length || typeof m.anker !== "string" || !TAG.test(m.anker)) return null;
  const len = tage.length;
  const i = (((zwischen(m.anker, d) + versatzTage(e)) % len) + len) % len;
  const id = tage[i];
  return id && id !== "-" ? id : null;
}
/** Der Dienst einer Person an einem Tag: Abweichung, sonst Schichtfolge. */
export function dienstAm(m, p, d) {
  const ab = istObjekt(m.abweichungen) ? m.abweichungen[`${p.id}|${d}`] : undefined;
  if (ab !== undefined) return ab === "-" || ab === "" || ab === null ? null : ab;
  if (p.springer || p.imSchichtdienst === false) return null;
  const eid = einheitAm(p, d);
  return eid ? rotationsDienst(m, eid, d) : null;
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
    if (!a) continue;
    for (const f of ["zugehoerigkeit", "springer", "imSchichtdienst"]) if (!gleich(a[f], p[f])) return true;
  }
  return false;
}

/**
 * Prüft die neuen oder geänderten Einteilungen einer Übermittlung —
 * ausdrücklich und mittelbar (siehe oben).
 * @param {any} altM gespeicherter Betrieb
 * @param {any} neuM übermittelter, schon zusammengeführter Betrieb
 * @param {string} [heute] JJJJ-MM-TT, für Prüfungen
 * @returns {null | string} der Grund der Absage oder null
 */
export function abweichungenSchutzPruefen(altM, neuM, heute = new Date().toISOString().slice(0, 10)) {
  if (!istObjekt(neuM)) return null;
  const altAbw = istObjekt(altM && altM.abweichungen) ? altM.abweichungen : {};
  const neuAbw = istObjekt(neuM.abweichungen) ? neuM.abweichungen : altAbw;
  const personenNeu = new Map(liste(neuM.personen || (altM && altM.personen)).map((p) => [String(p.id), p]));
  const personenAlt = new Map(liste(altM && altM.personen).map((p) => [String(p.id), p]));
  const daNeu = dienstartenVon(Object.prototype.hasOwnProperty.call(neuM, "dienstarten") ? neuM : altM);
  const daAlt = dienstartenVon(altM);
  const absage = (tag, text) => `Einteilung am ${tag} nicht möglich: ${text}. Sperrende Regeln lassen sich nicht bestätigen.`;

  /* 1. Ausdrücklich gesetzte Einteilungen */
  for (const [k, wert] of Object.entries(neuAbw)) {
    if (altAbw[k] === wert) continue;                                       // unverändert
    if (wert === "-" || wert === "" || wert === null || wert === undefined) continue;   // frei
    const [pid, tag] = String(k).split("|");
    const p = personenNeu.get(String(pid)) || personenAlt.get(String(pid));
    if (!p || !TAG.test(tag || "")) continue;                               // darüber urteilen die Rollenprüfungen
    const da = daNeu.get(String(wert));
    if (!da) return absage(tag, "Die Dienstart ist nicht bekannt");        // fail-closed
    if (!hatZeiten(da)) continue;                                           // Posten ohne eigene Zeiten
    const sperre = sperrendeBefunde(p, da, tag);
    if (sperre.length) return absage(tag, sperre[0].text);
  }

  /* 2. Mittelbar: Dienstzeiten, Schichtfolge, Einheiten, Zugehörigkeit */
  if (!altM || !planStrukturGeaendert(altM, neuM)) return null;
  const mAlt = { ...altM, abweichungen: altAbw };
  const mNeu = { ...altM, ...neuM, abweichungen: neuAbw };
  for (const p of personenNeu.values()) {
    if (!geschuetzt(p, heute)) continue;
    const pAlt = personenAlt.get(String(p.id)) || p;
    for (let i = 0; i <= SCHUTZ_HORIZONT_TAGE; i++) {
      const d = addDays(heute, i);
      const idNeu = dienstAm(mNeu, p, d);
      if (!idNeu) continue;
      const da = daNeu.get(String(idNeu));
      if (!da) return absage(d, "Die Dienstart ist nicht bekannt");
      if (!hatZeiten(da)) continue;
      const neu = sperrendeBefunde(p, da, d);
      if (!neu.length) continue;
      const idAlt = dienstAm(mAlt, pAlt, d);
      const daA = idAlt ? daAlt.get(String(idAlt)) : null;
      const vorher = daA && hatZeiten(daA) ? sperrendeBefunde(pAlt, daA, d) : [];
      if (vorher.length) continue;                                          // Altbestand
      return absage(d, `${neu[0].text} (durch geänderte Dienstzeiten, Schichtfolge oder Zugehörigkeit)`);
    }
  }
  return null;
}
