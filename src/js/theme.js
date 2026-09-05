const KEY = 'nebula:theme';

export function initTheme(btn) {
  const saved = localStorage.getItem(KEY);
  if (saved === 'ember') document.documentElement.dataset.theme = 'ember';

  btn?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'ember' ? 'paper' : 'ember';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(KEY, next);
  });
}

export function getTheme() {
  return document.documentElement.dataset.theme === 'ember' ? 'ember' : 'paper';
}
