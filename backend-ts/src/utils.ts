/**
 * Shared utilities.
 */

export interface CodeBlock {
  language: string;
  code: string;
}

export function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = text.split("\n");
  let inCode = false;
  let currentCode: string[] = [];
  let lang = "python";

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (inCode) {
        blocks.push({ language: lang, code: currentCode.join("\n") });
        currentCode = [];
        inCode = false;
      } else {
        inCode = true;
        const langHint = line.trimStart().replace(/`/g, "").trim();
        lang = langHint || "python";
      }
    } else if (inCode) {
      currentCode.push(line);
    }
  }
  if (currentCode.length > 0) {
    blocks.push({ language: lang, code: currentCode.join("\n") });
  }
  return blocks;
}
