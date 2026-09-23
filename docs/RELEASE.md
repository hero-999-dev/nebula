# Releasing Nebula

## The whole ritual

```bash
npm run push
```

That is the release. It:

1. runs `npm test`, `npm run build` and `npm run smoke` — **and stops on failure**, before
   anything is committed, so a broken build can never become a tag that
   installed apps try to update to;
2. bumps the version in `package.json` (patch by default);
3. writes an entry in `Log.md` from the commit subjects since the last tag;
4. commits, tags `vX.Y.Z`, and pushes to `main` with the tag;
5. rebuilds `Nebula Test.exe` in the project root so the build you click carries
   the version that was just released (a running copy is closed first);
6. publishes the docs site and mirrors the project to the USB drive if it is
   plugged in.

Pushing the tag starts [`.github/workflows/release.yml`](../.github/workflows/release.yml),
which builds Windows and macOS and publishes one GitHub Release
(~10 minutes). Installed copies of Nebula offer the update on their next check.

**Both platforms build on every tag, and nobody is asked.** `hero-999-dev/nebula`
is public, and GitHub Actions is free and unlimited on public repositories —
the macOS runner included. The 10x macOS multiplier applies only to private
repos, so there is nothing to save by skipping it.

### Variants

```bash
npm run push -- minor              # 0.3.0 -> 0.4.0
npm run push -- major              # 0.3.0 -> 1.0.0
npm run push -- 0.5.2              # exact version
npm run push -- --notes "Editor v4, faster search"
npm run push -- --dry-run          # everything except commit/tag/push
npm run push -- --no-flash         # skip the USB mirror
```

A dry run can leave generated/version-stamped files modified. Review `git diff`
and preserve pre-existing work; do not blindly discard whole files.

---

## One-time setup

Already done for `hero-999-dev/nebula`. Recorded here for a fresh clone or a
second repo:

```bash
git init
git branch -M main
gh repo create hero-999-dev/nebula --public --source=. --remote=origin
git add -A && git commit -m "Nebula v0.3.0"
git push -u origin main
```

No repository secrets are needed. The workflow publishes with the automatic
`GITHUB_TOKEN`.

### The repository must stay public

`electron-updater` fetches `latest.yml` from the release page with no
credentials. A private repository would require a GitHub token compiled into
the app — which would then be handed to every user. Public repository, no
token, no secret to leak.

---

## What gets published

| File | Platform | Auto-updates |
|---|---|---|
| `Nebula-Setup-X.Y.Z.exe` | Windows installer | **yes** |
| `Nebula-portable-X.Y.Z.exe` | Windows portable | no |
| `Nebula-X.Y.Z-mac.dmg` | macOS universal | no |
| `Nebula-X.Y.Z-mac.zip` | macOS universal | no |
| `latest.yml` | — | the manifest the Windows app reads |

The release **must not be a draft**: `electron-updater` reads
`releases/latest/download/latest.yml`, and a draft is not "latest".

### Two things the Windows job asserts, and why

Both failures are silent — the app builds, installs and runs perfectly while
being permanently unable to update. So CI fails the build instead:

- **`release/latest.yml` exists.** It only gets written because `build.publish`
  is configured in `package.json`. Remove that block and updates stop, with no
  error anywhere.
- **`electron-updater` is inside `app.asar`.** It has to stay in
  `dependencies` *and* be listed as `external` in `vite.config.js`. Bundle it by
  accident and the import at runtime resolves to nothing; the app quietly falls
  back to "manual" mode forever.

---

## Platform limits

### macOS uses manual updates by design

`electron/updater.js` explicitly allows automatic installation only for a
packaged, non-portable **win32** build whose channel permits self-update.
Adding signing credentials alone will **not** enable Mac auto-update.

The current Mac configuration has `identity: null`, no notarization credentials,
and no `build/after-pack.cjs` signing hook. Do not claim the artifact is notarized
or that warnings can never recur. For signed automatic updates, a future change
must configure Developer ID signing/notarization, update the platform gate,
verify manifests and signatures, and test an upgrade between two packaged Mac
versions with saving, backup, relaunch and rollback checks.
[Electron's signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing)
documents the signature requirement. User steps and warning handling live in
[UPDATING.md](UPDATING.md#macos-install-or-update-step-by-step).

### Release text and Mac checks

`scripts/release-body.js` generates the GitHub body from the matching entry in
`src/js/release-notes.js`, exact asset names and the Mac upgrade checklist.
Missing release notes or an invalid version fail generation; update the entry
before tagging. The publish job uses `body_path`, so these instructions and
the actual changes ship together.

The Mac job runs unit tests, builds DMG and ZIP, asserts both packages exist,
and checks that the app executable contains both `arm64` and `x86_64` slices.
These checks do not replace a hands-on Mac install/update check. The full
editor smoke suite runs on Windows; this session's local host is Windows too.
Before calling a Mac upgrade manually verified, test the DMG on a Mac, replace
an older app, confirm About and existing notes, and record that evidence.

### The portable exe cannot auto-update either

There is no installer to hand a new build to. `electron/updater.js` detects it
(`PORTABLE_EXECUTABLE_DIR`) and shows the download prompt instead of an
Update button, rather than offering a path that would fail.

---

## Trying a build before releasing it

```bash
npm run pack:test
```

`Nebula Test.exe` appears in the project root. It is the same code with its own
name, icon, taskbar button and notes (`Nebula-data` beside it), so you can run
it next to the installed Nebula without either one touching the other. It never
self-updates — `canSelfUpdate` allows that for the installed channel only.

## Checklist for a release you are not sure about

```bash
npm test                    # unit tests
npm run build               # renderer + main
npm run smoke               # real Electron app, temporary profiles
npm run pack:win            # installer + portable, locally
```

Then confirm by hand:

- `release/latest.yml` exists and names the installer
- `npx asar list release/win-unpacked/resources/app.asar | grep electron-updater`
  prints something
- `release/win-unpacked/resources/app-update.yml` names the right repo
