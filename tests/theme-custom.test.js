/**
 * A theme of one's own (0.9.4): five picked colours, every token made from
 * them, and the profiles they are saved as. The editor's behaviour in the app
 * is in tests/e2e/v094.mjs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SLOTS, MATCHA, READY_PROFILES, SWATCHES, cleanHex, mix, luminance, contrast, toneOf, cleanColors,
  deriveTokens, hardToRead, cleanProfiles, saveProfile, profileOf, cleanProfileName,
} from '../src/js/theme-custom.js';
import { initTheme, readCustom, THEMES, CUSTOM } from '../src/js/theme.js';

describe('colours', () => {
  it('reads a colour however it is written, and nothing else', () => {
    expect(cleanHex('#a6e3a1')).toBe('#A6E3A1');
    expect(cleanHex('A6E3A1')).toBe('#A6E3A1');
    expect(cleanHex(' #abc ')).toBe('#AABBCC');
    expect(cleanHex('rgb(26, 36, 32)')).toBe('#1A2420');
    expect(cleanHex('#12345')).toBeNull();
    expect(cleanHex('green')).toBeNull();
    expect(cleanHex(null)).toBeNull();
  });

  it('mixes, and measures light and contrast the way WCAG does', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030');
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBe(0);
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 3);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});

describe('the five picks', () => {
  it('are Matcha where a pick is missing or broken, never nothing', () => {
    expect(cleanColors(null)).toEqual(MATCHA.colors);
    expect(cleanColors({ bg: '#fff', text: 'nonsense' })).toEqual({ ...MATCHA.colors, bg: '#FFFFFF' });
    expect(Object.keys(cleanColors({}))).toEqual(SLOTS);
  });

  it('Matcha is the Art Kit’s dark green with white words', () => {
    expect(MATCHA.colors.bg).toBe('#1A2420');
    expect(MATCHA.colors.accent).toBe('#A6E3A1');
    expect(toneOf(MATCHA.colors)).toBe('dark');
    expect(contrast(MATCHA.colors.text, MATCHA.colors.bg)).toBeGreaterThan(12);
    expect(READY_PROFILES).toContain(MATCHA);
    expect(SWATCHES).toHaveLength(28);
  });
});

describe('the tokens made from them', () => {
  it('give the stylesheet every surface and ink, in the picks’ own tones', () => {
    const tokens = deriveTokens(MATCHA.colors);
    expect(tokens['--paper']).toBe('#1A2420');
    expect(tokens['--paper-sunken']).toBe('#141C18');
    expect(tokens['--rule']).toBe('#35483C');
    expect(tokens['--clay']).toBe('#A6E3A1');
    expect(tokens['--ink']).toBe('#F1F6EE');
    expect(tokens['color-scheme']).toBe('dark');
    // Raised a little off the ground, the softer inks between the words and the ground.
    expect(luminance(tokens['--paper-raised'])).toBeGreaterThan(luminance(tokens['--paper']));
    expect(luminance(tokens['--ink-soft'])).toBeLessThan(luminance(tokens['--ink']));
    expect(luminance(tokens['--ink-faint'])).toBeLessThan(luminance(tokens['--ink-soft']));
    expect(contrast(tokens['--ink-soft'], tokens['--paper'])).toBeGreaterThan(4.5);
    for (const name of ['--paper-raised', '--ink-soft', '--ink-faint', '--clay-soft', '--on-clay']) expect(tokens[name]).toMatch(/^#[0-9A-F]{6}$/);
    expect(tokens['--shadow']).toMatch(/^rgba\(/);
  });

  it('write readable words on the accent, whatever accent was picked', () => {
    for (const accent of ['#A6E3A1', '#1E4D33', '#FFFFFF', '#0B0B0B', '#E8C547', '#58A6FF']) {
      for (const base of [MATCHA.colors, { bg: '#F7F7F7', dark: '#CFCFCF', lines: '#8E8E8E', accent, text: '#0B0B0B' }]) {
        const tokens = deriveTokens({ ...base, accent });
        expect(contrast(tokens['--on-clay'], accent), `${accent} on ${base.bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('know a light ground from a dark one', () => {
    const light = deriveTokens({ bg: '#F7F7F7', dark: '#CFCFCF', lines: '#8E8E8E', accent: '#1E4D33', text: '#0B0B0B' });
    expect(light['color-scheme']).toBe('light');
    expect(luminance(light['--paper-raised'])).toBeGreaterThan(luminance(light['--paper']));
    expect(toneOf({ bg: '#565656' })).toBe('dark');
  });

  it('say when the words cannot be read on their ground', () => {
    expect(hardToRead(MATCHA.colors)).toBe(false);
    expect(hardToRead({ ...MATCHA.colors, text: '#2B2B2B' })).toBe(true);
  });
});

describe('profiles', () => {
  it('are saved by name, and saved again under the same name with new colours', () => {
    let { profiles } = saveProfile([], '  My   night ', MATCHA.colors);
    expect(profiles).toEqual([{ name: 'My night', colors: MATCHA.colors }]);
    ({ profiles } = saveProfile(profiles, 'my night', { ...MATCHA.colors, accent: '#58a6ff' }));
    expect(profiles).toHaveLength(1);
    expect(profiles[0].colors.accent).toBe('#58A6FF');
    ({ profiles } = saveProfile(profiles, 'Second', MATCHA.colors));
    // In its place, and spelled the way it was typed last.
    expect(profiles.map((p) => p.name)).toEqual(['my night', 'Second']);
  });

  it('need a name, and cannot take a ready profile’s', () => {
    expect(saveProfile([], '   ', MATCHA.colors).error).toBe('name');
    expect(saveProfile([], 'matcha', MATCHA.colors).error).toBe('ready');
    expect(saveProfile([], 'matcha', MATCHA.colors).profiles).toEqual([]);
  });

  it('are kept only when they are whole', () => {
    expect(cleanProfiles([{ name: 'a', colors: {} }, { name: 'A', colors: {} }, { colors: MATCHA.colors }, 'x', { name: 'Matcha', colors: {} }]))
      .toEqual([{ name: 'a', colors: MATCHA.colors }]);
    expect(cleanProfiles('nonsense')).toEqual([]);
    expect(cleanProfileName('x'.repeat(80))).toHaveLength(32);
  });

  it('are known by their colours', () => {
    const mine = { name: 'Mine', colors: { ...MATCHA.colors, accent: '#58A6FF' } };
    expect(profileOf(MATCHA.colors)).toBe('Matcha');
    expect(profileOf(mine.colors, [mine])).toBe('Mine');
    expect(profileOf({ ...MATCHA.colors, text: '#FFFFFF' }, [mine])).toBeNull();
  });
});

describe('wearing a theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.profile;
    document.documentElement.dataset.theme = 'main';
  });

  const picker = () => {
    const group = document.createElement('div');
    group.innerHTML = THEMES.map((name) => `<button data-theme="${name}"></button>`).join('');
    const custom = document.createElement('button');
    return { group, custom };
  };

  it('has four fixed themes, Matcha no longer among them', () => {
    expect(THEMES).toEqual(['main', 'dark', 'light', 'white']);
  });

  it('wears the picks as inline tokens over the fixed theme of the same tone, and takes them off again', () => {
    const { group, custom } = picker();
    const theme = initTheme(group, { customButton: custom });
    const root = document.documentElement;
    theme.wearCustom({ name: 'Matcha', colors: MATCHA.colors });
    expect(theme.current()).toBe(CUSTOM);
    expect(root.dataset.theme).toBe('main');
    expect(root.dataset.profile).toBe('custom');
    expect(root.style.getPropertyValue('--paper')).toBe('#1A2420');
    expect(root.style.getPropertyValue('--on-clay')).toMatch(/^#/);
    expect(custom.classList.contains('on')).toBe(true);
    expect(group.querySelector('.on')).toBeNull();
    expect(localStorage.getItem('nebula:theme')).toBe('custom');
    expect(readCustom()).toEqual({ name: 'Matcha', colors: MATCHA.colors });
    // A light ground rides on the light theme.
    theme.wearCustom({ colors: { bg: '#F7F7F7', dark: '#CFCFCF', lines: '#8E8E8E', accent: '#1E4D33', text: '#0B0B0B' } });
    expect(root.dataset.theme).toBe('light');
    // Back to a fixed theme: nothing of the custom one is left on the page.
    group.querySelector('[data-theme="dark"]').click();
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.profile).toBeUndefined();
    expect(root.style.getPropertyValue('--paper')).toBe('');
    expect(root.style.getPropertyValue('--on-clay')).toBe('');
    expect(custom.classList.contains('on')).toBe(false);
    expect(localStorage.getItem('nebula:theme')).toBe('dark');
  });

  it('comes back as it was left, and a test build’s "matcha" is the custom theme', () => {
    localStorage.setItem('nebula:theme', 'matcha');
    const { group, custom } = picker();
    const theme = initTheme(group, { customButton: custom });
    expect(theme.current()).toBe(CUSTOM);
    expect(document.documentElement.style.getPropertyValue('--clay')).toBe('#A6E3A1');
  });
});
