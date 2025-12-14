/**
 * Init Command
 *
 * Initialize AIGILE in a git repository with profile support.
 * Supports three profiles: full-repo, subrepo, module.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join, relative, basename } from 'path';
import { isGitRepo, getGitRoot, getRepoName, generateProjectKey, getSuperprojectRoot } from '../utils/git.js';
import {
  saveProjectConfig,
  getDefaultProjectConfig,
  loadProjectConfig,
  ensureAigileHome
} from '../utils/config.js';
import { queryOne, run, generateId } from '../db/connection.js';
import {
  success,
  error,
  info,
  warning,
  blank,
  header,
  getOutputOptions,
  type OutputOptions
} from '../services/output-formatter.js';
import {
  InitProfile,
  DbMode,
  getTemplatesForProfile,
  writeTemplates,
  generateConfigYaml,
  AigileConfig
} from '../services/template-packs.js';

export const initCommand = new Command('init')
  .description('Initialize AIGILE in current or specified directory')
  .argument('[path]', 'Directory path (defaults to current directory)')
  .option('-k, --key <key>', 'Project key (auto-generated if not specified)')
  .option('-n, --name <name>', 'Project name (auto-detected if not specified)')
  .option('-p, --profile <profile>', 'Init profile: full-repo, subrepo, module')
  .option('--db-mode <mode>', 'Database mode: local, shared (default based on profile)')
  .option('--module-kind <kind>', 'Module kind: library, service, ui, cli, other (for module profile)')
  .option('--skip-templates', 'Skip template file creation')
  .option('-f, --force', 'Reinitialize existing project')
  .action(async (pathArg: string | undefined, options) => {
    const opts = getOutputOptions(initCommand);
    const targetPath = resolve(pathArg ?? process.cwd());

    try {
      await initProject(targetPath, options, opts);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err), opts);
      process.exit(1);
    }
  });

interface InitOptions {
  key?: string;
  name?: string;
  profile?: InitProfile;
  dbMode?: DbMode;
  moduleKind?: string;
  skipTemplates?: boolean;
  force?: boolean;
}

/**
 * Detect git context to determine appropriate profile
 */
function detectGitContext(targetPath: string): {
  gitRoot: string;
  isSubmodule: boolean;
  isSubdirectory: boolean;
  superprojectRoot: string | null;
  relativePath: string;
} {
  const gitRoot = getGitRoot(targetPath);
  if (!gitRoot) {
    throw new Error('Could not determine git root directory.');
  }

  const superprojectRoot = getSuperprojectRoot(targetPath);
  const isSubmodule = superprojectRoot !== null;
  const isSubdirectory = targetPath !== gitRoot;
  const relativePath = relative(gitRoot, targetPath);

  return {
    gitRoot,
    isSubmodule,
    isSubdirectory,
    superprojectRoot,
    relativePath
  };
}

/**
 * Valid profiles for AIGILE initialization
 */
const VALID_PROFILES: InitProfile[] = ['full-repo', 'subrepo', 'module'];

/**
 * Determine profile based on context and options
 */
function determineProfile(
  context: ReturnType<typeof detectGitContext>,
  options: InitOptions,
  opts: OutputOptions
): InitProfile {
  // If explicitly specified, validate and use that
  if (options.profile) {
    if (!VALID_PROFILES.includes(options.profile)) {
      throw new Error(
        `Invalid profile "${options.profile}". Valid profiles: ${VALID_PROFILES.join(', ')}`
      );
    }
    return options.profile;
  }

  // Auto-detect based on context
  if (context.isSubmodule) {
    info('Detected git submodule - using subrepo profile', opts);
    return 'subrepo';
  }

  if (context.isSubdirectory) {
    // Check if parent has .aigile
    const parentAigile = join(context.gitRoot, '.aigile');
    if (existsSync(parentAigile)) {
      info('Detected subdirectory with parent AIGILE - using module profile', opts);
      return 'module';
    }
  }

  // Default: full-repo at git root
  return 'full-repo';
}

/**
 * Determine database mode based on profile and options
 */
function determineDbMode(
  profile: InitProfile,
  context: ReturnType<typeof detectGitContext>,
  options: InitOptions
): { mode: DbMode; path: string } {
  if (options.dbMode) {
    const mode = options.dbMode;
    if (mode === 'local') {
      return { mode: 'local', path: '.aigile/aigile.db' };
    }
    // shared mode - need to find parent DB
    const parentDbPath = findParentDb(context);
    return { mode: 'shared', path: parentDbPath };
  }

  // Default based on profile
  switch (profile) {
    case 'full-repo':
      return { mode: 'local', path: '.aigile/aigile.db' };
    case 'subrepo':
      // Default to local for subrepo (isolated product)
      return { mode: 'local', path: '.aigile/aigile.db' };
    case 'module':
      // Modules always share parent DB
      const parentDbPath = findParentDb(context);
      return { mode: 'shared', path: parentDbPath };
    default:
      // Safety fallback - should never reach here due to validation
      return { mode: 'local', path: '.aigile/aigile.db' };
  }
}

/**
 * Find parent database path
 */
function findParentDb(context: ReturnType<typeof detectGitContext>): string {
  // For modules, parent is at git root
  const parentAigile = join(context.gitRoot, '.aigile', 'aigile.db');
  if (existsSync(parentAigile)) {
    // Calculate relative path from target to parent
    const depth = context.relativePath.split('/').filter(p => p).length;
    return '../'.repeat(depth) + '.aigile/aigile.db';
  }

  // For submodules, check superproject
  if (context.superprojectRoot) {
    const superprojectAigile = join(context.superprojectRoot, '.aigile', 'aigile.db');
    if (existsSync(superprojectAigile)) {
      return '../.aigile/aigile.db';
    }
  }

  // Fallback to local
  return '.aigile/aigile.db';
}

async function initProject(
  targetPath: string,
  options: InitOptions,
  opts: OutputOptions
): Promise<void> {
  // Step 1: Check for git repository
  if (!isGitRepo(targetPath)) {
    throw new Error('AIGILE requires a git repository. Run "git init" first.');
  }

  // Step 2: Detect git context
  const context = detectGitContext(targetPath);

  // Step 3: Check for existing initialization
  const aigileDir = join(targetPath, '.aigile');
  if (existsSync(aigileDir) && !options.force) {
    const existingConfig = loadProjectConfig(targetPath);
    if (existingConfig?.project?.key) {
      throw new Error(
        `AIGILE already initialized (project: ${existingConfig.project.key}). ` +
        'Use --force to reinitialize.'
      );
    }
  }

  // Step 4: Determine profile
  const profile = determineProfile(context, options, opts);

  // Step 5: Validate profile for context
  if (profile === 'full-repo' && context.isSubdirectory) {
    const parentAigile = join(context.gitRoot, '.aigile');
    if (existsSync(parentAigile)) {
      throw new Error(
        'Cannot use full-repo profile in subdirectory when parent has AIGILE. ' +
        'Use --profile module instead.'
      );
    }
  }

  // Step 6: Determine database mode
  const dbConfig = determineDbMode(profile, context, options);

  // Step 7: Determine project key and name
  let moduleName = basename(targetPath);
  if (profile === 'module') {
    moduleName = options.name ?? moduleName;
  }

  const repoName = profile === 'module' ? moduleName : getRepoName(context.gitRoot);
  const projectKey = options.key ?? generateProjectKey(repoName);
  const projectName = options.name ?? repoName;

  // Step 8: Ensure global ~/.aigile/ exists
  ensureAigileHome();

  // Step 9: Create .aigile/ directory
  if (!existsSync(aigileDir)) {
    mkdirSync(aigileDir, { recursive: true });
  }

  // Step 10: Generate and write config.yaml
  const aigileConfig: AigileConfig = {
    db: {
      mode: dbConfig.mode,
      path: dbConfig.path
    },
    profile,
    repo_root: '.'
  };

  if (profile === 'module') {
    aigileConfig.module = {
      name: moduleName,
      kind: options.moduleKind ?? 'other',
      path: context.relativePath
    };
    aigileConfig.parent_repo_root = '../'.repeat(context.relativePath.split('/').filter(p => p).length);
  }

  if (profile === 'subrepo' && context.superprojectRoot) {
    aigileConfig.parent_repo_root = '..';
  }

  const configYaml = generateConfigYaml(aigileConfig, projectKey, projectName);
  writeFileSync(join(aigileDir, 'config.yaml'), configYaml, 'utf-8');

  // Step 11: Write template files (unless skipped)
  let templatesResult = { written: 0, skipped: 0 };
  if (!options.skipTemplates) {
    const templates = getTemplatesForProfile(profile, moduleName);
    templatesResult = writeTemplates(aigileDir, templates);
  }

  // Step 12: Register project in central database (only for local DB mode)
  if (dbConfig.mode === 'local') {
    registerProject(targetPath, projectId => {
      const existingProject = queryOne<{ id: string }>(
        'SELECT id FROM projects WHERE path = ?',
        [targetPath]
      );

      const id = existingProject?.id ?? generateId();

      if (existingProject) {
        run(
          `UPDATE projects SET key = ?, name = ?, updated_at = datetime('now') WHERE id = ?`,
          [projectKey, projectName, id]
        );
      } else {
        run(
          `INSERT INTO projects (id, key, name, path, is_default) VALUES (?, ?, ?, ?, ?)`,
          [id, projectKey, projectName, targetPath, 0]
        );
      }

      // Set as default if no other default exists
      const defaultProject = queryOne<{ id: string }>(
        'SELECT id FROM projects WHERE is_default = 1',
        []
      );

      if (!defaultProject) {
        run('UPDATE projects SET is_default = 1 WHERE id = ?', [id]);
      }

      return id;
    });
  }

  // Step 13: Update .gitignore
  updateGitignore(targetPath, opts);

  // Step 14: Output success message
  if (opts.json) {
    console.log(JSON.stringify({
      success: true,
      project: {
        key: projectKey,
        name: projectName,
        path: targetPath,
        profile,
        dbMode: dbConfig.mode
      },
      templates: templatesResult
    }));
  } else {
    blank();
    success(`AIGILE initialized with ${profile} profile`, opts);
    blank();
    header('Project Configuration:', opts);
    console.log(`  Key:      ${projectKey}`);
    console.log(`  Name:     ${projectName}`);
    console.log(`  Path:     ${targetPath}`);
    console.log(`  Profile:  ${profile}`);
    console.log(`  DB Mode:  ${dbConfig.mode}`);

    if (templatesResult.written > 0 || templatesResult.skipped > 0) {
      blank();
      header('Templates:', opts);
      console.log(`  Written:  ${templatesResult.written} files`);
      console.log(`  Skipped:  ${templatesResult.skipped} files (already exist)`);
    }

    blank();
    header('Next steps:', opts);
    if (profile === 'full-repo' || profile === 'subrepo') {
      console.log('  1. Fill in 00_DOCS/00_vision/01_mission-vision.md');
      console.log('  2. Run "aigile sync scan" to index your files');
      console.log('  3. Run "aigile daemon install && aigile daemon start" for auto-sync');
    } else {
      console.log('  1. Fill in docs/01_module-overview.md');
      console.log('  2. Run "aigile sync scan" from repo root to index files');
    }
    blank();
  }
}

function registerProject(
  projectPath: string,
  register: (existingId: string | null) => string
): string {
  return register(null);
}

function updateGitignore(repoPath: string, opts: OutputOptions): void {
  const gitignorePath = join(repoPath, '.gitignore');
  const aigilePattern = '.aigile/';

  if (!existsSync(gitignorePath)) {
    info('No .gitignore found. Consider adding ".aigile/" to ignore local config.', opts);
    return;
  }

  const content = readFileSync(gitignorePath, 'utf-8');

  // Check if already present
  const lines = content.split('\n');
  const hasPattern = lines.some(line => {
    const trimmed = line.trim();
    return trimmed === '.aigile' || trimmed === '.aigile/' || trimmed === '/.aigile/';
  });

  if (hasPattern) {
    return; // Already in .gitignore
  }

  // Append to .gitignore
  const newLine = content.endsWith('\n') ? '' : '\n';
  appendFileSync(gitignorePath, `${newLine}# AIGILE local config\n.aigile/\n`);
  info('Added ".aigile/" to .gitignore', opts);
}
