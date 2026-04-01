/**
 * Memory — rolling task memory for long coding sessions.
 *
 * Instead of replaying the entire conversation every turn, this
 * module keeps a compact working memory that includes:
 *   - current objective
 *   - files in scope (touched or read)
 *   - key decisions made
 *   - last command/test results
 *   - a rolling summary of earlier turns
 */

import type { OllamaMessage } from '../ollama/client.js';

export interface WorkingMemory {
  objective: string;
  filesInScope: Set<string>;
  touchedFiles: Set<string>;
  decisions: string[];
  lastCommandResult: string | null;
  rollingSummary: string;
  turnCount: number;
}

const MAX_DECISIONS = 20;
const COMPACTION_THRESHOLD = 30; // Compact after this many messages

export class MemoryManager {
  private memory: WorkingMemory;

  constructor() {
    this.memory = {
      objective: '',
      filesInScope: new Set(),
      touchedFiles: new Set(),
      decisions: [],
      lastCommandResult: null,
      rollingSummary: '',
      turnCount: 0,
    };
  }

  getMemory(): WorkingMemory {
    return this.memory;
  }

  setObjective(objective: string): void {
    this.memory.objective = objective;
  }

  trackFileRead(filePath: string): void {
    this.memory.filesInScope.add(filePath);
  }

  trackFileModified(filePath: string): void {
    this.memory.touchedFiles.add(filePath);
    this.memory.filesInScope.add(filePath);
  }

  trackDecision(decision: string): void {
    this.memory.decisions.push(decision);
    if (this.memory.decisions.length > MAX_DECISIONS) {
      this.memory.decisions = this.memory.decisions.slice(-MAX_DECISIONS);
    }
  }

  trackCommandResult(result: string): void {
    // Keep only last 500 chars
    this.memory.lastCommandResult =
      result.length > 500 ? result.slice(-500) : result;
  }

  incrementTurn(): void {
    this.memory.turnCount++;
  }

  /**
   * Extract memory-relevant information from a tool call.
   */
  processToolCall(
    toolName: string,
    args: Record<string, unknown>,
    result: string,
  ): void {
    const filePath = args.path as string | undefined;

    switch (toolName) {
      case 'read_file':
        if (filePath) this.trackFileRead(filePath);
        break;
      case 'edit_file':
        if (filePath) this.trackFileModified(filePath);
        break;
      case 'create_file':
        if (filePath) this.trackFileModified(filePath);
        break;
      case 'run_command':
        this.trackCommandResult(result);
        break;
    }
  }

  /**
   * Check if the conversation should be compacted.
   */
  shouldCompact(messageCount: number): boolean {
    return messageCount > COMPACTION_THRESHOLD;
  }

  /**
   * Compact old messages into a summary, keeping recent ones intact.
   * Returns a new message array with the summary prepended.
   */
  compactMessages(messages: OllamaMessage[]): OllamaMessage[] {
    if (messages.length <= COMPACTION_THRESHOLD) return messages;

    // Keep the system message and last 15 messages
    const systemMsg = messages[0];
    const keepCount = 15;
    const toSummarize = messages.slice(1, messages.length - keepCount);
    const recentMessages = messages.slice(messages.length - keepCount);

    // Build a summary of the older messages
    const summaryParts: string[] = [];

    for (const msg of toSummarize) {
      if (msg.role === 'user') {
        summaryParts.push(`User asked: ${truncateStr(msg.content, 100)}`);
      } else if (msg.role === 'assistant' && msg.content) {
        summaryParts.push(
          `Assistant: ${truncateStr(msg.content, 150)}`,
        );
      } else if (msg.role === 'tool') {
        summaryParts.push(
          `Tool result: ${truncateStr(msg.content, 80)}`,
        );
      }
    }

    const summaryText = summaryParts.join('\n');
    this.memory.rollingSummary = summaryText;

    const summaryMessage: OllamaMessage = {
      role: 'user',
      content: `[Context from earlier in this session — ${toSummarize.length} messages summarized]\n${summaryText}\n[End of summary — conversation continues below]`,
    };

    return [systemMsg, summaryMessage, ...recentMessages];
  }

  /**
   * Format working memory as context for the model.
   */
  formatForContext(): string {
    const parts: string[] = [];

    if (this.memory.objective) {
      parts.push(`Current objective: ${this.memory.objective}`);
    }

    if (this.memory.filesInScope.size > 0) {
      parts.push(
        `Files in scope: ${Array.from(this.memory.filesInScope).join(', ')}`,
      );
    }

    if (this.memory.touchedFiles.size > 0) {
      parts.push(
        `Modified files: ${Array.from(this.memory.touchedFiles).join(', ')}`,
      );
    }

    if (this.memory.decisions.length > 0) {
      const recent = this.memory.decisions.slice(-5);
      parts.push(`Recent decisions:\n${recent.map((d) => `  - ${d}`).join('\n')}`);
    }

    if (this.memory.lastCommandResult) {
      parts.push(
        `Last command output: ${truncateStr(this.memory.lastCommandResult, 200)}`,
      );
    }

    if (parts.length === 0) return '';
    return `\n=== Working Memory ===\n${parts.join('\n')}\n`;
  }

  /**
   * Reset memory (for /clear).
   */
  reset(): void {
    this.memory = {
      objective: '',
      filesInScope: new Set(),
      touchedFiles: new Set(),
      decisions: [],
      lastCommandResult: null,
      rollingSummary: '',
      turnCount: 0,
    };
  }
}

function truncateStr(s: string, max: number): string {
  const oneLine = s.replace(/\n/g, ' ').trim();
  return oneLine.length > max
    ? oneLine.slice(0, max) + '…'
    : oneLine;
}
