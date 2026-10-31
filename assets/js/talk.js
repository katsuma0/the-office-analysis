import { $, $$, esc, fmt, slug, color, hbars, epCode, count } from './ui.js';
import { columns, matrix, timeline, scatter, strip } from './charts.js';

const SUGGEST = ['beets', 'Cornell', 'Scranton Strangler', 'pretzel', 'bankruptcy', 'parkour', 'Michael Scarn', 'Stanley', 'Kevin', 'the warehouse', 'Bob Vance', 'I love you'];

// ---------------------------------------------------------------- dialogue

export function dialogue(D, lines) {
  const cats = D.seasons.map((s) => `S${s.n}`);
  return {
    title: 'Dialogue',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Dialogue</p>
      <h1>Every line, <em>searchable.</em></h1>
      <p class="lede">All ${fmt.int(D.totals.lines)} lines, ${fmt.int(D.totals.vocab)} different words. Type anything and see who said it, when, and how often.</p>
    </section>
    <section class="wrap">
      <div class="searchbox rv">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
        <input id="sq" type="search" placeholder="Try “beets” or “bankruptcy”" autocomplete="off" spellcheck="false" aria-label="Search the script">
      </div>
      <div class="suggest rv">${SUGGEST.map((s) => `<button class="pill" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <div id="sres" class="mt" aria-live="polite"></div>
    </section>

    <section class="section wrap">
      <div class="section-head rv"><div><p class="eyebrow">Running jokes</p><h2>Things people kept saying.</h2></div></div>
      <div class="pills rv" id="phr">${D.phrases.map((p, i) => `<button class="pill" aria-pressed="${i === 0}" data-i="${i}">${esc(p.label)}</button>`).join('')}</div>
      <div class="grid g-7-5 mt" id="phr-body"></div>
    </section>

    <section class="wrap">
      <div class="section-head rv"><div><p class="eyebrow">Conversation</p><h2>Who answers whom.</h2></div></div>
      <div class="grid g-7-5" style="align-items:start">
        <div class="card rv"><h3 class="card-title">After each person speaks, who goes next</h3><p class="card-sub">Read across a row. Each row adds up to 100%, so Michael's volume doesn't drown everyone else. Darker means more often.</p><div class="matrix" id="mx"></div></div>
        <div class="prose rv" style="--d:.08s">
          <p><strong>Pam answers Jim, barely.</strong> When Pam finishes a line, Jim talks next ${pct(D, 'Pam', 'Jim', 1)} of the time and Michael ${pct(D, 'Pam', 'Michael', 1)}. Jim splits it between Michael (${pct(D, 'Jim', 'Michael')}) and Pam (${pct(D, 'Jim', 'Pam')}).</p>
          <p><strong>Everyone else answers Michael.</strong> He's the most likely next speaker for eight of the other eleven. The exceptions are Pam, Andy, who gets Dwight, and Erin, who gets Andy ${pct(D, 'Erin', 'Andy')} of the time.</p>
          <p>Ryan leans on Michael the most: after Ryan speaks, it's Michael ${pct(D, 'Ryan', 'Michael')} of the time. Angela splits evenly between Michael and Dwight, ${pct(D, 'Angela', 'Michael')} each, which tracks.</p>
          <p class="small muted">This counts consecutive lines in the same episode, so it picks up scene changes too. It's a rough measure of who shares scenes, not a proper conversation model.</p>
        </div>
      </div>
    </section>`,
    after() {
      matrix($('#mx'), D);
      // phrases
      const drawP = (i) => {
        const p = D.phrases[i];
        const top = p.topEp.map((t) => D.episodes[t.id]);
        $('#phr-body').innerHTML = `
          <div class="card"><p class="phrase-big">“${esc(p.label)}”</p><p class="phrase-total">${fmt.int(p.total)} time${p.total === 1 ? '' : 's'} in the show. ${top.length ? `Most in <a href="#/episode/${top[0].id}">${esc(top[0].t)}</a> (${p.topEp[0].n}).` : ''}</p>
            <div id="phr-chart" class="mt"></div></div>
          <div class="card"><h3 class="card-title">Who says it</h3><p class="card-sub">Top speakers.</p>
            ${hbars(p.speakers.map((s) => ({ label: s.k, v: s.n, color: color(s.k), dot: color(s.k), k: s.k })), { href: (r) => (D.char[r.k] ? `#/character/${slug(r.k)}` : null) })}</div>`;
        columns($('#phr-chart'), { cats, series: [{ name: p.label, color: 'var(--accent)', values: p.perSeason }], height: 200, href: (it) => `#/season/${it.ci + 1}` });
        requestAnimationFrame(() => { $('#phr-chart').classList.add('go'); $('#phr-body .hbars')?.classList.add('go'); });
      };
      $$('#phr .pill').forEach((b) => b.addEventListener('click', () => {
        $$('#phr .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        drawP(+b.dataset.i);
      }));
      drawP(0);
      // search
      const input = $('#sq');
      let timer;
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(D, lines, input.value), 180); });
      input.addEventListener('focus', () => lines(), { once: true });
      $$('.suggest .pill').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.q; search(D, lines, b.dataset.q); }));
    },
  };
}

const pct = (D, a, b, d = 0) => {
  const { keys, m } = D.matrix;
  const i = keys.indexOf(a), j = keys.indexOf(b);
  const row = m[i];
  return fmt.pct((row[j] / row.reduce((s, v) => s + v, 0)) * 100, d);
};

let lower;
let shown = 0;
async function search(D, lines, raw) {
  const out = $('#sres');
  const term = raw.trim();
  if (term.length < 2) { out.innerHTML = ''; return; }
  if (!lower) out.innerHTML = '<p class="muted">Loading the script, about 1.5 MB…</p>';
  const L = await lines();
  lower ??= L.map((l) => l[2].toLowerCase().replace(/’/g, "'"));
  if ($('#sq').value.trim() !== term) return;
  const t = term.toLowerCase().replace(/’/g, "'");
  const rx = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const hits = [];
  for (let i = 0; i < L.length; i++) if (lower[i].includes(t) && rx.test(lower[i])) hits.push(i);
  if (!hits.length) {
    out.innerHTML = `<div class="card"><p class="phrase-big" style="font-size:24px">Nobody says “${esc(term)}”.</p><p class="muted">Not once in ${fmt.int(L.length)} lines. Try fewer words.</p></div>`;
    return;
  }
  const bySeason = Array(9).fill(0);
  const bySpeaker = {};
  const byEp = {};
  for (const i of hits) {
    const [ep, sp] = L[i];
    bySeason[D.episodes[ep].s - 1]++;
    bySpeaker[sp] = (bySpeaker[sp] || 0) + 1;
    byEp[ep] = (byEp[ep] || 0) + 1;
  }
  const sp = Object.entries(bySpeaker).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topEp = Object.entries(byEp).sort((a, b) => b[1] - a[1])[0];
  const topE = D.episodes[+topEp[0]];
  shown = 0;
  out.innerHTML = `
    <div class="grid g-7-5">
      <div class="card"><p class="phrase-big" style="font-size:clamp(24px,3vw,34px)">“${esc(term)}”</p>
        <p class="phrase-total">${fmt.int(hits.length)} line${hits.length === 1 ? '' : 's'}, in ${Object.keys(byEp).length} episode${Object.keys(byEp).length === 1 ? '' : 's'}. Most in <a href="#/episode/${topE.id}">${esc(topE.t)}</a> (${topEp[1]}).</p>
        <div id="s-chart" class="mt"></div></div>
      <div class="card"><h3 class="card-title">Who says it</h3><p class="card-sub">Lines containing it, by speaker.</p>
        ${hbars(sp.map(([k, n]) => ({ label: k, v: n, color: color(k), dot: color(k), k })), { href: (r) => (D.char[r.k] ? `#/character/${slug(r.k)}` : null) })}</div>
    </div>
    <div class="card mt"><div class="script" id="s-lines"></div><div id="s-more" class="mt"></div></div>`;
  columns($('#s-chart'), { cats: D.seasons.map((s) => `S${s.n}`), series: [{ name: term, color: 'var(--accent)', values: bySeason }], height: 190, href: (it) => `#/season/${it.ci + 1}` });
  requestAnimationFrame(() => { $('#s-chart')?.classList.add('go'); $('#sres .hbars')?.classList.add('go'); });
  const hl = (s) => esc(s).replace(new RegExp(`(${esc(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>');
  const more = () => {
    const chunk = hits.slice(shown, shown + 40);
    shown += chunk.length;
    $('#s-lines').insertAdjacentHTML('beforeend', chunk.map((i) => {
      const [ep, who, tx] = L[i];
      const e = D.episodes[ep];
      return `<div class="ln"><span class="sp"><i class="dot" style="background:${color(who)}"></i>${esc(who)}</span><span><span class="tx">${hl(tx)}</span><div class="meta"><a href="#/episode/${e.id}">${esc(e.t)}</a> · ${epCode(e)}</div></span></div>`;
    }).join(''));
    $('#s-more').innerHTML = shown < hits.length ? `<button class="btn ghost" id="s-more-b">Show more (${fmt.int(hits.length - shown)} left)</button>` : '';
    $('#s-more-b')?.addEventListener('click', more);
  };
  more();
}

// ---------------------------------------------------------------- findings

export function findings(D) {
  const F = D.findings;
  const M = F.michaelRating, V = F.michaelViewers;
  const odds = (p) => (p < 1e-4 ? 'less than 1 in 10,000' : `about 1 in ${fmt.int(Math.round(1 / p))}`);
  const andy = F.andy;
  return {
    title: 'Findings',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Findings</p>
      <h1>What the numbers <em>actually say.</em></h1>
      <p class="lede">Five questions fans argue about, answered with the data and a couple of statistical tests. I explain the tests in plain words as I go. No prior stats needed.</p>
    </section>
    <div class="wrap">

    <section class="finding" id="michael">
      <div class="sticky-col">
        <p class="fnum">One</p>
        <h2>Did the show get worse after Michael left?</h2>
        <span class="verdict yes">Yes, clearly</span>
        <div class="prose mt">
          <p>With Michael, through <a href="#/episode/${F.goodbye}">Goodbye, Michael</a>, episodes average <strong>${M.meanA}</strong> on IMDb. After, <strong>${M.meanB}</strong>. That is a drop of ${(M.meanA - M.meanB).toFixed(2)} points across ${M.nA} and ${M.nB} episodes.</p>
          <p>Viewers fall harder, from ${fmt.m(V.meanA)} to ${fmt.m(V.meanB)} an episode, which leaves out the post Super Bowl episode so it doesn't flatter the early years.</p>
        </div>
        <div class="explain"><b>How sure is that?</b> I shuffled the labels "with Michael" and "without" randomly 20,000 times and checked how often chance alone produced a gap this big. It happened ${odds(F.michaelRatingPerm)} times. A Welch t-test agrees (p ${fmt.p(M.p) === '< 0.001' ? '< 0.001' : '= ' + fmt.p(M.p)}).<br><br><b>The catch.</b> Network TV was losing viewers everywhere by 2011, so not all of the viewer drop is Michael. The rating drop is harder to explain away.</div>
      </div>
      <div>
        <div class="card"><h3 class="card-title">IMDb rating, every episode</h3><p class="card-sub">Dots are episodes. The black line is a 9-episode moving average. The flat lines are the two era averages.</p><div id="f-m1"></div></div>
        <div class="card mt"><h3 class="card-title">US viewers, millions</h3><p class="card-sub">Stress Relief (22.9M, after the Super Bowl) runs off the top.</p><div id="f-m2"></div></div>
        <div class="card mt"><h3 class="card-title">But more Michael doesn't mean a better episode</h3><p class="card-sub">Within his seasons, Michael's share of the lines against the rating. r = ${F.michaelShareCorr.r.toFixed(2)}, basically flat. He mattered to the show, not to every scene.</p><div id="f-m3"></div></div>
      </div>
    </section>

    <section class="finding" id="twss">
      <div class="sticky-col">
        <p class="fnum">Two</p>
        <h2>Do “that's what she said” episodes rate higher?</h2>
        <span class="verdict">Sort of, then not really</span>
        <div class="prose mt">
          <p>The line shows up ${F.twssLines} times in the transcript. Michael says ${F.twssBy[0].n} of them. Counting those and the fan wiki's list, ${F.twssAll.nA} episodes have one.</p>
          <p>Across the whole show those episodes average <strong>${F.twssAll.meanA}</strong> against <strong>${F.twssAll.meanB}</strong>, and that gap passes the usual test (p = ${fmt.p(F.twssAll.p)}).</p>
          <p>But the joke lives in the Michael years, and the Michael years rated higher anyway. Compare only episodes from seasons 1 to 7 and the gap shrinks to <strong>${(F.twssMichael.meanA - F.twssMichael.meanB).toFixed(2)}</strong>, with p = ${fmt.p(F.twssMichael.p)}. That's the kind of gap random noise makes all the time.</p>
        </div>
        <div class="explain"><b>What a p-value means here.</b> It's the chance of seeing a gap at least this big if the joke made no difference at all. Under 0.05 is the usual bar for "probably real". ${fmt.p(F.twssMichael.p)} is well over it.<br><br><b>A correction.</b> My 2023 version of this test counted every two-part episode twice, because of how I merged the data. This one counts each episode once.</div>
      </div>
      <div>
        <div class="card"><div class="card-head"><div><h3 class="card-title">Ratings, with and without the joke</h3><p class="card-sub">Each dot is an episode. The black bar is the average.</p></div>
          <div class="toggle" id="tw-t"><button class="on" data-v="all">All episodes</button><button data-v="m">Michael era only</button></div></div>
          <div id="f-t1"></div><p class="small muted" id="tw-note"></p></div>
        <div class="card mt"><h3 class="card-title">Who says it</h3><p class="card-sub">All ${F.twssLines} times in the transcript.</p>
          ${hbars(F.twssBy.map((t) => ({ label: t.k, v: t.n, color: color(t.k), dot: color(t.k) })))}</div>
      </div>
    </section>

    <section class="finding" id="hour">
      <div class="sticky-col">
        <p class="fnum">Three</p>
        <h2>Are the hour-long episodes better?</h2>
        <span class="verdict yes">Yes, by a lot</span>
        <div class="prose mt">
          <p>${F.hour.nA} episodes aired as a double. They average <strong>${F.hour.meanA}</strong> against <strong>${F.hour.meanB}</strong> for everything else, a gap of ${(F.hour.meanA - F.hour.meanB).toFixed(2)}. It's the biggest effect in this whole project after Michael himself.</p>
          <p>It isn't the runtime. The doubles were saved for events: The Job, Stress Relief, Goodbye Toby, A.A.R.M. and the Finale. Fans rate events.</p>
        </div>
        <div class="explain"><b>How sure?</b> p ${fmt.p(F.hour.p) === '< 0.001' ? '< 0.001' : '= ' + fmt.p(F.hour.p)}. Only ${F.hour.nA} episodes, but the gap is large enough that it doesn't matter much.</div>
      </div>
      <div><div class="card"><h3 class="card-title">Double episodes against the rest</h3><p class="card-sub">Niagara and The Delivery aired as two separate halves, so they count as regular episodes here.</p><div id="f-h1"></div></div></div>
    </section>

    <section class="finding" id="andy">
      <div class="sticky-col">
        <p class="fnum">Four</p>
        <h2>Is Andy why the later seasons rated lower?</h2>
        <span class="verdict no">Mostly no</span>
        <div class="prose mt">
          <p>Across every episode Andy is in, the more of the episode he talks, the lower it rated. The correlation is r = <strong>${andy.all.r.toFixed(2)}</strong>, which is strong for TV data.</p>
          <p>But his big episodes are in seasons 8 and 9, when everything rated lower. Look inside each era separately and it mostly disappears: r = ${andy.early.r.toFixed(2)} in seasons 1 to 7, r = ${andy.late.r.toFixed(2)} in 8 and 9, and neither passes the test.</p>
          <p>So Andy talks a lot in a period that rated badly. That's not the same as Andy making it rate badly.</p>
        </div>
        <div class="explain"><b>Why this matters.</b> This is the same trap as the "that's what she said" result, the other way round. When two things both depend on the era, they'll look related even if they have nothing to do with each other.</div>
      </div>
      <div><div class="card"><h3 class="card-title">Andy's share of the lines against the rating</h3><p class="card-sub"><span style="color:var(--accent);font-weight:600">Blue</span> is seasons 1 to 7, <span style="color:var(--ink-3);font-weight:600">grey</span> is 8 and 9. The line fits all of them together.</p><div id="f-a1"></div></div></div>
    </section>

    <section class="finding" id="more">
      <div class="sticky-col">
        <p class="fnum">Five</p>
        <h2>Things that don't matter.</h2>
        <span class="verdict">No effect</span>
        <div class="prose mt"><p>A few more I checked. None of them come close to the bar, which is a result too.</p></div>
      </div>
      <div class="grid g2">
        <div class="card"><h3 class="card-title">Holiday episodes</h3><p class="card-sub">Christmas, Halloween, Valentine's, Diwali, St. Patrick's.</p><div class="stat-value">${fmt.signed(F.holiday.meanA - F.holiday.meanB)}</div><p class="small muted">${F.holiday.nA} episodes, p = ${fmt.p(F.holiday.p)}. Fans don't rate them any higher.</p></div>
        <div class="card"><h3 class="card-title">Longer scripts</h3><p class="card-sub">Lines per episode against rating, half-hours only.</p><div class="stat-value">r = ${F.linesCorr.r.toFixed(2)}</div><p class="small muted">p = ${fmt.p(F.linesCorr.p)}. A busier script isn't a better one.</p></div>
        <div class="card"><h3 class="card-title">Bigger casts</h3><p class="card-sub">Number of different speakers against rating.</p><div class="stat-value">r = ${F.speakersCorr.r.toFixed(2)}</div><p class="small muted">p = ${fmt.p(F.speakersCorr.p)}. Slightly negative, not convincing.</p></div>
        <div class="card"><h3 class="card-title">Michael's screen time</h3><p class="card-sub">His share of lines in seasons 1 to 7.</p><div class="stat-value">r = ${F.michaelShareCorr.r.toFixed(2)}</div><p class="small muted">p = ${fmt.p(F.michaelShareCorr.p)}. See finding one.</p></div>
      </div>
    </section>
    </div>`,
    after() {
      timeline($('#f-m1'), D, { marker: F.goodbye, label: 'IMDb rating' });
      timeline($('#f-m2'), D, { marker: F.goodbye, value: (e) => e.v, yDomain: [2, 12], fmtv: (v) => `${v.toFixed(1)}M`, label: 'US viewers', height: 260 });
      const mEps = D.episodes.filter((e) => e.id <= F.goodbye);
      scatter($('#f-m3'), {
        pts: mEps.map((e) => ({ x: ((e.c[D.codes.Michael] || 0) / e.lines) * 100, y: e.r, ep: e, color: 'var(--accent)' })),
        xLabel: "Michael's share of lines, %", yLabel: 'IMDb', yDomain: [7, 10], xFmt: (v) => `${v}%`,
        tipFn: (p) => `<div class="tt">${esc(p.ep.t)}</div><div class="tm">${epCode(p.ep)}</div><div class="tr" style="margin-top:6px"><span>Michael's share</span><b>${fmt.pct(p.x)}</b></div><div class="tr"><span>IMDb</span><b>${p.y}</b></div>`,
      });
      const flag = (e) => e.twss > 0 || e.twssWiki;
      const drawT = (v) => {
        const pool = v === 'm' ? D.episodes.filter((e) => e.id <= F.goodbye) : D.episodes;
        const res = v === 'm' ? F.twssMichael : F.twssAll;
        const el = $('#f-t1');
        el.replaceWith(Object.assign(document.createElement('div'), { id: 'f-t1' }));
        strip($('#f-t1'), { groups: [{ name: 'With the joke', color: 'var(--c-dwight)', values: pool.filter(flag) }, { name: 'Without', color: 'var(--ink-3)', values: pool.filter((e) => !flag(e)) }] });
        requestAnimationFrame(() => $('#f-t1').classList.add('go'));
        $('#tw-note').textContent = `Gap ${fmt.signed(res.meanA - res.meanB)}, p = ${fmt.p(res.p)}. ${res.p < 0.05 ? 'Passes the usual test.' : 'Does not pass the usual test.'}`;
      };
      $$('#tw-t button').forEach((b) => b.addEventListener('click', () => { $$('#tw-t button').forEach((x) => x.classList.toggle('on', x === b)); drawT(b.dataset.v); }));
      drawT('all');
      strip($('#f-h1'), { groups: [{ name: 'Hour-long', color: 'var(--accent)', values: D.episodes.filter((e) => e.hour) }, { name: 'Half-hour', color: 'var(--ink-3)', values: D.episodes.filter((e) => !e.hour) }] });
      const aEps = D.episodes.filter((e) => e.c[D.codes.Andy]);
      scatter($('#f-a1'), {
        pts: aEps.map((e) => ({ x: (e.c[D.codes.Andy] / e.lines) * 100, y: e.r, ep: e, color: e.s <= 7 ? 'var(--accent)' : 'var(--ink-3)' })),
        xLabel: "Andy's share of lines, %", yLabel: 'IMDb', yDomain: [6, 10], xFmt: (v) => `${v}%`,
        tipFn: (p) => `<div class="tt">${esc(p.ep.t)}</div><div class="tm">${epCode(p.ep)}</div><div class="tr" style="margin-top:6px"><span>Andy's share</span><b>${fmt.pct(p.x)}</b></div><div class="tr"><span>IMDb</span><b>${p.y}</b></div>`,
      });
    },
  };
}

// ---------------------------------------------------------------- about

export function about(D) {
  return {
    title: 'How I made this',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">How I made this</p>
      <h1>Notes, sources <em>and one correction.</em></h1>
    </section>
    <section class="wrap">
      <div class="grid g-7-5" style="align-items:start">
        <div class="prose rv">
          <p>I first did this in 2023 as my first data project, in R, while studying math and stats at McMaster. It answered three questions and looked like an R Markdown file, because it was one. <a href="original/2023-report.html">That version is still here.</a></p>
          <p>This version starts over. The episode table is the one I built in 2023 from three Kaggle datasets: ratings, viewers, air dates, directors and writers. The dialogue comes from the full transcript in the <a href="https://github.com/bradlindblad/schrute">schrute</a> dataset, ${fmt.int(D.totals.lines)} lines after cleanup. IMDb vote counts come from TidyTuesday.</p>
          <p><strong>The correction.</strong> My 2023 merge joined the tables on season and title, and every two-part episode ended up in there twice. That gave 201 rows for what is really 188 episodes, and it nudged every average and every test. The "that's what she said" result was the worst hit. Everything here is recomputed with one row per episode.</p>
          <p><strong>Cleanup.</strong> Speaker names in the transcript are typed by hand, so "Micheal", "Dwight:" and "David" become Michael, Dwight and David Wallace. Niagara and The Delivery come as one transcript each but aired as two episodes, so I split them down the middle. Deleted scenes are not in the transcript.</p>
          <p><strong>The words.</strong> "Words that are very Dwight" uses weighted log-odds with an informative Dirichlet prior (Monroe, Colaresi and Quinn, 2008). Plain counts would give everyone the same list of "Michael", "office" and "yeah". This asks which words a person uses unusually often compared to everyone else, and it doesn't get fooled by words that are only rare.</p>
          <p><strong>The tests.</strong> Group comparisons use Welch's t-test, which doesn't assume both groups vary the same amount. The big ones also get a permutation test with 20,000 shuffles, because it makes no assumptions at all and is easy to explain. Correlations are Pearson's r. IMDb ratings are averages of averages and bunch up between 7 and 9, so small differences are real differences.</p>
          <p><strong>What it can't tell you.</strong> IMDb raters are self-selected and mostly watched years later on streaming. US viewers are live ratings, which every network was losing at the same time. Nothing here is a controlled experiment, so "goes with" never means "caused".</p>
          <p>The site is plain HTML, CSS and JavaScript. Every chart is hand-built SVG. The data is built with a Python script in the repo, using pandas and SciPy. No tracking, no cookies.</p>
        </div>
        <div class="card rv" style="--d:.08s">
          <h3 class="card-title">Sources</h3>
          <ul class="small" style="padding-left:18px;line-height:1.9;margin:8px 0 0">
            <li><a href="https://www.kaggle.com/datasets/nehaprabhavalkar/the-office-dataset">The Office dataset</a>, Kaggle</li>
            <li><a href="https://www.kaggle.com/datasets/bcruise/the-office-episodes-data">The Office episodes data</a>, Kaggle</li>
            <li><a href="https://github.com/bradlindblad/schrute">schrute</a>, full transcripts</li>
            <li><a href="https://github.com/rfordatascience/tidytuesday/tree/master/data/2020/2020-03-17">TidyTuesday 2020-03-17</a>, IMDb votes</li>
            <li><a href="https://theoffice.fandom.com/wiki/List_of_the_times_somebody_says_%22That%27s_what_she_said%22">Dunderpedia</a>, list of "that's what she said"</li>
          </ul>
          <h3 class="card-title mt">By the numbers</h3>
          <div class="stats mt" style="grid-template-columns:1fr 1fr">
            <div class="stat"><div class="stat-label">Episodes</div><div class="stat-value">${count(D.totals.episodes)}</div></div>
            <div class="stat"><div class="stat-label">Lines</div><div class="stat-value">${count(D.totals.lines)}</div></div>
            <div class="stat"><div class="stat-label">Speakers</div><div class="stat-value">${count(D.totals.speakers)}</div></div>
            <div class="stat"><div class="stat-label">Words</div><div class="stat-value">${count(D.totals.words)}</div></div>
          </div>
          <p class="small muted mt">Made by Katsuma Onishi, Markham, Ontario. Questions or corrections go to <a href="https://katsuma.ca">katsuma.ca</a>.</p>
        </div>
      </div>
    </section>`,
  };
}
