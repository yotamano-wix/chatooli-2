"""
Claude (Anthropic Messages API) engine adapter. Tool-use loop with shared file tools.
Registers as "claude".
"""

import os
from pathlib import Path

from anthropic import Anthropic

from backend.engines.base import AgentEngine, EngineResponse, Skill
from backend.engines.prompts import CREATIVE_AGENT_PROMPT
from backend.engines.registry import register
from backend.skills import get_skills_context
from backend.tools import filesystem
from backend.tools.sandbox import execute_python_code as run_python_code
from backend.utils import extract_code_blocks


def _tools_schema():
    """Anthropic tool definitions (no workspace_path in schema; we bind at invoke)."""
    return [
        {
            "name": "read_file",
            "description": "Read a file from the workspace. path is relative to the workspace root (e.g. src/main.py).",
            "input_schema": {
                "type": "object",
                "properties": {"path": {"type": "string", "description": "Relative path to file"}},
                "required": ["path"],
            },
        },
        {
            "name": "write_file",
            "description": "Create or overwrite a file in the workspace. path is relative; creates directories if needed.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
        {
            "name": "edit_file",
            "description": "Replace the first occurrence of old_string with new_string in the file at path.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old_string": {"type": "string"},
                    "new_string": {"type": "string"},
                },
                "required": ["path", "old_string", "new_string"],
            },
        },
        {
            "name": "list_files",
            "description": "List files and directories at path (relative to workspace). Use recursive=True for full tree.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "default": "."},
                    "recursive": {"type": "boolean", "default": False},
                },
            },
        },
        {
            "name": "glob_files",
            "description": "Find files matching glob pattern (e.g. **/*.py). Returns newline-separated paths.",
            "input_schema": {
                "type": "object",
                "properties": {"pattern": {"type": "string"}},
                "required": ["pattern"],
            },
        },
        {
            "name": "grep_files",
            "description": "Search file contents for regex pattern. Optional glob_pattern to limit files (default all).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string"},
                    "glob_pattern": {"type": "string", "default": "**/*"},
                },
                "required": ["pattern"],
            },
        },
        {
            "name": "execute_python_code",
            "description": "Execute Python code in a sandbox and return the output. Use for running scripts or computations.",
            "input_schema": {
                "type": "object",
                "properties": {"code": {"type": "string"}},
                "required": ["code"],
            },
        },
    ]


def _run_tool(name: str, args: dict, workspace_path: str, files_changed: list) -> str:
    """Run a tool and track file changes."""
    root = workspace_path
    try:
        if name == "read_file":
            return filesystem.read_file(args["path"], root)
        if name == "write_file":
            result = filesystem.write_file(args["path"], args["content"], root)
            files_changed.append(args["path"])
            return result
        if name == "edit_file":
            result = filesystem.edit_file(args["path"], args["old_string"], args["new_string"], root)
            files_changed.append(args["path"])
            return result
        if name == "list_files":
            return filesystem.list_files(args.get("path", "."), root, recursive=args.get("recursive", False))
        if name == "glob_files":
            return filesystem.glob_files(args["pattern"], root)
        if name == "grep_files":
            return filesystem.grep_files(args["pattern"], root, glob_pattern=args.get("glob_pattern", "**/*"))
        if name == "execute_python_code":
            return run_python_code(args["code"])
    except Exception as e:
        return f"Error: {e}"
    return "Unknown tool"


class ClaudeEngine(AgentEngine):
    name = "Claude (Anthropic)"
    supports_models = ["anthropic"]

    async def run(
        self,
        message: str,
        history: list[dict],
        workspace_path: str,
        skills: list[Skill],
        model: str | None = None,
    ) -> EngineResponse:
        client = Anthropic()
        model_id = model or "claude-sonnet-4-5"
        tools = _tools_schema()
        skills_dir = os.environ.get("CHATOOLI_SKILLS_DIR") or str(Path(__file__).resolve().parent.parent.parent / "skills")
        skills_ctx = get_skills_context(skills, skills_dir) if skills and Path(skills_dir).is_dir() else ""
        system = CREATIVE_AGENT_PROMPT
        if skills_ctx:
            system += "\n\n---\nFollow these skills when applicable:\n\n" + skills_ctx
        # Build messages from conversation history + current message
        messages: list[dict] = []
        for h in history:
            messages.append({"role": h["role"], "content": h["content"]})
        messages.append({"role": "user", "content": message})
        max_turns = 20
        text = ""
        files_changed: list[str] = []

        for _ in range(max_turns):
            resp = client.messages.create(
                model=model_id,
                max_tokens=8192,
                system=system,
                messages=messages,
                tools=tools,
            )
            # Build assistant message for history
            assistant_content = []
            tool_results = []
            for block in resp.content:
                if block.type == "text":
                    text = block.text
                    assistant_content.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    assistant_content.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })
                    result = _run_tool(block.name, block.input, workspace_path, files_changed)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

            messages.append({"role": resp.role, "content": assistant_content})
            if not tool_results:
                break
            messages.append({"role": "user", "content": tool_results})

        code_blocks = extract_code_blocks(text)
        return EngineResponse(text=text, code_blocks=code_blocks, files_changed=files_changed)


register("claude", ClaudeEngine)
