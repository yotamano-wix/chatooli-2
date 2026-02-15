"""
Framework evaluation: run the same creative-coding prompts through each engine
and record quality metrics.

Usage:
    cd /Users/yotamm/chatooli-2
    source .venv/bin/activate
    python tests/test_framework_eval.py
"""

import json
import time
import requests
import re
import sys

API = "http://localhost:8000"

# ── Test prompts ──────────────────────────────────────────────────────────
TESTS = [
    {
        "id": "p5_particles",
        "name": "Test 1: p5.js particle system",
        "prompt": (
            "Create a p5.js sketch with colorful particles that follow the mouse cursor. "
            "Use a dark background. Output a single self-contained HTML file with p5.js loaded from CDN."
        ),
    },
    {
        "id": "threejs_scene",
        "name": "Test 2: Three.js 3D scene",
        "prompt": (
            "Build a Three.js scene with a rotating icosahedron that has a wireframe material. "
            "Add orbit controls. Output a single self-contained HTML file with Three.js loaded from CDN."
        ),
    },
    {
        "id": "glsl_shader",
        "name": "Test 3: GLSL fragment shader",
        "prompt": (
            "Create a fullscreen GLSL fragment shader that renders animated plasma waves. "
            "Use raw WebGL (no libraries). Output a single self-contained HTML file."
        ),
    },
    {
        "id": "svg_animation",
        "name": "Test 5: SVG text-on-path animation",
        "prompt": (
            "Create an SVG animation with text following a curved path. "
            "The text should orbit in a loop. Dark background, light text. "
            "Output a single self-contained HTML file."
        ),
    },
]


def check_html_quality(response_text: str, code_blocks: list) -> dict:
    """Analyze the response for creative-coding quality signals."""
    metrics = {
        "has_code_blocks": len(code_blocks) > 0,
        "num_code_blocks": len(code_blocks),
        "has_html_block": False,
        "has_doctype": False,
        "has_script_tag": False,
        "has_cdn_import": False,
        "is_self_contained": False,
        "response_length": len(response_text),
        "used_tools": False,  # Did the agent waste time calling file tools?
    }

    all_code = response_text
    for block in code_blocks:
        code = block.get("code", "")
        lang = block.get("language", "").lower()
        if lang in ("html", "htm") or "<!DOCTYPE" in code or "<html" in code:
            metrics["has_html_block"] = True
        all_code += "\n" + code

    metrics["has_doctype"] = "<!DOCTYPE html" in all_code or "<!doctype html" in all_code.lower()
    metrics["has_script_tag"] = "<script" in all_code
    metrics["has_cdn_import"] = any(
        cdn in all_code
        for cdn in ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com", "p5js.org", "threejs.org", "three.js"]
    )
    metrics["is_self_contained"] = metrics["has_doctype"] and metrics["has_script_tag"]

    # Check if agent wasted time on file tools (look for tool-use signals)
    tool_signals = ["read_file", "write_file", "list_files", "glob_files", "execute_python_code"]
    metrics["used_tools"] = any(sig in response_text.lower() for sig in tool_signals)

    return metrics


def extract_html_from_response(response_text: str, code_blocks: list) -> str | None:
    """Try to pull out the full HTML for preview testing."""
    for block in code_blocks:
        code = block.get("code", "")
        if "<!DOCTYPE html" in code or "<html" in code:
            return code
    # Try raw response
    match = re.search(r"(<!DOCTYPE html[\s\S]*?</html>)", response_text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def run_test(test: dict, engine: str, model: str | None = None) -> dict:
    """Run a single test against one engine. Returns result dict."""
    payload = {
        "message": test["prompt"],
        "engine": engine,
        "session_id": f"eval-{engine}-{test['id']}",
    }
    if model:
        payload["model"] = model

    print(f"  [{engine}] Sending prompt...", end="", flush=True)
    start = time.time()

    try:
        resp = requests.post(f"{API}/api/chat", json=payload, timeout=120)
        elapsed = time.time() - start
        data = resp.json()

        response_text = data.get("response", "")
        code_blocks = data.get("code_blocks", [])
        error = None
        if resp.status_code != 200:
            error = f"HTTP {resp.status_code}"
        elif response_text.startswith("Error:"):
            error = response_text[:200]

        metrics = check_html_quality(response_text, code_blocks)
        html = extract_html_from_response(response_text, code_blocks)

        print(f" {elapsed:.1f}s", end="")
        if error:
            print(f" ERROR: {error[:80]}")
        else:
            sc = metrics["is_self_contained"]
            cdn = metrics["has_cdn_import"]
            tools = metrics["used_tools"]
            print(f" | self-contained={sc} cdn={cdn} tools-used={tools}")

        return {
            "test_id": test["id"],
            "test_name": test["name"],
            "engine": engine,
            "model": model,
            "elapsed_seconds": round(elapsed, 2),
            "error": error,
            "metrics": metrics,
            "has_previewable_html": html is not None,
            "html_preview": html[:500] if html else None,  # first 500 chars for inspection
            "response_snippet": response_text[:300],
        }

    except requests.Timeout:
        elapsed = time.time() - start
        print(f" {elapsed:.1f}s TIMEOUT")
        return {
            "test_id": test["id"],
            "test_name": test["name"],
            "engine": engine,
            "model": model,
            "elapsed_seconds": round(elapsed, 2),
            "error": "TIMEOUT (120s)",
            "metrics": {},
            "has_previewable_html": False,
            "html_preview": None,
            "response_snippet": "",
        }
    except Exception as e:
        elapsed = time.time() - start
        print(f" {elapsed:.1f}s EXCEPTION: {e}")
        return {
            "test_id": test["id"],
            "test_name": test["name"],
            "engine": engine,
            "model": model,
            "elapsed_seconds": round(elapsed, 2),
            "error": str(e),
            "metrics": {},
            "has_previewable_html": False,
            "html_preview": None,
            "response_snippet": "",
        }


def print_summary(results: list):
    """Print a comparison table."""
    print("\n" + "=" * 80)
    print("FRAMEWORK EVALUATION RESULTS")
    print("=" * 80)

    # Group by test
    tests_seen = {}
    for r in results:
        tests_seen.setdefault(r["test_id"], []).append(r)

    for test_id, test_results in tests_seen.items():
        print(f"\n── {test_results[0]['test_name']} ──")
        print(f"{'Engine':<20} {'Time':>6} {'Self-cont':>10} {'CDN':>5} {'Preview':>8} {'Tools':>6} {'Error'}")
        print("-" * 80)
        for r in test_results:
            m = r.get("metrics", {})
            print(
                f"{r['engine']:<20} "
                f"{r['elapsed_seconds']:>5.1f}s "
                f"{'YES' if m.get('is_self_contained') else 'no':>10} "
                f"{'YES' if m.get('has_cdn_import') else 'no':>5} "
                f"{'YES' if r.get('has_previewable_html') else 'no':>8} "
                f"{'YES' if m.get('used_tools') else 'no':>6} "
                f"{(r.get('error') or '')[:40]}"
            )

    # Overall scores
    print("\n── OVERALL SCORES ──")
    engine_scores = {}
    for r in results:
        eid = r["engine"]
        if eid not in engine_scores:
            engine_scores[eid] = {"total": 0, "errors": 0, "self_contained": 0, "cdn": 0, "preview": 0, "no_tools": 0, "total_time": 0}
        engine_scores[eid]["total"] += 1
        if r.get("error"):
            engine_scores[eid]["errors"] += 1
        m = r.get("metrics", {})
        if m.get("is_self_contained"):
            engine_scores[eid]["self_contained"] += 1
        if m.get("has_cdn_import"):
            engine_scores[eid]["cdn"] += 1
        if r.get("has_previewable_html"):
            engine_scores[eid]["preview"] += 1
        if not m.get("used_tools"):
            engine_scores[eid]["no_tools"] += 1
        engine_scores[eid]["total_time"] += r["elapsed_seconds"]

    print(f"{'Engine':<20} {'Tests':>5} {'Errors':>7} {'Self-cont':>10} {'CDN':>5} {'Preview':>8} {'No-tools':>9} {'Avg time':>9}")
    print("-" * 80)
    for eid, s in sorted(engine_scores.items()):
        n = s["total"]
        print(
            f"{eid:<20} "
            f"{n:>5} "
            f"{s['errors']:>7} "
            f"{s['self_contained']:>10} "
            f"{s['cdn']:>5} "
            f"{s['preview']:>8} "
            f"{s['no_tools']:>9} "
            f"{s['total_time']/n:>8.1f}s"
        )


def main():
    # Check server
    try:
        r = requests.get(f"{API}/api/engines", timeout=5)
        engines_data = r.json()
        available = [e["id"] for e in engines_data]
        print(f"Available engines: {available}")
    except Exception as e:
        print(f"Server not reachable at {API}: {e}")
        sys.exit(1)

    # Which engines and tests to run
    engines_to_test = available  # all available
    tests_to_run = TESTS

    # Allow filtering via CLI
    if len(sys.argv) > 1:
        filter_engines = sys.argv[1].split(",")
        engines_to_test = [e for e in engines_to_test if e in filter_engines]
    if len(sys.argv) > 2:
        filter_tests = sys.argv[2].split(",")
        tests_to_run = [t for t in tests_to_run if t["id"] in filter_tests]

    print(f"Running {len(tests_to_run)} tests x {len(engines_to_test)} engines = {len(tests_to_run) * len(engines_to_test)} API calls")
    print(f"Engines: {engines_to_test}")
    print(f"Tests: {[t['id'] for t in tests_to_run]}")
    print()

    results = []

    for test in tests_to_run:
        print(f"\n{'='*60}")
        print(f"  {test['name']}")
        print(f"{'='*60}")
        for engine in engines_to_test:
            result = run_test(test, engine)
            results.append(result)

    # Save raw results
    with open("docs/eval_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nRaw results saved to docs/eval_results.json")

    print_summary(results)


if __name__ == "__main__":
    main()
