/**
 * Session Command
 *
 * Manages AI work sessions for context continuity.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryOne } from '../db/connection.js';
import {
  success,
  error,
  info,
  data,
  details,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import {
  startSession,
  endSession,
  getActiveSession,
  listSessions,
  getSession,
  getSessionByName,
  resumeSession,
  getSessionResumeInfo
} from '../services/session-service.js';
import {
  getActivityLog,
  getActivitySummary
} from '../services/activity-logger.js';

export const sessionCommand = new Command('session')
  .description('Manage AI work sessions');

// Start a new session
sessionCommand
  .command('start')
  .argument('[name]', 'Optional session name (e.g., init-241215-1030)')
  .description('Start a new AI work session')
  .action((name?: string) => {
    const opts = getOutputOptions(sessionCommand);

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

    const session = startSession(project.id, name);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          sessionId: session.id,
          name: session.name,
          startedAt: session.startedAt
        }
      }));
    } else {
      success(`Session started: ${session.id.slice(0, 8)}...`, opts);
      if (session.name) {
        info(`Name: ${session.name}`, opts);
      }
      info(`Started at: ${session.startedAt}`, opts);
    }
  });

// End the current session
sessionCommand
  .command('end')
  .option('-s, --summary <summary>', 'Session summary')
  .description('End the current AI work session')
  .action((options) => {
    const opts = getOutputOptions(sessionCommand);

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

    const session = endSession(project.id, options.summary);

    if (!session) {
      error('No active session to end.', opts);
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          sessionId: session.id,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          entitiesModified: session.entitiesModified,
          filesModified: session.filesModified
        }
      }));
    } else {
      success(`Session ended: ${session.id.slice(0, 8)}...`, opts);
      console.log(`  Duration: ${calculateDuration(session.startedAt, session.endedAt)}`);
      console.log(`  Entities modified: ${session.entitiesModified}`);
      console.log(`  Files modified: ${session.filesModified}`);
    }
  });

// Show current session status
sessionCommand
  .command('status')
  .description('Show current session status')
  .action(() => {
    const opts = getOutputOptions(sessionCommand);

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

    const session = getActiveSession(project.id);

    if (!session) {
      if (opts.json) {
        console.log(JSON.stringify({ success: true, data: { active: false } }));
      } else {
        info('No active session.', opts);
      }
      return;
    }

    const activitySummary = getActivitySummary(project.id, session.startedAt);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          active: true,
          sessionId: session.id,
          startedAt: session.startedAt,
          duration: calculateDuration(session.startedAt, null),
          entitiesModified: session.entitiesModified,
          filesModified: session.filesModified,
          activity: activitySummary
        }
      }));
    } else {
      details(
        {
          session_id: session.id.slice(0, 8) + '...',
          started_at: session.startedAt,
          duration: calculateDuration(session.startedAt, null),
          entities_modified: session.entitiesModified,
          files_modified: session.filesModified,
          creates: activitySummary.creates,
          updates: activitySummary.updates,
          transitions: activitySummary.transitions
        },
        [
          { label: 'Session ID', key: 'session_id' },
          { label: 'Started', key: 'started_at' },
          { label: 'Duration', key: 'duration' },
          { label: 'Entities Modified', key: 'entities_modified' },
          { label: 'Files Modified', key: 'files_modified' },
          { label: 'Creates', key: 'creates' },
          { label: 'Updates', key: 'updates' },
          { label: 'Transitions', key: 'transitions' }
        ],
        opts
      );
    }
  });

// List sessions
sessionCommand
  .command('list')
  .alias('ls')
  .option('-s, --status <status>', 'Filter by status (active/completed/abandoned)')
  .option('-n, --limit <n>', 'Limit number of results', '10')
  .description('List sessions')
  .action((options) => {
    const opts = getOutputOptions(sessionCommand);

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

    const sessions = listSessions(project.id, {
      status: options.status,
      limit: parseInt(options.limit, 10)
    });

    data(
      sessions.map((s) => ({
        id: s.id.slice(0, 8) + '...',
        started: s.startedAt,
        duration: s.duration,
        status: s.status,
        entities: s.entitiesModified,
        files: s.filesModified
      })),
      [
        { header: 'ID', key: 'id', width: 12 },
        { header: 'Started', key: 'started', width: 20 },
        { header: 'Duration', key: 'duration', width: 10 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Entities', key: 'entities', width: 10 },
        { header: 'Files', key: 'files', width: 8 }
      ],
      opts
    );
  });

// Show session details with activity
sessionCommand
  .command('show')
  .argument('<id>', 'Session ID (or partial ID)')
  .description('Show session details and activity')
  .action((id: string) => {
    const opts = getOutputOptions(sessionCommand);

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

    // Try to find session by full or partial ID
    const sessions = listSessions(project.id, { limit: 100 });
    const session = sessions.find((s) => s.id.startsWith(id) || s.id === id);

    if (!session) {
      error(`Session "${id}" not found.`, opts);
      process.exit(1);
    }

    const fullSession = getSession(session.id);
    if (!fullSession) {
      error(`Session "${id}" not found.`, opts);
      process.exit(1);
    }

    const activity = getActivityLog(project.id, {
      since: fullSession.startedAt,
      limit: 20
    });

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          session: fullSession,
          activity
        }
      }));
    } else {
      details(
        {
          id: fullSession.id,
          status: fullSession.status,
          started: fullSession.startedAt,
          ended: fullSession.endedAt ?? 'Active',
          duration: calculateDuration(fullSession.startedAt, fullSession.endedAt),
          entities: fullSession.entitiesModified,
          files: fullSession.filesModified,
          summary: fullSession.summary ?? '-'
        },
        [
          { label: 'Session ID', key: 'id' },
          { label: 'Status', key: 'status' },
          { label: 'Started', key: 'started' },
          { label: 'Ended', key: 'ended' },
          { label: 'Duration', key: 'duration' },
          { label: 'Entities Modified', key: 'entities' },
          { label: 'Files Modified', key: 'files' },
          { label: 'Summary', key: 'summary' }
        ],
        opts
      );

      if (activity.length > 0) {
        console.log('\nRecent Activity:');
        data(
          activity.map((a) => ({
            time: a.createdAt.split('T')[1]?.split('.')[0] ?? a.createdAt,
            type: a.entityType,
            action: a.action,
            entity: a.entityId.slice(0, 8) + '...'
          })),
          [
            { header: 'Time', key: 'time', width: 10 },
            { header: 'Type', key: 'type', width: 12 },
            { header: 'Action', key: 'action', width: 12 },
            { header: 'Entity', key: 'entity', width: 12 }
          ],
          opts
        );
      }
    }
  });

// Activity log command
sessionCommand
  .command('activity')
  .option('-t, --type <type>', 'Filter by entity type')
  .option('-a, --action <action>', 'Filter by action (create/update/delete/transition)')
  .option('-n, --limit <n>', 'Limit number of results', '20')
  .description('Show recent activity log')
  .action((options) => {
    const opts = getOutputOptions(sessionCommand);

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

    const activity = getActivityLog(project.id, {
      entityType: options.type,
      action: options.action,
      limit: parseInt(options.limit, 10)
    });

    data(
      activity.map((a) => ({
        time: a.createdAt,
        type: a.entityType,
        action: a.action,
        entity: a.entityId.slice(0, 8) + '...',
        actor: a.actor ?? '-'
      })),
      [
        { header: 'Time', key: 'time', width: 20 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Action', key: 'action', width: 12 },
        { header: 'Entity', key: 'entity', width: 12 },
        { header: 'Actor', key: 'actor', width: 15 }
      ],
      opts
    );
  });

// Find session by name
sessionCommand
  .command('find')
  .argument('<name>', 'Session name to search for')
  .description('Find a session by name')
  .action((name: string) => {
    const opts = getOutputOptions(sessionCommand);

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

    const session = getSessionByName(project.id, name);
    if (!session) {
      error(`Session "${name}" not found.`, opts);
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          id: session.id,
          name: session.name,
          status: session.status,
          startedAt: session.startedAt,
          endedAt: session.endedAt
        }
      }));
    } else {
      success(`Found session: ${session.id.slice(0, 8)}...`, opts);
      console.log(`  Name: ${session.name}`);
      console.log(`  Status: ${session.status}`);
      console.log(`  Started: ${session.startedAt}`);
      if (session.endedAt) {
        console.log(`  Ended: ${session.endedAt}`);
      }
    }
  });

// Resume an existing session
sessionCommand
  .command('resume')
  .argument('<name-or-id>', 'Session name or ID to resume')
  .description('Resume an incomplete session')
  .action((nameOrId: string) => {
    const opts = getOutputOptions(sessionCommand);

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

    // Try to find by name first, then by ID
    let session = getSessionByName(project.id, nameOrId);
    if (!session) {
      session = getSession(nameOrId);
    }

    if (!session) {
      error(`Session "${nameOrId}" not found.`, opts);
      process.exit(1);
    }

    if (session.status === 'completed') {
      error(`Session "${nameOrId}" is already completed. Cannot resume.`, opts);
      process.exit(1);
    }

    const resumed = resumeSession(project.id, session.id);
    if (!resumed) {
      error(`Failed to resume session "${nameOrId}".`, opts);
      process.exit(1);
    }

    // Get resume info
    const resumeInfo = getSessionResumeInfo(session.id);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          id: resumed.id,
          name: resumed.name,
          status: resumed.status,
          chunks: resumeInfo.chunks.length,
          coverage: resumeInfo.coverage
        }
      }));
    } else {
      success(`Session resumed: ${resumed.id.slice(0, 8)}...`, opts);
      if (resumed.name) {
        console.log(`  Name: ${resumed.name}`);
      }
      console.log(`  Status: ${resumed.status}`);
      console.log(`  Chunks: ${resumeInfo.chunks.length}`);
      console.log(`  Coverage: ${resumeInfo.coverage.reviewed}/${resumeInfo.coverage.total} assigned files reviewed`);
      if (resumeInfo.coverage.total > 0) {
        const pct = Math.round((resumeInfo.coverage.reviewed / resumeInfo.coverage.total) * 100);
        console.log(`  Progress: ${pct}%`);
      }
    }
  });

/**
 * Calculate duration string
 */
function calculateDuration(start: string, end: string | null): string {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();

  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return '<1m';
  } else if (diffMins < 60) {
    return `${diffMins}m`;
  } else {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}
