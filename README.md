# The Office, by the numbers

Every season, character, director, writer and line of dialogue in The Office (US), counted and charted. It lives at [katsuma.ca/the-office-analysis](https://katsuma.ca/the-office-analysis/).

I first did this in 2023 as my first data project, in R. That version is still in `original/2023-report.html`. This one starts over: 188 episodes, 54,756 lines, nine season pages, 24 character pages, a page for every episode, director and writer, a search box over the whole script, five findings with the stats explained in plain words, a daily Who Said It? quiz, the Dundies, and a page that measures the couples.

It's plain HTML, CSS and JavaScript modules with hand-built SVG charts. No framework, no build step, no tracking. GitHub Pages serves the repo root as is.

## Run it locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from disk won't work, because the browser blocks `fetch` on `file://`.

## Rebuild the data

The site reads `data/office.json` (aggregates, about 380 KB), `data/quiz.json` (the quiz's line pool) and `data/lines/1.json` to `9.json` (the transcript, one file per season, loaded only when an episode page or the search needs it).

```
pip install pandas numpy scipy
pip download schrutepy==0.1.3 --no-deps -d /tmp/schrute
tar xzf /tmp/schrute/schrutepy-0.1.3.tar.gz -C /tmp/schrute
cp /tmp/schrute/schrutepy-0.1.3/data/schrute.csv raw/
python3 scripts/build_data.py
```

`raw/schrute.csv` is 11 MB, so it isn't committed. `raw/episodes_2023.json` came out of the 2023 report with `scripts/extract_2023.py`.

## Corrections

The 2023 version merged its tables on season and title, which put every two-part episode in twice: 201 rows for 188 episodes. Everything here is recomputed with one row per episode. The "that's what she said" result changed the most.

The transcript has its own problems, fixed or flagged in `scripts/build_data.py`. It was cut into pages of 244 rows and then sorted by row-within-page, so in 149 episodes everything past row 244 was dealt in between the opening lines, one each. Sorting by page then row puts them back: Performance Review's page one ends on Jim's "Oh-" and page two opens with Pam's "As a human being." Five episodes still have a stretch where two scenes trade lines in the source itself, and anything that depends on line order skips or flags those. About 225 lines had broken characters (`â€”`) and are repaired. Plain "David" in The Seminar is David Brent, not David Wallace, plain "Robert" outside Robert California's run (Search Committee to Free Family Portrait Studio) is Senator Lipton or someone from Weyer-Hammer, and the Pete in Employee Transfer and Niagara is Jim's brother.

## Sources

- [The Office dataset](https://www.kaggle.com/datasets/nehaprabhavalkar/the-office-dataset) and [The Office episodes data](https://www.kaggle.com/datasets/bcruise/the-office-episodes-data), Kaggle
- [schrute](https://github.com/bradlindblad/schrute), full transcripts
- [TidyTuesday 2020-03-17](https://github.com/rfordatascience/tidytuesday/tree/master/data/2020/2020-03-17), IMDb vote counts
- [Dunderpedia](https://theoffice.fandom.com/wiki/List_of_the_times_somebody_says_%22That%27s_what_she_said%22), "that's what she said" list

A fan project. Not affiliated with NBC or Deedle-Dee Productions.
