/**
 * Chunk Command
 *
 * Manages file review chunks for verified coverage tracking.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { glob } from 'glob';
import { relative, resolve } from 'path';
import { queryOne } from '../db/connection.js';
import {
  createChunk,
  getChunk,
  getSessionChunks,
  assignFilesToChunk,
  type Chunk
} from '../db/connection.js';
import {
  success,
  error,
  warning,
  data,
  details,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import { getActiveSession } from '../services/session-service.js';

/**
 * Safe JSON parse with fallback to empty array
 */
function safeParseArray(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export const chunkCommand = new Command('chunk')
  .description('Manage file review chunks for verified coverage');

// Create a new chunk
chunkCommand
  .command('create')
  .argument('<id>', 'Chunk ID (e.g., chunk-001)')
  .option('-n, --name <name>', 'Human-readable name')
  .option('-p, --pattern <patterns...>', 'Glob patterns for files')
  .option('-a, --assign <files...>', 'Explicit file assignments')
  .option('-m, --mode <mode>', 'Review mode: quick|standard|audit', 'standard')
  .description('Create a new chunk with file assignments')
  .action(async (id: string, options) => {
    const opts = getOutputOptions(chunkCommand);

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

    // Get active session
    const session = getActiveSession(project.id);
    if (!session) {
      error('No active session. Start one with "aigile session start".', opts);
      process.exit(1);
    }

    // Check if chunk already exists
    const existing = getChunk(id);
    if (existing) {
      error(`Chunk "${id}" already exists.`, opts);
      process.exit(1);
    }

    // Validate mode
    const validModes = ['quick', 'standard', 'audit'];
    if (!validModes.includes(options.mode)) {
      error(`Invalid mode "${options.mode}". Must be: ${validModes.join(', ')}`, opts);
      process.exit(1);
    }

    // Resolve assigned files from patterns and explicit assignments
    let assignedFiles: string[] = [];

    if (options.pattern) {
      for (const pattern of options.pattern) {
        const matches = await glob(pattern, { cwd: projectRoot, nodir: true });
        assignedFiles.push(...matches.map((f: string) => relative(projectRoot, resolve(projectRoot, f))));
      }
    }

    if (options.assign) {
      assignedFiles.push(...options.assign);
    }

    // Remove duplicates
    assignedFiles = [...new Set(assignedFiles)];

    const name = options.name ?? id;

    createChunk(
      session.id,
      id,
      name,
      options.pattern ?? null,
      assignedFiles.length > 0 ? assignedFiles : null,
      options.mode
    );

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          id,
          name,
          patterns: options.pattern ?? [],
          assigned_files: assignedFiles,
          review_mode: options.mode,
          session_id: session.id
        }
      }));
    } else {
      success(`Created chunk "${id}" (${name})`, opts);
      if (assignedFiles.length > 0) {
        console.log(`  Assigned files: ${assignedFiles.length}`);
      }
      if (options.pattern) {
        console.log(`  Patterns: ${options.pattern.join(', ')}`);
      }
      console.log(`  Review mode: ${options.mode}`);
    }
  });

// List files in a chunk
chunkCommand
  .command('files')
  .argument('<id>', 'Chunk ID')
  .option('--json', 'Output as JSON')
  .description('List files assigned to a chunk')
  .action((id: string) => {
    const opts = getOutputOptions(chunkCommand);

    const chunk = getChunk(id);
    if (!chunk) {
      error(`Chunk "${id}" not found.`, opts);
      process.exit(1);
    }

    const assignedFiles: string[] = safeParseArray(chunk.assigned_files);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          chunk_id: id,
          name: chunk.name,
          patterns: safeParseArray(chunk.patterns),
          files: assignedFiles,
          review_mode: chunk.review_mode
        }
      }));
    } else {
      console.log(`Chunk: ${chunk.name} (${id})`);
      console.log(`Review mode: ${chunk.review_mode}`);
      console.log(`\nAssigned files (${assignedFiles.length}):`);
      for (const file of assignedFiles) {
        console.log(`  ${file}`);
      }
    }
  });

// Assign additional files to a chunk
chunkCommand
  .command('assign')
  .argument('<id>', 'Chunk ID')
  .argument('<files...>', 'Files to assign')
  .description('Assign additional files to a chunk')
  .action((id: string, files: string[]) => {
    const opts = getOutputOptions(chunkCommand);

    const chunk = getChunk(id);
    if (!chunk) {
      error(`Chunk "${id}" not found.`, opts);
      process.exit(1);
    }

    try {
      assignFilesToChunk(id, files);

      if (opts.json) {
        const updated = getChunk(id)!;
        console.log(JSON.stringify({
          success: true,
          data: {
            chunk_id: id,
            added: files.length,
            total: safeParseArray(updated.assigned_files).length
          }
        }));
      } else {
        success(`Assigned ${files.length} file(s) to chunk "${id}"`, opts);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to assign files', opts);
      process.exit(1);
    }
  });

// List all chunks in current session
chunkCommand
  .command('list')
  .alias('ls')
  .description('List all chunks in current session')
  .action(() => {
    const opts = getOutputOptions(chunkCommand);

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

    const session = getActiveSession(project.id);
    if (!session) {
      warning('No active session.', opts);
      return;
    }

    const chunks = getSessionChunks(session.id);

    if (chunks.length === 0) {
      warning('No chunks defined in current session.', opts);
      return;
    }

    data(
      chunks.map((c: Chunk) => ({
        id: c.id,
        name: c.name,
        files: safeParseArray(c.assigned_files).length,
        mode: c.review_mode,
        created: c.created_at.split('T')[0]
      })),
      [
        { header: 'ID', key: 'id', width: 15 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Files', key: 'files', width: 8 },
        { header: 'Mode', key: 'mode', width: 10 },
        { header: 'Created', key: 'created', width: 12 }
      ],
      opts
    );
  });

// Show chunk details
chunkCommand
  .command('show')
  .argument('<id>', 'Chunk ID')
  .description('Show chunk details')
  .action((id: string) => {
    const opts = getOutputOptions(chunkCommand);

    const chunk = getChunk(id);
    if (!chunk) {
      error(`Chunk "${id}" not found.`, opts);
      process.exit(1);
    }

    const assignedFiles: string[] = safeParseArray(chunk.assigned_files);
    const patterns: string[] = safeParseArray(chunk.patterns);

    details(
      {
        id: chunk.id,
        name: chunk.name,
        review_mode: chunk.review_mode,
        patterns: patterns.length > 0 ? patterns.join(', ') : '-',
        assigned_files: assignedFiles.length,
        session_id: chunk.session_id.slice(0, 8) + '...',
        created_at: chunk.created_at
      },
      [
        { label: 'ID', key: 'id' },
        { label: 'Name', key: 'name' },
        { label: 'Review Mode', key: 'review_mode' },
        { label: 'Patterns', key: 'patterns' },
        { label: 'Assigned Files', key: 'assigned_files' },
        { label: 'Session', key: 'session_id' },
        { label: 'Created', key: 'created_at' }
      ],
      opts
    );
  });
