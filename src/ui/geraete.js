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

/** Die Umbruchpunkte der Oberflaeche (max-width, CSS-px). Sie stehen in src/App.jsx (bauStyles) und werden hier nur benannt. */
export const UMBRUCH = Object.freeze({ telefon: 560, schmal: 820, seitenleiste: 1024 });

/** WCAG 2.5.8 (Stufe AA): kleinste Zielgroesse in CSS-px, sofern die Ausnahme "Abstand" nicht greift. */
export const ZIEL_MINDEST = 24;

/** Beschriftung der Abdunkelung hinter der geoeffneten Seitenleiste (nur Telefon und Tablet). */
export const SEITENLEISTE_SCHLIESSEN = "Navigation schließen";

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

/* WP-21: Auswahlkaestchen in Listen (Sammelentscheidung ueber Antraege) waren 15 px gross; auf Telefon und Tablet mindestens ZIEL_MINDEST. */
@media (max-width: ${UMBRUCH.seitenleiste}px){ .ziel-haken{width:${ZIEL_MINDEST}px !important; height:${ZIEL_MINDEST}px !important;} }
`;
}
