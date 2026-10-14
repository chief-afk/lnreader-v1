# LNReader v1 - repo rules

## Mission

This repo maintains exactly one thing: a functional **LNReader v1** app. It is
an independent, no-support fork (see README) pinned to the v1 architecture.
It is not a staging ground for v2 and does not track upstream development.

## v1 data compatibility (critical goal)

Keeping v1 user data working is a hard requirement of this fork, not a
nice-to-have:

- The fork installs under its own applicationId (`com.chief.lnreader.v1`;
  official v1 was `com.rajarsheechatterjee.LNReader`), so there is no
  in-place upgrade from official v1. Backup import is the migration path,
  which makes the v1 backup format (`lnreader_backup_*.json`, a JSON array
  of `novels` rows) a permanent compatibility surface: it must keep
  restoring in every 1.2.x release.
- The v1 storage model (library with categories, chapter read flags,
  history, downloads) must keep working across updates for existing fork
  users. Reading progress and history must never be dropped or reset by a
  schema, storage, or data-layer change.
- Any change touching backup/restore, the database schema, or the data
  layer needs verification against a real v1.1.19 backup on the emulator
  before it ships.
- Never adopt a data layer that orphans v1 data. Upstream v2 is the
  cautionary example: its rewrite drops downloads and reading progress on
  migration.

## Versioning (hard rule)

- Every fork release lives in the **1.2.x** line: 1.2.0, 1.2.1, 1.2.2, ...
- Never release as, or rebrand to, 1.3+, 2.x, or anything colliding with
  upstream versioning. The 1.2.x line keeps fork releases distinct from
  upstream history forever.
- `src/utils/versionUtils.ts` `appVersion` must match the released
  package.json version at tag time.
- Releases are git tags `v1.2.x` pushed to chief-afk/lnreader-v1; the
  tag-triggered workflow builds and publishes the signed APK.
- There is no CHANGELOG.md. Release highlights are written as the
  **annotated tag message** (one summary line, blank line, bullet
  list); `release.yml` turns it into the GitHub Release body on top of
  GitHub's generated notes. When tagging, always create annotated tags
  with the notes in the message - never lightweight tags.
- Before tagging: appVersion updated, About/update-checker pointed at
  this repo, main pushed and CI green.

## Upstream relationship

- Upstream is LNReader/lnreader, which develops the v2 line. Never pull bulk
  changes from it. Cherry-pick only small, v1-applicable fixes after checking
  they actually apply to this codebase.
- Everything user-facing (update checker, About screen, changelogs, download
  links) must point at chief-afk/lnreader-v1, never upstream.
- The no-support posture stands: independently maintained, no user support.

## Account

All work in this repo is committed and published as **chief-afk**. Never push
to or open PRs against upstream from this repo.

## Technical constraints

- Target platform: React Native 0.82 line, new architecture (bridgeless),
  Hermes. Dropping to the old bridge is not an option (reanimated 4 requires
  new arch).
- These pins exist because semver drift broke the build - do not bump them
  without a build plus emulator smoke test:
  - `cheerio 1.0.0-rc.12` (exact) - the 1.x ESM build imports Node builtins
    that Metro cannot bundle.
  - `i18n-js 3.9.2` (exact) - the code uses the v3 default-export API.
- expo SDK 54 is the current ceiling. An SDK bump is a deliberate, tested
  migration, never part of a routine dependency update.
- Prefer removing dependencies over adding them. Keep the app ad-free and
  private: no ads, no analytics, no tracking, no crash-reporting SDKs.
- Removed-API watch: RN 0.82 removed legacy callbacks (`BackHandler.removeEventListener`,
  `Localization.locale`). Use the modern equivalents; do not reintroduce the
  old ones.

## Definition of working

A change is done when: `assembleDebug` builds, the app boots and navigates
(Library, Browse, Updates, and at least one source screen), and no new errors
appear in logcat. Verify on the emulator before committing substantive
changes.

## Maintenance posture

- Novel sources rot constantly. When a source's site is dead, fix or remove it
  in the same release rather than shipping known-dead entries.
- `_docs/` (backlog, findings, planning notes) is local scratch, gitignored,
  and never committed.
