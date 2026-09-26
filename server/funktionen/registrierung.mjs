import { getStore } from "../lib/ablage.mjs";
import { bremse, kennung, herkunftErlaubt, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { accountSchluessel } from "../lib/accounts.mjs";
import { mailNormieren } from "../lib/adressen.mjs";
import {
  registrierungStarten, emailVerifizieren, passwortMitNachweisSetzen,
  HINWEIS_GENERISCH, HINWEISE_PROFIL,
} from "../lib/registrierung.mjs";

/* ==========================================================================
   REGISTRIERUNG — die beiden ersten Schritte, öffentlich erreichbar

     POST /api/registrierung               eine Adresse angeben
     POST /api/registrierung/verifizieren  den Link aus der Mail einlösen
     POST /api/registrierung/passwort      das erste Passwort setzen

   Diese Datei entscheidet nichts. Sie liest einen Rumpf, bremst, prüft die
   Herkunft und gibt weiter an lib/registrierung.mjs — dort liegt die
   Geschäftslogik samt Fristen, Token, Profilprüfung und dem Anspruch auf
   einen Testbetrieb. Eine zweite Registrierung im HTTP-Layer wäre der
   Anfang von zwei Wahrheiten über denselben Vorgang.

   ---------------------------------------------------------------------------
   Was nach außen geht, und was nicht

   Die Antwort ist in jedem Fall dieselbe: `{ ok: true, hinweis }`. Ob eine
   Adresse neu ist, zu einem aktiven, einem gesperrten oder einem wartenden
   Konto gehört, entscheidet, was intern geschieht — nicht, was der Aufrufer
   sieht. „Diese Adresse ist bereits vergeben" wäre eine Auskunft darüber,
   wer CENTRIC benutzt, und mit einer Adressliste wäre sie in Minuten
   ausgelesen.

   Deshalb verlässt diese Datei niemals: eine Kontokennung, ein
   Kontozustand, die normalisierte Adresse, ein Token, ein Tokenzähler, ein
   Raum, eine Mitgliedschaft. Das Feld `protokoll`, das die Geschäftslogik
   für das Protokoll mitgibt, wird ausdrücklich nicht weitergereicht.

   Auch ein Fehler verrät nichts über den Bestand: Eine unbrauchbare Eingabe
   ist eine Aussage über die Eingabe und fällt für eine bekannte wie für
   eine unbekannte Adresse gleich aus. Und die Absage eines
   Bestätigungslinks lautet immer gleich — unbekannt, verbraucht,
   abgelaufen, entwertet und zweckfremd sehen von außen identisch aus.

   ---------------------------------------------------------------------------
   Was hier noch nicht geht

   Die Bestätigung gibt einen kurzlebigen Nachweis zurück (fünfzehn Minuten,
   einmalig), mit dem sich später das erste Passwort setzen lässt. Er ist das
   Einzige, was diese Datei je herausgibt, das ein Geheimnis ist — und er
   gehört dem Vorgang, den der Aufrufer selbst gerade abgeschlossen hat.

   Kein Passwort, keine Anmeldung, keine Sitzung, kein Cookie, kein
   Testbetrieb, keine Mitgliedschaft. Nach beiden Aufrufen existiert ein
   Konto, das noch nichts kann — genau das ist der Zweck.
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });

/** Rumpfgrenze für diese Endpunkte. Ein Name und eine Adresse brauchen kein
    Megabyte; alles darüber ist ein Versuch, den Parser zu beschäftigen. */
const RUMPF_MAX = 16 * 1024;

const antwort = (daten, status = 200, kopf = {}) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff", ...kopf },
  });

/**
 * Liest den Rumpf mit Obergrenze und beantwortet kaputtes JSON als Fehler
 * des Aufrufers.
 *
 * Dasselbe Muster wie `rumpfLesen` in daten.mjs — dort ist es privat, und
 * eine Kopie ist hier weniger riskant als ein Umbau an dem Endpunkt, der
 * den ganzen Bestand schreibt. Beide gehören zusammengelegt, sobald eine
 * dritte Stelle sie braucht.
 *
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

/** Nur Zeichenketten, und nur so lang, wie die Prüfung sie braucht. */
const feld = (wert) => (typeof wert === "string" ? wert.slice(0, 200) : wert);

/**
 * Was ein Eingabefehler nach außen sagen darf.
 *
 * Die Geschäftslogik nennt ihre Gründe genau — `adresse`, `vorname`,
 * `nachname`, `betriebsname` und Ablagefehler wie `versand`. Nach außen geht
 * nur, was ein Mensch zum Korrigieren braucht; alles andere wird zu einem
 * allgemeinen Fehler. Ein durchgereichter interner Grund wäre irgendwann
 * ein durchgereichter Speicherschlüssel.
 */
const OEFFENTLICHE_GRUENDE = new Set(["adresse", "vorname", "nachname", "betriebsname"]);

function eingabefehler(grund, hinweis) {
  if (!OEFFENTLICHE_GRUENDE.has(grund)) {
    return antwort({ ok: false, fehler: "nicht-moeglich",
      hinweis: "Das hat nicht geklappt. Bitte versuch es später noch einmal." }, 500);
  }
  return antwort({ ok: false, fehler: grund,
    hinweis: hinweis || HINWEISE_PROFIL[grund] || "Bitte prüfe deine Angaben." }, 400);
}

/** Die immer gleiche Absage eines Bestätigungslinks. */
const LINK_ABSAGE = {
  ok: false,
  fehler: "ungueltiger-oder-abgelaufener-link",
  hinweis: "Dieser Bestätigungslink ist nicht mehr gültig. Fordere bitte einen neuen an.",
};

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/\/+$/, "");

  /* Zustandsändernde Anfragen nur von der eigenen Seite — dieselbe Prüfung
     wie überall sonst (schutz.mjs), nicht strenger und nicht lockerer. */
  if (!herkunftErlaubt(req))
    return antwort({ ok: false, fehler: "fremde-herkunft" }, 403);

  const PFADE = ["/api/registrierung", "/api/registrierung/verifizieren",
    "/api/registrierung/passwort"];
  if (!PFADE.includes(pfad))
    return antwort({ ok: false, fehler: "unbekannter-pfad" }, 404);
  if (req.method !== "POST")
    return antwort({ ok: false, fehler: "nur-post" }, 405);

  const k = kennung(req, null);

  try {
    if (pfad === "/api/registrierung") return await starten(req, k);
    if (pfad === "/api/registrierung/verifizieren") return await verifizieren(req, k);
    return await erstesPasswort(req, k);
  } catch {
    /* Kein Grund nach außen: Was hier ankommt, ist ein Fehler der Ablage
       oder des Versands, und beides sagt über die Eingabe nichts. */
    return antwort({ ok: false, fehler: "nicht-moeglich",
      hinweis: "Das hat nicht geklappt. Bitte versuch es später noch einmal." }, 500);
  }
};

/* --------------------------------------------------------------------------
   REGISTRIERUNG STARTEN
   -------------------------------------------------------------------------- */

async function starten(req, k) {
  const gelesen = await rumpfLesen(req);
  if (!gelesen.ok) return gelesen.antwort;
  const { email, vorname, nachname, betriebsname } = gelesen.daten;

  /* Zwei Dimensionen: die Herkunft und die Adresse. Dieselbe Adresse aus
     hundert Herkünften ist ein Angriff auf ein Postfach — gezählt wird ihr
     Prüfwert, nie sie selbst. Ohne brauchbare Adresse gibt es kein Ziel,
     dann zählt die Herkunft allein. */
  const norm = mailNormieren(email);
  const ziel = norm ? accountSchluessel(norm) : null;
  const b = await bremse("registrierung", k, ziel);
  if (!b.frei) {
    /* Die Bremsantwort ist dieselbe, ob die Adresse bekannt ist oder nicht. */
    await protokoll("registrierung", k, "gebremst", b.grund);
    return zuVielAntwort(b.wartet);
  }

  const e = await registrierungStarten(store(), {
    email: feld(email), vorname: feld(vorname), nachname: feld(nachname),
    betriebsname: feld(betriebsname),
  });

  if (!e.ok) {
    /* Ein Versandfehler ist kein Eingabefehler: Das Konto steht, die Mail
       kam nicht weg. Der Mensch soll es erneut versuchen können, und der
       Bestand verrät sich dabei nicht. */
    await protokoll("registrierung", k, "fehler", String(e.grund || "").slice(0, 40));
    return eingabefehler(String(e.grund || ""), e.hinweis);
  }

  /* Ab hier ist jede Antwort dieselbe — ob ein Konto entstand, ob eine Mail
     ging, ob die Adresse längst aktiv ist. Was wirklich geschah, steht im
     Protokoll und verlässt den Server nicht. */
  await protokoll("registrierung", k, "erfolg", String(e.protokoll.fall).slice(0, 20));
  return antwort({ ok: true, hinweis: HINWEIS_GENERISCH });
}

/* --------------------------------------------------------------------------
   BESTÄTIGEN
   -------------------------------------------------------------------------- */

async function verifizieren(req, k) {
  const gelesen = await rumpfLesen(req);
  if (!gelesen.ok) return gelesen.antwort;
  const { token } = gelesen.daten;

  const b = await bremse("verifizieren", k);
  if (!b.frei) {
    await protokoll("verifizieren", k, "gebremst", b.grund);
    return zuVielAntwort(b.wartet);
  }

  /* Das Token steht im Rumpf, nie in der Adresszeile: Ein Abfragestring
     landet in Server- und Proxyprotokollen, ein Fragment erreicht den
     Server gar nicht. Das Frontend liest es aus dem Fragment und schickt es
     hierher. */
  const e = await emailVerifizieren(store(), { token });
  if (!e.ok) {
    /* Ein Grund fürs Protokoll, aber nicht für die Antwort: Woran der Link
       scheiterte, würde einem Angreifer sagen, ob er überhaupt je einer
       war. */
    await protokoll("verifizieren", k, "abgewiesen", String(e.grund || "").slice(0, 30));
    return antwort(LINK_ABSAGE, 400);
  }

  await protokoll("verifizieren", k, e.fortsetzung ? "erfolg" : "erfolg-ohne-nachweis", null);

  /* Keine Kennung, kein Kontozustand, kein Speicherschlüssel. Zwei Dinge
     gehen hinaus, und beide gehören zu dem Vorgang, den der Aufrufer selbst
     gerade abgeschlossen hat: dass noch ein Passwort fehlt, und der Nachweis,
     mit dem er es setzen darf.

     Der Nachweis steht im Rumpf, nicht in einer Adresszeile — ein
     Abfragestring landet in Protokollen. Er wird nicht gespeichert und nicht
     protokolliert; wo er hingehört, ist der Arbeitsspeicher des Browsers für
     die Dauer eines Formulars.

     Fehlt er, weil seine Ausstellung scheiterte, sagt die Antwort das
     schlicht dadurch, dass er fehlt: Die Adresse ist bestätigt, ein Passwort
     lässt sich noch nicht setzen, und ein neuer Bestätigungslink führt
     denselben Weg noch einmal. Der Grund dafür bleibt innen. */
  return antwort({ ok: true, passwortFehlt: !!e.passwortFehlt,
    ...(e.fortsetzung ? { fortsetzung: e.fortsetzung } : {}) });
}

/* --------------------------------------------------------------------------
   DAS ERSTE PASSWORT
   -------------------------------------------------------------------------- */

async function erstesPasswort(req, k) {
  const gelesen = await rumpfLesen(req);
  if (!gelesen.ok) return gelesen.antwort;
  const { fortsetzung, passwort } = gelesen.daten;

  /* Gebremst wird, weil jeder Versuch einen scrypt-Durchlauf kostet. Der
     Nachweis selbst ist 256 Bit lang — es geht nicht ums Raten, sondern um
     Rechenzeit. Gezählt wird je Herkunft; eine Adresse gibt es hier nicht,
     und der Nachweis taugt nicht als Zählschlüssel: Er ist ein Geheimnis. */
  const b = await bremse("passwort-setzen", k);
  if (!b.frei) {
    await protokoll("passwort-setzen", k, "gebremst", b.grund);
    return zuVielAntwort(b.wartet);
  }

  const e = await passwortMitNachweisSetzen(store(), {
    fortsetzung: typeof fortsetzung === "string" ? fortsetzung : null,
    passwort,
  });

  if (!e.ok) {
    await protokoll("passwort-setzen", k, "abgewiesen", String(e.grund || "").slice(0, 30));
    /* Zwei Klassen nach außen: Was am Passwort liegt, darf ein Mensch
       erfahren — er soll es verbessern können. Alles andere ist derselbe
       Satz, ob der Nachweis fehlte, ablief, verbraucht war, zu einem
       gesperrten Konto gehörte oder das Konto schon ein Passwort hatte. Eine
       feinere Auskunft wäre eine Auskunft über fremde Konten. */
    if (e.grund === "regel") {
      return antwort({ ok: false, fehler: "passwort", hinweis: e.hinweis }, 400);
    }
    return antwort({ ok: false, fehler: "ungueltiger-oder-abgelaufener-vorgang",
      hinweis: "Dieser Vorgang ist nicht mehr gültig. Fordere bitte einen neuen "
        + "Bestätigungslink an." }, 400);
  }

  await protokoll("passwort-setzen", k, "erfolg", null);
  /* Kein Passwort, kein Prüfwert, keine Kennung, kein Zustand, keine Sitzung.
     Der nächste Schritt ist eine Anmeldung, und die gibt es noch nicht. */
  return antwort({ ok: true });
}

export const config = {
  path: ["/api/registrierung", "/api/registrierung/verifizieren",
    "/api/registrierung/passwort"],
};
