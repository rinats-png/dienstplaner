#!/usr/bin/env python3
"""Lokaler Ping-Empfänger für den CI-Nachweis — nimmt Healthchecks-artige
Pings an (GET/POST auf /ping/<id>[/start|/fail]) und schreibt je Ping eine
Zeile "<METHODE> <PFAD> <Länge des Rumpfs>" in die Logdatei. NUR CI.

Aufruf: ping-empfaenger.py <port> <logdatei>
"""
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1])
LOG = sys.argv[2]


class Empfaenger(BaseHTTPRequestHandler):
    def _antwort(self):
        laenge = int(self.headers.get("Content-Length") or 0)
        rumpf = self.rfile.read(laenge) if laenge else b""
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(f"{self.command} {self.path} {len(rumpf)}\n")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"OK")

    do_GET = _antwort
    do_POST = _antwort
    do_HEAD = _antwort

    def log_message(self, *args):  # keine Ausgabe auf stderr
        pass


ThreadingHTTPServer(("127.0.0.1", PORT), Empfaenger).serve_forever()
