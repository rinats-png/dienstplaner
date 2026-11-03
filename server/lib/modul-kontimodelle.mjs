/* ==========================================================================
   MODUL KONTIMODELLE — Kontischichtmodelle mit Stufenversatz (WP-19, Strang C; WP-19.12)

   Ein Assistent, kein Prüfer. Er rechnet aus einer Dienstfolge, der Zahl
   der Schichtgruppen und dem Versatz die Kennzahlen eines Modells
   (Wochenstunden, längste Serie, Nachtserie, Nachtstunden, kürzeste Ruhe beim
   Wechsel, Rotationsrichtung, Deckungslücken), schlägt einen gleichmäßigen
   Versatz vor und stellt die Wochenarbeitszeit des Modells der Sollzeit des
   Betriebs gegenüber.

   Nach der Entscheidungsmatrix (WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md):
     K1 a  Kennzahlen zu Nachtarbeit, Schichtrotation und Erholungszeiten sind
           sichtbar. Hinweise zu Serienlängen folgen den Regelwerten
           KONTI-RICHTWERT-SERIE-01 und -NACHT-01 (server/lib/modul-regelwerte.mjs):
           Ausgangswerte 5 und 3 sind ungeprüfte Richtwerte (FN-28); der Betrieb
           kann Wert, Quelle und Fundstelle eintragen. Kein Befund, keine Stufe.
     K2 c  Abweichung von der Sollzeit ausweisen UND Freischichten vorschlagen —
           nie automatisch eintragen. Sollzeit (KONTI-ARBEITSZEIT-01) und
           Freischichtdauer (KONTI-FREISCHICHT-01) sind Angaben des Betriebs aus
           seinem Arbeitszeit- oder Tarifmodell, ohne Ausgangswert (FN-29). Die
           Werte 40 und 8, die die Modul-Registry als vorläufige Vorgabe führt,
           wirken hier NIRGENDS: ohne Sollzeit kein Abgleich, ohne Freischicht-
           dauer kein Vorschlag. Die Übernahme eines Vorschlags braucht eine
           ausdrückliche Bestätigung (freischichtUebernahme).
     K3 a  bei Sonn- und Feiertagsarbeit ein neutraler Hinweis, dass dafür eine
           Ausnahme, Bewilligung oder ein Ausgleich nötig sein kann (FN-30) —
           ohne Aussage darüber, ob das Modell zulässig ist.

   EINE RECHNUNG: Die Kennzahlen rechnet allein kontiKennzahlen. modellPruefen()
   in src/App.jsx ruft sie mit DIENST_VORLAGEN auf (WP-19.12), statt selbst zu
   rechnen; pruefungen/modul-kontimodelle-fertig.test.js hält die Zahlen gegen
   eine Referenz aus dem Code vor der Zusammenführung.

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulEinstellung } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN } from "./branchenkatalog.mjs";
import { regelwertWirksam, regelwertDef, INDUSTRIE_REGELWERTE } from "./modul-regelwerte.mjs";

/**
 * Ein Schichtmodell.
 * @typedef {{ tage: string[], gruppen: number, versatzTage: number, vollkonti?: boolean, dienste?: string[] }} KontiModell
 */
/** @typedef {Record<string, { start: string, ende: string }>} Dienstzeiten */

const SERIE_ID = "KONTI-RICHTWERT-SERIE-01";
const NACHT_ID = "KONTI-RICHTWERT-NACHT-01";
const SOLL_ID = "KONTI-ARBEITSZEIT-01";
const FS_ID = "KONTI-FREISCHICHT-01";

/**
 * Ausgangswerte der Richtwerte für Hinweise — arbeitswissenschaftliche
 * Empfehlungen, kein Gesetz (§ 6 Abs. 1 ArbZG verweist auf „gesicherte
 * arbeitswissenschaftliche Erkenntnisse", ohne Zahlen zu nennen). Ungeprüft
 * (FN-28). Die Zahlen stehen nur in den Regelwerten; der Betrieb überschreibt sie.
 */
export const KONTI_RICHTWERTE = Object.freeze({
  serie: /** @type {number} */ (INDUSTRIE_REGELWERTE[SERIE_ID].ausgangswert),
  nachtserie: /** @type {number} */ (INDUSTRIE_REGELWERTE[NACHT_ID].ausgangswert),
});

/** Grenzen der Eingabe des Assistenten (gegen unsinnige oder teure Eingaben). */
export const KONTI_GRENZEN = Object.freeze({ gruppenMax: 40, zyklusMax: 366 });

/** Wochen je Jahr beim Jahresabgleich — eine Rechengröße, die die Oberfläche mit ausweist. */
export const KONTI_WOCHEN_JE_JAHR = 52;

const FREI = (t) => !t || t === "-";
const toMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
const dauerH = (d) => { let x = toMin(d.ende) - toMin(d.start); if (x <= 0) x += 1440; return x / 60; };
/** Stunden eines Dienstes im Nachtfenster 23–6 Uhr (wie bisher modellPruefen). */
const nachtH = (d) => {
  const s = toMin(d.start); let e = toMin(d.ende); if (e <= s) e += 1440;
  let sum = 0; for (const [a, b] of [[0, 360], [1380, 1800]]) sum += Math.max(0, Math.min(e, b) - Math.max(s, a));
  return sum / 60;
};
const mod = (a, n) => ((a % n) + n) % n;
const r2 = (x) => Math.round(x * 100) / 100;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const hat = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/**
 * Prüft die Eingabe des Assistenten. Liefert den Grund, sonst null.
 * @param {any} modell
 * @returns {string | null}
 */
export function pruefeKontiModell(modell) {
  if (!modell || typeof modell !== "object") return "Kein Modell angegeben.";
  const { tage, gruppen, versatzTage } = modell;
  if (!Array.isArray(tage) || !tage.length || tage.length > KONTI_GRENZEN.zyklusMax)
    return `Die Dienstfolge braucht 1 bis ${KONTI_GRENZEN.zyklusMax} Tage.`;
  if (tage.some((t) => typeof t !== "string" || t.length > 12)) return "Jeder Tag der Folge ist eine Dienstkennung oder „-“.";
  if (!Number.isInteger(gruppen) || gruppen < 1 || gruppen > KONTI_GRENZEN.gruppenMax)
    return `Die Zahl der Gruppen liegt zwischen 1 und ${KONTI_GRENZEN.gruppenMax}.`;
  if (!Number.isInteger(versatzTage) || versatzTage < 0 || versatzTage >= KONTI_GRENZEN.zyklusMax)
    return "Der Versatz ist eine ganze Zahl von Tagen ab 0.";
  return null;
}

/** Wie viele Gruppen je Dienst an Tag i im Dienst sind. */
function besetzungAm(modell, i) {
  const len = modell.tage.length;
  /** @type {Record<string, number>} */
  const z = {};
  for (let g = 0; g < modell.gruppen; g++) {
    const t = modell.tage[mod(i - g * modell.versatzTage, len)];
    if (!FREI(t)) z[t] = (z[t] || 0) + 1;
  }
  return z;
}

/**
 * Kennzahlen eines Modells — die eine Rechnung (siehe Kopf).
 * @param {KontiModell} modell
 * @param {Dienstzeiten} dienstzeiten
 */
export function kontiKennzahlen(modell, dienstzeiten) {
  const len = modell.tage.length;
  const dienste = modell.dienste && modell.dienste.length ? modell.dienste
    : [...new Set(modell.tage.filter((t) => !FREI(t)))];
  const da = (k) => (dienstzeiten && Object.prototype.hasOwnProperty.call(dienstzeiten, k) ? dienstzeiten[k] : null);
  const unbekannteDienste = [...new Set(modell.tage.filter((t) => !FREI(t) && !da(t)))];
  const werktag = (i) => modell.vollkonti || i % 7 < 5;          // Wochenende ohne Vollkonti ist Absicht

  /** @type {Record<string, number>} */
  const luecken = Object.fromEntries(dienste.map((d) => [d, 0]));
  /** @type {Record<string, number>[]} */
  const proTag = [];
  for (let i = 0; i < len; i++) {
    const z = besetzungAm(modell, i);
    proTag.push(z);
    if (!werktag(i)) continue;
    for (const d of dienste) if (!z[d]) luecken[d]++;
  }

  let stunden = 0, anzahl = 0, nachtStd = 0;
  for (const t of modell.tage) if (!FREI(t) && da(t)) { stunden += dauerH(da(t)); nachtStd += nachtH(da(t)); anzahl++; }

  const rang = Object.fromEntries(dienste.map((d, i) => [d, i]));
  let maxSerie = 0, serie = 0, maxNacht = 0, nserie = 0, ruheUnter11 = 0, einzel = 0, rueckwaerts = 0, vorwaerts = 0, nachtDienste = 0;
  let kuerzesteRuhe = Infinity;
  for (let i = 0; i < len; i++) {
    const c = modell.tage[i], nx = modell.tage[(i + 1) % len], pv = modell.tage[mod(i - 1, len)];
    if (FREI(c)) { serie = 0; nserie = 0; continue; }
    serie++; maxSerie = Math.max(maxSerie, serie);
    if (da(c) && nachtH(da(c)) >= 2) { nserie++; nachtDienste++; maxNacht = Math.max(maxNacht, nserie); } else nserie = 0;
    if (FREI(pv) && FREI(nx)) einzel++;
    if (!FREI(nx) && da(c) && da(nx)) {
      let e = toMin(da(c).ende); if (e <= toMin(da(c).start)) e += 1440;
      const ruhe = (1440 + toMin(da(nx).start) - e) / 60;
      if (ruhe < 11) ruheUnter11++;
      if (ruhe < kuerzesteRuhe) kuerzesteRuhe = ruhe;
      if (rang[nx] !== undefined && rang[c] !== undefined) {
        if (rang[nx] < rang[c]) rueckwaerts++;
        else if (rang[nx] > rang[c]) vorwaerts++;
      }
    }
  }

  /** @type {Record<string, number>} */
  const mindestJeDienst = {};
  for (const d of dienste) {
    const werte = proTag.map((z, i) => (werktag(i) ? (z[d] || 0) : null)).filter((x) => x !== null);
    mindestJeDienst[d] = werte.length ? Math.min(...werte) : 0;
  }

  /* Sonntagsarbeit: über sieben Zyklen, damit jeder Wochentag jede Stelle trifft. */
  let sonntagsarbeit = false;
  for (let i = 6; i < 7 * len && !sonntagsarbeit; i += 7) sonntagsarbeit = Object.keys(besetzungAm(modell, i)).length > 0;

  const rotation = vorwaerts && rueckwaerts ? "gemischt" : vorwaerts ? "vorwaerts" : rueckwaerts ? "rueckwaerts" : "keine";
  return { zyklus: len, wochenstunden: r2(stunden / (len / 7)), dienste: anzahl,
    luecken: Object.values(luecken).reduce((a, b) => a + b, 0),
    maxSerie, maxNacht, ruheUnter11, einzel, rueckwaerts, vorwaerts, rotation, nachtDienste,
    nachtStundenWoche: r2(nachtStd / (len / 7)), kuerzesteRuhe: kuerzesteRuhe === Infinity ? null : r2(kuerzesteRuhe),
    mindestJeDienst, sonntagsarbeit, unbekannteDienste, proTag };
}

/**
 * Schlägt den Versatz vor, bei dem jeder Dienst an jedem Tag gleich oft
 * besetzt ist. Zuerst Zykluslänge / Gruppen, dann jeder andere Versatz.
 * @param {string[]} tage
 * @param {number} gruppen
 * @returns {{ versatzTage: number|null, gleichmaessig: boolean, besetzung?: Record<string, number>, grund?: string }}
 */
export function versatzVorschlag(tage, gruppen) {
  const len = tage.length;
  const kandidaten = [];
  if (len % gruppen === 0) kandidaten.push(len / gruppen);
  for (let v = 1; v < len; v++) if (!kandidaten.includes(v)) kandidaten.push(v);
  const dienste = [...new Set(tage.filter((t) => !FREI(t)))];
  for (const v of kandidaten) {
    const m = { tage, gruppen, versatzTage: v };
    const erster = besetzungAm(m, 0);
    let gleich = dienste.every((d) => (erster[d] || 0) > 0);
    for (let i = 1; i < len && gleich; i++) {
      const z = besetzungAm(m, i);
      gleich = dienste.every((d) => (z[d] || 0) === (erster[d] || 0));
    }
    if (gleich) return { versatzTage: v, gleichmaessig: true, besetzung: erster };
  }
  return { versatzTage: len % gruppen === 0 ? len / gruppen : null, gleichmaessig: false,
    grund: `Mit ${gruppen} Gruppen und ${len} Tagen Folge gibt es keinen Versatz, der jeden Dienst täglich gleich besetzt.` };
}

/**
 * Die Schichtfolge je Gruppe über `anzahlTage` Tage.
 * @param {{ tage: string[], gruppen: number, versatzTage: number }} modell
 * @param {number} anzahlTage
 * @returns {string[][]}
 */
export function kontiSchichtfolge(modell, anzahlTage) {
  const len = modell.tage.length;
  const zeilen = [];
  for (let g = 0; g < modell.gruppen; g++) {
    const z = [];
    for (let i = 0; i < anzahlTage; i++) z.push(modell.tage[mod(i - g * modell.versatzTage, len)]);
    zeilen.push(z);
  }
  return zeilen;
}

/**
 * Wochenarbeitszeit des Modells gegen eine Sollzeit (K2 c) — die reine Rechnung.
 * Freischichten werden nur vorgeschlagen (abgerundet), nie eingetragen.
 * Welche Sollzeit gilt, entscheidet kontiAbgleich aus den Angaben des Betriebs.
 * @param {{ wochenstunden: number }} kennzahlen
 * @param {number|null} sollWochenstunden
 * @param {number} stundenJeFreischicht
 */
export function jahresabgleich(kennzahlen, sollWochenstunden, stundenJeFreischicht) {
  if (!Number.isFinite(sollWochenstunden) || !(sollWochenstunden > 0))
    return { offen: true, text: "Ohne Sollzeit lässt sich die Jahresarbeitszeit nicht abgleichen.", eingetragen: false };
  const differenzJahr = r2((kennzahlen.wochenstunden - sollWochenstunden) * KONTI_WOCHEN_JE_JAHR);
  const freischichtenVorschlag = differenzJahr > 0 && stundenJeFreischicht > 0
    ? Math.floor(differenzJahr / stundenJeFreischicht + 1e-9) : 0;
  return { offen: false, differenzJahr, freischichtenVorschlag, eingetragen: false };
}

/* ---------------------------------------------------------------------------
   K2: Sollzeit und Freischichtdauer als Angaben des Betriebs
   --------------------------------------------------------------------------- */

/**
 * Sollzeit und Freischichtdauer des Betriebs — nie ein stiller Standard.
 * Reihenfolge: Regelwert des Betriebs (mit Quelle) → ausdrücklich gespeicherter
 * Modulparameter (Altweg, ohne Quelle) → nicht gesetzt. Die Vorgaben 40 und 8
 * der Modul-Registry werden bewusst NICHT gelesen.
 * @param {any} m Betrieb
 * @param {string} [heute]
 */
export function kontiParameter(m, heute) {
  const e = modulEinstellung(m, "kontimodelle");
  const gespeichert = e && istObjekt(e.parameter) ? e.parameter : {};
  const feld = (regelId, name) => {
    const w = regelwertWirksam(m, regelId, heute);
    if (w.herkunft === "betrieb") return w;
    const d = regelwertDef(regelId);
    const v = hat(gespeichert, name) ? gespeichert[name] : null;
    if (d && typeof v === "number" && Number.isFinite(v) && v >= d.min && v <= d.max)
      return { ...w, wert: v, herkunft: "modulparameter", pruefstatus: "provisional", geprueft: false, quelle: null, fundstelle: null, version: null,
        hinweis: "Angabe des Betriebs ohne Quelle, nicht geprüft" };
    return w;
  };
  return { sollWochenstunden: feld(SOLL_ID, "sollWochenstunden"), stundenJeFreischicht: feld(FS_ID, "stundenJeFreischicht") };
}

const herkunftText = (p) => {
  if (p.herkunft === "modulparameter") return "Angabe ohne Quelle; nicht geprüft";
  const q = [p.quelle, p.fundstelle].filter(Boolean).join(", ");
  return `${q || "ohne Quelle"}; ${p.geprueft ? "geprüft" : "nicht geprüft"}`;
};

/**
 * Jahresabgleich eines Modells gegen die Sollzeit des Betriebs (K2 c).
 * Ohne Sollzeit gibt es keinen Abgleich, ohne Freischichtdauer keinen Vorschlag.
 * Nie verbindlich, nie eingetragen.
 * @param {any} m Betrieb
 * @param {{ wochenstunden: number }} kennzahlen
 * @param {string} [heute]
 */
export function kontiAbgleich(m, kennzahlen, heute) {
  const p = kontiParameter(m, heute);
  const soll = p.sollWochenstunden, fs = p.stundenJeFreischicht;
  if (soll.wert === null)
    return { offen: true, grund: "sollzeit-fehlt", eingetragen: false, verbindlich: false,
      text: "Sollzeit nicht hinterlegt — ohne die Wochenarbeitszeit aus Arbeitsvertrag, Tarif oder Betriebsvereinbarung gibt es keinen Abgleich (FN-29)." };
  const differenzJahr = r2((kennzahlen.wochenstunden - soll.wert) * KONTI_WOCHEN_JE_JAHR);
  let freischichtenVorschlag = null, freischichtHinweis = null;
  if (fs.wert === null) freischichtHinweis = "Dauer einer Freischicht nicht hinterlegt — kein Vorschlag für Freischichten (FN-29).";
  else freischichtenVorschlag = differenzJahr > 0 ? Math.floor(differenzJahr / fs.wert + 1e-9) : 0;
  const geprueft = soll.geprueft && (fs.wert === null || fs.geprueft);
  const teile = [`Sollzeit ${soll.wert} Stunden je Woche (${herkunftText(soll)})`];
  if (fs.wert !== null) teile.push(`Freischicht ${fs.wert} Stunden (${herkunftText(fs)})`);
  return { offen: false, sollWochenstunden: soll.wert, stundenJeFreischicht: fs.wert, differenzJahr, freischichtenVorschlag, freischichtHinweis,
    wochenJeJahr: KONTI_WOCHEN_JE_JAHR, eingetragen: false, verbindlich: false, geprueft,
    hinweis: `${teile.join("; ")}.${geprueft ? "" : " Angaben des Betriebs, nicht geprüft."}` };
}

/**
 * Darf ein Vorschlag übernommen werden? Nur auf ausdrückliche Bestätigung
 * (`bestaetigt === true`), nur mit einem Vorschlag über null, nie bei offenem
 * Abgleich. Die Funktion trägt nichts ein; sie sagt, ob der Aufrufer es darf.
 * @param {any} abgleich Ergebnis von kontiAbgleich
 * @param {{ bestaetigt?: any }} [o]
 */
export function freischichtUebernahme(abgleich, { bestaetigt } = {}) {
  if (!abgleich || abgleich.offen) return { ok: false, grund: "Es liegt kein Abgleich vor." };
  if (!(abgleich.freischichtenVorschlag > 0)) return { ok: false, grund: "Es gibt keinen Vorschlag zu übernehmen." };
  if (bestaetigt !== true) return { ok: false, grund: "Die Übernahme braucht eine ausdrückliche Bestätigung." };
  return { ok: true, vorschlag: { anzahl: abgleich.freischichtenVorschlag, stundenJeFreischicht: abgleich.stundenJeFreischicht,
    sollWochenstunden: abgleich.sollWochenstunden, differenzJahr: abgleich.differenzJahr, hinweis: abgleich.hinweis } };
}

/**
 * Die Regelwerte des Moduls mit Herkunft — für die Oberfläche, ohne Rechtsbehauptung.
 * @param {any} m
 * @param {string} [heute]
 */
export function kontiAuskunft(m, heute) {
  return Object.values(INDUSTRIE_REGELWERTE).filter((d) => d.modul === "kontimodelle")
    .map((d) => {
      const w = regelwertWirksam(m, d.id, heute);
      const r = REGELN_BRANCHEN.find((x) => x.id === d.id);
      return { regelId: d.id, bezeichnung: d.bezeichnung, wert: w.wert, einheit: d.einheit, herkunft: w.herkunft, pruefstatus: w.pruefstatus,
        geprueft: w.geprueft, quelle: w.quelle, fundstelle: w.fundstelle, version: w.version, gueltigAb: w.gueltigAb, gueltigBis: w.gueltigBis,
        hoechsteStufe: r ? r.hoechsteStufe : "hinweis", fachnachweis: d.fachnachweis, hinweis: w.herkunft === "ausgangswert" ? d.ausgangswertText : w.hinweis };
    })
    .sort((a, b) => (a.regelId < b.regelId ? -1 : 1));
}

/* ---------------------------------------------------------------------------
   K1, K3: Hinweise
   --------------------------------------------------------------------------- */

/** Der Zusatz zu einem Richtwert: ungeprüfter Ausgangswert, Wert des Betriebs oder geprüfter Wert. */
function richtwertText(w) {
  if (w.herkunft === "ausgangswert") return `Richtwert ${w.wert} (ungeprüft, keine Rechtsvorschrift, ${w.fachnachweis})`;
  const q = [w.quelle, w.fundstelle].filter(Boolean).join(", ");
  return `Richtwert des Betriebs ${w.wert} (${q ? `Quelle: ${q}; ` : "ohne Quelle; "}${w.geprueft ? "geprüft" : "nicht geprüft"})`;
}

/**
 * Hinweistexte zum Modell (K1 a, K3 a). Keine Stufe, kein Befund. Serien-
 * Richtwerte aus den Regelwerten des Betriebs (`m`), sonst die Ausgangswerte.
 * @param {ReturnType<typeof kontiKennzahlen>} k
 * @param {KontiModell} modell
 * @param {{ m?: any, heute?: string }} [o]
 * @returns {{ kennung: string, text: string, regelId?: string, pruefstatus?: string }[]}
 */
export function kontiHinweise(k, modell, { m = null, heute } = {}) {
  const aus = [];
  const se = regelwertWirksam(m || {}, SERIE_ID, heute), na = regelwertWirksam(m || {}, NACHT_ID, heute);
  if (k.maxSerie > /** @type {number} */ (se.wert))
    aus.push({ kennung: "serie", regelId: SERIE_ID, pruefstatus: se.pruefstatus,
      text: `${k.maxSerie} Dienste am Stück. ${richtwertText(se)}: höchstens ${se.wert}.` });
  if (k.maxNacht > /** @type {number} */ (na.wert))
    aus.push({ kennung: "nachtserie", regelId: NACHT_ID, pruefstatus: na.pruefstatus,
      text: `${k.maxNacht} Nachtdienste am Stück. ${richtwertText(na)}: höchstens ${na.wert}.` });
  if (k.rueckwaerts > 0)
    aus.push({ kennung: "rueckwaerts", text: `${k.rueckwaerts} Wechsel gegen die Reihenfolge Früh – Spät – Nacht. Vorwärts wechselnde Folgen gelten als verträglicher.` });
  if (k.ruheUnter11 > 0)
    aus.push({ kennung: "ruhezeit", text: `${k.ruheUnter11} Wechsel mit weniger als elf Stunden Ruhe (§ 5 ArbZG). Die Planprüfung meldet das bei der Einteilung.` });
  if (k.luecken > 0)
    aus.push({ kennung: "luecken", text: `${k.luecken} Dienst-Tage ohne Gruppe im Zyklus. Prüfe Gruppenzahl und Versatz.` });
  if (k.unbekannteDienste.length)
    aus.push({ kennung: "unbekannt", text: `Dienstarten ohne Zeiten: ${k.unbekannteDienste.join(", ")} — Stunden und Ruhezeit dazu sind nicht bewertbar.` });
  if (k.sonntagsarbeit || modell.vollkonti)
    aus.push({ kennung: "sonntag",
      text: "Das Modell plant Arbeit an Sonn- und Feiertagen. Dafür kann eine Ausnahme, eine Bewilligung oder ein Ausgleich (etwa Ersatzruhetage) nach dem Arbeitszeitgesetz nötig sein (§§ 9 bis 13 ArbZG). Voraussetzungen im Einzelfall prüfen (FN-30); dieser Hinweis bewertet das Modell nicht." });
  return aus;
}
