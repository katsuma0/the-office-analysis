"""Build data/clips.json: the official YouTube clips each episode page embeds.

    python3 scripts/build_clips.py            check every pick against YouTube, then write the file
    python3 scripts/build_clips.py --offline  write the file from the picks as they stand, no network

The picks are in scripts/clips_picks.json, matched to episodes by hand and by search:
    { "ep": <episode id in data/office.json>, "id": "<YouTube video id>", "title": "...", "evidence": "..." }
in the order they should show. Nothing is hosted here. The page plays them in YouTube's own player.

A pick is kept only if YouTube's oEmbed endpoint says the video exists, can be embedded, and belongs to one of
the channels below, the embed page says it plays, and it is not a vertical Short. Anything else is dropped and
listed, so a clip that is taken down later falls off the site the next time this runs instead of leaving a dead
player.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PICKS = ROOT / "scripts" / "clips_picks.json"
OUT = ROOT / "data" / "clips.json"

# The show's own channel, and the service that streams it.
OFFICIAL = {"@TheOffice", "@peacock"}
PER_EPISODE = 3
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def get(url, referer=None):
    headers = {"User-Agent": UA, "Accept-Language": "en-CA,en;q=0.9"}
    if referer:
        headers["Referer"] = referer
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def oembed(vid):
    """(ok, channel handle, title) from YouTube's public oEmbed endpoint."""
    try:
        j = json.loads(get(f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json"))
    except urllib.error.HTTPError as err:
        # 401 and 403: embedding is off or the video is private. 404: no such video.
        return False, f"HTTP {err.code}", ""
    return True, j.get("author_url", "").rsplit("/", 1)[-1], j.get("title", "")


def plays_embedded(vid):
    """The embed page carries the player's verdict. It needs a referrer, the same as a real embed does."""
    html = get(f"https://www.youtube.com/embed/{vid}", referer="https://example.com/")
    m = re.search(r'previewPlayabilityStatus\\?":\{\\?"status\\?":\\?"(\w+)\\?"(?:,\\?"playableInEmbed\\?":(true|false))?', html)
    return bool(m and m.group(1) == "OK" and m.group(2) == "true")


def is_short(vid):
    """A Short answers at /shorts/<id>. An ordinary video is redirected to its watch page."""
    req = urllib.request.Request(f"https://www.youtube.com/shorts/{vid}", headers={"User-Agent": UA}, method="HEAD")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False


def clean(title):
    """The channel signs every title. The episode page doesn't need the signature, or the upload's sales tags."""
    dash = "\u2013\u2014"
    t = re.sub(r"\s+", " ", title).strip()
    t = re.sub(rf"\s*[-|{dash}]\s*The Office(?: US)?\s*$", "", t, flags=re.I)
    t = re.sub(rf"^The Office(?: US)?\s*[|:{dash}-]\s*", "", t, flags=re.I)
    t = re.sub(r"\s*\((?:Episode Highlight|EXCLUSIVE)\)\s*$", "", t, flags=re.I)
    return t.replace("\u2014", ", ").replace("\u2013", "-").strip()


def main():
    offline = "--offline" in sys.argv
    episodes = json.loads((ROOT / "data" / "office.json").read_text())["episodes"]
    picks = json.loads(PICKS.read_text())
    eps, dropped, seen = {}, [], set()
    for p in picks:
        ep, vid = p.get("ep"), str(p.get("id", ""))
        where = f"{ep} {vid}"
        if not isinstance(ep, int) or not 0 <= ep < len(episodes):
            dropped.append((where, "no such episode")); continue
        if not VIDEO_ID.match(vid):
            dropped.append((where, "not a video id")); continue
        if vid in seen:
            dropped.append((where, "listed twice")); continue
        seen.add(vid)
        title = p.get("title", "")
        if not offline:
            ok, channel, live_title = oembed(vid)
            time.sleep(0.35)
            if not ok:
                dropped.append((where, f"oEmbed says {channel}")); continue
            if channel not in OFFICIAL:
                dropped.append((where, f"channel is {channel}")); continue
            if not plays_embedded(vid):
                dropped.append((where, "does not play embedded")); continue
            if is_short(vid):
                dropped.append((where, "is a vertical Short")); continue
            time.sleep(0.35)
            title = live_title or title
        if len(eps.setdefault(str(ep), [])) < PER_EPISODE:
            eps[str(ep)].append({"id": vid, "t": clean(title)})

    eps = {k: eps[k] for k in sorted(eps, key=int) if eps[k]}
    out = {"v": 1, "checked": date.today().isoformat(), "eps": eps}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    n = sum(len(v) for v in eps.values())
    print(f"{n} clips on {len(eps)} of {len(episodes)} episodes -> {OUT.relative_to(ROOT)}")
    for where, why in dropped:
        print(f"  dropped {where}: {why}")


if __name__ == "__main__":
    main()
