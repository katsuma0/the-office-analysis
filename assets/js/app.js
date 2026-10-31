import { $, $$, esc, slug, observe, tip } from './ui.js';
import * as P from './pages.js';
import * as People from './people.js';
import * as Talk from './talk.js';
import * as Quiz from './quiz.js';
import * as Fun from './fun.js';

const app = $('#app');
let D;

// ---------------------------------------------------------------- data

async function load() {
  const res = await fetch('data/office.json');
  if (!res.ok) throw new Error(`office.json ${res.status}`);
  D = await res.json();
  const rs = D.episodes.map((e) => e.r);
  D.meta = { avg: rs.reduce((a, b) => a + b, 0) / rs.length };
  D.char = Object.fromEntries(D.characters.map((c) => [c.key, c]));
  D.charSlug = Object.fromEntries(D.characters.map((c) => [slug(c.key), c]));
  // Rank by lines, not by cast-list order.
  D.byLines = [...D.characters].sort((a, b) => b.lines - a.lines);
  D.byLines.forEach((c, i) => (c.rank = i + 1));
  D.people = {};
  for (const [role, list] of [['Director', D.directors], ['Writer', D.writers]]) {
    for (const p of list) {
      const s = slug(p.name);
      D.people[s] ??= { name: p.name, slug: s, roles: {} };
      D.people[s].roles[role] = p;
    }
  }
  return D;
}

// The transcript is split by season. A failed request isn't cached, so the next call retries.
const seasonP = {};
export function lines(season) {
  if (season == null) return Promise.all(D.seasons.map((s) => lines(s.n))).then((parts) => parts.flat());
  seasonP[season] ??= fetch(`data/lines/${season}.json`).then((r) => {
    if (!r.ok) throw new Error(`lines ${season} ${r.status}`);
    return r.json();
  }).catch((err) => { delete seasonP[season]; throw err; });
  return seasonP[season];
}

let quizP;
export function quizPool() {
  quizP ??= fetch('data/quiz.json').then((r) => {
    if (!r.ok) throw new Error(`quiz ${r.status}`);
    return r.json();
  }).catch((err) => { quizP = null; throw err; });
  return quizP;
}

// ---------------------------------------------------------------- router

const routes = [
  [/^\/?$/, () => P.home(D), 'home'],
  [/^\/seasons$/, () => P.seasons(D), 'season'],
  [/^\/season\/([1-9])$/, (m) => P.season(D, +m[1]), 'season'],
  [/^\/episodes$/, () => P.episodes(D), 'season'],
  [/^\/episode\/(\d+)$/, (m) => P.episode(D, +m[1], lines), 'season'],
  [/^\/characters$/, () => People.characters(D), 'character'],
  [/^\/character\/([\w-]+)$/, (m) => People.character(D, m[1], lines), 'character'],
  [/^\/crew$/, () => People.crew(D), 'crew'],
  [/^\/person\/([\w-]+)$/, (m) => People.person(D, m[1]), 'crew'],
  [/^\/dialogue(?:\/q\/(.+))?$/, (m) => Talk.dialogue(D, lines, m[1]), 'dialogue'],
  [/^\/findings$/, () => Talk.findings(D), 'findings'],
  [/^\/about$/, () => Talk.about(D), 'about'],
  [/^\/quiz$/, () => Quiz.quiz(D, quizPool), 'quiz'],
  [/^\/dundies$/, () => Fun.dundies(D, lines), 'fun'],
  [/^\/couples$/, () => Fun.couples(D), 'fun'],
];

let cleanup = [];
export function onLeave(fn) { cleanup.push(fn); }

// In-app link clicks go to the top of the new page; Back and Forward restore where the reader was.
const scrollMemo = new Map();
let forward = false;
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) forward = true;
}, true);

function path() {
  let raw = location.hash.replace(/^#/, '');
  try { raw = decodeURIComponent(raw); } catch (e) { /* a stray % in a hand-typed URL */ }
  return raw || '/';
}

let current = null;
function render() {
  const p = path();
  // "#app" from the skip link, or anything else that isn't a route, isn't a page change.
  if (!p.startsWith('/')) {
    if (!current) { history.replaceState(null, '', '#/'); render(); }
    return;
  }
  if (current) scrollMemo.set(current, scrollY);
  const [route, anchor] = p.split('@');
  let hit = null;
  for (const [re, fn, nav] of routes) {
    const m = route.match(re);
    if (m) { hit = { fn, m, nav }; break; }
  }
  const restore = !forward && scrollMemo.has(p) ? scrollMemo.get(p) : null;
  forward = false;
  current = p;
  const go = () => {
    tip.hide();
    cleanup.forEach((fn) => { try { fn(); } catch (e) { /* page already gone */ } });
    cleanup = [];
    let page;
    try {
      page = hit ? hit.fn(hit.m) : null;
    } catch (err) {
      console.error(err);
      page = null;
    }
    if (!page) page = { title: 'Not here', html: `<section class="wrap page-head"><p class="eyebrow">404</p><h1>Nobody here<br><em>but Creed.</em></h1><p class="lede">That page doesn't exist. Try the <a href="#/">front page</a>, or <a href="#/quiz">play Who Said It?</a> while you're here.</p></section>` };
    app.innerHTML = `<div class="page">${page.html}</div>`;
    document.title = page.title ? `${page.title} · The Office, by the numbers` : 'The Office, by the numbers · Katsuma Onishi';
    page.after?.(app);
    observe(app);
    $$('.nav a').forEach((a) => {
      const on = hit?.nav === a.dataset.nav;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const target = anchor && document.getElementById(anchor);
    if (target) target.scrollIntoView();
    else if (restore != null) requestAnimationFrame(() => window.scrollTo({ top: restore, behavior: 'instant' }));
    else window.scrollTo({ top: 0, behavior: 'instant' });
    app.focus({ preventScroll: true });
  };
  closeSheet();
  closePal(false);
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches && app.dataset.ready) {
    const vt = document.startViewTransition(go);
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
  } else go();
  app.dataset.ready = '1';
}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// ---------------------------------------------------------------- chrome: header, theme, sheet, progress

$('.skip').addEventListener('click', (e) => { e.preventDefault(); app.focus(); app.scrollIntoView(); });

const top = $('.top');
const bar = $('.progress span');
addEventListener('scroll', () => {
  top.classList.toggle('scrolled', scrollY > 8);
  const h = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
}, { passive: true });

const metaTheme = $$('meta[name="theme-color"]');
function paintTheme() {
  const t = document.documentElement.dataset.theme;
  if (!t) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  metaTheme.forEach((m) => { m.setAttribute('content', bg); m.removeAttribute('media'); });
}
paintTheme();
$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
  paintTheme();
});

const sheet = $('#sheet');
const menu = $('#menu');
function closeSheet() { sheet.hidden = true; menu.setAttribute('aria-expanded', 'false'); unlock(); }
menu.addEventListener('click', () => {
  const open = sheet.hidden;
  sheet.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
  if (open) lock(); else unlock();
});
sheet.addEventListener('click', (e) => { if (e.target.closest('a')) closeSheet(); });
addEventListener('resize', () => { if (!sheet.hidden && innerWidth > 900) closeSheet(); });

let locks = 0;
function lock() { locks++; document.body.style.overflow = 'hidden'; }
function unlock() { locks = Math.max(0, locks - 1); if (!locks) document.body.style.overflow = ''; }

// ---------------------------------------------------------------- jump-to palette

const pal = $('#palette');
const q = $('#palette-q');
const list = $('#palette-list');
let items = [];
let sel = 0;
let opener = null;
let indexCache;

function index() {
  if (indexCache) return indexCache;
  const out = [
    { t: 'Home', s: 'Page', h: '#/' }, { t: 'Findings', s: 'Page', h: '#/findings' }, { t: 'Dialogue and search', s: 'Page', h: '#/dialogue' },
    { t: 'Directors and writers', s: 'Page', h: '#/crew' }, { t: 'Every episode, ranked', s: 'Page', h: '#/episodes' },
    { t: 'Who Said It? quiz', s: 'Page', h: '#/quiz' }, { t: 'The Dundies', s: 'Page', h: '#/dundies' },
    { t: 'Couples Discount', s: 'Page', h: '#/couples' }, { t: 'How I made this', s: 'Page', h: '#/about' },
  ];
  D.seasons.forEach((s) => out.push({ t: `Season ${s.n}`, s: `${s.year} to ${s.endYear}`, h: `#/season/${s.n}` }));
  D.characters.forEach((c) => out.push({ t: c.name, s: 'Character', h: `#/character/${slug(c.key)}` }));
  D.episodes.forEach((e) => out.push({ t: e.t, s: `S${e.s} E${e.se}`, h: `#/episode/${e.id}` }));
  Object.values(D.people).forEach((p) => out.push({ t: p.name, s: Object.keys(p.roles).join(' and '), h: `#/person/${p.slug}` }));
  // Match without punctuation so "scotts tots" finds Scott's Tots.
  const n = (s) => s.toLowerCase().replace(/[’'.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  out.forEach((i) => { i.nt = n(i.t); i.ns = n(i.s); });
  indexCache = { out, n };
  return indexCache;
}

function draw() {
  const { out, n } = index();
  const term = n(q.value);
  if (!term) items = out.slice(0, 14);
  else {
    const scored = [];
    for (const i of out) {
      const at = i.nt.indexOf(term);
      if (at >= 0) scored.push([at === 0 ? 0 : i.nt.includes(` ${term}`) ? 1 : 2, at, i]);
      else if (i.ns.includes(term)) scored.push([3, 0, i]);
    }
    items = scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].t.length - b[2].t.length).slice(0, 40).map((x) => x[2]);
  }
  sel = 0;
  list.innerHTML = items.length
    ? items.map((i, k) => `<li role="presentation"><a href="${i.h}" id="pal-${k}" class="${k === 0 ? 'sel' : ''}" role="option" aria-selected="${k === 0}">${esc(i.t)}<small>${esc(i.s)}</small></a></li>`).join('')
    : '<li class="empty">Nothing by that name. Not even in the annex.</li>';
  q.setAttribute('aria-activedescendant', items.length ? 'pal-0' : '');
}
function select(k) {
  const links = $$('a', list);
  if (!links.length) return;
  sel = (k + links.length) % links.length;
  links.forEach((a, i) => { a.classList.toggle('sel', i === sel); a.setAttribute('aria-selected', String(i === sel)); });
  links[sel].scrollIntoView({ block: 'nearest' });
  q.setAttribute('aria-activedescendant', links[sel].id);
}
function openPal() {
  if (!pal.hidden) return;
  opener = document.activeElement;
  pal.hidden = false;
  q.value = '';
  draw();
  q.focus();
  lock();
}
function closePal(restoreFocus = true) {
  if (pal.hidden) return;
  pal.hidden = true;
  unlock();
  if (restoreFocus) opener?.focus?.();
}
$('#open-search').addEventListener('click', openPal);
pal.addEventListener('click', (e) => { if (e.target === pal) closePal(); });
list.addEventListener('pointermove', (e) => {
  const a = e.target.closest('a');
  if (a) select($$('a', list).indexOf(a));
});
q.addEventListener('input', draw);
q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    select(sel + (e.key === 'ArrowDown' ? 1 : -1));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const a = $$('a', list)[sel];
    if (a) { forward = true; location.hash = a.getAttribute('href'); }
  } else if (e.key === 'Tab') {
    e.preventDefault(); // the input is the only stop; arrows move through results
  }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!pal.hidden) closePal(); else if (!sheet.hidden) { closeSheet(); menu.focus(); } }
  const typing = /input|textarea|select/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (!typing && (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey)))) { e.preventDefault(); openPal(); }
});

// ---------------------------------------------------------------- go

load().then(() => {
  addEventListener('hashchange', render);
  render();
}).catch((err) => {
  console.error(err);
  app.innerHTML = '<section class="wrap page-head"><h1>That didn\'t load.</h1><p class="lede">The data file didn\'t come through. Refresh and it usually does.</p></section>';
});
