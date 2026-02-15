"""
FastAPI application: pluggable agent engines with shared UI and API.
"""

import asyncio
import json
import mimetypes
import os
import uuid
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

import re

from backend.engines import registry
from backend.skills import load_skills_metadata
from backend.tools import filesystem


def _auto_save_html(response_text: str, code_blocks: list, files_changed: list, workspace_path: str) -> list:
    """
    If the agent returned HTML in a code block but didn't write any files,
    auto-save it to the workspace so it's always readable on the next turn.
    Returns updated files_changed list.
    """
    # Skip if agent already wrote files
    if files_changed:
        return files_changed

    # Find the first HTML code block with a full document
    for block in code_blocks:
        code = block.get("code", "")
        if "<!DOCTYPE" in code or "<html" in code:
            # Determine a filename — use "sketch.html" as default
            # or try to extract a <title> for a better name
            title_match = re.search(r"<title>(.*?)</title>", code, re.IGNORECASE)
            if title_match:
                name = title_match.group(1).strip().lower()
                name = re.sub(r"[^a-z0-9]+", "-", name).strip("-")[:40]
                if name:
                    name = f"{name}.html"
                else:
                    name = "sketch.html"
            else:
                name = "sketch.html"

            try:
                filepath = Path(workspace_path) / name
                filepath.write_text(code, encoding="utf-8")
                return [name]
            except Exception:
                pass
            break

    return files_changed

# Register all engine adapters (import side-effect; skip if dependency missing)
try:
    import backend.engines.crewai_engine  # noqa: F401
except Exception:
    pass
try:
    import backend.engines.openai_engine  # noqa: F401
except Exception:
    pass
try:
    import backend.engines.langgraph_engine  # noqa: F401
except Exception:
    pass
try:
    import backend.engines.claude_engine  # noqa: F401
except Exception:
    pass
try:
    import backend.engines.openhands_engine  # noqa: F401
except Exception:
    pass

# Project root (parent of backend/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WORKSPACE = os.environ.get("CHATOOLI_WORKSPACE", str(PROJECT_ROOT / "workspace"))
DEFAULT_SKILLS_DIR = os.environ.get("CHATOOLI_SKILLS_DIR", str(PROJECT_ROOT / "skills"))

sessions: dict[str, list[dict]] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(DEFAULT_WORKSPACE).mkdir(parents=True, exist_ok=True)
    Path(DEFAULT_SKILLS_DIR).mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Chatooli - AI Chat & Sandbox", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="frontend"), name="static")


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    engine: str = "crewai"
    model: str | None = None
    workspace_path: str | None = None


@app.get("/", response_class=HTMLResponse)
async def index():
    with open("frontend/index.html", "r") as f:
        return HTMLResponse(content=f.read())


@app.get("/api/engines")
async def list_engines():
    """List available agent engines (id, name, supports_models)."""
    return JSONResponse(content=registry.list_engines())


@app.get("/api/workspace/entries")
async def workspace_entries(path: str = ".", workspace_path: str | None = None):
    """List workspace directory entries (name, type). path is relative to workspace root."""
    root = workspace_path or DEFAULT_WORKSPACE
    try:
        raw = filesystem.list_files(path, root, recursive=False)
        # Parse tree output into list of { name, type }
        lines = raw.strip().split("\n")
        entries = []
        for line in lines:
            line = line.strip()
            if line.startswith("├── ") or line.startswith("└── "):
                name = line[4:]
                if name and name != "(permission denied)":
                    is_dir = name.endswith("/")
                    entries.append({
                        "name": name.rstrip("/"),
                        "type": "directory" if is_dir else "file",
                    })
        return JSONResponse(content={"path": path, "entries": entries})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/workspace/files/{file_path:path}")
async def workspace_file(file_path: str, workspace_path: str | None = None):
    """
    Serve a file from the workspace. Supports any file type (HTML, JS, CSS, images, GLSL, etc.).
    Relative paths like <script src="sketch.js"> resolve against the same base URL.
    """
    root = workspace_path or DEFAULT_WORKSPACE
    try:
        full = (Path(root) / file_path).resolve()
        # Security: ensure path doesn't escape workspace
        if not str(full).startswith(str(Path(root).resolve())):
            return JSONResponse(status_code=403, content={"error": "Path escapes workspace"})
        if not full.is_file():
            return JSONResponse(status_code=404, content={"error": f"File not found: {file_path}"})

        content = full.read_bytes()
        mime_type, _ = mimetypes.guess_type(str(full))
        if mime_type is None:
            # Guess by extension for common creative-coding types
            ext = full.suffix.lower()
            mime_map = {
                ".glsl": "text/plain",
                ".frag": "text/plain",
                ".vert": "text/plain",
                ".wgsl": "text/plain",
                ".obj": "text/plain",
                ".mtl": "text/plain",
            }
            mime_type = mime_map.get(ext, "application/octet-stream")

        return Response(
            content=content,
            media_type=mime_type,
            headers={
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except PermissionError:
        return JSONResponse(status_code=403, content={"error": "Permission denied"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/chat")
async def chat(request: ChatRequest):
    session_id = request.session_id or str(uuid.uuid4())
    workspace_path = request.workspace_path or DEFAULT_WORKSPACE
    skills_dir = DEFAULT_SKILLS_DIR

    if session_id not in sessions:
        sessions[session_id] = []
    sessions[session_id].append({"role": "user", "content": request.message})

    try:
        engine = registry.get_engine(request.engine)
        skills = load_skills_metadata(skills_dir)
        history = sessions[session_id][:-1]

        response = await engine.run(
            message=request.message,
            history=history,
            workspace_path=workspace_path,
            skills=skills,
            model=request.model,
        )

        # Auto-save inline HTML to workspace so it's always readable
        files_changed = _auto_save_html(
            response.text, response.code_blocks, response.files_changed, workspace_path
        )

        sessions[session_id].append({"role": "assistant", "content": response.text})

        return JSONResponse(content={
            "session_id": session_id,
            "response": response.text,
            "code_blocks": response.code_blocks,
            "files_changed": files_changed,
        })
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "session_id": session_id,
                "response": f"Error: {str(e)}",
                "code_blocks": [],
                "files_changed": [],
            },
        )


@app.post("/api/chat/stream")
async def chat_stream(request: Request):
    body = await request.json()
    user_message = body.get("message", "")
    session_id = body.get("session_id") or str(uuid.uuid4())
    engine_id = body.get("engine", "crewai")
    model = body.get("model")
    workspace_path = body.get("workspace_path") or DEFAULT_WORKSPACE
    skills_dir = DEFAULT_SKILLS_DIR

    if session_id not in sessions:
        sessions[session_id] = []
    sessions[session_id].append({"role": "user", "content": user_message})

    async def event_generator():
        yield {"event": "thinking", "data": json.dumps({"status": "Agent is thinking..."})}

        try:
            engine = registry.get_engine(engine_id)
            skills = load_skills_metadata(skills_dir)
            history = sessions[session_id][:-1]

            response = await engine.run(
                message=user_message,
                history=history,
                workspace_path=workspace_path,
                skills=skills,
                model=model,
            )

            # Auto-save inline HTML to workspace
            files_changed = _auto_save_html(
                response.text, response.code_blocks, response.files_changed, workspace_path
            )

            for block in response.code_blocks:
                yield {"event": "code", "data": json.dumps(block)}

            yield {
                "event": "response",
                "data": json.dumps({
                    "session_id": session_id,
                    "response": response.text,
                    "code_blocks": response.code_blocks,
                    "files_changed": files_changed,
                }),
            }
        except Exception as e:
            yield {
                "event": "response",
                "data": json.dumps({
                    "session_id": session_id,
                    "response": f"Error: {str(e)}",
                    "code_blocks": [],
                    "files_changed": [],
                }),
            }

        yield {"event": "done", "data": json.dumps({"status": "complete"})}

    return EventSourceResponse(event_generator())


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    history = sessions.get(session_id, [])
    return JSONResponse(content={"session_id": session_id, "history": history})


@app.delete("/api/sessions/{session_id}")
async def clear_session(session_id: str):
    if session_id in sessions:
        del sessions[session_id]
    return JSONResponse(content={"status": "cleared"})
