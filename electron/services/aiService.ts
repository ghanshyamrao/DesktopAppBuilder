import { randomUUID } from "node:crypto";
import type {
  AIProjectDraft, AIChatMessage, AIChatContext, AIChatResponse,
} from "../types";
import type { SettingsStore } from "./settingsStore";
import { phClient } from "./analytics";

// Google Gemini — free tier on AI Studio. The free tier covers Gemini 2.5
// Flash with a generous daily quota and requires no credit card. Swap MODEL
// to `gemini-2.0-flash` if you want the older, slightly faster model.
const MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_PROMPT = `You are an AI assistant inside WebToDesktop Builder — a desktop tool that turns websites into native Electron desktop apps.

The user describes the kind of desktop app they want. You produce a JSON object that the builder uses to prefill its project wizard.

Return ONLY a single JSON object with this exact shape:

{
  "rationale": "1-2 sentences explaining the choices, in plain English",
  "draft": {
    "name": "App Name",
    "url": "https://...",
    "description": "Short tagline",
    "window": { "width": 1280, "height": 800 },
    "security": {
      "contextIsolation": true,
      "nodeIntegration": false,
      "disableContextMenu": false,
      "enableDevToolsInProduction": false
    },
    "actions": {
      "tray": true,
      "minimizeToTray": false,
      "singleInstance": true,
      "startupLaunch": false,
      "applicationMenu": true,
      "notifications": true,
      "alwaysOnTop": false,
      "deepLinkProtocol": "myapp",
      "globalShortcuts": [
        { "accelerator": "CmdOrCtrl+Shift+Y", "action": "toggle" }
      ]
    },
    "customCss": "",
    "customJs": "",
    "suggestedThemeId": "macos"
  }
}

Rules:
- Pick a sensible URL only if the user mentions a specific site. Otherwise leave it empty for them to fill.
- For "suggestedThemeId", choose ONE of: macos, windows11, cyberpunk, gaming, minimal, material, discord.
- Keep "actions.globalShortcuts" empty unless the user asks for shortcuts.
- "actions.deepLinkProtocol" should be empty unless the user wants deep linking.
- "actions.alwaysOnTop" → true ONLY when the user wants a pinned/floating widget (maps, video PiP, lyrics).
- shortcut "action" values are: show, hide, toggle, reload, home, togglePin (togglePin = always-on-top toggle).
- "customCss" → CSS the wrapped page should have injected (dark mode, hide ads, hide sidebars). Keep it short and specific. Empty string when nothing's needed.
- "customJs" → JS to inject (custom shortcuts, autofill). Wrapped in an IIFE+try/catch at runtime, so feel free to write top-level vars. Empty by default.
- "rationale" must be specific to the choices you made — no fluff.
- Output VALID JSON only — no prose, no markdown fences, no commentary.`;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export class AIService {
  constructor(private settings: SettingsStore) {}

  hasApiKey(): boolean {
    return Boolean(this.settings.get().aiApiKey);
  }

  /**
   * Multi-turn conversation entry point. The renderer keeps the message
   * history and supplies it on every call, plus a context snapshot of the
   * user's projects + current route so the model can reason about real state.
   *
   * The model returns a structured object: { message, draft?, actions? }.
   * Actions are suggested — the renderer presents clickable chips and the
   * user confirms before anything destructive runs.
   */
  async chat(messages: AIChatMessage[], context: AIChatContext): Promise<AIChatResponse> {
    const apiKey = this.settings.get().aiApiKey;
    if (!apiKey) throw new Error("Gemini API key not set. Add it in Settings.");
    if (!messages.length) throw new Error("No messages to send.");

    const systemText = buildChatSystemPrompt(context);
    const url = `${API_BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      system_instruction: { parts: [{ text: systemText }] },
      // Gemini uses "model" for the assistant role, not "assistant".
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }],
      })),
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    };

    const startTime = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const latency = (Date.now() - startTime) / 1000;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      phClient?.capture({
        distinctId: "desktop",
        event: "$ai_generation",
        properties: {
          $ai_trace_id: randomUUID(),
          $ai_model: MODEL,
          $ai_provider: "google",
          $ai_latency: latency,
          $ai_http_status: res.status,
          $ai_is_error: true,
          $ai_error: `Gemini API error (${res.status})`,
        },
      });
      throw new Error(`Gemini API error (${res.status}): ${shortError(text)}`);
    }

    const json = (await res.json()) as GeminiResponse;
    if (json.error?.message) throw new Error(`Gemini API error: ${json.error.message}`);
    if (json.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt: ${json.promptFeedback.blockReason}`);
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no text content.");

    phClient?.capture({
      distinctId: "desktop",
      event: "$ai_generation",
      properties: {
        $ai_trace_id: randomUUID(),
        $ai_span_name: "ai_chat",
        $ai_model: MODEL,
        $ai_provider: "google",
        $ai_input_tokens: json.usageMetadata?.promptTokenCount,
        $ai_output_tokens: json.usageMetadata?.candidatesTokenCount,
        $ai_latency: latency,
        $ai_http_status: res.status,
        $ai_temperature: 0.6,
        $ai_max_tokens: 2048,
      },
    });

    return parseChatResponse(text);
  }

  async generateProject(prompt: string): Promise<AIProjectDraft> {
    const apiKey = this.settings.get().aiApiKey;
    if (!apiKey) throw new Error("Gemini API key not set. Add it in Settings.");
    if (!prompt?.trim()) throw new Error("Prompt is empty.");

    const url = `${API_BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        // Force a JSON-only response so we don't have to strip prose.
        responseMimeType: "application/json",
      },
    };

    const startTime = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const latency = (Date.now() - startTime) / 1000;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      phClient?.capture({
        distinctId: "desktop",
        event: "$ai_generation",
        properties: {
          $ai_trace_id: randomUUID(),
          $ai_model: MODEL,
          $ai_provider: "google",
          $ai_latency: latency,
          $ai_http_status: res.status,
          $ai_is_error: true,
          $ai_error: `Gemini API error (${res.status})`,
        },
      });
      throw new Error(`Gemini API error (${res.status}): ${shortError(text)}`);
    }

    const json = (await res.json()) as GeminiResponse;
    if (json.error?.message) throw new Error(`Gemini API error: ${json.error.message}`);
    if (json.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt: ${json.promptFeedback.blockReason}`);
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no text content.");

    phClient?.capture({
      distinctId: "desktop",
      event: "$ai_generation",
      properties: {
        $ai_trace_id: randomUUID(),
        $ai_span_name: "generate_project",
        $ai_model: MODEL,
        $ai_provider: "google",
        $ai_input_tokens: json.usageMetadata?.promptTokenCount,
        $ai_output_tokens: json.usageMetadata?.candidatesTokenCount,
        $ai_latency: latency,
        $ai_http_status: res.status,
        $ai_temperature: 0.7,
        $ai_max_tokens: 1024,
      },
    });

    return parseDraft(text);
  }
}

/** Pull the JSON blob out of the model's response. */
function parseDraft(raw: string): AIProjectDraft {
  // responseMimeType:"application/json" should make Gemini return clean JSON,
  // but stay tolerant of fenced blocks in case a model variant ignores it.
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  const candidate = (fence?.[1] ?? raw).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { parsed = JSON.parse(candidate.slice(start, end + 1)); }
      catch (e) { throw new Error(`AI response was not valid JSON: ${(e as Error).message}`); }
    } else {
      throw new Error("AI response was not valid JSON.");
    }
  }

  const obj = parsed as Partial<AIProjectDraft>;
  if (!obj.draft || typeof obj.draft !== "object") {
    throw new Error("AI response missing `draft` field.");
  }
  return {
    rationale: typeof obj.rationale === "string" ? obj.rationale : "",
    draft: obj.draft as AIProjectDraft["draft"],
  };
}

function shortError(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message ?? text.slice(0, 240);
  } catch {
    return text.slice(0, 240);
  }
}

/**
 * Build the system prompt for the conversational endpoint. Includes the
 * user's existing projects, current route, and any in-progress draft so
 * the model can reason about real state and target actions correctly.
 */
function buildChatSystemPrompt(ctx: AIChatContext): string {
  const projectList = ctx.projects.length
    ? ctx.projects.map((p) => `  - "${p.name}" (id: ${p.id}, url: ${p.url}${p.themeId ? `, theme: ${p.themeId}` : ""}${p.hasIcon ? ", has icon" : ""})`).join("\n")
    : "  (none yet)";
  const draftBlock = ctx.currentDraft
    ? `\nCURRENT DRAFT IN WIZARD:\n${JSON.stringify(ctx.currentDraft, null, 2)}\n`
    : "";

  return `You are the AI assistant inside WebToDesktop Builder — a tool that turns websites into native Electron desktop apps.

You have a CONVERSATION with the user, can REFINE drafts iteratively, and can SUGGEST actions the user clicks to execute.

USER STATE:
- Current route: ${ctx.route}
- Existing projects:
${projectList}
${draftBlock}

OUTPUT FORMAT — return a single JSON object (no prose, no fences):
{
  "message": "Plain-English reply (1-3 sentences). Be conversational, specific, and brief.",
  "draft": null | {
    "rationale": "1-2 sentences explaining choices",
    "draft": {
      "name": "App Name",
      "url": "https://...",
      "description": "Short tagline",
      "window": { "width": 1280, "height": 800 },
      "security": { "contextIsolation": true, "nodeIntegration": false, "disableContextMenu": false, "enableDevToolsInProduction": false },
      "actions": { "tray": true, "minimizeToTray": false, "singleInstance": true, "startupLaunch": false, "applicationMenu": true, "notifications": true, "alwaysOnTop": false, "deepLinkProtocol": "", "globalShortcuts": [] },
      "customCss": "/* CSS injected into the wrapped page (dark mode, hide ads, etc) — empty by default */",
      "customJs": "// JS injected into the wrapped page — empty by default",
      "suggestedThemeId": "macos"
    }
  },
  "actions": [
    // Zero or more. Each must be one of these shapes:
    { "kind": "apply_draft",   "label": "Apply to wizard" },
    { "kind": "open_route",    "label": "Open Settings",   "route": "settings" },
    { "kind": "open_route",    "label": "Edit project",    "route": "studio", "projectId": "<id>" },
    { "kind": "set_theme",     "label": "Use macOS theme", "themeId": "macos", "projectId": "<id-or-omit>" },
    { "kind": "fetch_favicon", "label": "Grab favicon",    "url": "https://..." },
    { "kind": "build",         "label": "Build now",       "projectId": "<id>" },
    { "kind": "patch_project", "label": "Resize window",   "projectId": "<id>", "patch": { "window": { "width": 1600, "height": 1000, "resizable": true, "fullscreen": false, "centerOnLaunch": true, "rememberState": true } } },
    { "kind": "apply_recipe",  "label": "Hide ads on Notion", "recipeId": "hide-ads", "projectId": "<id>" }
  ]
}

RECIPE IDS (apply_recipe actions must use these exact ids):
  appearance: dark-everything, tighter-density, monospace-everywhere
  focus:      hide-ads, hide-cookies, minimalist, reader-width
  shortcuts:  vim-scroll, quick-search
  behavior:   always-pinned, tray-quiet

THEME IDS: macos, windows11, cyberpunk, gaming, minimal, material, discord.

ROUTE NAMES: dashboard, studio, themes, actions, plugins, ai, settings, wizard, build (build needs projectId).

WHEN TO USE EACH ACTION:
- "Create an app for X" → return draft + apply_draft action.
- "Make it dark" / "hide ads" / "remove sidebar" → put the rules in draft.customCss, refresh apply_draft.
- "Add a Cmd+K shortcut to <site>" → put the JS in draft.customJs, refresh apply_draft.
- "Pin / always on top" → set actions.alwaysOnTop true OR add a togglePin shortcut.
- "Make it shrink/widen the window" / refinements → return updated draft + apply_draft.
- "Edit my <name> app" → patch_project action targeting that project's id, plus optionally open_route to studio.
- "Build / ship my <name> app" → build action with that project's id.
- "Switch <name> to macOS theme" → set_theme action with projectId.
- "Grab the icon from <url>" → fetch_favicon action.
- "Take me to settings" / navigation requests → open_route action.
- "Apply X recipe to Y app" / "make Notion dark" / "hide ads on YouTube" → apply_recipe action with the matching recipe id and project id.
- Pure questions ("what does context isolation mean?") → message only, no actions.

CUSTOM CSS / JS GUIDANCE:
- Write tight, specific selectors. Use !important only when you must override site CSS.
- For dark-mode requests, prefer a body filter with element exceptions over rewriting every selector.
- For JS, don't fetch external scripts — write everything inline.

RULES:
- Reference projects by exact id when targeting them — match the user's name to the closest existing project.
- Don't invent project ids that aren't in the list above.
- For new-app requests, ALWAYS pair the draft with an apply_draft action.
- shortcut "action" values: show, hide, toggle, reload, home, togglePin.
- Output STRICT JSON. No markdown. No commentary outside the JSON.`;
}

/**
 * Parse the model's chat response into an AIChatResponse. Tolerates the
 * occasional fenced code block, missing optional fields, and extra junk
 * around a single top-level object.
 */
function parseChatResponse(raw: string): AIChatResponse {
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  let candidate = (fence?.[1] ?? raw).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      candidate = candidate.slice(start, end + 1);
      try { parsed = JSON.parse(candidate); }
      catch (e) { throw new Error(`AI response was not valid JSON: ${(e as Error).message}`); }
    } else {
      throw new Error("AI response was not valid JSON.");
    }
  }

  const obj = parsed as Partial<AIChatResponse> & { actions?: unknown };
  const message = typeof obj.message === "string" ? obj.message : "";

  let draft: AIProjectDraft | null = null;
  if (obj.draft && typeof obj.draft === "object") {
    const d = obj.draft as Partial<AIProjectDraft>;
    if (d.draft && typeof d.draft === "object") {
      draft = {
        rationale: typeof d.rationale === "string" ? d.rationale : "",
        draft: d.draft as AIProjectDraft["draft"],
      };
    }
  }

  const actions = Array.isArray(obj.actions)
    ? obj.actions.filter((a): a is AIChatResponse["actions"] extends Array<infer U> ? U : never => {
        if (!a || typeof a !== "object") return false;
        const k = (a as { kind?: unknown }).kind;
        return typeof k === "string" && [
          "apply_draft", "open_route", "set_theme", "fetch_favicon", "build", "patch_project",
          "apply_recipe",
        ].includes(k);
      })
    : [];

  return { message, draft, actions };
}
