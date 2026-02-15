"""
OpenAI Agents SDK engine adapter. Uses shared file tools and sandbox; registers as "openai".
"""

import os
from pathlib import Path

from agents import Agent, Runner, function_tool

from backend.engines.base import AgentEngine, EngineResponse, Skill
from backend.engines.prompts import CREATIVE_AGENT_PROMPT
from backend.engines.registry import register
from backend.skills import get_skills_context
from backend.tools import filesystem
from backend.tools.sandbox import execute_python_code as run_python_code
from backend.utils import extract_code_blocks


def _make_tools(workspace_path: str, files_changed: list):
    """Create OpenAI Agents SDK tools. Mutates files_changed on write/edit."""
    root = workspace_path

    @function_tool
    def read_file(path: str) -> str:
        """Read a file from the workspace. path is relative to the workspace root (e.g. src/main.py)."""
        return filesystem.read_file(path, root)

    @function_tool
    def write_file(path: str, content: str) -> str:
        """Create or overwrite a file in the workspace. path is relative; creates directories if needed."""
        result = filesystem.write_file(path, content, root)
        files_changed.append(path)
        return result

    @function_tool
    def edit_file(path: str, old_string: str, new_string: str) -> str:
        """Replace the first occurrence of old_string with new_string in the file at path."""
        result = filesystem.edit_file(path, old_string, new_string, root)
        files_changed.append(path)
        return result

    @function_tool
    def list_files(path: str = ".", recursive: bool = False) -> str:
        """List files and directories at path (relative to workspace). Use recursive=True for full tree."""
        return filesystem.list_files(path, root, recursive=recursive)

    @function_tool
    def glob_files(pattern: str) -> str:
        """Find files matching glob pattern (e.g. **/*.py). Returns newline-separated paths."""
        return filesystem.glob_files(pattern, root)

    @function_tool
    def grep_files(pattern: str, glob_pattern: str = "**/*") -> str:
        """Search file contents for regex pattern. Optional glob_pattern to limit files (default all)."""
        return filesystem.grep_files(pattern, root, glob_pattern=glob_pattern)

    @function_tool
    def execute_python_code(code: str) -> str:
        """Execute Python code in a sandbox and return the output. Use for running scripts or computations."""
        return run_python_code(code)

    return [
        read_file,
        write_file,
        edit_file,
        list_files,
        glob_files,
        grep_files,
        execute_python_code,
    ]


class OpenAIEngine(AgentEngine):
    name = "OpenAI Agents SDK"
    supports_models = ["openai"]

    async def run(
        self,
        message: str,
        history: list[dict],
        workspace_path: str,
        skills: list[Skill],
        model: str | None = None,
    ) -> EngineResponse:
        files_changed: list[str] = []
        tools = _make_tools(workspace_path, files_changed)
        skills_dir = os.environ.get("CHATOOLI_SKILLS_DIR") or str(Path(__file__).resolve().parent.parent.parent / "skills")
        skills_ctx = get_skills_context(skills, skills_dir) if skills and Path(skills_dir).is_dir() else ""
        instructions = CREATIVE_AGENT_PROMPT
        if skills_ctx:
            instructions += "\n---\nFollow these skills when applicable:\n\n" + skills_ctx
        agent = Agent(
            name="Developer",
            instructions=instructions,
            tools=tools,
            model=model or "gpt-5.2",
        )
        result = await Runner.run(agent, message)
        text = result.final_output or ""
        code_blocks = extract_code_blocks(text)
        return EngineResponse(text=text, code_blocks=code_blocks, files_changed=files_changed)


register("openai", OpenAIEngine)
