/**
 * AI Helper Service
 *
 * Convenience functions for AI agent workflows.
 * Provides structured outputs optimized for LLM consumption.
 *
 * @author Vladimir K.S.
 */

import { queryOne, queryAll } from '../db/connection.js';
import { loadContext, getResumeContext, getEntityContext } from './context-loader.js';
import { startSession, endSession, getActiveSession } from './session-service.js';
import { logActivity } from './activity-logger.js';
import { search, findByStatus } from './query-service.js';
import { getSyncStatus } from './file-scanner.js';
import { getCommentStats } from './comment-parser.js';

export interface AIBriefing {
  project: {
    key: string;
    name: string;
    path: string;
  };
  session: {
    isActive: boolean;
    id?: string;
    duration?: string;
  };
  overview: {
    totalItems: number;
    inProgress: number;
    blocked: number;
    backlog: number;
  };
  priorities: Array<{
    type: string;
    key: string;
    summary: string;
    reason: string;
  }>;
  pendingComments: number;
  lastUpdated: string;
}

export interface AIWorkItem {
  type: string;
  key: string;
  summary: string;
  description: string | null;
  status: string;
  priority: string;
  assignee: string | null;
  parent: string | null;
  children: Array<{ type: string; key: string; summary: string; status: string }>;
  recentActivity: Array<{ action: string; timestamp: string }>;
}

export interface AINextSteps {
  recommendations: Array<{
    action: string;
    target: string;
    reason: string;
    command: string;
  }>;
  blockers: Array<{
    key: string;
    summary: string;
    reason: string | null;
  }>;
  unresolvedComments: Array<{
    path: string;
    line: number;
    type: string;
    preview: string;
  }>;
}

/**
 * Get AI briefing for starting work
 */
export function getAIBriefing(projectId: string): AIBriefing {
  const project = queryOne<{ key: string; name: string; path: string }>(
    'SELECT key, name, path FROM projects WHERE id = ?',
    [projectId]
  );

  if (!project) {
    throw new Error('Project not found');
  }

  const session = getActiveSession(projectId);

  // Get counts
  const inProgress = queryAll(
    `SELECT id FROM user_stories WHERE project_id = ? AND status = 'in_progress'
     UNION ALL
     SELECT id FROM tasks WHERE project_id = ? AND status = 'in_progress'`,
    [projectId, projectId]
  ).length;

  const blocked = queryAll(
    `SELECT id FROM tasks WHERE project_id = ? AND status = 'blocked'`,
    [projectId]
  ).length;

  const backlog = queryAll(
    `SELECT id FROM user_stories WHERE project_id = ? AND status = 'backlog'
     UNION ALL
     SELECT id FROM tasks WHERE project_id = ? AND status = 'todo'`,
    [projectId, projectId]
  ).length;

  const total = queryAll(
    `SELECT id FROM initiatives WHERE project_id = ?
     UNION ALL SELECT id FROM epics WHERE project_id = ?
     UNION ALL SELECT id FROM user_stories WHERE project_id = ?
     UNION ALL SELECT id FROM tasks WHERE project_id = ?
     UNION ALL SELECT id FROM bugs WHERE project_id = ?`,
    [projectId, projectId, projectId, projectId, projectId]
  ).length;

  // Get priorities
  const priorities: AIBriefing['priorities'] = [];

  // Critical bugs first
  const criticalBugs = queryAll<{ key: string; summary: string }>(
    `SELECT key, summary FROM bugs WHERE project_id = ? AND severity = 'Critical' AND status != 'closed' LIMIT 3`,
    [projectId]
  );
  for (const bug of criticalBugs) {
    priorities.push({
      type: 'bug',
      key: bug.key,
      summary: bug.summary,
      reason: 'Critical severity bug'
    });
  }

  // Blocked items
  const blockedItems = queryAll<{ key: string; summary: string }>(
    `SELECT key, summary FROM tasks WHERE project_id = ? AND status = 'blocked' LIMIT 2`,
    [projectId]
  );
  for (const item of blockedItems) {
    priorities.push({
      type: 'task',
      key: item.key,
      summary: item.summary,
      reason: 'Blocked - needs attention'
    });
  }

  // High priority in-progress
  const highPriority = queryAll<{ key: string; summary: string }>(
    `SELECT key, summary FROM user_stories WHERE project_id = ? AND status = 'in_progress' AND priority IN ('Highest', 'High') LIMIT 2`,
    [projectId]
  );
  for (const item of highPriority) {
    priorities.push({
      type: 'story',
      key: item.key,
      summary: item.summary,
      reason: 'High priority in progress'
    });
  }

  const commentStats = getCommentStats(projectId);

  return {
    project: {
      key: project.key,
      name: project.name,
      path: project.path
    },
    session: session
      ? { isActive: true, id: session.id, duration: calculateDuration(session.startedAt) }
      : { isActive: false },
    overview: {
      totalItems: total,
      inProgress,
      blocked,
      backlog
    },
    priorities,
    pendingComments: commentStats.totalComments,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Get detailed work item for AI
 */
export function getAIWorkItem(entityType: string, entityKey: string): AIWorkItem | null {
  const context = getEntityContext(entityType, entityKey);
  if (!context) {
    return null;
  }

  // Get children based on entity type
  const children: AIWorkItem['children'] = [];

  if (entityType === 'epic') {
    const stories = queryAll<{ key: string; summary: string; status: string }>(
      `SELECT s.key, s.summary, s.status FROM user_stories s
       JOIN epics e ON s.epic_id = e.id
       WHERE e.key = ?`,
      [entityKey]
    );
    for (const s of stories) {
      children.push({ type: 'story', ...s });
    }
  }

  if (entityType === 'story') {
    const tasks = queryAll<{ key: string; summary: string; status: string }>(
      `SELECT t.key, t.summary, t.status FROM tasks t
       JOIN user_stories s ON t.story_id = s.id
       WHERE s.key = ?`,
      [entityKey]
    );
    for (const t of tasks) {
      children.push({ type: 'task', ...t });
    }
  }

  const activity = (context.recentActivity as Array<{ action: string; createdAt: string }>) ?? [];

  return {
    type: entityType,
    key: context.key as string,
    summary: context.summary as string,
    description: (context.description as string) ?? null,
    status: context.status as string,
    priority: context.priority as string,
    assignee: (context.assignee as string) ?? null,
    parent: null, // Could be enhanced to include parent
    children,
    recentActivity: activity.slice(0, 5).map((a) => ({
      action: a.action,
      timestamp: a.createdAt
    }))
  };
}

/**
 * Get AI recommendations for next steps
 */
export function getAINextSteps(projectId: string): AINextSteps {
  const recommendations: AINextSteps['recommendations'] = [];

  // Check for session
  const session = getActiveSession(projectId);
  if (!session) {
    recommendations.push({
      action: 'Start a session',
      target: 'session',
      reason: 'No active session - start one to track your work',
      command: 'aigile session start'
    });
  }

  // Check for in-progress items
  const inProgress = findByStatus(projectId, 'in_progress', 'all');
  if (inProgress.length > 0) {
    const item = inProgress[0];
    recommendations.push({
      action: 'Continue work',
      target: item.key,
      reason: `${item.type} is in progress`,
      command: `aigile ${item.type} show ${item.key}`
    });
  }

  // Check for critical bugs
  const criticalBugs = queryAll<{ key: string; summary: string }>(
    `SELECT key, summary FROM bugs WHERE project_id = ? AND severity = 'Critical' AND status = 'open' LIMIT 1`,
    [projectId]
  );
  if (criticalBugs.length > 0) {
    recommendations.push({
      action: 'Fix critical bug',
      target: criticalBugs[0].key,
      reason: 'Critical severity needs immediate attention',
      command: `aigile bug show ${criticalBugs[0].key}`
    });
  }

  // Check for backlog items to start
  if (inProgress.length === 0) {
    const backlog = findByStatus(projectId, 'backlog', 'story');
    if (backlog.length > 0) {
      recommendations.push({
        action: 'Start next story',
        target: backlog[0].key,
        reason: 'No work in progress - pick up next story',
        command: `aigile story transition ${backlog[0].key} in_progress`
      });
    }
  }

  // Check sync status
  const syncStatus = getSyncStatus(projectId);
  if (syncStatus.modified > 0) {
    recommendations.push({
      action: 'Sync files',
      target: 'documents',
      reason: `${syncStatus.modified} files have been modified`,
      command: 'aigile sync scan --comments'
    });
  }

  // Get blockers
  const blockers = queryAll<{ key: string; summary: string; blocked_reason: string | null }>(
    `SELECT key, summary, blocked_reason FROM tasks WHERE project_id = ? AND status = 'blocked'`,
    [projectId]
  );

  // Get unresolved comments
  const comments = queryAll<{ path: string; line_number: number; marker_type: string; content: string }>(
    `SELECT d.path, dc.line_number, dc.marker_type, dc.content
     FROM doc_comments dc
     JOIN documents d ON dc.document_id = d.id
     WHERE d.project_id = ? AND dc.resolved = 0
     ORDER BY dc.marker_type DESC
     LIMIT 5`,
    [projectId]
  );

  return {
    recommendations,
    blockers: blockers.map((b) => ({
      key: b.key,
      summary: b.summary,
      reason: b.blocked_reason
    })),
    unresolvedComments: comments.map((c) => ({
      path: c.path,
      line: c.line_number,
      type: c.marker_type,
      preview: c.content.slice(0, 100)
    }))
  };
}

/**
 * Begin AI work session
 */
export function beginAISession(projectId: string): {
  session: { id: string; startedAt: string };
  briefing: AIBriefing;
  nextSteps: AINextSteps;
} {
  const session = startSession(projectId);
  const briefing = getAIBriefing(projectId);
  const nextSteps = getAINextSteps(projectId);

  return {
    session: { id: session.id, startedAt: session.startedAt },
    briefing,
    nextSteps
  };
}

/**
 * End AI work session with summary
 */
export function endAISession(
  projectId: string,
  summary?: string
): {
  session: { id: string; duration: string; entitiesModified: number };
  resumeContext: ReturnType<typeof getResumeContext>;
} | null {
  const session = endSession(projectId, summary);
  if (!session) {
    return null;
  }

  const resumeContext = getResumeContext(projectId);

  return {
    session: {
      id: session.id,
      duration: calculateDuration(session.startedAt, session.endedAt),
      entitiesModified: session.entitiesModified
    },
    resumeContext
  };
}

/**
 * Log AI action for audit trail
 */
export function logAIAction(
  projectId: string,
  entityType: string,
  entityId: string,
  action: string,
  details?: Record<string, unknown>
): void {
  logActivity(projectId, entityType as any, entityId, action as any, {
    newValue: details,
    actor: 'ai-agent'
  });
}

/**
 * Get compact status for AI prompts
 */
export function getCompactStatus(projectId: string): string {
  const briefing = getAIBriefing(projectId);

  const lines = [
    `Project: ${briefing.project.name} (${briefing.project.key})`,
    `Session: ${briefing.session.isActive ? 'Active' : 'Inactive'}`,
    `Items: ${briefing.overview.totalItems} total, ${briefing.overview.inProgress} in-progress, ${briefing.overview.blocked} blocked`,
    `Comments: ${briefing.pendingComments} pending`
  ];

  if (briefing.priorities.length > 0) {
    lines.push(`Priority: ${briefing.priorities[0].key} - ${briefing.priorities[0].reason}`);
  }

  return lines.join(' | ');
}

/**
 * Calculate duration string
 */
function calculateDuration(start: string, end?: string | null): string {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return '<1m';
  if (diffMins < 60) return `${diffMins}m`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
