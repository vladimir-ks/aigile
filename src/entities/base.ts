/**
 * Base Entity Class
 *
 * All AIGILE entities extend this base class which provides
 * common fields and behaviors.
 *
 * @author Vladimir K.S.
 */

import { randomUUID } from 'crypto';

/**
 * Common fields present in all AIGILE entities
 */
export interface BaseEntityFields {
  /** Unique identifier (UUID) */
  id: string;

  /** Human-readable key (e.g., PROJECT-123) */
  key: string;

  /** Creation timestamp (ISO 8601) */
  created_at: string;

  /** Last update timestamp (ISO 8601) */
  updated_at: string;

  /** Custom fields stored as JSON */
  metadata: Record<string, unknown>;
}

/**
 * Priority levels (JIRA-compatible)
 */
export type Priority = 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';

/**
 * Story point values (Fibonacci sequence)
 */
export type StoryPoints = 1 | 2 | 3 | 5 | 8 | 13 | 21;

/**
 * Base class for all AIGILE entities
 */
export abstract class BaseEntity implements BaseEntityFields {
  id: string;
  key: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;

  constructor(data: Partial<BaseEntityFields> = {}) {
    this.id = data.id ?? randomUUID();
    this.key = data.key ?? '';
    this.created_at = data.created_at ?? new Date().toISOString();
    this.updated_at = data.updated_at ?? new Date().toISOString();
    this.metadata = data.metadata ?? {};
  }

  /**
   * Update the entity's updated_at timestamp
   */
  touch(): void {
    this.updated_at = new Date().toISOString();
  }

  /**
   * Get a custom field value from metadata
   */
  getCustomField<T>(name: string): T | undefined {
    return this.metadata[name] as T | undefined;
  }

  /**
   * Set a custom field value in metadata
   */
  setCustomField<T>(name: string, value: T): void {
    this.metadata[name] = value;
    this.touch();
  }

  /**
   * Convert entity to plain object for serialization
   */
  abstract toJSON(): Record<string, unknown>;
}
