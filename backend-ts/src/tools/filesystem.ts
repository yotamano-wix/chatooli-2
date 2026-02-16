/**
 * Filesystem tools. All paths are relative to a workspace root.
 */

import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE_ROOT = process.env.CHATOOLI_WORKSPACE || path.resolve(process.cwd(), "workspace");

function resolvePath(relativePath: string, root: string): string {
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, relativePath);
  if (!full.startsWith(rootResolved)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  return full;
}

export async function readFile(filePath: string, root: string = WORKSPACE_ROOT): Promise<string> {
  const p = resolvePath(filePath, root);
  const stat = await fs.stat(p).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`File not found: ${filePath}`);
  }
  const text = await fs.readFile(p, "utf-8");
  const lines = text.split("\n");
  const numbered = lines.map((line, i) => `${String(i + 1).padStart(4)} | ${line}`).join("\n");
  return `--- ${filePath} ---\n${numbered}`;
}

export async function writeFile(
  filePath: string,
  content: string,
  root: string = WORKSPACE_ROOT
): Promise<string> {
  const p = resolvePath(filePath, root);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf-8");
  return `Wrote ${filePath} (${Buffer.byteLength(content, "utf-8")} bytes)`;
}

export async function editFile(
  filePath: string,
  oldString: string,
  newString: string,
  root: string = WORKSPACE_ROOT
): Promise<string> {
  const p = resolvePath(filePath, root);
  const stat = await fs.stat(p).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`File not found: ${filePath}`);
  }
  const text = await fs.readFile(p, "utf-8");
  if (!text.includes(oldString)) {
    throw new Error(`old_string not found in ${filePath}`);
  }
  const newText = text.replace(oldString, newString);
  await fs.writeFile(p, newText, "utf-8");
  return `Edited ${filePath}: 1 replacement`;
}

async function walkDir(
  dir: string,
  prefix: string,
  lines: string[],
  recursive: boolean,
  rootResolved: string
): Promise<void> {
  let entries: { name: string; full: string; isDir: boolean }[] = [];
  try {
    const names = await fs.readdir(dir);
    const withStat = await Promise.all(
      names.map(async (name) => {
        const full = path.join(dir, name);
        const stat = await fs.stat(full).catch(() => null);
        return { name, full, isDir: stat?.isDirectory() ?? false };
      })
    );
    entries = withStat.sort((a, b) => {
      const aFile = Number(a.isDir);
      const bFile = Number(b.isDir);
      if (aFile !== bFile) return aFile - bFile;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  } catch {
    lines.push(`${prefix}(permission denied)`);
    return;
  }
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isLast = i === entries.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const suffix = e.isDir ? "/" : "";
    lines.push(`${prefix}${branch}${e.name}${suffix}`);
    if (recursive && e.isDir) {
      const ext = isLast ? "    " : "│   ";
      await walkDir(e.full, prefix + ext, lines, true, rootResolved);
    }
  }
}

export async function listFiles(
  dirPath: string = ".",
  root: string = WORKSPACE_ROOT,
  recursive: boolean = false
): Promise<string> {
  const p = resolvePath(dirPath, root);
  const stat = await fs.stat(p).catch(() => null);
  if (!stat) {
    throw new Error(`Path not found: ${dirPath}`);
  }
  if (!stat.isDirectory()) {
    return `${dirPath} (file)`;
  }
  const lines: string[] = [];
  lines.push(dirPath + "/");
  if (recursive) {
    await walkDir(p, "", lines, true, path.resolve(root));
  } else {
    try {
      const names = await fs.readdir(p);
      const withStat = await Promise.all(
        names.map(async (name) => {
          const full = path.join(p, name);
          const s = await fs.stat(full).catch(() => null);
          return { name, isDir: s?.isDirectory() ?? false };
        })
      );
      const sorted = withStat.sort((a, b) => {
        const aFile = Number(a.isDir);
        const bFile = Number(b.isDir);
        if (aFile !== bFile) return aFile - bFile;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      for (const e of sorted) {
        lines.push("├── " + e.name + (e.isDir ? "/" : ""));
      }
    } catch {
      lines.push("(permission denied)");
    }
  }
  return lines.join("\n");
}

/** Recursively list all files under dir, relative to root. */
async function listAllFiles(dir: string, rootResolved: string, relBase: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const names = await fs.readdir(dir);
    for (const name of names) {
      const full = path.join(dir, name);
      const rel = relBase ? `${relBase}${path.sep}${name}` : name;
      const stat = await fs.stat(full).catch(() => null);
      if (!stat) continue;
      if (stat.isDirectory()) {
        results.push(...(await listAllFiles(full, rootResolved, rel)));
      } else {
        results.push(rel);
      }
    }
  } catch {
    // permission denied, skip
  }
  return results;
}

/** Simple glob: * and ** supported. * = any in segment, ** = any path. */
function matchGlob(relativePath: string, pattern: string): boolean {
  const sep = path.sep;
  const parts = relativePath.split(sep);
  const patParts = pattern.split(sep).filter(Boolean);
  let p = 0;
  let i = 0;
  while (p < patParts.length && i < parts.length) {
    const pat = patParts[p];
    const name = parts[i];
    if (pat === "**") {
      if (p === patParts.length - 1) return true;
      const next = patParts[p + 1];
      if (matchSegment(next, name)) {
        p += 2;
        i++;
      } else {
        i++;
      }
      continue;
    }
    if (!matchSegment(pat, name)) return false;
    p++;
    i++;
  }
  if (p < patParts.length) {
    while (p < patParts.length && patParts[p] === "**") p++;
    return p === patParts.length;
  }
  return i === parts.length;
}

function matchSegment(pat: string, name: string): boolean {
  if (pat === "*") return true;
  if (pat.includes("*")) {
    const re = new RegExp("^" + pat.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
    return re.test(name);
  }
  return pat === name;
}

async function globMatch(pattern: string, root: string): Promise<string[]> {
  const rootResolved = path.resolve(root);
  const all = await listAllFiles(rootResolved, rootResolved, "");
  const normalized = pattern.split("/").join(path.sep);
  if (normalized === "**" + path.sep + "*" || normalized === "**/*") return all.sort();
  return all.filter((rel) => matchGlob(rel, normalized)).sort();
}

export async function globFiles(pattern: string, root: string = WORKSPACE_ROOT): Promise<string> {
  const matches = await globMatch(pattern, root);
  return matches.length ? matches.join("\n") : "(no matches)";
}

export async function grepFiles(
  pattern: string,
  root: string = WORKSPACE_ROOT,
  globPattern: string = "**/*",
  maxMatches: number = 100
): Promise<string> {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    throw new Error(`Invalid regex: ${pattern}`);
  }
  const rootResolved = path.resolve(root);
  const normalized = globPattern.split("/").join(path.sep);
  const files = await globMatch(normalized, root);
  const results: string[] = [];
  for (const rel of files) {
    const full = path.join(rootResolved, rel);
    let text: string;
    try {
      text = await fs.readFile(full, "utf-8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        results.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
        if (results.length >= maxMatches) {
          return results.join("\n");
        }
      }
    }
  }
  return results.length ? results.join("\n") : "(no matches)";
}
