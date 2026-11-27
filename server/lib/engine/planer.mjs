/* ==========================================================================
   PLANER-KERN — EIGENER PLANER, ERSTE SCHEIBE (WP-I7 Teil 3, Block K)

   Plan 7.4 (docs/intelligence/PLAN-WARNEN-VORGABEN-PLANVORSCHLAG.md): ganzer
   Zeitraum in drei Schritten, ohne Oberfläche, Schalter AUS.

   1. Feste Punkte: Alles, was schon im Plan steht (Abweichungen, Folge,
      Abwesenheiten), bleibt stehen. Der Planer setzt nur zusätzliche
      Einteilungen für Personen ohne Dienst an diesem Tag; er ändert oder
      entfernt nie einen Eintrag des Bestands. („Anheften“ hat kein Datenfeld —
      nicht gebaut.)
   2. Aufbauen, Blöcke vor Einzeltagen: erst Nachtblöcke (zusammenhängende
      Tage mit Lücke im selben Nachtdienst), dann Wochenendblöcke (Samstag +
      Sonntag mit Lücke im selben Dienst), dann die übrigen Tage. Ein Block wird
      mit DERSELBEN Person fortgesetzt, solange sie dort einsetzbar ist. Die
      Einsetzbarkeit ist dieselbe Prüfung wie im Planungsassistenten
      (ersatzVorschlaege → hindernisBefunde, Automatik: Muss ungeprüft = nicht
      einteilen). Ohne Blöcke ist der Aufbau Schritt für Schritt `planeMonat`
      (Prüfung: Gleichwertigkeit).
   3. Verbessern: feste Zahl von Zügen, Reihenfolge aus einem festen Startwert
      (eigener Zufallsgenerator, keine Uhr, kein Math.random). Ein Zug
      „verschiebt“ eine eigene Einteilung einer Person auf eine offene Stelle
      und besetzt die frei gewordene Stelle neu (Umbesetzen). Behalten wird ein
      Zug nur, wenn die Besetzung an beiden Tagen strikt besser wird (Rang 2);
      Rang 1 und 3 bleiben durch dieselbe Einsetzbarkeitsprüfung gewahrt.

   Rangfolge (Plan 7.4): Gesetz > Besetzung > Tarif/BV/Muss > Soll >
   Verteilung > Wunsch > Stabilität. `rangVergleich` vergleicht streng in dieser
   Reihenfolge. Verteilung und Wunsch sind in dieser Scheibe NICHT bewertet
   (null, „nicht bewertet“ — nie „erfüllt“); die Verteilungs- und Wunschregel
   im Plan folgen nach dem Planer.

   Bestandspersonen (Review #572 A1, Posten): Eine Einteilung kann die
   Postenbesetzung und damit den Dienst ANDERER Personen am selben Tag ändern
   (verdrängen oder hineinziehen). Nach jedem Setzen, Zurücknehmen und Zug wird
   der Tag frisch gegen den Bestand gerechnet (verdraengt); ändert sich der
   Dienst einer Person ohne eigene Einteilung, wird die Einteilung zurück-
   genommen (Aufbau: höchstens 3 Kandidaten je Stelle, dann offen mit Grund
   „verdraengung“), der Zug verworfen bzw. die Nachprüfung nicht bestanden.

   Nachprüfung (fail-closed): Am Ende wird jede eigene Einteilung auf dem
   fertigen Plan nachgeprüft (ohne sie, dann hindernisBefunde). Fällt der
   verbesserte Plan durch, gilt der aufgebaute; fällt auch der durch, setzt der
   Planer nichts (Status „nachpruefung“). Die Nachprüfung hat ein eigenes,
   gleich großes Budget der Vorgaben (frisch gerechnet, unabhängig vom Aufbau).

   Vorwärts (Betreiberentscheidung 26.11., wie planeMonat): Eine Einteilung darf
   an späteren Tagen derselben Person keinen neuen Befund ab Achtung auslösen
   (folgeVorwaerts, einsatz.mjs; betrifft „Dienste in Folge“), und keinen
   neuen Planbefund zu Nachtdiensten in Folge oder § 11 ArbZG (planbefundeNeu,
   Betreiberentscheidung 26.11. Variante A; Grund der offenen Stelle ist die
   Regel). Geprüft im Aufbau je Kandidat (scheitert er, der nächste; zählt
   nicht als Versuch), bei der Blockfortsetzung, im Verbessern und in der
   Nachprüfung. Die Planbefunde haben ein eigenes Budget in Personentagen
   (`planbefundAufwand`, Review #588 B-3), die Nachprüfung ist darin je
   eigener Einteilung mit der Obergrenze eines Aufrufs reserviert.

   Aufwand (Lehren #561/#566/#572): EIN Budget je Aufruf, gezählt in
   Personenprüfungen (Besetzung eines Tags = Personen, Ersatzsuche = Personen,
   eine Einsatzprüfung = 1). Jede Arbeit wird VOR ihr angemeldet; reicht es
   nicht, bleibt die Stelle offen (Grund „aufwand“), kein halber Block. Die
   Nachprüfung des jeweils aktuellen Stands ist immer reserviert. Eingaben
   (Monat, Startwert, Budget, Züge, Höchstzahl) werden geprüft; ungültige
   Werte (NaN, Infinity, Bruchzahl, zu groß, kein Kalendermonat) rechnen
   nichts (Status „ungueltig“). Das Budget der Vorgaben (WP-I5/I7) ist eines je
   Aufruf, wie in planeMonat.

   Schalter PLANER_AN (AUS): Ohne ihn und ohne ausdrückliche Freigabe je
   Aufruf (`freigabe: true`, nur Prüfungen) rechnet nichts. KI-Pause (auch ein
   unlesbarer Pausenstand) hält den Planer an (Status „pausiert“). Der
   bestehende Planungsassistent (planeMonat) und die Oberfläche sind
   unverändert.

   Rein: keine Uhr, keine Ablage, kein Protokoll. Ergebnis ohne Namen und ohne
   Begründungstexte zu Personen; nur die Kennungen, die der Plan braucht.
   ========================================================================== */
import { dim_, pad, addDays, dow } from "../regelwerk.mjs";
import { nachtAnteil, nachtschwelle } from "../fachpruefung.mjs";
import { kiPauseAktiv, kiSteuerungLesen } from "../ki-steuerung.mjs";
import { planungsreife, vorschlagErlaubt } from "./planungsreife.mjs";
import { lueckenUrsache, budgetNeu } from "./luckenursache.mjs";
import { neuesVorgabenBudget, vorgabenPlanFortschreiben } from "../vorgabenwirkung.mjs";
import { VORGABEN_WIRKUNG_GRENZE } from "../vorgaben.mjs";
import { besetzung, personTag, stundenkonto } from "./plan.mjs";
import { ersatzVorschlaege, hindernisBefunde, nachtJahr, stufeRang, verdraengt, folgeVorwaerts, planbefundeNeu, planbefundAufwandHoechst, PLANBEFUND_GRENZE } from "./einsatz.mjs";

/** Schalter des eigenen Planers (Vorgabe AUS). Einschalten ist eine bewusste Codeänderung dieser Konstante; Prüfungen geben je Aufruf frei. */
export const PLANER_AN = false;

/** Obergrenzen: Aufwand (Personenprüfungen je Aufruf), Züge des Verbesserns, Blocklänge, Höchstzahl zusätzlicher Dienste je Person;
    Aufwand der Planbefunde (Personentage je Aufruf, planbefundeNeu; eigene Einheit, eigenes Budget). */
export const PLANER_GRENZE = Object.freeze({ aufwand: 1000000, zuege: 2000, blockTage: 7, maxProPerson: 31, planbefundAufwand: PLANBEFUND_GRENZE });
/** Vorgaben je Aufruf. */
export const PLANER_STANDARD = Object.freeze({ aufwand: 1000000, zuege: 100, startwert: 1, maxProPerson: 3, planbefundAufwand: PLANBEFUND_GRENZE });

/** Rangfolge (Plan 7.4), streng in dieser Reihenfolge; kleiner ist besser. */
export const RANGFOLGE = Object.freeze(["gesetz", "besetzung", "muss", "soll", "verteilung", "wunsch", "stabilitaet"]);
/** Stufen, die diese Scheibe nicht bewertet (null): nie „erfüllt“. */
export const NICHT_BEWERTET = Object.freeze(["verteilung", "wunsch"]);

/**
 * Vergleicht zwei Rangvektoren streng in der Rangfolge: < 0, wenn a besser ist. Eine nicht bewertete Stufe (null) entscheidet nichts —
 * sie macht keinen Plan besser.
 */
export function rangVergleich(a, b) {
  for (const k of RANGFOLGE) {
    const x = a[k], y = b[k];
    if (x === null || y === null || x === undefined || y === undefined) continue;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Zufallsgenerator mit festem Startwert (mulberry32): gleicher Startwert, gleiche Folge. */
export function zufallAus(startwert) {
  let s = startwert >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const ganz = (x, min, max) => typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;

/** Prüft die Eingaben; null, wenn gültig, sonst der Grund. */
function eingabeFehler(m, ym, opt) {
  if (!m || typeof m !== "object" || !Array.isArray(m.personen) || !Array.isArray(m.dienstarten)) return "Betriebsstand unvollständig";
  if (typeof ym !== "string" || !/^\d{4}-\d{2}$/.test(ym)) return "Monat nicht im Format JJJJ-MM";
  const mo = Number(ym.slice(5, 7)), j = Number(ym.slice(0, 4));
  if (mo < 1 || mo > 12 || j < 2000 || j > 2100) return "kein gültiger Kalendermonat";
  if (opt.aufwand !== undefined && !ganz(opt.aufwand, 0, PLANER_GRENZE.aufwand)) return "Aufwand ungültig";
  if (opt.zuege !== undefined && !ganz(opt.zuege, 0, PLANER_GRENZE.zuege)) return "Zahl der Züge ungültig";
  if (opt.startwert !== undefined && !ganz(opt.startwert, 0, 4294967295)) return "Startwert ungültig";
  if (opt.maxProPerson !== undefined && !ganz(opt.maxProPerson, 1, PLANER_GRENZE.maxProPerson)) return "Höchstzahl je Person ungültig";
  if (opt.vorgabenAufwand !== undefined && !ganz(opt.vorgabenAufwand, 0, VORGABEN_WIRKUNG_GRENZE.aufwand)) return "Budget der Vorgaben ungültig";
  if (opt.planbefundAufwand !== undefined && !ganz(opt.planbefundAufwand, 0, PLANER_GRENZE.planbefundAufwand)) return "Aufwand der Planbefunde ungültig";
  return null;
}

const leer = (m, ym, status, grund, startwert) => ({ status, grund, ym, startwert, gesetzt: [], offen: [], abweichungen: m && m.abweichungen ? m.abweichungen : {},
  rang: null, nichtBewertet: [...NICHT_BEWERTET], aufwand: null, verbessert: 0 });

/** Vorwärtsprüfung (folgeVorwaerts) und Planbefunde (planbefundeNeu) einer Einteilung: null = besteht, "aufwand" = Budget leer, sonst der
    Grund („folgeVorwaerts“ oder die Regel des Planbefunds). Dieselben Prüfungen wie planeMonat, in derselben Reihenfolge.
    Vorab `leistenPlan(0)`: die Reserve der Nachprüfung im Budget der Planbefunde wird für JEDE neue Einteilung geprüft, auch wenn
    planbefundeNeu nichts anmeldet (z. B. Rufbereitschaft am Tag, Dienstwechsel ohne neuen Arbeitstag; Review #588): sonst läge der
    Verbrauch nach der Nachprüfung über der Grenze. Am Fachergebnis ändert das nichts (nur Budget leer ⇒ „aufwand“). */
const vorwaerts = (vorher, p, d, da, leisten, stand, leistenPlan = leisten) => {
  if (!leistenPlan(0)) return "aufwand";
  const f = folgeVorwaerts(vorher, p, d, da, leisten, stand);
  if (f !== null) return f === "aufwand" ? f : "folgeVorwaerts";
  const z = planbefundeNeu(vorher, p, d, da, leistenPlan, stand);
  return z === null || z === "aufwand" ? z : z.regel;
};

/* verdraengt (Bestandspersonen eines Tags gegen den Bestand) liegt seit der Korrektur in planeMonat (WP-I5/I7, Review #577) in
   einsatz.mjs, damit planeMonat (Browser) und der Planer dieselbe Prüfung nutzen; hier unverändert weitergereicht. */
export { verdraengt };

/**
 * Nachprüfung (fail-closed): Jede eigene Einteilung auf dem fertigen Stand — ohne sie (Bestand dieses Tags wieder hergestellt) muss die
 * Person dienstfrei und ohne Befund ab Achtung einsetzbar sein (Automatik: Muss ungeprüft = Achtung). Zählt die Befunde je Rangstufe.
 * `vorgabenBudget`: das Budget der Vorgaben für die Nachprüfung (unabhängig vom Aufbau).
 * @param {any} m Bestand (vor dem Planer) @param {any} stand fertiger Stand
 * @param {{ personId: any, datum: string, dienstId: any }[]} eigene @param {any} vorgabenBudget
 */
export function nachpruefen(m, stand, eigene, vorgabenBudget) {
  const basis = (m && m.abweichungen) || {};
  const hat = Object.prototype.hasOwnProperty;
  const opt = { vorgabenBudget, vorgabenAutomatisch: true };
  let gesetz = 0, muss = 0, soll = 0, offenV = 0, durch = true, verdraengte = 0;
  /* Bestandspersonen an jedem Tag mit eigener Einteilung unverändert (gegen den Bestand, nicht gegen „ohne diese eine“: auch das
     Zusammenwirken mehrerer Einteilungen am selben Tag, mehrere Posten, Hineinziehen und Verdrängen). */
  const bestand = { ...m, abweichungen: { ...basis } };
  const schl = new Set(eigene.map((e) => `${e.personId}|${e.datum}`));
  for (const d of new Set(eigene.map((e) => e.datum))) verdraengte += stand ? verdraengt(bestand, stand, d, schl) : 1;
  if (verdraengte) durch = false;
  for (const e of eigene) {
    const p = m.personen.find((x) => x.id === e.personId);
    const da = m.dienstarten.find((x) => x.id === e.dienstId);
    const k = `${e.personId}|${e.datum}`;
    if (!p || !da || !stand || !stand.abweichungen || stand.abweichungen[k] !== e.dienstId) { durch = false; continue; }
    const ohne = { ...stand, abweichungen: { ...stand.abweichungen } };
    if (hat.call(basis, k)) ohne.abweichungen[k] = basis[k]; else delete ohne.abweichungen[k];
    if (personTag(ohne, p, e.datum).dienstId) { durch = false; continue; }
    for (const b of hindernisBefunde(ohne, p, e.datum, da, opt)) {
      if (stufeRang(b.stufe) >= 2) durch = false;
      if (b.stufe === "recht") gesetz++;
      if (b.regel === "vorgabeMuss") muss++;
      if (b.regel === "vorgabeSoll") soll++;
      if (b.regel === "vorgabeOffen") offenV++;
    }
    /* Vorwärts und Planbefunde: kein neuer Befund ab Achtung an späteren Tagen der Person, kein neuer Planbefund (Nachtdienste in Folge,
       § 11 ArbZG) durch diese Einteilung (Aufwand reserviert der Aufrufer). */
    if (vorwaerts(ohne, p, e.datum, da, () => true, stand) !== null) durch = false;
  }
  return { durch, gesetz, muss, soll, offenV, verdraengte };
}

/** Der Rest des Plans fehlt an diesem Tag: Summe der fehlenden Personen und der fehlenden Qualifikationen je Dienst. */
const tagesLuecke = (bes) => Object.values(bes).reduce((s, b) => s + Math.max(0, -b.diff) + (b.qualFehlt ? 1 : 0), 0);

/**
 * Eigener Planer für einen Monat (erste Scheibe). Rein; wirft nur bei Programmfehlern der Prüfwege.
 * @param {any} m Betriebsstand
 * @param {string} ym Monat JJJJ-MM
 * @param {{ freigabe?: boolean, aggregate?: boolean, bloecke?: boolean, zuege?: number, startwert?: number, aufwand?: number, maxProPerson?: number, vorgabenAufwand?: number }} [opt]
 */
export function planeVorschlag(m, ym, opt = {}) {
  const o = opt && typeof opt === "object" ? opt : {};
  const fehler = eingabeFehler(m, ym, o);
  const startwert = o.startwert === undefined ? PLANER_STANDARD.startwert : o.startwert;
  if (fehler) return leer(m, ym, "ungueltig", fehler, startwert);
  if (!(PLANER_AN || o.freigabe === true)) return leer(m, ym, "aus", "Planer nicht freigeschaltet", startwert);
  /* KI-Pause hält die Automatik an; ein unlesbarer Pausenstand gilt als Pause (kiPauseAktiv). */
  let pause = true;
  try { pause = kiPauseAktiv(m.einstellungen); } catch { pause = true; }
  if (pause) return leer(m, ym, "pausiert", "Intelligence pausiert", startwert);

  const grenze = o.aufwand === undefined ? PLANER_STANDARD.aufwand : o.aufwand;
  const zuege = o.zuege === undefined ? PLANER_STANDARD.zuege : o.zuege;
  const maxProPerson = o.maxProPerson === undefined ? PLANER_STANDARD.maxProPerson : o.maxProPerson;
  const vorgabenAufwand = o.vorgabenAufwand === undefined ? VORGABEN_WIRKUNG_GRENZE.aufwand : o.vorgabenAufwand;
  const bloecke = o.bloecke !== false;
  const [y, mo] = ym.split("-").map(Number);
  const nTage = dim_(y, mo - 1);
  const tage = []; for (let i = 1; i <= nTage; i++) tage.push(`${ym}-${pad(i)}`);
  const P = Math.max(1, m.personen.length);

  /* Aufwand: anmelden VOR der Arbeit. `reserve(n)`: die Nachprüfung eines Stands mit n eigenen Einteilungen (je Einteilung eine
     Einsatzprüfung mit der Besetzung des Tags) und die Besetzung aller Tage. */
  const A = { grenze, rest: grenze, ausgeschoepft: false };
  /* … dazu je Tag der Vergleich der Bestandspersonen (Stand und Bestand: 2 P). */
  /* … und je Einteilung die Vorwärtsprüfung (2 je späterem Tag, höchstens maxFolge Tage). */
  const mf = Number(m.einstellungen && m.einstellungen.maxFolge);
  const W = mf > 0 ? Math.ceil(mf) : 0;
  const reserve = (n) => n * (P + 1 + 2 * W) + 3 * nTage * P;
  const leisten = (k, n) => { if (A.rest - k < reserve(n)) { A.ausgeschoepft = true; return false; } A.rest -= k; return true; };
  /* Planbefunde (planbefundeNeu): eigenes Budget in Personentagen (Review #588 B-3: nicht mit Personenprüfungen vermischen); die
     Nachprüfung ist je eigener Einteilung mit der Obergrenze eines Aufrufs reserviert. Leer ⇒ nicht einteilen (Grund „aufwand“). */
  const pbGrenze = o.planbefundAufwand === undefined ? PLANER_STANDARD.planbefundAufwand : o.planbefundAufwand;
  const PB = { rest: pbGrenze, ausgeschoepft: false };
  const pbHoechst = planbefundAufwandHoechst(m, y);
  const pbLeisten = (n) => (k) => { if (PB.rest - k < n * pbHoechst) { PB.ausgeschoepft = true; return false; } PB.rest -= k; return true; };
  if (A.rest < reserve(0)) return { ...leer(m, ym, "aufwand", "Aufwand reicht nicht für die Nachprüfung", startwert), aufwand: { grenze, verbraucht: 0, ausgeschoepft: true } };

  /* Ein Budget der Vorgaben für den ganzen Aufruf (wie planeMonat), Automatik. */
  const ctx = { konten: new Map(), einspruenge: {}, nachtAnzahl: new Map(), vorgabenBudget: neuesVorgabenBudget(vorgabenAufwand, { aggregate: o.aggregate === true }), vorgabenAutomatisch: true };
  const jahr = y;
  for (const p of m.personen) { ctx.konten.set(p.id, stundenkonto(m, p, ym)); ctx.nachtAnzahl.set(p.id, nachtJahr(m, p, jahr).anzahl); }
  for (const e of m.einspruenge || []) ctx.einspruenge[e.personId] = (ctx.einspruenge[e.personId] || 0) + 1;
  const werte = [...ctx.konten.values()].filter((k) => k !== null).sort((a, b) => a - b);
  ctx.median = werte.length ? werte[Math.floor(werte.length / 2)] : 0;
  ctx.mittelEinspruenge = m.personen.length ? (m.einspruenge || []).length / m.personen.length : 0;
  const nw = [...ctx.nachtAnzahl.values()].filter((k) => k !== null);
  ctx.nachtMittel = nw.length ? nw.reduce((a, b) => a + b, 0) / nw.length : 0;
  const pruefOpt = { vorgabenBudget: ctx.vorgabenBudget, vorgabenAutomatisch: true };

  const basis = m.abweichungen || {};
  const hat = Object.prototype.hasOwnProperty;
  /** Stand mit geänderten Abweichungen; die Aggregate der Vorgaben wandern mit (nur dieser Tag wird nachgelesen). */
  const setze = (stand, pid, d, wert) => {
    const ab = { ...stand.abweichungen };
    const k = `${pid}|${d}`;
    if (wert === undefined) { if (hat.call(basis, k)) ab[k] = basis[k]; else delete ab[k]; } else ab[k] = wert;
    const neu = { ...stand, abweichungen: ab };
    vorgabenPlanFortschreiben(ctx.vorgabenBudget, stand, neu, [{ personId: pid, tag: d }]);
    return neu;
  };
  const bestand = { ...m, abweichungen: { ...basis } };
  /** Höchstzahl der Kandidaten, die je Stelle wegen Verdrängung nacheinander versucht werden (verdrängt einer, meist alle: Postenbesetzung). */
  const VERSUCHE = 3;
  /* `lst`: Anmeldung der Vorwärtsprüfung im Aufrufbudget (reicht es nicht: nicht einsetzbar). */
  const einsetzbar = (stand, p, d, da, jeP, lst, lstP) => (jeP[p.id] || 0) < maxProPerson && !personTag(stand, p, d).dienstId
    && !hindernisBefunde(stand, p, d, da, pruefOpt).some((b) => stufeRang(b.stufe) >= 2)
    && vorwaerts(stand, p, d, da, lst, undefined, lstP) === null;

  /* ---------- 2. Aufbauen ---------- */
  const aufbauen = () => {
    let stand = { ...m, abweichungen: { ...basis } };
    const eigene = new Map();     // `${pid}|${d}` → { personId, datum, dienstId, art }
    const jeP = {};
    const gekappt = new Map();    // `${d}|${daId}` → Grund (aufwand / vorgabe), wenn die Stelle deshalb offen blieb
    const neuEintrag = (p, d, da, art) => {
      stand = setze(stand, p.id, d, da.id);
      eigene.set(`${p.id}|${d}`, { personId: p.id, datum: d, dienstId: da.id, art });
      jeP[p.id] = (jeP[p.id] || 0) + 1;
    };
    const zuruecknehmen = (p, d) => {
      stand = setze(stand, p.id, d, undefined);
      eigene.delete(`${p.id}|${d}`);
      jeP[p.id] -= 1;
    };
    /** Einteilung setzen und gegen den Bestand prüfen (Kosten 2 P vorab angemeldet); verdrängt sie jemanden, zurücknehmen. */
    const setzenOhneVerdraengung = (p, d, da, art) => {
      neuEintrag(p, d, da, art);
      if (!verdraengt(bestand, stand, d, eigene)) return true;
      zuruecknehmen(p, d);
      return false;
    };
    /** Füllt (d, da) wie planeMonat; mit `block` wird die gewählte Person über die folgenden Blocktage fortgesetzt. */
    const fuellen = (d, da, block, art) => {
      let schutz = 0;
      while (schutz++ < 12) {
        if (!leisten(P, eigene.size)) { gekappt.set(`${d}|${da.id}`, "aufwand"); return; }
        const b = besetzung(stand, d)[da.id];
        if (b.diff >= 0 && !b.qualFehlt) return;
        if (!leisten(P, eigene.size + 1)) { gekappt.set(`${d}|${da.id}`, "aufwand"); return; }
        const kand = ersatzVorschlaege(stand, d, da.id, ctx).filter((x) => x.moeglich && (jeP[x.person.id] || 0) < maxProPerson);
        if (!kand.length) { if (ctx.vorgabenBudget.ausgeschoepft) gekappt.set(`${d}|${da.id}`, "vorgabe"); return; }
        let p = null, versuche = 0, grundV = "folgeVorwaerts";
        for (const x of kand) {
          /* Vorwärts und Planbefunde (wie planeMonat): scheitert der Kandidat, der nächste — zählt nicht als Versuch. */
          const f = vorwaerts(stand, x.person, d, da, (k) => leisten(k, eigene.size + 1), undefined, pbLeisten(eigene.size + 1));
          if (f === "aufwand") { gekappt.set(`${d}|${da.id}`, "aufwand"); return; }
          if (f) { grundV = f; continue; }
          if (versuche++ >= VERSUCHE) break;
          if (!leisten(2 * P, eigene.size + 1)) { gekappt.set(`${d}|${da.id}`, "aufwand"); return; }
          if (setzenOhneVerdraengung(x.person, d, da, art)) { p = x.person; break; }
        }
        if (!p) { gekappt.set(`${d}|${da.id}`, versuche ? "verdraengung" : grundV); return; }
        /* Block: dieselbe Person an den folgenden Tagen, solange dort eine Lücke ist und sie einsetzbar ist (kein halber Schritt: Kosten vorab). */
        for (const t of block || []) {
          if (!leisten(3 * P + 1, eigene.size + 1)) break;
          const bt = besetzung(stand, t)[da.id];
          if (bt.diff >= 0 && !bt.qualFehlt) break;
          if (!einsetzbar(stand, p, t, da, jeP, (k) => leisten(k, eigene.size + 1), pbLeisten(eigene.size + 1))) break;
          if (!setzenOhneVerdraengung(p, t, da, art)) break;
        }
      }
    };
    if (bloecke) {
      const lueckeAm = (d, da) => { if (!leisten(P, eigene.size)) return false; const b = besetzung(stand, d)[da.id]; return b.diff < 0 || b.qualFehlt; };
      /* Nachtblöcke: zusammenhängende Tage mit Lücke im selben Nachtdienst, höchstens blockTage lang. */
      for (const da of m.dienstarten.filter((x) => nachtAnteil(x, m.einstellungen) >= nachtschwelle(m.einstellungen))) {
        let lauf = [];
        const schliessen = () => { while (lauf.length > 1) { const teil = lauf.splice(0, PLANER_GRENZE.blockTage); if (teil.length > 1) fuellen(teil[0], da, teil.slice(1), "nachtblock"); } lauf = []; };
        for (const d of tage) { if (lueckeAm(d, da)) lauf.push(d); else schliessen(); }
        schliessen();
      }
      /* Wochenendblöcke: Samstag und Sonntag desselben Monats mit Lücke im selben Dienst. */
      for (const d of tage) {
        if (dow(d) !== 5) continue;
        const so = addDays(d, 1);
        if (so.slice(0, 7) !== ym) continue;
        for (const da of m.dienstarten) if (lueckeAm(d, da) && lueckeAm(so, da)) fuellen(d, da, [so], "wochenendblock");
      }
    }
    /* Einzeltage: Tag für Tag, Dienst für Dienst (ohne Blöcke genau planeMonat). */
    for (const d of tage) for (const da of m.dienstarten) fuellen(d, da, null, "einzel");
    return { stand, eigene, jeP, gekappt };
  };

  /* ---------- Nachprüfung und Rang ---------- */
  /** Jede eigene Einteilung auf dem fertigen Plan: ohne sie einsetzbar? Dazu der Rangvektor. Kosten sind reserviert. */
  /* Eigenes Budget der Vorgaben für die Nachprüfung (fest, gleich groß; für beide Nachprüfungen eines Aufrufs): unabhängig vom Aufbau. */
  const nachBudget = neuesVorgabenBudget(vorgabenAufwand, { aggregate: o.aggregate === true });
  const bewerten = (r) => {
    A.rest -= reserve(r.eigene.size);
    PB.rest -= r.eigene.size * pbHoechst;
    const { durch, gesetz, muss, soll, offenV } = nachpruefen(m, r.stand, [...r.eigene.values()], nachBudget);
    const offen = [];
    let luecke = 0;
    for (const d of tage) {
      const bes = besetzung(r.stand, d);
      luecke += tagesLuecke(bes);
      for (const da of m.dienstarten) {
        const b = bes[da.id];
        if (b.diff < 0 || b.qualFehlt) {
          const g = r.gekappt.get(`${d}|${da.id}`);
          offen.push({ datum: d, dienstId: da.id, fehlt: Math.max(0, -b.diff), qualFehlt: b.qualFehlt, ...(g ? { grund: g } : {}) });
        }
      }
    }
    /* Soll ungeprüft (Budget der Vorgaben) = nicht bewertet, nie „erfüllt“. */
    const rang = { gesetz, besetzung: luecke, muss, soll: offenV ? null : soll, verteilung: null, wunsch: null, stabilitaet: r.eigene.size };
    return { durch, rang, offen };
  };

  /* ---------- 3. Verbessern (Umbesetzen) ---------- */
  const verbessern = (r0) => {
    let stand = r0.stand;
    const eigene = new Map(r0.eigene), jeP = { ...r0.jeP };
    const rnd = zufallAus(startwert);
    let behalten = 0;
    const offeneStellen = () => {
      /* aus den Besetzungen des Aufbaus (gleicher Stand: Speicher, keine neue Arbeit) bzw. nach jedem Zug der zwei geänderten Tage */
      const l = [];
      for (const d of tage) { const bes = besetzung(stand, d); for (const da of m.dienstarten) { const b = bes[da.id]; if (b.diff < 0 || b.qualFehlt) l.push({ d, da }); } }
      return l;
    };
    if (!leisten(nTage * P, eigene.size)) return { stand, eigene, jeP, gekappt: r0.gekappt, behalten };
    let offenL = offeneStellen();
    for (let z = 0; z < zuege && offenL.length && eigene.size; z++) {
      const S = offenL[Math.floor(rnd() * offenL.length)];
      const kandidaten = [...eigene.values()].filter((e) => e.datum !== S.d);
      if (!kandidaten.length) continue;
      const E = kandidaten[Math.floor(rnd() * kandidaten.length)];
      /* Kosten des Zugs vorab: Besetzung vorher (2 Tage), Einsatzprüfung, Ersatzsuche, Besetzung nachher (2 Tage), Bestandspersonen an
         beiden Tagen gegen den Bestand (4 P); danach bleibt die Nachprüfung reserviert. */
      if (!leisten(9 * P + 1, eigene.size + 1)) break;
      const p = m.personen.find((x) => x.id === E.personId);
      const daS = S.da, daE = m.dienstarten.find((x) => x.id === E.dienstId);
      if (!p || !daE) continue;
      const vorher = tagesLuecke(besetzung(stand, S.d)) + tagesLuecke(besetzung(stand, E.datum));
      const jeP2 = { ...jeP, [p.id]: jeP[p.id] - 1 };
      let s1 = setze(stand, p.id, E.datum, undefined);
      const schritte = [{ pid: p.id, d: E.datum }];
      /* Zug verworfen: der alte Stand gilt weiter; seine Aggregate kommen zurück (die berührten Tage werden nachgelesen). */
      const zurueck = (x) => vorgabenPlanFortschreiben(ctx.vorgabenBudget, x, stand, schritte.map((c) => ({ personId: c.pid, tag: c.d })));
      const lst = (k) => leisten(k, eigene.size + 1), lstP = pbLeisten(eigene.size + 1);
      if (!einsetzbar(s1, p, S.d, daS, jeP2, lst, lstP)) { zurueck(s1); continue; }
      s1 = setze(s1, p.id, S.d, daS.id);
      schritte.push({ pid: p.id, d: S.d });
      jeP2[p.id] += 1;
      let q = null;
      const bE = besetzung(s1, E.datum)[daE.id];
      if (bE.diff < 0 || bE.qualFehlt) {
        const kand = ersatzVorschlaege(s1, E.datum, daE.id, ctx).filter((x) => x.moeglich && x.person.id !== p.id && (jeP2[x.person.id] || 0) < maxProPerson);
        const qx = kand.find((x) => vorwaerts(s1, x.person, E.datum, daE, lst, undefined, lstP) === null);
        if (qx) { q = qx.person; s1 = setze(s1, q.id, E.datum, daE.id); schritte.push({ pid: q.id, d: E.datum }); jeP2[q.id] = (jeP2[q.id] || 0) + 1; }
      }
      /* Bestandspersonen an beiden Tagen unverändert (Posten: Zurücknehmen kann jemanden in die Postenbesetzung ziehen, Setzen verdrängen). */
      const schl = new Set([...eigene.keys()].filter((k) => k !== `${p.id}|${E.datum}`));
      schl.add(`${p.id}|${S.d}`); if (q) schl.add(`${q.id}|${E.datum}`);
      const sauber = !verdraengt(bestand, s1, S.d, schl) && !verdraengt(bestand, s1, E.datum, schl);
      const nachher = tagesLuecke(besetzung(s1, S.d)) + tagesLuecke(besetzung(s1, E.datum));
      if (sauber && nachher < vorher) {
        stand = s1;
        Object.assign(jeP, jeP2);
        eigene.delete(`${p.id}|${E.datum}`);
        eigene.set(`${p.id}|${S.d}`, { personId: p.id, datum: S.d, dienstId: daS.id, art: "verbessert" });
        if (q) eigene.set(`${q.id}|${E.datum}`, { personId: q.id, datum: E.datum, dienstId: daE.id, art: "verbessert" });
        behalten++;
        offenL = offenL.filter((x) => x.d !== S.d && x.d !== E.datum);
        for (const d of [S.d, E.datum]) { const bes = besetzung(stand, d); for (const da of m.dienstarten) { const b = bes[da.id]; if (b.diff < 0 || b.qualFehlt) offenL.push({ d, da }); } }
        offenL.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : m.dienstarten.indexOf(a.da) - m.dienstarten.indexOf(b.da)));
      } else zurueck(s1);
    }
    return { stand, eigene, jeP, gekappt: r0.gekappt, behalten };
  };

  const aufgebaut = aufbauen();
  const bk = bewerten(aufgebaut);
  if (!bk.durch) return { ...leer(m, ym, "nachpruefung", "Nachprüfung des Aufbaus nicht bestanden", startwert), aufwand: { grenze, verbraucht: grenze - A.rest, ausgeschoepft: A.ausgeschoepft || PB.ausgeschoepft, planbefund: { grenze: pbGrenze, verbraucht: pbGrenze - PB.rest, ausgeschoepft: PB.ausgeschoepft } } };
  let ergebnis = aufgebaut, bewertung = bk, verbessert = 0;
  if (zuege > 0 && aufgebaut.eigene.size && bk.offen.length) {
    const v = verbessern(aufgebaut);
    if (v.behalten > 0) {
      const bv = bewerten(v);
      if (bv.durch && rangVergleich(bv.rang, bk.rang) < 0) { ergebnis = v; bewertung = bv; verbessert = v.behalten; }
    }
  }
  const gesetzt = [...ergebnis.eigene.values()].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0)
    || m.dienstarten.findIndex((x) => x.id === a.dienstId) - m.dienstarten.findIndex((x) => x.id === b.dienstId)
    || (String(a.personId) < String(b.personId) ? -1 : String(a.personId) > String(b.personId) ? 1 : 0));
  /* Ursache offener Stellen ohne Grund (WP-I7 Teil 5, Betreiberentscheidung 26.11.: unerfüllbares Muss ⇒ Stelle offen + Ursache, nie eine
     Einteilung mit Muss-Verletzung): lueckenUrsache (WP-I8, Kennungen und Zahlen, keine Person) auf dem fertigen Stand, nach dem Planen
     (ohne Wirkung auf den Plan). Ein Budget für alle Stellen (luckenursache: höchstens 400 Personenprüfungen) und ein eigenes Budget der
     Vorgaben; reicht es nicht oder sind Vorgaben nicht vollständig geprüft (auch ungültig beschriebene Muss-Vorgaben), heißt die Ursache
     „unvollstaendig“ — nie eine erfundene. */
  const ursBudget = budgetNeu(), ursVorgaben = neuesVorgabenBudget(vorgabenAufwand, { aggregate: o.aggregate === true });
  const offenMitUrsache = bewertung.offen.map((x) => {
    if (x.grund) return x;
    const r = lueckenUrsache(ergebnis.stand, x.datum, x.dienstId, { budget: ursBudget, vorgabenBudget: ursVorgaben });
    if (!r || r.ok === false) return { ...x, ursache: "unvollstaendig", regeln: [] };
    return { ...x, ursache: r.ursache, regeln: r.kleinste ? [...r.kleinste.regeln] : [], ...(r.vorgabenUnvollstaendig ? { vorgabenUnvollstaendig: true } : {}) };
  });
  return { status: "ok", grund: null, ym, startwert, gesetzt, offen: offenMitUrsache, abweichungen: ergebnis.stand.abweichungen,
    rang: bewertung.rang, nichtBewertet: [...NICHT_BEWERTET], aufwand: { grenze, verbraucht: grenze - A.rest, ausgeschoepft: A.ausgeschoepft || PB.ausgeschoepft, planbefund: { grenze: pbGrenze, verbraucht: pbGrenze - PB.rest, ausgeschoepft: PB.ausgeschoepft } }, verbessert };
}

/* ---------- Betriebsmodus (WP-I7 Teil 5, Betreiberentscheidung 26.11.) ----------
   AUS / Knopfdruck / automatisch je Betrieb. Vorgabe AUS, solange der Planer nicht freigegeben ist (PLANER_AN, bleibt AUS); nach der
   Freigabe ist Knopfdruck der Standard, automatisch nur, wenn die Leitung es ausdrücklich eingestellt hat (kiSteuerung.planerModus,
   Schreibweg und Rechte in ki-steuerung.mjs). Unlesbarer oder unbekannter Wert = AUS (fail closed). */

/**
 * Der im Betrieb wirksame Modus.
 * @param {any} einstellungen @param {boolean} [freigegeben] Freigabe des Planers (Vorgabe PLANER_AN; Prüfungen geben ausdrücklich frei)
 * @returns {"aus" | "knopfdruck" | "automatisch"}
 */
export function planerModusWirksam(einstellungen, freigegeben = PLANER_AN) {
  if (freigegeben !== true) return "aus";
  let s;
  try { s = kiSteuerungLesen(einstellungen); } catch { return "aus"; }
  if (s && s.planerModusUngueltig) return "aus";
  if (!s || !s.planerModus) return "knopfdruck";
  const w = s.planerModus.modus;
  return w === "knopfdruck" || w === "automatisch" ? w : "aus";
}

/**
 * Äußerer Einstieg des Planers je Betrieb: Modus, KI-Pause, Planungsreife (WP-I6), dann planeVorschlag. Ein nicht planungsreifer Betrieb
 * bekommt keinen Vorschlag (auch keinen teilweisen, der vollständig wirken könnte), sondern den Status „nicht_planungsreif“ mit den
 * fehlenden Voraussetzungen (Punkt und Text der Prüfliste, ohne Personenkennungen). Im Modus Knopfdruck rechnet nur `knopf: true`
 * (die Planung hat „Vorschlag erstellen“ gedrückt); sonst Status „wartet“.
 * @param {any} m @param {string} ym
 * @param {{ knopf?: boolean, heute?: string, freigabe?: boolean } & Record<string, any>} [opt] übrige Optionen wie planeVorschlag
 */
export function planerEinstieg(m, ym, opt = {}) {
  const o = opt && typeof opt === "object" ? opt : {};
  const startwert = o.startwert === undefined ? PLANER_STANDARD.startwert : o.startwert;
  const fehler = eingabeFehler(m, ym, o);
  if (fehler) return { ...leer(m, ym, "ungueltig", fehler, startwert), modus: "aus" };
  const modus = planerModusWirksam(m.einstellungen, PLANER_AN || o.freigabe === true);
  if (modus === "aus") return { ...leer(m, ym, "aus", "Planer im Betrieb aus", startwert), modus };
  let pause = true;
  try { pause = kiPauseAktiv(m.einstellungen); } catch { pause = true; }
  if (pause) return { ...leer(m, ym, "pausiert", "Intelligence pausiert", startwert), modus };
  const [y, mo] = ym.split("-").map(Number);
  const zeitraum = { von: `${ym}-01`, bis: `${ym}-${pad(dim_(y, mo - 1))}` };
  let reife = null;
  try { reife = planungsreife(m, { ...zeitraum, heute: typeof o.heute === "string" ? o.heute : undefined }); } catch { reife = null; }
  const e = vorschlagErlaubt(reife, modus, o.knopf === true);
  if (!e.erlaubt) {
    if (e.grund === "wartet_auf_knopfdruck") return { ...leer(m, ym, "wartet", "Vorschlag nur auf Knopfdruck", startwert), modus };
    if (e.grund === "aus") return { ...leer(m, ym, "aus", "Planer im Betrieb aus", startwert), modus };
    const fehlt = reife && Array.isArray(reife.luecken) ? reife.luecken.filter((l) => !l.hinweis).map((l) => ({ punkt: l.punkt, text: l.text })) : [];
    return { ...leer(m, ym, "nicht_planungsreif", "Betrieb für diesen Monat nicht planungsreif: kein Vorschlag", startwert), modus,
      voraussetzungen: fehlt.length ? fehlt : [{ punkt: "pruefung", text: "Die Planungsreife ließ sich nicht prüfen." }] };
  }
  const { knopf: _k, heute: _h, ...rest } = o; // eslint-disable-line no-unused-vars
  return { ...planeVorschlag(m, ym, { ...rest, freigabe: true }), modus };
}
