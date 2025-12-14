/**
 * Daemon Manager Service
 *
 * Orchestrates multiple FileWatcher instances to monitor ALL registered projects.
 * Provides a unified interface for managing the daemon across projects.
 *
 * @author Vladimir K.S.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { FileWatcher, WatcherConfig, WatcherStats } from './file-watcher.js';
import { scanDirectory, syncFilesToDatabase, getSyncStatus } from './file-scanner.js';
import { queryAll } from '../db/connection.js';

/**
 * Scan results from file scanner
 */
export interface ScanResults {
  total: number;
  new: number;
  modified: number;
  deleted: number;
  unchanged: number;
  allow: number;
  deny: number;
  unknown: number;
}

/**
 * Project record from database
 */
export interface Project {
  id: string;
  key: string;
  name: string;
  path: string;
  is_default: number;
}

/**
 * Per-project status
 */
export interface ProjectStatus {
  key: string;
  name: string;
  path: string;
  valid: boolean;
  watching: boolean;
  stats: WatcherStats | null;
}

/**
 * Overall daemon status
 */
export interface DaemonStatus {
  running: boolean;
  projectCount: number;
  watchingCount: number;
  projects: ProjectStatus[];
  totalFiles: {
    allow: number;
    deny: number;
    unknown: number;
  };
}

// Constants for watcher retry logic
const MAX_WATCHER_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 5000; // 5 seconds

/**
 * Daemon Manager - manages multiple FileWatcher instances
 */
export class DaemonManager extends EventEmitter {
  private watchers: Map<string, FileWatcher> = new Map();
  private watcherRetries: Map<string, number> = new Map();
  private running: boolean = false;
  private startedAt: Date | null = null;

  /**
   * Start watching all registered projects
   */
  async start(): Promise<DaemonStatus> {
    if (this.running) {
      throw new Error('Daemon is already running');
    }

    const projects = await this.getActiveProjects();

    if (projects.length === 0) {
      console.log('No valid projects to watch. Register projects with "aigile init".');
      this.running = true;
      this.startedAt = new Date();
      return this.getStatus();
    }

    console.log(`Starting watchers for ${projects.length} project(s)...`);

    for (const project of projects) {
      await this.startWatcherWithRetry(project);
    }

    this.running = true;
    this.startedAt = new Date();
    this.emit('started', { projectCount: this.watchers.size });

    return this.getStatus();
  }

  /**
   * Start a watcher for a project with automatic retry on failure
   */
  private async startWatcherWithRetry(project: Project): Promise<void> {
    const retryCount = this.watcherRetries.get(project.key) ?? 0;

    try {
      const config: WatcherConfig = {
        projectId: project.id,
        projectPath: project.path,
        trackUnknown: true,
      };

      const watcher = new FileWatcher(config);

      // Forward events
      watcher.on('sync', (event) => {
        this.emit('sync', { project: project.key, ...event });
      });

      watcher.on('syncError', (data) => {
        this.emit('syncError', { project: project.key, ...data });
      });

      // Handle watcher errors with auto-recovery
      watcher.on('error', async (err) => {
        console.error(`[${new Date().toISOString()}] [${project.key}] Watcher error: ${err}`);
        this.emit('watcherError', { project: project.key, error: err });

        // Stop the failed watcher
        try {
          await watcher.stop();
        } catch { /* ignore */ }
        this.watchers.delete(project.key);

        // Attempt restart with retry logic
        const currentRetries = this.watcherRetries.get(project.key) ?? 0;
        if (currentRetries < MAX_WATCHER_RETRIES) {
          this.watcherRetries.set(project.key, currentRetries + 1);
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, currentRetries); // Exponential backoff
          console.log(`[${new Date().toISOString()}] [${project.key}] Will retry in ${delay}ms (attempt ${currentRetries + 1}/${MAX_WATCHER_RETRIES})`);

          setTimeout(async () => {
            if (this.running) {
              console.log(`[${new Date().toISOString()}] [${project.key}] Attempting restart...`);
              await this.startWatcherWithRetry(project);
            }
          }, delay);
        } else {
          console.error(`[${new Date().toISOString()}] [${project.key}] Max retries (${MAX_WATCHER_RETRIES}) exceeded - watcher disabled`);
          this.emit('watcherDisabled', { project: project.key });
        }
      });

      watcher.start();
      this.watchers.set(project.key, watcher);
      this.watcherRetries.set(project.key, 0); // Reset retry count on success
      console.log(`  ✓ ${project.key}: ${project.path}`);
    } catch (error) {
      console.error(`  ✗ ${project.key}: Failed to start watcher - ${error}`);
      this.emit('watcherError', { project: project.key, error });

      // Schedule retry on startup failure
      if (retryCount < MAX_WATCHER_RETRIES) {
        this.watcherRetries.set(project.key, retryCount + 1);
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        console.log(`[${new Date().toISOString()}] [${project.key}] Will retry in ${delay}ms (attempt ${retryCount + 1}/${MAX_WATCHER_RETRIES})`);

        setTimeout(async () => {
          if (this.running) {
            await this.startWatcherWithRetry(project);
          }
        }, delay);
      }
    }
  }

  /**
   * Stop all watchers
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('Stopping all watchers...');

    for (const [key, watcher] of this.watchers) {
      try {
        await watcher.stop();
        console.log(`  ✓ Stopped: ${key}`);
      } catch (error) {
        console.error(`  ✗ Error stopping ${key}: ${error}`);
      }
    }

    this.watchers.clear();
    this.running = false;
    this.startedAt = null;
    this.emit('stopped');
  }

  /**
   * Resync all projects
   */
  async resyncAll(): Promise<Record<string, ScanResults>> {
    const results: Record<string, ScanResults> = {};
    const projects = await this.getActiveProjects();

    console.log(`Resyncing ${projects.length} project(s)...`);

    for (const project of projects) {
      try {
        // Scan all files
        const files = scanDirectory(project.path);

        // Sync to database
        const syncResult = syncFilesToDatabase(project.id, project.path, files);

        // Get category counts
        const status = getSyncStatus(project.id);

        const result: ScanResults = {
          total: syncResult.total,
          new: syncResult.new,
          modified: syncResult.modified,
          deleted: syncResult.deleted,
          unchanged: syncResult.unchanged,
          allow: status.byCategory.allow,
          deny: status.byCategory.deny,
          unknown: status.byCategory.unknown,
        };

        results[project.key] = result;
        console.log(`  ✓ ${project.key}: ${result.allow} allow, ${result.unknown} unknown`);
      } catch (error) {
        console.error(`  ✗ ${project.key}: Resync failed - ${error}`);
      }
    }

    return results;
  }

  /**
   * Resync a specific project
   */
  async resyncProject(key: string): Promise<ScanResults | null> {
    const projects = await this.getActiveProjects();
    const project = projects.find(p => p.key === key);

    if (!project) {
      throw new Error(`Project "${key}" not found or invalid`);
    }

    // Scan all files
    const files = scanDirectory(project.path);

    // Sync to database
    const syncResult = syncFilesToDatabase(project.id, project.path, files);

    // Get category counts
    const status = getSyncStatus(project.id);

    return {
      total: syncResult.total,
      new: syncResult.new,
      modified: syncResult.modified,
      deleted: syncResult.deleted,
      unchanged: syncResult.unchanged,
      allow: status.byCategory.allow,
      deny: status.byCategory.deny,
      unknown: status.byCategory.unknown,
    };
  }

  /**
   * Get daemon status
   */
  getStatus(): DaemonStatus {
    const projectStatuses: ProjectStatus[] = [];
    const totalFiles = { allow: 0, deny: 0, unknown: 0 };

    // Get all registered projects
    const allProjects = queryAll<Project>('SELECT * FROM projects ORDER BY key');

    for (const project of allProjects) {
      const valid = this.isValidProject(project.path);
      const watcher = this.watchers.get(project.key);
      const stats = watcher?.getStats() ?? null;

      if (stats) {
        totalFiles.allow += stats.categoryCounts.allow;
        totalFiles.deny += stats.categoryCounts.deny;
        totalFiles.unknown += stats.categoryCounts.unknown;
      }

      projectStatuses.push({
        key: project.key,
        name: project.name,
        path: project.path,
        valid,
        watching: watcher !== undefined,
        stats,
      });
    }

    return {
      running: this.running,
      projectCount: allProjects.length,
      watchingCount: this.watchers.size,
      projects: projectStatuses,
      totalFiles,
    };
  }

  /**
   * Check if daemon is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get uptime in milliseconds
   */
  getUptime(): number {
    if (!this.startedAt) {
      return 0;
    }
    return Date.now() - this.startedAt.getTime();
  }

  /**
   * Get all valid registered projects
   */
  private async getActiveProjects(): Promise<Project[]> {
    const projects = queryAll<Project>('SELECT * FROM projects ORDER BY key');
    return projects.filter(p => this.isValidProject(p.path));
  }

  /**
   * Check if a project path is valid
   */
  private isValidProject(path: string): boolean {
    return existsSync(path) && existsSync(join(path, '.aigile'));
  }
}

/**
 * Singleton instance for the daemon process
 */
let daemonManagerInstance: DaemonManager | null = null;

/**
 * Get or create the daemon manager instance
 */
export function getDaemonManager(): DaemonManager {
  if (!daemonManagerInstance) {
    daemonManagerInstance = new DaemonManager();
  }
  return daemonManagerInstance;
}

/**
 * Reset the daemon manager instance (for testing)
 */
export function resetDaemonManager(): void {
  daemonManagerInstance = null;
}
