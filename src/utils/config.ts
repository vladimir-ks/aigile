/**
 * Configuration Loader
 *
 * Handles loading and saving AIGILE configuration files.
 *
 * @author Vladimir K.S.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/**
 * Global configuration structure (~/.aigile/config.yaml)
 */
export interface GlobalConfig {
  version: number;
  database: {
    path: string;
    backup_enabled: boolean;
    backup_frequency: 'daily' | 'weekly' | 'manual';
    max_backups: number;
  };
  default_project: {
    key: string | null;
    name: string | null;
  };
  preferences: {
    date_format: string;
    time_format: string;
    timezone: string;
    theme: string;
  };
}

/**
 * Local project configuration structure (.aigile/config.yaml)
 */
export interface ProjectConfig {
  project: {
    key: string;
    name: string;
  };
  sync: {
    enabled: boolean;
    patterns: string[];
    ignore: string[];
  };
}

/**
 * Get the AIGILE home directory (~/.aigile)
 */
export function getAigileHome(): string {
  const home = process.env.AIGILE_HOME ?? join(homedir(), '.aigile');
  return home;
}

/**
 * Get the database path
 */
export function getDbPath(): string {
  const dbPath = process.env.AIGILE_DB_PATH ?? join(getAigileHome(), 'aigile.db');
  return dbPath;
}

/**
 * Ensure the AIGILE home directory exists
 */
export function ensureAigileHome(): void {
  const home = getAigileHome();

  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }

  // Create subdirectories
  const subdirs = ['fields', 'workflows', 'templates', 'backups'];
  for (const subdir of subdirs) {
    const path = join(home, subdir);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }
}

/**
 * Get default global configuration
 */
export function getDefaultGlobalConfig(): GlobalConfig {
  return {
    version: 1,
    database: {
      path: join(getAigileHome(), 'aigile.db'),
      backup_enabled: true,
      backup_frequency: 'daily',
      max_backups: 7
    },
    default_project: {
      key: null,
      name: null
    },
    preferences: {
      date_format: 'YYYY-MM-DD',
      time_format: 'HH:mm',
      timezone: 'UTC',
      theme: 'default'
    }
  };
}

/**
 * Load global configuration
 */
export function loadGlobalConfig(): GlobalConfig {
  const configPath = join(getAigileHome(), 'config.yaml');

  if (!existsSync(configPath)) {
    return getDefaultGlobalConfig();
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = parseYaml(content) as Partial<GlobalConfig>;
    return { ...getDefaultGlobalConfig(), ...config };
  } catch {
    return getDefaultGlobalConfig();
  }
}

/**
 * Save global configuration
 */
export function saveGlobalConfig(config: GlobalConfig): void {
  ensureAigileHome();
  const configPath = join(getAigileHome(), 'config.yaml');
  const content = stringifyYaml(config);
  writeFileSync(configPath, content, 'utf-8');
}

/**
 * Get default project configuration
 */
export function getDefaultProjectConfig(key: string, name: string): ProjectConfig {
  return {
    project: {
      key,
      name
    },
    sync: {
      enabled: true,
      patterns: ['*.feature', '*.md'],
      ignore: ['node_modules', 'dist', '.git']
    }
  };
}

/**
 * Load project configuration from .aigile/config.yaml
 */
export function loadProjectConfig(projectPath: string): ProjectConfig | null {
  const configPath = join(projectPath, '.aigile', 'config.yaml');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return parseYaml(content) as ProjectConfig;
  } catch {
    return null;
  }
}

/**
 * Save project configuration to .aigile/config.yaml
 */
export function saveProjectConfig(projectPath: string, config: ProjectConfig): void {
  const aigileDir = join(projectPath, '.aigile');

  if (!existsSync(aigileDir)) {
    mkdirSync(aigileDir, { recursive: true });
  }

  const configPath = join(aigileDir, 'config.yaml');
  const content = stringifyYaml(config);
  writeFileSync(configPath, content, 'utf-8');
}

/**
 * Find project root by looking for .aigile directory
 */
export function findProjectRoot(startPath: string = process.cwd()): string | null {
  let currentPath = startPath;

  while (currentPath !== '/') {
    if (existsSync(join(currentPath, '.aigile'))) {
      return currentPath;
    }
    currentPath = join(currentPath, '..');
  }

  return null;
}
