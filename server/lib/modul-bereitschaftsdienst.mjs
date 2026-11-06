/* ==========================================================================
   MODUL BEREITSCHAFTSDIENST — Stufen, Inanspruchnahme, Anrechnung (WP-19, Strang B)

   Nach der Entscheidungsmatrix (vorläufig bis zur Nutzerentscheidung):
     R1 a  Tarifabhängige Stufen mit Quelle und Fassung; ohne Tarifwert bleibt
           der Faktor leer („ungeklärt“). Keine universellen Faktoren im Code.
     R2 c  Vergütungsbewertung (Stufenfaktor) und Arbeitszeit werden getrennt
           berechnet. Die Arbeitszeit einer Bereitschaft wird nie mit dem
           Faktor verkürzt.
     R4 a  Rufbereitschaft ist eine eigene Stufenart: Arbeitszeit zählt nur die
           tatsächliche Inanspruchnahme; die Vergütung folgt dem Faktor.
     Offen: Opt-out (R3), Ruhezeitbehandlung (R4), Konto (WP-22) — siehe
           docs/acc45/wp19-offene-fragen-agent.md. Dieses Modul rechnet kein
           Konto und keine Ruhezeit.

   Betriebsfelder: `bereitschaftStufen` (Sachfeld: Liste mit id) und
   `bereitschaft` (Personenfeld: Form „personId|Tag“, Wert: der Dienst mit
   Stufe, Fenster und Inanspruchnahmen).

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulAktiv, modulParameter } from "./branchenmodule.mjs";
import { REGELN_BRANCHEN, alsEinteilungsBefund } from "./branchenkatalog.mjs";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const echterTag = (s) => { if (typeof s !== "string" || !TAG.test(s)) return false; const t = new Date(`${s}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };
const idOk = (s) => typeof s === "string" && s.length >= 1 && s.length <= 60;
const minuten = (z) => Number(z.slice(0, 2)) * 60 + Number(z.slice(3, 5));

export const BEREITSCHAFT_ARTEN = Object.freeze(["bereitschaft", "rufbereitschaft"]);
export const BEREITSCHAFT_GRENZEN = Object.freeze({ stufen: 50, eintraege: 20_000, inanspruchnahmen: 20, quelleMax: 200, nameMax: 60 });
const TAG_MIN = 1440;

/** Dauer eines Fensters von beginn bis ende in Minuten (über Mitternacht erlaubt, nie 0). */
export function fensterMinuten(beginn, ende) {
  const d = (minuten(ende) - minuten(beginn) + TAG_MIN) % TAG_MIN;
  return d === 0 ? 0 : d;
}

/** Minuten ab Beginn des Fensters, mit Überlauf über Mitternacht. */
const relativ = (beginn, z) => (minuten(z) - minuten(beginn) + TAG_MIN) % TAG_MIN;

/**
 * Prüft eine Bereitschaftsstufe. Faktor: Zahl von 0 bis 1 oder null (ungeklärt).
 * @param {any} s
 * @param {any[]} [andere] übrige Stufen für die Eindeutigkeit
 * @returns {string | null}
 */
export function pruefeBereitschaftStufe(s, andere = []) {
  if (!istObjekt(s)) return "Stufe: erwartet wird ein Datensatz.";
  if (Object.keys(s).some((k) => !["id", "name", "art", "faktor", "quelle"].includes(k))) return "Stufe: unbekannte Felder.";
  if (!idOk(s.id)) return "Stufe: Kennung fehlt oder ist zu lang.";
  const wo = `Stufe ${String(s.name || s.id).slice(0, 30)}`;
  if (andere.some((x) => istObjekt(x) && x.id === s.id && x !== s)) return `${wo}: Kennung kommt doppelt vor.`;
  if (typeof s.name !== "string" || !s.name.trim() || s.name.length > BEREITSCHAFT_GRENZEN.nameMax) return `${wo}: Name fehlt oder ist zu lang.`;
  if (!BEREITSCHAFT_ARTEN.includes(s.art)) return `${wo}: Art ist „bereitschaft“ oder „rufbereitschaft“.`;
  if (s.faktor !== undefined && s.faktor !== null && (typeof s.faktor !== "number" || !Number.isFinite(s.faktor) || s.faktor < 0 || s.faktor > 1))
    return `${wo}: Faktor ist eine Zahl von 0 bis 1 oder leer (ungeklärt).`;
  if (s.quelle !== undefined && s.quelle !== null && (typeof s.quelle !== "string" || s.quelle.length > BEREITSCHAFT_GRENZEN.quelleMax))
    return `${wo}: Quelle ist zu lang.`;
  return null;
}

/**
 * Prüft einen Eintrag „Bereitschaft je Person und Tag“. Inanspruchnahmen liegen
 * im Fenster; das Fenster darf über Mitternacht gehen.
 * @param {any} e
 * @param {any[]} stufen
 * @returns {string | null}
 */
export function pruefeBereitschaftEintrag(e, stufen) {
  if (!istObjekt(e)) return "Bereitschaft: erwartet wird ein Dienst.";
  if (Object.keys(e).some((k) => !["stufe", "beginn", "ende", "inanspruchnahmen"].includes(k))) return "Bereitschaft: unbekannte Felder.";
  if (!idOk(e.stufe) || !stufen.some((s) => istObjekt(s) && s.id === e.stufe)) return "Bereitschaft: Stufe unbekannt.";
  if (typeof e.beginn !== "string" || !ZEIT.test(e.beginn) || typeof e.ende !== "string" || !ZEIT.test(e.ende)) return "Bereitschaft: Beginn und Ende im Format HH:MM.";
  const dauer = fensterMinuten(e.beginn, e.ende);
  if (dauer <= 0) return "Bereitschaft: das Fenster hat keine Dauer.";
  const liste = e.inanspruchnahmen === undefined ? [] : e.inanspruchnahmen;
  if (!Array.isArray(liste) || liste.length > BEREITSCHAFT_GRENZEN.inanspruchnahmen) return `Inanspruchnahme: höchstens ${BEREITSCHAFT_GRENZEN.inanspruchnahmen} Einträge als Liste.`;
  for (const i of liste) {
    if (!istObjekt(i) || !("von" in i) || !("bis" in i) || Object.keys(i).some((k) => !["von", "bis"].includes(k))) return "Inanspruchnahme: erwartet wird { von, bis }.";
    if (typeof i.von !== "string" || !ZEIT.test(i.von) || typeof i.bis !== "string" || !ZEIT.test(i.bis)) return "Inanspruchnahme: Zeiten im Format HH:MM.";
    const laenge = inanspruchnahmeLaenge(i);
    if (laenge <= 0) return "Inanspruchnahme: das Ende muss nach dem Beginn liegen.";
    if (relativ(e.beginn, i.von) + laenge > dauer) return "Inanspruchnahme: liegt außerhalb des Fensters.";
  }
  return null;
}

/** Länge einer Inanspruchnahme in Minuten (über Mitternacht erlaubt; gleiche Zeit = 0). */
export const inanspruchnahmeLaenge = (i) => (minuten(i.bis) - minuten(i.von) + TAG_MIN) % TAG_MIN;

/**
 * Anrechnung eines Eintrags: Arbeitszeit und Vergütungsbewertung getrennt (R2 c, R4 a).
 * @param {any} e
 * @param {any} stufe
 * @returns {{ dauerMinuten: number, arbeitszeitMinuten: number, verguetungsMinuten: number | null, status: "ok" | "ungeklaert" }}
 */
export function bereitschaftAnrechnung(e, stufe) {
  const dauer = fensterMinuten(e.beginn, e.ende);
  const inan = (Array.isArray(e.inanspruchnahmen) ? e.inanspruchnahmen : []).reduce((s, i) => s + inanspruchnahmeLaenge(i), 0);
  const arbeitszeit = stufe.art === "rufbereitschaft" ? inan : dauer;
  const faktor = typeof stufe.faktor === "number" ? stufe.faktor : null;
  const verguetung = faktor === null ? null : Math.round(dauer * faktor);
  return { dauerMinuten: dauer, arbeitszeitMinuten: arbeitszeit, verguetungsMinuten: verguetung, status: faktor === null ? "ungeklaert" : "ok" };
}

/** ISO-Woche (Montag als Anfang) als Schlüssel „JJJJ-Wnn“, reproduzierbar ohne Uhr. */
export function wochenSchluessel(datum) {
  const t = new Date(`${datum}T12:00:00Z`);
  const tag = (t.getUTCDay() + 6) % 7;
  const mo = new Date(t.getTime() - tag * 86400000);
  return mo.toISOString().slice(0, 10);
}

/**
 * Höchstarbeitszeit je Person und Woche (Vorgabe des Betriebs; 0 = keine Prüfung).
 * Liefert je Überschreitung einen Befund in der Form von einteilungsBefunde.
 * @param {any} m
 * @param {{ module?: readonly any[] }} [o]
 * @returns {any[]}
 */
export function bereitschaftHoechstBefunde(m, { module } = {}) {
  if (!modulAktiv(m, "bereitschaftsdienst", module)) return [];
  const grenze = Number(modulParameter(m, "bereitschaftsdienst", module).hoechstArbeitszeitStunden) || 0;
  if (grenze <= 0) return [];
  const stufen = Array.isArray(m.bereitschaftStufen) ? m.bereitschaftStufen : [];
  const summen = new Map();
  for (const [k, e] of Object.entries(m.bereitschaft && typeof m.bereitschaft === "object" ? m.bereitschaft : {})) {
    const [pid, tag] = [k.slice(0, k.lastIndexOf("|")), k.slice(k.lastIndexOf("|") + 1)];
    const stufe = stufen.find((s) => istObjekt(s) && s.id === e.stufe);
    if (!stufe || !echterTag(tag)) continue;
    const woche = `${pid}|${wochenSchluessel(tag)}`;
    summen.set(woche, (summen.get(woche) || 0) + bereitschaftAnrechnung(e, stufe).arbeitszeitMinuten);
  }
  const regel = REGELN_BRANCHEN.find((r) => r.id === "BEREIT-HOECHST-01");
  if (!regel) throw new Error("BEREIT-HOECHST-01 fehlt im Branchenkatalog.");
  const aus = [];
  for (const [woche, min] of [...summen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (min > grenze * 60) {
      const b = alsEinteilungsBefund(regel, { zustand: "verletzt", text: `Woche ab ${woche.split("|")[1]}: ${Math.round(min / 60 * 10) / 10} Stunden Arbeitszeit (Bereitschaft), Vorgabe ${grenze} Stunden` });
      if (b) aus.push(b);
    }
  }
  return aus;
}

/**
 * Schreibweg-Vertrag der Stufen und Einträge (Prüfung, keine Ablage).
 * @param {any} neuM
 * @returns {{ grund?: string }}
 */
export function bereitschaftZusammen(neuM) {
  if (!neuM || typeof neuM !== "object") return {};
  if (neuM.bereitschaftStufen !== undefined) {
    if (!Array.isArray(neuM.bereitschaftStufen) || neuM.bereitschaftStufen.length > BEREITSCHAFT_GRENZEN.stufen) return { grund: "Stufen: Liste erwartet, höchstens " + BEREITSCHAFT_GRENZEN.stufen + "." };
    for (const s of neuM.bereitschaftStufen) { const f = pruefeBereitschaftStufe(s, neuM.bereitschaftStufen); if (f) return { grund: f }; }
  }
  if (neuM.bereitschaft !== undefined) {
    if (!istObjekt(neuM.bereitschaft)) return { grund: "Bereitschaft: Form „Person|Tag“ erwartet." };
    const keys = Object.keys(neuM.bereitschaft);
    if (keys.length > BEREITSCHAFT_GRENZEN.eintraege) return { grund: `Bereitschaft: höchstens ${BEREITSCHAFT_GRENZEN.eintraege} Einträge.` };
    const stufen = Array.isArray(neuM.bereitschaftStufen) ? neuM.bereitschaftStufen : [];
    for (const k of keys) {
      const i = k.lastIndexOf("|");
      if (i < 1 || !echterTag(k.slice(i + 1))) return { grund: "Bereitschaft: Schlüssel haben die Form „Person|JJJJ-MM-TT“." };
      const f = pruefeBereitschaftEintrag(neuM.bereitschaft[k], stufen);
      if (f) return { grund: f };
    }
  }
  return {};
}
