# Überträgt die Sprecherzeiten (build/vo/vo.json) in src/vo-zeiten.js, damit film.html sie ohne fetch lesen kann.
import json, os
H = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(H, "..", "build", "vo", "vo.json")))
open(os.path.join(H, "vo-zeiten.js"), "w").write("// erzeugt von zeiten.py aus build/vo/vo.json\nwindow.VO = " + json.dumps(d, ensure_ascii=False) + ";\n")
print("ok", d["dauer"])
