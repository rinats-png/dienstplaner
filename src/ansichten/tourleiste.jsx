/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect } from "react";
import { C } from "../farben.js";
import { Btn } from "../ui/bausteine.jsx";
import { NUM } from "../ui/thema.js";
import { Icon } from "../gestalt/icons.jsx";
import { _tour, tourKapitel, tourLaden, tourStand } from "../lib/tour.js";


/**
 * Lädt den Tourinhalt und gibt ihn zurück, sobald er da ist.
 * Vorher null — der Aufrufer stellt so lange nichts dar.
 */
export function useTour(gebraucht = true) {
  const [t, setT] = useState(_tour);
  useEffect(() => {
    if (!gebraucht || t) return;
    let weg = false;
    tourLaden().then((x) => { if (!weg) setT(x); }).catch(() => {});
    return () => { weg = true; };
  }, [gebraucht, t]);
  return t;
}

/* ==========================================================================
   TOUR-OBERFLÄCHE

   Ein Streifen am unteren Rand, kein Vollbild. Wer die Anwendung dabei
   bedienen kann, behält mehr als jemand, der nur Text liest.

   Zwei Größen, weil eine nicht reicht. Ausgeklappt nahm die Tour über die
   volle Breite rund ein Viertel der Bildschirmhöhe und stand damit in
   jeder Ansicht im Weg — auch dann, wenn gerade gar nicht gelernt, sondern
   gearbeitet wurde. Sie ist deshalb erstens eine schwebende Karte
   geworden statt einer angedockten Leiste, und zweitens einklappbar auf
   eine Zeile: Kapitel, Fortschritt, Weiter. Der Faden bleibt sichtbar,
   der Platz bleibt beim Inhalt.
   ========================================================================== */
/* Ist gerade ein Dialog offen (aria-modal)? Die Tour liegt als feste Karte
   über allem und verdeckte sonst Schaltflächen im Dialog (belegt:
   „Hinzufügen" in „Person hinzufügen"). Beobachtet wird das Dokument statt
   jedes Dialogs einzeln — so gilt es für alle Blatt- und Bestätigungsarten. */
export function useModalOffen() {
  const [offen, setOffen] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return undefined;
    /* Auch die geöffnete Seitenleiste (Schublade auf schmalen Ansichten) gilt als Dialog */
    const pruefe = () => setOffen(!!document.querySelector('[aria-modal="true"], .seitenleiste.offen'));
    pruefe();
    const mo = new MutationObserver(pruefe);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return offen;
}

export function TourLeiste({ sitz, akt, gehZu }) {
  const p = sitz.person;
  const rolleId = sitz.rolle === "betreiber" ? "betreiber" : (p.rolle || "mitarbeiter");
  const dialogOffen = useModalOffen();
  /* Die Leiste erscheint erst, wenn der Inhalt da ist. Ein leerer Streifen
     am unteren Rand wäre schlimmer als eine halbe Sekunde ohne ihn. */
  const tour = useTour(true);
  const st = tourStand(p, rolleId, tour);
  const punkt = st.alle[st.idx];
  const t = (tour || {})[rolleId] || (tour || {}).mitarbeiter;
  if (!tour || !punkt || !t) return null;

  const kapitel = tourKapitel(tour, rolleId, st.gesehen);
  const jetzt = kapitel.find((k) => st.idx >= k.von && st.idx <= k.bis) || kapitel[0];
  const imKapitel = jetzt ? st.idx - jetzt.von + 1 : 1;
  /* Steht der nächste Schritt in einem anderen Kapitel? Dann ist hier ein
     natürlicher Halt — und der gehört angeboten, statt stillschweigend
     weiterzulaufen. */
  const amKapitelende = !!jetzt && st.idx === jetzt.bis && st.idx < st.gesamt - 1;

  const weiter = () => {
    if (st.idx >= st.gesamt - 1) { akt.tourBeenden(); return; }
    const n = st.alle[st.idx + 1];
    akt.tourSchritt(st.idx + 1, punkt.id);
    if (n.ziel) gehZu(n.ziel);
  };
  const zurueck = () => { if (st.idx > 0) akt.tourSchritt(st.idx - 1, null); };
  const springe = (ziel) => {
    const n = st.alle[ziel];
    if (!n) return;
    akt.tourSchritt(ziel, null);
    if (n.ziel) gehZu(n.ziel);
  };

  /* Auf dem Telefon beginnt die Tour eingeklappt: aufgeklappt deckt sie bis zu 85 % der Fläche
     (Browserprobe 320 px). Wer sie ausdrücklich aufklappt, behält sie aufgeklappt. */
  const schmalerSchirm = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 560px)").matches;
  const eingeklappt = (p.tour || {}).eingeklappt === undefined ? schmalerSchirm : !!(p.tour || {}).eingeklappt;

  /* Gemeinsamer Rahmen beider Größen: eine schwebende Karte über dem
     Inhalt, nicht die volle Breite des Fensters. */
  const rahmen = {
    position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 900,
    maxWidth: eingeklappt ? 560 : 940, margin: "0 auto",
    background: C.flaeche, border: `1px solid ${C.lineStark}`, borderRadius: "var(--r-gross)",
    overflow: "hidden", boxShadow: "var(--schatten-blatt)",
    /* Nur ausgeblendet, nicht abgebaut: Schritt und Zustand bleiben, die Tour
       erscheint nach dem Schließen des Dialogs an derselben Stelle. */
    display: dialogOffen ? "none" : undefined,
  };

  /* ---------------------------- Eingeklappt ---------------------------
     Eine Zeile. Sie beantwortet nur noch, wo man steht und wie es
     weitergeht — alles Übrige ist einen Klick entfernt. */
  if (eingeklappt) {
    return (
      <div role="dialog" aria-label="Geführte Tour, eingeklappt" className="tourleiste" style={rahmen}>
        <div style={{ height: 3, background: C.bg }}>
          <div style={{ width: `${((st.idx + 1) / st.gesamt) * 100}%`, height: "100%",
            background: C.accent, transition: "width .25s" }} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px 10px 16px" }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
              textTransform: "uppercase", color: C.accent, whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>{punkt.kapitel}</span>
            <span style={{ display: "block", fontSize: 12.5, color: C.dim, marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {punkt.titel}</span>
          </span>
          <span style={{ fontSize: 11.5, color: C.dimmer, flexShrink: 0, ...NUM }}>
            {st.idx + 1}/{st.gesamt}</span>
          <Btn size="sm" onClick={() => akt.tourEinklappen(false)}>Aufklappen</Btn>
          <Btn size="sm" kind="primary" onClick={weiter}>
            {st.idx >= st.gesamt - 1 ? "Fertig" : "Weiter"}</Btn>
          <button type="button" onClick={() => akt.tourSchliessen(false)} aria-label="Tour schließen"
            title="Tour schließen — unter Einstellungen fortsetzbar"
            style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer",
              fontFamily: "inherit", padding: "6px 8px", flexShrink: 0, display: "flex" }}><Icon n="x" size={18} strokeWidth={2.2} /></button>
        </div>
      </div>);
  }

  return (
    <div role="dialog" aria-label="Geführte Tour" className="tourleiste" style={rahmen}>

      {/* Fortschritt als dünner Balken ganz oben */}
      <div style={{ height: 3, background: C.bg }}>
        <div style={{ width: `${((st.idx + 1) / st.gesamt) * 100}%`, height: "100%",
          background: C.accent, transition: "width .25s" }} /></div>

      <div style={{ padding: "16px 20px 18px",
        display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
            flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
              textTransform: "uppercase", color: C.accent }}>{punkt.kapitel}</span>
            {/* Der Bezug im Kapitel trägt, der aufs Ganze entmutigt: „3 von 6"
                ist zu schaffen, „17 von 44" nicht. */}
            <span style={{ fontSize: 11.5, color: C.dim, ...NUM }}>
              Schritt {imKapitel} von {jetzt ? jetzt.anzahl : st.gesamt}</span>
            <span style={{ fontSize: 11.5, color: C.dimmer, ...NUM }}>
              · Kapitel {(jetzt ? jetzt.idx : 0) + 1} von {kapitel.length}</span>
          </div>

          {/* Kapitel als Sprungmarken. Wer den Betrieb schon eingerichtet
              hat, muss die Einrichtung nicht noch einmal durchklicken. */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
            {kapitel.map((k) => {
              const hier = jetzt && k.idx === jetzt.idx;
              return (
                <button key={k.idx} type="button" onClick={() => springe(k.von)}
                  aria-current={hier ? "step" : undefined}
                  title={`${k.name} — ${k.gesehen} von ${k.anzahl} gesehen`}
                  style={{ padding: "3px 9px", borderRadius: 999, cursor: "pointer",
                    fontFamily: "inherit", fontSize: 11.5, lineHeight: 1.5,
                    border: `1px solid ${hier ? C.accent : C.lineSoft}`,
                    background: hier ? C.accentLight : "transparent",
                    color: hier ? C.accentDeep : k.fertig ? C.ok : C.dim,
                    fontWeight: hier ? 620 : 500 }}>
                  {k.fertig && !hier && <Icon n="haken" size={13} strokeWidth={2.4} />}{k.name}
                </button>);
            })}
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 640, letterSpacing: "-.02em",
            margin: "0 0 8px" }}>{punkt.titel}</h2>
          <p style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.6, margin: 0, maxWidth: 640 }}>
            {punkt.text}</p>

          {punkt.tun && (
            <div style={{ display: "flex", gap: 9, marginTop: 12, fontSize: 14,
              alignItems: "flex-start" }}>
              <span aria-hidden="true" style={{ color: C.accent, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={14} /></span>
              <span style={{ fontWeight: 550 }}>{punkt.tun}</span>
            </div>)}

          {punkt.pruefen && (
            <div style={{ display: "flex", gap: 9, marginTop: 8, fontSize: 13.5,
              color: C.ok, alignItems: "flex-start", lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0, display: "flex", marginTop: 2 }}><Icon n="haken" size={16} strokeWidth={2.2} /></span>
              <span>{punkt.pruefen}</span>
            </div>)}

          {punkt.merke && (
            <div style={{ marginTop: 12, paddingLeft: 13, borderLeft: `3px solid ${C.line}`,
              fontSize: 13.5, color: C.dim, lineHeight: 1.55 }}>{punkt.merke}</div>)}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 190 }}>
          <div style={{ display: "flex", gap: 9 }}>
            <Btn size="sm" kind="quiet" disabled={st.idx === 0} onClick={zurueck}>Zurück</Btn>
            <Btn size="sm" kind="primary" onClick={weiter} style={{ flex: 1 }}>
              {st.idx >= st.gesamt - 1 ? "Fertig" : "Weiter"}</Btn>
          </div>
          {/* Einklappen steht vor dem Schließen: Wer nur Platz braucht,
              soll nicht den Faden verlieren müssen. */}
          <Btn size="sm" onClick={() => akt.tourEinklappen(true)}>Einklappen</Btn>
          {/* Am Kapitelende ausdrücklich anbieten aufzuhören. Wer weiß, dass
              hier ein Halt ist, hört seltener mittendrin auf — und findet
              beim nächsten Mal wieder hinein. */}
          {amKapitelende && (
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.45,
              padding: "8px 10px", borderRadius: 8, background: C.okLight }}>
              Ende von „{jetzt.name}". Guter Punkt für eine Pause — beim
              nächsten Mal geht es hier weiter.
            </div>)}
          <button onClick={() => akt.tourSchliessen(false)}
            style={{ border: "none", background: "transparent", color: C.dim, fontFamily: "inherit",
              fontSize: 13, cursor: "pointer", padding: "4px 0", textAlign: "left" }}>
            {amKapitelende ? "Für heute genug" : "Später fortsetzen"}</button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, minHeight: 24,
            color: C.dim, cursor: "pointer" }}>
            <input type="checkbox" onChange={(e) => { if (e.target.checked) akt.tourSchliessen(true); }}
              style={{ width: 16, height: 16, accentColor: C.accent, cursor: "pointer" }} />
            Nächstes Mal nicht mehr anzeigen
          </label>
        </div>
      </div>
    </div>);
}
