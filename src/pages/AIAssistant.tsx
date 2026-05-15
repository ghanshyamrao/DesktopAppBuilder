import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot, Send, Sparkles, KeyRound, ExternalLink, Loader2, Check,
  AlertCircle, RefreshCw, Wand2, Palette, Globe, Hammer, Pencil, MapPin, Zap, BookOpen,
  MessageSquare, Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Kbd } from "@/components/ui/Kbd";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useFeatureGuard } from "@/lib/useFeatureGuard";
import type {
  AIProjectDraft, AIChatMessage, AIChatContext, AIChatResponse, AIAction, AppProject,
} from "@/types";
import { PRESETS_BY_ID, PRESETS } from "@/lib/themes/presets";
import { RECIPES, applyRecipeToFields } from "@/lib/recipes";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

interface ChatTurn {
  /** Stable key for animation/list rendering. */
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  /** Set on assistant turns when the model returned a draft. */
  draft?: AIProjectDraft;
  /** Set on assistant turns when the model returned actions. */
  actions?: AIAction[];
  /** Per-action "executed" tag so we don't run the same one twice. */
  ranActions?: Record<number, "ok" | "err">;
}

/** localStorage shape for the AI Assistant's chat archive. Stores a rolling
 *  list of conversations (newest first) + the id of the currently-active
 *  one. Each conversation is capped at TURNS_PER_CONVERSATION to keep
 *  individual entries small; the list as a whole is capped at
 *  CONVERSATION_LIMIT so the archive can't grow without bound. */
const AI_HISTORY_STORAGE_KEY = "w2a:ai-chat-history";
const TURNS_PER_CONVERSATION = 100;
const CONVERSATION_LIMIT = 25;

interface StoredConversation {
  id: string;
  /** First-user-message-derived title for the sidebar list. Falls back to
   *  "New chat" until the user sends their first message. */
  title: string;
  turns: ChatTurn[];
  pinnedDraft: AIProjectDraft | null;
  createdAt: string;
  /** Bumped on every turn so the sidebar can sort by recency. */
  updatedAt: string;
}

interface StoredChatArchive {
  conversations: StoredConversation[];
  activeId: string | null;
}

const newConversationId = () => `c${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function isChatTurn(t: unknown): t is ChatTurn {
  if (typeof t !== "object" || t === null) return false;
  const x = t as ChatTurn;
  return (
    typeof x.id === "string" &&
    typeof x.text === "string" &&
    (x.role === "user" || x.role === "assistant" || x.role === "error")
  );
}

/** Trim leading punctuation/whitespace and clamp to a sidebar-friendly
 *  length. Empty input falls back to the generic "New chat" label. */
function deriveTitle(turns: ChatTurn[]): string {
  const firstUser = turns.find((t) => t.role === "user");
  const raw = firstUser?.text.trim().replace(/^[/.\s-]+/, "") ?? "";
  if (!raw) return "New chat";
  return raw.length > 60 ? `${raw.slice(0, 60).trimEnd()}…` : raw;
}

function loadStoredChatArchive(): StoredChatArchive {
  const empty: StoredChatArchive = { conversations: [], activeId: null };
  try {
    const raw = localStorage.getItem(AI_HISTORY_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty;

    // Legacy migration — v1 stored a single { turns, pinnedDraft } blob.
    // Wrap it into a single-conversation archive so users don't lose
    // their existing chat when this version ships.
    if (Array.isArray(parsed.turns) && !Array.isArray(parsed.conversations)) {
      const turns = parsed.turns.filter(isChatTurn).slice(-TURNS_PER_CONVERSATION);
      if (turns.length === 0) return empty;
      const now = new Date().toISOString();
      const id = newConversationId();
      return {
        conversations: [{
          id,
          title: deriveTitle(turns),
          turns,
          pinnedDraft: parsed.pinnedDraft ?? null,
          createdAt: typeof parsed.savedAt === "string" ? parsed.savedAt : now,
          updatedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : now,
        }],
        activeId: id,
      };
    }

    if (!Array.isArray(parsed.conversations)) return empty;
    const conversations: StoredConversation[] = [];
    for (const c of parsed.conversations) {
      if (!c || typeof c !== "object") continue;
      if (typeof c.id !== "string" || !Array.isArray(c.turns)) continue;
      const turns = c.turns.filter(isChatTurn).slice(-TURNS_PER_CONVERSATION);
      conversations.push({
        id: c.id,
        title: typeof c.title === "string" ? c.title : deriveTitle(turns),
        turns,
        pinnedDraft: c.pinnedDraft ?? null,
        createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date().toISOString(),
        updatedAt: typeof c.updatedAt === "string" ? c.updatedAt : new Date().toISOString(),
      });
    }
    // Sort newest-first and clamp to the archive cap.
    conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const trimmed = conversations.slice(0, CONVERSATION_LIMIT);
    const activeId = typeof parsed.activeId === "string"
      && trimmed.some((c) => c.id === parsed.activeId)
        ? parsed.activeId
        : trimmed[0]?.id ?? null;
    return { conversations: trimmed, activeId };
  } catch {
    return empty;
  }
}

function persistChatArchive(archive: StoredChatArchive): void {
  try {
    localStorage.setItem(AI_HISTORY_STORAGE_KEY, JSON.stringify(archive));
  } catch {
    // Quota exceeded or storage disabled — non-fatal, the chat keeps
    // working in-memory and we'll retry on the next write.
  }
}

const SUGGESTIONS = [
  "Create a focused dark Notion wrapper with a tray icon and quick-capture shortcut",
  "Wrap YouTube as a distraction-free desktop player with global play/pause",
  "Make a Linear desktop app with deep-link protocol linear:// and notifications",
  "Wrap Google Maps with a custom user agent and a minimal frame",
];

const SLASH_HINTS = [
  { trigger: "/build",   help: "/build <app name> — start a build for an existing app" },
  { trigger: "/theme",   help: "/theme <id> on <app> — switch theme (macos, cyberpunk, …)" },
  { trigger: "/favicon", help: "/favicon <url> — grab a favicon for the current draft" },
  { trigger: "/list",    help: "/list — show your existing apps" },
  { trigger: "/reset",   help: "/reset — clear the conversation" },
];

let turnIdSeq = 0;
const nextId = () => `t${++turnIdSeq}-${Date.now()}`;

export default function AIAssistant() {
  useFeatureGuard("ai-assistant");
  const navigate = useAppStore((s) => s.navigate);
  const route = useAppStore((s) => s.route);
  const settings = useAppStore((s) => s.settings);
  const projects = useAppStore((s) => s.projects);
  const refreshProjects = useAppStore((s) => s.refreshProjects);
  const hasKey = Boolean(settings?.aiApiKey);
  const toast = useToast();

  // Hydrate the chat archive from localStorage on first mount. The ref
  // reads storage once; we then split the archive into the per-render
  // state slices we actually drive the UI from. Storing the whole
  // archive in a single state object would re-render on every keystroke
  // — instead, `conversations` is the canonical list and `activeId`
  // points into it, mirrored back to storage from a single useEffect.
  const initialArchiveRef = useRef<StoredChatArchive | null>(null);
  if (initialArchiveRef.current === null) initialArchiveRef.current = loadStoredChatArchive();

  const [conversations, setConversations] = useState<StoredConversation[]>(
    () => initialArchiveRef.current?.conversations ?? [],
  );
  const [activeId, _setActiveId] = useState<string | null>(
    () => initialArchiveRef.current?.activeId ?? null,
  );
  // Mirror of activeId in a ref so synchronous mutators (ensureActive →
  // setTurns inside the same event handler) can read the just-set value
  // without waiting for React to re-render. Without this, the setTurns
  // wrapper would close over a stale `activeId` and silently drop turns
  // for freshly-created conversations.
  const activeIdRef = useRef<string | null>(initialArchiveRef.current?.activeId ?? null);
  const setActiveId = (next: string | null) => {
    activeIdRef.current = next;
    _setActiveId(next);
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const turns = activeConversation?.turns ?? [];
  const pinnedDraft = activeConversation?.pinnedDraft ?? null;

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length, busy]);

  // Persist the archive whenever its contents change. localStorage writes
  // are synchronous; archive is bounded by CONVERSATION_LIMIT inside the
  // loader so a long-running user never blows past the 5MB quota.
  useEffect(() => {
    persistChatArchive({ conversations, activeId });
  }, [conversations, activeId]);

  /** Mutate the active conversation. Reads activeId from the ref so a
   *  just-set value (from ensureActiveConversation in the same tick) is
   *  visible immediately. Bumps `updatedAt` so the sidebar re-sorts. */
  const updateActive = (patch: (c: StoredConversation) => StoredConversation) => {
    const id = activeIdRef.current;
    if (!id) return;
    setConversations((all) => all.map((c) => (c.id === id ? patch(c) : c)));
  };

  const setTurns = (next: ChatTurn[] | ((prev: ChatTurn[]) => ChatTurn[])) => {
    // Auto-create an active conversation so a fresh user (no archive)
    // can /list, send a prompt, etc. without a separate setup step.
    ensureActiveConversation();
    updateActive((c) => {
      const resolved = typeof next === "function" ? (next as (p: ChatTurn[]) => ChatTurn[])(c.turns) : next;
      return {
        ...c,
        turns: resolved,
        title: c.title === "New chat" || !c.title ? deriveTitle(resolved) : c.title,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const setPinnedDraft = (next: AIProjectDraft | null) => {
    ensureActiveConversation();
    updateActive((c) => ({ ...c, pinnedDraft: next, updatedAt: new Date().toISOString() }));
  };

  /** Lazily materialize an active conversation when the user first types
   *  into a fresh archive (or after clicking "New chat"). Keeps the
   *  archive from filling up with empty placeholder entries. Reads the
   *  active id from the ref so multiple calls in the same event handler
   *  (e.g. setTurns then setPinnedDraft) reuse the freshly-created entry
   *  instead of stacking duplicates. */
  const ensureActiveConversation = (): string => {
    if (activeIdRef.current) return activeIdRef.current;
    const now = new Date().toISOString();
    const fresh: StoredConversation = {
      id: newConversationId(),
      title: "New chat",
      turns: [],
      pinnedDraft: null,
      createdAt: now,
      updatedAt: now,
    };
    setConversations((all) => [fresh, ...all].slice(0, CONVERSATION_LIMIT));
    setActiveId(fresh.id);
    return fresh.id;
  };

  const startNewChat = () => {
    // If the current conversation never received a user turn, reuse it
    // instead of stacking empty entries.
    if (activeConversation && activeConversation.turns.length === 0) return;
    setActiveId(null);
  };

  const switchToConversation = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    track({ name: "feature_used", props: { feature: "ai_chat_history_opened" } });
  };

  const deleteConversation = (id: string) => {
    setConversations((all) => {
      const next = all.filter((c) => c.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  /** Snapshot of state we ship to the model on every chat call. */
  const chatContext = useMemo<AIChatContext>(() => ({
    route: route.name,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      themeId: p.theme?.id,
      hasIcon: Boolean(p.iconPath),
    })),
    currentDraft: pinnedDraft?.draft ?? null,
  }), [route.name, projects, pinnedDraft]);

  /** Convert UI turns to the wire format the backend expects. */
  function toWireMessages(history: ChatTurn[], userText: string): AIChatMessage[] {
    const past: AIChatMessage[] = history
      .filter((t) => t.role === "user" || t.role === "assistant")
      .map((t) => ({ role: t.role as "user" | "assistant", text: t.text }));
    return [...past, { role: "user", text: userText }];
  }

  async function send(prompt: string) {
    const text = prompt.trim();
    if (!text || busy) return;
    setInput("");

    // Slash commands handled locally so we never spend tokens on them.
    if (text.startsWith("/")) {
      const handled = await handleSlashCommand(text);
      if (handled) return;
    }

    // Materialize the conversation lazily — the first real user message
    // is what makes a fresh placeholder worth keeping.
    ensureActiveConversation();

    const userTurn: ChatTurn = { id: nextId(), role: "user", text };
    setTurns((t) => [...t, userTurn]);
    setBusy(true);
    track({ name: "ai_chat_sent", props: { length: text.length } });
    try {
      const wire = toWireMessages(turns, text);
      const response: AIChatResponse = await api.ai.chat(wire, chatContext);
      const assistantTurn: ChatTurn = {
        id: nextId(),
        role: "assistant",
        text: response.message || "(no message)",
        draft: response.draft ?? undefined,
        actions: response.actions ?? [],
      };
      setTurns((t) => [...t, assistantTurn]);
      if (response.draft) setPinnedDraft(response.draft);
    } catch (e) {
      setTurns((t) => [...t, {
        id: nextId(),
        role: "error",
        text: e instanceof Error ? e.message : String(e),
      }]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Slash commands operate on local state with no LLM round-trip. Return
   * true if we handled it; the caller skips the chat call in that case.
   */
  async function handleSlashCommand(text: string): Promise<boolean> {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(" ").trim();

    if (cmd === "/reset") {
      // /reset deletes the current conversation entirely and starts a
      // fresh one (previously it just emptied the in-memory turns, which
      // left a zombie conversation in the archive).
      if (activeId) deleteConversation(activeId);
      else startNewChat();
      toast.success("Conversation cleared");
      return true;
    }

    if (cmd === "/list") {
      const list = projects.length
        ? projects.map((p) => `• ${p.name} — ${p.url}`).join("\n")
        : "You have no apps yet. Try “Create a Notion app”.";
      setTurns((t) => [...t, { id: nextId(), role: "assistant", text: list }]);
      return true;
    }

    if (cmd === "/build") {
      const project = matchProject(arg, projects);
      if (!project) {
        setTurns((t) => [...t, { id: nextId(), role: "error", text: `No app matched "${arg}". Try /list.` }]);
        return true;
      }
      try {
        await api.builds.start(project.id);
        navigate({ name: "build", projectId: project.id });
        toast.success(`Build started for ${project.name}`);
      } catch (e) {
        toast.error("Build failed to start", e instanceof Error ? e.message : String(e));
      }
      return true;
    }

    if (cmd === "/theme") {
      // /theme <id> on <name>
      const m = arg.match(/^(\S+)(?:\s+on\s+(.+))?$/);
      const themeId = m?.[1];
      const projectArg = m?.[2];
      if (!themeId || !PRESETS_BY_ID[themeId]) {
        const available = PRESETS.map((p) => p.id).join(", ");
        setTurns((t) => [...t, { id: nextId(), role: "error", text: `Unknown theme. Available: ${available}` }]);
        return true;
      }
      if (projectArg) {
        const project = matchProject(projectArg, projects);
        if (!project) {
          setTurns((t) => [...t, { id: nextId(), role: "error", text: `No app matched "${projectArg}".` }]);
          return true;
        }
        await api.projects.update(project.id, { theme: PRESETS_BY_ID[themeId] });
        await refreshProjects();
        toast.success(`Applied ${PRESETS_BY_ID[themeId].name} to ${project.name}`);
      } else {
        navigate({ name: "themes" });
      }
      return true;
    }

    if (cmd === "/favicon") {
      const url = arg || pinnedDraft?.draft.url || "";
      if (!url) {
        setTurns((t) => [...t, { id: nextId(), role: "error", text: "Pass a URL or draft a project first." }]);
        return true;
      }
      try {
        const res = await api.dialog.fetchFavicon(url);
        if (!res) {
          setTurns((t) => [...t, { id: nextId(), role: "error", text: `Couldn't find a favicon for ${url}.` }]);
        } else {
          toast.success("Favicon saved", res.path);
        }
      } catch (e) {
        toast.error("Favicon fetch failed", e instanceof Error ? e.message : String(e));
      }
      return true;
    }

    return false;
  }

  /** Run a single AI-suggested action and tag it on the originating turn. */
  async function runAction(turnId: string, idx: number, action: AIAction) {
    setTurns((all) => all.map((t) => t.id === turnId
      ? { ...t, ranActions: { ...(t.ranActions ?? {}), [idx]: "ok" } } : t));
    track({ name: "ai_action_clicked", props: { kind: action.kind } });
    try {
      switch (action.kind) {
        case "apply_draft": {
          const draftToApply = pinnedDraft?.draft;
          if (!draftToApply) throw new Error("No draft to apply");
          navigate({ name: "wizard", draft: draftToApply });
          toast.success("Draft applied — review in the wizard");
          break;
        }
        case "open_route": {
          switch (action.route) {
            case "build":
              if (!action.projectId) throw new Error("build route needs a projectId");
              navigate({ name: "build", projectId: action.projectId });
              break;
            case "studio":
              navigate({ name: "studio", projectId: action.projectId });
              break;
            case "wizard":   navigate({ name: "wizard" });   break;
            case "dashboard": navigate({ name: "dashboard" }); break;
            case "themes":    navigate({ name: "themes" });    break;
            case "actions":   navigate({ name: "actions" });   break;
            case "plugins":   navigate({ name: "plugins" });   break;
            case "ai":        navigate({ name: "ai" });        break;
            case "settings":  navigate({ name: "settings" });  break;
            case "deploy":    navigate({ name: "deploy" });    break;
            case "recipes":   navigate({ name: "recipes" });   break;
          }
          break;
        }
        case "set_theme": {
          const preset = PRESETS_BY_ID[action.themeId];
          if (!preset) throw new Error(`Unknown theme: ${action.themeId}`);
          if (action.projectId) {
            await api.projects.update(action.projectId, { theme: preset });
            await refreshProjects();
            toast.success(`Theme switched to ${preset.name}`);
          } else if (pinnedDraft) {
            setPinnedDraft({
              ...pinnedDraft,
              draft: { ...pinnedDraft.draft, suggestedThemeId: action.themeId },
            });
            toast.success(`Pinned draft will use ${preset.name}`);
          } else {
            throw new Error("No project or draft to apply theme to");
          }
          break;
        }
        case "fetch_favicon": {
          const res = await api.dialog.fetchFavicon(action.url);
          if (!res) throw new Error("No favicon found");
          toast.success("Favicon saved", res.path);
          break;
        }
        case "build": {
          await api.builds.start(action.projectId);
          navigate({ name: "build", projectId: action.projectId });
          toast.success("Build started");
          break;
        }
        case "patch_project": {
          await api.projects.update(action.projectId, action.patch);
          await refreshProjects();
          toast.success("Project updated");
          break;
        }
        case "apply_recipe": {
          const recipe = RECIPES.find((r) => r.id === action.recipeId);
          if (!recipe) throw new Error(`Unknown recipe: ${action.recipeId}`);
          const project = projects.find((p) => p.id === action.projectId);
          if (!project) throw new Error(`Project ${action.projectId} not found`);
          const merged = applyRecipeToFields({
            customCss: project.customCss,
            customJs: project.customJs,
            actions: project.actions,
          }, recipe);
          await api.projects.update(action.projectId, merged);
          await refreshProjects();
          toast.success(`Applied "${recipe.name}" to ${project.name}`);
          break;
        }
      }
    } catch (e) {
      setTurns((all) => all.map((t) => t.id === turnId
        ? { ...t, ranActions: { ...(t.ranActions ?? {}), [idx]: "err" } } : t));
      toast.error("Action failed", e instanceof Error ? e.message : String(e));
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline. ⌘/Ctrl+Enter also sends
    // for muscle-memory from the previous behavior.
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();
    send(input);
  }

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Studio · AI Assistant"
        title={
          <span className="flex items-center gap-3">
            <span>Chat, refine, and ship</span>
            <Badge tone="violet" dot>Powered by Gemini 2.5 Flash · Free</Badge>
          </span>
        }
        description="Conversational. The assistant remembers earlier turns, refines drafts, and can run actions on your projects — apply a theme, grab a favicon, kick off a build, edit window settings."
        actions={
          <div className="flex items-center gap-2">
            {pinnedDraft && (
              <Badge tone="blue">Draft pinned: {pinnedDraft.draft.name || "Untitled"}</Badge>
            )}
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw size={13} />}
              onClick={startNewChat}
              disabled={!activeConversation || activeConversation.turns.length === 0}
            >
              New chat
            </Button>
          </div>
        }
      />

      <div className="px-8 grid gap-5" style={{ gridTemplateColumns: "minmax(0, 1fr) 320px" }}>
        <main className="min-w-0">
          {!hasKey && <ApiKeyOnboarding onGoToSettings={() => navigate({ name: "settings" })} />}

          <GlassCard className="overflow-hidden">
            <div ref={scrollRef} className="h-[480px] overflow-y-auto p-5 space-y-4">
              {turns.length === 0 ? (
                <EmptyChat onSuggest={(s) => send(s)} disabled={!hasKey} />
              ) : (
                turns.map((turn) => (
                  <Turn
                    key={turn.id}
                    turn={turn}
                    pinnedDraft={pinnedDraft}
                    projects={projects}
                    onRunAction={(idx, action) => runAction(turn.id, idx, action)}
                  />
                ))
              )}
              {busy && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 size={14} className="animate-spin text-accent-violet" />
                  Thinking…
                </motion.div>
              )}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder={hasKey ? "Ask, refine, or use /build, /theme, /favicon, /list, /reset…" : "Add a free Gemini API key in Settings to get started."}
                  rows={2}
                  disabled={!hasKey || busy}
                  className="input flex-1 resize-none font-sans text-sm leading-relaxed"
                />
                <Button
                  variant="primary"
                  size="lg"
                  leftIcon={busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  disabled={!hasKey || busy || !input.trim()}
                  onClick={() => send(input)}
                >
                  Send
                </Button>
              </div>
              <div className="mt-2 px-1 text-2xs text-text-muted flex items-center gap-2">
                <Kbd>Enter</Kbd>
                <span>to send</span>
                <span className="text-text-muted/70">·</span>
                <Kbd>Shift</Kbd><Kbd>Enter</Kbd>
                <span>for newline</span>
                <span className="ml-auto">Multi-turn · structured actions · project-aware</span>
              </div>
            </div>
          </GlassCard>
        </main>

        <aside className="space-y-4">
          {conversations.length > 0 && (
            <GlassCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold">
                  Recent chats
                </div>
                <span className="text-2xs text-text-muted">{conversations.length}</span>
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1 -mr-1">
                {conversations.map((c) => (
                  <RecentChatItem
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onOpen={() => switchToConversation(c.id)}
                    onDelete={() => deleteConversation(c.id)}
                  />
                ))}
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-4">
            <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold mb-3">Try a prompt</div>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={!hasKey || busy}
                  className="w-full text-left text-xs px-3 py-2 rounded-md bg-white/[0.03] border border-border hover:bg-white/[0.06] hover:border-border-strong transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {s}
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold mb-3">Slash commands</div>
            <ul className="space-y-1.5 text-xs text-text-secondary leading-relaxed">
              {SLASH_HINTS.map((h) => (
                <li key={h.trigger} className="flex items-start gap-2">
                  <code className="font-mono text-accent-blue text-[11px] shrink-0">{h.trigger}</code>
                  <span>{h.help.split(" — ")[1]}</span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-2xs uppercase tracking-wider text-text-secondary font-semibold mb-3">What I can do</div>
            <ul className="space-y-2 text-xs text-text-secondary leading-relaxed">
              <Capability>Generate a project blueprint from a sentence</Capability>
              <Capability>Refine drafts iteratively across turns</Capability>
              <Capability>Edit your existing apps (window, security, actions)</Capability>
              <Capability>Switch themes by name (macos, cyberpunk, gaming, …)</Capability>
              <Capability>Grab favicons from URLs as the app icon</Capability>
              <Capability>Start builds and navigate you around the studio</Capability>
            </ul>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}

/* ---------- Turn rendering ---------- */

function Turn({
  turn, pinnedDraft, projects, onRunAction,
}: {
  turn: ChatTurn;
  pinnedDraft: AIProjectDraft | null;
  projects: AppProject[];
  onRunAction: (idx: number, action: AIAction) => void;
}) {
  if (turn.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-accent-blue/15 border border-accent-blue/30 text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
          {turn.text}
        </div>
      </motion.div>
    );
  }
  if (turn.role === "error") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-2.5 p-3 rounded-lg bg-accent-red/10 border border-accent-red/30 text-accent-red text-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <span className="whitespace-pre-wrap">{turn.text}</span>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-violet to-accent-blue text-white flex items-center justify-center shrink-0 mt-0.5 shadow-glow-violet">
        <Sparkles size={13} />
      </div>
      <div className="flex-1 min-w-0 space-y-2.5">
        <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{turn.text}</div>

        {turn.draft && <DraftCard draft={turn.draft} pinned={pinnedDraft?.draft.name === turn.draft.draft.name} />}

        {turn.actions && turn.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {turn.actions.map((a, i) => (
              <ActionChip
                key={i}
                action={a}
                projects={projects}
                disabled={turn.ranActions?.[i] === "ok"}
                state={turn.ranActions?.[i]}
                onClick={() => onRunAction(i, a)}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ActionChip({
  action, projects, disabled, state, onClick,
}: {
  action: AIAction;
  projects: AppProject[];
  disabled?: boolean;
  state?: "ok" | "err";
  onClick: () => void;
}) {
  const icon = actionIcon(action);
  const target = "projectId" in action && action.projectId
    ? projects.find((p) => p.id === action.projectId)?.name
    : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-8 px-3 rounded-md text-xs inline-flex items-center gap-1.5 border transition",
        state === "ok" && "bg-accent-green/10 border-accent-green/40 text-accent-green",
        state === "err" && "bg-accent-red/10 border-accent-red/40 text-accent-red",
        !state && "bg-bg-card border-border hover:border-accent-blue/50 hover:bg-accent-blue/10 text-text-primary",
        "disabled:opacity-60 disabled:cursor-default",
      )}
      title={target ? `${action.label} (${target})` : action.label}
    >
      {state === "ok" ? <Check size={12} /> : state === "err" ? <AlertCircle size={12} /> : icon}
      <span className="font-medium">{action.label}</span>
      {target && state !== "ok" && state !== "err" && (
        <span className="text-text-muted">· {target}</span>
      )}
    </button>
  );
}

function actionIcon(action: AIAction) {
  switch (action.kind) {
    case "apply_draft":   return <Wand2 size={12} />;
    case "open_route":    return <MapPin size={12} />;
    case "set_theme":     return <Palette size={12} />;
    case "fetch_favicon": return <Globe size={12} />;
    case "build":         return <Hammer size={12} />;
    case "patch_project": return <Pencil size={12} />;
    case "apply_recipe":  return <BookOpen size={12} />;
    default:              return <Zap size={12} />;
  }
}

/* ---------- Draft card ---------- */

function DraftCard({ draft, pinned }: { draft: AIProjectDraft; pinned?: boolean }) {
  const d = draft.draft;
  const themeName = d.suggestedThemeId ? PRESETS_BY_ID[d.suggestedThemeId]?.name ?? d.suggestedThemeId : null;
  return (
    <div className="rounded-xl border border-border bg-bg-card/60 overflow-hidden">
      <div className="p-3.5 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate flex items-center gap-2">
            {d.name || "Untitled app"}
            {pinned && <Badge tone="blue">Pinned</Badge>}
          </div>
          <div className="text-xs text-text-secondary truncate">{d.url || "(no URL)"}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {themeName && <Badge tone="violet">{themeName}</Badge>}
          {d.actions?.tray && <Badge tone="blue">Tray</Badge>}
          {d.actions?.deepLinkProtocol && <Badge tone="green">{d.actions.deepLinkProtocol}://</Badge>}
          {d.actions?.startupLaunch && <Badge tone="amber">Startup</Badge>}
        </div>
      </div>
      <div className="p-3.5 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-text-secondary">
        <DraftRow label="Window" value={`${d.window?.width ?? 1280}×${d.window?.height ?? 800}`} />
        <DraftRow label="Isolation" value={d.security?.contextIsolation === false ? "off" : "on"} />
        <DraftRow label="Notifications" value={d.actions?.notifications === false ? "off" : "on"} />
        <DraftRow label="Shortcuts" value={d.actions?.globalShortcuts?.length ? `${d.actions.globalShortcuts.length}` : "none"} />
      </div>
      {draft.rationale && (
        <div className="px-3.5 pb-3.5 text-xs text-text-muted italic leading-relaxed">{draft.rationale}</div>
      )}
    </div>
  );
}

function DraftRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary font-mono truncate">{value}</span>
    </div>
  );
}

/* ---------- Misc ---------- */

function RecentChatItem({
  conversation, active, onOpen, onDelete,
}: {
  conversation: StoredConversation;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  // Delete confirmation lives in component state so a stray click can't
  // wipe a long conversation without a second deliberate press.
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const handle = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(handle);
  }, [confirming]);

  const turnsCount = conversation.turns.length;
  return (
    <div
      className={cn(
        "group flex items-start gap-2 px-2.5 py-2 rounded-md border transition cursor-pointer",
        active
          ? "bg-accent-violet/10 border-accent-violet/40"
          : "bg-transparent border-transparent hover:bg-white/[0.04] hover:border-border",
      )}
      onClick={onOpen}
    >
      <MessageSquare
        size={12}
        className={cn("mt-1 shrink-0", active ? "text-accent-violet" : "text-text-muted")}
      />
      <div className="flex-1 min-w-0">
        <div className={cn("text-xs font-medium truncate", active ? "text-text-primary" : "text-text-primary/90")}>
          {conversation.title}
        </div>
        <div className="text-2xs text-text-muted mt-0.5">
          {turnsCount} {turnsCount === 1 ? "message" : "messages"} · {formatRelativeTime(conversation.updatedAt)}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirming) onDelete();
          else setConfirming(true);
        }}
        className={cn(
          "shrink-0 h-6 w-6 rounded inline-flex items-center justify-center transition",
          confirming
            ? "bg-accent-red/15 text-accent-red"
            : "text-text-muted opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] hover:text-text-primary",
        )}
        title={confirming ? "Click again to confirm" : "Delete conversation"}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

/** Compact "N minutes ago" / "yesterday" formatter for the recent-chats
 *  sidebar. Falls back to the absolute date for older entries. */
function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

function Capability({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check size={12} className="text-accent-green mt-1 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function EmptyChat({ onSuggest, disabled }: { onSuggest: (s: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-violet to-accent-blue text-white flex items-center justify-center shadow-glow-violet mb-4">
        <Bot size={24} />
      </div>
      <div className="text-base font-semibold">Describe an app, refine it, ship it</div>
      <p className="text-xs text-text-secondary mt-1.5 max-w-md leading-relaxed">
        Multi-turn conversation. Pin a draft, then ask “make it dark”, “grab the favicon from this URL”,
        or “build my Notion app”. The assistant will surface clickable actions you can run.
      </p>
      <div className="flex flex-wrap gap-1.5 mt-5 max-w-lg justify-center">
        {SUGGESTIONS.slice(0, 2).map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            disabled={disabled}
            className="text-xs px-3 py-1.5 rounded-full bg-white/[0.04] border border-border hover:bg-white/[0.08] hover:border-border-strong transition disabled:opacity-50"
          >
            {s.length > 60 ? s.slice(0, 60) + "…" : s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ApiKeyOnboarding({ onGoToSettings }: { onGoToSettings: () => void }) {
  return (
    <GlassCard tone="violet" className="p-5 mb-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-accent-violet/15 border border-accent-violet/30 text-accent-violet flex items-center justify-center shrink-0">
          <KeyRound size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Add your free Gemini API key</div>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            The AI Assistant calls Google Gemini directly from your machine — free tier, no credit card. Your key never leaves this app; it's stored in your local user-data folder.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button variant="primary" size="sm" leftIcon={<KeyRound size={13} />} onClick={onGoToSettings}>
              Open Settings
            </Button>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
               className={cn("h-8 inline-flex items-center gap-1 px-3 rounded-md text-xs text-accent-blue hover:bg-accent-blue/10 transition")}>
              Get a free key <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

/* ---------- Helpers ---------- */

/** Best-effort fuzzy match: exact, case-insensitive, then substring. */
function matchProject(query: string, projects: AppProject[]): AppProject | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return (
    projects.find((p) => p.name.toLowerCase() === q) ??
    projects.find((p) => p.name.toLowerCase().startsWith(q)) ??
    projects.find((p) => p.name.toLowerCase().includes(q)) ??
    projects.find((p) => p.id === q)
  );
}

