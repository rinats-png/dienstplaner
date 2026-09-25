/* ==========================================================================
   ACCOUNTS UND MITGLIEDSCHAFTEN

   Drei Begriffe, die auseinanderzuhalten sind — und deren Vermischung der
   teuerste Fehler wäre, den dieses Modul machen könnte:

     ACCOUNT        die Identität eines Menschen. Eine E-Mail, ein Passwort,
                    ein Verifizierungsstand. Kennt keinen Betrieb, keine
                    Rolle, keine Schicht.

     MITGLIEDSCHAFT die Berechtigung in genau EINEM betrieblichen Kontext.
                    Sie trägt die Rolle. Ein Account kann mehrere haben.

     PERSON         der fachliche Mitarbeiterdatensatz im Betrieb, mit
                    Qualifikationen, Arbeitszeit und Abwesenheiten. Liegt
                    im Bestand, nicht hier. Die Mitgliedschaft verweist
                    darauf mit einer Kennung, kopiert aber nichts.

   Daraus folgt die Regel, die dieses Modul durchsetzt: **Ein Account hat
   keine Rolle.** Wer „Leitung" ist, ist es in einem Raum — und im nächsten
   ist dieselbe Person Beschäftigte. Gäbe es `account.rolle`, wäre aus einer
   Leitungsrolle in Betrieb A irgendwann ein Recht in Betrieb B; genau das
   ist der Fehler, den die Rechtearchitektur an anderer Stelle schon einmal
   gekostet hat (siehe `wirksameRolle` in rechte.mjs).

   ---------------------------------------------------------------------------
   Was dieses Modul NICHT tut

   Es kennt keinen Endpunkt, keine Anfrage, keine Sitzung und keine Bremse.
   Es legt nichts an, was ein Aufrufer nicht ausdrücklich verlangt, und es
   entscheidet nicht, wer etwas darf — das gehört in die Ebene darüber,
   zusammen mit Bremse, Herkunftsprüfung und Protokoll.

   ---------------------------------------------------------------------------
   Speicherschlüssel

     account:<hash(emailNorm)>        der Datensatz. Quelle der Wahrheit.
     kontoId:<accountId>              Rückweg von der stabilen Kennung.
                                      Nur ein Zeiger, keine Kopie.
     mitglied:<accountId>:<raum>      die Mitgliedschaft. Quelle der Wahrheit.
     raummitglied:<raum>:<accountId>  Rückweg „wer gehört zu diesem Raum".
                                      Nur ein Zeiger, keine Kopie.

   Ein Schlüssel je Objekt, kein Sammelblob — dieselbe Überlegung wie in
   konten.mjs: Die Ablage kennt kein bedingtes Schreiben, also würden zwei
   gleichzeitige Schreibvorgänge auf einen Sammelblob einander überschreiben.

   Die Adresse steht nie im Klartext in einem Schlüssel. Gehasht wird mit
   dem Pfeffer aus der Umgebung (codes.mjs), nicht mit einem nackten
   SHA-256: Ein Verzeichnis voller ungesalzener Adress-Prüfsummen wäre mit
   einer Wortliste in Minuten aufgelöst — Adressen sind kein Geheimnis,
   aber die Liste, wer Kunde ist, ist eine Auskunft.
   ========================================================================== */

import { randomBytes } from "node:crypto";
import { mailNormieren, mailBrauchbar } from "./adressen.mjs";
import { neuHash, altHash } from "./codes.mjs";
import { RANG } from "./rollenvergabe.mjs";

/* --------------------------------------------------------------------------
   SCHLÜSSEL
   -------------------------------------------------------------------------- */

const ACCOUNT = "account:";
const KONTO_ID = "kontoId:";
const MITGLIED = "mitglied:";
const RAUMMITGLIED = "raummitglied:";

/** Der Schlüssel einer Adresse — mit Pfeffer, wo einer da ist. */
export const accountSchluessel = (email) => {
  const m = mailNormieren(email);
  return ACCOUNT + (neuHash(m) || altHash(m));
};

export const kontoIdSchluessel = (accountId) => KONTO_ID + String(accountId);
export const mitgliedSchluessel = (accountId, raum) =>
  `${MITGLIED}${accountId}:${raum}`;
export const raummitgliedSchluessel = (raum, accountId) =>
  `${RAUMMITGLIED}${raum}:${accountId}`;

/* --------------------------------------------------------------------------
   EINE REIHE JE SCHLÜSSEL

   Die Ablage kennt kein „anlegen, falls noch nicht vorhanden". Zwei
   gleichzeitige Registrierungen derselben Adresse lesen also beide „kein
   Account" und schreiben beide — der zweite überschreibt den ersten, und
   ein Mensch verliert sein Konto, ohne dass es auffällt.

   Innerhalb eines Prozesses ist JavaScript einfädig, und der Server läuft
   als genau ein Node-Prozess je Container. Eine Reihe je Schlüssel macht
   aus gleichzeitigen Versuchen aufeinanderfolgende: Der Zweite sieht, was
   der Erste angelegt hat, und wird abgewiesen. Dieselbe Antwort und
   dieselbe Grenze wie bei der Bremse (schutz.mjs) und beim Einlösen von
   Token (token.mjs).

   Serialisiert wird nur, was denselben Schlüssel betrifft — zwei
   verschiedene Adressen warten nicht aufeinander.

   Wer eines Tages mehrere Instanzen fährt, braucht dafür bedingtes
   Schreiben in der Ablage. Diese Reihe ist die Untergrenze, nicht das
   Ziel. (Die gleichlautende Hilfe steht auch in token.mjs; beide gehören
   zusammengelegt, sobald eine dritte Stelle sie braucht.)
   -------------------------------------------------------------------------- */
const reihe = new Map();

function nacheinander(schluessel, arbeit) {
  const davor = reihe.get(schluessel) || Promise.resolve();
  const lauf = davor.then(arbeit, arbeit);
  const warten = lauf.then(() => {}, () => {});
  reihe.set(schluessel, warten);
  warten.then(() => { if (reihe.get(schluessel) === warten) reihe.delete(schluessel); });
  return lauf;
}

/* --------------------------------------------------------------------------
   WERTE UND ZUSTÄNDE
   -------------------------------------------------------------------------- */

export const ACCOUNT_STATUS = ["eingeladen", "aktiv", "gesperrt"];
export const MITGLIED_STATUS = ["eingeladen", "aktiv", "entzogen"];
export const TOKEN_ZWECKE = ["einladung", "verifizierung", "zuruecksetzen"];

/**
 * Welche Rollen eine Mitgliedschaft tragen darf: die Rollen im Betrieb,
 * ohne den Betreiber. Die Liste kommt aus RANG (rollenvergabe.mjs) und
 * wird hier nicht zum zweiten Mal geschrieben — eine eigene Liste würde
 * beim nächsten Rollenumbau auseinanderlaufen.
 */
export const MITGLIED_ROLLEN = Object.keys(RANG).filter((r) => r !== "betreiber");

const jetztISO = () => new Date().toISOString();

/** Eine neue, stabile Kennung. 16 Zufallsbytes, kein Bezug zu Adresse,
    Person, Raum oder Name — sie soll einen Adresswechsel überleben. */
export const neueAccountId = () => `a_${randomBytes(16).toString("base64url")}`;

/* Ein Raumname wie in daten.mjs. Demoräume sind ausgeschlossen: Der
   Demozugang braucht keinen Account und darf keinen bekommen — eine
   Mitgliedschaft in `demo-*` wäre ein persönliches Konto in einem Raum,
   den jede Besucherin ohne Code öffnet. */
const RAUM_FORM = /^[a-z0-9][a-z0-9_-]{2,79}$/i;
const DEMO = /^demo-/i;

/** Ist das ein Raum, in dem eine Mitgliedschaft bestehen darf? */
export function raumErlaubt(raum) {
  if (typeof raum !== "string" || !RAUM_FORM.test(raum)) return false;
  return !DEMO.test(raum);
}

/** Ein Fehler, der nicht vom Aufrufer kommt, sondern von der Ablage. */
class AblageFehler extends Error {
  constructor(text, ursache) {
    super(text);
    this.name = "AblageFehler";
    this.ursache = ursache;
  }
}

/* --------------------------------------------------------------------------
   ACCOUNT ANLEGEN
   -------------------------------------------------------------------------- */

/**
 * Legt einen Account an. Gibt `{ ok: true, account }` zurück oder
 * `{ ok: false, grund }` — „grund" ist für das Protokoll, nicht für eine
 * Antwort nach außen: Ob eine Adresse belegt ist, darf ein Endpunkt nicht
 * verraten.
 *
 * Ohne Passwort und ohne Bestätigung ist der Account „eingeladen": Er
 * existiert, aber niemand kann sich damit anmelden. Das ist der Zustand,
 * in dem eine Einladung wartet.
 *
 * @param {object} store
 * @param {{email?: string, status?: string, passwort?: (string|null),
 *          emailVerifiziertAm?: (string|null)}} o
 * @returns {Promise<{ok: true, account: object}|{ok: false, grund: string}>}
 */
export async function accountAnlegen(store, { email, status = "eingeladen",
  passwort = null, emailVerifiziertAm = null } = {}) {
  const emailNorm = mailNormieren(email);
  if (!mailBrauchbar(emailNorm)) return { ok: false, grund: "adresse" };
  if (!ACCOUNT_STATUS.includes(status)) return { ok: false, grund: "status" };
  if (passwort !== null && (typeof passwort !== "string" || !passwort.startsWith("s1$")))
    return { ok: false, grund: "passwortform" };

  const schluessel = accountSchluessel(emailNorm);

  return nacheinander(schluessel, async () => {
    /* In der Reihe noch einmal nachsehen: Wer als Zweiter kommt, findet
       jetzt, was der Erste angelegt hat. */
    const vorhanden = await accountLesenPerMail(store, emailNorm);
    if (vorhanden) return { ok: false, grund: "belegt" };

    const nun = jetztISO();
    const account = {
      id: neueAccountId(),
      email: String(email).trim(),          // Anzeigeform, wie eingegeben
      emailNorm,
      emailVerifiziertAm: emailVerifiziertAm || null,
      passwort,
      status,
      tokenNr: { einladung: 0, verifizierung: 0, zuruecksetzen: 0 },
      epoche: 1,
      erstellt: nun,
      aktualisiert: nun,
      passwortGeaendert: passwort ? nun : null,
      letzteAnmeldung: null,
    };

    /* Zwei Schreibvorgänge, und die Ablage kennt keine Transaktion. Die
       Reihenfolge ist deshalb eine Entscheidung:

       Erst der Datensatz, dann der Zeiger. Bleibt der Zeiger aus, ist die
       Adresse belegt und der Account über sie auffindbar — ein zweiter
       Anlageversuch wird abgewiesen statt eine zweite Kennung zu erzeugen.
       Der Zeiger lässt sich aus dem Datensatz jederzeit nachbauen.

       Andersherum wäre der Schaden größer: Ein Zeiger ohne Datensatz
       zeigte nach dem nächsten Anlageversuch auf einen Account mit
       anderer Kennung — derselbe Zeiger, ein anderer Mensch.

       Scheitert der Zeiger, wird der Datensatz zurückgenommen und der
       Fehler geworfen. Scheitert auch die Rücknahme, sagt der Fehler
       beides: Stillschweigen wäre hier das Schlimmste. */
    try {
      await store.setJSON(schluessel, account);
    } catch (e) {
      throw new AblageFehler(`Account konnte nicht abgelegt werden: ${e && e.message}`, e);
    }
    try {
      await store.setJSON(kontoIdSchluessel(account.id), { schluessel });
    } catch (e) {
      let zurueck = "zurückgenommen";
      try { await store.delete(schluessel); }
      catch (e2) { zurueck = `NICHT zurückgenommen (${e2 && e2.message})`; }
      throw new AblageFehler(
        `Kennungszeiger konnte nicht abgelegt werden: ${e && e.message} — Account ${zurueck}`, e);
    }
    return { ok: true, account };
  });
}

/* --------------------------------------------------------------------------
   ACCOUNT LESEN
   -------------------------------------------------------------------------- */

/**
 * Account zu einer Adresse. Erst der geschlüsselte Schlüssel, dann der
 * ungeschlüsselte — dasselbe Muster wie bei den Zugangscodes, damit ein
 * nachträglich gesetzter Pfeffer keinen Bestand unerreichbar macht.
 * @returns {Promise<object|null>}
 */
export async function accountLesenPerMail(store, email) {
  const m = mailNormieren(email);
  if (!mailBrauchbar(m)) return null;
  const neu = neuHash(m);
  if (neu) {
    const a = await store.get(ACCOUNT + neu, { type: "json" }).catch(() => null);
    if (a) return a;
  }
  const a = await store.get(ACCOUNT + altHash(m), { type: "json" }).catch(() => null);
  return a || null;
}

/**
 * Account zu einer Kennung — über den Zeiger, nicht über eine Suche:
 * `list()` über alle Accounts wäre bei jedem Zugriff ein Verzeichnislauf.
 *
 * Der gelesene Datensatz muss die angefragte Kennung tragen. Ein
 * überholter Zeiger — etwa aus einem abgebrochenen Anlageversuch — führt
 * damit zu null statt zu einem fremden Account.
 * @returns {Promise<object|null>}
 */
export async function accountLesenPerId(store, accountId) {
  if (!accountId || typeof accountId !== "string") return null;
  const zeiger = await store.get(kontoIdSchluessel(accountId), { type: "json" })
    .catch(() => null);
  if (!zeiger || !zeiger.schluessel) return null;
  const a = await store.get(zeiger.schluessel, { type: "json" }).catch(() => null);
  if (!a || a.id !== accountId) return null;
  return a;
}

/* --------------------------------------------------------------------------
   ACCOUNT ÄNDERN

   Kein Durchreichen beliebiger Felder. Was sich ändern darf, steht hier —
   und `id`, `erstellt`, `email` und `emailNorm` stehen ausdrücklich nicht
   dabei: Eine Adressänderung verschiebt den Speicherschlüssel und ist
   damit ein eigener Vorgang mit eigener Bestätigung. Sie gehört nicht in
   diese Phase und soll hier auch nicht beiläufig möglich sein.
   -------------------------------------------------------------------------- */

const AENDERBAR = new Set(["emailVerifiziertAm", "passwort", "status",
  "tokenNr", "epoche", "passwortGeaendert", "letzteAnmeldung"]);

/**
 * Ändert einen Account feldweise. Unbekannte oder geschützte Felder führen
 * zur Absage, nicht zum stillen Überspringen — wer ein falsches Feld
 * schreibt, soll das erfahren.
 *
 * @param {object} store
 * @param {string} accountId
 * @param {object} felder
 * @returns {Promise<{ok: true, account: object}|{ok: false, grund: string}>}
 */
export async function accountAendern(store, accountId, felder) {
  if (!felder || typeof felder !== "object") return { ok: false, grund: "felder" };
  for (const k of Object.keys(felder))
    if (!AENDERBAR.has(k)) return { ok: false, grund: `feld:${k}` };
  if ("status" in felder && !ACCOUNT_STATUS.includes(felder.status))
    return { ok: false, grund: "status" };
  if ("passwort" in felder && felder.passwort !== null
      && (typeof felder.passwort !== "string" || !felder.passwort.startsWith("s1$")))
    return { ok: false, grund: "passwortform" };
  if ("epoche" in felder && (!Number.isInteger(felder.epoche) || felder.epoche < 1))
    return { ok: false, grund: "epoche" };
  if ("tokenNr" in felder) {
    const t = felder.tokenNr;
    if (!t || typeof t !== "object") return { ok: false, grund: "tokenNr" };
    for (const [z, n] of Object.entries(t)) {
      if (!TOKEN_ZWECKE.includes(z)) return { ok: false, grund: `tokenNr:${z}` };
      if (!Number.isInteger(n) || n < 0) return { ok: false, grund: `tokenNr:${z}` };
    }
  }

  const alt = await accountLesenPerId(store, accountId);
  if (!alt) return { ok: false, grund: "unbekannt" };

  /* In der Reihe des Accounts: Zwei gleichzeitige Änderungen desselben
     Accounts würden sonst einander überschreiben. */
  return nacheinander(accountSchluessel(alt.emailNorm), async () => {
    const stand = await accountLesenPerId(store, accountId);
    if (!stand) return { ok: false, grund: "unbekannt" };
    const neu = { ...stand, ...felder, aktualisiert: jetztISO() };
    /* Die Unveränderlichen bleiben, was sie sind — auch wenn jemand sie
       über den Umweg eines gleichnamigen Feldes doch mitgeschickt hätte. */
    neu.id = stand.id;
    neu.erstellt = stand.erstellt;
    neu.email = stand.email;
    neu.emailNorm = stand.emailNorm;
    try {
      await store.setJSON(accountSchluessel(stand.emailNorm), neu);
    } catch (e) {
      throw new AblageFehler(`Account konnte nicht geändert werden: ${e && e.message}`, e);
    }
    return { ok: true, account: neu };
  });
}

/** Passwort setzen: Prüfwert ablegen, Zeitpunkt vermerken, Sitzungen der
    anderen Geräte durch eine neue Epoche entwerten. */
export async function passwortSetzen(store, accountId, prueftext) {
  const a = await accountLesenPerId(store, accountId);
  if (!a) return { ok: false, grund: "unbekannt" };
  return accountAendern(store, accountId, {
    passwort: prueftext,
    passwortGeaendert: jetztISO(),
    epoche: (Number(a.epoche) || 1) + 1,
    ...(a.status === "eingeladen" ? { status: "aktiv" } : {}),
  });
}

/** Die Adresse ist als erreichbar bestätigt. */
export async function emailBestaetigen(store, accountId) {
  const a = await accountLesenPerId(store, accountId);
  if (!a) return { ok: false, grund: "unbekannt" };
  if (a.emailVerifiziertAm) return { ok: true, account: a };
  return accountAendern(store, accountId, { emailVerifiziertAm: jetztISO() });
}

/** Alle Sitzungen entwerten, ohne das Passwort anzufassen. */
export async function epocheErhoehen(store, accountId) {
  const a = await accountLesenPerId(store, accountId);
  if (!a) return { ok: false, grund: "unbekannt" };
  return accountAendern(store, accountId, { epoche: (Number(a.epoche) || 1) + 1 });
}

/**
 * Die nächste Laufnummer eines Token-Zwecks. Sie entwertet alle früheren
 * Token dieses Zwecks (token.mjs) — und nur dieses Zwecks: Eine neue
 * Einladung darf keinen laufenden Rücksetzvorgang abschneiden.
 * @returns {Promise<{ok: boolean, account?: object, nr?: number, grund?: string}>}
 */
export async function tokenNrErhoehen(store, accountId, zweck) {
  if (!TOKEN_ZWECKE.includes(zweck)) return { ok: false, grund: "zweck" };
  const a = await accountLesenPerId(store, accountId);
  if (!a) return { ok: false, grund: "unbekannt" };
  const nr = (Number((a.tokenNr || {})[zweck]) || 0) + 1;
  const e = await accountAendern(store, accountId,
    { tokenNr: { ...(a.tokenNr || {}), [zweck]: nr } });
  return e.ok ? { ...e, nr } : e;
}

/** Zugang sperren. Der Datensatz bleibt — ein gesperrter Account ist ein
    Beleg, kein leerer Platz. */
export const accountSperren = (store, accountId) =>
  accountAendern(store, accountId, { status: "gesperrt" });

/** Zeitpunkt der letzten Anmeldung. */
export const anmeldungVermerken = (store, accountId) =>
  accountAendern(store, accountId, { letzteAnmeldung: jetztISO() });

/* --------------------------------------------------------------------------
   MITGLIEDSCHAFTEN
   -------------------------------------------------------------------------- */

/**
 * Legt eine Mitgliedschaft an: dieser Account, dieser Raum, diese Rolle.
 *
 * `betrieb` ist der Index in `kern.mandanten[]`, mit dem die
 * Rechteprüfung arbeitet (eigenerMandant in rechte.mjs); `mandantId` ist
 * die Kennung, mit der die Monatsscherben benannt werden (scherben.mjs).
 * Beides wird gespeichert, weil beides gebraucht wird und weil die
 * Rechtearchitektur in dieser Phase ausdrücklich nicht umgebaut wird.
 *
 * Ob der Index im Raum wirklich auf diesen Mandanten zeigt, prüft dieses
 * Modul NICHT — dafür müsste es den Bestand laden und wäre an bestand.mjs
 * und die Ablagestruktur des Raums gekoppelt. Diese Konsistenzprüfung
 * gehört in die Ebene, die eine Einladung ausspricht: Dort liegt der
 * Bestand ohnehin vor, weil die Person daraus gewählt wird.
 *
 * @param {object} store
 * @param {{accountId?: string, raum?: string, betrieb?: number,
 *          mandantId?: string, person?: (string|null), rolle?: string,
 *          einheit?: (string|null), status?: string,
 *          eingeladenVon?: (string|null)}} o
 * @returns {Promise<{ok: true, mitgliedschaft: object}|{ok: false, grund: string}>}
 */
export async function mitgliedschaftAnlegen(store, { accountId, raum, betrieb = 0,
  mandantId, person = null, rolle, einheit = null, status = "eingeladen",
  eingeladenVon = null } = {}) {
  if (!accountId || typeof accountId !== "string") return { ok: false, grund: "accountId" };
  if (!raumErlaubt(raum))
    return { ok: false, grund: DEMO.test(String(raum)) ? "demoraum" : "raum" };
  if (!Number.isInteger(betrieb) || betrieb < 0) return { ok: false, grund: "betrieb" };
  if (typeof mandantId !== "string" || !mandantId.trim() || mandantId.length > 80)
    return { ok: false, grund: "mandantId" };
  if (!MITGLIED_ROLLEN.includes(rolle)) return { ok: false, grund: "rolle" };
  if (!MITGLIED_STATUS.includes(status) || status === "entzogen")
    return { ok: false, grund: "status" };
  if (person !== null && (typeof person !== "string" || !person.trim()))
    return { ok: false, grund: "person" };

  const konto = await accountLesenPerId(store, accountId);
  if (!konto) return { ok: false, grund: "unbekannterAccount" };

  const schluessel = mitgliedSchluessel(accountId, raum);

  return nacheinander(schluessel, async () => {
    const vorhanden = await store.get(schluessel, { type: "json" }).catch(() => null);
    /* Auch eine entzogene Mitgliedschaft steht im Weg: Sie ist der Beleg,
       dass es sie gab. Eine Wiederaufnahme ist ein eigener Vorgang — sie
       soll den Grabstein nicht stillschweigend überschreiben. */
    if (vorhanden) return { ok: false, grund: "vorhanden" };

    const nun = jetztISO();
    const mitgliedschaft = {
      accountId, raum, betrieb, mandantId: mandantId.trim(),
      person, rolle, einheit,
      status,
      eingeladenVon: eingeladenVon || null,
      eingeladenAm: nun,
      aktiviertAm: status === "aktiv" ? nun : null,
      entzogenAm: null,
    };

    /* Wie beim Account: erst die Wahrheit, dann der Zeiger. Bleibt der
       Zeiger aus, fehlt der Raumliste ein Eintrag — die Mitgliedschaft
       selbst ist aber vollständig und über Account und Raum auffindbar.
       Umgekehrt zeigte ein Zeiger auf nichts. */
    try {
      await store.setJSON(schluessel, mitgliedschaft);
    } catch (e) {
      throw new AblageFehler(
        `Mitgliedschaft konnte nicht abgelegt werden: ${e && e.message}`, e);
    }
    try {
      await store.setJSON(raummitgliedSchluessel(raum, accountId), { accountId, raum });
    } catch (e) {
      let zurueck = "zurückgenommen";
      try { await store.delete(schluessel); }
      catch (e2) { zurueck = `NICHT zurückgenommen (${e2 && e2.message})`; }
      throw new AblageFehler(
        `Raumzeiger konnte nicht abgelegt werden: ${e && e.message} — Mitgliedschaft ${zurueck}`, e);
    }
    return { ok: true, mitgliedschaft };
  });
}

/**
 * Genau diese Mitgliedschaft — oder null.
 *
 * Kein Rückfall auf „die erste", kein „wenn es nur einen Raum gibt, dann
 * eben den". Wer nach Raum Y fragt und nur in Raum X Mitglied ist,
 * bekommt nichts. Jede Bequemlichkeit an dieser Stelle wäre ein Weg von
 * einem Betrieb in einen anderen.
 * @returns {Promise<object|null>}
 */
export async function mitgliedschaftLesen(store, accountId, raum) {
  if (!accountId || typeof accountId !== "string") return null;
  if (typeof raum !== "string" || !raum) return null;
  const m = await store.get(mitgliedSchluessel(accountId, raum), { type: "json" })
    .catch(() => null);
  if (!m) return null;
  /* Der Datensatz muss zu der Frage passen, die gestellt wurde. */
  if (m.accountId !== accountId || m.raum !== raum) return null;
  return m;
}

/**
 * Alle Mitgliedschaften eines Accounts. Diese Liste beantwortet die Frage
 * „welche Arbeitsbereiche habe ich" — und sie darf niemals einem Betrieb
 * gezeigt werden: Dass jemand noch woanders arbeitet, ist seine Sache.
 * @param {object} store
 * @param {string} accountId
 * @param {{nurAktive?: boolean}} [wahl]
 * @returns {Promise<object[]>}
 */
export async function mitgliedschaftenDesAccounts(store, accountId, wahl = {}) {
  const { nurAktive = false } = wahl;
  if (!accountId || typeof accountId !== "string") return [];
  const aus = [];
  try {
    const { blobs } = await store.list({ prefix: `${MITGLIED}${accountId}:` });
    for (const b of blobs) {
      const m = await store.get(b.key, { type: "json" }).catch(() => null);
      if (!m || m.accountId !== accountId) continue;
      if (nurAktive && m.status !== "aktiv") continue;
      aus.push(m);
    }
  } catch { /* keine Mitgliedschaften */ }
  return aus.sort((a, b) => String(a.raum).localeCompare(String(b.raum)));
}

/**
 * Alle Mitgliedschaften eines Raums. Der Raumzeiger ist nur der Wegweiser;
 * gelesen wird jede Mitgliedschaft selbst. Ein Zeiger ohne Mitgliedschaft
 * wird übersprungen — der Index darf keine zweite Wahrheit erzählen.
 * @param {object} store
 * @param {string} raum
 * @param {{nurAktive?: boolean}} [wahl]
 * @returns {Promise<object[]>}
 */
export async function mitgliedschaftenDesRaums(store, raum, wahl = {}) {
  const { nurAktive = false } = wahl;
  if (typeof raum !== "string" || !raum) return [];
  const aus = [];
  try {
    const { blobs } = await store.list({ prefix: `${RAUMMITGLIED}${raum}:` });
    for (const b of blobs) {
      const accountId = b.key.slice(`${RAUMMITGLIED}${raum}:`.length);
      const m = await mitgliedschaftLesen(store, accountId, raum);
      if (!m) continue;
      if (nurAktive && m.status !== "aktiv") continue;
      aus.push(m);
    }
  } catch { /* keine Mitgliedschaften */ }
  return aus.sort((a, b) => String(a.accountId).localeCompare(String(b.accountId)));
}

/* --------------------------------------------------------------------------
   ZUSTÄNDE EINER MITGLIEDSCHAFT

   Drei Zustände, drei erlaubte Wege — und keine Sprünge daneben. „entzogen"
   ist eine Endstation und bleibt als Grabstein liegen: Das Protokoll soll
   beantworten können, wer wann Zugang hatte, eine Sitzungsprüfung soll den
   Entzug sehen, und eine späte Wiederaufnahme soll ein eigener Vorgang
   sein und kein stilles Überschreiben.
   -------------------------------------------------------------------------- */

const UEBERGAENGE = {
  eingeladen: ["aktiv", "entzogen"],
  aktiv: ["entzogen"],
  entzogen: [],
};

async function statusSetzen(store, accountId, raum, ziel, zusatz) {
  const schluessel = mitgliedSchluessel(accountId, raum);
  return nacheinander(schluessel, async () => {
    const m = await mitgliedschaftLesen(store, accountId, raum);
    if (!m) return { ok: false, grund: "unbekannt" };
    if (m.status === ziel) return { ok: true, mitgliedschaft: m, unveraendert: true };
    if (!(UEBERGAENGE[m.status] || []).includes(ziel))
      return { ok: false, grund: `uebergang:${m.status}->${ziel}` };
    const neu = { ...m, status: ziel, ...zusatz };
    try {
      await store.setJSON(schluessel, neu);
    } catch (e) {
      throw new AblageFehler(
        `Zustand konnte nicht geschrieben werden: ${e && e.message}`, e);
    }
    return { ok: true, mitgliedschaft: neu };
  });
}

/** Eingeladen → aktiv. Der Zeitpunkt bleibt am Datensatz. */
export const mitgliedschaftAktivieren = (store, accountId, raum) =>
  statusSetzen(store, accountId, raum, "aktiv", { aktiviertAm: jetztISO() });

/** Eingeladen oder aktiv → entzogen. Der Datensatz bleibt. */
export const mitgliedschaftEntziehen = (store, accountId, raum) =>
  statusSetzen(store, accountId, raum, "entzogen", { entzogenAm: jetztISO() });
