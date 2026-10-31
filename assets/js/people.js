import { $, $$, esc, fmt, slug, color, initials, count, hbars, words, epCode, hover, tableView } from './ui.js';
import { columns, lollipops, epTip } from './charts.js';
import { badges, epRow } from './pages.js';

// ---------------------------------------------------------------- all characters

const METRICS = {
  lines: { label: 'Lines', f: (c) => c.lines, fmt: (v) => fmt.int(v), note: 'Total lines across the show.' },
  episodes: { label: 'Episodes', f: (c) => c.episodes, fmt: (v) => fmt.int(v), note: 'Episodes with at least one line.' },
  wordsPerLine: { label: 'Words per line', f: (c) => c.wordsPerLine, fmt: (v) => fmt.dec(v), note: 'How long they go on once they start.' },
  questionPct: { label: 'Questions', f: (c) => c.questionPct, fmt: (v) => fmt.pct(v), note: 'Share of their lines that end in a question mark.' },
  exclaimPct: { label: 'Exclamations', f: (c) => c.exclaimPct, fmt: (v) => fmt.pct(v), note: 'Share of their lines with an exclamation mark.' },
  mentioned: { label: 'Named by others', f: (c) => c.mentioned, fmt: (v) => fmt.int(v), note: 'Times someone else says their first name.' },
};

export function characters(D) {
  return {
    title: 'Characters',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Characters</p>
      <h1>Everyone with <em>a desk.</em></h1>
      <p class="lede">The ${D.characters.length} people with the most to say, plus a couple who mostly said things in the warehouse. Pick one for the full file.</p>
    </section>
    <section class="wrap">${badges(D, D.characters)}</section>
    <section class="section wrap">
      <div class="card rv">
        <div class="card-head">
          <div><h3 class="card-title" id="m-title">Lines</h3><p class="card-sub" id="m-note"></p></div>
          <div class="pills" id="m-pills">${Object.entries(METRICS).map(([k, m], i) => `<button class="pill" aria-pressed="${i === 0}" data-k="${k}">${m.label}</button>`).join('')}</div>
        </div>
        <div id="m-bars"></div>
      </div>
    </section>`,
    after() {
      const drawM = (k) => {
        const M = METRICS[k];
        $('#m-title').textContent = M.label;
        $('#m-note').textContent = M.note;
        const rows = [...D.characters].sort((a, b) => M.f(b) - M.f(a)).map((c) => ({ label: c.key, v: M.f(c), color: color(c.key), dot: color(c.key), k: c.key }));
        $('#m-bars').innerHTML = hbars(rows, { fmtv: M.fmt, href: (r) => `#/character/${slug(r.k)}` });
        requestAnimationFrame(() => requestAnimationFrame(() => $('#m-bars .hbars').classList.add('go')));
      };
      $$('#m-pills .pill').forEach((b) => b.addEventListener('click', () => {
        $$('#m-pills .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        drawM(b.dataset.k);
      }));
      drawM('lines');
    },
  };
}

// ---------------------------------------------------------------- one character

export function character(D, key) {
  const c = D.charSlug[key];
  if (!c) return null;
  const cc = color(c.key);
  const first = D.episodes[c.first], last = D.episodes[c.last];
  const i = D.characters.indexOf(c);
  const prev = D.characters[i - 1], next = D.characters[i + 1];
  const corr = c.ratingCorr;
  const corrText = corr == null ? '' : Math.abs(corr) < 0.1
    ? `How much ${c.key} talks in an episode has almost nothing to do with how it rated (r = ${corr.toFixed(2)}).`
    : corr < 0
      ? `Episodes where ${c.key} talks more tended to rate lower (r = ${corr.toFixed(2)}). ${c.key === 'Andy' || c.key === 'Nellie' || c.key === 'Robert' || c.key === 'Erin' ? 'Most of their big episodes are in seasons 8 and 9, which rated lower across the board, so the seasons are doing a lot of this.' : 'It is a weak relationship, so don’t read much into it.'}`
      : `Episodes where ${c.key} talks more tended to rate a little higher (r = ${corr.toFixed(2)}).`;
  const totalBy = D.seasons.map((s) => s.lines);
  return {
    title: c.name,
    html: `
    <section class="wrap page-head" style="--cc:${cc}">
      <div class="crumbs"><a href="#/characters">Characters</a><span>/</span><span>${esc(c.name)}</span></div>
      <div class="char-hero">
        <span class="avatar" style="--cc:${cc}">${esc(initials(c.name))}</span>
        <div>
          <p class="eyebrow">${D.characters.indexOf(c) + 1}${['st', 'nd', 'rd'][D.characters.indexOf(c)] || 'th'} most lines</p>
          <h1 style="font-size:clamp(42px,7vw,88px)">${esc(c.name)}</h1>
          <p class="lede">${esc(c.blurb)}</p>
          <p class="actor">Played by ${esc(c.actor)}. First line in <a href="#/episode/${first.id}">${esc(first.t)}</a> (${epCode(first)}), last in <a href="#/episode/${last.id}">${esc(last.t)}</a> (${epCode(last)}).</p>
        </div>
      </div>
    </section>
    <section class="wrap">
      <div class="stats rv">
        <div class="stat"><div class="stat-label">Lines</div><div class="stat-value">${count(c.lines)}</div><div class="stat-note">${fmt.pct(c.share)} of the whole show</div></div>
        <div class="stat"><div class="stat-label">Words</div><div class="stat-value">${count(c.words)}</div><div class="stat-note">${fmt.dec(c.wordsPerLine)} per line</div></div>
        <div class="stat"><div class="stat-label">Episodes</div><div class="stat-value">${count(c.episodes)}</div><div class="stat-note">of ${D.episodes.length}</div></div>
        <div class="stat"><div class="stat-label">Questions</div><div class="stat-value">${count(c.questionPct, 1, '%')}</div><div class="stat-note">of lines end in "?"</div></div>
        <div class="stat"><div class="stat-label">Named by others</div><div class="stat-value">${count(c.mentioned)}</div><div class="stat-note">times someone says "${esc(c.key.split(' ')[0])}"</div></div>
      </div>
    </section>
    <section class="section wrap">
      <div class="card rv">
        <div class="card-head">
          <div><h3 class="card-title">Lines per season</h3><p class="card-sub">Compare with someone else if you want.</p></div>
          <select class="select" id="cmp" aria-label="Compare with">
            <option value="">Compare with…</option>
            ${D.characters.filter((x) => x !== c).map((x) => `<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('')}
          </select>
        </div>
        <div class="legend" id="cmp-legend"></div>
        <div id="per-season"></div>
        <div class="flex small muted mt" id="share-note"></div>
      </div>
      <div class="grid g2 mt">
        <div class="card rv">
          <h3 class="card-title">Words that are very ${esc(c.key)}</h3>
          <p class="card-sub">Words ${esc(c.key)} uses far more than everyone else does, after adjusting for how much they talk. The small number is how many times.</p>
          ${words(c.signature, 14)}
        </div>
        <div class="card rv" style="--d:.06s">
          <h3 class="card-title">Who answers ${esc(c.key)}</h3>
          <p class="card-sub">After ${esc(c.key)} says something, who speaks next.</p>
          ${hbars(c.follows.map((f) => ({ label: f.k, v: f.n, color: color(f.k), dot: color(f.k), k: f.k })), { href: (r) => (D.char[r.k] ? `#/character/${slug(r.k)}` : null) })}
        </div>
      </div>
      <div class="card rv mt" style="--cc:${cc}">
        <div class="card-head">
          <div><h3 class="card-title">${esc(c.key)}, in ${esc(c.key)}'s words</h3><p class="card-sub">A random line from the script. Hit the button for another.</p></div>
          <button class="btn ghost" id="shuffle">Another one</button>
        </div>
        <p class="quote" id="quote" aria-live="polite"></p>
      </div>
      <div class="grid g2 mt">
        <div class="card rv">
          <h3 class="card-title">${esc(c.key)}'s biggest episodes</h3>
          <p class="card-sub">Where they had the largest share of the lines.</p>
          ${hbars(c.bigEpisodes.map((b) => ({ label: D.episodes[b.id].t, v: b.pct, color: cc, id: b.id })), { fmtv: (v) => fmt.pct(v), href: (r) => `#/episode/${r.id}` })}
          <p class="small muted mt">${esc(corrText)}</p>
        </div>
        <div class="card rv" style="--d:.06s">
          <h3 class="card-title">Most-said short lines</h3>
          <p class="card-sub">Lines of four words or fewer.</p>
          ${hbars(c.topShort.map((t) => ({ label: t.t, v: t.n, color: cc })))}
          <h3 class="card-title mt">Longest single line</h3>
          <p class="card-sub">${fmt.int(c.longestWords)} words without stopping.</p>
          <div class="script"><div class="tx">${esc(c.longest)}</div></div>
        </div>
      </div>
      <div class="pager">
        ${prev ? `<a href="#/character/${slug(prev.key)}"><small>Previous</small><span>${esc(prev.name)}</span></a>` : '<span style="flex:1"></span>'}
        ${next ? `<a class="next" href="#/character/${slug(next.key)}"><small>Next</small><span>${esc(next.name)}</span></a>` : '<span style="flex:1"></span>'}
      </div>
    </section>`,
    after() {
      const cats = D.seasons.map((s) => `S${s.n}`);
      const drawCmp = () => {
        const other = D.char[$('#cmp').value];
        const series = [{ name: c.key, color: cc, values: c.perSeason }];
        if (other) series.push({ name: other.key, color: other.key === c.key ? 'var(--ink-3)' : (color(other.key) === cc ? 'var(--ink-3)' : color(other.key)), values: other.perSeason });
        $('#cmp-legend').innerHTML = series.length > 1 ? series.map((s) => `<span><i class="sq" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('') : '';
        const el = $('#per-season');
        el.replaceWith(Object.assign(document.createElement('div'), { id: 'per-season' }));
        columns($('#per-season'), { cats, series, href: (it) => `#/season/${it.ci + 1}` });
        requestAnimationFrame(() => $('#per-season').classList.add('go'));
        const peak = c.perSeason.indexOf(Math.max(...c.perSeason));
        $('#share-note').textContent = `Peak: season ${peak + 1}, with ${fmt.int(c.perSeason[peak])} lines, ${fmt.pct((c.perSeason[peak] / totalBy[peak]) * 100)} of everything said that season.`;
      };
      $('#cmp').addEventListener('change', drawCmp);
      drawCmp();
      typewriter($('#quote'), c.quotes);
      $('#shuffle').addEventListener('click', () => typewriter($('#quote'), c.quotes));
    },
  };
}

let typing = 0;
let lastQ = -1;
function typewriter(el, quotes) {
  if (!quotes.length) return;
  let k;
  do { k = Math.floor(Math.random() * quotes.length); } while (quotes.length > 1 && k === lastQ);
  lastQ = k;
  const text = quotes[k];
  const id = ++typing;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
  let n = 0;
  const tick = () => {
    if (id !== typing) return;
    n = Math.min(text.length, n + 1 + Math.floor(Math.random() * 2));
    el.innerHTML = `${esc(text.slice(0, n))}<span class="caret"></span>`;
    if (n < text.length) setTimeout(tick, 18 + Math.random() * 26);
    else setTimeout(() => { if (id === typing) el.textContent = text; }, 900);
  };
  tick();
}

// ---------------------------------------------------------------- directors and writers

const GUESTS = ['J. J. Abrams', 'Joss Whedon', 'Harold Ramis', 'Jon Favreau', 'Jason Reitman', 'Bryan Cranston', 'Marc Webb', 'Amy Heckerling', 'Stephen Merchant'];

export function crew(D) {
  const show = D.meta.avg;
  return {
    title: 'Directors and writers',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Behind the camera</p>
      <h1>Who made <em>the good ones.</em></h1>
      <p class="lede">${D.totals.directors} directors and ${D.totals.writers} writers worked on the show. Some of the writers were also in it. Each dot below is one episode, placed by its rating. The black tick is that person's average, the grey one is the show's (${show.toFixed(2)}).</p>
    </section>
    <section class="wrap">
      <div class="card rv">
        <div class="card-head">
          <div class="toggle" role="tablist">
            <button class="on" data-role="directors" role="tab">Directors</button>
            <button data-role="writers" role="tab">Writers</button>
          </div>
          <div class="toggle" role="tablist" id="sort">
            <button class="on" data-s="avg">By average</button>
            <button data-s="n">By episodes</button>
          </div>
        </div>
        <p class="card-sub mt">People with at least four episodes. Hover a dot for the episode, click a name for their page.</p>
        <div class="dotplot-axis"><span></span><div>${[6.5, 7, 7.5, 8, 8.5, 9, 9.5].map((v) => `<span style="left:${((v - 6.2) / 3.8) * 100}%">${v.toFixed(1)}</span>`).join('')}</div><span></span></div>
        <div id="dots"></div>
      </div>
    </section>
    <section class="section wrap">
      <div class="section-head rv"><div><p class="eyebrow">Cast and crew</p><h2>The writers were in it.</h2></div></div>
      <p class="prose rv">Mindy Kaling, B. J. Novak and Paul Lieberstein were on the writing staff and also played Kelly, Ryan and Toby. Several of the leads directed later on. So I checked whether their own character talks more in episodes they wrote or directed. Paul Lieberstein writes Toby a lot less. Mindy Kaling gives Kelly a bit more.</p>
      <div class="grid g4 mt" id="cc"></div>
    </section>
    <section class="wrap">
      <div class="grid g-7-5" style="align-items:start">
        <div class="card rv">
          <h3 class="card-title">Guest directors you might know</h3>
          <p class="card-sub">The show hired film directors for one or two episodes at a time.</p>
          <div id="guests"></div>
        </div>
        <div class="sticky-note rv" style="--d:.08s">Greg Daniels developed the show, wrote ${D.writers.find((w) => w.name === 'Greg Daniels')?.eps.length} episodes and directed ${D.directors.find((w) => w.name === 'Greg Daniels')?.eps.length}. His written episodes average <b>${D.writers.find((w) => w.name === 'Greg Daniels')?.avg}</b>, the highest of anyone with ten or more.</div>
      </div>
    </section>`,
    after() {
      let role = 'directors', sort = 'avg';
      const drawDots = () => {
        const rows = D[role].filter((p) => p.eps.length >= 4).sort((a, b) => (sort === 'avg' ? b.avg - a.avg : b.eps.length - a.eps.length || b.avg - a.avg));
        $('#dots').innerHTML = rows.map((p, i) => `<div class="dotplot-row rv" style="--d:${Math.min(i, 12) * 0.03}s">
          <a class="dn" href="#/person/${slug(p.name)}">${esc(p.name)}<small>${p.eps.length} episodes</small></a>
          ${dotTrack(p.eps, D)}
          <span class="dv">${p.avg.toFixed(2)}</span></div>`).join('');
        $$('#dots .dp').forEach((n) => {
          const e = D.episodes[+n.dataset.id];
          hover(n, () => epTip(e), `#/episode/${e.id}`);
        });
        requestAnimationFrame(() => $$('#dots .rv').forEach((n) => n.classList.add('in')));
      };
      $$('.toggle [data-role]').forEach((b) => b.addEventListener('click', () => {
        role = b.dataset.role;
        $$('.toggle [data-role]').forEach((x) => x.classList.toggle('on', x === b));
        drawDots();
      }));
      $$('#sort button').forEach((b) => b.addEventListener('click', () => {
        sort = b.dataset.s;
        $$('#sort button').forEach((x) => x.classList.toggle('on', x === b));
        drawDots();
      }));
      drawDots();

      $('#cc').innerHTML = D.castCrew.map((p, i) => {
        const n = new Set([...p.wrote, ...p.directed]).size;
        const what = [p.wrote.length && `wrote ${p.wrote.length}`, p.directed.length && `directed ${p.directed.length}`].filter(Boolean).join(', ');
        const up = p.shareMine > p.shareOther;
        return `<div class="card cc-card rv" style="--d:${i * 0.04}s;--cc:${color(p.char)}">
          <div class="who"><span class="avatar">${esc(initials(p.person))}</span><div><a href="#/person/${slug(p.person)}" style="font-weight:650;text-decoration:none">${esc(p.person)}</a><div class="small muted">Plays <a href="#/character/${slug(p.char)}">${esc(p.char)}</a> · ${what}</div></div></div>
          <div class="vs">
            <div><b>${fmt.pct(p.shareMine)}</b><span>${esc(p.char)}'s share in their ${n} episode${n > 1 ? 's' : ''}</span></div>
            <div><b>${fmt.pct(p.shareOther)}</b><span>in everyone else's</span></div>
          </div>
          <p class="small muted" style="margin:12px 0 0">${n < 4 ? 'Too few episodes to mean much.' : up ? `${esc(p.char)} talks more when ${esc(p.person.split(' ')[0])} is in charge.` : `${esc(p.char)} talks less when ${esc(p.person.split(' ')[0])} is in charge.`}</p>
        </div>`;
      }).join('');

      const guests = D.directors.filter((d) => GUESTS.includes(d.name)).map((d) => ({ label: d.name, v: d.avg, color: 'var(--accent)', name: d.name, n: d.eps.length }))
        .sort((a, b) => b.v - a.v);
      $('#guests').innerHTML = hbars(guests, { max: 10, fmtv: (v, r) => `${v.toFixed(1)}`, href: (r) => `#/person/${slug(r.name)}` });
    },
  };
}

function dotTrack(ids, D) {
  const lo = 6.2, hi = 10;
  const x = (v) => ((v - lo) / (hi - lo)) * 100;
  const avg = ids.reduce((s, i) => s + D.episodes[i].r, 0) / ids.length;
  return `<div class="track"><b class="track-show" style="left:${x(D.meta.avg)}%"></b>${ids.map((id, i) => `<i class="dp" data-id="${id}" style="left:${x(D.episodes[id].r)}%;--d:${(0.1 + i * 0.025).toFixed(3)}s"></i>`).join('')}<b class="track-avg" style="left:${x(avg)}%"></b></div>`;
}

// ---------------------------------------------------------------- one director or writer

export function person(D, key) {
  const p = D.people[key];
  if (!p) return null;
  const ids = [...new Set(Object.values(p.roles).flatMap((r) => r.eps))].sort((a, b) => a - b);
  const eps = ids.map((i) => D.episodes[i]);
  const avg = eps.reduce((s, e) => s + e.r, 0) / eps.length;
  const best = eps.reduce((a, b) => (b.r > a.r ? b : a));
  const roles = Object.keys(p.roles);
  const cast = D.castCrew.find((c) => c.person === p.name);
  const span = `${eps[0].date.slice(0, 4)} to ${eps[eps.length - 1].date.slice(0, 4)}`;
  return {
    title: p.name,
    html: `
    <section class="wrap page-head">
      <div class="crumbs"><a href="#/crew">Directors and writers</a><span>/</span><span>${esc(p.name)}</span></div>
      <p class="eyebrow">${roles.join(' and ')}${cast ? ` · also plays ${esc(cast.char)}` : ''}</p>
      <h1 style="font-size:clamp(42px,7vw,84px)">${esc(p.name)}</h1>
      <p class="lede">${roles.map((r) => `${r === 'Director' ? 'Directed' : 'Wrote'} ${p.roles[r].eps.length} episode${p.roles[r].eps.length > 1 ? 's' : ''}`).join(' and ')}, ${span}.${eps.length > 1 ? ` The best of them is <a href="#/episode/${best.id}">${esc(best.t)}</a> at ${best.r.toFixed(1)}.` : ''}</p>
    </section>
    <section class="wrap">
      <div class="stats rv">
        <div class="stat"><div class="stat-label">Episodes</div><div class="stat-value">${count(eps.length)}</div></div>
        <div class="stat"><div class="stat-label">Average IMDb</div><div class="stat-value">${count(avg, 2)}</div><div class="stat-note ${avg >= D.meta.avg ? 'delta-up' : 'delta-down'}">${fmt.signed(avg - D.meta.avg)} vs the show</div></div>
        <div class="stat"><div class="stat-label">Average viewers</div><div class="stat-value">${count(eps.reduce((s, e) => s + e.v, 0) / eps.length, 1)}<small>M</small></div></div>
        <div class="stat"><div class="stat-label">Seasons</div><div class="stat-value">${[...new Set(eps.map((e) => e.s))].length}</div><div class="stat-note">${[...new Set(eps.map((e) => e.s))].join(', ')}</div></div>
      </div>
    </section>
    <section class="section wrap">
      ${eps.length > 1 ? `<div class="card rv"><h3 class="card-title">Their episodes, in air order</h3><p class="card-sub">The line is their average. Labels are episode numbers within each season.</p><div id="pl"></div></div>` : ''}
      <div class="ep-list rv mt">${eps.map((e) => epRow(e, D).replace(`<span class="ep-no">${e.e}</span>`, `<span class="ep-no" style="font-size:15px">${e.s}.${e.e}</span>`)).join('')}</div>
    </section>`,
    after() { if (eps.length > 1) lollipops($('#pl'), eps, { avg, label: `${p.name}'s episodes` }); },
  };
}

export { tableView };
