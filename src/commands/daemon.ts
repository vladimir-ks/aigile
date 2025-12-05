/**
 * Daemon Command
 *
 * Manages the AIGILE file watcher daemon for automatic file synchronization.
 * Supports installation, start, stop, status, and uninstall operations.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import { spawn, execSync } from 'child_process';
import { queryOne } from '../db/connection.js';
import {
  success,
  error,
  info,
  warning,
  details,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig, getAigileHome } from '../utils/config.js';
import { createFileWatcher, FileWatcher } from '../services/file-watcher.js';

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
 * Generate macOS LaunchAgent plist content
 */
function generateLaunchAgentPlist(projectPath: string): string {
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
        <string>--project</string>
        <string>${projectPath}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${projectPath}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${paths.logFile}</string>
    <key>StandardErrorPath</key>
    <string>${paths.logFile}</string>
</dict>
</plist>`;
}

/**
 * Generate Linux systemd user service content
 */
function generateSystemdService(projectPath: string): string {
  const paths = getDaemonPaths();
  const nodePath = process.execPath;
  const aigilePath = join(dirname(dirname(import.meta.url.replace('file://', ''))), 'bin', 'aigile.js');

  return `[Unit]
Description=AIGILE File Watcher Daemon
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${aigilePath} daemon run --project ${projectPath}
WorkingDirectory=${projectPath}
Restart=always
RestartSec=5
StandardOutput=append:${paths.logFile}
StandardError=append:${paths.logFile}

[Install]
WantedBy=default.target`;
}

// Install command - install daemon to auto-start on boot
daemonCommand
  .command('install')
  .description('Install daemon to start automatically on system boot')
  .action(() => {
    const opts = getOutputOptions(daemonCommand);

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      error('Not in an AIGILE project. Run "aigile init" first.', opts);
      process.exit(1);
    }

    const paths = getDaemonPaths();

    if (PLATFORM === 'darwin') {
      // macOS LaunchAgent
      const plistDir = dirname(paths.plist!);
      if (!existsSync(plistDir)) {
        mkdirSync(plistDir, { recursive: true });
      }

      const plistContent = generateLaunchAgentPlist(projectRoot);
      writeFileSync(paths.plist!, plistContent);

      success('Installed macOS LaunchAgent', opts);
      info(`Plist location: ${paths.plist}`, opts);
      info('Run "aigile daemon start" to start the watcher', opts);

    } else if (PLATFORM === 'linux') {
      // Linux systemd user service
      const serviceDir = dirname(paths.service!);
      if (!existsSync(serviceDir)) {
        mkdirSync(serviceDir, { recursive: true });
      }

      const serviceContent = generateSystemdService(projectRoot);
      writeFileSync(paths.service!, serviceContent);

      // Reload systemd user daemon
      try {
        execSync('systemctl --user daemon-reload');
        execSync(`systemctl --user enable ${DAEMON_NAME}`);
        success('Installed and enabled systemd user service', opts);
        info(`Service location: ${paths.service}`, opts);
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

// Start command - start the daemon
daemonCommand
  .command('start')
  .description('Start the file watcher daemon')
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
        success('Started daemon via launchctl', opts);
      } catch (err) {
        error('Failed to start daemon via launchctl', opts);
        process.exit(1);
      }

    } else if (PLATFORM === 'linux' && paths.service && existsSync(paths.service)) {
      try {
        execSync(`systemctl --user start ${DAEMON_NAME}`);
        success('Started daemon via systemctl', opts);
      } catch (err) {
        error('Failed to start daemon via systemctl', opts);
        process.exit(1);
      }

    } else {
      // Fallback: start as background process
      const projectRoot = findProjectRoot();
      if (!projectRoot) {
        error('Not in an AIGILE project. Run "aigile init" first.', opts);
        process.exit(1);
      }

      const child = spawn(process.execPath, [process.argv[1], 'daemon', 'run', '--project', projectRoot], {
        detached: true,
        stdio: 'ignore'
      });

      child.unref();

      if (child.pid) {
        writeFileSync(paths.pidFile, String(child.pid));
        success(`Started daemon (PID: ${child.pid})`, opts);
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

// Status command - show daemon status
daemonCommand
  .command('status')
  .description('Show daemon status')
  .action(() => {
    const opts = getOutputOptions(daemonCommand);
    const paths = getDaemonPaths();
    const status = isDaemonRunning();

    const statusInfo: Record<string, unknown> = {
      running: status.running ? 'Yes' : 'No',
      pid: status.pid ?? '-',
      platform: PLATFORM,
      pid_file: paths.pidFile,
      log_file: paths.logFile
    };

    if (PLATFORM === 'darwin') {
      statusInfo.plist = paths.plist ?? '-';
      statusInfo.installed = paths.plist && existsSync(paths.plist) ? 'Yes' : 'No';
    } else if (PLATFORM === 'linux') {
      statusInfo.service = paths.service ?? '-';
      statusInfo.installed = paths.service && existsSync(paths.service) ? 'Yes' : 'No';
    }

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: statusInfo }));
    } else {
      details(
        statusInfo,
        [
          { label: 'Running', key: 'running' },
          { label: 'PID', key: 'pid' },
          { label: 'Platform', key: 'platform' },
          { label: 'Installed', key: 'installed' },
          { label: 'PID File', key: 'pid_file' },
          { label: 'Log File', key: 'log_file' }
        ],
        opts
      );
    }
  });

// Run command - run the watcher in foreground (used by daemon)
daemonCommand
  .command('run')
  .option('--project <path>', 'Project path to watch')
  .description('Run the file watcher in foreground (used by daemon)')
  .action(async (options) => {
    const opts = getOutputOptions(daemonCommand);
    const paths = getDaemonPaths();

    let projectRoot = options.project;
    if (!projectRoot) {
      projectRoot = findProjectRoot();
    }

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

    // Write PID file
    writeFileSync(paths.pidFile, String(process.pid));

    // Create and start file watcher
    const watcher = createFileWatcher({
      projectId: project.id,
      projectPath: projectRoot,
      useGitignore: true
    });

    watcher.on('ready', (stats) => {
      console.log(`[${new Date().toISOString()}] Watcher ready - watching ${stats.filesWatched} files`);
    });

    watcher.on('sync', (event) => {
      console.log(`[${new Date().toISOString()}] Synced: ${event.type} ${event.path}`);
    });

    watcher.on('syncError', ({ event, error: err }) => {
      console.error(`[${new Date().toISOString()}] Sync error: ${event.type} ${event.path} - ${err}`);
    });

    watcher.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] Watcher error: ${err}`);
    });

    // Handle shutdown signals
    const shutdown = async () => {
      console.log(`[${new Date().toISOString()}] Shutting down...`);
      await watcher.stop();
      if (existsSync(paths.pidFile)) {
        unlinkSync(paths.pidFile);
      }
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Start watching
    watcher.start();
    console.log(`[${new Date().toISOString()}] Starting file watcher for ${projectRoot}...`);
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
