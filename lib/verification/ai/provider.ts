// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Provider selection. This is the one place that knows which concrete
// VisionVerifier to use — everything else in the pipeline depends only on
// the VisionVerifier interface. Adding Gemini later means adding
// lib/verification/ai/gemini.ts and extending the selection below (e.g.
// prefer OPENAI_API_KEY, fall back to GEMINI_API_KEY).

import { DEFAULT_OPENAI_VISION_MODEL, OpenAiVisionVerifier } from "./openai";
import { VisionProviderError } from "./types";
import type { VisionVerifier } from "./types";

let cached: VisionVerifier | null = null;

export function getVisionVerifier(): VisionVerifier {
  if (cached) return cached;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new VisionProviderError(
      "No vision provider is configured. Set OPENAI_API_KEY to enable AI verification.",
      "auth",
    );
  }

  const model = process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_OPENAI_VISION_MODEL;
  cached = new OpenAiVisionVerifier(apiKey, model);
  return cached;
}
