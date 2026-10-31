import { $, $$, esc, slug, observe, tip } from './ui.js';
import * as P from './pages.js';
import * as People from './people.js';
import * as Talk from './talk.js';

const app = $('#app');
let D;

// ---------------------------------------------------------------- data

async function load() {
  const res = await fetch('data/office.json');
  D = await res.json();
  const rs = D.episodes.map((e) => e.r);
  D.meta = { avg: rs.reduce((a, b) => a + b, 0) / rs.length };
  D.char = Object.fromEntries(D.characters.map((c) => [c.key, c]));
  D.charSlug = Object.fromEntries(D.characters.map((c) => [slug(c.key), c]));
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

// Search file is 3.9 MB, so it only loads when a page asks for it.
let linesP;
export function lines() {
  linesP ??= fetch('data/lines.json').then((r) => r.json());
  return linesP;
}

// ---------------------------------------------------------------- router

const routes = [
  [/^\/?$/, () => P.home(D), 'home'],
  [/^\/seasons$/, () => P.seasons(D), 'season'],
  [/^\/season\/(\d)$/, (m) => P.season(D, +m[1]), 'season'],
  [/^\/episode\/(\d+)$/, (m) => P.episode(D, +m[1], lines), 'season'],
  [/^\/characters$/, () => People.characters(D), 'character'],
  [/^\/character\/([\w-]+)$/, (m) => People.character(D, m[1]), 'character'],
  [/^\/crew$/, () => People.crew(D), 'crew'],
  [/^\/person\/([\w-]+)$/, (m) => People.person(D, m[1]), 'crew'],
  [/^\/dialogue$/, () => Talk.dialogue(D, lines), 'dialogue'],
  [/^\/findings$/, () => Talk.findings(D), 'findings'],
  [/^\/about$/, () => Talk.about(D), 'about'],
];

function render() {
  const path = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  const [p, anchor] = path.split('@');
  let hit = null;
  for (const [re, fn, nav] of routes) {
    const m = p.match(re);
    if (m) { hit = { fn, m, nav }; break; }
  }
  const go = () => {
    tip.hide();
    let page;
    try {
      page = hit ? hit.fn(hit.m) : null;
    } catch (err) {
      console.error(err);
      page = null;
    }
    if (!page) page = { title: 'Not here', html: `<section class="wrap page-head"><p class="eyebrow">404</p><h1>Nobody here<br><em>but Creed.</em></h1><p class="lede">That page doesn't exist. Try the <a href="#/">front page</a>.</p></section>` };
    app.innerHTML = `<div class="page">${page.html}</div>`;
    document.title = page.title ? `${page.title} · The Office, by the numbers` : 'The Office, by the numbers · Katsuma Onishi';
    page.after?.(app);
    observe(app);
    $$('.nav a').forEach((a) => a.classList.toggle('on', hit?.nav === a.dataset.nav));
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: 'instant' });
  };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches && app.dataset.ready) { const vt = document.startViewTransition(go); vt.ready.catch(() => {}); vt.finished.catch(() => {}); }
  else go();
  app.dataset.ready = '1';
  closeSheet();
}

// ---------------------------------------------------------------- chrome: header, theme, sheet, progress

const top = $('.top');
const bar = $('.progress span');
addEventListener('scroll', () => {
  top.classList.toggle('scrolled', scrollY > 8);
  const h = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
}, { passive: true });

$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
});

const sheet = $('#sheet');
const menu = $('#menu');
function closeSheet() { sheet.hidden = true; menu.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
menu.addEventListener('click', () => {
  const open = sheet.hidden;
  sheet.hidden = !open;
  menu.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
});

// ---------------------------------------------------------------- jump-to palette

const pal = $('#palette');
const q = $('#palette-q');
const list = $('#palette-list');
let items = [];
let sel = 0;

function index() {
  const out = [
    { t: 'Home', s: 'Page', h: '#/' }, { t: 'Findings', s: 'Page', h: '#/findings' }, { t: 'Dialogue and search', s: 'Page', h: '#/dialogue' },
    { t: 'Directors and writers', s: 'Page', h: '#/crew' }, { t: 'How I made this', s: 'Page', h: '#/about' },
  ];
  D.seasons.forEach((s) => out.push({ t: `Season ${s.n}`, s: `${s.year} to ${s.endYear}`, h: `#/season/${s.n}` }));
  D.characters.forEach((c) => out.push({ t: c.name, s: 'Character', h: `#/character/${slug(c.key)}` }));
  D.episodes.forEach((e) => out.push({ t: e.t, s: `S${e.s} E${e.e}`, h: `#/episode/${e.id}` }));
  Object.values(D.people).forEach((p) => out.push({ t: p.name, s: Object.keys(p.roles).join(' and '), h: `#/person/${p.slug}` }));
  return out;
}

function draw() {
  const term = q.value.trim().toLowerCase();
  const all = index();
  items = term
    ? all.filter((i) => i.t.toLowerCase().includes(term) || i.s.toLowerCase().includes(term))
      .sort((a, b) => a.t.toLowerCase().indexOf(term) - b.t.toLowerCase().indexOf(term)).slice(0, 40)
    : all.slice(0, 14);
  sel = 0;
  list.innerHTML = items.length
    ? items.map((i, k) => `<li><a href="${i.h}" class="${k === 0 ? 'sel' : ''}" role="option">${esc(i.t)}<small>${esc(i.s)}</small></a></li>`).join('')
    : '<li class="empty">Nothing by that name. Not even in the annex.</li>';
}
function openPal() { pal.hidden = false; q.value = ''; draw(); q.focus(); document.body.style.overflow = 'hidden'; }
function closePal() { pal.hidden = true; document.body.style.overflow = ''; }
$('#open-search').addEventListener('click', openPal);
pal.addEventListener('click', (e) => { if (e.target === pal || e.target.closest('a')) closePal(); });
q.addEventListener('input', draw);
q.addEventListener('keydown', (e) => {
  const links = $$('a', list);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links.forEach((a, k) => a.classList.toggle('sel', k === sel));
    links[sel]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && links[sel]) {
    location.hash = links[sel].getAttribute('href');
    closePal();
  }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!pal.hidden) closePal(); if (!sheet.hidden) closeSheet(); }
  const typing = /input|textarea|select/i.test(document.activeElement?.tagName);
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
