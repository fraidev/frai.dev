// A read-only view of the site as a tiny filesystem rooted at ~.
import { site } from './data.js';

const HOME = `/home/${site.handle}`;

const asFile = (p) => ({ name: `${p.slug}.md`, type: 'file', url: p.url, size: p.words, date: p.date, post: p });

export function entries(path) {
  if (path === '~') {
    return [
      { name: 'posts', type: 'dir', url: '/posts/', date: site.posts[0]?.date },
      { name: 'projects', type: 'dir', url: '/projects/' },
      { name: 'tags', type: 'dir', url: '/tags/' },
      { name: 'about.md', type: 'file', url: '/about/', size: 2048, text: [`# ${site.author} (${site.handle})`, '', site.about || site.description] },
      { name: 'contributions.md', type: 'file', url: '/contributions/', size: 4096, text: site.contrib?.total ? [`${site.contrib.total} merged pull requests in ${site.contrib.repos} repositories.`] : null },
      { name: 'README.md', type: 'file', size: 420 },
      { name: '.plan', type: 'file', size: 64, hidden: true },
      { name: '.zshrc', type: 'file', size: 512, hidden: true },
    ];
  }
  if (path === '~/posts') return site.posts.map(asFile);
  if (path === '~/projects') return (site.projects || []).map((p) => ({ name: `${p.slug}.md`, type: 'file', url: p.url, size: 1024, text: [`# ${p.title}`, p.desc, p.repo].filter(Boolean) }));
  if (path === '~/tags') return site.tags.map((t) => ({ name: t.name, type: 'dir', url: t.url, size: t.count }));
  const m = path.match(/^~\/tags\/([^/]+)$/);
  if (m) {
    const t = site.tags.find((x) => x.name === m[1]);
    if (!t) return null;
    return site.posts.filter((p) => (p.tags || []).includes(t.name)).map(asFile);
  }
  return null;
}

export function normalize(cwd, p) {
  if (!p) return '~';
  p = p.trim();
  if (p.startsWith(HOME)) p = '~' + p.slice(HOME.length);
  let parts;
  if (p === '~' || p.startsWith('~/')) parts = p.split('/');
  else if (p.startsWith('/')) parts = ['~', ...p.split('/').slice(1)];
  else parts = [...cwd.split('/'), ...p.split('/')];
  const out = [];
  for (const s of parts) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (out.length > 1) out.pop(); continue; }
    out.push(s);
  }
  if (out[0] !== '~') out.unshift('~');
  return out.join('/');
}

export function dirUrl(path) {
  if (path === '~') return '/';
  if (path === '~/posts') return '/posts/';
  if (path === '~/projects') return '/projects/';
  if (path === '~/tags') return '/tags/';
  const m = path.match(/^~\/tags\/([^/]+)$/);
  if (m) return site.tags.find((t) => t.name === m[1])?.url || null;
  return null;
}

export function stat(path) {
  const e = entries(path);
  if (e) return { name: path.split('/').pop(), type: 'dir', path, url: dirUrl(path), entries: e };
  const i = path.lastIndexOf('/');
  if (i < 0) return null;
  const parent = entries(path.slice(0, i));
  if (!parent) return null;
  const name = path.slice(i + 1);
  const ent = parent.find((x) => x.name === name || (x.type === 'file' && x.name === `${name}.md`));
  return ent ? { ...ent, path } : null;
}

export function fromLocation(pathname) {
  if (pathname.startsWith('/posts/')) return '~/posts';
  if (pathname.startsWith('/projects/')) return '~/projects';
  const m = pathname.match(/^\/tags\/([^/]+)\/?$/);
  if (m) {
    const t = site.tags.find((x) => x.url === pathname || x.url === `${pathname}/`);
    return t ? `~/tags/${t.name}` : '~/tags';
  }
  if (pathname.startsWith('/tags')) return '~/tags';
  return '~';
}

export const display = (path) => path.replace(/^~/, HOME);
