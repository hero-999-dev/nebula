/**
 * Runs chosen smoke suites alone: `node tests/e2e/only.mjs note-folders app-lock-opened`.
 * For re-checking the few that failed in a full smoke run, without the other 1,100.
 * Each name is a file in tests/e2e exporting one run…Checks(check).
 */
let failed = 0;
let passed = 0;
function check(name, ok, detail) {
  if (ok) passed += 1; else failed += 1;
  const extra = detail === undefined ? '' : ` - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  console.log(`${ok ? '+' : 'x'} ${name}${extra}`);
}
for (const name of process.argv.slice(2)) {
  const mod = await import(`./${name}.mjs`);
  const run = Object.entries(mod).find(([key, fn]) => /^run\w*Checks$/.test(key) && typeof fn === 'function')?.[1];
  if (!run) throw new Error(`${name}.mjs exports no run…Checks`);
  console.log(`\n# ${name}`);
  await run(check);
}
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
