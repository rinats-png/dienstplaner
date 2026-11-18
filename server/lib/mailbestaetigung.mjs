/* ==========================================================================
   MAILBESTÄTIGUNG — die E-Mail-Adresse einer Person bestätigen (E-9)

   Befund docs/acc45/BEFUND-VERSAND-UNVERIFIZIERTE-EMAIL.md: Benachrichtigungen
   gingen an `person.email`, ohne dass jemand die Adresse bestätigt hatte. Das
   ist NICHT die Konto-Adresse (`emailVerifiziertAm` in accounts.mjs) — die
   bleibt davon unberührt.

   Schalter CENTRIC_MAILBESTAETIGUNG (Vorgabe „aus“):
     aus      — kein Bestätigungsweg (404), Versand wie bisher.
     angebot  — Bestätigungsweg da, Versand wie bisher (Übergang: Personen
                können bestätigen, niemand verliert eine Zustellung).
     pflicht  — Bestätigungsweg da; personenbezogene Benachrichtigungen per
                Mail nur noch an bestätigte Adressen (versand.mjs, Grund
                „unbestaetigt“; Push und Postfach bleiben).

   Ablage — bewusst NICHT im Bestand: Kein Schreibweg des Bestands (PUT,
   Teilweg, Import) kann eine Bestätigung setzen oder übernehmen.
     mailbest:<raum>:<mandantId>:<h(person)>      { adresse: Wert, am }
     mailbestcode:<raum>:<mandantId>:<h(person)>  { hash, adresse: Wert, ablauf, angefordert, fehlversuche }
   `Wert` ist ein HMAC der kleingeschriebenen Adresse mit CENTRIC_PFEFFER (wie
   die Adresssperre in versand.mjs). Ändert sich die Adresse, passt der Wert
   nicht mehr: Die Bestätigung gilt nicht mehr, ohne dass jemand sie
   zurücksetzen muss. In der Auslieferung ohne Pfeffer gibt es keinen Wert —
   dann lässt sich nichts bestätigen (fail-closed).

   Missbrauchsbremse (kein Mail-Bombing, kein frei wählbarer Inhalt):
   - Anfordern nur die Person selbst, nur für ihre gespeicherte Adresse
     (die Anfrage trägt keine Adresse und keinen Text).
   - Inhalt fest: Code, Gültigkeit, Adresse der Anwendung — kein Betriebsname,
     kein Name, keine Plan- oder Gesundheitsangabe.
   - Je Person ein offener Code; ein neuer frühestens nach 60 Sekunden.
   - Tagesgrenzen (Berliner Tag): je Person 3, je Adresse 3 (über alle Räume),
     je Betrieb 30; Test- und Demoräume nur mit Freigabe und innerhalb ihrer
     Mailgrenzen (testraum.mjs). Dazu die Bremse je Sitzung (schutz.mjs).
   - Der Code (12 Zeichen, ~60 Bit) ist einmalig, 30 Minuten gültig, an Person
     und Adresse gebunden, nur als Hash gespeichert und wird in gleicher Zeit
     verglichen (codes.mjs, gleich). Nach 5 Fehlversuchen ist er verbraucht.
   - Einlösen nur angemeldet als dieselbe Person: Der Code allein öffnet
     nichts. Wer eine fremde Adresse einträgt, bekommt den Code nicht; wer die
     Adresse einer anderen Person auf seine eigene setzt (Leitung), kann ihn
     nicht einlösen.
   - Versand nur über den bestehenden Weg (post.mjs): ohne RESEND_API_KEY
     (bzw. SMTP) Trockenlauf. Der Code steht nie in einer Antwort.
   ========================================================================== */

import { createHash, createHmac, randomInt } from "node:crypto";
import { domainToASCII } from "node:url";
import { istProduktion } from "./umgebung.mjs";
import { sendeMail, anwendungsAdresse } from "./post.mjs";
import { gleich } from "./codes.mjs";
import { kontingentTag } from "./zustellregeln.mjs";
import { istTestOderDemoraum, testraumMailFrei, testraumMailTagMax, testraumMailGesamtMax } from "./testraum.mjs";

export const CODE_FRIST_MS = 30 * 60 * 1000;
export const NEU_FRUEHESTENS_MS = 60 * 1000;
export const FEHLVERSUCHE_MAX = 5;
export const TAG_JE_PERSON = 3;
export const TAG_JE_ADRESSE = 3;
export const TAG_JE_BETRIEB = 30;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // ohne 0/O, 1/I
const CODE_LAENGE = 12;

const h = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 24);
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** Der eingestellte Wert von CENTRIC_MAILBESTAETIGUNG: „angebot“ oder „pflicht“; alles andere ist „aus“. */
export function mailbestaetigungEingestellt() {
  const w = String(process.env.CENTRIC_MAILBESTAETIGUNG || "").trim().toLowerCase();
  return w === "angebot" || w === "pflicht" ? w : "aus";
}

/** Läuft der Schalter ins Leere? In der Auslieferung ohne CENTRIC_PFEFFER lässt sich nichts bestätigen. */
export const mailbestaetigungOhnePfeffer = () => istProduktion() && !String(process.env.CENTRIC_PFEFFER || "").trim();

let gewarnt = false;
/**
 * Der wirksame Modus. Review-Auflage M2: „pflicht“ ohne Pfeffer in der
 * Auslieferung hielte jede Personenmail still und endgültig an (keine Adresse
 * ist bestätigbar). Dann gilt „angebot“ (Versand wie bisher), mit lauter
 * Warnung im Serverprotokoll und in der Einrichtungsprüfung (einrichten.mjs).
 * @returns {"aus"|"angebot"|"pflicht"}
 */
export function mailbestaetigungModus() {
  const w = mailbestaetigungEingestellt();
  if (w === "pflicht" && mailbestaetigungOhnePfeffer()) {
    if (!gewarnt) {
      gewarnt = true;
      console.error("[mailbestaetigung] CENTRIC_MAILBESTAETIGUNG=pflicht ohne CENTRIC_PFEFFER: es gilt „angebot“ "
        + "(Versand wie bisher), bis CENTRIC_PFEFFER gesetzt ist.");
    }
    return "angebot";
  }
  return w;
}

/** Warnung für die Einrichtungsprüfung (einrichten.mjs, /einrichten/umgebung) oder null. */
export function mailbestaetigungWarnung() {
  const w = mailbestaetigungEingestellt();
  if (w !== "aus" && mailbestaetigungOhnePfeffer())
    return `CENTRIC_MAILBESTAETIGUNG=${w}, aber CENTRIC_PFEFFER fehlt: Adressen lassen sich nicht bestätigen`
      + (w === "pflicht" ? " — es gilt deshalb „angebot“ (Versand wie bisher)." : ".");
  return null;
}

/** Die Adresse der Person nach derselben Regel wie der Versand (versand.mjs, mailAdresse). */
export function personAdresse(p) {
  const a = istObjekt(p) && typeof p.email === "string" ? p.email.trim() : "";
  return a.includes("@") && a.length <= 254 ? a : null;
}

/** HMAC der Adresse (siehe Kopf). @returns {string|null} */
export function adressWert(adresse) {
  const a = String(adresse).trim().toLowerCase();
  const pfeffer = process.env.CENTRIC_PFEFFER;
  if (pfeffer) return createHmac("sha256", pfeffer).update(`mailbestaetigt:${a}`).digest("hex").slice(0, 32);
  return istProduktion() ? null : h(`mailbestaetigt:${a}`);
}

/** Nur für die Tagesgrenze je Adresse (nicht für Versand oder Bestätigung): „name+x@Domain“ und
    „name@domain“ zählen zusammen, die Domain in ASCII (IDN) und klein. Review-Auflage N1. */
export function bremsAdresse(adresse) {
  const a = String(adresse).trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at < 1) return a;
  const lokal = a.slice(0, at).split("+")[0] || a.slice(0, at);
  const domain = domainToASCII(a.slice(at + 1)) || a.slice(at + 1);
  return `${lokal}@${domain}`;
}

export const bestaetigtSchluessel = (raum, mandantId, personId) => `mailbest:${raum}:${mandantId}:${h(personId)}`;
export const codeSchluessel = (raum, mandantId, personId) => `mailbestcode:${raum}:${mandantId}:${h(personId)}`;
const codeHash = (raum, mandantId, personId, code) =>
  createHash("sha256").update(`mailbest|${raum}|${mandantId}|${personId}|${code}`).digest("hex");

/**
 * Ist genau diese Adresse für die Person bestätigt? Wirft, wenn die Ablage
 * nicht antwortet (der Versand stellt dann zurück, statt endgültig zu überspringen).
 */
export async function adresseBestaetigt(store, raum, mandantId, personId, adresse) {
  const wert = adresse ? adressWert(adresse) : null;
  if (!wert) return false;
  const b = await store.get(bestaetigtSchluessel(raum, mandantId, personId), { type: "json" });
  return istObjekt(b) && typeof b.adresse === "string" && gleich(b.adresse, wert);
}

/** Zeitpunkt der Bestätigung der aktuellen Adresse (Auskunft nach Art. 15) oder null. */
export async function bestaetigtAm(store, raum, mandantId, p) {
  const an = personAdresse(p);
  const wert = an ? adressWert(an) : null;
  if (!wert) return null;
  const b = await store.get(bestaetigtSchluessel(raum, mandantId, p.id), { type: "json" }).catch(() => null);
  return istObjekt(b) && b.adresse === wert && typeof b.am === "string" ? b.am : null;
}

/**
 * Review-Auflage M3: Wie viele Personen des Betriebs haben eine Adresse, und
 * wie viele davon sind unbestätigt? Nur Zähler, keine Adressen, keine Namen —
 * die Voraussetzung, bevor jemand „pflicht“ einschaltet. Nicht lesbare
 * Einträge zählen als unbestätigt (vorsichtig).
 * @returns {Promise<{mitAdresse: number, unbestaetigt: number}>}
 */
export async function bestaetigungsQuote(store, { raum, m }) {
  let mitAdresse = 0, unbestaetigt = 0;
  for (const p of Array.isArray(m && m.personen) ? m.personen : []) {
    if (!istObjekt(p) || p.anonym === true) continue;
    const an = personAdresse(p);
    if (!an) continue;
    mitAdresse += 1;
    if (!(await adresseBestaetigt(store, raum, m.id, p.id, an).catch(() => false))) unbestaetigt += 1;
  }
  return { mitAdresse, unbestaetigt };
}

/** Für die Oberfläche: gibt es eine Adresse, ist sie bestätigt, läuft ein Code? Nie die Adresse selbst. */
export async function bestaetigungStand(store, { raum, m, p, jetzt = Date.now() }) {
  const an = personAdresse(p);
  if (!an) return { adresse: false, bestaetigt: false, ausstehend: false };
  const bestaetigt = await adresseBestaetigt(store, raum, m.id, p.id, an).catch(() => false);
  const c = await store.get(codeSchluessel(raum, m.id, p.id), { type: "json" }).catch(() => null);
  const wert = adressWert(an);
  const ausstehend = !bestaetigt && istObjekt(c) && wert !== null && c.adresse === wert && Date.parse(c.ablauf || "") > jetzt;
  return { adresse: true, bestaetigt, ausstehend };
}

/** Einen Platz eines Tageskontingents atomar beanspruchen (wie versand.mjs). */
async function platz(store, praefix, limit) {
  for (let k = 1; k <= limit; k++) if (await store.setJSONWennNeu(`${praefix}${k}`, { k })) return `${praefix}${k}`;
  return null;
}

function neuerCode() {
  let c = "";
  for (let i = 0; i < CODE_LAENGE; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return c;
}
const codeAnzeige = (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
/** Eingabe des Codes: Groß, ohne Leerzeichen und Striche. */
const codeNorm = (x) => (typeof x === "string" ? x.toUpperCase().replace(/[\s-]/g, "") : "");

/** Fester, inhaltsarmer Text — keine Eingabe der Anfrage, kein Betriebsname. */
function mailText(code) {
  return {
    betreff: "E-Mail-Adresse bestätigen — CENTRIC",
    text: ["Diese Adresse wurde in CENTRIC für Benachrichtigungen eingetragen.", "",
      `Bestätigungscode: ${codeAnzeige(code)}`,
      "Gültig 30 Minuten. Den Code in CENTRIC (angemeldet) bei der E-Mail-Adresse eingeben.", "",
      `CENTRIC: ${anwendungsAdresse()}`, "",
      "Warst du das nicht? Dann diese Mail ignorieren — ohne den Code wird nichts bestätigt."].join("\n"),
  };
}

/**
 * Bestätigungscode anfordern und per Mail an die gespeicherte Adresse der Person senden.
 * @returns {Promise<{ok: true, trocken?: boolean}|{ok: false, grund: string}>}
 *   grund: keineAdresse · bestaetigt · nichtEingerichtet · testraum · warten · kontingent · versand
 */
export async function bestaetigungAnfordern(store, { raum, m, p, jetzt = Date.now() }) {
  const an = personAdresse(p);
  if (!an) return { ok: false, grund: "keineAdresse" };
  const wert = adressWert(an);
  if (!wert) return { ok: false, grund: "nichtEingerichtet" };
  if (await adresseBestaetigt(store, raum, m.id, p.id, an)) return { ok: false, grund: "bestaetigt" };
  const testraum = istTestOderDemoraum(raum, m);
  if (testraum && !testraumMailFrei()) return { ok: false, grund: "testraum" };
  const ck = codeSchluessel(raum, m.id, p.id);
  const alt = await store.get(ck, { type: "json" });
  if (istObjekt(alt) && jetzt - Date.parse(alt.angefordert || "") < NEU_FRUEHESTENS_MS) return { ok: false, grund: "warten" };

  /* Kontingente: belegt bleibt belegt, auch wenn der Versand scheitert (strenger, nie großzügiger). */
  const tag = kontingentTag(jetzt);
  const grenzen = [
    [`zustellquote:${raum}:${m.id}:${tag}:mailbest:p-${h(p.id)}:`, TAG_JE_PERSON],
    [`zustellquote:_mailbest:alle:${tag}:a-${adressWert(bremsAdresse(an))}:`, TAG_JE_ADRESSE],
    [`zustellquote:${raum}:${m.id}:${tag}:mailbest:b:`, TAG_JE_BETRIEB],
    ...(testraum ? [[`zustellquote:${raum}:raum:${tag}:mail:testraum:`, testraumMailTagMax()],
      [`zustellquote:_testraeume:alle:${tag}:mail:testraum:`, testraumMailGesamtMax()]] : []),
  ];
  for (const [praefix, limit] of grenzen) if (!(await platz(store, praefix, limit))) return { ok: false, grund: "kontingent" };

  const code = neuerCode();
  await store.setJSON(ck, { hash: codeHash(raum, m.id, p.id, code), adresse: wert,
    ablauf: new Date(jetzt + CODE_FRIST_MS).toISOString(), angefordert: new Date(jetzt).toISOString(), fehlversuche: 0 });
  const { betreff, text } = mailText(code);
  const r = /** @type {any} */ (await sendeMail(an, betreff, text, { idempotenz: `mailbest-${h(code)}` })
    .catch(() => ({ ok: false })));
  if (!r || !r.ok) {
    await store.delete(ck).catch(() => {});
    return { ok: false, grund: "versand" };
  }
  return r.trocken ? { ok: true, trocken: true } : { ok: true };
}

/**
 * Code einlösen — nur für die Person der Sitzung, nur für ihre aktuelle Adresse.
 * @returns {Promise<{ok: true}|{ok: false, grund: "ungueltig"}>}
 */
export async function bestaetigen(store, { raum, m, p, code, jetzt = Date.now() }) {
  const nein = { ok: false, grund: /** @type {"ungueltig"} */ ("ungueltig") };
  const ck = codeSchluessel(raum, m.id, p.id);
  const c = await store.get(ck, { type: "json" });
  if (!istObjekt(c)) return nein;
  const an = personAdresse(p);
  const wert = an ? adressWert(an) : null;
  if (!wert || c.adresse !== wert || !(Date.parse(c.ablauf || "") > jetzt)) {
    await store.delete(ck).catch(() => {});                 // abgelaufen oder Adresse geändert: verbraucht
    return nein;
  }
  const eingabe = codeNorm(code);
  const passt = eingabe.length === CODE_LAENGE && gleich(codeHash(raum, m.id, p.id, eingabe), String(c.hash || ""));
  if (!passt) {
    const fehl = (Number.isInteger(c.fehlversuche) ? c.fehlversuche : 0) + 1;
    if (fehl >= FEHLVERSUCHE_MAX) await store.delete(ck).catch(() => {});
    else await store.setJSON(ck, { ...c, fehlversuche: fehl });
    return nein;
  }
  /* Erst den Code verbrauchen, dann bestätigen: Ein zweites Einlösen findet keinen Code mehr. */
  await store.delete(ck);
  await store.setJSON(bestaetigtSchluessel(raum, m.id, p.id), { adresse: wert, am: new Date(jetzt).toISOString() });
  return { ok: true };
}

/** Alles zur Bestätigung einer Person entfernen (Person gelöscht/anonymisiert, Art. 17). */
export async function bestaetigungEntfernen(store, raum, mandantId, personId) {
  await store.delete(bestaetigtSchluessel(raum, mandantId, personId)).catch(() => {});
  await store.delete(codeSchluessel(raum, mandantId, personId)).catch(() => {});
}
