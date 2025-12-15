/**
 * Session Service
 *
 * Manages AI work sessions for context continuity.
 * Tracks session duration, entities modified, and files changed.
 *
 * @author Vladimir K.S.
 */

import { queryOne, queryAll, run, generateId, getSessionChunks, type Chunk } from '../db/connection.js';

export interface Session {
  id: string;
  projectId: string;
  name: string | null;
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
export function startSession(projectId: string, name?: string): Session {
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
  const sessionName = name || null;

  run(
    `INSERT INTO sessions (id, project_id, name, started_at, status, entities_modified, files_modified)
     VALUES (?, ?, ?, ?, 'active', 0, 0)`,
    [sessionId, projectId, sessionName, now]
  );

  return {
    id: sessionId,
    projectId,
    name: sessionName,
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
 * Get session by name
 */
export function getSessionByName(projectId: string, name: string): Session | null {
  const session = queryOne<{
    id: string;
    project_id: string;
    name: string;
    started_at: string;
    ended_at: string | null;
    summary: string | null;
    entities_modified: number;
    files_modified: number;
    status: string;
  }>(
    'SELECT * FROM sessions WHERE project_id = ? AND name = ?',
    [projectId, name]
  );

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    projectId: session.project_id,
    name: session.name,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    summary: session.summary,
    entitiesModified: session.entities_modified,
    filesModified: session.files_modified,
    status: session.status as Session['status']
  };
}

/**
 * Resume an existing session (set as active)
 */
export function resumeSession(projectId: string, sessionId: string): Session | null {
  // Check session exists and is resumable
  const session = queryOne<{
    id: string;
    project_id: string;
    name: string;
    started_at: string;
    ended_at: string | null;
    summary: string | null;
    entities_modified: number;
    files_modified: number;
    status: string;
  }>(
    'SELECT * FROM sessions WHERE id = ? AND project_id = ?',
    [sessionId, projectId]
  );

  if (!session) {
    return null;
  }

  if (session.status === 'completed') {
    return null; // Can't resume completed sessions
  }

  // Abandon any currently active session
  const existing = queryOne<{ id: string }>(
    'SELECT id FROM sessions WHERE project_id = ? AND status = ? AND id != ?',
    [projectId, 'active', sessionId]
  );

  if (existing) {
    run(
      `UPDATE sessions SET status = 'abandoned', ended_at = datetime('now') WHERE id = ?`,
      [existing.id]
    );
  }

  // Set this session as active
  run(
    `UPDATE sessions SET status = 'active', ended_at = NULL WHERE id = ?`,
    [sessionId]
  );

  return {
    id: session.id,
    projectId: session.project_id,
    name: session.name,
    startedAt: session.started_at,
    endedAt: null,
    summary: session.summary,
    entitiesModified: session.entities_modified,
    filesModified: session.files_modified,
    status: 'active'
  };
}

/**
 * Get session resume info (chunks and coverage)
 */
export function getSessionResumeInfo(sessionId: string): {
  chunks: Chunk[];
  coverage: { total: number; reviewed: number };
} {
  const chunks = getSessionChunks(sessionId);

  // Count total assigned files across all chunks
  let totalAssigned = 0;
  for (const chunk of chunks) {
    if (chunk.assigned_files) {
      try {
        totalAssigned += JSON.parse(chunk.assigned_files).length;
      } catch {
        // Skip invalid JSON
      }
    }
  }

  // Count reviewed files
  const reviewed = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM session_files WHERE session_id = ? AND review_type = 'assigned'`,
    [sessionId]
  );

  return {
    chunks,
    coverage: {
      total: totalAssigned,
      reviewed: reviewed?.count ?? 0
    }
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
