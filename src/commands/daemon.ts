/**
 * Daemon Command
 *
 * Manages the AIGILE file watcher daemon for automatic file synchronization.
 * Supports installation, start, stop, status, and uninstall operations.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync, statSync, renameSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import { spawn, execSync } from 'child_process';
import { queryOne, queryAll } from '../db/connection.js';
import {
  success,
  error,
  info,
  warning,
  details,
  data,
  getOutputOptions
} from '../services/output-formatter.js';
import {
  findProjectRoot,
  loadProjectConfig,
  getAigileHome,
  getIgnoreFilePath,
  hasIgnoreFile,
  getDbPath,
} from '../utils/config.js';
import { createFileWatcher, FileWatcher } from '../services/file-watcher.js';
import { scanDirectory, syncFilesToDatabase } from '../services/file-scanner.js';
import { DaemonManager, getDaemonManager, DaemonStatus } from '../services/daemon-manager.js';

// Constants for reliability features
const CRASH_DIR_NAME = 'crashes';
const MAX_CRASH_REPORTS = 10;
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;
const SHUTDOWN_TIMEOUT_MS = 10000; // 10 seconds

export const daemonCommand = new Command('daemon')
  .description('Manage the file watcher daemon');

// Platform-specific paths and configurations
const PLATFORM = platform();
const DAEMON_NAME = 'com.aigile.watcher';

interface DaemonPaths {
  plist?: string;        // macOS LaunchAgent plist
  service?: string;      // Linux systemd service
  pidFile: string;       // PID file location
  logFile: string;       // Log file location
}

function getDaemonPaths(): DaemonPaths {
  const aigileHome = getAigileHome();
  const basePaths = {
    pidFile: join(aigileHome, 'daemon.pid'),
    logFile: join(aigileHome, 'daemon.log')
  };

  if (PLATFORM === 'darwin') {
    return {
      ...basePaths,
      plist: join(homedir(), 'Library', 'LaunchAgents', `${DAEMON_NAME}.plist`)
    };
  } else if (PLATFORM === 'linux') {
    return {
      ...basePaths,
      service: join(homedir(), '.config', 'systemd', 'user', `${DAEMON_NAME}.service`)
    };
  }

  return basePaths;
}

/**
 * Check if daemon is running
 */
function isDaemonRunning(): { running: boolean; pid?: number } {
  const paths = getDaemonPaths();

  if (!existsSync(paths.pidFile)) {
    return { running: false };
  }

  try {
    const pid = parseInt(readFileSync(paths.pidFile, 'utf-8').trim(), 10);

    // Check if process is running
    try {
      process.kill(pid, 0); // Signal 0 = check if process exists
      return { running: true, pid };
    } catch {
      // Process not running, clean up stale PID file
      unlinkSync(paths.pidFile);
      return { running: false };
    }
  } catch {
    return { running: false };
  }
}

/**
 * Write a crash report to the crashes directory
 */
function writeCrashReport(error: unknown): void {
  try {
    const crashDir = join(getAigileHome(), CRASH_DIR_NAME);
    if (!existsSync(crashDir)) {
      mkdirSync(crashDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const crashFile = join(crashDir, `crash-${timestamp}.log`);

    const report = [
      `AIGILE Daemon Crash Report`,
      `==========================`,
      ``,
      `Time: ${new Date().toISOString()}`,
      `Node: ${process.version}`,
      `Platform: ${platform()}`,
      `PID: ${process.pid}`,
      ``,
      `Error:`,
      error instanceof Error ? (error.stack || error.message) : String(error),
    ].join('\n');

    writeFileSync(crashFile, report);
    console.error(`[${new Date().toISOString()}] Crash report saved: ${crashFile}`);

    // Cleanup old crash reports (keep only MAX_CRASH_REPORTS most recent)
    cleanupOldCrashReports(crashDir);
  } catch (writeErr) {
    console.error(`[${new Date().toISOString()}] Failed to write crash report: ${writeErr}`);
  }
}

/**
 * Remove old crash reports, keeping only the most recent ones
 */
function cleanupOldCrashReports(crashDir: string): void {
  try {
    const files = readdirSync(crashDir)
      .filter(f => f.startsWith('crash-') && f.endsWith('.log'))
      .map(f => ({ name: f, path: join(crashDir, f) }))
      .sort((a, b) => b.name.localeCompare(a.name)); // Sort descending (newest first)

    // Remove files beyond the limit
    for (let i = MAX_CRASH_REPORTS; i < files.length; i++) {
      try {
        unlinkSync(files[i].path);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/**
 * Rotate log file if it exceeds MAX_LOG_SIZE
 */
function rotateLogIfNeeded(): void {
  const paths = getDaemonPaths();
  const logPath = paths.logFile;

  try {
    if (!existsSync(logPath)) return;

    const stats = statSync(logPath);
    if (stats.size < MAX_LOG_SIZE) return;

    // Rotate the log
    const timestamp = Date.now();
    const rotatedPath = `${logPath}.${timestamp}`;
    renameSync(logPath, rotatedPath);
    console.log(`[${new Date().toISOString()}] Log rotated: ${rotatedPath}`);

    // Cleanup old rotated logs
    cleanupOldLogs(dirname(logPath));
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Log rotation error: ${err}`);
  }
}

/**
 * Remove old rotated log files, keeping only the most recent ones
 */
function cleanupOldLogs(logDir: string): void {
  try {
    const files = readdirSync(logDir)
      .filter(f => f.startsWith('daemon.log.'))
      .map(f => ({ name: f, path: join(logDir, f) }))
      .sort((a, b) => b.name.localeCompare(a.name)); // Sort descending (newest first)

    // Remove files beyond the limit
    for (let i = MAX_LOG_FILES; i < files.length; i++) {
      try {
        unlinkSync(files[i].path);
        console.log(`[${new Date().toISOString()}] Removed old log: ${files[i].name}`);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/**
 * Generate macOS LaunchAgent plist content
 * Note: No longer requires projectPath - daemon watches ALL registered projects
 */
function generateLaunchAgentPlist(): string {
  const paths = getDaemonPaths();
  const nodePath = process.execPath;
  const aigilePath = join(dirname(dirname(import.meta.url.replace('file://', ''))), 'bin', 'aigile.js');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${DAEMON_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${aigilePath}</string>
        <string>daemon</string>
        <string>run</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${homedir()}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>${paths.logFile}</string>
    <key>StandardErrorPath</key>
    <string>${paths.logFile}</string>
</dict>
</plist>`;
}

/**
 * Generate Linux systemd user service content
 * Note: No longer requires projectPath - daemon watches ALL registered projects
 */
function generateSystemdService(): string {
  const paths = getDaemonPaths();
  const nodePath = process.execPath;
  const aigilePath = join(dirname(dirname(import.meta.url.replace('file://', ''))), 'bin', 'aigile.js');

  return `[Unit]
Description=AIGILE File Watcher Daemon
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${aigilePath} daemon run
WorkingDirectory=${homedir()}
Restart=on-failure
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5
StandardOutput=append:${paths.logFile}
StandardError=append:${paths.logFile}

[Install]
WantedBy=default.target`;
}

// Install command - install daemon to auto-start on boot
daemonCommand
  .command('install')
  .description('Install daemon to start automatically on system boot (watches ALL registered projects)')
  .action(() => {
    const opts = getOutputOptions(daemonCommand);
    const paths = getDaemonPaths();

    // No longer requires being in a project - daemon watches ALL projects

    if (PLATFORM === 'darwin') {
      // macOS LaunchAgent
      const plistDir = dirname(paths.plist!);
      if (!existsSync(plistDir)) {
        mkdirSync(plistDir, { recursive: true });
      }

      const plistContent = generateLaunchAgentPlist();
      writeFileSync(paths.plist!, plistContent);

      success('Installed macOS LaunchAgent', opts);
      info(`Plist location: ${paths.plist}`, opts);
      info('Daemon will watch ALL registered projects', opts);
      info('Run "aigile daemon start" to start the watcher', opts);

    } else if (PLATFORM === 'linux') {
      // Linux systemd user service
      const serviceDir = dirname(paths.service!);
      if (!existsSync(serviceDir)) {
        mkdirSync(serviceDir, { recursive: true });
      }

      const serviceContent = generateSystemdService();
      writeFileSync(paths.service!, serviceContent);

      // Reload systemd user daemon
      try {
        execSync('systemctl --user daemon-reload');
        execSync(`systemctl --user enable ${DAEMON_NAME}`);
        success('Installed and enabled systemd user service', opts);
        info(`Service location: ${paths.service}`, opts);
        info('Daemon will watch ALL registered projects', opts);
        info('Run "aigile daemon start" to start the watcher', opts);
      } catch (err) {
        warning('Service file created but could not enable. You may need to run:', opts);
        console.log(`  systemctl --user daemon-reload`);
        console.log(`  systemctl --user enable ${DAEMON_NAME}`);
      }

    } else {
      error(`Daemon installation not supported on ${PLATFORM}`, opts);
      info('You can run "aigile daemon run" manually instead', opts);
      process.exit(1);
    }
  });

// Uninstall command - remove daemon from auto-start
daemonCommand
  .command('uninstall')
  .description('Remove daemon from auto-start')
  .action(() => {
    const opts = getOutputOptions(daemonCommand);
    const paths = getDaemonPaths();

    // Stop daemon first
    const status = isDaemonRunning();
    if (status.running) {
      info('Stopping daemon first...', opts);
      try {
        process.kill(status.pid!, 'SIGTERM');
      } catch {
        // Ignore
      }
    }

    if (PLATFORM === 'darwin' && paths.plist && existsSync(paths.plist)) {
      try {
        execSync(`launchctl unload ${paths.plist}`);
      } catch {
        // Might not be loaded
      }
      unlinkSync(paths.plist);
      success('Removed macOS LaunchAgent', opts);

    } else if (PLATFORM === 'linux' && paths.service && existsSync(paths.service)) {
      try {
        execSync(`systemctl --user stop ${DAEMON_NAME}`);
        execSync(`systemctl --user disable ${DAEMON_NAME}`);
      } catch {
        // Might not be running
      }
      unlinkSync(paths.service);
      try {
        execSync('systemctl --user daemon-reload');
      } catch {
        // Ignore
      }
      success('Removed systemd user service', opts);

    } else {
      info('No daemon installation found', opts);
    }

    // Clean up PID file
    if (existsSync(paths.pidFile)) {
      unlinkSync(paths.pidFile);
    }
  });

// Start command - start the daemon (watches ALL registered projects)
daemonCommand
  .command('start')
  .description('Start the file watcher daemon (watches ALL registered projects)')
  .action(() => {
    const opts = getOutputOptions(daemonCommand);
    const paths = getDaemonPaths();

    const status = isDaemonRunning();
    if (status.running) {
      info(`Daemon already running (PID: ${status.pid})`, opts);
      return;
    }

    if (PLATFORM === 'darwin' && paths.plist && existsSync(paths.plist)) {
      try {
        execSync(`launchctl load ${paths.plist}`);
        success('Started daemon via launchctl (watching all projects)', opts);
      } catch (err) {
        error('Failed to start daemon via launchctl', opts);
        process.exit(1);
      }

    } else if (PLATFORM === 'linux' && paths.service && existsSync(paths.service)) {
      try {
        execSync(`systemctl --user start ${DAEMON_NAME}`);
        success('Started daemon via systemctl (watching all projects)', opts);
      } catch (err) {
        error('Failed to start daemon via systemctl', opts);
        process.exit(1);
      }

    } else {
      // Fallback: start as background process (no longer requires project context)
      const child = spawn(process.execPath, [process.argv[1], 'daemon', 'run'], {
        detached: true,
        stdio: 'ignore'
      });

      child.unref();

      if (child.pid) {
        // Validate process is actually running before writing PID
        try {
          process.kill(child.pid, 0);
          writeFileSync(paths.pidFile, String(child.pid));
          success(`Started daemon (PID: ${child.pid}) - watching all projects`, opts);
        } catch {
          error('Failed to start daemon - process died immediately', opts);
          process.exit(1);
        }
      } else {
        error('Failed to start daemon', opts);
        process.exit(1);
      }
    }
  });

// Stop command - stop the daemon
daemonCommand
  .command('stop')
  .description('Stop the file watcher daemon')
  .action(() => {
    const opts = getOutputOptions(daemonCommand);
    const paths = getDaemonPaths();

    if (PLATFORM === 'darwin' && paths.plist && existsSync(paths.plist)) {
      try {
        execSync(`launchctl unload ${paths.plist}`);
        success('Stopped daemon via launchctl', opts);
      } catch {
        // Might not be loaded
        info('Daemon was not running', opts);
      }

    } else if (PLATFORM === 'linux' && paths.service && existsSync(paths.service)) {
      try {
        execSync(`systemctl --user stop ${DAEMON_NAME}`);
        success('Stopped daemon via systemctl', opts);
      } catch {
        info('Daemon was not running', opts);
      }

    } else {
      const status = isDaemonRunning();
      if (status.running && status.pid) {
        try {
          process.kill(status.pid, 'SIGTERM');
          if (existsSync(paths.pidFile)) {
            unlinkSync(paths.pidFile);
          }
          success(`Stopped daemon (PID: ${status.pid})`, opts);
        } catch {
          error('Failed to stop daemon', opts);
          process.exit(1);
        }
      } else {
        info('Daemon is not running', opts);
      }
    }
  });

// Status command - show daemon status for ALL projects
daemonCommand
  .command('status')
  .description('Show daemon status for ALL registered projects')
  .action(() => {
    const opts = getOutputOptions(daemonCommand);
    const paths = getDaemonPaths();
    const status = isDaemonRunning();

    // Get all registered projects with their file counts
    const projects = queryAll<{
      id: string;
      key: string;
      name: string;
      path: string;
      is_default: number;
    }>('SELECT id, key, name, path, is_default FROM projects ORDER BY is_default DESC, key');

    // Get file counts per project
    const projectStats: Array<{
      key: string;
      name: string;
      path: string;
      valid: boolean;
      allow: number;
      unknown: number;
      total: number;
    }> = [];

    let totalFiles = { allow: 0, unknown: 0, total: 0 };

    for (const project of projects) {
      const valid = existsSync(project.path) && existsSync(join(project.path, '.aigile'));

      // Get category counts for this project
      const counts = queryAll<{ monitoring_category: string; count: number }>(`
        SELECT COALESCE(monitoring_category, 'unknown') as monitoring_category, COUNT(*) as count
        FROM documents
        WHERE project_id = ? AND status != 'deleted'
        GROUP BY monitoring_category
      `, [project.id]);

      let allow = 0;
      let unknown = 0;
      for (const row of counts) {
        if (row.monitoring_category === 'allow') allow = row.count;
        else if (row.monitoring_category === 'unknown') unknown = row.count;
      }

      projectStats.push({
        key: project.key,
        name: project.name,
        path: project.path,
        valid,
        allow,
        unknown,
        total: allow + unknown,
      });

      if (valid) {
        totalFiles.allow += allow;
        totalFiles.unknown += unknown;
        totalFiles.total += allow + unknown;
      }
    }

    const validCount = projectStats.filter(p => p.valid).length;

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          running: status.running,
          pid: status.pid ?? null,
          platform: PLATFORM,
          installed: PLATFORM === 'darwin'
            ? (paths.plist && existsSync(paths.plist))
            : PLATFORM === 'linux'
              ? (paths.service && existsSync(paths.service))
              : false,
          projectCount: projects.length,
          validProjectCount: validCount,
          projects: projectStats,
          totalFiles,
          paths: {
            database: getDbPath(),
            pidFile: paths.pidFile,
            logFile: paths.logFile,
          }
        }
      }));
      return;
    }

    console.log('\n📊 Daemon Status\n');
    console.log(`├── Running: ${status.running ? '✅ Yes' : '❌ No'}${status.pid ? ` (PID: ${status.pid})` : ''}`);
    console.log(`├── Platform: ${PLATFORM}`);

    const installed = PLATFORM === 'darwin'
      ? (paths.plist && existsSync(paths.plist))
      : PLATFORM === 'linux'
        ? (paths.service && existsSync(paths.service))
        : false;
    console.log(`├── Installed: ${installed ? '✅ Yes' : '❌ No'}`);

    console.log(`├── Projects: ${validCount}/${projects.length} valid`);

    if (projectStats.length > 0) {
      for (let i = 0; i < projectStats.length; i++) {
        const p = projectStats[i];
        const isLast = i === projectStats.length - 1;
        const prefix = isLast ? '│   └──' : '│   ├──';
        const validStr = p.valid ? '✓' : '✗';
        console.log(`${prefix} ${validStr} ${p.key}: ${p.allow} allow, ${p.unknown} unknown`);
      }
    }

    console.log('├── Total Files:');
    console.log(`│   ├── Allow (focus): ${totalFiles.allow}`);
    console.log(`│   └── Unknown (review): ${totalFiles.unknown}`);

    console.log('└── System:');
    console.log(`    ├── Database: ${getDbPath()}`);
    console.log(`    ├── PID File: ${paths.pidFile}`);
    console.log(`    └── Log File: ${paths.logFile}`);
    console.log('');

    if (projectStats.some(p => !p.valid)) {
      console.log('⚠️  Some projects have invalid paths. Run "aigile project cleanup" to remove them.\n');
    }
  });

/**
 * Get relative time string from ISO date
 */
function getRelativeTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return `${diffDay}d ago`;
  } catch {
    return isoDate;
  }
}

// Run command - run the watcher in foreground for ALL projects
daemonCommand
  .command('run')
  .option('--skip-resync', 'Skip initial resync on startup')
  .description('Run the file watcher in foreground for ALL registered projects')
  .action(async (options) => {
    const opts = getOutputOptions(daemonCommand);
    const paths = getDaemonPaths();

    // Set up global exception handlers FIRST (before any async work)
    process.on('uncaughtException', (err) => {
      console.error(`[${new Date().toISOString()}] FATAL: Uncaught exception:`);
      console.error(err.stack || err.message);
      writeCrashReport(err);
      // Clean up PID file before exit
      if (existsSync(paths.pidFile)) {
        try { unlinkSync(paths.pidFile); } catch { /* ignore */ }
      }
      process.exit(1); // Exit - LaunchAgent/systemd will restart
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error(`[${new Date().toISOString()}] FATAL: Unhandled promise rejection:`);
      console.error(reason);
      writeCrashReport(reason);
      // Clean up PID file before exit
      if (existsSync(paths.pidFile)) {
        try { unlinkSync(paths.pidFile); } catch { /* ignore */ }
      }
      process.exit(1);
    });

    // Rotate log if needed before we start
    rotateLogIfNeeded();

    // Write PID file
    writeFileSync(paths.pidFile, String(process.pid));

    console.log(`[${new Date().toISOString()}] Starting AIGILE daemon for all registered projects...`);
    console.log(`[${new Date().toISOString()}] PID: ${process.pid}, Node: ${process.version}, Platform: ${platform()}`);

    // Use DaemonManager for multi-project watching
    const manager = getDaemonManager();

    // Perform initial resync for all projects if requested
    if (!options.skipResync) {
      console.log(`[${new Date().toISOString()}] Performing initial resync for all projects...`);
      try {
        const results = await manager.resyncAll();
        const projectCount = Object.keys(results).length;
        console.log(`[${new Date().toISOString()}] Resync complete: ${projectCount} projects synced`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Resync warning: ${err}`);
        // Continue anyway - live watching will pick up changes
      }
    }

    // Set up event handlers
    manager.on('sync', (event) => {
      const categoryStr = event.category ? ` [${event.category}]` : '';
      console.log(`[${new Date().toISOString()}] [${event.project}] Synced: ${event.type} ${event.path}${categoryStr}`);
    });

    manager.on('syncError', ({ project, event, error: err }) => {
      console.error(`[${new Date().toISOString()}] [${project}] Sync error: ${event.type} ${event.path} - ${err}`);
    });

    manager.on('watcherError', ({ project, error: err }) => {
      console.error(`[${new Date().toISOString()}] [${project}] Watcher error: ${err}`);
    });

    // Handle shutdown signals with timeout
    let isShuttingDown = false;
    const shutdown = async () => {
      if (isShuttingDown) return; // Prevent multiple shutdown attempts
      isShuttingDown = true;

      console.log(`[${new Date().toISOString()}] Shutting down...`);

      // Set a timeout for graceful shutdown
      const forceExitTimeout = setTimeout(() => {
        console.error(`[${new Date().toISOString()}] Shutdown timeout (${SHUTDOWN_TIMEOUT_MS}ms) - forcing exit`);
        if (existsSync(paths.pidFile)) {
          try { unlinkSync(paths.pidFile); } catch { /* ignore */ }
        }
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS);

      try {
        await manager.stop();
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error during shutdown: ${err}`);
      }

      clearTimeout(forceExitTimeout);
      if (existsSync(paths.pidFile)) {
        unlinkSync(paths.pidFile);
      }
      console.log(`[${new Date().toISOString()}] Daemon stopped gracefully`);
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Set up periodic log rotation check (every hour)
    const logRotationInterval = setInterval(() => {
      rotateLogIfNeeded();
    }, 60 * 60 * 1000); // 1 hour

    // Clean up interval on shutdown
    process.on('exit', () => {
      clearInterval(logRotationInterval);
    });

    // Start watching all projects
    try {
      const status = await manager.start();
      console.log(`[${new Date().toISOString()}] Daemon started - watching ${status.watchingCount} projects`);
      for (const p of status.projects) {
        if (p.watching) {
          console.log(`[${new Date().toISOString()}]   ✓ ${p.key}: ${p.path}`);
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Failed to start daemon: ${err}`);
      if (existsSync(paths.pidFile)) {
        unlinkSync(paths.pidFile);
      }
      process.exit(1);
    }
  });

// Logs command - show recent logs
daemonCommand
  .command('logs')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .description('Show daemon logs')
  .action((options) => {
    const opts = getOutputOptions(daemonCommand);
    const paths = getDaemonPaths();

    if (!existsSync(paths.logFile)) {
      info('No log file found. Daemon may not have run yet.', opts);
      return;
    }

    if (options.follow) {
      // Use tail -f
      const tail = spawn('tail', ['-f', paths.logFile], {
        stdio: 'inherit'
      });

      process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
      });
    } else {
      // Show last N lines
      try {
        const output = execSync(`tail -n ${options.lines} "${paths.logFile}"`, { encoding: 'utf-8' });
        console.log(output);
      } catch {
        error('Failed to read log file', opts);
      }
    }
  });

// Resync command - perform full resync of ALL projects
daemonCommand
  .command('resync')
  .option('--project <key>', 'Resync only a specific project')
  .description('Perform a full resync of all files for all registered projects')
  .action(async (options) => {
    const opts = getOutputOptions(daemonCommand);
    const manager = getDaemonManager();

    if (options.project) {
      // Resync specific project
      info(`Resyncing project ${options.project}...`, opts);

      try {
        const result = await manager.resyncProject(options.project);
        if (!result) {
          error(`Project "${options.project}" not found or invalid.`, opts);
          process.exit(1);
        }

        if (opts.json) {
          console.log(JSON.stringify({
            success: true,
            data: {
              project: options.project,
              ...result,
            }
          }));
        } else {
          success(`Resync complete for ${options.project}:`, opts);
          console.log(`  Allow:   ${result.allow}`);
          console.log(`  Deny:    ${result.deny}`);
          console.log(`  Unknown: ${result.unknown}`);
        }
      } catch (err) {
        error(`Resync failed: ${err}`, opts);
        process.exit(1);
      }
      return;
    }

    // Resync ALL projects
    info('Resyncing all registered projects...', opts);
    info('This may take a while for large repositories.', opts);

    try {
      const results = await manager.resyncAll();
      const projectKeys = Object.keys(results);

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          data: {
            projectCount: projectKeys.length,
            projects: results,
          }
        }));
      } else {
        success(`Resync complete: ${projectKeys.length} projects`, opts);
        for (const [key, result] of Object.entries(results)) {
          console.log(`  ${key}: ${result.allow} allow, ${result.unknown} unknown`);
        }
      }
    } catch (err) {
      error(`Resync failed: ${err}`, opts);
      process.exit(1);
    }
  });

// Review command - review unknown files
daemonCommand
  .command('review')
  .option('--list', 'Just list unknown files without interactive review')
  .option('--auto', 'Auto-suggest category based on extension')
  .description('Review and classify unknown files')
  .action((options) => {
    const opts = getOutputOptions(daemonCommand);

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      error('Not in an AIGILE project. Run "aigile init" first.', opts);
      process.exit(1);
    }

    const config = loadProjectConfig(projectRoot);
    if (!config) {
      error('Could not load project config.', opts);
      process.exit(1);
    }

    const project = queryOne<{ id: string }>('SELECT id FROM projects WHERE key = ?', [config.project.key]);
    if (!project) {
      error(`Project "${config.project.key}" not found in database.`, opts);
      process.exit(1);
    }

    // Get unknown files
    const unknownFiles = queryAll<{
      id: string;
      path: string;
      extension: string;
      size_bytes: number;
      updated_at: string;
    }>(`
      SELECT id, path, extension, size_bytes, updated_at
      FROM documents
      WHERE project_id = ? AND monitoring_category = 'unknown' AND status != 'deleted'
      ORDER BY path
    `, [project.id]);

    if (unknownFiles.length === 0) {
      success('No unknown files to review! All files are classified.', opts);
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          count: unknownFiles.length,
          files: unknownFiles,
        }
      }));
      return;
    }

    if (options.list) {
      // Just list the files
      console.log(`\n📋 Unknown Files (${unknownFiles.length} total)\n`);
      data(
        unknownFiles.map(f => ({
          path: f.path,
          extension: f.extension || '-',
          size: formatBytes(f.size_bytes),
          updated: getRelativeTime(f.updated_at),
        })),
        [
          { header: 'Path', key: 'path', width: 60 },
          { header: 'Ext', key: 'extension', width: 8 },
          { header: 'Size', key: 'size', width: 10 },
          { header: 'Updated', key: 'updated', width: 12 },
        ],
        opts
      );
      console.log('\nUse "aigile daemon allow <pattern>" or "aigile daemon deny <pattern>" to classify files.');
      return;
    }

    // Interactive or auto mode would require readline
    // For now, just show the list with suggestions
    console.log(`\n📋 Unknown Files (${unknownFiles.length} total)\n`);
    console.log('Run "aigile daemon review --list" to see all files.');
    console.log('Use "aigile daemon allow <pattern>" or "aigile daemon deny <pattern>" to classify.\n');

    // Show sample
    const sample = unknownFiles.slice(0, 10);
    for (const file of sample) {
      console.log(`  ${file.path} (.${file.extension || 'no ext'})`);
    }
    if (unknownFiles.length > 10) {
      console.log(`  ... and ${unknownFiles.length - 10} more files`);
    }
  });

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
