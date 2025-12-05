/**
 * Git Utility Functions
 *
 * Provides git-related utilities for AIGILE CLI.
 *
 * @author Vladimir K.S.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, basename } from 'path';

/**
 * Check if a directory is a git repository
 */
export function isGitRepo(path: string): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd: path,
      stdio: 'pipe'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the git root directory
 */
export function getGitRoot(path: string): string | null {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd: path,
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Get the repository name from git remote or folder name
 */
export function getRepoName(path: string): string {
  try {
    // Try to get from git remote
    const remote = execSync('git config --get remote.origin.url', {
      cwd: path,
      stdio: 'pipe',
      encoding: 'utf-8'
    }).trim();

    if (remote) {
      // Extract repo name from URL
      // Handles: git@github.com:user/repo.git, https://github.com/user/repo.git
      const match = remote.match(/\/([^/]+?)(\.git)?$/);
      if (match) {
        return match[1];
      }
    }
  } catch {
    // No remote configured, use folder name
  }

  // Fall back to folder name
  return basename(path);
}

/**
 * Generate a project key from repository name
 * Converts "my-project-name" to "MPN" (uppercase initials)
 */
export function generateProjectKey(repoName: string): string {
  // Remove common prefixes/suffixes
  const cleaned = repoName
    .replace(/^(@[^/]+\/)?/, '')  // Remove npm scope
    .replace(/[-_.]?(cli|api|app|web|lib|pkg|core)$/i, '')  // Remove common suffixes
    .replace(/^(the|a|an)[-_.]?/i, '');  // Remove articles

  // Split by separators
  const parts = cleaned.split(/[-_.]+/);

  if (parts.length === 1) {
    // Single word: use first 3-4 chars uppercase
    return cleaned.slice(0, 4).toUpperCase();
  }

  // Multiple words: use initials
  const initials = parts.map(p => p[0]).join('').toUpperCase();

  // Ensure at least 2 chars, max 5
  if (initials.length < 2) {
    return cleaned.slice(0, 4).toUpperCase();
  }

  return initials.slice(0, 5);
}

/**
 * Get the superproject root if in a git submodule
 * Returns null if not in a submodule
 */
export function getSuperprojectRoot(path: string): string | null {
  try {
    const result = execSync('git rev-parse --show-superproject-working-tree', {
      cwd: path,
      stdio: 'pipe',
      encoding: 'utf-8'
    }).trim();

    return result || null;
  } catch {
    return null;
  }
}

/**
 * Check if path is in .gitignore
 */
export function isInGitignore(repoPath: string, pattern: string): boolean {
  const gitignorePath = join(repoPath, '.gitignore');

  if (!existsSync(gitignorePath)) {
    return false;
  }

  try {
    const result = execSync(`git check-ignore -q "${pattern}"`, {
      cwd: repoPath,
      stdio: 'pipe'
    });
    return true;
  } catch {
    return false;
  }
}
