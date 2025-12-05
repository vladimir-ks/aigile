/**
 * Sprint Command
 *
 * Manage sprints.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryAll, queryOne, run, generateId } from '../db/connection.js';
import {
  success,
  error,
  data,
  header,
  blank,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';

export const sprintCommand = new Command('sprint')
  .description('Manage sprints');

// Create sprint
sprintCommand
  .command('create')
  .argument('<name>', 'Sprint name')
  .requiredOption('--start <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('--end <date>', 'End date (YYYY-MM-DD)')
  .option('-g, --goal <goal>', 'Sprint goal')
  .description('Create a new sprint')
  .action((name: string, options) => {
    const opts = getOutputOptions(sprintCommand);

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

    const sprintId = generateId();

    run(
      `INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'future')`,
      [sprintId, project.id, name, options.goal ?? null, options.start, options.end]
    );

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { name, start: options.start, end: options.end } }));
    } else {
      success(`Created sprint "${name}" (${options.start} - ${options.end})`, opts);
    }
  });

// List sprints
sprintCommand
  .command('list')
  .alias('ls')
  .option('-s, --status <status>', 'Filter by status (future/active/closed)')
  .description('List sprints')
  .action((options) => {
    const opts = getOutputOptions(sprintCommand);

    let query = 'SELECT name, goal, status, start_date, end_date, velocity FROM sprints';
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

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY start_date DESC';

    const sprints = queryAll<{
      name: string;
      goal: string | null;
      status: string;
      start_date: string;
      end_date: string;
      velocity: number | null;
    }>(query, params);

    data(
      sprints,
      [
        { header: 'Name', key: 'name', width: 15 },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Start', key: 'start_date', width: 12 },
        { header: 'End', key: 'end_date', width: 12 },
        { header: 'Velocity', key: 'velocity', width: 10 },
        { header: 'Goal', key: 'goal', width: 30 }
      ],
      opts
    );
  });

// Start sprint
sprintCommand
  .command('start')
  .argument('<name>', 'Sprint name')
  .description('Start a sprint (make it active)')
  .action((name: string) => {
    const opts = getOutputOptions(sprintCommand);

    const sprint = queryOne<{ id: string; status: string }>('SELECT id, status FROM sprints WHERE name = ?', [name]);
    if (!sprint) {
      error(`Sprint "${name}" not found.`, opts);
      process.exit(1);
    }

    if (sprint.status !== 'future') {
      error(`Sprint "${name}" is not in "future" status.`, opts);
      process.exit(1);
    }

    // Check for existing active sprint
    const activeSprint = queryOne<{ name: string }>('SELECT name FROM sprints WHERE status = "active"');
    if (activeSprint) {
      error(`Sprint "${activeSprint.name}" is already active. Close it first.`, opts);
      process.exit(1);
    }

    run(`UPDATE sprints SET status = 'active', updated_at = datetime('now') WHERE name = ?`, [name]);
    success(`Sprint "${name}" started.`, opts);
  });

// Close sprint
sprintCommand
  .command('close')
  .argument('<name>', 'Sprint name')
  .description('Close a sprint')
  .action((name: string) => {
    const opts = getOutputOptions(sprintCommand);

    const sprint = queryOne<{ id: string; status: string }>('SELECT id, status FROM sprints WHERE name = ?', [name]);
    if (!sprint) {
      error(`Sprint "${name}" not found.`, opts);
      process.exit(1);
    }

    if (sprint.status !== 'active') {
      error(`Sprint "${name}" is not active.`, opts);
      process.exit(1);
    }

    // Calculate velocity
    const velocity = queryOne<{ velocity: number }>(`
      SELECT COALESCE(SUM(story_points), 0) as velocity
      FROM user_stories
      WHERE sprint_id = ? AND status = 'done'
    `, [sprint.id]);

    run(`UPDATE sprints SET status = 'closed', velocity = ?, updated_at = datetime('now') WHERE name = ?`, [velocity?.velocity ?? 0, name]);
    success(`Sprint "${name}" closed with velocity ${velocity?.velocity ?? 0}.`, opts);
  });

// Sprint board
sprintCommand
  .command('board')
  .argument('[name]', 'Sprint name (uses active sprint if not specified)')
  .description('Show sprint board')
  .action((name?: string) => {
    const opts = getOutputOptions(sprintCommand);

    let sprint;
    if (name) {
      sprint = queryOne<{ id: string; name: string; status: string }>('SELECT id, name, status FROM sprints WHERE name = ?', [name]);
    } else {
      sprint = queryOne<{ id: string; name: string; status: string }>('SELECT id, name, status FROM sprints WHERE status = "active"');
    }

    if (!sprint) {
      error(name ? `Sprint "${name}" not found.` : 'No active sprint.', opts);
      process.exit(1);
    }

    const stories = queryAll<{
      key: string;
      summary: string;
      status: string;
      story_points: number | null;
    }>(`
      SELECT key, summary, status, story_points
      FROM user_stories
      WHERE sprint_id = ?
      ORDER BY status, key
    `, [sprint.id]);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, sprint: sprint.name, data: stories }));
      return;
    }

    blank();
    header(`Sprint: ${sprint.name} (${sprint.status})`, opts);
    blank();

    if (stories.length === 0) {
      console.log('  No stories in this sprint.');
      return;
    }

    const columns = ['backlog', 'selected', 'in_progress', 'in_review', 'done'];

    for (const status of columns) {
      const statusStories = stories.filter(s => s.status === status);
      console.log(`  ${status.toUpperCase()} (${statusStories.length}):`);
      for (const story of statusStories) {
        const points = story.story_points ? ` [${story.story_points}pts]` : '';
        console.log(`    - ${story.key}: ${story.summary}${points}`);
      }
      blank();
    }
  });

// Add story to sprint
sprintCommand
  .command('add-story')
  .argument('<sprint-name>', 'Sprint name')
  .argument('<story-key>', 'Story key')
  .description('Add a story to a sprint')
  .action((sprintName: string, storyKey: string) => {
    const opts = getOutputOptions(sprintCommand);

    const sprint = queryOne<{ id: string }>('SELECT id FROM sprints WHERE name = ?', [sprintName]);
    if (!sprint) {
      error(`Sprint "${sprintName}" not found.`, opts);
      process.exit(1);
    }

    const story = queryOne<{ id: string }>('SELECT id FROM user_stories WHERE key = ?', [storyKey]);
    if (!story) {
      error(`Story "${storyKey}" not found.`, opts);
      process.exit(1);
    }

    run(`UPDATE user_stories SET sprint_id = ?, updated_at = datetime('now') WHERE key = ?`, [sprint.id, storyKey]);
    success(`Story "${storyKey}" added to sprint "${sprintName}".`, opts);
  });
