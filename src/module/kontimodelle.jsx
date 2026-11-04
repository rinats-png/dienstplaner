/* ==========================================================================
   KONTIMODELLE — Assistent (WP-19, Strang C)

   Rechnet live, schreibt nichts von selbst: „Übernehmen" reicht Folge,
   Gruppen und Versatz an den Aufrufer, der daraus wie bisher Schichtfolge
   und Einheiten setzt (Rechte: pattern.edit). Eingehängt wird die Ansicht
   erst, wenn das Modul „vorläufig" ist (server/lib/branchenmodule.mjs);
   bis dahin ist sie nur über die Prüfung erreichbar.

   Gestaltung bewusst schlicht und ohne feste Breiten (360 px ohne
   Querscrollen); die Tokens der Anwendung kommen beim Einhängen dazu.
   ========================================================================== */
import { useMemo, useState } from "react";
import { kontiKennzahlen, versatzVorschlag, jahresabgleich, kontiHinweise, pruefeKontiModell }
  from "../../server/lib/modul-kontimodelle.mjs";

const zahl = (x) => Number(x).toLocaleString("de-DE", { maximumFractionDigits: 2 });

/**
 * @param {{ dienstarten: Record<string, { start: string, ende: string }>, sollWochenstunden?: number,
 *   stundenJeFreischicht?: number, start?: { tage: string[], gruppen: number, versatzTage: number, vollkonti?: boolean },
 *   onUebernehmen?: (m: { tage: string[], gruppen: number, versatzTage: number }) => void }} props
 */
export function KontiAssistent({ dienstarten, sollWochenstunden = 40, stundenJeFreischicht = 8, start, onUebernehmen }) {
  const [folge, setFolge] = useState((start && start.tage ? start.tage : ["F", "S", "N", "-"]).join(" "));
  const [gruppen, setGruppen] = useState(start ? start.gruppen : 4);
  const [versatz, setVersatz] = useState(start ? start.versatzTage : 1);
  const [vollkonti, setVollkonti] = useState(start ? start.vollkonti !== false : true);

  const modell = useMemo(() => ({ tage: folge.trim().split(/\s+/).filter(Boolean), gruppen: Number(gruppen),
    versatzTage: Number(versatz), vollkonti }), [folge, gruppen, versatz, vollkonti]);
  const fehler = pruefeKontiModell(modell);
  const k = useMemo(() => (fehler ? null : kontiKennzahlen(modell, dienstarten)), [fehler, modell, dienstarten]);
  const vorschlag = useMemo(() => (fehler ? null : versatzVorschlag(modell.tage, modell.gruppen)), [fehler, modell]);
  const jahr = k ? jahresabgleich(k, sollWochenstunden, stundenJeFreischicht) : null;
  const hinweise = k ? kontiHinweise(k, modell) : [];

  return (
    <section aria-labelledby="konti-titel" style={{ display: "grid", gap: 14, maxWidth: "100%" }}>
      <h2 id="konti-titel" style={{ margin: 0, fontSize: 18 }}>Kontischichtmodell</h2>
      <label style={{ display: "grid", gap: 4 }}>Dienstfolge einer Gruppe (Kürzel, „-“ für frei)
        <input value={folge} onChange={(e) => setFolge(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
      </label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 4 }}>Gruppen
          <input type="number" min={1} max={40} value={gruppen} onChange={(e) => setGruppen(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>Versatz in Tagen
          <input type="number" min={0} value={versatz} onChange={(e) => setVersatz(e.target.value)} />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={vollkonti} onChange={(e) => setVollkonti(e.target.checked)} />
          auch am Wochenende
        </label>
      </div>

      {fehler && <p role="alert">{fehler}</p>}
      {vorschlag && !fehler && (
        <p>{vorschlag.gleichmaessig
          ? <>Gleichmäßig besetzt mit Versatz {vorschlag.versatzTage}{Number(versatz) !== vorschlag.versatzTage
            && <> — <button type="button" onClick={() => setVersatz(vorschlag.versatzTage)}>übernehmen</button></>}</>
          : vorschlag.grund}</p>)}

      {k && (
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 12px", margin: 0 }}>
          <dt>Wochenstunden</dt><dd style={{ margin: 0 }}>{zahl(k.wochenstunden)}</dd>
          <dt>Längste Serie</dt><dd style={{ margin: 0 }}>{k.maxSerie}</dd>
          <dt>Längste Nachtserie</dt><dd style={{ margin: 0 }}>{k.maxNacht}</dd>
          <dt>Wechsel unter 11 Stunden Ruhe</dt><dd style={{ margin: 0 }}>{k.ruheUnter11}</dd>
          <dt>Lücken im Zyklus</dt><dd style={{ margin: 0 }}>{k.luecken}</dd>
        </dl>)}

      {jahr && (jahr.offen
        ? <p>{jahr.text}</p>
        : <p>Jahresarbeitszeit gegenüber {zahl(sollWochenstunden)} Wochenstunden: {jahr.differenzJahr > 0 ? "+" : ""}
          {zahl(jahr.differenzJahr)} Stunden. Freischichten zum Ausgleich (Vorschlag, nicht eingetragen):
          {" "}{jahr.freischichtenVorschlag}.</p>)}

      {hinweise.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {hinweise.map((x) => <li key={x.kennung}>{x.text}</li>)}
        </ul>)}

      {onUebernehmen && (
        <div>
          <button type="button" disabled={!!fehler}
            onClick={() => onUebernehmen({ tage: modell.tage, gruppen: modell.gruppen, versatzTage: modell.versatzTage })}>
            Als Schichtfolge übernehmen</button>
        </div>)}
    </section>);
}
