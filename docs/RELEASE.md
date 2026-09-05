# Releasing Nebula

## The whole ritual

```bash
npm run push
```

That is the release. It:

1. runs `npm test` and `npm run build` — **and stops if either fails**, before
   anything is committed, so a broken build can never become a tag that
   installed apps try to update to;
2. bumps the version in `package.json` (patch by default);
3. writes an entry in `Log.md` from the commit subjects since the last tag;
4. commits, tags `vX.Y.Z`, and pushes to `main` with the tag;
5. mirrors the project to the USB drive if it is plugged in.

Pushing the tag starts [`.github/workflows/release.yml`](../.github/workflows/release.yml),
which builds Windows and macOS and publishes one GitHub Release
(~10 minutes). Installed copies of Nebula offer the update on their next check.

### Variants

```bash
npm run push -- minor              # 0.3.0 -> 0.4.0
npm run push -- major              # 0.3.0 -> 1.0.0
npm run push -- 0.5.2              # exact version
npm run push -- --notes "Editor v4, faster search"
npm run push -- --dry-run          # everything except commit/tag/push
npm run push -- --no-flash         # skip the USB mirror
```

A dry run leaves `package.json` and `Log.md` modified; undo with
`git checkout -- package.json Log.md`.

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

### macOS cannot auto-update, and this is not a bug we can fix in code

Squirrel.Mac replaces a running app only if it is signed with an Apple
Developer certificate and the new copy carries the same signature. There is no
certificate for this project, so the honest behaviour is what the app does:
detect the new version through the GitHub API and send the user to the download
page.

To lift it later: an Apple Developer account ($99/year), then add `mac.identity`
and notarization credentials to the build. The updater code needs no change —
`electron/updater.js` picks `auto` mode by platform, and macOS would simply
qualify.

### The portable exe cannot auto-update either

There is no installer to hand a new build to. `electron/updater.js` detects it
(`PORTABLE_EXECUTABLE_DIR`) and shows the download prompt instead of an
Update button, rather than offering a path that would fail.

---

## Checklist for a release you are not sure about

```bash
npm test                    # unit tests
npm run build               # renderer + main
npm run pack:win            # installer + portable, locally
```

Then confirm by hand:

- `release/latest.yml` exists and names the installer
- `npx asar list release/win-unpacked/resources/app.asar | grep electron-updater`
  prints something
- `release/win-unpacked/resources/app-update.yml` names the right repo
