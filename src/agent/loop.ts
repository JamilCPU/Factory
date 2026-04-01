/**
 * Agent loop — orchestrates messages between the user, Ollama, and
 * the workspace/terminal tools.
 *
 * Each user message triggers a loop:
 *   1. Send the conversation + tool schemas to Ollama.
 *   2. If the model returns tool_calls (or fallback-parsed ones)
 *      → check approval → execute → append results → go to 1.
 *   3. If the model returns plain text → we're done.
 */

import {
  OllamaClient,
  type OllamaMessage,
  type OllamaToolCall,
} from '../ollama/client.js';
import { ToolRegistry } from './toolRegistry.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { parseToolCallsFromText } from './toolCallParser.js';
import {
  type ApprovalMode,
  type ApprovalCallback,
  needsApproval,
  buildApprovalSummary,
} from './approval.js';
import { MemoryManager } from './memory.js';
import { Planner } from './planner.js';
import {
  buildRepoMap,
  formatRepoMapForContext,
} from '../context/repoMap.js';

export interface AgentConfig {
  model: string;
  workspacePath: string;
  ollamaBaseUrl?: string;
  approvalMode?: ApprovalMode;
}

export class AgentLoop {
  private client: OllamaClient;
  private tools: ToolRegistry;
  private messages: OllamaMessage[];
  private model: string;
  private workspacePath: string;
  private maxToolRounds = 25;
  private approvalMode: ApprovalMode;
  private approvalCallback: ApprovalCallback | null = null;
  private memory: MemoryManager;
  private planner: Planner;
  private repoMapInjected = false;

  constructor(config: AgentConfig) {
    this.client = new OllamaClient(config.ollamaBaseUrl);
    this.tools = new ToolRegistry(config.workspacePath);
    this.model = config.model;
    this.workspacePath = config.workspacePath;
    this.approvalMode = config.approvalMode ?? 'confirm';
    this.memory = new MemoryManager();
    this.planner = new Planner();
    this.messages = [
      {
        role: 'system',
        content: buildSystemPrompt(config.workspacePath),
      },
    ];
  }

  // ── Accessors ──────────────────────────────────────────────────

  getMessages(): OllamaMessage[] {
    return this.messages;
  }

  setMessages(msgs: OllamaMessage[]): void {
    this.messages = msgs;
  }

  getModel(): string {
    return this.model;
  }

  setModel(m: string): void {
    this.model = m;
  }

  getToolNames(): string[] {
    return this.tools.getToolNames();
  }

  getOllamaClient(): OllamaClient {
    return this.client;
  }

  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  setApprovalCallback(cb: ApprovalCallback): void {
    this.approvalCallback = cb;
  }

  getPlanner(): Planner {
    return this.planner;
  }

  getMemory(): MemoryManager {
    return this.memory;
  }

  // ── Repo map injection ─────────────────────────────────────────

  async injectRepoMap(): Promise<void> {
    if (this.repoMapInjected) return;

    try {
      const map = await buildRepoMap(this.workspacePath);
      const ctx = formatRepoMapForContext(map);
      // Insert after system message
      this.messages.splice(1, 0, {
        role: 'user',
        content: `[System context — project overview, do not respond to this directly]\n${ctx}`,
      });
      this.messages.splice(2, 0, {
        role: 'assistant',
        content:
          'I\'ve noted the project structure. I\'m ready to help — what would you like to work on?',
      });
      this.repoMapInjected = true;
    } catch {
      // Non-fatal — the model can still work without the repo map
    }
  }

  // ── Main loop ──────────────────────────────────────────────────

  /**
   * Process one user message through the full agent loop.
   *
   * Callbacks let the CLI stream output as it happens:
   *  - onToken:      each streamed text token
   *  - onToolCall:   the model wants to call a tool
   *  - onToolResult: the tool returned a result
   */
  async processMessage(
    userMessage: string,
    onToken: (token: string) => void,
    onToolCall: (name: string, args: Record<string, unknown>) => void,
    onToolResult: (name: string, result: string) => void,
  ): Promise<string> {
    this.memory.incrementTurn();

    // Inject repo map on the first real user message
    if (!this.repoMapInjected) {
      await this.injectRepoMap();
    }

    // Inject plan context if active
    const planCtx = this.planner.formatPlanForContext();
    const memoryCtx = this.memory.formatForContext();
    const augmentedMessage =
      userMessage + (planCtx ? `\n${planCtx}` : '') + (memoryCtx ? `\n${memoryCtx}` : '');

    this.messages.push({ role: 'user', content: augmentedMessage });

    // Compact messages if the conversation is getting long
    if (this.memory.shouldCompact(this.messages.length)) {
      this.messages = this.memory.compactMessages(this.messages);
    }

    let fullResponse = '';
    let rounds = 0;

    while (rounds < this.maxToolRounds) {
      rounds++;

      const response = await this.client.chat(
        {
          model: this.model,
          messages: this.messages,
          tools: this.tools.getDefinitions(),
        },
        onToken,
      );

      // Persist the assistant turn
      this.messages.push(response);

      // Determine tool calls: native first, fallback second
      let toolCalls: OllamaToolCall[] = response.tool_calls ?? [];

      if (toolCalls.length === 0 && response.content) {
        // Fallback: parse tool calls from plain text
        const fallback = parseToolCallsFromText(
          response.content,
          this.tools.getToolNames(),
        );
        if (fallback.length > 0) {
          toolCalls = fallback;
          onToken('\n'); // Visual separator
        }
      }

      if (toolCalls.length > 0) {
        for (const call of toolCalls) {
          const { name, arguments: args } = call.function;

          // Approval check
          if (
            needsApproval(name, this.approvalMode) &&
            this.approvalCallback
          ) {
            const summary = buildApprovalSummary(name, args);
            const approved = await this.approvalCallback({
              toolName: name,
              args,
              summary,
            });
            if (!approved) {
              const skipMsg = `Tool call "${name}" was rejected by the user.`;
              onToolResult(name, skipMsg);
              this.messages.push({ role: 'tool', content: skipMsg });
              continue;
            }
          }

          onToolCall(name, args);

          const result = await this.tools.execute(name, args);
          onToolResult(name, result);

          // Track in memory
          this.memory.processToolCall(name, args, result);

          this.messages.push({ role: 'tool', content: result });
        }
        // Loop back — the model may call more tools or produce a final answer.
      } else {
        // Pure text response → done
        fullResponse = response.content;
        break;
      }
    }

    if (rounds >= this.maxToolRounds) {
      const warning =
        '\n[Agent reached the maximum number of tool-call rounds]';
      onToken(warning);
      fullResponse += warning;
    }

    return fullResponse;
  }
}
