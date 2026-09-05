/** In-app askText — never window.prompt(). */

let resolver = null;

const ov = () => document.getElementById('ov-dialog');
const input = () => document.getElementById('dlg-input');

function settle(v) {
  if (!resolver) return;
  const r = resolver;
  resolver = null;
  ov().hidden = true;
  r(v);
}

export function initDialog() {
  document.getElementById('dlg-ok')?.addEventListener('click', () => settle(input().value));
  document.getElementById('dlg-cancel')?.addEventListener('click', () => settle(null));
  ov()?.addEventListener('click', (e) => { if (e.target === ov()) settle(null); });
  input()?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); settle(input().value); }
    if (e.key === 'Escape') { e.preventDefault(); settle(null); }
  });
}

export function askText(title, value = '') {
  if (resolver) settle(null);
  document.getElementById('dlg-title').textContent = title;
  input().value = value;
  ov().hidden = false;
  input().focus();
  input().select();
  return new Promise((res) => { resolver = res; });
}
