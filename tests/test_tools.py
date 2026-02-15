"""Tests for backend.tools (filesystem, sandbox)."""
import pytest

from backend.tools import filesystem
from backend.tools.sandbox import execute_python_code


class TestFilesystem:
    def test_write_read(self, temp_workspace):
        root = temp_workspace
        filesystem.write_file("new.txt", "content", root)
        out = filesystem.read_file("new.txt", root)
        assert "new.txt" in out
        assert "content" in out
        assert "1 " in out  # line numbers

    def test_edit_file(self, temp_workspace):
        root = temp_workspace
        filesystem.write_file("edit.txt", "hello world", root)
        filesystem.edit_file("edit.txt", "world", "earth", root)
        out = filesystem.read_file("edit.txt", root)
        assert "hello earth" in out

    def test_list_files(self, temp_workspace):
        root = temp_workspace
        out = filesystem.list_files(".", root, recursive=False)
        assert "foo.py" in out or "├──" in out
        assert "subdir" in out

    def test_list_files_recursive(self, temp_workspace):
        root = temp_workspace
        out = filesystem.list_files(".", root, recursive=True)
        assert "file.txt" in out
        assert "foo.py" in out

    def test_glob_files(self, temp_workspace):
        root = temp_workspace
        out = filesystem.glob_files("**/*.py", root)
        assert "foo.py" in out

    def test_grep_files(self, temp_workspace):
        root = temp_workspace
        out = filesystem.grep_files("hello", root)
        assert "file.txt" in out or "hello" in out

    def test_path_escape_forbidden(self, temp_workspace):
        root = temp_workspace
        with pytest.raises(PermissionError):
            filesystem.read_file("../../../etc/passwd", root)

    def test_read_nonexistent(self, temp_workspace):
        with pytest.raises(FileNotFoundError):
            filesystem.read_file("nonexistent.txt", temp_workspace)


class TestSandbox:
    def test_execute_python_simple(self):
        out = execute_python_code("print(2 + 2)")
        assert "4" in out

    def test_execute_python_error(self):
        out = execute_python_code("1/0")
        assert "Error" in out
        assert "ZeroDivisionError" in out

    def test_execute_python_no_output(self):
        out = execute_python_code("x = 1")
        assert "successfully" in out.lower() or "no output" in out.lower()
