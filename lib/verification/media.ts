// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Pure media validation helpers for the M1 upload pipeline. No HTTP or DB
// concerns here — the route handler wires these into responses.
//
// Note on signature checking: this does lightweight "magic byte" sniffing
// only (a handful of leading bytes per format). It is enough to catch a
// mislabeled/renamed file (e.g. a .exe served with Content-Type: image/png)
// but it does not fully parse the container, so it cannot catch a
// malformed-but-signature-valid file or a payload smuggled inside an
// otherwise-valid container. Full validation would need a real media
// parsing library, which is intentionally out of scope for M1 to avoid a
// heavy new dependency — flagged as a candidate for a later milestone.

import { createHash } from "node:crypto";

export type MediaKind = "image" | "video";

export interface MediaTypeConfig {
  kind: MediaKind;
  extension: string;
  maxSizeBytes: number;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const MEDIA_TYPE_CONFIG: Readonly<Record<string, MediaTypeConfig>> = {
  "image/jpeg": { kind: "image", extension: "jpg", maxSizeBytes: MAX_IMAGE_BYTES },
  "image/png": { kind: "image", extension: "png", maxSizeBytes: MAX_IMAGE_BYTES },
  "image/webp": { kind: "image", extension: "webp", maxSizeBytes: MAX_IMAGE_BYTES },
  "video/mp4": { kind: "video", extension: "mp4", maxSizeBytes: MAX_VIDEO_BYTES },
  "video/webm": { kind: "video", extension: "webm", maxSizeBytes: MAX_VIDEO_BYTES },
};

export const SUPPORTED_MEDIA_TYPES = Object.keys(MEDIA_TYPE_CONFIG);

export function getMediaTypeConfig(mimeType: string): MediaTypeConfig | undefined {
  return MEDIA_TYPE_CONFIG[mimeType];
}

export function computeSha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesStartWith(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Lightweight signature check: does the file's leading bytes look
 * consistent with the declared MIME type? See module doc for limitations.
 */
export function looksLikeDeclaredType(bytes: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return bytesStartWith(bytes, 0, [0xff, 0xd8, 0xff]);
    case "image/png":
      return bytesStartWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP");
    case "video/mp4":
      // The `ftyp` box sits at a fixed offset for every valid MP4 variant
      // (isom, mp42, M4V , etc.), so this generic check is reliable without
      // parsing the full box structure.
      return asciiAt(bytes, 4, "ftyp");
    case "video/webm":
      // WebM/Matroska EBML header.
      return bytesStartWith(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]);
    default:
      return false;
  }
}
