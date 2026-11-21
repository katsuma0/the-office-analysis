// Every top-level page, in one order, with one name each. The top nav, the phone menu, the "next page" links at
// the foot of each page and the jump-to search all read this list, so a page is called the same thing and sits in
// the same place wherever it shows up.
//
// key:  what the router calls the section (app.js routes), used for the current-page highlight
// nav:  the short label in the top nav; a page without one is left out of it
// name: the full name, used everywhere else
// menu: a shorter name for the phone menu, where two links share a row
// sub:  one line on what's there, for the home page directory
export const GROUPS = [
  {
    name: 'The show',
    pages: [
      { key: 'seasons', h: '#/seasons', nav: 'Seasons', name: 'Seasons', sub: 'Nine of them, side by side.' },
      { key: 'episodes', h: '#/episodes', nav: 'Episodes', name: 'Every episode, ranked', menu: 'Every episode', sub: 'Best to worst, or sorted your way.' },
      { key: 'characters', h: '#/characters', nav: 'Characters', name: 'Characters', sub: 'Everyone with a desk.' },
      { key: 'crew', h: '#/crew', nav: 'Crew', name: 'Directors & writers', menu: 'Crew', sub: 'Who wrote and directed what.' },
    ],
  },
  {
    name: 'The numbers',
    pages: [
      { key: 'findings', h: '#/findings', nav: 'Findings', name: 'Findings', sub: 'What the ratings say.' },
      { key: 'dialogue', h: '#/dialogue', nav: 'Dialogue', name: 'Dialogue', sub: 'Search every line of the script.' },
      { key: 'couples', h: '#/couples', nav: 'Couples', name: 'Couples Discount', sub: 'Who says whose name.' },
      { key: 'dundies', h: '#/dundies', nav: 'Dundies', name: 'The Dundies', sub: 'Awards, handed out by the transcript.' },
    ],
  },
  {
    name: 'Play',
    pages: [
      { key: 'quiz', h: '#/quiz', nav: 'Play', name: 'Quiz', sub: 'Endless games, three difficulties.' },
      { key: 'daily', h: '#/quiz/daily', name: 'Today’s five', sub: 'Who Said It?, five lines a day.' },
    ],
  },
];

export const PAGES = GROUPS.flatMap((g) => g.pages);
export const OLD = { h: 'original/2023-report.html', name: 'The 2023 R version' };
