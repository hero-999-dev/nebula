// @vitest-environment node
/**
 * What Tailscale says of a device that does not answer (1.0.4,
 * electron/tailscale-status.js): asked only of the program Tailscale itself
 * installs, and read as online, not online, or not to be told.
 */
import { describe, it, expect } from 'vitest';
import { tailscalePlaces, onlineIn, createTailscaleStatus } from '../electron/tailscale-status.js';

const status = (peers, backend = 'Running') => ({
  BackendState: backend,
  Peer: Object.fromEntries(peers.map((p, i) => [`nodekey:${i}`, p])),
});

describe('Tailscale’s word on a device', () => {
  it('looks for Tailscale’s command where Tailscale installs it, never along PATH', () => {
    expect(tailscalePlaces('win32', { ProgramFiles: 'C:\\Program Files', ProgramW6432: 'C:\\Program Files' }))
      .toEqual(['C:\\Program Files\\Tailscale\\tailscale.exe']);
    expect(tailscalePlaces('win32', {})).toEqual(['C:\\Program Files\\Tailscale\\tailscale.exe']);
    expect(tailscalePlaces('darwin', {})[0]).toBe('/Applications/Tailscale.app/Contents/MacOS/Tailscale');
    expect(tailscalePlaces('linux', {})).toContain('/usr/bin/tailscale');
    for (const platform of ['win32', 'darwin', 'linux']) {
      for (const place of tailscalePlaces(platform, { PATH: '/tmp/anyone', ProgramFiles: 'C:\\Program Files' })) {
        expect(place).toMatch(/^(?:[A-Z]:\\|\/)/);
        expect(place).not.toMatch(/anyone/);
      }
    }
  });

  it('reads a device as online only when Tailscale is running and says so of that address', () => {
    const peers = [
      { HostName: 'laptop', TailscaleIPs: ['100.101.1.2', 'fd7a:115c:a1e0::2'], Online: true },
      { HostName: 'phone', TailscaleIPs: ['100.101.1.3'], Online: false },
      { HostName: 'odd', TailscaleIPs: ['100.101.1.4'] },
    ];
    expect(onlineIn(status(peers), '100.101.1.2')).toBe(true);
    expect(onlineIn(status(peers), '100.101.1.3')).toBe(false);
    expect(onlineIn(status(peers), '100.101.1.4')).toBe(false);
    // Not one of its devices, Tailscale stopped, or no answer of its own: not to be told.
    expect(onlineIn(status(peers), '100.101.1.9')).toBeNull();
    expect(onlineIn(status(peers, 'Stopped'), '100.101.1.2')).toBeNull();
    expect(onlineIn(null, '100.101.1.2')).toBeNull();
    expect(onlineIn('Running', '100.101.1.2')).toBeNull();
    expect(onlineIn({ BackendState: 'Running', Peer: null }, '100.101.1.2')).toBeNull();
    expect(onlineIn(status(peers), '')).toBeNull();
    expect(onlineIn(status(peers), undefined)).toBeNull();
  });

  it('asks the first place that is there, once for several devices, and tells nothing when Tailscale is not installed', async () => {
    const asked = [];
    const read = async (file) => { asked.push(file); return status([{ TailscaleIPs: ['100.101.1.2'], Online: true }, { TailscaleIPs: ['100.101.1.3'], Online: false }]); };
    const there = createTailscaleStatus({ read, exists: (f) => f === '/usr/sbin/tailscale', platform: 'linux', env: {} });
    expect(await Promise.all([there.online('100.101.1.2'), there.online('100.101.1.3'), there.online('100.101.1.7')])).toEqual([true, false, null]);
    expect(asked).toEqual(['/usr/sbin/tailscale']);

    const none = createTailscaleStatus({ read, exists: () => false, platform: 'win32', env: {} });
    expect(await none.online('100.101.1.2')).toBeNull();
    expect(asked).toHaveLength(1);

    // An answer that cannot be read, or a look that throws, is no answer.
    const broken = createTailscaleStatus({ read: async () => { throw new Error('no'); }, exists: () => true, platform: 'linux', env: {} });
    expect(await broken.online('100.101.1.2')).toBeNull();
    const blind = createTailscaleStatus({ read, exists: () => { throw new Error('no'); }, platform: 'linux', env: {} });
    expect(await blind.online('100.101.1.2')).toBeNull();
  });

  it('asks again once an answer is old', async () => {
    let calls = 0;
    const read = async () => { calls++; return status([{ TailscaleIPs: ['100.101.1.2'], Online: calls > 1 }]); };
    const there = createTailscaleStatus({ read, exists: () => true, platform: 'linux', env: {}, keep: 0 });
    expect(await there.online('100.101.1.2')).toBe(false);
    expect(await there.online('100.101.1.2')).toBe(true);
    expect(calls).toBe(2);
  });
});
