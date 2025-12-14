/**
 * Initiative Command
 *
 * CRUD operations for initiatives (portfolio-level objectives).
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
import { validateAndStandardizeDate, isEndDateValid, DATE_FORMAT } from '../utils/date.js';

export const initiativeCommand = new Command('initiative')
  .description('Manage initiatives (portfolio-level objectives)');

// Create initiative
initiativeCommand
  .command('create')
  .argument('<summary>', 'Initiative summary')
  .option('-d, --description <description>', 'Initiative description')
  .option('-p, --priority <priority>', 'Priority (Highest/High/Medium/Low/Lowest)', 'Medium')
  .option('--owner <owner>', 'Owner')
  .option('--start <date>', `Start date (${DATE_FORMAT})`)
  .option('--target <date>', `Target date (${DATE_FORMAT})`)
  .description('Create a new initiative')
  .action((summary: string, options) => {
    const opts = getOutputOptions(initiativeCommand);

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

    // Validate and standardize dates if provided
    let startDate: string | null = null;
    let targetDate: string | null = null;
    try {
      if (options.start) {
        startDate = validateAndStandardizeDate(options.start, 'start date');
      }
      if (options.target) {
        targetDate = validateAndStandardizeDate(options.target, 'target date');
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err), opts);
      process.exit(1);
    }

    // Validate target date is after start date if both provided
    if (startDate && targetDate && !isEndDateValid(startDate, targetDate)) {
      error(`Target date (${targetDate}) must be after start date (${startDate}).`, opts);
      process.exit(1);
    }

    const initiativeId = generateId();
    const initiativeKey = getNextKey(config.project.key);

    run(
      `INSERT INTO initiatives (id, project_id, key, summary, description, priority, owner, start_date, target_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      [
        initiativeId,
        project.id,
        initiativeKey,
        summary,
        options.description ?? null,
        options.priority,
        options.owner ?? null,
        startDate,
        targetDate
      ]
    );

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { key: initiativeKey, summary } }));
    } else {
      success(`Created initiative ${initiativeKey}: ${summary}`, opts);
    }
  });

// List initiatives
initiativeCommand
  .command('list')
  .alias('ls')
  .option('-s, --status <status>', 'Filter by status (draft/active/done/archived)')
  .option('-a, --all', 'Show all projects')
  .description('List initiatives')
  .action((options) => {
    const opts = getOutputOptions(initiativeCommand);

    let query = `
      SELECT i.key, i.summary, i.status, i.priority, i.owner,
             (SELECT COUNT(*) FROM epics WHERE initiative_id = i.id) as epic_count
      FROM initiatives i
    `;
    const params: unknown[] = [];

    if (!options.all) {
      const projectRoot = findProjectRoot();
      if (projectRoot) {
        const config = loadProjectConfig(projectRoot);
        if (config) {
          query += ' JOIN projects p ON i.project_id = p.id WHERE p.key = ?';
          params.push(config.project.key);
        }
      }
    }

    if (options.status) {
      query += params.length > 0 ? ' AND' : ' WHERE';
      query += ' i.status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY i.created_at DESC';

    const initiatives = queryAll<{
      key: string;
      summary: string;
      status: string;
      priority: string;
      owner: string | null;
      epic_count: number;
    }>(query, params);

    data(
      initiatives,
      [
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 40 },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Owner', key: 'owner', width: 15 },
        { header: 'Epics', key: 'epic_count', width: 8 }
      ],
      opts
    );
  });

// Show initiative details
initiativeCommand
  .command('show')
  .argument('<key>', 'Initiative key')
  .description('Show initiative details')
  .action((key: string) => {
    const opts = getOutputOptions(initiativeCommand);

    const initiative = queryOne(`
      SELECT i.*, p.key as project_key
      FROM initiatives i
      JOIN projects p ON i.project_id = p.id
      WHERE i.key = ?
    `, [key]);

    if (!initiative) {
      error(`Initiative "${key}" not found.`, opts);
      process.exit(1);
    }

    details(
      initiative as Record<string, unknown>,
      [
        { label: 'Key', key: 'key' },
        { label: 'Summary', key: 'summary' },
        { label: 'Status', key: 'status' },
        { label: 'Priority', key: 'priority' },
        { label: 'Owner', key: 'owner' },
        { label: 'Start Date', key: 'start_date' },
        { label: 'Target Date', key: 'target_date' },
        { label: 'Description', key: 'description' },
        { label: 'Created', key: 'created_at' }
      ],
      opts
    );
  });

// Update initiative
initiativeCommand
  .command('update')
  .argument('<key>', 'Initiative key')
  .option('-s, --summary <summary>', 'New summary')
  .option('-d, --description <description>', 'New description')
  .option('-p, --priority <priority>', 'New priority')
  .option('--owner <owner>', 'New owner')
  .option('--start <date>', `New start date (${DATE_FORMAT})`)
  .option('--target <date>', `New target date (${DATE_FORMAT})`)
  .description('Update initiative')
  .action((key: string, options) => {
    const opts = getOutputOptions(initiativeCommand);

    const initiative = queryOne<{ id: string; start_date: string | null; target_date: string | null }>(
      'SELECT id, start_date, target_date FROM initiatives WHERE key = ?',
      [key]
    );
    if (!initiative) {
      error(`Initiative "${key}" not found.`, opts);
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

    // Validate and standardize dates if provided
    let startDate: string | null = null;
    let targetDate: string | null = null;
    try {
      if (options.start) {
        startDate = validateAndStandardizeDate(options.start, 'start date');
        updates.push('start_date = ?');
        params.push(startDate);
      }
      if (options.target) {
        targetDate = validateAndStandardizeDate(options.target, 'target date');
        updates.push('target_date = ?');
        params.push(targetDate);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : String(err), opts);
      process.exit(1);
    }

    // Validate date order if both are being set or one is being updated
    const effectiveStart = startDate ?? initiative.start_date;
    const effectiveTarget = targetDate ?? initiative.target_date;
    if (effectiveStart && effectiveTarget && !isEndDateValid(effectiveStart, effectiveTarget)) {
      error(`Target date (${effectiveTarget}) must be after start date (${effectiveStart}).`, opts);
      process.exit(1);
    }

    if (updates.length === 0) {
      error('No updates specified.', opts);
      process.exit(1);
    }

    updates.push("updated_at = datetime('now')");
    params.push(key);

    run(`UPDATE initiatives SET ${updates.join(', ')} WHERE key = ?`, params);
    success(`Initiative "${key}" updated.`, opts);
  });

// Transition initiative status
initiativeCommand
  .command('transition')
  .argument('<key>', 'Initiative key')
  .argument('<status>', 'New status (draft/active/done/archived)')
  .description('Transition initiative to new status')
  .action((key: string, status: string) => {
    const opts = getOutputOptions(initiativeCommand);

    const initiative = queryOne<{ id: string; status: string }>('SELECT id, status FROM initiatives WHERE key = ?', [key]);
    if (!initiative) {
      error(`Initiative "${key}" not found.`, opts);
      process.exit(1);
    }

    // Validate transition using workflow engine
    const validation = validateTransition('initiative', initiative.status, status);
    if (!validation.valid) {
      const validTransitions = getValidTransitions('initiative', initiative.status);
      error(formatTransitionError('initiative', key, initiative.status, status, validTransitions), opts);
      process.exit(1);
    }

    run(`UPDATE initiatives SET status = ?, updated_at = datetime('now') WHERE key = ?`, [status, key]);
    success(`Initiative "${key}" transitioned from "${initiative.status}" to "${status}".`, opts);
  });

// Delete initiative
initiativeCommand
  .command('delete')
  .alias('rm')
  .argument('<key>', 'Initiative key')
  .option('--force', 'Delete without confirmation')
  .description('Delete initiative')
  .action((key: string) => {
    const opts = getOutputOptions(initiativeCommand);

    const initiative = queryOne('SELECT id FROM initiatives WHERE key = ?', [key]);
    if (!initiative) {
      error(`Initiative "${key}" not found.`, opts);
      process.exit(1);
    }

    run('DELETE FROM initiatives WHERE key = ?', [key]);
    success(`Initiative "${key}" deleted.`, opts);
  });
