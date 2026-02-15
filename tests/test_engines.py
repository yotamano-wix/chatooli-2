"""Tests for backend.engines (base, registry)."""
import pytest

from backend.engines.base import AgentEngine, EngineResponse, Skill


def test_engine_response_dataclass():
    r = EngineResponse(text="hi", code_blocks=[], files_changed=["a.txt"])
    assert r.text == "hi"
    assert r.code_blocks == []
    assert r.files_changed == ["a.txt"]


def test_skill_dataclass():
    s = Skill(name="Test", description="Desc", path="x/SKILL.md")
    assert s.name == "Test"
    assert s.content is None


def test_registry_list_engines():
    from backend.engines import registry
    # Clear so we can register mock without affecting other tests
    engines = registry.list_engines()
    assert isinstance(engines, list)
    assert len(engines) >= 1
    for e in engines:
        assert "id" in e
        assert "name" in e
        assert "supports_models" in e


def test_registry_get_engine():
    from backend.engines import registry
    # Use an engine that was registered (e.g. crewai, openai, langgraph, claude, openhands)
    engines = registry.list_engines()
    if not engines:
        pytest.skip("no engines registered")
    eid = engines[0]["id"]
    engine = registry.get_engine(eid)
    assert isinstance(engine, AgentEngine)
    assert engine.name


def test_registry_unknown_engine():
    from backend.engines import registry
    with pytest.raises(ValueError, match="Unknown engine"):
        registry.get_engine("nonexistent_engine_xyz")
