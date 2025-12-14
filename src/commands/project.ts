/**
 * Project Command
 *
 * Manage registered projects.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { queryAll, queryOne, run } from '../db/connection.js';
import {
  success,
  error,
  info,
  warning,
  data,
  details,
  blank,
  getOutputOptions
} from '../services/output-formatter.js';

/**
 * Check if a project path is valid (exists and has .aigile directory)
 */
function isValidProject(path: string): boolean {
  return existsSync(path) && existsSync(join(path, '.aigile'));
}

export const projectCommand = new Command('project')
  .description('Manage registered projects');

// List all projects
projectCommand
  .command('list')
  .alias('ls')
  .description('List all registered projects with validity status')
  .action(() => {
    const opts = getOutputOptions(projectCommand);

    const projects = queryAll<{
      key: string;
      name: string;
      path: string;
      is_default: number;
      created_at: string;
    }>(`
      SELECT key, name, path, is_default,
             datetime(created_at) as created_at
      FROM projects
      ORDER BY is_default DESC, name
    `);

    if (projects.length === 0) {
      if (opts.json) {
        console.log(JSON.stringify({ success: true, data: [] }));
      } else {
        console.log('No projects registered. Run "aigile init" in a git repo.');
      }
      return;
    }

    // Add validity status to each project
    const formattedProjects = projects.map(p => {
      const valid = isValidProject(p.path);
      return {
        status: valid ? '✓' : '✗',
        key: p.is_default ? `${p.key} *` : p.key,
        name: p.name,
        path: p.path,
        valid  // For JSON output
      };
    });

    const invalidCount = formattedProjects.filter(p => !p.valid).length;

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: formattedProjects.map(p => ({
          key: p.key.replace(' *', ''),
          name: p.name,
          path: p.path,
          valid: p.valid,
          is_default: p.key.includes('*')
        })),
        invalidCount
      }));
      return;
    }

    data(
      formattedProjects,
      [
        { header: '', key: 'status', width: 3 },
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Path', key: 'path', width: 50 }
      ],
      opts
    );

    blank();
    console.log('  * = default project');
    console.log('  ✓ = valid path, ✗ = missing/invalid path');

    if (invalidCount > 0) {
      blank();
      warning(`${invalidCount} project(s) have invalid paths. Run "aigile project cleanup" to remove.`, opts);
    }
  });

// Show project details
projectCommand
  .command('show')
  .argument('[key]', 'Project key (uses default if not specified)')
  .description('Show project details')
  .action((key?: string) => {
    const opts = getOutputOptions(projectCommand);

    let project;
    if (key) {
      project = queryOne('SELECT * FROM projects WHERE key = ?', [key]);
    } else {
      project = queryOne('SELECT * FROM projects WHERE is_default = 1');
    }

    if (!project) {
      error(key ? `Project "${key}" not found.` : 'No default project set.', opts);
      process.exit(1);
    }

    details(
      project as Record<string, unknown>,
      [
        { label: 'Key', key: 'key' },
        { label: 'Name', key: 'name' },
        { label: 'Path', key: 'path' },
        { label: 'Default', key: 'is_default' },
        { label: 'Created', key: 'created_at' }
      ],
      opts
    );
  });

// Set default project
projectCommand
  .command('set-default')
  .argument('<key>', 'Project key to set as default')
  .description('Set default project')
  .action((key: string) => {
    const opts = getOutputOptions(projectCommand);

    const project = queryOne('SELECT id FROM projects WHERE key = ?', [key]);

    if (!project) {
      error(`Project "${key}" not found.`, opts);
      process.exit(1);
    }

    run('UPDATE projects SET is_default = 0');
    run('UPDATE projects SET is_default = 1 WHERE key = ?', [key]);

    success(`Default project set to "${key}".`, opts);
  });

// Remove project
projectCommand
  .command('remove')
  .alias('rm')
  .argument('<key>', 'Project key to remove')
  .option('--cascade', 'Also delete all entities (epics, stories, tasks, etc.)')
  .option('--force', 'Remove without confirmation')
  .description('Remove project from registry (does not delete files)')
  .action((key: string, options: { cascade?: boolean; force?: boolean }) => {
    const opts = getOutputOptions(projectCommand);

    const project = queryOne<{ id: string; name: string; path: string }>(
      'SELECT id, name, path FROM projects WHERE key = ?',
      [key]
    );

    if (!project) {
      error(`Project "${key}" not found.`, opts);
      process.exit(1);
    }

    if (options.cascade) {
      // Delete all related entities
      const tables = [
        'documents',
        'doc_comments',
        'tasks',
        'bugs',
        'user_stories',
        'epics',
        'initiatives',
        'sprints',
        'components',
        'versions',
        'personas',
        'ux_journeys',
        'sessions',
        'activity_log',
        'key_sequences'
      ];

      for (const table of tables) {
        try {
          run(`DELETE FROM ${table} WHERE project_id = ?`, [project.id]);
        } catch {
          // Table might not have project_id or might not exist
        }
      }

      info(`Deleted all entities for project "${key}".`, opts);
    }

    run('DELETE FROM projects WHERE key = ?', [key]);
    success(`Project "${key}" removed from registry.`, opts);
  });

// Cleanup invalid projects
projectCommand
  .command('cleanup')
  .description('Remove all projects with invalid/missing paths')
  .option('--dry-run', 'Show what would be removed without removing')
  .option('--cascade', 'Also delete all entities for removed projects')
  .action((options: { dryRun?: boolean; cascade?: boolean }) => {
    const opts = getOutputOptions(projectCommand);

    const projects = queryAll<{
      id: string;
      key: string;
      name: string;
      path: string;
    }>('SELECT id, key, name, path FROM projects');

    const invalidProjects = projects.filter(p => !isValidProject(p.path));

    if (invalidProjects.length === 0) {
      success('All projects have valid paths. Nothing to clean up.', opts);
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        dryRun: options.dryRun ?? false,
        invalidProjects: invalidProjects.map(p => ({
          key: p.key,
          name: p.name,
          path: p.path
        }))
      }));

      if (options.dryRun) {
        return;
      }
    }

    if (options.dryRun) {
      info(`Would remove ${invalidProjects.length} invalid project(s):`, opts);
      for (const p of invalidProjects) {
        console.log(`  - ${p.key}: ${p.path}`);
      }
      return;
    }

    for (const project of invalidProjects) {
      if (options.cascade) {
        // Delete all related entities
        const tables = [
          'documents',
          'doc_comments',
          'tasks',
          'bugs',
          'user_stories',
          'epics',
          'initiatives',
          'sprints',
          'components',
          'versions',
          'personas',
          'ux_journeys',
          'sessions',
          'activity_log',
          'key_sequences'
        ];

        for (const table of tables) {
          try {
            run(`DELETE FROM ${table} WHERE project_id = ?`, [project.id]);
          } catch {
            // Table might not have project_id or might not exist
          }
        }
      }

      run('DELETE FROM projects WHERE id = ?', [project.id]);
      info(`Removed: ${project.key} (${project.path})`, opts);
    }

    success(`Cleaned up ${invalidProjects.length} invalid project(s).`, opts);
  });
