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

|         | This fork                    | Upstream v2                 |
| ------- | ---------------------------- | --------------------------- |
| App     | Same v1 app and UI           | Rewrite with a new UI       |
| v1 data | Preserved; imports v1        | Dropped on migration        |
| Sources | Fixed here; plugins in 1.3.x | Separate repo, more of them |

Pick this fork to keep the v1 app and your data. Pick v2 for the new UI
if you do not care about v1 data.

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

---

For official LNReader support, visit the
[LNReader repository](https://github.com/LNReader/lnreader).
