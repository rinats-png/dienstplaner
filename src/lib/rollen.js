/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { zahl } from "./format.js";

/* ------------------------------- Rollenwerk ------------------------------- */
export const ROLLEN = [
  { id: "betreiber", label: "Betreiber", kurz: "BE", farbe: "#1B1E23", berechnet: false, extern: true,
    text: "Verwaltet Mandanten, Tarife und Rechnungen. Sieht ausschließlich Zahlen, niemals Namen." },
  { id: "leitung", label: "Organisationsleitung", kurz: "OL", farbe: "#2B3440", berechnet: true,
    text: "Richtet Betrieb, Einheiten, Dienstarten und Zugänge ein. Sieht alles im eigenen Betrieb." },
  { id: "planer", label: "Planer", kurz: "PL", farbe: "#35506B", berechnet: true,
    text: "Plant, ändert Schichtfolgen und Dienstarten, genehmigt Anträge." },
  { id: "subplaner", label: "Sub-Planer", kurz: "SP", farbe: "#4C4668", berechnet: true,
    text: "Ändert Einsätze nur in der eigenen Einheit und genehmigt dort Anträge." },
  { id: "mitarbeiter", label: "Mitarbeiter", kurz: "MA", farbe: "#3C5A48", berechnet: true,
    text: "Sieht den eigenen Plan, stellt Urlaubsanträge und Tauschanfragen." },
  { id: "betriebsrat", label: "Betriebsrat", kurz: "BR", farbe: "#6B4E23", berechnet: false,
    text: "Rein lesender Prüfzugang auf Pläne und Protokoll. Kostenfrei." },
];
export const rolle = (id) => ROLLEN.find((r) => r.id === id) || ROLLEN[4];

/**
 * Mehrzahl der Einheitsbezeichnung.
 *
 * Vorher stand an elf Stellen `${mehrzahl(m.einheitLabel)}`. Für „Schichtgruppe"
 * ergibt das „Schichtgruppen" und stimmt — für „Wohnbereich" kommt
 * „Wohnbereichn" heraus, und für „Station" „Stationn". Die deutsche
 * Mehrzahl hängt am Wortende, nicht an einem angehängten n.
 */
/**
 * Ein- oder Mehrzahl, je nach Anzahl. Seit die Ansichten nach Standort
 * gefiltert werden, steht häufig eine Eins davor — und „1 Wohnbereiche"
 * liest sich wie ein Fehler, weil es einer ist.
 */
export const anzahlWort = (n, wort) => `${zahl(n)} ${n === 1 ? wort : mehrzahl(wort)}`;

export function mehrzahl(wort) {
  const w = String(wort || "").trim();
  if (!w) return "";
  if (/e$/.test(w)) return `${w}n`;        // Schichtgruppe → Schichtgruppen
  if (/(ich|eich|bereich)$/.test(w)) return `${w}e`;  // Wohnbereich → Wohnbereiche
  if (/(ion|tion)$/.test(w)) return `${w}en`;         // Station → Stationen
  if (/(er|el|en)$/.test(w)) return w;     // Revier → Revier (unverändert häufig)
  return `${w}e`;                          // Trupp → Truppe, Team → Teame … zumindest lesbar
}

/* Für den Namen der ersten Person eines frisch angelegten Betriebs. Kein
   erfundener Name — eine Funktionsbezeichnung, die man überschreibt. */
export const ROLLENBEZEICHNUNG = {
  leitung: "Organisationsleitung", planer: "Planung",
  subplaner: "Schichtverantwortung", mitarbeiter: "Beschäftigte",
  betriebsrat: "Betriebsrat",
};

/* Die Vorgabenamen, wie sie in der Rollenliste stehen — Grundlage für die
   eigenen Bezeichnungen eines Betriebs. */
export const ROLLEN_VORGABE = Object.fromEntries(ROLLEN.filter((r) => !r.extern)
  .map((r) => [r.id, r.label]));

/**
 * Wie heißt diese Rolle in diesem Betrieb?
 *
 * „Sub-Planer" heißt in der Klinik Stationsleitung, im Wachdienst
 * Objektleiter, in der Pflege Wohnbereichsleitung. Die Rolle bleibt
 * dieselbe, ihr Name nicht — und ein Haus, das seine eigenen Begriffe
 * nicht wiederfindet, misstraut der Rechteverteilung, die daran hängt.
 *
 * Umbenannt wird ausschließlich die Anzeige. Die Kennung `subplaner` und
 * alles, was daran hängt — Rechtematrix, Vergaberang, Preisberechnung —
 * rührt sich nicht.
 */
export function rollenName(m, id) {
  const eigen = ((m && m.rollennamen) || {})[id];
  const s = String(eigen || "").trim();
  return s || ROLLEN_VORGABE[id] || rolle(id).label;
}

export const RECHTE_GRUPPEN = [
  ["Planung", [["plan.view.own","Eigenen Plan sehen"],["plan.view.unit","Plan der eigenen Einheit sehen"],
    ["plan.view.all","Pläne aller Einheiten sehen"],["plan.edit.unit","Einsätze der eigenen Einheit ändern"],
    ["plan.edit.all","Einsätze aller Einheiten ändern"],["pattern.edit","Schichtfolge bearbeiten"],
    ["shift.edit","Dienstarten anlegen und ändern"],["plan.publish","Dienstplan verbindlich freigeben"]]],
  ["Anträge", [["req.create","Anträge und Tauschanfragen stellen"],["req.approve.unit","Anträge der eigenen Einheit entscheiden"],
    ["req.approve.all","Anträge aller Einheiten entscheiden"]]],
  ["Personal", [["staff.view","Personalliste sehen"],["staff.edit","Personal anlegen und bearbeiten"],
    ["account.view.own","Eigene Konten sehen"],["account.view.all","Konten aller Personen sehen"]]],
  ["Betrieb", [["org.edit","Einheiten und Betriebsdaten verwalten"],["roles.assign","Zugänge und Rollen vergeben"],
    ["billing.view","Kosten des Betriebs sehen"],["audit.view","Protokoll einsehen"],["export.data","Daten exportieren"]]],
];
export const ALLE_RECHTE = RECHTE_GRUPPEN.flatMap(([, i]) => i.map((x) => x[0]));
/* RB-1 (Betreiberentscheidung 2026-11-11): Rechte, die die betriebseigene Tabelle (m.matrix) weder
   geben noch nehmen kann. Für sie zählt allein MATRIX_STD — wie auf dem Server, der m.matrix nie liest.
   Sonst bliebe „Plan freigeben" in jedem Betrieb mit gespeicherter Tabelle unsichtbar, und eine
   angekreuzte Zelle böte es Rollen an, denen der Server es verweigert. */
export const FESTE_RECHTE = Object.freeze(["plan.publish"]);
/** Die Rechte einer Rolle, wie sie wirken: betriebseigene Tabelle, feste Rechte aus MATRIX_STD (RB-1). */
export function rechteDerRolle(matrix, rolleId) {
  const eigen = ((matrix || MATRIX_STD)[rolleId] || []).filter((r) => !FESTE_RECHTE.includes(r));
  return [...eigen, ...(MATRIX_STD[rolleId] || []).filter((r) => FESTE_RECHTE.includes(r))];
}
export const MATRIX_STD = {
  leitung: [...ALLE_RECHTE],
  planer: ALLE_RECHTE.filter((r) => !["org.edit", "roles.assign", "billing.view"].includes(r)),
  subplaner: ["plan.view.own","plan.view.unit","plan.edit.unit","req.create","req.approve.unit","staff.view","account.view.own","account.view.all"],
  mitarbeiter: ["plan.view.own","plan.view.unit","req.create","account.view.own"],
  betriebsrat: ["plan.view.own","plan.view.unit","plan.view.all","staff.view","audit.view","export.data"],
};
