/**
 * AI Command
 *
 * Commands optimized for AI agent workflows.
 * Provides structured outputs for LLM consumption.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryOne } from '../db/connection.js';
import {
  error,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import {
  getAIBriefing,
  getAIWorkItem,
  getAINextSteps,
  beginAISession,
  endAISession,
  getCompactStatus
} from '../services/ai-helper.js';
import { getResumeContext } from '../services/context-loader.js';

export const aiCommand = new Command('ai')
  .description('AI agent helper commands');

// Get briefing for starting work
aiCommand
  .command('briefing')
  .alias('b')
  .description('Get AI briefing for starting work')
  .action(() => {
    const opts = getOutputOptions(aiCommand);

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

    const briefing = getAIBriefing(project.id);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: briefing }));
    } else {
      console.log('\n=== AI Briefing ===\n');
      console.log(`Project: ${briefing.project.name} (${briefing.project.key})`);
      console.log(`Path: ${briefing.project.path}`);
      console.log(`Session: ${briefing.session.isActive ? `Active (${briefing.session.duration})` : 'No active session'}`);

      console.log('\nOverview:');
      console.log(`  Total Items: ${briefing.overview.totalItems}`);
      console.log(`  In Progress: ${briefing.overview.inProgress}`);
      console.log(`  Blocked: ${briefing.overview.blocked}`);
      console.log(`  Backlog: ${briefing.overview.backlog}`);
      console.log(`  Pending Comments: ${briefing.pendingComments}`);

      if (briefing.priorities.length > 0) {
        console.log('\nPriorities:');
        for (const p of briefing.priorities) {
          console.log(`  - [${p.type}] ${p.key}: ${p.summary}`);
          console.log(`    Reason: ${p.reason}`);
        }
      }

      console.log('');
    }
  });

// Get next steps recommendations
aiCommand
  .command('next')
  .alias('n')
  .description('Get AI recommendations for next steps')
  .action(() => {
    const opts = getOutputOptions(aiCommand);

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

    const nextSteps = getAINextSteps(project.id);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: nextSteps }));
    } else {
      console.log('\n=== Next Steps ===\n');

      if (nextSteps.recommendations.length > 0) {
        console.log('Recommendations:');
        for (const r of nextSteps.recommendations) {
          console.log(`  - ${r.action}: ${r.target}`);
          console.log(`    Reason: ${r.reason}`);
          console.log(`    Command: ${r.command}`);
        }
      } else {
        console.log('No specific recommendations.');
      }

      if (nextSteps.blockers.length > 0) {
        console.log('\nBlockers:');
        for (const b of nextSteps.blockers) {
          console.log(`  - ${b.key}: ${b.summary}`);
          if (b.reason) console.log(`    Reason: ${b.reason}`);
        }
      }

      if (nextSteps.unresolvedComments.length > 0) {
        console.log('\nUnresolved Comments:');
        for (const c of nextSteps.unresolvedComments) {
          console.log(`  - ${c.path}:${c.line} [${c.type}]`);
          console.log(`    ${c.preview}...`);
        }
      }

      console.log('');
    }
  });

// Get work item details
aiCommand
  .command('item')
  .argument('<type>', 'Entity type (epic/story/task/bug)')
  .argument('<key>', 'Entity key')
  .description('Get detailed work item for AI')
  .action((type: string, key: string) => {
    const opts = getOutputOptions(aiCommand);

    const validTypes = ['initiative', 'epic', 'story', 'task', 'bug'];
    if (!validTypes.includes(type)) {
      error(`Invalid type. Valid values: ${validTypes.join(', ')}`, opts);
      process.exit(1);
    }

    const item = getAIWorkItem(type, key);

    if (!item) {
      error(`${type} "${key}" not found.`, opts);
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: item }));
    } else {
      console.log(`\n=== ${type.charAt(0).toUpperCase() + type.slice(1)}: ${key} ===\n`);
      console.log(`Summary: ${item.summary}`);
      console.log(`Status: ${item.status}`);
      console.log(`Priority: ${item.priority}`);
      console.log(`Assignee: ${item.assignee ?? '-'}`);

      if (item.description) {
        console.log(`\nDescription:\n${item.description}`);
      }

      if (item.children.length > 0) {
        console.log('\nChildren:');
        for (const c of item.children) {
          console.log(`  - [${c.type}] ${c.key}: ${c.summary} (${c.status})`);
        }
      }

      if (item.recentActivity.length > 0) {
        console.log('\nRecent Activity:');
        for (const a of item.recentActivity) {
          console.log(`  - ${a.action} at ${a.timestamp}`);
        }
      }

      console.log('');
    }
  });

// Begin AI session
aiCommand
  .command('begin')
  .description('Begin AI work session with full context')
  .action(() => {
    const opts = getOutputOptions(aiCommand);

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

    const result = beginAISession(project.id);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: result }));
    } else {
      console.log('\n=== AI Session Started ===\n');
      console.log(`Session ID: ${result.session.id.slice(0, 8)}...`);
      console.log(`Started: ${result.session.startedAt}`);

      console.log('\n--- Briefing ---');
      console.log(`Project: ${result.briefing.project.name}`);
      console.log(`Items: ${result.briefing.overview.totalItems} total, ${result.briefing.overview.inProgress} in-progress`);

      if (result.nextSteps.recommendations.length > 0) {
        console.log('\n--- Recommended First Action ---');
        const first = result.nextSteps.recommendations[0];
        console.log(`${first.action}: ${first.target}`);
        console.log(`Command: ${first.command}`);
      }

      console.log('');
    }
  });

// End AI session
aiCommand
  .command('end')
  .option('-s, --summary <summary>', 'Session summary')
  .description('End AI work session')
  .action((options) => {
    const opts = getOutputOptions(aiCommand);

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

    const result = endAISession(project.id, options.summary);

    if (!result) {
      error('No active session to end.', opts);
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: result }));
    } else {
      console.log('\n=== AI Session Ended ===\n');
      console.log(`Session ID: ${result.session.id.slice(0, 8)}...`);
      console.log(`Duration: ${result.session.duration}`);
      console.log(`Entities Modified: ${result.session.entitiesModified}`);

      if (result.resumeContext.pendingWork.inProgressCount > 0) {
        console.log(`\nPending Work: ${result.resumeContext.pendingWork.inProgressCount} in-progress`);
      }

      console.log('');
    }
  });

// Resume context
aiCommand
  .command('resume')
  .description('Get context for resuming work')
  .action(() => {
    const opts = getOutputOptions(aiCommand);

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

    const resume = getResumeContext(project.id);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: resume }));
    } else {
      console.log('\n=== Resume Context ===\n');

      if (resume.lastSession) {
        console.log('Last Session:');
        console.log(`  Ended: ${resume.lastSession.endedAt}`);
        console.log(`  Summary: ${resume.lastSession.summary ?? '-'}`);
        console.log(`  Changes: ${resume.lastSession.entitiesModified}`);
      } else {
        console.log('No previous session found.');
      }

      if (resume.recentChanges.length > 0) {
        console.log('\nRecent Changes:');
        for (const c of resume.recentChanges.slice(0, 5)) {
          console.log(`  - ${c.action} ${c.entityType} ${c.entityKey}`);
        }
      }

      console.log('\nPending Work:');
      console.log(`  In Progress: ${resume.pendingWork.inProgressCount}`);
      console.log(`  Blocked: ${resume.pendingWork.blockedCount}`);
      console.log(`  Unresolved Comments: ${resume.pendingWork.unresolvedComments}`);

      console.log('');
    }
  });

// Compact status (one-liner)
aiCommand
  .command('status')
  .alias('s')
  .description('Get compact status line')
  .action(() => {
    const opts = getOutputOptions(aiCommand);

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

    const status = getCompactStatus(project.id);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { status } }));
    } else {
      console.log(status);
    }
  });
