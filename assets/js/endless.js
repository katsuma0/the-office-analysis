// #/quiz is the quiz hub. #/quiz/<type>/<level> plays one kind of question at one difficulty with no last
// question, and #/quiz/mixed/<level> deals every kind. Right answers pay Schrute Bucks, kept per type and level
// in this browser.

import { $, $$, esc, fmt, slug, color, epCode, hbars, arrow } from './ui.js';
import { round, ICON } from './quiz.js';
import { make, TYPES, TYPE, LEVELS, POINTS, STREAK, award, rankOf, available } from './qgen.js';

const KEY = 'quiz-ledger';
const SEEN_CAP = 600;
const LEVEL_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const MIXED = { id: 'mixed', name: 'Mixed Bag', blurb: 'Every kind of question, dealt at random.' };
const GROUPS = [
  { id: 'script', name: 'From the script' },
  { id: 'show', name: 'The show' },
  { id: 'scenes', name: 'Behind the scenes' },
];
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
const words = (n) => WORDS[n] ?? fmt.int(n);

// ---------------------------------------------------------------- the question bank

let bankP = null;
function loadBank() {
  bankP ??= fetch('data/quizbank.json').then((r) => {
    if (!r.ok) throw new Error(`quizbank ${r.status}`);
    return r.json();
  }).catch((err) => { bankP = null; throw err; });
  return bankP;
}

// ---------------------------------------------------------------- the ledger (private mode keeps it in memory)

let mem = null;
function ledger() {
  if (mem) return mem;
  let v = null;
  try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* private mode or bad JSON */ }
  mem = v && typeof v === 'object' && v.t ? v : { t: {}, seen: {}, level: 'easy' };
  return mem;
}
function keep() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* full or private: it stays in memory */ }
}
const cell = (L, type, level) => (L.t[type] ??= {})[level] ??= { pts: 0, right: 0, played: 0, best: 0 };
const peek = (L, type, level) => L.t[type]?.[level] || { pts: 0, right: 0, played: 0, best: 0 };
const sum = (cells) => cells.reduce((a, c) => ({ pts: a.pts + c.pts, right: a.right + c.right, played: a.played + c.played, best: Math.max(a.best, c.best) }), { pts: 0, right: 0, played: 0, best: 0 });
const allTypes = [...TYPES.map((t) => t.id), MIXED.id];
const total = (L) => sum(allTypes.flatMap((t) => LEVELS.map((l) => peek(L, t, l)))).pts;
const typeTotal = (L, t) => sum(LEVELS.map((l) => peek(L, t, l)));
const levelTotal = (L, l) => sum(allTypes.map((t) => peek(L, t, l)));

// ---------------------------------------------------------------- shared bits

const bucks = (n) => `${fmt.int(n)} Schrute ${n === 1 ? 'Buck' : 'Bucks'}`;
const name = (id) => (id === MIXED.id ? MIXED.name : TYPE[id].name);

function rankHtml(L, { compact = false } = {}) {
  const t = total(L);
  const r = rankOf(t);
  const pct = r.next ? ((t - r.at) / (r.next.at - r.at)) * 100 : 100;
  return `<div class="eq-rank${compact ? ' sm' : ''}">
    <p class="qz-kicker">Your title</p>
    <p class="eq-rank-t">${esc(r.title)}</p>
    ${compact ? '' : `<p class="eq-rank-l">${esc(r.line)}</p>`}
    <div class="eq-meter" role="img" aria-label="${r.next ? `${fmt.int(r.next.at - t)} more to ${r.next.title}` : 'Top of the ladder'}"><span style="width:${pct.toFixed(1)}%"></span></div>
    <p class="eq-rank-n"><b>${bucks(t)}</b>${r.next ? `<span>${fmt.int(r.next.at - t)} to ${esc(r.next.title)}</span>` : '<span>Top of the ladder</span>'}</p>
  </div>`;
}

const levelPills = (type, level, here = false) => `<div class="eq-levels" role="group" aria-label="Difficulty">${LEVELS.map((l) => {
  const on = l === level;
  return here
    ? `<a class="eq-level${on ? ' on' : ''}" href="#/quiz/${type}/${l}"${on ? ' aria-current="page"' : ''}><b>${LEVEL_NAME[l]}</b><small>${POINTS[l]} a right answer</small></a>`
    : `<button type="button" class="eq-level${on ? ' on' : ''}" data-level="${l}" aria-pressed="${on}"><b>${LEVEL_NAME[l]}</b><small>${POINTS[l]} a right answer</small></button>`;
}).join('')}</div>`;

// ---------------------------------------------------------------- the hub

export function hub(D) {
  // Old shared links went to the daily game's second tab.
  if (/@name-that-episode/.test(location.hash)) {
    location.replace('#/quiz/daily@name-that-episode');
    return { title: 'Quiz', html: '', after() {} };
  }
  const html = `
  <section class="wrap page-head qz-top">
    <p class="eyebrow">Quiz night</p>
    <h1>Play until <em>it’s dark out.</em></h1>
    <p class="lede">${words(TYPES.length)} kinds of question, three difficulties, and no last question. Every right answer pays Schrute Bucks, and they add up in this browser for good. Five right in a row and each answer pays double until you miss.</p>
  </section>
  <section class="wrap">
    <div class="eq-top-grid">
      <div class="card rv eq-rank-card" id="eq-rank"></div>
      <a class="card rv eq-daily" href="#/quiz/daily" style="--d:.06s">
        <p class="qz-kicker">Every day</p>
        <h3 class="card-title">Today’s five</h3>
        <p class="card-sub">Who Said It? with five lines, the same five for everyone, new ones at midnight. Plus Name That Episode, ten rounds a game.</p>
        <span class="link-arrow">Play today’s</span>
      </a>
    </div>
  </section>
  <section class="section wrap" aria-labelledby="eq-pick-h">
    <div class="eq-pick-head">
      <h2 class="eq-h" id="eq-pick-h">Pick a difficulty, then a game</h2>
      <div id="eq-levels"></div>
    </div>
    <div id="eq-games"></div>
  </section>
  <section class="section wrap" aria-labelledby="eq-ledger-h">
    <h2 class="eq-h" id="eq-ledger-h">The ledger</h2>
    <p class="card-sub">Schrute Bucks by game and difficulty. It lives in this browser, so clearing your history clears it too.</p>
    <div id="eq-ledger"></div>
  </section>`;

  return {
    title: 'Quiz',
    html,
    after(root) {
      let L = ledger();
      let level = LEVELS.includes(L.level) ? L.level : 'easy';
      const draw = () => {
        $('#eq-rank', root).innerHTML = rankHtml(L);
        $('#eq-levels', root).innerHTML = levelPills('', level);
        $$('#eq-levels [data-level]', root).forEach((b) => b.addEventListener('click', () => {
          level = b.dataset.level;
          L.level = level;
          keep();
          draw();
          $(`#eq-levels [data-level="${level}"]`, root)?.focus();
        }));
        const card = (t, big = false) => {
          const c = peek(L, t.id, level);
          const all = typeTotal(L, t.id);
          return `<a class="eq-game${big ? ' big' : ''}" href="#/quiz/${t.id}/${level}">
            <span class="eq-game-t">${esc(t.name)}</span>
            <span class="eq-game-b">${esc(t.blurb)}</span>
            <span class="eq-game-s">${c.played ? `<b>${bucks(c.pts)}</b> on ${LEVEL_NAME[level].toLowerCase()} · ${fmt.int(c.right)} of ${fmt.int(c.played)} right` : all.played ? `${bucks(all.pts)} so far, none on ${LEVEL_NAME[level].toLowerCase()}` : 'Not played yet'}</span>
            <span class="eq-go" aria-hidden="true">${arrow}</span>
          </a>`;
        };
        $('#eq-games', root).innerHTML = `${card(MIXED, true)}
          ${GROUPS.map((g) => `<h3 class="eq-g">${esc(g.name)}</h3><div class="eq-games">${TYPES.filter((t) => t.group === g.id).map((t) => card(t)).join('')}</div>`).join('')}`;
        $('#eq-ledger', root).innerHTML = ledgerHtml(L);
        $('#eq-reset', root)?.addEventListener('click', (ev) => {
          const b = ev.currentTarget;
          if (b.dataset.armed !== '1') {
            b.dataset.armed = '1';
            b.textContent = 'Click again to wipe it. Toby will not ask why.';
            return;
          }
          mem = { t: {}, seen: {}, level };
          L = mem;
          keep();
          draw();
        });
      };
      draw();
    },
  };
}

function ledgerHtml(L) {
  const rows = [...TYPES, MIXED];
  const any = total(L) > 0;
  if (!any) return '<p class="qz-board-note">Nothing in the ledger yet. Answer one right and it starts filling in.</p>';
  const td = (c) => (c.played ? `<b>${fmt.int(c.pts)}</b><small>${fmt.int(c.right)}/${fmt.int(c.played)}</small>` : '<span class="muted">·</span>');
  return `<div class="table-wrap"><table class="data eq-ledger">
    <thead><tr><th>Game</th>${LEVELS.map((l) => `<th class="r">${LEVEL_NAME[l]}</th>`).join('')}<th class="r">All</th></tr></thead>
    <tbody>${rows.map((t) => `<tr><td><a href="#/quiz/${t.id}/${L.level || 'easy'}">${esc(t.name)}</a></td>${LEVELS.map((l) => `<td class="r">${td(peek(L, t.id, l))}</td>`).join('')}<td class="r">${td(typeTotal(L, t.id))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>All games</td>${LEVELS.map((l) => `<td class="r">${td(levelTotal(L, l))}</td>`).join('')}<td class="r"><b>${fmt.int(total(L))}</b></td></tr></tfoot>
  </table></div>
  <p class="small muted mt">Bold is Schrute Bucks; the small numbers are right answers out of questions played.</p>
  <button type="button" class="btn ghost mt" id="eq-reset">Wipe the ledger</button>`;
}

// ---------------------------------------------------------------- play

// One run per game and level, kept while you browse, so Back from a link in an answer brings that answer back.
const runs = new Map();

export function play(D, type, level) {
  const t = type === MIXED.id ? MIXED : TYPE[type];
  if (!t || !LEVELS.includes(level)) return null;
  const others = [...TYPES, MIXED].filter((x) => x.id !== type);
  const html = `
  <section class="wrap page-head qz-top eq-top">
    <div class="crumbs"><a href="#/quiz">Quiz</a><span>/</span><span>${esc(t.name)}</span></div>
    <h1>${esc(t.name)}</h1>
    <p class="lede">${esc(t.blurb)}</p>
    ${levelPills(type, level, true)}
  </section>
  <section class="wrap qz-wrap">
    <div class="qz-stage">
      <div class="qz-main" id="eq-main"><div class="qz-card qz-loading"><div class="boot-bars" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div><p>Pulling the script out of the filing cabinet…</p></div></div>
      <aside class="qz-board" id="eq-board" aria-label="Your score"></aside>
    </div>
    <p class="qz-sr" id="eq-live" aria-live="polite" aria-atomic="true"></p>
  </section>
  <section class="section wrap">
    <h2 class="eq-h">Something else</h2>
    <div class="eq-chips">${others.map((x) => `<a class="chip" href="#/quiz/${x.id}/${level}">${esc(x.name)}</a>`).join('')}</div>
  </section>`;
  return { title: `${t.name} · ${LEVEL_NAME[level]}`, html, after: (root) => start(D, type, level, root) };
}

async function start(D, type, level, root) {
  const main = $('#eq-main', root);
  const board = $('#eq-board', root);
  const liveEl = $('#eq-live', root);
  const live = (msg) => {
    liveEl.textContent = '';
    requestAnimationFrame(() => { if (liveEl.isConnected) liveEl.textContent = msg; });
  };
  let bank;
  try {
    bank = await loadBank();
  } catch (err) {
    if (!main.isConnected) return;
    main.innerHTML = '<div class="qz-card qz-loading"><p>The filing cabinet is stuck. That usually means the connection dropped.</p><button type="button" class="btn ghost" id="eq-retry">Try again</button></div>';
    $('#eq-retry', main).addEventListener('click', () => start(D, type, level, root));
    return;
  }
  if (!main.isConnected) return;

  const L = ledger();
  L.level = level;
  keep();
  const key = `${type}/${level}`;
  const run = runs.get(key) || { n: 0, right: 0, streak: 0, pts: 0, q: null, picked: null, gain: 0 };
  runs.set(key, run);
  const kinds = available(bank).map((x) => x.id);
  let ctl = null;
  let toast = '';

  const seenFor = (qt) => {
    const k = `${qt}/${level}`;
    return new Set(L.seen[k] || []);
  };
  const markSeen = (q) => {
    const k = `${q.type}/${level}`;
    const list = L.seen[k] || (L.seen[k] = []);
    if (!list.includes(q.id)) list.push(q.id);
    if (list.length > SEEN_CAP) list.splice(0, list.length - SEEN_CAP);
  };

  function next() {
    const qt = type === MIXED.id ? kinds[Math.floor(Math.random() * kinds.length)] : type;
    const seen = seenFor(qt);
    let q = make(qt, level, { D, bank, rnd: Math.random, seen });
    if (q?.repeat) {
      // Every question in this pool has come up; start the pool over.
      L.seen[`${qt}/${level}`] = [];
      q = make(qt, level, { D, bank, rnd: Math.random, seen: new Set() });
    }
    return q;
  }

  function drawBoard() {
    const c = peek(L, type, level);
    board.innerHTML = `<div class="card qz-board-card">
      ${rankHtml(L, { compact: true })}
      ${toast ? `<p class="eq-toast" role="status">${toast}</p>` : ''}
      <p class="qz-kicker mt">This run</p>
      <div class="qz-nums"><div><b>${fmt.int(run.right)}<small>/${fmt.int(run.n)}</small></b><span>Right</span></div><div><b>${run.streak}</b><span>In a row</span></div><div><b>${fmt.int(run.pts)}</b><span>Bucks</span></div></div>
      <p class="qz-kicker mt">${esc(name(type))} · ${LEVEL_NAME[level]}</p>
      <div class="qz-nums"><div><b>${fmt.int(c.pts)}</b><span>Bucks</span></div><div><b>${fmt.int(c.right)}<small>/${fmt.int(c.played)}</small></b><span>Right</span></div><div><b>${c.best}</b><span>Best run</span></div></div>
      <p class="qz-board-note">${run.streak >= STREAK ? `<b>Double pay is on.</b> Every right answer is worth ${POINTS[level] * 2} until you miss.` : `${LEVEL_NAME[level]} pays ${POINTS[level]} a right answer. ${STREAK} in a row and it doubles until you miss.`}</p>
      <p class="qz-board-note"><a href="#/quiz">All games and the ledger</a></p>
    </div>`;
  }

  function ask(q, picked = null) {
    run.q = q;
    run.picked = picked;
    const R = render(D, q);
    const worth = award(level, run.streak);
    ctl = round(main, {
      n: run.n,
      picked,
      cls: `eq-card eq-${q.type}`,
      one: R.one,
      head: `<div class="qz-head"><span class="qz-label"><b>${type === MIXED.id ? esc(TYPE[q.type].name) : `Question ${fmt.int(run.n + (picked == null ? 1 : 0))}`}</b> · <span class="qz-run">${LEVEL_NAME[level]}</span></span><span class="eq-worth${worth > POINTS[level] ? ' double' : ''}">${picked == null ? `Worth ${worth}` : ''}</span></div>`,
      body: R.body,
      ask: R.ask,
      choices: q.choices.map(R.choice),
      answer: q.answer,
      rightTag: R.rightTag,
      reveal: (i, right) => R.reveal(i, right),
      say: (i, right) => R.say(i, right),
      nextLabel: 'Next question',
      onAnswer(i, right, repeat) {
        run.picked = i;
        requestAnimationFrame(() => $$('.hbars', main).forEach((h) => h.classList.add('go')));
        if (repeat) return;
        const before = rankOf(total(L));
        const gain = right ? award(level, run.streak) : 0;
        run.n += 1;
        run.right += right ? 1 : 0;
        run.streak = right ? run.streak + 1 : 0;
        run.pts += gain;
        run.gain = gain;
        const c = cell(L, type, level);
        c.played += 1;
        c.right += right ? 1 : 0;
        c.pts += gain;
        c.best = Math.max(c.best, run.streak);
        markSeen(q);
        keep();
        const after = rankOf(total(L));
        toast = after.i > before.i ? `Promoted to <b>${esc(after.title)}</b>. ${esc(after.line)}` : run.streak === STREAK ? `<b>${STREAK} in a row.</b> Double pay until you miss.` : '';
        const w = $('.eq-worth', main);
        if (w) {
          w.className = `eq-worth ${right ? 'won' : 'lost'}`;
          w.textContent = right ? `+${gain}` : '+0';
        }
        drawBoard();
        if (toast && after.i > before.i) live(`Promoted to ${after.title}.`);
      },
      onNext() {
        toast = '';
        const nq = next();
        if (!nq) return;
        ask(nq);
        drawBoard();
        const c = $('.qz-card', main);
        c?.focus({ preventScroll: true });
        const r = c?.getBoundingClientRect();
        if (r && r.top < 70) window.scrollBy({ top: r.top - 84, behavior: reduce.matches ? 'auto' : 'smooth' });
        live(`Question ${run.n + 1}.`);
      },
    }, live);
  }

  // Coming back to a run: show the question that was up, answered or not.
  if (run.q && run.q.type && (type === MIXED.id || run.q.type === type)) ask(run.q, run.picked);
  else {
    const q = next();
    if (!q) { main.innerHTML = '<div class="qz-card qz-loading"><p>Nothing to ask at this level yet.</p></div>'; return; }
    ask(q);
  }
  drawBoard();

  // 1 to 4 picks, Enter moves on. The listener lets itself go once the page is gone.
  const onKey = (ev) => {
    if (!root.contains(main)) { document.removeEventListener('keydown', onKey); return; }
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat || !ctl) return;
    if (!document.getElementById('palette')?.hidden || !document.getElementById('sheet')?.hidden) return;
    const ae = document.activeElement;
    if (ae && (/^(input|textarea|select)$/i.test(ae.tagName) || ae.isContentEditable)) return;
    if (/^[1-4]$/.test(ev.key)) {
      if (ctl.pick(Number(ev.key) - 1)) ev.preventDefault();
    } else if (ev.key === 'Enter') {
      if (ae && ae !== ctl.card && ae.closest('button, a, summary')) return;
      if (ctl.next()) ev.preventDefault();
    }
  };
  document.addEventListener('keydown', onKey);
}

// ---------------------------------------------------------------- how each kind of question looks

const kOpt = (c) => `<span class="qz-opt-l"><i class="dot" style="background:${color(c.k)}"></i>${esc(c.t)}</span>`;
const tOpt = (c) => `<span class="qz-opt-l">${esc(c.t)}</span>`;
const who = (k) => `<a class="qz-sp" href="${hasPage(k) ? `#/character/${slug(k)}` : '#/characters'}"><i class="dot" style="background:${color(k)}"></i>${esc(k)}</a>`;
let castKeys = null;
const hasPage = (k) => castKeys?.has(k);
const epLink = (e) => `<a href="#/episode/${e.id}">${esc(e.t)}</a>`;
const epBlock = (e, extra = '') => `<div class="qz-ep">
    <a class="qz-ep-t" href="#/episode/${e.id}">${esc(e.t)}</a>
    <p class="qz-ep-m"><span>${epCode(e)}</span><span>Aired ${fmt.date(e.date)}</span><span><span class="rating">${fmt.dec(e.r)}</span> on IMDb</span>${extra}</p>
  </div>`;
const line = (t) => `<blockquote class="qz-line"><p>${esc(t)}</p></blockquote>`;
const youPicked = (q, i, right, f = (c) => c.t) => (right ? '' : `<p class="qz-aside">You picked ${esc(f(q.choices[i]))}.</p>`);
const sameSeason = (D, q) => {
  const s = q.choices.map((c) => D.episodes[c.ep].s);
  return s.every((x) => x === s[0]) ? ` All four are from season ${s[0]}.` : '';
};

function render(D, q) {
  castKeys ??= new Set(D.characters.map((c) => c.key));
  const E = D.episodes;
  const e = E[q.ep];
  switch (q.type) {
    case 'who': {
      const sig = D.char[q.k]?.signature || [];
      const have = new Set(q.line.t.toLowerCase().replace(/’/g, "'").match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || []);
      const tell = sig.filter((s) => have.has(s.w)).sort((a, b) => b.z - a.z)[0];
      return {
        body: `${line(q.line.t)}<p class="qz-ask">Who said it?</p>`,
        ask: 'Who said it?', choice: kOpt, rightTag: 'Said it',
        reveal: () => `<p class="qz-who">${who(q.k)} said it, in ${epLink(e)} <span class="qz-code">${epCode(e)}</span>.</p>
          ${tell ? `<p class="qz-tell">The tell: <mark>${esc(tell.w)}</mark> is one of ${esc(q.k)}’s signature words, said ${fmt.times(tell.n)} across the show.</p>` : ''}`,
        say: () => `${q.k} said it, in ${e.t}.`,
      };
    }
    case 'episode':
      return {
        one: true,
        body: `${line(q.line.t)}<p class="qz-ask">${esc(q.line.k)} said it. Which episode?${sameSeason(D, q)}</p>`,
        ask: 'Which episode?', choice: tOpt, rightTag: 'The episode',
        reveal: (i, right) => `${epBlock(e)}${youPicked(q, i, right)}`,
        say: () => `It’s ${e.t}, season ${e.s}.`,
      };
    case 'finish':
      return {
        one: true,
        body: `<blockquote class="qz-line eq-start"><p>${esc(q.start)} <span class="eq-gap" aria-label="blank">…</span></p></blockquote>
          <p class="qz-ask">${esc(q.k)}${q.level === 'easy' ? `, in “${esc(e.t)}”` : ''}. How does it end?</p>`,
        ask: 'How does it end?', choice: (c) => `<span class="qz-opt-l">…${esc(c.t)}</span>`, rightTag: 'How it ends',
        reveal: () => `<p class="eq-full">“${esc(q.start)} <mark>${esc(q.choices[q.answer].t)}</mark>”</p>
          <p class="qz-who">${who(q.k)}, in ${epLink(e)} <span class="qz-code">${epCode(e)}</span>.</p>`,
        say: () => `It ends: ${q.choices[q.answer].t}`,
      };
    case 'opening':
      return {
        one: true,
        body: `<div class="script eq-script">${q.rows.map(([k, t]) => `<div class="ln"><span class="sp"><i class="dot" style="background:${color(k)}"></i>${esc(k)}</span><span class="tx">${esc(t)}</span></div>`).join('')}</div>
          <p class="qz-ask">Which episode starts like this?${sameSeason(D, q)}</p>`,
        ask: 'Which episode starts like this?', choice: tOpt, rightTag: 'The episode',
        reveal: (i, right) => `${epBlock(e)}${youPicked(q, i, right)}`,
        say: () => `It’s ${e.t}.`,
      };
    case 'words':
      return {
        one: true,
        body: `<p class="qz-sr">The words:</p><div class="qz-tiles">${q.words.map((w, j) => `<span class="qz-tile" style="--d:${(0.05 + j * 0.09).toFixed(2)}s"><b>${esc(w.w)}</b><small hidden>${fmt.times(w.n)}</small></span>`).join('')}</div>
          <p class="qz-ask">One episode says these far more than the rest of the show. Which?${sameSeason(D, q)}</p>`,
        ask: 'Which episode?', choice: tOpt, rightTag: 'The episode',
        reveal: (i, right) => { requestAnimationFrame(() => $$('.eq-words .qz-tile small').forEach((s) => (s.hidden = false))); return `${epBlock(e)}${youPicked(q, i, right)}`; },
        say: () => `It’s ${e.t}.`,
      };
    case 'name': {
      const parts = q.blanked.split('____').map(esc);
      return {
        body: `<blockquote class="qz-line"><p>${parts.join('<span class="eq-gap" aria-label="blank">____</span>')}</p></blockquote>
          <p class="qz-ask">${esc(q.k)} said it${q.level === 'easy' ? `, in “${esc(e.t)}”` : ''}. Who goes in the blank?</p>`,
        ask: 'Who goes in the blank?', choice: kOpt, rightTag: 'In the blank',
        reveal: () => `<p class="eq-full">“${parts.join(`<mark>${esc(q.who.split(' ')[0])}</mark>`)}”</p>
          <p class="qz-who">${who(q.k)} about ${who(q.who)}, in ${epLink(e)} <span class="qz-code">${epCode(e)}</span>.</p>`,
        say: () => `It’s ${q.who}.`,
      };
    }
    case 'firsts': {
      const c = D.char[q.k];
      const t = q.last ? c.lastLine : c.firstLine;
      const said = t && t.ep === e.id && !(t.shuffled) ? `<p class="eq-full">“${esc(t.t)}”</p>` : '';
      return {
        one: true,
        body: `<p class="eq-q">Which episode has ${esc(q.k)}’s ${q.last ? 'last' : 'first'} line?</p>${q.level === 'easy' ? '' : `<p class="qz-ask">${sameSeason(D, q).trim() || 'Four episodes.'}</p>`}`,
        ask: `Which episode has ${q.k}’s ${q.last ? 'last' : 'first'} line?`, choice: tOpt, rightTag: q.last ? 'Last line' : 'First line',
        reveal: (i, right) => `${epBlock(e)}${said ? `<p class="qz-board-note">${q.last ? 'The last thing' : 'The first thing'} ${esc(q.k)} says:</p>${said}` : ''}${youPicked(q, i, right)}`,
        say: () => `${e.t}.`,
      };
    }
    case 'plot':
      return {
        one: true,
        body: `<p class="eq-q">${esc(q.q.q)}</p>`,
        ask: q.q.q, choice: tOpt, rightTag: 'Right answer',
        reveal: (i, right) => `<p class="eq-why">${esc(q.q.why)}</p>
          <div class="script eq-script eq-cite"><div class="ln"><span class="sp"><i class="dot" style="background:${color(q.q.cite.k)}"></i>${esc(q.q.cite.k)}</span><span class="tx">${esc(q.q.cite.t)}</span></div></div>
          <p class="qz-who">From ${epLink(e)} <span class="qz-code">${epCode(e)}</span>.</p>${youPicked(q, i, right)}`,
        say: () => `The answer is ${q.choices[q.answer].t}.`,
      };
    case 'missing': {
      const counts = q.present.map((k) => ({ label: k, v: e.c[D.codes[k]], color: color(k), dot: color(k) })).sort((a, b) => b.v - a.v);
      return {
        body: `<p class="eq-q">Who has no lines in “${esc(e.t)}”?</p><p class="qz-ask">${epCode(e)}. Three of these four talk in it.</p>`,
        ask: 'Who has no lines?', choice: kOpt, rightTag: 'No lines',
        reveal: () => `<p class="qz-who">${who(q.k)} has no lines in ${epLink(e)}. ${(D.char[q.k].perSeason[e.s - 1] || 0) > 0 ? `${esc(q.k)} does talk in season ${e.s}, just not this week.` : `${esc(q.k)} has no lines in season ${e.s} at all.`}</p>
          <p class="qz-board-note">The other three, by lines:</p>${hbars(counts, { fmtv: (v) => fmt.int(v) })}
          <p class="qz-board-note">No lines isn’t the same as not there: people sit in the background all the time.</p>`,
        say: () => `${q.k} has no lines in ${e.t}.`,
      };
    }
    case 'talk':
      return {
        body: `<p class="eq-q">Who has the most lines in “${esc(e.t)}”?</p><p class="qz-ask">${epCode(e)}.</p>`,
        ask: 'Who has the most lines?', choice: kOpt, rightTag: 'Most lines',
        reveal: () => `<p class="qz-who">${who(q.counts[0].k)}, with ${fmt.plural(q.counts[0].n, 'line')} in ${epLink(e)}.</p>
          ${hbars(q.counts.map((c) => ({ label: c.k, v: c.n, color: color(c.k), dot: color(c.k) })), { fmtv: (v) => fmt.int(v) })}`,
        say: () => `${q.counts[0].k}, with ${q.counts[0].n} lines.`,
      };
    case 'order': {
      const eps = q.eps.map((id) => E[id]).sort((a, b) => a.id - b.id);
      return {
        one: true,
        body: '<p class="eq-q">Which of these aired first?</p>',
        ask: 'Which aired first?', choice: tOpt, rightTag: 'Aired first',
        reveal: () => `<ol class="eq-list">${eps.map((x) => `<li${x.id === e.id ? ' class="on"' : ''}><a href="#/episode/${x.id}">${esc(x.t)}</a><span>${epCode(x)} · ${fmt.date(x.date)}</span></li>`).join('')}</ol>`,
        say: () => `${e.t} aired first, on ${fmt.date(e.date)}.`,
      };
    }
    case 'rating': {
      const eps = q.eps.map((id) => E[id]).sort((a, b) => b.r - a.r);
      return {
        one: true,
        body: `<p class="eq-q">Which of these has the highest IMDb rating?</p>${q.level === 'hard' ? `<p class="qz-ask">All four are from season ${e.s}.</p>` : ''}`,
        ask: 'Which rates highest?', choice: tOpt, rightTag: 'Rated highest',
        reveal: () => `<ol class="eq-list">${eps.map((x) => `<li${x.id === e.id ? ' class="on"' : ''}><a href="#/episode/${x.id}">${esc(x.t)}</a><span><span class="rating">${fmt.dec(x.r)}</span> · ${fmt.int(x.votes)} votes</span></li>`).join('')}</ol>`,
        say: () => `${e.t}, at ${fmt.dec(e.r)}.`,
      };
    }
    case 'crew': {
      const verb = q.job === 'wrote' ? 'wrote' : 'directed';
      const ask = q.cast ? `Which cast member ${verb} “${e.t}”?` : `Who ${verb} “${e.t}”?`;
      const crew = q.job === 'wrote' ? e.wri : e.dir;
      return {
        one: !q.cast,
        body: `<p class="eq-q">${esc(ask)}</p><p class="qz-ask">${epCode(e)}.</p>`,
        ask, rightTag: verb[0].toUpperCase() + verb.slice(1),
        choice: q.cast ? (c) => `<span class="qz-opt-l"><i class="dot" style="background:${color(c.k)}"></i>${esc(c.t)}<small class="eq-plays">plays ${esc(c.k)}</small></span>` : tOpt,
        reveal: (i, right) => `<p class="qz-who"><a href="#/person/${slug(q.person)}">${esc(q.person)}</a> ${verb} ${epLink(e)}${crew.length > 1 ? `, with ${esc(crew.filter((p) => p !== q.person).join(' and '))}` : ''}.</p>${youPicked(q, i, right)}`,
        say: () => `${q.person} ${verb} it.`,
      };
    }
    default:
      throw new Error(`no renderer for ${q.type}`);
  }
}
