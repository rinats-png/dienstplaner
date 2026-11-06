import { getStore } from "./ablage.mjs";
import { ereignis } from "./gesund-zaehler.mjs";
import { createHash, randomBytes } from "node:crypto";
import { BlockList, isIP } from "node:net";

/* ==========================================================================
   SCHUTZ UND PROTOKOLL

   Ohne Bremse lässt sich der Anmeldeendpunkt millionenfach aufrufen. Ein
   Zugangscode hat drei Blöcke aus je vier Zeichen eines 26er-Alphabets —
   das sind rund 5·10^16 Möglichkeiten. Klingt viel, ist es auch. Aber ohne
   Begrenzung kann jemand mit tausend Versuchen je Sekunde systematisch
   suchen, und schon ein einziger Treffer öffnet einen ganzen Betrieb.

   Die Grenzen sind bewusst unterschiedlich: Anmelden ist streng, Lesen und
   Schreiben großzügig. Ein Planer, der einen Monatsplan durchklickt, darf
   nicht ausgebremst werden.
   ========================================================================== */

const takt = () => getStore({ name: "centric-takt", consistency: "strong" });
const spur = () => getStore({ name: "centric-spur" });

const kurz = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

/* --------------------------------------------------------------------------
   MEHRDIMENSIONAL ZÄHLEN

   Eine einzige Kennung reicht nicht. Wer über hundert Mobilfunkadressen
   angreift, umgeht eine reine Adressbremse mühelos — jede Adresse bleibt
   unter der Grenze, die Summe ist trotzdem ein Angriff.

   Deshalb wird jeder Versuch gegen drei Zähler gehalten:

     Herkunft — die Adresse oder Sitzung, wie bisher
     Ziel     — auf welchen Betrieb gezielt wird
     Gesamt   — wie viele Fehlversuche der Dienst insgesamt sieht

   Reißt einer davon, wird gebremst. Die Zähler haben verschiedene Grenzen:
   ein einzelner Betrieb verträgt mehr Fehlversuche als eine einzelne
   Adresse, und der Dienst insgesamt mehr als ein Betrieb.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   ZÄHLEN OHNE ZÄHLER

   Ein Blob je Versuch, benannt mit Zufall. Gezählt wird durch Auflisten des
   Präfixes. Das kostet einen Listenaufruf statt eines Lesevorgangs und ist
   dafür unter Nebenläufigkeit korrekt — was bei einer Bremse der ganze Zweck
   ist.

   Aufgeräumt wird beiläufig: Einträge tragen ihr Zählfenster im Namen, und
   alte Fenster werden beim Entlasten und gelegentlich beim Zählen entfernt.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   PROZESSLOKALE SPERRE

   Der Blob-Weg kann einen gleichzeitigen Schwarm nicht begrenzen — gemessen
   kamen mit Zählen-dann-Schreiben 55 von 60 parallelen Versuchen durch, mit
   Schreiben-dann-Zählen 49. Das ist keine Frage des Schlüssellayouts,
   sondern der fehlenden atomaren Operation.

   Was ohne Fremddienst hilft: Innerhalb eines Prozesses ist JavaScript
   einfädig. Ein Zähler im Speicher wird also nicht zerrissen, und ein
   Anfragebündel landet in der Praxis auf wenigen Instanzen. Das ersetzt
   keinen echten Zähler, senkt den Schlupf aber deutlich und kostet nichts.

   Bewusst kein Ersatz für atomarZaehlen(): Wer mehrere Instanzen hat,
   braucht den Fremddienst. Diese Sperre ist die Untergrenze, nicht das Ziel.
   -------------------------------------------------------------------------- */
const lokal = new Map();

/* --------------------------------------------------------------------------
   GLEITENDES FENSTER

   Ein festes Fenster beginnt an jeder Grenze bei null. Liegt die Grenze
   mitten in einer Versuchsreihe, gehen bis zu zweimal so viele Versuche
   durch, wie die Grenze nennt — belegt im CI-Lauf 41493388310: vierzehn
   Fehlversuche nacheinander, keine Sperre.

   Deshalb zählt das vorige Fenster anteilig mit: voll am Anfang des
   laufenden Fensters, gar nicht mehr an seinem Ende. Bei gleichmäßigem
   Aufkommen ist das genau die Rate; an der Grenze kann nichts mehr doppelt
   durchgehen. Die Grenzwerte selbst bleiben unverändert.
   -------------------------------------------------------------------------- */

/** Lage eines Zeitpunkts in Fenstern von `fensterSekunden`. */
function fensterLage(ms, fensterSekunden) {
  const p = fensterSekunden * 1000;
  const index = Math.floor(ms / p);
  return { index, anteil: (ms - index * p) / p, ende: (index + 1) * p };
}

/** Gleitender Stand aus laufendem und vorigem Fenster. */
const gewichtet = (laufend, vorig, anteil) => laufend + vorig * (1 - anteil);

/** Zählt im Speicher hoch. `bis`: bis wann der Eintrag gebraucht wird —
    das Ende des NÄCHSTEN Fensters, weil er dort noch als „voriges“ zählt. */
function lokalZaehlen(schluessel, bis) {
  const jetzt = Date.now();
  const eintrag = lokal.get(schluessel);
  if (!eintrag || eintrag.bis < jetzt) {
    lokal.set(schluessel, { n: 1, bis });
    /* Beiläufig aufräumen, damit die Karte nicht wächst. */
    if (lokal.size > 500) {
      for (const [k, v] of lokal) if (v.bis < jetzt) lokal.delete(k);
    }
    return 1;
  }
  eintrag.n++;
  return eintrag.n;
}

/** Liest den Speicherzähler, ohne zu zählen. */
function lokalLesen(schluessel) {
  const eintrag = lokal.get(schluessel);
  return eintrag && eintrag.bis >= Date.now() ? eintrag.n : 0;
}

/* Ein Ausfall der Ablage soll auffallen, aber das Serverprotokoll nicht
   fluten: höchstens eine Meldung je Art und Minute. */
const ausfallGemeldet = new Map();
function ausfallMelden(art, fehler) {
  ereignis("bremse-ausfall");   // Fehlerzählung für /gesund (WP-05), jeder Ausfall
  const jetzt = Date.now();
  if ((ausfallGemeldet.get(art) || 0) > jetzt - 60000) return;
  ausfallGemeldet.set(art, jetzt);
  console.error(`bremse-ausfall (${art}): ${fehler} — zähle im Prozessspeicher weiter`);
}

/* --------------------------------------------------------------------------
   ATOMARER ZÄHLER, WENN VORHANDEN

   Die Dateiablage kennt kein bedingtes Schreiben. Damit lässt sich darauf
   kein Zähler bauen, der einem parallelen Schwarm standhält; gemessen kamen
   55 von 60 gleichzeitigen Versuchen durch, obwohl die Grenze bei 8 liegt.
   Der prozesslokale Zähler (lokalZaehlen) fängt das im Container ab, solange
   es nur einen Prozess gibt.

   Wer die Lücke schließen will, hinterlegt einen Redis-Dienst mit
   HTTP-Schnittstelle (Upstash und Vergleichbare, kostenfreie Stufe genügt):

     REDIS_REST_URL    https://<kennung>.upstash.io
     REDIS_REST_TOKEN  <Token>

   Dann läuft das Zählen über INCR und ist verlässlich. Fehlen die Angaben,
   greift der Blob-Weg — schwächer, aber betriebsfähig. Ein Ausfall des
   Dienstes bremst die Anwendung nicht: Wir fallen still zurück.
   -------------------------------------------------------------------------- */
async function atomarZaehlen(schluessel, vorigSchluessel, fensterSekunden) {
  const url = process.env.REDIS_REST_URL;
  const token = process.env.REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const basis = String(url).replace(/\/+$/, "");
    const k = encodeURIComponent(`centric:takt:${schluessel}`);
    const kv = encodeURIComponent(`centric:takt:${vorigSchluessel}`);
    /* Ein Aufruf für alles: hochzählen, Ablauf setzen, voriges Fenster lesen. */
    const a = await fetch(`${basis}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify([["INCR", k], ["EXPIRE", k, String(fensterSekunden * 2)], ["GET", kv]]),
      signal: AbortSignal.timeout(1500),
    });
    if (!a.ok) return null;
    const d = await a.json();
    const n = Array.isArray(d) && d[0] && Number(d[0].result);
    if (!Number.isFinite(n)) return null;
    const v = Array.isArray(d) && d[2] ? Number(d[2].result) : 0;
    return { laufend: n, vorig: Number.isFinite(v) ? v : 0 };
  } catch {
    /* Zeitüberschreitung oder Ausfall: lieber der schwächere Weg als keiner. */
    return null;
  }
}

/** Wie viele Versuche liegen unter `basis` im laufenden und im vorigen
    Fenster? Ein Listenaufruf für beide. Wirft bei einem Fehler der Ablage —
    still null zu zählen hieße, die Bremse unbemerkt zu öffnen. */
async function versucheZaehlen(s, basis, fenster) {
  const praefix = `v:${basis}:`;
  const { blobs } = await s.list({ prefix: praefix });
  const laufend = `${fenster}:`, vorig = `${fenster - 1}:`;
  let l = 0, v = 0;
  for (const b of blobs) {
    const rest = b.key.slice(praefix.length);
    if (rest.startsWith(laufend)) l++;
    else if (rest.startsWith(vorig)) v++;
  }
  return { laufend: l, vorig: v };
}

/** Einen Versuch vermerken. Der Zufall im Namen verhindert Kollisionen.
    Wirft bei einem Fehler der Ablage (siehe bremse()). */
async function versuchVermerken(s, praefix) {
  const marke = `${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
  const schluessel = `v:${praefix}:${marke}`;
  await s.setJSON(schluessel, 1);
  return schluessel;
}

/* Alte Fenster wegräumen. Die Schlüssel tragen ihr Fenster im Namen, also
   lässt sich das ohne Zeitstempel entscheiden. Beiläufig statt per Zeitplan:
   ein eigener Ablauf wäre Aufwand ohne Gewinn. */
async function alteFensterRaeumen(s, art, fensterJetzt) {
  try {
    const { blobs } = await s.list({ prefix: `v:${art}:` });
    for (const b of blobs) {
      /* v:<art>:<kennung>:<fenster>:<marke> — das Fenster ist das
         vorletzte Glied. */
      const teile = b.key.split(":");
      const f = Number(teile[teile.length - 2]);
      if (Number.isFinite(f) && f < fensterJetzt - 1) await s.delete(b.key).catch(() => {});
    }
  } catch { /* egal */ }
}

/** Alle Versuche unter einem Präfix entfernen. */
async function versucheLoeschen(s, praefix) {
  try {
    const { blobs } = await s.list({ prefix: `v:${praefix}:` });
    for (const b of blobs) await s.delete(b.key).catch(() => {});
  } catch { /* egal */ }
}

/** Atomare Zähler löschen, falls ein Fremddienst hinterlegt ist. */
async function atomarLoeschen(schluesselListe) {
  const url = process.env.REDIS_REST_URL;
  const token = process.env.REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    const basis = String(url).replace(/\/+$/, "");
    await fetch(`${basis}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(schluesselListe.map((k) => ["DEL", encodeURIComponent(`centric:takt:${k}`)])),
      signal: AbortSignal.timeout(1500),
    });
  } catch { /* Ausfall: Die Schlüssel laufen über EXPIRE ab. */ }
}

/** Zählstand einer Kennung leeren — Speicher, Ablage und atomarer Zähler,
    laufendes und voriges Fenster. Für entlasten() und beim Sperren. */
async function zaehlerLeeren(s, art, kennung, fenster) {
  const laufend = `${art}:${kennung}:${fenster}`;
  const vorig = `${art}:${kennung}:${fenster - 1}`;
  lokal.delete(laufend);
  lokal.delete(vorig);
  /* Alle Fenster dieser Kennung — der Doppelpunkt am Ende des Präfixes
     (versucheLoeschen) trennt sie von längeren Kennungen. */
  await versucheLoeschen(s, `${art}:${kennung}`);
  await atomarLoeschen([laufend, vorig]);
}

/** Grenzen je Endpunkt: wie viele Versuche in wie vielen Sekunden. */
export const GRENZEN = {
  /* steigend: die Sperre verdoppelt sich mit jeder Wiederholung
     failClosed: Lässt sich der Sperreintrag wegen eines Plattenfehlers
       nicht lesen, gilt die Kennung als gesperrt — eine Langzeitsperre darf
       nicht übergangen werden. Nur für Arten, bei denen es um Raten,
       Anlegen oder Versand geht. Alle anderen zählen dann degradiert im
       Speicher weiter, damit ein Fehler im Zählerstore nicht die ganze
       Anwendung lahmlegt (bremse()). */
  anmelden:   { versuche: 8,   fenster: 300,  sperre: 300,  steigend: true, max: 7200, failClosed: true },
  demo:       { versuche: 20,  fenster: 300,  sperre: 300,  failClosed: true },
  einrichten: { versuche: 5,   fenster: 600,  sperre: 1800, steigend: true, max: 86400, failClosed: true },
  zugaenge:   { versuche: 10,  fenster: 600,  sperre: 1800, steigend: true, max: 86400, failClosed: true },
  lesen:      { versuche: 300, fenster: 60,   sperre: 60 },
  /* Abrufe eines Kalender-Feeds je GEHEIMNIS (WP-47b). Eigene Art, damit ein
     Kalender-Abruf nicht das Lesen der Anwendung bremst und umgekehrt. 30 je
     Minute liegt am oberen Ende der Spanne 12–30; ein Kalenderprogramm fragt
     alle paar Minuten. Fail closed: Ein Plattenfehler am Sperreintrag sperrt
     das Geheimnis, statt es ungezählt durchzulassen (offene Frage: docs/acc45/
     wp-kleinpakete-fragen.md, Feed-Grenze 12 oder 30). */
  feed:       { versuche: 30,  fenster: 60,   sperre: 60, failClosed: true },
  schreiben:  { versuche: 120, fenster: 60,   sperre: 60 },
  /* Stempeln (WP-47). Eigene Arten, damit eine Stempelspitze weder die
     Planung (schreiben) blockiert noch von ihr gebremst wird.
       stempeln        je PERSON: niemand stempelt zehnmal in der Minute; ein
                       Gerät, das es trotzdem tut (Schleife, Wiederholung),
                       verbraucht nur sein eigenes Kontingent.
       stempeln-raum   je Raum als Schutz der Rechenleistung, nicht des
                       Missbrauchs: Wert nach Betriebsgröße (stempelDeckel).
     Die Sperre ist kurz (je 15 s) und nicht steigend — wer Retry-After
     befolgt, kommt wieder durch. 15 s je Person (Review-Auflage M4, vorher
     30 s): Die Oberfläche wartet je Wiederholung höchstens 15 s (plus
     Streuung, speicher.js) — eine längere Sperre hätte ihre Wiederholung
     sicher ins Leere laufen lassen. */
  stempeln:   { versuche: 10,  fenster: 60,   sperre: 15 },
  "stempeln-raum": { versuche: 240, fenster: 60, sperre: 15 },
  /* Gelungene Anmeldungen je Betrieb als reine Lastbremse (WP-47). Anders als
     die Fehlversuchsgrenzen schützt sie nichts vor Raten — der Code war
     richtig —, sondern die Sitzungsablage vor einer Welle. 1000 je fünf
     Minuten tragen einen Betrieb von 2000 Personen, bei dem ein Drittel zum
     Schichtbeginn kommt (≈ 670). */
  "anmelden-erfolg": { versuche: 1000, fenster: 300, sperre: 60 },
  /* Gelungene Anmeldungen je CODE (Review-Auflage M1), geprüft VOR der Grenze
     je Betrieb: Ein Code-Inhaber mit einer Skriptschleife verbraucht nur sein
     eigenes Kontingent und sperrt den Betrieb nicht. Niemand meldet sich
     zwanzigmal in fünf Minuten neu an; die Sperre dauert ein ganzes Fenster,
     damit die Schleife auch über die Zeit nicht mehr als 20 je 5 min schafft. */
  "anmelden-code": { versuche: 20, fenster: 300, sperre: 300 },
  zustellen:  { versuche: 60,  fenster: 60,   sperre: 120 },
  /* Sicherungen je Betrieb: sechs je Stunde reichen für jedes „vorher
     sichern“ — und niemand verdrängt damit die Wiederherstellungspunkte. */
  sicherung:  { versuche: 6,   fenster: 3600, sperre: 3600 },
  /* Wiederherstellen ist der schwerste Eingriff: wenige je Stunde. */
  wiederherstellen: { versuche: 5, fenster: 3600, sperre: 3600 },
  /* Auskunft nach Art. 15 (WP-26): Jede liest das Protokoll der letzten
     30 Tage. Dreißig je Stunde und Betrieb reichen für jede Anfrage. */
  auskunft:   { versuche: 30,  fenster: 3600, sperre: 3600 },
  /* Selbstbedienung: drei Betriebe je Stunde. Ohne diese Bremse legt jemand
     über Nacht zehntausend Räume an, und die Kosten laufen mit. */
  starten:    { versuche: 3,   fenster: 3600, sperre: 3600, steigend: true, max: 86400, failClosed: true },
  /* Eine Registrierung kostet zunächst nichts — aber sie schickt eine Mail.
     Ohne Bremse wäre der Endpunkt ein Werkzeug, mit dem sich fremde
     Postfächer zuschütten lassen, und der Versanddienst rechnet mit. Fünf
     Versuche je Stunde und Herkunft reichen für jeden Tippfehler; die
     Sperre verdoppelt sich wie beim Anmelden. */
  registrierung: { versuche: 5, fenster: 3600, sperre: 3600, steigend: true, max: 86400,
    failClosed: true },
  /* Ein Bestätigungslink wird auch von Mailprogrammen vorab geladen und von
     Menschen mehrfach angeklickt. Deshalb großzügiger: Das Raten eines
     256-Bit-Tokens verhindert seine Länge, nicht diese Bremse. Sie hält nur
     jemanden auf, der es trotzdem versucht. */
  verifizieren: { versuche: 30, fenster: 600, sperre: 600 },
  /* Das erste Passwort setzen: Der Nachweis ist 256 Bit lang, also geht es
     nicht ums Raten. Gebremst wird, weil jeder Versuch einen scrypt-Durchlauf
     kostet — ohne Grenze wäre der Endpunkt ein Rechenzeitverbrenner. Zehn
     Versuche je zehn Minuten lassen Raum für Tippfehler in einer
     Passwortregel und nicht mehr. */
  "passwort-setzen": { versuche: 10, fenster: 600, sperre: 600 },
  /* Anmeldung mit E-Mail und Passwort. Strenger als alles andere, weil
     hier zwei Dinge gleichzeitig auf dem Spiel stehen: ein erratbares
     Geheimnis und ein scrypt-Durchlauf je Versuch (rund 32 MB und
     Rechenzeit). Dieselben Zahlen wie beim Anmelden mit Zugangscode, und
     aus demselben Grund steigend: Wer wiederholt anrennt, wartet jedes Mal
     doppelt so lange. */
  "anmelden-konto": { versuche: 8, fenster: 300, sperre: 300, steigend: true,
    max: 7200, failClosed: true },
  /* Sitzung prüfen und abmelden. Kein Geheimnis zu raten — ein Merkmal hat
     256 Bit —, also großzügig wie das Lesen. Gebremst wird, damit ein
     Ansturm nicht die Ablage beschäftigt: Jede Prüfung liest zwei
     Datensätze und schreibt gelegentlich einen. */
  "konto-sitzung": { versuche: 300, fenster: 60, sperre: 60 },
  /* Einen Betrieb anwählen. Kein Geheimnis zu raten — ohne Mitgliedschaft
     gibt es keinen Zugang, und die Absage verrät nicht, ob der Raum
     existiert. Gebremst wird, weil jeder Aufruf eine Arbeitssitzung
     anlegt: Ohne Grenze ließe sich die Sitzungsablage zuschreiben.
     Dreißig je fünf Minuten reichen für jeden Wechsel zwischen
     Arbeitsbereichen und für keinen Ansturm. */
  "betrieb-waehlen": { versuche: 30, fenster: 300, sperre: 300 },
  /* Zweiter Faktor der Verwalterschlüssel (zweifaktor.mjs, WP-32). Sechs
     Stellen sind schnell geraten, wenn niemand bremst: Fünf Versuche je
     fünf Minuten, gezählt je Schlüssel UND je Herkunft, Sperre steigend
     bis zu einem Tag. failClosed: Meldet die Bremse einen Ausfall der
     Ablage, weist /einrichten ab, statt im Prozessspeicher weiterzuzählen. */
  zweifaktor: { versuche: 5, fenster: 300, sperre: 900, steigend: true, max: 86400,
    failClosed: true },
};

/* Lesebremse nach Bestandsgröße (WP-47b, WP-28 Befund 5). Gemessen: ein Kern
   schafft bei 4,6-MB-Beständen rund 200 Antworten je Minute. Die Grenze je
   Raum ist daher eine Bytemenge je Minute, geteilt durch die Größe der letzten
   Antwort — mit Abstand unter der Messung (600 MB/min ≈ 130 Antworten je
   Minute bei 4,6 MB). Kleine Bestände bekommen die volle Lesegrenze. */
export const LESEN_BYTES_JE_MINUTE = 600_000_000;
/** Angenommene Größe, solange die Größe eines Raums nicht bekannt ist: streng. */
export const LESEN_GROESSE_UNBEKANNT = 10_000_000;

/**
 * Wie viele Bestandsabrufe je Minute ein Raum mit dieser Antwortgröße (Bytes)
 * bekommt. Fail closed: unbekannte, leere oder ungültige Größe zählt wie
 * LESEN_GROESSE_UNBEKANNT. Nie unter 1.
 * @param {number} [bytes]
 * @returns {number}
 */
export function lesenGrenze(bytes) {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : LESEN_GROESSE_UNBEKANNT;
  return Math.max(1, Math.min(GRENZEN.lesen.versuche, Math.floor(LESEN_BYTES_JE_MINUTE / b)));
}

/** Grenzen für die weiteren Zähldimensionen — großzügiger als je Herkunft. */
export const WEITERE = {
  anmelden: { ziel: { versuche: 40, fenster: 300 }, gesamt: { versuche: 400, fenster: 300 } },
  einrichten: { gesamt: { versuche: 20, fenster: 600 } },
  zugaenge: { gesamt: { versuche: 40, fenster: 600 } },
  /* Auch insgesamt gedeckelt — ein verteilter Ansturm soll nicht durchkommen. */
  starten: { gesamt: { versuche: 60, fenster: 3600 } },
  /* Zwei weitere Dimensionen für die Registrierung: dieselbe Adresse aus
     hundert Herkünften ist ein Angriff auf ein Postfach, und ein verteilter
     Ansturm bleibt je Herkunft unauffällig. Das Ziel ist der Prüfwert der
     Adresse, nie die Adresse selbst. */
  registrierung: { ziel: { versuche: 5, fenster: 3600 },
    gesamt: { versuche: 60, fenster: 3600 } },
  /* Zwei weitere Dimensionen für die Account-Anmeldung. Das Ziel ist der
     Ablageschlüssel der Adresse — ein gepfefferter Prüfwert, nie die
     Adresse selbst: Ein Angriff auf EIN Postfach fällt damit auf, auch
     wenn er aus hundert Herkünften kommt. Die Gesamtgrenze deckelt den
     verteilten Versuch, der je Herkunft unauffällig bleibt. */
  "anmelden-konto": { ziel: { versuche: 20, fenster: 300 },
    gesamt: { versuche: 200, fenster: 300 } },
};

/**
 * Die Kennung, gegen die gezählt wird. Bevorzugt die Sitzung — sonst könnten
 * sich mehrere Personen hinter einem Firmenanschluss gegenseitig ausbremsen.
 * Ohne Sitzung bleibt nur die Adresse.
 */
export function kennung(req, sitzung) {
  if (sitzung && sitzung.bestand) return `s:${kurz(sitzung.bestand)}`;
  return `a:${kurz(herkunft(req))}`;
}

/**
 * Die Kennung einer PERSON innerhalb eines Raums (WP-47). Wer stempelt, wird
 * je Person gezählt, nicht je Raum: Ein fehlerhaftes Gerät verbraucht nur sein
 * eigenes Kontingent, und die Kolleginnen im selben Betrieb bleiben frei.
 * Ohne Personenbezug (kein Stempeln möglich) zählt die Rolle der Sitzung.
 * Nur Hashwerte, nie Namen.
 */
export function kennungPerson(sitzung) {
  const s = sitzung || {};
  const wer = s.person !== null && s.person !== undefined ? `p:${s.person}` : `r:${s.rolle || "?"}`;
  return `s:${kurz(s.bestand ?? "")}:${kurz(`${String(s.mandantId ?? s.betrieb ?? "")}|${wer}`)}`;
}

/** Die Kennung eines Raums/Betriebs für Lastgrenzen (Hashwert, kein Klartext). */
export const kennungRaum = (raum) => `b:${kurz(raum)}`;

/** Die Kennung eines Zugangscodes für Lastgrenzen (Review-Auflage M1): aus dem
    Ablageschlüssel des Kontos (schon ein Prüfwert), noch einmal gehasht — nie
    der Code selbst. */
export const kennungCode = (kontoSchluessel) => `c:${kurz(kontoSchluessel)}`;

/**
 * Stempel je Minute, die ein Raum insgesamt annimmt — nach Betriebsgröße.
 *
 * Gemessen (docs/acc45/wp28-nachweis.md, Linux-CI, zwei Läufe): Ein Stempel
 * hält die Raumsperre bei 1000 Personen 29–31 ms, bei 2000 Personen 48–124 ms,
 * bei 4000 Personen 82–149 ms. Daraus folgt eine Obergrenze je Raum von
 * 1923–2062/min (≤ 1000), 483–1263/min (≤ 2000) und 403–736/min (4000).
 * Der Deckel ist die HÄLFTE der kleinsten gemessenen Obergrenze der Stufe —
 * die andere Hälfte bleibt für Lesen, Planung und Sicherung, und die
 * Warteschlange vor der Raumsperre (Zeitgrenze 15 s, dann 503) läuft nie auf:
 *   ≤ 1000 Personen   ≈ 960 → 900 je Minute
 *   ≤ 2000 Personen   ≈ 240
 *   darüber           ≈ 200
 * Eine Spitze mit einem Drittel der Belegschaft in fünf Minuten (2000
 * Personen ≈ 133/min) bleibt damit unter dem Deckel.
 *
 * Unbekannte Größe (Prozess frisch gestartet, Raum noch nicht gelesen): die
 * vorsichtige mittlere Stufe, bis der erste Zugriff die Größe liefert.
 * @param {number|null|undefined} personen
 */
export function stempelDeckel(personen) {
  const n = Number(personen);
  if (!Number.isFinite(n) || n <= 0) return 240;
  if (n <= 1000) return 900;
  if (n <= 2000) return 240;
  return 200;
}

/** Die Adresse, von der die Anfrage kommt — roh, nur für Hashwerte.

    Hinter server.mjs steht in `x-forwarded-for` genau EINE Adresse: die,
    die `herkunftBestimmen()` aus Gegenstelle, Kopf und Vertrauensliste
    ermittelt hat (B-XFF-1, WP-32b). Was der Client mitschickte, ist dort
    schon ersetzt. Ruft jemand einen Handler ohne server.mjs auf — die
    Prüfungen tun das —, gilt der erste Eintrag wie bisher. */
export function herkunft(req) {
  const adresse = req.headers.get("x-forwarded-for") || "unbekannt";
  return String(adresse).split(",")[0].trim();
}

/* --------------------------------------------------------------------------
   VERTRAUTE PROXYS (B-XFF-1)

   Bis WP-32b nahm der Server `X-Forwarded-For` von jedem Absender, und
   herkunft() den ERSTEN Eintrag — den, den der Client selbst bestimmt. Wer
   den Dienst am Proxy vorbei erreichte (aus dem Docker-Netz, in Staging),
   bekam mit jedem erfundenen Wert einen frischen Zähler der Bremse.

   Jetzt:
     CENTRIC_VERTRAUTE_PROXYS  Liste von Adressen und Netzen (CIDR), durch
                               Komma oder Leerzeichen getrennt. IPv4 und IPv6.
     leer / nicht gesetzt      niemandem vertrauen: `X-Forwarded-For` wird
                               verworfen, es zählt die Adresse der Gegenstelle.
     Gegenstelle vertraut      die Kette wird von RECHTS gelesen; die erste
                               Adresse, die nicht selbst vertraut ist, ist der
                               Client. Links davon kann der Client schreiben,
                               was er will — es wird nie gelesen.

   Achtung im Betrieb: Ohne Liste sieht der Server hinter Caddy nur noch die
   Adresse des Caddy-Containers — alle Nutzer teilten sich dann EINE Herkunft
   und EINEN Bremszähler. Deshalb meldet der Server das laut
   (xffOhneVertrauen) und /einrichten/umgebung als Warnung.
   -------------------------------------------------------------------------- */

/** IPv4-gemappte IPv6-Adressen (::ffff:10.0.0.1) als IPv4 behandeln. */
export function adresseNormieren(a) {
  let s = String(a || "").trim();
  if (s.startsWith("[") && s.includes("]")) s = s.slice(1, s.indexOf("]"));
  const z = s.indexOf("%");
  if (z > 0) s = s.slice(0, z);
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s);
  if (m) return m[1];
  /* IPv4 mit Port (1.2.3.4:5678), wie manche Proxys schreiben. */
  const p = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(s);
  if (p) return p[1];
  return s.toLowerCase();
}

/**
 * Die Vertrauensliste als BlockList. Ungültige Einträge werfen — eine
 * vertippte Liste soll den Start anhalten, nicht still niemandem oder allen
 * vertrauen.
 * @param {string} [text]
 */
export function vertrauteListe(text) {
  const liste = new BlockList();
  let anzahl = 0;
  for (const roh of String(text || "").split(/[\s,]+/).filter(Boolean)) {
    const [adr, bits] = roh.split("/");
    const a = adresseNormieren(adr);
    const art = isIP(a);
    if (!art) throw new Error(`CENTRIC_VERTRAUTE_PROXYS: „${roh}" ist keine Adresse.`);
    const typ = art === 4 ? "ipv4" : "ipv6";
    if (bits === undefined) liste.addAddress(a, typ);
    else {
      const n = Number(bits);
      if (!Number.isInteger(n) || n < 0 || n > (art === 4 ? 32 : 128))
        throw new Error(`CENTRIC_VERTRAUTE_PROXYS: „${roh}" hat keine gültige Präfixlänge.`);
      liste.addSubnet(a, n, typ);
    }
    anzahl++;
  }
  return { liste, anzahl };
}

/** @param {{liste: BlockList, anzahl: number}} v */
function vertraut(v, adresse) {
  if (!v || !v.anzahl) return false;
  const a = adresseNormieren(adresse);
  const art = isIP(a);
  if (!art) return false;
  return v.liste.check(a, art === 4 ? "ipv4" : "ipv6");
}

/**
 * Wer ist der Client? Reine Funktion — server.mjs ruft sie für jede Anfrage.
 *
 * @param {string|undefined} gegenstelle  req.socket.remoteAddress
 * @param {string|null|undefined} xff     mitgeschickter Kopf (Komma-Liste)
 * @param {{liste: BlockList, anzahl: number}} v  aus vertrauteListe()
 * @returns {string}
 */
export function herkunftBestimmen(gegenstelle, xff, v) {
  const direkt = adresseNormieren(gegenstelle) || "unbekannt";
  if (!xff || !vertraut(v, direkt)) return direkt;
  const kette = String(xff).split(",").map((x) => adresseNormieren(x)).filter(Boolean);
  for (let i = kette.length - 1; i >= 0; i--) {
    if (!isIP(kette[i])) return direkt;   // Unsinn in der Kette: nicht weiterlesen
    if (!vertraut(v, kette[i])) return kette[i];
  }
  /* Alle Einträge vertraut (Proxy hinter Proxy im selben Netz): der äußerste. */
  return kette[0] || direkt;
}

let xffOhneListe = 0;
/** Zählt Anfragen mit X-Forwarded-For bei leerer Vertrauensliste und meldet die erste laut. */
export function xffOhneVertrauenMelden() {
  xffOhneListe++;
  if (xffOhneListe === 1)
    console.warn("WARNUNG: Anfrage mit X-Forwarded-For, aber CENTRIC_VERTRAUTE_PROXYS ist leer. "
      + "Der Kopf wird ignoriert; alle Anfragen zählen unter der Adresse der Gegenstelle. "
      + "Hinter Caddy heißt das: EINE Herkunft für alle Nutzer — die Bremse träfe alle gemeinsam. "
      + "Das Netz des Caddy-Containers in CENTRIC_VERTRAUTE_PROXYS eintragen (docs/CADDY-UND-XFF.md).");
}
/** Wie oft kam X-Forwarded-For ohne Vertrauensliste an? Für /einrichten/umgebung. */
export const xffOhneVertrauen = () => xffOhneListe;

/* --------------------------------------------------------------------------
   HERKUNFT EINER SCHREIBENDEN ANFRAGE

   Die Anwendung führt ihr Sitzungsmerkmal im Kopf `authorization`, nicht in
   einem Cookie. Ein fremdes Blatt kann damit keine Anfrage in fremdem Namen
   auslösen — der Browser schickt den Kopf nicht mit, und ohne ihn ist die
   Anfrage nicht angemeldet. Klassischer CSRF ist hier also bereits durch die
   Bauweise ausgeschlossen.

   Trotzdem eine zweite Linie: Kommt eine zustandsändernde Anfrage mit einem
   `Origin`, der nicht zu dieser Seite gehört, wird sie abgewiesen. Das kostet
   nichts und fängt den Fall ab, in dem eines Tages doch ein Cookie oder ein
   Merkmal im Speicher des Browsers dazukommt.

   Fehlt der Kopf ganz, wird durchgelassen: So rufen Skripte, Sicherungsläufe
   und Prüfungen an, und die sollen weiter arbeiten können.
   -------------------------------------------------------------------------- */
export function herkunftErlaubt(req) {
  const methode = (req.method || "GET").toUpperCase();
  if (methode === "GET" || methode === "HEAD" || methode === "OPTIONS") return true;
  const roh = req.headers.get("origin");
  if (!roh || roh === "null") return true;          // kein Browserblatt
  let fremd;
  try { fremd = new URL(roh).host; } catch { return false; }
  const eigen = new Set();
  try { eigen.add(new URL(req.url).host); } catch { /* ohne */ }
  for (const kopf of ["host", "x-forwarded-host"]) {
    const w = req.headers.get(kopf);
    if (w) eigen.add(String(w).split(",")[0].trim());
  }
  return eigen.has(fremd);
}

/* --------------------------------------------------------------------------
   HERKUNFT EINER COOKIE-GESTÜTZTEN ANFRAGE

   `herkunftErlaubt` lässt eine Anfrage ohne `Origin` durch. Das ist richtig,
   solange das Sitzungsmerkmal im Kopf `authorization` steht: Ein fremdes
   Blatt kann diesen Kopf nicht setzen, also ist eine Anfrage ohne Origin
   entweder ein Skript (das seinen eigenen Schlüssel mitbringt) oder nicht
   angemeldet.

   Für ein Cookie gilt das NICHT. Ein Cookie schickt der Browser von selbst,
   auch wenn ein fremdes Blatt die Anfrage auslöst. Genau der Fall, den
   `herkunftErlaubt` durchlässt — zustandsändernd, ohne Origin — wäre dann
   die Lücke. Deshalb eine eigene, strengere Prüfung für die Endpunkte, die
   mit dem Account-Cookie arbeiten. Die bestehende bleibt unberührt: Sie
   gehört zu einem anderen Verfahren.

   Die Regeln, und warum:

     Fetch-Metadata zuerst. `sec-fetch-site` setzt der Browser selbst, ein
     Blatt kann es nicht fälschen. Steht dort `cross-site` oder
     `same-site` (ein Nachbar-Host derselben Registry-Domain), ist Schluss —
     für JEDE Methode, auch für das Lesen.

     Lesend (GET, HEAD) ist danach frei. Eine fremde Seite kann eine solche
     Antwort nicht lesen: Es gibt keinen CORS-Kopf, und JSON ohne
     `Access-Control-Allow-Origin` bleibt für sie unzugänglich.

     Zustandsändernd ist ausschließlich POST, und dafür MUSS ein `Origin`
     kommen, der zu diesem Wirt gehört. Fehlt er ganz, gilt die Anfrage nur
     dann als eigen, wenn der Browser `sec-fetch-site: same-origin`
     mitschickt. Ein Aufruf ohne beides — typisch für curl — wird
     abgewiesen. Das ist Absicht und der Unterschied zur alten Prüfung:
     Hier gibt es keinen Aufrufer, der ein Recht darauf hätte.

   Damit ist auch Login-CSRF gedeckt: Niemand kann einen fremden Browser in
   ein Konto anmelden, das er kontrolliert, denn der Anmeldeaufruf braucht
   einen eigenen Origin. Und Logout-CSRF ebenso — ein fremdes Blatt kann
   niemanden abmelden. Ein zusätzliches CSRF-Token würde daran nichts
   verbessern: Es wäre ein zweites Geheimnis auf demselben Weg, auf dem
   schon der Origin verlangt wird. Sollte die Origin-Pflicht eines Tages
   fallen — etwa für einen Aufrufer ohne Browser —, braucht es das Token;
   solange sie steht, nicht.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   DER VERTRAUENSANKER

   Der erste Entwurf dieser Prüfung nahm die eigene Adresse aus der Anfrage:
   `host`, `x-forwarded-host`, die Adresse des Request-Objekts. Das war
   falsch, und zwar nachweisbar — mit

     Host: intern:3000
     X-Forwarded-Host: boese.example
     Origin: https://boese.example

   galt eine fremde Herkunft als eigen. Ob ein Angreifer diese Köpfe bis
   hierher bringt, hängt am Reverse Proxy; dessen Konfiguration liegt NICHT in
   diesem Repository und ist damit nicht nachweisbar. Eine Sicherheitsprüfung
   darf sich nicht auf eine Annahme stützen, die sich nicht prüfen lässt.

   Deshalb entscheidet die eigene, ausdrücklich konfigurierte Adresse —
   dieselbe, die auch in jeder Mail steht (CENTRIC_BASIS, siehe
   anwendungsAdresse() in post.mjs; die Vorgabe ist die Produktionsadresse).
   Sie kommt aus der Umgebung des Containers, nicht aus der Anfrage, und
   lässt sich von außen nicht setzen.

   Örtliche Adressen bleiben zusätzlich erlaubt — localhost, 127.0.0.1,
   [::1] —, und nur dann, wenn die Anfrage selbst örtlich adressiert ist und
   der ganze Ursprung übereinstimmt. Das ist der Entwicklungs- und Prüffall.
   In einer Auslieferung kommt keine Anfrage mit einem örtlichen Host an:
   Caddy spricht den Container unter seinem Dienstnamen an, und der ist nicht
   „localhost".

   Wer die Anwendung unter einer zweiten Adresse betreibt, setzt
   CENTRIC_BASIS — nicht einen Kopf. Dasselbe gilt für einen
   Entwicklungsserver mit eigenem Port: Er braucht CENTRIC_BASIS, sonst ist
   sein Ursprung ein fremder.
   -------------------------------------------------------------------------- */

/** Die eigene Adresse als Ursprung: Schema und Wirt, ohne Pfad. Kommt aus
    der Umgebung, nie aus der Anfrage. */
function ankerUrsprung() {
  const roh = (process.env.CENTRIC_BASIS || "https://app.centric-dienstplanung.de")
    .trim().replace(/\/+$/, "");
  try { return new URL(roh).origin; } catch { return null; }
}

/** Ist das ein örtlicher Name? Nur diese vier Schreibweisen — kein Muster,
    das sich mit einer erfundenen Domain wie „localhost.boese.example"
    austricksen lässt. */
const OERTLICH = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const oertlich = (name) => OERTLICH.has(String(name || "").toLowerCase());

/**
 * Gehört dieser Ursprung zu dieser Anwendung?
 * @param {string} roh   der Wert des Kopfes `origin`
 * @param {Request} req
 */
function ursprungEigen(roh, req) {
  let u;
  /* Zwei `Origin`-Köpfe kommen als „a, b" an — daran scheitert das Zerlegen,
     und das ist richtig: Widersprüchliche Angaben sind keine Herkunft. */
  try { u = new URL(roh); } catch { return false; }
  const anker = ankerUrsprung();
  if (anker && u.origin === anker) return true;
  if (!oertlich(u.hostname)) return false;
  /* Örtlich: Die Anfrage muss selbst örtlich adressiert sein, und dann muss
     der ganze Ursprung passen — Schema, Wirt und Port. Nur den Wirt zu
     vergleichen wäre eine Einladung: „https://127.0.0.1:3000" gälte dann als
     eigen, obwohl die Anfrage über http kam. */
  let eigen;
  try { eigen = new URL(req.url); } catch { return false; }
  return oertlich(eigen.hostname) && u.origin === eigen.origin;
}

/**
 * Darf diese Anfrage mit dem Account-Cookie arbeiten?
 * @param {Request} req
 * @returns {boolean}
 */
export function herkunftStreng(req) {
  const methode = (req.method || "GET").toUpperCase();

  const ziel = req.headers.get("sec-fetch-site");
  if (ziel && ziel !== "same-origin" && ziel !== "none") return false;

  if (methode === "GET" || methode === "HEAD") return true;
  if (methode !== "POST") return false;

  const roh = req.headers.get("origin");
  if (!roh || roh === "null") return ziel === "same-origin";
  return ursprungEigen(roh, req);
}

/**
 * Prüft und zählt in einem Zug. Gibt zurück, ob weitergemacht werden darf.
 *
 * Ein Zähler je Kennung und Fenster, gleitend gelesen: das vorige Fenster
 * zählt anteilig mit (siehe GLEITENDES FENSTER). Kein Tokenbucket — für
 * einen Dienst dieser Größe wäre das Aufwand ohne Gewinn.
 *
 * Fail-closed: Ein Fehler der Ablage öffnet die Bremse nicht. Gezählt wird
 * dann im Prozessspeicher weiter (degradiert — je Prozess statt je Dienst),
 * und ein unlesbarer Sperreintrag gilt als Sperre. `fehler` im Ergebnis
 * meldet den Ausfall an den Aufrufer.
 */
export async function bremse(art, kennung, ziel, optionen = {}) {
  const basisG = GRENZEN[art];
  if (!basisG) return { frei: true };
  /* Eigene Grenze dieses Aufrufs (WP-47b: Lesebremse nach Bestandsgröße).
     Alles andere — Fenster, Sperre, failClosed — bleibt die der Art. */
  const g = Number.isFinite(optionen?.versuche) && optionen.versuche > 0
    ? { ...basisG, versuche: Math.floor(optionen.versuche) }
    : basisG;
  /** Die Vermerke, die dieser Aufruf für Ziel und Gesamt angelegt hat — nach
      einer gelungenen Anmeldung werden genau sie zurückgenommen (anmeldungGelungen). */
  const zurueck = [];
  const s = takt();
  const jetztMs = Date.now();
  const jetzt = Math.floor(jetztMs / 1000);
  const lage = fensterLage(jetztMs, g.fenster);
  const fenster = lage.index;
  const basis = `${art}:${kennung}`;
  const schluessel = `${basis}:${fenster}`;
  const vorigSchluessel = `${basis}:${fenster - 1}`;
  const sperreSchluessel = `sperre:${art}:${kennung}`;

  /* Der Speicherzähler zählt genau einmal je Aufruf — im Normalweg wie im
     Ausfall, egal an welcher Stelle die Ablage wirft. */
  let lokalStand = null;
  const lokalGezaehlt = () => {
    if (lokalStand === null) {
      lokalZaehlen(schluessel, lage.ende + g.fenster * 1000);
      lokalStand = gewichtet(lokalLesen(schluessel), lokalLesen(vorigSchluessel), lage.anteil);
    }
    return lokalStand;
  };

  try {
    /* Steht eine Sperre? Die überdauert das Zählfenster. */
    let gesperrt;
    try {
      gesperrt = await s.get(sperreSchluessel, { type: "json" });
    } catch (e) {
      /* Plattenfehler (EIO, EACCES …): Ob hier eine Langzeitsperre steht,
         ist unbekannt — im Speicher ist sie nach einem Neustart nicht mehr.
         Bei sicherheitskritischen Arten (failClosed) gilt die Kennung
         deshalb als gesperrt; überschrieben wird nichts, eine lesbare
         Sperre käme sonst kürzer zurück, als sie war. Alle anderen Arten
         zählen unten im Speicher weiter (degradiert, mit `fehler`). */
      if (e && /** @type {any} */ (e).code) {
        if (!g.failClosed) throw e;
        const fehler = String(/** @type {any} */ (e).message || e).slice(0, 120);
        ausfallMelden(art, fehler);
        return { frei: false, wartet: g.sperre, grund: "gesperrt", fehler };
      }
      gesperrt = undefined;
    }
    if (gesperrt === undefined || (gesperrt !== null
        && (typeof gesperrt !== "object" || !Number.isFinite(gesperrt.bis)))) {
      /* Der Eintrag ist da, aber unlesbar. Er war eine Sperre — also gilt er
         als Sperre. Er wird durch eine frische ersetzt, damit er wie jede
         andere abläuft, statt die Kennung für immer auszusperren. */
      await s.setJSON(sperreSchluessel, { bis: jetzt + g.sperre, seit: jetzt, stufe: 0,
        ersetzt: "unlesbar" }).catch(() => {});
      return { frei: false, wartet: g.sperre, grund: "gesperrt" };
    }
    if (gesperrt && gesperrt.bis > jetzt)
      return { frei: false, wartet: gesperrt.bis - jetzt, grund: "gesperrt" };

    /* Weitere Dimensionen: Ziel und Gesamtaufkommen. Sie sperren nicht
       dauerhaft, sondern bremsen nur für dieses Fenster — sonst könnte
       jemand einen fremden Betrieb absichtlich lahmlegen, indem er dessen
       Zugang mit Fehlversuchen bombardiert. */
    const w = WEITERE[art];
    if (w) {
      if (w.ziel && ziel) {
        const zl = fensterLage(jetztMs, w.ziel.fenster);
        const zb = `${art}:ziel:${ziel}`;
        const z = await versucheZaehlen(s, zb, zl.index);
        if (gewichtet(z.laufend, z.vorig, zl.anteil) >= w.ziel.versuche)
          return { frei: false, wartet: w.ziel.fenster - (jetzt % w.ziel.fenster),
            grund: "ungewöhnlich viele Versuche für diesen Betrieb", dimension: "ziel" };
        zurueck.push(await versuchVermerken(s, `${zb}:${zl.index}`));
      }
      if (w.gesamt) {
        const gl = fensterLage(jetztMs, w.gesamt.fenster);
        const gb = `${art}:gesamt`;
        const z = await versucheZaehlen(s, gb, gl.index);
        if (gewichtet(z.laufend, z.vorig, gl.anteil) >= w.gesamt.versuche)
          return { frei: false, wartet: w.gesamt.fenster - (jetzt % w.gesamt.fenster),
            grund: "ungewöhnlich hohes Aufkommen", dimension: "gesamt" };
        zurueck.push(await versuchVermerken(s, `${gb}:${gl.index}`));
      }
    }

    /* Ein Schlüssel je Versuch statt eines Zählers.

       Vorher wurde gelesen, geprüft und zurückgeschrieben — drei Schritte
       ohne Atomarität. Hundert gleichzeitige Anfragen lasen alle n = 0,
       kamen alle durch und schrieben alle n = 1. Die Bremse griff gegen
       sequenzielles Vertippen und war gegen einen parallelen Angriff
       wirkungslos, auch beim Verwaltungskennwort.

       Die Ablage kennt kein atomares Hochzählen. Ein eigener Schlüssel
       je Versuch braucht keins: Jeder Schreibvorgang ist unabhängig, und
       gezählt wird durch Auflisten. Zwei parallele Anfragen erzeugen zwei
       Einträge — nicht einen. */
    /* Erst vermerken, dann zählen — nicht umgekehrt.

       Zählt man zuerst, sehen alle gleichzeitig eintreffenden Anfragen
       denselben Stand und kommen alle durch; gemessen kamen so 55 von 60
       parallelen Versuchen bis zur Prüfung. Vermerkt jede Anfrage zuerst
       ihren eigenen Versuch, sieht sie beim Zählen mindestens sich selbst
       und alles, was bereits gelandet ist. Der Schlupf schrumpft damit auf
       die Schreiblaufzeit statt auf die gesamte Anfragedauer.

       Restlücke: Ein wirklich gleichzeitiger Schwarm kann sich noch
       gegenseitig übersehen. Wer das dicht haben will, hinterlegt einen
       atomaren Zähler — siehe atomarZaehlen() unten. */
    /* Zuerst im Speicher zählen: Wirft die Ablage gleich danach, ist dieser
       Versuch trotzdem gezählt. */
    const lokalN = lokalGezaehlt();
    await versuchVermerken(s, schluessel);
    /* Drei Quellen, absteigend nach Verlässlichkeit. Genommen wird der
       höchste Wert: Wer auf irgendeinem Weg über der Grenze liegt, ist
       über der Grenze. Alle drei gleitend gelesen. */
    const atomar = await atomarZaehlen(schluessel, vorigSchluessel, g.fenster);
    const atomarN = atomar ? gewichtet(atomar.laufend, atomar.vorig, lage.anteil) : 0;
    let blobN = 0;
    if (atomar === null) {
      const z = await versucheZaehlen(s, basis, fenster);
      blobN = gewichtet(z.laufend, z.vorig, lage.anteil);
    }
    const stand = { n: Math.max(lokalN, atomarN, blobN) };
    if (stand.n > g.versuche) {
      /* Steigende Sperre: Wer wiederholt anrennt, wartet jedes Mal doppelt
         so lange. Für einen ehrlichen Nutzer, der sich einmal vertippt,
         ändert sich nichts — für einen Angreifer wird jeder weitere Anlauf
         teurer als der vorige. */
      const bisher = (await s.get(`stufe:${art}:${kennung}`, { type: "json" })) || { n: 0 };
      const stufe = g.steigend ? bisher.n : 0;
      const dauer = g.steigend
        ? Math.min(g.max || 86400, g.sperre * Math.pow(2, stufe))
        : g.sperre;
      await s.setJSON(sperreSchluessel, { bis: jetzt + dauer, seit: jetzt, stufe });
      if (g.steigend) await s.setJSON(`stufe:${art}:${kennung}`,
        { n: Math.min(stufe + 1, 12), zuletzt: jetzt });
      /* Die Strafe tragen Sperre und Stufe. Der Zählstand wird geleert —
         sonst zählte das vorige Fenster nach Ablauf der Sperre gleitend
         weiter, und wer Retry-After befolgt, wäre mit dem ersten Versuch
         wieder gesperrt, doppelt so lange. Erst NACH dem Schreiben der
         Sperre: Scheitert es, bleibt der Speicherzähler die einzige
         Erinnerung (catch unten). */
      await zaehlerLeeren(s, art, kennung, fenster);
      return { frei: false, wartet: dauer, grund: "zu viele Versuche", stufe };
    }
    /* Gelegentlich aufräumen, damit die Vermerke nicht mitwachsen. */
    if (Math.random() < 0.02) alteFensterRaeumen(s, art, fenster).catch(() => {});
    return { frei: true, uebrig: Math.max(0, Math.floor(g.versuche - stand.n)), zurueck };
  } catch (e) {
    /* Fällt die Ablage aus, wird NICHT durchgelassen, sondern im
       Prozessspeicher weitergezählt. Vorher hieß es hier „Verfügbarkeit vor
       Schutz“ und `{frei: true}` — damit öffnete schon ein beschädigter
       Sperreintrag die Bremse dauerhaft, und eine Sperre, die sich nicht
       schreiben ließ, ließ ausgerechnet den Versuch über der Grenze durch.
       Degradiert heißt: Die Grenze gilt je Prozess, Ziel und Gesamtaufkommen
       fallen weg (dafür gibt es die Notbremse). Der Betrieb läuft weiter,
       solange niemand die Grenze reißt. */
    const fehler = String(e && /** @type {any} */ (e).message || e).slice(0, 120);
    ausfallMelden(art, fehler);
    const n = lokalGezaehlt();
    if (n > g.versuche)
      return { frei: false, wartet: g.sperre, grund: "zu viele Versuche", fehler };
    return { frei: true, uebrig: Math.max(0, Math.floor(g.versuche - n)), fehler };
  }
}

/**
 * Nur die Vermerke dieses einen Versuchs bei Ziel und Gesamt zurücknehmen
 * (WP-47) — nicht den Zähler der Herkunft. Für einen GÜLTIGEN Code, der an
 * einer Lastgrenze abgewiesen wurde (Review-Auflage M1): Er war kein
 * Rateversuch und soll den Betrieb (Ziel) und den Dienst (Gesamt) nicht
 * füllen; die Herkunft aber bleibt gezählt, denn entlastet wird sie nur bei
 * einer gelungenen Anmeldung.
 * @param {{zurueck?: string[]}|undefined} b  Ergebnis von bremse()
 */
export async function vermerkeZuruecknehmen(b) {
  if (!b || !Array.isArray(b.zurueck)) return;
  const s = takt();
  for (const k of b.zurueck) await s.delete(k).catch(() => {});
}

/** Nach einer erfolgreichen Anmeldung den Zähler zurücksetzen. */
export async function entlasten(art, kennung, b) {
  const g = GRENZEN[art];
  if (!g) return;
  /* Die Vermerke dieses Versuchs für Ziel und Gesamt (WP-47). Bis dahin zählten
     gelungene Anmeldungen dort mit: 40 je Betrieb und fünf Minuten sind für
     Fehlversuche reichlich und für einen Schichtbeginn viel zu wenig. Genau
     die eigenen Vermerke werden zurückgenommen, nie die anderer Versuche —
     Fehlversuche bleiben gezählt. */
  await vermerkeZuruecknehmen(b);
  const fenster = fensterLage(Date.now(), g.fenster).index;
  /* Alle drei Zähler zurücksetzen, auch den prozesslokalen. In einem
     dauerhaften Prozess (eigener Server statt kurzlebiger Funktionsinstanz)
     zählte er sonst erfolgreiche Anmeldungen weiter mit und sperrte nach
     acht Anmeldungen hinter derselben Adresse — Büro, Station, Wache — auch
     die richtigen. Das vorige Fenster zählt gleitend mit, also wird es mit
     entlastet. */
  await zaehlerLeeren(takt(), art, kennung, fenster);
  try {
    await takt().delete(`sperre:${art}:${kennung}`);
    /* Auch die Steigerungsstufe zurücksetzen — wer sich erfolgreich
       anmeldet, hat sich offenbar nur vertippt. */
    await takt().delete(`stufe:${art}:${kennung}`);
  } catch { /* egal */ }
}

/** Antwort bei Überschreitung — mit Wartezeit, damit ein ehrlicher Aufrufer weiß, wann wieder. */
export const zuVielAntwort = (wartet) => new Response(JSON.stringify({
  fehler: "zu viele Anfragen",
  text: `Bitte in ${wartet > 60 ? `${Math.ceil(wartet / 60)} Minuten` : `${wartet} Sekunden`} erneut versuchen.`,
  wartet,
}), { status: 429, headers: {
  "content-type": "application/json; charset=utf-8",
  "retry-after": String(wartet),
  "cache-control": "no-store",
} });

/* --------------------------------------------------------------------------
   PROTOKOLL
   Wenn ein Betrieb sagt „der Plan war weg", braucht es eine Spur. Ohne
   personenbezogene Daten: kein Name, keine Adresse im Klartext, kein
   Planinhalt. Nur wer (als Kürzel), was, wann, mit welchem Ausgang.
   -------------------------------------------------------------------------- */

const SPUR_TAGE = 30;

/**
 * Die Adresse einer Anfrage, wie sie in ein Protokoll oder die Konsole darf:
 * Der Pfad eines Kalender-Feeds trägt das Geheimnis (/kalender/feed/<geheim>.ics,
 * ein Bearer-Zugang) — er wird geschwärzt, die Abfrage (?…) fällt immer weg.
 * WP-24, Review-Befund 9: server.mjs schrieb bei einer Ausnahme req.url ungekürzt.
 * @param {unknown} url  req.url (Pfad mit Abfrage) oder eine volle Adresse
 * @returns {string}
 */
export function adresseFuersProtokoll(url) {
  const roh = String(url ?? "");
  const ohneAbfrage = roh.split(/[?#]/)[0];
  return ohneAbfrage.replace(/(\/kalender\/+feed\/+).*$/i,"$1[geschwärzt]").slice(0, 300);
}

/**
 * Ein Eintrag ins Protokoll.
 *
 * `wer` ist neu und beantwortet die Frage, die ein Protokoll beantworten
 * muss: Wer hat das getan? Bis hierher stand dort nur die Kennung — und
 * die ist bei einer angemeldeten Sitzung der Betrieb, nicht die Person.
 * Bei einem Streit über eine Änderung ließ sich damit sagen, aus welchem
 * Betrieb sie kam, aber nicht von wem.
 *
 * Was hineingehört: Rolle, Personenkennung, Weg und Verfahren, und die
 * Herkunft als Kürzel. Was nicht: Namen, Adressen, Zugangscodes,
 * Sitzungsmerkmale, Planinhalte. Die Personenkennung ist betriebsintern
 * („p7") und für sich genommen keine Angabe über einen Menschen.
 *
 * @param {string} art
 * @param {string} kennung
 * @param {string} ausgang
 * @param {string} [zusatz]
 * @param {{rolle?: string, person?: (string|number|null), weg?: string,
 *          verfahren?: string, herkunft?: string, mandantId?: string, tag?: string}} [wer]
 */
export async function protokoll(art, kennung, ausgang, zusatz, wer) {
  try {
    const jetzt = new Date();
    const tag = jetzt.toISOString().slice(0, 10);
    const zeile = { zeit: jetzt.toISOString(), art, kennung, ausgang,
      ...(zusatz ? { zusatz } : {}),
      ...(wer && wer.rolle ? { rolle: wer.rolle } : {}),
      ...(wer && wer.person !== undefined && wer.person !== null
        ? { person: String(wer.person).slice(0, 40) } : {}),
      ...(wer && wer.weg ? { weg: String(wer.weg).slice(0, 60) } : {}),
      /* Der Tag eines Vorgangs (WP-16, Nachtrag N7): eigenes Feld statt im Text — für die Auskunft nach
         Art. 15 (protokollZurPerson) vollständig, in der Betreiber-Lage entfernt (spurFuerBetreiber). */
      ...(wer && typeof wer.tag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wer.tag) ? { tag: wer.tag } : {}),
      /* Der Betrieb (WP-26): Personenkennungen gelten je Betrieb. Ohne ihn
         ließ sich eine Zeile in einem Raum mit mehreren Betrieben nicht
         der richtigen Person zuordnen (Auskunft nach Art. 15). */
      ...(wer && wer.mandantId ? { mandantId: String(wer.mandantId).slice(0, 80) } : {}),
      ...(wer && wer.verfahren ? { verfahren: wer.verfahren } : {}),
      ...(wer && wer.herkunft ? { herkunft: kurz(wer.herkunft) } : {}) };
    /* Eine Datei je Tag und Art — das hält die Einträge klein und macht
       das Aufräumen zu einem Löschvorgang statt einer Suche. */
    /* Ein Blob je Eintrag statt eines Arrays je Tag.

       Vorher wurde das Tagesarray gelesen, ergänzt und zurückgeschrieben —
       zwei gleichzeitige Anfragen, ein verlorener Eintrag. Ein Protokoll,
       das ausgerechnet bei einem Ansturm Einträge verliert, ist dann am
       unzuverlässigsten, wenn man es braucht.

       Der Zufall im Namen verhindert Kollisionen; sortiert wird beim Lesen
       über die Zeit im Eintrag. */
    const marke = `${jetzt.getTime().toString(36)}${randomBytes(5).toString("hex")}`;
    await spur().setJSON(`${tag}/${art}/${marke}`, zeile);
  } catch { /* Protokollieren darf nie eine Anfrage scheitern lassen */ }
}

/** Was ist in den letzten Tagen passiert? Für die Betreiberkonsole. */
export async function spurLesen(tage) {
  const out = [];
  const heute = new Date();
  for (let i = 0; i < (tage || 7); i++) {
    const d = new Date(heute.getTime() - i * 86400000).toISOString().slice(0, 10);
    for (const art of ["anmelden", "demo", "einrichten", "schreiben", "zustellen", "sicherung",
      "zugaenge", "starten", "fehler"]) {
      try {
        /* Altbestand: ein Array je Tag und Art. */
        const z = await spur().get(`${d}/${art}`, { type: "json" });
        if (Array.isArray(z)) out.push(...z);
      } catch { /* nicht vorhanden */ }
      try {
        const { blobs } = await spur().list({ prefix: `${d}/${art}/` });
        /* Deckel je Tag und Art, damit ein Ansturm die Konsole nicht sprengt. */
        for (const b of blobs.slice(0, 2000)) {
          const z = await spur().get(b.key, { type: "json" });
          if (z) out.push(z);
        }
      } catch { /* nicht vorhanden */ }
    }
  }
  return out.sort((a, b) => b.zeit.localeCompare(a.zeit));
}

/**
 * Eine Protokollzeile, wie sie der Betreiber in der Lage sieht (WP-14b, M1). Der Betreiber ist
 * Auftragsverarbeiter: keine Personenkennung (`person`), im Zusatz keine Person|Tag-Schlüssel, keine
 * Uhrzeiten (Ist-Zeiten) und keine Schutzkennungen (Mutterschutz/Jugendschutz, Art. 9 DSGVO). Gilt auch
 * für Zeilen, die vor diesem Nachtrag geschrieben wurden (bis zu SPUR_TAGE alt). Die gespeicherte Zeile
 * bleibt unverändert — die Auskunft nach Art. 15 (auskunft.mjs) liest sie direkt.
 * @param {any} z
 * @returns {any}
 */
export function spurFuerBetreiber(z) {
  if (!z || typeof z !== "object") return z;
  const rest = { ...z };
  delete rest.person;
  delete rest.tag;                                                      // WP-16, Nachtrag N7: kein Tag in der Betreiber-Lage
  if (typeof rest.zusatz === "string") {
    rest.zusatz = rest.zusatz
      .replace(/\s*·\s*Hinweise:\s*[A-Z_,]+/g, " · Hinweise")
      .replace(/\b(MUTTERSCHUTZ|JUGENDSCHUTZ)\b/g, "Schutzhinweis")
      .replace(/[^\s|:]+\|\d{4}-\d{2}-\d{2}/g, "…")
      .replace(/\b([01]?\d|2[0-3]):[0-5]\d\b/g, "…");
  }
  return rest;
}

/** Alte Einträge entfernen. Wird beim Lesen gelegentlich mitgemacht. */
export async function spurAufraeumen() {
  try {
    const grenze = new Date(Date.now() - SPUR_TAGE * 86400000).toISOString().slice(0, 10);
    const { blobs } = await spur().list();
    for (const b of blobs) {
      const tag = b.key.split("/")[0];
      if (tag < grenze) await spur().delete(b.key);
    }
  } catch { /* egal */ }
}

/* --------------------------------------------------------------------------
   NOTBREMSE — eine Grenze, die ohne Ablage auskommt

   `bremse()` verlässt sich auf die Ablage. Bei dieser Nachprüfung kam heraus,
   dass ein Ausfall dort schlimmer ist als gedacht: Die Bremse wirft nicht,
   sie zählt still null. Ein Verzeichnis, das keines ist, liefert beim Lesen
   „nicht vorhanden"; `versucheZaehlen` gibt 0 zurück, `versuchVermerken`
   schluckt seinen Fehler. Es gibt also kein Signal, an dem sich ein Ausfall
   erkennen ließe — die Grenze je Ziel und die Gesamtgrenze sind dann blind,
   ohne dass es jemand merkt. Der `fehler`-Fall in `bremse()` deckt nur, was
   wirklich wirft.

   Seit WP-46 werfen `versucheZaehlen` und `versuchVermerken`, und `bremse()`
   lässt bei keinem Ablagefehler mehr durch: Ein Lesefehler der Sperre gilt
   als Sperre, jeder andere Fehler zählt im Prozessspeicher weiter. Was bleibt: Eine Ablage, die „nicht vorhanden“ liefert
   statt zu werfen, bemerkt auch sie nicht — und degradiert zählt sie nur je
   Herkunft, nicht je Ziel und gesamt. Für beides bleibt diese Grenze.

   Übrig bleibt dann der prozesslokale Zähler der Hauptbremse, und der zählt
   je Herkunft. Ein verteilter Versuch aus hundert Adressen hätte damit
   hundertmal acht scrypt-Durchläufe frei — und scrypt ist mit rund 32 MB und
   Rechenzeit je Versuch genau das, was man nicht verschenkt.

   Deshalb diese zweite Grenze. Sie zählt ausschließlich im Prozessspeicher:
   keine Datei, kein Fremddienst, kein Netz — sie kann nicht ausfallen,
   solange der Prozess läuft. Und sie gilt IMMER, nicht erst bei einem
   erkannten Ausfall: einen erkennbaren Ausfall gibt es nicht.

     je Herkunft   20 je fünf Minuten — über der gewöhnlichen Grenze von 8,
                   also im Normalbetrieb unsichtbar.
     gesamt        200 je fünf Minuten für den ganzen Dienst.

   Damit die Gesamtgrenze niemanden trifft, der sich richtig anmeldet, wird
   sie bei jeder gelungenen Anmeldung um diesen Versuch entlastet
   (`notentlasten`). Gezählt bleibt im Ergebnis, was fehlschlug.
   Zweihundert Fehlversuche in fünf Minuten für den ganzen Dienst sind für
   ehrliche Nutzung reichlich und für einen Angriff wenig: Der schlimmste Fall
   ist damit beziffert — rund zweihundert scrypt-Durchläufe je Fenster und
   Prozess — statt offen.

   Was sie nicht kann: über mehrere Instanzen hinweg zählen. Für diese
   Anwendung ist das kein Verlust — sie läuft als genau ein Node-Prozess je
   Container (deploy/compose.yml). Wer mehrere Instanzen fährt, braucht
   REDIS_REST_URL und REDIS_REST_TOKEN; erst dann ist auch die Hauptbremse
   über Instanzgrenzen hinweg verlässlich.
   -------------------------------------------------------------------------- */

/** @type {Record<string, {versuche: number, fenster: number, gesamt: number}>} */
export const NOTGRENZEN = {
  "anmelden-konto": { versuche: 20, fenster: 300, gesamt: 200 },
  /* Zugangscode (daten.mjs, /api/anmelden). Kein scrypt, aber ein einziger
     Treffer öffnet einen ganzen Betrieb. Je Herkunft wie beim Konto;
     gesamt wie WEITERE.anmelden.gesamt — im Normalbetrieb unsichtbar. */
  anmelden: { versuche: 20, fenster: 300, gesamt: 400 },
};

/** Der Zähler der Notbremse. Eigene Karte, damit sie sich mit der Zählung der
    Hauptbremse nicht vermischt. */
const not = new Map();

/** `bis`: Ende des NÄCHSTEN Fensters — dort zählt der Eintrag noch gleitend
    als „voriges“ mit. */
function notZaehlen(schluessel, bis, schritt = 1) {
  const jetzt = Date.now();
  const eintrag = not.get(schluessel);
  if (!eintrag || eintrag.bis < jetzt) {
    if (schritt < 0) return 0;
    not.set(schluessel, { n: schritt, bis });
    if (not.size > 500) for (const [k, v] of not) if (v.bis < jetzt) not.delete(k);
    return schritt;
  }
  eintrag.n = Math.max(0, eintrag.n + schritt);
  return eintrag.n;
}

function notLesen(schluessel) {
  const eintrag = not.get(schluessel);
  return eintrag && eintrag.bis >= Date.now() ? eintrag.n : 0;
}

/**
 * Die Grenze, die ohne Ablage gilt. Synchron und ohne Wirkung außerhalb des
 * Prozesses.
 *
 * @param {string} art
 * @param {string} kennung
 * @returns {{frei: boolean, wartet?: number, dimension?: string}}
 */
export function notbremse(art, kennung) {
  const g = NOTGRENZEN[art];
  if (!g) return { frei: true };
  const ms = Date.now();
  const jetzt = Math.floor(ms / 1000);
  const lage = fensterLage(ms, g.fenster);
  const f = lage.index;
  const bis = lage.ende + g.fenster * 1000;
  const wartet = g.fenster - (jetzt % g.fenster);

  /* Gleitend wie die Hauptbremse: das vorige Fenster zählt anteilig mit. */
  const eigene = gewichtet(notZaehlen(`${art}:${kennung}:${f}`, bis),
    notLesen(`${art}:${kennung}:${f - 1}`), lage.anteil);
  if (eigene > g.versuche) return { frei: false, wartet, dimension: "herkunft" };
  const alle = gewichtet(notZaehlen(`${art}:gesamt:${f}`, bis),
    notLesen(`${art}:gesamt:${f - 1}`), lage.anteil);
  if (alle > g.gesamt) return { frei: false, wartet, dimension: "gesamt" };
  return { frei: true };
}

/**
 * Einen Versuch zurücknehmen — nach einer gelungenen Anmeldung.
 *
 * Ohne das wäre die Gesamtgrenze eine Grenze für ALLE Anmeldungen, auch die
 * richtigen: Ein Schichtwechsel, bei dem sich zweihundert Menschen in fünf
 * Minuten anmelden, würde ausgebremst. Mit dem Zurücknehmen zählt am Ende,
 * was fehlgeschlagen ist.
 *
 * @param {string} art
 * @param {string} kennung
 */
export function notentlasten(art, kennung, { nurGesamt = false } = {}) {
  const g = NOTGRENZEN[art];
  if (!g) return;
  const lage = fensterLage(Date.now(), g.fenster);
  const f = lage.index;
  const bis = lage.ende + g.fenster * 1000;
  /* Zurückgenommen wird im laufenden Fenster; lag der Versuch noch im
     vorigen (Anmeldung über die Grenze hinweg), dort. `nurGesamt`
     (Review-Auflage M1): ein gültiger Code an einer Lastgrenze — der Dienst
     wird entlastet, die Herkunft nicht. */
  for (const k of nurGesamt ? [`${art}:gesamt`] : [`${art}:${kennung}`, `${art}:gesamt`]) {
    if (notLesen(`${k}:${f}`) > 0) notZaehlen(`${k}:${f}`, bis, -1);
    else notZaehlen(`${k}:${f - 1}`, bis, -1);
  }
}

/* --------------------------------------------------------------------------
   LASTBREMSE (WP-47) — Grenzen für ehrliche Spitzen, ohne Platte

   Stempeln (je Person, je Raum) und gelungene Anmeldungen (je Betrieb)
   schützen die Rechenleistung des einen Prozesses vor einer Spitze, nicht vor
   einem Angreifer, der etwas erraten will. Deshalb zählen sie nur im
   Prozessspeicher:

     - Kein Vermerk in der Ablage. Die Hauptbremse schrieb je Anfrage eine
       Datei (mit fsync) und las das Verzeichnis; beim Stempeln, das ohnehin
       unter der Raumsperre auf die Platte wartet, ist das genau die Last,
       die ein Schichtwechsel nicht braucht (WP-28: rund 15 fsync je Anfrage).
     - Sie kann nicht ausfallen und nie die Ablage belasten.
     - Ein Neustart leert sie — für eine Lastgrenze ohne Folgen.

   Alles, was etwas Geheimes schützt (Anmelden, Einrichten, zweiter Faktor,
   Zugänge), bleibt bei bremse() mit Ablage, fail-closed (WP-46) und
   Notbremse. Gleitendes Fenster wie dort; nach einer Überschreitung gilt eine
   kurze Sperre (GRENZEN[art].sperre), die der Aufrufer als Retry-After
   weitergibt.
   -------------------------------------------------------------------------- */
/** Sperren der Lastbremse: Schlüssel → Ende (ms). */
const lastSperre = new Map();

/**
 * @param {string} art        Schlüssel in GRENZEN (stempeln, stempeln-raum, anmelden-erfolg)
 * @param {string} kennung
 * @param {number} [versuche] Grenze dieses Aufrufs (Raumdeckel nach Betriebsgröße); sonst GRENZEN[art]
 * @returns {{frei: boolean, wartet?: number, uebrig?: number, neu?: boolean}}
 */
export function lastbremse(art, kennung, versuche) {
  const g = GRENZEN[art];
  if (!g) return { frei: true };
  const grenze = Number.isFinite(versuche) && versuche > 0 ? Math.floor(versuche) : g.versuche;
  const ms = Date.now();
  const lage = fensterLage(ms, g.fenster);
  const f = lage.index;
  const bis = lage.ende + g.fenster * 1000;
  const basis = `last:${art}:${kennung}`;
  const bis0 = lastSperre.get(basis);
  if (bis0 && bis0 > ms) return { frei: false, wartet: Math.max(1, Math.ceil((bis0 - ms) / 1000)) };
  const n = gewichtet(notZaehlen(`${basis}:${f}`, bis), notLesen(`${basis}:${f - 1}`), lage.anteil);
  if (n > grenze) {
    /* Wie bremse(): Sperre setzen, Zähler leeren — wer Retry-After befolgt, kommt wieder durch. */
    lastSperre.set(basis, ms + g.sperre * 1000);
    not.delete(`${basis}:${f}`);
    not.delete(`${basis}:${f - 1}`);
    if (lastSperre.size > 500) for (const [k, v] of lastSperre) if (v < ms) lastSperre.delete(k);
    /* `neu`: Diese Anfrage hat die Sperre gesetzt (Review-Auflage M2). Nur sie
       wird protokolliert — jede weitere Abweisung derselben Sperre schriebe
       sonst eine Protokolldatei und brächte die Plattenlast zurück, die die
       Lastbremse vermeiden soll. Gezählt (/gesund) wird trotzdem jede. */
    return { frei: false, wartet: g.sperre, neu: true };
  }
  return { frei: true, uebrig: Math.max(0, Math.floor(grenze - n)) };
}
