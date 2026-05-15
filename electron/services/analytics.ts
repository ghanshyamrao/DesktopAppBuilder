import { PostHog } from "posthog-node";

/**
 * Shared posthog-node client for the main process. Used by:
 *   - `aiService` for `$ai_generation` LLM analytics events.
 *   - `buildOrchestrator` for server-side build lifecycle events.
 *   - `authService` for sign-in/out events that beat the renderer to it.
 *
 * Returns `null` when no key is configured so callers no-op cleanly.
 */
const apiKey = process.env.POSTHOG_API_KEY;

export const phClient: PostHog | null = apiKey
  ? new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1, // flush each event immediately — desktop sessions can be short
      flushInterval: 5_000,
    })
  : null;

/**
 * Track a main-process event. `distinctId` should be the user's auth `sub`
 * when known, otherwise the literal "desktop" so anonymous events still
 * land in a single bucket rather than scattering across UUIDs.
 */
export function trackMain(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!phClient) return;
  try {
    phClient.capture({ distinctId: distinctId || "desktop", event, properties });
  } catch {
    // never crash the main process for analytics
  }
}

/** Identify the signed-in user on the main side so groups match. */
export function identifyMain(distinctId: string, properties: Record<string, unknown>): void {
  if (!phClient) return;
  try {
    phClient.identify({ distinctId, properties });
  } catch {
    // ignore
  }
}

/** Flush in-flight events on process exit so we don't lose the tail. */
process.on("exit", () => {
  phClient?.shutdown();
});
