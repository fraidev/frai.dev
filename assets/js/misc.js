import { $, $$, site } from './data.js';

export function initClock() {
  const el = $('#clock');
  if (!el) return;
  const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    el.textContent = `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}-${mons[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
    el.dateTime = d.toISOString();
  };
  tick();
  setInterval(tick, 30000);
}

export function initCopy(root = document) {
  for (const btn of $$('.codeblock-copy', root)) {
    if (btn.dataset.ready) continue;
    btn.dataset.ready = '1';
    btn.addEventListener('click', async () => {
      const pre = btn.closest('.codeblock')?.querySelector('pre');
      if (!pre) return;
      try {
        await navigator.clipboard.writeText(pre.innerText.replace(/\n$/, ''));
        btn.textContent = 'copied';
        btn.classList.add('is-done');
      } catch {
        btn.textContent = 'select it, then';
      }
      setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('is-done'); }, 1400);
    });
  }
}

export function initNotFound() {
  for (const el of $$('#nf-path, .nf-path')) el.textContent = location.pathname;
}

export function initConsole() {
  const c = site.theme?.primary || '#219fd5';
  console.log('%cfrai.dev%c  press ! for a shell, : for a command line, ? for help.', `color:${c};font-weight:bold`, 'color:inherit');
}
