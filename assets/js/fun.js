// The Dundies (#/dundies) and Couples Discount (#/couples).

import { esc, fmt, slug, color, initials, epCode, hover, tip, observe, tableView } from './ui.js';
import { mount, epTip } from './charts.js';

// ---------------------------------------------------------------- small helpers

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const nw = (n) => NUM[n] ?? fmt.int(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const join = (a) => (a.length < 2 ? a[0] ?? '' : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const same = (a, b) => Math.abs(a - b) < 1e-9;
const first = (k) => String(k).split(' ')[0];
// The part after @ in the address. A stray % in a hand-typed or cut-off link can't be decoded, so use it raw.
function hashAnchor() {
  let h = location.hash;
  try { h = decodeURIComponent(h); } catch (e) { /* malformed escape */ }
  return h.split('@')[1];
}

// Titles in running text get quotes, like everywhere else on the site.
const epA = (D, id) => {
  const e = D.episodes[id];
  return e ? `“<a href="#/episode/${e.id}">${esc(e.t)}</a>”` : '';
};
const charA = (D, k) => (D.char[k] ? `<a href="#/character/${slug(k)}">${esc(k)}</a>` : esc(k));

// A few transcript lines carry real em dashes from the mojibake repair; the rest of the transcript writes hyphens.
const tidy = (t) => String(t ?? '').replace(/\s*\u2014\s*/g, '--').replace(/\s+/g, ' ').trim();
function clip(t, n = 220) {
  const s = tidy(t);
  if (s.length <= n) return s;
  return `${s.slice(0, n).replace(/\s+\S*$/, '').replace(/[\s,;:.-]+$/, '')}…`;
}
const scriptLn = (k, t) => `<div class="ln"><span class="sp"><i class="dot" style="background:${color(k)}"></i>${esc(k)}</span><span class="tx">${esc(t)}</span></div>`;
const avatar = (D, k, cls = '') => `<span class="avatar ${cls}" style="--cc:${color(k)}" aria-hidden="true">${esc(initials(D.char[k]?.name ?? k))}</span>`;

const shareIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3M6 7l4-4 4 4M4 11v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5"/></svg>';

// ---------------------------------------------------------------- the trophy

// A Dundie: a gold businessman on a dark base. Kelly's 2005 one is a bowler ("They didn't have any more businessmen").
const FIG = {
  suit: `<circle cx="32" cy="14.5" r="7"/><rect x="29.4" y="19.6" width="5.2" height="5" rx="1.2"/>
    <path d="M22.5 25.5Q32 21.8 41.5 25.5L44.6 53H19.4Z"/>
    <path d="M22.6 27 18.2 49.6l3.5.7L25.6 31Z"/><path d="M41.4 27l4.4 21.6-3.5.7L38.4 31Z"/>
    <rect x="41.4" y="48.4" width="12.6" height="9.4" rx="1.6"/>
    <path d="M20.6 53h10.6l-.9 23.4h-7.4ZM32.8 53h10.6l-2.3 23.4h-7.4Z"/>`,
  bowler: `<circle cx="27" cy="17.5" r="6.6"/><rect x="24.6" y="22.4" width="4.8" height="4.4" rx="1.2"/>
    <path d="M19.6 27.6Q28 23.6 36.6 27.8L39 50.4H18.4Z"/>
    <path d="M35.4 28.4 48.6 40.8 46.2 43.4 33.2 32.6Z"/><circle cx="50.2" cy="45.4" r="5.6"/>
    <path d="M21.4 28.4 11.4 37.8l2.3 2.5 10.9-8.3Z"/>
    <path d="M18.6 50.4h9.8l-4.8 26h-7.6ZM30 50.4h9l7.2 26h-7.4Z"/>`,
};
const DETAIL = {
  suit: `<path d="M32 25.4l1.5 3-1.5 12.8-1.5-12.8Z" fill="#7d5513" opacity=".55"/>
    <path d="M27 25.6l5 6.6 5-6.6" fill="none" stroke="#7d5513" stroke-width=".8" opacity=".45"/>
    <path d="M45 48.4v-2.4h5.4v2.4" fill="none" stroke="#c99630" stroke-width="1.5"/>
    <path d="M41.4 52.6h12.6" stroke="#7d5513" stroke-width=".7" opacity=".5"/>`,
  bowler: `<circle cx="49" cy="43.4" r=".95" fill="#7d5513"/><circle cx="51.6" cy="43.2" r=".95" fill="#7d5513"/><circle cx="50.4" cy="45.6" r=".95" fill="#7d5513"/>`,
};
let uid = 0;
function trophy(pose = 'suit', cls = 'dn-trophy') {
  const id = `dg${++uid}`;
  const fig = FIG[pose] || FIG.suit;
  const plinth = '<rect x="17" y="76" width="30" height="6.5" rx="1.2"/>';
  return `<svg class="${cls}" viewBox="0 0 64 106" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="12" y1="4" x2="54" y2="90">
        <stop offset="0" stop-color="#fff3bf"/><stop offset=".32" stop-color="#f2c94e"/><stop offset=".68" stop-color="#c8952e"/><stop offset="1" stop-color="#8a5f17"/>
      </linearGradient>
      <linearGradient id="${id}s" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="${id}c">${fig}${plinth}</clipPath>
    </defs>
    <ellipse class="dn-shadow" cx="32" cy="102.5" rx="25" ry="2.6"/>
    <rect x="11" y="82" width="42" height="19.5" rx="2.5" fill="#2c2420"/>
    <rect x="11" y="82" width="42" height="2.8" rx="1.4" fill="#4a3d33"/>
    <rect x="19" y="87.6" width="26" height="8.6" rx="1.2" fill="url(#${id})"/>
    <path d="M23.5 90.8h17M26.5 93.4h11" stroke="#7d5513" stroke-width=".9" stroke-linecap="round" opacity=".55"/>
    <g fill="url(#${id})">${fig}${plinth}</g>
    ${DETAIL[pose] || ''}
    <g clip-path="url(#${id}c)"><g class="dn-shine"><rect x="-30" y="-6" width="15" height="96" fill="url(#${id}s)" transform="skewX(-18)"/></g></g>
  </svg>`;
}

// ---------------------------------------------------------------- Dundies: numbers into words

// These boards come from bracketed stage directions in the fan transcript (build_data.py, dir_mask).
const STAGE = {
  'best-singer': 'marked as singing', 'most-sighs': 'marked with a sigh', scoff: 'marked with a scoff',
  laughing: 'marked as laughing', 'hold-please': 'marked as on the phone',
};

// `more` adds a decimal, for a board where two different ranks would otherwise print the same number.
function fv(a, v, more = 0) {
  if (a.id === 'talked-about') return fmt.dec(v, 2 + more);
  if (/%/.test(a.unit)) return `${fmt.dec(v, 1 + more)}%`;
  if (/per/.test(a.unit)) return fmt.dec(v, 1 + more);
  return fmt.int(v);
}

// The board is a top 4. Where the data has everyone, use it to catch a tie that the cut-off split in half.
const FULL = {
  'perfect-attendance': (D) => D.characters.map((c) => ({ k: c.key, v: c.episodes })),
  'longest-speech': (D) => D.characters.map((c) => ({ k: c.key, v: c.longestWords })),
  // Unrounded, so 0.373 and 0.368 rank as third and fourth instead of a tie at 0.37.
  'talked-about': (D) => D.characters.filter((c) => c.lines).map((c) => ({ k: c.key, v: c.mentioned / c.lines })),
  'fewest-words': (D) => D.characters.map((c) => ({ k: c.key, v: c.wordsPerLine })),
  'never-stops': (D) => D.characters.map((c) => ({ k: c.key, v: c.wordsPerLine })),
  exclamation: (D) => D.characters.map((c) => ({ k: c.key, v: c.exclaimPct })),
  'most-questions': (D) => D.characters.map((c) => ({ k: c.key, v: c.questionPct })),
  // "I love you" isn't stored per character, but each couple carries both people's counts, made with the same regex.
  // That covers everyone who gets near the board (the phrase table has nobody else above 2).
  'i-love-you': (D) => {
    const m = new Map();
    for (const c of D.couples || []) { m.set(c.a, c.ilyA); m.set(c.b, c.ilyB); }
    return [...m].filter(([k]) => D.char[k]).map(([k, v]) => ({ k, v }));
  },
};

function boardRows(D, a) {
  const b = a.board || [];
  const asc = b.length > 1 && b.every((r, i) => !i || r.v >= b[i - 1].v) && b[0].v < b[b.length - 1].v;
  const better = (x, y) => (asc ? x < y - 1e-9 : x > y + 1e-9);
  const full = FULL[a.id]?.(D);
  const exact = new Map((full || []).map((r) => [r.k, r.v]));
  let rows = b.map((r) => ({ k: r.k, v: exact.has(r.k) ? exact.get(r.k) : r.v }));
  if (!rows.length) return rows;
  rows.sort((x, y) => (asc ? x.v - y.v : y.v - x.v));
  const last = rows[rows.length - 1].v;
  if (full) {
    for (const r of full) if (same(r.v, last) && !rows.some((x) => x.k === r.k)) rows.push(r);
  } else if (rows.every((r) => Number.isInteger(r.v))) {
    // A top 4 of counts can cut a tie in half and we can't see who else is on that number, so leave that number off.
    const kept = rows.filter((r) => !same(r.v, last));
    if (kept.length >= 2) rows = kept;
  }
  for (const r of rows) {
    r.rank = 1 + rows.filter((x) => better(x.v, r.v)).length;
    r.tie = rows.some((x) => x !== r && same(x.v, r.v));
  }
  rows.asc = asc;
  return rows;
}

// The card wraps a quote in curly quotes, so quotes inside it become single ones.
const inner = (t) => t.replace(/(^|[\s([])["“]/g, '$1‘').replace(/["”]/g, '’');

function nextUp(rows) {
  const rest = rows.filter((r) => r.rank > 1);
  if (!rest.length) return [];
  const rk = Math.min(...rest.map((r) => r.rank));
  return rest.filter((r) => r.rank === rk);
}
const oneIn = (per, v) => nw(Math.round(per / v));

const STAT = {
  'perfect-attendance': (D, a, rows, f) => {
    const n = D.episodes.length;
    const w = rows[0];
    let s = w.v === n ? 'That’s all of them.' : `Has lines in ${w.v} of ${n} episodes.`;
    const g = nextUp(rows);
    const code = g.length === 1 ? D.char[g[0].k]?.code : null;
    const miss = code ? D.episodes.filter((e) => !(e.c[code] > 0)) : [];
    if (miss.length === 1) s += ` ${charA(D, g[0].k)} misses only ${epA(D, miss[0].id)}.`;
    const gb = D.findings?.goodbye;
    const mc = D.char.Michael?.code;
    if (gb != null && mc && D.episodes.slice(0, gb + 1).every((e) => e.c[mc] > 0)) {
      s += ` Honourable mention: Michael, in all ${gb + 1} episodes from ${epA(D, 0)} to ${epA(D, gb)}.`;
    }
    return { big: f(w.v), unit: 'episodes', words: s };
  },
  // The episode is on the quote's source line, so the words only say which speech it is.
  'longest-speech': (D, a, rows, f) => ({
    big: f(rows[0].v), unit: 'words in one line', words: a.line && /coal walk/i.test(a.line.t) ? 'The coal walk speech.' : '',
  }),
  'most-apologetic': (D, a, rows, f) => ({
    big: f(rows[0].v), unit: 'sorries per 1,000 lines',
    words: `About one line in ${oneIn(1000, rows[0].v)} has a “sorry” in it.`,
  }),
  'talked-about': (D, a, rows, f) => {
    const c = D.char[rows[0].k];
    const said = c ? `Other people say “${esc(first(c.key))}” ${fmt.int(c.mentioned)} times. ${esc(first(c.key))} says ${fmt.int(c.lines)} lines.` : '';
    return { big: f(rows[0].v), unit: 'times named per line said', words: said };
  },
  'fewest-words': (D, a, rows, f) => ({
    big: f(rows[0].v), unit: 'words per line',
    words: `The whole show averages ${fmt.dec(D.totals.words / D.totals.lines, 1)}.`,
  }),
  'never-stops': (D, a, rows, f) => ({
    big: f(rows[0].v), unit: 'words per line',
    words: `The whole show averages ${fmt.dec(D.totals.words / D.totals.lines, 1)}.`,
  }),
  // The unit follows the award's own word, so the card never says "Point" over "mark".
  exclamation: (D, a, rows, f) => ({
    big: f(rows[0].v), unit: `of lines have an exclamation ${/point/i.test(a.award) ? 'point' : 'mark'}`,
    words: `About one line in ${oneIn(100, rows[0].v)}.`,
  }),
  'most-questions': (D, a, rows, f) => {
    const g = nextUp(rows);
    const top = rows.filter((r) => r.rank === 1);
    let s;
    if (top.length > 1) s = `A tie between ${join(top.map((r) => charA(D, r.k)))}.`;
    else if (g.length === 1) {
      const d = fmt.dec(rows[0].v - g[0].v, 1);
      s = `${charA(D, g[0].k)} is ${d === '0.1' ? 'a tenth of a point' : `${d} points`} behind.`;
    } else s = '';
    return { big: f(rows[0].v), unit: 'of lines end in a question mark', words: `About one in ${oneIn(100, rows[0].v)}. ${s}` };
  },
  'i-love-you': (D, a, rows, f) => {
    const g = nextUp(rows);
    let s = '';
    if (g.length === 1) {
      const x = rows[0].v / g[0].v;
      s = same(x, 2) ? `Twice as many as ${charA(D, g[0].k)}.` : x >= 1.5 ? `${fmt.dec(x, 1)} times as many as ${charA(D, g[0].k)}.` : '';
    }
    return { big: f(rows[0].v), unit: 'lines with “I love you”', words: s };
  },
  'best-singer': (D, a, rows, f) => ({
    big: f(rows[0].v), unit: 'lines marked as singing',
    words: 'Self-nominated, but the stage directions agree.',
  }),
  'most-sighs': (D, a, rows, f) => {
    const g = nextUp(rows);
    const x = g.length === 1 ? rows[0].v / g[0].v : 0;
    return {
      big: f(rows[0].v), unit: 'lines with a sigh',
      words: x >= 2 ? `About ${nw(Math.round(x))} times as many as ${charA(D, g[0].k)}.` : '',
    };
  },
  scoff: (D, a, rows, f) => {
    const g = nextUp(rows);
    return { big: f(rows[0].v), unit: 'lines with a scoff', words: g.length ? `Nobody else has more than ${f(g[0].v)}.` : '' };
  },
  laughing: (D, a, rows, f) => ({
    big: f(rows[0].v), unit: 'laughs per 1,000 lines',
    words: `${esc(first(rows[0].k))} laughs on about one line in ${oneIn(1000, rows[0].v)}.`,
  }),
  'hold-please': (D, a, rows, f) => ({
    big: f(rows[0].v), unit: 'phone lines per 1,000',
    words: `About one line in ${oneIn(1000, rows[0].v)} is on the phone.`,
  }),
};

function dundieCard(D, a, i) {
  const rows = boardRows(D, a);
  if (!rows.length) return '';
  const f = (v) => fv(a, v);
  const st = (STAT[a.id] || ((D2, a2, r2, f2) => ({ big: f2(r2[0].v), unit: a2.unit, words: '' })))(D, a, rows, f);
  const k = a.k || rows[0].k;
  const name = D.char[k]?.name ?? k;
  const stage = STAGE[a.id];
  // Two different ranks printing the same number reads like a mistake, so that board gets one more decimal.
  const clash = rows.some((r) => rows.some((x) => x.rank !== r.rank && fv(a, x.v) === fv(a, r.v)));
  const fb = (v) => fv(a, v, clash ? 1 : 0);
  // The winner gets the longest bar. Where fewer wins, the bar is the winner's value over yours.
  const max = Math.max(...rows.map((r) => r.v)) || 1;
  const min = Math.min(...rows.map((r) => r.v));
  const bar = (v) => (rows.asc ? (v > 0 ? min / v : 0) : v / max);
  const line = a.line && a.line.t ? a.line : null;
  const lineE = line ? D.episodes[line.ep] : null;
  const long = line && tidy(line.t).length > 240;
  const winTie = rows.filter((r) => r.rank === 1).length > 1;
  return `<article class="dn-card rv" id="${esc(a.id)}" style="--d:${((i % 3) * 0.07).toFixed(2)}s;--cc:${color(k)}">
    <div class="dn-top">
      ${trophy()}
      <div class="dn-head">
        <p class="dn-kicker">${stage ? 'Stage-direction Dundie*' : 'Data Dundie'} <span>No. ${i + 1}</span></p>
        <h3 class="dn-award">${esc(a.award)}</h3>
        <div class="dn-winner">
          ${avatar(D, k, 'dn-av')}
          <span class="dn-goes">${winTie ? 'shared by' : 'goes to'}<b>${D.char[k] ? `<a href="#/character/${slug(k)}">${esc(name)}</a>` : esc(name)}</b></span>
        </div>
      </div>
    </div>
    <p class="dn-big"><b>${st.big}</b> <span>${esc(st.unit)}</span></p>
    ${st.words ? `<p class="dn-words">${st.words}</p>` : ''}
    <ol class="dn-board" aria-label="${rows.asc ? 'Leaderboard, fewest first' : 'Leaderboard'}">${rows.map((r) => `<li class="${r.k === k ? 'me' : ''}">
      <span class="dn-rk">${r.tie ? 'T-' : ''}${r.rank}</span>
      <span class="dn-rn"><i class="dot" style="background:${color(r.k)}"></i>${charA(D, r.k)}</span>
      <span class="dn-rt"><span style="width:${(bar(r.v) * 100).toFixed(1)}%;background:${color(r.k)}"></span></span>
      <span class="dn-rv">${fb(r.v)}</span>
    </li>`).join('')}</ol>
    ${line ? `<figure class="dn-line">
      <figcaption class="dn-cap">${stage ? `A line ${esc(stage)}` : a.id === 'longest-speech' ? 'The line' : 'On the record'}</figcaption>
      <blockquote class="dn-quote${long ? ' clamp' : ''}">${esc(inner(tidy(line.t)))}</blockquote>
      ${long ? '<button type="button" class="dn-more" aria-expanded="false">Keep reading</button>' : ''}
      ${lineE ? `<p class="dn-src">${esc(first(k))}, ${epA(D, lineE.id)} · ${epCode(lineE)}</p>` : ''}
    </figure>` : ''}
    <div class="dn-foot">
      <button type="button" class="dn-share" data-id="${esc(a.id)}" data-t="${esc(`${a.award}: ${name}. ${st.big} ${st.unit}.`)}">${shareIcon}<span>Share this Dundie</span></button>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- Dundies: the real ones

// Hand-entered from the two ceremonies the show films. Each `say` entry pulls a line out of that episode's
// transcript by its text; `before` and `after` are how many neighbouring sentences of that line to keep.
const REAL = [
  {
    title: /^the dundies$/i,
    // Jan: "we're not paying for this." Michael, later: "There's no open bar because of Jan."
    note: 'Michael’s first ceremony on camera, at Chili’s. Jan won’t pay for any of it, so there’s no open bar.',
    awards: [
      { award: 'Busiest Beaver', k: 'Phyllis', say: [{ find: 'quietly goes about their job', before: 1, after: 1 }, { find: '"Busiest Beaver" award goes' }, { find: 'This says "Bushiest Beaver"' }] },
      { award: 'Hottest in the Office', k: 'Ryan', who: 'Ryan, the temp', say: [{ find: '"Hottest in the Office" award goes', before: 1, after: 1 }] },
      { award: 'Tight-Ass', k: 'Angela', say: [{ find: '"Tight Ass" award goes', after: 3 }] },
      { award: 'Spicy Curry', k: 'Kelly', pose: 'bowler', say: [{ find: '"Spicy Curry" award goes' }, { find: 'This is a bowler' }, { find: 'any more businessmen', before: 1 }] },
      { award: 'Don’t Go in There After Me', k: 'Kevin', say: [{ find: 'This last Dundie is for Kevin', after: 1 }] },
      { award: 'Fine Work', k: 'Stanley', say: [{ find: 'this is the fine work award', after: 1 }, { find: 'last year, I got great work' }, { find: 'smelliest bowel movement', before: 1 }] },
      { award: 'Whitest Sneakers', k: 'Pam', say: [{ find: '"Whitest Sneakers" award', after: 1 }, { find: 'God gave me this Dundie', before: 1 }, { find: 'I feel God in this Chili', after: 1 }] },
    ],
    // On Michael's tape of an earlier year, with Roy accepting. It isn't handed out on the night.
    foot: {
      text: 'Longest Engagement isn’t handed out on the night. It’s on Michael’s tape of an earlier year, with Roy accepting for Pam.',
      say: [{ find: 'see you next year' }, { find: 'it gets funnier', before: 1 }, { find: 'comes across as lazy' }],
    },
  },
  {
    title: /last dundies/i,
    note: 'Deangelo co-hosts, the restaurant cuts the microphone, and everyone goes back to the office to finish.',
    awards: [
      { award: 'Extreme Repulsiveness', k: 'Toby', by: 'Deangelo', say: [{ find: 'accept the Extreme Repulsiveness Award', before: 2, after: 1 }, { find: 'I really disagree with this', after: 1 }] },
      { award: 'Best Dad', k: 'Jim', say: [{ find: 'Best Dad Dundie', before: 2 }, { find: 'think to mention me' }] },
      { award: 'Best Mom', k: 'Meredith', say: [{ find: 'Best Mom Dundie', after: 2 }, { find: 'not gonna be a good mom tonight', after: 1 }] },
      { award: 'Hottest in the Office', k: 'Danny Cordray', say: [{ find: 'Hottest in the office goes to', before: 1, after: 1 }] },
      { award: 'The Diabetes Award', k: 'Stanley', say: [{ find: 'The Diabetes Award goes', before: 1 }, { find: 'I have diabetes too', after: 1 }] },
      { award: 'Promising Assistant Manager', k: 'Dwight', by: 'Deangelo', say: [{ find: 'promising Assistant Manager Dundie', before: 1 }] },
      { award: 'Cutest Red Head in the Office', k: 'Erin', say: [{ find: 'Cutest Red Head in the Office', before: 1 }] },
      { award: 'The Michael Scott Award for Best Dundies Host', k: 'Deangelo', say: [{ find: 'Best Dundies Host', before: 1 }] },
      { award: 'Doobie Doobie Pothead Stoner of the Year', k: 'Andy', say: [{ find: 'Doobie Doobie Pothead' }, { find: 'actually wanna thank you Michael' }] },
    ],
  },
];

const norm = (s) => String(s).toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
// Sentence spans in the line, so an excerpt keeps the transcript's own spacing and punctuation.
function sentences(t) {
  const out = [];
  for (const m of t.matchAll(/[^.!?…]+(?:[.!?…]+["']?|$)/g)) {
    const e = m.index + m[0].length;
    // A stray "..." on its own belongs to the sentence before it.
    if (!/\w/.test(m[0])) { if (out.length) { out[out.length - 1].e = e; out[out.length - 1].t += m[0]; } continue; }
    out.push({ s: m.index, e, t: m[0] });
  }
  return out;
}
// Keep the sentence with the award in it plus a few around it, and mark what got cut.
function excerpt(text, find, before = 0, after = 0) {
  const t = tidy(text);
  const ss = sentences(t);
  const f = norm(find);
  const at = ss.findIndex((x) => norm(x.t).includes(f));
  // The phrase crosses a sentence break; fall back to the whole line.
  if (at < 0) return clip(t, 260);
  const lo = Math.max(0, at - before);
  const hi = Math.min(ss.length, at + after + 1);
  const body = t.slice(lo ? ss[lo].s : 0, ss[hi - 1].e).trim();
  return `${lo ? '…' : ''}${body}${hi < ss.length ? ' …' : ''}`;
}

function realShelf(D, cer, ci) {
  const e = D.episodes.find((x) => cer.title.test(x.t));
  if (!e) return '';
  cer.ep = e;
  return `<div class="card dr-shelf rv" style="--d:${ci * 0.08}s">
    <div class="dr-head">
      <h3 class="dr-title"><a href="#/episode/${e.id}">${esc(e.t)}</a></h3>
      <p class="dr-meta">${epCode(e)} · ${fmt.date(e.date)} · <span class="rating">${e.r.toFixed(1)}</span></p>
    </div>
    <p class="card-sub">${esc(cer.note)}</p>
    <p class="dr-status small muted" data-c="${ci}">Rewinding Michael’s tapes…</p>
    <ol class="dr-list">${cer.awards.map((x, i) => `<li class="dr-item" style="--d:${(i * 0.05).toFixed(2)}s">
      ${trophy(x.pose, 'dr-trophy')}
      <div class="dr-body">
        <p class="dr-award">${esc(x.award)}</p>
        <p class="dr-who"><i class="dot" style="background:${color(x.k)}"></i><span>${D.char[x.k] ? `<a href="#/character/${slug(x.k)}">${esc(x.who || x.k)}</a>` : esc(x.who || x.k)}${x.by ? `<span class="muted">, presented by ${esc(x.by)}</span>` : ''}</span></p>
        <div class="script dr-lines" data-c="${ci}" data-i="${i}"></div>
      </div>
    </li>`).join('')}</ol>
    ${cer.foot ? `<div class="dr-foot"><p>${esc(cer.foot.text)}</p><div class="script dr-lines" data-foot="${ci}"></div></div>` : ''}
  </div>`;
}

// NBC spells him Deangelo Vickers; the transcript's speaker tag is DeAngelo. Show the tag the way the prose spells it.
// (A no-op once build_data.py's alias map sends every variant to Deangelo.)
const SPELL = { DeAngelo: 'Deangelo' };

function fillReal(app, rows, cer, ci) {
  const mine = rows.filter((r) => r[0] === cer.ep.id);
  const pick = (s) => {
    const f = norm(s.find);
    const r = mine.find((x) => norm(x[2]).includes(f));
    return r ? scriptLn(SPELL[r[1]] || r[1], excerpt(r[2], s.find, s.before ?? 0, s.after ?? 0)) : '';
  };
  cer.awards.forEach((x, i) => {
    const el = app.querySelector(`.dr-lines[data-c="${ci}"][data-i="${i}"]`);
    if (el) el.innerHTML = x.say.map(pick).join('');
  });
  const foot = app.querySelector(`.dr-lines[data-foot="${ci}"]`);
  if (foot && cer.foot) foot.innerHTML = cer.foot.say.map(pick).join('');
  app.querySelector(`.dr-status[data-c="${ci}"]`)?.remove();
}

// ---------------------------------------------------------------- Dundies: share

async function share(btn) {
  const id = btn.dataset.id;
  const url = `${location.origin}${location.pathname}#/dundies@${id}`;
  const label = btn.querySelector('span');
  const say = (t) => {
    if (!label) return;
    label.textContent = t;
    btn.classList.add('done');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { label.textContent = 'Share this Dundie'; btn.classList.remove('done'); }, 2200);
  };
  if (navigator.share && matchMedia('(hover: none)').matches) {
    try { await navigator.share({ title: 'The Dundies', text: btn.dataset.t, url }); } catch (e) { /* closed the sheet */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    say('Link copied');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { /* old browser */ }
    ta.remove();
    say(ok ? 'Link copied' : 'Copy the address bar');
  }
}

// ---------------------------------------------------------------- Dundies: the wall

// Cards differ in height by a quote or two. With more than one column, each card spans as many thin grid rows as it
// needs, so a short card doesn't leave a hole above its Share button. DOM order (and tab order) stays as it is.
const ROW = 4;
const GAP = 18;
function wallLayout(wall) {
  if (!wall) return;
  const cards = [...wall.children];
  const fit = () => {
    const cols = getComputedStyle(wall).gridTemplateColumns.split(' ').filter(Boolean).length;
    const on = cols > 1;
    wall.classList.toggle('mason', on);
    for (const c of cards) c.style.gridRowEnd = on ? `span ${Math.ceil((c.offsetHeight + GAP) / ROW)}` : '';
  };
  fit();
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!wall.isConnected) { ro.disconnect(); return; }
      fit();
    });
  });
  ro.observe(wall);
  cards.forEach((c) => ro.observe(c));
}

// ---------------------------------------------------------------- the Dundies page

export function dundies(D, lines) {
  const list = (D.dundies || []).filter((a) => a.board?.length);
  const winners = list.map((a) => a.k || a.board[0].k).filter((k) => D.char[k]);
  const small = winners.length ? winners.reduce((x, y) => (D.char[y].lines < D.char[x].lines ? y : x)) : null;
  const ph = (D.phrases || []).find((p) => /dundie/i.test(p.label));
  const realEps = REAL.map((c) => D.episodes.find((x) => c.title.test(x.t))).filter(Boolean);
  const inTwo = ph ? (ph.topEp || []).filter((t) => realEps.some((e) => e.id === t.id)).reduce((s, t) => s + t.n, 0) : 0;
  const hasStage = list.some((a) => STAGE[a.id]);

  return {
    title: 'The Dundies',
    html: `
    <section class="wrap page-head dn-hero">
      <div>
        <p class="eyebrow">The Dundies</p>
        <h1>The Dundies, <em>by transcript.</em></h1>
        <p class="lede">Michael hands out Dundies every year, whether anyone wants one or not. I went through all ${fmt.int(D.totals.lines)} lines of the fan transcript and gave out ${nw(list.length)} more.</p>
        <div class="pills dn-jump"><button type="button" class="pill" data-jump="data-dundies">The Data Dundies</button><button type="button" class="pill" data-jump="the-real-ones">The real ones</button></div>
      </div>
      <div class="dn-hero-art" aria-hidden="true">${trophy('suit', 'dn-trophy dn-trophy-xl')}</div>
    </section>

    <section class="section wrap" id="data-dundies">
      <div class="section-head"><div>
        <p class="eyebrow">Part one</p>
        <h2>The Data Dundies</h2>
        <p class="lede">Counted, not voted, among everyone with a page on this site.${small ? ` Some awards are rates, which is how ${esc(small)}, with ${fmt.int(D.char[small].lines)} lines, takes one home.` : ''}</p>
      </div></div>
      <div class="dn-wall">${list.map((a, i) => dundieCard(D, a, i)).join('')}</div>
      ${hasStage ? '<p class="dn-note">* Counted from bracketed notes like [sighs] in the fan transcript. Fans didn’t mark every sigh, so read each number as “at least”.</p>' : ''}
    </section>

    <section class="section wrap" id="the-real-ones">
      <div class="section-head"><div>
        <p class="eyebrow">Part two</p>
        <h2>The real ones</h2>
        <p class="lede">The two ceremonies the show films.${ph && inTwo ? ` “Dundie” is said ${fmt.times(ph.total)} in the whole show, and ${fmt.int(inTwo)} of those are in these two episodes.` : ''}</p>
      </div></div>
      <div class="grid g2 dr-grid">${REAL.map((c, ci) => realShelf(D, c, ci)).join('')}</div>
    </section>`,
    after(app) {
      const root = app.firstElementChild || app;
      wallLayout(root.querySelector('.dn-wall'));
      root.addEventListener('click', (ev) => {
        const b = ev.target.closest('.dn-share');
        if (b) { share(b); return; }
        const j = ev.target.closest('[data-jump]');
        if (j) {
          root.querySelector(`#${CSS.escape(j.dataset.jump)}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          return;
        }
        const m = ev.target.closest('.dn-more');
        if (m) {
          const q = m.previousElementSibling;
          const was = m.getBoundingClientRect().top;
          const open = q.classList.toggle('clamp') === false;
          m.setAttribute('aria-expanded', String(open));
          m.textContent = open ? 'Show less' : 'Keep reading';
          // Collapsing a 30-line quote pulls the button up past the top of the screen. Scroll by the same amount so it stays put.
          if (!open) {
            const d = m.getBoundingClientRect().top - was;
            if (Math.abs(d) > 1) window.scrollBy({ top: d, behavior: 'instant' });
          }
        }
      });
      // Arriving from a shared link: make that card glow once it's on screen.
      const anchor = hashAnchor();
      const target = anchor && root.querySelector(`.dn-card[id="${CSS.escape(anchor)}"]`);
      if (target) target.classList.add('dn-target');

      REAL.forEach((cer, ci) => {
        if (!cer.ep) return;
        lines(cer.ep.s).then((rows) => {
          if (!root.isConnected) return;
          fillReal(root, rows, cer, ci);
        }).catch(() => {
          if (!root.isConnected) return;
          const st = root.querySelector(`.dr-status[data-c="${ci}"]`);
          if (st) st.textContent = 'The transcript didn’t load, so no speeches this time. The awards stand.';
        });
      });
    },
  };
}

// ---------------------------------------------------------------- Couples: setup

// Which pairs are which. Anything new in the data lands in "the other ones".
const MAIN = ['jim-pam', 'michael-holly', 'michael-jan', 'dwight-angela', 'andy-erin'];
const NOT = ['michael-dwight'];
const epT = (D, t) => {
  const e = D.episodes.find((x) => x.t === t);
  return e ? epA(D, e.id) : `“${esc(t)}”`;
};
const BLURB = {
  'jim-pam': () => 'A teapot, Casino Night, a gas station in the rain.',
  'michael-holly': (D) => `She arrives in ${epT(D, 'Goodbye, Toby')}, gets sent to Nashua, comes back, and he follows her to Colorado.`,
  'michael-jan': (D) => `Corporate, then the condo, the candles and ${epT(D, 'Dinner Party')}.`,
  'dwight-angela': () => 'Sprinkles, the Senator, and a wedding in the Finale.',
  'andy-erin': () => 'The Nard Dog and the receptionist. In season 9 he takes a boat trip and is gone for three months.',
  'jim-karen': () => 'Stamford, the merger, and a job interview in New York.',
  'pam-roy': () => 'Engaged since before the cameras showed up. She calls off the wedding.',
  'andy-angela': () => 'He proposes in the season 4 finale. Phyllis says something at Christmas.',
  'ryan-kelly': () => 'On, off, on, off, and in the Finale, gone together.',
  'erin-pete': (D) => `Plop. Season 9. Not Jim’s brother Pete from ${epT(D, 'Employee Transfer')}, who’s kept separate.`,
  'michael-dwight': () => 'The World’s Best Boss and the Assistant to the Regional Manager.',
};

function pairColours(c) {
  const ca = color(c.a);
  let cb = color(c.b);
  // Two people outside the palette would be the same grey; push the second one darker so the halves still read.
  if (cb === ca) cb = 'var(--ink-2)';
  return { ca, cb };
}

const dots = (c) => {
  const { ca, cb } = pairColours(c);
  return `<span class="cp-dots" aria-hidden="true"><i class="dot" style="background:${ca}"></i><i class="dot" style="background:${cb}"></i></span>`;
};
const pairName = (c, amp = '&amp;') => `${esc(c.a)} ${amp} ${esc(c.b)}`;

// A long two-person stretch only means a conversation if the transcript is in broadcast order.
const inOrder = (D, id) => {
  const e = D.episodes[id];
  return !!e && !e.shuffled;
};
// The flagged episodes have one stretch where two scenes trade lines; the rest of the transcript is fine. These runs sit
// outside that stretch and I read them by hand as one scene in order. Matched by title and opening words, not by count.
// Dwight Christmas, rows 140-153 of the episode in data/lines/9.json: Pete reads the Die Hard script, Erin reads Andy's
// email, "No more talking. It's movie time." (The mixed-up rows there are about 36-91 and the tail from 244.)
const TRUSTED = [
  { pair: 'erin-pete', t: 'Dwight Christmas', starts: 'Let Heinrich plant the detonators' },
];
const trusted = (D, c, r) => TRUSTED.some((x) => x.pair === c.id && D.episodes[r.ep]?.t === x.t
  && String(r.lines?.[0]?.[1] ?? '').replace(/^["“]/, '').startsWith(x.starts));
const solid = (D, c, r) => inOrder(D, r.ep) || trusted(D, c, r);
const nn = (...a) => (a.some((v) => v > 12) ? a.map((v) => fmt.int(v)) : a.map(nw));

// ---------------------------------------------------------------- Couples: charts

// Keyboard for a chart: Tab onto it, arrow keys step through its marks with the tooltip following, Enter opens the
// mark's page, Escape hides the tooltip. A polite live region reads each tooltip out for screen readers.
const NAV = new Set(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
function walk(el, live, o) {
  if (!el) return { paint() {} };
  el.tabIndex = 0;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', o.label);
  let i = -1;
  const paint = () => {
    el.querySelectorAll('.kb').forEach((x) => x.classList.remove('kb'));
    const node = i >= 0 && document.activeElement === el ? o.at(i) : null;
    node?.classList.add('kb');
    return node;
  };
  el.addEventListener('keydown', (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === 'Escape') { if (tip.owner() === el) tip.hide(); return; }
    if (ev.key === 'Enter' || ev.key === ' ') {
      const href = i >= 0 ? o.href(i) : null;
      if (href) { ev.preventDefault(); tip.hide(); location.hash = href; }
      return;
    }
    if (!NAV.has(ev.key)) return;
    ev.preventDefault();
    const j = i < 0 && ev.key !== 'Home' && ev.key !== 'End' ? o.start : o.move(i, ev.key);
    if (j == null) return;
    i = Math.max(0, Math.min(o.n - 1, j));
    const node = paint();
    if (!node) return;
    const r = node.getBoundingClientRect();
    const html = o.html(i);
    tip.show(`${html}<div class="tm" style="margin-top:6px">Enter opens it</div>`, { clientX: r.right, clientY: r.top + r.height / 2 }, el);
    if (live) {
      const d = document.createElement('div');
      d.innerHTML = html.replace(/<\/(div|span|b)>/g, '</$1> ');
      live.textContent = d.textContent.replace(/\s+/g, ' ').trim();
    }
  });
  el.addEventListener('blur', () => { if (tip.owner() === el) tip.hide(); paint(); });
  return { paint };
}

// A says B's name above the line, B says A's below, one column per season.
function mirror(el, D, c) {
  const { ca, cb } = pairColours(c);
  const cleanBy = Array.from({ length: 9 }, (_, s) => c.shared.filter((id) => D.episodes[id].s === s + 1 && !D.episodes[id].shuffled).length);
  const tipFor = (s) => `<div class="tt">Season ${s + 1}</div>
    <div class="tr"><span>${esc(c.a)} says “${esc(c.b)}”</span><b>${c.aSeason[s] || 0}</b></div>
    <div class="tr"><span>${esc(c.b)} says “${esc(c.a)}”</span><b>${c.bSeason[s] || 0}</b></div>
    <div class="tr" style="margin-top:6px"><span>Back-and-forths</span><b>${fmt.int(c.backSeason[s] || 0)}</b></div>
    <div class="tm">${cleanBy[s] ? `In ${fmt.plural(cleanBy[s], 'shared episode')} with a clean transcript, ${fmt.dec((c.backSeason[s] || 0) / cleanBy[s], 1)} each.` : 'No shared episodes with a clean transcript.'}</div>`;
  const kb = walk(el, el?.parentElement?.querySelector('[data-live="mirror"]'), {
    n: 9,
    start: Math.max(0, c.aSeason.findIndex((v, s) => v || c.bSeason[s])),
    label: `${c.a} saying ${c.b}'s name and ${c.b} saying ${c.a}'s, by season. Arrow keys step through the seasons; Enter opens one.`,
    at: (s) => el.querySelector(`.cp-col[data-s="${s}"] .hit`),
    html: tipFor,
    href: (s) => `#/season/${s + 1}`,
    move: (s, key) => ({ ArrowRight: s + 1, ArrowDown: s + 1, ArrowLeft: s - 1, ArrowUp: s - 1, Home: 0, End: 8 }[key]),
  });
  mount(el, (el, W) => {
    const narrow = W < 520;
    const H = narrow ? 230 : 250;
    const band = 24, padT = 20, padB = 20;
    const half = (H - band - padT - padB) / 2;
    const mid = padT + half;
    const max = Math.max(1, ...c.aSeason, ...c.bSeason);
    const cw = W / 9;
    const bw = Math.min(38, cw * 0.58);
    let body = `<line class="cp-axis" x1="0" x2="${W}" y1="${mid}" y2="${mid}"/><line class="cp-axis" x1="0" x2="${W}" y1="${mid + band}" y2="${mid + band}"/>`;
    for (let s = 0; s < 9; s++) {
      const x = cw * s + cw / 2;
      const av = c.aSeason[s] || 0, bv = c.bSeason[s] || 0;
      const ha = (av / max) * half, hb = (bv / max) * half;
      body += `<g class="cp-col" data-s="${s}">
        <rect class="hit" x="${(cw * s).toFixed(1)}" y="0" width="${cw.toFixed(1)}" height="${H}"/>
        ${av ? `<rect class="cp-up" x="${(x - bw / 2).toFixed(1)}" y="${(mid - ha).toFixed(1)}" width="${bw.toFixed(1)}" height="${ha.toFixed(1)}" rx="2.5" style="fill:${ca};--d:${(s * 0.05).toFixed(2)}s"/>
          <text x="${x.toFixed(1)}" y="${(mid - ha - 6).toFixed(1)}" text-anchor="middle" class="cp-v">${av}</text>` : ''}
        ${bv ? `<rect class="cp-down" x="${(x - bw / 2).toFixed(1)}" y="${mid + band}" width="${bw.toFixed(1)}" height="${hb.toFixed(1)}" rx="2.5" style="fill:${cb};--d:${(s * 0.05 + 0.1).toFixed(2)}s"/>
          <text x="${x.toFixed(1)}" y="${(mid + band + hb + 14).toFixed(1)}" text-anchor="middle" class="cp-v">${bv}</text>` : ''}
        <text x="${x.toFixed(1)}" y="${(mid + band / 2 + 4).toFixed(1)}" text-anchor="middle" class="lbl">${narrow ? s + 1 : `S${s + 1}`}</text>
      </g>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${body}</svg>`;
    el.querySelectorAll('.cp-col').forEach((g) => {
      const s = +g.dataset.s;
      hover(g, () => tipFor(s), `#/season/${s + 1}`);
    });
    kb.paint();
  });
}

// Every episode in air order. Top half lights up when A speaks, bottom half when B does.
function presence(D, c) {
  const sh = new Set(c.shared);
  const has = (e, k) => (D.char[k] ? (e.c[D.char[k].code] || 0) > 0 : sh.has(e.id));
  return D.episodes.map((e) => ({ e, a: has(e, c.a), b: has(e, c.b), both: sh.has(e.id) }));
}

function stripChart(el, D, c) {
  const { ca, cb } = pairColours(c);
  const P = presence(D, c);
  const S = D.seasons;
  const maxEps = Math.max(...S.map((s) => s.last - s.first + 1));
  const n = (e, k) => (D.char[k] ? e.c[D.char[k].code] || 0 : null);
  // Someone without a code is only known through shared episodes: absent when the other one is there, unknown otherwise.
  const row = (p, k, on, other) => {
    const v = n(p.e, k);
    const t = v == null ? (on ? 'speaks' : other ? 'not in it' : 'not counted') : v ? fmt.plural(v, 'line') : 'not in it';
    return `<div class="tr"><span>${esc(k)}</span><b>${t}</b></div>`;
  };
  const tipFor = (id) => {
    const p = P[id];
    return epTip(p.e, `<div style="margin-top:6px">${row(p, c.a, p.a, p.b)}${row(p, c.b, p.b, p.a)}</div>`);
  };
  const season = (id) => S.findIndex((s) => id >= s.first && id <= s.last);
  const kb = walk(el, el?.parentElement?.querySelector('[data-live="strip"]'), {
    n: P.length,
    start: Math.max(0, P.findIndex((p) => p.both)),
    label: `Every episode, marked where ${c.a} and ${c.b} speak. Arrow keys step through the episodes, up and down jump a season; Enter opens one.`,
    at: (id) => el.querySelector(`.hit[data-i="${id}"]`),
    html: tipFor,
    href: (id) => `#/episode/${id}`,
    move: (id, key) => {
      if (key === 'ArrowRight') return id + 1;
      if (key === 'ArrowLeft') return id - 1;
      if (key === 'Home') return 0;
      if (key === 'End') return P.length - 1;
      const si = season(id);
      const to = si + (key === 'ArrowDown' ? 1 : -1);
      if (si < 0 || to < 0 || to >= S.length) return id;
      return Math.min(S[to].first + (id - S[si].first), S[to].last);
    },
  });
  mount(el, (el, W) => {
    const narrow = W < 600;
    let body = '';
    let H;
    const cell = (p, x, y, w, h) => {
      const i = p.e.id;
      let r = `<rect class="cp-bg" x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${h * 2 + 1}" rx="${w > 5 ? 1.5 : 0}"/>`;
      if (p.a) r += `<rect class="cp-on" x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${h}" style="fill:${ca};opacity:${p.both ? 1 : 0.38};--d:${(i * 0.004).toFixed(3)}s"/>`;
      if (p.b) r += `<rect class="cp-on" x="${x.toFixed(2)}" y="${y + h + 1}" width="${w.toFixed(2)}" height="${h}" style="fill:${cb};opacity:${p.both ? 1 : 0.38};--d:${(i * 0.004).toFixed(3)}s"/>`;
      r += `<rect class="hit" data-i="${i}" x="${x.toFixed(2)}" y="${y - 2}" width="${w.toFixed(2)}" height="${h * 2 + 5}"/>`;
      return r;
    };
    if (!narrow) {
      const gap = 4;
      const cw = (W - gap * (S.length - 1)) / P.length;
      const h = 15;
      P.forEach((p) => { body += cell(p, p.e.id * cw + (p.e.s - 1) * gap, 2, Math.max(0.8, cw - (cw > 3 ? 1 : 0.3)), h); });
      S.forEach((s) => {
        const x0 = s.first * cw + (s.n - 1) * gap;
        const x1 = (s.last + 1) * cw + (s.n - 1) * gap;
        body += `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${2 + h * 2 + 18}" text-anchor="middle" class="lbl">S${s.n}</text>`;
      });
      H = 2 + h * 2 + 24;
    } else {
      const lw = 26, h = 7, rowH = h * 2 + 1 + 7;
      const cw = (W - lw) / maxEps;
      S.forEach((s, si) => {
        const y = 2 + si * rowH;
        body += `<text x="0" y="${y + h + 4}" class="lbl">S${s.n}</text>`;
        for (let id = s.first; id <= s.last; id++) body += cell(P[id], lw + (id - s.first) * cw, y, Math.max(1, cw - 1.5), h);
      });
      H = 2 + S.length * rowH;
    }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${body}</svg>`;
    el.querySelectorAll('.hit').forEach((r) => {
      const id = +r.dataset.i;
      hover(r, () => tipFor(id), `#/episode/${id}`);
    });
    kb.paint();
  });
}

// ---------------------------------------------------------------- Couples: one pair

function panelHtml(D, c) {
  const { ca, cb } = pairColours(c);
  const E = D.episodes;
  const P = presence(D, c);
  const onlyA = P.filter((p) => p.a && !p.b).length;
  const onlyB = P.filter((p) => p.b && !p.a).length;
  const peak = (arr) => {
    const m = Math.max(...arr);
    if (!m) return 'Never.';
    const tot = arr.reduce((x, y) => x + y, 0);
    const ss = arr.map((v, i) => (v === m ? i + 1 : 0)).filter(Boolean);
    if (m === tot) return m === 1 ? `Just once, in season ${ss[0]}.` : `All ${m} in season ${ss[0]}.`;
    return ss.length === 1 ? `Most in season ${ss[0]}, with ${m}.` : `Most in seasons ${join(ss.map(String))}, ${m} each.`;
  };
  // The longest run that can be trusted as one conversation. Only if a pair has none does another stand in, with a warning.
  const runs = c.runs || [];
  const good = runs.filter((r) => solid(D, c, r));
  const run = good[0] || runs[0];
  const runE = run ? E[run.ep] : null;
  const stitched = !!run && !good.length;
  const hidden = run ? run.n - run.lines.length - (run.end?.length || 0) : 0;
  const rest = runs.filter((r) => r !== run);
  const above = rest.filter((r) => r.n > run.n);
  // The data keeps each pair's top three runs (build_data.py, pair_runs[:3]), so the third one's length may be shared by
  // runs past the cut (Jim & Pam have three at 23). Leave that length off, the way the Dundie boards do. A tie with the
  // longest one is still named: recounted from data/lines, Andy & Erin (18) and Jim & Karen (11) have exactly three each.
  const cutN = runs.length >= 3 ? runs[runs.length - 1].n : -1;
  const tied = rest.filter((r) => run && r.n === run.n);
  const below = rest.filter((r) => run && r.n < run.n && r.n !== cutN);
  const byN = [];
  for (const r of below) {
    const g = byN.find((x) => x.n === r.n);
    if (g) g.rs.push(r); else byN.push({ n: r.n, rs: [r] });
  }
  let runNotes = '';
  if (stitched) {
    runNotes += '<p class="cp-fine">That transcript has a stretch where two scenes trade lines, so this may be more than one conversation.</p>';
  } else if (run) {
    if (above.length) runNotes += `<p class="cp-fine">${join(above.map((r) => `${epA(D, r.ep)} (${r.n})`))} ${above.length > 1 ? 'are' : 'is'} longer on paper, but two scenes trade lines in ${above.length > 1 ? 'those transcripts' : 'that transcript'}.</p>`;
    if (tied.length) runNotes += `<p class="cp-fine">Tied at ${run.n} lines with ${join(tied.map((r) => `${epA(D, r.ep)}${solid(D, c, r) ? '' : ' (mixed-up transcript)'}`))}.</p>`;
    if (byN.length) runNotes += `<p class="cp-fine">Next longest: ${join(byN.map((g) => `${join(g.rs.map((r) => epA(D, r.ep)))} (${g.n}${g.rs.length > 1 ? ' each' : ''}${g.rs.some((r) => !solid(D, c, r)) ? ', mixed-up transcript' : ''})`))}.</p>`;
  }
  const pages = [c.a, c.b].filter((k) => D.char[k]);
  const missing = [c.a, c.b].filter((k) => !D.char[k]);

  return `
    <div class="cp-hero">
      <div class="cp-avs">${avatar(D, c.a, 'cp-av')}${avatar(D, c.b, 'cp-av')}</div>
      <div class="cp-hero-t">
        <h2 class="cp-title">${esc(c.a)} <span class="cp-amp">&amp;</span> ${esc(c.b)}</h2>
        ${BLURB[c.id] ? `<p class="cp-blurb">${BLURB[c.id](D)}</p>` : ''}
        ${pages.length ? `<p class="cp-pages small">${pages.map((k) => `<a class="link-arrow" href="#/character/${slug(k)}">${esc(D.char[k].name)}</a>`).join('')}</p>` : ''}
      </div>
    </div>
    <div class="stats cp-stats rv">
      <div class="stat"><div class="stat-label">Shared episodes</div><div class="stat-value">${c.shared.length}<small>of ${E.length}</small></div><div class="stat-note">Both of them speak.</div></div>
      <div class="stat"><div class="stat-label">Back-and-forths</div><div class="stat-value">${c.clean ? fmt.dec(c.perShared, 1) : '–'}</div><div class="stat-note">${c.clean ? `Per shared episode. ${fmt.int(c.back)} across ${c.clean === c.shared.length ? `all ${fmt.int(c.clean)}` : `the ${fmt.int(c.clean)} with a clean transcript`}.` : 'None of their shared episodes has a clean transcript.'}</div></div>
      <div class="stat"><div class="stat-label">${esc(first(c.a))} says “${esc(first(c.b))}”</div><div class="stat-value">${fmt.int(c.aSays)}</div><div class="stat-note">${peak(c.aSeason)}</div></div>
      <div class="stat"><div class="stat-label">${esc(first(c.b))} says “${esc(first(c.a))}”</div><div class="stat-value">${fmt.int(c.bSays)}</div><div class="stat-note">${peak(c.bSeason)}</div></div>
      <div class="stat"><div class="stat-label">“I love you” lines</div><div class="stat-value cp-ily"><span>${c.ilyA}<small>${esc(c.a)}</small></span><span>${c.ilyB}<small>${esc(c.b)}</small></span></div><div class="stat-note">Said to anyone, over the whole show.</div></div>
    </div>
    <div class="grid g-7-5 mt cp-pair-grid">
      <div class="card rv">
        <h3 class="card-title">Saying each other’s name</h3>
        <p class="card-sub">Talking to each other or about each other, it all counts.</p>
        <div class="legend"><span><i class="sq" style="background:${ca}"></i>${esc(c.a)}, above the line</span><span><i class="sq" style="background:${cb}"></i>${esc(c.b)}, below</span></div>
        <div class="cp-mirror"></div>
        <p class="cp-sr" aria-live="polite" data-live="mirror"></p>
      </div>
      <div class="card rv cp-runcard${stitched ? ' cp-stitched' : ''}" style="--d:.06s">
        <h3 class="card-title">${stitched ? 'Their longest stretch' : 'Their longest conversation'}</h3>
        ${run && runE ? `<p class="card-sub"><b class="cp-runn">${run.n} lines</b> ${stitched ? 'in a row from just the two of them, in the transcript of' : 'with nobody else getting a word in, in'} ${epA(D, runE.id)}, <span class="cp-nw">${epCode(runE)}</span>.</p>
        <div class="script cp-run">${run.lines.map(([k, t]) => scriptLn(k, clip(t, 200))).join('')}${hidden > 0 ? `<div class="cp-gap"><span>${fmt.plural(hidden, 'more line')}</span></div>` : ''}${(run.end || []).map(([k, t]) => scriptLn(k, clip(t, 200))).join('')}</div>
        ${runNotes}` : '<p class="card-sub">No stretch where only the two of them talk.</p>'}
      </div>
    </div>
    <div class="card rv mt">
      <div class="card-head">
        <div>
          <h3 class="card-title">Every episode, both of them</h3>
          <p class="card-sub">One cell per episode, in air order. Top half ${esc(c.a)}, bottom half ${esc(c.b)}; solid means both.${missing.length ? ` ${join(missing.map(esc))} ${missing.length > 1 ? 'aren’t' : 'isn’t'} one of the ${D.characters.length} people I track episode by episode, so that half only shows up when ${esc(missing.length > 1 ? 'they' : (missing[0] === c.a ? c.b : c.a))} is there too.` : ''}</p>
        </div>
        <p class="cp-tally small">${[`Both: <b>${c.shared.length}</b>`, D.char[c.b] ? `Only ${esc(c.a)}: <b>${onlyA}</b>` : `${esc(c.a)} without ${esc(c.b)}: <b>${onlyA}</b>`, D.char[c.b] && D.char[c.a] ? `Only ${esc(c.b)}: <b>${onlyB}</b>` : ''].filter(Boolean).join(' · ')}</p>
      </div>
      <div class="cp-strip"></div>
      <p class="cp-sr" aria-live="polite" data-live="strip"></p>
    </div>`;
}

function drawPanel(panel, D, c) {
  tip.hide();
  // The id doubles as the anchor for #/couples@<pair>, which the router scrolls to.
  panel.id = c.id;
  panel.setAttribute('aria-labelledby', `cp-tab-${c.id}`);
  panel.classList.remove('cp-enter');
  panel.innerHTML = panelHtml(D, c);
  mirror(panel.querySelector('.cp-mirror'), D, c);
  stripChart(panel.querySelector('.cp-strip'), D, c);
  void panel.offsetWidth;
  panel.classList.add('cp-enter');
}

// ---------------------------------------------------------------- the Couples page

export function couples(D) {
  const E = D.episodes;
  const list = (D.couples || []).map((c) => {
    const shared = c.shared.filter((id) => E[id]);
    const clean = shared.filter((id) => !E[id].shuffled).length;
    // Same sum as the data's perShared (back over clean shared episodes), unrounded so the ranking is exact.
    return { ...c, id: slug(`${c.a}-${c.b}`), shared, clean, perShared: clean ? c.back / clean : 0 };
  });
  if (!list.length) return null;
  const byId = Object.fromEntries(list.map((c) => [c.id, c]));
  const groups = [
    { label: 'The couples', items: MAIN.map((id) => byId[id]).filter(Boolean) },
    { label: 'The other ones', items: list.filter((c) => !MAIN.includes(c.id) && !NOT.includes(c.id)) },
    { label: 'Not a couple, but', items: NOT.map((id) => byId[id]).filter(Boolean) },
  ].filter((g) => g.items.length);

  // The headline is whoever has the most back-and-forth per shared episode, among the actual couples.
  const romantic = list.filter((c) => !NOT.includes(c.id) && c.shared.length >= 10 && c.clean);
  const ranked = [...romantic].sort((x, y) => y.perShared - x.perShared);
  const top = ranked[0];
  const jp = byId['jim-pam'];
  const md = byId['michael-dwight'];
  const mostShared = [...romantic].sort((x, y) => y.shared.length - x.shared.length)[0];
  const discount = E.find((e) => /^couples discount$/i.test(e.t));

  let h1 = 'Couples <em>Discount.</em>';
  let lede = '';
  if (top) {
    const jpTop = top === jp;
    h1 = jpTop ? 'Jim and Pam, <em>as advertised.</em>' : 'The most intense pair <em>isn’t Jim and Pam.</em>';
    lede = `${esc(top.a)} and ${esc(top.b)} go back and forth ${fmt.dec(top.perShared, 1)} times in an average episode they share`;
    if (md && jp && md.perShared > jp.perShared && md !== top) lede += `; Michael and Dwight, who are not a couple, do ${fmt.dec(md.perShared, 1)}`;
    lede += '.';
    if (top.clean < 10) {
      const [sh, cl] = nn(top.shared.length, top.clean);
      lede += ` It’s a small sample: they share ${sh} episodes, and only ${cl} of those transcripts are in order.`;
    }
    const inMost = (c) => `${c.shared.length} of the ${E.length} episodes`;
    if (!jpTop && jp) lede += ` Jim and Pam manage ${fmt.dec(jp.perShared, 1)}${mostShared === jp ? `, but they’re both in ${inMost(jp)}` : ''}.`;
    if (mostShared && (jpTop || mostShared !== jp)) lede += ` ${esc(mostShared.a)} and ${esc(mostShared.b)} are both in ${inMost(mostShared)}.`;
  }

  const sel0 = list.find((c) => c.id === MAIN[0]) || list[0];
  const bySaid = [...list].sort((x, y) => y.aSays + y.bSays - (x.aSays + x.bSays));
  const maxSaid = Math.max(1, ...list.map((c) => Math.max(c.aSays, c.bSays)));
  const maxPer = Math.max(1, ...list.map((c) => c.perShared));
  const byPer = [...list].sort((x, y) => y.perShared - x.perShared);

  const cols = [
    { h: 'Pair', f: (c) => pairName(c) },
    { h: 'Shared', f: (c) => c.shared.length, r: 1 },
    { h: 'Clean', f: (c) => c.clean, r: 1 },
    { h: 'Back-and-forths', f: (c) => fmt.int(c.back), r: 1 },
    { h: 'Per clean ep', f: (c) => fmt.dec(c.perShared, 1), r: 1 },
    { h: 'A says B', f: (c) => c.aSays, r: 1 },
    { h: 'B says A', f: (c) => c.bSays, r: 1 },
    { h: 'I love you (A, B)', f: (c) => `${c.ilyA}, ${c.ilyB}`, r: 1 },
  ];

  return {
    title: 'Couples Discount',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Couples Discount</p>
      <h1>${h1}</h1>
      <p class="lede">${lede}</p>
      ${discount ? `<p class="cp-named small muted">Named after ${epA(D, discount.id)}, ${epCode(discount)}.</p>` : ''}
    </section>

    <section class="wrap">
      <div class="cp-chips">
        ${groups.map((g, gi) => `<div class="cp-group"><p class="cp-glabel" id="cp-g${gi}">${esc(g.label)}</p><div class="pills" role="tablist" aria-labelledby="cp-g${gi}">${g.items.map((c) => `<button type="button" class="pill cp-chip${c === sel0 ? ' on' : ''}" role="tab" id="cp-tab-${c.id}" data-id="${c.id}" aria-selected="${c === sel0}" aria-controls="${sel0.id}" tabindex="${c === sel0 ? 0 : -1}">${dots(c)}${pairName(c)}</button>`).join('')}</div></div>`).join('')}
      </div>
      <div class="cp-panel" id="${sel0.id}" role="tabpanel" aria-labelledby="cp-tab-${sel0.id}" data-panel="1"></div>
    </section>

    <section class="section wrap">
      <div class="section-head"><div>
        <p class="eyebrow">Side by side</p>
        <h2>All ${nw(list.length)} pairs</h2>
      </div></div>
      <div class="grid g2">
        <div class="card rv">
          <h3 class="card-title">Back-and-forths per shared episode</h3>
          <p class="card-sub">One of them speaks, then the other, straight away. The small number is how many episodes that’s averaged over.</p>
          <div class="cp-rank">${byPer.map((c, i) => `<button type="button" class="cp-row" data-id="${c.id}" style="--d:${(i * 0.04).toFixed(2)}s" aria-label="${esc(`${c.a} and ${c.b}: ${fmt.dec(c.perShared, 1)} per shared episode, over ${fmt.plural(c.clean, 'clean episode')}`)}">
            <span class="cp-rn">${dots(c)}<span>${pairName(c)}</span></span>
            <span class="cp-rt"><span style="width:${((c.perShared / maxPer) * 100).toFixed(1)}%"></span></span>
            <span class="cp-rv">${fmt.dec(c.perShared, 1)}<small>${c.clean}</small></span>
          </button>`).join('')}</div>
        </div>
        <div class="card rv" style="--d:.06s">
          <h3 class="card-title">Who says whose name</h3>
          <p class="card-sub">The first person’s count on the left, the second person’s on the right.</p>
          <div class="cp-fly">${bySaid.map((c, i) => {
            const { ca, cb } = pairColours(c);
            return `<button type="button" class="cp-frow" data-id="${c.id}" style="--d:${(i * 0.04).toFixed(2)}s" aria-label="${esc(`${c.a} says ${c.b} ${fmt.times(c.aSays)}, ${c.b} says ${c.a} ${fmt.times(c.bSays)}`)}">
              <span class="cp-fl"><b>${c.aSays}</b><span class="cp-ft"><span class="cp-fb" style="width:${((c.aSays / maxSaid) * 100).toFixed(1)}%;background:${ca}"></span></span></span>
              <span class="cp-fn">${pairName(c)}</span>
              <span class="cp-fr"><span class="cp-ft"><span class="cp-fb" style="width:${((c.bSays / maxSaid) * 100).toFixed(1)}%;background:${cb}"></span></span><b>${c.bSays}</b></span>
            </button>`;
          }).join('')}</div>
        </div>
      </div>
      ${tableView(cols, list)}
      ${D.totals.shuffled ? `<p class="cp-caveat">${D.totals.shuffled === 1 ? 'One fan transcript has a stretch where two scenes trade lines, so that episode is' : `${cap(nw(D.totals.shuffled))} fan transcripts have a stretch where two scenes trade lines, so those episodes are`} left out of every back-and-forth count.</p>` : ''}
    </section>`,
    after(app) {
      const root = app.firstElementChild || app;
      const panel = root.querySelector('[data-panel]');
      const chips = [...root.querySelectorAll('.cp-chip')];
      const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
      const here = () => location.hash.startsWith('#/couples');

      // The router remembers scroll per route, but picking a pair rewrites the address to #/couples@<pair>, which it
      // has never seen, so Back would land on the panel's top. Keep the reader's place in this history entry instead.
      const keep = () => {
        if (!root.isConnected || !here()) return;
        try { history.replaceState({ ...(history.state || {}), cpY: Math.round(scrollY) }, ''); } catch (e) { /* too many updates */ }
      };
      let saveT = 0;
      const onScroll = () => {
        if (!root.isConnected) { removeEventListener('scroll', onScroll); return; }
        clearTimeout(saveT);
        saveT = setTimeout(keep, 150);
      };
      addEventListener('scroll', onScroll, { passive: true });
      // Leaving by a link, a second tap on a chart, or Enter on one: save right away, before the page changes.
      root.addEventListener('click', keep, true);
      root.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') keep(); }, true);

      const select = (id, { scroll = false, push = true, focus = false } = {}) => {
        const c = byId[id];
        if (!c || !panel) return;
        chips.forEach((b) => {
          const on = b.dataset.id === id;
          b.classList.toggle('on', on);
          b.setAttribute('aria-selected', String(on));
          b.setAttribute('aria-controls', c.id);
          b.tabIndex = on ? 0 : -1;
          if (on && focus) b.focus();
        });
        drawPanel(panel, D, c);
        observe(panel);
        if (push && here()) history.replaceState({ ...(history.state || {}) }, '', `#/couples@${id}`);
        if (scroll) root.querySelector('.cp-chips')?.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });
      };
      root.addEventListener('click', (ev) => {
        const chip = ev.target.closest('.cp-chip');
        if (chip) { select(chip.dataset.id); return; }
        const row = ev.target.closest('.cp-row, .cp-frow');
        if (row) select(row.dataset.id, { scroll: true });
      });
      // Tabs: arrow keys move along all the chips (across the three groups) and pick as they go; Home and End jump.
      root.querySelector('.cp-chips')?.addEventListener('keydown', (ev) => {
        const at = chips.indexOf(ev.target.closest('.cp-chip'));
        if (at < 0) return;
        const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: chips.length - 1 }[ev.key];
        if (to == null) return;
        ev.preventDefault();
        select(chips[(to + chips.length) % chips.length].dataset.id, { focus: true });
      });

      const anchor = hashAnchor();
      select(byId[anchor] ? anchor : sel0.id, { push: false });
      // Back to #/couples@<pair>: the router has just scrolled to the panel; put the reader where they were.
      const y = history.state?.cpY;
      if (anchor && byId[anchor] && Number.isFinite(y)) requestAnimationFrame(() => { if (root.isConnected) window.scrollTo({ top: y, behavior: 'instant' }); });
    },
  };
}
