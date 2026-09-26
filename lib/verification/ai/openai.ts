// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// OpenAI implementation of VisionVerifier. Uses Structured Outputs
// (response_format: json_schema, strict: true) so the API itself enforces
// the shape — but the result is still re-validated with zod in
// lib/verification/ai/schema.ts before anything trusts it, since "the
// provider claims strict mode" is not the same guarantee as "we checked."

import OpenAI, {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  RateLimitError,
} from "openai";
import { validateVisionResult } from "./schema";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { VisionProviderError } from "./types";
import type {
  VisionCallMetadata,
  VisionVerificationInput,
  VisionVerifier,
} from "./types";

export const DEFAULT_OPENAI_VISION_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 45_000;

const RESULT_JSON_SCHEMA = {
  name: "vision_verification_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      valid: { type: "boolean" },
      overallConfidence: { type: "number" },
      criteria: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            criterionId: { type: "string" },
            passed: { type: "boolean" },
            confidence: { type: "number" },
            evidence: { type: "string" },
          },
          required: ["criterionId", "passed", "confidence", "evidence"],
        },
      },
      mediaQuality: {
        type: "object",
        additionalProperties: false,
        properties: {
          usable: { type: "boolean" },
          confidence: { type: "number" },
          issues: { type: "array", items: { type: "string" } },
        },
        required: ["usable", "confidence", "issues"],
      },
      reason: { type: "string" },
    },
    required: ["valid", "overallConfidence", "criteria", "mediaQuality", "reason"],
  },
} as const;

function mapOpenAiError(error: unknown): VisionProviderError {
  if (error instanceof AuthenticationError) {
    return new VisionProviderError("OpenAI authentication failed.", "auth", error);
  }
  if (error instanceof RateLimitError) {
    return new VisionProviderError("OpenAI rate limit exceeded.", "rate_limit", error);
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new VisionProviderError("OpenAI request timed out.", "timeout", error);
  }
  if (error instanceof APIError) {
    const status = error.status ?? 0;
    if (status >= 500) {
      return new VisionProviderError("OpenAI upstream error.", "transient", error);
    }
    return new VisionProviderError(`OpenAI request failed (${status}).`, "unknown", error);
  }
  return new VisionProviderError("OpenAI request failed.", "unknown", error);
}

export class OpenAiVisionVerifier implements VisionVerifier {
  readonly provider = "openai";
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string = DEFAULT_OPENAI_VISION_MODEL) {
    this.client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS });
    this.model = model;
  }

  async verify(input: VisionVerificationInput) {
    const start = Date.now();

    const imageContent = input.frames.map((frame) => ({
      type: "image_url" as const,
      image_url: { url: `data:${frame.mimeType};base64,${frame.base64}` },
    }));

    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          {
            role: "user",
            content: [{ type: "text", text: buildUserPrompt(input) }, ...imageContent],
          },
        ],
        response_format: { type: "json_schema", json_schema: RESULT_JSON_SCHEMA },
      });
    } catch (error) {
      throw mapOpenAiError(error);
    }

    const durationMs = Date.now() - start;
    const rawText = response.choices[0]?.message?.content;
    if (!rawText) {
      throw new VisionProviderError("Empty response from model.", "invalid_response");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (error) {
      throw new VisionProviderError("Model did not return valid JSON.", "invalid_response", error);
    }

    const expectedIds = input.criteria.map((c) => c.id);
    const result = validateVisionResult(parsedJson, expectedIds);

    const metadata: VisionCallMetadata = {
      provider: this.provider,
      model: this.model,
      durationMs,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    };

    return { result, metadata };
  }
}
