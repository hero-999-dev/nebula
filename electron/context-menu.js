/**
 * Right-click in the note (0.9.3): the word under a red underline gets its
 * suggestions, a picture can be copied, and the formatting bar still opens over
 * a selection.
 *
 * Only the main process knows what Chromium's spellchecker found, so the menu
 * starts here — but it is drawn by the page, in the app's own style and
 * language (src/js/context-menu.js). This passes over what was under the
 * pointer and carries out the three things the page cannot do by itself.
 */
import { clipboard, nativeImage, ClipboardItem } from 'electron';

/**
 * A picture onto the clipboard, and its HTML beside it when there is one.
 * Electron 44 took `clipboard.write({ image })` and `writeImage` away: the
 * clipboard is written as W3C ClipboardItems now, the PNG as a Blob (0.9.3).
 */
export function writeImageToClipboard(image, html = null) {
  const data = { 'image/png': new Blob([image.toPNG()], { type: 'image/png' }) };
  if (html) data['text/html'] = html;
  return clipboard.write([new ClipboardItem(data)]);
}

/** What the page needs from Chromium's context-menu params, and nothing else. */
export function menuFacts(params) {
  return {
    x: params.x,
    y: params.y,
    misspelledWord: String(params.misspelledWord || ''),
    suggestions: (params.dictionarySuggestions || []).slice(0, 8).map(String),
    isEditable: !!params.isEditable,
    mediaType: String(params.mediaType || 'none'),
    selectionText: String(params.selectionText || '').slice(0, 200),
  };
}

/**
 * The spellchecker language: the one the app is set to, and only that one
 * (the owner, 0.9.3: "suggestions and finding mistakes should follow the
 * chosen language"). English only when the chosen one has no dictionary here.
 */
export function spellLanguages(lang, available = []) {
  const want = { en: ['en-US', 'en-GB'], de: ['de-DE', 'de'], pl: ['pl', 'pl-PL'], tr: ['tr', 'tr-TR'] };
  const pick = (code) => (want[code] || []).find((tag) => available.includes(tag));
  const chosen = pick(lang) ?? pick('en');
  return chosen ? [chosen] : [];
}

/**
 * @param {Electron.BrowserWindow} win the note window
 */
export function installContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    if (win.isDestroyed()) return;
    win.webContents.send('ui:context-menu', menuFacts(params));
  });
}

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {() => Electron.BrowserWindow|null} getWindow only this window may ask
 */
export function registerEditingHandlers(ipcMain, getWindow) {
  const ours = (event) => event.sender === getWindow()?.webContents;

  // Chromium replaces the word it underlined; the page has already put the
  // note's undo step in place before asking.
  ipcMain.handle('spell:replace', (event, word) => {
    if (!ours(event) || typeof word !== 'string' || !word) return false;
    event.sender.replaceMisspelling(word);
    return true;
  });
  ipcMain.handle('spell:add', (event, word) => {
    if (!ours(event) || typeof word !== 'string' || !word.trim()) return false;
    return event.sender.session.addWordToSpellCheckerDictionary(word.trim());
  });
  ipcMain.handle('spell:language', (event, lang) => {
    if (!ours(event)) return [];
    const ses = event.sender.session;
    const langs = spellLanguages(String(lang || ''), ses.availableSpellCheckerLanguages || []);
    if (langs.length) {
      try { ses.setSpellCheckerLanguages(langs); } catch { /* the OS spellchecker picks its own */ }
    }
    return langs;
  });

  // A picture onto the clipboard as a picture (for Paint, Word, a chat) and as
  // HTML (for another note). The page sends it as a PNG data URL.
  ipcMain.handle('clipboard:image', async (event, { dataUrl, html } = {}) => {
    if (!ours(event) || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return false;
    const image = nativeImage.createFromDataURL(dataUrl);
    if (image.isEmpty()) return false;
    await writeImageToClipboard(image, typeof html === 'string' && html ? html : null);
    return true;
  });
}
