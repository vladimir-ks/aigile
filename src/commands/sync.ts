/**
 * Sync Command
 *
 * File synchronization and document tracking commands.
 * Scans repository files, tracks changes, and parses comments.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { join } from 'path';
import { queryOne } from '../db/connection.js';
import {
  success,
  error,
  info,
  data,
  details,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import {
  scanDirectory,
  syncFilesToDatabase,
  getSyncStatus,
  getDocuments,
  ScanOptions
} from '../services/file-scanner.js';
import {
  parseComments,
  syncCommentsToDatabase,
  getCommentStats
} from '../services/comment-parser.js';

export const syncCommand = new Command('sync')
  .description('File synchronization and document tracking');

// Scan command - scan and sync files
syncCommand
  .command('scan')
  .option('--patterns <patterns>', 'Comma-separated glob patterns (e.g., "**/*.md,**/*.feature")')
  .option('--ignore <dirs>', 'Comma-separated directories to ignore')
  .option('--comments', 'Also parse and sync comments from files')
  .option('--shadow', 'Shadow mode: track files without modifying them (for brownfield projects)')
  .option('--track-all', 'Track all source files, not just docs (use with --shadow)')
  .option('--include <patterns>', 'Additional patterns to include (e.g., "**/*.ts,**/*.js")')
  .option('--exclude <patterns>', 'Additional patterns to exclude')
  .description('Scan repository files and sync to database')
  .action((options) => {
    const opts = getOutputOptions(syncCommand);

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

    // Build scan options
    const scanOptions: ScanOptions = {};

    // Shadow mode with --track-all expands patterns to include source files
    if (options.trackAll) {
      // Track all common source files for brownfield analysis
      scanOptions.patterns = [
        '**/*.md', '**/*.feature', '**/*.yaml', '**/*.yml',
        '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
        '**/*.py', '**/*.go', '**/*.rs', '**/*.java',
        '**/*.css', '**/*.scss', '**/*.less',
        '**/*.json', '**/*.toml',
        '**/*.sql', '**/*.graphql'
      ];
    }

    // Custom patterns override
    if (options.patterns) {
      scanOptions.patterns = options.patterns.split(',').map((p: string) => p.trim());
    }

    // Add include patterns
    if (options.include) {
      const includePatterns = options.include.split(',').map((p: string) => p.trim());
      scanOptions.patterns = [...(scanOptions.patterns ?? []), ...includePatterns];
    }

    // Handle ignore/exclude
    if (options.ignore) {
      scanOptions.ignore = options.ignore.split(',').map((d: string) => d.trim());
    }
    if (options.exclude) {
      const excludePatterns = options.exclude.split(',').map((d: string) => d.trim());
      scanOptions.ignore = [...(scanOptions.ignore ?? []), ...excludePatterns];
    }

    // Log shadow mode
    const isShadowMode = options.shadow || options.trackAll;
    if (isShadowMode) {
      info('Shadow mode: tracking files without modification', opts);
    }

    // Scan files
    info('Scanning files...', opts);
    const files = scanDirectory(projectRoot, scanOptions);

    // Sync to database
    const result = syncFilesToDatabase(project.id, projectRoot, files);

    // Parse comments if requested
    let commentStats = { new: 0, resolved: 0 };
    if (options.comments) {
      info('Parsing comments...', opts);
      for (const file of files) {
        if (['md', 'feature', 'yaml', 'yml'].includes(file.extension)) {
          try {
            const fullPath = join(projectRoot, file.path);
            const comments = parseComments(fullPath);

            // Get document ID
            const doc = queryOne<{ id: string }>(
              'SELECT id FROM documents WHERE project_id = ? AND path = ?',
              [project.id, file.path]
            );

            if (doc && comments.length > 0) {
              const syncResult = syncCommentsToDatabase(doc.id, comments);
              commentStats.new += syncResult.new;
              commentStats.resolved += syncResult.resolved;
            }
          } catch {
            // Skip files that can't be parsed
          }
        }
      }
    }

    // Calculate file type breakdown for shadow mode
    const fileTypeBreakdown: Record<string, number> = {};
    for (const file of files) {
      const ext = file.extension || 'other';
      fileTypeBreakdown[ext] = (fileTypeBreakdown[ext] || 0) + 1;
    }

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          shadowMode: isShadowMode,
          files: {
            total: result.total,
            new: result.new,
            modified: result.modified,
            deleted: result.deleted,
            unchanged: result.unchanged
          },
          breakdown: isShadowMode ? fileTypeBreakdown : undefined,
          comments: options.comments ? commentStats : undefined
        }
      }));
    } else {
      success(`Scan complete: ${result.total} files`, opts);
      console.log(`  New:       ${result.new}`);
      console.log(`  Modified:  ${result.modified}`);
      console.log(`  Deleted:   ${result.deleted}`);
      console.log(`  Unchanged: ${result.unchanged}`);
      if (options.comments) {
        console.log(`  Comments:  ${commentStats.new} new, ${commentStats.resolved} resolved`);
      }
      if (isShadowMode && Object.keys(fileTypeBreakdown).length > 0) {
        console.log('\n  File types:');
        for (const [ext, count] of Object.entries(fileTypeBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
          console.log(`    .${ext}: ${count}`);
        }
      }
    }
  });

// Status command - show sync status
syncCommand
  .command('status')
  .description('Show file sync status')
  .action(() => {
    const opts = getOutputOptions(syncCommand);

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

    const status = getSyncStatus(project.id);
    const comments = getCommentStats(project.id);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          files: status,
          comments
        }
      }));
    } else {
      details(
        {
          total_files: status.total,
          tracked: status.tracked,
          modified: status.modified,
          deleted: status.deleted,
          last_scan: status.lastScan ?? 'Never',
          total_comments: comments.totalComments,
          user_comments: comments.userComments,
          ai_comments: comments.aiComments,
          docs_with_comments: comments.documentsWithComments
        },
        [
          { label: 'Total Files', key: 'total_files' },
          { label: 'Tracked', key: 'tracked' },
          { label: 'Modified', key: 'modified' },
          { label: 'Deleted', key: 'deleted' },
          { label: 'Last Scan', key: 'last_scan' },
          { label: 'Total Comments', key: 'total_comments' },
          { label: 'User Comments', key: 'user_comments' },
          { label: 'AI Comments', key: 'ai_comments' },
          { label: 'Docs with Comments', key: 'docs_with_comments' }
        ],
        opts
      );
    }
  });

// List command - list tracked documents
syncCommand
  .command('list')
  .alias('ls')
  .option('-s, --status <status>', 'Filter by status (tracked/modified/deleted)')
  .option('-e, --extension <ext>', 'Filter by extension (md/feature/yaml)')
  .description('List tracked documents')
  .action((options) => {
    const opts = getOutputOptions(syncCommand);

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

    let documents = getDocuments(project.id, options.status);

    // Filter by extension if specified
    if (options.extension) {
      documents = documents.filter((d) => d.extension === options.extension);
    }

    data(
      documents,
      [
        { header: 'Path', key: 'path', width: 50 },
        { header: 'Extension', key: 'extension', width: 10 },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Size', key: 'size_bytes', width: 10 },
        { header: 'Last Scan', key: 'last_scanned_at', width: 20 }
      ],
      opts
    );
  });

// Comments command - list comments across documents
syncCommand
  .command('comments')
  .option('-t, --type <type>', 'Filter by type (user/ai)')
  .description('List all unresolved comments')
  .action((options) => {
    const opts = getOutputOptions(syncCommand);

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

    let query = `
      SELECT dc.id, dc.marker_type as type, dc.line_number, dc.content, d.path
      FROM doc_comments dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_id = ? AND dc.resolved = 0
    `;
    const params: unknown[] = [project.id];

    if (options.type) {
      query += ' AND dc.marker_type = ?';
      params.push(options.type);
    }

    query += ' ORDER BY d.path, dc.line_number';

    const { queryAll } = require('../db/connection.js');
    const comments = queryAll(query, params);

    data(
      comments,
      [
        { header: 'Path', key: 'path', width: 40 },
        { header: 'Line', key: 'line_number', width: 6 },
        { header: 'Type', key: 'type', width: 6 },
        { header: 'Content', key: 'content', width: 50 }
      ],
      opts
    );
  });
