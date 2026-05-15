# PostHog Integration Setup

## Overview

PostHog is integrated at two layers:

| Layer | Package | Where |
|-------|---------|-------|
| Renderer (React/Vite) | `posthog-js` | `src/main.tsx` |
| Main process (Electron) | `posthog-node` | `electron/services/aiService.ts` |

---

## 1. Base Integration (`posthog-js`)

**File:** `src/main.tsx`

PostHog is initialized before React mounts, capturing pageviews and sessions automatically.

```ts
import posthog from "posthog-js";

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  person_profiles: "identified_only",
});
```

**Environment variables (`.env`):**

```
VITE_PUBLIC_POSTHOG_KEY=phc_...
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

---

## 2. LLM Analytics (`posthog-node`)

**File:** `electron/services/aiService.ts`

The app uses Google Gemini 2.5 Flash via direct REST API calls. PostHog captures `$ai_generation` events after each call using the `posthog-node` SDK in the Electron main process.

**Events captured:**

| Method | `$ai_span_name` | Description |
|--------|----------------|-------------|
| `AIService.chat()` | `ai_chat` | Multi-turn AI assistant conversation |
| `AIService.generateProject()` | `generate_project` | Single-shot project generation from prompt |

**Properties captured per event:**

- `$ai_model` — `gemini-2.5-flash`
- `$ai_provider` — `google`
- `$ai_input_tokens` — from `usageMetadata.promptTokenCount`
- `$ai_output_tokens` — from `usageMetadata.candidatesTokenCount`
- `$ai_latency` — wall-clock seconds for the API call
- `$ai_http_status` — HTTP status code
- `$ai_temperature` / `$ai_max_tokens` — generation config
- `$ai_is_error` / `$ai_error` — set on API failures

**dotenv loading** added to `electron/main.ts` so the main process can read `POSTHOG_API_KEY` and `POSTHOG_HOST` from `.env`.

**Environment variables (`.env`):**

```
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://us.i.posthog.com
```

**Verify:** After making an AI assistant request, check **LLM Analytics → Generations** in your PostHog project.

---

## PostHog Project

- **Project ID:** 418174
- **Host:** https://us.i.posthog.com
