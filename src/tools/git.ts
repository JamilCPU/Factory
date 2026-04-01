/**
 * Git tools — first-class git operations for the coding loop.
 *
 * Wraps common git commands with structured output for the model
 * and the CLI status display.
 */

import { exec } from 'child_process';
import * as path from 'path';

const COMMAND_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1024 * 256;

export class GitTools {
  private cwd: string;

  constructor(workspacePath: string) {
    this.cwd = path.resolve(workspacePath);
  }

  private run(command: string): Promise<string> {
    return new Promise<string>((resolve) => {
      exec(
        command,
        {
          cwd: this.cwd,
          timeout: COMMAND_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
        },
        (error, stdout, stderr) => {
          if (error && !stdout && !stderr) {
            resolve(`Error: ${error.message}`);
          } else {
            const out = stdout.trim();
            const err = stderr.trim();
            resolve(err ? `${out}\n${err}` : out || '(no output)');
          }
        },
      );
    });
  }

  async status(): Promise<string> {
    return this.run('git status --short --branch');
  }

  async diff(staged = false): Promise<string> {
    const flag = staged ? '--staged' : '';
    return this.run(`git diff ${flag}`);
  }

  async diffSummary(): Promise<string> {
    return this.run('git diff --stat');
  }

  async log(count = 10): Promise<string> {
    return this.run(
      `git log --oneline --no-decorate -n ${count}`,
    );
  }

  async commit(message: string): Promise<string> {
    // Stage all changes first
    await this.run('git add -A');
    return this.run(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  }

  async checkout(branchOrFile: string): Promise<string> {
    return this.run(`git checkout ${branchOrFile}`);
  }

  async branch(): Promise<string> {
    return this.run('git branch -a');
  }

  /** Check if the workspace is a git repo. */
  async isGitRepo(): Promise<boolean> {
    const result = await this.run('git rev-parse --is-inside-work-tree');
    return result.trim() === 'true';
  }

  /** Get a summary of changed files for display. */
  async changedFilesSummary(): Promise<string> {
    const status = await this.run('git status --porcelain');
    if (!status || status === '(no output)') return 'No changes detected.';

    const lines = status.split('\n').filter(Boolean);
    const added = lines.filter((l) => l.startsWith('A') || l.startsWith('?'));
    const modified = lines.filter((l) => l.startsWith('M') || l.startsWith(' M'));
    const deleted = lines.filter((l) => l.startsWith('D') || l.startsWith(' D'));

    const parts: string[] = [];
    if (added.length > 0) parts.push(`${added.length} added`);
    if (modified.length > 0) parts.push(`${modified.length} modified`);
    if (deleted.length > 0) parts.push(`${deleted.length} deleted`);

    return `${lines.length} files changed (${parts.join(', ')})`;
  }
}
