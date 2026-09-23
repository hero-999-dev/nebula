import { describe, it, expect } from 'vitest';
import { normalizeUrl, isImageMime, linkLabel } from '../src/js/rich-paste.js';

describe('rich paste helpers', () => {
  it('normalizes only web URLs', () => {
    expect(normalizeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeUrl('www.example.com')).toBe('https://www.example.com/');
    expect(normalizeUrl('ftp://example.com')).toBe('');
    expect(normalizeUrl('javascript:alert(1)')).toBe('');
    expect(normalizeUrl('')).toBe('');
  });

  it('recognizes clipboard image types but not arbitrary files', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('image/jpeg')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
    expect(isImageMime('')).toBe(false);
  });

  it('makes compact labels for bookmark cards', () => {
    expect(linkLabel('https://example.com/docs?page=2')).toBe('example.com/docs?page=2');
    expect(linkLabel('not a url')).toBe('');
  });
});
