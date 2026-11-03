import { useEffect, useRef, useState } from "react";
import { C } from "../farben.js";
import { Icon } from "./icons.jsx";
import { Menue } from "./bausteine.jsx";
import { BALKEN } from "../marke.jsx";

/* ==========================================================================
   RAHMEN — Kopfzeile, Bereichsnavigation, Unterleiste, Menüs

   Ab 1025 Pixeln Breite ersetzt dieser Kopf die dunkle Seitenleiste:

     Kopfzeile (64)   Marke · Betrieb · sechs Bereiche · Suche · Rückgängig ·
                      Postfach · Ansicht-Menü · Konto-Menü
     Unterleiste (48) die Ansichten des gewählten Bereichs, nur Text

   Darunter (≤ 1024) bleibt die bestehende Seitenleiste als Schublade; ihr
   Aufbau steht weiter in App.jsx. Dieser Kopf bekommt dann den Menüknopf.

   Nichts hier kennt Rechte oder Daten. App.jsx reicht die schon nach
   Rechten gefilterte Liste der Bereiche herein, samt Zählern.
   ========================================================================== */

const BEREICH_ICON = { heute: "raster", planung: "kalender", anliegen: "pruefliste", team: "personen",
  auswertung: "saeulen", verwaltung: "zahnrad", betreiber: "zahnrad" };

/** Die Bildmarke in der Kopfzeile: drei Balken, der mittlere in Türkis. Die
 *  Höhen stammen aus marke.jsx, damit es dieselbe Marke bleibt. */
export function Bildmarke({ size = 26 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      {BALKEN.map((b) => (
        <rect key={b.y} x="6" y={b.y} width="88" height="26" rx="13" fill={b.ton === "marke" ? C.marke : C.text} />))}
    </svg>);
}

const Zaehler = ({ n, warn, klasse }) => n > 0
  ? <span className={`${klasse}${warn ? " warn" : ""}`}>{n}</span> : null;

/** Eine Zeile im Menü: Beschriftung, Erklärung, rechts das Bedienelement. */
const Zeile = ({ titel, text, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 12px" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{titel}</div>
      {text && <div style={{ fontSize: 12, color: C.dim, marginTop: 2, lineHeight: 1.4 }}>{text}</div>}
    </div>
    {children}
  </div>);

const Umschalter = ({ wert, onWahl, optionen, label }) => (
  <div className="seg" role="tablist" aria-label={label} style={{ display: "flex", width: "100%" }}>
    {optionen.map(([id, text]) => (
      <button key={id} type="button" role="tab" aria-selected={wert === id} className={wert === id ? "on" : ""}
        onClick={() => onWahl(id)} style={{ flex: 1 }}>{text}</button>))}
  </div>);

const Schalt = ({ an, onWahl, label }) => (
  <button type="button" className={`schalter${an ? " on" : ""}`} role="switch" aria-checked={!!an}
    aria-label={label} onClick={() => onWahl(!an)}><i /></button>);

/**
 * @param {object} p
 * @param {boolean} p.istBetreiber
 * @param {string} p.betrieb Name des Betriebs (Betreiber: „Betreiberkonsole")
 * @param {{id:string,label:string,views:string[][]}[]} p.bereiche nach Rechten gefiltert
 * @param {string} p.aktiveView
 * @param {Record<string,number>} p.zaehler Zähler je Ansicht
 * @param {Record<string,boolean>} p.zaehlerWarn
 * @param {{name:string, kurz:string, rolle:string}} p.konto
 */
export function Kopfblock({
  istBetreiber, betrieb, bereiche, aktiveView, zaehler, zaehlerWarn, konto, ungelesen,
  dicht, onDicht, fokus, onFokus, feldmodus, onFeldmodus, thema, onThema,
  onAnsicht, onSuche, onZurueck, onPostfach, onDrawer, drawerOffen, onAbmelden, telefonansicht,
}) {
  const [offen, setOffen] = useState(null);           // null | "ansicht" | "konto"
  const ansichtKnopf = useRef(null), kontoKnopf = useRef(null);
  const leiste = useRef(null);
  const letzte = useRef({});                           // zuletzt besuchte Ansicht je Bereich

  const aktBereich = bereiche.find((b) => b.views.some(([id]) => id === aktiveView)) || bereiche[0];
  const aktBereichId = aktBereich && aktBereich.id;
  useEffect(() => { if (aktBereich) letzte.current[aktBereich.id] = aktiveView; }, [aktBereich, aktiveView]);

  /* Das aktive Element der Unterleiste ins Sichtfeld rücken — nur die
     Leiste scrollt, nie die Seite. */
  useEffect(() => {
    const l = leiste.current; if (!l) return;
    const a = l.querySelector('[aria-current="page"]'); if (!a) return;
    const links = a.offsetLeft - 24, rechts = a.offsetLeft + a.offsetWidth + 48;
    if (links < l.scrollLeft) l.scrollLeft = Math.max(0, links);
    else if (rechts > l.scrollLeft + l.clientWidth) l.scrollLeft = rechts - l.clientWidth;
  }, [aktiveView, aktBereichId]);

  if (!aktBereich) return null;
  const summe = (b) => b.views.reduce((a, [id]) => a + (zaehler[id] || 0), 0);
  const warnt = (b) => b.views.some(([id]) => zaehlerWarn[id] && zaehler[id] > 0);
  const zuBereich = (b) => {
    const ziel = b.views.find(([id]) => id === letzte.current[b.id]) || b.views[0];
    onAnsicht(ziel[0]);
  };
  const zu = (id) => { setOffen(null); onAnsicht(id); };

  return (
    <div className="kopfblock">
      <header className="kopfleiste">
        <button type="button" className="btn btn-sm btn-quiet nur-schmal kopf-menue" onClick={onDrawer}
          aria-label="Navigation öffnen" aria-expanded={!!drawerOffen} title="Navigation">
          <Icon n="menue" size={18} /></button>

        <div className="kopf-marke" title={betrieb}>
          <Bildmarke size={26} />
          <span className="wort">CENTRIC</span>
          {betrieb && <><span className="trenner" aria-hidden="true" /><span className="betrieb">{betrieb}</span></>}
        </div>

        <nav className="bereiche nur-breit" aria-label="Bereiche">
          {bereiche.map((b) => {
            const aktiv = b.id === aktBereich.id;
            return (
              <button key={b.id} type="button" className={`bpille${aktiv ? " on" : ""}`}
                aria-current={aktiv ? "page" : undefined} onClick={() => zuBereich(b)}>
                <Icon n={BEREICH_ICON[b.id] || "raster"} size={16} />
                <span>{b.label}</span>
                <Zaehler n={summe(b)} warn={warnt(b)} klasse="bzahl" />
              </button>);
          })}
        </nav>

        <div style={{ flex: 1, minWidth: 0 }} />

        {!istBetreiber && (
          <button type="button" className="suchknopf" onClick={onSuche} aria-label="Suchen (Strg K)">
            <Icon n="suche" size={16} /><span>Suchen …</span><kbd>Strg K</kbd>
          </button>)}

        {/* Auf dem Telefon treten diese Werkzeuge ab — sie schoben die Kopfleiste
            über die Gerätebreite hinaus. Suche, Postfach und Konto bleiben. */}
        <div className="kopf-werkzeuge" style={{ display: "contents" }}>
          {!istBetreiber && (
            <button type="button" className="ikn" onClick={onZurueck} aria-label="Rückgängig"
              title="Letzte Änderung zurücknehmen"><Icon n="rueckgaengig" size={18} /></button>)}
        </div>

        {!istBetreiber && (
          <button type="button" className="ikn" onClick={onPostfach} title="Mitteilungen" style={{ position: "relative" }}
            aria-label={`Mitteilungen${ungelesen ? `, ${ungelesen} ungelesen` : ""}`}>
            <Icon n="brief" size={18} />
            {ungelesen > 0 && <span className="ikn-zahl" aria-hidden="true">{ungelesen}</span>}
          </button>)}

        {telefonansicht && (
          <button type="button" className="btn btn-sm btn-quiet" onClick={telefonansicht}>Telefonansicht</button>)}

        <div className="kopf-werkzeuge" style={{ display: "contents" }}>
          <div style={{ position: "relative" }}>
            <button type="button" ref={ansichtKnopf} className="ansichtknopf" aria-haspopup="dialog"
              aria-expanded={offen === "ansicht"} onClick={() => setOffen(offen === "ansicht" ? null : "ansicht")}
              title="Dichte, Fokus, Feldmodus und Erscheinungsbild">
              Ansicht <Icon n={offen === "ansicht" ? "chevron-oben" : "chevron-unten"} size={14} strokeWidth={2} />
            </button>
            <Menue offen={offen === "ansicht"} onSchliessen={() => setOffen(null)} ausloeser={ansichtKnopf}
              label="Ansicht" breite={352}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 4px" }}>
                <div style={{ fontSize: 15, fontWeight: 650 }}>Ansicht</div>
                <button type="button" className="ikn ikn-klein" aria-label="Schließen"
                  onClick={() => { setOffen(null); if (ansichtKnopf.current) ansichtKnopf.current.focus(); }}>
                  <Icon n="x" size={16} /></button>
              </div>
              <div className="rubrik" style={{ padding: "10px 12px 6px" }}>Dichte</div>
              <div style={{ padding: "0 12px 10px" }}>
                <Umschalter wert={dicht ? "kompakt" : "komfortabel"} label="Dichte"
                  onWahl={(v) => onDicht(v === "kompakt")}
                  optionen={[["komfortabel", "Komfortabel"], ["kompakt", "Kompakt"]]} />
              </div>
              <div className="menue-trenner" />
              <Zeile titel="Fokus" text="Blendet die Navigation aus, für maximale Breite.">
                <Schalt an={fokus} onWahl={onFokus} label="Fokus" /></Zeile>
              {onFeldmodus && (<>
                <div className="menue-trenner" />
                <Zeile titel="Feldmodus" text="Größere Schrift und maximaler Kontrast.">
                  <Schalt an={feldmodus} onWahl={onFeldmodus} label="Feldmodus" /></Zeile></>)}
              {onThema && (<>
                <div className="menue-trenner" />
                <div className="rubrik" style={{ padding: "10px 12px 6px" }}>Erscheinungsbild</div>
                <div style={{ padding: "0 12px 8px" }}>
                  <Umschalter wert={thema || "hell"} label="Erscheinungsbild" onWahl={onThema}
                    optionen={[["hell", "Hell"], ["dunkel", "Dunkel"], ["auto", "Wie das Gerät"]]} />
                </div></>)}
            </Menue>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <button type="button" ref={kontoKnopf} className="avatarknopf" aria-haspopup="menu"
            aria-expanded={offen === "konto"} aria-label={`Konto: ${konto.name}`}
            onClick={() => setOffen(offen === "konto" ? null : "konto")}>{konto.kurz}</button>
          <Menue offen={offen === "konto"} onSchliessen={() => setOffen(null)} ausloeser={kontoKnopf}
            label="Konto" rolle="menu" breite={296}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px 12px" }}>
              <span className="avatarknopf gross" aria-hidden="true">{konto.kurz}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{konto.name}</div>
                <div style={{ fontSize: 12, color: C.dim }}>{konto.rolle}</div>
                {betrieb && <div style={{ fontSize: 12, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{betrieb}</div>}
              </div>
            </div>
            <div className="menue-trenner" />
            {!istBetreiber && (<>
              <button type="button" role="menuitem" className="menue-punkt" onClick={() => zu("einstellungen")}>
                <span className="icon"><Icon n="zahnrad" size={18} /></span>Einstellungen</button>
              <button type="button" role="menuitem" className="menue-punkt" onClick={() => zu("rechtliches")}>
                <span className="icon"><Icon n="buch" size={18} /></span>Rechtliches</button>
              <div className="menue-trenner" /></>)}
            <button type="button" role="menuitem" className="menue-punkt" onClick={() => { setOffen(null); onAbmelden(); }}>
              <span className="icon"><Icon n="abmelden" size={18} /></span>Abmelden</button>
          </Menue>
        </div>
      </header>

      <div className="unterleiste nur-breit">
        <nav ref={leiste} aria-label={`Ansichten in ${aktBereich.label}`}>
          {aktBereich.views.map(([id, label]) => {
            const aktiv = id === aktiveView;
            return (
              <button key={id} type="button" className={`utab${aktiv ? " on" : ""}`}
                aria-current={aktiv ? "page" : undefined} onClick={() => onAnsicht(id)}>
                {label}
                <Zaehler n={zaehler[id] || 0} warn={zaehlerWarn[id]} klasse="uzahl" />
              </button>);
          })}
        </nav>
      </div>
    </div>);
}
