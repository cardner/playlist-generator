# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
















































## [1.14.0] - 2026-02-16

### Added

- **ipod**: add overwrite same-name playlist option with UI checkbox

### Other Changes

- Merge pull request #65 from cardner/ipod-playlist-overwrite

## [1.13.0] - 2026-02-16

### Added

- **playlist**: support saving changes in and out of edit mode

### Fixed

- **device-sync**: skip iPod setup on auto-select and fix PlaylistDisplay story types

### Other Changes

- Merge pull request #64 from cardner/playlist-error-fix
- Merge pull request #63 from cardner/playlist-save

## [1.12.2] - 2026-02-16

### Fixed

- **playlist**: ensure save changes works for edited saved playlists

### Other Changes

- Merge pull request #62 from cardner/playlist-save

## [1.12.1] - 2026-02-16

### Fixed

- **playlist**: replace single track on delete instead of full regeneration

### Other Changes

- Merge pull request #61 from cardner/playlist-edit

## [1.12.0] - 2026-02-15

### Added

- **ipod**: match existing device tracks and add missing-tracks prompt

### Other Changes

- Merge pull request #60 from cardner/ipod-sync-id

## [1.11.2] - 2026-02-15

### Fixed

- make library stats more accurate

### Other Changes

- Merge pull request #59 from cardner/library-view-stats
- Skip visual snapshot tests for WhatsNewPanel stories

## [1.11.1] - 2026-02-15

### Fixed

- avoid duplicate collection creation when scanning current collection

### Other Changes

- Merge pull request #58 from cardner/fix-dedup

## [1.11.0] - 2026-02-15

### Added

- add what's new panel

### Fixed

- upgrade storybook
- add new screenshots for testing

### Other Changes

- Merge pull request #57 from cardner/whats-new

## [1.10.1] - 2026-02-15

### Fixed

- add in proper styling for screenshots
- improve spacing in help panel and make banners dismissable

### Other Changes

- Merge pull request #56 from cardner/resume-scan-dismiss

## [1.10.0] - 2026-02-15

### Added

- improve mapping of moods and activities to metadata

### Other Changes

- Merge pull request #55 from cardner/improve-playlist-mix

## [1.9.0] - 2026-02-15

### Added

- add prompt queues for built-in agents
- add additional prompt for llm generation

### Other Changes

- Merge pull request #54 from cardner/llm-prompt

## [1.8.0] - 2026-02-15

### Added

- add suggested genres while generating playlists
- add better file name outputs for playlists

### Fixed

- add missing screenshot test

### Other Changes

- Merge pull request #53 from cardner/file-name-fix

## [1.7.1] - 2026-02-12

### Fixed

- improve track matching between device and collections
- improve fuzzy search look up

### Other Changes

- Merge pull request #52 from cardner/recent-playlists

## [1.7.0] - 2026-02-12

### Added

- add recent playlist generator and improve fuzzy matches on device syncs

### Other Changes

- Merge pull request #51 from cardner/recent-playlists

## [1.6.0] - 2026-02-09

### Added

- fix spotify import

### Other Changes

- Merge pull request #50 from cardner/spotify-import

## [1.5.0] - 2026-02-09

### Added

- add visual regression tests via storybook

### Fixed

- try fixing screen shot tolerances
- move up enable corepack
- make yarn behave in CI
- fix node version

### Other Changes

- Merge pull request #49 from cardner/storybook

## [1.4.0] - 2026-02-08

### Added

- increase MAX_FULL_HASH_BYTES to 256MB for FLAC support
- upgrade hash function to SHA-256 for collision resistance
- validate ISRC format to prevent incorrect cross-collection matching
- implement streaming hash with lower memory cap
- new universal track IDs
- improve UI spacing and table search

### Fixed

- fixed a bunch of issues with collection management and permission
- improve type safety for globalIndexCache in DeviceSyncPanel and PlaylistExport
- improve type safety for globalIndexCache in PlaylistExport
- **lint**: ignore generated public/metadataWorker.js

### Performance

- parallelize fingerprint generation in saveTrackMetadata
- use bulkGet for parallel fileIndex queries in findFileIndexByGlobalTrackId

### Changed

- improve chunked hashing with better memory management

### Other Changes

- Merge pull request #39 from cardner/upgrades
- Merge pull request #47 from cardner/copilot/sub-pr-39-9b9f772d-ec2d-4f20-8e37-0061aa2468eb
- Merge pull request #40 from cardner/copilot/sub-pr-39
- Merge pull request #48 from cardner/copilot/sub-pr-39-0640c6eb-4c23-44d8-bd50-3e3e71e7e25e
- Merge branch 'upgrades' into copilot/sub-pr-39-0640c6eb-4c23-44d8-bd50-3e3e71e7e25e
- Merge pull request #43 from cardner/copilot/sub-pr-39-yet-again
- Merge pull request #45 from cardner/copilot/sub-pr-39-please-work
- Merge branch 'upgrades' into copilot/sub-pr-39-please-work
- Merge pull request #44 from cardner/copilot/sub-pr-39-one-more-time
- Move BPM_PRESETS constant to module scope for better performance
- Optimize LibrarySearchCombo performance by precomputing catalogs
- Merge pull request #46 from cardner/copilot/sub-pr-39-edf9f06f-2f04-4618-be38-c8d4a95f2d80
- Merge pull request #42 from cardner/copilot/sub-pr-39-another-one
- Remove redundant pagination termination check
- Add comments explaining memory tradeoffs and make code more defensive
- Use cursor-based pagination and remove redundant abort check
- Merge pull request #41 from cardner/copilot/sub-pr-39-again
- Optimize resolveTrackIdentitiesForLibrary to use chunked iteration and yielding
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Update src/components/MetadataEnhancement.tsx
- Update src/components/LibrarySearchCombo.tsx

## [1.3.0] - 2026-02-07

### Added

- switch to consolidate design system

### Fixed

- remove unused className prop from Popover component

### Other Changes

- Merge pull request #34 from cardner/design-system
- Merge pull request #38 from cardner/copilot/sub-pr-34-another-one
- Merge pull request #37 from cardner/copilot/sub-pr-34-again
- Merge pull request #36 from cardner/copilot/sub-pr-34
- Initial plan
- Initial plan
- Initial plan
- Update src/__tests__/design-system/Tabs.test.tsx
- Update src/design-system/components/Dialog.tsx
- Merge pull request #35 from cardner/copilot/sub-pr-34
- Initial plan

## [1.2.1] - 2026-02-07

### Fixed

- fix unit test runner

### Other Changes

- Merge pull request #33 from cardner/processesing-enhancements

## [1.2.0] - 2026-02-07

### Added

- add playlist export and import

### Other Changes

- Merge pull request #32 from cardner/processesing-enhancements

## [1.1.1] - 2026-02-07

### Fixed

- improve file matching
- stashing these changes

### Other Changes

- Merge pull request #31 from cardner/processesing-enhancements

## [1.1.0] - 2026-02-05

### Added

- improve tempo detect and playback

### Other Changes

- Merge pull request #17 from cardner/processesing-enhancements
- Merge pull request #27 from cardner/copilot/sub-pr-17-7f16a4de-21b4-467e-a6a8-901ab3ee99c6
- Merge pull request #28 from cardner/copilot/sub-pr-17-01224dbe-588b-4f6a-a396-20e5b7c6b79f
- Merge pull request #26 from cardner/copilot/sub-pr-17-83b9462b-f4c4-442b-b5ef-cb99574c39be
- Merge pull request #25 from cardner/copilot/sub-pr-17-f0c90b93-6c27-45e9-9f36-b33c4ddf2faa
- Add maximum delay cap to prevent potential overflow in exponential backoff
- Optimize exponential backoff calculation using bit shifting
- Fix race condition and retry counter logic in FFmpeg loading
- Extract MAX_PLAY_ATTEMPTS to shared constant
- Use try-finally block for AudioContext cleanup to avoid duplication
- Add error caching and exponential backoff for FFmpeg loading
- Simplify EncodingError detection to use standard name property
- Improve error handling to distinguish AudioContext unavailability from decode errors
- Improve encoding error detection in tempo-detection-worker
- Initial plan
- Initial plan
- Initial plan
- Initial plan
- Update scripts/build-metadata-worker.js
- Update src/hooks/useMetadataParsing.ts
- Update src/components/MultiCriteriaTrackSearch.tsx
- Update public/metadataWorker.js
- Update public/metadataWorker.js
- Update src/hooks/useWakeLock.ts
- Merge pull request #22 from cardner/copilot/sub-pr-17-one-more-time
- Merge branch 'processesing-enhancements' into copilot/sub-pr-17-one-more-time
- Merge pull request #23 from cardner/copilot/sub-pr-17-please-work
- Merge pull request #21 from cardner/copilot/sub-pr-17-yet-again
- Refine path resolution with better naming and optimized checks
- Improve path resolution logic to check files before directories
- Merge pull request #24 from cardner/copilot/sub-pr-17-91dc2d5e-9299-4595-9a54-e51a1db5aa3f
- Fix path alias resolution to handle directory imports with index.ts
- Move pool.terminate() to finally block for proper cleanup
- Merge pull request #19 from cardner/copilot/sub-pr-17-again
- Merge pull request #18 from cardner/copilot/sub-pr-17
- Extract handlePlaybackFailure helper to reduce code duplication
- Merge pull request #20 from cardner/copilot/sub-pr-17-another-one
- Fix retry logic to ensure exactly MAX_PLAY_ATTEMPTS tries
- Remove async keyword from TransformStream start method
- Extract MAX_PLAY_ATTEMPTS constant and fix retry condition
- Add error logging and user notification for playback retry failures
- Fix wake lock to prevent duplicate requests and handle unmount race condition
- Fix handler reference order to avoid temporal dead zone
- Initial plan
- Fix timeout handler to remove event listener and prevent memory leaks
- Update public/metadataWorker.js
- Update src/features/library/ffmpeg-tempo-fallback.ts
- Initial plan
- Initial plan
- Improve code clarity in closeSharedDecodeContext
- Initial plan
- Fix race condition in AudioContext cleanup
- Update src/hooks/useMetadataParsing.ts
- Initial plan
- Initial plan
- Add AudioContext cleanup with idle timeout to prevent resource leaks
- Update public/metadataWorker.js
- Update jest.setup.js
- Update src/hooks/useMetadataParsing.ts
- Initial plan

## [1.0.1] - 2026-02-05

### Other Changes

- Merge pull request #30 from cardner/copilot/set-up-copilot-instructions
- Add comprehensive Copilot instructions file
- Initial plan

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

