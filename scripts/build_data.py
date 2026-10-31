"""Build the site's data files from the raw sources.

Inputs:
  raw/episodes_2023.json   episode table pulled out of the 2023 R report (scripts/extract_2023.py)
  raw/schrute.csv          full transcript from schrutepy 0.1.3, not committed, see README
  raw/office_ratings.csv   TidyTuesday 2020-03-17, used only for IMDb vote counts

Outputs:
  data/office.json         everything the pages need, aggregated
  data/lines.json          compact transcript for the search box, lazy loaded
"""

import json
import math
import random
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "data"
random.seed(7)
np.random.seed(7)

# ---------------------------------------------------------------- episodes

def norm_title(t):
    t = t.lower().replace("&", "and").replace("s*x", "sex").replace("surveilance", "surveillance")
    t = re.sub(r"\(parts? 1\s*and\s*2\)", "", t)
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    words = [w for w in t.split() if w not in ("the", "a")]
    return "".join(words)


raw_eps = json.loads((RAW / "episodes_2023.json").read_text())
seen, episodes = set(), []
for e in raw_eps:
    # The 2023 merge duplicated every two-part episode. One row per real episode.
    key = (e["s"], e["title"])
    if key in seen:
        continue
    seen.add(key)
    episodes.append(e)
assert len(episodes) == 188, len(episodes)


def split_people(s):
    parts = re.split(r"\s+&\s+|\s+and\s+", s)
    return [p.strip() for p in parts if p.strip()]


votes = pd.read_csv(RAW / "office_ratings.csv")
votes_map = {(r.season, norm_title(r.title)): int(r.total_votes) for r in votes.itertuples()}

for i, e in enumerate(episodes):
    e["id"] = i
    e["viewers"] = round(float(e["v"]) / 1e6, 2)
    e["date"] = pd.to_datetime(e["date"]).strftime("%Y-%m-%d")
    e["directors"] = split_people(e["dir"])
    e["writers"] = split_people(e["wri"])
    k = (e["s"], norm_title(e["title"]))
    e["votes"] = votes_map.get(k)

# ---------------------------------------------------------------- transcript

df = pd.read_csv(RAW / "schrute.csv")
df["text"] = df["text"].fillna("").astype(str).str.strip()
df = df[df["text"] != ""].copy()

ALIASES = {
    "David": "David Wallace", "Deangelo": "DeAngelo", "Daryl": "Darryl", "Packer": "Todd Packer",
    "Micheal": "Michael", "Michel": "Michael", "Dwight:": "Dwight", "Dwigt": "Dwight", "Jim:": "Jim",
    "Pam:": "Pam", "Robert California": "Robert", "Ryan Howard": "Ryan", "Phylis": "Phyllis",
    "Angels": "Angela", "Anglea": "Angela", "Kelly Kapoor": "Kelly", "Todd": "Todd Packer",
}


def clean_speaker(c):
    c = str(c).strip().strip(":").strip()
    c = re.sub(r"\s+", " ", c)
    return ALIASES.get(c, c)


df["speaker"] = df["character"].map(clean_speaker)

# Map each transcript episode onto the ratings table by season + title.
by_key = {(e["s"], norm_title(e["title"])): e for e in episodes}
by_key_part = defaultdict(list)
for e in episodes:
    m = re.match(r"(.*?):? part (\d)$", e["title"].lower())
    if m:
        by_key_part[(e["s"], norm_title(m.group(1)))].append(e)

ALIAS_TITLES = {"coverup": "cover", "michaelscottpapercompany": "michaelscottpapercompany"}

df["ep_id"] = -1
df["order"] = range(len(df))
for (s, name), g in df.groupby(["season", "episode_name"], sort=False):
    k = norm_title(name)
    k = re.sub(r"part(\d)$", r"part\1", k)
    target = by_key.get((s, k))
    if target is None:
        for ek, ev in by_key.items():
            if ek[0] == s and (ALIAS_TITLES.get(ek[1], ek[1]) == k or ek[1].replace("part", "") == k.replace("part", "")):
                target = ev
                break
    if target is not None:
        df.loc[g.index, "ep_id"] = target["id"]
        continue
    parts = by_key_part.get((s, k))
    if parts and len(parts) == 2:
        # Niagara and The Delivery come as one transcript. Split it down the middle.
        half = len(g) // 2
        df.loc[g.index[:half], "ep_id"] = parts[0]["id"]
        df.loc[g.index[half:], "ep_id"] = parts[1]["id"]
        continue
    raise SystemExit(f"no match for transcript episode {s} {name!r} ({k})")

missing = sorted(set(range(len(episodes))) - set(df["ep_id"]))
assert not missing, [episodes[i]["title"] for i in missing]
df = df.sort_values(["ep_id", "order"]).reset_index(drop=True)

# ---------------------------------------------------------------- characters

CAST = [
    ("Michael", "Michael Scott", "Regional Manager. World's best boss, per his own mug.", "Steve Carell"),
    ("Dwight", "Dwight Schrute", "Assistant to the Regional Manager. Beet farmer, volunteer sheriff's deputy.", "Rainn Wilson"),
    ("Jim", "Jim Halpert", "Salesman. Puts staplers in Jell-O. Looks at the camera a lot.", "John Krasinski"),
    ("Pam", "Pam Beesly", "Receptionist, then salesperson, then office administrator. Paints.", "Jenna Fischer"),
    ("Andy", "Andy Bernard", "Salesman from Stamford. Went to Cornell. Will tell you.", "Ed Helms"),
    ("Angela", "Angela Martin", "Head of accounting and the party planning committee. Cats.", "Angela Kinsey"),
    ("Kevin", "Kevin Malone", "Accountant. Famous chili. Drummer in Scrantonicity.", "Brian Baumgartner"),
    ("Erin", "Erin Hannon", "Receptionist after Pam. Grew up in foster care. Very nice.", "Ellie Kemper"),
    ("Oscar", "Oscar Martinez", "Accountant. The one who actually knows things.", "Oscar Nuñez"),
    ("Ryan", "Ryan Howard", "Temp, then VP, then temp again. Started WUPHF.", "B. J. Novak"),
    ("Darryl", "Darryl Philbin", "Warehouse foreman who made it upstairs.", "Craig Robinson"),
    ("Phyllis", "Phyllis Vance", "Saleswoman. Married Bob Vance, Vance Refrigeration.", "Phyllis Smith"),
    ("Kelly", "Kelly Kapoor", "Customer service. Talks fast, mostly about Ryan.", "Mindy Kaling"),
    ("Toby", "Toby Flenderson", "HR. Michael's sworn enemy for reasons nobody can name.", "Paul Lieberstein"),
    ("Jan", "Jan Levinson", "Corporate VP, then Michael's girlfriend, then candle entrepreneur.", "Melora Hardin"),
    ("Stanley", "Stanley Hudson", "Salesman. Crossword. Pretzel day.", "Leslie David Baker"),
    ("Meredith", "Meredith Palmer", "Supplier relations. Has been hit by Michael's car.", "Kate Flannery"),
    ("Holly", "Holly Flax", "HR, and the person Michael was always looking for.", "Amy Ryan"),
    ("Nellie", "Nellie Bertram", "Took the manager's chair by walking into the office and sitting in it.", "Catherine Tate"),
    ("Gabe", "Gabe Lewis", "Sabre's coordinator of emerging regions. Tall.", "Zach Woods"),
    ("Robert", "Robert California", "CEO of Sabre. The Lizard King.", "James Spader"),
    ("Creed", "Creed Bratton", "Quality assurance, in theory. Nobody knows where he was before.", "Creed Bratton"),
    ("David Wallace", "David Wallace", "CFO, then unemployed, then owner of the whole company.", "Andy Buckley"),
    ("Karen", "Karen Filippelli", "Came over from Stamford. Dated Jim. Left for Utica.", "Rashida Jones"),
]
CAST_KEYS = [c[0] for c in CAST]
CODE = {k: chr(65 + i) if i < 26 else "?" for i, k in enumerate(CAST_KEYS)}  # A..X, '.' = everyone else

STOP = set("""
a about above after again against all am an and any are aren't as at be because been before being below between both but by
can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't
have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is
isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out
over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then
there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll
we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't
you you'd you'll you're you've your yours yourself yourselves oh okay ok yeah yes uh um hey just like know get got go going gonna
right well really think want one now see come say said look good thing things mean little gotta ok tell let make way something
lot also back us na can't wanna yep hmm ah huh uh-huh mm alright all right thank thanks please time sure need take put guys guy
much could even still maybe ever never every anything everything nothing someone somebody everybody anybody actually kind sorry
two three first last big great new day people man oh-oh hi hello bye wow god whoa o yeah. it’s don’t i’m that’s
""".split())

WORD_RE = re.compile(r"[a-z][a-z'\-]*[a-z]|[a-z]")


def tokens(text):
    words = [w.strip("'-") for w in WORD_RE.findall(text.lower().replace("’", "'"))]
    # The transcript spells it both ways.
    return ["schrute" if w == "shrute" else w for w in words]


df["tokens"] = df["text"].map(tokens)
df["nwords"] = df["tokens"].map(len)


def log_odds(counts_a, counts_b, prior, min_count=8, top=14):
    """Weighted log-odds with an informative Dirichlet prior (Monroe, Colaresi & Quinn 2008).

    Raw frequency would give every character the same list ("Michael", "Dwight", "office").
    This asks which words a group uses unusually often relative to everyone else.
    """
    na, nb, a0 = sum(counts_a.values()), sum(counts_b.values()), sum(prior.values())
    scale = 1.0
    out = []
    for w, ya in counts_a.items():
        if ya < min_count or w in STOP or len(w) < 3:
            continue
        yb = counts_b.get(w, 0)
        aw = prior[w] * scale
        da = math.log((ya + aw) / (na + a0 - ya - aw))
        db = math.log((yb + aw) / (nb + a0 - yb - aw))
        var = 1 / (ya + aw) + 1 / (yb + aw)
        out.append((w, (da - db) / math.sqrt(var), ya))
    out.sort(key=lambda x: -x[1])
    return [{"w": w, "z": round(z, 1), "n": n} for w, z, n in out[:top]]


all_counts = Counter(w for ts in df["tokens"] for w in ts)
prior = Counter({w: c * 0.01 for w, c in all_counts.items()})

character_out = []
main = df[df["speaker"].isin(CAST_KEYS)]
total_lines = len(df)

# Who speaks right after whom, inside the same episode.
follow = defaultdict(Counter)
prev_sp, prev_ep = None, None
for sp, ep in zip(df["speaker"], df["ep_id"]):
    if ep == prev_ep and sp != prev_sp and sp in CODE and prev_sp in CODE:
        follow[prev_sp][sp] += 1
    prev_sp, prev_ep = sp, ep

name_pat = {k: re.compile(r"\b" + re.escape(k.split()[0]) + r"\b", re.I) for k in CAST_KEYS}
ep_lines = df.groupby("ep_id").size()
ep_rating = {e["id"]: e["r"] for e in episodes}

for k, full, blurb, actor in CAST:
    sub = df[df["speaker"] == k]
    rest = df[df["speaker"] != k]
    ca = Counter(w for ts in sub["tokens"] for w in ts)
    cb = Counter(w for ts in rest["tokens"] for w in ts)
    per_season = sub.groupby(df["ep_id"].map(lambda i: episodes[i]["s"])).size()
    per_season_share = [
        round(per_season.get(s, 0) / max(1, (df["ep_id"].map(lambda i: episodes[i]["s"]) == s).sum()) * 100, 2)
        for s in range(1, 10)
    ]
    eps_in = sub.groupby("ep_id").size()
    share = (eps_in / ep_lines.loc[eps_in.index]).sort_values(ascending=False)
    # Correlation between how much they talk and how the episode rated (all episodes, 0 where absent).
    share_all = (sub.groupby("ep_id").size() / ep_lines).reindex(range(len(episodes))).fillna(0)
    ratings = np.array([ep_rating[i] for i in range(len(episodes))])
    present = share_all > 0
    r_corr = float(np.corrcoef(share_all[present], ratings[present])[0, 1]) if present.sum() > 10 else None
    texts = sub["text"].tolist()
    short = Counter(t for t in texts if len(t.split()) <= 4)
    q = sum(t.rstrip().endswith("?") for t in texts)
    ex = sum("!" in t for t in texts)
    # The transcript sometimes glues the next speaker's reply onto a line. Nobody addresses themselves by name, so skip those.
    own = re.compile(r"\b" + re.escape(k.split()[0]) + r"[,.!?]")
    longest = max((t for t in texts if not own.search(t)), key=len)
    quotes = [t for t in texts if 8 <= len(t.split()) <= 28 and not t.startswith("[")]
    random.shuffle(quotes)
    mentions = sum(len(name_pat[k].findall(t)) for t in rest["text"])
    character_out.append({
        "key": k, "name": full, "blurb": blurb, "actor": actor, "code": CODE[k],
        "lines": int(len(sub)), "words": int(sub["nwords"].sum()),
        "share": round(len(sub) / total_lines * 100, 2),
        "episodes": int(sub["ep_id"].nunique()),
        "first": int(sub["ep_id"].min()), "last": int(sub["ep_id"].max()),
        "perSeason": [int(per_season.get(s, 0)) for s in range(1, 10)],
        "perSeasonShare": per_season_share,
        "wordsPerLine": round(sub["nwords"].mean(), 1),
        "questionPct": round(q / len(texts) * 100, 1),
        "exclaimPct": round(ex / len(texts) * 100, 1),
        "signature": log_odds(ca, cb, prior, min_count=4 if len(sub) < 600 else 6 if len(sub) < 1500 else 10),
        "topShort": [{"t": t, "n": n} for t, n in short.most_common(5)],
        "longest": longest if len(longest) < 900 else longest[:900].rsplit(" ", 1)[0] + "…",
        "longestWords": len(longest.split()),
        "bigEpisodes": [{"id": int(i), "pct": round(v * 100, 1)} for i, v in share.head(5).items()],
        "ratingCorr": None if r_corr is None else round(r_corr, 3),
        "follows": [{"k": o, "n": n} for o, n in follow[k].most_common(6)],
        "mentioned": mentions,
        "quotes": quotes[:30],
    })

# Response matrix among the top 12 for the network chart
TOP12 = CAST_KEYS[:12]
matrix = [[follow[a][b] for b in TOP12] for a in TOP12]

# ---------------------------------------------------------------- episodes, per-episode transcript stats

seq = {}
for ep, g in df.groupby("ep_id"):
    seq[ep] = "".join(CODE.get(s, ".") for s in g["speaker"])

twss_re = re.compile(r"that'?s what she said", re.I)
df["twss"] = df["text"].str.replace("’", "'").str.contains(twss_re)
twss_wiki = {(2, "Sexual Harassment"), (2, "Christmas Party"), (2, "The Injury"), (3, "Gay Witch Hunt"), (3, "Initiation"),
             (3, "A Benihana Christmas"), (3, "Traveling Salesmen"), (3, "Cocktails"), (3, "Product Recall"),
             (4, "Dunder Mifflin Infinity"), (4, "Survivor Man"), (4, "The Deposition"), (4, "Dinner Party"),
             (4, "Did I Stutter?"), (5, "Weight Loss"), (5, "Crime Aid"), (5, "Employee Transfer"), (5, "Customer Survey"),
             (5, "Stress Relief"), (6, "The Meeting"), (6, "New Leads"), (6, "Whistleblower"), (7, "Costume Contest"),
             (7, "Viewing Party"), (7, "WUPHF.com"), (7, "The Seminar"), (7, "PDA"), (9, "Here Comes Treble"), (9, "Finale")}

HOLIDAY = re.compile(r"christmas|halloween|valentine|diwali|patrick|costume|spooked|santa", re.I)
TWO_PARTS = {"A Benihana Christmas", "The Job", "Fun Run", "Dunder Mifflin Infinity", "Launch Party", "Money", "Goodbye, Toby",
             "Weight Loss", "Stress Relief", "Classy Christmas", "Search Committee", "A.A.R.M.", "Finale"}

ep_out = []
for e in episodes:
    g = df[df["ep_id"] == e["id"]]
    sp = g["speaker"].value_counts()
    top = [{"k": k, "n": int(n)} for k, n in sp.items() if k in CODE][:6]
    ep_out.append({
        "id": e["id"], "s": e["s"], "e": e["e"], "t": e["title"], "date": e["date"], "r": e["r"], "votes": e["votes"],
        "v": e["viewers"], "dir": e["directors"], "wri": e["writers"],
        "lines": int(len(g)), "words": int(g["nwords"].sum()), "speakers": int(g["speaker"].nunique()),
        "top": top, "seq": seq[e["id"]],
        "c": {CODE[k]: int(n) for k, n in sp.items() if k in CODE},
        "twss": int(g["twss"].sum()), "twssWiki": (e["s"], e["title"]) in twss_wiki,
        "michael": bool((g["speaker"] == "Michael").sum() > 0),
        "holiday": bool(HOLIDAY.search(e["title"])), "hour": e["title"] in TWO_PARTS,
    })

# ---------------------------------------------------------------- seasons

season_tokens = defaultdict(Counter)
for ep, ts in zip(df["ep_id"], df["tokens"]):
    season_tokens[episodes[ep]["s"]].update(ts)

season_out = []
for s in range(1, 10):
    es = [x for x in ep_out if x["s"] == s]
    ratings = [x["r"] for x in es]
    rest = Counter()
    for o in range(1, 10):
        if o != s:
            rest.update(season_tokens[o])
    sub = df[df["ep_id"].isin([x["id"] for x in es])]
    spk = sub["speaker"].value_counts()
    season_out.append({
        "n": s, "year": es[0]["date"][:4], "endYear": es[-1]["date"][:4],
        "episodes": len(es), "first": es[0]["id"], "last": es[-1]["id"],
        "avgRating": round(float(np.mean(ratings)), 2), "avgViewers": round(float(np.mean([x["v"] for x in es])), 2),
        "best": max(es, key=lambda x: (x["r"], x["v"]))["id"], "worst": min(es, key=lambda x: (x["r"], -x["v"]))["id"],
        "lines": int(len(sub)), "words": int(sub["nwords"].sum()),
        "speakers": [{"k": k, "n": int(n)} for k, n in spk.items() if k in CODE][:10],
        "signature": log_odds(season_tokens[s], rest, prior, min_count=8, top=12),
        "twss": int(sum(x["twss"] for x in es)),
    })

# ---------------------------------------------------------------- crew

def crew_table(field):
    acc = defaultdict(list)
    for x in ep_out:
        for p in x[field]:
            acc[p].append(x["id"])
    rows = []
    for p, ids in acc.items():
        rs = [ep_out[i]["r"] for i in ids]
        rows.append({"name": p, "eps": ids, "avg": round(float(np.mean(rs)), 2), "best": max(ids, key=lambda i: ep_out[i]["r"])})
    rows.sort(key=lambda r: (-len(r["eps"]), -r["avg"]))
    return rows

directors = crew_table("dir")
writers = crew_table("wri")

# Cast members who also wrote or directed, and whether their own character talks more when they hold the pen.
CAST_CREW = [("Mindy Kaling", "Kelly"), ("B. J. Novak", "Ryan"), ("Paul Lieberstein", "Toby"), ("Steve Carell", "Michael"),
             ("Rainn Wilson", "Dwight"), ("John Krasinski", "Jim"), ("Ed Helms", "Andy"), ("Brian Baumgartner", "Kevin")]
ep_share = df.groupby(["ep_id", "speaker"]).size().unstack(fill_value=0)
ep_share = ep_share.div(ep_share.sum(axis=1), axis=0)
cast_crew = []
for person, char in CAST_CREW:
    wrote = [x["id"] for x in ep_out if person in x["wri"]]
    directed = [x["id"] for x in ep_out if person in x["dir"]]
    mine = sorted(set(wrote) | set(directed))
    active = [i for i in range(len(ep_out)) if ep_share.loc[i].get(char, 0) > 0 or (ep_out[i]["s"] <= 7 and char == "Michael")]
    others = [i for i in active if i not in mine]
    s_mine = float(np.mean([ep_share.loc[i].get(char, 0) for i in mine])) * 100 if mine else 0
    s_other = float(np.mean([ep_share.loc[i].get(char, 0) for i in others])) * 100 if others else 0
    cast_crew.append({"person": person, "char": char, "wrote": wrote, "directed": directed,
                      "shareMine": round(s_mine, 2), "shareOther": round(s_other, 2),
                      "avgRating": round(float(np.mean([ep_out[i]["r"] for i in mine])), 2) if mine else None})

# ---------------------------------------------------------------- phrases

PHRASES = [
    ("that's what she said", r"that'?s what she said"),
    ("Dunder Mifflin", r"dunder[\s-]?mifflin"),
    ("Scranton", r"\bscranton\b"),
    ("beets", r"\bbeets?\b"),
    ("Bears. Beets. Battlestar Galactica.", r"bears\W+beets"),
    ("Identity theft is not a joke", r"identity theft"),
    ("Cornell", r"\bcornell\b"),
    ("Nard Dog", r"nard[\s-]?dog"),
    ("Big Tuna", r"big tuna"),
    ("Dundie", r"\bdundies?\b"),
    ("Sabre", r"\bsabre\b"),
    ("Stamford", r"\bstamford\b"),
    ("Utica", r"\butica\b"),
    ("party planning committee", r"party planning committee"),
    ("Schrute Farms", r"schrute farms?"),
    ("Assistant to the Regional Manager", r"assistant to the regional manager"),
    ("I love you", r"\bi love you\b"),
    ("No, God, no", r"\bno\W+god\W+(please\W+)?no\b"),
    ("Toby", r"\btoby\b"),
    ("Pretzel", r"\bpretzels?\b"),
    ("Michael Scott Paper Company", r"michael scott paper company"),
    ("WUPHF", r"\bwuphf\b"),
    ("Prison Mike", r"prison mike"),
    ("paper", r"\bpaper\b"),
    ("Kevin's chili", r"\bchili\b"),
    ("Jell-O", r"\bjell-?o\b"),
]
low = df["text"].str.lower().str.replace("’", "'")
seasons_of_line = df["ep_id"].map(lambda i: episodes[i]["s"])
phrase_out = []
for label, pat in PHRASES:
    rx = re.compile(pat, re.I)
    hits = low.map(lambda t: len(rx.findall(t)))
    mask = hits > 0
    by_season = hits.groupby(seasons_of_line).sum()
    by_speaker = hits[mask].groupby(df.loc[mask, "speaker"]).sum().sort_values(ascending=False)
    by_ep = hits[mask].groupby(df.loc[mask, "ep_id"]).sum().sort_values(ascending=False)
    phrase_out.append({
        "label": label, "total": int(hits.sum()),
        "perSeason": [int(by_season.get(s, 0)) for s in range(1, 10)],
        "speakers": [{"k": k, "n": int(n)} for k, n in by_speaker.head(6).items()],
        "topEp": [{"id": int(i), "n": int(n)} for i, n in by_ep.head(3).items()],
    })

# ---------------------------------------------------------------- findings (the stats)

def welch(a, b):
    t, p = stats.ttest_ind(a, b, equal_var=False)
    pooled = math.sqrt((np.var(a, ddof=1) + np.var(b, ddof=1)) / 2)
    return {"meanA": round(float(np.mean(a)), 2), "meanB": round(float(np.mean(b)), 2), "nA": len(a), "nB": len(b),
            "t": round(float(t), 2), "p": float(f"{p:.3g}"), "d": round(float((np.mean(a) - np.mean(b)) / pooled), 2)}


def permutation(a, b, n=20000):
    a, b = np.asarray(a), np.asarray(b)
    obs = a.mean() - b.mean()
    both = np.concatenate([a, b])
    cnt = 0
    for _ in range(n):
        np.random.shuffle(both)
        if abs(both[: len(a)].mean() - both[len(a):].mean()) >= abs(obs):
            cnt += 1
    return float(f"{(cnt + 1) / (n + 1):.3g}")


R = np.array([x["r"] for x in ep_out])
V = np.array([x["v"] for x in ep_out])
goodbye = next(x["id"] for x in ep_out if x["t"] == "Goodbye, Michael")
with_m = [x for x in ep_out if x["id"] <= goodbye]
without_m = [x for x in ep_out if x["id"] > goodbye]
# Viewers without the post Super Bowl outlier, which would flatter the Michael era.
sb = next(x["id"] for x in ep_out if x["t"] == "Stress Relief")

twss_flag = [x["twss"] > 0 or x["twssWiki"] for x in ep_out]
# Compare within the Michael era too, since he says most of them and the later seasons rate lower anyway.
twss_m = [x["r"] for x, f in zip(ep_out, twss_flag) if f and x["id"] <= goodbye]
notwss_m = [x["r"] for x, f in zip(ep_out, twss_flag) if not f and x["id"] <= goodbye]

michael_share = [ep_share.loc[x["id"]].get("Michael", 0) * 100 for x in with_m]
mr = stats.pearsonr(michael_share, [x["r"] for x in with_m])

holiday = [x["r"] for x in ep_out if x["holiday"]]
nonholiday = [x["r"] for x in ep_out if not x["holiday"]]
hour = [x["r"] for x in ep_out if x["hour"]]
nonhour = [x["r"] for x in ep_out if not x["hour"]]

lines_r = stats.pearsonr([x["lines"] for x in ep_out if not x["hour"]], [x["r"] for x in ep_out if not x["hour"]])
spk_r = stats.pearsonr([x["speakers"] for x in ep_out if not x["hour"]], [x["r"] for x in ep_out if not x["hour"]])

def share_corr(key, flt):
    xs, ys = [], []
    for x in ep_out:
        n = x["c"].get(CODE[key], 0)
        if n and flt(x):
            xs.append(n / x["lines"] * 100)
            ys.append(x["r"])
    r = stats.pearsonr(xs, ys)
    return {"r": round(float(r.statistic), 3), "p": float(f"{r.pvalue:.3g}"), "n": len(xs)}


findings = {
    # Andy's big episodes cluster in seasons 8 and 9, so check the relationship inside each era as well.
    "andy": {"all": share_corr("Andy", lambda x: True), "early": share_corr("Andy", lambda x: x["s"] <= 7),
             "late": share_corr("Andy", lambda x: x["s"] >= 8)},
    "goodbye": goodbye,
    "michaelRating": welch([x["r"] for x in with_m], [x["r"] for x in without_m]),
    "michaelRatingPerm": permutation([x["r"] for x in with_m], [x["r"] for x in without_m]),
    "michaelViewers": welch([x["v"] for x in with_m if x["id"] != sb], [x["v"] for x in without_m]),
    "michaelShareCorr": {"r": round(float(mr.statistic), 3), "p": float(f"{mr.pvalue:.3g}"), "n": len(with_m)},
    "twssAll": welch([x["r"] for x, f in zip(ep_out, twss_flag) if f], [x["r"] for x, f in zip(ep_out, twss_flag) if not f]),
    "twssAllPerm": permutation([x["r"] for x, f in zip(ep_out, twss_flag) if f], [x["r"] for x, f in zip(ep_out, twss_flag) if not f]),
    "twssMichael": welch(twss_m, notwss_m),
    "twssMichaelPerm": permutation(twss_m, notwss_m),
    "twssLines": int(df["twss"].sum()),
    "twssBy": [{"k": k, "n": int(n)} for k, n in df[df["twss"]]["speaker"].value_counts().items()],
    "holiday": welch(holiday, nonholiday),
    "hour": welch(hour, nonhour),
    "linesCorr": {"r": round(float(lines_r.statistic), 3), "p": float(f"{lines_r.pvalue:.3g}")},
    "speakersCorr": {"r": round(float(spk_r.statistic), 3), "p": float(f"{spk_r.pvalue:.3g}")},
    "superBowl": sb,
}

totals = {
    "episodes": len(ep_out), "lines": int(len(df)), "words": int(df["nwords"].sum()),
    "speakers": int(df["speaker"].nunique()), "directors": len(directors), "writers": len(writers),
    "vocab": len(all_counts), "hours": round(sum(44 if x["hour"] else 22 for x in ep_out) / 60),
}

OUT.mkdir(exist_ok=True)
data = {
    "totals": totals, "episodes": ep_out, "seasons": season_out, "characters": character_out,
    "matrix": {"keys": TOP12, "m": matrix}, "directors": directors, "writers": writers, "castCrew": cast_crew,
    "phrases": phrase_out, "findings": findings, "codes": CODE,
}
(OUT / "office.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))

# Search file: one row per line, [episode id, speaker, text]. Speakers outside the cast keep their name.
lines = [[int(e), s, t] for e, s, t in zip(df["ep_id"], df["speaker"], df["text"])]
(OUT / "lines.json").write_text(json.dumps(lines, ensure_ascii=False, separators=(",", ":")))

print(json.dumps(totals))
print(json.dumps(findings, indent=1)[:3000])
