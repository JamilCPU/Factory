# Factory CLI

A local AI coding assistant powered by Ollama.  
Start one command, land in an interactive CLI, and let your local model read, search, edit, and run commands in your workspace — like Copilot CLI, but fully on your machine.

---

## Prerequisites

| Requirement | Why |
|-------------|-----|
| **Node.js >= 18** | Runtime for the CLI |
| **Ollama** | Hosts the local model — install from [ollama.com](https://ollama.com) |
| **A coding model** | e.g. `ollama pull qwen3-coder:30b` |

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
  Model     : qwen3-coder:30b
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
| `/sessions` | List saved conversation sessions |
| `/resume <id>` | Resume a previous session |
| `/clear` | Clear the current conversation |
| `/exit` | Exit the CLI |

## Tools Available to the Model

The agent gives the model these tools automatically:

- **read_file** — read any file in the workspace (with line numbers)
- **list_directory** — list files and directories
- **search_files** — regex search across the codebase
- **edit_file** — precise search-and-replace edits with diff preview
- **create_file** — create new files
- **run_command** — execute shell commands (with safety guards)

All paths are scoped to the workspace. The model cannot escape the project directory.

## Using Alongside Cursor

Factory CLI operates on the same files Cursor has open. A typical workflow:

1. Open your project in Cursor.
2. Open a terminal *inside* Cursor (`` Ctrl+` ``).
3. Type `factory` to start the CLI.
4. Ask the agent to make changes — they appear instantly in Cursor's editor.
5. Use Cursor's diff view, git integration, and linting to review changes.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server address |
| `FACTORY_MODEL` | `qwen3-coder:30b` | Default model name |

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

## Building

```bash
npm run bundle   # bundle to dist/factory.mjs (single file, fast)
npm run build    # full tsc compile to dist/ (for development)
npm start        # run the bundled version
```

## License

MIT
