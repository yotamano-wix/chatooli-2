/**
 * Prompt loader — reads prompt markdown files from src/prompts/ and
 * composes them with skill context.
 *
 * Each agent's system prompt lives in its own .md file for easy editing:
 *   - prompts/coding-agent.md  — the main creative coding agent
 *   - prompts/art-director.md  — the Art Director (design brief agent)
 *
 * Skill progressive disclosure is layered on top:
 *   Level 1 (frontmatter index) — always appended to coding agent prompt
 *   Level 2+3 (body + refs)     — injected per-request by mastra-engine.ts
 */

import fsSync from "node:fs";
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
const PROMPTS_DIR = path.resolve(__dirname, "prompts");

// ---------- Prompt file loader ----------

function loadPromptFile(filename: string): string {
  const filePath = path.join(PROMPTS_DIR, filename);
  return fsSync.readFileSync(filePath, "utf-8").trim();
}

// ---------- Caches ----------

let _cachedSkills: Skill[] | null = null;
let _cachedSystemPrompt: string | null = null;
let _cachedArtDirectorPrompt: string | null = null;

/** Load skills from disk (cached after first call). */
async function getSkills(): Promise<Skill[]> {
  if (_cachedSkills) return _cachedSkills;
  const skillsDir = path.resolve(__dirname, "..", "..", "skills");
  _cachedSkills = await loadSkills(skillsDir);
  return _cachedSkills;
}

// ---------- Public API ----------

/**
 * Get the coding agent's system prompt with skill index (Level 1).
 * Loads from prompts/coding-agent.md + appends skill frontmatters.
 */
export async function getSystemPrompt(): Promise<string> {
  if (_cachedSystemPrompt) return _cachedSystemPrompt;

  const basePrompt = loadPromptFile("coding-agent.md");
  const skills = await getSkills();
  const skillsIndex = formatSkillsIndex(skills);

  _cachedSystemPrompt = skillsIndex
    ? `${basePrompt}\n\n${skillsIndex}`
    : basePrompt;

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

/**
 * Get the Art Director's system prompt.
 * Loads from prompts/art-director.md (no skill injection — it doesn't code).
 */
export function getArtDirectorPrompt(): string {
  if (_cachedArtDirectorPrompt) return _cachedArtDirectorPrompt;
  _cachedArtDirectorPrompt = loadPromptFile("art-director.md");
  return _cachedArtDirectorPrompt;
}
