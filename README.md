# Factory CLI

A local AI coding assistant powered by [Ollama](https://ollama.com). It runs an interactive terminal session in which a locally hosted model can read, search and edit files in your workspace and run shell commands, with an approval step before anything is written. It is a small, self-contained take on tools like Claude Code that keeps all inference on your own machine.

## Stack

- TypeScript on Node.js 18+ (ESM)
- Ollama HTTP API for model access (default model `qwen2.5-coder:32b`)
- `chalk` for terminal output, `diff` for edit previews
- `esbuild` to bundle to a single file, `tsx` for development

## Running

Prerequisites: Node.js 18 or newer, a running Ollama server, and a pulled coding model (for example `ollama pull qwen2.5-coder:32b`).

```bash
npm install
npm run bundle      # builds dist/factory.mjs
npm link            # optional: registers the global `factory` command
factory             # run from the workspace you want to work in
```

Without building:

```bash
npm run dev                     # runs src/cli.ts via tsx
npx tsx src/cli.ts llama3       # pass a model name as the first argument
```

### Configuration

| Environment variable | Default | Description |
|----------------------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server address |
| `FACTORY_MODEL` | `qwen2.5-coder:32b` | Default model name |
| `FACTORY_APPROVAL` | `confirm` | Default approval mode |

If the configured model is not installed, the CLI lists local models and lets you pick one.

## Features

**Tools available to the model**

- Workspace: `read_file`, `list_directory`, `search_files` (regex), `edit_file` (search and replace with diff preview), `create_file`
- Terminal: `run_command`
- Git: `git_status`, `git_diff`, `git_log`, `git_commit`

**Slash commands**

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/model [name]`, `/models` | Show or switch the model; list installed models |
| `/tools` | List the tools the model can use |
| `/approval [mode]` | Show or change the approval mode |
| `/plan <task>`, `/todo` | Have the model write a step-by-step plan; show its progress |
| `/status`, `/diff`, `/review` | Git status, colored diff, and a model review of its own changes |
| `/compact` | Summarize older messages to save context |
| `/sessions`, `/resume <id>` | List and resume saved conversations |
| `/clear`, `/exit` | Reset the conversation; quit |

**Approval modes** (`auto`, `confirm`, `strict`): in `confirm` (the default), reads and searches run silently while writes and commands ask for approval; `strict` asks for every tool call; `auto` asks for none.

**Repo awareness and memory**: on the first message the CLI builds a project map (directory structure, config files, scripts, recently modified files). It tracks files read or modified and recent command output, and compacts older turns automatically after about 30 messages. Sessions are saved to `.factory-sessions/` in the workspace.

**Safety**: file paths are confined to the workspace, obviously destructive commands are blocked, commands have a 60-second timeout and a 512 KB output cap, and `create_file` will not silently overwrite existing files.

## Project layout

```
src/cli.ts          interactive prompt and slash commands
src/agent/          agent loop, planner, memory, approval, tool registry, tool-call parser
src/ollama/         Ollama client
src/tools/          workspace, terminal and git tools
src/context/        repository map
src/session/        session persistence
```

## Status

Early-stage personal project (version 0.1.0). There is no automated test suite yet.

## License

MIT
