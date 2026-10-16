# LNReader v1

An unofficial fork of LNReader that keeps the v1 app alive: same design,
your data preserved, actively maintained.

## No support

Maintained independently. **No support or assistance will be provided.**

## Download

- **This fork**: [releases](https://github.com/chief-afk/lnreader-v1/releases)
- **Official app**: [LNReader/lnreader releases](https://github.com/LNReader/lnreader/releases)
  (the v2 line - a rewrite, not this fork)

## What this fork is

- **Same v1 app**: based on official v1.1.19. The app design and user
  model are unchanged on purpose.
- **Your data is safe**: the v1 data model is kept, so backups from the
  official app restore cleanly and updates never drop your library,
  reading progress, or history. Upstream v2 is a rewrite with a new data
  layer that abandons downloads and reading progress when migrating v1
  data; this fork will not do that.
- **Actively maintained**: runs on current React Native (0.82, new
  architecture, Hermes); known-dead sources removed and broken parsers
  repaired; richer fork backups plus a one-step import of the official
  app's database; crash and download fixes; signed release APKs; update
  checks point here, not upstream.

## Release lines

- **1.2.x** - the refurbed classic (current:
  [1.2.0](https://github.com/chief-afk/lnreader-v1/releases/tag/v1.2.0)).
  The v1 app with bundled sources, kept alive with patches and fixes.
- **1.3.x (upcoming)** - adds the community-maintained v2 plugin
  ecosystem (300+ actively maintained sources), so the app stays
  functional long term instead of rotting with its bundled sources.
  This line also trims accumulated complexity. The app design does not
  change.

## This fork vs upstream v2

Upstream 2.0 is a ground-up rewrite: new UI, new navigation, a new
reader, new storage, a new plugin system. It is a different app that
carries the same name. The pains listed below are design consequences
of that rewrite, not bugs it will grow out of. This fork is built on
the opposite contract: the v1 app keeps working and your data never
moves.

|           | This fork                                                            | Upstream v2                                                                     |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| App       | Same v1 app and UI. Updates fix things; they never redesign them.    | New navigation, themes, icons, reader, and settings layout.                     |
| v1 data   | Library, reading progress, history, bookmarks, and categories are all kept. One-step full import from the official app. | Downloads and reading progress do not transfer from v1. |
| TTS       | Play/pause in the reader toolbar, one tap, as it has always been.    | Redesigned around a draggable floating icon whose position resets.              |
| Updates   | Small, tested patches on a pinned, stable stack.                     | Fast-moving rewrite; releases have shipped install failures, update bugs, and lost libraries. |
| Sources   | Bundled sources today; support for the v2 plugin ecosystem lands in 1.3.x. | A larger ecosystem, but nothing preinstalled: you add sources yourself.         |
| Direction | Frozen on purpose: fixes and plugin support only.                    | Active new-feature development on the new base.                                 |

Use v2 for the new UI and newer features. Use this fork only if you
want the good old v1 look and feel, with no unexpected updates
breaking your library.

## Sources in 1.3.x

The bundled catalog is trimmed on purpose. Sources whose sites died were
removed in 1.3.0 rather than shipped as known-dead entries; the growth
path is the community-maintained v2 plugin ecosystem, which the fork
runs natively.

### Plugins

Browse > the puzzle icon in the searchbar opens the plugin browser,
listing everything in the official LNReader plugin repository. Install
adds the source to Browse like any bundled source; the browser shows
Update when the repo offers a newer version, and Uninstall removes the
plugin and its data. A broken plugin fails alone: the error is visible
on its card, and its source screen shows a retry state instead of
taking the app down.

### Repositories

The official plugin repo is built in and enabled by default. You can add
your own from the plugin browser's repository manager. Repositories must
be https:// (plain http works only for localhost when testing), and they
run third-party code on your device: only add repositories you trust.
The app asks for confirmation before adding one.

## Migrating from official LNReader v1

The fork installs as a separate app (`com.chief.lnreader.v1`); it cannot
update the official app in place. There are two migration paths:

### 1. Backup file (works for everyone, library only)

1. In the official app: Settings > Backup > Create backup.
2. In the fork: Settings > Backup > Restore backup, and pick that file.

This restores your library (novels, followed state, unread counts).
A v1.1.19 backup file physically contains only the novels list, so
reading progress, history, bookmarks, and categories cannot travel this
way. Backups created by the fork itself are richer: they also carry
chapters with read/bookmark flags, history, and categories, and restore
fully without a network connection.

One caveat if your library includes plugin sources: a backup file
references them by numeric id only, so on a fresh device, install your
plugins before restoring (or in the same order afterwards); a different
order can attach restored novels to the wrong plugin.

### 2. Old app database (full state, needs root or adb)

The only place your full v1 state (reading progress, history,
categories) exists is the official app's database file:

```
/data/data/com.rajarsheechatterjee.LNReader/files/SQLite/lnreader.db
```

Extracting it from a phone requires one of:

- **Root** (any Android version): copy the file with any root file
  manager or `adb pull`.
- **Android 11 or older, no root**: `adb backup -f v1.ab com.rajarsheechatterjee.LNReader`,
  then extract `lnreader.db` from the archive with
  [Android Backup Extractor](https://github.com/nelenkov/android-backup-extractor).
  On Android 12+ this produces an empty archive; there is no non-root
  path on modern Android.

Then:

1. Close the official app before copying (so the database is fully
   written) and transfer `lnreader.db` to the new device.
2. In the fork: Settings > Backup > Import old app database, and pick
   the file.

The import merges into whatever the fork already has: novels, chapters
with read flags and bookmarks, history, and categories. Downloaded
chapters do not transfer (their stored pages stay in the old app); the
fork will simply re-download on demand.

## Importing a backup from official LNReader v2

A library backup from the official v2 app can be imported in Settings >
Backup > Import v2 backup. Create one in the official app first
(Settings > Backup; a local backup file is enough, no Google account
needed).

The import brings over the library (novels, followed state, unread
flags), reading history, categories, and the backup's plugin list: v2
plugins you had installed appear in the plugin browser ready to
install. App settings do not transfer, and downloaded chapter files do
not transfer either (chapters re-download on demand). The import is
one-way: the fork has no v2 backup export. On a fresh device, seeded
plugins are listed but not downloaded; the import itself remaps each
novel to the locally installed plugin, so install order does not
matter here. Uninstalling a plugin does free its numeric id for
reuse, though: after an uninstall/reinstall cycle, that plugin's old
library entries can end up attached to a different plugin.

---

For official LNReader support, visit the
[LNReader repository](https://github.com/LNReader/lnreader).
