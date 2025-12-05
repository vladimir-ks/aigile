/**
 * Activity Logger Service
 *
 * Logs all entity changes for audit trail and AI context.
 * Tracks create, update, delete, and transition actions.
 *
 * @author Vladimir K.S.
 */

import { queryAll, run, generateId } from '../db/connection.js';
import { incrementSessionEntities } from './session-service.js';

export type EntityType = 'initiative' | 'epic' | 'story' | 'task' | 'bug' | 'sprint' | 'document' | 'component' | 'version' | 'persona' | 'ux_journey';
export type ActionType = 'create' | 'update' | 'delete' | 'transition' | 'link' | 'unlink';

export interface ActivityEntry {
  id: string;
  projectId: string;
  entityType: EntityType;
  entityId: string;
  action: ActionType;
  oldValue: string | null;
  newValue: string | null;
  actor: string | null;
  createdAt: string;
}

export interface ActivityLogOptions {
  entityType?: EntityType;
  entityId?: string;
  action?: ActionType;
  limit?: number;
  since?: string;
}

/**
 * Log an activity
 */
export function logActivity(
  projectId: string,
  entityType: EntityType,
  entityId: string,
  action: ActionType,
  options: {
    oldValue?: string | Record<string, unknown>;
    newValue?: string | Record<string, unknown>;
    actor?: string;
  } = {}
): void {
  const id = generateId();

  const oldVal = options.oldValue
    ? typeof options.oldValue === 'string'
      ? options.oldValue
      : JSON.stringify(options.oldValue)
    : null;

  const newVal = options.newValue
    ? typeof options.newValue === 'string'
      ? options.newValue
      : JSON.stringify(options.newValue)
    : null;

  run(
    `INSERT INTO activity_log (id, project_id, entity_type, entity_id, action, old_value, new_value, actor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, projectId, entityType, entityId, action, oldVal, newVal, options.actor ?? null]
  );

  // Increment session entity count
  incrementSessionEntities(projectId, 1);
}

/**
 * Log a create action
 */
export function logCreate(
  projectId: string,
  entityType: EntityType,
  entityId: string,
  data: Record<string, unknown>,
  actor?: string
): void {
  logActivity(projectId, entityType, entityId, 'create', {
    newValue: data,
    actor
  });
}

/**
 * Log an update action
 */
export function logUpdate(
  projectId: string,
  entityType: EntityType,
  entityId: string,
  changes: { field: string; oldValue: unknown; newValue: unknown }[],
  actor?: string
): void {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const change of changes) {
    oldValue[change.field] = change.oldValue;
    newValue[change.field] = change.newValue;
  }

  logActivity(projectId, entityType, entityId, 'update', {
    oldValue,
    newValue,
    actor
  });
}

/**
 * Log a transition action
 */
export function logTransition(
  projectId: string,
  entityType: EntityType,
  entityId: string,
  oldStatus: string,
  newStatus: string,
  actor?: string
): void {
  logActivity(projectId, entityType, entityId, 'transition', {
    oldValue: oldStatus,
    newValue: newStatus,
    actor
  });
}

/**
 * Log a delete action
 */
export function logDelete(
  projectId: string,
  entityType: EntityType,
  entityId: string,
  data: Record<string, unknown>,
  actor?: string
): void {
  logActivity(projectId, entityType, entityId, 'delete', {
    oldValue: data,
    actor
  });
}

/**
 * Get activity log entries
 */
export function getActivityLog(
  projectId: string,
  options: ActivityLogOptions = {}
): ActivityEntry[] {
  let query = `
    SELECT id, project_id, entity_type, entity_id, action, old_value, new_value, actor, created_at
    FROM activity_log
    WHERE project_id = ?
  `;
  const params: unknown[] = [projectId];

  if (options.entityType) {
    query += ' AND entity_type = ?';
    params.push(options.entityType);
  }

  if (options.entityId) {
    query += ' AND entity_id = ?';
    params.push(options.entityId);
  }

  if (options.action) {
    query += ' AND action = ?';
    params.push(options.action);
  }

  if (options.since) {
    query += ' AND created_at >= ?';
    params.push(options.since);
  }

  query += ' ORDER BY created_at DESC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const entries = queryAll<{
    id: string;
    project_id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    old_value: string | null;
    new_value: string | null;
    actor: string | null;
    created_at: string;
  }>(query, params);

  return entries.map((e) => ({
    id: e.id,
    projectId: e.project_id,
    entityType: e.entity_type as EntityType,
    entityId: e.entity_id,
    action: e.action as ActionType,
    oldValue: e.old_value,
    newValue: e.new_value,
    actor: e.actor,
    createdAt: e.created_at
  }));
}

/**
 * Get activity summary for a project
 */
export function getActivitySummary(
  projectId: string,
  since?: string
): {
  totalActions: number;
  creates: number;
  updates: number;
  deletes: number;
  transitions: number;
  byEntityType: Record<string, number>;
} {
  let query = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN action = 'create' THEN 1 ELSE 0 END) as creates,
      SUM(CASE WHEN action = 'update' THEN 1 ELSE 0 END) as updates,
      SUM(CASE WHEN action = 'delete' THEN 1 ELSE 0 END) as deletes,
      SUM(CASE WHEN action = 'transition' THEN 1 ELSE 0 END) as transitions
    FROM activity_log
    WHERE project_id = ?
  `;
  const params: unknown[] = [projectId];

  if (since) {
    query += ' AND created_at >= ?';
    params.push(since);
  }

  const stats = queryAll<{
    total: number;
    creates: number;
    updates: number;
    deletes: number;
    transitions: number;
  }>(query, params)[0] ?? { total: 0, creates: 0, updates: 0, deletes: 0, transitions: 0 };

  // Get counts by entity type
  let typeQuery = `
    SELECT entity_type, COUNT(*) as count
    FROM activity_log
    WHERE project_id = ?
  `;
  const typeParams: unknown[] = [projectId];

  if (since) {
    typeQuery += ' AND created_at >= ?';
    typeParams.push(since);
  }

  typeQuery += ' GROUP BY entity_type';

  const typeCounts = queryAll<{ entity_type: string; count: number }>(typeQuery, typeParams);
  const byEntityType: Record<string, number> = {};
  for (const tc of typeCounts) {
    byEntityType[tc.entity_type] = tc.count;
  }

  return {
    totalActions: stats.total,
    creates: stats.creates,
    updates: stats.updates,
    deletes: stats.deletes,
    transitions: stats.transitions,
    byEntityType
  };
}

/**
 * Get recent activity for an entity
 */
export function getEntityHistory(
  entityType: EntityType,
  entityId: string,
  limit: number = 10
): ActivityEntry[] {
  const entries = queryAll<{
    id: string;
    project_id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    old_value: string | null;
    new_value: string | null;
    actor: string | null;
    created_at: string;
  }>(
    `SELECT * FROM activity_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT ?`,
    [entityType, entityId, limit]
  );

  return entries.map((e) => ({
    id: e.id,
    projectId: e.project_id,
    entityType: e.entity_type as EntityType,
    entityId: e.entity_id,
    action: e.action as ActionType,
    oldValue: e.old_value,
    newValue: e.new_value,
    actor: e.actor,
    createdAt: e.created_at
  }));
}
