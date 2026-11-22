/* ==========================================================================
   IMP-6 Oberfläche — Schichtmodelle und Zuordnungen je Person

   Betreiberentscheidungen 2026-11-13/14: Eine Person kann mehrere Schichtmodelle tragen (eindeutige Kennung,
   Gültigkeitszeitraum je Zuordnung, keine stille Auflösung von Überschneidungen, nie rückwirkend, frühestens ab
   morgen, „kein Schichtmodell“ ist zulässig). Jedes Modell hat seine eigene Zykluslänge (1 bis 1000 Tage).

   Bearbeitet wird ein Entwurf; „Übernehmen“ prüft ihn mit derselben Bibliothek wie der Server
   (src/lib/schichtmodelle-pflege.js, dort die Serverbibliothek) und schreibt erst dann über die Aktion.
   Was der Server dennoch abweist, zeigt „Nicht gespeichert“ mit seinem Text (src/speicher.js, Lage „schichtmodell“).

   Sichtbar nur für Rollen, die heute Schichtfolge und Personal pflegen (wie der Server: (org.edit oder pattern.edit)
   und staff.edit). Keine Anzeige „Mein Schichtmodell“ für Beschäftigte (ENTSCHEIDUNGSLISTE P2-19 (d)) und keine
   Wirkung auf die Planrechnung (P2-4 Punkt 6): Der Hinweis oben sagt das ausdrücklich.
   ========================================================================== */
import { useMemo, useState } from "react";
import { Btn, Card, CardHead, Field, Inp, Sel, Lab, Feldfehler } from "../ui/bausteine.jsx";
import { Hinweisband, Fehlerband } from "../gestalt/ansichten.jsx";
import { Zelle } from "../ui/leisten.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { heute as heuteBetrieb } from "../lib/datum.js";
import { schichtmodellPflegeAn } from "../lib/schichtmodell-schalter.js";
import {
  BETRIEB_MODELL, SCHICHTMODELL_GRENZEN, FREI, folgeLesen, folgeText, unbekannteKennungen, zykluslaengeText,
  neueKennung, alleZuordnungsKennungen, nutzerDesModells, entwurfPruefen, mitModellen, mitZuordnungen, modelleVon,
  zuordnungenDerPerson, personName, lageAm, zeitraumText, zuordnungBegonnen, plusTage, darfSchichtmodelle, wirksamePerson,
} from "../lib/schichtmodelle-pflege.js";

/* Rechte wie der Server (feste Matrix, Review zu PR 423 A1): src/lib/schichtmodelle-pflege.js. */
export { darfSchichtmodelle };

const kopie = (x) => JSON.parse(JSON.stringify(x));
const VORSCHAU_TAGE = 28;

/** Eine Folge als kleine Zellen (nur Vorschau, für Vorlesesoftware als ein Text zusammengefasst). */
function FolgeVorschau({ tage, map }) {
  const zu = tage.slice(0, VORSCHAU_TAGE);
  const text = zu.map((t) => (map[t] ? map[t].kurz : "frei")).join(", ");
  return (
    <div role="img" aria-label={`Folge: ${text}${tage.length > VORSCHAU_TAGE ? ` und ${tage.length - VORSCHAU_TAGE} weitere Tage` : ""}`}
      style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 8 }}>
      {zu.map((t, i) => <Zelle key={i} da={map[t]} size={18} blass />)}
      {tage.length > VORSCHAU_TAGE && <span style={{ fontSize: 12, color: C.dim, alignSelf: "center", marginLeft: 4 }}>
        … +{tage.length - VORSCHAU_TAGE}</span>}
    </div>);
}

/* ------------------------------ Modelle ------------------------------ */
function ModellEditor({ m, start, heute, onUebernehmen, onAbbrechen }) {
  const [name, setName] = useState(start.name || "");
  const [folge, setFolge] = useState(folgeText(start.tage));
  const [fehler, setFehler] = useState(null);
  const tage = folgeLesen(folge);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const unbekannt = unbekannteKennungen(tage, m.dienstarten);
  const zuLang = tage.length > SCHICHTMODELL_GRENZEN.tage;
  const anhaengen = (id) => { setFolge((f) => `${f.trim()} ${id}`.trim()); setFehler(null); };

  const uebernehmen = () => {
    const modell = { ...start, name: name.trim(), tage };
    const liste = modelleVon(m).some((x) => x.id === start.id)
      ? modelleVon(m).map((x) => (x.id === start.id ? modell : x)) : [...modelleVon(m), modell];
    const neu = mitModellen(m, liste);
    const f = entwurfPruefen(m, neu, heute);
    if (f) { setFehler(f.text); return; }
    onUebernehmen(liste);
  };

  return (
    <div className="karte" style={{ padding: 16, marginBottom: 13 }} data-testid="schichtmodell-editor">
      <div style={{ display: "grid", gap: 14 }}>
        <Field label="Name des Schichtmodells" hint="Betriebliche Bezeichnung ohne Personenbezug, z. B. „Wechselschicht 3 Wochen“.">
          <Inp value={name} maxLength={SCHICHTMODELL_GRENZEN.nameLaenge} onChange={(e) => { setName(e.target.value); setFehler(null); }} />
        </Field>
        <Field label="Folge der Zyklustage"
          hint={`Kürzel der Dienstarten in Reihenfolge, getrennt durch Leerzeichen; „-“ oder „frei“ für einen freien Tag. Jede Zykluslänge von 1 bis ${SCHICHTMODELL_GRENZEN.tage} Tagen.`}>
          <Inp value={folge} onChange={(e) => { setFolge(e.target.value); setFehler(null); }} spellCheck={false}
            aria-invalid={unbekannt.length || zuLang ? "true" : undefined} />
        </Field>
        <Feldfehler text={unbekannt.length ? `Unbekannte Kürzel: ${unbekannt.join(", ")}. Erlaubt sind die Dienstarten des Betriebs und „-“.`
          : zuLang ? `Höchstens ${SCHICHTMODELL_GRENZEN.tage} Zyklustage.` : null} />
        <div>
          <Lab style={{ marginBottom: 8 }}>Tag anhängen</Lab>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {m.dienstarten.filter((d) => !d.posten).map((d) => (
              <Btn key={d.id} size="sm" onClick={() => anhaengen(d.id)} aria-label={`${d.kurz} (${d.name}) als nächsten Zyklustag anhängen`}>{d.kurz}</Btn>))}
            <Btn size="sm" onClick={() => anhaengen(FREI)} aria-label="frei (freier Tag) als nächsten Zyklustag anhängen">frei</Btn>
            <Btn size="sm" kind="quiet" disabled={!tage.length} onClick={() => { setFolge(folgeText(tage.slice(0, -1))); setFehler(null); }}>
              Letzten Tag entfernen</Btn>
          </div>
        </div>
        <div role="status" style={{ fontSize: 13, color: C.dim, ...NUM }}>Zykluslänge: {zykluslaengeText(tage.length)}</div>
        {tage.length > 0 && <FolgeVorschau tage={tage} map={map} />}
        {fehler && <Fehlerband>{fehler}</Fehlerband>}
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <Btn kind="primary" disabled={!name.trim() || !tage.length || unbekannt.length > 0 || zuLang} onClick={uebernehmen}>Übernehmen</Btn>
          <Btn kind="quiet" onClick={onAbbrechen}>Abbrechen</Btn>
        </div>
      </div>
    </div>);
}

function ModellListe({ m, heute, akt }) {
  const [bearbeitet, setBearbeitet] = useState(/** @type {any} */ (null));
  const [fehler, setFehler] = useState(null);
  const modelle = modelleVon(m);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const neu = () => setBearbeitet({ id: neueKennung("sm", modelle.map((x) => x.id)), name: "", tage: [] });
  const entfernen = (x) => {
    const liste = modelle.filter((y) => y.id !== x.id);
    const f = entwurfPruefen(m, mitModellen(m, liste), heute);
    if (f) { setFehler(f.text); return; }
    setFehler(null);
    akt.setzeSchichtmodelle(liste, `Schichtmodell „${x.name}“ entfernt`);
  };
  return (
    <Card style={{ minWidth: 0 }}>
      <CardHead right={!bearbeitet && modelle.length < SCHICHTMODELL_GRENZEN.modelle
        && <Btn kind="primary" size="sm" onClick={neu}>Neues Schichtmodell</Btn>}>Schichtmodelle</CardHead>
      <div style={{ padding: 22 }}>
        {bearbeitet && <ModellEditor m={m} start={bearbeitet} heute={heute} onAbbrechen={() => setBearbeitet(null)}
          onUebernehmen={(liste) => { akt.setzeSchichtmodelle(liste, "Schichtmodelle geändert"); setBearbeitet(null); }} />}
        {fehler && <Fehlerband style={{ marginBottom: 13 }}>{fehler}</Fehlerband>}
        {!modelle.length && !bearbeitet && <p style={{ fontSize: 13.5, color: C.dim, margin: 0, lineHeight: 1.55 }}>
          Noch kein eigenes Schichtmodell. Ohne Zuordnung gilt für jede Person die Schichtfolge des Betriebs.</p>}
        {modelle.map((x) => {
          const nutzer = nutzerDesModells(m, x.id);
          return (
            <div key={x.id} className="karte" style={{ padding: 16, marginBottom: 13 }} data-testid="schichtmodell-eintrag">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, overflowWrap: "anywhere" }}>{x.name}</div>
                  <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4, ...NUM }}>
                    {zykluslaengeText(x.tage.length)} · {nutzer.length === 1 ? "1 Person zugeordnet" : `${nutzer.length} Personen zugeordnet`}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn size="sm" disabled={!!bearbeitet} onClick={() => { setFehler(null); setBearbeitet(kopie(x)); }}
                    aria-label={`Schichtmodell ${x.name} bearbeiten`}>Bearbeiten</Btn>
                  <Btn size="sm" kind="quiet" disabled={!!bearbeitet || nutzer.length > 0} onClick={() => entfernen(x)}
                    aria-label={`Schichtmodell ${x.name} entfernen`}
                    title={nutzer.length ? "Noch zugeordnet — zuerst die Zuordnungen ändern." : undefined}>Entfernen</Btn>
                </div>
              </div>
              <FolgeVorschau tage={x.tage} map={map} />
            </div>);
        })}
      </div>
    </Card>);
}

/* ------------------------------ Zuordnungen ------------------------------ */
export function ZuordnungsZeile({ z, i, m, heute, alt, fortsetzung, onAendern, onEntfernen }) {
  const modelle = modelleVon(m);
  /* Begonnen: gespeichert und Beginn bis heute — oder die vom Hinzufügen angelegte Fortsetzung des Betriebsmodells
     („seit jeher“). Eine neue Zeile, deren „Gültig ab“ geleert wurde, gilt NICHT als begonnen (Review zu PR 423 H1): sie bleibt
     bearbeitbar, die Vorprüfung meldet den fehlenden Beginn. */
  const begonnen = alt ? zuordnungBegonnen(alt, heute) : !!fortsetzung;
  const eigenes = z.modellId !== BETRIEB_MODELL ? modelle.find((x) => x.id === z.modellId) : null;
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const nr = i + 1;
  const setz = (k, v) => onAendern({ ...z, [k]: v });
  const modellWechsel = (id) => {
    const n = { ...z, modellId: id };
    if (id === BETRIEB_MODELL) delete n.versatz; else n.versatz = 0;
    onAendern(n);
  };
  return (
    <div className="karte" style={{ padding: 14, marginBottom: 11 }} data-testid="zuordnung-zeile">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Zuordnung {nr}</span>
        <span style={{ fontSize: 12.5, color: C.dim, ...NUM }}>{begonnen
          ? `${zeitraumText(alt || z)} · begonnen, nur „Gültig bis“ ab heute änderbar` : zeitraumText(z)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 12 }}>
        <Field label="Schichtmodell">
          <Sel value={z.modellId} disabled={begonnen} onChange={(e) => modellWechsel(e.target.value)}
            aria-label={`Schichtmodell der Zuordnung ${nr}`}>
            <option value={BETRIEB_MODELL}>Schichtfolge des Betriebs</option>
            {modelle.map((x) => <option key={x.id} value={x.id}>{x.name} ({zykluslaengeText(x.tage.length)})</option>)}
            {z.modellId !== BETRIEB_MODELL && !eigenes && <option value={z.modellId}>unbekanntes Modell</option>}
          </Sel>
        </Field>
        <Field label="Gültig ab">
          <Inp type="date" value={z.gueltigAb || ""} disabled={begonnen} min={plusTage(heute, 1)}
            aria-label={`Gültig ab, Zuordnung ${nr}`} onChange={(e) => setz("gueltigAb", e.target.value || null)} />
        </Field>
        <Field label="Gültig bis" hint="Leer lassen für offen.">
          <Inp type="date" value={z.gueltigBis || ""} min={heute}
            aria-label={`Gültig bis, Zuordnung ${nr}`} onChange={(e) => setz("gueltigBis", e.target.value || null)} />
        </Field>
        {eigenes && <Field label="Startpunkt im Zyklus" hint="Zyklustag am Tag „Gültig ab“.">
          <Sel value={Number.isInteger(z.versatz) ? z.versatz : 0} disabled={begonnen}
            aria-label={`Startpunkt im Zyklus, Zuordnung ${nr}`} onChange={(e) => setz("versatz", Number(e.target.value))}>
            {eigenes.tage.map((t, k) => <option key={k} value={k}>Tag {k + 1} — {map[t] ? map[t].name : "frei"}</option>)}
          </Sel>
        </Field>}
      </div>
      {!begonnen && <div style={{ marginTop: 10 }}>
        <Btn size="sm" kind="quiet" onClick={onEntfernen} aria-label={`Zuordnung ${nr} entfernen`}>Entfernen</Btn></div>}
    </div>);
}

function ZuordnungenJePerson({ m, heute, akt }) {
  const personen = useMemo(() => [...(m.personen || [])].filter((p) => p && p.id)
    .sort((a, b) => personName(a).localeCompare(personName(b), "de")), [m.personen]);
  const [gewaehlt, setPid] = useState(/** @type {string | null} */ (null));
  /* Review zu PR 423 H4: Die gewählte Person gilt nur, solange es sie gibt; sonst die erste der (geänderten) Liste. */
  const pid = wirksamePerson(personen, gewaehlt);
  const person = personen.find((p) => p.id === pid) || null;
  const gespeichert = zuordnungenDerPerson(person);
  /* Der Entwurf gehört zu genau einer Person; wechselt sie (auch durch eine geänderte Liste), gilt er nicht mehr. */
  const [entwurfZustand, setEntwurfZustand] = useState(/** @type {{ pid: string, liste: any[], fortsetzung: string[] } | null} */ (null));
  const entwurf = entwurfZustand && entwurfZustand.pid === pid ? entwurfZustand.liste : null;
  const fortsetzungIds = new Set(entwurfZustand && entwurfZustand.pid === pid ? entwurfZustand.fortsetzung : []);
  const setEntwurf = (liste, fortsetzung) => setEntwurfZustand(liste === null ? null
    : { pid, liste, fortsetzung: fortsetzung || (entwurfZustand && entwurfZustand.pid === pid ? entwurfZustand.fortsetzung : []) });
  const [fehler, setFehler] = useState(null);
  const liste = entwurf || gespeichert;
  const altNach = new Map(gespeichert.map((z) => [z.id, z]));
  const geaendert = !!entwurf && JSON.stringify(entwurf) !== JSON.stringify(gespeichert);
  const morgen = plusTage(heute, 1);

  const wechselPerson = (id) => { setPid(id); setEntwurf(null); setFehler(null); };
  const aendern = (neu, fortsetzung) => { setEntwurf(neu, fortsetzung); setFehler(null); };
  const hinzufuegen = () => {
    const ids = new Set([...alleZuordnungsKennungen(m), ...liste.map((z) => z.id)]);
    const modell = modelleVon(m)[0];
    const z = modell ? { id: neueKennung("sz", ids), modellId: modell.id, gueltigAb: morgen, gueltigBis: null, versatz: 0 }
      : { id: neueKennung("sz", ids), modellId: BETRIEB_MODELL, gueltigAb: morgen, gueltigBis: null };
    ids.add(z.id);
    /* Ohne gespeicherte Liste galt bisher das Betriebsmodell unbefristet. Damit die Vergangenheit unverändert bleibt,
       steht seine Fortsetzung bis heute sichtbar im Entwurf (sonst wären die Tage davor „kein Schichtmodell“ —
       rückwirkend, der Server wiese ab). Nichts wird still entschieden: Beide Zeilen sind sichtbar und änderbar. */
    const fortsetzung = !liste.length
      ? [{ id: neueKennung("sz", ids), modellId: BETRIEB_MODELL, gueltigAb: null, gueltigBis: heute }] : [];
    aendern([...liste.map((x) => ({ ...x })), ...fortsetzung, z], [...fortsetzungIds, ...fortsetzung.map((x) => x.id)]);
  };
  const uebernehmen = () => {
    const f = entwurfPruefen(m, mitZuordnungen(m, pid, liste), heute);
    if (f) { setFehler(f.text); return; }
    akt.setzeSchichtmodellZuordnungen(pid, liste, `Schichtmodell-Zuordnung geändert (${person ? personName(person) : pid})`);
    setEntwurf(null);
  };

  if (!personen.length) return null;
  const heuteLage = person ? lageAm(m, person, heute) : null;
  const morgenLage = person ? lageAm(m, entwurf ? mitZuordnungen(m, pid, liste).personen.find((p) => p.id === pid) : person, morgen) : null;
  return (
    <Card style={{ minWidth: 0 }}>
      <CardHead>Zuordnungen je Person</CardHead>
      <div style={{ padding: 22 }}>
        <Field label="Person">
          <Sel value={pid} onChange={(e) => wechselPerson(e.target.value)}>
            {personen.map((p) => <option key={p.id} value={p.id}>{personName(p)}</option>)}
          </Sel>
        </Field>
        {person && <div role="status" style={{ margin: "14px 0", fontSize: 13.5, lineHeight: 1.6 }}>
          <div>Heute: <b style={{ color: heuteLage.ton === "danger" ? C.danger : undefined }}>{heuteLage.text}</b></div>
          <div>Ab morgen{entwurf ? " (Entwurf)" : ""}: <b style={{ color: morgenLage.ton === "danger" ? C.danger : undefined }}>{morgenLage.text}</b></div>
        </div>}
        {!liste.length && <p style={{ fontSize: 13.5, color: C.dim, margin: "0 0 14px", lineHeight: 1.55 }}>
          Keine eigene Zuordnung — es gilt unbefristet die Schichtfolge des Betriebs.</p>}
        {liste.map((z, i) => <ZuordnungsZeile key={z.id} z={z} i={i} m={m} heute={heute} alt={altNach.get(z.id) || null} fortsetzung={fortsetzungIds.has(z.id)}
          onAendern={(n) => aendern(liste.map((x) => (x.id === z.id ? n : x)))}
          onEntfernen={() => aendern(liste.filter((x) => x.id !== z.id))} />)}
        {fehler && <Fehlerband style={{ margin: "4px 0 13px" }}>{fehler}</Fehlerband>}
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <Btn size="sm" disabled={liste.length >= SCHICHTMODELL_GRENZEN.zuordnungenJePerson} onClick={hinzufuegen}>Zuordnung hinzufügen</Btn>
          <Btn kind="primary" size="sm" disabled={!geaendert} onClick={uebernehmen}>Übernehmen</Btn>
          {entwurf && <Btn kind="quiet" size="sm" onClick={() => { setEntwurf(null); setFehler(null); }}>Entwurf verwerfen</Btn>}
        </div>
        <p style={{ fontSize: 12.5, color: C.dim, margin: "14px 0 0", lineHeight: 1.5 }}>
          Für jeden Tag gilt höchstens ein Schichtmodell; Überschneidungen werden nicht still aufgelöst. Lücken sind
          zulässig (an diesen Tagen gilt kein Schichtmodell). Änderungen gelten frühestens ab morgen ({morgen}).</p>
      </div>
    </Card>);
}

/* ------------------------------ Ansicht ------------------------------ */
/**
 * @param {{ sitz: any, akt: any, heuteTag?: string }} props heuteTag nur für Prüfungen (sonst der Betriebstag)
 */
export function Schichtmodelle({ sitz, akt, heuteTag }) {
  /* P2-24 B: hinter dem Schalter CENTRIC_SCHICHTMODELL_PFLEGE (Vorgabe aus). Aus: nichts angezeigt; die Daten bleiben
     im Zustand und gehen beim Speichern unverändert mit. */
  if (!schichtmodellPflegeAn() || !darfSchichtmodelle(sitz)) return null;
  const m = sitz.mandant;
  const heute = heuteTag || heuteBetrieb();
  return (
    <section aria-labelledby="schichtmodelle-titel" style={{ marginTop: 28 }} data-testid="schichtmodell-pflege">
      <h2 id="schichtmodelle-titel" style={{ fontSize: 18, fontWeight: 650, margin: "0 0 12px" }}>Schichtmodelle je Person</h2>
      <Hinweisband ton="accent" titel="Noch ohne Wirkung auf den Dienstplan" role="note">
        Eigene Schichtmodelle und ihre Zuordnungen werden gespeichert, geprüft und protokolliert. Der Dienstplan rechnet
        bis zur Freigabe weiter mit der Schichtfolge des Betriebs (oben). Änderungen gelten frühestens ab morgen;
        vergangene, abgeschlossene und freigegebene Monate bleiben unverändert.
      </Hinweisband>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 16 }}>
        <ModellListe m={m} heute={heute} akt={akt} />
        <ZuordnungenJePerson m={m} heute={heute} akt={akt} />
      </div>
    </section>);
}
