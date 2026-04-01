# Factory CLI

A local AI coding assistant powered by Ollama.  
Start one command, land in an interactive CLI, and let your local model read, search, edit, and run commands in your workspace — like Claude Code, but fully on your machine.

---

## Prerequisites

| Requirement | Why |
|-------------|-----|
| **Node.js >= 18** | Runtime for the CLI |
| **Ollama** | Hosts the local model — install from [ollama.com](https://ollama.com) |
| **A coding model** | e.g. `ollama pull qwen2.5-coder:32b` |

## Quick Start

```bash
# 1. Install dependencies and build
npm install
npm run bundle

# 2. Register the global `factory` command
npm link

# 3. Make sure Ollama is running
ollama serve          # in another terminal, if not already running

# 4. Launch from any directory
factory
```

Or during development:

```bash
npm run dev                     # run via tsx (no build step)
npx tsx src/cli.ts llama3       # specify a different model
```

You will land in an interactive prompt:

```
  Factory CLI — Local AI Coding Assistant
  Workspace : C:\Users\you\project
  Ollama    : http://localhost:11434
  Model     : qwen2.5-coder:32b
  Approval  : confirm
  Type /help for commands

>
```

If the configured model is not found locally, the CLI will list your installed models and let you pick one interactively.

Type naturally. The model can read your files, search the codebase, make edits, and run commands.

## Global `factory` Command

There are two ways `factory` is registered so you can launch it from any terminal:

### 1. npm link (recommended)

```bash
cd F:\Dev\Factory
npm run bundle
npm link
```

This puts `factory` on your PATH via Node. Works in PowerShell, CMD, and any terminal.

### 2. PowerShell profile alias

If you also want a PS-native alias, add this to your `$PROFILE`:

```powershell
# Factory CLI - local AI coding assistant
function factory { node "F:\Dev\Factory\dist\factory.mjs" @args }
```

Reload with `. $PROFILE` or open a new terminal.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/model [name]` | Show or switch the active model |
| `/models` | List all locally installed models |
| `/tools` | List the tools the model can use |
| `/approval [mode]` | Show or change approval mode (`auto`/`confirm`/`strict`) |
| `/plan <task>` | Ask the model to create a step-by-step plan before execution |
| `/todo` | Show the current plan and its progress |
| `/status` | Show git status, touched files, and session info |
| `/diff` | Show current git diff with color highlighting |
| `/review` | Ask the model to review its own changes |
| `/compact` | Compress older messages to save context window space |
| `/sessions` | List saved conversation sessions |
| `/resume <id>` | Resume a previous session |
| `/clear` | Clear conversation, memory, and plan |
| `/exit` | Exit the CLI |

## Tools Available to the Model

The agent gives the model these tools automatically:

**Workspace**
- **read_file** — read any file in the workspace (with line numbers)
- **list_directory** — list files and directories
- **search_files** — regex search across the codebase
- **edit_file** — precise search-and-replace edits with diff preview
- **create_file** — create new files

**Terminal**
- **run_command** — execute shell commands (with safety guards)

**Git**
- **git_status** — show branch and changed files
- **git_diff** — show the current diff
- **git_log** — show recent commit history
- **git_commit** — stage all and commit

All paths are scoped to the workspace. The model cannot escape the project directory.

## Approval Modes

Factory uses an approval system for safety. Change with `/approval <mode>`:

| Mode | Behavior |
|------|----------|
| `auto` | All tool calls execute immediately |
| `confirm` (default) | Reads/searches run silently; writes and commands need your approval |
| `strict` | Every tool call requires your approval |

When approval is needed, you'll see a prompt like:

```
  ⚠ Approval needed: Edit file: src/index.ts
  - old code
  + new code
  Allow? [Y/n]
```

## Plan Mode

Use `/plan <task description>` to have the model decompose a task into steps before executing anything. Then use `/todo` to track progress.

```
❯ /plan Add user authentication to the Express app

  1. Read the current server setup
  2. Install passport and related packages
  3. Create auth middleware
  4. Add login/register routes
  5. Update the main app to use auth
  6. Run tests

  Plan created! Use /todo to view it.
```

## Repo Awareness

On your first message, Factory automatically scans the workspace and builds a project map including:
- directory structure
- config files (package.json, tsconfig, etc.)
- scripts and dependencies
- recently modified files

This gives the model repo-level awareness before it starts working.

## Working Memory

Factory tracks what happens during a session:
- which files have been read or modified
- key decisions made
- last command output
- a rolling summary of older conversation turns

Use `/compact` to manually compress old messages, or it happens automatically after 30+ messages to preserve context window space.

## Using Alongside Cursor

Factory CLI operates on the same files Cursor has open. A typical workflow:

1. Open your project in Cursor.
2. Open a terminal *inside* Cursor (`` Ctrl+` ``).
3. Type `factory` to start the CLI.
4. Ask the agent to make changes — they appear instantly in Cursor's editor.
5. Use `/status` and `/diff` to see what changed.
6. Use `/review` to have the model inspect its own work.
7. Use Cursor's diff view, git integration, and linting to review changes.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server address |
| `FACTORY_MODEL` | `qwen2.5-coder:32b` | Default model name |
| `FACTORY_APPROVAL` | `confirm` | Default approval mode |

You can also pass the model name as the first CLI argument:

```bash
factory deepseek-coder-v2
```

## Session Persistence

Conversations are auto-saved to `.factory-sessions/` in the workspace.  
Use `/sessions` to list them and `/resume <id>` to pick up where you left off.

## Safety

- All file operations are jailed to the workspace directory.
- Dangerous command patterns (e.g. `rm -rf /`) are blocked.
- Commands have a 60-second timeout and 512 KB output cap.
- The model cannot silently overwrite existing files via `create_file`.
- Write operations require explicit approval in `confirm` and `strict` modes.

## Building

```bash
npm run bundle   # bundle to dist/factory.mjs (single file, fast)
npm run build    # full tsc compile to dist/ (for development)
npm start        # run the bundled version
```

## License

MIT
