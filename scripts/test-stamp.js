/**
 * Stamp the test build with the moment it is packed.
 *
 * A test build still says the last release's version, so without this it would
 * sync with every released copy of that version and with every older test
 * build. main.js reads this file only in the test channel and adds the stamp to
 * the version it shows the devices it syncs with (user-data.js syncVersion).
 * place-test-exe.js takes the file away again once the build is packed, so no
 * other build carries it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';
import { testStamp } from '../electron/user-data.js';

const stamp = testStamp();
fs.writeFileSync(path.join(ROOT, 'dist-electron', 'test-build.json'), `${JSON.stringify({ stamp })}\n`);
console.log(`Test build stamp: ${stamp}`);
