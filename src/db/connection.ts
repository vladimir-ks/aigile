/**
 * Database Connection Manager
 *
 * Manages SQLite database connection for AIGILE CLI.
 * Uses sql.js for pure JavaScript SQLite (no native compilation needed).
 *
 * @author Vladimir K.S.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { getDbPath, ensureAigileHome } from '../utils/config.js';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

/**
 * Initialize and get database connection
 */
export async function initDatabase(): Promise<SqlJsDatabase> {
  if (db) {
    return db;
  }

  ensureAigileHome();
  dbPath = getDbPath();

  // Ensure directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    // Run migrations on existing database
    runMigrations();
  } else {
    db = new SQL.Database();
    initializeSchema(db!);
    saveDatabase();
  }

  return db!;
}

/**
 * Get database (must call initDatabase first)
 */
export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Save database to file
 * Guarded with try-catch to prevent crashes on I/O errors
 */
export function saveDatabase(): void {
  if (db && dbPath) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      writeFileSync(dbPath, buffer);
    } catch (err) {
      // Log error but don't crash - database is still in memory
      // Will retry on next save operation
      console.error(`[${new Date().toISOString()}] Database save error: ${err}`);
    }
  }
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

/**
 * Run a query and return all results
 */
export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const database = getDatabase();
  const stmt = database.prepare(sql);
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
 * Run a query and return first result
 */
export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const results = queryAll<T>(sql, params);
  return results[0];
}

/**
 * Run a statement (INSERT, UPDATE, DELETE)
 */
export function run(sql: string, params: unknown[] = []): void {
  const database = getDatabase();
  database.run(sql, params);
  saveDatabase();
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

  // Documents table (file tracking with frontmatter metadata)
  database.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      path TEXT NOT NULL,
      filename TEXT NOT NULL,
      extension TEXT,
      content_hash TEXT,
      size_bytes INTEGER,
      entity_type TEXT,
      entity_id TEXT,
      status TEXT DEFAULT 'tracked',
      last_scanned_at TEXT,
      -- Frontmatter metadata fields
      meta_status TEXT,
      meta_version TEXT,
      meta_tldr TEXT,
      meta_title TEXT,
      meta_modules TEXT,
      meta_dependencies TEXT,
      meta_code_refs TEXT,
      meta_authors TEXT,
      has_frontmatter INTEGER DEFAULT 0,
      frontmatter_raw TEXT,
      -- Shadow mode analysis fields
      shadow_mode INTEGER DEFAULT 0,
      analyzed_at TEXT,
      analysis_confidence INTEGER,
      file_type TEXT,
      complexity_score INTEGER,
      exports TEXT,
      inferred_module TEXT,
      inferred_component TEXT,
      analysis_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, path)
    )
  `);

  // Document comments table (marker tracking)
  database.run(`
    CREATE TABLE IF NOT EXISTS doc_comments (
      id TEXT PRIMARY KEY,
      document_id TEXT REFERENCES documents(id),
      marker_type TEXT NOT NULL,
      line_number INTEGER,
      content TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Sessions table (AI session tracking)
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

  // Personas table (user archetypes)
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

  // UX Journeys table (user experience flows)
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

  // Chunks table (file review chunk definitions)
  database.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id),
      name TEXT NOT NULL,
      patterns TEXT,
      assigned_files TEXT,
      review_mode TEXT DEFAULT 'standard',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Session files table (links files to review sessions)
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

  // Indexes for session_files
  database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_session ON session_files(session_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_document ON session_files(document_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_chunk ON session_files(chunk_id)`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_report ON session_files(report_path)`);

  // Indexes for chunks
  database.run(`CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks(session_id)`);
}

/**
 * Generate a UUID
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Get next key for a project prefix
 */
export function getNextKey(projectKey: string): string {
  const row = queryOne<{ current_value: number }>(
    'SELECT current_value FROM key_sequences WHERE prefix = ?',
    [projectKey]
  );

  const nextValue = (row?.current_value ?? 0) + 1;

  if (row) {
    run(
      `UPDATE key_sequences SET current_value = ?, updated_at = datetime('now') WHERE prefix = ?`,
      [nextValue, projectKey]
    );
  } else {
    run(
      `INSERT INTO key_sequences (id, prefix, current_value) VALUES (?, ?, ?)`,
      [generateId(), projectKey, nextValue]
    );
  }

  return `${projectKey}-${nextValue}`;
}

// ============================================================================
// Chunk Management Helpers
// ============================================================================

export interface Chunk {
  id: string;
  session_id: string;
  name: string;
  patterns: string | null;
  assigned_files: string | null;
  review_mode: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create a new chunk
 */
export function createChunk(
  sessionId: string,
  chunkId: string,
  name: string,
  patterns: string[] | null,
  assignedFiles: string[] | null,
  reviewMode: string = 'standard'
): void {
  run(
    `INSERT INTO chunks (id, session_id, name, patterns, assigned_files, review_mode)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      chunkId,
      sessionId,
      name,
      patterns ? JSON.stringify(patterns) : null,
      assignedFiles ? JSON.stringify(assignedFiles) : null,
      reviewMode
    ]
  );
}

/**
 * Get chunk by ID
 */
export function getChunk(chunkId: string): Chunk | undefined {
  return queryOne<Chunk>('SELECT * FROM chunks WHERE id = ?', [chunkId]);
}

/**
 * Get all chunks for a session
 */
export function getSessionChunks(sessionId: string): Chunk[] {
  return queryAll<Chunk>(
    'SELECT * FROM chunks WHERE session_id = ? ORDER BY created_at',
    [sessionId]
  );
}

/**
 * Assign files to a chunk
 */
export function assignFilesToChunk(chunkId: string, files: string[]): void {
  const chunk = getChunk(chunkId);
  if (!chunk) {
    throw new Error(`Chunk "${chunkId}" not found`);
  }

  const existing = chunk.assigned_files ? JSON.parse(chunk.assigned_files) : [];
  const merged = [...new Set([...existing, ...files])];

  run(
    `UPDATE chunks SET assigned_files = ?, updated_at = datetime('now') WHERE id = ?`,
    [JSON.stringify(merged), chunkId]
  );
}

// ============================================================================
// Session File Tracking Helpers
// ============================================================================

export interface SessionFile {
  id: string;
  session_id: string;
  document_id: string;
  chunk_id: string | null;
  agent_id: string | null;
  report_path: string | null;
  reviewed_at: string;
  review_type: string;
  is_foundational: number;
  quality_issues: string | null;
  created_at: string;
}

/**
 * Tag a file as reviewed
 */
export function tagFileReviewed(
  sessionId: string,
  documentId: string,
  options: {
    chunkId?: string;
    agentId?: string;
    reportPath?: string;
    reviewType?: 'assigned' | 'explored' | 'skipped';
    isFoundational?: boolean;
  } = {}
): string {
  // Check if already tagged in this session
  const existing = queryOne<{ id: string }>(
    'SELECT id FROM session_files WHERE session_id = ? AND document_id = ?',
    [sessionId, documentId]
  );

  if (existing) {
    // Update existing tag with new info (allows adding chunk_id, changing type, etc.)
    run(
      `UPDATE session_files SET
        chunk_id = COALESCE(?, chunk_id),
        agent_id = COALESCE(?, agent_id),
        report_path = COALESCE(?, report_path),
        review_type = ?,
        is_foundational = CASE WHEN ? = 1 THEN 1 ELSE is_foundational END,
        reviewed_at = datetime('now')
       WHERE id = ?`,
      [
        options.chunkId ?? null,
        options.agentId ?? null,
        options.reportPath ?? null,
        options.reviewType ?? 'assigned',
        options.isFoundational ? 1 : 0,
        existing.id
      ]
    );
    return existing.id;
  }

  const id = generateId();
  run(
    `INSERT INTO session_files (id, session_id, document_id, chunk_id, agent_id, report_path, review_type, is_foundational)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sessionId,
      documentId,
      options.chunkId ?? null,
      options.agentId ?? null,
      options.reportPath ?? null,
      options.reviewType ?? 'assigned',
      options.isFoundational ? 1 : 0
    ]
  );
  return id;
}

/**
 * Flag a file with quality issues
 */
export function flagFileQualityIssue(
  sessionFileId: string,
  issues: string[]
): void {
  const existing = queryOne<{ quality_issues: string | null }>(
    'SELECT quality_issues FROM session_files WHERE id = ?',
    [sessionFileId]
  );

  const current = existing?.quality_issues ? JSON.parse(existing.quality_issues) : [];
  const merged = [...new Set([...current, ...issues])];

  run(
    `UPDATE session_files SET quality_issues = ? WHERE id = ?`,
    [JSON.stringify(merged), sessionFileId]
  );
}

/**
 * Get all session files for a session
 */
export function getSessionFiles(
  sessionId: string,
  options: {
    chunkId?: string;
    reviewType?: string;
    foundationalOnly?: boolean;
  } = {}
): SessionFile[] {
  let sql = 'SELECT * FROM session_files WHERE session_id = ?';
  const params: unknown[] = [sessionId];

  if (options.chunkId) {
    sql += ' AND chunk_id = ?';
    params.push(options.chunkId);
  }
  if (options.reviewType) {
    sql += ' AND review_type = ?';
    params.push(options.reviewType);
  }
  if (options.foundationalOnly) {
    sql += ' AND is_foundational = 1';
  }

  return queryAll<SessionFile>(sql, params);
}

/**
 * Get files with quality issues
 */
export function getFilesWithQualityIssues(sessionId: string): SessionFile[] {
  return queryAll<SessionFile>(
    `SELECT * FROM session_files
     WHERE session_id = ? AND quality_issues IS NOT NULL AND quality_issues != '[]'`,
    [sessionId]
  );
}

/**
 * Get untagged files for a session (files in documents not in session_files)
 */
export function getUntaggedFiles(
  projectId: string,
  sessionId: string,
  options: {
    chunkId?: string;
    assignedOnly?: boolean;
  } = {}
): { path: string; document_id: string }[] {
  // If assignedOnly, only return untagged files that were assigned to chunks
  if (options.assignedOnly) {
    // Collect all assigned files from the specified chunk or all chunks in session
    let assignedFiles: string[] = [];

    if (options.chunkId) {
      // Single chunk
      const chunk = getChunk(options.chunkId);
      if (chunk?.assigned_files) {
        try {
          assignedFiles = JSON.parse(chunk.assigned_files);
        } catch {
          // Invalid JSON, skip
        }
      }
    } else {
      // All chunks in this session
      const chunks = getSessionChunks(sessionId);
      for (const chunk of chunks) {
        if (chunk.assigned_files) {
          try {
            const files = JSON.parse(chunk.assigned_files);
            assignedFiles.push(...files);
          } catch {
            // Invalid JSON, skip
          }
        }
      }
      // Deduplicate
      assignedFiles = [...new Set(assignedFiles)];
    }

    if (assignedFiles.length === 0) {
      return [];
    }

    // Get documents for assigned files that haven't been tagged
    return queryAll<{ path: string; document_id: string }>(
      `SELECT d.path, d.id as document_id
       FROM documents d
       WHERE d.project_id = ?
       AND d.path IN (${assignedFiles.map(() => '?').join(',')})
       AND d.id NOT IN (
         SELECT sf.document_id FROM session_files sf WHERE sf.session_id = ?
       )`,
      [projectId, ...assignedFiles, sessionId]
    );
  }

  // Otherwise return all untagged files
  return queryAll<{ path: string; document_id: string }>(
    `SELECT d.path, d.id as document_id
     FROM documents d
     WHERE d.project_id = ?
     AND d.id NOT IN (
       SELECT sf.document_id FROM session_files sf WHERE sf.session_id = ?
     )`,
    [projectId, sessionId]
  );
}

/**
 * Get coverage statistics for a session
 */
export function getCoverageStats(
  sessionId: string,
  chunkId?: string
): {
  assigned: { total: number; reviewed: number };
  explored: number;
  foundational: number;
  skipped: number;
} {
  const baseWhere = chunkId
    ? 'WHERE session_id = ? AND chunk_id = ?'
    : 'WHERE session_id = ?';
  const params = chunkId ? [sessionId, chunkId] : [sessionId];

  const assigned = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM session_files ${baseWhere} AND review_type = 'assigned'`,
    params
  );
  const explored = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM session_files ${baseWhere} AND review_type = 'explored'`,
    params
  );
  const foundational = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM session_files ${baseWhere} AND is_foundational = 1`,
    params
  );
  const skipped = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM session_files ${baseWhere} AND review_type = 'skipped'`,
    params
  );

  // For assigned total, get from chunk definition(s)
  let assignedTotal = 0;
  if (chunkId) {
    const chunk = getChunk(chunkId);
    if (chunk?.assigned_files) {
      try {
        assignedTotal = JSON.parse(chunk.assigned_files).length;
      } catch {
        assignedTotal = 0;
      }
    }
  } else {
    // Aggregate across all chunks in the session
    const chunks = getSessionChunks(sessionId);
    for (const chunk of chunks) {
      if (chunk.assigned_files) {
        try {
          assignedTotal += JSON.parse(chunk.assigned_files).length;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  return {
    assigned: { total: assignedTotal, reviewed: assigned?.count ?? 0 },
    explored: explored?.count ?? 0,
    foundational: foundational?.count ?? 0,
    skipped: skipped?.count ?? 0
  };
}

/**
 * Run database migrations for schema updates
 * Adds new columns to existing tables if they don't exist
 */
export function runMigrations(): void {
  const database = getDatabase();

  // Check if documents table has frontmatter columns
  const columns = queryAll<{ name: string }>(
    `PRAGMA table_info(documents)`
  );
  const columnNames = new Set(columns.map(c => c.name));

  // Add frontmatter metadata columns if missing
  const newColumns = [
    { name: 'meta_status', type: 'TEXT' },
    { name: 'meta_version', type: 'TEXT' },
    { name: 'meta_tldr', type: 'TEXT' },
    { name: 'meta_title', type: 'TEXT' },
    { name: 'meta_modules', type: 'TEXT' },
    { name: 'meta_dependencies', type: 'TEXT' },
    { name: 'meta_code_refs', type: 'TEXT' },
    { name: 'meta_authors', type: 'TEXT' },
    { name: 'has_frontmatter', type: 'INTEGER DEFAULT 0' },
    { name: 'frontmatter_raw', type: 'TEXT' },
    // Shadow mode analysis columns
    { name: 'shadow_mode', type: 'INTEGER DEFAULT 0' },
    { name: 'analyzed_at', type: 'TEXT' },
    { name: 'analysis_confidence', type: 'INTEGER' },
    { name: 'file_type', type: 'TEXT' },
    { name: 'complexity_score', type: 'INTEGER' },
    { name: 'exports', type: 'TEXT' },
    { name: 'inferred_module', type: 'TEXT' },
    { name: 'inferred_component', type: 'TEXT' },
    { name: 'analysis_notes', type: 'TEXT' },
    // Tri-state monitoring columns
    { name: 'monitoring_category', type: 'TEXT DEFAULT "unknown"' },
    { name: 'needs_review', type: 'INTEGER DEFAULT 0' },
    { name: 'reviewed_at', type: 'TEXT' },
  ];

  for (const col of newColumns) {
    if (!columnNames.has(col.name)) {
      try {
        database.run(`ALTER TABLE documents ADD COLUMN ${col.name} ${col.type}`);
      } catch {
        // Column might already exist, ignore error
      }
    }
  }

  // Create sessions table if missing (added after initial release)
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

  // Add name column to sessions if missing (migration for 0.2.4)
  try {
    database.run(`ALTER TABLE sessions ADD COLUMN name TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Create activity_log table if missing (added after initial release)
  database.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id),
      project_id TEXT REFERENCES projects(id),
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      action TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create chunks table if missing (v0.2.4+)
  database.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id),
      name TEXT NOT NULL,
      patterns TEXT,
      assigned_files TEXT,
      review_mode TEXT DEFAULT 'standard',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create session_files table if missing (v0.2.4+)
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

  // Create indexes for new tables (IF NOT EXISTS handles idempotency)
  try {
    database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_session ON session_files(session_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_document ON session_files(document_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_chunk ON session_files(chunk_id)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_session_files_report ON session_files(report_path)`);
    database.run(`CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks(session_id)`);
  } catch {
    // Indexes might already exist, ignore error
  }

  saveDatabase();
}
