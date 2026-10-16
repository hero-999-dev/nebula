/**
 * What a web page inside the app may have without being asked (hunt B22). The
 * list was set on the app window's session only; an embed in a note and an AI
 * tab each have their own, which granted everything — a page embedded in a
 * note had the microphone and read the clipboard.
 */
import { describe, it, expect } from 'vitest';
import { allowed, isChatSession, isEmbedSession, askKeys, checkKey, pageAnswers, askWords, PRESS_MS } from '../electron/permissions.js';

describe('allowed', () => {
  it('lets any page go full screen, lock the pointer and copy', () => {
    for (const p of ['fullscreen', 'pointerLock', 'clipboard-sanitized-write']) {
      expect(allowed(p)).toBe(true);
      expect(allowed(p, { chat: true })).toBe(true);
    }
  });

  it('never gives an embedded page the microphone, the clipboard or the location', () => {
    for (const p of ['media', 'clipboard-read', 'geolocation', 'notifications', 'midiSysex', 'hid', 'serial', 'usb', 'local-fonts', 'display-capture', 'idle-detection']) {
      expect(allowed(p)).toBe(false);
    }
  });

  it('gives a chat tab its voice and its notifications, and still not the clipboard', () => {
    expect(allowed('media', { chat: true })).toBe(true);
    expect(allowed('notifications', { chat: true })).toBe(true);
    expect(allowed('clipboard-read', { chat: true })).toBe(false);
    expect(allowed('geolocation', { chat: true })).toBe(false);
  });

  it('hands Windows a web or mail link only', () => {
    expect(allowed('openExternal', { externalURL: 'mailto:a@b.c' })).toBe(true);
    expect(allowed('openExternal', { chat: true, externalURL: 'ms-msdt:/id PCWDiagnostic' })).toBe(false);
    expect(allowed('openExternal', { externalURL: 'file://attacker/share/x.exe' })).toBe(false);
    expect(allowed('openExternal')).toBe(false);
  });
});

describe('isChatSession', () => {
  it('knows an AI tab by its folder', () => {
    expect(isChatSession('C:\\Users\\x\\AppData\\Roaming\\nebula\\Partitions\\ai-chatgpt')).toBe(true);
    expect(isChatSession('/home/x/.config/nebula/Partitions/ai-my_custom-1/')).toBe(true);
  });

  it('never mistakes an embed, the PDF preview or the app window for one', () => {
    expect(isChatSession('C:\\Users\\x\\AppData\\Roaming\\nebula\\Partitions\\embed')).toBe(false);
    expect(isChatSession('C:\\Users\\x\\AppData\\Roaming\\nebula')).toBe(false);
    expect(isChatSession('C:\\Users\\x\\AppData\\Roaming\\nebula\\Partitions\\ai-x\\sub')).toBe(false);
    expect(isChatSession(null)).toBe(false);
    expect(isChatSession('')).toBe(false);
  });
});

describe('an embedded page asks (owner, 2026-10-16; hunt B25)', () => {
  const clock = () => { let t = 1000; const now = () => t; now.add = (ms) => { t += ms; }; return now; };
  const MIC = askKeys('media', { url: 'https://meet.example/room', mediaTypes: ['audio'] });

  it('knows the embed session by its folder, and nothing else', () => {
    expect(isEmbedSession('C:\\Users\\x\\AppData\\Roaming\\nebula\\Partitions\\embed')).toBe(true);
    expect(isEmbedSession('/home/x/.config/nebula/Partitions/embed/')).toBe(true);
    expect(isEmbedSession('C:\\Users\\x\\AppData\\Roaming\\nebula\\Partitions\\ai-chatgpt')).toBe(false);
    expect(isEmbedSession('C:\\Users\\x\\AppData\\Roaming\\nebula\\Partitions\\embed\\sub')).toBe(false);
    expect(isEmbedSession(null)).toBe(false);
  });

  it('asks about the microphone and the camera separately, per site', () => {
    expect(MIC).toEqual(['https://meet.example media:audio']);
    expect(askKeys('media', { url: 'https://meet.example/', mediaTypes: ['video', 'audio'] })).toEqual(['https://meet.example media:audio', 'https://meet.example media:video']);
    expect(askKeys('media', { url: 'https://meet.example/' })).toHaveLength(2);
    expect(askKeys('notifications', { url: 'https://news.example/a' })).toEqual(['https://news.example notifications']);
    expect(askKeys('geolocation', { url: 'https://x.example/' })).toEqual([]);
    expect(askKeys('media', { url: 'about:blank' })).toEqual([]);
    expect(checkKey('media', { origin: 'https://meet.example', mediaType: 'audio' })).toBe(MIC[0]);
    expect(checkKey('media', { origin: 'https://meet.example', mediaType: 'unknown' })).toBe('');
    expect(checkKey('clipboard-read', { origin: 'https://meet.example' })).toBe('');
  });

  it('asks only right after a press in the page, one question at a time', () => {
    const now = clock();
    const page = pageAnswers(now);
    expect(page.decide(MIC)).toBe('deny');
    page.pressed();
    expect(page.decide(MIC)).toBe('ask');
    page.asking(true);
    expect(page.decide(MIC)).toBe('deny');
    page.asking(false);
    now.add(PRESS_MS + 1);
    expect(page.decide(MIC)).toBe('deny');
    expect(page.decide([])).toBe('deny');
  });

  it('keeps a yes or a no only while the page is open', () => {
    const now = clock();
    const page = pageAnswers(now);
    page.answer(MIC, false);
    page.pressed();
    expect(page.decide(MIC)).toBe('deny');
    page.reset();
    page.pressed();
    expect(page.decide(MIC)).toBe('ask');
    page.answer(MIC, true);
    expect(page.decide(MIC)).toBe('allow');
    expect(page.granted(MIC[0])).toBe(true);
    expect(page.granted('https://meet.example media:video')).toBe(false);
    page.reset();
    expect(page.granted(MIC[0])).toBe(false);
    expect(page.decide(MIC)).toBe('deny');
  });

  it('drops an answer given to a page that has since reloaded', () => {
    const page = pageAnswers(clock());
    const load = page.load();
    page.reset();
    page.answer(MIC, true, load);
    expect(page.granted(MIC[0])).toBe(false);
  });

  it('names the site and what it wants', () => {
    expect(askWords('media', { url: 'https://meet.example/r', mediaTypes: ['audio'] }).message).toBe('meet.example wants to use your microphone');
    expect(askWords('media', { url: 'https://meet.example/r', mediaTypes: ['audio', 'video'] }).message).toBe('meet.example wants to use your microphone and camera');
    expect(askWords('media', { url: 'https://meet.example/r', mediaTypes: ['video'] }).message).toBe('meet.example wants to use your camera');
    expect(askWords('notifications', { url: 'http://127.0.0.1:8080/' }).message).toBe('127.0.0.1:8080 wants to show notifications');
    expect(askWords('notifications', {}).message).toBe('A page in this note wants to show notifications');
  });

  it('asks in the app’s language (hunt B26)', () => {
    expect(askWords('media', { url: 'https://meet.example/r', mediaTypes: ['audio'], lang: 'tr' }).message).toBe('meet.example mikrofonunuzu kullanmak istiyor');
    expect(askWords('media', { url: 'https://meet.example/r', mediaTypes: ['audio', 'video'], lang: 'pl' }).message).toBe('meet.example chce korzystać z Twojego mikrofonu i kamery');
    expect(askWords('notifications', { url: 'https://news.example/a', lang: 'de' }).message).toBe('news.example möchte Benachrichtigungen anzeigen');
    expect(askWords('notifications', { lang: 'tr' }).message).toBe('Bu not içine gömülü bir sayfa bildirim göstermek istiyor');
    expect(askWords('notifications', { lang: 'de' }).detail).toBe('Eine in diese Notiz eingebettete Seite fragt nach. Nichts wird gemerkt: Wenn diese Seite wieder geöffnet wird, fragt sie erneut.');
  });
});
