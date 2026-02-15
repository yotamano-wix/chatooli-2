# Framework Evaluation Results

> Run date: Feb 15, 2026
> Server: localhost:8000, all engines using default models
> Models: CrewAI → GPT (default), OpenAI → GPT 5.2, LangGraph → GPT 5.2, Claude → Claude Sonnet 4.5

---

## Test Matrix: 4 tests × 4 engines = 16 runs

### Test 1: p5.js particle system
> "Create a p5.js sketch with colorful particles that follow the mouse cursor.
> Use a dark background. Output a single self-contained HTML file with p5.js loaded from CDN."

| Engine | Time | Self-contained | CDN | Previewable | Used tools |
|---|---|---|---|---|---|
| **CrewAI** | 44.0s | YES | YES | YES | no |
| **OpenAI** | 38.5s | YES | YES | YES | no |
| **LangGraph** | 19.7s | YES | YES | YES | no |
| **Claude** | 25.2s | no | no | no | no* |

*Claude used the `write_file` tool to save `particle_sketch.html` to workspace instead of returning code blocks in the response. The HTML was correct and high quality — but invisible to the preview iframe.

---

### Test 2: Three.js 3D scene
> "Build a Three.js scene with a rotating icosahedron with wireframe material.
> Add orbit controls. Single self-contained HTML file with Three.js from CDN."

| Engine | Time | Self-contained | CDN | Previewable | Used tools |
|---|---|---|---|---|---|
| **CrewAI** | 20.1s | YES | YES | YES | no |
| **OpenAI** | 10.3s | YES | YES | YES | no |
| **LangGraph** | 11.0s | YES | YES | YES | no |
| **Claude** | 19.2s | no | no | no | no* |

*Same behavior — Claude wrote to workspace file, didn't return code blocks.

---

### Test 3: GLSL fragment shader
> "Create a fullscreen GLSL fragment shader that renders animated plasma waves.
> Use raw WebGL (no libraries). Single self-contained HTML file."

| Engine | Time | Self-contained | CDN | Previewable | Used tools |
|---|---|---|---|---|---|
| **CrewAI** | 58.5s | YES | n/a | YES | no |
| **OpenAI** | 46.2s | YES | n/a | YES | no |
| **LangGraph** | 19.3s | YES | n/a | YES | no |
| **Claude** | 38.3s | no | no | no | no* |

*Same — Claude wrote to file.

---

### Test 5: SVG text-on-path animation
> "Create an SVG animation with text following a curved path.
> The text should orbit in a loop. Dark background, light text. Single HTML file."

| Engine | Time | Self-contained | CDN | Previewable | Used tools |
|---|---|---|---|---|---|
| **CrewAI** | 36.0s | no | no | YES | no |
| **OpenAI** | 52.8s | no | no | YES | no |
| **LangGraph** | 37.6s | no | no | YES | no |
| **Claude** | 28.6s | no | no | no | no* |

Note: SVG test — "self-contained" check looks for `<!DOCTYPE html>` which SVG-only output may not have. "Previewable" means the extractor found an `<svg>` block.

---

## Summary Table

| Engine | Avg time | Self-contained (4 tests) | Previewable (4 tests) | Never used file tools |
|---|---|---|---|---|
| **LangGraph** | **21.9s** | **3/4** | **3/4** | YES |
| **OpenAI** | 36.9s | 3/4 | **4/4** | YES |
| **CrewAI** | 39.6s | 3/4 | **4/4** | YES |
| **Claude** | 27.8s | 0/4 | 0/4 | NO (writes to file) |

---

## Key Findings

### 1. LangGraph is the fastest
LangGraph averaged **21.9s** per test — nearly 2× faster than CrewAI (39.6s). This is likely because the ReAct agent loop resolved quickly without deep tool-calling chains.

### 2. Claude writes to files instead of returning code
Claude consistently used `write_file` to save HTML to the workspace rather than returning it as code blocks in the response. This means:
- The preview iframe gets **nothing** (0/4 previewable)
- The workspace gets a **perfect file** every time
- **Fix**: Update Claude's system prompt to say "Return the full HTML in a markdown code block in your response. Do NOT use write_file."

### 3. None of the engines wasted time on irrelevant tools
Despite having 7 tools available (read, write, edit, list, glob, grep, execute_python), none of the engines called unnecessary tools like `list_files` or `execute_python_code`. They all focused on generating HTML. This suggests the tools aren't causing overhead — agents are smart enough to skip them.

### 4. SVG output format varies
For the SVG test, no engine produced a `<!DOCTYPE html>` wrapper — they returned raw SVG or SVG-in-HTML without the full doctype. The preview extractor caught SVG blocks for 3/4 engines but not Claude (which wrote to file).

---

## Recommendation

### For your use case (designers vibe-coding creative generators):

**Primary: LangGraph** — fastest, multi-model support (can swap GPT ↔ Claude ↔ Gemini via the model dropdown), good code quality, minimal overhead.

**Runner-up: OpenAI Agents SDK** — slightly slower but 4/4 previewable. Locked to OpenAI models only, but GPT 5.2 is strong at creative code.

**Fix Claude**: Claude produces excellent code but saves to files. A system prompt change ("always return code in markdown blocks, don't write to files") should fix this. Once fixed, Claude would be competitive — it was 2nd fastest.

**Deprioritize CrewAI**: Slowest (39.6s avg), designed for multi-agent orchestration you don't need. The Agent→Task→Crew pipeline adds latency without benefit for single-prompt creative generation.

### Next steps
1. Update system prompts for creative coding focus (not "senior developer")
2. Fix Claude's system prompt to return code blocks
3. Add Three.js and GLSL skills
4. Run multi-turn iteration test (Test 4) to check conversation context
5. Test with non-default models (Claude Opus 4.6, Gemini) for code quality comparison
