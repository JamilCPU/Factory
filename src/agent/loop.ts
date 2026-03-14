/**
 * Agent loop — orchestrates messages between the user, Ollama, and
 * the workspace/terminal tools.
 *
 * Each user message triggers a loop:
 *   1. Send the conversation + tool schemas to Ollama.
 *   2. If the model returns tool_calls → execute them, append
 *      the results, and go back to step 1.
 *   3. If the model returns plain text → we're done.
 */

import {
  OllamaClient,
  type OllamaMessage,
} from '../ollama/client.js';
import { ToolRegistry } from './toolRegistry.js';
import { buildSystemPrompt } from './systemPrompt.js';

export interface AgentConfig {
  model: string;
  workspacePath: string;
  ollamaBaseUrl?: string;
}

export class AgentLoop {
  private client: OllamaClient;
  private tools: ToolRegistry;
  private messages: OllamaMessage[];
  private model: string;
  private maxToolRounds = 25;

  constructor(config: AgentConfig) {
    this.client = new OllamaClient(config.ollamaBaseUrl);
    this.tools = new ToolRegistry(config.workspacePath);
    this.model = config.model;
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
    this.messages.push({ role: 'user', content: userMessage });

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

      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const call of response.tool_calls) {
          const { name, arguments: args } = call.function;
          onToolCall(name, args);

          const result = await this.tools.execute(name, args);
          onToolResult(name, result);

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
      const warning = '\n[Agent reached the maximum number of tool-call rounds]';
      onToken(warning);
      fullResponse += warning;
    }

    return fullResponse;
  }
}
