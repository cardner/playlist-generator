#!/usr/bin/env node

/**
 * Release Notes Generator
 * 
 * Generates release notes from conventional commits since the last tag.
 * 
 * Usage: node scripts/release-notes.js [version]
 * 
 * Output: Prints Markdown-formatted release notes to stdout
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get commits since last tag
function getCommitsSinceLastTag() {
  try {
    // Get the last tag, or use initial commit if no tags exist
    let lastTag;
    try {
      lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
    } catch (e) {
      // No tags exist, get all commits
      lastTag = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' }).trim();
    }
    
    // Get commits since last tag with full message
    const commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"%H|%s|%b"`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => {
        const [hash, subject, ...bodyParts] = line.split('|');
        const body = bodyParts.join('|').trim();
        return { hash, subject, body };
      });
    
    return commits;
  } catch (error) {
    console.error('Error getting commits:', error.message);
    return [];
  }
}

// Parse conventional commit message
function parseCommit(commit) {
  const { subject, body } = commit;
  const conventionalCommitRegex = /^(\w+)(\(.+\))?(!)?:\s*(.+)$/;
  const match = subject.match(conventionalCommitRegex);
  
  const isBreaking = subject.includes('!') || body.includes('BREAKING CHANGE');
  
  if (!match) {
    return { 
      type: 'other', 
      scope: null,
      breaking: isBreaking, 
      message: subject,
      body: body,
    };
  }
  
  const [, type, scopeMatch, , message] = match;
  const scope = scopeMatch ? scopeMatch.slice(1, -1) : null;
  
  return {
    type: type.toLowerCase(),
    scope,
    breaking: isBreaking,
    message: message.trim(),
    body: body,
  };
}

// Categorize commits
function categorizeCommits(commits) {
  const categories = {
    breaking: [],
    feat: [],
    fix: [],
    docs: [],
    style: [],
    refactor: [],
    perf: [],
    test: [],
    chore: [],
    other: [],
  };
  
  for (const commit of commits) {
    const parsed = parseCommit(commit);
    
    if (parsed.breaking) {
      categories.breaking.push(parsed);
    } else if (categories[parsed.type]) {
      categories[parsed.type].push(parsed);
    } else {
      categories.other.push(parsed);
    }
  }
  
  return categories;
}

// Format commit message for release notes
function formatCommit(commit) {
  const scope = commit.scope ? `**${commit.scope}**: ` : '';
  return `- ${scope}${commit.message}`;
}

// Generate release notes Markdown
function generateReleaseNotes(version, commits) {
  const categories = categorizeCommits(commits);
  const sections = [];
  
  // Breaking Changes
  if (categories.breaking.length > 0) {
    sections.push('### Breaking Changes');
    sections.push('');
    categories.breaking.forEach(commit => {
      sections.push(formatCommit(commit));
    });
    sections.push('');
  }
  
  // Features
  if (categories.feat.length > 0) {
    sections.push('### Added');
    sections.push('');
    categories.feat.forEach(commit => {
      sections.push(formatCommit(commit));
    });
    sections.push('');
  }
  
  // Bug Fixes
  if (categories.fix.length > 0) {
    sections.push('### Fixed');
    sections.push('');
    categories.fix.forEach(commit => {
      sections.push(formatCommit(commit));
    });
    sections.push('');
  }
  
  // Documentation
  if (categories.docs.length > 0) {
    sections.push('### Documentation');
    sections.push('');
    categories.docs.forEach(commit => {
      sections.push(formatCommit(commit));
    });
    sections.push('');
  }
  
  // Performance
  if (categories.perf.length > 0) {
    sections.push('### Performance');
    sections.push('');
    categories.perf.forEach(commit => {
      sections.push(formatCommit(commit));
    });
    sections.push('');
  }
  
  // Refactoring
  if (categories.refactor.length > 0) {
    sections.push('### Changed');
    sections.push('');
    categories.refactor.forEach(commit => {
      sections.push(formatCommit(commit));
    });
    sections.push('');
  }
  
  // Other changes
  if (categories.other.length > 0) {
    sections.push('### Other Changes');
    sections.push('');
    categories.other.forEach(commit => {
      sections.push(formatCommit(commit));
    });
    sections.push('');
  }
  
  // If no categorized commits, list all
  if (sections.length === 0 && commits.length > 0) {
    sections.push('### Changes');
    sections.push('');
    commits.forEach(commit => {
      sections.push(`- ${commit.subject}`);
    });
    sections.push('');
  }
  
  return sections.join('\n');
}

// Generate CHANGELOG entry
function generateChangelogEntry(version, commits) {
  const date = new Date().toISOString().split('T')[0];
  const notes = generateReleaseNotes(version, commits);
  
  return `## [${version}] - ${date}\n\n${notes}`;
}

// Main execution
function main() {
  try {
    const version = process.argv[2] || 'Unreleased';
    const commits = getCommitsSinceLastTag();
    const releaseNotes = generateReleaseNotes(version, commits);
    
    // Output release notes
    console.log(releaseNotes);
  } catch (error) {
    console.error('Error generating release notes:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  getCommitsSinceLastTag, 
  parseCommit, 
  categorizeCommits, 
  generateReleaseNotes,
  generateChangelogEntry,
};

