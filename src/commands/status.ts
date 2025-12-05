/**
 * Status Command
 *
 * Display project dashboard/status overview.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryOne } from '../db/connection.js';
import {
  error,
  header,
  blank,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';

export const statusCommand = new Command('status')
  .description('Show project status dashboard')
  .action(() => {
    const opts = getOutputOptions(statusCommand);

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

    const project = queryOne<{
      id: string;
      key: string;
      name: string;
    }>('SELECT * FROM projects WHERE key = ?', [config.project.key]);

    if (!project) {
      error(`Project "${config.project.key}" not found in database.`, opts);
      process.exit(1);
    }

    // Get counts
    const epicCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM epics WHERE project_id = ?', [project.id]);
    const storyCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM user_stories WHERE project_id = ?', [project.id]);
    const taskCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?', [project.id]);
    const bugCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM bugs WHERE project_id = ?', [project.id]);

    // Get active sprint
    const activeSprint = queryOne<{ name: string; start_date: string; end_date: string }>(`
      SELECT name, start_date, end_date
      FROM sprints
      WHERE project_id = ? AND status = 'active'
    `, [project.id]);

    // Get in-progress items
    const inProgressStories = queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM user_stories
      WHERE project_id = ? AND status = 'in_progress'
    `, [project.id]);

    const blockedTasks = queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE project_id = ? AND status = 'blocked'
    `, [project.id]);

    const openBugs = queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM bugs
      WHERE project_id = ? AND status IN ('open', 'in_progress')
    `, [project.id]);

    const criticalBugs = queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM bugs
      WHERE project_id = ? AND status IN ('open', 'in_progress') AND severity IN ('Blocker', 'Critical')
    `, [project.id]);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          project: { key: project.key, name: project.name },
          counts: {
            epics: epicCount?.count ?? 0,
            stories: storyCount?.count ?? 0,
            tasks: taskCount?.count ?? 0,
            bugs: bugCount?.count ?? 0
          },
          active_sprint: activeSprint ?? null,
          status: {
            in_progress_stories: inProgressStories?.count ?? 0,
            blocked_tasks: blockedTasks?.count ?? 0,
            open_bugs: openBugs?.count ?? 0,
            critical_bugs: criticalBugs?.count ?? 0
          }
        }
      }));
      return;
    }

    // Human-readable output
    blank();
    header(`Project: ${project.name} (${project.key})`, opts);
    blank();

    // Sprint info
    if (activeSprint) {
      console.log(`  Active Sprint: ${activeSprint.name}`);
      console.log(`  Sprint Period: ${activeSprint.start_date} - ${activeSprint.end_date}`);
    } else {
      console.log('  No active sprint');
    }
    blank();

    // Entity counts
    header('Entities:', opts);
    console.log(`  Epics:   ${epicCount?.count ?? 0}`);
    console.log(`  Stories: ${storyCount?.count ?? 0}`);
    console.log(`  Tasks:   ${taskCount?.count ?? 0}`);
    console.log(`  Bugs:    ${bugCount?.count ?? 0}`);
    blank();

    // Status summary
    header('Status:', opts);
    console.log(`  Stories in progress: ${inProgressStories?.count ?? 0}`);
    console.log(`  Blocked tasks:       ${blockedTasks?.count ?? 0}`);
    console.log(`  Open bugs:           ${openBugs?.count ?? 0}`);
    if ((criticalBugs?.count ?? 0) > 0) {
      console.log(`  Critical/Blocker:    ${criticalBugs?.count ?? 0} !!!`);
    }
    blank();
  });
