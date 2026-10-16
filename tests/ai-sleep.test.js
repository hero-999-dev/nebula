/**
 * Sleeping AI tabs (0.9.4): when a tab nobody is looking at may be put to
 * sleep — that is, have its page loaded again later — and when that could lose
 * something. What the panel does with it is in tests/e2e/ai-sleep.mjs.
 */
import { describe, it, expect } from 'vitest';
import { SLEEP_AFTER_MS, isTemporaryChat, namesSavedChat, wouldLoseOnReload, shouldSleep, sleepAfterMs, cleanSiteName } from '../src/js/ai-services.js';

describe('an address that says the chat is not kept', () => {
  it('is ChatGPT’s temporary chat, Claude’s incognito, and their like', () => {
    expect(isTemporaryChat('https://chatgpt.com/?temporary-chat=true')).toBe(true);
    expect(isTemporaryChat('https://claude.ai/new?incognito')).toBe(true);
    expect(isTemporaryChat('https://example.org/app#temporary')).toBe(true);
    expect(isTemporaryChat('https://example.org/private-chat/new')).toBe(true);
  });

  it('is not an ordinary page, a page about privacy, or something that is no address', () => {
    expect(isTemporaryChat('https://chatgpt.com/')).toBe(false);
    expect(isTemporaryChat('https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    expect(isTemporaryChat('https://example.org/privacy')).toBe(false);
    expect(isTemporaryChat('nonsense')).toBe(false);
    expect(isTemporaryChat(null)).toBe(false);
  });
});

describe('an address that names one saved chat', () => {
  it('has a long id among its parts', () => {
    expect(namesSavedChat('https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(namesSavedChat('https://claude.ai/chat/123E4567-E89B-12D3-A456-426614174000')).toBe(true);
    expect(namesSavedChat('https://gemini.google.com/app/1a2b3c4d5e6f7a8b')).toBe(true);
    expect(namesSavedChat('https://copilot.microsoft.com/chats/Ab3dEf6hIj9kLmN')).toBe(true);
  });

  it('is not a start page, a word, or a number alone', () => {
    expect(namesSavedChat('https://chatgpt.com/')).toBe(false);
    expect(namesSavedChat('https://claude.ai/new')).toBe(false);
    expect(namesSavedChat('https://gemini.google.com/app')).toBe(false);
    expect(namesSavedChat('https://example.org/conversations/settings')).toBe(false);
    expect(namesSavedChat('https://example.org/2026/10/05/123456789012')).toBe(false);
    expect(namesSavedChat('')).toBe(false);
  });
});

describe('what loading a page again could lose', () => {
  const saved = 'https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000';

  it('nothing, on a page that was only read', () => {
    expect(wouldLoseOnReload({ url: 'https://claude.ai/new' })).toBe(false);
    expect(wouldLoseOnReload({ url: saved })).toBe(false);
  });

  it('a temporary chat, typed in or not', () => {
    expect(wouldLoseOnReload({ url: 'https://chatgpt.com/?temporary-chat=true' })).toBe(true);
  });

  it('what was typed where the address names no saved chat: a temporary chat that does not say so, or words never sent', () => {
    expect(wouldLoseOnReload({ url: 'https://gemini.google.com/app', typed: true, lastKeyEnter: true })).toBe(true);
    expect(wouldLoseOnReload({ url: 'https://claude.ai/new', typed: true })).toBe(true);
  });

  it('words typed in a saved chat and not sent — but not a message that was', () => {
    expect(wouldLoseOnReload({ url: saved, typed: true, lastKeyEnter: false })).toBe(true);
    expect(wouldLoseOnReload({ url: saved, typed: true, lastKeyEnter: true })).toBe(false);
  });

  it('a page that is playing sound, or still loading', () => {
    expect(wouldLoseOnReload({ url: saved, audible: true })).toBe(true);
    expect(wouldLoseOnReload({ url: saved, loading: true })).toBe(true);
  });
});

describe('when a tab sleeps', () => {
  const tab = { url: 'https://claude.ai/new', now: 10 * 60 * 60 * 1000 };

  it('after twenty minutes unseen, not before', () => {
    expect(SLEEP_AFTER_MS).toBe(20 * 60 * 1000);
    expect(shouldSleep({ ...tab, lastSeen: tab.now - SLEEP_AFTER_MS })).toBe(true);
    expect(shouldSleep({ ...tab, lastSeen: tab.now - SLEEP_AFTER_MS + 1 })).toBe(false);
  });

  it('never the one on screen, one the reader keeps awake, or one that would lose something', () => {
    const long = { ...tab, lastSeen: 0 };
    expect(shouldSleep({ ...long, onScreen: true })).toBe(false);
    expect(shouldSleep({ ...long, keepAwake: true })).toBe(false);
    expect(shouldSleep({ ...long, typed: true })).toBe(false);
    expect(shouldSleep({ ...long, url: 'https://chatgpt.com/?temporary-chat=true' })).toBe(false);
    expect(shouldSleep(long)).toBe(true);
  });

  it('after the time the reader set — and never, at 0', () => {
    expect(sleepAfterMs(null)).toBe(SLEEP_AFTER_MS);
    expect(sleepAfterMs('')).toBe(SLEEP_AFTER_MS);
    expect(sleepAfterMs('5')).toBe(5 * 60 * 1000);
    expect(sleepAfterMs('0')).toBe(Infinity);
    expect(sleepAfterMs('nonsense')).toBe(SLEEP_AFTER_MS);
    expect(sleepAfterMs('-3')).toBe(SLEEP_AFTER_MS);
    expect(shouldSleep({ ...tab, lastSeen: 0 }, sleepAfterMs('0'))).toBe(false);
    expect(shouldSleep({ ...tab, lastSeen: tab.now - 5 * 60 * 1000 }, sleepAfterMs('5'))).toBe(true);
  });
});

describe('a site name as the panel may keep it', () => {
  it('is one trimmed line, never endless — and never half an emoji (hunt B24)', () => {
    expect(cleanSiteName('  My   Chat ')).toBe('My   Chat');
    expect(cleanSiteName('x'.repeat(200))).toHaveLength(40);
    expect(cleanSiteName(`${'x'.repeat(39)}🌙 chat`)).toBe(`${'x'.repeat(39)}🌙`);
  });
});
