import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { markOfTheWeb, quarantineValue } from '../electron/mark-of-the-web.js';

describe('Mark-of-the-Web on a copy made from a note', () => {
  it('marks the completed Windows copy as Internet zone, regardless of the source', async () => {
    const writeFile = vi.fn(async () => {});
    await markOfTheWeb('C:\\copies\\report.docx', { platform: 'win32', writeFile });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      'C:\\copies\\report.docx:Zone.Identifier',
      '[ZoneTransfer]\r\nZoneId=3\r\n',
    );
  });

  it('does not write a Windows ADS on another platform', async () => {
    const writeFile = vi.fn(async () => {});
    const setQuarantine = vi.fn(async () => {});
    await markOfTheWeb('/tmp/report.docx', { platform: 'darwin', writeFile, setQuarantine });
    await markOfTheWeb('/tmp/report.docx', { platform: 'linux', writeFile, setQuarantine });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('quarantines the completed macOS copy as a download from Nebula (1.0.0)', async () => {
    const setQuarantine = vi.fn(async () => {});
    const writeFile = vi.fn(async () => {});
    await markOfTheWeb('/Users/a/Downloads/run.command', { platform: 'darwin', writeFile, setQuarantine, now: 0x6700000 * 1000 });
    expect(writeFile).not.toHaveBeenCalled();
    expect(setQuarantine).toHaveBeenCalledTimes(1);
    const [file, value] = setQuarantine.mock.calls[0];
    expect(file).toBe('/Users/a/Downloads/run.command');
    expect(value).toMatch(/^0081;6700000;Nebula;[0-9A-F-]{36}$/);
  });

  it('never marks a macOS copy as one the person already let run', () => {
    expect(quarantineValue(0, 'abc').startsWith('0081;')).toBe(true);
    expect(parseInt(quarantineValue(0, 'abc').split(';')[0], 16) & 0x40).toBe(0);
    expect(quarantineValue(0, 'abc')).toBe('0081;0;Nebula;ABC');
  });

  it('keeps the macOS copy usable when its disk cannot store the mark', async () => {
    const setQuarantine = vi.fn(async () => { throw new Error('Operation not supported'); });
    await expect(markOfTheWeb('/Volumes/FAT/report.docx', { platform: 'darwin', setQuarantine })).resolves.toBeUndefined();
  });

  it('keeps the copy usable when its destination cannot store an ADS', async () => {
    const writeFile = vi.fn(async () => { throw Object.assign(new Error('no ADS'), { code: 'EINVAL' }); });
    await expect(markOfTheWeb('E:\\report.docx', { platform: 'win32', writeFile })).resolves.toBeUndefined();
  });

  it.skipIf(process.platform !== 'win32')('writes an ADS without changing the copied file bytes', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-motw-'));
    const copy = path.join(dir, 'report.docx');
    try {
      await fs.writeFile(copy, 'copy bytes');
      await markOfTheWeb(copy);
      expect(await fs.readFile(copy, 'utf8')).toBe('copy bytes');
      expect(await fs.readFile(`${copy}:Zone.Identifier`, 'utf8')).toBe('[ZoneTransfer]\r\nZoneId=3\r\n');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
