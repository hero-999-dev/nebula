import { describe, it, expect } from 'vitest';
import { persistName } from '../electron/session-name.js';

describe('persistName', () => {
  it('reads a saved partition off its folder, on Windows and elsewhere', () => {
    expect(persistName('C:\\Users\\x\\AppData\\Roaming\\nebula\\Partitions\\ai-chatgpt')).toBe('ai-chatgpt');
    expect(persistName('/home/x/.config/nebula/Partitions/embed/')).toBe('embed');
  });

  it('answers nothing for the app\'s own session, one in memory, or no path', () => {
    expect(persistName('C:\\Users\\x\\AppData\\Roaming\\nebula')).toBeNull();
    expect(persistName(null)).toBeNull();
    expect(persistName(undefined)).toBeNull();
    expect(persistName('')).toBeNull();
  });
});
