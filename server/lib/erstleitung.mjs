/* ==========================================================================
   ERSTANMELDUNG DER LEITUNG — die erste Leitungsperson eines leeren Betriebs
   entsteht auf dem Server, atomar und dauerhaft (Abnahme V4, A-3;
   Betreiberentscheidung 2026-11-13)

   Bis November 2026 legte die OBERFLÄCHE die erste Person eines Betriebs ohne
   Personen an — nur im Arbeitsspeicher des Browsers (src/App.jsx). Gespeichert
   wurde sie erst mit dem nächsten Schreibvorgang, und auch nur, wenn bis dahin
   niemand sonst Personen angelegt hatte. Ein Leitungscode ohne Person konnte
   so in einem Betrieb mit Personen stranden (Befund A-3). Und JEDER Code ohne
   Person in einem leeren Betrieb erzeugte eine Person — auch ein gewöhnlicher.

   Jetzt:
     - Auslöser ist allein ein ausdrücklich so ausgestellter Erstanmeldecode:
       ein Leitungscode ohne Person, ausgestellt für einen Betrieb OHNE
       Personen im Fenster der Ersteinrichtung (kundenraumschutz.mjs: „neu“
       oder „fenster“) bzw. vom Selbststart für den eben angelegten Betrieb.
       Er trägt den Vermerk `erstleitung: { mandantId, angelegt }`. Kein
       anderer Code legt je eine Person an — kein Demozugang, kein Code einer
       anderen Rolle, kein gewöhnlicher Leitungscode, kein Code mit Person.
     - Der Vermerk ist an Raum UND Betrieb gebunden (Kennung, Position) und
       wird genau einmal eingelöst. Danach ist der Code ein gewöhnlicher,
       personengebundener Leitungscode — derselbe Weg wie jeder andere.
     - Unter der Sperre des Raums (raumsperre.mjs) und in drei Schritten, die
       jeder für sich atomar geschrieben werden (ablage.mjs: Zwischendatei,
       umbenennen; bestand.mjs: Journal):
         1  Vormerken: die künftige Personenkennung am Zugang
            (`erstleitung.personId`). Noch keine Person, keine Sitzung.
         2  Person in den Betrieb schreiben — nur, wenn er noch leer ist
            (oder genau diese vorgemerkte Person schon trägt: Wiederanlauf).
         3  Zugang binden: `person` gesetzt, Vermerk weg, an seiner Stelle
            `erstleitungVerbraucht: { am, grund, mandantId, personId }`.
       Erst danach entsteht die Sitzung (Aufrufer). Bricht der Vorgang
       zwischen zwei Schritten ab (Schreibfehler, Prozessende), gibt es keine
       Sitzung; der nächste Versuch mit demselben Code findet die Vormerkung
       und schreibt zu Ende — nie eine zweite Person. Kein halber Datensatz:
       Die Person entsteht in einem Schreibvorgang vollständig oder gar nicht.
     - Trägt der Betrieb inzwischen fremde Personen (ein zweiter
       Erstanmeldecode war schneller, Personen wurden eingespielt), wird
       nichts angelegt: Der Code ist verbraucht (`grund: "belegt"`) und gilt
       für die Anmeldung nicht mehr — keine stille Zuordnung zu einer
       fremden Person, keine Rechteausweitung.
   Bestehende Zugänge und Betriebe bleiben unverändert: Ein Zugang ohne
   Vermerk wird nie umgeschrieben, kein gespeicherter Bestand wird migriert.

   Betreiberentscheidungen vom 2026-11-13 (verbindlich):
     E-D1  Nur der Erstanmeldecode legt die erste Leitungsperson an, und zwar
           BEVOR es eine Sitzung gibt: Die Sitzung entsteht erst, wenn Person
           und Bindung geschrieben sind (daten.mjs, /api/anmelden). Während der
           Ersteinrichtung gibt es also gar keine Sitzung — auch keine
           eingeschränkte. Ein GEWÖHNLICHER Leitungscode ohne Person öffnet
           keinen Zugang mehr (Befund F-0): keine Anmeldung
           (leitungscodeOhnePerson, 403), und eine schon bestehende Sitzung
           eines solchen Codes gilt nicht mehr (arbeitssitzung.mjs). Ausgenommen
           bleiben Demozugänge und der Betreiber.
     E-D2  Ist die Erstanmeldung eines Betriebs einmal festgelegt, steht das
           dauerhaft in einer eigenen, nur einmal anlegbaren Marke
           `erstleitung-marke:<raum>:<mandantId>` — außerhalb des Bestands, also
           unerreichbar für Schreibweg, Wiederherstellen, Import und
           Bestandsmigration. Ein Betrieb, dessen Personen verloren gehen oder
           gelöscht werden, fällt dadurch nie in die Ersteinrichtung zurück:
           Ein noch offener Erstanmeldecode wird abgewiesen, und einen neuen
           stellt kein Weg mehr aus. Wiederabgeleitet wird zusätzlich aus dem
           Bestand: Ein Betrieb mit Personen ist immer eingerichtet. Die
           Ausnahme „leerer Betrieb“ in rechte.mjs (rollenwechselErlaubt)
           gilt nur noch für Bestandsbetriebe bei ausgeschaltetem Schalter
           (AKTIVIERUNG, unten); ein neuer Betrieb ist ab seiner Anlage streng.
     E-Mail Die erste Leitungsperson hat keine E-Mail-Adresse; die
           Kontaktadresse des Betriebs wird nie als persönliche Adresse
           übernommen.
   ========================================================================== */

import { randomBytes } from "node:crypto";
import { kontoLesenStreng, kontoAendern } from "./konten.mjs";
import { bestandLesenStreng, bestandSchreiben, unterRaumsperre } from "./bestand.mjs";

/** Bezeichnung der ersten Person (wie bisher in der Oberfläche: Rolle als Nachname, Vorname leer). */
const BEZEICHNUNG = "Organisationsleitung";

const heuteBerlin = (jetzt = Date.now()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date(jetzt));

/** Personenkennung aus dem Zufallsgenerator des Betriebssystems (Muster wie provisionierung.mjs). */
const neuePersonId = () => `p_${randomBytes(5).toString("hex").slice(0, 7)}`;

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const ohnePerson = (p) => p === null || p === undefined || p === "";

/** Wie lange ein Erstanmeldecode eingelöst werden kann (Review 227f633e, Punkt 3): danach gilt er nicht mehr. */
export const ERSTLEITUNG_GUELTIG_MS = 14 * 24 * 60 * 60 * 1000;

/** Ende der Gültigkeit eines Vermerks (ms) — aus `bis`, sonst `angelegt` + Frist; unlesbar: NaN (= abgelaufen). */
function vermerkBis(z) {
  if (typeof z.bis === "string" && Number.isFinite(Date.parse(z.bis))) return Date.parse(z.bis);
  const an = typeof z.angelegt === "string" ? Date.parse(z.angelegt) : NaN;
  return Number.isFinite(an) ? an + ERSTLEITUNG_GUELTIG_MS : NaN;
}

/** Ist der (noch nicht verbrauchte) Erstanmeldevermerk abgelaufen? Fehlende oder unlesbare Zeit: ja (fail-closed). */
export function erstleitungAbgelaufen(eintrag, jetzt = Date.now()) {
  if (!istObjekt(eintrag) || !istObjekt(eintrag.erstleitung) || eintrag.erstleitungVerbraucht) return false;
  return !(vermerkBis(eintrag.erstleitung) > jetzt);
}

/** Trägt der Zugang einen offenen Erstanmeldevermerk? Jeder Zweifel ist Nein — auch ein abgelaufener. */
export function erstleitungOffen(eintrag, jetzt = Date.now()) {
  if (!istObjekt(eintrag) || !istObjekt(eintrag.erstleitung)) return false;
  if (eintrag.erstleitungVerbraucht) return false;
  if (eintrag.rolle !== "leitung" || eintrag.demo === true || eintrag.gesperrt) return false;
  const z = eintrag.erstleitung;
  if (typeof z.mandantId !== "string" || !z.mandantId || z.mandantId !== eintrag.mandantId) return false;
  if (typeof eintrag.bestand !== "string" || !eintrag.bestand) return false;
  if (erstleitungAbgelaufen(eintrag, jetzt)) return false;
  return true;
}

/** Wurde der Zugang als Erstanmeldecode ausgestellt (offen oder eingelöst)? */
export const erstleitungsZugang = (eintrag) =>
  istObjekt(eintrag) && (istObjekt(eintrag.erstleitung) || istObjekt(eintrag.erstleitungVerbraucht));

/** Ein verbrauchter Erstanmeldecode ohne Person (belegt): gilt nicht mehr für die Anmeldung. */
export const erstleitungUngueltig = (eintrag) =>
  erstleitungsZugang(eintrag) && !erstleitungOffen(eintrag) && ohnePerson(eintrag.person);

/**
 * E-D1 / Befund F-0: Ein gewöhnlicher Leitungscode ohne Person — kein Demozugang, kein Erstanmeldecode (offen oder
 * verbraucht; der hat seine eigenen Absagen). Er öffnet keinen Zugang: keine Anmeldung, keine Sitzung, kein
 * Sicherungsschlüssel. Bis 2026-11 trug er volle Leitungsrechte (wirksameRolle übernahm die Rolle des Codes).
 * @param {any} eintrag  Zugang (Konto) oder Sitzung
 */
export function leitungscodeOhnePerson(eintrag) {
  if (!istObjekt(eintrag) || eintrag.rolle !== "leitung" || eintrag.demo === true || eintrag.nurSicherung) return false;
  if (!ohnePerson(eintrag.person)) return false;
  return !erstleitungsZugang(eintrag);
}

/** Antwort der Anmeldung für einen Leitungscode ohne Person (dieselbe Meldung wie die Oberfläche, zugangssitzung.js). */
export const OHNE_PERSON_ANTWORT = Object.freeze({ fehler: "Ihr Zugang ist keiner Person zugeordnet.",
  text: "Bitte wenden Sie sich an den Betreiber: Er kann einen personengebundenen Zugangscode ausstellen." });

/* --------------------------------------------------------------------------
   E-D2: Marke „Erstanmeldung festgelegt“ je Betrieb — einmal anlegbar
   (setJSONWennNeu), nie überschrieben, außerhalb des Bestands. Inhalt:
   { personId, am }. Sie entsteht unter der Raumsperre VOR dem Schreiben der
   Person; ein Abbruch danach lässt sie stehen, und der Wiederanlauf mit
   DEMSELBEN Code (gleiche vorgemerkte Kennung) schreibt zu Ende. Jeder andere
   Erstanmeldecode dieses Betriebs ist ab dann wirkungslos.
   -------------------------------------------------------------------------- */
export const erstleitungMarkeSchluessel = (raum, mandantId) => `erstleitung-marke:${raum}:${mandantId}`;
/** Präfix aller Marken eines Raums (raumloeschung.mjs). */
export const erstleitungMarkePraefix = (raum) => `erstleitung-marke:${raum}:`;

/**
 * Die Marke lesen. Ein Lesefehler wirft (nie „keine Marke“).
 * @returns {Promise<{personId: string, am: string}|null>}
 */
export async function erstleitungMarkeLesen(store, raum, mandantId) {
  const m = await store.get(erstleitungMarkeSchluessel(raum, mandantId), { type: "json" });
  if (m === null || m === undefined) return null;
  /* Eine unverständliche Marke ist trotzdem eine Marke: eingerichtet (fail-closed). */
  return istObjekt(m) ? /** @type {any} */ (m) : { personId: "", am: "" };
}

/* --------------------------------------------------------------------------
   AKTIVIERUNG (Betreibervorgabe 2026-11-13): Bestandsbetriebe werden NICHT
   ohne vorherige Bestandsanalyse und Freigabe auf die strengen Regeln
   umgestellt.

     CENTRIC_ERSTLEITUNG_STRENG  Vorgabe AUS; an nur bei genau `true` (jeder
       andere Wert, auch „TRUE“, „1“, „ja“: aus).
       aus  streng (E-D1/F-0: kein Zugang für einen Leitungscode ohne Person;
            E-D2: keine Ausnahme „leerer Betrieb“) gilt für jeden NEUEN
            Betrieb — ab seiner Anlage (Regime-Marke, unten) — und für jeden
            Betrieb, dessen Erstanmeldung festgelegt ist (Marke oben).
            Bestandsbetriebe (vor dieser Änderung angelegt, ohne eine der
            beiden Marken) behalten den bisherigen Ablauf unverändert.
       an   streng für alle Betriebe (nach Analyse und Umstellung, PR #287).
   Ein Lesefehler an einer Marke gilt als streng (fail-closed).
   Der Erstanmeldecode selbst (Vermerk, Marke, Atomarität, Gültigkeit) wirkt
   immer, unabhängig vom Schalter.

   Delta-Review e8b9b93d (Punkt 1): Vorher hing „neu“ allein an der Marke der
   Erstanmeldung — die entsteht erst beim EINLÖSEN. Bis dahin war ein neuer
   Betrieb nicht streng: Ein Planungscode ohne Person legte im Fenster der
   Ersteinrichtung eine Leitung an (Ausnahme „leerer Betrieb“) und verbrannte
   damit den echten Erstanmeldecode; ein gewöhnlicher Leitungscode ohne
   Person bekam volle Leitungsrechte. Jetzt steht das strenge Regime ab der
   ANLAGE des Betriebs fest.

   REGIME-MARKE `erstleitung-regime:<raum>:<mandantId>` — „dieser Betrieb ist
   neu, für ihn gilt das strenge Regime“. Einmal anlegbar (setJSONWennNeu),
   nie überschrieben, außerhalb des Bestands wie die Marke oben: PUT,
   Teilweg, /api/wiederherstellen, Import und Bestandsmigration schreiben nur
   den Bestand und erreichen sie nicht; keine Anfrage kann sie setzen oder
   entfernen. Geschrieben ausschließlich vom Server, und zwar
     - beim Anlegen eines Betriebs: /api/bestand-anlegen (daten.mjs),
       Selbststart und Registrierung (provisionierung.mjs, testbetriebAnlegen)
       und jeder Betrieb, den PUT /api/bestand NEU in einen Raum bringt (heute
       der Betreiber-PUT, Konsole „neuerMandant“; neueBetriebsKennungen,
       Delta-Review f69fd931, F1) — VOR dem Bestand, damit es keinen
       Augenblick ohne sie gibt;
     - beim Ausstellen eines Erstanmeldecodes (/api/zugaenge, /einrichten) —
       VOR dem Code: Ein vor dieser Änderung angelegter, noch leerer Betrieb
       wird mit seinem ersten Erstanmeldecode streng.
   „Bestand oder neu“ entscheidet allein diese Marke (bzw. die Marke der
   Erstanmeldung), nie etwas aus der Anfrage. Inhalt: { seit, durch } —
   keine personenbezogenen Angaben. Raumlöschung räumt sie ab (zuletzt).
   -------------------------------------------------------------------------- */
export const erstleitungStrengAn = () => process.env.CENTRIC_ERSTLEITUNG_STRENG === "true";

export const erstleitungRegimeSchluessel = (raum, mandantId) => `erstleitung-regime:${raum}:${mandantId}`;
/** Präfix aller Regime-Marken eines Raums (raumloeschung.mjs). */
export const erstleitungRegimePraefix = (raum) => `erstleitung-regime:${raum}:`;

/**
 * Das strenge Regime für einen neuen Betrieb festhalten — einmal anlegbar; eine vorhandene Marke bleibt, wie sie ist.
 * Wirft, wenn nicht geschrieben werden kann (der Aufrufer legt dann nichts an).
 * @param {any} store
 * @param {string} raum
 * @param {string} mandantId
 * @param {{durch?: string, jetzt?: number}} [o]
 */
export async function erstleitungRegimeVermerken(store, raum, mandantId, { durch = "", jetzt = Date.now() } = {}) {
  if (typeof raum !== "string" || !raum || typeof mandantId !== "string" || !mandantId)
    throw new Error("Erstanmeldung: Raum oder Betrieb fehlt");
  await store.setJSONWennNeu(erstleitungRegimeSchluessel(raum, mandantId),
    { seit: new Date(jetzt).toISOString(), durch: String(durch).slice(0, 40) });
}

/**
 * Delta-Review f69fd931, F1: Welche Betriebe bringt ein Schreibvorgang NEU in einen Raum? Kennungen aus `nachher`, die
 * `vorher` nicht hat (vorher fehlt: alle). Ein neuer Eintrag ohne lesbare Kennung ergibt `null` — der Aufrufer
 * schreibt dann nichts (kein Betrieb ohne Regime-Marke). Rein, ohne Ablage.
 * @param {any} vorher  gespeicherter Bestand (oder null)
 * @param {any} nachher  zu schreibender Bestand
 * @returns {string[]|null}
 */
export function neueBetriebsKennungen(vorher, nachher) {
  const alt = new Set((istObjekt(vorher) && Array.isArray(vorher.mandanten) ? vorher.mandanten : [])
    .filter(istObjekt).map((m) => m.id).filter((id) => typeof id === "string" && id));
  const neu = [];
  for (const m of (istObjekt(nachher) && Array.isArray(nachher.mandanten) ? nachher.mandanten : [])) {
    if (!istObjekt(m)) continue;
    if (typeof m.id !== "string" || !m.id) return null;
    if (!alt.has(m.id) && !neu.includes(m.id)) neu.push(m.id);
  }
  return neu;
}

/**
 * Gelten für diesen Betrieb die strengen Regeln (E-D1/F-0, E-D2)? Schalter an, oder der Betrieb ist neu
 * (Regime-Marke), oder seine Erstanmeldung ist festgelegt (Marke). Ein Lesefehler: ja.
 * @returns {Promise<boolean>}
 */
export async function erstleitungStreng(store, raum, mandantId) {
  if (erstleitungStrengAn()) return true;
  if (typeof raum !== "string" || !raum || typeof mandantId !== "string" || !mandantId) return false;
  try {
    if ((await store.get(erstleitungRegimeSchluessel(raum, mandantId), { type: "json" })) != null) return true;
    return (await erstleitungMarkeLesen(store, raum, mandantId)) !== null;
  } catch { return true; }
}

/**
 * Für die Ausstellungswege: Gilt der Betrieb als schon eingerichtet? Marke vorhanden, Personen im Bestand, oder die
 * Marke ist nicht lesbar (dann lieber kein Erstanmeldecode). Nie ein Fehler nach außen.
 */
export async function erstleitungEingerichtet(store, raum, mandant) {
  if (!istObjekt(mandant) || typeof mandant.id !== "string" || !mandant.id) return true;
  if (Array.isArray(mandant.personen) && mandant.personen.length > 0) return true;
  try { return (await erstleitungMarkeLesen(store, raum, mandant.id)) !== null; } catch { return true; }
}

/**
 * Bekommt ein neuer Code den Erstanmeldevermerk? Nur ein Leitungscode ohne Person, kein Demozugang, für einen Betrieb
 * ohne Personen, ausgestellt im Fenster der Ersteinrichtung (`lage`: kundenraumschutz.mjs, „neu“ oder „fenster“),
 * und nur, wenn die Erstanmeldung dieses Betriebs nicht schon festgelegt ist (`eingerichtet`, E-D2).
 * @param {{rolle?: unknown, person?: unknown, demo?: unknown, mandant?: any, lage?: {art?: string}|null,
 *   eingerichtet?: boolean}} o
 */
export function erstleitungAusstellen({ rolle, person, demo, mandant, lage, eingerichtet }) {
  /* Ohne ausdrückliches „nicht eingerichtet“ kein Vermerk (fail-closed). */
  if (rolle !== "leitung" || !ohnePerson(person) || demo === true || demo === "true") return false;
  if (eingerichtet !== false) return false;
  if (!lage || (lage.art !== "neu" && lage.art !== "fenster")) return false;
  if (!istObjekt(mandant) || typeof mandant.id !== "string" || !mandant.id) return false;
  return Array.isArray(mandant.personen) && mandant.personen.length === 0;
}

/** Der Vermerk am neuen Code: Kennung des Betriebs, Zeitpunkt und Ende der Gültigkeit, sonst nichts. */
export const erstleitungVermerk = (mandantId, jetzt = Date.now()) =>
  ({ mandantId: String(mandantId), angelegt: new Date(jetzt).toISOString(),
    bis: new Date(jetzt + ERSTLEITUNG_GUELTIG_MS).toISOString() });

/**
 * Die erste Leitungsperson. Feldsatz wie bisher in der Oberfläche (src/app/zugangssitzung.js bis 2026-11) bzw. wie
 * provisionierung.mjs (leitungsperson): alle Einheiten, aktiv, nicht im Schichtdienst. Keine personenbezogenen
 * Angaben — kein Name, keine Adresse; die Leitung trägt sie unter „Personal“ selbst ein.
 * @param {any} mandant
 * @param {string} id
 * @param {string} tag
 */
export function erstleitungPerson(mandant, id, tag) {
  const ersteEinheit = (Array.isArray(mandant.einheiten) ? mandant.einheiten : [])[0];
  const e = istObjekt(mandant.einstellungen) ? mandant.einstellungen : {};
  const ab = typeof mandant.seit === "string" && mandant.seit <= tag ? mandant.seit : tag;
  return {
    id,
    vorname: "",
    nachname: BEZEICHNUNG,
    funktion: BEZEICHNUNG,
    email: "",
    zugehoerigkeit: ersteEinheit && ersteEinheit.id ? [{ ab, einheitId: ersteEinheit.id }] : [],
    eintritt: ab,
    austritt: null,
    wochenstunden: Number.isFinite(e.wochenstunden) ? e.wochenstunden : 40,
    urlaubsanspruch: Number.isFinite(e.urlaubsanspruch) ? e.urlaubsanspruch : 30,
    urlaubsuebertrag: 0,
    stundenuebertrag: 0,
    qualifikationen: [],
    teilzeit: null,
    springer: false,
    einschraenkungen: {},
    rolle: "leitung",
    rolleSeit: ab,
    rolleVerlauf: [],
    bereich: "ALLE",
    status: "aktiv",
    imSchichtdienst: false,
  };
}

/**
 * Löst einen Erstanmeldecode ein: legt die erste Leitungsperson an und bindet den Code an sie — oder tut nichts.
 * Unter der Sperre des Raums; alle Lesevorgänge streng (ein Lesefehler ist nie „leer“).
 *
 * Ergebnis:
 *   { ok: true, eintrag, angelegt }   eintrag = der frisch gelesene Zugang (mit Person, wenn eingelöst);
 *                                      angelegt = true nur, wenn DIESER Aufruf die Person geschrieben hat
 *   { ok: false, grund }              keine Sitzung: "lesen" | "schreiben" | "betrieb" | "belegt" | "konflikt"
 *
 * @param {any} store  Ablage „centric“
 * @param {{schluessel: string, jetzt?: number, durch?: string}} o
 */
export function erstleitungEinloesen(store, { schluessel, jetzt = Date.now(), durch = "Erstanmeldung Leitung" }) {
  return (async () => {
    let vorab;
    try { vorab = await kontoLesenStreng(store, schluessel); } catch { return { ok: false, grund: "lesen" }; }
    if (!erstleitungOffen(vorab)) return { ok: true, eintrag: vorab, angelegt: false };
    const raum = vorab.bestand;
    try {
      return await unterRaumsperre(raum, () => einloesenGesperrt(store, schluessel, raum, jetzt, durch));
    } catch { return { ok: false, grund: "schreiben" }; }
  })();
}

async function einloesenGesperrt(store, schluessel, raum, jetzt, durch) {
  /* Frisch lesen: Ein gleichzeitiger Versuch mit demselben Code kann schon eingelöst haben. */
  let e;
  try { e = await kontoLesenStreng(store, schluessel); } catch { return { ok: false, grund: "lesen" }; }
  if (!erstleitungOffen(e)) {
    if (erstleitungUngueltig(e)) return { ok: false, grund: "belegt" };
    return { ok: true, eintrag: e, angelegt: false };
  }
  if (e.bestand !== raum) return { ok: false, grund: "betrieb" };

  let gelesen;
  try { gelesen = await bestandLesenStreng(store, raum); } catch { return { ok: false, grund: "lesen" }; }
  const bestand = gelesen && gelesen.bestand;
  const liste = bestand && Array.isArray(bestand.mandanten) ? bestand.mandanten : null;
  const pos = Number.isInteger(e.betrieb) ? e.betrieb : 0;
  const m = liste ? liste[pos] : null;
  /* Mandantenbindung: Position UND Kennung des Codes müssen auf denselben Betrieb zeigen wie der Vermerk. */
  if (!istObjekt(m) || m.id !== e.mandantId || m.id !== e.erstleitung.mandantId
    || liste.filter((x) => x && x.id === m.id).length !== 1) return { ok: false, grund: "betrieb" };

  /* Schritt 1: vormerken. */
  let personId = typeof e.erstleitung.personId === "string" && /^p_[0-9a-f]{7}$/.test(e.erstleitung.personId)
    ? e.erstleitung.personId : null;
  if (!personId) {
    const neuId = neuePersonId();
    /* Merge-sicher (konten.mjs, kontoAendern): nur das eine Feld am FRISCHEN Stand — eine gleichzeitige Sperre oder ein
       Faktorvermerk bleibt erhalten. */
    try {
      e = await kontoAendern(store, schluessel, (f) => (erstleitungOffen(f) && !f.erstleitung.personId
        ? { ...f, erstleitung: { ...f.erstleitung, personId: neuId } } : f));
    } catch { return { ok: false, grund: "schreiben" }; }
    if (!erstleitungOffen(e) || e.erstleitung.personId !== neuId) return { ok: false, grund: "konflikt" };
    personId = neuId;
  }

  /* Schritt 2: Person — nur in einen leeren Betrieb, oder sie steht schon da (Wiederanlauf). */
  const personen = Array.isArray(m.personen) ? m.personen : [];
  const schonDa = personen.some((p) => p && String(p.id) === personId);
  /** Nichts anlegen, den Code verbrauchen (fail-closed). */
  const belegt = async () => {
    try { await verbrauchen(store, schluessel, e, "belegt", null, jetzt); } catch { /* bleibt offen, wird erneut abgewiesen */ }
    return { ok: false, grund: "belegt" };
  };
  /* E-D2: Ist die Erstanmeldung dieses Betriebs schon für eine ANDERE Kennung festgelegt, ist er eingerichtet — auch
     wenn seine Personen inzwischen fehlen (gelöscht, verloren, älterer Stand zurückgespielt). */
  let marke;
  try { marke = await erstleitungMarkeLesen(store, raum, m.id); } catch { return { ok: false, grund: "lesen" }; }
  if (marke && marke.personId !== personId) return belegt();
  let angelegt = false;
  if (!schonDa) {
    /* Der Betrieb ist nicht mehr leer. */
    if (personen.length > 0) return belegt();
    /* Schritt 2a: die Marke — einmal anlegbar. Wer sie nicht bekommt, prüft, wem sie gehört. */
    if (!marke) {
      let gewonnen;
      try { gewonnen = await store.setJSONWennNeu(erstleitungMarkeSchluessel(raum, m.id), { personId, am: new Date(jetzt).toISOString() }); }
      catch { return { ok: false, grund: "schreiben" }; }
      if (!gewonnen) {
        try { marke = await erstleitungMarkeLesen(store, raum, m.id); } catch { return { ok: false, grund: "lesen" }; }
        if (!marke || marke.personId !== personId) return belegt();
      }
    }
    /* Schritt 2b: die Person. */
    const person = erstleitungPerson(m, personId, heuteBerlin(jetzt));
    const neu = { ...bestand, mandanten: liste.map((x, i) => (i === pos ? { ...m, personen: [person] } : x)) };
    let erg;
    try { erg = await bestandSchreiben(store, raum, neu, { erwarteterStand: gelesen.stand, durch }); }
    catch { return { ok: false, grund: "schreiben" }; }
    if (!erg || erg.ok !== true) return { ok: false, grund: erg && erg.grund === "konflikt" ? "konflikt" : "schreiben" };
    angelegt = true;
  }

  /* Schritt 3: Zugang binden. Scheitert das, bleibt die Vormerkung — der nächste Versuch schreibt nur noch diesen Schritt. */
  let gebunden;
  try { gebunden = await verbrauchen(store, schluessel, e, "angelegt", personId, jetzt); }
  catch { return { ok: false, grund: "schreiben" }; }
  if (!gebunden || String(gebunden.person ?? "") !== personId) return { ok: false, grund: "konflikt" };
  return { ok: true, eintrag: gebunden, angelegt, personId };
}

/**
 * Den Vermerk verbrauchen — merge-sicher am FRISCHEN Stand des Zugangs (konten.mjs, kontoAendern): Eine gleichzeitig
 * geschriebene Sperre (`gesperrt`) oder ein Faktorvermerk geht nicht verloren. Gebunden wird nur, wenn der frische
 * Stand noch genau diese Vormerkung trägt.
 */
async function verbrauchen(store, schluessel, e, grund, personId, jetzt) {
  return kontoAendern(store, schluessel, (f) => {
    if (!istObjekt(f) || !istObjekt(f.erstleitung) || f.erstleitungVerbraucht) return f;
    if (personId && f.erstleitung.personId !== personId) return f;
    const { erstleitung, ...rest } = f;
    return { ...rest, ...(personId ? { person: personId } : {}),
      erstleitungVerbraucht: { am: new Date(jetzt).toISOString(), grund, mandantId: erstleitung.mandantId,
        ...(personId ? { personId } : {}) } };
  });
}
