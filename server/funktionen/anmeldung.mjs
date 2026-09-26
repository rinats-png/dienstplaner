import { getStore } from "../lib/ablage.mjs";
import {
  bremse, entlasten, kennung, herkunftStreng, zuVielAntwort, protokoll,
} from "../lib/schutz.mjs";
import { accountSchluessel, accountLesenPerId } from "../lib/accounts.mjs";
import { mailNormieren, mailBrauchbar } from "../lib/adressen.mjs";
import {
  anmelden, sitzungPruefen, abmelden, HINWEIS_ANMELDUNG, HINWEIS_SITZUNG,
} from "../lib/accountanmeldung.mjs";
import { DAUER } from "../lib/accountsitzungen.mjs";

/* ==========================================================================
   ACCOUNT-ZUGANG ÜBER HTTP

     POST /api/account/anmelden   E-Mail und Passwort gegen ein Cookie
     GET  /api/account/sitzung    Gilt meine Sitzung noch, und wer bin ich?
     POST /api/account/abmelden   Sitzung widerrufen, Cookie löschen

   Diese Datei entscheidet nichts über Identität und Recht. Sie liest einen
   Rumpf oder ein Cookie, prüft Herkunft und Bremse und gibt weiter an
   lib/accountanmeldung.mjs. Die Prüfung von Adresse, Passwort, Zustand und
   Epoche liegt dort — hier steht kein zweites Urteil.

   ---------------------------------------------------------------------------
   Das Cookie

     Name       __Host-centric_konto
     Wert       das Sitzungsmerkmal, 43 Zeichen base64url
     HttpOnly   kein Skript im Browser sieht es. Damit ist ein
                Cross-Site-Scripting-Fund nicht automatisch ein
                Sitzungsdiebstahl, und localStorage kommt gar nicht vor.
     Secure     immer, ohne Ausnahme und ohne Blick auf einen Kopf. Es wäre
                ein Fehler, `x-forwarded-proto` darüber entscheiden zu
                lassen: Der Kopf kommt von außen, und eine Sicherheitszusage
                darf nicht daran hängen, was jemand mitschickt.
     SameSite   Strict. Begründung unten.
     Path       /
     Domain     keine — das ist Teil der Zusage, nicht eine Auslassung.
     Max-Age    zwölf Stunden, dieselbe Zahl wie die Frist der Sitzung.
                Verbindlich ist aber der Server: Er prüft Frist,
                Untätigkeit, Sperre und Epoche bei jedem Zugriff. Das
                Cookie ist Hygiene, keine Sicherung.

   Warum das Präfix `__Host-`: Ein Browser nimmt ein so benanntes Cookie nur
   an, wenn es `Secure` trägt, `Path=/` hat und KEINE Domain nennt. Damit
   kann kein Nachbar-Host unter derselben Domain — auch keiner, der einmal
   übernommen wird — ein Cookie dieses Namens für uns setzen. Die Regel
   steht im Namen und wird vom Browser durchgesetzt, nicht von uns.

   Warum SameSite=Strict und nicht Lax: Es gibt keinen Ablauf, der das
   Cookie bei einem seitenübergreifenden Wechsel braucht — keine Rückkehr
   von einem Zahlungsdienst, keine Anmeldung über einen Dritten. Was es
   kostet: Wer aus einer Mail heraus auf die Anwendung klickt, schickt bei
   dieser einen Navigation kein Cookie mit. Das ist folgenlos, weil die
   Oberfläche eine statisch ausgelieferte Anwendung ist: Sie fragt ihren
   Zustand danach selbst ab, und diese Abfrage kommt von der eigenen Seite
   und trägt das Cookie. Für Lax gibt es also keinen Anlass, und Strict ist
   die engere Zusage.

   Was nirgends passiert: kein Merkmal in einer Adresse, keines in einer
   JSON-Antwort, keines im Protokoll. Das Merkmal existiert für den Server
   im Cookie-Kopf und sonst nirgends.

   ---------------------------------------------------------------------------
   Herkunft

   Geprüft wird mit `herkunftStreng` (schutz.mjs), nicht mit der Prüfung, die
   für die Endpunkte mit `authorization`-Kopf gilt: Ein Cookie schickt der
   Browser von selbst, also muss eine zustandsändernde Anfrage ihren eigenen
   Origin nachweisen. Fehlt er, ist Schluss — anders als bisher. Die
   Begründung steht bei der Funktion.

   ---------------------------------------------------------------------------
   Was hier NICHT geschieht

   Keine Betriebsauswahl, keine Mitgliedschaft, keine Rolle, kein Recht auf
   irgendeinen Bestand. Eine Account-Sitzung belegt eine Identität. Der Weg
   in einen Betrieb ist ein eigener, späterer Vorgang — und die
   Arbeitssitzungen mit ihrem `authorization`-Kopf bleiben davon unberührt:
   Sie kennen dieses Cookie nicht, und dieses Cookie öffnet sie nicht.
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });

/** Der Name, unter dem das Merkmal beim Browser liegt. Das Präfix ist kein
    Schmuck: Es verpflichtet den Browser auf Secure, Path=/ und keine
    Domain. */
export const COOKIE = "__Host-centric_konto";

/* Sechzehn Kilobyte. Eine Adresse und ein Passwort sind ein paar hundert
   Zeichen; alles darüber ist ein Versuch, den Parser zu beschäftigen.
   Dieselbe Grenze wie in funktionen/registrierung.mjs. */
const RUMPF_MAX = 16 * 1024;

const antwort = (daten, status = 200, kopf = {}) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff", ...kopf },
  });

/** Das Cookie setzen. Die Attribute stehen an dieser einen Stelle. */
const keksSetzen = (merkmal) =>
  `${COOKIE}=${merkmal}; Max-Age=${Math.floor(DAUER / 1000)}; Path=/; `
  + "HttpOnly; Secure; SameSite=Strict";

/** Das Cookie löschen. Name, Pfad und Attribute müssen mit dem Setzen
    übereinstimmen, sonst löscht der Browser nichts, sondern legt ein
    zweites daneben. Deshalb dieselbe Zeile, nur mit leerem Wert und
    Max-Age=0. */
const keksWeg = () =>
  `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;

/**
 * Liest das eigene Cookie aus dem Kopf — und nur das eigene.
 *
 * Fremde Cookies werden gelesen und stehen gelassen: Diese Datei schreibt
 * ausschließlich ihren eigenen Namen. Ein Wert, der nicht wie ein Merkmal
 * aussieht, gilt als nicht vorhanden; er soll nicht in die Ablage gehen.
 *
 * @param {Request} req
 * @returns {string|null}
 */
export function merkmalAusKeks(req) {
  const kopf = (req && req.headers && req.headers.get("cookie")) || "";
  for (const teil of String(kopf).split(";")) {
    const trennung = teil.indexOf("=");
    if (trennung < 1) continue;
    if (teil.slice(0, trennung).trim() !== COOKIE) continue;
    const wert = teil.slice(trennung + 1).trim();
    return /^[A-Za-z0-9_-]{20,200}$/.test(wert) ? wert : null;
  }
  return null;
}

/**
 * Rumpf mit Obergrenze. Dasselbe Muster wie in registrierung.mjs; beide
 * gehören zusammengelegt, sobald eine vierte Stelle sie braucht.
 * @param {Request} req
 * @returns {Promise<{ok: true, daten: object}|{ok: false, antwort: Response}>}
 */
async function rumpfLesen(req) {
  const laenge = Number(req.headers.get("content-length") || 0);
  if (laenge > RUMPF_MAX)
    return { ok: false, antwort: antwort({ ok: false, fehler: "zu-gross" }, 413) };
  let text;
  try { text = await req.text(); } catch { text = ""; }
  if (text.length > RUMPF_MAX)
    return { ok: false, antwort: antwort({ ok: false, fehler: "zu-gross" }, 413) };
  if (!text.trim()) return { ok: true, daten: {} };
  try {
    const daten = JSON.parse(text);
    if (!daten || typeof daten !== "object" || Array.isArray(daten))
      return { ok: false, antwort: antwort({ ok: false, fehler: "kein-objekt" }, 400) };
    return { ok: true, daten };
  } catch {
    return { ok: false, antwort: antwort({ ok: false, fehler: "kaputtes-json" }, 400) };
  }
}

/** Die immer gleiche Absage einer Anmeldung. Ein Satz für jeden Grund:
    unbekannte Adresse, falsches Passwort, gesperrtes Konto, unbestätigte
    Adresse, fehlendes Passwort. Jede Unterscheidung wäre die Auskunft, wer
    hier ein Konto hat. */
const ZUGANG_ABSAGE = { ok: false, fehler: "zugangsdaten", hinweis: HINWEIS_ANMELDUNG };

/** Und die Absage einer Sitzung — abgelaufen, untätig, entwertet, gesperrt,
    gar nicht vorhanden. Auch hier ein Satz. */
const SITZUNG_ABSAGE = { ok: false, angemeldet: false, hinweis: HINWEIS_SITZUNG };

/* Was ein Fehler nach außen sagen darf: „speichern" ist kein Anmeldefehler,
   sondern ein Fehler des Servers, und ihn als falsche Zugangsdaten
   auszugeben wäre eine Falschauskunft an jemanden, der alles richtig
   gemacht hat. Alles andere ist die eine Absage. */
const SERVERFEHLER = new Set(["speichern"]);

const PFADE = ["/api/account/anmelden", "/api/account/sitzung",
  "/api/account/abmelden"];

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/\/+$/, "");

  if (!PFADE.includes(pfad))
    return antwort({ ok: false, fehler: "unbekannter-pfad" }, 404);

  /* Zuerst die Herkunft — vor dem Lesen des Rumpfs und vor jeder Bremse:
     Eine Anfrage von fremder Seite soll nicht einmal gezählt werden. */
  if (!herkunftStreng(req))
    return antwort({ ok: false, fehler: "fremde-herkunft" }, 403);

  const k = kennung(req, null);

  try {
    if (pfad === "/api/account/anmelden") {
      if (req.method !== "POST")
        return antwort({ ok: false, fehler: "nur-post" }, 405, { allow: "POST" });
      return await anmeldung(req, k);
    }
    if (pfad === "/api/account/sitzung") {
      if (req.method !== "GET" && req.method !== "HEAD")
        return antwort({ ok: false, fehler: "nur-get" }, 405, { allow: "GET, HEAD" });
      return await sitzungsstand(req, k);
    }
    if (req.method !== "POST")
      return antwort({ ok: false, fehler: "nur-post" }, 405, { allow: "POST" });
    return await abmeldung(req, k);
  } catch {
    /* Kein Grund nach außen: Was hier ankommt, ist ein Fehler der Ablage,
       und der sagt über die Eingabe nichts. */
    return antwort({ ok: false, fehler: "nicht-moeglich",
      hinweis: "Das hat nicht geklappt. Bitte versuch es später noch einmal." }, 500);
  }
};

/* --------------------------------------------------------------------------
   ANMELDEN
   -------------------------------------------------------------------------- */

async function anmeldung(req, k) {
  const gelesen = await rumpfLesen(req);
  if (!gelesen.ok) return gelesen.antwort;
  const { email, passwort } = gelesen.daten;

  /* Zwei Dimensionen: die Herkunft und das Konto. Gezählt wird der
     Ablageschlüssel der Adresse — ein gepfefferter Prüfwert, nie die
     Adresse selbst. Ohne brauchbare Adresse gibt es kein Ziel, dann zählt
     die Herkunft allein.

     Gebremst wird VOR dem Aufruf der Anmeldung, nicht danach: Jeder Versuch
     kostet einen scrypt-Durchlauf, und der ist der eigentliche Aufwand. */
  const norm = mailNormieren(email);
  const ziel = mailBrauchbar(norm) ? accountSchluessel(norm) : null;
  const b = await bremse("anmelden-konto", k, ziel);
  if (!b.frei) {
    await protokoll("anmelden-konto", k, "gebremst",
      `${b.grund}${b.dimension ? ` (${b.dimension})` : ""}`);
    return zuVielAntwort(b.wartet);
  }
  /* Eine ausgefallene Bremse lässt durch (schutz.mjs, Verfügbarkeit vor
     Schutz). Dann soll es zumindest in der Spur stehen. */
  if (b.fehler) await protokoll("anmelden-konto", k, "bremse-ausfall", b.fehler);

  /* Ein Merkmal, das der Aufrufer schon mitbringt, wird widerrufen — noch
     bevor ein neues entsteht. Zwei Gründe: Nach einer neuen Anmeldung soll
     auf diesem Gerät genau eine Sitzung liegen und nicht ein Stapel; und
     ein Wert, den irgendwer vorher gesetzt hätte, wird dadurch nie
     übernommen, sondern gelöscht. Andere Geräte desselben Menschen bleiben
     angemeldet — eine Anmeldung hier ist kein Grund, dort hinauszuwerfen. */
  const altes = merkmalAusKeks(req);
  if (altes) await abmelden(altes);

  const e = await anmelden(store(), { email, passwort });

  if (!e.ok) {
    await protokoll("anmelden-konto", k, "abgewiesen",
      String(e.grund || "").slice(0, 30));
    if (SERVERFEHLER.has(String(e.grund))) {
      return antwort({ ok: false, fehler: "nicht-moeglich", hinweis: e.hinweis },
        500, { "set-cookie": keksWeg() });
    }
    /* 401 und immer derselbe Satz. Dazu das alte Cookie weg: Es gilt
       ohnehin nicht mehr, und ein Browser soll es nicht weiter mitschicken. */
    return antwort({ ...ZUGANG_ABSAGE,
      ...(b.uebrig !== undefined && b.uebrig <= 3
        ? { hinweis: `${HINWEIS_ANMELDUNG} Noch ${b.uebrig} Versuche, dann ist der `
          + "Zugang kurz gesperrt." } : {}) },
    401, { "set-cookie": keksWeg() });
  }

  /* Wer sich richtig anmeldet, hat sich vorher offenbar nur vertippt. */
  await entlasten("anmelden-konto", k);
  /* Kein Merkmal, keine Kennung, keine Adresse im Protokoll — nur, dass es
     geklappt hat. */
  await protokoll("anmelden-konto", k, "erfolg", null);

  /* Die Antwort trägt kein Merkmal. Sie sagt, dass es geklappt hat; das
     Merkmal liegt im Cookie, für ein Skript im Browser unsichtbar. */
  return antwort({ ok: true, angemeldet: true }, 200,
    { "set-cookie": keksSetzen(e.token) });
}

/* --------------------------------------------------------------------------
   SITZUNG PRÜFEN
   -------------------------------------------------------------------------- */

async function sitzungsstand(req, k) {
  const b = await bremse("konto-sitzung", k);
  if (!b.frei) return zuVielAntwort(b.wartet);

  const merkmal = merkmalAusKeks(req);
  /* Ohne Cookie gibt es nichts zu prüfen — und nichts zu löschen. */
  if (!merkmal) return antwort(SITZUNG_ABSAGE, 401);

  const p = await sitzungPruefen(store(), merkmal);
  if (!p.ok) {
    /* Die Sitzung ist serverseitig schon weg (sitzungPruefen räumt sie
       auf). Das Cookie mitzunehmen ist Hygiene: Ein Browser soll ein
       wertloses Merkmal nicht weiter mitschicken. */
    return antwort(SITZUNG_ABSAGE, 401, { "set-cookie": keksWeg() });
  }

  /* Die Anzeigeform der Adresse, damit die Oberfläche sagen kann, als wer
     jemand angemeldet ist. Sonst nichts: keine Kennung, keine Epoche, kein
     Speicherschlüssel, keine Rolle, keine Mitgliedschaft, kein Betrieb.
     Diese Antwort ist eine Identität und keine Berechtigung. */
  const konto = await accountLesenPerId(store(), p.accountId).catch(() => null);
  if (!konto) return antwort(SITZUNG_ABSAGE, 401, { "set-cookie": keksWeg() });

  return antwort({ ok: true, angemeldet: true, email: konto.email, bis: p.bis });
}

/* --------------------------------------------------------------------------
   ABMELDEN
   -------------------------------------------------------------------------- */

async function abmeldung(req, k) {
  const b = await bremse("konto-sitzung", k);
  if (!b.frei) return zuVielAntwort(b.wartet);

  const merkmal = merkmalAusKeks(req);
  /* Ohne Cookie ist nichts zu widerrufen. Das ist kein Fehler: Abmelden
     soll immer gelingen, und ob es eine Sitzung gab, ist eine Auskunft,
     die niemand bekommen muss. Das Löschen geht trotzdem mit — ein
     unbrauchbarer Wert im Browser soll verschwinden. */
  if (!merkmal)
    return antwort({ ok: true, angemeldet: false }, 200, { "set-cookie": keksWeg() });

  const e = await abmelden(merkmal);
  if (!e.ok) {
    /* Der Widerruf ist gescheitert, die Sitzung gilt also weiter. Das
       Cookie wird dennoch gelöscht — der Browser soll ein Merkmal nicht
       behalten, das der Mensch loswerden wollte —, aber die Antwort sagt
       die Wahrheit: Das war kein vollständiges Abmelden. Ein „ok: true"
       hier wäre die gefährlichste Lüge dieses Endpunkts. */
    await protokoll("konto-sitzung", k, "abmelden-unvollstaendig", null);
    return antwort({ ok: false, fehler: "abmelden-unvollstaendig",
      hinweis: "Die Sitzung konnte nicht vollständig beendet werden. Bitte "
        + "versuche es noch einmal." }, 500, { "set-cookie": keksWeg() });
  }

  await protokoll("konto-sitzung", k, "abgemeldet", null);
  return antwort({ ok: true, angemeldet: false }, 200, { "set-cookie": keksWeg() });
}

export const config = {
  path: ["/api/account/anmelden", "/api/account/sitzung", "/api/account/abmelden"],
};
