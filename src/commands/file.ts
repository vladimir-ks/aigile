/**
 * File Command
 *
 * Shadow mode file analysis and management.
 * For brownfield projects where files cannot be modified.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { glob } from 'glob';
import { queryOne, queryAll } from '../db/connection.js';
import {
  tagFileReviewed,
  flagFileQualityIssue,
  getUntaggedFiles,
  getCoverageStats,
  getFilesWithQualityIssues,
  getSessionFiles,
  getChunk,
  getSessionChunks
} from '../db/connection.js';
import { getActiveSession } from '../services/session-service.js';
import {
  success,
  error,
  info,
  data,
  details,
  getOutputOptions,
  type OutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import {
  getUnanalyzedDocuments,
  getUnanalyzedCount,
  getAnalyzedDocuments,
  getLowConfidenceDocuments,
  getDocumentsByInferredModule,
  getDocumentsByFileType,
  getDocumentWithAnalysis,
  updateDocumentAnalysis,
  getAnalysisProgress,
  getShadowDocuments,
  trackShadowFile,
  type DocumentWithAnalysis,
  type AnalysisMetadata
} from '../services/file-scanner.js';

export const fileCommand = new Command('file')
  .description('Shadow mode file analysis and management for brownfield projects');

/**
 * Helper to get project context
 */
function getProjectContext(opts: OutputOptions): {
  projectId: string;
  projectRoot: string;
  projectKey: string;
} | null {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    error('Not in an AIGILE project. Run "aigile init" first.', opts);
    return null;
  }

  const config = loadProjectConfig(projectRoot);
  if (!config) {
    error('Could not load project config.', opts);
    return null;
  }

  const project = queryOne<{ id: string }>(
    'SELECT id FROM projects WHERE key = ?',
    [config.project.key]
  );
  if (!project) {
    error(`Project "${config.project.key}" not found in database.`, opts);
    return null;
  }

  return { projectId: project.id, projectRoot, projectKey: config.project.key };
}

/**
 * Format document for table display
 */
function formatDocForTable(doc: DocumentWithAnalysis): Record<string, unknown> {
  return {
    path: doc.path,
    module: doc.inferred_module ?? '-',
    type: doc.file_type ?? doc.extension ?? '-',
    analyzed: doc.analyzed_at ? 'Yes' : 'No',
    confidence: doc.analysis_confidence ?? '-',
    tldr: doc.meta_tldr ? (doc.meta_tldr.length > 40 ? doc.meta_tldr.slice(0, 37) + '...' : doc.meta_tldr) : '-'
  };
}

// ============================================
// ANALYZE command - Add analysis metadata
// ============================================
fileCommand
  .command('analyze <path>')
  .option('--tldr <tldr>', 'One-line summary of file purpose')
  .option('--module <module>', 'Module this file belongs to')
  .option('--component <component>', 'Component within module')
  .option('--type <type>', 'File type: component|service|util|config|test|doc|style|data')
  .option('--deps <deps>', 'Dependencies (comma-separated)')
  .option('--exports <exports>', 'Exported functions/classes (comma-separated)')
  .option('--complexity <n>', 'Complexity score (1-10)', parseInt)
  .option('--confidence <n>', 'AI confidence in analysis (0-100)', parseInt)
  .option('--notes <notes>', 'Additional analysis notes')
  .description('Add analysis metadata to a tracked file (shadow mode)')
  .action((filePath: string, options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Normalize path (ensure it's relative)
    const normalizedPath = filePath.startsWith('/')
      ? relative(ctx.projectRoot, filePath)
      : filePath;

    // Check if file exists in database
    const doc = getDocumentWithAnalysis(ctx.projectId, normalizedPath);
    if (!doc) {
      // Try to track it as shadow file first
      const tracked = trackShadowFile(ctx.projectId, ctx.projectRoot, normalizedPath);
      if (!tracked) {
        error(`File not tracked. Run "aigile sync scan" or track with "aigile file track ${normalizedPath}"`, opts);
        process.exit(1);
      }
    }

    // Build analysis metadata
    const analysis: AnalysisMetadata = {};

    if (options.tldr) analysis.tldr = options.tldr;
    if (options.module) analysis.module = options.module;
    if (options.component) analysis.component = options.component;
    if (options.type) analysis.fileType = options.type;
    if (options.deps) analysis.dependencies = options.deps.split(',').map((s: string) => s.trim());
    if (options.exports) analysis.exports = options.exports.split(',').map((s: string) => s.trim());
    if (options.complexity) analysis.complexity = options.complexity;
    if (options.confidence) analysis.confidence = options.confidence;
    if (options.notes) analysis.notes = options.notes;

    if (Object.keys(analysis).length === 0) {
      error('No analysis options provided. Use --tldr, --module, --type, etc.', opts);
      process.exit(1);
    }

    // Update analysis
    const updated = updateDocumentAnalysis(ctx.projectId, normalizedPath, analysis);
    if (!updated) {
      error(`Failed to update analysis for: ${normalizedPath}`, opts);
      process.exit(1);
    }

    // Get updated document
    const updatedDoc = getDocumentWithAnalysis(ctx.projectId, normalizedPath);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          path: normalizedPath,
          analyzed: true,
          analyzedAt: updatedDoc?.analyzed_at,
          metadata: {
            tldr: updatedDoc?.meta_tldr,
            module: updatedDoc?.inferred_module,
            component: updatedDoc?.inferred_component,
            type: updatedDoc?.file_type,
            dependencies: updatedDoc?.meta_dependencies ? JSON.parse(updatedDoc.meta_dependencies) : null,
            exports: updatedDoc?.exports ? JSON.parse(updatedDoc.exports) : null,
            complexity: updatedDoc?.complexity_score,
            confidence: updatedDoc?.analysis_confidence
          }
        }
      }));
    } else {
      success(`Analysis added for: ${normalizedPath}`, opts);
      if (updatedDoc?.meta_tldr) {
        info(`TLDR: ${updatedDoc.meta_tldr}`, opts);
      }
    }
  });

// ============================================
// LIST command - List files with filters
// ============================================
fileCommand
  .command('list')
  .alias('ls')
  .option('--unanalyzed', 'Only files without analysis')
  .option('--analyzed', 'Only files with analysis')
  .option('--low-confidence [threshold]', 'Files with low confidence (default: <70)', '70')
  .option('--module <module>', 'Filter by inferred module')
  .option('--type <type>', 'Filter by file type')
  .option('--shadow', 'Only shadow mode files')
  .option('--count', 'Return count only')
  .option('--limit <n>', 'Limit results', '100')
  .option('--offset <n>', 'Pagination offset', '0')
  .option('--format <format>', 'Output format: table|paths|json', 'table')
  .description('List tracked files with analysis filters')
  .action((options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    const limit = parseInt(options.limit, 10);
    const offset = parseInt(options.offset, 10);

    // Count only mode
    if (options.count) {
      let count = 0;
      if (options.unanalyzed) {
        count = getUnanalyzedCount(ctx.projectId);
      } else {
        // Get all and filter
        const docs = options.unanalyzed
          ? getUnanalyzedDocuments(ctx.projectId)
          : getAnalyzedDocuments(ctx.projectId);
        count = docs.length;
      }

      if (opts.json) {
        console.log(JSON.stringify({ success: true, data: { count } }));
      } else {
        console.log(count);
      }
      return;
    }

    // Get files based on filter
    let documents: DocumentWithAnalysis[] = [];

    if (options.unanalyzed) {
      documents = getUnanalyzedDocuments(ctx.projectId, limit, offset);
    } else if (options.analyzed) {
      documents = getAnalyzedDocuments(ctx.projectId, limit);
    } else if (options.lowConfidence) {
      const threshold = parseInt(options.lowConfidence, 10) || 70;
      documents = getLowConfidenceDocuments(ctx.projectId, threshold);
    } else if (options.module) {
      documents = getDocumentsByInferredModule(ctx.projectId, options.module);
    } else if (options.type) {
      documents = getDocumentsByFileType(ctx.projectId, options.type);
    } else if (options.shadow) {
      documents = getShadowDocuments(ctx.projectId);
    } else {
      // Default: unanalyzed files
      documents = getUnanalyzedDocuments(ctx.projectId, limit, offset);
    }

    // Output based on format
    if (opts.json || options.format === 'json') {
      console.log(JSON.stringify({
        success: true,
        data: documents.map(d => ({
          path: d.path,
          filename: d.filename,
          extension: d.extension,
          module: d.inferred_module,
          component: d.inferred_component,
          fileType: d.file_type,
          analyzed: !!d.analyzed_at,
          analyzedAt: d.analyzed_at,
          confidence: d.analysis_confidence,
          tldr: d.meta_tldr,
          dependencies: d.meta_dependencies ? JSON.parse(d.meta_dependencies) : null,
          exports: d.exports ? JSON.parse(d.exports) : null,
          complexity: d.complexity_score
        }))
      }));
    } else if (options.format === 'paths') {
      documents.forEach(d => console.log(d.path));
    } else {
      // Table format
      const displayDocs = documents.map(formatDocForTable);
      data(
        displayDocs,
        [
          { header: 'Path', key: 'path', width: 50 },
          { header: 'Module', key: 'module', width: 15 },
          { header: 'Type', key: 'type', width: 10 },
          { header: 'Analyzed', key: 'analyzed', width: 8 },
          { header: 'Conf', key: 'confidence', width: 5 }
        ],
        opts
      );
      info(`Showing ${documents.length} files`, opts);
    }
  });

// ============================================
// PROGRESS command - Analysis progress stats
// ============================================
fileCommand
  .command('progress')
  .description('Show analysis progress statistics')
  .action(() => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    const progress = getAnalysisProgress(ctx.projectId);

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: progress }));
    } else {
      const analyzedPct = progress.total > 0
        ? Math.round((progress.analyzed / progress.total) * 100)
        : 0;

      console.log('\n📊 Analysis Progress\n');
      console.log(`Total files:     ${progress.total}`);
      console.log(`Analyzed:        ${progress.analyzed} (${analyzedPct}%)`);
      console.log(`Unanalyzed:      ${progress.unanalyzed} (${100 - analyzedPct}%)`);
      console.log(`Low confidence:  ${progress.lowConfidence}`);

      // By module
      const moduleEntries = Object.entries(progress.byModule);
      if (moduleEntries.length > 0) {
        console.log('\nBy module:');
        for (const [module, stats] of moduleEntries) {
          const pct = stats.total > 0
            ? Math.round((stats.analyzed / stats.total) * 100)
            : 0;
          console.log(`  ${module}: ${stats.analyzed}/${stats.total} (${pct}%)`);
        }
      }

      // By file type
      const typeEntries = Object.entries(progress.byFileType);
      if (typeEntries.length > 0) {
        console.log('\nBy file type:');
        for (const [type, count] of typeEntries.slice(0, 10)) {
          console.log(`  ${type}: ${count}`);
        }
      }

      console.log('');
    }
  });

// ============================================
// READ command - Read file content for agents
// ============================================
fileCommand
  .command('read <path>')
  .option('--with-metadata', 'Include existing DB metadata')
  .option('--line-numbers', 'Include line numbers')
  .option('--limit <n>', 'Limit number of lines', parseInt)
  .description('Read file content (for AI agent analysis)')
  .action((filePath: string, options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Normalize path
    const normalizedPath = filePath.startsWith('/')
      ? relative(ctx.projectRoot, filePath)
      : filePath;

    const fullPath = join(ctx.projectRoot, normalizedPath);

    if (!existsSync(fullPath)) {
      error(`File not found: ${normalizedPath}`, opts);
      process.exit(1);
    }

    // Read file content
    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      error(`Could not read file: ${normalizedPath}`, opts);
      process.exit(1);
    }

    // Get metadata if requested
    let metadata: DocumentWithAnalysis | undefined;
    if (options.withMetadata) {
      metadata = getDocumentWithAnalysis(ctx.projectId, normalizedPath);
    }

    // Apply line limit
    let lines = content.split('\n');
    if (options.limit && options.limit > 0) {
      lines = lines.slice(0, options.limit);
    }

    // Format output
    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          path: normalizedPath,
          content: lines.join('\n'),
          lineCount: lines.length,
          metadata: metadata ? {
            tldr: metadata.meta_tldr,
            module: metadata.inferred_module,
            component: metadata.inferred_component,
            fileType: metadata.file_type,
            analyzed: !!metadata.analyzed_at,
            confidence: metadata.analysis_confidence
          } : null
        }
      }));
    } else {
      if (options.withMetadata && metadata) {
        console.log(`# File: ${normalizedPath}`);
        if (metadata.meta_tldr) console.log(`# TLDR: ${metadata.meta_tldr}`);
        if (metadata.inferred_module) console.log(`# Module: ${metadata.inferred_module}`);
        if (metadata.file_type) console.log(`# Type: ${metadata.file_type}`);
        console.log('');
      }

      if (options.lineNumbers) {
        lines.forEach((line, i) => {
          console.log(`${String(i + 1).padStart(4)} | ${line}`);
        });
      } else {
        console.log(lines.join('\n'));
      }
    }
  });

// ============================================
// TRACK command - Track file in shadow mode
// ============================================
fileCommand
  .command('track <path>')
  .option('--type <type>', 'File type classification')
  .option('--module <module>', 'Module assignment')
  .option('--notes <notes>', 'Initial notes')
  .description('Track a file in shadow mode (brownfield)')
  .action((filePath: string, options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Normalize path
    const normalizedPath = filePath.startsWith('/')
      ? relative(ctx.projectRoot, filePath)
      : filePath;

    // Track the file
    const tracked = trackShadowFile(ctx.projectId, ctx.projectRoot, normalizedPath);
    if (!tracked) {
      error(`Could not track file: ${normalizedPath}`, opts);
      process.exit(1);
    }

    // Add initial metadata if provided
    if (options.type || options.module || options.notes) {
      const analysis: AnalysisMetadata = {};
      if (options.type) analysis.fileType = options.type;
      if (options.module) analysis.module = options.module;
      if (options.notes) analysis.notes = options.notes;
      updateDocumentAnalysis(ctx.projectId, normalizedPath, analysis);
    }

    const doc = getDocumentWithAnalysis(ctx.projectId, normalizedPath);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          path: normalizedPath,
          tracked: true,
          shadowMode: true,
          metadata: doc ? {
            fileType: doc.file_type,
            module: doc.inferred_module
          } : null
        }
      }));
    } else {
      success(`Tracked in shadow mode: ${normalizedPath}`, opts);
    }
  });

// ============================================
// SHOW command - Show file analysis details
// ============================================
fileCommand
  .command('show <path>')
  .description('Show detailed file analysis')
  .action((filePath: string) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Normalize path
    const normalizedPath = filePath.startsWith('/')
      ? relative(ctx.projectRoot, filePath)
      : filePath;

    const doc = getDocumentWithAnalysis(ctx.projectId, normalizedPath);
    if (!doc) {
      error(`File not tracked: ${normalizedPath}`, opts);
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          path: doc.path,
          filename: doc.filename,
          extension: doc.extension,
          status: doc.status,
          sizeBytes: doc.size_bytes,
          lastScanned: doc.last_scanned_at,
          hasFrontmatter: !!doc.has_frontmatter,
          shadowMode: !!doc.shadow_mode,
          analysis: {
            analyzed: !!doc.analyzed_at,
            analyzedAt: doc.analyzed_at,
            confidence: doc.analysis_confidence,
            tldr: doc.meta_tldr,
            module: doc.inferred_module,
            component: doc.inferred_component,
            fileType: doc.file_type,
            complexity: doc.complexity_score,
            dependencies: doc.meta_dependencies ? JSON.parse(doc.meta_dependencies) : null,
            exports: doc.exports ? JSON.parse(doc.exports) : null,
            notes: doc.analysis_notes
          }
        }
      }));
    } else {
      const displayData: Record<string, unknown> = {
        path: doc.path,
        filename: doc.filename,
        extension: doc.extension,
        status: doc.status,
        size_bytes: doc.size_bytes,
        last_scanned: doc.last_scanned_at,
        shadow_mode: doc.shadow_mode ? 'Yes' : 'No',
        analyzed: doc.analyzed_at ? 'Yes' : 'No',
        analyzed_at: doc.analyzed_at ?? '-',
        confidence: doc.analysis_confidence ?? '-',
        tldr: doc.meta_tldr ?? '-',
        module: doc.inferred_module ?? '-',
        component: doc.inferred_component ?? '-',
        file_type: doc.file_type ?? '-',
        complexity: doc.complexity_score ?? '-',
        dependencies: doc.meta_dependencies ? JSON.parse(doc.meta_dependencies).join(', ') : '-',
        exports: doc.exports ? JSON.parse(doc.exports).join(', ') : '-',
        notes: doc.analysis_notes ?? '-'
      };

      details(
        displayData,
        [
          { label: 'Path', key: 'path' },
          { label: 'Filename', key: 'filename' },
          { label: 'Extension', key: 'extension' },
          { label: 'Status', key: 'status' },
          { label: 'Size (bytes)', key: 'size_bytes' },
          { label: 'Last Scanned', key: 'last_scanned' },
          { label: 'Shadow Mode', key: 'shadow_mode' },
          { label: 'Analyzed', key: 'analyzed' },
          { label: 'Analyzed At', key: 'analyzed_at' },
          { label: 'Confidence', key: 'confidence' },
          { label: 'TLDR', key: 'tldr' },
          { label: 'Module', key: 'module' },
          { label: 'Component', key: 'component' },
          { label: 'File Type', key: 'file_type' },
          { label: 'Complexity', key: 'complexity' },
          { label: 'Dependencies', key: 'dependencies' },
          { label: 'Exports', key: 'exports' },
          { label: 'Notes', key: 'notes' }
        ],
        opts
      );
    }
  });

// ============================================
// TAG command - Tag file as reviewed in session
// ============================================
fileCommand
  .command('tag')
  .argument('<path>', 'File path to tag')
  .option('--chunk <id>', 'Chunk ID this file belongs to')
  .option('--report <path>', 'Report this file contributes to')
  .option('--type <type>', 'Review type: assigned|explored|skipped', 'assigned')
  .option('--foundational', 'Mark as foundational file')
  .option('--agent <id>', 'Agent ID that reviewed this file')
  .description('Tag a file as reviewed in the current session')
  .action((filePath: string, options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Get active session
    const session = getActiveSession(ctx.projectId);
    if (!session) {
      error('No active session. Start one with "aigile session start".', opts);
      process.exit(1);
    }

    // Normalize path
    const normalizedPath = filePath.startsWith('/')
      ? relative(ctx.projectRoot, filePath)
      : filePath;

    // Get document from database
    const doc = queryOne<{ id: string }>(
      'SELECT id FROM documents WHERE project_id = ? AND path = ?',
      [ctx.projectId, normalizedPath]
    );

    if (!doc) {
      // Try to track it first
      const tracked = trackShadowFile(ctx.projectId, ctx.projectRoot, normalizedPath);
      if (!tracked) {
        error(`File not tracked: ${normalizedPath}. Run "aigile sync scan" first.`, opts);
        process.exit(1);
      }
      const newDoc = queryOne<{ id: string }>(
        'SELECT id FROM documents WHERE project_id = ? AND path = ?',
        [ctx.projectId, normalizedPath]
      );
      if (!newDoc) {
        error(`Could not track file: ${normalizedPath}`, opts);
        process.exit(1);
      }
      doc.id = newDoc.id;
    }

    // Validate review type
    const validTypes = ['assigned', 'explored', 'skipped'];
    if (!validTypes.includes(options.type)) {
      error(`Invalid review type "${options.type}". Must be: ${validTypes.join(', ')}`, opts);
      process.exit(1);
    }

    // Tag the file
    const sessionFileId = tagFileReviewed(session.id, doc.id, {
      chunkId: options.chunk,
      agentId: options.agent,
      reportPath: options.report,
      reviewType: options.type as 'assigned' | 'explored' | 'skipped',
      isFoundational: options.foundational ?? false
    });

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          session_file_id: sessionFileId,
          path: normalizedPath,
          session_id: session.id,
          chunk_id: options.chunk ?? null,
          review_type: options.type,
          is_foundational: options.foundational ?? false
        }
      }));
    } else {
      success(`Tagged: ${normalizedPath}`, opts);
      if (options.chunk) {
        info(`  Chunk: ${options.chunk}`, opts);
      }
      info(`  Type: ${options.type}`, opts);
    }
  });

// ============================================
// TAG-BATCH command - Tag multiple files
// ============================================
fileCommand
  .command('tag-batch')
  .option('--chunk <id>', 'Chunk ID for all files')
  .option('--glob <pattern>', 'Glob pattern for files')
  .option('--type <type>', 'Review type: assigned|explored|skipped', 'assigned')
  .option('--foundational', 'Mark all as foundational')
  .option('--agent <id>', 'Agent ID')
  .description('Tag multiple files as reviewed (from glob pattern or stdin)')
  .action(async (options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Get active session
    const session = getActiveSession(ctx.projectId);
    if (!session) {
      error('No active session. Start one with "aigile session start".', opts);
      process.exit(1);
    }

    let filesToTag: string[] = [];

    if (options.glob) {
      // Use glob pattern
      const matches = await glob(options.glob, { cwd: ctx.projectRoot, nodir: true });
      filesToTag = matches.map((f: string) => relative(ctx.projectRoot, join(ctx.projectRoot, f)));
    } else {
      // Read from stdin (not implemented for simplicity - would need async stdin reading)
      error('Please provide --glob pattern. Stdin not supported yet.', opts);
      process.exit(1);
    }

    if (filesToTag.length === 0) {
      error('No files matched the pattern.', opts);
      process.exit(1);
    }

    let tagged = 0;
    let skipped = 0;

    for (const filePath of filesToTag) {
      const doc = queryOne<{ id: string }>(
        'SELECT id FROM documents WHERE project_id = ? AND path = ?',
        [ctx.projectId, filePath]
      );

      if (!doc) {
        skipped++;
        continue;
      }

      tagFileReviewed(session.id, doc.id, {
        chunkId: options.chunk,
        agentId: options.agent,
        reviewType: options.type as 'assigned' | 'explored' | 'skipped',
        isFoundational: options.foundational ?? false
      });
      tagged++;
    }

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: { tagged, skipped, total: filesToTag.length }
      }));
    } else {
      success(`Tagged ${tagged} files (${skipped} skipped - not tracked)`, opts);
    }
  });

// ============================================
// UNTAG command - Remove tag from a file
// ============================================
fileCommand
  .command('untag')
  .argument('<path>', 'File path to untag')
  .option('--session <id>', 'Session ID (default: current)')
  .description('Remove review tag from a file')
  .action((filePath: string, options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Get session
    let sessionId = options.session;
    if (!sessionId) {
      const session = getActiveSession(ctx.projectId);
      if (!session) {
        error('No active session. Specify --session or start one.', opts);
        process.exit(1);
      }
      sessionId = session.id;
    }

    // Find document
    const doc = queryOne<{ id: string }>(
      'SELECT id FROM documents WHERE project_id = ? AND path = ?',
      [ctx.projectId, filePath]
    );

    if (!doc) {
      error(`File "${filePath}" not found in project.`, opts);
      process.exit(1);
    }

    // Delete tag
    const existing = queryOne<{ id: string }>(
      'SELECT id FROM session_files WHERE session_id = ? AND document_id = ?',
      [sessionId, doc.id]
    );

    if (!existing) {
      warning(`File "${filePath}" is not tagged in this session.`, opts);
      return;
    }

    queryOne('DELETE FROM session_files WHERE id = ?', [existing.id]);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: { path: filePath, untagged: true }
      }));
    } else {
      success(`Untagged: ${filePath}`, opts);
    }
  });

// ============================================
// CLEAR-TAGS command - Remove all tags from session
// ============================================
fileCommand
  .command('clear-tags')
  .option('--session <id>', 'Session ID (default: current)')
  .option('--chunk <id>', 'Only clear tags for specific chunk')
  .option('--confirm', 'Skip confirmation prompt')
  .description('Remove all file tags from a session (for re-review)')
  .action((options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Get session
    let sessionId = options.session;
    if (!sessionId) {
      const session = getActiveSession(ctx.projectId);
      if (!session) {
        error('No active session. Specify --session or start one.', opts);
        process.exit(1);
      }
      sessionId = session.id;
    }

    // Count tags to be deleted
    let countQuery = 'SELECT COUNT(*) as count FROM session_files WHERE session_id = ?';
    const params: unknown[] = [sessionId];

    if (options.chunk) {
      countQuery += ' AND chunk_id = ?';
      params.push(options.chunk);
    }

    const result = queryOne<{ count: number }>(countQuery, params);
    const count = result?.count ?? 0;

    if (count === 0) {
      warning('No tags to clear.', opts);
      return;
    }

    if (!options.confirm && !opts.json) {
      console.log(`This will remove ${count} tag(s).`);
      console.log('Use --confirm to proceed.');
      return;
    }

    // Delete tags
    let deleteQuery = 'DELETE FROM session_files WHERE session_id = ?';
    const deleteParams: unknown[] = [sessionId];

    if (options.chunk) {
      deleteQuery += ' AND chunk_id = ?';
      deleteParams.push(options.chunk);
    }

    queryOne(deleteQuery, deleteParams);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: { session_id: sessionId, cleared: count }
      }));
    } else {
      success(`Cleared ${count} tag(s)`, opts);
    }
  });

// ============================================
// UNTAGGED command - List unreviewed files
// ============================================
fileCommand
  .command('untagged')
  .option('--session <id>', 'Session ID (default: current)')
  .option('--chunk <id>', 'Filter by chunk')
  .option('--assigned-only', 'Only show untagged assigned files')
  .description('List files not yet tagged/reviewed in session')
  .action((options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Get session
    let sessionId = options.session;
    if (!sessionId) {
      const session = getActiveSession(ctx.projectId);
      if (!session) {
        error('No active session. Specify --session or start one.', opts);
        process.exit(1);
      }
      sessionId = session.id;
    }

    const untagged = getUntaggedFiles(ctx.projectId, sessionId, {
      chunkId: options.chunk,
      assignedOnly: options.assignedOnly
    });

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          session_id: sessionId,
          chunk_id: options.chunk ?? null,
          count: untagged.length,
          files: untagged.map(f => f.path)
        }
      }));
    } else {
      if (untagged.length === 0) {
        success('All files have been tagged!', opts);
        return;
      }

      console.log(`Untagged files (${untagged.length}):`);
      for (const file of untagged) {
        console.log(`  ${file.path}`);
      }
    }
  });

// ============================================
// COVERAGE command - Coverage statistics
// ============================================
fileCommand
  .command('coverage')
  .option('--session <id>', 'Session ID (default: current)')
  .option('--by-chunk', 'Group statistics by chunk')
  .description('Show file review coverage statistics')
  .action((options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Get session
    let sessionId = options.session;
    if (!sessionId) {
      const session = getActiveSession(ctx.projectId);
      if (!session) {
        error('No active session. Specify --session or start one.', opts);
        process.exit(1);
      }
      sessionId = session.id;
    }

    if (options.byChunk) {
      // Get all chunks and show coverage for each
      const chunks = getSessionChunks(sessionId);

      if (chunks.length === 0) {
        info('No chunks defined in this session.', opts);
        return;
      }

      const chunkStats = chunks.map(chunk => {
        const stats = getCoverageStats(sessionId, chunk.id);
        const pct = stats.assigned.total > 0
          ? Math.round((stats.assigned.reviewed / stats.assigned.total) * 100)
          : 100;
        return {
          id: chunk.id,
          name: chunk.name,
          assigned: `${stats.assigned.reviewed}/${stats.assigned.total} (${pct}%)`,
          explored: stats.explored,
          foundational: stats.foundational,
          skipped: stats.skipped
        };
      });

      if (opts.json) {
        console.log(JSON.stringify({ success: true, data: chunkStats }));
      } else {
        data(
          chunkStats,
          [
            { header: 'ID', key: 'id', width: 15 },
            { header: 'Name', key: 'name', width: 20 },
            { header: 'Assigned', key: 'assigned', width: 15 },
            { header: 'Explored', key: 'explored', width: 10 },
            { header: 'Found.', key: 'foundational', width: 8 },
            { header: 'Skipped', key: 'skipped', width: 8 }
          ],
          opts
        );
      }
    } else {
      // Overall coverage
      const stats = getCoverageStats(sessionId);
      const totalTagged = getSessionFiles(sessionId).length;
      const untagged = getUntaggedFiles(ctx.projectId, sessionId);
      const total = totalTagged + untagged.length;
      const pct = total > 0 ? Math.round((totalTagged / total) * 100) : 100;

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          data: {
            session_id: sessionId,
            total_files: total,
            tagged: totalTagged,
            untagged: untagged.length,
            coverage_percent: pct,
            by_type: {
              assigned: stats.assigned.reviewed,
              explored: stats.explored,
              foundational: stats.foundational,
              skipped: stats.skipped
            }
          }
        }));
      } else {
        console.log(`\nCoverage for session ${sessionId.slice(0, 8)}...`);
        console.log(`  Total files: ${total}`);
        console.log(`  Tagged: ${totalTagged} (${pct}%)`);
        console.log(`  Untagged: ${untagged.length}`);
        console.log(`\nBy type:`);
        console.log(`  Assigned: ${stats.assigned.reviewed}`);
        console.log(`  Explored: ${stats.explored}`);
        console.log(`  Foundational: ${stats.foundational}`);
        console.log(`  Skipped: ${stats.skipped}`);
      }
    }
  });

// ============================================
// FLAG command - Flag quality issues
// ============================================
fileCommand
  .command('flag')
  .argument('<path>', 'File path to flag')
  .option('--duplicate <path>', 'Similar/duplicate file')
  .option('--unclear <lines>', 'Unclear code at lines (e.g., "45-60")')
  .option('--note <text>', 'Description of the issue')
  .description('Flag a file with quality issues')
  .action((filePath: string, options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Get active session
    const session = getActiveSession(ctx.projectId);
    if (!session) {
      error('No active session. Start one with "aigile session start".', opts);
      process.exit(1);
    }

    // Normalize path
    const normalizedPath = filePath.startsWith('/')
      ? relative(ctx.projectRoot, filePath)
      : filePath;

    // Get session_file entry for this file
    const sessionFile = queryOne<{ id: string }>(
      `SELECT sf.id FROM session_files sf
       JOIN documents d ON sf.document_id = d.id
       WHERE sf.session_id = ? AND d.path = ?`,
      [session.id, normalizedPath]
    );

    if (!sessionFile) {
      error(`File not tagged in this session: ${normalizedPath}. Tag it first with "aigile file tag".`, opts);
      process.exit(1);
    }

    // Build quality issues
    const issues: string[] = [];

    if (options.duplicate) {
      issues.push(`duplicate:${options.duplicate}`);
    }
    if (options.unclear) {
      issues.push(`unclear:${options.unclear}`);
    }
    if (options.note) {
      issues.push(`note:${options.note}`);
    }

    if (issues.length === 0) {
      error('No issues specified. Use --duplicate, --unclear, or --note.', opts);
      process.exit(1);
    }

    flagFileQualityIssue(sessionFile.id, issues);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          path: normalizedPath,
          issues
        }
      }));
    } else {
      success(`Flagged: ${normalizedPath}`, opts);
      for (const issue of issues) {
        info(`  ${issue}`, opts);
      }
    }
  });

// ============================================
// DUPLICATES command - List flagged duplicates
// ============================================
fileCommand
  .command('duplicates')
  .option('--session <id>', 'Session ID (default: current)')
  .description('List files flagged as duplicates')
  .action((options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Get session
    let sessionId = options.session;
    if (!sessionId) {
      const session = getActiveSession(ctx.projectId);
      if (!session) {
        error('No active session. Specify --session or start one.', opts);
        process.exit(1);
      }
      sessionId = session.id;
    }

    const filesWithIssues = getFilesWithQualityIssues(sessionId);

    // Filter to duplicates only
    const duplicates: { path: string; duplicate_of: string; note?: string }[] = [];

    for (const sf of filesWithIssues) {
      if (!sf.quality_issues) continue;
      const issues: string[] = JSON.parse(sf.quality_issues);

      // Get document path
      const doc = queryOne<{ path: string }>(
        'SELECT path FROM documents WHERE id = ?',
        [sf.document_id]
      );
      if (!doc) continue;

      for (const issue of issues) {
        if (issue.startsWith('duplicate:')) {
          const duplicateOf = issue.replace('duplicate:', '');
          const noteIssue = issues.find(i => i.startsWith('note:'));
          duplicates.push({
            path: doc.path,
            duplicate_of: duplicateOf,
            note: noteIssue ? noteIssue.replace('note:', '') : undefined
          });
        }
      }
    }

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: { duplicates }
      }));
    } else {
      if (duplicates.length === 0) {
        info('No duplicates flagged.', opts);
        return;
      }

      console.log(`Flagged duplicates (${duplicates.length}):`);
      for (const dup of duplicates) {
        console.log(`  ${dup.path} <-> ${dup.duplicate_of}`);
        if (dup.note) {
          console.log(`    Note: ${dup.note}`);
        }
      }
    }
  });

// ============================================
// ISSUES command - List all quality issues
// ============================================
fileCommand
  .command('issues')
  .option('--session <id>', 'Session ID (default: current)')
  .description('List all files with quality issues')
  .action((options) => {
    const opts = getOutputOptions(fileCommand);
    const ctx = getProjectContext(opts);
    if (!ctx) {
      process.exit(1);
    }

    // Get session
    let sessionId = options.session;
    if (!sessionId) {
      const session = getActiveSession(ctx.projectId);
      if (!session) {
        error('No active session. Specify --session or start one.', opts);
        process.exit(1);
      }
      sessionId = session.id;
    }

    const filesWithIssues = getFilesWithQualityIssues(sessionId);

    if (filesWithIssues.length === 0) {
      info('No quality issues flagged.', opts);
      return;
    }

    const issueList: { path: string; issues: string[] }[] = [];

    for (const sf of filesWithIssues) {
      const doc = queryOne<{ path: string }>(
        'SELECT path FROM documents WHERE id = ?',
        [sf.document_id]
      );
      if (!doc) continue;

      issueList.push({
        path: doc.path,
        issues: sf.quality_issues ? JSON.parse(sf.quality_issues) : []
      });
    }

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: { files_with_issues: issueList }
      }));
    } else {
      console.log(`Files with quality issues (${issueList.length}):`);
      for (const file of issueList) {
        console.log(`\n  ${file.path}:`);
        for (const issue of file.issues) {
          console.log(`    - ${issue}`);
        }
      }
    }
  });
