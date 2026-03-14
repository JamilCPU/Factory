/**
 * Workspace tools — file read / search / edit / create.
 *
 * Every path is resolved relative to the workspace root and
 * prevented from escaping it.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createPatch } from 'diff';

export class WorkspaceTools {
  private root: string;

  constructor(workspacePath: string) {
    this.root = path.resolve(workspacePath);
  }

  // ── Helpers ────────────────────────────────────────────────────

  /** Resolve and jail a path inside the workspace. */
  private resolve(filePath: string): string {
    const resolved = path.resolve(this.root, filePath);
    if (!resolved.startsWith(this.root)) {
      throw new Error(`Path "${filePath}" escapes the workspace`);
    }
    return resolved;
  }

  // ── Tools ──────────────────────────────────────────────────────

  async readFile(filePath: string): Promise<string> {
    const resolved = this.resolve(filePath);
    const content = await fs.readFile(resolved, 'utf-8');
    // Add line numbers for the model's convenience
    return content
      .split('\n')
      .map((line, i) => `${String(i + 1).padStart(4)}| ${line}`)
      .join('\n');
  }

  async listDirectory(dirPath = '.'): Promise<string> {
    const resolved = this.resolve(dirPath);
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => `${e.isDirectory() ? '[dir] ' : '[file]'} ${e.name}`)
      .join('\n');
  }

  async searchFiles(pattern: string, dirPath = '.'): Promise<string> {
    const resolved = this.resolve(dirPath);
    const results: string[] = [];
    await this._searchRecursive(
      resolved,
      new RegExp(pattern, 'gi'),
      results,
      50,
    );
    return results.length > 0
      ? results.join('\n')
      : `No matches found for "${pattern}"`;
  }

  async editFile(
    filePath: string,
    oldString: string,
    newString: string,
  ): Promise<string> {
    const resolved = this.resolve(filePath);
    const content = await fs.readFile(resolved, 'utf-8');

    if (!content.includes(oldString)) {
      throw new Error(`Could not find the specified text in ${filePath}`);
    }

    const occurrences = content.split(oldString).length - 1;
    if (occurrences > 1) {
      throw new Error(
        `Found ${occurrences} occurrences in ${filePath}. ` +
          'Provide more surrounding context so the match is unique.',
      );
    }

    const newContent = content.replace(oldString, newString);
    const diff = createPatch(filePath, content, newContent, '', '', {
      context: 3,
    });
    await fs.writeFile(resolved, newContent, 'utf-8');
    return `File edited successfully.\n\n${diff}`;
  }

  async createFile(filePath: string, content: string): Promise<string> {
    const resolved = this.resolve(filePath);

    // Ensure parent directories exist
    await fs.mkdir(path.dirname(resolved), { recursive: true });

    // Guard against silent overwrite
    let exists = false;
    try {
      await fs.access(resolved);
      exists = true;
    } catch {
      /* expected */
    }
    if (exists) {
      throw new Error(
        `File "${filePath}" already exists. Use edit_file to modify it.`,
      );
    }

    await fs.writeFile(resolved, content, 'utf-8');
    return `File created: ${filePath} (${content.length} bytes)`;
  }

  // ── Internal recursive search ──────────────────────────────────

  private async _searchRecursive(
    dir: string,
    regex: RegExp,
    results: string[],
    limit: number,
  ): Promise<void> {
    if (results.length >= limit) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission denied, etc.
    }

    for (const entry of entries) {
      if (results.length >= limit) break;

      // Skip uninteresting directories
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'dist'
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this._searchRecursive(fullPath, regex, results, limit);
      } else if (entry.isFile()) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            regex.lastIndex = 0; // reset for 'g' flag
            if (regex.test(lines[i])) {
              const rel = path.relative(this.root, fullPath);
              results.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
              if (results.length >= limit) break;
            }
          }
        } catch {
          // Binary / unreadable file — skip
        }
      }
    }
  }
}
