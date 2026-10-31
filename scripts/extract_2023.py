"""Pull the episode table back out of the 2023 R report.

The report embedded its plotly data, and that is the only copy of the merged
Kaggle table (ratings, viewers, air dates, directors, writers) I still have.
"""

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "original" / "2023-report.html").read_text()
widgets = [json.loads(m.group(1)) for m in re.finditer(r'<script type="application/json" data-for="[^"]+">(.*?)</script>', src, re.S)]

pat = re.compile(
    r"<b> (.*?) </b><br> Season  (\d+)  Episode  (\d+) <br>Rating:  ([\d.]+) <br>Air Date:  (.*?) "
    r"<br>Viewers:  (\S+)  million <br>Director:  (.*?) <br>Writer:  (.*)"
)
rows = []
for trace in widgets[1]["x"]["data"]:
    for text in trace["text"]:
        m = pat.match(text)
        rows.append({"title": html.unescape(m[1]), "s": int(m[2]), "e": int(m[3]), "r": float(m[4]), "date": m[5],
                     "v": m[6], "dir": m[7], "wri": html.unescape(m[8])})

(ROOT / "raw").mkdir(exist_ok=True)
(ROOT / "raw" / "episodes_2023.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
print(len(rows), "rows")
