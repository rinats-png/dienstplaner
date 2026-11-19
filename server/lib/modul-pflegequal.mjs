/* ==========================================================================
   MODUL PFLEGEQUALIFIKATION — Niveaus und Verteilung je Dienst (WP-19, Strang B)

   Nach der Entscheidungsmatrix (vorläufig bis zur Nutzerentscheidung):
     Q1 a+b  Niveaus als Gruppen von Qualifikationen des Betriebs. Vorlagen kommen
             aus dem Branchenkatalog (server/lib/branchen.mjs, Pflege); Niveaus
             sind je Betrieb einstellbar. Versorgungsform (vollstationär,
             ambulant) nur, wo der Betrieb sie angibt; sonst leer.
     Q2 a    Betreuungskräfte (§ 43b SGB XI) werden getrennt gezählt und nie als
             Pflege- oder Fachkraft. Eine Fachkraft-Qualifikation (Flag
             fachkraft) lässt sich nicht als Betreuung oder Assistenz zuordnen.
             Umgekehrt (M-PQ1, FN-14 entschieden 2026-11-14): eine Betreuungs-
             qualifikation (§ 43b SGB XI in Grundlage oder Name, oder Merkmal
             „betreuung“) steht nur in der Gruppe betreuung. Der Schreibweg weist
             neue oder geänderte Niveaus ab; ein unverändert gespeichertes Altniveau
             wird nicht still umgedeutet, die Verteilung zählt die Qualifikation
             dort aber nie (nicht als Pflegekraft) und meldet einen Hinweis.
     Q3 b    Keine verbindliche Besetzungsprüfung: die Personalbemessungswerte
             sind nicht festgelegt (Fachnachweis offen). Die Verteilung ist eine
             Kennzahl, kein Befund.

   Betriebsfeld `pflegeNiveaus` (Sachfeld, Liste mit id): je Niveau Name, Gruppe
   (fachkraft | assistenz | betreuung | sonstige), Versorgungsform und die
   Kennungen der Qualifikationen. Personen tragen ihre Qualifikationen wie bisher.
   Rein: keine Ablage, keine Uhr.
   ========================================================================== */

export const PFLEGE_GRUPPEN = Object.freeze(["fachkraft", "assistenz", "betreuung", "sonstige"]);
export const PFLEGE_VERSORGUNG = Object.freeze([null, "vollstationaer", "ambulant", "beides"]);
export const PFLEGE_GRENZEN = Object.freeze({ niveaus: 40, qualifikationen: 50, nameMax: 60 });

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const idOk = (s) => typeof s === "string" && s.length >= 1 && s.length <= 60;
const P43B = /§\s*43\s*b(?![a-z0-9])/i;

/**
 * Ist die Qualifikation eine Betreuungsqualifikation (§ 43b SGB XI)? Erkannt an der Grundlage oder am Namen
 * („§ 43b“, „§43b“) oder am Merkmal „betreuung“ (FN-14, Q2 a).
 * @param {any} q
 * @returns {boolean}
 */
export function istBetreuungsQualifikation(q) {
  if (!istObjekt(q)) return false;
  return q.merkmal === "betreuung" || (typeof q.grundlage === "string" && P43B.test(q.grundlage)) || (typeof q.name === "string" && P43B.test(q.name));
}

/**
 * Prüft die Niveaus gegen die Qualifikationen des Betriebs.
 * @param {any} niveaus
 * @param {any[]} qualifikationen die Qualifikationen des Betriebs (mit fachkraft-Flag)
 * @param {any[]} [gespeichert] die gespeicherten Niveaus: ein dort unverändert stehendes Niveau (gleiche Kennung, gleicher Inhalt)
 *   wird nicht gegen die Betreuungsregel (M-PQ1) geprüft — Altbestand bleibt speicherbar, die Verteilung zählt ihn richtig.
 * @returns {string | null}
 */
export function pruefePflegeNiveaus(niveaus, qualifikationen = [], gespeichert = []) {
  if (niveaus === undefined || niveaus === null) return null;
  if (!Array.isArray(niveaus)) return "Niveaus: erwartet wird eine Liste.";
  if (niveaus.length > PFLEGE_GRENZEN.niveaus) return `Niveaus: höchstens ${PFLEGE_GRENZEN.niveaus}.`;
  const ids = new Set();
  const belegt = new Set();
  for (const n of niveaus) {
    if (!istObjekt(n)) return "Niveau: erwartet wird ein Datensatz.";
    const wo = `Niveau ${String(n.name || n.id || "").slice(0, 30)}`.trim();
    if (Object.keys(n).some((k) => !["id", "name", "gruppe", "versorgung", "qualifikationen"].includes(k))) return `${wo}: unbekannte Felder.`;
    if (!idOk(n.id)) return `${wo}: Kennung fehlt oder ist zu lang.`;
    if (ids.has(n.id)) return `${wo}: Kennung kommt doppelt vor.`;
    ids.add(n.id);
    if (typeof n.name !== "string" || !n.name.trim() || n.name.length > PFLEGE_GRENZEN.nameMax) return `${wo}: Name fehlt oder ist zu lang.`;
    if (!PFLEGE_GRUPPEN.includes(n.gruppe)) return `${wo}: Gruppe ist fachkraft, assistenz, betreuung oder sonstige.`;
    if (!PFLEGE_VERSORGUNG.includes(n.versorgung ?? null)) return `${wo}: Versorgungsform unbekannt.`;
    if (!Array.isArray(n.qualifikationen) || n.qualifikationen.length > PFLEGE_GRENZEN.qualifikationen || n.qualifikationen.some((q) => !idOk(q)))
      return `${wo}: Qualifikationen als Liste von Kennungen erwartet.`;
    for (const q of n.qualifikationen) {
      const bek = qualifikationen.find((x) => istObjekt(x) && x.id === q);
      if (!bek) return `${wo}: Qualifikation „${String(q).slice(0, 30)}" ist dem Betrieb nicht bekannt.`;
      if (belegt.has(q)) return `${wo}: Qualifikation „${bek.name || q}" steht schon in einem anderen Niveau.`;
      belegt.add(q);
      if (n.gruppe === "fachkraft" && bek.fachkraft !== true) return `${wo}: nur Fachkraft-Qualifikationen gehören in die Gruppe fachkraft.`;
      if ((n.gruppe === "betreuung" || n.gruppe === "assistenz") && bek.fachkraft === true)
        return `${wo}: eine Fachkraft-Qualifikation lässt sich nicht als ${n.gruppe === "betreuung" ? "Betreuung" : "Assistenz"} zählen (Q2 a).`;
      if (n.gruppe !== "betreuung" && istBetreuungsQualifikation(bek) && !unveraendert(n, gespeichert))
        return `${wo}: „${String(bek.name || q).slice(0, 40)}“ ist eine Betreuungsqualifikation (§ 43b SGB XI) und gehört nur in die Gruppe betreuung — sie zählt nie als Pflege- oder Fachkraft (Q2 a, FN-14).`;
    }
  }
  return null;
}

/** Steht das Niveau unverändert (gleiche Kennung, gleicher Inhalt) im gespeicherten Stand? */
function unveraendert(n, gespeichert) {
  if (!Array.isArray(gespeichert)) return false;
  const alt = gespeichert.find((x) => istObjekt(x) && x.id === n.id);
  return !!alt && JSON.stringify(alt) === JSON.stringify(n);
}

/**
 * Verteilung der Personen eines Dienstes nach Niveau und Gruppe (Q2 a: Betreuung
 * getrennt, nie als Pflege). Eine Person zählt in dem Niveau mit der höchsten Gruppe
 * (fachkraft vor assistenz vor betreuung vor sonstige).
 *
 * M-PQ1 (Lesepfad für Altbestand): Eine Betreuungsqualifikation (istBetreuungsQualifikation) in einem Niveau außerhalb der
 * Gruppe betreuung zählt dort nicht — die Person also nie deshalb als Pflege- oder Fachkraft. Solche Niveaus stehen in
 * `hinweise` (nur Niveau und Qualifikation, keine Personen); ohne Fehlzuordnung fehlt das Feld (Ergebnis wie bisher).
 * @param {any} m
 * @param {any[]} personenImDienst
 * @param {{ qualGueltig: (m: any, p: any, qid: string, heute: string) => boolean, heute: string }} o
 */
export function pflegeVerteilung(m, personenImDienst, { qualGueltig, heute }) {
  if (typeof qualGueltig !== "function") throw new Error("pflegeVerteilung: Qualifikationsprüfung fehlt.");
  const niveaus = Array.isArray(m && m.pflegeNiveaus) ? m.pflegeNiveaus.filter(istObjekt) : [];
  const rang = { fachkraft: 0, assistenz: 1, betreuung: 2, sonstige: 3 };
  const zaehl = new Map(niveaus.map((n) => [n.id, 0]));
  const quals = Array.isArray(m && m.qualifikationen) ? m.qualifikationen : [];
  const betreuungsQ = new Set(quals.filter(istBetreuungsQualifikation).map((q) => q.id));
  const fehl = (n, q) => n.gruppe !== "betreuung" && betreuungsQ.has(q);
  let ohne = 0;
  for (const p of Array.isArray(personenImDienst) ? personenImDienst : []) {
    const passend = niveaus
      .filter((n) => n.qualifikationen.some((q) => !fehl(n, q) && (p.qualifikationen || []).includes(q) && qualGueltig(m, p, q, heute)))
      .sort((a, b) => rang[a.gruppe] - rang[b.gruppe] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (passend.length) zaehl.set(passend[0].id, zaehl.get(passend[0].id) + 1);
    else ohne++;
  }
  const niveauListe = niveaus.map((n) => ({ id: n.id, name: n.name, gruppe: n.gruppe, versorgung: n.versorgung ?? null, anzahl: zaehl.get(n.id) }))
    .sort((a, b) => rang[a.gruppe] - rang[b.gruppe] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const summe = (g) => niveauListe.filter((n) => n.gruppe === g).reduce((s, n) => s + n.anzahl, 0);
  const hinweise = niveauListe.flatMap((nl) => {
    const n = niveaus.find((x) => x.id === nl.id);
    const falsch = n && Array.isArray(n.qualifikationen) ? n.qualifikationen.filter((q) => fehl(n, q)) : [];
    return falsch.length ? [{ niveau: n.id, name: n.name, gruppe: n.gruppe, qualifikationen: falsch,
      text: `Niveau „${String(n.name).slice(0, 60)}“ enthält eine Betreuungsqualifikation (§ 43b SGB XI) außerhalb der Gruppe Betreuung. Sie zählt hier nicht und nie als Pflegekraft — bitte das Niveau berichtigen.` }] : [];
  });
  return {
    niveaus: niveauListe,
    fachkraefte: summe("fachkraft"),
    pflegekraefte: summe("fachkraft") + summe("assistenz"),
    betreuung: summe("betreuung"),
    ohneNiveau: ohne,
    ...(hinweise.length ? { hinweise } : {}),
  };
}

/**
 * Schreibweg (Prüfung): Niveaus gegen die Qualifikationen des Betriebs.
 * @param {any} neuM
 * @param {any} [altM] gespeicherter Stand: unverändert gespeicherte Niveaus bleiben speicherbar (M-PQ1, kein stilles Umdeuten).
 * @returns {{ grund?: string }}
 */
export function pflegeZusammen(neuM, altM) {
  if (!neuM || typeof neuM !== "object") return {};
  const gespeichert = altM && typeof altM === "object" && Array.isArray(altM.pflegeNiveaus) ? altM.pflegeNiveaus : [];
  const f = pruefePflegeNiveaus(neuM.pflegeNiveaus, Array.isArray(neuM.qualifikationen) ? neuM.qualifikationen : [], gespeichert);
  return f ? { grund: f } : {};
}
