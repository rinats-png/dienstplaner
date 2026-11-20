/* Gemeinsame Hilfen für pruefungen/inventur-skript.test.js und
   pruefungen/inventur-phase2.test.js (REL-0). */
import { existsSync } from "node:fs";

export function bashFinden() {
  if (process.env.CENTRIC_BASH) return process.env.CENTRIC_BASH;
  if (process.platform !== "win32") return "bash";
  const git = "C:/Program Files/Git/bin/bash.exe";
  return existsSync(git) ? git : null;
}

export const p = (x) => x.replace(/\\/g, "/");
/* Für PATH-Listen: unter Git Bash „C:/x“ → „/c/x“ (der Doppelpunkt trennt sonst). */
export const posixPfad = (x) => p(x).replace(/^([A-Za-z]):/, (_, l) => "/" + l.toLowerCase());

/* Fremde SSH-Befehle: jeder → Rückgabe 2, keine Ausgabe auf stdout.
   Ein Nullbyte kann in einer Umgebungsvariablen nicht vorkommen (C-Zeichenkette);
   stellvertretend steht ein Steuerzeichen in der Liste. */
export const FREMDE_BEFEHLE = [
  "inventur; id",
  "inventur && ls",
  "inventur | cat",
  "inventur\nid",
  "inventur\n",
  "inventur ",
  " inventur",
  "\tinventur",
  "INVENTUR",
  "Inventur",
  "inventur --hilfe",
  "inventur\u0001",
  " ",
  "\t",
  "\n",
  "id",
  "bash",
  "sh -c id",
  "scp -t /tmp",
  "scp -f /etc/passwd",
  "sftp",
  "internal-sftp",
  "/usr/lib/openssh/sftp-server",
  "rsync --server -vlogDtpre.iLsfxC . /tmp",
  "cat .env",
  "docker ps",
];

/* Quelltext ohne Kommentare und ohne Zeichenketten (für Befehlswörter und Umlenkungen).
   Shell-Quoting: '…' bis zum nächsten ', "…" bis zum nächsten nicht maskierten ".
   Zeilenumbrüche bleiben erhalten, damit Zeile n des Ergebnisses zu Zeile n des Quelltexts passt. */
export function ohneKommentareUndZeichenketten(text) {
  let aus = "";
  const umbrueche = (von, bis) => "\n".repeat((text.slice(von, bis).match(/\n/g) || []).length);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
      while (i < text.length && text[i] !== "\n") i++;
      aus += "\n";
    } else if (c === "'") {
      const ende = text.indexOf("'", i + 1);
      aus += "''" + umbrueche(i, ende);
      i = ende;
    } else if (c === '"') {
      const start = i;
      i++;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      aus += '""' + umbrueche(start, i);
    } else {
      aus += c;
    }
  }
  return aus;
}
