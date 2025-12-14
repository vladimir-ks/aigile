/**
 * File Scanner Service
 *
 * Scans repository files, computes hashes, and tracks changes.
 * Supports glob patterns for filtering files.
 *
 * Implements Tri-State Monitoring:
 * - ALLOW: Focus files - fully tracked + parsed
 * - DENY: Ignored files - skip entirely
 * - UNKNOWN: Unclassified files - tracked minimally, flagged for review
 *
 * @author Vladimir K.S.
 */

import { createHash } from 'crypto';
import { readFileSync, statSync, readdirSync, existsSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { queryOne, queryAll, run, generateId } from '../db/connection.js';
import { parseFrontmatterFromFile, type FrontmatterMetadata } from './frontmatter-parser.js';
import {
  getHardIgnorePatterns,
  getDefaultAllowPatterns,
  getDefaultDenyPatterns,
  isBinaryExtension,
  type MonitoringCategory,
} from '../config/monitoring-patterns.js';
import { loadIgnorePatterns, loadAllowPatterns } from '../utils/config.js';
import picomatch from 'picomatch';

export interface FileInfo {
  path: string;
  filename: string;
  extension: string;
  size: number;
  hash: string | null;
  // Frontmatter metadata (if present)
  hasFrontmatter: boolean;
  frontmatterRaw?: string;
  metadata?: FrontmatterMetadata;
  // Tri-state monitoring
  category: MonitoringCategory;
  isBinary: boolean;
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
  trackUnknown?: boolean;
}

// Re-export MonitoringCategory for external use
export type { MonitoringCategory };

/**
 * Compute SHA256 hash of file content
 */
export function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * File classifier using tri-state monitoring
 */
class FileClassifier {
  private hardIgnoreMatcher: picomatch.Matcher;
  private allowMatcher: picomatch.Matcher;
  private denyMatcher: picomatch.Matcher;

  constructor(allowPatterns: string[], denyPatterns: string[]) {
    this.hardIgnoreMatcher = picomatch(getHardIgnorePatterns());
    this.allowMatcher = picomatch(allowPatterns);
    this.denyMatcher = picomatch(denyPatterns);
  }

  /**
   * Classify a file into allow/deny/unknown category
   */
  classify(relativePath: string): MonitoringCategory {
    // Hard ignores always take precedence
    if (this.hardIgnoreMatcher(relativePath)) {
      return 'deny';
    }

    // Check allow patterns first (focus files)
    if (this.allowMatcher(relativePath)) {
      return 'allow';
    }

    // Check deny patterns (soft ignores)
    if (this.denyMatcher(relativePath)) {
      return 'deny';
    }

    // File doesn't match either list - unknown (needs review)
    return 'unknown';
  }

  /**
   * Check if file should be completely skipped (hard ignore)
   */
  isHardIgnored(relativePath: string): boolean {
    return this.hardIgnoreMatcher(relativePath);
  }
}

/**
 * Recursively collect files from a directory with tri-state classification
 */
function collectFiles(
  dir: string,
  rootDir: string,
  classifier: FileClassifier,
  trackUnknown: boolean,
  files: FileInfo[] = []
): FileInfo[] {
  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = relative(rootDir, fullPath);

    // Skip hard-ignored paths entirely (including directories)
    if (classifier.isHardIgnored(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Check if directory itself should be skipped
      const dirCategory = classifier.classify(relativePath + '/');
      if (dirCategory === 'deny') {
        continue;
      }
      collectFiles(fullPath, rootDir, classifier, trackUnknown, files);
    } else if (entry.isFile()) {
      const category = classifier.classify(relativePath);

      // Skip deny files entirely
      if (category === 'deny') {
        continue;
      }

      // Skip unknown files if trackUnknown is disabled
      if (category === 'unknown' && !trackUnknown) {
        continue;
      }

      try {
        const stats = statSync(fullPath);
        const ext = extname(entry.name).toLowerCase().slice(1);
        const isBinary = isBinaryExtension(ext);

        // For binary/unknown files, minimal tracking (no hash for large binaries)
        const shouldComputeHash = category === 'allow' || (!isBinary && stats.size < 10 * 1024 * 1024); // 10MB limit
        const hash = shouldComputeHash ? computeFileHash(fullPath) : null;

        // Parse frontmatter only for allow category markdown files
        let hasFrontmatter = false;
        let frontmatterRaw: string | undefined;
        let metadata: FrontmatterMetadata | undefined;

        if (category === 'allow' && (ext === 'md' || ext === 'markdown') && !isBinary) {
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
          extension: ext,
          size: stats.size,
          hash,
          hasFrontmatter,
          frontmatterRaw,
          metadata,
          category,
          isBinary,
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
  // Load patterns from project config or use defaults
  const allowPatterns = options.patterns ?? loadAllowPatterns(projectPath);
  const denyPatterns = options.ignore ?? loadIgnorePatterns(projectPath);
  const trackUnknown = options.trackUnknown ?? true;

  // Use default patterns if none provided/loaded
  const finalAllowPatterns = allowPatterns.length > 0 ? allowPatterns : getDefaultAllowPatterns();
  const finalDenyPatterns = denyPatterns.length > 0 ? denyPatterns : getDefaultDenyPatterns();

  const classifier = new FileClassifier(finalAllowPatterns, finalDenyPatterns);

  return collectFiles(projectPath, projectPath, classifier, trackUnknown);
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
      content_hash: string | null;
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
    const needsReview = file.category === 'unknown' ? 1 : 0;

    if (!existing) {
      // New file - include frontmatter metadata and monitoring category
      run(
        `INSERT INTO documents (
          id, project_id, path, filename, extension, content_hash, size_bytes, status, last_scanned_at,
          has_frontmatter, frontmatter_raw, meta_status, meta_version, meta_tldr, meta_title,
          meta_modules, meta_dependencies, meta_code_refs, meta_authors,
          monitoring_category, needs_review
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'tracked', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(), projectId, file.path, file.filename, file.extension, file.hash, file.size, now,
          file.hasFrontmatter ? 1 : 0, file.frontmatterRaw ?? null,
          file.metadata?.status ?? null, file.metadata?.version ?? null,
          file.metadata?.tldr ?? null, file.metadata?.title ?? null,
          metaModules, metaDependencies, metaCodeRefs, metaAuthors,
          file.category, needsReview
        ]
      );
      result.new++;
    } else if (existing.content_hash !== file.hash) {
      // Modified file - update with new frontmatter metadata and monitoring category
      run(
        `UPDATE documents SET
          content_hash = ?, size_bytes = ?, status = 'modified', last_scanned_at = ?, updated_at = datetime('now'),
          has_frontmatter = ?, frontmatter_raw = ?, meta_status = ?, meta_version = ?, meta_tldr = ?, meta_title = ?,
          meta_modules = ?, meta_dependencies = ?, meta_code_refs = ?, meta_authors = ?,
          monitoring_category = ?
         WHERE id = ?`,
        [
          file.hash, file.size, now,
          file.hasFrontmatter ? 1 : 0, file.frontmatterRaw ?? null,
          file.metadata?.status ?? null, file.metadata?.version ?? null,
          file.metadata?.tldr ?? null, file.metadata?.title ?? null,
          metaModules, metaDependencies, metaCodeRefs, metaAuthors,
          file.category,
          existing.id
        ]
      );
      result.modified++;
    } else {
      // Unchanged file - just update scan time and ensure category is current
      run(
        `UPDATE documents SET last_scanned_at = ?, status = 'tracked', monitoring_category = ? WHERE id = ?`,
        [now, file.category, existing.id]
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
 * Document with shadow mode analysis metadata
 */
export interface DocumentWithAnalysis extends DocumentWithMetadata {
  shadow_mode: number;
  analyzed_at: string | null;
  analysis_confidence: number | null;
  file_type: string | null;
  complexity_score: number | null;
  exports: string | null;
  inferred_module: string | null;
  inferred_component: string | null;
  analysis_notes: string | null;
}

/**
 * Analysis metadata for updating a document
 */
export interface AnalysisMetadata {
  tldr?: string;
  module?: string;
  component?: string;
  fileType?: string;
  dependencies?: string[];
  exports?: string[];
  complexity?: number;
  confidence?: number;
  notes?: string;
}

/**
 * Analysis progress statistics
 */
export interface AnalysisProgress {
  total: number;
  analyzed: number;
  unanalyzed: number;
  lowConfidence: number;
  byModule: Record<string, { analyzed: number; total: number }>;
  byFileType: Record<string, number>;
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

// ============================================
// Shadow Mode Analysis Functions
// ============================================

/**
 * Get all unanalyzed documents (no analysis metadata set)
 */
export function getUnanalyzedDocuments(
  projectId: string,
  limit?: number,
  offset?: number
): DocumentWithAnalysis[] {
  let query = `
    SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
           has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
           meta_modules, meta_dependencies, meta_code_refs, meta_authors,
           shadow_mode, analyzed_at, analysis_confidence, file_type,
           complexity_score, exports, inferred_module, inferred_component, analysis_notes
    FROM documents
    WHERE project_id = ? AND analyzed_at IS NULL AND status != 'deleted'
    ORDER BY path
  `;
  const params: unknown[] = [projectId];

  if (limit !== undefined) {
    query += ' LIMIT ?';
    params.push(limit);
  }
  if (offset !== undefined) {
    query += ' OFFSET ?';
    params.push(offset);
  }

  return queryAll<DocumentWithAnalysis>(query, params);
}

/**
 * Get count of unanalyzed documents
 */
export function getUnanalyzedCount(projectId: string): number {
  const result = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM documents
     WHERE project_id = ? AND analyzed_at IS NULL AND status != 'deleted'`,
    [projectId]
  );
  return result?.count ?? 0;
}

/**
 * Get documents with analysis (already analyzed)
 */
export function getAnalyzedDocuments(
  projectId: string,
  limit?: number
): DocumentWithAnalysis[] {
  let query = `
    SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
           has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
           meta_modules, meta_dependencies, meta_code_refs, meta_authors,
           shadow_mode, analyzed_at, analysis_confidence, file_type,
           complexity_score, exports, inferred_module, inferred_component, analysis_notes
    FROM documents
    WHERE project_id = ? AND analyzed_at IS NOT NULL AND status != 'deleted'
    ORDER BY analyzed_at DESC
  `;
  const params: unknown[] = [projectId];

  if (limit !== undefined) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  return queryAll<DocumentWithAnalysis>(query, params);
}

/**
 * Get documents with low confidence analysis
 */
export function getLowConfidenceDocuments(
  projectId: string,
  threshold: number = 70
): DocumentWithAnalysis[] {
  return queryAll<DocumentWithAnalysis>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors,
            shadow_mode, analyzed_at, analysis_confidence, file_type,
            complexity_score, exports, inferred_module, inferred_component, analysis_notes
     FROM documents
     WHERE project_id = ? AND analyzed_at IS NOT NULL
       AND analysis_confidence IS NOT NULL AND analysis_confidence < ?
       AND status != 'deleted'
     ORDER BY analysis_confidence ASC`,
    [projectId, threshold]
  );
}

/**
 * Get documents by inferred module
 */
export function getDocumentsByInferredModule(
  projectId: string,
  module: string
): DocumentWithAnalysis[] {
  return queryAll<DocumentWithAnalysis>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors,
            shadow_mode, analyzed_at, analysis_confidence, file_type,
            complexity_score, exports, inferred_module, inferred_component, analysis_notes
     FROM documents
     WHERE project_id = ? AND inferred_module = ? AND status != 'deleted'
     ORDER BY path`,
    [projectId, module]
  );
}

/**
 * Get documents by file type
 */
export function getDocumentsByFileType(
  projectId: string,
  fileType: string
): DocumentWithAnalysis[] {
  return queryAll<DocumentWithAnalysis>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors,
            shadow_mode, analyzed_at, analysis_confidence, file_type,
            complexity_score, exports, inferred_module, inferred_component, analysis_notes
     FROM documents
     WHERE project_id = ? AND file_type = ? AND status != 'deleted'
     ORDER BY path`,
    [projectId, fileType]
  );
}

/**
 * Get document by path with full analysis metadata
 */
export function getDocumentWithAnalysis(
  projectId: string,
  filePath: string
): DocumentWithAnalysis | undefined {
  return queryOne<DocumentWithAnalysis>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors,
            shadow_mode, analyzed_at, analysis_confidence, file_type,
            complexity_score, exports, inferred_module, inferred_component, analysis_notes
     FROM documents
     WHERE project_id = ? AND path = ?`,
    [projectId, filePath]
  );
}

/**
 * Update document with analysis metadata
 */
export function updateDocumentAnalysis(
  projectId: string,
  filePath: string,
  analysis: AnalysisMetadata
): boolean {
  const doc = getDocumentByPath(projectId, filePath);
  if (!doc) {
    return false;
  }

  const now = new Date().toISOString();
  const deps = analysis.dependencies ? JSON.stringify(analysis.dependencies) : null;
  const exps = analysis.exports ? JSON.stringify(analysis.exports) : null;

  run(
    `UPDATE documents SET
       meta_tldr = COALESCE(?, meta_tldr),
       meta_dependencies = COALESCE(?, meta_dependencies),
       inferred_module = COALESCE(?, inferred_module),
       inferred_component = COALESCE(?, inferred_component),
       file_type = COALESCE(?, file_type),
       exports = COALESCE(?, exports),
       complexity_score = COALESCE(?, complexity_score),
       analysis_confidence = COALESCE(?, analysis_confidence),
       analysis_notes = COALESCE(?, analysis_notes),
       analyzed_at = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
    [
      analysis.tldr ?? null,
      deps,
      analysis.module ?? null,
      analysis.component ?? null,
      analysis.fileType ?? null,
      exps,
      analysis.complexity ?? null,
      analysis.confidence ?? null,
      analysis.notes ?? null,
      now,
      doc.id
    ]
  );

  return true;
}

/**
 * Get analysis progress statistics
 */
export function getAnalysisProgress(projectId: string): AnalysisProgress {
  // Get basic counts
  const counts = queryOne<{
    total: number;
    analyzed: number;
    unanalyzed: number;
    low_confidence: number;
  }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN analyzed_at IS NOT NULL THEN 1 ELSE 0 END) as analyzed,
      SUM(CASE WHEN analyzed_at IS NULL THEN 1 ELSE 0 END) as unanalyzed,
      SUM(CASE WHEN analysis_confidence IS NOT NULL AND analysis_confidence < 70 THEN 1 ELSE 0 END) as low_confidence
    FROM documents
    WHERE project_id = ? AND status != 'deleted'
  `, [projectId]);

  // Get breakdown by module
  const moduleStats = queryAll<{
    module: string | null;
    analyzed: number;
    total: number;
  }>(`
    SELECT
      COALESCE(inferred_module, 'unknown') as module,
      SUM(CASE WHEN analyzed_at IS NOT NULL THEN 1 ELSE 0 END) as analyzed,
      COUNT(*) as total
    FROM documents
    WHERE project_id = ? AND status != 'deleted'
    GROUP BY COALESCE(inferred_module, 'unknown')
    ORDER BY total DESC
  `, [projectId]);

  // Get breakdown by file type
  const typeStats = queryAll<{
    file_type: string | null;
    count: number;
  }>(`
    SELECT
      COALESCE(file_type, extension, 'unknown') as file_type,
      COUNT(*) as count
    FROM documents
    WHERE project_id = ? AND status != 'deleted'
    GROUP BY COALESCE(file_type, extension, 'unknown')
    ORDER BY count DESC
  `, [projectId]);

  const byModule: Record<string, { analyzed: number; total: number }> = {};
  for (const stat of moduleStats) {
    byModule[stat.module ?? 'unknown'] = {
      analyzed: stat.analyzed,
      total: stat.total
    };
  }

  const byFileType: Record<string, number> = {};
  for (const stat of typeStats) {
    byFileType[stat.file_type ?? 'unknown'] = stat.count;
  }

  return {
    total: counts?.total ?? 0,
    analyzed: counts?.analyzed ?? 0,
    unanalyzed: counts?.unanalyzed ?? 0,
    lowConfidence: counts?.low_confidence ?? 0,
    byModule,
    byFileType
  };
}

/**
 * Get shadow mode documents (tracked but can't have frontmatter)
 */
export function getShadowDocuments(projectId: string): DocumentWithAnalysis[] {
  return queryAll<DocumentWithAnalysis>(
    `SELECT id, path, filename, extension, status, size_bytes, last_scanned_at,
            has_frontmatter, meta_status, meta_version, meta_tldr, meta_title,
            meta_modules, meta_dependencies, meta_code_refs, meta_authors,
            shadow_mode, analyzed_at, analysis_confidence, file_type,
            complexity_score, exports, inferred_module, inferred_component, analysis_notes
     FROM documents
     WHERE project_id = ? AND shadow_mode = 1 AND status != 'deleted'
     ORDER BY path`,
    [projectId]
  );
}

/**
 * Mark a document as shadow mode (can't have frontmatter)
 */
export function markAsShadowMode(projectId: string, filePath: string): boolean {
  const doc = getDocumentByPath(projectId, filePath);
  if (!doc) {
    return false;
  }

  run(
    `UPDATE documents SET shadow_mode = 1, updated_at = datetime('now') WHERE id = ?`,
    [doc.id]
  );

  return true;
}

/**
 * Track a new file in shadow mode (for brownfield projects)
 */
export function trackShadowFile(
  projectId: string,
  projectPath: string,
  filePath: string
): DocumentWithAnalysis | null {
  const fullPath = join(projectPath, filePath);
  if (!existsSync(fullPath)) {
    return null;
  }

  // Check if already tracked
  const existing = getDocumentByPath(projectId, filePath);
  if (existing) {
    // Mark as shadow if not already
    markAsShadowMode(projectId, filePath);
    return getDocumentWithAnalysis(projectId, filePath) ?? null;
  }

  // Create new shadow document
  try {
    const stats = statSync(fullPath);
    const hash = computeFileHash(fullPath);
    const filename = filePath.split('/').pop() ?? filePath;
    const ext = extname(filename).slice(1);
    const now = new Date().toISOString();
    const id = generateId();

    run(
      `INSERT INTO documents (
        id, project_id, path, filename, extension, content_hash, size_bytes,
        status, last_scanned_at, shadow_mode, has_frontmatter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'tracked', ?, 1, 0)`,
      [id, projectId, filePath, filename, ext, hash, stats.size, now]
    );

    return getDocumentWithAnalysis(projectId, filePath) ?? null;
  } catch {
    return null;
  }
}
