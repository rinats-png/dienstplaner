import { getStore } from "../lib/ablage.mjs";
import {
  bremse, notbremse, entlasten, notentlasten, kennung, herkunftStreng,
  zuVielAntwort, protokoll,
} from "../lib/schutz.mjs";
import { accountSchluessel, accountLesenPerId } from "../lib/accounts.mjs";
import { mailNormieren, mailBrauchbar } from "../lib/adressen.mjs";
import {
  anmelden, sitzungPruefen, abmelden, HINWEIS_ANMELDUNG, HINWEIS_SITZUNG,
  HINWEIS_SPEICHERN,
} from "../lib/accountanmeldung.mjs";
import { DAUER } from "../lib/accountsitzungen.mjs";
import {
  mitgliedschaftenFuerAuswahl, betriebWaehlen,
} from "../lib/betriebsauswahl.mjs";

/* ==========================================================================
   ACCOUNT-ZUGANG ÜBER HTTP

     POST /api/account/anmelden          E-Mail und Passwort gegen ein Cookie
     GET  /api/account/sitzung           Gilt meine Sitzung noch, wer bin ich?
     POST /api/account/abmelden          Sitzung widerrufen, Cookie löschen
     GET  /api/account/mitgliedschaften  Welche Betriebe kann ich anwählen?
     POST /api/account/betrieb           Genau einen davon öffnen

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

   Keine automatische Betriebsauswahl, keine Mitgliedschaft, keine Rolle,
   kein Recht auf irgendeinen Bestand — auch nicht bei genau einer
   Mitgliedschaft. Eine Account-Sitzung belegt eine Identität; der Weg in
   einen Betrieb ist ein ausdrücklicher zweiter Aufruf, und was dabei gilt,
   entscheidet ausschließlich der Server (lib/betriebsauswahl.mjs).

   Die dabei entstehende Arbeitssitzung ist eine andere Sitzung: eigenes
   Merkmal, eigene Ablage, `authorization`-Kopf statt Cookie. Das Cookie
   öffnet keinen Bestand, und das Arbeitsmerkmal öffnet kein Konto.
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
  "/api/account/abmelden", "/api/account/mitgliedschaften",
  "/api/account/betrieb"];

/** Die eine Absage für jeden Betrieb, der sich nicht öffnen lässt: Es gibt
    ihn nicht, es gibt keine Mitgliedschaft, sie ist entzogen, ihr fehlt die
    Person, der Bestand ist unlesbar. Ein Unterschied nach außen wäre ein
    Verzeichnis fremder Betriebe. */
const BETRIEB_ABSAGE = { ok: false, fehler: "kein-zugang",
  hinweis: "Dieser Arbeitsbereich steht dir nicht offen." };

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
    if (pfad === "/api/account/mitgliedschaften") {
      if (req.method !== "GET" && req.method !== "HEAD")
        return antwort({ ok: false, fehler: "nur-get" }, 405, { allow: "GET, HEAD" });
      return await mitgliedschaften(req, k);
    }
    if (pfad === "/api/account/betrieb") {
      if (req.method !== "POST")
        return antwort({ ok: false, fehler: "nur-post" }, 405, { allow: "POST" });
      return await betriebOeffnen(req, k);
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

  /* Die zweite Grenze, und die einzige, die nicht ausfallen kann: Sie zählt
     im Prozessspeicher. `bremse()` lässt bei einem Fehler der Ablage durch
     (schutz.mjs, Verfügbarkeit vor Schutz) — für einen Dienstplan richtig,
     für eine Passwortprüfung nicht: Jeder Versuch kostet einen
     scrypt-Durchlauf, und eine blinde Bremse hieße unbegrenzt viele davon.

     Und sie gilt immer, nicht erst bei einem gemeldeten Fehler: Eine
     kaputte Ablage fällt nicht auf: Sie liefert „nicht vorhanden" statt zu
     werfen, und die Hauptbremse zählt dann still null (schutz.mjs). Es gibt
     also kein Signal, auf das sich ein Umschalten stützen könnte. Damit ist
     der schlimmste Fall beziffert statt offen: rund NOTGRENZEN.gesamt
     scrypt-Durchläufe je Fenster und Prozess. */
  if (b.fehler) await protokoll("anmelden-konto", k, "bremse-ausfall", b.fehler);
  const n = notbremse("anmelden-konto", k);
  if (!n.frei) {
    await protokoll("anmelden-konto", k, "notbremse", n.dimension || null);
    return zuVielAntwort(n.wartet);
  }

  /* Ein Merkmal, das der Aufrufer schon mitbringt, wird widerrufen — noch
     bevor ein neues entsteht. Zwei Gründe: Nach einer neuen Anmeldung soll
     auf diesem Gerät genau eine Sitzung liegen und nicht ein Stapel; und
     ein Wert, den irgendwer vorher gesetzt hätte, wird dadurch nie
     übernommen, sondern gelöscht. Andere Geräte desselben Menschen bleiben
     angemeldet — eine Anmeldung hier ist kein Grund, dort hinauszuwerfen. */
  const altes = merkmalAusKeks(req);
  if (altes) {
    const weg = await abmelden(altes);
    if (!weg.ok) {
      /* Die Regel: Ein gescheiterter Widerruf ist kein Sitzungswechsel.
         Würde hier trotzdem eine neue Sitzung entstehen, gälten zwei
         gleichzeitig — die alte, die niemand mehr sieht, und die neue.
         Also keine neue Sitzung, eine ehrliche Absage und das Cookie weg:
         Der nächste Versuch bringt kein altes Merkmal mehr mit und
         gelingt. Fremde Geräte sind davon nicht betroffen; widerrufen
         wird ausschließlich das Merkmal dieser Anfrage. */
      await protokoll("anmelden-konto", k, "wechsel-unvollstaendig", null);
      return antwort({ ok: false, fehler: "nicht-moeglich",
        hinweis: HINWEIS_SPEICHERN }, 500, { "set-cookie": keksWeg() });
    }
  }

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

  /* Wer sich richtig anmeldet, hat sich vorher offenbar nur vertippt. Das
     gilt für beide Grenzen: Die Gesamtgrenze der Notbremse soll Fehlversuche
     zählen, nicht Anmeldungen — sonst bremst ein Schichtwechsel sich
     selbst aus. */
  await entlasten("anmelden-konto", k);
  notentlasten("anmelden-konto", k);
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

/* --------------------------------------------------------------------------
   DIE EIGENEN ARBEITSBEREICHE
   -------------------------------------------------------------------------- */

async function mitgliedschaften(req, k) {
  const b = await bremse("konto-sitzung", k);
  if (!b.frei) return zuVielAntwort(b.wartet);

  const merkmal = merkmalAusKeks(req);
  if (!merkmal) return antwort(SITZUNG_ABSAGE, 401);
  const p = await sitzungPruefen(store(), merkmal);
  if (!p.ok) return antwort(SITZUNG_ABSAGE, 401, { "set-cookie": keksWeg() });

  /* Die Kennung kommt aus der geprüften Sitzung, nie aus der Anfrage. */
  const e = await mitgliedschaftenFuerAuswahl(store(), p.accountId);
  /* Auch eine leere Liste ist eine gelungene Antwort: Wer noch nirgends
     Mitglied ist, ist trotzdem angemeldet. Und keine Auswahl geschieht hier,
     auch nicht bei genau einem Eintrag — dafür gibt es den zweiten Aufruf. */
  return antwort({ ok: true, mitgliedschaften: e.mitgliedschaften });
}

/* --------------------------------------------------------------------------
   EINEN BETRIEB ÖFFNEN
   -------------------------------------------------------------------------- */

async function betriebOeffnen(req, k) {
  const b = await bremse("betrieb-waehlen", k);
  if (!b.frei) {
    await protokoll("betrieb-waehlen", k, "gebremst", b.grund);
    return zuVielAntwort(b.wartet);
  }

  const gelesen = await rumpfLesen(req);
  if (!gelesen.ok) return gelesen.antwort;
  /* Aus dem Rumpf wird genau ein Feld gelesen. Alles andere — eine Rolle,
     eine Personenkennung, eine Kontokennung, eine Mitgliedschaft — wird
     nicht gelesen und kann deshalb nichts bewirken. */
  const { raum } = gelesen.daten;
  if (typeof raum !== "string" || !raum.trim())
    return antwort({ ok: false, fehler: "raum-fehlt" }, 400);

  const merkmal = merkmalAusKeks(req);
  if (!merkmal) return antwort(SITZUNG_ABSAGE, 401);
  const p = await sitzungPruefen(store(), merkmal);
  if (!p.ok) return antwort(SITZUNG_ABSAGE, 401, { "set-cookie": keksWeg() });

  /* Die Arbeitssitzung hängt an dieser Anmeldung: Kennung und Ende der
     geprüften Account-Sitzung gehen mit, nie etwas aus der Anfrage. */
  const e = await betriebWaehlen(store(), { accountId: p.accountId, raum,
    kontoSitzung: { id: p.sitzungsId, bis: p.bis } });
  if (!e.ok) {
    await protokoll("betrieb-waehlen", k, "abgewiesen",
      String(e.grund || "").slice(0, 30));
    /* Ein Fehler der Ablage ist kein fehlender Zugang — das eine ist unsere
       Schuld, das andere eine Auskunft. Alles übrige ist dieselbe Absage. */
    if (e.grund === "speichern") {
      return antwort({ ok: false, fehler: "nicht-moeglich",
        hinweis: HINWEIS_SPEICHERN }, 500);
    }
    return antwort(BETRIEB_ABSAGE, 403);
  }

  await protokoll("betrieb-waehlen", k, "erfolg", null, { rolle: e.rolle,
    person: e.person, weg: e.raum, verfahren: "konto" });

  /* Das Merkmal der Arbeitssitzung geht in den Rumpf, nicht in ein Cookie:
     Die Anwendung führt es im Kopf `authorization` — so, wie sie es seit
     Anfang an tut. Das Account-Cookie bleibt davon unberührt und wird
     nicht wiederverwendet; die beiden Merkmale haben nichts miteinander zu
     tun und liegen in getrennten Ablagen. */
  return antwort({ ok: true, token: e.token, gueltigBis: e.gueltigBis,
    raum: e.raum, name: e.name, rolle: e.rolle, person: e.person,
    betrieb: e.betrieb });
}

export const config = {
  path: ["/api/account/anmelden", "/api/account/sitzung", "/api/account/abmelden",
    "/api/account/mitgliedschaften", "/api/account/betrieb"],
};
