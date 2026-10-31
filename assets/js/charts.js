// Hand-rolled SVG charts. Each one draws for the container's current width and redraws when it changes.

import { esc, fmt, hover, color, epCode, tip } from './ui.js';

const lin = (d0, d1, r0, r1) => {
  const k = (r1 - r0) / (d1 - d0 || 1);
  return (v) => r0 + (v - d0) * k;
};
const ticks = (min, max, n = 5, int = false) => {
  const span = max - min;
  const step0 = int ? Math.max(1, span / n) : span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
};

export function mount(el, draw) {
  if (!el) return;
  el.classList.add('chart');
  let last = 0;
  const run = () => {
    const w = Math.round(el.clientWidth || el.parentElement?.clientWidth || 640);
    if (w === last) return;
    if (last) el.classList.add('drawn');
    last = w;
    draw(el, w);
  };
  run();
  new ResizeObserver(() => requestAnimationFrame(run)).observe(el);
}

export function epTip(e, extra = '') {
  return `<div class="tt">${esc(e.t)}</div>
    <div class="tm">${epCode(e)} · ${fmt.date(e.date)}</div>
    <div class="tr" style="margin-top:6px"><span>IMDb</span><b>${e.r.toFixed(1)}</b></div>
    <div class="tr"><span>US viewers</span><b>${fmt.m(e.v)}</b></div>${extra}`;
}

const bind = (el, sel, data, html, href) => {
  el.querySelectorAll(sel).forEach((n) => {
    const d = data[+n.dataset.i];
    hover(n, () => html(d), href ? href(d) : null);
    n.addEventListener('pointerenter', () => { el.classList.add('dim'); n.classList.add('hl'); });
    n.addEventListener('pointerleave', () => { el.classList.remove('dim'); n.classList.remove('hl'); });
  });
};

const svg = (w, h, body, label) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;

// ---------------------------------------------------------------- skyline: every episode as a bar

export function skyline(el, D) {
  mount(el, (el, W) => {
    const eps = D.episodes;
    const H = Math.max(170, Math.min(300, W * 0.26));
    const top = 6, bottom = 22, left = 24;
    const y = lin(6, 10, H - bottom, top);
    const bw = (W - left) / eps.length;
    const gap = bw > 4 ? 1 : 0.5;
    let body = '';
    for (const g of [7, 8, 9, 10]) body += `<line class="gridline" x1="${left}" x2="${W}" y1="${y(g)}" y2="${y(g)}"/><text x="${left - 6}" y="${y(g) + 4}" text-anchor="end">${g}</text>`;
    eps.forEach((e, i) => {
      const x = left + i * bw;
      const fill = e.michael && e.id <= D.findings.goodbye ? 'var(--accent)' : 'var(--ink-3)';
      body += `<rect class="bar" data-i="${i}" x="${(x + gap / 2).toFixed(2)}" y="${y(e.r).toFixed(1)}" width="${Math.max(0.6, bw - gap).toFixed(2)}" height="${(H - bottom - y(e.r)).toFixed(1)}" rx="${bw > 5 ? 1.5 : 0}" style="fill:${fill};animation-delay:${(i * 0.006).toFixed(3)}s"/>`;
    });
    D.seasons.forEach((s) => {
      const x0 = left + s.first * bw;
      const x1 = left + (s.last + 1) * bw;
      if (s.n > 1) body += `<line class="sep" x1="${x0}" x2="${x0}" y1="${H - bottom}" y2="${H - bottom + 8}"/>`;
      body += `<text class="slab" x="${(x0 + x1) / 2}" y="${H - 5}" text-anchor="middle">${W < 520 ? s.n : 'S' + s.n}</text>`;
    });
    body += `<line x1="${left}" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" stroke="var(--line-2)"/>`;
    el.innerHTML = svg(W, H, body, 'IMDb rating of every episode, in air order');
    el.querySelector('svg').classList.add('skyline');
    el.querySelectorAll('.bar').forEach((n) => {
      const e = eps[+n.dataset.i];
      hover(n, () => epTip(e, `<div class="tm" style="margin-top:6px">Tap again to open</div>`), `#/episode/${e.id}`);
    });
  });
}

// ---------------------------------------------------------------- sparkline for season cards

export function spark(eps, W = 180, H = 46) {
  const y = lin(6.4, 10, H - 2, 2);
  const x = lin(0, eps.length - 1, 2, W - 2);
  const d = eps.map((e, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(e.r).toFixed(1)}`).join('');
  const best = eps.reduce((a, b) => (b.r > a.r ? b : a));
  const bi = eps.indexOf(best);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}L${W - 2},${H}L2,${H}Z" style="fill:var(--accent-soft)"/>
    <path d="${d}" fill="none" style="stroke:var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <circle cx="${x(bi)}" cy="${y(best.r)}" r="3" style="fill:var(--accent)" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

// ---------------------------------------------------------------- lollipops: one season's episodes

export function lollipops(el, eps, { avg, showAvg = true, yMin = 6, label = 'Episode ratings' } = {}) {
  mount(el, (el, W) => {
    const H = 280, m = { t: 24, r: 10, b: 30, l: 30 };
    const lo = Math.min(yMin, Math.floor(Math.min(...eps.map((e) => e.r)) - 0.2));
    const y = lin(lo, 10, H - m.b, m.t);
    const step = (W - m.l - m.r) / eps.length;
    const x = (i) => m.l + step * (i + 0.5);
    let body = '';
    for (const t of ticks(lo, 10, 4)) body += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(t % 1 ? 1 : 0)}</text>`;
    const best = eps.reduce((a, b) => (b.r > a.r ? b : a));
    eps.forEach((e, i) => {
      const cx = x(i);
      const isBest = e === best;
      body += `<g class="mark" data-i="${i}">
        <line class="grow-y" x1="${cx}" x2="${cx}" y1="${y(lo)}" y2="${y(e.r)}" style="stroke:${isBest ? 'var(--accent)' : 'var(--line-2)'};--d:${i * 0.03}s" stroke-width="2" stroke-linecap="round"/>
        <circle class="pop" cx="${cx}" cy="${y(e.r)}" r="${step > 22 ? 6 : 4.5}" style="fill:${isBest ? 'var(--accent)' : 'var(--surface)'};stroke:var(--accent);--d:${0.3 + i * 0.03}s" stroke-width="2"/>
        <rect class="hit" x="${cx - step / 2}" y="${m.t - 10}" width="${step}" height="${H - m.t - m.b + 10}"/>
      </g>`;
      if (step > 18 || i % Math.ceil(18 / step) === 0) body += `<text x="${cx}" y="${H - 10}" text-anchor="middle">${e.e}</text>`;
    });
    const bi = eps.indexOf(best);
    const anchor = bi < eps.length / 2 ? 'start' : 'end';
    body += `<text class="lbl-strong" x="${x(bi) + (anchor === 'start' ? 10 : -10)}" y="${y(best.r) - 8}" text-anchor="${anchor}">${esc(best.t)} · ${best.r.toFixed(1)}</text>`;
    if (showAvg && avg) {
      body += `<line class="avgline draw" x1="${m.l}" x2="${W - m.r}" y1="${y(avg)}" y2="${y(avg)}" style="--len:${W};--d:.6s" stroke-dasharray="${W}"/>
      <text x="${m.l + 6}" y="${y(avg) + 15}" class="lbl">Average ${avg.toFixed(2)}</text>`;
    }
    el.innerHTML = svg(W, H, body, label);
    bind(el, '.mark', eps, (e) => epTip(e, `<div class="tr"><span>Lines</span><b>${fmt.int(e.lines)}</b></div><div class="tr"><span>Directed by</span><b>${esc(e.dir.join(', '))}</b></div>`), (e) => `#/episode/${e.id}`);
  });
}

// ---------------------------------------------------------------- line over every episode with an event marker

export function timeline(el, D, { value = (e) => e.r, fmtv = (v) => v.toFixed(1), yDomain = [6, 10], marker, eras = true, window = 9, label = 'Rating over time', height = 320, highlight } = {}) {
  const eps = D.episodes;
  mount(el, (el, W) => {
    const H = height, m = { t: 30, r: 12, b: 30, l: 36 };
    const x = lin(0, eps.length - 1, m.l, W - m.r);
    const y = lin(yDomain[0], yDomain[1], H - m.b, m.t);
    let body = '';
    for (const t of ticks(yDomain[0], yDomain[1], 4)) body += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmtv(t)}</text>`;
    D.seasons.forEach((s) => {
      const cx = (x(s.first) + x(s.last)) / 2;
      body += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${W < 520 ? s.n : 'S' + s.n}</text>`;
      if (s.n > 1) body += `<line x1="${x(s.first - 0.5)}" x2="${x(s.first - 0.5)}" y1="${H - m.b}" y2="${H - m.b + 6}" stroke="var(--line-2)"/>`;
    });
    if (marker != null) {
      const mx = x(marker + 0.5);
      body += `<line x1="${mx}" x2="${mx}" y1="${m.t - 14}" y2="${H - m.b}" stroke="var(--ink)" stroke-width="1"/>
        <text class="lbl-strong" x="${mx + (mx > W * 0.7 ? -8 : 8)}" y="${m.t - 4}" text-anchor="${mx > W * 0.7 ? 'end' : 'start'}">Michael leaves</text>`;
    }
    // dots, faint
    eps.forEach((e, i) => {
      const v = value(e);
      if (v == null) return;
      const pre = marker == null || i <= marker;
      const hl = highlight ? highlight(e) : false;
      body += `<circle class="mark pop" data-i="${i}" cx="${x(i).toFixed(1)}" cy="${y(Math.min(yDomain[1], v)).toFixed(1)}" r="${hl ? 4.5 : 3}" style="fill:${hl ? 'var(--c-dwight)' : pre ? 'var(--accent)' : 'var(--ink-3)'};opacity:${hl ? 1 : 0.55};--d:${(i * 0.004).toFixed(3)}s"/>`;
    });
    // rolling mean
    const half = Math.floor(window / 2);
    const roll = eps.map((_, i) => {
      const a = Math.max(0, i - half), b = Math.min(eps.length, i + half + 1);
      const vals = eps.slice(a, b).map(value).filter((v) => v != null);
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    });
    const d = roll.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    body += `<path class="draw" d="${d}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" style="--len:${W * 2}" stroke-dasharray="${W * 2}"/>`;
    if (eras && marker != null) {
      const avg = (arr) => arr.reduce((s, e) => s + value(e), 0) / arr.length;
      const a = avg(eps.slice(0, marker + 1)), b = avg(eps.slice(marker + 1));
      body += `<line x1="${x(0)}" x2="${x(marker)}" y1="${y(a)}" y2="${y(a)}" stroke="var(--accent)" stroke-width="2"/>
        <text class="lbl-strong" x="${x(2)}" y="${y(a) - 8}">${fmtv(a)} avg</text>
        <line x1="${x(marker + 1)}" x2="${x(eps.length - 1)}" y1="${y(b)}" y2="${y(b)}" stroke="var(--ink-3)" stroke-width="2"/>
        <text class="lbl-strong" x="${x(eps.length - 1)}" y="${y(b) + 18}" text-anchor="end">${fmtv(b)} avg</text>`;
    }
    body += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" style="opacity:0"/>`;
    body += `<rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/>`;
    el.innerHTML = svg(W, H, body, label);
    // crosshair: nearest episode by x
    const hit = el.querySelector('.hit');
    const cross = el.querySelector('.cross');
    const dots = el.querySelectorAll('circle.mark');
    let cur = -1;
    const pick = (ev) => {
      const r = el.querySelector('svg').getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(eps.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (eps.length - 1))));
      if (i !== cur) {
        dots[cur]?.setAttribute('r', '3');
        cur = i;
        dots[i]?.setAttribute('r', '6');
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.opacity = 1;
      }
      const e = eps[i];
      return e;
    };
    const show = (ev) => {
      const e = pick(ev);
      tip.show(epTip(e, value(e) !== e.r ? `<div class="tr"><span>${esc(label)}</span><b>${fmtv(value(e))}</b></div>` : ''), ev, hit);
    };
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', () => { cross.style.opacity = 0; dots[cur]?.setAttribute('r', '3'); cur = -1; tip.hide(); });
    hit.addEventListener('click', (ev) => { if (ev.pointerType === 'mouse' && cur >= 0) location.hash = `#/episode/${eps[cur].id}`; });
  });
}

// ---------------------------------------------------------------- columns: grouped bars over 9 seasons

export function columns(el, { cats, series, fmtv = fmt.int, height = 240, label = 'By season', href }) {
  mount(el, (el, W) => {
    const H = height, m = { t: 18, r: 6, b: 28, l: 38 };
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const y = lin(0, max * 1.08, H - m.b, m.t);
    const band = (W - m.l - m.r) / cats.length;
    const inner = Math.min(band * 0.72, 26 * series.length + 4);
    const bw = (inner - (series.length - 1) * 2) / series.length;
    let body = '';
    const ints = series.every((s) => s.values.every(Number.isInteger));
    for (const t of ticks(0, max * 1.08, 4, ints).filter((t) => !ints || Number.isInteger(t))) body += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmtv(t)}</text>`;
    const items = [];
    cats.forEach((c, ci) => {
      const x0 = m.l + band * ci + (band - inner) / 2;
      series.forEach((s, si) => {
        const v = s.values[ci];
        const h = H - m.b - y(v);
        const idx = items.push({ c, ci, s, v }) - 1;
        if (v > 0) body += `<path class="mark grow-y" data-i="${idx}" d="M${x0 + si * (bw + 2)},${H - m.b}v${-Math.max(0, h - 4)}q0,-4 4,-4h${bw - 8}q4,0 4,4v${Math.max(0, h - 4)}z" style="fill:${s.color};--d:${(ci * 0.05 + si * 0.08).toFixed(2)}s"/>`;
        body += `<rect class="hit mark" data-i="${idx}" x="${x0 + si * (bw + 2)}" y="${m.t}" width="${bw}" height="${H - m.t - m.b}"/>`;
      });
      body += `<text x="${m.l + band * (ci + 0.5)}" y="${H - 9}" text-anchor="middle">${esc(c)}</text>`;
    });
    body += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="var(--line-2)"/>`;
    el.innerHTML = svg(W, H, body, label);
    el.querySelectorAll('rect.hit').forEach((n) => {
      const it = items[+n.dataset.i];
      hover(n, () => `<div class="tt">${esc(it.s.name)}</div><div class="tr"><span>${esc(it.c)}</span><b>${fmtv(it.v)}</b></div>`, href ? href(it) : null);
    });
  });
}

// ---------------------------------------------------------------- scatter with a fitted line

export function scatter(el, { pts, xLabel, yLabel, xFmt = (v) => v, yDomain, fit = true, label = 'Scatter', tipFn }) {
  mount(el, (el, W) => {
    const H = Math.min(360, Math.max(260, W * 0.6)), m = { t: 16, r: 14, b: 42, l: 40 };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const xMax = Math.max(...xs) * 1.05;
    const [y0, y1] = yDomain || [Math.floor(Math.min(...ys)), 10];
    const x = lin(0, xMax, m.l, W - m.r);
    const y = lin(y0, y1, H - m.b, m.t);
    let body = '';
    for (const t of ticks(y0, y1, 4)) body += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
    for (const t of ticks(0, xMax, 5)) body += `<text x="${x(t)}" y="${H - m.b + 18}" text-anchor="middle">${xFmt(t)}</text>`;
    body += `<text x="${W - m.r}" y="${H - 4}" text-anchor="end" class="lbl">${esc(xLabel)}</text>`;
    body += `<text x="${m.l}" y="${m.t - 4}" class="lbl">${esc(yLabel)}</text>`;
    body += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="var(--line-2)"/>`;
    pts.forEach((p, i) => {
      body += `<circle class="mark pop" data-i="${i}" cx="${x(p.x).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="5" style="fill:${p.color || 'var(--accent)'};stroke:var(--surface);opacity:.85;--d:${(0.2 + i * 0.004).toFixed(3)}s" stroke-width="2"/>`;
    });
    if (fit) {
      const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
      const b = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / xs.reduce((s, v) => s + (v - mx) ** 2, 0);
      const a = my - b * mx;
      const xa = Math.min(...xs), xb = Math.max(...xs);
      const len = W;
      body += `<line class="draw" x1="${x(xa)}" y1="${y(a + b * xa)}" x2="${x(xb)}" y2="${y(a + b * xb)}" stroke="var(--ink)" stroke-width="2" style="--len:${len};--d:.8s" stroke-dasharray="${len}"/>`;
    }
    el.innerHTML = svg(W, H, body, label);
    bind(el, 'circle.mark', pts, tipFn || ((p) => epTip(p.ep)), (p) => (p.ep ? `#/episode/${p.ep.id}` : null));
  });
}

// ---------------------------------------------------------------- strip: dots per group with the mean

export function strip(el, { groups, domain = [6, 10], label = 'Comparison' }) {
  mount(el, (el, W) => {
    const rowH = 92, m = { t: 10, r: 16, b: 30, l: 16 };
    const H = m.t + m.b + rowH * groups.length;
    const x = lin(domain[0], domain[1], m.l, W - m.r);
    let body = '';
    for (const t of ticks(domain[0], domain[1], 4)) body += `<line class="gridline" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}"/><text x="${x(t)}" y="${H - 10}" text-anchor="middle">${t.toFixed(1)}</text>`;
    const items = [];
    let rnd = 7;
    const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    groups.forEach((g, gi) => {
      const cy = m.t + rowH * gi + rowH / 2 + 8;
      const mean = g.values.reduce((s, v) => s + v.r, 0) / g.values.length;
      body += `<text class="lbl-strong" x="${m.l}" y="${m.t + rowH * gi + 16}">${esc(g.name)} <tspan class="lbl" style="font-weight:400">· ${g.values.length} episodes · mean ${mean.toFixed(2)}</tspan></text>`;
      g.values.forEach((e, i) => {
        const idx = items.push(e) - 1;
        const jy = cy + (rand() - 0.5) * 34;
        body += `<circle class="mark pop" data-i="${idx}" cx="${x(e.r).toFixed(1)}" cy="${jy.toFixed(1)}" r="4.5" style="fill:${g.color};stroke:var(--surface);opacity:.8;--d:${(gi * 0.2 + i * 0.006).toFixed(3)}s" stroke-width="1.5"/>`;
      });
      body += `<line x1="${x(mean)}" x2="${x(mean)}" y1="${cy - 26}" y2="${cy + 26}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>`;
    });
    el.innerHTML = svg(W, H, body, label);
    bind(el, 'circle.mark', items, (e) => epTip(e), (e) => `#/episode/${e.id}`);
  });
}

// ---------------------------------------------------------------- who speaks after whom

export function matrix(el, D, names) {
  const { keys, m } = D.matrix;
  mount(el, (el, Wc) => {
    const W = Math.max(560, Wc);
    const lab = 78, top = 64;
    const cell = (W - lab - 4) / keys.length;
    const H = top + cell * keys.length + 4;
    // share of each speaker's "next lines" going to each other person, so Michael's volume doesn't drown the rest
    const rows = m.map((r) => { const s = r.reduce((a, b) => a + b, 0); return r.map((v) => v / s); });
    const max = Math.max(...rows.flat());
    const steps = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)', 'var(--seq-7)'];
    let body = '';
    const items = [];
    keys.forEach((k, j) => body += `<text transform="translate(${lab + cell * (j + 0.5) - 3},${top - 8}) rotate(-40)" class="lbl">${esc(k)}</text>`);
    keys.forEach((a, i) => {
      body += `<text x="${lab - 10}" y="${top + cell * (i + 0.5) + 4}" text-anchor="end" class="lbl">${esc(a)}</text>`;
      keys.forEach((b, j) => {
        const v = rows[i][j];
        const idx = items.push({ a, b, v, n: m[i][j] }) - 1;
        const step = a === b ? 'var(--bg-2)' : steps[Math.min(6, Math.floor((v / max) * 6.999))];
        body += `<rect class="cell pop" data-i="${idx}" x="${lab + cell * j}" y="${top + cell * i}" width="${cell}" height="${cell}" rx="4" style="fill:${step};--d:${((i + j) * 0.02).toFixed(2)}s"/>`;
        if (a !== b && v / max > 0.55) body += `<text x="${lab + cell * (j + 0.5)}" y="${top + cell * (i + 0.5) + 4}" text-anchor="middle" style="fill:var(--surface);font-weight:600;pointer-events:none">${Math.round(v * 100)}</text>`;
      });
    });
    el.innerHTML = svg(W, H, body, 'Who speaks right after whom');
    el.querySelectorAll('.cell').forEach((n) => {
      const it = items[+n.dataset.i];
      if (it.a === it.b) return;
      hover(n, () => `<div class="tt">${esc(it.a)} → ${esc(it.b)}</div><div class="tm">When ${esc(it.a)} finishes a line, ${esc(it.b)} speaks next ${fmt.pct(it.v * 100)} of the time.</div><div class="tr" style="margin-top:6px"><span>Times</span><b>${fmt.int(it.n)}</b></div>`);
    });
  });
}

// ---------------------------------------------------------------- the barcode: when each person talks in an episode

export function barcode(el, ep, D) {
  const codes = Object.fromEntries(Object.entries(D.codes).map(([k, c]) => [c, k]));
  const seq = ep.seq;
  const rows = ep.top.slice(0, 6).map((t) => t.k);
  mount(el, (el, Wc) => {
    const W = Math.max(200, Wc - 92 - 50);
    const H = 22;
    const n = seq.length;
    const bw = W / n;
    el.innerHTML = `<div class="barcode">${rows.map((k, ri) => {
      const code = D.codes[k];
      let r = '';
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (seq[i] !== code) continue;
        count++;
        r += `<rect x="${(i * bw).toFixed(2)}" y="2" width="${Math.max(1.2, bw).toFixed(2)}" height="${H - 4}" rx="0.6"/>`;
      }
      return `<div class="barcode-row rv" style="--d:${ri * 0.06}s"><span class="bn"><i class="dot" style="background:${color(k)}"></i>${esc(k)}</span>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(k)} speaks ${count} lines" style="fill:${color(k)}">${r}</svg>
        <span class="bv">${count}</span></div>`;
    }).join('')}</div>
    <div class="barcode-axis"><span>Cold open</span><span>Halfway</span><span>Credits</span></div>`;
    el.querySelectorAll('.rv').forEach((n) => requestAnimationFrame(() => n.classList.add('in')));
    void codes;
  });
}

// ---------------------------------------------------------------- tiny strip of who talks, for list rows

export function seqThumb(ep, D) {
  const W = 150, H = 18;
  const n = ep.seq.length;
  const bw = W / n;
  const inv = Object.fromEntries(Object.entries(D.codes).map(([k, c]) => [c, k]));
  let r = '';
  for (let i = 0; i < n; i++) {
    const k = inv[ep.seq[i]];
    if (!k) continue;
    r += `<rect x="${(i * bw).toFixed(2)}" width="${(bw + 0.3).toFixed(2)}" height="${H}" style="fill:${color(k)}"/>`;
  }
  return `<svg class="ep-seq" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><rect width="${W}" height="${H}" style="fill:var(--bg-2)"/>${r}</svg>`;
}

// ---------------------------------------------------------------- one dot row for the crew page

// HTML dots positioned by percentage, so they stay round at any width without a redraw.
export function dotRow(ids, D, domain = [6.4, 10]) {
  const x = (v) => ((v - domain[0]) / (domain[1] - domain[0])) * 100;
  const rs = ids.map((i) => D.episodes[i].r);
  const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
  return `<div class="track"><b class="track-show" style="left:${x(D.meta.avg)}%"></b>${ids.map((id, i) =>
    `<i class="dp" data-id="${id}" style="left:${x(D.episodes[id].r)}%;--d:${(i * 0.02).toFixed(2)}s"></i>`).join('')}<b class="track-avg" style="left:${x(avg)}%"></b></div>`;
}
