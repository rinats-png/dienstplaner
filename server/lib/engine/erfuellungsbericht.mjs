/* ==========================================================================
   ERFÜLLUNGSBERICHT ZU EINEM PLANVORSCHLAG (WP-I8, Block K, Engine-Stufe)

   Plan 7.4 (docs/intelligence/PLAN-WARNEN-VORGABEN-PLANVORSCHLAG.md): Jeder Vorschlag hat einen
   Erfüllungsbericht mit Zählwerten — „118 von 120 Diensten voll besetzt“ —, keine Gesamtnote in Prozent
   und keine Punktzahl je Person (D-16, D-01). Akzeptanz WP-I8 (INTELLIGENCE-ENTWICKLUNGSPLAN.md, Block K):
   „Bericht nennt nur Zählwerte; je offenem Konflikt Wo/Warum/Wege; keine Scores je Person.“

   Eingabe: der Bestand `m` (vor dem Planer) und das Ergebnis von `planeVorschlag` (planer.mjs) mit
   Status „ok“. Der Bericht vertraut dem Ergebnis nicht: Er gleicht die Abweichungen mit dem Bestand ab
   (jeder Unterschied ist genau eine eigene Einteilung), rechnet Besetzung, Nachprüfung der eigenen
   Einteilungen (Gesetz, Muss, Soll; nachpruefen aus planer.mjs) und Verteilung auf dem fertigen Stand
   mit dem HEUTIGEN Bestand selbst nach und vergleicht mit offenen Stellen, Rang und Verteilung des
   Vorschlags. Passt etwas nicht, gibt es keinen Bericht (ergebnis_passt_nicht, fail closed).

   Kategorien streng in der Rangfolge (Plan 7.4; Qualifikation getrennt von der Personenzahl):
     gesetz > qualifikation > besetzung > muss > soll > verteilung > wunsch
   Status je Kategorie: „erfuellt“ | „verletzt“ | „offen“ | „nicht-bewertbar“.
   - erfuellt:        mindestens ein Punkt geprüft, keiner verletzt oder offen. Nichts zu prüfen heißt
                      NICHT erfüllt, sondern „nicht-bewertbar“ mit Grund (z. B. keine_vorgabe).
   - verletzt:        eine Einteilung oder Vorgabe des Vorschlags weicht ab (Befund, Überschreitung).
   - offen:           eine Stelle bleibt unbesetzt bzw. ohne Qualifikation (der Planer lässt sie offen,
                      statt eine Regel zu brechen); je Stelle ein Konflikt mit Wo/Warum/Wege.
   - nicht-bewertbar: nicht vollständig geprüft (Budget, Daten fehlen, Bedarf nicht festgelegt, Wunsch).
   Die schlechteste Lage zählt: verletzt > offen > nicht-bewertbar > erfuellt. `massgeblich` ist die
   ranghöchste Kategorie, die nicht erfüllt ist — Gesetz, Qualifikation, Besetzung und Muss gehen Soll und
   Verteilung vor; die Verteilung ist nur nachgelagert maßgeblich.

   Umfang: Gesetz, Muss und Soll betreffen die EIGENEN Einteilungen des Vorschlags (`umfang: "vorschlag"`),
   nicht den Bestand (`bestandGeprueft: false`); ein „erfuellt“ trägt dort `aussage: AUSSAGE_VORSCHLAG` und
   zählt in der Zusammenfassung getrennt (`erfuelltImVorschlag`). `erstesProblem`: ranghöchste Kategorie mit
   „verletzt“ oder „offen“ (`massgeblich` kann eine nicht bewertbare Kategorie davor zeigen).

   Wege je Konflikt: Für Stellen mit Ursache „hindernisse“ rechnet der Bericht `lueckenUrsache` auf dem
   fertigen Stand nach (EIN Budget je Bericht, eigenes Budget der Vorgaben). Weicht die Nachrechnung von der
   Ursache des Planers ab oder reicht das Budget nicht, heißen die Wege „unvollstaendig“ (keine erfundenen).

   Datenschutz: nur Kennungen von Tag, Dienst, Qualifikation, Regel und Vorgabe sowie Zahlen. Keine
   Personenkennung, kein Name, kein Schlüssel „Person|Tag“, kein Befundtext, keine Werte je Person.

   Aufwand: vorab begrenzt (Personentage des Monats, Stellen, Konflikte); darüber kein Bericht (Grund
   „aufwand“), nie ein halber, der vollständig wirkt.

   Rein: keine Uhr, kein Zufall, keine Ablage, Eingaben werden nie verändert; wirft nie ({ ok: false, grund }).
   Nicht verdrahtet: keine Route, keine Oberfläche (späterer Schritt, siehe docs/acc45/WP-I8-nachweis.md).
   ========================================================================== */
import { besetzung } from "./plan.mjs";
import { lueckenUrsache, budgetNeu, LUECKEN_MAX } from "./luckenursache.mjs";
import { nachpruefen, PLANER_GRENZE } from "./planer.mjs";
import { planbefundAufwandHoechst, PLANBEFUND_GRENZE } from "./einsatz.mjs";
import { verteilungAufwand, verteilungVorbereiten, verteilungBewerten, nachtZaehlen } from "./verteilung.mjs";
import { neuesVorgabenBudget } from "../vorgabenwirkung.mjs";
import { aktiveVorgaben } from "../vorgaben.mjs";

/** Kategorien in der Rangfolge (kleinerer Index geht vor). */
export const BERICHT_RANGFOLGE = Object.freeze(["gesetz", "qualifikation", "besetzung", "muss", "soll", "verteilung", "wunsch"]);
/** Status einer Kategorie bzw. einer Vorgabe. */
export const BERICHT_STATUS = Object.freeze(["erfuellt", "verletzt", "offen", "nicht-bewertbar"]);
/** Aussage eines „erfüllt“ bei Gesetz, Muss und Soll: nur die eigenen Einteilungen des Vorschlags sind geprüft, nicht der Bestand. */
export const AUSSAGE_VORSCHLAG = "keine_befunde_in_eigenen_einteilungen";
/**
 * Obergrenzen je Bericht: Personentage des Monats (Besetzung nachrechnen), Stellen (Tag × Dienst), gelistete Konflikte;
 * Nachprüfung der eigenen Einteilungen in Personenprüfungen (dieselbe Rechnung wie die Reserve des Planers, Obergrenze des Planer-Aufwands)
 * und in Personentagen der Planbefunde (dieselbe Obergrenze wie der Planer, 40 Mio, unverändert); Vorbereitung der Verteilung.
 */
export const BERICHT_GRENZE = Object.freeze({ personenTage: 200000, stellen: 20000, konflikte: 500,
  nachpruefung: PLANER_GRENZE.aufwand, planbefund: PLANBEFUND_GRENZE, verteilung: PLANER_GRENZE.aufwand });
/** Verteilung: Spannweite und Überschreitung erst ab dieser Gruppengröße (kleine Gruppen deuten sonst auf Personen). */
export const VERTEILUNG_MINDESTGRUPPE = 3;
/** Werteliste der Ursachen (luckenursache.mjs) und der Gründe offener Stellen (planer.mjs, Planbefunde einsatz.mjs). */
export const BERICHT_URSACHEN = Object.freeze(["besetzt", "direktMoeglich", "hindernisse", "keinPersonal", "unvollstaendig", "qualifikationFehlt"]);
export const BERICHT_GRUENDE = Object.freeze(["aufwand", "vorgabe", "verdraengung", "folgeVorwaerts", "nachtfolge", "ersatzruhe", "sonntagsfrei", "unbekannt"]);
/** Kennungsmuster für Regeln und Vorgaben (kein Freitext, kein Name). */
const KENNUNG = /^[A-Za-z0-9_.-]{1,64}$/;
const istKennung = (x) => typeof x === "string" && KENNUNG.test(x);

/** Schwere für „die schlechteste Lage zählt“. */
const SCHWERE = Object.freeze({ erfuellt: 0, "nicht-bewertbar": 1, offen: 2, verletzt: 3 });
const schlechter = (a, b) => (SCHWERE[b] > SCHWERE[a] ? b : a);

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const zahlOk = (x) => typeof x === "number" && Number.isInteger(x) && x >= 0;
const pad2 = (n) => String(n).padStart(2, "0");
const schaltjahr = (j) => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;
const tageImMonat = (j, mo) => (mo === 2 ? (schaltjahr(j) ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31);
/** @param {string} grund @returns {{ ok: false, grund: string }} */
const nein = (grund) => ({ ok: false, grund });
/** Ergebnis passt nicht zum Bestand; `pruefung` nennt die Stelle des Abgleichs (Kennung, keine Daten). */
const passtNicht = (pruefung) => ({ ok: false, grund: "ergebnis_passt_nicht", pruefung });
/** Gleicher Wert einer Abweichung (Text wie im Planer; Objekte nach Inhalt). */
const gleicherWert = (a, b) => a === b || (!!a && !!b && typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

/** Betrieb mit den Feldern, die Besetzung und Ursache lesen. */
const betriebOk = (m) => istObjekt(m) && Array.isArray(m.personen) && Array.isArray(m.dienstarten) && Array.isArray(m.abwesenheiten)
  && istObjekt(m.einstellungen) && istObjekt(m.abweichungen)
  && m.personen.every((p) => istObjekt(p) && p.id !== undefined && p.id !== null)
  && m.dienstarten.every((d) => istObjekt(d) && d.id !== undefined && d.id !== null);

/** Rangvektor des Planers: Zahlen ≥ 0 oder null (nicht bewertet). */
const rangOk = (r) => istObjekt(r) && ["gesetz", "besetzung", "muss", "soll", "verteilung", "stabilitaet"]
  .every((k) => r[k] === null || (typeof r[k] === "number" && Number.isFinite(r[k]) && r[k] >= 0));

/** Anzahl aktiver Vorgaben einer Stärke (ohne Verteilungsvorgaben; die stehen unter „verteilung“). Ohne Geltungsbereich gezählt. */
const vorgabenZahl = (m, staerke) => aktiveVorgaben(m.vorgaben).filter((v) => v.staerke === staerke && v.regelart !== "verteilungsregel").length;

/**
 * Kategorie aus der eigenen Nachprüfung (Gesetz, Muss, Soll): verletzt bei einem Befund (bei bestandener Nachprüfung nur Soll möglich;
 * Gesetz und Muss hindern und führen vorher zu „ergebnis_passt_nicht“); ohne eigene Einteilung oder ohne Vorgabe nicht bewertbar (nie
 * „erfüllt“ ohne Prüfung); ungeprüft (null) nicht bewertbar. „Erfüllt“ heißt hier nur: keine Befunde in den eigenen Einteilungen.
 */
function ausNachpruefung(name, wert, eigene, vorgaben) {
  const k = { kategorie: name, rang: BERICHT_RANGFOLGE.indexOf(name), umfang: "vorschlag", bestandGeprueft: false, geprueft: eigene,
    verletzt: zahlOk(wert) ? wert : 0, ...(vorgaben === undefined ? {} : { vorgaben }) };
  if (wert === null) return { ...k, status: "nicht-bewertbar", grund: "vorgaben_nicht_vollstaendig_geprueft" };
  if (wert > 0) return { ...k, status: "verletzt" };
  if (vorgaben === 0) return { ...k, status: "nicht-bewertbar", grund: "keine_vorgabe" };
  if (eigene === 0) return { ...k, status: "nicht-bewertbar", grund: "keine_einteilung_im_vorschlag" };
  return { ...k, status: "erfuellt", aussage: AUSSAGE_VORSCHLAG };
}

/** Status einer Verteilungsvorgabe im Bericht (nicht Bewertetes nie „erfüllt“). */
function verteilungStatus(r) {
  if (r.status === "erfuellt") return "erfuellt";
  if (r.status === "verletzt") return "verletzt";        // Spannweite der bekannten Werte überschritten: mit weiteren Personen nur größer
  return "nicht-bewertbar";                                // offen, nicht_bewertet, nicht_anwendbar, Unbekanntes
}

/** Vergleichsform einer Verteilung (Planer oder eigene Rechnung): bewertet, Summe, je Vorgabe Kennung, Status, Überschreitung. */
const verteilungForm = (v) => JSON.stringify({ b: v.bewertet === true, s: v.summe === undefined ? null : v.summe,
  r: (Array.isArray(v.regeln) ? v.regeln : []).map((r) => [String(r && r.vorgabeId), r && r.status, r && r.ueberschreitung === undefined ? null : r && r.ueberschreitung]) });
/** Hat der Planer die Verteilung wegen seines Aufwands nicht vorbereitet (jede Vorgabe „nicht_bewertet“ mit Grund „aufwand“ oder „wunsch“)? */
const planerOhneVerteilung = (v) => istObjekt(v) && Array.isArray(v.regeln) && v.regeln.some((r) => r && r.grund === "aufwand")
  && v.regeln.every((r) => r && r.status === "nicht_bewertet" && (r.grund === "aufwand" || r.grund === "wunsch"));

/** Verteilungsvorgaben aus der eigenen Rechnung: nur Kennungen und Gruppenzahlen; Spannweite erst ab VERTEILUNG_MINDESTGRUPPE Personen. */
function verteilungKategorie(m, v) {
  const k = { kategorie: "verteilung", rang: BERICHT_RANGFOLGE.indexOf("verteilung"), nachgelagert: true };
  if (!v) return { ...k, status: "nicht-bewertbar", grund: "keine_vorgabe", vorgaben: [] };
  const zahl = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const laenge = (x) => (Array.isArray(x) ? x.length : 0);
  const vorgaben = v.regeln.map((r) => {
    const n = laenge(r.personen), klein = n > 0 && n < VERTEILUNG_MINDESTGRUPPE;
    const grund = typeof r.grund === "string" ? r.grund : r.status !== "erfuellt" && r.status !== "verletzt" ? String(r.status) : null;
    return {
      vorgabeId: istKennung(String(r.vorgabeId)) ? String(r.vorgabeId) : null,
      staerke: istKennung(r.staerke) ? r.staerke : null, groesse: istKennung(r.groesse) ? r.groesse : null,
      status: verteilungStatus(r), ...(grund && istKennung(grund) ? { grund } : {}),
      maxAbweichung: zahl(r.maxAbweichung), spannweite: klein ? null : zahl(r.spannweite), ueberschreitung: klein ? null : zahl(r.ueberschreitung),
      ...(klein ? { kleineGruppe: true } : {}),
      personen: n, nichtBewertbar: laenge(r.nichtBewertbar), ausserhalb: laenge(r.ausserhalb),
    };
  }).sort((a, b) => (String(a.vorgabeId) < String(b.vorgabeId) ? -1 : String(a.vorgabeId) > String(b.vorgabeId) ? 1 : 0));
  let status = vorgaben.length ? "erfuellt" : "nicht-bewertbar";
  for (const x of vorgaben) status = schlechter(status, x.status);
  /* Nur vollständig Bewertetes ist „erfüllt“ (wie der Rang des Planers). */
  if (status === "erfuellt" && v.bewertet !== true) status = "nicht-bewertbar";
  const zaehl = (s) => vorgaben.filter((x) => x.status === s).length;
  const klein = vorgaben.some((x) => x.kleineGruppe);
  return { ...k, status, ...(status === "nicht-bewertbar" && !vorgaben.length ? { grund: "keine_vorgabe" } : {}),
    summeUeberschreitung: v.bewertet === true && !klein ? zahl(v.summe) : null,
    erfuellt: zaehl("erfuellt"), verletzt: zaehl("verletzt"), nichtBewertbar: zaehl("nicht-bewertbar"), vorgaben };
}

/**
 * Erfüllungsbericht zu einem Planvorschlag. Rein, deterministisch, wirft nie.
 * @param {any} m Bestand vor dem Planer (derselbe, mit dem planeVorschlag gerechnet hat)
 * @param {any} ergebnis Ergebnis von planeVorschlag (Status „ok“)
 * @returns {{ ok: false, grund: string, status?: string, pruefung?: string } | { ok: true, ym: string, startwert: any,
 *   massgeblich: { kategorie: string, status: string }, erstesProblem: { kategorie: string, status: string } | null,
 *   zusammenfassung: any, kategorien: any[], konflikte: any[] }}
 */
export function erfuellungsbericht(m, ergebnis) {
  try {
    return berichtRechnen(m, ergebnis);
  } catch {
    return nein("fehler");
  }
}

/** @param {any} m @param {any} e @returns {any} geprüfte Form: siehe erfuellungsbericht */
function berichtRechnen(m, e) {
  if (!betriebOk(m)) return nein("betrieb_ungueltig");
  if (!istObjekt(e)) return nein("ergebnis_ungueltig");
  if (e.status !== "ok") return { ok: false, grund: "kein_vorschlag", status: typeof e.status === "string" ? e.status : "unbekannt" };
  if (typeof e.ym !== "string" || !/^\d{4}-\d{2}$/.test(e.ym)) return nein("monat_ungueltig");
  const j = Number(e.ym.slice(0, 4)), mo = Number(e.ym.slice(5, 7));
  if (mo < 1 || mo > 12 || j < 2000 || j > 2100) return nein("monat_ungueltig");
  if (!Array.isArray(e.gesetzt) || !Array.isArray(e.offen) || !istObjekt(e.abweichungen) || !rangOk(e.rang)) return nein("ergebnis_ungueltig");
  const nTage = tageImMonat(j, mo);
  const P = Math.max(1, m.personen.length);
  /* Aufwand vorab: Besetzung je Tag liest jede Person einmal (Personentage), Stellen = Tage × Dienste. */
  if (P * nTage > BERICHT_GRENZE.personenTage || m.dienstarten.length * nTage > BERICHT_GRENZE.stellen) return nein("aufwand");
  /* … Nachprüfung der eigenen Einteilungen: je Einteilung eine Einsatzprüfung (P + 1) und die Vorwärtsprüfung (2 je Folgetag), je Tag
     die Bestandspersonen (2 P) — dieselbe Rechnung wie die Reserve des Planers; Planbefunde je Einteilung höchstens planbefundAufwandHoechst. */
  const n = e.gesetzt.length;
  const mf = Number(m.einstellungen.maxFolge);
  const W = mf > 0 ? Math.ceil(mf) : 0;
  if (n * (P + 1 + 2 * W) + 2 * nTage * P > BERICHT_GRENZE.nachpruefung) return nein("aufwand");
  if (n * planbefundAufwandHoechst(m, j) > BERICHT_GRENZE.planbefund) return nein("aufwand");
  const tage = [];
  for (let t = 1; t <= nTage; t++) tage.push(`${e.ym}-${pad2(t)}`);

  /* Abgleich Bestand ↔ Vorschlag (O(|Abweichungen|)): Jede eigene Einteilung einmal, bekannte Person und bekannter Dienst, im Monat,
     im Stand gesetzt und dort anders als im Bestand; jeder Schlüssel, in dem sich Vorschlag und Bestand unterscheiden (Wert oder
     Anwesenheit), ist genau eine eigene Einteilung. Sonst stünde im Stand etwas, das nie nachgeprüft wurde. */
  const hat = Object.prototype.hasOwnProperty;
  const basis = m.abweichungen, vor = e.abweichungen;
  const personIds = new Set(m.personen.map((p) => p.id)), dienstIds = new Set(m.dienstarten.map((d) => d.id));
  const eigeneSchl = new Set();
  for (const g of e.gesetzt) {
    if (!istObjekt(g) || typeof g.datum !== "string" || g.datum.slice(0, 7) !== e.ym || !tage.includes(g.datum)) return passtNicht("einteilung");
    if (!personIds.has(g.personId) || !dienstIds.has(g.dienstId)) return passtNicht("einteilung");
    const k = `${g.personId}|${g.datum}`;
    if (eigeneSchl.has(k)) return passtNicht("einteilung");
    eigeneSchl.add(k);
    if (!hat.call(vor, k) || vor[k] !== g.dienstId) return passtNicht("einteilung");
    if (hat.call(basis, k) && gleicherWert(basis[k], vor[k])) return passtNicht("einteilung");
  }
  for (const k of Object.keys(basis)) if ((!hat.call(vor, k) || !gleicherWert(basis[k], vor[k])) && !eigeneSchl.has(k)) return passtNicht("abweichungen");
  for (const k of Object.keys(vor)) if (!hat.call(basis, k) && !eigeneSchl.has(k)) return passtNicht("abweichungen");

  /* Kennungen der offenen Stellen des Planers: Werteliste für Ursache und Grund, Kennungsmuster für Regeln (kein Freitext, kein Name). */
  for (const x of e.offen) {
    if (!istObjekt(x)) return passtNicht("offen");
    if (x.ursache !== undefined && !BERICHT_URSACHEN.includes(x.ursache)) return passtNicht("kennung");
    if (x.grund !== undefined && !BERICHT_GRUENDE.includes(x.grund)) return passtNicht("kennung");
    if (x.regeln !== undefined && (!Array.isArray(x.regeln) || x.regeln.length > 20 || !x.regeln.every(istKennung))) return passtNicht("kennung");
  }

  /* Fertiger Stand: Bestand mit den Abweichungen des Vorschlags (eigenes Objekt; Bestand und Ergebnis bleiben unberührt). */
  const stand = { ...m, abweichungen: { ...vor } };

  /* Besetzung nachrechnen: Stellen, Bedarf, Qualifikation; offene Stellen wie der Planer (diff < 0 oder Qualifikation fehlt). */
  const dIndex = new Map(m.dienstarten.map((d, i) => [d.id, i]));
  let stellen = 0, voll = 0, offenB = 0, bedarfOffen = 0, bedarf = 0, fehltSumme = 0, qualStellen = 0, qualOffen = 0;
  const offenFrisch = new Map();
  for (const d of tage) {
    const bes = besetzung(stand, d);
    for (const da of m.dienstarten) {
      const b = bes[da.id];
      if (!b) continue;
      const soll = Number.isFinite(b.soll) ? b.soll : null;
      if (b.bedarfOffen || soll === null) bedarfOffen++;
      else if (soll > 0) {
        stellen++; bedarf += soll;
        if (b.diff >= 0) voll++; else { offenB++; fehltSumme += -b.diff; }
      }
      if (Array.isArray(b.qual) && b.qual.length) { qualStellen++; if (b.qualFehlt) qualOffen++; }
      if (b.diff < 0 || b.qualFehlt) {
        offenFrisch.set(`${d}#${da.id}`, { datum: d, dienstId: da.id, fehlt: Math.max(0, -b.diff), qualFehlt: !!b.qualFehlt,
          fehlendeQualifikationen: (b.qual || []).filter((q) => !q.ok).map((q) => ({ qid: String(q.qid), noetig: q.noetig, ist: q.ist })),
          bedarfOffen: !!b.bedarfOffen });
      }
    }
  }

  /* Abgleich mit den offenen Stellen des Vorschlags (gleiche Menge, gleiche Zahlen); sonst kein Bericht. */
  if (e.offen.length !== offenFrisch.size) return passtNicht("offen");
  const vomPlaner = new Map();
  for (const x of e.offen) {
    const k = `${x.datum}#${x.dienstId}`;
    const f = offenFrisch.get(k);
    if (!f || vomPlaner.has(k) || x.fehlt !== f.fehlt || !!x.qualFehlt !== f.qualFehlt) return passtNicht("offen");
    vomPlaner.set(k, x);
  }

  /* Nachprüfung neu gerechnet (nicht der Rang des Planers): jede eigene Einteilung auf dem fertigen Stand mit dem HEUTIGEN Bestand
     (auch nach dem Planen ergänzte Vorgaben), eigenes Budget der Vorgaben, Automatik. Nicht bestanden oder andere Zahlen als der
     Rang ⇒ kein Bericht. Soll: hat der Planer null (Budget der Vorgaben im Lauf geteilt), gilt die eigene Zahl; ist die eigene null,
     ist Soll nicht bewertbar. */
  const np = nachpruefen(m, stand, e.gesetzt, neuesVorgabenBudget());
  if (!np.durch) return passtNicht("nachpruefung");
  const sollNeu = np.offenV ? null : np.soll;
  if (np.gesetz !== e.rang.gesetz || np.muss !== e.rang.muss || (sollNeu !== null && e.rang.soll !== null && sollNeu !== e.rang.soll)) return passtNicht("nachpruefung");

  /* Verteilung neu gerechnet (dieselben Funktionen wie der Planer, auf dem fertigen Stand) und mit dem Ergebnis abgeglichen. */
  const vAufwand = verteilungAufwand(m, tage);
  let vt = null, verteilung = null;
  if (vAufwand) {
    vt = verteilungVorbereiten(m, tage, vAufwand <= BERICHT_GRENZE.verteilung);
    verteilung = verteilungBewerten(vt, nachtZaehlen(stand, vt));
  }
  if (!verteilung) { if (e.verteilung !== null && e.verteilung !== undefined) return passtNicht("verteilung"); }
  else if (!istObjekt(e.verteilung)) return passtNicht("verteilung");
  else if (!planerOhneVerteilung(e.verteilung) && verteilungForm(e.verteilung) !== verteilungForm(verteilung)) return passtNicht("verteilung");

  /* Konflikte: Wo (Tag, Dienst, was fehlt), Warum (Ursache des Planers, kleinste Regelmenge, Grund), Wege (Nachrechnung). */
  const budget = budgetNeu(), vorgabenBudget = neuesVorgabenBudget();
  let nachgerechnet = 0;
  const alle = [...offenFrisch.entries()].sort(([, a], [, b]) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : dIndex.get(a.dienstId) - dIndex.get(b.dienstId)));
  const konflikte = [];
  let mitWegen = 0, wegeUnvollstaendig = 0;
  /* Unvollständige Ursachen über ALLE offenen Stellen (auch jenseits der gelisteten), nie still. */
  const ursacheUnvollstaendig = [...vomPlaner.values()].filter((p) => (typeof p.ursache === "string" ? p.ursache === "unvollstaendig" : !p.grund) || !!p.vorgabenUnvollstaendig).length;
  for (const [k, f] of alle) {
    if (konflikte.length >= BERICHT_GRENZE.konflikte) break;
    const p = vomPlaner.get(k);
    const ursache = typeof p.ursache === "string" ? p.ursache : p.grund ? "grund" : "unvollstaendig";
    const regeln = Array.isArray(p.regeln) ? [...p.regeln] : [];
    let wege = [], wegeStatus = "keine";
    if (ursache === "hindernisse" && !p.vorgabenUnvollstaendig) {
      wegeStatus = "unvollstaendig";
      if (nachgerechnet < LUECKEN_MAX) {
        nachgerechnet++;
        /** @type {any} */
        const r = lueckenUrsache(stand, f.datum, f.dienstId, { budget, vorgabenBudget });
        const gleich = r && r.ok !== false && r.ursache === "hindernisse" && !r.unvollstaendig && r.kleinste
          && r.kleinste.regeln.length === regeln.length && r.kleinste.regeln.every((x, i) => String(x) === regeln[i]);
        if (gleich) { wege = r.wege.map((w) => ({ regeln: w.regeln.map(String), personen: w.personen, deckt: w.deckt })); wegeStatus = "berechnet"; }
      }
    }
    if (wegeStatus === "berechnet") mitWegen++;
    if (wegeStatus === "unvollstaendig") wegeUnvollstaendig++;
    konflikte.push({
      datum: f.datum, dienstId: f.dienstId,
      art: f.fehlt > 0 && f.qualFehlt ? "besetzung_und_qualifikation" : f.fehlt > 0 ? "besetzung" : "qualifikation",
      fehlt: f.fehlt, qualFehlt: f.qualFehlt, fehlendeQualifikationen: f.fehlendeQualifikationen,
      ...(f.bedarfOffen ? { bedarfOffen: true } : {}),
      ursache, regeln, ...(typeof p.grund === "string" ? { grund: p.grund } : {}), ...(p.vorgabenUnvollstaendig ? { vorgabenUnvollstaendig: true } : {}),
      wegeStatus, wege,
    });
  }

  /* Kategorien in der Rangfolge (Gesetz, Muss, Soll aus der eigenen Nachprüfung). */
  const qualifikation = { kategorie: "qualifikation", rang: 1, stellen: qualStellen, offen: qualOffen,
    status: qualOffen ? "offen" : qualStellen ? "erfuellt" : "nicht-bewertbar", ...(qualStellen ? {} : { grund: "keine_anforderung" }) };
  let bStatus = offenB ? "offen" : stellen ? "erfuellt" : "nicht-bewertbar";
  if (bStatus === "erfuellt" && bedarfOffen) bStatus = "nicht-bewertbar";
  const besetzungK = { kategorie: "besetzung", rang: 2, stellen, voll, offen: offenB, bedarf, fehlt: fehltSumme, bedarfOffen, status: bStatus,
    ...(bStatus === "nicht-bewertbar" ? { grund: bedarfOffen ? "bedarf_nicht_festgelegt" : "keine_anforderung" } : {}) };
  const kategorien = [
    ausNachpruefung("gesetz", np.gesetz, n),
    qualifikation,
    besetzungK,
    ausNachpruefung("muss", np.muss, n, vorgabenZahl(m, "muss")),
    ausNachpruefung("soll", sollNeu, n, vorgabenZahl(m, "soll")),
    verteilungKategorie(m, verteilung),
    { kategorie: "wunsch", rang: 6, status: "nicht-bewertbar", grund: "nicht_bewertet", vorgaben: vorgabenZahl(m, "wunsch") },
  ];
  /* Maßgeblich: ranghöchste nicht erfüllte Kategorie. Wunsch ist nie bewertet, daher gibt es sie immer (letzte als Rückfall).
     Erstes Problem: ranghöchste Kategorie mit „verletzt“ oder „offen“ (null: keine; nicht bewertbare zählen hier nicht). */
  const massgeblichK = kategorien.find((x) => x.status !== "erfuellt") || kategorien[kategorien.length - 1];
  const problemK = kategorien.find((x) => x.status === "verletzt" || x.status === "offen");
  const zaehl = (f) => kategorien.filter(f).length;
  return {
    ok: true, ym: e.ym, startwert: zahlOk(e.startwert) ? e.startwert : null,
    massgeblich: { kategorie: massgeblichK.kategorie, status: massgeblichK.status },
    erstesProblem: problemK ? { kategorie: problemK.kategorie, status: problemK.status } : null,
    zusammenfassung: {
      kategorien: { erfuellt: zaehl((x) => x.status === "erfuellt" && !x.aussage), erfuelltImVorschlag: zaehl((x) => x.status === "erfuellt" && !!x.aussage),
        verletzt: zaehl((x) => x.status === "verletzt"), offen: zaehl((x) => x.status === "offen"), nichtBewertbar: zaehl((x) => x.status === "nicht-bewertbar") },
      stellen: { gesamt: stellen, voll, offen: offenB, bedarfOffen },
      qualifikation: { stellen: qualStellen, offen: qualOffen },
      eigeneEinteilungen: n,
      konflikte: { gesamt: offenFrisch.size, gelistet: konflikte.length, abgeschnitten: offenFrisch.size > konflikte.length,
        mitWegen, wegeUnvollstaendig, ursacheUnvollstaendig },
    },
    kategorien,
    konflikte,
  };
}
