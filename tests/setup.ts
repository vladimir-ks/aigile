/**
 * Vitest Test Setup for AIGILE
 *
 * @author Vladimir K.S.
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

// Test database path (in-memory for tests)
export const TEST_DB_PATH = ':memory:';

// Global test setup
beforeAll(async () => {
  // Initialize test environment
  console.log('AIGILE Test Suite Starting...');
});

// Global test teardown
afterAll(async () => {
  // Cleanup test environment
  console.log('AIGILE Test Suite Complete');
});

// Per-test cleanup
afterEach(async () => {
  // Reset any shared state between tests
});
