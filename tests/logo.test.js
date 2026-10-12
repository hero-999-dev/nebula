/**
 * The logo in colours of one's own (0.9.4): the picks, the drawing, and what a
 * theme makes of it (src/js/logo.js) — and the ready profiles of Your own
 * theme, Contrast among them, which can be put on it (theme-custom.js).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  LOGO_SLOTS, LOGO_SIZES, OWN_LOGO, FIXED_THEMES, cleanLogo, sameLogo, logoFromTheme, logoSvg, logoDataUrl,
  cleanLogoName, cleanLogoThemes, saveLogoTheme, renameLogoTheme, nextLogoName,
} from '../src/js/logo.js';
import { MATCHA, CONTRAST, READY_PROFILES, readyProfiles, cleanProfiles, saveProfile, profileOf, contrast, toneOf, hardToRead, mix } from '../src/js/theme-custom.js';
import { ICON_SIZES, LOGO_SLOTS as MAIN_SLOTS } from '../electron/app-logo.js';

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

describe('Nebula’s own logo', () => {
  it('is the icon that ships: the palettes the icon is built from, the star where the crescent’s colour has run three fifths of its way', () => {
    const ps1 = read('build/make-icon.ps1');
    const palette = (name) => new RegExp(`${name}\\s*=\\s*@\\{\\s*tile = '(#\\w{6})'; edge = '(#\\w{6})'; from = '(#\\w{6})'; to = '(#\\w{6})'`).exec(ps1).slice(1);
    for (const [own, name] of [[OWN_LOGO.main, 'violet'], [OWN_LOGO.test, 'iris']]) {
      const [tile, edge, from, to] = palette(name);
      expect([own.bg, own.edge, own.moon, own.shade]).toEqual([tile, edge, from, to]);
      // Within a step of rounding of the gradient there.
      const there = mix(from, to, 0.617);
      for (const i of [1, 3, 5]) expect(Math.abs(parseInt(own.star.slice(i, i + 2), 16) - parseInt(there.slice(i, i + 2), 16))).toBeLessThanOrEqual(1);
    }
  });

  it('has five colours to pick, the same five the main process keeps, in every size an icon holds', () => {
    expect(LOGO_SLOTS).toEqual(['bg', 'edge', 'moon', 'shade', 'star']);
    expect(MAIN_SLOTS).toEqual(LOGO_SLOTS);
    expect(LOGO_SIZES).toEqual(ICON_SIZES);
    expect(LOGO_SIZES).toEqual([256, 64, 48, 32, 24, 16]);
  });

  it('takes a broken pick for Nebula’s own, and any way of writing a colour', () => {
    expect(cleanLogo(null)).toEqual(OWN_LOGO.main);
    expect(cleanLogo({ bg: 'fff', star: 'nonsense', moon: 'rgb(1, 2, 3)' })).toEqual({ ...OWN_LOGO.main, bg: '#FFFFFF', moon: '#010203' });
    expect(cleanLogo({}, OWN_LOGO.test)).toEqual(OWN_LOGO.test);
    expect(sameLogo(OWN_LOGO.main, { ...OWN_LOGO.main, bg: OWN_LOGO.main.bg.toLowerCase() })).toBe(true);
    expect(sameLogo(OWN_LOGO.main, { ...OWN_LOGO.main, star: '#FFFFFF' })).toBe(false);
  });
});

describe('the drawing', () => {
  it('is the icon’s own geometry: the tile, its edge, the crescent filled from its light end to its dark one, and the star', () => {
    const svg = logoSvg(OWN_LOGO.main);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    const root = doc.documentElement;
    expect([root.getAttribute('width'), root.getAttribute('height'), root.getAttribute('viewBox')]).toEqual(['256', '256', '0 0 256 256']);
    const tile = doc.querySelector('rect');
    expect(tile.getAttribute('fill')).toBe('#17122A');
    expect(tile.getAttribute('stroke')).toBe('#2A2145');
    expect(tile.getAttribute('rx')).toBe('48');                                  // 18.75 % of 256
    expect(Number(tile.getAttribute('x'))).toBeCloseTo(1.28);                    // half a percent in
    const stops = [...doc.querySelectorAll('stop')].map((s) => s.getAttribute('stop-color'));
    expect(stops).toEqual(['#C9B6FF', '#7C3AED']);
    const [crescent, star] = doc.querySelectorAll('g path');
    expect(crescent.getAttribute('fill')).toBe('url(#m)');
    expect(star.getAttribute('fill')).toBe('#996AF4');
    // The mark is the one the app draws everywhere (icons.js).
    const icons = read('src/js/icons.js');
    expect(icons).toContain(crescent.getAttribute('d'));
    expect(icons).toContain(star.getAttribute('d'));
    // 18 units fitted to 62 % of the tile, centred on the mark's own middle.
    expect(doc.querySelector('g').getAttribute('transform')).toBe(`translate(128 128) scale(${((256 * 0.62) / 18).toFixed(4)}) translate(-11 -12)`);
  });

  it('wears the colours it is given, in each slot', () => {
    const picked = { bg: '#010101', edge: '#020202', moon: '#030303', shade: '#040404', star: '#050505' };
    const svg = logoSvg(picked, 64);
    for (const hex of Object.values(picked)) expect(svg.split(hex).length - 1).toBe(1);
    expect(svg).toContain('width="64" height="64"');
  });

  it('leaves the hairline edge out where it would be the whole tile, and keeps it a hairline where it is drawn', () => {
    expect(logoSvg(OWN_LOGO.main, 16)).not.toContain('stroke=');
    expect(logoSvg(OWN_LOGO.main, 24)).not.toContain('stroke=');
    expect(logoSvg(OWN_LOGO.main, 32)).toContain('stroke-width="8"');            // one device pixel of 32
    expect(logoSvg(OWN_LOGO.main, 256)).toContain('stroke-width="2"');           // two of 256, as the icon has it
  });

  it('is an address an <img> can show, with nothing in it that could end the address', () => {
    const url = logoDataUrl({ ...OWN_LOGO.main, bg: '"><script>' }, 32);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toBe(logoSvg(OWN_LOGO.main, 32));
    expect(url).not.toMatch(/[<>"]/);
  });
});

describe('a theme put on the logo', () => {
  it('the tile is its darkest tone, the edge its lines, the crescent its accent, the star its words', () => {
    expect(logoFromTheme(MATCHA.colors)).toEqual({ bg: '#141C18', edge: '#35483C', moon: mix('#A6E3A1', '#F1F6EE', 0.25), shade: '#A6E3A1', star: '#F1F6EE' });
  });

  it('Contrast comes out as one dark tone on a light tile', () => {
    const logo = logoFromTheme(CONTRAST.colors);
    expect(logo).toEqual({ bg: '#F7F7F7', edge: '#2B2B2B', moon: '#2B2B2B', shade: '#2B2B2B', star: '#2B2B2B' });
    expect(contrast(logo.moon, logo.bg)).toBeGreaterThan(12);
  });

  it('whatever the theme, the crescent and the star can be told from the tile', () => {
    for (const theme of [...Object.values(FIXED_THEMES), ...READY_PROFILES.map((p) => p.colors)]) {
      const logo = logoFromTheme(theme);
      expect(contrast(logo.shade, logo.bg)).toBeGreaterThan(3);
      expect(contrast(logo.star, logo.bg)).toBeGreaterThan(3);
      expect(cleanLogo(logo)).toEqual(logo);
    }
  });

  it('a theme with a colour missing still makes a whole logo', () => {
    expect(cleanLogo(logoFromTheme({}))).toEqual(logoFromTheme({}));
    expect(logoFromTheme({ accent: '#ff0000' })).toMatchObject({ shade: '#FF0000', star: '#FF0000' });
  });

  it('the fixed themes are the ones the stylesheet has', () => {
    const css = read('src/css/tokens.css');
    const token = (block, name) => new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block)[1].toUpperCase();
    for (const [id, colors] of Object.entries(FIXED_THEMES)) {
      const at = css.indexOf(`:root[data-theme="${id}"]`);
      expect(at, id).toBeGreaterThan(-1);
      const block = css.slice(at, css.indexOf('}', at));
      expect({ bg: token(block, '--paper'), dark: token(block, '--paper-sunken'), lines: token(block, '--rule'), accent: token(block, '--clay'), text: token(block, '--ink') }, id).toEqual(colors);
    }
  });
});

describe('the ready profiles of Your own theme', () => {
  it('are Matcha and Contrast', () => {
    expect(READY_PROFILES.map((p) => p.name)).toEqual(['Matcha', 'Contrast']);
    expect(CONTRAST.colors).toEqual({ bg: '#F7F7F7', dark: '#F7F7F7', lines: '#2B2B2B', accent: '#2B2B2B', text: '#2B2B2B' });
    expect(toneOf(CONTRAST.colors)).toBe('light');
    expect(hardToRead(CONTRAST.colors)).toBe(false);
    expect(profileOf(CONTRAST.colors)).toBe('Contrast');
  });

  it('can be deleted like any other, and are back when they are brought back', () => {
    expect(readyProfiles()).toEqual(READY_PROFILES);
    expect(readyProfiles(['contrast'])).toEqual([MATCHA]);
    expect(readyProfiles(['Matcha', 'Contrast', 'nothing'])).toEqual([]);
    expect(readyProfiles('not a list')).toEqual(READY_PROFILES);
    // Its colours are then nobody's profile…
    expect(profileOf(CONTRAST.colors, [], readyProfiles(['Contrast']))).toBeNull();
    // …and its name is free to save under.
    const left = readyProfiles(['Contrast']);
    expect(saveProfile([], 'Contrast', MATCHA.colors, left)).toEqual({ profiles: [{ name: 'Contrast', colors: MATCHA.colors }] });
    expect(saveProfile([], 'Contrast', MATCHA.colors).error).toBe('ready');
    expect(saveProfile([], 'matcha', MATCHA.colors, left).error).toBe('ready');
  });

  it('a profile saved as "Black & White Contrast" with Contrast’s colours is Contrast, and is not kept twice', () => {
    const mine = [{ name: 'Black & White Contrast', colors: { ...CONTRAST.colors } }, { name: 'Night', colors: MATCHA.colors }];
    expect(cleanProfiles(mine).map((p) => p.name)).toEqual(['Night']);
    // Changed since, it is the reader's own and stays.
    expect(cleanProfiles([{ name: 'Black & White Contrast', colors: { ...CONTRAST.colors, accent: '#0B0B0B' } }]).map((p) => p.name)).toEqual(['Black & White Contrast']);
    // With Contrast deleted, it is theirs again.
    expect(cleanProfiles(mine, readyProfiles(['Contrast'])).map((p) => p.name)).toEqual(['Black & White Contrast', 'Night']);
  });
});

describe('themes that are the logo’s alone', () => {
  const RESERVED = ['Main', 'Dark', 'Light', 'White', 'Matcha', 'Contrast'];
  const red = { ...OWN_LOGO.main, star: '#FF0000' };

  it('are a name and five colours, each name once, never one the editor has already', () => {
    expect(cleanLogoThemes(null)).toEqual([]);
    expect(cleanLogoThemes([{ name: '  My   logo ', colors: red }, { name: 'my logo', colors: {} }, { colors: red }, 'x', { name: 'contrast', colors: red }], RESERVED))
      .toEqual([{ name: 'My logo', colors: red }]);
    expect(cleanLogoThemes([{ name: 'Half', colors: { star: '#fff' } }])).toEqual([{ name: 'Half', colors: { ...OWN_LOGO.main, star: '#FFFFFF' } }]);
    expect(cleanLogoThemes(Array.from({ length: 40 }, (_, i) => ({ name: `T${i}`, colors: red })))).toHaveLength(24);
    expect(cleanLogoName('x'.repeat(60))).toHaveLength(32);
  });

  it('are kept under a name: a new one, or that one again with new colours', () => {
    let { themes } = saveLogoTheme([], ' Night  sky ', red, RESERVED);
    expect(themes).toEqual([{ name: 'Night sky', colors: red }]);
    ({ themes } = saveLogoTheme(themes, 'night SKY', OWN_LOGO.test, RESERVED));
    expect(themes).toEqual([{ name: 'night SKY', colors: OWN_LOGO.test }]);
    ({ themes } = saveLogoTheme(themes, 'Second', red, RESERVED));
    expect(themes.map((x) => x.name)).toEqual(['night SKY', 'Second']);
  });

  it('need a name, and not one of a fixed theme or a profile', () => {
    expect(saveLogoTheme([], '   ', red, RESERVED)).toEqual({ themes: [], error: 'name' });
    expect(saveLogoTheme([], 'contrast', red, RESERVED)).toEqual({ themes: [], error: 'taken' });
    expect(saveLogoTheme([], 'Contrast 2', red, RESERVED).themes).toHaveLength(1);
  });

  it('are renamed — in other letters too — but not to a name that is taken', () => {
    const themes = [{ name: 'One', colors: red }, { name: 'Two', colors: red }];
    expect(renameLogoTheme(themes, 'one', 'First', RESERVED)).toEqual({ themes: [{ name: 'First', colors: red }, { name: 'Two', colors: red }], name: 'First' });
    expect(renameLogoTheme(themes, 'One', 'ONE', RESERVED).name).toBe('ONE');
    expect(renameLogoTheme(themes, 'One', 'two', RESERVED).error).toBe('taken');
    expect(renameLogoTheme(themes, 'One', 'Matcha', RESERVED).error).toBe('taken');
    expect(renameLogoTheme(themes, 'One', '  ', RESERVED).error).toBe('name');
    expect(renameLogoTheme(themes, 'Nine', 'x', RESERVED).error).toBe('missing');
    expect(themes.map((x) => x.name)).toEqual(['One', 'Two']);                     // what was handed in is not written on
  });

  it('a change made to a ready theme is a new theme, named after it and counted on', () => {
    expect(nextLogoName('Contrast', RESERVED)).toBe('Contrast 2');
    expect(nextLogoName('Contrast', [...RESERVED, 'contrast 2'])).toBe('Contrast 3');
    expect(nextLogoName('Contrast 2', [...RESERVED, 'Contrast 2'])).toBe('Contrast 3');
    expect(nextLogoName('Contrast 2', [...RESERVED, 'Contrast 2', 'Contrast 3'])).toBe('Contrast 4');
    expect(nextLogoName('', [])).toBe('Logo 2');
    expect(nextLogoName('x'.repeat(40), [])).toHaveLength(30);
    // The name it gives can be kept.
    const name = nextLogoName('Main', RESERVED);
    expect(saveLogoTheme([], name, red, RESERVED).themes[0].name).toBe('Main 2');
  });
});
