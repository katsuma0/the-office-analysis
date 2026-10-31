// Plays the endless quiz a few thousand times without a browser and checks every question against the data.
//   node scripts/check_quiz.mjs [rounds per type and level, default 400]
import { readFileSync } from 'node:fs';
import { make, TYPES, LEVELS } from '../assets/js/qgen.js';

const root = new URL('..', import.meta.url);
const D = JSON.parse(readFileSync(new URL('data/office.json', root)));
const bank = JSON.parse(readFileSync(new URL('data/quizbank.json', root)));
D.char = Object.fromEntries(D.characters.map((c) => [c.key, c]));
const E = D.episodes;
const N = +(process.argv[2] || 400);

// Seeded, so a failure can be replayed.
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const lines = (k, e) => e.c[D.codes[k]] || 0;
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const problems = [];
const bad = (q, why) => problems.push(`${q.type}/${q.level} ${q.id}: ${why}`);

function check(q) {
  const ch = q.choices;
  if (ch.length !== 4) bad(q, `${ch.length} choices`);
  if (new Set(ch.map((c) => norm(c.t))).size !== ch.length) bad(q, `duplicate choices ${ch.map((c) => c.t).join(' | ')}`);
  if (!(q.answer >= 0 && q.answer < ch.length)) return bad(q, 'answer out of range');
  const a = ch[q.answer];
  const wrong = ch.filter((_, i) => i !== q.answer);
  const text = JSON.stringify(q);
  if (text.includes('\u2014')) bad(q, 'em dash');
  if (/undefined|NaN/.test(ch.map((c) => c.t).join(' '))) bad(q, 'undefined in a choice');
  const e = E[q.ep];
  switch (q.type) {
    case 'who':
      if (a.k !== q.line.k) bad(q, 'answer is not the speaker');
      if (wrong.some((c) => !D.char[c.k])) bad(q, 'distractor not in the cast');
      break;
    case 'episode': case 'opening': case 'words':
      if (a.ep !== q.ep) bad(q, 'answer is not the episode');
      if (wrong.some((c) => c.ep === q.ep || E[c.ep].date === e.date)) bad(q, 'distractor is the episode or its other half');
      if (q.type === 'opening') {
        const first = bank.open.find(([id]) => id === q.ep)[1];
        if (q.rows.some((r, i) => r[1] !== first[i][1])) bad(q, 'opening rows are not the first rows');
      }
      if (q.type === 'words' && q.words.some((w, i) => w.w !== e.kw[i].w)) bad(q, 'words are not the episode keywords');
      break;
    case 'finish':
      if (`${q.start} ${a.t}` !== q.line.t) bad(q, 'start + answer is not the line');
      if (wrong.some((c) => q.line.t.endsWith(c.t))) bad(q, 'a wrong ending is also the real ending');
      break;
    case 'name': {
      if (a.k !== q.who) bad(q, 'answer is not the person named');
      if (q.blanked.includes(q.who.split(' ')[0])) bad(q, 'the name is still in the line');
      if (wrong.some((c) => c.k === q.k)) bad(q, 'the speaker is offered as a choice');
      break;
    }
    case 'firsts': {
      const c = D.char[q.k];
      if (a.ep !== (q.last ? c.last : c.first)) bad(q, 'answer is not the first/last episode');
      if (wrong.some((x) => x.ep === c.first || x.ep === c.last)) bad(q, 'a wrong choice is the other end');
      if (q.last ? lines(q.k, e) === 0 : lines(q.k, e) === 0) bad(q, 'no lines in the answer episode');
      break;
    }
    case 'plot':
      if (a.t !== q.q.a) bad(q, 'answer is not the bank answer');
      break;
    case 'missing':
      if (lines(a.k, e) !== 0) bad(q, `${a.k} does talk in ${e.t}`);
      if (wrong.some((c) => lines(c.k, e) === 0)) bad(q, 'a wrong choice is also silent');
      break;
    case 'talk':
      if (wrong.some((c) => lines(c.k, e) >= lines(a.k, e))) bad(q, 'answer does not have the most lines');
      break;
    case 'order':
      if (wrong.some((c) => c.ep <= a.ep)) bad(q, 'answer did not air first');
      if (wrong.some((c) => E[c.ep].date === E[a.ep].date)) bad(q, 'two choices aired the same night');
      break;
    case 'rating':
      if (wrong.some((c) => E[c.ep].r >= E[a.ep].r)) bad(q, 'answer is not the highest rated');
      break;
    case 'crew': {
      const list = q.job === 'wrote' ? e.wri : e.dir;
      if (!list.includes(a.t)) bad(q, `${a.t} did not ${q.job === 'wrote' ? 'write' : 'direct'} ${e.t}`);
      if (wrong.some((c) => list.includes(c.t))) bad(q, 'a wrong choice also did the job');
      break;
    }
    default: bad(q, 'unknown type');
  }
}

const table = [];
for (const t of TYPES) {
  if (t.id === 'plot' && !bank.trivia.length) continue;
  for (const level of LEVELS) {
    const seen = new Set();
    let made = 0, nulls = 0, repeats = 0;
    for (let i = 0; i < N; i++) {
      const q = make(t.id, level, { D, bank, rnd, seen });
      if (!q) { nulls++; continue; }
      made++;
      if (q.repeat) repeats++;
      seen.add(q.id);
      check(q);
    }
    table.push({ type: t.id, level, made, nulls, repeats, distinct: seen.size });
  }
}
console.table(table);
console.log(problems.length ? `${problems.length} problems:\n${[...new Set(problems)].slice(0, 40).join('\n')}` : 'No problems.');
process.exitCode = problems.length ? 1 : 0;
