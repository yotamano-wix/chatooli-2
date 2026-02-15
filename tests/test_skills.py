"""Tests for backend.skills.loader."""
import pytest

from backend.engines.base import Skill
from backend.skills.loader import (
    load_skills_metadata,
    load_skill_content,
    get_skills_context,
    _parse_frontmatter,
)


def test_parse_frontmatter():
    text = """---
name: Test
description: A test skill
---
Body here"""
    meta, body = _parse_frontmatter(text)
    assert meta.get("name") == "Test"
    assert meta.get("description") == "A test skill"
    assert "Body here" in body


def test_parse_frontmatter_no_fence():
    text = "No frontmatter"
    meta, body = _parse_frontmatter(text)
    assert meta == {}
    assert body == "No frontmatter"


def test_load_skills_metadata(project_skills_dir):
    skills = load_skills_metadata(project_skills_dir)
    assert isinstance(skills, list)
    # We created skills/creative-coding/SKILL.md and skills/svg-and-animation/SKILL.md
    names = [s.name for s in skills]
    assert "Creative Coding" in names or any("creative" in n.lower() for n in names)
    for s in skills:
        assert isinstance(s, Skill)
        assert s.name
        assert s.path


def test_load_skill_content(project_skills_dir):
    skills = load_skills_metadata(project_skills_dir)
    if not skills:
        pytest.skip("no skills dir or no SKILL.md files")
    content = load_skill_content(skills[0], project_skills_dir)
    assert isinstance(content, str)
    assert len(content) > 0


def test_get_skills_context(project_skills_dir):
    skills = load_skills_metadata(project_skills_dir)
    ctx = get_skills_context(skills, project_skills_dir, max_tokens_approx=500)
    assert isinstance(ctx, str)
    if skills:
        assert "Skill:" in ctx or "skill" in ctx.lower()
