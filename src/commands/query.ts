/**
 * Query Command
 *
 * Unified search and filtering across all entity types.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryOne } from '../db/connection.js';
import {
  error,
  data,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import {
  search,
  searchByKey,
  findByAssignee,
  findRecentlyUpdated,
  findByStatus,
  findRelated,
  getQueryStats,
  EntityType,
  QueryFilters
} from '../services/query-service.js';

export const queryCommand = new Command('query')
  .alias('q')
  .description('Search and filter across all entities');

// Main search command
queryCommand
  .command('search')
  .alias('s')
  .argument('[text]', 'Text to search for in summary/key')
  .option('-t, --type <type>', 'Entity type (initiative/epic/story/task/bug/all)', 'all')
  .option('-s, --status <status>', 'Filter by status (comma-separated for multiple)')
  .option('-p, --priority <priority>', 'Filter by priority (comma-separated for multiple)')
  .option('-a, --assignee <assignee>', 'Filter by assignee')
  .option('-e, --epic <key>', 'Filter by epic key')
  .option('--sprint <name>', 'Filter by sprint name')
  .option('--since <date>', 'Filter by updated since date (YYYY-MM-DD)')
  .option('-n, --limit <n>', 'Limit results', '20')
  .description('Search entities with filters')
  .action((text, options) => {
    const opts = getOutputOptions(queryCommand);

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

    const validTypes: EntityType[] = ['initiative', 'epic', 'story', 'task', 'bug', 'all'];
    if (!validTypes.includes(options.type as EntityType)) {
      error(`Invalid type. Valid values: ${validTypes.join(', ')}`, opts);
      process.exit(1);
    }

    const filters: QueryFilters = {
      text,
      status: options.status?.split(','),
      priority: options.priority?.split(','),
      assignee: options.assignee,
      epic: options.epic,
      sprint: options.sprint,
      updatedAfter: options.since,
      limit: parseInt(options.limit, 10)
    };

    const results = search(project.id, options.type as EntityType, filters);

    data(
      results.map((r) => ({
        type: r.type,
        key: r.key,
        summary: r.summary.slice(0, 50) + (r.summary.length > 50 ? '...' : ''),
        status: r.status,
        priority: r.priority,
        assignee: r.assignee ?? '-',
        parent: r.parent ?? '-'
      })),
      [
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 40 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Assignee', key: 'assignee', width: 12 },
        { header: 'Parent', key: 'parent', width: 10 }
      ],
      opts
    );
  });

// Quick key search
queryCommand
  .command('key')
  .argument('<pattern>', 'Key pattern to search for')
  .description('Quick search by key pattern')
  .action((pattern: string) => {
    const opts = getOutputOptions(queryCommand);

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

    const results = searchByKey(project.id, pattern);

    data(
      results.map((r) => ({
        type: r.type,
        key: r.key,
        summary: r.summary,
        status: r.status
      })),
      [
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 50 },
        { header: 'Status', key: 'status', width: 12 }
      ],
      opts
    );
  });

// Find by assignee
queryCommand
  .command('assignee')
  .argument('<name>', 'Assignee name')
  .description('Find items assigned to a person')
  .action((name: string) => {
    const opts = getOutputOptions(queryCommand);

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

    const results = findByAssignee(project.id, name);

    data(
      results.map((r) => ({
        type: r.type,
        key: r.key,
        summary: r.summary.slice(0, 50),
        status: r.status,
        priority: r.priority,
        assignee: r.assignee ?? '-'
      })),
      [
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 50 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Priority', key: 'priority', width: 10 },
        { header: 'Assignee', key: 'assignee', width: 12 }
      ],
      opts
    );
  });

// Find recent changes
queryCommand
  .command('recent')
  .option('-h, --hours <n>', 'Hours to look back', '24')
  .description('Find recently updated items')
  .action((options) => {
    const opts = getOutputOptions(queryCommand);

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

    const hours = parseInt(options.hours, 10);
    const results = findRecentlyUpdated(project.id, hours);

    data(
      results.map((r) => ({
        type: r.type,
        key: r.key,
        summary: r.summary.slice(0, 40),
        status: r.status,
        updated: r.updatedAt
      })),
      [
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 40 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Updated', key: 'updated', width: 20 }
      ],
      opts
    );
  });

// Find by status
queryCommand
  .command('status')
  .argument('<status>', 'Status to filter by (comma-separated for multiple)')
  .option('-t, --type <type>', 'Entity type (initiative/epic/story/task/bug/all)', 'all')
  .description('Find items by status')
  .action((status: string, options) => {
    const opts = getOutputOptions(queryCommand);

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

    const statuses = status.split(',');
    const results = findByStatus(project.id, statuses, options.type as EntityType);

    data(
      results.map((r) => ({
        type: r.type,
        key: r.key,
        summary: r.summary.slice(0, 50),
        status: r.status,
        assignee: r.assignee ?? '-'
      })),
      [
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 50 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Assignee', key: 'assignee', width: 12 }
      ],
      opts
    );
  });

// Find related items
queryCommand
  .command('related')
  .argument('<type>', 'Entity type (initiative/epic/story)')
  .argument('<key>', 'Entity key')
  .description('Find items related to an entity')
  .action((type: string, key: string) => {
    const opts = getOutputOptions(queryCommand);

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

    const validTypes = ['initiative', 'epic', 'story'];
    if (!validTypes.includes(type)) {
      error(`Invalid type. Valid values: ${validTypes.join(', ')}`, opts);
      process.exit(1);
    }

    const results = findRelated(project.id, type, key);

    data(
      results.map((r) => ({
        type: r.type,
        key: r.key,
        summary: r.summary.slice(0, 50),
        status: r.status,
        parent: r.parent ?? '-'
      })),
      [
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Summary', key: 'summary', width: 50 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Parent', key: 'parent', width: 10 }
      ],
      opts
    );
  });

// Statistics
queryCommand
  .command('stats')
  .description('Show query statistics for the project')
  .action(() => {
    const opts = getOutputOptions(queryCommand);

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

    const stats = getQueryStats(project.id);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: stats }));
    } else {
      console.log(`\nTotal Items: ${stats.total}\n`);

      console.log('By Type:');
      for (const [type, count] of Object.entries(stats.byType)) {
        console.log(`  ${type}: ${count}`);
      }

      console.log('\nBy Status:');
      for (const [status, count] of Object.entries(stats.byStatus)) {
        console.log(`  ${status}: ${count}`);
      }
      console.log('');
    }
  });
