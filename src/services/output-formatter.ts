/**
 * Output Formatter Service
 *
 * Handles output formatting for both human-readable and JSON formats.
 * Provides consistent output across all commands.
 *
 * @author Vladimir K.S.
 */

import chalk from 'chalk';
import Table from 'cli-table3';

export interface OutputOptions {
  json?: boolean;
  noColor?: boolean;
}

export interface TableColumn {
  header: string;
  key: string;
  width?: number;
}

/**
 * Get global output options from command
 */
export function getOutputOptions(cmd: { parent?: { opts?: () => OutputOptions } | null }): OutputOptions {
  return cmd.parent?.opts?.() ?? {};
}

/**
 * Output success message
 */
export function success(message: string, opts: OutputOptions = {}): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: true, message }));
  } else {
    const prefix = opts.noColor ? '✓' : chalk.green('✓');
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Output error message
 */
export function error(message: string, opts: OutputOptions = {}): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: false, error: message }));
  } else {
    const prefix = opts.noColor ? '✗' : chalk.red('✗');
    console.error(`${prefix} ${message}`);
  }
}

/**
 * Output warning message
 */
export function warning(message: string, opts: OutputOptions = {}): void {
  if (opts.json) {
    console.log(JSON.stringify({ warning: message }));
  } else {
    const prefix = opts.noColor ? '!' : chalk.yellow('!');
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Output info message
 */
export function info(message: string, opts: OutputOptions = {}): void {
  if (opts.json) {
    console.log(JSON.stringify({ info: message }));
  } else {
    const prefix = opts.noColor ? 'ℹ' : chalk.blue('ℹ');
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Output data as JSON or formatted table
 */
export function data<T extends Record<string, unknown>>(
  items: T[],
  columns: TableColumn[],
  opts: OutputOptions = {}
): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: true, data: items }));
    return;
  }

  if (items.length === 0) {
    console.log('No items found.');
    return;
  }

  const table = new Table({
    head: columns.map(c => opts.noColor ? c.header : chalk.cyan(c.header)),
    colWidths: columns.map(c => c.width ?? null),
    wordWrap: true,
    style: {
      head: opts.noColor ? [] : ['cyan'],
      border: opts.noColor ? [] : ['gray']
    }
  });

  for (const item of items) {
    table.push(columns.map(c => String(item[c.key] ?? '')));
  }

  console.log(table.toString());
}

/**
 * Output single item details
 */
export function details(
  item: Record<string, unknown>,
  fields: { label: string; key: string }[],
  opts: OutputOptions = {}
): void {
  if (opts.json) {
    console.log(JSON.stringify({ success: true, data: item }));
    return;
  }

  const maxLabelLength = Math.max(...fields.map(f => f.label.length));

  for (const field of fields) {
    const label = field.label.padEnd(maxLabelLength);
    const value = item[field.key] ?? '';
    const formattedLabel = opts.noColor ? label : chalk.gray(label);
    console.log(`  ${formattedLabel}  ${value}`);
  }
}

/**
 * Output a blank line
 */
export function blank(): void {
  console.log();
}

/**
 * Output a header/title
 */
export function header(title: string, opts: OutputOptions = {}): void {
  if (opts.json) return;
  const formatted = opts.noColor ? title : chalk.bold(title);
  console.log(formatted);
}
