/**
 * Fallback tool-call parser — extracts tool intents from plain text
 * when the model fails to use structured tool_calls.
 *
 * Handles several patterns models commonly emit:
 *   1. {"name": "tool", "arguments": {...}}
 *   2. ```json\n{"name": "tool", ...}\n```
 *   3. <tool_call>{"name": "tool", ...}</tool_call>
 *   4. {"function": {"name": "tool", "arguments": {...}}}
 */

import type { OllamaToolCall } from '../ollama/client.js';

interface RawToolIntent {
  name?: string;
  arguments?: Record<string, unknown>;
  function?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  parameters?: Record<string, unknown>;
}

/**
 * Try to extract tool calls from the assistant's text content.
 * Returns an array of parsed tool calls, or an empty array if none found.
 */
export function parseToolCallsFromText(
  content: string,
  knownToolNames: string[],
): OllamaToolCall[] {
  const calls: OllamaToolCall[] = [];

  // Strategy 1: Find JSON objects in code fences
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  let match;
  while ((match = fencePattern.exec(content)) !== null) {
    const parsed = tryParseToolCall(match[1], knownToolNames);
    if (parsed) calls.push(parsed);
  }
  if (calls.length > 0) return calls;

  // Strategy 2: Find <tool_call>...</tool_call> blocks
  const tagPattern = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  while ((match = tagPattern.exec(content)) !== null) {
    const parsed = tryParseToolCall(match[1], knownToolNames);
    if (parsed) calls.push(parsed);
  }
  if (calls.length > 0) return calls;

  // Strategy 3: Find bare JSON objects that look like tool calls
  const jsonPattern = /\{[\s\S]*?"(?:name|function)"[\s\S]*?\}/g;
  const candidates = content.match(jsonPattern);
  if (candidates) {
    for (const candidate of candidates) {
      // Try to find the largest valid JSON object starting from this match
      const parsed = tryParseToolCall(candidate, knownToolNames);
      if (parsed) {
        calls.push(parsed);
        break; // Usually only one tool call per text block
      }
    }
  }

  return calls;
}

function tryParseToolCall(
  text: string,
  knownToolNames: string[],
): OllamaToolCall | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;

  // Try to extract the complete JSON — models sometimes include trailing text
  let obj: RawToolIntent;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    // Try to find just the JSON portion
    const braceEnd = findMatchingBrace(trimmed);
    if (braceEnd < 0) return null;
    try {
      obj = JSON.parse(trimmed.slice(0, braceEnd + 1));
    } catch {
      return null;
    }
  }

  // Pattern: {"function": {"name": ..., "arguments": ...}}
  if (obj.function?.name && knownToolNames.includes(obj.function.name)) {
    return {
      function: {
        name: obj.function.name,
        arguments: obj.function.arguments || {},
      },
    };
  }

  // Pattern: {"name": "tool_name", "arguments": {...}}
  if (obj.name && knownToolNames.includes(obj.name)) {
    return {
      function: {
        name: obj.name,
        arguments: obj.arguments || obj.parameters || {},
      },
    };
  }

  return null;
}

function findMatchingBrace(text: string): number {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}
