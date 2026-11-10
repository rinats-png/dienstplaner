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
  accountLesenPerMail, accountLesenPerId, anmeldungVermerken, accountAendern,
} from "./accounts.mjs";
import { zweifaktorAbschalten } from "./zweifaktor.mjs";
import {
  accountSitzungAnlegen, accountSitzungLesen, accountSitzungBeenden,
  accountSitzungenBeenden, accountSitzungsId,
} from "./accountsitzungen.mjs";
import { arbeitssitzungenBeenden } from "./arbeitssitzung.mjs";
import {
  kontoFaktorId, kontoFaktorStand, kontoFaktorBeginnen, kontoFaktorVorpruefen,
  kontoFaktorBestaetigen, kontoFaktorPruefen,
} from "./kontofaktor.mjs";

/** OPT-1-F: Passwort richtig, aber für dieses Konto ist ein zweiter Faktor
    eingerichtet und er fehlt. Diesen Satz sieht nur, wer das Passwort kennt. */
export const HINWEIS_FAKTOR_FEHLT =
  "Für dieses Konto ist ein zweiter Faktor eingerichtet. Bitte den Code aus der App eingeben.";
/** OPT-1-F: Code aus der App falsch oder schon verwendet. */
export const HINWEIS_FAKTOR_FALSCH = "Der zweite Faktor stimmt nicht.";
/** OPT-1-F: Der Faktor lässt sich nicht prüfen (Ablage, Pfeffer). Keine Sitzung. */
export const HINWEIS_FAKTOR_NICHT_PRUEFBAR =
  "Der zweite Faktor lässt sich gerade nicht prüfen. Bitte später erneut versuchen.";

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
 * Die Prüfung von Adresse und Passwort — Schritte 1 bis 4 oben, ohne Sitzung.
 * Gemeinsam für die Anmeldung und für die Einrichtung des zweiten Faktors
 * (OPT-1-F): Beide verlangen denselben Nachweis, und es gibt ihn nur hier.
 *
 * @param {object} store
 * @param {{email?: unknown, passwort?: unknown}} o
 * @returns {Promise<{ok: true, konto: any}|{ok: false, grund: string, hinweis: string}>}
 */
async function zugangPruefen(store, { email, passwort }) {
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
  return { ok: true, konto };
}

/**
 * Das Tor vor jeder Prüfung eines Codes aus der App (OPT-1-F). Gestellt vom
 * Endpunkt — diese Datei kennt keine Bremse. Gerufen wird es erst, wenn das
 * Passwort stimmte: Wer nur die Adresse kennt, kann den Faktor eines anderen
 * nicht sperren. `null` heißt frei; sonst keine Prüfung.
 * @typedef {(faktorId: string) => Promise<null|{wartet?: number, nichtPruefbar?: boolean}>} FaktorTor
 */

/**
 * Prüft den zweiten Faktor eines Kontos bei der Anmeldung. Fail-closed:
 * Lesefehler, fehlender Pfeffer, Tor nicht frei — jeweils kein Ja.
 * @param {object} store
 * @param {any} konto
 * @param {unknown} zweifaktor
 * @param {FaktorTor|null} faktorTor
 * @returns {Promise<{ok: true, mitFaktor: boolean}|{ok: false, grund: string, hinweis: string, wartet?: number}>}
 */
async function faktorDerAnmeldung(store, konto, zweifaktor, faktorTor) {
  const nichtPruefbar = (grund) => ({ ok: /** @type {false} */ (false), grund,
    hinweis: HINWEIS_FAKTOR_NICHT_PRUEFBAR });
  let stand;
  try { stand = await kontoFaktorStand(store, konto.id); }
  catch { return nichtPruefbar("faktor-lesen"); }
  /* Kein Faktor eingerichtet: die Sitzung ist eine Identität ohne Faktor,
     wie bisher. Was sie darf, entscheidet die Betriebsauswahl. */
  if (!stand.aktiv) return { ok: true, mitFaktor: false };
  /* Ist der Faktor eingerichtet, verlangt JEDE Anmeldung ihn — mit oder
     ohne Pflicht. Ein Passwort allein ergibt dann keine Sitzung. */
  const code = typeof zweifaktor === "string" ? zweifaktor.trim() : "";
  if (!code) return { ok: false, grund: "zweifaktor-erforderlich", hinweis: HINWEIS_FAKTOR_FEHLT };
  if (faktorTor) {
    const t = await faktorTor(kontoFaktorId(konto.id));
    if (t && t.nichtPruefbar) return nichtPruefbar("faktor-bremse");
    if (t) return { ok: false, grund: "zweifaktor-gebremst", hinweis: HINWEIS_FAKTOR_FALSCH,
      wartet: Number(t.wartet) || 0 };
  }
  let p;
  try { p = await kontoFaktorPruefen(store, konto.id, code); }
  catch { return nichtPruefbar("faktor-lesen"); }
  if (!p.ok) {
    if (p.grund === "pfeffer") return nichtPruefbar("faktor-pfeffer");
    return { ok: false, grund: p.grund === "wiederholt" ? "zweifaktor-wiederholt" : "zweifaktor-falsch",
      hinweis: HINWEIS_FAKTOR_FALSCH };
  }
  return { ok: true, mitFaktor: true };
}

/**
 * Meldet einen Account an.
 *
 * OPT-1-F: Ist für das Konto ein zweiter Faktor eingerichtet, gehört der Code
 * aus der App (`zweifaktor`) zur Anmeldung; ohne ihn oder mit falschem Code
 * entsteht keine Sitzung. Bestanden, trägt die Sitzung `zweifaktor: true` —
 * die einzige Grundlage, auf der die Betriebsauswahl unter Pflicht eine
 * Leitungs-, Planungs- oder Kundensitzung öffnet.
 *
 * @param {object} store  Ablage „centric" — dort liegen die Accounts
 * @param {{email?: unknown, passwort?: unknown, zweifaktor?: unknown,
 *          faktorTor?: (FaktorTor|null), jetzt?: () => number,
 *          sitzungsAblage?: (object|null)}} [o]
 * @returns {Promise<{ok: true, token: string, gueltigBis: number,
 *     accountId: string, epoche: number, zweifaktor?: true}
 *   |{ok: false, grund: string, hinweis: string, wartet?: number}>}
 */
export async function anmelden(store, { email, passwort, zweifaktor = undefined,
  faktorTor = null, jetzt = Date.now, sitzungsAblage = null } = {}) {
  const z = await zugangPruefen(store, { email, passwort });
  if ("grund" in z) return z;
  const konto = z.konto;

  const f = await faktorDerAnmeldung(store, konto, zweifaktor, faktorTor);
  if ("grund" in f) return f;

  const epoche = Number(konto.epoche) || 1;
  const sitzung = await accountSitzungAnlegen(
    { accountId: konto.id, epoche, ...(f.mitFaktor ? { zweifaktor: true } : {}) },
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
    accountId: konto.id, epoche, ...(f.mitFaktor ? { zweifaktor: /** @type {true} */ (true) } : {}) };
}

/** Die Aktionen am zweiten Faktor eines Kontos. Kein Abschalten: Wechsel und
    Verlust gehören zur Wiederherstellung (WR-2 bis WR-9), nicht hierher. */
export const KONTO_FAKTOR_AKTIONEN = Object.freeze(["stand", "beginnen", "bestaetigen"]);

/**
 * Den zweiten Faktor eines Kontos einrichten (OPT-1-F).
 *
 * Ausweis ist dasselbe wie bei der Anmeldung — Adresse und Passwort —, nicht
 * das Cookie: Wer nur ein abgegriffenes Sitzungsmerkmal hat, richtet hier
 * nichts ein (dasselbe Muster wie bei Zugangscodes, betreiber-zweifaktor.mjs).
 *
 *   stand        aktiv/ausstehend, sonst nichts
 *   beginnen     Geheimnis und otpauth-Adresse, genau einmal. Ein aktiver
 *                Faktor oder eine laufende Einrichtung wird nicht
 *                überschrieben.
 *   bestaetigen  erster Code aus der App. Reihenfolge, fail-closed:
 *                1. Code prüfen, ohne zu speichern,
 *                2. ALLE Sitzungen des Kontos beenden (samt Arbeitssitzungen) —
 *                   scheitert das, wird nicht aktiviert,
 *                3. aktivieren,
 *                4. Epoche des Kontos erhöhen (entwertet jede vorher angelegte
 *                   Sitzung) und noch einmal beenden (was dazwischen entstand) —
 *                   scheitert eins davon, wird die Aktivierung zurückgenommen
 *                   und abgewiesen.
 *                Danach gilt nur noch Passwort plus Code aus der App.
 *
 * Es entsteht nie eine Sitzung. Codes und Geheimnis stehen nur im
 * Rückgabewert, nie in einem Protokoll.
 *
 * @param {object} store
 * @param {{email?: unknown, passwort?: unknown, aktion?: unknown, zweifaktor?: unknown,
 *   faktorTor?: (FaktorTor|null), sitzungsAblage?: (object|null)}} o
 * @returns {Promise<{ok: true, daten: Record<string, unknown>, sitzungenBeendet?: number}
 *   |{ok: false, grund: string, hinweis: string, wartet?: number}>}
 */
export async function kontoFaktorAktion(store, { email, passwort, aktion, zweifaktor,
  faktorTor = null, sitzungsAblage = null } = {}) {
  const z = await zugangPruefen(store, { email, passwort });
  if ("grund" in z) return z;
  const id = z.konto.id;
  const nein = (grund, hinweis) => ({ ok: /** @type {false} */ (false), grund, hinweis });
  const nichtPruefbar = (grund) => nein(grund, HINWEIS_FAKTOR_NICHT_PRUEFBAR);
  const a = typeof aktion === "string" ? aktion : "";
  if (!KONTO_FAKTOR_AKTIONEN.includes(a))
    return nein("aktion-unbekannt", `Unbekannte Aktion. Erlaubt: ${KONTO_FAKTOR_AKTIONEN.join(", ")}.`);

  let stand;
  try { stand = await kontoFaktorStand(store, id); } catch { return nichtPruefbar("faktor-lesen"); }

  if (a === "stand") return { ok: true, daten: { aktiv: stand.aktiv, ausstehend: stand.ausstehend } };

  if (a === "beginnen") {
    let e;
    try { e = await kontoFaktorBeginnen(store, id); } catch { return nichtPruefbar("faktor-lesen"); }
    const eg = "grund" in e ? e.grund : null;
    if (eg === "pfeffer") return nichtPruefbar("faktor-pfeffer");
    if (eg === "ausstehend")
      return nein("faktor-ausstehend", "Eine Einrichtung ist bereits begonnen. Bitte mit dem ersten Code "
        + "bestätigen oder nach 15 Minuten neu beginnen.");
    if (eg || !("geheimnis" in e)) return nein("faktor-aktiv", "Der zweite Faktor ist schon eingerichtet.");
    return { ok: true, daten: { geheimnis: e.geheimnis, otpauth: e.otpauth,
      hinweis: "Geheimnis und Adresse erscheinen genau einmal. In der App erfassen und mit dem ersten "
        + "Code bestätigen." } };
  }

  /* bestaetigen */
  if (stand.aktiv) return nein("faktor-aktiv", "Der zweite Faktor ist schon eingerichtet.");
  if (!stand.ausstehend) return nein("faktor-nichts", "Es ist keine Einrichtung begonnen.");
  const code = typeof zweifaktor === "string" ? zweifaktor.trim() : "";
  if (!code) return nein("zweifaktor-erforderlich", "Bitte den ersten Code aus der App angeben.");
  if (faktorTor) {
    const t = await faktorTor(kontoFaktorId(id));
    if (t && t.nichtPruefbar) return nichtPruefbar("faktor-bremse");
    if (t) return { ...nein("zweifaktor-gebremst", HINWEIS_FAKTOR_FALSCH), wartet: Number(t.wartet) || 0 };
  }
  let vor;
  try { vor = await kontoFaktorVorpruefen(store, id, code); } catch { return nichtPruefbar("faktor-lesen"); }
  if (!vor.ok && vor.grund === "pfeffer") return nichtPruefbar("faktor-pfeffer");
  if (!vor.ok) return nein("zweifaktor-falsch", HINWEIS_FAKTOR_FALSCH);
  const vorher = await ueberallAbmelden(id, { sitzungsAblage }).catch(() => ({ beendet: 0, fehler: 1 }));
  if (vorher.fehler) return nichtPruefbar("sitzungen");
  let e;
  try { e = await kontoFaktorBestaetigen(store, id, code); } catch { return nichtPruefbar("faktor-lesen"); }
  const bg = "grund" in e ? e.grund : null;
  if (bg === "pfeffer") return nichtPruefbar("faktor-pfeffer");
  if (bg || !("wiederherstellung" in e)) return nein("zweifaktor-falsch", HINWEIS_FAKTOR_FALSCH);
  /* Review OPT-1-F, Befund 3: Eine Anmeldung, die den Faktorstand vor der Aktivierung gelesen hat, hat das
     Konto (und damit die Epoche) noch früher gelesen. Die Epoche NACH der Aktivierung zu erhöhen, entwertet
     jede solche Sitzung — auch eine, die nach dem ersten Abmelden angelegt wurde. Danach räumt das zweite
     Abmelden die Sitzungen und Arbeitssitzungen weg. Scheitert eins von beiden, gilt die Einrichtung nicht:
     Der eben aktivierte Faktor wird zurückgenommen (fail-closed, keine Wiederherstellungscodes, kein „aktiv").
     Lässt sich auch das nicht, bleibt der Faktor aktiv — der strengere Zustand — und die Antwort ist trotzdem
     eine Absage. */
  const neueEpoche = await (async () => {
    const k = await accountLesenPerId(store, id);
    if (!k) return false;
    const r = await accountAendern(store, id, { epoche: (Number(k.epoche) || 1) + 1 });
    return !!(r && r.ok);
  })().catch(() => false);
  const danach = neueEpoche
    ? await ueberallAbmelden(id, { sitzungsAblage }).catch(() => ({ beendet: 0, fehler: 1 }))
    : { beendet: 0, fehler: 1 };
  if (danach.fehler) {
    await zweifaktorAbschalten(store, kontoFaktorId(id)).catch(() => {});
    return nichtPruefbar("sitzungen");
  }
  return { ok: true, sitzungenBeendet: vorher.beendet + danach.beendet,
    daten: { aktiv: true, wiederherstellung: e.wiederherstellung,
      hinweis: "Der zweite Faktor ist eingerichtet. Die Wiederherstellungscodes erscheinen genau einmal; "
        + "jeder gilt einmal. Bitte mit Passwort und Code aus der App neu anmelden." } };
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
 *     seit: number, bis: number, sitzungsId: string, zweifaktor?: true}
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

  /* Die Kennung der Sitzung — die Prüfsumme des Merkmals, nie das Merkmal. An ihr
     hängt eine Arbeitssitzung, die aus dieser Anmeldung entsteht. */
  return { ok: true, accountId: konto.id, epoche: Number(s.epoche),
    seit: Number(s.seit), bis: Number(s.bis), sitzungsId: accountSitzungsId(token),
    /* OPT-1-F: nur wenn die Anmeldung den zweiten Faktor bestanden hat. */
    ...(s.zweifaktor === true ? { zweifaktor: /** @type {true} */ (true) } : {}) };
}

/**
 * Abmelden.
 *
 * Ein Merkmal, das es nie gab, ist kein Fehler: Ein unbekannter Schlüssel
 * lässt sich löschen, und ob es eine Sitzung gab, muss niemand erfahren.
 * `ok: false` heißt deshalb genau eine Sache — die Ablage hat den Widerruf
 * nicht angenommen, die Sitzung gilt also weiter. Wer das Ergebnis
 * weiterreicht, darf es nicht in ein „abgemeldet" umdeuten.
 *
 * Mit der Account-Sitzung endet die Arbeit, die an ihr hängt: Die Arbeitssitzungen
 * dieses Geräts gelten nicht mehr (das stellt die Bindung sicher, bei jedem
 * Zugriff) und werden hier zusätzlich weggeräumt. Das Löschen der
 * Account-Sitzung ist der Widerruf; scheitert das Wegräumen, ändert das am
 * Ergebnis nichts. Ein zweites Gerät desselben Kontos bleibt unberührt.
 *
 * @param {unknown} token
 * @param {{sitzungsAblage?: (object|null)}} [o]
 * @returns {Promise<{ok: boolean}>}
 */
export async function abmelden(token, { sitzungsAblage = null } = {}) {
  const weg = await accountSitzungBeenden(token, { ablage: sitzungsAblage });
  if (weg && typeof token === "string") {
    await arbeitssitzungenBeenden(accountSitzungsId(token), { kontoAblage: sitzungsAblage })
      .catch(() => ({ beendet: 0, fehler: 1 }));
  }
  return { ok: weg };
}

/**
 * Überall abmelden — alle Sitzungen dieses Accounts beenden.
 *
 * Gedacht für eine Sperre, die sofort wirken soll, und für „von allen
 * Geräten abmelden". Die Epochenprüfung in `sitzungPruefen` würde die
 * Sitzungen ohnehin abweisen; dies räumt sie zusätzlich weg, statt sie bis
 * zum Ablauf liegen zu lassen.
 *
 * Wie beim einzelnen Abmelden endet damit auch die Arbeit, die an diesen
 * Sitzungen hängt.
 *
 * @param {string} accountId
 * @param {{sitzungsAblage?: (object|null)}} [o]
 * @returns {Promise<{ok: true, beendet: number, fehler: number}>}
 */
export async function ueberallAbmelden(accountId, { sitzungsAblage = null } = {}) {
  const e = await accountSitzungenBeenden(accountId, { ablage: sitzungsAblage });
  let fehler = e.fehler;
  for (const id of e.ids) {
    const r = await arbeitssitzungenBeenden(id, { kontoAblage: sitzungsAblage })
      .catch(() => ({ beendet: 0, fehler: 1 }));
    fehler += r.fehler;
  }
  return { ok: true, beendet: e.beendet, fehler };
}
