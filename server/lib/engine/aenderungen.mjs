/* ==========================================================================
   ÄNDERUNGSÜBERSICHT — VERGLEICH ZWEIER PLANSTÄNDE (WP-I24, F15)

   „Was hat sich im Plan zwischen zwei Ständen geändert?" — je Person und Tag:
   neu (vorher frei, jetzt ein Dienst), entfernt (vorher ein Dienst, jetzt frei),
   geaendert (anderer Dienst oder geänderte Dienstzeiten). Rein: keine Ablage, keine
   Uhr (das Tagesdatum kommt vom Aufrufer), kein Zufall, kein Sprachmodell, kein Netz.
   Die Eingaben werden nie verändert.

   Der „Stand" eines Tages ist der WIRKSAME PLAN (Schichtfolge plus Abweichungen, wie
   personTag ihn rechnet) — OHNE Abwesenheiten: Abwesenheiten (und damit Krankmeldungen)
   werden für den Vergleich ausgeblendet, damit eine Abwesenheit nie als Planänderung
   erscheint und nichts über ihre Ursache verrät. Ausgegeben werden nur Kennungen,
   Art der Änderung, Tag und die Dienstzeiten (Beginn/Ende) der Dienstarten.

   Eingabe  vorher, nachher   Betrieb in Rollensicht (wie das Faktenpaket sie bekommt)
            optionen { von, bis, heute }   Zeitraum (höchstens 62 Tage) und Tagesdatum
   Ausgabe  { version, zeitraum, ereignisse[], zaehler, ohneVergleich }
            ereignis { personId, datum, art, von, nach, zeiten? }
              von/nach  Dienstart-Kennung oder null (frei)
              zeiten    nur bei gleicher Dienstart mit geänderten Zeiten:
                        { vorher: {beginn, ende}, nachher: {beginn, ende} }

   Nur Personen, die in BEIDEN Ständen stehen, werden verglichen (neu eingetretene oder
   entfernte Personen sind kein Planereignis; sie zählen in ohneVergleich).
   Reihenfolge: Tag, dann Personenkennung (stabil, ohne Zufall). Grenzen: Zeitraum
   <= 62 Tage, <= 400 Personen je Stand, <= 5000 Ereignisse (darüber: gekappt, gekuerzt: true).
   ========================================================================== */
import { personTag } from "./plan.mjs";
import { mitTagesdatum } from "./zeit.mjs";

export const AENDERUNGEN_VERSION = "aenderungen-0.1";
export const AENDERUNGEN_GRENZEN = Object.freeze({ tage: 62, personen: 400, ereignisse: 5000 });

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const istTag = (s) => typeof s === "string" && TAG.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const istObj = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const liste = (w) => (Array.isArray(w) ? w : []);
const tageZwischen = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const tagePlus = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const zeitOderNull = (x) => (typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x) ? x : null);

export class AenderungenEingabeFehler extends Error {
  constructor(meldung) { super(meldung); this.name = "AenderungenEingabeFehler"; this.code = "AENDERUNGEN_EINGABE"; }
}

function optionenPruefen(o) {
  if (!istObj(o) || !istTag(o.von) || !istTag(o.bis) || o.bis < o.von) throw new AenderungenEingabeFehler("Zeitraum fehlt oder ist ungültig.");
  if (tageZwischen(o.von, o.bis) + 1 > AENDERUNGEN_GRENZEN.tage) throw new AenderungenEingabeFehler("Zeitraum zu lang.");
  if (!istTag(o.heute)) throw new AenderungenEingabeFehler("Tagesdatum (heute) fehlt oder ist ungültig.");
  return { von: o.von, bis: o.bis, heute: o.heute };
}

/** Arbeitskopie eines Stands: ohne Abwesenheiten, ohne Entwurfsfilter-Hinweis (die Planungsrollen sehen alles). */
function stand(sicht) {
  if (!istObj(sicht)) throw new AenderungenEingabeFehler("Planstand fehlt.");
  const personen = liste(sicht.personen).filter((p) => istObj(p) && p.id !== undefined && p.id !== null);
  if (personen.length > AENDERUNGEN_GRENZEN.personen) throw new AenderungenEingabeFehler("Zu viele Personen.");
  const m = Object.create(sicht, {
    personen: { value: personen, enumerable: true },
    dienstarten: { value: liste(sicht.dienstarten), enumerable: true },
    einheiten: { value: liste(sicht.einheiten), enumerable: true },
    qualifikationen: { value: liste(sicht.qualifikationen), enumerable: true },
    abweichungen: { value: istObj(sicht.abweichungen) ? sicht.abweichungen : {}, enumerable: true },
    abwesenheiten: { value: [], enumerable: true },
    sichtEntwuerfe: { value: undefined, enumerable: true },
  });
  return m;
}

function dienstZeiten(m, id) {
  const d = id === null ? null : m.dienstarten.find((x) => istObj(x) && String(x.id) === id);
  return d ? { beginn: zeitOderNull(d.start), ende: zeitOderNull(d.ende) } : null;
}

/**
 * @param {object} vorher  Betrieb in Rollensicht, älterer Stand
 * @param {object} nachher Betrieb in Rollensicht, neuerer Stand
 * @param {{ von: string, bis: string, heute: string }} optionen
 */
export function planAenderungen(vorher, nachher, optionen) {
  const o = optionenPruefen(optionen);
  const a = stand(vorher);
  const b = stand(nachher);
  const idsA = new Map(a.personen.map((p) => [String(p.id), p]));
  const gemeinsam = b.personen.filter((p) => idsA.has(String(p.id)));
  const ohneVergleich = (a.personen.length + b.personen.length) - 2 * gemeinsam.length;
  const ereignisse = [];
  let gekuerzt = false;
  mitTagesdatum(o.heute, () => {
    for (let d = o.von; d <= o.bis && !gekuerzt; d = tagePlus(d, 1)) {
      for (const pb of gemeinsam) {
        const id = String(pb.id);
        const dA = personTag(a, idsA.get(id), d).dienstId;
        const dB = personTag(b, pb, d).dienstId;
        const von = dA === null || dA === undefined || dA === "" ? null : String(dA);
        const nach = dB === null || dB === undefined || dB === "" ? null : String(dB);
        let ev = null;
        if (von === null && nach !== null) ev = { personId: id, datum: d, art: "neu", von, nach };
        else if (von !== null && nach === null) ev = { personId: id, datum: d, art: "entfernt", von, nach };
        else if (von !== null && nach !== null) {
          if (von !== nach) ev = { personId: id, datum: d, art: "geaendert", von, nach };
          else {
            const zA = dienstZeiten(a, von), zB = dienstZeiten(b, nach);
            if (zA && zB && (zA.beginn !== zB.beginn || zA.ende !== zB.ende)) ev = { personId: id, datum: d, art: "geaendert", von, nach, zeiten: { vorher: zA, nachher: zB } };
          }
        }
        if (ev) {
          if (ereignisse.length >= AENDERUNGEN_GRENZEN.ereignisse) { gekuerzt = true; break; }
          ereignisse.push(ev);
        }
      }
    }
  });
  ereignisse.sort((x, y) => (x.datum < y.datum ? -1 : x.datum > y.datum ? 1 : x.personId < y.personId ? -1 : x.personId > y.personId ? 1 : 0));
  const zaehler = { neu: 0, geaendert: 0, entfernt: 0 };
  for (const e of ereignisse) zaehler[e.art]++;
  return { version: AENDERUNGEN_VERSION, zeitraum: { von: o.von, bis: o.bis }, ereignisse, zaehler, ohneVergleich, gekuerzt };
}
