/* ==========================================================================
   ÖFFNEN OHNE SCHREIBEN (WP-48-GB)

   Befund aus der Browserprüfung (WP-33): Mehrere Sitzungen verschiedener
   Rollen öffnen denselben Betrieb, niemand gibt etwas ein — und eine von
   ihnen sieht „Gleichzeitig bearbeitet". Der Dialog erscheint nur bei einer
   409-Antwort auf PUT /api/bestand; das bloße Öffnen schrieb also.

   Zwei Schreibwege liefen beim Öffnen ohne Eingabe los, beide im Kern des
   Bestands (Personen, Mitteilungen), den der Server als Ganzes abgleicht:

     1. Der Selbststart der Tour schrieb `tour: { offen: true, schritt: 0 }`
        an die eigene Person — für jede Person beim ersten Öffnen. Nötig war
        das nie: Ob die Tour steht, entscheidet die Darstellung über
        tourStartet(), der Schritt ist ohne Angabe 0. Der Zustand wird erst
        geschrieben, wenn die Person in der Tour etwas tut (tourSchritt,
        tourSchliessen, tourBeenden …). Der Effekt ist entfallen.

     2. Der Urlaubshinweis (ab Oktober, je Person einmal im Jahr) lief in
        jeder Sitzung mit vollem Schreibumfang — Leitung UND Planung. Öffnen
        beide gleichzeitig, legen beide die Hinweise an; wer als Zweiter
        speichert, bekommt den Konflikt, obwohl er nichts getan hat.
        Der Hinweis selbst ist eine echte Änderung (Pflicht des Arbeitgebers)
        und bleibt. Neu: Ein Schreibvorgang, der NUR aus diesem Lauf besteht,
        löst einen Konflikt still auf — er übernimmt den Stand des Servers
        (dort stehen die Hinweise der anderen Sitzung schon) und prüft danach
        noch einmal, ob für jemanden ein Hinweis fällig ist. Hat die Person
        seitdem etwas geändert, bleibt es beim Konfliktdialog wie bisher.

   Echte gleichzeitige Änderungen werden weiter erkannt: Der Server, der
   ETag, der Drei-Wege-Abgleich und der Dialog sind unverändert.
   ========================================================================== */
import { urlaubshinweiseFaellig, baueMitteilung } from "../lib/zustellung.js";
import { fKurz } from "../lib/datum.js";

/**
 * Inhalt des Bestands als Text, ohne `stand` und `session` (die zählt der
 * Server bzw. gehört zum Reiter), mit sortierten Schlüsseln. Zwei Bestände
 * gleichen Abbilds unterscheiden sich für den Server nicht — es gibt nichts
 * zu schreiben. (Bisher in App.jsx, unverändert.)
 */
export const abbildVon = (d) => {
  const { stand, session, ...rest } = d; // eslint-disable-line no-unused-vars
  return JSON.stringify(rest, (k, v) => v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((s) => [s, v[s]])) : v);
};

/**
 * Soll der Speicher-Effekt schreiben? Nur bei einer echten Änderung
 * gegenüber dem zuletzt geschriebenen (oder geladenen) Abbild, und nie für
 * den Betriebsrat (er kann nichts ändern; ein Versuch wäre ein 403).
 * @returns {string|null} das zu schreibende Abbild oder null
 */
export function schreibAbbild(db, zuletztGeschrieben) {
  if (!db) return null;
  const abbild = abbildVon(db);
  if (abbild === zuletztGeschrieben) return null;
  if (db.session && db.session.personId) {
    const mm = (db.mandanten || []).find((x) => x && x.id === db.session.mandantId);
    const pp = mm && (mm.personen || []).find((x) => x && x.id === db.session.personId);
    if (pp && pp.rolle === "betriebsrat") return null;
  }
  return abbild;
}

/**
 * Der Urlaubshinweis-Lauf als reine Rechnung: legt für jede Person, für die
 * er fällig ist, eine Mitteilung an und vermerkt das Datum an der Person.
 * @returns {{ bestand: any, anzahl: number } | null} null, wenn nichts fällig ist
 */
export function urlaubshinweiseAnwenden(bestand, mandantId, stichtag) {
  if (!bestand || !Array.isArray(bestand.mandanten)) return null;
  const mm = bestand.mandanten.find((x) => x && x.id === mandantId);
  if (!mm) return null;
  let faellig = [];
  try { faellig = urlaubshinweiseFaellig(mm, stichtag); } catch { return null; }
  if (!faellig.length) return null;
  const neueNachrichten = faellig.map((f) => baueMitteilung(mm, f.person.id, "urlaubVerfaellt",
    `${f.offen} ${f.offen === 1 ? "Urlaubstag" : "Urlaubstage"} verfallen zum Jahresende`,
    `${f.text} Übertragung ins nächste Jahr ist nur bei dringenden betrieblichen oder `
    + `persönlichen Gründen möglich, dann bis zum ${fKurz(f.uebertragBis)}. `
    + "Bitte plane deinen Urlaub rechtzeitig ein.",
    "meine")).filter(Boolean);
  if (!neueNachrichten.length) return null;
  return { anzahl: faellig.length, bestand: { ...bestand, mandanten: bestand.mandanten.map((x) => x.id !== mm.id ? x : {
    ...x,
    nachrichten: [...(x.nachrichten || []), ...neueNachrichten],
    personen: x.personen.map((pp) => faellig.some((f) => f.person.id === pp.id)
      ? { ...pp, urlaubshinweis: stichtag } : pp),
  }) } };
}

/**
 * Konflikt eines Schreibvorgangs, der nur aus einem automatischen Lauf beim
 * Öffnen bestand (Urlaubshinweis): still auflösen statt Dialog?
 *
 * Nur wenn (a) der geschriebene Stand genau der automatisch erzeugte war,
 * (b) die Person seitdem nichts geändert hat (lokales Abbild = geschriebenes)
 * und (c) die 409-Antwort einen Bestand mitbringt, der sich migrieren lässt
 * (speicher.js hat den ETag dieser Antwort schon übernommen; Bestand und ETag
 * gehören zusammen). Sonst null — dann bleibt es beim Konfliktdialog.
 *
 * @returns {any|null} der zu übernehmende Bestand (ohne Sitzung) oder null
 */
export function automatikKonfliktLoesen({ automatisch, geschrieben, lokal, antwort, migriere }) {
  if (!automatisch || !geschrieben || automatisch !== geschrieben) return null;
  if (!lokal || abbildVon(lokal) !== geschrieben) return null;
  if (!antwort || !antwort.bestand || typeof antwort.bestand !== "object") return null;
  const mig = migriere(antwort.bestand);
  if (!mig || !mig.ok || mig.schritte !== 0) return null;
  return mig.bestand;
}
