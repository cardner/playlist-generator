# GitHub Actions Workflows

## deploy.yml

This workflow automatically builds, deploys, and releases the application when changes are pushed to the `main` branch.

### What it does:

1. **update-changelog-and-version** (runs first on push to main):
   - Calculates semantic version from conventional commits and updates `package.json`
   - Generates release notes from commit history
   - Updates `CHANGELOG.md` with the new version entry
   - Commits and pushes `package.json` and `CHANGELOG.md` with `[skip ci]`
2. **build** (runs after update job; checks out `main` to include the version bump):
   - Builds the application with `yarn build` (so the deployed site has the new version)
   - Creates the git tag for the release
   - Deploys to GitHub Pages and creates the zip artifact
3. **release**: Creates the GitHub Release with the zip file and release notes attached

### Triggering:

- Automatically on push to `main` branch
- Automatically on pull requests to `main` branch (build only, no deployment)
- Manually via `workflow_dispatch`

### Requirements:

- GitHub Pages must be enabled in repository settings
- Source must be set to "GitHub Actions" (not branch)
- Repository must have write permissions for releases and tags

### Conventional Commits:

The workflow uses conventional commits to determine version bumps:
- `feat:` → minor version bump (0.1.0 → 0.2.0)
- `fix:` → patch version bump (0.1.0 → 0.1.1)
- `BREAKING CHANGE:` or `!` → major version bump (0.1.0 → 1.0.0)

### Output:

- Static site deployed to GitHub Pages
- GitHub Release with version tag (e.g., `v0.1.1`)
- Zip file attached to release
- Updated `CHANGELOG.md` in repository

