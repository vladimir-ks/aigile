/**
 * Monitoring Patterns Configuration
 *
 * Central configuration for file monitoring patterns used by both
 * file-watcher and file-scanner services.
 *
 * Tri-State Monitoring System:
 * - ALLOW: Focus files - fully tracked + parsed
 * - DENY: Ignored files - skip entirely (no resources wasted)
 * - UNKNOWN: Files not in either list - tracked minimally, flagged for review
 *
 * @author Vladimir K.S.
 */

/**
 * Hard ignores - ALWAYS ignored (can't be overridden by user config)
 * These patterns prevent infinite loops and system conflicts
 */
export const HARD_IGNORE = [
  // Git directory - internal git data
  '**/.git/**',

  // Database files - CRITICAL: prevents infinite sync loops
  '**/*.db',
  '**/*.db-journal',
  '**/*.db-wal',
  '**/*.db-shm',
  '**/*.sqlite',
  '**/*.sqlite3',

  // Lock and PID files
  '**/*.pid',
  '**/*.lock',

  // OS metadata files
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/.Spotlight-V100/**',
  '**/.Trashes/**',
  '**/ehthumbs.db',
  '**/Desktop.ini',
];

/**
 * Default allow patterns (focus files)
 * These files are fully tracked with content parsing
 * User can extend via config.yaml sync.allow_patterns
 */
export const DEFAULT_ALLOW = [
  // Documentation
  '**/*.md',
  '**/*.markdown',
  '**/*.txt',
  '**/*.rst',
  '**/*.adoc',

  // BDD Features
  '**/*.feature',
  '**/*.gherkin',

  // Code - TypeScript/JavaScript
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',

  // Code - Python
  '**/*.py',
  '**/*.pyi',
  '**/*.pyx',

  // Code - Go
  '**/*.go',
  '**/*.mod',
  '**/*.sum',

  // Code - Rust
  '**/*.rs',

  // Code - Java/JVM
  '**/*.java',
  '**/*.kt',
  '**/*.kts',
  '**/*.scala',
  '**/*.groovy',

  // Code - C/C++
  '**/*.c',
  '**/*.cpp',
  '**/*.cc',
  '**/*.cxx',
  '**/*.h',
  '**/*.hpp',
  '**/*.hxx',

  // Code - Ruby
  '**/*.rb',
  '**/*.rake',
  '**/Rakefile',
  '**/Gemfile',

  // Code - PHP
  '**/*.php',

  // Code - Shell
  '**/*.sh',
  '**/*.bash',
  '**/*.zsh',
  '**/*.fish',

  // Config - YAML
  '**/*.yaml',
  '**/*.yml',

  // Config - JSON
  '**/*.json',
  '**/*.jsonc',
  '**/*.json5',

  // Config - TOML
  '**/*.toml',

  // Config - XML
  '**/*.xml',
  '**/*.xsd',
  '**/*.xsl',
  '**/*.xslt',
  '**/*.plist',

  // Config - INI/ENV
  '**/*.ini',
  '**/*.env',
  '**/*.env.*',
  '**/*.properties',
  '**/*.cfg',
  '**/*.conf',

  // Data formats
  '**/*.csv',
  '**/*.tsv',
  '**/*.sql',
  '**/*.graphql',
  '**/*.gql',

  // Web templates
  '**/*.html',
  '**/*.htm',
  '**/*.css',
  '**/*.scss',
  '**/*.sass',
  '**/*.less',
  '**/*.vue',
  '**/*.svelte',

  // Build files
  '**/Dockerfile',
  '**/Dockerfile.*',
  '**/docker-compose.yml',
  '**/docker-compose.yaml',
  '**/docker-compose.*.yml',
  '**/docker-compose.*.yaml',
  '**/Makefile',
  '**/CMakeLists.txt',

  // Package manifests
  '**/package.json',
  '**/tsconfig.json',
  '**/tsconfig.*.json',
  '**/jsconfig.json',
  '**/pyproject.toml',
  '**/setup.py',
  '**/setup.cfg',
  '**/requirements.txt',
  '**/requirements-*.txt',
  '**/Cargo.toml',
  '**/Cargo.lock',
  '**/go.mod',
  '**/go.sum',
  '**/pom.xml',
  '**/build.gradle',
  '**/settings.gradle',
];

/**
 * Default deny patterns (soft ignores)
 * These can be overridden via .aigile/ignore file
 * Files matching these patterns are completely skipped
 */
export const DEFAULT_DENY = [
  // Package managers
  '**/node_modules/**',
  '**/bower_components/**',
  '**/vendor/**',
  '**/.pnpm-store/**',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',

  // Build output
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/target/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/*.pyo',
  '**/*.class',
  '**/*.o',
  '**/*.obj',
  '**/*.so',
  '**/*.dll',
  '**/*.dylib',
  '**/*.exe',

  // Test coverage
  '**/coverage/**',
  '**/.nyc_output/**',
  '**/.coverage/**',
  '**/htmlcov/**',

  // IDE/Editor
  '**/.idea/**',
  '**/.vscode/**',
  '**/.vs/**',
  '**/*.swp',
  '**/*.swo',
  '**/*~',
  '**/.*.swp',

  // Temp files
  '**/*.tmp',
  '**/*.temp',
  '**/*.bak',
  '**/*.backup',
  '**/*.old',

  // Log files
  '**/*.log',
  '**/logs/**',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',

  // Cache
  '**/.cache/**',
  '**/.parcel-cache/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.turbo/**',

  // Environment
  '**/.env.local',
  '**/.env.*.local',

  // Misc
  '**/.terraform/**',
  '**/terraform.tfstate*',
];

/**
 * Binary file extensions (tracked with metadata only, no content parsing)
 */
export const BINARY_EXTENSIONS = [
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.svg',
  '.webp',
  '.tiff',
  '.tif',
  '.psd',
  '.ai',

  // Documents
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',

  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',

  // Audio
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.m4a',

  // Video
  '.mp4',
  '.webm',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',

  // Fonts
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',

  // Compiled
  '.wasm',
  '.node',
];

/**
 * Monitoring categories
 */
export type MonitoringCategory = 'allow' | 'deny' | 'unknown';

/**
 * Check if a file extension indicates a binary file
 */
export function isBinaryExtension(extension: string): boolean {
  const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return BINARY_EXTENSIONS.includes(ext);
}

/**
 * Get all hard ignore patterns (glob format for chokidar)
 */
export function getHardIgnorePatterns(): string[] {
  return [...HARD_IGNORE];
}

/**
 * Get default allow patterns
 */
export function getDefaultAllowPatterns(): string[] {
  return [...DEFAULT_ALLOW];
}

/**
 * Get default deny patterns
 */
export function getDefaultDenyPatterns(): string[] {
  return [...DEFAULT_DENY];
}
