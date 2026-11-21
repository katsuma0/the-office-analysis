import { $, $$, esc, slug, observe, tip, nav, epCode } from './ui.js';
import * as P from './pages.js';
import * as People from './people.js';
import * as Talk from './talk.js';
import * as Quiz from './quiz.js';
import * as Fun from './fun.js';
import * as Endless from './endless.js';
import { TYPES as QUIZ_TYPES } from './qgen.js';
import { PAGES, SPOTS, OLD } from './sitemap.js';
import { drawNav, markCurrent, sectionBar, tour, toTop, arriveAt, steadyBars } from './wayfinding.js';

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

// The last item is the page's key in sitemap.js, which is what lights up in the nav and the menu.
const routes = [
  [/^\/?$/, () => P.home(D), 'home'],
  [/^\/seasons$/, () => P.seasons(D), 'seasons'],
  [/^\/season\/([1-9])$/, (m) => P.season(D, +m[1]), 'seasons'],
  [/^\/episodes$/, () => P.episodes(D), 'episodes'],
  [/^\/episode\/(\d+)$/, (m) => P.episode(D, +m[1], lines), 'seasons'],
  [/^\/characters$/, () => People.characters(D), 'characters'],
  [/^\/character\/([\w-]+)$/, (m) => People.character(D, m[1], lines), 'characters'],
  [/^\/crew$/, () => People.crew(D), 'crew'],
  [/^\/person\/([\w-]+)$/, (m) => People.person(D, m[1]), 'crew'],
  [/^\/dialogue(?:\/q\/(.+))?$/, (m) => Talk.dialogue(D, lines, m[1]), 'dialogue'],
  [/^\/findings$/, () => Talk.findings(D), 'findings'],
  [/^\/quiz$/, () => Endless.hub(D), 'quiz'],
  [/^\/quiz\/daily$/, () => Quiz.quiz(D, quizPool), 'daily'],
  [/^\/quiz\/([\w-]+)\/(easy|medium|hard)$/, (m) => Endless.play(D, m[1], m[2]), 'quiz'],
  [/^\/dundies$/, () => Fun.dundies(D, lines), 'dundies'],
  [/^\/couples$/, () => Fun.couples(D), 'couples'],
];

let cleanup = [];
export function onLeave(fn) { cleanup.push(fn); }

// In-app link clicks go to the top of the new page; Back and Forward restore where the reader was.
// Code that navigates without a link (charts, the palette) marks its trip with nav.go from ui.js.
const scrollMemo = new Map();
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) nav.mark(a.getAttribute('href'));
}, true);

function pathOf(hash) {
  let raw = hash.replace(/^#/, '');
  try { raw = decodeURIComponent(raw); } catch (e) { /* a stray % in a hand-typed URL */ }
  return raw || '/';
}
const path = () => pathOf(location.hash);

let current = null;
let shown = null; // the route of the page on screen, without any @anchor
function render(ev) {
  const p = path();
  // "#app" from the skip link, or anything else that isn't a route, isn't a page change.
  if (!p.startsWith('/')) {
    if (!current) { history.replaceState(null, '', '#/'); render(); }
    return;
  }
  // Remember the scroll under the URL being left. A page can rewrite its own URL (the dialogue search does),
  // so the last path rendered here isn't always it.
  const left = ev?.oldURL ? pathOf(new URL(ev.oldURL).hash) : current;
  if (left?.startsWith('/')) scrollMemo.set(left, scrollY);
  const [route, anchor] = p.split('@');
  let hit = null;
  for (const [re, fn, section] of routes) {
    const m = route.match(re);
    if (m) { hit = { fn, m, nav: section }; break; }
  }
  const fwd = nav.to === location.href;
  nav.to = null;
  const restore = !fwd && scrollMemo.has(p) ? scrollMemo.get(p) : null;
  closeSheet();
  closePal(false);
  // A link to a marked spot on the page already showing (an award from the Dundies index, "Findings" in the menu
  // while halfway down Findings) is a jump, not a page change: move there and leave the page as it is. Only
  // spots a page marked with data-sec or data-jump count; any other @anchor is that page's own business.
  const spot = (a) => (a ? document.getElementById(a) : null);
  const marked = (a) => !a || !!spot(a)?.matches('[data-sec], [data-jump]');
  const [leftRoute, leftAnchor] = (left || '').split('@');
  if (shown === route && leftRoute === route && (anchor || leftAnchor) && marked(anchor) && marked(leftAnchor)) {
    current = p;
    const smooth = fwd && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant';
    if (restore != null) window.scrollTo({ top: restore, behavior: 'instant' });
    else if (anchor) spot(anchor).scrollIntoView({ behavior: smooth, block: 'start' });
    else window.scrollTo({ top: 0, behavior: smooth });
    return;
  }
  current = p;
  shown = route;
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
    if (!page) page = { title: 'Not here', html: `<section class="wrap page-head"><p class="eyebrow">404</p><h1>Nobody here<br><em>but Creed.</em></h1><p class="lede">Try the <a href="#/">front page</a>, or <a href="#/quiz/daily">play Who Said It?</a> while you're here.</p></section>` };
    app.innerHTML = `<div class="page">${page.html}</div>`;
    document.title = page.title ? `${page.title} · The Office, by the numbers` : 'The Office, by the numbers · Katsuma Onishi';
    page.after?.(app);
    sectionBar(app, route, onLeave);
    tour(app, route);
    observe(app);
    markCurrent(hit?.nav ?? null, route);
    // Back to a page puts the reader where they were, even when its URL has an @anchor; the anchor is for arriving.
    const target = anchor && document.getElementById(anchor);
    if (restore != null) requestAnimationFrame(() => window.scrollTo({ top: restore, behavior: 'instant' }));
    else if (target) arriveAt(target, $('.page', app));
    else window.scrollTo({ top: 0, behavior: 'instant' });
    // On a page change focus goes to the new page. On first load it stays put, so Tab starts at the skip link
    // and the nav like on any other site.
    if (app.dataset.ready) app.focus({ preventScroll: true });
  };
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

drawNav();
toTop(app);
steadyBars();

const sheet = $('#sheet');
const sheetBack = $('#sheet-back');
const menu = $('#menu');
function closeSheet() { sheet.hidden = true; sheetBack.hidden = true; menu.setAttribute('aria-expanded', 'false'); unlock(); }
menu.addEventListener('click', () => {
  const open = sheet.hidden;
  sheet.hidden = !open;
  sheetBack.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
  if (open) lock(); else unlock();
});
// Any tap that isn't on a menu link closes the menu: the dimmed page below it, the blank part of the menu itself,
// or the empty header. iPhone Safari only reports taps on elements that listen for them, so the backdrop is a
// real element with its own listener rather than a catch-all on the document.
sheet.addEventListener('click', closeSheet);
sheetBack.addEventListener('click', closeSheet);
// A link to the page already showing changes nothing in the address, so nothing would happen. In the nav, the
// menu and the logo it means "take me back to the top".
document.addEventListener('click', (e) => {
  const a = e.target.closest('.nav a, #sheet a, .brand');
  if (a && a.getAttribute('href') === (location.hash || '#/')) window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
$('.top').addEventListener('click', (e) => { if (!sheet.hidden && !e.target.closest('a, button')) closeSheet(); });
// The menu button only shows while the top nav doesn't fit; once it's gone, so is the menu.
addEventListener('resize', () => { if (!sheet.hidden && getComputedStyle(menu).display === 'none') closeSheet(); });

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
  // pri breaks ties between kinds: a page beats the episode it's named after ("The Dundies"), which beats a person.
  // k is other words someone might type for it; a quiz entry's link is filled in at draw time (see quizLevel).
  const out = [
    { t: 'Home', s: 'Page', h: '#/', pri: 0 },
    ...PAGES.map((p) => ({ t: p.name, s: 'Page', h: p.h, k: p.k, pri: 0 })),
    ...SPOTS.map((x) => ({ ...x, pri: 1 })),
    ...(D.dundies || []).map((d) => ({ t: d.award, s: 'Dundie', h: `#/dundies@${d.id}`, k: `${d.k} dundie award`, pri: 1 })),
    ...(D.couples || []).map((c) => ({ t: `${c.a} & ${c.b}`, s: 'Couples Discount', h: `#/couples@${slug(`${c.a}-${c.b}`)}`, k: `${c.a} and ${c.b}|${c.b} and ${c.a}|${c.b} ${c.a}`, pri: 1 })),
    ...QUIZ_TYPES.map((q) => ({ t: q.name, s: 'Quiz game', quiz: q.id, k: 'game play', pri: 2 })), { t: 'Mixed Bag', s: 'Quiz game', quiz: 'mixed', k: 'game play', pri: 2 },
    { t: OLD.name, s: 'My first version, from 2023', h: OLD.h, k: 'old original first r report', pri: 2 },
  ];
  D.seasons.forEach((s) => out.push({ t: `Season ${s.n}`, s: s.year === s.endYear ? `${s.year}` : `${s.year} to ${s.endYear}`, h: `#/season/${s.n}`, pri: 2 }));
  D.characters.forEach((c) => out.push({ t: c.name, s: 'Character', h: `#/character/${slug(c.key)}`, k: c.actor, pri: 2 }));
  D.episodes.forEach((e) => out.push({ t: e.t, s: `Episode · ${epCode(e)}`, h: `#/episode/${e.id}`, pri: 3 }));
  Object.values(D.people).forEach((p) => out.push({ t: p.name, s: Object.keys(p.roles).join(' and '), h: `#/person/${p.slug}`, pri: 4 }));
  // Match without punctuation so "scotts tots" finds Scott's Tots, and without a leading "the" so "dund" finds
  // The Dundies as fast as Dunder Mifflin Infinity.
  const n = (s) => s.toLowerCase().replace(/[’'.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  out.forEach((i) => { i.nt = n(i.t).replace(/^the /, ''); i.ns = n(i.s); i.nk = (i.k || '').split('|').flatMap((x) => [n(x), ...n(x).split(' ')]).filter(Boolean); });
  indexCache = { out, n };
  return indexCache;
}

// A quiz game found by search opens at the difficulty last played, not always on easy.
function quizLevel() {
  try { const l = JSON.parse(localStorage.getItem('quiz-ledger') || 'null')?.level; if (['easy', 'medium', 'hard'].includes(l)) return l; } catch (e) { /* private mode */ }
  return 'easy';
}

function draw() {
  const { out, n } = index();
  const term = n(q.value).replace(/^the (?=.)/, '');
  // With nothing typed, the list is the menu: every page, in the menu's order.
  if (!term) items = out.slice(0, 1 + PAGES.length);
  else {
    const scored = [];
    for (const i of out) {
      const at = i.nt.indexOf(term);
      if (at >= 0) scored.push([at === 0 ? 0 : i.nt.includes(` ${term}`) ? 1 : 2, at, i]);
      else if (i.nk.some((w) => w.startsWith(term))) scored.push([1, 0, i]);
      else if (i.ns.includes(term)) scored.push([3, 0, i]);
    }
    const lv = quizLevel();
    items = scored.sort((a, b) => a[0] - b[0] || a[2].pri - b[2].pri || a[1] - b[1] || a[2].t.length - b[2].t.length).slice(0, 40)
      .map((x) => (x[2].quiz ? { ...x[2], h: `#/quiz/${x[2].quiz}/${lv}` } : x[2]));
    // Names are one search and the script is another. This row hands whatever was typed to the second.
    const typed = q.value.trim();
    if (typed.length >= 2) items.push({ t: `Search every line for “${typed}”`, s: 'Dialogue', h: `#/dialogue/q/${encodeURIComponent(typed)}` });
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
  if (!sheet.hidden) closeSheet();
  opener = document.activeElement;
  pal.hidden = false;
  q.value = '';
  // The long hint is cut off mid-word in a phone's narrow box.
  q.placeholder = innerWidth < 520 ? 'Search the site' : 'Episode, character, page, or any word…';
  draw();
  lock();
  // preventScroll: the box is fixed to the screen, but focusing it still dragged the page half a screen up.
  q.focus({ preventScroll: true });
}
function closePal(restoreFocus = true) {
  if (pal.hidden) return;
  pal.hidden = true;
  unlock();
  // Without preventScroll the browser scrolls to where the sticky header's button "really" is, half a screen up.
  if (restoreFocus) opener?.focus?.({ preventScroll: true });
}
$('#open-search').addEventListener('click', openPal);
$('#palette-close').addEventListener('click', () => closePal());
pal.addEventListener('click', (e) => { if (e.target === pal) closePal(); });
// Picking the page already showing fires no hashchange, so close the palette here instead.
list.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (a && a.href === location.href) { e.preventDefault(); closePal(); }
});
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
    if (a && !nav.go(a.getAttribute('href'))) closePal();
  } else if (e.key === 'Tab') {
    e.preventDefault(); // two stops, this box and Close; the arrows move through the results
    $('#palette-close').focus();
  }
});
$('#palette-close').addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); q.focus(); } });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!pal.hidden) closePal(); else if (!sheet.hidden) { closeSheet(); menu.focus(); } }
  const typing = /input|textarea|select/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (!typing && (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey)))) { e.preventDefault(); openPal(); }
});

// ---------------------------------------------------------------- go

load().then(() => {
  addEventListener('hashchange', (ev) => render(ev));
  render();
}).catch((err) => {
  console.error(err);
  app.innerHTML = '<section class="wrap page-head"><h1>That didn\'t load.</h1><p class="lede">The data file didn\'t come through. Refresh and it usually does.</p></section>';
});
