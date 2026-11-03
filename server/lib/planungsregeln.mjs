/* ==========================================================================
   PLANUNGSREGELN — Einsatzregeln statt Schutzmerkmale (Commit S1)

   Die Schichtverantwortung plant ihren Bereich und muss wissen, wann ein
   Einsatz unzulässig ist. Den Grund — Schwangerschaft oder Stillzeit,
   Schwerbehinderung, das Alter, eine Wiedereingliederung nach Krankheit —
   braucht sie dafür nicht. Bis Commit S1 bekam sie die Rohdaten
   (mutterschutz, schwerbehindert, geburtstag, nachtvorsorge,
   einschraenkungen.wiedereingliederung) und die Oberfläche rechnete daraus.

   Jetzt leitet der Server bei jedem Lesen aus dem vollständigen
   gespeicherten Datensatz eine Liste von Einsatzregeln ab:
     { regel, hart, von?, bis?, wert? }
   Sie wird nie gespeichert (rechte.mjs entfernt sie auf dem Schreibweg).
   Angewendet werden die Regeln je Dienst und Tag in src/regelwerk.js
   (regelBefunde) — dieselben Bedingungen und dieselbe Härte wie
   schutzBefunde. pruefungen/schutzmerkmale-sicht.test.js prüft das.

   Zeitbezug:
   - Alter: gilt bis zum Tag vor dem 18. Geburtstag; nur, wenn die Person
     im Sichtfenster noch minderjährig ist.
   - Mutterschutz und Schwerbehinderung: ohne Zeitraum — die Rohdaten
     haben keinen, erfunden wird keiner.
   - Wiedereingliederung: als neutrale Wochenstundengrenze mit von/bis.

   Restschuld (bewusst): Einzelne Regeln kommen nur aus einem Merkmal
   (Sonntag nur mit Freigabe; über 8 Stunden nur nach Absprache). Wer das
   weiß, kann zurückschließen. Härter oder weicher gemacht wird deshalb
   nichts — die Planbarkeit geht vor.

   Rein: keine Ablage, kein Datum von außen außer dem Sichtfenster.
   ========================================================================== */

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
/** Ein Kalendertag, den es gibt (kein 30.02.). */
const gueltigesDatum = (s) => typeof s === "string" && DATUM.test(s)
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Der letzte Tag vor dem Geburtstag mit `jahre` Jahren (29.2. in Nicht-Schaltjahren: 28.2.). */
export function letzterTagVorAlter(geburtstag, jahre) {
  if (typeof geburtstag !== "string" || !DATUM.test(geburtstag)) return null;
  const [j, m, t] = geburtstag.split("-").map(Number);
  const stichtag = Date.UTC(j + jahre, m - 1, t);         // 29.2. wird zum 1.3.
  return new Date(stichtag - 86400000).toISOString().slice(0, 10);
}
/** Der letzte Tag vor dem 18. Geburtstag. */
export const letzterTagMinderjaehrig = (geburtstag) => letzterTagVorAlter(geburtstag, 18);
/** Der Tag nach `tag` (JJJJ-MM-TT). */
const folgetag = (tag) => new Date(Date.parse(`${tag}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/**
 * Die Einsatzregeln einer Person.
 * @param {any} p  die gespeicherte Person (vollständig)
 * @param {{von?: string, heute?: string}} [fenster]  Beginn des Sichtfensters; heute: ab da gelten Abschnitte (Review M1)
 * @returns {Array<{regel: string, hart: boolean, von?: any, bis?: any, wert?: any}>}
 */
export function planungsregelnAbleiten(p, fenster = {}) {
  const aus = [];
  if (!p || typeof p !== "object") return aus;
  const geb = p.geburtstag || p.geburtsdatum;
  /* Fehlt das Geburtsdatum oder gibt es den Tag nicht (30.02.), ist das Alter
     nicht bewertbar (Kette A, WP-11): Für Jugendliche wären Nacht, Beginn vor
     6 Uhr und über acht Stunden unzulässig. Ein Hinweis, keine Sperre —
     dieselbe Aussage wie schutzBefunde mit Rohdaten, ohne das Merkmal. */
  if (!gueltigesDatum(geb)) aus.push({ regel: "alterNichtBewertbar", hart: false, offen: true });
  const bis = gueltigesDatum(geb) ? letzterTagMinderjaehrig(geb) : null;
  if (bis && (!fenster.von || bis >= fenster.von)) {
    /* Nachtruhe (§ 14 JArbSchG, Nachprüfung WP-11): unter 16 Jahren 20–6 Uhr,
       ab 16 Jahren 23–6 Uhr hart und 20–23 Uhr je nach Einstellung des
       Betriebs (regelBefunde). Die Grenze ist der 16. Geburtstag. */
    const bis16 = letzterTagVorAlter(geb, 16);
    if (bis16 && (!fenster.von || bis16 >= fenster.von)) aus.push({ regel: "nachtNichtZulaessig", hart: true, bis: bis16 });
    const von16 = bis16 ? folgetag(bis16) : null;
    aus.push({ regel: "nachtAb23NichtZulaessig", hart: true, ...(von16 && fenster.von && von16 <= fenster.von ? {} : { von: von16 }), bis },
      { regel: "hoechstens8hTag", hart: true, bis },
      { regel: "wochenendePruefen", hart: false, bis });
  }
  if (p.mutterschutz) {
    /* Mit Einwilligung (Nutzerentscheidung, WP-11): in ihrem Zeitraum die
       Regel mit Freigabe, außerhalb die harte — beide mit Zeitraum, ohne
       den Grund zu nennen. */
    /* Review M1 (Art. 9 DSGVO): nur Abschnitte ab heute, ohne vergangene
       Grenzen; der Regelname nennt kein Merkmal (einsatzfensterBis22). */
    const ab = fenster.heute || fenster.von || null;
    aus.push(...abHeute(nachZeitraeumen(einwilligungsZeitraeume(p, "nacht"), "nachtNichtZulaessig", "einsatzfensterBis22", true), ab),
      ...abHeute(nachZeitraeumen(einwilligungsZeitraeume(p, "sonntag"), "sonntagNurMitFreigabe", "sonntagFreigegeben", false), ab));
  }
  if (p.schwerbehindert) aus.push({ regel: "ueber8hNurAbsprache", hart: false });
  /* Einschränkung „keine Nacht“ (Nachprüfung 9717ddf, M1-Rest; 948a4ba, A1): als
     Einsatzregel mit dem Nachtfenster und der Schwelle des Betriebs — dieselbe
     Bewertung wie mit Rohdaten, kein Rechtsverbot 20–6 Uhr. Das Rohfeld geht an
     die Schichtverantwortung nicht hinaus. */
  if (p.einschraenkungen && typeof p.einschraenkungen === "object" && p.einschraenkungen.keineNacht === true)
    aus.push({ regel: "keinNachtdienst", hart: true });
  const w = p.einschraenkungen && typeof p.einschraenkungen === "object" ? p.einschraenkungen.wiedereingliederung : null;
  if (w && typeof w === "object")
    aus.push({ regel: "stundengrenzeWoche", hart: false, von: w.von, bis: w.bis, wert: w.maxStundenWoche });
  return aus;
}

/** Der Tag vor `tag` (JJJJ-MM-TT). */
const vortag = (tag) => new Date(Date.parse(`${tag}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** Die Zeiträume der Einwilligungen einer Art, sortiert und zusammengelegt; bis null = offen. */
function einwilligungsZeitraeume(p, art) {
  const l = (Array.isArray(p.mutterschutzEinwilligungen) ? p.mutterschutzEinwilligungen : [])
    .filter((e) => e && e.art === art && gueltigesDatum(e.ab) && (e.bis === null || e.bis === undefined || (gueltigesDatum(e.bis) && e.bis >= e.ab)))
    .map((e) => ({ ab: e.ab, bis: e.bis || null })).sort((a, b) => (a.ab < b.ab ? -1 : 1));
  const aus = [];
  for (const z of l) {
    const letzt = aus[aus.length - 1];
    if (letzt && (letzt.bis === null || z.ab <= folgetag(letzt.bis))) {
      if (letzt.bis !== null) letzt.bis = z.bis === null ? null : (z.bis > letzt.bis ? z.bis : letzt.bis);
    } else aus.push({ ...z });
  }
  return aus;
}

/** Nur Abschnitte, die heute oder später gelten; der erste beginnt ohne Grenze. */
function abHeute(regeln, ab) {
  if (!ab) return regeln;
  const l = regeln.filter((r) => !r.bis || r.bis >= ab);
  if (l.length && l[0].von && l[0].von <= ab) { l[0] = { ...l[0] }; delete l[0].von; }
  return l;
}

/** Harte Regel außerhalb, Regel mit Freigabe innerhalb der Zeiträume. */
function nachZeitraeumen(zeitraeume, hartRegel, freiRegel, freiHart) {
  if (!zeitraeume.length) return [{ regel: hartRegel, hart: true }];
  const aus = [];
  let von = null;                                                           // null: unbegrenzt zurück
  for (const z of zeitraeume) {
    if (von === null || von < z.ab) aus.push({ regel: hartRegel, hart: true, ...(von ? { von } : {}), bis: vortag(z.ab) });
    aus.push({ regel: freiRegel, hart: freiHart, von: z.ab, ...(z.bis ? { bis: z.bis } : {}) });
    if (!z.bis) return aus;
    von = folgetag(z.bis);
  }
  aus.push({ regel: hartRegel, hart: true, von });
  return aus;
}

/** Felder, die nur abgeleitet ausgeliefert und nie gespeichert werden. */
export const ABGELEITETE_PERSONENFELDER = ["planungsregeln", "sichtbereich"];
