import { $, $$, esc, fmt, slug, color, hbars, epCode, count } from './ui.js';
import { columns, matrix, timeline, scatter, strip } from './charts.js';
import { PAGES, OLD } from './sitemap.js';

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
// One name per page, from the site map.
const PG = Object.fromEntries(PAGES.map((p) => [p.key, p]));
// A character's name, linked when they have a page. Only the main cast do.
const charA = (D, k) => (D.char[k] ? `<a href="${charHref(D, k)}">${esc(k)}</a>` : esc(k));
// Links each name the first time it comes up and prints it plain after that, so a paragraph never links someone twice.
const linker = (D) => { const seen = new Set(); return (k) => (seen.has(k) ? esc(k) : (seen.add(k), charA(D, k))); };
const coupleOf = (D, a, b) => (D.couples || []).find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
const searchHref = (q) => `#/dialogue/q/${encodeURIComponent(q)}`;
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
// The data counts "lost your mind" under a label that reads as if someone says it to Stanley. Stanley is the one
// asking, and 5 of the 6 lines are the full "Have you lost your mind?" (the sixth is "Son, you've lost your mind."
// in Stairmageddon). So the card shows and counts the question, which also makes its tap search find the same 5.
// Checked by hand against the data's 6 lines in 6 episodes; if that changes, the card shows the counted phrase as is.
const RELABEL = { 'lost your mind': { of: 6, label: 'Have you lost your mind?', q: 'have you lost your mind', n: 5, eps: 5 } };
const relabel = (x) => {
  const r = RELABEL[x.q];
  if (!r) return x;
  return r.of === x.n ? { ...x, label: r.label, q: r.q, n: r.n, eps: r.eps } : { ...x, label: `…${x.q}` };
};
// D.quotes counts lines, not times, and names only the top speaker. I read these lines in the transcript to get the
// times and to see who says them. Each entry is keyed to the line count I checked, so if the data changes the card
// falls back to what D.quotes can say. Every quote with one line is said once in it (checked the same way).
const CHECKED = {
  'where are the turtles': { n: 2, times: 3, solo: true },
  'boom roasted': { n: 2, times: 9, solo: true },
  'have you lost your mind': { n: 5, times: 5, solo: true },
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
  const qs = D.quotes.map(relabel).sort((a, b) => order(a) - order(b));
  return qs.map((x, i) => {
    const miss = MISSING[x.q];
    const k = x.who || miss?.who;
    const e = x.ep != null ? D.episodes[x.ep] : miss?.ep ? D.episodes.find((y) => y.t === miss.ep) : null;
    const { times, solo } = x.n ? quoteFacts(D, x) : {};
    // Stamps count times said when that's known, and lines when it isn't.
    const stamp = !x.n ? (miss?.stamp || 'Never said') : times ? `Said ${fmt.times(times)}` : `In ${fmt.plural(x.n, 'line')}`;
    const shown = x.label;
    const tryQ = x.n ? asWritten(shown, x.q) : miss?.try;
    const link = e ? `<a href="#/episode/${e.id}">${esc(e.t)}</a>` : '';
    const whoLine = !k ? '' : x.n > 1 ? `${dot(k)}${charA(D, k)}${solo ? ', every time' : ' says it most'}` : `${dot(k)}${charA(D, k)}${link || miss?.where ? ` · ${link || esc(miss.where)}` : ''}`;
    const all = x.n === 2 ? 'both' : 'all';
    let note = '';
    if (!x.n) note = `${esc(miss?.note || 'Not in the transcript.')}${miss?.try ? ' <span class="tk-try">Tap for the closest it gets.</span>' : ''}`;
    else if (x.n > 1 && x.eps > 1) note = `${times && times !== x.n ? `${cap(nw(x.n))} lines, in` : 'In'} ${fmt.plural(x.eps, 'episode')}, from ${link} on.`;
    else if (x.n > 1) note = times && times !== x.n ? `${cap(nw(x.n))} lines, ${all} in ${link}.` : `${cap(all)} in ${link}.`;
    const sr = `${stamp}${times && times !== x.n ? `, in ${fmt.plural(x.n, 'line')}` : ''}.`;
    return `<div class="tk-card rv${x.n ? '' : ' is-never'}${tryQ ? ' is-tap' : ''}" style="--d:${(Math.min(i, 8) * 0.04).toFixed(2)}s"${tryQ ? ` data-q="${esc(tryQ)}"` : ''}>
      <span class="tk-stamp" aria-hidden="true">${stamp}</span>
      ${tryQ ? `<button type="button" class="tk-line" aria-expanded="false">${say(shown)}<span class="tk-sr"> ${x.n === 1 ? 'Read the line.' : 'Read the lines.'}</span></button>` : `<p class="tk-line">${say(shown)}</p>`}
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
    return `<button type="button" class="tk-nick rv" aria-expanded="false" style="--cc:${color(nk.who)};--d:${(Math.min(i, 6) * 0.04).toFixed(2)}s" data-q="&quot;${esc(nk.nick)}&quot;">
      <span class="tk-nwho">${nickWho(nk)}</span>
      <span class="tk-nn">“${esc(nk.nick)}”</span>
      <span class="tk-nc">${tally}</span>
      <span class="tk-spark" aria-hidden="true">${bars}</span>
      <span class="tk-nnote">${nickNote(nk)}<span class="tk-sr"> ${nk.lines === 1 ? 'Read the line.' : 'Read the lines.'}</span></span>
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
    const c = linker(D);
    const tp = top('Pam'), tj = top('Jim');
    const head = tp[0].k === 'Jim' && tj[0].k === 'Pam' ? `${c('Jim')} and ${c('Pam')} answer each other first.` : tp[0].k === 'Jim' ? `${c('Jim')} answers ${c('Pam')}.` : `${c('Pam')} gets ${c(tp[0].k)} more than ${c('Jim')}.`;
    out.push(`<p><strong>${head}</strong> When ${c('Pam')} finishes a line, ${c(tp[0].k)} talks next ${share(tp[0].v)} of the time and ${c(tp[1].k)} ${share(tp[1].v)}. When ${c('Jim')} finishes, it’s ${c(tj[0].k)} ${share(tj[0].v)} and ${c(tj[1].k)} ${share(tj[1].v)}.</p>`);
  }

  if (has('Michael')) {
    const others = keys.filter((k) => k !== 'Michael');
    const mine = others.filter((k) => top(k)[0].k === 'Michael');
    const ex = others.filter((k) => top(k)[0].k !== 'Michael');
    const c = linker(D);
    const head = `${c('Michael')} answers ${mine.length === others.length ? 'everyone else' : mine.length * 2 > others.length ? 'most of the others' : 'some of the others'}.`;
    // Pairs who are each other's first answer get one clause.
    const used = new Set();
    const parts = [];
    for (const k of ex) {
      if (used.has(k)) continue;
      const [t1, t2] = top(k);
      if (ex.includes(t1.k) && top(t1.k)[0].k === k && !used.has(t1.k)) { used.add(k); used.add(t1.k); parts.push(`${c(k)} and ${c(t1.k)}, who get each other`); continue; }
      used.add(k);
      parts.push(t1.v - t2.v < 0.01 ? `${c(k)}, who gets ${c(t1.k)} by a hair over ${c(t2.k)}` : `${c(k)}, who gets ${c(t1.k)} ${share(t1.v)} of the time`);
    }
    const ms = D.char.Michael?.perSeasonShare || [];
    const his = ms.map((v, i) => [v, i + 1]).filter(([v]) => v > 1);
    const vol = his.length
      ? ` Part of that is volume: in seasons ${his[0][1]} to ${his[his.length - 1][1]} he has ${fmt.pct(Math.min(...his.map((x) => x[0])))} to ${fmt.pct(Math.max(...his.map((x) => x[0])))} of each season’s lines, so he’s the likeliest next voice almost by default.`
      : '';
    out.push(`<p><strong>${head}</strong> He’s the most likely next speaker for ${nw(mine.length)} of the other ${nw(others.length)}.${parts.length ? ` The exceptions are ${andSemi(parts)}.` : ''}${vol}</p>`);

    const lean = others.map((k) => ({ k, v: sh(k, 'Michael') })).sort((a, b) => b.v - a.v);
    const close = lean[0].v - lean[2].v < 0.015;
    // One clause per person, so no share reads as one of Ryan's next speakers.
    const c3 = linker(D);
    let p3 = `${c3(lean[0].k)} leans on ${c3('Michael')} hardest: after ${c3(lean[0].k)} speaks, Michael goes next ${share(lean[0].v)} of the time. After ${c3(lean[1].k)} it’s ${share(lean[1].v)}, and after ${c3(lean[2].k)} ${share(lean[2].v)}${close ? ', so it’s close' : ''}.`;
    if (has('Angela', 'Dwight')) {
      const [a1, a2] = top('Angela');
      const pair = new Set([a1.k, a2.k]);
      if (a1.v - a2.v < 0.03) p3 += ` ${c3('Angela')} splits it between ${c3(a1.k)} (${share(a1.v)}) and ${c3(a2.k)} (${share(a2.v)})${pair.has('Michael') && pair.has('Dwight') ? ', which tracks' : ''}.`;
    }
    out.push(`<p>${p3}</p>`);
  }
  out.push(`<p class="small muted">Counted over the ${fmt.int(episodes)} episodes whose transcript is in order. Back-to-back lines also catch scene changes, so read it as who shares scenes.</p>`);
  return out.join('');
}

// The longest stretch where only two people talk, the same way build_data.py's two_person_runs finds it.
function longestPair(rows) {
  const sp = rows.map((r) => r[1]);
  let best = null;
  for (let i = 0; i < sp.length;) {
    const pair = new Set([sp[i]]);
    let j = i + 1;
    while (j < sp.length && (pair.has(sp[j]) || pair.size < 2)) pair.add(sp[j++]);
    let changes = 0;
    for (let x = i + 1; x < j; x++) if (sp[x] !== sp[x - 1]) changes++;
    if (pair.size === 2 && changes >= 2 && (!best || j - i > best.n)) best = { n: j - i, at: i };
    // Restart from the last speaker change so overlapping runs are found.
    let k = j - 1;
    while (k > i && sp[k - 1] === sp[k]) k--;
    i = Math.max(i + 1, k);
  }
  if (!best) return null;
  const run = rows.slice(best.at, best.at + best.n).map((r) => [r[1], r[2]]);
  return { n: best.n, lines: run.slice(0, 6), end: run.slice(Math.max(6, best.n - 2)) };
}

// D.scenes stops at 12, which can cut through a tie. Every run tied with the last one belongs on the list too, so
// those come from their episode's e.run, and their lines load from the transcript when the list is opened.
function sceneRuns(D) {
  const sc = D.scenes || [];
  if (!sc.length) return [];
  const last = sc[sc.length - 1].n;
  const have = new Set(sc.map((s) => s.ep));
  const more = D.episodes.filter((e) => e.run && e.run.n === last && !have.has(e.id)).map((e) => ({ ep: e.id, n: e.run.n, a: e.run.a, b: e.run.b }));
  // Competition ranks, the way the episode pages rank them: two 36-line runs are both 8th, and the next is 10th.
  const all = [...sc, ...more];
  return all.map((s) => ({ ...s, pos: 1 + all.filter((x) => x.n > s.n).length, tied: all.some((x) => x !== s && x.n === s.n) }));
}

function sceneScript(sc) {
  const first = sc.lines.slice(0, 3);
  const last = sc.end[sc.end.length - 1];
  const skipped = sc.n - first.length - 1;
  const ln = ([k, t]) => `<p class="tk-sl"><b>${dot(k)}${esc(k)}</b> ${say(t)}</p>`;
  return `${first.map(ln).join('')}${skipped > 0 ? `<p class="tk-gap">${fmt.int(skipped)} more ${skipped === 1 ? 'line' : 'lines'}</p>` : ''}${last ? ln(last) : ''}`;
}

// A pair with a panel on Couples Discount links to it. Otherwise each name links to its own page, if it has one.
function pairLabel(D, a, b) {
  const cp = coupleOf(D, a, b);
  const dots = `${dot(a)}${dot(b)}`;
  if (cp) return `<a class="tk-pair" href="${PG.couples.h}@${slug(`${cp.a}-${cp.b}`)}" title="${esc(PG.couples.name)}">${dots}${esc(a)} &amp; ${esc(b)}</a>`;
  return `<span class="tk-pair">${dots}<span>${charA(D, a)} &amp; ${charA(D, b)}</span></span>`;
}

function scenesList(D, runs) {
  const rank = (k) => D.char[k]?.rank ?? 999;
  return runs.map((sc) => {
    const e = D.episodes[sc.ep];
    const [a, b] = [sc.a, sc.b].sort((x, y) => rank(x) - rank(y));
    return `<li class="tk-scene${sc.pos > 6 ? ' tk-extra' : ''}">
      <div class="tk-sh"><span class="tk-sn">${sc.pos}${sc.tied ? '<span class="tk-sr">, tied</span>' : ''}</span>${pairLabel(D, a, b)}<b class="tk-sc">${fmt.int(sc.n)} lines</b></div>
      <div class="tk-sm"><a href="#/episode/${e.id}">${esc(e.t)}</a> · ${epCode(e)}${e.shuffled ? ' <span class="flag alt">Shuffled transcript</span>' : ''}</div>
      <div class="tk-script"${sc.lines ? '' : ` data-ep="${e.id}"`}>${sc.lines ? sceneScript(sc) : ''}</div>
    </li>`;
  }).join('');
}

// Running jokes whose label isn't quite what build_data.py counts: it counts every "vance refrigeration".
const PHRASE_SHOW = { 'Bob Vance, Vance Refrigeration': 'Vance Refrigeration' };
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
      ${twss ? `<p class="small"><a class="link-arrow" href="${PG.findings.h}@twss-list">All of them, with the setups</a></p>` : ''}
      ${q ? `<p class="small"><button type="button" class="link-arrow tk-read" aria-expanded="false" data-q="${esc(q)}">${p.lines === 1 ? 'Read the line' : `Read all ${fmt.int(p.lines)} lines`}</button></p>` : ''}
      <div id="phr-chart" class="mt"></div></div>
    <div class="card"><h3 class="card-title">Who says it</h3><p class="card-sub">${everyone ? 'Everyone who says it, by times said.' : `The top ${nw(p.speakers.length)}, by times said.`}</p>
      ${hbars(p.speakers.map((s) => ({ label: s.k, v: s.n, color: color(s.k), dot: color(s.k), k: s.k })), { href: (r) => charHref(D, r.k) })}</div>`;
}

export function dialogue(D, lines, term) {
  const cats = D.seasons.map((s) => `S${s.n}`);
  const runs = sceneRuns(D);
  const nScenesShuf = runs.filter((s) => D.episodes[s.ep].shuffled).length;
  const nScenesMore = runs.filter((s) => s.pos > 6).length;
  // The lede's example is an episode, so it links to it.
  const tots = D.episodes.find((e) => norm(e.t) === 'scotts tots');
  // In the html below, the jump bar's mark for the longest scenes (#long-scenes) is on a plain wrapper, not on the
  // card. The card slides up 18px as it comes into view, so a jump measured on the card itself landed 18px short.
  return {
    title: term ? `“${parse(term).show}” in the script` : PG.dialogue.name,
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">${esc(PG.dialogue.name)}</p>
      <h1>Every line, <em>searchable.</em></h1>
      <p class="lede">All ${fmt.int(D.totals.lines)} lines, ${fmt.int(D.totals.vocab)} different words. Punctuation doesn’t count, so “scotts tots” finds ${tots ? ttl(tots) : 'Scott’s Tots'}.</p>
    </section>
    <section class="wrap" id="search" data-sec="Search">
      <form class="searchbox rv" role="search" id="sform">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
        <input id="sq" type="search" enterkeyhint="search" placeholder="Try “beets” or “bankruptcy”" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search the script">
      </form>
      <p class="tk-count" id="s-count" hidden></p>
      <div class="suggest rv">${SUGGEST.map((s) => `<button type="button" class="pill" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <p id="s-status" class="tk-sr" role="status" aria-live="polite"></p>
      <div id="sres" class="mt"></div>
    </section>

    <section class="section wrap" id="quotables" data-sec="Quotables">
      <div class="section-head rv"><div><p class="eyebrow">Quotables</p><h2>The lines you quote most, <em>the script says least.</em></h2></div>
        <p class="small muted tk-head-note">Counted in the fan transcript. Tap a card to read it in the script.</p></div>
      <div class="tk-wall">${quoteWall(D)}</div>
    </section>

    <section class="section wrap" id="jokes" data-sec="Running jokes">
      <div class="section-head rv"><div><p class="eyebrow">Running jokes</p><h2>Things people kept saying.</h2></div></div>
      <div class="pills rv tk-phr" id="phr">${D.phrases.map((p, i) => `<button type="button" class="pill" aria-pressed="${i === 0}" data-i="${i}">${esc(phraseShow(p))}</button>`).join('')}</div>
      <div class="grid g-7-5 mt" id="phr-body"></div>
    </section>

    <section class="section wrap" id="nicknames" data-sec="Nicknames">
      <div class="section-head rv"><div><p class="eyebrow">Nicknames</p><h2>Who calls whom what.</h2></div>
        <p class="small muted tk-head-note">Counted as whole words, so “Kevin” doesn’t count as a “Kev”. Tap one for every line.</p></div>
      <div class="tk-nicks">${nickBoard(D)}</div>
    </section>

    <section class="section wrap" id="answers" data-sec="Who answers whom">
      <div class="section-head rv"><div><p class="eyebrow">Conversation</p><h2>Who answers whom.</h2></div></div>
      <div class="grid g-7-5" style="align-items:start">
        <div class="card rv"><h3 class="card-title">After each person speaks, who goes next</h3>
          <p class="card-sub">Read across a row: after that person finishes a line, how often each of the others speaks next. Rows don’t reach 100% because people outside these ${nw(D.matrix.keys.length)} answer too.</p>
          <p class="matrix-hint">Swipe sideways to see all ${nw(D.matrix.keys.length)}.</p>
          <div class="matrix-wrap"><div class="matrix" id="mx"></div></div>
          <p class="tk-couples"><a class="link-arrow" href="${PG.couples.h}">${esc(PG.couples.name)}: the ships, measured</a></p></div>
        <div class="prose rv" style="--d:.08s">${answersProse(D)}</div>
      </div>
      <div class="mt" id="long-scenes" data-sec="Longest scenes">
      <div class="card rv">
        <h3 class="card-title">The longest two-person scenes</h3>
        ${nScenesShuf ? `<p class="card-sub">In the ${nScenesShuf === 1 ? 'one' : nw(nScenesShuf)} marked “shuffled transcript”, two scenes trade lines, so the run may be both scenes taking turns.</p>` : ''}
        <ol class="tk-scenes" id="scenes">${scenesList(D, runs)}</ol>
        ${nScenesMore ? `<button type="button" class="btn ghost mt" id="scenes-more">Show all ${nw(runs.length)}</button>` : ''}
      </div>
      </div>
    </section>`,
    after() {
      matrix($('#mx'), D);
      const input = $('#sq');
      const out = $('#sres');
      const sec = $('#search');
      const countEl = $('#s-count');
      // What the reader had open, saved on this history entry when they last clicked something here (see remember below).
      const saved = history.state && typeof history.state.tkY === 'number' ? history.state : null;
      const smooth = () => (reduceMotion() ? 'auto' : 'smooth');
      let go = () => {};
      let remember = () => {};
      let shown = 0;
      let phr = 0;
      // Screen readers hear one short sentence per search, not forty lines of script.
      const status = (t) => { const el = $('#s-status'); if (el) el.textContent = t; };
      // Revealing more takes the button away, so focus moves to the first thing it revealed.
      const focusEl = (el) => { if (!el) return; el.tabIndex = -1; el.focus({ preventScroll: true }); };
      const loading = () => `<p>Pulling the script out of the filing cabinet. <span class="tk-load-n">${S.done} of ${D.seasons.length} seasons</span></p><div class="tk-bar"><span style="width:${(S.done / D.seasons.length) * 100}%"></span></div>`;
      // The search box and an open card can both be waiting on the script, so every loading bar on the page moves.
      const progress = (n) => {
        $$('.tk-load').forEach((box) => {
          const bar = $('.tk-bar span', box);
          const txt = $('.tk-load-n', box);
          if (bar) bar.style.width = `${(n / D.seasons.length) * 100}%`;
          if (txt) txt.textContent = `${n} of ${D.seasons.length} seasons`;
        });
      };
      // One matching line: who says it, the line, and the episode it's in.
      const lineRow = (i, rx) => {
        const [ep, who, tx] = S.all[i];
        const e = D.episodes[ep];
        return `<div class="ln"><span class="sp">${dot(who)}${esc(who)}</span><span><span class="tx">${highlight(tx, rx)}</span><div class="meta"><a href="#/episode/${e.id}">${esc(e.t)}</a> · ${epCode(e)}</div></span></div>`;
      };

      // lines in place
      // A quote, nickname or running-joke card opens its lines right under itself, so the reader keeps their place on
      // the board instead of being sent up to the search box. One panel a board. What's open is saved with the scroll
      // (remember, below), so Back from an episode returns to the same card with the same lines showing.
      const BOARDS = {
        wall: { cards: () => $$('.tk-wall .tk-card.is-tap'), btn: (c) => $('button.tk-line', c), slot: (c) => c },
        nicks: { cards: () => $$('.tk-nicks .tk-nick'), btn: (c) => c, slot: (c) => c },
        // The running joke's lines go inside its card, straight under the button, which then offers to put them away.
        phr: { cards: () => $$('#phr-body .tk-read'), btn: (c) => c, slot: (c) => c.closest('p'), hide: true },
      };
      const openIn = {};
      const inFirst = () => (matchMedia('(max-width: 620px)').matches ? 5 : 8);
      // Whatever opens or closes above the card just tapped, the card stays under the thumb.
      const keepStill = (node, change) => {
        const y = node.getBoundingClientRect().top;
        change();
        const dy = node.getBoundingClientRect().top - y;
        if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: 'instant' });
      };
      const closeIn = (board, focus) => {
        const o = openIn[board];
        if (!o) return;
        delete openIn[board];
        const B = BOARDS[board];
        const c = B.cards()[o.i];
        o.el.remove();
        if (!c) return;
        c.classList.remove('is-open');
        B.btn(c).setAttribute('aria-expanded', 'false');
        if (B.hide && c.dataset.label) c.textContent = c.dataset.label;
        if (focus) B.btn(c).focus({ preventScroll: true });
      };
      function showIn(board, i, { upTo = 0, quiet = false } = {}) {
        const B = BOARDS[board];
        const c = B.cards()[i];
        if (!c) return Promise.resolve();
        const Q = parse(c.dataset.q);
        const el = document.createElement('section');
        el.className = 'tk-in';
        el.id = `tk-in-${board}`;
        el.setAttribute('aria-label', `Lines with ${Q.show}`);
        el.innerHTML = `<div class="tk-in-head"><p class="tk-in-t"><b>“${esc(Q.show)}”</b> <span class="tk-in-n"></span></p>
          <button type="button" class="tk-in-x" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button></div>
          <div class="tk-in-body"><div class="tk-load">${loading()}</div></div>`;
        const put = () => { closeIn(board); B.slot(c).after(el); };
        if (quiet) put(); else keepStill(c, put);
        c.classList.add('is-open');
        B.btn(c).setAttribute('aria-expanded', 'true');
        B.btn(c).setAttribute('aria-controls', el.id);
        if (B.hide) { c.dataset.label = c.textContent; c.textContent = c.textContent.endsWith('lines') ? 'Hide the lines' : 'Hide the line'; }
        const o = (openIn[board] = { i, shown: 0, el });
        const live = () => openIn[board] === o && el.isConnected;
        // Bring as much of the panel on screen as fits without pushing its card up under the bars.
        const reveal = () => {
          const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
          const dy = Math.min(el.getBoundingClientRect().bottom + 16 - innerHeight, c.getBoundingClientRect().top - pad);
          if (dy > 1) window.scrollTo({ top: scrollY + dy, behavior: smooth() });
        };
        let moved = false;
        let more = () => {};
        el.addEventListener('click', (ev) => {
          if (ev.target.closest('.tk-in-x')) { closeIn(board, true); remember(); }
          else if (ev.target.closest('.tk-in-more')) { more(40, true); remember(); }
          else if (ev.target.closest('.tk-in-retry')) showIn(board, i);
        });
        const fill = () => {
          if (!live()) return;
          const hits = find(Q);
          const body = $('.tk-in-body', el);
          if (!hits.length) { body.innerHTML = '<p class="small muted">Nobody says it in this transcript.</p>'; return; }
          const rx = marker(Q);
          const nEps = new Set(hits.map((h) => S.all[h][0])).size;
          const tally = `${fmt.plural(hits.length, 'line')} in ${fmt.plural(nEps, 'episode')}`;
          $('.tk-in-n', el).textContent = tally;
          // One line has nothing more to chart, so only longer lists offer the search and its by-season view.
          body.innerHTML = `<div class="script tk-in-lines"></div>${hits.length > 1 ? `<div class="tk-in-foot"><span class="tk-in-ms"></span><a class="link-arrow" href="${searchHref(c.dataset.q)}">Open in the search</a></div>` : ''}`;
          more = (n, focus) => {
            const box = $('.tk-in-lines', el);
            const from = o.shown;
            const chunk = hits.slice(from, from + n);
            o.shown += chunk.length;
            box.insertAdjacentHTML('beforeend', chunk.map((h) => lineRow(h, rx)).join(''));
            const left = hits.length - o.shown;
            const ms = $('.tk-in-ms', el);
            if (ms) ms.innerHTML = left > 0 ? `<button type="button" class="btn ghost tk-in-more">${left > 40 ? `Show 40 more (${fmt.int(left)} left)` : `Show all ${fmt.int(hits.length)}`}</button>` : '';
            if (focus) focusEl(box.children[from]);
          };
          more(Math.max(inFirst(), upTo));
          if (quiet) return;
          status(`${Q.show}: ${tally}.`);
          if (!moved) reveal();
        };
        if (S.all) { fill(); return Promise.resolve(); }
        S.onProgress = progress;
        if (!quiet) {
          // The script is still on its way. Show the loading bar now, and the lines when they land, unless the
          // reader has moved on by then.
          reveal();
          const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
          const mine = () => { moved = true; events.forEach((e) => removeEventListener(e, mine)); };
          events.forEach((e) => addEventListener(e, mine, { passive: true }));
        }
        return loadAll(D, lines).then(fill).catch(() => {
          if (live()) $('.tk-in-body', el).innerHTML = '<p class="small">The script didn’t load. Check your connection, then <button type="button" class="tk-link tk-in-retry">try again</button></p>';
        });
      }
      const toggleIn = (board, c) => {
        const i = BOARDS[board].cards().indexOf(c);
        if (i < 0) return;
        if (openIn[board]?.i === i) closeIn(board);
        else showIn(board, i);
        remember();
      };
      $$('.tk-card.is-tap').forEach((c) => c.addEventListener('click', (ev) => { if (!ev.target.closest('a')) toggleIn('wall', c); }));
      $$('.tk-nick').forEach((b) => b.addEventListener('click', () => toggleIn('nicks', b)));

      // running jokes
      const drawP = (i) => {
        const p = D.phrases[i];
        const body = $('#phr-body');
        if (!p || !body) return;
        phr = i;
        // The old card takes its open lines with it.
        delete openIn.phr;
        body.innerHTML = phraseCard(D, p);
        columns($('#phr-chart'), { cats, series: [{ name: phraseShow(p), color: 'var(--accent)', values: p.perSeason }], height: 200, href: (it) => `#/season/${it.ci + 1}`, label: `${phraseShow(p)}, by season` });
        $('#phr-body .tk-read')?.addEventListener('click', (ev) => toggleIn('phr', ev.currentTarget));
        requestAnimationFrame(() => { $('#phr-chart')?.classList.add('go'); $('#phr-body .hbars')?.classList.add('go'); });
      };
      const pick = (b) => {
        $$('#phr .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        drawP(+b.dataset.i);
      };
      $$('#phr .pill').forEach((b) => b.addEventListener('click', () => {
        pick(b);
        b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: smooth() });
      }));
      const b0 = saved?.tkPhr ? $(`#phr .pill[data-i="${saved.tkPhr}"]`) : null;
      if (b0) {
        pick(b0);
        // Bring the pill into view inside its strip without moving the page.
        const strip = $('#phr');
        strip.scrollLeft += b0.getBoundingClientRect().left - strip.getBoundingClientRect().left - 24;
      } else drawP(0);

      // Runs the data's top 12 left out have no lines yet. Fetch them from the transcript once they're on screen.
      const fillScenes = (all) => {
        $$('#scenes .tk-script[data-ep]').forEach((box) => {
          if (!all && box.closest('.tk-extra')) return;
          const e = D.episodes[+box.dataset.ep];
          box.removeAttribute('data-ep');
          lines(e.s).then((L) => {
            if (!box.isConnected) return;
            const sc = longestPair(L.filter((r) => r[0] === e.id));
            if (sc && sc.n === e.run.n) box.innerHTML = sceneScript(sc);
          }).catch(() => {});
        });
      };
      fillScenes(false);
      const scenesAll = () => { $('#scenes')?.classList.add('all'); $('#scenes-more')?.remove(); fillScenes(true); };
      $('#scenes-more')?.addEventListener('click', () => { scenesAll(); focusEl($('#scenes .tk-extra')); });
      if (saved?.tkScenes) scenesAll();

      // search
      let timer;
      let seq = 0;
      const setURL = (t) => {
        const clean = t.replace(/@/g, ' ').trim();
        const url = clean ? searchHref(clean) : PG.dialogue.h;
        // replaceState doesn't fire hashchange, so the router doesn't re-render the page under the reader.
        if (location.hash !== url) history.replaceState(null, '', url);
        document.title = `${clean ? `“${parse(clean).show}” in the script` : PG.dialogue.name} · The Office, by the numbers`;
      };
      // The count sits right under the box, where it shows above a phone's keyboard. Tapping it goes to the lines.
      const setCount = (html) => { countEl.innerHTML = html; countEl.hidden = !html; };
      countEl.addEventListener('click', (ev) => {
        const card = $('#s-hits');
        if (!card || !ev.target.closest('button')) return;
        input.blur();
        card.scrollIntoView({ behavior: smooth(), block: 'start' });
        focusEl(card);
      });

      async function run(raw, { restore } = {}) {
        const my = ++seq;
        const Q = parse(raw);
        // With a search on, the suggestions fold into one row (css) so the results start higher.
        sec.classList.toggle('has-q', Q.q.length >= 2);
        if (Q.q.length < 2) { out.innerHTML = ''; status(''); setCount(''); return; }
        if (!S.all) {
          setCount('Loading the script');
          out.innerHTML = `<div class="card tk-load">${loading()}</div>`;
          S.onProgress = progress;
        }
        try {
          await loadAll(D, lines);
        } catch (err) {
          if (my !== seq || !out.isConnected) return;
          status('The script didn’t load.');
          setCount('');
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
          setCount('No lines');
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
        const tally = `${fmt.plural(hits.length, 'line')} in ${fmt.plural(eps.length, 'episode')}`;
        shown = 0;
        status(`${Q.show}: ${tally}.`);
        setCount(`<button type="button" class="tk-jump">${tally}</button>`);
        // The lines come first. The two charts follow them on a phone and sit beside them on a wide screen.
        out.innerHTML = `
          <div class="grid g-7-5 tk-res" style="align-items:start">
            <div class="card" id="s-hits"><p class="phrase-big tk-term">${shownTerm}</p>
              <p class="phrase-total">${tally}.${most}</p>
              ${wholeNote(Q, hits, L, rx)}
              ${twssNote(Q, hits, L)}
              <div class="script mt" id="s-lines"></div><div id="s-more" class="mt"></div></div>
            <div class="grid tk-side">
              <div class="card"><h3 class="card-title">When it’s said</h3><p class="card-sub">Lines containing it, by season.</p><div id="s-chart"></div></div>
              <div class="card"><h3 class="card-title">Who says it</h3><p class="card-sub">Lines containing it, by speaker.${speakers.length > sp.length ? ` Top ${nw(sp.length)} of ${fmt.int(speakers.length)}.` : ''}</p>
                ${hbars(sp.map(([k, n]) => ({ label: k, v: n, color: color(k), dot: color(k), k })), { href: (r) => charHref(D, r.k) })}</div>
            </div>
          </div>`;
        columns($('#s-chart'), { cats, series: [{ name: Q.show, color: 'var(--accent)', values: bySeason }], height: 190, href: (it) => `#/season/${it.ci + 1}`, label: `${Q.show}, by season` });
        requestAnimationFrame(() => { $('#s-chart')?.classList.add('go'); $('#sres .hbars')?.classList.add('go'); });
        // Stacked, a long first batch would bury the charts, so a narrow screen starts with ten lines.
        const first = matchMedia('(max-width: 960px)').matches ? 10 : 40;
        const more = (focus) => {
          const box = $('#s-lines');
          if (!box) return;
          const from = shown;
          const chunk = hits.slice(shown, shown + (shown ? 40 : first));
          shown += chunk.length;
          box.insertAdjacentHTML('beforeend', chunk.map((i) => lineRow(i, rx)).join(''));
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
        // The title is set the way the "Most in" titles just above it in this card are: linked, not italic.
        const inEp = ask.length ? D.episodes[L[ask[0]][0]] : null;
        return `<p class="small muted">${inEp ? `One of these is ${charA(D, L[ask[0]][1])} asking whether it counts, in <a href="#/episode/${inEp.id}">${esc(inEp.t)}</a>. ` : ''}<a href="${PG.findings.h}@twss-list">All ${fmt.int(D.findings.twssLines)} jokes, with the setups</a>.</p>`;
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
      out.addEventListener('click', (ev) => { const b = ev.target.closest('.tk-link[data-q]'); if (b) go(b.dataset.q); });

      // app.js remembers scroll by route, but a search rewrites the URL under it, and it can't know what was expanded.
      // So any click on this page saves the scroll, the lines shown, the open scenes, the running joke and the cards
      // open in place on this history entry. Links and chart taps both start with a click, so Back from anywhere
      // lands on the same spot.
      remember = () => {
        if (!input.isConnected) { document.removeEventListener('click', remember, true); return; }
        const tkIn = Object.fromEntries(Object.entries(openIn).map(([b, o]) => [b, [o.i, o.shown]]));
        try { history.replaceState({ tkY: scrollY, tkShown: shown, tkScenes: !!$('#scenes.all'), tkPhr: phr, tkIn }, ''); } catch (err) { /* Safari rations replaceState */ }
      };
      document.addEventListener('click', remember, true);

      // Back on this page: reopen the cards that were open, then go to where the reader was.
      const reopen = saved?.tkIn ? Object.entries(saved.tkIn).filter(([b, v]) => BOARDS[b] && Array.isArray(v)) : [];
      const wait = !S.all && reopen.length > 0;
      const opened = Promise.all(reopen.map(([b, [i, n]]) => showIn(b, i, { upTo: n, quiet: true })));
      if (term) {
        input.value = term;
        run(term, { restore: saved ? { y: saved.tkY, shown: saved.tkShown || 0 } : null });
      } else if (saved) {
        const back = () => requestAnimationFrame(() => window.scrollTo({ top: saved.tkY, behavior: 'instant' }));
        back();
        if (wait) {
          // After a reload the script loads again before those cards can fill and push the page back out. Go back
          // once they have, unless the reader has already started moving.
          let hands = false;
          const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
          const mine = () => { hands = true; events.forEach((e) => removeEventListener(e, mine)); };
          events.forEach((e) => addEventListener(e, mine, { passive: true }));
          // Twice, a frame apart: when the address has an @section, the router is still holding the page on that
          // section while it grows, and gets the last word in the first frame.
          opened.then(() => { const moved = hands; mine(); if (!moved && input.isConnected) { back(); requestAnimationFrame(back); } });
        }
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
    if (xs.length >= 3 && feeders.size === 1 && xs[0].setup) { const c = linker(D); out.push(`${c(xs[0].setup.k)} feeds ${c(xs[0].k)} ${nw(xs.length)} in ${ttl(E[+ep])}.`); }
  }
  const both = list.find((x) => x.self && x.k !== 'Michael');
  if (both) out.push(`${charA(D, both.k)} does both halves in ${ttl(E[both.ep])}.`);
  const same = list.filter((x) => x.setup && /harder than it has to be/i.test(x.setup.t));
  if (same.length >= 2) {
    const [a, b] = same;
    const gap = Math.abs(E[b.ep].s - E[a.ep].s);
    const c = linker(D);
    out.push(`${c(a.setup.k)} and ${c(b.setup.k)} hand ${c(a.k)} the same setup, “harder than it has to be”, ${gap ? `${nw(gap)} season${gap === 1 ? '' : 's'} apart` : 'in the same season'}.`);
  }
  const last = list[list.length - 1];
  if (last) out.push(`The show’s last one is ${charA(D, last.k)}’s, in ${E[last.ep].t === 'Finale' ? `the <a href="#/episode/${last.ep}"><em>Finale</em></a>` : ttl(E[last.ep])}.`);
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
  const finalRun = E[E.length - 3];
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
  // Section Five's line comes from the four cards under it, so it can't call a pass a miss.
  const fiveP = [['bigger casts', F.speakersCorr.p], ['holiday episodes', F.holiday.p], ['longer scripts', F.linesCorr.p], ['Michael’s share of lines', F.michaelShareCorr.p]];
  const pass = fiveP.filter(([, p]) => p < 0.05).map(([k]) => k);
  // Links the sentences below use: the ranked list filtered the way each number was counted, and the script search.
  const ranked = (q) => `${PG.episodes.h}@${q}`;
  const here = (id) => `${PG.findings.h}@${id}`;
  const c2 = linker(D);
  const multiLine = multi.length ? ` The extra ${multi.length === 1 ? (multi[0].n === 2 ? 'one is' : `${nw(multi[0].n - 1)} are`) : 'ones are'} ${and(multi.map((x) => `${c2(x.k)} saying it ${x.n === 2 ? 'twice' : `${nw(x.n)} times`} in one go in ${ttl(E[x.ep])}`))}.` : '';
  // Niagara and The Delivery are two rows each in the data. The name links to the first half.
  const part1 = (name) => { const e = E.find((x) => x.t.startsWith(`${name}:`)); return e ? `<a href="#/episode/${e.id}"><em>${esc(name)}</em></a>` : `<em>${esc(name)}</em>`; };
  const fiveLine = !pass.length ? 'A few more I checked. None of them clears the bar, which is a result too.'
    : pass.length === 1 && pass[0] === 'bigger casts' ? 'A few more I checked. Only bigger casts clears the bar, and that turns out to be the era.'
    : `A few more I checked. ${pass.length === 1 ? 'Only one clears' : `${cap(nw(pass.length))} clear`} the bar: ${and(pass)}.`;
  return {
    title: PG.findings.name,
    html: `
    <section class="wrap page-head">
      <p class="eyebrow">${esc(PG.findings.name)}</p>
      <h1>What the numbers <em>actually say.</em></h1>
      <p class="lede">Five questions fans argue about, answered with the data and a couple of statistical tests.</p>
    </section>
    <div class="wrap">

    <section class="finding" id="michael" data-sec="After Michael">
      <div class="sticky-col">
        <p class="fnum">One</p>
        <h2>Did the show get worse after Michael left?</h2>
        <span class="verdict yes">Yes, clearly</span>
        <div class="prose mt">
          <p>Up to and including ${ttl(bye)}, <a href="${ranked('era=with')}">${M.nA} episodes</a> average <strong>${M.meanA.toFixed(2)}</strong> on IMDb. The <a href="${ranked('era=after')}">${M.nB} after it</a> average <strong>${M.meanB.toFixed(2)}</strong>, a drop of ${(M.meanA - M.meanB).toFixed(2)} points.</p>
          <p>It isn’t a few big nights doing the work. Take out the ${hours.length} hour-long episodes, ${ttl(bye)} and the final run from ${ttl(finalRun)} on, and it’s still <strong>${C.meanA.toFixed(2)}</strong> against <strong>${C.meanB.toFixed(2)}</strong> over ${C.nA} and ${C.nB} episodes (${pEq(C.p)}).</p>
          <p>Viewers fall harder, from ${fmt.m(V.meanA)} to ${fmt.m(V.meanB)} an episode. That leaves out ${ttl(sb)}, which aired after the Super Bowl to ${fmt.m(sb.v)}, so it doesn’t flatter the early years.</p>
        </div>
        <div class="explain"><b>The check.</b> I shuffled the labels “with Michael” and “without” at random ${fmt.int(SHUFFLES)} times and counted how often chance alone made a gap this big. ${permText(F.michaelRatingPerm)} A Welch t-test agrees (${pEq(M.p)}).<br><br><b>The catch.</b> Network TV was losing viewers everywhere by 2011, so not all of the viewer drop is ${charA(D, 'Michael')}.</div>
      </div>
      <div>
        <div class="card"><h3 class="card-title">IMDb rating, every episode</h3><p class="card-sub">The solid line is a 9-episode moving average, on each side of Michael leaving.</p><div id="f-m1"></div></div>
        <div class="card mt"><h3 class="card-title">US viewers, millions</h3><p class="card-sub">${ttl(sb)} (${fmt.m(sb.v)}, after the Super Bowl) runs off the top.</p><div id="f-m2"></div></div>
        <div class="card mt"><h3 class="card-title">But more Michael doesn’t mean a better episode</h3><p class="card-sub">Episodes through ${ttl(bye)}. ${R}${fmt.num(F.michaelShareCorr.r)}, basically flat. He mattered to the show, not to every scene.</p><div id="f-m3"></div></div>
      </div>
    </section>

    <section class="finding" id="twss" data-sec="That’s what she said">
      <div class="sticky-col">
        <p class="fnum">Two</p>
        <h2>Do “that’s what she said” episodes rate higher?</h2>
        <span class="verdict">Sort of, then not really</span>
        <div class="prose mt">
          <p>The line shows up ${fmt.int(F.twssCount)} times in <a href="${here('twss-list')}">${fmt.int(F.twssLines)} lines of the transcript</a>.${multiLine} ${c2('Michael')} says ${twMichael ? fmt.int(twMichael.n) : 0} of them.</p>
          <p>${cap(nw(F.twssEpisodes))} episodes have it in the transcript. The fan wiki’s list adds ${nw(F.twssWikiOnly)} more that the transcript doesn’t have, so ${F.twssAll.nA} episodes in all.</p>
          <p>Across the whole show those episodes average <strong>${F.twssAll.meanA.toFixed(2)}</strong> against <strong>${F.twssAll.meanB.toFixed(2)}</strong>, and that gap passes the usual test (${pEq(F.twssAll.p)}).</p>
          <p>But the joke lives in the Michael years, and the Michael years rated higher anyway. Compare only episodes through ${ttl(bye)} and the gap shrinks to <strong>${(F.twssMichael.meanA - F.twssMichael.meanB).toFixed(2)}</strong>, with ${pEq(F.twssMichael.p)}. That’s the kind of gap random noise makes all the time.</p>
          <p><a class="link-arrow" href="${searchHref('that’s what she said')}">Search the script for it</a></p>
        </div>
        <div class="explain"><b>What a p-value means here.</b> It’s the chance of seeing a gap at least this big if the joke made no difference. Under 0.05 is the usual bar for “probably real”, and ${fmt.p(F.twssMichael.p)} is well over it.<br><br><b>A correction.</b> My <a href="${OLD.h}">2023 version</a> of this test counted every hour-long episode twice.</div>
      </div>
      <div>
        <div class="card"><div class="card-head"><div><h3 class="card-title">Ratings, with and without the joke</h3></div>
          <div class="toggle" id="tw-t" role="group" aria-label="Which episodes"><button type="button" class="on" aria-pressed="true" data-v="all">All episodes</button><button type="button" aria-pressed="false" data-v="m">Michael era only</button></div></div>
          <div id="f-t1"></div><p class="small muted" id="tw-note"></p></div>
        <div class="card mt" id="twss-list" data-sec="The full list">
          <h3 class="card-title">That’s what she said: all of them, with the setups</h3>
          <p class="card-sub">In air order.</p>
          <div class="tk-chips">
            <span class="chip"><b>${fmt.int(F.twssCount)}</b> times</span>
            <span class="chip"><b>${fmt.int(F.twssLines)}</b> lines</span>
            <span class="chip"><b>${fmt.int(F.twssEpisodes)}</b> episodes in the transcript</span>
            <span class="chip"><b>+${fmt.int(F.twssWikiOnly)}</b> from the fan wiki</span>
          </div>
          <div class="tk-chips tk-who-chips">${F.twssBy.map((t) => { const h = charHref(D, t.k); return `<${h ? `a href="${h}"` : 'span'} class="chip">${dot(t.k)}${esc(t.k)} <b>${t.n}</b></${h ? 'a' : 'span'}>`; }).join('')}</div>
          <ul class="tk-callouts">${twssCallouts(D, list).map((c) => `<li>${c}</li>`).join('')}</ul>
          <ol class="tk-twss" id="twss-items">${twssItems(D, list)}</ol>
          ${list.length > 8 ? `<button type="button" class="btn ghost mt" id="twss-more">Show all ${fmt.int(list.length)}</button>` : ''}
        </div>
      </div>
    </section>

    <section class="finding" id="hour" data-sec="Hour-longs">
      <div class="sticky-col">
        <p class="fnum">Three</p>
        <h2>Are the hour-long episodes better?</h2>
        <span class="verdict yes">Yes, by a lot</span>
        <div class="prose mt">
          <p><a href="${ranked('hour=1')}">${F.hour.nA} hour-long episodes</a> have one IMDb score each. They average <strong>${F.hour.meanA.toFixed(2)}</strong> against <strong>${F.hour.meanB.toFixed(2)}</strong> for everything else, a gap of ${(F.hour.meanA - F.hour.meanB).toFixed(2)}. On ratings, that’s a bigger gap than <a href="${here('michael')}">Michael leaving</a> (${(M.meanA - M.meanB).toFixed(2)}).</p>
          <p>Part of it is timing: ${F.hourMichael.nA} of the ${F.hour.nA} aired before ${charA(D, 'Michael')} left, when everything rated higher. Compare only episodes up to ${ttl(bye)} and the hour-longs still come out ${(F.hourMichael.meanA - F.hourMichael.meanB).toFixed(2)} ahead (${pEq(F.hourMichael.p)}).</p>
          <p>This data can’t tell the extra time apart from the occasion. ${cap(nw(used.size))} of the ${nw(hours.length)} were occasions: ${and(occasions)}.${otherHours.length ? ` The other ${otherHours.length === 1 ? 'one is' : `${nw(otherHours.length)} are`} ${and(otherHours.map(ttl))}${/\.$/.test(otherHours[otherHours.length - 1].t) ? '' : '.'}` : ''}</p>
          <div class="tk-chips tk-ep-chips">${hours.map((e) => `<a class="chip" href="#/episode/${e.id}">${esc(e.t)} <b>${e.r.toFixed(1)}</b></a>`).join('')}</div>
        </div>
        <div class="explain"><b>The check.</b> ${pEq(F.hour.p)}. ${F.hour.nA} episodes is a small group, but the gap is big enough to survive it.</div>
      </div>
      <div><div class="card"><h3 class="card-title">Hour-long episodes against the rest</h3><p class="card-sub">${part1('Niagara')} and ${part1('The Delivery')} aired as one hour each but are rated as two halves, so they count as half-hours here.</p><div id="f-h1"></div></div></div>
    </section>

    <section class="finding" id="andy" data-sec="Andy">
      <div class="sticky-col">
        <p class="fnum">Four</p>
        <h2>Is Andy why the later seasons rated lower?</h2>
        <span class="verdict no">Mostly no</span>
        <div class="prose mt">
          <p>Across every episode ${charA(D, 'Andy')} is in, the more of the episode he talks, the lower it rated. The correlation is ${R}<strong>${fmt.num(andy.all.r)}</strong>, which is a lot for TV data.</p>
          <p>But his big episodes are in seasons <a class="tk-n" href="#/season/8">8</a> and <a class="tk-n" href="#/season/9">9</a>, when everything rated lower. Look inside each era separately and it mostly disappears: ${R}${fmt.num(andy.early.r)} in <a href="${ranked('s=1,2,3,4,5,6,7')}">seasons 1 to 7</a>, ${R}${fmt.num(andy.late.r)} in <a href="${ranked('s=8,9')}">8 and 9</a>, and ${andy.early.p >= 0.05 && andy.late.p >= 0.05 ? 'neither passes the test' : 'only one passes the test'}.</p>
          <p>So Andy talks a lot in a period that rated badly. That’s not the same as Andy making it rate badly.</p>
        </div>
        <div class="explain"><b>Why this matters.</b> It’s the “that’s what she said” trap the other way round: when two things both depend on the era, they look related even when they aren’t.</div>
      </div>
      <div><div class="card"><h3 class="card-title">Andy’s share of the lines against the rating</h3><p class="card-sub">The line fits all of them together.</p>
        <div class="legend"><span><i class="ring" style="background:var(--accent)"></i>Seasons 1 to 7</span><span><i class="ring" style="background:var(--ink-3)"></i>Seasons 8 and 9</span></div><div id="f-a1"></div></div></div>
    </section>

    <section class="finding" id="more" data-sec="What doesn’t matter">
      <div class="sticky-col">
        <p class="fnum">Five</p>
        <h2>Things that don’t matter.</h2>
        <span class="verdict">No effect</span>
        <div class="prose mt"><p>${fiveLine}</p></div>
      </div>
      <div class="grid g2">
        <div class="card"><h3 class="card-title">Holiday episodes</h3><p class="card-sub">Christmas, Halloween, Valentine’s, Diwali, St. Patrick’s.</p><div class="stat-value">${fmt.signed(F.holiday.meanA - F.holiday.meanB)}</div>
          <p class="small muted">${F.holiday.nA} episodes, ${pEq(F.holiday.p)}. If anything a shade lower, and well inside the noise.</p>
          <details class="tk-more"><summary>Which ${F.holiday.nA}</summary><p class="small">${holidays.map((e) => `<a href="#/episode/${e.id}">${esc(e.t)}</a>`).join(' · ')}</p></details></div>
        <div class="card"><h3 class="card-title">Longer scripts</h3><p class="card-sub">Lines per episode against rating, half-hours only.</p><div class="stat-value">${R}${fmt.num(F.linesCorr.r)}</div><p class="small muted">${pEq(F.linesCorr.p)}. A busier script isn’t a better one.</p></div>
        <div class="card"><h3 class="card-title">Bigger casts</h3><p class="card-sub">Different speakers per half-hour against rating.</p><div class="stat-value">${R}${fmt.num(F.speakersCorr.r)}</div><p class="small muted">${pEq(F.speakersCorr.p)}, and that’s the era. Half-hours through ${ttl(bye)} have ${fmt.dec(mean(castA, (e) => e.speakers))} speakers on average and rate ${mean(castA, (e) => e.r).toFixed(2)}. After it, ${fmt.dec(mean(castB, (e) => e.speakers))} speakers and ${mean(castB, (e) => e.r).toFixed(2)}. Inside each season it’s ${R}${fmt.num(F.speakersWithin.r)} (${pEq(F.speakersWithin.p)}), which is nothing.</p></div>
        <div class="card"><h3 class="card-title">Michael’s share of lines</h3><p class="card-sub">Through ${ttl(bye)}.</p><div class="stat-value">${R}${fmt.num(F.michaelShareCorr.r)}</div><p class="small muted">${pEq(F.michaelShareCorr.p)}. <a href="${here('michael')}">See finding one</a>.</p></div>
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
      // #/findings@twss-list means the whole list. Arriving by that address opens it in full, and so does any link to
      // it followed from this page (the jump bar, the "32 lines" link, search), which only scrolls and never redraws.
      const twCard = $('#twss-list');
      const twAll = (focus) => {
        const ol = $('#twss-items');
        if (!ol || ol.classList.contains('all')) return;
        ol.classList.add('all');
        $('#twss-more')?.remove();
        // The button is gone, so focus goes to the first joke it revealed.
        const first = focus ? $('.tk-extra', ol) : null;
        if (first) { first.tabIndex = -1; first.focus({ preventScroll: true }); }
      };
      const wantsList = () => /@twss-list$/.test(location.hash);
      // Opened by hand, it's noted on this history entry, so Back from one of its episodes finds it still open.
      $('#twss-more')?.addEventListener('click', () => {
        twAll(true);
        try { history.replaceState({ ...(history.state || {}), twAll: true }, ''); } catch (err) { /* Safari rations replaceState */ }
      });
      if (wantsList() || history.state?.twAll) twAll();
      const onClick = (ev) => {
        if (!twCard.isConnected) { document.removeEventListener('click', onClick, true); return; }
        if (ev.target.closest?.('a[href$="@twss-list"]')) twAll();
      };
      const onHash = () => {
        if (!twCard.isConnected) { removeEventListener('hashchange', onHash); return; }
        if (wantsList()) twAll();
      };
      document.addEventListener('click', onClick, true);
      addEventListener('hashchange', onHash);

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
