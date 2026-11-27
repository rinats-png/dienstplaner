/* WP-I16: Aktionen der Intelligence-Steuerung (Oberfläche: src/ansichten/ki-steuerung.jsx).
   Leitung: Hauptschalter, Funktionen, Frage, Pause (Betriebsrat) und Leitung-Pause aufheben (mit dem Stempel der gesehenen Pause) — schreibt sofort
   (PUT /api/bestand) und meldet „geändert“ erst, wenn der zurückgelesene Serverstand die Änderung zeigt.
   Betriebsrat: ausschließlich die Pause setzen (Variante A). Er speichert sonst nie von selbst (App.jsx), deshalb schreibt diese
   Aktion sofort und nur diese eine Änderung; der Server prüft Rolle und Inhalt (rechte.mjs), nicht die Oberfläche.
   Wann und von wem, setzt der Server; mitgeschickte Werte zählen nie. */
import * as SP from "../speicher.js";

const mitSteuerung = (m, fn) => ({ ...m, einstellungen: { ...(m.einstellungen || {}), kiSteuerung: fn((m.einstellungen || {}).kiSteuerung || {}) } });

/** Die Absicht auf den Stand der Steuerung legen (genau die Teile, die der Server annimmt: betrieb, funktionen, betriebsratFrage, pause, leitungPause). */
export function kiAbsichtAnwenden(s, absicht) {
  const aus = { ...s };
  if (absicht.betrieb) aus.betrieb = { ...(s.betrieb || {}), ...absicht.betrieb };
  if (absicht.funktionen) aus.funktionen = { ...(s.funktionen || {}), ...Object.fromEntries(Object.entries(absicht.funktionen)
    .map(([id, w]) => [id, { ...((s.funktionen || {})[id] || {}), ...w }])) };
  if (absicht.betriebsratFrage) aus.betriebsratFrage = { ...(s.betriebsratFrage || {}), ...absicht.betriebsratFrage };
  if (absicht.pause) aus.pause = { ...(s.pause || {}), ...absicht.pause };
  if (absicht.leitungPause) aus.leitungPause = { ...(s.leitungPause || {}), ...absicht.leitungPause };
  return aus;
}

/** Hat der Server die Absicht wirklich übernommen? Geprüft am zurückgelesenen Stand; fehlt er oder weicht ein Wert ab: nein (fail closed). */
export function kiSteuerungBestaetigt(absicht, stand) {
  if (!absicht || typeof absicht !== "object" || !stand || typeof stand !== "object") return false;
  const gleich = (soll, ist, feld) => !!ist && typeof ist === "object" && ist[feld] === soll[feld];
  if (absicht.betrieb && !gleich(absicht.betrieb, stand.betrieb, "an")) return false;
  if (absicht.betriebsratFrage && !gleich(absicht.betriebsratFrage, stand.betriebsratFrage, "antwort")) return false;
  if (absicht.pause && !gleich(absicht.pause, stand.pause, "aktiv")) return false;
  if (absicht.leitungPause && !gleich(absicht.leitungPause, stand.leitungPause, "aktiv")) return false;
  if (absicht.funktionen) {
    for (const [id, w] of Object.entries(absicht.funktionen)) if (!gleich(w, (stand.funktionen || {})[id], "an")) return false;
  }
  return true;
}

export function kiSteuerungAktionen(k) {
  const { melde, ref, upd } = k;
  const mitServerstand = (d, id, serverStand) => ({ ...d, mandanten: d.mandanten.map((m) => (m.id === id ? mitSteuerung(m, () => serverStand || {}) : m)) });
  return {
    /* Nicht „geändert“, bevor der Server es bestätigt hat: Nach dem Speichern wird der Stand zurückgelesen und mit der Absicht
       verglichen. Wirkt die Absicht nicht (Recht fehlt, Stempel veraltet), steht das sichtbar da und die Oberfläche zeigt den Stand des Servers. */
    setzeKiSteuerung: (absicht) => {
      const s = ref && ref.current;
      if (!s || !s.session || !s.mandanten || !absicht || typeof absicht !== "object") return;
      const id = s.session.mandantId;
      const neu = (d) => ({ ...d, mandanten: d.mandanten.map((m) => (m.id === id ? mitSteuerung(m, (st) => kiAbsichtAnwenden(st, absicht)) : m)) });
      upd((d) => neu(d));
      const pruefen = async () => {
        let stand = null, gelesen = false;
        try {
          const bestand = await SP.liesZumVergleich();
          const m = Array.isArray(bestand.mandanten) ? bestand.mandanten.find((x) => x.id === id) : null;
          stand = m && m.einstellungen ? m.einstellungen.kiSteuerung || null : null;
          gelesen = true;
        } catch { gelesen = false; }
        if (gelesen && kiSteuerungBestaetigt(absicht, stand)) { melde("Intelligence-Steuerung geändert."); return; }
        if (!gelesen) { melde("Ob der Server die Änderung übernommen hat, ließ sich nicht bestätigen. Bitte neu laden und prüfen."); return; }
        if (stand) upd((d) => mitServerstand(d, id, stand));
        melde("Der Server hat die Änderung nicht übernommen. Es gilt der gespeicherte Stand; bitte neu laden und prüfen.");
      };
      SP.schreib(neu(s), { durch: "Leitung", sofort: true,
        onFehler: () => melde("Die Änderung konnte nicht gespeichert werden."),
        onKonflikt: () => melde("Der Betrieb wurde zwischenzeitlich geändert. Bitte neu laden."),
        onGespeichert: () => { pruefen(); } });
    },
    setzeKiPause: (aktiv) => {
      const s = ref && ref.current;
      if (!s || !s.session || !s.mandanten) return;
      const neu = (d) => ({ ...d, mandanten: d.mandanten.map((m) => (m.id === d.session.mandantId
        ? mitSteuerung(m, (st) => ({ ...st, pause: { ...(st.pause || {}), aktiv: !!aktiv } })) : m)) });
      upd((d) => neu(d));
      SP.schreib(neu(s), { durch: "Betriebsrat", sofort: true,
        onFehler: () => melde("Die Pause konnte nicht gespeichert werden."),
        onKonflikt: () => melde("Der Betrieb wurde zwischenzeitlich geändert. Bitte neu laden."),
        onGespeichert: () => melde("Intelligence ist pausiert.") });
    },
  };
}
