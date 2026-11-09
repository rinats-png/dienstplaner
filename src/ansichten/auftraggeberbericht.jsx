/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useMemo } from "react";
import { addDays } from "../regelwerk.js";
import { C } from "../farben.js";
import { Card, CardHead, Lab, Btn, Inp, Sel, Field, H1 } from "../ui/bausteine.jsx";
import { heute, fLang, fKurz } from "../lib/datum.js";
import { zahl } from "../lib/format.js";
import { Erklaerkasten } from "../gestalt/bausteine.jsx";
import { Kennzahlen, Leitraster } from "../gestalt/ansichten.jsx";
import { uebergabenVon } from "../lib/fachlogik.js";
import { anzahlWort } from "../lib/rollen.js";
import { auftraggeberBericht } from "../lib/auftraggeber.js";


/* ==========================================================================
   BERICHT AN DEN AUFTRAGGEBER
   Was nach außen darf, in einer Fassung zum Weitergeben.
   ========================================================================== */
export function Auftraggeberbericht({ sitz, akt }) {
  const m = sitz.mandant;
  const [von, setVon] = useState(addDays(heute(), -30));
  const [bis, setBis] = useState(heute());
  const [einheit, setEinheit] = useState(m.einheiten[0] ? m.einheiten[0].id : "");
  const [anmerkung, setAnmerkung] = useState("");
  const b = useMemo(() => einheit ? auftraggeberBericht(m, von, bis, einheit) : null,
    [m, von, bis, einheit]);
  const e = m.einheiten.find((x) => x.id === einheit);
  /* Wie viele Übergaben es im Zeitraum überhaupt gibt — die Antwort auf
     „warum steht hier nichts". */
  const uebergabenImZeitraum = uebergabenVon(m)
    .filter((u) => u && u.datum >= von && u.datum <= bis).length;

  const alsText = () => {
    if (!b) return "";
    const anm = anmerkung.trim();
    return [
      `Leistungsnachweis ${m.name}`,
      e ? `${m.einheitLabel || "Einheit"}: ${e.name}` : "",
      `Zeitraum: ${fLang(b.von)} bis ${fLang(b.bis)}`,
      "",
      `Besetzung vollständig an ${b.vollstaendig} von ${b.tage} Tagen` +
        (b.quote !== null ? ` (${b.quote} %)` : "") +
        (b.betriebsweit ? " — Betrieb gesamt; die Mindestbesetzung ist je Dienstart hinterlegt, nicht je Einheit" : ""),
      `Dienste aus ${e ? e.name : "der Einheit"}: ${b.diensteEinheit}` +
        (b.tageOhneEinheit ? ` · ${b.tageOhneEinheit} Tage ohne Dienst aus dieser Einheit` : ""),
      "",
      ...(b.eintraege.length ? ["Besondere Vorkommnisse:", ""] : ["Keine besonderen Vorkommnisse."]),
      ...b.eintraege.map((z) => `${fKurz(z.datum)}${z.dienst ? `  ${z.dienst}` : ""}  ${z.vorkommnis}`),
      /* Die Anmerkung steht unter eigener Überschrift, nicht zwischen den
         Vorkommnissen. Ein Nachweis verliert seinen Wert, sobald sich
         Erfasstes und nachträglich Geschriebenes nicht mehr unterscheiden
         lassen. */
      ...(anm ? ["", "Anmerkung des Betriebs (nachträglich erfasst):", "", anm] : []),
      "",
      "———",
      "Erstellt mit CENTRIC. Personenbezogene Angaben sind nicht enthalten.",
      "Vorkommnisse stammen aus den Schichtübergaben des Zeitraums.",
    ].filter((x) => x !== null).join("\n");
  };

  return (
    <div>
      <H1 rubrik="Auswertung"
        sub="Ein Blatt zum Weitergeben an den Auftraggeber: Wie zuverlässig war die Besetzung im Zeitraum, und was ist vorgefallen? Ohne Namen, ohne interne Aufgaben, ohne Krankmeldungen — ein Auftraggeber bekommt Nachweis, keine Personalakte.">
        Leistungsnachweis</H1>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ padding: "20px var(--pad-x)", display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
          <Field label="Von"><Inp type="date" value={von}
            onChange={(ev) => setVon(ev.target.value)} /></Field>
          <Field label="Bis"><Inp type="date" value={bis}
            onChange={(ev) => setBis(ev.target.value)} /></Field>
          <Field label={m.einheitLabel || "Einheit"}>
            <Sel value={einheit} onChange={(ev) => setEinheit(ev.target.value)}>
              {m.einheiten.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>))}</Sel></Field>
        </div>
      </Card>

      {b && (<>
        <Kennzahlen min={180} kacheln={[
          { label: "Zeitraum", wert: `${zahl(b.tage)} Tage`, sub: `${fKurz(b.von)} bis ${fKurz(b.bis)}` },
          { label: "Vollständig besetzt", wert: `${zahl(b.vollstaendig)}`, ton: "ok",
            sub: `von ${zahl(b.tage)} Tagen${b.betriebsweit ? " · Betrieb gesamt" : ""}` },
          { label: "Deckungsquote", wert: b.quote === null ? "—" : `${b.quote} %`,
            ton: b.quote === null ? undefined : b.quote >= 95 ? "ok" : "warn",
            sub: (b.quote !== null && b.quote >= 98 ? "sehr gut" : b.quote >= 95 ? "gut" : "mit Lücken")
              + (b.betriebsweit ? " · Mindestbesetzung gilt je Dienstart, nicht je Einheit" : "") },
          { label: `Dienste aus ${e ? e.name : "der Einheit"}`, wert: zahl(b.diensteEinheit),
            sub: b.tageOhneEinheit ? `${zahl(b.tageOhneEinheit)} Tage ohne Dienst aus dieser Einheit` : "an jedem Tag im Dienst" },
          { label: "Vorkommnisse", wert: zahl(b.eintraege.length), ton: b.eintraege.length ? "warn" : "ok",
            sub: "aus den Übergaben" }]} />

        <Leitraster seiteBreite={370}
          haupt={<>
        <Card>
          <CardHead right={<div style={{ display: "flex", gap: 9 }}>
            <Btn size="sm" onClick={() => {
              try { navigator.clipboard.writeText(alsText()); } catch { /* egal */ }
            }}>Kopieren</Btn>
            <Btn size="sm" onClick={() => {
              const blob = new Blob([alsText()], { type: "text/plain;charset=utf-8" });
              const u = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = u; a.download = `leistungsnachweis-${von}-${bis}.txt`; a.click();
              setTimeout(() => URL.revokeObjectURL(u), 1000);
            }}>Herunterladen</Btn>
          </div>}>Vorschau</CardHead>
          <pre style={{ margin: 0, padding: "20px var(--pad-x)", fontSize: 13,
            lineHeight: 1.65, whiteSpace: "pre-wrap", fontFamily: "inherit",
            color: C.text }}>{alsText()}</pre>
        </Card>

          </>}
          seite={<>
        {/* Woher die Vorkommnisse kommen — und was zu tun ist, wenn keine
            da sind. Ohne diesen Hinweis wirkt ein leerer Nachweis wie ein
            Fehler der Anwendung. */}
        <Erklaerkasten>
          <div>
            <b style={{ color: C.text }}>Der Nachweis wird nicht geschrieben, sondern abgeleitet.</b>{" "}
            Die Besetzungszahlen kommen aus dem Plan, die Vorkommnisse ausschließlich aus dem
            Feld „Vorkommnis" der abgeschlossenen Schichtübergaben. Das ist Absicht: Was einem
            Auftraggeber als Nachweis vorgelegt wird, soll niemand nachträglich hineinschreiben
            können.
            <div style={{ marginTop: 10 }}>
              {uebergabenImZeitraum === 0
                ? <>Im gewählten Zeitraum ist <b style={{ color: C.text }}>keine einzige Übergabe</b> erfasst —
                    deshalb steht hier nichts. Erfasst werden sie unter <b style={{ color: C.text }}>Übergabe</b>.</>
                : <>Im Zeitraum sind {anzahlWort(uebergabenImZeitraum, "Übergabe")} erfasst,
                    davon {zahl(b.eintraege.length)} mit einem Vorkommnis.</>}
            </div>
          </div>
        </Erklaerkasten>

        {/* Freie Anmerkung — bewusst getrennt, bewusst nicht gespeichert. */}
        <Card>
          <CardHead right={<Lab>freiwillig</Lab>}>Eigene Anmerkung</CardHead>
          <div style={{ padding: "16px var(--pad-x) 20px" }}>
            <textarea className="inp" rows={3} value={anmerkung} aria-label="Eigene Anmerkung zum Nachweis"
              placeholder="Zum Beispiel: Hinweis auf eine Absprache, eine geplante Maßnahme, eine Einordnung."
              onChange={(ev) => setAnmerkung(ev.target.value)} />
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 10, lineHeight: 1.55 }}>
              Erscheint im Nachweis unter eigener Überschrift und ausdrücklich als nachträglich
              erfasst — getrennt von den Vorkommnissen aus den Übergaben. Sie wird nicht
              gespeichert, sondern gilt nur für dieses eine Blatt.
            </div>
          </div>
        </Card>

        <Erklaerkasten>
          Nicht enthalten sind Namen, Stundenkonten, Krankmeldungen und die internen
          Felder der Übergabe. Wer einem Auftraggeber mehr geben will, sollte es
          bewusst tun — nicht, weil eine Ausgabe es versehentlich mitliefert.
          <div style={{ marginTop: 10 }}>
            Zur Einordnung der Zahlen: Besetzung und Deckungsquote gelten für den
            gesamten Betrieb, nicht für die oben gewählte {m.einheitLabel || "Einheit"} —
            die Mindestbesetzung ist je Dienstart hinterlegt, nicht je{" "}
            {m.einheitLabel || "Einheit"}. Die Auswahl oben grenzt die Vorkommnisse ein,
            nicht die Besetzungszahlen.
          </div>
        </Erklaerkasten>
          </>} />
      </>)}
    </div>);
}
