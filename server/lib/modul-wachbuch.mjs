/* ==========================================================================
   MODUL WACHBUCH — fortlaufende Einträge je Objekt (WP-19, Strang A)

   Nach der Entscheidungsmatrix (vorläufig bis zur Nutzerentscheidung):
     W1 a  Eigenes Betriebsfeld `wachbuch`, Form { "<Kennung>|JJJJ-MM-TT": Eintrag }.
           Die Form ist die des Löschlaufs und des Ausnahmewegs (personenfelder,
           aufbewahrung.mjs, modulschreibwege.mjs); Listen kennt der Löschlauf nicht.
           Eigene Wachbuchansicht; das Dienstbuch bleibt unverändert.
     W2 a  Ein gespeicherter Eintrag wird nie geändert oder entfernt. Korrektur
           nur über einen Nachtrag (`nachtragZu`). Verfasser und Erfassungszeit
           setzt der Server; die Uhrzeit des Ereignisses trägt die Person ein.
           Berichtigung über den Ausnahmeweg ist nicht vorgesehen (Wertschema
           gibt es nicht); Löschung nur über den Ausnahmeweg oder den Löschlauf.
     W4 a+b Lesen nach Zugriffsstufe: Planung/Leitung alle, Schichtverantwortung
           nur die eigene Einheit, Beschäftigte nur eigene Einträge, Betriebsrat
           und Kunde nichts. Die Zuordnung Rolle → Stufe steht in
           WACHBUCH_ZUGRIFF; die Zeile in RECHTEMATRIX.md ist offen.
     W5 b  Kontrollgang-Lücken werden nur mit gesetztem Intervall gemeldet
           (Vorgabe 0 = aus). Kein Intervall ist eine Vorgabe des Betriebs,
           keine Rechtsvorschrift.
   Aufbewahrungsfristen (W3) sind nicht festgelegt: dieses Modul löscht nichts.

   Rein: keine Ablage, keine Uhr (die Zeit kommt als Argument).
   ========================================================================== */

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const echterTag = (s) => { if (typeof s !== "string" || !TAG.test(s)) return false; const t = new Date(`${s}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };
const minuten = (z) => Number(z.slice(0, 2)) * 60 + Number(z.slice(3, 5));
const idOk = (s) => typeof s === "string" && s.length >= 1 && s.length <= 60;

export const WACHBUCH_ARTEN = Object.freeze(["vorkommnis", "kontrollgang", "uebergabe", "hinweis"]);
export const WACHBUCH_GRENZEN = Object.freeze({ eintraege: 20_000, textMax: 1000, spanneTage: 366 });
export const WACHBUCH_FELDER = Object.freeze(["id", "datum", "uhrzeit", "objektId", "art", "text", "einheitId", "vonId", "erfasst", "nachtragZu"]);

/**
 * Zugriffsstufe je Rolle (Entscheidung W4 a+b). Unbekannte Rollen: keiner.
 * voll = alle Einträge · einheit = Einträge der eigenen Einheit · eigene = nur die eigenen · keiner.
 */
export const WACHBUCH_ZUGRIFF = Object.freeze({ PL: "voll", LT: "voll", SV: "einheit", MA: "eigene", BR: "keiner", Kunde: "keiner" });

/**
 * Die Einträge als Liste, aus der Form { "<Kennung>|Tag": Eintrag }.
 * Fehlt die Angabe oder ist sie keine Form dieser Art, ist die Liste leer.
 * @param {any} w
 * @returns {any[]}
 */
export function wachbuchListe(w) {
  if (!istObjekt(w)) return [];
  return Object.values(w).filter(istObjekt);
}

/**
 * Prüft einen Eintrag. `objekte` sind die Objekte des Betriebs (modul-posten.mjs),
 * `liste` die übrigen Einträge (für den Nachtragsbezug).
 * @param {any} e
 * @param {{ objekte?: any[], liste?: any[] }} [o]
 * @returns {string | null}
 */
export function pruefeWachbuchEintrag(e, { objekte = [], liste = [] } = {}) {
  if (!istObjekt(e)) return "Wachbuch: erwartet wird ein Eintrag.";
  if (Object.keys(e).some((k) => !WACHBUCH_FELDER.includes(k))) return "Wachbuch: unbekannte Felder.";
  if (!idOk(e.id)) return "Wachbuch: Kennung fehlt oder ist zu lang.";
  const wo = `Wachbuch ${String(e.id).slice(0, 20)}`;
  if (!echterTag(e.datum)) return `${wo}: Datum ungültig.`;
  if (typeof e.uhrzeit !== "string" || !ZEIT.test(e.uhrzeit)) return `${wo}: Uhrzeit im Format HH:MM erwartet.`;
  if (!idOk(e.objektId)) return `${wo}: Objekt fehlt.`;
  if (!objekte.some((o) => istObjekt(o) && o.id === e.objektId)) return `${wo}: Objekt unbekannt.`;
  if (!WACHBUCH_ARTEN.includes(e.art)) return `${wo}: Ereignisart unbekannt.`;
  if (typeof e.text !== "string" || !e.text.trim() || e.text.length > WACHBUCH_GRENZEN.textMax) return `${wo}: Text fehlt oder ist zu lang.`;
  if (e.einheitId !== undefined && e.einheitId !== null && !idOk(e.einheitId)) return `${wo}: Einheit ungültig.`;
  if (!idOk(e.vonId)) return `${wo}: Verfasser fehlt.`;
  if (typeof e.erfasst !== "string" || !e.erfasst) return `${wo}: Erfassungszeit fehlt.`;
  if (e.nachtragZu !== undefined && e.nachtragZu !== null) {
    const ziel = liste.find((x) => istObjekt(x) && x.id === e.nachtragZu);
    if (!ziel) return `${wo}: Nachtrag zu unbekanntem Eintrag.`;
    if (ziel.nachtragZu !== undefined && ziel.nachtragZu !== null) return `${wo}: Nachtrag zu einem Nachtrag ist nicht zulässig.`;
    if (ziel.datum !== e.datum || ziel.objektId !== e.objektId) return `${wo}: Nachtrag muss Datum und Objekt des Eintrags haben.`;
  }
  return null;
}

/**
 * Schreibweg: neue Einträge anhängen, gespeicherte unverändert lassen.
 * Verfasser und Erfassungszeit setzt der Server (ktx.person, ktx.jetzt).
 * `darfEintragen(objektId, datum, person)` entscheidet, wer am Tag im Dienst
 * für das Objekt steht.
 * @param {any} altM
 * @param {any} neuM
 * @param {{ person: string, jetzt: string, darfEintragen: (objektId: string, datum: string, person: string) => boolean,
 *   geloescht?: readonly string[], einheiten?: any[] }} ktx
 *   geloescht: Schlüssel, die der geprüfte Ausnahmeweg (Art. 17) entfernt hat — nur sie dürfen fehlen.
 *   einheiten: Einheiten des Betriebs; ein Eintrag nennt nur eine davon.
 * @returns {{ mandant: any } | { grund: string }}
 */
export function wachbuchZusammen(altM, neuM, ktx) {
  if (!neuM || typeof neuM !== "object") return { mandant: neuM };
  if (neuM.wachbuch === undefined) return { mandant: neuM };
  const neu = neuM.wachbuch;
  if (!istObjekt(neu)) return { grund: "Wachbuch: erwartet wird { \"Kennung|Tag\": Eintrag }." };
  const schluessel = Object.keys(neu);
  if (schluessel.length > WACHBUCH_GRENZEN.eintraege) return { grund: `Wachbuch: höchstens ${WACHBUCH_GRENZEN.eintraege} Einträge.` };
  const alt = istObjekt(altM && altM.wachbuch) ? altM.wachbuch : {};
  const geloescht = new Set(Array.isArray(ktx.geloescht) ? ktx.geloescht : []);
  for (const k of Object.keys(alt)) {
    if (geloescht.has(k) && !Object.prototype.hasOwnProperty.call(neu, k)) continue;
    if (!Object.prototype.hasOwnProperty.call(neu, k) || JSON.stringify(neu[k]) !== JSON.stringify(alt[k]))
      return { grund: "Wachbuch: ein gespeicherter Eintrag wird nicht geändert oder entfernt — Korrektur über einen Nachtrag (W2 a)." };
  }
  const objekte = Array.isArray(neuM.objekte) ? neuM.objekte : [];
  const liste = wachbuchListe(neu);
  const ausgabe = {};
  for (const k of schluessel) {
    const e = neu[k];
    if (Object.prototype.hasOwnProperty.call(alt, k)) { ausgabe[k] = e; continue; }
    if (!istObjekt(e)) return { grund: "Wachbuch: erwartet wird ein Eintrag." };
    const mit = { ...e, vonId: ktx.person, erfasst: ktx.jetzt };
    if (k !== `${mit.id}|${mit.datum}`) return { grund: "Wachbuch: der Schlüssel passt nicht zu Kennung und Datum." };
    const f = pruefeWachbuchEintrag(mit, { objekte, liste });
    if (f) return { grund: f };
    if (Array.isArray(ktx.einheiten) && mit.einheitId !== undefined && mit.einheitId !== null
      && !ktx.einheiten.some((x) => istObjekt(x) && x.id === mit.einheitId)) return { grund: `Wachbuch ${String(mit.id).slice(0, 20)}: Einheit unbekannt.` };
    if (!ktx.darfEintragen(mit.objektId, mit.datum, ktx.person))
      return { grund: "Wachbuch: eintragen kann nur, wer an diesem Tag im Dienst für das Objekt steht." };
    ausgabe[k] = mit;
  }
  return { mandant: { ...neuM, wachbuch: ausgabe } };
}

/**
 * Die Einträge, die eine Zugriffsstufe sieht (W4 a+b).
 * @param {any} w Form { "Kennung|Tag": Eintrag }
 * @param {{ zugriff: string, person?: string | null, eigeneEinheit?: string | null }} o
 * @returns {any[]}
 */
export function wachbuchSicht(w, { zugriff, person = null, eigeneEinheit = null }) {
  const alle = wachbuchListe(w);
  if (zugriff === "voll") return alle;
  if (zugriff === "einheit") return eigeneEinheit ? alle.filter((x) => x.einheitId === eigeneEinheit) : [];
  if (zugriff === "eigene") return person ? alle.filter((x) => x.vonId === person) : [];
  return [];
}

/**
 * Ausgabe je Objekt und Zeitraum (von und bis einschließlich). Nachträge
 * hängen an ihrem Eintrag; ein Nachtrag ohne sichtbaren Eintrag wird nicht
 * gezeigt. Sortiert nach Datum, Uhrzeit, Kennung (reproduzierbar).
 * @param {any} w Form { "Kennung|Tag": Eintrag }
 * @param {{ objektId: string, von: string, bis: string, zugriff: string, person?: string | null, eigeneEinheit?: string | null }} o
 * @returns {{ grund: string } | { eintraege: any[] }}
 */
export function wachbuchAusgabe(w, o) {
  if (!echterTag(o.von) || !echterTag(o.bis)) return { grund: "Zeitraum: Datum im Format JJJJ-MM-TT erwartet." };
  if (o.von > o.bis) return { grund: "Zeitraum: der Anfang liegt nach dem Ende." };
  const tage = (new Date(`${o.bis}T12:00:00Z`) - new Date(`${o.von}T12:00:00Z`)) / 86400000 + 1;
  if (tage > WACHBUCH_GRENZEN.spanneTage) return { grund: `Zeitraum: höchstens ${WACHBUCH_GRENZEN.spanneTage} Tage.` };
  const sichtbar = wachbuchSicht(w, o);
  const ids = new Set(sichtbar.map((x) => x.id));
  const basis = sichtbar
    .filter((x) => x.objektId === o.objektId && x.datum >= o.von && x.datum <= o.bis && (x.nachtragZu === undefined || x.nachtragZu === null))
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.uhrzeit < b.uhrzeit ? -1 : a.uhrzeit > b.uhrzeit ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const eintraege = basis.map((x) => ({
    ...x,
    nachtraege: sichtbar.filter((n) => n.nachtragZu === x.id && ids.has(n.id)).sort((a, b) => (a.erfasst < b.erfasst ? -1 : a.erfasst > b.erfasst ? 1 : 0)),
  }));
  return { eintraege };
}

/**
 * Kontrollgang-Lücken (W5 b). Ohne Intervall (0 oder fehlend) keine Meldung.
 * Lücken zwischen aufeinanderfolgenden Kontrollgängen des Tages und, mit
 * `von`/`bis` (Dienstzeit), am Anfang und Ende. Jede Lücke über dem Intervall.
 * @param {any} w Form { "Kennung|Tag": Eintrag }
 * @param {{ objektId: string, datum: string, intervallMinuten?: number | null, von?: string | null, bis?: string | null }} o
 * @returns {{ von: string, bis: string, minuten: number }[]}
 */
export function kontrollgangLuecken(w, { objektId, datum, intervallMinuten, von = null, bis = null }) {
  if (!Number.isInteger(intervallMinuten) || intervallMinuten <= 0) return [];
  const zeiten = wachbuchListe(w)
    .filter((x) => x.objektId === objektId && x.datum === datum && x.art === "kontrollgang" && ZEIT.test(x.uhrzeit))
    .map((x) => x.uhrzeit).sort();
  const punkte = [];
  if (von && ZEIT.test(von)) punkte.push(von);
  punkte.push(...zeiten);
  if (bis && ZEIT.test(bis)) punkte.push(bis);
  const luecken = [];
  for (let i = 1; i < punkte.length; i++) {
    const d = minuten(punkte[i]) - minuten(punkte[i - 1]);
    if (d > intervallMinuten) luecken.push({ von: punkte[i - 1], bis: punkte[i], minuten: d });
  }
  return luecken;
}
