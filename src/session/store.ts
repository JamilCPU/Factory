/**
 * Session store — persist / resume conversation history as JSON
 * files inside `<workspace>/.factory-sessions/`.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { OllamaMessage } from '../ollama/client.js';

const SESSION_DIR = '.factory-sessions';

export interface Session {
  id: string;
  model: string;
  messages: OllamaMessage[];
  createdAt: string;
  updatedAt: string;
}

export class SessionStore {
  private dir: string;

  constructor(workspacePath: string) {
    this.dir = path.join(workspacePath, SESSION_DIR);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async save(session: Session): Promise<void> {
    await this.ensureDir();
    session.updatedAt = new Date().toISOString();
    const filePath = path.join(this.dir, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  async load(id: string): Promise<Session | null> {
    try {
      const filePath = path.join(this.dir, `${id}.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }

  async list(): Promise<
    { id: string; updatedAt: string; messageCount: number }[]
  > {
    await this.ensureDir();
    const files = await fs.readdir(this.dir);
    const out: { id: string; updatedAt: string; messageCount: number }[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.dir, file), 'utf-8');
        const s = JSON.parse(raw) as Session;
        out.push({
          id: s.id,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
        });
      } catch {
        // Corrupted session — skip
      }
    }

    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  generateId(): string {
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    return `session-${ts}`;
  }
}
