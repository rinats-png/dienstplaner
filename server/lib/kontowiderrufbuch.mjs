/* ==========================================================================
   KONTO-WIDERRUFBUCH — Kontosperren und entzogene Mitgliedschaften überleben
   jeden Rücksprung (BE-1, Betreiberentscheidung 2026-11-14, Option A;
   docs/acc45/ENTSCHEIDUNG-BE1-BE3.md §1, docs/acc45/ABNAHME-V4-BE1-KONTO-WIDERRUFBUCH.md)

   Kontostatus (`account:*`.status), Mitgliedschaft (`mitglied:<a>:<raum>`) und
   ihr Generationsanker (`mitgliedlauf:<a>:<raum>`) liegen in der gesicherten
   Ablage (Klasse A). Eine ältere Sicherung brachte sie GEMEINSAM zurück: eine
   gesperrte Identität wieder „aktiv“, eine entzogene Mitgliedschaft wieder
   „aktiv“ mit passender Generation. Deshalb liegt die Autorität — wie beim
   Widerrufbuch der Zugangscodes (E-M6, widerrufbuch.mjs) — AUSSERHALB der
   Ablage, als EIGENE Datei mit eigenem Siegelkontext (ein neuer Abschnitt im
   Buch der Codes bräche dessen Siegel für ältere Fassungen, BE-Vorlage §1.4):

     K  <CENTRIC_ZUSTAND>/konto-widerrufe.json
          { fassung, id, ids,
            konten:     { <Kennung eines Kontos>: { am, grund } },
            mitglieder: { <Kennung Konto×Raum>:  { am, grund, generation } },
            wiederherstellungen: [{ zeit, sicherungErstellt }], siegel }
        Kennungen sind HMAC-Werte (aus CENTRIC_PFEFFER abgeleiteter Schlüssel)
        über die Kontokennung bzw. Kontokennung und Raum — kein Name, keine
        Adresse, keine Raumbezeichnung, kein Prüfwert im Zustandsverzeichnis.
        `generation` ist die MINDESTGENERATION der Beziehung: der Stand des
        Laufs nach dem letzten Entzug. Eine Mitgliedschaft mit kleinerer
        Generation gilt nie wieder.
        Das Siegel ist ein HMAC über die GESAMTE kanonische Datei (alle
        Abschnitte, Schlüssel sortiert, ohne `siegel`). Künftige Abschnitte
        (BE-2: Faktoren, Feeds) bleiben dadurch gesiegelt, und eine Fassung,
        die sie nicht kennt, prüft und erhält sie trotzdem (Erweiterbarkeit
        ohne Siegelbruch); fremde Abschnitte müssen die Gestalt
        { <Kennung>: { … } } haben, sonst gilt die Datei als beschädigt.
     A  centric/kontowiderrufbuch:anker   { id }   (in der Ablage, mitgesichert)
        Fehlt K, obwohl A da ist, ist der Zustand unbekannt (fail-closed).
     N  centric/kontowiderrufbuch:nachtrag (in der Ablage)
        Nur wenn K beim Widerruf nicht geschrieben werden konnte: die Kennungen,
        die noch ins Buch müssen. Global, nicht je Raum — überlebt also auch
        eine Raumlöschung (die die Mitgliedschaft samt Lauf entfernt).

   Semantik (Vereinigung, nur Einschränkungen): Ein Eintrag fügt nur hinzu.
   Mindestgenerationen steigen nur (Maximum), Kontosperren werden nie entfernt.
   Zwei Bücher derselben Umgebung lassen sich deshalb gefahrlos vereinigen
   (`kontobuchVereinen`, Grundlage für BE-3 „widerrufbuch-vereinen“): mehr
   Einträge heißen nie mehr Zugang. Es gibt bewusst KEINEN Weg, einen Eintrag
   zurückzunehmen — ein entsperrtes Konto oder eine Wiederaufnahme ist ein
   eigener, sichtbarer Vorgang (heute gibt es keinen Entsperrweg; eine neue
   Mitgliedschaft nach dem Entzug trägt die neue Generation und gilt).

   Reihenfolge eines Widerrufs (wie E-M6): ZUERST die Ablage (Status bzw. Lauf
   und Status; die Sperre wirkt sofort), DANN K. Scheitert K, bleibt der
   Widerruf wirksam; der Aufrufer bekommt `kontobuch: { geschrieben: false }`
   („Widerruf wirksam, Widerrufbuch nicht beschrieben“ — ein Endpunkt
   antwortet darauf mit 503), N wird angelegt, /gesund warnt, und der nächste
   Widerruf, jeder Serverstart und jede Wiederherstellung mit dem Werkzeug
   tragen nach (einsammeln: Status „gesperrt“, Lauf, Grabstein und N).

   Durchsetzung nach einem Rücksprung:
     Normalisieren (Serverstart, Werkzeug `wiederherstellen --zustand`): Jedes
       Konto aus K wird in der Ablage „gesperrt“; jeder Lauf unter der
       Mindestgeneration wird angehoben; jede Mitgliedschaft unter der
       Mindestgeneration wird „entzogen“. Nur Felder, die jede Fassung kennt —
       auch ein älteres Bild belebt danach nichts.
     Prüfen (Anmeldung, Betriebsauswahl, Arbeits- und Kontositzung,
       Sicherungsschlüssel, Kalenderfeed aus dem Konto): K wird zusätzlich
       gefragt. Ist K nicht prüfbar (fehlt bei vorhandenem A, beschädigt,
       fremd, falsches Siegel): fail-closed — kein Konto-Zugang (503); die
       Zugangscodes hängen NICHT an K (getrennte Bücher).
   Mandantentrennung: Eine entzogene Mitgliedschaft betrifft genau diese
   Beziehung Konto×Raum; eine Kontosperre die Identität (wie accountSperren).
   Kein Eintrag wirkt auf ein anderes Konto oder einen anderen Raum.

   BE-2 Stufe A1 (Betreiberentscheidung 2026-11-14; docs/acc45/ABNAHME-V4-BE2-A1-ZWEITER-FAKTOR.md):
   zwei weitere Abschnitte im SELBEN Buch (gleiches Siegel, gleiche Mechanik,
   eine Fassung ohne sie erhält sie als „künftige Abschnitte“):
     faktorpflicht: { <Kennung „faktor|Konto“>: { am, grund } }
        Ein Konto, dessen zweiter Faktor einmal AKTIV war. Monoton: einmal
        Pflicht, immer Pflicht. Kein Geheimnis, kein Fingerabdruck des
        Geheimnisses, nur die HMAC-Kennung des Kontos.
     whverbraucht:  { <Kennung „whcode|Konto|Einrichtung|Satz|Selektor“>: { am, grund } }
        Ein eingelöster Wiederherstellungscode — gekennzeichnet über seine
        Stelle (Einrichtungsgeneration des Faktors, Satzgeneration, Selektor;
        zweifaktor.mjs), nie über den Code oder seinen Prüfteil.
   Beide sind aus der Ablage einsammelbar (aktiver Faktor, Eintrag mit
   `verbraucht`), Reihenfolge wie oben: ZUERST die Ablage, DANN das Buch,
   bei Fehlschlag Nachtrag N. Durchsetzung: Prüfen (accountanmeldung.mjs:
   Pflicht im Buch, Faktor in der Ablage nicht aktiv → keine Anmeldung, keine
   Neueinrichtung mit dem Passwort; kontofaktor.mjs: Code im Buch → nicht
   eingelöst) und Normalisieren (Serverstart, Werkzeug): ein fehlender
   Pflicht-Faktor wird in der Ablage durch einen GESPERRTEN Platzhalter
   ersetzt (aktiv, ohne Geheimnis — jede Fassung mit Konto-Faktor verlangt
   dann einen Faktor, den es nicht gibt; nie wird ein Geheimnis
   zurückgelegt); ein verbrauchter Code wird in der Ablage als verbraucht
   vermerkt. Stufen A2/A3 (abgelöste Geheimnisse, Feeds) sind weitere
   Abschnitte derselben Gestalt.

   BE-1 Rest „Passwörter“ (Szenario 1a, docs/acc45/ENTSCHEIDUNG-BE1-BE3.md §1.3
   Option A; docs/acc45/ABNAHME-V4-BE1-KONTO-WIDERRUFBUCH.md §8): ein weiterer
   Abschnitt im SELBEN Buch, gleiche Gestalt wie faktorpflicht:
     passwoerter: { <Kennung „passwort|Konto|abgelöster Prüfwert“>: { am, grund } }
        Ein ABGELÖSTER Passwort-Prüfwert (scrypt mit eigenem Salz,
        passwoerter.mjs). Im Buch steht nie das Passwort und nie der Prüfwert,
        nur eine HMAC-Kennung über Konto und Prüfwert (Schlüssel aus dem
        Pfeffer, nicht umkehrbar, ohne Pfeffer nicht nachrechenbar). Ein
        Eintrag entsteht nur bei einer ÄNDERUNG (es gab einen Prüfwert, und
        er war ein anderer) — das erste Passwort trägt nichts ein.
   NICHT einsammelbar: Nach der Änderung kennt die Ablage den alten Prüfwert
   nicht mehr. Reihenfolge deshalb wie oben (ZUERST die Ablage: der neue
   Prüfwert gilt sofort, DANN das Buch); scheitert das Buch, steht die
   Kennung im Nachtrag N (Ablage) und im Speicher, /gesund warnt, der nächste
   Eintrag oder Start trägt nach. Durchsetzung: Prüfen (accountanmeldung.mjs
   nach dem richtigen Passwort, einladungen.mjs bei der Passwortbestätigung:
   Prüfwert im Buch → dieselbe Absage wie ein falsches Passwort; Buch nicht
   prüfbar → wirft, fail-closed) und Normalisieren (Serverstart, Werkzeug):
   ein Konto, dessen Prüfwert im Buch steht, bekommt in der Ablage
   `passwort: null` — ein Feld, das jede Fassung kennt (ohne Prüfwert keine
   Anmeldung, auch nicht im Altbild); die betroffene Person setzt ihr
   Passwort neu. Es wird nie ein Eintrag entfernt: auch nicht, wenn das Konto
   fehlt (eine ältere Sicherung kann es samt altem Prüfwert zurückbringen).
   ========================================================================== */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

export const KONTOBUCH_DATEI = "konto-widerrufe.json";
export const KONTOBUCH_ANKER = "kontowiderrufbuch:anker";
export const KONTOBUCH_NACHTRAG = "kontowiderrufbuch:nachtrag";
/** Präfixe der Ablage (accounts.mjs) — hier wiederholt, weil accounts.mjs dieses Modul lädt. */
export const ACCOUNT_PRAEFIX = "account:";
export const MITGLIED_PRAEFIX = "mitglied:";
export const MITGLIEDLAUF_PRAEFIX = "mitgliedlauf:";
/** BE-2 A1: Abschnitte im Buch. */
export const FAKTORPFLICHT = "faktorpflicht";
export const WHVERBRAUCHT = "whverbraucht";
/** BE-1 Rest: abgelöste Passwort-Prüfwerte (nur HMAC-Kennungen). */
export const PASSWOERTER = "passwoerter";
/** Abschnitte gleicher Gestalt { <Kennung>: { am, grund } }: nur hinzufügen, im Nachtrag mitgeführt. */
const ABSCHNITTE = [FAKTORPFLICHT, WHVERBRAUCHT, PASSWOERTER];
/** BE-2 A1: Ablageschlüssel des Faktors (zweifaktor.mjs) — hier wiederholt wie die Präfixe oben (kontofaktor.mjs lädt dieses Modul). */
export const FAKTOR_PRAEFIX = "zweifaktor:";
/** Wie kontofaktor.mjs `kontoFaktorId` (Gleichheit belegt die Prüfung be2-a1). @param {string} accountId */
export const kontoFaktorSchluessel = (accountId) =>
  `${FAKTOR_PRAEFIX}${createHash("sha256").update(`konto-account:${String(accountId)}`).digest("hex")}`;
/** Der gesperrte Platzhalter für einen Pflicht-Faktor, der in der Ablage fehlt: aktiv, ohne Geheimnis, ohne Codes. */
export const sperrFaktor = (am) => ({ stand: "aktiv", ruecksprungSperre: true, geheimnis: null, letzterSchritt: -1,
  wiederherstellung: null, aktiviert: am, generation: "ruecksprung-sperre" });
/** Der Text für einen Aufrufer, dessen Widerruf wirkt, dessen Bucheintrag aber scheiterte (wie E-M6). */
export const KONTOBUCH_NICHT_BESCHRIEBEN = "Widerruf wirksam, Widerrufbuch nicht beschrieben.";
const FASSUNG = 1;
const ID_FORM = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const BEKANNT = new Set(["fassung", "id", "ids", "konten", "mitglieder", "wiederherstellungen", "siegel"]);
const zufall = () => randomBytes(16).toString("hex");
const istMap = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const ganz = (n) => Number.isInteger(n) && n >= 1;

export class KontoWiderrufbuchFehler extends Error {
  /** @param {string} m */
  constructor(m) {
    super(m);
    /* Wie WiderrufbuchFehler (E-M6): ein Zustand, der nichts erlaubt — vorübergehend (→ 503), kein 401. */
    this.code = "BESTAND_UNLESBAR";
    this.kontobuch = true;
  }
}

const pfefferJetzt = (p) => (p === undefined ? process.env.CENTRIC_PFEFFER || "" : p);
/** Siegelschlüssel und Kennungsschlüssel: aus dem Pfeffer abgeleitet, getrennte Kontexte, nie der Pfeffer selbst. */
const siegelSchluessel = (pfeffer) => createHash("sha256").update(`centric-kontowiderrufe-v1:${pfefferJetzt(pfeffer)}`).digest();
const kennungsSchluessel = (pfeffer) => createHash("sha256").update(`centric-kontowiderrufe-kennung-v1:${pfefferJetzt(pfeffer)}`).digest();

/** Die Kennung eines Kontos im Buch. @param {string} accountId @param {string} [pfeffer] */
export const kontoKennung = (accountId, pfeffer) =>
  createHmac("sha256", kennungsSchluessel(pfeffer)).update(`konto|${String(accountId)}`).digest("hex");
/** Die Kennung der Beziehung Konto×Raum im Buch. @param {string} accountId @param {string} raum @param {string} [pfeffer] */
export const mitgliedKennung = (accountId, raum, pfeffer) =>
  createHmac("sha256", kennungsSchluessel(pfeffer)).update(`mitglied|${String(accountId)}|${String(raum)}`).digest("hex");
/** BE-2 A1: Kennung „Faktor dieses Kontos ist Pflicht“. @param {string} accountId @param {string} [pfeffer] */
export const faktorPflichtKennung = (accountId, pfeffer) =>
  createHmac("sha256", kennungsSchluessel(pfeffer)).update(`faktor|${String(accountId)}`).digest("hex");
/**
 * BE-2 A1: Kennung eines Wiederherstellungscodes über seine Stelle — nie über den Code.
 * @param {string} accountId @param {{bindung: string, generation: number, sel: string}} k @param {string} [pfeffer]
 */
export const whCodeKennung = (accountId, { bindung, generation, sel }, pfeffer) =>
  createHmac("sha256", kennungsSchluessel(pfeffer))
    .update(`whcode|${String(accountId)}|${String(bindung)}|${String(generation)}|${String(sel)}`).digest("hex");
/**
 * BE-1 Rest: Kennung eines abgelösten Passwort-Prüfwerts — HMAC über Konto und Prüfwert, nie der Prüfwert selbst.
 * @param {string} accountId @param {string} pruefwert @param {string} [pfeffer]
 */
export const passwortKennung = (accountId, pruefwert, pfeffer) =>
  createHmac("sha256", kennungsSchluessel(pfeffer)).update(`passwort|${String(accountId)}|${String(pruefwert)}`).digest("hex");
/** Trägt das Konto einen Prüfwert im heutigen Format (wie accountanmeldung.mjs)? */
const hatPruefwert = (a) => istMap(a) && typeof a.passwort === "string" && a.passwort.startsWith("s1$");

/** Kanonische Form: Schlüssel rekursiv sortiert, ohne `siegel`. */
function kanonisch(o) {
  const ordnen = (v) => {
    if (Array.isArray(v)) return v.map(ordnen);
    if (istMap(v)) { const a = {}; for (const k of Object.keys(v).sort()) a[k] = ordnen(v[k]); return a; }
    return v;
  };
  const rest = { ...o };
  delete rest.siegel;
  return JSON.stringify(ordnen(rest));
}

/** @param {any} b @param {string} [pfeffer] */
export function kontobuchSiegel(b, pfeffer) {
  return createHmac("sha256", siegelSchluessel(pfeffer)).update(kanonisch(b)).digest("hex");
}

/** Gestalt und Siegel prüfen. Wirft bei jedem Befund. */
export function kontobuchPruefen(o, pfeffer) {
  const kaputt = (w) => new KontoWiderrufbuchFehler(`Konto-Widerrufbuch ${KONTOBUCH_DATEI} ${w} — kein Konto-Zugang gilt, bis das geklärt ist (BEREITSTELLUNG.md §5.4).`);
  if (!istMap(o) || o.fassung !== FASSUNG || !ID_FORM.test(o.id) || !Array.isArray(o.ids)
    || !o.ids.every((i) => ID_FORM.test(i)) || !o.ids.includes(o.id)
    || !istMap(o.konten) || !istMap(o.mitglieder) || !Array.isArray(o.wiederherstellungen)
    || typeof o.siegel !== "string" || !HEX64.test(o.siegel))
    throw kaputt("ist beschädigt");
  for (const [k, v] of Object.entries(o.konten)) if (!HEX64.test(k) || !istMap(v)) throw kaputt("ist beschädigt");
  for (const [k, v] of Object.entries(o.mitglieder))
    if (!HEX64.test(k) || !istMap(v) || !ganz(v.generation)) throw kaputt("ist beschädigt");
  for (const w of o.wiederherstellungen) if (!istMap(w)) throw kaputt("ist beschädigt");
  /* Künftige Abschnitte (BE-2): nur in der Gestalt { <Kennung>: { … } }; gesiegelt sind sie ohnehin. */
  for (const k of Object.keys(o)) {
    if (BEKANNT.has(k)) continue;
    if (!/^[a-z][a-z0-9]{1,31}$/.test(k) || !istMap(o[k])) throw kaputt("ist beschädigt");
    for (const [h, v] of Object.entries(o[k])) if (!HEX64.test(h) || !istMap(v)) throw kaputt("ist beschädigt");
  }
  const soll = Buffer.from(kontobuchSiegel(o, pfeffer), "hex");
  if (!timingSafeEqual(soll, Buffer.from(o.siegel, "hex"))) throw kaputt("trägt ein falsches Siegel (verändert oder anderer Pfeffer)");
  return o;
}

/** K lesen. null: Datei fehlt. Unlesbar, beschädigt, falsches Siegel: wirft. @param {string} verz @param {{pfeffer?: string}} [o] */
export async function kontobuchLesen(verz, { pfeffer } = {}) {
  let roh;
  try { roh = await readFile(path.join(verz, KONTOBUCH_DATEI), "utf8"); }
  catch (e) {
    if (/** @type {any} */ (e).code === "ENOENT") return null;
    throw new KontoWiderrufbuchFehler(`Konto-Widerrufbuch nicht lesbar (${/** @type {any} */ (e).code || e}).`);
  }
  let o = null;
  try { o = JSON.parse(roh); } catch { /* unten */ }
  return kontobuchPruefen(o, pfeffer);
}

/** Ein neues, leeres Buch (noch nicht geschrieben). */
export function kontobuchNeu() {
  const id = zufall();
  return { fassung: FASSUNG, id, ids: [id], konten: {}, mitglieder: {}, wiederherstellungen: [], siegel: "" };
}

/** K atomar schreiben (Zwischendatei, fsync, Umbenennen, Verzeichnis-fsync), Dateirechte 0600.
    @param {string} verz @param {any} b @param {{pfeffer?: string}} [o] */
export async function kontobuchSchreiben(verz, b, { pfeffer } = {}) {
  const fertig = { ...b, siegel: "" };
  fertig.siegel = kontobuchSiegel(fertig, pfeffer);
  try {
    await mkdir(verz, { recursive: true, mode: 0o700 });
    const ziel = path.join(verz, KONTOBUCH_DATEI);
    const tmp = `${ziel}.${process.pid}.${zufall()}.tmp`;
    const fh = await open(tmp, "wx", 0o600);
    try { await fh.writeFile(JSON.stringify(fertig)); await fh.sync(); } finally { await fh.close(); }
    try { await rename(tmp, ziel); } catch (e) { await rm(tmp, { force: true }); throw e; }
    try { const dh = await open(verz, "r"); try { await dh.sync(); } finally { await dh.close(); } } catch { /* Windows */ }
  } catch (e) {
    throw new KontoWiderrufbuchFehler(`Konto-Widerrufbuch nicht schreibbar (${/** @type {any} */ (e).code || e}).`);
  }
  return fertig;
}

/* ---------------------------------------------------------------------------
   Reine Bausteine: eintragen (nur hinzufügen), einsammeln, vereinen, normalisieren
   --------------------------------------------------------------------------- */

/** Konten (Kennungen) als gesperrt eintragen. Zahl der neuen Einträge. */
export function kontenEintragen(b, kennungen, grund, am = new Date().toISOString()) {
  let neu = 0;
  for (const h of kennungen) {
    if (typeof h !== "string" || !HEX64.test(h))
      throw new KontoWiderrufbuchFehler("Eine Kontokennung hat eine unbekannte Form und lässt sich nicht widerrufen.");
    if (Object.hasOwn(b.konten, h)) continue;
    b.konten[h] = { am, grund: String(grund).slice(0, 40) };
    neu++;
  }
  return neu;
}

/** Mindestgenerationen eintragen oder anheben (nie senken). Zahl der Änderungen. */
export function mitgliederEintragen(b, liste, grund, am = new Date().toISOString()) {
  let neu = 0;
  for (const { kennung, generation } of liste) {
    if (typeof kennung !== "string" || !HEX64.test(kennung) || !ganz(generation))
      throw new KontoWiderrufbuchFehler("Eine Mitgliedschaft hat eine unbekannte Form und lässt sich nicht widerrufen.");
    const da = b.mitglieder[kennung];
    if (da && da.generation >= generation) continue;
    b.mitglieder[kennung] = da ? { ...da, generation } : { am, grund: String(grund).slice(0, 40), generation };
    neu++;
  }
  return neu;
}

/**
 * BE-2 A1: Kennungen in einen Abschnitt (faktorpflicht, whverbraucht) eintragen — nur hinzufügen. Zahl der neuen.
 * @param {any} b @param {string} abschnitt @param {Iterable<string>} kennungen @param {string} grund @param {string} [am]
 */
export function abschnittEintragen(b, abschnitt, kennungen, grund, am = new Date().toISOString()) {
  if (!ABSCHNITTE.includes(abschnitt))
    throw new KontoWiderrufbuchFehler("Unbekannter Abschnitt des Konto-Widerrufbuchs.");
  let neu = 0;
  for (const h of kennungen) {
    if (typeof h !== "string" || !HEX64.test(h))
      throw new KontoWiderrufbuchFehler("Eine Kennung hat eine unbekannte Form und lässt sich nicht eintragen.");
    if (!istMap(b[abschnitt])) b[abschnitt] = {};
    if (Object.hasOwn(b[abschnitt], h)) continue;
    b[abschnitt][h] = { am, grund: String(grund).slice(0, 40) };
    neu++;
  }
  return neu;
}

/** Steht die Kennung im Abschnitt? @param {any} b @param {string} abschnitt @param {string} h */
const imAbschnitt = (b, abschnitt, h) => istMap(b[abschnitt]) && Object.hasOwn(b[abschnitt], h);

/** Fassung 2 der Wiederherstellungscodes (zweifaktor.mjs) mit Einträgen. */
const whFassung2 = (w) => istMap(w) && w.v === 2 && Number.isInteger(w.generation) && Array.isArray(w.eintraege);

/**
 * @typedef {{ konten: Array<{schluessel: string, wert: any}>, mitglieder: Array<{schluessel: string, wert: any}>,
 *   laeufe: Array<{schluessel: string, wert: any}>, faktoren?: Array<{schluessel: string, wert: any, accountId: string}>,
 *   nachtrag?: any }} KontoStand
 *   Was die Ablage über Konten, Mitgliedschaften, Läufe und (BE-2 A1) die Faktoren der Konten weiß.
 */

/** Die eintragbaren Teile eines Nachtrags N; alles andere: keine. */
export function nachtragTeile(n) {
  const konten = istMap(n) && istMap(n.konten) ? Object.keys(n.konten).filter((h) => HEX64.test(h)) : [];
  const mitglieder = istMap(n) && istMap(n.mitglieder)
    ? Object.entries(n.mitglieder).filter(([h, v]) => HEX64.test(h) && istMap(v) && ganz(v.generation))
      .map(([kennung, v]) => ({ kennung, generation: v.generation })) : [];
  const schluessel = (a) => (istMap(n) && istMap(n[a]) ? Object.keys(n[a]).filter((h) => HEX64.test(h)) : []);
  return { konten, mitglieder, ...Object.fromEntries(ABSCHNITTE.map((a) => [a, schluessel(a)])) };
}

/**
 * BE-2 A1: Was die Faktoren der Ablage selbst kennen — aktiver Faktor (auch ein gesperrter Platzhalter) → Pflicht;
 * Wiederherstellungscode mit `verbraucht` → verbraucht.
 * @param {KontoStand} stand @param {string} [pfeffer]
 */
function faktorenEinsammeln(stand, pfeffer) {
  const pflicht = [], verbraucht = [];
  for (const { wert: e, accountId } of stand.faktoren || []) {
    if (!istMap(e) || typeof accountId !== "string" || !accountId) continue;
    if (e.stand === "aktiv") pflicht.push(faktorPflichtKennung(accountId, pfeffer));
    const w = e.wiederherstellung;
    if (!whFassung2(w)) continue;
    for (const x of w.eintraege)
      if (istMap(x) && x.verbraucht && typeof x.sel === "string")
        verbraucht.push(whCodeKennung(accountId, { bindung: String(e.generation ?? ""), generation: w.generation, sel: x.sel }, pfeffer));
  }
  return { pflicht, verbraucht };
}

/**
 * Was die Ablage selbst als gesperrt bzw. entzogen kennt, ins Buch übernehmen:
 *   Konto mit Status „gesperrt“                → konten
 *   Lauf mit Generation ≥ 2 (es gab einen Entzug) → Mindestgeneration = Lauf
 *   Grabstein (Mitgliedschaft „entzogen“, Generation g) → Mindestgeneration ≥ g + 1
 *   Nachtrag N                                  → wie eingetragen
 * Die Mindestgeneration aus dem Lauf entwertet nie eine gültige Mitgliedschaft (die trägt genau den Lauf).
 * @param {any} b @param {KontoStand} stand @param {{pfeffer?: string}} [o]  Zahl der Änderungen
 */
export function kontobuchEinsammeln(b, stand, { pfeffer } = {}) {
  const gesperrt = [];
  for (const { wert: a } of stand.konten || [])
    if (istMap(a) && typeof a.id === "string" && a.id && a.status === "gesperrt") gesperrt.push(kontoKennung(a.id, pfeffer));
  const mind = [];
  for (const { wert: l } of stand.laeufe || [])
    if (istMap(l) && typeof l.accountId === "string" && l.accountId && typeof l.raum === "string" && l.raum
      && ganz(l.generation) && l.generation >= 2)
      mind.push({ kennung: mitgliedKennung(l.accountId, l.raum, pfeffer), generation: l.generation });
  for (const { wert: m } of stand.mitglieder || [])
    if (istMap(m) && m.status === "entzogen" && typeof m.accountId === "string" && m.accountId
      && typeof m.raum === "string" && m.raum)
      mind.push({ kennung: mitgliedKennung(m.accountId, m.raum, pfeffer), generation: (ganz(m.generation) ? m.generation : 1) + 1 });
  const n = nachtragTeile(stand.nachtrag);
  const f = faktorenEinsammeln(stand, pfeffer);
  return kontenEintragen(b, [...gesperrt, ...n.konten], "aus-ablage") + mitgliederEintragen(b, [...mind, ...n.mitglieder], "aus-ablage")
    + abschnittEintragen(b, FAKTORPFLICHT, [...f.pflicht, ...n[FAKTORPFLICHT]], "aus-ablage")
    + abschnittEintragen(b, WHVERBRAUCHT, [...f.verbraucht, ...n[WHVERBRAUCHT]], "aus-ablage")
    /* BE-1 Rest: abgelöste Prüfwerte kennt die Ablage nicht mehr — nur der Nachtrag trägt sie. */
    + abschnittEintragen(b, PASSWOERTER, n[PASSWOERTER], "aus-nachtrag");
}

/**
 * Vereinigung zweier Bücher DERSELBEN Umgebung (beide geprüft): `quelle` in `ziel` — nur hinzufügen, Mindest-
 * generationen als Maximum, früheste Zeit bleibt. Künftige Abschnitte: Einträge, die fehlen, kommen hinzu. Grundlage
 * für BE-3 (`widerrufbuch-vereinen`); entfernt nie etwas. Zahl der Änderungen.
 */
export function kontobuchVereinen(ziel, quelle) {
  let neu = 0;
  for (const [h, v] of Object.entries(quelle.konten)) if (!Object.hasOwn(ziel.konten, h)) { ziel.konten[h] = { ...v }; neu++; }
  for (const [h, v] of Object.entries(quelle.mitglieder)) {
    const da = ziel.mitglieder[h];
    if (!da) { ziel.mitglieder[h] = { ...v }; neu++; }
    else if (v.generation > da.generation) { ziel.mitglieder[h] = { ...da, generation: v.generation }; neu++; }
  }
  for (const k of Object.keys(quelle)) {
    if (BEKANNT.has(k) || !istMap(quelle[k])) continue;
    if (!istMap(ziel[k])) ziel[k] = {};
    for (const [h, v] of Object.entries(quelle[k])) if (!Object.hasOwn(ziel[k], h)) { ziel[k][h] = v; neu++; }
  }
  for (const id of quelle.ids) if (!ziel.ids.includes(id)) ziel.ids.push(id);
  return neu;
}

/**
 * Was in der Ablage nach dem Buch nachzuziehen ist (nur Felder, die jede Fassung kennt):
 *   konten:     Konto steht im Buch, ist aber nicht „gesperrt“             → status: "gesperrt"
 *   laeufe:     Lauf unter der Mindestgeneration (oder fehlt neben einer Mitgliedschaft) → generation: Mindestwert
 *   mitglieder: Mitgliedschaft unter der Mindestgeneration und nicht „entzogen“ → status: "entzogen"
 * @param {any} b @param {KontoStand} stand @param {{pfeffer?: string, am?: string}} [o]
 *   passwort:   (BE-1 Rest) Prüfwert des Kontos steht im Buch als abgelöst → passwort: null, epoche + 1
 * `gesperrt` und `passwoerter` zählen die Konten je Grund (ein Konto kann beides sein und steht einmal in `konten`).
 * @returns {{konten: Array<{schluessel: string, wert: any}>, laeufe: Array<{schluessel: string, wert: any}>,
 *   mitglieder: Array<{schluessel: string, wert: any}>, faktoren: Array<{schluessel: string, wert: any}>,
 *   gesperrt: number, passwoerter: number}}
 */
export function kontobuchNormalisieren(b, stand, { pfeffer, am = new Date().toISOString() } = {}) {
  const konten = [];
  let gesperrt = 0, passwoerter = 0;
  for (const { schluessel, wert: a } of stand.konten || []) {
    if (!istMap(a) || typeof a.id !== "string") continue;
    const sperren = Object.hasOwn(b.konten, kontoKennung(a.id, pfeffer)) && a.status !== "gesperrt";
    /* BE-1 Rest: Prüfwert im Buch als abgelöst → `passwort: null` (jede Fassung kennt das: keine Anmeldung). */
    const abgeloest = hatPruefwert(a) && imAbschnitt(b, PASSWOERTER, passwortKennung(a.id, a.passwort, pfeffer));
    if (!sperren && !abgeloest) continue;
    gesperrt += sperren ? 1 : 0;
    passwoerter += abgeloest ? 1 : 0;
    /* Review MITTEL-1: zusammen mit `passwort: null` die Kontoepoche erhöhen. Ein VM-/Verzeichnis-Image bringt Epoche
       UND Kontositzungen zurück; eine Sitzung, die mit dem abgelösten Passwort entstand, passte sonst wieder. */
    konten.push({ schluessel, wert: { ...a, ...(sperren ? { status: "gesperrt" } : {}),
      ...(abgeloest ? { passwort: null, epoche: (Number(a.epoche) || 1) + 1 } : {}), aktualisiert: am } });
  }
  const mindestens = (accountId, raum) => {
    const e = b.mitglieder[mitgliedKennung(accountId, raum, pfeffer)];
    return e ? e.generation : 0;
  };
  const laeufe = [];
  const laufDa = new Set();
  for (const { schluessel, wert: l } of stand.laeufe || []) {
    if (!istMap(l) || typeof l.accountId !== "string" || typeof l.raum !== "string") continue;
    laufDa.add(`${l.accountId}\u0000${l.raum}`);
    const g = mindestens(l.accountId, l.raum);
    if (g && !(ganz(l.generation) && l.generation >= g))
      laeufe.push({ schluessel, wert: { accountId: l.accountId, raum: l.raum, generation: g } });
  }
  const mitglieder = [];
  for (const { schluessel, wert: m } of stand.mitglieder || []) {
    if (!istMap(m) || typeof m.accountId !== "string" || typeof m.raum !== "string") continue;
    const g = mindestens(m.accountId, m.raum);
    if (!g) continue;
    if (!laufDa.has(`${m.accountId}\u0000${m.raum}`)) {
      laufDa.add(`${m.accountId}\u0000${m.raum}`);
      laeufe.push({ schluessel: `${MITGLIEDLAUF_PRAEFIX}${m.accountId}:${m.raum}`, wert: { accountId: m.accountId, raum: m.raum, generation: g } });
    }
    if (m.status !== "entzogen" && !(ganz(m.generation) && m.generation >= g))
      mitglieder.push({ schluessel, wert: { ...m, status: "entzogen", entzogenAm: m.entzogenAm || am } });
  }
  return { konten, laeufe, mitglieder, faktoren: faktorenNormalisieren(b, stand, { pfeffer, am }), gesperrt, passwoerter };
}

/**
 * BE-2 A1: Faktoren der Ablage nach dem Buch nachziehen.
 *   Pflicht im Buch, Faktor fehlt oder ist nicht aktiv → gesperrter Platzhalter (sperrFaktor): kein Geheimnis wird
 *     zurückgelegt; jede Fassung mit Konto-Faktor verlangt einen Faktor, den es nicht gibt (fail-closed, altbildfest).
 *   Wiederherstellungscode im Buch verbraucht, in der Ablage nicht → als verbraucht vermerkt (Zähler mit).
 * Nur Konten, die die Ablage kennt; nichts an einem Konto ohne Eintrag im Buch.
 * @param {any} b @param {KontoStand} stand @param {{pfeffer?: string, am?: string}} [o]
 * @returns {Array<{schluessel: string, wert: any}>}
 */
export function faktorenNormalisieren(b, stand, { pfeffer, am = new Date().toISOString() } = {}) {
  const aus = [];
  const faktorVon = new Map((stand.faktoren || []).map((f) => [f.accountId, f.wert]));
  const gesehen = new Set();
  for (const { wert: a } of stand.konten || []) {
    if (!istMap(a) || typeof a.id !== "string" || !a.id || gesehen.has(a.id)) continue;
    gesehen.add(a.id);
    const schluessel = kontoFaktorSchluessel(a.id);
    const e = faktorVon.get(a.id);
    const aktiv = istMap(e) && e.stand === "aktiv";
    if (imAbschnitt(b, FAKTORPFLICHT, faktorPflichtKennung(a.id, pfeffer)) && !aktiv) {
      aus.push({ schluessel, wert: sperrFaktor(am) });
      continue;
    }
    if (!aktiv || !whFassung2(e.wiederherstellung)) continue;
    const w = e.wiederherstellung;
    let n = 0;
    const eintraege = w.eintraege.map((x) => {
      if (!istMap(x) || x.verbraucht || typeof x.sel !== "string") return x;
      const h = whCodeKennung(a.id, { bindung: String(e.generation ?? ""), generation: w.generation, sel: x.sel }, pfeffer);
      if (!imAbschnitt(b, WHVERBRAUCHT, h)) return x;
      n++;
      return { ...x, verbraucht: am };
    });
    if (n) aus.push({ schluessel, wert: { ...e, wiederherstellung: { ...w, eintraege,
      verbrauchtZahl: (Number.isInteger(w.verbrauchtZahl) ? w.verbrauchtZahl : 0) + n } } });
  }
  return aus;
}

/* ---------------------------------------------------------------------------
   Im Server: eine Reihe je Prozess, Zwischenspeicher nach Dateistand, Lage für /gesund
   --------------------------------------------------------------------------- */

/** @type {Promise<any>} */
let reihe = Promise.resolve();
/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
function nacheinander(fn) {
  const r = reihe.then(fn, fn);
  reihe = r.catch(() => {});
  return r;
}

const lage = { unklar: false, nachtrag: false };
/** Für /gesund (Prüfung „kontowiderrufbuch“). Nur Zustände, keine Kennungen. @returns {{stufe: "ok"|"warnung", text?: string}} */
export function kontoWiderrufbuchLage() {
  if (lage.unklar) return { stufe: "warnung", text: "Konto-Widerrufbuch nicht prüfbar: kein Konto-Zugang gilt (BEREITSTELLUNG.md §5.4)" };
  if (lage.nachtrag) return { stufe: "warnung", text: "Widerruf wirksam, Konto-Widerrufbuch nicht beschrieben (Nachtrag offen)" };
  return { stufe: "ok" };
}
/** @template T @param {Promise<T>} p @param {{schreibt?: boolean}} [o] @returns {Promise<T>} */
async function vermerken(p, { schreibt = false } = {}) {
  try {
    const r = await p;
    lage.unklar = false;
    if (schreibt) lage.nachtrag = false;
    return r;
  } catch (e) {
    if (schreibt) lage.nachtrag = true; else lage.unklar = true;
    throw e;
  }
}

/** Nachtrag im Speicher (falls schon das Schreiben von N scheiterte). */
const imSpeicher = { konten: new Set(), mitglieder: /** @type {Map<string, number>} */ (new Map()),
  [FAKTORPFLICHT]: new Set(), [WHVERBRAUCHT]: new Set(), [PASSWOERTER]: new Set() };

let zwischen = /** @type {{marke: string, buch: any}|null} */ (null);

async function verzeichnis() {
  const { zustandsVerzeichnis } = await import("./schluesselepoche.mjs");
  try { return zustandsVerzeichnis(); }
  catch (e) { throw new KontoWiderrufbuchFehler(/** @type {Error} */ (e).message); }
}

async function markeVon() {
  const verz = await verzeichnis();
  try {
    const st = await stat(path.join(verz, KONTOBUCH_DATEI));
    return `${verz}|${st.size}|${st.mtimeMs}|${st.ino}`;
  } catch { return null; }
}

async function ankerLesen(store) {
  try {
    const a = await store.get(KONTOBUCH_ANKER, { type: "json" });
    if (a === null || a === undefined) return null;
    if (!istMap(a) || !ID_FORM.test(a.id)) throw new Error("Anker beschädigt");
    return a;
  } catch (e) { throw new KontoWiderrufbuchFehler(`Anker des Konto-Widerrufbuchs nicht lesbar (${/** @type {any} */ (e).message || e}).`); }
}

/** Konten, Mitgliedschaften, Läufe und Nachtrag der Ablage — streng (ein Lesefehler wirft, nie „leer“). */
async function ablageStand(store) {
  try {
    /** @type {(praefix: string) => Promise<Array<{schluessel: string, wert: any}>>} */
    const alle = async (praefix) => {
      const aus = [];
      for (const b of (await store.list({ prefix: praefix })).blobs) {
        const wert = await store.get(b.key, { type: "json" });
        if (wert !== null && wert !== undefined) aus.push({ schluessel: b.key, wert });
      }
      return aus;
    };
    const n = await store.get(KONTOBUCH_NACHTRAG, { type: "json" });
    const speicher = { konten: Object.fromEntries([...imSpeicher.konten].map((h) => [h, {}])),
      mitglieder: Object.fromEntries([...imSpeicher.mitglieder].map(([h, g]) => [h, { generation: g }])) };
    const t = nachtragTeile(n);
    const nachtrag = { konten: { ...speicher.konten, ...Object.fromEntries(t.konten.map((h) => [h, {}])) },
      mitglieder: { ...speicher.mitglieder } };
    for (const m of t.mitglieder)
      if (!nachtrag.mitglieder[m.kennung] || nachtrag.mitglieder[m.kennung].generation < m.generation)
        nachtrag.mitglieder[m.kennung] = { generation: m.generation };
    for (const a of ABSCHNITTE)
      nachtrag[a] = Object.fromEntries([...imSpeicher[a], ...t[a]].map((h) => [h, {}]));
    const konten = await alle(ACCOUNT_PRAEFIX);
    /* BE-2 A1: der Faktor jedes Kontos (streng wie oben: ein Lesefehler wirft). */
    const faktoren = [];
    for (const { wert: a } of konten) {
      if (!istMap(a) || typeof a.id !== "string" || !a.id) continue;
      const schluessel = kontoFaktorSchluessel(a.id);
      const wert = await store.get(schluessel, { type: "json" });
      if (wert !== null && wert !== undefined) faktoren.push({ schluessel, wert, accountId: a.id });
    }
    return { konten, mitglieder: await alle(MITGLIED_PRAEFIX), laeufe: await alle(MITGLIEDLAUF_PRAEFIX), faktoren,
      nachtrag, nachtragDa: n !== null && n !== undefined };
  } catch (e) { throw new KontoWiderrufbuchFehler(`Konten nicht lesbar (${/** @type {any} */ (e).message || e}).`); }
}

/** Stand feststellen (in der Reihe). Beim allerersten Mal: anlegen, aus der Ablage eingesammelt. */
async function standJetzt(store) {
  const verz = await verzeichnis();
  const buch = await kontobuchLesen(verz);
  const anker = await ankerLesen(store);
  if (buch) {
    if (anker && !buch.ids.includes(anker.id))
      throw new KontoWiderrufbuchFehler("Konto-Widerrufbuch gehört nicht zu dieser Ablage (Kennung des Ankers unbekannt).");
    if (!anker) await store.setJSON(KONTOBUCH_ANKER, { id: buch.id });
    return buch;
  }
  if (anker) throw new KontoWiderrufbuchFehler("Konto-Widerrufbuch fehlt, obwohl die Ablage eines kennt.");
  const neu = kontobuchNeu();
  kontobuchEinsammeln(neu, await ablageStand(store));
  const geschrieben = await kontobuchSchreiben(verz, neu);
  await store.setJSON(KONTOBUCH_ANKER, { id: geschrieben.id });
  return geschrieben;
}

/** Das geprüfte Buch (mit Zwischenspeicher). Wirft KontoWiderrufbuchFehler. @param {any} store */
export async function kontobuchGeprueft(store) {
  const m = await markeVon();
  if (m && zwischen && zwischen.marke === m) return zwischen.buch;
  return vermerken(nacheinander(async () => {
    const buch = await standJetzt(store);
    const marke = await markeVon();
    zwischen = marke ? { marke, buch } : null;
    return buch;
  }));
}

/**
 * Sperrt das Buch diesen Zugang? `null`: nein. Sonst der Grund („konto-widerrufen“, „mitglied-widerrufen“). Mit `raum`
 * zusätzlich die Mitgliedschaft (Generation, die sie trägt). Wirft, wenn das Buch nicht prüfbar ist (fail-closed:
 * der Aufrufer gewährt nichts).
 * @param {any} store @param {string} accountId @param {{raum?: string, generation?: unknown}} [o]
 */
export async function kontoZugangImBuch(store, accountId, { raum, generation } = {}) {
  const b = await kontobuchGeprueft(store);
  if (Object.hasOwn(b.konten, kontoKennung(accountId))) return "konto-widerrufen";
  if (typeof raum === "string" && raum) {
    const e = b.mitglieder[mitgliedKennung(accountId, raum)];
    if (e && !(ganz(generation) && /** @type {number} */ (generation) >= e.generation)) return "mitglied-widerrufen";
  }
  return null;
}

async function nachtragAbraeumen(store, a) {
  imSpeicher.konten.clear();
  imSpeicher.mitglieder.clear();
  for (const x of ABSCHNITTE) imSpeicher[x].clear();
  if (a.nachtragDa) { try { await store.delete(KONTOBUCH_NACHTRAG); } catch { /* bleibt: wird erneut eingesammelt */ } }
}

/** Buch fortschreiben: frischer Stand, einsammeln (holt frühere Fehlschläge nach), ändern, schreiben. In der Reihe. */
function fortschreiben(store, aendern) {
  return vermerken(nacheinander(async () => {
    const verz = await verzeichnis();
    const b = structuredClone(await standJetzt(store));
    const a = await ablageStand(store);
    const n = kontobuchEinsammeln(b, a);
    const geaendert = aendern(b);
    if (n || geaendert) {
      const geschrieben = await kontobuchSchreiben(verz, b);
      const marke = await markeVon();
      zwischen = marke ? { marke, buch: geschrieben } : null;
    }
    await nachtragAbraeumen(store, a);
  }), { schreibt: true });
}

/**
 * Nachtrag festhalten (Bucheintrag scheiterte): im Speicher und in der Ablage (N). Wirft nie; scheitert auch N, hält
 * der Speicher den Nachtrag bis zum nächsten gelungenen Schreiben des Buchs, und /gesund warnt.
 */
async function nachtragAufnehmen(store, { konten = [], mitglieder = [], abschnitte = {} }) {
  for (const h of konten) imSpeicher.konten.add(h);
  for (const m of mitglieder) imSpeicher.mitglieder.set(m.kennung, Math.max(imSpeicher.mitglieder.get(m.kennung) || 0, m.generation));
  for (const a of ABSCHNITTE) for (const h of abschnitte[a] || []) imSpeicher[a].add(h);
  lage.nachtrag = true;
  try {
    await nacheinander(async () => {
      const alt = await store.get(KONTOBUCH_NACHTRAG, { type: "json" });
      const t = nachtragTeile(alt);
      const am = new Date().toISOString();
      /** @type {{konten: Record<string, any>, mitglieder: Record<string, any>, [k: string]: Record<string, any>}} */
      const neu = { konten: Object.fromEntries(t.konten.map((h) => [h, { am }])),
        mitglieder: Object.fromEntries(t.mitglieder.map((m) => [m.kennung, { am, generation: m.generation }])) };
      for (const a of ABSCHNITTE) {
        const alle = [...t[a], ...(abschnitte[a] || [])];
        if (alle.length) neu[a] = Object.fromEntries(alle.map((h) => [h, { am }]));
      }
      for (const h of konten) if (!neu.konten[h]) neu.konten[h] = { am };
      for (const m of mitglieder)
        if (!neu.mitglieder[m.kennung] || neu.mitglieder[m.kennung].generation < m.generation)
          neu.mitglieder[m.kennung] = { am, generation: m.generation };
      await store.setJSON(KONTOBUCH_NACHTRAG, neu);
    });
  } catch { /* der Speicher hält ihn */ }
}

/**
 * Nach `accountSperren` (die Ablage ist schon gesperrt): die Sperre ins Buch. Wirft nie.
 * @param {any} store @param {string} accountId
 * @returns {Promise<{geschrieben: boolean}>}  false: „Widerruf wirksam, Widerrufbuch nicht beschrieben“ (→ 503)
 */
export async function kontoSperreVermerken(store, accountId) {
  const h = kontoKennung(accountId);
  try {
    await fortschreiben(store, (b) => kontenEintragen(b, [h], "konto-gesperrt") > 0);
    return { geschrieben: true };
  } catch {
    await nachtragAufnehmen(store, { konten: [h] });
    return { geschrieben: false };
  }
}

/**
 * Nach `mitgliedschaftEntziehen` (Lauf und Status in der Ablage schon geschrieben): die Mindestgeneration ins Buch.
 * Wirft nie. @param {any} store @param {string} accountId @param {string} raum @param {number} generation
 * @returns {Promise<{geschrieben: boolean}>}
 */
export async function mitgliedEntzugVermerken(store, accountId, raum, generation) {
  const eintrag = { kennung: mitgliedKennung(accountId, raum), generation: ganz(generation) ? generation : 2 };
  try {
    await fortschreiben(store, (b) => mitgliederEintragen(b, [eintrag], "mitglied-entzogen") > 0);
    return { geschrieben: true };
  } catch {
    await nachtragAufnehmen(store, { mitglieder: [eintrag] });
    return { geschrieben: false };
  }
}

/**
 * BE-2 A1: Ist der zweite Faktor dieses Kontos laut Buch Pflicht (war er einmal aktiv)? Wirft, wenn das Buch nicht
 * prüfbar ist (fail-closed: der Aufrufer gewährt nichts).
 * @param {any} store @param {string} accountId
 */
export async function kontoFaktorPflichtImBuch(store, accountId) {
  return imAbschnitt(await kontobuchGeprueft(store), FAKTORPFLICHT, faktorPflichtKennung(accountId));
}

/**
 * BE-2 A1: Steht dieser Wiederherstellungscode (über seine Stelle) im Buch als verbraucht? Wirft, wenn das Buch nicht
 * prüfbar ist. @param {any} store @param {string} accountId @param {{bindung: string, generation: number, sel: string}} k
 */
export async function whCodeImBuch(store, accountId, k) {
  return imAbschnitt(await kontobuchGeprueft(store), WHVERBRAUCHT, whCodeKennung(accountId, k));
}

/**
 * BE-2 A1: Nach der Aktivierung des Konto-Faktors (die Ablage ist schon geschrieben): „Faktor ist Pflicht“ ins Buch.
 * Wirft nie. @param {any} store @param {string} accountId @returns {Promise<{geschrieben: boolean}>}
 */
export async function kontoFaktorPflichtVermerken(store, accountId) {
  const h = faktorPflichtKennung(accountId);
  try {
    await fortschreiben(store, (b) => abschnittEintragen(b, FAKTORPFLICHT, [h], "faktor-aktiv") > 0);
    return { geschrieben: true };
  } catch {
    await nachtragAufnehmen(store, { abschnitte: { [FAKTORPFLICHT]: [h] } });
    return { geschrieben: false };
  }
}

/**
 * BE-2 A1: Nach dem Einlösen eines Wiederherstellungscodes (der Verbrauch steht schon in der Ablage): seine Stelle ins
 * Buch. Wirft nie. @param {any} store @param {string} accountId @param {{bindung: string, generation: number, sel: string}} k
 * @returns {Promise<{geschrieben: boolean}>}
 */
export async function whCodeVerbrauchVermerken(store, accountId, k) {
  const h = whCodeKennung(accountId, k);
  try {
    await fortschreiben(store, (b) => abschnittEintragen(b, WHVERBRAUCHT, [h], "wh-eingeloest") > 0);
    return { geschrieben: true };
  } catch {
    await nachtragAufnehmen(store, { abschnitte: { [WHVERBRAUCHT]: [h] } });
    return { geschrieben: false };
  }
}

/**
 * BE-1 Rest: Steht dieser Prüfwert des Kontos im Buch als abgelöst? Wirft, wenn das Buch nicht prüfbar ist
 * (fail-closed: der Aufrufer gewährt nichts). Nur nach einem richtigen Passwort fragen (keine Auskunft an Unbekannte).
 * @param {any} store @param {string} accountId @param {string} pruefwert
 */
export async function passwortAbgeloestImBuch(store, accountId, pruefwert) {
  return imAbschnitt(await kontobuchGeprueft(store), PASSWOERTER, passwortKennung(accountId, pruefwert));
}

/**
 * BE-1 Rest: Nach einer Passwortänderung (der neue Prüfwert steht schon in der Ablage): den ABGELÖSTEN Prüfwert als
 * Kennung ins Buch. Wirft nie. Scheitert das Buch: Nachtrag (Ablage und Speicher), `geschrieben: false`
 * („Widerruf wirksam, Widerrufbuch nicht beschrieben“), /gesund warnt, der nächste Eintrag oder Start trägt nach.
 * @param {any} store @param {string} accountId @param {string} alterPruefwert
 * @returns {Promise<{geschrieben: boolean}>}
 */
export async function passwortAbloesungVermerken(store, accountId, alterPruefwert) {
  const h = passwortKennung(accountId, alterPruefwert);
  try {
    await fortschreiben(store, (b) => abschnittEintragen(b, PASSWOERTER, [h], "passwort-abgeloest") > 0);
    return { geschrieben: true };
  } catch {
    await nachtragAufnehmen(store, { abschnitte: { [PASSWOERTER]: [h] } });
    return { geschrieben: false };
  }
}

/**
 * Beim Serverstart: Stand feststellen, aus der Ablage einsammeln, das Buch in die Ablage nachziehen (Konten sperren,
 * Läufe anheben, Mitgliedschaften entziehen; BE-2 A1: fehlende Pflicht-Faktoren gesperrt, verbrauchte Codes vermerkt).
 * Wirft KontoWiderrufbuchFehler — dann gilt kein Konto-Zugang.
 * @param {any} store
 */
export async function kontobuchStart(store) {
  return vermerken(nacheinander(async () => {
    const verz = await verzeichnis();
    const b = structuredClone(await standJetzt(store));
    const a = await ablageStand(store);
    const eingesammelt = kontobuchEinsammeln(b, a);
    const geschrieben = eingesammelt ? await kontobuchSchreiben(verz, b) : b;
    const marke = await markeVon();
    zwischen = marke ? { marke, buch: geschrieben } : null;
    await nachtragAbraeumen(store, a);
    const n = kontobuchNormalisieren(geschrieben, a);
    /* Reihenfolge wie beim Entzug (accounts.mjs, statusSetzen): erst der Lauf, dann der Status. */
    for (const x of n.konten) await store.setJSON(x.schluessel, x.wert);
    for (const x of n.laeufe) await store.setJSON(x.schluessel, x.wert);
    for (const x of n.mitglieder) await store.setJSON(x.schluessel, x.wert);
    /* BE-2 A1: Faktoren (Platzhalter bzw. verbrauchte Codes) — kein Geheimnis wird zurückgelegt. */
    for (const x of n.faktoren) await store.setJSON(x.schluessel, x.wert);
    return { eingesammelt, konten: Object.keys(geschrieben.konten).length, mitglieder: Object.keys(geschrieben.mitglieder).length,
      nachgezogen: n.gesperrt + n.mitglieder.length, laeufe: n.laeufe.length, ...faktorZahlen(geschrieben, n.faktoren),
      ...passwortZahlen(geschrieben, n) };
  }), { schreibt: true });
}

/** BE-2 A1: Zahlen für Meldungen (Serverstart, Werkzeug) — nur Anzahlen, keine Kennungen. */
export function faktorZahlen(b, nachgezogen) {
  return { faktorpflicht: istMap(b[FAKTORPFLICHT]) ? Object.keys(b[FAKTORPFLICHT]).length : 0,
    whverbraucht: istMap(b[WHVERBRAUCHT]) ? Object.keys(b[WHVERBRAUCHT]).length : 0,
    faktorGesperrt: nachgezogen.filter((x) => x.wert && x.wert.ruecksprungSperre === true).length,
    whNachgezogen: nachgezogen.filter((x) => !(x.wert && x.wert.ruecksprungSperre === true)).length };
}

/** BE-1 Rest: Zahlen für Meldungen — nur Anzahlen, keine Kennungen. @param {any} b @param {{passwoerter: number}} n */
export function passwortZahlen(b, n) {
  return { passwoerterImBuch: istMap(b[PASSWOERTER]) ? Object.keys(b[PASSWOERTER]).length : 0,
    passwoerterZurueckgesetzt: n.passwoerter };
}

/** Nur für Prüfungen: Zwischenspeicher und Lage leeren. */
export function kontowiderrufbuchVergessen() {
  zwischen = null; lage.unklar = false; lage.nachtrag = false; imSpeicher.konten.clear(); imSpeicher.mitglieder.clear();
  for (const x of ABSCHNITTE) imSpeicher[x].clear();
}
