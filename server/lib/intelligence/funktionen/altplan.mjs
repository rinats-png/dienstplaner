/* ==========================================================================
   INTELLIGENCE — F7A ALTPLAN-ÜBERNAHME, VORSCHAU (WP-I19 Teil 1, serverseitiger Kern)

   Eingabe: ein bereits STRUKTURIERTER Altplan (Zeilen mit Personenkennzeichen, Datum, Schichtkürzel/-zeiten) — aus dem
   vorhandenen Import-Parser oder aus Prüfdaten. Hier wird KEINE Datei gelesen, kein Parser gerufen, nichts geschrieben.

   Die Vorschau ordnet zu und prüft, rein deterministisch:
   - Schichtkürzel → vorhandene Dienstart (genau/normalisiert); unbekannte und mehrdeutige Kürzel werden gemeldet, nie angelegt.
   - Person → Personalnummer, sonst Name, gegen die Personen der Rollensicht; unbekannt/mehrdeutig wird gemeldet, nie angelegt.
   - Abwesenheitskürzel (krank, Attest, Urlaub …) → nur die Kategorie „Abwesenheit (Art nicht übernommen)“, ohne Grund,
     nie als Abwesenheitseintrag; das Kürzel selbst wird nicht ausgegeben. Auch unbekannte Kürzel werden nie als Text ausgegeben (nur Index, Anzahl, Zeilennummern).
   - Konflikte: Doppelbelegung im Altplan; Ruhezeit, Folgegrenzen, Qualifikation, Aufgaben, Fachkraftquote über die Engine
     (nur NEUE Befunde gegenüber dem heutigen Plan).
   - Unterschied zum heutigen Plan je Zeile (gleich/neu/geaendert/entfaellt/nicht_vergleichbar).

   NICHT hier: kein Modellaufruf (die modellgestützte Zuordnung ist „nicht verfügbar“; Anbieter AUS), keine Protokollierung
   der Zeilen, keine Speicherung, kein Schreiben. Personenbezogene Zeilenfelder erscheinen nicht in der Ausgabe (nur Zeilennummer,
   Kennung der zugeordneten Person aus der Sicht, Dienstart-Kennung).

   Reihenfolge (jede Stufe verweigert im Zweifel): Schalter (Vorgabe AUS) → Sitzung → Positivliste F7A (leitung, planer) →
   Freigabe „F7A“ → Zeilen (Form, Obergrenzen) → Rollensicht (bestandFuerRolle) → Rechnung auf gedachter Kopie.
   ========================================================================== */
import { bestandFuerRolle } from "../../rechte.mjs";
import { personTag } from "../../engine/plan.mjs";
import { mitTagesdatum } from "../../engine/zeit.mjs";
import { mitMerkmalen, pruefen } from "../../engine/befunde.mjs";
import { funktionEintrag, rolleDarf } from "../positivliste.mjs";
import { betriebIndexAusSitzung } from "../alias.mjs";
import { gatewayAn, SCHALTER_AUS } from "../gateway/schalter.mjs";
import { GatewayFehler } from "../gateway/codes.mjs";
import { KiFehler } from "../fehler.mjs";

export const F7A_TEXT = "Die modellgestützte Zuordnung ist derzeit nicht verfügbar. Es gilt nur die genaue Zuordnung.";
export const F7A_HINWEIS = "Vorschau, nichts übernommen";
export const ABWESENHEIT_HINWEIS = "Abwesenheit (Art nicht übernommen)";
export const ALTPLAN_GRENZEN = Object.freeze({ zeilen: 1500, personen: 400, tage: 93, feldLaenge: 64, bericht: 200 });
const ZEILEN_FELDER = ["personalnummer", "vorname", "nachname", "name", "datum", "kuerzel", "beginn", "ende"];
const KONFLIKT_ARTEN = new Set(["ruhezeit", "folge", "nachtfolge", "qualifikation", "aufgabe", "fachkraft"]);

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const istObj = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const liste = (w) => (Array.isArray(w) ? w.filter(istObj) : []);
const tagGueltig = (s) => typeof s === "string" && TAG.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const tageZwischen = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const gleich = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const EINGABE = () => new KiFehler("KI_EINGABE", "Anfrage ungültig.");
const norm = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ß/g, "ss")
  .replace(/[.,;:()]/g, " ").replace(/\s+/g, " ").trim();
const FREI_KUERZEL = new Set(["-", "–", "frei", "off"]);
/* Abwesenheit jeder Art (auch Gesundheit): nie als Art übernommen, nie ausgegeben. */
const ABW_WORTE = new Set(["krank", "kr", "k", "au", "gk", "kk", "uk", "u", "ue", "abw", "fb", "reha", "kur", "ku", "kh", "op", "bv", "mu", "ez", "sv", "krk", "krnk", "aub",
  "bsch", "kind", "muschu", "psych", "kvk", "ak"]);
const ABW_TEILE = /krank|krk|krnk|attest|arbeitsunf|urlaub|schwanger|mutterschutz|muschu|diagnos|abwesen|elternzeit|arzt|grippe|chemo|covid|corona|fieber|erk[a-z]*ltet|burnout|burn out|psych|klinik|krankenhaus|quarant|unfall|therap|op-|operation|infekt|migrane|depress|verletz|schmerz/;
/* Abwesenheit jeder Art (auch Gesundheit), auch mit Bindestrich/Schrägstrich verbunden: nie als Art übernommen, nie ausgegeben. */
const abwesend = (k) => ABW_TEILE.test(k) || k.split(/[ /+_-]+/).some((t) => ABW_WORTE.has(t));

/** Strenge Prüfung der Zeilen; liefert normalisierte Zeilen mit Zeilennummer. Nichts davon wird ausgegeben, geloggt oder gespeichert. */
function zeilenLesen(zeilen) {
  if (!Array.isArray(zeilen) || zeilen.length < 1 || zeilen.length > ALTPLAN_GRENZEN.zeilen) throw EINGABE();
  const aus = zeilen.map((z, i) => {
    if (!istObj(z) || Object.keys(z).some((k) => !ZEILEN_FELDER.includes(k))) throw EINGABE();
    for (const k of ZEILEN_FELDER) {
      const w = z[k];
      if (w === undefined || w === null) continue;
      if (typeof w !== "string" || w.length > ALTPLAN_GRENZEN.feldLaenge) throw EINGABE();
    }
    if (!tagGueltig(z.datum) || typeof z.kuerzel !== "string") throw EINGABE();
    for (const k of ["beginn", "ende"]) if (z[k] !== undefined && z[k] !== null && z[k] !== "" && !ZEIT.test(z[k])) throw EINGABE();
    return { nr: i + 1, pnr: norm(z.personalnummer), vn: norm(z.vorname), nn: norm(z.nachname), name: norm(z.name), datum: z.datum,
      kuerzel: norm(z.kuerzel), beginn: z.beginn || null, ende: z.ende || null };
  });
  let min = aus[0].datum, max = aus[0].datum;
  for (const z of aus) { if (z.datum < min) min = z.datum; if (z.datum > max) max = z.datum; }
  if (tageZwischen(min, max) + 1 > ALTPLAN_GRENZEN.tage) throw EINGABE();
  return { zeilen: aus, von: min, bis: max };
}

function sichtVon(bestand, sitzung, idx) {
  const sb = bestandFuerRolle(bestand, { ...sitzung, betrieb: idx });
  const m = sb && Array.isArray(sb.mandanten) ? sb.mandanten[0] : null;
  if (!istObj(m)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  return m;
}
const nachKennung = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
const rechenbar = (m) => ({ ...m, personen: liste(m.personen).sort(nachKennung), dienstarten: liste(m.dienstarten),
  abwesenheiten: liste(m.abwesenheiten), abweichungen: istObj(m.abweichungen) ? m.abweichungen : {},
  einspruenge: liste(m.einspruenge), qualifikationen: liste(m.qualifikationen), einheiten: liste(m.einheiten),
  einstellungen: istObj(m.einstellungen) ? m.einstellungen : {} });

/** Kürzel → dienst | frei | abwesenheit | unbekannt | mehrdeutig. Nie angelegt, nie geraten. */
function kuerzelIndex(dienstarten) {
  const nach = new Map();
  for (const da of dienstarten) for (const s of [da.kurz, da.name]) {
    const k = norm(s); if (!k) continue;
    if (!nach.has(k)) nach.set(k, new Set());
    nach.get(k).add(String(da.id));
  }
  return nach;
}
function kuerzelZu(k, nach) {
  if (nach.has(k)) { const ids = [...nach.get(k)]; return ids.length === 1 ? { art: "dienst", dienstId: ids[0] } : { art: "mehrdeutig" }; }
  if (FREI_KUERZEL.has(k) || k === "") return { art: "frei" };
  if (abwesend(k)) return { art: "abwesenheit" };
  return { art: "unbekannt" };
}

/** Person: Personalnummer vor Name; Name = „vorname nachname“ oder „nachname vorname“. */
function personenIndex(personen) {
  const pnr = new Map(), name = new Map();
  const ein = (m, k, id) => { if (!k) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(String(id)); };
  for (const p of personen) {
    ein(pnr, norm(p.personalnummer), p.id);
    const vn = norm(p.vorname), nn = norm(p.nachname);
    if (vn && nn) { ein(name, `${vn} ${nn}`, p.id); ein(name, `${nn} ${vn}`, p.id); }
  }
  return { pnr, name };
}
function personZu(z, idx) {
  let ids;
  if (z.pnr) ids = [...(idx.pnr.get(z.pnr) || [])];
  else {
    const n = z.name || (z.vn && z.nn ? `${z.vn} ${z.nn}` : "");
    if (!n) return { art: "unbekannt" };
    ids = [...(idx.name.get(n) || [])];
  }
  return ids.length === 1 ? { art: "person", id: ids[0] } : { art: ids.length === 0 ? "unbekannt" : "mehrdeutig" };
}

/**
 * @param {{
 *   sitzung: { rolle: string, person: string, bestand: string, betrieb?: number|string },
 *   anfrage: { zeilen: { personalnummer?: string, vorname?: string, nachname?: string, name?: string, datum: string, kuerzel: string, beginn?: string, ende?: string }[] },
 *   heute: string,
 *   ladeBestand: (raum: string) => any|Promise<any>,
 *   schalter?: { prozess: () => unknown, laufzeit: () => unknown },
 *   funktionenFreigegeben?: Iterable<string>,
 * }} o
 */
export async function altplanVorschau(o) {
  const schalter = (o && o.schalter) || SCHALTER_AUS;
  if (!gatewayAn(schalter)) throw new GatewayFehler("KI_AUS", "Intelligence ist ausgeschaltet.");
  const sitzung = o.sitzung;
  if (!istObj(sitzung) || typeof sitzung.rolle !== "string" || typeof sitzung.person !== "string" || typeof sitzung.bestand !== "string"
    || !sitzung.person || !sitzung.bestand) throw new KiFehler("KI_NICHT_ANGEMELDET", "Nicht angemeldet.");
  if (!rolleDarf(funktionEintrag("F7A"), sitzung.rolle)) throw new KiFehler("KI_ROLLE", "Diese Rolle darf die Funktion nicht auslösen.");
  if (!new Set(o.funktionenFreigegeben || []).has("F7A")) throw new KiFehler("KI_FUNKTION", "Diese Funktion ist nicht freigeschaltet.");
  const an = o.anfrage;
  if (!istObj(an) || Object.keys(an).some((k) => k !== "zeilen")) throw EINGABE();
  const { zeilen, von, bis } = zeilenLesen(an.zeilen);
  if (!tagGueltig(o.heute)) throw EINGABE();

  const bestand = await o.ladeBestand(sitzung.bestand);
  const idx = betriebIndexAusSitzung(sitzung, bestand);
  if (idx === null) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  const r = rechenbar(sichtVon(bestand, sitzung, idx));
  if (r.personen.length > ALTPLAN_GRENZEN.personen) throw EINGABE();

  const dIdx = kuerzelIndex(r.dienstarten), pIdx = personenIndex(r.personen);
  const z = { gesamt: zeilen.length, zugeordnet: 0, abwesenheit: 0, unbekanntKuerzel: 0, mehrdeutigKuerzel: 0, unbekanntePerson: 0, mehrdeutigePerson: 0, doppelt: 0 };
  const bericht = { kuerzelUnbekannt: [], kuerzelMehrdeutig: [], zeilenOhnePerson: [], zeilenPersonMehrdeutig: [], zeilenAbwesenheit: [], zeilenDoppelt: [], zeitAbweichung: [] };
  const merke = (l, nr) => { if (l.length < ALTPLAN_GRENZEN.bericht) l.push(nr); };
  const unbekannt = new Map();

  /* 1) Zuordnung je Zeile. */
  const zugeordnet = [];
  for (const zl of zeilen) {
    const k = kuerzelZu(zl.kuerzel, dIdx);
    if (k.art === "abwesenheit") { z.abwesenheit++; merke(bericht.zeilenAbwesenheit, zl.nr); continue; }
    if (k.art === "unbekannt") {
      z.unbekanntKuerzel++;
      /* Nie der Text: nur ein stabiler, anonymer Index je verschiedenem Kürzel (nach erstem Auftreten) mit Zeilennummern. */
      if (!unbekannt.has(zl.kuerzel)) unbekannt.set(zl.kuerzel, { index: unbekannt.size + 1, anzahl: 0, zeilen: [] });
      const u = unbekannt.get(zl.kuerzel); u.anzahl++; if (u.zeilen.length < 50) u.zeilen.push(zl.nr);
      continue;
    }
    if (k.art === "mehrdeutig") { z.mehrdeutigKuerzel++; merke(bericht.kuerzelMehrdeutig, zl.nr); continue; }
    const p = personZu(zl, pIdx);
    if (p.art === "unbekannt") { z.unbekanntePerson++; merke(bericht.zeilenOhnePerson, zl.nr); continue; }
    if (p.art === "mehrdeutig") { z.mehrdeutigePerson++; merke(bericht.zeilenPersonMehrdeutig, zl.nr); continue; }
    zugeordnet.push({ ...zl, personId: p.id, ziel: k.art === "frei" ? "-" : k.dienstId });
  }

  /* 2) Doppelbelegung im Altplan: gleiche Person und Tag mehrfach — keine der Zeilen wird vorgeschlagen. */
  const nachSchluessel = new Map();
  for (const zl of zugeordnet) {
    const s = `${zl.personId}|${zl.datum}`;
    if (!nachSchluessel.has(s)) nachSchluessel.set(s, []);
    nachSchluessel.get(s).push(zl);
  }
  const brauchbar = [];
  for (const g of nachSchluessel.values()) {
    if (g.length > 1) { z.doppelt += g.length; for (const x of g) merke(bericht.zeilenDoppelt, x.nr); } else brauchbar.push(g[0]);
  }
  brauchbar.sort((a, b) => a.nr - b.nr);
  z.zugeordnet = brauchbar.length;
  bericht.zeilenDoppelt.sort((a, b) => a - b);

  /* 3) Zeitabweichung (Hinweis): Zeiten im Altplan weichen von der Dienstart ab; es wird nichts angepasst. */
  for (const zl of brauchbar) {
    const da = zl.ziel === "-" ? null : r.dienstarten.find((x) => gleich(x.id, zl.ziel));
    if (da && ((zl.beginn && da.start && zl.beginn !== da.start) || (zl.ende && da.ende && zl.ende !== da.ende))) merke(bericht.zeitAbweichung, zl.nr);
  }

  /* 4) Unterschied und Konflikte gegen eine GEDACHTE Kopie (nur im Speicher). */
  const ergebnis = mitTagesdatum(o.heute, () => mitMerkmalen(() => false, () => {
    const diff = [];
    const summe = { gleich: 0, neu: 0, geaendert: 0, entfaellt: 0, nicht_vergleichbar: 0 };
    const abw = { ...r.abweichungen };
    for (const zl of brauchbar) {
      const p = r.personen.find((x) => gleich(x.id, zl.personId));
      let heutig = null, vergleichbar = true;
      try {
        const t = personTag(r, p, zl.datum);
        heutig = t.dienstId || null;
        if (t.abwesenheit || t.quelle === "extern" || t.quelle === "entwurf") vergleichbar = false;
      } catch { vergleichbar = false; }
      const neu = zl.ziel === "-" ? null : zl.ziel;
      let status;
      if (!vergleichbar) status = "nicht_vergleichbar";
      else if (heutig === neu) status = "gleich";
      else if (heutig === null) status = "neu";
      else if (neu === null) status = "entfaellt";
      else status = "geaendert";
      summe[status]++;
      /* Immer gesetzt: an Tagen mit Abwesenheit (oder ohne Planung) gilt in der Engine die Abwesenheit vor der Abweichung; der Test pinnt das. */
      abw[`${p.id}|${zl.datum}`] = zl.ziel;
      diff.push({ zeile: zl.nr, personId: String(p.id), datum: zl.datum, status, heute: vergleichbar ? heutig : null, vorschlag: neu });
    }
    const gedacht = { ...r, abweichungen: abw };
    const schl = (b) => `${b.datum}|${b.art}|${b.ref}`;
    let konflikte = [], konflikteStatus = "ok";
    try {
      const alt = new Set(pruefen(r, von, bis).map((b) => b.id));
      konflikte = pruefen(gedacht, von, bis).filter((b) => KONFLIKT_ARTEN.has(b.art) && !alt.has(b.id))
        .map((b) => ({ art: b.art, datum: b.datum, personId: b.personId !== undefined ? String(b.personId) : null, ref: b.ref || null, schwere: b.schwere }))
        .sort((a, b) => (schl(a) < schl(b) ? -1 : schl(a) > schl(b) ? 1 : 0))
        .slice(0, ALTPLAN_GRENZEN.bericht);
    } catch { konflikte = []; konflikteStatus = "nicht_rechenbar"; }
    return { diff, summe, konflikte, konflikteStatus };
  }));

  bericht.kuerzelUnbekannt = [...unbekannt.values()].slice(0, ALTPLAN_GRENZEN.bericht);
  return {
    funktion: "F7A", quelle: "berechnet", hinweis: F7A_HINWEIS, zeitraum: { von, bis },
    zusammenfassung: { verfuegbar: false, text: F7A_TEXT },
    zahlen: z,
    abwesenheit: z.abwesenheit > 0 ? { hinweis: ABWESENHEIT_HINWEIS, anzahl: z.abwesenheit } : null,
    nichtZugeordnet: bericht,
    unterschied: { summe: ergebnis.summe, zeilen: ergebnis.diff },
    konflikte: ergebnis.konflikte,
    konflikteStatus: ergebnis.konflikteStatus,
  };
}
