// The : command line, / search and the message line at the bottom.
import { $, go } from './data.js';
import { setTheme, getTheme } from './theme.js';
import { closeAll, openHelp, registerCloser } from './ui.js';
import { openParty } from './party.js';
import { normalize, stat } from './vfs.js';

let msgTimer = 0;
let shellHook = null;
let splitHook = null;
let quitHook = null;
export const onShell = (fn) => { shellHook = fn; };
export const onSplit = (fn) => { splitHook = fn; };
export const onQuit = (fn) => { quitHook = fn; };

export function vimMsg(text, isError = false, ms = 4000) {
  const m = $('#vim-msg');
  if (!m) return;
  clearTimeout(msgTimer);
  if (!text) { m.hidden = true; return; }
  m.textContent = text;
  m.classList.toggle('is-error', isError);
  m.hidden = false;
  if (ms) msgTimer = setTimeout(() => { m.hidden = true; }, ms);
}

/* ---- cmdline ---- */

export function openCmdline(prefix = ':') {
  closeAll();
  const f = $('#cmdline');
  const i = $('#cmdline-in');
  if (!f || !i) return;
  $('#cmdline-prefix').textContent = prefix;
  i.value = '';
  f.hidden = false;
  i.focus();
}
export function closeCmdline() {
  const f = $('#cmdline');
  if (!f || f.hidden) return false;
  f.hidden = true;
  $('#cmdline-in')?.blur();
  return true;
}

/* ---- search ---- */

let marks = [];
let cur = -1;
let lastPattern = '';

const textNodes = (root) => {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('script,style,.prompt,.prompt-idle') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const out = [];
  let n;
  while ((n = w.nextNode())) out.push(n);
  return out;
};

export function clearSearch() {
  for (const mk of marks) {
    const p = mk.parentNode;
    if (!p) continue;
    mk.replaceWith(document.createTextNode(mk.textContent));
    p.normalize();
  }
  marks = [];
  cur = -1;
}

export function search(pat) {
  clearSearch();
  if (!pat) return;
  let re;
  try { re = new RegExp(pat, 'gi'); } catch { vimMsg(`E486: Pattern not found: ${pat}`, true); return; }
  lastPattern = pat;
  for (const t of textNodes($('#main'))) {
    const text = t.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (!m[0]) { re.lastIndex++; continue; }
      frag.append(text.slice(last, m.index));
      const mk = document.createElement('mark');
      mk.className = 'hl';
      mk.textContent = m[0];
      frag.append(mk);
      marks.push(mk);
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last));
    t.replaceWith(frag);
  }
  if (!marks.length) { vimMsg(`E486: Pattern not found: ${pat}`, true); return; }
  searchNext(1);
}

export function searchNext(dir = 1) {
  if (!marks.length) {
    vimMsg(lastPattern ? `E486: Pattern not found: ${lastPattern}` : 'E35: No previous regular expression', true);
    return;
  }
  marks[cur]?.classList.remove('is-current');
  const prev = cur;
  cur = (cur + dir + marks.length) % marks.length;
  if (prev >= 0 && dir > 0 && cur < prev) vimMsg('search hit BOTTOM, continuing at TOP');
  else if (prev >= 0 && dir < 0 && cur > prev) vimMsg('search hit TOP, continuing at BOTTOM');
  else vimMsg(`/${lastPattern}  [${cur + 1}/${marks.length}]`);
  const mk = marks[cur];
  mk.classList.add('is-current');
  mk.scrollIntoView({ block: 'center' });
}

/* ---- :s ---- */

function substitute(pat, rep, flags) {
  const g = flags.includes('g');
  let re;
  try { re = new RegExp(pat, (g ? 'g' : '') + (flags.includes('i') ? 'i' : '')); } catch { vimMsg(`E486: Pattern not found: ${pat}`, true); return; }
  rep = rep.replace(/\\(\d)/g, '$$$1').replace(/~/g, '$&');
  let count = 0;
  let lines = 0;
  for (const t of textNodes($('#main'))) {
    const before = t.nodeValue;
    re.lastIndex = 0;
    if (!re.test(before)) continue;
    re.lastIndex = 0;
    count += g ? (before.match(re) || []).length : 1;
    re.lastIndex = 0;
    t.nodeValue = before.replace(re, rep);
    lines++;
  }
  if (!count) vimMsg(`E486: Pattern not found: ${pat}`, true);
  else if (count > 2 || lines > 2) vimMsg(`${count} substitutions on ${lines} lines`);
}

/* ---- ex commands ---- */

function quit(bang) {
  if (!bang && quitHook?.()) return;
  if (bang) {
    window.close();
    setTimeout(() => go('about:blank'), 60);
    return;
  }
  if (location.pathname === '/') { vimMsg('E37: No write since last change (add ! to override)', true); return; }
  go(location.pathname.replace(/\/[^/]+\/?$/, '/') || '/');
}

function openPath(arg) {
  if (!arg) { vimMsg('E32: No file name', true); return; }
  const s = stat(normalize('~', arg));
  if (!s) { vimMsg(`E484: Can't open file ${arg}`, true); return; }
  if (s.url) { go(s.url); return; }
  vimMsg(`"${s.name}" [readonly] ${s.size || 0}B`);
}

const HARMLESS = new Set(['hls', 'hlsearch', 'ic', 'ignorecase', 'wrap', 'mouse', 'ai', 'autoindent', 'et', 'expandtab', 'sw', 'shiftwidth', 'ts', 'tabstop', 'paste', 'list', 'spell', 'cursorline', 'cul']);

function setOption(args) {
  if (!args.length) { vimMsg(`  background=${getTheme()}  readonly  filetype=markdown  shell=/bin/zsh`); return; }
  for (const a of args) {
    const m = a.match(/^(no)?([a-z]+)(?:=(.*))?(\?)?$/);
    if (!m) { vimMsg(`E518: Unknown option: ${a}`, true); continue; }
    const [, no, key, val, ask] = m;
    if (key === 'bg' || key === 'background') {
      if (ask || val === undefined) vimMsg(`  background=${getTheme()}`);
      else if (!setTheme(val)) vimMsg(`E474: Invalid argument: ${a}`, true);
    } else if (key === 'ro' || key === 'readonly') {
      if (no) vimMsg("E45: 'readonly' option is set (add ! to override)", true);
    } else if (key === 'nu' || key === 'number' || key === 'rnu' || key === 'relativenumber') {
      vimMsg('E518: Unknown option: number (this buffer is prose, it has no lines)', true);
    } else if (!HARMLESS.has(key)) {
      vimMsg(`E518: Unknown option: ${a}`, true);
    }
  }
}

export function runEx(raw) {
  const line = raw.trim();
  if (!line) return;
  if (line.startsWith('!')) {
    if (shellHook) shellHook(line.slice(1).trim());
    else vimMsg('E34: No previous command', true);
    return;
  }
  const sub = line.match(/^(?:%|\d+,\d+|'<,'>)?s(?:ubstitute)?([/#|])(.*?)\1(.*?)(?:\1([a-z]*))?$/);
  if (sub) { substitute(sub[2], sub[3], sub[4] || ''); return; }
  if (/^\d+$/.test(line)) {
    const lh = parseFloat(getComputedStyle(document.body).lineHeight) || 24;
    window.scrollTo({ top: Math.max(0, (+line - 1) * lh) });
    return;
  }
  if (line === '$') { window.scrollTo({ top: document.documentElement.scrollHeight }); return; }

  let [cmd, ...args] = line.split(/\s+/);
  const bang = cmd.endsWith('!');
  if (bang) cmd = cmd.slice(0, -1);

  switch (cmd) {
    case 'q': case 'quit': case 'qa': case 'qall': case 'cq': quit(bang); break;
    case 'w': case 'write': case 'up': case 'update':
      vimMsg(bang ? "E212: Can't open file for writing" : "E45: 'readonly' option is set (add ! to override)", true); break;
    case 'wq': case 'x': case 'xit': case 'wqa': case 'xa': case 'wqall': case 'ZZ':
      if (bang) quit(true); else vimMsg("E45: 'readonly' option is set (add ! to override)", true); break;
    case 'h': case 'help': openHelp(); break;
    case 'set': case 'se': case 'setlocal': case 'setl': setOption(args); break;
    case 'colo': case 'colorscheme':
      if (!args[0]) vimMsg(getTheme());
      else if (!setTheme(args[0])) vimMsg(`E185: Cannot find color scheme '${args[0]}'`, true);
      break;
    case 'e': case 'edit': case 'o': case 'open': case 'tabe': case 'tabedit': openPath(args[0]); break;
    case 'sp': case 'split': case 'new': splitHook ? splitHook('v', args[0]) : openPath(args[0]); break;
    case 'vs': case 'vsplit': case 'vnew': splitHook ? splitHook('h', args[0]) : openPath(args[0]); break;
    case 'on': case 'only': splitHook?.('only'); break;
    case 'Ex': case 'Explore': case 'ls': case 'buffers': case 'files': go('/posts/'); break;
    case 'bn': case 'bnext': { const a = $('#nav-newer'); a ? go(a.href) : vimMsg('E85: There is no listed buffer', true); break; }
    case 'bp': case 'bprev': case 'bprevious': { const a = $('#nav-older'); a ? go(a.href) : vimMsg('E85: There is no listed buffer', true); break; }
    case 'noh': case 'nohlsearch': clearSearch(); break;
    case 'party': case 'ffxii': case 'status': openParty(); break;
    case 'term': case 'terminal': case 'sh': case 'shell': shellHook?.(''); break;
    case 'version': case 've': vimMsg('VIM - Vi IMproved 9.1 (frai.dev edition). Included patches: 1-∞'); break;
    case 'smile': vimMsg(':-)  (not yet implemented in this build, sorry)'); break;
    case 'reg': case 'registers': case 'di': case 'display': vimMsg('--- Registers ---  "0   git gud'); break;
    case 'echo': vimMsg(args.join(' ').replace(/^["']|["']$/g, '')); break;
    case 'pwd': vimMsg(`/home/frai${location.pathname.replace(/\/$/, '')}`); break;
    case 'Ni': vimMsg('Do you demand a shrubbery?'); break;
    default: vimMsg(`E492: Not an editor command: ${line}`, true);
  }
}

const EX = ['quit', 'help', 'set', 'edit', 'Explore', 'nohlsearch', 'party', 'terminal', 'version', 'colorscheme', 'write', 'wq', 'bnext', 'bprevious'];

export function initVim() {
  const form = $('#cmdline');
  const input = $('#cmdline-in');
  if (!form || !input) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const prefix = $('#cmdline-prefix').textContent;
    const v = input.value;
    closeCmdline();
    if (prefix === '/') search(v);
    else runEx(v);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeCmdline(); }
    else if (e.key === 'Backspace' && !input.value) { e.preventDefault(); closeCmdline(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const c = EX.filter((x) => x.startsWith(input.value));
      if (c.length === 1) input.value = c[0];
      else if (c.length > 1) vimMsg(c.join('  '));
    }
  });
  registerCloser(closeCmdline);
}
