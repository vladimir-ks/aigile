/**
 * Epic Command
 *
 * CRUD operations for epics.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryAll, queryOne, run, generateId, getNextKey } from '../db/connection.js';
import {
  success,
  error,
  data,
  details,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import { validateTransition, getValidTransitions, formatTransitionError } from '../services/workflow-engine.js';

export const epicCommand = new Command('epic')
  .description('Manage epics');

// Create epic
epicCommand
  .command('create')
  .argument('<summary>', 'Epic summary')
  .option('-d, --description <description>', 'Epic description')
  .option('-p, --priority <priority>', 'Priority (P0/P1/P2/P3 or Highest/High/Medium/Low/Lowest)', 'Medium')
  .option('-i, --initiative <key>', 'Parent initiative key')
  .description('Create a new epic')
  .action((summary: string, options) => {
    const opts = getOutputOptions(epicCommand);

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

    const epicId = generateId();
    const epicKey = getNextKey(config.project.key);

    run(
      `INSERT INTO epics (id, project_id, key, summary, description, priority, status) VALUES (?, ?, ?, ?, ?, ?, 'backlog')`,
      [epicId, project.id, epicKey, summary, options.description ?? null, options.priority]
    );

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { key: epicKey, summary } }));
    } else {
      success(`Created epic ${epicKey}: ${summary}`, opts);
    }
  });

// List epics
epicCommand
  .command('list')
  .alias('ls')
  .option('-s, --status <status>', 'Filter by status')
  .option('-a, --all', 'Show all projects')
  .description('List epics')
  .action((options) => {
    const opts = getOutputOptions(epicCommand);

    let query = `
      SELECT e.key, e.summary, e.status, e.priority,
             (SELECT COUNT(*) FROM user_stories WHERE epic_id = e.id) as story_count
      FROM epics e
    `;
    const params: unknown[] = [];

    if (!options.all) {
      const projectRoot = findProjectRoot();
      if (projectRoot) {
        const config = loadProjectConfig(projectRoot);
        if (config) {
          query += ' JOIN projects p ON e.project_id = p.id WHERE p.key = ?';
          params.push(config.project.key);
        }
      }
    }

    if (options.status) {
      query += params.length > 0 ? ' AND' : ' WHERE';
      query += ' e.status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY e.created_at DESC';

    const epics = queryAll<{
      key: string;
      summary: string;
      status: string;
      priority: string;
      story_count: number;
    }>(query, params);

    data(
      epics,
      [
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 40 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Stories', key: 'story_count', width: 8 }
      ],
      opts
    );
  });

// Show epic details
epicCommand
  .command('show')
  .argument('<key>', 'Epic key')
  .description('Show epic details')
  .action((key: string) => {
    const opts = getOutputOptions(epicCommand);

    const epic = queryOne(`
      SELECT e.*, p.key as project_key
      FROM epics e
      JOIN projects p ON e.project_id = p.id
      WHERE e.key = ?
    `, [key]);

    if (!epic) {
      error(`Epic "${key}" not found.`, opts);
      process.exit(1);
    }

    details(
      epic as Record<string, unknown>,
      [
        { label: 'Key', key: 'key' },
        { label: 'Summary', key: 'summary' },
        { label: 'Status', key: 'status' },
        { label: 'Priority', key: 'priority' },
        { label: 'Description', key: 'description' },
        { label: 'Owner', key: 'owner' },
        { label: 'Created', key: 'created_at' }
      ],
      opts
    );
  });

// Update epic
epicCommand
  .command('update')
  .argument('<key>', 'Epic key')
  .option('-s, --summary <summary>', 'New summary')
  .option('-d, --description <description>', 'New description')
  .option('-p, --priority <priority>', 'New priority')
  .option('--owner <owner>', 'New owner')
  .description('Update epic')
  .action((key: string, options) => {
    const opts = getOutputOptions(epicCommand);

    const epic = queryOne('SELECT id FROM epics WHERE key = ?', [key]);
    if (!epic) {
      error(`Epic "${key}" not found.`, opts);
      process.exit(1);
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (options.summary) {
      updates.push('summary = ?');
      params.push(options.summary);
    }
    if (options.description) {
      updates.push('description = ?');
      params.push(options.description);
    }
    if (options.priority) {
      updates.push('priority = ?');
      params.push(options.priority);
    }
    if (options.owner) {
      updates.push('owner = ?');
      params.push(options.owner);
    }

    if (updates.length === 0) {
      error('No updates specified.', opts);
      process.exit(1);
    }

    updates.push("updated_at = datetime('now')");
    params.push(key);

    run(`UPDATE epics SET ${updates.join(', ')} WHERE key = ?`, params);
    success(`Epic "${key}" updated.`, opts);
  });

// Transition epic status
epicCommand
  .command('transition')
  .argument('<key>', 'Epic key')
  .argument('<status>', 'New status (backlog/analysis/ready/in_progress/done/closed)')
  .description('Transition epic to new status')
  .action((key: string, status: string) => {
    const opts = getOutputOptions(epicCommand);

    const epic = queryOne<{ id: string; status: string }>('SELECT id, status FROM epics WHERE key = ?', [key]);
    if (!epic) {
      error(`Epic "${key}" not found.`, opts);
      process.exit(1);
    }

    // Validate transition using workflow engine
    const validation = validateTransition('epic', epic.status, status);
    if (!validation.valid) {
      const validTransitions = getValidTransitions('epic', epic.status);
      error(formatTransitionError('epic', key, epic.status, status, validTransitions), opts);
      process.exit(1);
    }

    run(`UPDATE epics SET status = ?, updated_at = datetime('now') WHERE key = ?`, [status, key]);
    success(`Epic "${key}" transitioned from "${epic.status}" to "${status}".`, opts);
  });

// Delete epic
epicCommand
  .command('delete')
  .alias('rm')
  .argument('<key>', 'Epic key')
  .option('--force', 'Delete without confirmation')
  .description('Delete epic')
  .action((key: string) => {
    const opts = getOutputOptions(epicCommand);

    const epic = queryOne('SELECT id FROM epics WHERE key = ?', [key]);
    if (!epic) {
      error(`Epic "${key}" not found.`, opts);
      process.exit(1);
    }

    run('DELETE FROM epics WHERE key = ?', [key]);
    success(`Epic "${key}" deleted.`, opts);
  });
