/**
 * Tool registry — defines every tool the model can call and maps
 * tool names to their implementations.
 */

import type { OllamaToolDefinition } from '../ollama/client.js';
import { WorkspaceTools } from '../tools/workspace.js';
import { TerminalTools } from '../tools/terminal.js';
import { GitTools } from '../tools/git.js';

export type ToolExecutor = (
  args: Record<string, unknown>,
) => Promise<string>;

export class ToolRegistry {
  private executors = new Map<string, ToolExecutor>();
  private defs: OllamaToolDefinition[] = [];

  constructor(workspacePath: string) {
    const ws = new WorkspaceTools(workspacePath);
    const term = new TerminalTools(workspacePath);
    const git = new GitTools(workspacePath);

    // ── Workspace tools ────────────────────────────────────────

    this._register(
      'read_file',
      'Read the contents of a file in the workspace',
      {
        path: {
          type: 'string',
          description: 'Relative path to the file to read',
        },
      },
      ['path'],
      async (a) => ws.readFile(a.path as string),
    );

    this._register(
      'list_directory',
      'List files and directories at a given path in the workspace',
      {
        path: {
          type: 'string',
          description:
            'Relative path to the directory (defaults to workspace root)',
        },
      },
      [],
      async (a) => ws.listDirectory((a.path as string) || '.'),
    );

    this._register(
      'search_files',
      'Search for a regex pattern across files in the workspace',
      {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for',
        },
        path: {
          type: 'string',
          description:
            'Directory to search in (defaults to workspace root)',
        },
      },
      ['pattern'],
      async (a) =>
        ws.searchFiles(a.pattern as string, (a.path as string) || '.'),
    );

    this._register(
      'edit_file',
      'Edit a file by replacing a unique string with a new string. Include enough context for a unique match.',
      {
        path: {
          type: 'string',
          description: 'Relative path to the file',
        },
        old_string: {
          type: 'string',
          description:
            'The exact text to find (must appear exactly once in the file)',
        },
        new_string: {
          type: 'string',
          description: 'The replacement text',
        },
      },
      ['path', 'old_string', 'new_string'],
      async (a) =>
        ws.editFile(
          a.path as string,
          a.old_string as string,
          a.new_string as string,
        ),
    );

    this._register(
      'create_file',
      'Create a new file in the workspace (fails if the file already exists)',
      {
        path: {
          type: 'string',
          description: 'Relative path for the new file',
        },
        content: {
          type: 'string',
          description: 'Content to write into the file',
        },
      },
      ['path', 'content'],
      async (a) =>
        ws.createFile(a.path as string, a.content as string),
    );

    // ── Terminal tools ─────────────────────────────────────────

    this._register(
      'run_command',
      'Run a shell command in the workspace directory',
      {
        command: {
          type: 'string',
          description: 'The command to execute',
        },
      },
      ['command'],
      async (a) => term.runCommand(a.command as string),
    );

    // ── Git tools ──────────────────────────────────────────────

    this._register(
      'git_status',
      'Show the current git status including branch name and changed files',
      {},
      [],
      async () => git.status(),
    );

    this._register(
      'git_diff',
      'Show the current git diff of unstaged changes',
      {
        staged: {
          type: 'string',
          description: 'Set to "true" to show staged changes instead',
        },
      },
      [],
      async (a) => git.diff(a.staged === 'true'),
    );

    this._register(
      'git_log',
      'Show recent git commit history',
      {
        count: {
          type: 'string',
          description: 'Number of commits to show (default 10)',
        },
      },
      [],
      async (a) => git.log(parseInt(a.count as string, 10) || 10),
    );

    this._register(
      'git_commit',
      'Stage all changes and create a git commit with the given message',
      {
        message: {
          type: 'string',
          description: 'The commit message',
        },
      },
      ['message'],
      async (a) => git.commit(a.message as string),
    );
  }

  // ── Public API ─────────────────────────────────────────────────

  getDefinitions(): OllamaToolDefinition[] {
    return this.defs;
  }

  getToolNames(): string[] {
    return Array.from(this.executors.keys());
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const executor = this.executors.get(name);
    if (!executor) return `Unknown tool: ${name}`;
    try {
      return await executor(args);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  }

  // ── Internal ───────────────────────────────────────────────────

  private _register(
    name: string,
    description: string,
    properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
    >,
    required: string[],
    executor: ToolExecutor,
  ) {
    this.executors.set(name, executor);
    this.defs.push({
      type: 'function',
      function: {
        name,
        description,
        parameters: { type: 'object', properties, required },
      },
    });
  }
}
