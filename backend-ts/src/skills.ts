/**
 * Skill loader — reads SKILL.md files from the skills/ directory.
 *
 * Implements the Anthropic Agent Skills progressive disclosure model:
 *   Level 1 (frontmatter): name + description — always in system prompt.
 *   Level 2 (body): full instructions — injected when skill matches user request.
 *   Level 3 (references): linked files in references/ — bundled with matching skill.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface Skill {
  name: string;
  description: string;
  body: string;
  references: { name: string; content: string }[];
  /** Keywords extracted from description for matching user messages. */
  keywords: string[];
}

/** Parse a SKILL.md file into frontmatter fields + body. */
function parseSkillMd(raw: string): Omit<Skill, "references"> {
  const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = raw.match(fmRegex);
  if (!match) {
    return { name: "unknown", description: "", body: raw.trim(), keywords: [] };
  }

  const frontmatter = match[1];
  const body = match[2].trim();

  let name = "unknown";
  let description = "";

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  if (nameMatch) name = nameMatch[1].trim();

  const descBlock = frontmatter.match(/^description:\s*>?\s*\n((?:\s{2,}.+\n?)*)/m);
  if (descBlock) {
    description = descBlock[1].replace(/^\s{2,}/gm, "").trim().replace(/\n/g, " ");
  } else {
    const descLine = frontmatter.match(/^description:\s*(.+)$/m);
    if (descLine) description = descLine[1].trim();
  }

  const keywords = extractKeywords(description);

  return { name, description, body, keywords };
}

/**
 * Stem a word by removing common English suffixes.
 * Simple but effective for matching creative-coding terms.
 */
function stem(word: string): string {
  return word
    .replace(/ations$/, "at")
    .replace(/tion$/, "t")
    .replace(/sions$/, "s")
    .replace(/ings$/, "")
    .replace(/ing$/, "")
    .replace(/ies$/, "y")
    .replace(/ves$/, "f")
    .replace(/es$/, "")
    .replace(/s$/, "");
}

/**
 * Extract meaningful keywords from a skill description for message matching.
 * Filters out common stop words, stems words, and keeps domain-specific terms.
 */
function extractKeywords(description: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "is", "it",
    "use", "when", "user", "asks", "do", "not", "with", "that", "this", "from",
    "also", "any", "as", "be", "by", "can", "has", "have", "its", "may", "are",
    "generate", "create", "make", "build", "web", "using", "code",
  ]);

  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .filter((v, i, a) => a.indexOf(v) === i);

  // Return both the original and stemmed forms for broader matching
  const all = new Set<string>();
  for (const w of words) {
    all.add(w);
    const stemmed = stem(w);
    if (stemmed.length > 2) all.add(stemmed);
  }
  return Array.from(all);
}

/** Load references/ directory for a skill. */
async function loadReferences(skillDir: string): Promise<{ name: string; content: string }[]> {
  const refsDir = path.join(skillDir, "references");
  const refs: { name: string; content: string }[] = [];

  try {
    const entries = await fs.readdir(refsDir);
    for (const entry of entries) {
      const full = path.join(refsDir, entry);
      try {
        const stat = await fs.stat(full);
        if (stat.isFile() && entry.endsWith(".md")) {
          const content = await fs.readFile(full, "utf-8");
          refs.push({ name: entry, content: content.trim() });
        }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* no references/ directory — fine */ }

  return refs;
}

/** Load all SKILL.md files from a skills directory. */
export async function loadSkills(skillsDir: string): Promise<Skill[]> {
  const skills: Skill[] = [];

  let entries: string[];
  try {
    entries = await fs.readdir(skillsDir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const skillDir = path.join(skillsDir, entry);
    const skillFile = path.join(skillDir, "SKILL.md");
    try {
      const raw = await fs.readFile(skillFile, "utf-8");
      const parsed = parseSkillMd(raw);
      const references = await loadReferences(skillDir);
      skills.push({ ...parsed, references });
    } catch {
      // No SKILL.md in this directory — skip
    }
  }

  return skills;
}

/**
 * Level 1 — Format skill frontmatters for the system prompt.
 * Always included so the agent knows what skills are available.
 */
export function formatSkillsIndex(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const entries = skills.map(
    (s) => `- **${s.name}**: ${s.description}`
  );

  return [
    "## Available Skills",
    "",
    "You have specialized creative-coding skills. When the user's request matches",
    "a skill description below, follow that skill's patterns, examples, and quality checklist.",
    "The relevant skill instructions will be provided in your context automatically.",
    "",
    ...entries,
  ].join("\n");
}

/**
 * Level 2+3 — Match user message to skills and return their full bodies + references.
 * Uses keyword matching with stemming for robust matching.
 * A skill matches if the user message contains at least 1 domain-specific keyword.
 */
export function matchSkills(skills: Skill[], userMessage: string): Skill[] {
  const msg = userMessage.toLowerCase();
  // Build a set of stemmed words from the user message for O(1) lookup
  const msgWords = new Set(
    msg.replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .flatMap((w) => [w, stem(w)])
  );

  return skills.filter((skill) => {
    let hits = 0;
    for (const kw of skill.keywords) {
      // Check both: keyword appears in message string, or keyword is in message word set
      if (msg.includes(kw) || msgWords.has(kw)) {
        hits++;
        if (hits >= 1) return true;
      }
    }
    return false;
  });
}

/**
 * Format matched skills into an injection block for the agent context.
 * Includes full body (Level 2) and reference content (Level 3).
 */
export function formatMatchedSkills(matched: Skill[]): string {
  if (matched.length === 0) return "";

  const sections = matched.map((s) => {
    let section = `### Skill: ${s.name}\n\n${s.body}`;

    if (s.references.length > 0) {
      const refBlocks = s.references.map(
        (r) => `#### Reference: ${r.name}\n\n${r.content}`
      );
      section += "\n\n" + refBlocks.join("\n\n");
    }

    return section;
  });

  return [
    "## Active Skill Instructions",
    "",
    "The following skill instructions are loaded based on your current task.",
    "Follow these patterns, quality checklists, and troubleshooting guidance.",
    "",
    ...sections,
  ].join("\n");
}
