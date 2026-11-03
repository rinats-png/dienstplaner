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

import { zerlegen, zusammensetzen, abdruck, kernSchluessel, scherbenSchluessel }
  from "./scherben.mjs";
import { ereignis } from "./gesund-zaehler.mjs";
import { unterRaumsperre, sperreGehalten, SPERRE_ZEITGRENZE, SPERRE_GESTOPPT } from "./raumsperre.mjs";
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
  if (sperreGehalten(raum)) return einmal();

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
  };
}

/* ---------------------------------------------------------------------------
   Schreiben
   --------------------------------------------------------------------------- */

/** Fingerabdrücke aller Scherben eines zerlegten Bestands. */
function abdruecke(zerlegt) {
  const aus = { kern: JSON.stringify(zerlegt.kern) };
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
 * @returns {Promise<object>} — bei Erfolg { ok: true, stand, geschrieben,
 *   zusammengefuehrt }, sonst { ok: false, grund: "konflikt", streit,
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
  erwarteterStand = null, durch = "unbekannt",
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
      { neuAngelegt: true, abdVorher: null });
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
    ? (await streng(`Vermerk ${aktuellerStand}`,
      () => store.get(STAND(raum, aktuellerStand), { type: "json" })))?.abdruecke || null
    : null;
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
    if (kernStand !== aktuellerStand) {
      await store.setJSON(kernSchluessel(raum), zIst.kern,
        { metadata: { ...(kernMeta.metadata || {}), stand: aktuellerStand } });
    }
    await store.setJSON(STAND(raum, aktuellerStand),
      { abdruecke: abdAktuell, zeit, durch: "Wiederanlauf nach Abbruch" });
    await store.setJSON(STAND_ZEIGER(raum), { nr: aktuellerStand, zeit });
    console.warn(`Bestand ${raum}: Stand nach Abbruch angeglichen (Kern ${kernStand}, Zeiger ${zeiger} → ${aktuellerStand})`);
  }

  /* --- Kein Stand mitgeschickt: schreiben ohne Abgleich --- */
  if (erwarteterStand === null || erwarteterStand === undefined
      || String(erwarteterStand) === String(aktuellerStand)) {
    return schreibeAlles(store, raum, zNeu, abdNeu, aktuellerStand + 1, durch,
      { nurDiese: abweichende(abdAktuell, abdNeu), abdVorher: abdAktuell });
  }

  /* --- Der Stand ist veraltet: Drei-Wege-Abgleich --- */
  const abdBasis = Number.isFinite(Number(erwarteterStand))
    ? (await streng(`Vermerk ${erwarteterStand}`,
      () => store.get(STAND(raum, Number(erwarteterStand)), { type: "json" })))?.abdruecke || null
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
    aktuellerStand + 1, durch, { nurDiese: abweichende(abdAktuell, abdZusammen), abdVorher: abdAktuell });
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
  /** @type {Array<{art: "setzen"|"loeschen", schluessel: string, wert?: any, metadata?: object}>} */
  const schritte = [{ art: "setzen", schluessel: kernSchluessel(raum), wert: zerlegt.kern,
    metadata: { zeit, durch, stand: neuerStand } }];
  if (!nur || nur.has("kern")) geschrieben++;
  for (const [id, s] of zerlegt.scherben) {
    if (nur && !nur.has(id)) continue;
    schritte.push({ art: "setzen", schluessel: scherbenSchluessel(raum, s.mandantId, s.monat), wert: s });
    geschrieben++;
  }
  for (const schluessel of weg) schritte.push({ art: "loeschen", schluessel });
  schritte.push({ art: "setzen", schluessel: STAND(raum, neuerStand), wert: { abdruecke: abd, zeit, durch } });
  schritte.push({ art: "setzen", schluessel: STAND_ZEIGER(raum), wert: { nr: neuerStand, zeit } });

  /* Festschreiben: eine Datei, atomar und auf der Platte (ablage.mjs). Ab
     hier gilt der neue Stand — auch nach einem Absturz. */
  await store.setJSON(JOURNAL(raum), { id: randomBytes(8).toString("hex"), stand: neuerStand, zeit,
    schritte, pruefsumme: pruefsummeVon(schritte) });
  await schritteAusfuehren(store, schritte);
  await store.delete(JOURNAL(raum));

  /* Alte Vermerke wegräumen — sie sind klein, aber unbegrenzt wären sie
     trotzdem falsch. */
  for (let n = neuerStand - VERMERKE; n > 0 && n > neuerStand - VERMERKE - 5; n--) {
    await store.delete(STAND(raum, n)).catch(() => {});
  }

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

  return { ok: true, stand: String(neuerStand), geschrieben };
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
  const basis = (await store.get(STAND(raum, Number(erwarteterStand)), { type: "json" }).catch(() => null))?.abdruecke;
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
