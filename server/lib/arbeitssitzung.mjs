import {
  accountLesenPerId, mitgliedschaftLesen, mitgliedlaufLesen, generationStimmt,
} from "./accounts.mjs";
import { getStore } from "./ablage.mjs";
import { createHash } from "node:crypto";
import { kontoSitzungFuerArbeit, kennungBrauchbar, markerListe, markerLoeschen }
  from "./accountsitzungen.mjs";
import { aktivePerson } from "./personengueltig.mjs";
import { heuteBerlin } from "./zeiterfassung.mjs";
import { BESTAND_UNLESBAR, bestandLesen, voruebergehend } from "./bestand.mjs";
import { eigenerMandant, wirksameRolle } from "./rechte.mjs";
import { erstleitungStreng } from "./erstleitung.mjs";
import { kontoLesenStreng } from "./konten.mjs";
import { mandantPruefen } from "./erstbefuellung.mjs";
import { sitzungBeenden, sitzungBeendenPerId, sitzungLesen, merkmalAus, sicherungsSchluessel } from "./sitzungen.mjs";
import { grundAusPruefung, schluesselWiderrufen, widerrufsVermerk } from "./sicherungsschluessel.mjs";
import { schluesselEpoche } from "./schluesselepoche.mjs";
import { rollenSitzungOhneFaktor, zweifaktorRolle } from "./betreiber-zweifaktor.mjs";
import { kontoFaktorAktiv } from "./kontofaktor.mjs";
import { istWiderrufen } from "./widerrufbuch.mjs";

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
 *   mitMerkmal: boolean, widerruf?: {grund: string, am: string, text: string}, sitzungsKennung?: string}>}
 *   `widerruf` nur bei einem widerrufenen Sicherungsschlüssel (SI-P1), für die erkennbare Absage.
 */
export async function arbeitssitzungLesen(req,
  { store = null, sicherungsschluessel = false, bestandLader = null } = {}) {
  const merkmal = merkmalAus(req);
  const keine = () => ({ sitzung: null, abgewiesen: false, grund: null, mitMerkmal: !!merkmal });
  if (!merkmal) return keine();

  const s0 = await sitzungLesen(req);
  if (!s0) {
    /* SI-P1: Ein widerrufener Sicherungsschlüssel bekommt eine erkennbare Absage statt des stummen „unbekannt",
       damit eine Sicherungsautomatisierung nicht ohne Fehlermeldung ausfällt. Gefunden wird der Vermerk nur über den
       richtigen Schlüssel; einem Außenstehenden verrät das nichts. Nur auf dem Pfad, der Schlüssel annimmt. */
    if (sicherungsschluessel) {
      const v = await widerrufsVermerk(merkmal).catch(() => null);
      if (v) return { sitzung: null, abgewiesen: true, mitMerkmal: true, grund: "sk-widerrufen", widerruf: v };
    }
    return keine();
  }
  if (s0.nurSicherung && !sicherungsschluessel) return keine();

  const ablage = store || getStore({ name: "centric", consistency: "strong" });
  const fachlich = await arbeitssitzungPruefen(ablage, s0,
    { merkmal, bestandLader: bestandLader ? () => bestandLader(s0) : null });
  if (!fachlich.ok) {
    /* Ein Sicherungsschlüssel, dessen Betrieb nicht mehr stimmt (verschoben, Kennung weg), ist ebenfalls endgültig
       abgewiesen. Ein Lesefehler am Bestand (`bestand-fehler`) ist es nicht. */
    let widerruf = null;
    if (s0.nurSicherung && merkmal && "grund" in fachlich && fachlich.grund !== "bestand-fehler") {
      const g = grundAusPruefung(fachlich.grund);
      await schluesselWiderrufen(sicherungsSchluessel(merkmal), s0, g);
      widerruf = await widerrufsVermerk(merkmal).catch(() => null);
    }
    return { sitzung: null, abgewiesen: true, mitMerkmal: true,
      grund: "grund" in fachlich ? fachlich.grund : "unbekannt", ...(widerruf ? { widerruf } : {}) };
  }
  /* SI-P1: Ein Sicherungsschlüssel gilt nur, solange sein Ersteller noch die Leitung dieses Betriebs ist. */
  if (s0.nurSicherung) {
    const e = await sicherungsschluesselPruefen(ablage, s0,
      { bestandLader: bestandLader ? () => bestandLader(s0) : null });
    if (!e.ok) {
      /* Eine eindeutige Absage ist endgültig: Der Schlüssel wird entfernt und lebt nicht wieder auf, wenn der Zugang
         entsperrt, die Personalliste zurückgespielt oder die Person erneut eingetragen wird. Bei einem Lesefehler
         (nicht beurteilbar) bleibt er liegen. */
      let widerruf = null;
      if (e.endgueltig && merkmal) {
        await schluesselWiderrufen(sicherungsSchluessel(merkmal), s0, grundAusPruefung(e.grund));
        widerruf = await widerrufsVermerk(merkmal).catch(() => null);
      }
      return { sitzung: null, abgewiesen: true, mitMerkmal: true, grund: e.grund, ...(widerruf ? { widerruf } : {}) };
    }
  }
  /* SI-P4, Review-Auflagen M1/M2: Unter Pflicht gilt eine Sitzung mit der Rolle Leitung, Planung oder Kunde nur, wenn
     sie mit bestandenem zweitem Faktor entstand — auf JEDEM Pfad, der hier liest (auch Zugang sperren, Kalender,
     Zustellung). Die wirksame Rolle aus dem Bestand prüft daten.mjs zusätzlich. Die Sitzung endet. */
  if (rollenSitzungOhneFaktor(s0)) {
    await sitzungBeenden(merkmal);
    return { sitzung: null, abgewiesen: true, mitMerkmal: true, grund: "zweifaktor-pflicht" };
  }
  /* WP-48.3: eine Kennung genau dieser Sitzung (Hashwert, nie das Merkmal selbst) — für Vermerke, die an der
     Sitzung hängen (Wiederholschutz der Teilspeicherung). Doppelt gehasht, also nicht der Ablageschlüssel `t:`. */
  const sitzungsKennung = createHash("sha256").update(`sitzung|${createHash("sha256").update(String(merkmal)).digest("hex")}`).digest("hex").slice(0, 40);
  return { sitzung: s0, abgewiesen: false, grund: null, mitMerkmal: true, sitzungsKennung };
}

/* ==========================================================================
   SICHERUNGSSCHLÜSSEL UND IHR ERSTELLER (SI-P1)

   Ein Schlüssel `sk:` gilt bis zu 365 Tage für die Vollausgabe eines ganzen
   Betriebs. Er war nur an den Betrieb gebunden: Sperre, Entzug der
   Mitgliedschaft und Herabstufung seines Erstellers ließen ihn bestehen. Wer
   als Leitung ausschied, konnte ein Jahr lang weiter exportieren.

   Jetzt trägt der Datensatz seinen Ersteller, und bei jedem Lesen wird
   gefragt, ob der noch ist, was er beim Anlegen war: die Leitung dieses
   Betriebs. Widerrufen wird dadurch ohne Zutun und ohne Liste: Sperrt jemand
   den Zugang, entzieht die Mitgliedschaft oder stuft die Person herab, endet
   der Schlüssel mit der nächsten Anfrage. Ein Schlüssel ohne Ersteller (aus der
   Zeit davor) ist nicht prüfbar und gilt nicht.

   Nicht gebunden wird an die ANMELDUNG des Erstellers. Der Schlüssel soll
   gerade ohne ihn weiterlaufen, etwa in einem Sicherungsskript; das Abmelden
   beendet ihn nicht.

   Zwei Arten von Erstellern, wie es zwei Arten von Sitzungen gibt:

     konto   eine Sitzung aus einem Konto. Geprüft werden dieselben Anker wie
             bei der Arbeitssitzung, nur ohne die Anmeldung selbst: Konto
             aktiv, Epoche, Mitgliedschaft aktiv, Generation, Person.
     code    eine Sitzung aus einem Zugangscode. Geprüft wird der Zugang
             (`konto:<Prüfsumme>`): vorhanden, nicht gesperrt, weiterhin
             Leitung, derselbe Raum und Betrieb, dieselbe Person.

   Beide zusätzlich: Die Person steht noch im Betrieb, und ihre wirksame Rolle
   (`wirksameRolle`, aus der Personalliste) ist weiterhin „leitung".
   ========================================================================== */

const nichtLeer = (x) => typeof x === "string" && x.length > 0;

/**
 * Der Ersteller, wie er im Schlüssel steht, aus der Sitzung der Leitung, die ihn anlegt.
 * `null`, wenn die Sitzung weder Konto noch Zugang erkennen lässt — dann wird kein
 * Schlüssel angelegt, den später niemand prüfen könnte.
 * @param {any} sitzung
 * @returns {object|null}
 */
export function sicherungsschluesselErsteller(sitzung) {
  if (!sitzung || typeof sitzung !== "object") return null;
  const name = nichtLeer(sitzung.name) ? sitzung.name.slice(0, 80) : "Leitung";
  const person = sitzung.person === undefined || sitzung.person === null ? null : String(sitzung.person);
  let e = null;
  if (hatHerkunft(sitzung) && ankerBrauchbar(sitzung.herkunft)) {
    const h = sitzung.herkunft;
    e = { art: "konto", accountId: h.accountId, epoche: h.epoche, generation: h.generation, person, name };
  } else if (!hatHerkunft(sitzung) && nichtLeer(sitzung.konto)) {
    e = { art: "code", konto: sitzung.konto, person, name };
  }
  return e && erstellerBrauchbar(e) ? e : null;
}

/** Ist das ein Ersteller der unterstützten Form? Alles andere ist kaputt, nicht alt. */
function erstellerBrauchbar(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return false;
  if (e.person !== null && !nichtLeer(e.person)) return false;
  if (e.art === "konto") {
    return nichtLeer(e.accountId) && Number.isInteger(e.epoche) && e.epoche >= 1
      && Number.isInteger(e.generation) && e.generation >= 1 && nichtLeer(e.person);
  }
  if (e.art === "code") return nichtLeer(e.konto);
  return false;
}

/**
 * Gilt der Ersteller dieses Sicherungsschlüssels noch als Leitung seines Betriebs?
 *
 * Wirft nur bei einem vorübergehend nicht lesbaren Bestand (→ 503, der Schlüssel
 * bleibt). Jeder andere Fehler beim Prüfen schließt die Tür: lieber ein Export
 * zu wenig als einer zu viel.
 *
 * @param {object} store  Ablage „centric"
 * @param {any} sk  der Datensatz des Schlüssels
 * @param {{bestandLader?: (() => Promise<object|null>)|null}} [o]
 * @returns {Promise<{ok: true, grund?: undefined, endgueltig?: undefined}|{ok: false, grund: string, endgueltig: boolean}>}
 */
export async function sicherungsschluesselPruefen(store, sk, { bestandLader = null } = {}) {
  /* `endgueltig`: Die Absage hängt an einem Zustand der Welt (gesperrt, ausgetreten, herabgestuft, kein Ersteller),
     nicht an einem Lesefehler. Nur solche Schlüssel werden entfernt. */
  /** @type {(grund: string, endgueltig?: boolean) => {ok: false, grund: string, endgueltig: boolean}} */
  const nein = (grund, endgueltig = true) => ({ ok: false, grund, endgueltig });
  const unklar = (grund) => nein(grund, false);
  if (!sk || typeof sk !== "object") return nein("sk-keine-sitzung");
  const e = sk.ersteller;
  if (e === undefined || e === null) return nein("sk-ersteller-fehlt");
  if (!erstellerBrauchbar(e)) return nein("sk-ersteller-form");
  const raum = sk.bestand;
  if (!nichtLeer(raum)) return nein("sk-kein-raum");
  /* Der Betrieb, für den der Schlüssel angelegt wurde: seine Kennung ist Pflicht. */
  if (!nichtLeer(sk.mandantId) || !Number.isInteger(sk.betrieb)) return nein("sk-ohne-betrieb");
  /* Wiederherstellungsschutz (schluesselepoche.mjs): Ein Schlüssel gilt nur in der Epoche, in der er angelegt wurde.
     Nach einer vollständigen Wiederherstellung der Ablage gibt es eine neue, und jeder frühere Schlüssel ist endgültig
     ungültig. Lässt sich die Epoche nicht feststellen, gilt keiner (nicht beurteilbar: abgewiesen, nicht entfernt). */
  if (!nichtLeer(sk.epoche)) return nein("sk-ohne-epoche");
  let epoche;
  try { ({ epoche } = await schluesselEpoche()); } catch { return unklar("sk-epoche-fehler"); }
  if (sk.epoche !== epoche) return nein("sk-wiederherstellung");

  if (e.art === "konto") {
    let konto;
    try { konto = await accountLesenPerId(store, e.accountId); } catch { return unklar("sk-account-fehler"); }
    /* accountLesenPerId und mitgliedschaftLesen machen aus einem Lesefehler ein null: „fehlt" und „nicht lesbar"
       lassen sich nicht trennen. Der Schlüssel wird deshalb abgewiesen, aber nicht entfernt. */
    if (!konto) return unklar("sk-account-fehlt");
    if (konto.status !== "aktiv") return nein("sk-account-status");
    if ((Number(konto.epoche) || 0) !== e.epoche) return nein("sk-epoche");
    let m;
    try { m = await mitgliedschaftLesen(store, e.accountId, raum); } catch { return unklar("sk-mitglied-fehler"); }
    if (!m) return unklar("sk-mitglied-fehlt");
    if (m.status !== "aktiv") return nein("sk-mitglied-status");
    const lauf = await mitgliedlaufLesen(store, e.accountId, raum);
    if (!lauf.ok) return /** @type {any} */ (lauf).grund === "fehler" ? unklar("sk-lauf") : nein("sk-lauf");
    if (!generationStimmt(m, lauf.generation)) return nein("sk-generation-mitglied");
    if (e.generation !== lauf.generation) return nein("sk-generation");
    if (String(m.person || "") !== String(e.person)) return nein("sk-person-gewechselt");
    if (m.mandantId !== sk.mandantId) return nein("sk-betrieb-gewechselt");
  } else {
    let z;
    try { z = await kontoLesenStreng(store, e.konto); } catch { return unklar("sk-zugang-fehler"); }
    if (!z) return nein("sk-zugang-fehlt");
    /* Ein umgeschlüsselter Zugang steht unter mehreren Schlüsseln (A → B → …); die Sperre trifft sie, aber nicht
       zwingend im selben Augenblick. Gilt einer der Kette als gesperrt, gilt der Zugang als gesperrt. Die Kette wird
       begrenzt und gegen Zyklen gesichert. */
    const gesehen = new Set([e.konto]);
    for (let zeiger = z, tiefe = 0; ; tiefe++) {
      if (zeiger.gesperrt) return nein("sk-zugang-gesperrt");
      if (!nichtLeer(zeiger.ersetztDurch) || gesehen.has(zeiger.ersetztDurch)) break;
      if (tiefe >= 5) return nein("sk-zugang-kette");
      gesehen.add(zeiger.ersetztDurch);
      try { zeiger = await kontoLesenStreng(store, zeiger.ersetztDurch); } catch { return unklar("sk-zugang-fehler"); }
      if (!zeiger) return nein("sk-zugang-gesperrt");
    }
    /* Wie bei der Anmeldung: ein Demozugang und ein abgelaufener Testzeitraum sind keine Leitung. */
    if (z.demo === true) return nein("sk-zugang-demo");
    if (z.laeuftAb && !(new Date(z.laeuftAb).getTime() >= Date.now())) return nein("sk-zugang-abgelaufen");
    if (z.rolle !== "leitung") return nein("sk-zugang-rolle");
    if (z.bestand !== raum) return nein("sk-zugang-raum");
    if (nichtLeer(z.mandantId)) {
      if (z.mandantId !== sk.mandantId) return nein("sk-betrieb-gewechselt");
    } else if (Number(z.betrieb ?? 0) !== sk.betrieb) {
      /* Ein Zugang ohne Betriebskennung ist über den Index gebunden. */
      return nein("sk-betrieb-gewechselt");
    }
    const zPerson = z.person === undefined || z.person === null ? null : String(z.person);
    if (zPerson !== e.person) return nein("sk-person-gewechselt");
    /* E-D1 / Befund F-0: Ein Schlüssel aus einem Leitungscode ohne Person ist kein Weg mehr an die Daten. */
    if ((zPerson === null || zPerson === "") && await erstleitungStreng(store, raum, sk.mandantId)) return nein("sk-ohne-person");
  }

  let gelesen;
  try {
    gelesen = bestandLader ? await bestandLader() : await bestandLesen(store, raum);
  } catch (err) {
    if (voruebergehend(err)) throw err;
    return unklar("sk-bestand-fehler");
  }
  const bestand = gelesen && gelesen.bestand;
  if (!bestand) return nein("sk-bestand-fehlt");
  const grundM = mandantPruefen(bestand, sk.betrieb, sk.mandantId);
  if (grundM) return nein(`sk-${grundM}`);
  if (e.person !== null) {
    /* Dieselbe strenge Regel wie bei der Code-Sitzung (SI-P2, personengueltig.mjs): genau einmal im Betrieb, nicht
       anonymisiert, aktiv, nicht ausgetreten. Ein Schlüssel einer ausgetretenen Leitung macht keine Vollausgabe. */
    const mandant = eigenerMandant(bestand, { betrieb: sk.betrieb });
    if (!aktivePerson(mandant, e.person, heuteBerlin())) return nein("sk-person-fehlt");
  }
  /* Die wirksame Rolle des Erstellers, aus der Personalliste abgeleitet wie bei jeder Anfrage. */
  const rolle = wirksameRolle({ rolle: "leitung", person: e.person, betrieb: sk.betrieb, mandantId: sk.mandantId }, bestand);
  if (rolle !== "leitung") return nein("sk-rolle");
  return { ok: true };
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
    if (!z) break;
    if (z.gesperrt) return true;
    schluessel = z.ersetztDurch;
  }
  /* E-M6 (Review, Befund 4): Steht ein Glied der Kette im Widerrufbuch (außerhalb der gesicherten Ablage), gilt die
     Sitzung nicht — auch wenn eine zurückgespielte Ablage den Zugang ungesperrt zeigt. Ist das Buch nicht prüfbar,
     gilt sie ebenso wenig wie eine Anmeldung mit dem Code: vorübergehend (→ 503), keine Absage und kein 401. Kosten:
     ein stat je Prüfung, das Buch selbst liegt im Speicher (widerrufbuch.mjs, buchGeprueft). */
  let widerrufen;
  try { widerrufen = await istWiderrufen(store, [...gesehen]); }
  catch (e) {
    const f = /** @type {Error & {code?: string}} */ (new Error(`Widerrufbuch nicht prüfbar (${String(e && e.message || e)})`));
    f.code = BESTAND_UNLESBAR;
    throw f;
  }
  return widerrufen;
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
    /* E-D1 / Befund F-0 (Betreiberentscheidung 2026-11-13): Eine Sitzung aus einem Leitungscode OHNE Person trägt
       keine Leitungsrechte mehr — auch eine, die vor dieser Änderung entstand. Die Anmeldung stellt keine mehr aus
       (daten.mjs); eine noch liegende endet hier, auf jedem Pfad. Demozugänge und Betreiber bleiben, wie sie sind. */
    if (!sitzung.nurSicherung && sitzung.rolle === "leitung" && sitzung.demo !== true && !personGebunden
      && await erstleitungStreng(store, sitzung.bestand, sitzung.mandantId)) {
      if (merkmal) await sitzungBeenden(merkmal).catch(() => false);
      return { ok: false, grund: "leitung-ohne-person" };
    }
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
  /* 1b. OPT-1-F, Befund 3 (Zusatzprüfung): Hängt diese Arbeit an einer Anmeldung OHNE bestandenen Faktor, und hat das
     Konto inzwischen einen aktiven Faktor, gilt sie nicht mehr — auch wenn Abmelden oder Epoche nach der Aktivierung
     scheiterten. Ein Lesefehler schließt die Tür, räumt aber nichts weg. */
  if (/** @type {any} */ (anm).zweifaktor !== true) {
    let aktiv;
    try { aktiv = await kontoFaktorAktiv(store, h.accountId); }
    catch { return { ok: false, grund: "konto-faktor-fehler" }; }
    if (aktiv) return absage("konto-faktor");
  }

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
  /* Trägt die Sitzung eine Betriebskennung (betriebsauswahl.mjs, kennungZulaessig), muss es die der Mitgliedschaft
     sein. Sitzungen ohne Kennung bleiben, wie sie sind. */
  if (Object.prototype.hasOwnProperty.call(sitzung, "mandantId") && sitzung.mandantId !== undefined
    && String(sitzung.mandantId) !== String(m.mandantId)) return absage("mandant-gewechselt");
  const mandant = eigenerMandant(bestand, { betrieb: sitzung.betrieb });
  const dabei = (Array.isArray(mandant.personen) ? mandant.personen : [])
    .some((p) => p && String(p.id) === String(person));
  if (!dabei) return absage("person-fehlt");
  /* Auflage A1 (Sicherheitsreview 181b4fe): Dabei sein reicht nicht — die Person muss im Betrieb noch gelten, nach
     derselben Regel wie im Code-Zweig oben (sitzungPersonGilt → aktivePerson: genau einmal, nicht anonymisiert, nicht
     deaktiviert, nicht ausgetreten). Für jede Kontositzung, nicht nur für eine mit Funktionsrolle oder Kennung. Trägt
     die Sitzung eine Kennung, ist sie oben schon als die der Mitgliedschaft und der Position bestätigt; beide Wege
     wählen denselben Betrieb. Die Absage räumt die Sitzung weg und nennt nur den Grund, keine Personendaten. */
  if (!sitzungPersonGilt(bestand, sitzung, heuteBerlin(new Date(jetzt())))) return absage("person-fort");

  /* 6. OPT-4: Konto mit Faktorpflicht (`faktorPflicht`, accounts.mjs). Hängt diese Arbeit an einer Anmeldung OHNE
     bestandenen Faktor, trägt sie keine Rechte von Leitung, Planung oder Kunde — weder nach der Rolle beim Anlegen noch
     nach der jetzt wirksamen Rolle der Person (Rollenwechsel nach der Auswahl: als Mitarbeiter gewählt, danach zur
     Leitung gemacht). Unabhängig vom Schalter; dort gilt zusätzlich rollenSitzungOhneFaktor. Die Sitzung endet. */
  if (konto.faktorPflicht === true && /** @type {any} */ (anm).zweifaktor !== true
    && (zweifaktorRolle(sitzung.rolle) || zweifaktorRolle(wirksameRolle(sitzung, bestand))))
    return absage("konto-faktor-pflicht");

  return { ok: true, art: HERKUNFT_KONTO };
}
