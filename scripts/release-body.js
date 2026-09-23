import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_NOTES } from '../src/js/release-notes.js';

export function releaseBody(version) {
  const v = String(version).replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error('Expected a stable release version');
  const notes = RELEASE_NOTES[v];
  if (!notes) throw new Error(`Missing release notes for ${v}`);
  const repo = 'https://github.com/hero-999-dev/nebula';
  const assets = `${repo}/releases/download/v${v}`;
  return `## What changed\n\n${notes.headline}\n\n${notes.items.map((item) => `- **${item.title}:** ${item.text}`).join('\n')}\n\n`
    + `## Downloads\n\n| Platform | Download | Update method |\n|---|---|---|\n`
    + `| Windows installer | [Nebula-Setup-${v}.exe](${assets}/Nebula-Setup-${v}.exe) | In-app update |\n`
    + `| Windows portable | [Nebula-portable-${v}.exe](${assets}/Nebula-portable-${v}.exe) | Manual replacement; keep Nebula-data |\n`
    + `| macOS Intel + Apple Silicon | [Nebula-${v}-mac.dmg](${assets}/Nebula-${v}-mac.dmg) | Manual update, steps below |\n`
    + `| macOS alternative archive | [Nebula-${v}-mac.zip](${assets}/Nebula-${v}-mac.zip) | Same universal app |\n\n`
    + 'Choose an app asset, not the automatically generated Source code archives.\n\n'
    + '## macOS: update without replacing your notes\n\n'
    + '1. Save and wait for **Saved**. If saving fails, keep Nebula open and resolve it first.\n'
    + '2. Quit with **Cmd+Q**. Copy `~/Library/Application Support/nebula` to a safe backup location. Manual Mac upgrades do not create the Windows pre-update snapshot.\n'
    + '3. Download the universal DMG above, open it, and drag **Nebula.app** to **Applications**. Choose **Replace** for the app only; keep your profile folder.\n'
    + '4. Eject the DMG and open Nebula from **Applications**, not Downloads.\n'
    + `5. Open **About**, confirm **${v}**, and check recent notes and the profile path. Keep the backup.\n\n`
    + '### macOS security warning\n\n'
    + 'This build is not Developer ID signed/notarized. A warning does not prove a file is safe. Only proceed if you trust the official download. After attempting to open it, use **System Settings → Privacy & Security → Open Anyway**, if available. A new update may prompt again. Do not disable Gatekeeper globally or bypass malware/damage warnings blindly. See [Apple guidance](https://support.apple.com/en-au/102445).\n\n'
    + `Detailed troubleshooting, save errors and backups: [Updating Nebula](${repo}/blob/v${v}/docs/UPDATING.md).\n\n`
    + '## Windows updates\n\nInstalled copies offer **Update**, then **Restart and install**. Saving and a pre-install snapshot must succeed first. Portable copies use manual downloads. App files and note profiles are separate, but keep backups before upgrading.\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/release-body.js vX.Y.Z output.md');
  fs.writeFileSync(output, releaseBody(version), 'utf8');
}
