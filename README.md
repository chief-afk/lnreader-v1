# LNReader v1

Unofficial fork of LNReader that keeps the v1 app alive: same design,
your data preserved, actively maintained. No support will be provided for this.

## Download

- **Latest 1.3.x** - v1 with plugin support (**recommended**):
  [releases](https://github.com/chief-afk/lnreader-v1/releases)
- **1.2.x** - original v1 (with stability updates), no plugins support:
  [v1.2.0](https://github.com/chief-afk/lnreader-v1/releases/tag/v1.2.0)
- **Official app** - LNReader V2, official project (a rewrite):
  [LNReader/lnreader releases](https://github.com/LNReader/lnreader/releases)

## What this fork is

Same v1 app, based on official v1.1.19: the design and user model are
unchanged on purpose, and the v1 data model is kept. Backups from the
official app restore cleanly, and updates never drop your library,
reading progress, or history. Upstream v2 is a ground-up rewrite with a
new data layer - downloads and reading progress do not transfer from v1
there. It is a different app carrying the same name.

|           | This fork                                                             | Upstream v2                                     |
| --------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| App       | Same v1 app and UI; updates fix things, never redesign them.          | New navigation, themes, reader, settings.       |
| v1 data   | Library, progress, history, bookmarks, categories kept; one-step full import from the official app. | Downloads and progress do not transfer from v1. |
| TTS       | Play/pause in the reader toolbar, one tap.                            | Draggable floating icon whose position resets.  |
| Updates   | Small, tested patches on a pinned, stable stack.                      | Fast-moving rewrite.                            |
| Sources   | Bundled catalog plus the v2 plugin ecosystem.                         | Nothing preinstalled; you add sources yourself. |
| Direction | Frozen on purpose: fixes and plugin support only.                     | Active new-feature development on the new base. |

Maintained on current React Native (0.82, new architecture, Hermes):
known-dead sources removed, broken parsers repaired, crash and download
fixes, signed release APKs. Update checks point here, not upstream.

## Release lines

- **1.3.x** (current:
  [1.3.1](https://github.com/chief-afk/lnreader-v1/releases/tag/v1.3.1)) -
  v1 with the community-maintained v2 plugin ecosystem (300+ maintained
  sources). Browse defaults to installed plugins; "Show legacy v1
  sources" in Browse settings reveals the bundled catalog, which keeps
  working for restored backups and imports either way. Dead bundled
  sources were removed in 1.3.0 rather than shipped as known-dead
  entries.
- **1.2.x** (current:
  [1.2.0](https://github.com/chief-afk/lnreader-v1/releases/tag/v1.2.0)) -
  v1 without plugins, kept alive with patches.

### Plugins and repositories

The puzzle icon in Browse's searchbar opens the plugin browser, listing
the official LNReader plugin repository. Install, Update, and Uninstall
work per plugin; a broken plugin fails alone. The official repo is built
in and enabled by default; you can add your own in the repository
manager. Repositories must be https and run third-party code on your
device: only add ones you trust (the app asks for confirmation).

## Migrating from official LNReader v1

The fork installs as a separate app (`com.chief.lnreader.v1`); it cannot
update the official app in place.

### 1. Backup file (library only, works for everyone)

1. Official app: Settings > Backup > Create backup.
2. Fork: Settings > Backup > Restore backup, pick the file.

Restores the novels list (followed state, unread counts). A v1.1.19
backup carries nothing else; fork-made backups also carry chapters with
read/bookmark flags, history, and categories.

If your library uses plugin sources: install the plugins before
restoring (or in the same order afterwards). A backup references plugins
by numeric id only, and a different install order can attach restored
novels to the wrong plugin.

### 2. Old app database (full state, needs root or adb)

Full v1 state (progress, history, categories) lives in the official
app's database:

```
/data/data/com.rajarsheechatterjee.LNReader/files/SQLite/lnreader.db
```

Getting it: with **root**, copy with any file manager or `adb pull`.
On **Android 11 or older without root**, `adb backup -f v1.ab
com.rajarsheechatterjee.LNReader`, then extract with
[Android Backup Extractor](https://github.com/nelenkov/android-backup-extractor)
(Android 12+ produces an empty archive; no non-root path on modern
Android).

Then close the official app, transfer `lnreader.db`, and in the fork use
Settings > Backup > Import old app database. The import merges novels,
chapters with read flags and bookmarks, history, and categories;
downloaded chapters re-download on demand.

## Importing a backup from official LNReader v2

Settings > Backup > Import v2 backup picks a backup created in the
official v2 app (Settings > Backup; a local backup is enough). It brings
over the library, reading history, categories, and the plugin list:
imported plugins appear in the plugin browser ready to install. App
settings and downloaded chapter files do not transfer; the import is
one-way (the fork has no v2 export). Novels are remapped to the locally
installed plugin, so install order does not matter; after an
uninstall/reinstall cycle a plugin's old library entries can end up
attached to a different plugin.

## Trackers

Browsing AniList or MyAnimeList from Discover works without any account.
Syncing reading progress via More > Settings > Tracking needs API
credentials: register your own app at
[anilist.co/settings/developer](https://anilist.co/settings/developer)
(redirect `lnreaderv1://`) or
[myanimelist.net/panel/apiclient](https://myanimelist.net/panel/apiclient),
then build the app with the client ids set - see `.env.example`. Without
them, tracker login shows a hint instead of opening the service's login
page.

---

For official LNReader support, visit the
[LNReader repository](https://github.com/LNReader/lnreader).
