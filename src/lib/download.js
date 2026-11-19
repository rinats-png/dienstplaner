/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */

export function lade(name, inhalt, typ) {
  try {
    const blob = inhalt instanceof Uint8Array ? new Blob([inhalt], { type: typ }) : new Blob([inhalt], { type: typ });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) { return false; }
}
