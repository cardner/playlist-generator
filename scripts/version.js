#!/usr/bin/env node

/**
 * Semantic Versioning Script
 * 
 * Calculates the next semantic version based on conventional commits since the last tag.
 * 
 * Usage: node scripts/version.js
 * 
 * Output: Prints the new version string to stdout
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read current version from package.json
function getCurrentVersion() {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version;
}

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
    
    // Get commits since last tag
    const commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(line => line.length > 0);
    
    return commits;
  } catch (error) {
    console.error('Error getting commits:', error.message);
    return [];
  }
}

// Parse conventional commit message
function parseCommit(commitMessage) {
  const conventionalCommitRegex = /^(\w+)(\(.+\))?(!)?:\s*(.+)$/;
  const match = commitMessage.match(conventionalCommitRegex);
  
  if (!match) {
    return { type: null, breaking: false, message: commitMessage };
  }
  
  const [, type, , breaking, message] = match;
  return {
    type: type.toLowerCase(),
    breaking: !!breaking || commitMessage.includes('BREAKING CHANGE'),
    message: message.trim(),
  };
}

// Calculate version bump type
function calculateBumpType(commits) {
  let hasBreaking = false;
  let hasFeature = false;
  let hasFix = false;
  
  for (const commit of commits) {
    const parsed = parseCommit(commit);
    
    if (parsed.breaking) {
      hasBreaking = true;
    } else if (parsed.type === 'feat') {
      hasFeature = true;
    } else if (parsed.type === 'fix') {
      hasFix = true;
    }
  }
  
  if (hasBreaking) {
    return 'major';
  } else if (hasFeature) {
    return 'minor';
  } else if (hasFix) {
    return 'patch';
  }
  
  // Default to patch if no conventional commits found
  return 'patch';
}

// Increment version
function incrementVersion(version, bumpType) {
  const parts = version.split('.').map(Number);
  const [major, minor, patch] = parts;
  
  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

// Update package.json version
function updatePackageVersion(newVersion) {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
}

// Main execution
function main() {
  try {
    const currentVersion = getCurrentVersion();
    const commits = getCommitsSinceLastTag();
    
    // If no commits since last tag, return current version
    if (commits.length === 0) {
      console.log(currentVersion);
      return;
    }
    
    const bumpType = calculateBumpType(commits);
    const newVersion = incrementVersion(currentVersion, bumpType);
    
    // Update package.json
    updatePackageVersion(newVersion);
    
    // Output new version
    console.log(newVersion);
  } catch (error) {
    console.error('Error calculating version:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getCurrentVersion, getCommitsSinceLastTag, calculateBumpType, incrementVersion };

