import { $, esc, fmt, slug, color, initials, count, hbars, words, arrow, epCode, tableView, hasSlot } from './ui.js';
import { skyline, spark, lollipops, barcode, seqThumb, columns, mount } from './charts.js';

const BLURB = {
  1: 'Six episodes, shot close to the British original. Michael is meaner here, and a second season was not a sure thing.',
  2: 'The show finds its voice. Michael gets softer, Jim and Pam get complicated, and it ends at Casino Night.',
  3: 'Jim transfers to Stamford and comes back with Karen and Andy. The branches merge. Highest average rating of any season.',
  4: 'Cut short by the 2007-08 writers’ strike, with four hour-long episodes up front. Ryan goes to corporate and Toby goes to Costa Rica.',
  5: 'The longest season. Holly arrives, a Super Bowl episode pulls 22.9 million viewers, and Michael quits to start a rival paper company.',
  6: 'Jim and Pam get married at Niagara Falls and have a baby. Jim becomes co-manager. Sabre buys Dunder Mifflin.',
  7: 'Michael’s last season. Holly comes back, he proposes, and he leaves for Colorado in Goodbye, Michael.',
  8: 'Andy is manager, Robert California is CEO, and part of the season moves to Tallahassee. Lowest-rated season.',
  9: 'The documentary airs. Andy sails away, Jim splits his time with Philadelphia, and the finale brings back almost everyone.',
};

const epRow = (e, D) => `
  <a class="ep-row" href="#/episode/${e.id}">
    <span class="ep-no">${e.e}</span>
    <span style="min-width:0">
      <span class="ep-t">${esc(e.t)}</span>${flags(e)}
      <span class="ep-m" style="display:block">${fmt.date(e.date)} · Dir. ${esc(e.dir.join(', '))} · Wr. ${esc(e.wri.join(', '))}</span>
    </span>
    ${seqThumb(e, D)}
    <span class="rating">${e.r.toFixed(1)}</span>
    <span class="ep-go" aria-hidden="true">→</span>
  </a>`;

const flags = (e) => {
  const f = [];
  if (e.hour) f.push('<span class="flag alt">1 HR</span>');
  if (e.twss || e.twssWiki) f.push('<span class="flag" title="That’s what she said">TWSS</span>');
  return f.length ? `<span class="ep-flags">${f.join('')}</span>` : '';
};

// ---------------------------------------------------------------- home

export function home(D) {
  const T = D.totals;
  const F = D.findings;
  const best = [...D.episodes].sort((a, b) => b.r - a.r).slice(0, 2);
  const andy = D.char.Andy;
  const bbbg = D.phrases.find((p) => p.label.startsWith('Bears'));
  const bbEp = bbbg?.topEp[0] ? D.episodes[bbbg.topEp[0].id] : null;
  return {
    title: '',
    html: `
    <section class="hero">
      <div class="wrap">
        <div class="hero-row page-head" style="padding:0">
          <div>
            <p class="eyebrow">A fan analysis · 2005 to 2013</p>
            <h1>The Office, <em>by the numbers.</em></h1>
            <p class="lede">Nine seasons, ${T.episodes} episodes and ${fmt.int(T.lines)} lines of dialogue. I counted who said what, who wrote it, who directed it, and how people rated it. Some of it confirms what fans already think. Some of it doesn't.</p>
            <div class="hero-actions">
              <a class="btn" href="#/seasons">Pick a season ${arrow}</a>
              <a class="btn ghost" href="#/characters">Pick a character</a>
            </div>
          </div>
          <div class="hero-counters">
            <div><b>${count(T.episodes)}</b><span>episodes</span></div>
            <div><b>${count(T.lines)}</b><span>lines of dialogue</span></div>
            <div><b>${count(T.words)}</b><span>words spoken</span></div>
            <div><b>${count(T.directors)}</b><span>directors, ${T.writers} writers</span></div>
          </div>
        </div>
        <div class="skyline-wrap rv">
          <div class="skyline-cap">
            <span><b>Every episode, rated.</b> One bar per episode in air order, height is the IMDb score. <span style="color:var(--accent);font-weight:600">Blue</span> has Michael.</span>
            <span>Top: ${best.map((e) => `<a href="#/episode/${e.id}">${esc(e.t)}</a>`).join(' and ')}, ${best[0].r.toFixed(1)}</span>
          </div>
          <div id="sky"></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head rv">
          <div><p class="eyebrow">Seasons</p><h2>Pick a season.</h2></div>
          <a class="link-arrow" href="#/seasons">All nine side by side</a>
        </div>
        <div class="season-rail">
          ${D.seasons.map((s, i) => seasonCard(s, D, i)).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head rv">
          <div><p class="eyebrow">Characters</p><h2>Or pick a person.</h2></div>
          <a class="link-arrow" href="#/characters">Compare everyone</a>
        </div>
        ${badges(D, D.characters.slice(0, 12))}
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head rv">
          <div><p class="eyebrow">Findings</p><h2>Four things the data says.</h2></div>
          <a class="link-arrow" href="#/findings">The full write-up</a>
        </div>
        <div class="grid g4">
          <a class="card teaser rv" href="#/findings@michael">
            <span class="big">${fmt.signed(F.michaelRating.meanB - F.michaelRating.meanA)}</span>
            <p>IMDb points lost after Michael leaves. The average goes from ${F.michaelRating.meanA} to ${F.michaelRating.meanB}, and viewers drop from ${fmt.m(F.michaelViewers.meanA)} to ${fmt.m(F.michaelViewers.meanB)}.</p>
            <span class="link-arrow">The Michael effect</span>
          </a>
          <a class="card teaser rv" style="--d:.06s" href="#/findings@twss">
            <span class="big">${F.twssLines}</span>
            <p>Times someone says "that's what she said". Episodes with it rate higher, until you notice Michael says ${F.twssBy[0].n} of them.</p>
            <span class="link-arrow">That's what she said</span>
          </a>
          <a class="card teaser rv" style="--d:.12s" href="#/findings@hour">
            <span class="big">${fmt.signed(F.hour.meanA - F.hour.meanB)}</span>
            <p>Hour-long episodes rate this much higher than regular ones. The show saved its big moments for them.</p>
            <span class="link-arrow">Double episodes</span>
          </a>
          <a class="card teaser rv" style="--d:.18s" href="#/findings@andy">
            <span class="big">${fmt.signed(andy.ratingCorr)}</span>
            <p>Correlation between how much Andy talks in an episode and its rating. Strong, and mostly not his fault.</p>
            <span class="link-arrow">The Andy problem</span>
          </a>
        </div>
        ${bbEp ? `<div class="grid g-7-5 mt2" style="align-items:center">
          <div class="prose rv"><p><strong>The most quoted line in the show is said once.</strong> "Bears. Beets. Battlestar Galactica." appears a single time in ${fmt.int(D.totals.lines)} lines, in <a href="#/episode/${bbEp.id}">${esc(bbEp.t)}</a>, and it's ${esc(bbbg.speakers[0].k)} saying it, doing an impression of Dwight.</p><p>Dwight says "beets" ${D.phrases.find((p) => p.label === 'beets').speakers[0].n} times. Andy mentions Cornell ${D.phrases.find((p) => p.label === 'Cornell').speakers[0].n} times. Michael says "Toby" ${D.phrases.find((p) => p.label === 'Toby').speakers[0].n} times, which is a lot for someone he refuses to talk to. <a href="#/dialogue">Search every line yourself.</a></p></div>
          <div class="sticky-note rv" style="--d:.1s">Michael has <b>${fmt.int(D.char.Michael.lines)}</b> lines in ${D.char.Michael.episodes} episodes.<br>That is ${fmt.pct(D.char.Michael.share)} of everything said in the show, and that counts the two seasons after he leaves.</div>
        </div>` : ''}
      </div>
    </section>`,
    after() { skyline($('#sky'), D); },
  };
}

const years = (s) => (s.year === s.endYear ? s.year : `${s.year}-${s.endYear.slice(2)}`);

function seasonCard(s, D, i) {
  const eps = D.episodes.slice(s.first, s.last + 1);
  const lead = s.speakers[0];
  return `<a class="season-card rv" style="--d:${i * 0.05}s" href="#/season/${s.n}">
    <span class="sn">${s.n}</span>
    <span class="sy">${years(s)} · ${s.episodes} episodes</span>
    ${spark(eps)}
    <span class="sr"><span class="muted">Average</span><span class="rating">${s.avgRating.toFixed(2)}</span></span>
    <span class="lead"><i class="dot" style="background:${color(lead.k)}"></i>${esc(lead.k)} talks most</span>
  </a>`;
}

export function badges(D, list) {
  const max = D.characters[0].lines;
  return `<div class="badges">${list.map((c, i) => `
    <a class="badge rv" style="--cc:${color(c.key)};--d:${(i % 12) * 0.035}s" href="#/character/${slug(c.key)}">
      <span class="slot"></span>
      <span class="avatar">${esc(initials(c.name))}</span>
      <span class="bn">${esc(c.name)}</span>
      <span class="br">${esc(c.actor)}</span>
      <span class="bl"><span style="width:${Math.max(3, (c.lines / max) * 100)}%"></span></span>
      <span class="bc">${fmt.int(c.lines)} lines</span>
    </a>`).join('')}</div>`;
}

// ---------------------------------------------------------------- all seasons

export function seasons(D) {
  const S = D.seasons;
  const topChars = ['Michael', 'Dwight', 'Jim', 'Pam', 'Andy'];
  return {
    title: 'Seasons',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Seasons</p>
      <h1>Nine seasons, <em>side by side.</em></h1>
      <p class="lede">Season 3 has the best average rating, season 8 the worst. Season 5 has the most viewers on paper, mostly because one episode aired after the Super Bowl.</p>
    </section>
    <section class="wrap">
      <div class="season-rail">${S.map((s, i) => seasonCard(s, D, i)).join('')}</div>
    </section>
    <section class="section wrap">
      <div class="grid g2">
        <div class="card rv">
          <h3 class="card-title">Average IMDb rating</h3>
          <p class="card-sub">Mean of every episode in the season.</p>
          <div id="c-rating"></div>
        </div>
        <div class="card rv" style="--d:.06s">
          <h3 class="card-title">Average US viewers, millions</h3>
          <p class="card-sub">Live viewers on first airing. Streaming came later.</p>
          <div id="c-viewers"></div>
        </div>
      </div>
      <div class="card rv mt">
        <div class="card-head">
          <div><h3 class="card-title">Share of each season's dialogue</h3><p class="card-sub">The five characters with the most lines overall. Michael's share goes to the ensemble after season 7, not to one person.</p></div>
        </div>
        <div class="legend">${topChars.map((k) => `<span><i class="sq" style="background:${color(k)}"></i>${k}</span>`).join('')}</div>
        <div id="c-share"></div>
        ${tableView([{ h: 'Season', k: 'n' }, { h: 'Episodes', k: 'episodes', r: 1 }, { h: 'Avg IMDb', f: (r) => r.avgRating.toFixed(2), r: 1 }, { h: 'Avg viewers', f: (r) => fmt.m(r.avgViewers), r: 1 }, { h: 'Lines', f: (r) => fmt.int(r.lines), r: 1 }, { h: 'TWSS', k: 'twss', r: 1 }], S)}
      </div>
    </section>`,
    after() {
      const cats = S.map((s) => `S${s.n}`);
      columns($('#c-rating'), { cats, series: [{ name: 'Average IMDb', color: 'var(--accent)', values: S.map((s) => s.avgRating) }], fmtv: (v) => v.toFixed(v % 1 ? 1 : 0), href: (it) => `#/season/${it.ci + 1}` });
      columns($('#c-viewers'), { cats, series: [{ name: 'Average viewers', color: 'var(--accent)', values: S.map((s) => s.avgViewers) }], fmtv: (v) => v.toFixed(v % 1 ? 1 : 0) + 'M', href: (it) => `#/season/${it.ci + 1}` });
      columns($('#c-share'), {
        cats, height: 280, fmtv: (v) => v.toFixed(0) + '%',
        series: topChars.map((k) => ({ name: k, color: color(k), values: D.char[k].perSeasonShare })),
      });
    },
  };
}

// ---------------------------------------------------------------- one season

export function season(D, n) {
  const s = D.seasons[n - 1];
  if (!s) return null;
  const eps = D.episodes.slice(s.first, s.last + 1);
  const best = D.episodes[s.best], worst = D.episodes[s.worst];
  const viewMax = eps.reduce((a, b) => (b.v > a.v ? b : a));
  const prev = D.seasons[n - 2], next = D.seasons[n];
  const showAvg = D.meta.avg;
  const newFaces = D.characters.filter((c) => D.episodes[c.first].s === n && c.lines > 150);
  const dirs = {};
  eps.forEach((e) => e.dir.forEach((d) => (dirs[d] = (dirs[d] || 0) + 1)));
  const topDir = Object.entries(dirs).sort((a, b) => b[1] - a[1])[0];
  return {
    title: `Season ${n}`,
    html: `
    <nav class="subnav" aria-label="Seasons"><div class="wrap"><span class="label">Season</span>
      <div class="pills scroll">${D.seasons.map((x) => `<a class="pill ${x.n === n ? 'on' : ''}" href="#/season/${x.n}">${x.n}</a>`).join('')}</div>
    </div></nav>
    <section class="wrap page-head">
      <div class="crumbs"><a href="#/seasons">Seasons</a><span>/</span><span>Season ${n}</span></div>
      <div class="season-hero">
        <span class="giant" aria-hidden="true">${n}</span>
        <div>
          <p class="eyebrow">${s.year} to ${s.endYear}</p>
          <h1 style="font-size:clamp(40px,6vw,72px)">Season ${n}</h1>
          <p class="lede">${esc(BLURB[n])}</p>
        </div>
      </div>
    </section>
    <section class="wrap">
      <div class="stats rv">
        <div class="stat"><div class="stat-label">Episodes</div><div class="stat-value">${count(s.episodes)}</div><div class="stat-note">${eps.filter((e) => e.hour).length ? `${eps.filter((e) => e.hour).length} hour-long` : 'All half-hour'}</div></div>
        <div class="stat"><div class="stat-label">Average IMDb</div><div class="stat-value">${count(s.avgRating, 2)}</div><div class="stat-note ${s.avgRating >= showAvg ? 'delta-up' : 'delta-down'}">${fmt.signed(s.avgRating - showAvg)} vs the show</div></div>
        <div class="stat"><div class="stat-label">Average viewers</div><div class="stat-value">${count(s.avgViewers, 1)}<small>M</small></div><div class="stat-note">Peak: ${esc(viewMax.t)}, ${fmt.m(viewMax.v)}</div></div>
        <div class="stat"><div class="stat-label">Lines spoken</div><div class="stat-value">${count(s.lines)}</div><div class="stat-note">${fmt.int(s.lines / s.episodes)} per episode</div></div>
        <div class="stat"><div class="stat-label">That's what she said</div><div class="stat-value">${count(s.twss)}</div><div class="stat-note">Times in the transcript</div></div>
      </div>
    </section>
    <section class="section wrap">
      <div class="card rv">
        <div class="card-head">
          <div><h3 class="card-title">Every episode in season ${n}</h3><p class="card-sub">IMDb rating by episode. Hover or tap a dot, click to open it.</p></div>
          <div class="flex small"><span class="chip">Best: <b>${esc(best.t)}</b> ${best.r.toFixed(1)}</span><span class="chip">Worst: <b>${esc(worst.t)}</b> ${worst.r.toFixed(1)}</span></div>
        </div>
        <div id="lolli"></div>
      </div>
      <div class="grid g-7-5 mt">
        <div class="card rv">
          <h3 class="card-title">Who talked</h3>
          <p class="card-sub">Share of the season's ${fmt.int(s.lines)} lines.</p>
          ${hbars(s.speakers.map((x) => ({ label: x.k, v: (x.n / s.lines) * 100, color: color(x.k), dot: color(x.k), k: x.k })), { fmtv: (v) => fmt.pct(v), href: (r) => `#/character/${slug(r.k)}` })}
        </div>
        <div class="card rv" style="--d:.06s">
          <h3 class="card-title">Words of the season</h3>
          <p class="card-sub">Words said far more this season than in the other eight. Bigger means more unusual. The small number is how many times.</p>
          ${words(s.signature, 12)}
          ${newFaces.length ? `<p class="small muted mt">First season for ${newFaces.map((c) => `<a href="#/character/${slug(c.key)}">${esc(c.name)}</a>`).join(', ')}.</p>` : ''}
          <p class="small muted">${esc(topDir[0])} directed the most episodes this season (${topDir[1]}).</p>
        </div>
      </div>
    </section>
    <section class="wrap">
      <div class="section-head rv"><div><p class="eyebrow">Episodes</p><h2>All ${s.episodes}.</h2></div>
        <div class="legend hide-sm" style="margin:0">The strip shows who talks across each episode, start to finish. ${['Michael', 'Dwight', 'Jim', 'Pam', 'Andy'].map((k) => `<span><i class="sq" style="background:${color(k)}"></i>${k}</span>`).join('')}</div>
      </div>
      <div class="ep-list rv">${eps.map((e) => epRow(e, D)).join('')}</div>
      <div class="pager">
        ${prev ? `<a href="#/season/${prev.n}"><small>Previous</small><span>Season ${prev.n}</span></a>` : '<span style="flex:1"></span>'}
        ${next ? `<a class="next" href="#/season/${next.n}"><small>Next</small><span>Season ${next.n}</span></a>` : `<a class="next" href="#/findings"><small>Next</small><span>What it all means</span></a>`}
      </div>
    </section>`,
    after() { lollipops($('#lolli'), eps, { avg: s.avgRating }); },
  };
}

// ---------------------------------------------------------------- one episode

export function episode(D, id, lines) {
  const e = D.episodes[id];
  if (!e) return null;
  const s = D.seasons[e.s - 1];
  const sEps = D.episodes.slice(s.first, s.last + 1);
  const rankShow = [...D.episodes].sort((a, b) => b.r - a.r).findIndex((x) => x.id === id) + 1;
  const rankSeason = [...sEps].sort((a, b) => b.r - a.r).findIndex((x) => x.id === id) + 1;
  const prev = D.episodes[id - 1], next = D.episodes[id + 1];
  const people = (list, role) => list.map((p) => `<a href="#/person/${slug(p)}">${esc(p)}</a>`).join(', ');
  const total = e.lines;
  return {
    title: e.t,
    html: `
    <section class="wrap page-head">
      <div class="crumbs"><a href="#/seasons">Seasons</a><span>/</span><a href="#/season/${e.s}">Season ${e.s}</a><span>/</span><span>Episode ${e.e}</span></div>
      <p class="eyebrow">${epCode(e)} · ${fmt.date(e.date)}</p>
      <h1 style="font-size:clamp(40px,7vw,84px)">${esc(e.t)}</h1>
      <p class="lede">Directed by ${people(e.dir)}. Written by ${people(e.wri)}.${e.hour ? ' An hour-long episode.' : ''}</p>
    </section>
    <section class="wrap">
      <div class="stats rv">
        <div class="stat"><div class="stat-label">IMDb rating</div><div class="stat-value">${count(e.r, 1)}</div><div class="stat-note">#${rankSeason} of ${s.episodes} in the season, #${rankShow} of ${D.episodes.length} overall</div></div>
        <div class="stat"><div class="stat-label">US viewers</div><div class="stat-value">${count(e.v, 2)}<small>M</small></div><div class="stat-note ${e.v >= s.avgViewers ? 'delta-up' : 'delta-down'}">${fmt.signed(e.v - s.avgViewers)}M vs season average</div></div>
        <div class="stat"><div class="stat-label">Lines</div><div class="stat-value">${count(e.lines)}</div><div class="stat-note">${e.speakers} different speakers</div></div>
        <div class="stat"><div class="stat-label">Words</div><div class="stat-value">${count(e.words)}</div><div class="stat-note">${e.votes ? `${fmt.int(e.votes)} IMDb votes` : ''}</div></div>
        <div class="stat"><div class="stat-label">That's what she said</div><div class="stat-value">${e.twss || (e.twssWiki ? 1 : 0)}</div><div class="stat-note">${e.twss ? 'In the transcript' : e.twssWiki ? 'Per the fan wiki' : 'Not this time'}</div></div>
      </div>
    </section>
    <section class="section wrap">
      <div class="card rv">
        <h3 class="card-title">Who talks when</h3>
        <p class="card-sub">Each tick is one line, left to right through the episode. The six people with the most lines.</p>
        <div id="barcode"></div>
      </div>
      <div class="grid g2 mt">
        <div class="card rv">
          <h3 class="card-title">Share of the episode</h3>
          <p class="card-sub">Of ${fmt.int(total)} lines.</p>
          ${hbars(e.top.map((t) => ({ label: t.k, v: (t.n / total) * 100, color: color(t.k), dot: color(t.k), k: t.k })), { fmtv: (v) => fmt.pct(v), href: (r) => `#/character/${slug(r.k)}` })}
        </div>
        <div class="card rv" style="--d:.06s">
          <h3 class="card-title">Cold open</h3>
          <p class="card-sub">The first lines of the episode.</p>
          <div class="script" id="cold"><p class="muted small">Loading the script…</p></div>
        </div>
      </div>
      <div class="card rv mt">
        <h3 class="card-title">Season ${e.s} for context</h3>
        <p class="card-sub">This episode is the filled dot.</p>
        <div id="ctx"></div>
      </div>
      <div class="pager">
        ${prev ? `<a href="#/episode/${prev.id}"><small>Previous · ${epCode(prev)}</small><span>${esc(prev.t)}</span></a>` : '<span style="flex:1"></span>'}
        ${next ? `<a class="next" href="#/episode/${next.id}"><small>Next · ${epCode(next)}</small><span>${esc(next.t)}</span></a>` : '<span style="flex:1"></span>'}
      </div>
    </section>`,
    after() {
      barcode($('#barcode'), e, D);
      contextChart($('#ctx'), sEps, e);
      lines().then((L) => {
        const mine = L.filter((l) => l[0] === id).slice(0, 8);
        $('#cold') && ($('#cold').innerHTML = mine.map(([, sp, tx]) => `<div class="ln"><span class="sp"><i class="dot" style="background:${color(sp)}"></i>${esc(sp)}</span><span class="tx">${esc(tx)}</span></div>`).join(''));
      }).catch(() => { $('#cold') && ($('#cold').innerHTML = '<p class="muted small">The script didn’t load.</p>'); });
    },
  };
}

function contextChart(el, eps, cur) {
  mount(el, (el, W) => {
    const H = 120, m = { t: 14, b: 22, l: 6, r: 6 };
    const lo = Math.min(6.5, ...eps.map((e) => e.r)) - 0.1;
    const y = (v) => H - m.b - ((v - lo) / (10 - lo)) * (H - m.t - m.b);
    const step = (W - m.l - m.r) / eps.length;
    let body = '';
    eps.forEach((e, i) => {
      const cx = m.l + step * (i + 0.5);
      const me = e.id === cur.id;
      body += `<a href="#/episode/${e.id}"><line x1="${cx}" x2="${cx}" y1="${H - m.b}" y2="${y(e.r)}" style="stroke:${me ? 'var(--accent)' : 'var(--line-2)'}" stroke-width="2"/>
        <circle cx="${cx}" cy="${y(e.r)}" r="${me ? 7 : 4}" style="fill:${me ? 'var(--accent)' : 'var(--surface)'};stroke:var(--accent)" stroke-width="2"><title>${esc(e.t)} · ${e.r}</title></circle></a>`;
      if (me) body += `<text x="${cx}" y="${y(e.r) - 12}" text-anchor="middle" class="lbl-strong">${e.r.toFixed(1)}</text>`;
      body += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${step > 16 || me ? e.e : ''}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`;
  });
}

export { epRow, hasSlot };
