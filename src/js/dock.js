/**
 * The 6-button pad moves the EDITING BAR (the two-row toolbar), not the note.
 * ↑ top · ↓ bottom · ← left rail · → right rail · AI panel · − hide the bar.
 * Pressing the active side again returns the bar to the top.
 */

import { on } from './bus.js';
import { readSettings } from './settings.js';

const KEY = 'nebula:layout';
export const SIDES = ['top', 'right', 'bottom', 'left'];
/** As long and as eased as the left panel's width (app.css, `.side`). */
const AI_SLIDE = { duration: 140, easing: 'ease' };
/** A frame this short (ms) after the one before it is an even one; two in a row and the panel comes in. */
const AI_EVEN_FRAME = 24;
/** On the panel while it slides in: its chat is opened when this is gone (main.js). */
export const ARRIVING = 'ai-panel--arriving';
/** The longest (ms) the panel waits at the edge for that. */
const AI_WAIT = 400;

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
  // Settings → Hide the AI panel (0.9.4): the panel is shut and its button is not in the pad.
  let aiAway = readSettings().hideAi;
  if (aiAway) state = { ...state, ai: false };

  /* The panel slides as the left one does (the owner, 1.0.4: "the AI panel does
     not open as smoothly as the Nebula panel on the left"). It moves in from the
     window's edge at its own width, so the chat inside is never laid out
     narrower; `hidden` is set at once on the way in and when the slide out ends.
     Not at boot, not when Settings puts the panel away, not for reduced motion.
     Coming in, it waits at the edge until the window draws evenly again (the owner,
     later that day: "it still does not flow in like the left one"): showing the
     panel wakes its chat page, the window stood still for most of the 140 ms
     meanwhile, and the panel was seen in two or three jumps. Going out was even.
     (The other half of that was the whole app scrolling aside: app.css, #app.)
     And the chat is woken only once the panel has arrived (the owner again: "the
     left one has an animation coming and going, the AI panel has none coming"):
     while it comes the panel carries `ai-panel--arriving`, and main.js opens the
     chat when that is gone. The left panel moves whatever the system says of
     motion, so this one does too. */
  let leaving = null;
  let entering = null;
  let booted = false;
  function showAi(open, slide) {
    if (!ai) return;
    leaving?.cancel();
    leaving = null;
    entering?.cancel();
    entering = null;
    ai.classList.remove(ARRIVING);
    const still = !slide || !booted || typeof ai.animate !== 'function';
    if (open) {
      const was = ai.hidden;
      if (was && !still) ai.classList.add(ARRIVING);
      ai.hidden = false;
      if (!was || still) return;
      const slideIn = ai.animate([{ marginRight: `${-ai.offsetWidth}px` }, { marginRight: '0px' }], { ...AI_SLIDE, fill: 'backwards' });
      slideIn.pause();
      entering = slideIn;
      slideIn.onfinish = slideIn.oncancel = () => {
        if (entering !== slideIn) return;
        entering = null;
        ai.classList.remove(ARRIVING);
      };
      const began = performance.now();
      let last = began;
      let even = 0;
      const wait = () => {
        if (entering !== slideIn) return;
        const now = performance.now();
        even = now - last < AI_EVEN_FRAME ? even + 1 : 0;
        last = now;
        if (even >= 2 || now - began > AI_WAIT) slideIn.play(); else requestAnimationFrame(wait);
      };
      requestAnimationFrame(wait);
      return;
    }
    if (ai.hidden) return;
    if (still) { ai.hidden = true; return; }
    leaving = ai.animate([{ marginRight: '0px' }, { marginRight: `${-ai.offsetWidth}px` }], AI_SLIDE);
    leaving.onfinish = () => { leaving = null; ai.hidden = true; };
  }

  function apply() {
    shell.classList.remove('bar-top', 'bar-right', 'bar-bottom', 'bar-left', 'bar-hidden');
    shell.classList.add(`bar-${state.bar}`);
    if (state.barHidden) shell.classList.add('bar-hidden');
    showAi(state.ai && !aiAway, !aiAway);
    pad.classList.toggle('pad--no-ai', aiAway);
    pad.querySelectorAll('button').forEach((b) => {
      const k = b.dataset.pad;
      const on = k === 'ai' ? state.ai : k === 'hide' ? state.barHidden : state.bar === k;
      b.classList.toggle('on', on);
      if (k === 'ai') b.hidden = aiAway;
    });
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  pad.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pad]');
    if (!btn) return;
    // Put away: nothing opens it — not the menu's "Toggle AI panel" either, which presses this button.
    if (btn.dataset.pad === 'ai' && aiAway) return;
    state = nextLayout(state, btn.dataset.pad);
    apply();
  });

  document.getElementById('ai-close')?.addEventListener('click', () => {
    state = nextLayout(state, 'ai');
    apply();
  });

  on('settings-changed', ({ settings } = {}) => {
    const away = !!settings?.hideAi;
    if (away === aiAway) return;
    aiAway = away;
    // Shut as it goes, and shut when it comes back: it opens when its button is pressed.
    state = { ...state, ai: false };
    apply();
  });

  apply();
  booted = true;
  return { get state() { return state; }, get aiAway() { return aiAway; } };
}
