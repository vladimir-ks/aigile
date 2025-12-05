/**
 * Query Service
 *
 * Unified search and filtering across all entity types.
 * Supports text search, status/priority filters, and date queries.
 *
 * @author Vladimir K.S.
 */

import { queryAll } from '../db/connection.js';

export type EntityType = 'initiative' | 'epic' | 'story' | 'task' | 'bug' | 'all';

export interface QueryFilters {
  text?: string;
  status?: string | string[];
  priority?: string | string[];
  assignee?: string;
  labels?: string[];
  sprint?: string;
  epic?: string;
  createdAfter?: string;
  updatedAfter?: string;
  limit?: number;
}

export interface QueryResult {
  type: string;
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  parent?: string;
  extra?: Record<string, unknown>;
}

export interface QueryStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

/**
 * Search across entities
 */
export function search(
  projectId: string,
  entityType: EntityType,
  filters: QueryFilters = {}
): QueryResult[] {
  const results: QueryResult[] = [];
  const limit = filters.limit ?? 50;

  if (entityType === 'all' || entityType === 'initiative') {
    results.push(...searchInitiatives(projectId, filters));
  }

  if (entityType === 'all' || entityType === 'epic') {
    results.push(...searchEpics(projectId, filters));
  }

  if (entityType === 'all' || entityType === 'story') {
    results.push(...searchStories(projectId, filters));
  }

  if (entityType === 'all' || entityType === 'task') {
    results.push(...searchTasks(projectId, filters));
  }

  if (entityType === 'all' || entityType === 'bug') {
    results.push(...searchBugs(projectId, filters));
  }

  // Sort by updated_at descending and limit
  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return results.slice(0, limit);
}

/**
 * Search initiatives
 */
function searchInitiatives(projectId: string, filters: QueryFilters): QueryResult[] {
  let query = `
    SELECT key, summary, status, priority, owner as assignee, created_at, updated_at
    FROM initiatives
    WHERE project_id = ?
  `;
  const params: unknown[] = [projectId];

  query += buildFilterClauses(filters, '', 'owner');

  const rows = queryAll<{
    key: string;
    summary: string;
    status: string;
    priority: string;
    assignee: string | null;
    created_at: string;
    updated_at: string;
  }>(query, params);

  return rows.map((r) => ({
    type: 'initiative',
    key: r.key,
    summary: r.summary,
    status: r.status,
    priority: r.priority,
    assignee: r.assignee,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

/**
 * Search epics
 */
function searchEpics(projectId: string, filters: QueryFilters): QueryResult[] {
  let query = `
    SELECT e.key, e.summary, e.status, e.priority, e.owner as assignee,
           e.created_at, e.updated_at, i.key as parent
    FROM epics e
    LEFT JOIN initiatives i ON e.initiative_id = i.id
    WHERE e.project_id = ?
  `;
  const params: unknown[] = [projectId];

  query += buildFilterClauses(filters, 'e', 'e.owner');

  const rows = queryAll<{
    key: string;
    summary: string;
    status: string;
    priority: string;
    assignee: string | null;
    created_at: string;
    updated_at: string;
    parent: string | null;
  }>(query, params);

  return rows.map((r) => ({
    type: 'epic',
    key: r.key,
    summary: r.summary,
    status: r.status,
    priority: r.priority,
    assignee: r.assignee,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    parent: r.parent ?? undefined
  }));
}

/**
 * Search stories
 */
function searchStories(projectId: string, filters: QueryFilters): QueryResult[] {
  let query = `
    SELECT s.key, s.summary, s.status, s.priority, s.assignee,
           s.created_at, s.updated_at, e.key as parent, s.story_points
    FROM user_stories s
    LEFT JOIN epics e ON s.epic_id = e.id
    WHERE s.project_id = ?
  `;
  const params: unknown[] = [projectId];

  // Epic filter
  if (filters.epic) {
    query += ` AND e.key = ?`;
    params.push(filters.epic);
  }

  // Sprint filter
  if (filters.sprint) {
    query += ` AND s.sprint_id = (SELECT id FROM sprints WHERE name = ? AND project_id = ?)`;
    params.push(filters.sprint, projectId);
  }

  query += buildFilterClauses(filters, 's', 's.assignee');

  const rows = queryAll<{
    key: string;
    summary: string;
    status: string;
    priority: string;
    assignee: string | null;
    created_at: string;
    updated_at: string;
    parent: string | null;
    story_points: number | null;
  }>(query, params);

  return rows.map((r) => ({
    type: 'story',
    key: r.key,
    summary: r.summary,
    status: r.status,
    priority: r.priority,
    assignee: r.assignee,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    parent: r.parent ?? undefined,
    extra: { storyPoints: r.story_points }
  }));
}

/**
 * Search tasks
 */
function searchTasks(projectId: string, filters: QueryFilters): QueryResult[] {
  let query = `
    SELECT t.key, t.summary, t.status, t.priority, t.assignee,
           t.created_at, t.updated_at, s.key as parent, t.issue_type
    FROM tasks t
    LEFT JOIN user_stories s ON t.story_id = s.id
    WHERE t.project_id = ?
  `;
  const params: unknown[] = [projectId];

  // Sprint filter
  if (filters.sprint) {
    query += ` AND t.sprint_id = (SELECT id FROM sprints WHERE name = ? AND project_id = ?)`;
    params.push(filters.sprint, projectId);
  }

  query += buildFilterClauses(filters, 't', 't.assignee');

  const rows = queryAll<{
    key: string;
    summary: string;
    status: string;
    priority: string;
    assignee: string | null;
    created_at: string;
    updated_at: string;
    parent: string | null;
    issue_type: string;
  }>(query, params);

  return rows.map((r) => ({
    type: r.issue_type === 'subtask' ? 'subtask' : 'task',
    key: r.key,
    summary: r.summary,
    status: r.status,
    priority: r.priority,
    assignee: r.assignee,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    parent: r.parent ?? undefined
  }));
}

/**
 * Search bugs
 */
function searchBugs(projectId: string, filters: QueryFilters): QueryResult[] {
  let query = `
    SELECT b.key, b.summary, b.status, b.priority, b.assignee,
           b.created_at, b.updated_at, b.severity, e.key as parent
    FROM bugs b
    LEFT JOIN epics e ON b.epic_id = e.id
    WHERE b.project_id = ?
  `;
  const params: unknown[] = [projectId];

  query += buildFilterClauses(filters, 'b', 'b.assignee');

  const rows = queryAll<{
    key: string;
    summary: string;
    status: string;
    priority: string;
    assignee: string | null;
    created_at: string;
    updated_at: string;
    severity: string;
    parent: string | null;
  }>(query, params);

  return rows.map((r) => ({
    type: 'bug',
    key: r.key,
    summary: r.summary,
    status: r.status,
    priority: r.priority,
    assignee: r.assignee,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    parent: r.parent ?? undefined,
    extra: { severity: r.severity }
  }));
}

/**
 * Build filter clauses for SQL query
 * @param filters - Query filters
 * @param tablePrefix - Table alias prefix (e.g., 's' for user_stories, 't' for tasks)
 * @param assigneeColumn - Full assignee column reference (e.g., 's.assignee')
 */
function buildFilterClauses(filters: QueryFilters, tablePrefix: string, assigneeColumn: string): string {
  const clauses: string[] = [];
  const p = tablePrefix && tablePrefix.length > 0 ? `${tablePrefix}.` : '';

  // Text search
  if (filters.text) {
    clauses.push(`(${p}summary LIKE '%${escapeSql(filters.text)}%' OR ${p}key LIKE '%${escapeSql(filters.text)}%')`);
  }

  // Status filter
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    clauses.push(`${p}status IN (${statuses.map((s) => `'${escapeSql(s)}'`).join(', ')})`);
  }

  // Priority filter
  if (filters.priority) {
    const priorities = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
    clauses.push(`${p}priority IN (${priorities.map((p) => `'${escapeSql(p)}'`).join(', ')})`);
  }

  // Assignee filter
  if (filters.assignee) {
    clauses.push(`${assigneeColumn} = '${escapeSql(filters.assignee)}'`);
  }

  // Date filters
  if (filters.createdAfter) {
    clauses.push(`${p}created_at >= '${escapeSql(filters.createdAfter)}'`);
  }

  if (filters.updatedAfter) {
    clauses.push(`${p}updated_at >= '${escapeSql(filters.updatedAfter)}'`);
  }

  return clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : '';
}

/**
 * Escape SQL special characters
 */
function escapeSql(str: string): string {
  return str.replace(/'/g, "''").replace(/"/g, '""');
}

/**
 * Get query statistics
 */
export function getQueryStats(projectId: string): QueryStats {
  const results = search(projectId, 'all', { limit: 1000 });

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const r of results) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  return {
    total: results.length,
    byType,
    byStatus
  };
}

/**
 * Find related items for an entity
 */
export function findRelated(
  projectId: string,
  entityType: string,
  entityKey: string
): QueryResult[] {
  const results: QueryResult[] = [];

  if (entityType === 'initiative') {
    // Find epics under this initiative
    const epics = queryAll<{ id: string; key: string }>(
      `SELECT e.id, e.key FROM epics e
       JOIN initiatives i ON e.initiative_id = i.id
       WHERE i.key = ? AND i.project_id = ?`,
      [entityKey, projectId]
    );

    for (const epic of epics) {
      results.push(...search(projectId, 'epic', { text: epic.key, limit: 1 }));
    }
  }

  if (entityType === 'epic') {
    // Find stories under this epic
    const stories = search(projectId, 'story', { epic: entityKey });
    results.push(...stories);

    // Find bugs under this epic
    const bugs = queryAll<{ key: string }>(
      `SELECT b.key FROM bugs b
       JOIN epics e ON b.epic_id = e.id
       WHERE e.key = ? AND e.project_id = ?`,
      [entityKey, projectId]
    );

    for (const bug of bugs) {
      results.push(...search(projectId, 'bug', { text: bug.key, limit: 1 }));
    }
  }

  if (entityType === 'story') {
    // Find tasks under this story
    const tasks = queryAll<{ key: string }>(
      `SELECT t.key FROM tasks t
       JOIN user_stories s ON t.story_id = s.id
       WHERE s.key = ? AND s.project_id = ?`,
      [entityKey, projectId]
    );

    for (const task of tasks) {
      results.push(...search(projectId, 'task', { text: task.key, limit: 1 }));
    }
  }

  return results;
}

/**
 * Quick search by key pattern
 */
export function searchByKey(projectId: string, keyPattern: string): QueryResult[] {
  return search(projectId, 'all', { text: keyPattern, limit: 10 });
}

/**
 * Find items by assignee
 */
export function findByAssignee(projectId: string, assignee: string): QueryResult[] {
  return search(projectId, 'all', { assignee, limit: 100 });
}

/**
 * Find items updated recently
 */
export function findRecentlyUpdated(projectId: string, hours: number = 24): QueryResult[] {
  const since = new Date();
  since.setHours(since.getHours() - hours);

  // Use SQLite-compatible format (YYYY-MM-DD HH:MM:SS)
  const sqliteDate = since.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

  return search(projectId, 'all', {
    updatedAfter: sqliteDate,
    limit: 50
  });
}

/**
 * Find items in a specific status
 */
export function findByStatus(
  projectId: string,
  status: string | string[],
  entityType: EntityType = 'all'
): QueryResult[] {
  return search(projectId, entityType, { status, limit: 100 });
}
