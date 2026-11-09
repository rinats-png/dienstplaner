/* ==========================================================================
   EINLADUNGEN — die Leitung lädt eine Person ein (WP-18)

   Bis hierher entstanden Zugangscodes nur beim Betreiber (/api/zugaenge,
   mit frischer Anmeldung und zweitem Faktor). Die Leitung konnte niemanden
   aus ihrem eigenen Betrieb hereinholen, ohne den Betreiber zu bemühen —
   und der Betreiber sah dabei jeden Code im Klartext.

   Der Weg hier hat zwei Schritte, und das ist Absicht:

     1. Die Leitung stellt für EINE Person aus IHREM Betrieb eine Einladung
        aus. Sie bekommt nur die Einladung zu sehen, keinen Zugangscode.
     2. Wer die Einladung hat, löst sie genau einmal ein und bekommt dabei
        den persönlichen Zugangscode der Person. Er erscheint genau einmal.

   Die Einladung ist ein INHABERSCHLÜSSEL (Review-Auflage M3): Wer sie hat,
   bekommt den Code — das kann die eingeladene Person sein, aber ebenso die
   Leitung selbst, die die Einladung ja gesehen hat, oder jeder, an den sie
   unterwegs gerät. Die frühere Aussage „auch die Leitung kennt den Code
   nicht" war falsch. Richtig ist: Der Code steht nirgends im Klartext, die
   Leitung bekommt ihn nicht ausgehändigt, und JEDE Einlösung wird der
   Leitung angezeigt (Einladungsliste, Status „eingelöst" mit Zeitpunkt,
   Hinweis „neu eingelöst"). Hat die Person selbst nichts eingelöst, sperrt
   die Leitung den Zugang und lädt neu ein. Ein zweites Merkmal beim
   Einlösen (Geburtsdatum, Personalnummer) wurde geprüft und verworfen
   (docs/acc45/WP-18-NACHWEIS.md, B5): Es wäre der Leitung ebenso bekannt,
   ist leicht zu raten und würde Daten aus der Personalakte für einen
   fremden Zweck verwenden.

   „Ein Code = eine Person" heißt hier dreierlei:
     - der Code ist an genau eine Person gebunden (konto.person),
     - eine Person bekommt über diesen Weg keinen zweiten aktiven Code
       (wer schon einen hat, muss erst gesperrt werden),
     - eine Einladung gilt einmal und nur, solange sie die jüngste für diese
       Person ist (eine neue Einladung widerruft die ältere).

   Die Rolle kommt aus der Personalliste, nicht aus der Anfrage. Das ist
   dieselbe Wahrheit, die nach der Anmeldung gilt (rechte.mjs, wirksameRolle):
   Eine Einladung mit einer anderen Rolle als der eingetragenen würde nach
   der Anmeldung ohnehin auf die eingetragene zurückfallen — sie wird
   deshalb gar nicht erst ausgestellt.

   Fail-closed: Jeder Zweifel (Bestand oder Konten nicht lesbar, Betrieb
   verschoben, Person nicht mehr aktiv, Rolle geändert) ist ein Nein. Eine
   verbrauchte Einladung bleibt verbraucht, auch wenn danach etwas nicht
   passte — die Leitung lädt dann neu ein.

   ---------------------------------------------------------------------------
   Einmaligkeit über Prozesse und Instanzen (B3)

   Jede Einladung hat einen Zustandsvermerk `einladungsstatus:<id>`, der
   genau EINMAL angelegt werden kann — mit `setJSONWennNeu` (ablage.mjs:
   Zwischendatei, dann link(); link scheitert mit EEXIST, wenn es das Ziel
   schon gibt). Einlösen, Widerrufen und Ersetzen konkurrieren um diesen
   einen Vermerk; genau einer gewinnt, auch wenn zwei Prozesse auf
   derselben Ablage gleichzeitig zugreifen. Erst danach wird das Token
   gelöscht. Der Vermerk ist damit der Nachweis, dass die Einladung aus dem
   Umlauf ist — er steht, bevor irgendetwas angelegt wird.

   Die Grenze, ehrlich: Das gilt für Prozesse, die DIESELBE Ablage auf
   EINEM Dateisystem sehen (ein Rechner, ein Volume; auch zwei Container
   auf demselben Volume). link() ist dort atomar. Auf einem verteilten
   Speicher (NFS ohne verlässliches link, Objektspeicher, mehrere Volumes)
   trägt es nicht; dort braucht es einen Zustandsautomaten mit bedingtem
   Schreiben im Speicher selbst (Anlegen-wenn-fehlt bzw. Vergleich der
   Fassung). Die Laufnummer und die Prüfung „schon ein Zugang" laufen
   zusätzlich unter der prozesslokalen Raumsperre; gegen einen zweiten
   Prozess auf derselben Ablage steht beim Start die Prozesssperre
   (prozesssperre.mjs) — der Betrieb fährt heute genau einen Prozess.

   Die Frist (7 Tage) kommt aus token.mjs (Zweck „einladung").
   Account-Einladungen teilen den Zweck; Zugangseinladungen tragen
   `art: "zugang"`, damit sich die eine nicht als die andere einlösen lässt.
   ========================================================================== */

import { createHash, randomBytes } from "node:crypto";
import { tokenAusstellen, tokenAnsehen, tokenEinloesen } from "./token.mjs";
import { kontoLesenStreng, kontoSchreiben, alleKontenStreng } from "./konten.mjs";
import { ablageSchluessel, altHash, neuHash, gleich } from "./codes.mjs";
import { darfVergeben } from "./rollenvergabe.mjs";
import { darf, eigenerMandant, wirksameRolle, sitzungsRolleBekannt } from "./rechte.mjs";
import { aktivePerson } from "./personengueltig.mjs";
import { heuteBerlin } from "./zeiterfassung.mjs";
import { betriebFuerNeuenCode } from "./erstbefuellung.mjs";
import { unterRaumsperre } from "./raumsperre.mjs";
import { rollenPflicht, rollenFaktorFrisch, rollenFaktorEingerichtet } from "./betreiber-zweifaktor.mjs";
import { accountLesenPerId } from "./accounts.mjs";
import { passwortPruefen } from "./passwoerter.mjs";

const ART = "zugang";
const NR_PRAEFIX = "einladungsnr:";
const META_PRAEFIX = "einladung:";
const STATUS_PRAEFIX = "einladungsstatus:";
const BLICK_PRAEFIX = "einladungsblick:";

/** Wie lange eine abgelaufene oder erledigte Einladung noch in der Liste steht. */
const LISTE_NACHLAUF_MS = 30 * 24 * 60 * 60 * 1000;
/** Die frische Bestätigung beim Ausstellen darf höchstens so alt sein (B1). */
export const FRISCH_MS = 5 * 60 * 1000;

/** @typedef {{ok: false, status: number, fehler: string, grund: string, bestaetigung?: string, id?: string}} Nein */

/**
 * Ergebnis ohne Erfolg: Status und Text für die Antwort, Grund fürs Protokoll.
 * @param {number} status @param {string} fehler @param {string} grund
 * @returns {Nein}
 */
const nein = (status, fehler, grund) => ({ ok: /** @type {false} */ (false), status, fehler, grund });

/* Für alles, was danach nicht mehr eingelöst werden kann, dieselbe Antwort:
   unbekannt, abgelaufen, schon benutzt, widerrufen und entwertet sehen von außen gleich aus. */
export const EINLADUNG_UNGUELTIG = "Diese Einladung ist ungültig, abgelaufen oder wurde schon verwendet. "
  + "Bitte die Organisationsleitung um eine neue.";

/* N1: Nach dem Verbrauch hilft kein „später erneut versuchen" — die Einladung ist weg. */
export const NEU_EINLADEN = "Der Zugang ließ sich gerade nicht anlegen. Die Einladung ist damit verbraucht — "
  + "bitte neu einladen lassen.";

const NICHT_LESBAR = "Die Zugänge lassen sich gerade nicht lesen. Bitte später erneut versuchen.";

const h = (...teile) => createHash("sha256").update(JSON.stringify(teile.map(String))).digest("hex");
const nrSchluessel = (raum, mandantId, person) => NR_PRAEFIX + h(raum, mandantId, person);
const betriebKuerzel = (raum, mandantId) => h(raum, mandantId).slice(0, 24);
const metaPraefix = (raum, mandantId) => `${META_PRAEFIX}${betriebKuerzel(raum, mandantId)}:`;
const metaSchluessel = (raum, mandantId, id) => metaPraefix(raum, mandantId) + id;
const statusSchluessel = (id) => STATUS_PRAEFIX + id;
const ID_FORM = /^[A-Za-z0-9_-]{16,48}$/;

async function nrLesen(store, schluessel) {
  const d = await store.get(schluessel, { type: "json" });
  return d && Number.isInteger(d.einladung) ? d.einladung : 0;
}

/* Dasselbe Alphabet und dieselbe Form wie die Codes aus /api/zugaenge.
   N3: verwerfendes Ziehen statt Modulo (wie token.mjs, codeErzeugen) — 256 % 26 ≠ 0. */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
const GRENZE = 256 - (256 % ALPHABET.length);        // 234 = 9 × 26
function block() {
  let aus = "";
  while (aus.length < 4) {
    for (const b of randomBytes(8)) {
      if (b >= GRENZE) continue;
      aus += ALPHABET[b % ALPHABET.length];
      if (aus.length === 4) break;
    }
  }
  return aus;
}
const neuerCode = () => `${block()}-${block()}-${block()}`;
/** Nur für Prüfungen: die Codeerzeugung. */
export const _neuerCode = neuerCode;

const personName = (p) => [p.vorname, p.nachname].filter(Boolean).join(" ").trim() || String(p.id);

/** Gehört dieser Kontoeintrag zu genau dieser Person in genau diesem Betrieb? */
function kontoDerPerson(k, raum, betrieb, mandantId, person) {
  if (!k || k.bestand !== raum || k.rolle === "betreiber" || k.demo === true) return false;
  if (k.person === null || k.person === undefined || String(k.person) !== String(person)) return false;
  if (k.mandantId) return k.mandantId === mandantId;
  return Number(k.betrieb ?? 0) === Number(betrieb);
}

/** Hat die Person schon einen nutzbaren Zugang? Ein Lesefehler wird weitergereicht (fail-closed, M2). */
export async function aktiverZugangVorhanden(store, { raum, betrieb, mandantId, person }) {
  const konten = await alleKontenStreng(store);
  return Object.values(konten).some((k) => kontoDerPerson(k, raum, betrieb, mandantId, person) && !k.gesperrt);
}

/* --------------------------------------------------------------------------
   PRÜFEN, OB EINE SITZUNG FÜR DIESEN BETRIEB EINLADEN DARF
   -------------------------------------------------------------------------- */

/**
 * Die gemeinsame Vorprüfung für Ausstellen, Liste und Widerruf.
 * @returns {{ok: true, m: any, vergeber: string}|{ok: false, status: number, fehler: string, grund: string}}
 */
function leitungPruefen(s, bestand) {
  if (!s || s.nurSicherung) return nein(401, "Nicht angemeldet.", "keine Sitzung");
  if (s.demo === true) return nein(403, "Im Demozugang lassen sich keine Einladungen verwalten.", "demo");
  if (s.rolle === "betreiber" || !sitzungsRolleBekannt(s.rolle))
    return nein(403, "Einladungen verwaltet die Organisationsleitung.", "rolle der sitzung");
  if (!bestand || !Array.isArray(bestand.mandanten) || !bestand.mandanten.length)
    return nein(409, "Der Betrieb ist noch nicht eingerichtet.", "kein bestand");
  /* Der eigene Betrieb muss eindeutig der sein, an den die Sitzung gebunden ist. Eine Sitzung ohne
     Betriebskennung (alter Code in einem Raum mit mehreren Betrieben) verwaltet nichts. */
  const m = eigenerMandant(bestand, s);
  if (!s.mandantId || !m || m.id !== s.mandantId)
    return nein(403, "Dieser Zugang ist keinem Betrieb eindeutig zugeordnet.", "betrieb nicht eindeutig");
  const vergeber = wirksameRolle(s, bestand);
  if (!darf(vergeber, "roles.assign"))
    return nein(403, "Einladungen verwaltet die Organisationsleitung.", `keine rollenvergabe (${vergeber})`);
  return { ok: true, m, vergeber };
}

/**
 * N-1 (Sicherheitsreview): die Rechteprüfung für den Endpunkt — VOR der frischen Bestätigung. Sonst erführe eine
 * Sitzung ohne Rollenvergabe an der Antwort, ob ihr Passwort bzw. Zugangscode stimmt.
 * @returns {{ok: true, m: any, vergeber: string}|{ok: false, status: number, fehler: string, grund: string}}
 */
export const einladungRechtePruefen = (s, bestand) => leitungPruefen(s, bestand);

/* --------------------------------------------------------------------------
   FRISCHE BESTÄTIGUNG BEIM AUSSTELLEN (B1)

   Ein abgegriffenes Sitzungsmerkmal soll keine Einladungen — also neue
   Zugänge — prägen können. Verlangt wird eine Bestätigung, die höchstens
   FRISCH_MS (fünf Minuten) zurückliegt, über den Anmeldeweg, den es schon
   gibt; ein neues Anmeldeverfahren entsteht hier nicht:

     Pflicht für den zweiten Faktor (CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1):
       - ein aktueller Code aus der App im Rumpf (`bestaetigung.zweifaktor`,
         einmalig, ±30 s), oder
       - eine Anmeldung MIT bestandenem zweitem Faktor, die höchstens fünf
         Minuten alt ist.
     Ohne Pflicht:
       - Zugang MIT eingerichtetem zweitem Faktor (D-N2): wie unter Pflicht —
         Code aus der App oder Anmeldung mit Faktor ≤ fünf Minuten; der
         Zugangscode allein genügt nicht;
       - Sitzung aus einem Zugangscode: der eigene Zugangscode im Rumpf
         (`bestaetigung.zugangscode`, muss genau der Code dieser Sitzung
         sein), ein Code aus der App (falls eingerichtet), oder eine
         Anmeldung, die höchstens fünf Minuten alt ist;
       - Sitzung aus einem Konto (E-Mail und Passwort): das Passwort
         (`bestaetigung.passwort`). Eine junge Arbeitssitzung zählt hier
         nicht — sie entsteht bei der Betriebsauswahl, nicht bei der
         Passworteingabe.
   Fehlt die Bestätigung oder stimmt sie nicht: 403. Ablage nicht lesbar: 503.
   -------------------------------------------------------------------------- */

const ohneBestaetigung = (art) => ({
  ...nein(403, art === "zweifaktor"
    ? "Bitte zur Bestätigung den aktuellen Code aus der App eingeben (höchstens fünf Minuten alt)."
    : "Bitte zur Bestätigung die eigene Anmeldung wiederholen: Zugangscode bzw. Passwort eingeben.",
  `frische bestaetigung fehlt (${art})`),
  bestaetigung: art,
});

/**
 * @param {object} store  Ablage „centric"
 * @param {{sitzung: any, bestaetigung?: any, k?: string, jetzt?: () => number, env?: Record<string, string|undefined>}} o
 * @returns {Promise<{ok: true, art: string}|{ok: false, status: number, fehler: string, grund: string, bestaetigung?: string}>}
 */
export async function frischeBestaetigung(store, { sitzung: s, bestaetigung, k = "", jetzt = Date.now,
  env = process.env }) {
  const b = bestaetigung && typeof bestaetigung === "object" && !Array.isArray(bestaetigung) ? bestaetigung : {};
  const ausKonto = !!(s && s.herkunft && typeof s.herkunft === "object");
  const seit = Number(s && s.seit);
  const jung = !ausKonto && Number.isFinite(seit) && seit > 0 && jetzt() - seit <= FRISCH_MS && jetzt() - seit >= -60_000;
  const pflicht = rollenPflicht(env);

  if (typeof b.zweifaktor === "string" && b.zweifaktor.trim()) {
    const f = await rollenFaktorFrisch({ store, k, sitzung: s, code: b.zweifaktor });
    if (f.ok === true) return { ok: true, art: "zweifaktor" };
    return { ...nein(f.status, f.fehler, f.grund), bestaetigung: "zweifaktor" };
  }
  if (pflicht) {
    if (jung && s.zweifaktor === true) return { ok: true, art: "anmeldung-mit-faktor" };
    return ohneBestaetigung("zweifaktor");
  }
  if (ausKonto) {
    if (typeof b.passwort !== "string" || !b.passwort) return ohneBestaetigung("passwort");
    let konto;
    try { konto = await accountLesenPerId(store, String(s.herkunft.accountId || "")); }
    catch { return nein(503, "Die Anmeldung lässt sich gerade nicht prüfen. Bitte später erneut versuchen.", "konto nicht lesbar"); }
    const stimmt = !!konto && konto.status === "aktiv" && await passwortPruefen(b.passwort, konto.passwort);
    if (!stimmt) {
      await new Promise((r) => setTimeout(r, 400));
      return { ...nein(403, "Das Passwort stimmt nicht.", "passwort falsch"), bestaetigung: "passwort" };
    }
    return { ok: true, art: "passwort" };
  }
  /* D-N2 (Sicherheitsreview N-2): Ist für diesen Zugang ein zweiter Faktor eingerichtet, wird er auch ohne Pflicht
     verlangt — wie unter Pflicht: ein Code aus der App (oben) oder eine Anmeldung MIT Faktor, höchstens fünf Minuten
     alt. Der Zugangscode allein genügt dann nicht: Wer einen Faktor eingerichtet hat, soll nicht mit dem ersten Faktor
     allein neue Zugänge prägen können. */
  let mitFaktor;
  try { mitFaktor = await rollenFaktorEingerichtet({ store, sitzung: s }); }
  catch { return nein(503, "Der zweite Faktor lässt sich gerade nicht prüfen. Bitte später erneut versuchen.", "faktor nicht lesbar"); }
  if (mitFaktor) {
    if (jung && s.zweifaktor === true) return { ok: true, art: "anmeldung-mit-faktor" };
    return ohneBestaetigung("zweifaktor");
  }
  if (typeof b.zugangscode === "string" && b.zugangscode) {
    const konto = String((s && s.konto) || "");
    const kandidaten = [neuHash(b.zugangscode), altHash(b.zugangscode)].filter(Boolean);
    const stimmt = !!konto && kandidaten.some((x) => gleich(x, konto));
    if (!stimmt) {
      await new Promise((r) => setTimeout(r, 400));
      return { ...nein(403, "Der Zugangscode stimmt nicht mit dieser Anmeldung überein.", "zugangscode falsch"),
        bestaetigung: "zugangscode" };
    }
    return { ok: true, art: "zugangscode" };
  }
  if (jung) return { ok: true, art: "anmeldung" };
  return ohneBestaetigung("zugangscode");
}

/* --------------------------------------------------------------------------
   AUSSTELLEN
   -------------------------------------------------------------------------- */

/**
 * Prüft, ob die Sitzung für diese Person eine Einladung ausstellen darf, und stellt sie aus.
 * Die frische Bestätigung (B1) prüft der Endpunkt vorher (frischeBestaetigung).
 *
 * @param {object} store  Ablage „centric"
 * @param {{sitzung: any, bestand: any, personId: unknown, rolle?: unknown, jetzt?: () => number}} o
 * @returns {Promise<{ok: true, id: string, einladung: string, bis: number, ausgestellt: string,
 *   person: {id: string, name: string}, rolle: string}
 *   | {ok: false, status: number, fehler: string, grund: string}>}
 */
export async function einladungAusstellen(store, { sitzung: s, bestand, personId, rolle, jetzt = Date.now }) {
  const v = leitungPruefen(s, bestand);
  if (!v.ok) return /** @type {Nein} */ (v);
  const { m, vergeber } = v;

  if (typeof personId !== "string" || !personId || personId.length > 80)
    return nein(400, "Keine Person angegeben.", "person fehlt");
  /* Gesucht wird nur im eigenen Betrieb: Eine Person aus einem fremden Betrieb ist hier „gibt es nicht". */
  const p = aktivePerson(m, personId, heuteBerlin(new Date(jetzt())));
  if (!p) return nein(404, "Diese Person gibt es in deinem Betrieb nicht (oder sie ist nicht aktiv).", "person unbekannt");

  if (rolle !== undefined && rolle !== null && rolle !== p.rolle)
    return nein(409, "Die Rolle passt nicht zur Personalliste. Bitte erst die Rolle der Person ändern.", "rolle weicht ab");
  const urteil = darfVergeben(vergeber, p.rolle, null);
  if (!urteil.ok) return nein(403, urteil.grund, `rolle nicht vergebbar (${p.rolle})`);

  const ziel = { raum: s.bestand, betrieb: Number(s.betrieb ?? 0), mandantId: m.id, person: String(p.id) };
  /* N2: Laufnummer, Prüfung „schon ein Zugang" und das Ersetzen älterer Einladungen unter derselben Sperre wie
     das Einlösen — zwei gleichzeitige Ausstellungen lesen nicht beide dieselbe Nummer. */
  return unterRaumsperre(`@einladung:${ziel.raum}`, async () => {
    try {
      if (await aktiverZugangVorhanden(store, ziel))
        return nein(409, "Diese Person hat schon einen Zugang. Ein Code gehört genau einer Person — "
          + "für einen neuen bitte den alten zuerst sperren.", "zugang vorhanden");
    } catch { return nein(503, NICHT_LESBAR, "konten nicht lesbar"); }

    const am = new Date(jetzt()).toISOString();
    try {
      /* Ältere offene Einladungen dieser Person werden widerrufen (Grund „ersetzt"). Zusätzlich entwertet die
         neue Laufnummer jede ältere — auch eine, die in der Liste fehlt. */
      for (const alt of await metaListe(store, ziel.raum, ziel.mandantId)) {
        if (String(alt.person) !== ziel.person) continue;
        if (await store.setJSONWennNeu(statusSchluessel(alt.id), { status: "widerrufen", grund: "ersetzt", am }))
          if (alt.tokenSchluessel) await store.delete(alt.tokenSchluessel).catch(() => {});
      }
      const nrS = nrSchluessel(ziel.raum, ziel.mandantId, ziel.person);
      const nr = (await nrLesen(store, nrS)) + 1;
      await store.setJSON(nrS, { einladung: nr });

      const id = randomBytes(12).toString("base64url");
      const { token, bis, schluessel } = await tokenAusstellen(store, { zweck: "einladung", nr, jetzt,
        inhalt: { art: ART, einladungId: id, bestand: ziel.raum, betrieb: ziel.betrieb, mandantId: ziel.mandantId,
          person: ziel.person, rolle: p.rolle, von: s.person ?? null } });
      /* Die Metadaten für die Liste — ohne Token, ohne Namen (der kommt beim Anzeigen aus dem Bestand). */
      await store.setJSON(metaSchluessel(ziel.raum, ziel.mandantId, id), { id, raum: ziel.raum,
        mandantId: ziel.mandantId, betrieb: ziel.betrieb, person: ziel.person, rolle: p.rolle,
        von: s.person ?? null, ausgestellt: am, bis, nr, tokenSchluessel: schluessel });
      return { ok: true, id, einladung: token, bis, ausgestellt: am,
        person: { id: ziel.person, name: personName(p) }, rolle: p.rolle };
    } catch { return nein(503, NICHT_LESBAR, "ablage beim ausstellen"); }
  });
}

/* --------------------------------------------------------------------------
   LISTE UND WIDERRUF (B2)
   -------------------------------------------------------------------------- */

/** Alle Metadaten eines Betriebs. Wirft bei einem Lesefehler. */
async function metaListe(store, raum, mandantId) {
  const { blobs } = await store.list({ prefix: metaPraefix(raum, mandantId) });
  const aus = [];
  for (const b of blobs) {
    const d = await store.get(b.key, { type: "json" });
    if (d && d.raum === raum && d.mandantId === mandantId && typeof d.id === "string") aus.push(d);
  }
  return aus;
}

/**
 * Der Status einer Einladung aus Vermerk, Frist und — M-1 — dem Konto, das sie angelegt hat.
 * `kontoDa`: Es gibt einen Zugang mit dieser Einladungskennung. Dann ist sie eingelöst, auch wenn der Vermerk
 * „fertig" nicht mehr geschrieben werden konnte (fertig: false) oder ein Fehler nach dem Anlegen „verbraucht" vermerkt hat.
 */
function statusVon(meta, vermerk, nun, kontoDa = false) {
  if (vermerk && vermerk.status === "widerrufen") return "widerrufen";
  if (vermerk && vermerk.status === "eingeloest" && vermerk.fertig === true) return "eingeloest";
  if (vermerk && kontoDa) return "eingeloest";
  if (vermerk) return "verbraucht";          // eingelöst, aber kein Zugang entstanden (Fehler, Rolle geändert …)
  return Number(meta.bis) < nun ? "abgelaufen" : "offen";
}

/** M-1: Die Einladungskennungen, aus denen in diesem Betrieb ein Zugang entstanden ist. Wirft bei einem Lesefehler. */
async function eingeloesteKennungen(store, raum, mandantId) {
  const konten = await alleKontenStreng(store);
  const ids = new Set();
  for (const k of Object.values(konten)) {
    if (!k || k.bestand !== raum || k.mandantId !== mandantId) continue;
    if (k.einladung && typeof k.einladung.id === "string") ids.add(k.einladung.id);
  }
  return ids;
}

/**
 * Die Einladungen des eigenen Betriebs — nur Metadaten, nie das Token (B2).
 * `neuEingeloest`: Einlösungen seit dem letzten Blick einer Leitung dieses Betriebs (B5, Benachrichtigung).
 *
 * @returns {Promise<{ok: true, einladungen: Array<object>, neuEingeloest: number}
 *   | {ok: false, status: number, fehler: string, grund: string}>}
 */
export async function einladungenListe(store, { sitzung: s, bestand, jetzt = Date.now }) {
  const v = leitungPruefen(s, bestand);
  if (!v.ok) return /** @type {Nein} */ (v);
  const { m } = v;
  const nun = jetzt();
  const blickS = BLICK_PRAEFIX + betriebKuerzel(s.bestand, m.id);
  let liste, blick;
  try {
    liste = await metaListe(store, s.bestand, m.id);
    const b = await store.get(blickS, { type: "json" });
    blick = b && Number.isFinite(Number(b.am)) ? Number(b.am) : 0;
  } catch { return nein(503, NICHT_LESBAR, "liste nicht lesbar"); }
  const personen = Array.isArray(m.personen) ? m.personen : [];
  const aus = [];
  let neu = 0;
  /* M-1: Die Konten werden nur gelesen, wenn ein Vermerk nicht „fertig" ist — und dann höchstens einmal. Ein
     Lesefehler ist 503, kein „verbraucht" (fail-closed wie überall hier). */
  let kennungen = null;
  for (const e of liste) {
    let vermerk;
    try { vermerk = await store.get(statusSchluessel(e.id), { type: "json" }); }
    catch { return nein(503, NICHT_LESBAR, "status nicht lesbar"); }
    let kontoDa = false;
    if (vermerk && vermerk.status !== "widerrufen" && !(vermerk.status === "eingeloest" && vermerk.fertig === true)) {
      if (!kennungen) {
        try { kennungen = await eingeloesteKennungen(store, s.bestand, m.id); }
        catch { return nein(503, NICHT_LESBAR, "konten nicht lesbar"); }
      }
      kontoDa = kennungen.has(e.id);
    }
    const status = statusVon(e, vermerk, nun, kontoDa);
    const ende = Math.max(Number(e.bis) || 0, vermerk && vermerk.am ? Date.parse(vermerk.am) || 0 : 0);
    if (status !== "offen" && ende + LISTE_NACHLAUF_MS < nun) {
      /* Nachlauf vorbei: Metadaten weg. Der Vermerk bleibt — er hält das Token gesperrt, auch wenn es noch liegt. */
      await store.delete(metaSchluessel(s.bestand, m.id, e.id)).catch(() => {});
      continue;
    }
    const p = personen.find((x) => x && String(x.id) === String(e.person));
    const istNeu = status === "eingeloest" && vermerk && (Date.parse(vermerk.am) || 0) > blick;
    if (istNeu) neu += 1;
    aus.push({ id: e.id, person: { id: String(e.person), name: p ? personName(p) : String(e.person) },
      rolle: e.rolle, ausgestellt: e.ausgestellt, bis: e.bis, status,
      ...(vermerk && vermerk.am ? { am: vermerk.am } : {}),
      ...(vermerk && vermerk.grund === "ersetzt" ? { ersetzt: true } : {}),
      ...(istNeu ? { neu: true } : {}) });
  }
  aus.sort((a, b) => String(b.ausgestellt).localeCompare(String(a.ausgestellt)));
  /* Der Blick zählt als gesehen. Scheitert das Schreiben, erscheint der Hinweis beim nächsten Mal noch einmal. */
  await store.setJSON(blickS, { am: nun }).catch(() => {});
  return { ok: true, einladungen: aus.slice(0, 200), neuEingeloest: neu };
}

/**
 * Widerruft eine offene Einladung des eigenen Betriebs. Danach ist sie dauerhaft gesperrt: Der Vermerk
 * „widerrufen" steht, bevor das Token gelöscht wird, und ein Einlösen findet ihn (410).
 *
 * @returns {Promise<{ok: true, status: "widerrufen"}|{ok: false, status: number, fehler: string, grund: string}>}
 */
export async function einladungWiderrufen(store, { sitzung: s, bestand, id, jetzt = Date.now }) {
  const v = leitungPruefen(s, bestand);
  if (!v.ok) return /** @type {Nein} */ (v);
  if (typeof id !== "string" || !ID_FORM.test(id)) return nein(400, "Keine Einladung angegeben.", "id fehlt");
  /* Der Schlüssel enthält Raum und Betrieb: Eine Einladung eines fremden Betriebs ist hier „gibt es nicht". */
  return unterRaumsperre(`@einladung:${s.bestand}`, async () => {
    let meta;
    try { meta = await store.get(metaSchluessel(s.bestand, v.m.id, id), { type: "json" }); }
    catch { return nein(503, NICHT_LESBAR, "meta nicht lesbar"); }
    if (!meta || meta.mandantId !== v.m.id || meta.raum !== s.bestand)
      return nein(404, "Diese Einladung gibt es in deinem Betrieb nicht.", "unbekannt");
    const am = new Date(jetzt()).toISOString();
    let gewonnen;
    try { gewonnen = await store.setJSONWennNeu(statusSchluessel(id), { status: "widerrufen", am, von: s.person ?? null }); }
    catch { return nein(503, NICHT_LESBAR, "vermerk nicht schreibbar"); }
    if (!gewonnen) {
      const vermerk = await store.get(statusSchluessel(id), { type: "json" }).catch(() => null);
      if (vermerk && vermerk.status === "widerrufen") return { ok: true, status: "widerrufen" };
      return nein(409, "Diese Einladung wurde schon eingelöst. Den Zugang bitte über „Zugang sperren\" beenden.",
        "schon eingelöst");
    }
    if (meta.tokenSchluessel) await store.delete(meta.tokenSchluessel).catch(() => {});   // der Vermerk sperrt ohnehin
    return { ok: true, status: "widerrufen" };
  });
}

/* --------------------------------------------------------------------------
   EINLÖSEN
   -------------------------------------------------------------------------- */

/**
 * Löst eine Einladung ein und legt den persönlichen Zugangscode an.
 *
 * Reihenfolge: ansehen (ohne zu verbrauchen) → Zustandsvermerk exklusiv anlegen (der eine Gewinner, auch über
 * Prozesse) → Token löschen (nachweisbar, sonst 503) → fachlich prüfen → Zugang anlegen → Vermerk „fertig".
 * Wirft nur, solange noch nichts verbraucht ist (→ 503 „später erneut versuchen"); jeder Fehler danach ist ein
 * 503 „bitte neu einladen lassen" (N1).
 *
 * @param {object} store
 * @param {{einladung: unknown, bestandLesen: (raum: string) => Promise<any>, jetzt?: () => number}} o
 *   `bestandLesen` liest streng (wirft bei einem Lesefehler).
 * @returns {Promise<{ok: true, id: string, zugangscode: string, rolle: string, name: string, person: string}
 *   | {ok: false, status: number, fehler: string, grund: string, id?: string}>}
 */
export async function einladungEinloesen(store, { einladung, bestandLesen, jetzt = Date.now }) {
  if (typeof einladung !== "string" || einladung.length < 20 || einladung.length > 200)
    return nein(400, "Bitte die Einladung vollständig eingeben.", "form");
  const token = einladung.trim();
  const blick = await tokenAnsehen(store, token, { zweck: "einladung", jetzt });
  if (blick.grund === "fehler") throw new Error("Einladung: Ablage nicht lesbar");
  const e0 = blick.eintrag;
  if (!e0) return nein(410, EINLADUNG_UNGUELTIG, blick.grund || "unbekannt");
  if (e0.art !== ART) return nein(410, EINLADUNG_UNGUELTIG, "andere art");
  const id = typeof e0.einladungId === "string" && ID_FORM.test(e0.einladungId)
    ? e0.einladungId : `t${h(token).slice(0, 31)}`;          // Einladungen aus der Zeit vor der Liste

  /* Der eine Gewinner (B3): exklusiv angelegt, auch gegen einen zweiten Prozess. Wer verliert — zweites Einlösen,
     widerrufen, ersetzt —, bekommt dieselbe Antwort wie für ein unbekanntes Token. */
  const am = new Date(jetzt()).toISOString();
  const gewonnen = await store.setJSONWennNeu(statusSchluessel(id), { status: "eingeloest", am, fertig: false });
  if (!gewonnen) return nein(410, EINLADUNG_UNGUELTIG, "schon vermerkt");

  /* Ab hier ist die Einladung verbraucht: Der Vermerk steht und sperrt sie dauerhaft.
     M-1 (Sicherheitsreview): Das Schreiben des Abschlussvermerks wird einmal wiederholt. Scheitert auch das, bleibt der
     Vermerk auf „eingeloest, fertig: false" stehen — die Einladung bleibt gesperrt, und die Liste leitet „eingelöst"
     aus dem Konto mit dieser Einladungskennung ab (einladungenListe). Der Einlösende bekommt seinen Code trotzdem: Der
     Zugang ist angelegt, ein 503 an dieser Stelle hinterließe einen Zugang, den niemand kennt. */
  const abschluss = async (r) => {
    const vermerk = r.ok ? { status: "eingeloest", am, fertig: true }
      : { status: "verbraucht", am, grund: String(r.grund || "fehler").slice(0, 60) };
    for (let versuch = 0; versuch < 2; versuch += 1) {
      try { await store.setJSON(statusSchluessel(id), vermerk); break; }
      catch { /* einmal wiederholen; danach gilt der Vermerk aus dem Anlegen */ }
    }
    return { ...r, id };
  };
  try {
    const r = await tokenEinloesen(store, token, { zweck: "einladung", jetzt });
    if (r.grund === "nicht-entwertet" || r.grund === "fehler") return abschluss(nein(503, NEU_EINLADEN, `token ${r.grund}`));
    const e = r.eintrag;
    if (!e) return abschluss(nein(410, EINLADUNG_UNGUELTIG, r.grund || "unbekannt"));

    return await unterRaumsperre(`@einladung:${e.bestand}`, async () => {
      if ((await nrLesen(store, nrSchluessel(e.bestand, e.mandantId, e.person))) !== e.nr)
        return abschluss(nein(410, EINLADUNG_UNGUELTIG, "entwertet"));

      const gelesen = await bestandLesen(e.bestand);
      const bindung = betriebFuerNeuenCode(gelesen && gelesen.bestand, e.betrieb);
      if (bindung.grund || bindung.mandantId !== e.mandantId)
        return abschluss(nein(409, "Der Betrieb dieser Einladung hat sich geändert. Bitte neu einladen lassen.", "betrieb verschoben"));
      const m = gelesen.bestand.mandanten[bindung.betrieb];
      const p = aktivePerson(m, e.person, heuteBerlin(new Date(jetzt())));
      if (!p) return abschluss(nein(409, "Diese Person ist im Betrieb nicht mehr aktiv.", "person weg"));
      if (p.rolle !== e.rolle)
        return abschluss(nein(409, "Die Rolle hat sich seit der Einladung geändert. Bitte neu einladen lassen.", "rolle geändert"));

      const ziel = { raum: e.bestand, betrieb: bindung.betrieb, mandantId: bindung.mandantId, person: e.person };
      if (await aktiverZugangVorhanden(store, ziel))
        return abschluss(nein(409, "Für diese Person gibt es schon einen Zugang.", "zugang vorhanden"));

      /* M2: Die Kollisionsprüfung liest streng — ein Lesefehler ist kein „frei". */
      let code = null;
      for (let i = 0; i < 5 && !code; i += 1) {
        const c = neuerCode();
        if (!(await kontoLesenStreng(store, ablageSchluessel(c)))) code = c;
      }
      if (!code) return abschluss(nein(503, NEU_EINLADEN, "kein freier code"));

      await kontoSchreiben(store, ablageSchluessel(code), {
        name: m.name || e.bestand, bestand: e.bestand, rolle: e.rolle, person: e.person,
        betrieb: bindung.betrieb, mandantId: bindung.mandantId,
        demo: false, gruppe: null, hinweis: null, angelegt: am,
        einladung: { von: e.von ?? null, am, id } });
      const fertig = await abschluss({ ok: true });
      return { ...fertig, zugangscode: code, rolle: e.rolle, name: m.name || e.bestand, person: e.person };
    });
  } catch {
    /* N1: Nach dem Verbrauch hilft kein „später erneut versuchen". */
    return abschluss(nein(503, NEU_EINLADEN, "fehler nach verbrauch"));
  }
}
