/**
 * AIGILE CLI Entry Point
 *
 * Main entry point for the aigile command-line interface.
 * Provides JIRA-compatible agile project management from the terminal.
 *
 * @author Vladimir K.S.
 */

import { Command } from 'commander';
import { VERSION } from '../index.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import { initCommand } from '../commands/init.js';
import { projectCommand } from '../commands/project.js';
import { epicCommand } from '../commands/epic.js';
import { storyCommand } from '../commands/story.js';
import { taskCommand } from '../commands/task.js';
import { bugCommand } from '../commands/bug.js';
import { sprintCommand } from '../commands/sprint.js';
import { statusCommand } from '../commands/status.js';
import { initiativeCommand } from '../commands/initiative.js';
import { syncCommand } from '../commands/sync.js';
import { sessionCommand } from '../commands/session.js';
import { contextCommand } from '../commands/context.js';
import { queryCommand } from '../commands/query.js';
import { aiCommand } from '../commands/ai.js';
import { componentCommand } from '../commands/component.js';
import { versionCommand } from '../commands/version.js';
import { personaCommand } from '../commands/persona.js';
import { uxJourneyCommand } from '../commands/ux-journey.js';
import { docCommand } from '../commands/doc.js';
import { daemonCommand } from '../commands/daemon.js';
import { fileCommand } from '../commands/file.js';

async function main() {
  const program = new Command();

  program
    .name('aigile')
    .description('JIRA-compatible Agile project management CLI for AI-assisted development')
    .version(VERSION, '-v, --version', 'Display version number')
    .option('--json', 'Output in JSON format for machine parsing')
    .option('--no-color', 'Disable colored output');

  // Initialize database before any command runs
  program.hook('preAction', async () => {
    await initDatabase();
  });

  // Close database after command completes
  // Skip for daemon run command since it runs in foreground
  program.hook('postAction', () => {
    // Check if this is the daemon run command using process.argv
    // process.argv = ['node', 'aigile.js', 'daemon', 'run', ...]
    const args = process.argv.slice(2);
    if (args[0] === 'daemon' && args[1] === 'run') {
      return; // Keep database open for daemon
    }
    closeDatabase();
  });

  // Register commands
  program.addCommand(initCommand);
  program.addCommand(projectCommand);
  program.addCommand(initiativeCommand);
  program.addCommand(epicCommand);
  program.addCommand(storyCommand);
  program.addCommand(taskCommand);
  program.addCommand(bugCommand);
  program.addCommand(sprintCommand);
  program.addCommand(statusCommand);
  program.addCommand(syncCommand);
  program.addCommand(sessionCommand);
  program.addCommand(contextCommand);
  program.addCommand(queryCommand);
  program.addCommand(aiCommand);
  program.addCommand(componentCommand);
  program.addCommand(versionCommand);
  program.addCommand(personaCommand);
  program.addCommand(uxJourneyCommand);
  program.addCommand(docCommand);
  program.addCommand(daemonCommand);
  program.addCommand(fileCommand);

  // Parse arguments
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
