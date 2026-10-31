import { $, $$, esc, fmt, slug, color, initials, count, hbars, arrow, epCode, tableView, hasSlot } from './ui.js';
import { skyline, spark, lollipops, barcode, seqThumb, columns, mount, seasonStrip } from './charts.js';

// ---------------------------------------------------------------- small helpers

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const nw = (n) => NUM[n] ?? fmt.int(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const join = (a) => (a.length < 2 ? a[0] ?? '' : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const yearSpan = (a, b) => (String(a) === String(b) ? String(a) : `${a} to ${b}`);
const years = (s) => (s.year === s.endYear ? s.year : `${s.year}-${s.endYear.slice(2)}`);
// Ratings have one decimal, so compare them as tenths to dodge float noise.
const tenths = (v) => Math.round(v * 10);
const same = (a, b) => Math.abs(a - b) < 1e-9;
// Competition ranking: 1 + how many are strictly better. Ties share a rank and read "T-24".
function rankOf(list, e, get = (x) => x.r) {
  const v = get(e);
  const n = 1 + list.filter((x) => get(x) > v + 1e-9).length;
  const ties = list.filter((x) => x !== e && same(get(x), v)).length;
  return { n, ties, label: `${ties ? 'T-' : '#'}${n}` };
}
// Counting up to 0, 1 or 2 isn't a show, and ui.countUp's first frame can read "-0" for them.
const small = (n) => (n < 10 ? fmt.int(n) : count(n));
const streamCount = (eps) => eps.reduce((n, e) => n + (e.hour ? 2 : 1), 0);
const partBase = (e) => e.t.replace(/:\s*Part\s*\d+$/i, '');

// Titles in running text get quotes, so "Goodbye, Michael" doesn't read as two items in a list.
const epA = (e) => `“<a href="#/episode/${e.id}">${esc(e.t)}</a>”`;
const charA = (D, k) => (D.char[k] ? `<a href="#/character/${slug(k)}">${esc(k)}</a>` : esc(k));
const fullA = (c) => `<a href="#/character/${slug(c.key)}">${esc(c.name)}</a>`;
const personA = (D, p) => (D.people[slug(p)] ? `<a href="#/person/${slug(p)}">${esc(p)}</a>` : esc(p));
const searchHref = (w) => `#/dialogue/q/${encodeURIComponent(w)}`;

// The same look as ui.words(), but every word opens a dialogue search.
function wordLinks(list, max = 14) {
  const top = list.slice(0, max);
  if (!top.length) return '';
  const zmax = Math.max(...top.map((w) => w.z));
  return `<div class="words">${top.map((w, i) => `<a class="word" href="${esc(searchHref(w.w))}" style="font-size:${(15 + (w.z / zmax) * 15).toFixed(1)}px;--d:${i * 0.04}s" title="Said ${esc(fmt.times(w.n))}. Search it">${esc(w.w)}<small>${w.n}</small></a>`).join('')}</div>`;
}

// Best and worst with ties kept, e.g. season 8 has four episodes at its top score.
function extremes(eps) {
  const hi = Math.max(...eps.map((e) => tenths(e.r)));
  const lo = Math.min(...eps.map((e) => tenths(e.r)));
  return { best: eps.filter((e) => tenths(e.r) === hi), worst: eps.filter((e) => tenths(e.r) === lo) };
}

// Lines repaired from mojibake carry real em dashes; the rest of the transcript writes them as hyphens, so match that.
const scriptLine = ([, sp, tx]) => `<div class="ln"><span class="sp"><i class="dot" style="background:${color(sp)}"></i>${esc(sp)}</span><span class="tx">${esc(String(tx).replace(/\s*\u2014\s*/g, '--'))}</span></div>`;

// ---------------------------------------------------------------- season blurbs

// Hand-written from the show. Anything countable is counted from the data.
const BLURB = {
  1: (D, s) => `${cap(nw(s.episodes))} episodes, shot close to the British original. Michael is meaner here, and a second season was not a sure thing.`,
  2: () => 'The show finds its voice. Michael gets softer, Jim and Pam get complicated, and it ends at Casino Night.',
  3: (D, s) => `Jim transfers to Stamford and comes back with Karen and Andy. The branches merge.${top(D, s) ? ' Highest average rating of any season.' : ''}`,
  4: (D, s) => {
    const eps = D.episodes.slice(s.first, s.last + 1);
    let lead = 0;
    while (eps[lead]?.hour) lead++;
    return `Cut short by the 2007-08 writers’ strike, with ${nw(lead)} hour-long episodes up front. Ryan runs corporate until he’s arrested in the finale, the same episode where Toby leaves for Costa Rica and Holly arrives.`;
  },
  5: (D, s) => {
    const sb = D.episodes[D.findings.superBowl];
    const counts = D.seasons.map((x) => streamCount(D.episodes.slice(x.first, x.last + 1)));
    const mine = counts[s.n - 1];
    const longest = counts.every((c, i) => i === s.n - 1 || c < mine);
    return `${longest ? `The longest season, ${mine} episodes the way streaming counts them. ` : ''}Michael falls for Holly, ${sb.s === s.n ? `a Super Bowl episode pulls ${sb.v.toFixed(1)} million viewers, ` : ''}and he quits to start a rival paper company.`;
  },
  6: () => 'Jim and Pam get married at Niagara Falls and have a baby. Jim becomes co-manager. Sabre buys Dunder Mifflin.',
  7: () => 'Michael’s last season. Holly comes back, he proposes, and he leaves for Colorado in “Goodbye, Michael”.',
  8: (D, s) => `Andy is manager, Robert California is CEO, and part of the season moves to Tallahassee.${bottom(D, s) ? ' Lowest-rated season.' : ''}`,
  9: () => 'The documentary airs. Andy sails away, Jim splits his time with Philadelphia, and the finale brings back almost everyone.',
};
const top = (D, s) => D.seasons.every((x) => x === s || x.avgRating < s.avgRating);
const bottom = (D, s) => D.seasons.every((x) => x === s || x.avgRating > s.avgRating);

// ---------------------------------------------------------------- episode rows (people.js uses these too)

// A solid TWSS flag is counted in the transcript. A dashed one is only on the fan wiki's list, so it gets no count.
const flags = (e) => {
  const f = [];
  if (e.hour) f.push('<span class="flag alt" title="Aired as one hour. Streaming counts it as two episodes">HOUR-LONG</span>');
  if (e.twss) f.push(`<span class="flag" title="That’s what she said: ${esc(fmt.times(e.twss))} in the transcript">TWSS</span>`);
  else if (e.twssWiki) f.push('<span class="flag wiki" title="That’s what she said, per the fan wiki. It isn’t in the transcript">TWSS</span>');
  return f.length ? `<span class="ep-flags">${f.join('')}</span>` : '';
};

// Legend for the share strips: the coloured people who actually appear in these episodes' strips.
function stripLegend(D, eps, lead) {
  const inStrips = new Set(eps.flatMap((e) => e.top.map((t) => t.k)));
  const slotted = (D.byLines || D.characters).map((c) => c.key).filter((k) => hasSlot(k) && inStrips.has(k));
  const others = [...inStrips].some((k) => !hasSlot(k));
  return `${lead} ${slotted.map((k) => `<span><i class="sq" style="background:${color(k)}"></i>${esc(k)}</span>`).join('')}${others ? '<span><i class="sq" style="background:var(--other)"></i>Others</span>' : ''}`;
}

// o.no replaces the number on the left (a rank, say), o.chip adds a chip after the title, o.code puts "S4 · E13" in the meta line.
// The number span stays exactly <span class="ep-no">…</span> so callers can swap it out.
export function epRow(e, D, o = {}) {
  const no = String(o.no ?? e.se);
  return `
  <a class="ep-row${no.length > 3 ? ' long-no' : ''}" href="#/episode/${e.id}"${o.noTitle ? ` title="${esc(o.noTitle)}"` : ''}>
    <span class="ep-no">${esc(no)}</span>
    <span style="min-width:0">
      <span class="ep-t">${esc(e.t)}</span>${flags(e)}${o.chip ? ` ${o.chip}` : ''}
      <span class="ep-m" style="display:block">${o.code ? `${epCode(e)} · ` : ''}${fmt.date(e.date)} · Dir. ${esc(e.dir.join(', '))} · Wr. ${esc(e.wri.join(', '))}</span>
    </span>
    ${seqThumb(e)}
    <span class="rating">${e.r.toFixed(1)}</span>
    <span class="ep-go" aria-hidden="true">→</span>
  </a>`;
}

export function badges(D, list) {
  const max = Math.max(...D.characters.map((c) => c.lines));
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

// ---------------------------------------------------------------- home

export function home(D) {
  const T = D.totals;
  const F = D.findings;
  const E = D.episodes;
  const { best: tops, worst: lows } = extremes(E);
  const mich = D.char.Michael;
  const S = D.seasons;
  const gone = S.length - E[F.goodbye].s;

  const mGap = F.michaelRating.meanA - F.michaelRating.meanB;
  const hGap = F.hour.meanA - F.hour.meanB;
  const hmGap = F.hourMichael ? F.hourMichael.meanA - F.hourMichael.meanB : null;
  const tw = F.twssBy[0];
  // The Andy split isn't stored as a season, so find the season that gives the early group its size.
  const andyEps = D.codes?.Andy ? E.filter((e) => e.c[D.codes.Andy]) : [];
  const andyCut = S.map((s) => s.n).find((n) => andyEps.filter((e) => e.s <= n).length === F.andy.early.n);
  const andySplit = andyCut ? `Split it after season ${andyCut}` : 'Split it into early and late seasons';

  return {
    title: '',
    html: `
    <section class="hero">
      <div class="wrap">
        <div class="hero-row page-head" style="padding:0">
          <div>
            <p class="eyebrow">A fan analysis · ${yearSpan(S[0].year, S[S.length - 1].endYear)}</p>
            <h1>The Office, <em>by the numbers.</em></h1>
            <p class="lede">${cap(nw(S.length))} seasons, ${T.episodes} episodes and ${fmt.int(T.lines)} lines of dialogue. I counted who said what, who wrote it, who directed it, and how people rated it. Some of it confirms what fans already think. Some of it doesn't.</p>
            <div class="hero-actions">
              <a class="btn" href="#/seasons">Pick a season ${arrow}</a>
              <a class="btn ghost" href="#/characters">Pick a character</a>
              <a class="btn ghost" href="#/quiz">Play Who Said It?</a>
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
            <span><b>Every episode, rated.</b> One bar per episode in air order. Height is the IMDb score, and the scale starts at 6. <span style="color:var(--accent);font-weight:600">Blue</span> is the Michael era.</span>
            <span>Top: ${join(tops.map(epA))}, ${tops.length === 2 ? 'both ' : tops.length > 2 ? 'all ' : ''}${tops[0].r.toFixed(1)} · <a class="pg-link" href="#/episodes">See all ${E.length}, ranked</a></span>
          </div>
          <div id="sky"></div>
        </div>
      </div>
    </section>

    ${thisWeek(D)}

    ${playRow(D)}

    <section class="section">
      <div class="wrap">
        <div class="section-head rv">
          <div><p class="eyebrow">Seasons</p><h2>Pick a season.</h2></div>
          <a class="link-arrow" href="#/seasons">All ${nw(S.length)} side by side</a>
        </div>
        <div class="season-rail">
          ${S.map((s, i) => seasonCard(s, D, i)).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head rv">
          <div><p class="eyebrow">Findings</p><h2>Four things the data says.</h2></div>
          <a class="link-arrow" href="#/findings">The full write-up</a>
        </div>
        <div class="grid g4 play-grid">
          <a class="card teaser rv" href="#/findings@michael">
            <span class="big">${mGap.toFixed(2)}</span>
            <p>IMDb points lost after Michael leaves. The average goes from ${F.michaelRating.meanA.toFixed(2)} to ${F.michaelRating.meanB.toFixed(2)}, and viewers drop from ${fmt.m(F.michaelViewers.meanA)} to ${fmt.m(F.michaelViewers.meanB)}.</p>
            <span class="link-arrow">The Michael effect</span>
          </a>
          <a class="card teaser rv" style="--d:.06s" href="#/findings@twss">
            <span class="big">${F.twssCount}</span>
            <p>Times someone says “that’s what she said” in the transcript. Episodes with one rate higher, until you notice ${esc(tw.k)} says ${tw.n} of them.</p>
            <span class="link-arrow">That’s what she said</span>
          </a>
          <a class="card teaser rv" style="--d:.12s" href="#/findings@hour">
            <span class="big">${fmt.signed(hGap)}</span>
            <p>How much higher hour-long episodes rate than regular ones. ${hGap > mGap ? `That’s a bigger gap than Michael leaving (${mGap.toFixed(2)})` : `Michael leaving is still the bigger gap (${mGap.toFixed(2)})`}${hmGap != null ? `, and it still holds counting only episodes up to “${esc(E[F.goodbye].t)}” (${fmt.signed(hmGap)}).` : '.'}</p>
            <span class="link-arrow">Hour-long episodes</span>
          </a>
          <a class="card teaser rv" style="--d:.18s" href="#/findings@andy">
            <span class="big">${fmt.num(F.andy.all.r)}</span>
            <p>Correlation between how much Andy talks in an episode and its rating. ${andySplit} and it shrinks to ${fmt.num(F.andy.early.r)} and ${fmt.num(F.andy.late.r)}. It’s mostly the era, not Andy.</p>
            <span class="link-arrow">The Andy problem</span>
          </a>
        </div>
        <div class="grid g-7-5 mt2 home-nugget-row">
          ${nugget(D)}
          <div class="sticky-note rv home-note" style="--d:.1s">Michael has <b>${fmt.int(mich.lines)}</b> lines in ${mich.episodes} episodes.<br>That is ${fmt.pct(mich.share)} of everything said in the show, and that counts the ${nw(gone)} seasons after he leaves.</div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head rv">
          <div><p class="eyebrow">Characters</p><h2>Or pick a person.</h2></div>
          <a class="link-arrow" href="#/characters">Compare everyone</a>
        </div>
        <div class="badge-rail">${badges(D, (D.byLines || D.characters).slice(0, 12))}</div>
      </div>
    </section>`,
    after() { skyline($('#sky'), D); },
  };
}

// The famous-lines nugget: what the script actually has.
function nugget(D) {
  const Q = D.quotes || [];
  const bb = Q.find((q) => q.q.startsWith('bears beets'));
  const it = Q.find((q) => q.q.startsWith('identity theft'));
  const mug = Q.find((q) => q.q === 'worlds best boss');
  const ph = (label) => D.phrases.find((p) => p.label === label)?.speakers[0];
  const beets = ph('beet or beets'), cornell = ph('Cornell'), wuphf = ph('WUPHF');
  const facts = [
    beets && `${esc(beets.k)} says “beet” or “beets” ${fmt.times(beets.n)}.`,
    cornell && `${esc(cornell.k)} brings up Cornell ${fmt.times(cornell.n)}.`,
    wuphf && `${esc(wuphf.k)} says “WUPHF” ${fmt.times(wuphf.n)}, which is ${wuphf.n} more than anyone asked for.`,
  ].filter(Boolean).join(' ');
  let lead = '';
  if (bb && it && bb.n === 1 && it.n === 1 && bb.ep === it.ep && bb.ep != null) {
    const ep = D.episodes[bb.ep];
    // Both lines sit in the transcript's opening rows of Product Recall (rows 9 and 15), the scene where Jim dresses as Dwight.
    const ql = (q) => `“<a href="${esc(searchHref(q.q))}">${esc(q.label)}</a>”`;
    lead = `<p><strong>Two of the most quoted lines in the show are each said exactly once, in the same scene.</strong> ${ql(bb)} and ${ql(it)} both come from the opening scene of ${epA(ep)}: ${esc(bb.who)} dressed as Dwight, and ${esc(it.who)} not enjoying it. In ${fmt.int(D.totals.lines)} lines, neither one comes up again.</p>`;
  } else if (bb && bb.ep != null) {
    lead = `<p><strong>“Bears. Beets. Battlestar Galactica.”</strong> is said ${fmt.times(bb.n)}, by ${esc(bb.who)}, in ${epA(D.episodes[bb.ep])}.</p>`;
  }
  const mugLine = mug && mug.n === 0 ? ' Nobody ever says “World’s best boss” out loud. It’s only on the mug.' : '';
  if (!lead && !facts) return '';
  return `<div class="prose rv home-nugget">${lead}<p>${facts}${mugLine} <a href="#/dialogue">Search every line yourself.</a></p></div>`;
}

// ---------------------------------------------------------------- home: this week in Office history

function thisWeek(D, now = new Date()) {
  const DAY = 864e5;
  const y0 = now.getFullYear();
  const t0 = Date.UTC(y0, now.getMonth(), now.getDate());
  // The nearest anniversary of each air date: last year's, this year's or next year's.
  const all = D.episodes.map((e) => {
    const [y, m, d] = e.date.split('-').map(Number);
    let best = null;
    for (const yy of [y0 - 1, y0, y0 + 1]) {
      const off = Math.round((Date.UTC(yy, m - 1, d) - t0) / DAY);
      if (!best || Math.abs(off) < Math.abs(best.off)) best = { e, off, years: yy - y };
    }
    return best;
  });
  const near = all.filter((x) => Math.abs(x.off) <= 3).sort((a, b) => Math.abs(a.off) - Math.abs(b.off) || a.off - b.off || a.e.id - b.e.id);
  const day = (off) => (off === 0 ? 'Today' : off === -1 ? 'Yesterday' : off === 1 ? 'Tomorrow' : off < 0 ? `${-off} days ago` : `In ${off} days`);
  const md0 = (e) => new Date(`${e.date}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  const ago = ({ e, off, years }) => (off === 0 ? `${years} years ago today` : off < 0 ? `${years} years ago`
    : off === 1 ? `${years} years tomorrow` : off <= 3 ? `${years} years in ${off} days` : `${years} years on ${md0(e)}`);
  const card = (x, i) => `<a class="tw-card rv" style="--d:${(i * 0.04).toFixed(2)}s" href="#/episode/${x.e.id}">
      <span class="tw-when${x.off === 0 ? ' now' : ''}">${day(x.off)}</span>
      <span class="tw-t">${esc(x.e.t)}</span>
      <span class="tw-m">${epCode(x.e)} · ${fmt.date(x.e.date)}</span>
      <span class="tw-y">${ago(x)}</span>
      <span class="tw-n"><span class="rating">${x.e.r.toFixed(1)}</span><span>${fmt.m(x.e.v)} viewers</span></span>
    </a>`;

  const md = (now.getMonth() + 1) * 100 + now.getDate();
  const month = (e) => +e.date.slice(5, 7);
  // The data flags holiday episodes; the month says which holiday.
  const themes = [
    { on: md >= 1025 && md <= 1031, eps: D.episodes.filter((e) => e.holiday && month(e) === 10), head: (n) => `${md === 1031 ? 'It’s Halloween' : 'It’s Halloween week'}, so here are all ${nw(n)} Halloween episodes, best first.` },
    { on: md >= 1201 && md <= 1225, eps: D.episodes.filter((e) => e.holiday && month(e) === 12), head: (n) => `It’s December, so here are all ${nw(n)} Christmas episodes, best first.` },
  ];
  const theme = themes.find((t) => t.on && t.eps.length);
  let themeHtml = '';
  if (theme) {
    const list = [...theme.eps].sort((a, b) => b.r - a.r || a.id - b.id);
    themeHtml = `<div class="sticky-note tw-theme rv"><p>${theme.head(list.length)}</p><ol>${list.map((e) => `<li><a href="#/episode/${e.id}">${esc(e.t)}</a><span>${e.date.slice(0, 4)} · ${e.r.toFixed(1)}</span></li>`).join('')}</ol></div>`;
  } else if (md >= 125 && md <= 208) {
    const sb = D.episodes[D.findings.superBowl];
    const avgV = D.episodes.reduce((s, e) => s + e.v, 0) / D.episodes.length;
    const most = D.episodes.every((e) => e === sb || e.v < sb.v);
    themeHtml = `<div class="sticky-note tw-theme rv"><p>Super Bowl season. ${epA(sb)} aired right after the game on ${fmt.date(sb.date)}, and drew ${fmt.m(sb.v)} viewers${most ? ', the most of any episode' : ''}, about ${(sb.v / avgV).toFixed(1)} times the show’s average.</p></div>`;
  }

  const today = now.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' });
  let body, h2, sub;
  if (near.length) {
    body = `<div class="tw-rail">${near.map(card).join('')}</div>`;
    h2 = 'Aired this week.';
    sub = `${esc(today)}. Episodes that first aired within three days of today’s date, any year.`;
  } else {
    // A quiet week, which is 127 days a year. Point at the next anniversary instead.
    const next = all.filter((x) => x.off > 0).sort((a, b) => a.off - b.off || a.e.id - b.e.id)[0];
    body = `<div class="tw-rail">${card(next, 0)}</div>`;
    h2 = 'Next up.';
    sub = `${esc(today)}. Nothing first aired within three days of today’s date, in any year, so here’s the next anniversary.`;
  }
  return `<section class="section tw">
    <div class="wrap">
      <div class="section-head rv">
        <div><p class="eyebrow">This week in Office history</p><h2>${h2}</h2></div>
        <p class="small muted tw-sub">${sub}</p>
      </div>
      <div class="tw-grid${themeHtml ? ' has-theme' : ''}">${body}${themeHtml}</div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- home: things to play with

function playRow(D) {
  const E = D.episodes;
  const mich = D.char.Michael;
  const oneIn = Math.round(100 / mich.share);
  const apol = (D.dundies || []).find((d) => d.id === 'most-apologetic');
  const says = (c) => (c.aSays >= c.bSays ? { who: c.a, whom: c.b, n: c.aSays } : { who: c.b, whom: c.a, n: c.bSays });
  const cs = (D.couples || []).map((c) => ({ c, ...says(c) })).sort((a, b) => b.n - a.n);
  const jp = cs.find((x) => [x.c.a, x.c.b].sort().join() === 'Jim,Pam');
  const loud = cs[0];
  const { worst: lows } = extremes(E);
  // Plain quoted titles here: the whole card is already a link.
  const qt = (e) => `“${esc(e.t)}”`;
  const lowText = lows.length === 1 ? `${qt(lows[0])} is alone at the bottom, at ${lows[0].r.toFixed(1)}.` : `${join(lows.map(qt))} share the bottom, at ${lows[0].r.toFixed(1)}.`;
  const cards = [
    { h: '#/quiz', t: 'Who Said It?', big: fmt.pct(mich.share, 0), p: `of every line in the show is Michael’s, so guessing “Michael” every time gets you about one in ${nw(oneIn)}. Five lines a day. Try to do better.`, go: 'Play today’s five' },
    D.dundies?.length && { h: apol ? '#/dundies@most-apologetic' : '#/dundies', t: 'The Dundies', big: D.dundies.length, p: `awards, handed out by the data instead of Michael. ${apol ? 'This year’s Dundie for Most Apologetic goes to…' : ''}`, go: 'Open the envelopes' },
    loud && { h: '#/couples', t: 'Couples Discount', big: fmt.int(loud.n), p: `times ${esc(loud.who)} says “${esc(loud.whom)}”.${jp && jp !== loud ? ` ${esc(jp.who)} says “${esc(jp.whom)}” ${fmt.times(jp.n)}. The show’s most intense pair isn’t Jim and Pam.` : ''}`, go: 'See the ships' },
    { h: '#/episodes', t: 'Every episode, ranked', big: E.length, p: `episodes, best to worst, ties and all. ${lowText}`, go: 'See the list' },
  ].filter(Boolean);
  return `<section class="section play">
    <div class="wrap">
      <div class="section-head rv">
        <div><p class="eyebrow">Play</p><h2>Things to do besides read.</h2></div>
      </div>
      <div class="grid g4 play-grid">${cards.map((c, i) => `
        <a class="card teaser play-card rv" style="--d:${(i * 0.06).toFixed(2)}s" href="${c.h}">
          <span class="play-t">${esc(c.t)}</span>
          <span class="big">${c.big}</span>
          <p>${c.p}</p>
          <span class="link-arrow">${esc(c.go)}</span>
        </a>`).join('')}
      </div>
    </div>
  </section>`;
}

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

// ---------------------------------------------------------------- all seasons

export function seasons(D) {
  const S = D.seasons;
  const E = D.episodes;
  const byAvg = [...S].sort((a, b) => b.avgRating - a.avgRating);
  const bestS = byAvg[0], worstS = byAvg[byAvg.length - 1];
  const byView = [...S].sort((a, b) => b.avgViewers - a.avgViewers);
  const sb = E[D.findings.superBowl];
  const sbS = S[sb.s - 1];
  const without = (sbS.avgViewers * sbS.episodes - sb.v) / (sbS.episodes - 1);
  const rankWithout = 1 + S.filter((s) => s !== sbS && s.avgViewers > without).length;
  const viewLine = byView[0] === sbS && rankWithout > 1
    ? `Season ${sbS.n} drew the most viewers, mostly because ${epA(sb)} aired after the Super Bowl. Without it, season ${sbS.n} would rank ${fmt.ordinal(rankWithout)}.`
    : `Season ${byView[0].n} drew the most viewers.`;

  // Spread: how far apart the best and worst episodes of each season are.
  const bySd = [...S].sort((a, b) => b.sd - a.sd);
  const wide = bySd[0];
  const tight = [...S].sort((a, b) => a.sd - b.sd).slice(0, 3).sort((a, b) => a.n - b.n);
  const wideEx = extremes(E.slice(wide.first, wide.last + 1));
  const medBest = [...S].sort((a, b) => b.median - a.median)[0];
  const tLo = Math.min(...tight.map((s) => s.sd)), tHi = Math.max(...tight.map((s) => s.sd));

  // Share of each season's lines: the top five by lines, then everyone else, so every bar adds up to 100.
  const top5 = (D.byLines || D.characters).slice(0, 5).map((c) => c.key);
  const rest = S.map((_, i) => Math.max(0, 100 - top5.reduce((a, k) => a + D.char[k].perSeasonShare[i], 0)));
  const shareSeries = [...top5.map((k) => ({ name: k, color: color(k), values: D.char[k].perSeasonShare })), { name: 'Everyone else', color: 'var(--other)', values: rest }];
  const lastM = E[D.findings.goodbye].s; // Michael's last season
  let shareNote = '';
  if (lastM < S.length) {
    const deltas = shareSeries.filter((x) => x.name !== 'Michael').map((x) => ({ name: x.name, d: x.values[lastM] - x.values[lastM - 1] })).sort((a, b) => b.d - a.d);
    const mDrop = D.char.Michael.perSeasonShare[lastM - 1] - D.char.Michael.perSeasonShare[lastM];
    const nm = (x) => (x.name === 'Everyone else' ? 'everyone else' : esc(x.name));
    shareNote = ` From season ${lastM} to ${lastM + 1}, Michael’s share drops by ${mDrop.toFixed(0)} points, and most of it goes to ${nm(deltas[0])} (+${deltas[0].d.toFixed(1)}) and ${nm(deltas[1])} (+${deltas[1].d.toFixed(1)}).`;
  }
  const pctTxt = (v) => (v > 0 && v < 1 ? '<1%' : `${v.toFixed(0)}%`);

  return {
    title: 'Seasons',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Seasons</p>
      <h1>${cap(nw(S.length))} seasons, <em>side by side.</em></h1>
      <p class="lede">Season ${bestS.n} has the best average rating, ${bestS.avgRating.toFixed(2)}, and season ${worstS.n} the worst, ${worstS.avgRating.toFixed(2)}. ${viewLine}</p>
    </section>
    <section class="wrap">
      <div class="season-rail">${S.map((s, i) => seasonCard(s, D, i)).join('')}</div>
    </section>
    <section class="section wrap">
      <div class="card rv">
        <div class="card-head">
          <div><h3 class="card-title">Every episode, by season</h3><p class="card-sub">Each dot is one episode’s IMDb rating. The shaded band holds the middle half of the season, and the dark tick is the median. Hover or tap a dot for the episode.</p></div>
          <a class="link-arrow small" href="#/episodes">See all ${E.length}, ranked</a>
        </div>
        <div id="c-strip"></div>
        <p class="small muted mt sp-note">Season ${wide.n} is the most spread out (SD ${wide.sd.toFixed(2)}), from ${join(wideEx.worst.map(epA))} at ${wideEx.worst[0].r.toFixed(1)} to ${join(wideEx.best.map(epA))} at ${wideEx.best[0].r.toFixed(1)}. Seasons ${join(tight.map((s) => String(s.n)))} are the tightest, ${tLo.toFixed(2)} to ${tHi.toFixed(2)}. Season ${medBest.n} has the best median, ${medBest.median.toFixed(1)}.</p>
      </div>
      <div class="grid g2 mt">
        <div class="card rv">
          <h3 class="card-title">Average US viewers, millions</h3>
          <p class="card-sub">Live viewers on first airing. Streaming came later.</p>
          <div id="c-viewers"></div>
        </div>
        <div class="card rv" style="--d:.06s">
          <h3 class="card-title">Share of each season’s dialogue</h3>
          <p class="card-sub">The five people with the most lines, and everyone else. Each bar adds up to 100%.${shareNote}</p>
          <div class="legend">${shareSeries.map((x) => `<span><i class="sq" style="background:${x.color}"></i>${esc(x.name)}</span>`).join('')}</div>
          <div id="c-share"></div>
        </div>
      </div>
      <div class="mt">
        ${tableView([
          { h: 'Season', k: 'n' }, { h: 'Episodes', k: 'episodes', r: 1 }, { h: 'Avg IMDb', f: (r) => r.avgRating.toFixed(2), r: 1 },
          { h: 'Median', f: (r) => r.median.toFixed(2), r: 1 }, { h: 'SD', f: (r) => r.sd.toFixed(2), r: 1 },
          { h: 'Avg viewers', f: (r) => fmt.m(r.avgViewers), r: 1 }, { h: 'Lines', f: (r) => fmt.int(r.lines), r: 1 }, { h: 'TWSS', k: 'twss', r: 1 },
          ...shareSeries.map((x) => ({ h: x.name, f: (r) => pctTxt(x.values[r.n - 1]), r: 1 })),
        ], S)}
      </div>
    </section>`,
    after() {
      const cats = S.map((s) => `S${s.n}`);
      seasonStrip($('#c-strip'), D);
      columns($('#c-viewers'), { cats, series: [{ name: 'Average viewers', color: 'var(--accent)', values: S.map((s) => s.avgViewers) }], fmtv: (v) => v.toFixed(v % 1 ? 1 : 0) + 'M', href: (it) => `#/season/${it.ci + 1}`, label: 'Average US viewers by season' });
      columns($('#c-share'), { cats, height: 260, stacked: true, max: 100, fmtv: pctTxt, series: shareSeries, href: (it) => `#/season/${it.ci + 1}`, label: 'Share of each season’s lines' });
    },
  };
}

// ---------------------------------------------------------------- one season

export function season(D, n) {
  const s = D.seasons[n - 1];
  if (!s) return null;
  const E = D.episodes;
  const eps = E.slice(s.first, s.last + 1);
  const { best, worst } = extremes(eps);
  const viewMax = eps.reduce((a, b) => (b.v > a.v ? b : a));
  const prev = D.seasons[n - 2], next = D.seasons[n];
  const showAvg = D.meta.avg;

  const nHour = eps.filter((e) => e.hour).length;
  const stream = streamCount(eps);
  const pairs = [...new Set(eps.filter((e) => e.approx).map(partBase))];
  const epNote = nHour
    ? `${nHour} hour-long, so ${stream} on streaming`
    : pairs.length ? `${join(pairs.map(esc))} each aired as one hour but count as two` : 'All half-hour';
  const twEps = eps.filter((e) => e.twss);
  const twWiki = eps.filter((e) => e.twssWiki && !e.twss);
  const twNote = (!s.twss ? 'Not once in the transcript'
    : twEps.length === 1 ? `${s.twss === 1 ? 'Once' : 'All of them'}, in ${esc(twEps[0].t)}`
    : `Times in the transcript, across ${twEps.length} episodes`)
    + (twWiki.length ? `. The fan wiki lists ${twWiki.length === 1 ? 'one more episode' : `${nw(twWiki.length)} more episodes`}, flagged with a dashed outline` : '');
  // Niagara and The Delivery carry one viewer figure for the whole hour, on both halves.
  const peak = viewMax.approx ? `${esc(partBase(viewMax))}, ${fmt.m(viewMax.v)} for the hour` : `${esc(viewMax.t)}, ${fmt.m(viewMax.v)}`;

  // First lines from anyone with a real part (150+ lines) who starts talking this season.
  const fresh = n > 1 ? D.characters.filter((c) => E[c.first].s === n && c.lines > 150) : [];
  const freshBy = {};
  fresh.forEach((c) => (freshBy[c.first] ??= []).push(c));
  const freshText = Object.entries(freshBy).sort((a, b) => a[0] - b[0]).map(([id, cs]) => `${join(cs.map(fullA))} in ${epA(E[id])}`);

  const dirs = {};
  eps.forEach((e) => e.dir.forEach((d) => (dirs[d] = (dirs[d] || 0) + 1)));
  const dMax = Math.max(...Object.values(dirs));
  const topDirs = Object.keys(dirs).filter((d) => dirs[d] === dMax);
  const dirText = dMax === 1
    ? `${cap(nw(Object.keys(dirs).length))} directors, one episode each.`
    : topDirs.length === 1
      ? `${personA(D, topDirs[0])} directed the most episodes this season, ${nw(dMax)}.`
      : `${join(topDirs.map((d) => personA(D, d)))} each directed ${nw(dMax)}, the most this season.`;

  const bw = (label, list) => `<div class="bw"><span class="chip">${label} · ${list[0].r.toFixed(1)}</span><span>${join(list.map(epA))}${list.length > 1 ? `, tied` : ''}</span></div>`;

  return {
    title: `Season ${n}`,
    html: `
    <nav class="subnav" aria-label="Seasons"><div class="wrap"><span class="label">Season</span>
      <div class="pills scroll">${D.seasons.map((x) => `<a class="pill ${x.n === n ? 'on' : ''}" href="#/season/${x.n}"${x.n === n ? ' aria-current="page"' : ''}>${x.n}</a>`).join('')}</div>
    </div></nav>
    <section class="wrap page-head">
      <div class="crumbs"><a href="#/seasons">Seasons</a><span>/</span><span>Season ${n}</span></div>
      <div class="season-hero">
        <span class="giant" aria-hidden="true">${n}</span>
        <div>
          <p class="eyebrow">${yearSpan(s.year, s.endYear)}</p>
          <h1 style="font-size:clamp(40px,6vw,72px)">Season ${n}</h1>
          <p class="lede">${esc(BLURB[n](D, s))}</p>
        </div>
      </div>
    </section>
    <section class="wrap">
      <div class="stats rv">
        <div class="stat"><div class="stat-label">Episodes</div><div class="stat-value">${count(s.episodes)}</div><div class="stat-note">${epNote}</div></div>
        <div class="stat"><div class="stat-label">Average IMDb</div><div class="stat-value">${count(s.avgRating, 2)}</div><div class="stat-note ${s.avgRating >= showAvg ? 'delta-up' : 'delta-down'}">${fmt.signed(s.avgRating - showAvg)} vs the show</div></div>
        <div class="stat"><div class="stat-label">Average viewers</div><div class="stat-value">${count(s.avgViewers, 1)}<small>M</small></div><div class="stat-note">Peak: ${peak}</div></div>
        <div class="stat"><div class="stat-label">Lines spoken</div><div class="stat-value">${count(s.lines)}</div><div class="stat-note">${fmt.int(s.lines / s.episodes)} per episode</div></div>
        <div class="stat"><div class="stat-label">That’s what she said</div><div class="stat-value">${small(s.twss)}</div><div class="stat-note">${twNote}</div></div>
      </div>
    </section>
    <section class="section wrap">
      <div class="card rv">
        <div class="card-head">
          <div><h3 class="card-title">Every episode in season ${n}</h3><p class="card-sub">IMDb rating by episode, numbered the way streaming does it. Hover or tap a dot, click to open it.</p></div>
        </div>
        <div class="bw-list">${bw('Best', best)}${bw('Worst', worst)}</div>
        <div id="lolli"></div>
      </div>
      <div class="grid g-7-5 mt">
        <div class="card rv">
          <h3 class="card-title">Who talked</h3>
          <p class="card-sub">Share of the season’s ${fmt.int(s.lines)} lines.</p>
          ${hbars(s.speakers.map((x) => ({ label: x.k, v: (x.n / s.lines) * 100, color: color(x.k), dot: color(x.k), k: x.k })), { fmtv: (v) => fmt.pct(v), href: (r) => (D.char[r.k] ? `#/character/${slug(r.k)}` : null) })}
        </div>
        <div class="card rv" style="--d:.06s">
          <h3 class="card-title">Words of the season</h3>
          <p class="card-sub">Words said far more this season than in the other ${nw(D.seasons.length - 1)}. Bigger means more unusual, and the small number is how many times. Each one opens a search.</p>
          ${wordLinks(s.signature, 12)}
          ${freshText.length ? `<p class="small muted mt">First lines from ${join(freshText)}.</p>` : ''}
          <p class="small muted">${dirText}</p>
        </div>
      </div>
    </section>
    <section class="wrap">
      <div class="section-head rv"><div><p class="eyebrow">Episodes</p><h2>All ${s.episodes}.</h2></div>
        <div class="legend seq-legend" style="margin:0">${stripLegend(D, eps, 'Each strip shows who talked most in the episode.')}</div>
      </div>
      <div class="ep-list rv">${eps.map((e) => epRow(e, D)).join('')}</div>
      <div class="pager">
        ${prev ? `<a href="#/season/${prev.n}"><small>Previous</small><span>Season ${prev.n}</span></a>` : '<span style="flex:1"></span>'}
        ${next ? `<a class="next" href="#/season/${next.n}"><small>Next</small><span>Season ${next.n}</span></a>` : `<a class="next" href="#/episodes"><small>Next</small><span>Every episode, ranked</span></a>`}
      </div>
    </section>`,
    after() { lollipops($('#lolli'), eps, { avg: s.avgRating, label: `Season ${n} episode ratings` }); },
  };
}

// ---------------------------------------------------------------- every episode, ranked

const METRICS = {
  r: { label: 'IMDb', get: (e) => e.r, word: 'IMDb rating' },
  votes: { label: 'Votes', get: (e) => e.votes || 0, word: 'IMDb votes' },
  vs: { label: 'Vs its season', get: null, word: 'rating against its own season' },
  v: { label: 'Viewers', get: (e) => e.v, word: 'US viewers' },
};
const RK_DEFAULT = { sort: 'r', desc: true, seasons: [], era: 'all', hour: false };

export function episodes(D) {
  const E = D.episodes;
  const S = D.seasons;
  const G = D.findings.goodbye;
  const vs = (e) => e.r - S[e.s - 1].avgRating;
  const get = (k) => (k === 'vs' ? vs : METRICS[k].get);
  // Ranks are against all 188, whatever the filters, so a filtered list keeps the real rank.
  const ranks = {};
  for (const k of Object.keys(METRICS)) {
    const g = get(k);
    ranks[k] = new Map(E.map((e) => [e.id, rankOf(E, e, g)]));
  }

  // The filters live in this page's history entry: Back from an episode brings them back,
  // and any fresh link to the list starts from the default.
  const RK = { ...RK_DEFAULT, seasons: [] };
  const saved = history.state && history.state.rk;
  if (saved && METRICS[saved.sort]) {
    RK.sort = saved.sort;
    RK.desc = saved.desc !== false;
    RK.seasons = Array.isArray(saved.seasons) ? saved.seasons.filter((n) => S[n - 1]) : [];
    RK.era = ['all', 'with', 'after'].includes(saved.era) ? saved.era : 'all';
    RK.hour = !!saved.hour;
  }
  const save = () => {
    try { history.replaceState({ ...(history.state || {}), rk: { ...RK, seasons: [...RK.seasons] } }, ''); } catch (err) { /* state is a nicety */ }
  };

  const { best: tops, worst: lows } = extremes(E);
  const asc = [...E].sort((a, b) => a.r - b.r);
  const cutR = asc[19].r;
  const lowSet = E.filter((e) => tenths(e.r) <= tenths(cutR));
  const lowAfter = lowSet.filter((e) => e.id > G).length;
  const mLow = E.filter((e) => e.id <= G).sort((a, b) => a.r - b.r);
  const under = E.filter((e) => tenths(e.r) < tenths(mLow[1].r));
  const onlyM = under.filter((e) => e.id <= G);
  const byVs = [...E].sort((a, b) => vs(b) - vs(a));
  const vsTop = byVs[0], vsLow = byVs[byVs.length - 1];

  const lede = `${join(tops.map(epA))} ${tops.length > 1 ? 'tie at the top' : 'is on top'}, ${tops[0].r.toFixed(1)}. ${lows.length === 1 ? `${epA(lows[0])} is alone at the bottom` : `${join(lows.map(epA))} share the bottom`}, ${lows[0].r.toFixed(1)}. Of the ${lowSet.length} episodes rated ${cutR.toFixed(1)} or lower, ${lowAfter} aired after ${epA(E[G])}.`;
  // The Banker is the season 6 clip show; that part is from the show, not the data.
  const lede2 = onlyM.length === 1 ? `Below ${mLow[1].r.toFixed(1)}, ${epA(onlyM[0])} is the only episode from Michael’s run${onlyM[0].t === 'The Banker' ? ', and it’s a clip show' : ''}.` : '';

  const toggle = (id, opts, cur) => `<div class="toggle" id="${id}" role="group">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}">${esc(l)}</button>`).join('')}</div>`;

  const chipFor = (e, k) => {
    const d = vs(e);
    const c = `<span class="ep-chip ${d >= 0 ? 'up' : 'down'}" title="Against the season ${e.s} average of ${S[e.s - 1].avgRating.toFixed(2)}">${fmt.signed(d)} vs S${e.s}</span>`;
    if (k === 'votes') return `<span class="ep-chip">${fmt.int(e.votes || 0)} votes</span>${c}`;
    if (k === 'v') return `<span class="ep-chip">${fmt.m(e.v)} viewers</span>${c}`;
    return c;
  };

  // Every row is built once. A new sort only rewrites each row's rank and chips, and a filter
  // only changes which rows are in the list, so a tap doesn't re-parse 188 rows on a phone.
  const nodes = new Map();
  const rowFor = (e) => {
    if (!nodes.size) {
      // One parse for all 188.
      const t = document.createElement('template');
      t.innerHTML = E.map((x) => epRow(x, D, { no: '', chip: '<span class="rk-chips"></span>', code: true })).join('');
      [...t.content.children].forEach((el, i) => nodes.set(E[i].id, el));
    }
    const el = nodes.get(e.id);
    if (el.dataset.k !== RK.sort) {
      const rk = ranks[RK.sort].get(e.id);
      el.querySelector('.ep-no').textContent = rk.label;
      el.classList.toggle('long-no', rk.label.length > 3);
      el.title = rk.ties ? `Tied with ${fmt.plural(rk.ties, 'other episode')} on ${METRICS[RK.sort].word}` : `Rank on ${METRICS[RK.sort].word}`;
      el.querySelector('.rk-chips').innerHTML = chipFor(e, RK.sort);
      el.dataset.k = RK.sort;
    }
    return el;
  };

  function draw() {
    const list = $('#rk-list');
    if (!list) return;
    const g = get(RK.sort);
    const rows = E.filter((e) => (!RK.seasons.length || RK.seasons.includes(e.s))
      && (RK.era === 'all' || (RK.era === 'with' ? e.id <= G : e.id > G))
      && (!RK.hour || e.hour));
    rows.sort((a, b) => (RK.desc ? g(b) - g(a) : g(a) - g(b)) || (RK.desc ? b.r - a.r : a.r - b.r) || a.id - b.id);
    if (rows.length) list.replaceChildren(...rows.map(rowFor));
    else list.innerHTML = '<p class="muted rk-empty">Nothing matches all of that. Even the hour-long filter has limits.</p>';
    const sea = RK.seasons.length ? ` in season${RK.seasons.length > 1 ? 's' : ''} ${join([...RK.seasons].sort((a, b) => a - b).map(String))}` : '';
    const era = RK.era === 'with' ? ', with Michael' : RK.era === 'after' ? ', after Michael' : '';
    $('#rk-count').textContent = `${fmt.plural(rows.length, 'episode')}${sea}${era}${RK.hour ? ', hour-long only' : ''}. Sorted by ${METRICS[RK.sort].word}, ${RK.desc ? 'highest' : 'lowest'} first. Ranks are out of all ${E.length}.`;
    // Keep the controls in step with the state.
    $$('#rk-sort button').forEach((b) => { const on = b.dataset.v === RK.sort; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $$('#rk-era button').forEach((b) => { const on = b.dataset.v === RK.era; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $$('#rk-season button').forEach((b) => { const v = +b.dataset.v; const on = v ? RK.seasons.includes(v) : !RK.seasons.length; b.setAttribute('aria-pressed', String(on)); });
    const dir = $('#rk-dir');
    dir.textContent = RK.desc ? 'Highest first' : 'Lowest first';
    dir.setAttribute('aria-label', `Order: ${RK.desc ? 'highest' : 'lowest'} first. Click to flip`);
    $('#rk-hour').setAttribute('aria-pressed', String(RK.hour));
    $$('#rk-preset button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === presetOf())));
    save();
  }
  const PRESETS = {
    best: { sort: 'r', desc: true, seasons: [], era: 'all', hour: false },
    worst: { sort: 'r', desc: false, seasons: [], era: 'all', hour: false },
    bad: { sort: 'vs', desc: true, seasons: [8, 9], era: 'all', hour: false },
  };
  const presetOf = () => Object.keys(PRESETS).find((k) => { const p = PRESETS[k]; return p.sort === RK.sort && p.desc === RK.desc && p.era === RK.era && p.hour === RK.hour && p.seasons.join() === [...RK.seasons].sort((a, b) => a - b).join(); }) || '';
  const wikiOnly = E.some((e) => e.twssWiki && !e.twss);

  return {
    title: 'Every episode, ranked',
    html: `
    <section class="wrap page-head">
      <div class="crumbs"><a href="#/seasons">Seasons</a><span>/</span><span>Every episode, ranked</span></div>
      <p class="eyebrow">All ${E.length}, ties and all</p>
      <h1>Every episode, <em>ranked.</em></h1>
      <p class="lede">${lede}</p>
      <p class="small muted rk-sub">${lede2 ? `${lede2} ` : ''}Against its own season’s average, ${epA(vsTop)} is furthest above (${fmt.signed(vs(vsTop))}) and ${epA(vsLow)} furthest below (${fmt.signed(vs(vsLow))}).</p>
    </section>
    <section class="wrap">
      <div class="card rk-controls rv">
        <div class="rk-row"><span class="rk-label">Start with</span>
          <div class="pills" id="rk-preset">
            <button type="button" class="pill" data-v="best" aria-pressed="false">Best</button>
            <button type="button" class="pill" data-v="worst" aria-pressed="false">Worst</button>
            <button type="button" class="pill" data-v="bad" aria-pressed="false">Best of a bad season</button>
          </div>
        </div>
        <div class="rk-row"><span class="rk-label">Sort by</span>
          ${toggle('rk-sort', Object.entries(METRICS).map(([k, m]) => [k, m.label]), RK.sort)}
          <button type="button" class="pill rk-dir" id="rk-dir">Highest first</button>
        </div>
        <div class="rk-row"><span class="rk-label">Season</span>
          <div class="pills scroll" id="rk-season" role="group" aria-label="Seasons"><button type="button" class="pill" data-v="0" aria-pressed="true">All</button>${S.map((s) => `<button type="button" class="pill" data-v="${s.n}" aria-pressed="false" aria-label="Season ${s.n}">${s.n}</button>`).join('')}</div>
        </div>
        <div class="rk-row"><span class="rk-label">Era</span>
          ${toggle('rk-era', [['all', 'All'], ['with', 'With Michael'], ['after', 'After']], RK.era)}
          <button type="button" class="pill" id="rk-hour" aria-pressed="false">Hour-long only</button>
        </div>
      </div>
      <p class="small muted rk-count" id="rk-count" aria-live="polite"></p>
      <div class="legend seq-legend rk-legend">${stripLegend(D, E, 'The strip on each row shows who talked most in that episode.')}${wikiOnly ? '<span><span class="flag wiki">TWSS</span>Dashed: only the fan wiki has it</span>' : ''}</div>
      <div class="ep-list ranked" id="rk-list"></div>
      <div class="pager">
        <a href="#/seasons"><small>Back to</small><span>All seasons</span></a>
        <a class="next" href="#/findings"><small>Next</small><span>What it all means</span></a>
      </div>
    </section>`,
    after() {
      // Remember which row was opened and where it sat, so Back puts that row back under the reader's thumb.
      // (Rows far off screen skip layout, so a plain scroll position would only be close.)
      $('#rk-list')?.addEventListener('click', (ev) => {
        const a = ev.target.closest('a.ep-row'); if (!a) return;
        const id = +a.getAttribute('href').split('/').pop();
        try { history.replaceState({ ...(history.state || {}), rk: { ...RK, seasons: [...RK.seasons], anchor: { id, top: Math.round(a.getBoundingClientRect().top) } } }, ''); } catch (err) { /* state is a nicety */ }
      });
      const anchor = saved && saved.anchor;
      $('#rk-sort')?.addEventListener('click', (ev) => {
        const b = ev.target.closest('button'); if (!b) return;
        if (RK.sort === b.dataset.v) RK.desc = !RK.desc; else { RK.sort = b.dataset.v; RK.desc = true; }
        draw();
      });
      $('#rk-era')?.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; RK.era = b.dataset.v; draw(); });
      $('#rk-dir')?.addEventListener('click', () => { RK.desc = !RK.desc; draw(); });
      $('#rk-hour')?.addEventListener('click', () => { RK.hour = !RK.hour; draw(); });
      $('#rk-season')?.addEventListener('click', (ev) => {
        const b = ev.target.closest('button'); if (!b) return;
        const v = +b.dataset.v;
        if (!v) RK.seasons = [];
        else RK.seasons = RK.seasons.includes(v) ? RK.seasons.filter((x) => x !== v) : [...RK.seasons, v];
        if (RK.seasons.length === S.length) RK.seasons = [];
        draw();
      });
      $('#rk-preset')?.addEventListener('click', (ev) => {
        const b = ev.target.closest('button'); if (!b) return;
        const p = PRESETS[b.dataset.v];
        Object.assign(RK, { ...p, seasons: [...p.seasons] });
        draw();
      });
      draw();
      if (anchor && nodes.has(anchor.id)) {
        // Two frames: the router restores its saved scroll position in the next one.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const el = nodes.get(anchor.id);
          if (!el || !el.isConnected) return;
          window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - anchor.top, behavior: 'instant' });
        }));
      }
    },
  };
}

// ---------------------------------------------------------------- one episode

export function episode(D, id, lines) {
  const E = D.episodes;
  const e = E[id];
  if (!e) return null;
  const s = D.seasons[e.s - 1];
  const sEps = E.slice(s.first, s.last + 1);
  const rShow = rankOf(E, e);
  const rSeason = rankOf(sEps, e);
  const prev = E[id - 1], next = E[id + 1];
  const people = (list) => join(list.map((p) => personA(D, p)));
  const stop = (list) => (/\.$/.test(list[list.length - 1] || '') ? '' : '.');
  const total = e.lines;
  // e.e is the ratings table's number, which counts an hour-long as one episode; e.se is the streaming number.
  const orig = e.se !== String(e.e);
  const partner = e.approx ? E.find((x) => x.approx && x.id !== e.id && x.date === e.date) : null;
  const isPart2 = partner && partner.id < e.id;
  const base = partBase(e);
  const SHUF = 'In this episode’s fan transcript, two scenes trade lines for a stretch';
  const approxNote = e.approx ? `${esc(base)} aired as one hour. The transcript comes as one piece, so the split between the two parts is approximate.` : '';
  const opening = !e.shuffled && !isPart2;
  const kw = (e.kw || []).slice(0, 5);

  // The longest two-person exchange only means something when the lines are in broadcast order.
  const run = !e.shuffled && e.run;
  const clean = E.filter((x) => !x.shuffled);
  const runRank = run ? rankOf(clean.filter((x) => x.run), e, (x) => x.run.n) : null;
  const scene = run ? (D.scenes || []).find((x) => x.ep === id && x.n === run.n) : null;
  const couple = run && (D.couples || []).find((c) => [c.a, c.b].sort().join() === [run.a, run.b].sort().join());
  const runRankTxt = runRank && runRank.n <= 20
    ? ` ${runRank.ties ? 'Tied for the' : 'The'} ${runRank.n === 1 ? '' : `${fmt.ordinal(runRank.n)} `}longest in the ${clean.length} episodes whose transcript is in order.`
    : '';

  // Where it lands: against its season, and who it's tied with.
  const vsS = e.r - s.avgRating;
  const tiedWith = E.filter((x) => x !== e && tenths(x.r) === tenths(e.r));
  const facts = [
    `${fmt.signed(vsS)} against the season ${e.s} average of ${s.avgRating.toFixed(2)}.`,
    tiedWith.length === 0 ? `The only episode rated ${e.r.toFixed(1)}.`
      : tiedWith.length <= 3 ? `Tied at ${e.r.toFixed(1)} with ${join(tiedWith.map(epA))}.`
      : `Tied at ${e.r.toFixed(1)} with ${fmt.plural(tiedWith.length, 'other episode')}. <a href="#/episodes">See the list</a>.`,
  ];
  if (e.votes) {
    const rv = rankOf(E, e, (x) => x.votes || 0);
    if (rv.n <= 10) facts.push(`${rv.n === 1 ? 'The most' : `The ${fmt.ordinal(rv.n)} most`} IMDb votes of any episode${rv.ties ? ', tied' : ''}.`);
  }
  const shared = (list) => (list.filter((x) => x.v === e.v).length > 1 ? ', shared with its other half' : '');
  if (e.v === Math.max(...E.map((x) => x.v))) facts.push(`The most-watched episode of the whole show${shared(E)}.`);
  else if (e.v === Math.max(...sEps.map((x) => x.v))) facts.push(`The most-watched episode of season ${e.s}${shared(sEps)}.`);

  let lede = `Directed by ${people(e.dir)}${stop(e.dir)} Written by ${people(e.wri)}${stop(e.wri)}`;
  if (e.hour) lede += ' An hour-long episode, which streaming counts as two.';
  if (partner) lede += ` Part ${isPart2 ? 'two' : 'one'} of ${esc(base)}, which aired as one hour with ${epA(partner)}.`;

  // Episodes only the fan wiki flags have no count we can trust, so they show none.
  const twssNote = e.twss ? `${cap(fmt.times(e.twss))} in the transcript` : e.twssWiki ? 'None in the transcript, though the fan wiki lists this episode' : 'Not this time';

  const pg = (x, dir) => `<small>${dir} <b class="pg-code">${epCode(x)}</b></small><span>${esc(x.t)}</span>`;

  return {
    title: e.t,
    html: `
    <section class="wrap page-head">
      <div class="crumbs"><a href="#/seasons">Seasons</a><span>/</span><a href="#/season/${e.s}">Season ${e.s}</a><span>/</span><span>Episode ${esc(e.se)}</span></div>
      <p class="eyebrow ep-eyebrow"><span>${epCode(e)} · ${fmt.date(e.date)}</span>${orig ? `<span class="ep-orig">(E${e.e} if hour-longs count as one episode)</span>` : ''}</p>
      <h1 style="font-size:clamp(40px,7vw,84px)">${esc(e.t)}</h1>
      <p class="lede">${lede}</p>
    </section>
    <section class="wrap">
      <div class="stats rv">
        <div class="stat"><div class="stat-label">IMDb rating</div><div class="stat-value">${count(e.r, 1)}</div><div class="stat-note">${rShow.label} of ${E.length} overall, ${rSeason.label} of ${sEps.length} in season ${e.s}${e.votes ? `. ${fmt.int(e.votes)} votes` : ''}</div></div>
        <div class="stat"><div class="stat-label">US viewers</div><div class="stat-value">${count(e.v, 2)}<small>M</small></div><div class="stat-note ${e.v >= s.avgViewers ? 'delta-up' : 'delta-down'}">${fmt.signed(e.v - s.avgViewers)}M vs the season average${partner ? '. One figure for the whole hour' : ''}</div></div>
        <div class="stat"><div class="stat-label">Lines</div><div class="stat-value">${count(e.lines)}</div><div class="stat-note">${e.approx ? 'Approximate, from a split transcript' : `${e.speakers} different speakers`}</div></div>
        <div class="stat"><div class="stat-label">Words</div><div class="stat-value">${count(e.words)}</div><div class="stat-note">${(e.words / Math.max(1, e.lines)).toFixed(1)} per line</div></div>
        <div class="stat"><div class="stat-label">That’s what she said</div><div class="stat-value">${small(e.twss || 0)}</div><div class="stat-note">${twssNote}</div></div>
      </div>
    </section>
    <section class="section wrap">
      <div class="grid g-7-5 ep-cols">
        <div class="ep-col">
          <div class="card rv ep-o2">
            <h3 class="card-title">${e.shuffled ? 'Who talks, and how much' : 'Who talks when'}</h3>
            <p class="card-sub">${e.shuffled
              ? `${SHUF}, so each tick is one line but the ticks show how much each person talks, not when. The six people with the most lines.`
              : 'Each tick is one line, left to right through the transcript. The six people with the most lines.'}${approxNote ? ` ${approxNote}` : ''}</p>
            <div id="barcode"></div>
          </div>
          <div class="card rv ep-o4">
            <h3 class="card-title">${opening ? 'Opening lines' : 'A few lines from this episode'}</h3>
            <p class="card-sub">${opening
              ? 'The first rows of the fan transcript.'
              : e.shuffled ? `${SHUF}, so these are six lines from across it, in no particular order.` : 'The split between the two parts is approximate, so these are six lines from across this half.'}</p>
            <div class="script" id="cold"><p class="muted small">Pulling the script out of the filing cabinet…</p></div>
            <div class="ep-more" id="cold-more" hidden><button type="button" class="pill">Keep reading</button><span class="small muted"></span></div>
          </div>
        </div>
        <div class="ep-col">
          <div class="card rv ep-o1" style="--d:.06s">
            <h3 class="card-title">This episode in ${nw(kw.length)} words</h3>
            <p class="card-sub">Said far more here than anywhere else in the show, title words left out. Each one opens a search.</p>
            ${wordLinks(kw, 5)}
            <ul class="ep-facts">${facts.map((f) => `<li><span>${f}</span></li>`).join('')}</ul>
          </div>
          <div class="card rv ep-o3" style="--d:.06s">
            <h3 class="card-title">Share of the episode</h3>
            <p class="card-sub">Of ${fmt.int(total)} lines${e.approx ? ', approximately' : ''}.</p>
            ${hbars(e.top.map((t) => ({ label: t.k, v: (t.n / total) * 100, color: color(t.k), dot: color(t.k), k: t.k })), { fmtv: (v) => fmt.pct(v), href: (r) => (D.char[r.k] ? `#/character/${slug(r.k)}` : null) })}
          </div>
          ${run ? `<div class="card rv ep-o5 ep-run" style="--d:.06s">
            <h3 class="card-title">Longest back-and-forth</h3>
            <p class="ep-run-who">${charA(D, run.a)} and ${charA(D, run.b)}, ${run.n} lines</p>
            <p class="small muted ep-run-note">Nobody else gets a word in.${runRankTxt}${couple ? ` <a href="#/couples">More on these two</a>.` : ''}</p>
            ${scene ? `<div class="script ep-run-lines">${scene.lines.slice(0, 4).map(([k, t]) => scriptLine([0, k, t])).join('')}</div>` : ''}
          </div>` : ''}
        </div>
      </div>
      <div class="card rv mt">
        <h3 class="card-title">Season ${e.s} for context</h3>
        <p class="card-sub">This episode is the filled dot. Numbers are streaming order.</p>
        <div id="ctx"></div>
      </div>
      <div class="pager ep-pager">
        ${prev ? `<a href="#/episode/${prev.id}">${pg(prev, 'Previous')}</a>` : '<span style="flex:1"></span>'}
        ${next ? `<a class="next" href="#/episode/${next.id}">${pg(next, 'Next')}</a>` : '<a class="next" href="#/episodes"><small>That’s all of them</small><span>Every episode, ranked</span></a>'}
      </div>
    </section>`,
    after() {
      barcode($('#barcode'), e, D);
      contextChart($('#ctx'), sEps, e);
      lines(e.s).then((L) => {
        const out = $('#cold');
        if (!out) return;
        const mine = L.filter((l) => l[0] === id);
        if (!mine.length) { out.innerHTML = '<p class="muted small">No lines for this one.</p>'; return; }
        if (!opening) {
          // Six lines spread evenly through the transcript, each long enough to say something.
          const pool = mine.filter((l) => l[2].trim().split(/\s+/).length >= 6 && !l[2].startsWith('['));
          const k = Math.min(6, pool.length);
          const pick = Array.from({ length: k }, (_, i) => pool[Math.floor(((i + 0.5) * pool.length) / k)]);
          out.innerHTML = (pick.length ? pick : mine.slice(0, 6)).map(scriptLine).join('');
          return;
        }
        // In order, so the reader can keep going. A famous line that first comes up in the opening rows
        // is always shown (Product Recall: "Bears. Beets." is row 9 and "Identity theft" row 15).
        const MAX = 24;
        const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’‘`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
        const head = mine.slice(0, MAX).map((l) => norm(l[2]));
        const need = (D.quotes || []).filter((q) => q.n > 0 && q.ep === id)
          .reduce((n, q) => Math.max(n, head.findIndex((t) => t.includes(q.q)) + 1), 0);
        // On a wide screen the first batch fills the column down to the cards beside it.
        const cols = $$('.ep-col');
        const twoCol = cols.length === 2 && getComputedStyle(cols[0]).display !== 'contents';
        let shown = Math.min(mine.length, twoCol ? MAX : Math.max(10, need));
        out.innerHTML = mine.slice(0, shown).map(scriptLine).join('');
        const more = $('#cold-more');
        if (twoCol) {
          const room = cols[1].getBoundingClientRect().bottom - 90;
          const fit = [...out.children].filter((r) => r.getBoundingClientRect().bottom <= room).length;
          const keep = Math.min(shown, Math.max(5, need, fit));
          while (out.children.length > keep) out.lastElementChild.remove();
          shown = keep;
        }
        const sync = () => {
          more.hidden = shown >= mine.length;
          more.querySelector('span').textContent = `${fmt.int(shown)} of ${fmt.int(mine.length)} rows`;
        };
        more.querySelector('button').addEventListener('click', () => {
          const add = mine.slice(shown, shown + 15);
          out.insertAdjacentHTML('beforeend', add.map(scriptLine).join(''));
          shown += add.length;
          sync();
        });
        sync();
      }).catch(() => {
        const out = $('#cold');
        if (out) out.innerHTML = '<p class="muted small">The script didn’t load. Check the connection and reload the page.</p>';
      });
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
        <circle cx="${cx}" cy="${y(e.r)}" r="${me ? 7 : 4}" style="fill:${me ? 'var(--accent)' : 'var(--surface)'};stroke:var(--accent)" stroke-width="2"><title>${esc(e.t)} · ${e.r.toFixed(1)}</title></circle>
        <rect x="${cx - step / 2}" y="${m.t - 6}" width="${step}" height="${H - m.t - m.b + 6}" fill="transparent"/></a>`;
      if (me) body += `<text x="${Math.max(16, Math.min(W - 16, cx))}" y="${y(e.r) - 12}" text-anchor="middle" class="lbl-strong">${e.r.toFixed(1)}</text>`;
      if (step > 16 || me) body += `<text x="${cx}" y="${H - 6}" text-anchor="middle"${me ? ' class="lbl"' : ''}>${esc(e.se.split('-')[0])}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Season ratings with this episode highlighted">${body}</svg>`;
  });
}

export { hasSlot };
