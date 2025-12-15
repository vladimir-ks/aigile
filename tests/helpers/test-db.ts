/**
 * Test Database Helper
 *
 * Provides in-memory SQLite database for tests without file I/O.
 *
 * @author Vladimir K.S.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

let testDb: SqlJsDatabase | null = null;

/**
 * Initialize in-memory test database
 */
export async function initTestDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  testDb = new SQL.Database();
  initializeSchema(testDb);
  return testDb;
}

/**
 * Get test database instance
 */
export function getTestDb(): SqlJsDatabase {
  if (!testDb) {
    throw new Error('Test database not initialized. Call initTestDatabase() first.');
  }
  return testDb;
}

/**
 * Close test database
 */
export function closeTestDb(): void {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
}

/**
 * Query all results
 */
export function testQueryAll<T>(sql: string, params: unknown[] = []): T[] {
  const db = getTestDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row as T);
  }
  stmt.free();

  return results;
}

/**
 * Query one result
 */
export function testQueryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const results = testQueryAll<T>(sql, params);
  return results[0];
}

/**
 * Run a statement
 */
export function testRun(sql: string, params: unknown[] = []): void {
  const db = getTestDb();
  db.run(sql, params);
}

/**
 * Generate UUID
 */
export function generateTestId(): string {
  return crypto.randomUUID();
}

/**
 * Get next key for a project
 */
export function getTestNextKey(projectKey: string): string {
  const row = testQueryOne<{ current_value: number }>(
    'SELECT current_value FROM key_sequences WHERE prefix = ?',
    [projectKey]
  );

  const nextValue = (row?.current_value ?? 0) + 1;

  if (row) {
    testRun(
      `UPDATE key_sequences SET current_value = ?, updated_at = datetime('now') WHERE prefix = ?`,
      [nextValue, projectKey]
    );
  } else {
    testRun(
      `INSERT INTO key_sequences (id, prefix, current_value) VALUES (?, ?, ?)`,
      [generateTestId(), projectKey, nextValue]
    );
  }

  return `${projectKey}-${nextValue}`;
}

/**
 * Create test project
 */
export function createTestProject(key: string = 'TEST', name: string = 'Test Project'): string {
  const projectId = generateTestId();
  testRun(
    `INSERT INTO projects (id, key, name, path, is_default) VALUES (?, ?, ?, ?, 1)`,
    [projectId, key, name, '/tmp/test']
  );
  return projectId;
}

/**
 * Initialize database schema
 */
function initializeSchema(database: SqlJsDatabase): void {
  // Projects table
  database.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Key sequences table
  database.run(`
    CREATE TABLE IF NOT EXISTS key_sequences (
      id TEXT PRIMARY KEY,
      prefix TEXT NOT NULL UNIQUE,
      current_value INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Initiatives table
  database.run(`
    CREATE TABLE IF NOT EXISTS initiatives (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      key TEXT UNIQUE NOT NULL,
      summary TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft',
      priority TEXT DEFAULT 'Medium',
      owner TEXT,
      start_date TEXT,
      target_date TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Epics table
  database.run(`
    CREATE TABLE IF NOT EXISTS epics (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      key TEXT UNIQUE NOT NULL,
      summary TEXT NOT NULL,
      description TEXT,
      initiative_id TEXT REFERENCES initiatives(id),
      status TEXT DEFAULT 'backlog',
      priority TEXT DEFAULT 'Medium',
      owner TEXT,
      reporter TEXT,
      labels TEXT,
      components TEXT,
      fix_versions TEXT,
      story_points INTEGER,
      start_date TEXT,
      due_date TEXT,
      persona_ids TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // User stories table
  database.run(`
    CREATE TABLE IF NOT EXISTS user_stories (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      key TEXT UNIQUE NOT NULL,
      epic_id TEXT REFERENCES epics(id),
      summary TEXT NOT NULL,
      description TEXT,
      as_a TEXT,
      i_want TEXT,
      so_that TEXT,
      acceptance_criteria TEXT,
      status TEXT DEFAULT 'backlog',
      priority TEXT DEFAULT 'Medium',
      story_points INTEGER,
      assignee TEXT,
      reporter TEXT,
      labels TEXT,
      components TEXT,
      fix_versions TEXT,
      sprint_id TEXT REFERENCES sprints(id),
      due_date TEXT,
      original_estimate REAL,
      remaining_estimate REAL,
      time_spent REAL DEFAULT 0,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Tasks table
  database.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      key TEXT UNIQUE NOT NULL,
      story_id TEXT REFERENCES user_stories(id),
      parent_id TEXT REFERENCES tasks(id),
      issue_type TEXT DEFAULT 'task',
      summary TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'Medium',
      assignee TEXT,
      reporter TEXT,
      labels TEXT,
      components TEXT,
      sprint_id TEXT REFERENCES sprints(id),
      original_estimate REAL,
      remaining_estimate REAL,
      time_spent REAL DEFAULT 0,
      blocked_reason TEXT,
      due_date TEXT,
      resolved_at TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Bugs table
  database.run(`
    CREATE TABLE IF NOT EXISTS bugs (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      key TEXT UNIQUE NOT NULL,
      story_id TEXT REFERENCES user_stories(id),
      epic_id TEXT REFERENCES epics(id),
      summary TEXT NOT NULL,
      description TEXT,
      steps_to_reproduce TEXT,
      expected_behavior TEXT,
      actual_behavior TEXT,
      status TEXT DEFAULT 'open',
      priority TEXT DEFAULT 'Medium',
      severity TEXT DEFAULT 'Major',
      resolution TEXT,
      environment TEXT,
      affected_versions TEXT,
      fix_versions TEXT,
      assignee TEXT,
      reporter TEXT,
      labels TEXT,
      components TEXT,
      resolved_at TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Sprints table
  database.run(`
    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      name TEXT NOT NULL,
      goal TEXT,
      status TEXT DEFAULT 'future',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      velocity INTEGER,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Components table
  database.run(`
    CREATE TABLE IF NOT EXISTS components (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      name TEXT NOT NULL,
      description TEXT,
      lead TEXT,
      default_assignee TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Versions table
  database.run(`
    CREATE TABLE IF NOT EXISTS versions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'unreleased',
      start_date TEXT,
      release_date TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Personas table
  database.run(`
    CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      role TEXT,
      goals TEXT,
      frustrations TEXT,
      demographics TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // UX Journeys table
  database.run(`
    CREATE TABLE IF NOT EXISTS ux_journeys (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      persona_id TEXT REFERENCES personas(id),
      stages TEXT,
      touchpoints TEXT,
      pain_points TEXT,
      opportunities TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Activity log table
  database.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      actor TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Sessions table
  database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      name TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      summary TEXT,
      entities_modified INTEGER DEFAULT 0,
      files_modified INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active'
    )
  `);

  // Documents table (file tracking)
  database.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      path TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_type TEXT,
      status TEXT DEFAULT 'tracked',
      file_hash TEXT,
      size_bytes INTEGER,
      last_modified TEXT,
      metadata TEXT,
      tldr TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  database.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_path ON documents(project_id, path)`);

  // Chunks table
  database.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      name TEXT NOT NULL,
      patterns TEXT,
      assigned_files TEXT,
      review_mode TEXT DEFAULT 'standard',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks(session_id)`);

  // Session files table
  database.run(`
    CREATE TABLE IF NOT EXISTS session_files (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      document_id TEXT NOT NULL REFERENCES documents(id),
      chunk_id TEXT REFERENCES chunks(id),
      agent_id TEXT,
      report_path TEXT,
      reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
      review_type TEXT DEFAULT 'assigned',
      is_foundational INTEGER DEFAULT 0,
      quality_issues TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, document_id)
    )
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_session ON session_files(session_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_document ON session_files(document_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_chunk ON session_files(chunk_id)`);
}

/**
 * Create a test session
 */
export function createTestSession(projectId: string, name?: string): string {
  const sessionId = generateTestId();
  testRun(
    `INSERT INTO sessions (id, project_id, name, status) VALUES (?, ?, ?, 'active')`,
    [sessionId, projectId, name ?? null]
  );
  return sessionId;
}

/**
 * Create a test document
 */
export function createTestDocument(projectId: string, path: string): string {
  const docId = generateTestId();
  const filename = path.split('/').pop() ?? path;
  testRun(
    `INSERT INTO documents (id, project_id, path, filename, status) VALUES (?, ?, ?, ?, 'tracked')`,
    [docId, projectId, path, filename]
  );
  return docId;
}

/**
 * Create a test chunk
 */
export function createTestChunk(
  sessionId: string,
  chunkId: string,
  name: string,
  assignedFiles?: string[]
): string {
  testRun(
    `INSERT INTO chunks (id, session_id, name, assigned_files, review_mode) VALUES (?, ?, ?, ?, 'standard')`,
    [chunkId, sessionId, name, assignedFiles ? JSON.stringify(assignedFiles) : null]
  );
  return chunkId;
}
