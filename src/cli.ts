/**
 * Factory CLI — interactive local coding assistant.
 *
 * Start it with:
 *   npx tsx src/cli.ts [model-name]
 *   npm run dev
 *
 * Then type naturally to chat with the model.  Slash commands
 * (like /help, /model, /tools, /exit) give you quick controls.
 */

import * as readline from 'readline';
import chalk from 'chalk';
import { AgentLoop } from './agent/loop.js';
import { SessionStore, type Session } from './session/store.js';

// ── Config ────────────────────────────────────────────────────────

const WORKSPACE_PATH = process.cwd();
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.FACTORY_MODEL || 'qwen3-coder:30b';

// ── Helpers ───────────────────────────────────────────────────────

function question(
  rl: readline.Interface,
  prompt: string,
): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function truncate(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return (
    lines.slice(0, maxLines).join('\n') +
    `\n  … (${lines.length - maxLines} more lines)`
  );
}

// ── Slash-command handler ─────────────────────────────────────────

async function handleSlashCommand(
  input: string,
  agent: AgentLoop,
  store: SessionStore,
  session: Session,
): Promise<'continue' | 'exit'> {
  const [cmd, ...args] = input.split(' ');

  switch (cmd) {
    case '/help':
      console.log(chalk.blue('\n  Commands:\n'));
      console.log('  /help              Show this message');
      console.log('  /model [name]      Show or switch the active model');
      console.log('  /models            List locally available models');
      console.log('  /tools             List the tools the model can use');
      console.log('  /sessions          List saved sessions');
      console.log('  /resume <id>       Resume a saved session');
      console.log('  /clear             Clear conversation history');
      console.log('  /exit              Exit the CLI');
      console.log();
      break;

    case '/model':
      if (args.length > 0) {
        agent.setModel(args[0]);
        session.model = args[0];
        console.log(chalk.green(`\n  Model switched to: ${args[0]}\n`));
      } else {
        console.log(chalk.dim(`\n  Current model: ${agent.getModel()}\n`));
      }
      break;

    case '/models':
      try {
        const models = await agent.getOllamaClient().listModels();
        console.log(chalk.blue('\n  Available models:\n'));
        for (const m of models) {
          const marker = m === agent.getModel() ? chalk.green(' ← active') : '';
          console.log(`  • ${m}${marker}`);
        }
        console.log();
      } catch {
        console.log(
          chalk.red('\n  Could not list models. Is Ollama running?\n'),
        );
      }
      break;

    case '/tools':
      console.log(chalk.blue('\n  Tools available to the model:\n'));
      for (const name of agent.getToolNames()) {
        console.log(`  • ${name}`);
      }
      console.log();
      break;

    case '/sessions': {
      const list = await store.list();
      if (list.length === 0) {
        console.log(chalk.dim('\n  No saved sessions.\n'));
      } else {
        console.log(chalk.blue('\n  Saved sessions:\n'));
        for (const s of list) {
          console.log(
            `  ${s.id}  (${s.messageCount} messages, ${s.updatedAt})`,
          );
        }
        console.log();
      }
      break;
    }

    case '/resume':
      if (args.length === 0) {
        console.log(chalk.yellow('\n  Usage: /resume <session-id>\n'));
      } else {
        const loaded = await store.load(args[0]);
        if (loaded) {
          agent.setMessages(loaded.messages);
          agent.setModel(loaded.model);
          session.id = loaded.id;
          session.messages = loaded.messages;
          session.model = loaded.model;
          console.log(
            chalk.green(
              `\n  Resumed session: ${loaded.id} (${loaded.messages.length} messages)\n`,
            ),
          );
        } else {
          console.log(chalk.red(`\n  Session not found: ${args[0]}\n`));
        }
      }
      break;

    case '/clear': {
      const sys = agent.getMessages()[0];
      agent.setMessages(sys ? [sys] : []);
      console.log(chalk.green('\n  Conversation cleared.\n'));
      break;
    }

    case '/exit':
      return 'exit';

    default:
      console.log(
        chalk.yellow(
          `\n  Unknown command: ${cmd}. Type /help for a list.\n`,
        ),
      );
  }

  return 'continue';
}

// ── Main ──────────────────────────────────────────────────────────

async function pickModel(
  rl: readline.Interface,
  available: string[],
  preferred: string,
): Promise<string> {
  // Exact match
  if (available.includes(preferred)) return preferred;

  // Partial match (e.g. "qwen3-coder" matches "qwen3-coder:30b")
  const partial = available.filter((m) => m.startsWith(preferred));
  if (partial.length === 1) return partial[0];

  // Interactive picker
  console.log(chalk.yellow(`\n  Model "${preferred}" not found locally.\n`));
  console.log(chalk.blue('  Available models:\n'));
  available.forEach((m, i) => {
    console.log(`  ${chalk.green(`[${i + 1}]`)} ${m}`);
  });
  console.log();

  while (true) {
    const answer = await question(rl, chalk.green('  Pick a model (number or name): '));
    const trimmed = answer.trim();

    // By number
    const num = parseInt(trimmed, 10);
    if (num >= 1 && num <= available.length) return available[num - 1];

    // By exact name
    if (available.includes(trimmed)) return trimmed;

    // By partial name
    const matches = available.filter((m) => m.includes(trimmed));
    if (matches.length === 1) return matches[0];

    console.log(chalk.yellow('  Not recognized. Try again.'));
  }
}

async function main(): Promise<void> {
  const modelArg = process.argv[2];
  const requestedModel = modelArg || DEFAULT_MODEL;

  // Banner
  console.log(chalk.blue.bold('\n  Factory CLI — Local AI Coding Assistant'));
  console.log(chalk.dim(`  Workspace : ${WORKSPACE_PATH}`));
  console.log(chalk.dim(`  Ollama    : ${OLLAMA_URL}`));

  // Set up readline early so the model picker can use it
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Connectivity check + model auto-detect
  let model = requestedModel;
  const { OllamaClient } = await import('./ollama/client.js');
  const tempClient = new OllamaClient(OLLAMA_URL);

  const alive = await tempClient.ping();
  if (!alive) {
    console.log(
      chalk.yellow(
        '  ⚠  Could not reach Ollama. Make sure it is running:\n' +
          '     ollama serve\n',
      ),
    );
  } else {
    // Auto-detect model
    const available = await tempClient.listModels();
    if (available.length === 0) {
      console.log(
        chalk.yellow(
          '  ⚠  No models found in Ollama. Install one first:\n' +
            '     ollama pull qwen3-coder:30b\n',
        ),
      );
    } else {
      model = await pickModel(rl, available, requestedModel);
    }
  }

  console.log(chalk.dim(`  Model     : ${model}`));
  console.log(chalk.dim('  Type /help for commands\n'));

  const agent = new AgentLoop({
    model,
    workspacePath: WORKSPACE_PATH,
    ollamaBaseUrl: OLLAMA_URL,
  });

  const store = new SessionStore(WORKSPACE_PATH);
  const session: Session = {
    id: store.generateId(),
    model,
    messages: agent.getMessages(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Graceful Ctrl-C
  rl.on('close', () => {
    console.log(chalk.dim('\nGoodbye!\n'));
    process.exit(0);
  });

  // ── REPL loop ────────────────────────────────────────────────

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = await question(rl, chalk.green('\n❯ '));
    const trimmed = input.trim();
    if (!trimmed) continue;

    // Slash commands
    if (trimmed.startsWith('/')) {
      const result = await handleSlashCommand(
        trimmed,
        agent,
        store,
        session,
      );
      if (result === 'exit') {
        rl.close();
        break;
      }
      continue;
    }

    // Regular chat
    try {
      process.stdout.write(chalk.cyan('\n'));

      await agent.processMessage(
        trimmed,

        // onToken — stream text to the terminal
        (token) => {
          process.stdout.write(chalk.cyan(token));
        },

        // onToolCall — show what the model wants to do
        (name, args) => {
          process.stdout.write(chalk.yellow(`\n\n  ⚡ ${name}`));
          const summary = Object.entries(args)
            .map(([k, v]) => {
              const val =
                typeof v === 'string' && v.length > 80
                  ? v.slice(0, 80) + '…'
                  : String(v);
              return `${k}=${val}`;
            })
            .join(', ');
          process.stdout.write(chalk.dim(` (${summary})\n`));
        },

        // onToolResult — show an abbreviated result
        (_, result) => {
          const preview = truncate(result, 15);
          process.stdout.write(
            chalk.dim(
              `  ${preview.split('\n').join('\n  ')}\n`,
            ),
          );
        },
      );

      process.stdout.write('\n');

      // Auto-save session
      session.messages = agent.getMessages();
      await store.save(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  Error: ${msg}\n`));
      if (msg.includes('ECONNREFUSED')) {
        console.error(
          chalk.yellow('  Is Ollama running?  Start it with: ollama serve\n'),
        );
      }
    }
  }
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
