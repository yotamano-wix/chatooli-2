/**
 * System prompt — base instructions + skill index (Level 1).
 *
 * Progressive disclosure:
 *   - System prompt always includes skill frontmatters (Level 1)
 *     so the agent knows what skills are available.
 *   - Matched skill bodies + references (Level 2+3) are injected
 *     per-request by mastra-engine.ts based on the user's message.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSkills,
  formatSkillsIndex,
  matchSkills,
  formatMatchedSkills,
  type Skill,
} from "./skills.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_PROMPT = `You are a creative coding agent for designers. You help build generative art, \
interactive visuals, and creative web experiences using p5.js, Three.js, GLSL shaders, \
SVG animations, Canvas API, and other frontend creative libraries.

YOU ARE A CODING AGENT. You work through tool calls — reading, writing, and editing files \
in the workspace. The workspace is the source of truth for all code.

## How you work

### Creating new code
1. Use \`write_file\` to save your code to the workspace (e.g. \`write_file("sketch.html", code)\`).
2. The preview iframe automatically loads HTML files from the workspace.
3. For multi-file projects, use \`write_file\` for each file (HTML, JS, CSS, GLSL, etc.).
4. HTML files can reference other workspace files with relative paths: \`<script src="sketch.js">\`.

### Modifying existing code
1. FIRST use \`list_files\` to see what's in the workspace.
2. Use \`read_file\` to read the current code you need to change.
3. Use \`edit_file\` for small targeted changes (find-and-replace).
4. Use \`write_file\` to rewrite a file entirely when changes are large.
5. NEVER guess what the code looks like — always read it first.

### Response format
- Keep your text response SHORT — just explain what you did or what changed.
- The code lives in workspace files, not in your chat response.
- You may include small code snippets in your response to highlight what changed, \
but the full code must be in the workspace via write_file/edit_file.

## Creative coding defaults
- Dark backgrounds (e.g. #0a0a0a, #1a1a2e) for visual contrast.
- Make visuals interactive (mouse, touch, keyboard) when possible.
- Use CDN imports for libraries (p5.js, Three.js, etc.).
- Self-contained HTML files — inline CSS/JS or relative imports.
- Responsive: handle window resize.
`;

let _cachedSkills: Skill[] | null = null;
let _cachedSystemPrompt: string | null = null;

/** Load skills from disk (cached after first call). */
async function getSkills(): Promise<Skill[]> {
  if (_cachedSkills) return _cachedSkills;
  const skillsDir = path.resolve(__dirname, "..", "..", "skills");
  _cachedSkills = await loadSkills(skillsDir);
  return _cachedSkills;
}

/**
 * Get the base system prompt with skill index (Level 1).
 * Always includes skill frontmatters so the agent knows what's available.
 */
export async function getSystemPrompt(): Promise<string> {
  if (_cachedSystemPrompt) return _cachedSystemPrompt;

  const skills = await getSkills();
  const skillsIndex = formatSkillsIndex(skills);

  _cachedSystemPrompt = skillsIndex
    ? `${BASE_PROMPT}\n${skillsIndex}`
    : BASE_PROMPT;

  return _cachedSystemPrompt;
}

/**
 * Get matched skills for a specific user message (Level 2+3).
 * Returns both the skill names (for UI display) and formatted context (for injection).
 */
export async function getMatchedSkills(
  userMessage: string
): Promise<{ names: string[]; context: string }> {
  const skills = await getSkills();
  const matched = matchSkills(skills, userMessage);
  return {
    names: matched.map((s) => s.name),
    context: formatMatchedSkills(matched),
  };
}
