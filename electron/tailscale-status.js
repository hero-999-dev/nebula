/**
 * What Tailscale itself says of a device (1.0.4). When a device on the list
 * does not answer, sync asks the Tailscale on this computer whether it sees
 * that device online. Online there and silent here is a door shut on the way —
 * a firewall, most often (2026-11-05: Windows kept a Block rule for Nebula
 * after its first question had been cancelled) — and Tools then says so and
 * how to let Nebula through, instead of asking whether the device is on.
 *
 * Asked of the program Tailscale installs, in the places it installs it and
 * nowhere else: a `tailscale` found along PATH could be anyone's. `status`
 * answers from what this computer already knows; nothing is sent anywhere and
 * nothing of the answer is kept beyond a few seconds.
 */
import { execFile } from 'node:child_process';
import fsSync from 'node:fs';
import path from 'node:path';

/** Where Tailscale puts its command on each system, most usual first. Pure — tested. */
export function tailscalePlaces(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const roots = [env.ProgramFiles, env.ProgramW6432, 'C:\\Program Files'].filter((r) => typeof r === 'string' && r);
    return [...new Set(roots.map((r) => path.win32.join(r, 'Tailscale', 'tailscale.exe')))];
  }
  if (platform === 'darwin') {
    return ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale'];
  }
  return ['/usr/bin/tailscale', '/usr/sbin/tailscale', '/usr/local/bin/tailscale'];
}

/**
 * Whether Tailscale sees the device at this tailnet address online: true or
 * false, and null when it cannot be told (Tailscale stopped, the address not
 * among its devices, an answer that is not its own). Pure — tested.
 */
export function onlineIn(status, address) {
  if (!status || typeof status !== 'object' || status.BackendState !== 'Running') return null;
  if (typeof address !== 'string' || !address) return null;
  const peers = status.Peer && typeof status.Peer === 'object' ? Object.values(status.Peer) : [];
  for (const peer of peers) {
    if (Array.isArray(peer?.TailscaleIPs) && peer.TailscaleIPs.includes(address)) return peer.Online === true;
  }
  return null;
}

/** `tailscale status --json`, read: its object, or null when there is none to read. */
function readStatus(file) {
  return new Promise((resolve) => {
    execFile(file, ['status', '--json'], { timeout: 4000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      // Stopped, Tailscale still says so in JSON and leaves with an error: what it wrote is read all the same.
      try { resolve(JSON.parse(String(stdout ?? ''))); } catch { resolve(null); }
    });
  });
}

/**
 * @param {object} [o]
 * @param {(file: string) => Promise<object|null>} [o.read]   the status of the Tailscale at `file` (tests: a made-up one)
 * @param {(file: string) => boolean} [o.exists]
 * @param {string} [o.platform]
 * @param {object} [o.env]
 * @param {number} [o.keep]   how long one answer serves, so several devices asked together cost one call
 */
export function createTailscaleStatus({ read = readStatus, exists = fsSync.existsSync, platform = process.platform, env = process.env, keep = 8000 } = {}) {
  let asked = null;
  let at = 0;
  function status() {
    if (asked && Date.now() - at < keep) return asked;
    at = Date.now();
    asked = (async () => {
      const file = tailscalePlaces(platform, env).find((f) => { try { return exists(f); } catch { return false; } });
      if (!file) return null;
      try { return await read(file); } catch { return null; }
    })();
    return asked;
  }
  return {
    /** Is the device at this tailnet address online, as Tailscale sees it? true, false, or null when it cannot be told. */
    online: async (address) => onlineIn(await status(), address),
  };
}
