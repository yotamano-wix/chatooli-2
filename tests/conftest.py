"""Pytest fixtures (temp workspace, mock engine)."""
import os
import tempfile
from pathlib import Path

import pytest

from backend.engines.base import AgentEngine, EngineResponse, Skill
from backend.engines.registry import register


@pytest.fixture
def temp_workspace(tmp_path):
    """A temporary directory as workspace root."""
    (tmp_path / "subdir").mkdir()
    (tmp_path / "subdir" / "file.txt").write_text("hello\nworld")
    (tmp_path / "foo.py").write_text("print(1 + 1)\n")
    return str(tmp_path)


@pytest.fixture
def project_skills_dir():
    """Path to project's skills directory."""
    root = Path(__file__).resolve().parent.parent
    return str(root / "skills")


class MockEngine(AgentEngine):
    """Engine that returns a fixed response (no LLM). Used for API tests."""
    name = "Mock"
    supports_models = ["openai"]

    async def run(self, message, history, workspace_path, skills, model=None):
        return EngineResponse(
            text=f"Echo: {message}",
            code_blocks=[{"language": "python", "code": "# mock"}],
            files_changed=[],
        )


