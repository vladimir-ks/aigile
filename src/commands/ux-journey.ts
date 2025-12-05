/**
 * UX Journey Command
 *
 * Manage user experience journeys.
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

export const uxJourneyCommand = new Command('ux-journey')
  .alias('journey')
  .description('Manage UX journeys');

// Create UX journey
uxJourneyCommand
  .command('create')
  .argument('<name>', 'Journey name')
  .option('-d, --description <description>', 'Journey description')
  .option('-p, --persona <key>', 'Associated persona key')
  .option('-s, --stages <stages>', 'Journey stages (JSON array or comma-separated)')
  .option('-t, --touchpoints <touchpoints>', 'Touchpoints (comma-separated)')
  .option('--pain-points <painPoints>', 'Pain points (comma-separated)')
  .option('--opportunities <opportunities>', 'Opportunities (comma-separated)')
  .description('Create a new UX journey')
  .action((name: string, options) => {
    const opts = getOutputOptions(uxJourneyCommand);

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

    let personaId: string | null = null;
    if (options.persona) {
      const persona = queryOne<{ id: string }>('SELECT id FROM personas WHERE key = ?', [options.persona]);
      if (!persona) {
        error(`Persona "${options.persona}" not found.`, opts);
        process.exit(1);
      }
      personaId = persona.id;
    }

    const journeyId = generateId();
    const key = getNextKey(project.key);

    run(
      `INSERT INTO ux_journeys (id, project_id, key, name, description, persona_id, stages, touchpoints, pain_points, opportunities)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        journeyId,
        project.id,
        key,
        name,
        options.description ?? null,
        personaId,
        options.stages ?? null,
        options.touchpoints ?? null,
        options.painPoints ?? null,
        options.opportunities ?? null
      ]
    );

    logCreate(project.id, 'ux_journey', journeyId, { key, name });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { id: journeyId, key, name } }));
    } else {
      success(`Created UX journey "${name}" (${key})`, opts);
    }
  });

// List UX journeys
uxJourneyCommand
  .command('list')
  .alias('ls')
  .option('-p, --persona <key>', 'Filter by persona key')
  .description('List all UX journeys')
  .action((options) => {
    const opts = getOutputOptions(uxJourneyCommand);

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

    let query = `SELECT j.key, j.name, j.description, p.name as persona_name, p.key as persona_key
                 FROM ux_journeys j
                 LEFT JOIN personas p ON j.persona_id = p.id
                 WHERE j.project_id = (SELECT id FROM projects WHERE key = ?)`;
    const params: unknown[] = [config.project.key];

    if (options.persona) {
      query += ' AND p.key = ?';
      params.push(options.persona);
    }

    query += ' ORDER BY j.name';

    const journeys = queryAll<{
      key: string;
      name: string;
      description: string | null;
      persona_name: string | null;
      persona_key: string | null;
    }>(query, params);

    data(
      journeys.map(j => ({
        ...j,
        persona: j.persona_key ? `${j.persona_name} (${j.persona_key})` : '-'
      })),
      [
        { header: 'Key', key: 'key', width: 12 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Persona', key: 'persona', width: 25 },
        { header: 'Description', key: 'description', width: 35 }
      ],
      opts
    );
  });

// Show UX journey
uxJourneyCommand
  .command('show')
  .argument('<key>', 'Journey key')
  .description('Show UX journey details')
  .action((key: string) => {
    const opts = getOutputOptions(uxJourneyCommand);

    const journey = queryOne<{
      id: string;
      key: string;
      name: string;
      description: string | null;
      persona_id: string | null;
      stages: string | null;
      touchpoints: string | null;
      pain_points: string | null;
      opportunities: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, key, name, description, persona_id, stages, touchpoints, pain_points, opportunities, created_at, updated_at
       FROM ux_journeys WHERE key = ?`,
      [key]
    );

    if (!journey) {
      error(`UX journey "${key}" not found.`, opts);
      process.exit(1);
    }

    let personaInfo = '-';
    if (journey.persona_id) {
      const persona = queryOne<{ key: string; name: string }>('SELECT key, name FROM personas WHERE id = ?', [journey.persona_id]);
      if (persona) {
        personaInfo = `${persona.name} (${persona.key})`;
      }
    }

    details(
      { ...journey, persona: personaInfo },
      [
        { label: 'Key', key: 'key' },
        { label: 'Name', key: 'name' },
        { label: 'Persona', key: 'persona' },
        { label: 'Description', key: 'description' },
        { label: 'Stages', key: 'stages' },
        { label: 'Touchpoints', key: 'touchpoints' },
        { label: 'Pain Points', key: 'pain_points' },
        { label: 'Opportunities', key: 'opportunities' },
        { label: 'Created', key: 'created_at' },
        { label: 'Updated', key: 'updated_at' }
      ],
      opts
    );
  });

// Update UX journey
uxJourneyCommand
  .command('update')
  .argument('<key>', 'Journey key')
  .option('-n, --name <name>', 'Journey name')
  .option('-d, --description <description>', 'Journey description')
  .option('-p, --persona <key>', 'Associated persona key (use "none" to unlink)')
  .option('-s, --stages <stages>', 'Journey stages')
  .option('-t, --touchpoints <touchpoints>', 'Touchpoints')
  .option('--pain-points <painPoints>', 'Pain points')
  .option('--opportunities <opportunities>', 'Opportunities')
  .description('Update a UX journey')
  .action((key: string, options) => {
    const opts = getOutputOptions(uxJourneyCommand);

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

    const journey = queryOne<{ id: string }>('SELECT id FROM ux_journeys WHERE key = ?', [key]);
    if (!journey) {
      error(`UX journey "${key}" not found.`, opts);
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

    if (options.persona !== undefined) {
      if (options.persona === 'none') {
        updates.push('persona_id = NULL');
        changes.persona_id = null;
      } else {
        const persona = queryOne<{ id: string }>('SELECT id FROM personas WHERE key = ?', [options.persona]);
        if (!persona) {
          error(`Persona "${options.persona}" not found.`, opts);
          process.exit(1);
        }
        updates.push('persona_id = ?');
        params.push(persona.id);
        changes.persona_id = options.persona;
      }
    }

    if (options.stages !== undefined) {
      updates.push('stages = ?');
      params.push(options.stages);
      changes.stages = options.stages;
    }

    if (options.touchpoints !== undefined) {
      updates.push('touchpoints = ?');
      params.push(options.touchpoints);
      changes.touchpoints = options.touchpoints;
    }

    if (options.painPoints !== undefined) {
      updates.push('pain_points = ?');
      params.push(options.painPoints);
      changes.pain_points = options.painPoints;
    }

    if (options.opportunities !== undefined) {
      updates.push('opportunities = ?');
      params.push(options.opportunities);
      changes.opportunities = options.opportunities;
    }

    if (updates.length === 0) {
      error('No updates specified.', opts);
      process.exit(1);
    }

    updates.push("updated_at = datetime('now')");
    params.push(journey.id);

    run(`UPDATE ux_journeys SET ${updates.join(', ')} WHERE id = ?`, params);

    logActivity(project.id, 'ux_journey' as EntityType, journey.id, 'update', { newValue: changes });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { key, ...changes } }));
    } else {
      success(`Updated UX journey "${key}"`, opts);
    }
  });

// Delete UX journey
uxJourneyCommand
  .command('delete')
  .alias('rm')
  .argument('<key>', 'Journey key')
  .option('-f, --force', 'Force delete without confirmation')
  .description('Delete a UX journey')
  .action((key: string) => {
    const opts = getOutputOptions(uxJourneyCommand);

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

    const journey = queryOne<{ id: string; key: string; name: string }>('SELECT id, key, name FROM ux_journeys WHERE key = ?', [key]);
    if (!journey) {
      error(`UX journey "${key}" not found.`, opts);
      process.exit(1);
    }

    run('DELETE FROM ux_journeys WHERE id = ?', [journey.id]);

    logDelete(project.id, 'ux_journey', journey.id, { key: journey.key, name: journey.name });

    if (opts.json) {
      console.log(JSON.stringify({ success: true, data: { key } }));
    } else {
      success(`Deleted UX journey "${key}"`, opts);
    }
  });
