# Chatooli — Framework Evaluation for Creative Coding

## Product Objective

**Chatooli is a vibe-coding tool for designers.**
Users describe what they want in natural language, and the AI generates
self-contained creative frontend code (p5.js, Three.js, custom GLSL shaders,
SVG animations, Canvas API) that renders live in the Preview iframe.

The core loop is:
1. Designer types a prompt ("make a particle system that follows the mouse")
2. AI generates a single HTML file with inline JS/CSS
3. Preview shows the result immediately
4. Designer iterates ("make the particles glow", "add a color palette")

### What matters

| Priority | Capability |
|---|---|
| **P0** | Quality of generated creative code (p5, Three.js, shaders) |
| **P0** | Single self-contained HTML output → works in iframe preview |
| **P1** | Fast iteration — conversation context preserved across turns |
| **P1** | Follows skill/style instructions (color palettes, resolution, export) |
| **P2** | Multi-model support (GPT, Claude, Gemini for different strengths) |
| **P3** | File read/write/edit tools (nice-to-have, not core for v1) |

### What does NOT matter (for v1)

- Python code execution (sandbox tool)
- Backend/server code generation
- Multi-agent orchestration (planner + coder + reviewer)
- Terminal/shell access
- Git integration

---

## Current Tools & Skills Inventory

### Tools (shared across all engines)

| Tool | Relevant for creative coding? |
|---|---|
| `read_file` | Low — designers don't read existing files |
| `write_file` | Medium — could save generated HTML to workspace |
| `edit_file` | Low — iteration happens via new generations, not string replace |
| `list_files` / `glob_files` / `grep_files` | Low — no existing codebase to search |
| `execute_python_code` | **Not relevant** — output is frontend HTML/JS |

**Verdict**: Most tools are unnecessary for the creative coding use case.
The agent mostly needs to **return code in its response** (which goes to the
preview iframe), not use file tools. `write_file` could optionally save
a snapshot, but the core flow is: generate → preview → iterate.

### Skills (SKILL.md files)

| Skill | Content |
|---|---|
| `creative-coding` | p5.js, Canvas, SVG guidelines; particle systems, noise, export |
| `svg-and-animation` | SVG paths, text-on-path, CSS/JS animation, single-HTML delivery |

**Verdict**: Good foundation, but need to expand for Three.js, GLSL shaders,
and more generator patterns. Skills are injected as system prompt context.

---

## Framework Comparison

### How each engine works today

| Engine | How it calls the LLM | Tool support | Streaming |
|---|---|---|---|
| **CrewAI** | Agent → Task → Crew pipeline | CrewAI `@tool` decorator | No (batch) |
| **OpenAI Agents SDK** | `Agent` + `Runner.run()` | `@function_tool` decorator | No (batch) |
| **LangGraph** | `create_react_agent` with ToolNodes | LangChain `@tool` | No (batch) |
| **Claude (Anthropic)** | Raw Messages API + tool_use loop | JSON schema tools | No (batch) |
| **OpenHands** | External SDK (if installed) | Its own terminal/editor | No (batch) |

### Evaluation criteria for creative coding

| Criterion | What to test | Weight |
|---|---|---|
| **Code quality** | Does generated p5/Three/shader code actually run? Is it creative? | 40% |
| **Instruction following** | Does it produce a single HTML file? Respect skill guidelines? | 20% |
| **Iteration speed** | How fast is the round-trip? Does context carry over? | 15% |
| **Tool overhead** | Does the framework waste time calling tools instead of just returning code? | 10% |
| **Simplicity** | How much framework code wraps the LLM call? Maintenance burden? | 10% |
| **Model flexibility** | Can we easily swap GPT ↔ Claude ↔ Gemini? | 5% |

---

## Test Prompts

Run each prompt through each engine and compare output quality + behavior.

### Test 1: Basic p5.js sketch
> "Create a p5.js sketch with colorful particles that follow the mouse cursor.
> Use a dark background. Output a single HTML file."

**What to check**: Does it output a complete HTML file? Does p5.js load from CDN?
Does it actually work in the preview iframe?

### Test 2: Three.js 3D scene
> "Build a Three.js scene with a rotating icosahedron that has a wireframe
> material. Add orbit controls. Single HTML file with CDN imports."

**What to check**: Three.js CDN import, OrbitControls from importmap/CDN,
proper scene/camera/renderer setup, animation loop.

### Test 3: GLSL fragment shader
> "Create a fullscreen GLSL fragment shader that renders animated plasma
> waves. Use raw WebGL (no libraries). Single HTML file."

**What to check**: WebGL boilerplate, vertex/fragment shader strings,
uniform for time, requestAnimationFrame loop.

### Test 4: Iteration / conversation
> Turn 1: "Make a generative grid of rotating squares using p5.js"
> Turn 2: "Now add a gradient color based on position"
> Turn 3: "Make it respond to mouse position — squares near the cursor rotate faster"

**What to check**: Does the agent maintain context? Does it build on
the previous code or start from scratch each time?

### Test 5: Skill adherence
> "Create an SVG animation with text following a curved path.
> The text should orbit in a loop. Dark background, light text."

**What to check**: Does it follow the `svg-and-animation` skill guidelines?
Single HTML file with inline SVG? `<textPath>` + `startOffset` animation?

---

## Expected Results & Recommendations

### Prediction based on architecture

| Engine | Likely fit | Why |
|---|---|---|
| **CrewAI** | ⚠️ Medium | Multi-agent overhead is unnecessary. Will try to use tools even when it should just return HTML. Slower due to Agent→Task→Crew pipeline. |
| **OpenAI Agents SDK** | ✅ Good | Clean, minimal. But it's built around function-calling — may try to call tools instead of just returning code. Model locked to OpenAI. |
| **LangGraph** | ⚠️ Medium | ReAct agent loop adds overhead. Good multi-model support via LangChain. But overkill for "just generate and return HTML." |
| **Claude (Anthropic)** | ✅ Best fit | Raw Messages API = minimal overhead. Claude excels at creative code. Tool-use loop only triggers if agent decides to use tools. Model locked to Anthropic. |
| **OpenHands** | ❌ Poor | Full dev environment (terminal, browser) — extreme overkill for creative coding generation. |

### Key insight

For creative coding generation, **you may not need an "agentic" framework at all**.
The core loop is:
1. Send user message + system prompt (with skills) to an LLM
2. Get back HTML code
3. Show in preview

A simple **direct API call** (no tools, no agent loop) would be:
- Faster (no tool-calling overhead)
- More reliable (no agent deciding to call `list_files` instead of generating code)
- Simpler to maintain

The file tools are useful as an *optional* escape hatch ("save this to workspace"),
but the main flow doesn't need them.

---

## Recommended Next Steps

1. **Run the 5 test prompts** through each engine and record results
2. **Add a "direct" engine** — a simple LLM call with no tools, just system prompt + skills + user message → response. This will likely be the fastest and most reliable for creative coding.
3. **Update system prompts** — change from "senior developer with file tools" to "creative coding generator that outputs single HTML files"
4. **Expand skills** — add Three.js skill, GLSL/shader skill, generative patterns skill
5. **Improve preview** — ensure iframe handles p5.js, Three.js, WebGL (check CSP, CDN loading)
