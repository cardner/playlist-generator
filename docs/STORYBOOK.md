# Storybook E2E Testing

## Setup

1. **Install Playwright browsers** (required for test-storybook):

   ```bash
   npx playwright install chromium
   ```

2. **Generate initial screenshot snapshots** (first time only):

   ```bash
   yarn build-storybook
   yarn test-storybook:serve-update
   ```

   Commit the generated `__image_snapshots__/` directory so CI can compare against baselines.

## Commands

| Command | Description |
|---------|-------------|
| `yarn storybook` | Start dev server on port 6006 |
| `yarn build-storybook` | Build static site to `storybook-static/` |
| `yarn test-storybook` | Run tests (smoke + screenshot comparison) |
| `yarn test-storybook:ci` | Run tests in CI mode (fails on snapshot diff) |
| `yarn test-storybook:update` | Update screenshot snapshots |
| `yarn test-storybook:serve` | Serve built Storybook + run tests |
| `yarn test-storybook:serve-update` | Serve built Storybook + run tests with snapshot update |

## Local vs CI

- **Local**: `yarn test-storybook` allows updating snapshots with `-u` when UI changes are intentional.
- **CI**: `yarn test-storybook:ci` fails on any snapshot diff; snapshots must be updated locally and committed.

## CI Baseline Comparison

On pull requests, the workflow compares screenshots against **main's** `__image_snapshots__/` baselines (not the PR branch). This keeps baselines stable and avoids merge conflicts.

**When tests fail:**

1. Download the `storybook-visual-diffs` artifact from the failed run (diff images and received screenshots).
2. If the changes are intentional, update baselines locally:

   ```bash
   yarn test-storybook:serve-update
   ```

3. Commit the updated `__image_snapshots__/` and push. Merge to main so future PRs use the new baselines.

## Tag: no-screenshot

Stories tagged with `no-screenshot` run for smoke tests but skip screenshot capture (e.g. EmojiPicker, SavePlaylistDialog).
