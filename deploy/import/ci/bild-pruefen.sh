#!/usr/bin/env bash
# IMP-3: Integrationsprüfung am tatsächlich gebauten Laufzeit-Image.
#
# Erwartet: BILD (lokal gebautes App-Bild) und docker im PATH.
# Prüft am Bild, nicht am Quellbaum:
#   1. SheetJS lädt aus /app/vendor/sheetjs/xlsx.mjs
#   2. Der Parser liest eine echte XLSX im Kindprozess und liefert Blätter
#   3. Der Server startet ohne Netz, die Gesundheitsprüfung wird grün
#   4. /api/import/upload ist im ausgelieferten Zustand AUS: ohne
#      CENTRIC_IMPORT_AKTIV=true antwortet der Weg 404, bevor ein Rumpf gelesen
#      wird (fail-closed; pruefungen/import-schalter.test.js). Das eingeschaltete
#      Routing prüfen pruefungen/import-sonden.test.js und import-rumpfgrenze.test.js.
# Geheimnisse entstehen je Lauf neu und liegen nur in einer Wegwerfdatei.
set -euo pipefail

: "${BILD:?BILD fehlt}"

T="$(mktemp -d)"
NAME="imp-bild-$$"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$T"
}
trap cleanup EXIT

fehl() { echo "IMPORT-BILD: FEHLER - $*" >&2; exit 1; }
ok() { echo "IMPORT-BILD: ok - $*"; }

BILD_ID="$(docker image inspect --format '{{.Id}}' "$BILD")" \
  || fehl "Bild $BILD nicht gefunden"

# --- 1 und 2: SheetJS laden, echte XLSX parsen (ohne Netz, Lesezugriff) ---
PRUEFCODE='
const X = await import("/app/vendor/sheetjs/xlsx.mjs");
const wb = X.utils.book_new();
X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["Name", "Personalnummer"], ["Probe", "1001"]]), "Personal");
const buf = X.write(wb, { type: "buffer", bookType: "xlsx" });
const { parseDatei } = await import("/app/server/lib/import/parser.mjs");
const r = await parseDatei({ buffer: new Uint8Array(buf), name: "probe.xlsx" });
const blaetter = Array.isArray(r.blaetter) ? r.blaetter.length : -1;
console.log(JSON.stringify({ sheetjs: typeof X.version, ok: r.ok === true, blaetter }));
process.exit(r.ok === true && blaetter > 0 ? 0 : 1);
'
ergebnis="$(docker run --rm --network none --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --entrypoint node "$BILD_ID" \
  --input-type=module -e "$PRUEFCODE")" || fehl "Parser oder SheetJS im Bild: $ergebnis"
ok "SheetJS geladen, Parser liest echte XLSX ($ergebnis)"

# --- 3: Server starten, Gesundheit abwarten ---
PFEFFER="$(openssl rand -base64 32)"
ADMIN="$(openssl rand -hex 24)"
printf 'CENTRIC_PFEFFER=%s\nCENTRIC_ADMIN=%s\nCENTRIC_BASIS=http://127.0.0.1:3000\n' \
  "$PFEFFER" "$ADMIN" >"$T/prod.env"
chmod 600 "$T/prod.env"
mkdir -p "$T/daten"

docker run -d --name "$NAME" --network none --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" \
  --env-file "$T/prod.env" -v "$T/daten:/data" "$BILD_ID" >/dev/null \
  || fehl "Server-Container startet nicht"

gesund=""
for _ in $(seq 1 60); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo fehlt)"
  if [[ "$status" == "healthy" ]]; then gesund=ja; break; fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$NAME" 2>/dev/null)" != "true" ]]; then break; fi
  sleep 2
done
if [[ "$gesund" != "ja" ]]; then
  docker logs "$NAME" 2>&1 | tail -n 20 >&2 || true
  fehl "Server nicht healthy (Zustand: ${status:-unbekannt})"
fi
ok "Server läuft, Gesundheitsprüfung grün"

# --- 4: Import ausgeliefert AUS (CENTRIC_IMPORT_AKTIV nicht gesetzt) ---
antwort="$(docker exec "$NAME" node -e "
  const get = async (p, m) => (await fetch('http://127.0.0.1:3000' + p, { method: m })).status;
  get('/api/import/upload', 'POST')
    .then((u) => { console.log(u); process.exit(u === 404 ? 0 : 1); })
    .catch(() => process.exit(1));
")" || fehl "Import-Endpunkt nicht wie erwartet (Antwort: ${antwort:-keine})"
ok "/api/import/upload ohne Schalter aus (Status $antwort)"

echo "IMPORT-BILD: alle Prüfungen bestanden"
