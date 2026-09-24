/* ==========================================================================
   TOKEN — ein Recht, genau einmal, mit Frist

   Drei Vorgänge brauchen dasselbe: einen Schlüssel, der an eine Adresse
   geht und dort genau einmal etwas erlaubt.

     einladung       ein Zugang zu einem Betrieb entsteht        7 Tage
     verifizierung   eine Adresse wird als erreichbar bestätigt  24 Stunden
     zuruecksetzen   ein Passwort wird neu gesetzt               30 Minuten

   Drei Dateien dafür wären drei Kopien derselben Sorgfalt. Deshalb eine
   Mechanik mit einem Zweck als Parameter — und der Zweck ist Teil der
   Prüfung, nicht nur eine Beschriftung.

   ---------------------------------------------------------------------------
   Die vier Eigenschaften, ohne die ein Link eine offene Tür wäre

   Gehasht abgelegt — im Speicher liegt nur die Prüfsumme. Wer den
   Datenbestand liest, kann daraus keinen einzigen Link bauen; dieselbe
   Überlegung wie bei den Zugangscodes.

   Einmalig — beim Einlösen wird der Eintrag gelöscht, BEVOR über ihn
   geurteilt wird. Ein zweiter Klick findet nichts mehr vor.

   Das allein genügt aber nicht, und diese Prüfung hat es gezeigt: Acht
   gleichzeitige Einlösungen lasen alle denselben Eintrag, bevor die erste
   ihn löschte — und alle acht kamen durch. Die Dateiablage kennt kein
   bedingtes Schreiben, also lässt sich der Wettlauf nicht über einen
   Vergleich beim Schreiben entscheiden. Was hilft, ist dieselbe Antwort
   wie bei der Bremse in schutz.mjs: Innerhalb eines Prozesses ist
   JavaScript einfädig, und der Server läuft als genau ein Node-Prozess je
   Container. Eine prozesslokale Reihe je Schlüssel macht aus acht
   gleichzeitigen Versuchen acht aufeinanderfolgende — der erste findet den
   Eintrag, die übrigen finden nichts mehr.

   Wer eines Tages mehrere Instanzen fährt, braucht dafür bedingtes
   Schreiben in der Ablage. Diese Reihe ist die Untergrenze, nicht das
   Ziel — und sie ist genau die Grenze, die auch die Bremse hat.

   Befristet — die Frist gehört zum Eintrag und wird serverseitig
   gesetzt. Kein Aufrufer von außen kann sie verlängern; `FRISTEN` ist die
   einzige Quelle.

   Mit Laufnummer je Zweck — jeder Vorgang zählt seine Ausstellungen. Ein
   Token trägt die Nummer, unter der es entstand, und gilt nur, solange
   sie stimmt. Wer neu einlädt, entwertet damit jeden früheren
   Einladungslink, auch wenn dessen Frist noch liefe.

   Getrennt je Zweck, und das ist der Unterschied zum Entwurf vom August:
   Dort zählte eine gemeinsame Nummer am Konto. Eine neue Einladung
   entwertete damit einen laufenden Passwort-Reset — zwei Vorgänge, die
   nichts miteinander zu tun haben, hingen an einem Zähler. Hier hat jeder
   Zweck seinen eigenen.

   ---------------------------------------------------------------------------
   Der Aktivierungscode

   Wo kein Link ankommt — ein Telefon ohne Postfach, eine Adresse, die
   erst eingerichtet wird —, gibt es denselben Vorgang zum Abtippen:

     XXXX-XXXX-XXXX

   Zwei Eigenschaften machen ihn tragbar. Er ist an die normalisierte
   Adresse gebunden: Der Prüfwert entsteht aus Adresse UND Code, ein
   gefundener Code allein trifft also nichts. Und er gehört zur selben
   Einladung wie der Link — wer einen der beiden Wege geht, verbraucht
   beide.

   Zwölf Zeichen aus einem 25er-Alphabet sind rund 56 Bit. Das trägt gegen
   Raten nur zusammen mit einer harten Bremse am Endpunkt; die gehört
   dorthin und nicht hierher. Diese Datei stellt die Mechanik, nicht den
   Schutz vor Massenversuchen.
   ========================================================================== */

import { createHash, randomBytes } from "node:crypto";
import { mailNormieren } from "./adressen.mjs";

const PRAEFIX = "token:";
const CODE_PRAEFIX = "tokencode:";

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Die Zwecke. Was hier nicht steht, gibt es nicht. */
export const ZWECKE = ["einladung", "verifizierung", "zuruecksetzen"];

/**
 * Die Fristen in Minuten — die einzige Quelle. Bewusst keine Angabe von
 * außen: Eine Frist, die der Aufrufer setzt, ist irgendwann eine Frist,
 * die der Angreifer setzt.
 */
export const FRISTEN = {
  einladung: 7 * 24 * 60,      // 7 × 24 Stunden
  verifizierung: 24 * 60,      // 24 Stunden
  zuruecksetzen: 30,           // 30 Minuten
};

/* Verwechslungsarm: ohne 0/O, 1/I/L, 2/Z, 5/S, 8/B. Dasselbe Alphabet wie
   bei den Zugangscodes — wer einen Code am Telefon vorliest, soll nicht
   raten müssen, ob „Null" oder „O" gemeint ist. */
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
const CODE_BLOCK = 4;
const CODE_BLOECKE = 3;

/** Die Form eines Aktivierungscodes: drei Blöcke aus vier Zeichen. */
export const CODE_FORM = new RegExp(
  `^[${CODE_ALPHABET}]{${CODE_BLOCK}}(?:-[${CODE_ALPHABET}]{${CODE_BLOCK}}){${CODE_BLOECKE - 1}}$`);

/** Ein Code in Vergleichsform: Großbuchstaben, Trennstriche egal. */
export const codeNormieren = (code) =>
  String(code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Der Prüfwert eines Codes. Adresse und Code gehen zusammen hinein — ein
 * Code ohne die passende Adresse trifft damit nichts, auch wenn er richtig
 * geraten wäre.
 */
const codeSchluessel = (email, code) =>
  CODE_PRAEFIX + hash(`${mailNormieren(email)}:${codeNormieren(code)}`);

/** Ein neuer Aktivierungscode — die einzige Stelle, an der er im Klartext entsteht. */
function codeErzeugen() {
  const bloecke = [];
  for (let b = 0; b < CODE_BLOECKE; b++) {
    /* Verwerfendes Ziehen statt Modulo: 256 % 25 ≠ 0, ein Modulo würde die
       ersten Zeichen des Alphabets leicht bevorzugen. Bei einem Geheimnis
       zählt auch eine kleine Schieflage. */
    let block = "";
    while (block.length < CODE_BLOCK) {
      for (const byte of randomBytes(CODE_BLOCK * 2)) {
        if (byte >= 250) continue;                 // 250 = 10 × 25
        block += CODE_ALPHABET[byte % CODE_ALPHABET.length];
        if (block.length === CODE_BLOCK) break;
      }
    }
    bloecke.push(block);
  }
  return bloecke.join("-");
}

/* --------------------------------------------------------------------------
   LAUFNUMMERN JE ZWECK

   Der Träger ist ein Objekt `{ einladung: 3, zuruecksetzen: 1 }`. Es lebt
   dort, wo der Vorgang hingehört — später am Konto, in den Prüfungen in
   einem einfachen Objekt. Diese Datei rechnet damit, sie speichert es
   nicht: Wer die Nummer hochzählt, schreibt sie selbst fort, in demselben
   Vorgang, in dem er das Konto ohnehin anfasst.
   -------------------------------------------------------------------------- */

/** Die aktuelle Laufnummer eines Zwecks. Fehlt sie, ist sie 0. */
export function laufnummer(nummern, zweck) {
  const n = nummern && Number(nummern[zweck]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Die nächste Laufnummer eines Zwecks — als neues Objekt, damit kein
 * Aufrufer versehentlich einen fremden Zähler mitverändert.
 * @returns {{nummern: object, nr: number}}
 */
export function naechsteLaufnummer(nummern, zweck) {
  const nr = laufnummer(nummern, zweck) + 1;
  return { nummern: { ...(nummern || {}), [zweck]: nr }, nr };
}

/* --------------------------------------------------------------------------
   EINE REIHE JE SCHLÜSSEL

   Zwei Einlösungen desselben Vorgangs dürfen sich nicht überlappen. Ohne
   bedingtes Schreiben in der Ablage bleibt nur, sie im Prozess
   hintereinander zu stellen: Wer als Zweiter kommt, wartet auf den Ersten
   und liest danach ins Leere.

   Die Karte hält nur die laufenden Vorgänge; jeder räumt sich selbst weg.
   -------------------------------------------------------------------------- */
const reihe = new Map();

function nacheinander(schluessel, arbeit) {
  const davor = reihe.get(schluessel) || Promise.resolve();
  const lauf = davor.then(arbeit, arbeit);
  /* Auch ein Fehlschlag darf die Reihe nicht abreißen lassen. */
  const warten = lauf.then(() => {}, () => {});
  reihe.set(schluessel, warten);
  warten.then(() => { if (reihe.get(schluessel) === warten) reihe.delete(schluessel); });
  return lauf;
}

/* --------------------------------------------------------------------------
   AUSSTELLEN UND EINLÖSEN
   -------------------------------------------------------------------------- */

/**
 * Stellt ein Token aus. Gibt das Token zurück — die einzige Stelle, an der
 * es im Klartext existiert.
 *
 * `zweck` und `nr` sind fachlich Pflicht; fehlt der Zweck, wirft die
 * Funktion. Im Typ stehen sie als wahlfrei, weil der Aufruf ohne Argument
 * syntaktisch möglich ist — geprüft wird zur Laufzeit.
 *
 * @param {object} store  Ablage (getStore)
 * @param {{zweck?: string, nr?: number, inhalt?: object, mitCode?: boolean,
 *          email?: (string|null), jetzt?: () => number}} [o]
 * @returns {Promise<{token: string, code: (string|null), bis: number, schluessel: string}>}
 */
export async function tokenAusstellen(store, { zweck, nr, inhalt = {}, mitCode = false,
  email = null, jetzt = Date.now } = {}) {
  if (!ZWECKE.includes(zweck)) throw new Error(`Token: unbekannter Zweck „${zweck}"`);
  const minuten = FRISTEN[zweck];
  const token = randomBytes(32).toString("base64url");
  const bis = jetzt() + minuten * 60 * 1000;
  const schluessel = PRAEFIX + hash(token);

  let code = null;
  let codeS = null;
  if (mitCode) {
    if (!mailNormieren(email)) throw new Error("Token: ein Code braucht eine Adresse");
    code = codeErzeugen();
    codeS = codeSchluessel(email, code);
  }

  const eintrag = {
    zweck, nr: Number(nr) || 0, bis,
    angelegt: new Date(jetzt()).toISOString(),
    ...inhalt,
    /* Der Zeiger auf den Codeeintrag, damit das Einlösen des Links auch
       den Code entwertet. Kein Code darin, nur sein Ablageort. */
    ...(codeS ? { codeSchluessel: codeS } : {}),
  };
  await store.setJSON(schluessel, eintrag);
  if (codeS) await store.setJSON(codeS, { tokenSchluessel: schluessel, zweck, bis });

  return { token, code, bis, schluessel };
}

/**
 * Nimmt einen Eintrag endgültig aus dem Umlauf — den Token und, falls
 * vorhanden, den zugehörigen Code. Gelöscht wird, bevor geurteilt wird.
 */
async function verbrauchen(store, schluessel, eintrag) {
  await store.delete(schluessel).catch(() => {});
  if (eintrag && eintrag.codeSchluessel)
    await store.delete(eintrag.codeSchluessel).catch(() => {});
}

/**
 * Löst ein Token ein: prüft Zweck, Frist und Laufnummer, verbraucht den
 * Vorgang und gibt den Eintrag zurück.
 *
 * Wer `null` bekommt, erfährt nicht, warum — abgelaufen, entwertet,
 * falscher Zweck und nie gewesen sehen von außen gleich aus. Wer den
 * Grund fürs Protokoll braucht, findet ihn in `grund`.
 *
 * @param {object} store
 * @param {unknown} token
 * @param {{zweck?: string, nummern?: (object|null), jetzt?: () => number}} [o]
 *   `nummern`: Laufnummern des Kontos; ohne Angabe wird nicht geprüft
 * @returns {Promise<{eintrag: object|null, grund: string|null}>}
 */
export async function tokenEinloesen(store, token, { zweck, nummern = null,
  jetzt = Date.now } = {}) {
  if (!token || typeof token !== "string" || token.length < 20)
    return { eintrag: null, grund: "form" };
  const schluessel = PRAEFIX + hash(token);
  return nacheinander(schluessel, async () => {
    try {
      const eintrag = await store.get(schluessel, { type: "json" });
      if (!eintrag) return { eintrag: null, grund: "unbekannt" };
      /* Erst verbrauchen, dann urteilen: Auch ein abgelaufenes oder
         zweckfremdes Token ist nach dem ersten Versuch weg. Sonst ließe
         sich an einem liegengebliebenen Link ausprobieren, welcher Zweck
         er einmal hatte. */
      await verbrauchen(store, schluessel, eintrag);
      if (eintrag.bis < jetzt()) return { eintrag: null, grund: "abgelaufen" };
      if (zweck && eintrag.zweck !== zweck) return { eintrag: null, grund: "zweck" };
      if (nummern && laufnummer(nummern, eintrag.zweck) !== (Number(eintrag.nr) || 0))
        return { eintrag: null, grund: "entwertet" };
      return { eintrag, grund: null };
    } catch { return { eintrag: null, grund: "fehler" }; }
  });
}

/**
 * Löst einen Aktivierungscode ein — derselbe Vorgang, anderer Weg hinein.
 * Adresse und Code müssen zusammenpassen; danach gelten dieselben
 * Prüfungen wie beim Link, und beide Wege sind verbraucht.
 *
 * @param {object} store
 * @param {unknown} email
 * @param {unknown} code
 * @param {{zweck?: string, nummern?: (object|null), jetzt?: () => number}} [o]
 * @returns {Promise<{eintrag: object|null, grund: string|null}>}
 */
export async function codeEinloesen(store, email, code, { zweck, nummern = null,
  jetzt = Date.now } = {}) {
  const norm = codeNormieren(code);
  if (!mailNormieren(email) || norm.length !== CODE_BLOCK * CODE_BLOECKE)
    return { eintrag: null, grund: "form" };
  const codeS = codeSchluessel(email, code);
  /* Dieselbe Reihe wie beim Link — und über denselben Schlüssel, damit
     Link und Code sich nicht gegenseitig überholen können. */
  return nacheinander(codeS, async () => {
    try {
      const zeiger = await store.get(codeS, { type: "json" });
      if (!zeiger || !zeiger.tokenSchluessel) {
        /* Ein Fehlversuch hat nichts weggeräumt — es gibt nichts. Der
           Aufrufer bremst; hier gibt es nichts zu tun. */
        return { eintrag: null, grund: "unbekannt" };
      }
      /* Der Code ist verbraucht, sobald er richtig war — auch wenn der
         Vorgang selbst abgelaufen ist. */
      await store.delete(codeS).catch(() => {});
      /* Und nun in die Reihe des Vorgangs selbst: Sonst könnten Link und
         Code in getrennten Reihen laufen und sich überholen — beide
         Wege gehören zu einer Einladung, also auch zu einer Reihe.
         Kein Verklemmen: Der Linkweg wartet nie auf einen Codeschlüssel. */
      return nacheinander(zeiger.tokenSchluessel, async () => {
        const eintrag = await store.get(zeiger.tokenSchluessel, { type: "json" });
        if (!eintrag) return { eintrag: null, grund: "unbekannt" };
        await store.delete(zeiger.tokenSchluessel).catch(() => {});
        if (eintrag.bis < jetzt()) return { eintrag: null, grund: "abgelaufen" };
        if (zweck && eintrag.zweck !== zweck) return { eintrag: null, grund: "zweck" };
        if (nummern && laufnummer(nummern, eintrag.zweck) !== (Number(eintrag.nr) || 0))
          return { eintrag: null, grund: "entwertet" };
        return { eintrag, grund: null };
      });
    } catch { return { eintrag: null, grund: "fehler" }; }
  });
}

/**
 * Räumt abgelaufene Vorgänge weg. Beiläufig aufzurufen, nicht nötig für
 * die Sicherheit: Ein abgelaufener Eintrag lässt niemanden herein.
 * @returns {Promise<number>} wie viele entfernt wurden
 */
export async function tokenAufraeumen(store, { jetzt = Date.now } = {}) {
  let weg = 0;
  for (const praefix of [PRAEFIX, CODE_PRAEFIX]) {
    try {
      const { blobs } = await store.list({ prefix: praefix });
      for (const b of blobs) {
        const e = await store.get(b.key, { type: "json" }).catch(() => null);
        if (e && Number(e.bis) < jetzt()) { await store.delete(b.key).catch(() => {}); weg++; }
      }
    } catch { /* Aufräumen darf nie eine Anfrage scheitern lassen */ }
  }
  return weg;
}
