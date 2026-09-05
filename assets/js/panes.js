// tmux panes. C-b is the prefix. Splits open the shell inside a pane.
import { $, $$, site, go } from './data.js';
import { vimMsg, onSplit, onQuit, openCmdline } from './vim.js';
import { mountTermInPane, unmountTerm, onTmux, onExit } from './term.js';
import { openHelp, closeAll } from './ui.js';
import { initCopy } from './misc.js';
import { normalize, stat } from './vfs.js';

const PREFIX_MS = 2500;
let container = $('#panes');
let armed = false;
let armTimer = 0;
let mode = null;

const panes = () => (container ? $$('.pane', container) : []);
const active = () => container?.querySelector('.pane.is-active') || panes()[0] || null;
const consume = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };

function makePane(title) {
  const p = document.createElement('section');
  p.className = 'pane';
  p.dataset.title = title;
  const t = document.createElement('span');
  t.className = 'pane-title';
  const b = document.createElement('div');
  b.className = 'pane-body';
  p.append(t, b);
  return p;
}

function ensurePanes() {
  if (container) return container;
  const main = $('#main');
  container = document.createElement('div');
  container.className = 'panes';
  container.id = 'panes';
  const col = document.createElement('div');
  col.className = 'col';
  const pane = makePane(main.dataset.title || 'window');
  const body = pane.querySelector('.pane-body');
  while (main.firstChild) body.append(main.firstChild);
  pane.classList.add('is-active');
  col.append(pane);
  container.append(col);
  main.append(container);
  return container;
}

function updateStatus() {
  const win = $('.tmux-win.is-active');
  if (!win) return;
  win.textContent = win.textContent.replace(/Z$/, '') + (container?.classList.contains('is-zoomed') ? 'Z' : '');
}

function renumber() {
  if (!container) return;
  $$('.col, .row', container).forEach((c) => { if (!c.querySelector('.pane')) c.remove(); });
  const all = panes();
  all.forEach((p, i) => {
    p.dataset.index = i;
    p.querySelector('.pane-title').textContent = `${i}: ${p.dataset.title}`;
  });
  container.classList.toggle('is-multi', all.length > 1);
  if (all.length < 2) container.classList.remove('is-zoomed');
  if (!container.querySelector('.pane.is-active') && all[0]) all[0].classList.add('is-active');
  updateStatus();
}

function setActive(p) {
  if (!p) return;
  panes().forEach((x) => x.classList.toggle('is-active', x === p));
}

function cycle(dir) {
  const all = panes();
  if (all.length < 2) return;
  const i = all.indexOf(active());
  const next = all[(i + dir + all.length) % all.length];
  setActive(next);
  if (container.classList.contains('is-zoomed')) return;
  next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function zoom(force) {
  if (!container || panes().length < 2) { vimMsg('only one pane, nothing to zoom'); return; }
  container.classList.toggle('is-zoomed', force ?? !container.classList.contains('is-zoomed'));
  updateStatus();
}

function split(dir, fill) {
  ensurePanes();
  const cur = active();
  const col = cur.closest('.col');
  const pane = makePane('zsh');
  const siblings = col.parentElement.querySelectorAll(':scope > .col').length;
  if (dir === 'h' && siblings < 3 && window.innerWidth >= 900) {
    const ncol = document.createElement('div');
    ncol.className = 'col';
    const grow = parseFloat(getComputedStyle(col).flexGrow) || 1;
    col.style.flexGrow = String(grow / 2);
    ncol.style.flexGrow = String(grow / 2);
    ncol.append(pane);
    col.after(ncol);
  } else {
    cur.after(pane);
  }
  fill(pane);
  container.classList.remove('is-zoomed');
  setActive(pane);
  renumber();
  pane.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return pane;
}

function splitShell(dir) {
  if ($('.pane-term')) { setActive($('.pane-term')); $('#term-in')?.focus(); vimMsg('the shell already has a pane'); return; }
  split(dir, (p) => {
    p.classList.add('pane-term');
    mountTermInPane(p.querySelector('.pane-body'));
  });
}

async function splitPath(dir, arg) {
  const s = stat(normalize('~', arg));
  const url = s?.url;
  if (!url) { vimMsg(`E484: Can't open file ${arg}`, true); return; }
  let doc;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  } catch { vimMsg(`E484: Can't open file ${arg}`, true); return; }
  const main = doc.querySelector('#main');
  if (!main) { vimMsg(`E484: Can't open file ${arg}`, true); return; }
  main.querySelectorAll('.prompt-idle').forEach((el) => el.remove());
  main.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  const bodies = main.querySelectorAll('.pane-body');
  const nodes = bodies.length ? Array.from(bodies).flatMap((b) => Array.from(b.childNodes)) : Array.from(main.childNodes);
  split(dir, (p) => {
    p.dataset.title = main.dataset.title || arg;
    const b = p.querySelector('.pane-body');
    b.append(...nodes);
    initCopy(b);
  });
}

function exitSession() {
  vimMsg('[exited]', false, 0);
  closeAll();
  setTimeout(() => go('about:blank'), 700);
}

function killPane(p = active()) {
  if (!p) return;
  const all = panes();
  if (all.length <= 1) { exitSession(); return; }
  if (p.classList.contains('pane-term')) unmountTerm();
  const i = all.indexOf(p);
  p.remove();
  const rest = panes();
  setActive(rest[Math.min(i, rest.length - 1)]);
  container.classList.remove('is-zoomed');
  renumber();
}

function only() {
  const keep = active();
  panes().forEach((p) => { if (p !== keep) { if (p.classList.contains('pane-term')) unmountTerm(); p.remove(); } });
  renumber();
}

function confirmKill() {
  const p = active();
  if (!p) return;
  const last = panes().length <= 1;
  mode = { type: 'confirm', fn: () => killPane(p) };
  vimMsg(last ? 'kill-pane 0? this is the last one, tmux would exit. (y/n)' : `kill-pane ${p.dataset.index}? (y/n)`, false, 0);
}

function displayPanes() {
  if (!container) { vimMsg('0: this whole window is one pane'); return; }
  container.classList.add('show-numbers');
  setTimeout(() => container.classList.remove('show-numbers'), 1300);
}

const DIGITS = {
  0: ['###', '# #', '# #', '# #', '###'], 1: ['  #', '  #', '  #', '  #', '  #'], 2: ['###', '  #', '###', '#  ', '###'],
  3: ['###', '  #', '###', '  #', '###'], 4: ['# #', '# #', '###', '  #', '  #'], 5: ['###', '#  ', '###', '  #', '###'],
  6: ['###', '#  ', '###', '# #', '###'], 7: ['###', '  #', '  #', '  #', '  #'], 8: ['###', '# #', '###', '# #', '###'],
  9: ['###', '# #', '###', '  #', '###'], ':': ['   ', ' # ', '   ', ' # ', '   '],
};
function bigClock(d) {
  const t = d.toTimeString().slice(0, 8);
  const rows = ['', '', '', '', ''];
  for (const ch of t) for (let r = 0; r < 5; r++) rows[r] += `${DIGITS[ch][r]} `;
  return rows.map((r) => r.replace(/#/g, '█').trimEnd()).join('\n');
}

function clockMode() {
  ensurePanes();
  const body = active().querySelector('.pane-body');
  const pre = document.createElement('pre');
  pre.className = 'pane-clock';
  const face = document.createElement('span');
  const date = document.createElement('small');
  pre.append(face, date);
  body.append(pre);
  body.classList.add('is-clock');
  const tick = () => { const d = new Date(); face.textContent = bigClock(d); date.textContent = d.toDateString(); };
  tick();
  const timer = setInterval(tick, 1000);
  mode = { type: 'clock', exit: () => { clearInterval(timer); pre.remove(); body.classList.remove('is-clock'); mode = null; } };
}

function windowIndex() {
  const path = location.pathname;
  return site.menu.findIndex((m) => m.url === path || (m.url !== '/' && path.startsWith(m.url)));
}
function selectWindow(i) {
  const m = site.menu[i];
  if (m) go(m.url); else vimMsg(`window not found: ${i}`, true);
}
const nextWindow = (dir) => selectWindow((windowIndex() + dir + site.menu.length) % site.menu.length);

function arm() {
  armed = true;
  $('#tmux-session')?.classList.add('is-prefix');
  clearTimeout(armTimer);
  armTimer = setTimeout(disarm, PREFIX_MS);
}
function disarm() {
  armed = false;
  clearTimeout(armTimer);
  $('#tmux-session')?.classList.remove('is-prefix');
}

function onPrefixed(e) {
  const k = e.key;
  switch (k) {
    case 'o': case 'ArrowRight': case 'ArrowDown': cycle(1); break;
    case ';': case 'ArrowLeft': case 'ArrowUp': cycle(-1); break;
    case 'z': zoom(); break;
    case 'x': confirmKill(); break;
    case 'q': displayPanes(); break;
    case 't': clockMode(); break;
    case '%': splitShell('h'); break;
    case '"': splitShell('v'); break;
    case 'n': case 'c': nextWindow(1); break;
    case 'p': nextWindow(-1); break;
    case 'l': selectWindow(0); break;
    case 'w': case 's': vimMsg(site.menu.map((m, i) => `${i}:${m.name}`).join('  ')); break;
    case 'd': closeAll(); vimMsg('[detached (from session frai)]'); break;
    case '[': vimMsg('-- COPY MODE -- this is a website. drag to select, like an animal.'); break;
    case ':': openCmdline(':'); break;
    case '?': openHelp(); break;
    case 'b': vimMsg('C-b C-b: sends a literal prefix. to whom?'); break;
    default:
      if (/^[0-9]$/.test(k)) selectWindow(+k);
      else if (k.length === 1 || k.startsWith('F')) vimMsg(`unknown key: C-b ${k}`, true);
  }
}

export function initPanes() {
  if (container) renumber();
  document.addEventListener('keydown', (e) => {
    if (mode?.type === 'clock') {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      mode.exit();
      consume(e);
      return;
    }
    if (mode?.type === 'confirm') {
      const fn = mode.fn;
      mode = null;
      vimMsg('');
      if (e.key === 'y' || e.key === 'Y') fn();
      consume(e);
      return;
    }
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'b') { armed ? disarm() : arm(); consume(e); return; }
    if (!armed) return;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    disarm();
    consume(e);
    onPrefixed(e);
  }, { capture: true });

  document.addEventListener('click', (e) => {
    if (mode?.type === 'clock') { mode.exit(); return; }
    const p = e.target instanceof Element && e.target.closest('.pane');
    if (p) setActive(p);
  });
  document.addEventListener('focusin', (e) => {
    const p = e.target instanceof Element && e.target.closest('.pane');
    if (p) setActive(p);
  });

  onExit(() => { const p = $('.pane-term'); if (p) killPane(p); });
  onSplit((dir, arg) => {
    if (dir === 'only') { only(); return; }
    if (arg) splitPath(dir, arg); else splitShell(dir);
  });
  onQuit(() => { if (panes().length > 1) { killPane(); return true; } return false; });
  onTmux((args, out) => {
    const [cmd, ...rest] = args;
    const flag = (f) => rest.includes(f);
    const target = () => rest[rest.indexOf('-t') + 1];
    switch (cmd) {
      case undefined: case 'attach': case 'a': out.line('sessions should be nested with care, unset $TMUX to force', 'err'); return false;
      case 'split-window': case 'splitw': splitShell(flag('-h') ? 'h' : 'v'); return true;
      case 'kill-pane': case 'killp': { const p = flag('-t') ? panes()[+target()] : $('.pane-term') || active(); if (!p) { out.line("can't find pane", 'err'); return false; } killPane(p); return true; }
      case 'select-pane': case 'selectp': { const p = panes()[+target()]; if (!p) { out.line(`can't find pane: ${target()}`, 'err'); return false; } setActive(p); return true; }
      case 'resize-pane': case 'resizep': if (flag('-Z')) { zoom(); return true; } out.line('resize-pane: only -Z is supported in this economy', 'err'); return false;
      case 'display-panes': case 'displayp': displayPanes(); return true;
      case 'clock-mode': clockMode(); return true;
      case 'list-panes': case 'lsp': (panes().length ? panes() : [$('#main')]).forEach((p, i) => out.line(`${i}: [${p.offsetWidth}x${p.offsetHeight}] ${p.dataset.title || 'window'}${p.classList.contains('is-active') ? ' (active)' : ''}`)); return true;
      case 'list-windows': case 'lsw': site.menu.forEach((m, i) => out.line(`${i}: ${m.name}${i === windowIndex() ? '* (active)' : ''}`)); return true;
      case 'select-window': case 'selectw': selectWindow(+target()); return true;
      case 'next-window': case 'next': nextWindow(1); return true;
      case 'previous-window': case 'prev': nextWindow(-1); return true;
      case 'detach': case 'detach-client': out.line('[detached (from session frai)]'); return true;
      case 'kill-server': case 'kill-session': exitSession(); return true;
      case 'ls': case 'list-sessions': out.line(`frai: ${site.menu.length} windows (created ${site.built?.slice(0, 10)}) (attached)`); return true;
      default: out.line(`unknown command: ${cmd}`, 'err'); return false;
    }
  });
}
