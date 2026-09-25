/* ==========================================================================
   PROVISIONIERUNG — ein Testbetrieb entsteht

   Zwei Wege führen hierher, und sie teilen genau das, was wirklich
   gemeinsam ist: die Raumkennung, der leere Betrieb, die dreißig Tage, das
   Schreiben des Bestands.

     Legacy (/starten)   ein Interessent legt einen Betrieb an und bekommt
                         Zugangscodes im Klartext zurück. Kein Account,
                         keine Person, keine Mitgliedschaft.

     Account             ein vollständig registrierter Mensch bekommt seinen
                         einen kostenlosen Testbetrieb: mit echter
                         Leitungsperson, mit Mitgliedschaft, ohne
                         Zugangscode.

   Was NICHT gemeinsam ist, bleibt getrennt: Zugangscodes, HTTP-Antworten,
   Bremse, Herkunftsprüfung, der Vermerk in der Nachfassliste und das
   Protokoll gehören dem Legacy-Weg; die Mitgliedschaft gehört dem
   Accountweg. Eine Funktion, die beides täte, wäre die Stelle, an der
   später aus Versehen ein Zugangscode für einen Account entsteht.

   ---------------------------------------------------------------------------
   Die Transaktionsgrenze

   Die Ablage kennt keine Transaktion. Zum Accountvorgang gehören logisch
   fünf Dinge: Raum, Leitungsperson, Mitgliedschaft, Raumindex und der
   Vermerk, dass der kostenlose Test verbraucht ist. Zwei davon entstehen
   in einem Zug — die Person wird in den Betrieb geschrieben, bevor er
   überhaupt abgelegt wird, also gibt es keinen Zwischenzustand mit Raum
   ohne Person.

   Der Verbrauch ist der letzte Schritt. Vorher ist der Anspruch offen, und
   ein abgebrochener Vorgang darf ihn nicht kosten.

   Scheitert etwas nach der Raumanlage, wird der Raum über den zentralen
   Löschpfad (raumloeschung.mjs) entfernt — nicht über eine eigene Liste
   von Schlüsseln, die beim nächsten neuen Schlüsselnamen unvollständig
   wäre. Der Account bleibt dabei immer: Er war vorher da, und eine
   gescheiterte Provisionierung ist kein Grund, einen Menschen zu löschen.

   ---------------------------------------------------------------------------
   Der Fall, der ohne Vermerk nicht lösbar wäre

   Raum, Person und Mitgliedschaft stehen, der Verbrauch scheitert, und das
   Rollback scheitert auch. Ohne weitere Angabe sähe der nächste Versuch
   einen Account mit offenem Anspruch und legte einen zweiten Raum an.

   Deshalb wird der geplante Raumname VOR der Anlage im Account vermerkt
   (`testbetriebRaum`). Damit ist der nächste Versuch entscheidbar, ohne zu
   raten:

     Vermerk steht, Raum existiert, alles vollständig
       → Vorgang zu Ende bringen: Verbrauch nachziehen, Erfolg melden.
     Vermerk steht, Raum existiert, etwas fehlt
       → aufräumen und Fehler melden; der Anspruch bleibt offen.
     Vermerk steht, Raum existiert nicht
       → Vermerk abräumen und neu beginnen.

   Das ist eine Angabe über genau diesen Vorgang, keine Ableitung aus
   irgendeiner Mitgliedschaft. Eine fremde Mitgliedschaft in einem fremden
   Betrieb beweist nichts und wird hier nie gelesen.
   ========================================================================== */

import { randomBytes } from "node:crypto";
import { baueLeerenBetrieb } from "./leerbetrieb.mjs";
import { bestandSchreiben, bestandLesen, raumBelegt } from "./bestand.mjs";
import { raumLoeschen } from "./raumloeschung.mjs";
import { TESTTAGE } from "./aufraeumen.mjs";
import {
  accountLesenPerId, accountAendern, testbetriebOffen, testbetriebVerbrauchen,
  profilPruefen, mitgliedschaftAnlegen, mitgliedschaftLesen,
  raummitgliedSchluessel,
} from "./accounts.mjs";

const TAG_MS = 86400000;

/** Der Absagegrund eines Ergebnisses — oder eine leere Zeichenkette. Die
    Speicherfunktionen liefern `{ ok: true, … }` oder `{ ok: false, grund }`;
    dieser Griff kommt an den Grund, ohne jede Abfrage zu verzweigen. */
const grundVon = (e) => (e && "grund" in e ? String(e.grund) : "");

/* --------------------------------------------------------------------------
   RAUMKENNUNG

   Wortwörtlich aus starten.mjs hierher gezogen, damit beide Wege dieselbe
   Kennung bilden. Lesbarer Anteil aus dem Betriebsnamen, damit ein
   Betreiber in seiner Konsole erkennt, wovon er spricht; danach fünf
   Zeichen aus dem verwechslungsarmen Alphabet.

   Der Zufallsanhang ist kein Geheimnis und soll keines sein: Ein Raumname
   allein öffnet nichts. Er verhindert Kollisionen und macht den Namen nicht
   erratbar genug, um ihn durchzuprobieren.
   -------------------------------------------------------------------------- */

const RAUM_ALPHABET = "acdefghjkmnpqrtuvwxy34679";

/** Ein lesbarer Raumname aus dem Betriebsnamen, mit Zufallsanhang. */
export function raumKennung(name) {
  const rein = String(name || "betrieb").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "betrieb";
  const anhang = Array.from(randomBytes(5))
    .map((b) => RAUM_ALPHABET[b % RAUM_ALPHABET.length]).join("");
  return `t-${rein}-${anhang}`;
}

/** Eine Personenkennung nach dem Muster der Anwendung — aber aus dem
    Zufallsgenerator des Betriebssystems statt aus Math.random. */
export const neuePersonId = () => `p_${randomBytes(5).toString("hex").slice(0, 7)}`;

const heute = () => new Date().toISOString().slice(0, 10);

/* --------------------------------------------------------------------------
   DER GEMEINSAME KERN
   -------------------------------------------------------------------------- */

/**
 * Legt einen Testbetrieb an: Raumkennung bilden, Kollision prüfen, leeren
 * Betrieb bauen, Bestand schreiben.
 *
 * `personen` wird in den Betrieb geschrieben, bevor er abgelegt wird — ein
 * Schreibvorgang, kein Zwischenzustand. Der Legacy-Weg übergibt nichts und
 * bekommt damit `personen: []` wie bisher.
 *
 * `personenBauen` bekommt den fertigen Betrieb und liefert die Personen —
 * so kennt die Leitungsperson die Kennung der Einheit, der sie zugeordnet
 * wird, und trotzdem bleibt es ein Schreibvorgang.
 *
 * `raum` kann vorgegeben werden, wenn der Aufrufer die Kennung schon kennt
 * (der Accountweg vermerkt sie, bevor er schreibt). Ohne Angabe wird sie
 * aus dem Namen gebildet.
 *
 * @param {object} store
 * @param {{name?: unknown, branche?: string, email?: unknown, land?: string,
 *          raum?: string, personenBauen?: ((m: object) => object[])|null,
 *          durch?: string, jetzt?: () => number}} o
 * @returns {Promise<{ok: boolean, grund?: string, raum?: string,
 *   mandantId?: string, betrieb?: number, laeuftAb?: string, angelegt?: string,
 *   personen?: object[]}>}
 */
export async function testbetriebAnlegen(store, { name, branche, email, land,
  raum = null, personenBauen = null, durch = "Selbststart", jetzt = Date.now } = {}) {
  const kennung = raum || raumKennung(name);
  const start = new Date(jetzt());
  const laeuftAb = new Date(start.getTime() + TESTTAGE * TAG_MS);

  /* Bei fünf Zufallszeichen praktisch ausgeschlossen, aber geprüft wird
     trotzdem — und ein belegter Raum wird niemals überschrieben. */
  if (await raumBelegt(store, kennung)) return { ok: false, grund: "belegt" };

  const leer = baueLeerenBetrieb({
    name: /** @type {string} */ (name), branche,
    email: /** @type {string} */ (email), land,
    raum: kennung, laeuftAb: laeuftAb.toISOString(),
  });
  const personen = personenBauen ? personenBauen(leer.mandanten[0]) : null;
  if (personen && personen.length) leer.mandanten[0].personen = personen;

  await bestandSchreiben(store, kennung, leer, { durch });

  return { ok: true, raum: kennung,
    mandantId: leer.mandanten[0].id,
    /* Der Index, mit dem die Rechteprüfung arbeitet: Ein neuer Betrieb ist
       der erste und einzige in seinem Raum. */
    betrieb: 0,
    laeuftAb: laeuftAb.toISOString(),
    angelegt: start.toISOString(),
    personen: personen || [] };
}

/**
 * Die Leitungsperson eines neu angelegten Betriebs.
 *
 * Das Feldset folgt der Hauptperson, die die Anwendung beim Anlegen eines
 * Betriebs selbst schreibt — nicht einem Minimalobjekt, das nur eine
 * Prüfung besteht. Entscheidend ist `rolle: "leitung"`: `wirksameRolle()`
 * in rechte.mjs liest die Rolle aus der PERSON, und eine Person ohne
 * gültige Rolle fällt auf die Rolle der Sitzung zurück.
 *
 * Die E-Mail bleibt leer. Sie ist die Identität des Accounts; eine Kopie in
 * der Personalliste wäre eine zweite Wahrheit, die niemand nachpflegt.
 *
 * @param {{vorname?: unknown, nachname?: unknown}} profil
 * @param {string} einheitId
 */
export function leitungsperson(profil, einheitId) {
  const tag = heute();
  return {
    id: neuePersonId(),
    vorname: String(profil.vorname),
    nachname: String(profil.nachname),
    funktion: "Organisationsleitung",
    email: "",
    zugehoerigkeit: [{ ab: tag, einheitId }],
    eintritt: tag,
    austritt: null,
    wochenstunden: 40,
    urlaubsanspruch: 30,
    urlaubsuebertrag: 0,
    stundenuebertrag: 0,
    qualifikationen: [],
    qualNachweise: [],
    teilzeit: null,
    springer: false,
    einschraenkungen: {},
    verfuegbarkeit: { aktiv: false, raster: Array(21).fill(true) },
    nachweise: [],
    kontrastmodus: false,
    notiz: "",
    einarbeitung: null,
    benachrichtigung: { push: false, briefing: true, briefingZeit: "06:30" },
    einfuehrung: { erledigt: false, schritt: 0 },
    rolle: "leitung",
    rolleSeit: tag,
    bereich: "ALLE",
    status: "aktiv",
    imSchichtdienst: false,
  };
}

/* --------------------------------------------------------------------------
   EINE REIHE JE ACCOUNT

   Achte Aufrufe für denselben Menschen dürfen nicht acht Betriebe ergeben.
   Dieselbe prozesslokale Reihe wie in accounts.mjs und token.mjs — und
   dieselbe Grenze: Sie trägt einen schreibenden Prozess, nicht mehrere.
   -------------------------------------------------------------------------- */
const reihe = new Map();

function nacheinander(schluessel, arbeit) {
  const davor = reihe.get(schluessel) || Promise.resolve();
  const lauf = davor.then(arbeit, arbeit);
  const warten = lauf.then(() => {}, () => {});
  reihe.set(schluessel, warten);
  warten.then(() => { if (reihe.get(schluessel) === warten) reihe.delete(schluessel); });
  return lauf;
}

const textVon = (e) => String((e && e.message) || e || "unbekannt").slice(0, 200);

/**
 * Räumt einen begonnenen Vorgang ab: Raum weg, Vermerk weg.
 *
 * Gelöscht wird über den zentralen Löschpfad — er kennt alle Schlüsselarten
 * eines Raums, einschließlich Mitgliedschaft und Raumindex. Eine eigene
 * Liste wäre beim nächsten neuen Schlüsselnamen unvollständig.
 *
 * Der Account selbst wird nicht angefasst: kein Passwort, kein
 * Verifizierungsstand, kein Status, keine Kennung.
 *
 * @returns {Promise<{ok: boolean, grund?: string}>}
 */
async function zurueckrollen(store, sitzungen, accountId, raum) {
  let fehler = null;
  try {
    const e = await raumLoeschen(store, sitzungen, raum);
    if (!e.vollstaendig) {
      fehler = e.fehler.map((f) => `${f.schluessel}: ${f.grund}`).join("; ").slice(0, 300);
    }
  } catch (e) { fehler = textVon(e); }
  /* Der Vermerk geht nur weg, wenn der Raum wirklich weg ist. Bleibt er
     stehen, soll der nächste Versuch den Vorgang wiederfinden statt einen
     zweiten Raum anzulegen. */
  if (!fehler) {
    try { await accountAendern(store, accountId, { testbetriebRaum: null }); }
    catch (e) { fehler = `Vermerk blieb stehen: ${textVon(e)}`; }
  }
  return fehler ? { ok: false, grund: fehler } : { ok: true };
}

/**
 * Gibt dem Account seinen einen kostenlosen Testbetrieb.
 *
 * Kein HTTP, keine Bremse, keine Sitzung: Die Ebene darüber muss bremsen
 * (je Herkunft und je Account) und nachweisen, dass der Aufruf wirklich von
 * diesem Menschen kommt. Ohne beides darf dieser Vorgang nicht öffentlich
 * erreichbar sein.
 *
 * @param {object} store      Ablage „centric"
 * @param {object} sitzungen  Ablage „centric-sitzungen" — nur für ein Rollback
 * @param {{accountId?: unknown, jetzt?: () => number}} [o]
 * @returns {Promise<{ok: boolean, grund?: string, raum?: string,
 *   mitgliedschaft?: object, person?: string, wiederaufgenommen?: boolean,
 *   rollback?: string}>}
 */
export async function testbetriebFuerAccountAnlegen(store, sitzungen,
  { accountId, jetzt = Date.now } = {}) {
  if (!accountId || typeof accountId !== "string") return { ok: false, grund: "konto" };

  /* Vor der Reihe: Wer offensichtlich nicht berechtigt ist, wartet nicht
     erst auf andere. Innerhalb der Reihe wird erneut geprüft — dazwischen
     kann sich alles geändert haben. */
  const vorab = await accountLesenPerId(store, accountId);
  if (!vorab) return { ok: false, grund: "konto" };
  const erlaubt = testbetriebOffen(vorab);
  if (!erlaubt.ok) return { ok: false, grund: erlaubt.grund };

  return nacheinander(`prov:${accountId}`, async () => {
    const konto = await accountLesenPerId(store, accountId);
    if (!konto) return { ok: false, grund: "konto" };
    const nochOffen = testbetriebOffen(konto);
    if (!nochOffen.ok) return { ok: false, grund: nochOffen.grund };

    /* Das Profil ist die Quelle für Betriebsname und Leitungsperson. Die
       Prüfung ist dieselbe wie bei der Registrierung — keine zweite. */
    const gepruef = profilPruefen(konto.profil);
    if (!gepruef.ok) return { ok: false, grund: `profil:${gepruef.grund}` };
    const profil = gepruef.profil;

    /* Ein begonnener Vorgang? Dann diesen zu Ende bringen, nicht einen
       zweiten anfangen. */
    if (konto.testbetriebRaum) {
      const wieder = await wiederaufnehmen(store, sitzungen, konto);
      if (wieder) return wieder;
    }

    /* Die Kennung entsteht hier, damit sie vermerkt werden kann, bevor
       irgendetwas geschrieben ist. */
    const raum = raumKennung(profil.betriebsname);
    if (await raumBelegt(store, raum)) return { ok: false, grund: "belegt" };

    /* Der Vermerk der Absicht. Ab jetzt ist jeder Abbruch auflösbar. */
    const vermerkt = await accountAendern(store, konto.id, { testbetriebRaum: raum })
      .catch((e) => ({ ok: false, grund: textVon(e) }));
    if (!vermerkt.ok) return { ok: false, grund: `vermerk: ${grundVon(vermerkt)}` };

    /* Raum, Betrieb und Leitungsperson in einem Schreibvorgang. Branche und
       Bundesland kennt eine Registrierung nicht — der Betrieb startet mit
       denselben Vorgaben, die der Legacy-Weg bei fehlenden Angaben nimmt
       („sonstige", Hessen), und die Leitung ändert beides selbst. */
    let erstellt;
    try {
      erstellt = await testbetriebAnlegen(store, {
        name: profil.betriebsname, branche: "sonstige", email: null, land: null,
        raum, durch: "Selbstregistrierung", jetzt,
        personenBauen: (m) => [leitungsperson(profil, m.einheiten[0].id)],
      });
    } catch (e) {
      erstellt = { ok: false, grund: `bestand: ${textVon(e)}` };
    }
    if (!erstellt.ok) {
      /* Der Bestand kann halb geschrieben sein — abräumen und den Vermerk
         nur dann lösen, wenn wirklich nichts mehr steht. */
      const weg = await zurueckrollen(store, sitzungen, konto.id, raum);
      return { ok: false, grund: erstellt.grund || "bestand",
        ...(weg.ok ? {} : { rollback: weg.grund }) };
    }

    const person = erstellt.personen[0];

    /* Die Mitgliedschaft — über accounts.mjs, nicht über eine zweite
       Implementierung. Sie legt auch den Raumindex an. */
    const mit = await mitgliedschaftAnlegen(store, {
      accountId: konto.id,
      raum,
      betrieb: erstellt.betrieb,
      mandantId: erstellt.mandantId,
      person: person.id,
      rolle: "leitung",
      einheit: null,
      status: "aktiv",
    }).catch((e) => ({ ok: false, grund: textVon(e) }));

    if (!mit.ok) {
      const weg = await zurueckrollen(store, sitzungen, konto.id, raum);
      return { ok: false, grund: `mitgliedschaft: ${grundVon(mit)}`,
        ...(weg.ok ? {} : { rollback: weg.grund }) };
    }

    /* Beide Seiten müssen stehen, bevor der Anspruch verfällt. Gelesen wird
       nach, statt auf das Ergebnis zu vertrauen: Der Index ist ein zweiter
       Schreibvorgang. */
    const nachgelesen = await mitgliedschaftLesen(store, konto.id, raum);
    const index = await store.get(raummitgliedSchluessel(raum, konto.id), { type: "json" })
      .catch(() => null);
    if (!nachgelesen || !index) {
      const weg = await zurueckrollen(store, sitzungen, konto.id, raum);
      return { ok: false, grund: "mitgliedschaft-unvollstaendig",
        ...(weg.ok ? {} : { rollback: weg.grund }) };
    }

    /* Der letzte Schritt: Der kostenlose Testbetrieb ist verbraucht. Erst
       jetzt — vorher wäre ein abgebrochener Vorgang ein verlorener
       Anspruch. */
    const verbraucht = await testbetriebVerbrauchen(store, konto.id)
      .catch((e) => ({ ok: false, grund: textVon(e) }));
    if (!verbraucht.ok) {
      /* Raum, Person und Mitgliedschaft stehen, der Verbrauch nicht. Alles
         zurück: Dann bleibt der Anspruch offen und ein späterer Versuch
         beginnt sauber. Bleibt der Raum stehen, sagt das Ergebnis es — und
         der Vermerk bleibt, damit der nächste Versuch ihn wiederfindet und
         nicht einen zweiten Raum anlegt. */
      const weg = await zurueckrollen(store, sitzungen, konto.id, raum);
      return { ok: false, grund: `verbrauch: ${grundVon(verbraucht)}`,
        ...(weg.ok ? {} : { rollback: weg.grund }) };
    }

    return { ok: true, raum, mitgliedschaft: nachgelesen, person: person.id,
      mandantId: erstellt.mandantId, betrieb: erstellt.betrieb,
      laeuftAb: erstellt.laeuftAb };
  });
}

/**
 * Bringt einen begonnenen Vorgang zu Ende — oder räumt ihn ab.
 * @returns {Promise<object|null>} ein Ergebnis, oder null für „neu beginnen"
 */
async function wiederaufnehmen(store, sitzungen, konto) {
  const raum = konto.testbetriebRaum;
  const gelesen = await bestandLesen(store, raum).catch(() => null);
  if (!gelesen) {
    /* Der Raum ist nicht (mehr) da: Der Vermerk ist eine Absicht, die nie
       Wirklichkeit wurde. Abräumen und neu beginnen. */
    await accountAendern(store, konto.id, { testbetriebRaum: null });
    return null;
  }
  const m = await mitgliedschaftLesen(store, konto.id, raum);
  const index = await store.get(raummitgliedSchluessel(raum, konto.id), { type: "json" })
    .catch(() => null);
  const person = m && m.person
    ? (gelesen.bestand.mandanten[m.betrieb] || {}).personen?.some(
      (p) => p && String(p.id) === String(m.person))
    : false;

  if (m && index && person) {
    /* Alles da, nur der Verbrauch fehlt: nachziehen. */
    const verbraucht = await testbetriebVerbrauchen(store, konto.id);
    if (!verbraucht.ok) return { ok: false, grund: `verbrauch: ${grundVon(verbraucht)}` };
    return { ok: true, raum, mitgliedschaft: m, person: m.person, wiederaufgenommen: true };
  }

  /* Etwas fehlt: Der Raum wird abgeräumt, der Anspruch bleibt offen. */
  const weg = await zurueckrollen(store, sitzungen, konto.id, raum);
  return { ok: false, grund: "vorgang-unvollstaendig",
    ...(weg.ok ? {} : { rollback: weg.grund }) };
}
