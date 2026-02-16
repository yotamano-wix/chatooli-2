/**
 * Mastra engine: model-agnostic agent with tools and skills.
 * Supports any provider via "provider/model" string (OpenAI, Anthropic, Google, etc.).
 */

import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getSystemPrompt, getMatchedSkills, getArtDirectorPrompt } from "./prompts.js";
import { type HistoryMessage } from "./sessions.js";
import * as fs from "./tools/filesystem.js";
import { executePythonCode } from "./tools/sandbox.js";
import { extractCodeBlocks } from "./utils.js";

const DEFAULT_MODEL = "openai/gpt-5.2";
const MAX_STEPS = 20;

// ---------- Types ----------

export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

export interface EngineResponse {
  text: string;
  code_blocks: { language: string; code: string }[];
  files_changed: string[];
  tool_calls: ToolCallInfo[];
  skills_used: string[];
  design_brief?: string;
  preview_file?: string;
}

// ---------- Model resolution ----------

/** Reasoning model patterns. */
const OPENAI_REASONING_MODELS = ["o1", "o3", "o3-mini", "o4-mini"];
const ANTHROPIC_THINKING_SUFFIX = "-thinking";

interface ResolvedModel {
  modelId: string;
  isReasoning: boolean;
  providerOptions?: Record<string, unknown>;
}

/** Convert a short model name into a Mastra-compatible "provider/model" string, detecting reasoning models. */
function resolveModel(modelId: string | null): ResolvedModel {
  const name = (modelId || "").toLowerCase();
  if (!name) return { modelId: DEFAULT_MODEL, isReasoning: false };

  // Anthropic thinking mode: "claude-xxx-thinking" -> strip suffix, enable thinking
  if (name.endsWith(ANTHROPIC_THINKING_SUFFIX)) {
    const base = name.slice(0, -ANTHROPIC_THINKING_SUFFIX.length);
    return {
      modelId: `anthropic/${base}`,
      isReasoning: true,
      providerOptions: {
        anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } },
      },
    };
  }

  // OpenAI reasoning models (o1, o3, o3-mini, etc.)
  const isOpenAiReasoning = OPENAI_REASONING_MODELS.some(
    (m) => name === m || name === `openai/${m}`
  );
  if (isOpenAiReasoning) {
    const id = name.includes("/") ? name : `openai/${name}`;
    return {
      modelId: id,
      isReasoning: true,
      providerOptions: {
        openai: { reasoningEffort: "medium" },
      },
    };
  }

  // Regular model
  if (name.includes("/")) return { modelId: name, isReasoning: false };
  if (name.startsWith("claude")) return { modelId: `anthropic/${name}`, isReasoning: false };
  if (name.startsWith("gemini")) return { modelId: `google/${name}`, isReasoning: false };
  return { modelId: `openai/${name}`, isReasoning: false };
}

// ---------- Art Director ----------

const ART_DIRECTOR_MAX_STEPS = 8;

/** Create read-only tools for the Art Director (no write/edit access). */
function createArtDirectorTools(workspacePath: string) {
  const root = workspacePath;
  return {
    list_files: createTool({
      id: "list_files",
      description:
        "List files and directories at path (relative to workspace). Use recursive=True for full tree.",
      inputSchema: z.object({
        path: z.string().default("."),
        recursive: z.boolean().default(false),
      }),
      execute: async (inputData) => {
        try {
          return await fs.listFiles(inputData.path, root, inputData.recursive);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
    read_file: createTool({
      id: "read_file",
      description:
        "Read a file from the workspace. path is relative to the workspace root.",
      inputSchema: z.object({ path: z.string().describe("Relative path to file") }),
      execute: async (inputData) => {
        try {
          return await fs.readFile(inputData.path, root);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
  };
}

/**
 * Run the Art Director agent to produce a design brief.
 * The Art Director has read-only workspace access and returns a structured brief.
 */
export async function runArtDirector(
  request: string,
  workspacePath: string,
  model: string | null
): Promise<string> {
  const resolved = resolveModel(model);
  const tools = createArtDirectorTools(workspacePath);
  const prompt = getArtDirectorPrompt();

  const agent = new Agent({
    id: "chatooli-art-director",
    name: "Chatooli Art Director",
    instructions: prompt,
    model: resolved.modelId,
    tools,
  });

  const result = await agent.generate(
    [{ role: "user" as const, content: request }],
    {
      maxSteps: ART_DIRECTOR_MAX_STEPS,
      ...(resolved.providerOptions ? { providerOptions: resolved.providerOptions } : {}),
    }
  );

  return result.text ?? "";
}

// ---------- Tools ----------

interface ToolContext {
  workspacePath: string;
  filesChanged: string[];
  model: string | null;
  /** The file currently shown in the preview iframe (sent by frontend). */
  currentPreviewFile: string | null;
  /** Set by set_preview tool — overrides which file the frontend should show. */
  requestedPreviewFile: string | null;
}

function createMastraTools(ctx: ToolContext) {
  const root = ctx.workspacePath;
  const filesChanged = ctx.filesChanged;
  const model = ctx.model;
  return {
    read_file: createTool({
      id: "read_file",
      description:
        "Read a file from the workspace. path is relative to the workspace root (e.g. src/main.py).",
      inputSchema: z.object({ path: z.string().describe("Relative path to file") }),
      execute: async (inputData) => {
        try {
          return await fs.readFile(inputData.path, root);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
    write_file: createTool({
      id: "write_file",
      description:
        "Create or overwrite a file in the workspace. path is relative; creates directories if needed. You must provide both path and content (the full file body).",
      inputSchema: z.object({
        path: z.string().describe("Relative path to the file, e.g. index.html or src/sketch.js"),
        content: z.string().default("").describe("The complete file content to write. Required."),
      }),
      execute: async (inputData) => {
        if (
          inputData.content === undefined ||
          inputData.content === null ||
          String(inputData.content).trim() === ""
        ) {
          return "Error: content is required. Call write_file again with the full file content as the content argument.";
        }
        try {
          const out = await fs.writeFile(inputData.path, inputData.content, root);
          filesChanged.push(inputData.path);
          return out;
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
    edit_file: createTool({
      id: "edit_file",
      description: "Replace the first occurrence of old_string with new_string in the file at path.",
      inputSchema: z.object({
        path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
      }),
      execute: async (inputData) => {
        try {
          const out = await fs.editFile(
            inputData.path,
            inputData.old_string,
            inputData.new_string,
            root
          );
          filesChanged.push(inputData.path);
          return out;
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
    list_files: createTool({
      id: "list_files",
      description:
        "List files and directories at path (relative to workspace). Use recursive=True for full tree.",
      inputSchema: z.object({
        path: z.string().default("."),
        recursive: z.boolean().default(false),
      }),
      execute: async (inputData) => {
        try {
          return await fs.listFiles(inputData.path, root, inputData.recursive);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
    glob_files: createTool({
      id: "glob_files",
      description:
        "Find files matching glob pattern (e.g. **/*.py). Returns newline-separated paths.",
      inputSchema: z.object({ pattern: z.string() }),
      execute: async (inputData) => {
        try {
          return await fs.globFiles(inputData.pattern, root);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
    grep_files: createTool({
      id: "grep_files",
      description:
        "Search file contents for regex pattern. Optional glob_pattern to limit files (default all).",
      inputSchema: z.object({
        pattern: z.string(),
        glob_pattern: z.string().default("**/*"),
      }),
      execute: async (inputData) => {
        try {
          return await fs.grepFiles(inputData.pattern, root, inputData.glob_pattern);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
    execute_python_code: createTool({
      id: "execute_python_code",
      description:
        "Execute Python code in a sandbox and return the output. Use for running scripts or computations.",
      inputSchema: z.object({ code: z.string() }),
      execute: async (inputData) => {
        try {
          return await executePythonCode(inputData.code);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
    consult_art_director: createTool({
      id: "consult_art_director",
      description:
        "Consult the Art Director for creative direction on a new piece or major redesign. " +
        "Use for new creative work, major visual changes, or when you need design guidance. " +
        "Pass a clear description of what you need direction on, including relevant context " +
        "about what exists and what the user wants. Returns a structured design brief.",
      inputSchema: z.object({
        request: z.string().describe(
          "What you need the Art Director's input on. Include the user's request " +
          "and any relevant context about the current workspace state."
        ),
      }),
      execute: async (inputData) => {
        try {
          return await runArtDirector(inputData.request, root, model);
        } catch (e) {
          return `Art Director unavailable: ${e instanceof Error ? e.message : e}. Proceed with your best judgment.`;
        }
      },
    }),
    set_preview: createTool({
      id: "set_preview",
      description:
        "Set which file to show in the preview iframe. Use after writing or editing files " +
        "to control which HTML file the user sees. The path is relative to the workspace.",
      inputSchema: z.object({
        path: z.string().describe("Relative path to the file to preview, e.g. index.html or sketches/demo.html"),
      }),
      execute: async (inputData) => {
        ctx.requestedPreviewFile = inputData.path;
        return `Preview set to: ${inputData.path}`;
      },
    }),
    get_preview_status: createTool({
      id: "get_preview_status",
      description:
        "Get the current preview state: which file is shown in the preview iframe " +
        "and which HTML files exist in the workspace. Use to understand what the user " +
        "is currently looking at before making changes.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const allFiles = await fs.globFiles("**/*.html", root);
          const htmlFiles = allFiles.trim().split("\n").filter(Boolean);
          const current = ctx.requestedPreviewFile ?? ctx.currentPreviewFile;
          return JSON.stringify({
            current_preview: current ?? "(none)",
            html_files: htmlFiles,
          });
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : e}`;
        }
      },
    }),
  };
}

// ---------- Shared setup ----------

function buildMessages(
  history: HistoryMessage[],
  currentMessage: string
): { role: "user" | "assistant"; content: string }[] {
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: "user", content: currentMessage });
  return messages;
}

async function buildAgent(
  message: string,
  workspacePath: string,
  model: string | null,
  toolCtx: ToolContext,
  designBrief?: string
) {
  const tools = createMastraTools(toolCtx);
  const resolved = resolveModel(model);
  const systemPrompt = await getSystemPrompt();
  const { names: skillsUsed, context: skillContext } = await getMatchedSkills(message);

  const parts = [systemPrompt];
  if (skillContext) parts.push(skillContext);
  if (designBrief) {
    parts.push(
      "## Current Design Brief\n\n" +
      "The Art Director has reviewed this request and produced the following brief. " +
      "Follow this as your creative direction.\n\n" +
      designBrief
    );
  }
  const fullInstructions = parts.join("\n\n");

  const agent = new Agent({
    id: "chatooli-creative",
    name: "Chatooli Creative",
    instructions: fullInstructions,
    model: resolved.modelId,
    tools,
  });

  return { agent, resolved, skillsUsed };
}

// ---------- Non-streaming runner (for /api/chat fallback) ----------

export async function runAgent(
  message: string,
  history: HistoryMessage[],
  workspacePath: string,
  model: string | null,
  currentPreviewFile?: string | null
): Promise<EngineResponse> {
  const toolCtx: ToolContext = {
    workspacePath,
    filesChanged: [],
    model,
    currentPreviewFile: currentPreviewFile ?? null,
    requestedPreviewFile: null,
  };
  const toolCalls: ToolCallInfo[] = [];

  // First message in session → auto-run Art Director
  const isFirstMessage = history.length === 0;
  let designBrief = "";
  if (isFirstMessage) {
    try {
      console.log("[art-director] auto-running for first message");
      designBrief = await runArtDirector(message, workspacePath, model);
      console.log(`[art-director] brief generated (${designBrief.length} chars)`);
    } catch (err) {
      console.error("[art-director] failed, proceeding without brief:", err);
    }
  }

  const { agent, resolved, skillsUsed } = await buildAgent(
    message, workspacePath, model, toolCtx, designBrief || undefined
  );
  const messages = buildMessages(history, message);

  const result = await agent.generate(messages as Parameters<Agent["generate"]>[0], {
    maxSteps: MAX_STEPS,
    ...(resolved.providerOptions ? { providerOptions: resolved.providerOptions } : {}),
  });

  for (const step of result.steps ?? []) {
    const stepCalls = step.toolCalls ?? [];
    const stepResults = step.toolResults ?? [];
    for (let i = 0; i < stepCalls.length; i++) {
      const chunk = stepCalls[i];
      const payload = chunk?.payload ?? chunk;
      const name =
        (payload as { toolName?: string }).toolName ?? "unknown";
      const args =
        (payload as { args?: Record<string, unknown> }).args ?? {};
      const resChunk = stepResults[i];
      const resPayload = resChunk?.payload ?? resChunk;
      const resultStr =
        typeof resPayload === "string"
          ? resPayload
          : resPayload != null && typeof resPayload === "object" && "result" in resPayload
            ? String((resPayload as { result: unknown }).result)
            : resPayload != null
              ? JSON.stringify(resPayload)
              : "";
      const truncated = resultStr.length > 500 ? resultStr.slice(0, 500) + "..." : resultStr;
      toolCalls.push({ name, args, result: truncated });
    }
  }

  const text = result.text ?? "";
  const codeBlocks = extractCodeBlocks(text);
  return {
    text,
    code_blocks: codeBlocks,
    files_changed: toolCtx.filesChanged,
    tool_calls: toolCalls,
    skills_used: skillsUsed,
    ...(designBrief ? { design_brief: designBrief } : {}),
    ...(toolCtx.requestedPreviewFile ? { preview_file: toolCtx.requestedPreviewFile } : {}),
  };
}

// ---------- SSE event types ----------

export type SSEEvent =
  | { type: "art_director_start"; data: Record<string, never> }
  | { type: "design_brief"; data: { brief: string } }
  | { type: "set_preview"; data: { path: string } }
  | { type: "skills"; data: { skills: string[] } }
  | { type: "reasoning_start"; data: Record<string, never> }
  | { type: "reasoning"; data: { text: string } }
  | { type: "tool_call"; data: { name: string; args: Record<string, unknown> } }
  | { type: "tool_result"; data: { name: string; result: string } }
  | { type: "text_delta"; data: { text: string } }
  | { type: "response"; data: EngineResponse & { session_id: string } }
  | { type: "done"; data: { status: string } };

// ---------- Streaming runner (for /api/chat/stream) ----------

const STREAM_TIMEOUT_MS = 180_000; // 3 min overall timeout

export async function* streamAgent(
  message: string,
  history: HistoryMessage[],
  workspacePath: string,
  model: string | null,
  currentPreviewFile?: string | null
): AsyncGenerator<SSEEvent> {
  const toolCtx: ToolContext = {
    workspacePath,
    filesChanged: [],
    model,
    currentPreviewFile: currentPreviewFile ?? null,
    requestedPreviewFile: null,
  };
  const toolCalls: ToolCallInfo[] = [];

  // First message in session → auto-run Art Director
  const isFirstMessage = history.length === 0;
  let designBrief = "";
  if (isFirstMessage) {
    yield { type: "art_director_start", data: {} };
    try {
      console.log("[art-director] auto-running for first message (stream)");
      designBrief = await runArtDirector(message, workspacePath, model);
      console.log(`[art-director] brief generated (${designBrief.length} chars)`);
      if (designBrief) {
        yield { type: "design_brief", data: { brief: designBrief } };
      }
    } catch (err) {
      console.error("[art-director] failed, proceeding without brief:", err);
    }
  }

  const { agent, resolved, skillsUsed } = await buildAgent(
    message, workspacePath, model, toolCtx, designBrief || undefined
  );

  if (skillsUsed.length > 0) {
    yield { type: "skills", data: { skills: skillsUsed } };
  }

  const messages = buildMessages(history, message);
  let stepCount = 0;

  const stream = await agent.stream(messages as Parameters<Agent["stream"]>[0], {
    maxSteps: MAX_STEPS,
    ...(resolved.providerOptions ? { providerOptions: resolved.providerOptions } : {}),
    onStepFinish: (step: unknown) => {
      stepCount++;
      console.log(`[stream] step ${stepCount} finished`);
    },
    onError: ({ error }: { error: unknown }) => {
      console.error("[stream] error:", error);
    },
    onFinish: () => {
      console.log(`[stream] finished after ${stepCount} steps`);
    },
  });

  let fullText = "";
  let currentToolName = "";
  const startTime = Date.now();

  try {
    for await (const chunk of stream.fullStream) {
      // Timeout guard
      if (Date.now() - startTime > STREAM_TIMEOUT_MS) {
        console.warn(`[stream] timeout after ${Math.round((Date.now() - startTime) / 1000)}s`);
        break;
      }

      const chunkType = (chunk as { type: string }).type;
      const payload = (chunk as { payload?: Record<string, unknown> }).payload ?? {};

      switch (chunkType) {
        case "reasoning-start": {
          yield { type: "reasoning_start", data: {} };
          break;
        }
        case "reasoning-delta": {
          const text = (payload.text as string) ?? "";
          if (text) yield { type: "reasoning", data: { text } };
          break;
        }
        case "text-delta": {
          const text = (payload.text as string) ?? "";
          if (text) {
            fullText += text;
            yield { type: "text_delta", data: { text } };
          }
          break;
        }
        case "tool-call": {
          const toolName = (payload.toolName as string) ?? "unknown";
          const args = (payload.args as Record<string, unknown>) ?? {};
          currentToolName = toolName;
          yield { type: "tool_call", data: { name: toolName, args } };
          break;
        }
        case "tool-result": {
          const resultVal = payload.result;
          const resultStr = typeof resultVal === "string"
            ? resultVal
            : resultVal != null ? JSON.stringify(resultVal) : "";
          const truncated = resultStr.length > 500 ? resultStr.slice(0, 500) + "..." : resultStr;
          const name = (payload.toolName as string) ?? currentToolName;
          toolCalls.push({ name, args: {}, result: truncated });
          yield { type: "tool_result", data: { name, result: truncated } };
          if (name === "set_preview" && toolCtx.requestedPreviewFile) {
            yield { type: "set_preview", data: { path: toolCtx.requestedPreviewFile } };
          }
          break;
        }
        case "step-start": {
          console.log(`[stream] step started (elapsed: ${Math.round((Date.now() - startTime) / 1000)}s)`);
          break;
        }
        case "step-finish": {
          console.log(`[stream] step finished (elapsed: ${Math.round((Date.now() - startTime) / 1000)}s)`);
          break;
        }
      }
    }
  } catch (err) {
    console.error("[stream] fullStream error:", err);
    // If we have partial text, still return it
    if (!fullText) {
      fullText = `Error during streaming: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[stream] complete: ${elapsed}s, ${stepCount} steps, ${toolCalls.length} tool calls, ${fullText.length} chars`);

  const codeBlocks = extractCodeBlocks(fullText);

  yield {
    type: "response",
    data: {
      session_id: "",
      text: fullText,
      code_blocks: codeBlocks,
      files_changed: toolCtx.filesChanged,
      tool_calls: toolCalls,
      skills_used: skillsUsed,
      ...(designBrief ? { design_brief: designBrief } : {}),
      ...(toolCtx.requestedPreviewFile ? { preview_file: toolCtx.requestedPreviewFile } : {}),
    },
  };

  yield { type: "done", data: { status: "complete" } };
}
