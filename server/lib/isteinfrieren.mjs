/* ==========================================================================
   EINGEFRORENES IST ABGESCHLOSSENER MONATE (WP-16, Review H1)

   Das Ist eines Tages hängt nicht nur an Stempel und Erfassung (die der
   Abschluss sperrt), sondern auch am Plan: Ohne bestätigte Erfassung — und
   bei der Selbstauskunft „wie geplant" — zählt die Zeit der geplanten
   Dienstart (istZeitFuer), ihre Pause, die Abwesenheit und die
   Wochenstunden. Plan, Dienstarten und Abwesenheiten bleiben nach dem
   Abschluss bewusst änderbar (Korrekturen am Plan sollen möglich bleiben;
   Dienstarten gelten für alle Monate). Damit sich das Ist eines
   abgeschlossenen Monats trotzdem nicht ändert, friert der Abschluss es je
   Person und Tag ein:

     m.istEingefroren["personId|JJJJ-MM-TT"] =
       { da: {Dienstart, wie sie an dem Tag galt}, std, e?: 1 (erfasst),
         p?: 1 (zur Prüfung) }                       — ein Dienst
       { a: [Abwesenheitsarten], pl?: 1 (geplant), w: Wochenstunden }
                                                      — eine Abwesenheit

   Kein Eintrag: an dem Tag weder Dienst noch Abwesenheit. Gerechnet wird mit
   derselben Rechnung wie in der Oberfläche (istdaten.mjs, Schichtfolge und
   Posten wie personTag). Das Feld wird je Monat abgelegt (scherben.mjs)
   und gehört zu den Ist-Feldern des Abschlusses (monatsabschluss.mjs): in
   der Prüfsumme, über PUT nicht änderbar, beim Wiederöffnen verworfen,
   beim Wiederherstellen der heutige Stand. Für abgeschlossene Monate
   rechnen Stundenkonto, Lohnausgabe/DATEV, Zuschläge, Ausgleichszeitraum,
   Prüfungsansicht und Betriebsrat-Auswertung NUR damit (eingefrorenerTag).
   Sicht wie die Erfassung: Beschäftigte die eigenen, Betriebsrat keine,
   Schichtverantwortung eigene und Bereich (sicht.mjs).
   ========================================================================== */
import { einheitAm, imDienst, einheitDienst, teilzeitDienst } from "./fachpruefung.mjs";
import { between, dow, addDays } from "./regelwerk.mjs";
import { feiertag } from "./feiertage.mjs";
import { istZeitFuer, ungeplanterDienst, istVerfuegbar, UNGEPLANT_NAME } from "./istdaten.mjs";

export const IST_EINGEFROREN = "istEingefroren";

const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const liste = (w) => (Array.isArray(w) ? w : []).filter((x) => x && typeof x === "object");

/** Mindestbesetzung eines Dienstes an einem Tag; ein Feiertag hebt sie an, senkt sie nie (C5). */
export function mindestFuer(m, da, d) {
  const w = dow(d);
  const wt = w === 6 ? da.mindest.so : w === 5 ? da.mindest.sa : w === 4 ? da.mindest.fr : da.mindest.mo_do;
  return Math.max(wt, feiertag(d, m.bundesland) ? da.mindest.so : 0);
}

/* Abwesenheiten je Person, einmal je Zwischenspeicher (merk) — sonst liefe jeder Tag jeder Person über die ganze Liste. */
const ABW_INDEX = Symbol("abwesenheiten je Person");
function abwesenheitenVon(m, pid, merk) {
  let idx = merk.get(ABW_INDEX);
  if (!idx) {
    idx = new Map();
    for (const a of liste(m.abwesenheiten)) {
      const k = String(a.personId);
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(a);
    }
    merk.set(ABW_INDEX, idx);
  }
  return idx.get(String(pid)) || [];
}
const abwesend = (m, pid, d, merk) => abwesenheitenVon(m, pid, merk).some((a) => a.von <= d && a.bis >= d);

/**
 * Postenbesetzung (vorher nur in src/App.jsx): manuelle Zuweisungen zählen
 * an, der Pool bleibt stabil. Ungeeignete werden während der Iteration
 * übersprungen, nicht vorher entfernt — dadurch verschiebt ein einzelner
 * Ausfall die Besatzung nur um eine Person. `merk` ist der Zwischenspeicher
 * des Aufrufers (Oberfläche: je Bestand).
 * @returns {Set<any>}
 */
export function postenBesatzung(m, eid, d, pid, merk = new Map()) {
  const k = `${eid}|${d}|${pid}`;
  if (merk.has(k)) return merk.get(k);
  const ab = objekt(m.abweichungen) ? m.abweichungen : {};
  const posten = liste(m.dienstarten).find((x) => x.id === pid);
  const soll = posten ? mindestFuer(m, posten, d) : 0;
  const manuell = liste(m.personen).filter((p) => imDienst(p, d) && ab[`${p.id}|${d}`] === pid).map((p) => p.id);
  const rest = Math.max(0, soll - manuell.length);
  const out = new Set(manuell);
  if (rest === 0) { merk.set(k, out); return out; }
  const pool = liste(m.personen).filter((p) => imDienst(p, d) && einheitAm(p, d) === eid
      && p.imSchichtdienst !== false && p.funktion !== "Schichtleitung")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!pool.length) { merk.set(k, out); return out; }
  const start = Math.abs(between(m.anker, d)) % pool.length;
  let n = 0;
  for (let i = 0; i < pool.length && n < rest; i++) {
    const p = pool[(start + i) % pool.length];
    if (abwesend(m, p.id, d, merk)) continue;
    if (ab[`${p.id}|${d}`] !== undefined) continue;
    // Teilzeitkräfte, die an diesem Tag nicht arbeiten, können den Posten nicht besetzen
    if (p.springer || !teilzeitDienst(m, p, d, einheitDienst(m, eid, d))) continue;
    out.add(p.id); n++;
  }
  merk.set(k, out); return out;
}

/**
 * Der Tag einer Person nach Plan, wie ihn die Oberfläche (personTag) rechnet:
 * Schichtfolge mit Teilzeit, Abweichung, Posten, Abwesenheit. Außerhalb des
 * Beschäftigungsverhältnisses null.
 * @returns {null | {dienstId: any, plan: any, arten: string[]}}
 */
export function planTag(m, p, d, merk = new Map()) {
  if (!imDienst(p, d)) return null;
  const eid = einheitAm(p, d);
  const roh = (eid && !p.springer && p.imSchichtdienst !== false) ? einheitDienst(m, eid, d) : null;
  const plan = teilzeitDienst(m, p, d, roh);
  const ab = objekt(m.abweichungen) ? m.abweichungen[`${p.id}|${d}`] : undefined;
  let basis = ab !== undefined ? (ab === "-" ? null : ab) : plan;
  if (ab === undefined && plan) {
    const po = liste(m.dienstarten).find((x) => x.posten && x.quelle === plan);
    if (po && postenBesatzung(m, eid, d, po.id, merk).has(p.id)) basis = po.id;
  }
  const arten = abwesenheitenVon(m, p.id, merk).filter((a) => a.von <= d && a.bis >= d).map((a) => String(a.art));
  return { dienstId: arten.length ? null : basis, plan, arten };
}

/** Die Dienstart, wie sie an dem Tag galt — ohne Besetzungsvorgaben (nur, was das Ist braucht). */
export function dienstKopie(da) {
  const aus = {};
  for (const [k, v] of Object.entries(da || {})) {
    if (v === undefined) continue;
    if (v === null || typeof v !== "object" || k === "zweiterAbschnitt") aus[k] = v;
  }
  return aus;
}

const tageDes = (monat) => {
  const [j, mo] = monat.split("-").map(Number);
  const n = new Date(Date.UTC(j, mo, 0)).getUTCDate();
  const aus = [];
  for (let d = `${monat}-01`, i = 0; i < n; i++, d = addDays(d, 1)) aus.push(d);
  return aus;
};

/**
 * Das Ist eines Monats je Person und Tag einfrieren (am gespeicherten,
 * vollständigen Betrieb).
 * @returns {Record<string, object>}  Schlüssel „personId|JJJJ-MM-TT"
 */
export function istEinfrieren(m, monat) {
  const merk = new Map();
  const da = new Map(liste(m.dienstarten).map((x) => [x.id, x]));
  /* Das Einfrieren rechnet immer mit allen Ist-Daten (kein Rollenschutz). */
  const voll = { ...m, sichtIstDaten: undefined };
  const aus = {};
  for (const p of liste(m.personen)) {
    for (const d of tageDes(monat)) {
      const t = planTag(m, p, d, merk);
      if (!t) continue;
      const k = `${p.id}|${d}`;
      if (t.arten.length) {
        aus[k] = { a: t.arten, ...(t.plan ? { pl: 1 } : {}), w: Number.isFinite(Number(p.wochenstunden)) ? Number(p.wochenstunden) : 0 };
        continue;
      }
      const x = t.dienstId ? da.get(t.dienstId) : ungeplanterDienst(voll, p, d);
      if (!x) continue;
      const i = istZeitFuer(voll, p, d, x);
      aus[k] = { da: dienstKopie(x), std: i.std, ...(i.erfasst ? { e: 1 } : {}), ...(i.zurPruefung ? { p: 1 } : {}) };
    }
  }
  return aus;
}

/** Die eingefrorenen Einträge eines Monats aus dem Bestand. */
export function eingefrorenDesMonats(m, monat) {
  const w = m && objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  return Object.fromEntries(Object.entries(w).filter(([k]) => String(k).split("|")[1]?.slice(0, 7) === monat));
}

/** Wie viele Personentage weichen im gerechneten Ist heute vom eingefrorenen ab? (Hinweis beim Wiederöffnen) */
export function istAbweichungen(m, monat) {
  const jetzt = istEinfrieren(m, monat), eingefroren = eingefrorenDesMonats(m, monat);
  let n = 0;
  for (const k of new Set([...Object.keys(jetzt), ...Object.keys(eingefroren)]))
    if (JSON.stringify(jetzt[k] ?? null) !== JSON.stringify(eingefroren[k] ?? null)) n++;
  return n;
}

/**
 * Der eingefrorene Tag für die Rechnung (Oberfläche, Betriebsrat-Auswertung):
 *   undefined — der Monat ist nicht abgeschlossen oder die Ist-Daten dieser
 *               Person sind für die Rolle nicht zugänglich: wie bisher rechnen;
 *   null      — abgeschlossen, an dem Tag weder Dienst noch Abwesenheit;
 *   sonst der Eintrag.
 */
export function eingefrorenerTag(m, p, d) {
  const mon = String(d).slice(0, 7);
  const a = m && objekt(m.monatsabschluss) ? m.monatsabschluss[mon] : null;
  if (!objekt(a) || a.abgeschlossen !== true || !p) return undefined;
  if (!istVerfuegbar(m, p, d)) return undefined;
  const e = objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN][`${p.id}|${d}`] : undefined;
  return objekt(e) ? e : null;
}

/** Die Dienstart eines eingefrorenen Tages (ungeplanter Dienst: mit Namen wie in der Oberfläche). */
export function eingefrorenerDienst(e) {
  if (!objekt(e) || !objekt(e.da)) return null;
  return e.da.ungeplant === true ? { name: UNGEPLANT_NAME, ...e.da } : e.da;
}
