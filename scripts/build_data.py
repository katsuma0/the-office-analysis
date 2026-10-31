"""Build the site's data files from the raw sources.

Inputs:
  raw/episodes_2023.json   episode table pulled out of the 2023 R report (scripts/extract_2023.py)
  raw/schrute.csv          full transcript from schrutepy 0.1.3, not committed, see README
  raw/office_ratings.csv   TidyTuesday 2020-03-17, used only for IMDb vote counts

Outputs:
  data/office.json         everything the pages need, aggregated
  data/lines/1.json ...    the transcript, one file per season, [episode id, speaker, text] per line
  data/quiz.json           the line pool for Who Said It?
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

# Episodes that aired as one hour-long broadcast but sit in the ratings table as a single row.
# Streaming services count these as two, which is why fans know Dinner Party as S4 E13, not E9.
TWO_PARTS = {"A Benihana Christmas", "The Job", "Fun Run", "Dunder Mifflin Infinity", "Launch Party", "Money", "Goodbye, Toby",
             "Weight Loss", "Stress Relief", "Classy Christmas", "Search Committee", "A.A.R.M.", "Finale"}

stream_offset = defaultdict(int)
for i, e in enumerate(episodes):
    e["id"] = i
    e["viewers"] = round(float(e["v"]) / 1e6, 2)
    e["date"] = pd.to_datetime(e["date"]).strftime("%Y-%m-%d")
    e["directors"] = split_people(e["dir"])
    e["writers"] = split_people(e["wri"])
    e["votes"] = votes_map.get((e["s"], norm_title(e["title"])))
    n = e["e"] + stream_offset[e["s"]]
    e["stream"] = f"{n}-{n + 1}" if e["title"] in TWO_PARTS else str(n)
    if e["title"] in TWO_PARTS:
        stream_offset[e["s"]] += 1

# ---------------------------------------------------------------- transcript

df = pd.read_csv(RAW / "schrute.csv")

# Upstream, each episode was cut into pages of 244 rows and then sorted by row-within-page, so
# anything past row 244 got dealt in between the opening rows: page 1 row 0, page 2 row 0, page 1
# row 1, and so on. In Performance Review, "Jim: Oh-" at the end of page 1 is answered by
# "Pam: As a human being." at the top of page 2. Sorting back by (page, row) undoes it exactly.
# The page size counts the empty rows too, so this runs before they're dropped.
PAGE = 244


def unpage(g):
    # Row d of the file is line true_pos[d] of the episode.
    true_pos = sorted(range(len(g)), key=lambda j: (j % PAGE, j // PAGE))
    return g.iloc[np.argsort(true_pos)]


df = pd.concat([unpage(g) for _, g in df.groupby(["season", "episode_name"], sort=False)]).reset_index(drop=True)
df["paged"] = df.groupby(["season", "episode_name"], sort=False)["text"].transform("size") > PAGE

df["text"] = df["text"].fillna("").astype(str).str.strip()
df["text_w_direction"] = df["text_w_direction"].fillna("").astype(str)
df = df[df["text"] != ""].copy()

# About 225 lines were saved as UTF-8 and read back as cp1252 somewhere upstream ("justâ€”I").
MOJI = re.compile(r"Ã.|â€.|Â.")


def fix_moji(t):
    if not MOJI.search(t):
        return t
    try:
        return t.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return t


df["text"] = df["text"].map(fix_moji)
df["text_w_direction"] = df["text_w_direction"].map(fix_moji)

ALIASES = {
    "Deangelo": "DeAngelo", "Denagelo": "DeAngelo", "DeAgnelo": "DeAngelo", "Daryl": "Darryl", "Darrly": "Darryl",
    "Darry": "Darryl", "Packer": "Todd Packer", "Todd": "Todd Packer", "Micheal": "Michael", "Michel": "Michael",
    "Micahel": "Michael", "Michae": "Michael", "M ichael": "Michael", "Dwigt": "Dwight", "Dight": "Dwight",
    "DwightKSchrute": "Dwight", "Robert California": "Robert", "Ryan Howard": "Ryan", "Phylis": "Phyllis",
    "Angels": "Angela", "Anglea": "Angela", "Angel": "Angela", "Kelly Kapoor": "Kelly", "Stanely": "Stanley",
    "Meridith": "Meredith", "Holy": "Holly", "abe": "Gabe", "Nellie Bertram": "Nellie", "Dacvid Walalce": "David Wallace",
    "David Wallcve": "David Wallace", "Dacvid Wallace": "David Wallace", "Chares": "Charles", "Senator": "Senator Lipton",
    "Senator Liptop": "Senator Lipton",
}
# Plain "David" and "Robert" mean different people in a few episodes.
EPISODE_ALIASES = {
    ("The Seminar", "David"): "David Brent",
    ("Classy Christmas (Parts 1&2)", "Robert"): "Senator Lipton",
    ("Stairmageddon", "Robert"): "Senator Lipton",
    ("Paper Airplane", "Robert"): "Robert (Weyer-Hammer)",
    # Jim's brother, at the engagement lunch and the wedding, years before Erin's Pete.
    ("Employee Transfer", "Pete"): "Pete Halpert",
    ("Niagara (Parts 1&2)", "Pete"): "Pete Halpert",
}


def clean_speaker(c, episode_name):
    c = str(c)
    c = re.sub(r"\[[^\]]*\]", "", c)           # "Pam [on phone]"
    c = re.sub(r'\s+as\s+".*$', "", c)          # 'Pam as "fourth-biggest client"'
    c = c.replace('"', "").strip().strip(":").strip()
    c = re.sub(r"\s+", " ", c)
    if (episode_name, c) in EPISODE_ALIASES:
        return EPISODE_ALIASES[(episode_name, c)]
    if c == "David":
        return "David Wallace"
    return ALIASES.get(c, c)


df["speaker"] = [clean_speaker(c, n) for c, n in zip(df["character"], df["episode_name"])]
# "Man on Phone" and "Man on phone" are one person.
canon = {}
for k in df["speaker"].value_counts().index:
    canon.setdefault(k.lower(), k)
df["speaker"] = df["speaker"].map(lambda s: canon[s.lower()])

# Map each transcript episode onto the ratings table by season + title.
by_key = {(e["s"], norm_title(e["title"])): e for e in episodes}
by_key_part = defaultdict(list)
for e in episodes:
    m = re.match(r"(.*?):? part (\d)$", e["title"].lower())
    if m:
        by_key_part[(e["s"], norm_title(m.group(1)))].append(e)

ALIAS_TITLES = {"coverup": "cover"}

df["ep_id"] = -1
df["order"] = range(len(df))
approx_split = set()
for (s, name), g in df.groupby(["season", "episode_name"], sort=False):
    k = norm_title(name)
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
        # Niagara and The Delivery aired as one hour but sit in the ratings data as two episodes.
        # The transcript is one file with no marker between the parts, so the split is at the halfway line.
        half = len(g) // 2
        df.loc[g.index[:half], "ep_id"] = parts[0]["id"]
        df.loc[g.index[half:], "ep_id"] = parts[1]["id"]
        approx_split.update(p["id"] for p in parts)
        continue
    raise SystemExit(f"no match for transcript episode {s} {name!r} ({k})")

missing = sorted(set(range(len(episodes))) - set(df["ep_id"]))
assert not missing, [episodes[i]["title"] for i in missing]
df = df.sort_values(["ep_id", "order"]).reset_index(drop=True)
title_of = {e["id"]: e["title"] for e in episodes}

# Robert California is only in Search Committee through Free Family Portrait Studio.
rc_first = next(e["id"] for e in episodes if e["title"] == "Search Committee")
rc_last = next(e["id"] for e in episodes if e["title"] == "Free Family Portrait Studio")
df.loc[(df["speaker"] == "Robert") & ~df["ep_id"].between(rc_first, rc_last), "speaker"] = "Robert (other)"

# ---------------------------------------------------------------- scrambled episodes

# With the pages put back, a few episodes still have a stretch where two scenes trade lines, and
# that one's in the source itself. I found these by looking for runs where a speaker comes back
# four lines later more often than two lines later, then read each one. Crime Aid's auction and
# New Boss's echo bit trip the same test and are real, so this is a hand-checked list.
LOCAL_SHUFFLE = {"The Dundies", "The Incentive", "After Hours", "Andy's Ancestry", "Dwight Christmas"}
scrambled = {e["id"] for e in episodes if e["title"] in LOCAL_SHUFFLE}
assert len(scrambled) == len(LOCAL_SHUFFLE), "a LOCAL_SHUFFLE title didn't match"

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
    ("Gabe", "Gabe Lewis", "Sabre's coordinator for emerging regions. Tall.", "Zach Woods"),
    ("Robert", "Robert California", "CEO of Sabre. The Lizard King.", "James Spader"),
    ("Creed", "Creed Bratton", "Quality assurance, in theory. Nobody knows where he was before.", "Creed Bratton"),
    ("David Wallace", "David Wallace", "CFO, then unemployed, then owner of the whole company.", "Andy Buckley"),
    ("Karen", "Karen Filippelli", "Came over from Stamford. Dated Jim. Left for Utica.", "Rashida Jones"),
]
CAST_KEYS = [c[0] for c in CAST]
CODE = {k: chr(65 + i) for i, k in enumerate(CAST_KEYS)}  # A..X, '.' = everyone else
FIRST = {k: k.split()[0] for k in CAST_KEYS}

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
two three first last big great new day people man oh-oh hi hello bye wow god whoa o
""".split())

WORD_RE = re.compile(r"[a-z][a-z'\-]*[a-z]|[a-z]")


def tokens(text):
    words = [w.strip("'-") for w in WORD_RE.findall(text.lower().replace("’", "'"))]
    # The transcript spells it both ways.
    return ["schrute" if w == "shrute" else w for w in words]


def norm(text):
    """Punctuation-blind form for phrase matching: "Bears. Beets. Battlestar" -> "bears beets battlestar"."""
    t = text.lower().replace("’", "'").replace("‘", "'").replace("'", "")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


df["tokens"] = df["text"].map(tokens)
df["nwords"] = df["tokens"].map(len)
df["norm"] = df["text"].map(norm)
# Lines repaired from mojibake carry real em dashes; the rest of the transcript writes them as hyphens ("I--this").
# Swapped after tokenizing and with the spacing kept, so no word or line count moves.
for col in ("text", "text_w_direction"):
    df[col] = df[col].str.replace("\u2014", "--", regex=False)
df["season"] = df["ep_id"].map(lambda i: episodes[i]["s"])


def log_odds(counts_a, counts_b, prior, min_count=8, top=14):
    """Weighted log-odds with an informative Dirichlet prior (Monroe, Colaresi & Quinn 2008).

    Raw frequency would give every character the same list ("Michael", "Dwight", "office").
    This asks which words a group uses unusually often relative to everyone else.
    """
    na, nb, a0 = sum(counts_a.values()), sum(counts_b.values()), sum(prior.values())
    out = []
    for w, ya in counts_a.items():
        if ya < min_count or w in STOP or len(w) < 3:
            continue
        yb = counts_b.get(w, 0)
        aw = prior[w]
        da = math.log((ya + aw) / (na + a0 - ya - aw))
        db = math.log((yb + aw) / (nb + a0 - yb - aw))
        var = 1 / (ya + aw) + 1 / (yb + aw)
        out.append((w, (da - db) / math.sqrt(var), ya))
    out.sort(key=lambda x: -x[1])
    return [{"w": w, "z": round(z, 1), "n": n} for w, z, n in out[:top]]


all_counts = Counter(w for ts in df["tokens"] for w in ts)
prior = Counter({w: c * 0.01 for w, c in all_counts.items()})
total_lines = len(df)

# Who speaks right after whom, inside the same episode, in episodes whose order can be trusted.
follow = defaultdict(Counter)
prev_sp, prev_ep = None, None
for sp, ep in zip(df["speaker"], df["ep_id"]):
    if ep == prev_ep and sp != prev_sp and ep not in scrambled:
        follow[prev_sp][sp] += 1
    prev_sp, prev_ep = sp, ep
next_total = Counter()
for a, row in follow.items():
    next_total.update(row)
all_changes = sum(next_total.values())


def lift(a, b):
    """How much more often b speaks after a than b speaks after anyone else."""
    row = sum(follow[a].values())
    others = all_changes - row
    base = (next_total[b] - follow[a][b]) / others if others else 0
    return (follow[a][b] / row) / base if row and base else 0


name_pat = {k: re.compile(r"\b" + re.escape(FIRST[k]) + r"\b", re.I) for k in CAST_KEYS}
# Not names, so they're taken out before anyone's name is counted: Michael's "Deck the halls with boughs of holly"
# (season 3, a season before Holly arrives), Erin's "For Pete's sake", and famous namesakes. Kevin Costner isn't Kevin.
NOT_A_NAME = re.compile(
    r"\b(?:boughs of holly|for pete['’]?s sake|kevin (?:costner|nealon|durant)|jim carrey|oscar mayer|ryan stiles"
    r"|michael (?:jackson|jordan|moore|winslow|phelps|cera|vick)|dwight howard|stanley kaplan"
    r"|robert (?:loggia|redford|dunder|mifflin))\b", re.I)
df["named"] = df["text"].str.replace(NOT_A_NAME, " ", regex=True)
ep_lines = df.groupby("ep_id").size()
ep_rating = {e["id"]: e["r"] for e in episodes}
FINALE = len(episodes) - 1

# Short lines a character more or less owns ("Nope." is Jim's).
GENERIC = set("""okay|ok|yes|no|yeah|hey|what|oh|hi|thank you|thanks|wow|really|right|sure|um|uh|hello|why|huh|sorry|good|great|nice|well|
oh my god|i know|come on|all right|alright|oh god|oh no|excuse me|me too|good morning|hey guys|no no no|okay okay|i dont know|
of course|uh huh|oh yeah|oh okay|yep|what what|who|where|how|yes yes|no no|hmm|ah|um um|mm hmm|mmhmm|ok ok|hey hey|bye|stop|
wait|please|go|fine|cool|ha|ha ha|oh no no|yeah yeah|what is it|oh hey|oh hi|thats right|i dont|no way|oh wow|what is that|
whats going on|what happened|seriously|totally|absolutely|definitely|exactly|good job|thank you so much|oh yes|really|
what are you doing|i love it|how are you|me|you|him|her|okay great|great great|right right|i see|oh boy|perfect|ugh""".replace("\n", "").split("|"))
short = df[df["text"].str.split().str.len() <= 5].copy()
short["key"] = short["norm"]
short_all = short["key"].value_counts()
short_by_sp = short.groupby("speaker").size()
n_short = len(short)


def owned_lines(k):
    sub = short[short["speaker"] == k]
    if sub.empty:
        return []
    base = len(sub) / n_short
    out = []
    for key, n in sub["key"].value_counts().items():
        if n < 3 or key in GENERIC or not key:
            continue
        of = int(short_all[key])
        lf = (n / of) / base
        if lf <= 1.5 or n / of < 0.5:
            continue
        raw = sub[sub["key"] == key]["text"].value_counts().index[0]
        out.append((n * math.log(lf), {"t": raw, "n": int(n), "of": of}))
    out.sort(key=lambda x: -x[0])
    picked, seen_keys = [], set()
    for _, o in out:
        kk = norm(o["t"])
        if any(kk in s or s in kk for s in seen_keys):
            continue
        seen_keys.add(kk)
        picked.append(o)
    return picked[:4]


def owned_phrases(k):
    """2 to 4 word phrases a character says far more than anyone, for people whose short lines are all generic."""
    mine, rest = Counter(), Counter()
    eps = defaultdict(set)
    for sp, ep, toks in zip(df["speaker"], df["ep_id"], df["tokens"]):
        grams = set()
        for n in (2, 3, 4):
            for i in range(len(toks) - n + 1):
                g = toks[i:i + n]
                if all(w in STOP for w in g):
                    continue
                grams.add(" ".join(g))
        target = mine if sp == k else rest
        for g in grams:
            target[g] += 1
            if sp == k:
                eps[g].add(ep)
    na, nb = sum(mine.values()), sum(rest.values())
    out = []
    for g, ya in mine.items():
        if ya < 3 or len(eps[g]) < 3:
            continue
        yb = rest.get(g, 0)
        aw = (ya + yb) * 0.01
        z = (math.log((ya + aw) / (na - ya + aw)) - math.log((yb + aw) / (nb - yb + aw))) / math.sqrt(1 / (ya + aw) + 1 / (yb + aw))
        out.append((z, g, ya, ya + yb))
    out.sort(key=lambda x: -x[0])
    picked = []
    for z, g, n, of in out:
        words = g.split()
        # "kelly and" and "is so cute" read as fragments; a phrase has to start and end on a real word.
        if words[-1] in STOP or (words[0] in STOP and words[0] not in {"the", "my", "your", "this"}):
            continue
        if n / of < 0.4 or any(g in p["p"] or p["p"] in g for p in picked):
            continue
        picked.append({"p": g, "n": int(n), "of": int(of)})
        if len(picked) == 4:
            break
    return picked


def creed_thoughts():
    sub = df[(df["speaker"] == "Creed") & (df["nwords"] >= 5)]
    others = Counter(w for sp, ts in zip(df["speaker"], df["tokens"]) if sp != "Creed" for w in ts)
    tot = sum(others.values())
    scored = []
    for ep, t, ts in zip(sub["ep_id"], sub["text"], sub["tokens"]):
        s = np.mean([-math.log((others.get(w, 0) + 0.5) / tot) for w in ts])
        scored.append((s, {"ep": int(ep), "t": t}))
    scored.sort(key=lambda x: -x[0])
    return [x[1] for x in scored[:40]]


character_out = []
for k, full, blurb, actor in CAST:
    sub = df[df["speaker"] == k]
    rest = df[df["speaker"] != k]
    ca = Counter(w for ts in sub["tokens"] for w in ts)
    cb = Counter(w for ts in rest["tokens"] for w in ts)
    per_season = sub.groupby("season").size()
    season_lines = df.groupby("season").size()
    per_season_share = [round(per_season.get(s, 0) / season_lines[s] * 100, 2) for s in range(1, 10)]
    eps_in = sub.groupby("ep_id").size()
    share = (eps_in / ep_lines.loc[eps_in.index]).sort_values(ascending=False)
    share_all = (eps_in / ep_lines).reindex(range(len(episodes))).fillna(0)
    ratings = np.array([ep_rating[i] for i in range(len(episodes))])
    present = share_all > 0
    r_corr = float(np.corrcoef(share_all[present], ratings[present])[0, 1]) if present.sum() > 10 else None
    texts = sub["text"].tolist()
    q = sum(t.rstrip().endswith("?") for t in texts)
    ex = sum("!" in t for t in texts)
    # The transcript sometimes glues the next speaker's reply onto a line. Nobody addresses themselves by name, so skip those.
    own = re.compile(r"\b" + re.escape(FIRST[k]) + r"[,.!?]")
    longest_row = max(((t, ep) for t, ep in zip(texts, sub["ep_id"]) if not own.search(t)), key=lambda x: len(x[0]))
    longest = longest_row[0]
    quotes = [t for t in texts if 8 <= len(t.split()) <= 28 and not t.startswith("[") and not own.search(t)]
    random.shuffle(quotes)
    mentions = sum(len(name_pat[k].findall(t)) for t in rest["named"])
    named_by = rest[rest["named"].str.contains(name_pat[k])].groupby("speaker").size().sort_values(ascending=False)
    sp_lines = df.groupby("speaker").size()
    # First and last words. The last only when it's reliable: 19 of 24 characters end in the Finale, whose transcript is shuffled.
    firsts = sub[sub["nwords"] >= 2]
    first_row = firsts.iloc[0]
    last_line = None
    if k == "Michael":
        hit = sub[(sub["ep_id"] == FINALE) & sub["text"].str.contains("all my kids grew up")]
        if len(hit):
            last_line = {"ep": FINALE, "t": hit.iloc[0]["text"]}
    elif int(sub["ep_id"].max()) not in scrambled:
        lr = sub.iloc[-1]
        last_line = {"ep": int(lr["ep_id"]), "t": lr["text"]}
    owned = owned_lines(k)
    gaps = []
    present_ids = sorted(eps_in.index.tolist())
    for a, b in zip(present_ids, present_ids[1:]):
        if b - a > 1:
            gaps.append((b - a - 1, a + 1, b - 1))
    gaps.sort(key=lambda x: -x[0])
    lifts = sorted(((lift(k, b), b, follow[k][b]) for b in follow[k] if follow[k][b] >= 40 and b != k), reverse=True)
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
        "owned": owned,
        "phrases": owned_phrases(k) if len(owned) < 3 else [],
        "longest": longest if len(longest) < 900 else longest[:900].rsplit(" ", 1)[0] + "…",
        "longestWords": len(longest.split()), "longestEp": int(longest_row[1]),
        "bigEpisodes": [{"id": int(i), "pct": round(v * 100, 1)} for i, v in share.head(5).items()],
        "ratingCorr": None if r_corr is None else round(r_corr, 3),
        "follows": [{"k": o, "n": n, "pct": round(n / sum(follow[k].values()) * 100, 1)} for o, n in follow[k].most_common(6)],
        "unusual": [{"k": b, "x": round(x, 1), "n": n} for x, b, n in lifts[:3] if x >= 1.5],
        "mentioned": mentions,
        "namedBy": [{"k": s, "n": int(n), "pct": round(n / sp_lines[s] * 100, 1)} for s, n in named_by.head(5).items()],
        "selfNamed": int(sub["named"].str.contains(name_pat[k]).sum()),
        "firstLine": {"ep": int(first_row["ep_id"]), "t": first_row["text"], "shuffled": int(first_row["ep_id"]) in scrambled},
        "lastLine": last_line,
        "gap": {"n": gaps[0][0], "from": gaps[0][1], "to": gaps[0][2]} if gaps else None,
        "quotes": quotes[:30],
    })
next(c for c in character_out if c["key"] == "Creed")["thoughts"] = creed_thoughts()

TOP12 = sorted(CAST_KEYS, key=lambda k: -len(df[df["speaker"] == k]))[:12]
matrix = {"keys": TOP12, "m": [[follow[a][b] for b in TOP12] for a in TOP12],
          "tot": [sum(follow[a].values()) for a in TOP12], "episodes": len(episodes) - len(scrambled)}

# ---------------------------------------------------------------- that's what she said

twss_re = re.compile(r"\bthats what she said\b")
df["twss"] = df["norm"].map(lambda t: len(twss_re.findall(t)))
# Jim asking whether the harassment policy covers it isn't a joke.
df.loc[df["text"].str.startswith("Does that include"), "twss"] = 0

# Where each joke's setup is, read by hand: "self" means it's inside the same line, -1 is the line
# before, None means the setup isn't in the transcript. With the transcript back in order, every
# setup that isn't in the joke's own line is the line right before it.
TWSS_SETUP = [None, -1, -1, -1, -1, -1, "self", -1, -1, -1, "self", "self", "self", "self", "self", -1,
              -1, -1, -1, -1, -1, "self", -1, -1, -1, -1, -1, "self", "self", "self", -1, -1]
twss_rows = df.index[df["twss"] > 0].tolist()
assert len(twss_rows) == len(TWSS_SETUP), (len(twss_rows), len(TWSS_SETUP))
twss_list = []
for row, setup in zip(twss_rows, TWSS_SETUP):
    r = df.loc[row]
    item = {"ep": int(r["ep_id"]), "k": r["speaker"], "t": r["text"], "n": int(r["twss"]), "setup": None, "self": setup == "self"}
    if isinstance(setup, int):
        s = df.loc[row + setup]
        item["setup"] = {"k": s["speaker"], "t": s["text"]}
    twss_list.append(item)
twss_wiki = {(2, "Sexual Harassment"), (2, "Christmas Party"), (2, "The Injury"), (3, "Gay Witch Hunt"), (3, "Initiation"),
             (3, "A Benihana Christmas"), (3, "Traveling Salesmen"), (3, "Cocktails"), (3, "Product Recall"),
             (4, "Dunder Mifflin Infinity"), (4, "Survivor Man"), (4, "The Deposition"), (4, "Dinner Party"),
             (4, "Did I Stutter?"), (5, "Weight Loss"), (5, "Crime Aid"), (5, "Employee Transfer"), (5, "Customer Survey"),
             (5, "Stress Relief"), (6, "The Meeting"), (6, "New Leads"), (6, "Whistleblower"), (7, "Costume Contest"),
             (7, "Viewing Party"), (7, "WUPHF.com"), (7, "The Seminar"), (7, "PDA"), (9, "Here Comes Treble"), (9, "Finale")}

HOLIDAY_EPS = {"Halloween", "Christmas Party", "Valentine's Day", "Diwali", "A Benihana Christmas", "Moroccan Christmas",
               "Employee Transfer", "Blood Drive", "Secret Santa", "St. Patrick's Day", "Costume Contest", "Classy Christmas",
               "PDA", "Spooked", "Christmas Wishes", "Here Comes Treble", "Dwight Christmas", "Couples Discount"}

# ---------------------------------------------------------------- episodes

STOP_KW = STOP | {w.lower() for w in FIRST.values()}
NOISE = re.compile(r"^((.)\2+|a+h+|o+h*|u+h+|m+|hm+|ha(ha)+|aa+h*|o+o+|ee+)$")


def episode_words(ep, title):
    mine = Counter(w for ts in df.loc[df["ep_id"] == ep, "tokens"] for w in ts)
    rest = all_counts - mine
    ttoks = set(tokens(title))
    out = []
    for item in log_odds(mine, rest, prior, min_count=3, top=40):
        w = item["w"]
        if w in ttoks or any(len(t) >= 5 and w[:5] == t[:5] for t in ttoks) or NOISE.match(w):
            continue
        out.append(item)
    return out[:6]


def two_person_runs(g):
    """Longest stretch where exactly two people talk back and forth. Shuffling can break a scene but can't fake one."""
    best = None
    sp, tx = g["speaker"].tolist(), g["text"].tolist()
    i = 0
    while i < len(sp):
        pair = {sp[i]}
        j = i + 1
        while j < len(sp) and (sp[j] in pair or len(pair) < 2):
            pair.add(sp[j])
            j += 1
        changes = sum(sp[x] != sp[x - 1] for x in range(i + 1, j))
        if len(pair) == 2 and changes >= 2 and (best is None or j - i > best["n"]):
            best = {"n": j - i, "a": sorted(pair)[0], "b": sorted(pair)[1], "start": i,
                    "lines": [[sp[x], tx[x]] for x in range(i, min(j, i + 6))], "end": [[sp[x], tx[x]] for x in range(max(i + 6, j - 2), j)]}
        # restart from the last speaker change so overlapping runs are found
        k = j - 1
        while k > i and sp[k - 1] == sp[k]:
            k -= 1
        i = max(i + 1, k)
    return best


ep_out = []
runs = []
for e in episodes:
    g = df[df["ep_id"] == e["id"]]
    sp = g["speaker"].value_counts()
    run = two_person_runs(g)
    if run:
        runs.append({**run, "ep": e["id"]})
    ep_out.append({
        "id": e["id"], "s": e["s"], "e": e["e"], "se": e["stream"], "t": e["title"], "date": e["date"], "r": e["r"],
        "votes": e["votes"], "v": e["viewers"], "dir": e["directors"], "wri": e["writers"],
        "lines": int(len(g)), "words": int(g["nwords"].sum()), "speakers": int(g["speaker"].nunique()),
        "top": [{"k": k, "n": int(n)} for k, n in sp.items() if k in CODE][:6],
        "seq": "".join(CODE.get(s, ".") for s in g["speaker"]),
        "c": {CODE[k]: int(n) for k, n in sp.items() if k in CODE},
        "twss": int(g["twss"].sum()), "twssWiki": (e["s"], e["title"]) in twss_wiki,
        "michael": bool((g["speaker"] == "Michael").sum() > 0),
        "holiday": e["title"] in HOLIDAY_EPS, "hour": e["title"] in TWO_PARTS,
        "shuffled": e["id"] in scrambled, "approx": e["id"] in approx_split,
        "kw": episode_words(e["id"], e["title"]),
        "run": {k: run[k] for k in ("n", "a", "b")} if run and run["n"] >= 15 else None,
    })
runs.sort(key=lambda r: -r["n"])
longest_scenes = [{k: r[k] for k in ("ep", "n", "a", "b", "lines", "end")} for r in runs[:12]]

# ---------------------------------------------------------------- seasons

season_tokens = defaultdict(Counter)
for s, ts in zip(df["season"], df["tokens"]):
    season_tokens[s].update(ts)

season_out = []
for s in range(1, 10):
    es = [x for x in ep_out if x["s"] == s]
    ratings = [x["r"] for x in es]
    rest = Counter()
    for o in range(1, 10):
        if o != s:
            rest.update(season_tokens[o])
    sub = df[df["season"] == s]
    spk = sub["speaker"].value_counts()
    season_out.append({
        "n": s, "year": es[0]["date"][:4], "endYear": es[-1]["date"][:4],
        "episodes": len(es), "first": es[0]["id"], "last": es[-1]["id"],
        "avgRating": round(float(np.mean(ratings)), 2), "avgViewers": round(float(np.mean([x["v"] for x in es])), 2),
        "median": round(float(np.median(ratings)), 2), "sd": round(float(np.std(ratings, ddof=1)), 2),
        "q1": round(float(np.percentile(ratings, 25)), 2), "q3": round(float(np.percentile(ratings, 75)), 2),
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
        resid = [ep_out[i]["r"] - season_out[ep_out[i]["s"] - 1]["avgRating"] for i in ids]
        rows.append({"name": p, "eps": ids, "avg": round(float(np.mean(rs)), 2), "best": max(ids, key=lambda i: ep_out[i]["r"]),
                     "vs": round(float(np.mean(resid)), 2),
                     "se": round(float(np.std(resid, ddof=1) / math.sqrt(len(resid))), 2) if len(resid) > 1 else None})
    rows.sort(key=lambda r: (-len(r["eps"]), -r["avg"]))
    return rows


directors = crew_table("dir")
writers = crew_table("wri")

# Cast members who also wrote or directed, and whether their own character talks more when they hold the pen.
# Both sides use only episodes where the character has at least one line.
CAST_CREW = [("Mindy Kaling", "Kelly"), ("B. J. Novak", "Ryan"), ("Paul Lieberstein", "Toby"), ("Steve Carell", "Michael"),
             ("Rainn Wilson", "Dwight"), ("John Krasinski", "Jim"), ("Ed Helms", "Andy"), ("Brian Baumgartner", "Kevin")]
ep_share = df.groupby(["ep_id", "speaker"]).size().unstack(fill_value=0)
ep_share = ep_share.div(ep_share.sum(axis=1), axis=0)
cast_crew = []
for person, char in CAST_CREW:
    wrote = [x["id"] for x in ep_out if person in x["wri"]]
    directed = [x["id"] for x in ep_out if person in x["dir"]]
    mine = sorted(set(wrote) | set(directed))
    present_ids = [i for i in range(len(ep_out)) if ep_share.loc[i].get(char, 0) > 0]
    mine_p = [i for i in mine if i in present_ids]
    others = [i for i in present_ids if i not in mine]
    s_mine = float(np.mean([ep_share.loc[i][char] for i in mine_p])) * 100 if mine_p else 0
    s_other = float(np.mean([ep_share.loc[i][char] for i in others])) * 100 if others else 0
    cast_crew.append({"person": person, "char": char, "wrote": wrote, "directed": directed, "nMine": len(mine_p),
                      "shareMine": round(s_mine, 2), "shareOther": round(s_other, 2),
                      "avgRating": round(float(np.mean([ep_out[i]["r"] for i in mine])), 2) if mine else None})

# ---------------------------------------------------------------- phrases, quotes, nicknames

# Patterns run on the punctuation-blind text, so "Bears. Beets." and "bears, beets" both match.
PHRASES = [
    ("That's what she said", None),
    ("Dunder Mifflin, this is Pam", r"\bdunder mifflin this is pam\b"),
    ("Bears. Beets. Battlestar Galactica.", r"\bbears beets\b"),
    ("Identity theft is not a joke", r"\bidentity theft is not a joke\b"),
    ("Assistant to the Regional Manager", r"\bassistant to the regional manager\b"),
    ("Michael Scarn", r"\bmichael scarn\b"),
    ("Prison Mike", r"\bprison mike\b"),
    ("Nard Dog", r"\bnard ?dog\b"),
    ("Big Tuna", r"\bbig tuna\b"),
    ("Cornell", r"\bcornell\b"),
    ("beet or beets", r"\bbeets?\b"),
    ("Schrute Farms", r"\bschrute farms?\b"),
    ("Dundie or Dundies", r"\bdundies?\b"),
    ("Scranton Strangler", r"\bscranton strangler\b"),
    ("party planning committee", r"\bparty planning committee\b"),
    ("Bob Vance, Vance Refrigeration", r"\bvance refrigeration\b"),
    ("I love you", r"\bi love you\b"),
    ("No, God, no", r"\bno god (please )?no\b"),
    ("Pretzel", r"\bpretzels?\b"),
    ("Michael Scott Paper Company", r"\bmichael scott paper company\b"),
    ("WUPHF", r"\bwuphf\b"),
    ("Parkour", r"\bparkour\b"),
    ("Jell-O", r"\bjell ?o\b"),
    ("Sabre", r"\bsabre\b"),
    ("Stamford", r"\bstamford\b"),
    ("Utica", r"\butica\b"),
    ("Dunder Mifflin", r"\bdunder mifflin\b"),
    ("Scranton", r"\bscranton\b"),
]


def phrase_counts(hits):
    mask = hits > 0
    by_season = hits.groupby(df["season"]).sum()
    by_speaker = hits[mask].groupby(df.loc[mask, "speaker"]).sum().sort_values(ascending=False)
    by_ep = hits[mask].groupby(df.loc[mask, "ep_id"]).sum().sort_values(ascending=False)
    first = df.loc[mask, "ep_id"].min() if mask.any() else None
    return {
        "total": int(hits.sum()), "lines": int(mask.sum()), "episodes": int(df.loc[mask, "ep_id"].nunique()),
        "perSeason": [int(by_season.get(s, 0)) for s in range(1, 10)],
        "speakers": [{"k": k, "n": int(n)} for k, n in by_speaker.head(8).items()],
        "topEp": [{"id": int(i), "n": int(n)} for i, n in by_ep.head(3).items()],
        "first": None if first is None else int(first),
    }


phrase_out = []
for label, pat in PHRASES:
    hits = df["twss"] if pat is None else df["norm"].map(lambda t, rx=re.compile(pat): len(rx.findall(t)))
    phrase_out.append({"label": label, **phrase_counts(hits)})

# Famous lines and how often the script actually has them.
QUOTES = [
    ("Bears. Beets. Battlestar Galactica.", "bears beets battlestar"),
    ("Identity theft is not a joke, Jim!", "identity theft is not a joke"),
    ("I declare bankruptcy!", "i declare bankruptcy"),
    ("Why are you the way that you are?", "why are you the way that you are"),
    ("I'm not superstitious, but I am a little stitious.", "little stitious"),
    ("Would I rather be feared or loved?", "feared or loved"),
    ("Would an idiot do that?", "would an idiot do that"),
    ("Nobody steals from Creed Bratton.", "nobody steals from creed"),
    ("How the turntables...", "how the turntables"),
    ("I've been involved in a number of cults.", "involved in a number of cults"),
    ("Sometimes I'll start a sentence and I don't even know where it's going.", "sometimes ill start a sentence"),
    ("It's Britney, bitch.", "its britney bitch"),
    ("Where are the turtles?", "where are the turtles"),
    ("Boom. Roasted.", "boom roasted"),
    ("Dunder Mifflin, this is Pam.", "dunder mifflin this is pam"),
    ("Assistant to the Regional Manager.", "assistant to the regional manager"),
    ("Did I stutter?", "did i stutter"),
    ("You miss 100% of the shots you don't take.", "shots you dont take"),
    ("I am Beyoncé, always.", "i am beyonce always"),
    ("Stanley, you've lost your mind.", "lost your mind"),
    ("World's best boss", "worlds best boss"),
    ("Why waste time say lot word when few word do trick?", "few word do trick"),
]
quote_out = []
for label, q in QUOTES:
    m = df["norm"].map(lambda t, q=q: f" {q}" in f" {t} ")
    sub = df[m]
    quote_out.append({
        "label": label, "q": q, "n": int(m.sum()),
        "who": sub["speaker"].value_counts().index[0] if len(sub) else None,
        "ep": int(sub["ep_id"].iloc[0]) if len(sub) else None,
        "eps": int(sub["ep_id"].nunique()),
    })

NICKNAMES = [
    ("Andy", "Jim", "Tuna", r"\btuna\b"),
    ("Darryl", "Michael", "Mike", r"\bmike\b"),
    ("Jim", "Pam", "Beesly", r"\bbeesle?y\b"),
    ("Jim", "Kevin", "Kev", r"\bkev\b"),
    ("Robert", "Andy", "Andrew", r"\bandrew\b"),
    ("Andy", "Andy", "Nard Dog", r"\bnard ?dog\b"),
    ("Michael", "Toby", "Toby", r"\btoby\b"),
    ("Dwight", "Mose", "Mose", r"\bmose\b"),
    ("Angela", "Sprinkles", "Sprinkles", r"\bsprinkles\b"),
    ("Andy", "Andy", "Andy Bernard", r"\bandy bernard\b"),
]
nick_out = []
for who, whom, nick, pat in NICKNAMES:
    rx = re.compile(pat)
    hits = df["norm"].map(lambda t: len(rx.findall(t)))
    mine = hits[df["speaker"] == who]
    by_season = mine.groupby(df.loc[mine.index, "season"]).sum()
    nick_out.append({"who": who, "whom": whom, "nick": nick, "n": int(mine.sum()), "lines": int((mine > 0).sum()),
                     "all": int(hits.sum()), "perSeason": [int(by_season.get(s, 0)) for s in range(1, 10)]})

MICHAEL_FACES = [
    ("Michael Scarn", r"\bscarn\b", "Secret agent, star of Threat Level Midnight."),
    ("Prison Mike", r"\bprison mike\b", "Did time. The worst thing about prison was the Dementors."),
    ("Date Mike", r"\bdate mike\b", "Nice to meet me."),
    ("Caleb Crawdad", r"\bcaleb crawdad\b", "Murder mystery, Savannah, Georgia."),
    # The transcript spells it "Michael Clump" in Weight Loss, where he does the bit; Garage Sale only remembers it.
    ("Michael Klump", r"\bklump\b|\bmichael clump\b", "The Nutty Professor, for an obesity-awareness talk with Holly."),
    ("Mykonos", r"\bmykonos\b|\bmikanos\b", "Greek, from The Seminar."),
]
faces_out = []
for name, pat, line in MICHAEL_FACES:
    rx = re.compile(pat)
    m = df["norm"].str.contains(rx)
    sub = df[m]
    faces_out.append({"name": name, "blurb": line, "n": int(m.sum()), "first": int(sub["ep_id"].min()) if len(sub) else None,
                      "eps": sorted({int(x) for x in sub["ep_id"]})})

# ---------------------------------------------------------------- couples

COUPLES = [("Jim", "Pam"), ("Michael", "Holly"), ("Michael", "Jan"), ("Dwight", "Angela"), ("Andy", "Erin"),
           ("Jim", "Karen"), ("Pam", "Roy"), ("Andy", "Angela"), ("Ryan", "Kelly"), ("Erin", "Pete"), ("Michael", "Dwight")]
ily = re.compile(r"\bi love you\b")
couples_out = []
for a, b in COUPLES:
    # Search the text with apostrophes left in, so "Pam's" counts as saying Pam. NOT_A_NAME is already out of "named".
    pa = re.compile(r"\b" + b.lower() + r"\b")
    pb = re.compile(r"\b" + a.lower() + r"\b")
    na = df[df["speaker"] == a]
    nb = df[df["speaker"] == b]
    a_says = na["named"].str.lower().map(lambda t: len(pa.findall(t)))
    b_says = nb["named"].str.lower().map(lambda t: len(pb.findall(t)))
    shared = sorted(set(na["ep_id"]) & set(nb["ep_id"]))
    back = Counter()
    prev_sp, prev_ep = None, None
    for sp, ep in zip(df["speaker"], df["ep_id"]):
        if ep == prev_ep and ep not in scrambled and {sp, prev_sp} == {a, b}:
            back[episodes[ep]["s"]] += 1
        prev_sp, prev_ep = sp, ep
    clean_shared = [i for i in shared if i not in scrambled]
    pair_runs = []
    for ep in shared:
        g = df[df["ep_id"] == ep]
        sp, tx = g["speaker"].tolist(), g["text"].tolist()
        i = 0
        while i < len(sp):
            if sp[i] not in (a, b):
                i += 1
                continue
            j = i
            while j < len(sp) and sp[j] in (a, b):
                j += 1
            changes = sum(sp[x] != sp[x - 1] for x in range(i + 1, j))
            if changes >= 2:
                pair_runs.append({"ep": int(ep), "n": j - i, "lines": [[sp[x], tx[x]] for x in range(i, min(j, i + 6))],
                                  "end": [[sp[x], tx[x]] for x in range(max(i + 6, j - 2), j)]})
            i = j
    pair_runs.sort(key=lambda r: -r["n"])
    couples_out.append({
        "a": a, "b": b,
        "aSays": int(a_says.sum()), "bSays": int(b_says.sum()),
        "aSeason": [int(a_says[na["season"] == s].sum()) for s in range(1, 10)],
        "bSeason": [int(b_says[nb["season"] == s].sum()) for s in range(1, 10)],
        "shared": [int(i) for i in shared],
        "back": int(sum(back.values())), "backSeason": [int(back.get(s, 0)) for s in range(1, 10)],
        "perShared": round(sum(back.values()) / len(clean_shared), 1) if clean_shared else 0,
        "ilyA": int(na["norm"].str.contains(ily).sum()), "ilyB": int(nb["norm"].str.contains(ily).sum()),
        "runs": pair_runs[:3],
    })

# ---------------------------------------------------------------- the Dundies

BIG = [k for k in CAST_KEYS if len(df[df["speaker"] == k]) >= 300]
by_char = {k: df[df["speaker"] == k] for k in CAST_KEYS}


def rate(k, mask):
    return float(mask[df["speaker"] == k].mean() * 1000)


def leaderboard(score, pool=BIG, n=4):
    rows = sorted(((score(k), k) for k in pool), reverse=True)
    return [{"k": k, "v": round(v, 2 if v < 10 else 1)} for v, k in rows[:n]]


def sample(k, mask, ep=None):
    sub = df[(df["speaker"] == k) & mask & (df["nwords"].between(3, 30))]
    if ep is not None:
        sub = sub[sub["ep_id"] == ep]
    if not len(sub):
        return None
    r = sub.iloc[len(sub) // 2]
    return {"t": r["text"], "ep": int(r["ep_id"])}


low_text = df["text"].str.lower()
sorry = low_text.str.contains(r"\bsorry\b")
love = df["norm"].str.contains(ily)


def directions(row):
    """Stage directions on a line, minus ones about someone else ("[Pam laughs]" on Jim's line)."""
    out = []
    for d in re.findall(r"\[([^\]]*)\]", row["text_w_direction"]):
        first = d.strip().split(" ")[0].strip(",'s").lower()
        if first in {f.lower() for f in FIRST.values()} and first != FIRST.get(row["speaker"], "").lower():
            continue
        out.append(d.lower())
    return " | ".join(out)


df["dirs"] = df.apply(directions, axis=1)


def dir_mask(pat):
    return df["dirs"].str.contains(pat, regex=True)


sing, sigh, scoff, laugh, phone = (dir_mask(p) for p in (r"\bsing", r"\bsigh", r"\bscoff", r"\blaugh", r"on (?:the )?phone"))
count_by = lambda mask: df[mask].groupby("speaker").size()
attendance = {k: int(by_char[k]["ep_id"].nunique()) for k in CAST_KEYS}

dundies = [
    {"id": "perfect-attendance", "award": "Perfect Attendance", "k": "Dwight",
     "stat": f"Has lines in all {attendance['Dwight']} episodes. Nobody else does.",
     "board": [{"k": k, "v": attendance[k]} for k in sorted(CAST_KEYS, key=lambda k: -attendance[k])[:4]], "unit": "episodes"},
    {"id": "longest-speech", "award": "Longest Speech", "k": max(CAST_KEYS, key=lambda k: next(c for c in character_out if c["key"] == k)["longestWords"]),
     "board": sorted(({"k": c["key"], "v": c["longestWords"]} for c in character_out), key=lambda r: -r["v"])[:4], "unit": "words, one line"},
    {"id": "most-apologetic", "award": "Most Apologetic", "board": leaderboard(lambda k: rate(k, sorry)), "unit": "sorries per 1,000 lines",
     "mask": "sorry"},
    {"id": "talked-about", "award": "Talked About, Not Talking",
     "board": leaderboard(lambda k: next(c for c in character_out if c["key"] == k)["mentioned"] / len(by_char[k])), "unit": "times named per line they say"},
    {"id": "fewest-words", "award": "Fewest Words", "board": sorted(({"k": k, "v": round(by_char[k]["nwords"].mean(), 1)} for k in BIG), key=lambda r: r["v"])[:4],
     "unit": "words per line"},
    {"id": "never-stops", "award": "Never Stops Talking", "board": leaderboard(lambda k: by_char[k]["nwords"].mean()), "unit": "words per line"},
    {"id": "exclamation", "award": "Exclamation Point", "board": leaderboard(lambda k: by_char[k]["text"].str.contains("!").mean() * 100), "unit": "% of lines"},
    {"id": "most-questions", "award": "Most Questions", "board": leaderboard(lambda k: by_char[k]["text"].str.rstrip().str.endswith("?").mean() * 100), "unit": "% of lines"},
    {"id": "i-love-you", "award": "Says I Love You", "board": sorted(({"k": k, "v": int(love[df["speaker"] == k].sum())} for k in CAST_KEYS), key=lambda r: -r["v"])[:4],
     "unit": "lines", "mask": "love"},
    {"id": "best-singer", "award": "Best Singer (Self-Nominated)", "board": sorted(({"k": k, "v": int(count_by(sing).get(k, 0))} for k in CAST_KEYS), key=lambda r: -r["v"])[:4],
     "unit": "lines marked singing", "mask": "sing"},
    {"id": "most-sighs", "award": "Most Sighs", "board": sorted(({"k": k, "v": int(count_by(sigh).get(k, 0))} for k in CAST_KEYS), key=lambda r: -r["v"])[:4],
     "unit": "sighs", "mask": "sigh"},
    {"id": "scoff", "award": "Lifetime Achievement in Scoffing", "board": sorted(({"k": k, "v": int(count_by(scoff).get(k, 0))} for k in CAST_KEYS), key=lambda r: -r["v"])[:4],
     "unit": "scoffs", "mask": "scoff"},
    {"id": "laughing", "award": "Lizard King Award for Laughing", "board": leaderboard(lambda k: rate(k, laugh)), "unit": "laughs per 1,000 lines", "mask": "laugh"},
    {"id": "hold-please", "award": "Hold, Please", "board": leaderboard(lambda k: rate(k, phone)), "unit": "phone lines per 1,000", "mask": "phone"},
]
masks = {"sorry": sorry, "love": love, "sing": sing, "sigh": sigh, "scoff": scoff, "laugh": laugh, "phone": phone}
for d in dundies:
    d["k"] = d.get("k") or d["board"][0]["k"]
    m = masks.get(d.pop("mask", None))
    if m is not None:
        d["line"] = sample(d["k"], m)
    elif d["id"] == "longest-speech":
        c = next(c for c in character_out if c["key"] == d["k"])
        d["line"] = {"t": c["longest"], "ep": c["longestEp"]}

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

hour = [x["r"] for x in ep_out if x["hour"]]
nonhour = [x["r"] for x in ep_out if not x["hour"]]
half = [x for x in ep_out if not x["hour"]]
lines_r = stats.pearsonr([x["lines"] for x in half], [x["r"] for x in half])
spk_r = stats.pearsonr([x["speakers"] for x in half], [x["r"] for x in half])
# Casts get bigger as the show goes on and ratings drop, so check inside each season too.
spk_dm = [x["speakers"] - np.mean([y["speakers"] for y in half if y["s"] == x["s"]]) for x in half]
r_dm = [x["r"] - np.mean([y["r"] for y in half if y["s"] == x["s"]]) for x in half]
spk_within = stats.pearsonr(spk_dm, r_dm)


def share_corr(key, flt):
    xs, ys = [], []
    for x in ep_out:
        n = x["c"].get(CODE[key], 0)
        if n and flt(x):
            xs.append(n / x["lines"] * 100)
            ys.append(x["r"])
    r = stats.pearsonr(xs, ys)
    return {"r": round(float(r.statistic), 3), "p": float(f"{r.pvalue:.3g}"), "n": len(xs)}


r_fmt = lambda r: {"r": round(float(r.statistic), 3), "p": float(f"{r.pvalue:.3g}")}
findings = {
    # Andy's big episodes cluster in seasons 8 and 9, so check the relationship inside each era as well.
    "andy": {"all": share_corr("Andy", lambda x: True), "early": share_corr("Andy", lambda x: x["s"] <= 7),
             "late": share_corr("Andy", lambda x: x["s"] >= 8)},
    "goodbye": goodbye,
    "michaelRating": welch([x["r"] for x in with_m], [x["r"] for x in without_m]),
    "michaelRatingPerm": permutation([x["r"] for x in with_m], [x["r"] for x in without_m]),
    # Same comparison without the hour-longs, Goodbye Michael and the finale run, so a few big episodes can't carry it.
    "michaelRatingCore": welch([x["r"] for x in with_m if not x["hour"] and x["id"] != goodbye],
                               [x["r"] for x in without_m if not x["hour"] and x["id"] < len(ep_out) - 3]),
    "michaelViewers": welch([x["v"] for x in with_m if x["id"] != sb], [x["v"] for x in without_m]),
    "michaelShareCorr": {**r_fmt(mr), "n": len(with_m)},
    "twssAll": welch([x["r"] for x, f in zip(ep_out, twss_flag) if f], [x["r"] for x, f in zip(ep_out, twss_flag) if not f]),
    "twssAllPerm": permutation([x["r"] for x, f in zip(ep_out, twss_flag) if f], [x["r"] for x, f in zip(ep_out, twss_flag) if not f]),
    "twssMichael": welch(twss_m, notwss_m),
    "twssMichaelPerm": permutation(twss_m, notwss_m),
    "twssCount": int(df["twss"].sum()), "twssLines": int((df["twss"] > 0).sum()),
    "twssEpisodes": int(sum(1 for x in ep_out if x["twss"] > 0)), "twssWikiOnly": int(sum(1 for x in ep_out if x["twssWiki"] and not x["twss"])),
    "twssBy": [{"k": k, "n": int(n)} for k, n in df[df["twss"] > 0].groupby("speaker")["twss"].sum().sort_values(ascending=False).items()],
    "twssList": twss_list,
    "holiday": welch([x["r"] for x in ep_out if x["holiday"]], [x["r"] for x in ep_out if not x["holiday"]]),
    "hour": welch(hour, nonhour),
    "hourMichael": welch([x["r"] for x in with_m if x["hour"]], [x["r"] for x in with_m if not x["hour"]]),
    "linesCorr": r_fmt(lines_r),
    "speakersCorr": r_fmt(spk_r), "speakersWithin": r_fmt(spk_within),
    "speakersBySeason": [round(float(np.mean([x["speakers"] for x in half if x["s"] == s])), 1) for s in range(1, 10)],
    "superBowl": sb,
}

totals = {
    "episodes": len(ep_out), "lines": int(len(df)), "words": int(df["nwords"].sum()),
    "speakers": int(df["speaker"].nunique()), "directors": len(directors), "writers": len(writers),
    "vocab": len(all_counts), "shuffled": len(scrambled),
    "repaired": int(df.loc[df["paged"], "ep_id"].nunique()), "page": PAGE,
}

OUT.mkdir(exist_ok=True)
data = {
    "totals": totals, "episodes": ep_out, "seasons": season_out, "characters": character_out,
    "matrix": matrix, "directors": directors, "writers": writers, "castCrew": cast_crew,
    "phrases": phrase_out, "quotes": quote_out, "nicknames": nick_out, "faces": faces_out, "couples": couples_out,
    "scenes": longest_scenes, "dundies": dundies, "findings": findings, "codes": CODE,
}
(OUT / "office.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))

# Transcript, one file per season so an episode page only pulls its own season.
(OUT / "lines").mkdir(exist_ok=True)
for s in range(1, 10):
    sub = df[df["season"] == s]
    rows = [[int(e), sp, t] for e, sp, t in zip(sub["ep_id"], sub["speaker"], sub["text"])]
    (OUT / "lines" / f"{s}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
old = OUT / "lines.json"
if old.exists():
    old.unlink()

# Who Said It? pool: lines that sound like the person who said them. One line each, so transcript order doesn't matter.
QUIZ_CAST = ["Michael", "Dwight", "Jim", "Pam", "Andy", "Angela", "Kevin", "Oscar", "Erin", "Ryan", "Kelly", "Darryl", "Stanley", "Creed"]
sig = {c["key"]: {w["w"] for w in c["signature"]} for c in character_out}
pool = []
for ep, sp, t, ts, nw in zip(df["ep_id"], df["speaker"], df["text"], df["tokens"], df["nwords"]):
    if sp not in QUIZ_CAST or not 8 <= nw <= 28 or t.startswith("[") or re.search(r"\b" + FIRST[sp] + r"\b", t, re.I):
        continue
    if not set(ts) & sig[sp]:
        continue
    pool.append([int(ep), sp, t])
(OUT / "quiz.json").write_text(json.dumps(pool, ensure_ascii=False, separators=(",", ":")))

print(json.dumps(totals))
print("shuffled:", sorted(title_of[i] for i in scrambled)[:80])
print("quiz pool:", len(pool))
print(json.dumps({k: v for k, v in findings.items() if k != "twssList"}, indent=1)[:2500])
