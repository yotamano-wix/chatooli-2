"""
AgentSkills.io compatible loader: discover SKILL.md files, parse YAML frontmatter,
load full content on demand (progressive disclosure).
"""

import re
from pathlib import Path
from dataclasses import dataclass

# Import shared Skill from engines.base for consistency
from backend.engines.base import Skill


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Extract YAML frontmatter from start of content. Returns (metadata dict, rest of content)."""
    if not content.strip().startswith("---"):
        return {}, content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content
    yaml_block = parts[1].strip()
    body = parts[2].strip()
    metadata = {}
    for line in yaml_block.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            key = key.strip().lower()
            value = value.strip().strip("'\"")
            metadata[key] = value
    return metadata, body


def load_skills_metadata(skills_dir: str) -> list[Skill]:
    """
    Level 1: Scan skills_dir for SKILL.md files, parse frontmatter only.
    Returns list of Skill with name, description, path; content is None.
    """
    root = Path(skills_dir)
    if not root.is_dir():
        return []
    skills = []
    for path in root.rglob("SKILL.md"):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except (OSError, UnicodeDecodeError):
            continue
        meta, _ = _parse_frontmatter(text)
        name = meta.get("name", path.parent.name)
        description = meta.get("description", "")
        rel = str(path.relative_to(root))
        skills.append(
            Skill(
                name=name,
                description=description,
                path=rel,
                content=None,
                metadata=meta,
            )
        )
    return skills


def load_skill_content(skill: Skill, skills_dir: str) -> str:
    """
    Level 2: Load full SKILL.md content for a skill.
    Returns the full file content (including frontmatter and body).
    """
    path = Path(skills_dir) / skill.path
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def get_skills_context(skills: list[Skill], skills_dir: str, max_tokens_approx: int = 4000) -> str:
    """
    Build a system context string from skills. Loads full content for each
    until approximate token budget is reached (rough: 4 chars per token).
    """
    parts = []
    budget = max_tokens_approx * 4
    for s in skills:
        content = load_skill_content(s, skills_dir)
        if not content:
            continue
        if len(content) > budget:
            content = content[:budget] + "\n...(truncated)"
        parts.append(f"## Skill: {s.name}\n{content}")
        budget -= len(content)
        if budget <= 0:
            break
    return "\n\n---\n\n".join(parts) if parts else ""
