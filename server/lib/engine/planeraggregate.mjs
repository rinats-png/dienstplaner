/* ==========================================================================
   PLANER-KERN — VORBERECHNETE AGGREGATE (WP-I7, Betreiberentscheidung I5-4)

   Zählregeln über mehr als 62 Tage (Kalenderjahr, rollierend bis 12 Monate)
   rechnen nicht mit dem kurzen Weg (Plan um den Tag zweimal lesen), sondern mit
   Aggregaten je Person und Monat: Ein Monatsblock wird EINMAL je Betriebsstand
   gelesen (eine Tagesabfrage je Tag) und hält die Tagesklassen, die Summen je
   Klasse und — erst wenn gebraucht — Präfixsummen. Eine Zählung über einen
   Zeitraum kostet je berührtem Monat einen Schritt (ganzer Monat: Summe,
   angeschnittener Monat: Präfixsumme); ein Kalenderjahr sind 12 Schritte.

   Rechenlast (Lehren #561/#566): Jede Arbeit wird über `kosten(n)` beim Budget
   des äußeren Einstiegs angemeldet, BEVOR sie geschieht (Lesen eines Monats =
   Tage des Monats, Präfixsumme = Tage des Monats, Zählung = Schritte). Reicht
   das Budget nicht, wirft `kosten` — dieses Modul legt dann keinen halben Block
   ab. Die Lastgrenzen des kurzen Wegs bleiben unverändert.

   Gleicher Betriebsstand, gleiche Aggregate: Der Speicher hängt in einer
   WeakMap am Betriebsstand (Mandantengrenze: ein anderer Betrieb, auch mit
   gleicher Personenkennung, bekommt nie die Blöcke eines anderen). Der Planer
   (planeMonat) setzt Einteilungen nacheinander und erzeugt dabei je Einteilung
   einen neuen Betriebsstand; `aggregateFortschreiben` übernimmt die Blöcke
   dorthin — nur, wenn sich sonst nichts geändert hat (alle übrigen Felder
   dieselben Objekte), sonst wird neu gelesen.

   Einmal je Lauf (WP-I7 Teil 2): Die Blöcke werden je Lauf EINMAL aufgebaut und
   danach tageweise nachgeführt, statt nach jeder Einteilung ganze Monate neu zu
   lesen. Eine Einteilung (Person, Tag) ändert Tagesklassen nur an diesem Tag:
   personTag liest die eigene Abweichung des Tags, die Folge und die
   Abwesenheit; die Postenbesetzung hängt von den Abweichungen ANDERER Personen
   am selben Tag ab, nie von anderen Tagen. Darum wird genau dieser Tag zum
   Nachlesen vorgemerkt — bei der eingeteilten Person, im Betrieb mit
   Posten-Dienstarten bei allen Personen mit einem Block dieses Monats. Gelesen
   wird erst beim nächsten Zugriff, mit Kosten (ein Schritt je vorgemerktem
   Tag) VOR dem Lesen; reicht das Budget nicht oder scheitert das Lesen, bleibt
   der Block unverändert vorgemerkt (kein halb nachgeführter Block).
   Präfixsummen des Blocks verfallen beim Nachlesen und werden bei Bedarf neu
   (mit Kosten) gebildet.

   Rein: keine Uhr, kein Zufall, keine Ablage, kein Protokoll. Die Blöcke liegen
   nur im Speicher des Einstiegs und verlassen ihn nie (kein Personenbezug in
   Ergebnissen). Schalter: PLANER_AGGREGATE_AN (AUS bis zur fachlichen Abnahme).
   ========================================================================== */

/** Schalter der Aggregate (Vorgabe AUS). Einschalten ist eine bewusste Codeänderung dieser einen Konstante; Prüfungen schalten je Budget ein. */
export const PLANER_AGGREGATE_AN = false;

/** Längster Zeitraum, den die Aggregate rechnen: Kalenderjahr, rollierend bis 372 Tage (53 Wochen, 12 Monate zu je höchstens 31 Tagen). */
export const AGGREGAT_GRENZE = Object.freeze({ fensterTage: 372 });

const TAG_MS = 86400000;
/** Tagesnummer (Tage seit 1970-01-01, UTC) eines Tags JJJJ-MM-TT. */
export const tagNr = (t) => Math.round(Date.parse(`${t}T00:00:00Z`) / TAG_MS);
/** Tag JJJJ-MM-TT einer Tagesnummer. */
export const tagAus = (n) => new Date(n * TAG_MS).toISOString().slice(0, 10);

/** Schlüssel der Abwesenheitszählung (Urlaub/Krankheit) neben den Tagesklassen. */
const ABW = "\u0000abw";

/** Ein leerer Speicher für EINEN äußeren Einstieg (hängt am Vorgaben-Budget). */
export function neuerAggregatSpeicher() {
  return { jeBetrieb: new WeakMap() };
}

/** Jahr, Monat (1–12) und Tag einer Tagesnummer — reine Ganzzahlrechnung (gregorianisch), ohne Date: Datumsobjekte kosten je Tag so viel
    wie die Tagesabfrage selbst (Messung im Nachweis). */
function zivil(n) {
  const z = n + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const tag = doy - Math.floor((153 * mp + 2) / 5) + 1, monat = mp < 10 ? mp + 3 : mp - 9;
  return { jahr: yoe + era * 400 + (monat <= 2 ? 1 : 0), monat, tag };
}
const MONATSTAGE = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const zwei = (x) => (x < 10 ? `0${x}` : String(x));

/** Monat (Schlüssel JJJJ-MM, erste Tagesnummer, Zahl der Tage) zu einer Tagesnummer. */
function monatVon(n) {
  const { jahr, monat, tag } = zivil(n);
  const schalt = monat === 2 && ((jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0);
  return { schluessel: `${jahr}-${zwei(monat)}`, t0: n - (tag - 1), tage: MONATSTAGE[monat - 1] + (schalt ? 1 : 0) };
}

/**
 * Zähler für EINE Person in EINEM Betriebsstand.
 * @param {{ jeBetrieb: WeakMap<object, Map<string, any>> }} speicher
 * @param {object} m Betriebsstand (Schlüssel der WeakMap)
 * @param {string} personId
 * @param {(t: string) => { klasse: string | undefined, abw: number }} lies Tagesklasse (wie `tagesklasse`) und 1, wenn der Tag aus der Zählung herausgenommen wird
 * @param {(n: number) => void} kosten meldet n Schritte beim Budget an; wirft, wenn es nicht reicht
 */
export function aggregatZaehler(speicher, m, personId, lies, kosten) {
  let jeP = speicher.jeBetrieb.get(m);
  if (!jeP) { jeP = new Map(); speicher.jeBetrieb.set(m, jeP); }
  const pid = String(personId);

  /* Die zuletzt benutzten Blöcke dieses Zählers (aufeinanderfolgende Tage liegen meist im selben Monat): kein Schlüssel je Tag. */
  let letzter = null, vorletzter = null;
  const block = (n) => {
    if (letzter && n >= letzter.t0 && n < letzter.t0 + letzter.tage) { if (letzter.neu.size) nachlesen(letzter); return letzter; }
    if (vorletzter && n >= vorletzter.t0 && n < vorletzter.t0 + vorletzter.tage) { const x = vorletzter; vorletzter = letzter; letzter = x; if (x.neu.size) nachlesen(x); return x; }
    const mo = monatVon(n);
    const key = `${pid}|${mo.schluessel}`;
    let b = jeP.get(key);
    if (!b) b = lesen(mo, key);
    else if (b.neu.size) nachlesen(b);
    vorletzter = letzter; letzter = b;
    return b;
  };
  const lesen = (mo, key) => {
    kosten(mo.tage);                     // eine Tagesabfrage je Tag des Monats
    const kl = new Array(mo.tage), abw = new Uint8Array(mo.tage), tot = new Map();
    let abwTot = 0;
    for (let i = 0; i < mo.tage; i++) {
      const e = lies(`${mo.schluessel}-${zwei(i + 1)}`);
      kl[i] = e.klasse;
      if (e.klasse !== undefined) tot.set(e.klasse, (tot.get(e.klasse) || 0) + 1);
      if (e.abw) { abw[i] = 1; abwTot++; }
    }
    tot.set(ABW, abwTot);
    /* neu: vorgemerkte Tage (Index im Monat), die nach einer Einteilung nachgelesen werden (aggregateFortschreiben). */
    const b = { t0: mo.t0, tage: mo.tage, mon: mo.schluessel, kl, abw, tot, pre: new Map(), neu: new Set() };
    jeP.set(key, b);
    return b;
  };
  /* Vorgemerkte Tage nachlesen: Kosten vorab (ein Schritt je Tag), erst alles lesen, dann übernehmen — wirft `kosten` oder `lies`,
     bleibt der Block unverändert und vorgemerkt. */
  const nachlesen = (b) => {
    const tage = [...b.neu];
    kosten(tage.length);
    const neu = tage.map((i) => lies(`${b.mon}-${zwei(i + 1)}`));
    for (let j = 0; j < tage.length; j++) {
      const i = tage[j], e = neu[j], alt = b.kl[i];
      if (alt !== undefined) b.tot.set(alt, b.tot.get(alt) - 1);
      if (e.klasse !== undefined) b.tot.set(e.klasse, (b.tot.get(e.klasse) || 0) + 1);
      const a = e.abw ? 1 : 0;
      b.tot.set(ABW, b.tot.get(ABW) - b.abw[i] + a);
      b.kl[i] = e.klasse; b.abw[i] = a;
    }
    b.pre.clear();
    b.neu.clear();
  };

  const praefix = (b, k) => {
    let p = b.pre.get(k);
    if (p) return p;
    kosten(b.tage);                      // ein Schritt je Tag des Monats
    p = new Int32Array(b.tage + 1);
    for (let i = 0; i < b.tage; i++) p[i + 1] = p[i] + ((k === ABW ? b.abw[i] === 1 : b.kl[i] === k) ? 1 : 0);
    b.pre.set(k, p);
    return p;
  };

  /** Anzahl der Tage mit Schlüssel k in [a, b] (Tagesnummern, einschließlich). */
  const zaehleK = (k, a, bis) => {
    let summe = 0;
    for (let t = a; t <= bis;) {
      const blk = block(t);
      const ende = Math.min(bis, blk.t0 + blk.tage - 1);
      kosten(1);
      if (t === blk.t0 && ende === blk.t0 + blk.tage - 1) summe += blk.tot.get(k) || 0;
      else { const p = praefix(blk, k); summe += p[ende - blk.t0 + 1] - p[t - blk.t0]; }
      t = ende + 1;
    }
    return summe;
  };

  return {
    /** Tagesklasse am Tag n (Tagesnummer): Kennung des Dienstes, „frei“ oder undefined (abwesend). */
    klasse(n) { const b = block(n); return b.kl[n - b.t0]; },
    /** 1, wenn der Tag n aus der Zählung herausgenommen wird (Urlaub, Krankheit). */
    abw(n) { const b = block(n); return b.abw[n - b.t0]; },
    /** Anzahl der Tage der Klasse k in [a, b]. */
    zaehle: (k, a, b) => zaehleK(String(k), a, b),
    /** Anzahl der herausgenommenen Tage in [a, b]. */
    zaehleAbw: (a, b) => zaehleK(ABW, a, b),
  };
}


/**
 * Der Planer hat in `neuM` gegenüber `altM` genau die genannten Einteilungen geändert: Blöcke übernehmen und die geänderten Tage zum
 * Nachlesen vormerken (eingeteilte Person; mit Posten-Dienstarten alle Personen mit einem Block des Monats). Übernommen wird nur, wenn
 * alle übrigen Felder dieselben Objekte sind, nur `abweichungen` neu ist und jeder Tag ein gültiges Datum JJJJ-MM-TT ist; sonst wird
 * neu gelesen. Arbeit hier: je Änderung ein Schlüssel (ohne Posten) bzw. ein Durchlauf über die Blöcke des Betriebsstands (mit Posten;
 * ihre Zahl ist durch das Budget beschränkt, jeder Block kostete beim Lesen mindestens 28 Schritte). Das Nachlesen kostet beim Zugriff.
 * Der alte Stand verliert seine Blöcke (sie gehören jetzt zum neuen).
 * @param {{ jeBetrieb: WeakMap<object, Map<string, any>> } | null | undefined} speicher
 * @param {any} altM @param {any} neuM
 * @param {{ personId: any, tag: string }[]} aenderungen
 * @returns {boolean} übernommen
 */
export function aggregateFortschreiben(speicher, altM, neuM, aenderungen) {
  if (!speicher || !altM || !neuM || altM === neuM || !Array.isArray(aenderungen)) return false;
  const jeP = speicher.jeBetrieb.get(altM);
  if (!jeP) return false;
  speicher.jeBetrieb.delete(altM);
  const ka = Object.keys(altM), kn = Object.keys(neuM);
  if (ka.length !== kn.length || kn.some((k) => k !== "abweichungen" && neuM[k] !== altM[k])) return false;
  /* Erst alle Tage prüfen, dann vormerken (kein halbes Fortschreiben). */
  const tage = [];
  for (const a of aenderungen) {
    if (!a || typeof a.tag !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(a.tag)) return false;
    const n = tagNr(a.tag);
    if (!Number.isFinite(n) || tagAus(n) !== a.tag) return false;
    const mo = monatVon(n);
    tage.push({ pid: String(a.personId), mon: mo.schluessel, i: n - mo.t0 });
  }
  /* Review #572 A1: Die Postenbesetzung (personTag → postenBesatzung) hängt von den Einteilungen ANDERER Personen am selben Tag ab —
     eine Einteilung auf einen Posten kann eine andere Person aus der Besetzung verdrängen (sie hat dann wieder ihren Quelldienst).
     Darum wird der Tag dann bei allen Personen vorgemerkt, nicht nur bei der eingeteilten. Andere Tage ändern sich nie. */
  const posten = (Array.isArray(neuM.dienstarten) ? neuM.dienstarten : []).some((x) => x && x.posten);
  for (const t of tage) {
    if (posten) { for (const b of jeP.values()) if (b.mon === t.mon) b.neu.add(t.i); }
    else { const b = jeP.get(`${t.pid}|${t.mon}`); if (b) b.neu.add(t.i); }
  }
  speicher.jeBetrieb.set(neuM, jeP);
  return true;
}
