# WP-I17 (Teilstand) – Nachweis: Intelligence-Oberfläche Grundlage

Branch `feature/intelligence-gateway` · Agent: Sonnet · Stand 2026-11-06 · **Eigenständige Komponenten, in `App.jsx` NICHT eingehängt, kein Serverweg.** Plan: `INTELLIGENCE-ENTWICKLUNGSPLAN.md` I17.

## Statusstufen (ehrlich)

| Stufe | Stand |
|---|---|
| implementiert | **teilweise** — Komponente „KI-Entwurf“, Client, Hook, Texte; **nicht** enthalten: Thinking Orb (Paket vorher prüfen und pinnen), Einhängepunkte in `App.jsx`, Serverrouten `/ki/*` |
| lokal getestet | **ja** — `pruefungen/intelligence-oberflaeche.test.js` 28 Tests; `gestalt`, `kontrast`, `v4-tokens`, `konsistenz` (285) unverändert grün |
| reviewt / integriert / produktiv | **nein** |

## Dateien

Neu: `src/ansichten/intelligence/{KiEntwurf.jsx, ki-client.js, useKiVorgang.js, texte.js}`, `pruefungen/intelligence-oberflaeche.test.js`, diese Datei. Nicht geändert: `src/App.jsx`, `server.mjs`, CSP.

## Einhängepunkt (Snippet für den Besitzer von `App.jsx`, erst nach WP-I12/I13-Route)

```jsx
import { KiEntwurf } from "./ansichten/intelligence/KiEntwurf.jsx";
import { kiClient } from "./ansichten/intelligence/ki-client.js";
import { useKiVorgang } from "./ansichten/intelligence/useKiVorgang.js";

const ki = kiClient({ fetchFn: (u, i) => fetch(u, i) });          // einmal, außerhalb der Komponente

function BefundErklaerer({ rolle, datum, personId, aufloesen }) {   // z. B. Panel an einem Planbefund (F2)
  const v = useKiVorgang(ki);
  return (
    <div>
      <button type="button" onClick={() => v.starten({ funktion: "F2", eingabe: { zeitraum: { von: datum, bis: datum } }, bezug: { datum, personId } })}>
        Erklären
      </button>
      <KiEntwurf rolle={rolle} zustand={v.zustand} antwort={v.antwort} fehlercode={v.fehlercode} titel="Erklärung"
        aufloesen={(typ, id) => (typ === "person" ? nameVon(id) : null)} />
    </div>);
}
```
`aufloesen` muss aus der **eigenen Sicht der Rolle** antworten (die Oberfläche kennt nur, was `bestandFuerRolle` ihr liefert). Der Knopf selbst erscheint nur, wenn die Rolle die Funktion auslösen darf (Rechte prüft der Server; die Komponente zeigt zusätzlich nichts für andere Rollen).

## Zustände

| Zustand | Darstellung |
|---|---|
| `leer` | „Dazu liegt gerade kein Vorschlag vor.“ |
| `laedt` | `aria-busy`, `role="status"`, `aria-live="polite"`: „Intelligence arbeitet …“ |
| `fertig` | **„KI-Entwurf“ · „Nicht veröffentlicht“**, Text (Platzhalter aufgelöst), Hinweis „Vorschlag, kein Beschluss“ |
| `rueckfall` | „Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar. Die Planung funktioniert unverändert.“ |
| `fehler` | `role="alert"`, fester Text je Code (`KI_AUS`, `KI_PAUSIERT`, `KI_FUNKTION`, `KI_ROLLE`, `KI_LIMIT`, `KI_KONTINGENT`, `KI_GROESSE`, `KI_EINGABE`, `KI_LECK`), sonst allgemeiner Text |

## Invarianten

- **O1 Rollensicht**: nur Leitung, Planung, Beschäftigte; Betriebsrat, Betreiber, Schichtverantwortung, Kunde und jede unbekannte Rolle bekommen in **jedem** Zustand eine leere Ausgabe (Test: 10 Rollen × 5 Zustände).
- **O2 Kennzeichnung**: eine fertige Antwort wird nur gezeigt, wenn sie das Antwort-Schema besteht **und** `kiGestuetzt: true`, `entwurf: true`, `veroeffentlicht: false`, `geprueft: true` trägt; sonst „Antwort nicht anzeigbar“ (12 Gegenproben). Keine Schaltfläche, kein Link, kein Formular.
- **O3 Nur Text**: React-Escaping, kein `dangerouslySetInnerHTML`/`innerHTML`; Platzhalter `{{person|einheit|objekt|dienst:<kennung>}}` werden ausschließlich über die vom Aufrufer gelieferte `aufloesen` ersetzt (auch deren Rückgabe wird maskiert; Wurf oder Nicht-Text → neutraler Text).
- **O4** Fehlertexte sind fest, nie Code/Anbieter/Token/Modell/Preis.
- **O5** Barrierefreiheit: `role`/`aria-live`/`aria-busy`; Farbe nur `currentColor` (kein fester Farbwert, Kontrast folgt dem Umfeld); jede Aussage als Text.
- **O6** Kein `console.*`, kein Browser-Speicher, kein Netz in Komponente und Hook.
- **C1** Der Client ruft nur Pfade unter `/ki/` (`CSP connect-src 'self'` bleibt), same-origin, keine absolute Adresse; **C2** jede Antwort wird gegen Schema und Kennzeichnung geprüft; **C3** der Client wirft nie (Netz-/JSON-/HTTP-Fehler → Zustand `fehler`); **C4** Abfragen enden nach 130 s.
- Statisch: keine Anbieter-/Modellnamen, keine Schlüsselmuster, keine absoluten URLs in `src/ansichten/intelligence`; `App.jsx` kennt den Ordner (noch) nicht.

## Nicht enthalten / offen

- **Thinking Orb** (CI 5.4: „Paket vorher prüfen und pinnen“): bewusst nicht gebaut — Fremdpaket, braucht Supply-Chain-Prüfung.
- **Serverpfade** `/ki/anfrage` (POST) und `/ki/auftrag/<id>` (GET) sind ein **Entwurf** des Clients; die Route `server/funktionen/ki.mjs` existiert nicht (Auftrag: nicht anlegen).
- **Tastaturbedienung** der späteren Knöpfe liegt im Einhängepunkt, nicht in der Komponente (sie hat keine interaktiven Elemente).
- **Bausteintexte**: die Komponente zeigt Bausteine nur, wenn der Aufrufer `bausteinText` liefert — der Baustein-Katalog ist fachlich offen (wpI-offene-fragen.md Nr. 3).
- **Texte** sind Entwurf, nicht mit Produkt/Mitbestimmung abgestimmt (Nr. 22).
- Pro Funktion eigene Eingabemasken (F1/F2/F5/F9 …) gehören zu WP-I22ff. und brauchen WP-I12.

- O1 verschärft (Runde 3): `KiEntwurf` bekommt `funktion`; Beschäftigte sehen nur `F9`. **C5/C6**: Auftragskennung wird geprüft, `kiClient` sendet einen gültigen Bearer-Kopf aus `kopf()` (Einhängepunkt: `kopf` aus `src/speicher.js`, dort modulprivat; Vorschlag `export { kopf as authKopf }`). Server-Invariante für die Route `/ki`: siehe `wp-i13-nachweis.md` (Runde 3).
