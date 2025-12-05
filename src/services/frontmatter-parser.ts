/**
 * Frontmatter Parser Service
 *
 * Extracts and parses YAML frontmatter from markdown files.
 * Supports the standard AIGILE metadata schema.
 *
 * @author Vladimir K.S.
 */

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

/**
 * AIGILE standard frontmatter metadata structure
 */
export interface FrontmatterMetadata {
  status?: string;       // DRAFT, IN-REVIEW, APPROVED, TEMPLATE, PRODUCTION
  version?: string;      // e.g., "1.0", "0.1"
  tldr?: string;         // One-sentence summary
  modules?: string[];    // e.g., ["auth", "auth/oauth"]
  dependencies?: string[]; // Relative paths to dependent docs
  code_refs?: string[];  // Relative paths to code directories
  authors?: string[];    // Author names
  title?: string;        // Document title
}

/**
 * Full frontmatter structure (may contain nested metadata object)
 */
export interface Frontmatter {
  metadata?: FrontmatterMetadata;
  // Allow other top-level keys
  [key: string]: unknown;
}

/**
 * Result of parsing a file's frontmatter
 */
export interface ParsedFrontmatter {
  raw: string;           // Raw YAML string
  data: Frontmatter;     // Parsed object
  metadata: FrontmatterMetadata; // Extracted metadata (flattened)
  contentStart: number;  // Line number where content starts (after frontmatter)
  hasMetadata: boolean;  // Whether file has valid frontmatter
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Extract frontmatter from markdown content
 */
export function extractFrontmatter(content: string): ParsedFrontmatter | null {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return null;
  }

  const raw = match[1];
  const contentStart = content.substring(0, match[0].length).split('\n').length;

  try {
    const data = parseYaml(raw) as Frontmatter;

    // Extract metadata - may be nested under 'metadata' key or at root
    let metadata: FrontmatterMetadata = {};

    if (data?.metadata && typeof data.metadata === 'object') {
      // Nested metadata object (preferred format)
      metadata = data.metadata as FrontmatterMetadata;
    } else {
      // Check for metadata fields at root level (legacy support)
      metadata = {
        status: data?.status as string | undefined,
        version: data?.version as string | undefined,
        tldr: data?.tldr as string | undefined,
        modules: data?.modules as string[] | undefined,
        dependencies: data?.dependencies as string[] | undefined,
        code_refs: data?.code_refs as string[] | undefined,
        authors: data?.authors as string[] | undefined,
        title: data?.title as string | undefined,
      };
    }

    // Normalize arrays
    if (metadata.modules && !Array.isArray(metadata.modules)) {
      metadata.modules = [String(metadata.modules)];
    }
    if (metadata.dependencies && !Array.isArray(metadata.dependencies)) {
      metadata.dependencies = [String(metadata.dependencies)];
    }
    if (metadata.code_refs && !Array.isArray(metadata.code_refs)) {
      metadata.code_refs = [String(metadata.code_refs)];
    }
    if (metadata.authors && !Array.isArray(metadata.authors)) {
      metadata.authors = [String(metadata.authors)];
    }

    return {
      raw,
      data,
      metadata,
      contentStart,
      hasMetadata: true
    };
  } catch {
    // Invalid YAML - return null
    return null;
  }
}

/**
 * Parse frontmatter from a file path
 */
export function parseFrontmatterFromFile(filePath: string): ParsedFrontmatter | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return extractFrontmatter(content);
  } catch {
    return null;
  }
}

/**
 * Check if a file has valid frontmatter
 */
export function hasFrontmatter(filePath: string): boolean {
  const result = parseFrontmatterFromFile(filePath);
  return result !== null && result.hasMetadata;
}

/**
 * Get just the metadata from a file (convenience function)
 */
export function getFileMetadata(filePath: string): FrontmatterMetadata | null {
  const result = parseFrontmatterFromFile(filePath);
  return result?.metadata ?? null;
}

/**
 * Serialize metadata back to YAML frontmatter string
 */
export function serializeMetadata(metadata: FrontmatterMetadata): string {
  // Build YAML manually for clean output
  const lines: string[] = ['---', 'metadata:'];

  if (metadata.status) {
    lines.push(`  status: ${metadata.status}`);
  }
  if (metadata.version) {
    lines.push(`  version: ${metadata.version}`);
  }
  if (metadata.tldr) {
    lines.push(`  tldr: "${metadata.tldr.replace(/"/g, '\\"')}"`);
  }
  if (metadata.title) {
    lines.push(`  title: "${metadata.title.replace(/"/g, '\\"')}"`);
  }
  if (metadata.authors && metadata.authors.length > 0) {
    lines.push(`  authors: [${metadata.authors.map(a => `"${a}"`).join(', ')}]`);
  }
  if (metadata.modules && metadata.modules.length > 0) {
    lines.push(`  modules: [${metadata.modules.join(', ')}]`);
  }
  if (metadata.dependencies && metadata.dependencies.length > 0) {
    lines.push(`  dependencies: [${metadata.dependencies.join(', ')}]`);
  }
  if (metadata.code_refs && metadata.code_refs.length > 0) {
    lines.push(`  code_refs: [${metadata.code_refs.join(', ')}]`);
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Update metadata in a file's content (returns new content)
 */
export function updateFrontmatterContent(
  content: string,
  updates: Partial<FrontmatterMetadata>
): string {
  const existing = extractFrontmatter(content);

  if (!existing) {
    // No existing frontmatter - add it
    const metadata: FrontmatterMetadata = {
      status: updates.status ?? 'DRAFT',
      version: updates.version ?? '0.1',
      tldr: updates.tldr ?? '',
      modules: updates.modules ?? [],
      dependencies: updates.dependencies ?? [],
      code_refs: updates.code_refs ?? [],
    };
    return serializeMetadata(metadata) + '\n\n' + content;
  }

  // Merge updates with existing metadata
  const merged: FrontmatterMetadata = {
    ...existing.metadata,
    ...updates
  };

  // Handle array merging for dependencies, modules, code_refs
  if (updates.dependencies && existing.metadata.dependencies) {
    merged.dependencies = [...new Set([
      ...existing.metadata.dependencies,
      ...updates.dependencies
    ])];
  }
  if (updates.modules && existing.metadata.modules) {
    merged.modules = [...new Set([
      ...existing.metadata.modules,
      ...updates.modules
    ])];
  }
  if (updates.code_refs && existing.metadata.code_refs) {
    merged.code_refs = [...new Set([
      ...existing.metadata.code_refs,
      ...updates.code_refs
    ])];
  }

  // Replace frontmatter in content
  const newFrontmatter = serializeMetadata(merged);
  return content.replace(FRONTMATTER_REGEX, newFrontmatter + '\n\n');
}
