/**
 * Where the app's window may go (hunt B21). A plain click on a link in a part
 * of a note that is not editable took the window to that page, and the page
 * had the whole bridge; a link opening a new window handed any scheme to the
 * system, `file:` included.
 */
import { describe, it, expect } from 'vitest';
import { staysOnPage, externalUrl, popupGate } from '../electron/navigation.js';

const APP = 'file:///C:/Program%20Files/Nebula/resources/app.asar/dist/index.html';

describe('staysOnPage', () => {
  it('lets the window reload, or jump to a place on its own page', () => {
    expect(staysOnPage(APP, APP)).toBe(true);
    expect(staysOnPage(`${APP}#top`, APP)).toBe(true);
    expect(staysOnPage('http://localhost:5173/#x', 'http://localhost:5173/')).toBe(true);
  });

  it('never lets it go anywhere else', () => {
    expect(staysOnPage('http://127.0.0.1:8080/away', APP)).toBe(false);
    expect(staysOnPage('https://example.com/', APP)).toBe(false);
    expect(staysOnPage('file:///C:/Users/x/Downloads/page.html', APP)).toBe(false);
    expect(staysOnPage(`${APP}?x=1`, APP)).toBe(false);
    expect(staysOnPage('not a url', APP)).toBe(false);
    expect(staysOnPage(APP, undefined)).toBe(false);
  });
});

describe('externalUrl', () => {
  it('hands the browser a web or mail link', () => {
    expect(externalUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(externalUrl('http://example.com')).toBe('http://example.com/');
    expect(externalUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
  });

  it('never hands the system something it would run', () => {
    for (const bad of [
      'file:///C:/Windows/System32/calc.exe', 'file://attacker/share/x.exe', 'ms-settings:',
      'ms-msdt:/id PCWDiagnostic', 'search-ms:query=x', 'javascript:alert(1)', 'nebula-media://note/n1/a.pdf',
      '', null, 'nonsense',
    ]) expect(externalUrl(bad)).toBe('');
  });
});

describe('popupGate', () => {
  const clock = () => { let t = 1000; const now = () => t; now.add = (ms) => { t += ms; }; return now; };

  it('opens nothing a page asks for by itself (hunt B23: fifteen windows in two seconds)', () => {
    const gate = popupGate(clock());
    expect(gate.take('https://example.com/popup')).toBe('');
  });

  it('opens the link the user just pressed, in the browser, once', () => {
    const now = clock();
    const gate = popupGate(now);
    gate.touched();
    now.add(200);
    expect(gate.take('https://example.com/a')).toBe('https://example.com/a');
    expect(gate.take('https://example.com/b')).toBe('');
  });

  it('forgets a press after a moment', () => {
    const now = clock();
    const gate = popupGate(now);
    gate.touched();
    now.add(5000);
    expect(gate.take('https://example.com/a')).toBe('');
  });

  it('never hands the browser a scheme Windows would run, pressed or not', () => {
    const gate = popupGate(clock());
    gate.touched();
    expect(gate.take('ms-settings:display')).toBe('');
    expect(gate.take('file:///C:/x.exe')).toBe('');
  });
});
