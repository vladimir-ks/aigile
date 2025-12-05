/**
 * Document Command
 *
 * Document management and frontmatter metadata operations.
 * Allows querying, viewing, and updating document frontmatter.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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
  getDocumentByPath,
  getDocumentsByMetaStatus,
  getDocumentsByModule,
  getDocumentsWithFrontmatter,
  getDocumentsWithoutFrontmatter,
  getTemplateDocuments,
  searchDocumentsByTldr,
  DocumentWithMetadata
} from '../services/file-scanner.js';
import {
  parseFrontmatterFromFile,
  updateFrontmatterContent,
  FrontmatterMetadata
} from '../services/frontmatter-parser.js';

export const docCommand = new Command('doc')
  .description('Document management and frontmatter operations');

/**
 * Helper to get project ID from config
 */
function getProjectId(opts: OutputOptions): { projectId: string; projectRoot: string } | null {
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

  const project = queryOne<{ id: string }>('SELECT id FROM projects WHERE key = ?', [config.project.key]);
  if (!project) {
    error(`Project "${config.project.key}" not found in database.`, opts);
    return null;
  }

  return { projectId: project.id, projectRoot };
}

/**
 * Format document for display
 */
function formatDocForDisplay(doc: DocumentWithMetadata): Record<string, unknown> {
  return {
    path: doc.path,
    filename: doc.filename,
    extension: doc.extension,
    sync_status: doc.status,
    has_frontmatter: doc.has_frontmatter ? 'Yes' : 'No',
    meta_status: doc.meta_status ?? '-',
    meta_version: doc.meta_version ?? '-',
    meta_tldr: doc.meta_tldr ?? '-',
    meta_modules: doc.meta_modules ? JSON.parse(doc.meta_modules).join(', ') : '-',
    meta_dependencies: doc.meta_dependencies ? JSON.parse(doc.meta_dependencies).join(', ') : '-'
  };
}

// List command - list documents with metadata filters
docCommand
  .command('list')
  .alias('ls')
  .option('--meta-status <status>', 'Filter by frontmatter status (DRAFT, IN-REVIEW, APPROVED, TEMPLATE)')
  .option('--module <module>', 'Filter by module')
  .option('--with-frontmatter', 'Only show documents with frontmatter')
  .option('--without-frontmatter', 'Only show documents without frontmatter (shadow mode)')
  .option('--templates', 'Only show TEMPLATE documents')
  .option('--search <term>', 'Search by tldr content')
  .description('List documents with metadata filters')
  .action((options) => {
    const opts = getOutputOptions(docCommand);
    const ctx = getProjectId(opts);
    if (!ctx) {
      process.exit(1);
    }

    let documents: DocumentWithMetadata[] = [];

    if (options.metaStatus) {
      documents = getDocumentsByMetaStatus(ctx.projectId, options.metaStatus);
    } else if (options.module) {
      documents = getDocumentsByModule(ctx.projectId, options.module);
    } else if (options.withFrontmatter) {
      documents = getDocumentsWithFrontmatter(ctx.projectId);
    } else if (options.withoutFrontmatter) {
      documents = getDocumentsWithoutFrontmatter(ctx.projectId);
    } else if (options.templates) {
      documents = getTemplateDocuments(ctx.projectId);
    } else if (options.search) {
      documents = searchDocumentsByTldr(ctx.projectId, options.search);
    } else {
      // Default: all documents with frontmatter
      documents = getDocumentsWithFrontmatter(ctx.projectId);
    }

    const displayDocs = documents.map(formatDocForDisplay);

    data(
      displayDocs,
      [
        { header: 'Path', key: 'path', width: 45 },
        { header: 'Status', key: 'meta_status', width: 12 },
        { header: 'Version', key: 'meta_version', width: 8 },
        { header: 'Modules', key: 'meta_modules', width: 20 }
      ],
      opts
    );
  });

// Show command - show document details
docCommand
  .command('show <path>')
  .description('Show document details including frontmatter metadata')
  .action((filePath: string) => {
    const opts = getOutputOptions(docCommand);
    const ctx = getProjectId(opts);
    if (!ctx) {
      process.exit(1);
    }

    const doc = getDocumentByPath(ctx.projectId, filePath);
    if (!doc) {
      error(`Document not found: ${filePath}`, opts);
      process.exit(1);
    }

    // Parse live frontmatter from file
    const fullPath = join(ctx.projectRoot, filePath);
    const parsed = parseFrontmatterFromFile(fullPath);

    if (opts.json) {
      console.log(JSON.stringify({
        success: true,
        data: {
          database: doc,
          frontmatter: parsed ? {
            raw: parsed.raw,
            metadata: parsed.metadata
          } : null
        }
      }));
    } else {
      const displayData: Record<string, unknown> = {
        path: doc.path,
        filename: doc.filename,
        extension: doc.extension,
        sync_status: doc.status,
        size_bytes: doc.size_bytes,
        last_scanned: doc.last_scanned_at,
        has_frontmatter: doc.has_frontmatter ? 'Yes' : 'No'
      };

      if (parsed) {
        displayData.meta_status = parsed.metadata.status ?? '-';
        displayData.meta_version = parsed.metadata.version ?? '-';
        displayData.meta_tldr = parsed.metadata.tldr ?? '-';
        displayData.meta_title = parsed.metadata.title ?? '-';
        displayData.meta_modules = parsed.metadata.modules?.join(', ') ?? '-';
        displayData.meta_dependencies = parsed.metadata.dependencies?.join(', ') ?? '-';
        displayData.meta_code_refs = parsed.metadata.code_refs?.join(', ') ?? '-';
        displayData.meta_authors = parsed.metadata.authors?.join(', ') ?? '-';
      }

      details(
        displayData,
        [
          { label: 'Path', key: 'path' },
          { label: 'Filename', key: 'filename' },
          { label: 'Extension', key: 'extension' },
          { label: 'Sync Status', key: 'sync_status' },
          { label: 'Size (bytes)', key: 'size_bytes' },
          { label: 'Last Scanned', key: 'last_scanned' },
          { label: 'Has Frontmatter', key: 'has_frontmatter' },
          { label: 'Meta Status', key: 'meta_status' },
          { label: 'Meta Version', key: 'meta_version' },
          { label: 'Meta Title', key: 'meta_title' },
          { label: 'Meta TLDR', key: 'meta_tldr' },
          { label: 'Meta Modules', key: 'meta_modules' },
          { label: 'Meta Dependencies', key: 'meta_dependencies' },
          { label: 'Meta Code Refs', key: 'meta_code_refs' },
          { label: 'Meta Authors', key: 'meta_authors' }
        ],
        opts
      );
    }
  });

// Update command - update frontmatter metadata
docCommand
  .command('update <path>')
  .option('--status <status>', 'Set metadata status (DRAFT, IN-REVIEW, APPROVED, TEMPLATE, PRODUCTION)')
  .option('--version <version>', 'Set metadata version')
  .option('--tldr <tldr>', 'Set one-sentence summary')
  .option('--title <title>', 'Set document title')
  .option('--add-module <module>', 'Add a module to the modules list')
  .option('--add-dependency <dep>', 'Add a dependency path')
  .option('--add-code-ref <ref>', 'Add a code reference path')
  .option('--add-author <author>', 'Add an author')
  .option('--dry-run', 'Show what would be changed without modifying file')
  .description('Update frontmatter metadata in a document')
  .action((filePath: string, options) => {
    const opts = getOutputOptions(docCommand);
    const ctx = getProjectId(opts);
    if (!ctx) {
      process.exit(1);
    }

    const fullPath = join(ctx.projectRoot, filePath);

    // Read current file content
    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      error(`Could not read file: ${filePath}`, opts);
      process.exit(1);
    }

    // Build updates object
    const updates: Partial<FrontmatterMetadata> = {};

    if (options.status) {
      updates.status = options.status;
    }
    if (options.version) {
      updates.version = options.version;
    }
    if (options.tldr) {
      updates.tldr = options.tldr;
    }
    if (options.title) {
      updates.title = options.title;
    }
    if (options.addModule) {
      updates.modules = [options.addModule];
    }
    if (options.addDependency) {
      updates.dependencies = [options.addDependency];
    }
    if (options.addCodeRef) {
      updates.code_refs = [options.addCodeRef];
    }
    if (options.addAuthor) {
      updates.authors = [options.addAuthor];
    }

    if (Object.keys(updates).length === 0) {
      error('No updates specified. Use --status, --version, --tldr, etc.', opts);
      process.exit(1);
    }

    // Generate updated content
    const newContent = updateFrontmatterContent(content, updates);

    if (options.dryRun) {
      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          dryRun: true,
          updates,
          preview: newContent.substring(0, 500) + (newContent.length > 500 ? '...' : '')
        }));
      } else {
        info('Dry run - would update frontmatter with:', opts);
        console.log(JSON.stringify(updates, null, 2));
        console.log('\nNew frontmatter preview:');
        const lines = newContent.split('\n');
        const endIndex = lines.findIndex((l, i) => i > 0 && l === '---');
        lines.slice(0, endIndex + 1).forEach(l => console.log(l));
      }
      return;
    }

    // Write updated content
    try {
      writeFileSync(fullPath, newContent, 'utf-8');
      success(`Updated frontmatter in ${filePath}`, opts);

      if (!opts.json) {
        info('Run "aigile sync scan" to update the database.', opts);
      }
    } catch (err) {
      error(`Could not write file: ${filePath}`, opts);
      process.exit(1);
    }
  });

// Init command - add frontmatter to a file without it
docCommand
  .command('init-frontmatter <path>')
  .option('--status <status>', 'Initial status (default: DRAFT)')
  .option('--version <version>', 'Initial version (default: 0.1)')
  .option('--tldr <tldr>', 'One-sentence summary')
  .option('--title <title>', 'Document title')
  .description('Add frontmatter to a file that does not have it')
  .action((filePath: string, options) => {
    const opts = getOutputOptions(docCommand);
    const ctx = getProjectId(opts);
    if (!ctx) {
      process.exit(1);
    }

    const fullPath = join(ctx.projectRoot, filePath);

    // Read current file content
    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      error(`Could not read file: ${filePath}`, opts);
      process.exit(1);
    }

    // Check if file already has frontmatter
    const existing = parseFrontmatterFromFile(fullPath);
    if (existing) {
      error('File already has frontmatter. Use "aigile doc update" instead.', opts);
      process.exit(1);
    }

    // Build initial metadata
    const metadata: Partial<FrontmatterMetadata> = {
      status: options.status ?? 'DRAFT',
      version: options.version ?? '0.1',
      tldr: options.tldr ?? '',
      title: options.title
    };

    // Add frontmatter
    const newContent = updateFrontmatterContent(content, metadata);

    try {
      writeFileSync(fullPath, newContent, 'utf-8');
      success(`Added frontmatter to ${filePath}`, opts);

      if (!opts.json) {
        info('Run "aigile sync scan" to update the database.', opts);
      }
    } catch {
      error(`Could not write file: ${filePath}`, opts);
      process.exit(1);
    }
  });

// Stats command - show frontmatter statistics
docCommand
  .command('stats')
  .description('Show frontmatter statistics for the project')
  .action(() => {
    const opts = getOutputOptions(docCommand);
    const ctx = getProjectId(opts);
    if (!ctx) {
      process.exit(1);
    }

    const withFrontmatter = getDocumentsWithFrontmatter(ctx.projectId);
    const withoutFrontmatter = getDocumentsWithoutFrontmatter(ctx.projectId);
    const templates = getTemplateDocuments(ctx.projectId);
    const drafts = getDocumentsByMetaStatus(ctx.projectId, 'DRAFT');
    const inReview = getDocumentsByMetaStatus(ctx.projectId, 'IN-REVIEW');
    const approved = getDocumentsByMetaStatus(ctx.projectId, 'APPROVED');

    const stats = {
      total_documents: withFrontmatter.length + withoutFrontmatter.length,
      with_frontmatter: withFrontmatter.length,
      without_frontmatter: withoutFrontmatter.length,
      templates: templates.length,
      drafts: drafts.length,
      in_review: inReview.length,
      approved: approved.length
    };

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: stats }));
    } else {
      details(
        stats,
        [
          { label: 'Total Documents', key: 'total_documents' },
          { label: 'With Frontmatter', key: 'with_frontmatter' },
          { label: 'Without Frontmatter', key: 'without_frontmatter' },
          { label: 'TEMPLATE', key: 'templates' },
          { label: 'DRAFT', key: 'drafts' },
          { label: 'IN-REVIEW', key: 'in_review' },
          { label: 'APPROVED', key: 'approved' }
        ],
        opts
      );
    }
  });
