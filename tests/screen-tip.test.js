// The card on another screen (1.0.3, the owner): "kullanıcı ekranı değiştiriyorsa sağ alttan bir pop up gelsin …
// bir daha gösterme derse o harici ekran için tekrardan göstermesin".
import { describe, it, expect } from 'vitest';
import { screenKey, tipDue } from '../src/js/screen-tip.js';

const external = { ok: true, id: 7, internal: false, label: 'VG240Y' };
const now = { picture: true, smooth: false, off: [] };

describe('screen tip', () => {
  it('a screen is remembered by its name, else its id', () => {
    expect(screenKey(external)).toBe('label:VG240Y');
    expect(screenKey({ ok: true, id: 3, label: '' })).toBe('id:3');
    expect(screenKey(null)).toBeNull();
  });

  it('comes when the window moves onto an external screen with the picture unsoftened', () => {
    expect(tipDue(external, 1, now)).toBe(true);
  });

  it('not at the start, not on the same screen, not on the computer’s own', () => {
    expect(tipDue(external, null, now)).toBe(false);
    expect(tipDue(external, 7, now)).toBe(false);
    expect(tipDue({ ...external, internal: true }, 1, now)).toBe(false);
    expect(tipDue({ ...external, ok: false }, 1, now)).toBe(false);
  });

  it('not without a picture, nor when it is softened already', () => {
    expect(tipDue(external, 1, { ...now, picture: false })).toBe(false);
    expect(tipDue(external, 1, { ...now, smooth: true })).toBe(false);
  });

  it('never again for a screen it was told not to show on; still for another', () => {
    const off = ['label:VG240Y'];
    expect(tipDue(external, 1, { ...now, off })).toBe(false);
    expect(tipDue({ ...external, id: 9, label: 'S271HL' }, 7, { ...now, off })).toBe(true);
  });
});
