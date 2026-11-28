/* ==========================================================================
   ERFÜLLUNGSBERICHT ZU EINEM PLANVORSCHLAG (WP-I8, Block K, Engine-Stufe)

   Plan 7.4 (docs/intelligence/PLAN-WARNEN-VORGABEN-PLANVORSCHLAG.md): Jeder Vorschlag hat einen
   Erfüllungsbericht mit Zählwerten — „118 von 120 Diensten voll besetzt“ —, keine Gesamtnote in Prozent
   und keine Punktzahl je Person (D-16, D-01). Akzeptanz WP-I8 (INTELLIGENCE-ENTWICKLUNGSPLAN.md, Block K):
   „Bericht nennt nur Zählwerte; je offenem Konflikt Wo/Warum/Wege; keine Scores je Person.“

   Eingabe: der Bestand `m` (vor dem Planer) und das Ergebnis von `planeVorschlag` (planer.mjs) mit
   Status „ok“. Der Bericht rechnet die Besetzung des fertigen Stands (Bestand + Abweichungen des
   Vorschlags) selbst nach und gleicht sie mit den offenen Stellen des Vorschlags ab; passt das Ergebnis
   nicht zum Bestand, gibt es keinen Bericht (fail closed, nie ein geschönter).

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

   Umfang: Gesetz, Muss und Soll stammen aus der Nachprüfung des Planers, sie betreffen die EIGENEN
   Einteilungen des Vorschlags (`umfang: "vorschlag"`), nicht den Bestand (`bestandGeprueft: false`).

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
import { neuesVorgabenBudget } from "../vorgabenwirkung.mjs";
import { aktiveVorgaben } from "../vorgaben.mjs";

/** Kategorien in der Rangfolge (kleinerer Index geht vor). */
export const BERICHT_RANGFOLGE = Object.freeze(["gesetz", "qualifikation", "besetzung", "muss", "soll", "verteilung", "wunsch"]);
/** Status einer Kategorie bzw. einer Vorgabe. */
export const BERICHT_STATUS = Object.freeze(["erfuellt", "verletzt", "offen", "nicht-bewertbar"]);
/** Obergrenzen je Bericht: Personentage des Monats (Besetzung nachrechnen), Stellen (Tag × Dienst), gelistete Konflikte. */
export const BERICHT_GRENZE = Object.freeze({ personenTage: 200000, stellen: 20000, konflikte: 500 });

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

/** Betrieb mit den Feldern, die Besetzung und Ursache lesen. */
const betriebOk = (m) => istObjekt(m) && Array.isArray(m.personen) && Array.isArray(m.dienstarten) && Array.isArray(m.abwesenheiten)
  && istObjekt(m.einstellungen) && istObjekt(m.abweichungen)
  && m.personen.every((p) => istObjekt(p) && p.id !== undefined && p.id !== null)
  && m.dienstarten.every((d) => istObjekt(d) && d.id !== undefined && d.id !== null);

/** Rangvektor des Planers: Zahlen ≥ 0 oder null (nicht bewertet). */
const rangOk = (r) => istObjekt(r) && ["gesetz", "besetzung", "muss", "soll", "verteilung", "stabilitaet"]
  .every((k) => r[k] === null || (typeof r[k] === "number" && Number.isFinite(r[k]) && r[k] >= 0));

/** Anzahl aktiver Vorgaben einer Stärke (ohne Verteilungsvorgaben; die stehen unter „verteilung“). */
const vorgabenZahl = (m, staerke) => aktiveVorgaben(m.vorgaben).filter((v) => v.staerke === staerke && v.regelart !== "verteilungsregel").length;

/**
 * Kategorie aus einer Zählung der Nachprüfung (Gesetz, Muss, Soll): verletzt bei einem Befund; ohne eigene Einteilung oder
 * ohne Vorgabe nicht bewertbar (nie „erfüllt“ ohne Prüfung); ein nicht bewerteter Rang (null) ist nicht bewertbar.
 */
function ausNachpruefung(name, wert, eigene, vorgaben) {
  const k = { kategorie: name, rang: BERICHT_RANGFOLGE.indexOf(name), umfang: "vorschlag", bestandGeprueft: false, geprueft: eigene,
    verletzt: zahlOk(wert) ? wert : 0, ...(vorgaben === undefined ? {} : { vorgaben }) };
  if (wert === null) return { ...k, status: "nicht-bewertbar", grund: "vorgaben_nicht_vollstaendig_geprueft" };
  if (wert > 0) return { ...k, status: "verletzt" };
  if (vorgaben === 0) return { ...k, status: "nicht-bewertbar", grund: "keine_vorgabe" };
  if (eigene === 0) return { ...k, status: "nicht-bewertbar", grund: "keine_einteilung_im_vorschlag" };
  return { ...k, status: "erfuellt" };
}

/** Status einer Verteilungsvorgabe des Planers im Bericht (nicht Bewertetes nie „erfüllt“). */
function verteilungStatus(r) {
  if (r.status === "erfuellt") return "erfuellt";
  if (r.status === "verletzt") return "verletzt";        // Spannweite der bekannten Werte überschritten: mit weiteren Personen nur größer
  return "nicht-bewertbar";                                // offen, nicht_bewertet, nicht_anwendbar, Unbekanntes
}

/** Verteilungsvorgaben: nur Kennungen und Zählwerte der Gruppe, keine Werte je Person. */
function verteilungKategorie(m, v) {
  const k = { kategorie: "verteilung", rang: BERICHT_RANGFOLGE.indexOf("verteilung"), nachgelagert: true };
  const anzahl = aktiveVorgaben(m.vorgaben).filter((x) => x.regelart === "verteilungsregel").length;
  if (!istObjekt(v) || !Array.isArray(v.regeln)) return { ...k, status: "nicht-bewertbar", grund: anzahl ? "nicht_bewertet" : "keine_vorgabe", vorgaben: [] };
  const zahl = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const laenge = (x) => (Array.isArray(x) ? x.length : 0);
  const vorgaben = v.regeln.filter(istObjekt).map((r) => ({
    vorgabeId: String(r.vorgabeId), staerke: typeof r.staerke === "string" ? r.staerke : null, groesse: typeof r.groesse === "string" ? r.groesse : null,
    status: verteilungStatus(r), ...(typeof r.grund === "string" ? { grund: r.grund } : r.status !== "erfuellt" && r.status !== "verletzt" ? { grund: String(r.status) } : {}),
    maxAbweichung: zahl(r.maxAbweichung), spannweite: zahl(r.spannweite), ueberschreitung: zahl(r.ueberschreitung),
    personen: laenge(r.personen), nichtBewertbar: laenge(r.nichtBewertbar), ausserhalb: laenge(r.ausserhalb),
  })).sort((a, b) => (a.vorgabeId < b.vorgabeId ? -1 : a.vorgabeId > b.vorgabeId ? 1 : 0));
  let status = vorgaben.length ? "erfuellt" : "nicht-bewertbar";
  for (const x of vorgaben) status = schlechter(status, x.status);
  /* Der Planer bewertet die Verteilung nur vollständig (sonst Rang null): dann nie „erfüllt“. */
  if (status === "erfuellt" && v.bewertet !== true) status = "nicht-bewertbar";
  const zaehl = (s) => vorgaben.filter((x) => x.status === s).length;
  return { ...k, status, ...(status === "nicht-bewertbar" && !vorgaben.length ? { grund: "keine_vorgabe" } : {}),
    summeUeberschreitung: v.bewertet === true ? zahl(v.summe) : null,
    erfuellt: zaehl("erfuellt"), verletzt: zaehl("verletzt"), nichtBewertbar: zaehl("nicht-bewertbar"), vorgaben };
}

/**
 * Erfüllungsbericht zu einem Planvorschlag. Rein, deterministisch, wirft nie.
 * @param {any} m Bestand vor dem Planer (derselbe, mit dem planeVorschlag gerechnet hat)
 * @param {any} ergebnis Ergebnis von planeVorschlag (Status „ok“)
 * @returns {{ ok: false, grund: string, status?: string } | { ok: true, ym: string, startwert: any, massgeblich: { kategorie: string, status: string } | null,
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
  /* Aufwand vorab: Besetzung je Tag liest jede Person einmal (Personentage), Stellen = Tage × Dienste. */
  if (Math.max(1, m.personen.length) * nTage > BERICHT_GRENZE.personenTage || m.dienstarten.length * nTage > BERICHT_GRENZE.stellen) return nein("aufwand");
  const tage = [];
  for (let t = 1; t <= nTage; t++) tage.push(`${e.ym}-${pad2(t)}`);

  /* Fertiger Stand: Bestand mit den Abweichungen des Vorschlags (eigenes Objekt; Bestand und Ergebnis bleiben unberührt). */
  const stand = { ...m, abweichungen: { ...e.abweichungen } };
  const hat = Object.prototype.hasOwnProperty;

  /* Eigene Einteilungen müssen im Stand stehen und im Monat liegen (sonst gehört das Ergebnis nicht zu diesem Bestand). */
  for (const g of e.gesetzt) {
    if (!istObjekt(g) || typeof g.datum !== "string" || g.datum.slice(0, 7) !== e.ym) return nein("ergebnis_passt_nicht");
    const k = `${g.personId}|${g.datum}`;
    if (!hat.call(stand.abweichungen, k) || stand.abweichungen[k] !== g.dienstId) return nein("ergebnis_passt_nicht");
  }

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
  if (e.offen.length !== offenFrisch.size) return nein("ergebnis_passt_nicht");
  const vomPlaner = new Map();
  for (const x of e.offen) {
    if (!istObjekt(x)) return nein("ergebnis_passt_nicht");
    const k = `${x.datum}#${x.dienstId}`;
    const f = offenFrisch.get(k);
    if (!f || vomPlaner.has(k) || x.fehlt !== f.fehlt || !!x.qualFehlt !== f.qualFehlt) return nein("ergebnis_passt_nicht");
    vomPlaner.set(k, x);
  }

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
    const regeln = Array.isArray(p.regeln) ? p.regeln.map(String) : [];
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

  /* Kategorien in der Rangfolge. */
  const eigene = e.gesetzt.length;
  const rang = e.rang;
  const qualifikation = { kategorie: "qualifikation", rang: 1, stellen: qualStellen, offen: qualOffen,
    status: qualOffen ? "offen" : qualStellen ? "erfuellt" : "nicht-bewertbar", ...(qualStellen ? {} : { grund: "keine_anforderung" }) };
  let bStatus = offenB ? "offen" : stellen ? "erfuellt" : "nicht-bewertbar";
  if (bStatus === "erfuellt" && bedarfOffen) bStatus = "nicht-bewertbar";
  const besetzungK = { kategorie: "besetzung", rang: 2, stellen, voll, offen: offenB, bedarf, fehlt: fehltSumme, bedarfOffen, status: bStatus,
    ...(bStatus === "nicht-bewertbar" ? { grund: bedarfOffen ? "bedarf_nicht_festgelegt" : "keine_anforderung" } : {}) };
  const kategorien = [
    ausNachpruefung("gesetz", rang.gesetz, eigene),
    qualifikation,
    besetzungK,
    ausNachpruefung("muss", rang.muss, eigene, vorgabenZahl(m, "muss")),
    ausNachpruefung("soll", rang.soll, eigene, vorgabenZahl(m, "soll")),
    verteilungKategorie(m, e.verteilung),
    { kategorie: "wunsch", rang: 6, status: "nicht-bewertbar", grund: "nicht_bewertet", vorgaben: vorgabenZahl(m, "wunsch") },
  ];
  const massgeblichK = kategorien.find((x) => x.status !== "erfuellt");
  const zaehl = (s) => kategorien.filter((x) => x.status === s).length;
  return {
    ok: true, ym: e.ym, startwert: zahlOk(e.startwert) ? e.startwert : null,
    massgeblich: massgeblichK ? { kategorie: massgeblichK.kategorie, status: massgeblichK.status } : null,
    zusammenfassung: {
      kategorien: { erfuellt: zaehl("erfuellt"), verletzt: zaehl("verletzt"), offen: zaehl("offen"), nichtBewertbar: zaehl("nicht-bewertbar") },
      stellen: { gesamt: stellen, voll, offen: offenB, bedarfOffen },
      qualifikation: { stellen: qualStellen, offen: qualOffen },
      eigeneEinteilungen: eigene,
      konflikte: { gesamt: offenFrisch.size, gelistet: konflikte.length, abgeschnitten: offenFrisch.size > konflikte.length,
        mitWegen, wegeUnvollstaendig, ursacheUnvollstaendig },
    },
    kategorien,
    konflikte,
  };
}
