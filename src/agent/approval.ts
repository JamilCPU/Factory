/**
 * Approval system — controls which tool actions require user confirmation.
 *
 * Modes:
 *   auto   — reads/searches execute silently; writes and commands auto-execute
 *   confirm — reads/searches silently; writes and commands need approval
 *   strict  — every tool call needs approval
 */

export type ApprovalMode = 'auto' | 'confirm' | 'strict';

/** Tools that are always safe (read-only, no side effects). */
const READ_ONLY_TOOLS = new Set([
  'read_file',
  'list_directory',
  'search_files',
  'git_status',
  'git_diff',
  'git_log',
]);

/** Tools that mutate the workspace or run arbitrary code. */
const MUTATING_TOOLS = new Set([
  'edit_file',
  'create_file',
  'run_command',
  'git_commit',
  'git_checkout',
]);

export interface ApprovalRequest {
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
}

export type ApprovalCallback = (
  request: ApprovalRequest,
) => Promise<boolean>;

/**
 * Decide whether a tool call needs user approval given the current mode.
 */
export function needsApproval(
  toolName: string,
  mode: ApprovalMode,
): boolean {
  switch (mode) {
    case 'auto':
      return false;
    case 'confirm':
      return !READ_ONLY_TOOLS.has(toolName);
    case 'strict':
      return true;
  }
}

/**
 * Build a human-readable summary of what a tool call will do.
 */
export function buildApprovalSummary(
  toolName: string,
  args: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'edit_file':
      return `Edit file: ${args.path}`;
    case 'create_file':
      return `Create file: ${args.path}`;
    case 'run_command':
      return `Run command: ${args.command}`;
    case 'git_commit':
      return `Git commit: ${args.message}`;
    case 'git_checkout':
      return `Git checkout: ${args.branch}`;
    default:
      return `Execute: ${toolName}(${Object.keys(args).join(', ')})`;
  }
}

/**
 * Check if a tool is read-only.
 */
export function isReadOnly(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName);
}
