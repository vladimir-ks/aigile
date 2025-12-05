/**
 * Version Command
 *
 * Manage project versions/releases.
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
import { logCreate, logActivity, logDelete, logTransition, EntityType } from '../services/activity-logger.js';
import { validateTransition, getValidTransitions, formatTransitionError } from '../services/workflow-engine.js';

export const versionCommand = new Command('version')
  .description('Manage project versions/releases');

// Create version
versionCommand
  .command('create')
  .argument('<name>', 'Version name (e.g., v1.0.0)')
  .option('-d, --description <description>', 'Version description')
  .option('--start <date>', 'Start date (YYYY-MM-DD)')
  .option('--release <date>', 'Release date (YYYY-MM-DD)')
  .description('Create a new version')
  .action((name: string, options) => {
    const opts = getOutputOptions(versionCommand);

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

    // Check if version already exists
    const existing = queryOne<{ id: string }>('SELECT id FROM versions WHERE project_id = ? AND name = ?', [project.id, name]);
    if (existing) {
      error(`Version "${name}" already exists.`, opts);
      process.exit(1);
    }

    const versionId = generateId();

    run(
      `INSERT INTO versions (id, project_id, name, description, status, start_date, release_date)
       VALUES (?, ?, ?, ?, 'unreleased', ?, ?)`,
      [versionId, project.id, name, options.description ?? null, options.start ?? null, options.release ?? null]
    );

    logCreate(project.id, 'version', versionId, { name, description: options.description });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { id: versionId, name, status: 'unreleased' } }));
    } else {
      success(`Created version "${name}"`, opts);
    }
  });

// List versions
versionCommand
  .command('list')
  .alias('ls')
  .option('-s, --status <status>', 'Filter by status (unreleased/released/archived)')
  .description('List all versions')
  .action((options) => {
    const opts = getOutputOptions(versionCommand);

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

    let query = `SELECT name, description, status, start_date, release_date FROM versions
                 WHERE project_id = (SELECT id FROM projects WHERE key = ?)`;
    const params: unknown[] = [config.project.key];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY release_date DESC, name';

    const versions = queryAll<{
      name: string;
      description: string | null;
      status: string;
      start_date: string | null;
      release_date: string | null;
    }>(query, params);

    data(
      versions,
      [
        { header: 'Name', key: 'name', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Start', key: 'start_date', width: 12 },
        { header: 'Release', key: 'release_date', width: 12 },
        { header: 'Description', key: 'description', width: 35 }
      ],
      opts
    );
  });

// Show version
versionCommand
  .command('show')
  .argument('<name>', 'Version name')
  .description('Show version details')
  .action((name: string) => {
    const opts = getOutputOptions(versionCommand);

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

    const version = queryOne<{
      id: string;
      name: string;
      description: string | null;
      status: string;
      start_date: string | null;
      release_date: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, description, status, start_date, release_date, created_at, updated_at FROM versions
       WHERE project_id = (SELECT id FROM projects WHERE key = ?) AND name = ?`,
      [config.project.key, name]
    );

    if (!version) {
      error(`Version "${name}" not found.`, opts);
      process.exit(1);
    }

    // Count fix versions
    const fixCount = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM (
        SELECT id FROM epics WHERE fix_versions LIKE ?
        UNION ALL
        SELECT id FROM user_stories WHERE fix_versions LIKE ?
        UNION ALL
        SELECT id FROM bugs WHERE fix_versions LIKE ?
      )`,
      [`%${name}%`, `%${name}%`, `%${name}%`]
    );

    details(
      { ...version, fix_items: fixCount?.count ?? 0 },
      [
        { label: 'Name', key: 'name' },
        { label: 'Status', key: 'status' },
        { label: 'Description', key: 'description' },
        { label: 'Start Date', key: 'start_date' },
        { label: 'Release Date', key: 'release_date' },
        { label: 'Fix Items', key: 'fix_items' },
        { label: 'Created', key: 'created_at' },
        { label: 'Updated', key: 'updated_at' }
      ],
      opts
    );
  });

// Update version
versionCommand
  .command('update')
  .argument('<name>', 'Version name')
  .option('-d, --description <description>', 'Version description')
  .option('--start <date>', 'Start date (YYYY-MM-DD)')
  .option('--release <date>', 'Release date (YYYY-MM-DD)')
  .option('--rename <newName>', 'Rename version')
  .description('Update a version')
  .action((name: string, options) => {
    const opts = getOutputOptions(versionCommand);

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

    const version = queryOne<{ id: string }>('SELECT id FROM versions WHERE project_id = ? AND name = ?', [project.id, name]);
    if (!version) {
      error(`Version "${name}" not found.`, opts);
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

    if (options.start !== undefined) {
      updates.push('start_date = ?');
      params.push(options.start);
      changes.start_date = options.start;
    }

    if (options.release !== undefined) {
      updates.push('release_date = ?');
      params.push(options.release);
      changes.release_date = options.release;
    }

    if (options.rename) {
      // Check if new name already exists
      const existing = queryOne<{ id: string }>('SELECT id FROM versions WHERE project_id = ? AND name = ?', [project.id, options.rename]);
      if (existing) {
        error(`Version "${options.rename}" already exists.`, opts);
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
    params.push(version.id);

    run(`UPDATE versions SET ${updates.join(', ')} WHERE id = ?`, params);

    logActivity(project.id, 'version' as EntityType, version.id, 'update', { newValue: changes });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { name: options.rename ?? name, ...changes } }));
    } else {
      success(`Updated version "${name}"`, opts);
    }
  });

// Transition version status
versionCommand
  .command('transition')
  .argument('<name>', 'Version name')
  .argument('<status>', 'New status (unreleased/released/archived)')
  .description('Transition version status')
  .action((name: string, newStatus: string) => {
    const opts = getOutputOptions(versionCommand);

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

    const version = queryOne<{ id: string; status: string }>('SELECT id, status FROM versions WHERE project_id = ? AND name = ?', [project.id, name]);
    if (!version) {
      error(`Version "${name}" not found.`, opts);
      process.exit(1);
    }

    // Validate transition using workflow engine
    const validation = validateTransition('version', version.status, newStatus);
    if (!validation.valid) {
      const validTransitions = getValidTransitions('version', version.status);
      error(formatTransitionError('version', name, version.status, newStatus, validTransitions), opts);
      process.exit(1);
    }

    // If releasing, set release_date to today if not set
    let additionalUpdate = '';
    if (newStatus === 'released') {
      additionalUpdate = ", release_date = COALESCE(release_date, date('now'))";
    }

    run(`UPDATE versions SET status = ?, updated_at = datetime('now')${additionalUpdate} WHERE id = ?`, [newStatus, version.id]);

    logTransition(project.id, 'version', version.id, version.status, newStatus);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { name, oldStatus: version.status, newStatus } }));
    } else {
      success(`Version "${name}" transitioned from "${version.status}" to "${newStatus}"`, opts);
    }
  });

// Delete version
versionCommand
  .command('delete')
  .alias('rm')
  .argument('<name>', 'Version name')
  .option('-f, --force', 'Force delete without confirmation')
  .description('Delete a version')
  .action((name: string, options) => {
    const opts = getOutputOptions(versionCommand);

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

    const version = queryOne<{ id: string; name: string }>('SELECT id, name FROM versions WHERE project_id = ? AND name = ?', [project.id, name]);
    if (!version) {
      error(`Version "${name}" not found.`, opts);
      process.exit(1);
    }

    run('DELETE FROM versions WHERE id = ?', [version.id]);

    logDelete(project.id, 'version', version.id, { name: version.name });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { name } }));
    } else {
      success(`Deleted version "${name}"`, opts);
    }
  });
