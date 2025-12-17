# GitHub Actions Workflows

## deploy.yml

This workflow automatically builds, deploys, and releases the application when changes are pushed to the `main` branch.

### What it does:

1. **Builds the application** using `yarn build`
2. **Calculates semantic version** from conventional commits
3. **Generates release notes** from commit history
4. **Updates CHANGELOG.md** with new version entry
5. **Deploys to GitHub Pages** as a static site
6. **Creates a zip artifact** of the built site
7. **Creates a GitHub Release** with the zip file attached

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

