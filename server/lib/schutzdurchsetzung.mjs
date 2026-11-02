/* ==========================================================================
   SCHUTZ AUF DEM SERVER DURCHSETZEN (WP-11, Nachprüfung WP-10 B2)

   Bis hierher setzte nur die Oberfläche durch, dass harte Schutzregeln eine
   Einteilung sperren (Warndialog, Bewerbung, Selbstplanung, Zuschlag,
   Übernahme, Einsprung, Tausch). Wer `abweichungen` direkt über die API
   schrieb, kam vorbei.

   Jetzt prüft der Server jede neue oder geänderte Einteilung in
   `abweichungen` mit derselben Schutzprüfung wie die Oberfläche
   (schutzEinsatz, server/lib/schutzpruefung.mjs) — auf den gespeicherten
   Rohdaten der Person, die der Server immer hat. Für die Schicht-
   verantwortung, die nur Einsatzregeln sieht, ist das gleichwertig
   (pruefungen/schutzmerkmale-sicht.test.js). Sperrend sind die Befunde,
   die schutzEinsatz als sperrt kennzeichnet, und „nicht im Bestand"
   (Eintritt, Austritt, gesperrt) — beides wie in der Oberfläche.

   Noch nicht auf dem Server (eigener Schritt, braucht die Planlogik dort:
   Rotation, Besetzung, Nachtfenster des Betriebs): Ruhezeit unter 11
   Stunden, keine Nacht / kein Alleindienst / Höchstzahl Dienste aus
   einschraenkungen, gesetzliche Qualifikationen und Einweisungen.

   Bestehende Einteilungen bleiben, wie sie sind: Geprüft wird nur, was
   diese Übermittlung neu setzt oder ändert.

   Rein: keine Ablage.
   ========================================================================== */
import { schutzEinsatz } from "./schutzpruefung.mjs";
import { BEFUND_KATALOG } from "./bestaetigungen.mjs";

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

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

/**
 * Prüft die neuen oder geänderten Einteilungen einer Übermittlung.
 * @returns {null | string} der Grund der Absage oder null
 */
export function abweichungenSchutzPruefen(altM, neuM) {
  if (!istObjekt(neuM) || !istObjekt(neuM.abweichungen)) return null;
  const alt = istObjekt(altM && altM.abweichungen) ? altM.abweichungen : {};
  const personen = new Map((Array.isArray(altM && altM.personen) ? altM.personen : []).filter(istObjekt).map((p) => [String(p.id), p]));
  const dienste = new Map((Array.isArray(altM && altM.dienstarten) ? altM.dienstarten : []).filter(istObjekt).map((d) => [String(d.id), d]));
  for (const [k, wert] of Object.entries(neuM.abweichungen)) {
    if (alt[k] === wert) continue;                                        // unverändert
    if (typeof wert !== "string" && typeof wert !== "number") continue;
    const da = dienste.get(String(wert));
    if (!da || !da.start || !da.ende) continue;                           // frei, Posten oder unbekannt: kein Dienst
    const [pid, tag] = String(k).split("|");
    const p = personen.get(String(pid));
    if (!p || !TAG.test(tag || "")) continue;                             // darüber urteilen die Rollenprüfungen
    const sperre = sperrendeBefunde(p, da, tag);
    if (sperre.length)
      return `Einteilung am ${tag} nicht möglich: ${sperre[0].text}. Sperrende Regeln lassen sich nicht bestätigen.`;
  }
  return null;
}
