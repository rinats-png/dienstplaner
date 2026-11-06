/* ==========================================================================
   REGELBAUKASTEN, ERWEITERT — Muster-, Block-, Verteilungs-, Wunschregel (WP-I3)

   Die vier Regelarten, die der Plan (PLAN-WARNEN-VORGABEN-PLANVORSCHLAG, 5.2)
   zusätzlich zu Zähl-, Grenz-, Besetzungs- und Paarregel vorsieht. Dieselbe
   Maschine, keine zweite: Ergebnisformen, Prüfstatus und Stufendeckel kommen
   aus regelbaukasten.mjs (BAUSTEINE). Rein: keine Ablage, keine Uhr, kein
   Zufall, kein Sprachmodell. Eingaben werden nie verändert.

   Der Plan eines Tages ist hier eine Karte  { "2026-03-07": "F", … }:
     Wert = Dienstart-Klasse (beliebiger Text des Aufrufers, z. B. "F", "S",
            "N") oder die Freiklasse (Parameter `frei`, Vorgabe "frei")
     fehlender Tag / null / kein Text = unbekannt → nie als „erfüllt" gelesen.
   Was eine Klasse bedeutet, legt der Aufrufer fest, nicht die Regel.

   ---------------------------------------------------------------------------
   Grundsätze (gelten für alle vier Arten)

   - „offen" ist nie grün: Fehlen Tage, ist das Ergebnis „offen" — es sei
     denn, die vorhandenen Tage zeigen die Verletzung schon sicher; dann
     „verletzt" (weitere Daten könnten sie nur bestätigen, nie aufheben).
   - Keine Personenbewertung (Plan 6.3): Parameter dürfen kein Merkmal einer
     Person wie Gesundheit, Leistung, Fehlzeit, Verhalten nennen. Die Regel
     rechnet über Planfakten (Dienstart, Tag, Anzahl).
   - Wunsch ist nur ein Wunsch: Befund höchstens „hinweis", Folge „keine".
   - Zeiträume: Ein Lauf, der am Rand des Zeitraums beginnt oder endet, kann
     nicht sehen, was davor/danach liegt. Der Aufrufer gibt dafür Vor- und
     Nachlauf mit; sonst ist das Ergebnis „offen".
   ========================================================================== */
import { addDays, dow } from "./regelwerk.mjs";
import { REGELN_BRANCHEN } from "./branchenkatalog.mjs";
import { zaehlregel, grenzregel, besetzungsregel, paarregel, BAUSTEINE } from "./regelbaukasten.mjs";

const { istTag, befund, erfuellt, nichtAnwendbar, offen, anwendung, holeRegel, verletzt } = BAUSTEINE;

export const REGELARTEN_ALLE = [
  "zaehlregel", "grenzregel", "besetzungsregel", "paarregel",
  "musterregel", "blockregel", "verteilungsregel", "wunschregel",
];

/** Längster auswertbarer Zeitraum in Tagen (Schutz vor unsinnigen Aufrufen). */
export const MAX_TAGE = 800;

/* Wortstämme, die in Regelparametern nichts zu suchen haben (Plan 6.3). */
const VERBOTEN = /krank|gesund|fehlzeit|leistung|zuverl|verhalten|diagnos|schwanger|behinder|disziplin/i;

function ohnePersonenbewertung(r) {
  const text = JSON.stringify(r.parameter || {});
  if (VERBOTEN.test(text) || VERBOTEN.test(String(r.bezeichnung || "")))
    throw new Error(`Regelbaukasten: ${r.id} nennt ein Personenmerkmal; Regeln rechnen nur über Planfakten (Plan 6.3).`);
}

/* --------------------------------------------------------------------------
   Gemeinsames: Tage und Zeitraum
   -------------------------------------------------------------------------- */
const hat = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
/** Klasse eines Tages oder undefined (unbekannt). */
const klasseAn = (tage, d) => (tage && hat(tage, d) && typeof tage[d] === "string" && tage[d] !== "" ? tage[d] : undefined);

/** Alle Tage von..bis; null, wenn der Zeitraum fehlt/ungültig/zu lang ist. */
function tageVonBis(von, bis) {
  if (!istTag(von) || !istTag(bis) || von > bis) return null;
  const liste = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    liste.push(d);
    if (liste.length > MAX_TAGE) return null;
  }
  return liste;
}

const klassenListe = (x, r, name) => {
  if (!Array.isArray(x) || !x.length || x.some((k) => typeof k !== "string" || !k))
    throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter (${name}).`);
  return x;
};

/** Gemeinsamer Kopf: Regel holen, Wirkung/Gültigkeit prüfen, Zeitraum lesen. */
function kopf(regelOderId, typ, kontext) {
  const r = holeRegel(regelOderId, typ);
  const k = kontext || {};
  const nein = anwendung(r, k.stichtag || k.datum || k.bis);
  if (nein) return { nein };
  ohnePersonenbewertung(r);
  return { r, p: r.parameter || {}, k };
}
const zeitraumFehlt = (r) => offen(r, "Der Zeitraum (von/bis) fehlt oder ist ungültig.", null);

/* --------------------------------------------------------------------------
   MUSTERREGEL — Folgen

   parameter.art "verbotenFolge":
     { art, von: [Klasse…], dann: [Klasse…], abstandTage?: 1 }
     „nach einem Nachtdienst kein Frühdienst": steht am Tag d eine Klasse aus
     `von`, darf am Tag d+abstandTage keine aus `dann` stehen.
   parameter.art "hoechstensFolge":
     { art, klassen: [Klasse…], max, danachFrei?: 0, frei?: "frei" }
     „Nachtblöcke höchstens 3 Nächte, danach 2 Tage frei": aufeinanderfolgende
     Tage mit einer Klasse aus `klassen` sind ein Block; er darf nicht länger
     als `max` sein, und die `danachFrei` Tage danach müssen Freiklasse sein.
   kontext: { tage, von, bis, stichtag? }
   -------------------------------------------------------------------------- */
/** @param {any} regelOderId @param {any} [kontext] */
export function musterregel(regelOderId, kontext) {
  const h = kopf(regelOderId, "musterregel", kontext);
  if (h.nein) return h.nein;
  const { r, p, k } = h;
  const frei = typeof p.frei === "string" && p.frei ? p.frei : "frei";
  const tage = k.tage;
  if (p.art === "verbotenFolge") {
    const von = klassenListe(p.von, r, "von"), dann = klassenListe(p.dann, r, "dann");
    const abstand = p.abstandTage === undefined ? 1 : Number(p.abstandTage);
    if (!Number.isInteger(abstand) || abstand < 1) throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter (abstandTage).`);
    const liste = tageVonBis(k.von, k.bis);
    if (!liste) return zeitraumFehlt(r);
    const verstoesse = [];
    let unbekannt = 0, paare = 0;
    for (const d of liste) {
      const spaeter = addDays(d, abstand);
      if (spaeter > k.bis) continue;
      paare++;
      const a = klasseAn(tage, d), b = klasseAn(tage, spaeter);
      if (a === undefined || b === undefined) { unbekannt++; continue; }
      if (von.includes(a) && dann.includes(b)) verstoesse.push({ tag: d, folgetag: spaeter, von: a, dann: b });
    }
    const fakten = { art: p.art, paare, verstoesse, unbekanntePaare: unbekannt };
    if (verstoesse.length) return verletzt(r, `${r.bezeichnung}: ${verstoesse.length} Verstoß(e), erster am ${verstoesse[0].tag} → ${verstoesse[0].folgetag}`, fakten);
    if (paare === 0) return nichtAnwendbar(r, "voraussetzung_fehlt", "Der Zeitraum enthält kein Tagespaar.");
    if (unbekannt) return offen(r, `${unbekannt} Tagespaar(e) mit unbekanntem Dienst`, fakten);
    return erfuellt(r, `${r.bezeichnung}: erfüllt`, fakten);
  }
  if (p.art === "hoechstensFolge") {
    const klassen = klassenListe(p.klassen, r, "klassen");
    const max = Number(p.max), danach = p.danachFrei === undefined ? 0 : Number(p.danachFrei);
    if (!Number.isInteger(max) || max < 1 || !Number.isInteger(danach) || danach < 0)
      throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter (max/danachFrei).`);
    const liste = tageVonBis(k.von, k.bis);
    if (!liste) return zeitraumFehlt(r);
    const verstoesse = [];
    let unsicher = 0;
    let i = 0;
    while (i < liste.length) {
      const c = klasseAn(tage, liste[i]);
      if (c === undefined) { unsicher++; i++; continue; }
      if (!klassen.includes(c)) { i++; continue; }
      let j = i;
      while (j + 1 < liste.length && klassen.includes(klasseAn(tage, liste[j + 1]))) j++;
      const laenge = j - i + 1;
      const blockEnde = liste[j];
      if (laenge > max) verstoesse.push({ von: liste[i], bis: blockEnde, laenge, grund: "zu_lang" });
      else if (i === 0) unsicher++; // könnte schon vor dem Zeitraum begonnen haben
      let gebrochen = false, fehltDaten = false;
      for (let n = 1; n <= danach && !gebrochen; n++) {
        const t = addDays(blockEnde, n);
        const kl = t > k.bis ? undefined : klasseAn(tage, t);
        if (kl === undefined) { fehltDaten = true; break; } // ab hier unklar, wo der Block endet
        if (kl !== frei) { gebrochen = true; verstoesse.push({ von: liste[i], bis: blockEnde, laenge, grund: "nicht_frei_danach", tag: t }); }
      }
      if (fehltDaten && !gebrochen) unsicher++;
      i = j + 1;
    }
    const fakten = { art: p.art, max, danachFrei: danach, verstoesse, unsicher };
    if (verstoesse.length) return verletzt(r, `${r.bezeichnung}: ${verstoesse.length} Verstoß(e), erster ab ${verstoesse[0].von}`, fakten);
    if (unsicher) return offen(r, "Block am Rand des Zeitraums oder Tage ohne Angabe", fakten);
    return erfuellt(r, `${r.bezeichnung}: erfüllt`, fakten);
  }
  throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter (art).`);
}

/* --------------------------------------------------------------------------
   BLOCKREGEL — zusammengehörige Tage

   parameter: { wochentage: [5, 6], gruppen?: { F: "tag", S: "tag" }, frei?: "frei" }
     Montag = 0 … Sonntag = 6. In jeder Kalenderwoche des Zeitraums müssen die
     Tage des Blocks dieselbe Bezeichnung tragen. Bezeichnung = die Klasse,
     oder deren Gruppe, wenn `gruppen` sie benennt („Früh am Samstag, Spät am
     Sonntag" gelten dann als gleich, wenn beide Gruppe „tag" sind). Frei ist
     eine eigene Bezeichnung.
   kontext: { tage, von, bis }
   Ein Block, der nicht ganz im Zeitraum liegt, wird nicht bewertet (er steht
   in fakten.randbloecke); liegt gar keiner ganz darin, ist das Ergebnis offen.
   -------------------------------------------------------------------------- */
/** @param {any} regelOderId @param {any} [kontext] */
export function blockregel(regelOderId, kontext) {
  const h = kopf(regelOderId, "blockregel", kontext);
  if (h.nein) return h.nein;
  const { r, p, k } = h;
  const wt = p.wochentage;
  if (!Array.isArray(wt) || wt.length < 2 || wt.some((x) => !Number.isInteger(x) || x < 0 || x > 6) || new Set(wt).size !== wt.length)
    throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter (wochentage).`);
  const tageImBlock = [...wt].sort((a, b) => a - b);
  const gruppen = p.gruppen && typeof p.gruppen === "object" ? p.gruppen : {};
  const frei = typeof p.frei === "string" && p.frei ? p.frei : "frei";
  const bez = (c) => (hat(gruppen, c) ? gruppen[c] : c);
  const liste = tageVonBis(k.von, k.bis);
  if (!liste) return zeitraumFehlt(r);

  const verstoesse = [], randbloecke = [];
  let bewertet = 0, unsicher = 0;
  const erster = addDays(k.von, -dow(k.von));
  for (let montag = erster; montag <= k.bis; montag = addDays(montag, 7)) {
    const daten = tageImBlock.map((w) => addDays(montag, w));
    const imZeitraum = daten.filter((d) => d >= k.von && d <= k.bis);
    if (!imZeitraum.length) continue;
    if (imZeitraum.length < daten.length) { randbloecke.push(daten[0]); continue; }
    bewertet++;
    const klassen = daten.map((d) => klasseAn(k.tage, d));
    const bekannt = klassen.filter((c) => c !== undefined).map((c) => (c === frei ? frei : bez(c)));
    if (new Set(bekannt).size > 1) verstoesse.push({ tage: daten, klassen });
    else if (klassen.some((c) => c === undefined)) unsicher++;
  }
  const fakten = { bloecke: bewertet, verstoesse, randbloecke, unsicher };
  if (verstoesse.length) return verletzt(r, `${r.bezeichnung}: ${verstoesse.length} von ${bewertet} Block/Blöcken uneinheitlich, erster ab ${verstoesse[0].tage[0]}`, fakten);
  if (!bewertet) return randbloecke.length ? offen(r, "Kein Block liegt ganz im Zeitraum", fakten) : nichtAnwendbar(r, "voraussetzung_fehlt", "Der Zeitraum enthält keinen Block.");
  if (unsicher) return offen(r, `${unsicher} Block/Blöcke mit unbekanntem Dienst`, fakten);
  return erfuellt(r, `${r.bezeichnung}: erfüllt`, fakten);
}

/* --------------------------------------------------------------------------
   VERTEILUNGSREGEL — gleichmäßig verteilen

   parameter: { groesse, maxAbweichung }
     Spannweite (größter minus kleinster Wert) über die Personen darf
     `maxAbweichung` nicht überschreiten: „Nächte gleichmäßig, Abweichung
     höchstens 1 je Quartal". Die Größe ist ein Planfakt (Anzahl Nächte,
     Wochenenden …); der Aufrufer zählt sie im gewünschten Bezugszeitraum.
   kontext: { werte: { personId: Zahl | undefined } }
   Eine Person ohne Wert macht den Fall offen, außer die bekannten Werte
   zeigen die Verletzung schon (Spannweite wächst nur). Weniger als zwei
   Personen: nicht anwendbar.
   -------------------------------------------------------------------------- */
/** @param {any} regelOderId @param {any} [kontext] */
export function verteilungsregel(regelOderId, kontext) {
  const h = kopf(regelOderId, "verteilungsregel", kontext);
  if (h.nein) return h.nein;
  const { r, p, k } = h;
  const grenze = Number(p.maxAbweichung);
  if (typeof p.groesse !== "string" || !p.groesse || !Number.isFinite(grenze) || grenze < 0)
    throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter.`);
  if (!k.werte || typeof k.werte !== "object" || Array.isArray(k.werte)) return offen(r, `Die Werte „${p.groesse}" sind nicht bekannt.`, null);
  const ids = Object.keys(k.werte).sort();
  const ok = (v) => typeof v === "number" && Number.isFinite(v);
  const bekannt = ids.filter((id) => ok(k.werte[id]));
  const unbekannt = ids.length - bekannt.length;
  if (ids.length < 2) return nichtAnwendbar(r, "voraussetzung_fehlt", "Weniger als zwei Personen in der Verteilung.");
  if (bekannt.length < 2) return offen(r, `Für ${unbekannt} Person(en) fehlt der Wert „${p.groesse}"`, { unbekannt, personen: ids.length });
  const werte = bekannt.map((id) => k.werte[id]);
  const min = Math.min(...werte), max = Math.max(...werte);
  const fakten = {
    groesse: p.groesse, min, max, spannweite: Math.round((max - min) * 1e9) / 1e9, maxAbweichung: grenze,
    personen: ids.length, unbekannt,
    niedrigste: bekannt.filter((id) => k.werte[id] === min), hoechste: bekannt.filter((id) => k.werte[id] === max),
  };
  if (max - min > grenze + 1e-9) return verletzt(r, `${r.bezeichnung}: ${p.groesse} reicht von ${min} bis ${max}, Abweichung höchstens ${grenze} erlaubt`, fakten);
  if (unbekannt) return offen(r, `Für ${unbekannt} Person(en) fehlt der Wert „${p.groesse}"`, fakten);
  return erfuellt(r, `${r.bezeichnung}: Abweichung ${fakten.spannweite} (höchstens ${grenze})`, fakten);
}

/* --------------------------------------------------------------------------
   WUNSCHREGEL — nur berücksichtigt, wenn möglich

   parameter: { wunsch: "frei" | "dienstart" | "keineDienstart",
                wochentage?: [0..6], daten?: [Tag…], klassen?: [Klasse…],
                prioritaet?: 1..5 (1 = wichtigster, Vorgabe 3), frei?: "frei" }
     „frei": der Tag muss Freiklasse sein; „dienstart": die Klasse muss eine
     aus `klassen` sein; „keineDienstart": darf keine aus `klassen` sein.
     Betrachtet werden die Tage im Zeitraum, die zu `wochentage` oder `daten`
     passen (eines von beiden ist Pflicht).
   kontext: { tage, von, bis }
   Eine Verletzung ist nur ein Hinweis (Stufe „hinweis", Folge „keine"),
   gleich was die Regel als hoechsteStufe führt — ein Wunsch ist kein Muss.
   -------------------------------------------------------------------------- */
const WUNSCH_ARTEN = ["frei", "dienstart", "keineDienstart"];
/** @param {any} regelOderId @param {any} [kontext] */
export function wunschregel(regelOderId, kontext) {
  const h = kopf(regelOderId, "wunschregel", kontext);
  if (h.nein) return h.nein;
  const { r, p, k } = h;
  if (!WUNSCH_ARTEN.includes(p.wunsch)) throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter (wunsch).`);
  const frei = typeof p.frei === "string" && p.frei ? p.frei : "frei";
  const klassen = p.wunsch === "frei" ? null : klassenListe(p.klassen, r, "klassen");
  const prio = p.prioritaet === undefined ? 3 : Number(p.prioritaet);
  if (!Number.isInteger(prio) || prio < 1 || prio > 5) throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter (prioritaet).`);
  const wt = p.wochentage, daten = p.daten;
  const hatWt = Array.isArray(wt) && wt.length && wt.every((x) => Number.isInteger(x) && x >= 0 && x <= 6);
  const hatDaten = Array.isArray(daten) && daten.length && daten.every(istTag);
  if (!hatWt && !hatDaten) throw new Error(`Regelbaukasten: ${r.id} hat unvollständige Parameter (wochentage/daten).`);
  const liste = tageVonBis(k.von, k.bis);
  if (!liste) return zeitraumFehlt(r);

  const gemeint = liste.filter((d) => (hatWt && wt.includes(dow(d))) || (hatDaten && daten.includes(d)));
  if (!gemeint.length) return nichtAnwendbar(r, "voraussetzung_fehlt", "Im Zeitraum liegt kein Wunschtag.");
  const nicht = [];
  let unbekannt = 0;
  for (const d of gemeint) {
    const c = klasseAn(k.tage, d);
    if (c === undefined) { unbekannt++; continue; }
    const erf = p.wunsch === "frei" ? c === frei : p.wunsch === "dienstart" ? klassen.includes(c) : !klassen.includes(c);
    if (!erf) nicht.push(d);
  }
  const fakten = { wunsch: p.wunsch, prioritaet: prio, wunschtage: gemeint.length, erfuellt: gemeint.length - nicht.length - unbekannt, nichtErfuellt: nicht, unbekannt };
  if (nicht.length) {
    const text = `${r.bezeichnung}: ${nicht.length} von ${gemeint.length} Wunschtag(en) nicht erfüllt`;
    /* Nie mehr als ein Hinweis, auch bei hoechsteStufe "recht" im Eintrag. */
    return { regelId: r.id, status: "verletzt", befund: befund({ ...r, hoechsteStufe: "hinweis", folge: "keine" }, "hinweis", text, fakten), offen: false, text, fakten };
  }
  if (unbekannt) return offen(r, `${unbekannt} Wunschtag(e) ohne bekannten Dienst`, fakten);
  return erfuellt(r, `${r.bezeichnung}: alle ${gemeint.length} Wunschtag(e) erfüllt`, fakten);
}

/**
 * Ordnet Wunschergebnisse: wichtigste Priorität zuerst (1 vor 5), dann
 * unerfüllte vor erfüllten, dann nach Kennung — stabil, ohne Zufall.
 * @param {Array<any>} ergebnisse Ergebnisse von wunschregel()
 */
export function wuenscheGeordnet(ergebnisse) {
  const prio = (e) => (e && e.fakten && Number.isInteger(e.fakten.prioritaet) ? e.fakten.prioritaet : 3);
  const rang = (e) => (e.status === "verletzt" ? 0 : e.status === "offen" ? 1 : 2);
  return [...ergebnisse].sort((a, b) => prio(a) - prio(b) || rang(a) - rang(b) || String(a.regelId).localeCompare(String(b.regelId)));
}

/* --------------------------------------------------------------------------
   WOCHENENDEN (Hilfe zu Plan 5.3, Wochenend-Rotation)

   wochenendEreignisse(tage, von, bis, opt) ordnet jedes Wochenende im
   Zeitraum einer Art zu. Ein Wochenende ist hier der Block `wochentage`
   (Vorgabe Samstag/Sonntag = [5, 6]); es zählt nur, wenn alle Tage im
   Zeitraum liegen (Randwochenenden → `rand`). Arten:
     frei     alle Tage Freiklasse
     tag      alle Tage eine Klasse aus `tagKlassen`
     nacht    alle Tage eine Klasse aus `nachtKlassen`
     gemischt sonst (bekannte Tage, die nicht in eine Art passen)
     offen    ein Tag unbekannt und keine andere Art mehr möglich … oder
              schlicht unbekannt (vollstaendig = false)
   Das Ereignisdatum ist der erste Tag des Blocks. Wie das Wochenende bei
   Nachtdienst Freitag→Samstag oder im Monat mit fünf Wochenenden zu zählen
   ist, entscheidet die Praxis, nicht dieser Code (docs/acc45/wp-i3-i6-fragen.md);
   hier bestimmt allein die Klasse am Tag.
   -------------------------------------------------------------------------- */
/** @returns {{frei: string[], tag: string[], nacht: string[], gemischt: string[], offen: string[], rand: string[], vollstaendig: boolean}} */
export function wochenendEreignisse(tage, von, bis, opt = {}) {
  const wt = Array.isArray(opt.wochentage) && opt.wochentage.length ? [...opt.wochentage].sort((a, b) => a - b) : [5, 6];
  const frei = opt.frei || "frei";
  const tagK = opt.tagKlassen || [], nachtK = opt.nachtKlassen || [];
  const aus = { frei: [], tag: [], nacht: [], gemischt: [], offen: [], rand: [], vollstaendig: true };
  const liste = tageVonBis(von, bis);
  if (!liste) { aus.vollstaendig = false; return aus; }
  for (let montag = addDays(von, -dow(von)); montag <= bis; montag = addDays(montag, 7)) {
    const daten = wt.map((w) => addDays(montag, w));
    const drin = daten.filter((d) => d >= von && d <= bis);
    if (!drin.length) continue;
    if (drin.length < daten.length) { aus.rand.push(daten[0]); continue; }
    const cs = daten.map((d) => klasseAn(tage, d));
    const alle = (f) => cs.every((c) => c !== undefined && f(c));
    if (alle((c) => c === frei)) aus.frei.push(daten[0]);
    else if (alle((c) => tagK.includes(c))) aus.tag.push(daten[0]);
    else if (alle((c) => nachtK.includes(c))) aus.nacht.push(daten[0]);
    else if (cs.some((c) => c === undefined)) { aus.offen.push(daten[0]); aus.vollstaendig = false; }
    else aus.gemischt.push(daten[0]);
  }
  return aus;
}

/**
 * Zählregel über Wochenenden einer Art (frei | tag | nacht | gemischt).
 * Ist ein Wochenende offen, wird kein Ergebnis grün, das davon abhängt:
 * „höchstens" kann durch ein offenes Wochenende noch reißen, „mindestens"
 * noch erreicht werden — dann ist das Ergebnis „offen".
 * @param {any} regelOderId Zählregel mit Fenster (z. B. kalendermonat)
 * @param {"frei"|"tag"|"nacht"|"gemischt"} art
 * @param {{tage:any, von:string, bis:string, stichtag:string, frei?:string, tagKlassen?:string[], nachtKlassen?:string[], wochentage?:number[]}} kontext
 */
export function wochenendZaehlregel(regelOderId, art, kontext) {
  if (!["frei", "tag", "nacht", "gemischt"].includes(art)) throw new Error(`Regelbaukasten: Wochenendart „${art}" unbekannt.`);
  const k = kontext || {};
  const e = wochenendEreignisse(k.tage, k.von, k.bis, k);
  const z = zaehlregel(regelOderId, { ereignisse: e[art], stichtag: k.stichtag });
  if (e.offen.length && (z.status === "erfuellt" || z.status === "verletzt")) {
    const richtung = z.fakten && z.fakten.richtung;
    const sicher = (z.status === "verletzt" && richtung === "hoechstens") || (z.status === "erfuellt" && richtung === "mindestens");
    if (!sicher) return offen(holeRegel(regelOderId, "zaehlregel"), `${e.offen.length} Wochenende(n) ohne vollständigen Plan`, { ...z.fakten, offeneWochenenden: e.offen });
  }
  return z;
}

/* --------------------------------------------------------------------------
   TESTLAUF — Regel gegen mehrere Fälle rechnen, ohne etwas zu aktivieren

   „Im November würden 7 von 24 Personen die Regel verletzen" (Plan 5.3).
   faelle: [{ id, kontext }]. Rein; Reihenfolge der Ausgabe = nach id.
   `gruen` ist nur wahr, wenn mindestens ein Fall erfüllt ist und weder
   verletzte noch offene Fälle vorliegen: offen ist nie grün.
   -------------------------------------------------------------------------- */
/** @param {any} regelOderId @param {Array<{id:string, kontext:any}>} faelle */
export function testlauf(regelOderId, faelle) {
  if (!Array.isArray(faelle)) throw new Error("Testlauf: Fälle fehlen.");
  const sortiert = [...faelle].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const zaehler = { erfuellt: 0, verletzt: 0, offen: 0, nicht_anwendbar: 0 };
  const ergebnisse = sortiert.map((f) => {
    const e = pruefeRegel(regelOderId, f.kontext || {});
    zaehler[e.status]++;
    return { id: f.id, status: e.status, text: e.text, regelId: e.regelId };
  });
  return {
    anzahl: sortiert.length, ...zaehler,
    verletzte: ergebnisse.filter((x) => x.status === "verletzt").map((x) => x.id),
    offene: ergebnisse.filter((x) => x.status === "offen").map((x) => x.id),
    gruen: zaehler.erfuellt > 0 && zaehler.verletzt === 0 && zaehler.offen === 0,
    ergebnisse,
  };
}

/**
 * Wertet eine Regel nach ihrer Regelart aus — alle acht Arten.
 * @param {object|string} regelOderId Eintrag aus dem Regelregister oder dessen Kennung
 * @param {object} kontext siehe die jeweilige Regelart
 */
export function pruefeRegel(regelOderId, kontext = {}) {
  const r = typeof regelOderId === "string" ? holeRegelLose(regelOderId) : regelOderId;
  if (!r) throw new Error(`Regelbaukasten: Regel „${regelOderId}" ist nicht im Register.`);
  if (r.pruefstatus === "legacy_verified" || r.laufzeit === "bestand") throw new Error(`Regelbaukasten: ${r.id} ist eine Bestandsregel; sie wird vom Bestandscode gerechnet.`);
  switch (r.typ) {
    case "zaehlregel": return zaehlregel(r, kontext);
    case "grenzregel": return grenzregel(r, kontext);
    case "besetzungsregel": return besetzungsregel(r, kontext);
    case "paarregel": return paarregel(r, kontext);
    case "musterregel": return musterregel(r, kontext);
    case "blockregel": return blockregel(r, kontext);
    case "verteilungsregel": return verteilungsregel(r, kontext);
    case "wunschregel": return wunschregel(r, kontext);
    default:
      throw new Error(`Regelbaukasten: Die Regelart „${r.typ}" wird hier noch nicht gerechnet (${r.id}).`);
  }
}

/* Kennung → Regel: der Server kennt nur die Branchenregeln (wie regelbaukasten.mjs). */
function holeRegelLose(id) {
  return REGELN_BRANCHEN.find((x) => x.id === id) || null;
}
