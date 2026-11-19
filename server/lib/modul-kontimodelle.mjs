/* ==========================================================================
   MODUL KONTIMODELLE — Kontischichtmodelle mit Stufenversatz (WP-19, Strang C)

   Ein Assistent, kein Prüfer. Er rechnet aus einer Dienstfolge, der Zahl
   der Schichtgruppen und dem Versatz die Kennzahlen eines Modells
   (Wochenstunden, längste Serie, Nachtserie, Ruhezeit beim Wechsel,
   Rückwärtswechsel, Deckungslücken), schlägt einen gleichmäßigen Versatz
   vor und stellt die Wochenarbeitszeit des Modells der Sollzeit gegenüber.

   Nach der Entscheidungsmatrix (Empfehlungen, vorläufig bis zur
   Nutzerentscheidung):
     K1 a  arbeitswissenschaftliche Empfehlungen nur als Kennzahl und
           Hinweistext — keine Registerregel, keine Stufe, kein Befund;
     K2 c  Abweichung von der Sollzeit ausweisen UND Freischichten
           vorschlagen — nie automatisch eintragen;
     K3 a  bei Sonn- und Feiertagsarbeit ein Hinweis auf die
           Ausnahmegrundlage (§§ 9–13 ArbZG, im Einzelfall zu prüfen).

   Die Rechnung entspricht modellPruefen() in src/App.jsx (Modellvorlagen),
   nimmt die Dienstarten aber als Argument statt aus DIENST_VORLAGEN. Die
   Vorlagen werden in pruefungen/modul-kontimodelle.test.js mit ihren dort
   dokumentierten Kennzahlen nachgerechnet. Sobald das Modul „vorläufig"
   wird, ruft modellPruefen diese Fassung auf (eine Rechnung, nicht zwei).

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */

/**
 * Ein Schichtmodell.
 * @typedef {{ tage: string[], gruppen: number, versatzTage: number, vollkonti?: boolean, dienste?: string[] }} KontiModell
 */
/** @typedef {Record<string, { start: string, ende: string }>} Dienstzeiten */

/**
 * Richtwerte für Hinweise — arbeitswissenschaftliche Empfehlungen, kein
 * Gesetz (§ 6 Abs. 1 ArbZG verweist auf „gesicherte arbeitswissenschaftliche
 * Erkenntnisse", ohne Zahlen zu nennen). Vorläufig bis zur Nutzerentscheidung.
 */
export const KONTI_RICHTWERTE = Object.freeze({ serie: 5, nachtserie: 3 });

/** Grenzen der Eingabe des Assistenten (gegen unsinnige oder teure Eingaben). */
export const KONTI_GRENZEN = Object.freeze({ gruppenMax: 40, zyklusMax: 366 });

const FREI = (t) => !t || t === "-";
const toMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
const dauerH = (d) => { let x = toMin(d.ende) - toMin(d.start); if (x <= 0) x += 1440; return x / 60; };
/** Stunden eines Dienstes im Nachtfenster 23–6 Uhr (wie modellPruefen). */
const nachtH = (d) => {
  const s = toMin(d.start); let e = toMin(d.ende); if (e <= s) e += 1440;
  let sum = 0; for (const [a, b] of [[0, 360], [1380, 1800]]) sum += Math.max(0, Math.min(e, b) - Math.max(s, a));
  return sum / 60;
};
const mod = (a, n) => ((a % n) + n) % n;
const r2 = (x) => Math.round(x * 100) / 100;

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
 * Kennzahlen eines Modells.
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

  let stunden = 0, anzahl = 0;
  for (const t of modell.tage) if (!FREI(t) && da(t)) { stunden += dauerH(da(t)); anzahl++; }

  const rang = Object.fromEntries(dienste.map((d, i) => [d, i]));
  let maxSerie = 0, serie = 0, maxNacht = 0, nserie = 0, ruheUnter11 = 0, einzel = 0, rueckwaerts = 0;
  for (let i = 0; i < len; i++) {
    const c = modell.tage[i], nx = modell.tage[(i + 1) % len], pv = modell.tage[mod(i - 1, len)];
    if (FREI(c)) { serie = 0; nserie = 0; continue; }
    serie++; maxSerie = Math.max(maxSerie, serie);
    if (da(c) && nachtH(da(c)) >= 2) { nserie++; maxNacht = Math.max(maxNacht, nserie); } else nserie = 0;
    if (FREI(pv) && FREI(nx)) einzel++;
    if (!FREI(nx) && da(c) && da(nx)) {
      let e = toMin(da(c).ende); if (e <= toMin(da(c).start)) e += 1440;
      if ((1440 + toMin(da(nx).start) - e) / 60 < 11) ruheUnter11++;
      if (rang[nx] !== undefined && rang[c] !== undefined && rang[nx] < rang[c]) rueckwaerts++;
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

  return { zyklus: len, wochenstunden: r2(stunden / (len / 7)), dienste: anzahl,
    luecken: Object.values(luecken).reduce((a, b) => a + b, 0),
    maxSerie, maxNacht, ruheUnter11, einzel, rueckwaerts, mindestJeDienst, sonntagsarbeit, unbekannteDienste, proTag };
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
 * Wochenarbeitszeit des Modells gegen die Sollzeit (K2 c). Freischichten
 * werden nur vorgeschlagen (abgerundet), nie eingetragen.
 * @param {{ wochenstunden: number }} kennzahlen
 * @param {number|null} sollWochenstunden
 * @param {number} stundenJeFreischicht
 */
export function jahresabgleich(kennzahlen, sollWochenstunden, stundenJeFreischicht) {
  if (!Number.isFinite(sollWochenstunden) || !(sollWochenstunden > 0))
    return { offen: true, text: "Ohne Sollzeit lässt sich die Jahresarbeitszeit nicht abgleichen.", eingetragen: false };
  const differenzJahr = r2((kennzahlen.wochenstunden - sollWochenstunden) * 52);
  const freischichtenVorschlag = differenzJahr > 0 && stundenJeFreischicht > 0
    ? Math.floor(differenzJahr / stundenJeFreischicht + 1e-9) : 0;
  return { offen: false, differenzJahr, freischichtenVorschlag, eingetragen: false };
}

/**
 * Hinweistexte zum Modell (K1 a, K3 a). Keine Stufe, kein Befund.
 * @param {ReturnType<typeof kontiKennzahlen>} k
 * @param {KontiModell} modell
 * @returns {{ kennung: string, text: string }[]}
 */
export function kontiHinweise(k, modell) {
  const aus = [];
  if (k.maxSerie > KONTI_RICHTWERTE.serie)
    aus.push({ kennung: "serie", text: `${k.maxSerie} Dienste am Stück. Arbeitswissenschaftlich empfohlen sind höchstens ${KONTI_RICHTWERTE.serie} (Richtwert, kein Gesetz).` });
  if (k.maxNacht > KONTI_RICHTWERTE.nachtserie)
    aus.push({ kennung: "nachtserie", text: `${k.maxNacht} Nachtdienste am Stück. Empfohlen sind höchstens ${KONTI_RICHTWERTE.nachtserie} (Richtwert, § 6 Abs. 1 ArbZG).` });
  if (k.rueckwaerts > 0)
    aus.push({ kennung: "rueckwaerts", text: `${k.rueckwaerts} Wechsel gegen die Reihenfolge Früh – Spät – Nacht. Vorwärts wechselnde Folgen gelten als verträglicher.` });
  if (k.ruheUnter11 > 0)
    aus.push({ kennung: "ruhezeit", text: `${k.ruheUnter11} Wechsel mit weniger als elf Stunden Ruhe (§ 5 ArbZG). Die Planprüfung meldet das bei der Einteilung.` });
  if (k.luecken > 0)
    aus.push({ kennung: "luecken", text: `${k.luecken} Dienst-Tage ohne Gruppe im Zyklus. Prüfe Gruppenzahl und Versatz.` });
  if (k.unbekannteDienste.length)
    aus.push({ kennung: "unbekannt", text: `Dienstarten ohne Zeiten: ${k.unbekannteDienste.join(", ")} — Stunden und Ruhezeit dazu sind nicht bewertbar.` });
  if (k.sonntagsarbeit || modell.vollkonti)
    aus.push({ kennung: "sonntag", text: "Das Modell plant Arbeit an Sonn- und Feiertagen. Sie ist nur mit einer Ausnahme nach §§ 10, 13 ArbZG zulässig (etwa ununterbrochene Produktion oder Bewilligung); Ersatzruhetage nach § 11 Abs. 3 ArbZG. Im Einzelfall prüfen." });
  return aus;
}
