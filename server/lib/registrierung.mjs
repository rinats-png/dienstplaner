/* ==========================================================================
   REGISTRIERUNG — der Weg von einer Adresse zu einem nutzbaren Konto

   Vier Schritte, in dieser Reihenfolge und in keiner anderen:

     1. Eine Adresse wird angegeben.        registrierungStarten()
     2. Ein Link geht an diese Adresse.     (post.mjs)
     3. Der Link bestätigt die Adresse.     emailVerifizieren()
     4. Der Mensch setzt sein Passwort.     registrierungPasswortSetzen()

   Erst danach ist der Account „aktiv". Vorher existiert er, aber niemand
   kann sich mit ihm anmelden.

   Diese Datei ist Geschäftslogik, nichts weiter: kein Request, keine
   Antwort, kein Statuscode, kein Protokoll, keine Bremse. Sie kennt einen
   Ablagespeicher und eine Versandfunktion. Was davor liegt — Bremse,
   Herkunftsprüfung, CSRF, Protokoll — gehört in die Ebene darüber, und
   ohne sie darf keiner dieser Vorgänge öffentlich erreichbar sein (siehe
   „Was die Endpunktschicht leisten muss" unten).

   ---------------------------------------------------------------------------
   Kein Betrieb, keine Mitgliedschaft, keine Sitzung

   Am Ende einer vollständigen Registrierung steht ein aktiver Account mit
   NULL Mitgliedschaften. Das ist Absicht: Erst wenn Adresse und Passwort
   stehen, darf ein Betrieb entstehen. Sonst legt ein Bot Datenräume an,
   ein Tippfehler erzeugt einen Betrieb, den niemand je öffnet, und eine
   fremde Adresse bekommt einen Testkunden, den sie nicht bestellt hat.

   Eine Sitzung entsteht hier auch nicht. Wer sein Passwort gesetzt hat,
   meldet sich damit an — das ist ein eigener Vorgang.

   ---------------------------------------------------------------------------
   Warum kein vierter Accountstatus

   Ein selbst registrierter Account steht vor der Bestätigung auf
   „eingeladen", wie ein eingeladener auch. Die Bezeichnung ist für einen
   Selbsteintritt schief — die Bedeutung ist es nicht: „angelegt, noch
   nicht nutzbar, wartet auf Bestätigung und Passwort". Ein eigener Status
   „registriert" würde jede Prüfung, die heute `status === "eingeladen"`
   liest, zu einer Prüfung auf zwei Werte machen; die Stelle, die das
   irgendwann vergisst, lässt einen Zugang durch, der nicht fertig ist.
   Woher ein Account kommt, steht ohnehin fest: Eine Einladung hinterlässt
   eine Mitgliedschaft, ein Selbsteintritt nicht.

   ---------------------------------------------------------------------------
   Der Zustandsweg eines Selbsteintritts

     Selbsteintritt begonnen   Account angelegt, Profil erfasst, Anspruch
                               auf einen Testbetrieb geöffnet
                               (testbetriebOffenSeit).
     E-Mail bestätigt          emailVerifiziertAm gesetzt.
     Passwort gesetzt          Account aktiv.
     Provisionierung offen     bis hierher reicht dieses Modul.
     Provisionierung gelungen  ein Betrieb entsteht — anderer Schritt.
     Anspruch verbraucht       testbetriebVerbrauchtAm, für immer.

   Der Anspruch wird ausschließlich beim Anlegen eines neuen Accounts
   geöffnet. Ein bestehendes Konto bekommt über die Registrierung nur einen
   neuen Link — nie einen neuen Anspruch: Sonst wäre „registrieren" der
   stille Weg, sich einen weiteren kostenlosen Betrieb zu holen oder einer
   eingeladenen Person einen zu verschaffen, an dem niemand mitgewirkt hat.
   Für diesen Übergang gehört ein eigener, sichtbarer Vorgang hierher
   (testbetriebOeffnen in accounts.mjs) — nicht dieser.

   Profildaten (Vorname, Nachname, Betriebsname) sind Registrierungsdaten,
   aus denen später eine Leitungsperson und ein Betrieb entstehen. Sie sind
   keine Rolle, keine Mitgliedschaft und keine Zuordnung zu einem Betrieb —
   und sie werden bei einem zweiten Startversuch nicht überschrieben: Was
   zuerst angenommen wurde, gilt, bis ein eigener Profilpfad etwas anderes
   erlaubt.

   ---------------------------------------------------------------------------
   Keine Auskunft darüber, wer Kunde ist

   „Diese Adresse ist bereits vergeben" ist eine Auskunft: Wer sie bekommt,
   kann Adressen durchprobieren und erfährt, wer CENTRIC benutzt. Deshalb
   endet jeder Start gleich — ob die Adresse neu ist, zu einem aktiven, zu
   einem gesperrten oder zu einem wartenden Konto gehört. Der Unterschied
   steht in `protokoll`, und dieses Feld ist für das Protokoll und für
   Prüfungen da, nie für eine Antwort nach außen.

   ---------------------------------------------------------------------------
   Was die Endpunktschicht leisten muss (noch nicht gebaut)

   * Bremse je Herkunft UND je Adresse (deren Prüfwert, nicht im Klartext)
     für alle drei Vorgänge: starten, erneut senden, Passwort setzen. Kein
     öffentlicher Endpunkt ohne Bremse — sonst ist der Versand ein
     Mailwerkzeug für Fremde und das Passwortsetzen ein Rateautomat.
   * Ein Nachweis dafür, dass die `accountId` beim Passwortsetzen dem
     Absender gehört. Dieses Modul prüft, dass die Adresse bestätigt ist
     und noch kein Passwort steht (unten begründet) — aber „welcher Mensch
     ruft hier eigentlich" kann es nicht wissen.
   ========================================================================== */

import { mailNormieren, mailBrauchbar } from "./adressen.mjs";
import { pruefeRegel, passwortAblegen } from "./passwoerter.mjs";
import { tokenAusstellen, tokenEinloesen, laufnummer, FRISTEN } from "./token.mjs";
import { sendeMail, anwendungsAdresse, pruefLinkErlaubt } from "./post.mjs";
import {
  accountAnlegen, accountLesenPerMail, accountLesenPerId,
  emailBestaetigen, tokenNrErhoehen, passwortSetzen, profilPruefen,
} from "./accounts.mjs";

/**
 * Der Absagegrund eines Ergebnisses — oder eine leere Zeichenkette.
 * Die Speicherfunktionen geben entweder `{ ok: true, … }` oder
 * `{ ok: false, grund }` zurück; dieser Griff kommt an den Grund, ohne dass
 * jede Abfrage den Typprüfer beschäftigt.
 * @param {object} e
 */
const grundVon = (e) => (e && "grund" in e ? String(e.grund) : "");

/** Der Zweck, unter dem eine Adressbestätigung läuft. Einer von drei. */
export const ZWECK = "verifizierung";

/** Die Frist in Stunden — abgeleitet, nicht zweitgeschrieben. */
export const FRIST_STUNDEN = Math.round(FRISTEN[ZWECK] / 60);

/**
 * Ein Satz, der nichts verrät. Die Endpunktschicht antwortet damit in
 * jedem Fall — neue Adresse, bestehendes Konto, gesperrtes Konto.
 */
export const HINWEIS_GENERISCH =
  "Wenn diese Adresse verwendet werden kann, ist eine E-Mail mit dem "
  + "Bestätigungslink unterwegs. Bitte sieh auch im Spam-Ordner nach.";

/** Was ein Mensch liest, wenn eine Angabe fehlt oder zu lang ist. */
export const HINWEISE_PROFIL = {
  profil: "Bitte gib deinen Namen und den Namen deines Betriebs an.",
  vorname: "Bitte einen Vornamen angeben (höchstens 80 Zeichen).",
  nachname: "Bitte einen Nachnamen angeben (höchstens 80 Zeichen).",
  betriebsname: "Bitte den Namen des Betriebs angeben — drei bis 80 Zeichen.",
};

/** Der Weg, den der Link nimmt. Das Token steht im Fragment. */
export const VERIFIZIERUNGSPFAD = "/verifizieren";

/**
 * Der Bestätigungslink.
 *
 * Das Token steht hinter der Raute, nicht hinter einem Fragezeichen: Ein
 * Fragment wird vom Browser nicht mitgesendet. Es landet damit nicht in
 * Server- und Proxy-Protokollen, nicht im Referer und nicht in der
 * Verlaufsübersicht eines Zwischenservers — ein Abfragestring täte all
 * das, und ein Protokoll ist das erste, was jemand liest, der schon im
 * Haus ist.
 */
export const verifizierungsLink = (token) =>
  `${anwendungsAdresse()}${VERIFIZIERUNGSPFAD}#token=${token}`;

/** Betreff und Text der Bestätigungsmail. Nüchtern, ohne Werbung. */
export function verifizierungsMail(token) {
  const betreff = "CENTRIC: Bitte bestätige deine E-Mail-Adresse";
  const text = [
    "Bestätige deine E-Mail-Adresse, um deine CENTRIC-Registrierung",
    "fortzusetzen:",
    "",
    verifizierungsLink(token),
    "",
    `Der Link gilt ${FRIST_STUNDEN} Stunden. Danach kannst du einen neuen`,
    "anfordern.",
    "",
    "Wenn du dich nicht registriert hast, ignoriere diese E-Mail — es",
    "entsteht kein Konto und keine Kosten.",
  ].join("\n");
  return { betreff, text };
}

/* --------------------------------------------------------------------------
   START UND ERNEUTER VERSAND

   Beides ist derselbe Vorgang: eine neue Laufnummer, ein neues Token, eine
   Mail. Der einzige Unterschied ist, ob der Account vorher schon da war.
   -------------------------------------------------------------------------- */

/**
 * Stellt ein Bestätigungstoken aus und schickt es. Die neue Laufnummer
 * entwertet jedes früher ausgestellte Bestätigungstoken dieses Accounts —
 * und nur dieses Zwecks: Ein laufender Passwort-Rücksetzvorgang bleibt
 * unberührt (getrennte Zähler in token.mjs).
 *
 * @param {object} store
 * @param {object} konto
 * @param {{jetzt?: () => number, versand?: Function}} [o]
 */
async function bestaetigungSenden(store, konto, { jetzt = Date.now, versand = sendeMail } = {}) {
  const gezaehlt = await tokenNrErhoehen(store, konto.id, ZWECK);
  if (!gezaehlt.ok) return { ok: false, grund: "zaehler" };

  const { token } = await tokenAusstellen(store, {
    zweck: ZWECK,
    nr: gezaehlt.nr,
    /* Im Eintrag steht, wem das Token gehört — nicht das Token selbst.
       Abgelegt wird ohnehin nur dessen Prüfsumme (token.mjs). */
    inhalt: { accountId: konto.id, emailNorm: konto.emailNorm },
    jetzt,
  });

  const { betreff, text } = verifizierungsMail(token);
  const post = await versand(konto.email || konto.emailNorm, betreff, text);
  if (!post || !post.ok) {
    /* Der Account bleibt. Ihn jetzt zu löschen wäre der gefährlichere Weg:
       Zwei gleichzeitige Registrierungen derselben Adresse — eine legt an,
       die andere scheitert am Versand — und die zweite räumte das Konto
       der ersten weg. Ein Konto ohne zugestellte Mail ist harmlos: Es hat
       kein Passwort, keine bestätigte Adresse und damit keinen Zugang. Der
       nächste Versuch stellt ein neues Token aus und entwertet dieses. */
    return { ok: false, grund: "versand", fehler: (post && post.fehler) || "unbekannt" };
  }
  /* Das Token im Klartext verlässt diese Funktion nur, wenn die dreifach
     verschlossene Prüfschranke offen ist (post.mjs: Trockenlauf, ohne
     Versandschlüssel, niemals in einer Auslieferung). Sonst bleibt es in
     der Mail — und nur dort. */
  return { ok: true, trocken: !!post.trocken, ...(pruefLinkErlaubt() ? { pruefToken: token } : {}) };
}

/**
 * Beginnt eine Selbstregistrierung — oder schickt einem wartenden Konto
 * einen neuen Link. Nach außen sieht beides gleich aus.
 *
 * @param {object} store
 * @param {{email?: unknown, vorname?: unknown, nachname?: unknown,
 *   betriebsname?: unknown, jetzt?: () => number, versand?: Function}} [o]
 * @returns {Promise<{ok: boolean, hinweis: string, grund?: string,
 *   protokoll: {fall: string, accountId?: string}, pruefToken?: string}>}
 *   `protokoll` ist für Protokoll und Prüfung. Niemals ausliefern.
 */
export async function registrierungStarten(store, { email, vorname, nachname,
  betriebsname, jetzt = Date.now, versand = sendeMail } = {}) {
  const emailNorm = mailNormieren(email);
  /* Eine unbrauchbare Adresse darf man benennen: Das ist eine Aussage über
     die Eingabe, nicht über den Bestand. */
  if (!mailBrauchbar(emailNorm)) {
    return { ok: false, grund: "adresse", hinweis: "Diese E-Mail-Adresse sieht nicht gültig aus.",
      protokoll: { fall: "adresse" } };
  }

  /* Das Profil wird geprüft, bevor irgendetwas gelesen wird: Ein Formfehler
     ist eine Aussage über die Eingabe und darf für eine bekannte wie für
     eine unbekannte Adresse gleich ausfallen. */
  const gepruef = profilPruefen({ vorname, nachname, betriebsname });
  if (!gepruef.ok) {
    return { ok: false, grund: gepruef.grund,
      hinweis: HINWEISE_PROFIL[gepruef.grund] || "Bitte prüfe deine Angaben.",
      protokoll: { fall: `profil:${gepruef.grund}` } };
  }

  const vorhanden = await accountLesenPerMail(store, emailNorm);

  if (vorhanden && vorhanden.status === "aktiv") {
    /* Kein zweites Konto, keine Mail, kein Hinweis nach außen. Wer sein
       Passwort vergessen hat, nimmt den Rücksetzweg — nicht die
       Registrierung. */
    return { ok: true, hinweis: HINWEIS_GENERISCH, protokoll: { fall: "aktiv", accountId: vorhanden.id } };
  }
  if (vorhanden && vorhanden.status === "gesperrt") {
    /* Eine Sperre hebt man nicht auf, indem man sich neu anmeldet. */
    return { ok: true, hinweis: HINWEIS_GENERISCH, protokoll: { fall: "gesperrt", accountId: vorhanden.id } };
  }

  if (vorhanden) {
    /* Ein wartendes Konto: neuer Link, sonst nichts. Kein Status zurück,
       kein Passwort angefasst, keine Mitgliedschaft berührt. */
    const erg = await bestaetigungSenden(store, vorhanden, { jetzt, versand });
    return { ...erg, hinweis: HINWEIS_GENERISCH,
      protokoll: { fall: "erneut", accountId: vorhanden.id } };
  }

  /* Die Anzeigeform, wie sie eingegeben wurde — aber als Zeichenkette.
     Die Normalform steht daneben und ist der Schlüssel. */
  const anzeige = typeof email === "string" ? email : emailNorm;
  const angelegt = await accountAnlegen(store, { email: anzeige, status: "eingeladen",
    profil: gepruef.profil, selbstbedienung: true });
  if (!angelegt.ok) {
    /* „belegt" heißt: Zwischen dem Nachsehen und dem Anlegen war jemand
       schneller — dieselbe Adresse, zwei gleichzeitige Versuche. Dann gilt
       der vorhandene Account, und dieser Versuch wird ein erneutes Senden.
       accounts.mjs stellt sicher, dass genau einer entstanden ist. */
    if (grundVon(angelegt) === "belegt") {
      const jetztDa = await accountLesenPerMail(store, emailNorm);
      if (jetztDa && jetztDa.status === "eingeladen") {
        const erg = await bestaetigungSenden(store, jetztDa, { jetzt, versand });
        return { ...erg, hinweis: HINWEIS_GENERISCH,
          protokoll: { fall: "erneut", accountId: jetztDa.id } };
      }
      return { ok: true, hinweis: HINWEIS_GENERISCH, protokoll: { fall: "belegt" } };
    }
    return { ok: false, grund: grundVon(angelegt), hinweis: HINWEIS_GENERISCH,
      protokoll: { fall: "anlegen-fehlgeschlagen" } };
  }

  const erg = await bestaetigungSenden(store, angelegt.account, { jetzt, versand });
  return { ...erg, hinweis: HINWEIS_GENERISCH,
    protokoll: { fall: "neu", accountId: angelegt.account.id } };
}

/**
 * Schickt einen neuen Bestätigungslink. Für ein aktives oder gesperrtes
 * Konto geschieht nichts — und die Antwort sagt nicht, welcher Fall vorlag.
 *
 * @param {object} store
 * @param {{email?: unknown, jetzt?: () => number, versand?: Function}} [o]
 */
export async function verifizierungErneutSenden(store, { email, jetzt = Date.now,
  versand = sendeMail } = {}) {
  const emailNorm = mailNormieren(email);
  if (!mailBrauchbar(emailNorm)) {
    return { ok: false, grund: "adresse", hinweis: "Diese E-Mail-Adresse sieht nicht gültig aus.",
      protokoll: { fall: "adresse" } };
  }
  const konto = await accountLesenPerMail(store, emailNorm);
  if (!konto) {
    return { ok: true, hinweis: HINWEIS_GENERISCH, protokoll: { fall: "unbekannt" } };
  }
  if (konto.status !== "eingeladen") {
    return { ok: true, hinweis: HINWEIS_GENERISCH,
      protokoll: { fall: konto.status, accountId: konto.id } };
  }
  const erg = await bestaetigungSenden(store, konto, { jetzt, versand });
  return { ...erg, hinweis: HINWEIS_GENERISCH,
    protokoll: { fall: "erneut", accountId: konto.id } };
}

/* --------------------------------------------------------------------------
   BESTÄTIGEN
   -------------------------------------------------------------------------- */

/**
 * Löst einen Bestätigungslink ein. Setzt ausschließlich den Zeitpunkt der
 * Bestätigung — kein Passwort, keine Aktivierung, keine Mitgliedschaft,
 * kein Raum, keine Sitzung.
 *
 * Warum die Aktivierung hier NICHT passiert: Ein Account, der nach dem
 * Klick auf einen Link „aktiv" heißt, aber kein Passwort hat, ist ein
 * Zustand, in dem eine Anmeldung ohne Geheimnis denkbar wird. Aktiv wird
 * er erst mit dem Passwort (passwortSetzen in accounts.mjs).
 *
 * Wer `ok: false` bekommt, erfährt den Grund nur fürs Protokoll: falsches,
 * abgelaufenes, entwertetes und zweckfremdes Token sehen nach außen gleich
 * aus.
 *
 * @param {object} store
 * @param {{token?: unknown, jetzt?: () => number}} [o]
 * @returns {Promise<{ok: boolean, accountId?: string, emailNorm?: string,
 *   grund?: string, hinweis?: string, passwortFehlt?: boolean}>}
 */
export async function emailVerifizieren(store, { token, jetzt = Date.now } = {}) {
  const absage = (grund) => ({ ok: false, grund,
    hinweis: "Dieser Bestätigungslink ist nicht mehr gültig. Fordere bitte einen neuen an." });

  /* Eingelöst wird ohne Laufnummern: Welche gelten, weiß erst der Account,
     und den nennt der Eintrag. token.mjs verbraucht den Eintrag dabei, ehe
     es urteilt — ein zweiter Klick findet nichts mehr vor. */
  const { eintrag, grund } = await tokenEinloesen(store, token, { zweck: ZWECK, jetzt });
  if (!eintrag) return absage(grund || "unbekannt");
  if (!eintrag.accountId) return absage("ohne-konto");

  const konto = await accountLesenPerId(store, eintrag.accountId);
  if (!konto) return absage("konto-fehlt");
  /* Das Token gehört diesem Konto — und keinem anderen. Ohne diese Prüfung
     würde ein Eintrag, der auf eine fremde Kennung zeigt, eine fremde
     Adresse bestätigen. */
  if (konto.id !== eintrag.accountId) return absage("konto-fremd");
  if (eintrag.emailNorm && konto.emailNorm !== eintrag.emailNorm) return absage("adresse-fremd");
  if (konto.status === "gesperrt") return absage("gesperrt");
  /* Die Laufnummer: Ein neuerer Link hat diesen entwertet. Gezählt wird mit
     derselben Funktion, die die Nummern schreibt (token.mjs). */
  if (laufnummer(konto.tokenNr, ZWECK) !== (Number(eintrag.nr) || 0)) return absage("entwertet");

  const bestaetigt = await emailBestaetigen(store, konto.id);
  if (!bestaetigt.ok) return absage(grundVon(bestaetigt) || "speichern");

  return { ok: true, accountId: konto.id, emailNorm: konto.emailNorm,
    /* Ob schon ein Passwort steht, entscheidet, welches Formular folgt. */
    passwortFehlt: !(bestaetigt.ok && bestaetigt.account.passwort) };
}

/* --------------------------------------------------------------------------
   PASSWORT SETZEN
   -------------------------------------------------------------------------- */

/**
 * Setzt das erste Passwort eines Accounts und macht ihn damit aktiv.
 *
 * Vier Schranken, und jede hat einen Grund:
 *
 *   Adresse bestätigt — sonst genügte eine fremde Adresse, um ein Konto
 *   darauf fertigzustellen.
 *
 *   Nicht gesperrt — eine Sperre ist keine Einladung, sich neu einzurichten.
 *
 *   Noch kein Passwort — diese Funktion richtet ein, sie ändert nicht. Wer
 *   ein Passwort ändern will, nimmt den Rücksetzweg mit eigenem Token.
 *   Ohne diese Schranke wäre eine bekannte Kennung genug, um ein
 *   bestehendes Konto zu übernehmen; die Endpunktschicht hat für den
 *   Einrichtungsfall noch keinen Besitznachweis.
 *
 *   Die Passwortregel aus passwoerter.mjs — nicht hier zweitgeschrieben.
 *
 * Keine Sitzung. Wer eingerichtet ist, meldet sich an.
 *
 * @param {object} store
 * @param {{accountId?: unknown, passwort?: unknown, jetzt?: () => number}} [o]
 * @returns {Promise<{ok: boolean, grund?: string, hinweis?: string, account?: object}>}
 */
export async function registrierungPasswortSetzen(store, { accountId, passwort } = {}) {
  if (!accountId || typeof accountId !== "string") {
    return { ok: false, grund: "konto", hinweis: "Dieser Vorgang ist nicht mehr gültig." };
  }
  const konto = await accountLesenPerId(store, accountId);
  if (!konto) return { ok: false, grund: "konto", hinweis: "Dieser Vorgang ist nicht mehr gültig." };
  if (konto.status === "gesperrt")
    return { ok: false, grund: "gesperrt", hinweis: "Dieser Zugang ist gesperrt." };
  if (!konto.emailVerifiziertAm) {
    return { ok: false, grund: "unbestaetigt",
      hinweis: "Bitte bestätige zuerst deine E-Mail-Adresse." };
  }
  if (konto.passwort) {
    return { ok: false, grund: "vorhanden",
      hinweis: "Für diesen Zugang ist schon ein Passwort gesetzt. "
        + "Nutze bitte „Passwort vergessen“." };
  }

  /* Die Regel kommt aus passwoerter.mjs. Mitgegeben wird die eigene
     Adresse: Der lokale Teil ist das Erste, was jemand rät. */
  const lokal = String(konto.emailNorm || "").split("@")[0];
  /* Der Typ wird in pruefeRegel selbst geprüft — ein Objekt bestünde die
     Längenregel sonst als „[object Object]" (passwoerter.mjs). Der Hinweis
     an den Typprüfer ändert daran nichts. */
  const regel = pruefeRegel(/** @type {string} */ (passwort),
    [konto.emailNorm, lokal].filter(Boolean));
  if (!regel.ok) return { ok: false, grund: "regel", hinweis: grundVon(regel) };

  /* scrypt aus passwoerter.mjs — keine eigene Kryptographie. Was in den
     Account geht, ist der Prüfwert, nie das Passwort. */
  const ablage = await passwortAblegen(/** @type {string} */ (passwort));
  const gesetzt = await passwortSetzen(store, konto.id, ablage);
  if (!gesetzt.ok || !("account" in gesetzt)) {
    return { ok: false, grund: grundVon(gesetzt) || "speichern",
      hinweis: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  }

  return { ok: true, account: gesetzt.account };
}
