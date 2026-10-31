import { $, $$, esc, fmt, slug, color, hbars, epCode, count } from './ui.js';
import { columns, matrix, timeline, scatter, strip } from './charts.js';

const SUGGEST = ['beets', 'Cornell', 'Scranton Strangler', 'pretzel', 'parkour', 'Michael Scarn', 'Bob Vance', 'boom roasted', 'scotts tots', 'Jell-O', 'I love you', 'the warehouse'];

// ---------------------------------------------------------------- small shared helpers

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const nw = (n) => WORDS[n] ?? fmt.int(n);
const and = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// When the items have commas of their own, semicolons keep the list readable.
const andSemi = (xs) => (xs.some((x) => x.includes(',')) && xs.length > 2 ? `${xs.slice(0, -1).join('; ')}; and ${xs[xs.length - 1]}` : and(xs));
// Non-breaking spaces so "p = 0.009" and "r = −0.41" never split across lines.
const NB = '\u00a0';
const R = `r${NB}=${NB}`;
// Two decimals hide which side of 0.05 a p-value is on when it's close, so show three there.
const pFmt = (p) => (p >= 0.01 && Math.abs(p - 0.05) < 0.01 ? p.toFixed(3) : fmt.p(p));
// Transcript text as shown. The site never prints an em dash, so the transcript's become a typed double hyphen.
const say = (s) => esc(s).replace(/\u2014/g, '--');
// Episode titles in prose are italic, so "Goodbye, Michael" doesn't read as two items in a list.
const ttl = (e) => `<a href="#/episode/${e.id}"><em>${esc(e.t)}</em></a>`;
const charHref = (D, k) => (D.char[k] ? `#/character/${slug(k)}` : null);
const pEq = (p) => { const s = pFmt(p); return s.startsWith('<') ? `p${NB}<${NB}${s.slice(2)}` : `p${NB}=${NB}${s}`; };
const share = (v, d = 1) => fmt.pct(v * 100, d);
const dot = (k) => `<i class="dot" style="background:${color(k)}"></i>`;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- punctuation-blind search

// Lowercase, fold accents, drop apostrophes, and turn everything else that isn't a letter or digit into a space.
// A line matches when ' ' + norm(line) + ' ' contains ' ' + norm(query): punctuation-blind, from the start of a word.
// That is the same text build_data.py counts the running jokes and nicknames on, so a hyphen splits words here too.
const MARKS = /[\u0300-\u036f]/g;
// The fan transcript spells a few things two ways. Both sides fold to one spelling, the way the build's patterns
// (beesle?y, nard ?dog, jell ?o) accept both, so "Beesly" also finds "Beesley" and "jello" finds "Jell-O".
const FOLD = { beesley: 'beesly', narddog: 'nard dog', jello: 'jell o' };
const FOLD_RX = new RegExp(`\\b(${Object.keys(FOLD).join('|')})\\b`, 'g');
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(MARKS, '').replace(/['’‘`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(FOLD_RX, (w) => FOLD[w]);

// "Quoted" searches match whole words only, the way the nickname counts do. Unquoted ones match word starts.
// A hyphen in the query also gets tried joined up, so "e-mail" finds "email" as well as "e-mail".
function parse(raw) {
  const t = String(raw ?? '').trim();
  const m = t.match(/^["“”](.+)["“”]$/);
  const body = m ? m[1] : t;
  const q = norm(body);
  const j = body.includes('-') ? norm(body.replace(/-/g, '')) : '';
  return { raw: t, show: body.trim(), q, qJ: j && j !== q ? j : '', whole: !!m };
}

// Highlighting runs on the raw line. Each query word may have an apostrophe between its letters, and words are
// separated by anything that isn't a letter or digit. The words are [a-z0-9] only, so nothing needs escaping.
const GAP = "['’‘`´]?";
const SEP = '[^A-Za-z0-9]+';
// The folded spellings, as they can appear in the raw text.
const FOLD_HL = [['nard dog', 'nard[^A-Za-z0-9]*dog'], ['jell o', 'jell[^A-Za-z0-9]*o'], ['beesly', 'beesle?y']].map(([k, rx]) => [k.split(' '), rx]);
function pattern(q) {
  const ws = q.split(' ');
  const out = [];
  for (let i = 0; i < ws.length;) {
    const f = FOLD_HL.find(([kw]) => kw.every((w, j) => ws[i + j] === w));
    if (f) { out.push(f[1]); i += f[0].length; } else { out.push([...ws[i]].join(GAP)); i++; }
  }
  return out.join(SEP);
}
function marker(Q) {
  if (!Q.q) return null;
  const alts = [Q.q, Q.qJ].filter(Boolean).map(pattern);
  return new RegExp(`(^|[^A-Za-z0-9])((?:${alts.join('|')})${Q.whole ? '(?![A-Za-z0-9])' : ''})`, 'gi');
}
// Fold accents one character at a time so offsets still line up with the raw text.
const foldChar = (c) => { const f = c.normalize('NFD').replace(MARKS, ''); return f.length === c.length ? f : c; };
const fold = (s) => (/[^\x00-\x7f]/.test(s) ? [...s].map(foldChar).join('') : s);
// Split the raw text at the matches first, then escape each piece, so the regex never sees HTML entities.
function highlight(text, rx, cls = '') {
  if (!rx) return say(text);
  const f = fold(text);
  rx.lastIndex = 0;
  let out = '', last = 0, m;
  while ((m = rx.exec(f))) {
    const a = m.index + m[1].length, z = a + m[2].length;
    out += `${say(text.slice(last, a))}<mark${cls ? ` class="${cls}"` : ''}>${say(text.slice(a, z))}</mark>`;
    last = z;
    if (rx.lastIndex <= m.index) rx.lastIndex = m.index + 1;
  }
  return out + say(text.slice(last));
}

// The whole word a match sits in, as written: "Cornell" inside "Cornell's" gives "Cornell's".
function wordAt(text, rx) {
  const f = fold(text);
  rx.lastIndex = 0;
  const m = rx.exec(f);
  if (!m) return '';
  const a = m.index + m[1].length;
  let z = a + m[2].length;
  while (z < text.length && /[A-Za-z0-9'’]/.test(f[z])) z++;
  return text.slice(a, z).replace(/['’]$/, '');
}

// The whole transcript, loaded once per visit, plus its search index.
const S = { all: null, idx: null, loading: null, done: 0, onProgress: null };
function loadAll(D, lines) {
  if (S.all) return Promise.resolve(S.all);
  if (!S.loading) {
    S.done = 0;
    // Season by season so the page can show progress. Each season is cached by app.js, and a failed one is retried next time.
    S.loading = Promise.all(D.seasons.map((s) => lines(s.n).then((r) => { S.done++; S.onProgress?.(S.done); return r; })))
      .then(() => lines())
      .then((L) => {
        S.idx = L.map((l) => ` ${norm(l[2])} `);
        S.all = L;
        return L;
      })
      .catch((err) => { S.loading = null; throw err; });
  }
  return S.loading;
}
function find(Q, whole = Q.whole) {
  const out = [];
  if (!Q.q) return out;
  const [a, b] = [Q.q, Q.qJ].map((q) => (q ? ` ${q}${whole ? ' ' : ''}` : ''));
  const { idx } = S;
  for (let i = 0; i < idx.length; i++) if (idx[i].includes(a) || (b && idx[i].includes(b))) out.push(i);
  return out;
}

// ---------------------------------------------------------------- dialogue

// Notes for the famous lines the transcript doesn't have. The data can only say they're missing;
// why is mine, checked by hand. `try` is the closest thing it does have.
const MISSING = {
  'worlds best boss': { who: 'Michael', where: 'On the mug', note: 'It’s printed on the mug. Nobody says it out loud.', try: 'best boss' },
  'shots you dont take': { who: 'Michael', where: 'On a whiteboard', note: 'It’s on a whiteboard, credited to Wayne Gretzky, then to Michael Scott. Nobody reads it out.' },
  // Kevin does say this one on screen, so the stamp can't say "never said".
  'few word do trick': { who: 'Kevin', ep: 'The Incentive', stamp: 'Cut off', note: 'The transcript cuts Kevin off at “So me think”. Fitting.', try: 'So me think' },
};
// The data's label for this one reads as if someone says it to Stanley. Stanley is the one asking.
const RELABEL = { 'lost your mind': 'Have you lost your mind?' };
// D.quotes counts lines, not times, and names only the top speaker. I read these lines in the transcript to get the
// times and to see who says them. Each entry is keyed to the line count I checked, so if the data changes the card
// falls back to what D.quotes can say. Every quote with one line is said once in it (checked the same way).
const CHECKED = {
  'where are the turtles': { n: 2, times: 3, solo: true },
  'boom roasted': { n: 2, times: 9, solo: true },
  'lost your mind': { n: 6, times: 6, solo: true },
  'did i stutter': { n: 3, times: 3, solo: false },
};

// The words of a label that make up its counted phrase, as written: "It's Britney, bitch", not "its britney bitch".
function asWritten(label, q) {
  const toks = label.split(/\s+/);
  for (let a = 0; a < toks.length; a++) {
    for (let z = a + 1; z <= toks.length; z++) {
      const s = toks.slice(a, z).join(' ');
      if (norm(s) === q) return s.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    }
  }
  return q;
}

function quoteFacts(D, x) {
  const ck = CHECKED[x.q];
  if (ck && ck.n === x.n) return ck;
  // The running-jokes table has full counts when it tracks the same phrase.
  const ph = D.phrases.find((p) => norm(p.label) === x.q && p.lines === x.n);
  if (ph) return { times: ph.total, solo: ph.speakers.length === 1 && ph.speakers[0].n === ph.total };
  return { times: x.n === 1 ? 1 : null, solo: x.n === 1 };
}

function quoteWall(D) {
  const order = (q) => (q.n === 0 ? 1e6 : q.n);
  const qs = [...D.quotes].sort((a, b) => order(a) - order(b));
  return qs.map((x, i) => {
    const miss = MISSING[x.q];
    const k = x.who || miss?.who;
    const e = x.ep != null ? D.episodes[x.ep] : miss?.ep ? D.episodes.find((y) => y.t === miss.ep) : null;
    const { times, solo } = x.n ? quoteFacts(D, x) : {};
    // Stamps count times said when that's known, and lines when it isn't.
    const stamp = !x.n ? (miss?.stamp || 'Never said') : times ? `Said ${fmt.times(times)}` : `In ${fmt.plural(x.n, 'line')}`;
    const shown = RELABEL[x.q] || x.label;
    const tryQ = x.n ? asWritten(shown, x.q) : miss?.try;
    const link = e ? `<a href="#/episode/${e.id}">${esc(e.t)}</a>` : '';
    const whoLine = !k ? '' : x.n > 1 ? `${dot(k)}${esc(k)}${solo ? ', every time' : ' says it most'}` : `${dot(k)}${esc(k)}${link || miss?.where ? ` · ${link || esc(miss.where)}` : ''}`;
    const all = x.n === 2 ? 'both' : 'all';
    let note = '';
    if (!x.n) note = `${esc(miss?.note || 'Not in the transcript.')}${miss?.try ? ' <span class="tk-try">Tap for the closest it gets.</span>' : ''}`;
    else if (x.n > 1 && x.eps > 1) note = `${times && times !== x.n ? `${cap(nw(x.n))} lines, in` : 'In'} ${fmt.plural(x.eps, 'episode')}, from ${link} on.`;
    else if (x.n > 1) note = times && times !== x.n ? `${cap(nw(x.n))} lines, ${all} in ${link}.` : `${cap(all)} in ${link}.`;
    const sr = `${stamp}${times && times !== x.n ? `, in ${fmt.plural(x.n, 'line')}` : ''}.`;
    return `<div class="tk-card rv${x.n ? '' : ' is-never'}${tryQ ? ' is-tap' : ''}" style="--d:${(Math.min(i, 8) * 0.04).toFixed(2)}s"${tryQ ? ` data-q="${esc(tryQ)}"` : ''}>
      <span class="tk-stamp" aria-hidden="true">${stamp}</span>
      ${tryQ ? `<button type="button" class="tk-line">${say(shown)}<span class="tk-sr"> Search the script.</span></button>` : `<p class="tk-line">${say(shown)}</p>`}
      <p class="tk-who">${whoLine}</p>
      ${note ? `<p class="tk-note">${note}</p>` : ''}
      <span class="tk-sr">${sr}</span>
    </div>`;
  }).join('');
}

function nickNote(nk) {
  const ps = nk.perSeason;
  const on = ps.map((v, i) => (v ? i + 1 : 0)).filter(Boolean);
  if (!on.length) return '';
  const max = Math.max(...ps);
  const peak = ps.indexOf(max) + 1;
  const last = on[on.length - 1];
  if (on.length === 1) return nk.n === 1 ? `In season ${on[0]}.` : `All ${nk.n} in season ${on[0]}.`;
  if (peak === ps.length) return `More in season ${peak} than any other.`;
  if (last === ps.length) return `Still at it in season ${last}.`;
  return `Peaks in season ${peak}. Last heard in season ${last}.`;
}

// Who's who on the board: a nickname, a plain name said a lot, or someone talking about themself in the third person.
const HERS = new Set(['Angela', 'Pam', 'Jan', 'Kelly', 'Erin', 'Phyllis', 'Meredith', 'Holly', 'Nellie', 'Karen']);
function nickWho(nk) {
  const to = (whom) => `${dot(nk.who)}${esc(nk.who)} <span aria-hidden="true">→</span><span class="tk-sr"> calls</span> ${whom}`;
  if (nk.who === nk.whom) return to(HERS.has(nk.who) ? 'herself' : 'himself');
  if (nk.nick === nk.whom) return `${to(esc(nk.whom))}, by name`;
  return to(esc(nk.whom));
}

function nickBoard(D) {
  return D.nicknames.map((nk, i) => {
    const max = Math.max(1, ...nk.perSeason);
    const bars = nk.perSeason.map((v, s) => `<i style="height:${v ? Math.max(8, (v / max) * 100) : 0}%" title="Season ${s + 1}: ${v}"></i>`).join('');
    const tally = `${cap(fmt.times(nk.n))}${nk.lines !== nk.n ? ` in ${fmt.plural(nk.lines, 'line')}` : ''}. ${nk.n === nk.all ? 'Nobody else says it.' : `${fmt.int(nk.n)} of the show’s ${fmt.int(nk.all)}.`}`;
    return `<button type="button" class="tk-nick rv" style="--cc:${color(nk.who)};--d:${(Math.min(i, 6) * 0.04).toFixed(2)}s" data-q="&quot;${esc(nk.nick)}&quot;">
      <span class="tk-nwho">${nickWho(nk)}</span>
      <span class="tk-nn">“${esc(nk.nick)}”</span>
      <span class="tk-nc">${tally}</span>
      <span class="tk-spark" aria-hidden="true">${bars}</span>
      <span class="tk-nnote">${nickNote(nk)}<span class="tk-sr"> Search the script.</span></span>
    </button>`;
  }).join('');
}

// Who answers whom, worked out from D.matrix every time so the prose can't drift from the grid.
function answersProse(D) {
  const { keys, m, tot, episodes } = D.matrix;
  const ix = (k) => keys.indexOf(k);
  const has = (...ks) => ks.every((k) => ix(k) >= 0);
  const sh = (a, b) => m[ix(a)][ix(b)] / tot[ix(a)];
  const top = (a) => keys.filter((b) => b !== a).map((b) => ({ k: b, v: sh(a, b) })).sort((x, y) => y.v - x.v);
  const out = [];

  if (has('Jim', 'Pam')) {
    const tp = top('Pam'), tj = top('Jim');
    const head = tp[0].k === 'Jim' && tj[0].k === 'Pam' ? 'Jim and Pam answer each other first.' : tp[0].k === 'Jim' ? 'Jim answers Pam.' : `Pam gets ${tp[0].k} more than Jim.`;
    out.push(`<p><strong>${head}</strong> When Pam finishes a line, ${tp[0].k} talks next ${share(tp[0].v)} of the time and ${tp[1].k} ${share(tp[1].v)}. When Jim finishes, it’s ${tj[0].k} ${share(tj[0].v)} and ${tj[1].k} ${share(tj[1].v)}.</p>`);
  }

  if (has('Michael')) {
    const others = keys.filter((k) => k !== 'Michael');
    const mine = others.filter((k) => top(k)[0].k === 'Michael');
    const ex = others.filter((k) => top(k)[0].k !== 'Michael');
    const head = mine.length === others.length ? 'Michael answers everyone else.' : mine.length * 2 > others.length ? 'Michael answers most of the others.' : 'Michael answers some of the others.';
    // Pairs who are each other's first answer get one clause.
    const used = new Set();
    const parts = [];
    for (const k of ex) {
      if (used.has(k)) continue;
      const [t1, t2] = top(k);
      if (ex.includes(t1.k) && top(t1.k)[0].k === k && !used.has(t1.k)) { used.add(k); used.add(t1.k); parts.push(`${k} and ${t1.k}, who get each other`); continue; }
      used.add(k);
      parts.push(t1.v - t2.v < 0.01 ? `${k}, who gets ${t1.k} by a hair over ${t2.k}` : `${k}, who gets ${t1.k} ${share(t1.v)} of the time`);
    }
    const ms = D.char.Michael?.perSeasonShare || [];
    const his = ms.map((v, i) => [v, i + 1]).filter(([v]) => v > 1);
    const vol = his.length
      ? ` Part of that is volume. In seasons ${his[0][1]} to ${his[his.length - 1][1]} he has between ${fmt.pct(Math.min(...his.map((x) => x[0])))} and ${fmt.pct(Math.max(...his.map((x) => x[0])))} of each season’s lines, so he’s the likeliest next voice almost by default.`
      : '';
    out.push(`<p><strong>${head}</strong> He’s the most likely next speaker for ${nw(mine.length)} of the other ${nw(others.length)}.${parts.length ? ` The exceptions are ${andSemi(parts)}.` : ''}${vol}</p>`);

    const lean = others.map((k) => ({ k, v: sh(k, 'Michael') })).sort((a, b) => b.v - a.v);
    const close = lean[0].v - lean[2].v < 0.015;
    let p3 = `${lean[0].k} leans on Michael hardest: after ${lean[0].k} speaks, it’s Michael ${share(lean[0].v)} of the time, with ${lean[1].k} (${share(lean[1].v)}) and ${lean[2].k} (${share(lean[2].v)}) ${close ? 'right behind' : 'next'}.`;
    if (has('Angela', 'Dwight')) {
      const [a1, a2] = top('Angela');
      const pair = new Set([a1.k, a2.k]);
      if (a1.v - a2.v < 0.03) p3 += ` Angela splits it between ${a1.k} (${share(a1.v)}) and ${a2.k} (${share(a2.v)})${pair.has('Michael') && pair.has('Dwight') ? ', which tracks' : ''}.`;
    }
    out.push(`<p>${p3}</p>`);
  }
  out.push(`<p class="small muted">Only the ${fmt.int(episodes)} episodes whose transcripts are in order count here. The other ${fmt.int(D.totals.episodes - episodes)} shuffle scenes together, so who-follows-whom would be noise. Each percentage is out of every time someone else speaks next, including everyone outside the grid, so the rows don’t add up to 100. Consecutive lines also catch scene changes, so read it as who shares scenes, not a proper model of conversation.</p>`);
  return out.join('');
}

function scenesList(D) {
  const rank = (k) => D.char[k]?.rank ?? 999;
  return D.scenes.map((sc, i) => {
    const e = D.episodes[sc.ep];
    const [a, b] = [sc.a, sc.b].sort((x, y) => rank(x) - rank(y));
    const first = sc.lines.slice(0, 3);
    const last = sc.end[sc.end.length - 1];
    const skipped = sc.n - first.length - 1;
    const ln = ([k, t]) => `<p class="tk-sl"><b>${dot(k)}${esc(k)}</b> ${say(t)}</p>`;
    return `<li class="tk-scene${i >= 6 ? ' tk-extra' : ''}">
      <div class="tk-sh"><span class="tk-sn">${i + 1}</span><span class="tk-pair">${dot(a)}${dot(b)}${esc(a)} &amp; ${esc(b)}</span><b class="tk-sc">${fmt.int(sc.n)} lines</b></div>
      <div class="tk-sm"><a href="#/episode/${e.id}">${esc(e.t)}</a> · ${epCode(e)}${e.shuffled ? ' <span class="flag alt">Shuffled transcript</span>' : ''}</div>
      <div class="tk-script">${first.map(ln).join('')}${skipped > 0 ? `<p class="tk-gap">${fmt.int(skipped)} more ${skipped === 1 ? 'line' : 'lines'}</p>` : ''}${last ? ln(last) : ''}</div>
    </li>`;
  }).join('');
}

// Running jokes whose label isn't quite what build_data.py counts: it counts every "vance refrigeration".
const PHRASE_SHOW = { 'Bob Vance, Vance Refrigeration': 'Vance Refrigeration' };
const PHRASE_NOTE = { 'Bob Vance, Vance Refrigeration': 'Every “Vance Refrigeration” counts here, not only the full “Bob Vance, Vance Refrigeration”.' };
const phraseShow = (p) => PHRASE_SHOW[p.label] || p.label;
// The search that finds the same lines as each count (the PHRASES patterns in build_data.py). Quoted means whole
// words, unquoted means word starts. null where no single search does: "No, God, no" also counts "No, God, please no",
// and the joke's own tally leaves out Jim asking whether it counts (the Findings list has all of them instead).
const PHRASE_Q = {
  "That's what she said": null,
  'Bears. Beets. Battlestar Galactica.': '"Bears. Beets."',
  'beet or beets': 'beet',
  'Dundie or Dundies': 'Dundie',
  Pretzel: 'pretzel',
  'Schrute Farms': 'Schrute Farm',
  'Bob Vance, Vance Refrigeration': '"Vance Refrigeration"',
  'No, God, no': null,
};
const phraseQ = (p) => (p.label in PHRASE_Q ? PHRASE_Q[p.label] : `"${p.label}"`);

function phraseCard(D, p) {
  const first = p.first != null ? D.episodes[p.first] : null;
  const epLink = (e) => `<a href="#/episode/${e.id}">${esc(e.t)}</a> (${epCode(e)})`;
  const top = p.topEp[0];
  const tied = p.topEp[1] && p.topEp[1].n === top?.n;
  // topEp counts times said, so say so: search results count lines.
  const most = top && p.episodes > 1 && top.n > 1 && !tied ? ` Most in <a href="#/episode/${top.id}">${esc(D.episodes[top.id].t)}</a>, ${fmt.times(top.n)}.` : '';
  const times = `${cap(fmt.times(p.total))}${p.lines !== p.total ? ` in ${fmt.plural(p.lines, 'line')}` : ''}`;
  const said = p.episodes === 1 && first
    ? `${times}, ${p.lines > 1 ? 'all ' : ''}in ${epLink(first)}.`
    : `${times}, across ${fmt.plural(p.episodes, 'episode')}.${most}${first ? ` First: ${epLink(first)}.` : ''}`;
  const everyone = p.speakers.reduce((s, x) => s + x.n, 0) === p.total;
  const twss = norm(p.label) === 'thats what she said';
  const q = phraseQ(p);
  return `
    <div class="card"><p class="phrase-big">“${esc(phraseShow(p))}”</p>
      <p class="phrase-total">${said}</p>
      ${PHRASE_NOTE[p.label] ? `<p class="small muted">${esc(PHRASE_NOTE[p.label])}</p>` : ''}
      ${twss ? '<p class="small"><a class="link-arrow" href="#/findings@twss">All of them, with the setups</a></p>' : ''}
      ${q ? `<p class="small"><button type="button" class="link-arrow tk-read" data-q="${esc(q)}">${p.lines === 1 ? 'Read the line' : `Read all ${fmt.int(p.lines)} lines`}</button></p>` : ''}
      <div id="phr-chart" class="mt"></div></div>
    <div class="card"><h3 class="card-title">Who says it</h3><p class="card-sub">${everyone ? 'Everyone who says it, by times said.' : `The top ${nw(p.speakers.length)}, by times said.`}</p>
      ${hbars(p.speakers.map((s) => ({ label: s.k, v: s.n, color: color(s.k), dot: color(s.k), k: s.k })), { href: (r) => charHref(D, r.k) })}</div>`;
}

export function dialogue(D, lines, term) {
  const cats = D.seasons.map((s) => `S${s.n}`);
  const nScenesShuf = D.scenes.filter((s) => D.episodes[s.ep].shuffled).length;
  return {
    title: term ? `“${parse(term).show}” in the script` : 'Dialogue',
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">Dialogue</p>
      <h1>Every line, <em>searchable.</em></h1>
      <p class="lede">All ${fmt.int(D.totals.lines)} lines, ${fmt.int(D.totals.vocab)} different words. Type anything and see who said it, when, and how often. Punctuation doesn’t count, so “scotts tots” finds Scott’s Tots.</p>
    </section>
    <section class="wrap">
      <form class="searchbox rv" role="search" id="sform">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
        <input id="sq" type="search" enterkeyhint="search" placeholder="Try “beets” or “bankruptcy”" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search the script">
      </form>
      <div class="suggest rv">${SUGGEST.map((s) => `<button type="button" class="pill" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <p id="s-status" class="tk-sr" role="status" aria-live="polite"></p>
      <div id="sres" class="mt"></div>
    </section>

    <section class="section wrap" id="quotables">
      <div class="section-head rv"><div><p class="eyebrow">Quotables</p><h2>The lines you quote most, <em>the script says least.</em></h2></div>
        <p class="small muted tk-head-note">Famous lines, counted in the fan transcript. Tap a card to see it in context.</p></div>
      <div class="tk-wall">${quoteWall(D)}</div>
    </section>

    <section class="section wrap" id="jokes">
      <div class="section-head rv"><div><p class="eyebrow">Running jokes</p><h2>Things people kept saying.</h2></div></div>
      <div class="pills rv tk-phr" id="phr">${D.phrases.map((p, i) => `<button type="button" class="pill" aria-pressed="${i === 0}" data-i="${i}">${esc(phraseShow(p))}</button>`).join('')}</div>
      <div class="grid g-7-5 mt" id="phr-body"></div>
    </section>

    <section class="section wrap" id="nicknames">
      <div class="section-head rv"><div><p class="eyebrow">Nicknames</p><h2>Who calls whom what.</h2></div>
        <p class="small muted tk-head-note">Counted whole-word, so “Kev” isn’t Kevin. A few are just a name, said a lot. Tap one to read every line.</p></div>
      <div class="tk-nicks">${nickBoard(D)}</div>
    </section>

    <section class="section wrap" id="answers">
      <div class="section-head rv"><div><p class="eyebrow">Conversation</p><h2>Who answers whom.</h2></div></div>
      <div class="grid g-7-5" style="align-items:start">
        <div class="card rv"><h3 class="card-title">After each person speaks, who goes next</h3>
          <p class="card-sub">Read across a row: after that person finishes a line, how often each of the others speaks next. Stronger colour means more often. Rows don’t reach 100% because people outside these twelve answer too.</p>
          <p class="matrix-hint">Swipe sideways to see all ${nw(D.matrix.keys.length)}.</p>
          <div class="matrix-wrap"><div class="matrix" id="mx"></div></div>
          <p class="tk-couples"><a class="link-arrow" href="#/couples">Couples Discount: the ships, measured</a></p></div>
        <div class="prose rv" style="--d:.08s">${answersProse(D)}</div>
      </div>
      <div class="card rv mt">
        <h3 class="card-title">The longest two-person scenes</h3>
        <p class="card-sub">The longest unbroken stretches where only two people talk.${nScenesShuf ? ` ${nScenesShuf === 1 ? 'One is' : `${cap(nw(nScenesShuf))} are`} marked “shuffled transcript”. Those fan transcripts weave scenes together line by line, so the run may be two scenes taking turns.` : ''}</p>
        <ol class="tk-scenes" id="scenes">${scenesList(D)}</ol>
        ${D.scenes.length > 6 ? `<button type="button" class="btn ghost mt" id="scenes-more">Show all ${nw(D.scenes.length)}</button>` : ''}
      </div>
    </section>`,
    after() {
      matrix($('#mx'), D);
      const input = $('#sq');
      const out = $('#sres');
      // What the reader had open, saved on this history entry when they last clicked something here (see remember below).
      const saved = history.state && typeof history.state.tkY === 'number' ? history.state : null;
      const toTop = () => $('#sform')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      let go = () => {};

      // running jokes
      let phr = 0;
      const drawP = (i) => {
        const p = D.phrases[i];
        const body = $('#phr-body');
        if (!p || !body) return;
        phr = i;
        body.innerHTML = phraseCard(D, p);
        columns($('#phr-chart'), { cats, series: [{ name: phraseShow(p), color: 'var(--accent)', values: p.perSeason }], height: 200, href: (it) => `#/season/${it.ci + 1}`, label: `${phraseShow(p)}, by season` });
        $('#phr-body .tk-read')?.addEventListener('click', (ev) => { go(ev.currentTarget.dataset.q); toTop(); });
        requestAnimationFrame(() => { $('#phr-chart')?.classList.add('go'); $('#phr-body .hbars')?.classList.add('go'); });
      };
      const pick = (b) => {
        $$('#phr .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        drawP(+b.dataset.i);
      };
      $$('#phr .pill').forEach((b) => b.addEventListener('click', () => {
        pick(b);
        b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
      }));
      const b0 = saved?.tkPhr ? $(`#phr .pill[data-i="${saved.tkPhr}"]`) : null;
      if (b0) {
        pick(b0);
        // Bring the pill into view inside its strip without moving the page.
        const strip = $('#phr');
        strip.scrollLeft += b0.getBoundingClientRect().left - strip.getBoundingClientRect().left - 24;
      } else drawP(0);

      // Revealing more takes the button away, so focus moves to the first thing it revealed.
      const focusEl = (el) => { if (!el) return; el.tabIndex = -1; el.focus({ preventScroll: true }); };
      const scenesAll = () => { $('#scenes')?.classList.add('all'); $('#scenes-more')?.remove(); };
      $('#scenes-more')?.addEventListener('click', () => { scenesAll(); focusEl($('#scenes .tk-extra')); });
      if (saved?.tkScenes) scenesAll();

      // search
      let timer;
      let shown = 0;
      let seq = 0;
      const setURL = (t) => {
        const clean = t.replace(/@/g, ' ').trim();
        const url = clean ? `#/dialogue/q/${encodeURIComponent(clean)}` : '#/dialogue';
        // replaceState doesn't fire hashchange, so the router doesn't re-render the page under the reader.
        if (location.hash !== url) history.replaceState(null, '', url);
        document.title = `${clean ? `“${parse(clean).show}” in the script` : 'Dialogue'} · The Office, by the numbers`;
      };
      // Screen readers hear one short sentence per search, not forty lines of script.
      const status = (t) => { const el = $('#s-status'); if (el) el.textContent = t; };
      const progress = (n) => {
        const bar = $('#tk-prog');
        if (!bar) return;
        bar.querySelector('span').style.width = `${(n / D.seasons.length) * 100}%`;
        bar.parentElement.querySelector('.tk-load-n').textContent = `${n} of ${D.seasons.length} seasons`;
      };

      async function run(raw, { restore } = {}) {
        const my = ++seq;
        const Q = parse(raw);
        if (Q.q.length < 2) { out.innerHTML = ''; status(''); return; }
        if (!S.all) {
          out.innerHTML = `<div class="card tk-load"><p>Pulling the script out of the filing cabinet. <span class="tk-load-n">${S.done} of ${D.seasons.length} seasons</span></p><div class="tk-bar" id="tk-prog"><span style="width:${(S.done / D.seasons.length) * 100}%"></span></div></div>`;
          S.onProgress = progress;
        }
        try {
          await loadAll(D, lines);
        } catch (err) {
          if (my !== seq || !out.isConnected) return;
          status('The script didn’t load.');
          out.innerHTML = '<div class="card tk-load"><p>The script didn’t load. Check your connection, then <button type="button" class="btn ghost" id="s-retry">try again</button></p></div>';
          $('#s-retry')?.addEventListener('click', () => run(raw));
          return;
        }
        if (my !== seq || !out.isConnected) return;
        render(Q, restore);
      }

      // Unquoted searches match word starts, so "Cornell" also finds "Cornell's". Say how many are whole words,
      // because the running-joke and nickname counts on this page are whole words.
      function wholeNote(Q, hits, L, rx) {
        if (Q.whole) return '<p class="small muted">Whole words only. Drop the quotes to catch longer words that start with it.</p>';
        const whole = find(Q, true);
        const extra = hits.length - whole.length;
        if (extra <= 0) return '';
        const set = new Set(whole);
        const ex = hits.find((i) => !set.has(i));
        const word = ex != null ? wordAt(L[ex][2], rx) : '';
        const like = word ? `, like “${esc(word)}”` : '';
        const btn = `<button type="button" class="tk-link" data-q="&quot;${esc(Q.show)}&quot;">Whole words only</button>`;
        if (!whole.length) return `<p class="small muted">Only ever the start of a longer word here${like}. ${btn}</p>`;
        return `<p class="small muted">${fmt.int(whole.length)} of these have it as a whole word. The other ${extra === 1 ? 'one is a longer word' : `${fmt.int(extra)} are longer words`} that start${extra === 1 ? 's' : ''} with it${like}. ${btn}</p>`;
      }

      function render(Q, restore) {
        const L = S.all;
        const hits = find(Q);
        const shownTerm = `“${esc(Q.show)}”`;
        if (!hits.length) {
          status(`Nobody says ${Q.show} in this transcript.`);
          out.innerHTML = `<div class="card"><p class="phrase-big tk-empty">Nobody says ${shownTerm} in this transcript.</p><p class="muted">Fan transcripts miss things, so try fewer words.</p></div>`;
          return;
        }
        const bySeason = Array(D.seasons.length).fill(0);
        const bySpeaker = {};
        const byEp = {};
        for (const i of hits) {
          const [ep, sp] = L[i];
          bySeason[D.episodes[ep].s - 1]++;
          bySpeaker[sp] = (bySpeaker[sp] || 0) + 1;
          byEp[ep] = (byEp[ep] || 0) + 1;
        }
        const speakers = Object.entries(bySpeaker).sort((a, b) => b[1] - a[1]);
        const sp = speakers.slice(0, 8);
        const eps = Object.entries(byEp).sort((a, b) => b[1] - a[1]);
        let most = '';
        if (eps.length > 1 && eps[0][1] > 1) {
          const ties = eps.filter((x) => x[1] === eps[0][1]);
          const link = (x) => `<a href="#/episode/${x[0]}">${esc(D.episodes[+x[0]].t)}</a>`;
          if (ties.length === 1) most = ` Most in ${link(eps[0])}, ${fmt.plural(eps[0][1], 'line')}.`;
          else if (ties.length === 2) most = ` Most in ${link(ties[0])} and ${link(ties[1])}, ${fmt.plural(eps[0][1], 'line')} each.`;
        }
        const rx = marker(Q);
        shown = 0;
        status(`${Q.show}: ${fmt.plural(hits.length, 'line')} in ${fmt.plural(eps.length, 'episode')}.`);
        out.innerHTML = `
          <div class="grid g-7-5">
            <div class="card"><p class="phrase-big tk-term">${shownTerm}</p>
              <p class="phrase-total">${fmt.plural(hits.length, 'line')} in ${fmt.plural(eps.length, 'episode')}.${most}</p>
              ${wholeNote(Q, hits, L, rx)}
              ${twssNote(Q, hits, L)}
              <div id="s-chart" class="mt"></div></div>
            <div class="card"><h3 class="card-title">Who says it</h3><p class="card-sub">Lines containing it, by speaker.${speakers.length > sp.length ? ` Top ${nw(sp.length)} of ${fmt.int(speakers.length)}.` : ''}</p>
              ${hbars(sp.map(([k, n]) => ({ label: k, v: n, color: color(k), dot: color(k), k })), { href: (r) => charHref(D, r.k) })}</div>
          </div>
          <div class="card mt"><div class="script" id="s-lines"></div><div id="s-more" class="mt"></div></div>`;
        columns($('#s-chart'), { cats, series: [{ name: Q.show, color: 'var(--accent)', values: bySeason }], height: 190, href: (it) => `#/season/${it.ci + 1}`, label: `${Q.show}, by season` });
        requestAnimationFrame(() => { $('#s-chart')?.classList.add('go'); $('#sres .hbars')?.classList.add('go'); });
        const more = (focus) => {
          const box = $('#s-lines');
          if (!box) return;
          const from = shown;
          const chunk = hits.slice(shown, shown + 40);
          shown += chunk.length;
          box.insertAdjacentHTML('beforeend', chunk.map((i) => {
            const [ep, who, tx] = L[i];
            const e = D.episodes[ep];
            return `<div class="ln"><span class="sp">${dot(who)}${esc(who)}</span><span><span class="tx">${highlight(tx, rx)}</span><div class="meta"><a href="#/episode/${e.id}">${esc(e.t)}</a> · ${epCode(e)}</div></span></div>`;
          }).join(''));
          const left = hits.length - shown;
          $('#s-more').innerHTML = left > 0 ? `<button type="button" class="btn ghost" id="s-more-b">Show ${fmt.int(Math.min(40, left))} more (${fmt.int(left)} left)</button>` : '';
          $('#s-more-b')?.addEventListener('click', () => more(true));
          if (focus) focusEl(box.children[from]);
        };
        more();
        if (restore) {
          while (shown < Math.min(restore.shown, hits.length)) more();
          requestAnimationFrame(() => window.scrollTo({ top: restore.y, behavior: 'instant' }));
        }
      }

      // The joke tallies leave out Jim asking whether the line is banned. Search finds it, so say why the numbers differ.
      function twssNote(Q, hits, L) {
        if (!Q.q.startsWith('thats what she said')) return '';
        const ask = hits.filter((i) => /^does that include/i.test(L[i][2]));
        return `<p class="small muted">${ask.length ? `One of these is ${esc(L[ask[0]][1])} asking whether it counts, in ${esc(D.episodes[L[ask[0]][0]].t)}. ` : ''}<a href="#/findings@twss">All ${fmt.int(D.findings.twssLines)} jokes, with the setups</a>.</p>`;
      }

      go = (t, opts) => { clearTimeout(timer); input.value = t; setURL(t); run(t, opts); };
      input.addEventListener('input', () => {
        clearTimeout(timer);
        // The reader may have left the page inside the 200 ms. Then this search, and its URL, are no longer wanted.
        timer = setTimeout(() => { if (!input.isConnected) return; setURL(input.value); run(input.value); }, 200);
      });
      $('#sform').addEventListener('submit', (ev) => { ev.preventDefault(); clearTimeout(timer); setURL(input.value); run(input.value); input.blur(); });
      input.addEventListener('focus', () => { loadAll(D, lines).catch(() => {}); }, { once: true });
      $$('.suggest .pill').forEach((b) => b.addEventListener('click', () => go(b.dataset.q)));
      $$('.tk-card.is-tap').forEach((c) => c.addEventListener('click', (ev) => {
        if (ev.target.closest('a')) return;
        go(c.dataset.q);
        toTop();
      }));
      $$('.tk-nick').forEach((b) => b.addEventListener('click', () => { go(b.dataset.q); toTop(); }));
      out.addEventListener('click', (ev) => { const b = ev.target.closest('.tk-link[data-q]'); if (b) go(b.dataset.q); });

      // app.js remembers scroll by route, but a search rewrites the URL under it, and it can't know what was expanded.
      // So any click on this page saves the scroll, the lines shown, the open scenes and the running joke on this
      // history entry. Links and chart taps both start with a click, so Back from anywhere lands on the same spot.
      const remember = () => {
        if (!input.isConnected) { document.removeEventListener('click', remember, true); return; }
        history.replaceState({ tkY: scrollY, tkShown: shown, tkScenes: !!$('#scenes.all'), tkPhr: phr }, '');
      };
      document.addEventListener('click', remember, true);

      if (term) {
        input.value = term;
        run(term, { restore: saved ? { y: saved.tkY, shown: saved.tkShown || 40 } : null });
      } else if (saved) {
        requestAnimationFrame(() => window.scrollTo({ top: saved.tkY, behavior: 'instant' }));
      }
    },
  };
}

// ---------------------------------------------------------------- findings

// build_data.py shuffles the labels 20,000 times and reports (hits + 1) / (20,000 + 1).
const SHUFFLES = 20000;
const permText = (p) => {
  const k = Math.round(p * (SHUFFLES + 1)) - 1;
  return k <= 0 ? 'It never did.' : `It did ${fmt.times(k)}, about 1 in ${fmt.int(SHUFFLES / k)}.`;
};

function twssCallouts(D, list) {
  const E = D.episodes;
  const out = [];
  const byEp = {};
  list.forEach((x) => (byEp[x.ep] ||= []).push(x));
  for (const [ep, xs] of Object.entries(byEp)) {
    const feeders = new Set(xs.map((x) => x.setup?.k));
    if (xs.length >= 3 && feeders.size === 1 && xs[0].setup) out.push(`${esc(xs[0].setup.k)} feeds ${esc(xs[0].k)} ${nw(xs.length)} in ${ttl(E[+ep])}.`);
  }
  const both = list.find((x) => x.self && x.k !== 'Michael');
  if (both) out.push(`${esc(both.k)} does both halves in ${ttl(E[both.ep])}.`);
  const same = list.filter((x) => x.setup && /harder than it has to be/i.test(x.setup.t));
  if (same.length >= 2) {
    const [a, b] = same;
    const gap = Math.abs(E[b.ep].s - E[a.ep].s);
    out.push(`${esc(a.setup.k)} and ${esc(b.setup.k)} hand ${esc(a.k)} the same setup, “harder than it has to be”, ${gap ? `${nw(gap)} season${gap === 1 ? '' : 's'} apart` : 'in the same season'}.`);
  }
  const last = list[list.length - 1];
  if (last) out.push(`The show’s last one is ${esc(last.k)}’s, in ${E[last.ep].t === 'Finale' ? `the <a href="#/episode/${last.ep}"><em>Finale</em></a>` : ttl(E[last.ep])}.`);
  return out;
}

function twssItems(D, list) {
  const rx = marker(parse('thats what she said'));
  const punch = (t) => highlight(t, rx, 'tk-ph');
  return list.map((x, i) => {
    const e = D.episodes[x.ep];
    let body;
    if (x.self) {
      // Setup and punchline in one line: everything before the first "that's what she said" is the setup.
      rx.lastIndex = 0;
      const m = rx.exec(fold(x.t));
      const cut = m ? m.index + m[1].length : 0;
      body = `<p class="tk-pl" style="--cc:${color(x.k)}"><b>${dot(x.k)}${esc(x.k)}</b> <span class="tk-su-in">${say(x.t.slice(0, cut))}</span>${punch(x.t.slice(cut))}</p>
        <p class="tk-why">Setup and punchline in the same breath.</p>`;
    } else {
      body = `${x.setup ? `<p class="tk-su"><b>${dot(x.setup.k)}${esc(x.setup.k)}</b> ${say(x.setup.t)}</p>` : ''}
        <p class="tk-pl" style="--cc:${color(x.k)}"><b>${dot(x.k)}${esc(x.k)}</b> ${punch(x.t)}${x.n > 1 ? ` <span class="tk-x">×${x.n}</span>` : ''}</p>
        ${x.setup ? '' : '<p class="tk-why">The setup isn’t in the transcript.</p>'}`;
    }
    return `<li class="tk-tw${i >= 8 ? ' tk-extra' : ''}"><a class="tk-tw-ep" href="#/episode/${e.id}">${esc(e.t)} <span>${epCode(e)}</span></a>${body}</li>`;
  }).join('');
}

export function findings(D) {
  const F = D.findings;
  const E = D.episodes;
  const M = F.michaelRating, V = F.michaelViewers, C = F.michaelRatingCore;
  const andy = F.andy;
  const bye = E[F.goodbye];
  const sb = E[F.superBowl];
  const hours = E.filter((e) => e.hour);
  // michaelRatingCore drops every hour-long, Goodbye, Michael and the last three episodes (build_data.py).
  const coreExtra = [F.goodbye, ...E.slice(-3).map((e) => e.id)].filter((id) => !E[id].hour).map((id) => E[id]);
  const holidays = E.filter((e) => e.holiday);
  // What kind of night each hour-long was, from the data: the Super Bowl slot, a season's last or first episode, Christmas.
  const firsts = new Set(D.seasons.map((s) => s.first));
  const lasts = new Set(D.seasons.map((s) => s.last));
  const kinds = [
    ['the one after the Super Bowl', 'the one after the Super Bowl', (e) => e.id === F.superBowl],
    ['season finale', 'season finales', (e) => lasts.has(e.id)],
    ['season premiere', 'season premieres', (e) => firsts.has(e.id)],
    ['Christmas episode', 'Christmas episodes', (e) => e.holiday && /christmas/i.test(e.t)],
  ];
  const used = new Set();
  const occasions = kinds.map(([one, many, test]) => {
    const xs = hours.filter((e) => !used.has(e.id) && test(e));
    xs.forEach((e) => used.add(e.id));
    return !xs.length ? '' : one === many ? one : xs.length === 1 ? `one ${one}` : `${nw(xs.length)} ${many}`;
  }).filter(Boolean);
  const otherHours = hours.filter((e) => !used.has(e.id));
  // Speakers and ratings on each side of Michael leaving, half-hours only, the same episodes as the cast-size test.
  const halves = E.filter((e) => !e.hour);
  const mean = (xs, f) => xs.reduce((t, e) => t + f(e), 0) / xs.length;
  const castA = halves.filter((e) => e.id <= F.goodbye), castB = halves.filter((e) => e.id > F.goodbye);
  const list = F.twssList;
  const multi = list.filter((x) => x.n > 1);
  const twMichael = F.twssBy.find((t) => t.k === 'Michael');
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
          <p>With Michael, through ${ttl(bye)}, episodes average <strong>${M.meanA.toFixed(2)}</strong> on IMDb. After, <strong>${M.meanB.toFixed(2)}</strong>. That is a drop of ${(M.meanA - M.meanB).toFixed(2)} points across ${M.nA} and ${M.nB} episodes.</p>
          <p>It isn’t a few big nights doing the work. Take out the ${hours.length} hour-long episodes, plus ${and(coreExtra.map(ttl))}, and it’s still <strong>${C.meanA.toFixed(2)}</strong> against <strong>${C.meanB.toFixed(2)}</strong> over ${C.nA} and ${C.nB} episodes (${pEq(C.p)}).</p>
          <p>Viewers fall harder, from ${fmt.m(V.meanA)} to ${fmt.m(V.meanB)} an episode. That leaves out ${ttl(sb)}, which aired after the Super Bowl to ${fmt.m(sb.v)}, so it doesn’t flatter the early years.</p>
        </div>
        <div class="explain"><b>How sure is that?</b> I shuffled the labels “with Michael” and “without” at random ${fmt.int(SHUFFLES)} times and checked how often chance alone made a gap this big. ${permText(F.michaelRatingPerm)} A Welch t-test agrees (${pEq(M.p)}).<br><br><b>The catch.</b> Network TV was losing viewers everywhere by 2011, so not all of the viewer drop is Michael. The rating drop is harder to explain away.</div>
      </div>
      <div>
        <div class="card"><h3 class="card-title">IMDb rating, every episode</h3><p class="card-sub">Dots are episodes. The solid line is a 9-episode moving average, worked out separately on each side of Michael leaving. The flat lines are the two era averages.</p><div id="f-m1"></div></div>
        <div class="card mt"><h3 class="card-title">US viewers, millions</h3><p class="card-sub">${esc(sb.t)} (${fmt.m(sb.v)}, after the Super Bowl) runs off the top, and it’s left out of the era averages, the same as in the text.</p><div id="f-m2"></div></div>
        <div class="card mt"><h3 class="card-title">But more Michael doesn’t mean a better episode</h3><p class="card-sub">Through <em>${esc(bye.t)}</em>, Michael’s share of the lines against the rating. ${R}${fmt.num(F.michaelShareCorr.r)}, basically flat. He mattered to the show, not to every scene.</p><div id="f-m3"></div></div>
      </div>
    </section>

    <section class="finding" id="twss">
      <div class="sticky-col">
        <p class="fnum">Two</p>
        <h2>Do “that’s what she said” episodes rate higher?</h2>
        <span class="verdict">Sort of, then not really</span>
        <div class="prose mt">
          <p>The line shows up ${fmt.int(F.twssCount)} times in ${fmt.int(F.twssLines)} lines of the transcript.${multi.length ? ` The extra ${multi.length === 1 ? (multi[0].n === 2 ? 'one is' : `${nw(multi[0].n - 1)} are`) : 'ones are'} ${and(multi.map((x) => `${esc(x.k)} saying it ${x.n === 2 ? 'twice' : `${nw(x.n)} times`} in one go in ${ttl(E[x.ep])}`))}.` : ''} Michael says ${twMichael ? fmt.int(twMichael.n) : 0} of them.</p>
          <p>${cap(nw(F.twssEpisodes))} episodes have it in the transcript. The fan wiki’s list adds ${nw(F.twssWikiOnly)} more that the transcript doesn’t have, so ${F.twssAll.nA} episodes in all.</p>
          <p>Across the whole show those episodes average <strong>${F.twssAll.meanA.toFixed(2)}</strong> against <strong>${F.twssAll.meanB.toFixed(2)}</strong>, and that gap passes the usual test (${pEq(F.twssAll.p)}).</p>
          <p>But the joke lives in the Michael years, and the Michael years rated higher anyway. Compare only episodes through ${ttl(bye)} and the gap shrinks to <strong>${(F.twssMichael.meanA - F.twssMichael.meanB).toFixed(2)}</strong>, with ${pEq(F.twssMichael.p)}. That’s the kind of gap random noise makes all the time.</p>
        </div>
        <div class="explain"><b>What a p-value means here.</b> It’s the chance of seeing a gap at least this big if the joke made no difference at all. Under 0.05 is the usual bar for “probably real”. ${fmt.p(F.twssMichael.p)} is well over it.<br><br><b>A correction.</b> My 2023 version of this test counted every hour-long episode twice, because of how I merged the data. This one counts each episode once.</div>
      </div>
      <div>
        <div class="card"><div class="card-head"><div><h3 class="card-title">Ratings, with and without the joke</h3><p class="card-sub">Each dot is an episode. The tall bar marks the average.</p></div>
          <div class="toggle" id="tw-t" role="group" aria-label="Which episodes"><button type="button" class="on" aria-pressed="true" data-v="all">All episodes</button><button type="button" aria-pressed="false" data-v="m">Michael era only</button></div></div>
          <div id="f-t1"></div><p class="small muted" id="tw-note"></p></div>
        <div class="card mt">
          <h3 class="card-title">That’s what she said: all of them, with the setups</h3>
          <p class="card-sub">In air order. The grey line is the setup, when the transcript has it, and the line itself is in the speaker’s colour.</p>
          <div class="tk-chips">
            <span class="chip"><b>${fmt.int(F.twssCount)}</b> times</span>
            <span class="chip"><b>${fmt.int(F.twssLines)}</b> lines</span>
            <span class="chip"><b>${fmt.int(F.twssEpisodes)}</b> episodes in the transcript</span>
            <span class="chip"><b>+${fmt.int(F.twssWikiOnly)}</b> from the fan wiki</span>
          </div>
          <div class="tk-chips tk-who-chips">${F.twssBy.map((t) => `<span class="chip">${dot(t.k)}${esc(t.k)} <b>${t.n}</b></span>`).join('')}</div>
          <ul class="tk-callouts">${twssCallouts(D, list).map((c) => `<li>${c}</li>`).join('')}</ul>
          <ol class="tk-twss" id="twss-list">${twssItems(D, list)}</ol>
          ${list.length > 8 ? `<button type="button" class="btn ghost mt" id="twss-more">Show all ${fmt.int(list.length)}</button>` : ''}
        </div>
      </div>
    </section>

    <section class="finding" id="hour">
      <div class="sticky-col">
        <p class="fnum">Three</p>
        <h2>Are the hour-long episodes better?</h2>
        <span class="verdict yes">Yes, by a lot</span>
        <div class="prose mt">
          <p>${F.hour.nA} episodes ran an hour. They average <strong>${F.hour.meanA.toFixed(2)}</strong> against <strong>${F.hour.meanB.toFixed(2)}</strong> for everything else, a gap of ${(F.hour.meanA - F.hour.meanB).toFixed(2)}. On ratings, that’s a bigger gap than Michael leaving (${(M.meanA - M.meanB).toFixed(2)}).</p>
          <p>Part of it is timing: ${F.hourMichael.nA} of the ${F.hour.nA} aired before Michael left, when everything rated higher. Compare only episodes up to <em>${esc(bye.t)}</em> and the hour-longs still come out ${(F.hourMichael.meanA - F.hourMichael.meanB).toFixed(2)} ahead (${pEq(F.hourMichael.p)}).</p>
          <p>This data can’t tell the extra time apart from the occasion. ${cap(nw(used.size))} of the ${nw(hours.length)} were occasions: ${and(occasions)}.${otherHours.length ? ` The other ${otherHours.length === 1 ? 'one is' : `${nw(otherHours.length)} are`} ${and(otherHours.map(ttl))}${/\.$/.test(otherHours[otherHours.length - 1].t) ? '' : '.'}` : ''}</p>
          <div class="tk-chips tk-ep-chips">${hours.map((e) => `<a class="chip" href="#/episode/${e.id}">${esc(e.t)} <b>${e.r.toFixed(1)}</b></a>`).join('')}</div>
        </div>
        <div class="explain"><b>How sure?</b> ${pEq(F.hour.p)}. Only ${F.hour.nA} episodes, but the gap is large enough that it doesn’t matter much.</div>
      </div>
      <div><div class="card"><h3 class="card-title">Hour-long episodes against the rest</h3><p class="card-sub">Niagara and The Delivery each aired as one hour, but the ratings data lists them as two episodes with separate IMDb scores, so their halves count as half-hours here.</p><div id="f-h1"></div></div></div>
    </section>

    <section class="finding" id="andy">
      <div class="sticky-col">
        <p class="fnum">Four</p>
        <h2>Is Andy why the later seasons rated lower?</h2>
        <span class="verdict no">Mostly no</span>
        <div class="prose mt">
          <p>Across every episode Andy is in, the more of the episode he talks, the lower it rated. The correlation is ${R}<strong>${fmt.num(andy.all.r)}</strong>, which is a lot for TV data.</p>
          <p>But his big episodes are in seasons 8 and 9, when everything rated lower. Look inside each era separately and it mostly disappears: ${R}${fmt.num(andy.early.r)} in seasons 1 to 7, ${R}${fmt.num(andy.late.r)} in 8 and 9, and ${andy.early.p >= 0.05 && andy.late.p >= 0.05 ? 'neither passes the test' : 'only one passes the test'}.</p>
          <p>So Andy talks a lot in a period that rated badly. That’s not the same as Andy making it rate badly.</p>
        </div>
        <div class="explain"><b>Why this matters.</b> This is the same trap as the “that’s what she said” result, the other way round. When two things both depend on the era, they’ll look related even if they have nothing to do with each other.</div>
      </div>
      <div><div class="card"><h3 class="card-title">Andy’s share of the lines against the rating</h3><p class="card-sub">The line fits all of them together.</p>
        <div class="legend"><span><i class="ring" style="background:var(--accent)"></i>Seasons 1 to 7</span><span><i class="ring" style="background:var(--ink-3)"></i>Seasons 8 and 9</span></div><div id="f-a1"></div></div></div>
    </section>

    <section class="finding" id="more">
      <div class="sticky-col">
        <p class="fnum">Five</p>
        <h2>Things that don’t matter.</h2>
        <span class="verdict">No effect</span>
        <div class="prose mt"><p>A few more I checked. None of them clears the bar, which is a result too.</p></div>
      </div>
      <div class="grid g2">
        <div class="card"><h3 class="card-title">Holiday episodes</h3><p class="card-sub">Christmas, Halloween, Valentine’s, Diwali, St. Patrick’s.</p><div class="stat-value">${fmt.signed(F.holiday.meanA - F.holiday.meanB)}</div>
          <p class="small muted">${F.holiday.nA} episodes, ${pEq(F.holiday.p)}. If anything a shade lower, and well inside the noise.</p>
          <details class="tk-more"><summary>Which ${F.holiday.nA}</summary><p class="small">${holidays.map((e) => `<a href="#/episode/${e.id}">${esc(e.t)}</a>`).join(' · ')}</p></details></div>
        <div class="card"><h3 class="card-title">Longer scripts</h3><p class="card-sub">Lines per episode against rating, half-hours only.</p><div class="stat-value">${R}${fmt.num(F.linesCorr.r)}</div><p class="small muted">${pEq(F.linesCorr.p)}. A busier script isn’t a better one.</p></div>
        <div class="card"><h3 class="card-title">Bigger casts</h3><p class="card-sub">Different speakers per half-hour against rating.</p><div class="stat-value">${R}${fmt.num(F.speakersCorr.r)}</div><p class="small muted">${pEq(F.speakersCorr.p)}, and that’s the era. Half-hours through <em>${esc(bye.t)}</em> have ${fmt.dec(mean(castA, (e) => e.speakers))} speakers on average and rate ${mean(castA, (e) => e.r).toFixed(2)}. After it, ${fmt.dec(mean(castB, (e) => e.speakers))} speakers and ${mean(castB, (e) => e.r).toFixed(2)}. Inside each season it’s ${R}${fmt.num(F.speakersWithin.r)} (${pEq(F.speakersWithin.p)}), which is nothing.</p></div>
        <div class="card"><h3 class="card-title">Michael’s screen time</h3><p class="card-sub">His share of lines, through <em>${esc(bye.t)}</em>.</p><div class="stat-value">${R}${fmt.num(F.michaelShareCorr.r)}</div><p class="small muted">${pEq(F.michaelShareCorr.p)}. See finding one.</p></div>
      </div>
    </section>
    </div>`,
    after() {
      timeline($('#f-m1'), D, { marker: F.goodbye, label: 'IMDb rating' });
      timeline($('#f-m2'), D, { marker: F.goodbye, value: (e) => e.v, yDomain: [2, 12], fmtv: (v) => `${v.toFixed(1)}M`, label: 'US viewers', height: 260, exclude: [F.superBowl] });
      const mEps = E.filter((e) => e.id <= F.goodbye);
      scatter($('#f-m3'), {
        pts: mEps.map((e) => ({ x: ((e.c[D.codes.Michael] || 0) / e.lines) * 100, y: e.r, ep: e, color: 'var(--accent)' })),
        xLabel: 'Michael’s share of lines, %', yLabel: 'IMDb', yDomain: [6.5, 10], xFmt: (v) => `${v}%`, label: 'Michael’s share of lines against rating',
        tipFn: (p) => `<div class="tt">${esc(p.ep.t)}</div><div class="tm">${epCode(p.ep)}</div><div class="tr" style="margin-top:6px"><span>Michael’s share</span><b>${fmt.pct(p.x)}</b></div><div class="tr"><span>IMDb</span><b>${p.y.toFixed(1)}</b></div>`,
      });
      const flag = (e) => e.twss > 0 || e.twssWiki;
      const drawT = (v) => {
        const pool = v === 'm' ? E.filter((e) => e.id <= F.goodbye) : E;
        const res = v === 'm' ? F.twssMichael : F.twssAll;
        const el = $('#f-t1');
        if (!el) return;
        el.replaceWith(Object.assign(document.createElement('div'), { id: 'f-t1' }));
        strip($('#f-t1'), { groups: [{ name: 'With the joke', color: 'var(--c-dwight)', values: pool.filter(flag) }, { name: 'Without', color: 'var(--ink-3)', values: pool.filter((e) => !flag(e)) }], label: 'Ratings with and without the joke' });
        requestAnimationFrame(() => $('#f-t1')?.classList.add('go'));
        $('#tw-note').textContent = `Gap ${fmt.signed(res.meanA - res.meanB)}, ${pEq(res.p)}. ${res.p < 0.05 ? 'Passes the usual test.' : 'Does not pass the usual test.'}`;
      };
      $$('#tw-t button').forEach((b) => b.addEventListener('click', () => {
        $$('#tw-t button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        drawT(b.dataset.v);
      }));
      drawT('all');
      $('#twss-more')?.addEventListener('click', (ev) => {
        $('#twss-list').classList.add('all');
        ev.currentTarget.remove();
        // The button is gone, so focus goes to the first joke it revealed.
        const first = $('#twss-list .tk-extra');
        if (first) { first.tabIndex = -1; first.focus({ preventScroll: true }); }
      });

      // A sticky column taller than the window would keep its end out of sight while the charts scroll past.
      // Those stick by their bottom edge instead: they scroll until the end shows, then hold. style.css sticks at 90px.
      const cols = $$('.finding .sticky-col');
      const fit = () => {
        if (!cols[0]?.isConnected) { removeEventListener('resize', fit); ro?.disconnect(); return; }
        for (const c of cols) {
          const room = innerHeight - 90 - 16;
          c.style.top = c.offsetHeight > room ? `${Math.round(innerHeight - c.offsetHeight - 16)}px` : '';
        }
      };
      const ro = 'ResizeObserver' in window ? new ResizeObserver(fit) : null;
      cols.forEach((c) => ro?.observe(c));
      addEventListener('resize', fit);
      fit();
      strip($('#f-h1'), { groups: [{ name: 'Hour-long', color: 'var(--accent)', values: E.filter((e) => e.hour) }, { name: 'Half-hour', color: 'var(--ink-3)', values: E.filter((e) => !e.hour) }], label: 'Hour-long episodes against the rest' });
      const aEps = E.filter((e) => e.c[D.codes.Andy]);
      scatter($('#f-a1'), {
        pts: aEps.map((e) => ({ x: (e.c[D.codes.Andy] / e.lines) * 100, y: e.r, ep: e, color: e.s <= 7 ? 'var(--accent)' : 'var(--ink-3)' })),
        xLabel: 'Andy’s share of lines, %', yLabel: 'IMDb', yDomain: [6, 10], xFmt: (v) => `${v}%`, label: 'Andy’s share of lines against rating',
        tipFn: (p) => `<div class="tt">${esc(p.ep.t)}</div><div class="tm">${epCode(p.ep)}</div><div class="tr" style="margin-top:6px"><span>Andy’s share</span><b>${fmt.pct(p.x)}</b></div><div class="tr"><span>IMDb</span><b>${p.y.toFixed(1)}</b></div>`,
      });
    },
  };
}
