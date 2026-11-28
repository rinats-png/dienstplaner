/* ==========================================================================
   VERBESSERN-MODUS — ÄNDERUNGSLISTE MIT GRUND (WP-I9 PR-A, Block K, Engine-Stufe)

   Akzeptanz WP-I9 (INTELLIGENCE-ENTWICKLUNGSPLAN.md, Block K; Plan 7.x in
   docs/intelligence/PLAN-WARNEN-VORGABEN-PLANVORSCHLAG.md): „Plan begutachten → Änderungsliste mit Grund;
   Übernahme als Entwurf; einzelne Änderungen; Entwurf wird nie veröffentlicht und überschreibt nichts;
   kein Schreibpfad ohne Mensch.“ Diese Stufe ist NUR die Begutachtung: reine Rechnung, keine Route, kein
   Schreiben, keine Oberfläche (Übernahme mit Überschreiben: PR-B; Oberfläche: PR-C; siehe
   docs/acc45/WP-I9-nachweis.md). Der eigene Planer (planer.mjs) ändert den Bestand nie; dieser Modus
   schlägt Änderungen AM Bestand vor — als Daten, die ein Mensch später einzeln übernehmen kann.

   Ein Änderungstyp (erster Wurf): ERSETZEN. Eine bestehende Einteilung (Eintrag in `abweichungen`, nicht
   angeheftet, Tag ab dem heutigen Betriebstag `opt.heute`, Monat nicht abgeschlossen) mit einem Befund
   ab Achtung aus der Planprüfung (pruefen, befunde.mjs: schwere „danger“/„warn“) geht an eine andere
   Person: Vorwert des Schlüssels `von|Tag` ist der Dienst, danach „-“ (frei); der Schlüssel `nach|Tag`
   (vorher leer oder „-“) bekommt den Dienst.

   Behalten wird eine Änderung nur, wenn ALLES gilt (fail closed):
   - Ersatzperson aus ersatzVorschlaege (möglich, nicht angeheftet), höchstens VERBESSERN_GRENZE.versuche
     je Konflikt voll geprüft, in der Reihenfolge der Ersatzsuche;
   - Nachprüfung des Planers (nachpruefen, planer.mjs) für die neue Einteilung auf dem Stand ohne die alte:
     dienstfrei, keine Befunde ab Achtung (Automatik: Muss ungeprüft = Achtung), Anheften, Vorwärtsprüfung
     späterer Tage (folgeVorwaerts) und Planbefunde (Nachtdienste in Folge, § 11 ArbZG: planbefundeNeu);
   - Bestandspersonen des Tags unverändert (verdraengt: Posten, Hineinziehen, Verdrängen);
   - Umgebung (Tag ± R, ganze Kalenderwoche; alle Personen) neu geprüft: kein Befund ab Achtung, den es
     vorher nicht gab oder der schwerer wird (Ruhezeit, Folgetage, Nachtfolge, Qualifikation, Besetzung,
     Alleindienst … auch bei Dritten); mindestens ein Befund des Grunds an der Einteilung ist danach weg („nur
     was einen Konflikt löst“);
   - STRIKTER Rangvorteil im Rangvektor der Umgebung: gesetz > qualifikation > besetzung > muss > soll >
     verteilung (Verteilung nur nachgelagert). Eine nicht bewertete Stufe (null) entscheidet nie und beendet
     den Vergleich: was hinter ihr läge, gilt nicht als besser („nicht bewertbar“ ist nie erfüllt/besser).
   Rangvektor (Zahlen ≥ 0 oder null): gesetz = Befunde „danger“ an Personen, qualifikation = Befunde zu
   Qualifikation/Fachkraftquote/vorbehaltenen Aufgaben, besetzung = fehlende Personen über alle Dienste der
   Umgebung, muss = Befunde „warn“ an Personen + Muss-Vorgaben (und ungeprüfte Vorgaben) der betroffenen
   Einteilung, soll = Soll-Vorgaben der Einteilung (null, wenn Vorgaben ungeprüft), verteilung = Summe der
   Überschreitungen der Verteilungsvorgaben im Monat (null, wenn nicht vollständig bewertbar).

   Wechselwirkungen: Konflikte werden in fester Reihenfolge (Tag, Dienst, Person) auf dem jeweils aktuellen
   Stand geprüft, d. h. jede Änderung auf dem Stand MIT allen früheren; berührt eine spätere denselben
   Schlüssel, dieselbe Person am selben Tag oder erzeugt sie mit einer früheren einen Befund, wird die
   spätere verworfen. Zum Schluss prüft verbesserungAbgleich die ganze Liste gemeinsam gegen den Bestand
   (wie der Erfüllungsbericht: passt etwas nicht, gibt es keine Liste — ergebnis_passt_nicht).

   Aufwand: feste Grenzen wie der Planer (PLANER_GRENZE: 1 Mio Personenprüfungen; Planbefunde
   PLANBEFUND_GRENZE = 40 Mio Personentage; Vorgaben VORGABEN_WIRKUNG_GRENZE; nichts erhöht), Arbeit VOR
   ihr angemeldet, die gemeinsame Schlussprüfung immer reserviert. Reicht es nicht, bleiben die übrigen
   Konflikte ungeprüft (Zahl `ungeprueft`, `aufwand.ausgeschoepft`), nie eine halbe Änderung.

   Datenschutz (D-16, KI-VO-Vermeidung): nur Planfakten. Ergebnis mit Positivliste der Schlüssel; Werte nur
   Zahlen, Wahrheitswerte, Kennungen (/^[A-Za-z0-9_.-]{1,64}$/) und Werte fester Listen. Personenkennungen
   NUR in `vonPersonId`/`nachPersonId` (die spätere Übernahme braucht sie); keine Namen, keine Texte, keine
   Punkte/Scores je Person, keine Prozent, kein Schlüssel „Person|Tag“. Keine Wünsche, keine Profile.

   Rein: keine Uhr (Tag aus `opt.heute`, Regeln über mitTagesdatum), kein Zufall (Gleichstand: fester
   Startwert, zufallAus aus planer.mjs), keine Ablage; Eingaben werden nie verändert; wirft nie
   ({ ok: false, grund }). Unabhängig vom Planer-Schalter (PLANER_AN bleibt AUS): die spätere Verdrahtung
   prüft Schalter, Pause, Rechte und Freigabe.
   ========================================================================== */
import { dim_, pad, addDays, montag } from "../regelwerk.mjs";
import { monatAbgeschlossen } from "../monatsabschluss.mjs";
import { freigegebeneMonate } from "../planfreigabe.mjs";
import { neuesVorgabenBudget } from "../vorgabenwirkung.mjs";
import { VORGABEN_WIRKUNG_GRENZE } from "../vorgaben.mjs";
import { imDienst } from "../fachpruefung.mjs";
import { besetzung, personTag, stundenkonto } from "./plan.mjs";
import { pruefen } from "./befunde.mjs";
import { ersatzVorschlaege, hindernisBefunde, nachtJahr, verdraengt, planbefundAufwandHoechst, PLANBEFUND_GRENZE } from "./einsatz.mjs";
import { nachpruefen, zufallAus, PLANER_GRENZE, PLANER_STANDARD } from "./planer.mjs";
import { anheftungenLesen, anheftungSperrt } from "./anheften.mjs";
import { verteilungAufwand, verteilungVorbereiten, verteilungBewerten, nachtZaehlen, nachtAm } from "./verteilung.mjs";
import { mitTagesdatum } from "./zeit.mjs";

/** Änderungstypen (erster Wurf: nur Ersetzen). */
export const VERBESSERN_TYPEN = Object.freeze(["ersetzen"]);
/** Rangfolge des Vergleichs (kleinerer Index geht vor; Verteilung nur nachgelagert). */
export const VERBESSERN_RANGFOLGE = Object.freeze(["gesetz", "qualifikation", "besetzung", "muss", "soll", "verteilung"]);
/** Werteliste der Gründe: Befundarten der Planprüfung, die eine Einteilung auslösen kann (Rangfolge: Gesetz zuerst). */
export const VERBESSERN_GRUENDE = Object.freeze(["abwesend", "sperre", "schutz", "nachweis", "einschraenkung", "ruhezeit", "sonntagsfrei", "ersatzruhe",
  "nachtfolge", "folge", "qualifikation", "fachkraft", "aufgabe"]);
/** Befundarten am Dienst (nicht an einer Person); Ref beginnt mit der Dienstkennung. */
const DIENST_ARTEN = Object.freeze(["qualifikation", "fachkraft", "aufgabe"]);
/** Befundarten, die eine Einteilung nicht ändert oder die nie sperren (Ist-Daten, Regelsatz, Entgeltstatus, Angebot der Untersuchung,
    Urlaubsobergrenze): weder Auslöser noch „neu“. Unterbesetzung zählt über die Besetzung (Rang), nicht als Befund. */
const NEUTRALE_ARTEN = Object.freeze(["istdaten", "regelsatz", "entgelt", "vorsorge", "urlaub", "besetzung"]);
/** Stufen der Planprüfung ab Achtung (befunde.mjs: danger ≙ recht, warn ≙ achtung). */
const SCHWERE_RANG = Object.freeze({ warn: 1, danger: 2 });
/** Wertelisten des Ergebnisses: was nicht bewertet ist (nie „erfüllt“). */
export const VERBESSERN_NICHT_BEWERTET = Object.freeze(["soll", "verteilung", "wunsch"]);
/**
 * Obergrenzen: Personentage des Monats, Stellen (Tag × Dienst), Konflikte, Änderungen, Versuche je Konflikt, Halbweite der Umgebung;
 * Aufwand und Planbefunde = Obergrenzen des Planers (unverändert: 1 Mio Personenprüfungen, 40 Mio Personentage).
 */
export const VERBESSERN_GRENZE = Object.freeze({ personenTage: 200000, stellen: 20000, konflikte: 500, aenderungen: 500, versuche: 3, umgebungTage: 31,
  aufwand: PLANER_GRENZE.aufwand, planbefund: PLANBEFUND_GRENZE });
/** Arbeit einer Planprüfung je Person über die Tage hinaus (Lauf 10 Tage davor, 2 danach; Ersatzruhe je Kalendermonat ± 56 Tage). */
const PRUEF_ZUSCHLAG = 12 + 2 * (31 + 2 * 56);

/** Positivliste der Schlüssel des Ergebnisses. */
export const VERBESSERN_SCHLUESSEL = Object.freeze({
  ergebnis: Object.freeze(["ok", "ym", "startwert", "monatFreigegeben", "aenderungen", "konflikte", "unveraendert", "mitgeloest", "ungeprueft", "angeheftet", "nichtBewertet", "aufwand"]),
  aenderung: Object.freeze(["typ", "datum", "dienstId", "vonPersonId", "nachPersonId", "grund", "wirkung"]),
  wirkung: Object.freeze(["vorher", "nachher"]),
  aufwand: Object.freeze(["grenze", "verbraucht", "ausgeschoepft", "planbefund"]),
  planbefund: Object.freeze(["grenze", "verbraucht", "ausgeschoepft"]),
});

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

/** Ist der Befund ein Auslöser bzw. eine Wirkung (ab Achtung, nicht neutral)? */
const zaehlt = (b) => !!b && hat(SCHWERE_RANG, b.schwere) && !NEUTRALE_ARTEN.includes(b.art);
const amDienst = (b) => DIENST_ARTEN.includes(b.art);
/** Befunde einer Umgebung als Karte Kennung → Schwere (nur, was zählt). */
const befundKarte = (liste) => { const k = new Map(); for (const b of liste) if (zaehlt(b)) k.set(String(b.id), Math.max(k.get(String(b.id)) || 0, SCHWERE_RANG[b.schwere])); return k; };
/** Gibt es in `nachher` einen Befund, den es in `vorher` nicht oder nur leichter gab? */
const neuerBefund = (vorher, nachher) => { for (const [id, s] of nachher) if (!vorher.has(id) || vorher.get(id) < s) return true; return false; };
/** Passt ein Befund zur Einteilung (Person am Tag bzw. ihr Dienst am Tag)? */
const passtZu = (b, pid, d, daId) => b.datum === d && (amDienst(b) ? String(b.ref) === String(daId) || String(b.ref).startsWith(`${daId}|`) : b.personId === pid);

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

/** Rangvektor eines Stands über die Umgebung [a, b] mit den Vorgabenbefunden der betroffenen Einteilung (`vb`) und der Verteilung (`vtSumme`). */
function rangUmgebung(stand, a, b, vb, vtSumme) {
  let gesetz = 0, qualifikation = 0, muss = 0, luecke = 0;
  for (const x of pruefen(stand, a, b)) {
    if (!zaehlt(x)) continue;
    if (amDienst(x)) qualifikation++;
    else if (x.schwere === "danger") gesetz++;
    else muss++;
  }
  for (let t = a; t <= b; t = addDays(t, 1)) for (const e of Object.values(besetzung(stand, t))) luecke += Math.max(0, -e.diff);
  return { gesetz, qualifikation, besetzung: luecke, muss: muss + vb.muss + vb.offen, soll: vb.offen ? null : vb.soll, verteilung: vtSumme };
}
/** Vorgabenbefunde einer Einsatzprüfung: Muss, Soll, ungeprüft. */
const vorgabenZaehlen = (bef) => ({ muss: bef.filter((x) => x.regel === "vorgabeMuss").length, soll: bef.filter((x) => x.regel === "vorgabeSoll").length,
  offen: bef.filter((x) => x.regel === "vorgabeOffen").length });

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

/** Kosten der gemeinsamen Schlussprüfung (verbesserungAbgleich) für n Änderungen: zwei Planprüfungen der vereinigten Umgebung, je
    Änderung Nachprüfung (P + 1 + 2 W, Bestandspersonen 2 P) und Besetzung des Tags. */
const schlussKosten = (P, L, W, n) => 2 * P * (L + PRUEF_ZUSCHLAG) + n * (4 * P + 1 + 2 * W);

/**
 * Begutachtet den Plan eines Monats und schlägt Ersetzungen mit Grund vor (Engine-Stufe). Rein, deterministisch, wirft nie.
 * @param {any} m Betrieb (Bestand) @param {string} ym Monat JJJJ-MM
 * @param {{ heute: string, startwert?: number, aufwand?: number, planbefundAufwand?: number, vorgabenAufwand?: number }} opt
 *   `heute`: heutiger Betriebstag JJJJ-MM-TT (Tage davor werden nie geändert)
 * @returns {{ ok: false, grund: string, pruefung?: string } | { ok: true, ym: string, startwert: number, monatFreigegeben: boolean,
 *   aenderungen: any[], konflikte: number, unveraendert: number, mitgeloest: number, ungeprueft: number, angeheftet: number,
 *   nichtBewertet: string[], aufwand: any }}
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
  const von = tage.find((d) => d >= o.heute), bis = tage[nTage - 1];
  const freigegeben = freigegebeneMonate(m).has(ym);

  /* Aufwand: anmelden VOR der Arbeit; die Schlussprüfung (n Änderungen) bleibt immer reserviert. */
  const mf = Number(m.einstellungen.maxFolge);
  const W = mf > 0 ? Math.ceil(mf) : 0;
  const { r: R } = umgebung(m, `${ym}-01`);
  const Lmax = nTage + 2 * (R + 7);
  const A = { rest: grenze, ausgeschoepft: false };
  const leisten = (k, n) => { if (A.rest - k < schlussKosten(P, Lmax, W, n)) { A.ausgeschoepft = true; return false; } A.rest -= k; return true; };
  const pbHoechst = planbefundAufwandHoechst(m, j);
  const PB = { rest: pbGrenze, ausgeschoepft: false };
  const pbLeisten = (k, n) => { if (PB.rest - k < n * pbHoechst) { PB.ausgeschoepft = true; return false; } PB.rest -= k; return true; };
  const aufwandAus = () => ({ grenze, verbraucht: grenze - A.rest, ausgeschoepft: A.ausgeschoepft || PB.ausgeschoepft,
    planbefund: { grenze: pbGrenze, verbraucht: pbGrenze - PB.rest, ausgeschoepft: PB.ausgeschoepft } });
  const leer = (extra) => ({ ok: true, ym, startwert, monatFreigegeben: freigegeben, aenderungen: [], konflikte: 0, unveraendert: 0, mitgeloest: 0, ungeprueft: 0,
    angeheftet: 0, nichtBewertet: ["wunsch"], aufwand: aufwandAus(), ...extra });
  if (!von) return leer({});                                                        // ganzer Monat vergangen: nichts zu ändern

  /* Planprüfung des laufenden/künftigen Teils (Auslöser) und Vorbereitung der Ersatzsuche (wie der Planer: ein Kontext je Aufruf). */
  if (!leisten(P * (tageZwischen(von, bis) + PRUEF_ZUSCHLAG) + 2 * P * 31, 0)) return { ...nein("aufwand"), aufwand: aufwandAus() };
  const dIndex = new Map(m.dienstarten.map((d, i) => [d.id, i]));
  const dienstVon = new Map(m.dienstarten.map((d) => [d.id, d]));
  const personVon = new Map(m.personen.map((p) => [p.id, p]));
  const basis = m.abweichungen;
  const kandidaten = new Map();         // Schlüssel → { p, d, da, grund, rangGrund }
  const grundRang = (b) => (2 - SCHWERE_RANG[b.schwere]) * VERBESSERN_GRUENDE.length + VERBESSERN_GRUENDE.indexOf(b.art);
  const vormerken = (p, d, b) => {
    const k = `${p.id}|${d}`;
    const w = basis[k];
    const da = dienstVon.get(w);
    if (!da || w === "-") return;
    const t = personTag(m, p, d);
    /* Einteilung aus `abweichungen` (nicht Schichtfolge, nicht Posten-Ersatz); abwesend: Eintrag steht, zählt aber nicht. */
    if (t.quelle !== "abweichung" || !(t.dienstId === w || (t.abwesenheit && t.dienstId === null))) return;
    const g = grundRang(b);
    const alt = kandidaten.get(k);
    if (!alt || g < alt.rangGrund) kandidaten.set(k, { p, d, da, grund: b.art, rangGrund: g });
  };
  for (const b of pruefen(m, von, bis)) {
    if (!zaehlt(b) || !VERBESSERN_GRUENDE.includes(b.art) || typeof b.datum !== "string" || b.datum < von || b.datum > bis) continue;
    if (amDienst(b)) {
      const daId = String(b.ref).split("|")[0];
      const da = m.dienstarten.find((x) => String(x.id) === daId);
      if (!da) continue;
      for (const p of besetzung(m, b.datum)[da.id].personen) vormerken(p, b.datum, b);
    } else {
      const p = personVon.get(b.personId);
      if (p && imDienst(p, b.datum)) vormerken(p, b.datum, b);
    }
  }
  const liste = [...kandidaten.values()].sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0) || dIndex.get(x.da.id) - dIndex.get(y.da.id)
    || (String(x.p.id) < String(y.p.id) ? -1 : String(x.p.id) > String(y.p.id) ? 1 : 0)).slice(0, VERBESSERN_GRENZE.konflikte);
  const konflikte = Math.min(kandidaten.size, VERBESSERN_GRENZE.konflikte);

  const ctx = { konten: new Map(), einspruenge: {}, nachtAnzahl: new Map(), vorgabenBudget: neuesVorgabenBudget(vorgabenAufwand), vorgabenAutomatisch: true };
  for (const p of m.personen) { ctx.konten.set(p.id, stundenkonto(m, p, ym)); ctx.nachtAnzahl.set(p.id, nachtJahr(m, p, j).anzahl); }
  for (const e of m.einspruenge || []) ctx.einspruenge[e.personId] = (ctx.einspruenge[e.personId] || 0) + 1;
  const werte = [...ctx.konten.values()].filter((k) => k !== null).sort((a, b) => a - b);
  ctx.median = werte.length ? werte[Math.floor(werte.length / 2)] : 0;
  ctx.mittelEinspruenge = m.personen.length ? (m.einspruenge || []).length / m.personen.length : 0;
  const nw = [...ctx.nachtAnzahl.values()].filter((k) => k !== null);
  ctx.nachtMittel = nw.length ? nw.reduce((a, b) => a + b, 0) / nw.length : 0;
  const pruefOpt = { vorgabenBudget: ctx.vorgabenBudget, vorgabenAutomatisch: true };
  const nachBudget = neuesVorgabenBudget(vorgabenAufwand);
  /* Verteilung (nachgelagert): Vergleichsgruppen einmal je Aufruf; nicht vollständig bewertbar = null. */
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
  const rnd = zufallAus(startwert);

  let S = { ...m, abweichungen: { ...basis } };
  if (vt) zaehlStand.set(S, nachtZaehlen(S, vt));
  const benutzt = new Set();              // Schlüssel Person|Tag, die eine Änderung schon berührt (von oder nach)
  const aenderungen = [];
  let unveraendert = 0, mitgeloest = 0, ungeprueft = 0, angeheftet = 0, nichtBewertetSoll = false, nichtBewertetVt = !vt;
  for (let i = 0; i < liste.length; i++) {
    const K = liste[i];
    const p = K.p, d = K.d, da = K.da, kp = `${p.id}|${d}`;
    if (anheftungSperrt(anh, p.id, d)) { angeheftet++; unveraendert++; continue; }
    if (!istKennung(p.id) || !istKennung(da.id) || benutzt.has(kp) || S.abweichungen[kp] !== da.id) { unveraendert++; continue; }
    const { a, b } = umgebung(m, d);
    const L = tageZwischen(a, b);
    /* Vorher: Planprüfung der Umgebung, Besetzung, Einsatzprüfung der bestehenden Einteilung (ohne sie), Ersatzsuche. */
    if (!leisten(P * (L + PRUEF_ZUSCHLAG) + P * L + 3 * P + 1, aenderungen.length)) { ungeprueft = liste.length - i; break; }
    const vorKarte = befundKarte(pruefen(S, a, b));
    const ausloeser = [...new Set(pruefen(S, a, b).filter((x) => zaehlt(x) && x.art === K.grund && passtZu(x, p.id, d, da.id)).map((x) => String(x.id)))];
    if (!ausloeser.length) { mitgeloest++; continue; }                               // durch eine frühere Änderung schon gelöst
    const ohne = { ...S, abweichungen: { ...S.abweichungen, [kp]: "-" } };
    const vbP = vorgabenZaehlen(hindernisBefunde(ohne, p, d, da, pruefOpt));
    const vorher = rangUmgebung(S, a, b, vbP, vtSumme(S, null, d));
    const kand = ersatzVorschlaege(ohne, d, da.id, ctx).filter((x) => x.moeglich && x.person.id !== p.id && istKennung(x.person.id)
      && !benutzt.has(`${x.person.id}|${d}`) && !anheftungSperrt(anh, x.person.id, d)
      && (!hat(S.abweichungen, `${x.person.id}|${d}`) || S.abweichungen[`${x.person.id}|${d}`] === "-"));
    let beste = null, versuche = 0, abbruch = false;
    for (const x of kand) {
      if (versuche >= VERBESSERN_GRENZE.versuche) break;
      versuche++;
      const q = x.person, kq = `${q.id}|${d}`;
      /* Nachher: Nachprüfung (Planbefunde reserviert), Bestandspersonen, Planprüfung der Umgebung, Besetzung. */
      if (!leisten(P * (L + PRUEF_ZUSCHLAG) + P * L + 3 * P + 1 + 2 * W, aenderungen.length) || !pbLeisten(pbHoechst, aenderungen.length)) { abbruch = true; break; }
      const S1 = { ...ohne, abweichungen: { ...ohne.abweichungen, [kq]: da.id } };
      const np = nachpruefen(ohne, S1, [{ personId: q.id, datum: d, dienstId: da.id }], nachBudget);
      if (!np.durch) continue;
      if (verdraengt(S, S1, d, new Set([kp, kq]))) continue;
      const nachKarte = befundKarte(pruefen(S1, a, b));
      /* Kein neuer oder schwererer Befund in der Umgebung; mindestens ein Befund des Grunds an dieser Einteilung ist weg. */
      if (neuerBefund(vorKarte, nachKarte) || ausloeser.every((id) => nachKarte.has(id))) continue;
      const nachher = rangUmgebung(S1, a, b, { muss: np.muss, soll: np.soll, offen: np.offenV }, vtSumme(S1, S, d));
      if (vorher.soll === null || nachher.soll === null) nichtBewertetSoll = true;
      if (vorher.verteilung === null || nachher.verteilung === null) nichtBewertetVt = true;
      if (verbessernRangVergleich(nachher, vorher) >= 0) continue;                // nur bei STRIKTEM Rangvorteil
      if (!beste) { beste = { q, S1, nachher, gleich: [] }; continue; }
      const c = verbessernRangVergleich(nachher, beste.nachher);
      const gleichAuf = c === 0 && VERBESSERN_RANGFOLGE.every((k2) => nachher[k2] === beste.nachher[k2]);
      if (c < 0 && !gleichAuf) beste = { q, S1, nachher, gleich: [] };
      else if (gleichAuf) beste.gleich.push({ q, S1, nachher });
    }
    if (beste && beste.gleich.length) {
      /* Gleichstand: fester Startwert (zufallAus, kein Math.random), Reihenfolge der Ersatzsuche als Grundlage. */
      const alle = [{ q: beste.q, S1: beste.S1, nachher: beste.nachher }, ...beste.gleich];
      const w = alle[Math.floor(rnd() * alle.length)];
      beste = { ...w, gleich: [] };
    }
    if (!beste) { if (abbruch) { ungeprueft = liste.length - i; break; } unveraendert++; continue; }
    S = beste.S1;
    benutzt.add(kp); benutzt.add(`${beste.q.id}|${d}`);
    aenderungen.push({ typ: "ersetzen", datum: d, dienstId: da.id, vonPersonId: p.id, nachPersonId: beste.q.id, grund: K.grund,
      wirkung: { vorher: { ...vorher }, nachher: { ...beste.nachher } } });
    if (abbruch) { ungeprueft = liste.length - i - 1; break; }
  }
  const nichtBewertet = [...(nichtBewertetSoll ? ["soll"] : []), ...(nichtBewertetVt ? ["verteilung"] : []), "wunsch"];
  const ergebnis = { ok: true, ym, startwert, monatFreigegeben: freigegeben, aenderungen, konflikte, unveraendert, mitgeloest, ungeprueft, angeheftet, nichtBewertet, aufwand: null };
  /* Gemeinsame Schlussprüfung (reserviert): passt die Liste nicht zum Bestand, gibt es keine (fail closed). */
  A.rest -= schlussKosten(P, Lmax, W, aenderungen.length);
  PB.rest -= aenderungen.length * pbHoechst;
  const g = abgleichRechnen(m, ym, ergebnis, o.heute, anh, vorgabenAufwand);
  if (!g.ok) return g;
  return { ...ergebnis, aufwand: aufwandAus() };
}

/**
 * Gleicht eine Änderungsliste gegen den Bestand ab (fail closed; für die Schlussprüfung hier und die spätere Übernahme, PR-B).
 * Form: Positivliste der Schlüssel, Kennungen, Wertelisten, Zahlen. Bestand: jede Änderung genau ein vorhandener Schlüssel `von|Tag`
 * mit dem behaupteten Dienst; `nach|Tag` leer oder „-“ und die Person an dem Tag dienstfrei; keine Dubletten (kein Schlüssel zweimal);
 * Personen und Dienste bekannt; nichts angeheftet; kein Tag vor `heute`; Monat nicht abgeschlossen. Gemeinsam: alle Änderungen
 * zusammen auf dem Bestand — je Änderung bestand ein Befund des Grunds an der Einteilung, mindestens einer ist danach weg; in der vereinigten Umgebung kein neuer
 * oder schwererer Befund, Bestandspersonen jedes Tags unverändert, jede neue Einteilung besteht die Nachprüfung des Planers.
 * Behauptete Wirkung: strikt besser (verbessernRangVergleich). Rein; wirft nie.
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
const nurSchluessel = (x, erlaubt) => Object.keys(x).every((k) => erlaubt.includes(k));

/** @param {any} m @param {string} ym @param {any} e @param {string} heute @param {any} anh @param {number} vorgabenAufwand @returns {any} */
function abgleichRechnen(m, ym, e, heute, anh, vorgabenAufwand) {
  const S_ = VERBESSERN_SCHLUESSEL;
  if (!istObjekt(e) || e.ok !== true || !nurSchluessel(e, S_.ergebnis) || e.ym !== ym || !Array.isArray(e.aenderungen)) return passtNicht("form");
  if (e.aenderungen.length > VERBESSERN_GRENZE.aenderungen) return nein("aufwand");
  if (!Array.isArray(e.nichtBewertet) || !e.nichtBewertet.every((x) => VERBESSERN_NICHT_BEWERTET.includes(x))) return passtNicht("form");
  for (const k of ["konflikte", "unveraendert", "mitgeloest", "ungeprueft", "angeheftet"]) if (hat(e, k) && !ganz(e[k], 0, 1e9)) return passtNicht("form");
  if (hat(e, "monatFreigegeben") && typeof e.monatFreigegeben !== "boolean") return passtNicht("form");
  const j = Number(ym.slice(0, 4));
  const P = Math.max(1, m.personen.length);
  const n = e.aenderungen.length;
  const mf = Number(m.einstellungen.maxFolge);
  const W = mf > 0 ? Math.ceil(mf) : 0;
  const nTage = dim_(j, Number(ym.slice(5, 7)) - 1);
  const { r: R } = umgebung(m, `${ym}-01`);
  if (P * nTage > VERBESSERN_GRENZE.personenTage || schlussKosten(P, nTage + 2 * (R + 7), W, n) > VERBESSERN_GRENZE.aufwand
    || n * planbefundAufwandHoechst(m, j) > VERBESSERN_GRENZE.planbefund) return nein("aufwand");
  const personVon = new Map(m.personen.map((p) => [p.id, p]));
  const dienstVon = new Map(m.dienstarten.map((d) => [d.id, d]));
  const basis = m.abweichungen;
  const schl = new Set();
  const neu = { ...basis }, ohneAlle = { ...basis };
  const tageSet = new Set();
  for (const x of e.aenderungen) {
    if (!istObjekt(x) || Object.keys(x).length !== S_.aenderung.length || !nurSchluessel(x, S_.aenderung)) return passtNicht("form");
    if (!VERBESSERN_TYPEN.includes(x.typ) || !VERBESSERN_GRUENDE.includes(x.grund)) return passtNicht("kennung");
    if (!istKennung(x.vonPersonId) || !istKennung(x.nachPersonId) || !istKennung(x.dienstId) || x.vonPersonId === x.nachPersonId) return passtNicht("kennung");
    if (!tagOk(x.datum) || x.datum.slice(0, 7) !== ym || x.datum < heute) return passtNicht("tag");
    if (!istObjekt(x.wirkung) || Object.keys(x.wirkung).length !== 2 || !nurSchluessel(x.wirkung, S_.wirkung) || !rangForm(x.wirkung.vorher) || !rangForm(x.wirkung.nachher)) return passtNicht("form");
    if (verbessernRangVergleich(x.wirkung.nachher, x.wirkung.vorher) >= 0) return passtNicht("wirkung");
    const p = personVon.get(x.vonPersonId), q = personVon.get(x.nachPersonId), da = dienstVon.get(x.dienstId);
    if (!p || !q || !da) return passtNicht("bestand");
    const kv = `${p.id}|${x.datum}`, kn = `${q.id}|${x.datum}`;
    if (schl.has(kv) || schl.has(kn)) return passtNicht("dublette");
    schl.add(kv); schl.add(kn);
    if (!hat(basis, kv) || basis[kv] !== x.dienstId) return passtNicht("vorwert");
    if (hat(basis, kn) && basis[kn] !== "-") return passtNicht("nachwert");
    if (personTag(m, q, x.datum).dienstId || !imDienst(q, x.datum)) return passtNicht("nachwert");
    if (anheftungSperrt(anh, p.id, x.datum) || anheftungSperrt(anh, q.id, x.datum)) return passtNicht("angeheftet");
    neu[kv] = "-"; neu[kn] = x.dienstId; ohneAlle[kv] = "-";
    tageSet.add(x.datum);
  }
  if (!n) return { ok: true };
  const S = { ...m, abweichungen: neu }, ohne = { ...m, abweichungen: ohneAlle };
  /* Bestandspersonen jedes Tags (gegen den Bestand; die Schlüssel der Änderungen ausgenommen). */
  for (const d of tageSet) if (verdraengt(m, S, d, schl)) return passtNicht("verdraengt");
  /* Nachprüfung aller neuen Einteilungen zusammen auf dem Stand ohne die alten (Planer: dienstfrei, Befunde, Vorwärts, Planbefunde). */
  const np = nachpruefen(ohne, S, e.aenderungen.map((x) => ({ personId: personVon.get(x.nachPersonId).id, datum: x.datum, dienstId: x.dienstId })), neuesVorgabenBudget(vorgabenAufwand));
  if (!np.durch) return passtNicht("nachpruefung");
  /* Vereinigte Umgebung: kein neuer oder schwererer Befund; jeder Auslöser bestand und ist weg. */
  let a = null, b = null;
  for (const d of tageSet) { const u = umgebung(m, d); if (a === null || u.a < a) a = u.a; if (b === null || u.b > b) b = u.b; }
  const vor = pruefen(m, a, b), nach = pruefen(S, a, b);
  const vorK = befundKarte(vor), nachK = befundKarte(nach);
  if (neuerBefund(vorK, nachK)) return passtNicht("neuer_befund");
  for (const x of e.aenderungen) {
    const pid = personVon.get(x.vonPersonId).id;
    const ids = vor.filter((y) => zaehlt(y) && y.art === x.grund && passtZu(y, pid, x.datum, x.dienstId)).map((y) => String(y.id));
    if (!ids.length || ids.every((id) => nachK.has(id))) return passtNicht("ausloeser");
  }
  return { ok: true };
}
