// Party status card. One level per year since epoch, EXP in days, LP in merged pull requests.
import { $, site } from './data.js';
import { registerCloser, closeAll } from './ui.js';

const DAY = 86400000;

function digits(el, n, width) {
  const s = String(Math.max(0, Math.floor(n))).padStart(width, '0');
  const sig = s.replace(/^0+(?=\d)/, '');
  const z = document.createElement('span');
  z.className = 'z';
  z.textContent = s.slice(0, s.length - sig.length);
  el.replaceChildren(z, sig);
}

export function stats() {
  const epoch = new Date(`${site.epoch || '2017-01-21'}T00:00:00Z`);
  const now = new Date();
  const exp = Math.max(0, Math.floor((now - epoch) / DAY));
  let level = 1;
  let next = new Date(epoch);
  for (;;) {
    const n = new Date(next);
    n.setUTCFullYear(n.getUTCFullYear() + 1);
    next = n;
    if (n > now) break;
    level++;
  }
  return { level, exp, next: Math.max(0, Math.ceil((next - now) / DAY)), lp: site.contrib?.total || site.posts.length };
}

export function openParty() {
  closeAll();
  const p = $('#party');
  if (!p) return;
  const s = stats();
  $('#ff-level').textContent = String(s.level);
  digits($('#ff-lp'), s.lp, 5);
  digits($('#ff-exp'), s.exp, 8);
  digits($('#ff-next'), s.next, 8);
  p.hidden = false;
}
export function closeParty() {
  const p = $('#party');
  if (!p || p.hidden) return false;
  p.hidden = true;
  return true;
}
export const toggleParty = () => ($('#party')?.hidden ? openParty() : closeParty());

export function initParty() {
  registerCloser(closeParty);
  $('#avatar')?.addEventListener('click', toggleParty);
}
