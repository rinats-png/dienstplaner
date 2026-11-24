/* ==========================================================================
   SKILL-PRUEFEN — liest fremde Skills, Plugins und Agentenanweisungen NUR.

   Pflicht vor der Übernahme fremder Skills/Plugins/Agentenanweisungen.
   Das Werkzeug ersetzt keine menschliche Prüfung. Es liefert Dateiliste,
   SHA-256 je Datei, Textmuster mit Fundstelle und eine Sperrdatei.

   Was es NICHT tut: Code ausführen, Netz nutzen, Prozesse starten, fremde
   Dateien ändern, Symlinks folgen. Es liest und hasht Dateien. Einziger
   Schreibzugriff: die Sperrdatei bei --sperre-schreiben (nie überschreibend).

   Urteil: immer "MENSCHLICHE PRÜFUNG ERFORDERLICH". Es gibt kein "sicher".
   Keine Funde heißt nicht sicher. Prompt-Injection im Fließtext ist nicht
   zuverlässig erkennbar.

   Aufruf:  node werkzeug/skill-pruefen.mjs <Verzeichnis oder Datei>
              [--sperre <skill.lock.json> [--sperre-schreiben]]
              [--ohne <Name>]... [--json]
   Exit:    0 Lauf ok (Funde vorhanden oder nicht; das ist KEIN Freispruch)
            1 Fehler, Grenzüberschreitung, Symlink, Aufruffehler oder
              Abweichung von der Sperrdatei

   Quelle des Prinzips: skill-audit.mjs und skill-lock.mjs aus dem Projekt
   Kordant (MIT-Lizenz): lesende Heuristik, Urteil immer menschliche Prüfung,
   SHA-256-Sperre je Datei. Muster, Grenzen, Maskierung, Hash-Regeln und
   Quelltext sind eine eigene Umsetzung für CENTRIC. Keine Zeile ist kopiert.
   ========================================================================== */
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const URTEIL = "MENSCHLICHE PRÜFUNG ERFORDERLICH";
export const WARNUNG = "keine Funde heißt nicht sicher; Prompt-Injection im Fließtext ist nicht zuverlässig erkennbar";

/** Grenzen gegen Überlast. Wer sie überschreitet, bekommt Exit 1 und keine Teilauswertung. */
export const GRENZEN = Object.freeze({
  dateien: 2000,
  eintraege: 6000,
  dateiBytes: 5 * 1024 * 1024,
  gesamtBytes: 64 * 1024 * 1024,
  tiefe: 20,
  zeilenLaenge: 20000,
  fundeJeDatei: 200,
  fundeGesamt: 2000,
  kommentarLaenge: 200000,
});

export const GRENZEN_TEXT = Object.freeze([
  "Keine Funde heißt nicht sicher. Prompt-Injection im Fließtext ist nicht zuverlässig erkennbar.",
  "Es sind einfache Textmuster. Wer sie kennt, umgeht sie (Umschreibung, Aufteilung, andere Sprache, Kodierung).",
  "Echte Binärdateien werden nur gehasht, nicht durchsucht. Eine Datei mit Textendung oder UTF-16-Kopf, die als binär erkannt wird, wird gemeldet (auffaellig) und nur nach Entfernen der NUL-Bytes durchsucht (unsicher).",
  `Zeilen über ${GRENZEN.zeilenLaenge} Zeichen werden nur gekürzt geprüft und gemeldet. HTML-Kommentare werden bis ${GRENZEN.kommentarLaenge} Zeichen Inhalt geprüft.`,
  "Wortregeln (token, credentials, api key, system prompt) ergeben je Datei einen Fund mit Anzahl der Zeilen.",
  "Werden Funde unterdrückt (Grenze je Datei oder gesamt), meldet das Werkzeug UNVOLLSTÄNDIG und gibt 1 zurück. Auffällige Funde bleiben vor Hinweisen erhalten.",
  "Es wird nichts ausgeführt und nichts aus dem Netz gelesen. Quelle, Version und Lizenz prüft ein Mensch.",
  "Abhängigkeiten (npm-/pip-Pakete, Downloads), die der Skill erst nachlädt, werden NICHT geprüft.",
  "Die Sperrdatei sichert Pfad und Inhalt, nicht Dateirechte oder Exec-Bit.",
  "Zwischen Dateiliste und Lesen kann ein gleichzeitiger lokaler Schreibzugriff den Inhalt ändern (TOCTOU). Auf einer privaten Kopie prüfen.",
  "Ein Treffer ist ein Hinweis, kein Beweis. Ein Hash zeigt nur Gleichheit, nicht Harmlosigkeit.",
]);

/* ---------- Hash ---------- */
/* Text: Zeilenende LF-normalisiert (auf Byte-Ebene über latin1, ohne Verlust). Binär: roh. */
const LF = (s) => s.replace(/\r\n/g, "\n");
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const nulImKopf = (buf) => buf.subarray(0, 8192).includes(0);
const utf16Kopf = (buf) => (buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff);
/* Endungen, hinter denen ein Mensch Text erwartet. Ein NUL-Byte darin ist ein Verdachtsmoment. */
const TEXT_ENDUNG = /\.(?:md|markdown|txt|json|jsonc|ya?ml|toml|ini|cfg|conf|js|mjs|cjs|ts|tsx|jsx|sh|bash|zsh|ps1|psm1|bat|cmd|py|rb|pl|php|html?|css|xml|svg|csv|rst|lock)$/i;

const nachPfad = (a, b) => (a.pfad < b.pfad ? -1 : a.pfad > b.pfad ? 1 : 0);

export function gesamtHash(dateien) {
  const h = createHash("sha256");
  const sortiert = [...dateien].sort(nachPfad);
  for (const d of sortiert) h.update(`${d.pfad}\0${d.sha256}\n`);
  return h.digest("hex");
}

/* ---------- Maskierung und Ausschnitt ---------- */
/* Formatierungszeichen, die Text umdrehen oder verstecken (Bidi, Zero-Width, weicher Trennstrich usw.). */
const VERDECKT_KLASSE = "\\u202A-\\u202E\\u2066-\\u2069\\u200B-\\u200F\\u2060\\u180E\\uFEFF\\u061C\\u00AD\\u034F\\u3164\\u2028\\u2029";
/* Steuerzeichen C0 (ohne Tab und Zeilenvorschub), DEL und C1: ESC, CR, CSI usw. */
const STEUER_C0C1 = "\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F";
const TAGS = "[\\u{E0000}-\\u{E007F}]";
// eslint-disable-next-line no-misleading-character-class -- Absicht: einzelne Formatierungszeichen suchen
const STEUER_PRUEF = new RegExp(`[${VERDECKT_KLASSE}]|${TAGS}`, "u");
const STEUER_C0C1_PRUEF = new RegExp(`[${STEUER_C0C1}]`);
/* Anzeige: zusaetzlich Zeilenvorschub (in Namen), damit nichts die Ausgabe umbricht oder ueberschreibt. */
// eslint-disable-next-line no-misleading-character-class -- Absicht: einzelne Formatierungszeichen suchen
const STEUER = new RegExp(`[${VERDECKT_KLASSE}\\u0000-\\u0008\\u000A-\\u001F\\u007F-\\u009F]|${TAGS}`, "gu");

/** Ersetzt alle Zeichen, die die Anzeige verfaelschen koennten, durch <U+XXXX>. Gilt fuer Ausschnitte, Namen und Pfade. */
export function sichtbar(s) {
  return String(s).replace(STEUER, (z) => `<U+${z.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}>`);
}

/** Wendet sichtbar() auf alle Texte eines Ergebnisobjekts an (Ausgabe, nie die Sperrdatei). */
export function bereinigt(x) {
  if (typeof x === "string") return sichtbar(x);
  if (Array.isArray(x)) return x.map(bereinigt);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, bereinigt(v)]));
  return x;
}

/** Werte hinter token=/key=/secret=/password=, Bearer, bekannte Token-Formen, URL-Zugangsdaten, lange Blöcke. */
export function maskieren(s) {
  return s
    .replace(/(\/\/)([^/\s:@]{1,100}):([^/\s@]{1,200})@/g, "$1$2:***@")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi, "$1 ***")
    .replace(/(token|key|secret|passw(?:or)?d|passwort|authorization|credential)(s?["']?\s*[:=]\s*["']?)([^\s"'`,;)}\]]{3,})/gi, "$1$2***")
    .replace(/(--?(?:token|api[_-]?key|access[_-]?key|key|secret|passw(?:or)?d|passwort)\s+|\bset\s+\w*(?:token|key|secret|passw\w*)\s+|\b(?:password|passwd|passwort|token|secret|api[_-]?key)\s+)([^\s"'`,;)}\]-][^\s"'`,;)}\]]{2,})/gi, "$1***")
    .replace(/\b(?:gh[pousr]_|github_pat_|AKIA|ASIA|sk-|xox[abprs]-|AIza)[A-Za-z0-9_-]{8,}/g, (m) => `${m.slice(0, 4)}***`)
    .replace(/[A-Za-z0-9+/_-]{32,}/g, (m) => `${m.slice(0, 6)}…[maskiert ${m.length}]`);
}

function ausschnitt(zeile, re) {
  const s = maskieren(sichtbar(zeile)).trim();
  let i = 0;
  if (re) {
    const m = new RegExp(re.source, re.flags.replace("g", "")).exec(s);
    if (m) i = m.index;
  }
  const start = Math.max(0, i - 30);
  const kern = s.slice(start, start + 118);
  return `${start > 0 ? "…" : ""}${kern}${start + 118 < s.length ? "…" : ""}`;
}

/* ---------- Muster ---------- */
/* Jede Regel: id, kategorie (netz|prozess|geheimnis|konfig|injektion), schwere (hinweis|auffaellig),
   re, optional nur: "skript". Alle Ausdrücke sind linear (keine verschachtelten Wiederholungen). */
const R = (id, kategorie, schwere, re, nur) => Object.freeze({ id, kategorie, schwere, re, ...(nur ? { nur } : {}) });

export const MUSTER = Object.freeze([
  /* Netz / Abfluss */
  R("curl-wget", "netz", "auffaellig", /(?<![\w./-])(?:curl|wget)\b/i),
  R("fetch-aufruf", "netz", "hinweis", /\bfetch\s*\(/),
  R("http-adresse-mit-host", "netz", "hinweis", /\bhttps?:\/\/[A-Za-z0-9[]/i),
  R("netcat", "netz", "auffaellig", /(?<![\w./-])(?:nc|ncat|netcat)\s+[-\w.]/i),
  R("ssh-scp", "netz", "auffaellig", /(?<![\w./-])(?:ssh|scp|sftp|rsync)\s+\S/i),
  R("websocket", "netz", "hinweis", /\bWeb[S]ocket\b|\bwss?:\/\/[A-Za-z0-9]/i),
  R("netz-bibliothek", "netz", "hinweis", /\b(?:axios|XMLHttp[R]equest|Invoke-WebRequest|Invoke-RestMethod|urllib|http\.client|requests\.(?:get|post|put))\b/),
  R("netz-modul-import", "netz", "auffaellig", /(?:from|require\(|import)\s*\(?\s*["'](?:node:)?(?:https?|net|dgram|tls|http2)["']/),

  /* Prozesse / Shell */
  R("child-process", "prozess", "auffaellig", /child[_]process/),
  R("spawn-exec", "prozess", "hinweis", /\b(?:spawn|exec)\w*\s*\(/),
  R("eval-aufruf", "prozess", "auffaellig", /\beval\s*\(/),
  R("function-konstruktor", "prozess", "auffaellig", /\b(?:new\s+)?Function\s*\(/),
  R("python-prozess", "prozess", "auffaellig", /\bsubprocess\b|\bos\.(?:system|popen|exec\w*|spawn\w*)\b|\bPopen\b/),
  R("backticks-skript", "prozess", "hinweis", /`[^`\n]+`/, "skript"),
  R("befehlsersetzung-skript", "prozess", "hinweis", /\$\(/, "skript"),
  R("powershell-kodiert", "prozess", "auffaellig", /\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]{0,200}?\s-(?:e|ec|enc|encodedcommand)\b/i),
  R("base64-in-shell", "prozess", "auffaellig", /base64\s+(?:-d|-D|--decode)\b[^\n|]{0,100}\|\s*(?:ba|z|da)?sh\b/i),
  R("download-in-shell", "prozess", "auffaellig", /\b(?:curl|wget)\b[^\n|]{0,200}\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/i),
  R("invoke-expression", "prozess", "auffaellig", /\bInvoke-Expression\b|\biex\s*[\s(]/i),
  R("loeschen-rekursiv", "prozess", "hinweis", /\brm\s+-[a-z]*[rR][a-z]*f|\bRemove-Item\b[^\n]{0,80}-Recurse\b/),
  R("sudo", "prozess", "hinweis", /\bsudo\b/),

  /* Geheimnisse / Zugriffe */
  R("env-datei", "geheimnis", "hinweis", /(?:^|[\s"'`/\\(=:])\.env(?:\.[A-Za-z0-9_-]+)?(?![A-Za-z0-9_-])/),
  R("ssh-verzeichnis", "geheimnis", "auffaellig", /\.ssh(?:[/\\]|\b)|\bauthorized_keys\b/),
  R("ssh-schluessel", "geheimnis", "auffaellig", /\bid_(?:rsa|dsa|ecdsa|ed25519)\b/),
  R("credentials-wort", "geheimnis", "hinweis", /\bcredentials?\b/i),
  R("token-wort", "geheimnis", "hinweis", /\btokens?\b/i),
  R("api-key-wort", "geheimnis", "hinweis", /\bapi[_-]?keys?\b/i),
  R("aws-variable", "geheimnis", "auffaellig", /\bAWS_[A-Z0-9_]+/),
  R("github-token-variable", "geheimnis", "auffaellig", /\b(?:GITHUB_TOKEN|GH_TOKEN)\b/),
  R("variable-mit-geheimnis", "geheimnis", "hinweis", /\b[A-Z][A-Z0-9]*_(?:TOKEN|SECRET|API_KEY|ACCESS_KEY|PASSWORD)\b/),
  R("browser-keychain-pfad", "geheimnis", "auffaellig", /Library[/\\]Keychains|\.keychain\b|Login Data|\.mozilla[/\\]firefox|Google[/\\]Chrome|Chrome[/\\]User Data|Edge[/\\]User Data|\.aws[/\\]credentials|\.netrc\b|\.git-credentials|\.npmrc\b|\.kube[/\\]config|\.docker[/\\]config\.json|\.config[/\\]gcloud|Credential Manager|wallet\.dat/i),

  /* Berechtigungen / Konfiguration */
  R("rechte-umgehen", "konfig", "auffaellig", /dangerouslyDisableSandbox|--dangerously-skip-permissions|bypassPermissions|--yolo\b/),
  R("hooks", "konfig", "auffaellig", /"hooks"\s*:|\b(?:PreToolUse|PostToolUse|SessionStart|UserPromptSubmit)\b/),
  R("rechte-schluessel", "konfig", "hinweis", /"(?:permissions|allow|deny|ask|allowedTools|enabledPlugins|mcpServers|enableAllProjectMcpServers)"\s*:|\ballowedTools\b/),
  R("claude-einstellungen", "konfig", "auffaellig", /\.claude[/\\]settings(?:\.local)?\.json|~[/\\]\.claude\b/),
  R("chmod-ausfuehrbar", "konfig", "hinweis", /\bchmod\s+(?:[ugoa]*\+\w*x|[0-7]{3,4})\b/),
  R("autostart-zeitplan", "konfig", "auffaellig", /\b(?:crontab|schtasks|launchctl|launchd|LaunchAgents|LaunchDaemons|Register-ScheduledTask|New-ScheduledTask)\b|systemctl\s+(?:--user\s+)?enable\b|@reboot|CurrentVersion[\\/]Run|[/\\]etc[/\\]cron/i),
  R("shell-profil", "konfig", "hinweis", /\.(?:bashrc|zshrc|bash_profile|zprofile)\b|\bcron(?:job)?\b/i),

  /* Hinweise auf Anweisungen an Agenten */
  R("anweisungen-ignorieren", "injektion", "auffaellig", /\b(?:ignore|disregard|forget|override)\b[^\n]{0,40}\b(?:previous|prior|above|earlier|all|any|your)\b[^\n]{0,30}\b(?:instructions?|rules?|prompts?|guidelines?)\b/i),
  R("anweisungen-ignorieren-de", "injektion", "auffaellig", /\b(?:ignorier|vergiss|missachte)\w*\b[^\n]{0,40}\b(?:vorherigen|bisherigen|obigen|vorigen|alle|deine)\b[^\n]{0,30}\b(?:anweisungen|regeln|instruktionen)\b/i),
  R("system-prompt", "injektion", "hinweis", /\bsystem[ -]?prompts?\b/i),
  R("nutzer-verschweigen", "injektion", "auffaellig", /\b(?:do(?:n'?t| not)|never|without)\s+(?:tell|telling|inform|mention|reveal|disclose|notify|show)\w*\s+(?:the\s+)?(?:user|human|operator|anyone)\b|\bhide\b[^\n]{0,30}\bfrom the user\b/i),
  R("nutzer-verschweigen-de", "injektion", "auffaellig", /\b(?:sag|erz[äa]hl|verrate|erw[äa]hn)\w*\s+(?:es\s+)?(?:dem\s+)?(?:nutzer|benutzer|anwender)\w*\s+(?:nicht|nichts)\b|\bverschweig\w*/i),
  R("rollenwechsel", "injektion", "hinweis", /\byou are now\b|\bneue anweisungen\b|\bnew instructions?\s*:/i),
  R("chat-markierung", "injektion", "auffaellig", /<\/?system>|\[\/?INST\]|<\|im_start\|>/i),
  R("daten-senden-an-url", "injektion", "hinweis", /\b(?:send|post|upload|forward|sende|schicke)\w*\b[^\n]{0,80}\bhttps?:\/\/[A-Za-z0-9]/i),
  R("exfiltration", "injektion", "auffaellig", /\bexfiltrat\w*/i),
  R("heimlich", "injektion", "hinweis", /\b(?:secretly|silently|covertly|without (?:asking|telling|informing|notifying))\b|\bheimlich\b/i),
  R("verdeckte-zeichen", "injektion", "auffaellig", STEUER_PRUEF),
  R("steuerzeichen-ansi", "injektion", "auffaellig", STEUER_C0C1_PRUEF),
  R("langer-base64-block", "injektion", "auffaellig", /[A-Za-z0-9+/]{200,}={0,2}/),
]);

/* Regeln, die auf den Dateipfad passen (Zeile 1). */
const PFAD_REGELN = Object.freeze([
  Object.freeze({ id: "datei-claude-einstellungen", kategorie: "konfig", schwere: "auffaellig", re: /(?:^|\/)\.claude\/(?:settings[^/]*\.json|hooks\/)/ }),
  Object.freeze({ id: "datei-hooks", kategorie: "konfig", schwere: "auffaellig", re: /(?:^|\/)hooks\.json$/ }),
  Object.freeze({ id: "datei-mcp", kategorie: "konfig", schwere: "auffaellig", re: /(?:^|\/)\.mcp\.json$/ }),
  Object.freeze({ id: "datei-agentenanweisung", kategorie: "injektion", schwere: "hinweis", re: /(?:^|\/)(?:CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|copilot-instructions\.md)$/ }),
]);

const SKRIPT_ENDUNG = /\.(?:sh|bash|zsh|ps1|psm1|bat|cmd)$/i;
const istSkript = (rel, text) => SKRIPT_ENDUNG.test(rel) || /^#!/.test(text);
const HTML_ANWEISUNG = /\b(?:ignore|ignoriere|disregard|you (?:must|should|are)|do not|don't|never tell|system prompt|instructions?|anweisung\w*|assistant|claude|agent|execute|ausf[üu]hr\w*|run (?:this|the)|send|sende|exfiltrate|secret)\b/i;

/* ---------- Einlesen ---------- */
function einlesen(wurzelEingabe, ohne) {
  const wurzel = path.resolve(wurzelEingabe);
  const verletzungen = [];
  const eintraege = [];
  const ausgeschlossen = [];
  let st;
  try { st = lstatSync(wurzel); } catch { return { fehler: [`Ziel nicht lesbar oder nicht vorhanden: ${wurzelEingabe}`] }; }
  if (st.isSymbolicLink()) return { fehler: [`Ziel ist ein Symlink und wird abgelehnt: ${wurzelEingabe}`] };
  if (!st.isDirectory() && !st.isFile()) return { fehler: [`Ziel ist weder Verzeichnis noch Datei: ${wurzelEingabe}`] };

  const pruefeGroesse = (rel, bytes) => {
    if (bytes > GRENZEN.dateiBytes) verletzungen.push(`Datei zu groß (${bytes} Bytes, Grenze ${GRENZEN.dateiBytes}): ${rel}`);
  };
  if (st.isFile()) {
    pruefeGroesse(path.basename(wurzel), st.size);
    eintraege.push({ rel: path.basename(wurzel), abs: wurzel, bytes: st.size });
  } else {
    let zaehler = 0;
    let abbruch = false;
    const stapel = [{ abs: wurzel, rel: "", tiefe: 0 }];
    while (stapel.length && !abbruch) {
      const { abs, rel, tiefe } = stapel.pop();
      let namen;
      try { namen = readdirSync(abs).sort(); } catch { verletzungen.push(`Verzeichnis nicht lesbar: ${rel || "."}`); continue; }
      for (const name of namen) {
        if (ohne.has(name)) { ausgeschlossen.push(rel ? `${rel}/${name}` : name); continue; }
        const relName = rel ? `${rel}/${name}` : name;
        if (++zaehler > GRENZEN.eintraege) { verletzungen.push(`Mehr als ${GRENZEN.eintraege} Einträge (Grenze)`); abbruch = true; break; }
        if (tiefe + 1 > GRENZEN.tiefe) { verletzungen.push(`Tiefe über ${GRENZEN.tiefe} (Grenze): ${relName}`); abbruch = true; break; }
        const absName = path.join(abs, name);
        let s;
        try { s = lstatSync(absName); } catch { verletzungen.push(`Eintrag nicht lesbar: ${relName}`); continue; }
        if (s.isSymbolicLink()) { verletzungen.push(`Symlink abgelehnt, nicht gefolgt: ${relName}`); continue; }
        if (s.isDirectory()) { stapel.push({ abs: absName, rel: relName, tiefe: tiefe + 1 }); continue; }
        if (!s.isFile()) { verletzungen.push(`Sonderdatei abgelehnt: ${relName}`); continue; }
        if (eintraege.length >= GRENZEN.dateien) { verletzungen.push(`Mehr als ${GRENZEN.dateien} Dateien (Grenze)`); abbruch = true; break; }
        pruefeGroesse(relName, s.size);
        eintraege.push({ rel: relName, abs: absName, bytes: s.size });
      }
    }
  }
  const summe = eintraege.reduce((a, e) => a + e.bytes, 0);
  if (summe > GRENZEN.gesamtBytes) verletzungen.push(`Gesamtgröße über ${GRENZEN.gesamtBytes} Bytes (Grenze)`);
  if (verletzungen.length) return { fehler: verletzungen.slice(0, 50) };
  return { wurzel, eintraege, ausgeschlossen };
}

/* ---------- Textsuche ---------- */
/* Wortregeln: je Datei ein Fund mit Anzahl der Zeilen (sonst füllen normale Texte die Fundgrenze). */
const SAMMELN = new Set(["token-wort", "credentials-wort", "api-key-wort", "system-prompt"]);

function textFunde(rel, text, muster, kopie) {
  /* Auffällige Funde haben eigene Liste und Vorrang. Die Ausschnitte entstehen erst für behaltene Funde. */
  const auff = [];
  const hinw = [];
  let ueberlauf = 0;
  const merke = (f) => {
    const liste = f.schwere === "auffaellig" ? auff : hinw;
    if (liste.length >= GRENZEN.fundeJeDatei) { ueberlauf++; return; }
    liste.push(f);
  };
  for (const r of PFAD_REGELN) {
    if (muster.some((m) => m.kategorie === r.kategorie) && r.re.test(rel)) {
      merke({ kategorie: r.kategorie, schwere: r.schwere, regel: r.id, datei: rel, zeile: 1, quelle: rel, re: null });
    }
  }
  const skript = istSkript(rel, text);
  const gesammelt = new Map();
  const zeilen = text.split("\n");
  for (let i = 0; i < zeilen.length; i++) {
    let z = zeilen[i];
    if (i === 0 && z.charCodeAt(0) === 0xfeff) z = z.slice(1);
    let zuLang = false;
    if (z.length > GRENZEN.zeilenLaenge) { z = z.slice(0, GRENZEN.zeilenLaenge); zuLang = true; }
    if (zuLang) merke({ kategorie: "injektion", schwere: "hinweis", regel: "zeile-zu-lang", datei: rel, zeile: i + 1, quelle: z, re: null });
    for (const r of muster) {
      if (r.nur === "skript" && !skript) continue;
      if (!r.re.test(z)) continue;
      if (SAMMELN.has(r.id)) {
        const g = gesammelt.get(r.id);
        if (g) g.anzahl++;
        else gesammelt.set(r.id, { r, zeile: i + 1, quelle: z, anzahl: 1 });
      } else {
        merke({ kategorie: r.kategorie, schwere: r.schwere, regel: r.id, datei: rel, zeile: i + 1, quelle: z, re: r.re });
      }
    }
  }
  for (const g of gesammelt.values()) {
    merke({ kategorie: g.r.kategorie, schwere: g.r.schwere, regel: g.r.id, datei: rel, zeile: g.zeile, quelle: g.quelle, re: g.r.re, anzahl: g.anzahl });
  }
  /* HTML-Kommentare über mehrere Zeilen: nur mit anweisungsähnlichem Inhalt. */
  if (muster.some((m) => m.kategorie === "injektion")) {
    const letztesEnde = text.lastIndexOf("-->");
    let pos = 0;
    let zeile = 1;
    let gezaehlt = 0;
    while (letztesEnde >= 0) {
      const a = text.indexOf("<!--", pos);
      if (a < 0 || a > letztesEnde) break;
      const e = text.indexOf("-->", a + 4);
      if (e < 0) break;
      for (let k = gezaehlt; k < a; k++) if (text.charCodeAt(k) === 10) zeile++;
      gezaehlt = a;
      const inhalt = text.slice(a + 4, Math.min(e, a + 4 + GRENZEN.kommentarLaenge));
      if (HTML_ANWEISUNG.test(inhalt)) {
        const erste = text.slice(a, Math.min(e + 3, a + 400)).split("\n")[0];
        merke({ kategorie: "injektion", schwere: "auffaellig", regel: "html-kommentar-anweisung", datei: rel, zeile, quelle: erste, re: null });
      }
      pos = e + 3;
    }
  }
  const alle = [...auff, ...hinw];
  const behalten = [...auff, ...hinw].slice(0, GRENZEN.fundeJeDatei);
  if (kopie) kopie.unterdrueckt += ueberlauf + (alle.length - behalten.length);
  return behalten.map(({ quelle, re, ...rest }) => ({ ...rest, ausschnitt: ausschnitt(quelle, re) }));
}

/* ---------- Hauptprüfung ---------- */
/**
 * Liest Ziel (Verzeichnis oder Datei) nur lesend. Gibt { fehler } bei Grenz-/Symlink-/Lesefehlern zurück,
 * sonst Dateiliste mit Hash, Gesamt-Hash und Funde. Wirft nicht.
 */
export function pruefen(ziel, optionen = {}) {
  const muster = optionen.muster || MUSTER;
  const ohne = new Set(optionen.ohne || []);
  const e = einlesen(ziel, ohne);
  if (e.fehler) return { schema: 1, urteil: URTEIL, warnung: WARNUNG, ziel, fehler: e.fehler, grenzen: [...GRENZEN_TEXT], funde: [] };

  const dateien = [];
  const funde = [];
  const stand = { unterdrueckt: 0 };
  const fehler = [];
  for (const d of e.eintraege) {
    let buf;
    try { buf = readFileSync(d.abs); } catch { fehler.push(`Datei nicht lesbar: ${d.rel}`); continue; }
    if (buf.length > GRENZEN.dateiBytes) { fehler.push(`Datei zu groß (${buf.length} Bytes, Grenze ${GRENZEN.dateiBytes}): ${d.rel}`); continue; }
    if (nulImKopf(buf) || utf16Kopf(buf)) {
      dateien.push({ pfad: d.rel, bytes: buf.length, art: "binaer", sha256: sha(buf) });
      /* Eine Textdatei mit NUL-Byte darf nicht still aus der Suche fallen: melden und nach Entfernen der NUL-Bytes durchsuchen. */
      if (TEXT_ENDUNG.test(d.rel) || utf16Kopf(buf)) {
        funde.push({ kategorie: "abdeckung", schwere: "auffaellig", regel: "binaer-trotz-textendung", datei: d.rel, zeile: 1, ausschnitt: "als binär erkannt trotz Textendung oder UTF-16-Kopf: Suche nur nach Entfernen der NUL-Bytes, unsicher" });
        const ohneNul = Buffer.from(LF(buf.toString("latin1").replace(/\0/g, "")), "latin1");
        funde.push(...textFunde(d.rel, ohneNul.toString("utf8"), muster, stand));
      }
      const kopf = buf.subarray(0, 4);
      const programm = (kopf[0] === 0x4d && kopf[1] === 0x5a) || (kopf[0] === 0x7f && kopf[1] === 0x45 && kopf[2] === 0x4c && kopf[3] === 0x46)
        || kopf.equals(Buffer.from([0xfe, 0xed, 0xfa, 0xce])) || kopf.equals(Buffer.from([0xfe, 0xed, 0xfa, 0xcf]))
        || kopf.equals(Buffer.from([0xce, 0xfa, 0xed, 0xfe])) || kopf.equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))
        || kopf.equals(Buffer.from([0xca, 0xfe, 0xba, 0xbe]));
      if (programm && muster.some((m) => m.kategorie === "prozess")) {
        funde.push({ kategorie: "prozess", schwere: "auffaellig", regel: "programmdatei", datei: d.rel, zeile: 1, ausschnitt: "Programmdatei (Binärkopf), nur gehasht" });
      }
      continue;
    }
    const normal = Buffer.from(LF(buf.toString("latin1")), "latin1");
    dateien.push({ pfad: d.rel, bytes: buf.length, art: "text", sha256: sha(normal) });
    funde.push(...textFunde(d.rel, normal.toString("utf8"), muster, stand));
  }
  if (fehler.length) return { schema: 1, urteil: URTEIL, warnung: WARNUNG, ziel, fehler, grenzen: [...GRENZEN_TEXT], funde: [] };

  dateien.sort(nachPfad);
  funde.sort((a, b) => (a.datei < b.datei ? -1 : a.datei > b.datei ? 1 : a.zeile - b.zeile || (a.kategorie < b.kategorie ? -1 : a.kategorie > b.kategorie ? 1 : a.regel < b.regel ? -1 : a.regel > b.regel ? 1 : 0)));
  let unterdrueckt = stand.unterdrueckt;
  if (funde.length > GRENZEN.fundeGesamt) {
    /* Auch gesamt: auffällige zuerst behalten, dann wieder in Anzeigereihenfolge. */
    const ranking = new Map(funde.map((f, i) => [f, (f.schwere === "auffaellig" ? 0 : funde.length) + i]));
    const behalten = [...funde].sort((a, b) => ranking.get(a) - ranking.get(b)).slice(0, GRENZEN.fundeGesamt);
    unterdrueckt += funde.length - behalten.length;
    const behaltenMenge = new Set(behalten);
    for (let i = funde.length - 1; i >= 0; i--) if (!behaltenMenge.has(funde[i])) funde.splice(i, 1);
  }
  const auffaellig = funde.filter((f) => f.schwere === "auffaellig").length;
  return {
    schema: 1,
    urteil: URTEIL,
    warnung: WARNUNG,
    ziel,
    vollstaendig: unterdrueckt === 0,
    dateien,
    gesamt: gesamtHash(dateien),
    funde,
    zusammenfassung: {
      dateien: dateien.length,
      text: dateien.filter((d) => d.art === "text").length,
      binaer: dateien.filter((d) => d.art === "binaer").length,
      auffaellig,
      hinweis: funde.length - auffaellig,
      unterdrueckt,
    },
    ausgeschlossen: e.ausgeschlossen,
    grenzen: [...GRENZEN_TEXT],
  };
}

/* ---------- Sperrdatei ---------- */
const HEX64 = /^[0-9a-f]{64}$/;

export function sperreAus(ergebnis) {
  /* Ohne Prototyp: Dateinamen wie __proto__ oder constructor sind sonst Sonderfälle. */
  const dateien = Object.create(null);
  for (const d of ergebnis.dateien) dateien[d.pfad] = d.sha256;
  return { schema: 1, dateien, gesamt: ergebnis.gesamt };
}

export function sperreLesen(inhalt) {
  let j;
  try { j = JSON.parse(inhalt); } catch { return { fehler: "Sperrdatei ist kein gültiges JSON" }; }
  if (!j || typeof j !== "object" || j.schema !== 1) return { fehler: "Sperrdatei: Schema 1 erwartet" };
  if (!j.dateien || typeof j.dateien !== "object" || Array.isArray(j.dateien)) return { fehler: "Sperrdatei: Feld dateien fehlt" };
  for (const [p, h] of Object.entries(j.dateien)) if (typeof h !== "string" || !HEX64.test(h)) return { fehler: `Sperrdatei: ungültiger Hash für ${p}` };
  if (typeof j.gesamt !== "string" || !HEX64.test(j.gesamt)) return { fehler: "Sperrdatei: Feld gesamt ungültig" };
  const neu = gesamtHash(Object.entries(j.dateien).map(([pfad, sha256]) => ({ pfad, sha256 })));
  if (neu !== j.gesamt) return { fehler: "Sperrdatei ist in sich widersprüchlich (gesamt passt nicht zu dateien)" };
  return { sperre: j };
}

export function sperreVergleichen(sperre, ergebnis) {
  const jetzt = sperreAus(ergebnis).dateien;
  const alt = sperre.dateien;
  const hat = (o, p) => Object.prototype.hasOwnProperty.call(o, p);
  const hinzugefuegt = Object.keys(jetzt).filter((p) => !hat(alt, p)).sort();
  const entfernt = Object.keys(alt).filter((p) => !hat(jetzt, p)).sort();
  const geaendert = Object.keys(jetzt).filter((p) => hat(alt, p) && alt[p] !== jetzt[p]).sort();
  return { ok: !hinzugefuegt.length && !entfernt.length && !geaendert.length && sperre.gesamt === ergebnis.gesamt, hinzugefuegt, entfernt, geaendert };
}

const liegtDrin = (wurzel, datei) => {
  const rel = path.relative(path.resolve(wurzel), path.resolve(datei));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/* ---------- Aufruf ---------- */
function argumente(argv) {
  const o = { ziel: null, json: false, sperre: null, schreiben: false, ohne: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--sperre-schreiben") o.schreiben = true;
    else if (a === "--sperre") { o.sperre = argv[++i]; if (!o.sperre || o.sperre.startsWith("--")) return { fehler: "--sperre braucht einen Dateipfad" }; }
    else if (a === "--ohne") { const n = argv[++i]; if (!n || n.startsWith("--")) return { fehler: "--ohne braucht einen Namen" }; o.ohne.push(n); }
    else if (a.startsWith("--")) return { fehler: `Unbekannte Option: ${a}` };
    else if (o.ziel === null) o.ziel = a;
    else return { fehler: "Nur ein Ziel erlaubt" };
  }
  if (o.ziel === null) return { fehler: "Aufruf: node werkzeug/skill-pruefen.mjs <Verzeichnis oder Datei> [--sperre <datei> [--sperre-schreiben]] [--ohne <Name>] [--json]" };
  if (o.schreiben && !o.sperre) return { fehler: "--sperre-schreiben braucht --sperre <datei>" };
  return { opt: o };
}

function textAusgabe(e) {
  const z = [];
  z.push("Skill-Prüfung (nur lesend: es wird nichts ausgeführt, kein Netz, keine Änderung am Ziel)");
  z.push(`Ziel: ${e.ziel}`);
  if (e.fehler && e.fehler.length) {
    z.push("FEHLER, keine Auswertung:");
    for (const f of e.fehler) z.push(`  - ${f}`);
  } else {
    const s = e.zusammenfassung;
    z.push(`Dateien: ${s.dateien} (Text ${s.text}, binär ${s.binaer})`);
    z.push(`Gesamt-SHA-256: ${e.gesamt}`);
    if (e.ausgeschlossen && e.ausgeschlossen.length) z.push(`Ausgeschlossen (NICHT geprüft, auf Wunsch): ${e.ausgeschlossen.join(", ")}`);
    z.push(`Funde: ${e.funde.length} (auffaellig ${s.auffaellig}, hinweis ${s.hinweis}, unterdrückt ${s.unterdrueckt})`);
    if (e.vollstaendig === false) z.push(`UNVOLLSTÄNDIG: ${s.unterdrueckt} Funde unterdrückt (Grenze ${GRENZEN.fundeJeDatei} je Datei, ${GRENZEN.fundeGesamt} gesamt). Ergebnis nicht verwerten. Betroffene Dateien einzeln lesen. Rückgabe 1.`);
    for (const f of e.funde) z.push(`  [${f.schwere}] ${f.kategorie} ${f.datei}:${f.zeile} ${f.regel}${f.anzahl ? ` [${f.anzahl} Zeilen]` : ""} | ${f.ausschnitt}`);
    if (e.sperre) {
      const p = e.sperre;
      if (p.geschrieben) z.push(`Sperre: geschrieben nach ${p.datei}`);
      else if (p.ok) z.push(`Sperre: ${p.datei} stimmt überein (alle Hashes gleich)`);
      else {
        z.push(`Sperre: ${p.datei} weicht AB`);
        for (const x of p.geaendert) z.push(`  geändert: ${x}`);
        for (const x of p.hinzugefuegt) z.push(`  hinzugefügt: ${x}`);
        for (const x of p.entfernt) z.push(`  entfernt: ${x}`);
        if (!p.geaendert.length && !p.hinzugefuegt.length && !p.entfernt.length) z.push("  Gesamt-Hash weicht ab");
      }
    }
    if (e.sperreFehler) z.push(`Sperre FEHLER: ${e.sperreFehler}`);
  }
  z.push("");
  z.push(`Urteil: ${URTEIL}`);
  z.push(`Hinweis: ${WARNUNG}.`);
  z.push("Grenzen:");
  for (const g of e.grenzen) z.push(`  - ${g}`);
  return `${z.join("\n")}\n`;
}

/** Führt einen Aufruf aus. Gibt { code, stdout } zurück; wirft nicht. */
export function lauf(argv) {
  const a = argumente(argv);
  const json = argv.includes("--json");
  /* Alles, was ein Mensch liest, geht durch bereinigt(): Namen und Pfade des Prüfobjekts steuern die Anzeige nicht. */
  const ausgeben = (e, code) => {
    const b = bereinigt(e);
    return { code, stdout: json ? `${JSON.stringify(b, null, 2)}\n` : textAusgabe(b) };
  };
  if (a.fehler) {
    return ausgeben({ schema: 1, urteil: URTEIL, warnung: WARNUNG, ziel: argv.find((x) => !x.startsWith("--")) || "", fehler: [a.fehler], grenzen: [...GRENZEN_TEXT], funde: [] }, 1);
  }
  const o = a.opt;
  if (o.sperre) {
    if (liegtDrin(o.ziel, o.sperre)) {
      return ausgeben({ schema: 1, urteil: URTEIL, warnung: WARNUNG, ziel: o.ziel, fehler: ["Sperrdatei darf nicht im geprüften Ziel liegen"], grenzen: [...GRENZEN_TEXT], funde: [] }, 1);
    }
  }
  const e = pruefen(o.ziel, { ohne: o.ohne });
  if (e.fehler) return ausgeben(e, 1);
  /* Unterdrückte Funde: das Ergebnis ist unvollständig, also Rückgabe 1. */
  let code = e.vollstaendig ? 0 : 1;
  if (o.sperre) {
    const datei = o.sperre;
    if (o.schreiben) {
      try {
        writeFileSync(datei, `${JSON.stringify(sperreAus(e), null, 2)}\n`, { flag: "wx" });
        e.sperre = { datei, geschrieben: true, ok: true };
      } catch (err) {
        e.sperreFehler = err && err.code === "EEXIST" ? `Sperrdatei existiert schon und wird nicht überschrieben: ${datei}` : `Sperrdatei nicht schreibbar: ${datei}`;
        code = 1;
      }
    } else {
      let inhalt = null;
      try {
        const s = lstatSync(datei);
        if (!s.isFile() || s.size > GRENZEN.dateiBytes) e.sperreFehler = `Sperrdatei ungeeignet (keine Datei oder zu groß): ${datei}`;
        else inhalt = readFileSync(datei, "utf8");
      } catch { e.sperreFehler = `Sperrdatei nicht lesbar: ${datei}`; }
      if (inhalt !== null) {
        const l = sperreLesen(inhalt);
        if (l.fehler) e.sperreFehler = l.fehler;
        else {
          e.sperre = { datei, ...sperreVergleichen(l.sperre, e) };
          if (!e.sperre.ok) code = 1;
        }
      }
      if (e.sperreFehler) code = 1;
    }
  }
  return ausgeben(e, code);
}

const direkt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direkt) {
  const r = lauf(process.argv.slice(2));
  process.stdout.write(r.stdout);
  process.exitCode = r.code;
}
