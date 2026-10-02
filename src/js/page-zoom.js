/**
 * How close the page is (0.9.3): the owner, "a zoom ratio for the pages,
 * beside the alignment, set off with a thin line like the others".
 *
 * The note's page is zoomed with CSS `zoom` on the editor — the text, the
 * pictures, the shapes and the page width all together, the way a paper is
 * brought closer; the window around it (Ctrl + / Ctrl −) is another thing.
 * Under `zoom`, Chromium reports pointer positions and rectangles in screen
 * pixels while a shape's or a picture's `left` / `width` are in the page's
 * own pixels: every drag in the page divides what the pointer travelled by
 * `editorZoom()` — or a shape at 150 % ran half as far again as the pointer.
 *
 * 100 % is the paper's real size (the owner: "the real-size scale should be
 * 100 %"): a centimetre on the paper is a centimetre on this screen, for every
 * paper. The main process reads the monitor's physical width (Windows reports
 * it) and the real factor is the screen's pixels per millimetre over CSS's (96
 * per inch), less whatever Ctrl + / Ctrl − has done to the whole window. Where
 * the screen cannot say, 100 % is CSS's 96 per inch.
 *
 * "Fit to page" (the owner: "at the top, and working however the window
 * changes — when I make it half the screen") makes the whole sheet as wide as
 * the note's frame, measured again whenever the frame changes size.
 *
 * Nebula Wide and Nebula Narrow are the old way (the owner): 100 % is the
 * screen's own size there, as it was before the papers came; Nebula Wide has
 * no sheet, so nothing to fit.
 *
 * The zoom belongs to the note (`note.zoom`: a percentage or 'fit'). Before
 * 100 % was the real size, actual size was 'actual'; it reads as 100.
 */

export const ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
export const DEFAULT_ZOOM = 100;
export const FIT = 'fit';
/** Room left beside the sheet when it is fitted, in the page's pixels. */
export const FIT_GUTTER = 12;

let realScale = 1;
let windowZoom = 1;
let fitScale = 1;
let realBased = true;

/** Whether 100 % is the paper's real size (the papers) or the screen's own (NW, NN). */
export function setRealBased(on) {
  realBased = on !== false;
  return realBased;
}
/** The CSS zoom that 100 % is. */
export function baseScale() { return realBased ? getRealScale() : 1; }

/** The factor that shows a CSS millimetre as a real one on this screen, at the window's own zoom 1. */
export function setRealScale(f) {
  realScale = Number.isFinite(f) && f >= 0.5 && f <= 3 ? f : 1;
  return realScale;
}
/** Ctrl + / Ctrl − (the window's zoom factor): real size takes it back out. */
export function setWindowZoom(z) {
  windowZoom = Number.isFinite(z) && z >= 0.2 && z <= 6 ? z : 1;
  return windowZoom;
}
/** The page zoom that is 100 %: a real millimetre on this screen, in this window. */
export function getRealScale() { return Math.round((realScale / windowZoom) * 1000) / 1000; }

/**
 * The actual-size factor from the screen's width and height in device-
 * independent pixels and the monitors' physical sizes in cm ({w, h}): one
 * monitor, or the one shaped like this screen. Implausible answers are 1.
 */
export function realScaleFor(dipWidth, dipHeight, monitors) {
  const usable = (monitors || []).filter((m) => m.w > 5 && m.h > 3);
  if (!usable.length || !dipWidth) return 1;
  const aspect = dipWidth / dipHeight;
  const m = usable.length === 1 ? usable[0]
    : usable.reduce((a, b) => (Math.abs(b.w / b.h - aspect) < Math.abs(a.w / a.h - aspect) ? b : a));
  const f = dipWidth / (m.w * 10 * (96 / 25.4));
  return f >= 0.5 && f <= 3 ? Math.round(f * 1000) / 1000 : 1;
}

/**
 * The page zoom that makes a sheet `sheetPx` wide (plus the gutter and the
 * scroll bar, in the page's pixels) exactly as wide as `frameWidth` screen pixels.
 */
export function fitFor(frameWidth, sheetPx, scrollbar = 0) {
  const need = sheetPx + 2 * FIT_GUTTER + Math.max(0, scrollbar);
  if (!(frameWidth > 0) || !(need > 0)) return 1;
  return Math.min(5, Math.max(0.2, Math.floor((frameWidth / need) * 1000) / 1000));
}
export function setFitScale(f) {
  fitScale = Number.isFinite(f) && f > 0 ? f : 1;
  return fitScale;
}

/** What a stored zoom means now: 'fit', or one of the offered percentages. */
export function normalizeZoom(value) {
  if (value === FIT) return FIT;
  if (value === 'actual') return DEFAULT_ZOOM;
  return clampZoom(value);
}

/** The CSS zoom a value means: fit, or a percentage of the real size. */
export function zoomFactor(value) {
  const v = normalizeZoom(value);
  return v === FIT ? fitScale : Math.round(baseScale() * v * 10) / 1000;
}

/** A percentage the app offers, the nearest one to what was asked. */
export function clampZoom(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p)) return DEFAULT_ZOOM;
  return ZOOM_STEPS.reduce((best, s) => (Math.abs(s - p) < Math.abs(best - p) ? s : best), DEFAULT_ZOOM);
}

/** The step before or after the given one (from fit to page: the step past where fit is). */
export function stepZoom(value, dir) {
  const v = normalizeZoom(value);
  if (v === FIT) {
    const pct = (fitScale / baseScale()) * 100;
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > pct + 0.5) : [...ZOOM_STEPS].reverse().find((s) => s < pct - 0.5);
    return next ?? (dir > 0 ? ZOOM_STEPS.at(-1) : ZOOM_STEPS[0]);
  }
  const i = ZOOM_STEPS.indexOf(v);
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)))];
}

/**
 * The page's zoom factor (1 = CSS's 96 per inch): what a distance on screen is
 * divided by to become a distance on the page.
 * @param {Element} [el] the editor or anything inside it
 */
export function editorZoom(el) {
  const ed = el?.closest?.('#editor') ?? el ?? (typeof document !== 'undefined' ? document.getElementById('editor') : null);
  const z = Number.parseFloat(ed?.style?.zoom || '');
  return Number.isFinite(z) && z > 0 ? z : 1;
}

export function applyZoom(editorEl, value) {
  const v = normalizeZoom(value);
  if (!editorEl) return v;
  const f = zoomFactor(v);
  editorEl.style.zoom = Math.abs(f - 1) < 0.001 ? '' : String(Math.round(f * 1000) / 1000);
  return v;
}

/**
 * The − / ratio / + beside the alignment buttons.
 * @param {{group: HTMLElement, editorEl: HTMLElement, frameEl?: HTMLElement,
 *   current: () => (number|string), choose: (v: number|string) => void,
 *   sheet?: () => number, windowZoom?: () => number, realSized?: () => boolean}} deps
 *   `sheet` is the open page's sheet width in CSS pixels, for fit to page (0: no
 *   sheet, no fit); `realSized` whether 100 % is the paper's real size.
 */
export function initZoomControl({ group, editorEl, frameEl = null, current, choose, sheet = () => 0, windowZoom: readWindowZoom = () => 1, realSized = () => true, translate = (x) => x, after = () => {} }) {
  if (!group) return null;
  const select = group.querySelector('select');
  const fit = document.createElement('option');
  fit.value = FIT;
  if (select && !select.options.length) {
    select.append(fit);
    for (const s of ZOOM_STEPS) {
      const o = document.createElement('option');
      o.value = String(s);
      o.textContent = `${s}%`;
      if (s === DEFAULT_ZOOM) o.title = translate('Actual size');
      select.append(o);
    }
  }
  const set = (v) => { choose(normalizeZoom(v)); paint(); };
  group.querySelector('[data-zoom="out"]')?.addEventListener('click', () => set(stepZoom(current(), -1)));
  group.querySelector('[data-zoom="in"]')?.addEventListener('click', () => set(stepZoom(current(), +1)));
  select?.addEventListener('change', () => set(select.value === FIT ? FIT : Number(select.value)));

  const scrollbar = () => Number.parseFloat(editorEl?.style.getPropertyValue('--sb') || '') || 0;
  function measureFit() {
    if (!frameEl) return;
    setFitScale(fitFor(frameEl.clientWidth, sheet(), scrollbar()));
  }
  // "Fit (25%)" (the owner): what fitting is, as a share of the real size, now.
  function labelFit() {
    fit.textContent = `${translate('Fit')} (${Math.round((fitScale / baseScale()) * 100)}%)`;
    fit.title = translate('Fit to page');
  }
  function paint() {
    setWindowZoom(readWindowZoom());
    setRealBased(realSized());
    const fits = sheet() > 0;
    fit.hidden = !fits;
    fit.disabled = !fits;
    let v = normalizeZoom(current());
    if (v === FIT && !fits) v = DEFAULT_ZOOM;     // Nebula Wide: no sheet to fit
    measureFit();                // the label shows it even when another zoom is chosen
    applyZoom(editorEl, v);
    if (select) select.value = String(v);
    after();                     // what is measured in the page's pixels, measured again
    // Fitted, the scroll bar measured at the new zoom may leave the sheet a hair too wide.
    if (v === FIT && frameEl && frameEl.scrollWidth > frameEl.clientWidth + 1) {
      setFitScale(Math.floor(fitScale * (frameEl.clientWidth / frameEl.scrollWidth) * 1000) / 1000);
      applyZoom(editorEl, v);
      after();
    }
    labelFit();
  }
  // The window made narrower or wider, the side panels opened or closed, or
  // Ctrl + / Ctrl −: fit to page is measured again, and real size corrected.
  if (frameEl && typeof ResizeObserver !== 'undefined') {
    let width = frameEl.clientWidth;
    let zoomWas = readWindowZoom();
    let queued = false;
    new ResizeObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const w = frameEl.clientWidth;
        const z = readWindowZoom();
        if (z !== zoomWas || (w !== width && normalizeZoom(current()) === FIT)) paint();
        else if (w !== width && sheet() > 0) { measureFit(); labelFit(); }
        width = w;
        zoomWas = z;
      });
    }).observe(frameEl);
  }
  paint();
  return { paint };
}
