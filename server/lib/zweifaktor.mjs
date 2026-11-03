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

   Wiederherstellungscodes: zehn Stück, beim Bestätigen einmal angezeigt,
   gespeichert nur als HMAC mit dem Pfeffer. Jeder gilt einmal.

   Nachweis: Skripte rufen /einrichten mehrmals hintereinander auf, und ein
   Code gilt nur einmal. Deshalb lässt sich mit einem Code ein Nachweis
   holen — 256 Bit, 15 Minuten gültig, an genau diesen Schlüssel gebunden,
   gespeichert nur als Prüfsumme. Abschalten verlangt immer einen frischen
   Code, nie einen Nachweis.
   ========================================================================== */

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync,
  randomBytes, timingSafeEqual } from "node:crypto";

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

const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";

const normieren = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** HMAC mit dem Pfeffer — ohne Pfeffer kein Wert, also auch kein Treffer. */
function codeHash(code) {
  const p = process.env.CENTRIC_PFEFFER;
  if (!p) return null;
  return createHmac("sha256", p).update(`wiederherstellung:${normieren(code)}`).digest("hex");
}

export function wiederherstellungErzeugen(n = WIEDERHERSTELLUNG_ANZAHL) {
  const block = () => Array.from(randomBytes(5)).map((b) => ALPHABET[b % ALPHABET.length]).join("");
  const klar = Array.from({ length: n }, () => `${block()}-${block()}`);
  return { klar, hashes: klar.map(codeHash) };
}

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
async function unterSperre(id, arbeit) {
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

/**
 * Wie steht es um den zweiten Faktor? Wirft bei einem Lesefehler der
 * Ablage — der Aufrufer muss dann abweisen, nicht durchlassen.
 * @returns {Promise<{aktiv: boolean, ausstehend: boolean, wiederherstellungUebrig: number}>}
 */
export async function zweifaktorStand(store, id) {
  const e = await store.get(SCHLUESSEL(id), { type: "json" });
  return {
    aktiv: !!(e && e.stand === "aktiv"),
    ausstehend: !!(e && e.stand === "ausstehend"),
    wiederherstellungUebrig: e && Array.isArray(e.wiederherstellung)
      ? e.wiederherstellung.filter(Boolean).length : 0,
  };
}

/**
 * Einrichtung beginnen: neues Geheimnis, ausstehend bis zum ersten Code.
 * Gibt das Geheimnis zurück — der einzige Weg, auf dem es den Server verlässt.
 */
export async function zweifaktorBeginnen(store, id, konto) {
  if (!zweifaktorMoeglich()) return { fehler: "pfeffer" };
  return unterSperre(id, async () => {
    const e = await store.get(SCHLUESSEL(id), { type: "json" });
    if (e && e.stand === "aktiv") return { fehler: "aktiv" };
    const roh = randomBytes(20);
    await store.setJSON(SCHLUESSEL(id), { stand: "ausstehend", geheimnis: verschluesseln(roh, id),
      letzterSchritt: -1, wiederherstellung: [], begonnen: new Date().toISOString() });
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
  if (!e || e.stand !== "ausstehend") return { ok: false, fehler: "nichts-ausstehend" };
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
  return unterSperre(id, async () => {
    const e = await store.get(SCHLUESSEL(id), { type: "json" });
    if (!e || e.stand !== "ausstehend") return { fehler: "nichts-ausstehend" };
    const roh = entschluesseln(e.geheimnis, id);
    if (!roh) return { fehler: "pfeffer" };
    const p = codePruefen(roh, code, ms, e.letzterSchritt ?? -1);
    if (!p.ok) return { fehler: "code" };
    const w = wiederherstellungErzeugen();
    await store.setJSON(SCHLUESSEL(id), { ...e, stand: "aktiv", letzterSchritt: p.schritt,
      geheimnis: kapselNeu(e.geheimnis, roh, id), wiederherstellung: w.hashes,
      aktiviert: new Date().toISOString(), generation: randomBytes(16).toString("hex") });
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
  return unterSperre(id, async () => {
    const e = await store.get(SCHLUESSEL(id), { type: "json" });
    if (!e || e.stand !== "aktiv") return { ok: false, grund: "nicht-aktiv" };
    const c = String(code).trim();
    if (/^\d[\d\s]*$/.test(c)) {
      const roh = entschluesseln(e.geheimnis, id);
      if (!roh) return { ok: false, grund: "pfeffer" };
      const p = codePruefen(roh, c, ms, e.letzterSchritt ?? -1);
      if (!p.ok) return { ok: false, grund: p.wiederholt ? "wiederholt" : "code" };
      await store.setJSON(SCHLUESSEL(id), { ...e, letzterSchritt: p.schritt,
        geheimnis: kapselNeu(e.geheimnis, roh, id) });
      return { ok: true, art: "totp" };
    }
    /* Wiederherstellungscode: verbraucht, sobald er passt. */
    const h = codeHash(c);
    const liste = Array.isArray(e.wiederherstellung) ? e.wiederherstellung : [];
    let stelle = -1;
    liste.forEach((x, i) => { if (h && x && gleich(x, h) && stelle < 0) stelle = i; });
    if (stelle < 0) return { ok: false, grund: "code" };
    const neu = liste.slice(); neu[stelle] = null;
    await store.setJSON(SCHLUESSEL(id), { ...e, wiederherstellung: neu });
    return { ok: true, art: "wiederherstellung" };
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
 * Abschalten: alle Nachweise dieses Schlüssels und den Eintrag entfernen.
 * Lässt sich die Liste der Nachweise nicht lesen, wird NICHT abgeschaltet —
 * der Fehler geht an den Aufrufer. (Die Generation macht übrig gebliebene
 * Nachweise ohnehin wertlos; abgeschaltet wird trotzdem nur sauber.)
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
