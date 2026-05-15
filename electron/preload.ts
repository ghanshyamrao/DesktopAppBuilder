import { contextBridge, ipcRenderer } from "electron";
import type {
  AppProject,
  AIProjectDraft,
  AIChatMessage,
  AIChatContext,
  AIChatResponse,
  BuildLogEvent,
  BuildProgressEvent,
  GlobalSettings,
  IpcResult,
} from "./types";

const api = {
  projects: {
    list: (): Promise<IpcResult<AppProject[]>> => ipcRenderer.invoke("projects:list"),
    get: (id: string): Promise<IpcResult<AppProject>> => ipcRenderer.invoke("projects:get", id),
    create: (project: Omit<AppProject, "id" | "createdAt" | "updatedAt">): Promise<IpcResult<AppProject>> =>
      ipcRenderer.invoke("projects:create", project),
    update: (id: string, patch: Partial<AppProject>): Promise<IpcResult<AppProject>> =>
      ipcRenderer.invoke("projects:update", id, patch),
    delete: (id: string): Promise<IpcResult<void>> => ipcRenderer.invoke("projects:delete", id),
    clone: (id: string): Promise<IpcResult<{ project: AppProject }>> =>
      ipcRenderer.invoke("projects:clone", id),
    getIconDataUrl: (id: string): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke("projects:getIconDataUrl", id),
    export: (id: string): Promise<IpcResult<{ cancelled: boolean; filePath?: string }>> =>
      ipcRenderer.invoke("projects:export", id),
    exportSource: (id: string): Promise<IpcResult<{ cancelled: boolean; destDir?: string }>> =>
      ipcRenderer.invoke("projects:exportSource", id),
    import: (filePath?: string): Promise<IpcResult<{ cancelled: boolean; project?: AppProject }>> =>
      ipcRenderer.invoke("projects:import", filePath),
  },
  builds: {
    start: (projectId: string): Promise<IpcResult<{ buildId: string }>> =>
      ipcRenderer.invoke("builds:start", projectId),
    cancel: (buildId: string): Promise<IpcResult<void>> => ipcRenderer.invoke("builds:cancel", buildId),
    revealOutput: (projectId: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke("builds:revealOutput", projectId),
    getLogs: (projectId: string): Promise<IpcResult<BuildLogEvent[]>> =>
      ipcRenderer.invoke("builds:getLogs", projectId),
    export: (
      projectId: string,
      destDir?: string,
    ): Promise<IpcResult<{ cancelled: boolean; destDir?: string; files?: string[] }>> =>
      ipcRenderer.invoke("builds:export", projectId, destDir),
  },
  settings: {
    get: (): Promise<IpcResult<GlobalSettings>> => ipcRenderer.invoke("settings:get"),
    update: (patch: Partial<GlobalSettings>): Promise<IpcResult<GlobalSettings>> =>
      ipcRenderer.invoke("settings:update", patch),
  },
  dialog: {
    pickIcon: (): Promise<IpcResult<{ path: string; dataUrl: string } | null>> =>
      ipcRenderer.invoke("dialog:pickIcon"),
    fetchFavicon: (url: string): Promise<IpcResult<{ path: string; dataUrl: string } | null>> =>
      ipcRenderer.invoke("dialog:fetchFavicon", url),
    saveIconDataUrl: (dataUrl: string, hint: string): Promise<IpcResult<{ path: string; dataUrl: string }>> =>
      ipcRenderer.invoke("dialog:saveIconDataUrl", dataUrl, hint),
    pickOutputDir: (): Promise<IpcResult<string | null>> => ipcRenderer.invoke("dialog:pickOutputDir"),
    pickPfx: (): Promise<IpcResult<{ path: string } | null>> => ipcRenderer.invoke("dialog:pickPfx"),
  },
  publish: {
    github: (projectId: string): Promise<IpcResult<{ url: string; htmlUrl: string; tag: string; uploaded: string[] }>> =>
      ipcRenderer.invoke("publish:github", projectId),
  },
  system: {
    openSettings: (key: "developers"): Promise<IpcResult<void>> =>
      ipcRenderer.invoke("system:openSettings", key),
    checkSymlinkPrivilege: (): Promise<
      IpcResult<{
        canCreateSymlinks: boolean;
        developerMode: boolean;
        elevated: boolean;
        notApplicable: boolean;
        detail: string;
      }>
    > => ipcRenderer.invoke("system:checkSymlinkPrivilege"),
    openNetworkSettings: (): Promise<IpcResult<void>> =>
      ipcRenderer.invoke("system:openNetworkSettings"),
  },
  auth: {
    status: (): Promise<
      IpcResult<{
        configured: boolean;
        user: { sub: string; email: string; name?: string; picture?: string; emailVerified?: boolean } | null;
      }>
    > => ipcRenderer.invoke("auth:status"),
    signIn: (): Promise<
      IpcResult<{ sub: string; email: string; name?: string; picture?: string; emailVerified?: boolean }>
    > => ipcRenderer.invoke("auth:signIn"),
    signOut: (): Promise<IpcResult<void>> => ipcRenderer.invoke("auth:signOut"),
  },
  billing: {
    listPlans: (): Promise<
      IpcResult<Array<{
        tier: "free" | "1mo" | "3mo" | "6mo" | "12mo" | "lifetime";
        key: string;
        label: string;
        amountCents: number;
        currency: string;
        durationDays: number | null;
        rank: number;
        priceEnv: string;
        priceId?: string;
      }>>
    > => ipcRenderer.invoke("billing:listPlans"),
    status: (): Promise<
      IpcResult<{
        tier: "free" | "1mo" | "3mo" | "6mo" | "12mo" | "lifetime";
        active: boolean;
        configured: boolean;
        planLabel?: string;
        expiresAt?: string;
        purchasedAt?: string;
        paddleCustomerId?: string;
        paddleTransactionId?: string;
        paddleSubscriptionId?: string;
        paddleMode?: "sandbox" | "production";
        trialStartedAt?: string;
      }>
    > => ipcRenderer.invoke("billing:status"),
    setMode: (mode: "sandbox" | "production"): Promise<IpcResult<{ mode: "sandbox" | "production" }>> =>
      ipcRenderer.invoke("billing:setMode", mode),
    openCheckout: (planKey: string): Promise<IpcResult<{ url: string; sessionId: string; mode: "sandbox" | "production" }>> =>
      ipcRenderer.invoke("billing:openCheckout", planKey),
    recordBuild: (): Promise<IpcResult<{
      allowed: boolean;
      reason: "ok" | "no-subscription" | "daily-limit-exceeded" | "trial-exhausted";
      used: number;
      limit: number | null;
      remaining: number | null;
    }>> => ipcRenderer.invoke("billing:recordBuild"),
    applySession: (sessionId: string): Promise<
      IpcResult<{
        tier: "free" | "1mo" | "3mo" | "6mo" | "12mo" | "lifetime";
        active: boolean;
        planLabel?: string;
        expiresAt?: string;
        purchasedAt?: string;
      }>
    > => ipcRenderer.invoke("billing:applySession", sessionId),
    refresh: (): Promise<
      IpcResult<{
        tier: "free" | "1mo" | "3mo" | "6mo" | "12mo" | "lifetime";
        active: boolean;
        planLabel?: string;
        expiresAt?: string;
        purchasedAt?: string;
      }>
    > => ipcRenderer.invoke("billing:refresh"),
    onState: (cb: (state: {
      tier: "free" | "1mo" | "3mo" | "6mo" | "12mo" | "lifetime";
      active: boolean;
      planLabel?: string;
      expiresAt?: string;
      purchasedAt?: string;
    }) => void) => {
      const handler = (_e: unknown, payload: Parameters<typeof cb>[0]) => cb(payload);
      ipcRenderer.on("billing:state", handler);
      return () => ipcRenderer.off("billing:state", handler);
    },
    onApplyFailed: (cb: (info: { reason: string }) => void) => {
      const handler = (_e: unknown, payload: { reason: string }) => cb(payload);
      ipcRenderer.on("billing:applyFailed", handler);
      return () => ipcRenderer.off("billing:applyFailed", handler);
    },
    onCancelled: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("billing:cancelled", handler);
      return () => ipcRenderer.off("billing:cancelled", handler);
    },
  },
  firstRun: {
    status: (): Promise<IpcResult<{ showWelcome: boolean; installedAt: string }>> =>
      ipcRenderer.invoke("firstRun:status"),
    acknowledge: (): Promise<IpcResult<void>> => ipcRenderer.invoke("firstRun:acknowledge"),
  },
  ai: {
    hasApiKey: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke("ai:hasApiKey"),
    generateProject: (prompt: string): Promise<IpcResult<AIProjectDraft>> =>
      ipcRenderer.invoke("ai:generateProject", prompt),
    chat: (
      messages: AIChatMessage[],
      context: AIChatContext,
    ): Promise<IpcResult<AIChatResponse>> =>
      ipcRenderer.invoke("ai:chat", messages, context),
  },
  window: {
    minimize: (): Promise<IpcResult<void>> => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: (): Promise<IpcResult<{ maximized: boolean }>> =>
      ipcRenderer.invoke("window:toggleMaximize"),
    close: (): Promise<IpcResult<void>> => ipcRenderer.invoke("window:close"),
    isMaximized: (): Promise<IpcResult<{ maximized: boolean }>> =>
      ipcRenderer.invoke("window:isMaximized"),
    reload: (): Promise<IpcResult<void>> => ipcRenderer.invoke("window:reload"),
    toggleDevTools: (): Promise<IpcResult<void>> => ipcRenderer.invoke("window:toggleDevTools"),
    setTitleBarOverlay: (color: string, symbolColor: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke("window:setTitleBarOverlay", color, symbolColor),
    onStateChange: (cb: (state: { maximized: boolean }) => void) => {
      const handler = (_e: unknown, payload: { maximized: boolean }) => cb(payload);
      ipcRenderer.on("window:state", handler);
      return () => ipcRenderer.off("window:state", handler);
    },
  },
  events: {
    onBuildLog: (cb: (event: BuildLogEvent) => void) => {
      const handler = (_e: unknown, payload: BuildLogEvent) => cb(payload);
      ipcRenderer.on("build:log", handler);
      return () => ipcRenderer.off("build:log", handler);
    },
    onBuildProgress: (cb: (event: BuildProgressEvent) => void) => {
      const handler = (_e: unknown, payload: BuildProgressEvent) => cb(payload);
      ipcRenderer.on("build:progress", handler);
      return () => ipcRenderer.off("build:progress", handler);
    },
  },
};

contextBridge.exposeInMainWorld("w2a", api);

export type W2AApi = typeof api;
