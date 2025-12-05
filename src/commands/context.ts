/**
 * Context Command
 *
 * Progressive context loading for AI agents.
 * Provides structured project context at different detail levels.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryOne } from '../db/connection.js';
import {
  success,
  error,
  info,
  details,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import {
  loadContext,
  getEntityContext,
  getResumeContext,
  ContextLevel
} from '../services/context-loader.js';

export const contextCommand = new Command('context')
  .description('Load project context for AI agents');

// Load context at specified level
contextCommand
  .command('load')
  .option('-l, --level <level>', 'Context level (minimal/summary/standard/full)', 'standard')
  .description('Load project context at specified detail level')
  .action((options) => {
    const opts = getOutputOptions(contextCommand);

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

    const validLevels: ContextLevel[] = ['minimal', 'summary', 'standard', 'full'];
    if (!validLevels.includes(options.level as ContextLevel)) {
      error(`Invalid level. Valid values: ${validLevels.join(', ')}`, opts);
      process.exit(1);
    }

    const context = loadContext(project.id, options.level as ContextLevel);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: context }));
    } else {
      // Human-readable output
      console.log(`\n=== Project Context (${context.level}) ===\n`);

      console.log(`Project: ${context.project.name} (${context.project.key})`);
      console.log(`Path: ${context.project.path}`);
      console.log(`Session: ${context.session.active ? `Active (${context.session.duration})` : 'None'}`);

      if ('counts' in context) {
        console.log('\nEntity Counts:');
        console.log(`  Initiatives: ${context.counts.initiatives}`);
        console.log(`  Epics: ${context.counts.epics}`);
        console.log(`  Stories: ${context.counts.stories}`);
        console.log(`  Tasks: ${context.counts.tasks}`);
        console.log(`  Bugs: ${context.counts.bugs}`);
        console.log(`  Documents: ${context.counts.documents}`);
        console.log(`  Comments: ${context.counts.comments}`);

        console.log('\nRecent Activity (24h):');
        console.log(`  Total: ${context.recentActivity.totalActions}`);
        console.log(`  Creates: ${context.recentActivity.creates}`);
        console.log(`  Updates: ${context.recentActivity.updates}`);
        console.log(`  Transitions: ${context.recentActivity.transitions}`);
      }

      if ('activeSprint' in context && context.activeSprint) {
        console.log('\nActive Sprint:');
        console.log(`  Name: ${context.activeSprint.name}`);
        console.log(`  Goal: ${context.activeSprint.goal ?? '-'}`);
        console.log(`  Stories: ${context.activeSprint.storiesCount}`);
        console.log(`  Tasks: ${context.activeSprint.tasksCount}`);
      }

      if ('inProgress' in context) {
        const total =
          context.inProgress.stories.length +
          context.inProgress.tasks.length +
          context.inProgress.bugs.length;
        console.log(`\nIn Progress: ${total} items`);

        if (context.inProgress.stories.length > 0) {
          console.log('  Stories:');
          for (const s of context.inProgress.stories.slice(0, 5)) {
            console.log(`    - ${s.key}: ${s.summary}`);
          }
        }

        if (context.blockers.length > 0) {
          console.log(`\nBlockers: ${context.blockers.length}`);
          for (const b of context.blockers) {
            console.log(`  - ${b.key}: ${b.summary}`);
          }
        }
      }

      if ('initiatives' in context) {
        console.log(`\nInitiatives: ${context.initiatives.length}`);
        for (const i of context.initiatives.slice(0, 5)) {
          console.log(`  - ${i.key}: ${i.summary} (${i.status})`);
        }

        console.log(`\nEpics: ${context.epics.length}`);
        for (const e of context.epics.slice(0, 5)) {
          console.log(`  - ${e.key}: ${e.summary} (${e.status})`);
        }

        if (context.pendingComments.length > 0) {
          console.log(`\nPending Comments: ${context.pendingComments.length}`);
          for (const c of context.pendingComments.slice(0, 5)) {
            console.log(`  - ${c.path}:${c.line} [${c.type}]: ${c.content.slice(0, 50)}...`);
          }
        }
      }

      console.log('');
    }
  });

// Get resume context for continuing work
contextCommand
  .command('resume')
  .description('Get context for resuming work from previous session')
  .action(() => {
    const opts = getOutputOptions(contextCommand);

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

    const resumeContext = getResumeContext(project.id);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: resumeContext }));
    } else {
      console.log('\n=== Resume Context ===\n');

      if (resumeContext.lastSession) {
        console.log('Last Session:');
        console.log(`  Ended: ${resumeContext.lastSession.endedAt}`);
        console.log(`  Summary: ${resumeContext.lastSession.summary ?? '-'}`);
        console.log(`  Entities Modified: ${resumeContext.lastSession.entitiesModified}`);
      } else {
        console.log('No previous session found.');
      }

      console.log('\nRecent Changes:');
      if (resumeContext.recentChanges.length > 0) {
        for (const change of resumeContext.recentChanges) {
          console.log(`  - ${change.action} ${change.entityType} ${change.entityKey}`);
        }
      } else {
        console.log('  None');
      }

      console.log('\nPending Work:');
      console.log(`  In Progress: ${resumeContext.pendingWork.inProgressCount}`);
      console.log(`  Blocked: ${resumeContext.pendingWork.blockedCount}`);
      console.log(`  Unresolved Comments: ${resumeContext.pendingWork.unresolvedComments}`);

      console.log('');
    }
  });

// Get entity-specific context
contextCommand
  .command('entity')
  .argument('<type>', 'Entity type (initiative/epic/story/task/bug)')
  .argument('<key>', 'Entity key')
  .description('Get detailed context for a specific entity')
  .action((type: string, key: string) => {
    const opts = getOutputOptions(contextCommand);

    const validTypes = ['initiative', 'epic', 'story', 'task', 'bug'];
    if (!validTypes.includes(type)) {
      error(`Invalid entity type. Valid values: ${validTypes.join(', ')}`, opts);
      process.exit(1);
    }

    const entity = getEntityContext(type, key);

    if (!entity) {
      error(`${type} "${key}" not found.`, opts);
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: entity }));
    } else {
      console.log(`\n=== ${type.charAt(0).toUpperCase() + type.slice(1)}: ${key} ===\n`);

      // Display common fields
      const displayFields = ['key', 'summary', 'description', 'status', 'priority', 'assignee', 'created_at', 'updated_at'];
      for (const field of displayFields) {
        if (entity[field] !== undefined && entity[field] !== null) {
          const label = field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          console.log(`${label}: ${entity[field]}`);
        }
      }

      // Display recent activity
      const activity = entity.recentActivity as Array<{ action: string; createdAt: string }>;
      if (activity && activity.length > 0) {
        console.log('\nRecent Activity:');
        for (const a of activity.slice(0, 5)) {
          console.log(`  - ${a.action} at ${a.createdAt}`);
        }
      }

      console.log('');
    }
  });

// Quick summary for AI
contextCommand
  .command('quick')
  .description('Quick context summary optimized for AI agents')
  .action(() => {
    const opts = getOutputOptions(contextCommand);

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

    // Get summary context (cast since we explicitly request 'summary' level)
    const context = loadContext(project.id, 'summary') as import('../services/context-loader.js').SummaryContext;

    // Build quick summary
    const quick = {
      project: `${context.project.name} (${context.project.key})`,
      session: context.session.active ? `Active ${context.session.duration}` : 'Inactive',
      entities: `${context.counts.initiatives}I/${context.counts.epics}E/${context.counts.stories}S/${context.counts.tasks}T/${context.counts.bugs}B`,
      docs: `${context.counts.documents} files, ${context.counts.comments} comments`,
      activity24h: `${context.recentActivity.totalActions} actions`
    };

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: quick }));
    } else {
      console.log(`Project: ${quick.project}`);
      console.log(`Session: ${quick.session}`);
      console.log(`Entities: ${quick.entities}`);
      console.log(`Documents: ${quick.docs}`);
      console.log(`Activity (24h): ${quick.activity24h}`);
    }
  });
