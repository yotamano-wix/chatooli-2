"""Tests for backend.utils."""
import pytest

from backend.utils import extract_code_blocks


def test_extract_code_blocks_empty():
    assert extract_code_blocks("") == []
    assert extract_code_blocks("no code here") == []


def test_extract_code_blocks_single():
    text = """Some text
```python
x = 1
print(x)
```
more text"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 1
    assert blocks[0]["language"] == "python"
    assert blocks[0]["code"] == "x = 1\nprint(x)"


def test_extract_code_blocks_multiple():
    text = """```js
const a = 1;
```
```python
def f(): pass
```"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 2
    assert blocks[0]["language"] == "js"
    assert "const a = 1" in blocks[0]["code"]
    assert blocks[1]["language"] == "python"
    assert "def f(): pass" in blocks[1]["code"]


def test_extract_code_blocks_default_lang():
    text = """```
plain
```"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 1
    assert blocks[0]["language"] == "python"  # default
    assert blocks[0]["code"] == "plain"


def test_extract_code_blocks_unclosed():
    text = """```py
x = 1
"""
    blocks = extract_code_blocks(text)
    assert len(blocks) == 1
    assert blocks[0]["language"] == "py"
    assert blocks[0]["code"].strip() == "x = 1"
