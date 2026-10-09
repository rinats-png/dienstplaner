import {
  accountLesenPerId, mitgliedschaftLesen, mitgliedlaufLesen, generationStimmt,
} from "./accounts.mjs";
import { getStore } from "./ablage.mjs";
import { kontoSitzungFuerArbeit, kennungBrauchbar } from "./accountsitzungen.mjs";
import { bestandLesen } from "./bestand.mjs";
import { eigenerMandant } from "./rechte.mjs";
import { sitzungBeenden, sitzungLesen, merkmalAus } from "./sitzungen.mjs";

/* ==========================================================================
   IST DIESE ARBEITSSITZUNG FACHLICH NOCH GÜLTIG?

   Zwei Fragen, zwei Zuständigkeiten, und sie bleiben getrennt:

     TECHNISCH   Gibt es die Sitzung, läuft sie noch, war jemand in den
                 letzten dreißig Minuten da? Das beantwortet
                 `sitzungLesen` (sitzungen.mjs) — eine generische
                 Primitive, die weder Account noch Mitgliedschaft kennt
                 und keinen kennen soll.

     FACHLICH    Gilt die Berechtigung, aus der diese Sitzung entstanden
                 ist, überhaupt noch? Das beantwortet diese Datei.

   Warum getrennt: Eine Sitzung aus einem Zugangscode hat keinen Account und
   keine Mitgliedschaft. Würde `sitzungLesen` in Accounts nachsehen, bekäme
   jede Anfrage der bestehenden Anwendung zwei zusätzliche Lesevorgänge für
   eine Prüfung, die sie nichts angeht — und die Isolation zwischen altem
   Zugang und neuem Konto wäre aufgegeben.

   ---------------------------------------------------------------------------
   Die Herkunft entscheidet, ob geprüft wird

   Eine Arbeitssitzung, die aus einem Konto entstand, trägt seit dieser
   Änderung einen Anker:

     herkunft: { art: "account", accountId, epoche, generation, sitzung }

   Fünf Werte, und keiner davon ist doppelt: Der Raum steht schon in
   `bestand`, die Person in `person`, der Betriebsindex in `betrieb`. Neu ist
   `sitzung`, die Kennung (Prüfsumme) der Account-Sitzung, mit der dieser
   Betrieb geöffnet wurde. Eine Rolle steht NICHT darin — sie ist kein
   Widerrufsanker, sondern wird bei jeder Anfrage aus dem Bestand abgeleitet
   (`wirksameRolle`).

   ---------------------------------------------------------------------------
   Die Anmeldung, an der die Arbeit hängt

   Eine Arbeitssitzung gilt nur, solange die Account-Sitzung gilt, aus der sie
   entstand. Ohne das überlebte ein Betriebsmerkmal den Logout: Der Mensch
   meldet sich ab, das Merkmal im Browser, im Speicher einer Seite oder in der
   Hand eines anderen arbeitet weiter, bis es abläuft.

   Gebunden wird an die KONKRETE Sitzung, nicht an den Account. Ein zweites
   Gerät desselben Kontos hat eine eigene Account-Sitzung und bleibt vom Logout
   des ersten unberührt; ein globaler Widerruf bleibt Sperre, Passwortwechsel
   (Epoche) und Entzug vorbehalten — sie wirken wie bisher.

   Bei jedem Zugriff wird zuerst nachgesehen, ob diese Sitzung noch existiert
   und zu diesem Account und dieser Epoche gehört (kontoSitzungFuerArbeit). Das
   ist ein Lesevorgang mehr und ein kleiner Schreibvorgang je Minute (die
   Aktivität, nie die Autorität). Ein Anker ohne gültige Kennung ist ungültig,
   nicht „alt": Eine Arbeitssitzung aus der Zeit vor dieser Bindung gilt nicht
   weiter. Es gibt keinen Übergangsmodus.

   Eine Account-Sitzung verlängert sich durch Arbeit im Betrieb. Dafür hat eine
   gebundene Arbeitssitzung keine eigene Untätigkeitsgrenze mehr: Der
   Login-Kontext lebt, solange in ihm gearbeitet wird, und endet nach dreißig
   Minuten ohne jede Aktivität (sitzungen.mjs, accountsitzungen.mjs).

   Drei Fälle, und der dritte ist der, an dem man sich schneidet:

     kein `herkunft`-Feld          eine Arbeitssitzung der alten Art.
                                   Gültig, ohne einen einzigen Zugriff auf
                                   Account oder Mitgliedschaft.
     gültiger Account-Anker        vollständige Prüfung, siehe unten.
     `herkunft` vorhanden, aber
     unbekannt oder unbrauchbar    UNGÜLTIG.

   Der dritte Fall ist Absicht. Wer `{ herkunft: { art: "irgendwas" } }`
   unterschieben könnte, dürfte sonst die ganze Prüfung überspringen, indem
   er eine Art erfindet. Was nicht genau die unterstützte Form hat, gilt
   deshalb als kaputt — nicht als alt.

   ---------------------------------------------------------------------------
   Was bei einem Account-Anker geprüft wird

     1. Die Form des Ankers: Art, Kennung, Epoche, Generation.
     2. Der Account existiert und ist aktiv.
     3. Seine Epoche ist noch dieselbe. Damit widerruft jede
        Passwortänderung auch schon ausgegebene Arbeitssitzungen.
     4. Die Mitgliedschaft für genau diese Kennung und genau diesen Raum
        (`bestand`) existiert und ist aktiv.
     5. Die Generationen stimmen dreifach überein: Anker, Mitgliedschaft und
        der persistente Lauf der Beziehung (accounts.mjs). Damit ist ein
        Entzug sofort wirksam — er zählt den Lauf weiter — und eine später
        neu ausgesprochene Mitgliedschaft macht eine alte Sitzung NICHT
        wieder gültig.
     6. Die Person ist dieselbe wie bei der Auswahl, und sie steht noch im
        Bestand. Ein stiller Wechsel auf eine andere Person ist damit
        ausgeschlossen.
     7. Der Mandant, den die Sitzung öffnet (ihr Index `betrieb` im
        aktuellen Bestand), ist derselbe, den die Mitgliedschaft nennt
        (`mandantId`). Ein verschobener Index öffnet damit keinen fremden
        Betrieb.

   Was NICHT geprüft wird: die Rolle. Ob jemand heute Leitung ist und morgen
   Beschäftigte, ändert seine Rechte — nicht die Gültigkeit seiner Sitzung.
   Diese Trennung ist der Grund, warum die Rolle nicht im Anker steht.

   ---------------------------------------------------------------------------
   Fehler schließen die Tür

   Jeder Lesefehler — Account, Mitgliedschaft, Lauf, Bestand — führt zur
   Ungültigkeit. Kein `catch` macht daraus ein Ja. Ein Ausfall der Ablage
   darf keine Berechtigung verlängern.

   ---------------------------------------------------------------------------
   Kosten

   Eine Anfrage mit Account-Sitzung liest zusätzlich: den Kennungszeiger und
   den Account (zwei), die Mitgliedschaft (eine), den Lauf (eine). Der Bestand
   wird nicht zusätzlich gelesen, wenn der Aufrufer ihn ohnehin holt und
   durchgibt — `daten.mjs` tut das.

   Kein Zwischenspeicher, und zwar mit Absicht: Eine Frist von auch nur
   wenigen Sekunden hieße, dass „sofort widerrufen" nicht mehr stimmt.

   Eine Sitzung der alten Art verursacht null zusätzliche Lesevorgänge.
   ========================================================================== */

/** Die einzige Art, die dieser Anker haben darf. */
export const HERKUNFT_KONTO = "account";

/* ==========================================================================
   DER EINE PRÜFPUNKT: arbeitssitzungLesen

   Bis hierher las jeder Pfad seine Sitzung selbst. Vier Dateien hatten je eine
   eigene Fassung des Lesens, und fünf Pfade in daten.mjs lasen die Sitzung roh
   und kamen an der fachlichen Prüfung vorbei: Eine Leitung, deren
   Mitgliedschaft entzogen war, konnte dort weiter Zugangscodes sperren. Die
   Primitive `arbeitssitzungPruefen` gab es — sie wurde nur nicht überall
   gerufen.

   Jetzt gibt es einen Weg, eine Arbeitssitzung aus einer Anfrage zu lesen, und
   er enthält beides: das technische Lesen (Merkmal, Frist, Untätigkeit) und die
   fachliche Prüfung. Wer eine Sitzung braucht, ruft diese Funktion. Ein
   Strukturtest (sitzungsinventar.test.js) hält fest, dass es keine andere
   Stelle gibt, die den Kopf `authorization` liest oder `t:` anfasst.

   Rückgabe:

     sitzung      die Sitzung, wenn sie technisch UND fachlich gilt; sonst null
     abgewiesen   wahr, wenn es eine technisch gültige Sitzung gab, die
                  fachlich widerrufen ist (Entzug, Sperre, Epoche, …)
     grund        der innere Grund dafür — für das Protokoll, nie nach außen

   Warum `abgewiesen` getrennt von „keine Sitzung": Die Pfade antworten auf eine
   fehlende Sitzung wie bisher, auf eine widerrufene aber einheitlich mit
   „Nicht angemeldet" (401) — und protokollieren sie.

   Sicherungsschlüssel (sk:) sind keine Arbeitssitzungen. Sie dürfen nur lesen,
   und nur ein Pfad darf sie annehmen (daten.mjs, über seine Positivliste). Alle
   anderen bekommen sie nicht zu sehen: ohne `sicherungsschluessel: true` ist
   ein Sicherungsschlüssel „keine Sitzung".
   ========================================================================== */

/**
 * @param {Request} req
 * @param {{store?: (object|null), sicherungsschluessel?: boolean,
 *   bestandLader?: (((s: any) => Promise<any>)|null)}} [o]
 *   `store`: Ablage „centric" (sonst die eigene). `bestandLader` bekommt die
 *   gelesene Sitzung und gibt einen schon gelesenen Bestand zurück, damit er
 *   nicht zweimal gelesen wird.
 * @returns {Promise<{sitzung: any, abgewiesen: boolean, grund: (string|null)}>}
 */
export async function arbeitssitzungLesen(req,
  { store = null, sicherungsschluessel = false, bestandLader = null } = {}) {
  const keine = () => ({ sitzung: null, abgewiesen: false, grund: null });
  const merkmal = merkmalAus(req);
  if (!merkmal) return keine();

  const s0 = await sitzungLesen(req);
  if (!s0) return keine();
  if (s0.nurSicherung && !sicherungsschluessel) return keine();

  const ablage = store || getStore({ name: "centric", consistency: "strong" });
  const fachlich = await arbeitssitzungPruefen(ablage, s0,
    { merkmal, bestandLader: bestandLader ? () => bestandLader(s0) : null });
  if (!fachlich.ok) {
    return { sitzung: null, abgewiesen: true,
      grund: "grund" in fachlich ? fachlich.grund : "unbekannt" };
  }
  return { sitzung: s0, abgewiesen: false, grund: null };
}

/** Trägt dieser Datensatz überhaupt einen Herkunftsanker? */
const hatHerkunft = (sitzung) =>
  !!sitzung && Object.prototype.hasOwnProperty.call(sitzung, "herkunft")
  && sitzung.herkunft !== undefined;

/** Ist das ein Anker der unterstützten Form? Alles andere ist kaputt, nicht
    alt. */
function ankerBrauchbar(h) {
  if (!h || typeof h !== "object" || Array.isArray(h)) return false;
  if (h.art !== HERKUNFT_KONTO) return false;
  /* Die Anmeldung, an der die Arbeit hängt: eine Prüfsumme, nichts sonst. */
  if (!kennungBrauchbar(h.sitzung)) return false;
  if (!h.accountId || typeof h.accountId !== "string") return false;
  if (!Number.isInteger(h.epoche) || h.epoche < 1) return false;
  if (!Number.isInteger(h.generation) || h.generation < 1) return false;
  return true;
}

/**
 * Prüft die fachliche Gültigkeit einer technisch schon geprüften
 * Arbeitssitzung.
 *
 * @param {object} store  Ablage „centric"
 * @param {object|null} sitzung  der Datensatz aus der Sitzungsablage
 * @param {{merkmal?: (string|null), bestandLader?: (() => Promise<object|null>)|null,
 *   kontoAblage?: (object|null), jetzt?: () => number}} [o]
 *   `merkmal` nur, um eine widerrufene Sitzung wegzuräumen — die Gültigkeit
 *   hängt nicht daran. `bestandLader` gibt einen schon gelesenen Bestand
 *   weiter (Rückgabe wie `bestandLesen`), damit er nicht zweimal gelesen wird.
 *   `kontoAblage` und `jetzt` nur für Prüfungen.
 * @returns {Promise<{ok: true, art: string}|{ok: false, grund: string}>}
 */
export async function arbeitssitzungPruefen(store, sitzung,
  { merkmal = null, bestandLader = null, kontoAblage = null, jetzt = Date.now } = {}) {
  if (!sitzung || typeof sitzung !== "object") return { ok: false, grund: "keine-sitzung" };

  /* Kein Anker: eine Sitzung aus einem Zugangscode oder ein
     Sicherungsschlüssel. Hier endet die Prüfung, ohne einen Account
     anzufassen. */
  if (!hatHerkunft(sitzung)) return { ok: true, art: "legacy" };

  const h = sitzung.herkunft;
  /* Ab hier wird jede Absage zum Wegräumen der Sitzung führen: Sie ist
     entweder gefälscht oder ihre Berechtigung ist fort. */
  /** @type {(grund: string) => Promise<{ok: false, grund: string}>} */
  const absage = async (grund) => {
    /* Bestenfalls. Ein Löschfehler darf die Absage nicht in eine Erlaubnis
       verwandeln — deshalb wird sein Ergebnis nicht betrachtet. */
    if (merkmal) await sitzungBeenden(merkmal).catch(() => false);
    return { ok: false, grund };
  };

  if (!ankerBrauchbar(h)) return absage("herkunft");

  const raum = sitzung.bestand;
  if (typeof raum !== "string" || !raum) return absage("kein-raum");
  const person = sitzung.person;
  if (!person || typeof person !== "string") return absage("keine-person");

  /* 0. Die Anmeldung, an der diese Arbeit hängt. Zuerst, weil es die
     billigste Frage ist und die, die ein Logout beantwortet. */
  const anm = await kontoSitzungFuerArbeit(h.sitzung,
    { accountId: h.accountId, epoche: h.epoche }, { ablage: kontoAblage, jetzt });
  if (!anm.ok) return absage("konto-sitzung");

  /* 1. Der Account. */
  let konto;
  try { konto = await accountLesenPerId(store, h.accountId); }
  catch { return absage("account-fehler"); }
  if (!konto) return absage("account-fehlt");
  if (konto.status !== "aktiv") return absage("account-status");
  if ((Number(konto.epoche) || 0) !== h.epoche) return absage("epoche");

  /* 2. Die Mitgliedschaft, frisch gelesen. */
  let m;
  try { m = await mitgliedschaftLesen(store, h.accountId, raum); }
  catch { return absage("mitglied-fehler"); }
  if (!m) return absage("mitglied-fehlt");
  if (m.status !== "aktiv") return absage("mitglied-status");

  /* 3. Die Generation, dreifach. */
  const lauf = await mitgliedlaufLesen(store, h.accountId, raum);
  if (!lauf.ok) return absage("lauf");
  if (!generationStimmt(m, lauf.generation)) return absage("generation-mitglied");
  if (h.generation !== lauf.generation) return absage("generation-sitzung");

  /* 4. Dieselbe Person wie bei der Auswahl. */
  if (String(m.person || "") !== String(person)) return absage("person-gewechselt");

  /* 5. Derselbe Mandant, und die Person steht noch darin. */
  let gelesen;
  try {
    gelesen = bestandLader ? await bestandLader() : await bestandLesen(store, raum);
  } catch { return absage("bestand-fehler"); }
  const bestand = gelesen && gelesen.bestand;
  if (!bestand) return absage("bestand-fehlt");
  const mandant = eigenerMandant(bestand, { betrieb: sitzung.betrieb });
  if (!mandant) return absage("mandant-fehlt");
  if (String(mandant.id) !== String(m.mandantId)) return absage("mandant-verschoben");
  const dabei = (Array.isArray(mandant.personen) ? mandant.personen : [])
    .some((p) => p && String(p.id) === String(person));
  if (!dabei) return absage("person-fehlt");

  return { ok: true, art: HERKUNFT_KONTO };
}
