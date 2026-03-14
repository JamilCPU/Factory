/**
 * Terminal tools — guarded command execution scoped to the workspace.
 */

import { exec } from 'child_process';
import * as path from 'path';

/** Patterns that are always blocked regardless of context. */
const BLOCKED_PATTERNS = [
  'rm -rf /',
  'format c:',
  'del /s /q c:',
  'rmdir /s /q c:',
  ':(){:|:&};:',       // fork bomb
];

const COMMAND_TIMEOUT_MS = 60_000; // 60 seconds
const MAX_OUTPUT_BYTES = 1024 * 512; // 512 KB

export class TerminalTools {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = path.resolve(workspacePath);
  }

  async runCommand(command: string): Promise<string> {
    // Safety gate
    const lower = command.toLowerCase();
    for (const blocked of BLOCKED_PATTERNS) {
      if (lower.includes(blocked.toLowerCase())) {
        throw new Error(`Blocked dangerous command pattern: "${blocked}"`);
      }
    }

    return new Promise<string>((resolve) => {
      exec(
        command,
        {
          cwd: this.workspacePath,
          timeout: COMMAND_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
        },
        (error, stdout, stderr) => {
          const parts: string[] = [];
          if (stdout) parts.push(stdout);
          if (stderr) parts.push(`[stderr]: ${stderr}`);
          if (error?.killed) {
            parts.push(
              `[timeout]: Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s`,
            );
          } else if (error) {
            parts.push(`[exit code]: ${error.code}`);
          }
          resolve(parts.join('\n') || '(no output)');
        },
      );
    });
  }
}
