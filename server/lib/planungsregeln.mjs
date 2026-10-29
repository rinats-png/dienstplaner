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

/** Der letzte Tag vor dem 18. Geburtstag (29.2. in Nicht-Schaltjahren: 28.2.). */
export function letzterTagMinderjaehrig(geburtstag) {
  if (typeof geburtstag !== "string" || !DATUM.test(geburtstag)) return null;
  const [j, m, t] = geburtstag.split("-").map(Number);
  const achtzehn = Date.UTC(j + 18, m - 1, t);           // 29.2. wird zum 1.3.
  return new Date(achtzehn - 86400000).toISOString().slice(0, 10);
}

/**
 * Die Einsatzregeln einer Person.
 * @param {any} p  die gespeicherte Person (vollständig)
 * @param {{von?: string}} [fenster]  Beginn des Sichtfensters
 * @returns {Array<{regel: string, hart: boolean, von?: any, bis?: any, wert?: any}>}
 */
export function planungsregelnAbleiten(p, fenster = {}) {
  const aus = [];
  if (!p || typeof p !== "object") return aus;
  const bis = letzterTagMinderjaehrig(p.geburtstag || p.geburtsdatum);
  if (bis && (!fenster.von || bis >= fenster.von)) {
    aus.push({ regel: "nachtNichtZulaessig", hart: true, bis },
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
