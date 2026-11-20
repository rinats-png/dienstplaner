/* ==========================================================================
   FACHPRÜFUNG EINER EINTEILUNG — für Oberfläche und Server (WP-22)

   Bis WP-22 rechnete nur die Oberfläche, ob eine Person einen Dienst an
   einem Tag leisten darf (hindernisBefunde in src/App.jsx); der Server
   kannte nur die Schutzprüfung. Jetzt steht die Prüfung hier — eine
   Fassung, die beide lesen:
   - die Oberfläche mit ihrem vollständigen Plan (personTag),
   - der Server mit der Planrechnung unten (dienstAm: Abweichung, sonst
     Schichtfolge der Einheit mit Teilzeit, ohne Abwesenheit).

   Geprüft wird je Einteilung (Person, Tag, Dienstart):
     bestand                  nicht im Beschäftigungsverhältnis
     schutz/schutzWeich/…     die eine Schutzprüfung (schutzEinsatz)
     keineNacht               Einschränkung an der Person (Nachtfenster des Betriebs)
     qualifikation…           verbindliche Qualifikation fehlt (gesetzlich/betrieblich)
     kompetenz                Einweisung je Gerät (§ 4 MPBetreibV, § 12 BetrSichV)
     ruhezeit…                Ruhezeit zu den Diensten zwei Tage davor und danach
     maxDiensteWoche          Einschränkung an der Person
     keinAlleindienst         Einschränkung an der Person
     tagesgrenze              Dienst über zehn Stunden (§ 3 ArbZG)
   Die Stufe und ob ein Befund sperrt, steht im Befundkatalog
   (BEFUND_KATALOG, server/lib/bestaetigungen.mjs) — eine spätere
   Fachentscheidung ändert nur den Katalog.

   Rein: keine Ablage, kein Datum von außen außer `heute`.
   ========================================================================== */
import { schutzEinsatz, nachtFenster, nachtschwelle, nachtAnteil } from "./schutzpruefung.mjs";
import { pad, pISO, addDays, dow, dauer, between, montag, fenster, verbindlichkeit, fehlendeKompetenzen,
  HOECHST_TAG } from "./regelwerk.mjs";
import { BEFUND_KATALOG } from "./bestaetigungen.mjs";
import { anzuwendendesModell, modellLage, modellVerzeichnisGemerkt, BETRIEB_MODELL, ZUORDNUNG_FELD, WIRKUNG_FELDER } from "./schichtmodell-kern.mjs";
import { branchenBefunde } from "./branchenbefunde.mjs";

const liste = (w) => (Array.isArray(w) ? w : []).filter((x) => x && typeof x === "object");
/** Das erste Objekt einer Liste, das passt — ohne Zwischenliste (Laufzeit, WP-22). */
const finde = (w, f) => { if (!Array.isArray(w)) return undefined; for (const x of w) if (x && typeof x === "object" && f(x)) return x; return undefined; };
const n1 = (v) => Number(v).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fKurz = (s) => (s ? `${pad(pISO(s).getDate())}.${pad(pISO(s).getMonth() + 1)}.` : "—");

/* ------------------------------------------------------------------------
   RUHEZEIT (§ 5 ArbZG)
   ------------------------------------------------------------------------ */
/** Gesetzliche Mindestruhezeit nach § 5 Abs. 1 ArbZG. Was darüber liegt, ist Tarif oder Betrieb. */
export const RUHEZEIT_GESETZ = 11;
/** Stufe einer zu kurzen Ruhezeit: unter dem Gesetz „recht", bis zur Einstellung „achtung", sonst null. */
export function ruhezeitStufe(ruheStunden, einstellung) {
  const grenze = Number(einstellung) || RUHEZEIT_GESETZ;
  if (ruheStunden >= grenze) return null;
  return ruheStunden < Math.min(RUHEZEIT_GESETZ, grenze) ? "recht" : "achtung";
}

/* ------------------------------------------------------------------------
   NACHTFENSTER DES BETRIEBS
   ------------------------------------------------------------------------ */
/* nachtFenster, nachtschwelle und nachtAnteil stehen in server/lib/schutzpruefung.mjs
   (Nachprüfung 948a4ba, A1: die Einsatzregel „kein Nachtdienst“ rechnet dort
   mit demselben Fenster); hier nur weitergereicht. */
export { nachtFenster, nachtschwelle, nachtAnteil };

/* ------------------------------------------------------------------------
   QUALIFIKATIONEN UND NACHWEISE
   ------------------------------------------------------------------------ */
export const NACHWEIS_VORLAUF = 60;   // Tage, ab denen gewarnt wird
/** Gültigkeitsstand eines einzelnen Nachweises (am Tag `heute`). */
export function nachweisStand(m, p, qualId, heute) {
  const n = liste(p.qualNachweise).find((x) => x.qualId === qualId);
  const q = liste(m.qualifikationen).find((x) => x.id === qualId);
  if (!q) return { stand: "unbekannt" };
  /* Nur-Status-Nachweise (etwa der Masernschutz nach § 20 IfSG): Erfasst
     wird allein, ob er vorliegt — kein Datum, keine Datei, kein Grund. */
  if (q.nurStatus) {
    if (n && n.vorhanden) return { stand: "gueltig", ablauf: null, qual: q, unbefristet: true, nurStatus: true };
    return { stand: "fehlt", ablauf: null, qual: q, nurStatus: true };
  }
  if (!q.gueltigMonate) return { stand: "gueltig", ablauf: null, qual: q, unbefristet: true };
  if (!n || !n.ablauf) return { stand: "fehlt", ablauf: null, qual: q };
  const tage = between(heute, n.ablauf);
  return { stand: tage < 0 ? "abgelaufen" : tage <= NACHWEIS_VORLAUF ? "laeuft_ab" : "gueltig",
    ablauf: n.ablauf, tage, qual: q, datei: n.datei };
}
/** Gilt eine Qualifikation an der Person (Nachweis gültig oder läuft ab)? */
export function qualGueltig(m, p, qualId, heute) {
  if (!(Array.isArray(p.qualifikationen) ? p.qualifikationen : []).includes(qualId)) return false;
  const s = nachweisStand(m, p, qualId, heute);
  return s.stand === "gueltig" || s.stand === "laeuft_ab";
}
/** Wirkt die Sperre dieser Qualifikation hier — und aus welchem Grund? Verbindlichkeit oder null. */
export function sperreWirkt(m, q, land) {
  if (!q || !q.harteSperre) return null;
  const v = verbindlichkeit(q, { land });
  return v.sperrt ? v : null;
}

/* ------------------------------------------------------------------------
   DIE PLANRECHNUNG (für den Server; die Oberfläche hat personTag)
   ------------------------------------------------------------------------ */
/** Welcher Einheit gehört die Person an diesem Tag an? */
export function einheitAm(p, d) {
  let t = null;
  if (Array.isArray(p.zugehoerigkeit)) for (const z of p.zugehoerigkeit) if (z && typeof z === "object" && (!z.ab || z.ab <= d)) t = z;   // ab leer: von Anfang an (Eintritt unbekannt)
  return t ? t.einheitId : null;
}
/** Bundesland einer Einheit — Betriebe mit mehreren Standorten rechnen sonst falsch. */
export function landFuerEinheit(m, einheitId) {
  const e = finde(m.einheiten, (x) => x.id === einheitId);
  if (e && e.standortId && m.standorte) {
    const st = finde(m.standorte, (s) => s.id === e.standortId);
    if (st && st.bundesland) return st.bundesland;
  }
  return m.bundesland;
}
/** Versatz einer Einheit in Tagen. Wochenversatz bleibt als Sonderfall gültig. */
export function versatzTageVon(e) {
  return e.versatzTage !== undefined && e.versatzTage !== null ? e.versatzTage : (e.versatz || 0) * 7;
}
/** Zykluslänge in Tagen. */
export function zyklusLaenge(m) {
  return m.zyklus && m.zyklus.tage ? m.zyklus.tage.length : ((m.zyklus && m.zyklus.wochen) || 0) * 7;
}
/** Der Dienst der Schichtfolge einer Einheit an einem Tag (oder null). */
export function einheitDienst(m, eid, d) {
  const e = finde(m.einheiten, (x) => x.id === eid); if (!e || e.pool) return null;
  const tage = (m.zyklus && m.zyklus.tage) || null;
  if (!tage || !tage.length || typeof m.anker !== "string") return null;
  const len = zyklusLaenge(m);
  const i = (((between(m.anker, d) + versatzTageVon(e)) % len) + len) % len;
  const id = tage[i];
  return id && id !== "-" ? id : null;
}
/** Stabiler Streuwert je Person, damit Teilzeitkräfte nicht alle dieselben Tage haben. */
function idStreu(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
/**
 * Der Gruppendienst als Teilzeitdienst: `quote` verteilt den Stundenanteil
 * gleichmäßig über die Zyklusdienste, `wochentage` nur an festen Tagen.
 */
export function teilzeitDienst(m, p, datum, plan) {
  const tz = p.teilzeit;
  if (!tz || !tz.aktiv || !plan) return plan;
  if (tz.modus === "wochentage") return (tz.wochentage || []).includes(dow(datum)) ? plan : null;
  const soll = (m.einstellungen && m.einstellungen.sollWochenstunden) || 40;
  const quote = Math.max(0.05, Math.min(1, (p.wochenstunden || soll) / soll));
  if (quote >= 0.999) return plan;
  const len = zyklusLaenge(m);
  const eid = einheitAm(p, datum);
  const e = finde(m.einheiten, (x) => x.id === eid);
  if (!e || !len) return plan;
  /* Fortlaufende Nummer dieses Dienstes seit dem Ankerdatum — nur so lässt
     sich ein Anteil wie 50 % über mehrere Zyklen exakt einhalten. */
  const tage = between(m.anker, datum) + versatzTageVon(e);
  const zyklen = Math.floor(tage / len);
  const rest = ((tage % len) + len) % len;
  let gesamt = 0;
  for (const t of m.zyklus.tage) if (t && t !== "-") gesamt++;
  if (!gesamt) return plan;
  let vor = 0;
  for (let i = 0; i < rest; i++) { const t = m.zyklus.tage[i]; if (t && t !== "-") vor++; }
  const nr = zyklen * gesamt + vor;
  const versatz = (idStreu(p.id) % 997) / 997;
  return Math.floor((nr + 1 + versatz) * quote) > Math.floor((nr + versatz) * quote) ? plan : null;
}
/* ------------------------------------------------------------------------
   PLANWIRKUNG DER SCHICHTMODELLE JE PERSON (IMP-6, ENTSCHEIDUNGSLISTE P2-4 Punkt 6) — Vorgabe AUS

   Ist die Planwirkung aus (Vorgabe, auch ohne gesetzte Quelle), rechnet planDienst
   wörtlich den bisherigen Ausdruck (Schichtfolge der Einheit mit Teilzeit) — die
   Planrechnung bleibt byte-gleich (pruefungen/imp6-planwirkung.test.js, D3).
   Ist sie an, gilt für jede Person und jeden Tag das zugeordnete Modell
   (schichtmodell-kern.mjs, anzuwendendesModell):
     Betriebsmodell (auch implizit: keine Zuordnung) → Schichtfolge der Einheit wie bisher
     eigenes Modell → Zyklustag ab „Gültig ab“ mit Versatz (Kalendertage), Teilzeit über
                      die Zyklustage des Modells (teilzeitModell)
     „keine“ (Lücke, Q5) → kein Dienst aus einem Modell, nie still das Betriebsmodell
     mehrdeutig → „uneindeutig“: kein Dienst, nie still ein Modell gewählt (Klärung)
     ungültig → kein Dienst (Klärung)
   Springer und Personen außerhalb des Schichtdiensts bekommen wie bisher keine Folge.
   Abgeschlossene Monate rechnen weiter aus dem Eingefrorenen (istTag, Soll, Ist,
   Zuschläge, Lohnexport) — die Wirkung ändert sie nicht.

   Quelle des Schalters: CENTRIC_SCHICHTMODELL_WIRKUNG (server/lib/schalter.mjs,
   schichtmodellWirkungAn). Diese Datei liest keine Umgebung (sie erreicht auch die
   Oberfläche); wer die Wirkung einschaltet, setzt die Quelle mit
   schichtmodellWirkungSetzen. Stand PR 2 (Verdrahtung): genau zwei Wege setzen sie —
   der Server (server/lib/schichtmodell-wirkung.mjs, aus der Umgebung) und die
   Oberfläche (src/speicher.js, allein aus `schichtmodellWirkung: true` der Antwort
   von GET /api/bestand; nur Rollen mit vollständiger Sicht bekommen die Angabe).
   ------------------------------------------------------------------------ */
let wirkungQuelle = () => false;
/** Quelle der Planwirkung setzen: eine Funktion (bei jedem Aufruf gelesen) oder ein Wert (nur genau true schaltet ein). */
export function schichtmodellWirkungSetzen(quelle) {
  wirkungQuelle = typeof quelle === "function" ? quelle : quelle === true ? () => true : () => false;
}
/** Ist die Planwirkung an? Nur genau true; eine werfende Quelle gilt als aus (fail-closed). */
export function schichtmodellWirkungAktiv() {
  try { return wirkungQuelle() === true; } catch { return false; }
}

/**
 * Die Lage der Schichtfolge einer Person an einem Tag nach den zugeordneten Modellen (roh, vor Teilzeit und Abweichung),
 * unabhängig vom Schalter (für Anzeige, Klärungsliste und Vorprüfung):
 * - { art: "dienst", quelle: "betrieb" | "zuordnung", modellId, zuordnungId, dienstId (null = frei), nummer?, index?, laenge? }
 * - { art: "ohne" }                     Springer oder nicht im Schichtdienst: keine Folge (wie bisher)
 * - { art: "keine" }                    kein Modell an diesem Tag (Q5), nie still das Betriebsmodell
 * - { art: "uneindeutig", zuordnungIds } mehrere Zuordnungen gelten (Klärung, kein Vorrang)
 * - { art: "ungueltig", grund }          gespeicherte Zuordnung fehlerhaft (Klärung)
 * @returns {{ art: string } & Record<string, any>}
 */
export function schichtmodellLageAm(m, p, d) {
  if (p.springer || p.imSchichtdienst === false) return { art: "ohne" };
  const r = anzuwendendesModell(m, p, d);
  if (r.art === "mehrdeutig") return { art: "uneindeutig", zuordnungIds: r.zuordnungIds };
  if (r.art !== "modell") return r;
  if (r.quelle === "betrieb") {
    const eid = einheitAm(p, d);
    return { art: "dienst", quelle: "betrieb", modellId: BETRIEB_MODELL, zuordnungId: r.zuordnungId, dienstId: eid ? einheitDienst(m, eid, d) : null };
  }
  const l = modellLage(m, /** @type {any} */ (r), d);
  const id = l.tage[l.index];
  return { art: "dienst", quelle: "zuordnung", modellId: r.modellId, zuordnungId: r.zuordnungId, dienstId: id && id !== "-" ? id : null,
    nummer: l.nummer, index: l.index, laenge: l.tage.length };
}

/** Teilzeit im eigenen Modell: dieselbe Regel wie teilzeitDienst, gezählt über die Zyklustage des Modells ab „Gültig ab“. */
function teilzeitModell(m, p, datum, plan, l) {
  const tz = p.teilzeit;
  if (!tz || !tz.aktiv || !plan) return plan;
  if (tz.modus === "wochentage") return (tz.wochentage || []).includes(dow(datum)) ? plan : null;
  const soll = (m.einstellungen && m.einstellungen.sollWochenstunden) || 40;
  const quote = Math.max(0.05, Math.min(1, (p.wochenstunden || soll) / soll));
  if (quote >= 0.999) return plan;
  const len = l.tage.length;
  let gesamt = 0;
  for (const t of l.tage) if (t && t !== "-") gesamt++;
  if (!gesamt) return plan;
  let vor = 0;
  for (let i = 0; i < l.index; i++) { const t = l.tage[i]; if (t && t !== "-") vor++; }
  const nr = Math.floor(l.nummer / len) * gesamt + vor;
  const versatz = (idStreu(p.id) % 997) / 997;
  return Math.floor((nr + 1 + versatz) * quote) > Math.floor((nr + versatz) * quote) ? plan : null;
}

/**
 * Der Plandienst der Schichtfolge einer Person an einem Tag (mit Teilzeit, ohne Abweichung, Posten und Abwesenheit) —
 * die eine Stelle, an der die Planrechnung (personTag, dienstAm, planTag, Postenbesetzung, Schutzrechnung) die
 * Schichtfolge liest. Planwirkung aus: wörtlich der bisherige Ausdruck.
 * @param {any} m Betrieb
 * @param {any} p Person
 * @param {string} d JJJJ-MM-TT
 * @param {any} [eid] Einheit der Person an diesem Tag (Vorgabe einheitAm)
 */
export function planDienst(m, p, d, eid = einheitAm(p, d)) {
  if (!schichtmodellWirkungAktiv())
    return eid && !p.springer && p.imSchichtdienst !== false ? teilzeitDienst(m, p, d, einheitDienst(m, eid, d)) : null;
  const l = schichtmodellLageAm(m, p, d);
  if (l.art !== "dienst" || !l.dienstId) return null;
  if (l.quelle === "betrieb") return teilzeitDienst(m, p, d, l.dienstId);
  return teilzeitModell(m, p, d, l.dienstId, { nummer: l.nummer, index: l.index, tage: modellVerzeichnisGemerkt(m).get(l.modellId).tage });
}

/**
 * Die rohe Schichtfolge einer Person an einem Tag (vor Teilzeit, Abweichung, Abwesenheit) für Aktionen und Auswertungen
 * der Oberfläche, die bisher die Folge der Einheit selbst rechneten (setzeAbweichung, mehrfachDienst, urlaubskonto,
 * planVergleich, Ersatzvorschlag). `alt` ist genau der bisherige Ausdruck des Aufrufers.
 * - Planwirkung AUS: alt() — wörtlich wie bisher.
 * - AN, Betriebsmodell (auch implizit), Springer, nicht im Schichtdienst: alt() — AN = AUS ohne eigenes Modell.
 * - AN, eigenes Modell: der Zyklustag des Modells (null = frei).
 * - AN, „keine“ (Lücke, Q5), uneindeutig, ungültig: null — nie still das Betriebsmodell.
 * @param {any} m Betrieb
 * @param {any} p Person
 * @param {string} d JJJJ-MM-TT
 * @param {() => any} alt bisheriger Ausdruck
 */
export function schichtfolgeAm(m, p, d, alt) {
  if (!schichtmodellWirkungAktiv()) return alt();
  const l = schichtmodellLageAm(m, p, d);
  if (l.art === "ohne" || (l.art === "dienst" && l.quelle === "betrieb")) return alt();
  return l.art === "dienst" ? l.dienstId : null;
}

/**
 * Welche Felder ändern bei Planwirkung die Planrechnung mittelbar (Auslöser der Schutzrechnung, schutzdurchsetzung.mjs)?
 * AUS: keine — die Modelle wirken nicht, die Nachrechnung bleibt wie bisher. AN: die Modelldefinitionen am Betrieb und
 * die Zuordnungen an der Person. Eine Stelle, damit der Auslöser die Felder nicht selbst nennt.
 * @returns {{ betrieb: string[], person: string[] }}
 */
export function schichtmodellPlanfelder() {
  return schichtmodellWirkungAktiv() ? { betrieb: [...WIRKUNG_FELDER.betrieb], person: [...WIRKUNG_FELDER.person] } : { betrieb: [], person: [] };
}

/**
 * Anzeigen je Einheit (Aushang, Monatsplan, Lagebild) zeigen die Folge der Einheit — das Betriebsmodell. Wie viele
 * Personen dieser Einheit folgen an mindestens einem der Tage nicht dem Betriebsmodell (eigenes Modell, Lücke nach Q5,
 * Klärung)? Planwirkung AUS: 0 ohne jede Rechnung (Anzeige wörtlich wie bisher). Nur eine Zahl, keine Namen.
 * @param {any} m Betrieb
 * @param {any} eid Einheit
 * @param {string[]} tage JJJJ-MM-TT
 */
export function abweichendVomBetriebsmodell(m, eid, tage) {
  if (!schichtmodellWirkungAktiv() || !m || !Array.isArray(tage)) return 0;
  let n = 0;
  for (const p of liste(m.personen)) {
    if (!Array.isArray(p[ZUORDNUNG_FELD]) || !p[ZUORDNUNG_FELD].length) continue;            // implizit: Betriebsmodell
    for (const d of tage) {
      if (!imDienst(p, d) || einheitAm(p, d) !== eid) continue;
      const l = schichtmodellLageAm(m, p, d);
      if (l.art === "ohne" || (l.art === "dienst" && l.quelle === "betrieb")) continue;
      n++;
      break;
    }
  }
  return n;
}

/** Höchstzahl der Tage je Person in schichtmodellKlaerungen (technische Grenze, etwa zehn Jahre). */
const KLAERUNG_TAGE_MAX = 3700;
/**
 * Klärungsfälle der Modellzuordnung in einem Zeitraum (unabhängig vom Schalter): Tage, an denen für eine Person im
 * Schichtdienst kein Modell eindeutig gilt („uneindeutig“) oder die gespeicherte Zuordnung fehlerhaft ist („ungueltig“).
 * „keine“ (Q5) ist kein Klärungsfall. Nur Kennungen; höchstens `grenze` Einträge (danach `begrenzt`).
 * @returns {{ faelle: { personId: string, datum: string, art: string, zuordnungIds?: any[], grund?: string }[], begrenzt: boolean }}
 */
export function schichtmodellKlaerungen(m, von, bis, grenze = 500) {
  const faelle = [];
  for (const p of liste(m && m.personen)) {
    if (!Array.isArray(p[ZUORDNUNG_FELD]) || !p[ZUORDNUNG_FELD].length) continue;      // implizit: nie Klärung
    let n = 0;
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      if (++n > KLAERUNG_TAGE_MAX) return { faelle, begrenzt: true };       // Zeitraum ohne Grenze: nie endlos rechnen
      if (!imDienst(p, d)) continue;
      const l = schichtmodellLageAm(m, p, d);
      if (l.art !== "uneindeutig" && l.art !== "ungueltig") continue;
      if (faelle.length >= grenze) return { faelle, begrenzt: true };
      faelle.push({ personId: String(p.id), datum: d, art: l.art, ...(l.zuordnungIds ? { zuordnungIds: l.zuordnungIds } : { grund: l.grund }) });
    }
  }
  return { faelle, begrenzt: false };
}

/** Fehlt der Eintritt ausdrücklich (null oder leer, wie ihn Import und Einzelanlage seit IMP-1 anlegen)?
 *  Ein Bestand ganz ohne Feld (undefined, Altbestand vor IMP-1) zählt nicht dazu. */
export const eintrittFehlt = (p) => !!p && (p.eintritt === null || p.eintritt === "");
/** Ist die Person an diesem Tag im Beschäftigungsverhältnis?
 *  Datenreview PR #130 (1): Eintritt null/leer ergibt keine rückwirkende Beschäftigung — die Person ist an
 *  keinem Tag im Dienst (kein Soll, kein Ist, kein Plan, keine Abschlusslücke), bis ein Datum gesetzt ist. */
export function imDienst(p, d) {
  if (p.eintritt === null || p.eintritt === "") return false;
  if (p.eintritt && d < p.eintritt) return false;
  if (p.austritt && d > p.austritt) return false;
  return p.status !== "gesperrt";
}
/**
 * Der Dienst einer Person an einem Tag aus Sicht des Servers: Abweichung,
 * sonst Schichtfolge der Einheit mit Teilzeit; an einem Tag mit Abwesenheit
 * oder außerhalb des Beschäftigungsverhältnisses keiner. Posten (Dienstarten,
 * die aus einem Gruppendienst besetzt werden) rechnet nur die Oberfläche.
 */
export function dienstAm(m, p, d) {
  if (!imDienst(p, d)) return null;
  const ab = m.abweichungen && typeof m.abweichungen === "object" ? m.abweichungen[`${p.id}|${d}`] : undefined;
  let basis;
  if (ab !== undefined) basis = ab === "-" || ab === "" || ab === null ? null : ab;
  else basis = planDienst(m, p, d);                       // Schichtfolge (IMP-6: bei Planwirkung das zugeordnete Modell)
  if (!basis) return null;
  if (liste(m.abwesenheiten).some((a) => String(a.personId) === String(p.id) && a.von <= d && a.bis >= d)) return null;
  return basis;
}

/* ------------------------------------------------------------------------
   DIE PRÜFUNG EINER EINTEILUNG
   ------------------------------------------------------------------------ */
const SCHUTZ_QUELLE_NEUTRAL = "Schutzvorschrift oder Einsatzregel für diese Person";
const SCHUTZ_QUELLE_EINSCHRAENKUNG = "Schutzvorschrift oder Einsatzeinschränkung für diese Person";
/** Rufbereitschaft: keine Arbeitszeit, solange kein Einsatz erfasst ist. */
export const rufbereitschaft = (da) => !!da && (da.form === "ruf" || da.rufbereitschaft === true || da.ruhezeitNeutral === true);
const stufeVon = (regel, sonst) => (BEFUND_KATALOG[regel] && BEFUND_KATALOG[regel].stufe) || sonst;

/**
 * Die Befunde der Einteilung von Person p in Dienstart da am Tag d.
 * @param {any} m Betrieb (Dienstarten, Qualifikationen, Kompetenzen, Einstellungen)
 * @param {any} p Person (Rohdaten)
 * @param {any} da Dienstart mit start/ende
 * @param {string} d Tag JJJJ-MM-TT
 * @param {{ dienstAm: (p: any, d: string) => any, alleinOhnePartner: (p: any, d: string, daId: any) => boolean, heute: string,
 *   branchen?: { personenImDienst: (d: string, daId: any) => any[], module?: readonly any[] } }} k
 * @returns {{ regel: string, stufe: string, text: string, quelle: string, art: string, offen?: boolean, neutral?: boolean }[]}
 */
export function einteilungsBefunde(m, p, da, d, k) {
  const g = [];
  const push = (regel, text, quelle, art, stufe) => g.push({ regel, stufe: stufe || stufeVon(regel, "achtung"), text, quelle, art: art || "regel" });
  const e = (p.einschraenkungen && typeof p.einschraenkungen === "object") ? p.einschraenkungen : {};
  const einst = m.einstellungen || {};
  if (!imDienst(p, d)) push("bestand", "nicht im Bestand", "Beschäftigungsverhältnis", "bestand");
  /* Die eine Schutzprüfung: hart → „schutz" (sperrt), weich → „schutzWeich",
     nicht bewertbar → „schutzOffen". Den Grund einer neutralen Einsatzregel
     nennt der Befund nie. */
  for (const b of schutzEinsatz(p, da, d, einst)) {
    const quelle = b.neutral ? SCHUTZ_QUELLE_NEUTRAL : b.regel;
    g.push({ regel: b.sperrt ? "schutz" : b.offen ? "schutzOffen" : b.hinweis ? "schutzHinweis" : "schutzWeich", stufe: b.stufe, text: b.text, quelle,
      art: "schutz", offen: b.offen, neutral: b.neutral, hinweis: b.hinweis });
  }
  if (e.keineNacht && nachtAnteil(da, einst) >= nachtschwelle(einst))
    push("keineNacht", "keine Nachtdienste zugelassen", SCHUTZ_QUELLE_EINSCHRAENKUNG, "schutz");
  /* Verbindliche Qualifikationen: gesetzlich → Rechtsverstoß, betrieblich → Achtung. */
  if (da.form !== "ruf") {
    let land;                                                                // erst, wenn eine Qualifikation sperren kann
    for (const q of (Array.isArray(m.qualifikationen) ? m.qualifikationen : [])) {
      if (!q || typeof q !== "object" || !q.harteSperre) continue;
      if (land === undefined) land = landFuerEinheit(m, einheitAm(p, d));
      const v = sperreWirkt(m, q, land);
      if (!v || qualGueltig(m, p, q.id, k.heute)) continue;
      push(v.gesetzlich ? "qualifikationGesetzlich" : "qualifikationBetrieblich",
        `${q.name} fehlt oder ist abgelaufen — ${v.gesetzlich ? v.label : v.label + ", keine Rechtsvorschrift"}`,
        q.grundlage || v.label, "qualifikation", v.gesetzlich ? "recht" : "achtung");
    }
  }
  /* Kompetenzen, die diese Dienstart voraussetzt (Einweisung je Gerät). */
  for (const f of fehlendeKompetenzen(m.kompetenzen, p.kompetenzNachweise, da.id, d,
    (bmId) => { const bm = liste(m.betriebsmittel).find((x) => x.id === bmId); return bm ? bm.name : null; }))
    push("kompetenz", f.text, "§ 4 MPBetreibV / § 12 BetrSichV", "kompetenz");
  /* Ruhezeit vor und nach dem Dienst (zwei Tage in jede Richtung).
     Rufbereitschaft ist keine Arbeitszeit (ruhezeitNeutral, Nutzerentscheidung
     WP-22): Sie unterbricht keine Ruhezeit und braucht keine. Tatsächliche
     Einsätze aus einer Rufbereitschaft kennt die Planung nicht. */
  const [nStart, nEnde] = fenster(d, da);
  for (const off of rufbereitschaft(da) ? [] : [-2, -1, 1, 2]) {
    const dd = addDays(d, off);
    const id = k.dienstAm(p, dd);
    if (!id) continue;
    const other = finde(m.dienstarten, (x) => x.id === id);
    if (!other || !other.start || !other.ende || rufbereitschaft(other)) continue;
    const [oStart, oEnde] = fenster(dd, other);
    const ruhe = oStart > nStart ? (oStart - nEnde) / 60 : (nStart - oEnde) / 60;
    const rs = ruhezeitStufe(ruhe, einst.ruhezeit);
    if (rs) {
      push(rs === "recht" ? "ruhezeitGesetz" : "ruhezeitBetrieb", `Ruhezeit ${n1(Math.max(0, ruhe))} h zum Dienst am ${fKurz(dd)}`,
        rs === "recht" ? "§ 5 ArbZG" : `Ruhezeit ${n1(einst.ruhezeit)} h laut Tarif oder Betrieb`, "ruhezeit", rs);
      break;
    }
  }
  /* Dienste je Woche: Montag bis Sonntag, der geprüfte Tag nicht doppelt gezählt. */
  if (e.maxDiensteWoche) {
    const mo = montag(d);
    let n = 0;
    for (let i = 0; i < 7; i++) { const t = addDays(mo, i); if (t !== d && k.dienstAm(p, t)) n++; }
    if (n >= e.maxDiensteWoche)
      push("maxDiensteWoche", `bereits ${n} von ${e.maxDiensteWoche} Diensten in der Woche`, SCHUTZ_QUELLE_EINSCHRAENKUNG, "schutz");
  }
  /* Alleindienst: im Dienst braucht es jemanden ohne diese Einschränkung. */
  if (e.keinAlleindienst && k.alleinOhnePartner(p, d, da.id))
    push("keinAlleindienst", "darf nicht allein eingeteilt werden", SCHUTZ_QUELLE_EINSCHRAENKUNG, "schutz");
  /* Lange Dienste (Nutzerentscheidung, WP-22): automatisch erlaubt — ein
     Dienst über zehn Stunden ist nur ein Hinweis (Katalog: Stufe hinweis),
     keine Bestätigung, kein Protokoll. Ob ein Tarifvertrag oder eine
     Betriebsvereinbarung nach § 7 ArbZG die Verlängerung trägt, verantwortet
     der Betrieb. Rufbereitschaft zählt nicht. */
  if (!rufbereitschaft(da) && dauer(da) > HOECHST_TAG)
    push("tagesgrenze", `Dienst über ${n1(HOECHST_TAG)} Stunden (${n1(dauer(da))} h) — zulässig nur mit Regelung nach § 7 ArbZG`, "§ 3, § 7 ArbZG", "tagesgrenze");
  /* Branchenmodule (WP-19, Andockpunkt A2): nur aktive Module, nur wenn der
     Aufrufer die Besetzung des Dienstes kennt (die Oberfläche). Befundart
     „branche": Hinweis, sperrt nie. Die Nachrechnung des Servers reicht
     k.branchen nicht herein und bleibt dadurch so schnell wie vorher. */
  if (k.branchen && typeof k.branchen.personenImDienst === "function") for (const b of branchenBefunde(m, da, d, { ...k.branchen, person: p, dienstAm: k.dienstAm, qualGueltig, einheitAm, heute: k.heute })) g.push(b);
  return g;
}

/** Mindestbesetzung einer Dienstart an einem Tag — ohne Feiertagsanhebung (die rechnet die Oberfläche). */
export function mindestOhneFeiertag(da, d) {
  const md = da && da.mindest;
  if (!md || typeof md !== "object") return 0;
  const w = dow(d);
  const wert = w === 6 ? md.so : w === 5 ? md.sa : w === 4 ? md.fr : md.mo_do;
  return Number(wert) || 0;
}

/* ------------------------------------------------------------------------
   OFFENE SCHUTZKONFLIKTE (Nachprüfung 948a4ba A2; Nachtrag WP-22b)

   Künftige Einteilungen, denen eine harte Schutz- oder Einsatzregel der
   Person widerspricht — dazu die Einschränkung „keine Nacht“ mit dem
   Nachtfenster des Betriebs (dieselbe Quelle wie die Einsatzregel
   keinNachtdienst der Schichtverantwortung und keineNacht des Servers).
   Die Oberfläche rechnet sie im Hauptthread: deshalb ein Generator, der
   nach höchstens SCHUTZKONFLIKT_HAEPPCHEN_MS nachgibt, und Abweichungen je
   Person einmal vorindiziert. Schichtfolge ein Jahr voraus, ausdrückliche
   Einteilungen ohne Grenze.
   ------------------------------------------------------------------------ */
export const SCHUTZKONFLIKT_HAEPPCHEN_MS = 12;

/**
 * @param {any} m Betrieb
 * @param {{ heute: string, dienstAm: (p: any, d: string) => any, abwesend?: (p: any, d: string) => boolean, tageVoraus?: number }} k
 *   dienstAm: Kennung des Dienstes am Tag (Oberfläche: personTag)
 * @returns {Generator<void, Map<string, { person: any, datum: string, da: any }>, void>}
 */
export function* schutzkonflikteSchritte(m, k) {
  const aus = new Map();
  const d0 = k.heute;
  const bis = addDays(d0, k.tageVoraus || 365);
  const einst = (m && m.einstellungen) || {};
  const keineNacht = (p) => !!(p.einschraenkungen && typeof p.einschraenkungen === "object" && p.einschraenkungen.keineNacht === true);
  const relevant = liste(m && m.personen).filter((p) => p.mutterschutz || keineNacht(p)
    || (Array.isArray(p.planungsregeln) && p.planungsregeln.some((r) => r && r.hart))
    || (() => { const g = p.geburtstag || p.geburtsdatum; if (!g) return false; const a = between(g, d0) / 365.25; return a < 19; })());
  /* Relevanzfilter: Alter unter 19 (Tage / 365,25) ist bewusst eine Obermenge von „unter 18“ (Jugendschutz) —
     er spart nur Personen, die sicher nicht betroffen sind; die Regel selbst prüft schutzEinsatz mit dem genauen Alter. */
  if (!relevant.length) return aus;
  const ids = new Set(relevant.map((p) => String(p.id)));
  /* Abweichungen je Person: ein Durchlauf statt eines Schlüssels je Person und Tag. */
  const abw = new Map();
  const quelle = m.abweichungen && typeof m.abweichungen === "object" ? m.abweichungen : {};
  /* Nachtrag WP-22b (Review HOCH 1): dichter prüfen — im Vorindex je 16
     Schlüssel, danach je Tag; vorher je 64 bzw. je 4 Tage. */
  let t = performance.now();
  let n = 0;
  const zeitUm = () => performance.now() - t > SCHUTZKONFLIKT_HAEPPCHEN_MS;
  for (const key in quelle) {
    if ((++n & 15) === 0 && zeitUm()) { yield; t = performance.now(); }
    const i = key.lastIndexOf("|");
    const pid = key.slice(0, i);
    if (!ids.has(pid)) continue;
    if (!abw.has(pid)) abw.set(pid, []);
    abw.get(pid).push(key.slice(i + 1));
  }
  const daNach = new Map(liste(m.dienstarten).map((x) => [String(x.id), x]));
  const pruefe = (p, d) => {
    if (!imDienst(p, d) || (k.abwesend && k.abwesend(p, d))) return;
    const id = k.dienstAm(p, d);
    if (!id) return;
    const da = daNach.get(String(id));
    if (!da || !da.start || !da.ende) return;
    if (schutzEinsatz(p, da, d, einst).some((b) => b.sperrt)
      || (keineNacht(p) && nachtAnteil(da, einst) >= nachtschwelle(einst)))
      aus.set(`${p.id}|${d}`, { person: p, datum: d, da });
  };
  for (const p of relevant) {
    for (let d = d0; d <= bis; d = addDays(d, 1)) {
      pruefe(p, d);
      if (zeitUm()) { yield; t = performance.now(); }
    }
    for (const d of abw.get(String(p.id)) || []) {
      if (d <= bis) continue;
      pruefe(p, d);
      if (zeitUm()) { yield; t = performance.now(); }
    }
  }
  return aus;
}

export const SCHUTZKONFLIKT_ENTPRELLUNG_MS = 250;

/**
 * Rechnung entprellt starten und in Häppchen ausführen (Oberfläche; als
 * Funktion, damit Verzögerung und Häppchen ohne Browser prüfbar sind).
 * Zurück kommt die Abbruchfunktion; nach ihr wird nichts mehr gemeldet.
 * @param {any} m
 * @param {Parameters<typeof schutzkonflikteSchritte>[1]} k
 * @param {(ergebnis: Map<string, any>) => void} fertig
 * @param {{ verzoegerungMs?: number, timer?: typeof setTimeout, aufraeumen?: typeof clearTimeout }} [opt]
 */
export function planeSchutzkonflikte(m, k, fertig, opt = {}) {
  const timer = opt.timer || setTimeout, aufraeumen = opt.aufraeumen || clearTimeout;
  let vorbei = false;
  const uhr = timer(() => {
    const it = schutzkonflikteSchritte(m, k);
    const weiter = () => {
      if (vorbei) return;
      const r = it.next();
      if (r.done) fertig(r.value); else timer(weiter, 0);
    };
    weiter();
  }, opt.verzoegerungMs === undefined ? SCHUTZKONFLIKT_ENTPRELLUNG_MS : opt.verzoegerungMs);
  return () => { vorbei = true; aufraeumen(uhr); };
}

/** Synchron zu Ende rechnen (Prüfungen). */
export function schutzkonflikteSofort(m, k) {
  const it = schutzkonflikteSchritte(m, k);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
