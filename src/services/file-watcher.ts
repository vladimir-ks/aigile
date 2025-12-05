/**
 * File Watcher Service
 *
 * Watches repository files for changes and automatically syncs
 * to the AIGILE database. Uses chokidar for cross-platform file watching.
 *
 * @author Vladimir K.S.
 */

import { watch, FSWatcher } from 'chokidar';
import { join, relative, extname, dirname } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
import { EventEmitter } from 'events';
import { queryOne, run, generateId } from '../db/connection.js';
import { computeFileHash } from './file-scanner.js';
import { parseFrontmatterFromFile, FrontmatterMetadata } from './frontmatter-parser.js';

export interface WatcherConfig {
  projectId: string;
  projectPath: string;
  patterns?: string[];
  ignore?: string[];
  useGitignore?: boolean;
  debounceMs?: number;
}

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: Date;
}

export interface WatcherStats {
  isRunning: boolean;
  startedAt: Date | null;
  filesWatched: number;
  eventsProcessed: number;
  lastEvent: WatchEvent | null;
}

const DEFAULT_PATTERNS = ['**/*.md', '**/*.feature', '**/*.yaml', '**/*.yml'];
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.aigile/**'
];

/**
 * File Watcher Service - watches for file changes and syncs to database
 */
export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private config: WatcherConfig;
  private stats: WatcherStats;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: WatcherConfig) {
    super();
    this.config = {
      patterns: DEFAULT_PATTERNS,
      ignore: DEFAULT_IGNORE,
      useGitignore: true,
      debounceMs: 300,
      ...config
    };

    this.stats = {
      isRunning: false,
      startedAt: null,
      filesWatched: 0,
      eventsProcessed: 0,
      lastEvent: null
    };
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.watcher) {
      return; // Already running
    }

    const watchPaths = this.config.patterns!.map(p => join(this.config.projectPath, p));
    const ignorePatterns = this.buildIgnorePatterns();

    this.watcher = watch(watchPaths, {
      ignored: ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    this.watcher.on('add', (path) => this.handleFileEvent('add', path));
    this.watcher.on('change', (path) => this.handleFileEvent('change', path));
    this.watcher.on('unlink', (path) => this.handleFileEvent('unlink', path));
    this.watcher.on('error', (error) => this.emit('error', error));

    this.watcher.on('ready', () => {
      this.stats.isRunning = true;
      this.stats.startedAt = new Date();
      this.stats.filesWatched = this.getWatchedFilesCount();
      this.emit('ready', this.stats);
    });
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
   * Build ignore patterns including gitignore if enabled
   */
  private buildIgnorePatterns(): (string | RegExp)[] {
    const patterns: (string | RegExp)[] = [...(this.config.ignore || [])];

    if (this.config.useGitignore) {
      const gitignorePath = join(this.config.projectPath, '.gitignore');
      if (existsSync(gitignorePath)) {
        const gitignorePatterns = parseGitignore(gitignorePath);
        patterns.push(...gitignorePatterns);
      }
    }

    return patterns;
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
    const event: WatchEvent = {
      type,
      path: relativePath,
      timestamp: new Date()
    };

    this.stats.lastEvent = event;
    this.stats.eventsProcessed++;

    try {
      switch (type) {
        case 'add':
          this.syncFileAdd(absolutePath, relativePath);
          break;
        case 'change':
          this.syncFileChange(absolutePath, relativePath);
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
  private syncFileAdd(absolutePath: string, relativePath: string): void {
    const ext = extname(relativePath).slice(1);
    const filename = relativePath.split('/').pop() || relativePath;

    try {
      const stats = statSync(absolutePath);
      const hash = computeFileHash(absolutePath);

      // Parse frontmatter for markdown files
      let hasFrontmatter = false;
      let frontmatterRaw: string | null = null;
      let metadata: FrontmatterMetadata | null = null;

      if (ext === 'md' || ext === 'markdown') {
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
        this.updateDocument(existing.id, hash, stats.size, hasFrontmatter, frontmatterRaw, metadata);
      } else {
        // Insert new
        this.insertDocument(relativePath, filename, ext, hash, stats.size, hasFrontmatter, frontmatterRaw, metadata);
      }
    } catch {
      // File might have been deleted before we could process it
    }
  }

  /**
   * Sync a changed file to the database
   */
  private syncFileChange(absolutePath: string, relativePath: string): void {
    // Same logic as add - upsert behavior
    this.syncFileAdd(absolutePath, relativePath);
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
    hash: string,
    size: number,
    hasFrontmatter: boolean,
    frontmatterRaw: string | null,
    metadata: FrontmatterMetadata | null
  ): void {
    const now = new Date().toISOString();

    run(
      `INSERT INTO documents (
        id, project_id, path, filename, extension, content_hash, size_bytes, status, last_scanned_at,
        has_frontmatter, frontmatter_raw, meta_status, meta_version, meta_tldr, meta_title,
        meta_modules, meta_dependencies, meta_code_refs, meta_authors
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'tracked', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        metadata?.authors ? JSON.stringify(metadata.authors) : null
      ]
    );
  }

  /**
   * Update an existing document in the database
   */
  private updateDocument(
    id: string,
    hash: string,
    size: number,
    hasFrontmatter: boolean,
    frontmatterRaw: string | null,
    metadata: FrontmatterMetadata | null
  ): void {
    const now = new Date().toISOString();

    run(
      `UPDATE documents SET
        content_hash = ?, size_bytes = ?, status = 'tracked', last_scanned_at = ?, updated_at = datetime('now'),
        has_frontmatter = ?, frontmatter_raw = ?, meta_status = ?, meta_version = ?, meta_tldr = ?, meta_title = ?,
        meta_modules = ?, meta_dependencies = ?, meta_code_refs = ?, meta_authors = ?
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
        id
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
