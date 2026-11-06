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

/**
 * Prüft die Niveaus gegen die Qualifikationen des Betriebs.
 * @param {any} niveaus
 * @param {any[]} qualifikationen die Qualifikationen des Betriebs (mit fachkraft-Flag)
 * @returns {string | null}
 */
export function pruefePflegeNiveaus(niveaus, qualifikationen = []) {
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
    }
  }
  return null;
}

/**
 * Verteilung der Personen eines Dienstes nach Niveau und Gruppe (Q2 a: Betreuung
 * getrennt, nie als Pflege). Eine Person zählt in dem Niveau mit der höchsten Gruppe
 * (fachkraft vor assistenz vor betreuung vor sonstige).
 * @param {any} m
 * @param {any[]} personenImDienst
 * @param {{ qualGueltig: (m: any, p: any, qid: string, heute: string) => boolean, heute: string }} o
 */
export function pflegeVerteilung(m, personenImDienst, { qualGueltig, heute }) {
  if (typeof qualGueltig !== "function") throw new Error("pflegeVerteilung: Qualifikationsprüfung fehlt.");
  const niveaus = Array.isArray(m && m.pflegeNiveaus) ? m.pflegeNiveaus.filter(istObjekt) : [];
  const rang = { fachkraft: 0, assistenz: 1, betreuung: 2, sonstige: 3 };
  const zaehl = new Map(niveaus.map((n) => [n.id, 0]));
  let ohne = 0;
  for (const p of Array.isArray(personenImDienst) ? personenImDienst : []) {
    const passend = niveaus
      .filter((n) => n.qualifikationen.some((q) => (p.qualifikationen || []).includes(q) && qualGueltig(m, p, q, heute)))
      .sort((a, b) => rang[a.gruppe] - rang[b.gruppe] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (passend.length) zaehl.set(passend[0].id, zaehl.get(passend[0].id) + 1);
    else ohne++;
  }
  const niveauListe = niveaus.map((n) => ({ id: n.id, name: n.name, gruppe: n.gruppe, versorgung: n.versorgung ?? null, anzahl: zaehl.get(n.id) }))
    .sort((a, b) => rang[a.gruppe] - rang[b.gruppe] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const summe = (g) => niveauListe.filter((n) => n.gruppe === g).reduce((s, n) => s + n.anzahl, 0);
  return {
    niveaus: niveauListe,
    fachkraefte: summe("fachkraft"),
    pflegekraefte: summe("fachkraft") + summe("assistenz"),
    betreuung: summe("betreuung"),
    ohneNiveau: ohne,
  };
}

/**
 * Schreibweg (Prüfung): Niveaus gegen die Qualifikationen des Betriebs.
 * @param {any} neuM
 * @returns {{ grund?: string }}
 */
export function pflegeZusammen(neuM) {
  if (!neuM || typeof neuM !== "object") return {};
  const f = pruefePflegeNiveaus(neuM.pflegeNiveaus, Array.isArray(neuM.qualifikationen) ? neuM.qualifikationen : []);
  return f ? { grund: f } : {};
}
