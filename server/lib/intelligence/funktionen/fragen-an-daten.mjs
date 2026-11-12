/* ==========================================================================
   INTELLIGENCE — F6 FRAGEN AN DATEN, SERVERSEITIGER KERN (WP-I31 Teil 1)

   Eine Frage in einem Satz wird DETERMINISTISCH (Stichwörter und Muster, kein Modell) einer Abfrage aus einem
   GESCHLOSSENEN Katalog zugeordnet; jede Abfrage ist eine reine Rechnung über die ROLLENSICHT des Bestands
   (bestandFuerRolle) und der Engine (WP-I12). Es gibt keine freie Abfrage, kein SQL, keine Eingabe, die den
   Bereich oder die Person bestimmt: Rolle, Person, Raum und Betrieb kommen aus der Sitzung.

   Katalog (je Abfrage: wer fragen darf, wessen Daten):
     besetzung_tag      Besetzung eines Tages je Dienst         leitung, planer: Betrieb · subplaner: nur Ist der eigenen Einheit
     frei_am_tag        Wer ist an einem Tag frei (optional Q.) leitung, planer: Betrieb · subplaner: eigene Einheit
     stundenkonto       Plus/Minus-Übersicht eines Monats        leitung, planer: Betrieb · subplaner, mitarbeiter: nur sich selbst
     urlaub_uebersicht  Urlaub in einem Zeitraum                 leitung, planer: Betrieb · subplaner: eigene Einheit · mitarbeiter: nur eigener
     eigene_dienste     die nächsten Dienste der fragenden Person alle vier Rollen, jeweils nur die eigenen

   Reihenfolge (jede Stufe verweigert im Zweifel):
   1  Schalter gatewayAn(schalter) — Vorgabe AUS (KI_AUS), vor allem anderen.
   2  Sitzung; Rolle leitung, planer, subplaner oder mitarbeiter (Betriebsrat, Betreiber, Kunde, unbekannt: KI_ROLLE);
      die fragende Person muss in dem Betrieb der Sitzung stehen (sonst KI_NICHT_GEFUNDEN).
   3  Freigabe der Funktion (funktionenFreigegeben enthält "F6"), Frage als Text bis 300 Zeichen.
   4  Frage bereinigen (suche.mjs frageBereinigen: Kontaktdaten, Kontonummern raus). Die Frage wird nicht gespeichert,
      nicht protokolliert und nie in einer Meldung wiederholt.
   5  Fragen nach Gesundheit, Abwesenheitsgründen, Klärung oder Betriebsrat werden abgelehnt — vor jeder Abfrage.
   6  Abfrage aus dem Katalog; darf die Rolle sie nicht, dann „nicht_erlaubt“ (nie ein Datum einer anderen Person).
   7  Rechnung NUR auf der Rollensicht; Ist-Zeiten unter Rollenschutz gibt die Engine als „nicht verfügbar“ zurück,
      nie als Planzeit. Abwesenheiten kommen höchstens als „Urlaub“ vor, nie mit Art, Grund, Notiz oder Fall;
      „nicht frei“ heißt nur „nicht aufgeführt“. Betriebsratsmitglieder stehen in keiner Personenliste.
   8  Ausgabe begrenzt (höchstens 100 Zeilen), mit Quellenangabe (Rechnung, Zeitraum) je Antwort.

   Das Sprachmodell: optional, nur für leitung/planer (Positivliste F6), nur über das übergebene Gateway (heute keines:
   „nicht verfügbar“), und es bekommt ausschließlich die bereinigte Frage — nie das Ergebnis, nie einen Namen. Die
   Antwort des Modells ist ein beigefügter Entwurfstext; die berechnete Antwort bleibt, wie sie ist.
   Kein Schreiben, kein Netz, keine Umgebungsvariable.
   ========================================================================== */
import { bestandFuerRolle } from "../../rechte.mjs";
import { addDays } from "../../regelwerk.mjs";
import { personTag, besetzung, abwesenheitAm, stundenkonto, qualGueltig } from "../../engine/plan.mjs";
import { mitTagesdatum } from "../../engine/zeit.mjs";
import { imDienst, einheitAm } from "../../fachpruefung.mjs";
import { istEntwurfstag } from "../../planfreigabe.mjs";
import { funktionEintrag, rolleDarf } from "../positivliste.mjs";
import { betriebIndexAusSitzung } from "../alias.mjs";
import { gatewayAn, SCHALTER_AUS } from "../gateway/schalter.mjs";
import { GatewayFehler } from "../gateway/codes.mjs";
import { KiFehler } from "../fehler.mjs";
import { frageBereinigen, frageGesundheit, FRAGE_MAX, FRAGE_MIN } from "../hilfe/suche.mjs";

export const FRAGEN_GRENZEN = Object.freeze({ frage: FRAGE_MAX, zeilen: 100, personen: 400, urlaubTage: 62, dienstTage: 14 });
export const F6_ROLLEN = Object.freeze(["leitung", "planer", "subplaner", "mitarbeiter"]);
export const F6_TEXT_NICHT_VERFUEGBAR = "nicht verfügbar";
export const F6_TEXT_ABGELEHNT = "Diese Frage wird nicht beantwortet.";
export const F6_TEXT_NICHT_ERLAUBT = "Diese Frage kann für Ihre Rolle nicht beantwortet werden.";
export const F6_TEXT_KEIN_TREFFER = "Diese Frage gehört nicht zu den unterstützten Abfragen.";
export const F6_HINWEIS_AUSFAELLE = "Kurzfristige Ausfälle sind nicht berücksichtigt; bitte im Plan prüfen.";

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const istObj = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const liste = (w) => (Array.isArray(w) ? w.filter(istObj) : []);
const gleich = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const tagGueltig = (s) => typeof s === "string" && TAG.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const nachKennung = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
const name = (p) => `${p.vorname ?? ""} ${p.nachname ?? ""}`.trim();
const dienstKurz = (da) => (typeof da.kurz === "string" ? da.kurz : (typeof da.name === "string" ? da.name : String(da.id)));
const falt = (s) => String(s).normalize("NFC").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9.\-\s]+/g, " ").replace(/\s+/g, " ").trim();
const wort = (t, w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(t);

/* ---------------- Parameter aus der Frage (nur Datum, Monat, Qualifikation, Dienst) ---------------- */
const WOCHENTAGE = [["sonntag"], ["montag"], ["dienstag"], ["mittwoch"], ["donnerstag"], ["freitag"], ["samstag", "sonnabend"]];
const MONATE = ["januar", "februar", "maerz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
const pad = (n) => String(n).padStart(2, "0");
const wochentag = (tag) => new Date(`${tag}T00:00:00Z`).getUTCDay();
const tageZwischen = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Ein Tag aus der Frage: JJJJ-MM-TT, TT.MM.(JJJJ), heute, morgen, übermorgen, Wochentag (der nächste ab heute). Sonst null. */
function tagAusFrage(t, heute) {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return tagGueltig(m[0]) ? m[0] : undefined;
  m = /(?:^|[^0-9])(\d{1,2})\.(\d{1,2})\.(?:(\d{4})|(\d{2}))?(?![0-9])/.exec(t);
  if (m) {
    const j = m[3] ? Number(m[3]) : (m[4] ? 2000 + Number(m[4]) : Number(heute.slice(0, 4)));
    const s = `${j}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    return tagGueltig(s) ? s : undefined;
  }
  if (wort(t, "uebermorgen")) return addDays(heute, 2);
  if (wort(t, "morgen")) return addDays(heute, 1);
  if (wort(t, "heute")) return heute;
  for (let i = 0; i < 7; i++) {
    const d = addDays(heute, i);
    if (WOCHENTAGE[wochentag(d)].some((n) => wort(t, n))) return d;
  }
  return null;
}
/** Ein Monat (JJJJ-MM) aus der Frage: Monatsname, TT-freies MM.JJJJ, „diesen/nächsten Monat“. Sonst null. */
function monatAusFrage(t, heute) {
  const jahr = (/\b(20\d{2})\b/.exec(t) || [])[1] || heute.slice(0, 4);
  const i = MONATE.findIndex((n) => wort(t, n));
  if (i >= 0) return `${jahr}-${pad(i + 1)}`;
  const m = /(?:^|[^0-9])(\d{1,2})\/(20\d{2})/.exec(t);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${pad(Number(m[1]))}`;
  if (wort(t, "naechsten") && /monat/.test(t)) return addDays(`${heute.slice(0, 7)}-01`, 32).slice(0, 7);
  if (/diesen monat|dieser monat|aktuell\w* monat/.test(t)) return heute.slice(0, 7);
  return null;
}
const ende = (ym) => addDays(addDays(`${ym}-01`, 32).slice(0, 7) + "-01", -1);

/** Qualifikation: nur ganze Wörter gegen Kennung und Name; „nurStatus“-Nachweise (Gesundheitsnähe) werden nie abgefragt. */
function qualAusFrage(t, m) {
  for (const q of liste(m.qualifikationen).filter((x) => !x.nurStatus && x.id !== undefined).sort(nachKennung)) {
    const namen = [q.id, q.name, q.kurz].filter((s) => typeof s === "string" || typeof s === "number").map((s) => falt(s)).filter((s) => s.length >= 2);
    if (namen.some((n) => wort(t, n.replace(/[.\-\s]+/g, " ").trim().replace(/ /g, "\\s"))))
      return { id: String(q.id), name: typeof q.name === "string" ? q.name : String(q.id) };
  }
  return null;
}
/** Dienst: nur ganze Wörter gegen den Namen (oder ein Kürzel ab zwei Zeichen) — „Frühdienst“ trifft „Früh“. */
function dienstAusFrage(t, m) {
  for (const da of liste(m.dienstarten).sort(nachKennung)) {
    const namen = [da.name, da.kurz].filter((s) => typeof s === "string").map(falt).filter((s) => s.length >= 2);
    if (namen.some((n) => new RegExp(`(^|[^a-z0-9])${n.replace(/[.\-\s]+/g, "\\s")}(dienst|schicht)?([^a-z0-9]|$)`).test(t))) return String(da.id);
  }
  return null;
}

/* ---------------- Rollenumfang: wessen Daten ---------------- */
function umfang(sicht, rolle, ich, tag) {
  const alle = liste(sicht.personen).sort(nachKennung);
  const ohneBR = alle.filter((p) => p.rolle !== "betriebsrat");
  if (rolle === "leitung" || rolle === "planer") return { art: "betrieb", personen: ohneBR };
  if (rolle === "subplaner") {
    const selbst = alle.find((p) => gleich(p.id, ich));
    const e = selbst ? einheitAm(selbst, tag) : null;
    if (e === null || e === undefined) return { art: "einheit", personen: selbst ? [selbst] : [] };
    return { art: "einheit", personen: ohneBR.filter((p) => gleich(p.id, ich) || gleich(einheitAm(p, tag), e)) };
  }
  return { art: "eigene", personen: alle.filter((p) => gleich(p.id, ich)) };
}
const selbstUmfang = (sicht, ich) => ({ art: "eigene", personen: liste(sicht.personen).filter((p) => gleich(p.id, ich)) });
const kappen = (zeilen) => ({ zeilen: zeilen.slice(0, FRAGEN_GRENZEN.zeilen), gekuerzt: zeilen.length > FRAGEN_GRENZEN.zeilen });

/* ---------------- Katalog ---------------- */
/* Jede Abfrage: Kennung, Titel, Beispiel, wer fragen darf, Muster (Wort → Gewicht), Rechnung. Reihenfolge = Rang bei Gleichstand. */
const ABFRAGEN = Object.freeze([
  { id: "besetzung_tag", titel: "Besetzung eines Tages", beispiel: "Wie ist die Besetzung am 03.11.?", rollen: ["leitung", "planer", "subplaner"],
    muster: [[/besetzung|besetzt|abdeckung|abgedeckt|unterbesetz|dienststaerke|mindestbesetzung/, 3], [/wie viele (leute|personen|mitarbeiter|kolleg)/, 2]],
    rechne(c) {
      const sc = umfang(c.sicht, c.rolle, c.ich, c.tag);
      const m = c.rolle === "subplaner" ? { ...c.sicht, personen: sc.personen } : c.sicht;
      const b = besetzung(m, c.tag);
      const zeilen = liste(c.sicht.dienstarten).sort(nachKennung).filter((da) => !c.dienst || gleich(da.id, c.dienst)).map((da) => {
        const e = b[da.id];
        if (!e) return null;
        const soll = c.rolle === "subplaner" ? null : e.soll;
        return { dienstId: String(da.id), dienst: dienstKurz(da), beginn: da.start ?? null, ende: da.ende ?? null, ist: e.anzahl, soll,
          differenz: soll === null ? null : e.anzahl - soll };
      }).filter((z) => z && (z.ist > 0 || (z.soll !== null && z.soll > 0)));
      return { geltung: sc.art, parameter: { datum: c.tag, dienstId: c.dienst }, antwort: { datum: c.tag, dienste: zeilen },
        quellen: [{ rechnung: "besetzung", datum: c.tag }] };
    } },
  { id: "frei_am_tag", titel: "Wer ist an einem Tag frei", beispiel: "Wer ist am Montag frei? Wer ist frei mit Qualifikation PFK?", rollen: ["leitung", "planer", "subplaner"],
    muster: [[/\bfrei\b|verfuegbar|einspringen|springen|ersatz|einsetzbar/, 3], [/wer (hat|ist|kann)/, 1]],
    rechne(c) {
      const sc = umfang(c.sicht, c.rolle, c.ich, c.tag);
      const zeilen = sc.personen.filter((p) => {
        if (!imDienst(p, c.tag) || abwesenheitAm(c.sicht, p.id, c.tag)) return false;
        if (personTag(c.sicht, p, c.tag).dienstId) return false;
        return !c.qual || qualGueltig(c.sicht, p, c.qual.id);
      }).map((p) => ({ personId: String(p.id), name: name(p) }));
      const k = kappen(zeilen);
      return { geltung: sc.art, parameter: { datum: c.tag, qualifikation: c.qual }, hinweis: F6_HINWEIS_AUSFAELLE,
        antwort: { datum: c.tag, qualifikation: c.qual, anzahl: zeilen.length, personen: k.zeilen, gekuerzt: k.gekuerzt },
        quellen: [{ rechnung: "plan", datum: c.tag }] };
    } },
  { id: "stundenkonto", titel: "Plus-/Minusstunden eines Monats", beispiel: "Wie sind die Überstunden im November?", rollen: ["leitung", "planer", "subplaner", "mitarbeiter"],
    muster: [[/ueberstunden|plus.?minus|plusstunden|minusstunden|stundenkonto|zeitkonto|mehrarbeit|minusstd|ueberstd/, 3]],
    rechne(c) {
      const sc = c.rolle === "leitung" || c.rolle === "planer" ? umfang(c.sicht, c.rolle, c.ich, c.tag) : selbstUmfang(c.sicht, c.ich);
      const ym = c.monat || c.tag.slice(0, 7);
      const alle = sc.personen.map((p) => {
        const s = stundenkonto(c.sicht, p, ym);
        return { personId: String(p.id), name: name(p), verfuegbar: typeof s === "number" && Number.isFinite(s), stunden: typeof s === "number" && Number.isFinite(s) ? s : null };
      }).sort((a, b) => (b.stunden ?? -1e9) - (a.stunden ?? -1e9) || (a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0));
      const k = kappen(alle);
      return { geltung: sc.art, parameter: { monat: ym }, antwort: { monat: ym, personen: k.zeilen, gekuerzt: k.gekuerzt },
        quellen: [{ rechnung: "stundenkonto", monat: ym }] };
    } },
  { id: "urlaub_uebersicht", titel: "Urlaub in einem Zeitraum", beispiel: "Wer hat im November Urlaub?", rollen: ["leitung", "planer", "subplaner", "mitarbeiter"],
    muster: [[/urlaub|ferien|urlaubstage/, 3]],
    rechne(c) {
      const sc = umfang(c.sicht, c.rolle, c.ich, c.tag);
      let von = c.tag, bis = addDays(c.tag, 30);
      if (c.monat) { von = `${c.monat}-01`; bis = ende(c.monat); } else if (c.tagGenannt) bis = c.tag;
      if (tageZwischen(von, bis) + 1 > FRAGEN_GRENZEN.urlaubTage) bis = addDays(von, FRAGEN_GRENZEN.urlaubTage - 1);
      const erlaubt = new Map(sc.personen.map((p) => [String(p.id), p]));
      const zeilen = liste(c.sicht.abwesenheiten).filter((a) => a.art === "urlaub" && erlaubt.has(String(a.personId))
        && tagGueltig(a.von) && tagGueltig(a.bis) && a.von <= bis && a.bis >= von)
        .map((a) => ({ personId: String(a.personId), name: name(erlaubt.get(String(a.personId))), von: a.von, bis: a.bis }))
        .sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : a.bis < b.bis ? -1 : a.bis > b.bis ? 1 : 0));
      const k = kappen(zeilen);
      return { geltung: sc.art, parameter: { von, bis }, antwort: { von, bis, eintraege: k.zeilen, gekuerzt: k.gekuerzt },
        quellen: [{ rechnung: "urlaub", von, bis }] };
    } },
  { id: "eigene_dienste", titel: "Meine nächsten Dienste", beispiel: "Wann sind meine nächsten Dienste?", rollen: ["leitung", "planer", "subplaner", "mitarbeiter"],
    muster: [[/(mein|meine|meinen|meiner)\b.*(dienst|schicht)/, 4], [/wann (arbeite|muss|bin) ich/, 4], [/naechste\w* (dienst|schicht)/, 2]],
    rechne(c) {
      const sc = selbstUmfang(c.sicht, c.ich);
      const p = sc.personen[0];
      if (!p) return { geltung: "eigene", parameter: {}, antwort: { status: "keine_person", dienste: [] }, quellen: [{ rechnung: "plan" }] };
      const zeilen = [];
      for (let i = 0; i < FRAGEN_GRENZEN.dienstTage; i++) {
        const d = addDays(c.heute, i);
        const t = personTag(c.sicht, p, d);
        if (!t.dienstId || abwesenheitAm(c.sicht, p.id, d)) continue;
        const da = liste(c.sicht.dienstarten).find((x) => gleich(x.id, t.dienstId));
        if (!da) continue;
        zeilen.push({ datum: d, dienstId: String(da.id), dienst: dienstKurz(da), beginn: da.start ?? null, ende: da.ende ?? null, entwurf: istEntwurfstag(c.sicht, d, c.heute) });
      }
      return { geltung: "eigene", parameter: { von: c.heute, bis: addDays(c.heute, FRAGEN_GRENZEN.dienstTage - 1) },
        antwort: { dienste: zeilen }, quellen: [{ rechnung: "plan", von: c.heute, bis: addDays(c.heute, FRAGEN_GRENZEN.dienstTage - 1) }] };
    } },
]);

export const FRAGEN_KATALOG = Object.freeze(ABFRAGEN.map((a) => Object.freeze({ id: a.id, titel: a.titel, beispiel: a.beispiel, rollen: Object.freeze([...a.rollen]) })));

/* Themen, die nie beantwortet werden: Gesundheit (Wortliste der Leck-Prüfung), Gründe für Abwesenheiten, Klärung, Betriebsrat. */
const ABGELEHNT = /krank|attest|diagnos|bescheinigung|gesundheit|arzt|schwanger|mutterschutz|behinder|grund|warum|wieso|weshalb|ursache|notiz|anmerkung|klaerung|klaerungs|betriebsrat|personalrat|br-mitglied/;

/** Welche Abfrage trifft die Frage? Höchste Summe der Gewichte; Gleichstand: Reihenfolge im Katalog. */
export function abfrageZuordnen(frage) {
  const t = falt(frage);
  let best = null, bestPunkte = 0;
  for (const a of ABFRAGEN) {
    let p = 0;
    for (const [re, g] of a.muster) if (re.test(t)) p += g;
    if (p > bestPunkte) { best = a; bestPunkte = p; }
  }
  return best ? best.id : null;
}

/**
 * @param {{
 *   sitzung: { rolle: string, person: string, bestand: string, betrieb?: number|string },
 *   frage: unknown,
 *   heute: string,
 *   ladeBestand: (raum: string) => any|Promise<any>,
 *   schalter?: { prozess: () => unknown, laufzeit: () => unknown },
 *   funktionenFreigegeben?: Iterable<string>,
 *   gateway?: { ausfuehren: (sitzung: any, anfrage: any) => Promise<any> } | null,
 *   bremse?: (person: string) => Promise<{ frei: boolean }> | { frei: boolean },
 * }} o
 */
export async function frageAnDaten(o) {
  const schalter = (o && o.schalter) || SCHALTER_AUS;
  if (!gatewayAn(schalter)) throw new GatewayFehler("KI_AUS", "Intelligence ist ausgeschaltet.");
  const sitzung = o.sitzung;
  if (!istObj(sitzung) || typeof sitzung.rolle !== "string" || typeof sitzung.person !== "string" || typeof sitzung.bestand !== "string"
    || !sitzung.person || !sitzung.bestand) throw new KiFehler("KI_NICHT_ANGEMELDET", "Nicht angemeldet.");
  if (!F6_ROLLEN.includes(sitzung.rolle)) throw new KiFehler("KI_ROLLE", "Diese Rolle darf die Funktion nicht auslösen.");
  if (!new Set(o.funktionenFreigegeben || []).has("F6")) throw new KiFehler("KI_FUNKTION", "Diese Funktion ist nicht freigeschaltet.");
  if (typeof o.frage !== "string" || [...o.frage].length > FRAGEN_GRENZEN.frage) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
  if (!tagGueltig(o.heute)) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
  const { text: bereinigt } = frageBereinigen(o.frage);
  if ([...bereinigt].length < FRAGE_MIN) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");

  /* Die Bremse (bestehender Mechanismus der Route, z. B. bremse("hilfe", …)) wird vom Aufrufer eingehängt. */
  if (o.bremse) {
    const b = await o.bremse(sitzung.person);
    if (!b || b.frei !== true) throw new GatewayFehler("KI_LIMIT", "Zu viele Anfragen.");
  }

  const kopf = { funktion: "F6", quelle: "berechnet", modell: { status: "nicht_verfuegbar", text: F6_TEXT_NICHT_VERFUEGBAR } };
  const t = falt(bereinigt);
  if (frageGesundheit(bereinigt) || ABGELEHNT.test(t)) return { ...kopf, status: "abgelehnt", text: F6_TEXT_ABGELEHNT };

  const id = abfrageZuordnen(bereinigt);
  const abfrage = ABFRAGEN.find((a) => a.id === id);
  const verfuegbar = ABFRAGEN.filter((a) => a.rollen.includes(sitzung.rolle)).map((a) => ({ id: a.id, titel: a.titel, beispiel: a.beispiel }));
  if (!abfrage) return { ...kopf, status: "keine_passende_abfrage", text: F6_TEXT_KEIN_TREFFER, verfuegbareAbfragen: verfuegbar };
  const kennung = { id: abfrage.id, titel: abfrage.titel };
  if (!abfrage.rollen.includes(sitzung.rolle)) return { ...kopf, status: "nicht_erlaubt", abfrage: kennung, text: F6_TEXT_NICHT_ERLAUBT, verfuegbareAbfragen: verfuegbar };

  const bestand = await o.ladeBestand(sitzung.bestand);
  const idx = betriebIndexAusSitzung(sitzung, bestand);
  if (idx === null) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  const sb = bestandFuerRolle(bestand, { ...sitzung, betrieb: idx });
  const m = sb && Array.isArray(sb.mandanten) ? sb.mandanten[0] : null;
  if (!istObj(m)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  /* Die fragende Person muss in genau diesem Betrieb stehen (die Rolle gilt „als Person im Betrieb“): sonst nichts — fail closed. */
  if (!liste(m.personen).some((p) => gleich(p.id, sitzung.person))) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  if (liste(m.personen).length > FRAGEN_GRENZEN.personen) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
  const sicht = { ...m, personen: liste(m.personen), dienstarten: liste(m.dienstarten), abwesenheiten: liste(m.abwesenheiten),
    abweichungen: istObj(m.abweichungen) ? m.abweichungen : {}, einspruenge: liste(m.einspruenge), qualifikationen: liste(m.qualifikationen),
    einheiten: liste(m.einheiten), einstellungen: istObj(m.einstellungen) ? m.einstellungen : {} };

  const tagParam = tagAusFrage(t, o.heute);
  if (tagParam === undefined) return { ...kopf, status: "parameter_ungueltig", abfrage: kennung, text: "Das Datum in der Frage ist ungültig." };
  const ctx = { sicht, rolle: sitzung.rolle, ich: sitzung.person, heute: o.heute, tag: tagParam || o.heute, tagGenannt: !!tagParam,
    monat: monatAusFrage(t, o.heute), qual: qualAusFrage(t, sicht), dienst: dienstAusFrage(t, sicht) };
  let r;
  try { r = mitTagesdatum(o.heute, () => abfrage.rechne(ctx)); } catch { throw new KiFehler("KI_INTERN", "Abfrage nicht berechenbar."); }

  /* Optionaler Formulierungstext: nur leitung/planer, nur Gateway, nur die bereinigte Frage (nie das Ergebnis). */
  let modell = kopf.modell;
  const darfModell = rolleDarf(funktionEintrag("F6"), sitzung.rolle);
  if (darfModell && o.gateway && typeof o.gateway.ausfuehren === "function") {
    try {
      const g = await o.gateway.ausfuehren(sitzung, { funktion: "F6", eingabe: { fremdtext: [`Frage: ${bereinigt}`] } });
      const text = g && g.status === "fertig" && g.ergebnis && typeof g.ergebnis.text === "string" ? g.ergebnis.text.trim() : "";
      const k = g && g.kennzeichnung;
      if (text && k && k.kiGestuetzt === true && k.entwurf === true)
        modell = { status: "fertig", text, kennzeichnung: { kiGestuetzt: true, entwurf: true, geprueft: k.geprueft === true } };
    } catch { /* der Text der Ausnahme verlässt das Modul nie: er könnte die Frage tragen */ }
  }
  return { funktion: "F6", quelle: "berechnet", status: "ok", abfrage: kennung, geltung: r.geltung, parameter: r.parameter,
    ...(r.hinweis ? { hinweis: r.hinweis } : {}), antwort: r.antwort, quellen: r.quellen, modell };
}
