# The Office, by the numbers

Every season, character, director, writer and line of dialogue in The Office (US), counted and charted. It lives at [katsuma.ca/the-office-analysis](https://katsuma.ca/the-office-analysis/).

I first did this in 2023 as my first data project, in R. That version is still in `original/2023-report.html`. This one starts over: 188 episodes, 54,756 lines, nine season pages, 24 character pages, a page for every episode, director and writer, a search box over the whole script, and five findings with the stats explained in plain words.

It's plain HTML, CSS and JavaScript modules with hand-built SVG charts. No framework, no build step, no tracking. GitHub Pages serves the repo root as is.

## Run it locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from disk won't work, because the browser blocks `fetch` on `file://`.

## Rebuild the data

The site reads `data/office.json` (aggregates, 270 KB) and `data/lines.json` (the transcript for search, loaded only when someone searches or opens an episode).

```
pip install pandas numpy scipy
pip download schrutepy==0.1.3 --no-deps -d /tmp/schrute
tar xzf /tmp/schrute/schrutepy-0.1.3.tar.gz -C /tmp/schrute
cp /tmp/schrute/schrutepy-0.1.3/data/schrute.csv raw/
python3 scripts/build_data.py
```

`raw/schrute.csv` is 11 MB, so it isn't committed. `raw/episodes_2023.json` came out of the 2023 report with `scripts/extract_2023.py`.

## One correction

The 2023 version merged its tables on season and title, which put every two-part episode in twice: 201 rows for 188 episodes. Everything here is recomputed with one row per episode. The "that's what she said" result changed the most.

## Sources

- [The Office dataset](https://www.kaggle.com/datasets/nehaprabhavalkar/the-office-dataset) and [The Office episodes data](https://www.kaggle.com/datasets/bcruise/the-office-episodes-data), Kaggle
- [schrute](https://github.com/bradlindblad/schrute), full transcripts
- [TidyTuesday 2020-03-17](https://github.com/rfordatascience/tidytuesday/tree/master/data/2020/2020-03-17), IMDb vote counts
- [Dunderpedia](https://theoffice.fandom.com/wiki/List_of_the_times_somebody_says_%22That%27s_what_she_said%22), "that's what she said" list

A fan project. Not affiliated with NBC or Deedle-Dee Productions.
