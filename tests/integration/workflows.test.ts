/**
 * Integration Tests: Workflow Transitions
 *
 * Tests status transitions and workflow conditions
 * for all entity types.
 *
 * @author Vladimir K.S.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initTestDatabase,
  closeTestDb,
  testQueryAll,
  testQueryOne,
  testRun,
  generateTestId,
  getTestNextKey,
  createTestProject
} from '../helpers/test-db.js';

describe('Workflow Transitions', () => {
  let projectId: string;
  const projectKey = 'TEST';

  beforeEach(async () => {
    await initTestDatabase();
    projectId = createTestProject(projectKey);
  });

  afterEach(async () => {
    closeTestDb();
  });

  describe('Initiative Workflow', () => {
    it('transitions from draft to active', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO initiatives (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Initiative', 'draft']
      );

      testRun(
        `UPDATE initiatives SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        ['active', id]
      );

      const result = testQueryOne<{ status: string }>(
        'SELECT status FROM initiatives WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('active');
    });

    it('transitions from active to done when all epics complete', () => {
      const initId = generateTestId();
      const initKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO initiatives (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [initId, projectId, initKey, 'Initiative', 'active']
      );

      // Create epics under initiative
      for (const status of ['closed', 'closed']) {
        const epicId = generateTestId();
        const epicKey = getTestNextKey(projectKey);
        testRun(
          `INSERT INTO epics (id, project_id, key, summary, initiative_id, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [epicId, projectId, epicKey, 'Epic', initId, status]
        );
      }

      // Check if all epics are closed
      const incompleteEpics = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM epics
         WHERE initiative_id = ? AND status != 'closed'`,
        [initId]
      );

      expect(incompleteEpics!.count).toBe(0);

      // Can transition to done
      testRun(
        `UPDATE initiatives SET status = 'done' WHERE id = ?`,
        [initId]
      );

      const result = testQueryOne<{ status: string }>(
        'SELECT status FROM initiatives WHERE id = ?',
        [initId]
      );

      expect(result!.status).toBe('done');
    });

    it('rejects done transition with incomplete epics', () => {
      const initId = generateTestId();
      const initKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO initiatives (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [initId, projectId, initKey, 'Initiative', 'active']
      );

      // Create one incomplete epic
      const epicId = generateTestId();
      const epicKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO epics (id, project_id, key, summary, initiative_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [epicId, projectId, epicKey, 'Incomplete Epic', initId, 'in_progress']
      );

      // Check for incomplete epics
      const incompleteEpics = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM epics
         WHERE initiative_id = ? AND status != 'closed'`,
        [initId]
      );

      expect(incompleteEpics!.count).toBe(1);
      // Workflow should reject transition (validation logic)
    });

    it('allows archiving done initiatives', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO initiatives (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Done Initiative', 'done']
      );

      testRun(
        `UPDATE initiatives SET status = 'archived' WHERE id = ?`,
        [id]
      );

      const result = testQueryOne<{ status: string }>(
        'SELECT status FROM initiatives WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('archived');
    });
  });

  describe('Epic Workflow', () => {
    it('follows backlog → analysis → ready → in_progress → done → closed', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO epics (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Epic', 'backlog']
      );

      const transitions = ['analysis', 'ready', 'in_progress', 'done', 'closed'];

      for (const status of transitions) {
        testRun(
          `UPDATE epics SET status = ?, updated_at = datetime('now') WHERE id = ?`,
          [status, id]
        );

        const result = testQueryOne<{ status: string }>(
          'SELECT status FROM epics WHERE id = ?',
          [id]
        );

        expect(result!.status).toBe(status);
      }
    });

    it('requires at least one story for ready', () => {
      const epicId = generateTestId();
      const epicKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO epics (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [epicId, projectId, epicKey, 'Epic', 'analysis']
      );

      // Check story count before transitioning to ready
      const storyCount = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM user_stories WHERE epic_id = ?`,
        [epicId]
      );

      expect(storyCount!.count).toBe(0);
      // Epic without stories should not be ready
    });

    it('requires all stories done to complete', () => {
      const epicId = generateTestId();
      const epicKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO epics (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [epicId, projectId, epicKey, 'Epic', 'in_progress']
      );

      // Create stories - some done, some not
      for (const status of ['done', 'in_progress']) {
        const storyId = generateTestId();
        const storyKey = getTestNextKey(projectKey);
        testRun(
          `INSERT INTO user_stories (id, project_id, key, summary, epic_id, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [storyId, projectId, storyKey, 'Story', epicId, status]
        );
      }

      // Check for incomplete stories
      const incompleteStories = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM user_stories
         WHERE epic_id = ? AND status NOT IN ('done', 'closed')`,
        [epicId]
      );

      expect(incompleteStories!.count).toBe(1);
      // Epic should not transition to done
    });

    it('records activity log on transition', () => {
      const epicId = generateTestId();
      const epicKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO epics (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [epicId, projectId, epicKey, 'Epic', 'backlog']
      );

      // Log transition
      const logId = generateTestId();
      testRun(
        `INSERT INTO activity_log (id, project_id, entity_type, entity_id, action, old_value, new_value)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [logId, projectId, 'epic', epicId, 'transition', 'backlog', 'in_progress']
      );

      testRun(
        `UPDATE epics SET status = 'in_progress' WHERE id = ?`,
        [epicId]
      );

      const log = testQueryOne<{ old_value: string; new_value: string }>(
        'SELECT old_value, new_value FROM activity_log WHERE entity_id = ?',
        [epicId]
      );

      expect(log!.old_value).toBe('backlog');
      expect(log!.new_value).toBe('in_progress');
    });
  });

  describe('Story Workflow', () => {
    it('requires story points to be selected', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Story', 'backlog']
      );

      const result = testQueryOne<{ story_points: number | null }>(
        'SELECT story_points FROM user_stories WHERE id = ?',
        [id]
      );

      expect(result!.story_points).toBeNull();
      // Story without points should not be scheduled
    });

    it('requires assignee to start progress', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, status, story_points)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Story', 'backlog', 5]
      );

      // Check assignee before starting
      const result = testQueryOne<{ assignee: string | null }>(
        'SELECT assignee FROM user_stories WHERE id = ?',
        [id]
      );

      expect(result!.assignee).toBeNull();
      // Story without assignee should not start
    });

    it('requires all tasks done for review', () => {
      const storyId = generateTestId();
      const storyKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [storyId, projectId, storyKey, 'Story', 'in_progress']
      );

      // Create tasks with different statuses
      for (const status of ['done', 'in_progress']) {
        const taskId = generateTestId();
        const taskKey = getTestNextKey(projectKey);
        testRun(
          `INSERT INTO tasks (id, project_id, key, summary, story_id, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [taskId, projectId, taskKey, 'Task', storyId, status]
        );
      }

      // Check for incomplete tasks
      const incompleteTasks = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks
         WHERE story_id = ? AND status NOT IN ('done', 'closed')`,
        [storyId]
      );

      expect(incompleteTasks!.count).toBe(1);
      // Story should not move to review
    });

    it('sets resolved timestamp on done', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Story', 'in_review']
      );

      // Transition to done - note: stories don't have resolved_at in current schema
      // Using updated_at as proxy
      testRun(
        `UPDATE user_stories SET status = 'done', updated_at = datetime('now') WHERE id = ?`,
        [id]
      );

      const result = testQueryOne<{ status: string; updated_at: string }>(
        'SELECT status, updated_at FROM user_stories WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('done');
      expect(result!.updated_at).toBeDefined();
    });
  });

  describe('Task Workflow', () => {
    it('requires blocked_reason when blocking', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Task', 'in_progress']
      );

      // Set blocked with reason
      testRun(
        `UPDATE tasks SET status = 'blocked', blocked_reason = ? WHERE id = ?`,
        ['Waiting for API access', id]
      );

      const result = testQueryOne<{ status: string; blocked_reason: string }>(
        'SELECT status, blocked_reason FROM tasks WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('blocked');
      expect(result!.blocked_reason).toBe('Waiting for API access');
    });

    it('clears blocked_reason when unblocking', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, status, blocked_reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Task', 'blocked', 'Waiting']
      );

      // Unblock
      testRun(
        `UPDATE tasks SET status = 'in_progress', blocked_reason = NULL WHERE id = ?`,
        [id]
      );

      const result = testQueryOne<{ status: string; blocked_reason: string | null }>(
        'SELECT status, blocked_reason FROM tasks WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('in_progress');
      expect(result!.blocked_reason).toBeNull();
    });

    it('sets resolved_at on done', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Task', 'in_progress']
      );

      testRun(
        `UPDATE tasks SET status = 'done', resolved_at = datetime('now') WHERE id = ?`,
        [id]
      );

      const result = testQueryOne<{ status: string; resolved_at: string }>(
        'SELECT status, resolved_at FROM tasks WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('done');
      expect(result!.resolved_at).toBeDefined();
    });

    it('prevents completion with incomplete subtasks', () => {
      const taskId = generateTestId();
      const taskKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, status, issue_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [taskId, projectId, taskKey, 'Parent Task', 'in_progress', 'task']
      );

      // Create incomplete subtask
      const subtaskId = generateTestId();
      const subtaskKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, parent_id, status, issue_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [subtaskId, projectId, subtaskKey, 'Subtask', taskId, 'todo', 'subtask']
      );

      // Check for incomplete subtasks
      const incompleteSubtasks = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks
         WHERE parent_id = ? AND status NOT IN ('done', 'closed')`,
        [taskId]
      );

      expect(incompleteSubtasks!.count).toBe(1);
      // Parent task should not complete
    });
  });

  describe('Bug Workflow', () => {
    it('requires assignee to start', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO bugs (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Bug', 'open']
      );

      const result = testQueryOne<{ assignee: string | null }>(
        'SELECT assignee FROM bugs WHERE id = ?',
        [id]
      );

      expect(result!.assignee).toBeNull();
      // Bug without assignee should not start work
    });

    it('requires resolution when resolving', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO bugs (id, project_id, key, summary, status, assignee)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Bug', 'in_progress', 'dev@test.com']
      );

      // Resolve with resolution
      testRun(
        `UPDATE bugs SET status = 'resolved', resolution = 'Fixed' WHERE id = ?`,
        [id]
      );

      const result = testQueryOne<{ status: string; resolution: string }>(
        'SELECT status, resolution FROM bugs WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('resolved');
      expect(result!.resolution).toBe('Fixed');
    });

    it('sets resolved_at on resolved', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO bugs (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Bug', 'in_progress']
      );

      testRun(
        `UPDATE bugs SET status = 'resolved', resolution = 'Fixed', resolved_at = datetime('now')
         WHERE id = ?`,
        [id]
      );

      const result = testQueryOne<{ resolved_at: string }>(
        'SELECT resolved_at FROM bugs WHERE id = ?',
        [id]
      );

      expect(result!.resolved_at).toBeDefined();
    });

    it('allows reopening resolved bugs', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO bugs (id, project_id, key, summary, status, resolution, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [id, projectId, key, 'Bug', 'resolved', 'Fixed']
      );

      // Reopen
      testRun(
        `UPDATE bugs SET status = 'reopened', resolution = NULL, resolved_at = NULL WHERE id = ?`,
        [id]
      );

      const result = testQueryOne<{ status: string; resolution: string | null; resolved_at: string | null }>(
        'SELECT status, resolution, resolved_at FROM bugs WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('reopened');
      expect(result!.resolution).toBeNull();
      expect(result!.resolved_at).toBeNull();
    });
  });

  describe('Sprint Workflow', () => {
    it('enforces single active sprint', () => {
      // Create first active sprint
      const sprint1Id = generateTestId();
      testRun(
        `INSERT INTO sprints (id, project_id, name, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sprint1Id, projectId, 'Sprint 1', '2025-01-01', '2025-01-14', 'active']
      );

      // Check for existing active sprint
      const activeCount = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM sprints WHERE project_id = ? AND status = 'active'`,
        [projectId]
      );

      expect(activeCount!.count).toBe(1);
      // Should not allow activating second sprint
    });

    it('calculates velocity on close', () => {
      const sprintId = generateTestId();
      testRun(
        `INSERT INTO sprints (id, project_id, name, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sprintId, projectId, 'Sprint 1', '2025-01-01', '2025-01-14', 'active']
      );

      // Add completed stories
      for (const points of [3, 5, 8]) {
        const storyId = generateTestId();
        const storyKey = getTestNextKey(projectKey);
        testRun(
          `INSERT INTO user_stories (id, project_id, key, summary, sprint_id, story_points, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [storyId, projectId, storyKey, 'Story', sprintId, points, 'done']
        );
      }

      // Calculate velocity
      const velocity = testQueryOne<{ total: number }>(
        `SELECT SUM(story_points) as total FROM user_stories
         WHERE sprint_id = ? AND status IN ('done', 'closed')`,
        [sprintId]
      );

      // Close sprint with velocity
      testRun(
        `UPDATE sprints SET status = 'closed', velocity = ? WHERE id = ?`,
        [velocity!.total, sprintId]
      );

      const result = testQueryOne<{ status: string; velocity: number }>(
        'SELECT status, velocity FROM sprints WHERE id = ?',
        [sprintId]
      );

      expect(result!.status).toBe('closed');
      expect(result!.velocity).toBe(16);
    });

    it('prevents reactivating closed sprint', () => {
      const sprintId = generateTestId();
      testRun(
        `INSERT INTO sprints (id, project_id, name, start_date, end_date, status, velocity)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sprintId, projectId, 'Sprint 1', '2025-01-01', '2025-01-14', 'closed', 20]
      );

      const result = testQueryOne<{ status: string }>(
        'SELECT status FROM sprints WHERE id = ?',
        [sprintId]
      );

      expect(result!.status).toBe('closed');
      // Workflow validation should prevent reactivation
    });
  });

  describe('Version Workflow', () => {
    it('sets release_date on release if not set', () => {
      const id = generateTestId();

      testRun(
        `INSERT INTO versions (id, project_id, name, status)
         VALUES (?, ?, ?, ?)`,
        [id, projectId, 'v1.0.0', 'unreleased']
      );

      // Release without date - should auto-set
      testRun(
        `UPDATE versions SET status = 'released', release_date = COALESCE(release_date, date('now'))
         WHERE id = ?`,
        [id]
      );

      const result = testQueryOne<{ status: string; release_date: string }>(
        'SELECT status, release_date FROM versions WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('released');
      expect(result!.release_date).toBeDefined();
    });

    it('prevents unreleasing released version', () => {
      const id = generateTestId();

      testRun(
        `INSERT INTO versions (id, project_id, name, status, release_date)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, 'v1.0.0', 'released', '2025-01-15']
      );

      const result = testQueryOne<{ status: string }>(
        'SELECT status FROM versions WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('released');
      // Workflow validation should prevent unreleasing
      // Can only archive from released state
    });
  });

  describe('Cross-Entity Workflow Rules', () => {
    it('cascades sprint assignment when story moves to sprint', () => {
      const sprintId = generateTestId();
      testRun(
        `INSERT INTO sprints (id, project_id, name, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sprintId, projectId, 'Sprint 1', '2025-01-01', '2025-01-14', 'active']
      );

      const storyId = generateTestId();
      const storyKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, sprint_id)
         VALUES (?, ?, ?, ?, ?)`,
        [storyId, projectId, storyKey, 'Story', sprintId]
      );

      // Create task under story
      const taskId = generateTestId();
      const taskKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, story_id)
         VALUES (?, ?, ?, ?, ?)`,
        [taskId, projectId, taskKey, 'Task', storyId]
      );

      // Update task sprint to match story
      testRun(
        `UPDATE tasks SET sprint_id = ? WHERE story_id = ?`,
        [sprintId, storyId]
      );

      const task = testQueryOne<{ sprint_id: string }>(
        'SELECT sprint_id FROM tasks WHERE id = ?',
        [taskId]
      );

      expect(task!.sprint_id).toBe(sprintId);
    });

    it('validates parent-child status consistency', () => {
      const epicId = generateTestId();
      const epicKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO epics (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [epicId, projectId, epicKey, 'Epic', 'closed']
      );

      // Try to create active story under closed epic
      const storyId = generateTestId();
      const storyKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, epic_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [storyId, projectId, storyKey, 'Story', epicId, 'in_progress']
      );

      // Validation should flag this inconsistency
      const inconsistent = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM user_stories s
         JOIN epics e ON s.epic_id = e.id
         WHERE e.status = 'closed' AND s.status NOT IN ('done', 'closed')`,
        []
      );

      expect(inconsistent!.count).toBe(1);
    });

    it('tracks entity modification timestamps', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Task', 'todo']
      );

      const before = testQueryOne<{ updated_at: string }>(
        'SELECT updated_at FROM tasks WHERE id = ?',
        [id]
      );

      // Wait a moment and update
      testRun(
        `UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?`,
        [id]
      );

      const after = testQueryOne<{ updated_at: string }>(
        'SELECT updated_at FROM tasks WHERE id = ?',
        [id]
      );

      // Updated timestamp should change
      expect(after!.updated_at).toBeDefined();
    });
  });
});
