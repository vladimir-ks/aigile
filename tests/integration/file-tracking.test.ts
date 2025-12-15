/**
 * Integration Tests: File Tracking & Coverage
 *
 * Tests chunk management, file tagging, coverage stats,
 * and session resume capabilities.
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
  createTestProject,
  createTestSession,
  createTestDocument,
  createTestChunk
} from '../helpers/test-db.js';

describe('File Tracking & Coverage', () => {
  let projectId: string;
  let sessionId: string;

  beforeEach(async () => {
    await initTestDatabase();
    projectId = createTestProject('TEST');
    sessionId = createTestSession(projectId, 'init-test-session');
  });

  afterEach(async () => {
    closeTestDb();
  });

  describe('Session Management', () => {
    it('creates session with name', () => {
      const result = testQueryOne<{ name: string; status: string }>(
        'SELECT name, status FROM sessions WHERE id = ?',
        [sessionId]
      );
      expect(result?.name).toBe('init-test-session');
      expect(result?.status).toBe('active');
    });

    it('creates session without name', () => {
      const noNameSessionId = createTestSession(projectId);
      const result = testQueryOne<{ name: string | null; status: string }>(
        'SELECT name, status FROM sessions WHERE id = ?',
        [noNameSessionId]
      );
      expect(result?.name).toBeNull();
      expect(result?.status).toBe('active');
    });

    it('finds session by name', () => {
      const result = testQueryOne<{ id: string; name: string }>(
        'SELECT id, name FROM sessions WHERE project_id = ? AND name = ?',
        [projectId, 'init-test-session']
      );
      expect(result?.id).toBe(sessionId);
      expect(result?.name).toBe('init-test-session');
    });
  });

  describe('Chunk Management', () => {
    it('creates chunk with assigned files', () => {
      const chunkId = createTestChunk(sessionId, 'chunk-001', 'CLI Commands', [
        'src/commands/epic.ts',
        'src/commands/story.ts'
      ]);

      const result = testQueryOne<{ id: string; name: string; assigned_files: string }>(
        'SELECT id, name, assigned_files FROM chunks WHERE id = ?',
        [chunkId]
      );

      expect(result?.id).toBe('chunk-001');
      expect(result?.name).toBe('CLI Commands');
      expect(JSON.parse(result?.assigned_files ?? '[]')).toEqual([
        'src/commands/epic.ts',
        'src/commands/story.ts'
      ]);
    });

    it('creates multiple chunks in same session', () => {
      createTestChunk(sessionId, 'chunk-001', 'CLI Commands');
      createTestChunk(sessionId, 'chunk-002', 'Services');
      createTestChunk(sessionId, 'chunk-003', 'Database');

      const results = testQueryAll<{ id: string }>(
        'SELECT id FROM chunks WHERE session_id = ?',
        [sessionId]
      );
      expect(results.length).toBe(3);
    });

    it('lists chunks by session', () => {
      createTestChunk(sessionId, 'chunk-001', 'CLI Commands');

      // Create another session with different chunks
      const otherSessionId = createTestSession(projectId, 'other-session');
      createTestChunk(otherSessionId, 'chunk-002', 'Other Chunk');

      const results = testQueryAll<{ id: string }>(
        'SELECT id FROM chunks WHERE session_id = ?',
        [sessionId]
      );
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('chunk-001');
    });
  });

  describe('File Tagging', () => {
    let docId1: string;
    let docId2: string;
    let chunkId: string;

    beforeEach(() => {
      docId1 = createTestDocument(projectId, 'src/commands/epic.ts');
      docId2 = createTestDocument(projectId, 'src/commands/story.ts');
      chunkId = createTestChunk(sessionId, 'chunk-001', 'CLI Commands', [
        'src/commands/epic.ts',
        'src/commands/story.ts'
      ]);
    });

    it('tags file as reviewed', () => {
      const tagId = generateTestId();
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, chunk_id, review_type)
         VALUES (?, ?, ?, ?, 'assigned')`,
        [tagId, sessionId, docId1, chunkId]
      );

      const result = testQueryOne<{ review_type: string; chunk_id: string }>(
        'SELECT review_type, chunk_id FROM session_files WHERE id = ?',
        [tagId]
      );
      expect(result?.review_type).toBe('assigned');
      expect(result?.chunk_id).toBe(chunkId);
    });

    it('prevents duplicate tagging (UNIQUE constraint)', () => {
      const tagId1 = generateTestId();
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type)
         VALUES (?, ?, ?, 'assigned')`,
        [tagId1, sessionId, docId1]
      );

      // Second insert with same session_id + document_id should fail
      expect(() => {
        const tagId2 = generateTestId();
        testRun(
          `INSERT INTO session_files (id, session_id, document_id, review_type)
           VALUES (?, ?, ?, 'assigned')`,
          [tagId2, sessionId, docId1]
        );
      }).toThrow();
    });

    it('allows same file in different sessions', () => {
      const otherSessionId = createTestSession(projectId, 'other-session');

      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type)
         VALUES (?, ?, ?, 'assigned')`,
        [generateTestId(), sessionId, docId1]
      );

      // Same document in different session should succeed
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type)
         VALUES (?, ?, ?, 'assigned')`,
        [generateTestId(), otherSessionId, docId1]
      );

      const results = testQueryAll<{ session_id: string }>(
        'SELECT session_id FROM session_files WHERE document_id = ?',
        [docId1]
      );
      expect(results.length).toBe(2);
    });

    it('tags file as foundational', () => {
      const tagId = generateTestId();
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, is_foundational, review_type)
         VALUES (?, ?, ?, 1, 'assigned')`,
        [tagId, sessionId, docId1]
      );

      const result = testQueryOne<{ is_foundational: number }>(
        'SELECT is_foundational FROM session_files WHERE id = ?',
        [tagId]
      );
      expect(result?.is_foundational).toBe(1);
    });

    it('supports different review types', () => {
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type)
         VALUES (?, ?, ?, 'assigned')`,
        [generateTestId(), sessionId, docId1]
      );
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type)
         VALUES (?, ?, ?, 'explored')`,
        [generateTestId(), sessionId, docId2]
      );

      const assigned = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM session_files WHERE session_id = ? AND review_type = 'assigned'`,
        [sessionId]
      );
      const explored = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM session_files WHERE session_id = ? AND review_type = 'explored'`,
        [sessionId]
      );

      expect(assigned?.count).toBe(1);
      expect(explored?.count).toBe(1);
    });
  });

  describe('Coverage Statistics', () => {
    let chunkId: string;

    beforeEach(() => {
      // Create chunk with 3 assigned files
      chunkId = createTestChunk(sessionId, 'chunk-001', 'CLI Commands', [
        'src/commands/epic.ts',
        'src/commands/story.ts',
        'src/commands/task.ts'
      ]);

      // Create documents for all files
      createTestDocument(projectId, 'src/commands/epic.ts');
      createTestDocument(projectId, 'src/commands/story.ts');
      createTestDocument(projectId, 'src/commands/task.ts');
    });

    it('calculates assigned file count from chunk', () => {
      const chunk = testQueryOne<{ assigned_files: string }>(
        'SELECT assigned_files FROM chunks WHERE id = ?',
        [chunkId]
      );
      const assignedFiles = JSON.parse(chunk?.assigned_files ?? '[]');
      expect(assignedFiles.length).toBe(3);
    });

    it('counts reviewed files by type', () => {
      const doc1 = testQueryOne<{ id: string }>('SELECT id FROM documents WHERE path = ?', ['src/commands/epic.ts']);
      const doc2 = testQueryOne<{ id: string }>('SELECT id FROM documents WHERE path = ?', ['src/commands/story.ts']);

      // Tag 2 of 3 files as assigned
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, chunk_id, review_type)
         VALUES (?, ?, ?, ?, 'assigned')`,
        [generateTestId(), sessionId, doc1!.id, chunkId]
      );
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, chunk_id, review_type)
         VALUES (?, ?, ?, ?, 'assigned')`,
        [generateTestId(), sessionId, doc2!.id, chunkId]
      );

      const assigned = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM session_files
         WHERE session_id = ? AND chunk_id = ? AND review_type = 'assigned'`,
        [sessionId, chunkId]
      );

      expect(assigned?.count).toBe(2); // 2 of 3 assigned files tagged
    });

    it('aggregates coverage across multiple chunks', () => {
      // Create second chunk
      const chunk2Id = createTestChunk(sessionId, 'chunk-002', 'Services', [
        'src/services/workflow.ts',
        'src/services/output.ts'
      ]);

      // Both chunks have assigned files
      const chunk1 = testQueryOne<{ assigned_files: string }>('SELECT assigned_files FROM chunks WHERE id = ?', [chunkId]);
      const chunk2 = testQueryOne<{ assigned_files: string }>('SELECT assigned_files FROM chunks WHERE id = ?', [chunk2Id]);

      const total = JSON.parse(chunk1?.assigned_files ?? '[]').length +
                    JSON.parse(chunk2?.assigned_files ?? '[]').length;
      expect(total).toBe(5); // 3 + 2
    });
  });

  describe('Quality Flagging', () => {
    it('stores quality issues as JSON', () => {
      const docId = createTestDocument(projectId, 'src/commands/epic.ts');
      const tagId = generateTestId();

      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type, quality_issues)
         VALUES (?, ?, ?, 'assigned', ?)`,
        [tagId, sessionId, docId, JSON.stringify(['duplicate:src/commands/story.ts', 'note:Similar structure'])]
      );

      const result = testQueryOne<{ quality_issues: string }>(
        'SELECT quality_issues FROM session_files WHERE id = ?',
        [tagId]
      );

      const issues = JSON.parse(result?.quality_issues ?? '[]');
      expect(issues).toContain('duplicate:src/commands/story.ts');
      expect(issues).toContain('note:Similar structure');
    });

    it('queries files with quality issues', () => {
      const doc1 = createTestDocument(projectId, 'src/a.ts');
      const doc2 = createTestDocument(projectId, 'src/b.ts');

      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type, quality_issues)
         VALUES (?, ?, ?, 'assigned', ?)`,
        [generateTestId(), sessionId, doc1, JSON.stringify(['duplicate:src/b.ts'])]
      );
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type)
         VALUES (?, ?, ?, 'assigned')`,
        [generateTestId(), sessionId, doc2]
      );

      const withIssues = testQueryAll<{ document_id: string }>(
        `SELECT document_id FROM session_files
         WHERE session_id = ? AND quality_issues IS NOT NULL AND quality_issues != '[]'`,
        [sessionId]
      );

      expect(withIssues.length).toBe(1);
      expect(withIssues[0].document_id).toBe(doc1);
    });
  });

  describe('Session Isolation', () => {
    it('keeps chunks isolated between sessions', () => {
      const session1 = sessionId;
      const session2 = createTestSession(projectId, 'session-2');

      createTestChunk(session1, 'chunk-001', 'Session 1 Chunk');
      createTestChunk(session2, 'chunk-002', 'Session 2 Chunk');

      const s1Chunks = testQueryAll<{ id: string }>('SELECT id FROM chunks WHERE session_id = ?', [session1]);
      const s2Chunks = testQueryAll<{ id: string }>('SELECT id FROM chunks WHERE session_id = ?', [session2]);

      expect(s1Chunks.length).toBe(1);
      expect(s2Chunks.length).toBe(1);
      expect(s1Chunks[0].id).toBe('chunk-001');
      expect(s2Chunks[0].id).toBe('chunk-002');
    });

    it('keeps session_files isolated between sessions', () => {
      const session1 = sessionId;
      const session2 = createTestSession(projectId, 'session-2');
      const docId = createTestDocument(projectId, 'src/shared.ts');

      // Same file tagged in both sessions
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type)
         VALUES (?, ?, ?, 'assigned')`,
        [generateTestId(), session1, docId]
      );
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, review_type)
         VALUES (?, ?, ?, 'explored')`,
        [generateTestId(), session2, docId]
      );

      const s1Tags = testQueryOne<{ review_type: string }>(
        'SELECT review_type FROM session_files WHERE session_id = ? AND document_id = ?',
        [session1, docId]
      );
      const s2Tags = testQueryOne<{ review_type: string }>(
        'SELECT review_type FROM session_files WHERE session_id = ? AND document_id = ?',
        [session2, docId]
      );

      expect(s1Tags?.review_type).toBe('assigned');
      expect(s2Tags?.review_type).toBe('explored');
    });
  });

  describe('Resume Capability', () => {
    it('can query active sessions for a project', () => {
      // Current session is active
      const activeSessions = testQueryAll<{ id: string; name: string }>(
        `SELECT id, name FROM sessions WHERE project_id = ? AND status = 'active'`,
        [projectId]
      );
      expect(activeSessions.length).toBe(1);
      expect(activeSessions[0].name).toBe('init-test-session');
    });

    it('can find incomplete session by name', () => {
      // Mark session as in-progress (not completed)
      testRun(`UPDATE sessions SET status = 'active' WHERE id = ?`, [sessionId]);

      const session = testQueryOne<{ id: string; status: string }>(
        `SELECT id, status FROM sessions WHERE project_id = ? AND name = ? AND status != 'completed'`,
        [projectId, 'init-test-session']
      );

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
    });

    it('preserves chunk data for resume', () => {
      createTestChunk(sessionId, 'chunk-001', 'CLI Commands', ['src/a.ts', 'src/b.ts']);

      // Simulate resume: query chunks for session
      const chunks = testQueryAll<{ id: string; name: string; assigned_files: string }>(
        'SELECT id, name, assigned_files FROM chunks WHERE session_id = ?',
        [sessionId]
      );

      expect(chunks.length).toBe(1);
      expect(chunks[0].id).toBe('chunk-001');
      expect(JSON.parse(chunks[0].assigned_files)).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('can determine coverage state for resume', () => {
      const chunkId = createTestChunk(sessionId, 'chunk-001', 'CLI Commands', [
        'src/a.ts',
        'src/b.ts',
        'src/c.ts'
      ]);

      const docA = createTestDocument(projectId, 'src/a.ts');
      createTestDocument(projectId, 'src/b.ts');
      createTestDocument(projectId, 'src/c.ts');

      // Only tag 1 of 3 files
      testRun(
        `INSERT INTO session_files (id, session_id, document_id, chunk_id, review_type)
         VALUES (?, ?, ?, ?, 'assigned')`,
        [generateTestId(), sessionId, docA, chunkId]
      );

      // Query coverage
      const chunk = testQueryOne<{ assigned_files: string }>('SELECT assigned_files FROM chunks WHERE id = ?', [chunkId]);
      const totalAssigned = JSON.parse(chunk?.assigned_files ?? '[]').length;

      const reviewed = testQueryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM session_files WHERE session_id = ? AND chunk_id = ? AND review_type = 'assigned'`,
        [sessionId, chunkId]
      );

      expect(totalAssigned).toBe(3);
      expect(reviewed?.count).toBe(1);
      // Resume should see: 1/3 assigned reviewed, need to review 2 more
    });
  });
});
