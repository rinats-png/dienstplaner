import { getStore } from "../lib/ablage.mjs";
import {
  bremse, notbremse, entlasten, notentlasten, kennung, herkunftStreng,
  zuVielAntwort, protokoll, GRENZEN,
} from "../lib/schutz.mjs";
import { accountSchluessel, accountLesenPerId } from "../lib/accounts.mjs";
import { mailNormieren, mailBrauchbar } from "../lib/adressen.mjs";
import {
  anmelden, sitzungPruefen, abmelden, kontoFaktorAktion, HINWEIS_ANMELDUNG, HINWEIS_SITZUNG,
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

/** SI-P4 / OPT-1-F: Für diesen Arbeitsbereich (oder dieses Konto) ist ein zweiter Faktor Pflicht. Ohne Personendaten,
    ohne Rolle. Der Weg: Passwort plus Code aus der App (Faktor am Konto, eingerichtet mit dem Ersteinrichtungscode) oder
    Zugangscode plus Code aus der App. */
const ZWEIFAKTOR_PFLICHT_ABSAGE = { ok: false, fehler: "zweifaktor-pflicht",
  hinweis: "Für diesen Arbeitsbereich ist ein zweiter Faktor Pflicht. Bitte mit Passwort und dem Code aus "
    + "der App anmelden (zweiten Faktor am Konto mit dem Ersteinrichtungscode einrichten) oder mit dem Zugangscode "
    + "und dem Code aus der App." };

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

/* SI-P4 (Review-Auflage M1): Diese Anmeldung legt nur eine Identität an — keine Rolle, keinen Bestand, keine
   Arbeitssitzung. Die Pflicht zum zweiten Faktor (CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT) greift deshalb dort, wo aus der
   Identität Rechte werden: bei der Betriebsauswahl (lib/betriebsauswahl.mjs, betriebWaehlen) und bei jeder Anfrage
   einer bestehenden Arbeitssitzung (lib/arbeitssitzung.mjs). */
async function anmeldung(req, k) {
  const gelesen = await rumpfLesen(req);
  if (!gelesen.ok) return gelesen.antwort;
  const { email, passwort, zweifaktor, zweifaktorAktion, ersteinrichtungscode } = gelesen.daten;

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
     im Prozessspeicher. `bremse()` lässt bei einem Fehler der Ablage nicht
     mehr durch (seit WP-46): Ein Lesefehler der Sperre gilt als Sperre,
     andere Fehler zählen im Prozessspeicher weiter. Degradiert zählt sie
     aber nur je Herkunft — Ziel und Gesamtaufkommen fallen weg, und jeder
     Versuch kostet einen scrypt-Durchlauf.

     Und sie gilt immer, nicht erst bei einem gemeldeten Fehler: Eine
     kaputte Ablage, die „nicht vorhanden" liefert statt zu werfen, bemerkt
     auch die Hauptbremse nicht. Es gibt dann kein Signal, auf das sich ein
     Umschalten stützen könnte. Damit ist der schlimmste Fall beziffert statt
     offen: rund NOTGRENZEN.gesamt scrypt-Durchläufe je Fenster und Prozess. */
  if (b.fehler) await protokoll("anmelden-konto", k, "bremse-ausfall", b.fehler);
  const n = notbremse("anmelden-konto", k);
  if (!n.frei) {
    await protokoll("anmelden-konto", k, "notbremse", n.dimension || null);
    return zuVielAntwort(n.wartet);
  }

  /* OPT-1-F: Einrichtung des zweiten Faktors am Konto, mit Adresse, Passwort und (Option A) dem Ersteinrichtungscode
     des Kontos als Ausweis. Dieselben zwei Bremsen wie die Anmeldung (oben), dazu die des Faktors für den Code aus der
     App. Es entsteht keine Sitzung, und das Cookie dieses Geräts bleibt, wie es ist — außer nach der Bestätigung: Dann
     sind alle Sitzungen des Kontos beendet. */
  const tor = faktorTor(k);
  if (zweifaktorAktion !== undefined)
    return faktorAktion(k, b, tor, { email, passwort, zweifaktor, zweifaktorAktion, ersteinrichtungscode });

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

  const e = await anmelden(store(), { email, passwort, zweifaktor, faktorTor: tor.pruefen });

  if (!e.ok) {
    await protokoll("anmelden-konto", k, "abgewiesen",
      String(e.grund || "").slice(0, 30));
    if (SERVERFEHLER.has(String(e.grund))) {
      return antwort({ ok: false, fehler: "nicht-moeglich", hinweis: e.hinweis },
        500, { "set-cookie": keksWeg() });
    }
    /* OPT-1-F: Das Passwort stimmte, der zweite Faktor nicht (oder er fehlt, ist gebremst, nicht prüfbar). Diese
       Antworten sieht nur, wer das Passwort kennt. Keine Sitzung, das Cookie weg. */
    const faktorFehler = faktorAbsage(e);
    if (faktorFehler) {
      if (e.grund === "zweifaktor-falsch" || e.grund === "zweifaktor-wiederholt")
        await new Promise((r) => setTimeout(r, 400));
      return faktorFehler;
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
  await entlasten("anmelden-konto", k, b);
  notentlasten("anmelden-konto", k);
  if (e.zweifaktor === true) await tor.entlasten();
  /* Kein Merkmal, keine Kennung, keine Adresse im Protokoll — nur, dass es
     geklappt hat. */
  await protokoll("anmelden-konto", k, "erfolg", e.zweifaktor === true ? "mit zweitem Faktor" : null);

  /* Die Antwort trägt kein Merkmal. Sie sagt, dass es geklappt hat; das
     Merkmal liegt im Cookie, für ein Skript im Browser unsichtbar. */
  return antwort({ ok: true, angemeldet: true }, 200,
    { "set-cookie": keksSetzen(e.token) });
}

/* --------------------------------------------------------------------------
   ZWEITER FAKTOR AM KONTO (OPT-1-F)
   -------------------------------------------------------------------------- */

/**
 * Die Bremse vor jeder Prüfung eines Codes aus der App: je Faktor (`ka:`) und je
 * Herkunft, Bremsart `zweifaktor` (fünf Versuche je fünf Minuten, Sperre
 * steigend bis zu einem Tag, fail-closed). Die Bibliothek ruft sie erst, wenn
 * das Passwort stimmte — wer nur die Adresse kennt, sperrt niemanden aus.
 * @param {string} k  Kennung der Herkunft
 */
function faktorTor(k) {
  /** @type {string[]} */
  const gezaehlt = [];
  return {
    /** @param {string} faktorId */
    pruefen: async (faktorId) => {
      for (const kk of [`ka:${String(faktorId).slice(0, 16)}`, k]) {
        const g = await bremse("zweifaktor", kk);
        if (!g.frei) {
          await protokoll("zweifaktor", k, "gebremst", `Konto · ${g.grund}`);
          return { wartet: g.wartet };
        }
        if (g.fehler && GRENZEN.zweifaktor.failClosed) return { nichtPruefbar: true };
        gezaehlt.push(kk);
      }
      return null;
    },
    entlasten: async () => { for (const kk of gezaehlt) await entlasten("zweifaktor", kk); },
  };
}

/** Die Antwort auf einen Fehler des zweiten Faktors — oder null, wenn es keiner war.
    @param {{grund: string, hinweis: string, wartet?: number}} e */
function faktorAbsage(e) {
  const weg = { "set-cookie": keksWeg() };
  const g = String(e.grund || "");
  if (g === "zweifaktor-erforderlich")
    return antwort({ ok: false, fehler: "zweifaktor", zweifaktor: "erforderlich", hinweis: e.hinweis }, 401, weg);
  if (g === "zweifaktor-falsch" || g === "zweifaktor-wiederholt")
    return antwort({ ok: false, fehler: "zweifaktor", zweifaktor: "falsch", hinweis: e.hinweis }, 401, weg);
  if (g === "zweifaktor-gebremst") {
    const z = zuVielAntwort(e.wartet || 60);
    z.headers.set("set-cookie", keksWeg());
    return z;
  }
  if (g.startsWith("faktor-"))
    return antwort({ ok: false, fehler: "nicht-moeglich", zweifaktor: "nicht-pruefbar", hinweis: e.hinweis }, 503, weg);
  return null;
}

/** Statuscodes der Einrichtung, je innerem Grund. */
const AKTION_STATUS = { "aktion-unbekannt": 400, "zweifaktor-erforderlich": 400, "faktor-aktiv": 409,
  "faktor-ausstehend": 409, "faktor-nichts": 409, "zweifaktor-falsch": 401 };

/**
 * Einrichtung des zweiten Faktors am Konto (stand, beginnen, bestaetigen).
 * @param {string} k
 * @param {any} b  das Ergebnis der Anmeldebremse dieser Anfrage
 * @param {ReturnType<typeof faktorTor>} tor
 * @param {{email: unknown, passwort: unknown, zweifaktor: unknown, zweifaktorAktion: unknown,
 *   ersteinrichtungscode: unknown}} r
 */
async function faktorAktion(k, b, tor, { email, passwort, zweifaktor, zweifaktorAktion, ersteinrichtungscode }) {
  const e = await kontoFaktorAktion(store(), { email, passwort, aktion: zweifaktorAktion, zweifaktor,
    ersteinrichtungscode, faktorTor: tor.pruefen });
  const aktion = String(zweifaktorAktion).slice(0, 12);
  if (!e.ok) {
    const g = String(e.grund || "");
    await protokoll("anmelden-konto", k, "abgewiesen", `Konto-Faktor ${aktion} · ${g.slice(0, 30)}`);
    if (g === "zweifaktor-gebremst") return zuVielAntwort(e.wartet || 60);
    /* OPT-1-F, Option A (Befund 1): ohne gültigen Ersteinrichtungscode keine Einrichtung. Nur wer das Passwort kennt,
       sieht diese Antwort; sie sagt nicht, warum der Code nicht gilt. */
    if (g === "ersteinrichtung")
      return antwort({ ok: false, fehler: "ersteinrichtung", hinweis: e.hinweis }, 403);
    /* Befund 3: Faktor aktiv, aber nicht alles aufgeräumt — keine Sitzung, das Cookie dieses Geräts weg. */
    if (g === "sitzungen")
      return antwort({ ok: false, fehler: "nicht-moeglich", zweifaktor: "nicht-pruefbar", hinweis: e.hinweis }, 503,
        { "set-cookie": keksWeg() });
    if (g.startsWith("faktor-") && !(g in AKTION_STATUS))
      return antwort({ ok: false, fehler: "nicht-moeglich", zweifaktor: "nicht-pruefbar", hinweis: e.hinweis }, 503);
    if (g in AKTION_STATUS) {
      if (g === "zweifaktor-falsch") await new Promise((r) => setTimeout(r, 400));
      return antwort({ ok: false, fehler: "zweifaktor", zweifaktor: g, hinweis: e.hinweis }, AKTION_STATUS[g]);
    }
    /* Alles andere ist eine Absage von Adresse oder Passwort — derselbe Satz wie bei der Anmeldung. */
    return antwort(ZUGANG_ABSAGE, 401);
  }
  /* Das Passwort stimmte: Der Versuch zählt nicht gegen die Herkunft. */
  await entlasten("anmelden-konto", k, b);
  notentlasten("anmelden-konto", k);
  if (zweifaktorAktion === "bestaetigen") {
    await tor.entlasten();
    await protokoll("anmelden-konto", k, "erfolg", `Konto-Faktor eingerichtet · ${e.sitzungenBeendet || 0} Sitzungen beendet`);
    /* Alle Sitzungen des Kontos sind beendet — auch die dieses Geräts. */
    return antwort({ ok: true, ...e.daten }, 200, { "set-cookie": keksWeg() });
  }
  if (zweifaktorAktion === "wiederherstellung-neu") {
    /* WR-2: Passwort und frischer Code aus der App stimmten. Die Codes stehen nur in der Antwort, nie im Protokoll. */
    await tor.entlasten();
    await protokoll("anmelden-konto", k, "erfolg", "Konto-Faktor · Wiederherstellungscodes neu erzeugt");
    return antwort({ ok: true, ...e.daten });
  }
  await protokoll("anmelden-konto", k, "erfolg", `Konto-Faktor ${aktion}`);
  return antwort({ ok: true, ...e.daten });
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
  /* OPT-1-F, Befund 3: Eine Sitzung ohne bestandenen Faktor bei aktivem Faktor des Kontos ist beendet (sitzungPruefen
     hat sie gelöscht). Die Antwort sagt dem Inhaber, wie es weitergeht — dieselbe wie unter Pflicht. */
  if (!p.ok && p.grund === "zweifaktor")
    return antwort(ZWEIFAKTOR_PFLICHT_ABSAGE, 403, { "set-cookie": keksWeg() });
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
    /* SI-P4, Review-Auflage M1: unter Pflicht kein Betrieb mit Leitungs-, Planungs- oder Kundenrechten über das
       Konto. Eigene Kennung, damit die Oberfläche auf den Zugangscode verweisen kann; ohne Personendaten, ohne
       Rolle — wer hier fragt, hat die Mitgliedschaft ohnehin. */
    if (e.grund === "zweifaktor-pflicht") return antwort(ZWEIFAKTOR_PFLICHT_ABSAGE, 403);
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
