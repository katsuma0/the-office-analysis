"""Build data/quizbank.json, the question pool for the endless quiz.

Run after build_data.py: it reads data/office.json and data/lines/*.json, plus the hand-checked
storyline questions in scripts/trivia.json.

    python3 scripts/build_quizbank.py
"""

import json
import math
import random
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
D = json.loads((DATA / "office.json").read_text())
EPS = D["episodes"]
CHARS = {c["key"]: c for c in D["characters"]}
BY_LINES = sorted(CHARS, key=lambda k: -CHARS[k]["lines"])
TOP8, TOP16 = set(BY_LINES[:8]), set(BY_LINES[:16])

rows = []
for s in range(1, 10):
    rows += json.loads((DATA / "lines" / f"{s}.json").read_text())

# Same tokenizer and clean-up as the daily quiz (quiz.js), so the two agree on what a line says.
TOKEN = re.compile(r"[a-z][a-z'-]*[a-z]|[a-z]")


def tokens(t):
    t = t.lower().replace("’", "'")
    return [w.strip("'-") for w in TOKEN.findall(t)]


def clean(t):
    t = re.sub(r"\s*[\[{][^\]}]*(?:[\]}]|$)", "", t)
    t = re.sub("\\s*\u2014\\s*", "-- ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return re.sub(r"-- $", "--", t)


ENDS = re.compile(r"[.!?…\"'”’)-]$")
first_names = {k: k.split()[0].lower() for k in CHARS}
last_names = {k: CHARS[k]["name"].split()[-1].lower() for k in CHARS}

# A line said word for word by more than one person can't have one right answer.
said_by = {}
for ep, k, t in rows:
    said_by.setdefault(" ".join(tokens(t)), set()).add(k)

# Each character's tells: the same weighted log-odds as build_data.py (Monroe, Colaresi & Quinn 2008), but a
# longer list. The site shows the top 14; the quiz needs a few hundred lines per person that carry one, and the
# daily quiz has already used most of the lines with a top-14 word.
STOP = set("""a about after all am an and any are as at be because been but by can could did do does don't for from had
has have he her here him his how i i'm if in into is it it's just know like me my no not now of oh okay on one or our out
right so that that's the them then there they this to uh um up was we well what when who will with would yeah yes you your
get got go going gonna good hey think want see come say look really thing mean tell let make way""".split())
by_char = {}
for ep, k, t in rows:
    if k in CHARS:
        by_char.setdefault(k, Counter()).update(tokens(clean(t)))
everyone = sum(by_char.values(), Counter())
prior = {w: c * 0.01 for w, c in everyone.items()}
a0 = sum(prior.values())


def tells(k):
    mine = by_char[k]
    rest = everyone - mine
    na, nb = sum(mine.values()), sum(rest.values())
    out = {}
    for w, ya in mine.items():
        if ya < 5 or w in STOP or len(w) < 3:
            continue
        yb, aw = rest.get(w, 0), prior[w]
        da = math.log((ya + aw) / (na + a0 - ya - aw))
        db = math.log((yb + aw) / (nb + a0 - yb - aw))
        z = (da - db) / math.sqrt(1 / (ya + aw) + 1 / (yb + aw))
        if z >= 2.5:
            out[w] = z
    return out


sig = {k: tells(k) for k in CHARS}
ep_kw = {e["id"]: [w["w"] for w in e["kw"]] for e in EPS}

# The daily Who Said It? deals from data/quiz.json, so those lines stay out of here: playing the endless quiz
# shouldn't hand you tomorrow's daily.
daily = {" ".join(tokens(clean(t))) for ep, k, t in json.loads((DATA / "quiz.json").read_text())}

lines = []
for ep, k, t in rows:
    if k not in CHARS:
        continue
    t = clean(t)
    toks = tokens(t)
    n = len(toks)
    if n < 6 or n > 30 or not ENDS.search(t) or len(said_by.get(" ".join(toks), ())) > 1 or " ".join(toks) in daily:
        continue
    # Their own name in the line gives the answer away, first or last ("The Adventures of Jimmy Halpert").
    if first_names[k] in toks or last_names[k] in toks:
        continue
    have = set(toks)
    tell = max((sig[k].get(w, 0) for w in have), default=0)
    if k in TOP8 and n >= 8 and tell >= 4:
        who = 1
    elif k in TOP16 and n >= 7 and tell > 0:
        who = 2
    elif n >= 8:
        who = 3
    else:
        continue
    kw = ep_kw[ep]
    hit = [i for i, w in enumerate(kw) if w in have]
    epi = 1 if hit and hit[0] < 5 else 2 if hit else 3
    lines.append([ep, k, t, who, epi])

# Keep every easy line; sample the medium and hard ones so the file stays small on a phone.
rng = random.Random(20261101)
CAP = {2: 2500, 3: 2000}
keep = set()
for tier, cap in CAP.items():
    pool = [r for r in lines if r[3] == tier]
    keep |= set(map(id, rng.sample(pool, min(len(pool), cap))))
lines = [r for r in lines if r[3] == 1 or id(r) in keep]

# Lines that name someone else in the cast, for "Who are they talking about?". One name per line, and only
# first names that can't mean anyone else: David could be Wallace or Brent, and Robert outside Robert
# California's run is the Senator.
NAMEABLE = {k.split()[0].lower(): k for k in CHARS if k != "David Wallace"}
rc_run = (CHARS["Robert"]["first"], CHARS["Robert"]["last"]) if "Robert" in CHARS else (0, -1)
named = []
for ep, k, t in rows:
    if k not in CHARS:
        continue
    t = clean(t)
    toks = tokens(t)
    if not 8 <= len(toks) <= 30 or not ENDS.search(t) or " ".join(toks) in daily:
        continue
    hits = {NAMEABLE[w] for w in toks if w in NAMEABLE} | {NAMEABLE[w[:-2]] for w in toks if w.endswith("'s") and w[:-2] in NAMEABLE}
    if len(hits) != 1:
        continue
    who = hits.pop()
    if who == k or (who == "Robert" and not rc_run[0] <= ep <= rc_run[1]):
        continue
    named.append([ep, k, t, who])
named = rng.sample(named, min(len(named), 2000)) if len(named) > 2000 else named
named.sort(key=lambda r: (r[0], r[2]))

# Opening lines: the first four rows of every episode whose transcript is in order. The second half of a
# split hour-long starts mid-episode, so it's left out.
open_rows = {}
for ep, k, t in rows:
    open_rows.setdefault(ep, []).append((k, clean(t)))
openings = []
for e in EPS:
    if e["shuffled"]:
        continue
    if e["approx"] and any(x["approx"] and x["date"] == e["date"] and x["id"] < e["id"] for x in EPS):
        continue
    first = [[k, t] for k, t in open_rows[e["id"]] if t][:4]
    if len(first) == 4:
        openings.append([e["id"], first])

# Storyline questions, written and checked by hand against the transcript.
trivia_src = ROOT / "scripts" / "trivia.json"
trivia = []
if trivia_src.exists():
    by_ep = {}
    for ep, k, t in rows:
        by_ep.setdefault(ep, []).append((k, t))
    for i, q in enumerate(json.loads(trivia_src.read_text())):
        assert 0 <= q["ep"] < len(EPS), q
        assert q["d"] in (1, 2, 3), q
        opts = [q["a"], *q["w"]]
        assert len(opts) == 4 and len({o.strip().lower() for o in opts}) == 4, q
        assert (q["cite"]["k"], q["cite"]["t"]) in by_ep[q["ep"]], ("cite not in transcript", q)
        for f in ("q", "a", "why", *q["w"]):
            assert "\u2014" not in (q.get(f) or f), q
        trivia.append({"id": i, "ep": q["ep"], "d": q["d"], "q": q["q"], "a": q["a"], "w": q["w"], "why": q["why"],
                       "cite": q["cite"]})

out = {"lines": lines, "open": openings, "named": named, "trivia": trivia}
(DATA / "quizbank.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))

tiers = Counter(r[3] for r in lines)
print(f"lines {len(lines)} (who tiers {dict(sorted(tiers.items()))}, episode tiers {dict(sorted(Counter(r[4] for r in lines).items()))})")
print(f"named {len(named)}, openings {len(openings)}, trivia {len(trivia)}, {len(json.dumps(out, ensure_ascii=False)) // 1024} KB")
