/**
 * Story Command
 *
 * CRUD operations for user stories.
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

export const storyCommand = new Command('story')
  .description('Manage user stories');

// Create story
storyCommand
  .command('create')
  .argument('<summary>', 'Story summary')
  .option('-e, --epic <key>', 'Parent epic key')
  .option('-d, --description <description>', 'Story description')
  .option('-p, --priority <priority>', 'Priority', 'Medium')
  .option('--points <points>', 'Story points (1,2,3,5,8,13,21)')
  .description('Create a new user story')
  .action((summary: string, options) => {
    const opts = getOutputOptions(storyCommand);

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

    let epicId: string | null = null;
    if (options.epic) {
      const epic = queryOne<{ id: string }>('SELECT id FROM epics WHERE key = ?', [options.epic]);
      if (!epic) {
        error(`Epic "${options.epic}" not found.`, opts);
        process.exit(1);
      }
      epicId = epic.id;
    }

    const storyId = generateId();
    const storyKey = getNextKey(config.project.key);

    run(
      `INSERT INTO user_stories (id, project_id, key, epic_id, summary, description, priority, story_points, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'backlog')`,
      [storyId, project.id, storyKey, epicId, summary, options.description ?? null, options.priority, options.points ? parseInt(options.points) : null]
    );

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { key: storyKey, summary } }));
    } else {
      success(`Created story ${storyKey}: ${summary}`, opts);
    }
  });

// List stories
storyCommand
  .command('list')
  .alias('ls')
  .option('-e, --epic <key>', 'Filter by epic')
  .option('-s, --status <status>', 'Filter by status')
  .option('--sprint <name>', 'Filter by sprint')
  .description('List user stories')
  .action((options) => {
    const opts = getOutputOptions(storyCommand);

    let query = `
      SELECT s.key, s.summary, s.status, s.priority, s.story_points,
             e.key as epic_key
      FROM user_stories s
      LEFT JOIN epics e ON s.epic_id = e.id
    `;
    const conditions: string[] = [];
    const params: unknown[] = [];

    const projectRoot = findProjectRoot();
    if (projectRoot) {
      const config = loadProjectConfig(projectRoot);
      if (config) {
        conditions.push('s.project_id = (SELECT id FROM projects WHERE key = ?)');
        params.push(config.project.key);
      }
    }

    if (options.epic) {
      conditions.push('e.key = ?');
      params.push(options.epic);
    }
    if (options.status) {
      conditions.push('s.status = ?');
      params.push(options.status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY s.created_at DESC';

    const stories = queryAll<{
      key: string;
      summary: string;
      status: string;
      priority: string;
      story_points: number | null;
      epic_key: string | null;
    }>(query, params);

    data(
      stories,
      [
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 35 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Points', key: 'story_points', width: 8 },
        { header: 'Epic', key: 'epic_key', width: 12 }
      ],
      opts
    );
  });

// Show story details
storyCommand
  .command('show')
  .argument('<key>', 'Story key')
  .description('Show story details')
  .action((key: string) => {
    const opts = getOutputOptions(storyCommand);

    const story = queryOne('SELECT * FROM user_stories WHERE key = ?', [key]);
    if (!story) {
      error(`Story "${key}" not found.`, opts);
      process.exit(1);
    }

    details(
      story as Record<string, unknown>,
      [
        { label: 'Key', key: 'key' },
        { label: 'Summary', key: 'summary' },
        { label: 'Status', key: 'status' },
        { label: 'Priority', key: 'priority' },
        { label: 'Points', key: 'story_points' },
        { label: 'Assignee', key: 'assignee' },
        { label: 'Description', key: 'description' }
      ],
      opts
    );
  });

// Transition story
storyCommand
  .command('transition')
  .argument('<key>', 'Story key')
  .argument('<status>', 'New status')
  .description('Transition story to new status')
  .action((key: string, status: string) => {
    const opts = getOutputOptions(storyCommand);

    const story = queryOne<{ status: string }>('SELECT status FROM user_stories WHERE key = ?', [key]);
    if (!story) {
      error(`Story "${key}" not found.`, opts);
      process.exit(1);
    }

    // Validate transition using workflow engine
    const validation = validateTransition('story', story.status, status);
    if (!validation.valid) {
      const validTransitions = getValidTransitions('story', story.status);
      error(formatTransitionError('story', key, story.status, status, validTransitions), opts);
      process.exit(1);
    }

    run(`UPDATE user_stories SET status = ?, updated_at = datetime('now') WHERE key = ?`, [status, key]);
    success(`Story "${key}" transitioned from "${story.status}" to "${status}".`, opts);
  });

// Update story
storyCommand
  .command('update')
  .argument('<key>', 'Story key')
  .option('-s, --summary <summary>', 'New summary')
  .option('-d, --description <description>', 'New description')
  .option('-p, --priority <priority>', 'New priority')
  .option('--points <points>', 'New story points')
  .option('--assignee <assignee>', 'New assignee')
  .option('-e, --epic <key>', 'New parent epic')
  .description('Update story')
  .action((key: string, options) => {
    const opts = getOutputOptions(storyCommand);

    const story = queryOne('SELECT id FROM user_stories WHERE key = ?', [key]);
    if (!story) {
      error(`Story "${key}" not found.`, opts);
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
    if (options.points) {
      updates.push('story_points = ?');
      params.push(parseInt(options.points));
    }
    if (options.assignee) {
      updates.push('assignee = ?');
      params.push(options.assignee);
    }
    if (options.epic) {
      const epic = queryOne<{ id: string }>('SELECT id FROM epics WHERE key = ?', [options.epic]);
      if (!epic) {
        error(`Epic "${options.epic}" not found.`, opts);
        process.exit(1);
      }
      updates.push('epic_id = ?');
      params.push(epic.id);
    }

    if (updates.length === 0) {
      error('No updates specified.', opts);
      process.exit(1);
    }

    updates.push("updated_at = datetime('now')");
    params.push(key);

    run(`UPDATE user_stories SET ${updates.join(', ')} WHERE key = ?`, params);
    success(`Story "${key}" updated.`, opts);
  });

// Delete story
storyCommand
  .command('delete')
  .alias('rm')
  .argument('<key>', 'Story key')
  .option('--force', 'Delete without confirmation')
  .description('Delete story')
  .action((key: string) => {
    const opts = getOutputOptions(storyCommand);

    const story = queryOne('SELECT id FROM user_stories WHERE key = ?', [key]);
    if (!story) {
      error(`Story "${key}" not found.`, opts);
      process.exit(1);
    }

    run('DELETE FROM user_stories WHERE key = ?', [key]);
    success(`Story "${key}" deleted.`, opts);
  });
