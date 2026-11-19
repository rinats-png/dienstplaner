/* WP-21 Smartphone/Tablet fuer alle Rollen, Teil 1: die Zahlen und Stilregeln, an denen sich die Geraetematrix misst.
   Reine Daten und Zeichenketten ohne Browserbezug; die Matrix steht in docs/acc45/WP-21-GERAETEMATRIX.md, die Messung in
   pruefungen/browser/geraete-wp21.mjs, die Vertragspruefung in pruefungen/geraete-wp21.test.js. */
import { C } from "../farben.js";

/** Pruefviewports der Geraetematrix (Breite x Hoehe in CSS-px). Hochformat-Telefone plus Tablet hoch und quer. */
export const GERAETE_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "360x740", w: 360, h: 740, art: "telefon" }),
  Object.freeze({ id: "390x844", w: 390, h: 844, art: "telefon" }),
  Object.freeze({ id: "430x932", w: 430, h: 932, art: "telefon" }),
  Object.freeze({ id: "768x1024", w: 768, h: 1024, art: "tablet" }),
  Object.freeze({ id: "1024x768", w: 1024, h: 768, art: "tablet" }),
]);

/** Querformat der Telefone (WP-21 Teil 2): dieselben Geraete um 90 Grad gedreht. Hoehe 360 bis 430 px, Tastatur und Leiste unten nehmen davon viel weg. */
export const GERAETE_VIEWPORTS_QUER = Object.freeze([
  Object.freeze({ id: "740x360", w: 740, h: 360, art: "telefon-quer" }),
  Object.freeze({ id: "844x390", w: 844, h: 390, art: "telefon-quer" }),
  Object.freeze({ id: "932x430", w: 932, h: 430, art: "telefon-quer" }),
]);

/** Die Umbruchpunkte der Oberflaeche (max-width, CSS-px). Sie stehen in src/App.jsx (bauStyles) und werden hier nur benannt. */
export const UMBRUCH = Object.freeze({ telefon: 560, schmal: 820, seitenleiste: 1024 });

/** WCAG 2.5.8 (Stufe AA): kleinste Zielgroesse in CSS-px, sofern die Ausnahme "Abstand" nicht greift. */
export const ZIEL_MINDEST = 24;

/** Beschriftung der Abdunkelung hinter der geoeffneten Seitenleiste (nur Telefon und Tablet). */
export const SEITENLEISTE_SCHLIESSEN = "Navigation schließen";

/** Ansichten (Kennungen aus src/app/navigation.js), die auf dem Telefon und schmalen Tablets ohne den Hinweis
 *  „Für Tablet und Rechner ausgelegt“ erscheinen. Eine Ansicht kommt nur hinein, wenn ihre Kernaufgaben mit
 *  pruefungen/browser/geraete-wp21-ablaeufe.mjs an allen acht Viewports bestanden haben; der Beleg steht in
 *  docs/acc45/WP-21-GERAETEMATRIX.md, Abschnitt 9 (ein Test prüft, dass jede Kennung dort steht). */
export const TELEFON_ANSICHTEN = Object.freeze(["meine", "plan", "antraege", "lage", "hilfe", "rechtliches", "boerse", "pruef"]);
/** Dasselbe für die Betreiberkonsole (eigene Kennungen). */
export const TELEFON_ANSICHTEN_BETREIBER = Object.freeze([]);
/** Zeigt die Ansicht ohne den Hinweis „Für Tablet und Rechner ausgelegt“? */
export function telefonTauglich(ansicht, istBetreiber) {
  return (istBetreiber ? TELEFON_ANSICHTEN_BETREIBER : TELEFON_ANSICHTEN).includes(ansicht);
}

/** Kennung der Seitenleiste (aria-controls der Menütaste). */
export const SEITENLEISTE_ID = "seitenleiste";

/**
 * Fokusführung der Seitenleiste auf Telefon und Tablet (WP-21 Teil 2). Beim Öffnen springt der Fokus auf den aktuellen
 * Eintrag (die Menütaste liegt dann unter der Leiste; wer mit Tab weitergeht, landete sonst im Inhalt hinter der Abdunkelung).
 * Beim Schließen kehrt er zur Menütaste zurück, sofern er in der Leiste lag oder verloren war (Escape, Abdunkelung, Auswahl
 * eines Eintrags). Liegt der Fokus schon im Inhalt, bleibt er dort. `dok` ist document (oder ein Ersatz im Test).
 * @returns {"hinein"|"zurueck"|"nichts"}
 */
export function seitenleisteFokus(dok, offen, warOffen) {
  const leiste = `#${SEITENLEISTE_ID}`;
  if (offen) {
    const ziel = dok.querySelector(`${leiste} .slink[aria-current="page"]`) || dok.querySelector(`${leiste} .slink`);
    if (ziel) { ziel.focus(); return "hinein"; }
    return "nichts";
  }
  if (!warOffen) return "nichts";
  const a = dok.activeElement;
  const verloren = !a || a === dok.body || a === dok.documentElement;
  const inLeiste = !!a && typeof a.closest === "function" && !!a.closest(leiste);
  if (verloren || inLeiste) {
    const taste = dok.querySelector(".kopf-menue");
    if (taste) { taste.focus(); return "zurueck"; }
  }
  return "nichts";
}

/** Braucht ein Bereich mit eigenem Querscroll den Hinweis und die Tastaturerreichbarkeit? Ein Pixel Toleranz fuer Rundung. */
export function scrollHinweisNoetig(scrollBreite, sichtbareBreite) {
  const s = Number(scrollBreite), k = Number(sichtbareBreite);
  if (!Number.isFinite(s) || !Number.isFinite(k)) return false;
  return s > k + 1;
}

/** Stilregeln der Geraetematrix; bauStyles() in src/App.jsx haengt sie an. */
export function geraeteStil() {
  return `
/* WP-21: breite Tabellen und Raster behalten ihren eigenen Querscroll (Reflow, WCAG 1.4.10, laesst Datentabellen zu),
   aber der Bereich ist dann per Tastatur erreichbar (Fokusrahmen), benannt (Region) und der Hinweis darunter nennt das Wischen
   (der Hinweis erscheint nur auf Telefon und Tablet; die Rechneransicht bleibt unveraendert). */
.scrollbereich{overflow-x:auto; border-radius:inherit; max-width:100%; -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain;}
.scrollbereich:focus-visible{outline:2px solid ${C.accent}; outline-offset:-2px; border-radius:4px;}
.scrollhinweis{display:none; font-size:12.5px; line-height:1.4; color:${C.dim}; padding:6px 14px 8px; border-top:1px solid ${C.lineSoft};}

/* WP-21: Seitenleiste auf Telefon und Tablet.
   Zugeklappt ist sie nicht nur aus dem Bild geschoben, sondern auch aus Tastaturreihenfolge und Vorlesesoftware genommen
   (sonst landet der Fokus in unsichtbaren Eintraegen). Offen steht dahinter eine Abdunkelung, die beim Antippen schliesst;
   die Menuetaste selbst liegt unter der Leiste und war bisher nicht mehr erreichbar. */
@media (max-width: ${UMBRUCH.seitenleiste}px){
  .seitenleiste{visibility:hidden; transition:transform .24s cubic-bezier(.4,0,.2,1), visibility 0s linear .24s;}
  .seitenleiste.offen{visibility:visible; transition-delay:0s;}
  .seiten-abdunkelung{position:fixed; inset:0; z-index:39; border:0; padding:0; margin:0; cursor:pointer;
    background:var(--c-ueberlagerung);}
  .scrollhinweis{display:block;}
}
@media (min-width: ${UMBRUCH.seitenleiste + 1}px){ .seiten-abdunkelung{display:none !important;} }

/* WP-21 Teil 2: Schaltflaechen im Meldungsstreifen (Rueckgaengig) waren 75x16 px gross (gemessen); jetzt mindestens 24 px,
   auf Telefon und Tablet 36 px. Der Streifen selbst und sein Platz bleiben unveraendert. */
.toast button{min-height:24px; min-width:24px; padding:4px 8px;}
@media (max-width: ${UMBRUCH.seitenleiste}px){ .toast button{min-height:36px; padding:6px 10px;} }

/* WP-21 Teil 2: Schnellfilter in "Mein Plan" (Telefon) umbrechen statt innen zu scrollen: 475 px in 324 px breitem Bereich liess
   den fuenften Filter hinter dem Rand verschwinden. Reflow nach WCAG 1.4.10; ab ${UMBRUCH.telefon + 1} px passt die Reihe in eine Zeile. */
@media (max-width: ${UMBRUCH.telefon}px){ .reiterreihe-umbruch{flex-wrap:wrap; overflow-x:visible;} }

/* WP-21 Teil 2: Schalter (Ein/Aus) waren 40x23 px gross (gemessen im Monatsplan bei 932x430); auf Telefon und Tablet 24 px hoch. */
@media (max-width: ${UMBRUCH.seitenleiste}px){ .schalter{height:24px;} .schalter i{top:3px;} }

/* WP-21: Auswahlkaestchen in Listen (Sammelentscheidung ueber Antraege) waren 15 px gross; auf Telefon und Tablet mindestens ZIEL_MINDEST. */
@media (max-width: ${UMBRUCH.seitenleiste}px){ .ziel-haken{width:${ZIEL_MINDEST}px !important; height:${ZIEL_MINDEST}px !important;} }

/* WP-19.13 (Befund B2): Schaltflaechen, Auswahl- und Eingabefelder und Auswahlkaestchen der Branchenmodule (src/module/kern.jsx) waren
   unformatierte Standardelemente (Browservorgabe unter 24 px). Jetzt in jeder Breite mindestens ZIEL_MINDEST (WCAG 2.5.8). */
[aria-label="Branchenmodule"] button{min-height:${ZIEL_MINDEST}px; min-width:${ZIEL_MINDEST}px;}
[aria-label="Branchenmodule"] select, [aria-label="Branchenmodule"] textarea, [aria-label="Branchenmodule"] input:not([type="checkbox"]){min-height:${ZIEL_MINDEST}px;}
[aria-label="Branchenmodule"] input[type="checkbox"]{width:${ZIEL_MINDEST}px; height:${ZIEL_MINDEST}px;}
`;
}
