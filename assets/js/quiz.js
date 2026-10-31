// #/quiz/daily: Who Said It? (a daily five-line quiz) and Name That Episode (ten rounds, five words each).
// The daily set comes from seeded shuffles, so everyone gets the same five lines with no server involved.

import { $, $$, esc, fmt, slug, color, epCode, hbars, arrow } from './ui.js';

const SITE = 'https://katsuma.ca/the-office-analysis/';
// Launch day, 2026-11-01. Issue numbers count local days from here, so launch day is #0.
const LAUNCH = Date.UTC(2026, 10, 1);
const LAUNCH_KEY = 20261101;
const DAILY = 5;
const ROUNDS = 10;
const KEY_WSI = 'whosaidit';
const KEY_NTE = 'namethatepisode';
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

// Index = score out of five.
const WSI_TITLES = [
  ['Toby', 'Zero for five. Toby would like to talk about it.'],
  ['Temp', 'One right. Ryan started as the temp too.'],
  ['Kevin', 'Two right. Kevin would round that up.'],
  ['Assistant to the Regional Manager', 'Three right. Dwight would like you to drop the “to”.'],
  ['Regional Manager', 'Four right. One short of the mug.'],
  ['World’s Best Boss', 'Five for five. The mug is yours.'],
];

// [lowest score that earns it, title, line]
const NTE_TITLES = [
  [10, 'Dwight', 'Fact: ten for ten. Question: how many rewatches is that?'],
  [9, 'Oscar', 'Nine. Actually, that’s very good.'],
  [7, 'Pam', 'You saw most of it from the reception desk.'],
  [5, 'Andy', 'Solid. Not Cornell, but solid.'],
  [3, 'Kevin', 'Few word did not do trick.'],
  [1, 'Creed', 'Not sure what show this is, either.'],
  [0, 'Toby', 'Zero. HR has been notified.'],
];

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const spell = (n) => SMALL[n] ?? fmt.int(n);

const RIGHT = ['Right.', 'Correct.', 'That’s the one.', 'Yep.', 'Nailed it.'];
const WRONG = ['Nope.', 'Not quite.', 'Not this time.'];

export const ICON = {
  yes: '<svg class="qz-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.6 6.4 11.6 12.8 4.6"/></svg>',
  no: '<svg class="qz-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2"/></svg>',
  share: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2M5 5l3-3 3 3M3 8.5V14h10V8.5"/></svg>',
};

// Survives page changes, so Back from an episode link lands where you were.
const state = { prep: null, practice: null, nte: null };

// ---------------------------------------------------------------- storage (private mode keeps it in memory)

const mem = {};
function load(key) {
  try { const v = localStorage.getItem(key); if (v) return JSON.parse(v); } catch (e) { /* private mode or bad JSON */ }
  return mem[key] ?? null;
}
function save(key, v) {
  mem[key] = v;
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode: it lasts this visit */ }
}

// ---------------------------------------------------------------- dates

const ymd = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const fromYmd = (k) => new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100);
const prevDay = (k) => { const d = fromYmd(k); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)); };
const sinceLaunch = (d) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - LAUNCH) / 864e5);
// Days before launch have no issue number to give, so they're previews, not a run of #0s.
const issueNo = (day) => sinceLaunch(fromYmd(day));
const issueName = (day) => (issueNo(day) < 0 ? 'Preview' : `Issue #${issueNo(day)}`);
const shareName = (day) => (issueNo(day) < 0 ? 'Who Said It? (preview)' : `Who Said It? #${issueNo(day)}`);
function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  // Rounded down, so just after midnight reads 23h 59m, not 24h 0m.
  const mins = Math.max(1, Math.floor((next - now) / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : mins === 1 ? 'a minute' : `${mins} minutes`;
}

// ---------------------------------------------------------------- randomness

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------- the pool

// Same tokenizer as build_data.py, so a line's words match the signature lists.
const tokens = (t) => (t.toLowerCase().replace(/’/g, "'").match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || [])
  .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
  .map((w) => (w === 'shrute' ? 'schrute' : w));

// A few fan-transcript lines carry a stage direction, some unclosed ("[Holly freezes", "{Kevin takes bite of
// brownie]"). Drop those, and write em dashes the way a screenplay does, as two hyphens.
const clean = (t) => t.replace(/\s*[[{][^\]}]*(?:[\]}]|$)/g, '').replace(/\s*\u2014\s*/g, '-- ').replace(/-- $/, '--').trim();

function prepare(D, raw) {
  if (state.prep?.raw === raw) return state.prep;
  const rows = raw
    .filter(([ep, k]) => D.char[k] && D.episodes[ep])
    .map(([ep, k, t]) => ({ ep, k, t: clean(t) }));
  // The tell: the strongest of the speaker's signature words that's in the line. The pool was built so every
  // line has one, but in three lines it was only inside the stage direction clean() drops, so those go too.
  for (const r of rows) {
    const have = new Set(tokens(r.t));
    r.tell = (D.char[r.k].signature || []).filter((s) => have.has(s.w)).sort((a, b) => b.z - a.z)[0] || null;
  }
  // The fan transcript sometimes stops a line at a colon ("At 12", "Number one", "Translation"), and the rest
  // never made it in. A line has to end like a sentence to get in the deck.
  const ends = (r) => /[.!?…"'”’)-]$/.test(r.t);
  const kept = rows.filter((r) => r.tell && ends(r));
  const cut = rows.filter((r) => r.tell && !ends(r)).length;
  const count = {};
  for (const r of kept) count[r.k] = (count[r.k] || 0) + 1;
  const cast = Object.keys(count).sort((a, b) => count[b] - count[a]);
  state.prep = { raw, rows: kept, count, cast, cut, orders: new Map() };
  return state.prep;
}

// The speaker plus three wrong names: people who talk in that episode first, then that season, then anyone.
function question(D, P, i, rnd) {
  const r = P.rows[i];
  const e = D.episodes[r.ep];
  const others = P.cast.filter((k) => k !== r.k);
  const inEp = others.filter((k) => (e.c[D.codes[k]] || 0) > 0);
  const inSeason = others.filter((k) => !inEp.includes(k) && (D.char[k].perSeason?.[e.s - 1] || 0) > 0);
  const rest = others.filter((k) => !inEp.includes(k) && !inSeason.includes(k));
  const wrong = [...shuffle(inEp, rnd), ...shuffle(inSeason, rnd), ...shuffle(rest, rnd)].slice(0, 3);
  const choices = shuffle([r.k, ...wrong], rnd);
  return { i, r, e, choices, answer: choices.indexOf(r.k) };
}

// A deck shuffled with the launch date (YYYYMMDD) as the seed, dealt five a day, so no line comes back until
// the whole pool has. Today's YYYYMMDD seeds the wrong names and the button order. Same date, same five, same buttons.
const issuesPerDeck = (P) => Math.floor(P.rows.length / DAILY);
function dealt(P, n) {
  const per = issuesPerDeck(P);
  const deck = Math.floor(n / per);
  const slot = n - deck * per;
  if (!P.orders.has(deck)) P.orders.set(deck, shuffle(P.rows.map((_, i) => i), mulberry32(LAUNCH_KEY + deck)));
  return P.orders.get(deck).slice(slot * DAILY, slot * DAILY + DAILY);
}
function daily(D, P, day) {
  const rnd = mulberry32(day);
  return dealt(P, issueNo(day)).map((i) => question(D, P, i, rnd));
}

// Practice leaves out today's five and everything due in the next AHEAD days, so it can't give away an issue
// anyone is about to play.
const AHEAD = 90;
function practicePool(P, day) {
  const n0 = issueNo(day);
  const skip = new Set();
  for (let n = n0; n < n0 + AHEAD; n++) for (const i of dealt(P, n)) skip.add(i);
  return P.rows.map((_, i) => i).filter((i) => !skip.has(i));
}

function markTell(text, w) {
  if (!w) return esc(text);
  let pat = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");
  if (w === 'schrute') pat = 'sc?hrute';
  const m = new RegExp(`(^|[^a-z])(${pat})(?![a-z])`, 'i').exec(text);
  if (!m) return esc(text);
  const at = m.index + m[1].length;
  return `${esc(text.slice(0, at))}<mark>${esc(m[2])}</mark>${esc(text.slice(at + m[2].length))}`;
}

// ---------------------------------------------------------------- records

function wsiRecord(day) {
  const s = { day: 0, picks: [], right: [], streak: 0, best: 0, last: 0, played: 0, dist: [0, 0, 0, 0, 0, 0], ...(load(KEY_WSI) || {}) };
  if (!Array.isArray(s.picks) || !Array.isArray(s.right)) { s.picks = []; s.right = []; }
  if (!Array.isArray(s.dist) || s.dist.length !== DAILY + 1) s.dist = [0, 0, 0, 0, 0, 0];
  if (s.day !== day) { s.day = day; s.picks = []; s.right = []; }
  return s;
}
function finishDay(s) {
  if (s.last === s.day) return;
  const score = s.right.filter(Boolean).length;
  s.streak = s.last === prevDay(s.day) ? (s.streak || 0) + 1 : 1;
  s.best = Math.max(s.best || 0, s.streak);
  s.played = (s.played || 0) + 1;
  s.dist[score] += 1;
  s.last = s.day;
}
const nteRecord = () => ({ best: 0, played: 0, total: 0, ...(load(KEY_NTE) || {}) });

// ---------------------------------------------------------------- bits of markup

function pips(n, results, cur, fresh = -1) {
  return Array.from({ length: n }, (_, j) => {
    const r = results[j];
    const cls = r === true ? 'yes' : r === false ? 'no' : j === cur ? 'now' : '';
    return `<i class="qz-pip ${cls}${j === fresh ? ' fresh' : ''}">${r === true ? ICON.yes : r === false ? ICON.no : ''}</i>`;
  }).join('');
}

const squares = (results, small = false) => `<div class="qz-squares${small ? ' sm' : ''}" role="img" aria-label="${results.map((r, i) => `${i + 1} ${r ? 'right' : 'wrong'}`).join(', ')}">${results.map((r, i) => `<span class="qz-sq ${r ? 'yes' : 'no'}" style="--d:${(0.3 + i * 0.07).toFixed(2)}s">${r ? ICON.yes : ICON.no}</span>`).join('')}</div>`;

const shareText = (results) => results.map((r) => (r ? '■' : '□')).join('');

const loadingHtml = '<div class="qz-card qz-loading"><div class="boot-bars" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div><p>Pulling the script out of the filing cabinet…</p></div>';

const mug = (title) => `<div class="qz-mug" aria-hidden="true">
  <span class="qz-steam"><svg viewBox="0 0 10 30"><path d="M5 28c-4-5 4-8 0-13s4-8 0-13"/></svg><svg viewBox="0 0 10 30"><path d="M5 28c-4-5 4-8 0-13s4-8 0-13"/></svg><svg viewBox="0 0 10 30"><path d="M5 28c-4-5 4-8 0-13s4-8 0-13"/></svg></span>
  <span class="qz-mug-handle"></span>
  <span class="qz-mug-body${title.length > 18 ? ' long' : ''}"><span>${esc(title)}</span></span>
</div>`;

const dundie = `<svg class="qz-dundie" viewBox="0 0 100 150" aria-hidden="true">
  <path class="arm" d="M38 42 24 14M62 42l14-28"/>
  <circle class="gold" cx="50" cy="22" r="10"/>
  <path class="gold" d="M36 36h28l-4 44H40z"/>
  <path class="gold" d="M40 79h20l-1 31h-8l-1-20-1 20h-8z"/>
  <rect class="base" x="28" y="110" width="44" height="11" rx="2"/>
  <rect class="base" x="18" y="121" width="64" height="24" rx="3"/>
  <rect class="plate" x="34" y="129" width="32" height="8" rx="1.5"/>
</svg>`;

function rain(card) {
  if (reduce.matches) return;
  const box = document.createElement('div');
  box.className = 'qz-rain';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = Array.from({ length: 18 }, () => {
    const x = Math.random() * 100;
    return `<i style="--x:${x.toFixed(1)}%;--d:${(Math.random() * 0.9).toFixed(2)}s;--t:${(2.2 + Math.random() * 1.4).toFixed(2)}s;--r:${Math.round(Math.random() * 540 - 270)}deg"></i>`;
  }).join('');
  card.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

// Share sheet where there is one, the clipboard where there isn't, and a box to copy by hand as a last resort.
async function share(text, status) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Copied. Paste it wherever your group chat lives.';
  } catch (e) {
    status.innerHTML = `Your browser wouldn’t let me copy it, so here it is.<textarea class="qz-copybox" readonly rows="3" aria-label="Your result, ready to copy">${esc(text)}</textarea>`;
    const box = $('textarea', status);
    box.focus();
    box.select();
  }
}

function scrollNear(el) {
  if (!el?.isConnected) return;
  const r = el.getBoundingClientRect();
  const top = 74;
  if (r.bottom > innerHeight - 12 || r.top < top) {
    const want = r.height > innerHeight - top - 24 ? r.top - top : r.bottom - innerHeight + 24;
    window.scrollBy({ top: want, behavior: reduce.matches ? 'auto' : 'smooth' });
  }
}

// ---------------------------------------------------------------- one question, either game

// cfg.picked re-opens a round that was already answered (Back from an episode link), quietly: no animations,
// no announcement, no scrolling, and onAnswer is told it's a repeat so nothing is counted twice.
export function round(host, cfg, live) {
  const again = cfg.picked != null && cfg.picked >= 0;
  host.innerHTML = `<div class="qz-card${cfg.cls ? ` ${cfg.cls}` : ''}${again ? ' qz-quiet' : ''}" tabindex="-1">
    ${cfg.head}
    <div class="qz-body">${cfg.body}</div>
    <div class="qz-opts${cfg.one ? ' one' : ''}" role="group" aria-label="${esc(cfg.ask)}">
      ${cfg.choices.map((c, i) => `<button type="button" class="qz-opt" style="--i:${i}"><span class="qz-key" aria-hidden="true">${i + 1}</span><span class="qz-opt-b">${c}<span class="qz-tag"></span></span></button>`).join('')}
    </div>
    <div class="qz-reveal" hidden></div>
  </div>`;
  const card = $('.qz-card', host);
  const opts = $$('.qz-opt', host);
  const rev = $('.qz-reveal', host);
  let done = false;
  const ctl = {
    pick(i, repeat = false) {
      if (done || !card.isConnected || i < 0 || i >= opts.length) return false;
      done = true;
      const right = i === cfg.answer;
      opts.forEach((b, j) => {
        b.disabled = true;
        const key = $('.qz-key', b);
        const tag = $('.qz-tag', b);
        if (j === cfg.answer) {
          b.classList.add('is-right');
          key.innerHTML = ICON.yes;
          tag.textContent = right ? 'Correct' : cfg.rightTag;
        } else if (j === i) {
          b.classList.add('is-wrong');
          key.innerHTML = ICON.no;
          tag.textContent = 'Your pick';
        } else b.classList.add('is-out');
      });
      card.classList.add(right ? 'got-right' : 'got-wrong');
      const words = right ? RIGHT[cfg.n % RIGHT.length] : WRONG[cfg.n % WRONG.length];
      rev.innerHTML = `<p class="qz-verdict ${right ? 'yes' : 'no'}"><span class="qz-badge">${right ? ICON.yes : ICON.no}</span><b>${words}</b></p>
        ${cfg.reveal(i, right)}
        <div class="qz-next-row"><button type="button" class="btn qz-next">${cfg.nextLabel} ${arrow}</button><span class="qz-hint">or press <kbd>Enter</kbd></span></div>`;
      rev.hidden = false;
      cfg.onAnswer(i, right, repeat);
      const nb = $('.qz-next', rev);
      nb.addEventListener('click', () => ctl.next());
      if (repeat) return true;
      live(`${words} ${cfg.say(i, right)}`);
      nb.focus({ preventScroll: true });
      requestAnimationFrame(() => scrollNear(rev));
      return true;
    },
    next() {
      if (!done || !card.isConnected) return false;
      done = false; // one Next per answer, however fast the key repeats
      cfg.onNext();
      return true;
    },
    card,
  };
  opts.forEach((b, i) => b.addEventListener('click', () => ctl.pick(i)));
  if (again) ctl.pick(cfg.picked, true);
  return ctl;
}

// ---------------------------------------------------------------- the page

const TITLE = { who: 'Who Said It?', nte: 'Name That Episode' };
const nteHash = () => /@name-that-episode/.test(location.hash);

export function quiz(D, quizPool) {
  const first = nteHash() ? 'nte' : 'who';
  // Both games' headings sit in the same grid cell, so switching tabs swaps the words without moving the tabs.
  const head = (tab, h) => `<span data-head="${tab}"${tab === first ? '' : ' class="off"'}>${h}</span>`;
  const html = `
  <section class="wrap page-head qz-top">
    <p class="eyebrow">Quiz night</p>
    <h1 class="qz-swap">${head('who', 'Who said <em>it?</em>')}${head('nte', 'Name that <em>episode.</em>')}</h1>
    <p class="lede qz-swap">${head('who', 'Five lines from the script, the same five for everyone, new ones at midnight your time. Pick who said each one.')}${head('nte', 'Five words from one episode’s script, the ones it says far more often than the rest of the show. Pick the title.')}</p>
  </section>
  <section class="wrap qz-wrap">
    <div class="qz-tabs" role="tablist" aria-label="Games">
      <button type="button" role="tab" class="qz-tab" id="qz-tab-who" data-tab="who" aria-controls="qz-who" aria-selected="true"><b>Who Said It?</b><small>Five lines a day</small></button>
      <button type="button" role="tab" class="qz-tab" id="name-that-episode" data-tab="nte" aria-controls="qz-nte" aria-selected="false" tabindex="-1"><b>Name That Episode</b><small>Ten rounds a game</small></button>
    </div>
    <div class="qz-panel" id="qz-who" role="tabpanel" aria-labelledby="qz-tab-who">
      <div class="qz-stage"><div class="qz-main" id="qz-who-main">${loadingHtml}</div><aside class="qz-board" id="qz-who-board" aria-label="Your Who Said It? record"></aside></div>
    </div>
    <div class="qz-panel" id="qz-nte" role="tabpanel" aria-labelledby="name-that-episode" hidden>
      <div class="qz-stage"><div class="qz-main" id="qz-nte-main"></div><aside class="qz-board" id="qz-nte-board" aria-label="Your Name That Episode record"></aside></div>
    </div>
    <p class="qz-sr" id="qz-live" aria-live="polite" aria-atomic="true"></p>
  </section>
  <section class="section wrap qz-notes" id="qz-notes"></section>`;

  return { title: TITLE[first], html, after: (root) => play(D, quizPool, root) };
}

function play(D, quizPool, root) {
  const whoMain = $('#qz-who-main', root);
  const whoBoard = $('#qz-who-board', root);
  const nteMain = $('#qz-nte-main', root);
  const nteBoard = $('#qz-nte-board', root);
  const liveEl = $('#qz-live', root);
  const tabs = $$('.qz-tab', root);
  let tab = 'who';
  let whoCtl = null;
  let nteCtl = null;
  let P = null;
  let day = 0;
  let set = [];

  const live = (msg) => {
    liveEl.textContent = '';
    requestAnimationFrame(() => { if (liveEl.isConnected) liveEl.textContent = msg; });
  };
  const goes = (el) => requestAnimationFrame(() => $$('.hbars', el).forEach((h) => h.classList.add('go')));
  const focusCard = (host) => {
    const c = $('.qz-card', host);
    if (!c) return;
    c.focus({ preventScroll: true });
    const r = c.getBoundingClientRect();
    if (r.top < 70) window.scrollBy({ top: r.top - 84, behavior: reduce.matches ? 'auto' : 'smooth' });
  };

  // ------------------------------------------------ Who Said It?

  const whoChoice = (k) => `<span class="qz-opt-l"><i class="dot" style="background:${color(k)}"></i>${esc(k)}</span>`;
  const whoReveal = (q) => {
    const { r, e } = q;
    const t = r.tell;
    return `<p class="qz-who"><a class="qz-sp" href="#/character/${slug(r.k)}"><i class="dot" style="background:${color(r.k)}"></i>${esc(r.k)}</a> said it, in <a href="#/episode/${e.id}">${esc(e.t)}</a> <span class="qz-code">${epCode(e)}</span>.</p>
      ${t ? `<p class="qz-tell">The tell: <mark>${esc(t.w)}</mark> is one of ${esc(r.k)}’s signature words. ${esc(r.k)} says it ${fmt.times(t.n)} across the show.</p>` : ''}`;
  };
  const whoSay = (q) => `${q.r.k} said it, in ${q.e.t}, season ${q.e.s} episode ${q.e.se}.`;
  const lineBody = (q) => `<blockquote class="qz-line"><p>${esc(q.r.t)}</p></blockquote><p class="qz-ask">Who said it?</p>`;

  function whoBoardHtml() {
    const s = wsiRecord(day);
    const streak = s.last === day || s.last === prevDay(day) ? s.streak : 0;
    const date = fromYmd(day).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
    const rows = s.dist.map((v, n) => ({ label: `${n}/${DAILY}`, v, color: 'var(--accent)' })).reverse();
    whoBoard.innerHTML = `<div class="card qz-board-card">
      <p class="qz-kicker">${issueName(day)} · ${esc(date)}</p>
      <div class="qz-nums"><div><b>${streak}</b><span>Streak</span></div><div><b>${s.best || 0}</b><span>Best streak</span></div><div><b>${s.played || 0}</b><span>Played</span></div></div>
      ${s.played ? `<p class="qz-kicker mt">Your scores</p>${hbars(rows, { max: Math.max(1, ...s.dist) })}` : '<p class="qz-board-note">Nothing on the board yet. Your record stays in this browser and nowhere else.</p>'}
      <p class="qz-board-note qz-cd">New lines in <b data-cd>${untilMidnight()}</b>.</p>
      ${issueNo(day) < 0 ? `<p class="qz-board-note">Issue #0 goes out on ${esc(new Date(LAUNCH).toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }))}. Until then these are previews, and they still count toward your streak.</p>` : ''}
    </div>`;
    goes(whoBoard);
  }

  function showWho() {
    day = ymd(new Date());
    set = daily(D, P, day);
    const s = wsiRecord(day);
    whoBoardHtml();
    // Answered but not moved on (Back from the episode link in the reveal): show that reveal again.
    const rv = state.reveal;
    if (rv?.day === day && rv.i === s.right.length - 1) {
      const at = set[rv.i].choices.indexOf(s.picks[rv.i]);
      if (at >= 0) return askDaily(rv.i, at);
    }
    if (s.right.length >= DAILY) return state.practice?.on ? askPractice(false) : whoResult();
    askDaily(s.right.length);
  }

  function askDaily(i, picked = null) {
    const s = wsiRecord(day);
    const q = set[i];
    whoCtl = round(whoMain, {
      n: i,
      picked,
      head: `<div class="qz-head"><span class="qz-label"><b>${issueName(day)}</b> · Line ${i + 1} of ${DAILY}</span><span class="qz-pips" aria-hidden="true">${pips(DAILY, s.right, i)}</span></div>`,
      body: lineBody(q),
      ask: 'Who said it?',
      choices: q.choices.map(whoChoice),
      answer: q.answer,
      rightTag: 'Said it',
      reveal: () => whoReveal(q),
      say: () => whoSay(q),
      nextLabel: i < DAILY - 1 ? 'Next line' : 'See how you did',
      onAnswer(pi, right) {
        const rec = wsiRecord(day);
        rec.picks[i] = q.choices[pi];
        rec.right[i] = right;
        if (rec.right.length >= DAILY) finishDay(rec);
        save(KEY_WSI, rec);
        state.reveal = { day, i };
        $('.qz-line p', whoMain).innerHTML = markTell(q.r.t, q.r.tell?.w);
        $('.qz-pips', whoMain).innerHTML = pips(DAILY, rec.right, -1, i);
        if (rec.right.length >= DAILY) whoBoardHtml();
      },
      onNext() {
        state.reveal = null;
        if (i < DAILY - 1) { askDaily(i + 1); focusCard(whoMain); live(`Line ${i + 2} of ${DAILY}.`); } else { whoResult(true); focusCard(whoMain); }
      },
    }, live);
  }

  function whoResult(fresh = false) {
    whoCtl = null;
    if (state.practice) state.practice.on = false;
    const s = wsiRecord(day);
    const right = s.right.slice(0, DAILY);
    const score = right.filter(Boolean).length;
    const [title, sub] = WSI_TITLES[score];
    const text = `${shareName(day)} · ${score}/${DAILY}\n${shareText(right)}\n${SITE}#/quiz/daily`;
    const pr = state.practice;
    whoMain.innerHTML = `<div class="qz-card qz-res" tabindex="-1">
      <div class="qz-res-top">
        ${mug(title)}
        <div class="qz-res-txt">
          <p class="qz-kicker">${issueName(day)} · your title</p>
          <h2 class="qz-res-title">${esc(title)}</h2>
          <p class="qz-res-score"><b>${score}</b><span>/${DAILY}</span></p>
          <p class="qz-res-sub">${esc(sub)}</p>
          ${squares(right)}
          <div class="qz-actions">
            <button type="button" class="btn qz-share">${ICON.share} Share</button>
            <button type="button" class="btn ghost qz-practice">${pr?.total ? `Keep practising (${pr.right} of ${pr.total})` : 'Practice mode'}</button>
          </div>
          <p class="qz-status" role="status"></p>
        </div>
      </div>
      <p class="qz-kicker qz-review-h">Today’s five</p>
      <ol class="qz-review">${set.map((q, i) => {
        const ok = !!right[i];
        const k = q.r.k;
        const said = s.picks[i];
        return `<li class="${ok ? 'yes' : 'no'}">
          <span class="qz-ri">${ok ? ICON.yes : ICON.no}<span class="qz-sr">${ok ? 'Right' : 'Wrong'}</span></span>
          <div><p class="qz-rq">${markTell(q.r.t, q.r.tell?.w)}</p>
          <p class="qz-rm"><a href="#/character/${slug(k)}"><i class="dot" style="background:${color(k)}"></i>${esc(k)}</a> · <a href="#/episode/${q.e.id}">${esc(q.e.t)}</a> <span class="qz-code">${epCode(q.e)}</span>${ok || !said ? '' : ` · you said ${esc(said)}`}</p></div>
        </li>`;
      }).join('')}</ol>
    </div>`;
    const card = $('.qz-res', whoMain);
    $('.qz-share', card).addEventListener('click', () => share(text, $('.qz-status', card)));
    // An unanswered practice line waits for you; an answered one is done with.
    $('.qz-practice', card).addEventListener('click', () => { askPractice(state.practice?.pick != null); focusCard(whoMain); });
    if (fresh && score === DAILY) rain(card);
    live(`${score} out of ${DAILY}. Your title: ${title}.`);
  }

  // fresh = deal a new line; otherwise the one on the table comes back as it was (answered or not).
  function askPractice(fresh = true) {
    const pr = (state.practice ??= { right: 0, total: 0, seen: new Set(), on: true, q: null, pick: null });
    pr.on = true;
    if (fresh || !pr.q) {
      if (pr.day !== day || pr.P !== P) { pr.day = day; pr.P = P; pr.pool = practicePool(P, day); }
      let left = pr.pool.filter((i) => !pr.seen.has(i));
      if (!left.length) { pr.seen.clear(); left = pr.pool; }
      const i = left[Math.floor(Math.random() * left.length)];
      pr.seen.add(i);
      pr.q = question(D, P, i, Math.random);
      pr.pick = null;
      pr.n = pr.total;
    }
    const q = pr.q;
    const run = () => (pr.total ? `${pr.right} of ${pr.total} right` : 'no score yet');
    whoCtl = round(whoMain, {
      n: pr.n,
      picked: fresh ? null : pr.pick,
      cls: 'qz-practice-card',
      head: `<div class="qz-head"><span class="qz-label"><b>Practice</b> · <span class="qz-run">${run()}</span></span><button type="button" class="qz-stop">Back to today’s result</button></div>`,
      body: lineBody(q),
      ask: 'Who said it?',
      choices: q.choices.map(whoChoice),
      answer: q.answer,
      rightTag: 'Said it',
      reveal: () => whoReveal(q),
      say: () => `${whoSay(q)} ${pr.right} of ${pr.total} right.`,
      nextLabel: 'Next line',
      onAnswer(pi, right, repeat) {
        if (!repeat) {
          pr.total += 1;
          if (right) pr.right += 1;
          pr.pick = pi;
        }
        $('.qz-run', whoMain).textContent = run();
        $('.qz-line p', whoMain).innerHTML = markTell(q.r.t, q.r.tell?.w);
      },
      onNext() { askPractice(true); focusCard(whoMain); },
    }, live);
    $('.qz-stop', whoMain).addEventListener('click', () => { whoResult(); focusCard(whoMain); });
  }

  async function startWho() {
    whoMain.innerHTML = loadingHtml;
    let raw;
    try {
      raw = await quizPool();
    } catch (err) {
      if (!whoMain.isConnected) return;
      whoMain.innerHTML = '<div class="qz-card qz-loading"><p>The filing cabinet is stuck. That usually means the connection dropped.</p><button type="button" class="btn ghost" id="qz-retry">Try again</button></div>';
      $('#qz-retry', whoMain).addEventListener('click', startWho);
      return;
    }
    if (!whoMain.isConnected) return;
    P = prepare(D, raw);
    showWho();
    notes();
  }

  // ------------------------------------------------ Name That Episode

  const base = (t) => t.replace(/:\s*Part\s*\d+$/i, '');

  function newNte() {
    const ok = D.episodes.filter((e) => (e.kw || []).length >= 5);
    const seen = new Set();
    const eps = shuffle([...ok], Math.random).filter((e) => {
      const b = base(e.t);
      if (seen.has(b)) return false;
      seen.add(b);
      return true;
    }).slice(0, ROUNDS);
    const rounds = eps.map((e) => {
      // Never offer the other half of a two-parter: the words would fit both.
      const used = new Set([base(e.t)]);
      const wrong = [];
      for (const list of [ok.filter((x) => x.s === e.s), ok]) {
        for (const x of shuffle([...list], Math.random)) {
          if (wrong.length >= 3) break;
          if (used.has(base(x.t))) continue;
          used.add(base(x.t));
          wrong.push(x.id);
        }
      }
      const choices = shuffle([e.id, ...wrong], Math.random);
      return { id: e.id, choices, answer: choices.indexOf(e.id) };
    });
    return { rounds, picks: [], saved: false };
  }

  function nteBoardHtml() {
    const r = nteRecord();
    nteBoard.innerHTML = `<div class="card qz-board-card">
      <p class="qz-kicker">Name That Episode</p>
      ${r.played ? `<div class="qz-nums"><div><b>${r.best}<small>/${ROUNDS}</small></b><span>Best</span></div><div><b>${fmt.dec(r.total / r.played, 1)}</b><span>Average</span></div><div><b>${r.played}</b><span>Played</span></div></div>` : '<p class="qz-board-note">No games yet. Your best score shows up here.</p>'}
      <p class="qz-board-note">Each game draws ten episodes at random, so it’s different every time. Words are each episode’s most distinctive, with the title’s own words taken out.</p>
    </div>`;
  }

  function showNte() {
    state.nte ??= newNte();
    nteBoardHtml();
    const g = state.nte;
    // Back from the episode link in a reveal brings that reveal back, not the next round.
    const rv = g.revealing;
    if (rv != null && g.picks[rv]) {
      const at = g.rounds[rv].choices.indexOf(g.picks[rv].pick);
      if (at >= 0) return askNte(rv, at);
    }
    if (g.picks.length >= ROUNDS) return nteResult();
    askNte(g.picks.length);
  }

  function askNte(i, picked = null) {
    const g = state.nte;
    const R = g.rounds[i];
    const e = D.episodes[R.id];
    const words = e.kw.slice(0, 5);
    const same = R.choices.every((id) => D.episodes[id].s === e.s);
    const score = g.picks.filter((p) => p.right).length;
    nteCtl = round(nteMain, {
      n: i,
      picked,
      cls: 'qz-nte-card',
      one: true,
      head: `<div class="qz-head"><span class="qz-label"><b>Round ${i + 1} of ${ROUNDS}</b> · <span class="qz-run">${score} right</span></span><span class="qz-pips sm" aria-hidden="true">${pips(ROUNDS, g.picks.map((p) => p.right), i)}</span></div>`,
      body: `<p class="qz-sr">The five words:</p><div class="qz-tiles">${words.map((w, j) => `<span class="qz-tile" style="--d:${(0.05 + j * 0.09).toFixed(2)}s"><b>${esc(w.w)}</b><small hidden>${fmt.times(w.n)}</small></span>`).join('')}</div>
        <p class="qz-ask">${same ? `Name the episode. All four are from season ${e.s}.` : 'Name the episode.'}</p>`,
      ask: 'Name the episode',
      choices: R.choices.map((id) => `<span class="qz-opt-l">${esc(D.episodes[id].t)}</span>`),
      answer: R.answer,
      rightTag: 'The episode',
      reveal: (pi, right) => `<div class="qz-ep">
          <a class="qz-ep-t" href="#/episode/${e.id}">${esc(e.t)}</a>
          <p class="qz-ep-m"><span>${epCode(e)}</span><span>Aired ${fmt.date(e.date)}</span><span><span class="rating">${fmt.dec(e.r)}</span> on IMDb</span></p>
        </div>
        ${right ? '' : `<p class="qz-aside">You picked ${esc(D.episodes[R.choices[pi]].t)}.</p>`}`,
      say: () => `It’s ${e.t}, season ${e.s} episode ${e.se}, rated ${fmt.dec(e.r)}.`,
      nextLabel: i < ROUNDS - 1 ? 'Next round' : 'See your Dundie',
      onAnswer(pi, right) {
        g.picks[i] = { pick: R.choices[pi], right };
        g.revealing = i;
        const now = g.picks.filter((p) => p.right).length;
        $('.qz-run', nteMain).textContent = `${now} right`;
        $('.qz-pips', nteMain).innerHTML = pips(ROUNDS, g.picks.map((p) => p.right), -1, i);
        $$('.qz-tile small', nteMain).forEach((s) => (s.hidden = false));
        if (g.picks.length >= ROUNDS && !g.saved) {
          g.saved = true;
          const rec = nteRecord();
          rec.best = Math.max(rec.best, now);
          rec.played += 1;
          rec.total += now;
          save(KEY_NTE, rec);
          nteBoardHtml();
        }
      },
      onNext() {
        g.revealing = null;
        if (i < ROUNDS - 1) { askNte(i + 1); focusCard(nteMain); live(`Round ${i + 2} of ${ROUNDS}.`); } else { nteResult(true); focusCard(nteMain); }
      },
    }, live);
  }

  function nteResult(fresh = false) {
    nteCtl = null;
    const g = state.nte;
    const right = g.picks.map((p) => p.right);
    const score = right.filter(Boolean).length;
    const [, title, sub] = NTE_TITLES.find(([min]) => score >= min);
    const text = `Name That Episode · ${score}/${ROUNDS}\n${shareText(right)}\n${SITE}#/quiz/daily@name-that-episode`;
    nteMain.innerHTML = `<div class="qz-card qz-res qz-nte-res" tabindex="-1">
      <div class="qz-res-top">
        <div class="qz-trophy">${dundie}</div>
        <div class="qz-res-txt">
          <p class="qz-kicker">Tonight’s Dundie goes to</p>
          <h2 class="qz-res-title">${esc(title)}</h2>
          <p class="qz-res-score"><b>${score}</b><span>/${ROUNDS}</span></p>
          <p class="qz-res-sub">${esc(sub)}</p>
          ${squares(right, true)}
          <div class="qz-actions">
            <button type="button" class="btn qz-share">${ICON.share} Share</button>
            <button type="button" class="btn ghost qz-again">Play again</button>
          </div>
          <p class="qz-status" role="status"></p>
        </div>
      </div>
      <p class="qz-kicker qz-review-h">The ten episodes</p>
      <ol class="qz-review">${g.rounds.map((R, i) => {
        const e = D.episodes[R.id];
        const ok = !!right[i];
        const said = D.episodes[g.picks[i]?.pick];
        return `<li class="${ok ? 'yes' : 'no'}">
          <span class="qz-ri">${ok ? ICON.yes : ICON.no}<span class="qz-sr">${ok ? 'Right' : 'Wrong'}</span></span>
          <div><p class="qz-rt"><a href="#/episode/${e.id}">${esc(e.t)}</a> <span class="qz-code">${epCode(e)}</span></p>
          <p class="qz-rm">${e.kw.slice(0, 5).map((w) => esc(w.w)).join(' · ')}${ok || !said ? '' : ` · you said ${esc(said.t)}`}</p></div>
        </li>`;
      }).join('')}</ol>
    </div>`;
    const card = $('.qz-res', nteMain);
    $('.qz-share', card).addEventListener('click', () => share(text, $('.qz-status', card)));
    $('.qz-again', card).addEventListener('click', () => { state.nte = newNte(); showNte(); focusCard(nteMain); live(`New game. Round 1 of ${ROUNDS}.`); });
    if (fresh && score === ROUNDS) rain(card);
    live(`${score} out of ${ROUNDS}. Tonight’s Dundie goes to ${title}.`);
  }

  // ------------------------------------------------ notes under the games

  function notes() {
    const el = $('#qz-notes', root);
    if (!el || !P) return;
    const n = P.rows.length;
    const cnt = P.count;
    const top = P.cast[0];
    const low = P.cast[P.cast.length - 1];
    const lens = P.rows.map((r) => r.t.split(/\s+/).filter(Boolean).length);
    const tells = P.rows.filter((r) => r.tell).length;
    const selfNamed = P.rows.filter((r) => new RegExp(`\\b${r.k.split(' ')[0]}\\b`, 'i').test(r.t)).length;
    const per = issuesPerDeck(P);
    const firstRepeat = new Date(LAUNCH + per * 864e5).toLocaleDateString('en-CA', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
    const erinFrom = D.char.Erin ? D.char.Erin.perSeason.findIndex((v) => v > 0) + 1 : 0;
    const ahead = n - practicePool(P, day).length;
    const pilot = D.episodes[0];
    const pw = pilot.kw.slice(0, 5).map((w) => `“${esc(w.w)}”`);
    el.innerHTML = `<div class="grid g2 qz-notes-grid">
      <div class="card">
        <h3 class="card-title">What’s in the filing cabinet</h3>
        <p class="card-sub">${fmt.int(n)} lines from ${P.cast.length} people, ${Math.min(...lens)} to ${Math.max(...lens)} words each.${selfNamed === 0 ? ' Nobody says their own name, because that would be too easy.' : ''}</p>
        ${hbars(P.cast.map((k) => ({ label: k, v: cnt[k], color: color(k), dot: color(k) })), { href: (r) => (D.charSlug[slug(r.label)] ? `#/character/${slug(r.label)}` : null) })}
        <p class="qz-note">${tells === n ? 'Every line has' : `${fmt.int(tells)} of them have`} at least one of the speaker’s signature words in it, so there’s always a tell if you know where to look. ${esc(top)} has the most here, ${fmt.int(cnt[top])}, so answering ${esc(top)} every time gets you about one in ${spell(Math.round(n / cnt[top]))}. ${esc(low)} has ${fmt.int(cnt[low])}.</p>
      </div>
      <div class="card">
        <h3 class="card-title">How it works</h3>
        <div class="qz-prose">
          <p>Every browser shuffles the ${fmt.int(n)} lines the same way and deals five a day, so everyone playing on the same day gets the same lines in the same order. Nothing goes to a server, and your streak lives in this browser only. No line comes back until the deck runs out, ${fmt.int(per)} days in, on ${esc(firstRepeat)}.</p>
          <p>The three wrong names are people who also talk in that episode${erinFrom > 1 ? `, so a season ${erinFrom - 1} line won’t offer you Erin, who doesn’t speak until season ${erinFrom}` : ''}. The date shuffles the buttons.</p>
          <p>Practice mode deals from everything except the next ${AHEAD} issues, ${fmt.int(ahead)} lines, so it can’t give away one you’re about to play.${P.cut ? ` The fan transcript also cuts some lines off at a colon, so I left out the ${fmt.int(P.cut)} that don’t end like a sentence.` : ''}</p>
          <p>Name That Episode uses each episode’s most distinctive words: the ones it says far more often than the rest of the show does, with the title’s own words taken out. <a href="#/episode/${pilot.id}">The pilot</a> comes out as ${pw.slice(0, -1).join(', ')} and ${pw[pw.length - 1]}.</p>
        </div>
      </div>
    </div>`;
    goes(el);
  }

  // ------------------------------------------------ tabs, keys, clock

  let nteStarted = false;
  function setTab(name, { focus = false, url = true } = {}) {
    tab = name;
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $('#qz-who', root).hidden = name !== 'who';
    $('#qz-nte', root).hidden = name !== 'nte';
    $$('[data-head]', root).forEach((n) => n.classList.toggle('off', n.dataset.head !== name));
    // The router named the tab after the game in the URL it was given; keep it in step.
    document.title = document.title.replace(/^(Who Said It\?|Name That Episode)(?= · )/, TITLE[name]);
    if (name === 'nte' && !nteStarted) { nteStarted = true; showNte(); }
    if (url) {
      const want = name === 'nte' ? '#/quiz/daily@name-that-episode' : '#/quiz/daily';
      if (location.hash !== want) history.replaceState(history.state, '', want);
    }
  }
  tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('.qz-tabs', root).addEventListener('keydown', (ev) => {
    const i = tabs.findIndex((t) => t.dataset.tab === tab);
    let j = null;
    if (ev.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (ev.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (ev.key === 'Home') j = 0;
    else if (ev.key === 'End') j = tabs.length - 1;
    if (j == null) return;
    ev.preventDefault();
    setTab(tabs[j].dataset.tab, { focus: true });
  });

  // 1 to 4 picks, Enter moves on. The listener lets itself go once the page is gone.
  const onKey = (ev) => {
    if (!root.contains(whoMain)) { document.removeEventListener('keydown', onKey); return; }
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat) return;
    if (!document.getElementById('palette')?.hidden || !document.getElementById('sheet')?.hidden) return;
    const ae = document.activeElement;
    if (ae && (/^(input|textarea|select)$/i.test(ae.tagName) || ae.isContentEditable)) return;
    const ctl = tab === 'who' ? whoCtl : nteCtl;
    if (!ctl) return;
    if (/^[1-4]$/.test(ev.key)) {
      if (ctl.pick(Number(ev.key) - 1)) ev.preventDefault();
    } else if (ev.key === 'Enter') {
      if (ae && ae !== ctl.card && ae.closest('button, a, summary, [role="tab"]')) return; // the focused control handles its own Enter
      if (ctl.next()) ev.preventDefault();
    }
  };
  document.addEventListener('keydown', onKey);

  // The countdown, and a fresh issue if the page is left open past midnight.
  const clock = setInterval(() => {
    if (!root.contains(whoMain)) { clearInterval(clock); return; }
    $$('[data-cd]', root).forEach((n) => (n.textContent = untilMidnight()));
    if (P && ymd(new Date()) !== day && !whoCtl) showWho();
  }, 15000);

  // Where you were, kept in this history entry. The router remembers scroll by path, but the tab switch
  // rewrites the path under it, and an @anchor in the URL beats its memory anyway. So the page keeps its own:
  // stamped on scroll and just before any link click, read back when Back or Forward lands here again.
  const backTo = history.state?.qzY;
  let stampT = 0;
  const here = () => root.contains(whoMain) && location.hash.startsWith('#/quiz');
  const stamp = () => {
    clearTimeout(stampT);
    if (!here()) return;
    try { history.replaceState({ ...(history.state || {}), qzY: Math.round(scrollY) }, '', location.hash); } catch (e) { /* Safari rations replaceState; losing one stamp is fine */ }
  };
  const onScroll = () => {
    if (!root.contains(whoMain)) { removeEventListener('scroll', onScroll); document.removeEventListener('click', onClick, true); return; }
    clearTimeout(stampT);
    stampT = setTimeout(stamp, 250);
  };
  const onClick = (ev) => {
    if (!root.contains(whoMain)) { removeEventListener('scroll', onScroll); document.removeEventListener('click', onClick, true); return; }
    if (ev.target.closest?.('a[href^="#"]')) stamp();
  };
  addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onClick, true);
  // Two frames: after the router's own scroll (to the top, the @anchor or its memory) has had its turn.
  const comeBack = () => {
    if (backTo == null) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (here()) window.scrollTo({ top: backTo, behavior: 'instant' }); }));
  };

  setTab(nteHash() ? 'nte' : 'who', { url: false });
  startWho().then(comeBack);
}
