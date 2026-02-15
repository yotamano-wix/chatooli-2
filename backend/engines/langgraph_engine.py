"""
LangGraph engine adapter. ReAct agent with shared file tools; model-agnostic via LangChain.
Registers as "langgraph".
"""

import os
from pathlib import Path

from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from backend.engines.base import AgentEngine, EngineResponse, Skill
from backend.engines.prompts import CREATIVE_AGENT_PROMPT
from backend.engines.registry import register
from backend.skills import get_skills_context
from backend.tools import filesystem
from backend.tools.sandbox import execute_python_code as run_python_code
from backend.utils import extract_code_blocks


def _get_model(model: str | None):
    """Return LangChain chat model. OpenAI, Anthropic (claude-*), or Google (gemini-*)."""
    name = (model or "gpt-5.2").lower()
    if name.startswith("claude"):
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=name)
    if name.startswith("gemini"):
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError:
            raise ImportError(
                "Gemini models require the langchain-google-genai package. "
                "Install with: pip install langchain-google-genai"
            )
        return ChatGoogleGenerativeAI(model=name)
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(model=name)


def _make_tools(workspace_path: str, files_changed: list):
    """Create LangChain tools bound to workspace_path. Mutates files_changed on write/edit."""
    root = workspace_path

    @tool
    def read_file(path: str) -> str:
        """Read a file from the workspace. path is relative to the workspace root (e.g. src/main.py)."""
        return filesystem.read_file(path, root)

    @tool
    def write_file(path: str, content: str) -> str:
        """Create or overwrite a file in the workspace. path is relative; creates directories if needed."""
        result = filesystem.write_file(path, content, root)
        files_changed.append(path)
        return result

    @tool
    def edit_file(path: str, old_string: str, new_string: str) -> str:
        """Replace the first occurrence of old_string with new_string in the file at path."""
        result = filesystem.edit_file(path, old_string, new_string, root)
        files_changed.append(path)
        return result

    @tool
    def list_files(path: str = ".", recursive: bool = False) -> str:
        """List files and directories at path (relative to workspace). Use recursive=True for full tree."""
        return filesystem.list_files(path, root, recursive=recursive)

    @tool
    def glob_files(pattern: str) -> str:
        """Find files matching glob pattern (e.g. **/*.py). Returns newline-separated paths."""
        return filesystem.glob_files(pattern, root)

    @tool
    def grep_files(pattern: str, glob_pattern: str = "**/*") -> str:
        """Search file contents for regex pattern. Optional glob_pattern to limit files (default all)."""
        return filesystem.grep_files(pattern, root, glob_pattern=glob_pattern)

    @tool
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


class LangGraphEngine(AgentEngine):
    name = "LangGraph"
    supports_models = ["openai", "anthropic", "google"]

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
        llm = _get_model(model)
        skills_dir = os.environ.get("CHATOOLI_SKILLS_DIR") or str(Path(__file__).resolve().parent.parent.parent / "skills")
        skills_ctx = get_skills_context(skills, skills_dir) if skills and Path(skills_dir).is_dir() else ""
        prompt_text = CREATIVE_AGENT_PROMPT
        if skills_ctx:
            prompt_text += "\n---\nFollow these skills when applicable:\n\n" + skills_ctx
        agent = create_react_agent(
            llm,
            tools,
            prompt=prompt_text,
        )
        from langchain_core.messages import HumanMessage, AIMessage
        # Build messages from conversation history + current message
        messages = []
        for h in history:
            if h["role"] == "user":
                messages.append(HumanMessage(content=h["content"]))
            else:
                messages.append(AIMessage(content=h["content"]))
        messages.append(HumanMessage(content=message))
        result = agent.invoke({"messages": messages})
        msgs = result.get("messages", [])
        text = msgs[-1].content if msgs else ""
        if not isinstance(text, str):
            text = str(text)
        code_blocks = extract_code_blocks(text)
        return EngineResponse(text=text, code_blocks=code_blocks, files_changed=files_changed)


register("langgraph", LangGraphEngine)
