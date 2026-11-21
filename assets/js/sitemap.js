// Every top-level page, in one order, with one name each. The top nav, the phone menu, the "next page" links at
// the foot of each page and the jump-to search all read this list, so a page is called the same thing and sits in
// the same place wherever it shows up.
//
// key:  what the router calls the section (app.js routes), used for the current-page highlight
// nav:  the short label in the top nav; a page without one is left out of it
// name: the full name, used everywhere else
// menu: a shorter name for the phone menu, where two links share a row
// sub:  one line on what's there, for the home page directory
// k:    other words someone might type into search to find it
export const GROUPS = [
  {
    name: 'The show',
    pages: [
      { key: 'seasons', k: 'season', h: '#/seasons', nav: 'Seasons', name: 'Seasons', sub: 'Nine of them, side by side.' },
      { key: 'episodes', k: 'episodes ranked best worst lowest highest rating ratings list', h: '#/episodes', nav: 'Episodes', name: 'Every episode, ranked', menu: 'Every episode', sub: 'Best to worst, or sorted your way.' },
      { key: 'characters', k: 'cast people character', h: '#/characters', nav: 'Characters', name: 'Characters', sub: 'Everyone with a desk.' },
      { key: 'crew', k: 'crew directors writers director writer directed wrote', h: '#/crew', nav: 'Crew', name: 'Directors & writers', menu: 'Crew', sub: 'Who wrote and directed what.' },
    ],
  },
  {
    name: 'The numbers',
    pages: [
      { key: 'findings', k: 'analysis stats results', h: '#/findings', nav: 'Findings', name: 'Findings', sub: 'What the ratings say.' },
      { key: 'dialogue', k: 'script search quotes lines transcript words', h: '#/dialogue', nav: 'Dialogue', name: 'Dialogue', sub: 'Search every line of the script.' },
      { key: 'couples', k: 'couples relationships romance pairs', h: '#/couples', nav: 'Couples', name: 'Couples Discount', sub: 'Who says whose name.' },
      { key: 'dundies', k: 'awards dundie', h: '#/dundies', nav: 'Dundies', name: 'The Dundies', sub: 'Awards, handed out by the transcript.' },
    ],
  },
  {
    name: 'Play',
    pages: [
      { key: 'quiz', k: 'play game games trivia quizzes', h: '#/quiz', nav: 'Play', name: 'Quiz', sub: 'Endless games, three difficulties.' },
      { key: 'daily', k: 'daily today who said it', h: '#/quiz/daily', name: 'Today’s five', sub: 'Who Said It?, five lines a day.' },
    ],
  },
];

export const PAGES = GROUPS.flatMap((g) => g.pages);
// original/index.html frames the untouched 2023 report under a bar with a link back here.
export const OLD = { h: 'original/index.html', name: 'The 2023 R version' };

// Places inside pages that people look for by name. Search lists them next to the pages. Each h is a section
// the page marks with that id; the titles are the sections' own headings.
export const SPOTS = [
  { t: 'Did the show get worse after Michael left?', s: 'Finding', h: '#/findings@michael', k: 'michael left leaves leaving after michael' },
  { t: 'Do “that’s what she said” episodes rate higher?', s: 'Finding', h: '#/findings@twss', k: 'twss' },
  { t: 'Every “that’s what she said”', s: 'Finding', h: '#/findings@twss-list', k: 'twss|she said|thats what she said list|all of them' },
  { t: 'Are the hour-long episodes better?', s: 'Finding', h: '#/findings@hour', k: 'hour long|hourlong|two part|two parter' },
  { t: 'Is Andy why the later seasons rated lower?', s: 'Finding', h: '#/findings@andy', k: 'andy later seasons' },
  { t: 'Things that don’t matter', s: 'Finding', h: '#/findings@more', k: 'holiday christmas halloween cast size' },
  { t: 'Quotables', s: 'Dialogue', h: '#/dialogue@quotables', k: 'quotes famous lines quote' },
  { t: 'Running jokes', s: 'Dialogue', h: '#/dialogue@jokes', k: 'jokes catchphrases phrases' },
  { t: 'Nicknames', s: 'Dialogue', h: '#/dialogue@nicknames', k: 'nickname tuna big tuna who calls whom' },
  { t: 'Who answers whom', s: 'Dialogue', h: '#/dialogue@answers', k: 'conversation replies answers talks to' },
];
