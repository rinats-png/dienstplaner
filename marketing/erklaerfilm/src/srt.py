# captions.srt aus window.TIMELINE.untertitel (build/timeline.json) – dieselben Zeilen, die eingebrannt sind.
import json, os
H = os.path.dirname(os.path.abspath(__file__))
tl = json.load(open(os.path.join(H, "..", "build", "timeline.json")))
def ts(s): ms = round(s * 1000); return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
def umbruch(s, m=42):
    if len(s) <= m: return s
    i = min((i for i, c in enumerate(s) if c == " "), key=lambda i: abs(i - len(s) / 2)); return s[:i] + "\n" + s[i + 1:]
out = [f"{n}\n{ts(u['start'])} --> {ts(u['ende'])}\n{umbruch(u['text'])}\n" for n, u in enumerate(tl["untertitel"], 1)]
open(os.path.join(H, "..", "out", "captions.srt"), "w", encoding="utf-8").write("\n".join(out))
print(len(out), "Untertitel")
