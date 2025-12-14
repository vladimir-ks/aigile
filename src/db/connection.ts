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
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      summary TEXT,
      entities_modified INTEGER DEFAULT 0,
      files_modified INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active'
    )
  `);

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

  saveDatabase();
}
