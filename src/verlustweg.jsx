/* ==========================================================================
   KONTOWIEDERHERSTELLUNG — Oberfläche (WR-6)

   Zwei Wege in der Anmeldemaske (eingehängt in ZugangZweifaktor, betreiber-2fa.jsx):

     Träger   Gerät und Wiederherstellungscodes sind weg: Antrag stellen (24 Stunden
              offen), zurückziehen, später mit dem Abschlusstoken einlösen, den neuen
              zweiten Faktor einrichten und die neuen Wiederherstellungscodes einmal sehen.
     Leitung  Antrag einer anderen Person freigeben oder ablehnen — mit dem eigenen
              Zugangscode, einem frischen Code aus der eigenen App, dem Verfahren der
              Identitätsprüfung und der Personalnummer der GEPRÜFTEN Person.

   Die Prüfung steht im Server (server/lib/kontowiederherstellung-zugang.mjs); hier wird nur gefragt und
   angezeigt. Die Logik steht in lib/verlustweg.js. Der Weg ist ausgeliefert aus: antwortet der Server mit
   403, sperrt die Oberfläche beide Wege mit einem neutralen Text. Sie nimmt nie an, dass er an ist.

   Geheimnisse: Zugangscode, Code aus der App, Fallnummer, Personalnummer, Abschlusstoken, Geheimnis und
   Wiederherstellungscodes gehen nie in den Speicher des Browsers, in die Adresse oder in ein Protokoll.
   Eingaben werden nach jedem Absenden geleert. Einmalig angezeigte Werte (Geheimnis, Codes, Token) liegen im
   Halter (lib/verlustweg-halter.js): Einklappen, Schließen und Neuaufbau verwerfen sie nicht; sie verschwinden
   nur nach ausdrücklicher Bestätigung oder nach 15 Minuten.

   Eingabefelder: nie type="password" (Passwortverwalter ignorieren autocomplete="off" auf Passwortfeldern und
   böten Code und Token zum Speichern an). Stattdessen Textfelder, per CSS verdeckt (-webkit-text-security), mit
   Schalter „Eingaben anzeigen"; kann der Browser nicht verdecken, steht die Eingabe offen und ein Hinweis dabei.
   Die Felder tragen keinen name und keine id und die Hinweise für gängige Passwortverwalter (data-lpignore,
   data-1p-ignore, data-bwignore).
   ========================================================================== */

import { useState, useEffect, useSyncExternalStore } from "react";
import { AKTION, VERFAHREN, ABLEHNUNGSGRUENDE, ANTRAG_STUNDEN, TOKEN_MINUTEN, TEXT_NICHT_VERFUEGBAR, verlustSenden, zeitText,
  traegerZeile } from "./lib/verlustweg.js";
import { halter, schliessenErlaubt, haltenderWeg } from "./lib/verlustweg-halter.js";

const MONO = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all", overflowWrap: "anywhere" };
const ABSTAND = { display: "grid", gap: 13, minWidth: 0 };
const TEXT = { fontSize: 13.5, lineHeight: 1.5, margin: 0 };
const KASTEN = { padding: "12px 14px", borderRadius: 10, border: "1px solid currentColor", display: "grid", gap: 8, minWidth: 0 };
const TAST = { padding: "8px 14px", minHeight: 36, fontSize: 14, fontWeight: 600, borderRadius: 999, fontFamily: "inherit",
  cursor: "pointer", border: "1px solid currentColor", background: "transparent", color: "inherit", textAlign: "left" };

/** Felder, in die ein Einmalwert getippt wird: nichts merken, nichts vorschlagen, nichts korrigieren, kein Passwortverwalter. */
export const EINMAL = Object.freeze({ type: "text", autoComplete: "off", autoCorrect: "off", autoCapitalize: "off", spellCheck: false,
  "data-lpignore": "true", "data-1p-ignore": "true", "data-bwignore": "true", "data-form-type": "other" });

/** Verdeckung ohne type="password". */
const MASKE_KLASSE = "verlust-geheim";
const MASKE_STIL = `.${MASKE_KLASSE}{-webkit-text-security:disc;text-security:disc;}`;
const kannVerdecken = () => typeof CSS !== "undefined" && typeof CSS.supports === "function"
  && (CSS.supports("-webkit-text-security", "disc") || CSS.supports("text-security", "disc"));

/** Zustand der Verdeckung eines Formulars: verdeckt, solange der Browser es kann und die Person nichts anderes wählt. */
function useMaske() {
  const [klar, setKlar] = useState(false);
  const [kann, setKann] = useState(true);            // vor dem Messen (und im Server-Render) wird verdeckt
  useEffect(() => { setKann(kannVerdecken()); }, []);
  return { kann, klar, setKlar, verdeckt: kann && !klar };
}

/** Schalter „Eingaben anzeigen"; ohne Verdeckung im Browser stattdessen ein Hinweis. */
function MaskeSchalter({ ui, maske }) {
  if (!maske.kann) return <p style={TEXT}>Dieser Browser kann die Eingabe nicht verdecken. Achte darauf, dass dir niemand zusieht.</p>;
  return <ui.Btn type="button" aria-pressed={maske.klar} onClick={() => maske.setKlar(!maske.klar)}>
    {maske.klar ? "Eingaben verbergen" : "Eingaben anzeigen"}</ui.Btn>;
}

/** Feld für Zugangscode und Abschlusstoken: Text, verdeckt per CSS, ohne Passwortverwalter. */
function Geheimfeld({ ui, label, hint, wert, setWert, maske }) {
  return (
    <ui.Field label={label} hint={hint}>
      <ui.Inp {...EINMAL} className={maske.verdeckt ? MASKE_KLASSE : undefined} value={wert} onChange={(e) => setWert(e.target.value)} />
    </ui.Field>);
}

/** Meldung: Fehler als Alarm mit Vorsatz „Fehler:" (nicht nur Farbe), Erfolg als Status. */
function Meldung({ m }) {
  if (!m || !m.text) return null;
  const fehler = m.art !== "ok";
  return <div role={fehler ? "alert" : "status"} style={{ ...TEXT, fontWeight: 600 }}>{fehler ? "Fehler: " : ""}{m.text}</div>;
}

/** Kopieren in die Zwischenablage. Es wird nichts protokolliert; scheitert es, steht ein Hinweis da. */
function Kopieren({ text, was, ui }) {
  const [stand, setStand] = useState("");
  const kopieren = async () => {
    try { await navigator.clipboard.writeText(text); setStand("Kopiert. Zwischenablage nach dem Einfügen leeren."); }
    catch { setStand("Kopieren nicht möglich. Bitte von Hand abschreiben."); }
  };
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <ui.Btn type="button" onClick={kopieren} aria-label={`${was} kopieren`}>Kopieren</ui.Btn>
      <span role="status" style={{ fontSize: 12.5 }}>{stand}</span>
    </span>);
}

/** Wahl aus einer festen Liste (Verfahren, Grund): Auswahlfelder mit Gruppenbeschriftung. */
function Wahl({ legende, liste, wert, setWert, name }) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: "grid", gap: 4 }}>
      <legend style={{ fontSize: 12.5, fontWeight: 600, padding: 0, marginBottom: 4 }}>{legende}</legend>
      {liste.map((x) => (
        <label key={x.wert} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 32, fontSize: 14, cursor: "pointer" }}>
          <input type="radio" name={name} value={x.wert} checked={wert === x.wert} onChange={() => setWert(x.wert)}
            style={{ width: 18, height: 18, margin: 0, flexShrink: 0 }} />
          <span>{x.text}</span>
        </label>))}
    </fieldset>);
}

/** Geheimnis des neuen zweiten Faktors — nur dieses eine Mal sichtbar (wie in der Einrichtung, betreiber-2fa.jsx). */
function EinrichtungAnzeige({ geheimnis, otpauth, ui }) {
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <p style={TEXT}>In der Authenticator-App erfassen. Das Geheimnis erscheint nur dieses eine Mal und gilt {TOKEN_MINUTEN} Minuten.</p>
      <div style={MONO} data-einmal="geheimnis">{geheimnis}</div>
      {otpauth && <div style={{ ...MONO, fontSize: 12 }}>{otpauth}</div>}
      <Kopieren text={geheimnis} was="Geheimnis" ui={ui} />
    </div>);
}

/** Neue Wiederherstellungscodes — nur dieses eine Mal sichtbar. */
function CodesAnzeige({ codes, ui }) {
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <p style={{ ...TEXT, fontWeight: 600 }}>Neue Wiederherstellungscodes — sie erscheinen nur dieses eine Mal. Die alten gelten nicht mehr.</p>
      <ul style={{ ...MONO, listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }} data-einmal="codes">
        {codes.map((w) => <li key={w}>{w}</li>)}
      </ul>
      <Kopieren text={codes.join("\n")} was="Wiederherstellungscodes" ui={ui} />
      <p style={TEXT}>Schreibe sie auf Papier oder lege sie in einem Passwortmanager ab, getrennt vom Telefon. Nicht per E-Mail oder
        Messenger weitergeben und nicht auf einem fremden oder gemeinsamen Drucker ausdrucken. Wer sie kopiert, leert danach die
        Zwischenablage. Jeder Code gilt einmal. Die Anzeige endet nach 15 Minuten.</p>
    </div>);
}

/** Der Halter als Zustand der Ansicht: Neuaufbau und Einklappen verlieren nichts. */
export function useHalter() { return useSyncExternalStore(halter.abonnieren, halter.lesen, halter.lesen); }
/** Für die Anmeldemaske: Solange ein Einmalwert sichtbar ist, darf die Ansicht nicht geschlossen werden. */
export function useVerlustSperre() { return !schliessenErlaubt(useHalter()); }

const ABLAUF_TEXT = Object.freeze({
  einrichtung: `Die Einrichtung ist nach ${TOKEN_MINUTEN} Minuten abgelaufen. Bitte einen neuen Antrag stellen.`,
  codes: "Die Wiederherstellungscodes wurden nach 15 Minuten ausgeblendet.",
  freigabe: `Das Abschlusstoken wurde nach ${TOKEN_MINUTEN} Minuten ausgeblendet.`,
});

/** Frage vor dem Verwerfen eines Einmalwerts (im Panel, kein window.confirm). */
function VerwerfenFrage({ ui, was, folge, ja, zurueck }) {
  return (
    <div style={KASTEN} role="alertdialog" aria-label={`${was} verwerfen?`}>
      <div><strong>{was} wirklich verwerfen?</strong> {folge}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <ui.Btn type="button" kind="primary" onClick={ja}>Ja, verwerfen</ui.Btn>
        <ui.Btn type="button" onClick={zurueck}>Zurück</ui.Btn>
      </div>
    </div>);
}

/* ------------------------------------------------------------------------ Träger */

function Traeger({ ui, gesperrt, sperren }) {
  const h = useHalter();
  const maske = useMaske();
  const [modus, setModus] = useState(AKTION.melden);
  const [zugangscode, setZugangscode] = useState("");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState(null);
  const [frage, setFrage] = useState(false);              // Frage „Geheimnis verwerfen?"
  const [gesichert, setGesichert] = useState(false);      // Häkchen „Codes gesichert"
  const { fall, einrichtung, codes } = h;                 // fall: { fall, gueltigBis } · einrichtung: { geheimnis, otpauth } · codes: [...]

  /** Eine Aktion absenden. Der Zugangscode und der Code aus der App werden danach immer geleert. */
  const senden = async (aktion, felder, bei) => {
    setLaeuft(true); setMeldung(null); halter.quittieren();
    const a = await verlustSenden(aktion, felder);
    setLaeuft(false); setZugangscode(""); setCode("");
    if (a.art !== "eingabe") setToken("");      // abgeschickt: auch das Abschlusstoken wird geleert
    if (a.art === "ok") { bei(a.daten); return; }
    if (a.art === "nicht-verfuegbar") { sperren(); return; }
    setMeldung({ art: "fehler", text: a.text });
  };

  const abschicken = (e) => {
    e.preventDefault();
    if (laeuft) return;
    if (einrichtung) {
      senden(AKTION.bestaetigen, { zugangscode, code }, (d) => { halter.setzen("einrichtung", null); halter.setzen("codes", d.wiederherstellung);
        setFrage(false); setGesichert(false); setMeldung({ art: "ok", text: "Der neue zweite Faktor ist eingerichtet." }); });
      return;
    }
    if (modus === AKTION.melden)
      senden(AKTION.melden, { zugangscode }, (d) => { halter.setzen("fall", { fall: d.fall, gueltigBis: d.gueltigBis }); });
    else if (modus === AKTION.zurueckziehen)
      senden(AKTION.zurueckziehen, { zugangscode }, () => { halter.setzen("fall", null); setMeldung({ art: "ok", text: "Der Antrag ist zurückgezogen." }); });
    else
      senden(AKTION.einloesen, { zugangscode, token }, (d) => { halter.setzen("fall", null);
        halter.setzen("einrichtung", { geheimnis: d.geheimnis, otpauth: d.otpauth }); });
  };

  const abgelaufen = h.abgelaufen === "einrichtung" || h.abgelaufen === "codes" ? ABLAUF_TEXT[h.abgelaufen] : null;

  if (codes) return (
    <div style={ABSTAND}>
      <Meldung m={meldung} />
      <CodesAnzeige codes={codes} ui={ui} />
      <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 32, fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={gesichert} onChange={(e) => setGesichert(e.target.checked)} style={{ width: 18, height: 18, margin: 0, flexShrink: 0 }} />
        <span>Ich habe die Codes gesichert.</span>
      </label>
      <div><ui.Btn type="button" kind="primary" disabled={!gesichert} onClick={() => { halter.setzen("codes", null); setMeldung(null); }}>
        Codes ausblenden</ui.Btn></div>
    </div>);

  if (gesperrt && !einrichtung) return null;     // die Meldung steht einmal oben (VerlustWeg)

  const knopf = einrichtung ? "Mit Code bestätigen"
    : modus === AKTION.melden ? "Antrag stellen" : modus === AKTION.zurueckziehen ? "Antrag zurückziehen" : "Freigabe einlösen";
  return (
    <form onSubmit={abschicken} style={ABSTAND} autoComplete="off" noValidate>
      <style>{MASKE_STIL}</style>
      {abgelaufen && <div role="alert" style={{ ...TEXT, fontWeight: 600 }}>{abgelaufen}</div>}
      {!einrichtung && <>
        <p style={TEXT}><strong>Gerät und Wiederherstellungscodes sind weg?</strong> Dann prüfen zwei Leitungen deines Betriebs
          deine Identität (Vier-Augen-Prinzip), jede mit eigenem Zugangscode und frischem Code aus ihrer App, persönlich, per Rückruf oder
          schriftlich. Die beiden Leitungen dürfen nicht derselben Einheit angehören. Der Antrag bleibt {ANTRAG_STUNDEN} Stunden offen.
          Mit dem Antrag enden alle Anmeldungen dieses Zugangs.
          Wenn du das Gerät wiederfindest, melde dich mit dem Code aus der App an: Das zieht den Antrag zurück.</p>
        <Wahl legende="Was möchtest du tun?" name="verlust-traeger-modus" wert={modus} setWert={setModus}
          liste={[{ wert: AKTION.melden, text: "Antrag stellen" }, { wert: AKTION.zurueckziehen, text: "Antrag zurückziehen" },
            { wert: AKTION.einloesen, text: "Freigabe einlösen (Abschlusstoken)" }]} />
        {fall && <div style={KASTEN} role="status" data-einmal="fall">
          <div><strong>Antrag gestellt.</strong> Fallnummer (erscheint nur dieses eine Mal):</div>
          <div style={{ ...MONO, fontSize: 16, fontWeight: 600 }}>{fall.fall}</div>
          <Kopieren text={fall.fall || ""} was="Fallnummer" ui={ui} />
          <div>Offen bis {zeitText(fall.gueltigBis) || `${ANTRAG_STUNDEN} Stunden nach dem Antrag`}. Nenne die Fallnummer den beiden Leitungen,
            wenn du dich bei ihnen ausweist. Das Abschlusstoken bekommst du von der zweiten Leitung persönlich oder am Telefon
            und löst es danach hier ein; es gilt {TOKEN_MINUTEN} Minuten.</div>
        </div>}
      </>}
      {einrichtung && <>
        <EinrichtungAnzeige geheimnis={einrichtung.geheimnis} otpauth={einrichtung.otpauth} ui={ui} />
        <p style={TEXT}>Danach den ersten Code aus der App und deinen Zugangscode eingeben. Bis dahin bleibt diese Anzeige stehen,
          auch wenn du den Bereich verlässt; ohne Bestätigung ist ein neuer Antrag mit zwei Leitungen nötig.</p>
      </>}
      <Geheimfeld ui={ui} maske={maske} label="Zugangscode" hint="Dein bisheriger Zugangscode. Er wird von dieser Seite nirgends gespeichert und bei jedem Schritt neu abgefragt."
        wert={zugangscode} setWert={setZugangscode} />
      {!einrichtung && modus === AKTION.einloesen &&
        <Geheimfeld ui={ui} maske={maske} label="Abschlusstoken" hint={`Genau so, wie du es von der Leitung erhalten hast (Groß- und Kleinschreibung zählt). Gilt ${TOKEN_MINUTEN} Minuten.`}
          wert={token} setWert={setToken} />}
      {einrichtung &&
        <ui.Field label="Erster Code aus der App" hint="Sechs Ziffern.">
          <ui.Inp {...EINMAL} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} /></ui.Field>}
      <MaskeSchalter ui={ui} maske={maske} />
      <Meldung m={meldung} />
      {frage
        ? <VerwerfenFrage ui={ui} was="Das Geheimnis" folge="Es lässt sich nicht erneut anzeigen. Ohne Bestätigung ist ein neuer Antrag mit zwei Leitungen nötig."
          ja={() => { halter.setzen("einrichtung", null); setFrage(false); }} zurueck={() => setFrage(false)} />
        : <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <ui.Btn type="submit" kind="primary" disabled={laeuft}>{laeuft ? "Wird geprüft …" : knopf}</ui.Btn>
          {fall && !einrichtung && <ui.Btn type="button" onClick={() => halter.setzen("fall", null)}>Ausblenden</ui.Btn>}
          {einrichtung && <ui.Btn type="button" onClick={() => setFrage(true)}>Geheimnis verwerfen</ui.Btn>}
        </div>}
    </form>);
}

/* ------------------------------------------------------------------------ Leitung */

const LEER = { zugangscode: "", code: "", fall: "", personalnummer: "", verfahren: "", aktenzeichen: "", grund: "" };

function Freigabe({ ui, gesperrt, sperren }) {
  const h = useHalter();
  const maske = useMaske();
  const [modus, setModus] = useState(AKTION.freigeben);
  const [f, setF] = useState(LEER);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState(null);
  const [lokal, setLokal] = useState(null);         // Ergebnis ohne Einmalwert (erste Freigabe, Ablehnung)
  const [frage, setFrage] = useState(false);
  const ergebnis = h.freigabe || lokal;             // { stufe, traeger, freigabe, gueltigBis } — nur aus der Serverantwort
  const setze = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const wahl = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const tokenOffen = !!h.freigabe;

  const abschicken = async (e) => {
    e.preventDefault();
    if (laeuft || tokenOffen) return;
    setLaeuft(true); setMeldung(null); halter.quittieren();
    const a = await verlustSenden(modus, f);
    setLaeuft(false);
    if (a.art === "eingabe") {      // Form falsch: nichts abgeschickt, nur die Einmalwerte leeren
      setF((x) => ({ ...x, zugangscode: "", code: "" })); setMeldung({ art: "fehler", text: a.text }); return;
    }
    if (a.art === "ok") {          // Erfolg: alles leeren; ein Token kommt in den Halter
      setF(LEER);
      if (a.daten.stufe === "freigegeben") { setLokal(null); halter.setzen("freigabe", a.daten); } else setLokal(a.daten);
      return;
    }
    setF((x) => ({ ...x, zugangscode: "", code: "", personalnummer: "" }));      // Misserfolg: Einmalwerte und Nummer leeren
    if (a.art === "nicht-verfuegbar") { sperren(); return; }
    setMeldung({ art: "fehler", text: a.text });
  };

  if (gesperrt && !tokenOffen) return null;

  const ablehnen = modus === AKTION.ablehnen;
  const kontrolle = ergebnis ? traegerZeile(ergebnis.traeger) : "";
  const abgelaufen = h.abgelaufen === "freigabe" ? ABLAUF_TEXT.freigabe : null;
  return (
    <form onSubmit={abschicken} style={ABSTAND} autoComplete="off" noValidate>
      <style>{MASKE_STIL}</style>
      {abgelaufen && <div role="alert" style={{ ...TEXT, fontWeight: 600 }}>{abgelaufen}</div>}
      <p style={TEXT}><strong>Vier-Augen-Prinzip:</strong> Zwei Leitungen desselben Betriebs müssen den Antrag unabhängig voneinander freigeben,
        jede mit eigenem Zugangscode, frischem Code aus der eigenen App und eigener Prüfung der Identität. Die beiden Leitungen dürfen
        nicht derselben Einheit angehören. Eine eigene Freigabe ist nicht möglich.
        Die zweite Freigabe ergibt ein Abschlusstoken, das du persönlich oder am Telefon übergibst, nie per E-Mail allein.</p>
      {ergebnis && ergebnis.stufe === "teilfreigegeben" && <div style={KASTEN} role="status">
        <div><strong>Deine Freigabe ist gespeichert.</strong> Es fehlt noch die Freigabe einer zweiten Leitung.</div>
        {kontrolle && <div>Geprüfte Person laut System: {kontrolle}. Stimmt das nicht mit der Person überein, die vor dir steht,
          melde es der Organisationsleitung.</div>}
      </div>}
      {ergebnis && ergebnis.stufe === "freigegeben" && <div style={KASTEN} role="status" data-einmal="token">
        <div><strong>Zweite Freigabe erteilt.</strong> Abschlusstoken (erscheint nur dieses eine Mal):</div>
        <div style={{ ...MONO, fontSize: 15, fontWeight: 600 }}>{ergebnis.freigabe}</div>
        <Kopieren text={ergebnis.freigabe} was="Abschlusstoken" ui={ui} />
        <div>Gilt bis {zeitText(ergebnis.gueltigBis) || `${TOKEN_MINUTEN} Minuten nach der Freigabe`}. Erst nach der Identitätsprüfung
          persönlich oder telefonisch an die Person übergeben, nie per E-Mail allein.</div>
        {kontrolle && <div>Geprüfte Person laut System: {kontrolle}.</div>}
        <div><strong>Stimmt der angezeigte Name nicht mit der geprüften Person überein, gib das Token nicht weiter.</strong></div>
        <div>Die Anzeige bleibt stehen, bis du sie ausblendest, höchstens {TOKEN_MINUTEN} Minuten. Bis dahin ist keine weitere Freigabe möglich.</div>
      </div>}
      {ergebnis && ergebnis.stufe === "abgelehnt" && <div style={KASTEN} role="status">
        <div><strong>Der Antrag ist abgelehnt.</strong></div>
        {kontrolle && <div>Betroffene Person laut System: {kontrolle}.</div>}
      </div>}
      <Wahl legende="Was möchtest du tun?" name="verlust-freigabe-modus" wert={modus} setWert={setModus}
        liste={[{ wert: AKTION.freigeben, text: "Antrag freigeben" }, { wert: AKTION.ablehnen, text: "Antrag ablehnen" }]} />
      <Geheimfeld ui={ui} maske={maske} label="Dein Zugangscode" hint="Dein eigener Zugangscode, nicht der der antragstellenden Person. Wird von dieser Seite nirgends gespeichert."
        wert={f.zugangscode} setWert={(v) => setF((x) => ({ ...x, zugangscode: v }))} />
      <ui.Field label="Frischer Code aus deiner App" hint="Sechs Ziffern, jeder Code gilt einmal. Kein Wiederherstellungscode.">
        <ui.Inp {...EINMAL} inputMode="numeric" value={f.code} onChange={setze("code")} /></ui.Field>
      <ui.Field label="Fallnummer" hint="Die Fallnummer, die dir die antragstellende Person nennt (F- und 16 Zeichen).">
        <ui.Inp {...EINMAL} autoCapitalize="characters" value={f.fall} onChange={setze("fall")} /></ui.Field>
      <ui.Field label="Personalnummer der geprüften Person"
        hint="Nachschlagen in den eigenen Unterlagen über die geprüfte Person, nie vom Antragsteller nennen lassen.">
        <ui.Inp {...EINMAL} value={f.personalnummer} onChange={setze("personalnummer")} /></ui.Field>
      {ablehnen
        ? <Wahl legende="Grund der Ablehnung" name="verlust-grund" liste={ABLEHNUNGSGRUENDE} wert={f.grund} setWert={wahl("grund")} />
        : <>
          <Wahl legende="Verfahren der Identitätsprüfung" name="verlust-verfahren" liste={VERFAHREN} wert={f.verfahren}
            setWert={wahl("verfahren")} />
          <ui.Field label="Aktenzeichen (freiwillig)" hint="Verweis auf deine Unterlagen zur Prüfung, keine Personendaten.">
            <ui.Inp {...EINMAL} value={f.aktenzeichen} onChange={setze("aktenzeichen")} /></ui.Field>
        </>}
      <MaskeSchalter ui={ui} maske={maske} />
      <Meldung m={meldung} />
      {frage
        ? <VerwerfenFrage ui={ui} was="Das Abschlusstoken" folge="Es lässt sich nicht erneut anzeigen. Ohne Token muss der Fall neu freigegeben werden."
          ja={() => { halter.setzen("freigabe", null); setFrage(false); }} zurueck={() => setFrage(false)} />
        : <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <ui.Btn type="submit" kind="primary" disabled={laeuft || tokenOffen}>{laeuft ? "Wird geprüft …" : ablehnen ? "Antrag ablehnen" : "Antrag freigeben"}</ui.Btn>
          {tokenOffen && <ui.Btn type="button" onClick={() => setFrage(true)}>Token ausblenden</ui.Btn>}
          {!tokenOffen && lokal && <ui.Btn type="button" onClick={() => { setLokal(null); setMeldung(null); setF(LEER); }}>Ausblenden</ui.Btn>}
        </div>}
    </form>);
}

/* ------------------------------------------------------------------------ Einhängepunkt */

/**
 * Die beiden Wege unter dem zweiten Faktor des eigenen Zugangscodes. Ein Weg ist erst offen, wenn man ihn aufklappt
 * (Zuklappen löscht seine Eingaben, nicht aber einen angezeigten Einmalwert: der liegt im Halter und sperrt das Zuklappen).
 * Meldet der Server „nicht verfügbar", sind beide gesperrt.
 * @param {{ui: any, start?: "traeger"|"leitung"|null}} p
 */
export function VerlustWeg({ ui, start = null }) {
  const [offen, setOffen] = useState(start);
  const [gesperrt, setGesperrt] = useState(false);
  const h = useHalter();
  const haelt = !schliessenErlaubt(h);
  const aktiv = haltenderWeg(h) || offen;           // ein gehaltener Einmalwert hält seinen Weg offen
  const sperren = () => setGesperrt(true);
  const knopf = (id, text) => (
    <button type="button" aria-expanded={aktiv === id} aria-controls={`verlust-${id}`} onClick={() => setOffen(aktiv === id ? null : id)}
      disabled={gesperrt || haelt} style={{ ...TAST, opacity: gesperrt || haelt ? 0.55 : 1, cursor: gesperrt || haelt ? "default" : "pointer" }}>{text}</button>);
  return (
    <div style={{ display: "grid", gap: 10, minWidth: 0 }} data-verlustweg="">
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Zugang verloren?</h3>
      {gesperrt
        ? <p role="status" style={TEXT}>{TEXT_NICHT_VERFUEGBAR}</p>
        : <p style={TEXT}>Nur für Zugänge mit eingerichtetem zweitem Faktor (Leitung, Planung, Kunde).</p>}
      {haelt && <p role="status" style={{ ...TEXT, fontWeight: 600 }}>Ein Wert wird nur einmal angezeigt. Bitte zuerst sichern und ausblenden, dann lässt sich
        dieser Bereich schließen.</p>}
      {knopf("traeger", "Ich habe Gerät und Codes verloren")}
      {aktiv === "traeger" && <div id="verlust-traeger"><Traeger ui={ui} gesperrt={gesperrt} sperren={sperren} /></div>}
      {knopf("leitung", "Ich bin Leitung und gebe einen Antrag frei")}
      {aktiv === "leitung" && <div id="verlust-leitung"><Freigabe ui={ui} gesperrt={gesperrt} sperren={sperren} /></div>}
    </div>);
}

/* Für die Prüfungen (Wiedergabe ohne Browser). */
export { Traeger as VerlustTraeger, Freigabe as VerlustFreigabe };
