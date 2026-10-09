/* ==========================================================================
   ACCOUNT-SITZUNGEN — die Mechanik, und nur die

   Eine Account-Sitzung beantwortet genau eine Frage: Wer ist dieser
   Mensch? Sie beantwortet NICHT, was er darf. Kein Raum, keine Rolle,
   keine Person, kein Betrieb — nichts davon steht in dieser Datei, und
   nichts davon lässt sich in eine Account-Sitzung schreiben.

   ---------------------------------------------------------------------------
   Warum nicht die vorhandenen Sitzungen

   Die gewöhnlichen Sitzungen (sitzungen.mjs) sind Arbeitssitzungen: Sie
   tragen `bestand`, `rolle`, `person`, `betrieb`, `einheit` und die
   Prüfsumme eines Zugangscodes. Jeder Endpunkt der Anwendung liest genau
   diese Felder und leitet daraus Rechte ab — über `wirksameRolle` und
   `schreibumfang` (rechte.mjs).

   Eine Anmeldung mit E-Mail und Passwort weiß von all dem nichts. Sie
   bestätigt eine Identität; welcher Betrieb daraus folgt, entscheidet ein
   eigener, späterer Vorgang (die Auswahl des Arbeitsbereichs). Würde die
   Anmeldung eine Sitzung der alten Art anlegen, müsste sie Felder füllen,
   die sie nicht kennt — und jedes Feld, das sie dann mit einem
   Platzhalter füllt, ist eine Behauptung über eine Berechtigung.

   Deshalb zwei sauber getrennte Arten, und die Trennung liegt nicht an
   einem Merkmal im Datensatz, sondern schon an der Ablage:

     centric-sitzungen          t:…   Arbeitssitzung (Legacy, Zugangscode)
                                sk:…  Sicherungsschlüssel
     centric-accountsitzungen   as:…  Account-Sitzung (Identität)

   Zwei Speicher, zwei Präfixe. `sitzungLesen` sieht eine Account-Sitzung
   nie, weil sie in einem anderen Speicher liegt; diese Datei sieht eine
   Arbeitssitzung nie, aus demselben Grund. Kein Merkmal, an dem sich das
   verwechseln ließe, und kein Aufräumlauf, der in den fremden Bestand
   greift: Der Lauf, der beim Sperren von Zugangscodes alle Sitzungen
   durchsieht (daten.mjs), listet den Speicher der Arbeitssitzungen — er
   kann Account-Sitzungen nicht einmal aufzählen.

   ---------------------------------------------------------------------------
   Was in einer Account-Sitzung steht

     art        immer "konto" — damit ein Datensatz sich selbst benennt
     accountId  die stabile Kennung des Accounts
     epoche     die Epoche des Accounts zum Zeitpunkt der Anmeldung
     seit       Beginn
     zuletzt    letzter Zugriff (für die Untätigkeitsgrenze)
     bis        absolutes Ende

   Mehr nicht. Diese Datei nimmt keine Felder von einem Aufrufer an — anders
   als `sitzungAnlegen`, das `...felder` durchreicht. Damit lässt sich in
   eine Account-Sitzung kein `bestand` und keine `rolle` schmuggeln, auch
   nicht versehentlich, auch nicht in einem späteren Umbau.

   Die Epoche ist der Rückruf: Sie steht im Account (accounts.mjs) und
   wächst bei jeder Passwortänderung. Eine Sitzung mit veralteter Epoche
   ist tot. Geprüft wird das NICHT hier, sondern eine Ebene höher
   (accountanmeldung.mjs) — diese Datei kennt keinen Account und liest
   keinen. Sie hätte sonst zwei Aufgaben und wäre die Stelle, an der
   Identität und Berechtigung wieder zusammenwachsen.

     Frist          12 Stunden
     Untätigkeit    30 Minuten
     Verlängerung   `zuletzt` höchstens einmal je Minute

   Dieselben Zahlen wie bei den Arbeitssitzungen, aber eigene Konstanten:
   Es sind zwei Entscheidungen über zwei Dinge. Wer die Dauer einer
   Arbeitssitzung ändert, soll damit nicht stillschweigend die Dauer einer
   Anmeldung ändern.

   ---------------------------------------------------------------------------
   Zum Merkmal selbst

   32 Zufallsbytes aus `randomBytes`, base64url — 43 Zeichen aus
   A–Z a–z 0–9 - _ , ohne Auffüllzeichen. Gespeichert wird ausschließlich
   der SHA-256-Wert als Schlüssel; der Klartext existiert genau einmal, im
   Rückgabewert von `accountSitzungAnlegen`. Wer die Ablage liest, findet
   kein Merkmal, mit dem er sich anmelden könnte.

   Dass das Alphabet keine Zeichen enthält, die in einem Cookie-Wert
   quotiert werden müssten (kein `;`, kein `,`, kein Leerzeichen, kein
   `=`), ist kein Zufall: Es ist die Voraussetzung dafür, dass dasselbe
   Merkmal später unverändert in ein HttpOnly-Cookie passt. Cookies setzt
   diese Datei nicht — sie kennt keine Anfrage und keine Antwort.
   ========================================================================== */

import { getStore } from "./ablage.mjs";
import { ablaufUrteil, verlaengernFaellig } from "./lebendigkeit.mjs";
import { createHash, randomBytes } from "node:crypto";

/** Der eigene Speicher. Getrennt von „centric-sitzungen", mit Absicht. */
export const accountSitzungsSpeicher = () =>
  getStore({ name: "centric-accountsitzungen", consistency: "strong" });

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Das Präfix. Zusammen mit dem eigenen Speicher die zweite Schranke
    gegen eine Verwechslung mit `t:` und `sk:`. */
const PRAEFIX = "as:";

/** Die Art, die jeder Datensatz selbst nennt. */
export const ART = "konto";

/** Zwölf Stunden — dieselbe Zahl wie bei einer Arbeitssitzung, eigene
    Entscheidung. Eine Anmeldung soll einen Arbeitstag tragen. */
export const DAUER = 1000 * 60 * 60 * 12;
/** Eine halbe Stunde Untätigkeit beendet die Sitzung. Auf einem geteilten
    Rechner ist das der Unterschied zwischen „abgemeldet" und „offen". */
export const RUHE = 30 * 60 * 1000;
/** Der Ablageschlüssel eines Merkmals. */
export const accountSitzungsSchluessel = (token) => PRAEFIX + hash(token);

/** Nur Zeichenketten in der Länge eines echten Merkmals kommen überhaupt
    in die Ablage — sonst wäre jeder Tippfehler ein Verzeichniszugriff. */
const merkmalBrauchbar = (token) =>
  typeof token === "string" && token.length >= 20 && token.length <= 200;

/**
 * Legt eine Account-Sitzung an und gibt das Merkmal zurück — die einzige
 * Stelle, an der es im Klartext existiert.
 *
 * Es gibt kein `felder`-Argument. Was im Datensatz steht, steht hier und
 * nirgends sonst; ein Aufrufer kann nichts hinzufügen.
 *
 * @param {{accountId?: string, epoche?: unknown}} o
 * @param {{jetzt?: () => number, ablage?: (object|null)}} [wahl]
 * @returns {Promise<{ok: true, token: string, gueltigBis: number}
 *   |{ok: false, grund: string}>}
 */
export async function accountSitzungAnlegen({ accountId, epoche } = {},
  { jetzt = Date.now, ablage = null } = {}) {
  if (!accountId || typeof accountId !== "string") return { ok: false, grund: "accountId" };
  const nr = Number(epoche);
  if (!Number.isInteger(nr) || nr < 1) return { ok: false, grund: "epoche" };

  const speicher = ablage || accountSitzungsSpeicher();
  const token = randomBytes(32).toString("base64url");
  const nun = jetzt();
  const gueltigBis = nun + DAUER;
  try {
    await speicher.setJSON(accountSitzungsSchluessel(token), {
      art: ART, accountId, epoche: nr, seit: nun, zuletzt: nun, bis: gueltigBis,
    });
  } catch {
    /* Ohne Datensatz gibt es keine Sitzung — und damit auch kein Merkmal.
       Der Grund bleibt innen: Nach außen ist das kein Anmeldefehler,
       sondern ein Fehler des Servers. */
    return { ok: false, grund: "speichern" };
  }
  return { ok: true, token, gueltigBis };
}

/**
 * Liest den Datensatz zu einem Merkmal — ohne den Account anzusehen.
 *
 * Geprüft wird, was diese Datei wissen kann: Art, absolute Frist,
 * Untätigkeit. Was die Sitzung darüber hinaus entwertet — eine neue
 * Epoche, eine Sperre, ein gelöschter Account — prüft die Ebene darüber.
 *
 * Eine tote Sitzung wird gelöscht, nicht bloß abgewiesen: Ein Merkmal,
 * dessen Datensatz noch da ist, ist ein Datensatz, den jemand später
 * wieder gültig machen könnte.
 *
 * @param {unknown} token
 * @param {{jetzt?: () => number, ablage?: (object|null)}} [wahl]
 * @returns {Promise<{sitzung: object|null, grund: string|null}>}
 */
export async function accountSitzungLesen(token,
  { jetzt = Date.now, ablage = null } = {}) {
  if (!merkmalBrauchbar(token)) return { sitzung: null, grund: "form" };
  const speicher = ablage || accountSitzungsSpeicher();
  const schluessel = accountSitzungsSchluessel(token);

  let s = null;
  try { s = await speicher.get(schluessel, { type: "json" }); }
  catch { return { sitzung: null, grund: "fehler" }; }
  if (!s) return { sitzung: null, grund: "unbekannt" };

  /* Der Datensatz muss sich selbst als Account-Sitzung ausweisen. Diese
     Prüfung ist nach der Trennung der Speicher nicht mehr nötig — und
     steht trotzdem hier: Sie kostet nichts und hält, wenn jemand die
     Speicher eines Tages zusammenlegt. */
  if (s.art !== ART || !s.accountId) {
    await weg(speicher, schluessel);
    return { sitzung: null, grund: "art" };
  }

  const nun = jetzt();
  /* Genau wie bei den Token (token.mjs) und den Arbeitssitzungen: Der
     Zeitpunkt `bis` gehört noch zur Gültigkeit, erst danach ist Schluss.
     Ein fehlender oder unsinniger Wert gilt als abgelaufen — ein
     Datensatz ohne Frist darf nicht ewig leben (strenge Lesart,
     lebendigkeit.mjs). */
  const urteil = ablaufUrteil(s, nun, { streng: true, ruhe: RUHE });
  if (urteil.grund === "frist") {
    await weg(speicher, schluessel);
    return { sitzung: null, grund: "abgelaufen" };
  }
  if (urteil.grund === "untaetig") {
    await weg(speicher, schluessel);
    return { sitzung: null, grund: "untaetig" };
  }

  /* Verlängern, aber nicht bei jedem Zugriff: Ein Mensch, der arbeitet,
     erzeugt sonst hunderte Schreibvorgänge je Stunde. Ohne await — die
     Anfrage soll nicht auf die Platte warten. */
  if (verlaengernFaellig(s, null, nun)) {
    speicher.setJSON(schluessel, { ...s, zuletzt: nun }).catch(() => {});
  }
  return { sitzung: s, grund: null };
}

/** Löschen, ohne dass ein Fehler dabei den Aufrufer stört. */
async function weg(speicher, schluessel) {
  try { await speicher.delete(schluessel); } catch { /* bleibt liegen, läuft ab */ }
}

/**
 * Beendet genau diese Sitzung. Ein unbekanntes Merkmal ist kein Fehler:
 * Abmelden soll immer gelingen — und ob es eine Sitzung gab, ist eine
 * Auskunft, die niemand bekommen muss.
 *
 * @param {unknown} token
 * @param {{ablage?: (object|null)}} [wahl]
 * @returns {Promise<boolean>}
 */
export async function accountSitzungBeenden(token, { ablage = null } = {}) {
  if (!merkmalBrauchbar(token)) return true;
  const speicher = ablage || accountSitzungsSpeicher();
  const schluessel = accountSitzungsSchluessel(token);
  try {
    await speicher.delete(schluessel);
    return true;
  } catch {
    /* Gescheitert — und trotzdem ist die Frage nicht, wer gelöscht hat,
       sondern ob die Sitzung noch existiert. Zwei gleichzeitige Abmeldungen
       desselben Merkmals greifen nach derselben Datei; eine gewinnt, die
       andere sieht einen Fehler, obwohl das Ziel erreicht ist. Deshalb
       nachsehen: Ist der Datensatz weg, ist die Sitzung beendet.

       Ist er noch da — oder lässt sich das nicht feststellen —, bleibt es
       bei „nicht gelungen". Diese Antwort darf niemand in ein
       „abgemeldet" umdeuten. */
    try { return !(await speicher.get(schluessel, { type: "json" })); }
    catch { return false; }
  }
}

/**
 * Beendet alle Sitzungen eines Accounts — der Weg für „überall abmelden"
 * und für eine Sperre, die sofort wirken soll.
 *
 * Der Datensatz entscheidet, nicht der Schlüssel: Gelöscht wird nur, was
 * diesen Account nennt. Ein Listenlauf über fremde Sitzungen ändert nichts
 * an ihnen.
 *
 * @param {string} accountId
 * @param {{ablage?: (object|null)}} [wahl]
 * @returns {Promise<{beendet: number, fehler: number}>}
 */
export async function accountSitzungenBeenden(accountId, { ablage = null } = {}) {
  if (!accountId || typeof accountId !== "string") return { beendet: 0, fehler: 0 };
  const speicher = ablage || accountSitzungsSpeicher();
  let beendet = 0, fehler = 0;
  let blobs = [];
  try { ({ blobs } = await speicher.list({ prefix: PRAEFIX })); }
  catch { return { beendet: 0, fehler: 1 }; }
  for (const b of blobs) {
    let s = null;
    try { s = await speicher.get(b.key, { type: "json" }); }
    catch { fehler++; continue; }
    if (!s || s.art !== ART || s.accountId !== accountId) continue;
    try { await speicher.delete(b.key); beendet++; }
    catch { fehler++; }
  }
  return { beendet, fehler };
}
