/** Mark a completed copy from a note as coming from the Internet on Windows. */
import fs from 'node:fs/promises';

const INTERNET_ZONE = '[ZoneTransfer]\r\nZoneId=3\r\n';

export async function markOfTheWeb(file, { platform = process.platform, writeFile = fs.writeFile } = {}) {
  if (platform !== 'win32') return;
  try {
    await writeFile(`${file}:Zone.Identifier`, INTERNET_ZONE);
  } catch {
    // FAT, some network drives and some permissions do not support ADS.
    // Keep the completed copy available; the app's Open warning still applies.
  }
}
