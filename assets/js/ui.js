import { $, $$ } from './data.js';

const closers = [];
export const registerCloser = (fn) => closers.push(fn);

export function closeAll() {
  let any = false;
  for (const fn of closers) any = !!fn() || any;
  return any;
}

export const isOverlayOpen = () => $$('.overlay').some((o) => !o.hidden);

export function openHelp() {
  closeAll();
  const h = $('#help');
  if (h) h.hidden = false;
}
export function closeHelp() {
  const h = $('#help');
  if (!h || h.hidden) return false;
  h.hidden = true;
  return true;
}
export function toggleHelp() {
  const h = $('#help');
  if (h) h.hidden ? openHelp() : closeHelp();
}

export function initUI() {
  registerCloser(closeHelp);
  document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.matches('[data-close]')) closeAll();
  });
}
