/* ==========================================================================
   MODUL OBJEKTBERICHT — Bericht je Objekt und Zeitraum (WP-19, Strang A)

   Nach der Entscheidungsmatrix (vorläufig bis zur Nutzerentscheidung):
     O1 a  Standard: nur aggregierte Soll- und Ist-Werte je Posten und Tag.
           Keine Namen, keine Kennungen von Personen im Bericht; die
           Personenkennung gibt es erst mit gesonderter Rechtsgrundlage (offen).
     O2 b  Ereignisse nur strukturiert (Datum, Uhrzeit, Art). Kein Freitext:
           der Text eines Wachbucheintrags steht nie im Bericht.
     O3 a  Soll aus der Postenplanung, Ist aus der bestätigten Dienstzeit. Ist
           die Dienstzeit für einen Tag nicht bekannt (null), heißt die Zeile
           „ungeklärt“ — nie „0“.
     O4 a+b Ausgabe als CSV (gleiche Prüfung wie der Bericht selbst); PDF ist
           nicht gebaut.
   Der Bericht ist reproduzierbar: gleiche Daten und Zeitraum, gleiches Ergebnis.
   Zugriff: nur Planung und Leitung (zugriff „voll“), sonst keine Ausgabe.

   Rein: keine Ablage, keine Uhr. Die Dienstzeit einer Person kommt als Funktion.
   ========================================================================== */
import { wachbuchListe, WACHBUCH_ARTEN } from "./modul-wachbuch.mjs";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const echterTag = (s) => { if (typeof s !== "string" || !TAG.test(s)) return false; const t = new Date(`${s}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; };

export const OBJEKTBERICHT_GRENZEN = Object.freeze({ spanneTage: 62, ereignisse: 5000 });

/** Tage von bis einschließlich (ISO), oder null, wenn der Zeitraum ungültig ist. */
function tageVon(von, bis) {
  if (!echterTag(von) || !echterTag(bis)) return null;
  if (von > bis) return null;
  const out = [];
  for (let t = new Date(`${von}T12:00:00Z`), e = new Date(`${bis}T12:00:00Z`); t <= e; t.setUTCDate(t.getUTCDate() + 1))
    out.push(t.toISOString().slice(0, 10));
  return out;
}

/**
 * Der Bericht für ein Objekt und einen Zeitraum.
 * @param {any} m Betrieb (objekte, postenPlan, dienstarten, wachbuch)
 * @param {{ objektId: string, von: string, bis: string, zugriff: string,
 *   dienstzeit: (datum: string, dienstId: string) => string[] | null }} o
 *   dienstzeit: Personenkennungen im Dienst an diesem Tag, null wenn unbekannt
 * @returns {{ grund: string } | { objekt: string, von: string, bis: string, tage: any[], ereignisse: any[] }}
 */
export function objektberichtDaten(m, { objektId, von, bis, zugriff, dienstzeit }) {
  if (zugriff !== "voll") return { grund: "Der Objektbericht ist nur für Planung und Leitung." };
  const tage = tageVon(von, bis);
  if (!tage) return { grund: "Zeitraum: Datum im Format JJJJ-MM-TT, der Anfang vor dem Ende." };
  if (tage.length > OBJEKTBERICHT_GRENZEN.spanneTage) return { grund: `Zeitraum: höchstens ${OBJEKTBERICHT_GRENZEN.spanneTage} Tage.` };
  const objekt = (Array.isArray(m && m.objekte) ? m.objekte : []).find((o) => istObjekt(o) && o.id === objektId);
  if (!objekt) return { grund: "Objekt unbekannt." };
  if (typeof dienstzeit !== "function") throw new Error("objektberichtDaten: Dienstzeit fehlt.");
  const dienste = (Array.isArray(m.dienstarten) ? m.dienstarten : []).filter((d) => istObjekt(d) && d.id).map((d) => d.id).sort();
  const plan = istObjekt(m.postenPlan) ? m.postenPlan : {};
  const posten = (Array.isArray(objekt.posten) ? objekt.posten : []).filter(istObjekt).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const tageAus = tage.map((datum) => {
    const zeilen = [];
    for (const dienstId of dienste) for (const p of posten) {
      const soll = p.soll && Number.isInteger(p.soll[dienstId]) ? p.soll[dienstId] : 0;
      if (soll <= 0) continue;
      const im = dienstzeit(datum, dienstId);
      if (im === null || im === undefined) { zeilen.push({ dienst: dienstId, posten: p.id, name: p.name, soll, ist: null, fehlt: null, status: "ungeklärt" }); continue; }
      const ist = im.filter((pid) => plan[`${pid}|${datum}`] === p.id).length;
      zeilen.push({ dienst: dienstId, posten: p.id, name: p.name, soll, ist, fehlt: Math.max(0, soll - ist), status: "ok" });
    }
    return { datum, zeilen };
  });

  const ereignisse = wachbuchListe(m.wachbuch)
    .filter((e) => e.objektId === objektId && e.datum >= von && e.datum <= bis && WACHBUCH_ARTEN.includes(e.art))
    .map((e) => ({ datum: e.datum, uhrzeit: e.uhrzeit, art: e.art }))
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.uhrzeit < b.uhrzeit ? -1 : a.uhrzeit > b.uhrzeit ? 1 : 0));
  if (ereignisse.length > OBJEKTBERICHT_GRENZEN.ereignisse) return { grund: `Ereignisse: höchstens ${OBJEKTBERICHT_GRENZEN.ereignisse}.` };
  return { objekt: objekt.name, von, bis, tage: tageAus, ereignisse };
}

/** CSV-Zelle: Semikolon, Anführungszeichen bei Sonderzeichen, Formelangriffe entschärft. */
function zelle(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV des Berichts (O4 b): Zeilen je Tag, Dienst und Posten; Ereignisse als eigene Tabelle.
 * @param {any} b Ergebnis von objektberichtDaten
 * @returns {string}
 */
export function objektberichtCsv(b) {
  if (!b || b.grund) return "";
  const kopf = ["Datum", "Dienst", "Posten", "Soll", "Ist", "Fehlt", "Status"];
  const zeilen = [`Objekt;${zelle(b.objekt)}`, `Zeitraum;${b.von};${b.bis}`, "", kopf.join(";")];
  for (const t of b.tage) for (const z of t.zeilen)
    zeilen.push([t.datum, z.dienst, z.name, z.soll, z.ist ?? "", z.fehlt ?? "", z.status].map(zelle).join(";"));
  zeilen.push("");
  zeilen.push(["Datum", "Uhrzeit", "Art"].join(";"));
  for (const e of b.ereignisse) zeilen.push([e.datum, e.uhrzeit, e.art].map(zelle).join(";"));
  return zeilen.join("\r\n") + "\r\n";
}
