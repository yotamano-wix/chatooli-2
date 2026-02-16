/**
 * Hono server for Chatooli — Mastra-powered AI agent with tools and skills.
 */

import dotenv from "dotenv";
import { serve } from "@hono/node-server";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { runAgent, streamAgent, type EngineResponse, type SSEEvent } from "./mastra-engine.js";
import * as sessions from "./sessions.js";
import * as filesystem from "./tools/filesystem.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

const DEFAULT_WORKSPACE = process.env.CHATOOLI_WORKSPACE ?? path.join(PROJECT_ROOT, "workspace");
const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend");

// ---------- Helpers ----------

const MIME_BY_EXT: Record<string, string> = {
  ".glsl": "text/plain", ".frag": "text/plain", ".vert": "text/plain",
  ".wgsl": "text/plain", ".obj": "text/plain", ".mtl": "text/plain",
  ".html": "text/html", ".htm": "text/html",
  ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

function getMimeType(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** If agent returned HTML in a code block but wrote no files, auto-save to workspace. */
async function autoSaveHtml(
  codeBlocks: { language: string; code: string }[],
  filesChanged: string[],
  workspacePath: string
): Promise<string[]> {
  if (filesChanged.length > 0) return filesChanged;
  for (const block of codeBlocks) {
    const code = block.code ?? "";
    if (code.includes("<!DOCTYPE") || code.includes("<html")) {
      const titleMatch = code.match(/<title>([^<]*)<\/title>/i);
      let name = "sketch.html";
      if (titleMatch) {
        const slug = titleMatch[1].trim().toLowerCase()
          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
        if (slug) name = `${slug}.html`;
      }
      try {
        const full = path.resolve(workspacePath, name);
        if (!full.startsWith(path.resolve(workspacePath))) continue;
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, code, "utf-8");
        return [name];
      } catch { /* ignore */ }
      break;
    }
  }
  return filesChanged;
}

// ---------- Shared chat handler ----------

interface ChatBody {
  message: string;
  session_id?: string | null;
  model?: string | null;
  workspace_path?: string | null;
  preview_file?: string | null;
}

interface ChatResult {
  session_id: string;
  response: string;
  code_blocks: { language: string; code: string }[];
  files_changed: string[];
  tool_calls: EngineResponse["tool_calls"];
  skills_used: string[];
}

async function handleChat(body: ChatBody): Promise<ChatResult> {
  const sessionId = body.session_id ?? crypto.randomUUID();
  const workspacePath = body.workspace_path ?? DEFAULT_WORKSPACE;
  sessions.appendToSession(sessionId, "user", body.message);
  const history = sessions.getSession(sessionId).slice(0, -1);

  try {
    const response = await runAgent(body.message, history, workspacePath, body.model ?? null, body.preview_file);
    const filesChanged = await autoSaveHtml(response.code_blocks, response.files_changed, workspacePath);
    sessions.appendToSession(sessionId, "assistant", response.text);
    return {
      session_id: sessionId,
      response: response.text,
      code_blocks: response.code_blocks,
      files_changed: filesChanged,
      tool_calls: response.tool_calls,
      skills_used: response.skills_used,
    };
  } catch (e) {
    return {
      session_id: sessionId,
      response: `Error: ${e instanceof Error ? e.message : e}`,
      code_blocks: [],
      files_changed: [],
      tool_calls: [],
      skills_used: [],
    };
  }
}

// ---------- App ----------

const app = new Hono();
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "DELETE"], allowHeaders: ["Content-Type"] }));

// Frontend
app.get("/", async (c) => {
  try {
    const html = await fs.readFile(path.join(FRONTEND_DIR, "index.html"), "utf-8");
    return c.html(html);
  } catch {
    return c.text("Frontend not found. Run from project root.", 404);
  }
});

app.get("/static/*", async (c) => {
  const p = c.req.path.slice("/static".length) || "/";
  const full = path.join(FRONTEND_DIR, p);
  if (!path.resolve(full).startsWith(path.resolve(FRONTEND_DIR))) return c.json({ error: "Forbidden" }, 403);
  try {
    const stat = await fs.stat(full);
    if (stat.isDirectory()) return c.json({ error: "Not found" }, 404);
    const content = await fs.readFile(full);
    return c.body(content, 200, { "Content-Type": getMimeType(full), "Cache-Control": "no-cache" });
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});

// Workspace
app.get("/api/workspace/entries", async (c) => {
  const pathParam = c.req.query("path") ?? ".";
  const workspacePath = c.req.query("workspace_path") ?? DEFAULT_WORKSPACE;
  try {
    const raw = await filesystem.listFiles(pathParam, workspacePath, false);
    const entries: { name: string; type: string }[] = [];
    for (const line of raw.trim().split("\n")) {
      const trimmed = line.trim();
      if ((trimmed.startsWith("├── ") || trimmed.startsWith("└── ")) && trimmed !== "(permission denied)") {
        const name = trimmed.slice(4);
        if (name) {
          const isDir = name.endsWith("/");
          entries.push({ name: name.replace(/\/$/, ""), type: isDir ? "directory" : "file" });
        }
      }
    }
    return c.json({ path: pathParam, entries });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

app.get("/api/workspace/files/*", async (c) => {
  const filePath = c.req.path.slice("/api/workspace/files".length).replace(/^\//, "") || "";
  const workspacePath = c.req.query("workspace_path") ?? DEFAULT_WORKSPACE;
  const rootResolved = path.resolve(workspacePath);
  const full = path.resolve(rootResolved, filePath);
  if (!full.startsWith(rootResolved)) return c.json({ error: "Path escapes workspace" }, 403);
  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) return c.json({ error: `File not found: ${filePath}` }, 404);
    const content = await fs.readFile(full);
    return c.body(content, 200, {
      "Content-Type": getMimeType(full),
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return c.json({ error: `File not found: ${filePath}` }, 404);
    return c.json({ error: "Permission denied" }, 403);
  }
});

// Chat
app.post("/api/chat", async (c) => {
  const body = (await c.req.json()) as ChatBody;
  const result = await handleChat(body);
  return c.json(result, result.response.startsWith("Error:") ? 500 : 200);
});

app.post("/api/chat/stream", async (c) => {
  const body = (await c.req.json()) as ChatBody;
  const sessionId = body.session_id ?? crypto.randomUUID();
  const workspacePath = body.workspace_path ?? DEFAULT_WORKSPACE;
  sessions.appendToSession(sessionId, "user", body.message);
  const history = sessions.getSession(sessionId).slice(0, -1);

  return streamSSE(c, async (sseStream) => {
    const send = async (event: string, data: unknown) => {
      await sseStream.writeSSE({ event, data: JSON.stringify(data) });
    };

    try {
      for await (const event of streamAgent(
        body.message, history, workspacePath, body.model ?? null, body.preview_file
      )) {
        if (event.type === "response") {
          const resp = event.data;
          const filesChanged = await autoSaveHtml(
            resp.code_blocks, resp.files_changed, workspacePath
          );
          resp.files_changed = filesChanged;
          resp.session_id = sessionId;
          sessions.appendToSession(sessionId, "assistant", resp.text);
          await send("response", resp);
        } else {
          await send(event.type, event.data);
        }
      }
    } catch (e) {
      await send("response", {
        session_id: sessionId,
        response: `Error: ${e instanceof Error ? e.message : e}`,
        code_blocks: [],
        files_changed: [],
        tool_calls: [],
        skills_used: [],
      });
      await send("done", { status: "complete" });
    }
  });
});

// Sessions
app.get("/api/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  return c.json({ session_id: sessionId, history: sessions.getSession(sessionId) });
});

app.delete("/api/sessions/:sessionId", (c) => {
  sessions.clearSession(c.req.param("sessionId"));
  return c.json({ status: "cleared" });
});

// Start
const PORT = Number(process.env.PORT) || 3000;
console.log(`Chatooli (Mastra) running at http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
