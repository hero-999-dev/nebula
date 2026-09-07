/**
 * The note list folds away behind the three lines beside "Nebula".
 *
 * The button lives inside the panel it hides, so it must stay visible when
 * everything else in the sidebar goes — see `#app.side-collapsed` in app.css.
 */
const KEY = 'nebula:side-collapsed';

export function initSideToggle(button, app = document.getElementById('app')) {
  if (!button || !app) return null;

  function paint(collapsed) {
    app.classList.toggle('side-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Show the note list' : 'Hide the note list';
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  let collapsed = false;
  try { collapsed = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }
  paint(collapsed);

  button.addEventListener('click', () => {
    collapsed = !collapsed;
    paint(collapsed);
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* this session only */ }
  });

  return { toggle: () => button.click(), isCollapsed: () => collapsed };
}
