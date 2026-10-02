/**
 * The export preview (0.9.3).
 *
 * The owner: "when a Nebula Wide note is exported, two choices — a preview of
 * which page and which style the export will be, in a panel that suits the
 * app — landscape or portrait", then "a preview for docx and odt too". Every
 * export that makes pages opens it: PDF, Word (.docx, .doc), OpenDocument
 * (.odt) and Rich Text (.rtf). The main process prints a document to a PDF and
 * shows that very file here, in Chromium's PDF viewer:
 *
 *   PDF    the note's own print document — Export saves exactly these pages;
 *   others the file's blocks in the file's own styles on the same paper
 *          (office.js previewDocument) — Export writes the file itself.
 *
 * A paper note's sheet is its paper, said above the pages. Nebula Wide has no
 * paper on screen, so it chooses: A4 across (landscape) or upright (portrait),
 * remembered for the next export and for printing. A note with videos chooses
 * too: with them (as they show) or without (their links only).
 */
import { getWideOrientation, setWideOrientation, isFluid, pageMode, sheetMm, marginMm } from './page-mode.js';
import { getVideoMode, setVideoMode } from './export-video.js';

const ORIENTATION_KEY = 'nebula:nw-orientation';

/** The exports that make pages, and what the preview's title calls them. */
export const PAGED = {
  pdf: 'Export as PDF',
  docx: 'Export as Word (.docx)',
  odt: 'Export as OpenDocument (.odt)',
  doc: 'Export as Word 97–2003 (.doc)',
  rtf: 'Export as Rich Text (.rtf)',
};

/** The remembered choice, read once at start. */
export function restoreWideOrientation(storage = globalThis.localStorage) {
  try { return setWideOrientation(storage?.getItem(ORIENTATION_KEY)); } catch { return getWideOrientation(); }
}

/** What the preview says the sheet is: "A4 · 210 × 297 mm · 12.7 mm margins". */
export function paperLine(page, translate = (x) => x) {
  const [w, h] = sheetMm(page);
  const m = pageMode(page);
  const name = m.fluid || m.id === 'nn' ? 'A4' : m.name;
  const margin = String(marginMm(page)).replace(/\.0+$/, '');
  return `${name} · ${w} × ${h} mm · ${margin} mm ${translate('margins')}`;
}

/**
 * @param {{ overlay: HTMLElement, api: object, page: () => string,
 *   document: (format: string) => Promise<string>, save: (format: string, token: string) => Promise<{ok:boolean}>,
 *   hasVideos?: () => boolean, onOrientation?: () => void, translate?: (s: string) => string }} deps
 *   `document` makes what the preview prints for that format, as things are now;
 *   `save` writes the export (the PDF's own bytes are saved by token).
 */
export function initPdfPreview({ overlay, api, page, document: build, save, hasVideos = () => false, onOrientation = () => {}, translate = (x) => x }) {
  if (!overlay) return null;
  const frame = overlay.querySelector('.pdf-frame');
  const status = overlay.querySelector('.pdf-status');
  const paper = overlay.querySelector('.pdf-paper');
  const heading = overlay.querySelector('.dlg-title');
  const orient = overlay.querySelector('[data-orient-group]');
  const videos = overlay.querySelector('.pdf-videos');
  const exportBtn = overlay.querySelector('[data-pdf="export"]');
  let token = null;
  let format = 'pdf';
  let round = 0;                 // a newer render wins over a slower older one
  let restoreFocus = null;

  function say(text) {
    status.textContent = text;
    status.hidden = !text;
  }
  async function discard() {
    const t = token;
    token = null;
    frame.querySelector('webview')?.remove();
    if (t) await api.pdfDiscard?.(t);
  }
  function paintChoices() {
    for (const b of orient.querySelectorAll('button')) {
      const on = b.dataset.orient === getWideOrientation();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    for (const b of videos?.querySelectorAll('button') ?? []) {
      const on = b.dataset.videos === getVideoMode();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  async function render() {
    const mine = ++round;
    exportBtn.disabled = true;
    await discard();
    say(translate('Preparing the pages…'));
    paper.textContent = paperLine(page(), translate);
    paintChoices();
    let res = null;
    try { res = await api.pdfPreview({ document: await build(format) }); } catch { res = null; }
    if (mine !== round || overlay.hidden) { if (res?.token) void api.pdfDiscard?.(res.token); return; }
    if (!res?.ok) { say(translate('The preview could not be made')); return; }
    token = res.token;
    const view = document.createElement('webview');
    // The PDF viewer is a plugin; the preview's own session follows no link and opens nothing.
    view.setAttribute('plugins', '');
    view.setAttribute('partition', 'nebula-pdf-preview');
    view.className = 'pdf-view';
    view.src = `${res.url}#toolbar=0&navpanes=0&view=FitH`;
    view.addEventListener('did-finish-load', () => { if (mine === round) say(''); });
    frame.append(view);
    exportBtn.disabled = false;
  }
  async function close() {
    round += 1;
    overlay.hidden = true;
    await discard();
    restoreFocus?.focus?.();
  }

  function open(which = 'pdf') {
    format = PAGED[which] ? which : 'pdf';
    restoreFocus = document.activeElement;
    heading.textContent = translate(PAGED[format]);
    orient.hidden = !isFluid(page());
    if (videos) videos.hidden = !hasVideos();
    overlay.hidden = false;
    exportBtn.focus();
    void render();
  }

  for (const b of orient.querySelectorAll('button')) {
    b.addEventListener('click', () => {
      if (b.dataset.orient === getWideOrientation()) return;
      setWideOrientation(b.dataset.orient);
      try { localStorage.setItem(ORIENTATION_KEY, getWideOrientation()); } catch { /* kept for this run */ }
      onOrientation();
      void render();
    });
  }
  for (const b of videos?.querySelectorAll('button') ?? []) {
    b.addEventListener('click', () => {
      if (b.dataset.videos === getVideoMode()) return;
      setVideoMode(b.dataset.videos);
      void render();
    });
  }
  exportBtn.addEventListener('click', async () => {
    if (!token) return;
    exportBtn.disabled = true;
    const res = await save(format, token);
    if (res?.ok) { if (format === 'pdf') token = null; await close(); } else exportBtn.disabled = false;
  });
  overlay.querySelector('[data-pdf="cancel"]').addEventListener('click', () => { void close(); });
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) void close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) { e.preventDefault(); e.stopPropagation(); void close(); }
  }, true);

  return { open, close, isOpen: () => !overlay.hidden, format: () => format };
}
