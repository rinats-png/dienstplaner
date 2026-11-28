/* ==========================================================================
   PLANVORSCHLAG — SERVER-AKTION (WP-I7, Stufe 2): erzeugen → ansehen → Übernahme bestätigen → rückgängig

   Drei Wege (POST, server/funktionen/daten.mjs, Sitzung wie jeder Weg dort):
     /api/planer-vorschlag    { ym }                                → Vorschlag des eigenen Planers (planerEinstieg, Knopfdruck),
                                                                       serverseitig gehalten samt `basis` (vorschlagBasis)
     /api/planer-uebernahme   { vorschlag, auswahl: [Index], bestaetigt } → ohne `bestaetigt: true` nur Prüfung (nichts geschrieben);
                                                                       mit: Patch nur auf `abweichungen`, ein Schreibvorgang
     /api/planer-rueckgaengig { uebernahme, bestaetigt }            → ohne `bestaetigt: true` nur Prüfung; mit: Vorwerte zurück,
                                                                       Rückgängig-Datensatz entwertet (einmalig)

     /api/planer-rueckgaengig-liste { ym }                          → (Stufe 3, nur lesen) offene Rückgängig-Datensätze des Monats: Kennung, Zahl, Zeitraum, Frist;
                                                                       nur die Rechte, nie die Planer-Freigabe (C-4)

   Verbindlich (Review #612, Verdrahtungsliste in docs/acc45/WP-I7-nachweis.md):
   - Der Client schickt nur Kennungen und Indizes — nie `gesetzt`, `basis`, Patch, `freigabe`, `rolle`, `demo`. Unbekannte Felder im
     Rumpf: 400 `anfrage-ungueltig` (keine Übernahme von Feldern aus dem Rumpf).
   - `kontext` nur hier gebaut: `rolle` = Rolle der Sitzung (wirksame Rolle aus daten.mjs, „kunde“ bleibt „kunde“, keine Abbildung auf
     Leitung), `demo` = echtes Boolean (`sitzung.demo === true`), `jetzt` = Serveruhr (ISO), `freigabe` = PLANER_AN (bleibt AUS),
     `bestaetigt` nur aus dem ausdrücklichen Feld der Übernahme/Rücknahme.
   - Planer nicht freigegeben (PLANER_AN AUS): `planer-nicht-freigegeben`, VOR jedem Lesen, Rechnen oder Schreiben. Rückgängig braucht nur
     die Rechte (C-4: stellt nur den Menschenstand her).
   - Übernahme nie über zusammenfuehren / PUT /api/bestand / anheftenZusammen: Rohstand unter der Raumsperre lesen, uebernahmeAnwenden auf
     genau diesem Stand, patchAnwenden allein auf `abweichungen`, dann EIN bestandSchreiben mit erwartetem Stand (Journal: alles oder
     nichts) — Patch, Änderungseinträge, Modulprotokoll und Rückgängig-Datensatz zusammen. 409 bei Konflikt; der nächste Versuch rechnet
     aus dem frisch gelesenen Stand neu (nie ein alter Patch auf neuem Stand).
   - Mitteilungen an Beschäftigte: keine (`versandt: false`; Betreiberentscheidung offen).
   - Antworten ohne Personennamen; Fehler als feste Kennungen (`code`).
   Vorschläge liegen nur im Arbeitsspeicher (wie die Importvorgänge, import/vorgaenge.mjs; genau ein Prozess je Ablage,
   prozesssperre.mjs): gebunden an Raum, Betrieb, Person/Rolle und Monat, höchstens VORSCHLAG_FRIST.hoechstMs. Ein Neustart verwirft sie —
   übernommen wurde dann nichts. Die Rückgängig-Daten liegen am Betrieb (planer-rueckgaengig.mjs).
   ========================================================================== */
import { randomBytes } from "node:crypto";
import { PLANER_AN, planerEinstieg } from "./engine/planer.mjs";
import { vorschlagBasis, uebernahmePruefen, uebernahmeAnwenden, rueckgaengigPruefen, rueckgaengigAnwenden, patchAnwenden, darfUebernehmen,
  UEBERNAHME_GRENZE } from "./engine/planer-uebernahme.mjs";
import { mitTagesdatum } from "./engine/zeit.mjs";
import { besetzung } from "./engine/plan.mjs";
import { betriebstag } from "./betriebszeit.mjs";
import { bestandLesenStreng, bestandSchreiben, unterRaumsperre } from "./bestand.mjs";
import { eigenerMandant } from "./rechte.mjs";
import { modulprotokollFaellig, modulprotokollUeberGrenze } from "./branchenmodule.mjs";
import { monatAbgeschlossen } from "./monatsabschluss.mjs";
import { pruefeGestalt } from "./gestalt.mjs";
import { RUECKGAENGIG_FELD, RUECKGAENGIG_GRENZE, RUECKGAENGIG_ID, aufbewahrenBis, rueckgaengigFaellig, rueckgaengigListe } from "./planer-rueckgaengig.mjs";

/** Die Wege dieser Aktion (Pfad nach „/api/“). */
export const PLANER_WEGE = Object.freeze(["planer-vorschlag", "planer-uebernahme", "planer-rueckgaengig", "planer-rueckgaengig-liste"]);
/** Höchstdauer eines Vorschlags (Arbeitsspeicher): 24 h — ein Planungstag; jede Änderung am Betrieb macht ihn ohnehin ungültig (basis). */
export const VORSCHLAG_FRIST = Object.freeze({ hoechstMs: 24 * 60 * 60 * 1000 });
/** Grenzen der gehaltenen Vorschläge (Arbeitsspeicher). Je Besitzer (Raum, Betrieb, Person bzw. Rolle ohne Person): höchstens jeBesitzer;
    ein neuer Vorschlag verdrängt bei Überschreitung den ÄLTESTEN desselben Besitzers (nie einen laufenden, nie einen fremden). Je Person und Monat
    ersetzt ein neuer ohnehin den alten. Die übrigen Grenzen schützen nur den Speicher und sind so hoch, dass kein Betrieb den anderen sperrt:
    jeRaum (mehrere Planende desselben Raums), gesamt (Zahl) und gesamtEintraege (Summe der Einteilungen aller Vorschläge, rund 250 Byte je
    Einteilung, also etwa 25 MB). Diese Grenzen weisen ab (429), sie verdrängen nie über Besitzer hinweg. */
export const VORSCHLAG_HOECHST = Object.freeze({ jeBesitzer: 5, jeRaum: 30, gesamt: 2000, gesamtEintraege: 100000 });

/** Nur für Prüfungen (Fehler- und Konfliktinjektion). Wirkt ausschließlich unter vitest (process.env.VITEST); im Betrieb wird es nie
    gelesen, auch wenn jemand es setzt. `freigabe` gibt es bewusst nicht. */
export const _pruefhaken = Object.seal({ ablage: null, vorSchreiben: null, nachlesen: null, hoechst: null });
const KEINE_HAKEN = Object.freeze({ ablage: null, vorSchreiben: null, nachlesen: null, hoechst: null });
const haken = () => (typeof process !== "undefined" && process.env && process.env.VITEST ? _pruefhaken : KEINE_HAKEN);

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;
const VORSCHLAG_ID = /^pv-[0-9a-f]{32}$/;
/** PLANER_AN — ausschließlich der Schalter im Code (bleibt AUS). Nie aus der Anfrage. */
const planerFrei = () => /** @type {boolean} */ (PLANER_AN) === true;

/** Statuscode je Kennung (Fehlertexte kommen später aus der Oberfläche). */
const STATUS = Object.freeze({
  "anfrage-ungueltig": 400, "monat-ungueltig": 400, "auswahl-ungueltig": 400, "auswahl-leer": 400, "auswahl-doppelt": 400,
  "auswahl-nicht-im-vorschlag": 400, "auswahl-zu-gross": 413, "vorschlag-zu-gross": 413,
  "keine-berechtigung": 403,
  "vorschlag-unbekannt": 404, "rueckgaengig-unbekannt": 404, "betrieb-unbekannt": 404,
  "vorschlag-abgelaufen": 410, "rueckgaengig-abgelaufen": 410,
  "eintrag-abgelehnt": 422, "nachpruefung-nicht-bestanden": 422, "nicht-planungsreif": 422, "vorschlag-ungueltig": 422,
  "rueckgaengig-ungueltig": 422, "betrieb-ungueltig": 422, "bestand-grenze": 422,
  "zu-viele-vorschlaege": 429,
  "pruefung-fehlgeschlagen": 500, "anwendung-fehlgeschlagen": 500, "schreiben-unklar": 500,
  "schreiben-fehlgeschlagen": 503,
  /* Zustand (409): Planer-Freigabe und -Schalter, Zeit/Abschluss, Mehrfachklick, Konflikt, Grenze des Protokolls. */
  "planer-nicht-freigegeben": 409, "planer-pausiert": 409, "planer-im-betrieb-aus": 409, "vergangen": 409, "monat-abgeschlossen": 409,
  "bereits-uebernommen": 409, "uebernahme-laeuft": 409, "seit-vorschlag-geaendert": 409, "konflikt": 409, "protokoll-voll": 409,
  "bereits-rueckgaengig": 409, "seit-uebernahme-geaendert": 409, "bestaetigung-fehlt": 409, "anheftungen-unlesbar": 409, "zeit-ungueltig": 409,
});
/** Unbekannte Kennung (aus dem Kern neu hinzugekommen): 409 — nie Erfolg. */
const statusVon = (code) => STATUS[code] || 409;
/** Absage: nur Kennung (und bei Einträgen Index + Kennung, nie Person|Tag oder Namen). */
const nein = (code, mehr = {}) => ({ status: statusVon(code), ausgang: "abgewiesen", spur: `Planvorschlag: ${code}`,
  daten: { ok: false, code, fehler: code, ...mehr } });
const abgelehntAus = (r) => (Array.isArray(r.abgelehnt) ? { abgelehnt: r.abgelehnt.map((a) => ({ index: a.index, grund: a.grund, ...(Array.isArray(a.regeln) ? { regeln: a.regeln } : {}) })) } : {});

/** Rumpf: einfaches Objekt nur mit den genannten Feldern. */
const rumpfNur = (rumpf, felder) => istObjekt(rumpf) && Object.keys(rumpf).every((k) => felder.includes(k));

/**
 * Der Kontext der Übernahme-Logik — nur hier, nur aus Sitzung, Serveruhr und Schalter. Kein Feld aus der Anfrage außer `bestaetigt`
 * (ausdrücklich true), und auch das nur für Übernahme und Rücknahme.
 * @param {any} sitzung @param {Date} jetzt @param {boolean} [bestaetigt]
 */
export function kontextAus(sitzung, jetzt, bestaetigt = false) {
  return Object.freeze({ rolle: istObjekt(sitzung) && typeof sitzung.rolle === "string" ? sitzung.rolle : "", demo: istObjekt(sitzung) && sitzung.demo === true,
    jetzt: jetzt.toISOString(), freigabe: planerFrei(), bestaetigt: bestaetigt === true });
}

/** Darf diese Sitzung die Wege überhaupt nutzen? Leitung/Planung mit plan.edit.all, nie Demo, nie Sicherungsschlüssel. */
export function planerAktionErlaubt(sitzung) {
  return istObjekt(sitzung) && sitzung.nurSicherung !== true && darfUebernehmen(kontextAus(sitzung, new Date(0)));
}

/* --------------------------- Vorschläge (Arbeitsspeicher) --------------------------- */
/** @type {Map<string, any>} */
const VORSCHLAEGE = new Map();
/** Wem gehört ein Vorschlag? Aus der Sitzung, nie aus dem Rumpf. */
function besitzAus(sitzung, mandantId) {
  return Object.freeze({ raum: String(sitzung.bestand), mandantId: String(mandantId),
    wer: sitzung.person !== null && sitzung.person !== undefined ? `p:${sitzung.person}` : `r:${sitzung.rolle}` });
}
const gleicherBesitz = (a, b) => a.raum === b.raum && a.mandantId === b.mandantId && a.wer === b.wer;

/** Abgelaufene Vorschläge löschen. */
export function vorschlaegeAufraeumen(jetztMs = Date.now()) {
  for (const [id, v] of VORSCHLAEGE) if (jetztMs > v.gueltigBisMs) VORSCHLAEGE.delete(id);
}

/** Den Vorschlag holen — nur für den Besitzer. { v } oder { code }. */
function vorschlagHolen(id, besitz, jetztMs) {
  if (typeof id !== "string" || !VORSCHLAG_ID.test(id)) return { code: "anfrage-ungueltig" };
  const v = VORSCHLAEGE.get(id);
  if (!v || !gleicherBesitz(v.besitz, besitz)) return { code: "vorschlag-unbekannt" };
  if (jetztMs > v.gueltigBisMs) { VORSCHLAEGE.delete(id); return { code: "vorschlag-abgelaufen" }; }
  return { v };
}

/** Die Grenzen: im Betrieb immer VORSCHLAG_HOECHST (der Haken wirkt nur unter vitest). */
const grenzen = () => haken().hoechst || VORSCHLAG_HOECHST;
/** Zahl der Einteilungen eines gehaltenen Vorschlags (übernommene halten keine mehr). */
const groesse = (v) => (v.vorschlag && Array.isArray(v.vorschlag.gesetzt) ? v.vorschlag.gesetzt.length : 0);

/** Nur für Prüfungen. */
export const _vorschlaege = { anzahl: () => VORSCHLAEGE.size, leeren: () => VORSCHLAEGE.clear(), roh: (id) => VORSCHLAEGE.get(id) || null };

/* Alle 10 Minuten aufräumen, auch ohne Zugriff (unref: hält den Prozess nicht am Leben). */
setInterval(() => vorschlaegeAufraeumen(), 10 * 60 * 1000).unref();

/* ------------------------------------- Hilfen ------------------------------------- */
/** Den eigenen Betrieb aus dem Rohstand (nie die Sicht). */
function eigener(mit, sitzung) {
  const m = mit && mit.bestand ? eigenerMandant(mit.bestand, sitzung) : null;
  return istObjekt(m) && (typeof m.id === "string" || typeof m.id === "number") ? m : null;
}
/** Modulprotokoll anhängen (Grenze wie anheften.mjs). `immer`: auch über der Grenze (Rücknahme geht immer). null = Grenze erreicht. */
function mitProtokoll(m, eintrag, heute, immer) {
  const einst = istObjekt(m.einstellungen) ? m.einstellungen : {};
  let bisher = Array.isArray(einst.modulprotokoll) ? einst.modulprotokoll : [];
  if (modulprotokollUeberGrenze(bisher, [eintrag], "Rückgängig")) bisher = modulprotokollFaellig({ einstellungen: { modulprotokoll: bisher } }, heute).rest;
  if (modulprotokollUeberGrenze(bisher, [eintrag], "Rückgängig") && !immer) return null;
  return { ...m, einstellungen: { ...einst, modulprotokoll: [...bisher, eintrag] } };
}
/** Änderungseinträge anhängen. */
const mitAenderungen = (m, neu) => ({ ...m, aenderungen: [...(Array.isArray(m.aenderungen) ? m.aenderungen : []), ...neu] });
/** Unterbesetzung nach einer Rücknahme (vorhandene Besetzungslogik, ohne Personen): je betroffenem Tag und Dienst die Lücke. */
function unterbesetztNach(m, eintraege, heute) {
  try {
    return mitTagesdatum(heute, () => {
      const aus = [];
      const gesehen = new Set();
      for (const e of eintraege) {
        const datum = e.schluessel.slice(-10);
        const k = `${datum}|${e.nachher}`;
        if (gesehen.has(k)) continue;
        gesehen.add(k);
        const b = besetzung(m, datum)[e.nachher];
        if (b && (b.diff < 0 || b.qualFehlt)) aus.push({ datum, dienstId: e.nachher, fehlt: Math.max(0, -b.diff), qualFehlt: !!b.qualFehlt });
      }
      return aus.sort((a, b) => a.datum.localeCompare(b.datum) || String(a.dienstId).localeCompare(String(b.dienstId)));
    });
  } catch {
    return null;   // nicht bewertbar: nie „keine Lücke“ behaupten
  }
}

/**
 * Schreiben unter der Sperre: EIN bestandSchreiben mit erwartetem Stand. Bei einer Ausnahme: frisch nachlesen, ob der Datensatz
 * `merkmal(m)` festgeschrieben ist (Journal) — dann gilt es als geschrieben.
 */
async function schreiben(storeRoh, raum, mit, mandantAlt, mandantNeu, durch, merkmal, sitzung) {
  const h = haken();
  const store = h.ablage ? h.ablage(storeRoh) : storeRoh;
  const neu = { ...mit.bestand, mandanten: mit.bestand.mandanten.map((x) => (x === mandantAlt ? mandantNeu : x)) };
  const form = pruefeGestalt(neu, { vorher: mit.bestand });
  if (!form.ok) return { code: "bestand-grenze" };
  if (h.vorSchreiben) await h.vorSchreiben({ store: storeRoh, raum });
  try {
    const erg = await bestandSchreiben(store, raum, neu, { erwarteterStand: mit.stand, durch });
    return erg.ok ? { ok: true, stand: erg.stand || null } : { code: "konflikt" };
  } catch {
    try {
      const nach = await bestandLesenStreng(h.nachlesen ? h.nachlesen(storeRoh) : storeRoh, raum);
      const m = eigener(nach, sitzung);
      if (m && String(m.id) === String(mandantAlt.id) && merkmal(m)) return { ok: true, stand: nach.stand || null };
      return { code: "schreiben-fehlgeschlagen" };
    } catch {
      return { code: "schreiben-unklar" };
    }
  }
}

/* ------------------------------------- Wege ------------------------------------- */

/**
 * POST /api/planer-vorschlag — Vorschlag erzeugen (nur Knopfdruck, nie automatisch übernommen).
 * @param {{ store: any, sitzung: any, rumpf: any, jetzt: Date }} e
 */
export async function vorschlagErzeugen({ store, sitzung, rumpf, jetzt }) {
  const kontext = kontextAus(sitzung, jetzt);
  if (!planerAktionErlaubt(sitzung)) return nein("keine-berechtigung");
  if (!kontext.freigabe) return nein("planer-nicht-freigegeben");
  if (!rumpfNur(rumpf, ["ym"])) return nein("anfrage-ungueltig");
  if (typeof rumpf.ym !== "string" || !MONAT.test(rumpf.ym)) return nein("monat-ungueltig");
  const ym = rumpf.ym;
  const heute = betriebstag(jetzt);
  if (ym < heute.slice(0, 7)) return nein("vergangen");
  const mit = await bestandLesenStreng(store, sitzung.bestand);
  const m = eigener(mit, sitzung);
  if (!m) return nein("betrieb-unbekannt");
  if (monatAbgeschlossen(m, ym)) return nein("monat-abgeschlossen");
  const besitz = besitzAus(sitzung, m.id);
  const jetztMs = jetzt.getTime();
  vorschlaegeAufraeumen(jetztMs);
  const ersetzt = [...VORSCHLAEGE.values()].find((v) => gleicherBesitz(v.besitz, besitz) && v.ym === ym && !v.laeuft);
  /* Grenzen (alles bis zum Eintragen unten läuft ohne await, also ohne Wettlauf): je Besitzer verdrängt der älteste eigene, nie ein laufender;
     Raum, Zahl und Größe weisen nur ab. Verdrängt wird erst beim Eintragen (ein misslungener Planlauf verwirft nichts). */
  const G = grenzen();
  const offen = [...VORSCHLAEGE.values()].filter((v) => v !== ersetzt);
  const eigene = offen.filter((v) => gleicherBesitz(v.besitz, besitz));
  const verdraengbar = eigene.filter((v) => !v.laeuft).sort((a, b) => a.angelegt - b.angelegt);   // sort ist stabil: bei gleicher Zeit zählt die Reihenfolge des Anlegens
  const zuViele = Math.max(0, eigene.length + 1 - G.jeBesitzer);
  if (zuViele > verdraengbar.length) return nein("zu-viele-vorschlaege");   // nur laufende übrig: nie einen laufenden verdrängen
  const weg = verdraengbar.slice(0, zuViele);
  const bleibt = offen.filter((v) => !weg.includes(v));
  if (bleibt.length >= G.gesamt || bleibt.filter((v) => v.besitz.raum === besitz.raum).length >= G.jeRaum) return nein("zu-viele-vorschlaege");
  const basis = vorschlagBasis(m, ym);
  if (!basis) return nein("betrieb-ungueltig");
  /** @type {any} */
  let r;
  try {
    r = mitTagesdatum(heute, () => planerEinstieg(m, ym, { freigabe: kontext.freigabe, knopf: true, heute }));
  } catch {
    return nein("pruefung-fehlgeschlagen");
  }
  if (!r || r.status !== "ok") {
    const st = r && r.status;
    if (st === "pausiert") return nein("planer-pausiert");
    if (st === "aus" || st === "wartet") return nein("planer-im-betrieb-aus");
    if (st === "nicht_planungsreif")
      return nein("nicht-planungsreif", { voraussetzungen: (Array.isArray(r.voraussetzungen) ? r.voraussetzungen : []).map((v) => ({ punkt: String(v.punkt), text: String(v.text) })) });
    return nein("vorschlag-ungueltig");
  }
  const gesetzt = (Array.isArray(r.gesetzt) ? r.gesetzt : []).map((g) => Object.freeze({ personId: g.personId, datum: g.datum, dienstId: g.dienstId, art: g.art }));
  if (gesetzt.length > UEBERNAHME_GRENZE.eintraege) return nein("vorschlag-zu-gross");
  if (bleibt.reduce((s, v) => s + groesse(v), 0) + gesetzt.length > G.gesamtEintraege) return nein("zu-viele-vorschlaege");
  const offenAnzahl = Array.isArray(r.offen) ? r.offen.length : 0;
  if (ersetzt) VORSCHLAEGE.delete(ersetzt.id);
  if (gesetzt.length) for (const v of weg) VORSCHLAEGE.delete(v.id);   // nur wenn wirklich ein neuer Vorschlag eingetragen wird
  if (!gesetzt.length) return { status: 200, ausgang: "erfolg", spur: "Planvorschlag erzeugt: 0 Einteilungen",
    daten: { ok: true, vorschlag: null, ym, modus: r.modus, eintraege: [], offen: offenAnzahl } };
  const id = `pv-${randomBytes(16).toString("hex")}`;
  const gueltigBisMs = jetztMs + VORSCHLAG_FRIST.hoechstMs;
  VORSCHLAEGE.set(id, { id, besitz, ym, angelegt: jetztMs, gueltigBisMs, zustand: "offen", laeuft: false,
    vorschlag: Object.freeze({ status: "ok", ym, gesetzt: Object.freeze(gesetzt), basis }) });
  return { status: 201, ausgang: "erfolg", spur: `Planvorschlag erzeugt: ${gesetzt.length} Einteilungen`,
    daten: { ok: true, vorschlag: id, ym, modus: r.modus, gueltigBis: new Date(gueltigBisMs).toISOString(),
      eintraege: gesetzt.map((g, index) => ({ index, personId: g.personId, datum: g.datum, dienstId: g.dienstId, art: g.art })), offen: offenAnzahl } };
}

/** Auswahl aus dem Rumpf: Indizes in den gehaltenen Vorschlag (ganze Zahlen, eindeutig). { auswahl } oder { code }. */
function auswahlAus(roh, gesetzt) {
  if (!Array.isArray(roh)) return { code: "auswahl-ungueltig" };
  if (!roh.length) return { code: "auswahl-leer" };
  if (roh.length > UEBERNAHME_GRENZE.eintraege) return { code: "auswahl-zu-gross" };
  const gesehen = new Set();
  for (const i of roh) {
    if (!Number.isInteger(i) || i < 0 || i >= gesetzt.length) return { code: "auswahl-ungueltig" };
    if (gesehen.has(i)) return { code: "auswahl-doppelt" };
    gesehen.add(i);
  }
  return { auswahl: roh.map((i) => ({ personId: gesetzt[i].personId, datum: gesetzt[i].datum, dienstId: gesetzt[i].dienstId })) };
}

/**
 * POST /api/planer-uebernahme — Übernahme prüfen (ohne `bestaetigt: true`) oder ausführen.
 * @param {{ store: any, sitzung: any, rumpf: any, jetzt: Date }} e
 */
export async function uebernahmeAusfuehren({ store, sitzung, rumpf, jetzt }) {
  if (!planerAktionErlaubt(sitzung)) return nein("keine-berechtigung");
  if (!planerFrei()) return nein("planer-nicht-freigegeben");
  if (!rumpfNur(rumpf, ["vorschlag", "auswahl", "bestaetigt"]) || (hat(rumpf, "bestaetigt") && typeof rumpf.bestaetigt !== "boolean"))
    return nein("anfrage-ungueltig");
  const bestaetigt = rumpf.bestaetigt === true;
  const kontext = kontextAus(sitzung, jetzt, bestaetigt);
  const jetztMs = jetzt.getTime();
  /* Besitz zuerst nur über Raum und Person/Rolle prüfen; den Betrieb bestätigt das Lesen unten (Mandantengrenze). */
  const kandidat = typeof rumpf.vorschlag === "string" ? VORSCHLAEGE.get(rumpf.vorschlag) : undefined;
  const besitzVorab = kandidat ? besitzAus(sitzung, kandidat.besitz.mandantId) : besitzAus(sitzung, "");
  const h = vorschlagHolen(rumpf.vorschlag, besitzVorab, jetztMs);
  if (h.code) return nein(h.code);
  const v = h.v;
  if (v.zustand === "uebernommen") return nein("bereits-uebernommen");
  if (v.laeuft) return nein("uebernahme-laeuft");
  const a = auswahlAus(rumpf.auswahl, v.vorschlag.gesetzt);
  if (a.code) return nein(a.code);
  /* Mehrfachklick: die Marke steht VOR dem ersten await; eine zweite Anfrage mit derselben Kennung bekommt 409. */
  /* Nur wer die Marke gesetzt hat, nimmt sie wieder weg (eine Prüfung ohne Bestätigung löscht nie die Marke einer laufenden Übernahme). */
  const markeGesetzt = bestaetigt;
  if (markeGesetzt) v.laeuft = true;
  try {
    return await unterRaumsperre(String(sitzung.bestand), async () => {
      const mit = await bestandLesenStreng(store, sitzung.bestand);
      const m = eigener(mit, sitzung);
      if (!m || String(m.id) !== v.besitz.mandantId) return nein("vorschlag-unbekannt");
      if (VORSCHLAEGE.get(v.id) !== v || v.zustand !== "offen") return nein("bereits-uebernommen");
      const heute = betriebstag(jetzt);
      if (!bestaetigt) {
        const p = /** @type {any} */ (uebernahmePruefen(m, v.ym, v.vorschlag, a.auswahl, kontext));
        if (!p.ok) {
          if (p.grund === "seit-vorschlag-geaendert") VORSCHLAEGE.delete(v.id);
          return nein(p.grund, abgelehntAus(p));
        }
        return { status: 200, ausgang: "erfolg", spur: `Planvorschlag geprüft: ${p.eintraege.length} Einteilungen`,
          daten: { ok: true, geprueft: true, geschrieben: false, anzahl: p.eintraege.length } };
      }
      const r = /** @type {any} */ (uebernahmeAnwenden(m, v.ym, v.vorschlag, a.auswahl, kontext));
      if (!r.ok) {
        /* Der Stand hat sich seit dem Vorschlag geändert: der Vorschlag ist verbraucht, ein neuer muss gerechnet werden. */
        if (r.grund === "seit-vorschlag-geaendert") VORSCHLAEGE.delete(v.id);
        return nein(r.grund, abgelehntAus(r));
      }
      const pa = patchAnwenden(m, r.patch);
      if (!pa.ok) return nein("anwendung-fehlgeschlagen");
      const id = `pu-${randomBytes(16).toString("hex")}`;
      const satz = { id, vorschlag: v.id, ...r.rueckgaengig, aufbewahrenBis: aufbewahrenBis(v.ym) };
      let neuM = mitAenderungen(pa.mandant, r.aenderungen);
      neuM = mitProtokoll(neuM, r.protokoll, heute, false);
      if (!neuM) return nein("protokoll-voll");
      const rest = rueckgaengigFaellig(neuM, heute, { abgeschlossen: (ym) => monatAbgeschlossen(neuM, ym) }).rest;
      const saetze = [...rest, satz].sort((x, y) => String(x.am).localeCompare(String(y.am)));
      let verdraengt = 0;
      while (saetze.length > RUECKGAENGIG_GRENZE.saetze) { saetze.shift(); verdraengt += 1; }
      neuM = { ...neuM, [RUECKGAENGIG_FELD]: saetze };
      const w = await schreiben(store, String(sitzung.bestand), mit, m, neuM, "Planvorschlag",
        (x) => rueckgaengigListe(x).some((s) => s.id === id), sitzung);
      if (!w.ok) return nein(w.code);
      v.zustand = "uebernommen";
      v.vorschlag = null;
      return { status: 200, ausgang: "erfolg", spur: `Planvorschlag übernommen: ${r.protokoll.anzahl} Einteilungen`,
        daten: { ok: true, geschrieben: true, uebernahme: id, anzahl: r.protokoll.anzahl, zeitraum: r.protokoll.zeitraum,
          rueckgaengigBis: satz.aufbewahrenBis, rueckgaengigVerdraengt: verdraengt, mitteilungen: { versandt: false, planFreigegeben: r.mitteilungen.planFreigegeben, betroffenePersonen: r.mitteilungen.betroffenePersonen },
          etag: w.stand } };
    });
  } finally {
    if (markeGesetzt) v.laeuft = false;
  }
}

/**
 * POST /api/planer-rueckgaengig — Rücknahme prüfen (ohne `bestaetigt: true`) oder ausführen. Nur die Rechte, keine Planer-Freigabe
 * (C-4). Einmalig: der Datensatz wird im selben Schreibvorgang entfernt.
 * @param {{ store: any, sitzung: any, rumpf: any, jetzt: Date }} e
 */
export async function rueckgaengigAusfuehren({ store, sitzung, rumpf, jetzt }) {
  if (!planerAktionErlaubt(sitzung)) return nein("keine-berechtigung");
  if (!rumpfNur(rumpf, ["uebernahme", "bestaetigt"]) || (hat(rumpf, "bestaetigt") && typeof rumpf.bestaetigt !== "boolean")
    || typeof rumpf.uebernahme !== "string" || !RUECKGAENGIG_ID.test(rumpf.uebernahme)) return nein("anfrage-ungueltig");
  const bestaetigt = rumpf.bestaetigt === true;
  const kontext = kontextAus(sitzung, jetzt, bestaetigt);
  return unterRaumsperre(String(sitzung.bestand), async () => {
    const mit = await bestandLesenStreng(store, sitzung.bestand);
    const m = eigener(mit, sitzung);
    if (!m) return nein("betrieb-unbekannt");
    const satz = rueckgaengigListe(m).find((s) => s.id === rumpf.uebernahme);
    if (!satz) return nein("rueckgaengig-unbekannt");
    const heute = betriebstag(jetzt);
    const gilt = rueckgaengigFaellig({ [RUECKGAENGIG_FELD]: [satz] }, heute, { abgeschlossen: (ym) => monatAbgeschlossen(m, ym) }).rest.length === 1;
    if (!gilt) return nein(monatAbgeschlossen(m, satz.ym) ? "monat-abgeschlossen" : "rueckgaengig-abgelaufen");
    if (!bestaetigt) {
      const p = /** @type {any} */ (rueckgaengigPruefen(m, satz.ym, satz, kontext));
      if (!p.ok) return nein(p.grund, abgelehntAus(p));
      const probe = patchAnwenden(m, { abweichungen: Object.fromEntries(p.eintraege.map((e) => [e.schluessel, e.vorher])) });
      return { status: 200, ausgang: "erfolg", spur: `Planvorschlag Rücknahme geprüft: ${p.eintraege.length} Einteilungen`,
        daten: { ok: true, geprueft: true, geschrieben: false, anzahl: p.eintraege.length,
          unterbesetzt: probe.ok ? unterbesetztNach(probe.mandant, p.eintraege, heute) : null } };
    }
    const r = /** @type {any} */ (rueckgaengigAnwenden(m, satz.ym, satz, kontext));
    if (!r.ok) return nein(r.grund, abgelehntAus(r));
    const pa = patchAnwenden(m, r.patch);
    if (!pa.ok) return nein("anwendung-fehlgeschlagen");
    let neuM = mitProtokoll(mitAenderungen(pa.mandant, r.aenderungen), r.protokoll, heute, true);
    const rest = rueckgaengigFaellig(neuM, heute, { abgeschlossen: (ym) => monatAbgeschlossen(neuM, ym) }).rest.filter((s) => s.id !== satz.id);
    const { [RUECKGAENGIG_FELD]: _weg, ...ohne } = neuM; // eslint-disable-line no-unused-vars
    neuM = rest.length ? { ...ohne, [RUECKGAENGIG_FELD]: rest } : ohne;
    const eintraege = satz.eintraege;
    const w = await schreiben(store, String(sitzung.bestand), mit, m, neuM, "Planvorschlag",
      (x) => !rueckgaengigListe(x).some((s) => s.id === satz.id) && hat(x, "abweichungen"), sitzung);
    if (!w.ok) return nein(w.code);
    return { status: 200, ausgang: "erfolg", spur: `Planvorschlag zurückgenommen: ${r.protokoll.anzahl} Einteilungen`,
      daten: { ok: true, geschrieben: true, anzahl: r.protokoll.anzahl, zeitraum: r.protokoll.zeitraum,
        unterbesetzt: unterbesetztNach(neuM, eintraege, heute), etag: w.stand } };
  });
}

/**
 * POST /api/planer-rueckgaengig-liste — die offenen Rückgängig-Datensätze des eigenen Betriebs für einen Monat (Stufe 3: damit die
 * Oberfläche nach dem Neuladen noch zurücknehmen kann; die Kennung `pu-…` wäre sonst verloren). NUR LESEN, nur die Rechte (C-4:
 * wie die Rücknahme selbst unabhängig von der Planer-Freigabe). Je Eintrag allein Kennung, Monat, Zahl, Zeitraum (Tage, ohne Personen)
 * und letzter Tag der Rücknahme — nie Person|Tag, Namen oder Vorwerte. Abgelaufene und abgeschlossene Datensätze zählen nicht.
 * @param {{ store: any, sitzung: any, rumpf: any, jetzt: Date }} e
 */
export async function rueckgaengigListeAusgeben({ store, sitzung, rumpf, jetzt }) {
  if (!planerAktionErlaubt(sitzung)) return nein("keine-berechtigung");
  if (!rumpfNur(rumpf, ["ym"])) return nein("anfrage-ungueltig");
  if (typeof rumpf.ym !== "string" || !MONAT.test(rumpf.ym)) return nein("monat-ungueltig");
  const ym = rumpf.ym;
  let m;
  try {
    m = eigener(await bestandLesenStreng(store, sitzung.bestand), sitzung);
  } catch {
    return nein("pruefung-fehlgeschlagen");
  }
  if (!m) return nein("betrieb-unbekannt");
  const heute = betriebstag(jetzt);
  const TAG = /^\d{4}-\d{2}-\d{2}$/;
  const gilt = rueckgaengigFaellig(m, heute, { abgeschlossen: (x) => monatAbgeschlossen(m, x) }).rest;
  const eintraege = [];
  for (const s of gilt) {
    if (s.ym !== ym) continue;
    const tage = (Array.isArray(s.eintraege) ? s.eintraege : []).map((x) => (istObjekt(x) && typeof x.schluessel === "string" ? x.schluessel.slice(-10) : "")).filter((d) => TAG.test(d)).sort();
    if (!tage.length) continue;   // unbrauchbarer Datensatz: nicht anbieten (die Rücknahme würde ihn ohnehin ablehnen)
    eintraege.push({ am: String(s.am || ""), uebernahme: s.id, ym: s.ym, anzahl: tage.length, von: tage[0], bis: tage[tage.length - 1], rueckgaengigBis: aufbewahrenBis(s.ym) });
  }
  /* Neueste zuerst (die Zeit der Übernahme dient nur der Reihenfolge und geht nicht hinaus). */
  eintraege.sort((x, y) => y.am.localeCompare(x.am) || x.uebernahme.localeCompare(y.uebernahme));
  return { status: 200, ausgang: "erfolg", spur: `Planvorschlag Rückgängig-Liste: ${eintraege.length} Einträge`,
    daten: { ok: true, ym, eintraege: eintraege.map((e) => ({ uebernahme: e.uebernahme, ym: e.ym, anzahl: e.anzahl, von: e.von, bis: e.bis, rueckgaengigBis: e.rueckgaengigBis })) } };
}

/**
 * Verteiler für daten.mjs.
 * @param {string} weg @param {{ store: any, sitzung: any, rumpf: any, jetzt: Date }} e
 */
export function planerAktion(weg, e) {
  if (weg === "planer-vorschlag") return vorschlagErzeugen(e);
  if (weg === "planer-uebernahme") return uebernahmeAusfuehren(e);
  if (weg === "planer-rueckgaengig") return rueckgaengigAusfuehren(e);
  if (weg === "planer-rueckgaengig-liste") return rueckgaengigListeAusgeben(e);
  return Promise.resolve(nein("anfrage-ungueltig"));
}
