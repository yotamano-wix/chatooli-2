"""
OpenHands SDK engine adapter. Uses OpenHands Agent + Conversation with workspace.
Registers as "openhands". Requires openhands-sdk and openhands-tools.
"""

from backend.engines.base import AgentEngine, EngineResponse, Skill
from backend.engines.registry import register
from backend.utils import extract_code_blocks


class OpenHandsEngine(AgentEngine):
    name = "OpenHands"
    supports_models = ["openai", "anthropic"]

    async def run(
        self,
        message: str,
        history: list[dict],
        workspace_path: str,
        skills: list[Skill],
        model: str | None = None,
    ) -> EngineResponse:
        try:
            from openhands.sdk import LLM, Agent, Conversation, Tool
            from openhands.tools.file_editor import FileEditorTool
            from openhands.tools.terminal import TerminalTool
        except ImportError as e:
            return EngineResponse(
                text=f"OpenHands SDK not installed or incompatible: {e}. Install with: pip install openhands-sdk openhands-tools",
                code_blocks=[],
                files_changed=[],
            )
        import os
        api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("LLM_API_KEY")
        if not api_key:
            return EngineResponse(
                text="Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or LLM_API_KEY to use OpenHands.",
                code_blocks=[],
                files_changed=[],
            )
        model_id = model or os.environ.get("LLM_MODEL", "openai/gpt-4o-mini")
        if not model_id.startswith(("openai/", "anthropic/")):
            model_id = f"openai/{model_id}"
        from pydantic import SecretStr
        llm = LLM(
            model=model_id,
            api_key=SecretStr(api_key),
        )
        agent = Agent(
            llm=llm,
            tools=[
                Tool(name=TerminalTool.name),
                Tool(name=FileEditorTool.name),
            ],
        )
        conversation = Conversation(agent=agent, workspace=workspace_path)
        conversation.send_message(message)
        conversation.run()
        # Try to get final response from conversation state
        text = ""
        if hasattr(conversation, "state") and conversation.state and hasattr(conversation.state, "messages"):
            msgs = conversation.state.messages
            if msgs:
                last = msgs[-1]
                if hasattr(last, "content"):
                    text = getattr(last.content, "content", str(last.content)) if hasattr(last.content, "content") else str(last.content)
                else:
                    text = str(last)
        if not text:
            text = "Request completed. (OpenHands does not expose final message text in this adapter; check workspace for file changes.)"
        code_blocks = extract_code_blocks(text)
        return EngineResponse(text=text, code_blocks=code_blocks, files_changed=[])


# Only register if OpenHands SDK is installed (so it doesn't appear in UI and then fail)
try:
    from openhands.sdk import LLM  # noqa: F401
    register("openhands", OpenHandsEngine)
except ImportError:
    pass
