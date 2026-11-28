/* ==========================================================================
   ERFÜLLUNGSBERICHT IM PLANVORSCHLAG (WP-I8, Oberfläche für Leitung und Planung) — reine Teile, keine Uhr, kein Netz.

   Die Antwort von POST /api/planer-vorschlag trägt `bericht` (Kennungen und Zahlen, server/lib/engine/erfuellungsbericht.mjs) oder `bericht: null`
   mit `berichtGrund`. Diese Datei macht daraus Anzeigetexte (src/ansichten/planer-vorschlag.jsx): je Kategorie in der Rangfolge ein Status mit
   klarem Text, die offenen Stellen mit Wo (Tag, Dienst), Warum (Ursache) und Wegen. Grundsätze:
   - Keine Rohkennung und kein Servertext in der Oberfläche: jede Kennung kommt aus einer Tabelle hier; eine unbekannte Kennung gibt einen
     neutralen Platzhalter, nie den Rohtext.
   - „Nicht bewertbar“ ist nie „erfüllt“. Bei Gesetz, Muss und Soll heißt „erfüllt“ nur: keine Befunde in den eigenen, vorgeschlagenen
     Einteilungen, Bestand nicht geprüft — das steht immer dabei (Pflichttext), nie ein „erfüllt“ allein.
   - Keine Gesamtnote, keine Prozente, keine Werte je Person. Namen nur hier aus dem eigenen Bestand (Dienst, Qualifikation, Vorgabe), nie von Personen.
   - Was sich nicht lesen oder prüfen lässt, ist „nicht bewertbar“ bzw. „nicht verfügbar“, nie ein stilles „in Ordnung“.
   ========================================================================== */
import { BERICHT_RANGFOLGE, AUSSAGE_VORSCHLAG, VERTEILUNG_MINDESTGRUPPE, BERICHT_URSACHEN, BERICHT_GRUENDE } from "../../server/lib/engine/erfuellungsbericht.mjs";
import { BEFUND_KATALOG } from "../../server/lib/bestaetigungen.mjs";
import { fKurz, DOW } from "./datum.js";
import { dow } from "../regelwerk.js";
import { grundVorgabeText } from "./planer-oberflaeche.js";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const zahl = (x) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const NEUTRAL = "nicht bezeichnet";

export const BERICHT_TEXTE = Object.freeze({
  titel: "Erfüllungsbericht",
  hinweis: "Zählwerte zu diesem Vorschlag, keine Gesamtnote und keine Bewertung einzelner Personen. Die Liste folgt der Rangfolge: Gesetz geht vor Qualifikation, Besetzung, Muss-Vorgaben, Soll-Vorgaben, Verteilung und Wünschen.",
  massgeblich: "Maßgeblich",
  erstesProblem: "Erstes Problem",
  keinProblem: "Erstes Problem: keines gefunden. Das heißt nicht, dass alles erfüllt ist: nicht bewertbare Kategorien sind nicht geprüft.",
  kategorienTitel: "Ergebnis je Kategorie",
  konflikteTitel: "Offene Stellen: Wo, Warum, Wege",
  keineKonflikte: "Es gibt keine offene Stelle.",
  wo: "Wo",
  warum: "Warum",
  wege: "Wege",
  wegeHinweis: "Wege sind Zählungen, keine Empfehlung: Sie zeigen, welche Regeln bei wie vielen Personen im Weg stehen. Bindende Regeln sind gekennzeichnet; sie lassen sich nicht aufheben.",
  bindend: "bindend",
  keineWege: "Für diese Ursache werden keine Wege berechnet.",
  wegeLeer: "Es wurde kein Weg gefunden.",
  wegeUnvollstaendig: "Die Wege ließen sich nicht vollständig berechnen; es wird keiner behauptet.",
  nichtVerfuegbar: "Erfüllungsbericht nicht verfügbar",
  vorschlagBleibt: "Der Vorschlag selbst bleibt davon unberührt.",
  kleineGruppe: `Gruppe kleiner als ${VERTEILUNG_MINDESTGRUPPE} Personen: Zahlen werden nicht genannt.`,
  zahlenNichtLesbar: "Zahlen nicht lesbar.",
  grundUnbekannt: "Grund nicht bewertbar",
});

/** Rangfolge der Kategorien mit Anzeigename (Reihenfolge = BERICHT_RANGFOLGE des Rechenkerns). */
export const BERICHT_KATEGORIE_NAME = Object.freeze({
  gesetz: "Gesetz und Schutzvorschriften", qualifikation: "Qualifikation", besetzung: "Besetzung", muss: "Muss-Vorgaben", soll: "Soll-Vorgaben",
  verteilung: "Verteilung (nachgelagert)", wunsch: "Wünsche",
});
/** Status der Anzeige. „erfuellt_im_vorschlag“ gibt es nur für Gesetz, Muss und Soll (nur die eigenen Einteilungen sind geprüft). */
export const BERICHT_STATUS_TEXT = Object.freeze({
  erfuellt: "Erfüllt", erfuellt_im_vorschlag: "Im Vorschlag ohne Befund", verletzt: "Verletzt", offen: "Offen", "nicht-bewertbar": "Nicht bewertbar",
});
/** Kategorien, deren „erfüllt“ nur die eigenen Einteilungen des Vorschlags betrifft. */
const NUR_VORSCHLAG = Object.freeze(["gesetz", "muss", "soll"]);
const NUR_VORSCHLAG_WORT = Object.freeze({ gesetz: "Gesetzesbefunde", muss: "Befunde zu Muss-Vorgaben", soll: "Befunde zu Soll-Vorgaben" });

/** Grund einer nicht bewertbaren Kategorie. */
export const BERICHT_GRUND_TEXT = Object.freeze({
  keine_einteilung_im_vorschlag: "Der Vorschlag enthält keine Einteilung, die sich prüfen ließ.",
  keine_vorgabe: "Es ist keine Vorgabe dieser Art aktiv.",
  keine_anforderung: "Für diesen Monat gibt es keine Anforderung dieser Art.",
  bedarf_nicht_festgelegt: "Bei mindestens einem Dienst ist der Bedarf nicht festgelegt.",
  vorgaben_nicht_vollstaendig_geprueft: "Die Vorgaben ließen sich nicht vollständig prüfen.",
  nicht_bewertet: "Wünsche bewertet der Planer noch nicht.",
});
/** Ursache einer offenen Stelle (Wertliste BERICHT_URSACHEN des Rechenkerns). */
export const BERICHT_URSACHE_TEXT = Object.freeze({
  besetzt: "Bei der Nachrechnung ist die Stelle besetzt.",
  direktMoeglich: "Es gibt Personen ohne Regelhindernis; die Besetzung ist eine Frage der Planung, nicht einer Regel.",
  hindernisse: "Alle verfügbaren Personen scheitern an Regeln.",
  keinPersonal: "Es gibt keine Person, die für diesen Dienst in Frage kommt.",
  unvollstaendig: "Die Ursache ließ sich nicht vollständig bestimmen.",
  qualifikationFehlt: "Die nötige Qualifikation ist nicht ausreichend vorhanden.",
});
/** Grund, den der Planer für eine offene Stelle nennt (Wertliste BERICHT_GRUENDE des Rechenkerns). */
export const BERICHT_STELLE_GRUND_TEXT = Object.freeze({
  aufwand: "Der Rechenaufwand reichte nicht aus, diese Stelle zu besetzen.",
  vorgabe: "Eine Vorgabe des Betriebs verhindert die Einteilung.",
  verdraengung: "Eine andere Einteilung hat Vorrang.",
  folgeVorwaerts: "Die Einteilung würde an einem Folgetag eine Regel verletzen.",
  nachtfolge: "Die Einteilung würde die Grenze für Nachtdienste in Folge verletzen.",
  ersatzruhe: "Die Einteilung würde den Anspruch auf Ersatzruhe verletzen.",
  sonntagsfrei: "Die Einteilung würde die Regel zu freien Sonntagen verletzen.",
  unbekannt: "Der Grund ließ sich nicht bestimmen.",
});
/** Kein Bericht: Grund (feste Kennungen des Servers, server/lib/planer-aktion.mjs BERICHT_FEHLER; „anderer_monat“ entscheidet die Oberfläche). */
export const BERICHT_NICHT_VERFUEGBAR = Object.freeze({
  aufwand: "Der Rechenaufwand für diesen Monat ist zu groß.",
  ergebnis_passt_nicht: "Das Ergebnis passt nicht zum aktuellen Plan.",
  fehler: "Bei der Berechnung ist ein Fehler aufgetreten.",
  bericht_ungueltig: "Der Bericht war nicht lesbar.",
  anderer_monat: "Der Bericht gehört zu einem anderen Monat.",
});

const hat = (t, k) => typeof k === "string" && Object.hasOwn(t, k);
/** „Do 03.12.“ */
const tagText = (d) => `${DOW[dow(d)]} ${fKurz(d)}`;
const personen = (n) => `${n} ${n === 1 ? "Person" : "Personen"}`;
const NAME = (liste, id, fallback) => {
  const x = (Array.isArray(liste) ? liste : []).find((e) => istObjekt(e) && String(e.id) === String(id));
  return x && typeof x.name === "string" && x.name.trim() ? x.name.trim() : fallback;
};
/** Anzeigetext einer Regelkennung aus dem Befundkatalog; unbekannt: neutral. Bindende (sperrende) Regeln sind gekennzeichnet. */
function regelText(k) {
  if (!hat(BEFUND_KATALOG, k)) return `„Regel ${NEUTRAL}“`;
  const e = /** @type {any} */ (BEFUND_KATALOG)[k];
  return `„${e.text}“${e.sperrt ? ` (${BERICHT_TEXTE.bindend})` : ""}`;
}
const regelnText = (regeln) => (Array.isArray(regeln) && regeln.length ? `${regeln.length === 1 ? "die Regel" : "die Regeln"} ${regeln.map(regelText).join(" und ")}` : `eine Regel ${NEUTRAL}`);

/** Kein Bericht: ehrlicher Hinweis mit Grund (nie der Rohtext oder die Rohkennung des Servers). */
export function berichtNichtVerfuegbar(grund) {
  const g = hat(BERICHT_NICHT_VERFUEGBAR, grund) ? BERICHT_NICHT_VERFUEGBAR[grund] : "Grund nicht bekannt";
  return { verfuegbar: false, text: `${BERICHT_TEXTE.nichtVerfuegbar} (${g}). ${BERICHT_TEXTE.vorschlagBleibt}` };
}

/** Pflichttext zu „erfüllt“ bei Gesetz, Muss und Soll: nur die eigenen Einteilungen sind geprüft. */
export function pflichtText(kategorie, n) {
  const einteilungen = n === 1 ? "der 1 vorgeschlagenen Einteilung" : `den ${n} vorgeschlagenen Einteilungen`;
  return `Keine ${NUR_VORSCHLAG_WORT[kategorie]} in ${einteilungen} – Bestand nicht geprüft`;
}

/** Eine Kategorie: Anzeigestatus (nie „erfüllt“ ohne lesbare Zahlen; Gesetz, Muss, Soll nie „erfüllt“ allein), Zählzeilen, Hinweis. */
function kategorieAnzeige(k, m) {
  const name = k.kategorie;
  let status = hat(BERICHT_STATUS_TEXT, k.status) && k.status !== "erfuellt_im_vorschlag" ? k.status : "nicht-bewertbar";
  const zeilen = [];
  let hinweis = null, lesbar = true;
  if (NUR_VORSCHLAG.includes(name)) {
    const n = zahl(k.geprueft), v = zahl(k.verletzt);
    lesbar = n !== null && v !== null;
    if (lesbar && status === "erfuellt") { status = "erfuellt_im_vorschlag"; hinweis = pflichtText(name, n); }
    if (lesbar && status === "verletzt") zeilen.push(`${v} ${v === 1 ? "Befund" : "Befunde"} in ${n === 1 ? "der 1 vorgeschlagenen Einteilung" : `den ${n} vorgeschlagenen Einteilungen`}; Bestand nicht geprüft.`);
    const g = zahl(k.vorgaben);
    if (name !== "gesetz" && g !== null) zeilen.push(`Aktive Vorgaben dieser Art: ${g}.`);
  } else if (name === "qualifikation") {
    const s = zahl(k.stellen), o = zahl(k.offen);
    lesbar = s !== null && o !== null;
    if (lesbar) zeilen.push(`${s} ${s === 1 ? "Stelle" : "Stellen"} mit Qualifikationsbedarf, davon ${o} ohne die nötige Qualifikation.`);
  } else if (name === "besetzung") {
    const s = zahl(k.stellen), vo = zahl(k.voll), o = zahl(k.offen), f = zahl(k.fehlt), b = zahl(k.bedarfOffen);
    lesbar = [s, vo, o, f, b].every((x) => x !== null);
    if (lesbar) {
      zeilen.push(`${vo} von ${s} Stellen voll besetzt.`);
      if (o > 0) zeilen.push(`${o} ${o === 1 ? "Stelle" : "Stellen"} offen; insgesamt ${f === 1 ? "fehlt 1 Person" : `fehlen ${f} Personen`}.`);
      if (b > 0) zeilen.push(`Bei ${b} ${b === 1 ? "Dienst" : "Diensten"} ist der Bedarf nicht festgelegt.`);
    }
  } else if (name === "verteilung") {
    const liste = Array.isArray(k.vorgaben) ? k.vorgaben.filter(istObjekt) : [];
    const e = zahl(k.erfuellt), v = zahl(k.verletzt), nb = zahl(k.nichtBewertbar);
    lesbar = e !== null && v !== null && nb !== null;
    if (lesbar) zeilen.push(`${e} erfüllt, ${v} verletzt, ${nb} nicht bewertbar.`);
    for (const x of liste) {
      const sx = hat(BERICHT_STATUS_TEXT, x.status) && x.status !== "erfuellt_im_vorschlag" ? x.status : "nicht-bewertbar";
      const vname = NAME(m && m.vorgaben, x.vorgabeId, "Verteilungsvorgabe");
      let z = `${vname}: ${BERICHT_STATUS_TEXT[sx]}`;
      if (x.kleineGruppe === true) z += `. ${BERICHT_TEXTE.kleineGruppe}`;
      else {
        const sp = zahl(x.spannweite), mx = zahl(x.maxAbweichung);
        if (sp !== null) z += `. Spannweite ${sp}${mx !== null ? `, erlaubt höchstens ${mx}` : ""}`;
        if (sx === "nicht-bewertbar") z += `. ${grundVorgabeText(x.grund)}`;
      }
      zeilen.push(`${z}${/[.!?]$/.test(z) ? "" : "."}`);
    }
  } else if (name === "wunsch") {
    const g = zahl(k.vorgaben);
    if (g !== null) zeilen.push(`Aktive Wunsch-Vorgaben: ${g}.`);
  }
  if (!lesbar) { zeilen.push(BERICHT_TEXTE.zahlenNichtLesbar); if (status === "erfuellt" || status === "erfuellt_im_vorschlag") { status = "nicht-bewertbar"; hinweis = null; } }
  if (status === "nicht-bewertbar" && !hinweis) hinweis = hat(BERICHT_GRUND_TEXT, k.grund) ? BERICHT_GRUND_TEXT[k.grund] : BERICHT_TEXTE.grundUnbekannt;
  return { kategorie: name, name: BERICHT_KATEGORIE_NAME[name], status, statusText: BERICHT_STATUS_TEXT[status], zeilen, hinweis, massgeblich: false, erstesProblem: false };
}

/** Eine offene Stelle: Wo (Tag, Dienst, was fehlt), Warum (Ursache, kleinste Regelmenge), Wege (Zählungen aus der Nachrechnung). */
function konfliktAnzeige(x, m, i) {
  const dienst = NAME(m && m.dienstarten, x.dienstId, "Dienst");
  const fehlt = zahl(x.fehlt);
  const was = [];
  if (fehlt) was.push(fehlt === 1 ? "1 Person fehlt" : `${fehlt} Personen fehlen`);
  if (x.qualFehlt === true) {
    const q = (Array.isArray(x.fehlendeQualifikationen) ? x.fehlendeQualifikationen : []).filter(istObjekt).map((e) => {
      const nt = zahl(e.noetig), ist = zahl(e.ist);
      return `${NAME(m && m.qualifikationen, e.qid, "Qualifikation")}${nt !== null && ist !== null ? ` (nötig ${nt}, vorhanden ${ist})` : ""}`;
    });
    was.push(`Qualifikation fehlt${q.length ? `: ${q.join(", ")}` : ""}`);
  }
  if (x.bedarfOffen === true) was.push("Bedarf nicht festgelegt");
  const warum = [];
  if (hat(BERICHT_STELLE_GRUND_TEXT, x.grund)) warum.push(BERICHT_STELLE_GRUND_TEXT[x.grund]);
  else if (x.ursache === "grund" || x.grund !== undefined) warum.push(`Grund ${NEUTRAL}.`);
  else warum.push(hat(BERICHT_URSACHE_TEXT, x.ursache) ? BERICHT_URSACHE_TEXT[x.ursache] : `Ursache ${NEUTRAL}.`);
  if (x.ursache === "hindernisse" && Array.isArray(x.regeln) && x.regeln.length) warum.push(`Kleinste Ursache: ${regelnText(x.regeln)}.`);
  if (x.vorgabenUnvollstaendig === true) warum.push(BERICHT_GRUND_TEXT.vorgaben_nicht_vollstaendig_geprueft);
  const wege = [];
  let wegeText = null;
  if (x.wegeStatus === "berechnet") {
    for (const w of (Array.isArray(x.wege) ? x.wege : []).filter(istObjekt)) {
      const p = zahl(w.personen), d = zahl(w.deckt);
      if (p === null) continue;
      wege.push(`Wenn ${regelnText(w.regeln)} nicht gälte, kämen ${personen(p)} in Frage${d !== null && fehlt ? `; das deckt höchstens ${d} von ${fehlt} fehlenden` : ""}.`);
    }
    if (!wege.length) wegeText = BERICHT_TEXTE.wegeLeer;
  } else if (x.wegeStatus === "keine") wegeText = BERICHT_TEXTE.keineWege;
  else wegeText = BERICHT_TEXTE.wegeUnvollstaendig;
  return { key: `${x.datum}|${i}`, wo: `${tagText(x.datum)} · ${dienst}`, was: was.length ? `${was.join("; ")}.` : "", warum, wege, wegeText };
}

/**
 * Die Anzeigeform des Erfüllungsberichts. `bericht` und `grund` stammen aus der Antwort des Servers (`bericht`, `berichtGrund`), `m` ist der eigene
 * Bestand (Namen von Dienst, Qualifikation, Vorgabe), `ym` der angezeigte Monat. Wirft nie.
 * @param {any} bericht @param {any} grund @param {any} m @param {string} [ym]
 * @returns {any}
 */
export function berichtAnzeige(bericht, grund, m, ym) {
  try {
    if (!istObjekt(bericht) || bericht.ok !== true || !Array.isArray(bericht.kategorien) || !Array.isArray(bericht.konflikte)) return berichtNichtVerfuegbar(bericht === null || bericht === undefined ? grund : "bericht_ungueltig");
    const kategorien = BERICHT_RANGFOLGE.map((n) => bericht.kategorien.find((k) => istObjekt(k) && k.kategorie === n)).filter(Boolean).map((k) => kategorieAnzeige(k, m));
    if (!kategorien.length) return berichtNichtVerfuegbar("bericht_ungueltig");
    if (typeof ym === "string" && bericht.ym !== ym) return berichtNichtVerfuegbar("anderer_monat");   // der Bericht gehört zu genau einem Monat
    const markiere = (feld, ref) => {
      const k = istObjekt(ref) ? kategorien.find((x) => x.kategorie === ref.kategorie) : null;
      if (k) k[feld] = true;
      return k ? { kategorie: k.kategorie, name: k.name, status: k.status, statusText: k.statusText } : null;
    };
    const massgeblich = markiere("massgeblich", bericht.massgeblich);
    const erstesProblem = markiere("erstesProblem", bericht.erstesProblem);
    const z = istObjekt(bericht.zusammenfassung) && istObjekt(bericht.zusammenfassung.konflikte) ? bericht.zusammenfassung.konflikte : {};
    const konflikte = bericht.konflikte.filter((x) => istObjekt(x) && typeof x.datum === "string" && TAG.test(x.datum)).map((x, i) => konfliktAnzeige(x, m, i));
    const gesamt = zahl(z.gesamt), gelistet = zahl(z.gelistet), uU = zahl(z.ursacheUnvollstaendig), wU = zahl(z.wegeUnvollstaendig);
    const notizen = [];
    if (z.abgeschnitten === true && gesamt !== null && gelistet !== null) notizen.push(`Es werden ${gelistet} von ${gesamt} offenen Stellen aufgeführt.`);
    if (uU) notizen.push(`Bei ${uU} ${uU === 1 ? "Stelle" : "Stellen"} ließ sich die Ursache nicht vollständig bestimmen.`);
    if (wU) notizen.push(`Bei ${wU} ${wU === 1 ? "Stelle" : "Stellen"} sind die Wege nicht vollständig.`);
    return { verfuegbar: true, massgeblich, erstesProblem, kategorien, konflikte, notizen };
  } catch {
    return berichtNichtVerfuegbar("fehler");
  }
}

/** Zur Prüfung: die Wertlisten des Rechenkerns, für die diese Datei Texte hat. */
export const BERICHT_KENNUNGEN = Object.freeze({ ursachen: BERICHT_URSACHEN, gruende: BERICHT_GRUENDE, aussage: AUSSAGE_VORSCHLAG });
