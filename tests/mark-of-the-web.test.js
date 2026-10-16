import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { markOfTheWeb } from '../electron/mark-of-the-web.js';

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
    await markOfTheWeb('/tmp/report.docx', { platform: 'darwin', writeFile });
    expect(writeFile).not.toHaveBeenCalled();
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
