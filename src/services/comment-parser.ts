/**
 * Comment Parser Service
 *
 * Parses document files for special comment markers:
 * - [[! ... ]] - User comments/questions
 * - [{! ... }] - AI suggestions/responses
 *
 * Supports both single-line and multi-line comments.
 *
 * @author Vladimir K.S.
 */

import { readFileSync } from 'fs';
import { run, queryAll, queryOne, generateId } from '../db/connection.js';

export type MarkerType = 'user' | 'ai';

export interface ParsedComment {
  type: MarkerType;
  content: string;
  lineNumber: number;
  raw: string;
}

export interface CommentSyncResult {
  total: number;
  new: number;
  resolved: number;
}

// Regex patterns for comment markers
const USER_COMMENT_PATTERN = /\[\[!\s*([\s\S]*?)\s*\]\]/g;
const AI_COMMENT_PATTERN = /\[\{!\s*([\s\S]*?)\s*\}]/g;

/**
 * Parse a file for comment markers
 */
export function parseComments(filePath: string): ParsedComment[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const comments: ParsedComment[] = [];

  // Track which line each character position maps to
  const positionToLine: number[] = [];
  let pos = 0;
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const lineLength = lines[lineNum].length + 1; // +1 for newline
    for (let i = 0; i < lineLength; i++) {
      positionToLine[pos++] = lineNum + 1; // 1-indexed line numbers
    }
  }

  // Find user comments [[! ... ]]
  let match: RegExpExecArray | null;
  USER_COMMENT_PATTERN.lastIndex = 0;
  while ((match = USER_COMMENT_PATTERN.exec(content)) !== null) {
    comments.push({
      type: 'user',
      content: match[1].trim(),
      lineNumber: positionToLine[match.index] ?? 1,
      raw: match[0]
    });
  }

  // Find AI comments [{! ... }]
  AI_COMMENT_PATTERN.lastIndex = 0;
  while ((match = AI_COMMENT_PATTERN.exec(content)) !== null) {
    comments.push({
      type: 'ai',
      content: match[1].trim(),
      lineNumber: positionToLine[match.index] ?? 1,
      raw: match[0]
    });
  }

  // Sort by line number
  comments.sort((a, b) => a.lineNumber - b.lineNumber);

  return comments;
}

/**
 * Sync parsed comments to the database
 */
export function syncCommentsToDatabase(
  documentId: string,
  comments: ParsedComment[]
): CommentSyncResult {
  const result: CommentSyncResult = {
    total: comments.length,
    new: 0,
    resolved: 0
  };

  // Get existing unresolved comments for this document
  const existingComments = queryAll<{
    id: string;
    marker_type: string;
    line_number: number;
    content: string;
  }>(
    'SELECT id, marker_type, line_number, content FROM doc_comments WHERE document_id = ? AND resolved = 0',
    [documentId]
  );

  const processedIds = new Set<string>();

  // Process each parsed comment
  for (const comment of comments) {
    const markerType = comment.type === 'user' ? 'user' : 'ai';

    // Check if this comment already exists (match by type and content)
    const existing = existingComments.find(
      (e) => e.marker_type === markerType && e.content === comment.content
    );

    if (existing) {
      processedIds.add(existing.id);
      // Update line number if changed
      if (existing.line_number !== comment.lineNumber) {
        run(
          'UPDATE doc_comments SET line_number = ? WHERE id = ?',
          [comment.lineNumber, existing.id]
        );
      }
    } else {
      // New comment
      run(
        `INSERT INTO doc_comments (id, document_id, marker_type, line_number, content)
         VALUES (?, ?, ?, ?, ?)`,
        [generateId(), documentId, markerType, comment.lineNumber, comment.content]
      );
      result.new++;
    }
  }

  // Mark comments as resolved if they no longer exist in the file
  for (const existing of existingComments) {
    if (!processedIds.has(existing.id)) {
      run('UPDATE doc_comments SET resolved = 1 WHERE id = ?', [existing.id]);
      result.resolved++;
    }
  }

  return result;
}

/**
 * Get all unresolved comments for a document
 */
export function getDocumentComments(documentId: string): Array<{
  id: string;
  type: MarkerType;
  lineNumber: number;
  content: string;
}> {
  const comments = queryAll<{
    id: string;
    marker_type: string;
    line_number: number;
    content: string;
  }>(
    'SELECT id, marker_type, line_number, content FROM doc_comments WHERE document_id = ? AND resolved = 0 ORDER BY line_number',
    [documentId]
  );

  return comments.map((c) => ({
    id: c.id,
    type: c.marker_type as MarkerType,
    lineNumber: c.line_number,
    content: c.content
  }));
}

/**
 * Get comment statistics for a project
 */
export function getCommentStats(projectId: string): {
  totalComments: number;
  userComments: number;
  aiComments: number;
  documentsWithComments: number;
} {
  const stats = queryOne<{
    total: number;
    user_count: number;
    ai_count: number;
    doc_count: number;
  }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN dc.marker_type = 'user' THEN 1 ELSE 0 END) as user_count,
      SUM(CASE WHEN dc.marker_type = 'ai' THEN 1 ELSE 0 END) as ai_count,
      COUNT(DISTINCT dc.document_id) as doc_count
    FROM doc_comments dc
    JOIN documents d ON dc.document_id = d.id
    WHERE d.project_id = ? AND dc.resolved = 0
  `, [projectId]);

  return {
    totalComments: stats?.total ?? 0,
    userComments: stats?.user_count ?? 0,
    aiComments: stats?.ai_count ?? 0,
    documentsWithComments: stats?.doc_count ?? 0
  };
}

/**
 * Mark a comment as resolved
 */
export function resolveComment(commentId: string): boolean {
  const comment = queryOne('SELECT id FROM doc_comments WHERE id = ?', [commentId]);
  if (!comment) {
    return false;
  }

  run('UPDATE doc_comments SET resolved = 1 WHERE id = ?', [commentId]);
  return true;
}
