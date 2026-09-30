import {
  accountLesenPerId, mitgliedschaftLesen, mitgliedlaufLesen, generationStimmt,
} from "./accounts.mjs";
import { bestandLesen } from "./bestand.mjs";
import { eigenerMandant } from "./rechte.mjs";
import { sitzungBeenden } from "./sitzungen.mjs";

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

     herkunft: { art: "account", accountId, epoche, generation }

   Vier Werte, und keiner davon ist doppelt: Der Raum steht schon in
   `bestand`, die Person in `person`, der Betriebsindex in `betrieb`. Eine
   Rolle steht NICHT darin — sie ist kein Widerrufsanker, sondern wird bei
   jeder Anfrage aus dem Bestand abgeleitet (`wirksameRolle`).

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

/** Trägt dieser Datensatz überhaupt einen Herkunftsanker? */
const hatHerkunft = (sitzung) =>
  !!sitzung && Object.prototype.hasOwnProperty.call(sitzung, "herkunft")
  && sitzung.herkunft !== undefined;

/** Ist das ein Anker der unterstützten Form? Alles andere ist kaputt, nicht
    alt. */
function ankerBrauchbar(h) {
  if (!h || typeof h !== "object" || Array.isArray(h)) return false;
  if (h.art !== HERKUNFT_KONTO) return false;
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
 * @param {{merkmal?: (string|null), bestandLader?: (() => Promise<object|null>)|null}} [o]
 *   `merkmal` nur, um eine widerrufene Sitzung wegzuräumen — die Gültigkeit
 *   hängt nicht daran. `bestandLader` gibt einen schon gelesenen Bestand
 *   weiter (Rückgabe wie `bestandLesen`), damit er nicht zweimal gelesen wird.
 * @returns {Promise<{ok: true, art: string}|{ok: false, grund: string}>}
 */
export async function arbeitssitzungPruefen(store, sitzung,
  { merkmal = null, bestandLader = null } = {}) {
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
