/* ==========================================================================
   BESTANDSSPEICHER

   Legt einen Betrieb als Kern plus Monatsscherben ab und setzt ihn beim
   Lesen wieder zusammen. Für die Oberfläche bleibt alles wie bisher: Sie
   bekommt einen vollständigen Bestand und schickt einen vollständigen
   zurück.

   Drei Dinge kommen hinzu, die es vorher nicht gab:

   Geschrieben wird nur, was sich geändert hat. Eine Schichtzuweisung im
   August rührt die Scherbe „2026-08" an und sonst nichts.

   Zwei Planer in verschiedenen Monaten stören einander nicht mehr. Der
   Konflikt wird je Scherbe entschieden, nicht auf den ganzen Betrieb.

   Und wenn sie sich doch überschneiden, sagt die Absage, *welcher* Monat
   betroffen ist — statt nur „jemand anderes hat gespeichert".

   ---------------------------------------------------------------------------
   Wie der Abgleich funktioniert

   Für einen Drei-Wege-Abgleich braucht es den gemeinsamen Ausgangspunkt.
   Dafür liegt je Stand ein kleiner Vermerk mit den Fingerabdrücken aller
   Scherben — nicht deren Inhalt, nur je eine Zeichenkette. Der Stand ist
   eine fortlaufende Zahl und zugleich das, was die Oberfläche als ETag
   zurückbekommt.

   Beim Schreiben mit Stand 7 wird der Vermerk 7 geholt. Was der Client
   gegenüber 7 geändert hat, ist seine Arbeit; was der aktuelle Stand
   gegenüber 7 geändert hat, ist die Arbeit eines anderen. Überschneiden
   sich beide nicht, wird zusammengeführt.
   ========================================================================== */

import { zerlegen, zusammensetzen, abdruck, kernAbdruck, abdruckNormal, monatVon, MONATSFELDER,
  kernSchluessel, scherbenSchluessel } from "./scherben.mjs";
import { ereignis } from "./gesund-zaehler.mjs";
import { unterRaumsperre, sperreGehalten, sperrKontext, SPERRE_ZEITGRENZE, SPERRE_GESTOPPT } from "./raumsperre.mjs";
import { createHash, randomBytes } from "node:crypto";

/* Für Endpunkte, die Lesen, Prüfen und Schreiben gemeinsam schützen müssen
   (Stempeln, PUT, Wiederherstellen …): dieselbe Sperre, dieselbe Reihe. */
export { unterRaumsperre, sperreGehalten, SPERRE_ZEITGRENZE, SPERRE_GESTOPPT } from "./raumsperre.mjs";

const ALT = (raum) => `bestand:${raum}`;
/** Schlüssel eines noch nicht zerlegten Altbestands (für Leser, die Lesefehler selbst unterscheiden müssen). */
export const altBestandSchluessel = ALT;
const STAND = (raum, nr) => `stand:${raum}:${nr}`;
const STAND_ZEIGER = (raum) => `stand:${raum}:aktuell`;

/* So viele Standvermerke bleiben liegen. Zehn decken jeden realistischen
   Abstand zwischen Laden und Speichern ab; wer länger offen hat, bekommt
   eine gewöhnliche Konfliktmeldung statt eines Abgleichs. */
const VERMERKE = 10;

/* ---------------------------------------------------------------------------
   Standvermerk und Epoche (WP-48.2)

   Ein Vermerk trägt je Segment (kern, „mandantId::JJJJ-MM") einen Abdruck.
   Seit WP-48.2 ist das ein SHA-256-Präfix (scherben.mjs abdruck/kernAbdruck)
   statt des vollständigen Texts — vorher war jeder Vermerk so groß wie der
   Bestand. Vermerke älterer Server werden beim Lesen übersetzt
   (abdruckNormal); ein Vermerk, der sich nicht sicher deuten lässt, gilt als
   fehlend (fail-closed).

   Die Epoche zählt „Welten": Sie wechselt beim ersten Schreiben, beim
   Wiederherstellen (Option neueEpoche), beim Wiederanlauf nach einem Abbruch
   und wenn ein Server ohne Epoche zwischendurch geschrieben hat. Wer auf
   Erwartungswerten einer anderen Epoche arbeitet (Teilweg, WP-48.3), muss
   neu laden. Sie steht in den Metadaten des Kerns (gelesen zusammen mit dem
   Stand, also widerspruchsfrei) und im Standzeiger.
   --------------------------------------------------------------------------- */

/** Die Abdrücke eines gelesenen Vermerks in heutiger Form — null, wenn er fehlt oder unklar ist. */
function vermerkAbdruecke(v) {
  const roh = v && typeof v === "object" ? v.abdruecke : null;
  if (!roh || typeof roh !== "object" || Array.isArray(roh) || !("kern" in roh)) return null;
  const aus = {};
  for (const [id, wert] of Object.entries(roh)) {
    const n = abdruckNormal(wert);
    if (n === null) return null;
    aus[id] = n;
  }
  return aus;
}

const neueEpoche = () => randomBytes(8).toString("hex");
const epocheGueltig = (e) => typeof e === "string" && /^[0-9a-f]{8,64}$/.test(e);

/* ---------------------------------------------------------------------------
   Lesecache (WP-48.2)

   Unter der Raumsperre liest ein Schreibweg den Bestand oft zweimal: der
   Endpunkt für Rechte und Prüfungen, danach bestandSchreiben für den
   Drei-Wege-Abgleich oder den Wiederanlauf. Was bestandLesenStreng unter
   der Sperre gelesen hat, gilt deshalb bis zum nächsten Schreiben — aber nur
   - unter derselben Sperre (das Gedächtnis hängt am Sperrobjekt aus
     raumsperre.mjs und ist mit der Freigabe vergessen),
   - für dieselbe Ablage (WeakMap je Ablageobjekt),
   - solange kein Journal liegt und Kern-Stand, Kern-Zeit, Epoche und das
     Verzeichnis der Scherben unverändert sind (geprüft bei jedem Treffer),
   - als Kopie (structuredClone) — ein Aufrufer, der das Gelesene verändert,
     verändert nicht, was der nächste liest.
   Jeder Schreibvorgang dieser Datei leert das Gedächtnis des Raums.
   --------------------------------------------------------------------------- */

/** Sperrobjekt → WeakMap(Ablage → { marke, wert }) */
const LESECACHE = new WeakMap();

function lesecacheLeeren(raum) {
  const k = sperrKontext(raum);
  if (k) LESECACHE.delete(k);
}

/** Woran erkannt wird, dass sich die Platte seit dem Lesen bewegt hat. null: Journal liegt (nicht merken). */
async function lesemarke(store, raum) {
  if (await store.get(JOURNAL(raum), { type: "json" })) return null;
  const m = await store.getMetadata(kernSchluessel(raum));
  if (!m) return null;
  const { blobs } = await store.list({ prefix: `scherbe:${raum}:` });
  return JSON.stringify([m.metadata?.stand ?? null, m.metadata?.zeit ?? null, m.metadata?.epoche ?? null,
    blobs.map((b) => b.key)]);
}

/* ---------------------------------------------------------------------------
   Lesen
   --------------------------------------------------------------------------- */

/**
 * Holt den vollständigen Bestand.
 * @returns {Promise<object|null>} — { bestand, stand, zeit, durch } oder null
 */
export function bestandLesen(store, raum) {
  return lesen(store, raum, false);
}

/** Fehlercode, wenn ein Schreibweg den Bestand nicht vollständig lesen kann. */
export const BESTAND_UNLESBAR = "BESTAND_UNLESBAR";

/**
 * Holt den vollständigen Bestand — oder wirft, wenn auch nur ein Teil davon
 * nicht lesbar ist. Für jeden Schreibweg.
 *
 * bestandLesen übergeht eine unlesbare Scherbe oder ein unlesbares
 * Verzeichnis: Zum Anzeigen ist ein Bestand mit Lücke besser als keiner.
 * Zum Schreiben ist er tödlich. Wer aus ihm einen neuen Stand baut, baut
 * ihn ohne die Lücke — und das Schreiben räumte bis November 2026 die
 * „verwaiste" Scherbe weg: Eine beschädigte Oktober-Scherbe war nach dem
 * nächsten Stempel gelöscht. Hier wird stattdessen abgebrochen (→ 503, es
 * wird nichts geschrieben), und die Datei bleibt, wie sie ist.
 *
 * @returns {Promise<object|null>} wie bestandLesen; null nur, wenn es den Raum nicht gibt
 */
export function bestandLesenStreng(store, raum) {
  return lesen(store, raum, true);
}

function unlesbar(raum, was, e) {
  ereignis("unlesbar");   // Fehlerzählung für /gesund (WP-05), ohne Raumnamen
  const f = /** @type {Error & {code?: string}} */ (new Error(
    `Bestand ${raum}: ${was} nicht lesbar${e ? ` (${String(e && e.message || e).slice(0, 120)})` : ""}`));
  f.code = BESTAND_UNLESBAR;
  return f;
}

/* ---------------------------------------------------------------------------
   Das Schreibjournal

   Ein Schreibvorgang berührt mehrere Dateien: Kern, eine oder mehrere
   Scherben, den Standvermerk und den Zeiger. Jede einzelne Datei schreibt
   die Ablage atomar (ablage.mjs: Zwischendatei, fsync, umbenennen) — die
   Folge aber war es nicht. Brach der Prozess zwischen zwei Scherben ab,
   blieb ein Stand, den es nie gab: Ein Eintrag, der von Monat A nach
   Monat B verschoben wurde, war in A schon weg und in B noch nicht da.

   Jetzt wird jeder Schreibvorgang zuerst vollständig als eine Datei
   abgelegt — journal:<raum>, mit allen neuen Werten, allen Löschungen und
   einer Prüfsumme. Diese eine Datei ist der Festschreibepunkt: Liegt sie
   da, gilt der neue Stand, auch wenn danach noch keine einzige Zieldatei
   geschrieben ist. Dann werden die Zieldateien geschrieben und das Journal
   gelöscht.

   - Abbruch, bevor das Journal liegt: Es gilt der alte Stand, vollständig.
   - Abbruch danach: Es gilt der neue Stand, vollständig. Jeder Leser legt
     das Journal über das, was er gelesen hat; der nächste Schreiber
     schreibt es zu Ende (journalAbschliessen) und löscht es.

   Leser kommen ohne Sperre aus und dürfen trotzdem nie einen halben Stand
   sehen. Sie lesen deshalb Journal, Kern und Scherben, dann noch einmal
   Journal und Stand des Kerns. Hat sich dazwischen etwas bewegt, lesen sie
   neu; nach einigen Versuchen warten sie auf die Sperre des Raums.
   --------------------------------------------------------------------------- */

const JOURNAL = (raum) => `journal:${raum}`;
/** Schlüssel des Schreibjournals eines Raums (für die Raumlöschung). */
export const journalSchluessel = JOURNAL;

const pruefsummeVon = (schritte) => createHash("sha256").update(JSON.stringify(schritte)).digest("hex");

/** Das Journal lesen — null, wenn keines liegt. Unlesbar oder falsche Prüfsumme: Fehler. */
async function journalLesen(store, raum) {
  const j = await store.get(JOURNAL(raum), { type: "json" });
  if (!j) return null;
  if (!j || typeof j.id !== "string" || !Array.isArray(j.schritte) || j.pruefsumme !== pruefsummeVon(j.schritte))
    throw new Error("Journal beschädigt (Prüfsumme)");
  return j;
}

/**
 * Für das Werkzeug werkzeug/journal-pruefen.mjs: Wie steht es um das Journal
 * eines Raums? „keins", „gueltig" (wird beim nächsten Schreiben zu Ende
 * geführt) oder „beschaedigt" (sperrt den Raum, bis es beiseitegelegt ist).
 * @returns {Promise<{ zustand: "keins"|"gueltig"|"beschaedigt", grund?: string, schritte?: number }>}
 */
export async function journalPruefen(store, raum) {
  try {
    const j = await journalLesen(store, raum);
    return j ? { zustand: "gueltig", schritte: j.schritte.length } : { zustand: "keins" };
  } catch (e) {
    return { zustand: "beschaedigt", grund: String((e && e.message) || e).slice(0, 200) };
  }
}

/**
 * Schreibt ein liegengebliebenes Journal zu Ende und löscht es. Nur unter der
 * Sperre des Raums. Jeder Schritt ist wiederholbar — ein zweiter Abbruch
 * mittendrin schadet nicht, der nächste Aufruf fängt einfach von vorn an.
 * @returns {Promise<boolean>} ob es etwas zu Ende zu schreiben gab
 */
async function journalAbschliessen(store, raum) {
  let j;
  try { j = await journalLesen(store, raum); }
  catch (e) { throw unlesbar(raum, "Schreibjournal", e); }
  if (!j) return false;
  lesecacheLeeren(raum);
  await schritteAusfuehren(store, j.schritte);
  await store.delete(JOURNAL(raum));
  return true;
}

async function schritteAusfuehren(store, schritte) {
  for (const s of schritte) {
    if (s.art === "setzen") await store.setJSON(s.schluessel, s.wert, s.metadata ? { metadata: s.metadata } : undefined);
    else if (s.art === "loeschen") await store.delete(s.schluessel);
  }
}

/** Kern, Altbestand und Scherben so lesen, wie sie gerade auf der Platte liegen. */
async function rohLesen(store, raum, versuch, kritisch) {
  const kern = await kritisch("Kern",
    () => store.getWithMetadata(kernSchluessel(raum), { type: "json" }));
  const alt = kern ? null : await kritisch("Altbestand",
    () => store.getWithMetadata(ALT(raum), { type: "json" }));
  /** @type {Map<string, any>} */
  const scherben = new Map();
  if (kern) {
    const { blobs } = await versuch("Verzeichnis der Scherben",
      () => store.list({ prefix: `scherbe:${raum}:` }), { blobs: [] });
    for (const b of blobs) {
      const s = await versuch(`Scherbe ${b.key}`, () => store.get(b.key, { type: "json" }), null);
      if (s) scherben.set(b.key, s);
      else scherben.set(b.key, undefined);           // gelistet, aber nicht (mehr) da
    }
  }
  return { kern, alt, scherben };
}

/** Das Journal über das Gelesene legen: Ergebnis ist der neue, vollständige Stand. */
function ueberlagern(roh, raum, journal) {
  let kern = roh.kern;
  const scherben = new Map(roh.scherben);
  for (const s of journal.schritte) {
    if (s.schluessel === kernSchluessel(raum)) {
      kern = s.art === "setzen" ? { data: s.wert, metadata: s.metadata || {} } : null;
    } else if (s.schluessel.startsWith(`scherbe:${raum}:`)) {
      if (s.art === "setzen") scherben.set(s.schluessel, s.wert); else scherben.delete(s.schluessel);
    }
  }
  return { kern, alt: kern ? null : roh.alt, scherben };
}

async function lesen(store, raum, streng) {
  /* Im strengen Lesen wird jeder Fehler zum Abbruch, im milden zur Lücke —
     aber nur bei einer einzelnen Scherbe oder ihrem Verzeichnis. */
  const versuch = async (was, arbeit, ersatz) => {
    try { return await arbeit(); }
    catch (e) { if (streng) throw unlesbar(raum, was, e); return ersatz; }
  };
  /* Journal, Kern und Altbestand sind in beiden Arten kritisch: Ein Fehler
     beim Lesen heißt „unbekannt", nie „nicht da". Bis November 2026 machte
     das milde Lesen aus einem unlesbaren Journal „kein Journal" — nach einem
     Abbruch mitten im Schreiben zeigte die Anzeige dann den neuen Kern mit
     einem Eintrag im März UND im April. Aus einem unlesbaren Kern wurde „den
     Raum gibt es nicht", und manche Aufrufer räumten daraufhin ab. */
  const kritisch = async (was, arbeit) => {
    try { return await arbeit(); } catch (e) { throw unlesbar(raum, was, e); }
  };
  const journal = () => kritisch("Schreibjournal", () => journalLesen(store, raum));
  const kernStand = () => kritisch("Kern", () => store.getMetadata(kernSchluessel(raum)))
    .then((m) => (m ? m.metadata?.stand ?? null : null));

  /* Ein einziger Durchgang, wenn kein Schreiber dazwischenkommen kann. */
  const einmal = async () => {
    const j = await journal();
    const roh = await rohLesen(store, raum, versuch, kritisch);
    return zusammenbauen(j ? ueberlagern(roh, raum, j) : roh, raum, streng);
  };
  if (sperreGehalten(raum)) return streng ? mitLesecache(store, raum, einmal) : einmal();

  /* Die Reihenfolge ist wesentlich: Stand, Journal, Inhalt, Journal, Stand.
     Ein Schreiber legt erst das Journal, dann den Kern (mit neuem Stand),
     dann die Scherben, und löscht das Journal zuletzt. Begann er nach dem
     ersten Blick ins Journal, schrieb er seinen Kern auch nach dem ersten
     Stand — dann ist er beim zweiten Blick entweder noch da (Journal) oder
     fertig (anderer Stand). Lag sein Journal schon beim ersten Blick da und
     ist beim zweiten noch dasselbe, ist das Gelesene samt Journal der neue
     Stand, gleich wie weit er gekommen ist.

     Ein Lesefehler (EMFILE, ein Aussetzer der Platte, eine Datei, die ein
     Schreiber unter Windows gerade ersetzt) ist oft vorübergehend: noch ein
     Versuch, kurz versetzt. Bleibt er, gilt BESTAND_UNLESBAR (→ 503). */
  let fehler = null;
  for (let n = 0; n < 4; n++) {
    if (n > 0) await new Promise((r) => setTimeout(r, 10 * n));
    try {
      const k1 = await kernStand();
      const j1 = await journal();
      const roh = await rohLesen(store, raum, versuch, kritisch);
      const j2 = await journal();
      const k2 = await kernStand();
      fehler = null;
      if ((j1 && j1.id) !== (j2 && j2.id)) continue;            // ein Schreibvorgang begann oder endete
      if (j1) return zusammenbauen(ueberlagern(roh, raum, j1), raum, streng);
      const kRoh = roh.kern ? roh.kern.metadata?.stand ?? null : null;
      if (k1 !== k2 || kRoh !== k2) continue;                    // ein ganzer lief durch
      return zusammenbauen(roh, raum, streng);
    } catch (e) {
      if (!e || e.code !== BESTAND_UNLESBAR) throw e;
      fehler = e;
    }
  }
  if (fehler) throw fehler;
  /* Es wird gerade sehr viel geschrieben: einmal unter der Sperre lesen. */
  return unterRaumsperre(raum, einmal);
}

/** Strenges Lesen unter der gehaltenen Sperre über den Lesecache (siehe oben). */
async function mitLesecache(store, raum, einmal) {
  const kontext = sperrKontext(raum);
  if (!kontext || !store || typeof store !== "object") return einmal();
  let jeAblage = LESECACHE.get(kontext);
  if (!jeAblage) { jeAblage = new WeakMap(); LESECACHE.set(kontext, jeAblage); }
  const vorher = jeAblage.get(store);
  /* Lässt sich die Marke nicht lesen, gibt es keinen Treffer: Das Lesen geht
     den gewöhnlichen Weg und meldet einen Fehler dort, wie bisher. */
  const markeJetzt = () => lesemarke(store, raum).catch(() => null);
  const marke = await markeJetzt();
  if (vorher && marke !== null && vorher.marke === marke) return structuredClone(vorher.wert);
  jeAblage.delete(store);
  const erg = await einmal();
  /* Gemerkt wird nur ein zerlegter Bestand, ohne liegendes Journal, und nur,
     wenn sich die Platte während des Lesens nicht bewegt hat. */
  if (erg && !erg.unzerlegt && marke !== null && marke === await markeJetzt())
    jeAblage.set(store, { marke, wert: structuredClone(erg) });
  return erg;
}

/**
 * Ist dieser Fehler vorübergehend — „gerade nicht lesbar" oder „gerade
 * gesperrt" — statt „gibt es nicht"? Aufrufer, die einen fehlenden Bestand
 * anders behandeln als einen Fehler (Sitzung beenden, Vorgang abräumen,
 * „nicht deine Person"), müssen solche Fehler weiterreichen: Am Ende steht
 * eine 503, und nichts wird auf Grund einer Lücke entschieden.
 */
export function voruebergehend(e) {
  return !!e && [BESTAND_UNLESBAR, SPERRE_ZEITGRENZE, SPERRE_GESTOPPT].includes(/** @type {any} */ (e).code);
}

function zusammenbauen({ kern, alt, scherben }, raum, streng) {
  if (!kern) {
    /* Noch nicht zerlegt? Dann liegt der Betrieb als ein Blob vor. Er wird
       hier gelesen, aber nicht angefasst — das Zerlegen geschieht beim
       ersten Schreiben, damit ein reiner Lesezugriff nichts verändert. */
    if (!alt) return null;
    return { bestand: alt.data, stand: "alt", zeit: alt.metadata?.zeit || null,
      durch: alt.metadata?.durch || null, unzerlegt: true };
  }
  const liste = [];
  for (const [schluessel, s] of scherben) {
    /* Gelistet, aber nicht (mehr) da: im strengen Lesen ein Abbruch —
       unter der Raumsperre löscht niemand nebenher. */
    if (s === undefined || s === null) {
      if (streng) throw unlesbar(raum, `Scherbe ${schluessel}`, "verschwunden oder leer");
      continue;
    }
    liste.push(s);
  }
  return {
    bestand: zusammensetzen(kern.data, liste),
    stand: String(kern.metadata?.stand ?? 0),
    zeit: kern.metadata?.zeit || null,
    durch: kern.metadata?.durch || null,
    /* WP-48.2: null bei einem Bestand, den zuletzt ein Server ohne Epoche schrieb. */
    epoche: epocheGueltig(kern.metadata?.epoche) ? kern.metadata.epoche : null,
  };
}

/* ---------------------------------------------------------------------------
   Schreiben
   --------------------------------------------------------------------------- */

/** Fingerabdrücke aller Scherben eines zerlegten Bestands. */
function abdruecke(zerlegt) {
  const aus = { kern: kernAbdruck(zerlegt.kern) };
  for (const [id, s] of zerlegt.scherben) aus[id] = abdruck(s);
  return aus;
}

/** Welche Kennungen unterscheiden sich zwischen zwei Abdruckmengen? */
function abweichende(a, b) {
  const alle = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const aus = [];
  for (const id of alle) if ((a || {})[id] !== (b || {})[id]) aus.push(id);
  return aus;
}

/** Aus "m1::2026-08" den lesbaren Monat holen. */
export const monatAusKennung = (id) => (String(id).split("::")[1] || id);

/**
 * Schreibt einen Bestand.
 *
 * @param erwarteterStand Der Stand, den die Oberfläche beim Laden bekam.
 *   Fehlt er, wird ohne Abgleich geschrieben (erster Schreibvorgang).
 * @param neueEpoche (Option) true beim Wiederherstellen: Es beginnt eine neue
 *   Epoche (WP-48.2), Teilstände der alten Welt laden neu.
 * @returns {Promise<object>} — bei Erfolg { ok: true, stand, geschrieben,
 *   epoche, zusammengefuehrt }, sonst { ok: false, grund: "konflikt", streit,
 *   bestand, stand, zeit, durch }
 */
/** session ganz oben (D1b) und am Betrieb (D1c) sind keine Bestandsfelder:
    oben null, am Betrieb entfernt. */
function ohneSitzung(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b;
  const aus = { ...b, session: null };
  if (Array.isArray(b.mandanten)) aus.mandanten = b.mandanten.map((m) => {
    if (!m || typeof m !== "object" || !("session" in m)) return m;
    const { session, ...rest } = m; // eslint-disable-line no-unused-vars
    return rest;
  });
  return aus;
}

export function bestandSchreiben(store, raum, neuerBestandRoh, opt = {}) {
  /* Die ganze Folge — Standzeiger lesen, abgleichen, Kern und Scherben
     schreiben, Standzeiger setzen — läuft unter der Sperre des Raums
     (raumsperre.mjs). Vorher konnten zwei Schreiber mit demselben
     erwarteten Stand beide bestehen: Beide lasen Stand N, beide schrieben
     N+1, und die Monatsscherbe des einen ging verloren, obwohl beide 200
     bekamen. Wer die Sperre schon hält (ein Endpunkt, der Lesen, Prüfen und
     Schreiben gemeinsam schützt), kommt ohne Warten durch — deshalb darf
     eine solche gesperrte Arbeit bestandSchreiben nie nebeneinander
     aufrufen (Promise.all), sondern nur nacheinander: Der Wiedereintritt
     lässt beide sofort durch, und sie liefen gegeneinander. */
  return unterRaumsperre(raum, () => bestandSchreibenGesperrt(store, raum, neuerBestandRoh, opt));
}

/** Der eigentliche Schreibvorgang — nur unter der Sperre des Raums aufrufen. */
async function bestandSchreibenGesperrt(store, raum, neuerBestandRoh, {
  erwarteterStand = null, durch = "unbekannt", neueEpoche: epocheWechseln = false,
} = {}) {
  /* session ist kein Bestandsfeld (Commit D1b): Die Sitzung lebt im Browser
     und auf dem Server getrennt vom Bestand. Ganz oben gespeichert war sie
     ein Kanal, über den eine Rolle in Betrieb A Daten ablegen konnte, die
     Rollen in Betrieb B desselben Raums zurückbekamen. Jeder Schreibweg
     (PUT, Anlegen, Wiederherstellen, Stempeln …) läuft hier durch — hier
     wird sie verworfen; ein Altinhalt verschwindet beim nächsten Schreiben.
     Ebenso session am Betrieb (Commit D1c). */
  const neuerBestand = ohneSitzung(neuerBestandRoh);

  /* Alles, was hier über den gespeicherten Stand gelesen wird, wird streng
     gelesen: Ein unlesbarer Zeiger, Kern oder Vermerk bricht ab, statt als
     „gibt es nicht" durchzugehen. Bis November 2026 machte `.catch(() =>
     null)` aus einem beschädigten Zeiger einen ersten Schreibvorgang. */
  const streng = async (was, arbeit) => {
    try { return await arbeit(); } catch (e) { throw unlesbar(raum, was, e); }
  };
  /* Liegt noch ein Journal von einem abgebrochenen Schreibvorgang, gilt
     dessen Stand — er wird zuerst zu Ende geschrieben. */
  if (await journalAbschliessen(store, raum)) {
    ereignis("journal");   // WP-05
    console.warn(`Bestand ${raum}: abgebrochenen Schreibvorgang aus dem Journal zu Ende geschrieben`);
  }
  const zeigerRoh = await streng("Standzeiger", () => store.get(STAND_ZEIGER(raum), { type: "json" }));
  const zeiger = zeigerRoh && Number.isFinite(Number(zeigerRoh.nr)) ? Number(zeigerRoh.nr) : null;
  const kernMeta = await streng("Kern", () => store.getMetadata(kernSchluessel(raum)));
  const kernStand = kernMeta && Number.isFinite(Number(kernMeta.metadata?.stand))
    ? Number(kernMeta.metadata.stand) : null;

  const zNeu = zerlegen(neuerBestand);
  const abdNeu = abdruecke(zNeu);

  /* --- Erster Schreibvorgang oder Übernahme eines unzerlegten Betriebs --- */
  if (!kernMeta) {
    return schreibeAlles(store, raum, zNeu, abdNeu, (zeiger ?? 0) + 1, durch,
      { neuAngelegt: true, abdVorher: null, epoche: neueEpoche() });
  }

  /* --- Wiederanlauf nach einem Abbruch ---

     Geschrieben wird in der Reihenfolge Kern (mit dem neuen Stand in den
     Metadaten), Scherben, Vermerk, Zeiger. Bricht der Prozess dazwischen ab
     (Absturz, Stromausfall, harter Neustart), steht im Kern Stand N+1, der
     Zeiger aber noch auf N, und der Vermerk N+1 fehlt. Die Leser bekamen
     danach N+1 als Stand, das Schreiben verglich mit N — und jeder einzelne
     Stempel endete von da an in einem Konflikt, für immer.

     Jetzt gilt: Was auf der Platte liegt, ist der Stand. Passen Kern,
     Zeiger, Vermerk und die vorhandenen Scherben nicht zusammen, wird der
     Vermerk aus dem tatsächlich Gespeicherten neu berechnet und der Zeiger
     nachgezogen. Verloren geht dabei nichts: Weder wird etwas gelöscht noch
     etwas zurückgesetzt, und der abgebrochene Schreibvorgang hat nie eine
     Erfolgsmeldung bekommen. Unter der Raumsperre und der Prozesssperre
     kann eine solche Lücke nur von einem Abbruch stammen. */
  let aktuellerStand = Math.max(kernStand ?? 0, zeiger ?? 0);
  let abdAktuell = aktuellerStand > 0
    ? vermerkAbdruecke(await streng(`Vermerk ${aktuellerStand}`,
      () => store.get(STAND(raum, aktuellerStand), { type: "json" })))
    : null;
  /* Die Epoche gilt nur, wenn Kern und Zeiger dieselbe tragen. Fehlt sie oder
     weichen sie ab (ein Server ohne Epoche hat zwischendurch geschrieben),
     beginnt eine neue — fail-closed für jeden, der auf der alten arbeitet. */
  const epocheKern = kernMeta.metadata?.epoche;
  let epoche = !epocheWechseln && epocheGueltig(epocheKern) && zeigerRoh && zeigerRoh.epoche === epocheKern
    ? epocheKern : neueEpoche();
  let wiederanlauf = false;
  const { blobs: vorhandene } = await streng("Verzeichnis der Scherben",
    () => store.list({ prefix: `scherbe:${raum}:` }));
  const unbekannt = abdAktuell
    ? vorhandene.some((b) => !(scherbenKennung(raum, b.key) in abdAktuell)) : true;
  if (aktuellerStand === 0 || kernStand !== aktuellerStand || zeiger !== aktuellerStand
      || !abdAktuell || unbekannt) {
    if (aktuellerStand === 0) aktuellerStand = 1;
    const ist = await bestandLesenStreng(store, raum);
    const zIst = zerlegen(ohneSitzung(ist.bestand));
    abdAktuell = abdruecke(zIst);
    const zeit = new Date().toISOString();
    /* Nach einem Wiederanlauf beginnt eine neue Epoche (WP-48.2): Wer auf
       Erwartungswerten von vorher arbeitet, lädt neu. */
    epoche = neueEpoche();
    wiederanlauf = true;
    lesecacheLeeren(raum);
    if (kernStand !== aktuellerStand) {
      await store.setJSON(kernSchluessel(raum), zIst.kern,
        { metadata: { ...(kernMeta.metadata || {}), stand: aktuellerStand, epoche } });
    }
    await store.setJSON(STAND(raum, aktuellerStand),
      { abdruecke: abdAktuell, zeit, durch: "Wiederanlauf nach Abbruch" });
    await store.setJSON(STAND_ZEIGER(raum), { nr: aktuellerStand, zeit, epoche });
    console.warn(`Bestand ${raum}: Stand nach Abbruch angeglichen (Kern ${kernStand}, Zeiger ${zeiger} → ${aktuellerStand})`);
  }

  /* --- Kein Stand mitgeschickt: schreiben ohne Abgleich --- */
  if (erwarteterStand === null || erwarteterStand === undefined
      || String(erwarteterStand) === String(aktuellerStand)) {
    return schreibeAlles(store, raum, zNeu, abdNeu, aktuellerStand + 1, durch,
      { nurDiese: abweichende(abdAktuell, abdNeu), abdVorher: abdAktuell, epoche, aufraeumenVoll: wiederanlauf });
  }

  /* --- Der Stand ist veraltet: Drei-Wege-Abgleich --- */
  const abdBasis = Number.isFinite(Number(erwarteterStand))
    ? vermerkAbdruecke(await streng(`Vermerk ${erwarteterStand}`,
      () => store.get(STAND(raum, Number(erwarteterStand)), { type: "json" })))
    : null;

  const jetzt = await bestandLesenStreng(store, raum);

  if (!abdBasis) {
    /* Ohne Ausgangspunkt lässt sich nichts abgleichen — dann gilt die alte,
       strenge Regel. Passiert nur, wenn jemand sehr lange offen hatte. */
    return { ok: false, grund: "konflikt", streit: null,
      bestand: jetzt?.bestand || null, stand: String(aktuellerStand),
      zeit: jetzt?.zeit || null, durch: jetzt?.durch || null };
  }

  const meine = new Set(abweichende(abdBasis, abdNeu));
  const fremde = new Set(abweichende(abdBasis, abdAktuell));
  /* Beide haben denselben Inhalt erzeugt (z. B. der Löschlauf nahm Standort-Ergebnisse heraus, die
     eine ältere Kopie nie zurückbringt, WP-20/A1): Das ist kein Streit — nichts geht verloren. */
  const streit = [...meine].filter((id) => fremde.has(id) && abdNeu[id] !== abdAktuell[id]);

  if (streit.length) {
    return { ok: false, grund: "konflikt", streit,
      monate: streit.filter((x) => x !== "kern").map(monatAusKennung),
      kernBetroffen: streit.includes("kern"),
      bestand: jetzt?.bestand || null, stand: String(aktuellerStand),
      zeit: jetzt?.zeit || null, durch: jetzt?.durch || null };
  }

  /* Keine Überschneidung: Beide Arbeiten passen nebeneinander. Der aktuelle
     Stand ist die Grundlage, die eigenen Änderungen kommen obendrauf. */
  /* Auch der übernommene aktuelle Kern verliert einen Altinhalt in session
     (D1b, D1c) — sonst bliebe er stehen, wenn nur andere den Kern geändert haben. */
  const zAktuell = zerlegen(ohneSitzung(jetzt.bestand));
  const kernNimmt = meine.has("kern") ? zNeu.kern : zAktuell.kern;
  const scherben = new Map(zAktuell.scherben);
  for (const id of meine) {
    if (id === "kern") continue;
    const s = zNeu.scherben.get(id);
    if (s) scherben.set(id, s); else scherben.delete(id);
  }

  const zusammen = { kern: kernNimmt, scherben };
  const abdZusammen = abdruecke(zusammen);
  const erg = await schreibeAlles(store, raum, zusammen, abdZusammen,
    aktuellerStand + 1, durch, { nurDiese: abweichende(abdAktuell, abdZusammen), abdVorher: abdAktuell,
      epoche, aufraeumenVoll: wiederanlauf });
  return { ...erg, zusammengefuehrt: [...meine].map(monatAusKennung) };
}

/** Aus dem Ablageschlüssel einer Scherbe ihre Kennung „mandantId::monat". */
function scherbenKennung(raum, schluessel) {
  const rest = String(schluessel).slice(`scherbe:${raum}:`.length);
  const i = rest.lastIndexOf(":");
  return i < 0 ? rest : `${rest.slice(0, i)}::${rest.slice(i + 1)}`;
}

/** Aus der Kennung „mandantId::monat" der Ablageschlüssel. */
function scherbenSchluesselAus(raum, id) {
  const i = id.lastIndexOf("::");
  return scherbenSchluessel(raum, id.slice(0, i), id.slice(i + 2));
}

/** Schreibt Kern und Scherben. `nurDiese` begrenzt auf das Geänderte. */
async function schreibeAlles(store, raum, zerlegt, abd, neuerStand, durch, opt = {}) {
  const zeit = new Date().toISOString();
  const nur = opt.nurDiese ? new Set(opt.nurDiese) : null;
  let geschrieben = 0;

  /* Welche Scherben dieser Schreibvorgang bewusst entfernt: nur solche, die
     im bisherigen Stand (abdVorher) bekannt waren und im neuen fehlen.

     Bis November 2026 wurde stattdessen alles gelöscht, was im Verzeichnis
     lag und im neuen Stand fehlte. Las ein Schreiber eine Scherbe nicht —
     beschädigt, kurz nicht erreichbar —, baute er den neuen Stand ohne sie,
     und hier verschwand sie dann endgültig. Jetzt geht nur weg, was der
     vorige Stand kannte; eine Scherbe, die niemand kennt, bleibt liegen.
     Und jede zu löschende wird vorher noch einmal gelesen: Ist sie nicht
     lesbar, bricht der Vorgang ab, bevor irgendetwas geschrieben ist.

     Warum überhaupt löschen: Wird ein Betrieb ersetzt und der neue Stand
     berührt einen Monat gar nicht, bliebe dessen alte Scherbe liegen und
     würde beim nächsten Lesen wieder mit zusammengesetzt — gelöschte
     Einträge tauchten wieder auf (aufgefallen an einem Planer, der nur den
     September bearbeitete und einen Konflikt für den August gemeldet bekam). */
  const weg = [];
  if (opt.abdVorher) {
    for (const id of Object.keys(opt.abdVorher)) {
      if (id === "kern" || zerlegt.scherben.has(id)) continue;
      const schluessel = scherbenSchluesselAus(raum, id);
      try { await store.get(schluessel, { type: "json" }); }
      catch (e) { throw unlesbar(raum, `Scherbe ${schluessel}`, e); }
      weg.push(schluessel);
    }
  }

  /* Alles, was dieser Schreibvorgang ändert, als eine Liste von Schritten —
     erst vollständig ins Journal, dann ausgeführt (siehe „Das
     Schreibjournal" oben). Auch wenn der Kern unverändert bleibt, wird er
     geschrieben: Der Stand steht in seinen Metadaten. */
  const epoche = epocheGueltig(opt.epoche) ? opt.epoche : neueEpoche();
  /** @type {Array<{art: "setzen"|"loeschen", schluessel: string, wert?: any, metadata?: object}>} */
  const schritte = [{ art: "setzen", schluessel: kernSchluessel(raum), wert: zerlegt.kern,
    metadata: { zeit, durch, stand: neuerStand, epoche } }];
  if (!nur || nur.has("kern")) geschrieben++;
  for (const [id, s] of zerlegt.scherben) {
    if (nur && !nur.has(id)) continue;
    schritte.push({ art: "setzen", schluessel: scherbenSchluessel(raum, s.mandantId, s.monat), wert: s });
    geschrieben++;
  }
  for (const schluessel of weg) schritte.push({ art: "loeschen", schluessel });
  schritte.push({ art: "setzen", schluessel: STAND(raum, neuerStand), wert: { abdruecke: abd, zeit, durch } });
  schritte.push({ art: "setzen", schluessel: STAND_ZEIGER(raum), wert: { nr: neuerStand, zeit, epoche } });

  await festschreiben(store, raum, schritte, neuerStand, zeit, opt.aufraeumenVoll);

  /* Der unzerlegte Altbestand hat ausgedient, sobald der Kern steht. Er
     bleibt als Sicherung liegen, wird aber nicht mehr gelesen. */
  if (opt.neuAngelegt) {
    const alt = await store.get(ALT(raum), { type: "json" }).catch(() => null);
    if (alt) {
      await store.setJSON(`sicherung:${raum}:vor-zerlegung`, alt,
        { metadata: { zeit, durch: "automatisch vor der Zerlegung", automatisch: "ja" } })
        .catch(() => {});
      await store.delete(ALT(raum)).catch(() => {});
    }
  }

  return { ok: true, stand: String(neuerStand), geschrieben, epoche };
}

/**
 * Festschreiben: das Journal als eine Datei (atomar und auf der Platte,
 * ablage.mjs) — ab hier gilt der neue Stand, auch nach einem Absturz —,
 * dann die Schritte, dann das Journal löschen und alte Vermerke wegräumen.
 */
async function festschreiben(store, raum, schritte, neuerStand, zeit, aufraeumenVoll = false) {
  lesecacheLeeren(raum);
  await store.setJSON(JOURNAL(raum), { id: randomBytes(8).toString("hex"), stand: neuerStand, zeit,
    schritte, pruefsumme: pruefsummeVon(schritte) });
  await schritteAusfuehren(store, schritte);
  await store.delete(JOURNAL(raum));
  lesecacheLeeren(raum);

  /* Alte Vermerke wegräumen — sie sind klein, aber unbegrenzt wären sie
     trotzdem falsch. Gewöhnlich steigt der Stand um eins, dann reicht das
     Fenster hinter den letzten zehn. Nach einem Sprung (Wiederanlauf) läge
     alles davor für immer: dann über das Verzeichnis. */
  if (aufraeumenVoll) {
    const { blobs } = await store.list({ prefix: `stand:${raum}:` }).catch(() => ({ blobs: [] }));
    for (const b of blobs) {
      const rest = b.key.slice(`stand:${raum}:`.length);
      if (/^\d+$/.test(rest) && Number(rest) <= neuerStand - VERMERKE) await store.delete(b.key).catch(() => {});
    }
  }
  for (let n = neuerStand - VERMERKE; n > 0 && n > neuerStand - VERMERKE - 5; n--) {
    await store.delete(STAND(raum, n)).catch(() => {});
  }
}

/* ---------------------------------------------------------------------------
   Segmentschreiber (WP-48.2)

   Schreibt nur den Kern und/oder einzelne Monatsscherben — mit demselben
   Journal, demselben Vermerk (Hash) und demselben Zeiger wie bestandSchreiben.
   Der Abdruck aller übrigen Segmente kommt aus dem Vermerk des aktuellen
   Stands; gelesen, zerlegt und gehasht wird nur, was geschrieben wird.

   Das Ergebnis auf der Platte ist dasselbe, als hätte bestandSchreiben den
   ganzen Bestand mit diesen Segmenten geschrieben (geprüft in
   pruefungen/wp48-speicherkern.test.js, „Gleichwertigkeit").

   Bewusst eng und fail-closed:
   - Es gibt keinen Abgleich. Der erwartete Stand muss der aktuelle sein
     (compare-and-set), sonst „konflikt" — die Entscheidung je Zelle trifft
     der Aufrufer vorher unter derselben Sperre (WP-48.3). Ohne erwarteten
     Stand wird gar nicht geschrieben.
   - Passen Kern, Zeiger, Vermerk und Verzeichnis nicht zusammen (Abbruch,
     fehlender oder unklarer Vermerk, Altbestand ohne Kern, ohne Epoche),
     heißt das „unbestimmt": nichts wird geschrieben, der Aufrufer nimmt den
     vollen Weg (der den Wiederanlauf kennt).
   - Eine Scherbe trägt genau die Monatsfelder, jeder Schlüssel liegt in
     ihrem Monat, der Betrieb steht im Kern; der Kern trägt keine
     Monatsdaten und dieselben Betriebe wie vorher. Sonst TEILE_UNGUELTIG.
   - Eine Scherbe ohne jeden Eintrag wird entfernt (wie beim Zerlegen).
   - Rechte, Stempel-Integrität, Gestalt: nicht hier. Das bleibt der
     Schreibkette vorbehalten (WP-48.3: virtueller Vollrumpf).
   --------------------------------------------------------------------------- */

/** Fehlercode einer unzulässigen Form im Segmentschreiber. */
export const TEILE_UNGUELTIG = "TEILE_UNGUELTIG";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;

function teileFehler(text) {
  const f = /** @type {Error & {code?: string}} */ (new Error(`Teilschreiben: ${text}`));
  f.code = TEILE_UNGUELTIG;
  return f;
}

/** Form der Teile prüfen und in die gespeicherte Gestalt bringen. */
function teileGeprueft(teile, kernAlt) {
  if (!istObjekt(teile)) throw teileFehler("keine Teile");
  const mandantenIds = (k) => (Array.isArray(k.mandanten) ? k.mandanten : [])
    .map((m) => (istObjekt(m) ? m.id : undefined));
  let kern = null;
  if (Object.prototype.hasOwnProperty.call(teile, "kern") && teile.kern !== undefined) {
    const k = teile.kern;
    if (!istObjekt(k) || !Array.isArray(k.mandanten)) throw teileFehler("Kern ohne Betriebsliste");
    if (zerlegen(k).scherben.size) throw teileFehler("Kern mit Monatsdaten");
    if (JSON.stringify(mandantenIds(k)) !== JSON.stringify(mandantenIds(kernAlt)))
      throw teileFehler("Kern mit anderen Betrieben");
    kern = k;
  }
  const scherbenRoh = teile.scherben === undefined ? [] : teile.scherben;
  if (!Array.isArray(scherbenRoh)) throw teileFehler("Scherben keine Liste");
  const bekannt = new Set(mandantenIds(kern || kernAlt).filter((id) => id !== undefined && id !== null).map(String));
  const scherben = new Map();
  for (const s of scherbenRoh) {
    if (!istObjekt(s) || typeof s.mandantId !== "string" || !bekannt.has(s.mandantId))
      throw teileFehler("Scherbe eines unbekannten Betriebs");
    if (typeof s.monat !== "string" || !MONAT.test(s.monat)) throw teileFehler("Monat ungültig");
    if (!istObjekt(s.felder) || Object.keys(s.felder).some((f) => !MONATSFELDER.includes(f)))
      throw teileFehler("unbekanntes Feld in einer Scherbe");
    const felder = {};
    for (const f of MONATSFELDER) {
      const w = s.felder[f] === undefined ? {} : s.felder[f];
      if (!istObjekt(w)) throw teileFehler(`${f} ist kein Objekt`);
      for (const k of Object.keys(w)) if (monatVon(k) !== s.monat) throw teileFehler("Schlüssel außerhalb des Monats");
      felder[f] = { ...w };
    }
    const id = `${s.mandantId}::${s.monat}`;
    if (scherben.has(id)) throw teileFehler("Scherbe doppelt");
    scherben.set(id, { mandantId: s.mandantId, monat: s.monat, felder });
  }
  return { kern, scherben };
}

/**
 * Schreibt Kern und/oder einzelne Monatsscherben als neuen Stand.
 *
 * @param {{ kern?: object, scherben?: Array<{mandantId: string, monat: string, felder: object}> }} teile
 *   kern: der ganze Kern in zerlegter Form (ohne Monatsdaten); fehlt er, bleibt der gespeicherte.
 *   scherben: je Monat der ganze neue Inhalt der Scherbe; alle Felder leer = Scherbe entfernen.
 * @param {{ erwarteterStand?: string|number, erwarteteEpoche?: string|null, durch?: string }} opt
 *   erwarteterStand ist Pflicht (ohne ihn: Fehler, nichts geschrieben).
 * @returns {Promise<object>} { ok: true, stand, geschrieben, epoche } oder
 *   { ok: false, grund: "konflikt" | "epoche" | "unbestimmt", stand?, epoche? }
 */
export function teileSchreiben(store, raum, teile, opt = {}) {
  const { erwarteterStand } = opt;
  if (erwarteterStand === null || erwarteterStand === undefined || !Number.isFinite(Number(erwarteterStand)))
    return Promise.reject(new Error("teileSchreiben: erwarteterStand fehlt"));
  return unterRaumsperre(raum, () => teileSchreibenGesperrt(store, raum, teile, opt));
}

async function teileSchreibenGesperrt(store, raum, teile, { erwarteterStand = null, erwarteteEpoche = null, durch = "unbekannt" }) {
  const streng = async (was, arbeit) => {
    try { return await arbeit(); } catch (e) { throw unlesbar(raum, was, e); }
  };
  if (await journalAbschliessen(store, raum)) {
    ereignis("journal");
    console.warn(`Bestand ${raum}: abgebrochenen Schreibvorgang aus dem Journal zu Ende geschrieben`);
  }
  const zeigerRoh = await streng("Standzeiger", () => store.get(STAND_ZEIGER(raum), { type: "json" }));
  const kernRoh = await streng("Kern", () => store.getWithMetadata(kernSchluessel(raum), { type: "json" }));
  const unbestimmt = { ok: false, grund: "unbestimmt" };
  if (!kernRoh || !istObjekt(kernRoh.data) || !zeigerRoh) return unbestimmt;
  const stand = Number(kernRoh.metadata?.stand);
  const epoche = kernRoh.metadata?.epoche;
  if (!Number.isFinite(stand) || stand < 1 || Number(zeigerRoh.nr) !== stand
      || !epocheGueltig(epoche) || zeigerRoh.epoche !== epoche) return unbestimmt;
  const abd = vermerkAbdruecke(await streng(`Vermerk ${stand}`, () => store.get(STAND(raum, stand), { type: "json" })));
  if (!abd) return unbestimmt;
  const { blobs } = await streng("Verzeichnis der Scherben", () => store.list({ prefix: `scherbe:${raum}:` }));
  const vorhanden = new Set(blobs.map((b) => scherbenKennung(raum, b.key)));
  const imVermerk = Object.keys(abd).filter((id) => id !== "kern");
  if (imVermerk.length !== vorhanden.size || imVermerk.some((id) => !vorhanden.has(id))) return unbestimmt;

  /* Die Welt zuerst, dann der Stand (Design 2.3). */
  if (erwarteteEpoche !== null && erwarteteEpoche !== undefined && String(erwarteteEpoche) !== epoche)
    return { ok: false, grund: "epoche", epoche, stand: String(stand) };
  if (String(erwarteterStand) !== String(stand)) return { ok: false, grund: "konflikt", stand: String(stand), epoche };

  const { kern, scherben } = teileGeprueft(teile, kernRoh.data);
  const neuerStand = stand + 1;
  const zeit = new Date().toISOString();
  const kernNeu = kern || kernRoh.data;
  const abdNeu = { ...abd, kern: kernAbdruck(kernNeu) };
  let geschrieben = abdNeu.kern !== abd.kern ? 1 : 0;
  /** @type {Array<{art: "setzen"|"loeschen", schluessel: string, wert?: any, metadata?: object}>} */
  const schritte = [{ art: "setzen", schluessel: kernSchluessel(raum), wert: kernNeu,
    metadata: { zeit, durch, stand: neuerStand, epoche } }];
  for (const [id, s] of scherben) {
    const leer = MONATSFELDER.every((f) => Object.keys(s.felder[f]).length === 0);
    const schluessel = scherbenSchluessel(raum, s.mandantId, s.monat);
    if (leer) {
      if (!(id in abd)) continue;
      /* Wie beim vollen Weg: Was gelöscht wird, muss vorher lesbar sein. */
      await streng(`Scherbe ${schluessel}`, () => store.get(schluessel, { type: "json" }));
      delete abdNeu[id];
      schritte.push({ art: "loeschen", schluessel });
      geschrieben++;
      continue;
    }
    const a = abdruck(s);
    if (abd[id] === a) continue;
    abdNeu[id] = a;
    schritte.push({ art: "setzen", schluessel, wert: s });
    geschrieben++;
  }
  schritte.push({ art: "setzen", schluessel: STAND(raum, neuerStand), wert: { abdruecke: abdNeu, zeit, durch } });
  schritte.push({ art: "setzen", schluessel: STAND_ZEIGER(raum), wert: { nr: neuerStand, zeit, epoche } });
  await festschreiben(store, raum, schritte, neuerStand, zeit);
  return { ok: true, stand: String(neuerStand), geschrieben, epoche };
}

/**
 * Welche Monatsscherben („betriebId::JJJJ-MM") sind seit dem Stand, den die
 * Oberfläche zuletzt bekam, unverändert? Für sie kennt die Oberfläche den
 * gespeicherten Inhalt vollständig — fehlt dort ein Eintrag, hat sie ihn
 * weggelassen, nicht verpasst (Stempel-Integrität, WP-06). Ohne Stand
 * (Schreiben ohne Abgleich) oder mit aktuellem Stand: alle. Ist der Vermerk
 * des alten Stands nicht mehr da: keine (unbestimmt).
 * @param {{bestand: object, stand: string|number}|null} aktuell  frisch gelesen
 * @returns {Promise<Set<string>>}
 */
export async function unveraenderteScherben(store, raum, erwarteterStand, aktuell) {
  if (!aktuell || !aktuell.bestand) return new Set();
  const abd = abdruecke(zerlegen(ohneSitzung(aktuell.bestand)));
  const ids = Object.keys(abd).filter((id) => id !== "kern");
  if (erwarteterStand === null || erwarteterStand === undefined
      || String(erwarteterStand) === String(aktuell.stand)) return new Set(ids);
  if (!Number.isFinite(Number(erwarteterStand))) return new Set();
  /* Ein alter Vermerk (Text) wird übersetzt; ein unklarer gilt als fehlend: keine (WP-48.2). */
  const basis = vermerkAbdruecke(await store.get(STAND(raum, Number(erwarteterStand)), { type: "json" }).catch(() => null));
  if (!basis) return new Set();
  return new Set(ids.filter((id) => basis[id] === abd[id]));
}

/** Gibt es diesen Betrieb schon? Für die Raumanlage. */
export async function raumBelegt(store, raum) {
  /* Nicht lesbar heißt belegt: Ein beschädigter Kern ist ein Raum, den es
     gibt — „frei" würde ihn beim Anlegen überschreiben. */
  const kern = await store.getMetadata(kernSchluessel(raum)).catch(() => true);
  if (kern) return true;
  const alt = await store.getMetadata(ALT(raum)).catch(() => true);
  return !!alt;
}
