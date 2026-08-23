/* ==========================================================================
   STARTBILD — zwei Sekunden, in denen sich die Marke zusammensetzt

   Die Sequenz hat genau zwei Aufgaben: die Bildmarke aus einem Feld
   einzelner Bildpunkte aufbauen und in derselben Spanne alles laden, was
   danach gebraucht wird. Sie ist kein Ladebalken — ihre Dauer hängt an
   keiner Antwort, sondern steht fest bei 2,0 Sekunden.

   Das Bildpunktfeld ist keine gestaltete Grafik, sondern die Bildmarke
   selbst, abgetastet. Dadurch stimmen Farben und Kanten am Ende
   zwangsläufig mit dem Vektor überein; es gibt nichts, was auseinander-
   laufen könnte.

   Warum nach dem Zusammensetzen nichts mehr fliegt: Der Fortschritt jedes
   Bildpunkts ist rechnerisch bei 1,0 gekappt — keine Feder, kein
   Überschwinger, kein Nachlauf. Ab 1,56 s wird das Canvas nicht nur
   unsichtbar, sondern aus dem Baum genommen. Danach existiert kein
   Bildpunkt mehr, der noch etwas tun könnte.

   Der Zeitgeber hängt an performance.now(), nicht an gezählten Bildern.
   Sonst springt die Sequenz, sobald das Gerät drosselt oder der Reiter
   kurz in den Hintergrund geht.
   ========================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { C, C_HELL, C_DUNKEL } from "./farben.js";
import { Marke, markeAufCanvas } from "./marke.jsx";

/* Alle Zeiten in Millisekunden ab dem ersten Bild.

   Gegenüber der ersten Fassung ist alles gedehnt: Das Zusammensetzen läuft
   über 2,7 statt 2,0 Sekunden, die Reise zur Kopfposition über 1,2 statt
   0,44 Sekunden. Die erste Fassung schob die Marke in 0,44 s um eine volle
   Bildhöhe nach oben — das war kein Weg, das war ein Verschwinden. */
const T = {
  auf: 220,           // Bildpunkte werden auf dem Ring sichtbar
  wanderVon: 180,     // frühester Start einer Wanderung
  wanderBis: 780,     // spätester Start
  flug: 980,          // Dauer je Bildpunkt
  ruhe: 1760,         // ab hier steht alles still  (wanderBis + flug)
  blendeVon: 1840,    // Kreuzblende Canvas → Vektor
  blendeBis: 2140,
  wortVon: 2140, wortBis: 2500,
  zaesur: 2700,       // Ende des Zusammensetzens, die Marke steht fertig
  fahrt: 1200,        // Reise auf die Kopfposition
  hinweisAb: 3300,    // erst ab hier ein Ladehinweis
  aufgeben: 9000,     // danach gilt der Start als gescheitert
};

/* Reduzierte Bewegung: keine Wanderung, nur Aufblenden. Das Zeitfenster
   fürs Laden bleibt dasselbe, verkürzt wird nur, was sich bewegt. */
const T_RUHIG = { auf: 180, halten: 400, fahrt: 260 };

/** Kubische Bezierkurve als Funktion, Newton auf der x-Komponente. */
function bez(x1, y1, x2, y2) {
  const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
  const fx = (u) => ((ax * u + bx) * u + cx) * u;
  const dfx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let u = p;
    for (let i = 0; i < 5; i++) {
      const d = dfx(u);
      if (Math.abs(d) < 1e-6) break;
      u = Math.min(1, Math.max(0, u - (fx(u) - p) / d));
    }
    return ((ay * u + by) * u + cy) * u;
  };
}

/* Gewünscht war „ease-in fürs Zusammensetzen". Reines Ease-in bedeutet
   Höchstgeschwindigkeit im Moment des Auftreffens — der Bildpunkt schlägt
   auf seinem Ziel auf und erzeugt genau das Zucken, das nicht auftreten
   soll. Diese Kurve hat den trägen, sammelnden Anlauf und bremst beim
   Ankommen ab. */
const eWander = bez(0.55, 0.02, 0.20, 1);
const eBlende = bez(0.33, 0, 0.67, 1);
const eAuf = bez(0.4, 0, 1, 1);
/* Die Reise auf die Kopfposition beginnt aus dem Stand und endet im
   Stand. Ein reines Ease-out (.22,1,.36,1) startet mit Höchsttempo — auf
   einem langen Weg liest sich das als Wegschießen, nicht als Bewegen.
   Diese S-Kurve läuft weich an und bremst weich aus. */
const eReise = bez(0.45, 0.05, 0.25, 1);
const eFahrt = bez(0.22, 1, 0.36, 1);   // kurze Wege: Wortmarke, Blenden
const spanne = (a, b, x) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a));

const ruhigGewuenscht = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
};

/** Welche Palette gerade gilt — App.jsx setzt das Attribut beim Umschalten. */
const paletteJetzt = () => {
  try {
    return document.documentElement.getAttribute("data-thema") === "dunkel"
      ? C_DUNKEL : C_HELL;
  } catch { return C_HELL; }
};

/**
 * Die Startsequenz.
 *
 * @param {object} p
 * @param {Promise<any>} [p.bereit]  Was vorliegen muss, bevor hochgefahren
 *   wird. Die Animation wartet nie auf dieses Versprechen — sie hält
 *   danach an, falls es noch offen ist.
 * @param {(dauer: number) => void} [p.onAbgang]  Die Reise zur Kopfposition
 *   beginnt. Die Seite darunter blendet ab hier auf, damit die Marke am
 *   Ende auf einer fertigen Seite ankommt statt auf einer leeren Fläche.
 * @param {(lage: {ohneVerbindung: boolean}) => void} p.onFertig
 *   Wird genau einmal gerufen, wenn die Anmeldung frei ist.
 */
export default function Startbild({ bereit, onAbgang, onFertig }) {
  /* Bei reduzierter Bewegung gibt es das Canvas gar nicht erst. Es nur
     leer zu lassen wäre kein Unterschied für das Auge, aber ein Element,
     das Speicher und eine Ebene kostet, ohne je etwas zu zeigen. */
  const [ohneCanvas, setOhneCanvas] = useState(ruhigGewuenscht);
  const [hinweis, setHinweis] = useState(false);
  const [ohneVerbindung, setOhneVerbindung] = useState(false);

  const huelle = useRef(null);
  const grundRef = useRef(null);
  const leinwand = useRef(null);
  const buehne = useRef(null);
  const markeRef = useRef(null);
  const wortRef = useRef(null);
  /* Referenzen, weil der Ablauf in einer Schleife läuft, die sonst den
     Zustand zum Zeitpunkt ihres Aufbaus sähe. */
  const fertigRef = useRef(onFertig);
  fertigRef.current = onFertig;
  const abgangRef = useRef(onAbgang);
  abgangRef.current = onAbgang;
  const ohneVerbindungRef = useRef(false);
  ohneVerbindungRef.current = ohneVerbindung;

  useEffect(() => {
    const ruhig = ruhigGewuenscht();
    const palette = paletteJetzt();

    /* --- Was geladen wird, ist bereits unterwegs. Hier nur der Merker. --- */
    let datenBereit = !bereit;
    let bereitAb = 0;
    if (bereit) {
      Promise.resolve(bereit)
        .catch(() => {})
        .then(() => { datenBereit = true; });
    }

    /* ---------------------- Das Bildpunktfeld bauen ---------------------- */
    const GROESSE = 132;        // Markenbreite in Punkten
    const SCHRITT = 3;          // Abtastraster
    let punkte = [], B = 0, H = 0, mx = 0, my = 0, ctx = null;

    /** Die Marke an eine Stelle setzen — linke obere Ecke und Breite. */
    const stelleBuehne = (links, oben, breite) => {
      const el = buehne.current;
      if (!el) return;
      el.style.left = `${links}px`;
      el.style.top = `${oben}px`;
      el.style.width = `${breite}px`;
    };

    /* Gemessen wird an der Hülle, nicht am Canvas: Bei reduzierter Bewegung
       gibt es kein Canvas, und ab 2,14 s ist es aus dem Baum genommen —
       die Bühne braucht ihre Maße aber bis zum Schluss. */
    const masse = () => {
      const h = huelle.current;
      const r = h ? h.getBoundingClientRect() : { width: 0, height: 0 };
      B = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      mx = B / 2;
      my = H / 2 - 66;
      stelleBuehne(mx - GROESSE / 2, my - GROESSE / 2, GROESSE);
    };

    const bauen = () => {
      masse();
      const cv = leinwand.current;
      if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = B * dpr; cv.height = H * dpr;
      ctx = cv.getContext("2d", { alpha: true });
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const off = document.createElement("canvas");
      off.width = GROESSE; off.height = GROESSE;
      const oc = off.getContext("2d", { willReadFrequently: true });
      if (!oc) return;
      oc.imageSmoothingEnabled = false;
      markeAufCanvas(oc, GROESSE, palette);
      const bild = oc.getImageData(0, 0, GROESSE, GROESSE).data;

      /* Der Ring liegt knapp jenseits der Bildkanten, nicht weit draußen.
         Bei 1,25 × halber Diagonale startet jeder Punkt so weit außerhalb,
         dass die ersten drei Zehntel ein leeres Bild zeigen — ein Start,
         der mit einem Nichts beginnt. 0,78 lässt das Feld an den Rändern
         auftauchen. */
      const ring = 0.78 * Math.sqrt(B * B + H * H) / 2;

      const roh = [];
      let maxAbst = 1;
      for (let y = 0; y < GROESSE; y += SCHRITT) {
        for (let x = 0; x < GROESSE; x += SCHRITT) {
          const i = (y * GROESSE + x) * 4;
          const a = bild[i + 3];
          if (a < 40) continue;
          const d = Math.hypot(x - GROESSE / 2, y - GROESSE / 2);
          if (d > maxAbst) maxAbst = d;
          roh.push({ tx: mx - GROESSE / 2 + x, ty: my - GROESSE / 2 + y, d,
            r: bild[i], g: bild[i + 1], b: bild[i + 2], a: a / 255 });
        }
      }

      /* Feste Streuung statt Math.random: derselbe Start bei jedem Aufruf,
         damit ein Abnahmevergleich zweier Aufnahmen überhaupt möglich ist. */
      let saat = 20260819;
      const zuf = () => { saat = (saat * 1664525 + 1013904223) % 4294967296; return saat / 4294967296; };

      punkte = roh.map((p) => {
        /* Innen zuerst, außen zuletzt — die Form wächst von innen. */
        const anteil = p.d / maxAbst;
        const verz = T.wanderVon + anteil * (T.wanderBis - T.wanderVon) + (zuf() - 0.5) * 60;
        /* Der Winkel folgt grob dem Zielwinkel. So kommt jeder Punkt aus
           der Richtung, in der er später sitzt; die Wanderung liest sich
           als Sammeln, nicht als Wirbel. */
        const winkel = Math.atan2(p.ty - my, p.tx - mx) + (zuf() - 0.5) * 1.8;
        return { ...p,
          sx: mx + Math.cos(winkel) * ring, sy: my + Math.sin(winkel) * ring,
          /* Harte Bedingung: größte Verzögerung + Flugdauer ≤ T.ruhe. */
          verz: Math.max(0, Math.min(T.wanderBis, verz)) };
      });
    };

    /* Die Bühne braucht ihre Maße in jedem Fall — auch ohne Bildpunktfeld. */
    masse();
    if (!ruhig) bauen();

    const zeichne = (t) => {
      /* Nach dem Entfernen des Elements hinge ctx an einem abgehängten
         Canvas — jeder Aufruf wäre reine Rechenzeit ohne Bild. */
      if (!ctx || !punkte.length || !leinwand.current) return;
      ctx.clearRect(0, 0, B, H);
      if (t >= T.blendeBis) return;
      const blende = 1 - eBlende(spanne(T.blendeVon, T.blendeBis, t));
      const auf = eAuf(spanne(0, T.auf, t));
      for (const p of punkte) {
        const f = eWander(spanne(p.verz, p.verz + T.flug, t));   // bei 1 gekappt
        ctx.globalAlpha = p.a * auf * blende;
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
        ctx.fillRect(p.sx + (p.tx - p.sx) * f, p.sy + (p.ty - p.sy) * f, 3, 3);
      }
      ctx.globalAlpha = 1;
    };

    /* --------------------------- Der Ablauf --------------------------- */
    const t0 = performance.now();
    /* Der Nullpunkt als Messmarke. Von außen ist er sonst nicht zu
       bekommen: Wer auf das Erscheinen der Hülle wartet, erfährt ihn erst
       einige hundert Millisekunden später und misst alles Weitere um
       diesen Betrag verschoben. */
    try { performance.mark("startbild"); } catch { /* ohne Messuhr eben nicht */ }
    let bild = 0, beendet = false, canvasWeg = false, hinweisAn = false;

    const schritt = (jetzt) => {
      const t = jetzt - t0;

      if (datenBereit && !bereitAb) bereitAb = t;

      if (ruhig) {
        const a = spanne(0, T_RUHIG.auf, t);
        if (markeRef.current) markeRef.current.style.opacity = String(a);
        if (wortRef.current) wortRef.current.style.opacity = String(a);
        const frei = T_RUHIG.auf + T_RUHIG.halten;
        const los = datenBereit ? Math.max(frei, bereitAb) : null;
        if (los !== null && t >= los) { abgang(); return; }
        if (t >= T.aufgeben) { setOhneVerbindung(true); abgang(); return; }
        bild = requestAnimationFrame(schritt);
        return;
      }

      zeichne(t);

      /* Ab hier existiert kein Bildpunkt mehr — nicht nur unsichtbar,
         sondern aus dem Baum genommen (Abnahmepunkt A3). */
      if (!canvasWeg && t >= T.blendeBis) { canvasWeg = true; setOhneCanvas(true); }

      if (markeRef.current)
        markeRef.current.style.opacity = String(eBlende(spanne(T.blendeVon, T.blendeBis, t)));
      if (wortRef.current) {
        const w = spanne(T.wortVon, T.wortBis, t);
        wortRef.current.style.opacity = String(w);
        wortRef.current.style.transform = `translateY(${(1 - eFahrt(w)) * 7}px)`;
      }

      /* Sind bei 2,000 s nicht alle notwendigen Aufrufe beantwortet, hält
         die fertige Marke still stehen. Ein Standbild, keine Schleife —
         sonst wäre es doch wieder Bewegung nach dem Zusammensetzen. */
      if (t >= T.zaesur) {
        if (datenBereit) { abgang(); return; }
        if (!hinweisAn && t >= T.hinweisAb) { hinweisAn = true; setHinweis(true); }
        if (t >= T.aufgeben) { setOhneVerbindung(true); abgang(); return; }
      }

      bild = requestAnimationFrame(schritt);
    };

    /* Die Reise auf die Kopfposition.

       Das Ziel wird aus der Seite gemessen, die darunter längst steht: Die
       Bildmarke im Seitenkopf trägt data-marke-ziel. Am Ende der Reise
       liegt die Marke der Sequenz deckungsgleich auf ihr — deshalb ist beim
       Entfernen der Hülle kein Sprung zu sehen.

       Findet sich kein Ziel — etwa in der Anwendung, wo die Marke im
       Seitenkopf hell auf dunklem Grund sitzt und ein Landen einen
       Farbsprung ergäbe —, rückt die Marke ein Stück nach oben, verkleinert
       sich und blendet an Ort und Stelle aus. Kein Wegschießen. */
    function abgang() {
      if (beendet) return;
      beendet = true;

      masse();
      const vonL = mx - GROESSE / 2, vonO = my - GROESSE / 2, vonB = GROESSE;

      /* Bei reduzierter Bewegung wird nicht gereist. Die Marke bleibt, wo
         sie ist, und blendet aus — Bewegung ist genau das, was hier
         abbestellt wurde. */
      let ziel = null;
      if (!ruhig) {
        try {
          const z = document.querySelector("[data-marke-ziel]");
          if (z) {
            const r = z.getBoundingClientRect();
            if (r.width > 4 && r.height > 4) ziel = r;
          }
        } catch { /* ohne Ziel eben ausblenden */ }
      }

      const nachL = ziel ? ziel.left : ruhig ? vonL : vonL + (GROESSE - 84) / 2;
      const nachO = ziel ? ziel.top : ruhig ? vonO : Math.max(24, vonO - 96);
      const nachB = ziel ? ziel.width : ruhig ? vonB : 84;

      const dauer = ruhig ? T_RUHIG.fahrt : T.fahrt;
      abgangRef.current?.(dauer);
      const start = performance.now();

      const reise = (jetzt) => {
        const p = spanne(0, dauer, jetzt - start);
        const f = eReise(p);
        stelleBuehne(vonL + (nachL - vonL) * f, vonO + (nachO - vonO) * f,
          vonB + (nachB - vonB) * f);

        /* Der Grund weicht früher als die Marke ankommt, damit sie die
           letzten Zehntel über der fertigen Seite fliegt statt über einer
           leeren Fläche. */
        if (grundRef.current)
          grundRef.current.style.opacity = String(1 - eFahrt(spanne(0, 0.62, p)));
        /* Die Wortmarke geht: Im Seitenkopf steht „CENTRIC" bereits neben
           der Bildmarke, nicht darunter. Zwei davon wären eine zu viel. */
        if (wortRef.current)
          wortRef.current.style.opacity = String(1 - spanne(0, 0.4, p));
        /* Ohne Ziel bleibt nichts, worauf die Marke sich legen könnte. */
        if (!ziel && markeRef.current)
          markeRef.current.style.opacity = String(1 - eFahrt(spanne(0.35, 1, p)));

        if (p < 1) { bild = requestAnimationFrame(reise); return; }
        fertigRef.current({ ohneVerbindung: ohneVerbindungRef.current });
      };
      bild = requestAnimationFrame(reise);
    }

    bild = requestAnimationFrame(schritt);

    let zoegern = null;
    const beiGroesse = () => {
      clearTimeout(zoegern);
      zoegern = setTimeout(() => { if (!beendet && !canvasWeg && !ruhig) bauen(); }, 160);
    };
    window.addEventListener("resize", beiGroesse);

    return () => {
      beendet = true;
      cancelAnimationFrame(bild);
      clearTimeout(zoegern);
      window.removeEventListener("resize", beiGroesse);
    };
  }, [bereit]);

  return (
    /* Die Hülle selbst bleibt durchsichtig und unbewegt. Der Grund ist ein
       eigenes Blatt darin, damit er weichen kann, während die Marke noch
       unterwegs ist — fiele die Deckkraft der Hülle, verschwände die Marke
       gleich mit. */
    <div ref={huelle} role="status" aria-busy="true"
      aria-label="CENTRIC wird gestartet"
      style={{ position: "fixed", inset: 0, zIndex: 9000, pointerEvents: "none" }}>

      <div ref={grundRef}
        style={{ position: "absolute", inset: 0, background: C.bg, willChange: "opacity" }} />

      {!ohneCanvas && (
        <canvas ref={leinwand} aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
            display: "block" }} />)}

      {/* Linke obere Ecke und Breite werden je Bild gesetzt — kein
          transform, damit die Marke am Ziel pixelgenau auf der Marke des
          Seitenkopfs liegt statt eine halbe Bildpunktbreite daneben. */}
      <div ref={buehne}
        style={{ position: "absolute", left: 0, top: 0, width: 132, textAlign: "center" }}>
        <div ref={markeRef} style={{ opacity: 0, willChange: "opacity" }}>
          <Marke size={132} id="start" style={{ width: "100%", height: "auto" }} />
        </div>
        <div ref={wortRef} aria-hidden="true"
          style={{ opacity: 0, marginTop: 11, fontSize: 19, fontWeight: 800,
            letterSpacing: "-.035em", color: C.text, willChange: "transform, opacity",
            fontFamily: "Inter, -apple-system, system-ui, sans-serif" }}>
          CENTRIC
        </div>
      </div>

      {/* Erst ab 3,3 s. Wer nach einer halben Sekunde einen Spinner zeigt,
          macht schnelle Starts nervös. */}
      {hinweis && (
        <div style={{ position: "absolute", left: 0, right: 0, top: "calc(50% + 96px)",
          textAlign: "center", fontSize: 13, color: C.dim,
          fontFamily: "Inter, -apple-system, system-ui, sans-serif",
          animation: "startHinweis .2s ease-out both" }}>
          {ohneVerbindung ? "Ohne Verbindung gestartet" : "Daten werden geladen …"}
        </div>)}

      <style>{`@keyframes startHinweis{from{opacity:0}to{opacity:1}}`}</style>
    </div>);
}
