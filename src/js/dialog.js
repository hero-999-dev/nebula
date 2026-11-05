/** In-app askText and askConfirm — never window.prompt() or window.confirm(). */

import { t } from './i18n.js';

let resolver = null;

const ov = () => document.getElementById('ov-dialog');
const input = () => document.getElementById('dlg-input');
const ok = () => document.getElementById('dlg-ok');

function settle(v) {
  if (!resolver) return;
  const r = resolver;
  resolver = null;
  ov().hidden = true;
  r(v);
}

export function initDialog() {
  ok()?.addEventListener('click', () => settle(input().value));
  document.getElementById('dlg-cancel')?.addEventListener('click', () => settle(null));
  ov()?.addEventListener('click', (e) => { if (e.target === ov()) settle(null); });
  input()?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); settle(input().value); }
    if (e.key === 'Escape') { e.preventDefault(); settle(null); }
  });
  // A question with no box to type in: Escape still says no.
  ov()?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input().hidden) { e.preventDefault(); settle(null); }
  });
}

/** The same dialog with its box back and its button saying OK. */
function setUp(title, okLabel, typed) {
  if (resolver) settle(null);
  document.getElementById('dlg-title').textContent = title;
  input().hidden = !typed;
  ok().textContent = t(okLabel);
  ov().hidden = false;
}

export function askText(title, value = '') {
  setUp(title, 'OK', true);
  input().value = value;
  input().focus();
  input().select();
  return new Promise((res) => { resolver = res; });
}

/** "Are you sure?" — true only when the button saying `okLabel` is pressed. */
export function askConfirm(title, okLabel = 'OK') {
  setUp(title, okLabel, false);
  input().value = '';
  ok().focus();
  return new Promise((res) => { resolver = (v) => res(v !== null); });
}
