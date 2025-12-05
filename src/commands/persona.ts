/**
 * Persona Command
 *
 * Manage user personas (user archetypes for UX design).
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { queryAll, queryOne, run, generateId, getNextKey } from '../db/connection.js';
import {
  success,
  error,
  data,
  details,
  getOutputOptions
} from '../services/output-formatter.js';
import { findProjectRoot, loadProjectConfig } from '../utils/config.js';
import { logCreate, logActivity, logDelete, EntityType } from '../services/activity-logger.js';

export const personaCommand = new Command('persona')
  .description('Manage user personas');

// Create persona
personaCommand
  .command('create')
  .argument('<name>', 'Persona name')
  .option('-d, --description <description>', 'Persona description')
  .option('-r, --role <role>', 'User role (e.g., "Developer", "Manager")')
  .option('-g, --goals <goals>', 'User goals (comma-separated)')
  .option('-f, --frustrations <frustrations>', 'User frustrations (comma-separated)')
  .option('--demographics <demographics>', 'Demographics info')
  .description('Create a new persona')
  .action((name: string, options) => {
    const opts = getOutputOptions(personaCommand);

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      error('Not in an AIGILE project. Run "aigile init" first.', opts);
      process.exit(1);
    }

    const config = loadProjectConfig(projectRoot);
    if (!config) {
      error('Could not load project config.', opts);
      process.exit(1);
    }

    const project = queryOne<{ id: string; key: string }>('SELECT id, key FROM projects WHERE key = ?', [config.project.key]);
    if (!project) {
      error(`Project "${config.project.key}" not found.`, opts);
      process.exit(1);
    }

    const personaId = generateId();
    const key = getNextKey(project.key);

    run(
      `INSERT INTO personas (id, project_id, key, name, description, role, goals, frustrations, demographics)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        personaId,
        project.id,
        key,
        name,
        options.description ?? null,
        options.role ?? null,
        options.goals ?? null,
        options.frustrations ?? null,
        options.demographics ?? null
      ]
    );

    logCreate(project.id, 'persona', personaId, { key, name });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { id: personaId, key, name } }));
    } else {
      success(`Created persona "${name}" (${key})`, opts);
    }
  });

// List personas
personaCommand
  .command('list')
  .alias('ls')
  .description('List all personas')
  .action(() => {
    const opts = getOutputOptions(personaCommand);

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      error('Not in an AIGILE project. Run "aigile init" first.', opts);
      process.exit(1);
    }

    const config = loadProjectConfig(projectRoot);
    if (!config) {
      error('Could not load project config.', opts);
      process.exit(1);
    }

    const personas = queryAll<{
      key: string;
      name: string;
      role: string | null;
      description: string | null;
    }>(
      `SELECT key, name, role, description FROM personas
       WHERE project_id = (SELECT id FROM projects WHERE key = ?)
       ORDER BY name`,
      [config.project.key]
    );

    data(
      personas,
      [
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Role', key: 'role', width: 20 },
        { header: 'Description', key: 'description', width: 40 }
      ],
      opts
    );
  });

// Show persona
personaCommand
  .command('show')
  .argument('<key>', 'Persona key')
  .description('Show persona details')
  .action((key: string) => {
    const opts = getOutputOptions(personaCommand);

    const persona = queryOne<{
      id: string;
      key: string;
      name: string;
      description: string | null;
      role: string | null;
      goals: string | null;
      frustrations: string | null;
      demographics: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, key, name, description, role, goals, frustrations, demographics, created_at, updated_at
       FROM personas WHERE key = ?`,
      [key]
    );

    if (!persona) {
      error(`Persona "${key}" not found.`, opts);
      process.exit(1);
    }

    // Count UX journeys for this persona
    const journeyCount = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM ux_journeys WHERE persona_id = ?',
      [persona.id]
    );

    details(
      { ...persona, journeys: journeyCount?.count ?? 0 },
      [
        { label: 'Key', key: 'key' },
        { label: 'Name', key: 'name' },
        { label: 'Role', key: 'role' },
        { label: 'Description', key: 'description' },
        { label: 'Goals', key: 'goals' },
        { label: 'Frustrations', key: 'frustrations' },
        { label: 'Demographics', key: 'demographics' },
        { label: 'UX Journeys', key: 'journeys' },
        { label: 'Created', key: 'created_at' },
        { label: 'Updated', key: 'updated_at' }
      ],
      opts
    );
  });

// Update persona
personaCommand
  .command('update')
  .argument('<key>', 'Persona key')
  .option('-n, --name <name>', 'Persona name')
  .option('-d, --description <description>', 'Persona description')
  .option('-r, --role <role>', 'User role')
  .option('-g, --goals <goals>', 'User goals')
  .option('-f, --frustrations <frustrations>', 'User frustrations')
  .option('--demographics <demographics>', 'Demographics info')
  .description('Update a persona')
  .action((key: string, options) => {
    const opts = getOutputOptions(personaCommand);

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      error('Not in an AIGILE project. Run "aigile init" first.', opts);
      process.exit(1);
    }

    const config = loadProjectConfig(projectRoot);
    if (!config) {
      error('Could not load project config.', opts);
      process.exit(1);
    }

    const project = queryOne<{ id: string }>('SELECT id FROM projects WHERE key = ?', [config.project.key]);
    if (!project) {
      error(`Project "${config.project.key}" not found.`, opts);
      process.exit(1);
    }

    const persona = queryOne<{ id: string }>('SELECT id FROM personas WHERE key = ?', [key]);
    if (!persona) {
      error(`Persona "${key}" not found.`, opts);
      process.exit(1);
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    const changes: Record<string, unknown> = {};

    if (options.name !== undefined) {
      updates.push('name = ?');
      params.push(options.name);
      changes.name = options.name;
    }

    if (options.description !== undefined) {
      updates.push('description = ?');
      params.push(options.description);
      changes.description = options.description;
    }

    if (options.role !== undefined) {
      updates.push('role = ?');
      params.push(options.role);
      changes.role = options.role;
    }

    if (options.goals !== undefined) {
      updates.push('goals = ?');
      params.push(options.goals);
      changes.goals = options.goals;
    }

    if (options.frustrations !== undefined) {
      updates.push('frustrations = ?');
      params.push(options.frustrations);
      changes.frustrations = options.frustrations;
    }

    if (options.demographics !== undefined) {
      updates.push('demographics = ?');
      params.push(options.demographics);
      changes.demographics = options.demographics;
    }

    if (updates.length === 0) {
      error('No updates specified.', opts);
      process.exit(1);
    }

    updates.push("updated_at = datetime('now')");
    params.push(persona.id);

    run(`UPDATE personas SET ${updates.join(', ')} WHERE id = ?`, params);

    logActivity(project.id, 'persona' as EntityType, persona.id, 'update', { newValue: changes });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { key, ...changes } }));
    } else {
      success(`Updated persona "${key}"`, opts);
    }
  });

// Delete persona
personaCommand
  .command('delete')
  .alias('rm')
  .argument('<key>', 'Persona key')
  .option('-f, --force', 'Force delete without confirmation')
  .description('Delete a persona')
  .action((key: string, options) => {
    const opts = getOutputOptions(personaCommand);

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      error('Not in an AIGILE project. Run "aigile init" first.', opts);
      process.exit(1);
    }

    const config = loadProjectConfig(projectRoot);
    if (!config) {
      error('Could not load project config.', opts);
      process.exit(1);
    }

    const project = queryOne<{ id: string }>('SELECT id FROM projects WHERE key = ?', [config.project.key]);
    if (!project) {
      error(`Project "${config.project.key}" not found.`, opts);
      process.exit(1);
    }

    const persona = queryOne<{ id: string; key: string; name: string }>('SELECT id, key, name FROM personas WHERE key = ?', [key]);
    if (!persona) {
      error(`Persona "${key}" not found.`, opts);
      process.exit(1);
    }

    // Check for linked UX journeys
    const linkedJourneys = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM ux_journeys WHERE persona_id = ?',
      [persona.id]
    );

    if ((linkedJourneys?.count ?? 0) > 0 && !options.force) {
      error(`Persona "${key}" has ${linkedJourneys?.count} linked UX journeys. Use --force to delete.`, opts);
      process.exit(1);
    }

    // Unlink UX journeys
    run('UPDATE ux_journeys SET persona_id = NULL WHERE persona_id = ?', [persona.id]);

    run('DELETE FROM personas WHERE id = ?', [persona.id]);

    logDelete(project.id, 'persona', persona.id, { key: persona.key, name: persona.name });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { key } }));
    } else {
      success(`Deleted persona "${key}"`, opts);
    }
  });
