// The drop-down shell. Quake style, zsh flavored, entirely fake.
import { $, site, go, sleep } from './data.js';
import { entries, normalize, stat, dirUrl, fromLocation, display } from './vfs.js';
import { setTheme, getTheme } from './theme.js';
import { registerCloser, closeAll, openHelp } from './ui.js';
import { openParty, stats as partyStats } from './party.js';
import { onShell } from './vim.js';
import { FORTUNES } from './fortunes.js';

const term = $('#term');
const out = $('#term-out');
const input = $('#term-in');
const ps1 = $('#term-ps1');
const form = $('#term-form');

const handle = site.handle || 'frai';
const host = site.host || 'frai.dev';
let cwd = fromLocation(location.pathname);
let history = [];
try { history = JSON.parse(sessionStorage.getItem('term:history') || '[]'); } catch { /* ignore */ }
let hIdx = history.length;
let draft = '';
let booted = false;
const queue = [];
let pumping = false;

const env = {
  USER: handle, HOME: `/home/${handle}`, SHELL: '/bin/zsh', TERM: 'xterm-256color',
  EDITOR: 'vim', VISUAL: 'vim', PAGER: 'less', LANG: 'en_US.UTF-8',
  TMUX: '/tmp/tmux-1000/default,1337,0', HOSTNAME: host,
  PATH: `/usr/local/bin:/usr/bin:/bin:/home/${handle}/.local/bin`,
};
Object.defineProperty(env, 'THEME', { get: getTheme, set: (v) => setTheme(v), enumerable: true });
Object.defineProperty(env, 'PWD', { get: () => display(cwd), enumerable: true });

const ZSHRC = `# ~/.zshrc
export EDITOR=vim
export PAGER=less
alias ls='ls --color=auto'
alias ll='ls -la'
alias gs='git status'
alias gud='git gud'
alias please='sudo'
alias :q='exit'
setopt AUTO_CD
PROMPT='%F{blue}%n@%m%f %~ $ '`;

const ART = [
  '  __           _ ',
  ' / _|_ __ __ _(_)',
  "| |_| '__/ _` | |",
  '|  _| | | (_| | |',
  '|_| |_|  \\__,_|_|',
];


const HELP = [
  ['help', 'this list'],
  ['ls [-la] [path]', 'list a directory'],
  ['cd [path]', 'change directory (and page)'],
  ['pwd', 'print working directory'],
  ['cat <file>', 'print a file, open a post'],
  ['cat about.md', 'who is this'],
  ['tree', 'the whole site, as a tree'],
  ['grep <pattern>', 'search post titles and tags'],
  ['man frai', 'the manual'],
  ['neofetch', 'system information'],
  ['fortune', 'wisdom'],
  ['cowsay <text>', 'moo'],
  ['env', 'environment'],
  ['export THEME=light', 'set the background'],
  ['history', 'what you typed'],
  ['clear', 'clear the screen'],
  ['exit', 'close the shell'],
];

/* ---- output helpers ---- */

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function line(text = '', cls = '') { const d = el('div', cls, text); out.append(d); return d; }
function lines(text, cls) { String(text).split('\n').forEach((l) => line(l, cls)); }
function row(build) { const d = el('div'); build(d); out.append(d); return d; }
function link(text, url, cls) { const a = el('a', cls, text); a.href = url; return a; }
function scrollBottom() { out.scrollTop = out.scrollHeight; }
const promptText = () => `${handle}@${host} ${cwd} $`;
const updatePS1 = () => { ps1.textContent = promptText(); };
function echo(cmd) { row((d) => { d.className = 'echo'; d.append(el('span', 'ps1', promptText()), cmd); }); }
function entryEl(e) {
  const name = e.type === 'dir' ? `${e.name}/` : e.name;
  if (e.url) return link(name, e.url, e.type === 'dir' ? 'dir' : '');
  return el('span', e.type === 'dir' ? 'dir' : '', name);
}
function persistAndGo(url) {
  if (!inPane()) { try { sessionStorage.setItem('term:open', '1'); } catch { /* ignore */ } }
  setTimeout(() => go(url), 350);
}
function save() { try { sessionStorage.setItem('term:history', JSON.stringify(history.slice(-100))); } catch { /* ignore */ } }

/* ---- open / close ---- */

let tmuxHook = null;
export const onTmux = (fn) => { tmuxHook = fn; };
export const inPane = () => term.classList.contains('in-pane');
export function mountTermInPane(body) {
  term.classList.add('in-pane', 'is-open');
  body.append(term);
  if (!booted) { booted = true; line(`${host} zsh 5.9 (static). type help to start, exit to leave.`, 'dim'); }
  updatePS1();
  setTimeout(() => input.focus(), 40);
}
export function unmountTerm() {
  term.classList.remove('in-pane', 'is-open');
  document.body.append(term);
}
export const onExit = (fn) => term.addEventListener('term:exit', fn);
function exitShell() {
  if (inPane()) { term.dispatchEvent(new CustomEvent('term:exit')); return; }
  closeTerm();
}

export function openTerm() {
  if (inPane()) { input.focus(); return; }
  closeAll();
  term.classList.add('is-open');
  if (!booted) { booted = true; line(`${host} zsh 5.9 (static). type help to start, exit to leave.`, 'dim'); }
  updatePS1();
  setTimeout(() => input.focus(), 40);
  try { sessionStorage.setItem('term:open', '1'); } catch { /* ignore */ }
}
export function closeTerm() {
  if (inPane()) { input.blur(); return false; }
  if (!term.classList.contains('is-open')) return false;
  term.classList.remove('is-open');
  input.blur();
  try { sessionStorage.removeItem('term:open'); } catch { /* ignore */ }
  return true;
}
export const toggleTerm = () => (term.classList.contains('is-open') ? closeTerm() : openTerm());

/* ---- parsing ---- */

const expand = (s) => s
  .replace(/\$\{?([A-Za-z_][A-Za-z0-9_?]*)\}?/g, (_, k) => (k === '?' ? String(lastStatus) : env[k] ?? ''))
  .replace(/(^|\s)~(?=\/|\s|$)/g, `$1${env.HOME}`);

function tokenize(s) {
  const toks = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) toks.push(m[1] ?? m[2] ?? m[3]);
  return toks;
}

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
function suggest(cmd) {
  if (cmd.length < 2) return null;
  const names = Object.keys(commands).filter((c) => c.length > 1 && !c.startsWith(':'));
  const best = names.map((n) => [lev(cmd, n), n]).sort((x, y) => x[0] - y[0])[0];
  return best && best[0] <= 2 ? best[1] : null;
}

export function unixDate() {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const o = -d.getTimezoneOffset();
  const tz = `${o >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(o) / 60)).padStart(2, '0')}${String(Math.abs(o) % 60).padStart(2, '0')}`;
  return `${days[d.getDay()]} ${mons[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${d.toTimeString().slice(0, 8)} ${tz} ${d.getFullYear()}`;
}
function hash(s) {
  let h = 0x811c9dc5;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0').slice(0, 7);
}
function daysSinceFirstPost() {
  const first = site.posts[site.posts.length - 1]?.date;
  return first ? Math.floor((Date.now() - new Date(first)) / 864e5) : 0;
}

function cowsay(text) {
  const words = (text || 'moo').split(/\s+/);
  const ls = [];
  let cur = '';
  for (const w of words) {
    if (`${cur} ${w}`.trim().length > 38 && cur) { ls.push(cur.trim()); cur = w; } else cur = `${cur} ${w}`;
  }
  if (cur.trim()) ls.push(cur.trim());
  const w = Math.max(...ls.map((l) => l.length));
  const rows = [` ${'_'.repeat(w + 2)}`];
  if (ls.length === 1) rows.push(`< ${ls[0].padEnd(w)} >`);
  else ls.forEach((l, i) => {
    const [a, b] = i === 0 ? ['/', '\\'] : i === ls.length - 1 ? ['\\', '/'] : ['|', '|'];
    rows.push(`${a} ${l.padEnd(w)} ${b}`);
  });
  rows.push(` ${'-'.repeat(w + 2)}`,
    '        \\   ^__^',
    '         \\  (oo)\\_______',
    '            (__)\\       )\\/\\',
    '                ||----w |',
    '                ||     ||');
  return rows.join('\n');
}

async function doom() {
  const victims = Array.from(document.querySelectorAll('#main > *, .tmux'));
  const paths = ['/bin', '/boot', '/etc', '/lib', '/usr', '/var', `/home/${handle}/.zshrc`, `/home/${handle}/posts`, `/home/${handle}/.vimrc`];
  for (let i = 0; i < paths.length; i++) {
    line(`removing ${paths[i]}...`, 'dim');
    const from = Math.floor((i * victims.length) / paths.length);
    const to = Math.floor(((i + 1) * victims.length) / paths.length);
    victims.slice(from, to).forEach((v) => v.classList.add('is-rm'));
    scrollBottom();
    await sleep(260);
  }
  victims.forEach((v) => v.classList.add('is-rm'));
  await sleep(500);
  line("rm: cannot remove '/': Device or resource busy", 'err');
  await sleep(900);
  line('...just kidding. this is a static site. restoring from git.', 'ok');
  await sleep(600);
  victims.forEach((v) => v.classList.remove('is-rm'));
  line('HEAD is now at origin/main');
}

const readOnly = (cmd) => (args) => {
  const t = args.find((a) => !a.startsWith('-'));
  line(t ? `${cmd}: cannot ${cmd === 'mkdir' ? 'create directory' : cmd === 'touch' ? 'touch' : 'move'} '${t}': Read-only file system` : `${cmd}: missing operand`, 'err');
  return false;
};
const fake = (text, cls = '') => () => { lines(text, cls); return false; };

/* ---- commands ---- */

const commands = {
  help() {
    line('frai.dev shell, built-in commands:', 'dim');
    const w = Math.max(...HELP.map((h) => h[0].length)) + 2;
    for (const [c, d] of HELP) line(`  ${c.padEnd(w)}${d}`);
    line('');
    line('plus a few classics you already know. tab completes. esc or exit closes.', 'dim');
  },

  ls(args) {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const paths = args.filter((a) => !a.startsWith('-'));
    const long = flags.includes('l');
    const all = flags.includes('a');
    const targets = paths.length ? paths : ['.'];
    let ok = true;
    for (const t of targets) {
      const s = stat(normalize(cwd, t));
      if (!s) { line(`ls: cannot access '${t}': No such file or directory`, 'err'); ok = false; continue; }
      if (targets.length > 1 && s.type === 'dir') line(`${t}:`);
      let list = s.type === 'dir' ? s.entries : [s];
      if (!all) list = list.filter((e) => !e.hidden);
      if (long) {
        line(`total ${list.length}`, 'dim');
        for (const e of list) row((d) => {
          const perm = e.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--';
          const size = String(e.size ?? 4096).padStart(6);
          d.append(`${perm}  1 ${handle} ${handle} ${size}  ${e.date || site.built?.slice(0, 10) || ''}  `, entryEl(e));
        });
      } else if (!list.length) {
        line('');
      } else {
        row((d) => list.forEach((e, i) => { if (i) d.append('  '); d.append(entryEl(e)); }));
      }
    }
    return ok;
  },
  ll(args) { return commands.ls(['-la', ...args]); },
  dir(args) { return commands.ls(args); },

  cd(args) {
    const target = args[0] || '~';
    const p = normalize(cwd, target);
    const s = stat(p);
    if (!s) { line(`cd: no such file or directory: ${target}`, 'err'); return false; }
    if (s.type !== 'dir') { line(`cd: not a directory: ${target}`, 'err'); return false; }
    cwd = p;
    updatePS1();
    const url = dirUrl(p);
    if (url && url !== location.pathname) { line(`→ ${url}`, 'dim'); persistAndGo(url); }
    return true;
  },
  pwd() { line(display(cwd)); },

  cat(args) {
    if (!args.length) { line('cat: reading from stdin is not supported in this economy', 'dim'); return false; }
    let ok = true;
    for (const a of args) {
      const s = stat(normalize(cwd, a));
      if (!s) { line(`cat: ${a}: No such file or directory`, 'err'); ok = false; continue; }
      if (s.type === 'dir') { line(`cat: ${a}: Is a directory`, 'err'); ok = false; continue; }
      if (s.name === 'README.md') {
        lines(`# ${site.author} (${handle})\n\n${site.description}\n${site.plan || ''}\n`);
        row((d) => { d.append('links: '); site.links.forEach((l, i) => { if (i) d.append(' · '); d.append(link(l.name, l.url)); }); });
      } else if (s.name === '.plan') lines(`${site.description}\n${site.plan || ''}`);
      else if (s.name === '.zshrc') lines(ZSHRC, 'dim');
      else if (s.post) {
        const p = s.post;
        lines(`+++\ntitle = "${p.title}"\ndate = ${p.date}\ntags = [${(p.tags || []).map((t) => `"${t}"`).join(', ')}]\n+++`);
        line(`opening in ${env.PAGER}...`, 'dim');
        persistAndGo(p.url);
      } else if (s.url) {
        if (s.text) lines(s.text.join('\n'));
        line(`opening ${s.url}...`, 'dim');
        persistAndGo(s.url);
      }
      else { line(`cat: ${a}: Permission denied`, 'err'); ok = false; }
    }
    return ok;
  },
  less(a) { return commands.cat(a); },
  more(a) { return commands.cat(a); },
  head(a) { return commands.cat(a); },
  tail(a) { return commands.cat(a); },
  bat(a) { return commands.cat(a); },

  open(args) {
    const a = args[0];
    if (!a) { line('open: missing operand', 'err'); return false; }
    if (/^https?:\/\//.test(a)) { window.open(a, '_blank', 'noopener'); return true; }
    const l = site.links.find((x) => x.name === a);
    if (l) { window.open(l.url, '_blank', 'noopener'); return true; }
    const s = stat(normalize(cwd, a));
    if (s?.url) { line(`opening ${s.url}...`, 'dim'); persistAndGo(s.url); return true; }
    line(`open: ${a}: No such file or directory`, 'err');
    return false;
  },
  'xdg-open'(a) { return commands.open(a); },

  tree() {
    const rows = [];
    const walk = (path, prefix) => {
      const es = (entries(path) || []).filter((e) => !e.hidden);
      es.forEach((e, i) => {
        const last = i === es.length - 1;
        rows.push([prefix + (last ? '└── ' : '├── '), e]);
        if (e.type === 'dir') walk(`${path}/${e.name}`, prefix + (last ? '    ' : '│   '));
      });
    };
    line(cwd, 'dir');
    walk(cwd, '');
    rows.forEach(([pre, e]) => row((d) => d.append(pre, entryEl(e))));
    const dirs = rows.filter((r) => r[1].type === 'dir').length;
    line('');
    line(`${dirs} directories, ${rows.length - dirs} files`, 'dim');
  },
  find() {
    const walk = (path) => {
      for (const e of entries(path) || []) {
        const p = `${path}/${e.name}`;
        row((d) => d.append(p.replace(/^~/, '.').slice(0, -e.name.length), entryEl(e)));
        if (e.type === 'dir') walk(p);
      }
    };
    line('.');
    walk(cwd);
  },
  grep(args) {
    const pat = args.filter((a) => !a.startsWith('-')).join(' ');
    if (!pat) { line('usage: grep [-i] PATTERN', 'err'); return false; }
    let re;
    try { re = new RegExp(pat, 'i'); } catch { line(`grep: invalid pattern: ${pat}`, 'err'); return false; }
    const hits = site.posts.filter((p) => re.test(p.title) || (p.tags || []).some((t) => re.test(t)) || re.test(p.slug));
    if (!hits.length) return false;
    hits.forEach((p) => row((d) => { d.append(link(`posts/${p.slug}.md`, p.url, 'dir'), `: ${p.title}  [${(p.tags || []).join(', ')}]`); }));
    return true;
  },

  man(args) {
    const t = args[0];
    if (!t) { lines("What manual page do you want?\nFor example, try 'man frai'."); return false; }
    if (t === handle || t === `${handle}(1)`) {
      const H = handle.toUpperCase();
      lines(`${H}(1)${' '.repeat(22)}General Commands Manual${' '.repeat(22)}${H}(1)\n\nNAME\n       ${handle} - ${site.author}\n\nSYNOPSIS\n       ${handle} [--coffee] [--vim] problem...\n\nDESCRIPTION\n       ${site.description}\n       ${site.plan || ''}\n\nSEE ALSO`);
      row((d) => { d.append('       '); site.links.forEach((l, i) => { if (i) d.append(', '); d.append(link(`${l.name}(1)`, l.url)); }); });
      return true;
    }
    if (t === 'man') { line('man - an interface to the system reference manuals. you are using it right now.'); return true; }
    if (commands[t]) {
      const desc = HELP.find((h) => h[0].split(' ')[0] === t)?.[1] || 'does what it says on the tin';
      lines(`${t.toUpperCase()}(1)${' '.repeat(Math.max(1, 26 - t.length))}frai.dev shell${' '.repeat(Math.max(1, 26 - t.length))}${t.toUpperCase()}(1)\n\nNAME\n       ${t} - ${desc}\n\nSEE ALSO\n       help(1), frai(1)`);
      return true;
    }
    line(`No manual entry for ${t}`, 'err');
    return false;
  },

  neofetch() {
    const st = partyStats();
    const ua = navigator.userAgent;
    const b = ua.match(/(Firefox|Edg|OPR|Chrome|Safari)\/(\d+)/);
    const browser = b ? `${b[1]} ${b[2]}` : 'unknown';
    const th = site.theme;
    const info = [
      [`${handle}@${host}`], ['-'.repeat(handle.length + host.length + 1)],
      ['OS', `frai.dev GNU/Hugo ${site.hugo}`],
      ['Host', 'GitHub Pages'],
      ['Kernel', `${site.hugo}-static`],
      ['Uptime', `${daysSinceFirstPost()} days since first post`],
      ['Packages', `${site.posts.length} (posts), ${site.tags.length} (tags)`],
      ['Shell', 'zsh 5.9'],
      ['Resolution', `${window.innerWidth}x${window.innerHeight}`],
      ['WM', 'tmux'],
      ['Theme', `${getTheme()} [${th.dark}/${th.primary}]`],
      ['Terminal', browser],
      ['CPU', `${navigator.hardwareConcurrency || '?'} cores of javascript`],
      ['Level', `${st.level} (${st.exp} exp, ${st.next} to next)`],
    ];
    const W = 20;
    for (let i = 0; i < Math.max(ART.length, info.length); i++) {
      row((d) => {
        d.append(el('span', 'art', (ART[i] || '').padEnd(W)));
        const [k, v] = info[i] || [];
        if (k && v) d.append(el('span', 'ok', `${k}:`), ` ${v}`);
        else if (k) d.append(el('span', 'ok', k));
      });
    }
    row((d) => {
      d.append(''.padEnd(W));
      for (const c of [th.dark, th.light, th.lightest, th.primary, th.gold]) { const s = el('span', 'sw'); s.style.background = c; d.append(s); }
    });
  },
  fastfetch() { return commands.neofetch(); },
  screenfetch() { return commands.neofetch(); },

  fortune() { line(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]); },
  cowsay(args) { lines(cowsay(args.join(' '))); },
  figlet(args) { if (args.length && args.join(' ') !== handle) { line(`figlet: only knows how to spell "${handle}"`, 'dim'); } lines(ART.join('\n'), 'art'); },

  echo(args) { line(args.filter((a) => a !== '-n' && a !== '-e').join(' ')); },
  printf(args) { line(args.join(' ')); },
  env() { for (const k of Object.keys(env)) line(`${k}=${env[k]}`); },
  printenv(a) { return commands.env(a); },
  export(args) {
    if (!args.length) return commands.env();
    for (const a of args) {
      const m = a.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) { line(`export: not valid in this context: ${a}`, 'err'); return false; }
      if (m[1] === 'THEME') {
        if (!setTheme(m[2])) { line('export: THEME must be light or dark', 'err'); return false; }
      } else env[m[1]] = m[2];
    }
    return true;
  },
  theme(args) {
    if (!args[0]) { line(`background=${getTheme()}`); return true; }
    if (!setTheme(args[0])) { line('usage: theme light|dark', 'err'); return false; }
    return true;
  },
  history() { history.forEach((h, i) => line(`${String(i + 1).padStart(5)}  ${h}`)); },
  clear() { out.replaceChildren(); },
  cls() { out.replaceChildren(); },
  exit() { exitShell(); },
  logout() { exitShell(); },
  ':q'() { exitShell(); },
  ':q!'() { exitShell(); },
  ':wq'() { exitShell(); },
  ':x'() { exitShell(); },
  ':help'() { openHelp(); },

  whoami() { line(handle); },
  hostname() { line(host); },
  id() { line(`uid=1000(${handle}) gid=1000(${handle}) groups=1000(${handle}),999(docker),1002(sky-pirates)`); },
  uname(args) { line(args.some((a) => /a/.test(a)) ? `Linux ${host} 6.6.6-static #1 SMP PREEMPT_DYNAMIC hugo-${site.hugo} x86_64 GNU/Linux` : 'Linux'); },
  date() { line(unixDate()); },
  uptime() { line(` ${new Date().toTimeString().slice(0, 8)} up ${daysSinceFirstPost()} days,  1 user,  load average: 0.00, 0.01, 0.05`); },
  cal() {
    const d = new Date();
    const mons = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const title = `${mons[d.getMonth()]} ${d.getFullYear()}`;
    line(`${' '.repeat(Math.floor((20 - title.length) / 2))}${title}`);
    line('Su Mo Tu We Th Fr Sa');
    let s = '   '.repeat(first);
    for (let i = 1; i <= days; i++) {
      s += (i === d.getDate() ? `[${i}]`.padStart(3) : String(i).padStart(2) + ' ').slice(0, 3);
      if ((first + i) % 7 === 0) { line(s.trimEnd()); s = ''; }
    }
    if (s) line(s.trimEnd());
  },
  top: fake('  PID USER      %CPU %MEM COMMAND\n    1 frai       0.3  0.1 hugo\n    2 frai       0.0  0.0 zsh\n 1337 frai      99.9  0.4 easter-eggs\n\n(read-only. press q to quit. there is no q.)'),
  htop(a) { return commands.top(a); },
  df: fake('Filesystem      Size  Used Avail Use% Mounted on\ngithub-pages    1.0G  212K  1.0G   1% /'),
  du: fake('212K\t.\n(it is a static site)'),
  free: fake('               total        used        free\nMem:      your tabs    all of it        0'),

  party() { openParty(); },
  status() { openParty(); },
  ffxii() { openParty(); },
  ff() { openParty(); },
  menu() { openParty(); },

  git(args) {
    const sub = args[0];
    switch (sub) {
      case undefined: case '--help': case 'help':
        lines("usage: git [-v | --version] [-h | --help] <command> [<args>]\n\nthe one command you need here is 'git gud'.");
        return true;
      case 'status': lines("On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean"); return true;
      case 'log':
        site.posts.forEach((p) => row((d) => d.append(el('span', 'ok', hash(p.slug)), ` ${p.date} `, link(p.title, p.url))));
        return true;
      case 'gud': line('leveling up...', 'ok'); setTimeout(openParty, 450); return true;
      case 'push':
        if (args.includes('--force') || args.includes('-f')) { lines('remote: no.\nTo github.com:fraidev/frai.dev.git\n ! [remote rejected] main -> main (protected branch hook declined)', 'err'); return false; }
        line('Everything up-to-date'); return true;
      case 'pull': case 'fetch': line('Already up to date.'); return true;
      case 'blame': line(`${hash('blame')} (${handle} 2021-09-07) it was ${handle}. it is always ${handle}.`); return true;
      case 'commit': line('nothing to commit, working tree clean'); return false;
      case 'checkout': case 'switch': line("Already on 'main'"); return true;
      case 'stash': line('No local changes to save'); return true;
      case 'rebase': line('Current branch main is up to date.'); return true;
      case 'reflog': line(`${hash('reflog')} HEAD@{0}: you are here`); return true;
      default:
        lines(`git: '${sub}' is not a git command. See 'git --help'.\n\nThe most similar command is\n\tgud`, 'err');
        return false;
    }
  },
  gs() { return commands.git(['status']); },
  gud() { return commands.git(['gud']); },

  async sudo(args) {
    if (/^make me a sandwich/.test(args.join(' '))) { line('Okay.'); return true; }
    line(`[sudo] password for ${handle}: `);
    await sleep(700);
    line(`${handle} is not in the sudoers file.  This incident will be reported.`, 'err');
    return false;
  },
  please(a) { return commands.sudo(a); },
  doas(a) { return commands.sudo(a); },
  make(args) {
    if (args.join(' ').startsWith('me a sandwich')) { line('What? Make it yourself.'); return false; }
    line('make: *** No targets specified and no makefile found.  Stop.', 'err');
    return false;
  },

  async rm(args) {
    const flags = args.filter((a) => a.startsWith('-'));
    const targets = args.filter((a) => !a.startsWith('-'));
    const recursive = flags.some((f) => /^-[a-zA-Z]*[rR]/.test(f) || f === '--recursive');
    const noPreserve = flags.includes('--no-preserve-root');
    if (!targets.length) { line('rm: missing operand', 'err'); return false; }
    if (recursive && targets.some((t) => t === '/' || t === '/*' || t === '~' || t === env.HOME)) {
      if (!noPreserve) {
        line("rm: it is dangerous to operate recursively on '/'", 'err');
        line('rm: use --no-preserve-root to override this failsafe', 'err');
        return false;
      }
      await doom();
      return true;
    }
    for (const t of targets) {
      const s = stat(normalize(cwd, t));
      if (!s) line(`rm: cannot remove '${t}': No such file or directory`, 'err');
      else if (s.type === 'dir' && !recursive) line(`rm: cannot remove '${t}': Is a directory`, 'err');
      else line(`rm: cannot remove '${t}': Read-only file system`, 'err');
    }
    return false;
  },
  mkdir: readOnly('mkdir'),
  touch: readOnly('touch'),
  mv: readOnly('mv'),
  cp: readOnly('cp'),
  chmod: readOnly('chmod'),
  chown: readOnly('chown'),

  yes(args) { const s = args.join(' ') || 'y'; for (let i = 0; i < 24; i++) line(s); line('^C', 'dim'); },
  async ping(args) {
    const h = args.find((a) => !a.startsWith('-')) || host;
    line(`PING ${h} (127.0.0.1): 56 data bytes`);
    for (let i = 0; i < 4; i++) {
      await sleep(400);
      line(`64 bytes from 127.0.0.1: icmp_seq=${i} ttl=64 time=${(Math.random() * 20 + 10).toFixed(3)} ms`);
      scrollBottom();
    }
    lines(`\n--- ${h} ping statistics ---\n4 packets transmitted, 4 packets received, 0.0% packet loss`);
  },
  which(args) {
    let ok = true;
    for (const a of args) {
      if (a === 'll' || a === 'gs' || a === 'gud' || a === 'please') line(`${a}: aliased to ${{ ll: 'ls -la', gs: 'git status', gud: 'git gud', please: 'sudo' }[a]}`);
      else if (commands[a]) line(`/usr/bin/${a}`);
      else { line(`${a} not found`, 'err'); ok = false; }
    }
    return ok;
  },
  type(a) { return commands.which(a); },
  alias: fake("ll='ls -la'\ngs='git status'\ngud='git gud'\nplease='sudo'\n:q='exit'"),

  vim(args) {
    if (args.length) return commands.cat(args);
    lines('vim: you are already in vim. press : to enter command mode, ? for help.', 'dim');
    return false;
  },
  vi(a) { return commands.vim(a); },
  nvim(a) { return commands.vim(a); },
  emacs: fake('zsh: command not found: emacs\nzsh: did you mean: vim', 'err'),
  nano: fake('nano: this is a vim household.', 'err'),
  code: fake('code: command not found. there is a vim right here though.', 'err'),
  tmux(args) {
    if (tmuxHook) return tmuxHook(args, { line, lines });
    line('sessions should be nested with care, unset $TMUX to force', 'err');
    return false;
  },
  screen: fake('screen: tmux is right there.', 'err'),
  sl: fake(`      ====        ________                ___________
  _D _|  |_______/        \\__I_I_____===__|_________|
   |(_)---  |   H\\________/ |   |        =|___ ___|
   /     |  |   H  |  |     |   |         ||_| |_||
  |      |  |   H  |__--------------------| [___] |
  | ________|___H__/__|_____/[][]~\\_______|       |
  |/ |   |-----------I_____I [][] []  D   |=======|__
__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__
 |/-=|___|=    ||    ||    ||    |_____/~\\___/
  \\_/      \\O=====O=====O=====O_/      \\_/

choo choo. (you meant ls.)`, 'art'),
  cmatrix: fake('cmatrix: 256 colors required. this terminal has five.', 'err'),
  hollywood: fake('hollywood: not enough monitors.', 'err'),
  ssh(args) { line(`ssh: connect to host ${args.find((a) => !a.startsWith('-')) || host} port 22: Connection refused`, 'err'); return false; },
  curl: fake('curl: (7) this shell has no network. it barely has a filesystem.', 'err'),
  wget: fake('wget: unable to resolve host address. (no network in here)', 'err'),
  python: fake('python: REPL not included. this is a static site.', 'err'),
  python3: fake('python3: REPL not included. this is a static site.', 'err'),
  node: fake('node: you are already running in one. sort of.', 'err'),
  go: fake(`go: no Go files in /home/frai`, 'err'),
  docker: fake('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running? (no)', 'err'),
  cargo: fake('error: could not find `Cargo.toml` in `/home/frai` or any parent directory', 'err'),
  npm: fake('npm ERR! no. (also: 1,204 vulnerabilities found)', 'err'),
  sh: fake('you are already in a shell. how deep do you want to go?', 'dim'),
  bash(a) { return commands.sh(a); },
  zsh(a) { return commands.sh(a); },
  fish(a) { return commands.sh(a); },
  pacman: fake('error: you cannot perform this operation unless you are root. also this is a website.', 'err'),
  apt: fake('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)', 'err'),
  brew: fake('Error: this is not a mac. it is not even a computer.', 'err'),
  nix: fake('error: experimental Nix feature "being-a-website" is disabled', 'err'),
  reboot: fake('reboot: you can just close the tab.', 'err'),
  shutdown: fake('shutdown: you can just close the tab.', 'err'),
  kill: fake('kill: not this time.', 'err'),
  mail: fake('No mail.'),
};

let lastStatus = 0;

async function exec(seg) {
  const argv = tokenize(expand(seg));
  const [cmd, ...args] = argv;
  if (!cmd) return true;
  const fn = commands[cmd];
  if (fn) { const r = await fn(args, seg); return r !== false; }
  const assign = cmd.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (assign) { env[assign[1]] = assign[2]; return true; }
  if (cmd.startsWith('./') || cmd.startsWith('/')) { line(`zsh: permission denied: ${cmd}`, 'err'); return false; }
  line(`zsh: command not found: ${cmd}`, 'err');
  const near = suggest(cmd);
  if (near) line(`zsh: did you mean: ${near}`, 'dim');
  return false;
}

export async function run(raw) {
  const cmdline = raw.trim();
  echo(raw);
  if (!cmdline) { scrollBottom(); return; }
  if (history[history.length - 1] !== cmdline) history.push(cmdline);
  if (history.length > 100) history.shift();
  hIdx = history.length;
  save();
  const parts = cmdline.split(/\s*(&&|\|\||;)\s*/);
  let ok = true;
  for (let i = 0; i < parts.length; i += 2) {
    const op = parts[i - 1];
    if (op === '&&' && !ok) continue;
    if (op === '||' && ok) continue;
    ok = await exec(parts[i]);
    lastStatus = ok ? 0 : 1;
    scrollBottom();
  }
  scrollBottom();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) await run(queue.shift());
  pumping = false;
}
export function submit(cmd) { queue.push(cmd); pump(); }

/* ---- completion ---- */

function complete() {
  const v = input.value;
  const pos = input.selectionStart ?? v.length;
  const before = v.slice(0, pos);
  const parts = before.split(/\s+/);
  const cur = parts[parts.length - 1];
  let cands;
  let base = '';
  if (parts.length === 1) {
    cands = Object.keys(commands).filter((c) => c.startsWith(cur) && !c.startsWith(':'));
  } else {
    const i = cur.lastIndexOf('/');
    base = i >= 0 ? cur.slice(0, i + 1) : '';
    const frag = cur.slice(i + 1);
    const es = entries(normalize(cwd, base || '.')) || [];
    cands = es.filter((e) => e.name.startsWith(frag) && (frag.startsWith('.') || !e.hidden)).map((e) => base + e.name + (e.type === 'dir' ? '/' : ''));
  }
  if (!cands.length) return;
  const put = (s) => {
    const head = before.slice(0, before.length - cur.length) + s;
    input.value = head + v.slice(pos);
    input.setSelectionRange(head.length, head.length);
  };
  if (cands.length === 1) { put(cands[0] + (cands[0].endsWith('/') ? '' : ' ')); return; }
  let pre = cands[0];
  for (const c of cands) while (!c.startsWith(pre)) pre = pre.slice(0, -1);
  if (pre.length > cur.length) { put(pre); return; }
  echo(v);
  line(cands.map((c) => c.slice(base.length)).join('  '));
  scrollBottom();
}

/* ---- wiring ---- */

export function initTerm() {
  if (!term || !out || !input || !form) return;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); complete(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hIdx === history.length) draft = input.value;
      if (hIdx > 0) { hIdx--; input.value = history[hIdx]; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIdx < history.length) { hIdx++; input.value = hIdx === history.length ? draft : history[hIdx]; }
    } else if (e.key === 'Escape') { e.preventDefault(); closeTerm(); }
    else if (e.key === '`' && !input.value) { e.preventDefault(); closeTerm(); }
    else if (e.ctrlKey && e.key === 'l') { e.preventDefault(); out.replaceChildren(); }
    else if (e.ctrlKey && e.key === 'c' && input.selectionStart === input.selectionEnd) { e.preventDefault(); echo(`${input.value}^C`); input.value = ''; scrollBottom(); }
    else if (e.ctrlKey && e.key === 'd' && !input.value) { e.preventDefault(); closeTerm(); }
    else if (e.ctrlKey && e.key === 'u') { e.preventDefault(); input.value = ''; }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    submit(v);
  });
  term.addEventListener('click', (e) => { if (!(e.target instanceof Element && e.target.closest('a, button'))) input.focus(); });
  out.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('a')) { try { sessionStorage.setItem('term:open', '1'); } catch { /* ignore */ } }
  });
  $('#term-close')?.addEventListener('click', closeTerm);
  $('#tmux-session')?.addEventListener('click', toggleTerm);
  $('#idle-prompt')?.addEventListener('click', openTerm);
  registerCloser(closeTerm);
  onShell((cmd) => { openTerm(); if (cmd) submit(cmd); });
  let reopen = false;
  try { reopen = !!sessionStorage.getItem('term:open'); } catch { /* ignore */ }
  if (reopen) openTerm();
}
