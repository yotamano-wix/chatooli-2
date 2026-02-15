"""Shared utilities used by engines."""


def extract_code_blocks(text: str) -> list[dict]:
    """Extract markdown code blocks from agent output. Returns [{"language": str, "code": str}, ...]."""
    blocks = []
    lines = text.split("\n")
    in_code = False
    current_code = []
    lang = "python"

    for line in lines:
        if line.strip().startswith("```"):
            if in_code:
                blocks.append({"language": lang, "code": "\n".join(current_code)})
                current_code = []
                in_code = False
            else:
                in_code = True
                lang_hint = line.strip().lstrip("`").strip()
                lang = lang_hint if lang_hint else "python"
        elif in_code:
            current_code.append(line)

    if current_code:
        blocks.append({"language": lang, "code": "\n".join(current_code)})
    return blocks
