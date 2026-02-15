"""
Engine discovery and selection. Registers all available framework adapters.
"""

from backend.engines.base import AgentEngine


# Populated by engine modules; avoid circular import by lazy register
_engines: dict[str, type[AgentEngine]] = {}
_instances: dict[str, AgentEngine] = {}


def register(engine_id: str, engine_class: type[AgentEngine]) -> None:
    _engines[engine_id] = engine_class


def get_engine(engine_id: str, **kwargs) -> AgentEngine:
    """Get or create an engine instance by id."""
    if engine_id not in _engines:
        raise ValueError(f"Unknown engine: {engine_id}. Available: {list(_engines.keys())}")
    # Cache one instance per engine_id (kwargs could be workspace_path etc. later)
    if engine_id not in _instances:
        _instances[engine_id] = _engines[engine_id](**kwargs)
    return _instances[engine_id]


def list_engines() -> list[dict]:
    """Return list of {id, name, supports_models} for each registered engine."""
    result = []
    for eid, cls in _engines.items():
        # Instantiate temporarily to read name and supports_models
        try:
            inst = cls()
            result.append({
                "id": eid,
                "name": inst.name,
                "supports_models": getattr(inst, "supports_models", []),
            })
        except Exception:
            result.append({
                "id": eid,
                "name": getattr(cls, "name", eid),
                "supports_models": getattr(cls, "supports_models", []),
            })
    return result


def clear_instances() -> None:
    """Clear cached engine instances (e.g. when config changes)."""
    _instances.clear()
