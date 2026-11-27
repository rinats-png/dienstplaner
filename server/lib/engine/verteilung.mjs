/* ==========================================================================
   VERTEILUNG IM PLANER — erste Stufe (WP-I7 Teil 7, Betreiberentscheidung 27.11.)

   Größe: Nachtdienste je Person im Kalendermonat des Planerlaufs, aus der vorhandenen Vorgabe
   `verteilungsregel` { groesse: "nachtdienste", maxAbweichung } (vorgaben.mjs, Regelbaukasten). Weitere Größen
   (Wochenend-, Feiertagsdienste, Arbeitsstunden) kommen als weiterer Schlüssel in VERTEILUNG_GROESSEN
   (vorgabenwirkung.mjs) und als weitere Zählung hier hinzu; die Bewertung (Vergleichsgruppe, Baukasten, Rang) bleibt.

   Rang: nachgelagert. Gesetz, Besetzung, Muss und Soll stehen davor (RANGFOLGE, planer.mjs); jede Einteilung des
   Planers besteht weiter dieselbe Einsatzprüfung. Die Stärke einer Verteilungsvorgabe (Muss/Soll) hebt sie NICHT in den
   Rang Muss/Soll; Wunsch-Stärke gehört zum Rang Wunsch (nicht bewertet).

   Definition (aus der vorhandenen Fachlogik; Annahmen im Nachweis WP-I7 Teil 7):
   - Nachtdienst: Tag d des Monats, an dem personTag einen Dienst nennt, dessen Nachtanteil die Nachtschwelle des
     Betriebs erreicht (nachtAnteil ≥ nachtschwelle; wie kennzahlen.verteilung und die Nachtblöcke des Planers). Gezählt
     wird der Plan, wie er ist: Bestand, Schichtfolge, angeheftete und eigene Einteilungen.
   - Vergleichsgruppe je Vorgabe: Personen, für die die Vorgabe an JEDEM Tag des Monats gilt (Geltung, Gültigkeit,
     Ausnahmen — vorgabeGeltung, dieselbe Stelle wie die Wirkung je Einteilung), im Schichtdienst (nicht gesperrt), den
     ganzen Monat beschäftigt (Eintritt/Austritt) und an jedem Tag nachtdienstfähig (für mindestens eine Nachtdienstart
     kein harter Schutz-/Einsatzbefund, keine Einschränkung „keine Nacht“).
     Nicht in der Gruppe (sichtbar unter `ausserhalb`): an keinem Tag nachtdienstfähig, nicht im Schichtdienst, ganzer
     Monat Urlaub/Krankheit. Keine Geltung an keinem Tag oder nicht beschäftigt: gehört nicht dazu (nicht gelistet).
     Nicht bewertbar (Wert unbekannt ⇒ nie „erfüllt“): Geltung nur an einem Teil des Monats oder nicht entscheidbar,
     Eintritt/Austritt im Monat, nur an einem Teil der Tage nachtdienstfähig, Abwesenheit anderer Art als Urlaub/Krankheit,
     Teilzeitquote nicht bestimmbar (nur bei anteiliger Berechnung).
   - Wert: Nachtdienste n; Urlaub und Krankheit werden aus Zähler und Vergleichsgrundlage herausgenommen (Entscheidung
     26.11., VORGABEN_ZAEHLUNG_OHNE): Wert = n · T / (T − U) (T Tage des Monats, U Urlaubs-/Krankheitstage). Teilzeit
     anteilig AUSSCHLIESSLICH bei `ausnahmen.teilzeitAnteilig === true`: Wert / Teilzeitquote (teilzeitQuote, Wochenstunden
     zur Soll-Wochenarbeitszeit); sonst wird Teilzeit nicht umgerechnet. Keine fachliche Rundung (6 Stellen gegen
     Gleitkomma-Rauschen; Vergleich wie der Baukasten mit 1e-9).
   - maxAbweichung: größte zulässige Spannweite (höchster minus niedrigster Wert der Gruppe) — die Rechnung des
     Regelbaukastens (verteilungsregel), nicht nachgebaut: Er entscheidet erfüllt/verletzt/offen/nicht anwendbar.
     Abweichung je Person = Wert − niedrigster Wert; Überschreitung = max(0, Spannweite − maxAbweichung).
   - Rang „Verteilung“ = Summe der Überschreitungen der Muss/Soll-Verteilungsvorgaben (eine Einheit: Nachtdienste); nur
     bewertet, wenn mindestens eine Vorgabe erfüllt oder verletzt ist und keine offen oder nicht bewertet ist. Sonst
     null („nicht bewertet“, nie „erfüllt“).
   Rein: keine Uhr, keine Ablage. Ergebnis mit Kennungen und Zahlen, ohne Namen und ohne Gründe aus Schutzmerkmalen.
   ========================================================================== */
import { imDienst, einheitAm, nachtAnteil, nachtschwelle } from "../fachpruefung.mjs";
import { schutzBefundeFuer } from "../schutzpruefung.mjs";
import { aktiveVorgaben, vorgabeAlsRegel, vorgabeRegelId, VORGABEN_WIRKUNG_GRENZE } from "../vorgaben.mjs";
import { pruefeRegel } from "../regelbaukasten-erweitert.mjs";
import { vorgabeGeltung, verteilungGroesse, teilzeitQuote, VORGABEN_ZAEHLUNG_OHNE } from "../vorgabenwirkung.mjs";
import { abwesenheitAm, besetzung } from "./plan.mjs";

/** Gründe je Person (Kennungen, ohne Schutzmerkmal). */
export const VERTEILUNG_GRUENDE = Object.freeze({
  geltungTeilweise: "geltung_teilweise", geltungOffen: "geltung_offen", eintrittAustritt: "eintritt_austritt",
  nachtTeilweise: "nacht_teilweise_moeglich", abwesenheit: "abwesenheit", teilzeitquote: "teilzeitquote_offen",
  keineNacht: "kein_nachtdienst_moeglich", schichtdienst: "nicht_im_schichtdienst", ganzAbwesend: "ganzer_monat_abwesend",
});
const G = VERTEILUNG_GRUENDE;
/** Sichtbare Texte, wenn eine Vorgabe nicht in den Rang eingeht (Review #605 C-3). */
export const VERTEILUNG_HINWEIS = Object.freeze({
  geltung_teilweise: "Verteilung nicht bewertbar: Geltung nur teilweise im Monat (Ausnahmezeitraum oder Gültigkeit im Monat).",
  personen_nicht_bewertbar: "Verteilung nicht bewertbar: Werte einzelner Personen unbekannt (siehe nichtBewertbar).",
});

const sauber = (x) => Math.round(x * 1e6) / 1e6;
const istNacht = (da, einst) => !!da && nachtAnteil(da, einst) >= nachtschwelle(einst);

/** Aktive Verteilungsvorgaben des Betriebs (alle Größen; nicht Bewertbares wird im Ergebnis genannt). */
const verteilungsVorgaben = (m) => aktiveVorgaben(m && m.vorgaben).filter((v) => v.regelart === "verteilungsregel");

/**
 * Aufwand der Vorbereitung in Personentagen (vorab beim Planer angemeldet): je Person und Tag die Nachtdienstfähigkeit (je
 * Nachtdienstart eine Schutzprüfung) und je Vorgabe die Geltung. 0 = keine Verteilungsvorgabe.
 * @param {any} m @param {string[]} tage
 */
export function verteilungAufwand(m, tage) {
  const n = verteilungsVorgaben(m).length;
  if (!n) return 0;
  const nacht = (Array.isArray(m.dienstarten) ? m.dienstarten : []).filter((da) => istNacht(da, m.einstellungen)).length;
  return tage.length * Math.max(1, m.personen.length) * (nacht + Math.min(n, VORGABEN_WIRKUNG_GRENZE.aktive) + 2);
}

/**
 * Vorbereitung je Aufruf (hängt nicht an den Einteilungen des Planers): Vorgaben, Vergleichsgruppen, Faktoren.
 * `erlaubt === false`: Aufwand nicht verfügbar ⇒ jede Vorgabe „nicht bewertet“ (Grund „aufwand“). null: keine Verteilungsvorgabe.
 * @param {any} m @param {string[]} tage Tage des Kalendermonats @param {boolean} [erlaubt]
 */
export function verteilungVorbereiten(m, tage, erlaubt = true) {
  const liste = verteilungsVorgaben(m);
  if (!liste.length) return null;
  const einst = m.einstellungen;
  const nachtDA = m.dienstarten.filter((da) => istNacht(da, einst));
  const nachtIds = new Set(nachtDA.map((da) => da.id));
  const sortiert = [...liste].sort((a, b) => (a.prioritaet - b.prioritaet) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const kopf = (v) => ({ vorgabeId: String(v.id), regelId: vorgabeRegelId(v), staerke: v.staerke, groesse: verteilungGroesse(v),
    maxAbweichung: Number(v.parameter && v.parameter.maxAbweichung) });
  const nicht = (v, status, grund) => ({ ...kopf(v), status, grund, mitglieder: new Map(), unbekannt: new Map(), ausserhalb: [] });
  if (erlaubt === false) return { nachtIds, tage, regeln: sortiert.map((v) => (v.staerke === "wunsch" ? nicht(v, "nicht_bewertet", "wunsch") : nicht(v, "nicht_bewertet", "aufwand"))) };

  /* Je Person die Tagesfakten des Monats (einmal, für alle Vorgaben). */
  const T = tage.length;
  const fakten = new Map();
  for (const p of m.personen) {
    if (!p || typeof p !== "object") continue;
    let beschaeftigt = 0, nachtGesperrt = 0, urlaubKrank = 0, andereAbw = 0;
    for (const d of tage) {
      if (!imDienst(p, d)) continue;
      beschaeftigt++;
      const keineNacht = !!(p.einschraenkungen && typeof p.einschraenkungen === "object" && p.einschraenkungen.keineNacht === true);
      if (keineNacht || !nachtDA.some((da) => !schutzBefundeFuer(p, da, d, einst).some((b) => b.hart))) nachtGesperrt++;
      const a = abwesenheitAm(m, p.id, d);
      if (a) { if (VORGABEN_ZAEHLUNG_OHNE.includes(String(a.art))) urlaubKrank++; else andereAbw++; }
    }
    fakten.set(p, { beschaeftigt, nachtGesperrt, urlaubKrank, andereAbw });
  }

  const gilt = vorgabeGeltung(m);
  const regeln = sortiert.map((v, i) => {
    if (v.staerke === "wunsch") return nicht(v, "nicht_bewertet", "wunsch");
    if (i >= VORGABEN_WIRKUNG_GRENZE.aktive) return nicht(v, "nicht_bewertet", "zu_viele_vorgaben");
    if (!verteilungGroesse(v)) return nicht(v, "nicht_bewertet", "groesse_nicht_bewertet");
    let regel;
    /* Der Baukasten ist der Prüfer der Parameter (wirft bei unvollständigen Parametern, Personenmerkmal). */
    try { regel = vorgabeAlsRegel({ ...v, gueltigAb: null, gueltigBis: null }, { wirkend: true }); pruefeRegel(regel, { werte: { a: 0, b: 0 } }); }
    catch { return nicht(v, "nicht_bewertet", "nicht_auswertbar"); }
    if (!nachtDA.length) return nicht(v, "nicht_anwendbar", "keine_nachtdienstart");
    const teilzeit = (v.ausnahmen || {}).teilzeitAnteilig === true;
    const mitglieder = new Map(), unbekannt = new Map(), ausserhalb = [];
    for (const [p, f] of fakten) {
      if (!f.beschaeftigt) continue;
      let ja = 0, nein = 0, offen = 0;
      for (const d of tage) {
        if (!imDienst(p, d)) continue;
        let g;
        try { g = gilt(v, p, d, einheitAm); } catch { g = "offen"; }
        if (g === "ja") ja++; else if (g === "nein") nein++; else offen++;
      }
      if (!ja && !offen) continue;                                     // Vorgabe gilt für die Person nicht
      const pid = String(p.id);
      if (p.status === "gesperrt" || p.imSchichtdienst === false) { ausserhalb.push({ personId: pid, grund: G.schichtdienst }); continue; }
      if (f.nachtGesperrt === f.beschaeftigt) { ausserhalb.push({ personId: pid, grund: G.keineNacht }); continue; }
      if (offen) { unbekannt.set(pid, G.geltungOffen); continue; }
      if (nein) { unbekannt.set(pid, G.geltungTeilweise); continue; }
      if (f.beschaeftigt !== T) { unbekannt.set(pid, G.eintrittAustritt); continue; }
      if (f.nachtGesperrt) { unbekannt.set(pid, G.nachtTeilweise); continue; }
      if (f.andereAbw) { unbekannt.set(pid, G.abwesenheit); continue; }
      if (f.urlaubKrank === T) { ausserhalb.push({ personId: pid, grund: G.ganzAbwesend }); continue; }
      let faktor = T / (T - f.urlaubKrank);
      if (teilzeit) {
        const q = teilzeitQuote(m, p);
        if (q === null || !(q > 0)) { unbekannt.set(pid, G.teilzeitquote); continue; }
        faktor /= q;
      }
      mitglieder.set(pid, faktor);
    }
    return { ...kopf(v), status: null, regel, mitglieder, unbekannt, ausserhalb };
  });
  return { nachtIds, tage, regeln };
}

/**
 * Nachtdienste je Person im Monat auf einem Stand (aus der Besetzung je Tag; dieselbe Zuordnung wie personTag).
 * @param {any} stand @param {{ nachtIds: Set<any>, tage: string[] }} vt @returns {Map<string, number>}
 */
export function nachtZaehlen(stand, vt) {
  const z = new Map();
  for (const d of vt.tage) nachtAm(stand, vt, d, z, 1);
  return z;
}
/** Nachtdienste des Tags d zu den Zählern addieren (vz = +1) oder abziehen (vz = −1). */
export function nachtAm(stand, vt, d, z, vz) {
  const bes = besetzung(stand, d);
  for (const id of vt.nachtIds) {
    const b = bes[id];
    if (!b) continue;
    for (const p of b.personen) { const k = String(p.id); z.set(k, (z.get(k) || 0) + vz); }
  }
}

/**
 * Bewertung aller Verteilungsvorgaben für die Zähler `z` (Nachtdienste je Person).
 * @param {ReturnType<typeof verteilungVorbereiten>} vt @param {Map<string, number>} z
 * @returns {{ bewertet: boolean, summe: number | null, regeln: any[] }}
 */
export function verteilungBewerten(vt, z) {
  let summe = 0, bewertet = false, offen = false;
  const regeln = vt.regeln.map((r) => {
    const aus = { vorgabeId: r.vorgabeId, regelId: r.regelId, staerke: r.staerke, groesse: r.groesse, maxAbweichung: r.maxAbweichung };
    const ausserhalb = r.ausserhalb.map((x) => ({ ...x }));
    const nichtBewertbar = [...r.unbekannt].map(([personId, grund]) => ({ personId, grund, nachtdienste: z.get(personId) || 0 })).sort((a, b) => (a.personId < b.personId ? -1 : 1));
    if (r.status) {
      if (r.status === "nicht_bewertet" && r.grund !== "wunsch") offen = true;
      return { ...aus, status: r.status, grund: r.grund, personen: [], nichtBewertbar, ausserhalb };
    }
    /* Eigene Eigenschaften: eine Personenkennung wie „__proto__“ ginge mit einer Zuweisung still verloren (Review #605 C-2). */
    const werte = {};
    const setzeWert = (pid, w) => Object.defineProperty(werte, pid, { value: w, enumerable: true, writable: true, configurable: true });
    for (const [pid, faktor] of r.mitglieder) setzeWert(pid, sauber((z.get(pid) || 0) * faktor));
    for (const pid of r.unbekannt.keys()) setzeWert(pid, undefined);
    const e = pruefeRegel(r.regel, { werte });
    const bekannt = [...r.mitglieder.keys()].sort();
    const min = bekannt.length ? Math.min(...bekannt.map((pid) => werte[pid])) : null;
    const personen = bekannt.map((pid) => ({ personId: pid, nachtdienste: z.get(pid) || 0, wert: werte[pid], abweichung: sauber(werte[pid] - min) }));
    const spannweite = bekannt.length >= 2 ? sauber(Math.max(...bekannt.map((pid) => werte[pid])) - min) : null;
    const ueber = spannweite === null ? null : sauber(Math.max(0, spannweite - r.maxAbweichung));
    /* Nur vollständig Bekanntes geht in den Rang: offen (auch „verletzt“ mit unbekannten Personen) ⇒ nicht bewertet. */
    if (e.status === "offen" || (e.status === "verletzt" && r.unbekannt.size)) offen = true;
    else if (e.status === "erfuellt" || e.status === "verletzt") { bewertet = true; summe += ueber; }
    /* Sichtbarer Grund, wenn die Vorgabe nicht als Rang zählt (Review #605 C-3): z. B. Ausnahmezeitraum oder Gültigkeit im Monat macht
       jede Person „teilweise“ — dann nie still, sondern „Geltung nur teilweise im Monat“. */
    const teilweise = r.unbekannt.size > 0 && !r.mitglieder.size && [...r.unbekannt.values()].every((g) => g === G.geltungTeilweise);
    const ohneRang = e.status === "offen" || (e.status === "verletzt" && r.unbekannt.size);
    const grund = e.status === "nicht_anwendbar" ? "weniger_als_zwei" : ohneRang ? (teilweise ? "geltung_teilweise" : "personen_nicht_bewertbar") : null;
    return { ...aus, status: e.status, ...(grund ? { grund, ...(ohneRang ? { hinweis: VERTEILUNG_HINWEIS[grund] } : {}) } : {}), spannweite, ueberschreitung: ueber, personen, nichtBewertbar, ausserhalb };
  });
  const ok = bewertet && !offen;
  return { bewertet: ok, summe: ok ? sauber(summe) : null, regeln };
}
