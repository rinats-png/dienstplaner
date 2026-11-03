/* ==========================================================================
   INTELLIGENCE — FAKTENPAKET BILDEN (WP-I11)

   Ablauf (jede Stufe verweigert im Zweifel):

   1. Sitzung: Rolle, Person, Raum (`sitzung.bestand`) und Betrieb stammen
      aus der Sitzung, nie aus der Anfrage. Die Eingabe darf weder Raum
      noch Betrieb noch Rolle tragen (Schema).
   2. Funktion und Rolle gegen die Positivliste (positivliste.mjs): ohne
      Eintrag oder ohne Nennung der Rolle kein Paket (Default verweigern).
   3. Bestand nur über ladeBestand(raum der Sitzung). Der Betrieb wird über
      den Index der Sitzung gewählt, ohne Rückfall auf einen anderen.
   4. ROLLENSICHT: bestandFuerRolle (rechte.mjs → sicht.mjs). Ab hier wird
      nur noch die Sicht gelesen, nie der Rohbestand.
   5. Fakten = Sicht ∩ Positivliste der Funktion. Felder mit Herkunft
      „sicht" liest dieses Modul selbst; „berechnete" Felder kommen aus
      einer Faktenquelle (Rechenkern, WP-I12), bekommen nur eine
      eingefrorene Kopie der Sicht und werden einzeln geprüft (Feld erlaubt,
      Art des Werts, Person/Einheit in der Sicht, Schutzbefunde neutral).
      Freitextfelder (Notizen, Gründe, Anmerkungen, Texte) liest der
      Bildner nirgends.
   6. Alias statt Kennung (alias.mjs). Die Alias-Karte bleibt im Server.
   7. Schema (schemas.mjs) und Leck-Prüfung (leckpruefung.mjs) mit der
      Sperrliste aus dem ROHEN Betrieb. Verdacht → Paket verworfen,
      Audit-Ereignis ohne Inhalt, Fehler KI_LECK. Fail closed.

   Kein Netz, kein Anbieter, keine Umgebungsvariable, kein Schreiben.
   ========================================================================== */

import { bestandFuerRolle } from "../rechte.mjs";
import { zugehoerigkeitsAbschnitte } from "../sicht.mjs";
import { BEFUND_KATALOG } from "../bestaetigungen.mjs";
import { FELDER, deepFreeze } from "./felder.mjs";
import { funktionEintrag, rolleDarf, feldErlaubt, POSITIVLISTE_VERSION } from "./positivliste.mjs";
import { SCHEMA_VERSION, pruefeEingabe, pruefeFaktenpaket, wertPasstZurArt, istDatum, KENNUNG_MUSTER_TEXT,
  ZEIT_MUSTER_TEXT } from "./schemas.mjs";
import { AliasKarte } from "./alias.mjs";
import { sperrlisteBilden, leckPruefen } from "./leckpruefung.mjs";
import { fremdtextBloecke } from "./kapsel.mjs";
import { KiFehler } from "./fehler.mjs";

export const ZEITRAUM_MAX_TAGE = 62;
export const FAKTEN_MAX = 500;
const KENNUNG = new RegExp(KENNUNG_MUSTER_TEXT, "u");
const ZEIT = new RegExp(ZEIT_MUSTER_TEXT);
const KONTEXT = /^[A-Za-z0-9_.:-]{1,128}$/;
const VERSION = /^[A-Za-z0-9_.:+-]{1,40}$/;
const ROH_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const liste = (w) => (Array.isArray(w) ? w : []);
const istObj = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const tagePlus = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const tageZwischen = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const minuten = (z) => { const [h, m] = z.split(":").map(Number); return h * 60 + m; };
const groesser = (a, b) => (a > b ? a : b);
const kleiner = (a, b) => (a < b ? a : b);

/* ------------------------------------------------------------------------
   SCHUTZBEFUNDE NEUTRAL
   Ein Befund aus einer individuellen Schutz- oder Einsatzregel verrät mit
   Person und Tag das Merkmal (Schwangerschaft, Minderjährigkeit,
   Schwerbehinderung, Wiedereingliederung). Im Paket heißt er „schutz",
   ohne Fundstelle — wie in der Sicht des Betriebsrats (sicht.mjs).
   ------------------------------------------------------------------------ */
export const BEFUND_NEUTRAL = "schutz";
const SCHUTZ_TEXT = /schutz|muschg|mutter|jarbsch|jugend|minderj|sgb.?ix|schwerbeh|behind|einschr|wiedereing|keineNacht|keinAllein|maxDienste|bem\b|gesund|krank|schwanger|still/i;
export function befundNeutral(id) {
  const s = String(id);
  if (hat(BEFUND_KATALOG, s)) return BEFUND_KATALOG[s].schutz ? BEFUND_NEUTRAL : s;
  return SCHUTZ_TEXT.test(s) ? BEFUND_NEUTRAL : s;
}

/* ------------------------------------------------------------------------
   SITZUNG UND BETRIEB
   ------------------------------------------------------------------------ */
function sitzungPruefen(s) {
  if (!istObj(s) || typeof s.rolle !== "string" || !s.rolle
    || typeof s.bestand !== "string" || !s.bestand || s.bestand.length > 200
    || s.person === undefined || s.person === null || s.person === "")
    throw new KiFehler("KI_NICHT_ANGEMELDET", "Keine gültige Sitzung.");
}

/** Index des Betriebs aus der Sitzung — ohne Rückfall auf einen anderen. */
function betriebIndex(sitzung, bestand) {
  const n = istObj(bestand) ? liste(bestand.mandanten).length : 0;
  if (!n) return null;
  if (sitzung.betrieb === undefined || sitzung.betrieb === null) return n === 1 ? 0 : null;
  const i = Number(sitzung.betrieb);
  return Number.isInteger(i) && i >= 0 && i < n ? i : null;
}

/* ------------------------------------------------------------------------
   FAKTEN AUS DER SICHT
   Rohfakt (intern, nie nach außen): { feld, person?, einheit?, ref?, wert, datum?, bis?, regel? }
   person/einheit sind Kennungen der Sicht; sie werden zu Alias.
   ------------------------------------------------------------------------ */
function imZeitraum(p, zr) {
  if (!zr) return true;
  if (typeof p.eintritt === "string" && istDatum(p.eintritt) && p.eintritt > zr.bis) return false;
  if (typeof p.austritt === "string" && istDatum(p.austritt) && p.austritt < zr.von) return false;
  return true;
}

/**
 * Liest die Felder der Herkunft „sicht", die die Funktion erlaubt, aus der
 * Rollensicht. Exportiert für Tests und für WP-I12 (gleiche Grundlage);
 * das Gateway ruft nur faktenpaketBilden.
 * @param {any} eintrag Eintrag der Positivliste
 * @param {any} sicht der Betrieb in der Sicht der Rolle
 * @param {{ von: string, bis: string } | null} zr
 */
export function faktenAusSicht(eintrag, sicht, zr) {
  const will = (f) => feldErlaubt(eintrag, f) && FELDER[f].herkunft === "sicht";
  const aus = [];
  const nichtDarstellbar = { n: 0 };
  const kennung = (w) => (typeof w === "string" || typeof w === "number") && KENNUNG.test(String(w));
  if (!istObj(sicht)) return { fakten: aus, nichtDarstellbar: 0 };
  const nurStatus = new Set(liste(sicht.qualifikationen).filter((q) => istObj(q) && q.nurStatus).map((q) => String(q.id)));
  const einheiten = new Set(liste(sicht.einheiten).filter((e) => istObj(e) && e.id !== undefined).map((e) => String(e.id)));

  /* Dienstarten */
  for (const d of liste(sicht.dienstarten)) {
    if (!istObj(d) || d.id === undefined) continue;
    if (!kennung(d.id)) { nichtDarstellbar.n++; continue; }
    const ref = String(d.id);
    const s = typeof d.start === "string" && ZEIT.test(d.start) ? d.start : null;
    const e = typeof d.ende === "string" && ZEIT.test(d.ende) ? d.ende : null;
    if (will("dienstart.beginn") && s) aus.push({ feld: "dienstart.beginn", ref, wert: s });
    if (will("dienstart.ende") && e) aus.push({ feld: "dienstart.ende", ref, wert: e });
    if (will("dienstart.dauer") && s && e) {
      let dauer = minuten(e) - minuten(s);
      if (dauer <= 0) dauer += 1440;
      aus.push({ feld: "dienstart.dauer", ref, wert: dauer });
    }
  }
  /* Schichtfolge */
  if (will("zyklus.tag") && istObj(sicht.zyklus)) {
    liste(sicht.zyklus.tage).slice(0, 366).forEach((t, i) => {
      if (t === null || t === undefined || t === "-" || t === "") return;
      if (!kennung(t)) { nichtDarstellbar.n++; return; }
      aus.push({ feld: "zyklus.tag", ref: String(i), wert: String(t) });
    });
  }
  /* Qualifikationskatalog — ohne reine Statusnachweise (Impfschutz u. a.). */
  if (will("qualifikation.vorhanden")) {
    for (const q of liste(sicht.qualifikationen)) {
      if (!istObj(q) || q.id === undefined || q.nurStatus) continue;
      if (!kennung(q.id)) { nichtDarstellbar.n++; continue; }
      aus.push({ feld: "qualifikation.vorhanden", ref: String(q.id), wert: true });
    }
  }
  /* Einheiten */
  for (const e of liste(sicht.einheiten)) {
    if (!istObj(e) || e.id === undefined || !ROH_ID.test(String(e.id))) continue;
    if (will("einheit.vorhanden")) aus.push({ feld: "einheit.vorhanden", einheit: String(e.id), wert: true });
    if (will("einheit.pool")) aus.push({ feld: "einheit.pool", einheit: String(e.id), wert: e.pool === true });
  }

  /* Personen — nur, wer im Zeitraum beschäftigt ist. */
  const personen = new Map();
  for (const p of liste(sicht.personen)) {
    if (!istObj(p) || p.id === undefined || p.id === null || !ROH_ID.test(String(p.id))) continue;
    if (!imZeitraum(p, zr)) continue;
    personen.set(String(p.id), p);
  }
  for (const [id, p] of personen) {
    if (will("person.vorhanden")) aus.push({ feld: "person.vorhanden", person: id, wert: true });
    if (will("person.einheit") && zr) {
      const abschnitte = zugehoerigkeitsAbschnitte(p)
        || (p.bereich !== undefined && p.bereich !== null ? [{ von: zr.von, bis: zr.bis, einheitId: String(p.bereich) }] : []);
      for (const a of abschnitte) {
        if (!einheiten.has(a.einheitId) || a.bis < zr.von || a.von > zr.bis) continue;
        aus.push({ feld: "person.einheit", person: id, einheit: a.einheitId, wert: true,
          datum: groesser(a.von, zr.von), bis: kleiner(a.bis, zr.bis) });
      }
    }
    if (will("person.wochenstunden") && typeof p.wochenstunden === "number" && Number.isFinite(p.wochenstunden))
      aus.push({ feld: "person.wochenstunden", person: id, wert: p.wochenstunden });
    if (will("person.teilzeit") && hat(p, "teilzeit")) aus.push({ feld: "person.teilzeit", person: id, wert: !!p.teilzeit });
    if (will("person.springer") && hat(p, "springer")) aus.push({ feld: "person.springer", person: id, wert: p.springer === true });
    if (will("person.schichtdienst") && hat(p, "imSchichtdienst"))
      aus.push({ feld: "person.schichtdienst", person: id, wert: p.imSchichtdienst !== false });
    if (will("person.qualifikation")) {
      for (const q of liste(p.qualifikationen)) {
        if (nurStatus.has(String(q))) continue;
        if (!kennung(q)) { nichtDarstellbar.n++; continue; }
        aus.push({ feld: "person.qualifikation", person: id, wert: String(q) });
      }
    }
  }

  /* Plan: Abweichungen „Person|Tag" → Dienst oder frei. */
  if (zr && (will("schicht.dienst") || will("schicht.frei")) && istObj(sicht.abweichungen)) {
    for (const [k, v] of Object.entries(sicht.abweichungen)) {
      const [pid, tag] = String(k).split("|");
      if (!personen.has(pid) || !istDatum(tag) || tag < zr.von || tag > zr.bis) continue;
      if (v === "-" || v === "" || v === null) {
        if (will("schicht.frei")) aus.push({ feld: "schicht.frei", person: pid, datum: tag, wert: true });
      } else if (kennung(v)) {
        if (will("schicht.dienst")) aus.push({ feld: "schicht.dienst", person: pid, datum: tag, wert: String(v) });
      } else nichtDarstellbar.n++;
    }
  }
  /* Abwesenheiten: nur „abwesend", nie Art, Grund, Anmerkung, Nachweis. */
  if (zr && will("abwesenheit.zeitraum")) {
    for (const a of liste(sicht.abwesenheiten)) {
      if (!istObj(a) || !personen.has(String(a.personId)) || !istDatum(a.von) || !istDatum(a.bis) || a.bis < a.von) continue;
      if (a.bis < zr.von || a.von > zr.bis) continue;
      aus.push({ feld: "abwesenheit.zeitraum", person: String(a.personId), wert: "abwesend",
        datum: groesser(a.von, zr.von), bis: kleiner(a.bis, zr.bis) });
    }
  }
  return { fakten: aus, nichtDarstellbar: nichtDarstellbar.n };
}

/* ------------------------------------------------------------------------
   BERECHNETE FAKTEN (Faktenquelle, WP-I12) — einzeln geprüft
   ------------------------------------------------------------------------ */
const BERECHNET_SCHLUESSEL = new Set(["feld", "person", "einheit", "ref", "wert", "datum", "bis", "regel"]);
const STUFEN = ["hinweis", "achtung", "recht"];
const AENDERUNGEN = ["neu", "geaendert", "entfernt"];

/** Ein berechneter Fakt — geprüft und neutralisiert, oder null (verworfen). */
function berechnetPruefen(x, eintrag, umfang, zr) {
  if (!istObj(x) || Object.getPrototypeOf(x) !== Object.prototype) return null;
  if (Object.keys(x).some((k) => !BERECHNET_SCHLUESSEL.has(k))) return null;
  const feld = x.feld;
  if (typeof feld !== "string" || !hat(FELDER, feld) || FELDER[feld].herkunft !== "berechnet") return null;
  if (!feldErlaubt(eintrag, feld)) return null;
  const def = FELDER[feld];
  const f = { feld };
  /* Person: nur, wenn das Feld sie trägt, die Funktion Personen erlaubt und
     die Person in der Sicht der Rolle steht. */
  const mitPerson = x.person !== undefined && x.person !== null;
  if (def.subjekt === "person" && !mitPerson) return null;
  if (mitPerson) {
    if (!(def.subjekt === "person" || def.personOptional) || !eintrag.personenbezug) return null;
    if (!umfang.personen.has(String(x.person))) return null;
    f.person = String(x.person);
  }
  const mitEinheit = x.einheit !== undefined && x.einheit !== null;
  if (def.subjekt === "einheit" && !mitEinheit) return null;
  if (mitEinheit) {
    if (!umfang.einheiten.has(String(x.einheit))) return null;
    f.einheit = String(x.einheit);
  }
  let wert = x.wert;
  if (feld === "befund.regel" && (typeof wert === "string")) wert = befundNeutral(wert);
  if (feld === "kandidat.hinderung" && (typeof wert === "string")) wert = befundNeutral(wert);
  if (!wertPasstZurArt(def.art, wert)) return null;
  if (feld === "befund.stufe" && !STUFEN.includes(wert)) return null;
  if (feld === "aenderung.art" && !AENDERUNGEN.includes(wert)) return null;
  f.wert = wert;
  if (x.ref !== undefined) {
    if (!((typeof x.ref === "string" || typeof x.ref === "number") && KENNUNG.test(String(x.ref)))) return null;
    f.ref = befundNeutral(x.ref);
  }
  if (x.datum !== undefined) {
    if (!istDatum(x.datum) || (zr && (x.datum < zr.von || x.datum > zr.bis))) return null;
    f.datum = x.datum;
  }
  if (x.bis !== undefined) {
    if (!istDatum(x.bis) || f.datum === undefined || x.bis < f.datum) return null;
    f.bis = zr ? kleiner(x.bis, zr.bis) : x.bis;
  }
  if (x.regel !== undefined) {
    const r = x.regel;
    if (!istObj(r) || Object.keys(r).some((k) => !["regelId", "pruefstatus", "fundstelle"].includes(k))) return null;
    if (typeof r.regelId !== "string" || !KENNUNG.test(r.regelId) || !["geprueft", "provisional", "hinweis"].includes(r.pruefstatus)) return null;
    const id = befundNeutral(r.regelId);
    f.regel = { regelId: id, pruefstatus: r.pruefstatus };
    if (id !== BEFUND_NEUTRAL && typeof r.fundstelle === "string" && !SCHUTZ_TEXT.test(r.fundstelle)) f.regel.fundstelle = r.fundstelle;
  }
  return f;
}

/* ------------------------------------------------------------------------
   BILDEN
   ------------------------------------------------------------------------ */
function zeitraumPruefen(eintrag, eingabe) {
  if (!eintrag.felder.length) return null;
  const zr = eingabe.zeitraum;
  if (!istObj(zr) || !istDatum(zr.von) || !istDatum(zr.bis) || zr.bis < zr.von)
    throw new KiFehler("KI_EINGABE", "Zeitraum fehlt oder ist ungültig.");
  if (tageZwischen(zr.von, zr.bis) + 1 > ZEITRAUM_MAX_TAGE) throw new KiFehler("KI_EINGABE", "Zeitraum zu lang.");
  return { von: zr.von, bis: zr.bis };
}

function versionenPruefen(v) {
  if (!istObj(v) || Object.keys(v).some((k) => !["engine", "regelstand", "tarifstand"].includes(k))
    || !["engine", "regelstand", "tarifstand"].every((k) => typeof v[k] === "string" && VERSION.test(v[k])))
    throw new KiFehler("KI_EINGABE", "Versionen fehlen oder sind ungültig.");
  return { schema: SCHEMA_VERSION, positivliste: POSITIVLISTE_VERSION, engine: v.engine, regelstand: v.regelstand,
    tarifstand: v.tarifstand };
}

const BEZUG_SCHLUESSEL = ["datum", "personId", "schichtId", "einheitId"];

/**
 * Bildet das Faktenpaket einer Funktion für die Sitzung.
 *
 * @param {{
 *   sitzung: { rolle: string, person: any, bestand: string, betrieb?: number|string },
 *   ladeBestand: (raum: string) => any | Promise<any>,
 *   funktion: string,
 *   eingabe?: { zeitraum?: { von: string, bis: string }, fremdtext?: string[] },
 *   bezug?: { datum?: string, personId?: string, schichtId?: string, einheitId?: string },
 *   kontext: string,
 *   aliasSchluessel: Uint8Array,
 *   versionen: { engine: string, regelstand: string, tarifstand: string },
 *   faktenquelle?: (a: { funktion: string, sicht: any, zeitraum: any, eingabe: any }) => any[] | Promise<any[]>,
 *   audit?: (ereignis: Readonly<Record<string, any>>) => void,
 * }} o
 * @returns {Promise<{ paket: any, aliasKarte: AliasKarte }>}
 */
export async function faktenpaketBilden(o) {
  const { sitzung, ladeBestand, funktion, eingabe = {}, bezug, kontext, aliasSchluessel, versionen, faktenquelle, audit }
    = o || /** @type {any} */ ({});
  const melden = (e) => { try { if (typeof audit === "function") audit(Object.freeze({ ...e })); } catch { /* Audit stört nie */ } };

  sitzungPruefen(sitzung);
  const eintrag = funktionEintrag(funktion);
  if (!eintrag) throw new KiFehler("KI_FUNKTION", "Diese Funktion gibt es nicht.");
  if (!rolleDarf(eintrag, sitzung.rolle)) throw new KiFehler("KI_ROLLE", "Diese Rolle darf die Funktion nicht auslösen.");

  const ev = pruefeEingabe(eingabe);
  if (!ev.ok) throw new KiFehler("KI_EINGABE", "Eingabe ungültig.");
  if (liste(eingabe.fremdtext).length && !eintrag.fremdtext)
    throw new KiFehler("KI_EINGABE", "Freitext ist für diese Funktion nicht zugelassen.");
  const zr = zeitraumPruefen(eintrag, eingabe);
  const vers = versionenPruefen(versionen);
  if (typeof kontext !== "string" || !KONTEXT.test(kontext)) throw new KiFehler("KI_EINGABE", "Kontext fehlt oder ist ungültig.");
  if (bezug !== undefined && (!istObj(bezug) || Object.keys(bezug).some((k) => !BEZUG_SCHLUESSEL.includes(k))))
    throw new KiFehler("KI_EINGABE", "Bezug ungültig.");
  if (typeof ladeBestand !== "function") throw new KiFehler("KI_INTERN", "Kein Bestandszugriff.");

  /* Raum und Betrieb aus der Sitzung. */
  const raum = sitzung.bestand;
  const bestand = await ladeBestand(raum);
  const idx = betriebIndex(sitzung, bestand);
  if (idx === null) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  const roh = bestand.mandanten[idx];
  if (!istObj(roh) || roh.id === undefined || roh.id === null) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  if (hat(roh, "raum") && roh.raum !== undefined && roh.raum !== null && roh.raum !== raum)
    throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");

  /* Die Sicht der Rolle — ab hier kein Rohbestand mehr. */
  const sichtBestand = bestandFuerRolle(bestand, { ...sitzung, betrieb: idx });
  const sicht = sichtBestand && Array.isArray(sichtBestand.mandanten) ? sichtBestand.mandanten[0] : null;
  if (!istObj(sicht) || String(sicht.id) !== String(roh.id)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");

  const { fakten: ausSicht, nichtDarstellbar } = faktenAusSicht(eintrag, sicht, zr);
  const umfang = {
    personen: new Set(ausSicht.filter((f) => f.person !== undefined).map((f) => f.person)
      .concat(liste(sicht.personen).filter((p) => istObj(p) && p.id !== undefined && p.id !== null && imZeitraum(p, zr))
        .map((p) => String(p.id)))),
    einheiten: new Set(liste(sicht.einheiten).filter((e) => istObj(e) && e.id !== undefined).map((e) => String(e.id))),
  };
  let verworfen = 0;
  const rohFakten = [...ausSicht];
  if (faktenquelle !== undefined) {
    if (typeof faktenquelle !== "function") throw new KiFehler("KI_INTERN", "Faktenquelle ungültig.");
    const kopie = deepFreeze(structuredClone(sicht));
    const berechnet = await faktenquelle({ funktion, sicht: kopie, zeitraum: zr ? { ...zr } : null,
      eingabe: deepFreeze(structuredClone({ zeitraum: eingabe.zeitraum })) });
    for (const x of liste(berechnet)) {
      const f = berechnetPruefen(x, eintrag, umfang, zr);
      if (f) rohFakten.push(f); else verworfen++;
    }
  }
  /* Schnitt mit der Positivliste — noch einmal für jeden Fakt, gleich woher. */
  const erlaubt = rohFakten.filter((f) => {
    const ok = feldErlaubt(eintrag, f.feld) && (f.person === undefined || eintrag.personenbezug);
    if (!ok) verworfen++;
    return ok;
  });
  if (erlaubt.length > FAKTEN_MAX) throw new KiFehler("KI_EINGABE", "Zu viele Fakten — Zeitraum oder Umfang verkleinern.");

  /* Alias. */
  const karte = new AliasKarte({ schluessel: aliasSchluessel, raum, betriebId: String(roh.id), betriebIndex: idx, kontext });
  const fakten = erlaubt.map((f) => {
    const def = FELDER[f.feld];
    const a = { feld: f.feld, art: def.art, wert: f.wert };
    if (def.einheit && def.art === "zahl") a.einheit = def.einheit;
    if (f.person !== undefined) a.alias = karte.alias("person", f.person);
    if (f.einheit !== undefined) {
      if (def.subjekt === "einheit") a.alias = karte.alias("einheit", f.einheit);
      else a.bezugAlias = karte.alias("einheit", f.einheit);
    }
    if (f.ref !== undefined) a.ref = f.ref;
    if (f.datum !== undefined) a.datum = f.datum;
    if (f.bis !== undefined) a.bis = f.bis;
    if (f.regel !== undefined) a.regel = f.regel;
    return a;
  });
  const schl = (a) => [a.feld, a.ref || "", a.datum || "", a.alias || "", a.bezugAlias || "", String(a.wert)].join("\u0001");
  const mitId = fakten.map((a) => [schl(a), a]).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .map(([, a], i) => ({ id: `f.${i}`, ...a }));

  /* Bezug der Anfrage: nur, was die Rolle sieht. */
  let paketBezug;
  if (bezug !== undefined) {
    paketBezug = {};
    if (bezug.personId !== undefined) {
      if (!eintrag.personenbezug || !umfang.personen.has(String(bezug.personId))) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
      paketBezug.alias = karte.alias("person", String(bezug.personId));
    }
    if (bezug.einheitId !== undefined) {
      if (!umfang.einheiten.has(String(bezug.einheitId))) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
      paketBezug.bezugAlias = karte.alias("einheit", String(bezug.einheitId));
    }
    if (bezug.datum !== undefined) {
      if (!istDatum(bezug.datum)) throw new KiFehler("KI_EINGABE", "Bezug ungültig.");
      paketBezug.datum = bezug.datum;
    }
    if (bezug.schichtId !== undefined) {
      if (typeof bezug.schichtId !== "string" || !KENNUNG.test(bezug.schichtId)) throw new KiFehler("KI_EINGABE", "Bezug ungültig.");
      paketBezug.ref = bezug.schichtId;
    }
  }

  const paket = { schemaVersion: SCHEMA_VERSION, funktion, versionen: vers, zeitraum: zr, fakten: mitId };
  if (paketBezug && Object.keys(paketBezug).length) paket.bezug = paketBezug;
  const bloecke = eintrag.fremdtext ? fremdtextBloecke(eingabe.fremdtext) : [];
  if (bloecke.length) paket.fremdtext = bloecke;

  /* Schema, dann Leck-Prüfung — beide fail closed. */
  const verwerfen = (kategorien) => {
    melden({ art: "ki.faktenpaket.verworfen", funktion, rolle: sitzung.rolle, kategorien: [...new Set(kategorien)].sort(),
      anzahl: kategorien.length });
    throw new KiFehler("KI_LECK", "Das Faktenpaket wurde verworfen (Datenschutzprüfung).");
  };
  let schema;
  try { schema = pruefeFaktenpaket(paket); } catch { schema = { ok: false, fehler: ["$"] }; }
  if (!schema.ok) verwerfen(["STRUKTUR"]);
  let leck;
  try { leck = leckPruefen(paket, sperrlisteBilden(roh, { raum })); } catch { leck = { ok: false, befunde: [{ kategorie: "STRUKTUR" }] }; }
  if (!leck || leck.ok !== true) {
    const kategorien = liste(leck && leck.befunde).map((b) => String(b && b.kategorie));
    verwerfen(kategorien.length ? kategorien : ["STRUKTUR"]);
  }

  melden({ art: "ki.faktenpaket.gebildet", funktion, rolle: sitzung.rolle, fakten: mitId.length, verworfen,
    nichtDarstellbar, fremdtext: bloecke.length });
  return { paket: deepFreeze(paket), aliasKarte: karte };
}

/** Vorhandene Zeitraum-Hilfe für Aufrufer (I13): Zeitraum ab Tag, n Tage. */
export const zeitraumAb = (von, tage) => ({ von, bis: tagePlus(von, Math.max(0, tage - 1)) });
