/**
 * Execute code in a sandbox. Uses child_process to run Python.
 */

import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const MAX_OUTPUT_BYTES = 100_000;
const TIMEOUT_MS = 30_000;

export async function executePythonCode(code: string): Promise<string> {
  const dir = tmpdir();
  const scriptPath = path.join(dir, `chatooli_sandbox_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  try {
    await fs.writeFile(scriptPath, code, "utf-8");
    const result = execSync(`python3 "${scriptPath}"`, {
      encoding: "utf-8",
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    return result ? `Output:\n${result}` : "Code executed successfully (no output).";
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const stdout = (e.stdout ?? "") as string;
    const stderr = (e.stderr ?? "") as string;
    const parts: string[] = [];
    if (stdout) parts.push(`Output before error:\n${stdout}`);
    parts.push(`Error:\n${stderr || e.message || String(e)}`);
    return parts.join("\n");
  } finally {
    await fs.unlink(scriptPath).catch(() => {});
  }
}
