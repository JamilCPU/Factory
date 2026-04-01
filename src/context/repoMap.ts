/**
 * Repo map — builds a lightweight index of the project structure
 * that is injected into the model's context at the start of a session.
 *
 * Captures:
 *   - top-level directory layout
 *   - key config files (package.json, tsconfig, etc.)
 *   - entry points and scripts
 *   - recently modified files
 *   - .gitignore patterns
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const CONFIG_FILES = [
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  '.eslintrc.json',
  '.eslintrc.js',
  'eslint.config.js',
  'eslint.config.mjs',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'Makefile',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.env.example',
  '.gitignore',
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'vendor',
  '.factory-sessions',
]);

interface FileEntry {
  path: string;
  type: 'file' | 'dir';
  size?: number;
  modifiedAt?: Date;
}

export interface RepoMap {
  root: string;
  tree: string;
  configSnippets: Record<string, string>;
  recentFiles: string[];
  summary: string;
}

export async function buildRepoMap(workspacePath: string): Promise<RepoMap> {
  const root = path.resolve(workspacePath);
  const entries: FileEntry[] = [];

  // Walk the directory tree (limited depth to keep it light)
  await walkDir(root, root, entries, 0, 4);

  // Build the tree string
  const tree = entries
    .map((e) => {
      const rel = path.relative(root, path.resolve(root, e.path));
      const prefix = e.type === 'dir' ? '[dir]  ' : '[file] ';
      return `${prefix}${rel}`;
    })
    .join('\n');

  // Read key config files
  const configSnippets: Record<string, string> = {};
  for (const configFile of CONFIG_FILES) {
    try {
      const fullPath = path.join(root, configFile);
      const content = await fs.readFile(fullPath, 'utf-8');
      // Truncate large configs
      configSnippets[configFile] =
        content.length > 2000
          ? content.slice(0, 2000) + '\n... (truncated)'
          : content;
    } catch {
      // File doesn't exist — skip
    }
  }

  // Find recently modified files (last 10)
  const fileEntries = entries.filter((e) => e.type === 'file' && e.modifiedAt);
  fileEntries.sort(
    (a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0),
  );
  const recentFiles = fileEntries.slice(0, 10).map((e) => e.path);

  // Build the summary
  const dirCount = entries.filter((e) => e.type === 'dir').length;
  const fileCount = entries.filter((e) => e.type === 'file').length;
  const configNames = Object.keys(configSnippets);

  let summary = `Project at: ${root}\n`;
  summary += `${dirCount} directories, ${fileCount} files indexed\n`;
  if (configNames.length > 0) {
    summary += `Config files found: ${configNames.join(', ')}\n`;
  }

  // Extract project type hints from configs
  if (configSnippets['package.json']) {
    try {
      const pkg = JSON.parse(configSnippets['package.json']);
      if (pkg.scripts) {
        summary += `npm scripts: ${Object.keys(pkg.scripts).join(', ')}\n`;
      }
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      const depNames = Object.keys(allDeps).slice(0, 15);
      if (depNames.length > 0) {
        summary += `Key dependencies: ${depNames.join(', ')}\n`;
      }
    } catch {
      // Malformed package.json
    }
  }

  if (recentFiles.length > 0) {
    summary += `Recently modified: ${recentFiles.join(', ')}\n`;
  }

  return { root, tree, configSnippets, recentFiles, summary };
}

/**
 * Format the repo map as a context string for the model.
 */
export function formatRepoMapForContext(map: RepoMap): string {
  let ctx = `=== Project Overview ===\n${map.summary}\n`;

  ctx += `\n=== Directory Structure ===\n${map.tree}\n`;

  for (const [name, content] of Object.entries(map.configSnippets)) {
    ctx += `\n=== ${name} ===\n${content}\n`;
  }

  return ctx;
}

// ── Internal ─────────────────────────────────────────────────────

async function walkDir(
  base: string,
  dir: string,
  entries: FileEntry[],
  depth: number,
  maxDepth: number,
): Promise<void> {
  if (depth > maxDepth) return;

  let items;
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const item of items) {
    if (item.name.startsWith('.') && depth === 0 && item.name !== '.gitignore') {
      continue;
    }
    if (item.name.startsWith('.') && depth > 0) continue;
    if (SKIP_DIRS.has(item.name)) continue;

    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(base, fullPath);

    if (item.isDirectory()) {
      entries.push({ path: relPath, type: 'dir' });
      await walkDir(base, fullPath, entries, depth + 1, maxDepth);
    } else if (item.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        entries.push({
          path: relPath,
          type: 'file',
          size: stat.size,
          modifiedAt: stat.mtime,
        });
      } catch {
        entries.push({ path: relPath, type: 'file' });
      }
    }
  }
}
