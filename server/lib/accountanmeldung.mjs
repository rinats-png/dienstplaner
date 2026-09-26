/* ==========================================================================
   ANMELDUNG MIT ACCOUNT — E-Mail und Passwort

   Diese Datei beantwortet zwei Fragen und keine dritte:

     Wer ist das?            anmelden(store, { email, passwort })
     Gilt diese Sitzung?     sitzungPruefen(store, token)

   Was jemand darf, steht hier nicht. Eine Account-Sitzung ist eine
   AUTHENTIFIZIERUNG — der Beleg, dass eine E-Mail-Adresse und ein Passwort
   zusammengehören. Sie ist keine AUTORISIERUNG: Sie nennt keinen Betrieb,
   keine Rolle, keine Person, und sie berechtigt zu keinem Zugriff auf
   irgendeinen Bestand.

   Der Weg vom Account in einen Betrieb führt über eine Mitgliedschaft
   (accounts.mjs) und wird in einem eigenen, späteren Vorgang gegangen. Er
   ist in dieser Datei nicht vorbereitet, nicht angedeutet und nicht
   abkürzbar: `anmelden` liest keine Mitgliedschaft, gibt keine zurück und
   verrät nicht, ob es eine gibt.

   Warum das so scharf getrennt gehört: Die Rechtearchitektur leitet jedes
   Schreibrecht aus der Rolle der PERSON im Bestand ab (`wirksameRolle` in
   rechte.mjs). Eine Account-Sitzung trägt keine Person. Reicht sie jemand
   trotzdem in die Rechteprüfung, kommt `undefined` heraus und daraus
   `SCHREIBEN_NEIN` — kein Recht, nicht einmal Leserecht auf einen Raum.
   Genau so soll es sein, und genau das prüft eine Prüfung mit.

   ---------------------------------------------------------------------------
   Der Ablauf einer Anmeldung

     1. Adresse normalisieren (adressen.mjs). Ohne brauchbare Adresse gibt
        es nichts zu suchen.
     2. Account zur Adresse lesen — oder nicht finden.
     3. Prüfwert rechnen. IMMER, auch wenn es den Account nicht gibt oder
        er kein Passwort trägt: dann gegen einen Blindwert. Sonst
        unterscheidet die Antwortzeit „kenne ich nicht" von „falsches
        Passwort", und wer viele Adressen durchprobiert, hat am Ende die
        Kundenliste.
     4. Urteilen, in dieser Reihenfolge: unbekannt, ohne Passwort, falsches
        Passwort, gesperrt, nicht aktiv, Adresse unbestätigt. Das Passwort
        zuerst, damit niemand ohne richtiges Passwort etwas über den
        Zustand eines Kontos erfährt — auch nicht über einen Umweg.
     5. Sitzung anlegen (accountsitzungen.mjs), mit der Epoche des Kontos.
     6. Zeitpunkt der Anmeldung vermerken — nachgelagert und bestenfalls:
        Ein Fehler dabei darf eine gelungene Anmeldung nicht kippen.

   Nach außen gibt es genau einen Hinweis für jede Absage. Der `grund` ist
   für das Protokoll, nicht für eine Antwort: „gesperrt" oder „unbestaetigt"
   an den Klienten zu geben, wäre die Auskunft, dass es dieses Konto gibt.
   Die Ebene darüber (später der Endpunkt) reicht ausschließlich `hinweis`
   heraus.

   ---------------------------------------------------------------------------
   Kein stilles Neurechnen des Prüfwerts

   `veraltet()` (passwoerter.mjs) könnte bei jeder Anmeldung sagen, dass
   ein Prüfwert mit alten Kennwerten liegt. Diese Datei rechnet ihn
   trotzdem nicht neu: Der Weg dazu wäre `passwortSetzen`, und das erhöht
   die Epoche — die Anmeldung würde jede andere Sitzung desselben Menschen
   beenden, mitten in der Arbeit, ohne Anlass. Ein Neurechnen braucht einen
   eigenen Weg, der die Epoche nicht anfasst. Solange es den nicht gibt,
   bleibt der Prüfwert, wie er ist.

   ---------------------------------------------------------------------------
   Gleichzeitigkeit und ihre Grenze

   Zwei Anmeldungen desselben Menschen stören sich nicht: Jede legt ihren
   eigenen Datensatz unter einem eigenen, zufälligen Schlüssel an. Zwei
   Abmeldungen desselben Merkmals stören sich auch nicht — Löschen ist
   wiederholbar, und ein unbekanntes Merkmal ist kein Fehler.

   Der einzige gemeinsam beschriebene Datensatz ist der Account selbst
   (`letzteAnmeldung`), und accounts.mjs serialisiert ihn je Schlüssel. Wie
   überall in dieser Anwendung gilt dabei: Die Reihe ist prozesslokal und
   trägt EINEN schreibenden Prozess. Bei mehreren Instanzen bräuchte die
   Ablage bedingtes Schreiben. Für Sitzungen ist das kein Problem — sie
   werden nie gemeinsam beschrieben —, für `letzteAnmeldung` wäre der
   schlimmste Ausgang ein verlorener Zeitstempel.

   ---------------------------------------------------------------------------
   Was hier NICHT ist

   Kein HTTP, keine Route, kein Cookie, keine Bremse, kein Protokoll. Diese
   Datei kennt keine Anfrage. Die Bremse gehört zum Endpunkt und muss dort
   mit einer ausdrücklich eingetragenen Bremsart kommen (schutz.mjs) —
   ohne Endpunkt gibt es nichts zu bremsen, und eine Bremsart ohne Aufrufer
   wäre eine Zusage ohne Deckung.

   Für ein späteres HttpOnly-Cookie ist alles vorbereitet und nichts
   entschieden: Das Merkmal ist cookie-taugliches base64url
   (accountsitzungen.mjs), der Server prüft die Herkunft
   zustandsveränderlicher Anfragen schon heute (`herkunftErlaubt` in
   schutz.mjs) — das ist die Grundlage, auf der ein Cookie ohne CSRF-Loch
   möglich wird. Solange das Merkmal im Kopf `authorization` steht, schickt
   ein fremdes Blatt es nicht mit.
   ========================================================================== */

import { randomBytes } from "node:crypto";
import { mailNormieren, mailBrauchbar } from "./adressen.mjs";
import { passwortPruefen, passwortAblegen } from "./passwoerter.mjs";
import {
  accountLesenPerMail, accountLesenPerId, anmeldungVermerken,
} from "./accounts.mjs";
import {
  accountSitzungAnlegen, accountSitzungLesen, accountSitzungBeenden,
  accountSitzungenBeenden,
} from "./accountsitzungen.mjs";

/** Der eine Satz für jede fehlgeschlagene Anmeldung. Er unterscheidet
    nicht zwischen unbekannter Adresse, falschem Passwort, gesperrtem und
    unbestätigtem Konto — jede Unterscheidung wäre eine Auskunft darüber,
    wer hier Kunde ist. */
export const HINWEIS_ANMELDUNG =
  "E-Mail-Adresse oder Passwort stimmen nicht.";

/** Wenn die Anmeldung selbst gelungen ist und danach die Ablage streikt.
    Diesen Satz sieht nur, wer die richtigen Angaben hatte — er verrät
    deshalb nichts. */
export const HINWEIS_SPEICHERN =
  "Das hat gerade nicht geklappt. Bitte versuche es noch einmal.";

/** Der Satz für eine Sitzung, die nicht mehr gilt. Auch er ist einer für
    alle Gründe: abgelaufen, untätig, entwertet, gesperrt. */
export const HINWEIS_SITZUNG =
  "Die Sitzung ist abgelaufen. Bitte melde dich neu an.";

/* --------------------------------------------------------------------------
   DER BLINDWERT

   Ein echter scrypt-Prüfwert über ein Zufallspasswort, das niemand kennt
   und das nirgends steht. Gegen ihn wird gerechnet, wenn es den Account
   nicht gibt oder er kein Passwort trägt: dieselbe Funktion, dieselben
   Kennwerte, dieselbe Rechenzeit. Das Ergebnis ist immer falsch — darauf
   kommt es nicht an, sondern darauf, dass es genauso lange dauert.

   Erst bei Bedarf gerechnet und dann behalten: Beim Start des Prozesses
   wäre es eine halbe Sekunde Verzögerung für einen Wert, den vielleicht
   niemand braucht.
   -------------------------------------------------------------------------- */
let blindwert = null;

async function blind() {
  if (!blindwert) blindwert = await passwortAblegen(randomBytes(24).toString("base64url"));
  return blindwert;
}

/** Trägt dieser Account einen Prüfwert im heutigen Format? */
const hatPruefwert = (konto) =>
  !!konto && typeof konto.passwort === "string" && konto.passwort.startsWith("s1$");

/**
 * Meldet einen Account an.
 *
 * @param {object} store  Ablage „centric" — dort liegen die Accounts
 * @param {{email?: unknown, passwort?: unknown, jetzt?: () => number,
 *          sitzungsAblage?: (object|null)}} [o]
 * @returns {Promise<{ok: true, token: string, gueltigBis: number,
 *     accountId: string, epoche: number}
 *   |{ok: false, grund: string, hinweis: string}>}
 */
export async function anmelden(store, { email, passwort, jetzt = Date.now,
  sitzungsAblage = null } = {}) {
  /** @type {(grund: string) => {ok: false, grund: string, hinweis: string}} */
  const absage = (grund) => ({ ok: false, grund, hinweis: HINWEIS_ANMELDUNG });

  const emailNorm = mailNormieren(email);
  /* Eine unbrauchbare Adresse kostet keinen scrypt-Durchlauf: Es gibt
     keinen Account, den sie treffen könnte, und die Antwortzeit verrät
     hier nur, dass die Eingabe keine Adresse war — nichts über einen
     Bestand. Andersherum wäre jeder Unsinn eine halbe Sekunde Rechenzeit,
     und das ist ein Angriff auf den Server. */
  if (!mailBrauchbar(emailNorm)) return absage("adresse");

  const konto = await accountLesenPerMail(store, emailNorm).catch(() => null);

  /* Immer rechnen, dann urteilen. */
  const gegen = hatPruefwert(konto) ? konto.passwort : await blind();
  const stimmt = await passwortPruefen(
    typeof passwort === "string" ? passwort : "", gegen);

  if (!konto) return absage("unbekannt");
  if (!hatPruefwert(konto)) return absage("ohne-passwort");
  if (!stimmt) return absage("passwort");
  if (konto.status === "gesperrt") return absage("gesperrt");
  /* „eingeladen" heißt: Es gibt den Platz, aber noch niemanden darauf.
     Ein Passwort allein macht daraus keine Anmeldung. */
  if (konto.status !== "aktiv") return absage("nicht-aktiv");
  if (!konto.emailVerifiziertAm) return absage("unbestaetigt");

  const epoche = Number(konto.epoche) || 1;
  const sitzung = await accountSitzungAnlegen({ accountId: konto.id, epoche },
    { jetzt, ablage: sitzungsAblage });
  if (!sitzung.ok) {
    /* Ohne Sitzung keine Anmeldung. Kein halbes Ergebnis, kein Merkmal,
       das später doch noch gilt. */
    return { ok: false,
      grund: "grund" in sitzung ? String(sitzung.grund) : "speichern",
      hinweis: HINWEIS_SPEICHERN };
  }

  /* Nachgelagert und bestenfalls: Der Zeitstempel ist eine Auskunft für
     den Menschen, kein Teil der Anmeldung. */
  try { await anmeldungVermerken(store, konto.id); } catch { /* egal */ }

  return { ok: true, token: sitzung.token, gueltigBis: sitzung.gueltigBis,
    accountId: konto.id, epoche };
}

/**
 * Prüft eine Account-Sitzung.
 *
 * Die Antwort ist eine Identität und nichts weiter: `accountId`, die
 * Epoche und die Zeiten. Kein Raum, keine Rolle, keine Mitgliedschaft —
 * wer das braucht, holt es sich ausdrücklich über accounts.mjs und muss
 * dabei einen Raum nennen.
 *
 * Vier Dinge machen eine Sitzung ungültig, und drei davon prüft erst diese
 * Ebene, weil sie den Account braucht:
 *
 *     Frist / Untätigkeit    accountsitzungen.mjs
 *     Account verschwunden   hier
 *     Account gesperrt       hier
 *     Epoche überholt        hier — jede Passwortänderung erhöht sie
 *
 * Eine ungültige Sitzung wird gelöscht. Ein Merkmal, das einmal nicht mehr
 * gilt, soll nie wieder gelten — auch nicht, wenn eine Sperre später
 * aufgehoben würde.
 *
 * @param {object} store  Ablage „centric"
 * @param {unknown} token
 * @param {{jetzt?: () => number, sitzungsAblage?: (object|null)}} [o]
 * @returns {Promise<{ok: true, accountId: string, epoche: number,
 *     seit: number, bis: number}
 *   |{ok: false, grund: string, hinweis: string}>}
 */
export async function sitzungPruefen(store, token, { jetzt = Date.now,
  sitzungsAblage = null } = {}) {
  /** @type {(grund: string) => {ok: false, grund: string, hinweis: string}} */
  const absage = (grund) => ({ ok: false, grund, hinweis: HINWEIS_SITZUNG });

  const gelesen = await accountSitzungLesen(token,
    { jetzt, ablage: sitzungsAblage });
  if (!gelesen.sitzung) return absage(gelesen.grund || "unbekannt");
  const s = gelesen.sitzung;

  const konto = await accountLesenPerId(store, s.accountId).catch(() => null);
  const schluss = async (grund) => {
    await accountSitzungBeenden(token, { ablage: sitzungsAblage });
    return absage(grund);
  };
  if (!konto) return schluss("unbekannt");
  if (konto.status === "gesperrt") return schluss("gesperrt");
  if (konto.status !== "aktiv") return schluss("nicht-aktiv");
  if ((Number(konto.epoche) || 1) !== Number(s.epoche)) return schluss("epoche");

  return { ok: true, accountId: konto.id, epoche: Number(s.epoche),
    seit: Number(s.seit), bis: Number(s.bis) };
}

/**
 * Abmelden. Gelingt immer — auch mit einem Merkmal, das es nie gab.
 * @param {unknown} token
 * @param {{sitzungsAblage?: (object|null)}} [o]
 * @returns {Promise<{ok: true}>}
 */
export async function abmelden(token, { sitzungsAblage = null } = {}) {
  await accountSitzungBeenden(token, { ablage: sitzungsAblage });
  return { ok: true };
}

/**
 * Überall abmelden — alle Sitzungen dieses Accounts beenden.
 *
 * Gedacht für eine Sperre, die sofort wirken soll, und für „von allen
 * Geräten abmelden". Die Epochenprüfung in `sitzungPruefen` würde die
 * Sitzungen ohnehin abweisen; dies räumt sie zusätzlich weg, statt sie bis
 * zum Ablauf liegen zu lassen.
 *
 * @param {string} accountId
 * @param {{sitzungsAblage?: (object|null)}} [o]
 * @returns {Promise<{ok: true, beendet: number, fehler: number}>}
 */
export async function ueberallAbmelden(accountId, { sitzungsAblage = null } = {}) {
  const e = await accountSitzungenBeenden(accountId, { ablage: sitzungsAblage });
  return { ok: true, beendet: e.beendet, fehler: e.fehler };
}
