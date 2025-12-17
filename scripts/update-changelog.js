#!/usr/bin/env node

/**
 * CHANGELOG.md Updater
 * 
 * Updates CHANGELOG.md with a new version entry.
 * 
 * Usage: node scripts/update-changelog.js [version] [release-notes-file]
 * 
 * If release-notes-file is provided, reads from that file.
 * Otherwise, generates release notes from commits.
 */

const fs = require('fs');
const path = require('path');
const { generateChangelogEntry, getCommitsSinceLastTag } = require('./release-notes');

const CHANGELOG_PATH = path.join(process.cwd(), 'CHANGELOG.md');
const UNRELEASED_HEADER = '## [Unreleased]';

// Read existing CHANGELOG.md
function readChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

${UNRELEASED_HEADER}

`;
  }
  
  return fs.readFileSync(CHANGELOG_PATH, 'utf8');
}

// Insert new version entry after Unreleased section
function insertVersionEntry(changelog, version, releaseNotes) {
  const date = new Date().toISOString().split('T')[0];
  const newEntry = `## [${version}] - ${date}\n\n${releaseNotes}\n\n`;
  
  // Find Unreleased section
  const unreleasedIndex = changelog.indexOf(UNRELEASED_HEADER);
  
  if (unreleasedIndex === -1) {
    // No Unreleased section, prepend to file
    return newEntry + changelog;
  }
  
  // Find the end of the Unreleased section (next ## header or end of file)
  const afterUnreleased = changelog.slice(unreleasedIndex);
  const nextVersionMatch = afterUnreleased.match(/\n## \[/);
  const unreleasedEnd = nextVersionMatch 
    ? unreleasedIndex + nextVersionMatch.index + 1
    : unreleasedIndex + afterUnreleased.length;
  
  // Insert new entry after Unreleased section
  const before = changelog.slice(0, unreleasedEnd);
  const after = changelog.slice(unreleasedEnd);
  
  return before + '\n' + newEntry + after;
}

// Main execution
function main() {
  try {
    const version = process.argv[2];
    const releaseNotesFile = process.argv[3];
    
    if (!version) {
      console.error('Error: Version argument required');
      console.error('Usage: node scripts/update-changelog.js [version] [release-notes-file]');
      process.exit(1);
    }
    
    // Get release notes
    let releaseNotes;
    if (releaseNotesFile && fs.existsSync(releaseNotesFile)) {
      releaseNotes = fs.readFileSync(releaseNotesFile, 'utf8').trim();
    } else {
      // Generate from commits
      const commits = getCommitsSinceLastTag();
      const { generateReleaseNotes } = require('./release-notes');
      releaseNotes = generateReleaseNotes(version, commits);
    }
    
    // Read existing changelog
    const changelog = readChangelog();
    
    // Insert new entry
    const updatedChangelog = insertVersionEntry(changelog, version, releaseNotes);
    
    // Write back to file
    fs.writeFileSync(CHANGELOG_PATH, updatedChangelog, 'utf8');
    
    console.log(`CHANGELOG.md updated with version ${version}`);
  } catch (error) {
    console.error('Error updating CHANGELOG.md:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { readChangelog, insertVersionEntry };

