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
 * @param {{von?: string}} [fenster]  Beginn des Sichtfensters
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
    aus.push({ regel: "nachtNichtZulaessig", hart: true },
      { regel: "sonntagNurMitFreigabe", hart: true });
  }
  if (p.schwerbehindert) aus.push({ regel: "ueber8hNurAbsprache", hart: false });
  const w = p.einschraenkungen && typeof p.einschraenkungen === "object" ? p.einschraenkungen.wiedereingliederung : null;
  if (w && typeof w === "object")
    aus.push({ regel: "stundengrenzeWoche", hart: false, von: w.von, bis: w.bis, wert: w.maxStundenWoche });
  return aus;
}

/** Felder, die nur abgeleitet ausgeliefert und nie gespeichert werden. */
export const ABGELEITETE_PERSONENFELDER = ["planungsregeln", "sichtbereich"];
