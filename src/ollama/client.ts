/**
 * Ollama HTTP API client with streaming support and tool-calling.
 *
 * Talks to the local Ollama server (default http://localhost:11434)
 * and exposes a streaming `chat` method that the agent loop consumes.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<
        string,
        { type: string; description: string; enum?: string[] }
      >;
      required: string[];
    };
  };
}

interface ChatStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface ChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaToolDefinition[];
}

// ── Client ─────────────────────────────────────────────────────────

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Send a chat request and stream tokens back.
   *
   * Returns the complete assistant message once the response is
   * finished. If the model decides to call tools the returned
   * message will carry a `tool_calls` array.
   */
  async chat(
    request: ChatRequest,
    onToken?: (token: string) => void,
  ): Promise<OllamaMessage> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from Ollama');
    }

    let fullContent = '';
    let toolCalls: OllamaToolCall[] | undefined;

    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk: ChatStreamChunk = JSON.parse(line);

          if (chunk.message.content) {
            fullContent += chunk.message.content;
            onToken?.(chunk.message.content);
          }

          if (chunk.message.tool_calls) {
            toolCalls = chunk.message.tool_calls;
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Drain whatever is left in the buffer
    if (buffer.trim()) {
      try {
        const chunk: ChatStreamChunk = JSON.parse(buffer);
        if (chunk.message.content) {
          fullContent += chunk.message.content;
          onToken?.(chunk.message.content);
        }
        if (chunk.message.tool_calls) {
          toolCalls = chunk.message.tool_calls;
        }
      } catch {
        // Skip
      }
    }

    const result: OllamaMessage = {
      role: 'assistant',
      content: fullContent,
    };

    if (toolCalls && toolCalls.length > 0) {
      result.tool_calls = toolCalls;
    }

    return result;
  }

  /** Return the list of locally-available model names. */
  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }
    const data = (await response.json()) as { models: { name: string }[] };
    return data.models.map((m) => m.name);
  }

  /** Quick connectivity check. */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
