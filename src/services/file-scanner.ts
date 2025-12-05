/**
 * File Scanner Service
 *
 * Scans repository files, computes hashes, and tracks changes.
 * Supports glob patterns for filtering files.
 *
 * @author Vladimir K.S.
 */

import { createHash } from 'crypto';
import { readFileSync, statSync, readdirSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';
import { queryOne, queryAll, run, generateId } from '../db/connection.js';
import { parseFrontmatterFromFile, type FrontmatterMetadata } from './frontmatter-parser.js';

export interface FileInfo {
  path: string;
  filename: string;
  extension: string;
  size: number;
  hash: string;
  // Frontmatter metadata (if present)
  hasFrontmatter: boolean;
  frontmatterRaw?: string;
  metadata?: FrontmatterMetadata;
}

export interface ScanResult {
  total: number;
  new: number;
  modified: number;
  deleted: number;
  unchanged: number;
  files: FileInfo[];
}

export interface ScanOptions {
  patterns?: string[];
  ignore?: string[];
}

const DEFAULT_PATTERNS = ['**/*.md', '**/*.feature', '**/*.yaml', '**/*.yml'];
const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'coverage', '.aigile'];

/**
 * Compute SHA256 hash of file content
 */
export function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Check if a path matches any of the ignore patterns
 */
function shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
  for (const pattern of ignorePatterns) {
    if (relativePath.includes(pattern) || relativePath.startsWith(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a file matches any of the include patterns
 */
function matchesPattern(filename: string, patterns: string[]): boolean {
  const ext = extname(filename).toLowerCase();

  for (const pattern of patterns) {
    // Simple extension matching: **/*.md -> .md
    if (pattern.includes('*.')) {
      const patternExt = '.' + pattern.split('*.').pop();
      if (ext === patternExt) {
        return true;
      }
    }
    // Direct filename match
    if (pattern === filename) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively collect files from a directory
 */
function collectFiles(
  dir: string,
  rootDir: string,
  patterns: string[],
  ignore: string[],
  files: FileInfo[] = []
): FileInfo[] {
  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = relative(rootDir, fullPath);

    if (shouldIgnore(relativePath, ignore)) {
      continue;
    }

    if (entry.isDirectory()) {
      collectFiles(fullPath, rootDir, patterns, ignore, files);
    } else if (entry.isFile() && matchesPattern(entry.name, patterns)) {
      try {
        const stats = statSync(fullPath);
        const hash = computeFileHash(fullPath);

        // Parse frontmatter for markdown files
        let hasFrontmatter = false;
        let frontmatterRaw: string | undefined;
        let metadata: FrontmatterMetadata | undefined;

        const ext = extname(entry.name).toLowerCase();
        if (ext === '.md' || ext === '.markdown') {
          const parsed = parseFrontmatterFromFile(fullPath);
          if (parsed) {
            hasFrontmatter = true;
            frontmatterRaw = parsed.raw;
            metadata = parsed.metadata;
          }
        }

        files.push({
          path: relativePath,
          filename: entry.name,
          extension: ext.slice(1),
          size: stats.size,
          hash,
          hasFrontmatter,
          frontmatterRaw,
          metadata
        });
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return files;
}

/**
 * Scan a project directory for tracked files
 */
export function scanDirectory(
  projectPath: string,
  options: ScanOptions = {}
): FileInfo[] {
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  const ignore = options.ignore ?? DEFAULT_IGNORE;

  return collectFiles(projectPath, projectPath, patterns, ignore);
}

/**
 * Sync scanned files with the database
 */
export function syncFilesToDatabase(
  projectId: string,
  projectPath: string,
  files: FileInfo[]
): ScanResult {
  const result: ScanResult = {
    total: files.length,
    new: 0,
    modified: 0,
    deleted: 0,
    unchanged: 0,
    files
  };

  const now = new Date().toISOString();
  const processedPaths = new Set<string>();

  // Process each scanned file
  for (const file of files) {
    processedPaths.add(file.path);

    const existing = queryOne<{
      id: string;
      content_hash: string;
      status: string;
    }>(
      'SELECT id, content_hash, status FROM documents WHERE project_id = ? AND path = ?',
      [projectId, file.path]
    );

    // Serialize arrays to JSON for storage
    const metaModules = file.metadata?.modules ? JSON.stringify(file.metadata.modules) : null;
    const metaDependencies = file.metadata?.dependencies ? JSON.stringify(file.metadata.dependencies) : null;
    const metaCodeRefs = file.metadata?.code_refs ? JSON.stringify(file.metadata.code_refs) : null;
    const metaAuthors = file.metadata?.authors ? JSON.stringify(file.metadata.authors) : null;

    if (!existing) {
      // New file - include frontmatter metadata
      run(
        `INSERT INTO documents (
          id, project_id, path, filename, extension, content_hash, size_bytes, status, last_scanned_at,
          has_frontmatter, frontmatter_raw, meta_status, meta_version, meta_tldr, meta_title,
          meta_modules, meta_dependencies, meta_code_refs, meta_authors
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'tracked', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(), projectId, file.path, file.filename, file.extension, file.hash, file.size, now,
          file.hasFrontmatter ? 1 : 0, file.frontmatterRaw ?? null,
          file.metadata?.status ?? null, file.metadata?.version ?? null,
          file.metadata?.tldr ?? null, file.metadata?.title ?? null,
          metaModules, metaDependencies, metaCodeRefs, metaAuthors
        ]
      );
      result.new++;
    } else if (existing.content_hash !== file.hash) {
      // Modified file - update with new frontmatter metadata
      run(
        `UPDATE documents SET
          content_hash = ?, size_bytes = ?, status = 'modified', last_scanned_at = ?, updated_at = datetime('now'),
          has_frontmatter = ?, frontmatter_raw = ?, meta_status = ?, meta_version = ?, meta_tldr = ?, meta_title = ?,
          meta_modules = ?, meta_dependencies = ?, meta_code_refs = ?, meta_authors = ?
         WHERE id = ?`,
        [
          file.hash, file.size, now,
          file.hasFrontmatter ? 1 : 0, file.frontmatterRaw ?? null,
          file.metadata?.status ?? null, file.metadata?.version ?? null,
          file.metadata?.tldr ?? null, file.metadata?.title ?? null,
          metaModules, metaDependencies, metaCodeRefs, metaAuthors,
          existing.id
        ]
      );
      result.modified++;
    } else {
      // Unchanged file
      run(
        `UPDATE documents SET last_scanned_at = ?, status = 'tracked' WHERE id = ?`,
        [now, existing.id]
      );
      result.unchanged++;
    }
  }

  // Mark deleted files (files in DB but not found in scan)
  const dbFiles = queryAll<{ id: string; path: string }>(
    'SELECT id, path FROM documents WHERE project_id = ? AND status != ?',
    [projectId, 'deleted']
  );

  for (const dbFile of dbFiles) {
    if (!processedPaths.has(dbFile.path)) {
      run(
        `UPDATE documents SET status = 'deleted', updated_at = datetime('now') WHERE id = ?`,
        [dbFile.id]
      );
      result.deleted++;
    }
  }

  return result;
}

/**
 * Get sync status for a project
 */
export function getSyncStatus(projectId: string): {
  total: number;
  tracked: number;
  modified: number;
  deleted: number;
  lastScan: string | null;
} {
  const stats = queryOne<{
    total: number;
    tracked: number;
    modified: number;
    deleted: number;
  }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'tracked' THEN 1 ELSE 0 END) as tracked,
      SUM(CASE WHEN status = 'modified' THEN 1 ELSE 0 END) as modified,
      SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) as deleted
    FROM documents
    WHERE project_id = ?
  `, [projectId]);

  const lastScan = queryOne<{ last_scanned_at: string }>(
    'SELECT MAX(last_scanned_at) as last_scanned_at FROM documents WHERE project_id = ?',
    [projectId]
  );

  return {
    total: stats?.total ?? 0,
    tracked: stats?.tracked ?? 0,
    modified: stats?.modified ?? 0,
    deleted: stats?.deleted ?? 0,
    lastScan: lastScan?.last_scanned_at ?? null
  };
}

/**
 * Get list of documents for a project
 */
export function getDocuments(
  projectId: string,
  status?: string
): Array<{
  path: string;
  filename: string;
  extension: string;
  status: string;
  size_bytes: number;
  last_scanned_at: string;
}> {
  let query = `
    SELECT path, filename, extension, status, size_bytes, last_scanned_at
    FROM documents
    WHERE project_id = ?
  `;
  const params: unknown[] = [projectId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY path';

  return queryAll(query, params);
}

/**
 * Document with frontmatter metadata
 */
export interface DocumentWithMetadata {
  id: string;
  path: string;
  filename: string;
  extension: string;
  status: string;
  size_bytes: number;
  last_scanned_at: string;
  has_frontmatter: number;
  meta_status: string | null;
  meta_version: string | null;
  meta_tldr: string | null;
  meta_title: string | null;
  meta_modules: string | null;
  meta_dependencies: string | null;
  meta_code_refs: string | null;
  meta_authors: string | null;
}

/**
 * Get documents by frontmatter status (e.g., DRAFT, IN-REVIEW, APPROVED, TEMPLATE)
 */
export function getDocumentsByMetaStatus(
  projectId: string,
  metaStatus: string
): DocumentWithMetadata[] {
  return queryAll<DocumentWithMetadata>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors
     FROM documents
     WHERE project_id = ? AND meta_status = ? AND status != 'deleted'
     ORDER BY path`,
    [projectId, metaStatus]
  );
}

/**
 * Get documents that contain a specific module
 * Modules are stored as JSON arrays, so we use LIKE for matching
 */
export function getDocumentsByModule(
  projectId: string,
  module: string
): DocumentWithMetadata[] {
  return queryAll<DocumentWithMetadata>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors
     FROM documents
     WHERE project_id = ? AND meta_modules LIKE ? AND status != 'deleted'
     ORDER BY path`,
    [projectId, `%"${module}"%`]
  );
}

/**
 * Get documents that depend on a specific file path
 * Dependencies are stored as JSON arrays
 */
export function getDocumentsByDependency(
  projectId: string,
  dependencyPath: string
): DocumentWithMetadata[] {
  return queryAll<DocumentWithMetadata>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors
     FROM documents
     WHERE project_id = ? AND meta_dependencies LIKE ? AND status != 'deleted'
     ORDER BY path`,
    [projectId, `%"${dependencyPath}"%`]
  );
}

/**
 * Get documents that reference a specific code directory
 */
export function getDocumentsByCodeRef(
  projectId: string,
  codeRef: string
): DocumentWithMetadata[] {
  return queryAll<DocumentWithMetadata>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors
     FROM documents
     WHERE project_id = ? AND meta_code_refs LIKE ? AND status != 'deleted'
     ORDER BY path`,
    [projectId, `%"${codeRef}"%`]
  );
}

/**
 * Get all documents with valid frontmatter
 */
export function getDocumentsWithFrontmatter(
  projectId: string
): DocumentWithMetadata[] {
  return queryAll<DocumentWithMetadata>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors
     FROM documents
     WHERE project_id = ? AND has_frontmatter = 1 AND status != 'deleted'
     ORDER BY path`,
    [projectId]
  );
}

/**
 * Get all documents without frontmatter (shadow mode candidates)
 */
export function getDocumentsWithoutFrontmatter(
  projectId: string
): DocumentWithMetadata[] {
  return queryAll<DocumentWithMetadata>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors
     FROM documents
     WHERE project_id = ? AND (has_frontmatter = 0 OR has_frontmatter IS NULL) AND status != 'deleted'
     ORDER BY path`,
    [projectId]
  );
}

/**
 * Get document by path with full metadata
 */
export function getDocumentByPath(
  projectId: string,
  filePath: string
): DocumentWithMetadata | undefined {
  return queryOne<DocumentWithMetadata>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors
     FROM documents
     WHERE project_id = ? AND path = ?`,
    [projectId, filePath]
  );
}

/**
 * Get TEMPLATE documents for workplan (ordered by path)
 */
export function getTemplateDocuments(
  projectId: string
): DocumentWithMetadata[] {
  return queryAll<DocumentWithMetadata>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors
     FROM documents
     WHERE project_id = ? AND meta_status = 'TEMPLATE' AND status != 'deleted'
     ORDER BY path`,
    [projectId]
  );
}

/**
 * Search documents by tldr content
 */
export function searchDocumentsByTldr(
  projectId: string,
  searchTerm: string
): DocumentWithMetadata[] {
  return queryAll<DocumentWithMetadata>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors
     FROM documents
     WHERE project_id = ? AND meta_tldr LIKE ? AND status != 'deleted'
     ORDER BY path`,
    [projectId, `%${searchTerm}%`]
  );
}
