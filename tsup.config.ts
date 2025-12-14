/**
 * tsup Build Configuration for AIGILE Package
 *
 * Author: Vladimir K.S.
 */

import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

// Read version from package.json (single source of truth)
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = pkg.version;

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
    outDir: 'dist',
    define: {
      '__AIGILE_VERSION__': JSON.stringify(version)
    }
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
    },
    define: {
      '__AIGILE_VERSION__': JSON.stringify(version)
    }
  }
]);
