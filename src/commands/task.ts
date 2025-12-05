/**
 * Task Command
 *
 * CRUD operations for tasks.
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

export const taskCommand = new Command('task')
  .description('Manage tasks');

// Create task
taskCommand
  .command('create')
  .argument('<summary>', 'Task summary')
  .option('-s, --story <key>', 'Parent story key')
  .option('--parent <key>', 'Parent task key (creates subtask)')
  .option('-d, --description <description>', 'Task description')
  .option('-p, --priority <priority>', 'Priority', 'Medium')
  .option('--assignee <name>', 'Assignee')
  .description('Create a new task (use --parent for subtask)')
  .action((summary: string, options) => {
    const opts = getOutputOptions(taskCommand);

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

    let storyId: string | null = null;
    if (options.story) {
      const story = queryOne<{ id: string }>('SELECT id FROM user_stories WHERE key = ?', [options.story]);
      if (!story) {
        error(`Story "${options.story}" not found.`, opts);
        process.exit(1);
      }
      storyId = story.id;
    }

    let parentId: string | null = null;
    let issueType = 'task';
    if (options.parent) {
      const parentTask = queryOne<{ id: string }>('SELECT id FROM tasks WHERE key = ?', [options.parent]);
      if (!parentTask) {
        error(`Parent task "${options.parent}" not found.`, opts);
        process.exit(1);
      }
      parentId = parentTask.id;
      issueType = 'subtask';
    }

    const taskId = generateId();
    const taskKey = getNextKey(config.project.key);

    run(
      `INSERT INTO tasks (id, project_id, key, story_id, parent_id, issue_type, summary, description, priority, assignee, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'todo')`,
      [taskId, project.id, taskKey, storyId, parentId, issueType, summary, options.description ?? null, options.priority, options.assignee ?? null]
    );

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { key: taskKey, summary } }));
    } else {
      success(`Created task ${taskKey}: ${summary}`, opts);
    }
  });

// List tasks
taskCommand
  .command('list')
  .alias('ls')
  .option('-s, --story <key>', 'Filter by story')
  .option('--status <status>', 'Filter by status')
  .option('--assignee <name>', 'Filter by assignee')
  .description('List tasks')
  .action((options) => {
    const opts = getOutputOptions(taskCommand);

    let query = `
      SELECT t.key, t.summary, t.status, t.priority, t.assignee,
             s.key as story_key
      FROM tasks t
      LEFT JOIN user_stories s ON t.story_id = s.id
    `;
    const conditions: string[] = [];
    const params: unknown[] = [];

    const projectRoot = findProjectRoot();
    if (projectRoot) {
      const config = loadProjectConfig(projectRoot);
      if (config) {
        conditions.push('t.project_id = (SELECT id FROM projects WHERE key = ?)');
        params.push(config.project.key);
      }
    }

    if (options.story) {
      conditions.push('s.key = ?');
      params.push(options.story);
    }
    if (options.status) {
      conditions.push('t.status = ?');
      params.push(options.status);
    }
    if (options.assignee) {
      conditions.push('t.assignee = ?');
      params.push(options.assignee);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.created_at DESC';

    const tasks = queryAll<{
      key: string;
      summary: string;
      status: string;
      priority: string;
      assignee: string | null;
      story_key: string | null;
    }>(query, params);

    data(
      tasks,
      [
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 35 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Assignee', key: 'assignee', width: 15 },
        { header: 'Story', key: 'story_key', width: 12 }
      ],
      opts
    );
  });

// Show task
taskCommand
  .command('show')
  .argument('<key>', 'Task key')
  .description('Show task details')
  .action((key: string) => {
    const opts = getOutputOptions(taskCommand);

    const task = queryOne('SELECT * FROM tasks WHERE key = ?', [key]);
    if (!task) {
      error(`Task "${key}" not found.`, opts);
      process.exit(1);
    }

    details(
      task as Record<string, unknown>,
      [
        { label: 'Key', key: 'key' },
        { label: 'Summary', key: 'summary' },
        { label: 'Status', key: 'status' },
        { label: 'Priority', key: 'priority' },
        { label: 'Assignee', key: 'assignee' },
        { label: 'Description', key: 'description' }
      ],
      opts
    );
  });

// Transition task
taskCommand
  .command('transition')
  .argument('<key>', 'Task key')
  .argument('<status>', 'New status')
  .description('Transition task to new status')
  .action((key: string, status: string) => {
    const opts = getOutputOptions(taskCommand);

    const task = queryOne<{ status: string }>('SELECT status FROM tasks WHERE key = ?', [key]);
    if (!task) {
      error(`Task "${key}" not found.`, opts);
      process.exit(1);
    }

    // Validate transition using workflow engine
    const validation = validateTransition('task', task.status, status);
    if (!validation.valid) {
      const validTransitions = getValidTransitions('task', task.status);
      error(formatTransitionError('task', key, task.status, status, validTransitions), opts);
      process.exit(1);
    }

    run(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE key = ?`, [status, key]);
    success(`Task "${key}" transitioned from "${task.status}" to "${status}".`, opts);
  });

// Update task
taskCommand
  .command('update')
  .argument('<key>', 'Task key')
  .option('-s, --summary <summary>', 'New summary')
  .option('-d, --description <description>', 'New description')
  .option('-p, --priority <priority>', 'New priority')
  .option('--assignee <assignee>', 'New assignee')
  .option('--story <key>', 'New parent story')
  .option('--blocked-reason <reason>', 'Blocked reason')
  .description('Update task')
  .action((key: string, options) => {
    const opts = getOutputOptions(taskCommand);

    const task = queryOne('SELECT id FROM tasks WHERE key = ?', [key]);
    if (!task) {
      error(`Task "${key}" not found.`, opts);
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
    if (options.assignee) {
      updates.push('assignee = ?');
      params.push(options.assignee);
    }
    if (options.story) {
      const story = queryOne<{ id: string }>('SELECT id FROM user_stories WHERE key = ?', [options.story]);
      if (!story) {
        error(`Story "${options.story}" not found.`, opts);
        process.exit(1);
      }
      updates.push('story_id = ?');
      params.push(story.id);
    }
    if (options.blockedReason) {
      updates.push('blocked_reason = ?');
      params.push(options.blockedReason);
    }

    if (updates.length === 0) {
      error('No updates specified.', opts);
      process.exit(1);
    }

    updates.push("updated_at = datetime('now')");
    params.push(key);

    run(`UPDATE tasks SET ${updates.join(', ')} WHERE key = ?`, params);
    success(`Task "${key}" updated.`, opts);
  });

// Delete task
taskCommand
  .command('delete')
  .alias('rm')
  .argument('<key>', 'Task key')
  .option('--force', 'Delete without confirmation')
  .description('Delete task')
  .action((key: string) => {
    const opts = getOutputOptions(taskCommand);

    const task = queryOne('SELECT id FROM tasks WHERE key = ?', [key]);
    if (!task) {
      error(`Task "${key}" not found.`, opts);
      process.exit(1);
    }

    run('DELETE FROM tasks WHERE key = ?', [key]);
    success(`Task "${key}" deleted.`, opts);
  });
