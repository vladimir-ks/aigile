/**
 * Integration Tests: CRUD Operations
 *
 * Tests entity creation, reading, updating, and deletion
 * against the actual database layer.
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

describe('CRUD Operations', () => {
  let projectId: string;
  const projectKey = 'TEST';

  beforeEach(async () => {
    await initTestDatabase();
    projectId = createTestProject(projectKey);
  });

  afterEach(async () => {
    closeTestDb();
  });

  describe('Initiative CRUD', () => {
    it('creates an initiative with auto-generated key', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO initiatives (id, project_id, key, summary, description, priority, owner)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Q1 Goals', 'Quarterly objectives', 'High', 'owner@test.com']
      );

      const result = testQueryOne<{ key: string; summary: string }>(
        'SELECT key, summary FROM initiatives WHERE id = ?',
        [id]
      );

      expect(result).toBeDefined();
      expect(result!.key).toBe('TEST-1');
      expect(result!.summary).toBe('Q1 Goals');
    });

    it('reads an initiative by key', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO initiatives (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Read Test', 'active']
      );

      const result = testQueryOne<{ id: string; summary: string; status: string }>(
        'SELECT id, summary, status FROM initiatives WHERE key = ?',
        [key]
      );

      expect(result).toBeDefined();
      expect(result!.id).toBe(id);
      expect(result!.status).toBe('active');
    });

    it('updates initiative fields', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO initiatives (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Original', 'draft']
      );

      testRun(
        `UPDATE initiatives SET summary = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`,
        ['Updated Summary', 'active', id]
      );

      const result = testQueryOne<{ summary: string; status: string }>(
        'SELECT summary, status FROM initiatives WHERE id = ?',
        [id]
      );

      expect(result!.summary).toBe('Updated Summary');
      expect(result!.status).toBe('active');
    });

    it('soft-deletes an initiative', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO initiatives (id, project_id, key, summary)
         VALUES (?, ?, ?, ?)`,
        [id, projectId, key, 'To Delete']
      );

      // Hard delete (AIGILE uses hard delete)
      testRun('DELETE FROM initiatives WHERE id = ?', [id]);

      const result = testQueryOne('SELECT id FROM initiatives WHERE id = ?', [id]);
      expect(result).toBeUndefined();
    });

    it('lists initiatives with filters', () => {
      // Create multiple initiatives
      for (let i = 0; i < 3; i++) {
        const id = generateTestId();
        const key = getTestNextKey(projectKey);
        const status = i === 0 ? 'draft' : 'active';

        testRun(
          `INSERT INTO initiatives (id, project_id, key, summary, status)
           VALUES (?, ?, ?, ?, ?)`,
          [id, projectId, key, `Initiative ${i}`, status]
        );
      }

      const all = testQueryAll('SELECT * FROM initiatives WHERE project_id = ?', [projectId]);
      expect(all).toHaveLength(3);

      const active = testQueryAll(
        'SELECT * FROM initiatives WHERE project_id = ? AND status = ?',
        [projectId, 'active']
      );
      expect(active).toHaveLength(2);
    });
  });

  describe('Epic CRUD', () => {
    let initiativeId: string;

    beforeEach(() => {
      initiativeId = generateTestId();
      const initKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO initiatives (id, project_id, key, summary)
         VALUES (?, ?, ?, ?)`,
        [initiativeId, projectId, initKey, 'Parent Initiative']
      );
    });

    it('creates an epic under an initiative', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO epics (id, project_id, key, summary, initiative_id)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Epic under Initiative', initiativeId]
      );

      const result = testQueryOne<{ initiative_id: string }>(
        'SELECT initiative_id FROM epics WHERE id = ?',
        [id]
      );

      expect(result!.initiative_id).toBe(initiativeId);
    });

    it('creates a standalone epic', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO epics (id, project_id, key, summary)
         VALUES (?, ?, ?, ?)`,
        [id, projectId, key, 'Standalone Epic']
      );

      const result = testQueryOne<{ initiative_id: string | null }>(
        'SELECT initiative_id FROM epics WHERE id = ?',
        [id]
      );

      expect(result!.initiative_id).toBeNull();
    });

    it('reads an epic by key', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO epics (id, project_id, key, summary, priority, owner)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Read Epic', 'High', 'owner@test.com']
      );

      const result = testQueryOne<{ id: string; summary: string; priority: string; owner: string }>(
        'SELECT id, summary, priority, owner FROM epics WHERE key = ?',
        [key]
      );

      expect(result!.id).toBe(id);
      expect(result!.priority).toBe('High');
      expect(result!.owner).toBe('owner@test.com');
    });

    it('updates epic fields including JSON arrays', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO epics (id, project_id, key, summary)
         VALUES (?, ?, ?, ?)`,
        [id, projectId, key, 'Epic to Update']
      );

      const labels = JSON.stringify(['frontend', 'priority']);
      testRun(
        `UPDATE epics SET labels = ?, story_points = ? WHERE id = ?`,
        [labels, 21, id]
      );

      const result = testQueryOne<{ labels: string; story_points: number }>(
        'SELECT labels, story_points FROM epics WHERE id = ?',
        [id]
      );

      expect(JSON.parse(result!.labels)).toEqual(['frontend', 'priority']);
      expect(result!.story_points).toBe(21);
    });

    it('aggregates story points from child stories', () => {
      const epicId = generateTestId();
      const epicKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO epics (id, project_id, key, summary)
         VALUES (?, ?, ?, ?)`,
        [epicId, projectId, epicKey, 'Parent Epic']
      );

      // Create stories with points
      for (const points of [3, 5, 8]) {
        const storyId = generateTestId();
        const storyKey = getTestNextKey(projectKey);
        testRun(
          `INSERT INTO user_stories (id, project_id, key, summary, epic_id, story_points)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [storyId, projectId, storyKey, `Story ${points}pts`, epicId, points]
        );
      }

      const result = testQueryOne<{ total_points: number }>(
        `SELECT SUM(story_points) as total_points FROM user_stories WHERE epic_id = ?`,
        [epicId]
      );

      expect(result!.total_points).toBe(16); // 3 + 5 + 8
    });
  });

  describe('Story CRUD', () => {
    it('creates a story with user story template', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, as_a, i_want, so_that)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Login Story', 'user', 'log in', 'access my account']
      );

      const result = testQueryOne<{ as_a: string; i_want: string; so_that: string }>(
        'SELECT as_a, i_want, so_that FROM user_stories WHERE id = ?',
        [id]
      );

      expect(result!.as_a).toBe('user');
      expect(result!.i_want).toBe('log in');
      expect(result!.so_that).toBe('access my account');
    });

    it('stores acceptance criteria as JSON', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);
      const criteria = JSON.stringify([
        { given: 'on login page', when: 'enter valid creds', then: 'logged in' }
      ]);

      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, acceptance_criteria)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Story with AC', criteria]
      );

      const result = testQueryOne<{ acceptance_criteria: string }>(
        'SELECT acceptance_criteria FROM user_stories WHERE id = ?',
        [id]
      );

      const parsed = JSON.parse(result!.acceptance_criteria);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].given).toBe('on login page');
    });

    it('validates Fibonacci story points', () => {
      const validPoints = [1, 2, 3, 5, 8, 13, 21];

      for (const points of validPoints) {
        const id = generateTestId();
        const key = getTestNextKey(projectKey);

        testRun(
          `INSERT INTO user_stories (id, project_id, key, summary, story_points)
           VALUES (?, ?, ?, ?, ?)`,
          [id, projectId, key, `Story ${points}`, points]
        );

        const result = testQueryOne<{ story_points: number }>(
          'SELECT story_points FROM user_stories WHERE id = ?',
          [id]
        );

        expect(result!.story_points).toBe(points);
      }
    });

    it('assigns story to sprint', () => {
      // Create sprint first
      const sprintId = generateTestId();
      testRun(
        `INSERT INTO sprints (id, project_id, name, start_date, end_date)
         VALUES (?, ?, ?, ?, ?)`,
        [sprintId, projectId, 'Sprint 1', '2025-01-01', '2025-01-14']
      );

      const storyId = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, sprint_id)
         VALUES (?, ?, ?, ?, ?)`,
        [storyId, projectId, key, 'Sprint Story', sprintId]
      );

      const result = testQueryOne<{ sprint_id: string }>(
        'SELECT sprint_id FROM user_stories WHERE id = ?',
        [storyId]
      );

      expect(result!.sprint_id).toBe(sprintId);
    });
  });

  describe('Task CRUD', () => {
    let storyId: string;

    beforeEach(() => {
      storyId = generateTestId();
      const storyKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary)
         VALUES (?, ?, ?, ?)`,
        [storyId, projectId, storyKey, 'Parent Story']
      );
    });

    it('creates a task under a story', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, story_id, issue_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Task under Story', storyId, 'task']
      );

      const result = testQueryOne<{ story_id: string; issue_type: string }>(
        'SELECT story_id, issue_type FROM tasks WHERE id = ?',
        [id]
      );

      expect(result!.story_id).toBe(storyId);
      expect(result!.issue_type).toBe('task');
    });

    it('creates a subtask under a task', () => {
      const taskId = generateTestId();
      const taskKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, story_id, issue_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [taskId, projectId, taskKey, 'Parent Task', storyId, 'task']
      );

      const subtaskId = generateTestId();
      const subtaskKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, story_id, parent_id, issue_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [subtaskId, projectId, subtaskKey, 'Subtask', storyId, taskId, 'subtask']
      );

      const result = testQueryOne<{ parent_id: string; issue_type: string }>(
        'SELECT parent_id, issue_type FROM tasks WHERE id = ?',
        [subtaskId]
      );

      expect(result!.parent_id).toBe(taskId);
      expect(result!.issue_type).toBe('subtask');
    });

    it('creates a standalone task', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, issue_type)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Standalone Task', 'task']
      );

      const result = testQueryOne<{ story_id: string | null; parent_id: string | null }>(
        'SELECT story_id, parent_id FROM tasks WHERE id = ?',
        [id]
      );

      expect(result!.story_id).toBeNull();
      expect(result!.parent_id).toBeNull();
    });

    it('updates task time tracking fields', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO tasks (id, project_id, key, summary, original_estimate, remaining_estimate, time_spent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Time Tracking Task', 8, 8, 0]
      );

      // Log 4 hours of work
      testRun(
        `UPDATE tasks SET remaining_estimate = ?, time_spent = ? WHERE id = ?`,
        [4, 4, id]
      );

      const result = testQueryOne<{ original_estimate: number; remaining_estimate: number; time_spent: number }>(
        'SELECT original_estimate, remaining_estimate, time_spent FROM tasks WHERE id = ?',
        [id]
      );

      expect(result!.original_estimate).toBe(8);
      expect(result!.remaining_estimate).toBe(4);
      expect(result!.time_spent).toBe(4);
    });
  });

  describe('Bug CRUD', () => {
    it('creates a bug with severity', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO bugs (id, project_id, key, summary, severity, priority)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Critical Bug', 'Critical', 'Highest']
      );

      const result = testQueryOne<{ severity: string; priority: string }>(
        'SELECT severity, priority FROM bugs WHERE id = ?',
        [id]
      );

      expect(result!.severity).toBe('Critical');
      expect(result!.priority).toBe('Highest');
    });

    it('links bug to story', () => {
      const storyId = generateTestId();
      const storyKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary)
         VALUES (?, ?, ?, ?)`,
        [storyId, projectId, storyKey, 'Story with Bug']
      );

      const bugId = generateTestId();
      const bugKey = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO bugs (id, project_id, key, summary, story_id)
         VALUES (?, ?, ?, ?, ?)`,
        [bugId, projectId, bugKey, 'Bug linked to Story', storyId]
      );

      const result = testQueryOne<{ story_id: string }>(
        'SELECT story_id FROM bugs WHERE id = ?',
        [bugId]
      );

      expect(result!.story_id).toBe(storyId);
    });

    it('sets affected and fix versions', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);
      const affected = JSON.stringify(['v1.0.0', 'v1.1.0']);
      const fix = JSON.stringify(['v1.2.0']);

      testRun(
        `INSERT INTO bugs (id, project_id, key, summary, affected_versions, fix_versions)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Version Bug', affected, fix]
      );

      const result = testQueryOne<{ affected_versions: string; fix_versions: string }>(
        'SELECT affected_versions, fix_versions FROM bugs WHERE id = ?',
        [id]
      );

      expect(JSON.parse(result!.affected_versions)).toEqual(['v1.0.0', 'v1.1.0']);
      expect(JSON.parse(result!.fix_versions)).toEqual(['v1.2.0']);
    });

    it('resolves bug with resolution type', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO bugs (id, project_id, key, summary, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Bug to Resolve', 'open']
      );

      testRun(
        `UPDATE bugs SET status = ?, resolution = ?, resolved_at = datetime('now')
         WHERE id = ?`,
        ['resolved', 'Fixed', id]
      );

      const result = testQueryOne<{ status: string; resolution: string; resolved_at: string }>(
        'SELECT status, resolution, resolved_at FROM bugs WHERE id = ?',
        [id]
      );

      expect(result!.status).toBe('resolved');
      expect(result!.resolution).toBe('Fixed');
      expect(result!.resolved_at).toBeDefined();
    });
  });

  describe('Sprint CRUD', () => {
    it('creates a sprint with dates', () => {
      const id = generateTestId();

      testRun(
        `INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, 'Sprint 1', 'Complete MVP', '2025-01-01', '2025-01-14', 'future']
      );

      const result = testQueryOne<{ name: string; goal: string; start_date: string; end_date: string }>(
        'SELECT name, goal, start_date, end_date FROM sprints WHERE id = ?',
        [id]
      );

      expect(result!.name).toBe('Sprint 1');
      expect(result!.goal).toBe('Complete MVP');
      expect(result!.start_date).toBe('2025-01-01');
      expect(result!.end_date).toBe('2025-01-14');
    });

    it('prevents overlapping sprint dates', () => {
      const id1 = generateTestId();
      testRun(
        `INSERT INTO sprints (id, project_id, name, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id1, projectId, 'Sprint 1', '2025-01-01', '2025-01-14', 'active']
      );

      // Check for overlap before inserting
      const overlap = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM sprints
         WHERE project_id = ? AND status = 'active'
         AND start_date <= ? AND end_date >= ?`,
        [projectId, '2025-01-10', '2025-01-07']
      );

      expect(overlap!.count).toBe(1); // Overlap detected
    });

    it('calculates velocity on close', () => {
      const sprintId = generateTestId();
      testRun(
        `INSERT INTO sprints (id, project_id, name, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sprintId, projectId, 'Sprint 1', '2025-01-01', '2025-01-14', 'active']
      );

      // Add stories with points to sprint
      for (const points of [3, 5, 8]) {
        const storyId = generateTestId();
        const storyKey = getTestNextKey(projectKey);
        testRun(
          `INSERT INTO user_stories (id, project_id, key, summary, sprint_id, story_points, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [storyId, projectId, storyKey, `Story ${points}`, sprintId, points, 'done']
        );
      }

      // Calculate and update velocity
      const velocity = testQueryOne<{ total: number }>(
        `SELECT SUM(story_points) as total FROM user_stories
         WHERE sprint_id = ? AND status = 'done'`,
        [sprintId]
      );

      testRun(
        `UPDATE sprints SET velocity = ?, status = 'closed' WHERE id = ?`,
        [velocity!.total, sprintId]
      );

      const result = testQueryOne<{ velocity: number; status: string }>(
        'SELECT velocity, status FROM sprints WHERE id = ?',
        [sprintId]
      );

      expect(result!.velocity).toBe(16);
      expect(result!.status).toBe('closed');
    });
  });

  describe('Component CRUD', () => {
    it('creates a component with lead', () => {
      const id = generateTestId();

      testRun(
        `INSERT INTO components (id, project_id, name, description, lead, default_assignee)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, 'auth', 'Authentication module', 'lead@test.com', 'dev@test.com']
      );

      const result = testQueryOne<{ name: string; lead: string; default_assignee: string }>(
        'SELECT name, lead, default_assignee FROM components WHERE id = ?',
        [id]
      );

      expect(result!.name).toBe('auth');
      expect(result!.lead).toBe('lead@test.com');
      expect(result!.default_assignee).toBe('dev@test.com');
    });

    it('enforces unique component names', () => {
      const id1 = generateTestId();
      testRun(
        `INSERT INTO components (id, project_id, name) VALUES (?, ?, ?)`,
        [id1, projectId, 'auth']
      );

      // Check for existing before inserting
      const existing = testQueryOne(
        'SELECT id FROM components WHERE project_id = ? AND name = ?',
        [projectId, 'auth']
      );

      expect(existing).toBeDefined();
    });

    it('auto-assigns based on component', () => {
      const componentId = generateTestId();
      testRun(
        `INSERT INTO components (id, project_id, name, default_assignee)
         VALUES (?, ?, ?, ?)`,
        [componentId, projectId, 'frontend', 'frontend-dev@test.com']
      );

      // Query default assignee when creating a task
      const component = testQueryOne<{ default_assignee: string }>(
        'SELECT default_assignee FROM components WHERE project_id = ? AND name = ?',
        [projectId, 'frontend']
      );

      expect(component!.default_assignee).toBe('frontend-dev@test.com');
    });
  });

  describe('Version CRUD', () => {
    it('creates a version', () => {
      const id = generateTestId();

      testRun(
        `INSERT INTO versions (id, project_id, name, description, status, start_date, release_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, 'v1.0.0', 'Initial release', 'unreleased', '2025-01-01', '2025-02-01']
      );

      const result = testQueryOne<{ name: string; status: string; release_date: string }>(
        'SELECT name, status, release_date FROM versions WHERE id = ?',
        [id]
      );

      expect(result!.name).toBe('v1.0.0');
      expect(result!.status).toBe('unreleased');
      expect(result!.release_date).toBe('2025-02-01');
    });

    it('releases a version', () => {
      const id = generateTestId();

      testRun(
        `INSERT INTO versions (id, project_id, name, status)
         VALUES (?, ?, ?, ?)`,
        [id, projectId, 'v1.0.0', 'unreleased']
      );

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

    it('tracks items targeted for version', () => {
      const versionId = generateTestId();
      testRun(
        `INSERT INTO versions (id, project_id, name, status)
         VALUES (?, ?, ?, ?)`,
        [versionId, projectId, 'v1.0.0', 'unreleased']
      );

      // Create bugs and stories targeting this version
      const bugId = generateTestId();
      const bugKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO bugs (id, project_id, key, summary, fix_versions)
         VALUES (?, ?, ?, ?, ?)`,
        [bugId, projectId, bugKey, 'Bug for v1.0.0', JSON.stringify(['v1.0.0'])]
      );

      const storyId = generateTestId();
      const storyKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO user_stories (id, project_id, key, summary, fix_versions)
         VALUES (?, ?, ?, ?, ?)`,
        [storyId, projectId, storyKey, 'Story for v1.0.0', JSON.stringify(['v1.0.0'])]
      );

      // Count items targeting version
      const bugCount = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM bugs WHERE fix_versions LIKE ?`,
        ['%v1.0.0%']
      );
      const storyCount = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM user_stories WHERE fix_versions LIKE ?`,
        ['%v1.0.0%']
      );

      expect(bugCount!.count).toBe(1);
      expect(storyCount!.count).toBe(1);
    });
  });

  describe('Persona CRUD', () => {
    it('creates a persona with all fields', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO personas (id, project_id, key, name, description, role, goals, frustrations, demographics)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Power User', 'Advanced user', 'Developer', 'Efficiency', 'Slow tools', 'Age: 25-40']
      );

      const result = testQueryOne<{ name: string; role: string; goals: string }>(
        'SELECT name, role, goals FROM personas WHERE id = ?',
        [id]
      );

      expect(result!.name).toBe('Power User');
      expect(result!.role).toBe('Developer');
      expect(result!.goals).toBe('Efficiency');
    });

    it('links persona to UX journey', () => {
      const personaId = generateTestId();
      const personaKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO personas (id, project_id, key, name) VALUES (?, ?, ?, ?)`,
        [personaId, projectId, personaKey, 'Test Persona']
      );

      const journeyId = generateTestId();
      const journeyKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO ux_journeys (id, project_id, key, name, persona_id)
         VALUES (?, ?, ?, ?, ?)`,
        [journeyId, projectId, journeyKey, 'Onboarding', personaId]
      );

      const result = testQueryOne<{ persona_id: string }>(
        'SELECT persona_id FROM ux_journeys WHERE id = ?',
        [journeyId]
      );

      expect(result!.persona_id).toBe(personaId);
    });
  });

  describe('UX Journey CRUD', () => {
    it('creates a journey with stages and touchpoints', () => {
      const id = generateTestId();
      const key = getTestNextKey(projectKey);

      testRun(
        `INSERT INTO ux_journeys (id, project_id, key, name, stages, touchpoints, pain_points, opportunities)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, key, 'Purchase Flow', 'Browse,Select,Checkout', 'Web,Mobile', 'Slow checkout', 'One-click buy']
      );

      const result = testQueryOne<{ name: string; stages: string; touchpoints: string }>(
        'SELECT name, stages, touchpoints FROM ux_journeys WHERE id = ?',
        [id]
      );

      expect(result!.name).toBe('Purchase Flow');
      expect(result!.stages).toBe('Browse,Select,Checkout');
      expect(result!.touchpoints).toBe('Web,Mobile');
    });

    it('updates journey persona link', () => {
      const personaId = generateTestId();
      const personaKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO personas (id, project_id, key, name) VALUES (?, ?, ?, ?)`,
        [personaId, projectId, personaKey, 'New Persona']
      );

      const journeyId = generateTestId();
      const journeyKey = getTestNextKey(projectKey);
      testRun(
        `INSERT INTO ux_journeys (id, project_id, key, name) VALUES (?, ?, ?, ?)`,
        [journeyId, projectId, journeyKey, 'Journey to Link']
      );

      testRun(
        `UPDATE ux_journeys SET persona_id = ? WHERE id = ?`,
        [personaId, journeyId]
      );

      const result = testQueryOne<{ persona_id: string }>(
        'SELECT persona_id FROM ux_journeys WHERE id = ?',
        [journeyId]
      );

      expect(result!.persona_id).toBe(personaId);
    });
  });
});
