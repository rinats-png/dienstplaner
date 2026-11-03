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
       { d: Verweis auf die Dienstart, wie sie an dem Tag galt (Verzeichnis
         "*|JJJJ-MM"), std, e?: 1 (erfasst), p?: 1 (zur Prüfung) } — ein Dienst
       { a: [Abwesenheitsarten], pl?: 1 (geplant), w: Wochenstunden }
                                                      — eine Abwesenheit
   dazu je Person und Monat Soll, Zuschläge, Zugehörigkeit und je Betrieb und
   Monat Dienstarten, Lohnarten, Zuschlagsregeln (Schema 2, unten bei
   istEinfrieren; WP-16 Nachtrag H-neu-1/M-neu-2).

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
import { einheitAm, imDienst, einheitDienst, teilzeitDienst, landFuerEinheit, nachtAnteil, nachtschwelle } from "./fachpruefung.mjs";
import { between, dow, addDays, toMin, fenster, uhrversatz, dim_, pad, dauer } from "./regelwerk.mjs";
import { gewertet, abwHoechste, abwBezahlt, LOHNARTEN_STD, RECHEN_STAND } from "./lohnrechnung.mjs";
import { feiertag } from "./feiertage.mjs";
import { istZeitFuer, ungeplanterDienst, istVerfuegbar, UNGEPLANT_NAME, zeitraumMonat } from "./istdaten.mjs";

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

/* --------------------------------------------------------------------------
   MONATSRECHNUNG (eine Fassung für Oberfläche und Abschluss, WP-16 Nachtrag M-neu-2)

   Soll, Feiertag aus Sicht der Person, Nachtanteil und Zuschlagsanteile eines
   Tages — vorher nur in src/App.jsx. Der Abschluss friert ihre Ergebnisse ein;
   die Oberfläche rechnet offene Monate mit genau diesen Funktionen.
   -------------------------------------------------------------------------- */

/** Feiertag aus Sicht einer bestimmten Person an einem Tag (Bundesland ihres Standorts). */
export function feiertagFuer(m, datum, p) {
  return feiertag(datum, p ? landFuerEinheit(m, einheitAm(p, datum)) : m.bundesland);
}

/** Soll eines Monats: Wochenstunden / 5 je Werktag im Beschäftigungsverhältnis, ohne Feiertage. */
export function sollMonat(m, p, ym) {
  const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1); let t = 0;
  for (let i = 1; i <= n; i++) { const d = `${ym}-${pad(i)}`;
    if (imDienst(p, d) && dow(d) < 5 && !feiertagFuer(m, d, p)) t++; }
  return Math.round(p.wochenstunden / 5 * t * 100) / 100;
}

/**
 * Nachtstunden an einem bestimmten Tag — mit der Sommerzeit. Der Sprungpunkt
 * liegt um 02:00 Ortszeit und damit immer innerhalb des Nachtfensters.
 */
export function nachtAnteilAm(datum, d, einst) {
  const [von, bis] = fenster(datum, d);
  const versatz = uhrversatz(von, bis);
  if (!versatz) return nachtAnteil(d, einst);
  return Math.max(0, Math.round((nachtAnteil(d, einst) + versatz / 60) * 100) / 100);
}

/** Zerlegt einen Dienst in Kalendertage (Nachtdienst Sa 21:30–So 07:15: anteilig Samstag und Sonntag). */
export function tagesanteile(datum, da) {
  const s = toMin(da.start);
  let e = toMin(da.ende);
  if (e <= s) e += 1440;
  const out = [];
  const ersterTeil = Math.min(e, 1440) - s;
  if (ersterTeil > 0) out.push({ datum, minuten: ersterTeil });
  if (e > 1440) out.push({ datum: addDays(datum, 1), minuten: e - 1440 });
  return out;
}

/** Nacht-, Sonn-, Feiertags- und Samstagsanteile eines Diensttages auf r aufaddieren (zuschlagStunden). */
export function zuschlagTagAddieren(m, p, d, da, r) {
  r.nacht += nachtAnteilAm(d, da, m.einstellungen);
  for (const teil of tagesanteile(d, da)) {
    const std = teil.minuten / 60;
    const w = dow(teil.datum);
    if (feiertagFuer(m, teil.datum, p)) r.feiertag += std;
    else if (w === 6) r.sonntag += std;
    else if (w === 5) r.samstag += std;
  }
}

/* --------------------------------------------------------------------------
   EINFRIEREN — kompakt und versioniert (WP-16 Nachtrag H-neu-1, M-neu-2)

   Schema 2 (FREEZE_SCHEMA) in m.istEingefroren, alle Schlüssel „…|JJJJ-MM[-TT]"
   (damit gelten Prüfsumme, PUT-Sperre, Wiederöffnen, Wiederherstellen,
   Monatsablage und Löschfrist unverändert):

     "*|JJJJ-MM"      Betrieb, einmal je Monat:
                      { v: 2, da: { ref: Dienstart wie am Abschluss },
                        la: Lohnarten, zs: Zuschlagsregeln }
     "pid|JJJJ-MM"    Person, einmal je Monat:
                      { s: Soll, z: [Nacht, Sonntag, Feiertag, Samstag],
                        nn: Nachtdienste, i: 1|0 (im Dienst am 28.), u: Einheit }
     "pid|JJJJ-MM-TT" Tag: { d: ref, std, e?, p?, u? }  Dienst
                           { a, pl?, w, u? }            Abwesenheit

   Ein Tag verweist auf die Dienstart im Verzeichnis des Monats (Schema 1: je
   Tag eine volle Kopie, ~266 B je Personentag). `u` am Tag nur, wenn die
   Einheit von der des Monats abweicht (Versetzung im Monat).
   Schema 1 (ohne "*|…", Tag mit `da`) bleibt lesbar.

   SCHEMA 3 (WP-16, Nachtrag dritter Opus-Delta-Review H-1/M-1/N-d) — dazu:
     "*|JJJJ-MM"   la: die WIRKSAMEN Lohnarten (eigene oder LOHNARTEN_STD, nie
                   null), zs: Zuschlagsregeln ([] statt null), rv: Rechenstand
                   (RECHEN_STAND), vo: Vormonate des Jahres, die beim Abschluss
                   offen waren (das Konto rechnet mit ihnen, wie sie damals waren)
     "pid|JJJJ-MM" g/gg/ig: geleistet, gutgeschrieben, Ist gesamt (wie
                   istStunden der Oberfläche), k: Stundenkonto zum Monatsende
                   (Übertrag `ue` + alle Monate des Jahres bis hierher, wie sie
                   zum Abschluss galten; null = nicht rechenbar), br:
                   [Bereitschaft, Ruf] in Stunden, nm: [Personalnummer,
                   Nachname, Vorname] für die Lohnausgabe.
   Damit liest die Lohnausgabe (DATEV) eines abgeschlossenen Monats NUR den
   Freeze (datevAusFreeze) — Übertrag, Vormonate, Personalstamm und
   Code-Konstanten ändern sie nicht mehr. Fail-closed (freezeStatus): fehlt
   bei Schema ≥ 2 das Verzeichnis oder der Monatseintrag einer Person, ist
   die Version unbekannt oder zu neu, oder verweist ein Tag ins Leere, ist das
   Ist „nicht verfügbar" (abschlussLuecke) — nie still 0 h oder live gerechnet.
   Schema 1 und 2 bleiben lesbar, sind aber als „nicht reproduzierbar"
   gekennzeichnet (Soll, Zuschläge oder Konto dort teils live).
   -------------------------------------------------------------------------- */
export const FREEZE_SCHEMA = 3;
const TAG_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONAT_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const betriebsSchluessel = (monat) => `*|${monat}`;
/** Ein Schlüssel ohne Personenbezug (Verzeichnis und Einstellungen des Betriebs). */
export const istBetriebsSchluessel = (k) => String(k).startsWith("*|");
/** Ein Schlüssel je Person und Tag (nicht je Monat, nicht Betrieb). */
export const istTagesSchluessel = (k) => !istBetriebsSchluessel(k) && TAG_RE.test(String(k).split("|")[1] || "");
/** Ein Schlüssel je Person und Monat. */
export const istMonatsSchluessel = (k) => !istBetriebsSchluessel(k) && MONAT_RE.test(String(k).split("|")[1] || "");

const tageDes = (monat) => {
  const [j, mo] = monat.split("-").map(Number);
  const n = new Date(Date.UTC(j, mo, 0)).getUTCDate();
  const aus = [];
  for (let d = `${monat}-01`, i = 0; i < n; i++, d = addDays(d, 1)) aus.push(d);
  return aus;
};
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Das Ist eines Monats je Person und Tag einfrieren (am gespeicherten,
 * vollständigen Betrieb) — dazu je Person Soll, Zuschläge, Zugehörigkeit und
 * je Betrieb Dienstarten, Lohnarten und Zuschlagsregeln.
 * @returns {Record<string, object>}
 */
export function istEinfrieren(m, monat) {
  const merk = new Map();
  const ctx = einfrierKontext(m);
  const aus = {};
  const verzeichnis = {}; const refs = new Map();
  const ref = (x) => {
    const kopie = dienstKopie(x); const j = JSON.stringify(kopie);
    let r = refs.get(j);
    if (r === undefined) { r = refs.size; refs.set(j, r); verzeichnis[r] = kopie; }
    return r;
  };
  const tage = tageDes(monat);
  /* Die Vormonate des Jahres, die jetzt offen sind: Das Konto rechnet mit ihrem heutigen Stand (gekennzeichnet). */
  const vo = vormonate(monat).filter((x) => !abgeschlossenerEintrag(m, x));
  for (const p of liste(m.personen)) {
    const pm = personMonat(m, p, monat, tage, merk, ctx, ref);
    if (!pm) continue;
    Object.assign(aus, pm.tage);
    aus[`${p.id}|${monat}`] = pm.monat;
  }
  const b = { v: FREEZE_SCHEMA, da: verzeichnis,
    /* Die wirksamen Lohnarten (WP-16, Nachtrag dritter Review M-1/N-d): ohne eigene die Standardnummern — nie null,
       sonst griffen später angelegte Lohnarten rückwirkend. Zuschlagsregeln ohne Regeln: [] statt null. */
    la: objekt(m.lohnarten) ? m.lohnarten : LOHNARTEN_STD, zs: Array.isArray(m.zuschlaege) ? m.zuschlaege : [],
    rv: RECHEN_STAND, ...(vo.length ? { vo } : {}) };
  aus[betriebsSchluessel(monat)] = b;
  /* Zweiter Gang: Summen aus genau den eingefrorenen Tagen (dieselbe Rechnung wie die Oberfläche im abgeschlossenen
     Monat) und das Konto zum Monatsende. */
  const w = { ...(objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {}), ...aus };
  for (const p of liste(m.personen)) {
    const k = `${p.id}|${monat}`;
    if (!aus[k]) continue;
    const t = summeAusTagen(w, monat, p.id);
    const ue = p.stundenuebertrag || 0;
    const konto = kontoBis(m, p, monat, { ig: t.ig, s: aus[k].s }, merk, ctx, ue);
    aus[k] = { ...aus[k], g: t.g, gg: t.gg, ig: t.ig, br: t.br, ue, k: konto,
      nm: [p.personalnummer || p.id, p.nachname ?? null, p.vorname ?? null] };
  }
  return aus;
}

/** Was das Einfrieren je Betrieb einmal braucht. */
function einfrierKontext(m) {
  return { da: new Map(liste(m.dienstarten).map((x) => [x.id, x])),
    /* Das Einfrieren rechnet immer mit allen Ist-Daten (kein Rollenschutz). */
    voll: { ...m, sichtIstDaten: undefined }, einst: m.einstellungen || {} };
}

/** Die Tage und der Monatseintrag (Soll, Zuschläge, Zugehörigkeit) einer Person — null, wenn nie im Dienst. */
function personMonat(m, p, monat, tage, merk, ctx, ref) {
  const tageAus = {};
  let im = false, u, naechte = 0;
  const z = { nacht: 0, sonntag: 0, feiertag: 0, samstag: 0 };
  for (const d of tage) {
    const t = planTag(m, p, d, merk);
    if (!t) continue;
    const eid = einheitAm(p, d) ?? null;
    if (!im) { im = true; u = eid; }
    const uT = eid !== u ? { u: eid } : {};
    const k = `${p.id}|${d}`;
    if (t.arten.length) {
      tageAus[k] = { a: t.arten, ...(t.plan ? { pl: 1 } : {}), w: Number.isFinite(Number(p.wochenstunden)) ? Number(p.wochenstunden) : 0, ...uT };
      continue;
    }
    const x = t.dienstId ? ctx.da.get(t.dienstId) : ungeplanterDienst(ctx.voll, p, d);
    if (!x) continue;
    const i = istZeitFuer(ctx.voll, p, d, x);
    tageAus[k] = { d: ref(x), std: i.std, ...(i.erfasst ? { e: 1 } : {}), ...(i.zurPruefung ? { p: 1 } : {}), ...uT };
    zuschlagTagAddieren(m, p, d, x, z);
    if (nachtAnteilAm(d, x, ctx.einst) >= nachtschwelle(ctx.einst)) naechte++;
  }
  if (!im) return null;
  const s = sollMonat(m, p, monat);
  return { tage: tageAus, monat: { ...(Number.isFinite(s) ? { s } : {}), z: [r2(z.nacht), r2(z.sonntag), r2(z.feiertag), r2(z.samstag)],
    nn: naechte, i: imDienst(p, `${monat}-28`) ? 1 : 0, u: u ?? null } };
}

/** Die Monate des Jahres vor diesem ("2026-10" → "2026-01" … "2026-09"). */
function vormonate(monat) {
  const [j, mo] = monat.split("-").map(Number);
  return Array.from({ length: mo - 1 }, (_, i) => `${j}-${pad(i + 1)}`);
}

/**
 * Ist-Summen eines Monats aus den eingefrorenen Tagen — dieselbe Rechnung wie istStunden der Oberfläche im
 * abgeschlossenen Monat: Dienst gewertet (Anrechnungsfaktor), bezahlte Abwesenheit an geplanten Tagen mit
 * Wochenstunden / 5; dazu Bereitschafts- und Rufstunden (Dauer der Dienstart) für die Lohnausgabe.
 */
function summeAusTagen(w, monat, pid) {
  let g = 0, gg = 0, ber = 0, ruf = 0;
  for (const d of tageDes(monat)) {
    const e = w[`${pid}|${d}`];
    if (!objekt(e)) continue;
    if (Array.isArray(e.a) && e.a.length) {
      if (abwBezahlt(abwHoechste(e.a)) && e.pl) gg += (Number.isFinite(Number(e.w)) ? Number(e.w) : 0) / 5;
      continue;
    }
    const x = aufgeloest(w, monat, pid, e).da;
    if (!objekt(x)) continue;
    g += gewertet(x, Number(e.std));
    if (x.form === "bereitschaft") ber += dauer(x);
    else if (x.form === "ruf" || x.rufbereitschaft) ruf += dauer(x);
  }
  return { g: r2(g), gg: r2(gg), ig: r2(g + gg), br: [ber, ruf] };
}

/**
 * Ist gesamt und Soll eines (anderen) Monats für das Konto: abgeschlossen aus dem Freeze, offen wie heute gerechnet.
 * null: nicht rechenbar (Freeze fehlt oder unbekannt) — dann ist auch das Konto unbekannt.
 */
function monatFuerKonto(m, p, mon, merk, ctx) {
  if (abgeschlossenerEintrag(m, mon)) {
    const st = freezeStatus(m, mon);
    if (!st || st.unbekannt || freezeDefekt(m, p, mon, st)) return null;
    const w = objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
    const fm = w[`${p.id}|${mon}`];
    if (objekt(fm) && Number.isFinite(fm.ig)) return { ig: fm.ig, s: Number.isFinite(fm.s) ? fm.s : sollMonat(m, p, mon) };
    return { ig: summeAusTagen(w, mon, p.id).ig, s: objekt(fm) && Number.isFinite(fm.s) ? fm.s : sollMonat(m, p, mon) };
  }
  /* Offen: wie heute gerechnet — dieselbe Tagesrechnung wie beim Einfrieren, mit eigenem Verzeichnis. */
  const lokal = {}; let n = 0;
  const pm = personMonat(m, p, mon, tageDes(mon), merk, ctx, (x) => { lokal[n] = dienstKopie(x); return n++; });
  if (!pm) return { ig: 0, s: sollMonat(m, p, mon) };
  return { ig: summeAusTagen({ ...pm.tage, [betriebsSchluessel(mon)]: { da: lokal } }, mon, p.id).ig, s: sollMonat(m, p, mon) };
}

/** Stundenkonto zum Ende des Monats wie stundenkonto() der Oberfläche: Übertrag + Σ (Ist − Soll) ab Januar. */
function kontoBis(m, p, monat, dieser, merk, ctx, ue) {
  let d = ue;
  for (const mon of [...vormonate(monat), monat]) {
    const x = mon === monat ? dieser : monatFuerKonto(m, p, mon, merk, ctx);
    if (!x || x.ig === null || x.ig === undefined) return null;
    d += x.ig - x.s;
  }
  return Number.isFinite(d) ? Math.round(d * 10) / 10 : null;
}

/** Die eingefrorenen Einträge eines Monats aus dem Bestand. */
export function eingefrorenDesMonats(m, monat) {
  const w = m && objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  return Object.fromEntries(Object.entries(w).filter(([k]) => String(k).split("|")[1]?.slice(0, 7) === monat));
}

/** Ein Tageseintrag mit aufgelöster Dienstart (`da`) und Einheit (`u`) — Schema 1 und 2. */
function aufgeloest(w, monat, pid, e) {
  const b = w[betriebsSchluessel(monat)];
  const pm = w[`${pid}|${monat}`];
  const { d: ref, ...rest } = e;
  let da = e.da;
  if (ref !== undefined) da = objekt(b) && objekt(b.da) && objekt(b.da[ref]) ? b.da[ref] : undefined;
  const u = e.u !== undefined ? e.u : (objekt(pm) && pm.u !== undefined ? pm.u : undefined);
  if (da) rest.da = da; else delete rest.da;
  if (u !== undefined) rest.u = u;
  return rest;
}

/** Wie viele Personentage weichen im gerechneten Ist heute vom eingefrorenen ab? (Hinweis beim Wiederöffnen) */
export function istAbweichungen(m, monat) {
  const jetzt = istEinfrieren(m, monat), eingefroren = eingefrorenDesMonats(m, monat);
  const vergleich = (w, k) => {
    if (!objekt(w[k])) return null;
    const x = aufgeloest(w, monat, String(k).split("|")[0], w[k]);
    delete x.u;
    return JSON.stringify(x);
  };
  let n = 0;
  for (const k of new Set([...Object.keys(jetzt), ...Object.keys(eingefroren)])) {
    if (!istTagesSchluessel(k)) continue;
    if (vergleich(jetzt, k) !== vergleich(eingefroren, k)) n++;
  }
  return n;
}

const abgeschlossenerEintrag = (m, mon) => {
  const a = m && objekt(m.monatsabschluss) ? m.monatsabschluss[mon] : null;
  return objekt(a) && a.abgeschlossen === true ? a : null;
};

/** Gibt es zu dieser Person im Freeze des Monats irgendetwas (Monats- oder Tageseintrag)? */
function personImFreeze(w, pid, mon) {
  if (objekt(w[`${pid}|${mon}`])) return true;
  for (let i = 1; i <= 31; i++) if (objekt(w[`${pid}|${mon}-${pad(i)}`])) return true;
  return false;
}

/**
 * Stand des Freezes eines abgeschlossenen Monats (WP-16, Nachtrag dritter Review M-1) — null, wenn der Monat offen ist.
 *   { schema: 1 }  Altabschluss ohne Verzeichnis: Tage lesbar, Soll/Zuschläge/Konto live — nicht reproduzierbar;
 *   { schema: 2 }  ohne Konto, Summen und Personalangaben — nicht reproduzierbar (Konto, Lohnausgabe teils live);
 *   { schema: 3, reproduzierbar: true };
 *   { unbekannt: true, grund }  Version unbekannt oder zu neu, Abschluss und Verzeichnis widersprechen sich oder das
 *                  Verzeichnis fehlt, obwohl der Abschluss Schema ≥ 2 sagt — dann ist nichts verfügbar (fail-closed).
 * Die Version steht im Verzeichnis (`v`) und — für Planung und Leitung — am Abschluss (`schema`); andere Rollen sehen
 * am Abschluss nur den Status.
 */
export function freezeStatus(m, mon) {
  const a = abgeschlossenerEintrag(m, mon);
  if (!a) return null;
  const w = objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  const b = w[betriebsSchluessel(mon)];
  const es = a.schema;
  const bekannt = (x, min) => Number.isInteger(x) && x >= min && x <= FREEZE_SCHEMA;
  if (es !== undefined && !bekannt(es, 1)) return { unbekannt: true, grund: "version" };
  if (objekt(b)) {
    if (!bekannt(b.v, 2)) return { unbekannt: true, grund: "version" };
    if (es !== undefined && es !== b.v) return { unbekannt: true, grund: "version" };
    if (!objekt(b.da)) return { unbekannt: true, grund: "verzeichnis" };
    return b.v >= 3 ? { schema: b.v, reproduzierbar: true } : { schema: b.v };
  }
  if (es !== undefined && es >= 2) return { unbekannt: true, grund: "verzeichnis" };
  return { schema: 1 };
}

/**
 * Ist der Freeze dieser Person im abgeschlossenen Monat unbrauchbar? Schema ≥ 2: Monatseintrag fehlt (P5) oder ein
 * Tag verweist auf eine Dienstart, die das Verzeichnis nicht hat (P3); Schema 1: gar nichts zur Person (N3).
 */
function freezeDefekt(m, p, mon, st) {
  const w = objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  if (st.schema >= 2 ? !objekt(w[`${p.id}|${mon}`]) : !personImFreeze(w, p.id, mon)) return true;
  const b = w[betriebsSchluessel(mon)];
  const da = objekt(b) && objekt(b.da) ? b.da : null;
  for (let i = 1; i <= 31; i++) {
    const e = w[`${p.id}|${mon}-${pad(i)}`];
    if (objekt(e) && e.d !== undefined && !(da && objekt(da[e.d]))) return true;
  }
  return false;
}

/**
 * Fehlt der Freeze dieser Person im abgeschlossenen Monat (Review N3) oder ist er unbrauchbar (Nachtrag dritter
 * Review M-1: Verzeichnis fehlt, Version unbekannt, Monatseintrag fehlt, Verweis ins Leere)? Etwa: Person
 * nachträglich mit Eintritt im abgeschlossenen Monat angelegt, oder ein Abschluss ohne Freeze. Dann ist das Ist
 * nicht 0 h, sondern unbekannt — ein Prüffall (fail-closed). Für Rollen ohne Ist-Zugang und für tageweise
 * begrenzte Sicht (Schichtverantwortung nach Versetzung) wird nicht geurteilt.
 */
export function abschlussLuecke(m, p, mon) {
  if (!p || !abgeschlossenerEintrag(m, mon)) return false;
  const s = m.sichtIstDaten;
  if (s && s.umfang === "personen" && objekt(s.zeitraeume) && s.zeitraeume[String(p.id)] !== undefined) return false;
  if (!istVerfuegbar(m, p, zeitraumMonat(mon))) return false;
  if (!tageDes(mon).some((d) => imDienst(p, d))) return false;
  const st = freezeStatus(m, mon);
  if (!st || st.unbekannt) return true;
  return freezeDefekt(m, p, mon, st);
}
/** Alle Personen eines abgeschlossenen Monats ohne Freeze (für Hinweis und Lohnausgabe). */
export function abschlussLuecken(m, mon) {
  return liste(m && m.personen).filter((p) => abschlussLuecke(m, p, mon));
}
export const ABSCHLUSS_LUECKE_TEXT = "Im abgeschlossenen Monat fehlt das eingefrorene Ist — "
  + "Stunden nicht verfügbar (Prüffall: Monat wiederöffnen und erneut abschließen).";
/** Markierung eines Tages ohne Freeze im abgeschlossenen Monat. */
export const LUECKE = Object.freeze({ luecke: true });

/**
 * Der eingefrorene Tag für die Rechnung (Oberfläche, Betriebsrat-Auswertung):
 *   undefined — der Monat ist nicht abgeschlossen oder die Ist-Daten dieser
 *               Person sind für die Rolle nicht zugänglich: wie bisher rechnen;
 *   null      — abgeschlossen, an dem Tag weder Dienst noch Abwesenheit;
 *   LUECKE    — abgeschlossen, aber für die Person fehlt der Freeze (N3) oder er ist unbrauchbar (M-1);
 *   sonst der Eintrag (Dienstart aufgelöst als `da`, Einheit als `u`).
 */
export function eingefrorenerTag(m, p, d) {
  const mon = String(d).slice(0, 7);
  if (!p || !abgeschlossenerEintrag(m, mon)) return undefined;
  if (!istVerfuegbar(m, p, d)) return undefined;
  /* Erst prüfen, ob der Freeze der Person brauchbar ist — ein Tag mit Verweis ins Leere wäre sonst still 0 h (P3). */
  if (abschlussLuecke(m, p, mon)) return LUECKE;
  const w = objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  const e = w[`${p.id}|${d}`];
  if (objekt(e)) return aufgeloest(w, mon, p.id, e);
  return null;
}

/** Der Monatseintrag einer Person (Soll, Zuschläge, Zugehörigkeit, Konto) im abgeschlossenen Monat — sonst undefined. */
export function eingefrorenerMonat(m, p, mon) {
  if (!p || !abgeschlossenerEintrag(m, mon)) return undefined;
  if (!istVerfuegbar(m, p, zeitraumMonat(mon))) return undefined;
  const st = freezeStatus(m, mon);
  if (!st || st.unbekannt) return undefined;
  const w = objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  const e = w[`${p.id}|${mon}`];
  return objekt(e) ? e : undefined;
}

/** Der Betriebseintrag (Dienstarten, Lohnarten, Zuschlagsregeln) im abgeschlossenen Monat — sonst undefined. */
export function eingefrorenerBetrieb(m, mon) {
  const st = freezeStatus(m, mon);
  if (!st || st.unbekannt) return undefined;
  const w = objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  const e = w[betriebsSchluessel(mon)];
  return objekt(e) ? e : undefined;
}

/* --------------------------------------------------------------------------
   LOHNAUSGABE AUS DEM FREEZE (WP-16, Nachtrag dritter Review H-1)

   Für einen abgeschlossenen Monat (Schema 3) entstehen die DATEV-Zeilen nur aus
   dem Freeze: Lohnarten aus dem Verzeichnis, je Person Zugehörigkeit (`i`),
   Zuschläge (`z`), Bereitschaft/Ruf (`br`), Konto (`k`, Mehrarbeit) und die
   Personalangaben (`nm`) — auch für eine Person, die heute nicht mehr im
   Personalstamm steht. Oberfläche (Datei) und Server (Prüfsumme der Zeilen
   beim Bestätigen des Lohnexports) rechnen damit dieselben Zeilen.
   -------------------------------------------------------------------------- */
const DATEV_FOLGE = [["nacht", 0], ["sonntag", 1], ["feiertag", 2], ["samstag", 3]];
/**
 * DATEV-Zeilen eines abgeschlossenen Monats nur aus dem Freeze — null, wenn der Monat dafür nicht taugt (offen,
 * Schema < 3, unbekannt, Lohnarten fehlen). Personen mit unbrauchbarem Freeze fehlen (Prüffall, datevHinweise).
 * @returns {null | Array<{personalnummer: any, nachname: any, vorname: any, lohnart: string, bezeichnung: string, stunden: number, monat: string}>}
 */
export function datevAusFreeze(m, mon) {
  const st = freezeStatus(m, mon);
  if (!st || st.unbekannt || !st.reproduzierbar) return null;
  const w = objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  const b = w[betriebsSchluessel(mon)];
  if (!objekt(b.la)) return null;
  const la = b.la;
  const zeilen = [];
  for (const [k, e] of Object.entries(w)) {
    if (!istMonatsSchluessel(k) || String(k).split("|")[1] !== mon || !objekt(e)) continue;
    if (e.i !== 1) continue;
    const pid = String(k).split("|")[0];
    if (freezeDefekt(m, { id: pid }, mon, st)) continue;
    const nm = Array.isArray(e.nm) ? e.nm : [pid, null, null];
    const eintrag = (schluessel, stunden) => {
      if (!stunden || Math.abs(stunden) < 0.01) return;
      const l = la[schluessel] || { nr: "9999", text: schluessel };
      zeilen.push({ personalnummer: nm[0], nachname: nm[1], vorname: nm[2],
        lohnart: l.nr, bezeichnung: l.text, stunden: Math.round(stunden * 100) / 100, monat: mon });
    };
    const z = Array.isArray(e.z) ? e.z : [];
    for (const [s, i] of DATEV_FOLGE) eintrag(s, Number(z[i]) || 0);
    const br = Array.isArray(e.br) ? e.br : [];
    eintrag("bereitschaft", Number(br[0]) || 0);
    eintrag("ruf", Number(br[1]) || 0);
    if (Number.isFinite(e.k) && e.k > 0) eintrag("mehrarbeit", e.k);
  }
  return zeilen;
}

/**
 * Hinweise zur Lohnausgabe eines abgeschlossenen Monats — Prüffälle statt stiller Zahlen (null: Monat offen):
 *   unbekannt         Freeze unbrauchbar (Version, Verzeichnis): keine Zeilen;
 *   nichtReproduzierbar  Schema 1/2: Soll/Zuschläge/Konto teils mit heutigen Stammdaten gerechnet;
 *   lohnartenFehlen   Verzeichnis ohne Lohnarten: keine Zeilen;
 *   entfernt          Personen im Freeze, die nicht mehr im Personalstamm stehen (Zeilen bleiben, aus dem Abschluss);
 *   kontoFehlt        Personen, deren Konto zum Abschluss nicht rechenbar war (keine Mehrarbeitszeile);
 *   vormonateOffen    Vormonate des Jahres, die beim Abschluss offen waren oder es heute sind (Konto vorläufig);
 *   rechenstand       der Abschluss entstand mit einem anderen Rechenstand (Code-Konstanten, N-d).
 */
export function datevHinweise(m, mon) {
  const st = freezeStatus(m, mon);
  if (!st) return null;
  if (st.unbekannt) return { unbekannt: true, entfernt: [], kontoFehlt: [], vormonateOffen: [] };
  const w = objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  const b = w[betriebsSchluessel(mon)];
  const personen = new Set(liste(m.personen).map((p) => String(p.id)));
  const entfernt = [], kontoFehlt = [];
  if (st.reproduzierbar) for (const [k, e] of Object.entries(w)) {
    if (!istMonatsSchluessel(k) || String(k).split("|")[1] !== mon || !objekt(e) || e.i !== 1) continue;
    const pid = String(k).split("|")[0];
    const nm = Array.isArray(e.nm) ? e.nm : [pid, null, null];
    const wer = { personId: pid, personalnummer: nm[0], nachname: nm[1], vorname: nm[2] };
    if (!personen.has(pid)) entfernt.push(wer);
    if (!Number.isFinite(e.k)) kontoFehlt.push(wer);
  }
  const offenHeute = vormonate(mon).filter((x) => !abgeschlossenerEintrag(m, x));
  const vormonateOffen = [...new Set([...(objekt(b) && Array.isArray(b.vo) ? b.vo : []), ...offenHeute])].sort();
  return { unbekannt: false, nichtReproduzierbar: !st.reproduzierbar, schema: st.schema,
    lohnartenFehlen: st.schema >= 2 && objekt(b) && !objekt(b.la), entfernt, kontoFehlt, vormonateOffen,
    rechenstand: st.reproduzierbar && objekt(b) && b.rv !== RECHEN_STAND ? (b.rv ?? null) : undefined };
}

/** Das eingefrorene Ist einer Person für die Auskunft (Art. 15): Tage mit aufgelöster Dienstart, Monatseinträge. */
export function eingefrorenFuerPerson(m, pid) {
  const w = m && objekt(m[IST_EINGEFROREN]) ? m[IST_EINGEFROREN] : {};
  const aus = {};
  for (const [k, v] of Object.entries(w)) {
    if (String(k).split("|")[0] !== String(pid) || !objekt(v)) continue;
    aus[k] = istTagesSchluessel(k) ? aufgeloest(w, String(k).split("|")[1].slice(0, 7), pid, v) : v;
  }
  return aus;
}

/** Die Dienstart eines eingefrorenen Tages (ungeplanter Dienst: mit Namen wie in der Oberfläche). */
export function eingefrorenerDienst(e) {
  if (!objekt(e) || !objekt(e.da)) return null;
  return e.da.ungeplant === true ? { name: UNGEPLANT_NAME, ...e.da } : e.da;
}

