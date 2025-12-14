/**
 * File Watcher Service
 *
 * Watches repository files for changes and automatically syncs
 * to the AIGILE database. Uses chokidar for cross-platform file watching.
 *
 * Implements Tri-State Monitoring:
 * - ALLOW: Focus files - fully tracked + parsed
 * - DENY: Ignored files - skip entirely
 * - UNKNOWN: Unclassified files - tracked minimally, flagged for review
 *
 * @author Vladimir K.S.
 */

import { watch, FSWatcher } from 'chokidar';
import { join, relative, extname, basename } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
import { EventEmitter } from 'events';
import { queryOne, queryAll, run, generateId } from '../db/connection.js';
import { computeFileHash } from './file-scanner.js';
import { parseFrontmatterFromFile, FrontmatterMetadata } from './frontmatter-parser.js';
import {
  getHardIgnorePatterns,
  getDefaultAllowPatterns,
  getDefaultDenyPatterns,
  isBinaryExtension,
  type MonitoringCategory,
} from '../config/monitoring-patterns.js';
import { loadIgnorePatterns, loadAllowPatterns } from '../utils/config.js';
import picomatch from 'picomatch';

export interface WatcherConfig {
  projectId: string;
  projectPath: string;
  patterns?: string[];
  ignore?: string[];
  useGitignore?: boolean;
  debounceMs?: number;
  trackUnknown?: boolean;
}

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: Date;
  category?: MonitoringCategory;
}

export interface WatcherStats {
  isRunning: boolean;
  startedAt: Date | null;
  filesWatched: number;
  eventsProcessed: number;
  lastEvent: WatchEvent | null;
  categoryCounts: {
    allow: number;
    deny: number;
    unknown: number;
  };
}

/**
 * File Watcher Service - watches for file changes and syncs to database
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private config: WatcherConfig;
  private stats: WatcherStats;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  // Tri-state pattern matchers
  private allowMatcher: picomatch.Matcher | null = null;
  private denyMatcher: picomatch.Matcher | null = null;
  private hardIgnoreMatcher: picomatch.Matcher | null = null;

  constructor(config: WatcherConfig) {
    super();

    // Load patterns from project config if available
    const projectAllowPatterns = config.patterns ?? loadAllowPatterns(config.projectPath);
    const projectDenyPatterns = config.ignore ?? loadIgnorePatterns(config.projectPath);

    this.config = {
      patterns: projectAllowPatterns.length > 0 ? projectAllowPatterns : getDefaultAllowPatterns(),
      ignore: projectDenyPatterns.length > 0 ? projectDenyPatterns : getDefaultDenyPatterns(),
      useGitignore: false, // Changed: don't use gitignore by default
      debounceMs: 300,
      trackUnknown: true,
      ...config,
    };

    this.stats = {
      isRunning: false,
      startedAt: null,
      filesWatched: 0,
      eventsProcessed: 0,
      lastEvent: null,
      categoryCounts: {
        allow: 0,
        deny: 0,
        unknown: 0,
      },
    };

    // Initialize pattern matchers for tri-state classification
    this.initializeMatchers();
  }

  /**
   * Initialize picomatch matchers for tri-state classification
   */
  private initializeMatchers(): void {
    // Hard ignores (always ignored, no override)
    this.hardIgnoreMatcher = picomatch(getHardIgnorePatterns());

    // Allow patterns (focus files)
    this.allowMatcher = picomatch(this.config.patterns!);

    // Deny patterns (soft ignores, from .aigile/ignore or defaults)
    this.denyMatcher = picomatch(this.config.ignore!);
  }

  /**
   * Classify a file into allow/deny/unknown category
   */
  classifyFile(relativePath: string): MonitoringCategory {
    // Hard ignores always take precedence
    if (this.hardIgnoreMatcher && this.hardIgnoreMatcher(relativePath)) {
      return 'deny';
    }

    // Check allow patterns first (focus files)
    if (this.allowMatcher && this.allowMatcher(relativePath)) {
      return 'allow';
    }

    // Check deny patterns (soft ignores)
    if (this.denyMatcher && this.denyMatcher(relativePath)) {
      return 'deny';
    }

    // File doesn't match either list - unknown (needs review)
    return 'unknown';
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.watcher) {
      return; // Already running
    }

    // Watch all files in project, use internal classification for processing
    // Only hard ignores are passed to chokidar for efficiency
    this.watcher = watch(this.config.projectPath, {
      ignored: getHardIgnorePatterns(),
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
      // Watch all directories but we'll filter files during processing
      depth: Infinity,
    });

    this.watcher.on('add', (path) => this.handleFileEvent('add', path));
    this.watcher.on('change', (path) => this.handleFileEvent('change', path));
    this.watcher.on('unlink', (path) => this.handleFileEvent('unlink', path));
    this.watcher.on('error', (error) => this.emit('error', error));

    this.watcher.on('ready', () => {
      this.stats.isRunning = true;
      this.stats.startedAt = new Date();
      this.stats.filesWatched = this.getWatchedFilesCount();
      this.updateCategoryCounts();
      this.emit('ready', this.stats);
    });
  }

  /**
   * Update category counts from database
   * This is best-effort - if DB isn't ready, we'll get counts later
   */
  private updateCategoryCounts(): void {
    // Skip if called before database is ready (can happen during startup)
    // The counts will be updated on the next file event
    try {
      const counts = queryAll<{ monitoring_category: string; count: number }>(`
        SELECT monitoring_category, COUNT(*) as count
        FROM documents
        WHERE project_id = ? AND status != 'deleted'
        GROUP BY monitoring_category
      `, [this.config.projectId]);

      this.stats.categoryCounts = { allow: 0, deny: 0, unknown: 0 };
      for (const row of counts) {
        const cat = row.monitoring_category as MonitoringCategory;
        if (cat in this.stats.categoryCounts) {
          this.stats.categoryCounts[cat] = row.count;
        }
      }
    } catch {
      // Silently ignore - database might not be ready yet
      // This is expected during daemon startup race conditions
    }
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    await this.watcher.close();
    this.watcher = null;
    this.stats.isRunning = false;
    this.emit('stopped');
  }

  /**
   * Get current watcher statistics
   */
  getStats(): WatcherStats {
    return { ...this.stats };
  }

  /**
   * Get the project path being watched
   */
  getProjectPath(): string {
    return this.config.projectPath;
  }

  /**
   * Get the project ID
   */
  getProjectId(): string {
    return this.config.projectId;
  }

  /**
   * Handle a file event with debouncing
   */
  private handleFileEvent(type: 'add' | 'change' | 'unlink', absolutePath: string): void {
    // Clear existing debounce timer for this path
    const existingTimer = this.debounceTimers.get(absolutePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(absolutePath);
      this.processFileEvent(type, absolutePath);
    }, this.config.debounceMs);

    this.debounceTimers.set(absolutePath, timer);
  }

  /**
   * Process a file event (after debounce)
   */
  private processFileEvent(type: 'add' | 'change' | 'unlink', absolutePath: string): void {
    const relativePath = relative(this.config.projectPath, absolutePath);

    // Classify the file
    const category = this.classifyFile(relativePath);

    // Skip deny files entirely (except for tracking deletions of previously tracked files)
    if (category === 'deny' && type !== 'unlink') {
      return;
    }

    // Skip unknown files if trackUnknown is disabled
    if (category === 'unknown' && !this.config.trackUnknown && type !== 'unlink') {
      return;
    }

    const event: WatchEvent = {
      type,
      path: relativePath,
      timestamp: new Date(),
      category,
    };

    this.stats.lastEvent = event;
    this.stats.eventsProcessed++;

    try {
      switch (type) {
        case 'add':
          this.syncFileAdd(absolutePath, relativePath, category);
          break;
        case 'change':
          this.syncFileChange(absolutePath, relativePath, category);
          break;
        case 'unlink':
          this.syncFileDelete(relativePath);
          break;
      }

      this.emit('sync', event);
    } catch (error) {
      this.emit('syncError', { event, error });
    }
  }

  /**
   * Sync a new file to the database
   */
  private syncFileAdd(absolutePath: string, relativePath: string, category: MonitoringCategory): void {
    const ext = extname(relativePath).slice(1);
    const filename = basename(relativePath);
    const isBinary = isBinaryExtension(ext);

    try {
      const stats = statSync(absolutePath);

      // For unknown/binary files, minimal tracking (no hash for large binaries)
      const shouldComputeHash = category === 'allow' || (!isBinary && stats.size < 10 * 1024 * 1024); // 10MB limit
      const hash = shouldComputeHash ? computeFileHash(absolutePath) : null;

      // Parse frontmatter only for allow category markdown files
      let hasFrontmatter = false;
      let frontmatterRaw: string | null = null;
      let metadata: FrontmatterMetadata | null = null;

      if (category === 'allow' && (ext === 'md' || ext === 'markdown') && !isBinary) {
        const parsed = parseFrontmatterFromFile(absolutePath);
        if (parsed) {
          hasFrontmatter = true;
          frontmatterRaw = parsed.raw;
          metadata = parsed.metadata;
        }
      }

      // Check if document already exists
      const existing = queryOne<{ id: string }>(
        'SELECT id FROM documents WHERE project_id = ? AND path = ?',
        [this.config.projectId, relativePath]
      );

      if (existing) {
        // Update existing
        this.updateDocument(existing.id, hash, stats.size, hasFrontmatter, frontmatterRaw, metadata, category);
      } else {
        // Insert new
        this.insertDocument(relativePath, filename, ext, hash, stats.size, hasFrontmatter, frontmatterRaw, metadata, category);
      }
    } catch (err) {
      // Re-throw database errors - they indicate a real problem
      // Only silently ignore file system errors (file deleted during processing)
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('Database') || errMsg.includes('database')) {
        throw err;
      }
      // Log unexpected errors for debugging
      console.error(`[${new Date().toISOString()}] syncFileAdd error for ${relativePath}: ${errMsg}`);
    }
  }

  /**
   * Sync a changed file to the database
   */
  private syncFileChange(absolutePath: string, relativePath: string, category: MonitoringCategory): void {
    // Same logic as add - upsert behavior
    this.syncFileAdd(absolutePath, relativePath, category);
  }

  /**
   * Mark a file as deleted in the database
   */
  private syncFileDelete(relativePath: string): void {
    const doc = queryOne<{ id: string }>(
      'SELECT id FROM documents WHERE project_id = ? AND path = ?',
      [this.config.projectId, relativePath]
    );

    if (doc) {
      run(
        `UPDATE documents SET status = 'deleted', updated_at = datetime('now') WHERE id = ?`,
        [doc.id]
      );
    }
  }

  /**
   * Insert a new document into the database
   */
  private insertDocument(
    path: string,
    filename: string,
    extension: string,
    hash: string | null,
    size: number,
    hasFrontmatter: boolean,
    frontmatterRaw: string | null,
    metadata: FrontmatterMetadata | null,
    category: MonitoringCategory
  ): void {
    const now = new Date().toISOString();
    const needsReview = category === 'unknown' ? 1 : 0;

    run(
      `INSERT INTO documents (
        id, project_id, path, filename, extension, content_hash, size_bytes, status, last_scanned_at,
        has_frontmatter, frontmatter_raw, meta_status, meta_version, meta_tldr, meta_title,
        meta_modules, meta_dependencies, meta_code_refs, meta_authors,
        monitoring_category, needs_review
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'tracked', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        this.config.projectId,
        path,
        filename,
        extension,
        hash,
        size,
        now,
        hasFrontmatter ? 1 : 0,
        frontmatterRaw,
        metadata?.status ?? null,
        metadata?.version ?? null,
        metadata?.tldr ?? null,
        metadata?.title ?? null,
        metadata?.modules ? JSON.stringify(metadata.modules) : null,
        metadata?.dependencies ? JSON.stringify(metadata.dependencies) : null,
        metadata?.code_refs ? JSON.stringify(metadata.code_refs) : null,
        metadata?.authors ? JSON.stringify(metadata.authors) : null,
        category,
        needsReview,
      ]
    );
  }

  /**
   * Update an existing document in the database
   */
  private updateDocument(
    id: string,
    hash: string | null,
    size: number,
    hasFrontmatter: boolean,
    frontmatterRaw: string | null,
    metadata: FrontmatterMetadata | null,
    category: MonitoringCategory
  ): void {
    const now = new Date().toISOString();

    run(
      `UPDATE documents SET
        content_hash = COALESCE(?, content_hash), size_bytes = ?, status = 'tracked', last_scanned_at = ?, updated_at = datetime('now'),
        has_frontmatter = ?, frontmatter_raw = ?, meta_status = ?, meta_version = ?, meta_tldr = ?, meta_title = ?,
        meta_modules = ?, meta_dependencies = ?, meta_code_refs = ?, meta_authors = ?,
        monitoring_category = ?
       WHERE id = ?`,
      [
        hash,
        size,
        now,
        hasFrontmatter ? 1 : 0,
        frontmatterRaw,
        metadata?.status ?? null,
        metadata?.version ?? null,
        metadata?.tldr ?? null,
        metadata?.title ?? null,
        metadata?.modules ? JSON.stringify(metadata.modules) : null,
        metadata?.dependencies ? JSON.stringify(metadata.dependencies) : null,
        metadata?.code_refs ? JSON.stringify(metadata.code_refs) : null,
        metadata?.authors ? JSON.stringify(metadata.authors) : null,
        category,
        id,
      ]
    );
  }

  /**
   * Get count of watched files (approximate)
   */
  private getWatchedFilesCount(): number {
    if (!this.watcher) {
      return 0;
    }
    const watched = this.watcher.getWatched();
    let count = 0;
    for (const dir of Object.keys(watched)) {
      count += watched[dir].length;
    }
    return count;
  }
}

/**
 * Parse a .gitignore file and convert patterns to chokidar-compatible format
 */
export function parseGitignore(gitignorePath: string): string[] {
  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    const patterns: string[] = [];

    for (let line of content.split('\n')) {
      line = line.trim();

      // Skip empty lines and comments
      if (!line || line.startsWith('#')) {
        continue;
      }

      // Handle negation (not fully supported, skip for now)
      if (line.startsWith('!')) {
        continue;
      }

      // Convert gitignore patterns to glob patterns
      let pattern = line;

      // Remove leading slash (means relative to repo root)
      if (pattern.startsWith('/')) {
        pattern = pattern.slice(1);
      }

      // Add ** prefix for patterns that should match anywhere
      if (!pattern.startsWith('**/') && !pattern.includes('/')) {
        pattern = `**/${pattern}`;
      }

      // Add trailing /** for directory patterns
      if (pattern.endsWith('/')) {
        pattern = pattern.slice(0, -1) + '/**';
      }

      patterns.push(pattern);
    }

    return patterns;
  } catch {
    return [];
  }
}

/**
 * Create a watcher instance (factory function)
 */
export function createFileWatcher(config: WatcherConfig): FileWatcher {
  return new FileWatcher(config);
}
