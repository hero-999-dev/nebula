# Project notes: rich-paste audit

This handoff is not another version source: use `package.json`, [Log.md](Log.md)
for history and [tests.md](tests.md) for suite evidence.

## Checked and corrected

- Links: four Paste as options and slash entries. Bookmark is an offline card;
  URL/Mention are inline links; Embed renders in a restricted iframe with an
  open-link fallback. Cards now replace selected text at its position and can
  be deleted, undone and redone.
- Images: PNG/JPEG/GIF/WebP paste/drop, real movement, proportional resize,
  front/back, Escape/Delete, undo/redo and disk/restart persistence. Decode is
  cancelled when the note changes. Corrupt images do not create placeholders.
  The lowest image reserves canvas height during its drag.
- Editor reports: existing Untitled/divider/underline/code-hint regressions stay
  in normal smoke. New caret tests cover preceding text and nested/empty inline
  wrappers. This proves those cases, not every possible editing sequence.
- Import/export: safe numeric image geometry survives HTML sanitization. Imported
  frames are removed; only the app's fixed sandbox is recreated. Markdown images
  return as images. Exports use links rather than live embedded pages.

## Verification

```bash
npm test
npm run build
npm run smoke
node tests/e2e/rich-paste.mjs   # focused subset, already included in smoke
```

Tests use temporary profiles, never the user's notes as writable fixtures. Mac
CI runs unit tests and verifies DMG/ZIP plus universal executable slices. Full
editor smoke is Windows-based. A hands-on Mac first install and upgrade from
an older DMG still needs verification; packaging alone does not prove it.

## Limits to keep visible

- Remote services can block framing or require login/permissions denied by the
  sandbox. Use the link fallback rather than weakening security. There is no
  fetched bookmark thumbnail. Embedded pages contact their site when opened.
- Mention means an `@hostname` link, not a person/notification integration.
- SVG/BMP clipboard imports are not supported. Data images increase note,
  undo and backup storage; very large image collections are not stress-tested.
- Mac updates open the download page, do not replace the app and do not invoke
  the Windows pre-install snapshot. Signing credentials alone do not change
  the explicit platform gate. No Developer ID/notarization claim is made.

## Release documentation

[README](README.md) links to the [Mac guide](docs/UPDATING.md#macos-install-or-update-step-by-step).
[Release maintenance](docs/RELEASE.md) explains CI and `scripts/release-body.js`,
which combines the actual changelog with exact asset links and update steps.
Keep generation tested; missing changelogs must fail instead of publishing
generic instructions without the changes for that version.
