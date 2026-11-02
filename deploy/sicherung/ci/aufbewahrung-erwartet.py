#!/usr/bin/env python3
"""Unabhängige Nachrechnung der Aufbewahrungsregel — NUR CI.

Liest `restic snapshots --json` (stdin) und gibt die IDs aus, die
`forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --group-by host`
behalten muss — nachgebaut nach restics ApplyPolicy: Snapshots neuester
zuerst; je Regel wird ein Snapshot behalten, wenn sein Eimer (Tag,
ISO-Woche, Monat in der Zeitzone des Snapshots) sich vom zuletzt
behaltenen Eimer dieser Regel unterscheidet und die Regel noch Plätze hat.
"""
import json
import re
import sys
from datetime import datetime, timedelta, timezone

MUSTER = re.compile(r"(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)")


def zeit(text):
    m = MUSTER.match(text)
    if not m:
        raise SystemExit(f"Zeit nicht lesbar: {text}")
    j, mo, t, h, mi, s, bruch, zone = m.groups()
    if zone == "Z":
        tz = timezone.utc
    else:
        vz = 1 if zone[0] == "+" else -1
        tz = timezone(vz * timedelta(hours=int(zone[1:3]), minutes=int(zone[4:6])))
    mikro = int((bruch or "0")[:6].ljust(6, "0"))
    return datetime(int(j), int(mo), int(t), int(h), int(mi), int(s), mikro, tzinfo=tz)


def main():
    snaps = json.load(sys.stdin)
    snaps.sort(key=lambda s: zeit(s["time"]), reverse=True)
    regeln = [
        ["taeglich", 7, lambda d: d.year * 10000 + d.month * 100 + d.day],
        ["woechentlich", 4, lambda d: d.isocalendar()[0] * 100 + d.isocalendar()[1]],
        ["monatlich", 12, lambda d: d.year * 100 + d.month],
    ]
    letzte = {r[0]: None for r in regeln}
    behalten = []
    for nr, s in enumerate(snaps):
        d = zeit(s["time"])
        # seit restic 0.17: der älteste bleibt, solange eine Regel Plätze frei hat
        aeltester = nr == len(snaps) - 1
        bleibt = False
        for r in regeln:
            name, rest, eimer = r
            if rest == 0:
                continue
            e = eimer(d)
            if e != letzte[name] or aeltester:
                letzte[name] = e
                r[1] -= 1
                bleibt = True
        if bleibt:
            behalten.append(s["id"])
    print("\n".join(sorted(behalten)))


main()
