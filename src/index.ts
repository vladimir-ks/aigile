/**
 * AIGILE - JIRA-compatible Agile Project Management Library
 *
 * @packageDocumentation
 * @module @vladimir-ks/aigile
 * @author Vladimir K.S.
 */

// Entity exports (to be implemented)
export * from './entities/base';

// Database exports (to be implemented)
// export * from './db/connection';

// Custom fields exports (to be implemented)
// export * from './fields/loader';

// Workflow exports (to be implemented)
// export * from './workflows/engine';

// Version - injected at build time from package.json
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - __AIGILE_VERSION__ is defined by tsup at build time
declare const __AIGILE_VERSION__: string;
export const VERSION = typeof __AIGILE_VERSION__ !== 'undefined' ? __AIGILE_VERSION__ : '0.0.0-dev';
