// Question generators for the endless quiz. No DOM in here, so a Node script can play thousands of rounds and
// check every answer against the data (see scripts/check_quiz.mjs).
//
// make(type, level, ctx) returns { id, type, level, ask, choices: [{ t, k?, ep? }], answer, ...details } or null.
// ctx = { D, bank, rnd, seen: Set } where bank is data/quizbank.json and rnd is a () => [0, 1) function.

export const LEVELS = ['easy', 'medium', 'hard'];
export const POINTS = { easy: 1, medium: 2, hard: 3 };

export const TYPES = [
  { id: 'who', name: 'Who Said It?', blurb: 'A line from the script. Four people who could have said it.', group: 'script' },
  { id: 'episode', name: 'Name That Episode', blurb: 'A line from the script. Which episode is it from?', group: 'script' },
  { id: 'finish', name: 'Finish the Line', blurb: 'The start of a line. Pick how it ends.', group: 'script' },
  { id: 'opening', name: 'Opening Lines', blurb: 'The first lines of an episode. Name it.', group: 'script' },
  { id: 'words', name: 'Five Words', blurb: 'The words one episode says far more than the rest of the show.', group: 'script' },
  { id: 'name', name: 'Who Are They Talking About?', blurb: 'A line with somebody’s name blanked out. Whose?', group: 'script' },
  { id: 'plot', name: 'Storylines', blurb: 'A-plots, B-plots, pranks and the things people keep in their desks.', group: 'show' },
  { id: 'missing', name: 'Who’s Not There?', blurb: 'Three of them talk in this episode. One doesn’t say a word.', group: 'show' },
  { id: 'talk', name: 'Who Talked Most?', blurb: 'Four people in one episode. Who has the most lines?', group: 'show' },
  { id: 'order', name: 'Which Aired First?', blurb: 'Four episodes. Put your finger on the earliest.', group: 'show' },
  { id: 'firsts', name: 'Firsts and Lasts', blurb: 'Where somebody says their first line, or their last.', group: 'show' },
  { id: 'rating', name: 'Higher Rated', blurb: 'Four episodes. Which one do IMDb voters like best?', group: 'scenes' },
  { id: 'crew', name: 'Behind the Camera', blurb: 'Who wrote it, who directed it.', group: 'scenes' },
];
export const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));

// ---------------------------------------------------------------- helpers

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
export function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const take = (arr, n, rnd) => shuffle(arr, rnd).slice(0, n);
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Builds the four choices with the right one at a random spot.
function deal(right, wrong, rnd) {
  const choices = shuffle([right, ...wrong], rnd);
  return { choices, answer: choices.indexOf(right) };
}

// Things the generators need over and over, worked out once per data load.
const cache = new WeakMap();
function prep(D, bank) {
  if (cache.has(bank)) return cache.get(bank);
  const E = D.episodes;
  const cast = D.characters.map((c) => c.key);
  const byLines = [...cast].sort((a, b) => D.char[b].lines - D.char[a].lines);
  const speaks = (k, e) => (e.c[D.codes[k]] || 0) > 0;
  // Niagara and The Delivery each sit in the data as two parts of one hour. A part's twin is never a wrong answer.
  const twin = (a, b) => a.id !== b.id && a.date === b.date;
  const lines = bank.lines.map(([ep, k, t, who, epi], i) => ({ i, ep, k, t, who, epi, n: t.split(/\s+/).length }));
  const P = {
    E, cast, byLines, speaks, twin, lines,
    whoPool: {
      easy: lines.filter((l) => l.who === 1),
      medium: lines.filter((l) => l.who <= 2),
      hard: lines.filter((l) => l.who >= 2),
    },
    epPool: {
      easy: lines.filter((l) => l.epi === 1 && l.who <= 2),
      medium: lines.filter((l) => l.epi <= 2),
      hard: lines.filter((l) => l.epi >= 2 || l.who >= 2),
    },
    // Lines that quote someone else end in a stray quote mark once they're cut, so they sit this one out.
    finishPool: {
      easy: lines.filter((l) => l.who === 1 && l.n >= 10 && !/["“”]/.test(l.t)),
      medium: lines.filter((l) => l.who <= 2 && l.n >= 10 && !/["“”]/.test(l.t)),
      hard: lines.filter((l) => l.n >= 10 && !/["“”]/.test(l.t)),
    },
    named: (bank.named || []).map(([ep, k, t, who], i) => ({ i, ep, k, t, who })),
    bySeason: Array.from({ length: 10 }, (_, s) => E.filter((e) => e.s === s)),
    trivia: { easy: bank.trivia.filter((q) => q.d === 1), medium: bank.trivia.filter((q) => q.d === 2), hard: bank.trivia.filter((q) => q.d === 3) },
  };
  cache.set(bank, P);
  return P;
}

// Three wrong episodes for a right one: other seasons when it's easy, the same season when it isn't, and the
// nearest neighbours in air order when it's hard.
function wrongEpisodes(P, e, level, rnd) {
  const ok = (x) => x.id !== e.id && !P.twin(x, e);
  if (level === 'easy') {
    const seasons = take([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((s) => s !== e.s), 3, rnd);
    return seasons.map((s) => pick(P.bySeason[s].filter(ok), rnd));
  }
  const same = P.bySeason[e.s].filter(ok);
  if (level === 'medium') return take(same, 3, rnd);
  return [...same].sort((a, b) => Math.abs(a.id - e.id) - Math.abs(b.id - e.id) || rnd() - 0.5).slice(0, 3);
}

const epChoice = (e) => ({ t: e.t, ep: e.id });
const kChoice = (k) => ({ t: k, k });

// ---------------------------------------------------------------- the types

const MAKERS = {
  who(P, D, level, rnd) {
    const l = pick(P.whoPool[level], rnd);
    const e = P.E[l.ep];
    const others = P.cast.filter((k) => k !== l.k);
    let wrong;
    if (level === 'easy') {
      wrong = take(P.byLines.slice(0, 10).filter((k) => k !== l.k), 3, rnd);
    } else if (level === 'medium') {
      const season = others.filter((k) => (D.char[k].perSeason[e.s - 1] || 0) > 0);
      wrong = take(season, 3, rnd);
    } else {
      const inEp = others.filter((k) => P.speaks(k, e));
      const season = others.filter((k) => !inEp.includes(k) && (D.char[k].perSeason[e.s - 1] || 0) > 0);
      wrong = [...take(inEp, 3, rnd), ...take(season, 3, rnd)].slice(0, 3);
    }
    if (wrong.length < 3) return null;
    const right = kChoice(l.k);
    return { id: `who:${l.i}`, line: l, ep: l.ep, k: l.k, ...deal(right, wrong.map(kChoice), rnd) };
  },

  episode(P, D, level, rnd) {
    const l = pick(P.epPool[level], rnd);
    const e = P.E[l.ep];
    const wrong = wrongEpisodes(P, e, level, rnd);
    if (wrong.length < 3 || wrong.some((x) => !x)) return null;
    return { id: `episode:${l.i}`, line: l, ep: e.id, ...deal(epChoice(e), wrong.map(epChoice), rnd) };
  },

  finish(P, D, level, rnd) {
    const l = pick(P.finishPool[level], rnd);
    const words = l.t.split(/\s+/);
    // Cut off the last three to six words, but keep at least five up front and a dozen letters in the ending.
    const cut = [3, 4, 5, 6].find((m) => words.length - m >= 5 && words.slice(-m).join(' ').length >= 12);
    if (!cut) return null;
    const start = words.slice(0, -cut).join(' ');
    const end = words.slice(-cut).join(' ');
    const e = P.E[l.ep];
    // Wrong endings come from other lines: anyone's when it's easy, the same person's when it's harder.
    const pool = level === 'easy'
      ? P.finishPool.hard.filter((x) => x.k !== l.k)
      : P.finishPool.hard.filter((x) => x.k === l.k && x.i !== l.i && (level === 'medium' || P.E[x.ep].s === e.s));
    const seen = new Set([norm(end)]);
    const wrong = [];
    for (const x of shuffle(pool, rnd).slice(0, 200)) {
      const w = x.t.split(/\s+/);
      if (w.length < cut + 5) continue;
      const tail = w.slice(-cut).join(' ');
      if (tail.length < 12 || seen.has(norm(tail))) continue;
      seen.add(norm(tail));
      wrong.push({ t: tail });
      if (wrong.length === 3) break;
    }
    if (wrong.length < 3) return null;
    return { id: `finish:${l.i}`, line: l, ep: l.ep, k: l.k, start, ...deal({ t: end }, wrong, rnd) };
  },

  opening(P, D, level, rnd) {
    const [id, rows] = pick(P.bankOpen, rnd);
    const e = P.E[id];
    const wrong = wrongEpisodes(P, e, level, rnd);
    if (wrong.length < 3 || wrong.some((x) => !x)) return null;
    const show = level === 'easy' ? 4 : level === 'medium' ? 3 : 2;
    return { id: `opening:${id}`, ep: id, rows: rows.slice(0, show), ...deal(epChoice(e), wrong.map(epChoice), rnd) };
  },

  words(P, D, level, rnd) {
    const e = pick(P.E.filter((x) => (x.kw || []).length >= 5), rnd);
    const wrong = wrongEpisodes(P, e, level, rnd);
    if (wrong.length < 3 || wrong.some((x) => !x)) return null;
    const words = e.kw.slice(0, level === 'hard' ? 3 : 5);
    return { id: `words:${e.id}`, ep: e.id, words, ...deal(epChoice(e), wrong.map(epChoice), rnd) };
  },

  name(P, D, level, rnd) {
    if (!P.named.length) return null;
    const l = pick(P.named, rnd);
    const e = P.E[l.ep];
    const c = D.char[l.who];
    const [first, ...rest] = c.name.split(' ');
    const last = rest.at(-1);
    // Blank the first name, and the surname with it when it follows ("Andy Bernard"), so neither gives it away.
    const re = new RegExp(`\\b${first}(?:\\s+${last})?\\b`, 'gi');
    const blanked = l.t.replace(re, '____');
    // "Jimothy" still says Jim.
    if (!blanked.includes('____') || blanked.toLowerCase().includes(first.toLowerCase())) return null;
    const others = P.cast.filter((k) => k !== l.who && k !== l.k && k !== 'David Wallace');
    let wrong;
    if (level === 'easy') wrong = take(P.byLines.slice(0, 12).filter((k) => others.includes(k)), 3, rnd);
    else if (level === 'medium') wrong = take(others.filter((k) => (D.char[k].perSeason[e.s - 1] || 0) > 0), 3, rnd);
    else {
      const inEp = others.filter((k) => P.speaks(k, e));
      wrong = [...take(inEp, 3, rnd), ...take(others.filter((k) => !inEp.includes(k) && (D.char[k].perSeason[e.s - 1] || 0) > 0), 3, rnd)].slice(0, 3);
    }
    if (wrong.length < 3) return null;
    return { id: `name:${l.i}`, ep: l.ep, k: l.k, who: l.who, line: l, blanked, ...deal(kChoice(l.who), wrong.map(kChoice), rnd) };
  },

  firsts(P, D, level, rnd) {
    // Most of the cast starts in the Pilot and ends in the Finale, so past easy those two aren't the answer.
    const end = P.E.length - 1;
    const asks = D.characters.flatMap((c) => [[c, false], [c, true]]).filter(([c, last]) => {
      const at = last ? c.last : c.first;
      return at != null && c.first !== c.last && (level === 'easy' || (at !== 0 && at !== end));
    });
    const [c, last] = pick(asks, rnd);
    const id = last ? c.last : c.first;
    const e = P.E[id];
    const wrong = wrongEpisodes(P, e, level, rnd).filter((x) => x && x.id !== c.first && x.id !== c.last);
    if (wrong.length < 3) return null;
    return { id: `firsts:${c.key}:${last ? 'last' : 'first'}`, ep: id, k: c.key, last, ...deal(epChoice(e), wrong.map(epChoice), rnd) };
  },

  plot(P, D, level, rnd) {
    const pool = P.trivia[level].length ? P.trivia[level] : [...P.trivia.easy, ...P.trivia.medium, ...P.trivia.hard];
    if (!pool.length) return null;
    const q = pick(pool, rnd);
    return { id: `plot:${q.id}`, ep: q.ep, q, ...deal({ t: q.a }, q.w.map((t) => ({ t })), rnd) };
  },

  missing(P, D, level, rnd) {
    const e = pick(P.E, rnd);
    const there = P.cast.filter((k) => P.speaks(k, e));
    // Who's missing: on easy, someone who isn't on the show that season at all; on medium, someone who is; on
    // hard, someone who talks in the episode right before or after.
    const gone = P.cast.filter((k) => !P.speaks(k, e));
    const inSeason = (k) => (D.char[k].perSeason[e.s - 1] || 0) > 0;
    const nextDoor = (k) => [P.E[e.id - 1], P.E[e.id + 1]].some((x) => x && P.speaks(k, x));
    const cands = level === 'easy' ? gone.filter((k) => !inSeason(k) && P.byLines.indexOf(k) < 16)
      : level === 'medium' ? gone.filter(inSeason)
        : gone.filter((k) => inSeason(k) && nextDoor(k));
    if (!cands.length || there.length < 3) return null;
    const absent = pick(cands, rnd);
    // On hard, the three who do talk are the ones with the fewest lines.
    const present = level === 'hard'
      ? [...there].sort((a, b) => e.c[D.codes[a]] - e.c[D.codes[b]] || rnd() - 0.5).slice(0, 3)
      : take(there, 3, rnd);
    return { id: `missing:${e.id}:${absent}`, ep: e.id, k: absent, present, ...deal(kChoice(absent), present.map(kChoice), rnd) };
  },

  talk(P, D, level, rnd) {
    const e = pick(P.E, rnd);
    const there = P.cast.filter((k) => P.speaks(k, e)).map((k) => ({ k, n: e.c[D.codes[k]] })).sort((a, b) => b.n - a.n);
    if (there.length < 4) return null;
    let four;
    if (level === 'easy') four = [there[0], ...take(there.slice(3), 3, rnd)];
    else if (level === 'medium') four = [there[0], ...take(there.slice(1, 8), 3, rnd)];
    else four = there.slice(0, 4);
    four.sort((a, b) => b.n - a.n);
    // The top one has to be clear: easy needs a big gap, hard only needs to win.
    const gap = four[0].n / four[1].n;
    if (four[0].n === four[1].n || (level === 'easy' && gap < 1.8) || (level === 'medium' && gap < 1.25)) return null;
    return { id: `talk:${e.id}:${level}`, ep: e.id, counts: four, ...deal(kChoice(four[0].k), four.slice(1).map((x) => kChoice(x.k)), rnd) };
  },

  order(P, D, level, rnd) {
    let four;
    if (level === 'easy') {
      four = take([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, rnd).map((s) => pick(P.bySeason[s], rnd));
    } else if (level === 'medium') {
      const s = 1 + Math.floor(rnd() * 8);
      four = take([...P.bySeason[s], ...P.bySeason[s + 1]], 4, rnd);
    } else {
      four = take(P.bySeason[1 + Math.floor(rnd() * 9)], 4, rnd);
    }
    if (four.some((a, i) => four.some((b, j) => i < j && (a.id === b.id || P.twin(a, b))))) return null;
    const first = four.reduce((a, b) => (b.id < a.id ? b : a));
    return { id: `order:${four.map((x) => x.id).sort((a, b) => a - b).join('-')}`, ep: first.id, eps: four.map((x) => x.id), ...deal(epChoice(first), four.filter((x) => x !== first).map(epChoice), rnd) };
  },

  rating(P, D, level, rnd) {
    const pool = level === 'hard' ? P.bySeason[1 + Math.floor(rnd() * 9)] : P.E;
    const four = take(pool, 4, rnd);
    if (four.some((a, i) => four.some((b, j) => i < j && P.twin(a, b)))) return null;
    four.sort((a, b) => b.r - a.r);
    const gap = four[0].r - four[1].r;
    if (gap < (level === 'easy' ? 0.75 : level === 'medium' ? 0.3 : 0.1) - 1e-9) return null;
    return { id: `rating:${four.map((x) => x.id).sort((a, b) => a - b).join('-')}`, ep: four[0].id, eps: four.map((x) => x.id), ...deal(epChoice(four[0]), four.slice(1).map(epChoice), rnd) };
  },

  crew(P, D, level, rnd) {
    if (level === 'easy') {
      // Cast members who wrote or directed. Only episodes where exactly one of them did the job.
      const jobs = [];
      for (const job of ['wrote', 'directed']) {
        const by = new Map();
        for (const p of D.castCrew) for (const id of p[job]) by.set(id, [...(by.get(id) || []), p]);
        for (const [id, ps] of by) if (ps.length === 1) jobs.push({ id, p: ps[0], job });
      }
      const j = pick(jobs, rnd);
      const people = D.castCrew.filter((p) => p !== j.p && p[j.job].length && !p[j.job].includes(j.id));
      const pad = D.castCrew.filter((p) => p !== j.p && !people.includes(p) && !p[j.job].includes(j.id));
      const wrong = [...take(people, 3, rnd), ...take(pad, 3, rnd)].slice(0, 3);
      if (wrong.length < 3) return null;
      const c = (p) => ({ t: p.person, k: p.char });
      return { id: `crew:${j.job}:${j.id}`, ep: j.id, job: j.job, cast: true, person: j.p.person, ...deal(c(j.p), wrong.map(c), rnd) };
    }
    const job = level === 'medium' ? 'wrote' : 'directed';
    const e = pick(P.E, rnd);
    const mine = job === 'wrote' ? e.wri : e.dir;
    const right = pick(mine, rnd);
    const list = job === 'wrote' ? D.writers : D.directors;
    const season = list.filter((p) => !mine.includes(p.name) && p.eps.some((id) => P.E[id].s === e.s));
    const rest = list.filter((p) => !mine.includes(p.name) && !season.includes(p));
    const wrong = [...take(season, 3, rnd), ...take(rest, 3, rnd)].slice(0, 3).map((p) => ({ t: p.name }));
    if (wrong.length < 3) return null;
    return { id: `crew:${job}:${e.id}`, ep: e.id, job, person: right, all: mine, ...deal({ t: right }, wrong, rnd) };
  },
};

// One question of the given type and level. Tries a few times to find one that isn't in ctx.seen; if the pool is
// used up it hands back a repeat rather than nothing (ctx.seen gets cleared by the caller).
export function make(type, level, ctx) {
  const P = prep(ctx.D, ctx.bank);
  P.bankOpen ??= ctx.bank.open;
  const fn = MAKERS[type];
  let fallback = null;
  for (let tries = 0; tries < 60; tries++) {
    const q = fn(P, ctx.D, level, ctx.rnd);
    if (!q) continue;
    q.type = type;
    q.level = level;
    if (!ctx.seen?.has(q.id)) return q;
    fallback ??= q;
  }
  if (fallback) fallback.repeat = true;
  return fallback;
}

// Types that have something to ask at this level (Storylines needs its hand-written bank).
export const available = (bank) => TYPES.filter((t) => t.id !== 'plot' || bank.trivia.length);

// ---------------------------------------------------------------- score, kept per type and level

export const RANKS = [
  [0, 'Temp', 'Everyone starts somewhere. Ryan started here.'],
  [10, 'Receptionist', 'Dunder Mifflin, this is you.'],
  [30, 'Salesman', 'You have a desk and a phone. Sell some paper.'],
  [75, 'Assistant to the Regional Manager', 'Not Assistant Regional Manager. Dwight checked.'],
  [150, 'Assistant Regional Manager', 'The title Dwight wanted. Jim had it for a while.'],
  [300, 'Regional Manager', 'Scranton is yours. Order the mug.'],
  [600, 'Corporate', 'A desk in New York and a view of the city.'],
  [1000, 'CFO', 'David Wallace’s old job. He’d be proud.'],
  [2000, 'World’s Best Boss', 'It says so on the mug.'],
];
export function rankOf(total) {
  let i = 0;
  while (i + 1 < RANKS.length && total >= RANKS[i + 1][0]) i++;
  const [at, title, line] = RANKS[i];
  const next = RANKS[i + 1] || null;
  return { i, at, title, line, next: next ? { at: next[0], title: next[1] } : null };
}

// Five right in a row and every answer after that pays double until a miss.
export const STREAK = 5;
export const award = (level, streak) => POINTS[level] * (streak >= STREAK ? 2 : 1);
