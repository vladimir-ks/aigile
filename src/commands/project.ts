/**
 * Project Command
 *
 * Manage registered projects.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryAll, queryOne, run } from '../db/connection.js';
import {
  success,
  error,
  data,
  details,
  blank,
  getOutputOptions
} from '../services/output-formatter.js';

export const projectCommand = new Command('project')
  .description('Manage registered projects');

// List all projects
projectCommand
  .command('list')
  .alias('ls')
  .description('List all registered projects')
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

    const formattedProjects = projects.map(p => ({
      key: p.is_default ? `${p.key} *` : p.key,
      name: p.name,
      path: p.path
    }));

    data(
      formattedProjects,
      [
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Path', key: 'path', width: 50 }
      ],
      opts
    );

    if (!opts.json) {
      blank();
      console.log('  * = default project');
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
  .option('--force', 'Remove without confirmation')
  .description('Remove project from registry (does not delete files)')
  .action((key: string, options: { force?: boolean }) => {
    const opts = getOutputOptions(projectCommand);

    const project = queryOne('SELECT id FROM projects WHERE key = ?', [key]);

    if (!project) {
      error(`Project "${key}" not found.`, opts);
      process.exit(1);
    }

    run('DELETE FROM projects WHERE key = ?', [key]);
    success(`Project "${key}" removed from registry.`, opts);
  });
