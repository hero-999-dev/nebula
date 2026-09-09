/**
 * Ad-hoc sign the macOS app.
 *
 * `mac.identity: null` tells electron-builder not to sign at all, and an
 * unsigned arm64 binary does not merely warn on Apple Silicon — macOS refuses
 * to load it and reports the app as *damaged*, which sounds like a corrupt
 * download and is unfixable from the Finder.
 *
 * An ad-hoc signature (`codesign -s -`) is free, needs no Apple account, and
 * makes the binary loadable. It does NOT make the app notarized: the first
 * launch still says "Apple could not verify that Nebula is free of malware",
 * because that sentence is about notarization, not about signing. Removing it
 * needs a paid Developer ID and a notarytool submission — see the release page
 * for what the reader has to do until then.
 *
 * CommonJS on purpose: package.json is `"type": "module"`, and electron-builder
 * loads this hook with require().
 */
const path = require('node:path');
const { execFileSync } = require('node:child_process');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  try {
    // --deep is deprecated for real identities and exactly right for an ad-hoc
    // one: every nested framework and helper needs the same signature, and
    // there is no certificate chain here to get wrong.
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
    console.log(`  ad-hoc signed ${appName}`);
  } catch (err) {
    // Not fatal: an unsigned build still installs on Intel, and failing the
    // whole release over a signature we are not charging for helps nobody.
    console.warn(`  ad-hoc signing failed: ${err.message}`);
  }
};
