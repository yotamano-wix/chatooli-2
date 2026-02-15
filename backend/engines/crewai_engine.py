"""
CrewAI engine adapter. Uses shared file tools and sandbox; registers as "crewai".
"""

import asyncio
from crewai import Agent, Task, Crew, Process
from crewai.tools import tool

from backend.engines.base import AgentEngine, EngineResponse, Skill
from backend.engines.prompts import CREATIVE_AGENT_PROMPT
from backend.engines.registry import register
from backend.skills import get_skills_context
from backend.tools import filesystem
from backend.tools.sandbox import execute_python_code
from backend.utils import extract_code_blocks


def _make_tools(workspace_path: str, files_changed: list):
    """Create CrewAI tools bound to workspace_path. Mutates files_changed on write/edit."""

    @tool("Read File")
    def read_file_tool(path: str) -> str:
        """Read a file from the workspace. path is relative to the workspace root (e.g. 'src/main.py')."""
        return filesystem.read_file(path, workspace_path)

    @tool("Write File")
    def write_file_tool(path: str, content: str) -> str:
        """Create or overwrite a file in the workspace. path is relative; creates directories if needed."""
        result = filesystem.write_file(path, content, workspace_path)
        files_changed.append(path)
        return result

    @tool("Edit File")
    def edit_file_tool(path: str, old_string: str, new_string: str) -> str:
        """Replace the first occurrence of old_string with new_string in the file at path."""
        result = filesystem.edit_file(path, old_string, new_string, workspace_path)
        files_changed.append(path)
        return result

    @tool("List Files")
    def list_files_tool(path: str = ".", recursive: bool = False) -> str:
        """List files and directories at path (relative to workspace). Use recursive=True for full tree."""
        return filesystem.list_files(path, workspace_path, recursive=recursive)

    @tool("Glob Files")
    def glob_files_tool(pattern: str) -> str:
        """Find files matching glob pattern (e.g. '**/*.py'). Returns newline-separated paths."""
        return filesystem.glob_files(pattern, workspace_path)

    @tool("Grep Files")
    def grep_files_tool(pattern: str, glob_pattern: str = "**/*") -> str:
        """Search file contents for regex pattern. Optional glob_pattern to limit files (default all)."""
        return filesystem.grep_files(pattern, workspace_path, glob_pattern=glob_pattern)

    @tool("Execute Python Code")
    def execute_python_code_tool(code: str) -> str:
        """Execute Python code in a sandbox and return the output. Use for running scripts or computations."""
        return execute_python_code(code)

    return [
        read_file_tool,
        write_file_tool,
        edit_file_tool,
        list_files_tool,
        glob_files_tool,
        grep_files_tool,
        execute_python_code_tool,
    ]


class CrewAIEngine(AgentEngine):
    name = "CrewAI"
    supports_models = ["openai", "anthropic"]

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
        import os
        from pathlib import Path
        skills_dir = os.environ.get("CHATOOLI_SKILLS_DIR") or str(Path(__file__).resolve().parent.parent.parent / "skills")
        skills_ctx = get_skills_context(skills, skills_dir) if skills_dir and Path(skills_dir).is_dir() else ""
        agent = Agent(
            role="Creative Coding Agent",
            goal="Help designers create visual code by reading/writing/editing files in the workspace.",
            backstory=CREATIVE_AGENT_PROMPT,
            tools=tools,
            max_retry_limit=2,
            verbose=True,
        )
        task_desc = f"User message: {message}"
        if skills_ctx:
            task_desc = task_desc + "\n\n---\nRelevant skills (follow when applicable):\n\n" + skills_ctx
        task = Task(
            description=task_desc,
            expected_output="A helpful response; include code blocks when relevant.",
            agent=agent,
        )
        crew = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, crew.kickoff)
        text = str(result)
        code_blocks = extract_code_blocks(text)
        return EngineResponse(text=text, code_blocks=code_blocks, files_changed=files_changed)


register("crewai", CrewAIEngine)
