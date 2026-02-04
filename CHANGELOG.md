# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

























## [1.0.0] - 2026-02-04

### Breaking Changes

- device sync and improved mood/activity mapping

### Fixed

- fix type error in playlist builder

### Other Changes

- Merge pull request #16 from cardner/usb-sync
- Merge pull request #15 from cardner/usb-sync

## [0.13.0] - 2026-01-27

### Added

- make it so metadata edits can be synced back to the original file. some improvements to progress resume

### Other Changes

- Merge pull request #14 from cardner/file-write-back

## [0.12.0] - 2026-01-26

### Added

- add scanning and processing resume

### Other Changes

- Merge pull request #13 from cardner/scan-resume

## [0.11.3] - 2026-01-25

### Fixed

- improve performance and code handling

## [0.11.2] - 2026-01-20

### Fixed

- trying for a valid manifest file again

### Other Changes

- Update deploy workflow to remove pull_request trigger
- Merge pull request #12 from cardner/pwa-manifest

## [0.11.1] - 2026-01-20

### Fixed

- fixes errors in manifest file

### Other Changes

- Merge pull request #11 from cardner/pwa-manifest

## [0.11.0] - 2026-01-19

### Added

- added help docs
- add offline and desktop install PWA manifest

### Other Changes

- Merge pull request #10 from cardner/pwa-init

## [0.10.0] - 2026-01-19

### Added

- created visual editor for flow arch

### Other Changes

- Merge pull request #9 from cardner/visual-arch-editor

## [0.9.0] - 2026-01-18

### Added

- add a focused editor mode

### Other Changes

- Merge pull request #8 from cardner/editor-mode

## [0.8.2] - 2026-01-18

### Fixed

- improve usage of tempo in playlist generation
- improves reliability of calculating the tempo for tracks as uploading to collection
- improve tempo dectection

### Other Changes

- Merge pull request #7 from cardner/tempo-fix

## [0.8.1] - 2026-01-11

### Fixed

- hot fix for broken meta data parser for a collection

## [0.8.0] - 2026-01-11

### Added

- add import and export of collection databases
- add itunes playlist export and library track playback

### Fixed

- use proper unicode quotes
- improve paths of files in playlists

### Other Changes

- Merge pull request #6 from cardner/playlist-export

## [0.7.1] - 2026-01-10

### Fixed

- improve performance of search boxes with large collections

### Other Changes

- Merge pull request #5 from cardner/perf-improvements

## [0.7.0] - 2026-01-10

### Added

- adding better responsive layout for mobile screens.

### Other Changes

- Merge pull request #4 from cardner/ui-responsive

## [0.6.3] - 2025-12-20

### Fixed

- add app icon

## [0.6.2] - 2025-12-20

### Fixed

- attempt to fix permissions errors on prod site

## [0.6.1] - 2025-12-20

### Fixed

- improve scanning of network drives

## [0.6.0] - 2025-12-20

### Added

- complete component documentation, refactor common services and make improvements rednering and memorization

### Other Changes

- Merge pull request #3 from cardner/music-preview

## [0.5.0] - 2025-12-19

### Added

- fix music preview player. still need to integrate playback UI into track list
- add music discovery feature to playlist generation utilzing musicbrainz api

### Fixed

- fix undefined error for release note script

### Other Changes

- Merge pull request #2 from cardner/music-discovery
- Merge pull request #1 from cardner/music-discovery

## [0.4.0] - 2025-12-18

### Added

- add integration for common LLMs, improve tempo and flow arc editing, normalize genres

### Fixed

- fix type errors in build script

## [0.3.0] - 2025-12-18

### Added

- add button to start new collection creation after a saved collection is present

## [0.2.1] - 2025-12-17

### Fixed

- improve UI for manual scans and ensure that saved collections can be deleted

## [0.2.0] - 2025-12-17

### Added

- add editability to saved collections for users

### Fixed

- failing yarn install in CI
- adding froze lock file back in

## [0.1.1] - 2025-12-17

### Fixed

- CI pipeline deployment

### Other Changes

- initial creation of app

