/**
 * Session Service
 *
 * Manages AI work sessions for context continuity.
 * Tracks session duration, entities modified, and files changed.
 *
 * @author Vladimir K.S.
 */

import { queryOne, queryAll, run, generateId } from '../db/connection.js';

export interface Session {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  entitiesModified: number;
  filesModified: number;
  status: 'active' | 'completed' | 'abandoned';
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  duration: string;
  status: string;
  entitiesModified: number;
  filesModified: number;
  summary: string | null;
}

/**
 * Start a new session
 */
export function startSession(projectId: string): Session {
  // Check for existing active session
  const existing = queryOne<{ id: string }>(
    'SELECT id FROM sessions WHERE project_id = ? AND status = ?',
    [projectId, 'active']
  );

  if (existing) {
    // End the existing session as abandoned
    run(
      `UPDATE sessions SET status = 'abandoned', ended_at = datetime('now') WHERE id = ?`,
      [existing.id]
    );
  }

  const sessionId = generateId();
  const now = new Date().toISOString();

  run(
    `INSERT INTO sessions (id, project_id, started_at, status, entities_modified, files_modified)
     VALUES (?, ?, ?, 'active', 0, 0)`,
    [sessionId, projectId, now]
  );

  return {
    id: sessionId,
    projectId,
    startedAt: now,
    endedAt: null,
    summary: null,
    entitiesModified: 0,
    filesModified: 0,
    status: 'active'
  };
}

/**
 * End the current active session
 */
export function endSession(projectId: string, summary?: string): Session | null {
  const session = queryOne<{
    id: string;
    started_at: string;
    entities_modified: number;
    files_modified: number;
  }>(
    'SELECT id, started_at, entities_modified, files_modified FROM sessions WHERE project_id = ? AND status = ?',
    [projectId, 'active']
  );

  if (!session) {
    return null;
  }

  const now = new Date().toISOString();

  run(
    `UPDATE sessions SET status = 'completed', ended_at = ?, summary = ? WHERE id = ?`,
    [now, summary ?? null, session.id]
  );

  return {
    id: session.id,
    projectId,
    startedAt: session.started_at,
    endedAt: now,
    summary: summary ?? null,
    entitiesModified: session.entities_modified,
    filesModified: session.files_modified,
    status: 'completed'
  };
}

/**
 * Get the current active session
 */
export function getActiveSession(projectId: string): Session | null {
  const session = queryOne<{
    id: string;
    project_id: string;
    started_at: string;
    ended_at: string | null;
    summary: string | null;
    entities_modified: number;
    files_modified: number;
    status: string;
  }>(
    'SELECT * FROM sessions WHERE project_id = ? AND status = ?',
    [projectId, 'active']
  );

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    projectId: session.project_id,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    summary: session.summary,
    entitiesModified: session.entities_modified,
    filesModified: session.files_modified,
    status: session.status as 'active'
  };
}

/**
 * Increment entity count for active session
 */
export function incrementSessionEntities(projectId: string, count: number = 1): void {
  run(
    `UPDATE sessions SET entities_modified = entities_modified + ? WHERE project_id = ? AND status = 'active'`,
    [count, projectId]
  );
}

/**
 * Increment file count for active session
 */
export function incrementSessionFiles(projectId: string, count: number = 1): void {
  run(
    `UPDATE sessions SET files_modified = files_modified + ? WHERE project_id = ? AND status = 'active'`,
    [count, projectId]
  );
}

/**
 * List sessions for a project
 */
export function listSessions(
  projectId: string,
  options: { status?: string; limit?: number } = {}
): SessionSummary[] {
  let query = `
    SELECT id, started_at, ended_at, status, entities_modified, files_modified, summary
    FROM sessions
    WHERE project_id = ?
  `;
  const params: unknown[] = [projectId];

  if (options.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY started_at DESC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const sessions = queryAll<{
    id: string;
    started_at: string;
    ended_at: string | null;
    status: string;
    entities_modified: number;
    files_modified: number;
    summary: string | null;
  }>(query, params);

  return sessions.map((s) => ({
    id: s.id,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    duration: calculateDuration(s.started_at, s.ended_at),
    status: s.status,
    entitiesModified: s.entities_modified,
    filesModified: s.files_modified,
    summary: s.summary
  }));
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): Session | null {
  const session = queryOne<{
    id: string;
    project_id: string;
    started_at: string;
    ended_at: string | null;
    summary: string | null;
    entities_modified: number;
    files_modified: number;
    status: string;
  }>('SELECT * FROM sessions WHERE id = ?', [sessionId]);

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    projectId: session.project_id,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    summary: session.summary,
    entitiesModified: session.entities_modified,
    filesModified: session.files_modified,
    status: session.status as Session['status']
  };
}

/**
 * Calculate human-readable duration
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
