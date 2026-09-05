const el = document.getElementById('site-data');
export const site = el ? JSON.parse(el.textContent) : {};
site.posts ||= [];
site.tags ||= [];
site.menu ||= [];
site.links ||= [];
site.theme ||= {};

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const go = (url) => { window.location.href = url; };
export const isEditable = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
