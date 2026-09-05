// Normal mode. Vim-ish keys for a page that is mostly text anyway.
import { $, go, isEditable } from './data.js';
import { closeAll, isOverlayOpen, toggleHelp } from './ui.js';
import { toggleTerm } from './term.js';
import { openCmdline, searchNext } from './vim.js';
import { openParty } from './party.js';

let seq = '';
let lastG = 0;

export function initKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditable(e.target)) return;
    if (e.key === 'Escape') { if (closeAll()) e.preventDefault(); return; }
    if (isOverlayOpen()) {
      if (e.key === 'q' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeAll(); }
      return;
    }
    const k = e.key;
    const step = Math.round(window.innerHeight * 0.12);
    switch (k) {
      case '!': case '`': e.preventDefault(); toggleTerm(); return;
      case ':': e.preventDefault(); openCmdline(':'); return;
      case '/': e.preventDefault(); openCmdline('/'); return;
      case '?': e.preventDefault(); toggleHelp(); return;
      case '~': e.preventDefault(); go('/'); return;
      case 'j': e.preventDefault(); window.scrollBy({ top: step }); break;
      case 'k': e.preventDefault(); window.scrollBy({ top: -step }); break;
      case 'G': e.preventDefault(); window.scrollTo({ top: document.documentElement.scrollHeight }); break;
      case 'g': {
        const now = Date.now();
        if (now - lastG < 600) { window.scrollTo({ top: 0 }); lastG = 0; } else lastG = now;
        break;
      }
      case 'h': {
        if (Date.now() - lastG < 600) { lastG = 0; e.preventDefault(); go('/'); break; }
        const a = $('#nav-older'); if (a) { e.preventDefault(); go(a.href); } break;
      }
      case 'l': { const a = $('#nav-newer'); if (a) { e.preventDefault(); go(a.href); } break; }
      case 'n': searchNext(1); break;
      case 'N': searchNext(-1); break;
      default: break;
    }
    if (k.length === 1) {
      seq = (seq + k).slice(-8);
      if (/ffxii$/i.test(seq) || /party$/i.test(seq)) { seq = ''; openParty(); }
    }
  });
}
