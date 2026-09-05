/**
 * The 6-button pad moves the EDITING BAR (the two-row toolbar), not the note.
 * ↑ top · ↓ bottom · ← left rail · → right rail · AI panel · − hide the bar.
 * Pressing the active side again returns the bar to the top.
 */

const KEY = 'nebula:layout';
export const SIDES = ['top', 'right', 'bottom', 'left'];

/** Pure state machine — tested. */
export function nextLayout(state, action) {
  const s = { bar: state.bar ?? 'top', barHidden: !!state.barHidden, ai: !!state.ai };
  if (action === 'ai') return { ...s, ai: !s.ai };
  if (action === 'hide') return { ...s, barHidden: !s.barHidden };
  if (SIDES.includes(action)) {
    return { ...s, barHidden: false, bar: s.bar === action ? 'top' : action };
  }
  return s;
}

export function initDock() {
  const shell = document.getElementById('edit-shell');
  const pad = document.getElementById('pad');
  const ai = document.getElementById('ai-panel');
  if (!shell || !pad) return null;

  let state = { bar: 'top', barHidden: false, ai: false };
  try {
    state = { ...state, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch { /* first run */ }

  function apply() {
    shell.classList.remove('bar-top', 'bar-right', 'bar-bottom', 'bar-left', 'bar-hidden');
    shell.classList.add(`bar-${state.bar}`);
    if (state.barHidden) shell.classList.add('bar-hidden');
    if (ai) ai.hidden = !state.ai;
    pad.querySelectorAll('button').forEach((b) => {
      const k = b.dataset.pad;
      const on = k === 'ai' ? state.ai : k === 'hide' ? state.barHidden : state.bar === k;
      b.classList.toggle('on', on);
    });
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  pad.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pad]');
    if (!btn) return;
    state = nextLayout(state, btn.dataset.pad);
    apply();
  });

  document.getElementById('ai-close')?.addEventListener('click', () => {
    state = nextLayout(state, 'ai');
    apply();
  });

  apply();
  return { get state() { return state; } };
}
