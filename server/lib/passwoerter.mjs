/* ==========================================================================
   PASSWÖRTER

   Für persönliche Konten: E-Mail und Passwort statt eines Zugangscodes.
   Diese Datei ist die Ablage und die Regel — sie legt kein Konto an und
   kennt keinen Endpunkt.

   Zur Ablage scrypt aus node:crypto, nicht argon2: argon2 gibt es für Node
   nur als natives Paket, und diese Anwendung lebt bewusst ohne native
   Abhängigkeiten (ein Container aus node:22-alpine, ein Lockfile ohne
   Bauwerkzeug). scrypt ist im Haus, speicherhart und für den Zweck
   anerkannt.

   Anders als bei den Zugangscodes ist die langsame Funktion hier richtig.
   Die Begründung aus codes.mjs — schnelle Suche über den Hash als
   Schlüssel — gilt für Passwörter nicht: Gesucht wird über die Adresse,
   gerechnet wird genau einmal, für genau ein Konto.

   ---------------------------------------------------------------------------
   Zur Regel: mindestens zwölf Zeichen, keine Zeichenklassen

   BSI und NIST sind von Zusammensetzungsregeln abgerückt. „Sommer2026!"
   erfüllt jede Klassenregel und steht in jeder Rateliste; eine lange
   Wortfolge erfüllt keine und ist stärker. Statt Klassen: Länge plus eine
   örtliche Sperrliste plus die Wörter, die im jeweiligen Fall naheliegen.

   Kein Abgleich gegen fremde Dienste. Die Datenschutzerklärung sagt, dass
   nichts das Haus verlässt; ein Aufruf gegen eine Leak-Datenbank — auch
   ein gekürzter Prüfwert — wäre ein Widerspruch dazu.

   ---------------------------------------------------------------------------
   Zur Normalform: NFC vor allem anderen

   „é" lässt sich als ein Zeichen (U+00E9) oder als zwei (U+0065 U+0301)
   eingeben. Welche Form ein Gerät liefert, entscheidet die Tastatur, das
   Betriebssystem und manchmal die Zwischenablage. Ohne Normalisierung ist
   dasselbe Passwort auf dem Telefon ein anderes als am Rechner, und der
   Mensch sperrt sich aus, ohne zu verstehen, warum.

   Deshalb geht jedes Passwort durch `.normalize("NFC")` — beim Ablegen
   und beim Prüfen, über dieselbe Funktion. Nachträglich ließe sich das
   nicht einführen: Bestehende Prüfwerte wären dann für jede Form falsch,
   die nicht der ursprünglichen entspricht. Es muss stehen, bevor der
   erste Prüfwert entsteht.

   Getrimmt wird ausdrücklich NICHT. Ein Leerzeichen am Anfang oder Ende
   ist ein Zeichen des Passworts wie jedes andere. Wer es abschneidet,
   verändert ein Geheimnis hinter dem Rücken dessen, der es gewählt hat —
   und ein Passwortmanager, der es mitgesetzt hat, passt danach nicht mehr.
   ========================================================================== */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/* Kennwerte der Ablage. N = 2^15 heißt rund 32 MB je Prüfung — spürbar
   für einen Angreifer mit Millionen Versuchen, tragbar für eine einzelne
   Anmeldung. Die Werte stehen im Ablageformat, damit sie sich später
   anheben lassen, ohne bestehende Einträge zu brechen. */
const N = 32768, R = 8, P = 1, LAENGE = 32;

/** Die Kennung des Verfahrens im Ablageformat. `a1` bliebe für argon2 frei. */
const VERFAHREN = "s1";

export const MINDESTLAENGE = 12;
/* Gegen absichtlich riesige Eingaben: scrypt über ein Megabyte ist ein
   Angriff, kein Passwort. Hoch genug, dass keine Passphrase daran
   scheitert. */
export const HOECHSTLAENGE = 200;

/**
 * Die Normalform eines Passworts. Einmal geschrieben, überall benutzt —
 * Ablegen und Prüfen müssen dieselbe Form sehen.
 *
 * Kein trim: Randleerzeichen gehören zum Passwort.
 * @param {unknown} passwort
 */
export const normalform = (passwort) => String(passwort ?? "").normalize("NFC");

const rechne = (passwort, salz, n, r, p, laenge) => new Promise((gut, schlecht) => {
  scrypt(normalform(passwort), salz, laenge,
    { N: n, r, p, maxmem: 128 * n * r * 2 },
    (f, schluessel) => (f ? schlecht(f) : gut(schluessel)));
});

/**
 * Legt ein Passwort ab: `s1$N$r$p$salz$pruefwert` (Base64).
 * @param {string} passwort
 * @returns {Promise<string>}
 */
export async function passwortAblegen(passwort) {
  const salz = randomBytes(16);
  const wert = await rechne(passwort, salz, N, R, P, LAENGE);
  return [VERFAHREN, N, R, P, salz.toString("base64"), wert.toString("base64")].join("$");
}

/**
 * Prüft ein Passwort gegen eine Ablage. Falsches Format heißt falsch —
 * eine beschädigte Ablage darf nie durchlassen und nie werfen.
 * @param {string} passwort
 * @param {unknown} ablage
 * @returns {Promise<boolean>}
 */
export async function passwortPruefen(passwort, ablage) {
  try {
    const [kennung, n, r, p, salz, wert] = String(ablage || "").split("$");
    if (kennung !== VERFAHREN) return false;
    const zahl = (x) => (Number.isInteger(Number(x)) && Number(x) > 0 ? Number(x) : 0);
    if (!zahl(n) || !zahl(r) || !zahl(p)) return false;
    const soll = Buffer.from(String(wert || ""), "base64");
    if (!soll.length) return false;
    const salzRoh = Buffer.from(String(salz || ""), "base64");
    if (!salzRoh.length) return false;
    const ist = await rechne(passwort, salzRoh, zahl(n), zahl(r), zahl(p), soll.length);
    return timingSafeEqual(ist, soll);
  } catch { return false; }
}

/**
 * Braucht diese Ablage eine Erneuerung? Wahr, sobald die Kennwerte von
 * den heutigen abweichen — dann lässt sich beim nächsten erfolgreichen
 * Anmelden still neu gerechnet werden, ohne dass jemand etwas merkt.
 * @param {unknown} ablage
 */
export function veraltet(ablage) {
  const [kennung, n, r, p] = String(ablage || "").split("$");
  if (kennung !== VERFAHREN) return true;
  return Number(n) !== N || Number(r) !== R || Number(p) !== P;
}

/* --------------------------------------------------------------------------
   DIE REGEL

   Zwölf Zeichen aufwärts, gegen die Sperrliste geprüft, dazu die Wörter,
   die im jeweiligen Fall naheliegen: der Betriebsname, der örtliche Teil
   der Adresse, der Produktname. Wer „pflegeheim-sonnenhof" heißt, darf
   nicht „PflegeheimSonnenhof1" wählen.
   -------------------------------------------------------------------------- */

/* Die häufigsten Passwörter, soweit sie zwölf Zeichen erreichen oder durch
   übliche Anhänge erreichen ("…123", "…2026", "…!"). Eine örtliche Liste,
   klein gehalten: Sie fängt das Naheliegende, nicht das Denkbare.

   Die Einträge stehen in Glattform — Kleinbuchstaben und Ziffern, ohne
   Sonderzeichen —, weil auch die Eingabe vor dem Abgleich geglättet wird.
   „Sommer2026!!" und „sommer-2026" treffen denselben Eintrag. */
const SPERRLISTE = new Set([
  "passwort1234", "password1234", "passwort2024", "passwort2025", "passwort2026",
  "password2024", "password2025", "password2026", "qwertzuiopue", "qwertyuiop12",
  "123456789012", "111111111111", "abcdefghijkl",
  "sommer2024", "sommer2025", "sommer2026",
  "winter2024", "winter2025", "winter2026",
  "fruehling2025", "fruehling2026", "herbst2025", "herbst2026",
  "willkommen12", "willkommen01", "willkommen2024", "willkommen2025", "willkommen2026",
  "dienstplan12", "dienstplan2024", "dienstplan2025", "dienstplan2026",
  "schichtplan1", "schichtplan12", "arbeit123456", "firma1234567",
  "hallo1234567", "geheim123456", "sicherheit12", "verwaltung12",
]);

const glatt = (s) => normalform(s).toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

/**
 * Prüft ein Wunschpasswort.
 *
 * @param {string} passwort
 * @param {string[]} [verboten]  fallabhängige Wörter — Betriebsname,
 *   örtlicher Teil der Adresse, Name der Person
 * @returns {{ok: true}|{ok: false, grund: string}}
 */
export function pruefeRegel(passwort, verboten = []) {
  /* Nur Zeichenketten sind Passwörter. Ohne diese Schranke bestünde ein
     versehentlich durchgereichtes Objekt die Regel: `String({})` ergibt
     „[object Object]" — fünfzehn Zeichen, keine Sperrliste, alles gut.
     Gehasht würde dann für jeden, dem derselbe Fehler unterläuft, dasselbe
     Geheimnis. */
  if (typeof passwort !== "string")
    return { ok: false, grund: "Bitte ein Passwort eingeben." };
  const p = normalform(passwort);
  /* Gezählt wird nach der Normalisierung: „é" als zwei Codepoints ist ein
     Zeichen, nicht zwei — sonst hängt die Mindestlänge an der Tastatur. */
  const zeichen = [...p].length;
  if (zeichen < MINDESTLAENGE)
    return { ok: false, grund: `Mindestens ${MINDESTLAENGE} Zeichen — gern eine Wortfolge mit Leerzeichen.` };
  if (zeichen > HOECHSTLAENGE)
    return { ok: false, grund: `Höchstens ${HOECHSTLAENGE} Zeichen.` };

  const g = glatt(p);
  if (SPERRLISTE.has(g))
    return { ok: false, grund: "Dieses Passwort steht auf jeder Rateliste. Bitte ein anderes." };
  if (g.includes("centric"))
    return { ok: false, grund: "Der Produktname gehört nicht ins Passwort." };

  for (const w of verboten) {
    const v = glatt(w);
    if (v.length >= 4 && g.includes(v))
      return { ok: false, grund: "Name oder Adresse gehören nicht ins Passwort — das ist das Erste, was jemand rät." };
  }
  return { ok: true };
}
