"""
Multi-turn iteration evaluation: test conversation continuity across all engines and models.

Each test runs 3 turns of conversation, checking:
- Does the agent return full HTML each turn?
- Does it build on the previous code (not start from scratch)?
- How fast is each turn?
- How much does the code grow?

Usage:
    python tests/test_iteration_eval.py                     # all engines, default model
    python tests/test_iteration_eval.py claude               # one engine
    python tests/test_iteration_eval.py claude,langgraph     # specific engines
"""

import json
import re
import sys
import time
import requests

API = "http://localhost:8000"

# 3-turn creative coding conversation
TURNS = [
    "Create a Three.js scene with a rotating icosahedron. Wireframe material, dark background. Single HTML file.",
    "Now add a second smaller torus knot orbiting around the icosahedron. Make it a different color.",
    "Add an UnrealBloomPass post-processing glow effect to the whole scene. Make it subtle but visible.",
]

# Engines × models to test
ENGINE_MODELS = [
    ("claude", None, "Claude + Sonnet 4.5 (default)"),
    ("claude", "claude-opus-4-6", "Claude + Opus 4.6"),
    ("langgraph", None, "LangGraph + GPT 5.2 (default)"),
    ("langgraph", "claude-sonnet-4-5", "LangGraph + Sonnet 4.5"),
    ("openai", None, "OpenAI SDK + GPT 5.2 (default)"),
    ("crewai", None, "CrewAI + GPT (default)"),
]


def extract_html(response_text: str, code_blocks: list) -> str | None:
    """Pull out the HTML from code blocks or response."""
    for block in code_blocks:
        code = block.get("code", "")
        if "<!DOCTYPE" in code or "<html" in code:
            return code
    match = re.search(r"(<!DOCTYPE html[\s\S]*?</html>)", response_text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def count_overlap(html1: str, html2: str) -> float:
    """What % of lines from html1 appear in html2."""
    lines1 = [l.strip() for l in html1.split("\n") if l.strip()]
    lines2_set = set(l.strip() for l in html2.split("\n") if l.strip())
    if not lines1:
        return 0.0
    common = sum(1 for l in lines1 if l in lines2_set)
    return common / len(lines1)


def check_builds_on_prev(turn_idx: int, code_blocks: list) -> bool:
    """Check if the code includes expected features from the prompt."""
    all_code = " ".join(b.get("code", "") for b in code_blocks).lower()
    if turn_idx == 1:
        # Should have both icosahedron AND torus
        return "torusknot" in all_code or "torus" in all_code
    if turn_idx == 2:
        # Should have bloom
        return "bloom" in all_code or "unrealbloom" in all_code
    return True


def run_iteration_test(engine: str, model: str | None, label: str) -> dict:
    """Run a 3-turn conversation and record results per turn."""
    session_id = f"iter-{engine}-{model or 'default'}-{int(time.time())}"
    turns_data = []
    prev_html = None

    print(f"\n{'='*70}")
    print(f"  {label}")
    print(f"  engine={engine}, model={model or '(default)'}")
    print(f"{'='*70}")

    for i, prompt in enumerate(TURNS):
        print(f"\n  Turn {i+1}: {prompt[:70]}...")

        payload = {
            "message": prompt,
            "engine": engine,
            "session_id": session_id,
        }
        if model:
            payload["model"] = model

        start = time.time()
        try:
            resp = requests.post(f"{API}/api/chat", json=payload, timeout=180)
            elapsed = time.time() - start
            data = resp.json()
        except requests.Timeout:
            elapsed = time.time() - start
            print(f"    TIMEOUT after {elapsed:.1f}s")
            turns_data.append({
                "turn": i + 1,
                "elapsed": round(elapsed, 1),
                "error": "TIMEOUT",
            })
            break
        except Exception as e:
            elapsed = time.time() - start
            print(f"    ERROR: {e}")
            turns_data.append({
                "turn": i + 1,
                "elapsed": round(elapsed, 1),
                "error": str(e),
            })
            break

        response_text = data.get("response", "")
        code_blocks = data.get("code_blocks", [])

        if response_text.startswith("Error:"):
            print(f"    ERROR: {response_text[:120]}")
            turns_data.append({
                "turn": i + 1,
                "elapsed": round(elapsed, 1),
                "error": response_text[:200],
            })
            break

        html = extract_html(response_text, code_blocks)
        has_html = html is not None
        html_lines = len(html.split("\n")) if html else 0
        html_chars = len(html) if html else 0
        builds = check_builds_on_prev(i, code_blocks) if i > 0 else True

        overlap = 0.0
        if prev_html and html:
            overlap = count_overlap(prev_html, html)

        turn_result = {
            "turn": i + 1,
            "elapsed": round(elapsed, 1),
            "has_html": has_html,
            "html_lines": html_lines,
            "html_chars": html_chars,
            "builds_on_prev": builds,
            "overlap_pct": round(overlap * 100),
            "num_code_blocks": len(code_blocks),
            "response_length": len(response_text),
            "error": None,
        }
        turns_data.append(turn_result)

        status = "OK" if has_html else "NO HTML"
        build_str = f"builds={builds}" if i > 0 else ""
        overlap_str = f"overlap={overlap*100:.0f}%" if i > 0 else ""

        print(f"    {elapsed:>5.1f}s | {status} | {html_lines} lines | {build_str} {overlap_str}")

        prev_html = html

    return {
        "engine": engine,
        "model": model,
        "label": label,
        "session_id": session_id,
        "turns": turns_data,
    }


def print_summary(results: list):
    """Print comparison table."""
    print("\n" + "=" * 90)
    print("ITERATION EVALUATION RESULTS")
    print("=" * 90)

    header = f"{'Engine + Model':<35} {'T1':>5} {'T2':>5} {'T3':>5} {'Total':>6} {'HTML':>5} {'Build':>6} {'Ovrlp':>6}"
    print(f"\n{header}")
    print("-" * 90)

    for r in results:
        turns = r["turns"]
        t1 = turns[0]["elapsed"] if len(turns) > 0 and not turns[0].get("error") else "ERR"
        t2 = turns[1]["elapsed"] if len(turns) > 1 and not turns[1].get("error") else "ERR"
        t3 = turns[2]["elapsed"] if len(turns) > 2 and not turns[2].get("error") else "ERR"

        total = sum(t["elapsed"] for t in turns if not t.get("error"))
        html_ok = sum(1 for t in turns if t.get("has_html")) 
        build_ok = sum(1 for t in turns if t.get("builds_on_prev"))
        
        overlaps = [t.get("overlap_pct", 0) for t in turns[1:] if not t.get("error")]
        avg_overlap = f"{sum(overlaps) / len(overlaps):.0f}%" if overlaps else "n/a"

        t1_str = f"{t1}s" if isinstance(t1, float) else t1
        t2_str = f"{t2}s" if isinstance(t2, float) else t2
        t3_str = f"{t3}s" if isinstance(t3, float) else t3

        print(
            f"{r['label']:<35} "
            f"{t1_str:>5} {t2_str:>5} {t3_str:>5} "
            f"{total:>5.0f}s "
            f"{html_ok}/3   "
            f"{build_ok}/3   "
            f"{avg_overlap:>5}"
        )

    # Code growth table
    print(f"\n{'Engine + Model':<35} {'T1 lines':>9} {'T2 lines':>9} {'T3 lines':>9} {'Growth':>7}")
    print("-" * 90)
    for r in results:
        turns = r["turns"]
        lines = [str(t.get("html_lines", "ERR")) for t in turns]
        t1_lines = turns[0].get("html_lines", 0) if len(turns) > 0 else 0
        t3_lines = turns[2].get("html_lines", 0) if len(turns) > 2 else 0
        growth = f"{t3_lines/t1_lines:.1f}x" if t1_lines > 0 and t3_lines > 0 else "n/a"
        print(f"{r['label']:<35} {lines[0] if len(lines) > 0 else 'ERR':>9} {lines[1] if len(lines) > 1 else 'ERR':>9} {lines[2] if len(lines) > 2 else 'ERR':>9} {growth:>7}")


def main():
    # Check server
    try:
        r = requests.get(f"{API}/api/engines", timeout=5)
        available = [e["id"] for e in r.json()]
        print(f"Available engines: {available}")
    except Exception as e:
        print(f"Server not reachable: {e}")
        sys.exit(1)

    # Filter engines if specified
    combos = ENGINE_MODELS
    if len(sys.argv) > 1:
        filter_engines = sys.argv[1].split(",")
        combos = [c for c in combos if c[0] in filter_engines]

    print(f"Running {len(combos)} engine/model combos x 3 turns = {len(combos) * 3} API calls")
    print("This may take a few minutes...\n")

    results = []
    for engine, model, label in combos:
        if engine not in available:
            print(f"\nSkipping {label} — engine '{engine}' not available")
            continue
        result = run_iteration_test(engine, model, label)
        results.append(result)

    # Save raw results
    with open("docs/iteration_eval_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nRaw results saved to docs/iteration_eval_results.json")

    print_summary(results)


if __name__ == "__main__":
    main()
