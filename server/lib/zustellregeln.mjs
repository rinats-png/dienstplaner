/* ==========================================================================
   ZUSTELLREGELN — was hinausgeht, wann wiederholt wird, wie viel (WP-30)

   Rein: keine Ablage, kein Versand. Die Ablage und die Kanäle stehen in
   versand.mjs; hier stehen die Entscheidungen, die sich prüfen lassen, ohne
   etwas zu senden.

   1. Inhalt. Eine Benachrichtigung nach außen (E-Mail, Push) ist ein HINWEIS
      mit Verweis in die Anwendung — nie der gespeicherte Titel oder Text der
      Mitteilung. Titel und Text können Namen Dritter, Gesundheitsangaben
      (Notruf: „Medizinischer Notfall“, Notiz), Schutzmerkmale, Zeiten oder
      Dienste enthalten. E-Mail liegt in fremden Postfächern, Push auf dem
      Sperrbildschirm: Dort gilt Datensparsamkeit (Art. 5 Abs. 1 lit. c, Art.
      32 DSGVO). Die Sichtregeln der Anwendung (H8+: nur eigene Stempel,
      Ist-Zeiten je Rolle) bleiben so von selbst gewahrt: Aus der
      Benachrichtigung lässt sich nichts ablesen, was die Rolle in der
      Anwendung nicht sehen dürfte. Wer den Inhalt braucht, öffnet die
      Anwendung — dort greifen die Sichten.

   2. Entwurfsregel (WP-23). Eine Mitteilung zu einem Tag in einem nicht
      freigegebenen Monat geht nicht an Beschäftigte hinaus. Der Tag steht
      als `tag` (JJJJ-MM-TT) an der Mitteilung; fehlt er, gibt es nichts zu
      prüfen. Steht ein ungültiger Wert dort, gilt sie als Entwurf
      (fail-closed, wie istEntwurfstag).

   3. Wiederholung. Nach einem vorübergehenden Fehler wird nach wachsenden
      Abständen erneut versucht (Backoff), höchstens so oft, wie der Plan
      Abstände hat, plus der erste Versuch. Ein dauerhafter Fehler wird nie
      wiederholt.

   4. Kontingente. Je Person, Kanal und Tag und je Betrieb, Kanal und Tag
      (Tag nach Berliner Zeit). Dringende Arten sind von der Personenbremse
      ausgenommen (ein Notruf darf nicht an einer Tagesgrenze hängen), nicht
      von der Betriebsbremse; für sie ist ein Teil der Betriebsgrenze
      reserviert, und sie sind je Empfänger und Quelle sowie je Quelle
      begrenzt (Flut-Schutz). Ist die Betriebsgrenze erreicht, wird
      zurückgestellt (nächster Tag), nicht verworfen (Nachtrag Opus-Review).
   ========================================================================== */

import { istEntwurfstag, laufenderTag } from "./planfreigabe.mjs";

/* ---------------------------------------------------------------- Inhalt */

/** Neutrale Titel je Art — ohne Personen, Zeiten, Orte, Gesundheitsbezug. */
export const HINWEIS_TITEL = {
  antragEntschieden: "Antrag entschieden",
  planGeaendert: "Dienstplan geändert",
  planFreigegeben: "Monatsplan freigegeben",
  einspringen: "Dringende Anfrage",
  offeneSchicht: "Offene Schicht",
  tauschAngebot: "Tauschangebot",
  urlaubVerfaellt: "Hinweis zum Urlaub",
  aushang: "Neuer Aushang",
};
const ALLGEMEIN = "Neue Mitteilung";
const HINWEIS_TEXT = "Bitte in CENTRIC öffnen.";
const NOTRUF_TITEL = "Dringende Mitteilung";
const NOTRUF_TEXT = "Bitte sofort in CENTRIC öffnen.";

const istNotruf = (n) => n && (n.ziel === "notruf" || /^n-notruf-/.test(String(n.id)));

/**
 * Titel und Text der Benachrichtigung. Aus der Mitteilung wird nur die ART
 * (und ob es ein Notruf ist) gelesen — nie Titel, Text, Namen.
 * @param {{art?: string, ziel?: string, id?: string}} n
 * @returns {{titel: string, text: string}}
 */
export function hinweis(n) {
  if (istNotruf(n)) return { titel: NOTRUF_TITEL, text: NOTRUF_TEXT };
  const art = n && Object.prototype.hasOwnProperty.call(HINWEIS_TITEL, n.art) ? n.art : null;
  return { titel: art ? HINWEIS_TITEL[art] : ALLGEMEIN, text: HINWEIS_TEXT };
}

/** Ein Name (Betrieb) für Betreff und Fußzeile: eine Zeile ohne Steuerzeichen
    (kein CR/LF — keine Kopfzeilen-Injektion), höchstens `max` Zeichen
    (Nachtrag Opus-Review B2). */
export const einzeilig = (s, max = 80) => String(s ?? "")
  // eslint-disable-next-line no-control-regex -- Steuerzeichen sind genau das, was hier entfernt wird
  .replace(/[\u0000-\u001f\u007f-\u009f\u{2028}\u{2029}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Das Ziel für den Klick auf die Benachrichtigung: nur ein kurzes Stichwort. */
export const pushZiel = (n) => (n && typeof n.ziel === "string" && /^[a-z]{1,20}$/.test(n.ziel) ? n.ziel : null);

/* ----------------------------------------------------------- Entwurfsregel */

/** Rollen, für die die Entwurfsregel nicht gilt: Planung, Leitung, Kunde.
    Schichtverantwortung und Betriebsrat sehen Entwürfe in der Anwendung zwar
    auch (sicht.mjs), stehen hier aber bewusst nicht: Für sie ist die Regel
    strenger als nötig — harmlos, sie öffnen den Entwurf in der Anwendung
    (Nachtrag Opus-Review B6). */
const SIEHT_ENTWUERFE = ["planer", "leitung", "kunde"];
const TAG_FORM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ist diese Mitteilung für diese Person ein Hinweis auf einen Entwurf?
 * @param {any} m  Betrieb
 * @param {any} n  Mitteilung
 * @param {any} p  Empfänger
 * @param {string} [heute]
 */
export function betrifftEntwurf(m, n, p, heute = laufenderTag()) {
  if (!n || n.tag === undefined || n.tag === null) return false;
  if (p && SIEHT_ENTWUERFE.includes(p.rolle)) return false;
  if (typeof n.tag !== "string" || !TAG_FORM.test(n.tag)) return true;
  return istEntwurfstag(m, n.tag, heute);
}

/* ---------------------------------------------------------------- Backoff */

const BACKOFF_VORGABE_S = [60, 300, 1800, 7200];

/** Abstände in Sekunden vor Versuch 2, 3, … Aus CENTRIC_ZUSTELL_BACKOFF (Komma). */
export function backoffPlan(env = process.env.CENTRIC_ZUSTELL_BACKOFF) {
  if (env === undefined || env === null || String(env).trim() === "") return BACKOFF_VORGABE_S;
  const teile = String(env).split(",").map((x) => Number(x.trim()));
  if (!teile.length || teile.length > 10 || teile.some((x) => !Number.isFinite(x) || x < 0 || x > 7 * 24 * 3600))
    return BACKOFF_VORGABE_S;
  return teile;
}

/** Höchstzahl der Versuche (erster Versuch + Wiederholungen). */
export const versucheMax = (plan = backoffPlan()) => plan.length + 1;

/** Frühester Zeitpunkt (ms) für den Versuch nach `versuch` (1-basiert). */
export const naechsterVersuch = (versuch, jetzt, plan = backoffPlan()) =>
  jetzt + 1000 * plan[Math.min(Math.max(versuch, 1) - 1, plan.length - 1)];

/* ------------------------------------------------------------ Kontingente */

const grenze = (name, vorgabe) => {
  const w = Number(process.env[name]);
  return Number.isInteger(w) && w >= 0 && w <= 100000 ? w : vorgabe;
};

/* Nachtrag Opus-Review (B1): Ein Teil der Betriebsgrenze ist für dringende
   Arten reserviert. Normale Arten (z. B. „Monatsplan freigegeben“ an alle)
   dürfen höchstens `betrieb − reserve` belegen; dringende nehmen zuerst
   diesen Teil und dann die Reserve. Vorgabe: ein Viertel der
   Betriebsgrenze, höchstens 50 (Mail) bzw. 250 (Push); ausdrücklich gesetzt
   höchstens die Betriebsgrenze. */
const reserve = (name, betrieb, hoechstens) => {
  const roh = process.env[name];
  if (roh !== undefined && String(roh).trim() !== "") {
    const w = Number(roh);
    if (Number.isInteger(w) && w >= 0 && w <= 100000) return Math.min(w, betrieb);
  }
  return Math.min(hoechstens, Math.floor(betrieb / 4));
};

/**
 * Obergrenzen je Tag. 0 sperrt den Kanal. Über die Umgebung einstellbar.
 * - person*: je Empfänger, nur normale Arten (Empfängerschutz; was darüber
 *   liegt, wird nicht gesendet — die Mitteilung steht im Postfach).
 * - betrieb*: je Betrieb, alle Arten; davon reserve* nur für dringende.
 * - paar*: dringende Arten je Empfänger und Quelle (Flut-Schutz: viele
 *   Notrufe derselben Person an dieselbe Planerin).
 * - quelle*: dringende Mitteilungen aus Vorgängen einer Person (Notruf),
 *   über alle Empfänger.
 */
export function kontingente() {
  const betriebMail = grenze("CENTRIC_ZUSTELL_BETRIEB_MAIL", 200);
  const betriebPush = grenze("CENTRIC_ZUSTELL_BETRIEB_PUSH", 1000);
  return {
    personMail: grenze("CENTRIC_ZUSTELL_PERSON_MAIL", 10),
    personPush: grenze("CENTRIC_ZUSTELL_PERSON_PUSH", 30),
    betriebMail,
    betriebPush,
    reserveMail: reserve("CENTRIC_ZUSTELL_RESERVE_MAIL", betriebMail, 50),
    reservePush: reserve("CENTRIC_ZUSTELL_RESERVE_PUSH", betriebPush, 250),
    paarMail: grenze("CENTRIC_ZUSTELL_DRINGEND_PAAR_MAIL", 5),
    paarPush: grenze("CENTRIC_ZUSTELL_DRINGEND_PAAR_PUSH", 10),
    quelleMail: grenze("CENTRIC_ZUSTELL_DRINGEND_QUELLE_MAIL", 20),
    quellePush: grenze("CENTRIC_ZUSTELL_DRINGEND_QUELLE_PUSH", 40),
  };
}

/** Der Tag der Kontingente (JJJJ-MM-TT) nach Berliner Zeit — wie der
    Arbeitstag der Betriebe, nicht UTC (Nachtrag Opus-Review). */
export const kontingentTag = (jetzt) => laufenderTag(new Date(jetzt));

const VIERTELSTUNDE = 15 * 60 * 1000;

/** Beginn (ms) des nächsten Kontingenttags: Mitternacht in Berlin. Die
    Zonenwechsel liegen auf vollen Stunden UTC, deshalb genügt die
    Viertelstunde als Schritt. */
export function naechsterKontingentTag(jetzt) {
  const heute = kontingentTag(jetzt);
  let t = Math.floor(jetzt / VIERTELSTUNDE) * VIERTELSTUNDE + VIERTELSTUNDE;
  for (let i = 0; i < 200 && kontingentTag(t) === heute; i++) t += VIERTELSTUNDE;
  return t;
}

/* -------------------------------------------------------- Einstellungen */

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * Hat die Person diesen Kanal insgesamt abgeschaltet? `zustellung.kanal` ist
 * der Sammelschalter über alle Arten; nur ein ausdrückliches `false` zählt.
 */
export function kanalAus(person, kanal) {
  const z = istObjekt(person && person.zustellung) ? person.zustellung : {};
  return istObjekt(z.kanal) && z.kanal[kanal] === false;
}
