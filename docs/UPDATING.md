# Updating Nebula (and why your notes are safe)

## What you see

Nebula checks for a new version 10 seconds after it starts and every 6 hours
after that. You can also check any time: **Check for updates**, bottom of the
sidebar.

### Windows (installed with `Nebula-Setup-*.exe`)

1. A small card appears: *"Nebula 0.3.1 is available."*
2. Press **Update**. It downloads, showing progress. Nothing is installed yet.
3. Press **Restart and install**. Nebula closes, updates, and reopens.

Nothing downloads or installs on its own. If you press **Later**, Nebula stops
mentioning that particular version and asks again when the next one arrives.

### macOS

The card says a new version is available and offers **Download**, which opens
the release page in your browser. Download the `.dmg` and drag Nebula to
Applications, replacing the old copy.

macOS refuses to let an app replace itself unless it is signed with an Apple
Developer certificate, which this build does not have. Everything else is the
same — including your notes surviving the change.

### Windows portable (`Nebula-portable-*.exe`)

Same as macOS: it tells you there is a new version and sends you to the
download page. A portable exe has no installer to hand an update to.

---

## Where your notes actually live

Not next to the app. In your user profile:

| OS | Folder |
|---|---|
| Windows | `%APPDATA%\nebula` |
| macOS | `~/Library/Application Support/nebula` |

Inside it:

```
storage/
  notes/<id>.json     one file per note
  meta.json           which version last opened this vault
backups/
  YYYY-MM-DD/         a daily copy, newest 7 kept
  pre-update-<v>-<t>/ a copy taken right before an update installs
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
2. **A copy is taken before every update.** `backups/pre-update-<version>-<time>`
   is written the moment before the installer runs. Daily backups rotate; this
   one does not — it stays until you delete it.
3. **A daily copy.** First launch each day copies the whole vault to
   `backups/YYYY-MM-DD`. The newest 7 are kept.
4. **Nebula will not seed sample notes over a vault it cannot read.** If the
   folder is unreadable — permissions, a locked profile, a disk problem — the
   app says so in a red bar, disables writing to disk entirely, and offers to
   open the folder. It does not decide you are a new user.

## Restoring from a backup

1. Close Nebula.
2. Open the profile folder (the app: **Open notes folder** in the red bar, or
   paste `%APPDATA%\nebula` into Explorer).
3. Rename `storage` to `storage-broken`.
4. Copy the backup you want (e.g. `backups/2026-09-05`) and rename the copy to
   `storage`.
5. Start Nebula.

Individual notes are plain JSON — you can also copy a single file out of a
backup into `storage/notes/`.
