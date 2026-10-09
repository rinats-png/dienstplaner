import {
  mitgliedschaftenDesAccounts, mitgliedschaftLesen, mitgliedlaufLesen,
  generationStimmt, accountLesenPerId, raumErlaubt,
} from "./accounts.mjs";
import { HERKUNFT_KONTO } from "./arbeitssitzung.mjs";
import { bestandLesen } from "./bestand.mjs";
import { wirksameRolle, eigenerMandant } from "./rechte.mjs";
import { sitzungAnlegen, sitzungBeenden, sitzungsSchluessel, dauerFuer } from "./sitzungen.mjs";
import { kontoSitzungFuerArbeit, kennungBrauchbar, markerAnlegen, markerLoeschen }
  from "./accountsitzungen.mjs";

/* ==========================================================================
   VOM ACCOUNT IN EINEN BETRIEB

   Drei Dinge waren bisher getrennt, und sie bleiben es:

     ACCOUNT-SITZUNG   Wer ist das? Eine Identität, nichts weiter.
     MITGLIEDSCHAFT    Die serverseitig hinterlegte Beziehung dieses
                       Accounts zu genau EINEM Raum. Sie trägt die
                       Personenkennung und die Rolle aus der Einladung.
     ARBEITSSITZUNG    Ein ausgewählter Betrieb, und daraus abgeleitete
                       Rechte. Das ist die Sitzung, mit der die Anwendung
                       arbeitet (sitzungen.mjs, `t:`).

   Diese Datei ist die Brücke zwischen der ersten und der dritten — und sie
   ist bewusst die einzige Stelle, an der diese Brücke existiert.

   ---------------------------------------------------------------------------
   Was der Aufrufer sagen darf, und was nicht

   Er darf genau eines sagen: welchen Raum er öffnen möchte. Sonst nichts.
   Keine Rolle, keine Person, keine Kontokennung, keine Mitgliedschaft.
   Alles davon wird hier aus der Ablage geholt:

     1. Die Kontokennung kommt aus der geprüften Account-Sitzung, niemals
        aus dem Rumpf.
     2. Die Mitgliedschaft wird für GENAU diese Kennung und GENAU diesen
        Raum gelesen — `mitgliedschaftLesen` gibt nichts zurück, wenn eines
        von beidem nicht passt (auch nicht „die erste" oder „die einzige").
     3. Die Person steht in der Mitgliedschaft und muss im Bestand des
        Raums wirklich existieren.
     4. Die Rolle entscheidet `wirksameRolle` (rechte.mjs) — dieselbe
        Funktion, die auch jede Anfrage eines Zugangscodes beurteilt. Es
        gibt hier keine zweite Rollenlogik, keine „höchste Rolle" und keine
        Rolle am Account.

   Was gespeichert wird, ist die Rolle der Mitgliedschaft; was gilt,
   entscheidet bei jeder Anfrage neu `wirksameRolle` gegen den Bestand
   (daten.mjs tut das für jede Sitzung). Damit ist die Personalliste die
   faktische Wahrheit und bleibt es auch nach der Auswahl: Wer im Betrieb
   die Rolle einer Person ändert, ändert damit ihre Rechte — ohne dass
   irgendwo eine Sitzung nachgezogen werden müsste.

   ---------------------------------------------------------------------------
   Die Liste ist keine Erlaubnis

   `mitgliedschaftenFuerAuswahl` beantwortet nur: Welche Räume kann dieser
   Mensch überhaupt anwählen? Sie ist eine Anzeige. Die Erlaubnis entsteht
   erst in `betriebWaehlen`, und die liest alles noch einmal aus der Ablage.
   Zwischen Anzeige und Auswahl kann eine Mitgliedschaft entzogen worden
   sein; dann scheitert die Auswahl, obwohl die Liste sie noch nannte. Genau
   so gehört es.

   ---------------------------------------------------------------------------
   Eine Mitgliedschaft ohne Person lässt sich nicht öffnen

   Die Rechte kommen aus dem Personendatensatz. Fehlt er — `person: null`
   oder im Bestand nicht mehr vorhanden —, gibt es nichts, woraus sich eine
   Rolle ableiten ließe; `wirksameRolle` fiele auf die Rolle der Einladung
   zurück, und die Einladung ist eine Absicht, kein Personalstand. Deshalb
   ist so eine Mitgliedschaft nicht anwählbar und steht auch nicht in der
   Liste. Das ist dieselbe Entscheidung wie bei der Provisionierung: Eine
   Mitgliedschaft ohne Person ist kein Zugang.

   ---------------------------------------------------------------------------
   Was hier NICHT geschieht

   Keine automatische Auswahl — auch nicht bei genau einer Mitgliedschaft.
   Der Ablauf ist für eine und für zehn derselbe, und damit gibt es keinen
   zweiten, weniger geprüften Weg hinein. Keine Betriebserstellung, keine
   Mitgliedschaft, keine Rollenänderung, kein Eingriff in Zugangscodes.
   ========================================================================== */

/** Was dieser Mensch überhaupt anwählen kann — die Anzeige, nicht die
    Erlaubnis. */
const anzeigbar = (m) => m && m.status === "aktiv" && !!m.person;

/**
 * Die anwählbaren Betriebe eines Accounts.
 *
 * Herausgegeben wird das Wenigste, das für eine Auswahl reicht: der Raum
 * (der stabile Bezeichner, mit dem die Auswahl später arbeitet) und der
 * Name des Betriebs, damit ein Mensch erkennt, was er anklickt.
 *
 * Bewusst NICHT dabei:
 *
 *   rolle       Für die Auswahl ohne Bedeutung, und ihre Ausgabe wäre eine
 *               Einladung, sie im Browser zu merken und später mitzuschicken.
 *               Wer die Rechte wissen will, wählt und bekommt sie vom
 *               Server.
 *   person      Eine Personenkennung des Betriebs gehört nicht in eine
 *               Kontoauskunft.
 *   status      Die Liste enthält ausschließlich anwählbare
 *               Mitgliedschaften, also wäre das Feld immer gleich.
 *   accountId, Speicherschlüssel, mandantId, Betriebsindex, Zeiten
 *               Interna.
 *
 * Ein Raum, dessen Bestand sich nicht lesen lässt, wird mit seinem Raumnamen
 * als Namen genannt statt verschwiegen: Ein vorübergehender Ablagefehler
 * soll keinen Arbeitsbereich unsichtbar machen.
 *
 * @param {object} store  Ablage „centric"
 * @param {string} accountId
 * @returns {Promise<{ok: true, mitgliedschaften: {raum: string, name: string}[]}>}
 */
export async function mitgliedschaftenFuerAuswahl(store, accountId) {
  const alle = await mitgliedschaftenDesAccounts(store, accountId, { nurAktive: true });
  const aus = [];
  for (const m of alle) {
    if (!anzeigbar(m)) continue;
    let name = m.raum;
    try {
      const gelesen = await bestandLesen(store, m.raum);
      const mandant = gelesen && gelesen.bestand
        ? eigenerMandant(gelesen.bestand, { betrieb: m.betrieb }) : null;
      if (mandant && mandant.name) name = String(mandant.name);
    } catch { /* Name unbekannt, Raum bleibt anwählbar */ }
    aus.push({ raum: m.raum, name });
  }
  return { ok: true, mitgliedschaften: aus };
}

/**
 * Öffnet genau einen Betrieb für genau diesen Account.
 *
 * Jeder Fehlschlag gibt denselben Grund nach außen — die Ebene darüber macht
 * daraus eine einzige Absage. Ob es den Raum gibt, ob dort eine
 * Mitgliedschaft besteht, ob sie entzogen wurde: alles dasselbe. Sonst wäre
 * dieser Endpunkt ein Verzeichnis fremder Betriebe.
 *
 * Die Arbeitssitzung hängt an der Account-Sitzung, mit der sie geöffnet wird
 * (`kontoSitzung`: Kennung und Ende der Sitzung, geprüft vom Aufrufer). Ohne
 * sie entsteht nichts. Die Arbeitssitzung läuft nie über das Ende ihrer
 * Anmeldung hinaus — `gueltigBis` ist entsprechend gekappt, damit die Antwort
 * wahr bleibt.
 *
 * @param {object} store  Ablage „centric"
 * @param {{accountId?: string, raum?: unknown,
 *   kontoSitzung?: ({id?: unknown, bis?: unknown}|null),
 *   jetzt?: () => number, kontoAblage?: (object|null)}} o
 * @returns {Promise<{ok: true, token: string, gueltigBis: number, raum: string,
 *     name: string, rolle: string, person: string, betrieb: number}
 *   |{ok: false, grund: string}>}
 */
export async function betriebWaehlen(store,
  { accountId, raum, kontoSitzung = null, jetzt = Date.now, kontoAblage = null } = {}) {
  /** @type {(grund: string) => {ok: false, grund: string}} */
  const absage = (grund) => ({ ok: false, grund });

  if (!accountId || typeof accountId !== "string") return absage("konto");
  /* Ohne Anmeldung, an der die Arbeit hängen kann, entsteht keine. */
  const asId = kontoSitzung && kontoSitzung.id;
  const asBis = Number(kontoSitzung && kontoSitzung.bis);
  if (!kennungBrauchbar(asId) || !Number.isFinite(asBis) || asBis < jetzt())
    return absage("konto-sitzung");
  /* Die Form des Raumnamens prüft dieselbe Funktion, die auch eine
     Mitgliedschaft prüft — samt Ausschluss der Demoräume: Ein Demozugang
     braucht kein Konto und darf über diesen Weg nicht entstehen. */
  if (typeof raum !== "string" || !raumErlaubt(raum)) return absage("raum");

  /* Die Mitgliedschaft, noch einmal frisch aus der Ablage. Die Liste von
     vorhin zählt hier nicht. */
  const m = await mitgliedschaftLesen(store, accountId, raum).catch(() => null);
  if (!m) return absage("keine-mitgliedschaft");
  if (m.status !== "aktiv") return absage(`status:${m.status}`);
  if (!m.person) return absage("ohne-person");

  /* Die Generation dieser Beziehung muss stimmen, bevor irgendetwas
     entsteht: Eine Mitgliedschaft, deren Generation nicht die aktuelle ist,
     ist unbrauchbar — etwa weil ein Entzug den Lauf schon weitergezählt hat
     und nur das Schreiben des Status scheiterte. Und ein Altbestand ohne
     Generation bekommt hier keine untergeschoben: Er wird abgewiesen, bis
     sie ausdrücklich nachgetragen ist (accounts.mjs). */
  const lauf = await mitgliedlaufLesen(store, accountId, raum);
  if (!lauf.ok) return absage("lauf");
  if (!generationStimmt(m, lauf.generation)) return absage("generation");

  /* Der Account selbst, autoritativ gelesen: Seine Epoche geht in die
     Bindung der Arbeitssitzung ein, und sein Zustand wird hier noch einmal
     geprüft — nicht nur beim Cookie. */
  const konto = await accountLesenPerId(store, accountId).catch(() => null);
  if (!konto) return absage("konto-fehlt");
  if (konto.status !== "aktiv") return absage("konto-status");
  const epoche = Number(konto.epoche);
  if (!Number.isInteger(epoche) || epoche < 1) return absage("epoche");

  const gelesen = await bestandLesen(store, raum).catch(() => null);
  if (!gelesen || !gelesen.bestand) return absage("kein-bestand");

  /* Der Betriebsindex aus der Mitgliedschaft muss auf denselben Mandanten
     zeigen wie ihre Mandantenkennung. Beides steht in der Mitgliedschaft,
     und wenn es auseinanderläuft — ein Mandant wurde entfernt, die Indizes
     verschoben —, dann öffnet dieser Weg nichts: Ein falscher Index wäre ein
     Zugang zum falschen Betrieb im selben Raum. */
  const mandant = eigenerMandant(gelesen.bestand, { betrieb: m.betrieb });
  if (!mandant) return absage("kein-mandant");
  if (String(mandant.id) !== String(m.mandantId)) return absage("mandant-verschoben");

  /* Die Person muss es wirklich geben. Ohne sie gibt es keine Rolle, die
     sich ableiten ließe. */
  const person = (Array.isArray(mandant.personen) ? mandant.personen : [])
    .find((p) => p && String(p.id) === String(m.person));
  if (!person) return absage("person-fehlt");

  /* Die Felder der Arbeitssitzung. Gespeichert wird die Rolle der
     Mitgliedschaft; was gilt, entscheidet `wirksameRolle` bei jeder Anfrage
     neu gegen den Bestand. Kein `konto` — es gibt keinen Zugangscode, auf
     den sich eine Sperrung beziehen könnte —, und kein `demo`. */
  const felder = {
    bestand: raum,
    name: `${person.vorname || ""} ${person.nachname || ""}`.trim() || String(person.id),
    rolle: m.rolle,
    person: m.person,
    betrieb: m.betrieb,
    einheit: m.einheit ?? null,
    /* Der Anker, an dem diese Sitzung hängt. Vier Werte, alle aus der
       Ablage: die Kennung aus der geprüften Account-Sitzung, Epoche aus dem
       Account, Generation aus dem Lauf der Beziehung. Kein Wert kommt aus
       der Anfrage, und eine Rolle steht nicht darin — sie ist kein
       Widerrufsanker (arbeitssitzung.mjs). Raum und Person stehen schon
       oben; doppelt wird nichts gespeichert. */
    herkunft: { art: HERKUNFT_KONTO, accountId, epoche, generation: lauf.generation,
      sitzung: String(asId) },
  };

  /* Die Rolle, die jetzt gilt — aus der Person im Bestand, über dieselbe
     Funktion, die jede Anfrage beurteilt. Sie geht in die Antwort, damit
     eine Oberfläche weiß, was sie anzeigen darf; verbindlich ist sie
     ohnehin erst wieder bei der nächsten Anfrage. */
  const rolle = wirksameRolle(felder, gelesen.bestand) || m.rolle;

  /* Die Arbeit überlebt ihre Anmeldung nicht: Die Dauer endet spätestens mit
     der Account-Sitzung. */
  const dauer = Math.min(dauerFuer(rolle), asBis - jetzt());
  if (!(dauer > 0)) return absage("konto-sitzung");

  let angelegt;
  try {
    angelegt = await sitzungAnlegen(felder, dauer, { jetzt });
  } catch {
    /* Ohne Sitzung kein Zugang. Kein halbes Ergebnis. */
    return absage("speichern");
  }

  /* Der Marker sagt dem Logout, was er mit wegräumen kann. Er ist Hygiene, keine
     Autorität: Scheitert er, gilt die Sitzung trotzdem nur, solange ihre
     Anmeldung gilt, und der Aufräumlauf findet sie später. */
  const arbeitsId = sitzungsSchluessel(angelegt.token).slice(2);
  await markerAnlegen(String(asId), arbeitsId,
    { seit: jetzt(), bis: angelegt.gueltigBis }, { ablage: kontoAblage });

  /* Nachkontrolle: Zwischen der Prüfung der Anmeldung und dem Anlegen kann ein
     Logout gelaufen sein. Dann bekäme der Aufrufer ein Merkmal, das beim
     Ausgeben schon tot ist — und eine Datei bliebe liegen. Also noch einmal
     nachsehen; im Zweifel weg damit. */
  const noch = await kontoSitzungFuerArbeit(String(asId), { accountId, epoche },
    { ablage: kontoAblage, jetzt });
  if (!noch.ok) {
    await sitzungBeenden(angelegt.token);
    await markerLoeschen(String(asId), arbeitsId, { ablage: kontoAblage });
    return absage("konto-sitzung");
  }

  return { ok: true, token: angelegt.token, gueltigBis: angelegt.gueltigBis,
    raum, name: mandant.name ? String(mandant.name) : raum,
    rolle, person: m.person, betrieb: m.betrieb };
}
