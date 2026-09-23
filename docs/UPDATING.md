# Updating Nebula (and why your notes are safe)

## What you see

Nebula checks for a new version shortly after it starts and every 6 hours
after that. You can also use **Check for updates** in the About panel.

### Windows (installed with `Nebula-Setup-*.exe`)

1. A small card appears: *"Nebula 0.3.1 is available."*
2. Press **Update**. It downloads, showing progress. Nothing is installed yet.
3. Press **Restart and install**. Nebula closes, updates, and reopens.

Nothing downloads or installs on its own. If you press **Later**, Nebula stops
mentioning that particular version and asks again when the next one arrives.

### macOS: install or update step by step

Nebula currently **checks and notifies**, but does not install Mac updates.
**Download** opens the official [latest release](https://github.com/hero-999-dev/nebula/releases/latest).
The same universal DMG supports Apple Silicon and Intel; there is no separate M-series download.

1. In Nebula, save your work and wait for **Saved**. If it says **Not saved**,
   keep the app open and follow the save-error section below before updating.
2. For an update, quit Nebula with **Cmd+Q**. In Finder choose **Go → Go to
   Folder…** and enter `~/Library/Application Support/nebula`. Copy that whole
   profile to a safe backup location while the app is closed. Do not delete it.
   This manual upgrade does **not** run the Windows pre-install snapshot hook.
3. Download `Nebula-X.Y.Z-mac.dmg` under **Assets** on the release page.
   `Source code.zip` is not the app. The `-mac.zip` is an alternative packaged app;
   most users should choose the DMG.
4. Open the DMG and drag **Nebula.app** to **Applications**. Choose **Replace**
   if asked. Replace only the application, never the profile from step 2.
5. Eject the mounted DMG, then launch **Applications → Nebula**. Do not keep
   launching the old copy from Downloads or the mounted disk image.
6. Click the sidebar version to open **About**. Confirm the new version,
   the expected profile path, and your recent notes. Keep your backup.

#### If macOS blocks opening

This release is not Developer ID signed/notarized. A warning is **not proof that
a download is safe**, and it may appear again after an update. Verify that the
file came from the official repository before deciding to open it.

After attempting to open it, use **System Settings → Privacy & Security → Open
Anyway** if that option is available and you trust the download, then confirm.
Follow [Apple's current instructions](https://support.apple.com/en-au/102445).
Do not disable Gatekeeper globally. If macOS reports malware or damage, stop;
download a fresh official copy and report the exact message, macOS version and
release version rather than bypassing the warning blindly.

#### If you still see the old version or missing notes

Quit all Nebula copies and launch the one in Applications. Check About's
application and profile paths. Do not reset a profile to fix an update problem.
If you need to roll back, quit, keep a copy of the current profile, and obtain
the older app from its official release. Data-format compatibility with older
versions is not guaranteed; retain the pre-upgrade backup.

### Windows portable (`Nebula-portable-*.exe`)

Same as macOS: it tells you there is a new version and sends you to the
download page. A portable exe has no installer to hand an update to.

---

## Where your notes actually live

Not next to the app — unless you are running the portable build, which is the
whole point of a portable build.

| How you launched it | Notes folder |
|---|---|
| **Installed** (Windows) | `%APPDATA%\nebula` |
| **Installed** (macOS) | `~/Library/Application Support/nebula` |
| **Portable** (`Nebula-portable-*.exe`) | `Nebula-data`, beside the exe — put the exe on a USB stick and your notes go with it |

These are separate vaults on purpose: the portable build cannot see or change
the installed app's notes, and neither can a development build. The app tells
you which one it is using — click the version at the bottom of the sidebar.

Inside whichever folder applies:

Inside it:

```
storage/
  notes/<id>.json     one file per note
  meta.json           which version last opened this vault
backups/
  YYYY-MM-DD/         a daily copy, newest 7 kept
  pre-update-<v>-<t>/ Windows in-app installer snapshot (not manual Mac updates)
  reset-<t>/          only if you ran the developer reset script
Local Storage/        note list, layout and theme
Partitions/           your AI panel sign-ins
```

An update replaces the program in `%LOCALAPPDATA%\Programs\Nebula` and never
touches the folder above. Even **uninstalling** leaves it alone
(`deleteAppDataOnUninstall` is off), so reinstalling brings every note back.

## The four things standing between you and losing a note

1. **The vault is separate from the app.** Updating and uninstalling both leave
   it where it is.
2. **A copy is taken before a Windows in-app installation.** `backups/pre-update-<version>-<time>`
   is written the moment before the installer runs. Daily backups rotate; this
   one does not — it stays until you delete it. Manual Mac/portable upgrades
   require your own pre-upgrade copy; daily snapshots are a separate safeguard.
3. **A daily copy.** First launch each day copies the whole vault to
   `backups/YYYY-MM-DD`. The newest 7 are kept.
4. **Nebula will not seed sample notes over a vault it cannot read.** If the
   folder is unreadable — permissions, a locked profile, a disk problem — the
   app says so in a red bar, disables writing to disk entirely, and offers to
   open the folder. It does not decide you are a new user.

## Restoring from a backup

<!-- agent-note: gpt6astra tarafından eklendi -->

### If the latest changes could not be saved

Choose **Keep editing** and leave Nebula open. Copy important unsaved text
somewhere safe before restarting anything. The **Not saved** indicator means
the disk has not confirmed the write. Check free disk space and whether the
notes folder is available, then press **Retry saving** in the error banner.
Continue closing only after the indicator returns to **Saved**.

Native close waits for pending title and body edits. If saving fails or times
out, the app stays open. An update likewise stops if saving or the pre-update
backup fails. These checks cannot flush pending edits after an abrupt power loss.
Do not reset the profile or delete note files to dismiss a save error.

### Restore a stored snapshot

1. Close Nebula.
2. Open the profile folder (the app: **Open notes folder** in the red bar, or
   paste `%APPDATA%\nebula` into Explorer).
3. Rename `storage` to `storage-broken`.
4. Copy the backup you want (e.g. `backups/2026-09-05`) and rename the copy to
   `storage`.
5. Start Nebula.

Individual notes are plain JSON — you can also copy a single file out of a
backup into `storage/notes/`.
