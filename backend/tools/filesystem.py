"""
Shared filesystem tools. All paths are relative to a workspace root.
Pure Python — no framework bindings. Each engine wraps these into its tool format.
"""

import os
import re
from pathlib import Path


def _resolve(path: str, root: str) -> Path:
    """Resolve path relative to workspace root; forbid escape."""
    root = Path(root).resolve()
    full = (root / path).resolve()
    if not str(full).startswith(str(root)):
        raise PermissionError(f"Path escapes workspace: {path}")
    return full


def read_file(path: str, root: str) -> str:
    """
    Read file contents. path is relative to root.
    Returns content with line numbers in a header comment for reference.
    """
    p = _resolve(path, root)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    text = p.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    numbered = "\n".join(f"{i+1:4d} | {line}" for i, line in enumerate(lines))
    return f"--- {path} ---\n{numbered}"


def write_file(path: str, content: str, root: str) -> str:
    """
    Write content to file. path is relative to root. Creates parent dirs if needed.
    Returns confirmation message.
    """
    p = _resolve(path, root)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return f"Wrote {path} ({len(content)} bytes)"


def edit_file(path: str, old_string: str, new_string: str, root: str) -> str:
    """
    Replace first occurrence of old_string with new_string in file.
    path is relative to root.
    Returns confirmation or error.
    """
    p = _resolve(path, root)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    text = p.read_text(encoding="utf-8")
    if old_string not in text:
        raise ValueError(f"old_string not found in {path}")
    new_text = text.replace(old_string, new_string, 1)
    p.write_text(new_text, encoding="utf-8")
    return f"Edited {path}: 1 replacement"


def list_files(path: str, root: str, recursive: bool = False) -> str:
    """
    List files and directories at path (relative to root).
    If recursive=True, list all descendants. Returns a tree-like string.
    """
    p = _resolve(path, root)
    if not p.exists():
        raise FileNotFoundError(f"Path not found: {path}")
    if not p.is_dir():
        return f"{path} (file)"

    lines = []

    def _walk(d: Path, prefix: str) -> None:
        try:
            entries = sorted(d.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
        except PermissionError:
            lines.append(f"{prefix}(permission denied)")
            return
        for i, e in enumerate(entries):
            is_last = i == len(entries) - 1
            branch = "└── " if is_last else "├── "
            name = e.name + ("/" if e.is_dir() else "")
            lines.append(f"{prefix}{branch}{name}")
            if recursive and e.is_dir():
                ext = "    " if is_last else "│   "
                _walk(e, prefix + ext)

    lines.append(path + "/")
    if recursive:
        _walk(p, "")
    else:
        try:
            for e in sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
                lines.append("├── " + e.name + ("/" if e.is_dir() else ""))
        except PermissionError:
            lines.append("(permission denied)")

    return "\n".join(lines)


def glob_files(pattern: str, root: str) -> str:
    """
    Find files matching glob pattern relative to root.
    pattern is e.g. "**/*.py" or "src/*.ts".
    Returns newline-separated list of relative paths.
    """
    root_p = Path(root).resolve()
    matches = sorted(root_p.glob(pattern))
    rel = [str(m.relative_to(root_p)) for m in matches if m.is_file()]
    return "\n".join(rel) if rel else "(no matches)"


def grep_files(pattern: str, root: str, glob_pattern: str = "**/*", max_matches: int = 100) -> str:
    """
    Search file contents for regex pattern. Optional glob to limit files.
    Returns "path:line_no: line" for each match, up to max_matches.
    """
    root_p = Path(root).resolve()
    try:
        re.compile(pattern)
    except re.error:
        raise ValueError(f"Invalid regex: {pattern}")
    results = []
    for f in sorted(root_p.glob(glob_pattern)):
        if not f.is_file() or not f.exists():
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except (OSError, UnicodeDecodeError):
            continue
        rel = str(f.relative_to(root_p))
        for i, line in enumerate(text.splitlines(), 1):
            if re.search(pattern, line):
                results.append(f"{rel}:{i}: {line.strip()}")
                if len(results) >= max_matches:
                    return "\n".join(results)
    return "\n".join(results) if results else "(no matches)"
