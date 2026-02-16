# Chatooli

AI-powered creative coding agent built with [Mastra](https://mastra.ai). Model-agnostic — works with OpenAI, Anthropic, Google, and any provider Mastra supports.

## Architecture

```
frontend/          → Chat UI + sandbox preview (vanilla HTML/CSS/JS)
backend-ts/        → Hono server + Mastra agent with tools
  src/
    index.ts         → HTTP server (serves frontend + API)
    mastra-engine.ts → Mastra agent with filesystem & sandbox tools
    prompts.ts       → System prompt
    sessions.ts      → In-memory chat sessions
    utils.ts         → Code block extraction
    tools/
      filesystem.ts  → read/write/edit/list/glob/grep files
      sandbox.ts     → Python code execution
workspace/         → Agent's working directory (output files go here)
```

## Quick Start

1. **Set up environment variables**

```bash
cp .env.example .env
# Add your API keys:
#   OPENAI_API_KEY=sk-...
#   ANTHROPIC_API_KEY=sk-ant-...
#   GOOGLE_GENERATIVE_AI_API_KEY=...
```

2. **Install dependencies**

```bash
cd backend-ts
npm install
```

3. **Run the dev server**

```bash
npm run dev
```

4. **Open** [http://localhost:3000](http://localhost:3000)

## Model Selection

The agent is model-agnostic. Select a model from the dropdown or leave it on "Default model" (GPT-4o). Supported providers:

| Provider   | Example models                     |
| ---------- | ---------------------------------- |
| OpenAI     | gpt-4o, gpt-4o-mini               |
| Anthropic  | claude-sonnet-4-5, claude-haiku-4-5 |
| Google     | gemini-2.5-pro, gemini-2.5-flash  |

Any model string in `provider/model` format is supported (e.g. `openai/gpt-4o`).

## Tools

The agent has access to these workspace tools:

- **read_file** — Read files from the workspace
- **write_file** — Create or overwrite files
- **edit_file** — Find-and-replace in files
- **list_files** — List directory contents
- **glob_files** — Find files by pattern
- **grep_files** — Search file contents
- **execute_python_code** — Run Python in a sandbox
