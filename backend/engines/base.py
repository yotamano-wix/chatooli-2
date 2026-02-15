"""
Shared engine interface for pluggable agent frameworks.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class Skill:
    """AgentSkills.io skill (Level 1 metadata + optional full content)."""
    name: str
    description: str
    path: str
    content: str | None = None  # Level 2: full SKILL.md content when loaded
    metadata: dict = field(default_factory=dict)


@dataclass
class EngineResponse:
    """Standard response from any engine."""
    text: str
    code_blocks: list[dict]  # [{"language": str, "code": str}, ...]
    files_changed: list[str] = field(default_factory=list)


class AgentEngine(ABC):
    """Abstract base for framework-specific agent engines."""

    name: str = ""
    supports_models: list[str] = []

    @abstractmethod
    async def run(
        self,
        message: str,
        history: list[dict],
        workspace_path: str,
        skills: list[Skill],
        model: str | None = None,
    ) -> EngineResponse:
        """
        Run the agent with the given message and context.

        Args:
            message: User message.
            history: Previous messages [{"role": "user"|"assistant", "content": str}].
            workspace_path: Absolute path to the workspace directory.
            skills: Loaded skills (metadata + optional content).
            model: Optional model override (e.g. "gpt-4o", "claude-sonnet").

        Returns:
            EngineResponse with text, code_blocks, and files_changed.
        """
        ...
