// The parts of the page that say where you are and where you can go: the top nav, the phone menu, the
// "on this page" bar on long pages, the next-page links at the foot of each top-level page, and back to top.
// All of it is drawn from sitemap.js, and none of it knows what's on any page.

import { $, $$, esc, arrow } from './ui.js';
import { GROUPS, PAGES, OLD } from './sitemap.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- top nav and phone menu

export function drawNav() {
  $('.nav').innerHTML = GROUPS.map((g) => `<span class="nav-g">${g.pages.filter((p) => p.nav)
    .map((p) => `<a href="${p.h}" data-nav="${p.key}"${p.key === 'quiz' ? ' class="nav-play"' : ''}>${esc(p.nav)}</a>`).join('')}</span>`).join('');
  $('#sheet').innerHTML = `<nav aria-label="Main, mobile">
      <a class="sh-home" href="#/" data-nav="home">Home</a>
      ${GROUPS.map((g) => `<div class="sh-g"><p class="sh-h">${esc(g.name)}</p><div class="sh-links">${g.pages
    .map((p) => `<a href="${p.h}" data-nav="${p.key}">${esc(p.menu || p.name)}</a>`).join('')}</div></div>`).join('')}
    </nav>
    <a class="sheet-old" href="${OLD.h}">${esc(OLD.name)}</a>`;
}

// key is the router's section for the page showing; route is its path, so "Today's five" can light up in the
// menu while the top nav, which has no entry for it, lights up Play.
export function markCurrent(key, route) {
  const exact = PAGES.find((p) => p.h === `#${route}`)?.key;
  const set = (a, on) => {
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  };
  $$('.nav a').forEach((a) => set(a, a.dataset.nav === (key === 'daily' ? 'quiz' : key)));
  $$('#sheet [data-nav]').forEach((a) => set(a, a.dataset.nav === (exact || key)));
}

// ---------------------------------------------------------------- "on this page"

// A page marks the top of each of its sections with an id and data-sec="Short label". Three or more and the
// page gets a bar of jump links under the header. The links are real URLs (#/findings@twss), so a section can
// be shared, but a tap only scrolls: the page isn't drawn again and Back doesn't step through sections.
export function sectionBar(app, route, onLeave) {
  const page = $('.page', app);
  const ids = $$('[data-sec][id]', page).map((n) => n.id);
  if (ids.length < 3 || $('.subnav', page)) return;
  const el = (id) => document.getElementById(id);
  const bar = document.createElement('nav');
  bar.className = 'subnav secbar';
  bar.setAttribute('aria-label', 'On this page');
  bar.innerHTML = `<div class="wrap"><span class="label">On this page</span><div class="pills scroll">${ids
    .map((id) => `<a class="pill" href="#${route}@${id}">${esc(el(id).dataset.sec)}</a>`).join('')}</div></div>`;
  // Sticky only holds for as long as its parent is on screen, so the bar has to sit directly in the page.
  let head = $('.page-head', page);
  while (head && head.parentElement !== page) head = head.parentElement;
  if (head) head.after(bar); else page.prepend(bar);

  const sc = $('.pills', bar);
  const pills = $$('.pill', bar);
  const fade = () => sc.classList.toggle('at-end', sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 2);
  sc.addEventListener('scroll', fade, { passive: true });

  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  let cur = -2;
  const spy = () => {
    if (!bar.isConnected) return;
    // The section whose top has passed under the two bars; at the very bottom, the last one, however short.
    // The line sits just below where a jump lands (the page's scroll-padding), so the pill tapped is the pill lit.
    const line = Math.max(bar.getBoundingClientRect().bottom + 24, pad + 16);
    let now = -1;
    ids.forEach((id, i) => {
      const n = el(id);
      if (n && n.offsetParent !== null && n.getBoundingClientRect().top <= line) now = i;
    });
    if (now >= 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2) {
      for (let i = ids.length - 1; i > now; i--) if (el(ids[i])?.offsetParent != null) { now = i; break; }
    }
    if (now === cur) return;
    cur = now;
    pills.forEach((p, i) => {
      p.classList.toggle('on', i === now);
      if (i === now) p.setAttribute('aria-current', 'true'); else p.removeAttribute('aria-current');
    });
    const p = pills[now];
    if (p) sc.scrollTo({ left: p.offsetLeft - (sc.clientWidth - p.offsetWidth) / 2, behavior: reduce.matches ? 'auto' : 'smooth' });
    fade();
  };
  let tick = 0;
  const onScroll = () => { if (!tick) tick = requestAnimationFrame(() => { tick = 0; spy(); }); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onLeave(() => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); });
  requestAnimationFrame(() => { spy(); fade(); });

  bar.addEventListener('click', (e) => {
    const a = e.target.closest('a.pill');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const n = el(a.getAttribute('href').split('@')[1]);
    if (!n) return;
    e.preventDefault();
    n.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
    try { history.replaceState(history.state, '', a.getAttribute('href')); } catch (err) { /* Safari rations replaceState */ }
    // Keyboard and screen-reader users land in the section too, not back in the bar.
    if (!n.hasAttribute('tabindex')) n.setAttribute('tabindex', '-1');
    n.focus({ preventScroll: true });
  });
}

// Arriving at #/page@section: charts above the section are still being drawn and push it down the page, so one
// scroll at load lands short. Follow the section until the page stops growing or the reader starts scrolling.
export function arriveAt(target, page) {
  target.scrollIntoView();
  if (!('ResizeObserver' in window)) return;
  const ro = new ResizeObserver(() => { if (target.isConnected) target.scrollIntoView(); else stop(); });
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  const stop = () => { ro.disconnect(); clearTimeout(t); events.forEach((e) => removeEventListener(e, stop)); };
  const t = setTimeout(stop, 2500);
  events.forEach((e) => addEventListener(e, stop, { passive: true }));
  ro.observe(page);
}

// ---------------------------------------------------------------- next page

// Top-level pages end with the page before and the page after, in the nav's order, so the site can be read
// straight through from a phone without going back up to the menu.
export function tour(app, route) {
  const i = PAGES.findIndex((p) => p.h === `#${route}`);
  if (i < 0) return;
  const prev = PAGES[i - 1] || { h: '#/', name: 'Home' };
  const next = PAGES[i + 1];
  const link = (p, cls, label) => (p ? `<a class="${cls}" href="${p.h}"><small>${label}</small><span>${esc(p.name)}</span></a>` : '<span></span>');
  const nav = document.createElement('nav');
  nav.className = 'wrap tour';
  nav.setAttribute('aria-label', 'More pages');
  nav.innerHTML = `<div class="pager">${link(prev, 'prev', 'Previous')}${link(next, 'next', 'Next')}</div>`;
  $('.page', app).append(nav);
}

// ---------------------------------------------------------------- back to top

export function toTop(app) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'to-top';
  b.hidden = true;
  b.setAttribute('aria-label', 'Back to top');
  b.innerHTML = arrow;
  document.body.append(b);
  let tick = 0;
  const foot = $('.foot');
  const show = () => {
    tick = 0;
    b.hidden = scrollY < innerHeight * 1.5;
    // At the end of the page the button rides up with the footer instead of sitting on its links.
    const over = foot ? innerHeight - foot.getBoundingClientRect().top : 0;
    b.style.bottom = over > 0 ? `${Math.round(over + 12)}px` : '';
  };
  addEventListener('scroll', () => { if (!tick) tick = requestAnimationFrame(show); }, { passive: true });
  b.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
    app.focus({ preventScroll: true });
  });
}
