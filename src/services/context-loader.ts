/**
 * Context Loader Service
 *
 * Provides progressive context loading for AI agents.
 * Builds structured context packages at different detail levels.
 *
 * Levels:
 * - minimal: Project info + current session only
 * - summary: + entity counts + recent activity
 * - standard: + active sprint + in-progress items
 * - full: + all entities + documents + comments
 *
 * @author Vladimir K.S.
 */

import { queryOne, queryAll } from '../db/connection.js';
import { getActiveSession, listSessions } from './session-service.js';
import { getActivityLog, getActivitySummary } from './activity-logger.js';
import { getSyncStatus } from './file-scanner.js';
import { getCommentStats } from './comment-parser.js';

export type ContextLevel = 'minimal' | 'summary' | 'standard' | 'full';

export interface MinimalContext {
  level: 'minimal';
  project: {
    key: string;
    name: string;
    path: string;
  };
  session: {
    active: boolean;
    id?: string;
    startedAt?: string;
    duration?: string;
  };
}

export interface SummaryContext extends Omit<MinimalContext, 'level'> {
  level: 'summary';
  counts: {
    initiatives: number;
    epics: number;
    stories: number;
    tasks: number;
    bugs: number;
    documents: number;
    comments: number;
  };
  recentActivity: {
    totalActions: number;
    creates: number;
    updates: number;
    transitions: number;
  };
}

export interface StandardContext extends Omit<SummaryContext, 'level'> {
  level: 'standard';
  activeSprint: {
    name: string;
    goal: string | null;
    startDate: string;
    endDate: string;
    storiesCount: number;
    tasksCount: number;
  } | null;
  inProgress: {
    stories: Array<{ key: string; summary: string; assignee: string | null }>;
    tasks: Array<{ key: string; summary: string; assignee: string | null }>;
    bugs: Array<{ key: string; summary: string; severity: string }>;
  };
  blockers: Array<{
    key: string;
    type: string;
    summary: string;
    reason: string | null;
  }>;
}

export interface FullContext extends Omit<StandardContext, 'level'> {
  level: 'full';
  initiatives: Array<{
    key: string;
    summary: string;
    status: string;
    epicCount: number;
  }>;
  epics: Array<{
    key: string;
    summary: string;
    status: string;
    initiative: string | null;
    storyCount: number;
  }>;
  backlog: {
    stories: Array<{ key: string; summary: string; points: number | null; epic: string | null }>;
    tasks: Array<{ key: string; summary: string; story: string | null }>;
  };
  documents: {
    total: number;
    modified: number;
    withComments: number;
    recentlyChanged: Array<{ path: string; status: string }>;
  };
  pendingComments: Array<{
    path: string;
    line: number;
    type: string;
    content: string;
  }>;
}

export type Context = MinimalContext | SummaryContext | StandardContext | FullContext;

/**
 * Load context at specified level
 */
export function loadContext(projectId: string, level: ContextLevel = 'standard'): Context {
  // Get project info
  const project = queryOne<{
    key: string;
    name: string;
    path: string;
  }>('SELECT key, name, path FROM projects WHERE id = ?', [projectId]);

  if (!project) {
    throw new Error('Project not found');
  }

  // Get session info
  const session = getActiveSession(projectId);
  const sessionInfo = session
    ? {
        active: true,
        id: session.id,
        startedAt: session.startedAt,
        duration: calculateDuration(session.startedAt)
      }
    : { active: false };

  // Minimal context
  const minimal: MinimalContext = {
    level: 'minimal',
    project: {
      key: project.key,
      name: project.name,
      path: project.path
    },
    session: sessionInfo
  };

  if (level === 'minimal') {
    return minimal;
  }

  // Get entity counts
  const counts = getEntityCounts(projectId);
  const activitySummary = getActivitySummary(projectId, getLastDayTimestamp());

  // Summary context
  const summary: SummaryContext = {
    ...minimal,
    level: 'summary',
    counts,
    recentActivity: {
      totalActions: activitySummary.totalActions,
      creates: activitySummary.creates,
      updates: activitySummary.updates,
      transitions: activitySummary.transitions
    }
  };

  if (level === 'summary') {
    return summary;
  }

  // Get active sprint
  const activeSprint = getActiveSprint(projectId);

  // Get in-progress items
  const inProgress = getInProgressItems(projectId);

  // Get blockers
  const blockers = getBlockers(projectId);

  // Standard context
  const standard: StandardContext = {
    ...summary,
    level: 'standard',
    activeSprint,
    inProgress,
    blockers
  };

  if (level === 'standard') {
    return standard;
  }

  // Full context
  const initiatives = getInitiatives(projectId);
  const epics = getEpics(projectId);
  const backlog = getBacklogItems(projectId);
  const documents = getDocumentsSummary(projectId);
  const pendingComments = getPendingComments(projectId);

  const full: FullContext = {
    ...standard,
    level: 'full',
    initiatives,
    epics,
    backlog,
    documents,
    pendingComments
  };

  return full;
}

/**
 * Get entity counts
 */
function getEntityCounts(projectId: string): SummaryContext['counts'] {
  const initiatives = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM initiatives WHERE project_id = ?',
    [projectId]
  );
  const epics = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM epics WHERE project_id = ?',
    [projectId]
  );
  const stories = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM user_stories WHERE project_id = ?',
    [projectId]
  );
  const tasks = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM tasks WHERE project_id = ?',
    [projectId]
  );
  const bugs = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM bugs WHERE project_id = ?',
    [projectId]
  );

  const syncStatus = getSyncStatus(projectId);
  const commentStats = getCommentStats(projectId);

  return {
    initiatives: initiatives?.count ?? 0,
    epics: epics?.count ?? 0,
    stories: stories?.count ?? 0,
    tasks: tasks?.count ?? 0,
    bugs: bugs?.count ?? 0,
    documents: syncStatus.total,
    comments: commentStats.totalComments
  };
}

/**
 * Get active sprint info
 */
function getActiveSprint(projectId: string): StandardContext['activeSprint'] {
  const sprint = queryOne<{
    id: string;
    name: string;
    goal: string | null;
    start_date: string;
    end_date: string;
  }>(
    `SELECT id, name, goal, start_date, end_date FROM sprints
     WHERE project_id = ? AND status = 'active'
     ORDER BY start_date DESC LIMIT 1`,
    [projectId]
  );

  if (!sprint) {
    return null;
  }

  const storiesCount = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM user_stories WHERE sprint_id = ?',
    [sprint.id]
  );
  const tasksCount = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM tasks WHERE sprint_id = ?',
    [sprint.id]
  );

  return {
    name: sprint.name,
    goal: sprint.goal,
    startDate: sprint.start_date,
    endDate: sprint.end_date,
    storiesCount: storiesCount?.count ?? 0,
    tasksCount: tasksCount?.count ?? 0
  };
}

/**
 * Get in-progress items
 */
function getInProgressItems(projectId: string): StandardContext['inProgress'] {
  const stories = queryAll<{ key: string; summary: string; assignee: string | null }>(
    `SELECT key, summary, assignee FROM user_stories
     WHERE project_id = ? AND status = 'in_progress'
     ORDER BY updated_at DESC LIMIT 10`,
    [projectId]
  );

  const tasks = queryAll<{ key: string; summary: string; assignee: string | null }>(
    `SELECT key, summary, assignee FROM tasks
     WHERE project_id = ? AND status = 'in_progress'
     ORDER BY updated_at DESC LIMIT 10`,
    [projectId]
  );

  const bugs = queryAll<{ key: string; summary: string; severity: string }>(
    `SELECT key, summary, severity FROM bugs
     WHERE project_id = ? AND status = 'in_progress'
     ORDER BY updated_at DESC LIMIT 10`,
    [projectId]
  );

  return { stories, tasks, bugs };
}

/**
 * Get blocked items
 */
function getBlockers(projectId: string): StandardContext['blockers'] {
  const blockedTasks = queryAll<{
    key: string;
    summary: string;
    blocked_reason: string | null;
  }>(
    `SELECT key, summary, blocked_reason FROM tasks
     WHERE project_id = ? AND status = 'blocked'
     ORDER BY updated_at DESC`,
    [projectId]
  );

  return blockedTasks.map((t) => ({
    key: t.key,
    type: 'task',
    summary: t.summary,
    reason: t.blocked_reason
  }));
}

/**
 * Get initiatives summary
 */
function getInitiatives(projectId: string): FullContext['initiatives'] {
  return queryAll<{
    key: string;
    summary: string;
    status: string;
    epicCount: number;
  }>(
    `SELECT i.key, i.summary, i.status,
            (SELECT COUNT(*) FROM epics WHERE initiative_id = i.id) as epicCount
     FROM initiatives i
     WHERE i.project_id = ?
     ORDER BY i.created_at DESC`,
    [projectId]
  );
}

/**
 * Get epics summary
 */
function getEpics(projectId: string): FullContext['epics'] {
  return queryAll<{
    key: string;
    summary: string;
    status: string;
    initiative: string | null;
    storyCount: number;
  }>(
    `SELECT e.key, e.summary, e.status,
            i.key as initiative,
            (SELECT COUNT(*) FROM user_stories WHERE epic_id = e.id) as storyCount
     FROM epics e
     LEFT JOIN initiatives i ON e.initiative_id = i.id
     WHERE e.project_id = ?
     ORDER BY e.created_at DESC`,
    [projectId]
  );
}

/**
 * Get backlog items
 */
function getBacklogItems(projectId: string): FullContext['backlog'] {
  const stories = queryAll<{
    key: string;
    summary: string;
    points: number | null;
    epic: string | null;
  }>(
    `SELECT s.key, s.summary, s.story_points as points, e.key as epic
     FROM user_stories s
     LEFT JOIN epics e ON s.epic_id = e.id
     WHERE s.project_id = ? AND s.status = 'backlog'
     ORDER BY s.priority, s.created_at DESC
     LIMIT 20`,
    [projectId]
  );

  const tasks = queryAll<{
    key: string;
    summary: string;
    story: string | null;
  }>(
    `SELECT t.key, t.summary, s.key as story
     FROM tasks t
     LEFT JOIN user_stories s ON t.story_id = s.id
     WHERE t.project_id = ? AND t.status = 'todo'
     ORDER BY t.priority, t.created_at DESC
     LIMIT 20`,
    [projectId]
  );

  return { stories, tasks };
}

/**
 * Get documents summary
 */
function getDocumentsSummary(projectId: string): FullContext['documents'] {
  const syncStatus = getSyncStatus(projectId);
  const commentStats = getCommentStats(projectId);

  const recentlyChanged = queryAll<{ path: string; status: string }>(
    `SELECT path, status FROM documents
     WHERE project_id = ? AND status IN ('modified', 'tracked')
     ORDER BY last_scanned_at DESC LIMIT 10`,
    [projectId]
  );

  return {
    total: syncStatus.total,
    modified: syncStatus.modified,
    withComments: commentStats.documentsWithComments,
    recentlyChanged
  };
}

/**
 * Get pending comments
 */
function getPendingComments(projectId: string): FullContext['pendingComments'] {
  return queryAll<{
    path: string;
    line: number;
    type: string;
    content: string;
  }>(
    `SELECT d.path, dc.line_number as line, dc.marker_type as type, dc.content
     FROM doc_comments dc
     JOIN documents d ON dc.document_id = d.id
     WHERE d.project_id = ? AND dc.resolved = 0
     ORDER BY d.path, dc.line_number
     LIMIT 50`,
    [projectId]
  );
}

/**
 * Get specific entity context
 */
export function getEntityContext(
  entityType: string,
  entityKey: string
): Record<string, unknown> | null {
  const tableMap: Record<string, string> = {
    initiative: 'initiatives',
    epic: 'epics',
    story: 'user_stories',
    task: 'tasks',
    bug: 'bugs'
  };

  const table = tableMap[entityType];
  if (!table) {
    return null;
  }

  const entity = queryOne<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE key = ?`,
    [entityKey]
  );

  if (!entity) {
    return null;
  }

  // Get related activity
  const activity = getActivityLog(entity.project_id as string, {
    entityId: entity.id as string,
    limit: 10
  });

  return {
    ...entity,
    recentActivity: activity
  };
}

/**
 * Get resume context for continuing work
 */
export function getResumeContext(projectId: string): {
  lastSession: {
    endedAt: string;
    summary: string | null;
    entitiesModified: number;
  } | null;
  recentChanges: Array<{
    entityType: string;
    entityKey: string;
    action: string;
    timestamp: string;
  }>;
  pendingWork: {
    inProgressCount: number;
    blockedCount: number;
    unresolvedComments: number;
  };
} {
  // Get last completed session
  const sessions = listSessions(projectId, { status: 'completed', limit: 1 });
  const lastSession = sessions[0]
    ? {
        endedAt: sessions[0].endedAt ?? '',
        summary: sessions[0].summary,
        entitiesModified: sessions[0].entitiesModified
      }
    : null;

  // Get recent changes with entity keys
  const recentActivity = queryAll<{
    entity_type: string;
    entity_id: string;
    action: string;
    created_at: string;
  }>(
    `SELECT entity_type, entity_id, action, created_at
     FROM activity_log
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT 10`,
    [projectId]
  );

  // Map entity IDs to keys
  const recentChanges = recentActivity.map((a) => {
    const key = getEntityKey(a.entity_type, a.entity_id);
    return {
      entityType: a.entity_type,
      entityKey: key ?? a.entity_id.slice(0, 8),
      action: a.action,
      timestamp: a.created_at
    };
  });

  // Get pending work counts
  const inProgress = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM (
       SELECT id FROM user_stories WHERE project_id = ? AND status = 'in_progress'
       UNION ALL
       SELECT id FROM tasks WHERE project_id = ? AND status = 'in_progress'
     )`,
    [projectId, projectId]
  );

  const blocked = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status = ?',
    [projectId, 'blocked']
  );

  const commentStats = getCommentStats(projectId);

  return {
    lastSession,
    recentChanges,
    pendingWork: {
      inProgressCount: inProgress?.count ?? 0,
      blockedCount: blocked?.count ?? 0,
      unresolvedComments: commentStats.totalComments
    }
  };
}

/**
 * Get entity key from ID
 */
function getEntityKey(entityType: string, entityId: string): string | null {
  const tableMap: Record<string, string> = {
    initiative: 'initiatives',
    epic: 'epics',
    story: 'user_stories',
    task: 'tasks',
    bug: 'bugs'
  };

  const table = tableMap[entityType];
  if (!table) {
    return null;
  }

  const entity = queryOne<{ key: string }>(`SELECT key FROM ${table} WHERE id = ?`, [entityId]);
  return entity?.key ?? null;
}

/**
 * Calculate duration string
 */
function calculateDuration(start: string): string {
  const startDate = new Date(start);
  const now = new Date();
  const diffMs = now.getTime() - startDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return '<1m';
  if (diffMins < 60) return `${diffMins}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Get timestamp for 24 hours ago
 */
function getLastDayTimestamp(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString();
}
