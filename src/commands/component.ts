/**
 * Component Command
 *
 * Manage project components (code modules/subsystems).
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryAll, queryOne, run, generateId } from '../db/connection.js';
import {
  success,
  error,
  data,
  details,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import { logCreate, logActivity, logDelete, EntityType } from '../services/activity-logger.js';

export const componentCommand = new Command('component')
  .description('Manage project components');

// Create component
componentCommand
  .command('create')
  .argument('<name>', 'Component name')
  .option('-d, --description <description>', 'Component description')
  .option('-l, --lead <lead>', 'Component lead')
  .option('--default-assignee <assignee>', 'Default assignee for issues in this component')
  .description('Create a new component')
  .action((name: string, options) => {
    const opts = getOutputOptions(componentCommand);

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
      error(`Project "${config.project.key}" not found.`, opts);
      process.exit(1);
    }

    // Check if component already exists
    const existing = queryOne<{ id: string }>('SELECT id FROM components WHERE project_id = ? AND name = ?', [project.id, name]);
    if (existing) {
      error(`Component "${name}" already exists.`, opts);
      process.exit(1);
    }

    const componentId = generateId();

    run(
      `INSERT INTO components (id, project_id, name, description, lead, default_assignee)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [componentId, project.id, name, options.description ?? null, options.lead ?? null, options.defaultAssignee ?? null]
    );

    logCreate(project.id, 'component', componentId, { name, description: options.description });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { id: componentId, name } }));
    } else {
      success(`Created component "${name}"`, opts);
    }
  });

// List components
componentCommand
  .command('list')
  .alias('ls')
  .description('List all components')
  .action(() => {
    const opts = getOutputOptions(componentCommand);

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

    const components = queryAll<{
      name: string;
      description: string | null;
      lead: string | null;
      default_assignee: string | null;
    }>(
      `SELECT name, description, lead, default_assignee FROM components
       WHERE project_id = (SELECT id FROM projects WHERE key = ?)
       ORDER BY name`,
      [config.project.key]
    );

    data(
      components,
      [
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Lead', key: 'lead', width: 15 },
        { header: 'Default Assignee', key: 'default_assignee', width: 15 }
      ],
      opts
    );
  });

// Show component
componentCommand
  .command('show')
  .argument('<name>', 'Component name')
  .description('Show component details')
  .action((name: string) => {
    const opts = getOutputOptions(componentCommand);

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

    const component = queryOne<{
      id: string;
      name: string;
      description: string | null;
      lead: string | null;
      default_assignee: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, description, lead, default_assignee, created_at, updated_at FROM components
       WHERE project_id = (SELECT id FROM projects WHERE key = ?) AND name = ?`,
      [config.project.key, name]
    );

    if (!component) {
      error(`Component "${name}" not found.`, opts);
      process.exit(1);
    }

    // Count items in this component
    const itemCount = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM (
        SELECT id FROM epics WHERE components LIKE ?
        UNION ALL
        SELECT id FROM user_stories WHERE components LIKE ?
        UNION ALL
        SELECT id FROM tasks WHERE components LIKE ?
        UNION ALL
        SELECT id FROM bugs WHERE components LIKE ?
      )`,
      [`%${name}%`, `%${name}%`, `%${name}%`, `%${name}%`]
    );

    details(
      { ...component, items: itemCount?.count ?? 0 },
      [
        { label: 'Name', key: 'name' },
        { label: 'Description', key: 'description' },
        { label: 'Lead', key: 'lead' },
        { label: 'Default Assignee', key: 'default_assignee' },
        { label: 'Items', key: 'items' },
        { label: 'Created', key: 'created_at' },
        { label: 'Updated', key: 'updated_at' }
      ],
      opts
    );
  });

// Update component
componentCommand
  .command('update')
  .argument('<name>', 'Component name')
  .option('-d, --description <description>', 'Component description')
  .option('-l, --lead <lead>', 'Component lead')
  .option('--default-assignee <assignee>', 'Default assignee')
  .option('--rename <newName>', 'Rename component')
  .description('Update a component')
  .action((name: string, options) => {
    const opts = getOutputOptions(componentCommand);

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
      error(`Project "${config.project.key}" not found.`, opts);
      process.exit(1);
    }

    const component = queryOne<{ id: string }>('SELECT id FROM components WHERE project_id = ? AND name = ?', [project.id, name]);
    if (!component) {
      error(`Component "${name}" not found.`, opts);
      process.exit(1);
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    const changes: Record<string, unknown> = {};

    if (options.description !== undefined) {
      updates.push('description = ?');
      params.push(options.description);
      changes.description = options.description;
    }

    if (options.lead !== undefined) {
      updates.push('lead = ?');
      params.push(options.lead);
      changes.lead = options.lead;
    }

    if (options.defaultAssignee !== undefined) {
      updates.push('default_assignee = ?');
      params.push(options.defaultAssignee);
      changes.default_assignee = options.defaultAssignee;
    }

    if (options.rename) {
      // Check if new name already exists
      const existing = queryOne<{ id: string }>('SELECT id FROM components WHERE project_id = ? AND name = ?', [project.id, options.rename]);
      if (existing) {
        error(`Component "${options.rename}" already exists.`, opts);
        process.exit(1);
      }
      updates.push('name = ?');
      params.push(options.rename);
      changes.name = options.rename;
    }

    if (updates.length === 0) {
      error('No updates specified.', opts);
      process.exit(1);
    }

    updates.push("updated_at = datetime('now')");
    params.push(component.id);

    run(`UPDATE components SET ${updates.join(', ')} WHERE id = ?`, params);

    logActivity(project.id, 'component' as EntityType, component.id, 'update', { newValue: changes });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { name: options.rename ?? name, ...changes } }));
    } else {
      success(`Updated component "${name}"`, opts);
    }
  });

// Delete component
componentCommand
  .command('delete')
  .alias('rm')
  .argument('<name>', 'Component name')
  .option('-f, --force', 'Force delete without confirmation')
  .description('Delete a component')
  .action((name: string, options) => {
    const opts = getOutputOptions(componentCommand);

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
      error(`Project "${config.project.key}" not found.`, opts);
      process.exit(1);
    }

    const component = queryOne<{ id: string; name: string }>('SELECT id, name FROM components WHERE project_id = ? AND name = ?', [project.id, name]);
    if (!component) {
      error(`Component "${name}" not found.`, opts);
      process.exit(1);
    }

    run('DELETE FROM components WHERE id = ?', [component.id]);

    logDelete(project.id, 'component', component.id, { name: component.name });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { name } }));
    } else {
      success(`Deleted component "${name}"`, opts);
    }
  });
