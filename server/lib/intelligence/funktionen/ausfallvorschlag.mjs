/* ==========================================================================
   INTELLIGENCE — F3 AUSFALL-VORSCHLAG, SERVERSEITIGER KERN (WP-I20 Teil 1)

   Planung oder Leitung nennt AUSDRÜCKLICH, wer an welchem Tag (oder in welchem kurzen Zeitraum) ausfällt.
   Der Kern rechnet dafür aus der Engine (ersatzKandidaten → ersatzVorschlaege → hindernisBefunde: Ruhezeit,
   Qualifikation, Verfügbarkeit, Schutzregeln) die Kandidaten für den Dienst, den die Person an dem Tag hätte
   (direkt zulässig; Near-Miss, an dem nur die Ruhezeit hindert) — als Vorschlag, noch keine Änderung.

   NICHT hier: Ein Sprachmodell wird nicht gerufen (kein Gateway, kein Anbieter); der Text ist immer „nicht
   verfügbar“. Es wird nichts eingeteilt, geschrieben oder versendet. Die Vorbereitung für offene Krankmeldungen
   (RB-5) bleibt, wie sie ist: Dies ist der ausdrückliche Weg, den Planung/Leitung selbst auslöst.

   Reihenfolge (jede Stufe verweigert im Zweifel):
   1  Schalter gatewayAn(schalter) — Vorgabe AUS (KI_AUS), vor allem anderen.
   2  Sitzung: Rolle, Person, Raum, Betrieb nur aus der Sitzung.
   3  Funktion F3 und Rolle gegen die Positivliste (leitung, planer — nie Schichtverantwortung, Betriebsrat,
      Betreiber, Kunde, Beschäftigte).
   4  Freigabe der Funktion (funktionenFreigegeben enthält "F3").
   5  Anfrage: nur { ausfaelle: [{ personId, von, bis? }] } — höchstens 5 Ausfälle, je höchstens 7 Tage,
      zusammen höchstens 14 Tage; kein weiterer Schlüssel (kein Grund, keine Art, keine Rolle, kein Raum).
   6  Bestand nur über bestandFuerRolle (Rollensicht). Höchstens 400 Personen.
   7  Rechnung auf einer GEDACHTEN Kopie: die genannte Person fehlt an den genannten Tagen (neutral, ohne Grund,
      nur im Speicher), ebenso — nur als „fehlt“, nie als Kandidat — wer an dem Tag laut
      `ausgeschlossenAm` (Aufrufer, Pflicht; die Intelligence-Schicht liest keine Krankmeldungsfälle selbst,
      RB-5) auszuschließen ist und wer im Betriebsrat ist. Die Personen werden nach Kennung geordnet (Ausgabe
      unabhängig von der Reihenfolge im Bestand);
      der Fall selbst, Abwesenheitsart, Grund, Notizen, Klärungsmarkierung und Betriebsrat-Mitglieder kommen
      nicht in die Ausgabe (Betriebsrat-Mitglieder sind keine Kandidaten).
   8  Ausgabe: Kennungen, Name aus der Sicht, Dienstkürzel und -zeit, Punkte, Hinderung (Regelkennung),
      Spielraum und ruhezeit.ist in Minuten — nichts sonst. Deterministisch.
   ========================================================================== */
import { bestandFuerRolle } from "../../rechte.mjs";
import { addDays } from "../../regelwerk.mjs";
import { personTag } from "../../engine/plan.mjs";
import { mitTagesdatum } from "../../engine/zeit.mjs";
import { mitMerkmalen } from "../../engine/befunde.mjs";
import { ersatzKandidaten, ruheIst, KANDIDATEN_MAX } from "../../engine/ersatzfakten.mjs";
import { funktionEintrag, rolleDarf } from "../positivliste.mjs";
import { betriebIndexAusSitzung } from "../alias.mjs";
import { gatewayAn, SCHALTER_AUS } from "../gateway/schalter.mjs";
import { GatewayFehler } from "../gateway/codes.mjs";
import { KiFehler } from "../fehler.mjs";

export const F3_TEXT = "Der erklärende Text ist derzeit nicht verfügbar. Die Kandidaten unten sind vollständig und geprüft.";
export const F3_HINWEIS = "Vorschlag, noch keine Änderung";
export const AUSFALL_GRENZEN = Object.freeze({ ausfaelle: 5, tageJeAusfall: 7, tageGesamt: 14, personen: 400 });

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const istObj = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const liste = (w) => (Array.isArray(w) ? w.filter(istObj) : []);
const tagGueltig = (s) => typeof s === "string" && TAG.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const tageZwischen = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const gleich = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const EINGABE = () => new KiFehler("KI_EINGABE", "Anfrage ungültig.");

/** Strenge Prüfung der Anfrage; liefert [{ personId, tage: [JJJJ-MM-TT…] }]. */
function anfrageLesen(anfrage) {
  if (!istObj(anfrage) || Object.keys(anfrage).some((k) => k !== "ausfaelle") || !Array.isArray(anfrage.ausfaelle)
    || anfrage.ausfaelle.length < 1 || anfrage.ausfaelle.length > AUSFALL_GRENZEN.ausfaelle) throw EINGABE();
  let gesamt = 0;
  const aus = anfrage.ausfaelle.map((a) => {
    if (!istObj(a) || Object.keys(a).some((k) => k !== "personId" && k !== "von" && k !== "bis")) throw EINGABE();
    if (!(typeof a.personId === "string" && a.personId.length > 0 && a.personId.length <= 64)) throw EINGABE();
    const bis = a.bis === undefined ? a.von : a.bis;
    if (!tagGueltig(a.von) || !tagGueltig(bis) || bis < a.von) throw EINGABE();
    const n = tageZwischen(a.von, bis) + 1;
    gesamt += n;
    if (n > AUSFALL_GRENZEN.tageJeAusfall || gesamt > AUSFALL_GRENZEN.tageGesamt) throw EINGABE();
    const tage = [];
    for (let d = a.von; d <= bis; d = addDays(d, 1)) tage.push(d);
    return { personId: a.personId, tage };
  });
  return aus;
}

function sichtVon(bestand, sitzung, idx) {
  const sb = bestandFuerRolle(bestand, { ...sitzung, betrieb: idx });
  const m = sb && Array.isArray(sb.mandanten) ? sb.mandanten[0] : null;
  if (!istObj(m)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  return m;
}

/* Rechenbare Arbeitskopie: nur Listen, die die Engine braucht; die Sicht bleibt unberührt. */
const nachKennung = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
const rechenbar = (m) => ({ ...m, personen: liste(m.personen).sort(nachKennung), dienstarten: liste(m.dienstarten),
  abwesenheiten: liste(m.abwesenheiten), abweichungen: istObj(m.abweichungen) ? m.abweichungen : {},
  einspruenge: liste(m.einspruenge), qualifikationen: liste(m.qualifikationen), einheiten: liste(m.einheiten),
  einstellungen: istObj(m.einstellungen) ? m.einstellungen : {} });

const name = (p) => `${p.vorname ?? ""} ${p.nachname ?? ""}`.trim();

/**
 * @param {{
 *   sitzung: { rolle: string, person: string, bestand: string, betrieb?: number|string },
 *   anfrage: { ausfaelle: { personId: string, von: string, bis?: string }[] },
 *   heute: string,
 *   ladeBestand: (raum: string) => any|Promise<any>,
 *   ausgeschlossenAm: (sicht: any, tag: string) => Iterable<string|number>,   // Pflicht: Personen, die an dem Tag nie Kandidat sind
 *   schalter?: { prozess: () => unknown, laufzeit: () => unknown },
 *   funktionenFreigegeben?: Iterable<string>,
 * }} o
 */
export async function ausfallVorschlag(o) {
  const schalter = (o && o.schalter) || SCHALTER_AUS;
  if (!gatewayAn(schalter)) throw new GatewayFehler("KI_AUS", "Intelligence ist ausgeschaltet.");
  const sitzung = o.sitzung;
  if (!istObj(sitzung) || typeof sitzung.rolle !== "string" || typeof sitzung.person !== "string" || typeof sitzung.bestand !== "string"
    || !sitzung.person || !sitzung.bestand) throw new KiFehler("KI_NICHT_ANGEMELDET", "Nicht angemeldet.");
  if (!rolleDarf(funktionEintrag("F3"), sitzung.rolle)) throw new KiFehler("KI_ROLLE", "Diese Rolle darf die Funktion nicht auslösen.");
  if (!new Set(o.funktionenFreigegeben || []).has("F3")) throw new KiFehler("KI_FUNKTION", "Diese Funktion ist nicht freigeschaltet.");
  const ausfaelle = anfrageLesen(o.anfrage);
  if (!tagGueltig(o.heute)) throw EINGABE();
  /* Fail closed: ohne die Ausschlussfunktion (offene Fälle gehören nicht in diese Schicht) wird nichts gerechnet. */
  if (typeof o.ausgeschlossenAm !== "function") throw new KiFehler("KI_INTERN", "Verdrahtung unvollständig.");

  const bestand = await o.ladeBestand(sitzung.bestand);
  const idx = betriebIndexAusSitzung(sitzung, bestand);
  if (idx === null) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  const sicht = sichtVon(bestand, sitzung, idx);
  if (liste(sicht.personen).length > AUSFALL_GRENZEN.personen) throw EINGABE();

  const r = rechenbar(sicht);
  const imFall = (pid, d) => { let l; try { l = [...o.ausgeschlossenAm(sicht, d)]; } catch { throw new KiFehler("KI_INTERN", "Ausschluss nicht berechenbar."); } return l.some((x) => gleich(x, pid)); };
  const keinKandidat = (p) => p.rolle === "betriebsrat";

  const ergebnisse = mitTagesdatum(o.heute, () => mitMerkmalen(() => false, () => {
    const aus = [];
    for (const a of ausfaelle) {
      const p = r.personen.find((x) => gleich(x.id, a.personId));
      for (const d of a.tage) {
        const kopf = { personId: a.personId, datum: d, hinweis: F3_HINWEIS };
        if (!p) { aus.push({ ...kopf, name: null, status: "unbekannt", dienst: null, direkt: [], nahe: [] }); continue; }
        /* Der Dienst, den die Person ohne den Ausfall hätte: die Sicht ohne ihre Abwesenheiten am Tag. */
        const ohneAbw = { ...r, abwesenheiten: r.abwesenheiten.filter((x) => !gleich(x.personId, p.id)) };
        let dienstId = null;
        try { dienstId = personTag(ohneAbw, p, d).dienstId || null; } catch { dienstId = null; }
        const da = dienstId ? r.dienstarten.find((x) => gleich(x.id, dienstId)) : null;
        if (!da) { aus.push({ ...kopf, name: name(p), status: "kein_dienst", dienst: null, direkt: [], nahe: [] }); continue; }
        /* Gedacht: genau diese Person fehlt an genau diesem Tag (neutral, nur im Speicher). */
        const fehlen = [p, ...r.personen.filter((q) => !gleich(q.id, p.id) && (keinKandidat(q) || imFall(q.id, d)))];
        const gedacht = { ...r, abwesenheiten: [...r.abwesenheiten, ...fehlen.map((q, i) => ({ id: `f3-gedacht-${i}`, personId: q.id, art: "abwesend", von: d, bis: d }))] };
        try {
          const k = ersatzKandidaten(gedacht, d, String(da.id));
          const person = (id) => r.personen.find((x) => gleich(x.id, id));
          const direkt = k.direkt.slice(0, KANDIDATEN_MAX)
            .map((c) => ({ personId: String(c.personId), name: name(person(c.personId)), punkte: c.punkte,
              ruheIstMin: ruheIst(gedacht, person(c.personId), d, da) }));
          const nahe = k.nahe.slice(0, KANDIDATEN_MAX)
            .map((c) => ({ personId: String(c.personId), name: name(person(c.personId)), punkte: c.punkte, hinderung: c.hinderung,
              spielraumMin: c.spielraumMin, ruheIstMin: c.ruheVorMin }));
          aus.push({ ...kopf, name: name(p), status: "ok",
            dienst: { id: String(da.id), kurz: typeof da.kurz === "string" ? da.kurz : (typeof da.name === "string" ? da.name : String(da.id)),
              beginn: da.start ?? null, ende: da.ende ?? null },
            direkt, nahe });
        } catch { aus.push({ ...kopf, name: name(p), status: "nicht_rechenbar", dienst: null, direkt: [], nahe: [] }); }
      }
    }
    return aus;
  }));
  return { funktion: "F3", quelle: "berechnet", zusammenfassung: { verfuegbar: false, text: F3_TEXT }, ergebnisse };
}
