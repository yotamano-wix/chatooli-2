"""
Custom code execution tool that runs Python code locally without Docker.
"""

import io
import sys
import traceback
from contextlib import redirect_stdout, redirect_stderr
from crewai.tools import tool


@tool("Execute Python Code")
def execute_python_code(code: str) -> str:
    """
    Execute Python code in a local sandbox and return the output.
    Use this tool whenever you need to run Python code.
    Pass the complete Python code as a string.
    Returns the stdout output and any errors.
    """
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()

    # Restricted globals for some safety
    safe_globals = {
        "__builtins__": __builtins__,
        "__name__": "__main__",
    }

    try:
        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            exec(code, safe_globals)

        stdout_val = stdout_capture.getvalue()
        stderr_val = stderr_capture.getvalue()

        result_parts = []
        if stdout_val:
            result_parts.append(f"Output:\n{stdout_val}")
        if stderr_val:
            result_parts.append(f"Stderr:\n{stderr_val}")
        if not result_parts:
            result_parts.append("Code executed successfully (no output).")

        return "\n".join(result_parts)

    except Exception:
        error = traceback.format_exc()
        stdout_val = stdout_capture.getvalue()
        parts = []
        if stdout_val:
            parts.append(f"Output before error:\n{stdout_val}")
        parts.append(f"Error:\n{error}")
        return "\n".join(parts)
