"""
Shared Python code execution (sandbox). Pure Python — no framework bindings.
Each engine wraps this into its own tool format.
"""

import io
import traceback
from contextlib import redirect_stdout, redirect_stderr


def execute_python_code(code: str) -> str:
    """
    Execute Python code in the current process. Captures stdout/stderr.
    Returns combined output string or error traceback.
    """
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    safe_globals = {"__builtins__": __builtins__, "__name__": "__main__"}

    try:
        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            exec(code, safe_globals)
        out = stdout_capture.getvalue()
        err = stderr_capture.getvalue()
        parts = [f"Output:\n{out}"] if out else []
        if err:
            parts.append(f"Stderr:\n{err}")
        return "\n".join(parts) if parts else "Code executed successfully (no output)."
    except Exception:
        out = stdout_capture.getvalue()
        return (f"Output before error:\n{out}\n" if out else "") + f"Error:\n{traceback.format_exc()}"
