/**
 * Bug Command
 *
 * CRUD operations for bugs.
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

export const bugCommand = new Command('bug')
  .description('Manage bugs');

// Create bug
bugCommand
  .command('create')
  .argument('<summary>', 'Bug summary')
  .option('-d, --description <description>', 'Bug description')
  .option('-p, --priority <priority>', 'Priority', 'Medium')
  .option('--severity <severity>', 'Severity (Blocker/Critical/Major/Minor/Trivial)', 'Major')
  .option('--assignee <name>', 'Assignee')
  .description('Create a new bug')
  .action((summary: string, options) => {
    const opts = getOutputOptions(bugCommand);

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

    const bugId = generateId();
    const bugKey = getNextKey(config.project.key);

    run(
      `INSERT INTO bugs (id, project_id, key, summary, description, priority, severity, assignee, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [bugId, project.id, bugKey, summary, options.description ?? null, options.priority, options.severity, options.assignee ?? null]
    );

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { key: bugKey, summary } }));
    } else {
      success(`Created bug ${bugKey}: ${summary}`, opts);
    }
  });

// List bugs
bugCommand
  .command('list')
  .alias('ls')
  .option('-s, --status <status>', 'Filter by status')
  .option('--severity <severity>', 'Filter by severity')
  .option('--assignee <name>', 'Filter by assignee')
  .description('List bugs')
  .action((options) => {
    const opts = getOutputOptions(bugCommand);

    let query = 'SELECT key, summary, status, severity, priority, assignee FROM bugs';
    const conditions: string[] = [];
    const params: unknown[] = [];

    const projectRoot = findProjectRoot();
    if (projectRoot) {
      const config = loadProjectConfig(projectRoot);
      if (config) {
        conditions.push('project_id = (SELECT id FROM projects WHERE key = ?)');
        params.push(config.project.key);
      }
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.severity) {
      conditions.push('severity = ?');
      params.push(options.severity);
    }
    if (options.assignee) {
      conditions.push('assignee = ?');
      params.push(options.assignee);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY CASE severity WHEN "Blocker" THEN 1 WHEN "Critical" THEN 2 WHEN "Major" THEN 3 WHEN "Minor" THEN 4 ELSE 5 END, created_at DESC';

    const bugs = queryAll<{
      key: string;
      summary: string;
      status: string;
      severity: string;
      priority: string;
      assignee: string | null;
    }>(query, params);

    data(
      bugs,
      [
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 35 },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Severity', key: 'severity', width: 10 },
        { header: 'Assignee', key: 'assignee', width: 15 }
      ],
      opts
    );
  });

// Show bug
bugCommand
  .command('show')
  .argument('<key>', 'Bug key')
  .description('Show bug details')
  .action((key: string) => {
    const opts = getOutputOptions(bugCommand);

    const bug = queryOne('SELECT * FROM bugs WHERE key = ?', [key]);
    if (!bug) {
      error(`Bug "${key}" not found.`, opts);
      process.exit(1);
    }

    details(
      bug as Record<string, unknown>,
      [
        { label: 'Key', key: 'key' },
        { label: 'Summary', key: 'summary' },
        { label: 'Status', key: 'status' },
        { label: 'Severity', key: 'severity' },
        { label: 'Priority', key: 'priority' },
        { label: 'Assignee', key: 'assignee' },
        { label: 'Description', key: 'description' }
      ],
      opts
    );
  });

// Transition bug
bugCommand
  .command('transition')
  .argument('<key>', 'Bug key')
  .argument('<status>', 'New status')
  .option('-r, --resolution <resolution>', 'Resolution (for resolved status)')
  .description('Transition bug to new status')
  .action((key: string, status: string, options) => {
    const opts = getOutputOptions(bugCommand);

    const bug = queryOne<{ status: string }>('SELECT status FROM bugs WHERE key = ?', [key]);
    if (!bug) {
      error(`Bug "${key}" not found.`, opts);
      process.exit(1);
    }

    // Validate transition using workflow engine
    const validation = validateTransition('bug', bug.status, status);
    if (!validation.valid) {
      const validTransitions = getValidTransitions('bug', bug.status);
      error(formatTransitionError('bug', key, bug.status, status, validTransitions), opts);
      process.exit(1);
    }

    if (status === 'resolved' && options.resolution) {
      run(`UPDATE bugs SET status = ?, resolution = ?, resolved_at = datetime('now'), updated_at = datetime('now') WHERE key = ?`, [status, options.resolution, key]);
    } else {
      run(`UPDATE bugs SET status = ?, updated_at = datetime('now') WHERE key = ?`, [status, key]);
    }

    success(`Bug "${key}" transitioned from "${bug.status}" to "${status}".`, opts);
  });

// Update bug
bugCommand
  .command('update')
  .argument('<key>', 'Bug key')
  .option('-s, --summary <summary>', 'New summary')
  .option('-d, --description <description>', 'New description')
  .option('-p, --priority <priority>', 'New priority')
  .option('--severity <severity>', 'New severity')
  .option('--assignee <assignee>', 'New assignee')
  .option('--steps <steps>', 'Steps to reproduce')
  .option('--expected <expected>', 'Expected behavior')
  .option('--actual <actual>', 'Actual behavior')
  .description('Update bug')
  .action((key: string, options) => {
    const opts = getOutputOptions(bugCommand);

    const bug = queryOne('SELECT id FROM bugs WHERE key = ?', [key]);
    if (!bug) {
      error(`Bug "${key}" not found.`, opts);
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
    if (options.severity) {
      updates.push('severity = ?');
      params.push(options.severity);
    }
    if (options.assignee) {
      updates.push('assignee = ?');
      params.push(options.assignee);
    }
    if (options.steps) {
      updates.push('steps_to_reproduce = ?');
      params.push(options.steps);
    }
    if (options.expected) {
      updates.push('expected_behavior = ?');
      params.push(options.expected);
    }
    if (options.actual) {
      updates.push('actual_behavior = ?');
      params.push(options.actual);
    }

    if (updates.length === 0) {
      error('No updates specified.', opts);
      process.exit(1);
    }

    updates.push("updated_at = datetime('now')");
    params.push(key);

    run(`UPDATE bugs SET ${updates.join(', ')} WHERE key = ?`, params);
    success(`Bug "${key}" updated.`, opts);
  });

// Delete bug
bugCommand
  .command('delete')
  .alias('rm')
  .argument('<key>', 'Bug key')
  .option('--force', 'Delete without confirmation')
  .description('Delete bug')
  .action((key: string) => {
    const opts = getOutputOptions(bugCommand);

    const bug = queryOne('SELECT id FROM bugs WHERE key = ?', [key]);
    if (!bug) {
      error(`Bug "${key}" not found.`, opts);
      process.exit(1);
    }

    run('DELETE FROM bugs WHERE key = ?', [key]);
    success(`Bug "${key}" deleted.`, opts);
  });
