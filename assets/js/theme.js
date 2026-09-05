import { $ } from './data.js';

export const getTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function setTheme(t) {
  if (t !== 'light' && t !== 'dark') return false;
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch { /* private mode */ }
  const n = $('#theme-name');
  if (n) n.textContent = t;
  return true;
}

export const toggleTheme = () => setTheme(getTheme() === 'dark' ? 'light' : 'dark');

export function initTheme() {
  const n = $('#theme-name');
  if (n) n.textContent = getTheme();
  $('#theme-toggle')?.addEventListener('click', toggleTheme);
}
