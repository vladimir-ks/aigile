/**
 * tsup Build Configuration for AIGILE Package
 *
 * Author: Vladimir K.S.
 */

import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    target: 'node18',
    outDir: 'dist'
  },
  // CLI build
  {
    entry: ['src/bin/aigile.ts'],
    format: ['esm'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    minify: false,
    target: 'node18',
    outDir: 'dist/bin',
    banner: {
      js: '#!/usr/bin/env node'
    }
  }
]);
