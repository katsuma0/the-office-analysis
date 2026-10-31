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
  const ro = new ResizeObserver(() => requestAnimationFrame(() => {
    // The chart's page was replaced; stop watching it.
    if (!el.isConnected) { ro.disconnect(); return; }
    run();
  }));
  ro.observe(el);
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
      hover(n, () => epTip(e), `#/episode/${e.id}`);
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

export function lollipops(el, eps, { avg, showAvg = true, yMin = 6, label = 'Episode ratings', xLabel = (e) => e.se.split('-')[0] } = {}) {
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
      if (step > 18 || i % Math.ceil(18 / step) === 0) body += `<text x="${cx}" y="${H - 10}" text-anchor="middle">${xLabel(e)}</text>`;
    });
    const bi = eps.indexOf(best);
    const anchor = bi < eps.length / 2 ? 'start' : 'end';
    body += `<text class="lbl-strong" x="${x(bi) + (anchor === 'start' ? 10 : -10)}" y="${y(best.r) - 8}" text-anchor="${anchor}">${esc(best.t)} · ${best.r.toFixed(1)}</text>`;
    if (showAvg && avg) {
      body += `<line class="avgline draw" x1="${m.l}" x2="${W - m.r}" y1="${y(avg)}" y2="${y(avg)}" pathLength="1" style="--d:.6s"/>
      <text x="${W - m.r}" y="${y(avg) + 16}" text-anchor="end" class="lbl-strong">Average ${avg.toFixed(2)}</text>`;
    }
    el.innerHTML = svg(W, H, body, label);
    bind(el, '.mark', eps, (e) => epTip(e, `<div class="tr"><span>Lines</span><b>${fmt.int(e.lines)}</b></div><div class="tr"><span>Directed by</span><b>${esc(e.dir.join(', '))}</b></div>`), (e) => `#/episode/${e.id}`);
  });
}

// ---------------------------------------------------------------- line over every episode with an event marker

export function timeline(el, D, { value = (e) => e.r, fmtv = (v) => v.toFixed(1), yDomain = [6, 10], marker, eras = true, window = 9, label = 'Rating over time', height = 320, exclude = [] } = {}) {
  const eps = D.episodes;
  mount(el, (el, W) => {
    const H = height, m = { t: 30, r: 12, b: 30, l: 40 };
    const x = lin(0, eps.length - 1, m.l, W - m.r);
    const y = lin(yDomain[0], yDomain[1], H - m.b, m.t);
    const clamp = (v) => Math.max(yDomain[0], Math.min(yDomain[1], v));
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
    eps.forEach((e, i) => {
      const v = value(e);
      if (v == null) return;
      const pre = marker == null || i <= marker;
      body += `<circle class="mark pop" data-i="${i}" cx="${x(i).toFixed(1)}" cy="${y(clamp(v)).toFixed(1)}" r="3" style="fill:${pre ? 'var(--accent)' : 'var(--ink-3)'};opacity:.55;--d:${(i * 0.004).toFixed(3)}s"/>`;
    });
    // Moving average, computed separately on each side of the marker so it doesn't smooth away the step it's showing.
    const half = Math.floor(window / 2);
    const segments = marker != null ? [[0, marker], [marker + 1, eps.length - 1]] : [[0, eps.length - 1]];
    for (const [a0, b0] of segments) {
      const pts = [];
      for (let i = a0; i <= b0; i++) {
        const vals = eps.slice(Math.max(a0, i - half), Math.min(b0, i + half) + 1).filter((e) => !exclude.includes(e.id)).map(value).filter((v) => v != null);
        if (vals.length) pts.push([x(i), y(clamp(vals.reduce((s, v) => s + v, 0) / vals.length))]);
      }
      body += `<path class="draw" d="${pts.map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" pathLength="1"/>`;
    }
    if (eras && marker != null) {
      const avg = (arr) => { const v = arr.filter((e) => !exclude.includes(e.id)).map(value); return v.reduce((s, x2) => s + x2, 0) / v.length; };
      const a = avg(eps.slice(0, marker + 1)), b = avg(eps.slice(marker + 1));
      body += `<line x1="${x(0)}" x2="${x(marker)}" y1="${y(a)}" y2="${y(a)}" stroke="var(--accent)" stroke-width="2"/>
        <text class="lbl-strong" x="${x(2)}" y="${y(a) - 8}">${fmtv(a)} avg</text>
        <line x1="${x(marker + 1)}" x2="${x(eps.length - 1)}" y1="${y(b)}" y2="${y(b)}" stroke="var(--ink-3)" stroke-width="2"/>
        <text class="lbl-strong" x="${x(eps.length - 1)}" y="${y(b) + 18}" text-anchor="end">${fmtv(b)} avg</text>`;
    }
    body += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" style="opacity:0"/>`;
    body += `<rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" style="touch-action:pan-y"/>`;
    el.innerHTML = svg(W, H, body, label);
    // Crosshair on the nearest episode. Mouse: hover shows, click opens. Touch: tap shows, tap the same episode again to open.
    const hit = el.querySelector('.hit');
    const cross = el.querySelector('.cross');
    const dots = el.querySelectorAll('circle.mark');
    let cur = -1;
    let armed = -1;
    const reset = () => { cross.style.opacity = 0; dots[cur]?.setAttribute('r', '3'); cur = -1; };
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
      return eps[i];
    };
    const show = (ev, hint = false) => {
      const e = pick(ev);
      const extra = (value(e) !== e.r ? `<div class="tr"><span>${esc(label)}</span><b>${fmtv(value(e))}</b></div>` : '')
        + (hint ? '<div class="tm" style="margin-top:6px">Tap again to open</div>' : '');
      tip.show(epTip(e, extra), ev, hit, () => { reset(); armed = -1; });
    };
    hit.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') show(ev); });
    hit.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') tip.hide(); });
    hit.addEventListener('click', (ev) => {
      if (ev.pointerType === 'mouse' || !ev.pointerType && !matchMedia('(hover: none)').matches) {
        if (cur >= 0) location.hash = `#/episode/${eps[cur].id}`;
        return;
      }
      const before = cur;
      show(ev, true);
      if (armed === cur && before === cur) { tip.hide(); location.hash = `#/episode/${eps[before].id}`; return; }
      armed = cur;
    });
  });
}

// ---------------------------------------------------------------- columns: grouped (or stacked) bars over 9 seasons

const bar = (x, yTop, w, h, r) => {
  // Rounded data end, flat at the baseline. Thin bars on phones get a smaller radius instead of a broken path.
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${yTop + h}V${yTop + r}q0,${-r} ${r},${-r}h${Math.max(0, w - 2 * r)}q${r},0 ${r},${r}V${yTop + h}z`;
};

export function columns(el, { cats, series, fmtv = fmt.int, height = 240, label = 'By season', href, stacked = false, max: fixedMax }) {
  mount(el, (el, W) => {
    const H = height, m = { t: 18, r: 6, b: 28, l: 38 };
    const totals = cats.map((_, ci) => series.reduce((s, x) => s + x.values[ci], 0));
    const max = fixedMax ?? Math.max(1, ...(stacked ? totals : series.flatMap((s) => s.values)));
    const y = lin(0, max * (fixedMax ? 1 : 1.08), H - m.b, m.t);
    const band = (W - m.l - m.r) / cats.length;
    const cols = stacked ? 1 : series.length;
    const inner = Math.min(band * 0.78, 26 * cols + 4);
    const gap = cols > 1 && inner / cols > 6 ? 2 : 0;
    const bw = (inner - (cols - 1) * gap) / cols;
    let body = '';
    const ints = series.every((s) => s.values.every(Number.isInteger));
    for (const t of ticks(0, max * (fixedMax ? 1 : 1.08), 4, ints).filter((t) => !ints || Number.isInteger(t))) body += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmtv(t)}</text>`;
    const items = [];
    cats.forEach((c, ci) => {
      const x0 = m.l + band * ci + (band - inner) / 2;
      let acc = 0;
      series.forEach((s, si) => {
        const v = s.values[ci];
        const idx = items.push({ c, ci, s, v }) - 1;
        const bx = stacked ? x0 : x0 + si * (bw + gap);
        const yTop = y(acc + v);
        const h = y(acc) - yTop;
        if (v > 0) {
          const last = !stacked || si === series.length - 1;
          body += stacked
            ? `<rect class="mark grow-y" data-i="${idx}" x="${bx}" y="${yTop}" width="${bw}" height="${Math.max(0, h - (last ? 0 : 1.5))}" rx="${last ? 3 : 0}" style="fill:${s.color};--d:${(ci * 0.05).toFixed(2)}s"/>`
            : `<path class="mark grow-y" data-i="${idx}" d="${bar(bx, yTop, bw, h, bw > 10 ? 4 : 1.5)}" style="fill:${s.color};--d:${(ci * 0.05 + si * 0.08).toFixed(2)}s"/>`;
        }
        if (stacked) acc += v;
        // Tap targets are the whole band (or column slot), never narrower than the bar slot.
        const hx = stacked ? m.l + band * ci : bx - gap / 2;
        const hw = stacked ? band : bw + gap;
        body += stacked
          ? `<rect class="hit" data-i="${idx}" x="${hx}" y="${yTop}" width="${hw}" height="${Math.max(h, 1)}"/>`
          : `<rect class="hit" data-i="${idx}" x="${hx}" y="${m.t}" width="${hw}" height="${H - m.t - m.b}"/>`;
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

// ---------------------------------------------------------------- season strip: every episode as a dot, one row per season

export function seasonStrip(el, D, { domain = [6.2, 10] } = {}) {
  mount(el, (el, W) => {
    const rowH = 38, m = { t: 8, r: 14, b: 26, l: 34 };
    const H = m.t + m.b + rowH * D.seasons.length;
    const x = lin(domain[0], domain[1], m.l, W - m.r);
    let body = '';
    for (const t of ticks(domain[0], domain[1], W < 520 ? 4 : 8)) body += `<line class="gridline" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}"/><text x="${x(t)}" y="${H - 8}" text-anchor="middle">${t.toFixed(1)}</text>`;
    const items = [];
    D.seasons.forEach((s, si) => {
      const cy = m.t + rowH * si + rowH / 2;
      body += `<a href="#/season/${s.n}"><text class="lbl-strong" x="${m.l - 10}" y="${cy + 4}" text-anchor="end">S${s.n}</text></a>`;
      body += `<rect x="${x(s.q1)}" y="${cy - 9}" width="${Math.max(2, x(s.q3) - x(s.q1))}" height="18" rx="9" style="fill:var(--accent-soft)"/>`;
      const eps = D.episodes.slice(s.first, s.last + 1);
      const seen = {};
      eps.forEach((e, i) => {
        const k = e.r.toFixed(1);
        const off = (seen[k] = (seen[k] || 0) + 1) - 1;
        const idx = items.push(e) - 1;
        body += `<circle class="mark pop" data-i="${idx}" cx="${x(e.r).toFixed(1)}" cy="${(cy + (off % 2 ? 1 : -1) * Math.ceil(off / 2) * 3.5).toFixed(1)}" r="4" style="fill:var(--accent);stroke:var(--surface);opacity:.85;--d:${(si * 0.05 + i * 0.01).toFixed(2)}s" stroke-width="1.5"/>`;
      });
      body += `<line x1="${x(s.median)}" x2="${x(s.median)}" y1="${cy - 12}" y2="${cy + 12}" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>`;
    });
    el.innerHTML = svg(W, H, body, 'Every episode rating by season');
    bind(el, 'circle.mark', items, (e) => epTip(e), (e) => `#/episode/${e.id}`);
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
      body += `<circle class="mark pop" data-i="${i}" cx="${x(p.x).toFixed(1)}" cy="${y(Math.max(y0, Math.min(y1, p.y))).toFixed(1)}" r="5" style="fill:${p.color || 'var(--accent)'};stroke:var(--surface);opacity:.85;--d:${(0.2 + i * 0.004).toFixed(3)}s" stroke-width="2"/>`;
    });
    if (fit) {
      const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
      const b = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / xs.reduce((s, v) => s + (v - mx) ** 2, 0);
      const a = my - b * mx;
      const xa = Math.min(...xs), xb = Math.max(...xs);
      body += `<line class="draw" x1="${x(xa)}" y1="${y(a + b * xa)}" x2="${x(xb)}" y2="${y(a + b * xb)}" stroke="var(--ink)" stroke-width="2" pathLength="1" style="--d:.8s"/>`;
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

export function matrix(el, D) {
  const { keys, m, tot } = D.matrix;
  mount(el, (el, Wc) => {
    const W = Math.max(560, Wc);
    const lab = 78, top = 64;
    const cell = (W - lab - 4) / keys.length;
    const H = top + cell * keys.length + 4;
    // Share of all the times someone else speaks right after this person (not just the twelve shown).
    const rows = m.map((r, i) => r.map((v) => v / tot[i]));
    const max = Math.max(...rows.flatMap((r, i) => r.filter((_, j) => j !== i)));
    const steps = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)', 'var(--seq-7)'];
    let body = '';
    const items = [];
    keys.forEach((k, j) => body += `<text transform="translate(${lab + cell * (j + 0.5) - 3},${top - 8}) rotate(-40)" class="lbl">${esc(k)}</text>`);
    keys.forEach((a, i) => {
      body += `<text x="${lab - 10}" y="${top + cell * (i + 0.5) + 4}" text-anchor="end" class="lbl">${esc(a)}</text>`;
      keys.forEach((b, j) => {
        const v = rows[i][j];
        const idx = items.push({ a, b, v, n: m[i][j] }) - 1;
        const si = Math.min(6, Math.floor((v / max) * 6.999));
        const step = a === b ? 'var(--bg-2)' : steps[si];
        body += `<rect class="cell pop" data-i="${idx}" x="${lab + cell * j}" y="${top + cell * i}" width="${cell}" height="${cell}" rx="4" style="fill:${step};--d:${((i + j) * 0.02).toFixed(2)}s"/>`;
        // Numbers only on the darkest three steps, in a colour that clears contrast in both themes.
        if (a !== b && si >= 4) body += `<text x="${lab + cell * (j + 0.5)}" y="${top + cell * (i + 0.5) + 4}" text-anchor="middle" class="cell-n">${Math.round(v * 100)}</text>`;
      });
    });
    el.innerHTML = svg(W, H, body, 'Who speaks right after whom');
    el.querySelectorAll('.cell').forEach((n) => {
      const it = items[+n.dataset.i];
      if (it.a === it.b) return;
      hover(n, () => `<div class="tt">${esc(it.a)} → ${esc(it.b)}</div><div class="tm">After ${esc(it.a)} finishes a line, ${esc(it.b)} speaks next ${fmt.pct(it.v * 100)} of the time.</div><div class="tr" style="margin-top:6px"><span>Times</span><b>${fmt.int(it.n)}</b></div>`);
    });
  });
}

// ---------------------------------------------------------------- the barcode: when each person talks in an episode

export function barcode(el, ep, D) {
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
    ${ep.shuffled ? '' : '<div class="barcode-axis"><span>Start</span><span>Halfway</span><span>End</span></div>'}`;
    el.querySelectorAll('.rv').forEach((node) => requestAnimationFrame(() => node.classList.add('in')));
  });
}

// ---------------------------------------------------------------- tiny bar of who talks, for list rows

// Share of the episode's lines by person, biggest first. It doesn't depend on line order, so it's right for every episode.
export function seqThumb(ep) {
  const W = 150, H = 14;
  let x = 0;
  let r = '';
  for (const t of ep.top) {
    const w = (t.n / ep.lines) * W;
    r += `<rect x="${x.toFixed(2)}" width="${Math.max(0, w - 1).toFixed(2)}" height="${H}" style="fill:${color(t.k)}"/>`;
    x += w;
  }
  return `<svg class="ep-seq" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><rect width="${W}" height="${H}" rx="3" style="fill:var(--bg-2)"/>${r}</svg>`;
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
