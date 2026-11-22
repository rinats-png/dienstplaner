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
             A1 (Delta-Review 2026-11-22): breitere Erkennung (Positivliste bei
             istBetreuungsQualifikation) und Prüfung auch bei geänderten
             Qualifikationen (pflegeQualAenderung, Umbenennen/Grundlage/Löschen).
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
/* Erkennung (Auflage A1, Delta-Review 2026-11-22). Die Zeichenkette wird normalisiert: NFKC (NBSP und NNBSP werden
   Leerzeichen), Kleinschreibung, Leerraum zusammengezogen, „paragraf“/„paragraph“ und „§§“ gelten als „§“.
   Positivliste, klein; im Repo belegt ist nur § 43b SGB XI (FN-14, ENTSCHEIDUNGSLISTE.md; branchen.mjs). Der Rest ist
   eine Annahme ohne Fachnachweis (vorläufig, Fachfreigabe offen):
     - § 43b SGB XI (belegt): „§ 43b“ (mit Paragrafzeichen, auch ohne Gesetz — erkennt damit auch „§ 43b SGB V“ oder
       „§ 43b BetrVG“; im Pflegekatalog hingenommen) oder „43b SGB XI“ (ohne Paragrafzeichen nur mit „SGB XI“).
     - § 87b SGB XI a. F. (nicht im Repo belegt): sachlich der Vorgänger bis 31.12.2016, im Altbestand
       („Betreuungsassistent § 87b“). Gleiche Schreibweisen.
     - Bezeichnungen „Betreuungskraft/-kräfte“, „Betreuungsassistent/-in/-enz“ (Sprachgebrauch für § 43b/§ 87b, nicht
       belegt) und „Alltagsbegleiter/-in/-ung“ (gehört fachlich eher zu § 45a SGB XI; aufgenommen, weil nie Pflegekraft).
       Erkennt auch z. B. „Kinderbetreuungskraft“ (harmlos: nie Pflegekraft).
     - Merkmal „betreuung“ (Groß-/Kleinschreibung und Leerraum egal) — die ausdrückliche Einordnung.
   Vorrang (A-1): Bei fachkraft === true zählen Name und Grundlage nicht, nur das Merkmal.
   Bewusst nicht: andere Paragrafen (§ 43, § 43c, § 87a, § 143b, SGB XII), das bloße Wort „Betreuung“ oder „Betreuer“,
   rechtliche Betreuung (Betreuungsrecht, Berufsbetreuer) — eine Fehlerkennung nähme eine echte Pflegekraft aus der
   Zählung. Nicht aufgenommen: § 53b/§ 53c SGB XI und weitere Haus- oder Landesbezeichnungen; dafür das Merkmal.
   Bekannte Grenze: Schreibweisen mit Bindestrich, weichem Trennstrich (U+00AD), Nullbreite (U+200B) oder fremden
   Schriftzeichen umgehen die Erkennung (Befund H-2, offen). */
const normal = (s) => s.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").replace(/paragra(?:ph|f)(?:en)?\.?/g, "§").replace(/§(?:\s*§)+/g, "§").trim();
const NORM_MIT_ZEICHEN = /§\s*(?:43|87)\s*b(?![a-z0-9])/;
const NORM_OHNE_ZEICHEN = /(?<![a-z0-9§])(?:43|87)\s*b(?:\s*abs\.?\s*\d+)?\s*sgb\s*xi(?![a-z0-9])/;
const BEZEICHNUNG = /betreuungs(?:kr(?:a|ä|ae)ft|assist)|alltagsbegleit/;
const erkannt = (s) => typeof s === "string" && (() => { const n = normal(s); return NORM_MIT_ZEICHEN.test(n) || NORM_OHNE_ZEICHEN.test(n) || BEZEICHNUNG.test(n); })();

/**
 * Ist die Qualifikation eine Betreuungsqualifikation (§ 43b SGB XI, früher § 87b)? Erkannt an Grundlage oder Name
 * (Positivliste oben) oder am Merkmal „betreuung“ (FN-14, Q2 a; A1).
 * @param {any} q
 * @returns {boolean}
 */
export function istBetreuungsQualifikation(q) {
  if (!istObjekt(q)) return false;
  if (typeof q.merkmal === "string" && normal(q.merkmal) === "betreuung") return true;
  /* A-1 (Review #485): Das Fachkraft-Flag ist die ausdrückliche Einordnung des Betriebs (die Fachkraftquote des Kerns
     zählt danach). Name und Grundlage sind nur ein Hinweis; sie nehmen eine Fachkraft nie aus der Zählung
     („Pflegefachkraft, Anleitung Betreuungskräfte“). Gegen das Flag wirkt nur das ausdrückliche Merkmal. */
  if (q.fachkraft === true) return false;
  return erkannt(q.grundlage) || erkannt(q.name);
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
 * Schreibweg (Prüfung, A1): geänderte Qualifikationen des Betriebs gegen die Niveaus. Läuft, wenn sich `qualifikationen`
 * ändert — auch ohne Änderung an den Niveaus und unabhängig davon, ob das Modul wirkt (die Niveaus bleiben gespeichert).
 * Geprüft wird nur eine Qualifikation, die in einem Niveau außerhalb der Gruppe betreuung steht und sich geändert hat
 * (umbenannt, Grundlage oder Merkmal geändert, gelöscht):
 *   - wird sie dadurch Betreuungsqualifikation → abgewiesen (gehört nur in die Gruppe betreuung);
 *   - war sie im gespeicherten Stand Betreuungsqualifikation und ist es danach nicht mehr → abgewiesen (sonst zählte die
 *     Person still als Pflegekraft, ohne Hinweis).
 * Eine unveränderte Qualifikation wird nie abgewiesen (Altbestand bleibt speicherbar, keine Migration); der Lesepfad
 * (pflegeVerteilung) zählt sie dann nicht und meldet einen Hinweis. Die Gruppe betreuung ist frei: dort zählt sie
 * ohnehin nur als Betreuung.
 * @param {any} neuM
 * @param {any} [altM]
 * @returns {{ grund?: string }}
 */
export function pflegeQualAenderung(neuM, altM) {
  if (!istObjekt(neuM)) return {};
  const niveaus = Array.isArray(neuM.pflegeNiveaus) ? neuM.pflegeNiveaus.filter((n) => istObjekt(n) && Array.isArray(n.qualifikationen)) : [];
  if (!niveaus.length) return {};
  const neuQ = Array.isArray(neuM.qualifikationen) ? neuM.qualifikationen : [];
  const altQ = istObjekt(altM) && Array.isArray(altM.qualifikationen) ? altM.qualifikationen : [];
  const finde = (liste, id) => liste.find((x) => istObjekt(x) && x.id === id);
  for (const n of niveaus) {
    if (n.gruppe === "betreuung") continue;
    for (const id of n.qualifikationen) {
      const neu = finde(neuQ, id);
      const alt = finde(altQ, id);
      if (JSON.stringify(neu) === JSON.stringify(alt)) continue;
      const wo = `Niveau „${String(n.name || n.id || "").slice(0, 40)}“ (Gruppe ${String(n.gruppe).slice(0, 20)})`;
      const name = String((neu && neu.name) || (alt && alt.name) || id).slice(0, 40);
      if (istBetreuungsQualifikation(neu))
        return { grund: `Qualifikation „${name}“ wäre danach eine Betreuungsqualifikation (§ 43b SGB XI), steht aber im ${wo}. Sie gehört nur in die Gruppe betreuung — erst das Niveau berichtigen (Q2 a, FN-14).` };
      if (istBetreuungsQualifikation(alt))
        return { grund: `Qualifikation „${name}“ ist eine Betreuungsqualifikation (§ 43b SGB XI) im ${wo}. Umbenennen, Grundlage ändern oder Löschen ließe sie still als Pflegekraft zählen — erst das Niveau berichtigen (Q2 a, FN-14).` };
    }
  }
  return {};
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
