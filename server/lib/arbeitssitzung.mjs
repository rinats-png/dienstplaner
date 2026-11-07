import {
  accountLesenPerId, mitgliedschaftLesen, mitgliedlaufLesen, generationStimmt,
} from "./accounts.mjs";
import { getStore } from "./ablage.mjs";
import { kontoSitzungFuerArbeit, kennungBrauchbar, markerListe, markerLoeschen }
  from "./accountsitzungen.mjs";
import { aktivePerson } from "./personengueltig.mjs";
import { heuteBerlin } from "./zeiterfassung.mjs";
import { BESTAND_UNLESBAR, bestandLesen, voruebergehend } from "./bestand.mjs";
import { eigenerMandant } from "./rechte.mjs";
import { mandantPruefen } from "./erstbefuellung.mjs";
import { sitzungBeenden, sitzungBeendenPerId, sitzungLesen, merkmalAus } from "./sitzungen.mjs";

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
                                   Gültig, ohne Zugriff auf
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

   Eine Sitzung der alten Art ohne Person und ohne Zugang verursacht null zusätzliche Lesevorgänge; mit Zugang liest sie
   diesen (Sperre), mit Person zusätzlich den Bestand (SI-P2).
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
     mitMerkmal   wahr, wenn die Anfrage überhaupt ein Merkmal mitbrachte

   Warum `abgewiesen` getrennt von „keine Sitzung": Eine widerrufene Sitzung
   wird protokolliert, ein unbekanntes oder abgelaufenes Merkmal nicht — sonst
   wäre jede erfundene Anfrage ein Protokolleintrag. Und `mitMerkmal`, damit die
   Pfade zwischen „kein Merkmal" und „ein Merkmal, das nicht mehr gilt" trennen
   können: Das zweite ist für den Aufrufer „Nicht angemeldet" (401), gleichgültig,
   ob die Sitzung widerrufen, abgelaufen oder beim Abmelden weggeräumt wurde.
   Sonst hinge die Antwort daran, ob das Aufräumen schon gelaufen ist.

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
 * @returns {Promise<{sitzung: any, abgewiesen: boolean, grund: (string|null),
 *   mitMerkmal: boolean}>}
 */
export async function arbeitssitzungLesen(req,
  { store = null, sicherungsschluessel = false, bestandLader = null } = {}) {
  const merkmal = merkmalAus(req);
  const keine = () => ({ sitzung: null, abgewiesen: false, grund: null, mitMerkmal: !!merkmal });
  if (!merkmal) return keine();

  const s0 = await sitzungLesen(req);
  if (!s0) return keine();
  if (s0.nurSicherung && !sicherungsschluessel) return keine();

  const ablage = store || getStore({ name: "centric", consistency: "strong" });
  const fachlich = await arbeitssitzungPruefen(ablage, s0,
    { merkmal, bestandLader: bestandLader ? () => bestandLader(s0) : null });
  if (!fachlich.ok) {
    return { sitzung: null, abgewiesen: true, mitMerkmal: true,
      grund: "grund" in fachlich ? fachlich.grund : "unbekannt" };
  }
  return { sitzung: s0, abgewiesen: false, grund: null, mitMerkmal: true };
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
 * Steht die Person dieser Sitzung noch im Betrieb (SI-P2)? Der Betrieb ist über die Kennung gewählt, die die Sitzung
 * trägt (genau einer), sonst über ihre Position wie überall (`eigenerMandant`).
 * @param {any} bestand  der Bestand selbst (nicht die Hülle von bestandLesen)
 * @param {{mandantId?: string, betrieb?: number, person?: any}} sitzung
 * @param {string} [heute]
 */
export function sitzungPersonGilt(bestand, sitzung, heute = heuteBerlin()) {
  if (!bestand || !Array.isArray(bestand.mandanten) || !sitzung) return false;
  let mandant;
  if (typeof sitzung.mandantId === "string" && sitzung.mandantId) {
    const m = bestand.mandanten.filter((x) => x && x.id === sitzung.mandantId);
    if (m.length !== 1) return false;
    mandant = m[0];
  } else {
    mandant = eigenerMandant(bestand, { betrieb: sitzung.betrieb });
  }
  return !!aktivePerson(mandant, sitzung.person, heute);
}

/**
 * Ist der Zugangscode hinter dieser Sitzung ausdrücklich gesperrt? Streng gelesen: Ein Lesefehler wird
 * weitergereicht (kontoLesen machte daraus „gibt es nicht" und fiel auf den Sammelblob zurück). Der Zugang liegt
 * einzeln unter `konto:<Prüfsumme>`, ältere im Sammelblob `konten`.
 * @param {object} store  Ablage „centric"
 * @param {string} schluessel  die Prüfsumme des Zugangs (`sitzung.konto`)
 * @returns {Promise<boolean>}
 */
async function zugangGesperrt(store, schluessel) {
  /* Dem Vermerk `ersetztDurch` (Umschlüsselung beim Einführen des Pfeffers) wird gefolgt wie im Kalenderfeed
     (feedherkunft.mjs): Die Sitzung trägt den alten Schlüssel, gesperrt wird aber der neue. Gesperrt an irgendeiner
     Stelle der Kette heißt gesperrt; ein fehlender Nachfolger ist keine Absage. Tiefe und Kreise sind begrenzt. */
  const gesehen = new Set();
  let blob;
  for (let tiefe = 0; typeof schluessel === "string" && schluessel && tiefe < 5 && !gesehen.has(schluessel); tiefe++) {
    gesehen.add(schluessel);
    let z;
    try {
      z = await store.get(`konto:${schluessel}`, { type: "json" });
      if (!z) {
        blob = blob || ((await store.get("konten", { type: "json" })) || {});
        z = blob[schluessel] || null;
      }
    } catch (e) {
      /* Ein Lesefehler ist vorübergehend (→ 503, die Sitzung bleibt), keine Absage und kein 401 (der Browser
         würde bei 401 abmelden). */
      const f = /** @type {Error & {code?: string}} */ (new Error(`Zugang nicht lesbar (${String(e && e.message || e)})`));
      f.code = BESTAND_UNLESBAR;
      throw f;
    }
    if (!z) return false;
    if (z.gesperrt) return true;
    schluessel = z.ersetztDurch;
  }
  return false;
}

/**
 * Beendet die Arbeitssitzungen, die an einer Account-Sitzung hängen — der Rest
 * des Logouts. Die Account-Sitzung ist zu diesem Zeitpunkt schon gelöscht, und
 * das ist der Widerruf: Jede Arbeitssitzung dazu ist bereits ungültig, weil sie
 * bei jedem Zugriff nach ihrer Anmeldung fragt. Hier wird nur aufgeräumt, damit
 * keine Datei liegen bleibt, die jemand später missverstehen könnte.
 *
 * Gefunden werden sie über die Marker (ab:), nicht durch Durchsuchen aller
 * Arbeitssitzungen. Ein Marker wird erst entfernt, wenn seine Arbeitssitzung
 * weg ist; scheitert das Löschen, bleibt der Marker für den Aufräumlauf liegen.
 * Fehler hier ändern nichts am Logout.
 *
 * Andere Geräte desselben Kontos haben eigene Account-Sitzungen und damit eigene
 * Marker: Sie werden nicht berührt.
 *
 * @param {string} accountSitzungsId  Kennung der beendeten Account-Sitzung
 * @param {{kontoAblage?: (object|null)}} [o]
 * @returns {Promise<{beendet: number, fehler: number}>}
 */
export async function arbeitssitzungenBeenden(accountSitzungsId, { kontoAblage = null } = {}) {
  const m = await markerListe(accountSitzungsId, { ablage: kontoAblage });
  let beendet = 0;
  let fehler = m.fehler ? 1 : 0;
  for (const id of m.ids) {
    if (await sitzungBeendenPerId(id)) {
      beendet++;
      if (!(await markerLoeschen(accountSitzungsId, id, { ablage: kontoAblage }))) fehler++;
    } else fehler++;
  }
  return { beendet, fehler };
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
  if (!hatHerkunft(sitzung)) {
    /* SI-P2: Ein gesperrter Zugangscode gilt auch dann nicht, wenn seine Sitzung die Sperre überlebt hat
       (das Beenden der Sitzungen beim Sperren ist bestenfalls; zugang-sperren fängt Fehler dort ab). Nur
       ausdrücklich gesperrt zählt: einen Zugang, den es nicht mehr gibt, kennt diese Prüfung nicht. Ein Lesefehler
       ist keine Absage (die Sitzung bleibt) und wird als vorübergehend weitergereicht (→ 503). Sicherungsschlüssel haben keinen
       Zugang. */
    if (!sitzung.nurSicherung && typeof sitzung.konto === "string" && sitzung.konto) {
      let gesperrt;
      gesperrt = await zugangGesperrt(store, sitzung.konto);
      if (gesperrt) {
        if (merkmal) await sitzungBeenden(merkmal).catch(() => false);
        return { ok: false, grund: "zugang-gesperrt" };
      }
    }
    /* SI-P2: Eine Sitzung, die an eine Person gebunden ist, gilt nur, solange die Person im Betrieb steht
       (lib/personengueltig.mjs, dieselbe Regel wie beim Kalenderfeed). Vorher fiel `wirksameRolle` bei einer
       entfernten Person auf die Rolle des Codes zurück, und die Sitzung lebte weiter. Betreiber und Codes ohne
       Person haben keine; Sicherungsschlüssel auch nicht. */
    const personGebunden = !sitzung.nurSicherung && sitzung.rolle !== "betreiber"
      && sitzung.person !== null && sitzung.person !== undefined && sitzung.person !== "";
    /* Seit Oktober 2026 trägt ein Zugangscode die Kennung seines Betriebs,
       und die Sitzung mit ihm. Zeigt die Position nicht mehr auf genau
       diesen Betrieb, gilt sie nicht — dieselbe Prüfung wie unten in
       Schritt 5 für Sitzungen aus einem Konto. Codes ohne Kennung bleiben
       wie bisher (erstbefuellung.mjs, codeBindung). */
    if ((typeof sitzung.mandantId === "string" && sitzung.mandantId) || personGebunden) {
      let gelesen;
      try {
        gelesen = bestandLader ? await bestandLader() : await bestandLesen(store, sitzung.bestand);
      } catch (e) {
        /* Vorübergehend nicht lesbar: weiterreichen (→ 503), die Sitzung bleibt. */
        if (voruebergehend(e)) throw e;
        return { ok: false, grund: "bestand-fehler" };
      }
      const bestand = gelesen && gelesen.bestand;
      const grund = bestand && typeof sitzung.mandantId === "string" && sitzung.mandantId
        ? mandantPruefen(bestand, sitzung.betrieb, sitzung.mandantId) : null;
      if (grund) {
        if (merkmal) await sitzungBeenden(merkmal).catch(() => false);
        return { ok: false, grund };
      }
      /* Ohne gelesenen Bestand (Raum noch nicht angelegt) gibt es keine Personalliste, die etwas widerriefe. */
      if (bestand && personGebunden && !sitzungPersonGilt(bestand, sitzung, heuteBerlin(new Date(jetzt())))) {
        if (merkmal) await sitzungBeenden(merkmal).catch(() => false);
        return { ok: false, grund: "person-fort" };
      }
    }
    return { ok: true, art: "legacy" };
  }

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
  /* Ein Lesefehler schließt die Tür, löscht aber nichts: Eine Arbeitssitzung, deren
     Anmeldung sich gerade nicht lesen lässt, ist nicht widerrufen, nur nicht
     beurteilbar. Mit dem nächsten Lesen geht es weiter. Alles andere — die
     Anmeldung fehlt, gehört einem anderen Konto, ist abgelaufen — ist ein
     Widerruf, und die Arbeitssitzung wird weggeräumt. */
  if (!anm.ok) {
    if ("grund" in anm && anm.grund === "fehler")
      return { ok: false, grund: "konto-sitzung-fehler" };
    return absage("konto-sitzung");
  }

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
  } catch (e) {
    /* Vorübergehend nicht lesbar oder gesperrt: kein Grund, die Sitzung
       wegzuräumen — weiterreichen (→ 503). Erst ein wirklich fehlender
       Bestand ist eine Absage. */
    if (voruebergehend(e)) throw e;
    return absage("bestand-fehler");
  }
  const bestand = gelesen && gelesen.bestand;
  if (!bestand) return absage("bestand-fehlt");
  const grundM = mandantPruefen(bestand, sitzung.betrieb, m.mandantId);
  if (grundM) return absage(grundM);
  const mandant = eigenerMandant(bestand, { betrieb: sitzung.betrieb });
  const dabei = (Array.isArray(mandant.personen) ? mandant.personen : [])
    .some((p) => p && String(p.id) === String(person));
  if (!dabei) return absage("person-fehlt");

  return { ok: true, art: HERKUNFT_KONTO };
}
