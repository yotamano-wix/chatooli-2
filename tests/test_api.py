"""Tests for FastAPI app (no UI, no real LLM)."""
import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.engines.registry import register
from tests.conftest import MockEngine

# Ensure mock engine is available for tests
try:
    register("mock", MockEngine)
except Exception:
    pass

client = TestClient(app)


def test_get_index():
    r = client.get("/")
    assert r.status_code == 200
    assert "Chatooli" in r.text


def test_get_engines():
    r = client.get("/api/engines")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    ids = [e["id"] for e in data]
    assert "mock" in ids or "crewai" in ids or "openai" in ids


def test_get_workspace_entries():
    r = client.get("/api/workspace/entries", params={"path": "."})
    assert r.status_code == 200
    data = r.json()
    assert "path" in data
    assert "entries" in data
    assert isinstance(data["entries"], list)


def test_post_chat_requires_message():
    r = client.post("/api/chat", json={})
    assert r.status_code == 422  # validation error


def test_post_chat_with_engine():
    # Use mock engine so we don't call any LLM
    r = client.post(
        "/api/chat",
        json={
            "message": "hello",
            "engine": "mock",
        },
    )
    if r.status_code == 500:
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if "Unknown engine" in str(body.get("response", body)):
            pytest.skip("mock engine not registered")
    assert r.status_code == 200, (r.status_code, r.text)
    data = r.json()
    assert "session_id" in data
    assert "response" in data
    assert "code_blocks" in data
    # Mock engine returns "Echo: hello"
    assert "hello" in data["response"] or "Echo" in data["response"]


def test_sessions_clear():
    r = client.post("/api/chat", json={"message": "hi", "engine": "mock"})
    if r.status_code != 200:
        pytest.skip("mock engine not available")
    sid = r.json()["session_id"]
    r2 = client.delete(f"/api/sessions/{sid}")
    assert r2.status_code == 200
    r3 = client.get(f"/api/sessions/{sid}")
    assert r3.json()["history"] == []
