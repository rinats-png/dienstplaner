/* WP-I16 Teil 1: Aktionen der Intelligence-Steuerung (Oberfläche: src/ansichten/ki-steuerung.jsx).
   Leitung: Hauptschalter, Funktionen, Frage — über den gewohnten Speicherweg (mUpd, PUT /api/bestand).
   Betriebsrat: ausschließlich die Pause. Er speichert sonst nie von selbst (App.jsx), deshalb schreibt diese
   Aktion sofort und nur diese eine Änderung; der Server prüft Rolle und Inhalt (rechte.mjs), nicht die Oberfläche.
   Wann und von wem, setzt der Server; mitgeschickte Werte zählen nie. */
import * as SP from "../speicher.js";

const mitSteuerung = (m, fn) => ({ ...m, einstellungen: { ...(m.einstellungen || {}), kiSteuerung: fn((m.einstellungen || {}).kiSteuerung || {}) } });

export function kiSteuerungAktionen(k) {
  const { mUpd, melde, ref, upd } = k;
  return {
    setzeKiSteuerung: (absicht) => mUpd((m) => mitSteuerung(m, (s) => {
      const aus = { ...s };
      if (absicht.betrieb) aus.betrieb = { ...(s.betrieb || {}), ...absicht.betrieb };
      if (absicht.funktionen) aus.funktionen = { ...(s.funktionen || {}), ...Object.fromEntries(Object.entries(absicht.funktionen)
        .map(([id, w]) => [id, { ...((s.funktionen || {})[id] || {}), ...w }])) };
      if (absicht.betriebsratFrage) aus.betriebsratFrage = { ...(s.betriebsratFrage || {}), ...absicht.betriebsratFrage };
      return aus;
    }), "Intelligence-Steuerung geändert"),
    setzeKiPause: (aktiv) => {
      const s = ref && ref.current;
      if (!s || !s.session || !s.mandanten) return;
      const neu = (d) => ({ ...d, mandanten: d.mandanten.map((m) => (m.id === d.session.mandantId
        ? mitSteuerung(m, (st) => ({ ...st, pause: { ...(st.pause || {}), aktiv: !!aktiv } })) : m)) });
      upd((d) => neu(d));
      SP.schreib(neu(s), { durch: "Betriebsrat", sofort: true,
        onFehler: () => melde("Die Pause konnte nicht gespeichert werden."),
        onKonflikt: () => melde("Der Betrieb wurde zwischenzeitlich geändert. Bitte neu laden."),
        onGespeichert: () => melde(aktiv ? "Intelligence ist pausiert." : "Die Pause ist aufgehoben.") });
    },
  };
}
