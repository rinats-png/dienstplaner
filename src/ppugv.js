/* ==========================================================================
   PFLEGEPERSONALUNTERGRENZEN — PpUGV

   In pflegesensitiven Krankenhausbereichen gibt die Pflegepersonaluntergrenzen-
   verordnung vor, wie viele Patientinnen und Patienten auf eine Pflegekraft
   kommen dürfen — je Schicht, nicht im Monatsmittel. Und sie deckelt, wie
   viel davon Pflegehilfskräfte sein dürfen.

   Was diese Datei tut und was nicht:

   Sie rechnet. Sie entscheidet nicht. Eine Untergrenze zu unterschreiten hat
   Folgen für die Vergütung und die Meldung an die Kassen — aber sie ist kein
   Grund, eine Schicht ungeplant zu lassen. Deshalb liefert sie ein Urteil mit
   Begründung, und die Anwendung zeigt es an, statt zu blockieren.

   Sie hält die Werte versioniert. Die Verordnung wurde mehrfach geändert,
   und für eine Prüfung zählt, welche Fassung an dem fraglichen Tag galt. Ein
   Regelsatz trägt deshalb `ab` und `bis`; die Rechnung sucht den, der am
   Stichtag galt. Wer eine neue Fassung einpflegt, ergänzt einen Satz und
   ändert keinen bestehenden.

   Und sie sagt „nicht bewertbar", wenn ihr etwas fehlt. Ohne Patientenzahl
   gibt es kein Urteil — weder ein gutes noch ein schlechtes. Ein
   Compliance-Werkzeug, das bei fehlenden Daten grün meldet, ist schlimmer
   als keines.

   Rechtsstand: PpUGV in der Fassung vom 9. November 2020, zuletzt geändert
   2023. Vor produktivem Einsatz als verbindliches Meldewesen gehören die
   Werte gegen die dann geltende Fassung geprüft — dafür sind sie hier
   getrennt und datiert.

   Quelle: https://www.gesetze-im-internet.de/ppugv_2021/
   ========================================================================== */

/** Die pflegesensitiven Bereiche, wie die Verordnung sie benennt. */
export const BEREICHE = [
  { id: "intensiv", name: "Intensivmedizin", paragraf: "§ 6 PpUGV" },
  { id: "intensiv_paed", name: "Pädiatrische Intensivmedizin", paragraf: "§ 6 PpUGV" },
  { id: "geriatrie", name: "Geriatrie", paragraf: "§ 7 PpUGV" },
  { id: "unfallchirurgie", name: "Unfallchirurgie", paragraf: "§ 8 PpUGV" },
  { id: "kardiologie", name: "Kardiologie", paragraf: "§ 9 PpUGV" },
  { id: "neurologie", name: "Neurologie", paragraf: "§ 10 PpUGV" },
  { id: "neurologie_schlaganfall", name: "Neurologische Schlaganfalleinheit", paragraf: "§ 10 PpUGV" },
  { id: "neurologie_fruehreha", name: "Neurologische Frührehabilitation", paragraf: "§ 10 PpUGV" },
  { id: "herzchirurgie", name: "Herzchirurgie", paragraf: "§ 11 PpUGV" },
  { id: "paediatrie", name: "Pädiatrie", paragraf: "§ 12 PpUGV" },
  { id: "neonatologie", name: "Neonatologie", paragraf: "§ 13 PpUGV" },
  { id: "allgemeine_chirurgie", name: "Allgemeine Chirurgie", paragraf: "§ 14 PpUGV" },
  { id: "innere", name: "Innere Medizin", paragraf: "§ 14 PpUGV" },
  { id: "hno", name: "Hals-Nasen-Ohren-Heilkunde", paragraf: "§ 14 PpUGV" },
  { id: "urologie", name: "Urologie", paragraf: "§ 14 PpUGV" },
  { id: "rheumatologie", name: "Rheumatologie", paragraf: "§ 14 PpUGV" },
  { id: "gynaekologie", name: "Gynäkologie und Geburtshilfe", paragraf: "§ 14 PpUGV" },
  { id: "orthopaedie", name: "Orthopädie", paragraf: "§ 14 PpUGV" },
  { id: "neurochirurgie", name: "Neurochirurgie", paragraf: "§ 14 PpUGV" },
];

export const bereichVon = (id) => BEREICHE.find((b) => b.id === id) || null;

/* --------------------------------------------------------------------------
   DIE VERHÄLTNISZAHLEN

   `patientenJeKraft`: wie viele Patientinnen und Patienten höchstens auf
   eine Pflegekraft kommen dürfen. `hilfskraftAnteil`: welcher Anteil des
   Personals höchstens Pflegehilfskraft sein darf.

   Nachtschicht heißt hier die Schicht, die die Verordnung so nennt — nicht
   jede Dienstart, die nachts liegt. Welche Dienstart welcher Schicht
   entspricht, entscheidet der Betrieb.
   -------------------------------------------------------------------------- */
const SAETZE = [
  {
    ab: "2021-02-01", bis: null,
    fassung: "PpUGV vom 09.11.2020, Werte ab 01.02.2021",
    werte: {
      intensiv: { tag: 2, nacht: 3, hilfskraftAnteil: 0.08 },
      intensiv_paed: { tag: 2, nacht: 3, hilfskraftAnteil: 0.08 },
      geriatrie: { tag: 10, nacht: 20, hilfskraftAnteil: 0.15 },
      unfallchirurgie: { tag: 10, nacht: 20, hilfskraftAnteil: 0.10 },
      kardiologie: { tag: 10, nacht: 22, hilfskraftAnteil: 0.10 },
      neurologie: { tag: 10, nacht: 20, hilfskraftAnteil: 0.10 },
      neurologie_schlaganfall: { tag: 3, nacht: 5, hilfskraftAnteil: 0.10 },
      neurologie_fruehreha: { tag: 5, nacht: 12, hilfskraftAnteil: 0.10 },
      herzchirurgie: { tag: 7, nacht: 15, hilfskraftAnteil: 0.10 },
      paediatrie: { tag: 6, nacht: 10, hilfskraftAnteil: 0.10 },
      neonatologie: { tag: 3.5, nacht: 3.5, hilfskraftAnteil: 0.05 },
      allgemeine_chirurgie: { tag: 10, nacht: 20, hilfskraftAnteil: 0.10 },
      innere: { tag: 10, nacht: 22, hilfskraftAnteil: 0.10 },
      hno: { tag: 10, nacht: 20, hilfskraftAnteil: 0.10 },
      urologie: { tag: 10, nacht: 20, hilfskraftAnteil: 0.10 },
      rheumatologie: { tag: 10, nacht: 20, hilfskraftAnteil: 0.10 },
      gynaekologie: { tag: 10, nacht: 20, hilfskraftAnteil: 0.10 },
      orthopaedie: { tag: 10, nacht: 20, hilfskraftAnteil: 0.10 },
      neurochirurgie: { tag: 10, nacht: 20, hilfskraftAnteil: 0.10 },
    },
  },
];

/** Der Regelsatz, der an diesem Tag galt. */
export function satzAm(datum) {
  const d = String(datum || "");
  return SAETZE.find((s) => s.ab <= d && (!s.bis || s.bis >= d)) || null;
}

/** Die Verhältniszahlen eines Bereichs an einem Tag — oder null. */
export function grenzeFuer(bereichId, schicht, datum) {
  const satz = satzAm(datum);
  const w = satz && satz.werte[bereichId];
  if (!w) return null;
  const je = schicht === "nacht" ? w.nacht : w.tag;
  return { patientenJeKraft: je, hilfskraftAnteil: w.hilfskraftAnteil,
    fassung: satz.fassung, paragraf: (bereichVon(bereichId) || {}).paragraf || "PpUGV" };
}

/**
 * Prüft eine Schicht gegen die Untergrenze.
 *
 * @param {object} lage
 * @param {string} lage.bereich      Kennung aus BEREICHE
 * @param {string} lage.schicht      "tag" | "nacht"
 * @param {string} lage.datum
 * @param {number|null} lage.patienten   Ist-Zahl; null heißt „nicht erhoben"
 * @param {number} lage.fachkraefte  Pflegefachkräfte im Dienst
 * @param {number} lage.hilfskraefte Pflegehilfskräfte im Dienst
 * @returns {{urteil: string, text: string, ...}}
 *   urteil: "gruen" | "rot" | "grau"
 */
export function pruefeSchicht(lage) {
  const { bereich, schicht, datum, patienten, fachkraefte = 0, hilfskraefte = 0 } = lage || {};

  const b = bereichVon(bereich);
  if (!b)
    return { urteil: "grau", grund: "keinBereich",
      text: "Für diese Einheit ist kein pflegesensitiver Bereich hinterlegt. "
        + "Ohne ihn gilt keine Untergrenze — und es lässt sich auch keine prüfen." };

  const g = grenzeFuer(bereich, schicht, datum);
  if (!g)
    return { urteil: "grau", grund: "keinRegelsatz", bereich: b,
      text: `Für den ${datum} liegt kein Regelsatz der PpUGV vor. `
        + "Die Fassung muss hinterlegt werden, bevor sich etwas beurteilen lässt." };

  /* Der leere String ist keine Null. `Number("")` ergibt 0, und damit
     hätte ein leer gelassenes Eingabefeld als „null Patienten, alles
     eingehalten" gegolten — die gefährlichste Art, grün zu melden. */
  if (patienten === null || patienten === undefined || patienten === ""
      || !Number.isFinite(Number(patienten)))
    return { urteil: "grau", grund: "keinePatientenzahl", bereich: b, grenze: g,
      text: `${b.name}, ${schicht === "nacht" ? "Nachtschicht" : "Tagschicht"}: `
        + "Ohne die Zahl der Patientinnen und Patienten lässt sich die Untergrenze "
        + "nicht prüfen. Nicht bewertbar ist nicht dasselbe wie eingehalten." };

  const pat = Number(patienten);
  /* Aufgerundet: Ein halber Mensch steht nicht im Dienst. */
  const noetig = Math.ceil(pat / g.patientenJeKraft);
  const gesamt = fachkraefte + hilfskraefte;

  /* Der anrechenbare Hilfskraftanteil ist ein Anteil am Gesamtpersonal.
     Was darüber liegt, zählt für die Untergrenze nicht mit. */
  const hilfskraefteAnrechenbar = Math.min(hilfskraefte, Math.floor(gesamt * g.hilfskraftAnteil));
  const angerechnet = fachkraefte + hilfskraefteAnrechenbar;

  const erfuellt = angerechnet >= noetig;
  const fehlend = Math.max(0, noetig - angerechnet);

  return {
    urteil: erfuellt ? "gruen" : "rot",
    bereich: b, grenze: g, schicht, datum,
    patienten: pat, noetig, fachkraefte, hilfskraefte,
    hilfskraefteAnrechenbar, angerechnet, fehlend,
    /* Was nicht angerechnet werden konnte — die häufigste Überraschung. */
    hilfskraefteNichtAngerechnet: hilfskraefte - hilfskraefteAnrechenbar,
    text: erfuellt
      ? `${b.name}, ${schicht === "nacht" ? "Nachtschicht" : "Tagschicht"}: `
        + `${pat} Patienten, ${noetig} Pflegekräfte nötig, ${angerechnet} angerechnet.`
      : `${b.name}, ${schicht === "nacht" ? "Nachtschicht" : "Tagschicht"}: `
        + `${pat} Patienten verlangen ${noetig} Pflegekräfte, angerechnet sind ${angerechnet}. `
        + `Es fehlen ${fehlend}.`
        + (hilfskraefte > hilfskraefteAnrechenbar
          ? ` ${hilfskraefte - hilfskraefteAnrechenbar} Hilfskräfte konnten nicht angerechnet werden `
            + `(höchstens ${Math.round(g.hilfskraftAnteil * 100)} Prozent).`
          : ""),
    quelle: `${g.paragraf}, ${g.fassung}`,
  };
}

/** Ein Monat auf einen Blick: wie viele Schichten grün, rot, nicht bewertbar. */
export function monatslage(pruefungen) {
  const aus = { gruen: 0, rot: 0, grau: 0, gesamt: 0, rote: [] };
  for (const p of pruefungen || []) {
    aus.gesamt++;
    aus[p.urteil] = (aus[p.urteil] || 0) + 1;
    if (p.urteil === "rot") aus.rote.push(p);
  }
  aus.quote = aus.gesamt ? Math.round(((aus.gruen) / aus.gesamt) * 100) : null;
  return aus;
}
