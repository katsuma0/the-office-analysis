// Small helpers shared by every page.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmt = {
  int: (n) => Math.round(n).toLocaleString('en-CA'),
  dec: (n, d = 1) => Number(n).toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d }),
  pct: (n, d = 1) => `${Number(n).toFixed(d)}%`,
  m: (n) => `${Number(n).toFixed(1)}M`,
  date: (s) => new Date(s + 'T12:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }),
  p: (p) => (p < 0.001 ? '< 0.001' : p.toFixed(p < 0.01 ? 3 : 2)),
  signed: (n, d = 2) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d),
  // A real minus sign for negative numbers that aren't deltas (correlations).
  num: (n, d = 2) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(d),
  ordinal: (n) => { const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); },
  times: (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${Math.round(n).toLocaleString('en-CA')} times`),
  plural: (n, one, many = one + 's') => `${Math.round(n).toLocaleString('en-CA')} ${n === 1 ? one : many}`,
};

export const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The first eight characters by lines get a fixed palette slot. Everyone else is grey.
const SLOTS = ['Michael', 'Dwight', 'Jim', 'Pam', 'Andy', 'Angela', 'Kevin', 'Erin'];
export const color = (key) => (SLOTS.includes(key) ? `var(--c-${key.toLowerCase()})` : 'var(--other)');
export const hasSlot = (key) => SLOTS.includes(key);
export const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');

// Streaming numbering (hour-longs count as two), which is how fans know the episodes.
export const epCode = (e) => `S${e.s} · E${e.se}`;

// ---------------------------------------------------------------- tooltip

const tipEl = () => document.querySelector('.tip');
let tipOwner = null;
let onHide = null;

export const tip = {
  // onHideFn lets a chart clear its own hover state (crosshair, enlarged dot) however the tip gets dismissed.
  show(html, ev, owner = null, onHideFn = null) {
    const t = tipEl();
    if (tipOwner && tipOwner !== owner && onHide) { const f = onHide; onHide = null; f(); }
    t.innerHTML = html;
    t.classList.add('on');
    tipOwner = owner;
    onHide = onHideFn;
    this.move(ev);
  },
  move(ev) {
    const t = tipEl();
    if (!ev) return;
    const pad = 14;
    const { innerWidth: W, innerHeight: H } = window;
    const r = t.getBoundingClientRect();
    let x = ev.clientX + pad;
    let y = ev.clientY + pad;
    if (x + r.width > W - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > H - 8) y = ev.clientY - r.height - pad;
    t.style.transform = 'none';
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${Math.max(8, y)}px`;
  },
  hide() {
    tipEl().classList.remove('on');
    tipOwner = null;
    if (onHide) { const f = onHide; onHide = null; f(); }
  },
  owner: () => tipOwner,
};

// Hover shows a tooltip, click follows a link. On touch, the first tap shows the tooltip and the second tap follows.
const tapHint = (href) => (href ? '<div class="tm" style="margin-top:6px">Tap again to open</div>' : '');
export function hover(node, html, href) {
  node.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') tip.show(html(), ev, node); });
  node.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') tip.move(ev); });
  node.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') tip.hide(); });
  node.addEventListener('click', (ev) => {
    const touch = ev.pointerType === 'touch' || ev.pointerType === 'pen' || (!ev.pointerType && matchMedia('(hover: none)').matches);
    if (touch && tip.owner() !== node) {
      ev.preventDefault();
      tip.show(html() + tapHint(href), ev, node);
      return;
    }
    tip.hide();
    if (href) location.hash = href;
  });
}

document.addEventListener('scroll', () => tip.hide(), { passive: true });
document.addEventListener('pointerdown', (ev) => {
  if (tip.owner() && !tip.owner().contains(ev.target)) tip.hide();
});

// ---------------------------------------------------------------- reveal + count up

let io;
export function observe(root = document) {
  io ??= new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const t = en.target;
      t.classList.add('in', 'go');
      if (t.dataset.count) countUp(t);
      io.unobserve(t);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('.rv, .chart, .hbars, [data-count], .badge', root).forEach((n) => io.observe(n));
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export function countUp(node) {
  const to = parseFloat(node.dataset.count);
  const dec = parseInt(node.dataset.dec || '0', 10);
  const suffix = node.dataset.suffix || '';
  const out = (v) => (node.textContent = (dec ? fmt.dec(v, dec) : fmt.int(v)) + suffix);
  if (reduce.matches) return out(to);
  const t0 = performance.now();
  const dur = 1400;
  const step = (t) => {
    // The first frame's timestamp can be a hair before t0, which would count down to "-0".
    const k = Math.min(1, Math.max(0, (t - t0) / dur));
    out(to * (1 - Math.pow(1 - k, 4)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const count = (n, dec = 0, suffix = '') => `<span data-count="${n}" data-dec="${dec}" data-suffix="${suffix}">${dec ? fmt.dec(0, dec) : '0'}${suffix}</span>`;

// ---------------------------------------------------------------- html bar list

export function hbars(rows, { max, fmtv = (v) => fmt.int(v), href } = {}) {
  const m = max ?? Math.max(...rows.map((r) => r.v));
  return `<div class="hbars">${rows.map((r, i) => {
    // Only link rows that have somewhere to go (speakers outside the cast don't have a page).
    const u = href?.(r);
    const tag = u ? 'a' : 'div';
    const h = u ? ` href="${u}"` : '';
    return `<${tag} class="hbar"${h} title="${esc(r.label)}">
      <span class="hn">${r.dot ? `<i class="dot" style="background:${r.dot}"></i>` : ''}<span class="hl">${esc(r.label)}</span></span>
      <span class="ht"><span style="width:${(r.v / m) * 100}%;background:${r.color || 'var(--accent)'};--d:${i * 0.04}s"></span></span>
      <span class="hv">${fmtv(r.v, r)}</span>
    </${tag}>`;
  }).join('')}</div>`;
}

export function table(cols, rows) {
  return `<div class="table-wrap"><table class="data"><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.r ? 'r' : ''}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export const tableView = (cols, rows, label = 'Show the numbers') => `<details class="tv"><summary>${label}</summary>${table(cols, rows)}</details>`;

export function words(list, max = 14) {
  const top = list.slice(0, max);
  const zmax = Math.max(...top.map((w) => w.z));
  return `<div class="words">${top.map((w, i) => {
    const size = 15 + (w.z / zmax) * 15;
    return `<span class="word" style="font-size:${size.toFixed(1)}px;--d:${i * 0.04}s" title="Said ${w.n} times">${esc(w.w)}<small>${w.n}</small></span>`;
  }).join('')}</div>`;
}

export const arrow = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4"/></svg>';
