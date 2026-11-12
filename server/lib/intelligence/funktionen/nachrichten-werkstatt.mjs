/* ==========================================================================
   INTELLIGENCE — F5 NACHRICHTEN-WERKSTATT, SERVERSEITIGER KERN (WP-I30 Teil 1)

   Die Planung/Leitung entwirft eine Mitteilung an Beschäftigte („Schichtwechsel“, „Planänderung“, „Dienstplan veröffentlicht“,
   „Erinnerung“). Die Werkstatt liefert einen TEXTENTWURF aus einem GESCHLOSSENEN Katalog deutscher, neutraler Vorlagen und die
   Liste der Personen, die die Absenderin ansprechen darf. SIE SENDET, SPEICHERT UND PLANT NICHTS: der Versand läuft später über das
   bestehende Mitteilungssystem (mitteilungen.mjs, zustellregeln.mjs) mit dessen eigenen Sperren (Entwurfsregel, RB-4, Bremsen).

   Platzhalter sind typisiert (Datum, Monat, Dienstart, Uhrzeit, Einheit) und werden NUR gefüllt aus der Rollensicht der Absenderin
   (bestandFuerRolle) und aus den ausdrücklichen Anfrageparametern. Es gibt keinen Freitext, keinen Namen, keine Abwesenheit,
   keinen Grund, keine Klärungsmarkierung, kein Betriebsratsdatum, keine Ist-Zeit.

   Reihenfolge (jede Stufe verweigert im Zweifel):
   1  Schalter gatewayAn(schalter) — Vorgabe AUS (KI_AUS), vor allem anderen.
   2  Sitzung (Rolle, Person, Raum, Betrieb stammen aus der Sitzung, nie aus der Anfrage); Rolle gegen die Positivliste F5
      (leitung, planer; nie Schichtverantwortung, Beschäftigte, Betriebsrat, Kunde, Betreiber); Freigabe „F5“.
   3  Anfrage: genau { vorlage, … } mit den Parametern, die die Vorlage verlangt (kein weiterer Schlüssel).
   4  Sicht der Rolle; die Absenderin muss im Betrieb der Sitzung stehen; Dienstart und Einheit müssen in der Sicht stehen.
   5  Entwurfsregel: Ein Tag oder Monat, der für Beschäftigte noch Entwurf ist (planfreigabe.mjs), wird NICHT in einen an Beschäftigte
      gerichteten Text geschrieben: status „abgelehnt“, Grund „entwurf“. Ebenso ein Tag in der Vergangenheit.
   6  Entwurfstext aus der Vorlage (deterministisch). Optional und nur über das übergebene Gateway: Formulierungshilfe auf der
      Vorlage MIT PLATZHALTERN (das Modell bekommt nie ein Datum, eine Einheit, einen Dienst oder einen Namen); jeder Platzhalter
      muss genau einmal im Ergebnis stehen, sonst gilt der deterministische Text. Ohne Gateway/Anbieter: „nicht verfügbar“.
   7  Verbotsprüfung des ENDGÜLTIGEN Textes und des Betreffs (Leck-Prüfung: Gesundheitsbegriffe, Kontaktdaten, Namen aus der Sicht;
      dazu E-Mail- und Telefonmuster): bei Befund wird der Entwurf verweigert, nicht gezeigt (Grund „verbotener_inhalt“).
   8  Empfänger: Beschäftigte (mitarbeiter, subplaner) des Betriebs in der Sicht, am Bezugstag im Dienstverhältnis, bei Tagesvorlagen
      der genannten Einheit; ohne Absenderin, ohne Betriebsrat, ohne Leitung/Planung. Abwesenheiten, Krankmeldungen und Klärung
      beeinflussen die Liste nie (sonst ließe sie etwas erkennen). Höchstens EMPFAENGER_MAX (gekuerzt).

   Kein Schreiben, kein Netz, keine Umgebungsvariable, kein Protokoll von Text oder Parametern.
   ========================================================================== */
import { bestandFuerRolle } from "../../rechte.mjs";
import { einheitAm } from "../../fachpruefung.mjs";
import { istEntwurfstag, laufenderTag } from "../../planfreigabe.mjs";
import { TITEL_MAX, TEXT_MAX } from "../../mitteilungen.mjs";
import { funktionEintrag, rolleDarf } from "../positivliste.mjs";
import { betriebIndexAusSitzung } from "../alias.mjs";
import { sperrlisteBilden, textPruefen, normalisieren } from "../leckpruefung.mjs";
import { gatewayAn, SCHALTER_AUS } from "../gateway/schalter.mjs";
import { GatewayFehler } from "../gateway/codes.mjs";
import { KiFehler } from "../fehler.mjs";

export const F5_GRENZEN = Object.freeze({ empfaenger: 200, personen: 1000, text: TEXT_MAX, betreff: TITEL_MAX });
export const F5_ROLLEN = Object.freeze(["leitung", "planer"]);
export const F5_EMPFAENGER_ROLLEN = Object.freeze(["mitarbeiter", "subplaner"]);
export const F5_TEXT_NICHT_VERFUEGBAR = "nicht verfügbar";
export const F5_GRUENDE = Object.freeze({
  entwurf: "Dieser Zeitraum ist im Dienstplan noch nicht veröffentlicht. Eine Nachricht an Beschäftigte dazu ist erst nach der Veröffentlichung möglich.",
  vergangen: "Dieser Tag liegt in der Vergangenheit. Dazu wird keine Nachricht entworfen.",
  verbotener_inhalt: "Der Entwurf enthält Angaben, die nicht in eine Nachricht an Beschäftigte gehören. Er wird nicht angezeigt.",
});

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const UHR = /^([01]\d|2[0-3]):[0-5]\d$/;
const istObj = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const liste = (w) => (Array.isArray(w) ? w.filter(istObj) : []);
const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const tagGueltig = (t) => typeof t === "string" && TAG.test(t) && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;

const datumText = (t) => { const d = new Date(`${t}T00:00:00Z`); return `${WOCHENTAGE[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const monatText = (m) => `${MONATE[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const letzterTag = (m) => { const [j, mo] = m.split("-").map(Number); return new Date(Date.UTC(j, mo, 0)).toISOString().slice(0, 10); };

/**
 * Der geschlossene Katalog. `betreff` und `text` tragen Platzhalter {Datum} {Monat} {Dienstart} {Uhrzeit} {Einheit};
 * `parameter` nennt die Anfrageparameter, die die Vorlage verlangt (Uhrzeit folgt aus der Dienstart der Sicht).
 */
export const NACHRICHTEN_VORLAGEN = Object.freeze([
  { id: "schichtwechsel", titel: "Schichtwechsel", parameter: ["datum", "dienstart", "einheit"],
    betreff: "Schichtwechsel am {Datum}",
    text: "Guten Tag, es gibt einen Schichtwechsel. Datum: {Datum}. Betroffen ist der Dienst {Dienstart} ({Uhrzeit}) im Bereich {Einheit}. Bitte prüfen Sie Ihren Dienstplan in CENTRIC. Vielen Dank." },
  { id: "planaenderung", titel: "Planänderung", parameter: ["datum", "einheit"],
    betreff: "Planänderung am {Datum}",
    text: "Guten Tag, im Dienstplan für den Bereich {Einheit} gibt es eine Änderung. Datum: {Datum}. Bitte prüfen Sie Ihren Dienstplan in CENTRIC. Vielen Dank." },
  { id: "dienstplan_veroeffentlicht", titel: "Dienstplan veröffentlicht", parameter: ["monat"],
    betreff: "Dienstplan {Monat} veröffentlicht",
    text: "Guten Tag, der Dienstplan ist veröffentlicht. Monat: {Monat}. Bitte schauen Sie in CENTRIC nach Ihren Diensten. Vielen Dank." },
  { id: "erinnerung_dienstplan", titel: "Erinnerung Dienstplan", parameter: ["monat"],
    betreff: "Erinnerung: Dienstplan {Monat}",
    text: "Guten Tag, eine freundliche Erinnerung: Bitte prüfen Sie Ihren Dienstplan in CENTRIC. Monat: {Monat}. Vielen Dank." },
  { id: "dienstbeginn_erinnerung", titel: "Erinnerung Dienstbeginn", parameter: ["datum", "dienstart", "einheit"],
    betreff: "Erinnerung: Dienst am {Datum}",
    text: "Guten Tag, eine freundliche Erinnerung an Ihren Dienst. Datum: {Datum}. Dienst: {Dienstart} ({Uhrzeit}), Bereich: {Einheit}. Bitte prüfen Sie Ihren Dienstplan in CENTRIC. Vielen Dank." },
].map((v) => Object.freeze({ ...v, parameter: Object.freeze(v.parameter) })));

const PLATZHALTER = /\{([A-Za-zÄÖÜäöüß]+)\}/g;
const platzhalterIn = (s) => [...String(s).matchAll(PLATZHALTER)].map((m) => m[1]);
const fuellen = (s, werte) => s.replace(PLATZHALTER, (_, k) => (Object.prototype.hasOwnProperty.call(werte, k) ? werte[k] : "\u0000"));

/* Die Muster der Verbotsprüfung kommen aus der Leck-Prüfung; zusätzlich harte Muster für Adresse und Telefon. */
const MUSTER_KONTAKT = /@|https?:|www\.|mailto:|tel:|\+\s?\d|(?:\d[\s/().-]?){7,}/i;

/* Zusätzliche Gesundheits-/Schutzstämme (nach Normalisierung) über die Wortliste der Leck-Prüfung hinaus: lieber zu viel verweigern. */
const GESUNDHEIT_STAMM = ["krank", "erkrank", "attest", "diagnos", "grippe", "influenza", "covid", "corona", "fieber", "chemo", "klinik", "schwanger",
  "mutterschutz", "reha", "therapie", "behinder", "gesundheit", "arbeitsunfaehig", "bescheinigung", "klaerung", "betriebsrat"];
const MUSTER_ARZT = /(^| )(arzt|aerzt)/;

function anfrageLesen(anfrage) {
  if (!istObj(anfrage) || typeof anfrage.vorlage !== "string") throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
  const v = NACHRICHTEN_VORLAGEN.find((x) => x.id === anfrage.vorlage);
  if (!v) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
  const erlaubt = new Set(["vorlage", ...v.parameter]);
  if (Object.keys(anfrage).some((k) => !erlaubt.has(k)) || v.parameter.some((p) => typeof anfrage[p] !== "string" || !anfrage[p])) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
  if (v.parameter.includes("datum") && !tagGueltig(anfrage.datum)) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
  if (v.parameter.includes("monat") && !MONAT.test(anfrage.monat)) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
  return { v, p: anfrage };
}

/** Prüft Betreff und Text; `true` heißt: verboten. */
function verboten(texte, sperrliste) {
  try {
    for (const t of texte) {
      if (typeof t !== "string" || !t.trim() || t.includes("\u0000") || /\{[^}]*\}/.test(t)) return true;
      if (MUSTER_KONTAKT.test(t)) return true;
      const n = normalisieren(t);
      if (GESUNDHEIT_STAMM.some((s) => n.includes(s)) || MUSTER_ARZT.test(n)) return true;
      if (!textPruefen(t, sperrliste).ok) return true;
    }
    return false;
  } catch { return true; }
}

/**
 * @param {{
 *   sitzung: { rolle: string, person: string, bestand: string, betrieb?: number|string },
 *   anfrage: { vorlage: string, datum?: string, monat?: string, dienstart?: string, einheit?: string },
 *   heute?: string,
 *   ladeBestand: (raum: string) => any|Promise<any>,
 *   schalter?: { prozess: () => unknown, laufzeit: () => unknown },
 *   funktionenFreigegeben?: Iterable<string>,
 *   gateway?: { ausfuehren: (sitzung: any, anfrage: any) => Promise<any> } | null,
 * }} o
 */
export async function nachrichtenEntwurf(o) {
  const schalter = (o && o.schalter) || SCHALTER_AUS;
  if (!gatewayAn(schalter)) throw new GatewayFehler("KI_AUS", "Intelligence ist ausgeschaltet.");
  const sitzung = o.sitzung;
  if (!istObj(sitzung) || typeof sitzung.rolle !== "string" || typeof sitzung.person !== "string" || typeof sitzung.bestand !== "string"
    || !sitzung.person || !sitzung.bestand) throw new KiFehler("KI_NICHT_ANGEMELDET", "Nicht angemeldet.");
  if (!F5_ROLLEN.includes(sitzung.rolle) || !rolleDarf(funktionEintrag("F5"), sitzung.rolle)) throw new KiFehler("KI_ROLLE", "Diese Rolle darf die Funktion nicht auslösen.");
  if (!new Set(o.funktionenFreigegeben || []).has("F5")) throw new KiFehler("KI_FUNKTION", "Diese Funktion ist nicht freigeschaltet.");
  const { v, p } = anfrageLesen(o.anfrage);
  const heute = o.heute === undefined ? laufenderTag() : o.heute;
  if (!tagGueltig(heute)) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");

  const bestand = await o.ladeBestand(sitzung.bestand);
  const idx = betriebIndexAusSitzung(sitzung, bestand);
  if (idx === null) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  const sb = bestandFuerRolle(bestand, { ...sitzung, betrieb: idx });
  const m = sb && Array.isArray(sb.mandanten) ? sb.mandanten[0] : null;
  if (!istObj(m)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  const personen = liste(m.personen);
  if (!personen.some((x) => String(x.id) === String(sitzung.person))) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  if (personen.length > F5_GRENZEN.personen) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");

  const kopf = { funktion: "F5", quelle: "vorlage", gesendet: false, vorlage: { id: v.id, titel: v.titel }, modell: { status: "nicht_verfuegbar", text: F5_TEXT_NICHT_VERFUEGBAR } };
  const abgelehnt = (grund) => ({ ...kopf, status: "abgelehnt", grund, text: F5_GRUENDE[grund] });

  /* Platzhalterwerte: nur aus der Sicht und den Parametern; unbekannte Dienstart/Einheit sind ein Eingabefehler. */
  const werte = {};
  let bezug;
  if (v.parameter.includes("datum")) { werte.Datum = datumText(p.datum); bezug = p.datum; }
  if (v.parameter.includes("monat")) { werte.Monat = monatText(p.monat); bezug = letzterTag(p.monat); }
  if (v.parameter.includes("dienstart")) {
    const d = liste(m.dienstarten).find((x) => String(x.id) === p.dienstart);
    if (!d || typeof d.start !== "string" || typeof d.ende !== "string" || !UHR.test(d.start) || !UHR.test(d.ende)) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
    const name = typeof d.name === "string" && d.name.trim() ? d.name.trim() : (typeof d.kurz === "string" ? d.kurz.trim() : "");
    if (!name) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
    werte.Dienstart = name; werte.Uhrzeit = `${d.start} bis ${d.ende} Uhr`;
  }
  let einheitId = null;
  if (v.parameter.includes("einheit")) {
    const e = liste(m.einheiten).find((x) => String(x.id) === p.einheit);
    if (!e || typeof e.name !== "string" || !e.name.trim()) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
    werte.Einheit = e.name.trim(); einheitId = String(e.id);
  }

  /* Entwurfsregel: nichts Unveröffentlichtes in einen Text an Beschäftigte. */
  if (v.parameter.includes("datum") && p.datum < heute) return abgelehnt("vergangen");
  if (istEntwurfstag(m, bezug, heute)) return abgelehnt("entwurf");

  const sperrliste = sperrlisteBilden({ personen }, { raum: "" });
  let text = fuellen(v.text, werte);
  const betreff = fuellen(v.betreff, werte);

  /* Optionale Formulierungshilfe: nur über das Gateway, nur auf der Vorlage mit Platzhaltern (nie Datum, Dienst, Einheit, Namen). */
  let modell = kopf.modell;
  if (o.gateway && typeof o.gateway.ausfuehren === "function") {
    try {
      const g = await o.gateway.ausfuehren(sitzung, { funktion: "F5", eingabe: { fremdtext: [v.text] } });
      const t = g && g.status === "fertig" && g.ergebnis && typeof g.ergebnis.text === "string" ? g.ergebnis.text.trim() : "";
      const k = g && g.kennzeichnung;
      const soll = platzhalterIn(v.text).sort().join("|");
      if (t && k && k.kiGestuetzt === true && k.entwurf === true && platzhalterIn(t).sort().join("|") === soll) {
        const gefuellt = fuellen(t, werte);
        if ([...gefuellt].length <= F5_GRENZEN.text && !verboten([gefuellt], sperrliste)) {
          text = gefuellt;
          modell = { status: "fertig", kennzeichnung: { kiGestuetzt: true, entwurf: true, geprueft: k.geprueft === true } };
        }
      }
    } catch { /* der Text der Ausnahme verlässt das Modul nie */ }
  }

  if ([...text].length > F5_GRENZEN.text || [...betreff].length > F5_GRENZEN.betreff || verboten([betreff, text], sperrliste)) return abgelehnt("verbotener_inhalt");

  /* Empfänger: nur Beschäftigte der Sicht, am Bezugstag im Dienstverhältnis; Abwesenheiten bleiben unberücksichtigt. */
  const alle = personen.filter((x) => F5_EMPFAENGER_ROLLEN.includes(x.rolle) && String(x.id) !== String(sitzung.person)
    && (!x.eintritt || (typeof x.eintritt === "string" && x.eintritt <= bezug)) && (!x.austritt || (typeof x.austritt === "string" && x.austritt >= bezug))
    && (einheitId === null || (v.parameter.includes("datum") ? einheitAm(x, p.datum) === einheitId : true)));
  const empfaenger = alle.slice(0, F5_GRENZEN.empfaenger).map((x) => ({ personId: String(x.id), name: `${x.vorname ?? ""} ${x.nachname ?? ""}`.trim() }));
  return { ...kopf, status: "ok", entwurf: { betreff, text }, empfaenger, gekuerzt: alle.length > empfaenger.length, modell };
}
