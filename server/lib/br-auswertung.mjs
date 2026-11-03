/* ==========================================================================
   AUSWERTUNG FÜR DEN BETRIEBSRAT — nur Aggregate (WP-27)

   Der Betriebsrat bekommt keine Ist-Zeiten einzelner Personen (sicht.mjs,
   E1) und das Bestätigungsprotokoll nur als Zählwerte (WP-10). Für die
   Mitbestimmung braucht er dennoch Belastung und Arbeitszeit des Betriebs.
   Diese Auswertung rechnet der Server aus dem vollständigen Bestand und gibt
   nur Summen je Monat und Einheit (und für den ganzen Betrieb) heraus:

     dienste, nachtdienste, sonntagsdienste, langeDienste (über zehn Stunden),
     ruhezeitUnter11 (zwischen zwei Diensten nach Plan), istStunden und
     istErfasst (bestätigte Ist-Zeiten, nur vergangene Tage)

   Dieselben Rechnungen wie anderswo, keine zweite Logik (Nachtrag WP-27b, B5):
     - Ist-Dauer eines Tages: istZeitFuer (server/lib/istdaten.mjs) wie
       Stundenkonto und Lohnausgabe — mit der bei der Korrektur genannten
       Pause (WP-14) und der Zeitumstellung.
     - Bestätigte ungeplante Dienste (WP-13, ungeplanterDienst) zählen im Ist
       und bei den Beitragenden, an einem Abwesenheitstag nicht (wie das Konto).
     - Rufbereitschaft (form „ruf“, rufbereitschaft, ruhezeitNeutral) erkennt
       rufbereitschaft() der Fachprüfung: kein langer Dienst, keine Ruhezeit.

   Mindestgruppe: Haben in einer Zeile weniger als BR_MINDESTGRUPPE Personen
   Dienst, stehen dort keine Zahlen, nur „<3" — eine kleine Einheit ließe
   sonst auf einzelne Personen schließen. Personen werden nie genannt.

   IST-ZEITEN (Review WP-27, F1). Das Ist zählt nur, wer seine Zeit bestätigt
   hat — das sind oft weniger Personen als die mit geplantem Dienst. Darum
   gilt für Ist-Stunden und Ist-Erfassungen eine eigene Mindestgruppe:
     - mindestens BR_MINDESTGRUPPE Personen tragen zum Ist der Zeile bei,
     - der Monat ist abgeschlossen UND die Frist zum nachträglichen Bestätigen
       (RUECKBLICK_TAGE) ist vorbei. Vorher änderte jede Bestätigung die
       Summe, und zwei Abrufe an aufeinanderfolgenden Tagen ergäben die
       Zeit einer einzelnen Person als Differenz.
     - Zweitsperre: trägt in einem Monat eine Einheit mit 1 oder 2 Personen
       zum Ist bei, fällt auch das Ist der Gesamtzeile weg.
   Sonst stehen Ist-Stunden und Ist-Erfassungen als null („–"): Plan-Zahlen
   bleiben (der Betriebsrat sieht den Plan ohnehin), das Ist nicht.

   RECHNEN OHNE BLOCKIEREN (F3). Je Person und Tag über neun Monate ist bei
   2000 Personen Sekundensache. Die Rechnung ist ein Generator, der nach
   höchstens BR_HAEPPCHEN_MS nachgibt; auswertungHolen rechnet sie im
   Hintergrund (setImmediate) und merkt das Ergebnis im Prozessspeicher je
   Raum, Betrieb und Tag (nicht je Stand der Ablage, siehe unten). Bis es
   fertig ist, bekommt der Abruf „wird berechnet" (Wiederholen), nie einen
   blockierten Prozess. Dauerhaft gespeichert wird nur das einmal ausgegebene
   Ist je Monat (brist:<raum>:<betrieb>:<monat>, siehe EINGEFROREN).
   ========================================================================== */
import { addDays, dow, dauer, fenster } from "./regelwerk.mjs";
import { dienstAm, einheitAm, imDienst, nachtAnteil, nachtschwelle, rufbereitschaft } from "./fachpruefung.mjs";
import { RUECKBLICK_TAGE } from "./zeiterfassung.mjs";
import { istZeitFuer, ungeplanterDienst } from "./istdaten.mjs";
import { unterRaumsperre } from "./raumsperre.mjs";
import { kernSchluessel } from "./scherben.mjs";

/** Mindestgruppe für Zählwerte an den Betriebsrat (WP-10 M1-Rest, WP-27). */
export const BR_MINDESTGRUPPE = 3;
/** Zeitraum der Auswertung: so viele ganze Monate zurück und voraus. */
export const BR_MONATE_ZURUECK = 6;
export const BR_MONATE_VORAUS = 2;
/** Längste Rechenzeit am Stück, dann gibt die Rechnung nach (wie die Fachprüfung). */
export const BR_HAEPPCHEN_MS = 12;

const liste = (w) => (Array.isArray(w) ? w : []).filter((x) => x && typeof x === "object");
const monatVon = (d) => d.slice(0, 7);
const monatPlus = (monat, n) => {
  const [j, m] = monat.split("-").map(Number);
  const z = j * 12 + (m - 1) + n;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
};
const ZAHLEN = ["dienste", "nachtdienste", "sonntagsdienste", "langeDienste", "ruhezeitUnter11", "istStunden", "istErfasst"];


/**
 * Die Auswertung eines Betriebs in Häppchen: der Generator gibt nach
 * höchstens BR_HAEPPCHEN_MS am Stück nach.
 * @param {any} m Betrieb (vollständig)
 * @param {string} heute JJJJ-MM-TT
 * @returns {Generator<void, Auswertung, void>}
 *
 * @typedef {{ stand: string, von: string, bis: string, mindestgruppe: number,
 *   zeilen: { monat: string, einheitId: string | null, personen: number | string, gesperrt: boolean,
 *     dienste?: number, nachtdienste?: number, sonntagsdienste?: number, langeDienste?: number,
 *     ruhezeitUnter11?: number, istStunden?: number | null, istErfasst?: number | null }[] }} Auswertung
 */
export function* auswertungSchritte(m, heute) {
  const von = `${monatPlus(monatVon(heute), -BR_MONATE_ZURUECK)}-01`;
  const bisMonat = monatPlus(monatVon(heute), BR_MONATE_VORAUS);
  const bis = addDays(`${monatPlus(bisMonat, 1)}-01`, -1);
  const einst = (m && m.einstellungen) || {};
  const da = new Map(liste(m && m.dienstarten).map((x) => [String(x.id), x]));
  const erfassung = m && m.erfassung && typeof m.erfassung === "object" ? m.erfassung : {};
  /* Das Ist eines Monats ist erst frei, wenn niemand mehr nachbestätigen kann. */
  const istFrei = (monat) => heute > addDays(addDays(`${monatPlus(monat, 1)}-01`, -1), RUECKBLICK_TAGE);
  /** zeile je „monat|einheit" und „monat|*" */
  const zeilen = new Map();
  const zeile = (monat, eid) => {
    const k = `${monat}|${eid}`;
    let z = zeilen.get(k);
    if (!z) { z = { monat, einheitId: eid === "*" ? null : eid, personenSet: new Set(), istSet: new Set(), dienste: 0, nachtdienste: 0, sonntagsdienste: 0,
      langeDienste: 0, ruhezeitUnter11: 0, istStunden: 0, istErfasst: 0 }; zeilen.set(k, z); }
    return z;
  };
  const abw = new Map();                                                     // Person → Abwesenheiten
  for (const a of liste(m && m.abwesenheiten)) {
    const k = String(a.personId);
    if (!abw.has(k)) abw.set(k, []);
    abw.get(k).push(a);
  }
  const abwesendAm = (p, d) => (abw.get(String(p.id)) || []).some((a) => a.von <= d && a.bis >= d);
  /** Ein bestätigter Ist-Tag: trägt zum Ist bei (für die Mindestgruppe auch, bevor der Monat frei ist) und zählt
      danach mit der Dauer aus istZeitFuer — derselben Rechnung wie Stundenkonto und Lohnausgabe. */
  const istZaehlen = (p, d, dienstart, eid) => {
    const r = istZeitFuer(m, p, d, dienstart);
    if (r.std === null || r.std === undefined || !r.erfasst) return;
    for (const z of [zeile(monatVon(d), eid), zeile(monatVon(d), "*")]) {
      z.istSet.add(String(p.id));
      if (istFrei(monatVon(d))) { z.istStunden += Math.max(0, r.std); z.istErfasst++; }
    }
  };
  let t = performance.now();
  let n = 0;
  for (const p of liste(m && m.personen)) {
    if (p.rolle === "betriebsrat" && p.imSchichtdienst === false) continue;
    let vorher = null;                                                       // { d, ende } des letzten Dienstes
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      if ((++n & 15) === 0 && performance.now() - t > BR_HAEPPCHEN_MS) { yield; t = performance.now(); }
      if (!imDienst(p, d)) { vorher = null; continue; }
      const id = dienstAm(m, p, d);
      const ist = erfassung[`${p.id}|${d}`];
      if (!id) {
        vorher = null;
        /* Kein Dienst nach Plan: Ein bestätigter ungeplanter Dienst (WP-13) zählt im
           Ist und bei den Beitragenden — wie im Stundenkonto (ungeplantAm, src/App.jsx):
           nur im Beschäftigungsverhältnis und nicht an einem Abwesenheitstag. Die
           Plan-Zahlen (Dienste, Nacht, Ruhezeit) bleiben Plan. */
        if (d < heute && ist && ist.ungeplant === true && ist.bestaetigt === true && !abwesendAm(p, d)) {
          const u = ungeplanterDienst(m, p, d);
          if (u) istZaehlen(p, d, u, String(einheitAm(p, d) || "ohne"));
        }
        continue;
      }
      const x = da.get(String(id));
      if (!x || !x.start || !x.ende) continue;
      const eid = einheitAm(p, d) || "ohne";
      const [start, ende] = fenster(d, x);
      const ruf = rufbereitschaft(x);                                      // dieselben Merker wie die Fachprüfung
      for (const z of [zeile(monatVon(d), String(eid)), zeile(monatVon(d), "*")]) {
        z.personenSet.add(String(p.id));
        z.dienste++;
        if (nachtAnteil(x, einst) >= nachtschwelle(einst)) z.nachtdienste++;
        if (dow(d) === 6) z.sonntagsdienste++;
        if (!ruf && dauer(x) > 10) z.langeDienste++;
        if (vorher && !ruf && (start - vorher.ende) / 60 < 11) z.ruhezeitUnter11++;
      }
      if (d < heute && ist && ist.bestaetigt) istZaehlen(p, d, x, String(eid));
      vorher = ruf ? vorher : { d, ende };
    }
  }
  const aus = [];
  /* Zweitsperre: Ist in einem Monat eine Einheit gesperrt, fällt auch die
     Gesamtzeile des Betriebs weg — sonst ergäbe Gesamt minus übrige Einheiten
     die Zahlen der kleinen Einheit. Dasselbe, getrennt, für das Ist. */
  const monatGesperrt = new Set([...zeilen.values()].filter((z) => z.einheitId !== null && z.personenSet.size < BR_MINDESTGRUPPE).map((z) => z.monat));
  const monatIstGesperrt = new Set([...zeilen.values()]
    .filter((z) => z.einheitId !== null && z.istSet.size > 0 && z.istSet.size < BR_MINDESTGRUPPE).map((z) => z.monat));
  for (const z of zeilen.values()) {
    const nPers = z.personenSet.size;
    if (nPers < BR_MINDESTGRUPPE || (z.einheitId === null && monatGesperrt.has(z.monat))) { aus.push({ monat: z.monat, einheitId: z.einheitId, personen: `<${BR_MINDESTGRUPPE}`, gesperrt: true }); continue; }
    const r = { monat: z.monat, einheitId: z.einheitId, personen: nPers, gesperrt: false };
    for (const f of ZAHLEN) {
      if (f === "istStunden" || f === "istErfasst") continue;
      r[f] = z[f];
    }
    /* Ist: eigene Mindestgruppe der Beitragenden und Wartezeit nach Monatsende (F1). */
    const istOffen = istFrei(z.monat) && z.istSet.size >= BR_MINDESTGRUPPE && !(z.einheitId === null && monatIstGesperrt.has(z.monat));
    r.istStunden = istOffen ? Math.round(z.istStunden * 10) / 10 : null;
    r.istErfasst = istOffen ? z.istErfasst : null;
    aus.push(r);
  }
  aus.sort((a, b) => a.monat.localeCompare(b.monat) || String(a.einheitId ?? "").localeCompare(String(b.einheitId ?? "")));
  return { stand: heute, von, bis, mindestgruppe: BR_MINDESTGRUPPE, zeilen: aus };
}

/** Synchron zu Ende rechnen (Prüfungen, kleine Betriebe). Im Betrieb: auswertungHolen. */
export function betriebsratAuswertung(m, heute) {
  const it = auswertungSchritte(m, heute);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/* --------------------------------------------------------------------------
   Im Hintergrund rechnen und merken — je Raum, Betrieb und Tag, im Mindestabstand (F2, N1, K1)

   Der Schlüssel enthält den Raum UND den Betrieb (Mandant) der Sitzung: Ein
   Raum kann mehrere Betriebe tragen, das Ergebnis gehört genau einem von
   ihnen (Review K1: sonst bekäme der Betriebsrat von Betrieb B die Zahlen von
   Betrieb A). Und den Tag. NICHT den Stand der Ablage: Jeder Schreibvorgang —
   auch ein Stempel — macht einen neuen Stand. Mit dem Stand im Schlüssel wäre
   unter Schreiblast nie etwas fertig geworden, und jeder Abruf hätte eine
   neue Vollrechnung gestartet (Review N1).

   - Das letzte Ergebnis wird immer ausgeliefert, mit dem Zeitpunkt seiner
     Berechnung (berechnetUm). Bis zum ersten Ergebnis: „wird berechnet“.
   - Neu gerechnet wird frühestens nach BR_NEUBERECHNUNG_MS, nie mehr als eine
     Rechnung je Raum und Betrieb gleichzeitig (höchstens BR_MAX_GLEICHZEITIG
     insgesamt). Eine laufende Rechnung wird nicht durch einen neuen Stand ersetzt.
   - Datenschutz bleibt: Mindestgruppe, Wartefrist, Zweitsperre stecken in der
     Rechnung selbst; Zeitstempel und Zwischenspeicher geben nichts frei.

   EINGEFROREN — JE MONAT, IN EINEM STÜCK (F1-Rest, Nachtrag WP-27b B1–B4).
   Nach Ablauf der Nachbestätigungsfrist kann die Planung bestätigte Zeiten
   noch korrigieren (bis ANTRAG_RUECKBLICK_TAGE zurück), offene Prüffälle
   bestätigen, verspätete Offline-Stempel annehmen. Zwei Ausgaben, die sich um
   so eine Änderung unterscheiden, ergäben deren Wirkung als Differenz — auch
   über einen Neustart hinweg. Darum steht das Ist eines Monats DAUERHAFT in
   EINEM Schlüssel der Ablage (brist:<raum>:<betrieb>:<monat>):
     { am, zeilen: { <einheit> | "*": { istStunden, istErfasst } } }
   - Eingefroren wird der Monat als Ganzes, sobald irgendeine seiner Zeilen
     ein Ist hat: alle Zeilen, die in diesem Augenblick ein Ist haben, in
     einem atomaren Schreibvorgang (setJSONWennNeu). Danach wird der
     gespeicherte Rahmen erneut gelesen und NUR er ausgegeben — hat ein
     zweiter Lauf zwischen Lesen und Schreiben eingefroren, gilt seiner (B3).
   - Eine Zeile, die im Rahmen fehlt (damals unter der Mindestgruppe, in
     Prüfung, gesperrt), bekommt NIE mehr ein Ist: istNichtVerfuegbar. Sonst
     ergäbe eine später frisch gerechnete Zeile neben eingefrorenen die
     Änderung einer einzelnen Person als Differenz (Sonde P1: Gesamt − B − A
     = Korrektur von a0). Weicht der frische Wert einer eingefrorenen Zeile
     ab, steht „istKorrigiert“ daran — ohne Zahl.
   - Ist die Ablage nicht les- oder schreibbar oder der Rahmen unlesbar, hat
     der ganze Monat kein Ist (fail-closed) — nie einzelne Zeilen (Sonde P2).
   - Geschrieben wird nur unter der Raumsperre (wie raumLoeschen) und nur,
     solange der Kern des Raums besteht: Eine Rechnung, die während der
     Raumlöschung läuft, legt keine Waisen mehr an (B2).
   - Aufgeräumt wird gezielt je Schlüssel, ohne die Ablage zu listen, einmal
     je Monatswechsel und Prozess: die BR_AUFRAEUMEN_MONATE Monate vor dem
     Auswertungszeitraum (B4). Den Rest nimmt die Raumlöschung (Präfix brist:).
     Schlüssel der Vorgängerfassung je Einheit (brist:…:<monat>:<einheit>,
     nur im Integrationsstand) werden nicht mehr gelesen; die Raumlöschung
     nimmt sie mit.
   -------------------------------------------------------------------------- */
/** Frühestens nach dieser Zeit wird ein Raum neu gerechnet. */
export const BR_NEUBERECHNUNG_MS = 5 * 60 * 1000;
export const BR_MAX_GLEICHZEITIG = 3;
export const BR_MAX_TAGE_GEMERKT = 40;
/** So viele Monate vor dem Auswertungszeitraum räumt der Monatswechsel gezielt ab. */
export const BR_AUFRAEUMEN_MONATE = 12;
const FERTIG = new Map();                    // `${raum}\0${betrieb}\0${tag}` → { wert, zeit }
const LAEUFT = new Map();                    // `${raum}\0${betrieb}` → true
const EINGEFROREN = new Map();               // ohne Ablage (kleine Prüfungen): `${raum}\0${betrieb}\0${monat}` → { zeilen }
const AUFGERAEUMT = new Map();               // `${raum}\0${betrieb}` → erster Monat des Zeitraums, für den schon aufgeräumt ist
const STATISTIK = { gestartet: 0, fertig: 0 };
const betriebVon = (mandant) => (mandant && (typeof mandant.id === "string" || typeof mandant.id === "number") && String(mandant.id) ? String(mandant.id) : null);
const laufVon = (raum, betrieb) => `${raum}\u0000${betrieb}`;
const schluesselVon = (raum, betrieb, tag) => `${raum}\u0000${betrieb}\u0000${tag}`;
/** Schlüssel der dauerhaften Ablage: das eingefrorene Ist eines Monats. */
export const istSchluessel = (raum, betrieb, monat) =>
  `brist:${encodeURIComponent(raum)}:${encodeURIComponent(betrieb)}:${monat}`;
export const istPraefix = (raum) => `brist:${encodeURIComponent(raum)}:`;
const zeilenSchluessel = (einheitId) => (einheitId === null || einheitId === undefined ? "*" : String(einheitId));
const zahl = (v) => typeof v === "number" && Number.isFinite(v);
/** Ein gespeicherter Rahmen: Objekt mit `zeilen` (Objekt). Alles andere ist unlesbar. */
const rahmenGueltig = (v) => !!v && typeof v === "object" && !!v.zeilen && typeof v.zeilen === "object" && !Array.isArray(v.zeilen);
class RaumWeg extends Error {}

/**
 * Den Rahmen eines Monats holen: gespeichert, sonst (wenn es ein Ist gibt) jetzt atomar anlegen und
 * erneut lesen. null: kein Rahmen und nichts einzufrieren. Wirft, wenn nichts Gesichertes vorliegt.
 * @param {{ get: Function, setJSONWennNeu?: Function } | null} ablage
 * @param {Record<string, { istStunden: number, istErfasst: number }>} frisch
 */
async function rahmenHolen(ablage, raum, betrieb, monat, frisch) {
  const leer = Object.keys(frisch).length === 0;
  if (!ablage) {
    const k = `${raum}\u0000${betrieb}\u0000${monat}`;
    if (!EINGEFROREN.has(k) && !leer) EINGEFROREN.set(k, { zeilen: { ...frisch } });
    return EINGEFROREN.get(k) || null;
  }
  const k = istSchluessel(raum, betrieb, monat);
  let alt = await ablage.get(k, { type: "json" });
  if (alt === null || alt === undefined) {
    if (leer) return null;
    if (typeof ablage.setJSONWennNeu !== "function") throw new Error("Ablage ohne atomares Anlegen");
    /* Unter der Raumsperre, die auch raumLoeschen hält, und nur, solange der Raum besteht (B2). */
    await unterRaumsperre(raum, async () => {
      if (!(await ablage.get(kernSchluessel(raum), { type: "json" }))) throw new RaumWeg("Raum gelöscht");
      await ablage.setJSONWennNeu(k, { am: new Date().toISOString(), zeilen: frisch });
    });
    alt = await ablage.get(k, { type: "json" });                            // ausgegeben wird, was gespeichert ist (B3)
  }
  if (!rahmenGueltig(alt)) throw new Error("Rahmen unlesbar");
  return alt;
}

/**
 * Das Ist der Auswertung je Monat einfrieren und nur das Eingefrorene ausgeben.
 * @param {{ get: Function, setJSONWennNeu?: Function, delete?: Function } | null} ablage
 */
async function einfrieren(ablage, raum, betrieb, wert) {
  const monate = new Map();
  for (const z of wert.zeilen) {
    if (z.gesperrt) continue;
    if (!monate.has(z.monat)) monate.set(z.monat, []);
    monate.get(z.monat).push(z);
  }
  for (const [monat, zs] of monate) {
    /** @type {Record<string, { istStunden: number, istErfasst: number }>} */
    const frisch = {};
    for (const z of zs) if (zahl(z.istStunden) && zahl(z.istErfasst)) frisch[zeilenSchluessel(z.einheitId)] = { istStunden: z.istStunden, istErfasst: z.istErfasst };
    let rahmen;
    try { rahmen = await rahmenHolen(ablage, raum, betrieb, monat, frisch); }
    catch { rahmen = undefined; }                                          // nicht gesichert: der ganze Monat ohne Ist
    if (rahmen === null) continue;                                         // kein Ist in diesem Monat, nichts eingefroren
    for (const z of zs) {
      const g = rahmen ? rahmen.zeilen[zeilenSchluessel(z.einheitId)] : undefined;
      const f = frisch[zeilenSchluessel(z.einheitId)];
      if (rahmen && g && zahl(g.istStunden) && zahl(g.istErfasst)) {
        z.istStunden = g.istStunden; z.istErfasst = g.istErfasst;
        if (!f || f.istStunden !== g.istStunden || f.istErfasst !== g.istErfasst) z.istKorrigiert = true;
      } else {
        z.istStunden = null; z.istErfasst = null;
        if (rahmen) z.istNichtVerfuegbar = true;                             // dauerhaft: der Monat ist ohne diese Zeile eingefroren
      }
    }
  }
}

/** Aufräumen beim Monatswechsel: gezielt die Monate vor dem Zeitraum, ohne die Ablage zu listen (B4). */
async function aufraeumen(ablage, raum, betrieb, vonMonat) {
  if (!ablage || typeof ablage.delete !== "function") return;
  const k = laufVon(raum, betrieb);
  if (AUFGERAEUMT.get(k) === vonMonat) return;
  if (AUFGERAEUMT.size >= 10000) AUFGERAEUMT.clear();
  AUFGERAEUMT.set(k, vonMonat);
  for (let i = 1; i <= BR_AUFRAEUMEN_MONATE; i++) {
    try { await ablage.delete(istSchluessel(raum, betrieb, monatPlus(vonMonat, -i))); }
    catch { /* Aufräumen darf nie die Ausgabe verhindern */ }
  }
}

/**
 * @param {{ raum: string, heute: string, mandant: any, jetzt?: number, ablage?: any }} a
 *   `ablage`: der Store für das dauerhafte Einfrieren (im Betrieb immer); `jetzt` nur für Prüfungen.
 * @returns {{ fertig: true, wert: Auswertung, berechnetUm: string } | { fertig: false, ausgelastet?: boolean, ungueltig?: true }}
 *   `ungueltig`: der Betrieb hat keine Kennung — die Auswertung lässt sich keinem Betrieb zuordnen (kein endloses „wird berechnet“).
 */
export function auswertungHolen({ raum, heute, mandant, jetzt = Date.now(), ablage = null }) {
  if (typeof raum !== "string" || !raum) return { fertig: false };
  const betrieb = betriebVon(mandant);
  if (!betrieb) return { fertig: false, ungueltig: true };
  const k = schluesselVon(raum, betrieb, heute);
  const lauf = laufVon(raum, betrieb);
  const eintrag = FERTIG.get(k);
  const veraltet = !eintrag || jetzt - eintrag.zeit >= BR_NEUBERECHNUNG_MS;
  if (veraltet && !LAEUFT.has(lauf) && LAEUFT.size < BR_MAX_GLEICHZEITIG) {
    LAEUFT.set(lauf, true);
    STATISTIK.gestartet++;
    (async () => {
      try {
        const it = auswertungSchritte(mandant, heute);
        let r = it.next();
        while (!r.done) { await new Promise((weiter) => setImmediate(weiter)); r = it.next(); }
        await einfrieren(ablage, raum, betrieb, r.value);
        await aufraeumen(ablage, raum, betrieb, r.value.von.slice(0, 7));
        /* Vortage dieses Raums und Betriebs verwerfen; Obergrenze insgesamt. */
        for (const alt of [...FERTIG.keys()]) if (alt.startsWith(`${raum}\u0000${betrieb}\u0000`) && alt !== k) FERTIG.delete(alt);
        if (FERTIG.size >= BR_MAX_TAGE_GEMERKT) FERTIG.delete(FERTIG.keys().next().value);
        FERTIG.set(k, { wert: r.value, zeit: Date.now() });
        STATISTIK.fertig++;
      } catch { /* nicht gemerkt: der nächste Abruf versucht es neu */ }
      finally { LAEUFT.delete(lauf); }
    })();
  }
  if (eintrag) return { fertig: true, wert: eintrag.wert, berechnetUm: new Date(eintrag.zeit).toISOString() };
  return { fertig: false, ausgelastet: !LAEUFT.has(lauf) };
}

/** Nur für Prüfungen. */
export function auswertungenVergessen() { FERTIG.clear(); LAEUFT.clear(); EINGEFROREN.clear(); AUFGERAEUMT.clear(); STATISTIK.gestartet = 0; STATISTIK.fertig = 0; }
export const auswertungStatistik = () => ({ ...STATISTIK, laeuft: LAEUFT.size });
