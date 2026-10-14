# LNReader v1

An unofficial fork of LNReader maintaining the v1 architecture with selective improvements.

## NO SUPPORT

This fork is maintained independently. **No support or assistance will be provided.**

## Looking for LNReader?

- **Download this fork**: get releases from [chief-afk/lnreader-v1 releases](https://github.com/chief-afk/lnreader-v1/releases)
- **Upstream project**: [LNReader/lnreader](https://github.com/LNReader/lnreader) (the v2 line; not this fork)

## About This Fork

- **Based on**: LNReader v1.1.19 (last official v1 release)
- **Actively maintained, not frozen**: migrated to React Native 0.82 (new
  architecture, Hermes), receives dependency updates, and ships signed
  release APKs.
- **What "v1" means here**: the app design and user model, kept on purpose.
  Retaining the v1 data model is what keeps v1 data working: backups
  exported from the official v1 app restore in this fork, and your library,
  reading progress, and history are never dropped or reset by an update.
  Upstream v2 is a rewrite with a new data layer that abandons downloads
  and reading progress on migration; this fork will not do that to v1 data.
- **Releases**: published as 1.2.x; each release's notes live on the
  [Releases page](https://github.com/chief-afk/lnreader-v1/releases)
- **Focus**: Maintaining v1 architecture while selectively adding improvements
- **Support**: None provided

## What this fork changes over official v1.1.19

- Runs on current React Native (0.82, new architecture, Hermes), so it
  builds and installs correctly on modern Android.
- Working sources: known-dead sources removed and broken source parsers
  repaired against their live sites.
- Backup and restore overhaul: richer fork backups (chapters with
  read/bookmark flags, history, categories) plus a one-step import of
  the official app's database for full reading state.
- Bug fixes: novel refresh crash, reader and download regressions,
  update checks pointing at this repository.

## This fork vs upstream v2

|         | This fork (v1.2.x)                  | Upstream v2                         |
| ------- | ----------------------------------- | ----------------------------------- |
| App     | Same v1 app and UI                  | Rewrite with a new UI               |
| v1 data | Preserved; official v1 data imports | Dropped on migration                |
| Sources | Maintained in this repo             | Separate plugins repo, more of them |
| Support | None                                | Upstream's channels                 |

Pick this fork if you are on official v1 and want the same app that
keeps your data. Pick v2 if you want the newest UI and do not care
about v1 data.

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

For official LNReader support, visit the [LNReader repository](https://github.com/LNReader/lnreader).
