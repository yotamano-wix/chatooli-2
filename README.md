# Chatooli — AI Chat & Code Sandbox

A **pluggable** AI coding assistant: same UI and API, swap the agent framework (CrewAI, LangGraph, OpenAI Agents SDK, Claude, OpenHands) from the dropdown or by changing one parameter.

## Features

- **Chat Interface** — Natural language conversation with an AI agent
- **Code Sandbox** — Agent writes and executes code; live HTML preview when relevant
- **Workspace & Files** — Agent can read/write files in a workspace; Files tab shows the tree
- **Swap Frameworks** — Change engine and model in the UI or via API (no code change)
- **Skills** — Optional AgentSkills-style `SKILL.md` loading for domain guidance (e.g. creative coding)

## Swapping frameworks

### In the UI

1. Open [http://localhost:8000](http://localhost:8000).
2. In the **header**, use the two dropdowns:
   - **Engine** — Choose which framework runs the agent (CrewAI, LangGraph, OpenAI Agents SDK, Claude, OpenHands).
   - **Model** — Optional. Leave as “Default model” or pick e.g. `gpt-4o`, `claude-sonnet-4`.
3. Send a message. The selected engine and model are used for that request (and stay selected until you change them).

No reload or config change needed; switching engines is immediate.

### Via API

Send the same request to `/api/chat` or `/api/chat/stream` and set **`engine`** (and optionally **`model`**):

```bash
# CrewAI (default)
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "List files in the workspace", "engine": "crewai"}'

# LangGraph with OpenAI
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "engine": "langgraph", "model": "gpt-4o-mini"}'

# Claude (Anthropic)
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "engine": "claude", "model": "claude-sonnet-4-20250514"}'
```

**Request body:**

| Field            | Required | Description |
|-----------------|----------|-------------|
| `message`       | Yes      | User message. |
| `engine`         | No       | Engine ID (default: `crewai`). See table below. |
| `model`         | No       | Model name override (e.g. `gpt-4o`, `claude-sonnet-4-20250514`). |
| `session_id`    | No       | Conversation session; omit to start a new one. |
| `workspace_path`| No       | Workspace root for file tools; defaults to `./workspace`. |

### Available engines

| Engine ID   | Name               | API key / env           | Notes |
|-------------|--------------------|-------------------------|--------|
| `crewai`    | CrewAI             | `OPENAI_API_KEY`        | Multi-model via CrewAI config. |
| `openai`    | OpenAI Agents SDK  | `OPENAI_API_KEY`        | OpenAI models only. |
| `langgraph` | LangGraph          | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | Model-agnostic; use `gpt-*` or `claude-*` in `model`. |
| `claude`    | Claude (Anthropic) | `ANTHROPIC_API_KEY`     | Anthropic models only. |
| `openhands` | OpenHands          | `OPENAI_API_KEY` or `LLM_API_KEY` | Optional: `pip install openhands-sdk openhands-tools`. |

To see what’s actually registered (e.g. after installing/removing dependencies):

```bash
curl http://localhost:8000/api/engines
```

### Summary

- **UI:** Use the **Engine** and **Model** dropdowns in the header.
- **API:** Set **`engine`** (and optionally **`model`**) in the JSON body; same endpoints, no code change.
- **Keys:** Ensure the right env vars for the engine you choose (see table above).

## Architecture

```
chatooli-2/
├── backend/
│   ├── app.py              # FastAPI, engine routing, workspace/skills
│   ├── engines/            # Pluggable engines
│   │   ├── base.py         # AgentEngine, EngineResponse, Skill
│   │   ├── registry.py     # Engine discovery & get_engine(id)
│   │   ├── crewai_engine.py
│   │   ├── openai_engine.py
│   │   ├── langgraph_engine.py
│   │   ├── claude_engine.py
│   │   └── openhands_engine.py
│   ├── tools/              # Shared (filesystem, sandbox)
│   └── skills/             # SKILL.md loader
├── frontend/               # UI (engine + model dropdowns, Preview/Code/Files)
├── skills/                 # Example SKILL.md files
├── workspace/              # Default workspace for file tools
├── run.py
├── requirements.txt
└── .env
```

## Quick Start

### 1. Install dependencies

```bash
pip install -r requirements.txt
# or: uv pip install -r requirements.txt
```

### 2. Set up environment

```bash
cp .env.example .env
# Add at least one key, depending on which engine you use:
#   OPENAI_API_KEY=sk-...   (for crewai, openai, langgraph)
#   ANTHROPIC_API_KEY=...   (for claude, langgraph with claude-*)
```

### 3. Run the server

```bash
python run.py
```

### 4. Open the UI

Go to [http://localhost:8000](http://localhost:8000), pick an **Engine** and optional **Model** in the header, and chat.

## API Endpoints

| Method   | Endpoint | Description |
|----------|----------|-------------|
| `GET`    | `/` | Serve the UI |
| `GET`    | `/api/engines` | List available engines (id, name, supports_models) |
| `GET`    | `/api/workspace/entries?path=.` | List workspace files (for Files tab) |
| `POST`   | `/api/chat` | Send a message (body: `message`, optional `engine`, `model`, `session_id`) |
| `POST`   | `/api/chat/stream` | Same, with SSE streaming |
| `GET`    | `/api/sessions/{id}` | Get session history |
| `DELETE` | `/api/sessions/{id}` | Clear a session |

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (crewai, openai, langgraph) | — |
| `ANTHROPIC_API_KEY` | Anthropic API key (claude, langgraph with claude) | — |
| `CHATOOLI_WORKSPACE` | Workspace root for file tools | `./workspace` |
| `CHATOOLI_SKILLS_DIR` | Directory containing `SKILL.md` files | `./skills` |

## Tech Stack

- **Backend**: FastAPI, pluggable engines (CrewAI, LangGraph, OpenAI Agents SDK, Claude, OpenHands), shared file/sandbox tools, Skills loader
- **Frontend**: Vanilla HTML/CSS/JS, engine/model dropdowns, Preview / Code / Files tabs
