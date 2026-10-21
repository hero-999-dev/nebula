/**
 * Mark a completed copy from a note as coming from the Internet: Windows's
 * Zone.Identifier, and macOS's quarantine (1.0.0 — "macOS quarantine is not
 * done", hunt B27), so Gatekeeper asks before a copied program or script runs.
 */
import fs from 'node:fs/promises';
import { execFile as execFileCb } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const INTERNET_ZONE = '[ZoneTransfer]\r\nZoneId=3\r\n';

/**
 * The value a browser writes on a download: flags (0081, downloaded; never
 * 0040, which says the person already let it run), the time in hex seconds,
 * the app that brought it, an id.
 */
export function quarantineValue(now = Date.now(), id = randomUUID()) {
  return `0081;${Math.floor(now / 1000).toString(16)};Nebula;${String(id).toUpperCase()}`;
}

const xattr = (file, value) => new Promise((resolve, reject) => {
  execFileCb('/usr/bin/xattr', ['-w', 'com.apple.quarantine', value, file], { timeout: 5000 }, (err) => (err ? reject(err) : resolve()));
});

export async function markOfTheWeb(file, { platform = process.platform, writeFile = fs.writeFile, setQuarantine = xattr, now = Date.now() } = {}) {
  try {
    if (platform === 'win32') await writeFile(`${file}:Zone.Identifier`, INTERNET_ZONE);
    else if (platform === 'darwin') await setQuarantine(file, quarantineValue(now));
  } catch {
    // FAT, some network drives and some permissions do not support ADS or
    // extended attributes. Keep the completed copy available; the app's Open
    // warning still applies.
  }
}
