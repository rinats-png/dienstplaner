/* ==========================================================================
   ZWEI-FAKTOR FÜR BETREIBERZUGÄNGE (WP-32)

   Ein Verwalterschlüssel öffnet /einrichten: Er legt Betreibercodes an,
   sperrt Zugänge und bindet Codes an Betriebe. Wer ihn abgreift — aus einem
   Shell-Verlauf, einer Skriptdatei, einem geteilten Bildschirm —, hat damit
   den ganzen Dienst. Ein zweiter Faktor macht aus dem abgegriffenen
   Schlüssel allein noch keinen Zugang.

   Verfahren: TOTP nach RFC 6238 — HMAC-SHA-1, 30 Sekunden je Schritt,
   sechs Stellen. Das versteht jede Authenticator-App. Angenommen wird der
   laufende Schritt und je einer davor und danach (±1), damit eine leicht
   falsch gehende Uhr nicht aussperrt.

   Ein Code gilt genau einmal. Gespeichert wird der zuletzt angenommene
   Schritt; angenommen wird danach nur ein späterer. Wer einen Code
   mitliest — über die Schulter, aus einem Protokoll —, kann ihn nicht
   noch einmal verwenden, auch nicht innerhalb seiner 90 Sekunden.

   Das Geheimnis liegt verschlüsselt in der Ablage (AES-256-GCM, Schlüssel
   aus CENTRIC_PFEFFER abgeleitet). Eine Sicherung der Ablage allein reicht
   damit nicht, um Codes zu erzeugen. Ohne Pfeffer lässt sich der zweite
   Faktor nicht einrichten — und ein eingerichteter nicht prüfen: Dann gilt
   die Prüfung als gescheitert, nicht als bestanden.

   Das Geheimnis verlässt den Server genau einmal: in der Antwort auf das
   Einrichten, als Base32 und als otpauth-Adresse. Danach erscheint es in
   keiner Antwort, keinem Protokoll, keiner Liste.

   Wiederherstellungscodes (Fassung 2, WR-1): zehn Stück, beim Bestätigen
   oder Neugenerieren einmal angezeigt, Form SSSS-VVVV-VVVV-VVVV aus einem
   32er-Alphabet, gezogen in 5-Bit-Gruppen ohne Modulo-Verzerrung.
   Gespeichert nur als scrypt über ein HMAC mit einem aus dem Pfeffer
   abgeleiteten Schlüssel, je Code eigenes Salz, gebunden an id und
   Generation. Jeder gilt einmal. Altformat (Fassung 1, HMAC ohne Salz)
   bleibt bis zur Neugenerierung lesbar und wird als „neu nötig“ gemeldet.

   Nachweis: Skripte rufen /einrichten mehrmals hintereinander auf, und ein
   Code gilt nur einmal. Deshalb lässt sich mit einem Code ein Nachweis
   holen — 256 Bit, 15 Minuten gültig, an genau diesen Schlüssel gebunden,
   gespeichert nur als Prüfsumme. Abschalten verlangt immer einen frischen
   Code, nie einen Nachweis.
   ========================================================================== */

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync,
  randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { vorgang } from "./schreibhalt.mjs";
import { ENTWICKLUNGSUMGEBUNGEN } from "./umgebung.mjs";

export const SCHRITT = 30;
export const STELLEN = 6;
export const FENSTER = 1;
export const NACHWEIS_DAUER = 15 * 60;
export const WIEDERHERSTELLUNG_ANZAHL = 10;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 nach RFC 4648, ohne Auffüllzeichen — so erwarten es die Apps. */
export function base32Kodieren(puffer) {
  let bits = 0, wert = 0, aus = "";
  for (const b of puffer) {
    wert = (wert << 8) | b; bits += 8;
    while (bits >= 5) { aus += B32[(wert >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) aus += B32[(wert << (5 - bits)) & 31];
  return aus;
}

/** @returns {Buffer} */
export function base32Dekodieren(text) {
  const rein = String(text || "").toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, wert = 0;
  const aus = [];
  for (const z of rein) {
    const i = B32.indexOf(z);
    if (i < 0) throw new Error("kein Base32");
    wert = (wert << 5) | i; bits += 5;
    if (bits >= 8) { aus.push((wert >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(aus);
}

/**
 * HOTP nach RFC 4226 — der Baustein, aus dem TOTP den Zähler macht.
 * @param {Buffer} geheimnis
 * @param {number} zaehler
 * @param {{stellen?: number, verfahren?: string}} [o]
 */
export function hotp(geheimnis, zaehler, { stellen = STELLEN, verfahren = "sha1" } = {}) {
  const z = Buffer.alloc(8);
  z.writeBigUInt64BE(BigInt(zaehler));
  const h = createHmac(verfahren, geheimnis).update(z).digest();
  const o = h[h.length - 1] & 15;
  const zahl = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(zahl % 10 ** stellen).padStart(stellen, "0");
}

/** Der Zeitschritt zu einem Zeitpunkt (Millisekunden). */
export const schrittZu = (ms) => Math.floor(ms / 1000 / SCHRITT);

/**
 * TOTP nach RFC 6238.
 * @param {Buffer} geheimnis
 * @param {number} ms  Zeitpunkt in Millisekunden
 * @param {{stellen?: number, verfahren?: string}} [o]
 */
export const totp = (geheimnis, ms, o) => hotp(geheimnis, schrittZu(ms), o);

/** Zeitkonstanter Vergleich zweier Zeichenketten gleicher Länge. */
function gleich(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * Prüft einen Code gegen das Geheimnis: laufender Schritt ±FENSTER, und nur
 * Schritte NACH dem zuletzt angenommenen. Alle Kandidaten werden geprüft,
 * nicht beim ersten Treffer abgebrochen — die Laufzeit verrät nichts.
 *
 * @param {Buffer} geheimnis
 * @param {string} code
 * @param {number} ms
 * @param {number} [letzterSchritt]  -1 = noch keiner
 * @returns {{ok: boolean, schritt?: number, wiederholt?: boolean}}
 */
export function codePruefen(geheimnis, code, ms, letzterSchritt = -1) {
  const c = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return { ok: false };
  const jetzt = schrittZu(ms);
  let treffer = -1;
  for (let d = -FENSTER; d <= FENSTER; d++) {
    const s = jetzt + d;
    if (s < 0) continue;
    if (gleich(hotp(geheimnis, s), c) && treffer < 0) treffer = s;
  }
  if (treffer < 0) return { ok: false };
  if (treffer <= letzterSchritt) return { ok: false, wiederholt: true };
  return { ok: true, schritt: treffer };
}

/** otpauth-Adresse für die App — Aussteller und Konto lesbar, Geheimnis Base32. */
export function otpauthAdresse(geheimnisB32, konto, aussteller = "CENTRIC") {
  const etikett = encodeURIComponent(`${aussteller}:${konto}`);
  const q = new URLSearchParams({ secret: geheimnisB32, issuer: aussteller,
    algorithm: "SHA1", digits: String(STELLEN), period: String(SCHRITT) });
  return `otpauth://totp/${etikett}?${q.toString()}`;
}

/* --------------------------------------------------------------------------
   Verschlüsselung in der Ablage
   -------------------------------------------------------------------------- */

/** @returns {Buffer|null} */
function schluesselAusPfeffer() {
  const p = process.env.CENTRIC_PFEFFER;
  if (!p) return null;
  return Buffer.from(hkdfSync("sha256", Buffer.from(p), Buffer.from("centric-zweifaktor"),
    Buffer.from("totp-geheimnis-v1"), 32));
}

export const zweifaktorMoeglich = () => !!process.env.CENTRIC_PFEFFER;

/* Fassung 2 bindet die Kapsel an ihre id (GCM mit AAD = id): Eine Kapsel,
   die jemand mit Schreibzugriff auf die Ablage unter eine andere id
   kopiert, entschlüsselt dort nicht. Fassung 1 (ohne AAD) wird noch
   gelesen und beim nächsten Schreiben des Eintrags als Fassung 2 abgelegt
   (zweifaktorPruefen, zweifaktorBestaetigen). */

/**
 * @param {Buffer} klar
 * @param {string} id
 */
export function verschluesseln(klar, id) {
  const s = schluesselAusPfeffer();
  if (!s) throw new Error("CENTRIC_PFEFFER fehlt");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", s, iv);
  c.setAAD(Buffer.from(`zweifaktor:${id}`));
  const daten = Buffer.concat([c.update(klar), c.final()]);
  return { v: 2, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"),
    daten: daten.toString("base64") };
}

/**
 * @param {any} kapsel
 * @param {string} id
 * @returns {Buffer|null}  null = nicht entschlüsselbar (Pfeffer fehlt oder anders, falsche id)
 */
export function entschluesseln(kapsel, id) {
  const s = schluesselAusPfeffer();
  if (!s || !kapsel || (kapsel.v !== 1 && kapsel.v !== 2)) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", s, Buffer.from(kapsel.iv, "base64"));
    if (kapsel.v === 2) d.setAAD(Buffer.from(`zweifaktor:${id}`));
    d.setAuthTag(Buffer.from(kapsel.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(kapsel.daten, "base64")), d.final()]);
  } catch { return null; }
}

/** Kapsel der Fassung 1 beim Schreiben auf Fassung 2 heben. */
const kapselNeu = (kapsel, roh, id) => (kapsel && kapsel.v === 2 ? kapsel : verschluesseln(roh, id));

/* --------------------------------------------------------------------------
   Wiederherstellungscodes und Nachweis
   -------------------------------------------------------------------------- */

/* Fassung 1 (Altformat, nur noch lesen): HMAC mit dem rohen Pfeffer, ohne
   Salz, ohne Bindung. Wird nicht mehr geschrieben. */
const normieren = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** HMAC mit dem Pfeffer — ohne Pfeffer kein Wert, also auch kein Treffer. */
function codeHashV1(code) {
  const p = process.env.CENTRIC_PFEFFER;
  if (!p) return null;
  return createHmac("sha256", p).update(`wiederherstellung:${normieren(code)}`).digest("hex");
}

/* Fassung 2.
   Alphabet: 32 Zeichen ohne Verwechsler 0/O und 1/I. 32 teilt 256, und
   jedes Zeichen entsteht aus genau 5 Zufallsbits — jede der 2^80
   Byte-Folgen ergibt genau einen Code (Bijektion), also ist jedes Zeichen
   gleichverteilt. Kein `% länge`. */
export const WIEDERHERSTELLUNG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const WH_MUSTER = new RegExp(`^[${WIEDERHERSTELLUNG_ALPHABET}]{16}$`);
/** scrypt-Kennwerte wie lib/passwoerter.mjs (rund 32 MB je Rechnung). */
const WH_KDF = Object.freeze({ N: 32768, r: 8, p: 1 });
const WH_LAENGE = 32;
/** Für unbekannte Selektoren: gleiche Arbeit, kein Treffer möglich. */
const WH_SCHEIN_SALZ = Buffer.alloc(16, 0);

/**
 * 10 Zufallsbyte (80 bit) → 16 Zeichen in 5-Bit-Gruppen, angezeigt als
 * SSSS-VVVV-VVVV-VVVV. Umkehrbar, ohne Verzerrung.
 * @param {Uint8Array} bytes
 */
export function wiederherstellungCodeAusBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 10) throw new Error("genau 10 Byte erwartet");
  let bits = 0, wert = 0, roh = "";
  for (const b of bytes) {
    wert = ((wert << 8) | b) & 0xfff; bits += 8;
    while (bits >= 5) { roh += WIEDERHERSTELLUNG_ALPHABET[(wert >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return `${roh.slice(0, 4)}-${roh.slice(4, 8)}-${roh.slice(8, 12)}-${roh.slice(12, 16)}`;
}

/** Ein neuer Code aus dem kryptografischen Zufall. */
export const wiederherstellungCodeNeu = () => wiederherstellungCodeAusBytes(randomBytes(10));

/**
 * Selektor (4 Zeichen, kein Geheimnis) und Prüfteil (12 Zeichen, 60 bit).
 * Groß/klein, Leerzeichen und Bindestriche egal; andere Zeichen: null.
 * @returns {{sel: string, pruef: string}|null}
 */
export function wiederherstellungZerlegen(code) {
  const s = String(code ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (!WH_MUSTER.test(s)) return null;
  return { sel: s.slice(0, 4), pruef: s.slice(4) };
}

/** Eigener Schlüssel aus dem Pfeffer (HKDF), getrennt vom TOTP-Schlüssel. */
function whSchluessel() {
  const p = process.env.CENTRIC_PFEFFER;
  if (!p) return null;
  return Buffer.from(hkdfSync("sha256", Buffer.from(p), Buffer.from("centric-zweifaktor"),
    Buffer.from("wiederherstellung-v2"), 32));
}

/** HMAC-Vorstufe, gebunden an id, Einrichtung, Codegeneration und Selektor. */
const whVor = (k, id, bindung, generation, sel, pruef) =>
  createHmac("sha256", k).update(`w2|${id}|${bindung}|${generation}|${sel}|${pruef}`).digest();

/** @returns {Promise<Buffer>} */
const whScrypt = (vor, salz) => new Promise((gut, schlecht) => {
  scrypt(vor, salz, WH_LAENGE, { N: WH_KDF.N, r: WH_KDF.r, p: WH_KDF.p, maxmem: 128 * WH_KDF.N * WH_KDF.r * 2 },
    (f, w) => (f ? schlecht(f) : gut(w)));
});

const kdfGleich = (k) => !!k && k.N === WH_KDF.N && k.r === WH_KDF.r && k.p === WH_KDF.p;

/**
 * Zehn neue Codes und ihre Prüfeinträge. Ohne Pfeffer: Fehler.
 * @param {string} id
 * @param {number} generation  Codegeneration (steigt bei jeder Neugenerierung)
 * @param {string} [bindung]   Einrichtungsgeneration des Faktors
 * @returns {Promise<{klar: string[], eintraege: {sel: string, salz: string, wert: string, verbraucht: null}[]}>}
 */
export async function wiederherstellungErzeugen(id, generation, bindung = "", n = WIEDERHERSTELLUNG_ANZAHL) {
  const k = whSchluessel();
  if (!k) throw new Error("CENTRIC_PFEFFER fehlt");
  const klar = [], sels = new Set();
  while (klar.length < n) {
    const c = wiederherstellungCodeNeu();
    const z = /** @type {{sel: string, pruef: string}} */ (wiederherstellungZerlegen(c));
    if (sels.has(z.sel)) continue; /* Selektor je Träger eindeutig */
    sels.add(z.sel); klar.push(c);
  }
  const eintraege = await Promise.all(klar.map(async (c) => {
    const z = /** @type {{sel: string, pruef: string}} */ (wiederherstellungZerlegen(c));
    const salz = randomBytes(16);
    const wert = await whScrypt(whVor(k, id, bindung, generation, z.sel, z.pruef), salz);
    return { sel: z.sel, salz: salz.toString("base64"), wert: wert.toString("base64"), verbraucht: null };
  }));
  return { klar, eintraege };
}

/* WR-2: Schlüsselepoche gegen zurückgespielte Sicherungsstände.
   Ein verbrauchter Wiederherstellungscode lebt wieder auf, wenn jemand eine
   ältere Fassung der Ablage zurückspielt — der Verbrauch steht nur in der
   Ablage. Deshalb trägt jeder Satz Codes die Schlüsselepoche, in der er
   entstand (schluesselepoche.mjs: liegt AUSSERHALB der gesicherten Ablage
   und wechselt nach jeder erkannten Wiederherstellung). Eingelöst wird ein
   Code nur in derselben Epoche; danach gilt keiner der alten Codes mehr, und
   der Inhaber erzeugt mit Passwort/Zugang und Code aus der App neue.
   Gebunden wird überall außer in NODE_ENV=development/test (dort nur, wenn
   eine Prüfung eine Quelle setzt). Lässt sich die Epoche nicht feststellen:
   kein Einlösen, kein Erzeugen (fail-closed). TOTP hängt nicht daran. */
/** @type {(() => Promise<string>)|null|undefined} */
let epochenQuelle;
const vorgabeEpochenQuelle = async () =>
  (await (await import("./schluesselepoche.mjs")).schluesselEpoche()).epoche;

/**
 * Quelle der Schlüsselepoche setzen (Prüfungen). `undefined` stellt die Vorgabe wieder her, `null` schaltet die
 * Bindung ab (nur sinnvoll in Prüfungen; die Vorgabe bindet außerhalb von Entwicklung und Prüfung immer).
 * @param {(() => Promise<string>)|null|undefined} fn
 */
export function wiederherstellungEpocheQuelle(fn) { epochenQuelle = fn; }

/** @returns {Promise<{gebunden: false}|{gebunden: true, epoche: string|null}>} */
function whEpoche() {
  return faktorEpoche();
}

/**
 * Die Schlüsselepoche, an die Wiederherstellungscodes und Verlustfälle (WR-3, kontowiederherstellung.mjs) gebunden
 * werden — dieselbe Quelle für beide, damit eine zurückgespielte Ablage weder einen verbrauchten Code noch einen
 * abgelaufenen oder eingelösten Fall wiederbelebt. `epoche: null` heißt: gebunden, aber nicht feststellbar (fail-closed).
 * @returns {Promise<{gebunden: false}|{gebunden: true, epoche: string|null}>}
 */
export async function faktorEpoche() {
  const umgebung = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const q = epochenQuelle === undefined
    ? (ENTWICKLUNGSUMGEBUNGEN.includes(umgebung) ? null : vorgabeEpochenQuelle) : epochenQuelle;
  if (!q) return { gebunden: false };
  try {
    const e = await q();
    if (typeof e === "string" && e) return { gebunden: true, epoche: e };
  } catch { /* unten: nicht feststellbar */ }
  return { gebunden: true, epoche: null };
}

/** Der Ablageteil `wiederherstellung` in Fassung 2. */
const whStruktur = (w, generation, ms, ep = /** @type {any} */ ({ gebunden: false })) => ({ v: 2, generation,
  erzeugt: new Date(ms).toISOString(), kdf: { ...WH_KDF }, verbrauchtZahl: 0, eintraege: w.eintraege,
  ...(ep.gebunden ? { epoche: ep.epoche } : {}) });

const istV2 = (w) => !!w && !Array.isArray(w) && w.v === 2;

const nachweisHash = (t) => createHash("sha256").update(`nachweis:${t}`).digest("hex");

/* --------------------------------------------------------------------------
   Ablage

   Ein Eintrag je Schlüssel unter `zweifaktor:<id>`. Die id ist die volle
   Prüfsumme des Verwalterschlüssels — auch für den Ursprungsschlüssel aus
   CENTRIC_ADMIN. Wird der gewechselt, beginnt sein zweiter Faktor neu; das
   ist zugleich der Rückweg, wenn jemand Gerät und Wiederherstellungscodes
   verliert: Wer die .env auf dem Server ändern kann, hat ohnehin alles.
   -------------------------------------------------------------------------- */

const SCHLUESSEL = (id) => `zweifaktor:${id}`;
const NACHWEIS = (h) => `zweifaktor-nachweis:${h}`;

/* Prüfen und Fortschreiben unter einer Sperre je Schlüssel. Der Dienst
   läuft als ein Prozess je Container (deploy/compose.yml) — zwei
   gleichzeitige Anfragen mit demselben Code dürfen nicht beide den alten
   Stand lesen und beide durchkommen.

   Grenze (H1): Die Sperre wirkt nur im Prozess. Dass es genau einen gibt,
   sichert die Prozesssperre der Ablage (lib/prozesssperre.mjs,
   ablageBelegen): Ein zweiter Prozess auf demselben /data startet nicht.
   Wer je mehrere Instanzen auf getrennten Ablagen betreibt, braucht hier
   ein atomares Vergleichen-und-Setzen der Ablage. */
/** @type {Map<string, Promise<any>>} */
const sperren = new Map();
/* Schreib-Halt (schreibhalt.mjs, WP-28c): gehalten wird vor dem Eintritt in die Reihe; wer darin steht, läuft durch. */
function unterSperre(id, arbeit) {
  return vorgang(() => unterSperreInReihe(id, arbeit));
}
async function unterSperreInReihe(id, arbeit) {
  const vorher = sperren.get(id) || Promise.resolve();
  /** @type {(v?: any) => void} */
  let frei = () => {};
  const meins = new Promise((r) => { frei = r; });
  const kette = vorher.then(() => meins);
  sperren.set(id, kette);
  await vorher;
  try { return await arbeit(); }
  finally { frei(); if (sperren.get(id) === kette) sperren.delete(id); }
}

/** Eine begonnene, nicht bestätigte Einrichtung gilt höchstens so lange (Review WP-32d, 3). */
export const EINRICHTUNG_FRIST_MS = 15 * 60 * 1000;
/** Ist das eine ausstehende Einrichtung, die noch bestätigt werden darf? Ohne lesbaren Beginn: nein (fail-closed). */
const ausstehendGueltig = (e, ms) => !!(e && e.stand === "ausstehend" && Number.isFinite(Date.parse(e.begonnen))
  && Date.parse(e.begonnen) + EINRICHTUNG_FRIST_MS > ms);

/**
 * Wie steht es um den zweiten Faktor? Wirft bei einem Lesefehler der
 * Ablage — der Aufrufer muss dann abweisen, nicht durchlassen.
 * `wiederherstellungFassung`: 2, 1 (Altformat) oder null (keine Codes).
 * `wiederherstellungNeuNoetig`: aktiv, aber nicht in Fassung 2 — Aufforderung zur Neugenerierung.
 * @returns {Promise<{aktiv: boolean, ausstehend: boolean, ausstehendSeitMin: number|null, wiederherstellungUebrig: number,
 *   wiederherstellungFassung: number|null, wiederherstellungNeuNoetig: boolean, ausVerlust: boolean,
 *   faktorKennung: string|null}>}
 */
export async function zweifaktorStand(store, id, ms = Date.now()) {
  const e = await store.get(SCHLUESSEL(id), { type: "json" });
  const w = e ? e.wiederherstellung : null;
  const fassung = istV2(w) ? 2 : Array.isArray(w) && w.length > 0 ? 1 : null;
  const aktiv = !!(e && e.stand === "aktiv");
  return {
    aktiv,
    ausstehend: ausstehendGueltig(e, ms),
    /** Minuten seit Beginn der (auch abgelaufenen) ausstehenden Einrichtung, sonst null. */
    ausstehendSeitMin: e && e.stand === "ausstehend" && Number.isFinite(Date.parse(e.begonnen))
      ? Math.max(0, Math.round((ms - Date.parse(e.begonnen)) / 60000)) : null,
    wiederherstellungUebrig: fassung === 2
      ? (Array.isArray(w.eintraege) ? w.eintraege.filter((x) => x && !x.verbraucht).length : 0)
      : fassung === 1 ? w.filter(Boolean).length : 0,
    wiederherstellungFassung: fassung,
    wiederherstellungNeuNoetig: aktiv && fassung !== 2,
    /** WR-3: eine Einrichtung, die aus einem eingelösten Verlustfall stammt (gültig oder abgelaufen). */
    ausVerlust: !!(e && e.stand === "ausstehend" && typeof e.verlustFall === "string" && e.verlustFall),
    /** WR-3: woran ein Verlustfall den Faktor bindet — wechselt mit jeder Einrichtung. */
    faktorKennung: faktorKennungAus(e),
  };
}

/**
 * WR-3: Die Kennung des jetzigen Faktorzustands, an die ein Verlustfall und sein Token gebunden werden. Aktiv: die
 * Einrichtungsgeneration; aus einem Verlustfall ausstehend: dessen Fall. Alles andere: null (kein Fall möglich).
 * @param {any} e
 * @returns {string|null}
 */
function faktorKennungAus(e) {
  if (!e) return null;
  if (e.stand === "aktiv") return `g:${e.generation || "-"}:${e.aktiviert || "-"}`;
  if (e.stand === "ausstehend" && typeof e.verlustFall === "string" && e.verlustFall) return `v:${e.verlustFall}`;
  return null;
}

/**
 * Einrichtung beginnen: neues Geheimnis, ausstehend bis zum ersten Code.
 * Gibt das Geheimnis zurück — der einzige Weg, auf dem es den Server verlässt.
 *
 * `laufendeSchuetzen` (OPT-1-F, Konto-Faktor): Eine noch gültige ausstehende
 * Einrichtung wird nicht überschrieben (`fehler: "ausstehend"`). Geprüft unter
 * derselben Sperre wie das Schreiben — zwei gleichzeitige Aufrufe können sich
 * so nicht gegenseitig ersetzen. Ohne die Wahl bleibt das Verhalten der
 * übrigen Aufrufer (Betreiber, Rollencodes) unverändert.
 */
export async function zweifaktorBeginnen(store, id, konto, { laufendeSchuetzen = false } = {}) {
  if (!zweifaktorMoeglich()) return { fehler: "pfeffer" };
  return unterSperre(id, async () => {
    const e = await store.get(SCHLUESSEL(id), { type: "json" });
    if (e && e.stand === "aktiv") return { fehler: "aktiv" };
    if (laufendeSchuetzen && ausstehendGueltig(e, Date.now())) return { fehler: "ausstehend" };
    /* WR-3: Eine Einrichtung aus einem eingelösten Verlustfall (auch abgelaufen) überschreibt niemand mit dem
       Zugangscode allein — sonst richtete ein Dieb des Codes sein Gerät statt des Inhabers ein. Neuer Fall nötig. */
    if (e && e.stand === "ausstehend" && typeof e.verlustFall === "string" && e.verlustFall) return { fehler: "verlust" };
    const roh = randomBytes(20);
    await store.setJSON(SCHLUESSEL(id), { stand: "ausstehend", geheimnis: verschluesseln(roh, id),
      letzterSchritt: -1, wiederherstellung: null, begonnen: new Date().toISOString() });
    const b32 = base32Kodieren(roh);
    return { geheimnis: b32, otpauth: otpauthAdresse(b32, konto) };
  });
}

/**
 * Würde dieser Code die laufende Einrichtung bestätigen? Prüft nur, speichert
 * nichts (kein letzter Schritt, keine Aktivierung) — für Aufrufer, die vor
 * dem Bestätigen noch etwas tun müssen, das nur bei richtigem Code
 * geschehen darf (Betreiber-2FA: Sitzungen beenden).
 * @returns {Promise<{ok: boolean, fehler?: string}>}
 */
export async function zweifaktorBestaetigenVorpruefen(store, id, code, ms = Date.now()) {
  const e = await store.get(SCHLUESSEL(id), { type: "json" });
  if (!ausstehendGueltig(e, ms)) return { ok: false, fehler: "nichts-ausstehend" };
  const roh = entschluesseln(e.geheimnis, id);
  if (!roh) return { ok: false, fehler: "pfeffer" };
  return codePruefen(roh, code, ms, e.letzterSchritt ?? -1).ok ? { ok: true } : { ok: false, fehler: "code" };
}

/**
 * Einrichtung mit dem ersten Code bestätigen. Gibt die Wiederherstellungscodes
 * einmal zurück. Jede Einrichtung bekommt eine eigene Generation; Nachweise
 * sind an sie gebunden und gelten nach Abschalten und Neueinrichten nicht mehr.
 */
export async function zweifaktorBestaetigen(store, id, code, ms = Date.now()) {
  /* WR-2: Die Codes tragen die Schlüsselepoche. Ist sie nicht feststellbar, wird nicht aktiviert (fail-closed). */
  const ep = await whEpoche();
  if (ep.gebunden && !ep.epoche) return { fehler: "epoche" };
  return unterSperre(id, async () => {
    const e = await store.get(SCHLUESSEL(id), { type: "json" });
    if (!ausstehendGueltig(e, ms)) return { fehler: "nichts-ausstehend" };
    const roh = entschluesseln(e.geheimnis, id);
    if (!roh) return { fehler: "pfeffer" };
    const p = codePruefen(roh, code, ms, e.letzterSchritt ?? -1);
    if (!p.ok) return { fehler: "code" };
    const generation = randomBytes(16).toString("hex");
    const w = await wiederherstellungErzeugen(id, 1, generation);
    await store.setJSON(SCHLUESSEL(id), { ...e, stand: "aktiv", letzterSchritt: p.schritt,
      geheimnis: kapselNeu(e.geheimnis, roh, id), wiederherstellung: whStruktur(w, 1, ms, ep),
      aktiviert: new Date().toISOString(), generation });
    return { ok: true, wiederherstellung: w.klar };
  });
}

/** Abgelaufene Nachweise entfernen — beim Ausstellen und Prüfen, nebenbei. */
async function nachweiseRaeumen(store, ms) {
  const jetzt = Math.floor(ms / 1000);
  const { blobs } = await store.list({ prefix: "zweifaktor-nachweis:" });
  for (const b of blobs) {
    const n = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!n || !Number.isFinite(n.bis) || n.bis <= jetzt) await store.delete(b.key).catch(() => {});
  }
}

/**
 * Den zweiten Faktor prüfen: TOTP-Code, Wiederherstellungscode oder —
 * wenn erlaubt — ein Nachweis.
 *
 * @param {any} store
 * @param {string} id
 * @param {{code?: string, nachweis?: string, nachweisErlaubt?: boolean, ms?: number}} a
 * @returns {Promise<{ok: boolean, art?: string, grund?: string}>}
 */
export async function zweifaktorPruefen(store, id, { code, nachweis, nachweisErlaubt = true, ms = Date.now() }) {
  if (nachweisErlaubt && nachweis && !code) {
    const schl = NACHWEIS(nachweisHash(String(nachweis)));
    const n = await store.get(schl, { type: "json" });
    const abgelaufen = n && !(Number.isFinite(n.bis) && n.bis > Math.floor(ms / 1000));
    if (abgelaufen) await store.delete(schl).catch(() => {});
    if (n && !abgelaufen && n.id === id) {
      /* Nur für die Einrichtung, für die er ausgestellt wurde. */
      const e = await store.get(SCHLUESSEL(id), { type: "json" });
      if (e && e.stand === "aktiv" && e.generation && n.generation === e.generation)
        return { ok: true, art: "nachweis" };
    }
    nachweiseRaeumen(store, ms).catch(() => {});
    return { ok: false, grund: "nachweis" };
  }
  if (!code) return { ok: false, grund: "fehlt" };
  /* WR-2: Für einen Wiederherstellungscode die Schlüsselepoche vor der Sperre feststellen (TOTP braucht sie nicht). */
  const alsTotp = /^\d{6}$/.test(String(code).trim().replace(/\s/g, ""));
  const ep = alsTotp ? /** @type {{gebunden: false}} */ ({ gebunden: false }) : await whEpoche();
  return unterSperre(id, async () => {
    const e = await store.get(SCHLUESSEL(id), { type: "json" });
    if (!e || e.stand !== "aktiv") return { ok: false, grund: "nicht-aktiv" };
    const c = String(code).trim();
    /* Sechs Ziffern sind TOTP; alles andere geht in die Codeprüfung. */
    if (/^\d{6}$/.test(c.replace(/\s/g, ""))) {
      const roh = entschluesseln(e.geheimnis, id);
      if (!roh) return { ok: false, grund: "pfeffer" };
      const p = codePruefen(roh, c, ms, e.letzterSchritt ?? -1);
      if (!p.ok) return { ok: false, grund: p.wiederholt ? "wiederholt" : "code" };
      await store.setJSON(SCHLUESSEL(id), { ...e, letzterSchritt: p.schritt,
        geheimnis: kapselNeu(e.geheimnis, roh, id) });
      return { ok: true, art: "totp" };
    }
    /* WR-2: Ist die Epoche gebunden, gilt nur ein Satz aus genau dieser Epoche. Nicht feststellbar: kein Einlösen.
       Ein Satz ohne Epoche (Altformat, oder aus der Zeit vor der Bindung) und einer aus einer früheren Epoche (die
       Ablage wurde zurückgespielt) gilt nicht — auch nicht ein Code, der im zurückgespielten Stand unverbraucht ist. */
    if (ep.gebunden) {
      if (!ep.epoche) return { ok: false, grund: "epoche" };
      if (!istV2(e.wiederherstellung) || e.wiederherstellung.epoche !== ep.epoche) return { ok: false, grund: "epoche-alt" };
    }
    /* Wiederherstellungscode: verbraucht, sobald er passt. */
    if (istV2(e.wiederherstellung)) return wiederherstellungEinloesen(store, id, e, c, ms);
    /* Altformat (Fassung 1): nur lesen und verbrauchen, bis neu generiert wird. */
    const h = codeHashV1(c);
    const liste = Array.isArray(e.wiederherstellung) ? e.wiederherstellung : [];
    let stelle = -1;
    liste.forEach((x, i) => { if (h && x && gleich(x, h) && stelle < 0) stelle = i; });
    if (stelle < 0) return { ok: false, grund: "code" };
    const neu = liste.slice(); neu[stelle] = null;
    await store.setJSON(SCHLUESSEL(id), { ...e, wiederherstellung: neu });
    return { ok: true, art: "wiederherstellung" };
  });
}

/**
 * Fassung 2 einlösen — nur unter der Sperre je id aufrufen. Genau ein
 * scrypt je Versuch: Bei unbekanntem oder verbrauchtem Selektor, falscher
 * Form oder unstimmiger Ablage wird gegen ein Schein-Salz gerechnet, damit
 * die Laufzeit nichts über die Existenz eines Selektors verrät. Erfolg erst
 * nach erfolgreichem Schreiben; ein Schreibfehler geht an den Aufrufer.
 * @returns {Promise<{ok: boolean, art?: string, grund?: string}>}
 */
async function wiederherstellungEinloesen(store, id, e, code, ms) {
  const k = whSchluessel();
  if (!k) return { ok: false, grund: "pfeffer" };
  const w = e.wiederherstellung;
  const eintraege = Array.isArray(w.eintraege) ? w.eintraege : [];
  const stimmig = kdfGleich(w.kdf) && Number.isInteger(w.generation)
    && w.verbrauchtZahl === eintraege.filter((x) => x && x.verbraucht).length;
  const z = wiederherstellungZerlegen(code);
  const stelle = z && stimmig ? eintraege.findIndex((x) => x && !x.verbraucht && x.sel === z.sel) : -1;
  const ziel = stelle >= 0 ? eintraege[stelle] : null;
  const vor = whVor(k, id, String(e.generation ?? ""), w.generation,
    z ? z.sel : "AAAA", z ? z.pruef : "AAAAAAAAAAAA");
  const ist = await whScrypt(vor, ziel ? Buffer.from(String(ziel.salz), "base64") : WH_SCHEIN_SALZ);
  const soll = ziel ? Buffer.from(String(ziel.wert), "base64") : Buffer.alloc(WH_LAENGE);
  const treffer = !!ziel && soll.length === ist.length && timingSafeEqual(soll, ist);
  if (!treffer) return { ok: false, grund: "code" };
  const neu = eintraege.slice();
  neu[stelle] = { ...ziel, verbraucht: new Date(ms).toISOString() };
  await store.setJSON(SCHLUESSEL(id), { ...e,
    wiederherstellung: { ...w, eintraege: neu, verbrauchtZahl: w.verbrauchtZahl + 1 } });
  return { ok: true, art: "wiederherstellung" };
}

/**
 * Wiederherstellungscodes neu erzeugen. Verlangt einen frischen TOTP-Code —
 * keinen Wiederherstellungscode, keinen Nachweis. Danach gilt keiner der
 * bisherigen Codes mehr (auch kein Altformat); die Codegeneration steigt.
 * Die neuen Codes verlassen den Server genau hier, einmal.
 * @returns {Promise<{ok: boolean, fehler?: string, wiederherstellung?: string[], generation?: number}>}
 */
export async function wiederherstellungNeu(store, id, code, ms = Date.now()) {
  if (!zweifaktorMoeglich()) return { ok: false, fehler: "pfeffer" };
  /* WR-2: Der neue Satz trägt die jetzige Schlüsselepoche. Nicht feststellbar: nichts erzeugt, alte Codes unverändert. */
  const ep = await whEpoche();
  if (ep.gebunden && !ep.epoche) return { ok: false, fehler: "epoche" };
  /* Prüfen, Erzeugen und Ersetzen unter EINER Sperre je id: Zwei gleichzeitige Neugenerierungen mit demselben Code
     ergeben genau einen neuen Satz (der zweite scheitert am verbrauchten Zeitschritt), und ein gleichzeitiges Einlösen
     eines alten Codes liegt entweder ganz davor oder scheitert danach. Scheitert das Schreiben, bleibt der alte Satz
     unverändert gültig und es verlässt kein neuer Code den Server (der Fehler geht an den Aufrufer). */
  return unterSperre(id, async () => {
    const e = await store.get(SCHLUESSEL(id), { type: "json" });
    if (!e || e.stand !== "aktiv") return { ok: false, fehler: "nicht-aktiv" };
    const c = String(code ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(c)) return { ok: false, fehler: "code" };
    const roh = entschluesseln(e.geheimnis, id);
    if (!roh) return { ok: false, fehler: "pfeffer" };
    const p = codePruefen(roh, c, ms, e.letzterSchritt ?? -1);
    if (!p.ok) return { ok: false, fehler: p.wiederholt ? "wiederholt" : "code" };
    const alt = e.wiederherstellung;
    const generation = (istV2(alt) && Number.isInteger(alt.generation) ? alt.generation : 0) + 1;
    const w = await wiederherstellungErzeugen(id, generation, String(e.generation ?? ""));
    await store.setJSON(SCHLUESSEL(id), { ...e, letzterSchritt: p.schritt,
      geheimnis: kapselNeu(e.geheimnis, roh, id), wiederherstellung: whStruktur(w, generation, ms, ep) });
    return { ok: true, wiederherstellung: w.klar, generation };
  });
}

/** Einen Nachweis ausstellen — nur nach einer bestandenen Code-Prüfung aufrufen. */
export async function nachweisAusstellen(store, id, ms = Date.now()) {
  const e = await store.get(SCHLUESSEL(id), { type: "json" });
  if (!e || e.stand !== "aktiv" || !e.generation) throw new Error("kein aktiver zweiter Faktor");
  await nachweiseRaeumen(store, ms).catch(() => {});
  const t = randomBytes(32).toString("base64url");
  const bis = Math.floor(ms / 1000) + NACHWEIS_DAUER;
  await store.setJSON(NACHWEIS(nachweisHash(t)), { id, bis, generation: e.generation });
  return { nachweis: t, gueltigBis: new Date(bis * 1000).toISOString() };
}

/**
 * WR-3: Nach einem eingelösten Verlustfall den Faktor durch eine NEUE AUSSTEHENDE Einrichtung ersetzen — in einem
 * einzigen Schreibvorgang unter der Sperre des Faktors. Es gibt keinen Zwischenstand „kein Faktor, Einrichtung frei"
 * (T13): Der alte Eintrag wird nie gelöscht, sondern durch den neuen überschrieben. Geprüft wird unter der Sperre, dass
 * der Faktor noch derselbe ist, an den der Fall gebunden war (`erwartet`, faktorKennungAus); sonst bleibt alles, wie es
 * ist (`fehler: "geaendert"`). Schreibfehler werfen — der alte Faktor bleibt dann unverändert gültig.
 * Die Einrichtung trägt den Fall (`verlustFall`): Sie lässt sich mit dem Zugangscode allein nicht überschreiben
 * (betreiber-zweifaktor.mjs, „beginnen"), und ohne bestätigten Code entsteht keine Sitzung.
 * @param {any} store
 * @param {string} id
 * @param {string} konto  Anzeigename für die App (otpauth)
 * @param {{erwartet: string, fall: string}} a
 * @returns {Promise<{ok: true, geheimnis: string, otpauth: string}|{ok: false, fehler: string}>}
 */
export async function zweifaktorNachVerlustNeu(store, id, konto, { erwartet, fall }) {
  if (!zweifaktorMoeglich()) return { ok: false, fehler: "pfeffer" };
  if (typeof erwartet !== "string" || !erwartet || typeof fall !== "string" || !fall) return { ok: false, fehler: "geaendert" };
  return unterSperre(id, async () => {
    const e = await store.get(SCHLUESSEL(id), { type: "json" });
    if (faktorKennungAus(e) !== erwartet) return { ok: false, fehler: "geaendert" };
    const roh = randomBytes(20);
    await store.setJSON(SCHLUESSEL(id), { stand: "ausstehend", geheimnis: verschluesseln(roh, id),
      letzterSchritt: -1, wiederherstellung: null, begonnen: new Date().toISOString(), verlustFall: fall });
    const b32 = base32Kodieren(roh);
    return { ok: true, geheimnis: b32, otpauth: otpauthAdresse(b32, konto) };
  });
}

/**
 * Eine BEGONNENE, nicht bestätigte Einrichtung verwerfen — für Fehlerpfade (z. B. gesperrter Ersteinrichtungscode).
 * Anders als zweifaktorAbschalten berührt sie einen AKTIVEN Faktor nie (Review PR #179): Unter derselben Sperre wie
 * Bestätigen und Abschalten wird frisch gelesen; ist der Eintrag aktiv oder in einem anderen Stand als „ausstehend",
 * bleibt er unverändert (`grund: "aktiv"` bzw. `"anderer-stand"`). Ein Lesefehler wirft — der Aufrufer löscht dann
 * nichts und sagt ab. Kein Eintrag: nichts zu tun.
 * @returns {Promise<{ok: boolean, grund?: string}>}
 */
export async function zweifaktorEinrichtungVerwerfen(store, id) {
  return unterSperre(id, async () => {
    const e = await store.get(SCHLUESSEL(id), { type: "json" });
    if (!e) return { ok: true, grund: "nichts" };
    if (e.stand === "aktiv") return { ok: false, grund: "aktiv" };
    if (e.stand !== "ausstehend") return { ok: false, grund: "anderer-stand" };
    await store.delete(SCHLUESSEL(id));
    return { ok: true };
  });
}

/**
 * Abschalten: alle Nachweise dieses Schlüssels und den Eintrag entfernen.
 * Lässt sich die Liste der Nachweise nicht lesen, wird NICHT abgeschaltet —
 * der Fehler geht an den Aufrufer. (Die Generation macht übrig gebliebene
 * Nachweise ohnehin wertlos; abgeschaltet wird trotzdem nur sauber.)
 * Nur für ausdrückliches Abschalten oder Zurücksetzen durch den Inhaber bzw.
 * offline; ein Fehlerpfad nimmt zweifaktorEinrichtungVerwerfen (PR #179).
 */
export async function zweifaktorAbschalten(store, id) {
  return unterSperre(id, async () => {
    const { blobs } = await store.list({ prefix: "zweifaktor-nachweis:" });
    for (const b of blobs) {
      const n = await store.get(b.key, { type: "json" }).catch(() => null);
      if (n && n.id === id) await store.delete(b.key);
    }
    await store.delete(SCHLUESSEL(id));
    return { ok: true };
  });
}
