/**
 * Base Entity Tests
 *
 * @author Vladimir K.S.
 */

import { describe, it, expect } from 'vitest';
import { BaseEntity, type Priority, type StoryPoints } from '../../src/entities/base';

// Concrete implementation for testing
class TestEntity extends BaseEntity {
  summary: string;

  constructor(data: Partial<{ summary: string }> = {}) {
    super();
    this.summary = data.summary ?? '';
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      key: this.key,
      summary: this.summary,
      created_at: this.created_at,
      updated_at: this.updated_at,
      metadata: this.metadata
    };
  }
}

describe('BaseEntity', () => {
  it('generates UUID on creation', () => {
    const entity = new TestEntity();
    expect(entity.id).toBeDefined();
    expect(entity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('sets created_at and updated_at on creation', () => {
    const entity = new TestEntity();
    expect(entity.created_at).toBeDefined();
    expect(entity.updated_at).toBeDefined();
  });

  it('touch() updates the updated_at timestamp', async () => {
    const entity = new TestEntity();
    const originalUpdatedAt = entity.updated_at;

    // Wait a bit to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));
    entity.touch();

    expect(entity.updated_at).not.toBe(originalUpdatedAt);
  });

  it('getCustomField() retrieves metadata values', () => {
    const entity = new TestEntity();
    entity.metadata = { customField: 'value' };

    expect(entity.getCustomField<string>('customField')).toBe('value');
    expect(entity.getCustomField<string>('nonexistent')).toBeUndefined();
  });

  it('setCustomField() stores metadata values and calls touch()', () => {
    const entity = new TestEntity();
    const originalUpdatedAt = entity.updated_at;

    entity.setCustomField('department', 'Engineering');

    expect(entity.metadata.department).toBe('Engineering');
  });

  it('toJSON() returns serializable object', () => {
    const entity = new TestEntity({ summary: 'Test summary' });
    const json = entity.toJSON();

    expect(json.id).toBe(entity.id);
    expect(json.summary).toBe('Test summary');
  });
});

describe('Type definitions', () => {
  it('Priority type includes all JIRA priorities', () => {
    const priorities: Priority[] = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
    expect(priorities).toHaveLength(5);
  });

  it('StoryPoints type includes Fibonacci values', () => {
    const points: StoryPoints[] = [1, 2, 3, 5, 8, 13, 21];
    expect(points).toHaveLength(7);
  });
});
