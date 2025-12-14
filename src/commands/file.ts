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
import { queryOne } from '../db/connection.js';
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
