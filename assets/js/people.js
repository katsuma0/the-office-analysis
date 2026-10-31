import { $, $$, esc, fmt, slug, color, initials, count, hbars, epCode, hover, tip, tableView } from './ui.js';
import { mount, columns, epTip } from './charts.js';
import { badges, epRow } from './pages.js';

// ---------------------------------------------------------------- small helpers

// The first name the data pipeline matches when it counts who says whose name (FIRST in build_data.py).
const firstName = (k) => k.split(' ')[0];
// "B. J. Novak" is "B. J.", not "B.".
const callName = (person) => {
  const t = person.split(' ');
  const lead = [];
  while (t.length > 1 && /^[A-Z]\.$/.test(t[0])) lead.push(t.shift());
  return lead.length ? lead.join(' ') : t[0];
};
// Correlations with a real minus sign, and never "−0.00".
const r2 = (r) => (Math.abs(r) < 0.005 ? '0.00' : fmt.num(r));
const pct = (v) => `${fmt.dec(v, v >= 10 || Number.isInteger(v) ? 0 : 1)}%`;
// Titles in running text get quotes, the way pages.js does it, so “Goodbye, Michael” doesn't read as two items in a list.
// epL is the bare link for meta lines where a title stands alone.
const epL = (D, id) => `<a href="#/episode/${id}">${esc(D.episodes[id].t)}</a>`;
const epA = (D, id) => `“${epL(D, id)}”`;
const qt = (t) => `“${t}”`;
const span = (D, a, b) => (a === b ? qt(D.episodes[a].t) : `${qt(D.episodes[a].t)} to ${qt(D.episodes[b].t)}`);
const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
const pressed = (btns, on) => btns.forEach((x) => { x.classList.toggle('on', x === on); x.setAttribute('aria-pressed', String(x === on)); });
// The same normalising the pipeline uses before matching words: lower case, apostrophes dropped, punctuation to spaces.
const norm = (s) => ` ${s.toLowerCase().replace(/[’‘`]/g, "'").replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

// "A, B and C", for episode links whose titles may have commas of their own.
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// Ranks where a tie shares the better place, the way the episodes page does it (T-11, T-11, T-11, then 14th).
const ranks = (rows, v) => new Map(rows.map((p) => [p, 1 + rows.filter((o) => v(o) > v(p)).length]));

// Every run of episodes a character sits out between their first and last appearance, longest first.
function absences(D, c) {
  const out = [];
  let start = null;
  for (let i = c.first; i <= c.last; i++) {
    const n = D.episodes[i].c[c.code] || 0;
    if (!n && start == null) start = i;
    if (n && start != null) { out.push({ n: i - start, from: start, to: i - 1 }); start = null; }
  }
  return out.sort((a, b) => b.n - a.n || a.from - b.from);
}

// The longest absence, and every other one just as long (Toby has two of eight, Erin and Phyllis three each).
function longestGaps(D, c) {
  const g = absences(D, c);
  return g.filter((x) => x.n === g[0]?.n);
}

// Line share against rating, with each season's own average taken out of both, so a character who mostly
// talks in a weak season doesn't look like the reason it was weak.
function withinSeason(D, c) {
  const pts = D.episodes.filter((e) => e.c[c.code]).map((e) => ({ s: e.s, x: e.c[c.code] / e.lines, y: e.r }));
  const by = {};
  pts.forEach((p) => { (by[p.s] ??= []).push(p); });
  const xs = [], ys = [];
  Object.values(by).forEach((g) => {
    const mx = g.reduce((a, p) => a + p.x, 0) / g.length, my = g.reduce((a, p) => a + p.y, 0) / g.length;
    g.forEach((p) => { xs.push(p.x - mx); ys.push(p.y - my); });
  });
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0), sxx = xs.reduce((a, x) => a + x * x, 0), syy = ys.reduce((a, y) => a + y * y, 0);
  return { r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, n: pts.length };
}

// Bar rows I need more control over than hbars() gives: an extra marker in the label and a two-part value.
function bars(rows, { fmtv = (v) => fmt.int(v), href, max, wide = false } = {}) {
  const m = max ?? Math.max(...rows.map((r) => r.v));
  return `<div class="hbars pp-bars${wide ? ' wide' : ''}">${rows.map((r, i) => {
    const u = href?.(r);
    const tag = u ? 'a' : 'div';
    return `<${tag} class="hbar${r.hot ? ' hot' : ''}"${u ? ` href="${u}"` : ''} title="${esc(r.label)}">
      <span class="hn">${r.dot ? `<i class="dot" style="background:${r.dot}"></i>` : ''}<span class="hl">${esc(r.label)}</span>${r.tag ? `<b class="pp-x">${r.tag}</b>` : ''}</span>
      <span class="ht"><span style="width:${(r.v / m) * 100}%;background:${r.color || 'var(--accent)'};--d:${i * 0.04}s"></span></span>
      <span class="hv">${fmtv(r.v, r)}</span>
    </${tag}>`;
  }).join('')}</div>`;
}

// Signature words as chips that open a search for that word.
function chips(list, max = 14) {
  const top = list.slice(0, max);
  if (!top.length) return '<p class="muted small">Nothing stands out.</p>';
  const zmax = Math.max(...top.map((w) => w.z));
  return `<div class="words">${top.map((w, i) => `<a class="word" href="#/dialogue/q/${encodeURIComponent(w.w)}" style="font-size:${(15 + (w.z / zmax) * 15).toFixed(1)}px;--d:${i * 0.04}s" title="Said ${fmt.times(w.n)}. Search it">${esc(w.w)}<small>${w.n}</small></a>`).join('')}</div>`;
}

// ---------------------------------------------------------------- the attendance sheet

// Context for the biggest holes in the sheet. The text is mine; the ranges are checked against the line
// counts before anything is drawn, so a rebuilt data file can't leave a note pointing at the wrong gap.
const NOTES = [
  { k: 'Michael', from: 138, to: 186, label: 'Moves to Colorado with Holly, back for the Finale' },
  // max: 1 lets through the one line he has inside the range; noteSpan() names that episode so the count adds up.
  { k: 'Oscar', from: 29, to: 39, max: 1, label: 'Paid “vacation” after “Gay Witch Hunt”' },
  { k: 'Holly', from: 91, to: 119, label: 'In Nashua' },
  { k: 'Toby', from: 128, to: 135, label: 'Jury duty, the Scranton Strangler trial' },
  { k: 'Pam', from: 149, to: 152, label: 'Maternity leave' },
  { k: 'Andy', from: 172, to: 178, label: 'Away on the boat' },
  { k: 'Jim', from: 104, to: 104, label: 'Misses “The Banker”, a clip show' },
];
const notesFor = (D, keys) => NOTES.filter((n) => keys.includes(n.k) && D.char[n.k] && n.to < D.episodes.length
  && D.episodes.slice(n.from, n.to + 1).every((e) => (e.c[D.char[n.k].code] || 0) <= (n.max || 0)));
// "“The Convention” to “Traveling Salesmen”, 11 episodes, apart from one line in “A Benihana Christmas”": the
// exceptions come from the data, so the note can't quietly disagree with the 8-episode absence in the table.
function noteSpan(D, n) {
  const len = n.to - n.from + 1;
  if (len === 1) return epCode(D.episodes[n.from]);
  const code = D.char[n.k].code;
  const odd = D.episodes.slice(n.from, n.to + 1).filter((e) => e.c[code]);
  const lines = odd.reduce((a, e) => a + e.c[code], 0);
  const but = odd.length ? `, apart from ${lines === 1 ? 'one line' : fmt.plural(lines, 'line')} in ${andList(odd.map((e) => qt(e.t)))}` : '';
  return `${span(D, n.from, n.to)}, ${len} episodes${but}`;
}

function sheet(el, D, keys, { rowH = 16, minCell = 4, labels = true, notes = [], marks = [], headH = 18 } = {}) {
  if (!el) return;
  const E = D.episodes, N = E.length;
  const rows = keys.map((k) => {
    const c = D.char[k];
    const v = E.map((e) => e.c[c.code] || 0);
    // Shade by quartile of this person's own busier episodes, so Creed's big night shows up as dark as Michael's.
    const busy = v.filter((x) => x >= 2).sort((a, b) => a - b);
    const q = busy.length ? [0.25, 0.5, 0.75].map((p) => busy[Math.floor(p * (busy.length - 1))]) : [2, 2, 2];
    return { c, v, q, col: color(k) };
  });
  const op = (n, q) => (n === 1 ? 0.22 : n <= q[0] ? 0.42 : n <= q[1] ? 0.6 : n <= q[2] ? 0.8 : 1);
  el.classList.add('att');
  el.innerHTML = `${labels ? `<div class="att-labels" style="--rh:${rowH}px;padding-top:${headH}px">${rows.map((r) => `<a href="#/character/${slug(r.c.key)}" title="${esc(r.c.key)}"><i class="dot" style="background:${r.col}"></i><span class="lf">${esc(r.c.key)}</span>${r.c.key.includes(' ') ? `<span class="ls">${esc(r.c.key.split(' ').map((w, i, a) => (i < a.length - 1 ? `${w[0]}.` : w)).join(' '))}</span>` : ''}</a>`).join('')}</div>` : ''}
    <div class="att-scroll"><div class="att-plot"></div></div>`;
  const scroller = el.querySelector('.att-scroll');
  const plot = el.querySelector('.att-plot');
  // The fade at the right edge goes once you reach the Finale, so it never hides the last column.
  const atEnd = () => el.classList.toggle('at-end', scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2);
  scroller.addEventListener('scroll', () => { tip.hide(); atEnd(); }, { passive: true });
  mount(plot, (p, w) => {
    // Fill the width when that still leaves cells close to the minimum; scroll only when it really doesn't fit.
    const cw = w / N >= minCell * 0.85 ? w / N : minCell;
    const W = cw * N, H = headH + rows.length * rowH;
    const gap = cw > 3 ? 0.6 : 0;
    let b = '';
    D.seasons.forEach((s) => {
      const x0 = s.first * cw, x1 = (s.last + 1) * cw;
      b += `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${headH - 6}" text-anchor="middle">${x1 - x0 > 22 ? 'S' : ''}${s.n}</text>`;
    });
    rows.forEach((r, ri) => {
      const y = headH + ri * rowH + 1.5, h = rowH - 3;
      b += `<g class="att-row" style="fill:${r.col};--d:${(ri * 0.035).toFixed(3)}s"><rect class="att-bg" x="0" y="${y}" width="${W}" height="${h}" rx="2"/>`;
      r.v.forEach((n, i) => {
        if (n) b += `<rect x="${(i * cw).toFixed(2)}" y="${y}" width="${(cw - gap).toFixed(2)}" height="${h}" fill-opacity="${op(n, r.q)}"/>`;
      });
      b += '</g>';
    });
    D.seasons.forEach((s) => { if (s.n > 1) b += `<line class="att-sep" x1="${s.first * cw}" x2="${s.first * cw}" y1="${headH - 3}" y2="${H}"/>`; });
    marks.forEach((m) => {
      const ri = keys.indexOf(m.k);
      if (ri < 0) return;
      b += `<rect class="att-mark" x="${m.from * cw - 1}" y="${headH + ri * rowH}" width="${(m.to - m.from + 1) * cw + 2}" height="${rowH}" rx="3"/>`;
    });
    notes.forEach((n, i) => {
      const ri = keys.indexOf(n.k);
      const cx = ((n.from + n.to + 1) / 2) * cw, cy = headH + ri * rowH + rowH / 2;
      const rad = Math.min(6.5, rowH / 2 - 0.5);
      b += `<rect class="att-box" data-n="${i}" x="${n.from * cw - 1.5}" y="${headH + ri * rowH}" width="${(n.to - n.from + 1) * cw + 3}" height="${rowH}" rx="3"/>
        <g class="att-pin" data-n="${i}"><circle cx="${cx.toFixed(1)}" cy="${cy}" r="${rad}"/><text x="${cx.toFixed(1)}" y="${cy + 3.2}" text-anchor="middle">${i + 1}</text></g>`;
    });
    b += `<rect class="att-col" x="0" y="${headH}" width="${cw}" height="${H - headH}" style="opacity:0"/><rect class="att-hl" x="0" y="0" width="${cw}" height="${rowH}" style="opacity:0"/>`;
    p.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="width:${W}px" role="img" aria-label="Lines per episode for ${esc(keys.join(', '))}, every episode in air order">${b}</svg>`;
    const svg = p.querySelector('svg');
    const col = svg.querySelector('.att-col'), hl = svg.querySelector('.att-hl');
    const cell = (ev) => {
      const r = svg.getBoundingClientRect();
      const i = Math.floor(((ev.clientX - r.left) / r.width) * N);
      const ri = Math.floor((((ev.clientY - r.top) / r.height) * H - headH) / rowH);
      if (i < 0 || i >= N || ri < 0 || ri >= rows.length) return null;
      return { i, ri, key: `${i}:${ri}` };
    };
    const clear = () => { col.style.opacity = 0; hl.style.opacity = 0; $$('.att-labels a', el).forEach((a) => a.classList.remove('on')); };
    const show = (ev, hint) => {
      const h = cell(ev);
      if (!h) { if (tip.owner() === svg) tip.hide(); return null; }
      const e = E[h.i], r = rows[h.ri], n = r.v[h.i];
      col.setAttribute('x', h.i * cw); col.style.opacity = 1;
      hl.setAttribute('x', h.i * cw); hl.setAttribute('y', headH + h.ri * rowH); hl.style.opacity = 1;
      $$('.att-labels a', el).forEach((a, k) => a.classList.toggle('on', k === h.ri));
      tip.show(epTip(e, `<div class="tr"><span>${esc(r.c.key)}</span><b>${n ? fmt.plural(n, 'line') : 'not in it'}</b></div>${e.approx && n ? '<div class="tm">One transcript split across two parts, so roughly.</div>' : ''}${hint ? '<div class="tm" style="margin-top:6px">Tap again to open</div>' : ''}`), ev, svg, clear);
      return h;
    };
    let armed = null;
    svg.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') show(ev); });
    svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') tip.hide(); });
    svg.addEventListener('click', (ev) => {
      const h = cell(ev);
      if (!h) return;
      const mouse = ev.pointerType === 'mouse' || (!ev.pointerType && !matchMedia('(hover: none)').matches);
      if (mouse || (armed === h.key && tip.owner() === svg)) { tip.hide(); location.hash = `#/episode/${h.i}`; return; }
      show(ev, true);
      armed = h.key;
    });
    p.dataset.cw = cw;
    el.classList.toggle('scrolls', W > w + 1);
    atEnd();
  });
  return { scroller, plot };
}

// ---------------------------------------------------------------- all characters

const METRICS = {
  lines: { label: 'Lines', f: (c) => c.lines, fmt: (v) => fmt.int(v), note: '' },
  episodes: { label: 'Episodes', f: (c) => c.episodes, fmt: (v) => fmt.int(v), note: 'Episodes with at least one line.' },
  wordsPerLine: { label: 'Words per line', f: (c) => c.wordsPerLine, fmt: (v) => fmt.dec(v), note: '' },
  questionPct: { label: 'Questions', f: (c) => c.questionPct, fmt: (v) => fmt.pct(v), note: 'Share of their lines that end in a question mark.' },
  exclaimPct: { label: 'Exclamations', f: (c) => c.exclaimPct, fmt: (v) => fmt.pct(v), note: 'Share of their lines with an exclamation mark.' },
  mentioned: { label: 'Named by others', f: (c) => c.mentioned, fmt: (v) => fmt.int(v), note: 'Times someone else says their first name.' },
};

function attendanceFacts(D) {
  const N = D.episodes.length;
  const out = [];
  const all = D.byLines.filter((c) => c.episodes === N);
  if (all.length === 1) out.push(`${all[0].key} is the only one in all ${N} episodes.`);
  else if (all.length > 1) out.push(`${all.map((c) => c.key).join(' and ')} are in all ${N} episodes.`);
  D.byLines.filter((c) => c.episodes === N - 1).forEach((c) => {
    const miss = D.episodes.find((e) => !e.c[c.code]);
    out.push(`${c.key} missed one, ${qt(miss.t)}.`);
  });
  const m = D.char.Michael;
  if (m?.gap && m.last === N - 1 && m.gap.to === N - 2 && D.episodes.slice(0, m.gap.from).every((e) => e.c[m.code])) {
    out.push(`Michael is in every episode from ${qt(D.episodes[0].t)} to ${qt(D.episodes[m.gap.from - 1].t)}, then just ${qt(D.episodes[N - 1].t)}.`);
  }
  return out.join(' ');
}

export function characters(D) {
  const top = D.byLines[0], low = D.byLines[D.byLines.length - 1];
  const keys = D.byLines.map((c) => c.key);
  const notes = notesFor(D, keys);
  return {
    title: 'Characters',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Characters</p>
      <h1>Everyone with <em>a desk.</em></h1>
      <p class="lede">The ${D.characters.length} people with the most lines, from ${esc(top.key)}'s ${fmt.int(top.lines)} down to ${esc(low.key)}'s ${fmt.int(low.lines)}.</p>
    </section>
    <section class="wrap">${badges(D, D.byLines)}</section>
    <section class="section wrap">
      <div class="card rv att-card">
        <h3 class="card-title">The attendance sheet</h3>
        <p class="card-sub">Every episode in air order, shaded against each person's own usual. ${esc(attendanceFacts(D))}</p>
        <p class="att-hint" aria-hidden="true">${matchMedia('(hover: none)').matches ? 'Swipe' : 'Scroll'} sideways for all ${D.episodes.length} episodes.</p>
        <div id="att"></div>
        <div class="legend att-key mt"><span><i class="sq att-sw0"></i>No lines</span><span><i class="sq" style="background:var(--c-michael);opacity:.22"></i>One line</span><span><i class="sq att-ramp"></i>More lines, stronger colour</span></div>
        ${notes.length ? `<ol class="att-notes">${notes.map((n, i) => `<li><button type="button" data-n="${i}"><b class="att-num">${i + 1}</b><span><b>${esc(n.k)}.</b> ${esc(n.label)}. <span class="muted">${esc(noteSpan(D, n))}.</span></span></button></li>`).join('')}</ol>` : ''}
        ${tableView([{ h: 'Character', f: (c) => `<a href="#/character/${slug(c.key)}">${esc(c.key)}</a>` }, { h: 'Episodes', r: 1, f: (c) => fmt.int(c.episodes) }, { h: 'Longest absence', r: 1, f: (c) => fmt.int(longestGaps(D, c)[0]?.n || 0) }, { h: 'When', f: (c) => longestGaps(D, c).map((g) => esc(span(D, g.from, g.to))).join('; ') }], D.byLines)}
      </div>
    </section>
    <section class="wrap">
      <div class="card rv">
        <div class="card-head">
          <div><h3 class="card-title" id="m-title">Lines</h3><p class="card-sub" id="m-note"></p></div>
          <div class="pills" id="m-pills" role="group" aria-label="Measure">${Object.entries(METRICS).map(([k, m], i) => `<button class="pill" aria-pressed="${i === 0}" data-k="${k}">${m.label}</button>`).join('')}</div>
        </div>
        <div id="m-bars"></div>
      </div>
    </section>`,
    after() {
      const drawM = (k) => {
        const M = METRICS[k];
        const title = $('#m-title'), note = $('#m-note'), box = $('#m-bars');
        if (!box) return;
        title.textContent = M.label;
        note.textContent = M.note;
        note.hidden = !M.note;
        const rows = [...D.byLines].sort((a, b) => M.f(b) - M.f(a) || a.rank - b.rank).map((c) => ({ label: c.key, v: M.f(c), color: color(c.key), dot: color(c.key), k: c.key }));
        box.innerHTML = hbars(rows, { fmtv: M.fmt, href: (r) => `#/character/${slug(r.k)}` });
        raf2(() => $('#m-bars .hbars')?.classList.add('go'));
      };
      $$('#m-pills .pill').forEach((b) => b.addEventListener('click', () => {
        $$('#m-pills .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        drawM(b.dataset.k);
      }));
      drawM('lines');

      const box = $('#att');
      const rowH = innerWidth < 620 ? 15 : 17;
      const s = sheet(box, D, keys, { rowH, minCell: 4.2, notes });
      const flash = (i, on) => $$(`#att [data-n="${i}"]`).forEach((n) => n.classList.toggle('on', on));
      $$('.att-notes button').forEach((b) => {
        const i = +b.dataset.n;
        b.addEventListener('pointerenter', () => flash(i, true));
        b.addEventListener('pointerleave', () => flash(i, false));
        b.addEventListener('focus', () => flash(i, true));
        b.addEventListener('blur', () => flash(i, false));
        let off = 0;
        b.addEventListener('click', () => {
          // On a phone the gap is probably off screen, sideways and often above too; bring it into view and blink it.
          if (!s) return;
          const cw = +(s.plot.dataset.cw || 0);
          const n = notes[i];
          const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
          if (cw && s.scroller.scrollWidth > s.scroller.clientWidth) {
            s.scroller.scrollTo({ left: Math.max(0, ((n.from + n.to) / 2) * cw - s.scroller.clientWidth / 2), behavior: smooth });
          }
          const row = s.plot.getBoundingClientRect().top + rowH * keys.indexOf(n.k) + 18;
          const moved = row < 72 || row + rowH > innerHeight - 24;
          if (moved) scrollBy({ top: row - innerHeight * 0.35, behavior: smooth });
          flash(i, true);
          clearTimeout(off);
          off = setTimeout(() => flash(i, false), moved ? 2600 : 1600);
        });
      });
    },
  };
}

// ---------------------------------------------------------------- one character

function corrText(D, c) {
  const r0 = c.ratingCorr;
  if (r0 == null) return '';
  const { r: rw, n } = withinSeason(D, c);
  const k = c.key;
  // The scope goes first: the Findings page leaves out the Finale for Michael and gets a different r.
  const all = `Across all ${fmt.int(c.episodes)} of ${k}'s episodes`;
  const bit = Math.abs(r0) >= 0.3 ? '' : 'a little ';
  const out = [];
  if (Math.abs(r0) < 0.1) out.push(`${all}, how much ${k} talks has almost nothing to do with how they rated (r = ${r2(r0)}).`);
  else out.push(`${all}, the ones where ${k} talks more tended to rate ${bit}${r0 < 0 ? 'lower' : 'higher'} (r = ${r2(r0)}).`);
  const same = Math.sign(rw) === Math.sign(r0);
  const s2 = Math.abs(r0) >= 0.1 && Math.abs(r0 - rw) >= 0.08;
  if (s2) {
    if (Math.abs(rw) < 0.1) out.push(`Within each season it nearly disappears (r = ${r2(rw)}), so it's mostly which seasons ${k} talked most in.`);
    else if (same && Math.abs(rw) < Math.abs(r0) * 0.7) out.push(`Within each season it shrinks to ${r2(rw)}, so part of it is which seasons ${k} talked most in.`);
    else if (same) out.push(`It holds up within each season too (r = ${r2(rw)}).`);
    else out.push(`Within each season it flips (r = ${r2(rw)}), so the seasons were doing all of it.`);
  } else if (Math.abs(r0) < 0.1 && Math.abs(rw) >= 0.15) {
    out.push(`Within each season it's ${r2(rw)}, still weak.`);
  }
  if (n < 30) out.push("That's not many episodes, so take it lightly.");
  return out.join(' ');
}

// Dundies won and couples, as links to those pages.
function ribbons(D, c) {
  const won = (D.dundies || []).filter((d) => d.k === c.key);
  const pairs = (D.couples || []).filter((p) => p.a === c.key || p.b === c.key);
  if (!won.length && !pairs.length) return '';
  const dun = won.map((d) => `<a class="ribbon gold" href="#/dundies@${d.id}">${esc(d.award)}</a>`).join('');
  const cps = pairs.map((p) => `<a class="ribbon" href="#/couples@${slug(`${p.a}-${p.b}`)}">${esc(p.a === c.key ? p.b : p.a)}</a>`).join('');
  // Each label rides with its own pills, so a wrap on a phone can't leave "Couples Discount" at the end of the Dundie line.
  return `<div class="ribbons">${won.length ? `<span class="rb-g"><span class="rb-h">${won.length > 1 ? 'Dundies' : 'Dundie'}</span>${dun}</span>` : ''}${pairs.length ? `<span class="rb-g"><span class="rb-h">Couples Discount</span>${cps}</span>` : ''}</div>`;
}

// One sentence about who says this character's name, picked from whichever fact is most surprising.
// Returns the sentence and whether it already used the self-naming count, so the note under the bars doesn't repeat it.
function namePunch(D, c) {
  const nb = c.namedBy || [];
  if (!nb.length) return { t: '', self: false };
  const name = firstName(c.key), k = c.key;
  const top = nb[0];
  // "More than their other half does" only counts when it's a real margin. Pam over Dwight for "Michael" is 268 to 267.
  const clear = (a, b) => a.n >= b.n * 1.15 && a.n - b.n >= 10;
  const partners = (D.couples || []).filter((p) => p.a === k || p.b === k)
    .sort((a, b) => (b.aSays + b.bSays) - (a.aSays + a.bSays)).map((p) => (p.a === k ? p.b : p.a));
  if (!partners.includes(top.k)) {
    // Their biggest couple only: for Michael that's Dwight, so it's no contest and Jan's 19% gets the line instead.
    const p = partners.map((x) => nb.find((r) => r.k === x)).find(Boolean);
    if (p && clear(top, p)) return { t: `${top.k} says ${k}'s name more than ${p.k} does: ${fmt.plural(top.n, 'line')} to ${fmt.int(p.n)}.`, self: false };
  }
  const hi = nb.reduce((a, b) => (b.pct > a.pct ? b : a));
  if (hi !== top && hi.pct >= top.pct * 2) return { t: `${hi.k} says “${name}” in ${fmt.plural(hi.n, 'line')}, ${fmt.pct(hi.pct)} of everything ${hi.k} says. For ${top.k}, who says it most, it's ${fmt.pct(top.pct)}.`, self: false };
  const self = c.selfNamed || 0;
  const under = nb.findIndex((r) => r.n <= self);
  if (self >= 5 && under >= 0 && under <= 2) {
    return { t: `${k} says “${name}” in ${fmt.plural(self, 'line')}, ${nb[under].n === self ? 'as many as' : 'more than'} ${nb[under].k} does.`, self: true };
  }
  if (nb[1] && nb[1].n === top.n) return { t: `${top.k} and ${nb[1].k} tie for it, ${fmt.plural(top.n, 'line')} each.`, self: false };
  return { t: `${top.k} says it most, in ${fmt.plural(top.n, 'line')}, ${fmt.pct(top.pct)} of everything ${top.k} says.`, self: false };
}

// "Carol answers Michael 10.9 times as often as Carol answers anyone else. Donna and Holly, 8.6 times each."
// Names the top two, anyone tied with them at the shown precision, and anyone the bars tag, so no ×8.6 tag goes unexplained.
function answerPunch(c, followRows) {
  const u = c.unusual || [];
  if (!u.length) return '';
  const k = c.key;
  const x = (v) => fmt.dec(v.x);
  const tagged = new Set(followRows.filter((r) => r.hot).map((r) => r.k));
  const groups = [];
  u.filter((v, i) => i < 2 || tagged.has(v.k) || (u[1] && x(v) === x(u[1]))).forEach((v) => {
    const g = groups[groups.length - 1];
    if (g && x(g[0]) === x(v)) g.push(v); else groups.push([v]);
  });
  const [g0, ...rest] = groups;
  const names = (g) => andList(g.map((v) => v.k));
  const lead = g0.length === 1
    ? `${g0[0].k} answers ${k} ${x(g0[0])} times as often as ${g0[0].k} answers anyone else.`
    : `${names(g0)} each answer ${k} ${x(g0[0])} times as often as they answer anyone else.`;
  return rest.length ? `${lead} ${rest.map((g) => `${names(g)}, ${x(g[0])} times${g.length > 1 ? ' each' : ''}`).join('; ')}.` : lead;
}

// Where the character's own count would land among the people above. Only a count and a rank: the data can't
// say how they use their own name (Michael's are mostly third person, not introductions).
function selfNote(c) {
  const self = c.selfNamed || 0;
  if (!self) return '';
  const k = c.key, name = firstName(k), nb = c.namedBy || [];
  const lead = self === 1 ? `One of ${k}'s own lines says “${name}”` : `${fmt.int(self)} of ${k}'s own lines say “${name}”`;
  const tie = nb.filter((r) => r.n === self);
  const i = nb.findIndex((r) => r.n < self);
  let where = '';
  if (tie.length) where = `, level with ${tie.map((r) => r.k).join(' and ')}`;
  else if (i === 0) where = ', more than anyone else here';
  else if (i > 0) where = `, which would come ${fmt.ordinal(i + 1)} on this list`;
  return `${lead}${where}.`;
}

// Hand-picked: these first names belong to more than one person in the show, so the count includes some strangers.
const SHARED_NAMES = { 'David Wallace': 'Every “David” counts, so a few of these are other Davids.', Robert: 'Every “Robert” counts, so Senator Robert Lipton is in here too.' };

// The patterns the pipeline used for the faces (MICHAEL_FACES in build_data.py), on the same normalised text.
const FACE_RE = { 'Michael Scarn': /\bscarn\b/, 'Prison Mike': /\bprison mike\b/, 'Date Mike': /\bdate mike\b/, 'Caleb Crawdad': /\bcaleb crawdad\b/, 'Michael Klump': /\bklump\b|\bmichael clump\b/, Mykonos: /\bmykonos\b|\bmikanos\b/ };

const monthYear = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
// " over 5 years and 3 months", counted on the air dates, not by subtracting years.
function between(a, b) {
  const [y0, m0, d0] = a.split('-').map(Number), [y1, m1, d1] = b.split('-').map(Number);
  const months = (y1 - y0) * 12 + (m1 - m0) - (d1 < d0 ? 1 : 0);
  if (months < 1) return '';
  const y = Math.floor(months / 12), m = months % 12;
  return ` over ${[y && fmt.plural(y, 'year'), m && fmt.plural(m, 'month')].filter(Boolean).join(' and ')}`;
}

function facesCard(D) {
  const F = (D.faces || []).filter((f) => f.n && f.eps.length);
  if (!F.length) return '';
  const E = D.episodes, N = E.length;
  return `<div class="card rv mt faces-card">
    <h3 class="card-title">The many faces of Michael Scott</h3>
    <p class="card-sub">Alter egos, counted by the lines that name them.</p>
    <div class="faces">${F.map((f, i) => {
      const e = D.episodes[f.first];
      const last = f.eps[f.eps.length - 1];
      const one = f.eps.length === 1;
      // A one-episode face already gets its episode in the meta line, so the blurb doesn't need to name it too ("Greek, from The Seminar.").
      const tail = `, from ${e.t}.`;
      const blurb = one && f.blurb.endsWith(tail) ? `${f.blurb.slice(0, -tail.length)}.` : f.blurb;
      return `<div class="face${f.eps.length > 1 ? ' wide' : ''}">
        <div class="face-head"><span class="face-n">${esc(f.name)}</span><span class="face-c">${fmt.plural(f.n, 'line')}</span></div>
        <p class="face-b">${esc(blurb)}</p>
        <p class="face-m">${one ? `In ${epA(D, e.id)}, ${epCode(e)}` : `First in ${epA(D, e.id)}, ${epCode(e)}, ${monthYear(e.date)}. Last in ${epA(D, last)}, ${epCode(E[last])}, ${monthYear(E[last].date)}. ${f.eps.length} episodes${between(e.date, E[last].date)}`}.</p>
        ${f.eps.length > 1 ? `<div class="face-track" aria-hidden="true">${D.seasons.map((s) => `<i class="ft-s" style="left:${(s.first / N) * 100}%"></i>`).join('')}${f.eps.map((id) => `<b style="left:${((id + 0.5) / N) * 100}%" title="${esc(D.episodes[id].t)}"></b>`).join('')}</div>
        <div class="face-ss" aria-hidden="true">${D.seasons.map((s) => `<span style="left:${(((s.first + s.last + 1) / 2) / N) * 100}%">S${s.n}</span>`).join('')}</div>` : ''}
        <button class="btn ghost face-go" type="button" data-i="${i}">Read the lines</button>
        <div class="face-lines script" id="face-${i}" aria-live="polite"></div>
      </div>`;
    }).join('')}</div>
  </div>`;
}

// The URL line goes first. It's the one everybody remembers.
function creedThoughts(c) {
  const th = [...(c.thoughts || [])];
  const u = th.findIndex((t) => /creedthoughts/i.test(t.t));
  if (u > 0) th.unshift(...th.splice(u, 1));
  return th;
}

function creedCard(D, c) {
  const th = creedThoughts(c);
  if (!th.length) return '';
  const per = D.episodes.map((e) => e.c[c.code] || 0).filter(Boolean);
  const low = per.filter((n) => n <= 2).length, one = per.filter((n) => n === 1).length;
  const big = c.bigEpisodes[0];
  const own = (c.phrases || []).find((p) => /creed/.test(p.p));
  return `<div class="card rv mt creed-card">
    <div class="blog-bar"><span class="blog-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="blog-url">www.creedthoughts.gov.www/creedthoughts</span></div>
    <div class="blog-body">
      <h3 class="blog-title">Creed Thoughts</h3>
      <p class="card-sub">The ${th.length} lines of Creed's that lean hardest on words nobody else on the show uses.</p>
      <div class="creed-index">
        <div><b>${fmt.int(c.lines)}</b><span>lines in ${fmt.int(c.episodes)} episodes, ${fmt.dec(c.lines / c.episodes)} per episode</span></div>
        <div><b>${fmt.int(low)}</b><span>episodes where he says two lines or fewer; exactly one in ${fmt.int(one)}</span></div>
        ${own ? `<div><b>${fmt.int(own.n)} of ${fmt.int(own.of)}</b><span>lines that say “${esc(showPhrase(D, own.p))}” are Creed's</span></div>` : `<div><b>${fmt.pct(big.pct)}</b><span>of the lines in ${esc(qt(D.episodes[big.id].t))}, his biggest night</span></div>`}
      </div>
      <div class="blog-feed" id="thoughts"></div>
      <button class="btn ghost mt" id="more-thoughts" type="button">Load more thoughts</button>
    </div>
  </div>`;
}

// The data keeps phrases as lower-case tokens ("service this is kelly"). These are the speaker's own spellings, which I
// checked against the transcript. Anything not listed just gets its people's names capitalised.
const PHRASE_SHOW = {
  'kevin kevin': 'Kevin, Kevin',
  'service this is kelly': 'service, this is Kelly',
  'this michael': 'this, Michael',
  'the ceo': 'the CEO',
  'senator lipton': 'Senator Lipton',
  'costa rica': 'Costa Rica',
};
function showPhrase(D, p) {
  if (PHRASE_SHOW[p]) return PHRASE_SHOW[p];
  const names = new Set(D.characters.flatMap((x) => x.name.toLowerCase().split(' ')));
  return p.split(' ').map((w) => (w === 'i' ? 'I' : names.has(w) ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

function ownedCard(D, c, cc) {
  const k = esc(c.key);
  const owned = c.owned || [];
  // A phrase with an apostrophe inside a word ("m m's", from M&M's) was counted on tokens the search can't reproduce
  // (it finds 10 lines where the data says 6), so it would contradict its own link. Leave those out.
  const phr = (c.phrases || []).filter((p) => !p.p.includes("'"));
  const whole = (o) => (o.n === o.of ? `all ${fmt.int(o.of)} lines that are just this` : `${fmt.int(o.n)} of the ${fmt.int(o.of)} lines that are just this`);
  const lineRows = owned.map((o) => ({ t: o.t, q: `"${o.t}"`, n: o.n, of: o.of, m: whole(o) }));
  const phrRows = phr.map((p) => ({ t: `…${showPhrase(D, p.p)}…`, q: `"${showPhrase(D, p.p)}"`, n: p.n, of: p.of, m: p.n === p.of ? `in all ${fmt.plural(p.of, 'line')} that say it` : `in ${fmt.int(p.n)} of the ${fmt.plural(p.of, 'line')} that say it` }));
  const row = (b, i) => `<a class="own-row" href="#/dialogue/q/${encodeURIComponent(b.q)}" style="--d:${i * 0.06}s">
      <span class="own-t">${esc(b.t)}</span>
      <span class="own-bar"><span style="width:${(b.n / b.of) * 100}%;background:${cc}"></span></span>
      <span class="own-m">${b.m}</span></a>`;
  if (!lineRows.length && !phrRows.length) {
    return `<h3 class="card-title">Lines that are mostly ${k}'s</h3>
      <p class="own-none">No short line ${k} says three times or more is mostly ${k}'s. The words above are the closest thing.</p>`;
  }
  // The one caveat worth keeping: the search finds longer lines too, so its count is bigger than the one here.
  const tapNote = 'Searching one also finds longer lines that contain it.';
  if (lineRows.length >= 3 || !phrRows.length) {
    return `<h3 class="card-title">Lines that are mostly ${k}'s</h3>
      <p class="card-sub">When someone says exactly this and nothing else, it's ${k} at least half the time. ${tapNote}</p>
      <div class="own">${lineRows.map(row).join('')}</div>`;
  }
  const both = lineRows.length > 0;
  const rows = [...lineRows, ...phrRows].slice(0, 4);
  const nl = Math.min(lineRows.length, 4);
  return `<h3 class="card-title">Things that are mostly ${k}'s</h3>
    <p class="card-sub">${both
    ? `Whole lines that are ${k}'s at least half the time, and phrases ${k} says far more than their share of the talking would predict.`
    : `${k}'s short lines are the same as everyone else's, so these are phrases ${k} says far more than their share of the talking would predict.`}</p>
    <div class="own">${both ? '<p class="own-h">The whole line</p>' : ''}${rows.slice(0, nl).map(row).join('')}${both && rows.length > nl ? '<p class="own-h">Inside a longer line</p>' : ''}${rows.slice(nl).map((r, i) => row(r, i + nl)).join('')}</div>`;
}

function longestBlock(D, c, title = true) {
  const e = D.episodes[c.longestEp];
  return `${title ? '<h3 class="card-title mt2">Longest single line</h3>' : ''}<p class="card-sub">${fmt.int(c.longestWords)} words without stopping${e ? `, in ${epA(D, e.id)}` : ''}.</p>
    <div class="script long-line"><div class="tx">${esc(c.longest)}</div></div>`;
}

export function character(D, key, lines) {
  const c = D.charSlug[key];
  if (!c) return null;
  const E = D.episodes, N = E.length;
  const cc = color(c.key);
  const first = E[c.first], last = E[c.last];
  const prev = D.byLines[c.rank - 2], next = D.byLines[c.rank];
  const name = firstName(c.key);
  const longest = longestGaps(D, c);
  const myNotes = notesFor(D, [c.key]);
  const noteFor = (g) => myNotes.find((n) => n.from === g.from && n.to === g.to);
  const allIn = D.characters.filter((x) => x.episodes === N);

  // Absence stat
  let absV, absN;
  if (!longest.length) {
    absV = '0';
    absN = c.episodes === N ? (allIn.length === 1 ? `In all ${N} episodes. The only one.` : `In all ${N} episodes.`) : 'Never missed one between first and last';
  } else {
    absV = `${count(longest[0].n)}<small>${longest[0].n === 1 ? 'episode' : 'eps'}</small>`;
    absN = longest.length > 1 ? `${longest.length === 2 ? 'Twice' : `${longest.length} times`}: ${longest.map((g) => esc(span(D, g.from, g.to))).join('; ')}` : esc(span(D, longest[0].from, longest[0].to));
  }

  const firstCard = c.firstLine ? `<div class="fl-card fl-first">
      <span class="fl-tag">First words</span>
      <p class="fl-q">${esc(c.firstLine.t)}</p>
      <p class="fl-meta">${epL(D, c.firstLine.ep)} · ${epCode(E[c.firstLine.ep])}</p>
      ${c.firstLine.shuffled ? '<p class="fl-note">Two scenes trade lines in that transcript, so this may not be the very first.</p>' : ''}
    </div>` : '';
  const lastE = c.lastLine ? E[c.lastLine.ep] : last;
  const lastCard = c.lastLine ? `<div class="fl-card fl-last">
      <span class="fl-tag">Last words</span>
      <p class="fl-q">${esc(c.lastLine.t)}</p>
      <p class="fl-meta">${epL(D, lastE.id)} · ${epCode(lastE)}</p>
    </div>` : `<div class="fl-card fl-last">
      <span class="fl-tag">Last seen</span>
      <p class="fl-seen">${epL(D, last.id)}<span>${epCode(last)} · ${fmt.plural(last.c[c.code] || 0, 'line')}</span></p>
      <p class="fl-note">${last.shuffled ? 'Two scenes trade lines in that transcript, so I won\'t guess which line came last.' : 'I could not pin down which line came last.'}</p>
    </div>`;

  const unusual = c.unusual || [];
  const ux = Object.fromEntries(unusual.map((u) => [u.k, u]));
  // Bars keep each person's own colour (an accent blue would read as Michael); the unusual ones get a sticky-note tag.
  const followRows = (c.follows || []).map((f) => ({ label: f.k, v: f.pct, color: color(f.k), dot: color(f.k), k: f.k, hot: !!ux[f.k], tag: ux[f.k] ? `×${fmt.dec(ux[f.k].x)}` : '' }));
  const u0 = unusual[0];
  const named = c.namedBy || [];
  const punch = namePunch(D, c);
  const isCreed = c.key === 'Creed' && c.thoughts?.length;
  const isMichael = c.key === 'Michael' && D.faces?.length;

  return {
    title: c.name,
    html: `
    <section class="wrap page-head" style="--cc:${cc}">
      <div class="crumbs"><a href="#/characters">Characters</a><span>/</span><span>${esc(c.name)}</span></div>
      <div class="char-hero">
        <span class="avatar" style="--cc:${cc}">${esc(initials(c.name))}</span>
        <div>
          <p class="eyebrow">${c.rank === 1 ? 'Most lines in the show' : `${fmt.ordinal(c.rank)} most lines`}</p>
          <h1 style="font-size:clamp(42px,7vw,88px)">${esc(c.name)}</h1>
          <p class="lede">${esc(c.blurb)}</p>
          <p class="actor">Played by ${esc(c.actor)}. In ${fmt.plural(c.episodes, 'episode')}, ${first.id === last.id ? `only ${esc(qt(first.t))}` : `from ${esc(span(D, first.id, last.id))}`}.</p>
          ${ribbons(D, c)}
        </div>
      </div>
      <div class="fl" style="--cc:${cc}">${firstCard}${lastCard}</div>
    </section>
    <section class="wrap">
      <div class="card rv quote-card" style="--cc:${cc}">
        <div class="card-head">
          <div><h3 class="card-title">${esc(c.key)}, in ${esc(c.key)}'s words</h3><p class="card-sub">A random line from the script.</p></div>
          <button class="btn ghost" id="shuffle" type="button">Another one</button>
        </div>
        <p class="quote" id="quote" aria-live="polite"></p>
      </div>
      <div class="stats pp-stats rv mt">
        <div class="stat"><div class="stat-label">Lines</div><div class="stat-value">${count(c.lines)}</div><div class="stat-note">${fmt.pct(c.share)} of the whole show</div></div>
        <div class="stat"><div class="stat-label">Words</div><div class="stat-value">${count(c.words)}</div><div class="stat-note">${fmt.dec(c.wordsPerLine)} per line</div></div>
        <div class="stat"><div class="stat-label">Episodes</div><div class="stat-value">${count(c.episodes)}</div><div class="stat-note">of ${N}</div></div>
        <div class="stat"><div class="stat-label">Named by others</div><div class="stat-value">${count(c.mentioned)}</div><div class="stat-note">times someone else says “${esc(name)}”</div></div>
        <div class="stat"><div class="stat-label">Longest absence</div><div class="stat-value">${absV}</div><div class="stat-note">${absN}</div></div>
      </div>
      <div class="card rv mt">
        <h3 class="card-title">Every episode, in air order</h3>
        <p class="card-sub">Stronger colour, more lines.${longest.length ? ` The outlined stretch${longest.length > 1 ? 'es are the longest absences' : ' is the longest absence'}${longest.map(noteFor).filter(Boolean).map((n) => ` (${longest.length > 1 ? 'one is ' : ''}${esc(n.label[0].toLowerCase() + n.label.slice(1))})`).join('')}.` : ''}</p>
        <div id="my-att"></div>
      </div>
    </section>
    <section class="section wrap">
      <div class="card rv">
        <div class="card-head">
          <div><h3 class="card-title" id="ps-title">Share of each season's lines</h3><p class="card-sub" id="ps-sub"></p></div>
          <div class="flex">
            <div class="toggle" role="group" aria-label="Show as" id="ps-mode"><button type="button" class="on" aria-pressed="true" data-m="share">Share</button><button type="button" aria-pressed="false" data-m="raw">Lines</button></div>
            <select class="select" id="cmp" aria-label="Compare with">
              <option value="">Compare with…</option>
              ${D.byLines.filter((x) => x !== c).map((x) => `<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="legend" id="cmp-legend"></div>
        <div id="per-season"></div>
        <p class="small muted mt" id="share-note"></p>
      </div>
      <div class="grid g2 mt">
        <div class="card rv">
          <h3 class="card-title">Words that are very ${esc(c.key)}</h3>
          <p class="card-sub">Words ${esc(c.key)} uses far more than everyone else, allowing for how much they talk. The small number is times said.</p>
          ${chips(c.signature || [], 14)}
        </div>
        <div class="card rv" style="--d:.06s">
          <h3 class="card-title">Who says “${esc(name)}”</h3>
          <p class="card-sub">Lines that say it, by speaker, and what share of that speaker's lines they are.${SHARED_NAMES[c.key] ? ` ${SHARED_NAMES[c.key]}` : ''}</p>
          ${named.length ? `<p class="punch">${esc(punch.t)}</p>
          ${bars(named.map((r) => ({ label: r.k, v: r.n, color: color(r.k), dot: color(r.k), k: r.k, pct: r.pct })), { wide: true, fmtv: (v, r) => `${fmt.int(v)}<small>${fmt.pct(r.pct)}</small>`, href: (r) => (D.char[r.k] ? `#/character/${slug(r.k)}` : null) })}
          ${c.selfNamed && !punch.self ? `<p class="small muted mt">${esc(selfNote(c))}</p>` : ''}` : '<p class="muted">Nobody says it much.</p>'}
        </div>
      </div>
      <div class="grid g2 mt">
        <div class="card rv">
          <h3 class="card-title">Who answers ${esc(c.key)}</h3>
          <p class="card-sub">Who speaks right after ${esc(c.key)}, as a share of all the times anyone does.</p>
          ${followRows.length ? bars(followRows, { fmtv: (v) => fmt.pct(v), href: (r) => (D.char[r.k] ? `#/character/${slug(r.k)}` : null) }) : '<p class="muted">Not enough to go on.</p>'}
          ${u0 ? `<p class="punch mt">${esc(answerPunch(c, followRows))}</p>` : `<p class="small muted mt">Nobody answers ${esc(c.key)} much more than they answer everyone else.</p>`}
        </div>
        <div class="card rv" style="--d:.06s">
          ${isCreed ? `<h3 class="card-title">Longest single line</h3>${longestBlock(D, c, false)}` : ownedCard(D, c, cc)}
        </div>
      </div>
      ${isCreed ? creedCard(D, c) : ''}
      ${isMichael ? facesCard(D) : ''}
      <div class="${isCreed ? '' : 'grid g2 '}mt">
        <div class="card rv">
          <h3 class="card-title">${esc(c.key)}'s biggest episodes</h3>
          <p class="card-sub">By share of the episode's lines.</p>
          <div class="big-eps">${hbars(c.bigEpisodes.map((b) => ({ label: E[b.id].t, v: b.pct, color: cc, id: b.id })), { fmtv: (v) => fmt.pct(v), href: (r) => `#/episode/${r.id}` })}</div>
          <p class="small muted mt">${esc(corrText(D, c))}</p>
        </div>
        ${isCreed ? '' : `<div class="card rv" style="--d:.06s"><h3 class="card-title">Longest single line</h3>${longestBlock(D, c, false)}</div>`}
      </div>
      <div class="pager pp-pager">
        ${prev ? `<a href="#/character/${slug(prev.key)}"><small>No. ${prev.rank} for lines</small><span>${esc(prev.name)}</span></a>` : '<span style="flex:1"></span>'}
        ${next ? `<a class="next" href="#/character/${slug(next.key)}"><small>No. ${next.rank} for lines</small><span>${esc(next.name)}</span></a>` : '<span style="flex:1"></span>'}
      </div>
    </section>`,
    after() {
      // Lines per season: share by default, raw counts on request.
      const cats = D.seasons.map((s) => `S${s.n}`);
      // The compare pick, the Share/Lines mode and Creed's posts shown live in this page's history entry, so Back
      // from an episode lands on the same chart and the same length of feed the reader left (the router only
      // restores the scroll offset). A fresh link starts from the defaults.
      const saved = history.state || {};
      const save = (patch) => { try { history.replaceState({ ...(history.state || {}), ...patch }, ''); } catch (err) { /* state is a nicety */ } };
      let mode = saved.pp?.mode === 'raw' ? 'raw' : 'share';
      if (mode === 'raw') pressed($$('#ps-mode button'), $('#ps-mode [data-m="raw"]'));
      if (saved.pp?.cmp && D.char[saved.pp.cmp] && saved.pp.cmp !== c.key && $('#cmp')) $('#cmp').value = saved.pp.cmp;
      const savePP = () => save({ pp: { cmp: $('#cmp')?.value || '', mode } });
      const med = [...D.seasons].map((s) => s.lines).sort((a, b) => a - b)[Math.floor(D.seasons.length / 2)];
      // Lines, not episode counts: the data counts Season 4 as 14 episodes where streaming has 19.
      const shortS = D.seasons.filter((s) => s.lines < med * 0.8);
      const short = shortS.length
        ? `${andList(shortS.map((s, i) => `season ${s.n} has ${fmt.int(s.lines)}${i ? '' : ' lines in all'}`))}, against ${fmt.int(med)} for the median season`
        : 'none here';
      const drawCmp = () => {
        const sel = $('#cmp');
        if (!sel) return;
        const other = D.char[sel.value];
        const val = (x) => (mode === 'share' ? x.perSeasonShare : x.perSeason);
        const series = [{ name: c.key, color: cc, values: val(c) }];
        if (other) series.push({ name: other.key, color: color(other.key) === cc ? 'var(--ink-3)' : color(other.key), values: val(other) });
        $('#cmp-legend').innerHTML = series.length > 1 ? series.map((s) => `<span><i class="sq" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('') : '';
        $('#ps-title').textContent = mode === 'share' ? "Share of each season's lines" : 'Lines per season';
        const sub = $('#ps-sub');
        sub.textContent = mode === 'share' ? '' : `Short seasons dip for everyone: ${short}.`;
        sub.hidden = mode === 'share';
        $('#per-season').replaceWith(Object.assign(document.createElement('div'), { id: 'per-season' }));
        columns($('#per-season'), { cats, series, fmtv: mode === 'share' ? pct : fmt.int, href: (it) => `#/season/${it.ci + 1}`, label: `${c.key} by season` });
        requestAnimationFrame(() => $('#per-season')?.classList.add('go'));
        const v = val(c);
        const top = Math.max(...v);
        const peaks = v.map((x, i) => (x === top ? i : -1)).filter((i) => i >= 0);
        const p = peaks[0];
        const sn = peaks.map((i) => i + 1).join(' and ');
        $('#share-note').textContent = mode === 'share'
          ? `Peak: season ${sn}, with ${fmt.pct(c.perSeasonShare[p])} of the season's lines (${fmt.int(c.perSeason[p])}).`
          : `Most lines: season ${sn}, with ${fmt.int(c.perSeason[p])}, or ${fmt.pct(c.perSeasonShare[p])} of the season.`;
      };
      $('#cmp')?.addEventListener('change', () => { savePP(); drawCmp(); });
      $$('#ps-mode button').forEach((b) => b.addEventListener('click', () => {
        mode = b.dataset.m;
        pressed($$('#ps-mode button'), b);
        savePP();
        drawCmp();
      }));
      drawCmp();

      // Their own row of the attendance sheet, with the longest absence outlined.
      sheet($('#my-att'), D, [c.key], { rowH: 30, minCell: 0, labels: false, headH: 16, marks: longest.map((g) => ({ k: c.key, from: g.from, to: g.to })) });

      typewriter($('#quote'), c.quotes || []);
      $('#shuffle')?.addEventListener('click', () => typewriter($('#quote'), c.quotes || []));

      // Creed Thoughts: eight posts at a time.
      const feed = $('#thoughts');
      if (feed) {
        const th = creedThoughts(c);
        let shown = 0;
        const more = $('#more-thoughts');
        const add = (fromClick) => {
          const next8 = th.slice(shown, shown + 8);
          feed.insertAdjacentHTML('beforeend', next8.map((t, i) => {
            const e = E[t.ep];
            return `<article class="post" tabindex="-1" style="--d:${i * 0.05}s"><p class="post-d">${fmt.date(e.date)}</p><p class="post-t">${esc(t.t)}</p><p class="post-m">Filed under <a href="#/episode/${e.id}">${esc(e.t)}</a> · ${epCode(e)}</p></article>`;
          }).join(''));
          const firstNew = feed.children[shown];
          shown += next8.length;
          if (shown >= th.length) {
            // The button goes, so focus can't stay on it: hand it to the first new post instead of dropping it on <body>.
            more.replaceWith(Object.assign(document.createElement('p'), { className: 'small muted mt', textContent: `That's all ${th.length}.` }));
            if (fromClick) firstNew?.focus({ preventScroll: true });
          }
        };
        more.addEventListener('click', () => { add(true); save({ creed: shown }); });
        add(false);
        const want = Math.min(th.length, +saved.creed || 0);
        while (shown < want) add(false);
      }

      // The faces: the lines load only if someone asks, and only as many seasons as it takes to show four.
      // Scarn's first four are all in season 2, so the other three seasons wait for "Show all".
      const faceList = (D.faces || []).filter((x) => x.n && x.eps.length);
      $$('.face-go').forEach((b) => b.addEventListener('click', async () => {
        const f = faceList[+b.dataset.i];
        const box = $(`#face-${b.dataset.i}`);
        const re = FACE_RE[f.name] || new RegExp(`\\b${norm(f.name).trim()}\\b`);
        const eps = new Set(f.eps);
        const ss = [...new Set(f.eps.map((id) => E[id].s))];
        const hits = [];
        let done = 0;
        const more = async (upTo) => {
          while (done < ss.length && hits.length < upTo) {
            const rows = await lines(ss[done]);
            hits.push(...rows.filter((l) => eps.has(l[0]) && re.test(norm(l[2]))));
            done++;
          }
        };
        const ln = (l) => `<div class="ln"><span class="sp"><i class="dot" style="background:${color(l[1])}"></i>${esc(l[1])}</span><div><div class="tx">${esc(l[2])}</div><div class="meta">${epL(D, l[0])}</div></div></div>`;
        b.disabled = true;
        b.textContent = 'Opening the script…';
        try {
          await more(4);
          if (!box?.isConnected) return;
          box.innerHTML = hits.slice(0, 4).map(ln).join('')
            + (f.n > 4 ? `<button class="btn ghost face-all" type="button">Show all ${fmt.int(f.n)}</button>` : '');
          b.remove();
          const all = box.querySelector('.face-all');
          all?.addEventListener('click', async () => {
            all.disabled = true;
            all.textContent = 'Opening the rest…';
            try {
              await more(Infinity);
              if (!box.isConnected) return;
              box.classList.add('all');
              box.innerHTML = hits.map(ln).join('');
              box.querySelector('.ln')?.setAttribute('tabindex', '-1');
              box.querySelector('.ln')?.focus({ preventScroll: true });
            } catch (err) {
              if (!all.isConnected) return;
              all.disabled = false;
              all.textContent = "That didn't load. Try again";
            }
          });
        } catch (err) {
          if (!b.isConnected) return;
          b.disabled = false;
          b.textContent = "That didn't load. Try again";
        }
      }));
    },
  };
}

let typing = 0;
let lastQ = -1;
function typewriter(el, quotes) {
  if (!el || !quotes.length) return;
  let k;
  do { k = Math.floor(Math.random() * quotes.length); } while (quotes.length > 1 && k === lastQ);
  lastQ = k;
  const text = quotes[k];
  const id = ++typing;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
  let n = 0;
  const tick = () => {
    if (id !== typing || !el.isConnected) return;
    n = Math.min(text.length, n + 1 + Math.floor(Math.random() * 2));
    el.innerHTML = `${esc(text.slice(0, n))}<span class="caret"></span>`;
    if (n < text.length) setTimeout(tick, 18 + Math.random() * 26);
    else setTimeout(() => { if (id === typing) el.textContent = text; }, 900);
  };
  tick();
}

// ---------------------------------------------------------------- directors and writers

const GUESTS = ['J. J. Abrams', 'Joss Whedon', 'Harold Ramis', 'Jon Favreau', 'Jason Reitman', 'Bryan Cranston', 'Marc Webb', 'Amy Heckerling', 'Stephen Merchant'];
const RAW = { lo: 6.2, hi: 10, ticks: [6.5, 7, 7.5, 8, 8.5, 9, 9.5], f: (v) => v.toFixed(1) };
const VS = { lo: -2, hi: 2, ticks: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5], f: (v) => (v ? fmt.signed(v, 1) : '0') };

function dotTrack(ids, D, { dom = RAW, val = (e) => e.r, mean, se } = {}) {
  const x = (v) => ((Math.max(dom.lo, Math.min(dom.hi, v)) - dom.lo) / (dom.hi - dom.lo)) * 100;
  const avg = mean ?? ids.reduce((s, i) => s + val(D.episodes[i]), 0) / ids.length;
  const base = dom === VS ? `<b class="track-zero" style="left:${x(0)}%"></b>` : `<b class="track-show" style="left:${x(D.meta.avg)}%"></b>`;
  const whisk = se != null ? `<b class="track-se" style="left:${x(avg - se)}%;width:${x(avg + se) - x(avg - se)}%"></b>` : '';
  return `<div class="track">${base}${whisk}${ids.map((id, i) => `<i class="dp" data-id="${id}" style="left:${x(val(D.episodes[id]))}%;--d:${(0.1 + i * 0.025).toFixed(3)}s"></i>`).join('')}<b class="track-avg" style="left:${x(avg)}%"></b></div>`;
}
const axis = (dom) => `<span></span><div>${dom.ticks.map((v) => `<span class="${Math.abs(v * 2) % 2 === 1 ? 'minor' : ''}" style="left:${((v - dom.lo) / (dom.hi - dom.lo)) * 100}%">${dom.f(v)}</span>`).join('')}</div><span></span>`;

// How much bigger or smaller a cast member's character's share is in their own episodes, as a whole percentage.
const ccDiff = (p) => Math.round(Math.abs(p.shareMine / p.shareOther - 1) * 100);

// The strongest case only. The cards below give every person's numbers, so the prose doesn't list them again.
function castProse(D) {
  const real = D.castCrew.filter((p) => p.nMine >= 4)
    .sort((a, b) => Math.abs(Math.log(b.shareMine / b.shareOther)) - Math.abs(Math.log(a.shareMine / a.shareOther)));
  const p = real[0];
  if (!p || ccDiff(p) <= 10) return '';
  return `The biggest gap: in ${p.person}'s episodes, ${p.char}'s share of the lines is ${ccDiff(p)}% ${p.shareMine > p.shareOther ? 'bigger' : 'smaller'} (${fmt.pct(p.shareMine)} against ${fmt.pct(p.shareOther)}).`;
}

export function crew(D) {
  const show = D.meta.avg;
  const gd = { w: D.writers.find((w) => w.name === 'Greg Daniels'), d: D.directors.find((w) => w.name === 'Greg Daniels') };
  const ten = D.writers.filter((w) => w.eps.length >= 10).sort((a, b) => b.avg - a.avg);
  const four = D.writers.filter((w) => w.eps.length >= 4).sort((a, b) => b.vs - a.vs);
  const guests = D.directors.filter((d) => GUESTS.includes(d.name)).sort((a, b) => b.avg - a.avg || b.eps.length - a.eps.length);
  const ones = guests.filter((g) => g.eps.length === 1).length;
  const most = guests.reduce((a, b) => (b.eps.length > a.eps.length ? b : a), guests[0]);
  const residual = (e) => e.r - D.seasons[e.s - 1].avgRating;
  return {
    title: 'Directors and writers',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Behind the camera</p>
      <h1>Who made <em>the good ones.</em></h1>
      <p class="lede">${D.totals.directors} directors and ${D.totals.writers} writers worked on the show. Each dot below is one episode, placed by its rating; the thick tick is that person's average, the thin grey line the show's (${show.toFixed(2)}).</p>
    </section>
    <section class="wrap">
      <div class="card rv">
        <div class="card-head">
          <div class="toggle" role="group" aria-label="Role" id="role">
            <button type="button" class="on" aria-pressed="true" data-role="directors">Directors</button>
            <button type="button" aria-pressed="false" data-role="writers">Writers</button>
          </div>
          <div class="toggle" role="group" aria-label="Sort" id="sort">
            <button type="button" class="on" aria-pressed="true" data-s="avg">By average</button>
            <button type="button" aria-pressed="false" data-s="n">By episodes</button>
            <button type="button" aria-pressed="false" data-s="vs">Vs its season</button>
          </div>
        </div>
        <p class="card-sub mt" id="dots-intro"></p>
        <div class="dotplot-axis" id="dots-axis"></div>
        <div id="dots"></div>
      </div>
    </section>
    <section class="section wrap">
      <div class="section-head rv"><div><p class="eyebrow">Cast and crew</p><h2>The writers were in it.</h2></div></div>
      <p class="prose rv">Mindy Kaling, B. J. Novak and Paul Lieberstein wrote for the show and played Kelly, Ryan and Toby, and several of the leads directed later on. So I checked whether their own character gets more of the lines in the episodes they wrote or directed. ${esc(castProse(D))}</p>
      <div class="grid g4 mt" id="cc"></div>
    </section>
    <section class="wrap">
      <div class="grid g-7-5" style="align-items:start">
        <div class="card rv">
          <h3 class="card-title">Guest directors you might know</h3>
          <p class="card-sub">${ones} of the ${guests.length} directed one episode; ${esc(most.name)} did ${most.eps.length}.</p>
          <div id="guests"></div>
        </div>
        ${gd.w && gd.d ? `<div class="sticky-note rv" style="--d:.08s">Greg Daniels developed the show, wrote ${gd.w.eps.length} episodes and directed ${gd.d.eps.length}. His written episodes average <b>${gd.w.avg.toFixed(2)}</b>${ten[0] === gd.w ? ', the highest of anyone with ten or more' : ''}.${four[0] === gd.w ? ` Compared with their own seasons they come out ${fmt.signed(gd.w.vs)}, still first.` : ''}</div>` : ''}
      </div>
    </section>`,
    after() {
      // Role and sort live in this page's history entry, so Back from a person lands on the same list the reader
      // left, at the offset the router restores. A fresh link to the page starts from Directors, By average.
      const saved = history.state?.crew || {};
      let role = ['directors', 'writers'].includes(saved.role) ? saved.role : 'directors';
      let sort = ['avg', 'n', 'vs'].includes(saved.sort) ? saved.sort : 'avg';
      pressed($$('#role button'), $(`#role [data-role="${role}"]`));
      pressed($$('#sort button'), $(`#sort [data-s="${sort}"]`));
      const save = () => { try { history.replaceState({ ...(history.state || {}), crew: { role, sort } }, ''); } catch (err) { /* state is a nicety */ } };
      const drawDots = () => {
        const box = $('#dots');
        if (!box) return;
        const all = D[role].filter((p) => p.eps.length >= 4);
        const byAvg = [...all].sort((a, b) => b.avg - a.avg || b.eps.length - a.eps.length);
        const rows = sort === 'vs' ? [...all].sort((a, b) => b.vs - a.vs || b.eps.length - a.eps.length) : sort === 'n' ? [...all].sort((a, b) => b.eps.length - a.eps.length || b.avg - a.avg) : byAvg;
        const vs = sort === 'vs';
        // The data rounds both to two places, so ties are real (three writers at +0.01) and share a rank.
        const rAvg = ranks(all, (p) => p.avg), rVs = ranks(all, (p) => p.vs);
        $('#dots-intro').textContent = vs
          ? 'Raw averages mostly rank people by when they worked, so here each episode is measured against its own season. The tick is the average gap, the whisker one standard error, the middle line zero.'
          : 'People with at least four episodes. Hover or tap a dot for the episode; a name opens their page.';
        $('#dots-axis').innerHTML = axis(vs ? VS : RAW);
        box.innerHTML = rows.map((p, i) => {
          const move = rAvg.get(p) - rVs.get(p);
          return `<div class="dotplot-row rv" style="--d:${Math.min(i, 12) * 0.03}s">
          <a class="dn" href="#/person/${slug(p.name)}">${esc(p.name)}<small>${p.eps.length} episodes${vs ? `<span class="hide-sm">, ${move > 0 ? `up ${move}` : move < 0 ? `down ${-move}` : 'same place'}</span>` : ''}</small></a>
          ${vs ? dotTrack(p.eps, D, { dom: VS, val: residual, mean: p.vs, se: p.se }) : dotTrack(p.eps, D)}
          <span class="dv">${vs ? fmt.signed(p.vs) : p.avg.toFixed(2)}</span></div>`;
        }).join('');
        $$('#dots .dp').forEach((n) => {
          const e = D.episodes[+n.dataset.id];
          hover(n, () => epTip(e, vs ? `<div class="tr"><span>Season ${e.s} average</span><b>${D.seasons[e.s - 1].avgRating.toFixed(2)}</b></div><div class="tr"><span>Gap</span><b>${fmt.signed(residual(e))}</b></div>` : ''), `#/episode/${e.id}`);
        });
        requestAnimationFrame(() => $$('#dots .rv').forEach((n) => n.classList.add('in')));
      };
      $$('#role button').forEach((b) => b.addEventListener('click', () => {
        role = b.dataset.role;
        pressed($$('#role button'), b);
        save();
        drawDots();
      }));
      $$('#sort button').forEach((b) => b.addEventListener('click', () => {
        sort = b.dataset.s;
        pressed($$('#sort button'), b);
        save();
        drawDots();
      }));
      drawDots();

      $('#cc').innerHTML = D.castCrew.map((p, i) => {
        const what = [p.wrote.length && `wrote ${p.wrote.length}`, p.directed.length && `directed ${p.directed.length}`].filter(Boolean).join(', ');
        const who = callName(p.person);
        const d = ccDiff(p), dir = p.shareMine > p.shareOther ? 'bigger' : 'smaller';
        const verdict = p.nMine < 4 ? 'Too few episodes to mean much.'
          : d <= 10 ? `${esc(p.char)}'s share is about the same either way${d ? `, ${d}% ${dir}` : ''}.`
            : `${esc(p.char)}'s share is ${d}% ${dir} when ${esc(who)} is in charge.`;
        return `<div class="card cc-card rv" style="--d:${i * 0.04}s;--cc:${color(p.char)}">
          <div class="who"><span class="avatar">${esc(initials(p.person))}</span><div><a href="#/person/${slug(p.person)}" style="font-weight:650;text-decoration:none">${esc(p.person)}</a><div class="small muted">Plays <a href="#/character/${slug(p.char)}">${esc(p.char)}</a> · ${what}</div></div></div>
          <div class="vs">
            <div><b>${fmt.pct(p.shareMine)}</b><span>of the lines in ${esc(who)}'s ${fmt.plural(p.nMine, 'episode')} with ${esc(p.char)}</span></div>
            <div><b>${fmt.pct(p.shareOther)}</b><span>in every other ${esc(p.char)} episode</span></div>
          </div>
          <p class="small muted" style="margin:12px 0 0">${verdict}</p>
        </div>`;
      }).join('');

      $('#guests').innerHTML = `<div class="dotplot-axis">${axis(RAW)}</div>${guests.map((d, i) => `<div class="dotplot-row rv" style="--d:${i * 0.03}s">
        <a class="dn" href="#/person/${slug(d.name)}">${esc(d.name)}<small>${fmt.plural(d.eps.length, 'episode')}</small></a>
        ${dotTrack(d.eps, D)}
        <span class="dv">${d.avg.toFixed(2)}</span></div>`).join('')}`;
      $$('#guests .dp').forEach((n) => {
        const e = D.episodes[+n.dataset.id];
        hover(n, () => epTip(e), `#/episode/${e.id}`);
      });
    },
  };
}

// ---------------------------------------------------------------- one director or writer

// One person's episodes as lollipops, in air order. My own rather than charts.js lollipops(): that one labels a single
// best episode (so ties lose one) and an x label per episode, which collides on a phone once they span seasons.
function personChart(el, D, eps, avg) {
  const top = Math.max(...eps.map((e) => e.r));
  mount(el, (box, W) => {
    const H = W < 520 ? 230 : 270;
    const m = { t: 18, r: 8, b: 42, l: 28 };
    const lo = Math.min(6, Math.floor(Math.min(...eps.map((e) => e.r)) - 0.2));
    const y = (v) => m.t + ((10 - v) / (10 - lo)) * (H - m.t - m.b);
    const step = (W - m.l - m.r) / eps.length;
    const x = (i) => m.l + step * (i + 0.5);
    const base = y(lo);
    let b = '';
    for (let t = Math.ceil(lo); t <= 10; t++) b += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
    b += `<line class="pp-show" x1="${m.l}" x2="${W - m.r}" y1="${y(D.meta.avg)}" y2="${y(D.meta.avg)}"/>`;
    // Seasons as bands under the axis: a tick between them, the season under its run of episodes, and the
    // episode number over it when there's room.
    const runs = [];
    eps.forEach((e, i) => { const r = runs[runs.length - 1]; if (r && r.s === e.s) r.i1 = i; else runs.push({ s: e.s, i0: i, i1: i }); });
    runs.forEach((r, k) => {
      const x0 = m.l + step * r.i0, x1 = m.l + step * (r.i1 + 1), w = x1 - x0;
      if (k) b += `<line class="pp-sep" x1="${x0}" x2="${x0}" y1="${base + 4}" y2="${H - 2}"/>`;
      const lab = w >= 62 ? `Season ${r.s}` : w >= 22 ? `S${r.s}` : `${r.s}`;
      b += `<text class="pp-season" x="${(x0 + x1) / 2}" y="${H - 6}" text-anchor="middle">${lab}</text>`;
    });
    const showNo = step >= 24;
    eps.forEach((e, i) => {
      const cx = x(i), isTop = e.r === top;
      b += `<g class="mark" data-i="${i}">
        <line class="grow-y" x1="${cx}" x2="${cx}" y1="${base}" y2="${y(e.r)}" style="stroke:${isTop ? 'var(--accent)' : 'var(--line-2)'};--d:${i * 0.03}s" stroke-width="2" stroke-linecap="round"/>
        <circle class="pop" cx="${cx}" cy="${y(e.r)}" r="${step > 22 ? 6 : 4.5}" style="fill:${isTop ? 'var(--accent)' : 'var(--surface)'};stroke:var(--accent);--d:${0.3 + i * 0.03}s" stroke-width="2"/>
        <rect class="hit" x="${cx - step / 2}" y="${m.t - 10}" width="${step}" height="${H - m.t - 10}"/>
      </g>`;
      if (showNo) b += `<text x="${cx}" y="${H - 24}" text-anchor="middle">${esc(step >= 36 ? e.se : e.se.split('-')[0])}</text>`;
    });
    b += `<line class="avgline draw" x1="${m.l}" x2="${W - m.r}" y1="${y(avg)}" y2="${y(avg)}" pathLength="1" style="--d:.6s"/>`;
    // Name the best ones on the chart only when every label fits without hitting the edge or another label.
    const best = eps.map((e, i) => ({ e, i })).filter((o) => o.e.r === top);
    const labs = best.map(({ e, i }) => {
      const text = `${e.t} · ${e.r.toFixed(1)}`, w = text.length * 7;
      const start = x(i) + 10 + w <= W - m.r;
      const a0 = start ? x(i) + 10 : x(i) - 10 - w;
      return { text, a0, a1: a0 + w, ok: a0 >= m.l, start, cx: x(i), cy: y(e.r) };
    });
    const fits = labs.every((l) => l.ok) && labs.every((l, i) => labs.every((o, j) => i === j || o.a1 + 6 < l.a0 || l.a1 + 6 < o.a0));
    if (fits && labs.length <= 3) labs.forEach((l) => { b += `<text class="lbl-strong" x="${l.start ? l.cx + 10 : l.cx - 10}" y="${l.cy - 8}" text-anchor="${l.start ? 'start' : 'end'}">${esc(l.text)}</text>`; });
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`IMDb rating of each of their ${eps.length} episodes, in air order`)}">${b}</svg>`;
    $$('.mark', box).forEach((n) => {
      const e = eps[+n.dataset.i];
      hover(n, () => epTip(e, `<div class="tr"><span>Their average</span><b>${avg.toFixed(2)}</b></div>`), `#/episode/${e.id}`);
      n.addEventListener('pointerenter', () => { box.classList.add('dim'); n.classList.add('hl'); });
      n.addEventListener('pointerleave', () => { box.classList.remove('dim'); n.classList.remove('hl'); });
    });
  });
}

export function person(D, key) {
  const p = D.people[key];
  if (!p) return null;
  const ids = [...new Set(Object.values(p.roles).flatMap((r) => r.eps))].sort((a, b) => a - b);
  const eps = ids.map((i) => D.episodes[i]);
  const avg = eps.reduce((s, e) => s + e.r, 0) / eps.length;
  const vsSeason = eps.reduce((s, e) => s + e.r - D.seasons[e.s - 1].avgRating, 0) / eps.length;
  const topR = Math.max(...eps.map((e) => e.r));
  const best = eps.filter((e) => e.r === topR);
  const roles = Object.keys(p.roles);
  const cast = D.castCrew.find((c) => c.person === p.name);
  const y0 = eps[0].date.slice(0, 4), y1 = eps[eps.length - 1].date.slice(0, 4);
  const when = y0 === y1 ? `in ${y0}` : `${y0} to ${y1}`;
  const did = roles.map((r, i) => {
    const n = p.roles[r].eps.length;
    const v = r === 'Director' ? 'directed' : 'wrote';
    return `${i ? v : v[0].toUpperCase() + v.slice(1)} ${fmt.plural(n, 'episode')}`;
  }).join(' and ');
  const links = best.map((e) => epA(D, e.id));
  const bestText = eps.length < 2 ? ''
    : best.length === eps.length ? ` ${eps.length === 2 ? 'Both' : `All ${eps.length}`} rate ${topR.toFixed(1)}.`
      : best.length > 1 ? ` The best of them are ${andList(links)}, tied at ${topR.toFixed(1)}.`
        : ` The best of them is ${links[0]} at ${topR.toFixed(1)}.`;
  const seasons = [...new Set(eps.map((e) => e.s))];
  const row = (e) => epRow(e, D).replace(/<span class="ep-no">[^<]*<\/span>/, `<span class="ep-no pp-epno"><small>S${e.s}</small>${esc(e.se.split('-')[0])}</span>`);
  return {
    title: p.name,
    html: `
    <section class="wrap page-head">
      <div class="crumbs"><a href="#/crew">Directors and writers</a><span>/</span><span>${esc(p.name)}</span></div>
      <p class="eyebrow">${roles.join(' and ')}${cast ? ` · also plays ${esc(cast.char)}` : ''}</p>
      <h1 style="font-size:clamp(42px,7vw,84px)">${esc(p.name)}</h1>
      <p class="lede">${did}, ${when}.${bestText}</p>
    </section>
    <section class="wrap">
      <div class="stats pp-stats rv">
        <div class="stat"><div class="stat-label">Episodes</div><div class="stat-value">${count(eps.length)}</div></div>
        <div class="stat"><div class="stat-label">Average IMDb</div><div class="stat-value">${count(avg, 2)}</div><div class="stat-note ${avg >= D.meta.avg ? 'delta-up' : 'delta-down'}">${fmt.signed(avg - D.meta.avg)} vs the show</div></div>
        <div class="stat"><div class="stat-label">Vs its season</div><div class="stat-value">${fmt.signed(vsSeason)}</div><div class="stat-note">average gap from each episode's own season</div></div>
        <div class="stat"><div class="stat-label">Average viewers</div><div class="stat-value">${count(eps.reduce((s, e) => s + e.v, 0) / eps.length, 1)}<small>M</small></div></div>
        ${seasons.length === 1
    ? `<div class="stat"><div class="stat-label">Season</div><div class="stat-value">${seasons[0]}</div><div class="stat-note">${eps.length === 1 ? 'just the one episode' : `all ${eps.length} episodes`}</div></div>`
    : `<div class="stat"><div class="stat-label">Seasons</div><div class="stat-value">${seasons.length}</div><div class="stat-note">${andList(seasons.map(String))}</div></div>`}
      </div>
    </section>
    <section class="section wrap">
      ${eps.length > 1 ? `<div class="card rv"><h3 class="card-title">Their episodes, in air order</h3><p class="card-sub">IMDb rating of each one. Hover or tap a lollipop for the episode.</p>
        <div class="legend pp-legend"><span><i class="ring" style="background:var(--accent)"></i>${best.length > 1 ? `Best, ${best.length} tied` : 'Best'} (${topR.toFixed(1)})</span><span><i style="background:var(--ink)"></i>Their average (${avg.toFixed(2)})</span><span><i class="pp-dash"></i>The show's average (${D.meta.avg.toFixed(2)})</span></div>
        <div id="pl"></div></div>` : ''}
      <div class="ep-list rv mt">${eps.map(row).join('')}</div>
    </section>`,
    after() { if (eps.length > 1) personChart($('#pl'), D, eps, avg); },
  };
}

export { tableView };
