/* ==========================================================================
   PASSWÖRTER

   Für die Zugänge, die einen Betrieb führen: E-Mail und Passwort statt
   eines Codes. Der Code bleibt für alle, die keine Adresse haben — er
   ist dort kein Notbehelf, sondern der richtige Weg.

   Zur Ablage scrypt aus node:crypto, nicht argon2: argon2 gibt es für
   Node nur als natives Paket, und diese Anwendung lebt bewusst ohne
   native Abhängigkeiten. scrypt ist im Haus, speicherhart und für den
   Zweck anerkannt. Anders als bei den Codes ist die langsame Funktion
   hier richtig: Gesucht wird über die Adresse, geprüft wird genau ein
   Konto — die Begründung aus codes.mjs (schnelle Suche über den Hash
   als Schlüssel) gilt für Passwörter nicht.

   Zur Regel: mindestens zwölf Zeichen, keine Zeichenklassen. BSI und
   NIST sind von Zusammensetzungsregeln abgerückt — „Sommer2026!" erfüllt
   jede Klassenregel und steht in jeder Rateliste, eine lange Wortfolge
   erfüllt keine und ist stärker. Statt Klassen: Länge plus eine örtliche
   Sperrliste. Kein Abgleich gegen fremde Dienste — die Datenschutzseite
   verspricht, dass nichts das Haus verlässt.
   ========================================================================== */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/* Kennwerte der Ablage. N = 2^15 heißt rund 32 MB je Prüfung — spürbar
   für einen Angreifer mit Millionen Versuchen, unspürbar für eine
   Anmeldung. Die Werte stehen im Ablageformat, damit sie sich später
   anheben lassen, ohne bestehende Einträge zu brechen. */
const N = 32768, R = 8, P = 1, LAENGE = 32;

const rechne = (passwort, salz, n, r, p, laenge) => new Promise((gut, schlecht) => {
  scrypt(String(passwort), salz, laenge,
    { N: n, r, p, maxmem: 128 * n * r * 2 },
    (f, schluessel) => (f ? schlecht(f) : gut(schluessel)));
});

/** Legt ein Passwort ab: s1$N$r$p$salz$pruefwert (Base64). */
export async function passwortAblegen(passwort) {
  const salz = randomBytes(16);
  const wert = await rechne(passwort, salz, N, R, P, LAENGE);
  return ["s1", N, R, P, salz.toString("base64"), wert.toString("base64")].join("$");
}

/** Prüft ein Passwort gegen eine Ablage. Falsches Format heißt falsch. */
export async function passwortPruefen(passwort, ablage) {
  try {
    const [kennung, n, r, p, salz, wert] = String(ablage || "").split("$");
    if (kennung !== "s1") return false;
    const soll = Buffer.from(wert, "base64");
    const ist = await rechne(passwort, Buffer.from(salz, "base64"),
      Number(n), Number(r), Number(p), soll.length);
    return soll.length > 0 && timingSafeEqual(ist, soll);
  } catch { return false; }
}

/* --------------------------------------------------------------------------
   DIE REGEL

   Zwölf Zeichen aufwärts, gegen die Sperrliste geprüft, dazu die Wörter,
   die im jeweiligen Fall naheliegen: der Betriebsname, der örtliche Teil
   der Adresse, der Produktname. Wer „pflegeheim-sonnenhof" heißt, darf
   nicht „PflegeheimSonnenhof1" wählen.
   -------------------------------------------------------------------------- */

const MINDESTLAENGE = 12;
const HOECHSTLAENGE = 200;   // gegen absichtlich riesige Eingaben, sonst frei

/* Die häufigsten Passwörter, soweit sie zwölf Zeichen erreichen oder durch
   übliche Anhänge erreichen ("…123", "…2024", "…!"). Eine örtliche Liste,
   klein gehalten: Sie fängt das Naheliegende, nicht das Denkbare. */
/* Die Einträge stehen in Glattform — Kleinbuchstaben und Ziffern, ohne
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

const glatt = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

/**
 * Prüft ein Wunschpasswort. `verboten` sind fallabhängige Wörter —
 * Betriebsname, örtlicher Adressteil. Gibt { ok } oder { ok: false, grund }.
 */
export function pruefeRegel(passwort, verboten = []) {
  const p = String(passwort || "");
  if (p.length < MINDESTLAENGE)
    return { ok: false, grund: `Mindestens ${MINDESTLAENGE} Zeichen — gern eine Wortfolge mit Leerzeichen.` };
  if (p.length > HOECHSTLAENGE)
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
