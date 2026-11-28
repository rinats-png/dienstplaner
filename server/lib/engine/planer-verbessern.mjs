/* ==========================================================================
   VERBESSERN-MODUS — ÄNDERUNGSLISTE MIT GRUND (WP-I9 PR-A, Block K, Engine-Stufe)

   Akzeptanz WP-I9 (INTELLIGENCE-ENTWICKLUNGSPLAN.md, Block K; Plan 7.4/7.6 in
   docs/intelligence/PLAN-WARNEN-VORGABEN-PLANVORSCHLAG.md): „Plan begutachten → Änderungsliste mit Grund;
   Übernahme als Entwurf; einzelne Änderungen; Entwurf wird nie veröffentlicht und überschreibt nichts;
   kein Schreibpfad ohne Mensch.“ Diese Stufe ist NUR die Begutachtung: reine Rechnung, keine Route, kein
   Schreiben, keine Oberfläche (Übernahme: PR-B; Oberfläche: PR-C; docs/acc45/WP-I9-nachweis.md).

   Ein Änderungstyp (erster Wurf): ERSETZEN. Eine bestehende Einteilung (Eintrag in `abweichungen`, nicht
   angeheftet, Tag NACH dem heutigen Betriebstag `opt.heute` — heute nie, er kann begonnen/gestempelt sein —,
   Monat nicht abgeschlossen) mit einem Befund der Planprüfung (pruefen) geht an eine andere Person: `von|Tag`
   hat den Dienst und wird „-“ (frei); `nach|Tag` (leer oder „-“, Person dienstfrei) bekommt den Dienst.

   PRÜFSTAND (Betreiberentscheidung zu Review #621): Ruhezeit grundsätzlich 11 h (§ 5 Abs. 1 ArbZG). Eine
   Einstellung `einstellungen.ruhezeit` unter 11 ist KEINE belegte Ausnahme (kein Datenmodell für Grundlage,
   Voraussetzungen, Ausgleich): Alle Prüfungen dieses Modus laufen auf einem Stand mit ruhezeit =
   max(11, Einstellung). Dadurch bekommt keine Ersatzperson und kein Dritter eine Ruhe unter 11 h; der Modus
   sieht dann auch Ruhezeiten unter 11 h als Konflikt, die die Planprüfung mit Einstellung < 11 nicht meldet.

   RECHTSSTUFE statt Schwere (A2): `stufeVon` bildet jede Befundart auf gesetz | muss | qualifikation ab:
   gesetz: Ruhezeit unter 11 h (Rechnung wie ruhezeitStufe, fachpruefung.mjs: Planprüfung des Stands mit
   ruhezeit = 11), Ersatzruhe (§ 11 Abs. 3), Sonntagsfrei verletzt (§ 11 Abs. 1; `schwere` ist hier der
   Wert `verletzt`), Abwesenheit, Sperre gesetzlich (`schwere` = verbindlichkeit().gesetzlich), Schutz,
   Nachweis, Einschränkung, Pause, unbekannte Arten (im Zweifel strenger); muss: Ruhezeit ab 11 h bis zur
   Einstellung, Folge, Nachtfolge, Sperre betrieblich, Sonntagsfrei knapp, Überlappung; qualifikation:
   Qualifikation, Fachkraftquote, vorbehaltene Aufgabe (am Dienst).

   Behalten wird eine Änderung nur, wenn ALLES gilt (fail closed):
   - Ersatzperson einsetzbar laut ersatzVorschlaege (`moeglich`; deren bewertete Reihenfolge — Stundenkonto,
     Einsprünge — wird NICHT benutzt: neutrale Reihenfolge Qualifikation, dann Kennung, Startwert rotiert);
   - nachpruefen (planer.mjs) für die neue Einteilung: dienstfrei, keine Befunde ab Achtung, Anheften,
     Vorwärtsprüfung, Planbefunde (Nachtfolge, § 11 ArbZG über alle betroffenen Monatsansichten);
   - Bestandspersonen des Tags unverändert (verdraengt);
   - entfernte Person: keine wirkende Vorgabe, die durch Entfernen verletzt werden kann (Zählregel
     „mindestens“, Block-, Musterregel; Muss ⇒ keine Änderung, Soll ⇒ Soll nicht bewertet) und keine neue
     Ersatzruhe-Lücke in einer Monatsansicht um den Tag (Entfernen kann die Zuordnung verschieben);
   - Umgebung (Tag ± R, ganze Woche, alle Personen): kein Befund neu oder in höherer Stufe (auch Tagesgrenze
     über 10 h: ohne belegte § 7-Regelung nicht bewertbar ⇒ nie neu); Ist-Daten nicht bewertbar ⇒ nein;
   - der Befund des Grunds an der Einteilung ist danach im SELBEN Prüfzeitraum (Monat ab morgen) weg;
   - keine der Stufen gesetz, qualifikation, besetzung, muss wird schlechter, und der Rangvektor ist STRIKT
     besser (verbessernRangVergleich; null beendet den Vergleich ohne Vorteil). Der Rang entscheidet sonst nur
     die Wahl zwischen Kandidaten; er ist keine eigene Schutzschicht.
   Nicht bewertet und immer ausgewiesen: `ausgleichszeitraum` (§ 3 ArbZG, Durchschnitt über 6 Monate/24 Wochen)
   und `wunsch`; dazu `soll`/`verteilung`, wenn unvollständig. Nicht bewertet zählt nie als Vorteil.

   Wechselwirkungen: feste Reihenfolge (Tag, Dienst, Person), jede Änderung auf dem Stand mit allen früheren;
   zum Schluss verbesserungAbgleich über die ganze Liste (fail closed, ergebnis_passt_nicht).

   Aufwand: Grenzen des Planers (1 Mio Personenprüfungen; Planbefunde 40 Mio Personentage; Vorgaben
   VORGABEN_WIRKUNG_GRENZE; nichts erhöht), Arbeit vorab angemeldet, Schlussprüfung reserviert; Rest
   `ungeprueft`; über 500 Konflikte `konflikteAbgeschnitten`.

   Datenschutz: Positivliste; Werte Zahlen, Wahrheitswerte, null, Kennungen (/^[A-Za-z0-9_.-]{1,64}$/),
   Wertelisten. Personenkennungen NUR in `vonPersonId`/`nachPersonId`. NUR für Leitung/Planung: `grund`
   (schutz, einschraenkung, sperre, nachweis, abwesend deuten auf besondere Kategorien) und die Zählwerte in
   `wirkung` sind in kleinen Einheiten personenbeziehbar — andere Sichten bekommen sie nicht (PR-B/PR-C).

   Rein: keine Uhr, kein Zufall, keine Ablage; Eingaben nie verändert; wirft nie ({ ok: false, grund }).
   Unabhängig vom Planer-Schalter (PLANER_AN bleibt AUS): Schalter, Pause, Rechte prüft die Verdrahtung.
   ========================================================================== */
import { dim_, pad, addDays, montag } from "../regelwerk.mjs";
import { monatAbgeschlossen } from "../monatsabschluss.mjs";
import { freigegebeneMonate } from "../planfreigabe.mjs";
import { neuesVorgabenBudget } from "../vorgabenwirkung.mjs";
import { VORGABEN_WIRKUNG_GRENZE, aktiveVorgaben } from "../vorgaben.mjs";
import { imDienst, einheitAm, RUHEZEIT_GESETZ } from "../fachpruefung.mjs";
import { besetzung, personTag } from "./plan.mjs";
import { pruefen, ersatzruheBefunde, sonntagsArbeit } from "./befunde.mjs";
import { ersatzVorschlaege, hindernisBefunde, verdraengt, planbefundAufwandHoechst, PLANBEFUND_GRENZE } from "./einsatz.mjs";
import { nachpruefen, PLANER_GRENZE, PLANER_STANDARD } from "./planer.mjs";
import { anheftungenLesen, anheftungSperrt } from "./anheften.mjs";
import { verteilungAufwand, verteilungVorbereiten, verteilungBewerten, nachtZaehlen, nachtAm } from "./verteilung.mjs";
import { mitTagesdatum } from "./zeit.mjs";

/** Änderungstypen (erster Wurf: nur Ersetzen). */
export const VERBESSERN_TYPEN = Object.freeze(["ersetzen"]);
/** Rangfolge des Vergleichs (kleinerer Index geht vor; Verteilung nur nachgelagert). */
export const VERBESSERN_RANGFOLGE = Object.freeze(["gesetz", "qualifikation", "besetzung", "muss", "soll", "verteilung"]);
/** Stufen, die nie schlechter werden dürfen (auch nicht für eine nachrangige Verbesserung). */
const NIE_SCHLECHTER = Object.freeze(["gesetz", "qualifikation", "besetzung", "muss"]);
/** Werteliste der Gründe: Befundarten der Planprüfung, die an einer Einteilung hängen (Gesetz zuerst). */
export const VERBESSERN_GRUENDE = Object.freeze(["abwesend", "sperre", "schutz", "nachweis", "einschraenkung", "ruhezeit", "sonntagsfrei", "ersatzruhe",
  "nachtfolge", "folge", "qualifikation", "fachkraft", "aufgabe"]);
/** Befundarten am Dienst (nicht an einer Person); Ref beginnt mit der Dienstkennung. */
const DIENST_ARTEN = Object.freeze(["qualifikation", "fachkraft", "aufgabe"]);
/** Arten, die eine Ersetzung nicht ändert bzw. die nie sperren (Regelsatz, Entgeltstatus, Angebot der Untersuchung, Urlaubsobergrenze);
    Unterbesetzung zählt über den Rang. Ist-Daten nicht bewertbar ist NICHT neutral (siehe oben). */
const NEUTRALE_ARTEN = Object.freeze(["regelsatz", "entgelt", "vorsorge", "urlaub", "besetzung"]);
/** Rechtsstufe je Befundart (A2). Ruhezeit, Sonntagsfrei und Sperre: eigene Regel in stufeVon. Unbekannte Arten: gesetz. */
const STUFE_ART = Object.freeze({ abwesend: "gesetz", schutz: "gesetz", nachweis: "gesetz", einschraenkung: "gesetz", ersatzruhe: "gesetz", pause: "gesetz",
  folge: "muss", nachtfolge: "muss", ueberlappung: "muss", tagesgrenze: "nichtBewertbar" });
const STUFE_ZAHL = Object.freeze({ nichtBewertbar: 1, muss: 1, qualifikation: 2, gesetz: 2 });
/** Was nicht bewertet ist (nie „erfüllt“, nie ein Vorteil); `ausgleichszeitraum` und `wunsch` stehen immer im Ergebnis. */
export const VERBESSERN_NICHT_BEWERTET = Object.freeze(["soll", "verteilung", "ausgleichszeitraum", "wunsch"]);
/** Regelarten, deren Muss eine ENTFERNTE Einteilung verletzen kann (Zählregel nur mit „mindestens“). */
const ENTFERNEN_REGELARTEN = Object.freeze(["blockregel", "musterregel"]);
/**
 * Obergrenzen: Personentage des Monats, Stellen (Tag × Dienst), Konflikte, Änderungen, Versuche je Konflikt, Halbweite der Umgebung;
 * Aufwand und Planbefunde = Obergrenzen des Planers (unverändert: 1 Mio Personenprüfungen, 40 Mio Personentage).
 */
export const VERBESSERN_GRENZE = Object.freeze({ personenTage: 200000, stellen: 20000, konflikte: 500, aenderungen: 500, versuche: 3, umgebungTage: 31,
  aufwand: PLANER_GRENZE.aufwand, planbefund: PLANBEFUND_GRENZE });
/** Arbeit einer Planprüfung je Person über die Tage hinaus (Lauf 10 Tage davor, 2 danach; Ersatzruhe je Kalendermonat ± 56 Tage). */
const PRUEF_ZUSCHLAG = 12 + 2 * (31 + 2 * 56);
/** Ersatzruhe: Reichweite, in der ein Tag eine Monatsansicht berühren kann (wie einsatz.mjs: Rand 56 + Feiertagsfrist 55). */
const ERSATZ_REICHWEITE = 56 + 55;

/** Positivliste der Schlüssel des Ergebnisses. */
export const VERBESSERN_SCHLUESSEL = Object.freeze({
  ergebnis: Object.freeze(["ok", "ym", "startwert", "monatFreigegeben", "aenderungen", "konflikte", "konflikteAbgeschnitten", "unveraendert", "mitgeloest",
    "ungeprueft", "angeheftet", "nichtBewertet", "aufwand"]),
  aenderung: Object.freeze(["typ", "datum", "dienstId", "vonPersonId", "nachPersonId", "grund", "wirkung"]),
  wirkung: Object.freeze(["vorher", "nachher"]),
  aufwand: Object.freeze(["grenze", "verbraucht", "ausgeschoepft", "planbefund"]),
  planbefund: Object.freeze(["grenze", "verbraucht", "ausgeschoepft"]),
});
const ZAEHLER = Object.freeze(["konflikte", "konflikteAbgeschnitten", "unveraendert", "mitgeloest", "ungeprueft", "angeheftet"]);

const KENNUNG = /^[A-Za-z0-9_.-]{1,64}$/;
const istKennung = (x) => typeof x === "string" && KENNUNG.test(x);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const MONAT = /^\d{4}-\d{2}$/;
const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const ganz = (x, min, max) => typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const zahlOderNull = (x) => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0);
/** @param {string} grund @returns {{ ok: false, grund: string }} */
const nein = (grund) => ({ ok: false, grund });
const passtNicht = (pruefung) => ({ ok: false, grund: "ergebnis_passt_nicht", pruefung });
const monatOk = (ym) => typeof ym === "string" && MONAT.test(ym) && Number(ym.slice(5, 7)) >= 1 && Number(ym.slice(5, 7)) <= 12
  && Number(ym.slice(0, 4)) >= 2000 && Number(ym.slice(0, 4)) <= 2100;
const tagOk = (d) => typeof d === "string" && TAG.test(d) && monatOk(d.slice(0, 7)) && Number(d.slice(8, 10)) >= 1
  && Number(d.slice(8, 10)) <= dim_(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1);

/** Betrieb mit den Feldern, die Planprüfung, Besetzung und Ersatzsuche lesen; keine gefilterte Sicht (kein Betriebsstand). */
const betriebOk = (m) => istObjekt(m) && Array.isArray(m.personen) && Array.isArray(m.dienstarten) && Array.isArray(m.abwesenheiten)
  && istObjekt(m.einstellungen) && istObjekt(m.abweichungen) && Array.isArray(m.qualifikationen) && Array.isArray(m.einheiten)
  && !hat(m, "sichtEntwuerfe") && !hat(m, "sichtIstDaten")
  && m.personen.every((p) => istObjekt(p) && p.id !== undefined && p.id !== null && Array.isArray(p.qualifikationen))
  && m.dienstarten.every((d) => istObjekt(d) && d.id !== undefined && d.id !== null);

/**
 * Vergleicht zwei Rangvektoren streng in VERBESSERN_RANGFOLGE: < 0, wenn a besser ist. Eine nicht bewertete Stufe (null) auf einer
 * Seite beendet den Vergleich ohne Entscheidung (0): sie macht nichts besser, und was hinter ihr läge, zählt nicht.
 * @param {Record<string, number | null>} a @param {Record<string, number | null>} b
 */
export function verbessernRangVergleich(a, b) {
  for (const k of VERBESSERN_RANGFOLGE) {
    const x = a[k], y = b[k];
    if (x === null || y === null || x === undefined || y === undefined) return 0;
    if (x !== y) return x - y;
  }
  return 0;
}
/** Behalten-Regel: keine verbindliche Stufe schlechter UND strikt besser. */
const besserOhneVerschlechterung = (nachher, vorher) => NIE_SCHLECHTER.every((k) => typeof nachher[k] === "number" && typeof vorher[k] === "number" && nachher[k] <= vorher[k])
  && verbessernRangVergleich(nachher, vorher) < 0;

/* ---------- Prüfstand: Ruhezeit mindestens 11 h ---------- */
const ruheStreng = (e) => Math.max(RUHEZEIT_GESETZ, Number(e && e.ruhezeit) || RUHEZEIT_GESETZ);
/** Prüfstand des Bestands: ruhezeit = max(11, Einstellung); sonst unverändert (eigenes Objekt). */
const pruefstand = (m) => ({ ...m, einstellungen: { ...m.einstellungen, ruhezeit: ruheStreng(m.einstellungen) } });
const gesetzStaende = new WeakMap();
/** Derselbe Stand mit ruhezeit = 11 (Grenze des Gesetzes), um Ruhezeitbefunde unter 11 h zu erkennen; ist die Einstellung 11, derselbe. */
function gesetzStand(x) {
  if (x.einstellungen.ruhezeit === RUHEZEIT_GESETZ) return x;
  let g = gesetzStaende.get(x);
  if (!g) { g = { ...x, einstellungen: { ...x.einstellungen, ruhezeit: RUHEZEIT_GESETZ } }; gesetzStaende.set(x, g); }
  return g;
}

/** Rechtsstufe eines Befunds (A2): "gesetz" | "muss" | "qualifikation" | "nichtBewertbar" | null (neutral oder nur Hinweis). */
function stufeVon(b, gesetzRuhe) {
  if (!b || NEUTRALE_ARTEN.includes(b.art) || b.art === "istdaten") return null;
  if (DIENST_ARTEN.includes(b.art)) return b.schwere === "danger" || b.schwere === "warn" ? "qualifikation" : null;
  if (b.art === "tagesgrenze") return "nichtBewertbar";
  if (b.schwere !== "danger" && b.schwere !== "warn") return null;
  if (b.art === "ruhezeit") return gesetzRuhe.has(String(b.id)) ? "gesetz" : "muss";
  if (b.art === "sonntagsfrei" || b.art === "sperre") return b.schwere === "danger" ? "gesetz" : "muss";
  return hat(STUFE_ART, b.art) ? STUFE_ART[b.art] : "gesetz";
}
/** Befunde eines Stands über [a, b] mit Rechtsstufe; dazu, ob Ist-Daten nicht bewertbar sind. */
function befundeMitStufe(x, a, b) {
  const liste = pruefen(x, a, b);
  const g = gesetzStand(x);
  const gesetzRuhe = new Set((g === x ? liste : pruefen(g, a, b)).filter((y) => y.art === "ruhezeit").map((y) => String(y.id)));
  const out = [];
  let istOffen = false;
  for (const y of liste) {
    if (y.art === "istdaten") { istOffen = true; continue; }
    const s = stufeVon(y, gesetzRuhe);
    if (s) out.push({ b: y, s });
  }
  return { liste: out, istOffen };
}
/** Vereinigt zwei Befundlisten (Umgebung und Prüfzeitraum) ohne Dubletten nach Kennung (B3: Kennungen hängen am Zeitraum). */
function vereint(x, y) {
  const k = new Map();
  for (const e of [...x.liste, ...y.liste]) { const id = String(e.b.id); if (!k.has(id) || STUFE_ZAHL[e.s] > STUFE_ZAHL[k.get(id).s]) k.set(id, e); }
  return { liste: [...k.values()], istOffen: x.istOffen || y.istOffen };
}
/** Karte Kennung → Stufenzahl. */
const befundKarte = (bs) => { const k = new Map(); for (const { b, s } of bs.liste) k.set(String(b.id), Math.max(k.get(String(b.id)) || 0, STUFE_ZAHL[s])); return k; };
/** Gibt es in `nachher` einen Befund, den es in `vorher` nicht oder nur in niedrigerer Stufe gab? */
const neuerBefund = (vorher, nachher) => { for (const [id, s] of nachher) if (!vorher.has(id) || vorher.get(id) < s) return true; return false; };
const amDienst = (b) => DIENST_ARTEN.includes(b.art);
/** Passt ein Befund zur Einteilung (Person am Tag bzw. ihr Dienst am Tag)? */
const passtZu = (b, pid, d, daId) => b.datum === d && (amDienst(b) ? String(b.ref) === String(daId) || String(b.ref).startsWith(`${daId}|`) : b.personId === pid);
/** Kennungen der Befunde des Grunds an der Einteilung im Prüfzeitraum [von, bis] (B3: derselbe Zeitraum wie die Auslösung). */
const ausloeserIds = (x, von, bis, grund, pid, d, daId) => [...new Set(befundeMitStufe(x, von, bis).liste
  .filter(({ b }) => b.art === grund && passtZu(b, pid, d, daId)).map(({ b }) => String(b.id)))];

/** Umgebung einer Änderung am Tag d: d ± R (R aus maxFolge, maxNachtFolge, mindestens 7, höchstens umgebungTage), dazu die ganze Kalenderwoche. */
function umgebung(m, d) {
  const e = m.einstellungen || {};
  const r = Math.min(VERBESSERN_GRENZE.umgebungTage, Math.max(7, (ganz(e.maxFolge, 0, 1000) ? e.maxFolge : 0) + 1, (ganz(e.maxNachtFolge, 0, 1000) ? e.maxNachtFolge : 0) + 1));
  const mo = montag(d);
  const a = addDays(d, -r) < mo ? addDays(d, -r) : mo;
  const b = addDays(d, r) > addDays(mo, 6) ? addDays(d, r) : addDays(mo, 6);
  return { a, b, r };
}
const tageZwischen = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1;

/** Rangvektor eines Stands über die Umgebung [a, b] mit den Vorgabenbefunden der betroffenen Einteilung (`vb`) und der Verteilung. */
function rangUmgebung(stand, bs, a, b, vb, vtSumme) {
  let gesetz = 0, qualifikation = 0, muss = 0, luecke = 0;
  for (const { s } of bs.liste) { if (s === "gesetz") gesetz++; else if (s === "qualifikation") qualifikation++; else if (s === "muss") muss++; }
  for (let t = a; t <= b; t = addDays(t, 1)) for (const e of Object.values(besetzung(stand, t))) luecke += Math.max(0, -e.diff);
  return { gesetz, qualifikation, besetzung: luecke, muss: muss + vb.muss + vb.offen, soll: vb.offen || vb.sollOffen ? null : vb.soll, verteilung: vtSumme };
}
/** Vorgabenbefunde einer Einsatzprüfung: Muss, Soll, ungeprüft. */
const vorgabenZaehlen = (bef) => ({ muss: bef.filter((x) => x.regel === "vorgabeMuss").length, soll: bef.filter((x) => x.regel === "vorgabeSoll").length,
  offen: bef.filter((x) => x.regel === "vorgabeOffen").length });

/**
 * Vorgaben, die das ENTFERNEN einer Einteilung der Person p am Tag d verletzen können (A1; vorgabenwirkung meldet nur, was eine Einteilung
 * herbeiführt): Zählregel „mindestens“, Block- und Musterregel. Übergangsweise fail closed: Fenster und Geltung werden nur ausgeschlossen,
 * wenn sie d bzw. p sicher nicht treffen (gültig ab/bis, Ausnahmen, Geltung Personen/Einheit); sonst gilt die Vorgabe als wirkend.
 * @returns {{ muss: boolean, soll: boolean }}
 */
function entfernenVorgaben(m, p, d) {
  let muss = false, soll = false;
  for (const v of aktiveVorgaben(m.vorgaben)) {
    const par = istObjekt(v.parameter) ? v.parameter : {};
    if (!(ENTFERNEN_REGELARTEN.includes(v.regelart) || (v.regelart === "zaehlregel" && par.richtung === "mindestens"))) continue;
    if ((typeof v.gueltigAb === "string" && d < v.gueltigAb) || (typeof v.gueltigBis === "string" && d > v.gueltigBis)) continue;
    const aus = istObjekt(v.ausnahmen) ? v.ausnahmen : {};
    if (Array.isArray(aus.personen) && aus.personen.map(String).includes(String(p.id))) continue;
    const g = istObjekt(v.geltung) ? v.geltung : {};
    if (g.art === "personen" && Array.isArray(g.personen) && !g.personen.map(String).includes(String(p.id))) continue;
    if (g.art === "einheit" && Array.isArray(g.einheiten) && !g.einheiten.map(String).includes(String(einheitAm(p, d)))) continue;
    if (v.staerke === "muss") muss = true; else if (v.staerke === "soll") soll = true;
  }
  return { muss, soll };
}

/** Monatsansichten, deren Ersatzruhe-Rechnung den Tag d lesen kann (wie einsatz.mjs: d ± 111 Tage). */
function monateUm(d) {
  const l = [];
  let f = `${addDays(d, -ERSATZ_REICHWEITE).slice(0, 7)}-01`;
  const ende = addDays(d, ERSATZ_REICHWEITE);
  while (f <= ende) { const [y, mo] = f.split("-").map(Number); const bis = `${f.slice(0, 7)}-${pad(dim_(y, mo - 1))}`; l.push([f, bis]); f = addDays(bis, 1); }
  return l;
}
/** B6: Entfernen der Einteilung von p darf in keiner Monatsansicht um d eine Ersatzruhe-Lücke erzeugen (Zuordnung verschiebt sich). */
function ersatzruheEntfernenOk(vorher, nachher, p, d) {
  const aV = sonntagsArbeit(vorher, p), aN = sonntagsArbeit(nachher, p);
  for (const [f, l] of monateUm(d)) {
    const alt = new Set(ersatzruheBefunde(vorher, p, f, l, aV).map((b) => b.datum));
    if (ersatzruheBefunde(nachher, p, f, l, aN).some((b) => !alt.has(b.datum))) return false;
  }
  return true;
}

/** Eingaben prüfen; null = gültig, sonst Kennung des Grunds. */
function eingabeFehler(m, ym, o) {
  if (!betriebOk(m)) return "betrieb_ungueltig";
  if (!monatOk(ym)) return "monat_ungueltig";
  if (!tagOk(o.heute)) return "heute_ungueltig";
  if (o.startwert !== undefined && !ganz(o.startwert, 0, 4294967295)) return "startwert_ungueltig";
  if (o.aufwand !== undefined && !ganz(o.aufwand, 0, VERBESSERN_GRENZE.aufwand)) return "aufwand_ungueltig";
  if (o.planbefundAufwand !== undefined && !ganz(o.planbefundAufwand, 0, VERBESSERN_GRENZE.planbefund)) return "aufwand_ungueltig";
  if (o.vorgabenAufwand !== undefined && !ganz(o.vorgabenAufwand, 0, VORGABEN_WIRKUNG_GRENZE.aufwand)) return "aufwand_ungueltig";
  return null;
}

/** Kosten der Schlussprüfung für n Änderungen: zwei Planprüfungen (je mit Gesetzesstand) der vereinigten Umgebung und des Prüfzeitraums,
    je Änderung Nachprüfung (P + 1 + 2 W, Bestandspersonen 2 P) und Besetzung des Tags. */
const schlussKosten = (P, L, W, n) => 8 * P * (L + PRUEF_ZUSCHLAG) + n * (4 * P + 1 + 2 * W);
/** Kosten je Planprüfung einer Umgebung mit L Tagen (mit Gesetzesstand: doppelt). */
const pruefKosten = (P, L) => 2 * P * (L + PRUEF_ZUSCHLAG);

/** Erster Tag des Monats NACH heute (heute selbst nie: Dienst kann begonnen/gestempelt sein); null, wenn keiner. */
const ersterTag = (tage, heute) => tage.find((d) => d > heute) || null;

/**
 * Begutachtet den Plan eines Monats und schlägt Ersetzungen mit Grund vor (Engine-Stufe). Rein, deterministisch, wirft nie.
 * Ergebnis nur für Leitung/Planung (Personenkennungen, personenbeziehbare Zählwerte und Gründe).
 * @param {any} m Betrieb (Bestand) @param {string} ym Monat JJJJ-MM
 * @param {{ heute: string, startwert?: number, aufwand?: number, planbefundAufwand?: number, vorgabenAufwand?: number }} opt
 *   `heute`: heutiger Betriebstag JJJJ-MM-TT (heute und Tage davor werden nie geändert)
 * @returns {{ ok: false, grund: string, pruefung?: string } | { ok: true, ym: string, startwert: number, monatFreigegeben: boolean,
 *   aenderungen: any[], konflikte: number, konflikteAbgeschnitten: number, unveraendert: number, mitgeloest: number, ungeprueft: number,
 *   angeheftet: number, nichtBewertet: string[], aufwand: any }}
 */
export function planVerbessern(m, ym, opt) {
  try {
    const o = istObjekt(opt) ? opt : {};
    const f = eingabeFehler(m, ym, o);
    if (f) return nein(f);
    const anh = anheftungenLesen(m);
    if (!anh.ok) return nein("anheftungen_unlesbar");
    if (monatAbgeschlossen(m, ym)) return nein("monat_abgeschlossen");
    return mitTagesdatum(o.heute, () => verbessernRechnen(m, ym, o, anh));
  } catch {
    return nein("fehler");
  }
}

/** Neutrale Reihenfolge der Ersatzpersonen (B7): mehr Qualifikationen des Dienstes zuerst, dann Kennung; innerhalb gleicher Zahl um den
    Startwert rotiert (deterministisch, ohne Stundenkonto, Einsprünge, Nächte, Teilzeit, Springer). */
function neutralOrdnen(liste, da, startwert) {
  const quals = Object.keys(istObjekt(da.mindestQual) ? da.mindestQual : {});
  const zahl = (p) => quals.filter((q) => (p.qualifikationen || []).includes(q)).length;
  const gruppen = new Map();
  for (const p of liste) { const z = zahl(p); if (!gruppen.has(z)) gruppen.set(z, []); gruppen.get(z).push(p); }
  const out = [];
  for (const z of [...gruppen.keys()].sort((a, b) => b - a)) {
    const g = gruppen.get(z).sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    const s = startwert % g.length;
    out.push(...g.slice(s), ...g.slice(0, s));
  }
  return out;
}

/** @param {any} m @param {string} ym @param {any} o @param {any} anh @returns {any} */
function verbessernRechnen(m, ym, o, anh) {
  const j = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7));
  const nTage = dim_(j, mo - 1);
  const P = Math.max(1, m.personen.length);
  if (P * nTage > VERBESSERN_GRENZE.personenTage || m.dienstarten.length * nTage > VERBESSERN_GRENZE.stellen) return nein("aufwand");
  const startwert = o.startwert === undefined ? PLANER_STANDARD.startwert : o.startwert;
  const grenze = o.aufwand === undefined ? PLANER_STANDARD.aufwand : o.aufwand;
  const pbGrenze = o.planbefundAufwand === undefined ? PLANBEFUND_GRENZE : o.planbefundAufwand;
  const vorgabenAufwand = o.vorgabenAufwand === undefined ? VORGABEN_WIRKUNG_GRENZE.aufwand : o.vorgabenAufwand;
  const tage = []; for (let t = 1; t <= nTage; t++) tage.push(`${ym}-${pad(t)}`);
  const von = ersterTag(tage, o.heute), bis = tage[nTage - 1];
  const freigegeben = freigegebeneMonate(m).has(ym);

  const mf = Number(m.einstellungen.maxFolge);
  const W = mf > 0 ? Math.ceil(mf) : 0;
  const { r: R } = umgebung(m, `${ym}-01`);
  const Lmax = nTage + 2 * (R + 7);
  const A = { rest: grenze, ausgeschoepft: false };
  const leisten = (k, n) => { if (A.rest - k < schlussKosten(P, Lmax, W, n)) { A.ausgeschoepft = true; return false; } A.rest -= k; return true; };
  const pbHoechst = planbefundAufwandHoechst(m, j);
  const PB = { rest: pbGrenze, ausgeschoepft: false };
  const pbLeisten = (k, n) => { if (PB.rest - k < 2 * n * pbHoechst) { PB.ausgeschoepft = true; return false; } PB.rest -= k; return true; };
  const aufwandAus = () => ({ grenze, verbraucht: grenze - A.rest, ausgeschoepft: A.ausgeschoepft || PB.ausgeschoepft,
    planbefund: { grenze: pbGrenze, verbraucht: pbGrenze - PB.rest, ausgeschoepft: PB.ausgeschoepft } });
  if (!von) return { ok: true, ym, startwert, monatFreigegeben: freigegeben, aenderungen: [], konflikte: 0, konflikteAbgeschnitten: 0, unveraendert: 0, mitgeloest: 0,
    ungeprueft: 0, angeheftet: 0, nichtBewertet: ["ausgleichszeitraum", "wunsch"], aufwand: aufwandAus() };

  const nPruef = tageZwischen(von, bis);
  if (!leisten(pruefKosten(P, nPruef), 0)) return { ...nein("aufwand"), aufwand: aufwandAus() };
  const dIndex = new Map(m.dienstarten.map((d, i) => [d.id, i]));
  const dienstVon = new Map(m.dienstarten.map((d) => [d.id, d]));
  const personVon = new Map(m.personen.map((p) => [p.id, p]));
  const basis = m.abweichungen;
  const S0 = { ...pruefstand(m), abweichungen: { ...basis } };
  const kandidaten = new Map();         // Schlüssel → { p, d, da, grund, rangGrund }
  const grundRang = (s, art) => (s === "gesetz" || s === "qualifikation" ? 0 : 1) * VERBESSERN_GRUENDE.length + VERBESSERN_GRUENDE.indexOf(art);
  const vormerken = (p, d, b, s) => {
    const k = `${p.id}|${d}`;
    const w = basis[k];
    const da = dienstVon.get(w);
    if (!da || w === "-") return;
    const t = personTag(S0, p, d);
    /* Einteilung aus `abweichungen` (nicht Schichtfolge, nicht Posten-Ersatz); abwesend: Eintrag steht, zählt aber nicht. */
    if (t.quelle !== "abweichung" || !(t.dienstId === w || (t.abwesenheit && t.dienstId === null))) return;
    const g = grundRang(s, b.art);
    const alt = kandidaten.get(k);
    if (!alt || g < alt.rangGrund) kandidaten.set(k, { p, d, da, grund: b.art, rangGrund: g });
  };
  for (const { b, s } of befundeMitStufe(S0, von, bis).liste) {
    if (s === "nichtBewertbar" || !VERBESSERN_GRUENDE.includes(b.art) || typeof b.datum !== "string" || b.datum < von || b.datum > bis) continue;
    if (amDienst(b)) {
      const daId = String(b.ref).split("|")[0];
      const da = m.dienstarten.find((x) => String(x.id) === daId);
      if (!da) continue;
      for (const p of besetzung(S0, b.datum)[da.id].personen) vormerken(p, b.datum, b, s);
    } else {
      const p = personVon.get(b.personId);
      if (p && imDienst(p, b.datum)) vormerken(p, b.datum, b, s);
    }
  }
  const alleK = [...kandidaten.values()].sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0) || dIndex.get(x.da.id) - dIndex.get(y.da.id)
    || (String(x.p.id) < String(y.p.id) ? -1 : String(x.p.id) > String(y.p.id) ? 1 : 0));
  const liste = alleK.slice(0, VERBESSERN_GRENZE.konflikte);
  const konflikteAbgeschnitten = alleK.length - liste.length;

  /* Ersatzsuche nur für `moeglich` (Einsatzprüfung); Kontext OHNE Stundenkonten, Einsprünge, Nächte (B7). */
  const ctx = { konten: new Map(), einspruenge: {}, nachtAnzahl: new Map(), median: 0, mittelEinspruenge: 0, nachtMittel: 0,
    vorgabenBudget: neuesVorgabenBudget(vorgabenAufwand), vorgabenAutomatisch: true };
  const pruefOpt = { vorgabenBudget: ctx.vorgabenBudget, vorgabenAutomatisch: true };
  const nachBudget = neuesVorgabenBudget(vorgabenAufwand);
  const vAufwand = verteilungAufwand(m, tage);
  const vt = vAufwand && leisten(vAufwand, 0) ? verteilungVorbereiten(m, tage, true) : null;
  const zaehlStand = new WeakMap();
  const vtSumme = (stand, vorStand, d) => {
    if (!vt) return null;
    let z = zaehlStand.get(stand);
    if (!z) {
      const zv = vorStand ? zaehlStand.get(vorStand) : null;
      if (zv) { z = new Map(zv); nachtAm(vorStand, vt, d, z, -1); nachtAm(stand, vt, d, z, 1); } else z = nachtZaehlen(stand, vt);
      zaehlStand.set(stand, z);
    }
    const e = verteilungBewerten(vt, z);
    return e.bewertet ? e.summe : null;
  };

  let S = S0;
  if (vt) zaehlStand.set(S, nachtZaehlen(S, vt));
  const benutzt = new Set();
  const aenderungen = [];
  let unveraendert = 0, mitgeloest = 0, ungeprueft = 0, angeheftet = 0, nichtBewertetSoll = false, nichtBewertetVt = !vt;
  const vorgabenLeer = () => ctx.vorgabenBudget.ausgeschoepft || nachBudget.ausgeschoepft;
  for (let i = 0; i < liste.length; i++) {
    const K = liste[i];
    const p = K.p, d = K.d, da = K.da, kp = `${p.id}|${d}`;
    if (anheftungSperrt(anh, p.id, d)) { angeheftet++; unveraendert++; continue; }
    if (!istKennung(p.id) || !istKennung(da.id) || benutzt.has(kp) || S.abweichungen[kp] !== da.id) { unveraendert++; continue; }
    /* A1: wirkende Muss-Vorgabe, die das Entfernen verletzen kann ⇒ keine Änderung; Soll ⇒ Soll nicht bewertet. */
    const ev = entfernenVorgaben(m, p, d);
    if (ev.muss) { unveraendert++; continue; }
    const { a, b } = umgebung(m, d);
    const L = tageZwischen(a, b);
    /* Vorher: Auslöser im Prüfzeitraum, Umgebung, Einsatzprüfung der bestehenden Einteilung, Ersatzsuche, Ersatzruhe von p (B6). */
    if (!leisten(pruefKosten(P, nPruef) + pruefKosten(P, L) + P * L + 3 * P + 1, aenderungen.length) || !pbLeisten(pbHoechst, aenderungen.length)) { ungeprueft = liste.length - i; break; }
    const ausloeser = ausloeserIds(S, von, bis, K.grund, p.id, d, da.id);
    /* B3: nicht auffindbar ohne frühere Änderung ⇒ unveraendert (nie mitgelöst); mit früherer Änderung im selben Zeitraum weg ⇒ mitgelöst. */
    if (!ausloeser.length) { if (aenderungen.length) mitgeloest++; else unveraendert++; continue; }
    const vorBs = vereint(befundeMitStufe(S, a, b), befundeMitStufe(S, von, bis));
    const vorKarte = befundKarte(vorBs);
    const ohne = { ...S, abweichungen: { ...S.abweichungen, [kp]: "-" } };
    if (!ersatzruheEntfernenOk(S, ohne, p, d)) { unveraendert++; continue; }
    const vbP = { ...vorgabenZaehlen(hindernisBefunde(ohne, p, d, da, pruefOpt)), sollOffen: ev.soll };
    const vorher = rangUmgebung(S, vorBs, a, b, vbP, vtSumme(S, null, d));
    const kand = neutralOrdnen(ersatzVorschlaege(ohne, d, da.id, ctx).filter((x) => x.moeglich && x.person.id !== p.id && istKennung(x.person.id)
      && !benutzt.has(`${x.person.id}|${d}`) && !anheftungSperrt(anh, x.person.id, d)
      && (!hat(S.abweichungen, `${x.person.id}|${d}`) || S.abweichungen[`${x.person.id}|${d}`] === "-")).map((x) => x.person), da, startwert);
    let beste = null, versuche = 0, abbruch = false;
    for (const q of kand) {
      if (versuche >= VERBESSERN_GRENZE.versuche) break;
      versuche++;
      const kq = `${q.id}|${d}`;
      if (!leisten(pruefKosten(P, nPruef) + pruefKosten(P, L) + P * L + 3 * P + 1 + 2 * W, aenderungen.length) || !pbLeisten(pbHoechst, aenderungen.length)) { abbruch = true; break; }
      const S1 = { ...ohne, abweichungen: { ...ohne.abweichungen, [kq]: da.id } };
      const np = nachpruefen(ohne, S1, [{ personId: q.id, datum: d, dienstId: da.id }], nachBudget);
      if (!np.durch) continue;
      if (verdraengt(S, S1, d, new Set([kp, kq]))) continue;
      const nachMon = befundeMitStufe(S1, von, bis);
      const nachBs = vereint(befundeMitStufe(S1, a, b), nachMon);
      if (nachBs.istOffen) continue;                                             // Ist-Daten nicht bewertbar: nichts behaupten
      if (neuerBefund(vorKarte, befundKarte(nachBs))) continue;
      const nachAus = new Set(nachMon.liste.map(({ b: x }) => String(x.id)));
      if (ausloeser.every((id) => nachAus.has(id))) continue;                   // mindestens ein Befund des Grunds im Prüfzeitraum weg
      const nachher = rangUmgebung(S1, nachBs, a, b, { muss: np.muss, soll: np.soll, offen: np.offenV, sollOffen: ev.soll }, vtSumme(S1, S, d));
      if (vorher.soll === null || nachher.soll === null) nichtBewertetSoll = true;
      if (vorher.verteilung === null || nachher.verteilung === null) nichtBewertetVt = true;
      if (!besserOhneVerschlechterung(nachher, vorher)) continue;
      /* Wahl zwischen Kandidaten: bester Rang; Gleichstand: der erste der neutralen Reihenfolge. */
      if (!beste || verbessernRangVergleich(nachher, beste.nachher) < 0) beste = { q, S1, nachher };
    }
    if (!beste) {
      if (abbruch || vorgabenLeer()) { A.ausgeschoepft = true; ungeprueft = liste.length - i; break; }
      unveraendert++; continue;
    }
    S = beste.S1;
    benutzt.add(kp); benutzt.add(`${beste.q.id}|${d}`);
    aenderungen.push({ typ: "ersetzen", datum: d, dienstId: da.id, vonPersonId: p.id, nachPersonId: beste.q.id, grund: K.grund,
      wirkung: { vorher: { ...vorher }, nachher: { ...beste.nachher } } });
    if (abbruch || vorgabenLeer()) { A.ausgeschoepft = true; ungeprueft = liste.length - i - 1; break; }
  }
  const nichtBewertet = [...(nichtBewertetSoll ? ["soll"] : []), ...(nichtBewertetVt ? ["verteilung"] : []), "ausgleichszeitraum", "wunsch"];
  A.rest -= schlussKosten(P, Lmax, W, aenderungen.length);
  PB.rest -= 2 * aenderungen.length * pbHoechst;
  const ergebnis = { ok: true, ym, startwert, monatFreigegeben: freigegeben, aenderungen, konflikte: alleK.length, konflikteAbgeschnitten, unveraendert, mitgeloest,
    ungeprueft, angeheftet, nichtBewertet, aufwand: aufwandAus() };
  /* Gemeinsame Schlussprüfung (reserviert): passt die Liste nicht zum Bestand, gibt es keine (fail closed). */
  const g = abgleichRechnen(m, ym, ergebnis, o.heute, anh, vorgabenAufwand);
  if (!g.ok) return g;
  return ergebnis;
}

/**
 * Gleicht eine Änderungsliste gegen den Bestand ab (fail closed; Schlussprüfung hier und spätere Übernahme, PR-B). Form: genaue
 * Positivliste (Schlüssel und Typen, auch `startwert`, `aufwand`, `nichtBewertet` ohne Dubletten), Kennungen, Wertelisten, Zahlen.
 * Bestand: je Änderung genau ein vorhandener Schlüssel `von|Tag` mit dem behaupteten Dienst; `nach|Tag` leer oder „-“ und die Person
 * dienstfrei; keine Dubletten; Personen und Dienste bekannt; nichts angeheftet; Tag nach `heute`; Monat nicht abgeschlossen; keine
 * Vorgabe, die das Entfernen verletzen kann (Muss); keine neue Ersatzruhe-Lücke der entfernten Person. Gemeinsam (Prüfstand 11 h):
 * Bestandspersonen jedes Tags unverändert, jede neue Einteilung besteht nachpruefen, in der vereinigten Umgebung kein neuer oder
 * höher eingestufter Befund und Ist-Daten bewertbar, je Änderung im Prüfzeitraum mindestens ein Befund des Grunds weg. Behauptete
 * Wirkung: keine verbindliche Stufe schlechter, strikt besser (der Rang selbst wird nicht nachgerechnet, nur seine Form).
 * @param {any} m @param {string} ym @param {any} ergebnis @param {{ heute: string, vorgabenAufwand?: number }} opt
 * @returns {{ ok: true } | { ok: false, grund: string, pruefung?: string }}
 */
export function verbesserungAbgleich(m, ym, ergebnis, opt) {
  try {
    const o = istObjekt(opt) ? opt : {};
    const f = eingabeFehler(m, ym, o);
    if (f) return nein(f);
    const anh = anheftungenLesen(m);
    if (!anh.ok) return nein("anheftungen_unlesbar");
    if (monatAbgeschlossen(m, ym)) return nein("monat_abgeschlossen");
    const vorgabenAufwand = o.vorgabenAufwand === undefined ? VORGABEN_WIRKUNG_GRENZE.aufwand : o.vorgabenAufwand;
    return mitTagesdatum(o.heute, () => abgleichRechnen(m, ym, ergebnis, o.heute, anh, vorgabenAufwand));
  } catch {
    return nein("fehler");
  }
}

/** Form eines Rangvektors: genau die Schlüssel der Rangfolge, Zahlen ≥ 0 oder null. */
const rangForm = (r) => istObjekt(r) && Object.keys(r).length === VERBESSERN_RANGFOLGE.length && VERBESSERN_RANGFOLGE.every((k) => hat(r, k) && zahlOderNull(r[k]));
const genauSchluessel = (x, erlaubt) => istObjekt(x) && Object.keys(x).length === erlaubt.length && erlaubt.every((k) => hat(x, k));
const aufwandForm = (a) => genauSchluessel(a, VERBESSERN_SCHLUESSEL.aufwand) && ganz(a.grenze, 0, VERBESSERN_GRENZE.aufwand) && ganz(a.verbraucht, 0, a.grenze)
  && typeof a.ausgeschoepft === "boolean" && genauSchluessel(a.planbefund, VERBESSERN_SCHLUESSEL.planbefund)
  && ganz(a.planbefund.grenze, 0, VERBESSERN_GRENZE.planbefund) && ganz(a.planbefund.verbraucht, 0, a.planbefund.grenze) && typeof a.planbefund.ausgeschoepft === "boolean";

/** @param {any} m @param {string} ym @param {any} e @param {string} heute @param {any} anh @param {number} vorgabenAufwand @returns {any} */
function abgleichRechnen(m, ym, e, heute, anh, vorgabenAufwand) {
  const S_ = VERBESSERN_SCHLUESSEL;
  if (!genauSchluessel(e, S_.ergebnis) || e.ok !== true || e.ym !== ym || !Array.isArray(e.aenderungen)) return passtNicht("form");
  if (!ganz(e.startwert, 0, 4294967295) || typeof e.monatFreigegeben !== "boolean" || !aufwandForm(e.aufwand)) return passtNicht("form");
  if (!ZAEHLER.every((k) => ganz(e[k], 0, 1e9))) return passtNicht("form");
  if (!Array.isArray(e.nichtBewertet) || new Set(e.nichtBewertet).size !== e.nichtBewertet.length || !e.nichtBewertet.every((x) => VERBESSERN_NICHT_BEWERTET.includes(x))
    || !e.nichtBewertet.includes("ausgleichszeitraum") || !e.nichtBewertet.includes("wunsch")) return passtNicht("form");
  if (e.aenderungen.length > VERBESSERN_GRENZE.aenderungen) return nein("aufwand");
  const j = Number(ym.slice(0, 4));
  const P = Math.max(1, m.personen.length);
  const n = e.aenderungen.length;
  const mf = Number(m.einstellungen.maxFolge);
  const W = mf > 0 ? Math.ceil(mf) : 0;
  const nTage = dim_(j, Number(ym.slice(5, 7)) - 1);
  const { r: R } = umgebung(m, `${ym}-01`);
  if (P * nTage > VERBESSERN_GRENZE.personenTage || schlussKosten(P, nTage + 2 * (R + 7), W, n) > VERBESSERN_GRENZE.aufwand
    || 2 * n * planbefundAufwandHoechst(m, j) > VERBESSERN_GRENZE.planbefund) return nein("aufwand");
  const personVon = new Map(m.personen.map((p) => [p.id, p]));
  const dienstVon = new Map(m.dienstarten.map((d) => [d.id, d]));
  const basis = m.abweichungen;
  const schl = new Set();
  const neu = { ...basis }, ohneAlle = { ...basis };
  const tageSet = new Set();
  for (const x of e.aenderungen) {
    if (!genauSchluessel(x, S_.aenderung)) return passtNicht("form");
    if (!VERBESSERN_TYPEN.includes(x.typ) || !VERBESSERN_GRUENDE.includes(x.grund)) return passtNicht("kennung");
    if (!istKennung(x.vonPersonId) || !istKennung(x.nachPersonId) || !istKennung(x.dienstId) || x.vonPersonId === x.nachPersonId) return passtNicht("kennung");
    if (!tagOk(x.datum) || x.datum.slice(0, 7) !== ym || x.datum <= heute) return passtNicht("tag");
    if (!genauSchluessel(x.wirkung, S_.wirkung) || !rangForm(x.wirkung.vorher) || !rangForm(x.wirkung.nachher)) return passtNicht("form");
    if (!besserOhneVerschlechterung(x.wirkung.nachher, x.wirkung.vorher)) return passtNicht("wirkung");
    const p = personVon.get(x.vonPersonId), q = personVon.get(x.nachPersonId), da = dienstVon.get(x.dienstId);
    if (!p || !q || !da) return passtNicht("bestand");
    const kv = `${p.id}|${x.datum}`, kn = `${q.id}|${x.datum}`;
    if (schl.has(kv) || schl.has(kn)) return passtNicht("dublette");
    schl.add(kv); schl.add(kn);
    if (!hat(basis, kv) || basis[kv] !== x.dienstId) return passtNicht("vorwert");
    if (hat(basis, kn) && basis[kn] !== "-") return passtNicht("nachwert");
    if (personTag(m, q, x.datum).dienstId || !imDienst(q, x.datum)) return passtNicht("nachwert");
    if (anheftungSperrt(anh, p.id, x.datum) || anheftungSperrt(anh, q.id, x.datum)) return passtNicht("angeheftet");
    if (entfernenVorgaben(m, p, x.datum).muss) return passtNicht("vorgabe");
    neu[kv] = "-"; neu[kn] = x.dienstId; ohneAlle[kv] = "-";
    tageSet.add(x.datum);
  }
  if (!n) return { ok: true };
  const pm = pruefstand(m);
  const M = { ...pm, abweichungen: { ...basis } }, S = { ...pm, abweichungen: neu }, ohne = { ...pm, abweichungen: ohneAlle };
  for (const d of tageSet) if (verdraengt(M, S, d, schl)) return passtNicht("verdraengt");
  const np = nachpruefen(ohne, S, e.aenderungen.map((x) => ({ personId: personVon.get(x.nachPersonId).id, datum: x.datum, dienstId: x.dienstId })), neuesVorgabenBudget(vorgabenAufwand));
  if (!np.durch) return passtNicht("nachpruefung");
  for (const pid of new Set(e.aenderungen.map((x) => x.vonPersonId))) {
    const p = personVon.get(pid);
    for (const x of e.aenderungen.filter((y) => y.vonPersonId === pid)) if (!ersatzruheEntfernenOk(M, S, p, x.datum)) return passtNicht("ersatzruhe");
  }
  let a = null, b = null;
  for (const d of tageSet) { const u = umgebung(m, d); if (a === null || u.a < a) a = u.a; if (b === null || u.b > b) b = u.b; }
  const tage = []; for (let t = 1; t <= nTage; t++) tage.push(`${ym}-${pad(t)}`);
  const von = ersterTag(tage, heute), bis = tage[nTage - 1];
  if (!von) return passtNicht("tag");
  const nachBs = vereint(befundeMitStufe(S, a, b), befundeMitStufe(S, von, bis));
  if (nachBs.istOffen) return passtNicht("istdaten");
  if (neuerBefund(befundKarte(vereint(befundeMitStufe(M, a, b), befundeMitStufe(M, von, bis))), befundKarte(nachBs))) return passtNicht("neuer_befund");
  const nachAus = new Set(befundeMitStufe(S, von, bis).liste.map(({ b: y }) => String(y.id)));
  for (const x of e.aenderungen) {
    const ids = ausloeserIds(M, von, bis, x.grund, personVon.get(x.vonPersonId).id, x.datum, x.dienstId);
    if (!ids.length || ids.every((id) => nachAus.has(id))) return passtNicht("ausloeser");
  }
  return { ok: true };
}
