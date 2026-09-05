export const FORTUNES = [
  'Hello World is the first step.',
  'There is no place like ~',
  'It works on my machine.',
  'Real programmers count from 0.',
  'rm -rf / is not a productivity hack.',
  "I'm Captain Basch fon Ronsenburg of Dalmasca!",
  "Don't listen to Ondore's lies.",
  'Anyone can be a sky pirate. Few can git gud.',
  'Any sufficiently advanced tmux config is indistinguishable from an IDE.',
  'There are two hard problems in CS: cache invalidation, naming things, and off-by-one errors.',
  'The best time to write a test was yesterday. The second best is in CI, at 3am.',
  'A Mist Quickening is just a chained Makefile target with better particle effects.',
  ':wq',
];
export const pick = () => FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
